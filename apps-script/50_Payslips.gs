/**
 * 50_Payslips.gs - Stage 8: payslip PDFs from PAYROLL_LOCKED (STAFF, PERMANENT_WORKER only).
 * Template placeholder syntax (read from the two template Docs): {{TOKEN}}, e.g. {{PAYROLL_PERIOD}}.
 * Pure parts (token maps, formatting, replacements, templateTokenCheck) never touch Drive/Sheets.
 * PDFs are created in the owner-only payslip folder; sharing is never changed here.
 * Identity tokens (UAN, ESI_NO, PAN, bank) come from the hidden EMPLOYEE_STATUTORY_IDS tab at generation time only.
 */
var PAYSLIP_BATCH_SIZE = 25;
var PAYSLIP_JOB_PROP = 'PAYSLIP_JOB';
/** Built-in default; the payslip populations are the ACTIVE categories with PAYSLIP = Y (payslipPopulations()). */
var PAYSLIP_POPULATIONS = ['STAFF', 'PERMANENT_WORKER'];
var PAYSLIP_CONTINUE_FN = 'continuePayslips_';

// ---------------------------------------------------------------- pure formatting

/** 1234567.5 -> '12,34,567.50' (Indian grouping, always 2 decimals, half away from zero). Blank -> '0.00'. Non-numeric throws. */
function payslipMoney(v) {
  if (v === '' || v == null) return '0.00';
  var n = Number(v);
  if (typeof v === 'boolean' || !isFinite(n)) throw new Error('Non-numeric money value "' + v + '"');
  var cents = Math.floor(Math.abs(n) * 100 + 0.5 + 1e-9);
  var s = String(Math.floor(cents / 100)), p = cents % 100;
  if (s.length > 3) {
    var last3 = s.slice(-3), rest = s.slice(0, -3);
    s = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (n < 0 && cents !== 0 ? '-' : '') + s + '.' + pad2_(p);
}

/** Earning / deduction LINE: payslipMoney, but BLANK when the value is zero (or blank). Totals use payslipMoney (always shown). */
function payslipMoneyLine(v) {
  var t = payslipMoney(v);
  return t === '0.00' ? '' : t;
}

/** Days / hours: always 1 decimal ('31.0', '0.5', '-12.0'). Blank -> '0.0'. */
function payslipDays(v) {
  if (v === '' || v == null) return '0.0';
  var n = Number(v);
  if (typeof v === 'boolean' || !isFinite(n)) throw new Error('Non-numeric days value "' + v + '"');
  var r = Math.round(Math.abs(n) * 10) / 10;
  return (n < 0 && r !== 0 ? '-' : '') + r.toFixed(1);
}

/**
 * DOJ -> 'DD-MMM-YYYY' (05-Jun-2005). Date and ISO exact; numeric text is read DAY-FIRST (dd/mm/yyyy); d-Mon-yy and
 * d-Mon-yyyy accepted. Unparseable -> '' (never garbage).
 */
function payslipDoj(v) {
  var iso = parseDojDayFirst_(v);
  if (!iso) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1];
  return m[3] + '-' + mon + '-' + m[1];
}

/** '2026-09' -> 'September 2026'. */
function payslipPeriodLabel(period) {
  return monthName(period) + ' ' + parsePeriod(period).year;
}

// ---------------------------------------------------------------- token maps

/** Always-shown money (totals, gross, net). */
function pslM_(col) { return function (row) { return payslipMoney(row[col]); }; }
/** Earning / deduction line: blank when zero. */
function pslL_(col) { return function (row) { return payslipMoneyLine(row[col]); }; }
/** Sum of several locked-row columns as a line (blank when zero). */
function pslSumL_(cols) {
  return function (row) {
    var t = 0;
    cols.forEach(function (c) { var n = Number(row[c] === '' || row[c] == null ? 0 : row[c]); if (!isFinite(n)) throw new Error('Non-numeric money value in ' + c); t += n; });
    return payslipMoneyLine(t);
  };
}
function pslD_(col) { return function (row) { return payslipDays(row[col]); }; }
function pslBlank_() { return ''; }
function pslEmp_(empCol, rowCol) {
  return function (row, emp) {
    var v = emp && emp[empCol] != null && emp[empCol] !== '' ? emp[empCol] : (rowCol ? row[rowCol] : '');
    if (Object.prototype.toString.call(v) === '[object Date]') v = toIsoDate(v);
    return v == null ? '' : String(v);
  };
}

