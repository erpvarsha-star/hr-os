'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs, plain } = require('./load');

// ---------------------------------------------------------------- fake Sheets / Session
const pad = (n, w = 2) => String(n).padStart(w, '0');
function formatDate(d, tz, fmt) {
  const map = { yyyy: pad(d.getFullYear(), 4), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()),
    mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}
const blank = (v) => v === '' || v == null;

function makeSheet(name) {
  const s = { name, data: [], formats: [], protections: [] };
  s.getName = () => name;
  s.getLastRow = () => { for (let r = s.data.length; r >= 1; r--) if ((s.data[r - 1] || []).some((v) => !blank(v))) return r; return 0; };
  s.getLastColumn = () => { let m = 0; s.data.forEach((row) => row.forEach((v, i) => { if (!blank(v)) m = Math.max(m, i + 1); })); return m; };
  s.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
    setValues: (vals) => { assert.equal(vals.length, nr); vals.forEach((row, i) => { assert.equal(row.length, nc); while (s.data.length < r + i) s.data.push([]); row.forEach((v, j) => { s.data[r - 1 + i][c - 1 + j] = v; }); }); },
    setNumberFormat: (f) => { s.formats.push({ r, c, nr, nc, f }); },
    clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.data[r - 1 + i]) s.data[r - 1 + i][c - 1 + j] = ''; },
  });
  s.protect = () => { const p = { desc: '', editors: [], setDescription(d) { p.desc = d; return p; }, addEditor(u) { p.editors.push(u); return p; },
    getEditors: () => p.editors, removeEditor() { return p; }, canDomainEdit: () => false, setDomainEdit() { return p; }, setWarningOnly(v) { p.warningOnly = v; return p; } };
    s.protections.push(p); return p; };
  s.getProtections = () => s.protections;
  s.objs = () => { const h = s.data[0] || []; return s.data.slice(1).filter((row) => row.some((v) => !blank(v))).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] === undefined ? '' : row[i]]))); };
  return s;
}

function makeWorld() {
  const sheets = {};
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet(n)), getOwner: () => ({ getEmail: () => world.owner }) };
  const world = { sheets, ss, owner: 'owner@varshaforgings.com', user: 'nobody@x.com',
    put: (name, headers, rows = []) => { const s = makeSheet(name); s.data = [headers.slice()].concat(rows.map((r) => headers.map((h) => (h in r ? r[h] : '')))); sheets[name] = s; return s; } };
  return world;
}

const per = (v) => String(v).slice(0, 7);
const stubs = {
  sumOtHours: (rows, period) => { const m = {}; rows.forEach((r) => { if (per(r.PAYROLL_MONTH) === period && r.ELIGIBILITY !== 'EXCEPTION') m[r.EMP_ID] = (m[r.EMP_ID] || 0) + Number(r.OT_HOURS); }); return m; },
  canteenByEmp: (rows, period) => { const m = {}; rows.forEach((r) => { if (per(r.PAYROLL_MONTH) === period) m[r.EMP_ID] = Number(r.AMOUNT_INR); }); return m; },
  efficiencyByEmp: (rows, period, ids) => { const m = {}; rows.forEach((r) => { if (per(r.PAYROLL_MONTH) === period && ids.includes(r.EMP_ID)) m[r.EMP_ID] = Number(r.EFFICIENCY_PCT); }); return m; },
  advanceByEmp: (rows, period) => { const m = {}; rows.forEach((r) => { if (per(r.PAYROLL_MONTH) === period && r.APPROVAL_STATUS === 'APPROVED') m[r.EMP_ID] = (m[r.EMP_ID] || 0) + Number(r.RECOVERY_THIS_MONTH_INR); }); return m; },
  societyByEmp: (rows, period) => { const m = {}; rows.forEach((r) => { if (per(r.PAYROLL_MONTH) === period && r.APPROVAL_STATUS === 'APPROVED') m[r.EMP_ID] = (m[r.EMP_ID] || 0) + Number(r.TOTAL_RECOVERY_INR); }); return m; },
};

