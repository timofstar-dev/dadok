/* Synthetic edge cases plus reduced public-page excerpts captured 2026-10-27.
 * These tests do not perform live network requests or validate deployed access.
 * MINIFLARE_MODULE may point to an installed Miniflare module for local runs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Miniflare,createFetchMock} = require(process.env.MINIFLARE_MODULE || 'miniflare');
const source = fs.readFileSync(path.join(__dirname,'../functions/_lib/yes24.js'),'utf8');
const searchPath = query => '/Product/Search?' + new URLSearchParams({domain:'BOOK',query});
const headers = {'content-type':'text/html; charset=utf-8'};
function searchHTML() {
  return `<html><ul id="yesSchList">
    <li data-goods-no="123"><a class="gd_name" href="/Product/Goods/123">가상 <b>탐험</b> 이야기 &amp; 친구들</a><span class="info_auth">한별 글 / 샛별 그림</span><span class="info_pub"><a>가상책방</a></span><span class="info_date">2025년 03월</span></li>
    <li data-goods-no="456"><a class="gd_name" href="https://www.yes24.com/Product/Goods/456">가상 탐험 이야기 &amp; 친구들</a><span class="info_auth">한별 저</span><span class="info_pub">다른출판사</span><span class="info_date">2026년 01월</span></li>
    <li data-goods-no="123"><a class="gd_name" href="/Product/Goods/123">중복 결과</a></li>
    <li data-goods-no="789"><a class="gd_name" href="https://example.com/Product/Goods/789">외부 상품 링크</a></li>
  </ul></html>`;
}
function detailHTML({id='123',pages='216쪽 | 300g | 152*225*12mm',isbn='978-12-345-6789-0',credits='한별 글 / 샛별 그림'} = {}) {
  return `<html><meta property="og:url" content="https://www.yes24.com/Product/Goods/${id}"><link rel="canonical" href="https://www.yes24.com/Product/Goods/${id}">
  <div class="gd_titArea"><h2 class="gd_name">가상 탐험 이야기</h2><span class="gd_nameE">새로운 판본</span></div>
  <span class="gd_auth">${credits}</span><span class="gd_pub"><a>가상책방</a></span><span class="gd_date">2025년 03월 01일</span>
  <div id="infoset_specific"><table>
  <tr><th>쪽수, 무게, 크기</th><td>${pages}</td></tr><tr><th>ISBN13</th><td>${isbn}</td></tr><tr><th>발행일</th><td>2025년 04월 02일</td></tr>
  </table></div></html>`;
}

test('YES24 adapter in the real Workers HTMLRewriter runtime', {timeout:30000}, async t => {
  const fetchMock = createFetchMock(); fetchMock.disableNetConnect();
  const upstream = fetchMock.get('https://www.yes24.com');
  const mf = new Miniflare({modules:true,fetchMock,compatibilityDate:'2026-07-01',script:source + `
    export default {async fetch(request) {
      const url = new URL(request.url);
      try { return Response.json({result:url.pathname === '/search' ? await searchYes24(url.searchParams.get('q')) : await detailsYes24(url.searchParams.get('id'))}); }
      catch(error) { return Response.json({error:{code:error.code || 'UNEXPECTED',name:error.name}}); }
    }};
  `});
  t.after(async()=>{await mf.dispose();});
  const call = async p => (await mf.dispatchFetch('https://local.test'+p)).json();
  const reply = (p,html,status=200,extra={}) => upstream.intercept({path:p,method:'GET'}).reply(status,html,{headers:{...headers,...extra}});

  await t.test('captured public YES24 markup returns the original Wanini edition and its exact page count',async()=>{
    const fixture = name => fs.readFileSync(path.join(__dirname,'fixtures/yes24',name),'utf8');
    reply(searchPath('푸른 사자 와니니'),fixture('search.html'));
    const {result:editions} = await call('/search?q='+encodeURIComponent('푸른 사자 와니니'));
    assert.deepEqual(editions.map(book=>[book.id,book.title]),[
      ['192555270','푸른 사자 와니니 10'],['18841857','푸른 사자 와니니']
    ]);
    assert.deepEqual(editions[1].authors,['이현']);
    assert.equal(editions[1].publisher,'창비');
    reply('/Product/Goods/18841857',fixture('detail.html'));
    const {result:edition} = await call('/details?id=18841857');
    assert.equal(edition.title,'푸른 사자 와니니');
    assert.deepEqual(edition.authors,['이현']);
    assert.equal(edition.publisher,'창비');
    assert.equal(edition.pageCount,216);
    assert.equal(edition.isbn,'9788936442804');
    assert.equal(edition.publishedDate,'2015년 06월 25일');
    reply(searchPath('다독검증없는책zxqv9780123999999'),fixture('empty.html'));
    assert.deepEqual((await call('/search?q='+encodeURIComponent('다독검증없는책zxqv9780123999999'))).result,[]);
  });

  await t.test('search keeps same-title editions and exact public metadata, excluding foreign links',async()=>{
    reply(searchPath('가상 탐험'),searchHTML());
    const data = await call('/search?q='+encodeURIComponent('가상 탐험'));
    assert.equal(data.error,undefined);
    assert.deepEqual(data.result.map(b=>b.id),['123','456']);
    assert.equal(data.result[0].title,'가상 탐험 이야기 & 친구들');
    assert.deepEqual(data.result[0].authors,['한별']);
    assert.equal(data.result[0].publisher,'가상책방');
    assert.equal(data.result[0].publishedDate,'2025년 03월');
    assert.equal(data.result[0].pageCount,null);
    assert.equal(data.result[0].infoUrl,'https://www.yes24.com/Product/Goods/123');
  });
  await t.test('detail table provides page count and ISBN only for the selected edition',async()=>{
    reply('/Product/Goods/123',detailHTML());
    const {result} = await call('/details?id=123');
    assert.equal(result.title,'가상 탐험 이야기');
    assert.equal(result.subtitle,'새로운 판본');
    assert.deepEqual(result.authors,['한별']);
    assert.equal(result.pageCount,216);
    assert.equal(result.isbn,'9781234567890');
    assert.equal(result.publishedDate,'2025년 04월 02일');
  });
  await t.test('missing pages and authors stay missing instead of using weight, bundle count or translator',async()=>{
    reply('/Product/Goods/123',detailHTML({pages:'2권 | 400g | 152*225mm',isbn:'정보 없음',credits:'샛별 그림 / 다솜 역'}));
    const {result} = await call('/details?id=123');
    assert.equal(result.pageCount,null);assert.equal(result.isbn,'');assert.deepEqual(result.authors,[]);
  });
  await t.test('zero results require an explicit zero-result message',async()=>{
    reply(searchPath('없는책'),'<div class="schNoData">검색 결과가 없습니다.</div>');
    assert.deepEqual((await call('/search?q='+encodeURIComponent('없는책'))).result,[]);
    reply(searchPath('빈목록'),'<ul id="yesSchList"></ul>');
    assert.equal((await call('/search?q='+encodeURIComponent('빈목록'))).error.code,'BAD_RESPONSE');
  });
  await t.test('challenge, malformed layout and mismatched book identity fail explicitly',async()=>{
    reply(searchPath('검색책'),'<html><title>Verify you are human</title></html>');
    assert.equal((await call('/search?q='+encodeURIComponent('검색책'))).error.code,'BAD_RESPONSE');
    reply('/Product/Goods/123',detailHTML({id:'456'}));
    assert.equal((await call('/details?id=123')).error.code,'BAD_RESPONSE');
    reply('/Product/Goods/123','<meta property="og:title" content="도서"><div>기타 페이지</div>');
    assert.equal((await call('/details?id=123')).error.code,'BAD_RESPONSE');
  });
  await t.test('only the same host and requested edition can be followed through redirects',async()=>{
    reply('/Product/Goods/123','',302,{location:'https://example.com/Product/Goods/123'});
    assert.equal((await call('/details?id=123')).error.code,'UNAVAILABLE');
    reply('/Product/Goods/123','',302,{location:'/Product/Goods/456'});
    assert.equal((await call('/details?id=123')).error.code,'UNAVAILABLE');
    reply('/Product/Goods/123','',302,{location:'/24/goods/123'});
    reply('/24/goods/123',detailHTML());
    assert.equal((await call('/details?id=123')).result.id,'123');
  });
  await t.test('HTTP errors, incorrect content types and 2 MiB limit are enforced',async()=>{
    for (const [status,code] of [[404,'NOT_FOUND'],[429,'RATE_LIMIT'],[403,'UNAVAILABLE']]) {
      reply('/Product/Goods/123','',status);assert.equal((await call('/details?id=123')).error.code,code);
    }
    reply('/Product/Goods/123','{}',200,{'content-type':'application/json'});
    assert.equal((await call('/details?id=123')).error.code,'BAD_RESPONSE');
    reply('/Product/Goods/123','x'.repeat(2*1024*1024+1));
    assert.equal((await call('/details?id=123')).error.code,'BAD_RESPONSE');
  });
  await t.test('invalid IDs and queries do not become upstream URLs',async()=>{
    assert.equal((await call('/details?id=..%2Fanything')).error.code,'INVALID_QUERY');
    assert.equal((await call('/search?q=')).error.code,'INVALID_QUERY');
    assert.equal((await call('/search?q='+'a'.repeat(121))).error.code,'INVALID_QUERY');
  });
  fetchMock.assertNoPendingInterceptors();
});
