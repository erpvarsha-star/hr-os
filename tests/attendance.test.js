'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');

const ctx = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '02_Setup.gs', '10_Attendance.gs', '11_AttendanceForms.gs']);

const P = '2026-10'; // 31 days, Oct 4/11/18/25 are Sundays
const dates = ctx.enumerateDates(P);
const roster = [
  { EMP_ID: 'E1', PAYROLL_CATEGORY: 'STAFF', SITE: 'NASHIK', DOJ: '' },
  { EMP_ID: 'W1', PAYROLL_CATEGORY: 'PERMANENT_WORKER', SITE: 'NASHIK', DOJ: '' },
];
const daily = (emp, code, date, extra = {}) => ({ PERIOD: P, DATE: date, SITE: 'NASHIK', EMP_ID: emp, CODE: code,
  SOURCE: 'FORM_NASHIK', SOURCE_REF: 'r', KEY: `${emp}|${date}`, STATUS: 'VALID', ENTERED_AT: '2026-10-01T10:00:00', ...extraFix(extra) });
function extraFix(x) { return x; }
const fullMonth = (emp, codeFor) => dates.map((d) => daily(emp, codeFor(d), d));

test('blank defaults to P, WO on weekly off, PH on paid holiday', () => {
  const holidays = [{ DATE: '2026-10-02', SITE: 'ALL', HOLIDAY_NAME: 'Gandhi Jayanti', PAID: 'Y' }];
  const mk = (date) => plain(ctx.normalizeAttendanceResponse(
    { date, marks: {}, ack: true, timestamp: 't', sourceRef: 'R1' }, roster, holidays, 'NASHIK', 'SUN'));
  assert.deepEqual(mk('2026-10-01').map((r) => r.CODE), ['P', 'P']);
  assert.deepEqual(mk('2026-10-04').map((r) => r.CODE), ['WO', 'WO']); // Sunday
  assert.deepEqual(mk('2026-10-02').map((r) => r.CODE), ['PH', 'PH']);
  const r = mk('2026-10-01')[0];
  assert.equal(r.KEY, 'E1|2026-10-01');
  assert.equal(r.SOURCE, 'FORM_NASHIK');
  assert.equal(r.STATUS, 'VALID');
});

test('explicit marks win; invalid code / unknown emp rejected; ack required; unpaid holiday not guessed', () => {
  const res = plain(ctx.normalizeAttendanceResponse(
    { date: '2026-10-01', marks: { E1: 'a', W1: 'XX', ZZ: 'P' }, ack: true }, roster, [], 'NASHIK', 'SUN'));
  const by = Object.fromEntries(res.map((r) => [r.EMP_ID, r]));
  assert.equal(by.E1.CODE, 'A');
  assert.equal(by.W1.STATUS, 'REJECTED');
  assert.equal(by.ZZ.REJECT_REASON, 'UNKNOWN_EMP_ID');
  const noAck = plain(ctx.normalizeAttendanceResponse({ date: '2026-10-01', marks: {}, ack: false }, roster, [], 'NASHIK', 'SUN'));
  assert.equal(noAck.length, 1);
  assert.equal(noAck[0].STATUS, 'REJECTED');
  const unpaid = plain(ctx.normalizeAttendanceResponse({ date: '2026-10-01', marks: {}, ack: true },
    roster, [{ DATE: '2026-10-01', SITE: 'NASHIK', PAID: 'N' }], 'NASHIK', 'SUN'));
  assert.equal(unpaid.length, 0);
});