/**
 * Leave balances (EL_AVAILABLE / CL_AVAILABLE / SL_AVAILABLE): read at generation time, read-only, from the yearly balance
 * tabs of the leave spreadsheet (21_Leave.gs leave_readBalances_). Blank when the balance cannot be identified confidently.
 */
var PAYSLIP_BALANCE_TOKENS = { EL_AVAILABLE: 'EL', CL_AVAILABLE: 'CL', SL_AVAILABLE: 'SL' };
function pslBal_(type) {
  return function (row, emp, sal, ident, bal) {
    var v = bal ? bal[type] : undefined;
    return v === undefined || v === null || v === '' || !isFinite(Number(v)) ? '' : payslipDays(v);
  };
}

/**
 * Sensitive identity tokens (UAN, ESI number, PAN, bank name / account / IFSC) are printed on the payslip but are only
 * ever read at generation time from the hidden EMPLOYEE_STATUTORY_IDS tab (see payslipReadIdentity_).
 * They are never written to any tab, audit entry or log. token -> field of the identity record.
 */
var PAYSLIP_IDENTITY_TOKENS = { UAN: 'UAN', ESI_NO: 'ESI_NO', PAN: 'PAN', BANK_NAME: 'BANK_NAME', BANK_ACCOUNT: 'BANK_ACCOUNT',
  ACCOUNT_NO: 'BANK_ACCOUNT', IFSC: 'IFSC' };
function pslIdent_(field) { return function (row, emp, sal, ident) { return ident && ident[field] ? String(ident[field]) : ''; }; }

/**
 * *_RATE tokens show the employee's fixed monthly structure effective for the period (SALARY_STRUCTURE, picked with
 * engine_pickSalary). Token functions receive (lockedRow, empMasterRow, salaryRow, identity, leaveBalance). A missing salary row makes
 * buildReplacements throw, so that employee's payslip FAILS instead of printing blank/zero rates.
 */
var PAYSLIP_RATE_COLUMNS = {
  BASIC_RATE: 'BASIC_PM_INR', HRA_RATE: 'HRA_PM_INR', CONVEYANCE_RATE: 'CONVEYANCE_PM_INR',
  EDUCATION_RATE: 'EDUCATION_PM_INR', WASHING_RATE: 'WASHING_PM_INR', MEDICAL_RATE: 'MEDICAL_PM_INR',
  PRO_DEV_RATE: 'PRO_DEV_PM_INR', COMMUNICATION_RATE: 'COMMUNICATION_PM_INR', UNIFORM_RATE: 'UNIFORM_PM_INR',
  HEAT_ALLOWANCE_RATE: 'HEAT_MASTER_INR', VDA_RATE: 'VDA_MASTER_INR', PRODUCTION_ALLOWANCE_RATE: 'PRODUCTION_MASTER_INR'
};

function pslRate_(col) {
  return function (row, emp, sal) {
    if (!sal) throw new Error('No SALARY_STRUCTURE row effective for ' + row.PERIOD + ' (' + col + ')');
    return payslipMoneyLine(sal[col]);
  };
}

/** Locked-row columns folded into the OTHER_ALLOWANCE token (earnings with no template line of their own). */
var PAYSLIP_OTHER_ALLOWANCE_COLS = ['OTHER_ALLOWANCE', 'PRODUCTION_INCENTIVE', 'OT_EXTRA_WORK'];

