'use strict';
// End-to-end September 2026 run over an in-memory fake Google environment.
// The tests below share one world and MUST run in the order written (node:test runs top-level tests sequentially).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs, plain } = require('./load');

// ---------------------------------------------------------------- fake Sheets
const pad = (n, w = 2) => String(n).padStart(w, '0');
function formatDate(d, tz, fmt) {
  const map = { yyyy: pad(d.getFullYear(), 4), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()),
    mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}
const blank = (v) => v === '' || v == null;

function makeSheet(name) {
  const s = { name, data: [], protections: [], validations: 0 };
  s.getName = () => name;
  s.getLastRow = () => { for (let r = s.data.length; r >= 1; r--) if ((s.data[r - 1] || []).some((v) => !blank(v))) return r; return 0; };
  s.getLastColumn = () => { let m = 0; s.data.forEach((row) => row.forEach((v, i) => { if (!blank(v)) m = Math.max(m, i + 1); })); return m; };
  s.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
    setValues: (vals) => { assert.equal(vals.length, nr); vals.forEach((row, i) => { assert.equal(row.length, nc); while (s.data.length < r + i) s.data.push([]); row.forEach((v, j) => { s.data[r - 1 + i][c - 1 + j] = v; }); }); },
    setNumberFormat() {},
    setDataValidation() { s.validations++; },
    clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.data[r - 1 + i]) s.data[r - 1 + i][c - 1 + j] = ''; },
  });
  s.protect = () => {
    const p = { editors: [], setDescription() { return p; }, addEditor(u) { p.editors.push(u); return p; }, getEditors: () => p.editors,
      removeEditor() { return p; }, canDomainEdit: () => false, setDomainEdit() { return p; }, setWarningOnly() { return p; } };
    s.protections.push(p); return p;
  };
  s.getProtections = () => s.protections;
  s.objs = () => { const h = s.data[0] || []; return s.data.slice(1).filter((row) => row.some((v) => !blank(v))).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] === undefined ? '' : row[i]]))); };
  return s;
}

// ---------------------------------------------------------------- fake Drive / Docs / Mail / Script / Properties
const STAFF_TPL_ID = '1T7kwVNmOczXk4_-4OstofWOPSWGuEQxg7hKFo-Jci_w';   // defaults written by setup
const WORKER_TPL_ID = '1MSmi8qVRL8SI8-svVihasYbLFGNo8Xkzko4VUaIX8SU';
const COMMON_TOKENS = ['PAYROLL_PERIOD', 'EMP_NAME', 'EMP_ID', 'DEPARTMENT', 'DESIGNATION', 'DOJ', 'PRESENT_DAYS', 'EL_DAYS', 'CL_DAYS', 'SL_DAYS', 'PH_DAYS', 'DAYS_PAYABLE',
  'BASIC_RATE', 'BASIC', 'HRA_RATE', 'HRA', 'CONVEYANCE_RATE', 'CONVEYANCE', 'EDUCATION_RATE', 'EDUCATION', 'WASHING_RATE', 'WASHING', 'ARREARS', 'OT_HOURS', 'OT_AMOUNT',
  'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'GROSS_EARNINGS', 'PF_EMPLOYEE', 'ESI_EMPLOYEE', 'PROF_TAX', 'MLWF', 'SALARY_ADVANCE', 'SOCIETY', 'CANTEEN', 'OTHER_DEDUCTION',
  'TOTAL_DEDUCTIONS', 'NET_PAY', 'NET_PAY_WORDS', 'UAN', 'ESI_NO', 'PAN', 'EL_AVAILABLE', 'CL_AVAILABLE', 'SL_AVAILABLE'];
const STAFF_TOKENS = COMMON_TOKENS.concat(['WEEKLY_OFF_DAYS', 'MEDICAL_RATE', 'MEDICAL', 'PRO_DEV_RATE', 'PRO_DEV', 'COMMUNICATION_RATE', 'COMMUNICATION', 'UNIFORM_RATE', 'UNIFORM', 'TDS']);
const WORKER_TOKENS = COMMON_TOKENS.concat(['WORKING_DAYS', 'HEAT_ALLOWANCE_RATE', 'HEAT_ALLOWANCE', 'VDA_RATE', 'VDA', 'PRODUCTION_ALLOWANCE_RATE', 'PRODUCTION_ALLOWANCE',
  'PRODUCTION_ALLOWANCE_OFFSET', 'LEAVE_ENCASHMENT']);
const tplText = (tokens) => tokens.map((t) => `${t}: {{${t}}}`).join('\n');

function fakeGoogle() {
  const calls = { copies: 0, trashed: [], created: [], mails: [], triggers: [], docTexts: {} };
  const props = {};
  const templates = { [STAFF_TPL_ID]: tplText(STAFF_TOKENS), [WORKER_TPL_ID]: tplText(WORKER_TOKENS) };
  const docs = {};
  let n = 0;
  const folder = (name) => {
    const f = { name, kids: {} };
    f.getFoldersByName = (nm) => { const k = f.kids[nm]; let done = !k; return { hasNext: () => !done, next: () => { done = true; return k; } }; };
    f.createFolder = (nm) => (f.kids[nm] = folder(nm));
    f.createFile = (blob) => { const file = { getId: () => 'PDF' + (++n), getUrl: () => 'https://drive/pdf' + n }; calls.created.push(blob.name); return file; };
    return f;
  };
  const root = folder('root');
  const DriveApp = {
    getFolderById: (id) => { if (id !== 'PRIVATE_FOLDER') throw new Error('unexpected folder ' + id); return root; },
    getFileById: (id) => ({
      makeCopy: () => { calls.copies++; const cid = 'COPY' + (++n); docs[cid] = { text: templates[id] }; return { getId: () => cid, setTrashed: () => calls.trashed.push(cid), getAs: () => ({ setName(nm) { this.name = nm; return this; } }) }; },
      getBlob: () => ({ name: 'blob:' + id }),
    }),
  };
  const DocumentApp = {
    openById: (id) => {
      const d = docs[id] || { text: templates[id] };
      return { getBody: () => ({ getText: () => d.text, replaceText: (re, rep) => { d.text = d.text.replace(new RegExp(re, 'g'), () => rep.replace(/\\\$/g, '$')); } }),
        saveAndClose() { calls.docTexts[id] = d.text; } };
    },
  };
  const PropertiesService = { getScriptProperties: () => ({ setProperty: (k, v) => { props[k] = v; }, getProperty: (k) => props[k] || null, deleteProperty: (k) => { delete props[k]; } }) };
  const ScriptApp = {
    newTrigger: (fn) => ({ timeBased: () => ({ after: () => ({ create: () => { calls.triggers.push(fn); } }) }) }),
    getProjectTriggers: () => [], deleteTrigger() {},
  };
  const MailApp = { getRemainingDailyQuota: () => 100, sendEmail: (o) => { calls.mails.push(o); } };
  return { DriveApp, DocumentApp, PropertiesService, ScriptApp, MailApp, calls, props };
}

