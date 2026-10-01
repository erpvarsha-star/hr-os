'use strict';
// 22_Advance.gs (advance ledger, society carry-forward) and 63_CorrectionsLog.gs (onEdit watch-list).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

function setup(opts) {
  const env = makeEnv(opts);
  env.c.hrosSetup();
  return env;
}

const ledgerRow = (o) => Object.assign({ EMP_ID: 'VFL1', LOAN_ID: 'ADV-VFL1-1', OPENING_AMOUNT_INR: 1000,
  MONTHLY_INSTALMENT_INR: 200, OPENING_DATE: '2026-08-01', SOURCE: 'FORM', SOURCE_REF: '', OUTSTANDING_BALANCE_INR: 1000,
  STATUS: 'OPEN', CLOSED_AT: '', NOTE: '' }, o);

// ---------------------------------------------------------------- opening-balance import

test('advanceImportOpeningBalances: creates OPEN ledger rows; refuses a duplicate OPEN EMP_ID; force overrides', () => {
  const env = setup();
  const res = env.c.advanceImportOpeningBalances([{ empId: 'vfl1', outstanding: 5000, monthlyInstalment: 500, note: 'carried' },
    { empId: 'vfl2', outstanding: 2000 }]);
  assert.equal(res.ok, true);
  assert.equal(res.written, 2);
  const rows = env.rowsOf('ADVANCE_LEDGER');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].EMP_ID, 'VFL1');
  assert.equal(rows[0].LOAN_ID, 'ADV-VFL1-1');
  assert.equal(rows[0].SOURCE, 'ONE_TIME_IMPORT');
  assert.equal(rows[0].OUTSTANDING_BALANCE_INR, 5000);
  assert.equal(rows[1].MONTHLY_INSTALMENT_INR, 2000, 'blank instalment defaults to the full outstanding amount');

  // a second import for VFL1 (still OPEN) is refused, nothing written
  const refused = env.c.advanceImportOpeningBalances([{ empId: 'VFL1', outstanding: 100 }]);
  assert.equal(refused.ok, false);
  assert.equal(refused.errors[0].empId, 'VFL1');
  assert.equal(env.rowsOf('ADVANCE_LEDGER').length, 2, 'nothing written on refusal');

  // force bypasses the duplicate check and gets the next sequence number
  const forced = env.c.advanceImportOpeningBalances([{ empId: 'VFL1', outstanding: 100, monthlyInstalment: 50 }], { force: true });
  assert.equal(forced.ok, true);
  assert.equal(forced.written, 1);
  const rows2 = env.rowsOf('ADVANCE_LEDGER');
  assert.equal(rows2.length, 3);
  assert.equal(rows2[2].LOAN_ID, 'ADV-VFL1-2');
});

test('planAdvanceImport refuses on a bad row and a duplicate within the same batch; writes nothing', () => {
  const env = setup();
  const plan = env.c.planAdvanceImport([{ empId: '', outstanding: 10 }], {}, {});
  assert.equal(plan.ok, false);
  assert.equal(plan.toAppend.length, 0);
  const dup = env.c.planAdvanceImport([{ empId: 'VFL9', outstanding: 10, monthlyInstalment: 5 }, { empId: 'VFL9', outstanding: 20, monthlyInstalment: 5 }], {}, {});
  assert.equal(dup.ok, false);
  assert.match(dup.errors[0].reason, /duplicate/);
});

test('advance_parseImportText: EMP_ID, amount[, instalment] per line', () => {
  const env = setup();
  const parsed = env.c.advance_parseImportText('VFL1, 1000, 200\nVFL2,500\nbadline');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.rows[0].outstanding, '1000');
});

// ---------------------------------------------------------------- Google Form ingestion (sync, no duplicates)

const ADV_HDR = ['Timestamp', 'EMP ID', 'Loan Amount', 'Monthly Instalment', 'Loan Date', 'Reason'];

