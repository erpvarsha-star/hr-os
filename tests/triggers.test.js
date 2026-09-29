'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

test('routeFormSubmit: only the five response tabs are routed', () => {
  const { c } = makeEnv();
  assert.equal(c.routeFormSubmit('ATT_FORM_NASHIK_RAW'), 'ATT_NASHIK');
  assert.equal(c.routeFormSubmit('ATT_FORM_PUNE_RAW'), 'ATT_PUNE');
  assert.equal(c.routeFormSubmit('PAYROLL_DAYS_FORM_RESPONSES'), 'DAYS');
  assert.equal(c.routeFormSubmit('CANTEEN_FORM_RESPONSES'), 'CANTEEN');
  assert.equal(c.routeFormSubmit('EFFICIENCY_FORM_RESPONSES'), 'EFFICIENCY');
  assert.equal(c.routeFormSubmit('Overtime_Form'), null);
  assert.equal(c.routeFormSubmit('toString'), null, 'prototype keys are not routes');
  assert.equal(c.routeFormSubmit(undefined), null);
});

test('planFormSubmitTrigger: idempotent, foreign triggers only counted, capped at 5', () => {
  const { c } = makeEnv();
  assert.deepEqual(plain(c.planFormSubmitTrigger([{ handler: 'other' }], 5)), { create: true, present: 0, total: 2 });
  assert.deepEqual(plain(c.planFormSubmitTrigger([{ handler: 'other' }, { handler: 'hrosOnFormSubmit' }], 5)), { create: false, present: 1, total: 2 });
  const four = [1, 2, 3, 4].map((i) => ({ handler: 'x' + i }));
  assert.equal(c.planFormSubmitTrigger(four, 5).create, true, 'exactly 5 is allowed');
  const five = four.concat([{ handler: 'x5' }]);
  assert.throws(() => c.planFormSubmitTrigger(five, 5), /Trigger limit/);
  assert.equal(c.planFormSubmitTrigger(five.concat([{ handler: 'hrosOnFormSubmit' }]), 5).create, false, 'already installed: no limit error');
});

test('installTriggers: one spreadsheet-level onFormSubmit trigger, no form IDs, idempotent, never deletes', () => {
  const env = makeEnv({ triggers: [{ handler: 'PHASE1_V2' }, { handler: 'legacyAttendance' }] });
  env.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  const r = plain(env.c.installTriggers());
  assert.deepEqual([r.created, r.alreadyPresent, r.totalTriggers], [1, 0, 3]);
  assert.equal(env.created.length, 1);
  assert.equal(env.created[0].handler, 'hrosOnFormSubmit');
  assert.equal(env.created[0].event, 'FORM_SUBMIT');
  assert.equal(env.created[0].spreadsheet, env.ss, 'bound to the spreadsheet, not a form');
  const again = plain(env.c.installTriggers());
  assert.deepEqual([again.created, again.alreadyPresent, again.totalTriggers], [0, 1, 3]);
  assert.equal(env.created.length, 1);
  assert.deepEqual(env.triggers.map((t) => t.handler), ['PHASE1_V2', 'legacyAttendance', 'hrosOnFormSubmit'], 'foreign triggers untouched');
  const full = makeEnv({ triggers: [1, 2, 3, 4, 5].map((i) => ({ handler: 'x' + i })) });
  full.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  assert.throws(() => full.c.installTriggers(), /Trigger limit/);
  assert.equal(full.created.length, 0);
});