// ---------------------------------------------------------------- the world
const P = '2026-09';
const HR = 'hr@varshaforgings.com', ACC = 'accounts@varshaforgings.com', OWNER = 'owner@varshaforgings.com';
const env = { user: HR, sheets: {}, google: fakeGoogle() };
const ss = {
  getSheetByName: (n) => env.sheets[n] || null,
  insertSheet: (n) => (env.sheets[n] = makeSheet(n)),
  getSheets: () => Object.values(env.sheets),
  getOwner: () => ({ getEmail: () => OWNER }),
  getId: () => 'FAKE_SS_ID',
  toast() {},
};
const put = (name, headers, rows = []) => {
  const s = makeSheet(name);
  s.data = [headers.slice()].concat(rows.map((r) => headers.map((h) => (h in r ? r[h] : ''))));
  env.sheets[name] = s;
  return s;
};
const rowsOf = (name) => (env.sheets[name] ? env.sheets[name].objs() : []);
const snapshot = () => JSON.stringify(Object.keys(env.sheets).sort().map((k) => [k, env.sheets[k].data]));

/** Direct cell edit by header (what HR does by typing into the sheet). */
function editCells(sheetName, where, values) {
  const s = env.sheets[sheetName], h = s.data[0];
  let hits = 0;
  s.data.forEach((row, i) => {
    if (i === 0) return;
    if (!Object.keys(where).every((k) => String(row[h.indexOf(k)]) === String(where[k]))) return;
    Object.keys(values).forEach((k) => { if (h.indexOf(k) < 0) throw new Error('no column ' + k); row[h.indexOf(k)] = values[k]; });
    hits++;
  });
  assert.ok(hits > 0, `no row matched ${JSON.stringify(where)} in ${sheetName}`);
  return hits;
}
/** Direct row append by header (HR typing rows below the header). */
function addRows(sheetName, objs) {
  const s = env.sheets[sheetName], h = s.data[0];
  objs.forEach((o) => {
    Object.keys(o).forEach((k) => { if (h.indexOf(k) < 0) throw new Error(`no column ${k} in ${sheetName}`); });
    s.data.push(h.map((k) => (k in o ? o[k] : '')));
  });
}

const Utilities = {
  formatDate, getUuid: () => 'u', sleep() {},
  computeDigest: (alg, str) => Array.from(crypto.createHash('sha256').update(str, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
};
const me = () => ({ getEmail: () => env.user });
const dvBuilder = () => { const b = { requireValueInList() { return b; }, setAllowInvalid() { return b; }, build() { return {}; } }; return b; };
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ss, openById: () => ss, getActive: () => ss, flush() {},
  ProtectionType: { SHEET: 'SHEET' }, newDataValidation: dvBuilder,
};
const Session = { getActiveUser: me, getEffectiveUser: me };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };

const FILES = ['00_Config.gs', '01_SheetUtil.gs', '02_Setup.gs', '10_Attendance.gs', '11_AttendanceForms.gs', '20_Feeds.gs', '30_Calc.gs',
  '31_Readiness.gs', '32_Engine.gs', '40_Approval.gs', '41_Lock.gs', '50_Payslips.gs', '51_Email.gs', '90_Menu.gs', '99_Audit.gs'];
const c = loadGs(FILES, Object.assign({ Utilities, SpreadsheetApp, Session, LockService }, env.google));

// ---------------------------------------------------------------- synthetic master: 2 employees per population (fake ids)
const EMPS = [
  ['T-S1', 'STAFF', 'Test Staff One', 'Accounts', 's1@example.test'], ['T-S2', 'STAFF', 'Test Staff Two', 'Stores', 's2@example.test'],
  ['T-W1', 'PERMANENT_WORKER', 'Test Worker One', 'Forge', 'w1@example.test'], ['T-W2', 'PERMANENT_WORKER', 'Test Worker Two', 'Forge', 'w2@example.test'],
  ['T-C1', 'CONSULTANT', 'Test Consultant One', 'QA', ''], ['T-C2', 'CONSULTANT', 'Test Consultant Two', 'QA', ''],
  ['T-P1', 'PUNE_STAFF', 'Test Pune One', 'Sales', ''], ['T-P2', 'PUNE_STAFF', 'Test Pune Two', 'Sales', ''],
];
const POPS = ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'];
const idsOf = (pop) => EMPS.filter((e) => e[1] === pop).map((e) => e[0]);
const OT_HDR = ['Timestamp', 'Submission Type', 'EMP ID', 'Name', 'Department', 'Designation', 'Reporting Manager Name',
  'Reporting Manager Email ID', 'Date Of OT', 'Reason for OT', 'OT Time (From)', 'OT Time (To)', 'OT Hours',
  'Name Of Approver', 'Approval Decision', 'Remarks', 'Approval Password (HT)', 'Approval Password (Machine Shop)',
  'Approval Password (VMC Shop)', 'Approval Password (HOD)', 'Case No'];
const otRow = (o) => {
  const r = new Array(21).fill('');
  const set = (h, v) => { r[OT_HDR.indexOf(h)] = v; };
  set('Timestamp', o.ts || '2026-09-20 10:00:00'); set('Submission Type', o.type || 'Approval Of Manager'); set('EMP ID', o.emp);
  set('Date Of OT', o.date); set('OT Hours', o.h); set('Approval Decision', o.dec === undefined ? 'Approved' : o.dec); set('Case No', o.kase);
  set('Approval Password (HT)', 'SECRET-DO-NOT-READ'); set('Approval Password (HOD)', 'SECRET-DO-NOT-READ');
  return r;
};

const HIST_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'NET_PAY', 'NOTE'];
const HIST_ROWS = [{ PAYROLL_MONTH: '2026-08', EMP_ID: 'T-S1', NET_PAY: 11111, NOTE: 'Aug QA replay' }, { PAYROLL_MONTH: '2026-08', EMP_ID: 'T-W1', NET_PAY: 22222, NOTE: 'Aug QA replay' }];
const OT_LEGACY_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'APPROVAL_STATUS', 'ENTERED_AT', 'SOURCE_CASE_NOS', 'SOURCE_EVENT_COUNT', 'DATE_RANGE'];
const AUG_OT = [
  { PAYROLL_MONTH: '2026-08', EMP_ID: 'T-S1', OT_HOURS: 12, SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'APPROVED', ENTERED_AT: '2026-09-01', SOURCE_CASE_NOS: '17001', SOURCE_EVENT_COUNT: 2, DATE_RANGE: '2026-08-03..2026-08-20' },
  { PAYROLL_MONTH: '2026-08', EMP_ID: 'T-W1', OT_HOURS: 98.5, SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'APPROVED', ENTERED_AT: '2026-09-01', SOURCE_CASE_NOS: '17002', SOURCE_EVENT_COUNT: 9, DATE_RANGE: '2026-08-01..2026-08-31' },
];
let augBefore, histBefore, snapAfterSetup, auditLenAfterSetup, ext;