test('syncAdvanceLoans: ingests new rows from the Advance/Loan form tab; re-running never duplicates', () => {
  const env = setup();
  env.put('Advance Loan Form Responses', ADV_HDR, [
    { Timestamp: '2026-09-01', 'EMP ID': 'vfl1', 'Loan Amount': 3000, 'Monthly Instalment': 300, 'Loan Date': '2026-09-01', Reason: 'medical' },
    { Timestamp: '2026-09-02', 'EMP ID': '', 'Loan Amount': 100, 'Monthly Instalment': '', 'Loan Date': '', Reason: 'x' },
  ]);
  const res1 = env.c.syncAdvanceLoans();
  assert.equal(res1.written, 1);
  assert.equal(res1.skipped, 1);
  const rows = env.rowsOf('ADVANCE_LEDGER');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].EMP_ID, 'VFL1');
  assert.equal(rows[0].LOAN_ID, 'ADV-VFL1-1');
  assert.equal(rows[0].SOURCE, 'FORM');

  // re-sync: no new rows
  const res2 = env.c.syncAdvanceLoans();
  assert.equal(res2.written, 0);
  assert.equal(env.rowsOf('ADVANCE_LEDGER').length, 1);

  // a second genuine loan appends with the next sequence
  env.addRows('Advance Loan Form Responses', [{ Timestamp: '2026-09-05', 'EMP ID': 'VFL1', 'Loan Amount': 1000, 'Monthly Instalment': 100, 'Loan Date': '2026-09-05', Reason: 'y' }]);
  const res3 = env.c.syncAdvanceLoans();
  assert.equal(res3.written, 1);
  assert.equal(env.rowsOf('ADVANCE_LEDGER')[1].LOAN_ID, 'ADV-VFL1-2');
});

test('routeFormSubmit + hrosOnFormSubmit route the configured Advance/Loan tab to syncAdvanceLoans', () => {
  const env = setup();
  env.put('Advance Loan Form Responses', ADV_HDR, [{ Timestamp: '2026-09-01', 'EMP ID': 'VFL1', 'Loan Amount': 500, 'Monthly Instalment': 100, 'Loan Date': '2026-09-01', Reason: '' }]);
  assert.equal(env.c.routeFormSubmit('Advance Loan Form Responses', '', env.c.advance_sourceTabName_()), 'ADVANCE_LOAN');
  const e = { range: { getSheet: () => env.sheets['Advance Loan Form Responses'], getRow: () => 2 }, namedValues: {} };
  env.c.hrosOnFormSubmit(e);
  assert.equal(env.rowsOf('ADVANCE_LEDGER').length, 1);
});

// ---------------------------------------------------------------- monthly recovery proposal