test('HD / OD / COFF / LWP aggregation', () => {
  const codes = { '2026-10-01': 'HD', '2026-10-02': 'OD', '2026-10-03': 'COFF', '2026-10-05': 'LWP', '2026-10-06': 'A',
    '2026-10-07': 'EL', '2026-10-08': 'CL', '2026-10-09': 'SL', '2026-10-10': 'HD' };
  const rows = fullMonth('E1', (d) => codes[d] || (ctx.weekdayOf(d) === 'SUN' ? 'WO' : 'P'));
  const [rec] = plain(ctx.aggregateDaily(rows, P, [roster[0]], [], 'SUN'));
  // Sundays: 4,11,18,25 = 4 WO. Non-listed weekdays = 31 - 9 listed - 4 WO = 18 P
  assert.equal(rec.counts.P, 18);
  assert.equal(rec.PRESENT_DAYS, 18 + 1 /*OD*/ + 1 /*2 HD * .5*/);
  assert.equal(rec.PHYSICAL_PRESENT_DAYS, 18 + 1);
  assert.equal(rec.WEEK_OFF, 4);
  assert.equal(rec.PAID_LEAVE_OTHER, 1); // COFF
  assert.equal(rec.ABSENT_LWP_DAYS, 1 /*LWP*/ + 1 /*A*/ + 1 /*HD halves*/);
  assert.equal([rec.EL_AVAILED, rec.CL_AVAILED, rec.SL_AVAILED].join(), '1,1,1');
  assert.deepEqual(rec.missingDates, []);
});

test('worked days: worker excludes WO, staff includes it', () => {
  const rec = { PRESENT_DAYS: 20, WEEK_OFF: 4, PH: 1, EL_AVAILED: 1, CL_AVAILED: 1, SL_AVAILED: 0, PAID_LEAVE_OTHER: 1 };
  assert.equal(ctx.computeWorkedDays(rec, 'STAFF'), 28);
  assert.equal(ctx.computeWorkedDays(rec, 'CONSULTANT'), 28);
  assert.equal(ctx.computeWorkedDays(rec, 'PUNE_STAFF'), 28);
  assert.equal(ctx.computeWorkedDays(rec, 'PERMANENT_WORKER'), 24);
  assert.throws(() => ctx.computeWorkedDays(rec, 'NOPE'));
});

test('missing dates are detected, not assumed present; DOJ excludes earlier dates', () => {
  const rows = fullMonth('E1', () => 'P').filter((r) => r.DATE !== '2026-10-10' && r.DATE !== '2026-10-11');
  const [rec] = plain(ctx.aggregateDaily(rows, P, [roster[0]], [], 'SUN'));
  assert.deepEqual(rec.missingDates, ['2026-10-10', '2026-10-11']);
  assert.equal(rec.PRESENT_DAYS, 29);
  const [none] = plain(ctx.aggregateDaily([], P, [roster[0]], [], 'SUN'));
  assert.equal(none.missingDates.length, 31);
  const joiner = { ...roster[0], DOJ: '2026-10-20' };
  const [j] = plain(ctx.aggregateDaily([], P, [joiner], [], 'SUN'));
  assert.equal(j.missingDates.length, 12); // 20..31
  // rejected/superseded rows do not count
  const bad = [daily('E1', 'P', '2026-10-01', { STATUS: 'REJECTED' }), daily('E1', 'P', '2026-10-02', { STATUS: 'SUPERSEDED' })];
  const [b] = plain(ctx.aggregateDaily(bad, P, [roster[0]], [], 'SUN'));
  assert.equal(b.recordedDays, 0);
});

test('re-submission supersedes earlier submission (latest VALID wins)', () => {
  const first = daily('E1', 'A', '2026-10-05', { ENTERED_AT: '2026-10-05T09:00:00', _row: 2 });
  const second = daily('E1', 'P', '2026-10-05', { ENTERED_AT: '2026-10-05T18:00:00', SOURCE_REF: 'r2' });
  // aggregation picks the later one even if statuses were not yet updated
  const [rec] = plain(ctx.aggregateDaily([second, first], P, [roster[0]], [], 'SUN'));
  assert.equal(rec.counts.A, 0);
  assert.equal(rec.counts.P, 1);
  // the writer marks the earlier VALID row SUPERSEDED
  const sup = plain(ctx.findSuperseded([first], [second]));
  assert.equal(sup.length, 1);
  assert.equal(sup[0]._row, 2);
  assert.equal(plain(ctx.findSuperseded([first], [{ ...second, STATUS: 'REJECTED' }])).length, 0);
});

