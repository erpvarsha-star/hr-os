'use strict';
// PAYROLL_CATEGORY_CONFIG: adding a category = adding a row. A 5th category with the CONSULTANT calc method runs the whole chain.
const test = require('node:test');
const assert = require('node:assert/strict');
const { plain } = require('./load');
const { P, HR, ACC, OWNER, fullWorld } = require('./regenv');

const CFG_HDR = ['CATEGORY_CODE', 'DISPLAY_NAME', 'CALC_METHOD', 'SITE', 'PAYSLIP', 'PAYSLIP_TEMPLATE_KEY', 'RATE_SOURCE', 'ACTIVE', 'APPROVED_BY', 'APPROVED_AT'];
const cfgRow = (code, method, o = {}) => Object.assign({ CATEGORY_CODE: code, DISPLAY_NAME: code, CALC_METHOD: method, SITE: 'VFL', PAYSLIP: 'N', PAYSLIP_TEMPLATE_KEY: '',
  RATE_SOURCE: method === 'STAFF' || method === 'PERMANENT_WORKER' ? 'SALARY_STRUCTURE' : 'RATE_PROFILE', ACTIVE: 'Y', APPROVED_BY: 'yash.munot@gmail.com' }, o);
const FOUR = [cfgRow('STAFF', 'STAFF', { PAYSLIP: 'Y', PAYSLIP_TEMPLATE_KEY: 'STAFF' }), cfgRow('PERMANENT_WORKER', 'PERMANENT_WORKER', { PAYSLIP: 'Y', PAYSLIP_TEMPLATE_KEY: 'WORKER' }),
  cfgRow('CONSULTANT', 'CONSULTANT'), cfgRow('PUNE_STAFF', 'PUNE_STAFF', { SITE: 'PUNE' })];
const RATE_HDR = ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR', 'VERSION_STATE'];

/** fullWorld + PAYROLL_CATEGORY_CONFIG with a 5th category CONTRACT_NSK (CONSULTANT method), employee CX1 with a daily rate. */
function world5(cfgRows) {
  const env = fullWorld({ master: [{ EMP_ID: 'CX1', EMPLOYEE_NAME: 'Contract One', PAYROLL_CATEGORY: 'CONTRACT_NSK', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Dept', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/01/2020' }],
    periodRows: [{ PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'CONTRACT_NSK', WORKING_DAYS: 26, STATUS: 'PENDING' }] });
  env.put('PAYROLL_CATEGORY_CONFIG', CFG_HDR, cfgRows || FOUR.concat([cfgRow('CONTRACT_NSK', 'CONSULTANT', { DISPLAY_NAME: 'Contract VFL' })]));
  env.put('PAYROLL_RATE_PROFILE', RATE_HDR, [{ EMP_ID: 'CX1', PAYROLL_CATEGORY: 'CONTRACT_NSK', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, VERSION_STATE: 'APPROVED' },
    { EMP_ID: 'C1', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, VERSION_STATE: 'APPROVED' }]);
  return env;
}

