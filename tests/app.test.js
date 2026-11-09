const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const config=require('../school-config.json');

async function app(t, post, options={}) {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://dadok.test/'});
  t.after(()=>dom.window.close());
  const w=dom.window, db={7:{바뀐반:['가람']}};
  w.structuredClone=structuredClone;
  w.ResizeObserver=class {observe(){}};
  let writes=0,reads=0;
  const reply=(data,ok=true)=>({ok,json:async()=>data});
  w.fetch=async(url,init)=>{
    if(init?.method==='POST'){writes++;const payload=JSON.parse(init.body);assert.equal(payload.date,'2026-11-09');assert.equal(payload.recordDate,undefined);return post(init);}
    if(url==='school-config.json')return reply({...config,rosterYear:2026});
    if(url.includes('action=getStudentDB'))return reply(db);
    if(url.includes('action=getFullData')){
      reads++;
      if(options.failRefresh && reads>1) throw new Error('offline');
      return reply({logs:[['2026-10-01','7','바뀐반','가람','올해 책',10,'2점',30],['2025-10-01','6','옛반','가람','지난해 책',10,'2점',900],['2027-01-01','7','바뀐반','가람','겨울 책',10,'2점',20],['2026-10-01','7','바뀐반','명단에서 제외된 친구','과거 입력',10,'2점',9999]],allRequiredBooks:{}});
    }
    throw new Error(`Unexpected request ${url}`);
  };
  for(const file of ['journey-model.js','journey.js','school-model.js','app.js']) {const script=w.document.createElement('script');script.textContent=fs.readFileSync(path.join(root,file),'utf8');w.document.body.append(script);}
  const init=w.onload;w.onload=null;await init();
  w.document.getElementById('recordDateInput').value='2026-11-09';w.updateFormRoster();
  w.document.getElementById('gradeSelect').value='7';w.updateClassList();
  w.document.getElementById('studentSelect').value='가람';
  w.document.getElementById('bookTitleInput').value='입력 보존';
  w.document.getElementById('pagesInput').value='50';
  return {w,$:id=>w.document.getElementById(id),submit:()=>w.document.getElementById('readingForm').onsubmit({preventDefault(){}}),writes:()=>writes};
}

test('class selection comes from the roster and every view separates school years',async t=>{
  const a=await app(t,()=>{throw new Error('No writes expected');});
  assert.equal(a.$('classSelect').value,'바뀐반');
  assert.equal(a.$('studentSelect').disabled,false);
  a.$('yearFilter').value='2026';a.w.selectYear();
  assert.match(a.$('allTop3').textContent,/50걸음/);
  assert.equal(a.$('expeditionCount').textContent,'1');
  assert.equal(a.$('locateTraveler').options.length,2);
  for(const id of ['allTop3','classTop3','monthTop3','monthlyClassSteps','classTableBody','locateTraveler']) assert.doesNotMatch(a.$(id).textContent,/명단에서 제외된 친구/);
  assert.doesNotMatch(a.$('classTableBody').textContent,/지난해 책/);
  a.$('yearFilter').value='2025';a.w.selectYear();
  assert.match(a.$('allTop3').textContent,/900걸음/);
  assert.match(a.$('classTableBody').textContent,/옛반/);
  a.$('yearFilter').value='2026';a.w.selectYear();
  a.$('monthFilter').value='1';a.w.renderMonthlyLeaderboard();
  assert.match(a.$('monthTop3').textContent,/20걸음/);
  assert.equal(a.writes(),0);
});
for(const [name,response] of [['HTTP failure',{ok:false,json:async()=>({steps:30})}],['error JSON',{ok:true,json:async()=>({success:false,error:'rejected',steps:30})}],['unconfirmed JSON',{ok:true,json:async()=>({message:'unknown'})}],['invalid JSON',{ok:true,json:async()=>{throw new Error('invalid JSON');}}]]) {
  test(`${name} preserves inputs and never opens the success modal`,async t=>{
    const a=await app(t,async()=>response);await a.submit();
    assert.equal(a.$('bookTitleInput').value,'입력 보존');
    assert.equal(a.$('pagesInput').value,'50');
    assert.equal(a.$('successModal').classList.contains('is-active'),false);
    assert.match(a.$('saveStatus').textContent,/확인하지 못/);
    assert.equal(a.$('submitBtn').disabled,false);
  });
}
test('double submit sends once; a subsequent refresh failure does not report a failed save',async t=>{
  let release;
  const pending=new Promise(resolve=>release=resolve);
  const a=await app(t,async()=>{await pending;return {ok:true,json:async()=>({steps:35})};},{failRefresh:true});
  const first=a.submit();await a.submit();assert.equal(a.writes(),1);
  release();await first;
  assert.equal(a.$('bookTitleInput').value,'');
  assert.equal(a.$('successModal').classList.contains('is-active'),true);
  assert.match(a.$('saveStatus').textContent,/저장은 완료/);
  assert.equal(a.$('acquiredSteps').textContent,'35');
});
