'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');
const { P, HR, OWNER, ACC, fullWorld, dailyRows } = require('./regenv');

const pure = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '10_Attendance.gs', '33_Comparison.gs']);

// ---------------------------------------------------------------- pure
const ROSTER = [{ EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF', NAME: 'One' }, { EMP_ID: 'S2', PAYROLL_CATEGORY: 'STAFF', NAME: 'Two' },
  { EMP_ID: 'S3', PAYROLL_CATEGORY: 'STAFF', NAME: 'Three' }];
const regRow = (id, physical, over = {}) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, SOURCE_REF: 'REGISTER', PHYSICAL_PRESENT_DAYS: physical,
  GENERATED_VALUES_JSON: JSON.stringify({ PHYSICAL_PRESENT_DAYS: physical }) }, over);
const codes = (n, code, from = 1) => { const o = {}; for (let i = 0; i < n; i++) o[from + i] = code; return o; };

test('comparison: DAILY_PRESENT = P + 0.5 x HD (OD, WO, PH, leave excluded); REGISTER_PRESENT = register physical; |DIFF| < 0.01 MATCH else DISPUTE', () => {
  const daily = dailyRows('S1', Object.assign(codes(18, 'P'), { 19: 'HD', 20: 'HD', 21: 'OD', 22: 'WO', 23: 'PH', 24: 'EL' })) // 18 + 1 = 19
    .concat(dailyRows('S2', codes(20, 'P')))
    .concat(dailyRows('S3', codes(10, 'P')));
  const rows = plain(pure.attendanceComparisonRows(P, ROSTER, [regRow('S1', 19), regRow('S2', 20.005), regRow('S3', 12)], daily, []));
  const by = Object.fromEntries(rows.map((r) => [r.EMP_ID, r]));
  assert.deepEqual([by.S1.DAILY_PRESENT, by.S1.REGISTER_PRESENT, by.S1.DIFF, by.S1.STATUS], [19, 19, 0, 'MATCH']);
  assert.equal(by.S2.STATUS, 'MATCH', '0.005 is inside the tolerance');
  assert.deepEqual([by.S3.DIFF, by.S3.STATUS, by.S3.POPULATION, by.S3.NAME], [2, 'DISPUTE', 'STAFF', 'Three']);
  assert.deepEqual(Object.keys(rows[0]), plain(pure.ATT_COMPARISON_COLUMNS));
});

test('comparison: only register-sourced rows are compared; the pre-override snapshot is the register figure; HR / owner columns are kept', () => {
  const daily = dailyRows('S1', codes(20, 'P')).concat(dailyRows('S2', codes(20, 'P')));
  const overridden = regRow('S1', 15, { PHYSICAL_PRESENT_DAYS: 20, GENERATED_VALUES_JSON: JSON.stringify({ PHYSICAL_PRESENT_DAYS: 15 }), HR_OVERRIDE: 'Y' });
  const direct = { PAYROLL_MONTH: P, EMP_ID: 'S2', SOURCE_REF: 'HR_MONTHLY_ENTRY', PHYSICAL_PRESENT_DAYS: 3 };
  const stored = [{ PERIOD: P, EMP_ID: 'S1', HR_DECIDED_DAYS: 20, HR_REASON: 'paper log', HR_BY: HR, HR_AT: 't', OWNER_DECISION: 'APPROVED', OWNER_BY: OWNER, OWNER_AT: 't2', HR_STAMPED_DAYS: 20 }];
  const rows = plain(pure.attendanceComparisonRows(P, ROSTER, [overridden, direct], daily, stored));
  assert.deepEqual(rows.map((r) => r.EMP_ID), ['S1'], 'S2 is not a register row: not compared');
  assert.deepEqual([rows[0].REGISTER_PRESENT, rows[0].STATUS, rows[0].HR_DECIDED_DAYS, rows[0].HR_REASON, rows[0].HR_BY, rows[0].OWNER_DECISION, rows[0].OWNER_BY, rows[0].HR_STAMPED_DAYS],
    [15, 'DISPUTE', 20, 'paper log', HR, 'APPROVED', OWNER, 20]);
});

