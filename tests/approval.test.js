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

// ---------------------------------------------------------------- pure
const base = { action: 'HR', status: 'DRAFT', userEmail: HR, approverEmail: HR, readinessRows: [{ STATUS: 'READY' }, { STATUS: 'WARN' }], storedHash: 'h', currentHash: 'h' };
const dec = (over) => plain(load(null).approvalDecision(Object.assign({}, base, over)));

test('approvalDecision: HR happy path, case-insensitive/trimmed email', () => {
  assert.deepEqual(dec({}), { ok: true, newStatus: 'HR_APPROVED', reason: 'OK' });
  assert.equal(dec({ userEmail: '  HR@VarshaForgings.com ' }).ok, true);
});

test('approvalDecision: refusals (user, empty user, status, blocked, no hash)', () => {
  assert.equal(dec({ userEmail: 'x@y.com' }).reason, 'USER_NOT_HR_APPROVER');
  assert.equal(dec({ userEmail: '' }).ok, false);
  assert.equal(dec({ userEmail: '' }).reason, 'USER_EMAIL_UNKNOWN');
  assert.equal(dec({ status: 'HR_APPROVED' }).ok, false);
  assert.equal(dec({ readinessRows: [{ STATUS: 'BLOCKED' }] }).ok, false);
  assert.equal(dec({ storedHash: '' }).ok, false);
});

test('approvalDecision: hash mismatch -> DRAFT / INPUTS_OR_DRAFT_CHANGED; accounts rules', () => {
  assert.deepEqual(dec({ currentHash: 'other' }), { ok: false, newStatus: 'DRAFT', reason: 'INPUTS_OR_DRAFT_CHANGED' });
  const acc = { action: 'ACCOUNTS', status: 'HR_APPROVED', userEmail: ACC, approverEmail: ACC };
  assert.deepEqual(dec(acc), { ok: true, newStatus: 'ACCOUNTS_APPROVED', reason: 'OK' });
  assert.equal(dec(Object.assign({}, acc, { status: 'DRAFT' })).ok, false);
  assert.equal(dec(Object.assign({}, acc, { userEmail: HR })).ok, false);
  assert.equal(dec(Object.assign({}, acc, { currentHash: 'z' })).newStatus, 'DRAFT');
});

test('reopenDecision pure rules', () => {
  const c = load(null);
  assert.equal(c.reopenDecision('HR_APPROVED', 'O@x.com', 'o@x.com').ok, true);
  assert.equal(c.reopenDecision('ACCOUNTS_APPROVED', 'o@x.com', 'o@x.com').newStatus, 'DRAFT');
  assert.equal(c.reopenDecision('LOCKED', 'o@x.com', 'o@x.com').ok, false);
  assert.equal(c.reopenDecision('DRAFT', 'o@x.com', 'o@x.com').ok, false);
  assert.equal(c.reopenDecision('HR_APPROVED', 'z@x.com', 'o@x.com').reason, 'USER_NOT_OWNER');
});

// ---------------------------------------------------------------- integration
test('hrApprove happy path stamps HR + legacy columns, audits', () => {
  const { w, c } = drafted();
  const before = JSON.stringify(rowsOf(w, 'PAYROLL_DRAFT'));
  w.user = HR;
  const r = plain(c.hrApprove(P, 'STAFF'));
  assert.deepEqual([r.ok, r.status], [true, 'HR_APPROVED']);
  const pc = pcRow(w);
  assert.equal(pc.STATUS, 'HR_APPROVED');
  assert.equal(pc.HR_APPROVED_BY, HR);
  assert.ok(pc.HR_APPROVED_AT);
  assert.equal(pc.APPROVED_BY, HR);
  assert.match(auditText(w), /HR_APPROVE/);
  assert.equal(JSON.stringify(rowsOf(w, 'PAYROLL_DRAFT')), before, 'approval must not rewrite the draft');
});

