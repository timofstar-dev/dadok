const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {search, details, CatalogError} = require('../book-catalog.js');

const book = (id, overrides = {}) => ({id,title:'푸른 사자 와니니',subtitle:'',authors:[],publisher:'',publishedDate:'',pageCount:null,isbn:'',language:'ko',infoUrl:`https://www.yes24.com/Product/Goods/${id}`,...overrides});
const ok = body => async () => ({ok:true,status:200,json:async () => body});
const results = books => ({source:'YES24',books});
const detail = item => ({source:'YES24',book:item});
const code = expected => error => error instanceof CatalogError && error.code === expected;

test('Korean titles use only the same-origin search endpoint and omit credentials', async () => {
  let request;
  const controller = new AbortController();
  await search('  푸른 사자 & 와니니  ', {signal:controller.signal,fetchImpl:async (url,options) => {
    assert.ok(url.startsWith('/api/books/search?'));
    request = {url:new URL(url,'https://dadok.example'),options};
    return {ok:true,status:200,json:async () => results([])};
  }});
  assert.equal(request.url.origin,'https://dadok.example');
  assert.equal(request.url.pathname,'/api/books/search');
  assert.deepEqual([...request.url.searchParams], [['q','푸른 사자 & 와니니']]);
  assert.equal(request.options.credentials,'omit');
  assert.equal(request.options.signal,controller.signal);
});

test('details send only the selected YES24 product ID to the same-origin endpoint', async () => {
  let requested;
  const edition = await details('12345678',{fetchImpl:async (url,options) => {
    requested = {url,options}; return {ok:true,json:async () => detail(book('12345678'))};
  }});
  assert.equal(requested.url,'/api/books/details?id=12345678');
  assert.equal(requested.options.credentials,'omit');
  assert.equal(edition.id,'12345678');
});

test('different editions remain separate even when titles match; duplicate IDs appear once', async () => {
  const editions = await search('푸른 사자',{fetchImpl:ok(results([
    book('1001',{publisher:'출판사 A',pageCount:216}),
    book('1002',{publisher:'출판사 B',pageCount:232}),
    book('1001',{publisher:'중복'})
  ]))});
  assert.deepEqual(editions.map(r => [r.id,r.publisher,r.pageCount]),[['1001','출판사 A',216],['1002','출판사 B',232]]);
});

test('exact edition metadata stays plain text and source URLs are generated locally', async () => {
  const edition = await details('1001',{fetchImpl:ok(detail(book('1001',{
    title:' 제목 ',subtitle:' 부제 ',authors:[' 작가 A ','작가 B','작가 A',' '],publisher:'출판사',
    publishedDate:'2025-04-01',pageCount:216,isbn:'9781234567890',infoUrl:'javascript:alert(1)'
  })))});
  assert.deepEqual(edition,{id:'1001',title:'제목',subtitle:'부제',authors:['작가 A','작가 B'],publisher:'출판사',publishedDate:'2025-04-01',pageCount:216,isbn:'9781234567890',language:'ko',infoUrl:'https://www.yes24.com/Product/Goods/1001'});
  const plainText = await details('7',{fetchImpl:ok(detail(book('7',{authors:['<b>작가</b>'],infoUrl:{host:'untrusted'}})))});
  assert.deepEqual(plainText.authors,['<b>작가</b>']); // UI must use textContent.
  assert.equal(plainText.infoUrl,'https://www.yes24.com/Product/Goods/7');
});

test('missing optional metadata and unknown page counts are never guessed', async () => {
  const edition = await details('1',{fetchImpl:ok(detail({id:'1',title:'제목'}))});
  assert.deepEqual(edition,{id:'1',title:'제목',subtitle:'',authors:[],publisher:'',publishedDate:'',pageCount:null,isbn:'',language:'ko',infoUrl:'https://www.yes24.com/Product/Goods/1'});
  assert.equal((await details('1',{fetchImpl:ok(detail(book('1',{isbn:'012345678x'})))})).isbn,'012345678X');
});

test('malformed metadata types cannot become applied book fields', async () => {
  const invalid = [
    {id:1},{id:'0001'},{title:null},{title:' '},{authors:'작가'},{authors:['작가',null]},
    {authors:[{name:'작가'}]},{subtitle:3},{publisher:[]},{publishedDate:2025},
    {pageCount:'216'},{pageCount:0},{pageCount:-1},{pageCount:2.5},{pageCount:Infinity},
    {isbn:123456},{isbn:'not an ISBN'},{language:3},{language:'en'}
  ];
  for (const patch of invalid) await assert.rejects(details('1',{fetchImpl:ok(detail(book('1',patch)))}),code('BAD_RESPONSE'));
  await assert.rejects(search('제목',{fetchImpl:ok(results([book('1'),{id:'2'}]))}),code('BAD_RESPONSE'));
});