test('dispute stages: awaiting HR -> awaiting owner -> rejected / stamp invalid / not applied -> resolved', () => {
  const dim = 30;
  const base = { PERIOD: P, EMP_ID: 'S1', STATUS: 'DISPUTE', DAILY_PRESENT: 18, REGISTER_PRESENT: 20, HR_DECIDED_DAYS: 19, HR_REASON: 'r', HR_BY: HR, HR_STAMPED_DAYS: 19 };
  const applied = { S1: { PHYSICAL_PRESENT_DAYS: 19, HR_OVERRIDE: 'Y', OVERRIDE_REASON: 'ATTENDANCE_DISPUTE: r' } };
  const st = (over, att = applied, owner = OWNER) => plain(pure.attendanceDisputeStages([Object.assign({}, base, over)], att, owner, P)).map((x) => x.stage);
  assert.deepEqual(st({ HR_DECIDED_DAYS: '', HR_REASON: '', HR_BY: '', HR_STAMPED_DAYS: '' }), ['AWAITING_HR']);
  assert.deepEqual(st({ HR_REASON: '' }), ['AWAITING_HR'], 'no reason');
  assert.deepEqual(st({ HR_BY: '' }), ['AWAITING_HR'], 'not submitted');
  assert.deepEqual(st({ HR_DECIDED_DAYS: 25 }), ['AWAITING_HR'], 'edited after the stamp');
  assert.deepEqual(st({ HR_DECIDED_DAYS: 31, HR_STAMPED_DAYS: 31 }), ['AWAITING_HR'], 'out of range');
  assert.deepEqual(st({}), ['AWAITING_OWNER']);
  assert.deepEqual(st({ OWNER_DECISION: 'REJECTED', OWNER_BY: OWNER }), ['OWNER_REJECTED']);
  assert.deepEqual(st({ OWNER_DECISION: 'APPROVED', OWNER_BY: 'someone@else.com' }), ['OWNER_STAMP_INVALID']);
  assert.deepEqual(st({ OWNER_DECISION: 'APPROVED', OWNER_BY: OWNER }, applied, ''), ['OWNER_STAMP_INVALID'], 'no configured owner: never resolved');
  assert.deepEqual(st({ OWNER_DECISION: 'APPROVED', OWNER_BY: OWNER }, { S1: { PHYSICAL_PRESENT_DAYS: 20, HR_OVERRIDE: 'N', OVERRIDE_REASON: '' } }), ['DECISION_NOT_APPLIED']);
  assert.deepEqual(st({ OWNER_DECISION: 'APPROVED', OWNER_BY: 'YASH.MUNOT@gmail.com' }), [], 'approved, stamped by the owner, applied: resolved (case-insensitive email)');
  assert.deepEqual(plain(pure.attendanceDisputeStages([Object.assign({}, base, { STATUS: 'MATCH' })], applied, OWNER, P)), [], 'MATCH is never a dispute');
  assert.ok(dim);
});

test('disputeHrPlan: stamp / unchanged / awaiting / invalid; a changed decision resets an earlier owner decision', () => {
  const r = (id, over) => Object.assign({ PERIOD: P, EMP_ID: id, STATUS: 'DISPUTE', HR_DECIDED_DAYS: '', HR_REASON: '', HR_BY: '', HR_STAMPED_DAYS: '', OWNER_DECISION: '' }, over);
  const plan = plain(pure.disputeHrPlan([
    r('A', {}), r('B', { HR_DECIDED_DAYS: 18, HR_REASON: 'log' }), r('C', { HR_DECIDED_DAYS: 18 }), r('D', { HR_REASON: 'x' }), r('E', { HR_DECIDED_DAYS: 40, HR_REASON: 'x' }),
    r('F', { HR_DECIDED_DAYS: 18, HR_REASON: 'log', HR_BY: HR, HR_STAMPED_DAYS: 18 }),
    r('G', { HR_DECIDED_DAYS: 17, HR_REASON: 'log', HR_BY: HR, HR_STAMPED_DAYS: 18, OWNER_DECISION: 'APPROVED' }),
    r('H', { STATUS: 'MATCH', HR_DECIDED_DAYS: 1, HR_REASON: 'x' }),
  ], P));
  assert.deepEqual(plan.awaiting, ['A']);
  assert.deepEqual(plan.stamp.map((s) => [s.empId, s.days, s.resetsOwner]), [['B', 18, false], ['G', 17, true]]);
  assert.deepEqual(plan.unchanged, ['F']);
  assert.equal(plan.invalid.length, 3);
});

