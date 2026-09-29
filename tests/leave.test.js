'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');
const { LEAVE_HDR, leaveRow } = require('./fakes');
const { P, HR, world } = require('./regenv');

const pure = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '10_Attendance.gs', '20_Feeds.gs', '21_Leave.gs']);

const HDR = ['Timestamp', 'Submission Type', 'Employee ID', 'Leave Start Date', 'Leave Start Date Half', 'Leave End Date', 'Leave End Date Half',
  'Leave Type', 'Approval Decision', 'Approved Number of days', 'Case No'];
const APPROVAL = 'Approval (for admin use only)', APPLY = 'Apply For Leave';
/** row builder: defaults = an approved EL approval row. */
const R = (o) => {
  const d = Object.assign({ ts: '2026-09-10 10:00:00', type: APPROVAL, emp: 'S1', from: '2026-09-01', fromHalf: '', to: '2026-09-01', toHalf: '', lt: 'Earned Leave (EL)',
    dec: 'Approved', days: '', kase: '' }, o);
  return [d.ts, d.type, d.emp, d.from, d.fromHalf, d.to, d.toHalf, d.lt, d.dec, d.days, d.kase];
};
const ROSTER = [{ EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF', SITE: 'NASHIK' }, { EMP_ID: 'S2', PAYROLL_CATEGORY: 'STAFF', SITE: 'NASHIK' },
  { EMP_ID: 'P1', PAYROLL_CATEGORY: 'PUNE_STAFF', SITE: 'PUNE' }];
const map = (rows, period = P, opts = {}) => plain(pure.mapLeaveRows(HDR, rows, period, ROSTER, Object.assign({ enteredAt: 'T', sourceLabel: 'LV' }, opts)));
const summary = (m) => m.valid.map((v) => `${v.EMP_ID}:${v.LEAVE_TYPE}:${v.DAYS}`).sort();

test('normalizes leave types case / space insensitively; unknown or ambiguous -> null', () => {
  const n = (s) => pure.leave_normalizeType(s);
  assert.equal(n('Earned Leave (EL)'), 'EL');
  assert.equal(n('earned Leave (EL)'), 'EL');
  assert.equal(n('  casual   Leave (CL) '), 'CL');
  assert.equal(n('MEdical Leave (SL)'), 'SL');
  assert.equal(n('Outdoor Duty (OD)'), 'OD');
  assert.equal(n('Compensatory Off- C/Off'), 'COFF');
  assert.equal(n('Leave Without Pay (LWP)'), 'LWP');
  assert.equal(n('Paternity'), null);
  assert.equal(n(''), null);
  assert.equal(n('Earned or Casual'), null, 'two types in one text is never guessed');
});

test('an approval row is self-contained: approved leave counts without an Apply row (decision with trailing spaces, all six types)', () => {
  const m = map([
    R({ from: '2026-09-01', to: '2026-09-02', dec: 'Approved  ' }),
    R({ emp: 'S2', lt: 'earned Leave (EL)', from: '2026-09-08', to: '2026-09-08' }),
    R({ emp: 'S1', lt: 'casual Leave (CL)', from: '2026-09-09', to: '2026-09-09' }),
    R({ emp: 'S1', lt: 'MEdical Leave (SL)', from: '2026-09-10', to: '2026-09-10' }),
    R({ emp: 'S1', lt: 'Outdoor Duty (OD)', from: '2026-09-15', to: '2026-09-16' }),
    R({ emp: 'S1', lt: 'Compensatory Off- C/Off', from: '2026-09-17', to: '2026-09-17' }),
    R({ emp: 'S1', lt: 'Leave Without Pay (LWP)', from: '2026-09-22', to: '2026-09-22' }),
  ]);
  assert.deepEqual(m.exceptions, []);
  assert.deepEqual(summary(m), ['S1:CL:1', 'S1:COFF:1', 'S1:EL:2', 'S1:LWP:1', 'S1:OD:2', 'S1:SL:1', 'S2:EL:1']);
  const v = m.valid[0];
  assert.deepEqual([v.PAYROLL_MONTH, v.LEAVE_TYPE, v.FROM_DATE, v.TO_DATE, v.STATUS, v.NORMALIZER_VERSION, v.ENTERED_AT, v.SOURCE_REF, v.KEY],
    [P, 'EL', '2026-09-01', '2026-09-02', 'VALID', 'LEAVE-1.0', 'T', 'LV!2', 'S1|EL|2026-09-01|2026-09-02']);
});

test('Apply + Approval: matched by Case No when both have one; else by EMP + dates + type; pending / unmatched apply rows never count', () => {
  const m = map([
    R({ type: APPLY, dec: '', kase: '7', ts: '2026-09-01 09:00:00' }),
    R({ kase: '7', ts: '2026-09-02 09:00:00' }),                                  // same case: one leave, not two
    R({ type: APPLY, emp: 'S2', from: '2026-09-10', to: '2026-09-11', dec: '', ts: '2026-09-01 09:00:00' }),
    R({ emp: 'S2', from: '2026-09-10', to: '2026-09-11', ts: '2026-09-02 09:00:00' }), // no case: fallback key, one leave
    R({ type: APPLY, emp: 'S1', from: '2026-09-20', to: '2026-09-21', dec: '', lt: 'Casual Leave (CL)' }), // still pending
  ]);
  assert.deepEqual(summary(m), ['S1:EL:1', 'S2:EL:2']);
  assert.equal(m.pendingCount, 1);
  assert.deepEqual(m.exceptions, []);
  // the same Case No for two different employees is two different leaves
  const two = map([R({ kase: '9' }), R({ emp: 'S2', kase: '9', from: '2026-09-03', to: '2026-09-03' })]);
  assert.deepEqual(summary(two), ['S1:EL:1', 'S2:EL:1']);
  // Apply carries the case, Approval has none: joined by the fallback key
  const mixed = map([R({ type: APPLY, dec: '', kase: '11', ts: '2026-09-01 09:00:00' }), R({ ts: '2026-09-02 09:00:00' })]);
  assert.deepEqual(summary(mixed), ['S1:EL:1']);
  assert.equal(mixed.pendingCount, 0);
});

test('the LATEST decisive approval wins: rejected-after-approved revokes, approved-after-rejected counts, corrected days replace', () => {
  const rejectedLater = map([R({ kase: '5', ts: '2026-09-02 09:00:00' }), R({ kase: '5', dec: 'Rejected', ts: '2026-09-03 09:00:00' })]);
  assert.deepEqual(rejectedLater.valid, []);
  assert.equal(rejectedLater.revokedCount, 1);
  assert.deepEqual(rejectedLater.exceptions, []);
  const approvedLater = map([R({ kase: '5', dec: 'Rejected', ts: '2026-09-02 09:00:00' }), R({ kase: '5', ts: '2026-09-03 09:00:00' })]);
  assert.deepEqual(summary(approvedLater), ['S1:EL:1']);
  const corrected = map([R({ from: '2026-09-01', to: '2026-09-03', days: 3, ts: '2026-09-02 09:00:00' }), R({ from: '2026-09-01', to: '2026-09-03', days: 2, ts: '2026-09-04 09:00:00' })]);
  assert.deepEqual(summary(corrected), ['S1:EL:2'], 'the latest approved days win, counted once');
  // a fallback-key group with no case behaves the same
  const fb = map([R({ ts: '2026-09-02 09:00:00' }), R({ dec: 'Rejected', ts: '2026-09-05 09:00:00' })]);
  assert.deepEqual(fb.valid, []);
  assert.equal(fb.revokedCount, 1);
  // an approval row with a blank decision is pending
  const pend = map([R({ dec: '' })]);
  assert.deepEqual([pend.valid.length, pend.pendingCount], [0, 1]);
});

test('half days: start / end flags count 0.5; single half day; approved days override the computed figure (spread proportionally)', () => {
  // Tue 1 .. Thu 3 Sept, both ends half: 0.5 + 1 + 0.5
  assert.deepEqual(summary(map([R({ from: '2026-09-01', to: '2026-09-03', fromHalf: 'First Half', toHalf: 'Second Half' })])), ['S1:EL:2']);
  assert.deepEqual(summary(map([R({ from: '2026-09-01', to: '2026-09-01', fromHalf: 'Half Day' })])), ['S1:EL:0.5']);
  assert.deepEqual(summary(map([R({ from: '2026-09-01', to: '2026-09-01', fromHalf: 'Half', toHalf: 'Half' })])), ['S1:EL:0.5'], 'both flags on one day is still half a day');
  assert.deepEqual(summary(map([R({ from: '2026-09-01', to: '2026-09-02', fromHalf: 'Full Day', toHalf: 'No' })])), ['S1:EL:2'], 'full-day words are not half days');
  const adj = map([R({ from: '2026-09-01', to: '2026-09-04', days: 3 })]);
  assert.deepEqual(summary(adj), ['S1:EL:3']);
  assert.match(adj.valid[0].EXCEPTION_REASON, /^NOTE: approved days 3 differ from computed 4/);
  const bad = map([R({ fromHalf: 'purple' })]);
  assert.equal(bad.exceptions[0].EXCEPTION_REASON.split(' | ')[0], 'HALF_DAY_FLAG_UNRECOGNISED');
});

test('multi-month leave is split per date; only dates inside the period count; weekly off and paid holidays carry no leave', () => {
  // Fri 28 Aug .. Thu 3 Sep 2026, Sundays off: Aug 28, 29, 31 | Sep 1, 2, 3  (30 Aug is a Sunday)
  const row = R({ from: '2026-08-28', to: '2026-09-03' });
  const opts = { weeklyOffBySite: { NASHIK: 'SUN', PUNE: 'SUN' } };
  assert.deepEqual(summary(map([row], '2026-09', opts)), ['S1:EL:3']);
  assert.deepEqual(summary(map([row], '2026-08', opts)), ['S1:EL:3']);
  // without calendar knowledge every date counts: 4 days in September, 3 in August
  assert.deepEqual(summary(map([row], '2026-09')), ['S1:EL:3'], 'Sep 1..3 either way');
  assert.deepEqual(summary(map([row], '2026-08')), ['S1:EL:4'], 'Aug 28..31 without the calendar');
  // approved days 5 of 6 working dates: spread proportionally (5/6 per date)
  const scaled = map([R({ from: '2026-08-28', to: '2026-09-03', days: 5 })], '2026-09', opts);
  assert.deepEqual(summary(scaled), ['S1:EL:2.5']);
  // a paid holiday inside the leave carries no leave (Tue 1 Sep is a holiday)
  const hol = map([R({ from: '2026-09-01', to: '2026-09-03' })], '2026-09', Object.assign({ holidays: [{ DATE: '2026-09-01', SITE: 'ALL', PAID: 'Y' }] }, opts));
  assert.deepEqual(summary(hol), ['S1:EL:2']);
  // a leave that lies wholly in another month is ignored (no row, no exception)
  const other = map([row], '2026-10');
  assert.deepEqual([other.valid.length, other.exceptions.length], [0, 0]);
  // leave entirely on weekly offs -> no days, nothing counted
  const sunday = map([R({ from: '2026-09-06', to: '2026-09-06' })], '2026-09', opts);
  assert.equal(sunday.valid.length + sunday.exceptions.length, 1);
  assert.equal(sunday.exceptions[0].EXCEPTION_REASON.split(' | ')[0], 'NO_WORKING_DAYS_IN_LEAVE');
});

test('exceptions (never counted): unknown employee / type, dates, invalid approved days, decision on the wrong row, overlap, duplicate', () => {
  const rows = [
    R({ emp: 'ZZ9' }),                                                        // unknown employee
    R({ lt: 'Paternity', from: '2026-09-02', to: '2026-09-02' }),             // unknown type
    R({ from: '2026-09-10', to: '2026-09-05' }),                              // end before start
    R({ from: '2019-09-10', to: '2019-09-12' }),                              // not relevant to the period: silently skipped
    R({ from: '2026-09-14', to: '2026-09-14', days: 'abc' }),                 // invalid approved days
    R({ from: '2026-09-15', to: '2026-09-15', days: 3 }),                     // approved days exceed the range
    R({ from: '2026-09-16', to: '2026-12-31' }),                              // runaway span
    R({ type: APPLY, from: '2026-09-17', to: '2026-09-17' }),                 // Approved decision on an Apply row
    R({ from: '2026-09-21', to: '2026-09-22', kase: '87', ts: '2026-09-03 09:00:00' }),   // fine
    R({ lt: 'Casual Leave (CL)', from: '2026-09-22', to: '2026-09-23', ts: '2026-09-04 09:00:00' }), // overlaps the EL on the 22nd
    R({ from: '2026-09-21', to: '2026-09-22', kase: '88', ts: '2026-09-05 09:00:00' }),              // same dates + type, different case: duplicate
    R({ from: '2026-09-25', to: '2026-09-25', dec: 'Maybe' }),                // unrecognised decision
    R({ from: 'not a date', to: '2026-09-28' }),                              // start unparseable
  ];
  const m = map(rows);
  const reasons = m.exceptions.map((e) => e.EXCEPTION_REASON.split(' | ')[0]).sort();
  assert.deepEqual(reasons, ['APPROVED_DAYS_EXCEED_RANGE', 'APPROVED_DAYS_INVALID', 'APPROVED_ON_NON_APPROVAL_ROW', 'DUPLICATE_APPROVED_LEAVE',
    'END_BEFORE_START', 'LEAVE_SPAN_TOO_LONG', 'OVERLAPS_OTHER_LEAVE', 'START_DATE_UNPARSEABLE', 'UNKNOWN_LEAVE_TYPE', 'UNKNOWN_OR_INACTIVE_EMP_ID',
    'UNRECOGNISED_DECISION'].sort());
  assert.deepEqual(summary(m), ['S1:EL:2']);
  m.exceptions.forEach((e) => { assert.equal(e.STATUS, 'EXCEPTION'); assert.equal(e.DAYS, 0); assert.match(e.KEY, /\|R\d+$/); });
  // not relevant rows (other months) raise nothing, so history never blocks a new month
  const quiet = map([R({ emp: 'ZZ9', from: '2026-07-01', to: '2026-07-02' })]);
  assert.deepEqual([quiet.valid.length, quiet.exceptions.length], [0, 0]);
  // a missing required header fails closed
  const bare = plain(pure.mapLeaveRows(['Timestamp', 'Submission Type'], [], P, ROSTER, {}));
  assert.ok(bare.missingColumns.length > 0);
});

test('date cells: Date objects and dd/mm/yyyy text are read; case group across rows uses the row order for equal timestamps', () => {
  const m = plain(pure.mapLeaveRows(HDR, [
    R({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 2), ts: new Date(2026, 8, 5, 10, 0, 0) }),
    R({ emp: 'S2', from: '03/09/2026', to: '04/09/2026' }),
  ], P, ROSTER, {}));
  assert.deepEqual(summary(m), ['S1:EL:2', 'S2:EL:2']);
});

