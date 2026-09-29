'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs, plain } = require('./load');

// ---------------------------------------------------------------- fake Sheets + feed stubs
const pad = (n, w = 2) => String(n).padStart(w, '0');
function formatDate(d, tz, fmt) {
  const map = { yyyy: pad(d.getFullYear(), 4), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()),
    mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}
const blank = (v) => v === '' || v == null;

function makeSheet(name) {
  const s = { name, data: [], formats: [] };
  s.getName = () => name;
  s.getLastRow = () => { for (let r = s.data.length; r >= 1; r--) if ((s.data[r - 1] || []).some((v) => !blank(v))) return r; return 0; };
  s.getLastColumn = () => { let m = 0; s.data.forEach((row) => row.forEach((v, i) => { if (!blank(v)) m = Math.max(m, i + 1); })); return m; };
  s.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
    setValues: (vals) => { assert.equal(vals.length, nr); vals.forEach((row, i) => { assert.equal(row.length, nc); while (s.data.length < r + i) s.data.push([]); row.forEach((v, j) => { s.data[r - 1 + i][c - 1 + j] = v; }); }); },
    setNumberFormat: (f) => { s.formats.push({ r, c, nr, nc, f }); },
    clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.data[r - 1 + i]) s.data[r - 1 + i][c - 1 + j] = ''; },
  });
  s.objs = () => { const h = s.data[0] || []; return s.data.slice(1).filter((row) => row.some((v) => !blank(v))).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] === undefined ? '' : row[i]]))); };
  return s;
}

function makeWorld() {
  const sheets = {};
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet(n)) };
  const put = (name, headers, rows = []) => { const s = makeSheet(name); s.data = [headers.slice()].concat(rows.map((r) => headers.map((h) => (h in r ? r[h] : '')))); sheets[name] = s; return s; };
  return { sheets, ss, put };
}

// feed stubs (real ones live in 20_Feeds.gs)
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
  const SpreadsheetApp = { getActiveSpreadsheet: () => (world ? world.ss : null), openById: () => (world ? world.ss : null) };
  return loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '10_Attendance.gs', '30_Calc.gs', '31_Readiness.gs', '32_Engine.gs'],
    Object.assign({ Utilities, SpreadsheetApp }, stubs));
}

// ---------------------------------------------------------------- fixtures
const P = '2026-09'; // 30 days
const OUT = plain(load(null).OUTPUT_COLUMNS);
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
const statutoryRows = cfgKV.map(([KEY, VALUE]) => ({ KEY, VALUE, EFFECTIVE_FROM: '2026-09', EFFECTIVE_TO: '', VERSION: 1, APPROVED_BY: 'accounts@x', APPROVED_AT: 't' }));
const staffSal = (fg, from, extra = {}) => Object.assign({ EMP_ID: 'E1', PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: from, EFFECTIVE_TO: '',
  BASIC_PM_INR: fg * 0.4, HRA_PM_INR: fg * 0.24, CONVEYANCE_PM_INR: fg * 0.06, EDUCATION_PM_INR: fg * 0.06, MEDICAL_PM_INR: fg * 0.06,
  PRO_DEV_PM_INR: fg * 0.03, COMMUNICATION_PM_INR: fg * 0.02, UNIFORM_PM_INR: fg * 0.04, WASHING_PM_INR: fg * 0.09,
  FIXED_GROSS_PM_AS_SOURCE_INR: fg, HR_APPROVED_BY: 'hr@x', HR_APPROVED_AT: 't' }, extra);

const HDR = {
  MASTER: ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DEPARTMENT', 'DESIGNATION', 'DOJ_AS_SOURCE'],
  PC: ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE', 'DRAFT_RUN_ID', 'DRAFT_HASH',
    'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'],
  ATT: ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH',
    'EL_AVAILED', 'CL_AVAILED', 'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS', 'APPROVAL_STATUS', 'HR_OVERRIDE', 'OVERRIDE_REASON'],
  SAL: ['EMP_ID', 'PAYROLL_CATEGORY', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'BASIC_PM_INR', 'HRA_PM_INR', 'CONVEYANCE_PM_INR', 'EDUCATION_PM_INR',
    'MEDICAL_PM_INR', 'PRO_DEV_PM_INR', 'COMMUNICATION_PM_INR', 'UNIFORM_PM_INR', 'WASHING_PM_INR', 'FIXED_GROSS_PM_AS_SOURCE_INR', 'HR_APPROVED_BY', 'HR_APPROVED_AT'],
  RATE: ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR'],
  OT: ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'ELIGIBILITY'],
  ADJ: ['PAYROLL_MONTH', 'EMP_ID', 'ADJUSTMENT_TYPE', 'SIGNED_AMOUNT_INR', 'APPROVAL_STATUS'],
  FEED: ['PERIOD', 'FEED', 'STATUS'],
  STAT: ['KEY', 'VALUE', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'VERSION', 'APPROVED_BY', 'APPROVED_AT'],
  CTRL: ['KEY', 'VALUE'],
  AUDIT: ['Timestamp', 'Module', 'Status', 'User', 'Message'],
};