function pslCommonMap_() {
  var m = {
    PAYROLL_PERIOD: function (row) { return payslipPeriodLabel(row.PERIOD); },
    EMP_NAME: pslEmp_('EMPLOYEE_NAME', 'EMPLOYEE_NAME'),
    EMP_ID: function (row, emp) { return String((emp && emp.EMP_ID) || row.EMP_ID || ''); },
    DEPARTMENT: pslEmp_('DEPARTMENT', 'DEPARTMENT'),
    DESIGNATION: pslEmp_('DESIGNATION', 'DESIGNATION'),
    DOJ: function (row, emp) { return payslipDoj(emp && emp.DOJ_AS_SOURCE); },
    PRESENT_DAYS: pslD_('PRESENT_DAYS'), EL_DAYS: pslD_('EL'), CL_DAYS: pslD_('CL'), SL_DAYS: pslD_('SL'),
    PH_DAYS: pslD_('PH_DAYS'), DAYS_PAYABLE: pslD_('WORKED_PAYABLE_DAYS'),
    BASIC_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.BASIC_RATE), HRA_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.HRA_RATE),
    CONVEYANCE_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.CONVEYANCE_RATE),
    EDUCATION_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.EDUCATION_RATE), WASHING_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.WASHING_RATE),
    BASIC: pslL_('BASIC'), HRA: pslL_('HRA'), CONVEYANCE: pslL_('CONVEYANCE'), EDUCATION: pslL_('EDUCATION'),
    WASHING: pslL_('WASHING'), ARREARS: pslL_('ARREARS'),
    OT_HOURS: pslD_('OT_HOURS'), OT_AMOUNT: pslL_('OT_AMOUNT'),
    DISPATCH_INCENTIVE: pslL_('DISPATCH_INCENTIVE'),
    // earnings that have no line of their own on the slip are folded in so the printed lines add up to the gross (item below)
    OTHER_ALLOWANCE: pslSumL_(PAYSLIP_OTHER_ALLOWANCE_COLS),
    GROSS_EARNINGS: pslM_('TOTAL_EARNINGS'),
    PF_EMPLOYEE: pslL_('PF_EMPLOYEE'), ESI_EMPLOYEE: pslL_('ESI_EMPLOYEE'), PROF_TAX: pslL_('PT'),
    MLWF: pslL_('MLWF'), SALARY_ADVANCE: pslL_('ADVANCE'), SOCIETY: pslL_('SOCIETY'), CANTEEN: pslL_('CANTEEN'),
    OTHER_DEDUCTION: pslL_('OTHER_DEDUCTION'), TOTAL_DEDUCTIONS: pslM_('TOTAL_DEDUCTIONS'),
    NET_PAY: pslM_('NET_PAY'),
    NET_PAY_WORDS: function (row) { return amountToIndianWords(Number(row.NET_PAY || 0)); }
  };
  Object.keys(PAYSLIP_BALANCE_TOKENS).forEach(function (t) { m[t] = pslBal_(PAYSLIP_BALANCE_TOKENS[t]); });
  Object.keys(PAYSLIP_IDENTITY_TOKENS).forEach(function (t) { m[t] = pslIdent_(PAYSLIP_IDENTITY_TOKENS[t]); });
  return m;
}

function pslExtend_(base, extra) { Object.keys(extra).forEach(function (k) { base[k] = extra[k]; }); return base; }

var PAYSLIP_TOKEN_MAP_STAFF = pslExtend_(pslCommonMap_(), {
  WEEKLY_OFF_DAYS: pslD_('WO_DAYS'),
  MEDICAL_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.MEDICAL_RATE), PRO_DEV_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.PRO_DEV_RATE),
  COMMUNICATION_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.COMMUNICATION_RATE),
  UNIFORM_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.UNIFORM_RATE),
  MEDICAL: pslL_('MEDICAL'), PRO_DEV: pslL_('PRO_DEV'), COMMUNICATION: pslL_('COMMUNICATION'),
  UNIFORM: pslL_('UNIFORM'), TDS: pslL_('TDS'),
  // the STAFF template has no LEAVE_ENCASHMENT line: it is printed inside OTHER_ALLOWANCE
  OTHER_ALLOWANCE: pslSumL_(PAYSLIP_OTHER_ALLOWANCE_COLS.concat(['LEAVE_ENCASHMENT']))
});

