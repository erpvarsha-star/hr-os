'use strict';
// deploy/ORGANISE_TABS.gs is a throw-away script: tested in its own vm context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeEnv } = require('./fakes');

const FILE = path.join(__dirname, '..', 'deploy', 'ORGANISE_TABS.gs');
const src = fs.readFileSync(FILE, 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

function load(env) {
  const alerts = [];
  const ui = { ButtonSet: { OK: 'OK' }, alert: (t, m) => alerts.push({ t, m }) };
  const ctx = vm.createContext({ Logger: { log() {} }, SpreadsheetApp: { getActiveSpreadsheet: () => env.ss, getUi: () => ui }, console });
  vm.runInContext(src, ctx, { filename: FILE });
  ctx.alerts = alerts;
  return ctx;
}
const names = (plan) => plan.order.map((o) => o.name);

test('plan: known tabs in group order, colours per group, listed order kept inside groups', () => {
  const ctx = load(makeEnv());
  const shuffled = ['AUDIT_LOG', 'PAYSLIP_REGISTER', 'PAYROLL_DRAFT', 'INPUT_OT', 'INPUT_LEAVE', 'EMPLOYEE_MASTER', 'PAYROLL_CONTROL', 'ATTENDANCE_DAILY', 'INPUT_ATTENDANCE', 'PAYROLL_LOCKED', 'OT_FORM_RESPONSES', 'ATT_FORM_VFL_RAW'];
  const plan = plain(ctx.organiseTabs_plan(shuffled, []));
  assert.deepEqual(names(plan), ['PAYROLL_CONTROL', 'EMPLOYEE_MASTER', 'INPUT_ATTENDANCE', 'ATTENDANCE_DAILY', 'INPUT_LEAVE', 'INPUT_OT',
    'ATT_FORM_VFL_RAW', 'OT_FORM_RESPONSES', 'PAYROLL_DRAFT', 'PAYSLIP_REGISTER', 'PAYROLL_LOCKED', 'AUDIT_LOG']);
  const g = Object.fromEntries(plan.order.map((o) => [o.name, [o.group, o.color]]));
  assert.equal(g.PAYROLL_CONTROL[0], 'Control & setup');
  assert.equal(g.AUDIT_LOG[1], g.PAYROLL_LOCKED[1]);
  const colours = plain(ctx.ORGTABS_GROUPS).map((x) => x.color);
  assert.equal(new Set(colours).size, 8);
  colours.forEach((c) => assert.match(c, /^#[0-9A-F]{6}$/));
  assert.deepEqual(plan.unknown, []);
});

test('plan: unknown tabs go to the end in original order with no colour', () => {
  const ctx = load(makeEnv());
  const plan = plain(ctx.organiseTabs_plan(['ZZ_OLD', 'AUDIT_LOG', 'ATT_FORM_NASHIK_OLD', 'PAYROLL_CONTROL', 'Sheet7'], []));
  assert.deepEqual(names(plan), ['PAYROLL_CONTROL', 'AUDIT_LOG', 'ZZ_OLD', 'ATT_FORM_NASHIK_OLD', 'Sheet7']);
  assert.deepEqual(plan.unknown, ['ZZ_OLD', 'ATT_FORM_NASHIK_OLD', 'Sheet7']);
  plan.order.slice(2).forEach((o) => assert.equal(o.color, null));
});

test('plan: a form-linked unknown tab joins the form responses group (after the named ones)', () => {
  const ctx = load(makeEnv());
  const plan = plain(ctx.organiseTabs_plan(['Form Responses 1', 'PAYROLL_DRAFT', 'OT_FORM_RESPONSES', 'Old'], ['Form Responses 1']));
  assert.deepEqual(names(plan), ['OT_FORM_RESPONSES', 'Form Responses 1', 'PAYROLL_DRAFT', 'Old']);
  assert.equal(plan.order[1].group, plan.order[0].group);
  assert.deepEqual(plan.unknown, ['Old']);
});

test('plan: missing expected tabs are skipped; extra category tabs sit with the payroll outputs', () => {
  const ctx = load(makeEnv());
  assert.deepEqual(plain(ctx.organiseTabs_plan([], [])), { order: [], unknown: [] });
  const plan = plain(ctx.organiseTabs_plan(['PAYROLL_RECON', 'PAYROLL_CONTRACT_NSK', 'PAYROLL_PUNE_STAFF', 'PAYROLL_STAFF'], [], ['PAYROLL_CONTRACT_NSK']));
  assert.deepEqual(names(plan), ['PAYROLL_STAFF', 'PAYROLL_PUNE_STAFF', 'PAYROLL_CONTRACT_NSK', 'PAYROLL_RECON']);
  assert.deepEqual(plan.unknown, []);
  // without the config hint the same tab is just unknown
  assert.deepEqual(plain(ctx.organiseTabs_plan(['PAYROLL_CONTRACT_NSK'], [])).unknown, ['PAYROLL_CONTRACT_NSK']);
});

test('the group table covers every registry tab, the form tabs and the category tabs exactly once', () => {
  const env = makeEnv();
  const ctx = load(env);
  const all = [];
  plain(ctx.ORGTABS_GROUPS).forEach((g) => g.tabs.forEach((n) => { if (n[0] !== '@') all.push(n); }));
  const counts = {};
  all.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
  Object.keys(counts).forEach((n) => assert.equal(counts[n], 1, 'listed twice: ' + n));
  const expected = new Set(plain(env.c.hrosTabSpecs_()).map((s) => s.name));
  ['ATT_FORM_VFL_RAW', 'ATT_FORM_PUNE_RAW', 'ATT_MONTHLY_VFL_RAW', 'ATT_MONTHLY_PUNE_RAW', 'OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'].forEach((n) => expected.add(n));
  plain(env.c.populationList()).forEach((code) => expected.add(env.c.populationTab(code)));
  Object.values(plain(env.c.TABS)).forEach((n) => expected.add(n));
  expected.forEach((n) => assert.equal(counts[n], 1, 'not in exactly one group: ' + n));
  Object.keys(counts).forEach((n) => assert.ok(expected.has(n), 'in the table but not in the registry: ' + n));
});

test('step1 changes nothing and shows the plan; step2 applies, is idempotent, keeps hidden state and active sheet', () => {
  const env = makeEnv();
  ['AUDIT_LOG', 'ZZ_OLD', 'PAYROLL_LOCKED', 'INPUT_OT', 'PAYROLL_CONTROL', 'EMPLOYEE_STATUTORY_IDS', 'EMPLOYEE_MASTER', 'Extra Form'].forEach((n) => env.put(n, ['A']));
  env.sheets['PAYROLL_LOCKED'].hidden = true;
  env.sheets['EMPLOYEE_STATUTORY_IDS'].hidden = true;
  env.sheets['Extra Form'].formUrl = 'https://forms/x';
  env.sheets['ZZ_OLD'].tabColor = '#123456';
  env.ss.setActiveSheet(env.sheets['INPUT_OT']);
  const ctx = load(env);
  const order = () => env.ss.getSheets().map((s) => s.getName());
  const before = order();

  ctx.organiseTabs_step1_preview();
  assert.deepEqual(order(), before);
  assert.equal(env.sheets['ZZ_OLD'].tabColor, '#123456');
  assert.match(ctx.alerts[0].m, /Not recognised|NOT RECOGNISED/);
  assert.match(ctx.alerts[0].m, /ZZ_OLD/);

  const r1 = plain(ctx.organiseTabs_step2_apply());
  assert.deepEqual(order(), ['PAYROLL_CONTROL', 'EMPLOYEE_MASTER', 'EMPLOYEE_STATUTORY_IDS', 'INPUT_OT', 'Extra Form', 'PAYROLL_LOCKED', 'AUDIT_LOG', 'ZZ_OLD']);
  assert.ok(r1.moved > 0 && r1.recoloured > 0 && r1.errors.length === 0);
  assert.equal(env.sheets['ZZ_OLD'].tabColor, null);
  assert.equal(env.sheets['PAYROLL_CONTROL'].tabColor, '#607D8B');
  assert.equal(env.sheets['Extra Form'].tabColor, '#FB8C00');
  assert.equal(env.sheets['PAYROLL_LOCKED'].hidden, true);
  assert.equal(env.sheets['EMPLOYEE_STATUTORY_IDS'].hidden, true);
  assert.equal(env.sheets['EMPLOYEE_MASTER'].hidden, false);
  assert.equal(env.active.getName(), 'INPUT_OT');

  const after = order();
  const r2 = plain(ctx.organiseTabs_step2_apply());
  assert.deepEqual(order(), after);
  assert.equal(r2.moved, 0);
  assert.equal(r2.recoloured, 0);
  assert.match(ctx.alerts[ctx.alerts.length - 1].m, /Moved: 0\. Recoloured: 0/);
});

test('no name collisions with HR_OS.gs; every global is prefixed; no onOpen', () => {
  const both = vm.createContext({ Logger: { log() {} }, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'deploy', 'HR_OS.gs'), 'utf8'), both, { filename: 'HR_OS.gs' });
  const hrGlobals = new Set(Object.getOwnPropertyNames(both));
  const hrFns = new Map([...hrGlobals].filter((n) => typeof both[n] === 'function').map((n) => [n, both[n]]));
  const only = vm.createContext({ Logger: { log() {} }, console });
  const baseline = new Set(Object.getOwnPropertyNames(only));
  vm.runInContext(src, only, { filename: FILE });
  const mine = Object.getOwnPropertyNames(only).filter((n) => !baseline.has(n));
  assert.ok(mine.length > 0);
  mine.forEach((n) => {
    assert.ok(/^(orgTabs_|organiseTabs_|ORGTABS_)/.test(n), 'unprefixed global ' + n);
    assert.ok(!hrGlobals.has(n), 'collides with HR_OS.gs: ' + n);
  });
  assert.ok(!mine.includes('onOpen'));
  assert.ok(mine.includes('organiseTabs_step1_preview') && mine.includes('organiseTabs_step2_apply'));
  vm.runInContext(src, both, { filename: FILE });
  hrFns.forEach((fn, n) => assert.equal(both[n], fn, 'overwritten: ' + n));
  assert.ok(!/ORGANISE_TABS|organiseTabs_/.test(fs.readFileSync(path.join(__dirname, '..', 'deploy', 'HR_OS.gs'), 'utf8')));
});
