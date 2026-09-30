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

test('Apply + Approval are linked ONLY by EMP + start + end + type; Case No is informational and never groups; pending apply rows never count', () => {
  const m = map([
    R({ type: APPLY, dec: '', kase: '7', ts: '2026-09-01 09:00:00' }),
    R({ kase: '7', ts: '2026-09-02 09:00:00' }),                                  // same key: one leave, not two
    R({ type: APPLY, emp: 'S2', from: '2026-09-10', to: '2026-09-11', dec: '', ts: '2026-09-01 09:00:00' }),
    R({ emp: 'S2', from: '2026-09-10', to: '2026-09-11', ts: '2026-09-02 09:00:00' }), // no case: same key, one leave
    R({ type: APPLY, emp: 'S1', from: '2026-09-20', to: '2026-09-21', dec: '', lt: 'Casual Leave (CL)' }), // still pending
  ]);
  assert.deepEqual(summary(m), ['S1:EL:1', 'S2:EL:2']);
  assert.equal(m.pendingCount, 1);
  assert.deepEqual(m.exceptions, []);
  // ONE case number shared by five different leaves of one employee (real data): every leave counts, none is dropped
  const shared = map([
    R({ kase: '4200', from: '2026-09-01', to: '2026-09-01' }), R({ kase: '4200', from: '2026-09-03', to: '2026-09-03' }),
    R({ kase: '4200', from: '2026-09-08', to: '2026-09-09' }), R({ kase: '4200', lt: 'Casual Leave (CL)', from: '2026-09-15', to: '2026-09-15' }),
    R({ kase: '4200', from: '2026-09-22', to: '2026-09-22' })]);
  assert.deepEqual(summary(shared), ['S1:CL:1', 'S1:EL:1', 'S1:EL:1', 'S1:EL:1', 'S1:EL:2'].sort());
  assert.ok(shared.valid.every((v) => v.CASE_NO === '4200'), 'case number kept as information');
  assert.deepEqual(shared.exceptions, []);
  // a case shared by two employees / a same-case Apply of a different leave is not a link
  const two = map([R({ kase: '9' }), R({ emp: 'S2', kase: '9', from: '2026-09-03', to: '2026-09-03' })]);
  assert.deepEqual(summary(two), ['S1:EL:1', 'S2:EL:1']);
  const diffDates = map([R({ type: APPLY, dec: '', kase: '11', from: '2026-09-05', to: '2026-09-05', ts: '2026-09-01 09:00:00' }), R({ kase: '11', from: '2026-09-07', to: '2026-09-07' })]);
  assert.deepEqual(summary(diffDates), ['S1:EL:1']);
  assert.equal(diffDates.pendingCount, 1, 'the Apply of another date stays pending');
  // duplicate approvals of the same EMP+start+end+type collapse to one (latest wins), even with different case numbers
  const dup = map([R({ kase: '1', ts: '2026-09-02 09:00:00' }), R({ kase: '2', ts: '2026-09-05 09:00:00' }), R({ ts: '2026-09-06 09:00:00' })]);
  assert.deepEqual(summary(dup), ['S1:EL:1']);
  assert.deepEqual(dup.exceptions, []);
});

