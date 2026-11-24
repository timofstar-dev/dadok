const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const QuizModel=require('../quiz-model');
const root=path.join(__dirname,'..');
const config=require('../school-config.json');

const BOOK={id:'B1',title:'어린 왕자',author:'생텍쥐페리',level:4,questionCount:3};
const QUIZ={success:true,book:{id:'B1',title:'어린 왕자',author:'생텍쥐페리',level:4},passScore:60,
  questions:[1,2,3].map(n=>({text:`문제 ${n}`,choices:[1,2,3,4].map(v=>({value:v,text:`보기 ${v}`}))}))};

async function app(t,{books=[BOOK],quiz=QUIZ,post}) {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://dadok.test/'});
  t.after(()=>dom.window.close());
  const w=dom.window, posts=[];
  w.structuredClone=structuredClone;
  w.ResizeObserver=class {observe(){}};
  const reply=data=>({ok:true,json:async()=>data});
  w.fetch=async(url,init)=>{
    if(init?.method==='POST'){const body=JSON.parse(init.body);posts.push(body);return reply(await post(body,posts.length));}
    if(url==='school-config.json')return reply({...config,rosterYear:2026});
    if(url.includes('action=getStudentDB'))return reply({3:{아시아반:['가람']}});
    if(url.includes('action=getFullData'))return reply({logs:[],allRequiredBooks:{}});
    if(url.includes('action=getQuizBooks'))return reply({books});
    if(url.includes('action=getQuiz&'))return reply(quiz);
    throw new Error(`Unexpected request ${url}`);
  };
  for(const file of ['journey-model.js','journey.js','school-model.js','quiz-model.js','app.js']) {const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(root,file),'utf8');w.document.body.append(script);}
  const init=w.onload;w.onload=null;await init();
  const $=id=>w.document.getElementById(id);
  $('recordDateInput').value='2026-11-09';w.updateFormRoster();
  $('gradeSelect').value='3';w.updateClassList();
  $('studentSelect').value='가람';
  $('pagesInput').value='120';
  const type=title=>{$('bookTitleInput').value=title;$('bookTitleInput').dispatchEvent(new w.Event('input'));};
  const choose=answers=>answers.forEach((v,i)=>{w.document.querySelector(`input[name="q${i}"][value="${v}"]`).checked=true;});
  return {w,$,posts,type,choose,
    save:()=>$('readingForm').onsubmit({preventDefault(){}}),
    submitQuiz:()=>$('quizForm').onsubmit.call($('quizForm'),{preventDefault(){}})};
}

test('title hint tells students whether the book has a quiz',async t=>{
  const a=await app(t,{post:()=>{throw new Error('no save');}});
  a.type('어린왕자(생텍쥐페리)');
  assert.equal(a.$('quizHint').hidden,false);
  assert.match(a.$('quizHint').textContent,/퀴즈 인증 도서.*4단계.*3문제/);
  a.type('푸른 사자 와니니');
  assert.match(a.$('quizHint').textContent,/아직 퀴즈가 없는 책/);
  a.type('');
  assert.equal(a.$('quizHint').hidden,true);
});

test('a quiz book opens the quiz first; passing saves and shows the deduction',async t=>{
  const a=await app(t,{post:body=>({success:true,passed:true,score:67,correct:2,total:3,steps:36,deduction:7})});
  a.type('어린 왕자');
  await a.save();
  assert.equal(a.posts.length,0,'nothing is saved before the quiz');
  assert.equal(a.$('quizModal').classList.contains('is-active'),true);
  assert.equal(a.$('quizTitle').textContent,'어린 왕자(생텍쥐페리)');
  assert.equal(a.w.document.querySelectorAll('#quizQuestions fieldset').length,3);

  a.choose([1,2]);
  await a.submitQuiz();
  assert.equal(a.posts.length,0,'unanswered questions block submission');
  assert.match(a.$('quizStatus').textContent,/답하지 않은 문제/);
  assert.equal(a.w.document.querySelectorAll('#quizQuestions fieldset')[2].classList.contains('is-missing'),true);

  a.choose([1,2,3]);
  await a.submitQuiz();
  assert.deepEqual(a.posts[0].answers,[1,2,3]);
  assert.equal(a.posts[0].action,'submitQuiz');
  assert.equal(a.posts[0].bookId,'B1');
  assert.equal(a.posts[0].date,'2026-11-09');
  assert.equal(a.posts[0].studentName,'가람');
  assert.equal(a.$('quizModal').classList.contains('is-active'),false);
  assert.equal(a.$('successModal').classList.contains('is-active'),true);
  assert.equal(a.$('acquiredSteps').textContent,'36');
  assert.match(a.$('successDetail').textContent,/67점 통과.*−7걸음/);
  assert.equal(a.$('bookTitleInput').value,'');
});