function seed(over = {}) {
  const w = makeWorld();
  w.put('PAYROLL_CONTROL', HDR.CTRL, [{ KEY: 'MIN_PERIOD', VALUE: '2026-09' }]);
  w.put('AUDIT_LOG', HDR.AUDIT);
  w.put('EMPLOYEE_MASTER', HDR.MASTER, [
    { EMP_ID: 'E1', EMPLOYEE_NAME: 'Staff One', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'HR', DESIGNATION: 'Exec', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'C1', EMPLOYEE_NAME: 'Cons One', PAYROLL_CATEGORY: 'CONSULTANT', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'QA', DESIGNATION: 'Insp', DOJ_AS_SOURCE: '01/01/2021' },
    { EMP_ID: 'GONE', EMPLOYEE_NAME: 'Left', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Inactive', DEPARTMENT: '', DESIGNATION: '', DOJ_AS_SOURCE: '' },
  ]);
  w.put('PAYROLL_PERIOD_CATEGORY', HDR.PC, [
    { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 26, STATUS: 'PENDING' },
    { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'PERMANENT_WORKER', WORKING_DAYS: 26, STATUS: 'PENDING' },
    { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'CONSULTANT', WORKING_DAYS: 26, STATUS: 'HR_APPROVED', HR_APPROVED_BY: 'hr@x', HR_APPROVED_AT: 't', DRAFT_HASH: 'old' },
    { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'PUNE_STAFF', WORKING_DAYS: 26, STATUS: 'LOCKED' },
  ]);
  const att = (id, cat, present, wo) => ({ PAYROLL_MONTH: P, EMP_ID: id, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26, PRESENT_DAYS: present,
    PHYSICAL_PRESENT_DAYS: present, WEEK_OFF: wo, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0,
    ABSENT_LWP_DAYS: 0, APPROVAL_STATUS: 'APPROVED', HR_OVERRIDE: 'N' });
  w.put('INPUT_ATTENDANCE', HDR.ATT, [att('E1', 'STAFF', 22, 4), att('C1', 'CONSULTANT', 20, 0)]);
  w.put('SALARY_STRUCTURE', HDR.SAL, [staffSal(20000, '2026-08-01'), staffSal(31500, '2026-09-01'), staffSal(99999, '2026-10-01')]);
  w.put('PAYROLL_RATE_PROFILE', HDR.RATE, [{ EMP_ID: 'C1', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, MONTHLY_GROSS_INR: 0 }]);
  w.put('INPUT_OT', HDR.OT, [{ PAYROLL_MONTH: P, EMP_ID: 'C1', OT_HOURS: 2, ELIGIBILITY: 'VALID' }]);
  w.put('INPUT_ADJUSTMENTS', HDR.ADJ, [
    { PAYROLL_MONTH: P, EMP_ID: 'E1', ADJUSTMENT_TYPE: 'OTHER_DEDUCTION', SIGNED_AMOUNT_INR: 1000, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'E1', ADJUSTMENT_TYPE: 'ARREARS', SIGNED_AMOUNT_INR: 500, APPROVAL_STATUS: 'PENDING' },
  ]);
  w.put('FEED_STATUS', HDR.FEED, ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'EFFICIENCY', 'LEAVE'].map((FEED) => ({ PERIOD: P, FEED, STATUS: 'COMPLETE' })));
  w.put('STATUTORY_CONFIG', HDR.STAT, statutoryRows);
  w.put('EFFICIENCY_CONFIG', ['EFFICIENCY_PERCENT_EXACT', 'INCENTIVE_SLAB_INR', 'IMPLEMENTATION_STATE'], [{ EFFICIENCY_PERCENT_EXACT: 85, INCENTIVE_SLAB_INR: 8500, IMPLEMENTATION_STATE: 'PENDING' }]);
  Object.keys(over).forEach((k) => over[k](w));
  return w;
}

const rowsOf = (w, name) => w.sheets[name].objs();
const pcRow = (w, pop) => rowsOf(w, 'PAYROLL_PERIOD_CATEGORY').find((r) => r.PAYROLL_CATEGORY === pop);