test('leaveByEmp counts VALID normalizer rows of the period only; leaveExceptions lists current exception rows', () => {
  const rows = [
    { PAYROLL_MONTH: P, EMP_ID: 's1', LEAVE_TYPE: 'EL', DAYS: 2, KEY: 'k1', STATUS: 'VALID', NORMALIZER_VERSION: 'LEAVE-1.0' },
    { PAYROLL_MONTH: P, EMP_ID: 'S1', LEAVE_TYPE: 'EL', DAYS: 1.5, KEY: 'k2', STATUS: 'VALID', NORMALIZER_VERSION: 'LEAVE-1.0' },
    { PAYROLL_MONTH: P, EMP_ID: 'S1', LEAVE_TYPE: 'OD', DAYS: 1, KEY: 'k3', STATUS: 'VALID', NORMALIZER_VERSION: 'LEAVE-1.0' },
    { PAYROLL_MONTH: P, EMP_ID: 'S1', LEAVE_TYPE: 'CL', DAYS: 9, KEY: 'k4', STATUS: 'SUPERSEDED', NORMALIZER_VERSION: 'LEAVE-1.0' },
    { PAYROLL_MONTH: P, EMP_ID: 'S1', LEAVE_TYPE: 'SL', DAYS: 9, KEY: 'k5', STATUS: 'EXCEPTION', NORMALIZER_VERSION: 'LEAVE-1.0', EXCEPTION_REASON: 'X' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'S1', LEAVE_TYPE: 'SL', DAYS: 9, KEY: 'k6', STATUS: 'VALID', NORMALIZER_VERSION: 'LEAVE-1.0' },
    { PAYROLL_MONTH: P, EMP_ID: 'S1', LEAVE_TYPE: 'SL', DAYS: 9, STATUS: 'VALID' },                     // typed by hand: not a normalizer row
  ];
  assert.deepEqual(plain(pure.leaveByEmp(rows, P)), { S1: { EL: 3.5, OD: 1 } });
  assert.deepEqual(plain(pure.leaveExceptions(rows, P)).map((e) => [e.EMP_ID, e.reason]), [['S1', 'X']]);
});