test('hrApprove: wrong user refused, status unchanged, audited', () => {
  const { w, c } = drafted();
  w.user = ACC;
  const r = plain(c.hrApprove(P, 'STAFF'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'USER_NOT_HR_APPROVER');
  assert.equal(pcRow(w).STATUS, 'DRAFT');
  assert.match(auditText(w), /REFUSED/);
  w.user = '';
  assert.equal(plain(c.hrApprove(P, 'STAFF')).reason, 'USER_EMAIL_UNKNOWN');
});

test('hrApprove: BLOCKED readiness refused', () => {
  const { w, c } = drafted();
  // block by marking a required feed OPEN; feed status is not part of the draft hash, so hash still matches
  w.sheets.FEED_STATUS.data.forEach((row) => { if (row[1] === 'CANTEEN') row[2] = 'OPEN'; });
  w.user = HR;
  const r = plain(c.hrApprove(P, 'STAFF'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /^READINESS_BLOCKED/);
  assert.equal(pcRow(w).STATUS, 'DRAFT');
});

test('changed input after draft: HR approve refused; after HR approval both steps reset to DRAFT with audit', () => {
  const { w, c } = drafted();
  const editAtt = (v) => { const h = w.sheets.INPUT_ATTENDANCE.data[0]; const i = h.indexOf('PRESENT_DAYS'); w.sheets.INPUT_ATTENDANCE.data[1][i] = v; };
  editAtt(21);
  w.user = HR;
  let r = plain(c.hrApprove(P, 'STAFF'));
  assert.deepEqual([r.ok, r.status, r.reason], [false, 'DRAFT', 'INPUTS_OR_DRAFT_CHANGED']);
  // recalc, approve, then change input -> accounts approve resets
  c.calculateDraft(P, 'STAFF');
  assert.equal(c.hrApprove(P, 'STAFF').ok, true);
  editAtt(20);
  w.user = ACC;
  r = plain(c.accountsApprove(P, 'STAFF'));
  assert.deepEqual([r.ok, r.status, r.reason], [false, 'DRAFT', 'INPUTS_OR_DRAFT_CHANGED']);
  const pc = pcRow(w);
  assert.equal(pc.STATUS, 'DRAFT');
  assert.equal(pc.HR_APPROVED_BY, '');
  assert.equal(pc.APPROVED_BY, '');
  assert.match(auditText(w), /STATUS_RESET/);
  assert.match(auditText(w), /INPUTS_OR_DRAFT_CHANGED/);
});

test('accountsApprove: before HR refused; happy path after HR', () => {
  const { w, c } = drafted();
  w.user = ACC;
  let r = plain(c.accountsApprove(P, 'STAFF'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'STATUS_NOT_HR_APPROVED');
  w.user = HR;
  assert.equal(c.hrApprove(P, 'STAFF').ok, true);
  w.user = HR; // HR is not the accounts approver
  assert.equal(plain(c.accountsApprove(P, 'STAFF')).reason, 'USER_NOT_ACCOUNTS_APPROVER');
  w.user = ACC;
  r = plain(c.accountsApprove(P, 'STAFF'));
  assert.deepEqual([r.ok, r.status], [true, 'ACCOUNTS_APPROVED']);
  const pc = pcRow(w);
  assert.equal(pc.ACCOUNTS_APPROVED_BY, ACC);
  assert.equal(pc.APPROVED_BY, ACC);
  assert.equal(pc.HR_APPROVED_BY, HR);
});

test('reopenPeriod: owner only; clears stamps; other periods/populations untouched', () => {
  const { w, c } = drafted();
  w.user = HR; c.hrApprove(P, 'STAFF');
  w.user = HR;
  let r = plain(c.reopenPeriod(P, 'STAFF'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'USER_NOT_OWNER');
  assert.equal(pcRow(w).STATUS, 'HR_APPROVED');
  w.user = w.owner;
  r = plain(c.reopenPeriod(P, 'STAFF'));
  assert.deepEqual([r.ok, r.status], [true, 'DRAFT']);
  assert.equal(pcRow(w).HR_APPROVED_BY, '');
  assert.equal(pcRow(w).APPROVED_BY, '');
  assert.equal(pcRow(w, 'STAFF', '2026-10').STATUS, 'PENDING');
  assert.equal(pcRow(w, 'CONSULTANT').STATUS, 'PENDING');
  assert.match(auditText(w), /REOPEN/);
  assert.equal(plain(c.reopenPeriod(P, 'STAFF')).reason, 'STATUS_NOT_APPROVED'); // DRAFT
});

test('approval rejects periods below MIN_PERIOD and unknown populations', () => {
  const { c } = drafted();
  assert.throws(() => c.hrApprove('2026-08', 'STAFF'), /MIN_PERIOD|earlier/);
  assert.throws(() => c.accountsApprove(P, 'NOPE'), /Unknown population/);
});
