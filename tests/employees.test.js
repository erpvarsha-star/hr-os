'use strict';
// HR-only employee dialog: add / update (salary revision) / exit, per-employee SALARY_NOT_APPROVED hold, statutory IDs isolation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { plain } = require('./load');
const { P, HR, OWNER, ACC, fullWorld } = require('./regenv');

const SEC = { uan: '123456789012', esiNo: '5566778899', pan: 'ABCDE1234F', bankName: 'Test Bank Ltd', bankAccount: '998877665544', ifsc: 'TEST0001234' };
const SECRETS = ['123456789012', '5566778899', 'ABCDE1234F', 'Test Bank Ltd', '998877665544', 'TEST0001234'];
const SAL = { BASIC: 12600, HRA: 7560, CONVEYANCE: 1890, EDUCATION: 1890, MEDICAL: 1890, PRO_DEV: 945, COMMUNICATION: 630, UNIFORM: 1260, WASHING: 2835 };

/** fullWorld with the real master / pay-tab headers and the statutory-ID tab (as setup creates them). */
function world(opts = {}) {
  const env = fullWorld(opts);
  const c = env.c;
  const keep = (name, hdr) => { const rows = env.rowsOf(name); env.put(name, plain(hdr), rows); };
  keep('EMPLOYEE_MASTER', c.HROS_EMPLOYEE_MASTER_HEADERS);
  keep('SALARY_STRUCTURE', c.HROS_SALARY_STRUCTURE_HEADERS);
  keep('PAYROLL_RATE_PROFILE', c.HROS_RATE_PROFILE_HEADERS);
  env.put('EMPLOYEE_STATUTORY_IDS', plain(c.HROS_STATUTORY_ID_HEADERS), []);
  env.put('PAYROLL_PERIOD_CATEGORY', ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE', 'DRAFT_RUN_ID', 'DRAFT_HASH',
    'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'],
  ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((cat) => ({ PAYROLL_MONTH: P, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26, STATUS: 'PENDING' })));
  env.user = HR;
  return env;
}
const addStaff = (o = {}) => Object.assign({ mode: 'ADD', empId: 'S9', name: 'New Joiner', email: 'new@x.com', doj: '2026-09-10', category: 'STAFF', department: 'Stores',
  designation: 'Clerk', site: 'VFL', salary: SAL, ids: SEC }, o);
const master = (env, id) => env.rowsOf('EMPLOYEE_MASTER').filter((r) => r.EMP_ID === id);
const pays = (env, tab, id) => env.rowsOf(tab).filter((r) => r.EMP_ID === id);

test('only HR_APPROVER_EMAIL or OWNER_APPROVER_EMAIL may save; a register-entry user or a stranger may not', () => {
  const env = world({ control: [{ KEY: 'REGISTER_ENTRY_EMAILS', VALUE: 'clerk@x.com' }] });
  ['clerk@x.com', 'stranger@x.com', ACC].forEach((u) => { env.user = u; assert.throws(() => env.c.empSave(addStaff()), /Not allowed/, u); });
  env.user = ''; assert.throws(() => env.c.empSave(addStaff()), /Cannot determine|Not allowed/);
  assert.equal(master(env, 'S9').length, 0);
  env.user = OWNER;
  assert.equal(plain(env.c.empSave(addStaff())).ok, true);
  env.user = HR;
  assert.equal(plain(env.c.empSave(addStaff({ empId: 'S10' }))).ok, true);
});

