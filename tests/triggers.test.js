'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

test('routeFormSubmit: only the attendance raw tabs, OT source tab, canteen and efficiency are routed', () => {
  const { c } = makeEnv();
  assert.equal(c.routeFormSubmit('ATT_FORM_NASHIK_RAW'), 'ATT_NASHIK');
  assert.equal(c.routeFormSubmit('ATT_FORM_PUNE_RAW'), 'ATT_PUNE');
  assert.equal(c.routeFormSubmit('OT_FORM_RESPONSES'), 'OT');
  assert.equal(c.routeFormSubmit('Form Responses 7', 'Form Responses 7'), 'OT', 'a renamed local OT tab in use is routed too');
  assert.equal(c.routeFormSubmit('Form Responses 7', ''), null);
  assert.equal(c.routeFormSubmit('PAYROLL_DAYS_FORM_RESPONSES'), null, 'the days form is not part of the flow');
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

const OT_HDR = ['Timestamp', 'Submission Type', 'EMP ID', 'Date Of OT', 'OT Hours', 'Approval Decision', 'Approval Password (HT)', 'Case No'];
const OT_INPUT_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'APPROVAL_STATUS', 'ENTERED_AT', 'SOURCE_CASE_NOS', 'SOURCE_EVENT_COUNT', 'DATE_RANGE',
  'OT_KEY', 'OT_DATE', 'SOURCE_ROW', 'NORMALIZER_VERSION', 'ELIGIBILITY', 'EXCEPTION_REASON'];
const otEvent = (emp, date, kase = 1, h = 4) => ['2026-09-28 10:00:00', 'Approval Of Manager', emp, date, h, 'Approved', 'SECRET-PW', kase];

test('hrosOnFormSubmit: canteen / efficiency / OT route to their sync; other tabs are ignored; missing month skipped', () => {
  const env = attendanceWorld();
  env.put('INPUT_CANTEEN', ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  env.put('INPUT_EFFICIENCY', ['PAYROLL_MONTH', 'EMP_ID', 'EFFICIENCY_PCT', 'PHYSICAL_PRESENT_DAYS_OVERRIDE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  env.put('INPUT_OT', OT_INPUT_HDR);
  const can = env.put('CANTEEN_FORM_RESPONSES', ['Timestamp', 'Payroll Month', 'Employee ID', 'Deduction amount (INR)', 'Submission type']);
  can.data.push(['2026-09-28 10:00:00', 'September 2026', 'T-A', 300, 'New']);
  const eff = env.put('EFFICIENCY_FORM_RESPONSES', ['Timestamp', 'Payroll Month', 'Employee ID', 'Production efficiency percent']);
  eff.data.push(['2026-09-28 10:00:00', '2026-09', 'T-W', 84]);
  const ot = env.put('OT_FORM_RESPONSES', OT_HDR);
  ot.data.push(otEvent('T-A', '2026-09-12'), otEvent('T-A', '2026-10-05', 2, 3), otEvent('T-A', '2026-08-28', 3, 2), otEvent('T-A', '2026-08-20', 4, 9));
  env.c.hrosOnFormSubmit(ev(can, 2, { 'Payroll Month': ['September 2026'] }));
  assert.equal(env.rowsOf('INPUT_CANTEEN')[0].AMOUNT_INR, 300);
  env.c.hrosOnFormSubmit(ev(eff, 2, { 'Payroll Month': ['2026-09'] }));
  assert.equal(env.rowsOf('INPUT_EFFICIENCY')[0].EFFICIENCY_PCT, 84);
  // OT: the period comes from the OT date of the submitted row (calendar month; 26-Aug..31-Aug belongs to September while the catch-up override exists)
  env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [{ KEY: 'OT_WINDOW_START_2026-09', VALUE: '2026-08-26' }]);
  const r1 = plain(env.c.hrosOnFormSubmit(ev(ot, 2)));
  assert.equal(r1.period, '2026-09');
  assert.deepEqual(env.rowsOf('INPUT_OT').map((r) => r.OT_DATE).sort(), ['2026-08-28', '2026-09-12'], 'the September sync includes the catch-up day');
  const r2 = plain(env.c.hrosOnFormSubmit(ev(ot, 3)));
  assert.equal(r2.period, '2026-10');
  assert.ok(env.rowsOf('INPUT_OT').some((r) => r.OT_DATE === '2026-10-05'));
  const before = env.rowsOf('INPUT_OT').length;
  assert.equal(env.c.hrosOnFormSubmit(ev(ot, 5)), null, 'an OT date before MIN_PERIOD is skipped quietly');
  assert.equal(env.rowsOf('INPUT_OT').length, before);
  assert.match(env.rowsOf('AUDIT_LOG').pop().Message, /OT_SUBMIT_SKIPPED/);
  const auditBefore = env.rowsOf('AUDIT_LOG').length;
  const other = env.put('Some Other Form', ['a']);
  assert.equal(env.c.hrosOnFormSubmit(ev(other, 2, {})), null);
  assert.equal(env.c.hrosOnFormSubmit({}), null);
  assert.equal(env.rowsOf('AUDIT_LOG').length, auditBefore, 'unrouted tabs leave no trace');
  assert.equal(env.c.hrosOnFormSubmit(ev(can, 2, { Other: ['x'] })), null);
  assert.match(env.rowsOf('AUDIT_LOG').pop().Message, /CANTEEN_SUBMIT_SKIPPED/);
  // a pre-MIN_PERIOD canteen submission is refused loudly (audited and re-thrown)
  assert.throws(() => env.c.hrosOnFormSubmit(ev(can, 2, { 'Payroll Month': ['2026-08'] })), /earlier than MIN_PERIOD/);
  assert.match(env.rowsOf('AUDIT_LOG').pop().Message, /CANTEEN_SUBMIT_ERROR/);
});

test('feeds_otPeriodForDate: calendar month, except dates inside a next-period OT_WINDOW_START override', () => {
  const { c } = makeEnv();
  const ctl = { 'OT_WINDOW_START_2026-09': '2026-08-26' };
  assert.equal(c.feeds_otPeriodForDate('2026-09-12', ctl), '2026-09');
  assert.equal(c.feeds_otPeriodForDate('2026-08-25', ctl), '2026-08');
  assert.equal(c.feeds_otPeriodForDate('2026-08-26', ctl), '2026-09');
  assert.equal(c.feeds_otPeriodForDate('2026-08-31', ctl), '2026-09');
  assert.equal(c.feeds_otPeriodForDate(new Date(2026, 7, 30), ctl), '2026-09');
  assert.equal(c.feeds_otPeriodForDate('2026-10-05', ctl), '2026-10');
  assert.equal(c.feeds_otPeriodForDate('2026-12-31', { 'OT_WINDOW_START_2027-01': '2026-12-28' }), '2027-01');
  assert.equal(c.feeds_otPeriodForDate('not a date', ctl), '');
  assert.equal(c.feeds_otPeriodForDate('2026-08-28', {}), '2026-08');
});

test('OT source: local OT_FORM_RESPONSES by default, Overtime_Form fallback, external spreadsheet only when the ID is set (password columns never read)', () => {
  const ot = (emp, kase) => ['2026-10-06 10:00:00', 'Approval Of Manager', emp, '2026-10-05', 4, 'Approved', 'SECRET-PW', kase];
  const mk = (ctl) => {
    const env = attendanceWorld();
    env.put('INPUT_OT', OT_INPUT_HDR);
    env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], ctl || []);
    return env;
  };
  // (a) OT_FORM_RESPONSES exists -> read; the legacy Overtime_Form is ignored
  const a = mk();
  a.put('OT_FORM_RESPONSES', OT_HDR).data.push(ot('T-A', 1));
  a.put('Overtime_Form', OT_HDR).data.push(ot('T-B', 2));
  const ra = plain(a.c.syncOtFromForm('2026-10'));
  assert.deepEqual([ra.validWritten, ra.source], [1, 'OT_FORM_RESPONSES']);
  assert.deepEqual(a.rowsOf('INPUT_OT').map((r) => r.EMP_ID), ['T-A']);
  // (b) tab name configurable through OT_SOURCE_TAB
  const b0 = mk([{ KEY: 'OT_SOURCE_TAB', VALUE: 'My OT Responses' }]);
  b0.put('My OT Responses', OT_HDR).data.push(ot('T-B', 2));
  assert.equal(plain(b0.c.syncOtFromForm('2026-10')).source, 'My OT Responses');
  // (c) OT_FORM_RESPONSES absent -> Overtime_Form
  const c1 = mk([{ KEY: 'OT_SOURCE_TAB', VALUE: 'OT_FORM_RESPONSES' }, { KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: '' }]);
  c1.put('Overtime_Form', OT_HDR).data.push(ot('T-B', 2));
  const rc = plain(c1.c.syncOtFromForm('2026-10'));
  assert.deepEqual([rc.validWritten, rc.source], [1, 'Overtime_Form']);
  // (d) neither tab -> clear error
  assert.throws(() => mk().c.syncOtFromForm('2026-10'), /OT source tab not found/);
  // (e) external spreadsheet when OT_SOURCE_SPREADSHEET_ID is set; local tabs (decoys) are not read
  const e1 = mk([{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: 'EXTID' }, { KEY: 'OT_SOURCE_TAB', VALUE: 'Form Responses 1' }]);
  e1.put('OT_FORM_RESPONSES', OT_HDR).data.push(ot('T-A', 9));
  const ext = e1.put('EXT_TMP', OT_HDR);
  delete e1.sheets.EXT_TMP;
  ext.data.push(ot('T-B', 2), ot('T-B', 3));
  ext.data[2][3] = '2026-10-06';
  e1.external.EXTID = { 'Form Responses 1': ext };
  const re = plain(e1.c.syncOtFromForm('2026-10'));
  assert.deepEqual([re.validWritten, re.source], [2, 'external:Form Responses 1']);
  assert.deepEqual(e1.rowsOf('INPUT_OT').map((r) => r.EMP_ID), ['T-B', 'T-B']);
  ext.calls.filter((x) => x.r > 1 || x.nr > 1).forEach((x) => { assert.ok(!(x.c <= 7 && x.c + x.nc - 1 >= 7), 'Approval Password column (7) never read'); });
  assert.ok(!JSON.stringify(e1.sheets.INPUT_OT.data).includes('SECRET-PW'));
  // external default tab name and failure modes
  const e2 = mk([{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: 'EXTID' }]);
  e2.external.EXTID = { 'Form Responses 1': ext };
  assert.equal(plain(e2.c.syncOtFromForm('2026-10')).source, 'external:Form Responses 1');
  const e3 = mk([{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: 'EXTID' }, { KEY: 'OT_SOURCE_TAB', VALUE: 'Nope' }]);
  e3.external.EXTID = { 'Form Responses 1': ext };
  assert.throws(() => e3.c.syncOtFromForm('2026-10'), /no tab "Nope"/);
  assert.throws(() => mk([{ KEY: 'OT_SOURCE_SPREADSHEET_ID', VALUE: 'BADID' }]).c.syncOtFromForm('2026-10'), /Cannot open the OT source spreadsheet/);
});
