'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

const P = '2026-09';
const DAYS_HDR = ['Timestamp', 'Email Address', 'Payroll Month', 'Employee', 'Present Days', 'Week Off', 'PH', 'EL Availed', 'CL Availed',
  'SL Availed', 'Other Paid Leave', 'Worked / Payable Days', 'Submission Type', 'Remarks'];
const day = (o) => [o.ts || '2026-09-28 10:00:00', 'secret@example.test', o.month || '2026-09', o.emp, o.present === undefined ? 20 : o.present,
  o.wo === undefined ? 4 : o.wo, o.ph === undefined ? 0 : o.ph, o.el || 0, o.cl || 0, o.sl || 0, o.opl || 0, o.worked === undefined ? '' : o.worked,
  o.type || 'New', o.remarks || ''];
const ATT_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'WORKED_DAYS', 'PAYABLE_DAYS', 'APPROVAL_STATUS', 'APPROVED_BY', 'SOURCE_REF', 'ENTERED_AT', 'REMARKS',
  'PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS', 'GENERATED_VALUES_JSON', 'HR_OVERRIDE', 'OVERRIDE_REASON', 'ROW_KEY'];
const PC_HDR = ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE', 'DRAFT_RUN_ID', 'DRAFT_HASH',
  'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'];

function world(rowsOfDays = [], extra = {}) {
  const env = makeEnv();
  env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], []);
  env.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  env.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DEPARTMENT', 'DESIGNATION', 'DOJ_AS_SOURCE'], [
    { EMP_ID: 'VFL1001', EMPLOYEE_NAME: 'Staff A', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'VFL4001', EMPLOYEE_NAME: 'Worker A', PAYROLL_CATEGORY: 'PERMANENT_WORKER', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'CON01', EMPLOYEE_NAME: 'Cons A', PAYROLL_CATEGORY: 'CONSULTANT', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '15/09/2026' },
    { EMP_ID: 'VFL9000', EMPLOYEE_NAME: 'Left', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Non-Active', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'VFL7001', EMPLOYEE_NAME: 'Future Joiner', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '25/10/2026' },
    { EMP_ID: 'VFL7002', EMPLOYEE_NAME: 'Odd Date', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '03/10/2026' },
    { EMP_ID: 'VFL7003', EMPLOYEE_NAME: 'Junk Date', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: 'sometime' },
  ]);
  env.put('PAYROLL_PERIOD_CATEGORY', PC_HDR, ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((c) => ({ PAYROLL_MONTH: P, PAYROLL_CATEGORY: c, WORKING_DAYS: 26, STATUS: 'PENDING' })));
  env.put('INPUT_ATTENDANCE', ATT_HDR, extra.attendance || []);
  const dt = env.put('PAYROLL_DAYS_FORM_RESPONSES', DAYS_HDR, []);
  rowsOfDays.forEach((r) => dt.data.push(r));
  return env;
}
const attOf = (env, id) => env.rowsOf('INPUT_ATTENDANCE').filter((r) => r.EMP_ID === id);

test('parseEmployeeField: "ID – Name", "ID - Name", em dash, plain ID, hyphenated plain ID', () => {
  const { c } = makeEnv();
  assert.equal(c.parseEmployeeField('VFL1001 – Some Name'), 'VFL1001');
  assert.equal(c.parseEmployeeField('vfl1001 - Some Name'), 'VFL1001');
  assert.equal(c.parseEmployeeField('CON01 — Name Here'), 'CON01');
  assert.equal(c.parseEmployeeField('BUNG23–Name'), 'BUNG23');
  assert.equal(c.parseEmployeeField('  VFL1001  '), 'VFL1001');
  assert.equal(c.parseEmployeeField('T-S1'), 'T-S1');
  assert.equal(c.parseEmployeeField('T-S1 - Test Staff'), 'T-S1');
  assert.equal(c.parseEmployeeField('VFL1001-Name'), 'VFL1001');
  assert.equal(c.parseEmployeeField(''), '');
  assert.equal(c.parseEmployeeField(null), '');
});