test('advanceGenerateRecoveries: caps at outstanding, sums multiple loans into one row, skips hand-edited and approved rows', () => {
  const env = setup();
  env.put('ADVANCE_LEDGER', plain(env.c.HROS_ADVANCE_LEDGER_HEADERS), [
    ledgerRow({ EMP_ID: 'VFL1', LOAN_ID: 'ADV-VFL1-1', MONTHLY_INSTALMENT_INR: 200, OUTSTANDING_BALANCE_INR: 50 }), // caps at 50
    ledgerRow({ EMP_ID: 'VFL2', LOAN_ID: 'ADV-VFL2-1', OPENING_DATE: '2026-08-01', MONTHLY_INSTALMENT_INR: 100, OUTSTANDING_BALANCE_INR: 1000 }),
    ledgerRow({ EMP_ID: 'VFL2', LOAN_ID: 'ADV-VFL2-2', OPENING_DATE: '2026-08-05', MONTHLY_INSTALMENT_INR: 150, OUTSTANDING_BALANCE_INR: 1000 }),
    ledgerRow({ EMP_ID: 'VFL3', LOAN_ID: 'ADV-VFL3-1', MONTHLY_INSTALMENT_INR: 100, OUTSTANDING_BALANCE_INR: 1000, STATUS: 'CLOSED' }),
  ]);
  const res = env.c.advanceGenerateRecoveries('2026-09');
  assert.equal(res.created, 2); // VFL1 and VFL2; VFL3's loan is CLOSED
  const rows = env.rowsOf('INPUT_ADVANCE');
  const byEmp = Object.fromEntries(rows.map((r) => [r.EMP_ID, r]));
  assert.equal(byEmp.VFL1.RECOVERY_THIS_MONTH_INR, 50, 'capped at outstanding');
  assert.equal(byEmp.VFL1.APPROVAL_STATUS, 'PENDING');
  assert.equal(byEmp.VFL1.REMARKS, 'AUTO_RECOVERY');
  assert.equal(byEmp.VFL2.RECOVERY_THIS_MONTH_INR, 250, 'sums two open loans');
  assert.equal(byEmp.VFL2.SOURCE_BATCH_ID, 'ADV-VFL2-1,ADV-VFL2-2');
  assert.equal(byEmp.VFL3, undefined);

  // approve VFL1's row: a second run must not touch it
  env.editCells('INPUT_ADVANCE', { EMP_ID: 'VFL1' }, { APPROVAL_STATUS: 'APPROVED' });
  // hand-edit VFL2's remarks (simulating HR editing the row)
  env.editCells('INPUT_ADVANCE', { EMP_ID: 'VFL2' }, { REMARKS: 'HR note' });
  const res2 = env.c.advanceGenerateRecoveries('2026-09');
  assert.deepEqual(plain(res2.skippedApproved), ['VFL1']);
  assert.deepEqual(plain(res2.skippedHandEdited), ['VFL2']);
  assert.equal(res2.created, 0);
  assert.equal(res2.updated, 0);
  const rows2 = env.rowsOf('INPUT_ADVANCE');
  assert.equal(rows2.find((r) => r.EMP_ID === 'VFL1').APPROVAL_STATUS, 'APPROVED', 'approved row untouched');
  assert.equal(rows2.find((r) => r.EMP_ID === 'VFL2').REMARKS, 'HR note', 'hand-edited row untouched');
});

// ---------------------------------------------------------------- lock-time ledger decrement (direct unit tests)

test('advanceApplyLockRecoveries_: decrements one loan, closes it at zero, never negative; multi-loan oldest-first; untouched employees unaffected', () => {
  const env = setup();
  env.put('ADVANCE_LEDGER', plain(env.c.HROS_ADVANCE_LEDGER_HEADERS), [
    ledgerRow({ EMP_ID: 'VFL1', LOAN_ID: 'ADV-VFL1-1', OPENING_DATE: '2026-07-01', MONTHLY_INSTALMENT_INR: 100, OUTSTANDING_BALANCE_INR: 100 }),
    ledgerRow({ EMP_ID: 'VFL1', LOAN_ID: 'ADV-VFL1-2', OPENING_DATE: '2026-08-01', MONTHLY_INSTALMENT_INR: 100, OUTSTANDING_BALANCE_INR: 500 }),
    ledgerRow({ EMP_ID: 'VFL2', LOAN_ID: 'ADV-VFL2-1', OPENING_DATE: '2026-08-01', MONTHLY_INSTALMENT_INR: 50, OUTSTANDING_BALANCE_INR: 500 }),
  ]);
  env.put('INPUT_ADVANCE', plain(env.c.HROS_INPUT_ADVANCE_HEADERS), [
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'VFL1', RECOVERY_THIS_MONTH_INR: 150, APPROVAL_STATUS: 'APPROVED', REMARKS: 'AUTO_RECOVERY' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'VFL2', RECOVERY_THIS_MONTH_INR: 50, APPROVAL_STATUS: 'APPROVED', REMARKS: 'AUTO_RECOVERY' },
  ]);
  // only VFL1 was actually locked this run; VFL2's approved recovery must not be touched yet
  const summary = env.c.advanceApplyLockRecoveries_('2026-09', 'STAFF', ['VFL1']);
  assert.equal(summary.employeesTouched, 1);
  assert.equal(summary.closed, 1);
  const ledger = env.rowsOf('ADVANCE_LEDGER');
  const l1 = ledger.find((r) => r.LOAN_ID === 'ADV-VFL1-1'), l2 = ledger.find((r) => r.LOAN_ID === 'ADV-VFL1-2');
  const l3 = ledger.find((r) => r.LOAN_ID === 'ADV-VFL2-1');
  assert.equal(l1.OUTSTANDING_BALANCE_INR, 0, 'oldest loan recovered first');
  assert.equal(l1.STATUS, 'CLOSED');
  assert.notEqual(l1.CLOSED_AT, '');
  assert.equal(l2.OUTSTANDING_BALANCE_INR, 450, 'remaining 50 of the 150 recovery hits the second loan');
  assert.equal(l2.STATUS, 'OPEN');
  assert.equal(l3.OUTSTANDING_BALANCE_INR, 500, 'VFL2 was not in the locked list: untouched');
});