// ---------------------------------------------------------------- integration: register + daily + comparison + engine hold
const S = (id, days) => ({ empId: id, days });
/** STAFF S1 matches (20 vs 20), S2 disputes (register 20, daily 18 P + 2 HD = 19). */
function disputeWorld() {
  const env = fullWorld({ daily: dailyRows('S1', codes(20, 'P')).concat(dailyRows('S2', Object.assign(codes(18, 'P'), { 19: 'HD', 20: 'HD' }))) });
  env.user = HR;
  env.c.registerSubmit({ period: P, includesWO: { STAFF: 'N' }, entries: [S('S1', 20), S('S2', 20)] });
  return env;
}
const draft = (env, id) => env.rowsOf('PAYROLL_DRAFT').find((r) => r.EMP_ID === id);
const cmpRow = (env, id) => env.rowsOf('ATTENDANCE_COMPARISON').find((r) => r.EMP_ID === id);
const att = (env, id) => env.rowsOf('INPUT_ATTENDANCE').find((r) => r.EMP_ID === id);
const editComparison = (env, id, values) => env.editCells('ATTENDANCE_COMPARISON', { EMP_ID: id }, values);

test('buildAttendanceComparison: writes MATCH / DISPUTE rows, needs daily data, keeps HR / owner columns on re-run, skips LOCKED populations', () => {
  const none = fullWorld();
  none.c.registerSubmit({ period: P, includesWO: {}, entries: [S('S1', 20)] });
  assert.throws(() => none.c.buildAttendanceComparison(P), /No ATTENDANCE_DAILY rows/);
  const env = disputeWorld();
  const r = plain(env.c.buildAttendanceComparison(P));
  assert.deepEqual([r.compared, r.match, r.dispute], [2, 1, 1]);
  assert.deepEqual([cmpRow(env, 'S1').STATUS, cmpRow(env, 'S1').DIFF], ['MATCH', 0]);
  assert.deepEqual([cmpRow(env, 'S2').STATUS, cmpRow(env, 'S2').DIFF, cmpRow(env, 'S2').DAILY_PRESENT, cmpRow(env, 'S2').REGISTER_PRESENT], ['DISPUTE', 1, 19, 20]);
  editComparison(env, 'S2', { HR_DECIDED_DAYS: 19, HR_REASON: 'signed paper log' });
  env.c.buildAttendanceComparison(P);
  assert.deepEqual([cmpRow(env, 'S2').HR_DECIDED_DAYS, cmpRow(env, 'S2').HR_REASON], [19, 'signed paper log'], 're-run keeps HR columns');
  assert.equal(env.rowsOf('ATTENDANCE_COMPARISON').length, 2, 'no duplicate rows');
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { STATUS: 'LOCKED' });
  const before = JSON.stringify(env.sheets.ATTENDANCE_COMPARISON.data);
  env.c.buildAttendanceComparison(P);
  assert.equal(JSON.stringify(env.sheets.ATTENDANCE_COMPARISON.data), before, 'locked population untouched');
  assert.throws(() => env.c.buildAttendanceComparison('2026-08'), /earlier than MIN_PERIOD/);
});