test('mapDaysFormRows: latest submission wins, corrections, unknown ids, bad numbers, worked-days cross-check', () => {
  const { c } = makeEnv();
  const roster = [{ EMP_ID: 'VFL1001', PAYROLL_CATEGORY: 'STAFF' }, { EMP_ID: 'VFL4001', PAYROLL_CATEGORY: 'PERMANENT_WORKER' },
    { EMP_ID: 'CON01', PAYROLL_CATEGORY: 'CONSULTANT' }];
  const rows = [
    day({ ts: '2026-09-27 09:00:00', emp: 'VFL1001 – A', present: 20 }),
    day({ ts: '2026-09-28 09:00:00', emp: 'VFL1001 - A', present: 22, type: 'Correction', remarks: 'fixed' }),
    day({ ts: '2026-09-28 09:00:00', emp: 'VFL4001 – W', present: 24, el: 1, wo: 4, worked: 29 }), // staff-style worked incl. week off: mismatch for a worker
    day({ ts: '2026-09-28 09:00:00', emp: 'CON01', present: 'x' }),
    day({ ts: '2026-09-28 09:00:00', emp: 'GHOST99 – Nobody' }),
    day({ ts: '2026-09-28 09:00:00', emp: 'VFL9000 – Left' }),
    day({ ts: '2026-09-28 09:00:00', emp: 'VFL1001', month: '2026-08', present: 1 }),      // other period ignored
  ];
  const r = plain(c.mapDaysFormRows(DAYS_HDR, rows, P, roster, { firstRow: 2 }));
  const by = Object.fromEntries(r.records.map((x) => [x.EMP_ID, x]));
  assert.equal(by.VFL1001.values.PRESENT_DAYS, 22, 'latest submission wins');
  assert.equal(by.VFL1001.row, 3);
  assert.equal(by.VFL1001.values.WORKED_DAYS, 26, 'staff worked = present + week off');
  assert.equal(by.VFL4001.values.WORKED_DAYS, 25, 'worker worked = present + EL (no week off)');
  assert.equal(by.VFL4001.values.WEEK_OFF, 4);
  assert.match(by.VFL4001.remarks, /DAYS_FORM worked\/payable 29 differs from computed 25/);
  assert.equal(r.mismatches.length, 1);
  assert.equal(r.resubmitted, 1);
  const ex = Object.fromEntries(r.exceptions.map((x) => [x.EMP_ID, x.type]));
  assert.deepEqual(ex, { CON01: 'DAYS_INVALID', GHOST99: 'UNKNOWN_OR_INACTIVE_EMP_ID', VFL9000: 'UNKNOWN_OR_INACTIVE_EMP_ID' });
  // a lone CORRECTION is refused (nothing to correct): resubmit as NEW
  const lone = plain(c.mapDaysFormRows(DAYS_HDR, [day({ emp: 'VFL1001', type: 'Correction' })], P, roster, {}));
  assert.equal(lone.records.length, 0);
  assert.equal(lone.exceptions[0].type, 'CORRECTION_WITHOUT_ORIGINAL');
  // a later NEW after the lone correction fixes it
  const fixed = plain(c.mapDaysFormRows(DAYS_HDR, [day({ ts: '2026-09-28 09:00:00', emp: 'VFL1001', type: 'Correction' }), day({ ts: '2026-09-29 09:00:00', emp: 'VFL1001', type: 'New', present: 18 })], P, roster, {}));
  assert.equal(fixed.records[0].values.PRESENT_DAYS, 18);
  assert.equal(fixed.exceptions.length, 0);
  // missing required header fails closed
  assert.deepEqual(plain(c.mapDaysFormRows(['Timestamp', 'Employee'], [['t', 'x']], P, roster, {}).missingColumns).length > 0, true);
});

