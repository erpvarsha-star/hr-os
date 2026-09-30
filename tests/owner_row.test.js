'use strict';
// Owner row (AUTO_FULL_ATTENDANCE_EMP_IDS + ZERO_PAY_ALLOWED_EMP_IDS), women PT exemption wiring, GENDER column, setup seeds.
const test = require('node:test');
const assert = require('node:assert/strict');
const { plain } = require('./load');
const { makeEnv, makeFormApp } = require('./fakes');
const { P, HR, ACC, fullWorld, MASTER_HDR } = require('./regenv');

const OWNER_ID = 'VF1';
const ownerMaster = { EMP_ID: OWNER_ID, EMPLOYEE_NAME: 'The CEO', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'MD', DESIGNATION: 'CEO', DOJ_AS_SOURCE: '01/01/2015' };
const zeroSal = () => ({ EMP_ID: OWNER_ID, PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: '2026-08-01', BASIC_PM_INR: 0, HRA_PM_INR: 0, CONVEYANCE_PM_INR: 0, EDUCATION_PM_INR: 0,
  MEDICAL_PM_INR: 0, PRO_DEV_PM_INR: 0, COMMUNICATION_PM_INR: 0, UNIFORM_PM_INR: 0, WASHING_PM_INR: 0, FIXED_GROSS_PM_AS_SOURCE_INR: 0, HR_APPROVED_BY: 'hr@x' });
const AUTO = { KEY: 'AUTO_FULL_ATTENDANCE_EMP_IDS', VALUE: OWNER_ID };
const ZERO = { KEY: 'ZERO_PAY_ALLOWED_EMP_IDS', VALUE: OWNER_ID };

function build(opts = {}) {
  const env = fullWorld({ master: [ownerMaster], control: opts.control || [AUTO, ZERO], holidays: opts.holidays, leave: opts.leave });
  env.addRows('SALARY_STRUCTURE', [zeroSal()]);
  env.user = HR;
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S1', days: 20 }, { empId: 'S2', days: 20 }] });
  env.c.approveAttendance(P, 'STAFF');
  return env;
}
const draft = (env, id) => env.rowsOf('PAYROLL_DRAFT').find((r) => r.EMP_ID === id);
const exc = (env, id) => env.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.EMP_ID === id).map((e) => e.SEVERITY + ':' + e.CODE);

// ---------------------------------------------------------------- pure auto attendance rows

test('autoFullAttendanceRows: every day of the month counted incl. week-offs, PH and approved leave handled like a register entry', () => {
  const env = build();
  const c = env.c;
  const roster = [{ EMP_ID: OWNER_ID, PAYROLL_CATEGORY: 'STAFF', SITE: 'VFL' }];
  const hol = [{ DATE: '2026-09-17', SITE: 'ALL', HOLIDAY_NAME: 'H', PAID: 'Y' }];
  // plain month: 30 days, 4 Sundays -> present 26 + WO 4 = 30
  let r = plain(c.autoFullAttendanceRows(P, roster, [], { VF1: true }, [], { VFL: 'SUN', PUNE: 'SUN' }, {}, 'now'))[0];
  assert.deepEqual([r.PRESENT_DAYS, r.PHYSICAL_PRESENT_DAYS, r.WEEK_OFF, r.PH, r.EL_AVAILED, r.WORKED_DAYS], [26, 26, 4, 0, 0, 30]);
  assert.deepEqual([r.APPROVAL_STATUS, r.REMARKS, r.SOURCE_REF, r.PAYROLL_MONTH, r.EMP_ID, r.PAYROLL_CATEGORY], ['APPROVED', 'AUTO_FULL_ATTENDANCE', 'AUTO_FULL_ATTENDANCE', P, OWNER_ID, 'STAFF']);
  assert.equal(r.REGISTER_INCLUDES_WO, 'Y');
  // a paid holiday and 2 EL days: present = 30 - PH 1 - EL 2 - WO 4 = 23, worked = 30
  r = plain(c.autoFullAttendanceRows(P, roster, [], { VF1: true }, hol, { VFL: 'SUN' }, { VF1: { EL: 2 } }, 'now'))[0];
  assert.deepEqual([r.PRESENT_DAYS, r.WEEK_OFF, r.PH, r.EL_AVAILED, r.WORKED_DAYS], [23, 4, 1, 2, 30]);
  assert.equal(c.attendanceRowProblems(r, 'STAFF', P).length, 0);
  // HR's row always wins; ids not listed get nothing
  assert.equal(c.autoFullAttendanceRows(P, roster, [{ EMP_ID: OWNER_ID, PRESENT_DAYS: 10 }], { VF1: true }, [], { VFL: 'SUN' }, {}, 'now').length, 0);
  assert.equal(c.autoFullAttendanceRows(P, roster, [], {}, [], { VFL: 'SUN' }, {}, 'now').length, 0);
});

