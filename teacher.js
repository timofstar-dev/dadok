'use strict';
// 선생님 퀴즈 관리 화면. 학생 화면(app.js)과 같은 Apps Script 배포를 씁니다.
// 비밀번호는 메모리에만 두고 저장하지 않습니다. 모든 권한 확인은 서버가 합니다.
const TEACHER_API_URL = 'https://script.google.com/macros/s/AKfycby6p6rz82mRayL_v6uUquzeeT31WZSSKKbsKGF07r9eFQe7ocrl-3gtNG7oMeWZA0xU/exec';
const $ = id => document.getElementById(id);
const STATUSES = {검토중: 'is-review', 승인: 'is-approved', 보류: 'is-hold'};
const MESSAGES = {
  WRONG_PASSWORD: '비밀번호가 맞지 않아요.',
  TEACHER_NOT_CONFIGURED: '선생님 비밀번호가 아직 설정되지 않았어요. Apps Script 편집기의 프로젝트 설정 > 스크립트 속성에 TEACHER_PASSWORD를 추가해 주세요.',
  TOO_MANY_ATTEMPTS: '비밀번호가 여러 번 틀려서 15분 동안 잠겼어요. 잠시 뒤 다시 시도해 주세요.',
  TITLE_REQUIRED: '책 제목을 입력해 주세요.',
  INVALID_LEVEL: '단계는 1~12 사이 숫자로 입력해 주세요.',
  QUESTIONS_REQUIRED: '문제를 하나 이상 만들어 주세요.',
  TOO_MANY_QUESTIONS: '문제는 30개까지 만들 수 있어요.',
  DUPLICATE_TITLE: '같은 제목의 퀴즈가 이미 있어요. 목록에서 그 퀴즈를 열어 고쳐 주세요.',
  NO_VALID_QUESTIONS: '올바른 문제가 없어서 승인할 수 없어요.',
  QUIZ_NOT_FOUND: '퀴즈를 찾지 못했어요. 목록을 새로 불러왔으니 다시 열어 주세요.',
  REQUEST_NOT_FOUND: '이미 처리된 요청이에요.',
};
let password = '', overview = {books: [], requests: []}, editing = null, dirty = false, busy = false;

