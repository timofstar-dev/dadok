const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const Avatar=require('../avatar');
const JourneyModel=require('../journey-model');
const root=path.join(__dirname,'..');
const config=require('../school-config.json');

test('the vehicle changes at every continent and a full trip rides a rocket',()=>{
  const at=steps=>Avatar.VEHICLES[Avatar.vehicleIndex(JourneyModel.getJourney(steps))].name;
  assert.deepEqual([0,699,700,900,1600,1800,2300,3000,9000].map(at),['걸어서','걸어서','자전거','자동차','배','기차','비행기','우주선','우주선']);
});

test('only known looks are drawn; anything else falls back to the default',()=>{
  assert.deepEqual(Avatar.normalize({body:'robot',skin:'<script>',hair:'x',hairColor:99}),Avatar.DEFAULT_LOOK);
  assert.deepEqual(Avatar.normalize({body:'girl',skin:3,hair:'curly',hairColor:'4'}),{body:'girl',skin:3,hair:'curly',hairColor:4});
  assert.equal(Avatar.describe({body:'girl',skin:0,hair:'long',hairColor:3}),'여자 탐험가, 밝은 피부, 금색 긴 머리');
});

const ROSTER={4:{아시아반:['누리','다온']},5:{아프리카반:['가람']}};
const LOGS=[['2026-10-01','4학년','아시아반','누리','책',100,'2점',950],['2026-10-02','5학년','아프리카반','가람','책',100,'2점',120]];

async function app(t,{explorers=[],post=()=>({success:true})}={}) {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://dadok.test/',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window, posts=[];
  w.structuredClone=structuredClone; w.ResizeObserver=class {observe(){}};
  w.matchMedia=()=>({matches:false}); w.HTMLElement.prototype.scrollIntoView=()=>{};
  const reply=data=>({ok:true,json:async()=>data});
  w.fetch=async(url,init)=>{
    if(init?.method==='POST'){const body=JSON.parse(init.body);posts.push(body);return reply(await post(body));}
    if(url==='school-config.json')return reply({...config,rosterYear:2026});
    if(url.includes('action=getStudentDB'))return reply(ROSTER);
    if(url.includes('action=getFullData'))return reply({logs:LOGS,allRequiredBooks:{}});
    if(url.includes('action=getQuizBooks'))return reply({books:[]});
    if(url.includes('action=getExplorers'))return reply({explorers});
    throw new Error(url);
  };
  for(const file of ['class-theme.js','avatar.js','journey-model.js','journey.js','school-model.js','quiz-model.js','app.js']){const s=w.document.createElement('script');s.textContent=fs.readFileSync(path.join(root,file),'utf8');w.document.body.append(s);}
  const init=w.onload;w.onload=null;await init();
  const $=id=>w.document.getElementById(id);
  $('yearFilter').value='2026';w.selectYear();
  const marker=name=>[...$('markerLayer').children].find(m=>m.querySelector('.traveler-name').textContent===name);
  return {w,$,posts,marker};
}

test('the map shows each explorer on the vehicle of their continent, in their saved look',async t=>{
  const a=await app(t,{explorers:[{name:'누리',grade:4,className:'아시아반',look:{body:'girl',skin:3,hair:'long',hairColor:3}}]});
  assert.match(a.marker('누리').getAttribute('aria-label'),/자동차 · 북아메리카에서 남아메리카/);
  assert.match(a.marker('가람').getAttribute('aria-label'),/걸어서 · 아시아/);
  assert.match(a.marker('누리').querySelector('svg').innerHTML,/#9C6A47/,'saved skin colour');
  assert.doesNotMatch(a.marker('다온').querySelector('svg').innerHTML,/#9C6A47/,'others use the default look');
});

test('a character saved before promotion still belongs to the only student with that name',async t=>{
  const a=await app(t,{explorers:[{name:'가람',grade:4,className:'아시아반',look:{body:'girl',skin:2,hair:'bob',hairColor:2}}]});
  assert.match(a.marker('가람').querySelector('svg').innerHTML,/#D9A27A/);
});

test('the explorer detail shows the current vehicle, the next one and the ladder',async t=>{
  const a=await app(t);
  a.marker('누리').onclick();
  assert.equal(a.$('detailVehicle').textContent,'지금 탈것: 자동차 · 남아메리카에 도착하면 배로 갈아타요');
  assert.deepEqual([...a.$('journeyVehicles').children].map(li=>li.className.replace('vehicle-step is-','')),['done','done','now','locked','locked','locked','locked']);
  assert.ok(a.$('detailPortrait').querySelector('svg[role="img"]'));
});

test('a student can make a character and the map updates without reloading',async t=>{
  const a=await app(t,{post:body=>({success:true,look:body.look})});
  a.marker('누리').onclick();
  a.$('changeExplorer').onclick();
  assert.equal(a.$('explorerModal').classList.contains('is-active'),true);
  assert.equal(JSON.parse(a.$('explorerStudent').value)[2],'누리','opened for the selected explorer');
  const pick=(id,i)=>a.$(id).children[i].onclick();
  pick('explorerBody',1); pick('explorerSkin',3); pick('explorerHair',3); pick('explorerHairColor',4);
  assert.equal(a.$('explorerHair').children[3].getAttribute('aria-pressed'),'true');
  assert.match(a.$('explorerPreview').querySelector('svg').getAttribute('aria-label'),/여자 탐험가, 진한 피부, 보라색 곱슬/);
  await a.$('explorerForm').onsubmit({preventDefault(){}});
  assert.deepEqual(a.posts[0],{action:'saveExplorer',grade:'4',className:'아시아반',studentName:'누리',look:{body:'girl',skin:3,hair:'curly',hairColor:4}});
  assert.equal(a.$('explorerModal').classList.contains('is-active'),false);
  assert.match(a.marker('누리').querySelector('svg').innerHTML,/#7A4FA0/,'new hair colour on the map');
  assert.match(a.$('journeyStatus').textContent,/누리 탐험가의 새 모습을 저장했어요/);
});

test('saving without a name or with a server error keeps the dialog open with a reason',async t=>{
  const a=await app(t,{post:()=>({success:false,error:'INVALID_STUDENT'})});
  a.$('openExplorerMaker').onclick();
  await a.$('explorerForm').onsubmit({preventDefault(){}});
  assert.match(a.$('explorerStatus').textContent,/이름을 먼저 골라/);
  assert.equal(a.posts.length,0);
  a.$('explorerStudent').value=a.$('explorerStudent').options[1].value; a.$('explorerStudent').onchange();
  await a.$('explorerForm').onsubmit({preventDefault(){}});
  assert.match(a.$('explorerStatus').textContent,/명단에서 이 이름을 찾지 못했어요/);
  assert.equal(a.$('explorerModal').classList.contains('is-active'),true);
});
