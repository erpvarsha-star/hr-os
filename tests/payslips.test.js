'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');

const pad = (n, w = 2) => String(n).padStart(w, '0');
function formatDate(d, tz, fmt) {
  const map = { yyyy: pad(d.getFullYear(), 4), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}
const blank = (v) => v === '' || v == null;
function makeSheet(name) {
  const s = { name, data: [] };
  s.getName = () => name;
  s.getLastRow = () => { for (let r = s.data.length; r >= 1; r--) if ((s.data[r - 1] || []).some((v) => !blank(v))) return r; return 0; };
  s.getLastColumn = () => { let m = 0; s.data.forEach((row) => row.forEach((v, i) => { if (!blank(v)) m = Math.max(m, i + 1); })); return m; };
  s.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
    setValues: (vals) => { vals.forEach((row, i) => { while (s.data.length < r + i) s.data.push([]); row.forEach((v, j) => { s.data[r - 1 + i][c - 1 + j] = v; }); }); },
    setNumberFormat() {},
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

// ---- real template tokens (read from the two Google Docs, syntax {{TOKEN}})
const COMMON = ['PAYROLL_PERIOD', 'EMP_NAME', 'EMP_ID', 'DEPARTMENT', 'DESIGNATION', 'DOJ', 'PRESENT_DAYS', 'EL_DAYS', 'CL_DAYS', 'SL_DAYS', 'PH_DAYS', 'DAYS_PAYABLE',
  'BASIC_RATE', 'BASIC', 'HRA_RATE', 'HRA', 'CONVEYANCE_RATE', 'CONVEYANCE', 'EDUCATION_RATE', 'EDUCATION', 'WASHING_RATE', 'WASHING', 'ARREARS', 'OT_HOURS', 'OT_AMOUNT',
  'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'GROSS_EARNINGS', 'PF_EMPLOYEE', 'ESI_EMPLOYEE', 'PROF_TAX', 'MLWF', 'SALARY_ADVANCE', 'SOCIETY', 'CANTEEN', 'OTHER_DEDUCTION',
  'TOTAL_DEDUCTIONS', 'NET_PAY', 'NET_PAY_WORDS', 'UAN', 'ESI_NO', 'PAN', 'EL_AVAILABLE', 'CL_AVAILABLE', 'SL_AVAILABLE'];
const STAFF_TOKENS = COMMON.concat(['WEEKLY_OFF_DAYS', 'MEDICAL_RATE', 'MEDICAL', 'PRO_DEV_RATE', 'PRO_DEV', 'COMMUNICATION_RATE', 'COMMUNICATION', 'UNIFORM_RATE', 'UNIFORM', 'TDS']);
const WORKER_TOKENS = COMMON.concat(['WORKING_DAYS', 'HEAT_ALLOWANCE_RATE', 'HEAT_ALLOWANCE', 'VDA_RATE', 'VDA', 'PRODUCTION_ALLOWANCE_RATE', 'PRODUCTION_ALLOWANCE',
  'PRODUCTION_ALLOWANCE_OFFSET', 'LEAVE_ENCASHMENT']);
// Drive export escapes underscores exactly like this.
const tplText = (tokens) => tokens.map((t) => `| {{${t.replace(/_/g, '\\\\\\_')}}} |`).join('\n');

function fakeGoogle(opts = {}) {
  const calls = { copies: 0, trashed: [], created: [], triggers: [], deleted: [], mails: [], sharing: 0 };
  const props = {};
  const templates = { TPL_STAFF: tplText(STAFF_TOKENS).replace(/\\/g, ''), TPL_WORKER: tplText(WORKER_TOKENS).replace(/\\/g, '') };
  if (opts.badTemplate) templates.TPL_STAFF += '\n{{SURPRISE_TOKEN}}';
  const docs = {};
  let n = 0;
  const folder = (name) => {
    const f = { name, kids: {}, files: [] };
    f.getFoldersByName = (nm) => { const k = f.kids[nm]; let done = !k; return { hasNext: () => !done, next: () => { done = true; return k; } }; };
    f.createFolder = (nm) => (f.kids[nm] = folder(nm));
    f.createFile = (blob) => { const file = { getId: () => 'PDF' + (++n), getUrl: () => 'url', name: blob.name }; calls.created.push(blob.name); return file; };
    return f;
  };
  const root = folder('root');
  const DriveApp = {
    getFolderById: () => root,
    getFileById: (id) => ({
      makeCopy: () => { calls.copies++; const cid = 'COPY' + (++n); docs[cid] = { text: templates[id] }; return { getId: () => cid, setTrashed: (v) => calls.trashed.push(cid), getAs: () => ({ setName(nm) { this.name = nm; return this; } }) }; },
      getBlob: () => ({ name: 'blob' }),
    }),
  };
  const DocumentApp = {
    openById: (id) => {
      const d = docs[id] || { text: templates[id] };
      return { getBody: () => ({ getText: () => d.text, insertParagraph: (i, t) => { d.text = t + '\n' + d.text; }, replaceText: (re, rep) => { d.text = d.text.replace(new RegExp(re, 'g'), () => rep.replace(/\\\$/g, '$')); } }), saveAndClose() {} };
    },
  };
  const PropertiesService = { getScriptProperties: () => ({ setProperty: (k, v) => { props[k] = v; }, getProperty: (k) => props[k] || null, deleteProperty: (k) => { delete props[k]; } }) };
  const ScriptApp = {
    newTrigger: (fn) => ({ timeBased: () => ({ after: () => ({ create: () => { calls.triggers.push(fn); } }), at: () => ({ create: () => { calls.triggers.push(fn); } }) }) }),
    getProjectTriggers: () => [], deleteTrigger() {},
  };
  const MailApp = { getRemainingDailyQuota: () => (opts.quota == null ? 100 : opts.quota), sendEmail: (o) => { calls.mails.push(o); } };
  return { DriveApp, DocumentApp, PropertiesService, ScriptApp, MailApp, calls, props };
}

function load(world, g, user = 'accounts@varshaforgings.com') {
  const Utilities = { formatDate, getUuid: () => 'u', sleep() {} };
  const SpreadsheetApp = { getActiveSpreadsheet: () => (world ? world.ss : null), openById: () => (world ? world.ss : null) };
  const Session = { getActiveUser: () => ({ getEmail: () => user }), getEffectiveUser: () => ({ getEmail: () => user }) };
  return loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '20_Feeds.gs', '30_Calc.gs', '32_Engine.gs', '50_Payslips.gs', '51_Email.gs', '61_Notify.gs'],
    Object.assign({ Utilities, SpreadsheetApp, Session }, g || {}));
}

const P = '2026-09';
const LOCK = 'LOCK-2026-09-STAFF-202609301000';
const OUT = plain(load(null).OUTPUT_COLUMNS);
const staffRow = { LOCK_ID: LOCK, PERIOD: P, POPULATION: 'STAFF', EMP_ID: 'VFL1', EMPLOYEE_NAME: 'Locked Name', WORKING_DAYS: 30, PRESENT_DAYS: 25.5, WO_DAYS: 4, PH_DAYS: 0, EL: 1, CL: 0, SL: 0,
  WORKED_PAYABLE_DAYS: 30.5, BASIC: 123456, HRA: 30000, CONVEYANCE: 3000, EDUCATION: 3000, MEDICAL: 3000, PRO_DEV: 1500, COMMUNICATION: 1000, UNIFORM: 2000, WASHING: 4500,
  OT_HOURS: 2.5, OT_AMOUNT: 1000, ARREARS: 0, TOTAL_EARNINGS: 1234567, PF_EMPLOYEE: 1800, ESI_EMPLOYEE: 0, PT: 200, MLWF: 0, CANTEEN: 500, SOCIETY: 100, ADVANCE: 0, TDS: 250,
  OTHER_DEDUCTION: 1000, TOTAL_DEDUCTIONS: 3850, NET_PAY: 100000 };