// ---------------------------------------------------------------- pure tests
test('engine_pickSalary: effective-dated latest row <= period end, respects EFFECTIVE_TO', () => {
  const c = load(null);
  const rows = [
    { EMP_ID: 'A', EFFECTIVE_FROM: '2026-08-01', EFFECTIVE_TO: '', FIXED_GROSS_PM_AS_SOURCE_INR: 1 },
    { EMP_ID: 'A', EFFECTIVE_FROM: '2026-09-15', EFFECTIVE_TO: '', FIXED_GROSS_PM_AS_SOURCE_INR: 2 }, // starts inside the month -> latest <= end
    { EMP_ID: 'A', EFFECTIVE_FROM: '2026-10-01', EFFECTIVE_TO: '', FIXED_GROSS_PM_AS_SOURCE_INR: 3 }, // future
    { EMP_ID: 'B', EFFECTIVE_FROM: '2026-01', EFFECTIVE_TO: '2026-08', FIXED_GROSS_PM_AS_SOURCE_INR: 4 }, // ended before Sept
    { EMP_ID: 'C', EFFECTIVE_FROM: new Date(2026, 7, 1), EFFECTIVE_TO: new Date(2026, 8, 30), FIXED_GROSS_PM_AS_SOURCE_INR: 5 },
    { EMP_ID: 'D', EFFECTIVE_FROM: '', FIXED_GROSS_PM_AS_SOURCE_INR: 6 },
  ];
  const m = plain(c.engine_pickSalary(rows, P));
  assert.equal(m.A.FIXED_GROSS_PM_AS_SOURCE_INR, 2);
  assert.equal(m.B, undefined);
  assert.equal(m.C.FIXED_GROSS_PM_AS_SOURCE_INR, 5);
  assert.equal(m.D, undefined);
  assert.equal(plain(c.engine_pickSalary(rows, '2026-10')).A.FIXED_GROSS_PM_AS_SOURCE_INR, 3);
  assert.equal(plain(c.engine_pickSalary(rows, '2026-08')).A.FIXED_GROSS_PM_AS_SOURCE_INR, 1);
});

test('buildEngineContexts maps attendance, feeds, adjustments, salary/rate, efficiency', () => {
  const c = load(null);
  const att = { PAYROLL_MONTH: P, EMP_ID: 'W1', PRESENT_DAYS: 20, PHYSICAL_PRESENT_DAYS: 19, WEEK_OFF: 4, PH: 1, EL_AVAILED: 1, CL_AVAILED: 0,
    SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 2, APPROVAL_STATUS: 'APPROVED', WORKED_DAYS: 999 };
  const adj = [
    { PAYROLL_MONTH: P, EMP_ID: 'W1', ADJUSTMENT_TYPE: 'ARREARS', SIGNED_AMOUNT_INR: 300, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'W1', ADJUSTMENT_TYPE: 'PENALTY', SIGNED_AMOUNT_INR: 50, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'W1', ADJUSTMENT_TYPE: 'TDS', SIGNED_AMOUNT_INR: 9, APPROVAL_STATUS: 'PENDING' },
  ];
  const out = plain(c.buildEngineContexts({
    period: P, population: 'PERMANENT_WORKER', workingDays: 26,
    employees: [{ EMP_ID: 'W1', EMPLOYEE_NAME: 'Wally', DEPARTMENT: 'FRG', DESIGNATION: 'Op' }, { EMP_ID: 'W2', NAME: 'NoData' }],
    attendanceByEmp: { W1: att }, salaryByEmp: { W1: { BASIC_PM_INR: 1 } }, rateByEmp: { W1: { PAY_BASIS: 'X' } },
    otByEmp: { W1: 12.5 }, canteenByEmp: { W1: 300 }, societyByEmp: { W1: 40 }, advanceByEmp: { W1: 7 },
    efficiencyByEmp: { W1: 84 }, adjustmentRows: adj, cfg: { PF_MAX_EMPLOYEE: 1800 }, ptExemptSet: { W1: true },
    efficiencyConfig: [{ EFFICIENCY_PERCENT_EXACT: 85 }],
  }));
  assert.equal(out.length, 2);
  const w1 = out[0];
  assert.equal(w1.period, P);
  assert.equal(w1.population, 'PERMANENT_WORKER');
  assert.deepEqual(w1.emp, { EMP_ID: 'W1', EMPLOYEE_NAME: 'Wally', DEPARTMENT: 'FRG', DESIGNATION: 'Op' });
  assert.equal(w1.workingDays, 26);
  assert.deepEqual(w1.attendance, { PRESENT_DAYS: 20, PHYSICAL_PRESENT_DAYS: 19, WEEK_OFF: 4, PH: 1, EL_AVAILED: 1, CL_AVAILED: 0,
    SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 2 });
  assert.equal(w1.otHours, 12.5);
  assert.equal(w1.canteen, 300);
  assert.equal(w1.society, 40);
  assert.equal(w1.advance, 7);
  assert.equal(w1.adjustments.ARREARS, 300);
  assert.equal(w1.adjustments.PENALTY, 50);
  assert.equal(w1.adjustments.TDS, 0); // pending ignored
  assert.deepEqual(w1.salary, { BASIC_PM_INR: 1 });
  assert.equal(w1.rate, undefined);
  assert.equal(w1.efficiencyPct, 84);
  assert.equal(w1.efficiencyConfig.length, 1);
  assert.deepEqual(w1.ptExemptSet, { W1: true });
  assert.equal(w1.cfg.PF_MAX_EMPLOYEE, 1800);
  assert.equal(w1.hasAttendance, true);
  assert.equal(w1.attendanceApproved, true);
  const w2 = out[1];
  assert.equal(w2.emp.EMPLOYEE_NAME, 'NoData');
  assert.equal(w2.hasAttendance, false);
  assert.equal(w2.otHours, 0);
  assert.equal(w2.salary, null);
  assert.equal(w2.efficiencyPct, null);
  // consultant gets rate, not salary
  const cons = plain(c.buildEngineContexts({ period: P, population: 'CONSULTANT', workingDays: 26, employees: [{ EMP_ID: 'C1' }],
    rateByEmp: { C1: { PAY_BASIS: 'DAILY_RATE' } }, salaryByEmp: { C1: { BASIC_PM_INR: 1 } }, adjustmentRows: [] }))[0];
  assert.deepEqual(cons.rate, { PAY_BASIS: 'DAILY_RATE' });
  assert.equal(cons.salary, undefined);
});

