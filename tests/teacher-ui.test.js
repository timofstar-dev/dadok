const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');

const book=(id,status,extra={})=>({id,title:`책 ${id}`,author:'지은이',level:4,status,memo:'',questions:[{text:'질문',choices:['가','나','다',''],answer:2}],...extra});

async function page(t,server) {
  const html=fs.readFileSync(path.join(root,'teacher.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://dadok.test/teacher.html'});
  t.after(()=>dom.window.close());
  const w=dom.window, calls=[];
  w.confirm=()=>true;
  w.fetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);return {ok:true,json:async()=>server(body,calls)};};
  const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(root,'teacher.js'),'utf8');w.document.body.append(script);
  const $=id=>w.document.getElementById(id);
  const flush=()=>new Promise(r=>setTimeout(r,0));
  return {w,$,calls,flush,
    login:async pw=>{$('passwordInput').value=pw;await $('loginForm').onsubmit({preventDefault(){}});},
    click:async id=>{await $(id).onclick();await flush();}};
}

test('a wrong password keeps the page locked and forgets the password',async t=>{
  const p=await page(t,()=>({success:false,error:'WRONG_PASSWORD'}));
  await p.login('nope');
  assert.equal(p.$('appView').hidden,true);
  assert.match(p.$('loginStatus').textContent,/비밀번호가 맞지 않아요/);
  assert.equal(p.calls[0].password,'nope');
  assert.equal(p.w.sessionStorage.length+p.w.localStorage.length,0,'password is never stored');
});

test('after login teachers see every quiz with status and the open requests',async t=>{
  const p=await page(t,()=>({success:true,books:[book('Q006','검토중',{memo:'5번 확인'}),book('Q007','승인')],requests:[{title:'만복이네 떡집(김리리)',count:2,latest:'3학년 아시아반 누리',status:'요청'}]}));
  await p.login('teacher-pass');
  assert.equal(p.$('appView').hidden,false);
  assert.equal(p.$('passwordInput').value,'','field is cleared');
  const cards=[...p.w.document.querySelectorAll('.book-card')].map(c=>c.textContent);
  assert.match(cards[0],/책 Q006.*검토중.*4단계 · 1문제.*5번 확인/);
  p.$('statusFilter').value='승인';p.$('statusFilter').onchange();
  assert.equal(p.w.document.querySelectorAll('.book-card').length,1);
  assert.match(p.$('requestList').textContent,/만복이네 떡집\(김리리\).*2명/);
});

test('editing a quiz shows the answer and saves the edited questions',async t=>{
  let saved;
  const p=await page(t,body=>{
    if(body.action==='teacherSaveQuiz'){saved=body;return {success:true,id:'Q006'};}
    if(body.action==='teacherSetStatus') return {success:true};
    return {success:true,books:[book('Q006',saved && body.action==='teacherOverview' && p.calls.some(c=>c.action==='teacherSetStatus')?'승인':'검토중')],requests:[]};
  });
  await p.login('teacher-pass');
  p.w.document.querySelector('.book-card').onclick();
  assert.equal(p.$('editorView').hidden,false);
  assert.equal(p.$('edTitle').value,'책 Q006');
  assert.equal(p.w.document.querySelector('input[name="answer-0"][value="2"]').checked,true);
  p.w.document.querySelector('.question-text').value='고친 질문';
  p.w.document.querySelector('input[name="answer-0"][value="3"]').checked=true;
  await p.click('addQuestionBtn');
  const second=p.w.document.querySelectorAll('.question-item')[1];
  second.querySelector('.question-text').value='새 질문';
  second.querySelectorAll('.choice-text')[0].value='예';second.querySelectorAll('.choice-text')[1].value='아니요';
  second.querySelector('input[value="1"]').checked=true;
  await p.click('approveBtn');
  assert.deepEqual(saved.book,{id:'Q006',title:'책 Q006',author:'지은이',level:'4',memo:''});
  assert.deepEqual(saved.questions,[{text:'고친 질문',choices:['가','나','다',''],answer:3},{text:'새 질문',choices:['예','아니요','',''],answer:1}]);
  assert.deepEqual(p.calls.find(c=>c.action==='teacherSetStatus'),{action:'teacherSetStatus',password:'teacher-pass',bookId:'Q006',status:'승인'});
  assert.match(p.$('editorStatus').textContent,/승인했어요/);
  assert.equal(p.$('editorBadge').textContent,'승인');
});

test('server validation is explained and nothing changes status',async t=>{
  const p=await page(t,body=>body.action==='teacherSaveQuiz'?{success:false,error:'INVALID_QUESTION',number:2}:{success:true,books:[book('Q006','검토중')],requests:[]});
  await p.login('teacher-pass');
  await p.click('newQuizBtn');
  assert.match(p.$('editorHeading').textContent,/새 퀴즈/);
  await p.click('approveBtn');
  assert.match(p.$('editorStatus').textContent,/2번 문제를 확인/);
  assert.equal(p.calls.some(c=>c.action==='teacherSetStatus'),false);
});

test('a request can start a new quiz with the title filled in, or be closed',async t=>{
  const p=await page(t,body=>body.action==='teacherCloseRequest'?{success:true}:{success:true,books:[],requests:body.action==='teacherOverview'&&p.calls.some(c=>c.action==='teacherCloseRequest')?[]:[{title:'만복이네 떡집(김리리)',count:2,latest:'',status:'요청'}]});
  await p.login('teacher-pass');
  const [make,done]=p.$('requestList').querySelectorAll('button');
  make.onclick();
  assert.equal(p.$('edTitle').value,'만복이네 떡집');
  assert.equal(p.$('edAuthor').value,'김리리');
  p.$('backBtn').onclick();
  await done.onclick();
  assert.equal(p.calls.at(-2).action,'teacherCloseRequest');
  assert.match(p.$('globalStatus').textContent,/완료로 바꿨어요/);
  assert.match(p.$('requestList').textContent,/열려 있는 출제 요청이 없어요/);
});