test('failing keeps the inputs, saves nothing and shows when to retry',async t=>{
  const a=await app(t,{post:()=>({success:true,passed:false,score:33,correct:1,total:3,passScore:60,retryDate:'2026-12-01'})});
  a.type('어린 왕자');await a.save();
  a.choose([4,4,4]);await a.submitQuiz();
  assert.equal(a.$('successModal').classList.contains('is-active'),false);
  assert.match(a.$('quizStatus').textContent,/33점.*저장되지 않았어요.*2026-12-01/);
  assert.equal(a.$('quizSubmit').disabled,true);
  assert.equal(a.$('bookTitleInput').value,'어린 왕자');
  assert.equal(a.$('pagesInput').value,'120');
  a.w.closeQuiz();
  assert.equal(a.$('quizModal').classList.contains('is-active'),false);
});

test('the server still requires the quiz when this page did not know the book',async t=>{
  const a=await app(t,{books:[],post:body=>body.action==='submitQuiz' ? {success:true,passed:true,score:100,correct:3,total:3,steps:39,deduction:0} : {success:false,error:'QUIZ_REQUIRED',bookId:'B1'}});
  a.type('어린 왕자');await a.save();
  assert.equal(a.posts.length,1);
  assert.equal(a.$('successModal').classList.contains('is-active'),false);
  assert.equal(a.$('quizModal').classList.contains('is-active'),true);
  a.choose([1,1,1]);await a.submitQuiz();
  assert.match(a.$('successDetail').textContent,/만점/);
});

test('a book without a quiz is saved as a reading log with a quiz request',async t=>{
  const a=await app(t,{post:()=>({success:true,steps:32,quizRequested:true})});
  a.type('푸른 사자 와니니');await a.save();
  assert.equal(a.posts[0].action,undefined);
  assert.equal(a.$('successModal').classList.contains('is-active'),true);
  assert.equal(a.$('successDetail').hidden,true);
  assert.match(a.$('saveStatus').textContent,/퀴즈 출제를 선생님께 요청/);
});

test('a locked retry or an already certified book is explained and cannot be resubmitted',async t=>{
  for(const [res,pattern] of [[{success:false,error:'RETRY_LOCKED',retryDate:'2026-12-01'},/2026-12-01부터/],[{success:false,error:'ALREADY_CERTIFIED'},/이미 퀴즈로 인증/]]) {
    const a=await app(t,{post:()=>res});
    a.type('어린 왕자');await a.save();a.choose([1,1,1]);await a.submitQuiz();
    assert.match(a.$('quizStatus').textContent,pattern);
    assert.equal(a.$('quizSubmit').disabled,true);
  }
});

test('title matching ignores the author, spaces and punctuation',()=>{
  const books=[{title:'어린 왕자'}];
  for(const title of ['어린왕자(생텍쥐페리)',' 어린 왕자 ','어린왕자!','어린왕자 (생텍쥐페리']) assert.ok(QuizModel.findQuizBook(books,title),title);
  assert.equal(QuizModel.findQuizBook(books,'어린 왕자 2'),null);
  assert.equal(QuizModel.findQuizBook(books,''),null);
});