const workerRow = { LOCK_ID: 'LOCK-W', PERIOD: P, POPULATION: 'PERMANENT_WORKER', EMP_ID: 'VFL2', WORKING_DAYS: 27, PRESENT_DAYS: 25, EL: 2, CL: 0, SL: 0, PH_DAYS: 0, WORKED_PAYABLE_DAYS: 27,
  BASIC: 8000, HEAT: 156, VDA: 2575, PRODUCTION_ALLOWANCE: 0, EFFICIENCY_DEDUCTION: 0, LEAVE_ENCASHMENT: 300, TOTAL_EARNINGS: 48738, TOTAL_DEDUCTIONS: 8280, NET_PAY: 40458 };
const emp1 = { EMP_ID: 'VFL1', EMPLOYEE_NAME: 'Asha Patil', DEPARTMENT: 'Accounts', DESIGNATION: 'Executive', DOJ_AS_SOURCE: '01/04/2019', EMAIL_ID: 'asha@x.com',
  UAN: '123', PAN: 'ABCDE1234F', BANK_ACCOUNT: '999' };

const salStaff = { EMP_ID: 'VFL1', EFFECTIVE_FROM: '2026-09-01', EFFECTIVE_TO: '', BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890,
  EDUCATION_PM_INR: 1800, WASHING_PM_INR: 2835, MEDICAL_PM_INR: 1500, PRO_DEV_PM_INR: 945, COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260 };
const salWorker = { EMP_ID: 'VFL2', EFFECTIVE_FROM: '2026-09-01', EFFECTIVE_TO: '', BASIC_PM_INR: 8000, HRA_PM_INR: 3200, CONVEYANCE_PM_INR: 1000,
  EDUCATION_PM_INR: 500, WASHING_PM_INR: 700, HEAT_MASTER_INR: 150, VDA_MASTER_INR: 2575, PRODUCTION_MASTER_INR: 8500 };

// ---------------------------------------------------------------- tests
test('token maps cover every real template token', () => {
  const c = load(null);
  const s = plain(c.templateTokenCheck(tplText(STAFF_TOKENS), c.PAYSLIP_TOKEN_MAP_STAFF));
  const w = plain(c.templateTokenCheck(tplText(WORKER_TOKENS), c.PAYSLIP_TOKEN_MAP_WORKER));
  assert.deepEqual(s.missingTokens, []);
  assert.deepEqual(w.missingTokens, []);
  assert.equal(s.tokens.length, STAFF_TOKENS.length);
  assert.equal(w.tokens.length, WORKER_TOKENS.length);
  assert.ok(s.tokens.includes('PAYROLL_PERIOD'), 'escaped underscores are normalised');
});

test('every column referenced by the maps exists in the unified output columns', () => {
  const c = load(null);
  const staff = plain(c.buildReplacements('STAFF', Object.fromEntries(OUT.map((k) => [k, k === 'PERIOD' ? '2026-09' : 1])), {}, salStaff));
  assert.ok(Object.keys(staff).length > 40);
  assert.throws(() => c.buildReplacements('STAFF', { PERIOD: P }, {}), /No SALARY_STRUCTURE/);
});

test('templateTokenCheck fails closed on unknown token', () => {
  const c = load(null);
  const r = plain(c.templateTokenCheck('a {{BASIC}} b {{MYSTERY}} {{ NET_PAY }}', c.PAYSLIP_TOKEN_MAP_STAFF));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingTokens, ['MYSTERY']);
});

test('Indian money and days formatting', () => {
  const c = load(null);
  assert.equal(c.payslipMoney(123456), '1,23,456.00');
  assert.equal(c.payslipMoney(123456.5), '1,23,456.50');
  assert.equal(c.payslipMoney(1234567), '12,34,567.00');
  assert.equal(c.payslipMoney(999), '999.00');
  assert.equal(c.payslipMoney(1000), '1,000.00');
  assert.equal(c.payslipMoney(0), '0.00');
  assert.equal(c.payslipMoney(''), '0.00');
  assert.equal(c.payslipMoney(-12345.5), '-12,345.50');
  assert.equal(c.payslipMoney(1234.4), '1,234.40');
  assert.equal(c.payslipMoney(0.005), '0.01');
  assert.equal(c.payslipMoney(1.005), '1.01', 'float guard, half away from zero');
  assert.equal(c.payslipMoney(-0.001), '0.00');
  assert.equal(c.payslipMoney(99999999.99), '9,99,99,999.99');
  assert.throws(() => c.payslipMoney('abc'));
  assert.equal(c.payslipMoneyLine(0), '');
  assert.equal(c.payslipMoneyLine(''), '');
  assert.equal(c.payslipMoneyLine(null), '');
  assert.equal(c.payslipMoneyLine(0.001), '');
  assert.equal(c.payslipMoneyLine(1500), '1,500.00');
  assert.equal(c.payslipDays(25.5), '25.5');
  assert.equal(c.payslipDays(30), '30.0');
  assert.equal(c.payslipDays(2.25), '2.3');
  assert.equal(c.payslipDays(0), '0.0');
  assert.equal(c.payslipDays(-12), '-12.0');
  assert.equal(c.payslipDays(''), '0.0');
  assert.equal(c.payslipPeriodLabel('2026-09'), 'September 2026');
});

test('sensitive and leave tokens are always blank, even if data is present', () => {
  const c = load(null);
  const row = Object.assign({}, staffRow, { UAN: 'U1', PAN: 'P1', ESI_NO: 'E1', BANK_ACCOUNT: 'B1', EL_AVAILABLE: 9 });
  ['STAFF', 'PERMANENT_WORKER'].forEach((pop) => {
    const r = plain(c.buildReplacements(pop, row, emp1, pop === 'STAFF' ? salStaff : salWorker));
    ['UAN', 'ESI_NO', 'PAN', 'EL_AVAILABLE', 'CL_AVAILABLE', 'SL_AVAILABLE'].forEach((t) => assert.equal(r[t], '', `${pop} ${t}`));
    assert.ok(!Object.values(r).some((v) => ['U1', 'P1', 'E1', 'B1', '123', 'ABCDE1234F', '999'].includes(v)));
  });
});

test('replacements for a staff locked row', () => {
  const c = load(null);
  const r = plain(c.buildReplacements('STAFF', staffRow, emp1, salStaff));
  assert.equal(r.PAYROLL_PERIOD, 'September 2026');
  assert.equal(r.EMP_NAME, 'Asha Patil');
  assert.equal(r.EMP_ID, 'VFL1');
  assert.equal(r.DOJ, '01-Apr-2019', 'DOJ dd/mm/yyyy read day-first, printed DD-MMM-YYYY');
  assert.equal(r.DEPARTMENT, 'Accounts');
  assert.equal(r.BASIC, '1,23,456.00');
  assert.equal(r.GROSS_EARNINGS, '12,34,567.00');
  assert.equal(r.PRESENT_DAYS, '25.5');
  assert.equal(r.WEEKLY_OFF_DAYS, '4.0');
  assert.equal(r.DAYS_PAYABLE, '30.5');
  assert.equal(r.PROF_TAX, '200.00');
  assert.equal(r.SALARY_ADVANCE, '', 'zero deduction line is blank');
  assert.equal(r.TDS, '250.00');
  assert.equal(r.OT_HOURS, '2.5');
  assert.equal(r.NET_PAY_WORDS, 'One Lakh Rupees Only');
  assert.equal(r.WORKING_DAYS, undefined);
  // *_RATE tokens = fixed monthly structure (SALARY_STRUCTURE), not earned amounts
  assert.equal(r.BASIC_RATE, '12,600.00');
  assert.equal(r.HRA_RATE, '7,560.00');
  assert.equal(r.CONVEYANCE_RATE, '1,890.00');
  assert.equal(r.EDUCATION_RATE, '1,800.00');
  assert.equal(r.WASHING_RATE, '2,835.00');
  assert.equal(r.MEDICAL_RATE, '1,500.00');
  assert.equal(r.PRO_DEV_RATE, '945.00');
  assert.equal(r.COMMUNICATION_RATE, '630.00');
  assert.equal(r.UNIFORM_RATE, '1,260.00');
  assert.equal(r.HEAT_ALLOWANCE_RATE, undefined);
});