function load(world) {
  const Utilities = {
    formatDate, getUuid: () => 'u', sleep() {},
    computeDigest: (alg, str) => Array.from(crypto.createHash('sha256').update(str, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
  };
  const me = () => ({ getEmail: () => (world ? world.user : '') });
  const SpreadsheetApp = { getActiveSpreadsheet: () => (world ? world.ss : null), openById: () => (world ? world.ss : null),
    getActive: () => (world ? world.ss : null), ProtectionType: { SHEET: 'SHEET' } };
  const Session = { getActiveUser: me, getEffectiveUser: me };
  return loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '10_Attendance.gs', '30_Calc.gs', '31_Readiness.gs', '32_Engine.gs',
    '40_Approval.gs', '41_Lock.gs'], Object.assign({ Utilities, SpreadsheetApp, Session }, stubs));
}

// ---------------------------------------------------------------- fixtures
const P = '2026-09';
const HR = 'hr@varshaforgings.com', ACC = 'accounts@varshaforgings.com';
const cfgKV = [
  ['PF_WAGE_CEILING', 15000], ['PF_EMPLOYEE_RATE', 0.12], ['PF_MAX_EMPLOYEE', 1800], ['ESI_EMPLOYEE_RATE', 0.0075],
  ['ESI_EXEMPT_ABOVE', 21000], ['ESI_EMPLOYER_RATE', 0.0325], ['WORKER_VDA_RATE', 103], ['WORKER_HEAT_RATE', 5.78],
  ['PT_SLABS', '[{"min":0,"max":7500,"pt":0},{"min":7500.01,"max":10000,"pt":175},{"min":10000.01,"max":null,"pt":200}]'],
  ['MLWF_EMPLOYEE_RATE', 25], ['PT_FEB_AMOUNT', 300], ['MLWF_MONTHS', '6,12'], ['STAFF_OT_MULTIPLIER', 2],
  ['WORKER_OT_MULTIPLIER', 2], ['STAFF_PF_WAGE_COMPONENTS', 'BASIC,CONVEYANCE,EDUCATION,MEDICAL'],
  ['STAFF_COMPONENT_PCTS', '{"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}'],
  ['EMPLOYER_PF_RATE_STAFF', 0.1301], ['EMPLOYER_PF_RATE_WORKER', 0.1301], ['BONUS_RATE_STAFF', 0.0833],
  ['GRATUITY_RATE_STAFF', 0.0483], ['BONUS_RATE_WORKER', 0.18], ['GRATUITY_RATE_WORKER', 0.0481],
];
const statutoryRows = cfgKV.map(([KEY, VALUE]) => ({ KEY, VALUE, EFFECTIVE_FROM: '2026-09', EFFECTIVE_TO: '', VERSION: 1 }));
const staffSal = (fg) => ({ EMP_ID: 'E1', PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: '2026-09-01', EFFECTIVE_TO: '',
  BASIC_PM_INR: fg * 0.4, HRA_PM_INR: fg * 0.24, CONVEYANCE_PM_INR: fg * 0.06, EDUCATION_PM_INR: fg * 0.06, MEDICAL_PM_INR: fg * 0.06,
  PRO_DEV_PM_INR: fg * 0.03, COMMUNICATION_PM_INR: fg * 0.02, UNIFORM_PM_INR: fg * 0.04, WASHING_PM_INR: fg * 0.09,
  FIXED_GROSS_PM_AS_SOURCE_INR: fg });
const HDR = {
  MASTER: ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DEPARTMENT', 'DESIGNATION', 'DOJ_AS_SOURCE'],
  PC: ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE', 'DRAFT_RUN_ID', 'DRAFT_HASH',
    'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'],
  ATT: ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH',
    'EL_AVAILED', 'CL_AVAILED', 'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS', 'APPROVAL_STATUS', 'HR_OVERRIDE', 'OVERRIDE_REASON'],
  SAL: ['EMP_ID', 'PAYROLL_CATEGORY', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'BASIC_PM_INR', 'HRA_PM_INR', 'CONVEYANCE_PM_INR', 'EDUCATION_PM_INR',
    'MEDICAL_PM_INR', 'PRO_DEV_PM_INR', 'COMMUNICATION_PM_INR', 'UNIFORM_PM_INR', 'WASHING_PM_INR', 'FIXED_GROSS_PM_AS_SOURCE_INR'],
  RATE: ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR'],
  OT: ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'ELIGIBILITY'],
  ADJ: ['PAYROLL_MONTH', 'EMP_ID', 'ADJUSTMENT_TYPE', 'SIGNED_AMOUNT_INR', 'APPROVAL_STATUS'],
  FEED: ['PERIOD', 'FEED', 'STATUS'],
  STAT: ['KEY', 'VALUE', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'VERSION'],
  CTRL: ['KEY', 'VALUE'],
  AUDIT: ['Timestamp', 'Module', 'Status', 'User', 'Message'],
};

