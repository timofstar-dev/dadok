const test = require('node:test');
const assert = require('node:assert/strict');
const endpoint = () => import('../functions/_lib/books-endpoint.js');
function context(path, options = {}) { return {request:new Request('https://dadok.example/api/books/'+path,options)}; }

test('book endpoint validates methods, titles and product ids before upstream work', async () => {
  const {createBooksEndpoint} = await endpoint();
  const never = () => assert.fail('invalid requests must not contact bookstore');
  const search = createBooksEndpoint('search',never), details = createBooksEndpoint('details',never);
  assert.equal((await search(context('search?q=test',{method:'POST'}))).status,405);
  for (const q of ['', ' '.repeat(2), 'x'.repeat(121)]) assert.equal((await search(context('search?q='+encodeURIComponent(q)))).status,400);
  for (const id of ['', '../secret', 'https://other.example/', '0', '10?url=anything']) assert.equal((await details(context('details?id='+encodeURIComponent(id)))).status,400);
  assert.equal((await search(context('search?q=test',{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
});

test('server returns exact bookstore metadata and caches only successful results', async () => {
  const {createBooksEndpoint} = await endpoint(); let calls = 0, saved;
  const handler = createBooksEndpoint('search', async q => { calls++; assert.equal(q,'푸른 사자'); return [{id:'123',title:'푸른 사자',pageCount:null}]; });
  const ctx = context('search?q='+encodeURIComponent(' 푸른 사자 ')+'&unexpected=discard');
  ctx.cache = {match:async () => saved?.clone(), put:async (key,res) => { assert.equal(new URL(key.url).searchParams.has('unexpected'),false); saved=res; }};
  const first = await handler(ctx), second=await handler(ctx);
  assert.equal(first.status,200); assert.equal(calls,1);
  assert.deepEqual(await second.json(),{source:'YES24',books:[{id:'123',title:'푸른 사자',pageCount:null}]});
  assert.match(first.headers.get('cache-control'),/s-maxage=600/);
});

test('upstream errors are not cached or leaked into public responses', async () => {
  const {createBooksEndpoint} = await endpoint();
  for (const [code,status] of [['NOT_FOUND',404],['RATE_LIMIT',429],['BAD_RESPONSE',502],['PRIVATE_FAILURE',503]]) {
    const handler=createBooksEndpoint('details',async()=>{throw Object.assign(new Error('private debug data'),{code});});
    const ctx=context('details?id=123');ctx.cache={match:async()=>null,put:()=>assert.fail('no error caching')};
    const res=await handler(ctx);assert.equal(res.status,status);assert.equal(res.headers.get('cache-control'),'no-store');
    assert.equal((await res.text()).includes('private debug data'),false);
  }
});