test('advanceApplyLockRecoveries_: a non-APPROVED or hand-edited (non AUTO_RECOVERY) row is never applied', () => {
  const env = setup();
  env.put('ADVANCE_LEDGER', plain(env.c.HROS_ADVANCE_LEDGER_HEADERS), [
    ledgerRow({ EMP_ID: 'VFL1', LOAN_ID: 'ADV-VFL1-1', OUTSTANDING_BALANCE_INR: 500 }),
  ]);
  env.put('INPUT_ADVANCE', plain(env.c.HROS_INPUT_ADVANCE_HEADERS), [
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'VFL1', RECOVERY_THIS_MONTH_INR: 150, APPROVAL_STATUS: 'PENDING', REMARKS: 'AUTO_RECOVERY' },
  ]);
  const summary = env.c.advanceApplyLockRecoveries_('2026-09', 'STAFF', ['VFL1']);
  assert.equal(summary.employeesTouched, 0);
  assert.equal(env.rowsOf('ADVANCE_LEDGER')[0].OUTSTANDING_BALANCE_INR, 500);
});

test('advance_decrementPlan_: never goes negative; advanceApplyLockRecoveries_ swallows a throwing lookup instead of failing', () => {
  const env = setup();
  const plan = env.c.advance_decrementPlan_([{ _row: 2, OUTSTANDING_BALANCE_INR: 30, LOAN_ID: 'A' }], 100);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].newBalance, 0);
  assert.equal(plan[0].closed, true);
  // force readObjects(TABS.INPUT_ADVANCE) to throw by pointing TABS.INPUT_ADVANCE at a tab that was never created
  const saved = env.c.TABS.INPUT_ADVANCE;
  env.c.TABS.INPUT_ADVANCE = 'NO_SUCH_TAB';
  const result = env.c.advanceApplyLockRecoveries_('2026-09', 'STAFF', ['VFL1']);
  assert.equal(result, null, 'swallowed, returns null instead of throwing');
  env.c.TABS.INPUT_ADVANCE = saved;
});

// ---------------------------------------------------------------- lock-time ledger decrement (integration via lockPeriod)

const P = '2026-09', HR_EMAIL = 'hr@varshaforgings.com', ACC_EMAIL = 'accounts@varshaforgings.com';
const cfgKV = [
  ['PF_WAGE_CEILING', 15000], ['PF_EMPLOYEE_RATE', 0.12], ['PF_MAX_EMPLOYEE', 1800], ['ESI_EMPLOYEE_RATE', 0.0075],
  ['ESI_EXEMPT_ABOVE', 21000], ['ESI_EMPLOYER_RATE', 0.0325], ['WORKER_VDA_RATE', 103], ['WORKER_HEAT_RATE', 5.78],
  ['PT_SLABS', '[{"min":0,"max":7500,"pt":0},{"min":7500.01,"max":10000,"pt":175},{"min":10000.01,"max":null,"pt":200}]'],
  ['MLWF_EMPLOYEE_RATE', 25], ['PT_FEB_AMOUNT', 300], ['MLWF_MONTHS', '6,12'], ['STAFF_OT_MULTIPLIER', 2],
  ['WORKER_OT_MULTIPLIER', 2], ['STAFF_PF_WAGE_COMPONENTS', 'BASIC,CONVEYANCE,EDUCATION,MEDICAL'],
  ['STAFF_COMPONENT_PCTS', '{"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}'],
  ['EMPLOYER_PF_RATE_STAFF', 0.1301], ['EMPLOYER_PF_RATE_WORKER', 0.1301], ['BONUS_RATE_STAFF', 0.0833],
  ['GRATUITY_RATE_STAFF', 0.0483], ['BONUS_RATE_WORKER', 0.18], ['GRATUITY_RATE_WORKER', 0.0481],
];