test('re-sync plan: identical rows kept; changed / removed superseded (days zeroed, original kept); fresh rows appended', () => {
  const live = (o) => Object.assign({ _row: 2, PAYROLL_MONTH: P, EMP_ID: 'S1', LEAVE_TYPE: 'EL', DAYS: 1, KEY: 'S1|EL|a|a', STATUS: 'VALID', NORMALIZER_VERSION: 'LEAVE-1.0', EXCEPTION_REASON: '' }, o);
  const fresh = (o) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: 'S1', LEAVE_TYPE: 'EL', DAYS: 1, KEY: 'S1|EL|a|a', STATUS: 'VALID', EXCEPTION_REASON: '' }, o);
  const same = plain(pure.leave_planResync([live()], [fresh()], P));
  assert.deepEqual([same.supersede.length, same.append.length, same.unchanged], [0, 0, 1]);
  const changed = plain(pure.leave_planResync([live()], [fresh({ DAYS: 2 })], P));
  assert.deepEqual([changed.supersede.length, changed.append.length], [1, 1]);
  const gone = plain(pure.leave_planResync([live(), live({ _row: 3, KEY: 'other' })], [fresh()], P));
  assert.deepEqual([gone.supersede.map((r) => r._row), gone.unchanged], [[3], 1]);
  const skip = plain(pure.leave_planResync([live({ STATUS: 'SUPERSEDED' }), live({ NORMALIZER_VERSION: '', _row: 4 })], [], P));
  assert.equal(skip.supersede.length, 0, 'already superseded and hand-typed rows are never touched');
  const sv = plain(pure.leave_supersedeValues(live({ DAYS: 2.5 }), 'STAMP'));
  assert.deepEqual([sv.STATUS, sv.DAYS], ['SUPERSEDED', 0]);
  assert.match(sv.EXCEPTION_REASON, /^SUPERSEDED_BY_RESYNC STAMP \| WAS=VALID \| ORIGINAL_DAYS=2.5$/);
});