/** STAFF (E1) + CONSULTANT (C1) for 2026-09; STAFF is PENDING until calculateDraft. */
function seed(over = {}) {
  const w = makeWorld();
  w.put('PAYROLL_CONTROL', HDR.CTRL, [{ KEY: 'MIN_PERIOD', VALUE: '2026-09' }, { KEY: 'HR_APPROVER_EMAIL', VALUE: HR },
    { KEY: 'ACCOUNTS_APPROVER_EMAIL', VALUE: ACC }]);
  w.put('AUDIT_LOG', HDR.AUDIT);
  w.put('EMPLOYEE_MASTER', HDR.MASTER, [
    { EMP_ID: 'E1', EMPLOYEE_NAME: 'Staff One', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'HR', DESIGNATION: 'Exec', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'C1', EMPLOYEE_NAME: 'Cons One', PAYROLL_CATEGORY: 'CONSULTANT', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'QA', DESIGNATION: 'Insp', DOJ_AS_SOURCE: '01/01/2021' },
  ]);
  w.put('PAYROLL_PERIOD_CATEGORY', HDR.PC, ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((c) => ({ PAYROLL_MONTH: P, PAYROLL_CATEGORY: c, WORKING_DAYS: 26, STATUS: 'PENDING' }))
    .concat([{ PAYROLL_MONTH: '2026-10', PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 26, STATUS: 'PENDING' }]));
  const att = (id, cat, present, wo) => ({ PAYROLL_MONTH: P, EMP_ID: id, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26, PRESENT_DAYS: present,
    PHYSICAL_PRESENT_DAYS: present, WEEK_OFF: wo, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0,
    ABSENT_LWP_DAYS: 0, APPROVAL_STATUS: 'APPROVED', HR_OVERRIDE: 'N' });
  w.put('INPUT_ATTENDANCE', HDR.ATT, [att('E1', 'STAFF', 22, 4), att('C1', 'CONSULTANT', 20, 0)]);
  w.put('SALARY_STRUCTURE', HDR.SAL, [staffSal(31500)]);
  w.put('PAYROLL_RATE_PROFILE', HDR.RATE, [{ EMP_ID: 'C1', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, MONTHLY_GROSS_INR: 0 }]);
  w.put('INPUT_OT', HDR.OT, []);
  w.put('INPUT_ADJUSTMENTS', HDR.ADJ, []);
  w.put('FEED_STATUS', HDR.FEED, ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'EFFICIENCY'].map((FEED) => ({ PERIOD: P, FEED, STATUS: 'COMPLETE' })));
  w.put('STATUTORY_CONFIG', HDR.STAT, statutoryRows);
  w.put('EFFICIENCY_CONFIG', ['EFFICIENCY_PERCENT_EXACT', 'INCENTIVE_SLAB_INR', 'IMPLEMENTATION_STATE'], [{ EFFICIENCY_PERCENT_EXACT: 85, INCENTIVE_SLAB_INR: 8500, IMPLEMENTATION_STATE: 'PENDING' }]);
  Object.keys(over).forEach((k) => over[k](w));
  return w;
}

const rowsOf = (w, name) => (w.sheets[name] ? w.sheets[name].objs() : []);
const pcRow = (w, pop = 'STAFF', period = P) => rowsOf(w, 'PAYROLL_PERIOD_CATEGORY').find((r) => r.PAYROLL_CATEGORY === pop && r.PAYROLL_MONTH === period);
const auditText = (w) => rowsOf(w, 'AUDIT_LOG').map((r) => r.Message).join('\n');
/** world with STAFF calculated to DRAFT. */
function drafted(over) {
  const w = seed(over);
  const c = load(w);
  w.user = HR;
  c.calculateDraft(P, 'STAFF');
  assert.equal(pcRow(w).STATUS, 'DRAFT');
  return { w, c };
}