var PAYSLIP_TOKEN_MAP_WORKER = pslExtend_(pslCommonMap_(), {
  WORKING_DAYS: pslD_('WORKING_DAYS'),
  HEAT_ALLOWANCE_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.HEAT_ALLOWANCE_RATE),
  VDA_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.VDA_RATE),
  PRODUCTION_ALLOWANCE_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.PRODUCTION_ALLOWANCE_RATE),
  HEAT_ALLOWANCE: pslL_('HEAT'), VDA: pslL_('VDA'), PRODUCTION_ALLOWANCE: pslL_('PRODUCTION_ALLOWANCE'),
  PRODUCTION_ALLOWANCE_OFFSET: pslL_('EFFICIENCY_DEDUCTION'), LEAVE_ENCASHMENT: pslL_('LEAVE_ENCASHMENT'),
  OTHER_ALLOWANCE: pslSumL_(PAYSLIP_OTHER_ALLOWANCE_COLS)
});

/** Template key (STAFF | WORKER) of a category: PAYROLL_CATEGORY_CONFIG.PAYSLIP_TEMPLATE_KEY, else the built-in default. */
function payslipTemplateKey(population) {
  var e = categoryEntry(population);
  if (e && e.payslip && e.templateKey) return e.templateKey;
  if (population === POP.STAFF) return 'STAFF';
  if (population === POP.PERMANENT_WORKER) return 'WORKER';
  return '';
}

function payslipTokenMap(population) {
  var key = payslipTemplateKey(population);
  if (key === 'STAFF') return PAYSLIP_TOKEN_MAP_STAFF;
  if (key === 'WORKER') return PAYSLIP_TOKEN_MAP_WORKER;
  throw new Error('No payslip for population "' + population + '"');
}

// ---------------------------------------------------------------- pure template checks / replacements

/** All {{TOKEN}} names in text. Drive text export escapes underscores (\_); those backslashes are ignored. */
function extractTemplateTokens(templateText) {
  var out = [], seen = {}, re = /\{\{\s*([A-Za-z0-9_\\]+?)\s*\}\}/g, m;
  var text = String(templateText || '');
  while ((m = re.exec(text))) {
    var t = m[1].replace(/\\/g, '');
    if (!seen[t]) { seen[t] = true; out.push(t); }
  }
  return out;
}

/** Fail-closed check: every token in the template must exist in the map. */
function templateTokenCheck(templateText, map) {
  var tokens = extractTemplateTokens(templateText);
  var missing = tokens.filter(function (t) { return !Object.prototype.hasOwnProperty.call(map, t); });
  return { ok: missing.length === 0, tokens: tokens, missingTokens: missing };
}

/** {token: string} for every token of the population's map. Throws on non-numeric amounts. ident = identity record, bal = {EL, CL, SL} (or null). */
function buildReplacements(population, lockedRow, emp, salary, ident, bal) {
  var map = payslipTokenMap(population), out = {};
  Object.keys(map).forEach(function (t) {
    var d = map[t];
    var v = typeof d === 'function' ? d(lockedRow, emp || {}, salary || null, ident || null, bal || null) : (lockedRow[d] == null ? '' : lockedRow[d]);
    out[t] = v == null ? '' : String(v);
  });
  return out;
}

function payslipFileName(empId, period) { return empId + '_' + period + '_Payslip.pdf'; }

function escapeRegex_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Pure: pending locked rows = not GENERATED in register for lockId, not already attempted in this job. */
function payslipPending(lockedRows, registerRows, lockId, attempted) {
  var done = {}, tried = {};
  (registerRows || []).forEach(function (r) {
    if (String(r.LOCK_ID) === lockId && String(r.STATUS) === 'GENERATED') done[String(r.EMP_ID)] = true;
  });
  (attempted || []).forEach(function (id) { tried[id] = true; });
  return (lockedRows || []).filter(function (r) {
    var id = String(r.EMP_ID);
    return !done[id] && !tried[id];
  });
}

// ---------------------------------------------------------------- identity (UAN / ESI no / PAN / bank) from EMPLOYEE_STATUTORY_IDS

/**
 * The only place the sensitive identity values live: the hidden, protected EMPLOYEE_STATUTORY_IDS tab (EMP_ID, UAN,
 * ESI_NO, PAN, BANK_NAME, BANK_ACCOUNT, IFSC), written by the HR-only employee dialog. Read at generation time only.
 */