test('worked days come out of calcEmployee from the mapped components (staff includes WO, worker excludes WO)', () => {
  const c = load(null);
  const mk = (population, salary) => c.buildEngineContexts({ period: P, population, workingDays: 26, employees: [{ EMP_ID: 'X' }],
    attendanceByEmp: { X: { PRESENT_DAYS: 20, PHYSICAL_PRESENT_DAYS: 20, WEEK_OFF: 4, PH: 1, EL_AVAILED: 1 } },
    salaryByEmp: { X: salary }, rateByEmp: { X: { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 100 } }, adjustmentRows: [], cfg: {} })[0];
  assert.equal(c.calcEmployee(mk('CONSULTANT')).row.WORKED_PAYABLE_DAYS, 26);
  assert.equal(c.calcEmployee(mk('PERMANENT_WORKER', { BASIC_PM_INR: 1 })).row.WORKED_PAYABLE_DAYS, 22);
});

test('engine_recon: totals, previous period and delta', () => {
  const c = load(null);
  const rows = [{ TOTAL_EARNINGS: 100, TOTAL_DEDUCTIONS: 10, NET_PAY: 90 }, { TOTAL_EARNINGS: 50, TOTAL_DEDUCTIONS: 5, NET_PAY: null }];
  const r = plain(c.engine_recon(P, 'STAFF', rows, 80, 'RUN1'));
  assert.deepEqual(r, { PERIOD: P, POPULATION: 'STAFF', HEADCOUNT: 2, TOTAL_GROSS: 150, TOTAL_DEDUCTIONS: 15, TOTAL_NET: 90,
    PREV_PERIOD_NET: 80, DELTA_PCT: 12.5, RUN_ID: 'RUN1' });
  const n = plain(c.engine_recon(P, 'STAFF', rows, null, 'RUN1'));
  assert.equal(n.PREV_PERIOD_NET, '');
  assert.equal(n.DELTA_PCT, '');
  assert.equal(c.engine_prevPeriod('2026-01'), '2025-12');
});