test('add STAFF: master row PENDING_HR_APPROVAL, PENDING pay row effective the 1st of the DOJ month, fixed gross auto-summed, IDs only in the hidden tab', () => {
  const env = world();
  env.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  const r = plain(env.c.empSave(addStaff()));
  assert.equal(r.ok, true);
  assert.equal(r.pendingHrApproval, true);
  const m = master(env, 'S9')[0];
  assert.deepEqual([m.STATUS_AS_SOURCE, m.VALIDATION_STATE, m.PAYROLL_CATEGORY, m.DOJ_AS_SOURCE, m.EMPLOYEE_NAME, m.DEPARTMENT, m.PLANT_TO_VERIFY],
    ['Active', 'PENDING_HR_APPROVAL', 'STAFF', '10/09/2026', 'New Joiner', 'Stores', 'VFL']);
  const s = pays(env, 'SALARY_STRUCTURE', 'S9');
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].EFFECTIVE_FROM, s[0].VERSION_STATE, s[0].HR_APPROVED_BY, s[0].PAYROLL_CATEGORY], ['2026-09-01', 'PENDING', '', 'STAFF']);
  assert.equal(s[0].FIXED_GROSS_PM_AS_SOURCE_INR, 31500);
  assert.equal(s[0].HEAT_MASTER_INR, 0);
  // statutory IDs: only EMPLOYEE_STATUTORY_IDS
  const ids = env.rowsOf('EMPLOYEE_STATUTORY_IDS');
  assert.deepEqual(ids.map((x) => [x.EMP_ID, x.UAN, x.ESI_NO, x.PAN, x.BANK_NAME, x.BANK_ACCOUNT, x.IFSC]), [['S9', SEC.uan, SEC.esiNo, SEC.pan, SEC.bankName, SEC.bankAccount, SEC.ifsc]]);
  assert.equal(r.statutoryFieldsWritten, 6);
  Object.keys(env.sheets).filter((n) => n !== 'EMPLOYEE_STATUTORY_IDS').forEach((n) => {
    SECRETS.forEach((secret) => assert.ok(!JSON.stringify(env.sheets[n].data).includes(secret), n + ' must not contain ' + secret.slice(0, 3) + '...'));
  });
  SECRETS.forEach((secret) => assert.ok(!JSON.stringify(r).includes(secret), 'result must not echo IDs'));
  assert.match(env.rowsOf('AUDIT_LOG').map((a) => a.Message).join('\n'), /EMPLOYEE_ADD.*S9/);
  // form rosters are refreshed after an add (guarded: a broken form must not fail the save)
  assert.equal(r.rosterRefresh.ok, true);
  const env2 = world({ control: [{ KEY: 'ATT_FORM_VFL_ID', VALUE: 'FORM1' }] });
  const r2 = plain(env2.c.empSave(addStaff()));
  assert.equal(r2.ok, true);
  assert.equal(r2.rosterRefresh.ok, false);
  assert.match(r2.rosterRefresh.note, /not refreshed/);
  assert.equal(master(env2, 'S9').length, 1, 'saved despite the roster refresh failure');
});

test('add is refused (nothing written) for duplicates, unknown categories and bad values', () => {
  const env = world();
  const bad = (o, re) => {
    const before = JSON.stringify([env.sheets.EMPLOYEE_MASTER.data, env.sheets.SALARY_STRUCTURE.data, env.sheets.EMPLOYEE_STATUTORY_IDS.data]);
    assert.throws(() => env.c.empSave(addStaff(o)), re);
    assert.equal(JSON.stringify([env.sheets.EMPLOYEE_MASTER.data, env.sheets.SALARY_STRUCTURE.data, env.sheets.EMPLOYEE_STATUTORY_IDS.data]), before);
  };
  bad({ empId: 'S1' }, /already exists/);
  bad({ empId: 's1' }, /already exists/);
  bad({ empId: 'x y' }, /EMP_ID must be/);
  bad({ category: 'NOPE' }, /not an active category/);
  bad({ name: '' }, /Name is required/);
  bad({ email: 'nope' }, /Email/);
  bad({ doj: '' }, /Date of joining/);
  bad({ doj: '2026-02-30' }, /Date of joining/);
  bad({ ids: { pan: 'BAD' } }, /PAN looks wrong/);
  bad({ ids: { ifsc: 'BAD' } }, /IFSC looks wrong/);
  bad({ salary: Object.assign({}, SAL, { BASIC: -1 }) }, /BASIC must be a number/);
  bad({ salary: Object.assign({}, SAL, { HRA: 'abc' }) }, /HRA must be a number/);
  bad({ salary: Object.assign({}, SAL, { BASIC: 0 }) }, /BASIC must be greater/);
  bad({ salary: null }, /salary structure section is required/);
  assert.equal(plain(env.c.empSave(addStaff({ ids: { uan: '12345' } }))).warnings.some((w) => /UAN/.test(w)), true, 'a short UAN only warns');
  env.user = 'stranger@x.com';
  assert.throws(() => env.c.empSave(addStaff({ empId: 'S11' })), /Not allowed/);
});