var PAYSLIP_IDENTITY_TAB = 'EMPLOYEE_STATUTORY_IDS';
var PAYSLIP_IDENTITY_FIELDS = ['UAN', 'ESI_NO', 'PAN', 'BANK_NAME', 'BANK_ACCOUNT', 'IFSC'];

/** Pure: header row -> {emp, UAN, ESI_NO, PAN, BANK_NAME, BANK_ACCOUNT, IFSC} 0-based indexes (-1 = absent). Exact header names. */
function payslipIdentityColumns(headerRow) {
  var idx = {};
  (headerRow || []).forEach(function (h, i) {
    var k = String(h == null ? '' : h).trim().toUpperCase();
    if (k && !(k in idx)) idx[k] = i;
  });
  var cols = { emp: 'EMP_ID' in idx ? idx.EMP_ID : -1 };
  PAYSLIP_IDENTITY_FIELDS.forEach(function (f) { cols[f] = f in idx ? idx[f] : -1; });
  return cols;
}

/** Pure: cell -> printable text (integers without exponent / decimals, trimmed). */
function payslipIdentityValue(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return isFinite(v) ? (v % 1 === 0 ? v.toFixed(0) : String(v)) : '';
  if (Object.prototype.toString.call(v) === '[object Date]') return '';
  return String(v).trim();
}

/**
 * Reads identity values for the given EMP_IDs from EMPLOYEE_STATUTORY_IDS (generation time only; values live in memory
 * for the duration of the batch and are never written anywhere). Only the EMP_ID column and the identity columns of the
 * matched rows are read, one column at a time. Missing tab / column / employee -> blank tokens (not a failure).
 * `population` is accepted for call compatibility (the tab is shared by every category).
 * Returns {byEmp:{EMP_ID:{UAN,PAN,ESI_NO,BANK_NAME,IFSC,BANK_ACCOUNT}}, matched:n, note:''}.
 */
function payslipReadIdentity_(population, empIds) {
  var out = { byEmp: {}, matched: 0, note: '' };
  var sheet = getSheet(PAYSLIP_IDENTITY_TAB);
  if (!sheet) { out.note = 'identity tab ' + PAYSLIP_IDENTITY_TAB + ' not found'; return out; }
  var lc = sheet.getLastColumn(), lr = sheet.getLastRow(), first = 2;
  if (lc < 1 || lr < first) { out.note = 'identity tab is empty'; return out; }
  var cols = payslipIdentityColumns(sheet.getRange(1, 1, 1, lc).getValues()[0]);
  if (cols.emp < 0) { out.note = 'EMP_ID column not found'; return out; }
  var want = {};
  (empIds || []).forEach(function (id) { want[feeds_empId_(id)] = true; });
  var n = lr - first + 1;
  var ids = sheet.getRange(first, cols.emp + 1, n, 1).getValues();
  var hits = [];
  ids.forEach(function (r, i) { var id = feeds_empId_(r[0]); if (id && want[id] && !(id in out.byEmp)) { out.byEmp[id] = {}; hits.push({ i: i, id: id }); } });
  if (!hits.length) return out;
  PAYSLIP_IDENTITY_FIELDS.forEach(function (f) {
    if (cols[f] < 0) return;
    var vals = sheet.getRange(first, cols[f] + 1, n, 1).getValues();
    hits.forEach(function (h) { out.byEmp[h.id][f] = payslipIdentityValue(vals[h.i][0]); });
  });
  out.matched = hits.length;
  return out;
}

// ---------------------------------------------------------------- orchestration

function payslipLockId_(period, population) {
  var rows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY).filter(function (r) {
    return normalizePeriod(r.PAYROLL_MONTH) === period && String(r.PAYROLL_CATEGORY).trim() === population;
  });
  if (!rows.length) throw new Error('No PAYROLL_PERIOD_CATEGORY row for ' + period + ' x ' + population);
  return { status: String(rows[0].STATUS || '').trim(), lockId: String(rows[0].LOCK_ID || '').trim() };
}

