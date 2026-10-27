(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BookCatalog = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const API = '/api/books';
  const VALID_ID = /^[1-9]\d{0,15}$/;
  const MESSAGES = Object.freeze({
    INVALID_QUERY: 'Enter a valid book title or select an edition.',
    NOT_FOUND: 'This edition is no longer available.',
    RATE_LIMIT: 'Book search is temporarily limited. Please try again later.',
    BAD_RESPONSE: 'The book service returned unexpected information.',
    UNAVAILABLE: 'The book service is temporarily unavailable.'
  });

  class CatalogError extends Error {
    constructor(code) {
      super(MESSAGES[code] || MESSAGES.UNAVAILABLE);
      this.name = 'CatalogError';
      this.code = Object.hasOwn(MESSAGES, code) ? code : 'UNAVAILABLE';
    }
  }

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function optionalText(value) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new CatalogError('BAD_RESPONSE');
    return value.trim();
  }

  // Metadata is plain text, never HTML. The source link is constructed locally
  // from a validated YES24 product ID, without trusting a returned URL.
  function normalize(book) {
    if (!isObject(book) || typeof book.id !== 'string' || !VALID_ID.test(book.id) ||
        typeof book.title !== 'string' || !book.title.trim()) {
      throw new CatalogError('BAD_RESPONSE');
    }
    const authors = book.authors === undefined ? [] : book.authors;
    if (!Array.isArray(authors) || authors.some(author => typeof author !== 'string')) {
      throw new CatalogError('BAD_RESPONSE');
    }
    const pageCount = book.pageCount ?? null;
    if (pageCount !== null && (!Number.isSafeInteger(pageCount) || pageCount <= 0)) {
      throw new CatalogError('BAD_RESPONSE');
    }
    const isbn = optionalText(book.isbn).toUpperCase();
    if (isbn && !/^(?:\d{13}|\d{9}[\dX])$/.test(isbn)) throw new CatalogError('BAD_RESPONSE');
    const language = optionalText(book.language) || 'ko';
    if (language !== 'ko') throw new CatalogError('BAD_RESPONSE');
    return {
      id: book.id,
      title: book.title.trim(),
      subtitle: optionalText(book.subtitle),
      authors: [...new Set(authors.map(author => author.trim()).filter(Boolean))],
      publisher: optionalText(book.publisher),
      publishedDate: optionalText(book.publishedDate),
      pageCount,
      isbn,
      language,
      infoUrl: `https://www.yes24.com/Product/Goods/${book.id}`
    };
  }

  async function request(url, {signal, fetchImpl = globalThis.fetch} = {}) {
    if (typeof fetchImpl !== 'function') throw new CatalogError('UNAVAILABLE');
    let response;
    try { response = await fetchImpl(url, {signal, credentials: 'omit'}); }
    catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      throw new CatalogError('UNAVAILABLE');
    }
    let body;
    try { body = await response.json(); }
    catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      if (response.ok) throw new CatalogError('BAD_RESPONSE');
    }
    if (!response.ok || (isObject(body) && body.error)) {
      const returnedCode = isObject(body?.error) ? body.error.code : null;
      // Never surface raw server messages, provider markup, or diagnostic data.
      if (typeof returnedCode === 'string' && Object.hasOwn(MESSAGES, returnedCode)) {
        throw new CatalogError(returnedCode);
      }
      const fallback = response.status === 400 ? 'INVALID_QUERY' : response.status === 404 ? 'NOT_FOUND' :
        response.status === 429 ? 'RATE_LIMIT' : response.ok ? 'BAD_RESPONSE' : 'UNAVAILABLE';
      throw new CatalogError(fallback);
    }
    if (!isObject(body) || body.source !== 'YES24') throw new CatalogError('BAD_RESPONSE');
    return body;
  }

  async function search(query, options = {}) {
    const title = typeof query === 'string' ? query.trim() : '';
    if (title.length < 1 || title.length > 120) throw new CatalogError('INVALID_QUERY');
    const body = await request(`${API}/search?${new URLSearchParams({q: title})}`, options);
    if (!Array.isArray(body.books)) throw new CatalogError('BAD_RESPONSE');
    const seen = new Set(), results = [];
    for (const item of body.books) {
      const edition = normalize(item);
      if (!seen.has(edition.id)) { seen.add(edition.id); results.push(edition); }
    }
    return results;
  }

  async function details(id, options = {}) {
    if (typeof id !== 'string' || !VALID_ID.test(id)) throw new CatalogError('INVALID_QUERY');
    const body = await request(`${API}/details?${new URLSearchParams({id})}`, options);
    const result = normalize(body.book);
    if (result.id !== id) throw new CatalogError('BAD_RESPONSE');
    return result;
  }

  return {search, details, CatalogError};
});