test('lockPeriod (real engine): a LOCKED employee with an APPROVED AUTO_RECOVERY row decrements ADVANCE_LEDGER; never fails the lock', () => {
  const env = setup();
  env.user = HR_EMAIL;
  env.c.setControl('LEAVE_SOURCE_SPREADSHEET_ID', '');
  env.put('Leave_Applications', require('./fakes').LEAVE_HDR, []);
  env.put('EMPLOYEE_MASTER', plain(env.c.HROS_EMPLOYEE_MASTER_HEADERS), [
    { EMP_ID: 'E1', EMPLOYEE_NAME: 'Staff One', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'HR', DESIGNATION: 'Exec', DOJ_AS_SOURCE: '01/01/2020' },
  ]);
  env.put('PAYROLL_PERIOD_CATEGORY', plain(env.c.HROS_PERIOD_CATEGORY_HEADERS),
    ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((cat) => ({ PAYROLL_MONTH: P, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26, STATUS: 'PENDING' })));
  env.editCells('PAYROLL_CATEGORY_CONFIG', { CATEGORY_CODE: 'STAFF' }, { APPROVED_BY: 'owner', APPROVED_AT: 't' });
  env.put('INPUT_ATTENDANCE', plain(env.c.HROS_INPUT_ATTENDANCE_HEADERS), [
    { PAYROLL_MONTH: P, EMP_ID: 'E1', PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 26, PRESENT_DAYS: 22, PHYSICAL_PRESENT_DAYS: 22,
      WEEK_OFF: 4, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0, APPROVAL_STATUS: 'APPROVED', HR_OVERRIDE: 'N' },
  ]);
  env.put('SALARY_STRUCTURE', plain(env.c.HROS_SALARY_STRUCTURE_HEADERS), [{ EMP_ID: 'E1', PAYROLL_CATEGORY: 'STAFF',
    EFFECTIVE_FROM: '2026-09-01', EFFECTIVE_TO: '', BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890,
    EDUCATION_PM_INR: 1890, MEDICAL_PM_INR: 1890, PRO_DEV_PM_INR: 945, COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260,
    WASHING_PM_INR: 2835, FIXED_GROSS_PM_AS_SOURCE_INR: 31500, HR_APPROVED_BY: 'hr@x', HR_APPROVED_AT: 't' }]);
  env.put('INPUT_OT', plain(env.c.HROS_INPUT_OT_HEADERS), []);
  env.put('INPUT_ADJUSTMENTS', plain(env.c.HROS_INPUT_ADJUSTMENTS_HEADERS), []);
  const statutoryRows = cfgKV.map(([KEY, VALUE]) => ({ KEY, VALUE, EFFECTIVE_FROM: '2026-09', EFFECTIVE_TO: '', VERSION: 1, APPROVED_BY: 'accounts@x', APPROVED_AT: 't' }));
  env.put('STATUTORY_CONFIG', plain(env.c.HROS_STATUTORY_HEADERS), statutoryRows);
  env.put('EFFICIENCY_CONFIG', plain(env.c.HROS_EFFICIENCY_HEADERS), [{ EFFICIENCY_PERCENT_EXACT: 85, INCENTIVE_SLAB_INR: 8500, IMPLEMENTATION_STATE: 'PENDING' }]);
  env.put('FEED_STATUS', ['PERIOD', 'FEED', 'STATUS'],
    ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'EFFICIENCY', 'LEAVE'].map((FEED) => ({ PERIOD: P, FEED, STATUS: 'COMPLETE' })));
  env.put('ADVANCE_LEDGER', plain(env.c.HROS_ADVANCE_LEDGER_HEADERS), [
    ledgerRow({ EMP_ID: 'E1', LOAN_ID: 'ADV-E1-1', OPENING_DATE: '2026-08-01', MONTHLY_INSTALMENT_INR: 200, OUTSTANDING_BALANCE_INR: 150 }),
  ]);
  env.put('INPUT_ADVANCE', plain(env.c.HROS_INPUT_ADVANCE_HEADERS), [
    { PAYROLL_MONTH: P, EMP_ID: 'E1', RECOVERY_THIS_MONTH_INR: 150, APPROVAL_STATUS: 'APPROVED', REMARKS: 'AUTO_RECOVERY' },
  ]);

  env.c.calculateDraft(P, 'STAFF');
  env.user = HR_EMAIL; assert.equal(env.c.hrApprove(P, 'STAFF').ok, true);
  env.user = ACC_EMAIL; assert.equal(env.c.accountsApprove(P, 'STAFF').ok, true);
  env.user = ACC_EMAIL;
  const res = env.c.lockPeriod(P, 'STAFF');
  assert.equal(res.ok, true, JSON.stringify(res));
  const ledger = env.rowsOf('ADVANCE_LEDGER');
  assert.equal(ledger[0].OUTSTANDING_BALANCE_INR, 0);
  assert.equal(ledger[0].STATUS, 'CLOSED');
});