function seedWorld() {
  const stat = [['PF_WAGE_CEILING', 15000], ['PF_EMPLOYEE_RATE', 0.12], ['PF_MAX_EMPLOYEE', 1800], ['ESI_EMPLOYEE_RATE', 0.0075], ['ESI_EXEMPT_ABOVE', 21000],
    ['ESI_EMPLOYER_RATE', 0.0325], ['WORKER_VDA_RATE', 103], ['WORKER_HEAT_RATE', 5.78],
    ['PT_SLABS', '[{"min":0,"max":7500,"pt":0},{"min":7500.01,"max":10000,"pt":175},{"min":10000.01,"max":null,"pt":200}]'], ['MLWF_EMPLOYEE_RATE', 25]];
  put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE'], [{ KEY: 'LEGACY_KEY', VALUE: 'keep me', NOTE: 'pre-existing' }]);
  put('STATUTORY_CONFIG', ['KEY', 'VALUE', 'NOTE'], stat.map(([KEY, VALUE]) => ({ KEY, VALUE, NOTE: 'legacy' })));
  put('PAYROLL_PERIOD_CATEGORY', ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE'],
    [{ PAYROLL_MONTH: '2026-08', PAYROLL_CATEGORY: 'PERMANENT_WORKER', WORKING_DAYS: 27, STATUS: 'LOCKED', NOTE: 'August legacy' }]);
  put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DEPARTMENT', 'DESIGNATION', 'DOJ_AS_SOURCE', 'EMAIL_ID'],
    EMPS.map(([EMP_ID, PAYROLL_CATEGORY, EMPLOYEE_NAME, DEPARTMENT, EMAIL_ID]) => ({ EMP_ID, EMPLOYEE_NAME, PAYROLL_CATEGORY, STATUS_AS_SOURCE: 'Active', DEPARTMENT,
      DESIGNATION: 'Staff', DOJ_AS_SOURCE: '01/04/2019', EMAIL_ID }))
      .concat([{ EMP_ID: 'T-GONE', EMPLOYEE_NAME: 'Left Company', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Inactive', DEPARTMENT: 'X', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/01/2015', EMAIL_ID: 'gone@example.test' }]));
  const salHdr = ['EMP_ID', 'PAYROLL_CATEGORY', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'BASIC_PM_INR', 'HRA_PM_INR', 'CONVEYANCE_PM_INR', 'EDUCATION_PM_INR', 'MEDICAL_PM_INR',
    'PRO_DEV_PM_INR', 'COMMUNICATION_PM_INR', 'UNIFORM_PM_INR', 'WASHING_PM_INR', 'HEAT_MASTER_INR', 'VDA_MASTER_INR', 'PRODUCTION_MASTER_INR', 'FIXED_GROSS_PM_AS_SOURCE_INR',
    'VERSION_STATE', 'HR_APPROVED_BY', 'HR_APPROVED_AT'];
  const staffSal = (id, fg, from) => ({ EMP_ID: id, PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: from, BASIC_PM_INR: fg * 0.4, HRA_PM_INR: fg * 0.24, CONVEYANCE_PM_INR: fg * 0.06,
    EDUCATION_PM_INR: fg * 0.06, MEDICAL_PM_INR: fg * 0.06, PRO_DEV_PM_INR: fg * 0.03, COMMUNICATION_PM_INR: fg * 0.02, UNIFORM_PM_INR: fg * 0.04, WASHING_PM_INR: fg * 0.09,
    FIXED_GROSS_PM_AS_SOURCE_INR: fg });
  const workerSal = (id, fg) => ({ EMP_ID: id, PAYROLL_CATEGORY: 'PERMANENT_WORKER', EFFECTIVE_FROM: new Date(2026, 3, 1), BASIC_PM_INR: 8000, HRA_PM_INR: 3200, CONVEYANCE_PM_INR: 1000,
    EDUCATION_PM_INR: 500, WASHING_PM_INR: 700, HEAT_MASTER_INR: 150, VDA_MASTER_INR: 2575, PRODUCTION_MASTER_INR: 8500, FIXED_GROSS_PM_AS_SOURCE_INR: fg });
  put('SALARY_STRUCTURE', salHdr, [
    staffSal('T-S1', 31500, new Date(2026, 3, 1)), staffSal('T-S1', 99999, new Date(2026, 9, 1)), // October raise must NOT apply to September
    staffSal('T-S2', 42000, '2026-04-01'), workerSal('T-W1', 30000), workerSal('T-W2', 20000)]);
  put('PAYROLL_RATE_PROFILE', ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR', 'VERSION_STATE'], [
    { EMP_ID: 'T-C1', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700, VERSION_STATE: 'USER_APPROVED_JULY_PROXY' },
    { EMP_ID: 'T-C2', PAYROLL_CATEGORY: 'CONSULTANT', PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 20000, VERSION_STATE: 'USER_APPROVED_JULY_PROXY' },
    { EMP_ID: 'T-P1', PAYROLL_CATEGORY: 'PUNE_STAFF', PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 30000, VERSION_STATE: 'USER_APPROVED_JULY_PROXY' },
    { EMP_ID: 'T-P2', PAYROLL_CATEGORY: 'PUNE_STAFF', PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 25000, VERSION_STATE: 'USER_APPROVED_JULY_PROXY' }]);
  put('EFFICIENCY_CONFIG', ['EFFICIENCY_PERCENT_EXACT', 'INCENTIVE_SLAB_INR', 'IMPLEMENTATION_STATE'], [
    { EFFICIENCY_PERCENT_EXACT: 81, INCENTIVE_SLAB_INR: 3000, IMPLEMENTATION_STATE: 'PENDING' }, { EFFICIENCY_PERCENT_EXACT: 85, INCENTIVE_SLAB_INR: 8500, IMPLEMENTATION_STATE: 'PENDING' }]);
  put('INPUT_ATTENDANCE', ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED', 'SL_AVAILED',
    'PAID_LEAVE_OTHER', 'WORKED_DAYS', 'PAYABLE_DAYS', 'APPROVAL_STATUS', 'APPROVED_BY', 'SOURCE_REF', 'ENTERED_AT', 'REMARKS'],
  [{ PAYROLL_MONTH: '2026-08', EMP_ID: 'T-S1', PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 27, PRESENT_DAYS: 27, APPROVAL_STATUS: 'APPROVED', APPROVED_BY: 'old@x' }]);
  put('INPUT_OT', OT_LEGACY_HDR, AUG_OT);
  put('INPUT_ADJUSTMENTS', ['PAYROLL_MONTH', 'EMP_ID', 'ADJUSTMENT_TYPE', 'SIGNED_AMOUNT_INR', 'APPROVAL_STATUS', 'REVERSAL_OF_ENTRY_ID', 'REMARKS']);
  put('INPUT_ADVANCE', ['PAYROLL_MONTH', 'EMP_ID', 'RECOVERY_THIS_MONTH_INR', 'APPROVAL_STATUS']);
  put('INPUT_SOCIETY', ['PAYROLL_MONTH', 'EMP_ID', 'TOTAL_RECOVERY_INR', 'APPROVAL_STATUS']);
  put('PAYROLL_READINESS', ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL', 'CHECKED_AT']);
  put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  put('PAYROLL_HISTORY', HIST_HDR, HIST_ROWS);
  // decoy local tab: must NOT be read while OT_SOURCE_SPREADSHEET_ID is set
  // the OT form is linked into this spreadsheet: OT_FORM_RESPONSES is the default source; the legacy Overtime_Form copy is only a fallback
  put('Overtime_Form', OT_HDR, []);
  env.sheets.Overtime_Form.data.push(otRow({ emp: 'T-S2', date: '2026-09-10', h: 8, kase: 9999 })); // decoy: must not be read
  ext = put('OT_FORM_RESPONSES', OT_HDR, []);
  ext.data.push(
    otRow({ emp: 'T-S1', date: new Date(2026, 8, 12), h: 4, kase: 5001 }),
    otRow({ emp: 'T-W1', date: '2026-09-15', h: 3.5, kase: 5002 }),
    otRow({ emp: 'T-W1', date: '2026-08-30', h: 6, kase: 5003 }), // 30-Aug: inside the one-time catch-up window (from 26-Aug) -> paid in September
    otRow({ emp: 'T-W1', date: '2026-08-20', h: 7, kase: 5005 }), // 20-Aug: paid in the August run, outside the window
    otRow({ emp: 'T-W2', date: '2026-09-18', h: 2, type: 'Apply For OT', dec: '', kase: 5004 })); // still pending
  // hidden source masters: header split over rows 2 and 4, data from row 5 (synthetic fake identity values)
  const raw = (name, rows) => {
    const sh = put(name, ['x']);
    const blankRow = () => new Array(16).fill('');
    const r2 = blankRow(), r4 = blankRow();
    ['Date Of Joining', 'Status', 'Department', 'Designation', 'Bank Name', 'IFSC ', 'Account No.', 'UAN ', 'PAN', 'ESI No.'].forEach((h, i) => { r2[3 + i] = h; });
    r4[0] = 'EMP\nCODE'; r4[1] = 'Name'; r4[2] = 'Email ID'; r4[14] = 'Mobile number'; r4[15] = 'Aadhar Number';
    sh.data = [blankRow(), r2, blankRow(), r4].concat(rows.map(([id, uan, pan, esi, bank, ifsc, acct]) => {
      const r = blankRow(); r[0] = id; r[1] = 'FAKE-NAME'; r[7] = bank; r[8] = ifsc; r[9] = acct; r[10] = uan; r[11] = pan; r[12] = esi; r[14] = 'FAKE-MOBILE'; r[15] = 'FAKE-AADHAAR';
      return r;
    }));
  };
  raw('RAW_STAFF_MASTER', [['T-S1', 100000000001, 'FAKEPAN01A', 'FAKEESI01', 'Fake Bank', 'FAKE0000001', 900000000001]]); // T-S2 has no row: blank tokens
  raw('RAW_WORKER_MASTER', [['T-W1', 100000000002, 'FAKEPAN02B', '', 'Fake Bank W', 'FAKE0000002', 900000000002], ['T-W2', 100000000003, 'FAKEPAN03C', '', 'Fake Bank W', 'FAKE0000002', 900000000003]]);
  put('CANTEEN_FORM_RESPONSES', ['Timestamp', 'Payroll Month', 'Employee ID', 'Deduction Amount (INR)', 'Submission Type'], [
    { Timestamp: '2026-09-28 09:00:00', 'Payroll Month': '2026-09', 'Employee ID': 'T-S1', 'Deduction Amount (INR)': 600, 'Submission Type': 'New' },
    { Timestamp: '2026-09-28 09:05:00', 'Payroll Month': 'September 2026', 'Employee ID': 'T-W1', 'Deduction Amount (INR)': 450, 'Submission Type': 'New' }]);
  put('EFFICIENCY_FORM_RESPONSES', ['Timestamp', 'Payroll Month', 'Employee ID', 'Production Efficiency Percent'], [
    { Timestamp: '2026-09-28 10:00:00', 'Payroll Month': '2026-09', 'Employee ID': 'T-W1', 'Production Efficiency Percent': 90 },
    { Timestamp: '2026-09-28 10:05:00', 'Payroll Month': '2026-09', 'Employee ID': 'T-W2', 'Production Efficiency Percent': 82 }]);
}