/** Shared validation. Returns {lockId, folderId, lockedRows}. Throws (refuses) with a clear message. */
function payslipPreflight_(period, population, lockId) {
  guardPeriod_(period);
  if (payslipPopulations().indexOf(population) < 0) {
    throw new Error('Payslips are only for ' + payslipPopulations().join(' and ') + ' (categories with PAYSLIP=Y), got "' + population + '"');
  }
  var st = payslipLockId_(period, population);
  if (st.status !== PERIOD_STATUS.LOCKED) {
    throw new Error(period + ' x ' + population + ' is ' + (st.status || 'not set') + ', not LOCKED - payslips refused');
  }
  var useLock = String(lockId || st.lockId || '').trim();
  if (!useLock) throw new Error('No LOCK_ID for ' + period + ' x ' + population);
  var folderId = String(getControl('PAYSLIP_FOLDER_ID', '')).trim();
  if (!folderId) throw new Error('PAYSLIP_FOLDER_ID is blank in PAYROLL_CONTROL - payslip step blocked');
  var lockedRows = readObjects(TABS.PAYROLL_LOCKED).filter(function (r) {
    return String(r.LOCK_ID).trim() === useLock && String(r.POPULATION).trim() === population &&
      normalizePeriod(r.PERIOD) === period;
  });
  if (!lockedRows.length) throw new Error('No PAYROLL_LOCKED rows for LOCK_ID ' + useLock);
  return { lockId: useLock, folderId: folderId, lockedRows: lockedRows };
}

function payslipSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function payslipTemplateId_(population) {
  var key = payslipTemplateKey(population) === 'STAFF' ? 'PAYSLIP_TEMPLATE_STAFF_ID' : 'PAYSLIP_TEMPLATE_WORKER_ID';
  var id = String(getControl(key, '')).trim();
  if (!id) throw new Error(key + ' is blank in PAYROLL_CONTROL');
  return id;
}

function generateOnePayslip_(ctx, row, emp, salary, ident, bal) {
  var repl = buildReplacements(ctx.population, row, emp, salary, ident, bal);
  var pdfName = payslipFileName(String(row.EMP_ID), ctx.period);
  var copy = null;
  try {
    copy = DriveApp.getFileById(ctx.templateId).makeCopy('TMP_' + row.EMP_ID + '_' + ctx.period, ctx.folder);
    var doc = DocumentApp.openById(copy.getId());
    var body = doc.getBody();
    Object.keys(repl).forEach(function (t) {
      body.replaceText(escapeRegex_('{{' + t + '}}'), repl[t].replace(/\$/g, '\\$'));
    });
    var left = extractTemplateTokens(body.getText());
    if (left.length) { doc.saveAndClose(); throw new Error('Unreplaced tokens: ' + left.join(',')); }
    doc.saveAndClose();
    var blob = copy.getAs('application/pdf').setName(pdfName);
    var pdf = ctx.folder.createFile(blob);
    return { docId: copy.getId(), pdfId: pdf.getId(), pdfUrl: pdf.getUrl() };
  } finally {
    if (copy) { try { copy.setTrashed(true); } catch (e) { /* ignore */ } }
  }
}

/**
 * Generate payslips for a LOCKED period x population. Processes up to 25 employees per execution and
 * schedules a one-off continuation trigger when more remain.
 */