test('MATCH flows into payroll; DISPUTE holds only that employee (population not BLOCKED) until HR + owner decide; decided days replace physical days', () => {
  const env = disputeWorld();
  env.c.buildAttendanceComparison(P);
  // attendance approval leaves the disputed employee PENDING, the matching one is approved
  const ap = plain(env.c.approveAttendance(P, 'STAFF'));
  assert.equal(ap.approved, 1);
  assert.equal(ap.blocked[0].EMP_ID, 'S2');
  assert.match(ap.blocked[0].problems.join(' '), /dispute open/);
  const d1 = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(d1.populations[0].held, ['S2']);
  assert.equal(d1.populations[0].blockers, 0);
  assert.equal(d1.readiness.blocked, 0, 'a dispute never blocks the population');
  assert.equal(typeof draft(env, 'S1').NET_PAY, 'number');
  assert.equal(draft(env, 'S2').NET_PAY, '');
  assert.match(draft(env, 'S2').FLAGS, /^HOLD;.*ATTENDANCE_DISPUTE/);
  const ex = env.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.EMP_ID === 'S2' && e.CODE === 'ATTENDANCE_DISPUTE');
  assert.equal(ex[0].SEVERITY, 'HOLD');
  assert.match(ex[0].MESSAGE, /waiting for HR decision/);
  const rd = env.rowsOf('PAYROLL_READINESS').find((r) => r.CHECK === 'ATTENDANCE_DISPUTES');
  assert.equal(rd.STATUS, 'HOLD');
  assert.match(rd.DETAIL, /S2 \(AWAITING_HR\)/);

  // HR fills the decision; a wrong runner is refused; HR stamps it
  editComparison(env, 'S2', { HR_DECIDED_DAYS: 19, HR_REASON: 'signed paper log' });
  env.user = ACC;
  assert.deepEqual(plain(env.c.submitDisputeDecisions(P)), { ok: false, reason: 'USER_NOT_HR_APPROVER' });
  assert.equal(cmpRow(env, 'S2').HR_BY, '');
  env.user = HR;
  const sub = plain(env.c.submitDisputeDecisions(P));
  assert.deepEqual([sub.ok, sub.stamped, sub.unchanged], [true, 1, 0]);
  assert.equal(cmpRow(env, 'S2').HR_BY, HR);
  assert.match(String(cmpRow(env, 'S2').HR_AT), /^\d{4}-/);
  assert.equal(plain(env.c.submitDisputeDecisions(P)).stamped, 0, 'idempotent');
  env.c.calculateDraft(P, 'STAFF');
  assert.match(env.rowsOf('PAYROLL_EXCEPTIONS').find((e) => e.EMP_ID === 'S2' && e.CODE === 'ATTENDANCE_DISPUTE').MESSAGE, /waiting for owner approval/);

  // the owner step: wrong runners (HR, Accounts) refused; nothing changes
  [HR, ACC].forEach((u) => {
    env.user = u;
    assert.deepEqual(plain(env.c.ownerApproveDisputes(P)), { ok: false, reason: 'USER_NOT_OWNER_APPROVER' });
  });
  assert.equal(cmpRow(env, 'S2').OWNER_DECISION, '');
  assert.equal(att(env, 'S2').PHYSICAL_PRESENT_DAYS, 20);
  // owner approves: decided days are written into the PENDING attendance row, audited
  env.user = OWNER;
  const ow = plain(env.c.ownerApproveDisputes(P));
  assert.deepEqual([ow.ok, ow.decided, ow.skipped], [true, ['S2'], []]);
  assert.deepEqual([cmpRow(env, 'S2').OWNER_DECISION, cmpRow(env, 'S2').OWNER_BY], ['APPROVED', OWNER]);
  const a = att(env, 'S2');
  assert.deepEqual([a.PHYSICAL_PRESENT_DAYS, a.PRESENT_DAYS, a.HR_OVERRIDE, a.WORKED_DAYS, a.APPROVAL_STATUS], [19, 19, 'Y', 23, 'PENDING']);
  assert.match(a.OVERRIDE_REASON, /^ATTENDANCE_DISPUTE: signed paper log \(HR hr@varshaforgings.com, owner yash.munot@gmail.com\)$/);
  assert.equal(JSON.parse(a.GENERATED_VALUES_JSON).PHYSICAL_PRESENT_DAYS, 20, 'the register figure stays in the snapshot');
  assert.match(env.rowsOf('AUDIT_LOG').map((r) => r.Message).join('\n'), /DISPUTE_OWNER_DECISION.*APPROVED/);
  // HR approves attendance again (the override has a reason) and the employee is released
  env.user = HR;
  assert.equal(plain(env.c.approveAttendance(P, 'STAFF')).approved, 1);
  const d2 = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(d2.populations[0].held, []);
  assert.equal(typeof draft(env, 'S2').NET_PAY, 'number');
  assert.equal(draft(env, 'S2').PRESENT_DAYS, 19);
  assert.equal(draft(env, 'S2').PHYSICAL_PRESENT_DAYS, 19);
  assert.ok(draft(env, 'S2').NET_PAY < draft(env, 'S1').NET_PAY);
  assert.equal(env.rowsOf('PAYROLL_READINESS').find((r) => r.CHECK === 'ATTENDANCE_DISPUTES').STATUS, 'READY');
});