test('advance_decrementPlan_: never goes negative; a throwing decrement never fails the lock', () => {
  const env = setup();
  const plan = env.c.advance_decrementPlan_([{ _row: 2, OUTSTANDING_BALANCE_INR: 30, LOAN_ID: 'A' }], 100);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].newBalance, 0);
  assert.equal(plan[0].closed, true);
  // a bad TABS name / missing sheet must not throw out of the wrapper
  const saved = env.c.TABS.ADVANCE_LEDGER;
  env.c.TABS.ADVANCE_LEDGER = 'NO_SUCH_TAB';
  const result = env.c.advanceApplyLockRecoveries_('2026-09', 'STAFF', ['VFL1']);
  assert.equal(result, null, 'swallowed, returns null instead of throwing');
  env.c.TABS.ADVANCE_LEDGER = saved;
});

// ---------------------------------------------------------------- society carry-forward

const SOC_HDR_KEY = 'HROS_INPUT_SOCIETY_HEADERS';

test('societyGenerateCarryforward: carries the latest APPROVED EMI forward for active employees; skips hand-edited/approved/inactive', () => {
  const env = setup();
  env.put('EMPLOYEE_MASTER', plain(env.c.HROS_EMPLOYEE_MASTER_HEADERS), [
    { EMP_ID: 'VFL1', EMPLOYEE_NAME: 'A', STATUS_AS_SOURCE: 'Active', PAYROLL_CATEGORY: 'STAFF', DOJ_AS_SOURCE: '2020-01-01' },
    { EMP_ID: 'VFL2', EMPLOYEE_NAME: 'B', STATUS_AS_SOURCE: 'Non-Active', PAYROLL_CATEGORY: 'STAFF', DOJ_AS_SOURCE: '2020-01-01' },
  ]);
  env.put('INPUT_SOCIETY', plain(env.c[SOC_HDR_KEY]), [
    { PAYROLL_MONTH: '2026-08', EMP_ID: 'VFL1', SOCIETY_NAME: 'S1', TOTAL_RECOVERY_INR: 300, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-08', EMP_ID: 'VFL1', SOCIETY_NAME: 'S1-later', TOTAL_RECOVERY_INR: 400, APPROVAL_STATUS: 'APPROVED' }, // later row wins (latest)
    { PAYROLL_MONTH: '2026-08', EMP_ID: 'VFL2', SOCIETY_NAME: 'S2', TOTAL_RECOVERY_INR: 100, APPROVAL_STATUS: 'APPROVED' }, // VFL2 inactive now
  ]);
  const res = env.c.societyGenerateCarryforward('2026-09');
  assert.equal(res.created, 1);
  assert.deepEqual(plain(res.skippedInactive), ['VFL2']);
  const rows = env.rowsOf('INPUT_SOCIETY').filter((r) => r.PAYROLL_MONTH === '2026-09');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].EMP_ID, 'VFL1');
  assert.equal(rows[0].TOTAL_RECOVERY_INR, 400, 'the LATEST approved row of the previous period wins');
  assert.equal(rows[0].SOCIETY_NAME, 'S1-later');
  assert.equal(rows[0].APPROVAL_STATUS, 'PENDING');
  assert.equal(rows[0].REMARKS, 'AUTO_CARRYFORWARD');

  // approve it, then re-run: untouched
  env.editCells('INPUT_SOCIETY', { EMP_ID: 'VFL1', PAYROLL_MONTH: '2026-09' }, { APPROVAL_STATUS: 'APPROVED' });
  const res2 = env.c.societyGenerateCarryforward('2026-09');
  assert.deepEqual(plain(res2.skippedApproved), ['VFL1']);

  // next month: a hand-edited Sept row (different REMARKS) means October carry-forward must be skipped too... actually
  // October carries from Sept's approved row regardless of how Sept was produced, so instead verify hand-edit
  // detection using a fresh PENDING row with different remarks.
  env.put('INPUT_SOCIETY', plain(env.c[SOC_HDR_KEY]), [
    { PAYROLL_MONTH: '2026-08', EMP_ID: 'VFL1', SOCIETY_NAME: 'S1', TOTAL_RECOVERY_INR: 300, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'VFL1', SOCIETY_NAME: 'S1', TOTAL_RECOVERY_INR: 999, APPROVAL_STATUS: 'PENDING', REMARKS: 'HR typed this' },
  ]);
  const res3 = env.c.societyGenerateCarryforward('2026-09');
  assert.deepEqual(plain(res3.skippedHandEdited), ['VFL1']);
});