// ---------------------------------------------------------------- engine / readiness

test('owner row: no attendance row, zero salary structure -> a normal all-zero row, no HOLD, readiness not blocked', () => {
  const env = build();
  const r = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(r.populations[0].held, []);
  assert.equal(r.populations[0].blockers, 0);
  const d = draft(env, OWNER_ID);
  assert.equal(d.NET_PAY, 0);
  ['GROSS_EARNINGS', 'TOTAL_EARNINGS', 'PF_EMPLOYEE', 'ESI_EMPLOYEE', 'PT', 'MLWF', 'TOTAL_DEDUCTIONS'].forEach((k) => assert.equal(d[k], 0, k));
  assert.equal(d.PRESENT_DAYS, 26);
  assert.equal(d.WO_DAYS, 4);
  assert.equal(d.WORKED_PAYABLE_DAYS, 30);
  assert.ok(!/HOLD/.test(d.FLAGS));
  assert.deepEqual(exc(env, OWNER_ID).filter((x) => /^(HOLD|BLOCKER)/.test(x)), []);
  assert.equal(env.rowsOf('PAYROLL_READINESS').filter((x) => x.POPULATION === 'STAFF' && /BLOCKED|HOLD/.test(x.STATUS)).length, 0);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').filter((x) => x.EMP_ID === OWNER_ID).length, 0, 'nothing is written to INPUT_ATTENDANCE');
});

test('owner row: without the control keys he is held (MISSING_ATTENDANCE / ZERO_SALARY_STRUCTURE) as before', () => {
  const env = build({ control: [] });
  plain(env.c.calculateDraft(P, 'STAFF'));
  const e = exc(env, OWNER_ID);
  assert.ok(e.includes('HOLD:MISSING_ATTENDANCE') && e.includes('HOLD:ZERO_SALARY_STRUCTURE'), e.join());
  // auto attendance alone does not allow zero pay, zero pay alone does not invent attendance
  const a = build({ control: [AUTO] }); plain(a.c.calculateDraft(P, 'STAFF'));
  assert.ok(exc(a, OWNER_ID).includes('HOLD:ZERO_SALARY_STRUCTURE') && !exc(a, OWNER_ID).includes('HOLD:MISSING_ATTENDANCE'));
  const z = build({ control: [ZERO] }); plain(z.c.calculateDraft(P, 'STAFF'));
  assert.ok(exc(z, OWNER_ID).includes('HOLD:MISSING_ATTENDANCE') && !exc(z, OWNER_ID).includes('HOLD:ZERO_SALARY_STRUCTURE'));
});

test('owner row: an attendance row typed by HR wins over the automatic one', () => {
  const env = build();
  env.addRows('INPUT_ATTENDANCE', [{ PAYROLL_MONTH: P, EMP_ID: OWNER_ID, PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 26, PRESENT_DAYS: 10, WEEK_OFF: 4, PH: 0, EL_AVAILED: 0,
    CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, PHYSICAL_PRESENT_DAYS: 10, ABSENT_LWP_DAYS: 0, APPROVAL_STATUS: 'APPROVED', SOURCE_REF: 'HR_MONTHLY_ENTRY' }]);
  plain(env.c.calculateDraft(P, 'STAFF'));
  assert.equal(draft(env, OWNER_ID).PRESENT_DAYS, 10);
  assert.equal(draft(env, OWNER_ID).NET_PAY, 0);
});

test('owner row: daily attendance data for the month does not hold him (DAILY_ATTENDANCE_MISSING)', () => {
  const env = build();
  env.addRows('ATTENDANCE_DAILY', [{ PERIOD: P, DATE: '2026-09-01', SITE: 'VFL', EMP_ID: 'S1', CODE: 'P', SOURCE: 'FORM_VFL', SOURCE_REF: 'x', KEY: 'S1|2026-09-01', STATUS: 'VALID' }]);
  plain(env.c.calculateDraft(P, 'STAFF'));
  assert.ok(!exc(env, OWNER_ID).some((x) => /DAILY_ATTENDANCE_MISSING|MISSING_ATTENDANCE/.test(x)));
  assert.ok(!/HOLD/.test(draft(env, OWNER_ID).FLAGS));
});

