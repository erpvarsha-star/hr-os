'use strict';
// Setup on an EMPTY spreadsheet (only Google-Form response tabs) builds every tab the code uses.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

function emptyWorld() {
  const env = makeEnv({ user: 'owner@varshaforgings.com' });
  ['OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'].forEach((n) => env.put(n, ['Timestamp', 'x'], []));
  return env;
}

test('setup creates every tab with exact headers, seeds, hides + protects the sensitive tabs, orders the tabs', () => {
  const env = emptyWorld();
  const log = plain(env.c.hrosSetup());
  const specs = env.c.hrosTabSpecs_();
  specs.forEach((sp) => {
    assert.ok(env.sheets[sp.name], 'tab ' + sp.name);
    assert.deepEqual(env.sheets[sp.name].data[0].slice(0, sp.headers.length), plain(sp.headers), sp.name + ' header');
  });
  // every tab the code names in TABS (except the form-created raw tabs) is built
  const tabs = plain(env.c.TABS);
  Object.keys(tabs).filter((k) => !/^ATT_FORM_/.test(k)).forEach((k) => {
    if (/^PAYROLL_(STAFF|WORKER|CONSULTANT|PUNE_STAFF)$/.test(k)) assert.ok(env.sheets[tabs[k]], k);
    else assert.ok(env.sheets[tabs[k]], k + ' -> ' + tabs[k]);
  });
  // hidden + protected
  ['EMPLOYEE_STATUTORY_IDS', 'PAYROLL_LOCKED'].forEach((n) => {
    assert.equal(env.sheets[n].hidden, true, n + ' hidden');
    assert.equal(env.sheets[n].protections.length, 1, n + ' protected');
  });
  assert.deepEqual(env.sheets.EMPLOYEE_STATUTORY_IDS.protections[0].editors.sort(), ['hr@varshaforgings.com', 'owner@varshaforgings.com', 'yash.munot@gmail.com'].sort().filter((x, i, a) => a.indexOf(x) === i).concat([]).sort());
  assert.equal(env.sheets.PAYROLL_CONTROL.hidden, false);
  assert.equal(env.sheets.EMPLOYEE_MASTER.hidden, false);
  assert.ok(log.hidden.includes('EMPLOYEE_STATUTORY_IDS') && log.hidden.includes('PAYROLL_LOCKED'));
  // seeds
  const ctl = Object.fromEntries(env.rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]));
  assert.equal(ctl.MIN_PERIOD, '2026-09');
  assert.equal(ctl.OT_SOURCE_TAB, 'OT_FORM_RESPONSES');
  assert.equal(env.rowsOf('PAYROLL_CATEGORY_CONFIG').map((r) => r.CATEGORY_CODE).join(), 'STAFF,PERMANENT_WORKER,CONSULTANT,PUNE_STAFF');
  assert.ok(env.rowsOf('PAYROLL_CATEGORY_CONFIG').every((r) => r.APPROVED_BY === ''));
  assert.equal(env.rowsOf('PT_EXEMPTIONS').length, 3);
  assert.equal(env.rowsOf('STATUTORY_CONFIG').length, 12);
  // order: Control -> Config -> Masters -> Monthly inputs -> Attendance -> Payroll -> Payslips -> Audit, forms next to what they feed
  const order = Object.keys(env.sheets);
  const at = (n) => order.indexOf(n);
  const seq = ['PAYROLL_CONTROL', 'PAYROLL_CATEGORY_CONFIG', 'EMPLOYEE_MASTER', 'INPUT_OT', 'OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'INPUT_ATTENDANCE', 'PAYROLL_READINESS',
    'PAYROLL_DRAFT', 'PAYROLL_STAFF', 'PAYROLL_LOCKED', 'PAYSLIP_REGISTER', 'AUDIT_LOG'];
  seq.forEach((n, i) => { assert.ok(at(n) >= 0, n); if (i) assert.ok(at(n) > at(seq[i - 1]), n + ' after ' + seq[i - 1]); });
  assert.equal(order[0], 'PAYROLL_CONTROL');
  // idempotent
  const snap = JSON.stringify(Object.keys(env.sheets).map((k) => [k, env.sheets[k].data.length, env.sheets[k].protections.length]));
  const auditN = env.rowsOf('AUDIT_LOG').length;
  const log2 = plain(env.c.hrosSetup());
  assert.equal(log2.createdTabs.length, 0);
  assert.equal(log2.protectedTabs.length, 0);
  assert.equal(JSON.stringify(Object.keys(env.sheets).map((k) => [k, env.sheets[k].data.length, env.sheets[k].protections.length])).replace(/AUDIT_LOG",\d+/, ''), snap.replace(/AUDIT_LOG",\d+/, ''));
  assert.equal(env.rowsOf('AUDIT_LOG').length, auditN + 1);
  // the code can run on the fresh sheet: prepareMonth, category approval
  assert.equal(plain(env.c.prepareMonth('2026-09')).periodRowsAdded, 4);
});

test('a configured 5th category gets its PAYROLL_<CODE> tab on setup', () => {
  const env = emptyWorld();
  env.put('PAYROLL_CATEGORY_CONFIG', plain(env.c.CATEGORY_CONFIG_HEADERS), [{ CATEGORY_CODE: 'CONTRACT_NSK', CALC_METHOD: 'CONSULTANT', SITE: 'NASHIK', PAYSLIP: 'N', RATE_SOURCE: 'RATE_PROFILE', ACTIVE: 'Y' }]);
  env.c.hrosSetup();
  assert.deepEqual(env.sheets.PAYROLL_CONTRACT_NSK.data[0], plain(env.c.HROS_OUTPUT_COLUMNS));
  assert.equal(env.sheets.PAYROLL_STAFF, undefined, 'only configured categories');
});