// ---------------------------------------------------------------- corrections log

test('correctionsLogWatchList_ matches hrosTabSpecs_ protect list exactly (plus the dynamic form tabs), never includes CORRECTIONS_LOG', () => {
  const env = setup();
  const watch = env.c.correctionsLogWatchList_();
  assert.ok(watch.indexOf('CORRECTIONS_LOG') < 0);
  const expectedProtected = plain(env.c.hrosTabSpecs_()).filter((s) => s.protect && s.protect.length && s.name !== 'CORRECTIONS_LOG').map((s) => s.name);
  expectedProtected.forEach((n) => assert.ok(watch.indexOf(n) >= 0, n + ' missing from onEdit watch-list'));
  watch.forEach((n) => {
    const inSpecs = expectedProtected.indexOf(n) >= 0;
    const isDynForm = ['OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES', 'ATT_FORM_VFL_RAW',
      'ATT_FORM_PUNE_RAW', 'ATT_MONTHLY_VFL_RAW', 'ATT_MONTHLY_PUNE_RAW', 'Overtime_Form', 'Advance Loan Form Responses'].indexOf(n) >= 0;
    assert.ok(inSpecs || isDynForm, n + ' is on the watch-list but not protected and not a known dynamic form tab');
  });
});

test('onEdit: logs a single-cell edit on a protected system tab to CORRECTIONS_LOG; ignores an unprotected tab and self-edits', () => {
  const env = setup({ user: 'hr@varshaforgings.com' });
  env.editCells('AUDIT_LOG', {}, {}); // no-op, just ensure sheet exists with header
  const sheet = env.sheets['AUDIT_LOG'];
  env.c.onEdit({ range: { getSheet: () => sheet, getNumRows: () => 1, getNumColumns: () => 1, getA1Notation: () => 'B5',
    getValue: () => 'new text' }, oldValue: 'old text' });
  let rows = env.rowsOf('CORRECTIONS_LOG');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].SHEET, 'AUDIT_LOG');
  assert.equal(rows[0].CELL, 'B5');
  assert.equal(rows[0].OLD_VALUE, 'old text');
  assert.equal(rows[0].NEW_VALUE, 'new text');
  assert.equal(rows[0].USER_EMAIL, 'hr@varshaforgings.com');

  // an unprotected tab (e.g. EMPLOYEE_MASTER) is not logged
  const masterSheet = env.sheets['EMPLOYEE_MASTER'];
  env.c.onEdit({ range: { getSheet: () => masterSheet, getNumRows: () => 1, getNumColumns: () => 1, getA1Notation: () => 'A1', getValue: () => 'x' }, oldValue: '' });
  assert.equal(env.rowsOf('CORRECTIONS_LOG').length, 1, 'unprotected tab not logged');

  // an edit to CORRECTIONS_LOG itself is never logged (would recurse)
  const logSheet = env.sheets['CORRECTIONS_LOG'];
  env.c.onEdit({ range: { getSheet: () => logSheet, getNumRows: () => 1, getNumColumns: () => 1, getA1Notation: () => 'A1', getValue: () => 'x' }, oldValue: '' });
  assert.equal(env.rowsOf('CORRECTIONS_LOG').length, 1, 'self-edit not logged');
});

