'use strict';
// Employee-level HOLD vs population-level BLOCKED: the engine and the readiness checks must agree on who is held.
const test = require('node:test');
const assert = require('node:assert/strict');
const { plain } = require('./load');
const { LEAVE_HDR } = require('./fakes');
const { P, HR, fullWorld, dailyRows } = require('./regenv');

const staffSal = (id) => ({ EMP_ID: id, PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: '2026-08-01', BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890,
  EDUCATION_PM_INR: 1890, MEDICAL_PM_INR: 1890, PRO_DEV_PM_INR: 945, COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260, WASHING_PM_INR: 2835,
  FIXED_GROSS_PM_AS_SOURCE_INR: 31500, HR_APPROVED_BY: 'hr@x' });
const leaveRowOf = (o) => Object.fromEntries(LEAVE_HDR.map((h) => [h, h in o ? o[h] : (h === 'Approval Decision' ? 'Approved' : (h === 'Submission Type' ? 'Approval (for admin use only)' : ''))]));

/** 5 STAFF employees; S1..S4 each get a different employee-level problem, S5 is clean. */
function build(extra = {}) {
  const env = fullWorld(Object.assign({
    master: ['S3', 'S4', 'S5'].map((id) => ({ EMP_ID: id, EMPLOYEE_NAME: 'Staff ' + id, PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '01/01/2020' })),
    leaveSourceRows: [],
  }, extra));
  const sal = env.sheets.SALARY_STRUCTURE;
  ['S3', 'S4', 'S5'].forEach((id) => sal.data.push(sal.data[0].map((h) => staffSal(id)[h] === undefined ? '' : staffSal(id)[h])));
  if (env.sheets.Leave_Applications) env.addRows('Leave_Applications', [leaveRowOf({ 'Employee ID': 'S4', 'Leave Type': 'Paternity', 'Leave Start Date': '2026-09-10', 'Leave End Date': '2026-09-10' })]);
  env.user = HR;
  env.c.registerSubmit({ period: P, includesWO: {}, entries: ['S1', 'S2', 'S3', 'S4', 'S5'].map((empId) => ({ empId, days: 20 })) });
  env.c.approveAttendance(P, 'STAFF');
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S1' }, { APPROVAL_STATUS: 'PENDING' });               // S1: attendance not approved
  env.addRows('INPUT_OT', [{ PAYROLL_MONTH: P, EMP_ID: 'S2', OT_HOURS: 0, SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'EXCEPTION',   // S2: OT exception
    NORMALIZER_VERSION: 'OT-1.0', ELIGIBILITY: 'EXCEPTION', EXCEPTION_REASON: 'HOURS_OVER_16 | ORIGINAL_OT_HOURS=20' }]);
  env.addRows('INPUT_CANTEEN', [{ PAYROLL_MONTH: P, EMP_ID: 'S3', AMOUNT_INR: '', SOURCE: 'FORM_CANTEEN', SOURCE_REF: 'CANTEEN_FORM_RESPONSES!2', KEY: P + '|S3',   // S3: canteen exception
    STATUS: 'EXCEPTION', ENTERED_AT: '2026-09-28T10:00:00', REMARKS: 'AMOUNT_NEGATIVE' }]);
  return env;                                                                                        // S4: leave exception (unknown type)
}
const draft = (env, id) => env.rowsOf('PAYROLL_DRAFT').find((r) => r.EMP_ID === id);
const check = (env, name) => env.rowsOf('PAYROLL_READINESS').find((r) => r.POPULATION === 'STAFF' && r.CHECK === name);

