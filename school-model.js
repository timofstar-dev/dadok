(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SchoolModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const gradeNumber = value => Number(String(value ?? '').replace(/학년$/, '').trim());
  function dateParts(value) {
    // Date-only inputs are school calendar dates; timestamps are interpreted in Seoul.
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day));
      return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day ? {year, month, day} : null;
    }
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone:'Asia/Seoul', year:'numeric', month:'numeric', day:'numeric'}).formatToParts(date).map(p => [p.type, p.value]));
    return {year:Number(parts.year), month:Number(parts.month), day:Number(parts.day)};
  }
  function schoolYear(value, config) {
    const p = dateParts(value);
    if (!p) return null;
    return p.year - (p.month * 100 + p.day < config.promotionMonth * 100 + config.promotionDay ? 1 : 0);
  }
  function filterYear(logs, year, config) {
    return logs.filter(r => schoolYear(r[0], config) === Number(year));
  }
  function rosterForYear(base, year, config) {
    // An explicit snapshot always wins, so a refreshed roster is never promoted twice.
    const snapshot = config.rostersByYear?.[year];
    if (snapshot) return structuredClone(snapshot);
    // Do not invent former enrollment by reversing the current roster.
    if (Number(year) < Number(config.rosterYear)) return {};
    const referenceYear = Math.max(Number(config.rosterYear), ...Object.keys(config.rostersByYear || {}).map(Number).filter(y => y <= Number(year)));
    const reference = config.rostersByYear?.[referenceYear] || base;
    const result = {};
    for (const [grade, groups] of Object.entries(reference || {})) {
      const promoted = gradeNumber(grade) + Number(year) - referenceYear;
      if (!Number.isInteger(promoted) || promoted < 1 || promoted > 12) continue;
      result[promoted] = {};
      for (const [originalName, names] of Object.entries(groups)) {
        let className = originalName;
        for (let y = referenceYear + 1; y <= Number(year); y++) className = config.classNamesByYear?.[y]?.[className] || className;
        result[promoted][className] ||= [];
        result[promoted][className].push(...names);
      }
    }
    return result;
  }
  function mergeRecordedRoster(roster, logs) {
    const result = structuredClone(roster);
    // Historical records retain the grade and class actually saved that year.
    // A school roster can omit graduates/transfers; their records remain accessible.
    for (const r of logs) {
      const g = gradeNumber(r[1]), c = String(r[2] || ''), n = String(r[3] || '');
      if (!Number.isInteger(g) || g < 1 || g > 12 || !c || !n) continue;
      result[g] ||= {};
      result[g][c] ||= [];
      if (!result[g][c].includes(n)) result[g][c].push(n);
    }
    return result;
  }
  function confirmedSteps(res) {
    if (!res || typeof res !== 'object' || res.error || res.errors?.length || res.success === false || res.ok === false || (res.status && !['success','ok'].includes(String(res.status).toLowerCase()))) throw new Error('SAVE_REJECTED');
    // Support the existing Apps Script {steps:number} response as well as explicit success.
    if (!['number','string'].includes(typeof res.steps) || String(res.steps).trim() === '' || !Number.isFinite(Number(res.steps)) || Number(res.steps) < 0) throw new Error('SAVE_UNCONFIRMED');
    return Number(res.steps);
  }
  return {gradeNumber, dateParts, schoolYear, filterYear, rosterForYear, mergeRecordedRoster, confirmedSteps};
});