test('override merge: HR value kept, HR_OVERRIDE=Y, reason required', () => {
  const gen = { PRESENT_DAYS: 25, PHYSICAL_PRESENT_DAYS: 25, WEEK_OFF: 4, PH: 1, EL_AVAILED: 0, CL_AVAILED: 0,
    SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 1 };
  const create = plain(ctx.mergeGeneratedWithExisting(null, gen));
  assert.equal(create.action, 'CREATE');
  assert.equal(create.HR_OVERRIDE, 'N');
  // prepared blank row -> regenerated
  const blank = { APPROVAL_STATUS: 'PENDING', PRESENT_DAYS: '', SOURCE_REF: 'HR_MONTHLY_ENTRY' };
  assert.equal(ctx.mergeGeneratedWithExisting(blank, gen).action, 'REGENERATE');
  // untouched previous generation -> regenerated with new numbers
  const prev = { ...gen, PRESENT_DAYS: 24 };
  const untouched = { ...prev, APPROVAL_STATUS: 'PENDING', GENERATED_VALUES_JSON: JSON.stringify(prev) };
  assert.equal(ctx.mergeGeneratedWithExisting(untouched, gen).action, 'REGENERATE');
  // HR typed something different -> kept
  const hr = { ...gen, PRESENT_DAYS: 27, APPROVAL_STATUS: 'PENDING', GENERATED_VALUES_JSON: JSON.stringify(gen), OVERRIDE_REASON: '' };
  const m = plain(ctx.mergeGeneratedWithExisting(hr, { ...gen, PRESENT_DAYS: 26 }));
  assert.equal(m.action, 'OVERRIDE');
  assert.equal(m.values.PRESENT_DAYS, 27);
  assert.equal(m.HR_OVERRIDE, 'Y');
  assert.equal(m.needsReason, true);
  const withReason = plain(ctx.mergeGeneratedWithExisting({ ...hr, OVERRIDE_REASON: 'biometric fault' }, { ...gen, PRESENT_DAYS: 26 }));
  assert.equal(withReason.needsReason, false);
  assert.equal(withReason.OVERRIDE_REASON, 'biometric fault');
  // HR value equal to generated is not an override
  assert.equal(ctx.mergeGeneratedWithExisting({ ...hr, PRESENT_DAYS: 26 }, { ...gen, PRESENT_DAYS: 26 }).action, 'UNCHANGED');
  // APPROVED never touched
  const ap = plain(ctx.mergeGeneratedWithExisting({ ...hr, APPROVAL_STATUS: 'APPROVED' }, gen));
  assert.equal(ap.action, 'KEEP_APPROVED');
  assert.equal(ap.values, null);
});

test('approval validation requires reason on override and no missing dates', () => {
  const ok = { PRESENT_DAYS: 20, HR_OVERRIDE: 'N' };
  assert.deepEqual(plain(ctx.validateAttendanceRowForApproval(ok)), []);
  assert.equal(ctx.validateAttendanceRowForApproval({ ...ok, HR_OVERRIDE: 'Y' }).length, 1);
  assert.equal(ctx.validateAttendanceRowForApproval({ ...ok, PRESENT_DAYS: -1 }).length, 1);
  assert.equal(ctx.validateAttendanceRowForApproval({ ...ok, REMARKS: 'MISSING_DATES: 2026-10-01' }).length, 1);
});

