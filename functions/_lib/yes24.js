/* Cloudflare Pages server adapter. Public HTML is fetched only from YES24.
 * Selectors verified against public search/detail pages on 2026-10-27.
 * No credentials, client-provided URLs, browser impersonation, or guessed pages.
 */
const HOST = 'www.yes24.com';
const ORIGIN = `https://${HOST}`;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const VALID_ID = /^[1-9]\d{0,15}$/;
const ENTITIES = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',middot:'·',hellip:'…',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”'};

export class BookSourceError extends Error {
  constructor(code, message) { super(message); this.name = 'BookSourceError'; this.code = code; }
}

function clean(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? match;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : parseInt(entity.slice(1),10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : match;
  }).replace(/\s+/g,' ').trim();
}

function goodsId(value) {
  try {
    const url = new URL(value, ORIGIN);
    if (url.protocol !== 'https:' || url.hostname !== HOST || url.port || url.username || url.password) return null;
    const id = url.pathname.match(/^\/(?:Product\/Goods|24\/goods)\/([1-9]\d{0,15})\/?$/i)?.[1];
    return id || null;
  } catch { return null; }
}

function sourceURL(id) { return `${ORIGIN}/Product/Goods/${id}`; }

function validateURL(value, expectedId) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== HOST || url.port || url.username || url.password) {
    throw new BookSourceError('UNAVAILABLE', 'The book source redirected outside its permitted host.');
  }
  const validPath = expectedId ? goodsId(url.href) === expectedId : /^\/Product\/Search\/?$/i.test(url.pathname);
  if (!validPath) throw new BookSourceError('UNAVAILABLE', 'The book source redirected to an unsupported page.');
  return url;
}

async function readLimited(response, controller) {
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > MAX_BYTES) {
    controller.abort(); throw new BookSourceError('BAD_RESPONSE', 'The book source response is too large.');
  }
  if (!response.body) throw new BookSourceError('BAD_RESPONSE', 'The book source returned an empty response.');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { controller.abort(); try { await reader.cancel(); } catch {} throw new BookSourceError('BAD_RESPONSE','The book source response is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  const declared = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const header = new TextDecoder().decode(bytes.subarray(0,4096));
  const charset = declared || header.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); }
  catch { throw new BookSourceError('BAD_RESPONSE','The book source text encoding is unsupported.'); }
}

async function fetchHTML(url, expectedId, {fetchImpl = globalThis.fetch, signal} = {}) {
  if (typeof fetchImpl !== 'function') throw new BookSourceError('UNAVAILABLE','The book source is unavailable.');
  const controller = new AbortController(); let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(() => { timedOut = true; controller.abort(); },TIMEOUT_MS);
  try {
    let current = validateURL(url,expectedId);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetchImpl(current.href, {
        method:'GET', redirect:'manual', signal:controller.signal,
        headers:{'Accept':'text/html,application/xhtml+xml','Accept-Language':'ko-KR,ko;q=0.9','User-Agent':'DadokBookSearch/1.0'}
      });
      if (response.url) validateURL(response.url,expectedId);
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects === 3) throw new BookSourceError('UNAVAILABLE','The book source redirect could not be followed.');
        current = validateURL(new URL(location,current).href,expectedId); continue;
      }
      if (response.status === 404) throw new BookSourceError('NOT_FOUND','This book edition is unavailable.');
      if (response.status === 429) throw new BookSourceError('RATE_LIMIT','The book source is temporarily rate limited.');
      if (!response.ok) throw new BookSourceError('UNAVAILABLE','The book source could not be reached.');
      if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) {
        throw new BookSourceError('BAD_RESPONSE','The book source returned an unexpected content type.');
      }
      return await readLimited(response,controller);
    }
    throw new BookSourceError('UNAVAILABLE','The book source redirect could not be followed.');
  } catch (error) {
    if (error instanceof BookSourceError) throw error;
    if (signal?.aborted) throw error;
    throw new BookSourceError('UNAVAILABLE',timedOut ? 'The book source request timed out.' : 'The book source could not be reached.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
}

async function consume(rewriter, html) {
  try { await rewriter.transform(new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}})).arrayBuffer(); }
  catch (error) { if (error instanceof BookSourceError) throw error; throw new BookSourceError('BAD_RESPONSE','The book source markup could not be read.'); }
}