const pc = (pop) => rowsOf('PAYROLL_PERIOD_CATEGORY').find((r) => r.PAYROLL_MONTH === P && r.PAYROLL_CATEGORY === pop);
const audits = () => rowsOf('AUDIT_LOG').map((r) => r.Message).join('\n');

// ================================================================ the run
test('1. setup: creates tabs/columns/keys, leaves PAYROLL_HISTORY and August rows byte-identical', () => {
  seedWorld();
  histBefore = JSON.stringify(env.sheets.PAYROLL_HISTORY.data);
  augBefore = JSON.stringify(env.sheets.INPUT_OT.data.slice(1));
  const legacyControl = JSON.stringify(env.sheets.PAYROLL_CONTROL.data[1]);
  const augAtt = JSON.stringify(env.sheets.INPUT_ATTENDANCE.data[1]);
  const augPc = JSON.stringify(env.sheets.PAYROLL_PERIOD_CATEGORY.data[1]);
  env.user = HR;
  const log = plain(c.hrosSetup());
  ['FEED_STATUS', 'HOLIDAY_CALENDAR', 'PT_EXEMPTIONS', 'ATTENDANCE_DAILY', 'PAYROLL_LOCKED', 'PAYSLIP_REGISTER', 'PAYROLL_CONSULTANT', 'PAYROLL_PUNE_STAFF']
    .forEach((t) => assert.ok(log.createdTabs.includes(t), t));
  assert.equal(JSON.stringify(env.sheets.PAYROLL_HISTORY.data), histBefore, 'PAYROLL_HISTORY untouched');
  assert.equal(JSON.stringify(env.sheets.PAYROLL_CONTROL.data[1]), legacyControl, 'pre-existing control row untouched');
  // August rows: same values in the original columns, appended columns blank
  const ot = env.sheets.INPUT_OT.data;
  assert.equal(JSON.stringify(ot.slice(1).map((r) => r.slice(0, OT_LEGACY_HDR.length))), augBefore);
  ot.slice(1).forEach((r) => assert.ok(r.slice(OT_LEGACY_HDR.length).every(blank)));
  assert.deepEqual(ot[0].slice(OT_LEGACY_HDR.length), ['OT_KEY', 'OT_DATE', 'SOURCE_ROW', 'NORMALIZER_VERSION', 'ELIGIBILITY', 'EXCEPTION_REASON']);
  assert.equal(JSON.stringify(env.sheets.INPUT_ATTENDANCE.data[1].slice(0, 18)), JSON.stringify(JSON.parse(augAtt).slice(0, 18)));
  assert.equal(JSON.stringify(env.sheets.PAYROLL_PERIOD_CATEGORY.data[1].slice(0, 7)), JSON.stringify(JSON.parse(augPc).slice(0, 7)));
  // headers written for header-less feeds, control keys present, statutory versioned
  assert.deepEqual(env.sheets.INPUT_CANTEEN.data[0].slice(0, 3), ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR']);
  const ctl = Object.fromEntries(rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]));
  assert.equal(ctl.HR_APPROVER_EMAIL, HR);
  assert.equal(ctl.EMAIL_RELEASE_ENABLED, 'FALSE');
  assert.equal(ctl.PAYSLIP_FOLDER_ID, '');
  const stat = rowsOf('STATUTORY_CONFIG');
  assert.ok(stat.every((r) => r.EFFECTIVE_FROM === '2026-09' && Number(r.VERSION) === 1));
  assert.ok(stat.some((r) => r.KEY === 'STAFF_COMPONENT_PCTS'));
  assert.equal(rowsOf('PT_EXEMPTIONS').length, 3);
  assert.equal(env.sheets.PAYROLL_LOCKED.protections.length, 1);
  snapAfterSetup = snapshot();
  auditLenAfterSetup = rowsOf('AUDIT_LOG').length;
});

