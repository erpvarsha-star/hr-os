'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

const P = '2026-09';
const ATT_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'WORKED_DAYS', 'PAYABLE_DAYS', 'APPROVAL_STATUS', 'APPROVED_BY', 'SOURCE_REF', 'ENTERED_AT', 'REMARKS',
  'PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS', 'GENERATED_VALUES_JSON', 'HR_OVERRIDE', 'OVERRIDE_REASON', 'ROW_KEY'];
const PC_HDR = ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE', 'DRAFT_RUN_ID', 'DRAFT_HASH',
  'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'];

function world(extra = {}) {
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
  return env;
}
const attOf = (env, id) => env.rowsOf('INPUT_ATTENDANCE').filter((r) => r.EMP_ID === id);

test('WORKING_DAYS refresh: prepare / generate copy PAYROLL_PERIOD_CATEGORY.WORKING_DAYS into PENDING rows only', () => {
  const env = world({ attendance: [
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
  // HR changes working days afterwards: the next prepare run refreshes PENDING rows again
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { WORKING_DAYS: 27 });
  assert.equal(plain(env.c.prepareMonthlyAttendance(P)).workingDaysRefreshed, 3, 'VFL1001 and the two roster-warning STAFF rows');
  assert.equal(attOf(env, 'VFL1001')[0].WORKING_DAYS, 27);
});

test('WORKING_DAYS refresh also runs on generateMonthlyAttendance (daily forms, October onward)', () => {
  const env = world({ attendance: [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'VFL1001', PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: '', PRESENT_DAYS: 1, APPROVAL_STATUS: 'PENDING' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'VFL4001', PAYROLL_CATEGORY: 'PERMANENT_WORKER', WORKING_DAYS: 20, PRESENT_DAYS: 1, APPROVAL_STATUS: 'APPROVED' },
  ] });
  env.put('PAYROLL_PERIOD_CATEGORY', PC_HDR, ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((c) => ({ PAYROLL_MONTH: '2026-10', PAYROLL_CATEGORY: c, WORKING_DAYS: 27, STATUS: 'PENDING' })));
  env.put('HOLIDAY_CALENDAR', ['DATE', 'SITE', 'HOLIDAY_NAME', 'PAID']);
  env.put('ATTENDANCE_DAILY', ['PERIOD', 'DATE', 'SITE', 'EMP_ID', 'CODE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'REJECT_REASON', 'ENTERED_AT'], [
    { PERIOD: '2026-10', DATE: '2026-10-05', SITE: 'NASHIK', EMP_ID: 'VFL1001', CODE: 'P', KEY: 'VFL1001|2026-10-05', STATUS: 'VALID', ENTERED_AT: '2026-10-05T09:00:00' }]);
  const r = plain(env.c.generateMonthlyAttendance('2026-10'));
  assert.ok(r.workingDaysRefreshed >= 1);
  assert.equal(attOf(env, 'VFL1001')[0].WORKING_DAYS, 27);
  assert.equal(attOf(env, 'VFL4001')[0].WORKING_DAYS, 20, 'APPROVED row untouched');
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
