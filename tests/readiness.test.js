'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');

const ctx = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '30_Calc.gs', '31_Readiness.gs']);
const P = '2026-09'; // 30 days

const CFG_KEYS = (pop) => ctx.requiredStatutoryKeys(pop);
const goodAtt = (id, cat, over = {}) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26,
  PRESENT_DAYS: 22, PHYSICAL_PRESENT_DAYS: 22, WEEK_OFF: 4, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0,
  PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0, APPROVAL_STATUS: 'APPROVED', HR_OVERRIDE: 'N', OVERRIDE_REASON: '' }, over);
const feedsDone = { CANTEEN: 'COMPLETE', OT: 'COMPLETE', ADVANCE: 'COMPLETE', SOCIETY: 'COMPLETE', ADJUSTMENTS: 'COMPLETE',
  EFFICIENCY: 'COMPLETE' };

function base(pop = 'STAFF', over = {}) {
  const ids = ['E1', 'E2'];
  const salary = { FIXED_GROSS_PM_AS_SOURCE_INR: 30000, BASIC_PM_INR: 12000, HR_APPROVED_BY: 'hr@x' };
  return Object.assign({
    period: P, population: pop,
    roster: ids.map((id) => ({ EMP_ID: id, PAYROLL_CATEGORY: pop })),
    allActiveIds: ids,
    masterDuplicateIds: [],
    periodCategoryRow: { PAYROLL_MONTH: P, PAYROLL_CATEGORY: pop, WORKING_DAYS: 26, STATUS: 'PENDING' },
    attendanceRows: ids.map((id) => goodAtt(id, pop)),
    dailyMissingByEmp: null,
    salaryByEmp: { E1: salary, E2: salary },
    rateByEmp: { E1: { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700 }, E2: { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 20000 } },
    feedStatus: Object.assign({}, feedsDone),
    otExceptionRows: [], otHoursByEmp: {},
    statutoryResolved: { values: {}, missing: [], invalid: [] },
    efficiencyConfigRows: [{ IMPLEMENTATION_STATE: 'CONFIRMED' }],
    calcResults: null,
  }, over);
}
const run = (inputs) => plain(ctx.buildReadiness(inputs));
const get = (rows, check) => rows.find((r) => r.CHECK === check);
const st = (inputs, check) => get(run(inputs), check).STATUS;

test('happy path: 15 checks all READY, row shape', () => {
  const rows = run(base());
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.map((r) => r.CHECK), plain(ctx.RDY_CHECK_NAMES));
  rows.forEach((r) => {
    assert.equal(r.STATUS, 'READY', r.CHECK + ': ' + r.DETAIL);
    assert.equal(r.PERIOD, P);
    assert.equal(r.POPULATION, 'STAFF');
    assert.deepEqual(Object.keys(r), ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL']);
  });
});

test('1 period category row / working days', () => {
  assert.equal(st(base('STAFF', { periodCategoryRow: null }), 'PERIOD_WORKING_DAYS'), 'BLOCKED');
  for (const wd of ['', 0, -1, 'abc', 31]) {
    assert.equal(st(base('STAFF', { periodCategoryRow: { WORKING_DAYS: wd } }), 'PERIOD_WORKING_DAYS'), 'BLOCKED', String(wd));
  }
  assert.equal(st(base('STAFF', { periodCategoryRow: { WORKING_DAYS: 30 } }), 'PERIOD_WORKING_DAYS'), 'READY');
});

test('2 attendance coverage: missing, duplicate, unknown/inactive', () => {
  const b = base();
  let rows = run(Object.assign(b, { attendanceRows: [goodAtt('E1', 'STAFF')] }));
  assert.equal(get(rows, 'ATTENDANCE_COVERAGE').STATUS, 'BLOCKED');
  assert.match(get(rows, 'ATTENDANCE_COVERAGE').DETAIL, /E2/);
  rows = run(base('STAFF', { attendanceRows: [goodAtt('E1', 'STAFF'), goodAtt('E1', 'STAFF'), goodAtt('E2', 'STAFF')] }));
  assert.match(get(rows, 'ATTENDANCE_COVERAGE').DETAIL, /duplicate attendance rows: E1/);
  rows = run(base('STAFF', { attendanceRows: [goodAtt('E1', 'STAFF'), goodAtt('E2', 'STAFF'), goodAtt('ZZ', 'STAFF')] }));
  assert.equal(get(rows, 'ATTENDANCE_COVERAGE').STATUS, 'BLOCKED');
  assert.match(get(rows, 'ATTENDANCE_COVERAGE').DETAIL, /unknown\/inactive.*ZZ/);
  // another population's employee is not "unknown"
  rows = run(base('STAFF', { attendanceRows: [goodAtt('E1', 'STAFF'), goodAtt('E2', 'STAFF'), goodAtt('W9', 'PERMANENT_WORKER')],
    allActiveIds: ['E1', 'E2', 'W9'] }));
  assert.equal(get(rows, 'ATTENDANCE_COVERAGE').STATUS, 'READY');
  // category blank and inactive everywhere -> unknown
  rows = run(base('STAFF', { attendanceRows: [goodAtt('E1', 'STAFF'), goodAtt('E2', 'STAFF'), goodAtt('X1', '')] }));
  assert.equal(get(rows, 'ATTENDANCE_COVERAGE').STATUS, 'BLOCKED');
});

