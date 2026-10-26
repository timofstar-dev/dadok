/* Book search never submits reading records or changes fields until Apply is chosen. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const helper = $('bookHelper');
  let selected = null, searchVersion = 0, detailVersion = 0;
  let searchController, detailController;
  const timeoutMs = 12000;
  function status(message, isError = false) {
    $('bookSearchStatus').textContent = message;
    $('bookSearchStatus').classList.toggle('is-error', isError);
  }
  function busy(value) {
    $('bookSearchResults').setAttribute('aria-busy', String(value));
    $('bookSearchButton').classList.toggle('is-loading', value);
  }
  function clearSelection() {
    selected = null; $('bookSelection').hidden = true;
    $('applyBookTitle').disabled = true; $('applyBookPages').disabled = true;
    for (const button of $('bookEditionList').querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
  }
  function errorMessage(error, timeout) {
    if (timeout) return '책 검색 응답이 늦어지고 있어요. 다시 검색하거나 책 정보를 직접 적어 주세요.';
    if (error.code === 'RATE_LIMIT') return '지금은 책 검색 이용량이 많아요. 잠시 뒤 다시 검색하거나 직접 입력해 주세요.';
    if (error.code === 'NOT_FOUND') return '이 판본의 상세 정보를 찾지 못했어요. 다른 판본을 선택하거나 직접 입력해 주세요.';
    if (error.code === 'INVALID_QUERY') return '검색할 제목을 1~120글자로 입력해 주세요.';
    return '책 검색에 연결하지 못했어요. 다시 시도하거나 아래 입력란에 직접 적어 주세요.';
  }
  function node(tag, text, className) {
    const element = document.createElement(tag); element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function renderEditions(books) {
    $('bookEditionList').replaceChildren();
    for (const book of books) {
      const row = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'book-edition'; button.setAttribute('aria-pressed', 'false');
      const icon = node('span', '▤', 'book-edition-icon'); icon.setAttribute('aria-hidden', 'true');
      const copy = node('span', '', 'book-edition-copy');
      copy.append(node('strong', book.title));
      if (book.subtitle) copy.append(node('small', book.subtitle));
      copy.append(node('small', book.authors.length ? book.authors.join(', ') : '지은이 정보 없음', 'book-edition-author'));
      copy.append(node('small', `${book.publisher || '출판사 정보 없음'} · ${book.publishedDate || '출간일 정보 없음'}`));
      copy.append(node('small', `ISBN ${book.isbn || '정보 없음'}`));
      copy.append(node('span', '이 판본 확인하기 →', 'book-edition-check'));
      button.append(icon,copy); button.onclick = () => chooseEdition(book.id, button); row.append(button); $('bookEditionList').append(row);
    }
  }
  async function search(event) {
    event.preventDefault();
    const query = $('bookSearchQuery').value.trim();
    searchController?.abort(); detailController?.abort();
    const version = ++searchVersion; ++detailVersion;
    clearSelection(); $('bookEditionList').replaceChildren(); $('bookAppliedStatus').textContent = '';
    if (query.length < 1 || query.length > 120) { busy(false); status('검색할 제목을 1~120글자로 입력해 주세요.', true); return; }
    const controller = new AbortController(); searchController = controller; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    busy(true); status(`“${query}” 책을 찾고 있어요…`);
    try {
      const books = await BookCatalog.search(query, {signal: controller.signal});
      if (version !== searchVersion) return;
      renderEditions(books);
      status(books.length ? `“${query}” 검색 결과 ${books.length}개 · 읽은 책과 같은 판본을 선택해 주세요.` : '검색된 책이 없어요. 제목의 일부로 다시 검색하거나 아래 입력란에 직접 적어 주세요.');
    } catch (error) {
      if (version !== searchVersion) return;
      status(errorMessage(error,timedOut), true);
    } finally { clearTimeout(timer); if (version === searchVersion) busy(false); }
  }
  async function chooseEdition(id, button) {
    detailController?.abort(); const version = ++detailVersion; const searchAtStart = searchVersion;
    clearSelection(); button.setAttribute('aria-pressed', 'true');
    const controller = new AbortController(); detailController = controller; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    status('선택한 판본의 지은이와 전체 쪽수를 확인하고 있어요…');
    try {
      const book = await BookCatalog.details(id, {signal:controller.signal});
      if (version !== detailVersion || searchAtStart !== searchVersion) return;
      selected = book; showSelection(book);
      status('판본을 확인했어요. 책 정보만 채우거나, 다 읽었다면 전체 쪽수를 적용해 주세요.');
    } catch (error) {
      if (version !== detailVersion || searchAtStart !== searchVersion) return;
      button.setAttribute('aria-pressed','false'); status(errorMessage(error,timedOut), true);
    } finally { clearTimeout(timer); }
  }
  function showSelection(book) {
    $('bookSelection').hidden = false;
    $('bookSelectionHeading').textContent = book.title;
    $('bookSelectionSubtitle').textContent = book.subtitle;
    $('selectedBookAuthors').textContent = book.authors.length ? book.authors.join(', ') : '지은이 정보 없음 · 책에서 확인해 주세요';
    $('selectedBookPages').textContent = book.pageCount ? `${book.pageCount.toLocaleString()}쪽` : '쪽수 정보 없음';
    $('selectedBookPublisher').textContent = `${book.publisher || '출판사 정보 없음'} · ${book.publishedDate || '출간일 정보 없음'}`;
    $('selectedBookIsbn').textContent = book.isbn || 'ISBN 정보 없음';
    $('bookSourceLink').href = book.infoUrl;
    $('bookPagesHint').textContent = book.pageCount ? '이 숫자는 책 전체의 쪽수예요. 실제로 읽은 쪽수와 같은지 확인해 주세요.' : '이 판본에는 전체 쪽수가 제공되지 않았어요. 제목을 적용한 뒤 읽은 페이지 수를 직접 적어 주세요.';
    $('applyBookTitle').disabled = false; $('applyBookPages').disabled = !book.pageCount;
    $('applyBookPages').textContent = book.pageCount ? `다 읽었어요 · ${book.pageCount.toLocaleString()}쪽 적용` : '전체 쪽수 정보 없음';
  }
  function apply(includePages) {
    if (!selected || (includePages && !selected.pageCount)) return;
    const authors = selected.authors.length ? `(${selected.authors.join(', ')})` : '';
    const title = selected.title + (selected.subtitle ? `: ${selected.subtitle}` : '');
    $('bookTitleInput').value = `${title}${authors}`;
    $('bookTitleInput').dispatchEvent(new Event('input',{bubbles:true}));
    if (includePages) { $('pagesInput').value = String(selected.pageCount); $('pagesInput').dispatchEvent(new Event('input',{bubbles:true})); }
    $('bookAppliedStatus').textContent = includePages ? `“${title}” 제목과 전체 ${selected.pageCount.toLocaleString()}쪽을 입력했어요. 실제 읽은 쪽수를 확인한 뒤 기록을 저장해 주세요.` : `“${title}” 제목${selected.authors.length ? '과 지은이' : ''}를 입력했어요. 읽은 페이지 수는 그대로 두었어요.`;
    helper.open = false;
    const target = includePages ? $('bookTitleInput') : $('pagesInput'); target.focus({preventScroll:true}); target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  $('bookSearchForm').addEventListener('submit', search);
  $('applyBookTitle').addEventListener('click', () => apply(false));
  $('applyBookPages').addEventListener('click', () => apply(true));
  helper.addEventListener('toggle', () => {
    if (helper.open) {
      if (!$('bookSearchQuery').value) $('bookSearchQuery').value = $('bookTitleInput').value.replace(/\([^)]*\)\s*$/, '').trim().slice(0,120);
    } else {
      ++searchVersion; ++detailVersion; searchController?.abort(); detailController?.abort(); busy(false);
      if (!selected) { for (const button of $('bookEditionList').querySelectorAll('button')) button.setAttribute('aria-pressed','false'); status('제목을 검색하거나 목록에서 판본을 선택해 주세요.'); }
    }
  });
  $('readingForm').addEventListener('input', () => { $('bookAppliedStatus').textContent = ''; });
  $('readingForm').addEventListener('submit', () => { $('bookAppliedStatus').textContent = ''; });
})();