// ---------------------------------------------------------------- sheet integration
const src = (rows) => rows.map((r) => leaveRow(r));

test('syncLeaveFromSource (local tab): writes VALID + EXCEPTION rows, is idempotent, supersedes after a later rejection, never reads the password column', () => {
  const env = world({ leaveSourceRows: src([
    { 'Employee ID': 'S1', 'Leave Type': 'Earned Leave (EL)', 'Leave Start Date': '2026-09-01', 'Leave End Date': '2026-09-02', 'Case No': '5' },
    { 'Employee ID': 'S2', 'Leave Type': 'Paternity', 'Leave Start Date': '2026-09-03', 'Leave End Date': '2026-09-03' },
    { 'Employee ID': '', 'Submission Type': '', 'Approval Decision': '' },
  ]) });
  const r = plain(env.c.syncLeaveFromSource(P));
  assert.deepEqual([r.validWritten, r.validDays, r.exceptionsWritten, r.superseded, r.unchanged], [1, 2, 1, 0, 0]);
  const rows = env.rowsOf('INPUT_LEAVE');
  assert.equal(rows.length, 2);
  const v = rows.find((x) => x.STATUS === 'VALID');
  assert.deepEqual([v.PAYROLL_MONTH, v.EMP_ID, v.LEAVE_TYPE, v.DAYS, v.FROM_DATE, v.TO_DATE, v.CASE_NO, v.NORMALIZER_VERSION], [P, 'S1', 'EL', 2, '2026-09-01', '2026-09-02', '5', 'LEAVE-1.0']);
  assert.equal(v.SOURCE_REF, 'Leave_Applications!2');
  // password column: never selected (header cell of row 1 only is read for it), sentinel nowhere
  const pwCol = LEAVE_HDR.indexOf('Password') + 1;
  const calls = env.sheets.Leave_Applications.calls;
  assert.ok(calls.length > 0);
  calls.forEach((c) => { if (c.nr > 1 || c.r > 1) assert.ok(!(c.c <= pwCol && pwCol < c.c + c.nc), `data call covers the password column: ${JSON.stringify(c)}`); });
  assert.doesNotMatch(JSON.stringify(env.sheets.INPUT_LEAVE.data) + JSON.stringify(env.sheets.AUDIT_LOG.data), /SECRET-SENTINEL/);
  // idempotent
  const again = plain(env.c.syncLeaveFromSource(P));
  assert.deepEqual([again.validWritten, again.exceptionsWritten, again.superseded, again.unchanged], [0, 0, 0, 2]);
  // a later Rejected for the same case supersedes the row (days zeroed) and leaves nothing payable
  env.addRows('Leave_Applications', src([{ 'Employee ID': 'S1', 'Leave Type': 'Earned Leave (EL)', 'Leave Start Date': '2026-09-01', 'Leave End Date': '2026-09-02', 'Case No': '5',
    'Approval Decision': 'Rejected', Timestamp: '2026-09-12 10:00:00' }]));
  const re = plain(env.c.syncLeaveFromSource(P));
  assert.equal(re.superseded, 1);
  assert.equal(re.revokedByRejection, 1);
  const sup = env.rowsOf('INPUT_LEAVE').find((x) => x.STATUS === 'SUPERSEDED');
  assert.equal(sup.DAYS, 0);
  assert.match(sup.EXCEPTION_REASON, /ORIGINAL_DAYS=2/);
  assert.deepEqual(plain(env.c.leaveByEmp(env.rowsOf('INPUT_LEAVE'), P)), {});
  assert.throws(() => env.c.syncLeaveFromSource('2026-08'), /earlier than MIN_PERIOD/);
});