test('3 attendance approved/valid', () => {
  const mk = (over) => base('STAFF', { attendanceRows: [goodAtt('E1', 'STAFF', over), goodAtt('E2', 'STAFF')] });
  const chk = (over) => get(run(mk(over)), 'ATTENDANCE_APPROVED_VALID');
  assert.equal(chk({ APPROVAL_STATUS: 'PENDING' }).STATUS, 'BLOCKED');
  assert.match(chk({ APPROVAL_STATUS: 'PENDING' }).DETAIL, /not APPROVED: E1/);
  assert.equal(chk({ PRESENT_DAYS: -1 }).STATUS, 'BLOCKED');
  assert.equal(chk({ PRESENT_DAYS: 'x' }).STATUS, 'BLOCKED');
  assert.equal(chk({ PRESENT_DAYS: '' }).STATUS, 'BLOCKED');
  assert.equal(chk({ EL_AVAILED: -2 }).STATUS, 'BLOCKED');
  // worked > days in month (staff: 22 + 4 wo + 5 = 31 > 30)
  assert.equal(chk({ PH: 5 }).STATUS, 'BLOCKED');
  assert.match(chk({ PH: 5 }).DETAIL, /exceed days in month/);
  // staff worked > working days is only WARN (22+4+1 = 27 > 26)
  assert.equal(chk({ PH: 1 }).STATUS, 'WARN');
  assert.equal(chk({ HR_OVERRIDE: 'Y', OVERRIDE_REASON: '' }).STATUS, 'BLOCKED');
  assert.equal(chk({ HR_OVERRIDE: 'Y', OVERRIDE_REASON: 'fixed by HR' }).STATUS, 'READY');
});

test('3 worker: worked days > WORKING_DAYS blocks, week off not counted', () => {
  const mk = (over) => base('PERMANENT_WORKER', { attendanceRows: [goodAtt('E1', 'PERMANENT_WORKER', over), goodAtt('E2', 'PERMANENT_WORKER')] });
  const chk = (over) => get(run(mk(over)), 'ATTENDANCE_APPROVED_VALID');
  assert.equal(chk({ PRESENT_DAYS: 22, WEEK_OFF: 8 }).STATUS, 'READY'); // WO excluded: 22 <= 26
  assert.equal(chk({ PRESENT_DAYS: 27 }).STATUS, 'BLOCKED');
  assert.match(chk({ PRESENT_DAYS: 27 }).DETAIL, /exceed WORKING_DAYS/);
});