test('2. setup twice: the second run changes nothing (only one more SETUP audit row)', () => {
  c.hrosSetup();
  const before = JSON.parse(snapAfterSetup), after = JSON.parse(snapshot());
  assert.deepEqual(after.map((x) => x[0]), before.map((x) => x[0]), 'no new tabs');
  before.forEach(([name, data], i) => {
    if (name === 'AUDIT_LOG') return;
    assert.deepEqual(after[i][1], data, name + ' unchanged');
  });
  assert.equal(rowsOf('AUDIT_LOG').length, auditLenAfterSetup + 1);
  assert.equal(env.sheets.PAYROLL_LOCKED.protections.length, 1, 'protection not duplicated');
});

test('3. owner sets PAYSLIP_FOLDER_ID, prepareMonth adds 4 period rows + 9 feed rows (idempotent), HR enters working days', () => {
  c.setControl('PAYSLIP_FOLDER_ID', 'PRIVATE_FOLDER', 'private folder');
  const r = plain(c.prepareMonth(P));
  assert.deepEqual([r.periodRowsAdded, r.feedRowsAdded], [4, 9]);
  assert.deepEqual(plain(c.prepareMonth(P)), Object.assign({}, r, { periodRowsAdded: 0, feedRowsAdded: 0 }));
  assert.throws(() => c.prepareMonth('2026-08'), /earlier than MIN_PERIOD/);
  POPS.forEach((p) => assert.equal(pc(p).STATUS, 'PENDING'));
  POPS.forEach((p) => editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_MONTH: P, PAYROLL_CATEGORY: p }, { WORKING_DAYS: 26 }));
  assert.equal(rowsOf('FEED_STATUS').filter((f) => f.PERIOD === P && f.STATUS === 'OPEN').length, 9);
});

test('4. monthly attendance: prepare, HR types counts, approve per population', () => {
  const r = plain(c.prepareMonthlyAttendance(P));
  assert.equal(r.rowsAdded, 8);
  assert.equal(plain(c.prepareMonthlyAttendance(P)).rowsAdded, 0);
  const A = (id, present, phys, wo, extra) => editCells('INPUT_ATTENDANCE', { PAYROLL_MONTH: P, EMP_ID: id },
    Object.assign({ PRESENT_DAYS: present, PHYSICAL_PRESENT_DAYS: phys, WEEK_OFF: wo, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0 }, extra || {}));
  A('T-S1', 22, 22, 4); A('T-S2', 18, 18, 4, { EL_AVAILED: 1, CL_AVAILED: 1, ABSENT_LWP_DAYS: 2 });
  A('T-W1', 25, 25, 4, { EL_AVAILED: 1 }); A('T-W2', 22, 22, 4);
  A('T-C1', 24, 24, 0); A('T-C2', 20, 20, 4);
  A('T-P1', 22, 22, 4); A('T-P2', 20, 20, 4);
  // an unapproved row is refused by readiness before approval
  const pre = plain(c.checkReadiness(P, 'STAFF')).rows.find((x) => x.CHECK === 'ATTENDANCE_APPROVED_VALID');
  assert.equal(pre.STATUS, 'HOLD'); // unapproved rows hold those employees only
  POPS.forEach((p) => { const a = plain(c.approveAttendance(P, p)); assert.equal(a.approved, 2); assert.deepEqual(a.blocked, []); assert.equal(a.approvedBy, HR); });
  rowsOf('INPUT_ATTENDANCE').filter((x) => x.PAYROLL_MONTH === P).forEach((x) => assert.equal(x.APPROVAL_STATUS, 'APPROVED'));
  assert.equal(rowsOf('INPUT_ATTENDANCE').find((x) => x.PAYROLL_MONTH === '2026-08').APPROVED_BY, 'old@x', 'August attendance untouched');
});

test('5. feeds: OT sync (pending recorded), canteen/efficiency sync, manual advance/society/adjustments, mark all feeds complete', () => {
  assert.equal(rowsOf('PAYROLL_CONTROL').find((r) => r.KEY === 'OT_SOURCE_SPREADSHEET_ID').VALUE, '', 'external source only when set');
  assert.equal(rowsOf('PAYROLL_CONTROL').find((r) => r.KEY === 'OT_SOURCE_TAB').VALUE, 'OT_FORM_RESPONSES');
  const win = rowsOf('PAYROLL_CONTROL').find((r) => r.KEY === 'OT_WINDOW_START_2026-09');
  assert.equal(win.VALUE, '2026-08-26');
  assert.match(win.NOTE, /Aug salary paid OT to 25-Aug/);
  const ot = plain(c.syncOtFromForm(P));
  assert.equal(ot.window, '2026-08-26..2026-09-30');
  assert.equal(ot.source, 'OT_FORM_RESPONSES');
  assert.equal(ot.validWritten, 3);
  assert.equal(ot.exceptionsWritten, 0);
  assert.equal(ot.pending, 1);
  assert.deepEqual(ot.pendingByPopulation, { STAFF: 0, PERMANENT_WORKER: 1, CONSULTANT: 0, PUNE_STAFF: 0 });
  const ctl = Object.fromEntries(rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]));
  assert.deepEqual(JSON.parse(ctl['OT_PENDING_' + P]), { STAFF: 0, PERMANENT_WORKER: 1, CONSULTANT: 0, PUNE_STAFF: 0 });
  const again = plain(c.syncOtFromForm(P));
  assert.deepEqual([again.validWritten, again.exceptionsWritten, again.superseded, again.unchanged], [0, 0, 0, 3], 'OT sync is idempotent');
  assert.deepEqual(JSON.parse(rowsOf('PAYROLL_CONTROL').find((r) => r.KEY === 'OT_PENDING_' + P).VALUE).PERMANENT_WORKER, 1);
  assert.equal(rowsOf('PAYROLL_CONTROL').filter((r) => r.KEY === 'OT_PENDING_' + P).length, 1, 'key updated in place, not duplicated');
  // reversals: T-W1's 30-Aug event is rejected later, T-S1's 12-Sep approval is corrected 4 -> 5 h; re-sync reflects the latest decision
  ext.data.push(otRow({ emp: 'T-W1', date: '2026-08-30', dec: 'Rejected', kase: 5003, ts: '2026-09-25 10:00:00', h: 6 }),
    otRow({ emp: 'T-S1', date: '2026-09-12', h: 5, kase: 5001, ts: '2026-09-26 10:00:00' }));
  const re = plain(c.syncOtFromForm(P));
  assert.deepEqual([re.validWritten, re.superseded, re.unchanged, re.revokedByRejection, re.correctedApprovals], [1, 2, 1, 1, 1]);
  const otRows = rowsOf('INPUT_OT').filter((r) => r.NORMALIZER_VERSION);
  const sup = otRows.filter((r) => r.ELIGIBILITY === 'SUPERSEDED');
  assert.equal(sup.length, 2);
  sup.forEach((r) => { assert.equal(r.OT_HOURS, 0, 'superseded rows do not inflate the Monthly OT Report'); assert.match(r.EXCEPTION_REASON, /^SUPERSEDED_BY_RESYNC .*ORIGINAL_OT_HOURS=(4|6)$/); });
  assert.deepEqual(plain(c.sumOtHours(rowsOf('INPUT_OT'), P)), { 'T-S1': 5, 'T-W1': 3.5 });
  assert.equal(plain(c.syncOtFromForm(P)).superseded, 0, 're-sync after the reversal is idempotent');
  // an employee who is not on the OT form (consultant): HR types an APPROVED HR_MANUAL row in INPUT_OT
  addRows('INPUT_OT', [{ PAYROLL_MONTH: P, EMP_ID: 'T-C1', OT_HOURS: 5, SOURCE_REF: 'HR_MANUAL', APPROVAL_STATUS: 'APPROVED', ENTERED_AT: '2026-09-29' }]);
  assert.equal(plain(c.sumOtHours(rowsOf('INPUT_OT'), P))['T-C1'], 5);
  assert.equal(plain(c.syncOtFromForm(P)).superseded, 0, 'manual rows are never superseded by a re-sync');
  assert.equal(plain(c.syncCanteenFromForm(P)).written, 2);
  assert.equal(plain(c.syncEfficiencyFromForm(P)).written, 2);
  addRows('INPUT_CANTEEN', [{ PAYROLL_MONTH: P, EMP_ID: 'T-P1', AMOUNT_INR: 300, SOURCE: 'HR_MANUAL', KEY: P + '|T-P1', STATUS: 'VALID', ENTERED_AT: '2026-09-29T09:00:00' }]);
  addRows('INPUT_ADVANCE', [{ PAYROLL_MONTH: P, EMP_ID: 'T-S2', RECOVERY_THIS_MONTH_INR: 1500, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'T-W1', RECOVERY_THIS_MONTH_INR: 999, APPROVAL_STATUS: 'PENDING' }]); // pending = ignored
  addRows('INPUT_SOCIETY', [{ PAYROLL_MONTH: P, EMP_ID: 'T-W1', TOTAL_RECOVERY_INR: 780, APPROVAL_STATUS: 'APPROVED' }]);
  addRows('INPUT_ADJUSTMENTS', [
    { PAYROLL_MONTH: P, EMP_ID: 'T-S1', ADJUSTMENT_TYPE: 'ARREARS', SIGNED_AMOUNT_INR: 500, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'T-S2', ADJUSTMENT_TYPE: 'OTHER_DEDUCTION', SIGNED_AMOUNT_INR: 200, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'T-W1', ADJUSTMENT_TYPE: 'DISPATCH_INCENTIVE', SIGNED_AMOUNT_INR: 300, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'T-P1', ADJUSTMENT_TYPE: 'TDS', SIGNED_AMOUNT_INR: 100, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: P, EMP_ID: 'T-C1', ADJUSTMENT_TYPE: 'OTHER_ALLOWANCE', SIGNED_AMOUNT_INR: 250, APPROVAL_STATUS: 'PENDING' }]); // pending = ignored
  // before feeds are marked complete readiness must block
  assert.equal(plain(c.checkReadiness(P, 'STAFF')).rows.find((x) => x.CHECK === 'FEEDS_COMPLETE').STATUS, 'BLOCKED');
  c.FEED_LIST.forEach((f) => assert.equal(c.markFeedComplete(P, f, 'e2e').status, 'COMPLETE'));
  assert.equal(rowsOf('FEED_STATUS').filter((f) => f.PERIOD === P && f.STATUS === 'COMPLETE').length, 9);
  assert.throws(() => c.markFeedComplete(P, 'NOPE'), /Unknown feed/);
});