test('add PERMANENT_WORKER (heat flag 150, VDA, production) and RATE_PROFILE categories (consultant daily / Pune monthly)', () => {
  const env = world();
  const w = plain(env.c.empSave({ mode: 'ADD', empId: 'W9', name: 'New Worker', doj: '2026-08-20', category: 'PERMANENT_WORKER', department: 'Forge', designation: 'Turner',
    salary: { BASIC: 15756, HRA: 3556, CONVEYANCE: 3334, EDUCATION: 3334, WASHING: 3111, MEDICAL: 999, heat: true, vda: 2790, production: 8500 } }));
  assert.equal(w.ok, true);
  const ws = pays(env, 'SALARY_STRUCTURE', 'W9')[0];
  assert.equal(ws.EFFECTIVE_FROM, '2026-08-01', 'first of the DOJ month');
  assert.deepEqual([ws.HEAT_MASTER_INR, ws.VDA_MASTER_INR, ws.PRODUCTION_MASTER_INR, ws.MEDICAL_PM_INR], [150, 2790, 8500, 0], 'staff-only components are not used for workers');
  assert.equal(ws.FIXED_GROSS_PM_AS_SOURCE_INR, 15756 + 3556 + 3334 + 3334 + 3111 + 150 + 2790 + 8500);
  assert.throws(() => env.c.empSave({ mode: 'ADD', empId: 'W8', name: 'x', doj: '2026-09-01', category: 'PERMANENT_WORKER', salary: { BASIC: 1, heat: 100 } }), /Heat must be 150/);
  // consultant daily rate
  const c1 = plain(env.c.empSave({ mode: 'ADD', empId: 'CX9', name: 'New Consultant', doj: '2026-09-15', category: 'CONSULTANT', rate: { payBasis: 'DAILY_RATE', rate: 900 } }));
  assert.equal(c1.ok, true);
  const rp = pays(env, 'PAYROLL_RATE_PROFILE', 'CX9')[0];
  assert.deepEqual([rp.PAY_BASIS, rp.RATE_AMOUNT_INR, rp.MONTHLY_GROSS_INR, rp.OT_METHOD, rp.VERSION_STATE, rp.EFFECTIVE_FROM, rp.HR_APPROVED_BY],
    ['DAILY_RATE', 900, '', 'DAILY_RATE_DIV_8_X_OT_HOURS', 'PENDING', '2026-09-01', '']);
  // Pune: only monthly gross
  assert.throws(() => env.c.empSave({ mode: 'ADD', empId: 'PX9', name: 'x', doj: '2026-09-01', category: 'PUNE_STAFF', rate: { payBasis: 'DAILY_RATE', rate: 500 } }), /requires MONTHLY_GROSS_PRORATED/);
  plain(env.c.empSave({ mode: 'ADD', empId: 'PX9', name: 'Pune New', doj: '2026-09-01', category: 'PUNE_STAFF', rate: { payBasis: 'MONTHLY_GROSS_PRORATED', monthlyGross: 21000 } }));
  const pp = pays(env, 'PAYROLL_RATE_PROFILE', 'PX9')[0];
  assert.deepEqual([pp.MONTHLY_GROSS_INR, pp.RATE_AMOUNT_INR, pp.OT_METHOD], [21000, '', 'MONTHLY_GROSS_DIV_WORKING_DAYS_DIV_8_X_OT_HOURS']);
  assert.throws(() => env.c.empSave({ mode: 'ADD', empId: 'CX8', name: 'x', doj: '2026-09-01', category: 'CONSULTANT', rate: { payBasis: 'MONTHLY_GROSS_PRORATED', monthlyGross: 0 } }), /Monthly gross/);
});