test('onEdit: a multi-cell paste is logged with a best-effort note, never throws', () => {
  const env = setup({ user: 'owner@varshaforgings.com' });
  const sheet = env.sheets['PAYROLL_LOCKED'];
  assert.doesNotThrow(() => env.c.onEdit({ range: { getSheet: () => sheet, getNumRows: () => 2, getNumColumns: () => 2,
    getA1Notation: () => 'A1:B2', getValues: () => [['a', 'b'], ['c', 'd']] } }));
  const rows = env.rowsOf('CORRECTIONS_LOG');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].OLD_VALUE, 'MULTI_CELL_OLD_UNAVAILABLE');
  assert.match(rows[0].NEW_VALUE, /a,b \| c,d/);
});

test('onEdit never throws / blocks when the event or range is malformed', () => {
  const env = setup();
  assert.doesNotThrow(() => env.c.onEdit(undefined));
  assert.doesNotThrow(() => env.c.onEdit({}));
  assert.doesNotThrow(() => env.c.onEdit({ range: {} }));
});

// ---------------------------------------------------------------- setup protects the new tabs

test('hrosSetup creates and protects ADVANCE_LEDGER and CORRECTIONS_LOG to HR + Owner + Accounts', () => {
  const env = setup();
  ['ADVANCE_LEDGER', 'CORRECTIONS_LOG'].forEach((n) => {
    assert.ok(env.sheets[n], n);
    assert.equal(env.sheets[n].protections.length, 1, n + ' protected');
    const editors = env.sheets[n].protections[0].editors.map((e) => e).sort();
    assert.deepEqual(new Set(editors), new Set(['hr@varshaforgings.com', 'accounts@varshaforgings.com', 'yash.munot@gmail.com']));
  });
  // INPUT_* and master tabs stay unprotected
  ['INPUT_ADVANCE', 'INPUT_SOCIETY', 'INPUT_OT', 'EMPLOYEE_MASTER', 'SALARY_STRUCTURE', 'PAYROLL_CONTROL'].forEach((n) => {
    assert.equal(env.sheets[n].protections.length, 0, n + ' must stay unprotected');
  });
});

test('hrosSetup protects the dynamic Advance/Loan form-response tab when present', () => {
  const env = makeEnv();
  env.put('Advance Loan Form Responses', ADV_HDR, []);
  env.c.hrosSetup();
  assert.equal(env.sheets['Advance Loan Form Responses'].protections.length, 1);
});