test('4 daily attendance missing dates', () => {
  assert.equal(st(base('STAFF', { dailyMissingByEmp: {} }), 'DAILY_ATTENDANCE_COMPLETE'), 'READY');
  const r = get(run(base('STAFF', { dailyMissingByEmp: { E2: ['2026-09-03', '2026-09-04'], OTHER: ['2026-09-01'] } })), 'DAILY_ATTENDANCE_COMPLETE');
  assert.equal(r.STATUS, 'BLOCKED');
  assert.match(r.DETAIL, /E2\(2 dates/);
  assert.doesNotMatch(r.DETAIL, /OTHER/);
});

test('5 salary / rate present with non-zero pay', () => {
  const zero = { FIXED_GROSS_PM_AS_SOURCE_INR: 0, BASIC_PM_INR: 0 };
  let r = get(run(base('STAFF', { salaryByEmp: { E1: zero, E2: { FIXED_GROSS_PM_AS_SOURCE_INR: 100 } } })), 'SALARY_PRESENT_NONZERO');
  assert.equal(r.STATUS, 'BLOCKED');
  assert.match(r.DETAIL, /zero pay structure: E1/);
  r = get(run(base('PERMANENT_WORKER', { salaryByEmp: { E1: { FIXED_GROSS_PM_AS_SOURCE_INR: 100 } } })), 'SALARY_PRESENT_NONZERO');
  assert.match(r.DETAIL, /no salary structure.*E2/);
  const rate = (a, b) => base('CONSULTANT', { rateByEmp: { E1: a, E2: b } });
  assert.equal(st(rate({ PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 0 }, { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 5 }), 'SALARY_PRESENT_NONZERO'), 'BLOCKED');
  assert.equal(st(rate({ PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 0 }, { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 5 }), 'SALARY_PRESENT_NONZERO'), 'BLOCKED');
  assert.equal(st(base('PUNE_STAFF', { rateByEmp: { E1: { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 9 } } }), 'SALARY_PRESENT_NONZERO'), 'BLOCKED'); // E2 missing
  assert.equal(st(base('CONSULTANT'), 'SALARY_PRESENT_NONZERO'), 'READY');
});

test('6 feeds COMPLETE (worker also EFFICIENCY)', () => {
  assert.equal(st(base('STAFF', { feedStatus: Object.assign({}, feedsDone, { CANTEEN: 'OPEN' }) }), 'FEEDS_COMPLETE'), 'BLOCKED');
  const noFeed = Object.assign({}, feedsDone); delete noFeed.SOCIETY;
  const r = get(run(base('STAFF', { feedStatus: noFeed })), 'FEEDS_COMPLETE');
  assert.equal(r.STATUS, 'BLOCKED');
  assert.match(r.DETAIL, /SOCIETY/);
  const noEff = Object.assign({}, feedsDone, { EFFICIENCY: 'OPEN' });
  assert.equal(st(base('STAFF', { feedStatus: noEff }), 'FEEDS_COMPLETE'), 'READY');
  assert.equal(st(base('PERMANENT_WORKER', { feedStatus: noEff }), 'FEEDS_COMPLETE'), 'BLOCKED');
  assert.equal(st(base('STAFF', { feedStatus: { CANTEEN: { STATUS: 'complete' }, OT: 'COMPLETE', ADVANCE: 'COMPLETE', SOCIETY: 'COMPLETE', ADJUSTMENTS: 'COMPLETE' } }), 'FEEDS_COMPLETE'), 'READY');
});

test('7 OT exceptions block; pending OT warns; unknown ids block all populations', () => {
  const ex = (id, over = {}) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, ELIGIBILITY: 'EXCEPTION' }, over);
  assert.equal(st(base('STAFF', { otExceptionRows: [ex('E1')] }), 'OT_EXCEPTIONS'), 'BLOCKED');
  assert.equal(st(base('STAFF', { otExceptionRows: [ex('OTHERPOP')] }), 'OT_EXCEPTIONS'), 'BLOCKED'); // not an active id anywhere: fail closed
  assert.equal(st(base('STAFF', { allActiveIds: ['E1', 'E2', 'OTHERPOP'], otExceptionRows: [ex('OTHERPOP')] }), 'OT_EXCEPTIONS'), 'READY');
  assert.equal(st(base('STAFF', { allActiveIds: undefined, otExceptionRows: [ex('NOBODY')] }), 'OT_EXCEPTIONS'), 'READY'); // no global knowledge: only roster ids attributable
  assert.equal(st(base('STAFF', { allActiveIds: ['E1', 'E2'], otExceptionRows: [ex('NOBODY')] }), 'OT_EXCEPTIONS'), 'BLOCKED');
  assert.equal(st(base('STAFF', { otExceptionRows: [ex('E1', { PAYROLL_MONTH: '2026-10-01' })] }), 'OT_EXCEPTIONS'), 'READY');
  assert.equal(st(base('STAFF', { otExceptionRows: [ex('E1', { ELIGIBILITY: 'VALID' })] }), 'OT_EXCEPTIONS'), 'READY');
  const w = get(run(base('STAFF', { pendingOtCount: 3 })), 'OT_EXCEPTIONS');
  assert.equal(w.STATUS, 'WARN');
  assert.match(w.DETAIL, /3/);
  assert.equal(st(base('STAFF', { pendingOtCount: 3, otExceptionRows: [ex('E1')] }), 'OT_EXCEPTIONS'), 'BLOCKED');
});

test('8 statutory keys', () => {
  assert.equal(st(base('STAFF', { statutoryResolved: { missing: ['PF_WAGE_CEILING'], invalid: [] } }), 'STATUTORY_CONFIG'), 'BLOCKED');
  assert.equal(st(base('PERMANENT_WORKER', { statutoryResolved: { missing: [], invalid: ['PT_SLABS'] } }), 'STATUTORY_CONFIG'), 'BLOCKED');
  assert.equal(st(base('STAFF', { statutoryResolved: null }), 'STATUTORY_CONFIG'), 'BLOCKED');
  assert.equal(st(base('CONSULTANT', { statutoryResolved: null }), 'STATUTORY_CONFIG'), 'READY'); // no keys needed
  assert.ok(CFG_KEYS('STAFF').length > 10);
});

