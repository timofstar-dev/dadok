const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../school-model');
const config = require('../school-config.json');

test('promotion changes at midnight Seoul on March 1, not January 1', () => {
  assert.equal(model.schoolYear('2027-01-01',config),2026);
  assert.equal(model.schoolYear('2027-02-28T14:59:59Z',config),2026);
  assert.equal(model.schoolYear('2027-02-28T15:00:00Z',config),2027);
  assert.equal(model.schoolYear('2027-03-01',config),2027);
  assert.equal(model.schoolYear('2028-02-29',config),2027);
  assert.equal(model.schoolYear('2027-02-29',config),null);
});
test('annual totals retain January/February with their school year and exclude other years', () => {
  const logs=['2026-02-28','2026-03-01','2027-02-28','2027-03-01','invalid'].map(date=>[date]);
  assert.deepEqual(model.filterYear(logs,2026,config),[logs[1],logs[2]]);
  assert.deepEqual(model.filterYear(logs,2027,config),[logs[3]]);
});
test('promotion is derived from reference year, repeated reads never add another grade', () => {
  const db={1:{새싹반:['가람']},11:{열매반:['누리']},12:{열매반:['다온']}};
  const snapshot=JSON.stringify(db);
  assert.deepEqual(model.rosterForYear(db,2027,config),{2:{새싹반:['가람']},12:{열매반:['누리']}});
  assert.deepEqual(model.rosterForYear(db,2028,config),{3:{새싹반:['가람']}});
  assert.equal(JSON.stringify(db),snapshot);
  assert.deepEqual(model.rosterForYear(db,2026,config),db);
});
test('explicit annual roster supports renamed classes, new students and a refreshed source year', () => {
  const db={1:{예전반:['가람']}};
  const settings={...config,rostersByYear:{2027:{2:{새이름반:['가람']},1:{새싹반:['보람']}}}};
  assert.deepEqual(model.rosterForYear(db,2027,settings),settings.rostersByYear[2027]);
  assert.deepEqual(model.rosterForYear(db,2028,settings),{3:{새이름반:['가람']},2:{새싹반:['보람']}});
  assert.deepEqual(model.rosterForYear({2:{새이름반:['가람']}},2027,{...config,rosterYear:2027}),{2:{새이름반:['가람']}});
});
test('class renames can be scheduled without copying student names; older records stay untouched', () => {
  const db={1:{예전반:['가람']}};
  const settings={...config,classNamesByYear:{2027:{예전반:'새반'},2028:{새반:'다음반'}}};
  assert.deepEqual(model.rosterForYear(db,2026,settings),db);
  assert.deepEqual(model.rosterForYear(db,2027,settings),{2:{새반:['가람']}});
  assert.deepEqual(model.rosterForYear(db,2028,settings),{3:{다음반:['가람']}});
  assert.deepEqual(model.rosterForYear(db,2025,settings),{});
});
test('historical logs remain accessible when the source roster no longer includes the student', () => {
  const roster=model.mergeRecordedRoster({},[['2026-10-01','12학년','이전반','가람']]);
  assert.deepEqual(roster,{12:{이전반:['가람']}});
});
test('an authoritative 41-student roster excludes two former students without altering raw records', () => {
  const names=Array.from({length:41},(_,i)=>`가상친구${i}`);
  const roster={1:{가상반:names}};
  const logs=[...names,'이전친구A','이전친구B'].map(n=>['2026-10-01','1학년','가상반',n,'가상책',10,'2점',10]);
  const before=JSON.stringify(logs);
  const included=model.filterRoster(logs,roster);
  assert.equal(included.length,41);
  assert.equal(included.reduce((sum,r)=>sum+r[7],0),410);
  assert.ok(included.every(r=>names.includes(r[3])));
  assert.equal(JSON.stringify(logs),before);
  assert.deepEqual(model.filterRoster(logs,{}),[]);
});
test('only a nonnegative numeric awarded step count confirms legacy or explicit success', () => {
  for(const response of [{steps:0},{steps:35},{success:true,steps:'35'},{status:'success',steps:35}]) assert.equal(typeof model.confirmedSteps(response),'number');
  for(const response of [null,{},'ok',{success:true},{steps:''},{steps:null},{steps:true},{steps:-1},{steps:Infinity},{steps:'abc'},{success:false,steps:10},{error:'rejected',steps:10},{status:'error',steps:0}]) assert.throws(()=>model.confirmedSteps(response));
});
