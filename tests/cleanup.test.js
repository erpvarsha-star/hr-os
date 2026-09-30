'use strict';
// deploy/CLEANUP_OLD_SHEET.gs is a throw-away script: tested in its own vm context with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILE = path.join(__dirname, '..', 'deploy', 'CLEANUP_OLD_SHEET.gs');
const src = fs.readFileSync(FILE, 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

function world(sheetDefs, opts = {}) {
  const w = { alerts: [], prompts: [], logs: [], triggers: (opts.triggers || []).map((h) => ({ h, deleted: false })), copies: [], answer: opts.answer, named: opts.named || 2, namedRemoved: 0, deleteLog: [] };
  w.sheets = sheetDefs.map((d) => {
    const sh = { name: d.name, getName: () => sh.name, setName: (n) => { sh.name = n; }, getLastRow: () => d.rows || 0,
      getFormUrl: () => (d.formUrl === undefined ? null : d.formUrl) };
    return sh;
  });
  const ss = {
    getSheets: () => w.sheets.slice(),
    getSheetByName: (n) => w.sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const sh = { name: n, getName: () => sh.name, setName() {}, getLastRow: () => 0, getFormUrl: () => null }; w.sheets.push(sh); return sh; },
    deleteSheet: (sh) => {
      if (opts.cannotDelete && opts.cannotDelete.includes(sh.name)) throw new Error('protected');
      if (w.sheets.length <= 1) throw new Error('cannot delete the last sheet');
      w.deleteLog.push(sh.name); w.sheets.splice(w.sheets.indexOf(sh), 1);
    },
    getId: () => 'SSID',
    getNamedRanges: () => Array.from({ length: w.named }, () => ({ remove: () => { w.namedRemoved++; } })),
  };
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK', CANCEL: 'CANCEL' },
    alert: (t, m) => { w.alerts.push({ t, m }); },
    prompt: (t, m) => { w.prompts.push({ t, m }); return { getSelectedButton: () => (w.answer === null ? 'CANCEL' : 'OK'), getResponseText: () => w.answer || '' }; },
  };
  const ctx = vm.createContext({
    Logger: { log: (m) => w.logs.push(m) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui },
    ScriptApp: {
      getProjectTriggers: () => w.triggers.filter((t) => !t.deleted).map((t) => ({ getHandlerFunction: () => t.h, getEventType: () => 'ON_FORM_SUBMIT', t })),
      deleteTrigger: (tr) => { tr.t.deleted = true; },
    },
    FormApp: { openByUrl: (u) => ({ getTitle: () => (opts.titles || {})[u] || '' }) },
    DriveApp: { getFileById: () => ({ makeCopy: (name) => { if (opts.copyFails) throw new Error('quota'); w.copies.push(name); return { getUrl: () => 'https://drive/copy' }; } }) },
    Utilities: { formatDate: () => '2026-09-30 10:00' },
    Date, console,
  });
  vm.runInContext(src, ctx, { filename: FILE });
  w.ctx = ctx;
  return w;
}
const S = (name, formUrl, rows) => ({ name, formUrl: formUrl || null, formTitle: '', rows: rows || 0 });

test('classification: form-linked and protected names are kept, everything else deleted', () => {
  const w = world([]);
  const plan = plain(w.ctx.cleanup_buildPlan([S('Form Responses 1', 'u1', 5), S('OT_FORM_RESPONSES', null, 3), S('Old payroll', null, 200), S('Sheet2', null, 0)], []));
  assert.deepEqual(plan.keep.map((k) => k.name), ['Form Responses 1', 'OT_FORM_RESPONSES']);
  assert.deepEqual(plan.del.map((d) => [d.name, d.rows]), [['Old payroll', 200], ['Sheet2', 0]]);
  assert.equal(plan.keep[0].formUrl, 'u1');
  assert.equal(plan.warnings.length, 0);
});