test('9 duplicate EMP_ID among actives', () => {
  const dupRoster = [{ EMP_ID: 'E1', PAYROLL_CATEGORY: 'STAFF' }, { EMP_ID: 'E1', PAYROLL_CATEGORY: 'STAFF' }, { EMP_ID: 'E2', PAYROLL_CATEGORY: 'STAFF' }];
  const r = get(run(base('STAFF', { roster: dupRoster })), 'DUPLICATE_MASTER_IDS');
  assert.equal(r.STATUS, 'BLOCKED');
  assert.match(r.DETAIL, /E1/);
  assert.equal(st(base('STAFF', { masterDuplicateIds: ['E2'] }), 'DUPLICATE_MASTER_IDS'), 'BLOCKED'); // duplicated across master categories
  assert.equal(st(base('STAFF', { masterDuplicateIds: ['NOTMINE'] }), 'DUPLICATE_MASTER_IDS'), 'READY');
});

test('10 consultant monthly gross with OT hours', () => {
  const ot = { E1: 5, E2: 8 };
  const r = get(run(base('CONSULTANT', { otHoursByEmp: ot })), 'CONSULTANT_MONTHLY_OT');
  assert.equal(r.STATUS, 'BLOCKED');
  assert.match(r.DETAIL, /E2/);
  assert.doesNotMatch(r.DETAIL, /E1/); // E1 is DAILY_RATE, OT allowed
  assert.equal(st(base('CONSULTANT', { otHoursByEmp: { E2: 0 } }), 'CONSULTANT_MONTHLY_OT'), 'READY');
  assert.equal(st(base('PUNE_STAFF', { otHoursByEmp: ot }), 'CONSULTANT_MONTHLY_OT'), 'READY');
});

test('11 efficiency config not confirmed warns for worker only', () => {
  const rows = [{ IMPLEMENTATION_STATE: 'SOURCE-RULE RECON PENDING' }];
  assert.equal(st(base('PERMANENT_WORKER', { efficiencyConfigRows: rows }), 'EFFICIENCY_CONFIG_CONFIRMED'), 'WARN');
  assert.equal(st(base('PERMANENT_WORKER', { efficiencyConfigRows: [] }), 'EFFICIENCY_CONFIG_CONFIRMED'), 'WARN');
  assert.equal(st(base('PERMANENT_WORKER'), 'EFFICIENCY_CONFIG_CONFIRMED'), 'READY');
  assert.equal(st(base('STAFF', { efficiencyConfigRows: rows }), 'EFFICIENCY_CONFIG_CONFIRMED'), 'READY');
});

test('12 negative net pay and CALC_BLOCKERS row', () => {
  const calcResults = [
    { row: { EMP_ID: 'E1', NET_PAY: -50 }, exceptions: [{ severity: 'BLOCKER', code: 'NEGATIVE_NET_PAY' }] },
    { row: { EMP_ID: 'E2', NET_PAY: null }, exceptions: [{ severity: 'BLOCKER', code: 'MISSING_SALARY_STRUCTURE' }] },
  ];
  const rows = run(base('STAFF', { calcResults }));
  assert.equal(rows.length, 16);
  const neg = get(rows, 'NEGATIVE_NET_PAY');
  assert.equal(neg.STATUS, 'BLOCKED');
  assert.match(neg.DETAIL, /E1/);
  assert.doesNotMatch(neg.DETAIL, /E2/);
  const cb = get(rows, 'CALC_BLOCKERS');
  assert.equal(cb.STATUS, 'BLOCKED');
  assert.match(cb.DETAIL, /E2/);
  const ok = run(base('STAFF', { calcResults: [{ row: { EMP_ID: 'E1', NET_PAY: 100 }, exceptions: [{ severity: 'WARN', code: 'X' }] }] }));
  assert.equal(get(ok, 'NEGATIVE_NET_PAY').STATUS, 'READY');
  assert.equal(get(ok, 'CALC_BLOCKERS').STATUS, 'READY');
});

test('DETAIL lists up to 20 EMP_IDs then "+N more"', () => {
  const ids = Array.from({ length: 25 }, (_, i) => 'M' + String(i).padStart(2, '0'));
  const r = get(run(base('STAFF', { roster: ids.map((id) => ({ EMP_ID: id, PAYROLL_CATEGORY: 'STAFF' })), allActiveIds: ids, attendanceRows: [] })),
    'ATTENDANCE_COVERAGE');
  assert.equal(r.STATUS, 'BLOCKED');
  assert.match(r.DETAIL, /M19/);
  assert.doesNotMatch(r.DETAIL, /M20/);
  assert.match(r.DETAIL, /\+5 more/);
  assert.equal(ctx.rdy_list_(['a', 'b']), 'a, b');
});