test('replacements for a worker locked row (no employee master row falls back to locked identity)', () => {
  const c = load(null);
  const r = plain(c.buildReplacements('PERMANENT_WORKER', workerRow, { EMP_ID: 'VFL2', EMPLOYEE_NAME: 'Ravi', DEPARTMENT: 'Forge', DESIGNATION: 'Operator', DOJ_AS_SOURCE: new Date(2020, 0, 5) }, salWorker));
  assert.equal(r.WORKING_DAYS, '27.0');
  assert.equal(r.HEAT_ALLOWANCE, '156.00');
  assert.equal(r.VDA, '2,575.00');
  assert.equal(r.PRODUCTION_ALLOWANCE_OFFSET, '', 'EFFICIENCY_DEDUCTION is 0: zero line blank');
  assert.equal(r.PRODUCTION_ALLOWANCE, '', 'production pay = slab amount paid (80% -> 0): zero line blank');
  assert.equal(r.LEAVE_ENCASHMENT, '300.00');
  assert.equal(r.NET_PAY, '40,458.00');
  assert.equal(r.BASIC_RATE, '8,000.00');
  assert.equal(r.HEAT_ALLOWANCE_RATE, '150.00');
  assert.equal(r.VDA_RATE, '2,575.00');
  assert.equal(r.PRODUCTION_ALLOWANCE_RATE, '8,500.00');
  assert.equal(r.MEDICAL_RATE, undefined);
  assert.equal(r.NET_PAY_WORDS, 'Forty Thousand Four Hundred Fifty Eight Rupees Only');
  assert.equal(r.DOJ, '05-Jan-2020', 'Date cell');
  assert.equal(r.WEEKLY_OFF_DAYS, undefined);
  assert.equal(c.payslipFileName('VFL2', P), 'VFL2_2026-09_Payslip.pdf');
});

test('emailReleaseAllowed needs all three conditions', () => {
  const c = load(null);
  const ok = { EMAIL_RELEASE_ENABLED: 'TRUE', 'EMAIL_RELEASE_2026-09': 'TRUE' };
  const A = 'accounts@varshaforgings.com';
  assert.equal(c.emailReleaseAllowed(ok, P, A, A).allowed, true);
  assert.equal(c.emailReleaseAllowed(ok, P, 'ACCOUNTS@varshaforgings.com', A).allowed, true);
  assert.equal(c.emailReleaseAllowed({ EMAIL_RELEASE_ENABLED: true, 'EMAIL_RELEASE_2026-09': true }, P, A, A).allowed, true);
  assert.equal(c.emailReleaseAllowed(Object.assign({}, ok, { EMAIL_RELEASE_ENABLED: 'FALSE' }), P, A, A).allowed, false);
  assert.equal(c.emailReleaseAllowed(Object.assign({}, ok, { EMAIL_RELEASE_ENABLED: 'yes' }), P, A, A).allowed, false);
  assert.equal(c.emailReleaseAllowed({ EMAIL_RELEASE_ENABLED: 'TRUE' }, P, A, A).allowed, false);
  assert.equal(c.emailReleaseAllowed(ok, '2026-10', A, A).allowed, false);
  assert.equal(c.emailReleaseAllowed(ok, P, 'hr@varshaforgings.com', A).allowed, false);
  assert.equal(c.emailReleaseAllowed(ok, P, '', A).allowed, false);
  assert.equal(c.emailReleaseAllowed(ok, P, '', '').allowed, false);
});

test('buildEmailQueue: QUEUED / SKIPPED, idempotent, ignores other locks and non-GENERATED', () => {
  const c = load(null);
  const reg = [
    { LOCK_ID: LOCK, PERIOD: P, EMP_ID: 'A', STATUS: 'GENERATED', PDF_ID: 'p1' },
    { LOCK_ID: LOCK, PERIOD: P, EMP_ID: 'B', STATUS: 'GENERATED', PDF_ID: 'p2' },
    { LOCK_ID: LOCK, PERIOD: P, EMP_ID: 'C', STATUS: 'FAILED', PDF_ID: '' },
    { LOCK_ID: 'OTHER', PERIOD: P, EMP_ID: 'D', STATUS: 'GENERATED', PDF_ID: 'p4' },
    { LOCK_ID: LOCK, PERIOD: P, EMP_ID: 'E', STATUS: 'GENERATED', PDF_ID: 'p5' },
  ];
  const master = [{ EMP_ID: 'A', EMAIL_ID: 'a@x.com' }, { EMP_ID: 'B', EMAIL_ID: '' }, { EMP_ID: 'C', EMAIL_ID: 'c@x.com' }, { EMP_ID: 'E', EMAIL_ID: 'not-an-email' }];
  const q = plain(c.buildEmailQueue(reg, master, [], LOCK));
  assert.deepEqual(q.map((r) => [r.EMP_ID, r.STATUS]), [['A', 'QUEUED'], ['B', 'SKIPPED'], ['E', 'SKIPPED']]);
  assert.equal(q[0].TO_EMAIL, 'a@x.com');
  assert.equal(q[0].PDF_ID, 'p1');
  assert.deepEqual(plain(c.buildEmailQueue(reg, master, q, LOCK)), []);
  // B gets an email later -> queued once
  const master2 = master.map((m) => (m.EMP_ID === 'B' ? { EMP_ID: 'B', EMAIL_ID: 'b@x.com' } : m));
  const q2 = plain(c.buildEmailQueue(reg, master2, q, LOCK));
  assert.deepEqual(q2.map((r) => [r.EMP_ID, r.STATUS]), [['B', 'QUEUED']]);
});

// ---- generatePayslips guards
const PC_HDR = ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'LOCK_ID'];
const CTRL_HDR = ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'];
const REG_HDR = ['LOCK_ID', 'PERIOD', 'EMP_ID', 'POPULATION', 'DOC_ID', 'PDF_ID', 'PDF_URL', 'GENERATED_AT', 'STATUS'];
const LOG_HDR = ['LOCK_ID', 'PERIOD', 'EMP_ID', 'TO_EMAIL', 'PDF_ID', 'STATUS', 'ATTEMPTED_AT', 'ERROR'];
function world({ status = 'LOCKED', folder = 'FOLDER', locked = [staffRow], control = {}, master = [emp1], salary } = {}) {
  const w = makeWorld();
  w.put('PAYROLL_PERIOD_CATEGORY', PC_HDR, [
    { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'STAFF', STATUS: status, LOCK_ID: status === 'LOCKED' ? LOCK : '' },
    { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'CONSULTANT', STATUS: 'LOCKED', LOCK_ID: 'LOCK-C' },
    { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'PUNE_STAFF', STATUS: 'LOCKED', LOCK_ID: 'LOCK-P' },
  ]);
  const ctl = Object.assign({ PAYSLIP_FOLDER_ID: folder, PAYSLIP_TEMPLATE_STAFF_ID: 'TPL_STAFF', PAYSLIP_TEMPLATE_WORKER_ID: 'TPL_WORKER',
    ACCOUNTS_APPROVER_EMAIL: 'accounts@varshaforgings.com' }, control);
  w.put('PAYROLL_CONTROL', CTRL_HDR, Object.entries(ctl).map(([KEY, VALUE]) => ({ KEY, VALUE })));
  w.put('PAYROLL_LOCKED', ['LOCK_ID'].concat(OUT), locked);
  w.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'DEPARTMENT', 'DESIGNATION', 'DOJ_AS_SOURCE', 'EMAIL_ID'], master);
  const SAL_HDR = ['EMP_ID', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'BASIC_PM_INR', 'HRA_PM_INR', 'CONVEYANCE_PM_INR', 'EDUCATION_PM_INR', 'WASHING_PM_INR', 'MEDICAL_PM_INR',
    'PRO_DEV_PM_INR', 'COMMUNICATION_PM_INR', 'UNIFORM_PM_INR', 'HEAT_MASTER_INR', 'VDA_MASTER_INR', 'PRODUCTION_MASTER_INR'];
  const defaultSal = locked.map((l) => Object.assign({}, salStaff, { EMP_ID: l.EMP_ID }));
  w.put('SALARY_STRUCTURE', SAL_HDR, salary || defaultSal);
  w.put('PAYSLIP_REGISTER', REG_HDR);
  w.put('PAYSLIP_EMAIL_LOG', LOG_HDR);
  w.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  return w;
}