function writerCredits(value) {
  const credit = clean(value).replace(/(?:저자|역자|작가)?\s*정보\s*(?:더\s*)?(?:보기|감추기)|보이기\s*\/\s*감추기|더보기|감추기/g,'').trim();
  if (!credit) return [];
  const parts = credit.split(/\s*\/\s*|\s*,\s*/).map(clean).filter(Boolean);
  const written = parts.filter(part => /(?:글(?:그림)?|글쓴이|저|지음|지은이|저자)\s*$/.test(part));
  if (written.length) return [...new Set(written.map(part => clean(part.replace(/\s*(?:글(?:그림)?|글쓴이|저|지음|지은이|저자)\s*$/,''))))].filter(Boolean);
  // If the source provides only illustrator/translator credits, do not mislabel
  // those contributors as the writer. Plain author-link names remain usable.
  return [...new Set(parts.filter(part => !/(?:그림|그린이|그림작가|옮김|옮긴이|역|역자|감수)\s*$/.test(part)))];
}

function emptyBook(id) {
  return {id,title:'',subtitle:'',authors:[],publisher:'',publishedDate:'',pageCount:null,isbn:'',language:'ko',infoUrl:sourceURL(id)};
}

function collector(rewriter, selector, getRecord, field) {
  let active = null;
  rewriter.on(selector, {
    element(element) {
      const record = getRecord();
      if (!record || record[field]) { active = null; return; }
      active = record; element.onEndTag(() => { if (active === record) active = null; });
    },
    text(chunk) { if (active && active[field].length < 20000) active[field] += chunk.text; }
  });
}

export async function searchYes24(query, options = {}) {
  const title = typeof query === 'string' ? query.trim() : '';
  if (!title || title.length > 120) throw new BookSourceError('INVALID_QUERY','Enter a title of 1–120 characters.');
  const Rewriter = options.Rewriter || globalThis.HTMLRewriter;
  if (typeof Rewriter !== 'function') throw new BookSourceError('UNAVAILABLE','Server HTML parsing is unavailable.');
  const url = new URL('/Product/Search',ORIGIN); url.searchParams.set('domain','BOOK'); url.searchParams.set('query',title);
  const html = await fetchHTML(url.href,null,options);
  const records = []; let current = null, hasList = false, emptyText = '';
  const rewriter = new Rewriter();
  rewriter.on('#yesSchList',{element(){ hasList = true; }});
  rewriter.on('#yesSchList > li',{
    element(element) {
      const candidate = {id:element.getAttribute('data-goods-no') || '',title:'',authorCredit:'',publisher:'',publishedDate:'',invalid:false};
      current = candidate;
      element.onEndTag(() => { records.push(candidate); if (current === candidate) current = null; });
    }
  });
  rewriter.on('#yesSchList > li .gd_name',{
    element(element) {
      if (!current) return;
      const id = goodsId(element.getAttribute('href') || '');
      if (!id || (current.id && id !== current.id)) current.invalid = true;
      if (id) current.id = id;
    }
  });
  collector(rewriter,'#yesSchList > li .gd_name',() => current,'title');
  collector(rewriter,'#yesSchList > li .info_auth',() => current,'authorCredit');
  collector(rewriter,'#yesSchList > li .info_pub',() => current,'publisher');
  collector(rewriter,'#yesSchList > li .info_date',() => current,'publishedDate');
  rewriter.on('.noData.schData .txt_tit, .sGoodsNoResult, .schNoData, .sch_no_result, .no_result, .noResult', {text(chunk){ if (emptyText.length < 5000) emptyText += chunk.text; }});
  await consume(rewriter,html);
  const seen = new Set(), books = [];
  for (const record of records) {
    if (record.invalid || !VALID_ID.test(record.id) || !clean(record.title) || seen.has(record.id)) continue;
    seen.add(record.id);
    books.push({...emptyBook(record.id),title:clean(record.title),authors:writerCredits(record.authorCredit),publisher:clean(record.publisher),publishedDate:clean(record.publishedDate)});
  }
  if (books.length) return books.slice(0,20);
  const noResults = /검색\s*결과(?:가|는)?\s*(?:없|0)|검색된?\s*(?:상품|도서)(?:이|가)?\s*없/.test(clean(emptyText));
  if (noResults) return [];
  throw new BookSourceError('BAD_RESPONSE',hasList ? 'The book search list contained no readable editions.' : 'The book search page layout was not recognized.');
}