test('owner REJECTED keeps the employee on hold; owner approval never overwrites an APPROVED attendance row; HR changing the days resets the owner decision', () => {
  const env = disputeWorld();
  env.c.buildAttendanceComparison(P);
  editComparison(env, 'S2', { HR_DECIDED_DAYS: 19, HR_REASON: 'log' });
  env.user = HR; env.c.submitDisputeDecisions(P);
  // owner decision before HR stamped anything is refused per row
  env.user = OWNER;
  const rej = plain(env.c.ownerDecideDisputes(P, 'REJECTED'));
  assert.deepEqual(rej.decided, ['S2']);
  assert.equal(cmpRow(env, 'S2').OWNER_DECISION, 'REJECTED');
  env.user = HR;
  env.c.approveAttendance(P, 'STAFF');
  assert.equal(att(env, 'S2').APPROVAL_STATUS, 'PENDING', 'still blocked from attendance approval');
  env.c.calculateDraft(P, 'STAFF');
  assert.match(env.rowsOf('PAYROLL_EXCEPTIONS').find((e) => e.EMP_ID === 'S2' && e.CODE === 'ATTENDANCE_DISPUTE').MESSAGE, /owner rejected/);
  assert.equal(draft(env, 'S2').NET_PAY, '');
  env.user = OWNER;
  const again = plain(env.c.ownerApproveDisputes(P));
  assert.deepEqual(again.skipped.map((s) => s.reason.split(' ')[0]), ['ALREADY_REJECTED_CLEAR_OWNER_DECISION_FIRST']);
  // owner clears the cell, HR changes the days -> owner decision is reset, must decide again
  editComparison(env, 'S2', { OWNER_DECISION: '', OWNER_BY: '', OWNER_AT: '', HR_DECIDED_DAYS: 18 });
  env.user = HR;
  const re = plain(env.c.submitDisputeDecisions(P));
  assert.equal(re.stamped, 1);
  env.user = OWNER;
  assert.deepEqual(plain(env.c.ownerApproveDisputes(P)).decided, ['S2']);
  editComparison(env, 'S2', { HR_DECIDED_DAYS: 17 });
  env.user = HR;
  const changed = plain(env.c.submitDisputeDecisions(P));
  assert.deepEqual(changed.ownerDecisionsReset, ['S2']);
  assert.equal(cmpRow(env, 'S2').OWNER_DECISION, '');
  // an APPROVED attendance row is never overwritten by the owner approval
  env.c.submitDisputeDecisions(P);
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S2' }, { APPROVAL_STATUS: 'APPROVED', HR_OVERRIDE: 'N', OVERRIDE_REASON: '' });
  env.user = OWNER;
  const blocked = plain(env.c.ownerApproveDisputes(P));
  assert.deepEqual(blocked.decided, []);
  assert.match(blocked.skipped[0].reason, /^ATTENDANCE_ALREADY_APPROVED/);
  assert.equal(cmpRow(env, 'S2').OWNER_DECISION, '', 'fail closed: nothing stamped');
});