test('generatePayslips refuses when not LOCKED', () => {
  const g = fakeGoogle();
  const c = load(world({ status: 'ACCOUNTS_APPROVED' }), g);
  assert.throws(() => c.generatePayslips(P, 'STAFF'), /not LOCKED/);
  assert.equal(g.calls.copies, 0);
});

test('generatePayslips refuses CONSULTANT and PUNE_STAFF', () => {
  const g = fakeGoogle();
  const c = load(world(), g);
  assert.throws(() => c.generatePayslips(P, 'CONSULTANT'), /only for STAFF/);
  assert.throws(() => c.generatePayslips(P, 'PUNE_STAFF'), /only for STAFF/);
  assert.equal(g.calls.copies, 0);
});

test('generatePayslips refuses when PAYSLIP_FOLDER_ID is blank', () => {
  const g = fakeGoogle();
  const c = load(world({ folder: '' }), g);
  assert.throws(() => c.generatePayslips(P, 'STAFF'), /PAYSLIP_FOLDER_ID/);
  assert.equal(g.calls.copies, 0);
});

test('generatePayslips refuses when no locked rows or unknown template token', () => {
  let g = fakeGoogle();
  assert.throws(() => load(world({ locked: [] }), g).generatePayslips(P, 'STAFF'), /No PAYROLL_LOCKED rows/);
  g = fakeGoogle({ badTemplate: true });
  assert.throws(() => load(world(), g).generatePayslips(P, 'STAFF'), /SURPRISE_TOKEN/);
  assert.equal(g.calls.copies, 0);
});

test('generatePayslips happy path: PDF named, temp doc trashed, register written, idempotent', () => {
  const g = fakeGoogle();
  const w = world();
  const c = load(w, g);
  const r = plain(c.generatePayslips(P, 'STAFF'));
  assert.equal(r.generated, 1);
  assert.deepEqual(g.calls.created, ['VFL1_2026-09_Payslip.pdf']);
  assert.equal(g.calls.trashed.length, 1);
  const reg = w.sheets.PAYSLIP_REGISTER.objs();
  assert.equal(reg.length, 1);
  assert.equal(reg[0].STATUS, 'GENERATED');
  assert.equal(reg[0].LOCK_ID, LOCK);
  const r2 = plain(c.generatePayslips(P, 'STAFF'));
  assert.equal(r2.generated, 0);
  assert.equal(w.sheets.PAYSLIP_REGISTER.objs().length, 1);
  assert.equal(g.calls.sharing, 0);
});

test('generatePayslips batches 25 and schedules a continuation trigger', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(Object.assign({}, staffRow, { EMP_ID: 'E' + i }));
  const g = fakeGoogle();
  const w = world({ locked: rows, master: [] });
  const c = load(w, g);
  const r = plain(c.generatePayslips(P, 'STAFF'));
  assert.equal(r.generated, 25);
  assert.equal(r.remaining, 5);
  assert.deepEqual(g.calls.triggers, ['continuePayslips_']);
  assert.ok(g.props.PAYSLIP_JOB);
  c.continuePayslips_();
  assert.equal(w.sheets.PAYSLIP_REGISTER.objs().filter((x) => x.STATUS === 'GENERATED').length, 30);
  assert.equal(g.props.PAYSLIP_JOB, undefined);
});

test('queue then send: gating, SENT marking, quota stop', () => {
  const g = fakeGoogle();
  const w = world({ control: { EMAIL_RELEASE_ENABLED: 'TRUE', 'EMAIL_RELEASE_2026-09': 'TRUE' } });
  let c = load(w, g);
  c.generatePayslips(P, 'STAFF');
  const q = plain(c.queuePayslipEmails(P, 'STAFF'));
  assert.equal(q.queued, 1);
  assert.equal(plain(c.queuePayslipEmails(P, 'STAFF')).queued, 0);
  assert.equal(w.sheets.PAYSLIP_EMAIL_LOG.objs().length, 1);
  // wrong runner refused
  assert.throws(() => load(w, g, 'hr@varshaforgings.com').sendQueuedEmails(P, 'STAFF'), /refused/);
  assert.equal(g.calls.mails.length, 0);
  // quota exhausted: nothing sent
  const gq = fakeGoogle({ quota: 3 });
  const rq = plain(load(w, Object.assign({}, g, { MailApp: gq.MailApp })).sendQueuedEmails(P, 'STAFF'));
  assert.equal(rq.stoppedForQuota, true);
  assert.equal(rq.sent, 0);
  // proper send (menu style: no population)
  c = load(w, g);
  const s = plain(c.sendQueuedEmails(P));
  assert.equal(s.STAFF.sent, 1);
  assert.equal(g.calls.mails.length, 1);
  assert.equal(g.calls.mails[0].subject, 'Payslip – September 2026 – Varsha Forgings');
  assert.equal(g.calls.mails[0].to, 'asha@x.com');
  const log = w.sheets.PAYSLIP_EMAIL_LOG.objs()[0];
  assert.equal(log.STATUS, 'SENT');
  assert.ok(log.ATTEMPTED_AT);
  assert.equal(plain(c.sendQueuedEmails(P, 'STAFF')).sent, 0);
});

test('generatePayslips: RATE tokens come from effective-dated SALARY_STRUCTURE; missing structure -> that employee FAILED', () => {
  const rows = [staffRow, Object.assign({}, staffRow, { EMP_ID: 'NOSAL' })];
  const salary = [
    Object.assign({}, salStaff, { EMP_ID: 'VFL1', EFFECTIVE_FROM: '2026-08-01', BASIC_PM_INR: 1 }),
    Object.assign({}, salStaff, { EMP_ID: 'VFL1', EFFECTIVE_FROM: '2026-09-01', BASIC_PM_INR: 12600 }),
    Object.assign({}, salStaff, { EMP_ID: 'VFL1', EFFECTIVE_FROM: '2026-10-01', BASIC_PM_INR: 99999 }),
  ];
  const g = fakeGoogle();
  const seen = [];
  const origOpen = g.DocumentApp.openById;
  g.DocumentApp.openById = (id) => {
    const d = origOpen(id), gb = d.getBody;
    d.getBody = () => { const b = gb(), rt = b.replaceText; b.replaceText = (re, rep) => { if (/BASIC_RATE/.test(re)) seen.push(rep); rt(re, rep); }; return b; };
    return d;
  };
  const w = world({ locked: rows, salary, master: [] });
  const r = plain(load(w, g).generatePayslips(P, 'STAFF'));
  assert.equal(r.generated, 1);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].empId, 'NOSAL');
  assert.match(r.failed[0].error, /No SALARY_STRUCTURE/);
  assert.deepEqual(seen, ['12,600.00']);
  const reg = w.sheets.PAYSLIP_REGISTER.objs();
  assert.deepEqual(reg.map((x) => [x.EMP_ID, x.STATUS]), [['VFL1', 'GENERATED'], ['NOSAL', 'FAILED']]);
  assert.equal(g.calls.created.length, 1);
});

// ---- identity tokens from the hidden EMPLOYEE_STATUTORY_IDS tab (generation time only)
const IDS_HDR = ['EMP_ID', 'UAN', 'ESI_NO', 'PAN', 'BANK_NAME', 'BANK_ACCOUNT', 'IFSC'];
function idsTab(w, rows) {
  const s = w.put('EMPLOYEE_STATUTORY_IDS', IDS_HDR, rows.map((o) => ({ EMP_ID: o.id, UAN: o.uan, ESI_NO: o.esi, PAN: o.pan, BANK_NAME: o.bank, BANK_ACCOUNT: o.acct, IFSC: o.ifsc })));
  const reads = [];
  const orig = s.getRange;
  s.getRange = (r, c, nr, nc) => { reads.push({ r, c, nr, nc }); return orig(r, c, nr, nc); };
  s.reads = reads;
  return s;
}