function toAccountsApproved(w, c) {
  w.user = HR; assert.equal(c.hrApprove(P, 'STAFF').ok, true);
  w.user = ACC; assert.equal(c.accountsApprove(P, 'STAFF').ok, true);
}

test('lockIdFor / buildLockRows pure', () => {
  const c = load(null);
  assert.equal(c.lockIdFor('2026-09', 'STAFF', new Date(2026, 9, 1, 14, 5)), 'LOCK-2026-09-STAFF-202610011405');
  const out = plain(c.buildLockRows([
    { PERIOD: '2026-09', POPULATION: 'STAFF', EMP_ID: 'E1', NET_PAY: 5, _row: 2 },
    { PERIOD: '2026-09', POPULATION: 'CONSULTANT', EMP_ID: 'C1' },
    { PERIOD: '2026-10', POPULATION: 'STAFF', EMP_ID: 'E1' },
  ], 'LK', '2026-09', 'STAFF'));
  assert.equal(out.length, 1);
  assert.equal(out[0].LOCK_ID, 'LK');
  assert.equal(out[0].NET_PAY, 5);
  assert.equal(out[0].BONUS_PROVISION, '');
  assert.equal('_row' in out[0], false);
  assert.deepEqual(Object.keys(out[0]), ['LOCK_ID'].concat(plain(c.OUTPUT_COLUMNS)));
});

test('lockDecision pure rules', () => {
  const c = load(null);
  const ok = { status: 'ACCOUNTS_APPROVED', userEmail: ACC, accountsEmail: ACC, ownerEmail: 'o@x.com', storedHash: 'h', currentHash: 'h', draftSheetHash: 'h', draftRowCount: 1, existingLockedCount: 0 };
  const d = (o) => plain(c.lockDecision(Object.assign({}, ok, o)));
  assert.equal(d({}).ok, true);
  assert.equal(d({ userEmail: 'O@x.com' }).ok, true);
  assert.equal(d({ userEmail: HR }).ok, false);
  assert.equal(d({ status: 'HR_APPROVED' }).ok, false);
  assert.equal(d({ existingLockedCount: 2 }).reason, 'ALREADY_IN_PAYROLL_LOCKED');
  assert.equal(d({ currentHash: 'x' }).newStatus, 'DRAFT');
  assert.equal(d({ draftSheetHash: 'x' }).reason, 'INPUTS_OR_DRAFT_CHANGED');
});

test('lockPeriod happy path: PAYROLL_LOCKED = draft rows + LOCK_ID, STATUS LOCKED, sheet protected', () => {
  const { w, c } = drafted();
  toAccountsApproved(w, c);
  const draft = rowsOf(w, 'PAYROLL_DRAFT').filter((r) => r.POPULATION === 'STAFF');
  w.user = ACC;
  const r = plain(c.lockPeriod(P, 'STAFF'));
  assert.equal(r.ok, true);
  assert.match(r.lockId, /^LOCK-2026-09-STAFF-\d{12}$/);
  const locked = rowsOf(w, 'PAYROLL_LOCKED');
  assert.equal(locked.length, draft.length);
  assert.ok(locked.length > 0);
  locked.forEach((l, i) => {
    assert.equal(l.LOCK_ID, r.lockId);
    plain(c.OUTPUT_COLUMNS).forEach((col) => assert.equal(l[col], draft[i][col], col));
  });
  assert.deepEqual(w.sheets.PAYROLL_LOCKED.data[0], ['LOCK_ID'].concat(plain(c.OUTPUT_COLUMNS)));
  const pc = pcRow(w);
  assert.equal(pc.STATUS, 'LOCKED');
  assert.equal(pc.LOCK_ID, r.lockId);
  assert.ok(pc.LOCKED_AT);
  assert.equal(w.sheets.PAYROLL_LOCKED.protections.length, 1);
  assert.match(auditText(w), /LOCK/);
  // other populations/periods untouched
  assert.equal(pcRow(w, 'CONSULTANT').STATUS, 'PENDING');
  assert.equal(pcRow(w, 'STAFF', '2026-10').STATUS, 'PENDING');
});