test('every employee-level problem holds only that employee; readiness HOLD rows name exactly the employees the engine holds', () => {
  const env = build();
  const r = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(r.populations[0].held.sort(), ['S1', 'S2', 'S3', 'S4']);
  assert.equal(r.populations[0].blockers, 0);
  assert.equal(r.readiness.blocked, 0);
  assert.equal(typeof draft(env, 'S5').NET_PAY, 'number');
  ['S1', 'S2', 'S3', 'S4'].forEach((id) => { assert.equal(draft(env, id).NET_PAY, '', id); assert.match(draft(env, id).FLAGS, /^HOLD;/, id); });
  const code = (id) => env.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.EMP_ID === id && e.SEVERITY === 'HOLD').map((e) => e.CODE);
  assert.ok(code('S1').includes('ATTENDANCE_NOT_APPROVED'));
  assert.ok(code('S2').includes('OT_EXCEPTION'));
  assert.ok(code('S3').includes('CANTEEN_EXCEPTION'));
  assert.ok(code('S4').includes('LEAVE_EXCEPTION'));
  assert.equal(check(env, 'ATTENDANCE_APPROVED_VALID').STATUS, 'HOLD');
  assert.match(check(env, 'ATTENDANCE_APPROVED_VALID').DETAIL, /S1/);
  assert.match(check(env, 'OT_EXCEPTIONS').DETAIL, /S2/);
  assert.match(check(env, 'CANTEEN_EFFICIENCY_EXCEPTIONS').DETAIL, /S3/);
  assert.equal(check(env, 'LEAVE_EXCEPTIONS').STATUS, 'HOLD');
  assert.match(check(env, 'LEAVE_EXCEPTIONS').DETAIL, /S4: UNKNOWN_LEAVE_TYPE/);
  // union of the employees named by HOLD readiness rows == the engine's held set (S5 is never named)
  const named = {};
  env.rowsOf('PAYROLL_READINESS').filter((x) => x.POPULATION === 'STAFF' && x.STATUS === 'HOLD' && x.CHECK !== 'CALC_BLOCKERS').forEach((x) => {
    (x.DETAIL.match(/\bS[1-5]\b/g) || []).forEach((id) => { named[id] = true; });
  });
  assert.deepEqual(Object.keys(named).sort(), ['S1', 'S2', 'S3', 'S4']);
  // the leave exception clears once the source row is fixed, and the employee is released
  env.sheets.Leave_Applications.data[1][LEAVE_HDR.indexOf('Leave Type')] = 'Casual Leave (CL)';
  const fixed = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.equal(typeof draft(env, 'S4').NET_PAY, 'number');
  assert.deepEqual(fixed.leaveSync.summary.registerStaleApproved, ['S4'], 'S4 attendance is already APPROVED: the new leave is reported, not silently applied');
});

test('global problems still BLOCK the whole population: working days, statutory approval, salary approval, feeds, unreachable leave source', () => {
  const st = (env, name) => plain(env.c.checkReadiness(P, 'STAFF')).rows.find((x) => x.CHECK === name).STATUS;
  const wd = build(); wd.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { WORKING_DAYS: '' });
  assert.equal(st(wd, 'PERIOD_WORKING_DAYS'), 'BLOCKED');
  const stat = build(); stat.sheets.STATUTORY_CONFIG.data.slice(1).forEach((row) => { row[stat.sheets.STATUTORY_CONFIG.data[0].indexOf('APPROVED_BY')] = ''; });
  assert.equal(st(stat, 'STATUTORY_CONFIG'), 'BLOCKED');
  const sal = build(); sal.editCells('SALARY_STRUCTURE', { EMP_ID: 'S5' }, { HR_APPROVED_BY: '' });
  assert.equal(st(sal, 'PAY_STRUCTURE_APPROVED'), 'HOLD', 'one unsigned row among signed ones is an employee HOLD');
  const sal0 = build(); sal0.sheets.SALARY_STRUCTURE.data.slice(1).forEach((row) => { row[sal0.sheets.SALARY_STRUCTURE.data[0].indexOf('HR_APPROVED_BY')] = ''; });
  assert.equal(st(sal0, 'PAY_STRUCTURE_APPROVED'), 'BLOCKED', 'no signed row at all blocks the population');
  const feeds = build(); feeds.editCells('FEED_STATUS', { FEED: 'LEAVE' }, { STATUS: 'OPEN' });
  assert.equal(st(feeds, 'FEEDS_COMPLETE'), 'BLOCKED');
  // unreachable leave source: calculateDraft records it, LEAVE feed reopened, population-level BLOCKER row, approval refused
  const un = build({ leaveSource: false, control: [{ KEY: 'LEAVE_SOURCE_SPREADSHEET_ID', VALUE: 'NOT_SHARED' }] });
  const r = plain(un.c.calculateDraft(P, 'STAFF'));
  assert.equal(r.leaveSync.ok, false);
  assert.match(r.leaveSync.error, /VIEW access/);
  assert.equal(un.rowsOf('FEED_STATUS').find((f) => f.FEED === 'LEAVE').STATUS, 'OPEN');
  const ex = un.rowsOf('PAYROLL_EXCEPTIONS').find((e) => e.CODE === 'LEAVE_SOURCE_UNREACHABLE');
  assert.deepEqual([ex.SEVERITY, ex.EMP_ID, ex.POPULATION], ['BLOCKER', '', 'STAFF']);
  assert.match(ex.MESSAGE, /Cannot open the leave spreadsheet/);
  assert.equal(r.populations[0].blockers, 1);
  const rd = un.rowsOf('PAYROLL_READINESS').find((x) => x.POPULATION === 'STAFF' && x.CHECK === 'LEAVE_EXCEPTIONS');
  assert.equal(rd.STATUS, 'BLOCKED');
  assert.match(rd.DETAIL, /^LEAVE_SOURCE_UNREACHABLE: /);
  assert.equal(un.c.hrApprove(P, 'STAFF').ok, false);
  assert.match(un.rowsOf('AUDIT_LOG').map((a) => a.Message).join('\n'), /LEAVE_SYNC_FAILED/);
  assert.ok(P);
});