test('payslipIdentityColumns: flat EMPLOYEE_STATUTORY_IDS header is mapped by exact name; unknown layout is tolerated', () => {
  const c = load(null);
  assert.deepEqual(plain(c.payslipIdentityColumns(IDS_HDR)), { emp: 0, UAN: 1, ESI_NO: 2, PAN: 3, BANK_NAME: 4, BANK_ACCOUNT: 5, IFSC: 6 });
  assert.deepEqual(plain(c.payslipIdentityColumns([])), { emp: -1, UAN: -1, PAN: -1, ESI_NO: -1, BANK_NAME: -1, IFSC: -1, BANK_ACCOUNT: -1 });
  assert.equal(c.payslipIdentityValue(123456789012), '123456789012');
  assert.equal(c.payslipIdentityValue(' ABCDE1234F '), 'ABCDE1234F');
  assert.equal(c.payslipIdentityValue(''), '');
  assert.equal(c.payslipIdentityValue(null), '');
});

test('payslipReadIdentity_: matches EMP_ID, reads one column at a time, missing tab/employee -> blank', () => {
  const w = world();
  const raw = idsTab(w, [
    { id: 'VFL1', bank: 'Test Bank', ifsc: 'TEST0001', acct: '111122223333', uan: '100200300400', pan: 'ABCDE1234F', esi: '5555' },
    { id: 'VFL9', bank: 'Other', ifsc: 'X', acct: '1', uan: '2', pan: 'Y', esi: '3' }]);
  const c = load(w, fakeGoogle());
  const r = plain(c.payslipReadIdentity_('STAFF', ['vfl1', 'NOPE']));
  assert.equal(r.matched, 1);
  assert.deepEqual(r.byEmp, { VFL1: { UAN: '100200300400', PAN: 'ABCDE1234F', ESI_NO: '5555', BANK_NAME: 'Test Bank', IFSC: 'TEST0001', BANK_ACCOUNT: '111122223333' } });
  raw.reads.forEach((x) => { if (x.r !== 1) assert.equal(x.nc, 1, 'one column at a time'); });
  assert.deepEqual(plain(load(makeWorld(), fakeGoogle()).payslipReadIdentity_('PERMANENT_WORKER', ['VFL2'])), { byEmp: {}, matched: 0, note: 'identity tab EMPLOYEE_STATUTORY_IDS not found' });
  assert.deepEqual(plain(c.payslipReadIdentity_('STAFF', ['ZZZ'])).byEmp, {});
});

test('identity tokens: printed from EMPLOYEE_STATUTORY_IDS; missing employee -> blank; leave-available tokens stay blank; never stored', () => {
  const c = load(null);
  const ident = { UAN: '100200300400', PAN: 'ABCDE1234F', ESI_NO: '5555', BANK_NAME: 'Test Bank', IFSC: 'TEST0001', BANK_ACCOUNT: '111122223333' };
  const r = plain(c.buildReplacements('STAFF', staffRow, emp1, salStaff, ident));
  assert.deepEqual([r.UAN, r.PAN, r.ESI_NO, r.BANK_NAME, r.IFSC, r.BANK_ACCOUNT, r.ACCOUNT_NO], ['100200300400', 'ABCDE1234F', '5555', 'Test Bank', 'TEST0001', '111122223333', '111122223333']);
  assert.deepEqual([r.EL_AVAILABLE, r.CL_AVAILABLE, r.SL_AVAILABLE], ['', '', '']);
  const none = plain(c.buildReplacements('STAFF', staffRow, emp1, salStaff, null));
  assert.deepEqual([none.UAN, none.PAN, none.ESI_NO, none.BANK_NAME, none.IFSC, none.BANK_ACCOUNT], ['', '', '', '', '', '']);
  // worker: same tokens, deduction offset token is 0
  const wk = plain(c.buildReplacements('PERMANENT_WORKER', workerRow, { EMP_ID: 'VFL2' }, salWorker, { UAN: '7' }));
  assert.equal(wk.UAN, '7');
  assert.equal(wk.PRODUCTION_ALLOWANCE_OFFSET, '');
  // generatePayslips: identity read per batch, only counts are reported, nothing written to any tab / audit
  const w = world();
  idsTab(w, [{ id: 'VFL1', bank: 'Test Bank', ifsc: 'TEST0001', acct: '111122223333', uan: '100200300400', pan: 'ABCDE1234F', esi: '5555' }]);
  const g = fakeGoogle();
  const cc = load(w, g);
  const res = plain(cc.generatePayslips(P, 'STAFF'));
  assert.equal(res.generated, 1);
  assert.equal(res.identityMatched, '1 of 1');
  Object.keys(w.sheets).filter((n) => n !== 'EMPLOYEE_STATUTORY_IDS').forEach((n) => {
    ['100200300400', 'ABCDE1234F', '111122223333', 'TEST0001', 'Test Bank'].forEach((secret) => assert.ok(!JSON.stringify(w.sheets[n].data).includes(secret), n + ' must not contain identity data'));
  });
});

// ---------------------------------------------------------------- review fixes: DOJ, blank zero lines, folded earnings, footing, offset
test('DOJ prints DD-MMM-YYYY: Date, ISO, dd/mm/yyyy (day-first), d-Mon-yy and d-Mon-yyyy accepted; unparseable -> blank', () => {
  const c = load(null);
  const doj = (v) => plain(c.buildReplacements('STAFF', staffRow, { DOJ_AS_SOURCE: v }, salStaff)).DOJ;
  assert.equal(doj('05/06/2005'), '05-Jun-2005', 'day first, not May-6');
  assert.equal(doj('31/12/2019'), '31-Dec-2019');
  assert.equal(doj('5-Jun-05'), '05-Jun-2005');
  assert.equal(doj('05-Jun-2005'), '05-Jun-2005');
  assert.equal(doj('12-Sep-98'), '12-Sep-1998', '2-digit year above the current one -> 19xx');
  assert.equal(doj('12 sept 2021'), '12-Sep-2021');
  assert.equal(doj('2020-01-05'), '05-Jan-2020');
  assert.equal(doj(new Date(2020, 0, 5)), '05-Jan-2020');
  assert.equal(doj('31/04/2020'), '', 'not a real date');
  assert.equal(doj('garbage'), '');
  assert.equal(doj(''), '');
  assert.equal(doj(undefined), '');
});

test('zero-valued earning / deduction lines print BLANK; gross, total deductions, net (and words) are always shown', () => {
  const c = load(null);
  const row = Object.assign({}, staffRow, { ARREARS: 0, OT_AMOUNT: 0, ADVANCE: 0, TDS: 0, OTHER_DEDUCTION: 0, MLWF: 0, ESI_EMPLOYEE: 0, TOTAL_EARNINGS: 0, TOTAL_DEDUCTIONS: 0, NET_PAY: 0 });
  const r = plain(c.buildReplacements('STAFF', row, emp1, Object.assign({}, salStaff, { UNIFORM_PM_INR: 0 })));
  ['ARREARS', 'OT_AMOUNT', 'SALARY_ADVANCE', 'TDS', 'OTHER_DEDUCTION', 'MLWF', 'ESI_EMPLOYEE', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'UNIFORM_RATE'].forEach((t) => assert.equal(r[t], '', t));
  assert.deepEqual([r.GROSS_EARNINGS, r.TOTAL_DEDUCTIONS, r.NET_PAY], ['0.00', '0.00', '0.00']);
  assert.equal(r.NET_PAY_WORDS, 'Zero Rupees Only');
  assert.equal(r.BASIC, '1,23,456.00');
});

