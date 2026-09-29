'use strict';
// Integration tests over a compact in-memory workbook with the REAL feed readers (20_Feeds.gs) wired into the engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, LEAVE_HDR, LEAVE_INPUT_HDR } = require('./fakes');
const { plain } = require('./load');

const P = '2026-09';
const CFG = [['PF_WAGE_CEILING', 15000], ['PF_EMPLOYEE_RATE', 0.12], ['PF_MAX_EMPLOYEE', 1800], ['ESI_EMPLOYEE_RATE', 0.0075], ['ESI_EXEMPT_ABOVE', 21000],
  ['ESI_EMPLOYER_RATE', 0.0325], ['WORKER_VDA_RATE', 103], ['WORKER_HEAT_RATE', 5.78],
  ['PT_SLABS', '[{"min":0,"max":7500,"pt":0},{"min":7500.01,"max":10000,"pt":175},{"min":10000.01,"max":null,"pt":200}]'],
  ['MLWF_EMPLOYEE_RATE', 25], ['PT_FEB_AMOUNT', 300], ['MLWF_MONTHS', '6,12'], ['STAFF_OT_MULTIPLIER', 2], ['WORKER_OT_MULTIPLIER', 2],
  ['STAFF_PF_WAGE_COMPONENTS', 'BASIC,CONVEYANCE,EDUCATION,MEDICAL'],
  ['STAFF_COMPONENT_PCTS', '{"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}'],
  ['EMPLOYER_PF_RATE_STAFF', 0.1301], ['EMPLOYER_PF_RATE_WORKER', 0.1301], ['BONUS_RATE_STAFF', 0.0833], ['GRATUITY_RATE_STAFF', 0.0483],
  ['BONUS_RATE_WORKER', 0.18], ['GRATUITY_RATE_WORKER', 0.0481]];
const ATT_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED',
  'CL_AVAILED', 'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS', 'APPROVAL_STATUS', 'HR_OVERRIDE'];
const PC_HDR = ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE', 'DRAFT_RUN_ID', 'DRAFT_HASH',
  'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'];
const SAL_HDR = ['EMP_ID', 'PAYROLL_CATEGORY', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'BASIC_PM_INR', 'HRA_PM_INR', 'CONVEYANCE_PM_INR', 'EDUCATION_PM_INR', 'MEDICAL_PM_INR',
  'PRO_DEV_PM_INR', 'COMMUNICATION_PM_INR', 'UNIFORM_PM_INR', 'WASHING_PM_INR', 'HEAT_MASTER_INR', 'VDA_MASTER_INR', 'PRODUCTION_MASTER_INR', 'FIXED_GROSS_PM_AS_SOURCE_INR',
  'HR_APPROVED_BY'];
const att = (id, cat, o = {}) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26, PRESENT_DAYS: 22, PHYSICAL_PRESENT_DAYS: 22, WEEK_OFF: 4,
  PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0, APPROVAL_STATUS: 'APPROVED', HR_OVERRIDE: 'N' }, o);