test('syncDaysFormToAttendance: creates PENDING rows, updates PENDING, never touches APPROVED, refreshes WORKING_DAYS, idempotent', () => {
  const env = world([
    day({ emp: 'VFL1001 – Staff A', present: 22, wo: 4 }),
    day({ emp: 'VFL4001 – Worker A', present: 24, wo: 4, el: 1 }),
    day({ emp: 'CON01 – Cons A', present: 20, wo: 0 }),
    day({ emp: 'GHOST99 – Nobody' }),
  ], { attendance: [
    { PAYROLL_MONTH: P, EMP_ID: 'VFL4001', PAYROLL_CATEGORY: 'PERMANENT_WORKER', WORKING_DAYS: 25, PRESENT_DAYS: 10, APPROVAL_STATUS: 'PENDING', SOURCE_REF: 'HR_MONTHLY_ENTRY', PHYSICAL_PRESENT_DAYS: 9, REMARKS: 'hr note' },
    { PAYROLL_MONTH: P, EMP_ID: 'CON01', PAYROLL_CATEGORY: 'CONSULTANT', WORKING_DAYS: 26, PRESENT_DAYS: 18, APPROVAL_STATUS: 'APPROVED', APPROVED_BY: 'hr@x', SOURCE_REF: 'HR_MONTHLY_ENTRY' },
  ] });
  const { c } = env;
  const r = plain(c.syncDaysFormToAttendance(P));
  assert.deepEqual([r.created, r.updated, r.keptApproved, r.exceptions, r.employeesWithSubmission], [1, 1, 1, 1, 3]);
  assert.deepEqual(r.approvedRowsDifferFromForm, ['CON01']);
  const s = attOf(env, 'VFL1001')[0];
  assert.equal(s.APPROVAL_STATUS, 'PENDING');
  assert.equal(s.PRESENT_DAYS, 22);
  assert.equal(s.WEEK_OFF, 4);
  assert.equal(s.WORKED_DAYS, 26);
  assert.equal(s.PAYABLE_DAYS, 26);
  assert.equal(s.WORKING_DAYS, 26);
  assert.equal(s.SOURCE_REF, 'PAYROLL_DAYS_FORM_RESPONSES!2');
  assert.equal(s.ROW_KEY, P + '|VFL1001');
  assert.equal(s.HR_OVERRIDE, 'N');
  const w = attOf(env, 'VFL4001')[0];
  assert.equal(attOf(env, 'VFL4001').length, 1, 'existing row updated, not duplicated');
  assert.deepEqual([w.PRESENT_DAYS, w.EL_AVAILED, w.WORKED_DAYS, w.WORKING_DAYS, w.APPROVAL_STATUS], [24, 1, 25, 26, 'PENDING']);
  assert.equal(w.PHYSICAL_PRESENT_DAYS, 9, 'PHYSICAL_PRESENT_DAYS is not on the form and is left as typed');
  assert.equal(w.REMARKS, 'hr note', 'HR remarks kept');
  const a = attOf(env, 'CON01')[0];
  assert.deepEqual([a.PRESENT_DAYS, a.APPROVAL_STATUS, a.APPROVED_BY], [18, 'APPROVED', 'hr@x'], 'APPROVED row untouched');
  const exc = env.rowsOf('PAYROLL_DAYS_EXCEPTIONS');
  assert.deepEqual(exc.map((x) => [x.KEY, x.EXCEPTION_TYPE]), [[P + '|GHOST99', 'UNKNOWN_OR_INACTIVE_EMP_ID']]);
  assert.equal(exc[0].SOURCE_ROW, 'PAYROLL_DAYS_FORM_RESPONSES!5');
  assert.ok(!JSON.stringify(env.sheets.INPUT_ATTENDANCE.data).includes('secret@example.test'));
  env.sheets.PAYROLL_DAYS_FORM_RESPONSES.calls.filter((x) => x.r > 1).forEach((x) => assert.ok(!(x.c <= 2 && x.c + x.nc - 1 >= 2), 'Email Address data column never read'));
  // second run: nothing changes
  const snap = JSON.stringify(env.sheets.INPUT_ATTENDANCE.data);
  const again = plain(c.syncDaysFormToAttendance(P));
  assert.deepEqual([again.created, again.updated, again.unchanged], [0, 0, 2]);
  assert.equal(JSON.stringify(env.sheets.INPUT_ATTENDANCE.data), snap);
  assert.equal(env.rowsOf('PAYROLL_DAYS_EXCEPTIONS').length, 1, 'exceptions replaced, not duplicated');
  // a corrected submission updates the PENDING row; fixing the unknown id clears the exception
  env.sheets.PAYROLL_DAYS_FORM_RESPONSES.data.push(day({ ts: '2026-09-29 12:00:00', emp: 'VFL1001 - Staff A', present: 23, type: 'Correction' }));
  env.sheets.PAYROLL_DAYS_FORM_RESPONSES.data.splice(4, 1);
  const c2 = plain(c.syncDaysFormToAttendance(P));
  assert.equal(c2.updated, 1);
  assert.equal(attOf(env, 'VFL1001')[0].PRESENT_DAYS, 23);
  assert.equal(env.rowsOf('PAYROLL_DAYS_EXCEPTIONS').length, 0);
  assert.match(env.rowsOf('AUDIT_LOG').map((x) => x.Message).join('\n'), /DAYS_FORM_SYNC/);
  assert.throws(() => c.syncDaysFormToAttendance('2026-08'), /earlier than MIN_PERIOD/);
});

test('syncDaysFormToAttendance: locked population skipped; joiner after period end is not on the roster', () => {
  const env = world([day({ emp: 'VFL1001', present: 22 }), day({ emp: 'VFL7001 – Future Joiner', present: 5 }), day({ emp: 'VFL7002 – Odd Date', present: 5 })]);
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { STATUS: 'LOCKED' });
  const r = plain(env.c.syncDaysFormToAttendance(P));
  assert.equal(r.skippedLocked, 2);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').length, 0);
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { STATUS: 'PENDING' });
  const r2 = plain(env.c.syncDaysFormToAttendance(P));
  assert.equal(r2.created, 2, 'VFL1001 and the ambiguous-DOJ employee (included)');
  assert.deepEqual(env.rowsOf('PAYROLL_DAYS_EXCEPTIONS').map((x) => x.KEY), [P + '|VFL7001'], 'future joiner is unknown for the period');
});