function generatePayslips(period, population, lockId, job_) {
  var pre = payslipPreflight_(period, population, lockId);
  var templateId = payslipTemplateId_(population);
  var tcheck = templateTokenCheck(DocumentApp.openById(templateId).getBody().getText(), payslipTokenMap(population));
  if (!tcheck.ok) {
    audit('PAYSLIPS_REFUSED', period, population, { reason: 'unknown template tokens', missingTokens: tcheck.missingTokens });
    throw new Error('Template has tokens with no mapping (fail closed): ' + tcheck.missingTokens.join(', '));
  }
  var attempted = (job_ && job_.attempted) || [];
  var register = readObjects(TABS.PAYSLIP_REGISTER);
  var pending = payslipPending(pre.lockedRows, register, pre.lockId, attempted);
  var batch = pending.slice(0, PAYSLIP_BATCH_SIZE);

  var master = {};
  readObjects(TABS.EMPLOYEE_MASTER).forEach(function (r) { var id = String(r.EMP_ID).trim(); if (!(id in master)) master[id] = r; });

  // SALARY_STRUCTURE read once; same effective-dated pick as the engine. Missing row -> that employee FAILS.
  var salaryByEmp = engine_pickSalary(engine_readOpt_('SALARY_STRUCTURE'), period);

  // UAN / ESI no / PAN / bank details: read from the hidden RAW master for this batch only; nothing is stored or logged
  var identity = payslipReadIdentity_(population, batch.map(function (r) { return String(r.EMP_ID); }));

  // EL / CL / SL available balances from the leave spreadsheet (read-only; never written anywhere; blank when not identifiable)
  var balances = { byEmp: {}, matched: 0, note: '' };
  try { balances = leave_readBalances_(population, batch.map(function (r) { return String(r.EMP_ID); })); } catch (e) {
    balances.note = String(e && e.message ? e.message : e);
  }

  var root = DriveApp.getFolderById(pre.folderId);
  var folder = payslipSubfolder_(payslipSubfolder_(root, period), population);
  var ctx = { period: period, population: population, templateId: templateId, folder: folder };
  var ok = 0, failed = [];

  batch.forEach(function (row) {
    var id = String(row.EMP_ID);
    attempted.push(id);
    var reg = { LOCK_ID: pre.lockId, PERIOD: period, EMP_ID: id, POPULATION: population, DOC_ID: '', PDF_ID: '',
      PDF_URL: '', GENERATED_AT: nowIso_(), STATUS: '' };
    try {
      var res = generateOnePayslip_(ctx, row, master[id], salaryByEmp[id.trim()] || null, identity.byEmp[feeds_empId_(id)] || null,
        balances.byEmp[feeds_empId_(id)] || null);
      reg.DOC_ID = res.docId; reg.PDF_ID = res.pdfId; reg.PDF_URL = res.pdfUrl; reg.STATUS = 'GENERATED';
      ok++;
    } catch (e) {
      reg.STATUS = 'FAILED';
      failed.push({ empId: id, error: String(e && e.message ? e.message : e) });
    }
    appendObjects(TABS.PAYSLIP_REGISTER, [reg]);
  });

  var remaining = pending.length - batch.length;
  var continuing = false;
  if (remaining > 0) {
    PropertiesService.getScriptProperties().setProperty(PAYSLIP_JOB_PROP,
      JSON.stringify({ period: period, population: population, lockId: pre.lockId, attempted: attempted }));
    ScriptApp.newTrigger(PAYSLIP_CONTINUE_FN).timeBased().after(60 * 1000).create();
    continuing = true;
  } else {
    PropertiesService.getScriptProperties().deleteProperty(PAYSLIP_JOB_PROP);
  }
  var summary = { period: period, population: population, lockId: pre.lockId, generated: ok, failed: failed,
    remaining: remaining, continuationScheduled: continuing,
    identityMatched: identity.matched + ' of ' + batch.length + (identity.note ? ' (' + identity.note + ')' : ''),
    leaveBalancesMatched: balances.matched + ' of ' + batch.length + (balances.note ? ' (' + balances.note + ')' : '') };
  audit('PAYSLIPS_GENERATED', period, population, summary);
  return summary;
}

/** Time-trigger entry: resume the stored job and remove its own trigger(s). */
function continuePayslips_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === PAYSLIP_CONTINUE_FN) ScriptApp.deleteTrigger(t);
  });
  var raw = PropertiesService.getScriptProperties().getProperty(PAYSLIP_JOB_PROP);
  if (!raw) return null;
  var job = JSON.parse(raw);
  try {
    return generatePayslips(job.period, job.population, job.lockId, job);
  } catch (e) {
    PropertiesService.getScriptProperties().deleteProperty(PAYSLIP_JOB_PROP);
    audit('PAYSLIPS_CONTINUE_FAILED', job.period, job.population, String(e && e.message ? e.message : e));
    throw e;
  }
}
