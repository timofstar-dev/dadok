'use strict';
const API_URL = 'https://script.google.com/macros/s/AKfycby6p6rz82mRayL_v6uUquzeeT31WZSSKKbsKGF07r9eFQe7ocrl-3gtNG7oMeWZA0xU/exec';
const $ = id => document.getElementById(id);
let studentDB = {}, baseStudentDB = {}, allLogs = [], globalData = [], allRequiredBooks = {};
let config, selectedYear, journeyDataReady = false, saving = false, currentProfileLogs = [];
let currentZoom = 100, bookConfigYear;

function today() {
  const p = SchoolModel.dateParts(new Date());
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}
function setTodayDate() { $('recordDateInput').value = today(); }
function dateLabel(value) {
  const p = SchoolModel.dateParts(value);
  return p ? `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}` : '-';
}
function stepsOf(row) { return Number.isFinite(Number(row[7])) ? Number(row[7]) : 0; }
function options(id, values, placeholder) {
  const el = $(id), previous = el.value;
  el.replaceChildren();
  if (placeholder) el.add(new Option(placeholder, ''));
  values.forEach(value => el.add(new Option(value, value)));
  if (values.includes(previous)) el.value = previous;
  else if (placeholder) el.value = '';
}
function classNames(db) {
  return [...new Set(Object.values(db).flatMap(groups => Object.keys(groups || {})))].sort((a,b) => a.localeCompare(b,'ko'));
}
function inputRoster() {
  return config ? SchoolModel.rosterForYear(baseStudentDB, SchoolModel.schoolYear($('recordDateInput').value, config), config) : {};
}
function updateFormRoster() {
  const db = inputRoster();
  options('gradeSelect', Object.keys(db).sort((a,b)=>Number(a)-Number(b)), '학년 선택');
  for (const option of $('gradeSelect').options) if (option.value) option.textContent = `${option.value}학년`;
  updateClassList();
}
function updateClassList() {
  const groups = inputRoster()[$('gradeSelect').value] || {};
  const names = Object.keys(groups);
  options('classSelect', names, '반 선택');
  $('classSelect').disabled = names.length === 0;
  if (names.length === 1) $('classSelect').value = names[0];
  updateStudentList();
}
function updateStudentList() {
  const names = inputRoster()[$('gradeSelect').value]?.[$('classSelect').value] || [];
  options('studentSelect', names, '이름 선택');
  $('studentSelect').disabled = names.length === 0;
}
function openTab(e, id) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.toggle('is-active-content', el.id === id));
  document.querySelectorAll('.tabs li').forEach(el => el.classList.toggle('is-active', el === e.currentTarget));
  if (id === 'dashboard-tab') { renderClassTable(); fitMap(); }
}
function fitMap() {
  const viewport = document.querySelector('.map-viewport');
  if (!viewport.clientWidth) return;
  const fit = Math.min(1200, viewport.clientWidth);
  const width = fit * currentZoom / 100;
  $('mapZoomWrapper').style.width = `${width}px`;
  $('mapZoomWrapper').style.setProperty('--map-scale', width / 1200);
  $('mapZoomWrapper').classList.toggle('map-overview', width < 700);
  $('zoomLevel').textContent = `${currentZoom}%`;
}
function changeZoom(delta) { currentZoom = Math.min(500, Math.max(100, currentZoom + Math.round(delta * 100))); fitMap(); }
function resetZoom() { currentZoom = 100; fitMap(); document.querySelector('.map-viewport').scrollTo({left:0, top:0}); }
function zoomForNames() {
  const viewport=document.querySelector('.map-viewport');
  currentZoom=Math.min(500,Math.ceil(1200/Math.max(1,Math.min(1200,viewport.clientWidth))*100)); fitMap();
  const point=JourneyUI.selectedPosition() || {x:960,y:235};
  const width=$('mapZoomWrapper').getBoundingClientRect().width;
  viewport.scrollTo({left:point.x*width/1200-viewport.clientWidth/2,top:point.y*width/1200-viewport.clientHeight/2});
}
function closeSuccessModal() { $('successModal').classList.remove('is-active'); }
async function readJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('READ_FAILED');
  return response.json();
}
async function loadGlobalData() {
  const res = await readJSON(`${API_URL}?action=getFullData`);
  if (!Array.isArray(res.logs)) throw new Error('INVALID_LOGS');
  allLogs = res.logs;
  allRequiredBooks = res.allRequiredBooksByYear || {[res.requiredBooksYear || config.rosterYear]:res.allRequiredBooks || {}};
  bookConfigYear = Number(res.requiredBooksYear || config.rosterYear);
  journeyDataReady = true;
  const current = SchoolModel.schoolYear(today(), config);
  const years = [...new Set([current, config.rosterYear, ...Object.keys(config.rostersByYear || {}).map(Number), ...allLogs.map(r => SchoolModel.schoolYear(r[0], config)).filter(Number.isInteger)])].sort((a,b)=>b-a);
  selectedYear ??= current;
  $('yearFilter').replaceChildren(...years.map(y => new Option(`${y}학년도`, y, false, y === selectedYear)));
  selectYear();
}
function selectYear() {
  if (!journeyDataReady) return;
  selectedYear = Number($('yearFilter').value);
  const yearLogs = SchoolModel.filterYear(allLogs, selectedYear, config);
  const roster = SchoolModel.rosterForYear(baseStudentDB, selectedYear, config);
  // An available official roster is authoritative, including an explicitly empty one.
  // Only older years without a roster may reconstruct their historical membership.
  const hasOfficialRoster = selectedYear >= Number(config.rosterYear) || Object.hasOwn(config.rostersByYear || {}, selectedYear);
  studentDB = hasOfficialRoster ? roster : SchoolModel.mergeRecordedRoster({}, yearLogs);
  globalData = SchoolModel.filterRoster(yearLogs, studentDB);
  $('yearPeriod').textContent = `${selectedYear}-03-01 ~ ${selectedYear + 1}-02-${new Date(Date.UTC(selectedYear + 1, 2, 0)).getUTCDate()} · 이 기간의 기록만 집계합니다.`;
  const names = classNames(studentDB);
  options('classFilter', names);
  const previousGroup = $('dashClassSelect').value;
  $('dashClassSelect').replaceChildren(new Option('🌍 전교생 전체 보기', '전체'), ...names.map(c=>new Option(c,c)));
  if (names.includes(previousGroup)) $('dashClassSelect').value = previousGroup;
  const previousMonth = $('monthFilter').value;
  const month = SchoolModel.dateParts(today()).month;
  $('monthFilter').replaceChildren(...[3,4,5,6,7,8,9,10,11,12,1,2].map(m=>new Option(`${m < 3 ? selectedYear + 1 : selectedYear}년 ${m}월`, String(m))));
  $('monthFilter').value = previousMonth || String(month);
  JourneyUI.clearSelection();
  renderAllTimeLeaderboard(); renderMonthlyLeaderboard(); renderClassTable();
}
function rank(list) {
  const stats = new Map();
  list.forEach(r => {
    const key = JSON.stringify([SchoolModel.gradeNumber(r[1]), r[2], r[3]]);
    const value = stats.get(key) || {name:r[3], steps:0};
    value.steps += stepsOf(r); stats.set(key,value);
  });
  return [...stats.values()].sort((a,b)=>b.steps-a.steps || a.name.localeCompare(b.name,'ko')).slice(0,3);
}
function renderRank(id, list) {
  $(id).replaceChildren();
  rank(list).forEach((u,i)=>{ const p=document.createElement('p'); p.textContent=`${i+1}위 ${u.name} (${u.steps.toLocaleString()}걸음)`; $(id).append(p); });
  if (!$(id).childElementCount) $(id).textContent='기록 없음';
}
function renderAllTimeLeaderboard() {
  renderRank('allTop3',globalData);
  renderRank('classTop3',globalData.filter(r=>r[2] === $('classFilter').value));
}
function renderMonthlyLeaderboard() {
  const month = Number($('monthFilter').value);
  const logs = globalData.filter(r=>SchoolModel.dateParts(r[0])?.month === month);
  renderRank('monthTop3',logs);
  const monthlyBooks = allRequiredBooks[selectedYear]?.[`${month}월`] || {};
  const readers = new Set();
  logs.forEach(r=>{
    const target=monthlyBooks[r[2]], title=String(r[4] || '').replace(/\s/g,'');
    if (typeof target === 'string' && target.split(',').some(b=>{const t=b.replace(/\(.*\)/,'').replace(/\s/g,'');return t.length>=2 && title.includes(t);})) readers.add(r[3]);
  });
  $('bookExplorers').replaceChildren();
  readers.forEach(name=>{const span=document.createElement('span');span.className='tag is-success is-light is-medium mr-1 mb-1';span.textContent=name;$('bookExplorers').append(span);});
  if (!readers.size) $('bookExplorers').textContent = !Object.keys(monthlyBooks).length && selectedYear !== bookConfigYear ? '해당 학년도의 필독서가 설정되지 않았습니다.' : '없음';
  const parent=$('monthlyClassSteps'); parent.replaceChildren();
  classNames(studentDB).forEach(c=>{
    const students=JourneyUI.getStudents(studentDB,logs,c).sort((a,b)=>b.steps-a.steps || a.n.localeCompare(b.n,'ko'));
    const column=document.createElement('div');column.className='column is-4';
    const box=document.createElement('div');box.className='box p-3 has-background-white-bis';
    const heading=document.createElement('h4');heading.className='title is-6 has-text-info mb-2';heading.textContent=c;box.append(heading);
    students.forEach(s=>{const line=document.createElement(s.steps>=100?'strong':'p');line.className='monthly-student';line.textContent=`${s.n}(${s.steps.toLocaleString()}걸음)`;box.append(line);});
    column.append(box);parent.append(column);
  });
  if (!parent.childElementCount) parent.textContent='기록 없음';
}
function renderClassTable() {
  if (!journeyDataReady) return;
  const cls=$('dashClassSelect').value, body=$('classTableBody');
  $('dashProfile').style.display='none';
  const students=JourneyUI.getStudents(studentDB,globalData,cls);
  JourneyUI.render(students,`${selectedYear}:${cls}`);
  body.replaceChildren();
  students.forEach((s,index)=>{
    const row=body.insertRow();
    [s.c,index+1,`${s.n} (${s.g}학년)`,s.steps.toLocaleString(),`${s.journey.current.emoji} ${s.journey.current.name}`,s.logs[0]?.[4] || '-',dateLabel(s.logs[0]?.[0])].forEach((value,col)=>{
      const cell=row.insertCell();
      if(col===2){const button=document.createElement('button');button.className='student-record-link';button.textContent=value;button.onclick=()=>{JourneyUI.select(s.key);showStudentProfile(s);};cell.append(button);}
      else cell.textContent=value;
    });
    const copy=document.createElement('button');copy.className='button is-small is-outlined is-info';copy.textContent='복사';copy.onclick=()=>copySingleStudentList(s.logs);row.insertCell().append(copy);
  });
  if(!students.length){const cell=body.insertRow().insertCell();cell.colSpan=8;cell.textContent='해당 학년도에 등록된 탐험가가 없습니다.';}
  $('classTableContainer').style.display='block'; fitMap();
}
function showStudentProfile(student) {
  $('classTableContainer').style.display='none'; currentProfileLogs=student.logs;
  $('dName').textContent=`👋 ${student.n} 탐험가님`;
  $('dInfo').textContent=`${selectedYear}학년도 | ${student.g}학년 | ${student.c}`;
  $('dSteps').textContent=student.steps.toLocaleString();
  $('dLoc').textContent=`${student.journey.current.emoji} ${student.journey.current.name}`;
  $('dRecentBook').textContent=student.logs[0]?.[4] || '-';
  $('dRecentDate').textContent=dateLabel(student.logs[0]?.[0]);
  $('dBookList').replaceChildren();
  student.logs.forEach(r=>{const row=$('dBookList').insertRow();[dateLabel(r[0]),r[4],`${r[5]}p`,`+${stepsOf(r)}`].forEach(v=>row.insertCell().textContent=v);});
  $('dashProfile').style.display='block';
}
function backToClassTable() { $('dashProfile').style.display='none';$('classTableContainer').style.display='block'; }
async function copySingleStudentList(logs) {
  if(!logs.length){alert('아직 독서 기록이 없어요.');return;}
  try{await navigator.clipboard.writeText(logs.map(r=>`${dateLabel(r[0])}_${r[4]}`).join('\n'));alert('복사되었습니다!');}catch{alert('복사 권한을 확인해 주세요.');}
}
function copyIndividualBookList(){return copySingleStudentList(currentProfileLogs);}