function mini(over = {}) {
  const env = makeEnv();
  env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], []);
  env.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  env.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DEPARTMENT', 'DESIGNATION', 'DOJ_AS_SOURCE'], [
    { EMP_ID: 'S1', EMPLOYEE_NAME: 'Staff', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'HR', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'W1', EMPLOYEE_NAME: 'Worker', PAYROLL_CATEGORY: 'PERMANENT_WORKER', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Forge', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'W2', EMPLOYEE_NAME: 'Worker2', PAYROLL_CATEGORY: 'PERMANENT_WORKER', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Forge', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'NEW1', EMPLOYEE_NAME: 'Joiner', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'HR', DESIGNATION: 'X', DOJ_AS_SOURCE: '25/10/2026' },
  ]);
  env.put('PAYROLL_PERIOD_CATEGORY', PC_HDR, ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((c) => ({ PAYROLL_MONTH: P, PAYROLL_CATEGORY: c, WORKING_DAYS: 26, STATUS: 'PENDING' })));
  env.put('INPUT_ATTENDANCE', ATT_HDR, [att('S1', 'STAFF'), att('W1', 'PERMANENT_WORKER'), att('W2', 'PERMANENT_WORKER')]);
  const staff = { EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: '2026-08-01', BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890, EDUCATION_PM_INR: 1890,
    MEDICAL_PM_INR: 1890, PRO_DEV_PM_INR: 945, COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260, WASHING_PM_INR: 2835, FIXED_GROSS_PM_AS_SOURCE_INR: 31500, HR_APPROVED_BY: 'hr@x' };
  const worker = (id) => ({ EMP_ID: id, PAYROLL_CATEGORY: 'PERMANENT_WORKER', EFFECTIVE_FROM: '2026-08-01', BASIC_PM_INR: 8000, HRA_PM_INR: 3200, CONVEYANCE_PM_INR: 1000,
    EDUCATION_PM_INR: 500, WASHING_PM_INR: 700, HEAT_MASTER_INR: 150, VDA_MASTER_INR: 2575, PRODUCTION_MASTER_INR: 8500, FIXED_GROSS_PM_AS_SOURCE_INR: 30000, HR_APPROVED_BY: 'hr@x' });
  env.put('SALARY_STRUCTURE', SAL_HDR, [staff, worker('W1'), worker('W2')]);
  env.put('PAYROLL_RATE_PROFILE', ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR', 'VERSION_STATE'], []);
  env.put('STATUTORY_CONFIG', ['KEY', 'VALUE', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'VERSION', 'APPROVED_BY'], CFG.map(([KEY, VALUE]) => ({ KEY, VALUE, EFFECTIVE_FROM: '2026-09', VERSION: 1, APPROVED_BY: 'accounts@x' })));
  env.put('EFFICIENCY_CONFIG', ['EFFICIENCY_PERCENT_EXACT', 'INCENTIVE_SLAB_INR', 'IMPLEMENTATION_STATE'],
    [[81, 4500], [82, 5000], [83, 6500], [84, 7500], [85, 8500]].map(([a, b]) => ({ EFFICIENCY_PERCENT_EXACT: a, INCENTIVE_SLAB_INR: b, IMPLEMENTATION_STATE: 'CONFIRMED' })));
  env.put('INPUT_OT', ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'APPROVAL_STATUS', 'NORMALIZER_VERSION', 'ELIGIBILITY']);
  env.put('INPUT_CANTEEN', ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  env.put('INPUT_EFFICIENCY', ['PAYROLL_MONTH', 'EMP_ID', 'EFFICIENCY_PCT', 'PHYSICAL_PRESENT_DAYS_OVERRIDE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  env.put('INPUT_ADVANCE', ['PAYROLL_MONTH', 'EMP_ID', 'OPENING_BALANCE_INR', 'RECOVERY_THIS_MONTH_INR', 'ACCOUNTS_LEDGER_REFERENCE', 'APPROVAL_STATUS']);
  env.put('INPUT_SOCIETY', ['PAYROLL_MONTH', 'EMP_ID', 'GENERAL_EMI_INR', 'EMERGENCY_EMI_INR', 'EDUCATION_EMI_INR', 'SHARES_OTHER_INR', 'TOTAL_RECOVERY_INR', 'APPROVAL_STATUS']);
  env.put('INPUT_ADJUSTMENTS', ['PAYROLL_MONTH', 'EMP_ID', 'ADJUSTMENT_TYPE', 'SIGNED_AMOUNT_INR', 'APPROVAL_STATUS']);
  env.put('Leave_Applications', LEAVE_HDR); // local leave source: no leave, reachable
  env.put('INPUT_LEAVE', LEAVE_INPUT_HDR);
  env.put('FEED_STATUS', ['PERIOD', 'FEED', 'STATUS'], ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'EFFICIENCY', 'LEAVE'].map((FEED) => ({ PERIOD: P, FEED, STATUS: 'COMPLETE' })));
  Object.keys(over).forEach((k) => over[k](env));
  return env;
}
const draft = (env, id) => env.rowsOf('PAYROLL_DRAFT').find((r) => r.EMP_ID === id);
const exc = (env, id) => env.rowsOf('PAYROLL_EXCEPTIONS').filter((r) => r.EMP_ID === id).map((r) => r.SEVERITY + ':' + r.CODE);
const rdy = (env, pop, check) => plain(env.c.checkReadiness(P, pop)).rows.find((r) => r.CHECK === check);
const eff = (id, pct, o = {}) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, EFFICIENCY_PCT: pct, SOURCE: 'FORM_EFFICIENCY', SOURCE_REF: 'EFFICIENCY_FORM_RESPONSES!2', KEY: P + '|' + id, STATUS: 'VALID', ENTERED_AT: '2026-09-28T10:00:00' }, o);