test('query and product ID validation happens before any network request', async () => {
  const fetchImpl = () => assert.fail('must not fetch');
  for (const query of ['', ' ', 'x'.repeat(121), null, {title:'x'}]) await assert.rejects(search(query,{fetchImpl}),code('INVALID_QUERY'));
  for (const id of ['', '0','00','01','-1','1.0','a','../1','1?x=2','1#x','1'.repeat(17),null,1]) await assert.rejects(details(id,{fetchImpl}),code('INVALID_QUERY'));
  const short = await search('숨',{fetchImpl:ok(results([book('123',{title:'숨'})]))});
  assert.equal(short[0].title,'숨');
  assert.equal((await details('1234567890123456',{fetchImpl:ok(detail(book('1234567890123456')))})).id,'1234567890123456');
});

test('only allowlisted server error codes are preserved and diagnostic messages are never exposed', async () => {
  for (const expected of ['INVALID_QUERY','NOT_FOUND','RATE_LIMIT','BAD_RESPONSE','UNAVAILABLE']) {
    await assert.rejects(search('제목',{fetchImpl:async () => ({ok:false,status:503,json:async () => ({error:{code:expected,message:'secret diagnostic data'}})})}),error => error instanceof CatalogError && error.code===expected && !error.message.includes('secret'));
  }
  for (const returned of ['__proto__','constructor','UNEXPECTED',{code:'NOT_FOUND'},null]) {
    await assert.rejects(search('제목',{fetchImpl:async () => ({ok:false,status:503,json:async () => ({error:{code:returned,message:'untrusted'}})})}),code('UNAVAILABLE'));
  }
  await assert.rejects(search('제목',{fetchImpl:ok({error:{code:'RATE_LIMIT',message:'ignore'}})}),code('RATE_LIMIT'));
});

test('HTTP fallback statuses, network failures and unreadable responses are handled', async () => {
  for (const [status,expected] of [[400,'INVALID_QUERY'],[429,'RATE_LIMIT'],[404,'NOT_FOUND'],[500,'UNAVAILABLE'],[403,'UNAVAILABLE']]) {
    await assert.rejects(search('제목',{fetchImpl:async () => ({ok:false,status,json:async () => {throw new SyntaxError('HTML error page');}})}),code(expected));
  }
  await assert.rejects(search('제목',{fetchImpl:async () => {throw new TypeError('secret details');}}),error => error.code==='UNAVAILABLE'&&!error.message.includes('secret'));
  await assert.rejects(search('제목',{fetchImpl:async () => ({ok:true,json:async () => {throw new SyntaxError('not JSON');}})}),code('BAD_RESPONSE'));
  await assert.rejects(search('제목',{fetchImpl:null}),code('UNAVAILABLE'));
});

test('empty results differ from broken envelopes, and detail IDs must match the selected edition', async () => {
  assert.deepEqual(await search('제목',{fetchImpl:ok(results([]))}),[]);
  for (const body of [{},[],null,{source:'other',books:[]},{source:'YES24'},{source:'YES24',books:'bad'}]) await assert.rejects(search('제목',{fetchImpl:ok(body)}),code('BAD_RESPONSE'));
  for (const body of [{source:'YES24'},detail(book('2')),results([book('1')])]) await assert.rejects(details('1',{fetchImpl:ok(body)}),code('BAD_RESPONSE'));
});

test('request cancellation survives fetch and response parsing', async () => {
  const abort = new DOMException('Aborted','AbortError');
  await assert.rejects(search('제목',{fetchImpl:async () => {throw abort;}}),error => error===abort);
  await assert.rejects(details('1',{fetchImpl:async () => ({ok:true,json:async () => {throw abort;}})}),error => error===abort);
  const controller = new AbortController(); controller.abort();
  const reason = new Error('cancelled by caller');
  await assert.rejects(search('제목',{signal:controller.signal,fetchImpl:async () => {throw reason;}}),error => error===reason);
});

test('the provider loads as a browser global without a bundler', () => {
  const context = vm.createContext({URLSearchParams});
  vm.runInContext(fs.readFileSync(require.resolve('../book-catalog.js'),'utf8'),context);
  assert.equal(typeof context.BookCatalog.search,'function');
  assert.equal(typeof context.BookCatalog.details,'function');
});