$('readingForm').onsubmit = async function(e) {
  e.preventDefault(); if(saving || !config || !this.reportValidity()) return;
  const form=this, controls=[...form.elements], disabled=controls.map(el=>el.disabled);
  const data=Object.fromEntries(new FormData(form));
  data.date=data.recordDate; delete data.recordDate;
  if(!(inputRoster()[data.grade]?.[data.className] || []).includes(data.studentName)) { $('saveStatus').textContent='학년·반·이름을 다시 선택해 주세요.';return; }
  saving=true; controls.forEach(el=>el.disabled=true);$('submitBtn').classList.add('is-loading');$('saveStatus').textContent='기록을 저장하고 있어요.';
  let saved=false;
  try {
    const response=await fetch(API_URL,{method:'POST',body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error('SAVE_REJECTED');
    const steps=SchoolModel.confirmedSteps(await response.json());
    saved=true;
    form.elements.bookTitle.value='';form.elements.pages.value='';setTodayDate();
    $('acquiredSteps').textContent=steps;$('successModal').classList.add('is-active');
    $('saveStatus').textContent='기록을 저장했습니다.';
  } catch(error) {
    $('saveStatus').textContent='저장을 확인하지 못했습니다. 입력 내용은 보존했습니다. 독서 기록에서 저장 여부를 확인한 뒤 다시 시도해 주세요.';
  } finally {
    controls.forEach((el,i)=>el.disabled=disabled[i]);$('submitBtn').classList.remove('is-loading');
    saving=false;
  }
  if(saved) {
    updateFormRoster();
    try{await loadGlobalData();}catch{$('saveStatus').textContent='저장은 완료됐지만 목록을 새로 불러오지 못했습니다. 다시 저장하지 말고 새로고침해 주세요.';}
  }
};
window.onload = async () => {
  setTodayDate();$('submitBtn').disabled=true;
  try {
    const [settings, db]=await Promise.all([readJSON('school-config.json'),readJSON(`${API_URL}?action=getStudentDB`)]);
    config={...settings};
    // A versioned server roster can explicitly identify its own reference year.
    baseStudentDB=db.students || db;
    if(db.students && Number.isInteger(db.rosterYear)) config.rosterYear=db.rosterYear;
    if(db.rostersByYear) config.rostersByYear={...config.rostersByYear,...db.rostersByYear};
    updateFormRoster(); await loadGlobalData();$('submitBtn').disabled=false;
    $('recordDateInput').addEventListener('change',updateFormRoster);
  } catch {
    $('errorBox').style.display='block';$('errorBox').textContent='데이터를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.';
    $('journeyStatus').textContent='탐험대 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.';
    $('saveStatus').textContent='명부를 불러오지 못해 저장할 수 없습니다. 새로고침해 주세요.';
  }
  new ResizeObserver(fitMap).observe(document.querySelector('.map-viewport'));
  let previousDate=today();
  const refreshCalendar=async()=>{
    const currentDate=today();
    if(!config || saving || currentDate===previousDate) return;
    const previousYear=SchoolModel.schoolYear(previousDate,config), currentYear=SchoolModel.schoolYear(currentDate,config);
    if($('recordDateInput').value===previousDate) $('recordDateInput').value=currentDate;
    previousDate=currentDate; updateFormRoster();
    if(previousYear!==currentYear){
      if(selectedYear===previousYear) selectedYear=currentYear;
      try{await loadGlobalData();}catch{$('saveStatus').textContent='새 학년도 목록을 불러오려면 새로고침해 주세요.';}
    }
  };
  setInterval(refreshCalendar,60000);
  window.addEventListener('focus',refreshCalendar);
};