test('legacy PAYROLL_PERIOD_CATEGORY STATUS=APPROVED (working days approved) is accepted like PENDING; unknown status still refused', () => {
  const env = mini({ pc: (e) => {
    e.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { STATUS: 'APPROVED', APPROVED_BY: 'hr-days@x', APPROVED_AT: '2026-09-20T09:00:00' });
    e.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'CONSULTANT' }, { STATUS: 'WEIRD' });
  } });
  assert.throws(() => env.c.calculateDraft(P), /Unknown STATUS "WEIRD"/);
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'CONSULTANT' }, { STATUS: 'APPROVED' });
  const r = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.equal(r.populations[0].statusFrom, 'PENDING');
  assert.equal(r.populations[0].statusTo, 'DRAFT');
  const pc = env.rowsOf('PAYROLL_PERIOD_CATEGORY').find((x) => x.PAYROLL_CATEGORY === 'STAFF');
  assert.equal(pc.STATUS, 'DRAFT');
  assert.equal(pc.APPROVED_BY, 'hr-days@x', 'legacy working-days approver kept');
  assert.equal(pc.APPROVED_AT, '2026-09-20T09:00:00');
  assert.doesNotThrow(() => env.c.calculateDraft(P));
});

test('worker without an efficiency % : production allowance 0 + WARN EFFICIENCY_NOT_SUBMITTED (not a blocker); slab pay otherwise', () => {
  const env = mini({ e: (e) => e.addRows('INPUT_EFFICIENCY', [eff('W2', 83.9)]) });
  const r = plain(env.c.calculateDraft(P, 'PERMANENT_WORKER'));
  assert.equal(r.readiness.blocked, 0);
  assert.equal(draft(env, 'W1').PRODUCTION_ALLOWANCE, 0);
  assert.equal(draft(env, 'W1').EFFICIENCY_DEDUCTION, 0);
  assert.equal(typeof draft(env, 'W1').NET_PAY, 'number');
  assert.ok(exc(env, 'W1').includes('WARN:EFFICIENCY_NOT_SUBMITTED'));
  assert.ok(!exc(env, 'W1').some((x) => /MISSING_EFFICIENCY_PCT|EFFICIENCY_RULE_UNCONFIRMED/.test(x)));
  assert.equal(draft(env, 'W2').PRODUCTION_ALLOWANCE, 6500, 'floor(83.9) = 83 -> 6,500');
  assert.equal(draft(env, 'W2').EFFICIENCY_ELIGIBLE_AMOUNT, 6500);
  assert.equal(draft(env, 'W2').TOTAL_EARNINGS - draft(env, 'W1').TOTAL_EARNINGS, 6500);
});

test('an ALL_WORKERS row no longer applies to anyone', () => {
  const env = mini({ e: (e) => e.addRows('INPUT_EFFICIENCY', [eff('ALL_WORKERS', 90)]) });
  env.c.calculateDraft(P, 'PERMANENT_WORKER');
  assert.equal(draft(env, 'W1').PRODUCTION_ALLOWANCE, 0);
  assert.equal(draft(env, 'W1').EFFICIENCY_PCT, '');
});