test('approval is not blocked by HOLD rows; register over-month and daily-missing employees are held, register employees skip the daily-missing hold', () => {
  const env = build();
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S1' }, { APPROVAL_STATUS: 'APPROVED' });
  env.editCells('INPUT_OT', { EMP_ID: 'S2' }, { ELIGIBILITY: 'SUPERSEDED' });
  env.sheets.INPUT_CANTEEN.data.length = 1;
  env.sheets.Leave_Applications.data.length = 1;
  // S5 over the month via a register entry that only fails on WEEK_OFF (28 + 4 = 32 > 30)
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S5' }, { APPROVAL_STATUS: 'PENDING' });
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S5', days: 28 }] });
  env.c.approveAttendance(P, 'STAFF');
  const r = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(r.populations[0].held, ['S5']);
  assert.ok(env.rowsOf('PAYROLL_EXCEPTIONS').some((e) => e.EMP_ID === 'S5' && e.CODE === 'ATTENDANCE_OVER_MONTH' && e.SEVERITY === 'HOLD'));
  assert.equal(check(env, 'ATTENDANCE_APPROVED_VALID').STATUS, 'HOLD');
  env.user = HR;
  assert.equal(plain(env.c.hrApprove(P, 'STAFF')).ok, true, 'HOLD is not a blocker');
  // daily data exists: register employees are compared instead of the missing-dates rule; a directly typed row keeps the daily rule
  const env2 = build();
  env2.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S1' }, { APPROVAL_STATUS: 'APPROVED' });
  env2.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S3' }, { SOURCE_REF: 'HR_MONTHLY_ENTRY' });
  env2.sheets.ATTENDANCE_DAILY.data.push(...dailyRows('S3', { 1: 'P', 2: 'P' }).map((x) => env2.sheets.ATTENDANCE_DAILY.data[0].map((h) => x[h])));
  env2.c.calculateDraft(P, 'STAFF');
  const codes = (id) => env2.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.EMP_ID === id).map((e) => e.CODE);
  assert.ok(codes('S3').includes('DAILY_ATTENDANCE_MISSING'), 'not a register row: the daily rule applies');
  assert.ok(!codes('S5').includes('DAILY_ATTENDANCE_MISSING'), 'register row: compared, not held for missing dates');
  assert.ok(codes('S5').includes('ATTENDANCE_DISPUTE'), 'S5 has no daily rows at all: daily 0 vs register 20 = dispute');
});