test('no config tab: the built-in four categories, methods, sites and payslip flags are the defaults', () => {
  const env = fullWorld();
  assert.deepEqual(plain(env.c.populationList()), ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF']);
  assert.deepEqual(plain(env.c.payslipPopulations()), ['STAFF', 'PERMANENT_WORKER']);
  assert.equal(env.c.categoryMethod('PUNE_STAFF'), 'PUNE_STAFF');
  assert.equal(env.c.siteForPopulation('PUNE_STAFF'), 'PUNE');
  assert.equal(env.c.siteForPopulation('STAFF'), 'VFL');
  assert.equal(env.c.populationTab('PERMANENT_WORKER'), 'PAYROLL_WORKER');
  assert.equal(env.c.isKnownPopulation('CONTRACT_NSK'), false);
});

test('config tab rules: active rows only, sites, tabs, payslip flags, unapproved detection, problems', () => {
  const env = world5(FOUR.concat([cfgRow('CONTRACT_NSK', 'CONSULTANT'), cfgRow('OLD_CAT', 'STAFF', { ACTIVE: 'N' }), cfgRow('PUNE_TEMP', 'PUNE_STAFF', { SITE: 'PUNE', APPROVED_BY: '' })]));
  const c = env.c;
  assert.deepEqual(plain(c.populationList()), ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF', 'CONTRACT_NSK', 'PUNE_TEMP']);
  assert.equal(c.isKnownPopulation('OLD_CAT'), false, 'inactive');
  assert.equal(c.isConfiguredCategory('OLD_CAT'), true, 'but configured: not UNKNOWN_CATEGORY');
  assert.equal(c.populationTab('CONTRACT_NSK'), 'PAYROLL_CONTRACT_NSK');
  assert.deepEqual(plain(c.populationsOfSite('PUNE')), ['PUNE_STAFF', 'PUNE_TEMP']);
  assert.deepEqual(plain(c.populationsOfSite('VFL')), ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'CONTRACT_NSK']);
  assert.deepEqual(plain(c.attFormPopulations_(c.ATT_FORM_DEFS.PUNE)), ['PUNE_STAFF', 'PUNE_TEMP'], 'daily forms iterate the configured categories of their site');
  assert.equal(c.categoryMethod('CONTRACT_NSK'), 'CONSULTANT');
  assert.equal(c.categoryEntry('PUNE_TEMP').approvedBy, '');
  assert.deepEqual(plain(c.categoryEntryProblems(c.categoryEntryFromRow(cfgRow('X', 'WEIRD', { SITE: 'MUMBAI', RATE_SOURCE: 'Z', PAYSLIP: 'Y' })))).length, 4);
  // payslip category with the WORKER template
  env.editCells('PAYROLL_CATEGORY_CONFIG', { CATEGORY_CODE: 'CONTRACT_NSK' }, { PAYSLIP: 'Y', PAYSLIP_TEMPLATE_KEY: 'WORKER' });
  assert.deepEqual(plain(c.payslipPopulations()), ['STAFF', 'PERMANENT_WORKER', 'CONTRACT_NSK']);
  assert.equal(c.payslipTemplateKey('CONTRACT_NSK'), 'WORKER');
  assert.equal(c.payslipTokenMap('CONTRACT_NSK'), c.payslipTokenMap('PERMANENT_WORKER'));
  assert.throws(() => c.payslipTokenMap('CONSULTANT'), /No payslip/);
});

test('calcEmployee dispatches on CALC_METHOD; the output row keeps the category code', () => {
  const env = world5();
  const ctx = { period: P, population: 'CONTRACT_NSK', method: 'CONSULTANT', emp: { EMP_ID: 'CX1', EMPLOYEE_NAME: 'n' }, workingDays: 26,
    attendance: { PRESENT_DAYS: 10, PHYSICAL_PRESENT_DAYS: 10, WEEK_OFF: 0, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0 },
    rate: { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700 }, adjustments: {}, cfg: {} };
  const r = plain(env.c.calcEmployee(ctx));
  assert.equal(r.row.POPULATION, 'CONTRACT_NSK');
  assert.equal(r.row.GROSS_EARNINGS, 7000);
  assert.equal(r.row.NET_PAY, 7000);
  const bad = plain(env.c.calcEmployee({ period: P, population: 'NOPE', emp: { EMP_ID: 'x' } }));
  assert.equal(bad.exceptions[0].code, 'UNKNOWN_POPULATION');
});

test('a 5th category (CONSULTANT method) runs the whole chain: period rows, register, attendance, engine, approvals, lock', () => {
  const env = world5();
  const c = env.c;
  // prepareMonth adds the missing period row of the new category (and only that one)
  env.sheets.PAYROLL_PERIOD_CATEGORY.data = env.sheets.PAYROLL_PERIOD_CATEGORY.data.filter((r, i) => i === 0 || r[1] !== 'CONTRACT_NSK');
  const pm = plain(c.prepareMonth(P));
  assert.equal(pm.periodRowsAdded, 1);
  assert.ok(env.rowsOf('PAYROLL_PERIOD_CATEGORY').some((r) => r.PAYROLL_CATEGORY === 'CONTRACT_NSK' && r.WORKING_DAYS === ''));
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'CONTRACT_NSK' }, { WORKING_DAYS: 26 });
  // register lists the new population
  env.user = HR;
  const reg = plain(c.registerLoad(P));
  assert.ok(reg.populations.some((p) => p.population === 'CONTRACT_NSK'));
  const sub = plain(c.registerSubmit({ period: P, includesWO: { CONTRACT_NSK: 'N' }, entries: [{ empId: 'CX1', days: 20 }] }));
  assert.equal(sub.created, 1);
  assert.equal(plain(c.approveAttendance(P, 'CONTRACT_NSK')).approved, 1);
  // engine: only the new population, calculated with the consultant method
  const r = plain(c.calculateDraft(P, 'CONTRACT_NSK'));
  assert.equal(r.populations[0].population, 'CONTRACT_NSK');
  assert.equal(r.populations[0].payable, 1);
  assert.equal(r.readiness.blocked, 0);
  const row = env.rowsOf('PAYROLL_DRAFT').find((x) => x.EMP_ID === 'CX1');
  assert.equal(row.POPULATION, 'CONTRACT_NSK');
  assert.equal(row.PAY_BASIS, 'DAILY_RATE');
  assert.equal(row.NET_PAY, 700 * (20 + 4), 'daily rate x (days present 20 + 4 Sunday week-offs of Sept 2026)');
  assert.equal(env.rowsOf('PAYROLL_CONTRACT_NSK').length, 1, 'output tab PAYROLL_<CODE>');
  assert.ok(env.rowsOf('PAYROLL_RECON').some((x) => x.POPULATION === 'CONTRACT_NSK' && x.TOTAL_NET === 16800));
  // approvals and lock iterate the configured category too
  assert.equal(c.hrApprove(P, 'CONTRACT_NSK').ok, true);
  env.user = ACC;
  assert.equal(c.accountsApprove(P, 'CONTRACT_NSK').ok, true);
  const lk = plain(c.lockPeriod(P, 'CONTRACT_NSK'));
  assert.equal(lk.ok, true);
  assert.equal(lk.rows, 1);
  assert.equal(c.isLocked(P, 'CONTRACT_NSK'), true);
  assert.equal(c.isLocked(P, 'CONSULTANT'), false);
  // an unconfigured population is refused everywhere
  assert.throws(() => c.hrApprove(P, 'NOPE'), /Unknown population/);
  assert.throws(() => c.calculateDraft(P, 'NOPE'), /Unknown population/);
});