test('PHYSICAL_PRESENT_DAYS (VDA): HR value, else efficiency-form override, else PRESENT_DAYS; never a blocker', () => {
  const env = mini({ a: (e) => {
    e.editCells('INPUT_ATTENDANCE', { EMP_ID: 'W1' }, { PHYSICAL_PRESENT_DAYS: '', PRESENT_DAYS: 24 });
    e.editCells('INPUT_ATTENDANCE', { EMP_ID: 'W2' }, { PHYSICAL_PRESENT_DAYS: '', PRESENT_DAYS: 24 });
    e.addRows('INPUT_EFFICIENCY', [eff('W2', 85, { PHYSICAL_PRESENT_DAYS_OVERRIDE: 20 })]);
  } });
  const r = plain(env.c.calculateDraft(P, 'PERMANENT_WORKER'));
  assert.equal(r.readiness.blocked, 0);
  assert.equal(draft(env, 'W1').PHYSICAL_PRESENT_DAYS, 24, 'blank -> Present column (as in August)');
  assert.equal(draft(env, 'W1').VDA, 103 * 24);
  assert.equal(draft(env, 'W2').PHYSICAL_PRESENT_DAYS, 20, 'blank -> efficiency-form override');
  assert.equal(draft(env, 'W2').VDA, 103 * 20);
  assert.ok(exc(env, 'W2').includes('WARN:PHYSICAL_DAYS_FROM_EFFICIENCY_FORM'));
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'W2' }, { PHYSICAL_PRESENT_DAYS: 22 });
  env.c.calculateDraft(P, 'PERMANENT_WORKER');
  assert.equal(draft(env, 'W2').PHYSICAL_PRESENT_DAYS, 22, 'HR-typed value wins over the override');
});

test('canteen / efficiency: an invalid LATEST response never falls back to an older one and BLOCKS readiness until fixed', () => {
  const env = mini({ f: (e) => {
    e.addRows('INPUT_CANTEEN', [
      { PAYROLL_MONTH: P, EMP_ID: 'S1', AMOUNT_INR: 600, SOURCE: 'FORM_CANTEEN', SOURCE_REF: 'CANTEEN_FORM_RESPONSES!2', KEY: P + '|S1', STATUS: 'VALID', ENTERED_AT: '2026-09-27T10:00:00' },
      { PAYROLL_MONTH: P, EMP_ID: 'S1', AMOUNT_INR: '', SOURCE: 'FORM_CANTEEN', SOURCE_REF: 'CANTEEN_FORM_RESPONSES!3', KEY: P + '|S1', STATUS: 'EXCEPTION', ENTERED_AT: '2026-09-28T10:00:00', REMARKS: 'AMOUNT_NEGATIVE' }]);
    e.addRows('INPUT_EFFICIENCY', [eff('W1', 84), eff('W1', '', { STATUS: 'EXCEPTION', REMARKS: 'EFFICIENCY_OUT_OF_RANGE', SOURCE_REF: 'EFFICIENCY_FORM_RESPONSES!3', ENTERED_AT: '2026-09-29T10:00:00' }),
      eff('W2', 84)]);
  } });
  env.c.calculateDraft(P);
  assert.equal(draft(env, 'S1').CANTEEN, 0, 'the older valid 600 is not used');
  assert.equal(draft(env, 'W1').PRODUCTION_ALLOWANCE, 0, 'the older valid 84% is not used');
  assert.equal(draft(env, 'W2').PRODUCTION_ALLOWANCE, 7500);
  const s = rdy(env, 'STAFF', 'CANTEEN_EFFICIENCY_EXCEPTIONS');
  assert.equal(s.STATUS, 'HOLD', 'employee-level: S1 is held, the population is not blocked');
  assert.match(s.DETAIL, /canteen EXCEPTION rows \(1\): S1: AMOUNT_NEGATIVE/);
  assert.match(draft(env, 'S1').FLAGS, /^HOLD;.*CANTEEN_EXCEPTION/);
  assert.equal(draft(env, 'S1').NET_PAY, '');
  const w = rdy(env, 'PERMANENT_WORKER', 'CANTEEN_EFFICIENCY_EXCEPTIONS');
  assert.equal(w.STATUS, 'HOLD');
  assert.match(draft(env, 'W1').FLAGS, /^HOLD;.*EFFICIENCY_EXCEPTION/);
  assert.match(w.DETAIL, /efficiency EXCEPTION rows \(1\): W1: EFFICIENCY_OUT_OF_RANGE/);
  assert.equal(rdy(env, 'CONSULTANT', 'CANTEEN_EFFICIENCY_EXCEPTIONS').STATUS, 'READY', 'other populations unaffected');
  // HR fixes both with later valid rows: exceptions clear, values apply
  env.addRows('INPUT_CANTEEN', [{ PAYROLL_MONTH: P, EMP_ID: 'S1', AMOUNT_INR: 450, SOURCE: 'HR_MANUAL', KEY: P + '|S1', STATUS: 'VALID', ENTERED_AT: '2026-09-29T11:00:00' }]);
  env.addRows('INPUT_EFFICIENCY', [eff('W1', 85, { ENTERED_AT: '2026-09-29T11:00:00', SOURCE_REF: 'EFFICIENCY_FORM_RESPONSES!4' })]);
  env.c.calculateDraft(P);
  assert.equal(draft(env, 'S1').CANTEEN, 450);
  assert.equal(draft(env, 'W1').PRODUCTION_ALLOWANCE, 8500);
  assert.equal(rdy(env, 'STAFF', 'CANTEEN_EFFICIENCY_EXCEPTIONS').STATUS, 'READY');
  assert.equal(rdy(env, 'PERMANENT_WORKER', 'CANTEEN_EFFICIENCY_EXCEPTIONS').STATUS, 'READY');
});

