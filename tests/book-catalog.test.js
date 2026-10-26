const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {search, details, CatalogError} = require('../book-catalog.js');

const volume = (id, info = {}) => ({id, volumeInfo: {title: '푸른 사자 와니니', ...info}});
const ok = body => async () => ({ok:true, status:200, json:async () => body});
const code = expected => error => error instanceof CatalogError && error.code === expected;

test('Korean title searches are encoded as data and only request public volume metadata', async () => {
  let request;
  const controller = new AbortController();
  await search('  푸른 사자 & 와니니  ', {signal: controller.signal, fetchImpl: async (url, options) => {
    request = {url:new URL(url), options}; return {ok:true, json:async () => ({totalItems:0})};
  }});
  assert.equal(request.url.origin, 'https://www.googleapis.com');
  assert.equal(request.url.searchParams.get('q'), 'intitle:푸른 사자 & 와니니');
  assert.equal(request.url.searchParams.get('maxResults'), '20');
  assert.equal(request.url.searchParams.get('printType'), 'books');
  assert.equal(request.url.searchParams.has('key'), false);
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.signal, controller.signal);
});

test('different editions remain separate even when titles match; duplicates are by ID only', async () => {
  const results = await search('푸른 사자', {fetchImpl:ok({items:[
    volume('edition_A',{publisher:'출판사 A',pageCount:216}),
    volume('edition_B',{publisher:'출판사 B',pageCount:232}),
    volume('edition_A',{publisher:'duplicate'})
  ]})});
  assert.deepEqual(results.map(r => [r.id,r.publisher,r.pageCount]), [['edition_A','출판사 A',216],['edition_B','출판사 B',232]]);
});

test('edition details preserve exact authors, ISBN13, date, and page count with a generated safe source URL', async () => {
  const result = await details('edition_A',{fetchImpl:ok(volume('edition_A', {
    title:' 제목 ', subtitle:'부제', authors:[' 작가 A ',null,'작가 B','작가 A'], publisher:'출판사',
    publishedDate:'2025-04-01',pageCount:216,language:'ko',
    infoLink:'javascript:alert(1)',industryIdentifiers:[
      {type:'ISBN_10',identifier:'012345678X'}, {type:'ISBN_13',identifier:'9781234567890'}
    ]
  }))});
  assert.deepEqual(result, {id:'edition_A',title:'제목',subtitle:'부제',authors:['작가 A','작가 B'],publisher:'출판사',publishedDate:'2025-04-01',pageCount:216,isbn:'9781234567890',language:'ko',infoUrl:'https://books.google.com/books?id=edition_A'});
});

test('unknown, zero, invalid, or fractional pages never become a guessed page count', async () => {
  for (const pageCount of [undefined,0,-1,NaN,Infinity,2.5,'216']) {
    const edition = await details('a',{fetchImpl:ok(volume('a',{pageCount}))});
    assert.equal(edition.pageCount,null); assert.deepEqual(edition.authors,[]);
    assert.equal(edition.isbn,''); assert.equal(edition.publisher,'');
  }
  assert.equal((await details('a',{fetchImpl:ok(volume('a',{industryIdentifiers:[{type:'ISBN_10',identifier:'012345678x'}]}))})).isbn,'012345678X');
});

test('query and identifier validation happens before any network request', async () => {
  const fetchImpl = () => assert.fail('must not fetch');
  for (const query of ['', ' ', 'x'.repeat(121), null, {title:'x'}]) await assert.rejects(search(query,{fetchImpl}),code('INVALID_QUERY'));
  for (const id of ['', '../other', 'id?x=1', 'id#x', null]) await assert.rejects(details(id,{fetchImpl}),code('INVALID_QUERY'));
});

test('HTTP status, quota errors, network failures and malformed JSON have distinct handled errors', async () => {
  for (const [status,expected] of [[429,'RATE_LIMIT'],[404,'NOT_FOUND'],[500,'UNAVAILABLE'],[403,'UNAVAILABLE']]) {
    await assert.rejects(search('제목',{fetchImpl:async () => ({ok:false,status,json:async () => ({})})}),code(expected));
  }
  await assert.rejects(search('제목',{fetchImpl:async () => ({ok:false,status:403,json:async () => ({error:{errors:[{reason:'dailyLimitExceeded'}]}})})}),code('RATE_LIMIT'));
  await assert.rejects(search('제목',{fetchImpl:async () => {throw new TypeError('secret network details');}}),error => error.code === 'UNAVAILABLE' && !error.message.includes('secret'));
  await assert.rejects(search('제목',{fetchImpl:async () => ({ok:true,json:async () => {throw new SyntaxError('not JSON');}})}),code('BAD_RESPONSE'));
});

test('empty results differ from broken results, and detail IDs must match the selected edition', async () => {
  assert.deepEqual(await search('제목',{fetchImpl:ok({totalItems:0})}),[]);
  assert.deepEqual(await search('제목',{fetchImpl:ok({items:[]})}),[]);
  for (const body of [{},[],null,{items:[{}]},{items:'bad'},{error:{message:'bad'}}]) await assert.rejects(search('제목',{fetchImpl:ok(body)}),code('BAD_RESPONSE'));
  await assert.rejects(details('selected',{fetchImpl:ok(volume('different'))}),code('BAD_RESPONSE'));
  assert.equal((await search('제목',{fetchImpl:ok({items:[{},volume('valid')]})})).length,1);
});

test('request cancellation is preserved rather than shown as a provider failure', async () => {
  const abort = new DOMException('Aborted','AbortError');
  await assert.rejects(search('제목',{fetchImpl:async () => {throw abort;}}),error => error === abort);
  await assert.rejects(details('a',{fetchImpl:async () => ({ok:true,json:async () => {throw abort;}})}),error => error === abort);
});

test('the provider loads as a browser global without a bundler', () => {
  const context = vm.createContext({URLSearchParams});
  vm.runInContext(fs.readFileSync(require.resolve('../book-catalog.js'),'utf8'),context);
  assert.equal(typeof context.BookCatalog.search,'function');
  assert.equal(typeof context.BookCatalog.details,'function');
});


test('one-character Korean book titles can be searched', async () => {
  const results = await search('숨', {fetchImpl:ok({items:[volume('short_title',{title:'숨'})]})});
  assert.equal(results[0].title, '숨');
});