test('earnings with no template line are folded into OTHER_ALLOWANCE; STAFF also folds LEAVE_ENCASHMENT; worker keeps its encashment line', () => {
  const c = load(null);
  const extra = { OTHER_ALLOWANCE: 100, PRODUCTION_INCENTIVE: 250.5, OT_EXTRA_WORK: 40, LEAVE_ENCASHMENT: 1000 };
  const s = plain(c.buildReplacements('STAFF', Object.assign({}, staffRow, extra), emp1, salStaff));
  assert.equal(s.OTHER_ALLOWANCE, '1,390.50');
  const w = plain(c.buildReplacements('PERMANENT_WORKER', Object.assign({}, workerRow, extra), { EMP_ID: 'VFL2' }, salWorker));
  assert.equal(w.OTHER_ALLOWANCE, '390.50');
  assert.equal(w.LEAVE_ENCASHMENT, '1,000.00');
  assert.equal(plain(c.buildReplacements('STAFF', Object.assign({}, staffRow, { PRODUCTION_INCENTIVE: 5 }), emp1, salStaff)).OTHER_ALLOWANCE, '5.00');
  assert.throws(() => c.buildReplacements('STAFF', Object.assign({}, staffRow, { OT_EXTRA_WORK: 'x' }), emp1, salStaff));
});

test('PRODUCTION_ALLOWANCE_OFFSET follows EFFICIENCY_DEDUCTION (0 today -> blank line)', () => {
  const c = load(null);
  const off = (v) => plain(c.buildReplacements('PERMANENT_WORKER', Object.assign({}, workerRow, { EFFICIENCY_DEDUCTION: v }), { EMP_ID: 'VFL2' }, salWorker)).PRODUCTION_ALLOWANCE_OFFSET;
  assert.equal(off(0), '');
  assert.equal(off(1250), '1,250.00');
});

const salStaffFull = { BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890, EDUCATION_PM_INR: 1890, MEDICAL_PM_INR: 1890, PRO_DEV_PM_INR: 945,
  COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260, WASHING_PM_INR: 2835, FIXED_GROSS_PM_AS_SOURCE_INR: 31500 };
const salWorkerFull = { BASIC_PM_INR: 15000, HRA_PM_INR: 7000, CONVEYANCE_PM_INR: 2500, WASHING_PM_INR: 2130, EDUCATION_PM_INR: 2000, HEAT_MASTER_INR: 150,
  VDA_MASTER_INR: 2790, PRODUCTION_MASTER_INR: 8500, FIXED_GROSS_PM_AS_SOURCE_INR: 39000 };
const CFG_ROWS = [
  ['PF_WAGE_CEILING', 15000], ['PF_EMPLOYEE_RATE', 0.12], ['PF_MAX_EMPLOYEE', 1800], ['ESI_EMPLOYEE_RATE', 0.0075],
  ['ESI_EXEMPT_ABOVE', 21000], ['ESI_EMPLOYER_RATE', 0.0325], ['WORKER_VDA_RATE', 103], ['WORKER_HEAT_RATE', 5.78],
  ['PT_SLABS', '[{"min":0,"max":7500,"pt":0},{"min":7500.01,"max":10000,"pt":175},{"min":10000.01,"max":null,"pt":200}]'],
  ['MLWF_EMPLOYEE_RATE', 25], ['PT_FEB_AMOUNT', 300], ['MLWF_MONTHS', '6,12'], ['STAFF_OT_MULTIPLIER', 2],
  ['WORKER_OT_MULTIPLIER', 2], ['STAFF_PF_WAGE_COMPONENTS', 'BASIC,CONVEYANCE,EDUCATION,MEDICAL'],
  ['STAFF_COMPONENT_PCTS', '{"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}'],
  ['EMPLOYER_PF_RATE_STAFF', 0.1301], ['EMPLOYER_PF_RATE_WORKER', 0.1301], ['BONUS_RATE_STAFF', 0.0833],
  ['GRATUITY_RATE_STAFF', 0.0483], ['BONUS_RATE_WORKER', 0.18], ['GRATUITY_RATE_WORKER', 0.0481],
].map(([KEY, VALUE]) => ({ KEY, VALUE, EFFECTIVE_FROM: '2026-09', EFFECTIVE_TO: '', VERSION: 1 }));
const cents = (t) => (t === '' ? 0 : Math.round(parseFloat(t.replace(/,/g, '')) * 100));

test('printed earnings lines sum to TOTAL_EARNINGS (gross) for BOTH templates, with every extra earning non-zero', () => {
  const c = load(null);
  const cfg = plain(c.resolveStatutory(CFG_ROWS, '2026-09')).values;
  const eff = [[81, 4500], [82, 5000], [83, 6500], [84, 7500], [85, 8500], [90, 8500]].map(([p, a]) => ({ EFFICIENCY_PERCENT_EXACT: p, INCENTIVE_SLAB_INR: a, IMPLEMENTATION_STATE: 'X' }));
  const adj = { ARREARS: 700, DISPATCH_INCENTIVE: 300, OTHER_ALLOWANCE: 240, LEAVE_ENCASHMENT: 1100, OT_EXTRA_WORK: 410, PRODUCTION_INCENTIVE: 520, TDS: 0, OTHER_DEDUCTION: 50, PENALTY: 0, CANTEEN_EXTRA: 0 };
  const att = { PRESENT_DAYS: 30, PHYSICAL_PRESENT_DAYS: 30, WEEK_OFF: 0, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0 };
  const base = { period: '2026-09', workingDays: 30, otHours: 12.5, canteen: 0, society: 0, advance: 0, cfg, ptExemptSet: new Set(), efficiencyConfig: eff, adjustments: adj, attendance: att };
  const staffRes = plain(c.calcStaff(Object.assign({ population: 'STAFF', emp: { EMP_ID: 'VFL1' }, salary: salStaffFull }, base)));
  const workerRes = plain(c.calcWorker(Object.assign({ population: 'PERMANENT_WORKER', emp: { EMP_ID: 'VFL2' }, salary: salWorkerFull, efficiencyPct: 90 }, base)));
  const lines = {
    STAFF: ['BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'WASHING', 'MEDICAL', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'ARREARS', 'OT_AMOUNT', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE'],
    PERMANENT_WORKER: ['BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'WASHING', 'HEAT_ALLOWANCE', 'VDA', 'PRODUCTION_ALLOWANCE', 'ARREARS', 'OT_AMOUNT', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT'],
  };
  [['STAFF', staffRes, salStaffFull], ['PERMANENT_WORKER', workerRes, salWorkerFull]].forEach(([pop, res, sal]) => {
    assert.ok(!res.exceptions.some((e) => e.severity === 'BLOCKER'), pop + ' calc blocked: ' + JSON.stringify(res.exceptions));
    const row = Object.assign({ PERIOD: '2026-09', POPULATION: pop, EMP_ID: 'X' }, res.row);
    const r = plain(c.buildReplacements(pop, row, { EMP_ID: 'X' }, sal));
    const printed = lines[pop].reduce((t, k) => t + cents(r[k]), 0);
    assert.ok(cents(r.GROSS_EARNINGS) > 0);
    // exact footing: STAFF total is stored to 2dp; on the WORKER slip OT_AMOUNT prints in whole rupees to match its whole-rupee total
    const tol = 0;
    assert.ok(Math.abs(printed - cents(r.GROSS_EARNINGS)) <= tol, `${pop}: printed earnings ${printed} vs TOTAL_EARNINGS ${r.GROSS_EARNINGS}`);
    const noExtras = lines[pop].filter((k) => k !== 'OTHER_ALLOWANCE' && k !== 'LEAVE_ENCASHMENT' && k !== 'OT_AMOUNT').reduce((t, k) => t + cents(r[k]), 0);
    assert.ok(printed > noExtras, 'extras are printed');
    // every extra really printed somewhere
    assert.ok(cents(r.OTHER_ALLOWANCE) >= (pop === 'STAFF' ? 240 + 520 + 410 + 1100 : 240 + 520 + 410) * 100);
    // deductions foot as well
    const ded = ['PF_EMPLOYEE', 'ESI_EMPLOYEE', 'PROF_TAX', 'MLWF', 'SALARY_ADVANCE', 'SOCIETY', 'CANTEEN', 'OTHER_DEDUCTION', 'TDS', 'PRODUCTION_ALLOWANCE_OFFSET'].reduce((t, k) => t + cents(r[k] === undefined ? '' : r[k]), 0);
    assert.equal(ded, cents(r.TOTAL_DEDUCTIONS), pop + ' deductions');
  });
});

