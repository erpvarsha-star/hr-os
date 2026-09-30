'use strict';
// Supplementary (top-up) run for employees held in a locked run: draft -> HR -> Accounts -> lock under a new LOCK_ID.
const test = require('node:test');
const assert = require('node:assert/strict');
const { plain } = require('./load');
const { P, HR, ACC, fullWorld } = require('./regenv');

const staffSal = (id, approved = true) => ({ EMP_ID: id, PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: '2026-08-01', BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890,
  EDUCATION_PM_INR: 1890, MEDICAL_PM_INR: 1890, PRO_DEV_PM_INR: 945, COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260, WASHING_PM_INR: 2835,
  FIXED_GROSS_PM_AS_SOURCE_INR: 31500, HR_APPROVED_BY: approved ? 'hr@x' : '' });

/** STAFF S1..S4. S3 has no register entry (MISSING_ATTENDANCE), S4's salary row is unsigned (SALARY_NOT_APPROVED). Locked as LOCK-1. */
function lockedWorld() {
  const env = fullWorld({ master: ['S3', 'S4'].map((id) => ({ EMP_ID: id, EMPLOYEE_NAME: 'Staff ' + id, PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'D', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/01/2020' })) });
  env.put('SALARY_STRUCTURE', plain(env.c.HROS_SALARY_STRUCTURE_HEADERS), env.rowsOf('SALARY_STRUCTURE'));
  const sal = env.sheets.SALARY_STRUCTURE;
  [staffSal('S3'), staffSal('S4', false)].forEach((r) => sal.data.push(sal.data[0].map((h) => (r[h] === undefined ? '' : r[h]))));
  env.put('PAYROLL_LOCKED', ['LOCK_ID'].concat(plain(env.c.OUTPUT_COLUMNS)), []);
  env.put('PAYROLL_SUPPLEMENTARY', plain(env.c.HROS_SUPPLEMENTARY_HEADERS), []);
  env.put('PAYROLL_DRAFT', plain(env.c.OUTPUT_COLUMNS), []);
  env.user = HR;
  env.c.registerSubmit({ period: P, includesWO: {}, entries: ['S1', 'S2', 'S4'].map((empId) => ({ empId, days: 20 })) });
  env.c.approveAttendance(P, 'STAFF');
  const r = plain(env.c.calculateDraft(P, 'STAFF'));
  assert.deepEqual(r.populations[0].held.sort(), ['S3', 'S4']);
  assert.equal(env.c.hrApprove(P, 'STAFF').ok, true);
  env.user = ACC;
  assert.equal(env.c.accountsApprove(P, 'STAFF').ok, true);
  const lk = plain(env.c.lockPeriod(P, 'STAFF'));
  assert.equal(lk.ok, true);
  assert.deepEqual(lk.held.map((h) => h.EMP_ID).sort(), ['S3', 'S4']);
  env.mainLock = lk.lockId;
  env.user = HR;
  return env;
}
const supp = (env) => env.rowsOf('PAYROLL_SUPPLEMENTARY');
const lockedIds = (env, lockId) => env.rowsOf('PAYROLL_LOCKED').filter((r) => r.LOCK_ID === lockId).map((r) => r.EMP_ID).sort();

test('pure: candidates = held in the locked run and not locked; partition by the fresh calculation', () => {
  const env = lockedWorld();
  const c = env.c;
  const draft = env.rowsOf('PAYROLL_DRAFT'), locked = env.rowsOf('PAYROLL_LOCKED');
  assert.deepEqual(plain(c.suppCandidates(draft, locked, P, 'STAFF')), ['S3', 'S4']);
  assert.deepEqual(plain(c.suppCandidates(draft, locked.concat([{ PERIOD: P, POPULATION: 'STAFF', EMP_ID: 'S3' }]), P, 'STAFF')), ['S4']);
  assert.deepEqual(plain(c.suppCandidates(draft, locked, P, 'PERMANENT_WORKER')), []);
  assert.deepEqual(plain(c.suppCandidates(draft.concat([{ PERIOD: P, POPULATION: 'STAFF', EMP_ID: 'S7', RUN_ID: 'SUPP-x', FLAGS: 'HOLD;X' }]), locked, P, 'STAFF')), ['S3', 'S4'], 'supplementary draft rows are ignored');
  const res = [{ row: { EMP_ID: 'S3', NET_PAY: 100 }, exceptions: [], held: false }, { row: { EMP_ID: 'S4', NET_PAY: null }, exceptions: [{ severity: 'HOLD', code: 'X' }], held: true }];
  assert.deepEqual(plain(c.suppPartition(['S3', 'S4', 'S5'], res)), { released: ['S3'], stillHeld: [{ empId: 'S4', codes: ['X'] }, { empId: 'S5', codes: ['NOT_ON_ROSTER'] }] });
  assert.match(c.suppLockIdFor(P, 'STAFF', new Date(2026, 9, 3, 10, 5), []), /^LOCK-2026-09-STAFF-202610031005-SUPP$/);
  assert.match(c.suppLockIdFor(P, 'STAFF', new Date(2026, 9, 3, 10, 5), ['LOCK-2026-09-STAFF-202610031005-SUPP']), /-SUPP2$/);
  assert.equal(c.engine_runType_('SUPP-2026-09-STAFF-1'), 'SUPPLEMENTARY');
  assert.equal(c.engine_runType_('RUN-2026-09-STAFF-1'), 'NORMAL');
});

test('full flow: held employees are fixed after the lock, released, approved by HR then Accounts, locked under a new LOCK_ID', () => {
  const env = lockedWorld();
  const c = env.c;
  const mainRowsBefore = JSON.stringify(env.rowsOf('PAYROLL_LOCKED'));
  // nothing released yet
  const none = plain(c.supplementaryRun(P, 'STAFF'));
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'NO_RELEASED_EMPLOYEES');
  assert.deepEqual(none.stillHeld.map((h) => h.empId).sort(), ['S3', 'S4']);
  assert.equal(supp(env).length, 0);
  // the locked population still freezes the locked employees ...
  const reg = plain(c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S1', days: 5 }, { empId: 'S3', days: 18 }] }));
  assert.deepEqual(reg.skippedLocked, ['S1']);
  assert.equal(reg.created, 1, '... but a held employee can still be entered');
  const ap = plain(c.approveAttendance(P, 'STAFF'));
  assert.equal(ap.approved, 1, 'only the held-and-unlocked employee is approved');
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((r) => r.EMP_ID === 'S3').APPROVAL_STATUS, 'APPROVED');
  // S4: HR signs the pending salary row
  assert.equal(plain(c.approveSalaryStructure(P, 'STAFF')).stamped, 1);
  // partial release is possible: fix S3 only first? both fixed here
  const run = plain(c.supplementaryRun(P, 'STAFF'));
  assert.equal(run.ok, true);
  assert.deepEqual(run.empIds, ['S3', 'S4']);
  assert.match(run.suppId, /^SUPP-2026-09-STAFF-\d{14}$/);
  assert.deepEqual(run.stillHeld, []);
  // the SUPPLEMENTARY draft: rows in PAYROLL_DRAFT with the SUPP run id; the normal run rows are untouched
  const drows = env.rowsOf('PAYROLL_DRAFT');
  assert.equal(drows.filter((r) => r.RUN_ID === run.suppId).length, 2);
  assert.ok(drows.filter((r) => r.RUN_ID === run.suppId).every((r) => typeof r.NET_PAY === 'number' && !/HOLD/.test(r.FLAGS)));
  assert.equal(drows.filter((r) => c.engine_runType_(r.RUN_ID) === 'NORMAL').length, 4);
  const s = supp(env);
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].PERIOD, s[0].POPULATION, s[0].SUPP_ID, s[0].EMP_IDS, s[0].STATUS, s[0].LOCK_ID], [P, 'STAFF', run.suppId, 'S3,S4', 'DRAFT', '']);
  assert.match(s[0].HASH, /^[0-9a-f]{64}$/);
  // approvals: order and identity are enforced
  env.user = ACC;
  assert.equal(c.supplementaryAccountsApprove(P, 'STAFF').reason, 'STATUS_NOT_HR_APPROVED');
  assert.equal(c.supplementaryLock(P, 'STAFF').reason, 'STATUS_NOT_ACCOUNTS_APPROVED');
  assert.equal(c.supplementaryHrApprove(P, 'STAFF').reason, 'USER_NOT_HR_APPROVER');
  env.user = HR;
  assert.equal(plain(c.supplementaryHrApprove(P, 'STAFF')).status, 'HR_APPROVED');
  assert.equal(supp(env)[0].HR_APPROVED_BY, HR);
  assert.equal(c.supplementaryAccountsApprove(P, 'STAFF').reason, 'USER_NOT_ACCOUNTS_APPROVER');
  // an input change after the HR approval resets the set (its own hash); Accounts cannot approve the stale set
  env.addRows('INPUT_CANTEEN', [{ PAYROLL_MONTH: P, EMP_ID: 'S3', AMOUNT_INR: 250, SOURCE: 'HR_MANUAL', SOURCE_REF: 'x', KEY: P + '|S3', STATUS: 'VALID', ENTERED_AT: '2026-10-02T10:00:00' }]);
  env.user = ACC;
  const stale = plain(c.supplementaryAccountsApprove(P, 'STAFF'));
  assert.equal(stale.reason, 'INPUTS_OR_DRAFT_CHANGED');
  assert.equal(supp(env)[0].STATUS, 'DRAFT');
  assert.equal(supp(env)[0].HR_APPROVED_BY, '');
  // run the top-up again: the old set is superseded, a new SUPP_ID is written
  env.user = HR;
  const run2 = plain(c.supplementaryRun(P, 'STAFF'));
  assert.equal(run2.ok, true);
  assert.deepEqual(run2.superseded, [run.suppId]);
  assert.deepEqual(supp(env).map((r) => r.STATUS), ['SUPERSEDED', 'DRAFT']);
  assert.equal(plain(c.supplementaryHrApprove(P, 'STAFF')).status, 'HR_APPROVED');
  env.user = ACC;
  assert.equal(plain(c.supplementaryAccountsApprove(P, 'STAFF')).status, 'ACCOUNTS_APPROVED');
  assert.equal(supp(env)[1].ACCOUNTS_APPROVED_BY, ACC);
  env.user = 'stranger@x.com';
  assert.equal(c.supplementaryLock(P, 'STAFF').reason, 'USER_NOT_ACCOUNTS_APPROVER_OR_OWNER');
  env.user = ACC;
  const lk = plain(c.supplementaryLock(P, 'STAFF'));
  assert.equal(lk.ok, true, JSON.stringify(lk));
  assert.match(lk.lockId, /-SUPP$/);
  assert.notEqual(lk.lockId, env.mainLock);
  assert.deepEqual(lockedIds(env, lk.lockId), ['S3', 'S4']);
  assert.deepEqual(lockedIds(env, env.mainLock), ['S1', 'S2']);
  assert.equal(JSON.stringify(env.rowsOf('PAYROLL_LOCKED').filter((r) => r.LOCK_ID === env.mainLock)), JSON.stringify(JSON.parse(mainRowsBefore)));
  assert.deepEqual([supp(env)[1].STATUS, supp(env)[1].LOCK_ID], ['LOCKED', lk.lockId]);
  assert.equal(env.rowsOf('PAYROLL_PERIOD_CATEGORY').find((r) => r.PAYROLL_CATEGORY === 'STAFF').LOCK_ID, env.mainLock, 'the population keeps its main LOCK_ID');
  // nothing left to top up; never re-lock an EMP_ID
  assert.equal(plain(c.supplementaryRun(P, 'STAFF')).reason, 'NO_HELD_EMPLOYEES');
  assert.equal(c.supplementaryLock(P, 'STAFF').reason, 'NO_OPEN_SUPPLEMENTARY');
  env.addRows('PAYROLL_SUPPLEMENTARY', [{ PERIOD: P, POPULATION: 'STAFF', SUPP_ID: 'SUPP-X', EMP_IDS: 'S3', HASH: 'h', STATUS: 'ACCOUNTS_APPROVED' }]);
  const again = plain(c.supplementaryLock(P, 'STAFF'));
  assert.equal(again.reason, 'EMP_ALREADY_LOCKED');
  assert.deepEqual(again.alreadyLocked, ['S3']);
  assert.equal(env.rowsOf('PAYROLL_LOCKED').length, 4);
  env.user = HR;
  assert.equal(c.supplementaryHrApprove(P, 'STAFF').reason, 'EMP_ALREADY_LOCKED');
  assert.match(env.rowsOf('AUDIT_LOG').map((a) => a.Message).join('\n'), /SUPP_LOCK.*LOCKED/);
});

test('payslips and emails work per LOCK_ID; a supplementary lock only covers its own employees', () => {
  const env = lockedWorld();
  const c = env.c;
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S3', days: 18 }] });
  c.approveAttendance(P, 'STAFF');
  c.approveSalaryStructure(P, 'STAFF');
  assert.equal(plain(c.supplementaryRun(P, 'STAFF')).ok, true);
  c.supplementaryHrApprove(P, 'STAFF');
  env.user = ACC;
  c.supplementaryAccountsApprove(P, 'STAFF');
  const lk = plain(c.supplementaryLock(P, 'STAFF'));
  env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [{ KEY: 'PAYSLIP_FOLDER_ID', VALUE: 'F' }]);
  const main = c.payslipPreflight_(P, 'STAFF', env.mainLock);
  const top = c.payslipPreflight_(P, 'STAFF', lk.lockId);
  assert.deepEqual(plain(main.lockedRows.map((r) => r.EMP_ID)).sort(), ['S1', 'S2']);
  assert.deepEqual(plain(top.lockedRows.map((r) => r.EMP_ID)).sort(), ['S3', 'S4']);
  env.put('PAYSLIP_REGISTER', plain(c.HROS_PAYSLIP_REGISTER_HEADERS), ['S1', 'S3'].map((id, i) => ({ LOCK_ID: i ? lk.lockId : env.mainLock, PERIOD: P, EMP_ID: id, POPULATION: 'STAFF', PDF_ID: 'p' + id, STATUS: 'GENERATED' })));
  env.put('PAYSLIP_EMAIL_LOG', plain(c.HROS_EMAIL_LOG_HEADERS), []);
  const q = plain(c.queuePayslipEmails(P, 'STAFF', lk.lockId));
  assert.equal(q.lockId, lk.lockId);
  assert.deepEqual(env.rowsOf('PAYSLIP_EMAIL_LOG').map((r) => [r.LOCK_ID, r.EMP_ID]), [[lk.lockId, 'S3']]);
});