test('syncLeaveFromSource (external spreadsheet, read-only): opened by id; failure names the view-access remedy; LOCKED populations untouched', () => {
  const env = world({ leaveSource: false, control: [{ KEY: 'LEAVE_SOURCE_SPREADSHEET_ID', VALUE: 'LEAVE_SS' }, { KEY: 'LEAVE_SOURCE_TAB', VALUE: 'Leave_Applications' }] });
  assert.throws(() => env.c.syncLeaveFromSource(P), /Cannot open the leave spreadsheet.*VIEW access.*Sync leave/s);
  const { makeSheet } = require('./fakes');
  const ext = makeSheet('Leave_Applications');
  ext.data = [LEAVE_HDR.slice()].concat(src([{ 'Employee ID': 'S1', 'Leave Type': 'Casual Leave (CL)', 'Leave Start Date': '2026-09-08', 'Leave End Date': '2026-09-08' },
    { 'Employee ID': 'P1', 'Leave Type': 'Casual Leave (CL)', 'Leave Start Date': '2026-09-09', 'Leave End Date': '2026-09-09' }])
    .map((o) => LEAVE_HDR.map((h) => (h in o ? o[h] : ''))));
  env.external.LEAVE_SS = { Leave_Applications: ext };
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'PUNE_STAFF' }, { STATUS: 'LOCKED' });
  const r = plain(env.c.syncLeaveFromSource(P));
  assert.equal(r.source, 'leave:Leave_Applications');
  assert.equal(r.validWritten, 1);
  assert.equal(r.lockedSkipped, 1);
  assert.deepEqual(env.rowsOf('INPUT_LEAVE').map((x) => x.EMP_ID), ['S1']);
  const before = JSON.stringify(ext.data);
  env.c.syncLeaveFromSource(P);
  assert.equal(JSON.stringify(ext.data), before, 'the source spreadsheet is never written');
  // a missing tab is reported
  env.external.LEAVE_SS = {};
  assert.throws(() => env.c.syncLeaveFromSource(P), /no tab "Leave_Applications"/);
});