test('rename proposals: by form title or sheet name, only when target free and one candidate', () => {
  const w = world([]);
  const infos = [
    { name: 'Form Responses 1', formUrl: 'u1', formTitle: 'Canteen coupons', rows: 1 },
    { name: 'Form Responses 2', formUrl: 'u2', formTitle: 'Efficiency entry', rows: 1 },
    { name: 'Form Responses 3', formUrl: 'u3', formTitle: 'Monthly Overtime', rows: 1 },
  ];
  const plan = plain(w.ctx.cleanup_buildPlan(infos, []));
  assert.deepEqual(plan.renames.map((r) => [r.from, r.to]), [['Form Responses 1', 'CANTEEN_FORM_RESPONSES'], ['Form Responses 2', 'EFFICIENCY_FORM_RESPONSES'], ['Form Responses 3', 'OT_FORM_RESPONSES']]);
  const ot = plain(w.ctx.cleanup_buildPlan([{ name: 'X', formUrl: 'u', formTitle: 'Staff OT form', rows: 0 }], []));
  assert.equal(ot.renames[0].to, 'OT_FORM_RESPONSES');
});

test('rename ambiguity: two candidates, occupied target, or double match -> manual', () => {
  const w = world([]);
  const two = plain(w.ctx.cleanup_buildPlan([{ name: 'A', formUrl: 'u1', formTitle: 'Canteen 1', rows: 0 }, { name: 'B', formUrl: 'u2', formTitle: 'Canteen 2', rows: 0 }], []));
  assert.equal(two.renames.length, 0);
  assert.deepEqual(two.manual[0].from, ['A', 'B']);
  assert.equal(two.manual[0].to, 'CANTEEN_FORM_RESPONSES');
  const busy = plain(w.ctx.cleanup_buildPlan([S('CANTEEN_FORM_RESPONSES', null, 1), { name: 'A', formUrl: 'u1', formTitle: 'Canteen', rows: 0 }], []));
  assert.equal(busy.renames.length, 0);
  assert.equal(busy.manual.length, 1);
  const both = plain(w.ctx.cleanup_buildPlan([{ name: 'A', formUrl: 'u1', formTitle: 'Canteen and overtime', rows: 0 }], []));
  assert.equal(both.renames.length, 0);
  assert.equal(both.manual.length, 2);
  const notLinked = plain(w.ctx.cleanup_buildPlan([S('Canteen old', null, 4)], []));
  assert.equal(notLinked.renames.length + notLinked.manual.length, 0);
});

test('zero-sheet guard and no-form warning', () => {
  const w = world([]);
  const plan = plain(w.ctx.cleanup_buildPlan([S('Old', null, 1), S('Older', null, 2)], []));
  assert.equal(plan.keep.length, 0);
  assert.equal(plan.needTemp, true);
  assert.ok(/no form-linked tab/i.test(plan.warnings[0]));
  const w2 = world([S('Old', null, 1), S('Older', null, 2)], { answer: 'DELETE' });
  w2.ctx.step2_cleanup();
  assert.deepEqual(w2.sheets.map((s) => s.name), ['_TEMP']);
  const again = plain(w.ctx.cleanup_buildPlan([S('_TEMP', null, 0), S('Old', null, 1)], []));
  assert.equal(again.needTemp, false);
  assert.deepEqual(again.keep.map((k) => k.name), ['_TEMP']);
});

test('step1_preview changes nothing and shows alert + log', () => {
  const w = world([S('Form Responses 1', 'https://forms/x', 5), S('Junk', null, 9)], { triggers: ['onOpen', 'oldSync'] });
  w.ctx.step1_preview();
  assert.equal(w.alerts.length, 1);
  assert.ok(/Junk \(9 rows\)/.test(w.alerts[0].m) && /https:\/\/forms\/x/.test(w.alerts[0].m) && /oldSync \[ON_FORM_SUBMIT\]/.test(w.alerts[0].m));
  assert.ok(w.logs.length >= 1);
  assert.equal(w.sheets.length, 2);
  assert.equal(w.copies.length, 0);
  assert.ok(w.triggers.every((t) => !t.deleted));
  assert.equal(w.namedRemoved, 0);
});

test('DELETE confirmation: anything else aborts with no backup and no change', () => {
  for (const ans of ['delete', 'yes', '', null]) {
    const w = world([S('Form Responses 1', 'u', 5), S('Junk', null, 9)], { answer: ans, triggers: ['a'] });
    w.ctx.step2_cleanup();
    assert.equal(w.sheets.length, 2, String(ans));
    assert.equal(w.copies.length, 0);
    assert.ok(w.triggers.every((t) => !t.deleted));
  }
});