function errorMessage(res) {
  if (res?.error === 'INVALID_QUESTION') return `${res.number}번 문제를 확인해 주세요. 문제, 보기 2개 이상, 정답이 모두 있어야 하고 정답 보기는 비어 있으면 안 돼요.`;
  return MESSAGES[res?.error] || '서버 응답을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
}
async function call(action, payload = {}) {
  const response = await fetch(TEACHER_API_URL, {method: 'POST', body: JSON.stringify({action, password, ...payload}), signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('NETWORK');
  return response.json();
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#appView button, #loginBtn').forEach(b => { b.disabled = value; });
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function badge(status) { return el('span', `status-badge ${STATUSES[status] || ''}`, status || '검토중'); }

async function loadOverview() {
  const res = await call('teacherOverview');
  if (!res?.success) throw Object.assign(new Error('REJECTED'), {res});
  overview = {books: res.books || [], requests: res.requests || []};
  renderList();
}

$('loginForm').onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  password = $('passwordInput').value;
  setBusy(true); $('loginStatus').textContent = '확인하고 있어요.';
  try {
    await loadOverview();
    $('passwordInput').value = '';
    $('loginView').hidden = true; $('appView').hidden = false; $('loginStatus').textContent = '';
    $('quizHeading').focus?.();
  } catch (error) {
    password = '';
    $('loginStatus').textContent = errorMessage(error.res);
  } finally { setBusy(false); }
};

function renderList() {
  const filter = $('statusFilter').value, list = $('bookList');
  list.replaceChildren();
  overview.books.filter(b => !filter || b.status === filter).forEach(book => {
    const item = el('li'), button = el('button', 'book-card');
    button.type = 'button';
    const head = el('span', 'book-card-head');
    head.append(el('strong', '', book.author ? `${book.title} (${book.author})` : book.title), badge(book.status));
    button.append(head, el('span', 'book-card-meta', `${book.level ? `${book.level}단계 · ` : ''}${book.questions.length}문제 · ${book.id}`));
    if (book.memo) button.append(el('span', 'book-card-memo', book.memo));
    button.onclick = () => openEditor(book);
    item.append(button); list.append(item);
  });
  if (!list.childElementCount) list.append(el('li', 'empty-note', filter ? `${filter} 상태인 퀴즈가 없어요.` : '아직 퀴즈가 없어요. ‘새 퀴즈’로 만들어 보세요.'));

  const body = $('requestList');
  body.replaceChildren();
  overview.requests.forEach(request => {
    const row = body.insertRow();
    row.insertCell().textContent = request.title;
    row.insertCell().textContent = `${request.count}명`;
    row.insertCell().textContent = request.latest;
    const actions = row.insertCell(); actions.className = 'request-actions';
    const make = el('button', 'button is-small is-info is-light', '퀴즈 만들기'); make.type = 'button';
    make.onclick = () => openEditor({id: '', title: request.title.replace(/\s*[(\[].*$/, ''), author: (/\(([^)]*)\)/.exec(request.title) || [])[1] || '', level: null, status: '검토중', memo: '', questions: []});
    const done = el('button', 'button is-small is-light', '완료'); done.type = 'button';
    done.onclick = () => closeRequest(request.title);
    actions.append(make, done);
  });
  if (!body.rows.length) { const cell = body.insertRow().insertCell(); cell.colSpan = 4; cell.className = 'empty-note'; cell.textContent = '열려 있는 출제 요청이 없어요.'; }
}
$('statusFilter').onchange = renderList;

function questionBlock(question, index) {
  const item = el('li', 'question-item'), set = el('fieldset');
  const legend = el('legend', '', `${index + 1}번 문제`);
  const text = el('textarea', 'textarea question-text'); text.rows = 2; text.value = question.text || ''; text.setAttribute('aria-label', `${index + 1}번 문제 내용`);
  set.append(legend, text);
  for (let i = 0; i < 4; i++) {
    const row = el('div', 'choice-row'), radio = el('input'), input = el('input', 'input is-small choice-text');
    radio.type = 'radio'; radio.name = `answer-${index}`; radio.value = String(i + 1); radio.checked = question.answer === i + 1;
    radio.setAttribute('aria-label', `${index + 1}번 문제 정답: 보기 ${i + 1}`);
    input.value = question.choices?.[i] || ''; input.placeholder = `보기 ${i + 1}${i >= 2 ? ' (선택)' : ''}`; input.setAttribute('aria-label', `${index + 1}번 문제 보기 ${i + 1}`);
    row.append(radio, input); set.append(row);
  }
  const remove = el('button', 'button is-small is-white remove-question', '이 문제 지우기'); remove.type = 'button';
  remove.onclick = () => { const all = collectQuestions(); all.splice(index, 1); renderQuestions(all); dirty = true; };
  set.append(remove); item.append(set);
  return item;
}
function renderQuestions(questions) {
  $('questionList').replaceChildren(...questions.map(questionBlock));
}
function collectQuestions() {
  return [...$('questionList').children].map(item => ({
    text: item.querySelector('.question-text').value.trim(),
    choices: [...item.querySelectorAll('.choice-text')].map(input => input.value.trim()),
    answer: Number(item.querySelector('input[type=radio]:checked')?.value) || null,
  }));
}
function openEditor(book) {
  editing = {id: book.id, status: book.status || '검토중'};
  $('editorHeading').textContent = book.id ? `퀴즈 편집 · ${book.id}` : '새 퀴즈';
  $('editorBadge').replaceWith(Object.assign(badge(editing.status), {id: 'editorBadge'}));
  $('edTitle').value = book.title || ''; $('edAuthor').value = book.author || ''; $('edLevel').value = book.level || ''; $('edMemo').value = book.memo || '';
  renderQuestions(book.questions.length ? book.questions : [{text: '', choices: ['', '', '', ''], answer: null}]);
  $('editorStatus').textContent = ''; $('globalStatus').textContent = '';
  $('listView').hidden = true; $('editorView').hidden = false; dirty = false;
  $('editorHeading').focus();
}
function closeEditor() {
  if (dirty && !confirm('저장하지 않은 내용이 있어요. 목록으로 돌아갈까요?')) return;
  editing = null; dirty = false;
  $('editorView').hidden = true; $('listView').hidden = false;
}
$('editorView').addEventListener('input', () => { dirty = true; });
$('editorView').addEventListener('change', () => { dirty = true; });
$('backBtn').onclick = closeEditor;
$('newQuizBtn').onclick = () => openEditor({id: '', title: '', author: '', level: null, status: '검토중', memo: '', questions: []});
$('addQuestionBtn').onclick = () => {
  const all = collectQuestions();
  all.push({text: '', choices: ['', '', '', ''], answer: null});
  renderQuestions(all); dirty = true;
  $('questionList').lastElementChild.querySelector('textarea').focus();
};

// 저장한 뒤 필요하면 상태를 바꿉니다. 승인된 퀴즈를 고치면 학생 화면에 바로 반영됩니다.
async function save(nextStatus) {
  if (busy || !editing) return;
  setBusy(true); $('editorStatus').textContent = '저장하고 있어요.';
  try {
    const book = {id: editing.id, title: $('edTitle').value.trim(), author: $('edAuthor').value.trim(), level: $('edLevel').value.trim(), memo: $('edMemo').value.trim()};
    const saved = await call('teacherSaveQuiz', {book, questions: collectQuestions()});
    if (!saved?.success) { $('editorStatus').textContent = errorMessage(saved); return; }
    editing.id = saved.id; dirty = false;
    let message = '저장했어요.';
    if (nextStatus && nextStatus !== editing.status) {
      const changed = await call('teacherSetStatus', {bookId: saved.id, status: nextStatus});
      if (!changed?.success) message = `저장은 했지만 상태를 바꾸지 못했어요. ${errorMessage(changed)}`;
      else message = nextStatus === '승인' ? '저장하고 승인했어요. 이제 학생들이 이 퀴즈를 풀 수 있어요.' : `저장하고 ‘${nextStatus}’ 상태로 바꿨어요. 학생에게는 보이지 않아요.`;
    }
    await loadOverview();
    const fresh = overview.books.find(b => b.id === saved.id);
    if (fresh) openEditor(fresh);
    $('editorStatus').textContent = message;
  } catch (error) {
    if (error.res) { $('editorStatus').textContent = errorMessage(error.res); }
    else $('editorStatus').textContent = '저장 결과를 확인하지 못했어요. 목록을 새로 불러와 저장됐는지 확인해 주세요.';
  } finally { setBusy(false); }
}
$('saveBtn').onclick = () => save(null);
$('approveBtn').onclick = () => save('승인');
$('reviewBtn').onclick = () => save('검토중');
$('holdBtn').onclick = () => save('보류');

async function closeRequest(title) {
  if (busy) return;
  setBusy(true);
  try {
    const res = await call('teacherCloseRequest', {title});
    await loadOverview();
    $('globalStatus').textContent = res?.success ? `‘${title}’ 요청을 완료로 바꿨어요.` : errorMessage(res);
  } catch { $('globalStatus').textContent = '요청 처리 결과를 확인하지 못했어요. 새로고침해 주세요.'; }
  finally { setBusy(false); }
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