test('leave sync refreshes the PENDING register rows (leave changes components) and lists stale APPROVED ones', () => {
  const att = (id, cat, over) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26, APPROVAL_STATUS: 'PENDING' }, over);
  const env = world({ leaveSourceRows: src([
    { 'Employee ID': 'S1', 'Leave Type': 'Earned Leave (EL)', 'Leave Start Date': '2026-09-01', 'Leave End Date': '2026-09-02' },
    { 'Employee ID': 'S2', 'Leave Type': 'Casual Leave (CL)', 'Leave Start Date': '2026-09-03', 'Leave End Date': '2026-09-03' }]) });
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S1', days: 20 }, { empId: 'S2', days: 20 }] });
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S2' }, { APPROVAL_STATUS: 'APPROVED' });
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S1').EL_AVAILED, 0);
  const r = plain(env.c.syncLeaveFromSource(P));
  assert.equal(r.registerRowsRefreshed, 1);
  assert.deepEqual(r.registerStaleApproved, ['S2']);
  const s1 = env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S1');
  assert.deepEqual([s1.EL_AVAILED, s1.PRESENT_DAYS, s1.WORKED_DAYS, s1.SOURCE_REF], [2, 20, 26, 'REGISTER']);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S2').CL_AVAILED, 0, 'approved row untouched');
  assert.ok(att);
});