test('worker slip prints OT_AMOUNT in whole rupees; stored value and staff slip unchanged', () => {
  const c = load(null);
  const w = plain(c.buildReplacements('PERMANENT_WORKER', Object.assign({}, workerRow, { OT_AMOUNT: 1234.56 }), { EMP_ID: 'VFL2' }, salWorker));
  assert.equal(w.OT_AMOUNT, '1,235.00');
  assert.equal(plain(c.buildReplacements('PERMANENT_WORKER', Object.assign({}, workerRow, { OT_AMOUNT: 0.2 }), { EMP_ID: 'VFL2' }, salWorker)).OT_AMOUNT, '');
  assert.equal(plain(c.buildReplacements('STAFF', Object.assign({}, staffRow, { OT_AMOUNT: 1234.56 }), emp1, salStaff)).OT_AMOUNT, '1,234.56');
});


// ---------------------------------------------------------------- quota-aware sending
const EMAILS = (n) => Array.from({ length: n }, (_, i) => ({ EMP_ID: 'E' + i, EMPLOYEE_NAME: 'N' + i, DEPARTMENT: 'D', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/04/2019', EMAIL_ID: 'e' + i + '@x.com' }));
function quotaWorld(n, extraCtl = {}) {
  const master = EMAILS(n);
  const locked = master.map((m) => Object.assign({}, staffRow, { EMP_ID: m.EMP_ID }));
  const w = world({ locked, master, control: Object.assign({ EMAIL_RELEASE_ENABLED: 'TRUE', 'EMAIL_RELEASE_2026-09': 'TRUE', HR_APPROVER_EMAIL: 'hr@varshaforgings.com' }, extraCtl) });
  const g0 = fakeGoogle();
  const c0 = load(w, g0);
  while (c0.generatePayslips(P, 'STAFF').remaining > 0) c0.continuePayslips_();
  c0.queuePayslipEmails(P, 'STAFF');
  return w;
}
/** stateful fakes: a daily quota that drops by one per mail, stateful triggers, optional throw at a given remaining quota */
function quotaGoogle(quota, opts = {}) {
  const g = fakeGoogle();
  const st = { quota, triggers: [], deleted: 0, ats: [] };
  g.st = st;
  g.MailApp = { getRemainingDailyQuota: () => st.quota, sendEmail: (o) => {
    if (opts.throwAt != null && st.quota <= opts.throwAt) throw new Error('Service invoked too many times for one day: email.');
    st.quota--; g.calls.mails.push(o); } };
  g.ScriptApp = { newTrigger: (fn) => ({ timeBased: () => ({ at: (d) => ({ create: () => { st.triggers.push({ fn, getHandlerFunction: () => fn }); st.ats.push(d); } }) }) }),
    getProjectTriggers: () => st.triggers, deleteTrigger: (t) => { st.triggers = st.triggers.filter((x) => x !== t); st.deleted++; } };
  return g;
}
const sentTo = (g) => g.calls.mails.filter((m) => /@x\.com$/.test(m.to));

test('emailNextResumeAt_ is 09:00 IST of the next IST day', () => {
  const c = load(null);
  assert.equal(c.emailNextResumeAt_(new Date('2026-09-30T10:00:00Z')).toISOString(), '2026-10-01T03:30:00.000Z');
  assert.equal(c.emailNextResumeAt_(new Date('2026-09-30T20:00:00Z')).toISOString(), '2026-10-02T03:30:00.000Z'); // already 1-Oct in IST
});

test('quota: stops at the reserve, leaves the rest QUEUED, one trigger; resumes via the trigger with no duplicates; trigger removed at the end', () => {
  const w = quotaWorld(6, { EMAIL_QUOTA_RESERVE: '2' });
  const g = quotaGoogle(5); // 3 sendable now (5 -> 2 = reserve)
  const c = load(w, g);
  const r1 = plain(c.sendQueuedEmails(P, 'STAFF'));
  assert.equal(r1.sent, 3);
  assert.equal(r1.remainingQueued, 3);
  assert.equal(r1.stoppedForQuota, true);
  assert.equal(g.st.triggers.length, 1);
  assert.equal(g.st.triggers[0].fn, 'continueEmails_');
  assert.equal(g.st.ats[0].toISOString().slice(11), '03:30:00.000Z');
  const log = () => w.sheets.PAYSLIP_EMAIL_LOG.objs().map((l) => l.STATUS);
  assert.deepEqual(log().sort(), ['QUEUED', 'QUEUED', 'QUEUED', 'SENT', 'SENT', 'SENT']);
  // a second manual run while still out of quota must not add a second trigger
  c.sendQueuedEmails(P, 'STAFF');
  assert.equal(g.st.triggers.length, 1);
  // next day: quota is back; the trigger runs as nobody in particular
  g.st.quota = 100;
  const c2 = load(w, g, '');
  c2.continueEmails_();
  assert.equal(sentTo(g).length, 6);
  assert.equal(new Set(sentTo(g).map((m) => m.to)).size, 6, 'no duplicates');
  assert.deepEqual(log(), Array(6).fill('SENT'));
  assert.equal(g.st.triggers.length, 0);
  assert.equal(g.props.EMAIL_JOBS, undefined);
  c2.continueEmails_();
  assert.equal(sentTo(g).length, 6);
});

test('quota: a thrown quota error is not FAILED; the row stays QUEUED and resumes', () => {
  const w = quotaWorld(3);
  const g = quotaGoogle(100, { throwAt: 98 }); // 2 go out, the 3rd throws
  const r = plain(load(w, g).sendQueuedEmails(P, 'STAFF'));
  assert.equal(r.sent, 2);
  assert.equal(r.failed, 0);
  assert.equal(r.remainingQueued, 1);
  assert.equal(r.stoppedForQuota, true);
  assert.deepEqual(w.sheets.PAYSLIP_EMAIL_LOG.objs().map((l) => l.STATUS).sort(), ['QUEUED', 'SENT', 'SENT']);
  assert.equal(g.st.triggers.length, 1);
  g.st.quota = 100;
  load(w, g, '').continueEmails_();
  assert.deepEqual(w.sheets.PAYSLIP_EMAIL_LOG.objs().map((l) => l.STATUS), ['SENT', 'SENT', 'SENT']);
  assert.equal(g.st.triggers.length, 0);
});

test('quota: default reserve is 10; an already SENT payslip is never sent again', () => {
  const w = quotaWorld(2);
  const g = quotaGoogle(11); // 11 > 10: one mail, then 10 <= reserve
  const r = plain(load(w, g).sendQueuedEmails(P, 'STAFF'));
  assert.equal(r.sent, 1);
  assert.equal(r.remainingQueued, 1);
  // a duplicate QUEUED row for an employee already SENT is skipped, not mailed
  const dup = w.sheets.PAYSLIP_EMAIL_LOG.objs().find((l) => l.STATUS === 'SENT');
  const logSheet = w.sheets.PAYSLIP_EMAIL_LOG;
  const hdr = logSheet.data[0];
  logSheet.data.push(hdr.map((h) => (h === 'STATUS' ? 'QUEUED' : dup[h])));
  g.st.quota = 100;
  const r2 = plain(load(w, g, '').continueEmails_()[0]);
  assert.equal(r2.sent, 1);
  assert.equal(sentTo(g).length, 2);
  assert.equal(new Set(sentTo(g).map((m) => m.to)).size, 2);
});

test('quota: HR gets a counts-only note when the run ends; a resume run re-checks the release flags', () => {
  const w = quotaWorld(3, { EMAIL_QUOTA_RESERVE: '1' });
  const g = quotaGoogle(3);
  load(w, g).sendQueuedEmails(P, 'STAFF');
  const hr = g.calls.mails.filter((m) => m.to === 'hr@varshaforgings.com');
  assert.equal(hr.length, 1);
  assert.match(hr[0].body, /^Payslips 2026-09 STAFF: 2 sent, 1 continue tomorrow$/);
  // release switched off before the next day: nothing is sent
  const rows = w.sheets.PAYROLL_CONTROL.data;
  const i = rows.findIndex((r) => r[0] === 'EMAIL_RELEASE_ENABLED');
  rows[i][1] = 'FALSE';
  g.st.quota = 100;
  const before = sentTo(g).length;
  load(w, g, '').continueEmails_();
  assert.equal(sentTo(g).length, before);
});

// ---------------------------------------------------------------- test payslip
const draftRow = Object.assign({}, staffRow, { RUN_ID: 'RUN1', EMP_ID: 'VFL1001', EMPLOYEE_NAME: 'Owner', TOTAL_EARNINGS: 0, NET_PAY: 0, TOTAL_DEDUCTIONS: 0 });
function testWorld(opts = {}) {
  const w = world(Object.assign({ locked: [], master: [Object.assign({}, emp1, { EMP_ID: 'VFL1001', EMPLOYEE_NAME: 'Yash', EMAIL_ID: 'emp@x.com' })],
    salary: [Object.assign({}, salStaff, { EMP_ID: 'VFL1001' })] }, opts.world));
  w.put('PAYROLL_DRAFT', ['RUN_ID'].concat(OUT.filter((k) => k !== 'RUN_ID')), opts.draft === undefined ? [draftRow] : opts.draft);
  const ctl = w.sheets.PAYROLL_CONTROL;
  ctl.data.push(['HR_APPROVER_EMAIL', 'hr@varshaforgings.com'], ['OWNER_APPROVER_EMAIL', 'owner@x.com']);
  return w;
}
function testGoogle(opts = {}) {
  const g = fakeGoogle();
  g.calls.folders = [];
  g.DriveApp.createFolder = (nm) => { g.calls.folders.push(nm); return Object.assign(g.DriveApp.getFolderById(), { getId: () => 'NEWFOLDER' }); };
  const ga = g.DocumentApp.openById;
  const texts = [];
  g.DocumentApp.openById = (id) => { const d = ga(id); const gb = d.getBody; const sc = d.saveAndClose; d.saveAndClose = () => { texts.push(d.getBody().getText()); sc(); }; d.getBody = gb; return d; };
  g.texts = texts;
  const gf = g.DriveApp.getFileById;
  g.DriveApp.getFileById = (id) => { const f = gf(id); const mc = f.makeCopy; f.makeCopy = (...a) => { const r = mc(...a); if (opts.tplMark) { /* marker token is in the template text already */ } return r; }; return f; };
  return g;
}

test('test payslip: only to the running user, no register/log rows, TEST file name, AUDIT TEST_PAYSLIP, copy trashed, zeros shown', () => {
  const w = testWorld();
  const g = testGoogle();
  const msg = load(w, g, 'owner@x.com').payslipTestSend('VFL1001', '');
  assert.match(msg, /sent to owner@x.com/);
  assert.equal(g.calls.mails.length, 1);
  assert.equal(g.calls.mails[0].to, 'owner@x.com');
  assert.equal(g.calls.mails[0].subject, 'TEST payslip Yash 2026-09');
  assert.equal(g.calls.mails[0].attachments[0].name, 'TEST - VFL1001_2026-09_Payslip.pdf');
  assert.deepEqual(g.calls.created, ['TEST - VFL1001_2026-09_Payslip.pdf']);
  assert.equal(w.sheets.PAYSLIP_REGISTER.objs().length, 0);
  assert.equal(w.sheets.PAYSLIP_EMAIL_LOG.objs().length, 0);
  assert.ok(w.sheets.AUDIT_LOG.objs().some((r) => /TEST_PAYSLIP/.test(r.Message)));
  assert.equal(g.calls.trashed.length, 1);
  assert.match(g.texts[0], /0\.00/);
  assert.equal(g.calls.mails.some((m) => m.to === 'emp@x.com'), false);
});

test('test payslip: EMAIL_RELEASE_ENABLED is ignored; HR approver allowed, others refused', () => {
  const w = testWorld();
  const g = testGoogle();
  assert.match(load(w, g, 'hr@varshaforgings.com').payslipTestSend('VFL1001', P), /sent to hr@varshaforgings.com/);
  assert.throws(() => load(w, testGoogle(), 'accounts@varshaforgings.com').payslipTestSend('VFL1001', ''), /Not allowed/);
  assert.throws(() => load(w, testGoogle(), '').payslipTestSend('VFL1001', ''), /Not allowed/);
});

test('test payslip: marker paragraph prepended when the template has no {{TEST_MARK}}, replaced in place when it has', () => {
  const g1 = testGoogle();
  load(testWorld(), g1, 'owner@x.com').payslipTestSend('VFL1001', '');
  assert.ok(g1.texts[0].startsWith('TEST – NOT A PAYSLIP\n'));
  const g2 = testGoogle();
  g2.DocumentApp.openById('TPL_STAFF'); // templates are shared by reference below
  const c = load(testWorld(), g2, 'owner@x.com');
  // add the marker token to the staff template via a fresh fake document text
  const origGet = g2.DriveApp.getFileById;
  g2.DriveApp.getFileById = (id) => { const f = origGet(id); const mc = f.makeCopy; f.makeCopy = (...a) => { const r = mc(...a); return r; }; return f; };
  const gd = g2.DocumentApp.openById;
  g2.DocumentApp.openById = (id) => { const d = gd(id); if (id === 'TPL_STAFF' || /^COPY/.test(id)) { const t = d.getBody().getText(); if (!/TEST_MARK/.test(t)) d.getBody().replaceText(escapeForTest('{{PAN}}'), '{{TEST_MARK}} {{PAN}}'); } return d; };
  c.payslipTestSend('VFL1001', '');
  assert.ok(/^TEST – NOT A PAYSLIP /m.test(g2.texts[0]) || /TEST – NOT A PAYSLIP/.test(g2.texts[0]));
  assert.equal((g2.texts[0].match(/TEST – NOT A PAYSLIP/g) || []).length, 1, 'exactly one marker');
  assert.equal(g2.texts[0].startsWith('TEST – NOT A PAYSLIP\n'), false);
});
function escapeForTest(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

test('real payslips blank the {{TEST_MARK}} token', () => {
  const c = load(null);
  assert.equal(plain(c.buildReplacements('STAFF', Object.assign({}, staffRow), emp1, salStaff)).TEST_MARK, '');
});

test('test payslip: blank PAYSLIP_FOLDER_ID -> folder created, id stored, result says so; real path still blocks', () => {
  const w = testWorld({ world: { folder: '' } });
  const g = testGoogle();
  const msg = load(w, g, 'owner@x.com').payslipTestSend('VFL1001', '');
  assert.deepEqual(g.calls.folders, ['VFL HR OS Payslips']);
  assert.match(msg, /created Drive folder "VFL HR OS Payslips"/);
  assert.ok(w.sheets.PAYROLL_CONTROL.objs().some((r) => r.KEY === 'PAYSLIP_FOLDER_ID' && r.VALUE === 'NEWFOLDER'));
  const w2 = world({ folder: '' });
  assert.throws(() => load(w2, testGoogle()).generatePayslips(P, 'STAFF'), /PAYSLIP_FOLDER_ID is blank/);
});

test('test payslip: falls back to the latest LOCKED row; nothing at all explains what to do', () => {
  const w = testWorld({ draft: [], world: { locked: [Object.assign({}, staffRow, { EMP_ID: 'VFL1001' })] } });
  assert.match(load(w, testGoogle(), 'owner@x.com').payslipTestSend('VFL1001', ''), /from LOCKED row/);
  const w2 = testWorld({ draft: [] });
  assert.throws(() => load(w2, testGoogle(), 'owner@x.com').payslipTestSend('VFL1001', ''), /Calculate a draft first/);
});

test('test payslip: picks the latest draft period and ignores top-up (SUPP-) rows', () => {
  const c = load(null);
  const d = [Object.assign({}, draftRow, { PERIOD: '2026-09' }), Object.assign({}, draftRow, { PERIOD: '2026-10' }), Object.assign({}, draftRow, { PERIOD: '2026-11', RUN_ID: 'SUPP-1' })];
  const r = plain(c.payslipTestPick(d, [], 'vfl1001', ''));
  assert.equal(r.row.PERIOD, '2026-10');
  assert.equal(r.source, 'DRAFT');
});