export async function detailsYes24(id, options = {}) {
  if (typeof id !== 'string' || !VALID_ID.test(id)) throw new BookSourceError('INVALID_QUERY','Select a valid YES24 edition.');
  const Rewriter = options.Rewriter || globalThis.HTMLRewriter;
  if (typeof Rewriter !== 'function') throw new BookSourceError('UNAVAILABLE','Server HTML parsing is unavailable.');
  const html = await fetchHTML(sourceURL(id),id,options);
  const data = {title:'',subtitle:'',authorCredit:'',publisher:'',publishedDate:''};
  const meta = {}; const rows = []; let row = null, hasDetails = false, canonicalMismatch = false;
  const rewriter = new Rewriter();
  rewriter.on('meta', {element(element) {
    const name = (element.getAttribute('property') || element.getAttribute('name') || '').toLowerCase();
    const value = element.getAttribute('content') || '';
    if (['og:title','og:url','author'].includes(name) && !meta[name]) meta[name] = value;
  }});
  rewriter.on('link[rel="canonical"]',{element(element) {const linked = goodsId(element.getAttribute('href') || ''); if (linked && linked !== id) canonicalMismatch = true; }});
  collector(rewriter,'.gd_titArea .gd_name',() => data,'title');
  collector(rewriter,'.gd_titArea .gd_nameE',() => data,'subtitle');
  collector(rewriter,'.gd_auth',() => data,'authorCredit');
  collector(rewriter,'.gd_pub',() => data,'publisher');
  collector(rewriter,'.gd_date',() => data,'publishedDate');
  rewriter.on('#infoset_specific',{element(){ hasDetails = true; }});
  rewriter.on('#infoset_specific tr',{element(element) {const item = {label:'',value:''}; row = item; element.onEndTag(() => { rows.push(item); if(row === item) row = null; }); }});
  collector(rewriter,'#infoset_specific tr th',() => row,'label');
  collector(rewriter,'#infoset_specific tr td',() => row,'value');
  await consume(rewriter,html);
  const linked = goodsId(meta['og:url'] || '');
  if (canonicalMismatch || (linked && linked !== id)) throw new BookSourceError('BAD_RESPONSE','The book source returned a different edition.');
  const title = clean(data.title || meta['og:title']).replace(/\s*[-|]\s*YES24\s*$/i,'');
  if (!title || !hasDetails) throw new BookSourceError('BAD_RESPONSE','The book detail page layout was not recognized.');
  const book = {...emptyBook(id),title,subtitle:clean(data.subtitle),authors:writerCredits(data.authorCredit || meta.author),publisher:clean(data.publisher),publishedDate:clean(data.publishedDate)};
  let isbn10 = '';
  for (const entry of rows) {
    const label = clean(entry.label), value = clean(entry.value);
    if (/쪽수/.test(label)) {
      const match = value.match(/(?:^|[\s|])(\d[\d,]*)\s*(?:쪽|p(?:ages?)?)(?=$|[\s|])/i) || value.match(/^([\d,]+)$/);
      const pages = match ? Number(match[1].replace(/,/g,'')) : NaN;
      if (Number.isSafeInteger(pages) && pages > 0) book.pageCount = pages;
    }
    const normalized = value.replace(/[\s-]/g,'');
    if (/ISBN\s*13/i.test(label) && /^\d{13}$/.test(normalized)) book.isbn = normalized;
    if (/ISBN\s*10/i.test(label) && /^\d{9}[\dXx]$/.test(normalized)) isbn10 = normalized.toUpperCase();
    if (/발행일|출간일/.test(label) && value) book.publishedDate = value;
  }
  if (!book.isbn) book.isbn = isbn10;
  return book;
}