test('society components + total mismatch WARN; advance recovery > balance WARN; duplicate ledger reference BLOCKER (NET withheld)', () => {
  const env = mini({ f: (e) => {
    e.addRows('INPUT_SOCIETY', [
      { PAYROLL_MONTH: P, EMP_ID: 'S1', GENERAL_EMI_INR: 1000, EMERGENCY_EMI_INR: 500, SHARES_OTHER_INR: 100, TOTAL_RECOVERY_INR: '', APPROVAL_STATUS: 'APPROVED' },
      { PAYROLL_MONTH: P, EMP_ID: 'W1', GENERAL_EMI_INR: 1000, TOTAL_RECOVERY_INR: 1200, APPROVAL_STATUS: 'APPROVED' }]);
    e.addRows('INPUT_ADVANCE', [
      { PAYROLL_MONTH: P, EMP_ID: 'W2', OPENING_BALANCE_INR: 1000, RECOVERY_THIS_MONTH_INR: 1500, ACCOUNTS_LEDGER_REFERENCE: 'LG-1', APPROVAL_STATUS: 'APPROVED' },
      { PAYROLL_MONTH: P, EMP_ID: 'S1', OPENING_BALANCE_INR: 5000, RECOVERY_THIS_MONTH_INR: 500, ACCOUNTS_LEDGER_REFERENCE: 'LG-9', APPROVAL_STATUS: 'APPROVED' },
      { PAYROLL_MONTH: P, EMP_ID: 'S1', OPENING_BALANCE_INR: 5000, RECOVERY_THIS_MONTH_INR: 500, ACCOUNTS_LEDGER_REFERENCE: 'lg-9', APPROVAL_STATUS: 'APPROVED' }]);
  } });
  env.c.calculateDraft(P);
  assert.equal(draft(env, 'S1').SOCIETY, 1600, 'component sum used when TOTAL_RECOVERY_INR is blank');
  assert.equal(draft(env, 'W1').SOCIETY, 1200, 'total wins when both are present');
  assert.ok(exc(env, 'W1').includes('WARN:SOCIETY_TOTAL_MISMATCH'));
  assert.ok(!exc(env, 'S1').some((x) => /SOCIETY_TOTAL_MISMATCH/.test(x)));
  assert.equal(draft(env, 'W2').ADVANCE, 1500);
  assert.ok(exc(env, 'W2').includes('WARN:ADVANCE_RECOVERY_EXCEEDS_BALANCE'));
  assert.equal(typeof draft(env, 'W2').NET_PAY, 'number');
  assert.equal(draft(env, 'S1').NET_PAY, '', 'NET withheld while the employee is held');
  assert.equal(rdy(env, 'STAFF', 'CALC_BLOCKERS').STATUS, 'HOLD');
  assert.ok(exc(env, 'S1').includes('HOLD:ADVANCE_DUPLICATE_LEDGER_REFERENCE'));
  assert.match(draft(env, 'S1').FLAGS, /^HOLD;/);
});