test('leaveAutoSync_ never throws: failure stores LEAVE_SYNC_ERROR_<period> and reopens the LEAVE feed; success clears the error', () => {
  const env = world({ leaveSource: false, control: [{ KEY: 'LEAVE_SOURCE_SPREADSHEET_ID', VALUE: 'LEAVE_SS' }] });
  env.put('FEED_STATUS', ['PERIOD', 'FEED', 'STATUS', 'MARKED_BY', 'MARKED_AT', 'NOTE'], [{ PERIOD: P, FEED: 'LEAVE', STATUS: 'COMPLETE' }]);
  const bad = plain(env.c.leaveAutoSync_(P));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /VIEW access/);
  const ctl = Object.fromEntries(env.rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]));
  assert.match(ctl['LEAVE_SYNC_ERROR_' + P], /Cannot open the leave spreadsheet/);
  assert.equal(env.rowsOf('FEED_STATUS').find((f) => f.FEED === 'LEAVE').STATUS, 'OPEN');
  // reachable now: the error is cleared
  const { makeSheet } = require('./fakes');
  const ext = makeSheet('Leave_Applications'); ext.data = [LEAVE_HDR.slice()];
  env.external.LEAVE_SS = { Leave_Applications: ext };
  const ok = plain(env.c.leaveAutoSync_(P));
  assert.equal(ok.ok, true);
  assert.equal(Object.fromEntries(env.rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]))['LEAVE_SYNC_ERROR_' + P], '');
});

test('leave is NOT wired into the form-submit router (separate spreadsheet); sync is menu-driven', () => {
  const env = world();
  assert.equal(env.c.routeFormSubmit('Leave_Applications', ''), null);
  assert.equal(env.c.routeFormSubmit('LEAVE_FORM_RESPONSES', ''), null);
  assert.equal(env.c.routeFormSubmit('OT_FORM_RESPONSES', ''), 'OT');
});

// ---------------------------------------------------------------- balances for the payslip
test('leave balance columns: identified only when EL / CL / SL available and the employee column each match exactly once', () => {
  const ok = plain(pure.leave_balanceColumns_(['Employee ID', 'Name', 'EL Available', 'CL Available', 'SL Available', 'Total Available']));
  assert.deepEqual([ok.ok, ok.emp, ok.EL, ok.CL, ok.SL], [true, 0, 2, 3, 4]);
  assert.equal(pure.leave_balanceColumns_(['EMP ID', 'EL Available', 'CL Available', 'SL Available']).ok, true);
  assert.equal(pure.leave_balanceColumns_(['Employee ID', 'EL Available', 'EL Available', 'CL Available', 'SL Available']).ok, false, 'two EL columns: not confident');
  assert.equal(pure.leave_balanceColumns_(['Employee ID', 'EL', 'CL', 'SL', 'Total Available']).ok, false);
  assert.equal(pure.leave_balanceColumns_(['Employee ID', 'Password', 'EL Available', 'CL Available']).ok, false);
});