test('EMPLOYEE_MASTER category that is not in the config: employee HOLD UNKNOWN_CATEGORY (not population-blocking)', () => {
  const env = world5();
  env.addRows('EMPLOYEE_MASTER', [{ EMP_ID: 'Z1', EMPLOYEE_NAME: 'Typo Cat', PAYROLL_CATEGORY: 'STAF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'D', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'Z2', EMPLOYEE_NAME: 'Blank Cat', PAYROLL_CATEGORY: '', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'D', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'Z3', EMPLOYEE_NAME: 'Retired', PAYROLL_CATEGORY: 'STAF', STATUS_AS_SOURCE: 'Non-Active', DEPARTMENT: 'D', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'Z4', EMPLOYEE_NAME: 'Inactive Cat', PAYROLL_CATEGORY: 'OLD', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'D', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/01/2020' }]);
  env.addRows('PAYROLL_CATEGORY_CONFIG', [cfgRow('OLD', 'STAFF', { ACTIVE: 'N' })]);
  env.user = HR;
  const r = plain(env.c.calculateDraft(P));
  assert.deepEqual(r.unknownCategory.sort(), ['Z1', 'Z2'], 'only active employees of an unconfigured category; an inactive configured category is simply not paid');
  const ex = env.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.CODE === 'UNKNOWN_CATEGORY');
  assert.deepEqual(ex.map((e) => [e.EMP_ID, e.SEVERITY]).sort(), [['Z1', 'HOLD'], ['Z2', 'HOLD']]);
  const rd = env.rowsOf('PAYROLL_READINESS').find((x) => x.CHECK === 'UNKNOWN_CATEGORY');
  assert.equal(rd.STATUS, 'HOLD');
  assert.match(rd.DETAIL, /Z1 \(STAF\), Z2 \(blank\)/);
  assert.ok(!env.rowsOf('PAYROLL_READINESS').some((x) => x.STATUS === 'BLOCKED' && x.CHECK === 'UNKNOWN_CATEGORY'));
  // a single-population run neither writes nor removes them
  env.c.calculateDraft(P, 'STAFF');
  assert.equal(env.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.CODE === 'UNKNOWN_CATEGORY').length, 2);
});

test('owner sign-off of the category config: unapproved rows BLOCK their population until OWNER_APPROVER_EMAIL approves', () => {
  const env = world5(FOUR.concat([cfgRow('CONTRACT_NSK', 'CONSULTANT', { APPROVED_BY: '' })]));
  env.user = HR;
  const rdy = () => plain(env.c.checkReadiness(P, 'CONTRACT_NSK')).rows.find((x) => x.CHECK === 'CATEGORY_CONFIG');
  assert.equal(rdy().STATUS, 'BLOCKED');
  assert.match(rdy().DETAIL, /CONTRACT_NSK is not approved/);
  const plan = plain(env.c.planCategoryApproval());
  assert.equal(plan.toStamp.length, 1);
  assert.equal(plain(env.c.approveCategoryConfig()).reason, 'USER_NOT_OWNER', 'HR cannot sign the category config');
  env.user = OWNER;
  const ok = plain(env.c.approveCategoryConfig());
  assert.equal(ok.ok, true);
  assert.equal(ok.stamped, 1);
  assert.equal(env.rowsOf('PAYROLL_CATEGORY_CONFIG').find((r) => r.CATEGORY_CODE === 'CONTRACT_NSK').APPROVED_BY, OWNER);
  assert.equal(rdy(), undefined, 'no CATEGORY_CONFIG row once approved');
  assert.match(env.rowsOf('AUDIT_LOG').map((a) => a.Message).join('\n'), /CATEGORY_APPROVE.*APPROVED/);
  // a misconfigured row is refused, nothing stamped
  const bad = world5(FOUR.concat([cfgRow('BAD', 'WEIRD', { APPROVED_BY: '' })]));
  bad.user = OWNER;
  const b = plain(bad.c.approveCategoryConfig());
  assert.equal(b.reason, 'CONFIG_PROBLEMS');
  assert.match(b.problems[0], /CALC_METHOD/);
  assert.equal(bad.rowsOf('PAYROLL_CATEGORY_CONFIG').find((r) => r.CATEGORY_CODE === 'BAD').APPROVED_BY, '');
});