test('parseAttendanceRawRow: grid headers "Attendance – Dept [ID – Name]", Date cell, ack checkbox, timestamp', () => {
  const { c } = makeEnv();
  const ack = c.ATT_ACK_TEXT;
  const hdr = ['Timestamp', 'Date', 'Attendance – Forge [T-A – Alpha One]', 'Attendance – Forge [T-B – Beta]', 'Attendance – Store [T-C – Gamma]', ack, 'Note'];
  const p = plain(c.parseAttendanceRawRow(hdr, [new Date(2026, 9, 5, 18, 30, 5), new Date(2026, 9, 5), 'a', '', 'hd', 'Confirmed', 'x'], 'ATT_FORM_NASHIK_RAW', 7));
  assert.deepEqual(p, { date: '2026-10-05', marks: { 'T-A': 'A', 'T-C': 'HD' }, ack: true, timestamp: '2026-10-05T18:30:05', sourceRef: 'ATT_FORM_NASHIK_RAW!7' });
  const noAck = plain(c.parseAttendanceRawRow(hdr, ['t', '2026-10-05', '', '', '', '', ''], 'ATT_FORM_PUNE_RAW', 2));
  assert.equal(noAck.ack, false);
  assert.deepEqual(noAck.marks, {});
});

function attendanceWorld() {
  const env = makeEnv();
  env.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT']);
  env.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DEPARTMENT', 'DOJ_AS_SOURCE'], [
    { EMP_ID: 'T-A', EMPLOYEE_NAME: 'Alpha', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Forge', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'T-B', EMPLOYEE_NAME: 'Beta', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Forge', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'T-P', EMPLOYEE_NAME: 'Pune', PAYROLL_CATEGORY: 'PUNE_STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Sales', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'T-W', EMPLOYEE_NAME: 'Worker', PAYROLL_CATEGORY: 'PERMANENT_WORKER', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Forge', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'T-C', EMPLOYEE_NAME: 'Cons', PAYROLL_CATEGORY: 'CONSULTANT', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'QA', DOJ_AS_SOURCE: '01/01/2020' },
  ]);
  env.put('PAYROLL_PERIOD_CATEGORY', ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS'], []);
  env.put('HOLIDAY_CALENDAR', ['DATE', 'SITE', 'HOLIDAY_NAME', 'PAID']);
  env.put('ATTENDANCE_DAILY', ['PERIOD', 'DATE', 'SITE', 'EMP_ID', 'CODE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'REJECT_REASON', 'ENTERED_AT']);
  return env;
}
const ev = (sheet, row, namedValues) => ({ range: { getSheet: () => sheet, getRow: () => row }, namedValues });

test('hrosOnFormSubmit: attendance raw tab -> ATTENDANCE_DAILY (Nashik site; Pune tab uses the Pune site)', () => {
  const env = attendanceWorld();
  const ack = env.c.ATT_ACK_TEXT;
  const raw = env.put('ATT_FORM_NASHIK_RAW', ['Timestamp', 'Date', 'Attendance – Forge [T-A – Alpha]', 'Attendance – Forge [T-B – Beta]', ack]);
  raw.data.push([new Date(2026, 9, 5, 9, 0, 0), new Date(2026, 9, 5), 'A', '', 'Confirmed']);
  const out = plain(env.c.hrosOnFormSubmit(ev(raw, 2)));
  assert.deepEqual([out.valid, out.rejected, out.superseded], [4, 0, 0]);
  const daily = env.rowsOf('ATTENDANCE_DAILY');
  const by = Object.fromEntries(daily.map((r) => [r.EMP_ID, r.CODE]));
  assert.equal(by['T-A'], 'A');
  assert.equal(by['T-B'], 'P', 'blank = present on a Monday');
  assert.equal(by['T-W'], 'P');
  assert.ok(!('T-P' in by), 'Pune employee is not part of the Nashik form');
  assert.ok(daily.every((r) => r.SOURCE === 'FORM_NASHIK' && r.SOURCE_REF === 'ATT_FORM_NASHIK_RAW!2' && r.STATUS === 'VALID'));
  // re-submitting the same date supersedes
  raw.data.push([new Date(2026, 9, 5, 10, 0, 0), new Date(2026, 9, 5), '', 'HD', 'Confirmed']);
  const again = plain(env.c.hrosOnFormSubmit(ev(raw, 3)));
  assert.ok(again.superseded >= 3);
  // Pune tab
  const pune = env.put('ATT_FORM_PUNE_RAW', ['Timestamp', 'Date', 'Attendance – Sales [T-P – Pune]', ack]);
  pune.data.push([new Date(2026, 9, 6, 9, 0, 0), new Date(2026, 9, 6), 'CL', 'Confirmed']);
  env.c.hrosOnFormSubmit(ev(pune, 2));
  const p = env.rowsOf('ATTENDANCE_DAILY').find((r) => r.EMP_ID === 'T-P' && r.STATUS === 'VALID');
  assert.deepEqual([p.CODE, p.SITE, p.SOURCE], ['CL', 'PUNE', 'FORM_PUNE']);
  // unacknowledged response is rejected, not applied
  raw.data.push([new Date(2026, 9, 7, 9, 0, 0), new Date(2026, 9, 7), 'A', '', '']);
  env.c.hrosOnFormSubmit(ev(raw, 4));
  const rej = env.rowsOf('ATTENDANCE_DAILY').filter((r) => r.DATE === '2026-10-07');
  assert.ok(rej.every((r) => r.STATUS === 'REJECTED'));
});

test('hrosOnFormSubmit: days form / canteen / efficiency route to their sync; other tabs are ignored; missing month skipped', () => {
  const env = attendanceWorld();
  env.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  env.put('INPUT_ATTENDANCE', ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED', 'SL_AVAILED',
    'PAID_LEAVE_OTHER', 'WORKED_DAYS', 'PAYABLE_DAYS', 'APPROVAL_STATUS', 'APPROVED_BY', 'SOURCE_REF', 'ENTERED_AT', 'REMARKS', 'PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS',
    'GENERATED_VALUES_JSON', 'HR_OVERRIDE', 'OVERRIDE_REASON', 'ROW_KEY']);
  env.put('INPUT_CANTEEN', ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  env.put('INPUT_EFFICIENCY', ['PAYROLL_MONTH', 'EMP_ID', 'EFFICIENCY_PCT', 'PHYSICAL_PRESENT_DAYS_OVERRIDE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  const days = env.put('PAYROLL_DAYS_FORM_RESPONSES', ['Timestamp', 'Email Address', 'Payroll Month', 'Employee', 'Present Days', 'Week Off', 'PH', 'EL Availed', 'CL Availed', 'SL Availed', 'Other Paid Leave', 'Worked / Payable Days', 'Submission Type', 'Remarks']);
  days.data.push(['2026-09-28 10:00:00', 'x@y', '2026-09', 'T-A – Alpha', 21, 4, 0, 0, 0, 0, 0, '', 'New', '']);
  const can = env.put('CANTEEN_FORM_RESPONSES', ['Timestamp', 'Payroll Month', 'Employee ID', 'Deduction amount (INR)', 'Submission type']);
  can.data.push(['2026-09-28 10:00:00', 'September 2026', 'T-A', 300, 'New']);
  const eff = env.put('EFFICIENCY_FORM_RESPONSES', ['Timestamp', 'Payroll Month', 'Employee ID', 'Production efficiency percent']);
  eff.data.push(['2026-09-28 10:00:00', '2026-09', 'T-W', 84]);
  assert.equal(plain(env.c.hrosOnFormSubmit(ev(days, 2, { 'Payroll Month': ['2026-09'] }))).created, 1);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE')[0].PRESENT_DAYS, 21);
  env.c.hrosOnFormSubmit(ev(can, 2, { 'Payroll Month': ['September 2026'] }));
  assert.equal(env.rowsOf('INPUT_CANTEEN')[0].AMOUNT_INR, 300);
  env.c.hrosOnFormSubmit(ev(eff, 2, { 'Payroll Month': ['2026-09'] }));
  assert.equal(env.rowsOf('INPUT_EFFICIENCY')[0].EFFICIENCY_PCT, 84);
  const auditBefore = env.rowsOf('AUDIT_LOG').length;
  const other = env.put('Some Other Form', ['a']);
  assert.equal(env.c.hrosOnFormSubmit(ev(other, 2, {})), null);
  assert.equal(env.c.hrosOnFormSubmit({}), null);
  assert.equal(env.rowsOf('AUDIT_LOG').length, auditBefore, 'unrouted tabs leave no trace');
  assert.equal(env.c.hrosOnFormSubmit(ev(days, 2, { Other: ['x'] })), null);
  assert.match(env.rowsOf('AUDIT_LOG').pop().Message, /DAYS_SUBMIT_SKIPPED/);
  // a pre-MIN_PERIOD submission is refused loudly (audited and re-thrown)
  assert.throws(() => env.c.hrosOnFormSubmit(ev(days, 2, { 'Payroll Month': ['2026-08'] })), /earlier than MIN_PERIOD/);
  assert.match(env.rowsOf('AUDIT_LOG').pop().Message, /DAYS_SUBMIT_ERROR/);
});

test('OT source: external spreadsheet when OT_SOURCE_SPREADSHEET_ID is set (password columns never read); local Overtime_Form only when blank', () => {
  const HDR = ['Timestamp', 'Submission Type', 'EMP ID', 'Date Of OT', 'OT Hours', 'Approval Decision', 'Approval Password (HT)', 'Case No'];
  const ot = (emp, kase) => ['2026-10-06 10:00:00', 'Approval Of Manager', emp, '2026-10-05', 4, 'Approved', 'SECRET-PW', kase];
  const mk = () => {
    const env = attendanceWorld();
    env.put('INPUT_OT', ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'APPROVAL_STATUS', 'ENTERED_AT', 'SOURCE_CASE_NOS', 'SOURCE_EVENT_COUNT', 'DATE_RANGE',
      'OT_KEY', 'OT_DATE', 'SOURCE_ROW', 'NORMALIZER_VERSION', 'ELIGIBILITY', 'EXCEPTION_REASON']);
    const local = env.put('Overtime_Form', HDR);
    local.data.push(ot('T-A', 1));
    return env;
  };
  // blank ID -> local tab
  const a = mk();
  a.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: '' }]);
  const ra = plain(a.c.syncOtFromForm('2026-10'));
  assert.equal(ra.validWritten, 1);
  assert.equal(ra.source, 'Overtime_Form');
  // ID set -> external tab (default "Form Responses 1"), local decoy not read
  const b = mk();
  const ext = b.put('EXT_TMP', HDR);
  delete b.sheets.EXT_TMP;
  ext.data.push(ot('T-B', 2), ot('T-B', 3));
  ext.data[2][3] = '2026-10-06';
  b.external.EXTID = { 'Form Responses 1': ext };
  b.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: 'EXTID' }]);
  const rb = plain(b.c.syncOtFromForm('2026-10'));
  assert.deepEqual([rb.validWritten, rb.source], [2, 'external:Form Responses 1']);
  assert.deepEqual(b.rowsOf('INPUT_OT').map((r) => r.EMP_ID).sort(), ['T-B', 'T-B']);
  ext.calls.filter((x) => x.r > 1 || x.nr > 1).forEach((x) => { assert.ok(!(x.c <= 7 && x.c + x.nc - 1 >= 7), 'Approval Password column (7) never read'); });
  assert.ok(!JSON.stringify(b.sheets.INPUT_OT.data).includes('SECRET-PW'));
  // custom tab name + failure modes
  b.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: 'EXTID' }, { KEY: 'OT_SOURCE_TAB', VALUE: 'Nope' }]);
  assert.throws(() => b.c.syncOtFromForm('2026-10'), /no tab "Nope"/);
  b.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: 'BADID' }]);
  assert.throws(() => b.c.syncOtFromForm('2026-10'), /Cannot open the OT source spreadsheet/);
});