test('5b. approval gates: unsigned SALARY_STRUCTURE / STATUTORY_CONFIG block; HR and Accounts stamp them via their own runners', () => {
  env.user = HR;
  const pre = plain(c.checkReadiness(P));
  const by = (pop, check) => pre.rows.find((r) => r.POPULATION === pop && r.CHECK === check);
  assert.equal(by('STAFF', 'PAY_STRUCTURE_APPROVED').STATUS, 'BLOCKED');
  assert.match(by('STAFF', 'PAY_STRUCTURE_APPROVED').DETAIL, /HR_APPROVED_BY blank.*T-S1, T-S2/);
  assert.equal(by('PERMANENT_WORKER', 'PAY_STRUCTURE_APPROVED').STATUS, 'BLOCKED');
  assert.equal(by('STAFF', 'STATUTORY_CONFIG').STATUS, 'BLOCKED');
  assert.match(by('STAFF', 'STATUTORY_CONFIG').DETAIL, /not approved by Accounts \(APPROVED_BY blank/);
  assert.equal(by('CONSULTANT', 'PAY_STRUCTURE_APPROVED').STATUS, 'WARN', 'approved July proxy: WARN only');
  assert.match(by('CONSULTANT', 'PAY_STRUCTURE_APPROVED').DETAIL, /PROXY_RATE_JUL2026: 2 employee/);
  // wrong runners are refused and stamp nothing
  env.user = ACC;
  assert.deepEqual(plain(c.approveSalaryStructure(P, 'STAFF')), { ok: false, reason: 'USER_NOT_HR_APPROVER' });
  env.user = HR;
  assert.deepEqual(plain(c.approveStatutoryConfig(P)), { ok: false, reason: 'USER_NOT_ACCOUNTS_APPROVER' });
  assert.ok(rowsOf('SALARY_STRUCTURE').every((r) => r.HR_APPROVED_BY === ''));
  assert.ok(rowsOf('STATUTORY_CONFIG').every((r) => r.APPROVED_BY === ''));
  assert.throws(() => c.approveSalaryStructure(P, 'CONSULTANT'), /STAFF and PERMANENT_WORKER/);
  // counts (what the menu shows) then stamp: only the rows effective for September (the October raise stays unsigned)
  const plan = plain(c.planSalaryStructureApproval(P, 'STAFF'));
  assert.deepEqual([plan.employees, plan.withEffectiveRow, plan.toStamp.length, plan.alreadyApproved, plan.withoutRow], [2, 2, 2, 0, []]);
  const a = plain(c.approveSalaryStructure(P, 'STAFF'));
  assert.deepEqual([a.ok, a.stamped, a.alreadyApproved], [true, 2, 0]);
  assert.equal(plain(c.approveSalaryStructure(P, 'PERMANENT_WORKER')).stamped, 2);
  assert.equal(plain(c.approveSalaryStructure(P, 'STAFF')).stamped, 0, 'idempotent');
  const sal = rowsOf('SALARY_STRUCTURE');
  const oct = sal.find((r) => r.EMP_ID === 'T-S1' && Number(r.FIXED_GROSS_PM_AS_SOURCE_INR) === 99999);
  assert.equal(oct.HR_APPROVED_BY, '', 'a future-dated version is not approved by accident');
  assert.equal(sal.filter((r) => r.HR_APPROVED_BY === HR && r.HR_APPROVED_AT).length, 4);
  env.user = ACC;
  const sc = plain(c.approveStatutoryConfig(P));
  assert.equal(sc.ok, true);
  assert.ok(sc.stamped >= 20, 'existing + setup-seeded keys');
  assert.ok(rowsOf('STATUTORY_CONFIG').every((r) => r.APPROVED_BY === ACC && r.APPROVED_AT));
  assert.equal(plain(c.approveStatutoryConfig(P)).stamped, 0);
  assert.match(audits(), /SALARY_APPROVE/);
  assert.match(audits(), /STATUTORY_APPROVE/);
  env.user = HR;
});

test('6. readiness: no BLOCKED anywhere; pending OT gives WARN on the worker population only', () => {
  const res = plain(c.checkReadiness(P));
  assert.equal(res.blocked, 0, JSON.stringify(res.rows.filter((r) => r.STATUS === 'BLOCKED')));
  const by = (pop, check) => res.rows.find((r) => r.POPULATION === pop && r.CHECK === check);
  assert.equal(by('PERMANENT_WORKER', 'OT_EXCEPTIONS').STATUS, 'WARN');
  assert.match(by('PERMANENT_WORKER', 'OT_EXCEPTIONS').DETAIL, /pending OT events: 1/);
  ['STAFF', 'CONSULTANT', 'PUNE_STAFF'].forEach((p) => assert.equal(by(p, 'OT_EXCEPTIONS').STATUS, 'READY', p));
  assert.equal(by('PERMANENT_WORKER', 'EFFICIENCY_CONFIG_CONFIRMED').STATUS, 'WARN');
  res.rows.forEach((r) => assert.ok(['READY', 'WARN'].includes(r.STATUS), r.POPULATION + ' ' + r.CHECK));
  assert.equal(rowsOf('PAYROLL_READINESS').filter((r) => r.PERIOD === P).length, res.rows.length);
});

test('7. calculateDraft: 4 DRAFT populations, sane numbers, salary picked effective-dated', () => {
  const r = plain(c.calculateDraft(P));
  assert.equal(r.readiness.blocked, 0);
  POPS.forEach((p) => { assert.equal(pc(p).STATUS, 'DRAFT', p); assert.ok(pc(p).DRAFT_HASH, p); });
  const draft = rowsOf('PAYROLL_DRAFT').filter((x) => x.PERIOD === P);
  assert.equal(draft.length, 8);
  draft.forEach((x) => { assert.equal(typeof x.NET_PAY, 'number', x.EMP_ID); assert.ok(x.NET_PAY > 0, x.EMP_ID); });
  const row = (id) => draft.find((x) => x.EMP_ID === id);
  // T-S1: FG 31,500 (not the October 99,999), w=26 of wd=26, OT 4h, canteen 600, arrears 500
  assert.equal(row('T-S1').FIXED_GROSS, 31500);
  assert.equal(row('T-S1').OT_HOURS, 5, 'corrected approval (4 -> 5 h): the latest decision wins');
  assert.equal(row('T-S1').CANTEEN, 600);
  assert.equal(row('T-S1').ARREARS, 500);
  assert.equal(row('T-S2').ADVANCE, 1500);
  assert.equal(row('T-S2').OTHER_DEDUCTION, 200);
  assert.equal(row('T-W1').SOCIETY, 780);
  assert.equal(row('T-W1').ADVANCE, 0, 'PENDING advance ignored');
  assert.equal(row('T-W1').EFFICIENCY_PCT, 90);
  assert.equal(row('T-W2').EFFICIENCY_PCT, 82);
  // production pay = slab amount for floor(pct): 90% -> the 85 slab (8,500), 82% -> the 81 slab (3,000); no deduction
  assert.equal(row('T-W1').PRODUCTION_ALLOWANCE, 8500);
  assert.equal(row('T-W2').PRODUCTION_ALLOWANCE, 3000);
  assert.equal(row('T-W1').EFFICIENCY_DEDUCTION, 0);
  assert.equal(row('T-W2').EFFICIENCY_DEDUCTION, 0);
  assert.equal(row('T-W1').OT_HOURS, 3.5, '30-Aug catch-up event was rejected later; 15-Sep event stays');
  assert.match(row('T-C1').FLAGS, /PROXY_RATE_JUL2026/, 'approved July proxy rate carries the R28 warning flag');
  assert.match(row('T-P1').FLAGS, /PROXY_RATE_JUL2026/);
  assert.ok(!/PROXY_RATE_JUL2026/.test(row('T-S1').FLAGS));
  assert.equal(row('T-C1').OT_HOURS, 5, 'manual HR_MANUAL OT row counted');
  assert.equal(row('T-C1').OT_AMOUNT, 437.5);
  assert.equal(row('T-C1').OTHER_ALLOWANCE, 0, 'PENDING adjustment ignored');
  assert.equal(row('T-C1').GROSS_EARNINGS, 700 * 24);
  assert.equal(row('T-P1').TDS, 0 + 100);
  assert.match(row('T-W2').FLAGS, /WORKER_ESI_BASIS_UNCONFIRMED/);
  assert.equal(rowsOf('PAYROLL_STAFF').length, 2);
  assert.equal(rowsOf('PAYROLL_WORKER').length, 2);
  assert.equal(rowsOf('PAYROLL_RECON').filter((x) => x.PERIOD === P).length, 4);
  // recalculation reproduces the same hash (deterministic)
  const h0 = pc('STAFF').DRAFT_HASH;
  c.calculateDraft(P, 'STAFF');
  assert.equal(pc('STAFF').DRAFT_HASH, h0);
});

test('8. approvals: only the named approvers may approve; HR then Accounts; lock by Accounts', () => {
  env.user = ACC;
  assert.equal(plain(c.hrApprove(P, 'STAFF')).reason, 'USER_NOT_HR_APPROVER');
  assert.equal(plain(c.accountsApprove(P, 'STAFF')).reason, 'STATUS_NOT_HR_APPROVED');
  POPS.forEach((p) => {
    env.user = HR; const a = plain(c.hrApprove(P, p)); assert.deepEqual([a.ok, a.status], [true, 'HR_APPROVED'], p + JSON.stringify(a));
    assert.equal(pc(p).HR_APPROVED_BY, HR);
  });
  env.user = HR;
  assert.equal(plain(c.accountsApprove(P, 'STAFF')).reason, 'USER_NOT_ACCOUNTS_APPROVER');
  POPS.forEach((p) => {
    env.user = ACC; const a = plain(c.accountsApprove(P, p)); assert.deepEqual([a.ok, a.status], [true, 'ACCOUNTS_APPROVED'], p);
    assert.equal(pc(p).ACCOUNTS_APPROVED_BY, ACC);
  });
  env.user = HR;
  assert.equal(plain(c.lockPeriod(P, 'STAFF')).reason, 'USER_NOT_ACCOUNTS_APPROVER_OR_OWNER');
  env.user = ACC;
  POPS.forEach((p) => { const l = plain(c.lockPeriod(P, p)); assert.equal(l.ok, true, p + JSON.stringify(l)); assert.equal(pc(p).STATUS, 'LOCKED'); assert.match(pc(p).LOCK_ID, new RegExp('^LOCK-2026-09-' + p + '-\\d{12}$')); });
  const locked = rowsOf('PAYROLL_LOCKED');
  assert.equal(locked.length, 8);
  assert.deepEqual(locked.map((r) => r.EMP_ID).sort(), EMPS.map((e) => e[0]).sort());
  assert.throws(() => c.calculateDraft(P, 'STAFF'), /LOCKED/);
  assert.equal(plain(c.lockPeriod(P, 'STAFF')).ok, false, 'no double lock');
  assert.equal(rowsOf('PAYROLL_LOCKED').length, 8);
});

test('9. payslips: STAFF + PERMANENT_WORKER generated with rates from salary structure; Consultant/Pune refused', () => {
  env.user = ACC;
  const g = env.google;
  ['STAFF', 'PERMANENT_WORKER'].forEach((p) => { const r = plain(c.generatePayslips(P, p)); assert.equal(r.generated, 2, p); assert.deepEqual(r.failed, [], p); });
  assert.throws(() => c.generatePayslips(P, 'CONSULTANT'), /only for STAFF and PERMANENT_WORKER/);
  assert.throws(() => c.generatePayslips(P, 'PUNE_STAFF'), /only for STAFF and PERMANENT_WORKER/);
  assert.deepEqual(g.calls.created.slice().sort(), ['T-S1_2026-09_Payslip.pdf', 'T-S2_2026-09_Payslip.pdf', 'T-W1_2026-09_Payslip.pdf', 'T-W2_2026-09_Payslip.pdf']);
  assert.equal(g.calls.trashed.length, 4, 'temporary Doc copies trashed');
  const reg = rowsOf('PAYSLIP_REGISTER');
  assert.equal(reg.length, 4);
  reg.forEach((r) => assert.equal(r.STATUS, 'GENERATED'));
  // the rendered Docs carry the fixed monthly structure in the *_RATE tokens (T-S1 basic 31,500 x 0.40 = 12,600; worker heat master 150)
  const texts = Object.values(g.calls.docTexts);
  assert.ok(texts.some((t) => /EMP_ID: T-S1/.test(t) && /BASIC_RATE: 12,600/.test(t) && /HRA_RATE: 7,560/.test(t)), 'staff RATE tokens from SALARY_STRUCTURE (Sept row, not Oct)');
  assert.ok(texts.some((t) => /EMP_ID: T-W1/.test(t) && /BASIC_RATE: 8,000/.test(t) && /VDA_RATE: 2,575/.test(t) && /HEAT_ALLOWANCE_RATE: 150/.test(t) && /PRODUCTION_ALLOWANCE_RATE: 8,500/.test(t)));
  texts.forEach((t) => { assert.ok(!/\{\{/.test(t)); assert.ok(!/(EL_AVAILABLE|CL_AVAILABLE|SL_AVAILABLE): \S/.test(t), 'leave-available tokens blank'); });
  // identity printed from the hidden RAW masters (T-S2 has no row there -> blank)
  assert.ok(texts.some((t) => /EMP_ID: T-S1/.test(t) && /UAN: 100000000001/.test(t) && /PAN: FAKEPAN01A/.test(t) && /ESI_NO: FAKEESI01/.test(t)));
  assert.ok(texts.some((t) => /EMP_ID: T-W1/.test(t) && /UAN: 100000000002/.test(t) && /PAN: FAKEPAN02B/.test(t)));
  assert.ok(texts.some((t) => /EMP_ID: T-S2/.test(t) && !/UAN: \S/.test(t) && !/PAN: \S/.test(t)));
  assert.ok(texts.every((t) => !/FAKE-(NAME|MOBILE|AADHAAR)/.test(t)), 'only identity columns are read');
  // production pay on the worker slips: 90% -> 8,500 paid; offset token 0
  assert.ok(texts.some((t) => /EMP_ID: T-W1/.test(t) && /PRODUCTION_ALLOWANCE: 8,500/.test(t) && /PRODUCTION_ALLOWANCE_OFFSET: 0/.test(t)));
  assert.ok(texts.some((t) => /EMP_ID: T-W2/.test(t) && /PRODUCTION_ALLOWANCE: 3,000/.test(t)));
  // identity data is never written to any other tab or to the audit log
  Object.values(env.sheets).filter((sh) => !/^RAW_/.test(sh.name)).forEach((sh) => {
    assert.ok(!/FAKEPAN|FAKEESI|FAKE0000|10000000000|90000000000|Fake Bank/.test(JSON.stringify(sh.data)), sh.name + ' must not contain identity data');
  });
  // idempotent
  assert.equal(plain(c.generatePayslips(P, 'STAFF')).generated, 0);
  assert.equal(rowsOf('PAYSLIP_REGISTER').length, 4);
});

test('10. emails: queue, send refused while release flags are off, then allowed for Accounts only', () => {
  const g = env.google;
  env.user = ACC;
  const q = plain(c.queuePayslipEmails(P));
  assert.equal(q.STAFF.queued, 2);
  assert.equal(q.PERMANENT_WORKER.queued, 2);
  assert.equal(plain(c.queuePayslipEmails(P)).STAFF.queued, 0);
  assert.equal(rowsOf('PAYSLIP_EMAIL_LOG').filter((r) => r.STATUS === 'QUEUED').length, 4);
  const refused = plain(c.sendQueuedEmails(P));
  ['STAFF', 'PERMANENT_WORKER'].forEach((p) => assert.match(refused[p].refused, /Email release refused.*EMAIL_RELEASE_ENABLED is not TRUE/));
  assert.throws(() => c.sendQueuedEmails(P, 'STAFF'), /Email release refused/);
  assert.equal(g.calls.mails.length, 0);
  c.setControl('EMAIL_RELEASE_ENABLED', 'TRUE');
  c.setControl('EMAIL_RELEASE_' + P, 'TRUE');
  env.user = HR;
  assert.throws(() => c.sendQueuedEmails(P, 'STAFF'), /runner is not ACCOUNTS_APPROVER_EMAIL/);
  assert.equal(g.calls.mails.length, 0);
  env.user = ACC;
  const sent = plain(c.sendQueuedEmails(P));
  assert.equal(sent.STAFF.sent, 2);
  assert.equal(sent.PERMANENT_WORKER.sent, 2);
  assert.deepEqual(g.calls.mails.map((m) => m.to).sort(), ['s1@example.test', 's2@example.test', 'w1@example.test', 'w2@example.test']);
  rowsOf('PAYSLIP_EMAIL_LOG').forEach((r) => assert.equal(r.STATUS, 'SENT'));
  assert.equal(plain(c.sendQueuedEmails(P)).STAFF.sent, 0, 'nothing re-sent');
  assert.equal(g.calls.mails.length, 4);
});

test('11. protected data intact: PAYROLL_HISTORY and August INPUT_OT rows byte-identical after the whole run', () => {
  assert.equal(JSON.stringify(env.sheets.PAYROLL_HISTORY.data), histBefore);
  const ot = env.sheets.INPUT_OT.data;
  const aug = ot.slice(1).filter((r) => String(r[0]) === '2026-08');
  assert.equal(JSON.stringify(aug.map((r) => r.slice(0, OT_LEGACY_HDR.length))), augBefore);
  aug.forEach((r) => assert.ok(r.slice(OT_LEGACY_HDR.length).every(blank)));
  assert.equal(ot.length - 1, 2 + 4 + 1, 'appended: 3 first-sync events + 1 corrected approval + the manual row (2 were superseded in place)');
  // Overtime_Form password columns were never copied anywhere
  Object.values(env.sheets).forEach((s) => assert.ok(!JSON.stringify(s.data).includes('SECRET-DO-NOT-READ') || s.name === 'Overtime_Form' || s.name === 'OT_FORM_RESPONSES', s.name));
  assert.ok(!rowsOf('INPUT_OT').some((r) => r.EMP_ID === 'T-S2'), 'the local Overtime_Form decoy was never read');
  assert.match(audits(), /HR_APPROVE/);
  assert.match(audits(), /PAYSLIPS_GENERATED/);
  assert.match(audits(), /PAYSLIP_EMAIL_REFUSED/);
});