test('update: name change adds no pay row; a salary revision is a NEW effective-dated row, older rows stay untouched', () => {
  const env = world();
  const old = JSON.stringify(pays(env, 'SALARY_STRUCTURE', 'S1'));
  const u = plain(env.c.empSave({ mode: 'UPDATE', empId: 'S1', name: 'Renamed Staff', email: 'r@x.com', category: 'STAFF', department: 'Accounts' }));
  assert.deepEqual(u.changed.sort(), ['DEPARTMENT', 'EMAIL_ID', 'EMPLOYEE_NAME']);
  assert.equal(u.salary, null);
  assert.equal(JSON.stringify(pays(env, 'SALARY_STRUCTURE', 'S1')), old);
  assert.equal(master(env, 'S1')[0].EMPLOYEE_NAME, 'Renamed Staff');
  // revision needs an effective month
  const rev = (o) => Object.assign({ mode: 'UPDATE', empId: 'S1', name: 'Renamed Staff', category: 'STAFF', effectiveMonth: '2026-10', salary: Object.assign({}, SAL, { BASIC: 14000 }) }, o);
  assert.throws(() => env.c.empSave(rev({ effectiveMonth: '' })), /effective month/i);
  assert.throws(() => env.c.empSave(rev({ effectiveMonth: '2026-08' })), /MIN_PERIOD/);
  assert.throws(() => env.c.empSave(rev({ effectiveMonth: '2026-8' })), /YYYY-MM/);
  const r = plain(env.c.empSave(rev()));
  assert.equal(r.salary.added, true);
  const rows = pays(env, 'SALARY_STRUCTURE', 'S1');
  assert.equal(rows.length, 2);
  assert.equal(JSON.stringify(rows[0]), JSON.stringify(JSON.parse(old)[0]), 'the older row is byte-identical');
  assert.deepEqual([rows[1].EFFECTIVE_FROM, rows[1].VERSION_STATE, rows[1].HR_APPROVED_BY, rows[1].BASIC_PM_INR], ['2026-10-01', 'PENDING', '', 14000]);
  assert.equal(master(env, 'S1')[0].VALIDATION_STATE, 'PENDING_HR_APPROVAL');
  // same month twice is refused; identical numbers are not a revision
  assert.throws(() => env.c.empSave(rev()), /already exists/);
  const same = plain(env.c.empSave({ mode: 'UPDATE', empId: 'S1', name: 'Renamed Staff', category: 'STAFF', effectiveMonth: '2026-11', salary: Object.assign({}, SAL, { BASIC: 14000 }) }));
  assert.equal(same.salary.added, false);
  assert.equal(pays(env, 'SALARY_STRUCTURE', 'S1').length, 2);
  // engine effective dating: September still uses the old row, October the new one
  assert.equal(env.c.engine_pickSalary(env.rowsOf('SALARY_STRUCTURE'), '2026-09').S1.BASIC_PM_INR, 12600);
  assert.equal(env.c.engine_pickSalary(env.rowsOf('SALARY_STRUCTURE'), '2026-10').S1.BASIC_PM_INR, 14000);
  // a revision cannot start in a LOCKED period of the category
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'STAFF' }, { STATUS: 'LOCKED' });
  assert.throws(() => env.c.empSave(rev({ empId: 'S2', effectiveMonth: '2026-09' })), /LOCKED/);
  assert.throws(() => env.c.empSave({ mode: 'UPDATE', empId: 'NOPE', name: 'x', category: 'STAFF' }), /not in EMPLOYEE_MASTER/);
});

test('rate-profile revision is effective-dated too (engine_pickRate with a period)', () => {
  const env = world();
  env.addRows('PAYROLL_RATE_PROFILE', [{ EMP_ID: 'C1', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, VERSION_STATE: 'USER_APPROVED_JULY_PROXY' }]);
  plain(env.c.empSave({ mode: 'UPDATE', empId: 'C1', name: 'Consultant One', category: 'CONSULTANT', effectiveMonth: '2026-10', rate: { payBasis: 'DAILY_RATE', rate: 800 } }));
  const rows = env.rowsOf('PAYROLL_RATE_PROFILE');
  assert.equal(rows.length, 2);
  assert.equal(env.c.engine_pickRate(rows, '2026-09').C1.RATE_AMOUNT_INR, 700, 'legacy row (blank EFFECTIVE_FROM) governs earlier months');
  assert.equal(env.c.engine_pickRate(rows, '2026-10').C1.RATE_AMOUNT_INR, 800);
  assert.equal(env.c.engine_pickRate(rows).C1.RATE_AMOUNT_INR, 800, 'no period: last row wins (legacy behaviour)');
});

