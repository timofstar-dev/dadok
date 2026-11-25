const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const config=require('../school-config.json');

// Roster keys arrive in no particular order; classes must follow their lowest grade.
const ROSTER={11:{아틀랜틱반:['하늘']},3:{아시아반:['다온']},9:{유럽반:['마루']},2:{오세아니아반:['나래']},7:{아메리카반:['라온']},1:{오세아니아반:['가람']},6:{아프리카반:['바다']},5:{아프리카반:['사랑']},4:{아시아반:['아라']}};
const ORDER=['오세아니아반','아시아반','아프리카반','아메리카반','유럽반','아틀랜틱반'];

test('dashboards list classes from the youngest grade to the oldest',async t=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://dadok.test/'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.structuredClone=structuredClone; w.ResizeObserver=class {observe(){}};
  const reply=data=>({ok:true,json:async()=>data});
  w.fetch=async url=>{
    if(url==='school-config.json')return reply({...config,rosterYear:2026});
    if(url.includes('action=getStudentDB'))return reply(ROSTER);
    if(url.includes('action=getFullData'))return reply({logs:[],allRequiredBooks:{}});
    if(url.includes('action=getQuizBooks'))return reply({books:[]});
    throw new Error(url);
  };
  for(const file of ['journey-model.js','journey.js','school-model.js','quiz-model.js','app.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(root,file),'utf8');w.document.body.append(s);}
  const init=w.onload;w.onload=null;await init();
  const $=id=>w.document.getElementById(id);
  $('yearFilter').value='2026';w.selectYear();

  assert.deepEqual([...$('dashClassSelect').options].slice(1).map(o=>o.value),ORDER);
  assert.deepEqual([...$('classFilter').options].map(o=>o.value),ORDER);
  assert.deepEqual([...$('monthlyClassSteps').querySelectorAll('h4')].map(h=>h.textContent),ORDER);
  const rows=[...$('classTableBody').rows].map(r=>[r.cells[0].textContent,r.cells[2].textContent]);
  assert.deepEqual(rows.map(r=>r[0]),['오세아니아반','오세아니아반','아시아반','아시아반','아프리카반','아프리카반','아메리카반','유럽반','아틀랜틱반']);
  assert.deepEqual(rows.slice(0,2).map(r=>r[1]),['가람 (1학년)','나래 (2학년)'],'grade order inside a class');
  assert.deepEqual([...$('journeyClassLegend').textContent.matchAll(/(.+?반)/g)].map(m=>m[1]),ORDER);
});