test('an Apply row that itself carries Approval Decision = Approved counts as approved leave (no separate approval row)', () => {
  const m = map([R({ type: APPLY, lt: 'Outdoor Duty (OD)', from: '2026-09-04', to: '2026-09-04', days: 1, dec: 'Approved' }),
    R({ type: APPLY, emp: 'S2', from: '2026-09-07', to: '2026-09-08', days: 2, dec: 'Approved  ' })]);
  assert.deepEqual(summary(m), ['S1:OD:1', 'S2:EL:2']);
  assert.deepEqual(m.exceptions, []);
  assert.equal(m.pendingCount, 0);
  // a later Rejected on the approval side still revokes it
  const rv = map([R({ type: APPLY, dec: 'Approved', ts: '2026-09-02 09:00:00' }), R({ dec: 'Rejected', ts: '2026-09-03 09:00:00' })]);
  assert.deepEqual(rv.valid, []);
  assert.equal(rv.revokedCount, 1);
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

test('half-day flags are SIDE-AWARE: start "Second Half" / end "First Half" = half; "First"/"Second" on the other side and Full/blank = full', () => {
  const one = (fromHalf, toHalf, extra) => summary(map([R(Object.assign({ from: '2026-09-01', to: '2026-09-03', fromHalf, toHalf }, extra))]));
  // Tue 1 .. Thu 3 Sept: the form's normal "First Half" start / "Second Half" end = full first and last day
  assert.deepEqual(one('First Half', 'Second Half'), ['S1:EL:3']);
  assert.deepEqual(one('Second Half', 'Second Half'), ['S1:EL:2.5'], 'start half only');
  assert.deepEqual(one('First Half', 'First Half'), ['S1:EL:2.5'], 'end half only');
  assert.deepEqual(one('Second Half', 'First Half'), ['S1:EL:2']);
  assert.deepEqual(one('Full Day', 'No'), ['S1:EL:3']);
  assert.deepEqual(one('', ''), ['S1:EL:3']);
  // generic words mean half on either side
  assert.deepEqual(one('Half Day', ''), ['S1:EL:2.5']);
  assert.deepEqual(one('', 'Half'), ['S1:EL:2.5']);
  // single day: half when either the start is "Second Half" or the end is "First Half"
  const day = (a, b) => summary(map([R({ from: '2026-09-01', to: '2026-09-01', fromHalf: a, toHalf: b })]));
  assert.deepEqual([day('First Half', 'Second Half'), day('Second Half', 'Second Half'), day('First Half', 'First Half'), day('Half', 'Half')],
    [['S1:EL:1'], ['S1:EL:0.5'], ['S1:EL:0.5'], ['S1:EL:0.5']]);
  // "Approved Number of days" wins: the flags are ignored entirely (even a nonsense flag)
  assert.deepEqual(one('Second Half', 'First Half', { days: 3 }), ['S1:EL:3']);
  assert.deepEqual(one('purple', '', { days: 2 }), ['S1:EL:2']);
  assert.deepEqual(summary(map([R({ from: '2026-09-01', to: '2026-09-01', fromHalf: 'First Half', toHalf: 'First Half', days: 1 })])), ['S1:EL:1'], 'flags say half, approver said 1');
  assert.deepEqual(summary(map([R({ from: '2026-09-01', to: '2026-09-01', days: 0.5 })])), ['S1:EL:0.5']);
  // an unrecognised flag only matters when the days are computed from the flags
  assert.equal(map([R({ fromHalf: 'purple' })]).exceptions[0].EXCEPTION_REASON.split(' | ')[0], 'HALF_DAY_FLAG_UNRECOGNISED');
  // unit
  const f = pure.leave_halfFlag_;
  assert.deepEqual(['Second Half', 'First Half', '', 'Full'].map((x) => f(x, 'START')), ['HALF', 'FULL', 'FULL', 'FULL']);
  assert.deepEqual(['Second Half', 'First Half', '', 'Full'].map((x) => f(x, 'END')), ['FULL', 'HALF', 'FULL', 'FULL']);
});

test('approved days are CALENDAR days incl. weekly offs: never rescaled, spread evenly over ALL dates of the range, only in-window dates counted', () => {
  const opts = { weeklyOffBySite: { NASHIK: 'SUN', PUNE: 'SUN' }, holidays: [{ DATE: '2026-09-01', SITE: 'ALL', PAID: 'Y' }] };
  // Mon 7 .. Sun 13 Sep with the Sunday inside: 7 calendar days approved as 7 (the sheet deducts 7); weekly off / holiday info is ignored
  assert.deepEqual(summary(map([R({ from: '2026-09-07', to: '2026-09-13', days: 7 })], P, opts)), ['S1:EL:7']);
  // a leave on a single Sunday / paid holiday is chargeable as approved (the sheet charges 1)
  assert.deepEqual(summary(map([R({ from: '2026-09-06', to: '2026-09-06', days: 1 })], P, opts)), ['S1:EL:1']);
  assert.deepEqual(summary(map([R({ from: '2026-09-01', to: '2026-09-01' })], P, opts)), ['S1:EL:1']);
  // computed from the dates (no approved days) also counts every calendar date
  assert.deepEqual(summary(map([R({ from: '2026-09-05', to: '2026-09-07' })], P, opts)), ['S1:EL:3']);
  // approved 5 over a 7-date range: 5/7 per date, no rescale to "working" dates, no per-date share above 1
  assert.deepEqual(summary(map([R({ from: '2026-09-07', to: '2026-09-13', days: 5 })])), ['S1:EL:5']);
  // multi-month: Fri 28 Aug .. Thu 3 Sep (7 dates) approved 7: 4 dates in Aug, 3 in Sep (calendar windows)
  const row = R({ from: '2026-08-28', to: '2026-09-03', days: 7 });
  assert.deepEqual(summary(map([row], '2026-09')), ['S1:EL:3']);
  assert.deepEqual(summary(map([row], '2026-08')), ['S1:EL:4']);
  // approved 3.5 over 7 dates: half a day per date
  assert.deepEqual(summary(map([R({ from: '2026-08-28', to: '2026-09-03', days: 3.5 })], '2026-09')), ['S1:EL:1.5']);
  // a leave that lies wholly in another month is ignored (no row, no exception)
  const other = map([row], '2026-10');
  assert.deepEqual([other.valid.length, other.exceptions.length], [0, 0]);
  // approved more than the range is a genuine data error
  assert.equal(map([R({ from: '2026-09-01', to: '2026-09-01', days: 2 })]).exceptions[0].EXCEPTION_REASON.split(' | ')[0], 'APPROVED_DAYS_EXCEED_RANGE');
  // no NOTE / rescale exceptions any more
  const adj = map([R({ from: '2026-09-01', to: '2026-09-04', days: 3 })]);
  assert.deepEqual(summary(adj), ['S1:EL:3']);
  assert.equal(adj.valid[0].EXCEPTION_REASON, '');
});

test('leave month = CALENDAR month; LEAVE_WINDOW_START_<period> moves the start of one period (September catch-up from 26-Aug)', () => {
  const w = (period, ctl) => plain(pure.leave_window(period, ctl));
  assert.deepEqual(w('2026-10', {}), { start: '2026-10-01', end: '2026-10-31', overridden: false });
  assert.deepEqual(w('2026-09', { 'LEAVE_WINDOW_START_2026-09': '2026-08-26' }), { start: '2026-08-26', end: '2026-09-30', overridden: true });
  assert.equal(w('2026-09', { 'LEAVE_WINDOW_START_2026-09': new Date(2026, 7, 26) }).start, '2026-08-26');
  assert.equal(w('2026-10', { 'LEAVE_WINDOW_START_2026-09': '2026-08-26' }).start, '2026-10-01', 'override is per period');
  assert.throws(() => pure.leave_window('2026-09', { 'LEAVE_WINDOW_START_2026-09': 'soon' }), /must be a date/);
  assert.throws(() => pure.leave_window('2026-09', { 'LEAVE_WINDOW_START_2026-09': '2026-10-02' }), /after the end/);
  // leaves of 24-Aug..28-Aug (4 days approved 5, i.e. 1/date) and 27-Aug..02-Sep
  const rows = [R({ from: '2026-08-24', to: '2026-08-28', days: 5 }), R({ emp: 'S2', from: '2026-08-20', to: '2026-08-22', days: 3 })];
  const win = { start: '2026-08-26', end: '2026-09-30' };
  assert.deepEqual(summary(map(rows, '2026-09')), [], 'calendar September alone: nothing (all dates in August)');
  assert.deepEqual(summary(map(rows, '2026-09', { window: win })), ['S1:EL:3'], '26,27,28-Aug fall in the catch-up window; S2 ends before it');
  // the sheet's Month column is never parsed: rows carrying junk text in it are unaffected (header not even selected)
});

test('exceptions (never counted): unknown employee / type, dates, invalid approved days, unrecognised decision, a day claimed by two different leaves', () => {
  const rows = [
    R({ emp: 'ZZ9' }),                                                        // unknown employee
    R({ lt: 'Paternity', from: '2026-09-02', to: '2026-09-02' }),             // unknown type
    R({ from: '2026-09-10', to: '2026-09-05' }),                              // end before start
    R({ from: '2019-09-10', to: '2019-09-12' }),                              // not relevant to the period: silently skipped
    R({ from: '2026-09-14', to: '2026-09-14', days: 'abc' }),                 // invalid approved days
    R({ from: '2026-09-15', to: '2026-09-15', days: 3 }),                     // approved days exceed the range
    R({ from: '2026-09-16', to: '2026-12-31' }),                              // runaway span
    R({ type: APPLY, from: '2026-09-17', to: '2026-09-17' }),                 // Approved decision on an Apply row: counts (1 day)
    R({ from: '2026-09-21', to: '2026-09-22', kase: '87', ts: '2026-09-03 09:00:00' }),   // fine
    R({ lt: 'Casual Leave (CL)', from: '2026-09-22', to: '2026-09-23', ts: '2026-09-04 09:00:00' }), // overlaps the EL on the 22nd
    R({ from: '2026-09-21', to: '2026-09-22', kase: '88', ts: '2026-09-05 09:00:00' }),              // same key, different case: collapses with the row above (latest wins), no duplicate error
    R({ from: '2026-09-25', to: '2026-09-25', dec: 'Maybe' }),                // unrecognised decision
    R({ from: 'not a date', to: '2026-09-28' }),                              // start unparseable
  ];
  const m = map(rows);
  const reasons = m.exceptions.map((e) => e.EXCEPTION_REASON.split(' | ')[0]).sort();
  assert.deepEqual(reasons, ['APPROVED_DAYS_EXCEED_RANGE', 'APPROVED_DAYS_INVALID',
    'END_BEFORE_START', 'LEAVE_SPAN_TOO_LONG', 'OVERLAPS_OTHER_LEAVE', 'START_DATE_UNPARSEABLE', 'UNKNOWN_LEAVE_TYPE', 'UNKNOWN_OR_INACTIVE_EMP_ID',
    'UNRECOGNISED_DECISION'].sort());
  assert.deepEqual(summary(m), ['S1:EL:1', 'S1:EL:2'], 'the Approved Apply row (1) and the 21-22 Sep EL (2); the CL of 22-23 Sep overlaps the EL on the 22nd');
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
/** Tab modelled on the real balance tabs: EMP CODE in row 1, "EL/CL/SL Available" labels in row 3 far to the right, sub headers row 4, data from row 5. */
function balanceTab(extra = {}) {
  const width = 12, blankRow = () => new Array(width).fill('');
  const r1 = blankRow(), r2 = blankRow(), r3 = blankRow(), r4 = blankRow();
  r1[0] = 'EMP CODE'; r1[1] = 'EMP NAME'; r1[2] = 'DOJ'; r1[6] = 'Total Leaves Allocated 2026'; r1[9] = 'Remark';
  r3[3] = 'Leave Available'; r2[3] = 'Leave Utilized';                  // block label, not a balance column
  r3[8] = extra.elLabel === undefined ? 'EL Available' : extra.elLabel;
  r3[9] = 'CL Available'; r3[10] = extra.slLabel === undefined ? 'SL Available' : extra.slLabel; r3[11] = 'Total Available';
  r4[8] = 'EL'; r4[9] = 'CL'; r4[10] = 'SL'; r4[11] = 'TOTAL';
  const emp = (id, el, cl, sl) => { const r = blankRow(); r[0] = id; r[1] = 'name'; r[8] = el; r[9] = cl; r[10] = sl; r[11] = 0; return r; };
  return [r1, r2, r3, r4, emp('S1', 12, 4.5, 6), emp('S2', 3, 1, 0), emp('S2', 1, 1, 1), emp('S5', -1.5, 'x', 2), blankRow()];
}

test('leave balance columns: EMP CODE and each EL / CL / SL Available header are found independently across header rows 1-6', () => {
  const t = balanceTab();
  const ok = plain(pure.leave_balanceColumns_(t.slice(0, 6)));
  assert.deepEqual([ok.ok, ok.emp, ok.EL, ok.CL, ok.SL, ok.headerRow], [true, 0, 8, 9, 10, 3]);
  // a single header row (all labels together) still works
  const one = plain(pure.leave_balanceColumns_([['Employee ID', 'Name', 'EL Available', 'CL Available', 'SL Available', 'Total Available']]));
  assert.deepEqual([one.ok, one.emp, one.EL, one.CL, one.SL], [true, 0, 2, 3, 4]);
  assert.equal(pure.leave_balanceColumns_([['EMP ID', 'EL Available', 'CL Available', 'SL Available']]).ok, true);
  // each label in its own row
  const split = plain(pure.leave_balanceColumns_([['', '', 'SL Available'], ['EMP CODE', 'EL Available'], ['', '', '', 'CL Available']]));
  assert.deepEqual([split.emp, split.EL, split.CL, split.SL, split.headerRow], [0, 1, 3, 2, 3]);
  // duplicates / absent labels -> that column only is -1, with a note
  const dup = plain(pure.leave_balanceColumns_([['Employee ID', 'EL Available', 'EL Available', 'CL Available', 'SL Available']]));
  assert.deepEqual([dup.EL, dup.CL, dup.SL], [-1, 3, 4]);
  assert.match(dup.notes.join(';'), /EL Available matches 2/);
  const none = plain(pure.leave_balanceColumns_([['Employee ID', 'EL', 'CL', 'SL', 'Total Available']]));
  assert.equal(none.ok, false);
  // no employee column: nothing usable
  assert.equal(pure.leave_balanceColumns_([['Name', 'EL Available', 'CL Available', 'SL Available']]).ok, false);
  // a password header is never eligible
  const pw = plain(pure.leave_balanceColumns_([['Employee ID', 'Password', 'EL Available', 'CL Available']]));
  assert.deepEqual([pw.ok, pw.SL], [true, -1]);
  assert.equal(pure.leave_balanceColumns_([['Password', 'EL Available']]).ok, false);
});

test('balances from rows: an employee in several rows gets no balance; non-numeric cells and not-found columns are left out; codes only', () => {
  const cols = { emp: 0, EL: 1, CL: 2, SL: 3 };
  const b = plain(pure.leave_balancesFromRows(cols, [['S1', 10, 5, 3], ['S2', 8, 'x', 2], ['S3', 1, 1, 1], ['s3', 2, 2, 2], ['', 9, 9, 9]]));
  assert.deepEqual(b.byEmp, { S1: { EL: 10, CL: 5, SL: 3 }, S2: { EL: 8, SL: 2 } });
  assert.deepEqual(b.ambiguous, ['S3']);
  const partial = plain(pure.leave_balancesFromRows({ emp: 0, EL: 1, CL: -1, SL: 3 }, [['S1', 10, 5, 3]]));
  assert.deepEqual(partial.byEmp, { S1: { EL: 10, SL: 3 } });
  assert.deepEqual(['VFL1234', 'CON01', 'S1', 'T-S1'].map((x) => pure.leave_isEmpCode_(x)), [true, true, true, true]);
  assert.deepEqual(['EMP CODE', '', 'EL', 'TOTAL', 12].map((x) => pure.leave_isEmpCode_(x)), [false, false, false, false, false]);
});

test('leave_readBalances_ on the real layout: EMP CODE row 1, Available labels row 3, data from row 5; blank + note when a column is missing', () => {
  const { makeSheet } = require('./fakes');
  const env = world({ leaveSource: false, control: [{ KEY: 'LEAVE_SOURCE_SPREADSHEET_ID', VALUE: 'LEAVE_SS' }] });
  const staff = makeSheet('Leave Databse Staff'); staff.data = balanceTab();
  const pw = makeSheet('Leave Dadabase PW'); pw.data = balanceTab({ slLabel: 'Total SL' });  // SL Available header missing
  env.external.LEAVE_SS = { 'Leave Databse Staff': staff, 'Leave Dadabase PW': pw };
  const r = plain(env.c.leave_readBalances_('STAFF', ['S1', 'S2', 'S5', 'S9']));
  assert.deepEqual(r.byEmp, { S1: { EL: 12, CL: 4.5, SL: 6 }, S5: { EL: -1.5, SL: 2 } }, 'negative kept; non-numeric cell left out; S2 is in two rows');
  assert.equal(r.matched, 2);
  assert.match(r.note, /1 employee\(s\) appear in several rows/);
  const w = plain(env.c.leave_readBalances_('PERMANENT_WORKER', ['S1']));
  assert.deepEqual(w.byEmp, { S1: { EL: 12, CL: 4.5 } }, 'SL token stays blank');
  assert.match(w.note, /SL available column not found in Leave Dadabase PW/);
  // no EMP CODE column at all -> everything blank
  const bad = makeSheet('Leave Dadabase PW'); bad.data = [['Employee', 'Blocks'], ['W1', 'x']];
  env.external.LEAVE_SS = { 'Leave Databse Staff': staff, 'Leave Dadabase PW': bad };
  const none = plain(env.c.leave_readBalances_('PERMANENT_WORKER', ['W1']));
  assert.deepEqual(none.byEmp, {});
  assert.match(none.note, /could not identify .*Leave Dadabase PW.*blank/);
  assert.match(plain(env.c.leave_readBalances_('PUNE_STAFF', ['P1'])).note, /no leave-balance tab/);
  env.external.LEAVE_SS = {};
  assert.match(plain(env.c.leave_readBalances_('STAFF', ['S1'])).note, /no tab "Leave Databse Staff"/);
});

test('leave_readBalances_ finds the first data row by employee-code pattern (data may start below extra header rows)', () => {
  const { makeSheet } = require('./fakes');
  const env = world({ leaveSource: false, control: [{ KEY: 'LEAVE_SOURCE_SPREADSHEET_ID', VALUE: 'LEAVE_SS' }] });
  const t = balanceTab(); t.splice(4, 0, new Array(12).fill(''), ['note', 'units', '', '', '', '', '', '', 'x', 'y', 'z', 'w']);  // two junk rows before the data
  const staff = makeSheet('Leave Databse Staff'); staff.data = t;
  env.external.LEAVE_SS = { 'Leave Databse Staff': staff };
  assert.deepEqual(plain(env.c.leave_readBalances_('STAFF', ['S1'])).byEmp, { S1: { EL: 12, CL: 4.5, SL: 6 } });
});

test('payslip tokens EL_AVAILABLE / CL_AVAILABLE / SL_AVAILABLE print the balance with 1 decimal, blank otherwise', () => {
  const c = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '20_Feeds.gs', '30_Calc.gs', '32_Engine.gs', '50_Payslips.gs']);
  const row = { PERIOD: P, EMP_ID: 'S1', BASIC: 1, HRA: 1, CONVEYANCE: 1, EDUCATION: 1, WASHING: 1, MEDICAL: 1, PRO_DEV: 1, COMMUNICATION: 1, UNIFORM: 1, TDS: 0, NET_PAY: 10 };
  const sal = { BASIC_PM_INR: 1, HRA_PM_INR: 1, CONVEYANCE_PM_INR: 1, EDUCATION_PM_INR: 1, WASHING_PM_INR: 1, MEDICAL_PM_INR: 1, PRO_DEV_PM_INR: 1, COMMUNICATION_PM_INR: 1, UNIFORM_PM_INR: 1 };
  const withBal = plain(c.buildReplacements('STAFF', row, {}, sal, null, { EL: 12, CL: 4.5, SL: 0 }));
  assert.deepEqual([withBal.EL_AVAILABLE, withBal.CL_AVAILABLE, withBal.SL_AVAILABLE], ['12.0', '4.5', '0.0']);
  assert.equal(plain(c.buildReplacements('STAFF', row, {}, sal, null, { EL: -12, CL: 0, SL: 0 })).EL_AVAILABLE, '-12.0', 'negative printed as is');
  const none = plain(c.buildReplacements('STAFF', row, {}, sal, null, null));
  assert.deepEqual([none.EL_AVAILABLE, none.CL_AVAILABLE, none.SL_AVAILABLE], ['', '', '']);
  const partial = plain(c.buildReplacements('STAFF', row, {}, sal, null, { EL: 5 }));
  assert.deepEqual([partial.EL_AVAILABLE, partial.CL_AVAILABLE], ['5.0', '']);
  assert.ok(HR);
});

test('syncLeaveFromSource: calendar month by default; LEAVE_WINDOW_START_<period> pulls 26-31 Aug into September once; October is calendar again', () => {
  const rowsSrc = src([
    { 'Employee ID': 'S1', 'Leave Type': 'Earned Leave (EL)', 'Leave Start Date': '2026-08-27', 'Leave End Date': '2026-08-28', 'Approved Number of days': 2, Month: 'junk ]' },
    { 'Employee ID': 'S2', 'Leave Type': 'Casual Leave (CL)', 'Leave Start Date': '2026-08-20', 'Leave End Date': '2026-08-21', 'Approved Number of days': 2 },
    { 'Employee ID': 'S1', 'Leave Type': 'Casual Leave (CL)', 'Leave Start Date': '2026-09-29', 'Leave End Date': '2026-10-02', 'Approved Number of days': 4 }]);
  const calendar = world({ leaveSourceRows: rowsSrc });
  const a = plain(calendar.c.syncLeaveFromSource(P));
  assert.equal(a.window, '2026-09-01..2026-09-30');
  assert.deepEqual(calendar.rowsOf('INPUT_LEAVE').map((x) => [x.EMP_ID, x.LEAVE_TYPE, x.DAYS]), [['S1', 'CL', 2]], '29,30 Sep only');
  const catchup = world({ leaveSourceRows: rowsSrc, control: [{ KEY: 'LEAVE_WINDOW_START_2026-09', VALUE: '2026-08-26' }] });
  const b = plain(catchup.c.syncLeaveFromSource(P));
  assert.equal(b.window, '2026-08-26..2026-09-30');
  assert.deepEqual(catchup.rowsOf('INPUT_LEAVE').map((x) => [x.EMP_ID, x.LEAVE_TYPE, x.DAYS]).sort(), [['S1', 'CL', 2], ['S1', 'EL', 2]]);
  const oct = plain(catchup.c.leave_window('2026-10', { 'LEAVE_WINDOW_START_2026-09': '2026-08-26' }));
  assert.equal(oct.start, '2026-10-01');
});

test('setup seeds LEAVE_WINDOW_START_2026-09 = 2026-08-26 in PAYROLL_CONTROL defaults', () => {
  const loaded = loadGs(['00_Config.gs', '01_SheetUtil.gs', '02_Setup.gs']);
  const def = plain(loaded.HROS_CONTROL_DEFAULTS).find((r) => r[0] === 'LEAVE_WINDOW_START_2026-09');
  assert.deepEqual(def.slice(0, 2), ['LEAVE_WINDOW_START_2026-09', '2026-08-26']);
});