test('backup failure aborts before any change', () => {
  const w = world([S('Form Responses 1', 'u', 5), S('Junk', null, 9)], { answer: 'DELETE', copyFails: true, triggers: ['a'] });
  w.ctx.step2_cleanup();
  assert.deepEqual(w.sheets.map((s) => s.name), ['Form Responses 1', 'Junk']);
  assert.equal(w.deleteLog.length, 0);
  assert.ok(w.triggers.every((t) => !t.deleted));
  assert.equal(w.namedRemoved, 0);
  assert.ok(/backup copy FAILED/i.test(w.alerts[w.alerts.length - 1].m));
});

test('full run: backup, rename, delete, triggers and named ranges removed, report shown', () => {
  const w = world([
    { name: 'Form Responses 1', formUrl: 'u1', rows: 5 }, S('Junk', null, 9), S('More', null, 1), S('Protected', null, 1),
  ], { answer: 'DELETE', triggers: ['onOpen', 'sync'], titles: { u1: 'Canteen coupons' }, cannotDelete: ['Protected'] });
  const report = w.ctx.step2_cleanup();
  assert.equal(w.copies.length, 1);
  assert.equal(w.copies[0], 'HR OS backup before rebuild 2026-09-30 10:00 IST');
  assert.deepEqual(w.sheets.map((s) => s.name), ['CANTEEN_FORM_RESPONSES', 'Protected']);
  assert.ok(w.triggers.every((t) => t.deleted));
  assert.equal(w.namedRemoved, 2);
  assert.ok(/https:\/\/drive\/copy/.test(report));
  assert.ok(/Tabs deleted: 2/.test(report));
  assert.ok(/Triggers deleted: 2/.test(report));
  assert.ok(/delete Protected: protected/.test(report));
  assert.ok(/Triggers installed by other people are not visible to you/.test(report));
  assert.ok(/Extensions ▸ Apps Script ▸ Triggers/.test(report));
});

test('kept tabs are never written to (only setName on renames)', () => {
  const w = world([{ name: 'Form Responses 1', formUrl: 'u1', rows: 5 }, S('Junk', null, 1)], { answer: 'DELETE' });
  const kept = w.sheets[0];
  const touched = [];
  Object.keys(kept).forEach((k) => { if (typeof kept[k] === 'function') { const f = kept[k]; kept[k] = (...a) => { touched.push(k); return f(...a); }; } });
  w.ctx.step2_cleanup();
  assert.ok(touched.every((k) => ['getName', 'getFormUrl', 'getLastRow', 'setName'].includes(k)), touched.join());
});

test('no name collisions with HR_OS.gs; only the two entry points are unprefixed; no onOpen', () => {
  const both = vm.createContext({ Logger: { log() {} }, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'deploy', 'HR_OS.gs'), 'utf8'), both, { filename: 'HR_OS.gs' });
  const hrNames = new Set(Object.getOwnPropertyNames(both).filter((n) => typeof both[n] === 'function'));
  const hrGlobals = new Set(Object.getOwnPropertyNames(both));
  assert.ok(hrNames.has('onOpen'));
  const before = new Map([...hrNames].map((n) => [n, both[n]]));
  const only = vm.createContext({ Logger: { log() {} }, console });
  const baseline = new Set(Object.getOwnPropertyNames(only));
  vm.runInContext(src, only, { filename: FILE });
  const cleanupGlobals = Object.getOwnPropertyNames(only).filter((n) => !baseline.has(n));
  const cleanupFns = cleanupGlobals.filter((n) => typeof only[n] === 'function');
  assert.ok(!cleanupFns.includes('onOpen'));
  cleanupGlobals.forEach((n) => {
    assert.ok(/^(cleanup_|CLEANUP_)/.test(n) || n === 'step1_preview' || n === 'step2_cleanup', 'unprefixed global ' + n);
    assert.ok(!hrGlobals.has(n), 'collides with HR_OS.gs: ' + n);
  });
  assert.ok(cleanupFns.includes('step1_preview') && cleanupFns.includes('step2_cleanup'));
  // load both into one context and verify nothing from HR_OS was overwritten
  vm.runInContext(src, both, { filename: FILE });
  before.forEach((fn, n) => assert.equal(both[n], fn, 'overwritten: ' + n));
  // the cleanup file is not part of the combined deploy file
  assert.ok(!/step2_cleanup|CLEANUP_OLD_SHEET/.test(fs.readFileSync(path.join(__dirname, '..', 'deploy', 'HR_OS.gs'), 'utf8')));
});