test('WORKING_DAYS refresh: prepare / sync copy PAYROLL_PERIOD_CATEGORY.WORKING_DAYS into PENDING rows only', () => {
  const env = world([], { attendance: [
    { PAYROLL_MONTH: P, EMP_ID: 'VFL1001', PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: '', PRESENT_DAYS: 1, APPROVAL_STATUS: 'PENDING' },
    { PAYROLL_MONTH: P, EMP_ID: 'VFL4001', PAYROLL_CATEGORY: 'PERMANENT_WORKER', WORKING_DAYS: 20, PRESENT_DAYS: 1, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'CON01', PAYROLL_CATEGORY: 'CONSULTANT', WORKING_DAYS: 20, PRESENT_DAYS: 1, APPROVAL_STATUS: 'PENDING' },
  ] });
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'CONSULTANT' }, { WORKING_DAYS: '' }); // blank category value is not copied
  const p = plain(env.c.prepareMonthlyAttendance(P));
  assert.equal(p.workingDaysRefreshed, 1);
  assert.equal(attOf(env, 'VFL1001')[0].WORKING_DAYS, 26);
  assert.equal(attOf(env, 'VFL4001')[0].WORKING_DAYS, 20, 'APPROVED row untouched');
  assert.equal(attOf(env, 'CON01')[0].WORKING_DAYS, 20, 'blank PAYROLL_PERIOD_CATEGORY value not copied');
  assert.deepEqual(p.joinersExcluded, ['VFL7001']);
  assert.deepEqual(p.dojWarnings.sort(), ['VFL7002', 'VFL7003']);
  // HR changes working days afterwards: the next sync/prepare/generate refreshes PENDING rows
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { WORKING_DAYS: 27 });
  env.c.syncDaysFormToAttendance(P);
  assert.equal(attOf(env, 'VFL1001')[0].WORKING_DAYS, 27);
});

test('roster DOJ rule: after period end excluded; ambiguous/unparseable included with a warning', () => {
  const { c } = makeEnv();
  const d = (v) => plain(c.dojRosterDecision(v, '2026-09-30'));
  assert.deepEqual(d('01/04/2019'), { include: true, warn: '' });
  assert.deepEqual(d('25/10/2026'), { include: false, warn: '' }, 'only day-first is a real date: joins in October');
  assert.deepEqual(d('30/09/2026'), { include: true, warn: '' }, 'joins on the last day of the period');
  assert.deepEqual(d('03/10/2026'), { include: true, warn: 'AMBIGUOUS' }, '3 Oct or 10 Mar: the answer differs -> include + warn');
  assert.deepEqual(d('05/06/2026'), { include: true, warn: '' }, '5 Jun / 6 May: both before the period end');
  assert.deepEqual(d('12/12/2026'), { include: false, warn: '' }, 'both readings identical');
  assert.deepEqual(d('sometime'), { include: true, warn: 'UNPARSEABLE' });
  assert.deepEqual(d('31/02/2026'), { include: true, warn: 'UNPARSEABLE' });
  assert.deepEqual(d(''), { include: true, warn: '' });
  assert.deepEqual(d(new Date(2026, 9, 1)), { include: false, warn: '' });
  assert.deepEqual(d('2026-09-30'), { include: true, warn: '' });
  const env = world();
  const roster = env.c.buildRoster(P);
  assert.deepEqual(plain(roster.map((e) => e.EMP_ID)).sort(), ['CON01', 'VFL1001', 'VFL4001', 'VFL7002', 'VFL7003']);
  assert.deepEqual(plain(roster.joinersExcluded), ['VFL7001']);
  assert.deepEqual(plain(roster.dojWarnings).sort(), ['VFL7002', 'VFL7003']);
  assert.equal(env.c.buildRoster().length, 6, 'without a period everyone active is listed (daily forms)');
  const eng = plain(env.c.engine_rosterFromMaster(env.rowsOf('EMPLOYEE_MASTER'), P));
  assert.deepEqual(eng.joinersExcluded, ['VFL7001']);
  assert.ok(!eng.allActiveIds.includes('VFL7001'));
  assert.equal(eng.all.find((e) => e.EMP_ID === 'VFL7002').DOJ_WARN, 'AMBIGUOUS');
});
