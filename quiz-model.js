(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.QuizModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Must stay identical to normalizeTitle() in the Apps Script Quiz.gs, which makes the final decision.
  // "어린왕자(생텍쥐페리)" and "어린 왕자" are the same book: drop the author in parentheses,
  // spaces and punctuation before comparing.
  function normalizeTitle(title) {
    return String(title || '').replace(/[(\[].*$/, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  }
  function findQuizBook(books, title) {
    const key = normalizeTitle(title);
    return key ? (books || []).find(b => normalizeTitle(b.title) === key) || null : null;
  }
  function bookLabel(book) { return book.author ? `${book.title}(${book.author})` : book.title; }
  function errorMessage(res) {
    switch (res?.error) {
      case 'ALREADY_CERTIFIED': return '이미 퀴즈로 인증한 책이에요. 다른 책을 기록해 주세요.';
      case 'RETRY_LOCKED': return `${res.retryDate}부터 다시 도전할 수 있어요. 그동안 책을 한 번 더 읽어 보세요.`;
      case 'QUIZ_NOT_FOUND': return '이 책의 퀴즈를 찾지 못했어요. 선생님께 알려 주세요.';
      case 'INVALID_ANSWERS': return '모든 문제에 답해 주세요.';
      default: return '퀴즈 결과를 확인하지 못했어요. 독서 기록에서 저장 여부를 확인한 뒤 다시 시도해 주세요.';
    }
  }
  return {normalizeTitle, findQuizBook, bookLabel, errorMessage};
});