// ---------------------------------------------------------------- register / forms / prepare / payslips

test('register list, prepareMonthlyAttendance and the monthly forms leave the auto-attendance employee out; the daily form keeps him', () => {
  const env = build();
  env.c.FormApp = makeFormApp(env);
  assert.ok(!plain(env.c.registerLoad(P)).employees.some((e) => e.empId === OWNER_ID));
  assert.ok(plain(env.c.registerLoad(P)).employees.some((e) => e.empId === 'S1'));
  env.c.prepareMonthlyAttendance(P);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').filter((x) => x.EMP_ID === OWNER_ID).length, 0);
  env.c.createAttendanceForms();
  const ctl = env.c.readControlMap();
  const titles = (id) => env.c.FormApp.openById(ctl[id]).items.map((i) => i.title);
  assert.ok(!titles('ATT_MONTHLY_VFL_ID').some((t) => t.indexOf(OWNER_ID) === 0));
  assert.ok(titles('ATT_MONTHLY_VFL_ID').some((t) => t.indexOf('S1') === 0));
  const daily = env.c.FormApp.openById(ctl.ATT_FORM_VFL_ID);
  assert.ok(JSON.stringify(daily.items.map((i) => i.rows || [])).indexOf(OWNER_ID) >= 0, 'daily form lists him');
  // refresh keeps that state
  env.c.refreshAttendanceFormRosters();
  assert.ok(!titles('ATT_MONTHLY_VFL_ID').some((t) => t.indexOf(OWNER_ID) === 0));
});

test('payslipPending skips a listed zero-pay row (gross 0 and net 0) but not other rows or a listed employee who is paid', () => {
  const env = build();
  const rows = [{ EMP_ID: OWNER_ID, TOTAL_EARNINGS: 0, NET_PAY: 0 }, { EMP_ID: 'S1', TOTAL_EARNINGS: 100, NET_PAY: 90 }, { EMP_ID: 'S2', TOTAL_EARNINGS: 0, NET_PAY: 0 }];
  const ids = (z) => plain(env.c.payslipPending(rows, [], 'L1', [], z)).map((r) => r.EMP_ID);
  assert.deepEqual(ids({ VF1: true }), ['S1', 'S2']);
  assert.deepEqual(ids({}), [OWNER_ID, 'S1', 'S2']);
  assert.deepEqual(ids(undefined), [OWNER_ID, 'S1', 'S2']);
  assert.deepEqual(plain(env.c.payslipPending([{ EMP_ID: OWNER_ID, TOTAL_EARNINGS: 500, NET_PAY: 500 }], [], 'L1', [], { VF1: true })).length, 1);
});

// ---------------------------------------------------------------- GENDER through the engine

test('engine: GENDER F with PT basis <= 25,000 pays no PT (INFO PT_WOMEN_EXEMPT); M / blank / above the limit pay PT', () => {
  const env = fullWorld({ master: [ownerMaster], control: [AUTO, ZERO] });
  const rows = env.rowsOf('EMPLOYEE_MASTER').map((r) => Object.assign({}, r, { GENDER: r.EMP_ID === 'S1' ? 'F' : (r.EMP_ID === 'S2' ? 'f' : '') }));
  env.put('EMPLOYEE_MASTER', MASTER_HDR.concat(['GENDER']), rows);
  // S1 (F) 20,000 gross -> exempt; S2 (f) 31,500 -> slab
  const setGross = (id, g) => env.editCells('SALARY_STRUCTURE', { EMP_ID: id }, { FIXED_GROSS_PM_AS_SOURCE_INR: g, BASIC_PM_INR: g * 0.4, HRA_PM_INR: g * 0.24, CONVEYANCE_PM_INR: g * 0.06,
    EDUCATION_PM_INR: g * 0.06, MEDICAL_PM_INR: g * 0.06, PRO_DEV_PM_INR: g * 0.03, COMMUNICATION_PM_INR: g * 0.02, UNIFORM_PM_INR: g * 0.04, WASHING_PM_INR: g * 0.09 });
  setGross('S1', 20000); setGross('S2', 31500);
  env.addRows('STATUTORY_CONFIG', [{ KEY: 'PT_WOMEN_EXEMPT_UPTO', VALUE: 25000, EFFECTIVE_FROM: '2026-09', VERSION: 1, APPROVED_BY: 'accounts@x' }]);
  env.addRows('SALARY_STRUCTURE', [zeroSal()]);
  env.user = HR;
  env.c.registerSubmit({ period: P, includesWO: { STAFF: 'Y' }, entries: [{ empId: 'S1', days: 30 }, { empId: 'S2', days: 30 }] });
  env.c.approveAttendance(P, 'STAFF');
  plain(env.c.calculateDraft(P, 'STAFF'));
  assert.equal(draft(env, 'S1').PT, 0);
  assert.ok(exc(env, 'S1').includes('INFO:PT_WOMEN_EXEMPT'));
  assert.equal(draft(env, 'S2').PT, 200, 'female above the limit pays the slab');
  assert.ok(!exc(env, 'S2').includes('INFO:PT_WOMEN_EXEMPT'));
});