test('lockPeriod: double lock refused; unlocked states refused; wrong runner refused', () => {
  const { w, c } = drafted();
  w.user = ACC;
  assert.equal(plain(c.lockPeriod(P, 'STAFF')).reason, 'STATUS_NOT_ACCOUNTS_APPROVED'); // DRAFT
  w.user = HR; c.hrApprove(P, 'STAFF');
  w.user = ACC;
  const r0 = plain(c.lockPeriod(P, 'STAFF'));
  assert.equal(r0.ok, false); // from HR_APPROVED
  assert.equal(r0.reason, 'STATUS_NOT_ACCOUNTS_APPROVED');
  assert.equal(w.sheets.PAYROLL_LOCKED, undefined, 'nothing written on refusal');
  c.accountsApprove(P, 'STAFF');
  w.user = HR;
  assert.equal(plain(c.lockPeriod(P, 'STAFF')).reason, 'USER_NOT_ACCOUNTS_APPROVER_OR_OWNER');
  w.user = w.owner; // owner may lock
  assert.equal(c.lockPeriod(P, 'STAFF').ok, true);
  const n = rowsOf(w, 'PAYROLL_LOCKED').length;
  w.user = ACC;
  const again = plain(c.lockPeriod(P, 'STAFF'));
  assert.equal(again.ok, false);
  assert.equal(rowsOf(w, 'PAYROLL_LOCKED').length, n);
  // even if status were forced back, PAYROLL_LOCKED is append-only
  w.sheets.PAYROLL_PERIOD_CATEGORY.data[1][3] = 'ACCOUNTS_APPROVED';
  assert.equal(plain(c.lockPeriod(P, 'STAFF')).reason, 'ALREADY_IN_PAYROLL_LOCKED');
  assert.equal(rowsOf(w, 'PAYROLL_LOCKED').length, n);
});

test('lockPeriod: changed input since approval -> reset to DRAFT, refused, nothing locked', () => {
  const { w, c } = drafted();
  toAccountsApproved(w, c);
  const h = w.sheets.INPUT_ATTENDANCE.data[0];
  w.sheets.INPUT_ATTENDANCE.data[1][h.indexOf('PRESENT_DAYS')] = 10;
  w.user = ACC;
  const r = plain(c.lockPeriod(P, 'STAFF'));
  assert.deepEqual([r.ok, r.status, r.reason], [false, 'DRAFT', 'INPUTS_OR_DRAFT_CHANGED']);
  assert.equal(pcRow(w).STATUS, 'DRAFT');
  assert.equal(rowsOf(w, 'PAYROLL_LOCKED').length, 0);
  assert.match(auditText(w), /STATUS_RESET/);
});

test('lockPeriod: tampered PAYROLL_DRAFT sheet (not matching stored hash) refused', () => {
  const { w, c } = drafted();
  toAccountsApproved(w, c);
  const s = w.sheets.PAYROLL_DRAFT, i = s.data[0].indexOf('NET_PAY');
  s.data[1][i] = 1;
  w.user = ACC;
  assert.equal(plain(c.lockPeriod(P, 'STAFF')).reason, 'INPUTS_OR_DRAFT_CHANGED');
  assert.equal(rowsOf(w, 'PAYROLL_LOCKED').length, 0);
});

test('after lock: calculateDraft throws, approveAttendance refuses, prepare skips, reopen refused', () => {
  const { w, c } = drafted();
  toAccountsApproved(w, c);
  w.user = ACC;
  assert.equal(c.lockPeriod(P, 'STAFF').ok, true);
  assert.throws(() => c.calculateDraft(P, 'STAFF'), /LOCKED/);
  assert.throws(() => c.approveAttendance(P, 'STAFF'), /LOCKED/);
  const prep = plain(c.prepareMonthlyAttendance(P));
  assert.ok(prep.lockedPopulations.includes('STAFF'));
  assert.ok(prep.skippedLocked >= 1);
  // reopen from LOCKED refused even for owner
  w.user = w.owner;
  const r = plain(c.reopenPeriod(P, 'STAFF'));
  assert.deepEqual([r.ok, r.reason], [false, 'LOCKED_CANNOT_REOPEN']);
  assert.equal(pcRow(w).STATUS, 'LOCKED');
  // approvals also refuse a locked population
  w.user = HR;
  assert.equal(plain(c.hrApprove(P, 'STAFF')).ok, false);
  // other populations can still be calculated
  assert.doesNotThrow(() => c.calculateDraft(P, 'CONSULTANT'));
  assert.equal(pcRow(w, 'CONSULTANT').STATUS, 'DRAFT');
});