test('roster: employee with DOJ after the period end is not calculated', () => {
  const env = mini();
  env.c.calculateDraft(P, 'STAFF');
  assert.deepEqual(env.rowsOf('PAYROLL_DRAFT').map((r) => r.EMP_ID), ['S1'], 'NEW1 joins on 25 Oct');
});

test('gates: unsigned SALARY_STRUCTURE / STATUTORY_CONFIG rows and unapproved rate profiles block; proxy warns', () => {
  const env = mini({ g: (e) => {
    e.editCells('SALARY_STRUCTURE', { EMP_ID: 'W2' }, { HR_APPROVED_BY: '' });
    e.editCells('STATUTORY_CONFIG', { KEY: 'PT_SLABS' }, { APPROVED_BY: '' });
  } });
  const w = rdy(env, 'PERMANENT_WORKER', 'PAY_STRUCTURE_APPROVED');
  // W1 is approved, so the unapproved W2 is a per-employee HOLD (SALARY_NOT_APPROVED), not a population blocker
  assert.equal(w.STATUS, 'HOLD');
  assert.match(w.DETAIL, /SALARY_NOT_APPROVED.*W2/);
  assert.ok(!/W1/.test(w.DETAIL));
  // NO approved row in the population = the initial sign-off is missing: population-level BLOCKER
  const none = mini({ g: (e) => {
    e.editCells('SALARY_STRUCTURE', { EMP_ID: 'W1' }, { HR_APPROVED_BY: '' });
    e.editCells('SALARY_STRUCTURE', { EMP_ID: 'W2' }, { HR_APPROVED_BY: '' });
  } });
  const nb = rdy(none, 'PERMANENT_WORKER', 'PAY_STRUCTURE_APPROVED');
  assert.equal(nb.STATUS, 'BLOCKED');
  assert.match(nb.DETAIL, /not HR-approved for this population.*W1, W2/);
  assert.equal(rdy(env, 'STAFF', 'PAY_STRUCTURE_APPROVED').STATUS, 'READY');
  const st = rdy(env, 'STAFF', 'STATUTORY_CONFIG');
  assert.equal(st.STATUS, 'BLOCKED');
  assert.match(st.DETAIL, /not approved by Accounts.*PT_SLABS/);
  // consultants / Pune: state from PAYROLL_RATE_PROFILE
  const e2 = mini({ r: (e) => {
    e.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DOJ_AS_SOURCE'], [
      { EMP_ID: 'C1', PAYROLL_CATEGORY: 'CONSULTANT', STATUS_AS_SOURCE: 'Active' }, { EMP_ID: 'C2', PAYROLL_CATEGORY: 'CONSULTANT', STATUS_AS_SOURCE: 'Active' },
      { EMP_ID: 'C3', PAYROLL_CATEGORY: 'CONSULTANT', STATUS_AS_SOURCE: 'Active' }]);
    e.put('PAYROLL_RATE_PROFILE', ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR', 'VERSION_STATE'], [
      { EMP_ID: 'C1', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, VERSION_STATE: 'USER_APPROVED_JULY_PROXY' },
      { EMP_ID: 'C2', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, VERSION_STATE: 'STAGED_AUG2026_UNAPPROVED' },
      { EMP_ID: 'C3', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, VERSION_STATE: '' }]);
    e.put('INPUT_ATTENDANCE', ATT_HDR, ['C1', 'C2', 'C3'].map((id) => att(id, 'CONSULTANT')));
  } });
  const c = rdy(e2, 'CONSULTANT', 'PAY_STRUCTURE_APPROVED');
  assert.equal(c.STATUS, 'HOLD');
  assert.match(c.DETAIL, /SALARY_NOT_APPROVED.*VERSION_STATE not approved.*C2/);
  assert.match(c.DETAIL, /PROXY_RATE_JUL2026: 1 employee/);
  e2.c.calculateDraft(P, 'CONSULTANT');
  assert.ok(exc(e2, 'C1').includes('WARN:PROXY_RATE_JUL2026'));
  assert.ok(!exc(e2, 'C3').some((x) => /PROXY/.test(x)));
});