// ---------------------------------------------------------------- setup: seeds, GENDER column, Accounts approval for 2026-09

test('fresh setup seeds GENDER (M/F list), PT_WOMEN_EXEMPT_UPTO and the two control keys; Accounts approval of 2026-09 stamps the new key (statutory gate clear)', () => {
  const env = makeEnv({ user: 'owner@varshaforgings.com' });
  ['OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'].forEach((n) => env.put(n, ['Timestamp', 'x'], []));
  env.c.hrosSetup();
  const hdr = env.sheets.EMPLOYEE_MASTER.data[0];
  assert.equal(hdr[hdr.length - 1], 'GENDER', 'GENDER is appended on the right');
  const col = hdr.indexOf('GENDER') + 1;
  assert.deepEqual(plain(env.sheets.EMPLOYEE_MASTER.validationAt(2, col).list), ['M', 'F']);
  const ctl = Object.fromEntries(env.rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]));
  assert.equal(ctl.AUTO_FULL_ATTENDANCE_EMP_IDS, 'VFL1001');
  assert.equal(ctl.ZERO_PAY_ALLOWED_EMP_IDS, 'VFL1001');
  const st = env.rowsOf('STATUTORY_CONFIG').find((r) => r.KEY === 'PT_WOMEN_EXEMPT_UPTO');
  assert.deepEqual([st.VALUE, st.EFFECTIVE_FROM, st.VERSION, st.APPROVED_BY], [25000, '2026-09', 1, '']);
  // setup again: nothing duplicated, an edited control value is kept
  env.editCells('PAYROLL_CONTROL', { KEY: 'AUTO_FULL_ATTENDANCE_EMP_IDS' }, { VALUE: 'VFL1001,VFL1002' });
  env.c.hrosSetup();
  assert.equal(env.rowsOf('STATUTORY_CONFIG').filter((r) => r.KEY === 'PT_WOMEN_EXEMPT_UPTO').length, 1);
  assert.equal(env.rowsOf('PAYROLL_CONTROL').find((r) => r.KEY === 'AUTO_FULL_ATTENDANCE_EMP_IDS').VALUE, 'VFL1001,VFL1002');
  // Accounts approval (PAYROLL_CONTROL seeds accounts@varshaforgings.com)
  env.user = ACC;
  assert.equal(plain(env.c.planStatutoryApproval('2026-09')).toStamp.some((t) => t.key === 'PT_WOMEN_EXEMPT_UPTO'), true);
  const res = plain(env.c.approveStatutoryConfig('2026-09'));
  assert.equal(res.ok, true);
  assert.ok(env.rowsOf('STATUTORY_CONFIG').every((r) => r.APPROVED_BY === ACC), 'every applying key, including the new one, is stamped');
  const again = plain(env.c.resolveStatutory(env.rowsOf('STATUTORY_CONFIG'), '2026-09', 'STAFF'));
  assert.deepEqual(again.unapproved, []);
  assert.equal(again.values.PT_WOMEN_EXEMPT_UPTO, 25000);
});

// ---------------------------------------------------------------- employee dialog

test('employee dialog: optional GENDER is validated (M / F / Male / Female / blank) and written to EMPLOYEE_MASTER', () => {
  const env = fullWorld();
  const cat = plain(env.c.categoryEntry('STAFF'));
  const ctx = { mode: 'ADD', category: cat, master: [], latestPay: null, payRows: [], minPeriod: '2026-09' };
  const base = { mode: 'ADD', empId: 'S9', name: 'N', doj: '2026-09-10', category: 'STAFF' };
  const v = (g) => plain(env.c.empValidateInput(Object.assign({}, base, { gender: g }), ctx));
  assert.equal(v('female').master.GENDER, 'F');
  assert.equal(v('M').master.GENDER, 'M');
  assert.equal(v('').master.GENDER, '');
  assert.ok(v('Other').errors.some((e) => /Gender/.test(e)));
  assert.ok(!v('').errors.some((e) => /Gender/.test(e)));
});