test('until HR approves, the new employee is HOLD SALARY_NOT_APPROVED (population not blocked); HR approval releases him', () => {
  const env = world();
  plain(env.c.empSave(addStaff()));
  plain(env.c.empSave(addStaff({ empId: 'S8', name: 'Second Joiner', doj: '2026-09-01' })));
  const entries = ['S1', 'S2', 'S8', 'S9'].map((empId) => ({ empId, days: 20 }));
  env.c.registerSubmit({ period: P, includesWO: {}, entries });
  env.c.approveAttendance(P, 'STAFF');
  const r = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(r.populations[0].held.sort(), ['S8', 'S9']);
  assert.equal(r.readiness.blocked, 0, 'per-employee hold, not a population blocker');
  const ex = env.rowsOf('PAYROLL_EXCEPTIONS').filter((e) => e.CODE === 'SALARY_NOT_APPROVED');
  assert.deepEqual(ex.map((e) => [e.EMP_ID, e.SEVERITY]).sort(), [['S8', 'HOLD'], ['S9', 'HOLD']]);
  assert.equal(typeof env.rowsOf('PAYROLL_DRAFT').find((x) => x.EMP_ID === 'S1').NET_PAY, 'number');
  assert.equal(env.rowsOf('PAYROLL_DRAFT').find((x) => x.EMP_ID === 'S9').NET_PAY, '');
  const rd = env.rowsOf('PAYROLL_READINESS').find((x) => x.POPULATION === 'STAFF' && x.CHECK === 'PAY_STRUCTURE_APPROVED');
  assert.equal(rd.STATUS, 'HOLD');
  assert.match(rd.DETAIL, /SALARY_NOT_APPROVED.*(S8, S9|S9, S8)/);
  assert.ok(!env.rowsOf('PAYROLL_READINESS').some((x) => x.POPULATION === 'STAFF' && x.CHECK === 'CALC_BLOCKERS' && /S9/.test(x.DETAIL)), 'covered by its own check');
  assert.equal(env.c.hrApprove(P, 'STAFF').ok, true, 'the rest of the population is approvable');
  // HR lists and stamps the pending rows
  const plan = plain(env.c.planSalaryStructureApproval(P, 'STAFF'));
  assert.deepEqual(plan.toStamp.map((t) => [t.empId, t.effectiveFrom]).sort(), [['S8', '2026-09-01'], ['S9', '2026-09-01']]);
  env.user = ACC;
  assert.deepEqual(plain(env.c.approveSalaryStructure(P, 'STAFF')), { ok: false, reason: 'USER_NOT_HR_APPROVER' });
  env.user = HR;
  const a = plain(env.c.approveSalaryStructure(P, 'STAFF'));
  assert.equal(a.stamped, 2);
  assert.equal(pays(env, 'SALARY_STRUCTURE', 'S9')[0].HR_APPROVED_BY, HR);
  assert.equal(pays(env, 'SALARY_STRUCTURE', 'S9')[0].VERSION_STATE, 'APPROVED');
  assert.equal(master(env, 'S9')[0].VALIDATION_STATE, 'HR_APPROVED');
  assert.equal(master(env, 'S9')[0].HR_SIGNOFF_BY, HR);
  const r2 = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(r2.populations[0].held, [], 'released after approval');
  assert.equal(typeof env.rowsOf('PAYROLL_DRAFT').find((x) => x.EMP_ID === 'S9').NET_PAY, 'number');
  // a revision effective from October is approved by running the approval for that period
  plain(env.c.empSave({ mode: 'UPDATE', empId: 'S9', name: 'New Joiner', category: 'STAFF', effectiveMonth: '2026-10', salary: Object.assign({}, SAL, { BASIC: 20000 }) }));
  assert.equal(plain(env.c.approveSalaryStructure(P, 'STAFF')).stamped, 0, 'a future-dated version is not approved by accident');
  assert.equal(plain(env.c.approveSalaryStructure('2026-10', 'STAFF')).stamped, 1);
});

test('with NO approved row in the population the initial sign-off is missing: population-level BLOCKER (not per-employee holds)', () => {
  const env = world();
  env.sheets.SALARY_STRUCTURE.data.slice(1).forEach((row) => { row[env.sheets.SALARY_STRUCTURE.data[0].indexOf('HR_APPROVED_BY')] = ''; });
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S1', days: 20 }, { empId: 'S2', days: 20 }] });
  env.c.approveAttendance(P, 'STAFF');
  const r = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.ok(r.readiness.blocked >= 1);
  assert.equal(env.rowsOf('PAYROLL_READINESS').find((x) => x.CHECK === 'PAY_STRUCTURE_APPROVED' && x.POPULATION === 'STAFF').STATUS, 'BLOCKED');
  assert.ok(!env.rowsOf('PAYROLL_EXCEPTIONS').some((e) => e.CODE === 'SALARY_NOT_APPROVED'));
  assert.equal(env.c.hrApprove(P, 'STAFF').ok, false);
  assert.equal(plain(env.c.approveSalaryStructure(P, 'STAFF')).stamped, 2);
  assert.equal(env.rowsOf('PAYROLL_READINESS').length > 0, true);
});