test('owner decision typed by hand (wrong OWNER_BY) or a re-submitted register releases nothing: the hold stays until the owner action re-applies it', () => {
  const env = disputeWorld();
  env.c.buildAttendanceComparison(P);
  editComparison(env, 'S2', { HR_DECIDED_DAYS: 19, HR_REASON: 'log' });
  env.user = HR; env.c.submitDisputeDecisions(P);
  editComparison(env, 'S2', { OWNER_DECISION: 'APPROVED', OWNER_BY: HR, OWNER_AT: 'typed' });
  env.c.approveAttendance(P, 'STAFF');
  env.c.calculateDraft(P, 'STAFF');
  const hold = () => env.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.EMP_ID === 'S2' && e.CODE === 'ATTENDANCE_DISPUTE').map((e) => e.MESSAGE)[0] || '';
  assert.match(hold(), /OWNER_BY is not the configured owner/);
  assert.equal(draft(env, 'S2').NET_PAY, '');
  // the real owner action stamps and applies
  editComparison(env, 'S2', { OWNER_DECISION: '', OWNER_BY: '', OWNER_AT: '' });
  env.user = OWNER; env.c.ownerApproveDisputes(P);
  env.user = HR; env.c.approveAttendance(P, 'STAFF'); env.c.calculateDraft(P, 'STAFF');
  assert.equal(hold(), '');
  assert.equal(typeof draft(env, 'S2').NET_PAY, 'number');
  // HR re-submits the register (register wins over the old decision): the decision is no longer applied -> hold again
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S2' }, { APPROVAL_STATUS: 'PENDING' });
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [S('S2', 21)] });
  assert.equal(att(env, 'S2').HR_OVERRIDE, 'N');
  env.c.approveAttendance(P, 'STAFF');
  env.c.calculateDraft(P, 'STAFF');
  assert.equal(draft(env, 'S2').NET_PAY, '');
  assert.match(env.rowsOf('PAYROLL_EXCEPTIONS').find((e) => e.EMP_ID === 'S2' && e.CODE === 'ATTENDANCE_DISPUTE').MESSAGE, /waiting|not in INPUT_ATTENDANCE/);
  // owner re-approves (idempotent action re-applies the decided days)
  env.user = HR; env.c.buildAttendanceComparison(P);
  env.user = OWNER;
  const re = plain(env.c.ownerApproveDisputes(P));
  assert.deepEqual(re.decided, ['S2']);
  assert.deepEqual([att(env, 'S2').HR_OVERRIDE, att(env, 'S2').PHYSICAL_PRESENT_DAYS], ['Y', 19]);
  assert.equal(JSON.parse(att(env, 'S2').GENERATED_VALUES_JSON).PHYSICAL_PRESENT_DAYS, 21);
});

test('the register refresh after a leave change keeps decided dispute days; comparison uses the pre-override figure', () => {
  const env = disputeWorld();
  env.c.buildAttendanceComparison(P);
  editComparison(env, 'S2', { HR_DECIDED_DAYS: 19, HR_REASON: 'log' });
  env.user = HR; env.c.submitDisputeDecisions(P);
  env.user = OWNER; env.c.ownerApproveDisputes(P);
  // approved leave arrives for S2: EL 2 days on Sep 8-9; the register refresh must keep physical 19
  env.addRows('Leave_Applications', [{ Timestamp: '2026-09-12 10:00:00', 'Submission Type': 'Approval (for admin use only)', 'Employee ID': 'S2', 'Leave Type': 'Earned Leave (EL)',
    'Leave Start Date': '2026-09-08', 'Leave End Date': '2026-09-09', 'Approval Decision': 'Approved' }]
    .map((o) => require('./fakes').LEAVE_HDR.reduce((acc, h) => Object.assign(acc, { [h]: h in o ? o[h] : '' }), {})));
  env.user = HR;
  const sync = plain(env.c.syncLeaveFromSource(P));
  assert.equal(sync.registerRowsRefreshed, 1);
  const a = att(env, 'S2');
  assert.deepEqual([a.PHYSICAL_PRESENT_DAYS, a.EL_AVAILED, a.HR_OVERRIDE], [19, 2, 'Y']);
  assert.equal(a.PRESENT_DAYS, 19);
  assert.equal(a.WORKED_DAYS, 19 + 4 + 2);
  env.c.buildAttendanceComparison(P);
  assert.equal(cmpRow(env, 'S2').REGISTER_PRESENT, 20, 'still the register figure');
});