test('balances from rows: an employee in several rows (blocks per cycle) gets no balance; non-numeric cells are left out', () => {
  const cols = { emp: 0, EL: 1, CL: 2, SL: 3 };
  const b = plain(pure.leave_balancesFromRows(cols, [['S1', 10, 5, 3], ['S2', 8, 'x', 2], ['S3', 1, 1, 1], ['s3', 2, 2, 2], ['', 9, 9, 9]]));
  assert.deepEqual(b.byEmp, { S1: { EL: 10, CL: 5, SL: 3 }, S2: { EL: 8, SL: 2 } });
  assert.deepEqual(b.ambiguous, ['S3']);
});

test('leave_readBalances_: header row found in the first rows, values read column by column from the leave spreadsheet, note when not confident', () => {
  const { makeSheet } = require('./fakes');
  const env = world({ leaveSource: false, control: [{ KEY: 'LEAVE_SOURCE_SPREADSHEET_ID', VALUE: 'LEAVE_SS' }] });
  const tab = makeSheet('Leave Databse Staff');
  tab.data = [['Leave database'], ['Employee ID', 'Name', 'EL Available', 'CL Available', 'SL Available', 'Total Available'],
    ['S1', 'Staff One', 12, 4.5, 6, 22.5], ['S2', 'Staff Two', 3, 1, 0, 4], ['S2', 'dup', 1, 1, 1, 3]];
  const cons = makeSheet('Leave Dadabase PW'); cons.data = [['Employee', 'Blocks'], ['W1', 'x']];
  env.external.LEAVE_SS = { 'Leave Databse Staff': tab, 'Leave Dadabase PW': cons };
  const r = plain(env.c.leave_readBalances_('STAFF', ['S1', 'S2', 'S9']));
  assert.deepEqual(r.byEmp, { S1: { EL: 12, CL: 4.5, SL: 6 } });
  assert.equal(r.matched, 1);
  assert.match(r.note, /1 employee\(s\) appear in several rows/);
  const bad = plain(env.c.leave_readBalances_('PERMANENT_WORKER', ['W1']));
  assert.deepEqual(bad.byEmp, {});
  assert.match(bad.note, /could not identify .*Leave Dadabase PW.*blank/);
  assert.match(plain(env.c.leave_readBalances_('PUNE_STAFF', ['P1'])).note, /no leave-balance tab/);
  env.external.LEAVE_SS = {};
  assert.match(plain(env.c.leave_readBalances_('STAFF', ['S1'])).note, /no tab "Leave Databse Staff"/);
});

test('payslip tokens EL_AVAILABLE / CL_AVAILABLE / SL_AVAILABLE print the balance, blank otherwise', () => {
  const c = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '20_Feeds.gs', '30_Calc.gs', '32_Engine.gs', '50_Payslips.gs']);
  const row = { PERIOD: P, EMP_ID: 'S1', BASIC: 1, HRA: 1, CONVEYANCE: 1, EDUCATION: 1, WASHING: 1, MEDICAL: 1, PRO_DEV: 1, COMMUNICATION: 1, UNIFORM: 1, TDS: 0, NET_PAY: 10 };
  const sal = { BASIC_PM_INR: 1, HRA_PM_INR: 1, CONVEYANCE_PM_INR: 1, EDUCATION_PM_INR: 1, WASHING_PM_INR: 1, MEDICAL_PM_INR: 1, PRO_DEV_PM_INR: 1, COMMUNICATION_PM_INR: 1, UNIFORM_PM_INR: 1 };
  const withBal = plain(c.buildReplacements('STAFF', row, {}, sal, null, { EL: 12, CL: 4.5, SL: 0 }));
  assert.deepEqual([withBal.EL_AVAILABLE, withBal.CL_AVAILABLE, withBal.SL_AVAILABLE], ['12', '4.5', '0']);
  const none = plain(c.buildReplacements('STAFF', row, {}, sal, null, null));
  assert.deepEqual([none.EL_AVAILABLE, none.CL_AVAILABLE, none.SL_AVAILABLE], ['', '', '']);
  const partial = plain(c.buildReplacements('STAFF', row, {}, sal, null, { EL: 5 }));
  assert.deepEqual([partial.EL_AVAILABLE, partial.CL_AVAILABLE], ['5', '']);
  assert.ok(HR);
});
