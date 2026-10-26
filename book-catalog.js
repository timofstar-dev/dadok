(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BookCatalog = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const API = 'https://www.googleapis.com/books/v1/volumes';
  const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;

  class CatalogError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'CatalogError';
      this.code = code;
    }
  }

  const text = value => typeof value === 'string' ? value.trim() : '';

  // These are plain text fields. Consumers must render them using textContent,
  // never innerHTML. Details always belong to this exact Google Books volume.
  function normalize(volume) {
    if (!volume || !VALID_ID.test(text(volume.id)) || !volume.volumeInfo ||
        typeof volume.volumeInfo !== 'object' || !text(volume.volumeInfo.title)) {
      throw new CatalogError('BAD_RESPONSE', 'Book information is incomplete.');
    }
    const info = volume.volumeInfo;
    const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
    const isbn13 = identifiers.find(item => item && item.type === 'ISBN_13' && /^\d{13}$/.test(text(item.identifier)));
    const isbn10 = identifiers.find(item => item && item.type === 'ISBN_10' && /^\d{9}[\dXx]$/.test(text(item.identifier)));
    const isbn = isbn13 || isbn10;
    const id = text(volume.id);
    return {
      id,
      title: text(info.title),
      subtitle: text(info.subtitle),
      authors: Array.isArray(info.authors) ? [...new Set(info.authors.map(text).filter(Boolean))] : [],
      publisher: text(info.publisher),
      publishedDate: text(info.publishedDate),
      pageCount: Number.isSafeInteger(info.pageCount) && info.pageCount > 0 ? info.pageCount : null,
      isbn: isbn ? text(isbn.identifier).toUpperCase() : '',
      language: text(info.language),
      infoUrl: `https://books.google.com/books?id=${encodeURIComponent(id)}`
    };
  }

  async function request(url, { signal, fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new CatalogError('UNAVAILABLE', 'Book search is unavailable in this browser.');
    }
    let response;
    try {
      response = await fetchImpl(url, { signal, credentials: 'omit' });
    } catch (error) {
      // Preserve cancellation so stale searches never become visible errors.
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      throw new CatalogError('UNAVAILABLE', 'The book service could not be reached.');
    }
    if (!response.ok) {
      if (response.status === 404) throw new CatalogError('NOT_FOUND', 'This edition is no longer available.');
      let quota = response.status === 429;
      if (response.status === 403) {
        try {
          const body = await response.json();
          quota = Array.isArray(body?.error?.errors) && body.error.errors.some(item =>
            /quota|rateLimit|dailyLimit/i.test(text(item?.reason)));
          quota ||= body?.error?.status === 'RESOURCE_EXHAUSTED';
        } catch (_) { /* An unreadable error body is still an unavailable service. */ }
      }
      if (quota) throw new CatalogError('RATE_LIMIT', 'Book search is temporarily limited. Please try again later.');
      throw new CatalogError('UNAVAILABLE', 'The book service is temporarily unavailable.');
    }
    let body;
    try { body = await response.json(); }
    catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      throw new CatalogError('BAD_RESPONSE', 'The book service returned unreadable information.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.error) {
      throw new CatalogError('BAD_RESPONSE', 'The book service returned unexpected information.');
    }
    return body;
  }

  async function search(query, options = {}) {
    const title = text(query);
    if (title.length < 1 || title.length > 120) {
      throw new CatalogError('INVALID_QUERY', 'Enter a book title between 1 and 120 characters.');
    }
    const params = new URLSearchParams({q: `intitle:${title}`, printType: 'books', maxResults: '20'});
    const body = await request(`${API}?${params}`, options);
    if (body.items === undefined && body.totalItems === 0) return [];
    if (!Array.isArray(body.items)) throw new CatalogError('BAD_RESPONSE', 'The search result list is missing.');
    const seen = new Set(), results = [];
    for (const item of body.items) {
      let edition;
      try { edition = normalize(item); }
      catch (error) { if (error.code === 'BAD_RESPONSE') continue; throw error; }
      if (!seen.has(edition.id)) { seen.add(edition.id); results.push(edition); }
    }
    // A broken nonempty payload is different from a real zero-result search.
    if (body.items.length && !results.length) {
      throw new CatalogError('BAD_RESPONSE', 'No usable editions were returned.');
    }
    return results;
  }

  async function details(id, options = {}) {
    if (typeof id !== 'string' || !VALID_ID.test(id)) {
      throw new CatalogError('INVALID_QUERY', 'Select a valid book edition.');
    }
    const result = normalize(await request(`${API}/${encodeURIComponent(id)}`, options));
    if (result.id !== id) throw new CatalogError('BAD_RESPONSE', 'The service returned a different edition.');
    return result;
  }

  return {search, details, CatalogError};
});
