const HEADERS = {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
function json(body, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(body), {status,headers:{...HEADERS,'Cache-Control':cache}});
}

// Only book titles and fixed numeric product IDs reach the provider, never URLs.
export function createBooksEndpoint(kind, lookup) {
  return async function onRequest(context) {
    const {request} = context;
    if (request.method !== 'GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
    if (request.headers.get('sec-fetch-site') === 'cross-site') return json({error:{code:'UNAVAILABLE',message:'Use the book search inside the app.'}},403);
    const url = new URL(request.url);
    const value = (url.searchParams.get(kind === 'search' ? 'q' : 'id') || '').trim();
    if (kind === 'search' ? !value || value.length > 120 : !/^[1-9]\d{0,15}$/.test(value)) {
      return json({error:{code:'INVALID_QUERY',message:'Enter a book title or select an edition.'}},400);
    }
    const cacheUrl = new URL(url.origin + `/api/books/${kind}`);
    cacheUrl.searchParams.set(kind === 'search' ? 'q' : 'id', value);
    const cacheKey = new Request(cacheUrl);
    const cache = context.cache || globalThis.caches?.default;
    if (cache) {
      try { const cached = await cache.match(cacheKey); if (cached) return cached; } catch { /* Cache outages should not disable lookup. */ }
    }
    try {
      const data = await lookup(value);
      const response = json(kind === 'search' ? {source:'YES24',books:data} : {source:'YES24',book:data},200,kind === 'search' ? 'public, max-age=60, s-maxage=600' : 'public, max-age=300, s-maxage=21600');
      if (cache) {
        const save = cache.put(cacheKey, response.clone()).catch(() => {});
        if (context.waitUntil) context.waitUntil(save); else await save;
      }
      return response;
    } catch (error) {
      const code = ['INVALID_QUERY','NOT_FOUND','RATE_LIMIT','BAD_RESPONSE'].includes(error?.code) ? error.code : 'UNAVAILABLE';
      const status = {INVALID_QUERY:400,NOT_FOUND:404,RATE_LIMIT:429,BAD_RESPONSE:502,UNAVAILABLE:503}[code];
      return json({error:{code,message:'Book information is temporarily unavailable.'}},status);
    }
  };
}