test('exit: LAST_WORKING_DAY + Non-Active; roster keeps the employee up to that month, engine pays the entered days, no auto proration', () => {
  const env = world();
  assert.throws(() => env.c.empMarkExit('NOPE', '2026-09-15'), /not in EMPLOYEE_MASTER/);
  assert.throws(() => env.c.empMarkExit('S2', 'soon'), /real date/);
  assert.throws(() => env.c.empMarkExit('S2', '2019-12-31'), /before the date of joining/);
  env.user = 'stranger@x.com';
  assert.throws(() => env.c.empMarkExit('S2', '2026-09-15'), /Not allowed/);
  env.user = HR;
  const r = plain(env.c.empMarkExit('S2', '2026-09-15'));
  assert.deepEqual([r.status, r.lastWorkingDay, r.onRosterThrough, r.rosterRefresh.ok], ['Non-Active', '2026-09-15', '2026-09', true]);
  const m = master(env, 'S2')[0];
  assert.deepEqual([m.STATUS_AS_SOURCE, m.LAST_WORKING_DAY], ['Non-Active', '2026-09-15']);
  assert.ok(env.c.buildRoster(P).some((e) => e.EMP_ID === 'S2' && e.LEAVER === true), 'still on the September roster');
  assert.ok(!env.c.buildRoster('2026-10').some((e) => e.EMP_ID === 'S2'), 'not on the October roster');
  // daily-form roster: still listed while he works his notice, gone after the last working day
  assert.ok(env.c.buildRoster(undefined, { asOf: '2026-09-15' }).some((e) => e.EMP_ID === 'S2'));
  assert.ok(!env.c.buildRoster(undefined, { asOf: '2026-09-16' }).some((e) => e.EMP_ID === 'S2'));
  assert.ok(!env.c.buildRoster().some((e) => e.EMP_ID === 'S2'));
  // days worked are entered in the register; the engine flags him as a leaver and pays exactly the entered days
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S1', days: 22 }, { empId: 'S2', days: 9 }] });
  env.c.approveAttendance(P, 'STAFF');
  plain(env.c.calculateDraft(P, 'STAFF'));
  const d2 = env.rowsOf('PAYROLL_DRAFT').find((x) => x.EMP_ID === 'S2');
  assert.equal(d2.PRESENT_DAYS, 9);
  assert.ok(/LEAVER_IN_PERIOD/.test(d2.FLAGS));
  assert.equal(typeof d2.NET_PAY, 'number');
  // the date can be corrected; a still-Active duplicate would be refused
  assert.equal(plain(env.c.empMarkExit('S2', '2026-09-20')).previousLastWorkingDay, '2026-09-15');
  assert.match(env.rowsOf('AUDIT_LOG').map((a) => a.Message).join('\n'), /EMPLOYEE_EXIT.*S2/);
});

test('dialog: the modal opens for HR only and carries no employee data; lookup reports only whether IDs are on file', () => {
  const env = world();
  plain(env.c.empSave(addStaff()));
  env.user = 'stranger@x.com';
  assert.throws(() => env.c.empOpenDialog('ADD'), /Not allowed/);
  env.user = HR;
  env.c.empOpenDialog('EXIT');
  assert.equal(env.dialogs.length, 1);
  assert.equal(env.dialogs[0].title, 'Mark employee exit');
  const html = env.dialogs[0].out.html;
  assert.match(html, /window\.EMP_START_MODE="EXIT"/);
  assert.match(html, /Statutory IDs/);
  assert.doesNotMatch(html, /New Joiner|S9|password/i);
  const lk = plain(env.c.empApiLookup('S9'));
  assert.equal(lk.exists, true);
  assert.equal(lk.name, 'New Joiner');
  assert.deepEqual(Object.assign({}, lk.idsOnFile), { UAN: true, ESI_NO: true, PAN: true, BANK_NAME: true, BANK_ACCOUNT: true, IFSC: true });
  assert.equal(lk.pay.kind, 'SALARY');
  assert.equal(lk.pay.approved, false);
  assert.equal(lk.pay.values.BASIC, 12600);
  SECRETS.forEach((secret) => assert.ok(!JSON.stringify(lk).includes(secret)));
  const cfg = plain(env.c.empApiLoad());
  assert.deepEqual(cfg.categories.map((x) => x.code), ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF']);
  assert.equal(plain(env.c.empApiLookup('NOPE')).exists, false);
  // partial ID update keeps the other fields
  plain(env.c.empSave({ mode: 'UPDATE', empId: 'S9', name: 'New Joiner', category: 'STAFF', ids: { pan: 'ZZZZZ9999Z' } }));
  const row = env.rowsOf('EMPLOYEE_STATUTORY_IDS').find((x) => x.EMP_ID === 'S9');
  assert.deepEqual([row.PAN, row.UAN, row.IFSC], ['ZZZZZ9999Z', SEC.uan, SEC.ifsc]);
  assert.equal(env.rowsOf('EMPLOYEE_STATUTORY_IDS').length, 1);
});