// ---------------------------------------------------------------- end to end with in-memory sheets
test('calculateDraft(STAFF): header written, rows replaced for period+pop only, status DRAFT, hash stored', () => {
  const w = seed({
    draft: (x) => x.put('PAYROLL_DRAFT', OUT, [
      { RUN_ID: 'OLD', PERIOD: '2026-10', POPULATION: 'STAFF', EMP_ID: 'X9', NET_PAY: 1 },
      { RUN_ID: 'OLD', PERIOD: P, POPULATION: 'STAFF', EMP_ID: 'STALE', NET_PAY: 2 },
      { RUN_ID: 'OLD', PERIOD: P, POPULATION: 'PUNE_STAFF', EMP_ID: 'P9', NET_PAY: 3 },
    ]),
    rdy: (x) => x.put('PAYROLL_READINESS', ['PAYROLL_MONTH', 'FEED', 'OWNER', 'STATUS', 'ROW_COUNT', 'APPROVED_OR_ZERO_DECLARATION', 'DETAIL', 'UPDATED_AT'],
      [{ PAYROLL_MONTH: P, FEED: 'legacy', STATUS: 'x', DETAIL: 'keep me' }]),
    oldrdy: (x) => { const s = x.sheets.PAYROLL_READINESS; s.data.push(['', '', '', 'READY', '', '', 'old', '']); },
  });
  const c = load(w);
  const res = plain(c.calculateDraft(P, 'STAFF'));
  assert.match(res.runId, /^RUN-2026-09-STAFF-\d{14}$/);

  const draft = rowsOf(w, 'PAYROLL_DRAFT');
  assert.deepEqual(w.sheets.PAYROLL_DRAFT.data[0], OUT); // header intact
  assert.deepEqual(draft.map((r) => r.EMP_ID).sort(), ['E1', 'P9', 'X9']);
  const e1 = draft.find((r) => r.EMP_ID === 'E1');
  assert.equal(e1.RUN_ID, res.runId);
  assert.equal(e1.WORKED_PAYABLE_DAYS, 26);
  assert.equal(e1.FIXED_GROSS, 31500); // Sept structure, not Aug (20000) nor Oct (99999)
  assert.equal(e1.OTHER_DEDUCTION, 1000); // approved adjustment mapped
  assert.equal(e1.ARREARS, 0); // pending ignored
  assert.equal(e1.NET_PAY, 28500); // 31500 - PF 1800 - PT 200 - other 1000
  assert.equal(e1.EMPLOYEE_NAME, 'Staff One');
  assert.equal(e1.CALC_VERSION, 'CALC-1.0');
  assert.ok(e1.CALCULATED_AT);

  // population tab created with header, exactly one row
  assert.deepEqual(w.sheets.PAYROLL_STAFF.data[0], OUT);
  assert.deepEqual(rowsOf(w, 'PAYROLL_STAFF').map((r) => r.EMP_ID), ['E1']);
  assert.equal(w.sheets.PAYROLL_CONSULTANT, undefined); // not requested

  // status + hash
  const pc = pcRow(w, 'STAFF');
  assert.equal(pc.STATUS, 'DRAFT');
  assert.equal(pc.DRAFT_RUN_ID, res.runId);
  assert.match(pc.DRAFT_HASH, /^[0-9a-f]{64}$/);
  assert.equal(pcRow(w, 'PUNE_STAFF').STATUS, 'LOCKED'); // untouched
  assert.equal(pcRow(w, 'CONSULTANT').STATUS, 'HR_APPROVED'); // untouched

  // exceptions (header, no rows blockers) and recon
  assert.deepEqual(w.sheets.PAYROLL_EXCEPTIONS.data[0], ['RUN_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'SEVERITY', 'CODE', 'MESSAGE']);
  const recon = rowsOf(w, 'PAYROLL_RECON');
  assert.equal(recon.length, 1);
  assert.equal(recon[0].HEADCOUNT, 1);
  assert.equal(recon[0].TOTAL_NET, 28500);
  assert.equal(recon[0].PREV_PERIOD_NET, '');

  // readiness: legacy row of the same PAYROLL_MONTH untouched (matched by PERIOD only), new rows written
  const rd = rowsOf(w, 'PAYROLL_READINESS');
  assert.ok(rd.some((r) => r.DETAIL === 'keep me'));
  const mine = rd.filter((r) => r.PERIOD === P && r.POPULATION === 'STAFF');
  assert.equal(mine.length, 17);
  assert.ok(mine.every((r) => r.CHECKED_AT));
  assert.equal(mine.find((r) => r.CHECK === 'ATTENDANCE_COVERAGE').STATUS, 'READY');
  assert.equal(res.readiness.blocked, 0);

  // audit
  const audit = rowsOf(w, 'AUDIT_LOG').map((r) => r.Message).join('\n');
  assert.match(audit, /CALC_DRAFT/);
  assert.match(audit, /READINESS/);
});

test('recalculation is idempotent: no duplicate rows, same hash, new run id allowed', () => {
  const w = seed();
  const c = load(w);
  const a = plain(c.calculateDraft(P, 'STAFF'));
  const h1 = pcRow(w, 'STAFF').DRAFT_HASH;
  const b = plain(c.calculateDraft(P, 'STAFF'));
  assert.equal(rowsOf(w, 'PAYROLL_DRAFT').length, 1);
  assert.equal(rowsOf(w, 'PAYROLL_STAFF').length, 1);
  assert.equal(rowsOf(w, 'PAYROLL_RECON').length, 1);
  assert.equal(pcRow(w, 'STAFF').DRAFT_HASH, h1);
  assert.equal(a.populations[0].hash, b.populations[0].hash);
  assert.equal(rowsOf(w, 'PAYROLL_READINESS').filter((r) => r.POPULATION === "STAFF").length, 17);
});

test('HR_APPROVED recalculation resets to DRAFT with AUDIT entry and cleared approval stamps', () => {
  const w = seed();
  const c = load(w);
  plain(c.calculateDraft(P, 'CONSULTANT'));
  const pc = pcRow(w, 'CONSULTANT');
  assert.equal(pc.STATUS, 'DRAFT');
  assert.equal(pc.HR_APPROVED_BY, '');
  assert.notEqual(pc.DRAFT_HASH, 'old');
  const audit = rowsOf(w, 'AUDIT_LOG').map((r) => r.Message);
  assert.ok(audit.some((m) => /STATUS_RESET/.test(m) && /HR_APPROVED/.test(m) && /pop=CONSULTANT/.test(m)), audit.join('\n'));
  // consultant numbers: 700 x 20 days + OT 700/8*2 = 14000 + 175
  const row = rowsOf(w, 'PAYROLL_CONSULTANT')[0];
  assert.equal(row.GROSS_EARNINGS, 14000);
  assert.equal(row.OT_AMOUNT, 175);
  assert.equal(row.NET_PAY, 14175);
});

test('ACCOUNTS_APPROVED also resets; LOCKED refused (explicit) and skipped (ALL)', () => {
  const w = seed({ acc: (x) => { x.sheets.PAYROLL_PERIOD_CATEGORY.data[1][3] = 'ACCOUNTS_APPROVED'; } });
  const c = load(w);
  plain(c.calculateDraft(P, 'STAFF'));
  assert.equal(pcRow(w, 'STAFF').STATUS, 'DRAFT');
  assert.ok(rowsOf(w, 'AUDIT_LOG').some((r) => /STATUS_RESET/.test(r.Message) && /ACCOUNTS_APPROVED/.test(r.Message)));

  const before = JSON.stringify(w.sheets.PAYROLL_DRAFT.data);
  assert.throws(() => c.calculateDraft(P, 'PUNE_STAFF'), /LOCKED/);
  assert.equal(JSON.stringify(w.sheets.PAYROLL_DRAFT.data), before);
  assert.equal(pcRow(w, 'PUNE_STAFF').STATUS, 'LOCKED');

  const all = plain(c.calculateDraft(P));
  assert.match(all.runId, /^RUN-2026-09-ALL-\d{14}$/);
  assert.deepEqual(all.skippedLocked, ['PUNE_STAFF']);
  assert.deepEqual(all.populations.map((p) => p.population), ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT']);
  assert.equal(pcRow(w, 'PUNE_STAFF').STATUS, 'LOCKED');
  assert.equal(rowsOf(w, 'PAYROLL_RECON').length, 3);
  assert.equal(rowsOf(w, 'PAYROLL_WORKER').length, 0);
  assert.equal(pcRow(w, 'PERMANENT_WORKER').STATUS, 'DRAFT');
  // readiness rows never written for the locked population
  assert.ok(!rowsOf(w, 'PAYROLL_READINESS').some((r) => r.POPULATION === 'PUNE_STAFF'));
});

test('period before 2026-09 is refused before any sheet is touched; bad population refused', () => {
  const w = seed();
  const c = load(w);
  assert.throws(() => c.calculateDraft('2026-08', 'STAFF'), /earlier than MIN_PERIOD/);
  assert.throws(() => c.checkReadiness('2026-08'), /earlier than MIN_PERIOD/);
  assert.throws(() => c.calculateDraft('2026-13'), /Invalid PERIOD/);
  assert.throws(() => c.calculateDraft(P, 'NOPE'), /Unknown population/);
  assert.equal(w.sheets.PAYROLL_DRAFT, undefined);
  assert.equal(w.sheets.PAYROLL_READINESS, undefined);
});

test('employee-level problems HOLD the employee (NET_PAY null, FLAGS HOLD) and do not block the population', () => {
  const w = seed({
    m: (x) => x.sheets.EMPLOYEE_MASTER.data.push(['E2', 'Second', 'STAFF', 'Active', '', '', ''], ['E1', 'Dup', 'STAFF', 'Active', '', '', '']),
    s: (x) => x.sheets.SALARY_STRUCTURE.data.push(['E2', 'STAFF', '2026-08-01', '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'hr@x', 't']),
  });
  const c = load(w);
  const res = plain(c.calculateDraft(P, 'STAFF'));
  const ex = rowsOf(w, 'PAYROLL_EXCEPTIONS');
  const codes = (id) => ex.filter((e) => e.EMP_ID === id).map((e) => e.CODE);
  assert.ok(codes('E2').includes('MISSING_ATTENDANCE'));
  assert.ok(codes('E2').includes('ZERO_SALARY_STRUCTURE'));
  assert.ok(codes('E1').includes('DUPLICATE_MASTER_ID'));
  const draft = rowsOf(w, 'PAYROLL_DRAFT');
  assert.equal(draft.find((r) => r.EMP_ID === 'E2').NET_PAY, '');
  assert.equal(draft.find((r) => r.EMP_ID === 'E1').NET_PAY, '');
  assert.equal(res.populations[0].blockers, 0); // nothing global
  assert.ok(res.populations[0].holds >= 3);
  assert.deepEqual(res.populations[0].held.sort(), ['E1', 'E2']);
  assert.equal(draft.find((r) => r.EMP_ID === 'E2').FLAGS.split(';')[0], 'HOLD');
  assert.ok(ex.filter((e) => e.EMP_ID === 'E2').every((e) => e.SEVERITY !== 'BLOCKER'));
  assert.ok(ex.some((e) => e.EMP_ID === 'E2' && e.SEVERITY === 'HOLD' && e.CODE === 'MISSING_ATTENDANCE'));
  const rd = rowsOf(w, 'PAYROLL_READINESS').filter((r) => r.POPULATION === 'STAFF');
  const by = (n) => rd.find((r) => r.CHECK === n);
  assert.equal(by('ATTENDANCE_COVERAGE').STATUS, 'HOLD');
  assert.equal(by('DUPLICATE_MASTER_IDS').STATUS, 'HOLD');
  assert.equal(by('SALARY_PRESENT_NONZERO').STATUS, 'HOLD');
  assert.equal(by('CALC_BLOCKERS').STATUS, 'READY'); // these codes have their own checks
  assert.equal(res.readiness.blocked, 0);
  assert.ok(res.readiness.hold >= 3);
  // held rows are excluded from the recon and the hash
  const recon = rowsOf(w, 'PAYROLL_RECON').find((r) => r.POPULATION === 'STAFF');
  assert.equal(recon.HEADCOUNT, 0);
  assert.equal(recon.TOTAL_NET, 0);
});

test('checkReadiness rewrites only its period+populations, keeps other periods, trailing rows cleared', () => {
  const w = seed({
    rdy: (x) => x.put('PAYROLL_READINESS', ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL', 'CHECKED_AT'], [
      { PERIOD: '2026-10', POPULATION: 'STAFF', CHECK: 'K', STATUS: 'READY', DETAIL: 'other period' },
      { PERIOD: P, POPULATION: 'STAFF', CHECK: 'OLD1', STATUS: 'BLOCKED', DETAIL: 'stale' },
      { PERIOD: P, POPULATION: 'CONSULTANT', CHECK: 'OLD2', STATUS: 'BLOCKED', DETAIL: 'other pop same period' },
      { PERIOD: P, POPULATION: 'STAFF', CHECK: 'OLD3', STATUS: 'BLOCKED', DETAIL: 'stale' },
      { PERIOD: P, POPULATION: 'STAFF', CHECK: 'OLD4', STATUS: 'BLOCKED', DETAIL: 'stale' },
    ]),
  });
  const c = load(w);
  const sum = plain(c.checkReadiness(P, 'STAFF'));
  assert.equal(sum.populations[0], 'STAFF');
  assert.equal(sum.rows.length, 17); // 16 checks + CALC_BLOCKERS (calc results computed)
  const rd = rowsOf(w, 'PAYROLL_READINESS');
  assert.ok(rd.some((r) => r.DETAIL === 'other period'));
  assert.ok(rd.some((r) => r.DETAIL === 'other pop same period'));
  assert.ok(!rd.some((r) => /^OLD[134]$/.test(r.CHECK)));
  assert.equal(rd.length, 2 + 17);
  assert.deepEqual(w.sheets.PAYROLL_READINESS.data[0], ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL', 'CHECKED_AT']);
  assert.equal(sum.blocked, 0);
  // all populations run: locked skipped, each other population gets rows
  const all = plain(c.checkReadiness(P));
  assert.deepEqual(all.skippedLocked, ['PUNE_STAFF']);
  assert.equal(Object.keys(all.byPopulation).length, 3);
  assert.ok(all.byPopulation.PERMANENT_WORKER.warn > 0); // efficiency config not CONFIRMED
});

test('pending OT (OT_PENDING_<period> in PAYROLL_CONTROL) makes check 7 WARN per population, READY when none, BLOCKED for exceptions', () => {
  const ctl = (val) => (w) => w.sheets.PAYROLL_CONTROL.data.push(['OT_PENDING_' + P, val]);
  const ot7 = (w, pop) => plain(load(w).checkReadiness(P, pop)).rows.find((r) => r.CHECK === 'OT_EXCEPTIONS');
  const none = ot7(seed(), 'STAFF');
  assert.equal(none.STATUS, 'READY');
  const w = seed({ c: ctl('{"STAFF":3,"PERMANENT_WORKER":0,"CONSULTANT":0,"PUNE_STAFF":0,"UNKNOWN":1}') });
  const st = ot7(w, 'STAFF');
  assert.equal(st.STATUS, 'WARN');
  assert.match(st.DETAIL, /pending OT events: 4/);
  assert.equal(ot7(w, 'CONSULTANT').STATUS, 'WARN'); // only the unattributable one
  assert.equal(ot7(seed({ c: ctl('{"STAFF":0,"CONSULTANT":0}') }), 'STAFF').STATUS, 'READY');
  assert.equal(ot7(seed({ c: ctl('not json') }), 'STAFF').STATUS, 'READY');
  const wx = seed({ c: ctl('{"STAFF":2}'), o: (x) => x.put('INPUT_OT', ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'ELIGIBILITY'],
    [{ PAYROLL_MONTH: P, EMP_ID: 'E1', OT_HOURS: 30, ELIGIBILITY: 'EXCEPTION' }]) });
  assert.equal(ot7(wx, 'STAFF').STATUS, 'HOLD'); // E1's OT exception holds E1 only
});

test('buildEngineContexts unwraps the {pct, physicalDaysOverride, source} object returned by efficiencyByEmp', () => {
  const c = load(null);
  const ctxs = plain(c.buildEngineContexts({ period: P, population: 'PERMANENT_WORKER', workingDays: 26, employees: [{ EMP_ID: 'W1' }, { EMP_ID: 'W2' }, { EMP_ID: 'W3' }],
    efficiencyByEmp: { W1: { pct: 88, physicalDaysOverride: null, source: 'EMP' }, W2: 91 }, efficiencyConfig: [] }));
  assert.equal(ctxs[0].efficiencyPct, 88);
  assert.equal(ctxs[1].efficiencyPct, 91);
  assert.equal(ctxs[2].efficiencyPct, null);
});

test('previous locked period feeds PREV_PERIOD_NET / DELTA_PCT in PAYROLL_RECON', () => {
  const w = seed({
    lk: (x) => x.put('PAYROLL_LOCKED', ['LOCK_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'NET_PAY'], [
      { LOCK_ID: 'L', PERIOD: '2026-08', POPULATION: 'STAFF', EMP_ID: 'E1', NET_PAY: 20000 },
      { LOCK_ID: 'L', PERIOD: '2026-08', POPULATION: 'CONSULTANT', EMP_ID: 'C1', NET_PAY: 1 },
    ]),
  });
  const c = load(w);
  c.calculateDraft(P, 'STAFF');
  const r = rowsOf(w, 'PAYROLL_RECON')[0];
  assert.equal(r.PREV_PERIOD_NET, 20000);
  assert.equal(r.DELTA_PCT, 42.5); // (28500-20000)/20000
});

test('engine_replaceRows_ appends missing columns without reordering and clears only leftover rows', () => {
  const w = makeWorld();
  w.put('T', ['A', 'PERIOD', 'B'], [{ A: 1, PERIOD: '2026-10', B: 'k' }, { A: 2, PERIOD: P, B: 'x' }, { A: 3, PERIOD: P, B: 'y' }]);
  const c = load(w);
  c.engine_replaceRows_('T', ['A', 'PERIOD', 'B', 'C'], [{ A: 9, PERIOD: P, B: 'n', C: 'c' }], (o) => o.PERIOD === P);
  assert.deepEqual(w.sheets.T.data[0], ['A', 'PERIOD', 'B', 'C']);
  assert.deepEqual(w.sheets.T.objs().map((r) => [r.A, r.PERIOD, r.C]), [[1, '2026-10', ''], [9, P, 'c']]);
});