test('period < 2026-09 rejected everywhere', () => {
  assert.throws(() => ctx.assertPeriodAllowed('2026-08'), /MIN_PERIOD/);
  assert.throws(() => ctx.assertPeriodAllowed('2026-01'), /MIN_PERIOD/);
  assert.equal(ctx.assertPeriodAllowed('2026-09'), true);
  assert.equal(ctx.assertPeriodAllowed('2027-03'), true);
  assert.throws(() => ctx.assertPeriodAllowed('2026-13'), /Invalid PERIOD/);
  assert.throws(() => ctx.assertPeriodAllowed('2026-10', '2026-11'), /MIN_PERIOD/); // configured min can raise
  // entry points refuse before touching any sheet (no SpreadsheetApp in the sandbox)
  assert.throws(() => ctx.prepareMonthlyAttendance('2026-08'), /MIN_PERIOD/);
  assert.throws(() => ctx.generateMonthlyAttendance('2026-08'), /MIN_PERIOD/);
  assert.throws(() => ctx.approveAttendance('2026-08', 'STAFF'), /MIN_PERIOD/);
  assert.throws(() => ctx.prepareMonth('2026-08'), /MIN_PERIOD/);
});

test('period helpers', () => {
  assert.equal(ctx.daysInMonth('2027-02'), 28);
  assert.equal(ctx.periodStart('2026-10'), '2026-10-01');
  assert.equal(ctx.periodEnd('2026-09'), '2026-09-30');
  assert.equal(ctx.monthName('2026-09'), 'September');
  assert.equal(ctx.weekdayOf('2026-10-04'), 'SUN');
});

test('form row label round trip and answer parsing', () => {
  const label = ctx.formRowLabel('VFL1064', 'A B');
  assert.equal(label, 'VFL1064 – A B');
  assert.deepEqual(plain(ctx.parseRowLabel(label)), { empId: 'VFL1064', name: 'A B' });
  assert.equal(ctx.parseRowLabel('no separator'), null);
  const parsed = plain(ctx.parseFormAnswers([
    { type: 'DATE', title: 'Date', response: '2026-10-05' },
    { type: 'GRID', title: 'Attendance – Forge', rows: [label, 'E2 – X'], response: ['a', ''] },
    { type: 'CHECKBOX', title: 'ack', response: ['Confirmed'] },
  ], 'resp1', 'ts'));
  assert.deepEqual(parsed, { date: '2026-10-05', marks: { VFL1064: 'A' }, ack: true, timestamp: 'ts', sourceRef: 'resp1' });
});

test('trigger plan is idempotent, never exceeds 5, ignores foreign triggers', () => {
  const existing = [{ handler: 'other', sourceId: '' }, { handler: 'onAttendanceFormSubmit', sourceId: 'F1' }];
  assert.deepEqual(plain(ctx.planTriggerInstall(existing, ['F1', 'F2'], 5)), ['F2']);
  assert.deepEqual(plain(ctx.planTriggerInstall(existing, ['F1'], 5)), []);
  const full = [1, 2, 3, 4, 5].map((i) => ({ handler: 'x' + i, sourceId: '' }));
  assert.throws(() => ctx.planTriggerInstall(full, ['F1'], 5), /Trigger limit/);
});

test('DOJ parsing is conservative on ambiguity', () => {
  assert.equal(ctx.parseDoj('2026-10-05'), '2026-10-05');
  assert.equal(ctx.parseDoj('25/10/2026'), '2026-10-25');
  assert.equal(ctx.parseDoj('05/06/2005'), '2005-05-06'); // earlier of 5 Jun / 6 May
  assert.equal(ctx.parseDoj('junk'), '');
});

test('audit row maps by header, JSON fallback for unknown headers', () => {
  const e = { timestamp: 't', action: 'SETUP', period: '', population: '', detail: 'd', message: 'SETUP | d', user: 'u' };
  assert.deepEqual(plain(ctx.buildAuditRow(['Timestamp', 'Module', 'Status', 'User', 'Message'], e)),
    ['t', 'HROS', 'SETUP', 'u', 'SETUP | d']);
  const odd = plain(ctx.buildAuditRow(['Foo', 'Bar'], e));
  assert.equal(odd[0], '');
  assert.equal(JSON.parse(odd[1]).action, 'SETUP');
});
