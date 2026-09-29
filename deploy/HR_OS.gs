// VFL HR OS — combined Apps Script (generated from apps-script/*.gs; do not edit here)

// ===== 00_Config.gs =====
/**
 * 00_Config.gs - constants, period helpers, PAYROLL_CONTROL readers.
 * Constants use `var` so they are visible as properties of the Node vm context in tests.
 */
var HROS_SPREADSHEET_ID = '10-OpV86Gvi_TlBPQ6zKQC6y7MLWqietELGU3G06exIM';
var HROS_TZ = 'Asia/Kolkata';
/** Hard floor. PAYROLL_CONTROL.MIN_PERIOD may raise it, never lower it. */
var HROS_MIN_PERIOD_FLOOR = '2026-09';

var TABS = {
  PAYROLL_CONTROL: 'PAYROLL_CONTROL',
  PAYROLL_PERIOD_CATEGORY: 'PAYROLL_PERIOD_CATEGORY',
  STATUTORY_CONFIG: 'STATUTORY_CONFIG',
  PT_EXEMPTIONS: 'PT_EXEMPTIONS',
  EFFICIENCY_CONFIG: 'EFFICIENCY_CONFIG',
  HOLIDAY_CALENDAR: 'HOLIDAY_CALENDAR',
  FEED_STATUS: 'FEED_STATUS',
  EMPLOYEE_MASTER: 'EMPLOYEE_MASTER',
  ATTENDANCE_DAILY: 'ATTENDANCE_DAILY',
  INPUT_ATTENDANCE: 'INPUT_ATTENDANCE',
  INPUT_OT: 'INPUT_OT',
  INPUT_CANTEEN: 'INPUT_CANTEEN',
  INPUT_EFFICIENCY: 'INPUT_EFFICIENCY',
  INPUT_ADVANCE: 'INPUT_ADVANCE',
  INPUT_SOCIETY: 'INPUT_SOCIETY',
  INPUT_ADJUSTMENTS: 'INPUT_ADJUSTMENTS',
  PAYROLL_DRAFT: 'PAYROLL_DRAFT',
  PAYROLL_STAFF: 'PAYROLL_STAFF',
  PAYROLL_WORKER: 'PAYROLL_WORKER',
  PAYROLL_CONSULTANT: 'PAYROLL_CONSULTANT',
  PAYROLL_PUNE_STAFF: 'PAYROLL_PUNE_STAFF',
  PAYROLL_EXCEPTIONS: 'PAYROLL_EXCEPTIONS',
  PAYROLL_RECON: 'PAYROLL_RECON',
  PAYROLL_READINESS: 'PAYROLL_READINESS',
  PAYROLL_LOCKED: 'PAYROLL_LOCKED',
  PAYSLIP_REGISTER: 'PAYSLIP_REGISTER',
  PAYSLIP_EMAIL_LOG: 'PAYSLIP_EMAIL_LOG',
  AUDIT_LOG: 'AUDIT_LOG',
  ATT_FORM_NASHIK_RAW: 'ATT_FORM_NASHIK_RAW',
  ATT_FORM_PUNE_RAW: 'ATT_FORM_PUNE_RAW'
};

var POP = {
  STAFF: 'STAFF',
  PERMANENT_WORKER: 'PERMANENT_WORKER',
  CONSULTANT: 'CONSULTANT',
  PUNE_STAFF: 'PUNE_STAFF'
};
var POPULATION_LIST = ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'];
var SITE_NASHIK = 'NASHIK';
var SITE_PUNE = 'PUNE';

var DAILY_CODES = ['P', 'HD', 'A', 'WO', 'PH', 'EL', 'CL', 'SL', 'OD', 'COFF', 'LWP'];
var WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
var FEED_LIST = ['ATTENDANCE', 'CANTEEN', 'OT', 'EFFICIENCY', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'HOLIDAYS'];
var ADJUSTMENT_TYPES = ['ARREARS', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT', 'OT_EXTRA_WORK',
  'PRODUCTION_INCENTIVE', 'TDS', 'OTHER_DEDUCTION', 'PENALTY', 'CANTEEN_EXTRA'];
var APPROVAL_STATUSES = ['PENDING', 'APPROVED'];

var PERIOD_STATUS = { PENDING: 'PENDING', DRAFT: 'DRAFT', HR_APPROVED: 'HR_APPROVED',
  ACCOUNTS_APPROVED: 'ACCOUNTS_APPROVED', LOCKED: 'LOCKED' };

/** DESIGN section 6 unified output columns. */
var HROS_OUTPUT_COLUMNS = ['RUN_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'EMPLOYEE_NAME', 'DEPARTMENT', 'DESIGNATION',
  'WORKING_DAYS', 'PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WO_DAYS', 'PH_DAYS', 'EL', 'CL', 'SL', 'PAID_LEAVE_OTHER',
  'ABSENT_LWP_DAYS', 'WORKED_PAYABLE_DAYS', 'FIXED_GROSS', 'PAY_BASIS', 'RATE', 'BASIC', 'HRA', 'CONVEYANCE',
  'EDUCATION', 'MEDICAL', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'WASHING', 'HEAT', 'VDA', 'PRODUCTION_ALLOWANCE',
  'GROSS_EARNINGS', 'OT_HOURS', 'OT_AMOUNT', 'ARREARS', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT',
  'PRODUCTION_INCENTIVE', 'OT_EXTRA_WORK', 'TOTAL_EARNINGS', 'PF_EMPLOYEE', 'ESI_EMPLOYEE', 'PT', 'MLWF', 'CANTEEN',
  'SOCIETY', 'ADVANCE', 'TDS', 'EFFICIENCY_PCT', 'EFFICIENCY_ELIGIBLE_AMOUNT', 'EFFICIENCY_DEDUCTION',
  'OTHER_DEDUCTION', 'TOTAL_DEDUCTIONS', 'NET_PAY', 'EMPLOYER_PF', 'EMPLOYER_ESI', 'BONUS_PROVISION',
  'GRATUITY_PROVISION', 'FLAGS', 'CALC_VERSION', 'CALCULATED_AT'];

// ---------------------------------------------------------------- period helpers

function parsePeriod(period) {
  var m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(period == null ? '' : period).trim());
  if (!m) throw new Error('Invalid PERIOD "' + period + '" (expected YYYY-MM)');
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function daysInMonth(period) {
  var p = parsePeriod(period);
  return new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
}

/** First day of period as 'YYYY-MM-DD'. */
function periodStart(period) {
  var p = parsePeriod(period);
  return p.year + '-' + pad2_(p.month) + '-01';
}

/** Last day of period as 'YYYY-MM-DD'. */
function periodEnd(period) {
  var p = parsePeriod(period);
  return p.year + '-' + pad2_(p.month) + '-' + pad2_(daysInMonth(period));
}

function monthName(period) {
  var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];
  return names[parsePeriod(period).month - 1];
}

/** All ISO dates of the period. */
function enumerateDates(period) {
  var out = [], n = daysInMonth(period), s = periodStart(period).slice(0, 8);
  for (var d = 1; d <= n; d++) out.push(s + pad2_(d));
  return out;
}

/** Weekday code (SUN..SAT) of an ISO date. */
function weekdayOf(isoDate) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error('Invalid date "' + isoDate + '"');
  return WEEKDAY_CODES[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
}

/** Date | 'YYYY-MM-DD...' | 'YYYY-MM' -> 'YYYY-MM' or ''. */
function normalizePeriod(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1);
  }
  var m = /^(\d{4})-(0[1-9]|1[0-2])(?:$|[-T\s])/.exec(String(v).trim());
  return m ? m[1] + '-' + m[2] : '';
}

/** Date | 'YYYY-MM-DD...' -> 'YYYY-MM-DD' or ''. */
function toIsoDate(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  }
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(String(v).trim());
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}

/** Throws if period is malformed or earlier than the minimum. Pure when minPeriod is passed/defaulted. */
function assertPeriodAllowed(period, minPeriod) {
  parsePeriod(period);
  var min = minPeriod || HROS_MIN_PERIOD_FLOOR;
  parsePeriod(min);
  if (String(period).trim() < min) {
    throw new Error('Period ' + period + ' is earlier than MIN_PERIOD ' + min + ' - refused');
  }
  return true;
}

function isKnownPopulation(pop) { return POPULATION_LIST.indexOf(pop) >= 0; }

function siteForPopulation(pop) {
  if (pop === POP.PUNE_STAFF) return SITE_PUNE;
  if (isKnownPopulation(pop)) return SITE_NASHIK;
  throw new Error('Unknown population "' + pop + '"');
}

function nowIso_() { return Utilities.formatDate(new Date(), HROS_TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

// ---------------------------------------------------------------- PAYROLL_CONTROL readers

/** KEY -> VALUE (raw cell values) from PAYROLL_CONTROL. */
function readControlMap() {
  var map = {};
  var rows = readObjects(TABS.PAYROLL_CONTROL);
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i].KEY == null ? '' : rows[i].KEY).trim();
    if (k && !(k in map)) map[k] = rows[i].VALUE;
  }
  return map;
}

function getControl(key, defaultValue) {
  var map = readControlMap();
  if (key in map && map[key] !== '' && map[key] != null) return map[key];
  return defaultValue === undefined ? '' : defaultValue;
}

/** Update existing key or append. VALUE is always stored as text to stop Sheets reformatting. */
function setControl(key, value, note) {
  var sheet = ensureSheet(TABS.PAYROLL_CONTROL);
  ensureHeaders(sheet, ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT']);
  var rows = readObjects(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].KEY).trim() === key) {
      var vals = { VALUE: value, UPDATED_AT: nowIso_() };
      if (note !== undefined) vals.NOTE = note;
      updateRows(sheet, [{ row: rows[i]._row, values: vals }], { textHeaders: ['VALUE'] });
      return;
    }
  }
  appendObjects(sheet, [{ KEY: key, VALUE: value, NOTE: note || '', UPDATED_AT: nowIso_() }], { textHeaders: ['VALUE'] });
}

/** Effective minimum period: max(floor, PAYROLL_CONTROL.MIN_PERIOD). Control can raise but never lower it. */
function getMinPeriod() {
  var v = normalizePeriod(getControl('MIN_PERIOD', ''));
  return (v && v > HROS_MIN_PERIOD_FLOOR) ? v : HROS_MIN_PERIOD_FLOOR;
}

function getWeeklyOff(site) {
  var key = site === SITE_PUNE ? 'PUNE_WEEKLY_OFF' : 'NASHIK_WEEKLY_OFF';
  var v = String(getControl(key, 'SUN')).trim().toUpperCase();
  if (WEEKDAY_CODES.indexOf(v) < 0) throw new Error(key + ' must be one of ' + WEEKDAY_CODES.join(',') + ' (got "' + v + '")');
  return v;
}

/** Two-step guard: static floor first (no sheet access), then configured minimum. */
function guardPeriod_(period) {
  assertPeriodAllowed(period);
  assertPeriodAllowed(period, getMinPeriod());
}

/** { population: STATUS } for period from PAYROLL_PERIOD_CATEGORY. */
function getPeriodStatusMap(period) {
  var map = {};
  var rows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY);
  rows.forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) === period) map[String(r.PAYROLL_CATEGORY).trim()] = String(r.STATUS || '').trim();
  });
  return map;
}

function isLocked(period, population) {
  return getPeriodStatusMap(period)[population] === PERIOD_STATUS.LOCKED;
}

function assertNotLocked(period, population) {
  if (isLocked(period, population)) throw new Error('Period ' + period + ' x ' + population + ' is LOCKED - refused');
}

// ===== 01_SheetUtil.gs =====
/**
 * 01_SheetUtil.gs - header-mapped sheet access. Never clears or deletes anything.
 * Row 1 is always the header row. Sheet objects are passed in so tests can mock them.
 */
var HROS_TEXT_HEADERS = ['PAYROLL_MONTH', 'PERIOD', 'DATE', 'EMP_ID', 'KEY', 'ROW_KEY', 'SOURCE_REF', 'EFFECTIVE_FROM',
  'EFFECTIVE_TO', 'LOCK_ID'];

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(HROS_SPREADSHEET_ID);
}

function getSheet(name) { return getSpreadsheet_().getSheetByName(name); }

function resolveSheet_(sheetOrName) {
  if (typeof sheetOrName === 'string') {
    var s = getSheet(sheetOrName);
    if (!s) throw new Error('Missing tab ' + sheetOrName + ' (run HR OS > Setup first)');
    return s;
  }
  return sheetOrName;
}

/** Create the tab if missing; never touches an existing one. */
function ensureSheet(name) {
  var ss = getSpreadsheet_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getHeaders(sheet) {
  var lc = sheet.getLastColumn();
  if (lc < 1) return [];
  return sheet.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h == null ? '' : h).trim(); });
}

/** Array of objects keyed by header, plus _row (1-based sheet row). Blank rows skipped. */
function readObjects(sheetOrName) {
  var sheet = resolveSheet_(sheetOrName);
  var lc = sheet.getLastColumn(), lr = sheet.getLastRow();
  if (lc < 1 || lr < 2) return [];
  var values = sheet.getRange(1, 1, lr, lc).getValues();
  var headers = values[0].map(function (h) { return String(h == null ? '' : h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r], blank = true, obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (row[c] !== '' && row[c] != null) blank = false;
      if (headers[c] && !(headers[c] in obj)) obj[headers[c]] = row[c];
    }
    if (!blank) out.push(obj);
  }
  return out;
}

function textHeaderSet_(opts) {
  var set = {};
  HROS_TEXT_HEADERS.concat((opts && opts.textHeaders) || []).forEach(function (h) { set[h] = true; });
  return set;
}

/** Append objects as rows mapped by header. Unknown keys throw (fail closed). Returns first row written. */
function appendObjects(sheetOrName, objs, opts) {
  if (!objs || !objs.length) return 0;
  var sheet = resolveSheet_(sheetOrName);
  var headers = getHeaders(sheet);
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var rows = objs.map(function (o) {
    var arr = new Array(headers.length);
    for (var i = 0; i < arr.length; i++) arr[i] = '';
    Object.keys(o).forEach(function (k) {
      if (k === '_row') return;
      if (!(k in idx)) throw new Error('Unknown column "' + k + '" for tab ' + sheet.getName());
      arr[idx[k]] = o[k] == null ? '' : o[k];
    });
    return arr;
  });
  var start = sheet.getLastRow() + 1;
  var text = textHeaderSet_(opts);
  headers.forEach(function (h, i) {
    if (h && text[h]) sheet.getRange(start, i + 1, rows.length, 1).setNumberFormat('@');
  });
  sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
  return start;
}

/** updates = [{row, values:{HEADER: value}}]. Writes only the named cells (contiguous groups). */
function updateRows(sheetOrName, updates, opts) {
  if (!updates || !updates.length) return;
  var sheet = resolveSheet_(sheetOrName);
  var headers = getHeaders(sheet);
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var text = textHeaderSet_(opts);
  updates.forEach(function (u) {
    if (!(u.row >= 2)) throw new Error('Refusing to update row ' + u.row + ' (header row or invalid)');
    var cols = Object.keys(u.values).map(function (k) {
      if (!(k in idx)) throw new Error('Unknown column "' + k + '" for tab ' + sheet.getName());
      return idx[k];
    }).sort(function (a, b) { return a - b; });
    var byCol = {};
    Object.keys(u.values).forEach(function (k) { byCol[idx[k]] = u.values[k] == null ? '' : u.values[k]; });
    cols.forEach(function (c) { if (text[headers[c]]) sheet.getRange(u.row, c + 1).setNumberFormat('@'); });
    var i = 0;
    while (i < cols.length) {
      var j = i;
      while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
      var vals = [];
      for (var k = i; k <= j; k++) vals.push(byCol[cols[k]]);
      sheet.getRange(u.row, cols[i] + 1, 1, vals.length).setValues([vals]);
      i = j + 1;
    }
  });
}

/** Update the cells of one row by header name. */
function updateCells(sheetOrName, rowNum, values, opts) {
  updateRows(sheetOrName, [{ row: rowNum, values: values }], opts);
}

/**
 * Append missing header names to the right of the last non-blank header. Existing columns are never
 * removed, renamed or reordered. If row 1 is entirely blank the full header is written.
 * Returns {written:[...]} for a fresh header or {added:[...]} for appended columns.
 */
function ensureHeaders(sheet, wanted) {
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h == null ? '' : h).trim(); })
    : [];
  var lastNonBlank = -1;
  existing.forEach(function (h, i) { if (h !== '') lastNonBlank = i; });
  if (lastNonBlank < 0) {
    sheet.getRange(1, 1, 1, wanted.length).setValues([wanted.slice()]);
    return { written: wanted.slice(), added: [] };
  }
  var have = {};
  existing.forEach(function (h) { if (h) have[h] = true; });
  var missing = wanted.filter(function (h) { return !have[h]; });
  if (missing.length) sheet.getRange(1, lastNonBlank + 2, 1, missing.length).setValues([missing]);
  return { written: [], added: missing };
}

/** Warning-style protection that only the owner can edit through. Never removes existing protections. */
function protectSheet(sheet, description) {
  var protection = sheet.protect().setDescription(description || 'HR OS protected');
  try {
    var me = Session.getEffectiveUser();
    protection.addEditor(me);
    var editors = protection.getEditors();
    for (var i = 0; i < editors.length; i++) {
      if (editors[i].getEmail() !== me.getEmail()) protection.removeEditor(editors[i]);
    }
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (e) {
    protection.setWarningOnly(true);
  }
  return protection;
}

function isSheetProtected(sheet) {
  return sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length > 0;
}

function setListValidation(sheet, headerName, list, rows) {
  var headers = getHeaders(sheet);
  var col = headers.indexOf(headerName);
  if (col < 0) throw new Error('Column ' + headerName + ' not found on ' + sheet.getName());
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  sheet.getRange(2, col + 1, rows || 1000, 1).setDataValidation(rule);
}

// ===== 02_Setup.gs =====
/**
 * 02_Setup.gs - idempotent setup (DESIGN section 2). Adds only: missing tabs, missing headers (to the right),
 * missing config keys, seed rows, data validation. Never deletes, clears or renames.
 */
var HROS_DEFAULT_EFFECTIVE_FROM = '2026-09';

var HROS_NEW_TABS = {
  PT_EXEMPTIONS: ['EMP_ID', 'REASON', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'APPROVED_BY'],
  HOLIDAY_CALENDAR: ['DATE', 'SITE', 'HOLIDAY_NAME', 'PAID'],
  FEED_STATUS: ['PERIOD', 'FEED', 'STATUS', 'MARKED_BY', 'MARKED_AT', 'NOTE'],
  ATTENDANCE_DAILY: ['PERIOD', 'DATE', 'SITE', 'EMP_ID', 'CODE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS',
    'REJECT_REASON', 'ENTERED_AT'],
  PAYROLL_CONSULTANT: HROS_OUTPUT_COLUMNS,
  PAYROLL_PUNE_STAFF: HROS_OUTPUT_COLUMNS,
  PAYROLL_LOCKED: ['LOCK_ID'].concat(HROS_OUTPUT_COLUMNS),
  PAYSLIP_REGISTER: ['LOCK_ID', 'PERIOD', 'EMP_ID', 'POPULATION', 'DOC_ID', 'PDF_ID', 'PDF_URL', 'GENERATED_AT', 'STATUS']
};

/** Existing tabs that only get columns appended on the right. */
var HROS_APPEND_COLUMNS = {
  PAYROLL_PERIOD_CATEGORY: ['DRAFT_RUN_ID', 'DRAFT_HASH', 'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY',
    'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'],
  STATUTORY_CONFIG: ['EFFECTIVE_FROM', 'EFFECTIVE_TO', 'VERSION', 'APPROVED_BY', 'APPROVED_AT'],
  INPUT_ATTENDANCE: ['PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS', 'GENERATED_VALUES_JSON', 'HR_OVERRIDE',
    'OVERRIDE_REASON', 'ROW_KEY'],
  INPUT_OT: ['OT_KEY', 'OT_DATE', 'SOURCE_ROW', 'NORMALIZER_VERSION', 'ELIGIBILITY', 'EXCEPTION_REASON']
};

/** Header-less today: write full header only when row 1 is empty. */
var HROS_HEADER_ONLY_TABS = {
  INPUT_CANTEEN: ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS'],
  INPUT_EFFICIENCY: ['PAYROLL_MONTH', 'EMP_ID', 'EFFICIENCY_PCT', 'PHYSICAL_PRESENT_DAYS_OVERRIDE', 'SOURCE',
    'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS'],
  PAYSLIP_EMAIL_LOG: ['LOCK_ID', 'PERIOD', 'EMP_ID', 'TO_EMAIL', 'PDF_ID', 'STATUS', 'ATTEMPTED_AT', 'ERROR']
};

var HROS_CONTROL_DEFAULTS = [
  ['HR_APPROVER_EMAIL', 'hr@varshaforgings.com', 'HR approver (state machine)'],
  ['ACCOUNTS_APPROVER_EMAIL', 'accounts@varshaforgings.com', 'Accounts approver (state machine)'],
  ['MIN_PERIOD', '2026-09', 'Earliest period any write path accepts'],
  ['PAYSLIP_TEMPLATE_STAFF_ID', '1T7kwVNmOczXk4_-4OstofWOPSWGuEQxg7hKFo-Jci_w', 'Staff payslip template Doc'],
  ['PAYSLIP_TEMPLATE_WORKER_ID', '1MSmi8qVRL8SI8-svVihasYbLFGNo8Xkzko4VUaIX8SU', 'Worker payslip template Doc'],
  ['PAYSLIP_FOLDER_ID', '', 'Blank = payslip step blocked'],
  ['EMAIL_RELEASE_ENABLED', 'FALSE', 'Payslip email release switch'],
  ['NASHIK_WEEKLY_OFF', 'SUN', 'Weekly off used to default blank attendance'],
  ['PUNE_WEEKLY_OFF', 'SUN', 'Weekly off used to default blank attendance']
];

var HROS_STATUTORY_DEFAULTS = [
  ['PT_FEB_AMOUNT', '300', 'February PT amount'],
  ['MLWF_MONTHS', '6,12', 'Months MLWF is deducted'],
  ['STAFF_OT_MULTIPLIER', '2', ''],
  ['WORKER_OT_MULTIPLIER', '2', ''],
  ['STAFF_PF_WAGE_COMPONENTS', 'BASIC,CONVEYANCE,EDUCATION,MEDICAL', ''],
  ['STAFF_COMPONENT_PCTS', '{"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}', ''],
  ['EMPLOYER_PF_RATE_STAFF', '0.1301', ''],
  ['EMPLOYER_PF_RATE_WORKER', '0.1301', ''],
  ['BONUS_RATE_STAFF', '0.0833', ''],
  ['GRATUITY_RATE_STAFF', '0.0483', ''],
  ['BONUS_RATE_WORKER', '0.18', ''],
  ['GRATUITY_RATE_WORKER', '0.0481', '']
];

var HROS_PT_EXEMPTION_SEED = ['VFL4021', 'VFL4014', 'VFL4063'];

function isNumericString_(s) { return /^-?\d+(\.\d+)?$/.test(String(s)); }

/** Add KEY/VALUE rows whose KEY is missing. Non-numeric values are written as text. */
function addMissingKeys_(tabName, defs, extraFn) {
  var sheet = ensureSheet(tabName);
  var have = {};
  readObjects(sheet).forEach(function (r) { have[String(r.KEY).trim()] = true; });
  var numeric = [], text = [], added = [];
  defs.forEach(function (d) {
    if (have[d[0]]) return;
    var obj = { KEY: d[0], VALUE: d[1], NOTE: d[2] };
    if (extraFn) extraFn(obj);
    added.push(d[0]);
    (isNumericString_(d[1]) ? numeric : text).push(obj);
    if (isNumericString_(d[1])) obj.VALUE = Number(d[1]);
  });
  appendObjects(sheet, text, { textHeaders: ['VALUE'] });
  appendObjects(sheet, numeric);
  return added;
}

function hrosSetup() {
  var log = { createdTabs: [], headersWritten: [], columnsAdded: {}, keysAdded: {}, ptSeeded: [], validations: [] };
  var ss = getSpreadsheet_();

  // 1. new tabs
  Object.keys(HROS_NEW_TABS).forEach(function (name) {
    var existed = !!ss.getSheetByName(name);
    var sheet = ensureSheet(name);
    if (!existed) log.createdTabs.push(name);
    var r = ensureHeaders(sheet, HROS_NEW_TABS[name]);
    if (r.written.length) log.headersWritten.push(name);
    if (r.added.length) log.columnsAdded[name] = r.added;
  });
  // 2. header-less existing tabs
  Object.keys(HROS_HEADER_ONLY_TABS).forEach(function (name) {
    var existed = !!ss.getSheetByName(name);
    var sheet = ensureSheet(name);
    if (!existed) log.createdTabs.push(name);
    var r = ensureHeaders(sheet, HROS_HEADER_ONLY_TABS[name]);
    if (r.written.length) log.headersWritten.push(name);
    if (r.added.length) log.columnsAdded[name] = r.added;
  });
  // 3. append columns on existing tabs
  Object.keys(HROS_APPEND_COLUMNS).forEach(function (name) {
    var existed = !!ss.getSheetByName(name);
    var sheet = ensureSheet(name);
    if (!existed) log.createdTabs.push(name);
    var r = ensureHeaders(sheet, HROS_APPEND_COLUMNS[name]);
    if (r.written.length) log.headersWritten.push(name);
    if (r.added.length) log.columnsAdded[name] = r.added;
  });
  // PAYROLL_CONTROL keeps its own header; make sure UPDATED_AT etc. exist
  ensureHeaders(ensureSheet(TABS.PAYROLL_CONTROL), ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT']);

  // 4. control keys
  log.keysAdded.PAYROLL_CONTROL = addMissingKeys_(TABS.PAYROLL_CONTROL, HROS_CONTROL_DEFAULTS, function (o) {
    o.UPDATED_AT = nowIso_();
  });

  // 5. statutory config: version existing rows, then add missing keys
  var stat = ensureSheet(TABS.STATUTORY_CONFIG);
  var fill = [];
  readObjects(stat).forEach(function (r) {
    var v = {};
    if (r.EFFECTIVE_FROM === '' || r.EFFECTIVE_FROM == null) v.EFFECTIVE_FROM = HROS_DEFAULT_EFFECTIVE_FROM;
    if (r.VERSION === '' || r.VERSION == null) v.VERSION = 1;
    if (Object.keys(v).length) fill.push({ row: r._row, values: v });
  });
  updateRows(stat, fill);
  log.keysAdded.STATUTORY_CONFIG = addMissingKeys_(TABS.STATUTORY_CONFIG, HROS_STATUTORY_DEFAULTS, function (o) {
    o.EFFECTIVE_FROM = HROS_DEFAULT_EFFECTIVE_FROM;
    o.VERSION = 1;
  });
  log.statutoryRowsVersioned = fill.length;

  // 6. PT exemptions seed
  var pt = ensureSheet(TABS.PT_EXEMPTIONS);
  var haveEmp = {};
  readObjects(pt).forEach(function (r) { haveEmp[String(r.EMP_ID).trim()] = true; });
  var seed = HROS_PT_EXEMPTION_SEED.filter(function (id) { return !haveEmp[id]; }).map(function (id) {
    return { EMP_ID: id, REASON: 'carried from Aug worker template R17', EFFECTIVE_FROM: HROS_DEFAULT_EFFECTIVE_FROM,
      EFFECTIVE_TO: '', APPROVED_BY: 'SETUP_SEED' };
  });
  appendObjects(pt, seed);
  log.ptSeeded = seed.map(function (s) { return s.EMP_ID; });

  // 7. data validation
  setListValidation(ensureSheet(TABS.INPUT_ADJUSTMENTS), 'ADJUSTMENT_TYPE', ADJUSTMENT_TYPES);
  setListValidation(ensureSheet(TABS.INPUT_ATTENDANCE), 'APPROVAL_STATUS', APPROVAL_STATUSES);
  setListValidation(ensureSheet(TABS.HOLIDAY_CALENDAR), 'SITE', ['NASHIK', 'PUNE', 'ALL']);
  setListValidation(ensureSheet(TABS.HOLIDAY_CALENDAR), 'PAID', ['Y', 'N']);
  setListValidation(ensureSheet(TABS.FEED_STATUS), 'STATUS', ['OPEN', 'COMPLETE']);
  log.validations = ['INPUT_ADJUSTMENTS.ADJUSTMENT_TYPE', 'INPUT_ATTENDANCE.APPROVAL_STATUS', 'HOLIDAY_CALENDAR.SITE',
    'HOLIDAY_CALENDAR.PAID', 'FEED_STATUS.STATUS'];

  // 8. protect the append-only ledger (idempotent)
  var locked = ensureSheet(TABS.PAYROLL_LOCKED);
  if (!isSheetProtected(locked)) protectSheet(locked, 'PAYROLL_LOCKED append-only (HR OS)');

  audit('SETUP', '', '', log);
  return log;
}

/** Insert the 4 PAYROLL_PERIOD_CATEGORY rows and 8 FEED_STATUS rows for a period if absent. */
function prepareMonth(period) {
  guardPeriod_(period);
  var ppc = ensureSheet(TABS.PAYROLL_PERIOD_CATEGORY);
  var haveP = {};
  readObjects(ppc).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) === period) haveP[String(r.PAYROLL_CATEGORY).trim()] = true;
  });
  var newP = POPULATION_LIST.filter(function (p) { return !haveP[p]; }).map(function (p) {
    return { PAYROLL_MONTH: period, PAYROLL_CATEGORY: p, WORKING_DAYS: '', STATUS: PERIOD_STATUS.PENDING,
      NOTE: 'HR enters WORKING_DAYS for ' + period + '.' };
  });
  appendObjects(ppc, newP);

  var fs = ensureSheet(TABS.FEED_STATUS);
  var haveF = {};
  readObjects(fs).forEach(function (r) { haveF[normalizePeriod(r.PERIOD) + '|' + String(r.FEED).trim()] = true; });
  var newF = FEED_LIST.filter(function (f) { return !haveF[period + '|' + f]; }).map(function (f) {
    return { PERIOD: period, FEED: f, STATUS: 'OPEN' };
  });
  appendObjects(fs, newF);

  var res = { period: period, periodRowsAdded: newP.length, feedRowsAdded: newF.length };
  audit('PREPARE_MONTH', period, '', res);
  return res;
}

/** Mark a feed COMPLETE (or OPEN) for a period. Updates the FEED_STATUS row, creating it if absent. */
function markFeedComplete(period, feed, note, status) {
  guardPeriod_(period);
  feed = String(feed || '').trim().toUpperCase();
  status = status || 'COMPLETE';
  if (FEED_LIST.indexOf(feed) < 0) throw new Error('Unknown feed "' + feed + '"; expected ' + FEED_LIST.join(', '));
  if (status !== 'COMPLETE' && status !== 'OPEN') throw new Error('Invalid status ' + status);
  var sheet = ensureSheet(TABS.FEED_STATUS);
  var user = auditUser_();
  var vals = { STATUS: status, MARKED_BY: user, MARKED_AT: nowIso_() };
  if (note !== undefined) vals.NOTE = note;
  var hit = readObjects(sheet).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.FEED).trim() === feed;
  })[0];
  if (hit) updateRows(sheet, [{ row: hit._row, values: vals }]);
  else { vals.PERIOD = period; vals.FEED = feed; appendObjects(sheet, [vals]); }
  audit('FEED_' + status, period, '', feed + (note ? ' - ' + note : ''));
  return { period: period, feed: feed, status: status, by: user };
}

// ===== 10_Attendance.gs =====
/**
 * 10_Attendance.gs - attendance logic. Pure functions first (Node-testable), sheet-touching entry points after.
 * Dates are ISO strings 'YYYY-MM-DD'. Roster entries: {EMP_ID, PAYROLL_CATEGORY, SITE, DOJ ('' or ISO)}.
 */
var ATT_NUM_FIELDS = ['PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS'];

// ================================================================ pure

function attNum_(v) {
  if (v === '' || v == null) return 0;
  var n = Number(v);
  return isNaN(n) ? NaN : n;
}

function attEntryTime_(v) {
  if (v == null || v === '') return 0;
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  var t = Date.parse(String(v));
  return isNaN(t) ? 0 : t;
}

/** Parse DOJ. Date/ISO exact. dd/mm/yyyy: if ambiguous (both parts <= 12) take the EARLIER reading
 * (excludes fewer days -> more missing-date flags -> fail closed). Unparseable -> ''. */
function parseDoj(v) {
  if (v == null || v === '') return '';
  var iso = toIsoDate(v);
  if (iso) return iso;
  var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(v).trim());
  if (!m) return '';
  var a = +m[1], b = +m[2], y = +m[3];
  var cands = [];
  if (b >= 1 && b <= 12 && a >= 1 && a <= 31) cands.push(y + '-' + pad2_(b) + '-' + pad2_(a)); // dd/mm
  if (a >= 1 && a <= 12 && b >= 1 && b <= 31) cands.push(y + '-' + pad2_(a) + '-' + pad2_(b)); // mm/dd
  if (!cands.length) return '';
  cands.sort();
  return cands[0];
}

/** Latest VALID row per KEY (EMP_ID|DATE) within period. Later ENTERED_AT wins; ties -> later array position. */
function pickLatestValid(dailyRows, period) {
  var best = {};
  (dailyRows || []).forEach(function (r, i) {
    if (String(r.STATUS || '').trim().toUpperCase() !== 'VALID') return;
    var date = toIsoDate(r.DATE);
    if (!date || date.slice(0, 7) !== period) return;
    var emp = String(r.EMP_ID || '').trim();
    var key = r.KEY ? String(r.KEY) : emp + '|' + date;
    var t = attEntryTime_(r.ENTERED_AT);
    var cur = best[key];
    if (!cur || t >= cur.t) best[key] = { t: t, i: i, row: r, emp: emp, date: date };
  });
  return best;
}

/** Given existing daily rows and new VALID rows, list existing VALID rows to mark SUPERSEDED. */
function findSuperseded(existingRows, newRows) {
  var keys = {};
  (newRows || []).forEach(function (r) {
    if (String(r.STATUS).toUpperCase() === 'VALID') keys[r.KEY || (r.EMP_ID + '|' + toIsoDate(r.DATE))] = true;
  });
  var out = [];
  (existingRows || []).forEach(function (r) {
    var key = r.KEY || (String(r.EMP_ID).trim() + '|' + toIsoDate(r.DATE));
    if (String(r.STATUS).toUpperCase() === 'VALID' && keys[key]) out.push(r);
  });
  return out;
}

/**
 * Aggregate daily rows into one monthly record per roster employee.
 * Days with no VALID record (on/after DOJ) are MISSING, never assumed present.
 * `holidays` and `weeklyOff` are accepted for interface symmetry but deliberately not used to fill gaps
 * (defaulting happens only in normalizeAttendanceResponse at entry time).
 */
function aggregateDaily(dailyRows, period, roster, holidays, weeklyOff) {
  parsePeriod(period);
  var latest = pickLatestValid(dailyRows, period);
  var dates = enumerateDates(period);
  return (roster || []).map(function (emp) {
    var id = String(emp.EMP_ID).trim();
    var doj = emp.DOJ ? parseDoj(emp.DOJ) : '';
    var c = {};
    DAILY_CODES.forEach(function (k) { c[k] = 0; });
    var missing = [], recorded = 0, invalid = [];
    dates.forEach(function (d) {
      if (doj && d < doj) return;
      var hit = latest[id + '|' + d];
      var code = hit ? String(hit.row.CODE || '').trim().toUpperCase() : '';
      if (!hit) { missing.push(d); return; }
      if (DAILY_CODES.indexOf(code) < 0) { missing.push(d); invalid.push(d); return; }
      c[code]++;
      recorded++;
    });
    return {
      EMP_ID: id, PAYROLL_CATEGORY: emp.PAYROLL_CATEGORY, PERIOD: period,
      counts: c,
      PRESENT_DAYS: c.P + c.OD + 0.5 * c.HD,
      PHYSICAL_PRESENT_DAYS: c.P + 0.5 * c.HD,
      WEEK_OFF: c.WO,
      PH: c.PH,
      EL_AVAILED: c.EL, CL_AVAILED: c.CL, SL_AVAILED: c.SL,
      PAID_LEAVE_OTHER: c.COFF,
      ABSENT_LWP_DAYS: c.A + c.LWP + 0.5 * c.HD,
      recordedDays: recorded, missingDates: missing, invalidCodeDates: invalid
    };
  });
}

/** WORKED_DAYS. Workers exclude WEEK_OFF (matches Aug worker template); everyone else includes it. */
function computeWorkedDays(record, population) {
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var n = function (k) { return attNum_(record[k]); };
  var sum = n('PRESENT_DAYS') + n('EL_AVAILED') + n('CL_AVAILED') + n('SL_AVAILED') + n('PH') + n('PAID_LEAVE_OTHER');
  if (population !== POP.PERMANENT_WORKER) sum += n('WEEK_OFF');
  return sum;
}

function generatedValuesFromRecord(record) {
  var o = {};
  ATT_NUM_FIELDS.forEach(function (k) { o[k] = record[k]; });
  return o;
}

function attValuesEqual_(a, b) {
  return Math.abs(attNum_(a) - attNum_(b)) < 1e-9;
}

/**
 * Merge freshly generated values into an existing INPUT_ATTENDANCE row.
 * existing: row object or null. generated: {ATT_NUM_FIELDS...}.
 * Returns {action, values, HR_OVERRIDE, OVERRIDE_REASON, needsReason, GENERATED_VALUES_JSON}
 *  action: CREATE | REGENERATE | KEEP_APPROVED | UNCHANGED | OVERRIDE
 * Rules: APPROVED rows are never touched. A PENDING row whose numbers are all blank or still equal to the
 * previously generated snapshot is regenerated. Otherwise HR typed something: if it differs from the new
 * generated numbers the HR values are kept, HR_OVERRIDE=Y and OVERRIDE_REASON is required.
 */
function mergeGeneratedWithExisting(existing, generated) {
  var json = JSON.stringify(generated);
  if (!existing) {
    return { action: 'CREATE', values: generated, HR_OVERRIDE: 'N', OVERRIDE_REASON: '', needsReason: false,
      GENERATED_VALUES_JSON: json };
  }
  if (String(existing.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') {
    return { action: 'KEEP_APPROVED', values: null, HR_OVERRIDE: existing.HR_OVERRIDE || 'N',
      OVERRIDE_REASON: existing.OVERRIDE_REASON || '', needsReason: false,
      GENERATED_VALUES_JSON: existing.GENERATED_VALUES_JSON || '' };
  }
  var prev = null;
  try { prev = existing.GENERATED_VALUES_JSON ? JSON.parse(existing.GENERATED_VALUES_JSON) : null; } catch (e) { prev = null; }
  var allBlank = ATT_NUM_FIELDS.every(function (k) { return existing[k] === '' || existing[k] == null; });
  var equalsNew = ATT_NUM_FIELDS.every(function (k) { return attValuesEqual_(existing[k], generated[k]); });
  var equalsPrev = !!prev && ATT_NUM_FIELDS.every(function (k) { return attValuesEqual_(existing[k], prev[k]); });
  var reason = String(existing.OVERRIDE_REASON || '').trim();
  if (allBlank || equalsPrev) {
    return { action: 'REGENERATE', values: generated, HR_OVERRIDE: 'N', OVERRIDE_REASON: '', needsReason: false,
      GENERATED_VALUES_JSON: json };
  }
  if (equalsNew) {
    return { action: 'UNCHANGED', values: generated, HR_OVERRIDE: 'N', OVERRIDE_REASON: '', needsReason: false,
      GENERATED_VALUES_JSON: json };
  }
  var kept = {};
  ATT_NUM_FIELDS.forEach(function (k) { kept[k] = existing[k]; });
  return { action: 'OVERRIDE', values: kept, HR_OVERRIDE: 'Y', OVERRIDE_REASON: reason, needsReason: reason === '',
    GENERATED_VALUES_JSON: json };
}

/** Is there a paid holiday for the date at site? */
function isPaidHoliday_(holidays, date, site) {
  return (holidays || []).some(function (h) {
    var s = String(h.SITE || 'ALL').trim().toUpperCase();
    return toIsoDate(h.DATE) === date && (s === site || s === 'ALL') && String(h.PAID).trim().toUpperCase() === 'Y';
  });
}

function isUnpaidHoliday_(holidays, date, site) {
  return (holidays || []).some(function (h) {
    var s = String(h.SITE || 'ALL').trim().toUpperCase();
    return toIsoDate(h.DATE) === date && (s === site || s === 'ALL') && String(h.PAID).trim().toUpperCase() !== 'Y';
  });
}

/**
 * Turn one parsed form response into ATTENDANCE_DAILY rows.
 * response: {date:'YYYY-MM-DD', marks:{EMP_ID: CODE}, ack:boolean, timestamp, sourceRef}
 * Blank -> WO if weekday == weeklyOff, else PH if paid holiday, else P. Blank on an UNPAID holiday is
 * not defaulted (employee stays missing). Invalid code / unknown EMP_ID -> REJECTED row, employee not defaulted.
 * Response-level failure (bad date, ack missing) -> single REJECTED row with EMP_ID '*'.
 */
function normalizeAttendanceResponse(response, roster, holidays, site, weeklyOff) {
  var source = site === SITE_PUNE ? 'FORM_PUNE' : 'FORM_NASHIK';
  var entered = response.timestamp || '';
  var date = toIsoDate(response.date);
  function row(emp, code, status, reason) {
    return { PERIOD: date ? date.slice(0, 7) : '', DATE: date, SITE: site, EMP_ID: emp, CODE: code, SOURCE: source,
      SOURCE_REF: response.sourceRef || '', KEY: emp + '|' + date, STATUS: status, REJECT_REASON: reason || '',
      ENTERED_AT: entered };
  }
  if (!date) return [row('*', '', 'REJECTED', 'BAD_DATE')];
  if (!response.ack) return [row('*', '', 'REJECTED', 'ACK_NOT_CHECKED')];
  if (WEEKDAY_CODES.indexOf(weeklyOff) < 0) throw new Error('Invalid weekly off "' + weeklyOff + '"');
  var marks = response.marks || {};
  var inSite = {};
  var out = [];
  (roster || []).forEach(function (e) {
    if (e.SITE !== site) return;
    var id = String(e.EMP_ID).trim();
    inSite[id] = true;
    var doj = e.DOJ ? parseDoj(e.DOJ) : '';
    var raw = marks[id];
    var code = raw == null ? '' : String(raw).trim().toUpperCase();
    if (code) {
      if (DAILY_CODES.indexOf(code) < 0) out.push(row(id, code, 'REJECTED', 'INVALID_CODE'));
      else out.push(row(id, code, 'VALID'));
      return;
    }
    if (doj && date < doj) return; // not yet joined
    if (weekdayOf(date) === weeklyOff) out.push(row(id, 'WO', 'VALID'));
    else if (isPaidHoliday_(holidays, date, site)) out.push(row(id, 'PH', 'VALID'));
    else if (isUnpaidHoliday_(holidays, date, site)) return; // do not guess: stays missing
    else out.push(row(id, 'P', 'VALID'));
  });
  Object.keys(marks).forEach(function (id) {
    if (!inSite[id] && String(marks[id] || '').trim() !== '') out.push(row(id, String(marks[id]).toUpperCase(), 'REJECTED', 'UNKNOWN_EMP_ID'));
  });
  return out;
}

/** Fail-closed pre-approval check for one INPUT_ATTENDANCE row. Returns list of problems (empty = ok). */
function validateAttendanceRowForApproval(row) {
  var problems = [];
  ATT_NUM_FIELDS.forEach(function (k) {
    if (row[k] === '' || row[k] == null) { if (k === 'PRESENT_DAYS') problems.push('PRESENT_DAYS blank'); return; }
    var n = Number(row[k]);
    if (isNaN(n) || n < 0) problems.push(k + ' not a non-negative number');
  });
  if (String(row.HR_OVERRIDE || '').toUpperCase() === 'Y' && String(row.OVERRIDE_REASON || '').trim() === '') {
    problems.push('HR_OVERRIDE=Y needs OVERRIDE_REASON');
  }
  if (/^MISSING_DATES/.test(String(row.REMARKS || ''))) problems.push('daily attendance has missing dates');
  return problems;
}

// ================================================================ sheet-touching entry points

function periodPopulationsOpen_(period) {
  var st = getPeriodStatusMap(period);
  var open = [], locked = [];
  POPULATION_LIST.forEach(function (p) { (st[p] === PERIOD_STATUS.LOCKED ? locked : open).push(p); });
  return { open: open, locked: locked, status: st };
}

/** Active roster from EMPLOYEE_MASTER (STATUS_AS_SOURCE = Active). Duplicate EMP_IDs kept once and reported. */
function buildRoster() {
  var rows = readObjects(TABS.EMPLOYEE_MASTER), seen = {}, roster = [], duplicates = [];
  rows.forEach(function (r) {
    if (String(r.STATUS_AS_SOURCE || '').trim().toLowerCase() !== 'active') return;
    var pop = String(r.PAYROLL_CATEGORY || '').trim();
    var id = String(r.EMP_ID || '').trim();
    if (!id || !isKnownPopulation(pop)) return;
    if (seen[id]) { duplicates.push(id); return; }
    seen[id] = true;
    roster.push({ EMP_ID: id, PAYROLL_CATEGORY: pop, SITE: siteForPopulation(pop), NAME: String(r.EMPLOYEE_NAME || ''),
      DEPARTMENT: String(r.DEPARTMENT || '').trim(), DOJ: parseDoj(r.DOJ_AS_SOURCE) });
  });
  roster.duplicates = duplicates;
  return roster;
}

function workingDaysFor_(period) {
  var map = {};
  readObjects(TABS.PAYROLL_PERIOD_CATEGORY).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) === period) map[String(r.PAYROLL_CATEGORY).trim()] = r.WORKING_DAYS;
  });
  return map;
}

function existingAttendanceByEmp_(period) {
  var map = {}, dup = [];
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var id = String(r.EMP_ID).trim();
    if (map[id]) dup.push(id); else map[id] = r;
  });
  map.__dups = dup;
  return map;
}

/** Sept-style: pre-fill one PENDING row per active employee for HR to type counts into. Existing rows untouched. */
function prepareMonthlyAttendance(period) {
  guardPeriod_(period);
  var pp = periodPopulationsOpen_(period);
  var roster = buildRoster(), wd = workingDaysFor_(period), existing = existingAttendanceByEmp_(period);
  var rows = [], skipped = 0;
  roster.forEach(function (e) {
    if (pp.locked.indexOf(e.PAYROLL_CATEGORY) >= 0) { skipped++; return; }
    if (existing[e.EMP_ID]) return;
    rows.push({ PAYROLL_MONTH: period, EMP_ID: e.EMP_ID, PAYROLL_CATEGORY: e.PAYROLL_CATEGORY,
      WORKING_DAYS: wd[e.PAYROLL_CATEGORY] === undefined ? '' : wd[e.PAYROLL_CATEGORY],
      APPROVAL_STATUS: 'PENDING', SOURCE_REF: 'HR_MONTHLY_ENTRY', ENTERED_AT: nowIso_(), HR_OVERRIDE: 'N',
      ROW_KEY: period + '|' + e.EMP_ID });
  });
  appendObjects(TABS.INPUT_ATTENDANCE, rows);
  var res = { period: period, rowsAdded: rows.length, skippedLocked: skipped, lockedPopulations: pp.locked,
    duplicateMasterIds: roster.duplicates };
  audit('ATT_PREPARE', period, '', res);
  return res;
}

/** Oct-onward: aggregate ATTENDANCE_DAILY into INPUT_ATTENDANCE. APPROVED rows never touched. */
function generateMonthlyAttendance(period) {
  guardPeriod_(period);
  var pp = periodPopulationsOpen_(period);
  var daily = readObjects(TABS.ATTENDANCE_DAILY).filter(function (r) {
    return toIsoDate(r.DATE).slice(0, 7) === period;
  });
  if (!daily.length) throw new Error('No ATTENDANCE_DAILY rows for ' + period + ' - use prepareMonthlyAttendance for monthly entry');
  var roster = buildRoster().filter(function (e) { return pp.locked.indexOf(e.PAYROLL_CATEGORY) < 0; });
  var holidays = readObjects(TABS.HOLIDAY_CALENDAR);
  var records = aggregateDaily(daily, period, roster, holidays, getWeeklyOff(SITE_NASHIK));
  var wd = workingDaysFor_(period), existing = existingAttendanceByEmp_(period);
  var creates = [], updates = [], counts = { CREATE: 0, REGENERATE: 0, UNCHANGED: 0, OVERRIDE: 0, KEEP_APPROVED: 0 };
  var needsReason = [], withMissing = [];
  records.forEach(function (rec) {
    var pop = rec.PAYROLL_CATEGORY;
    var gen = generatedValuesFromRecord(rec);
    var ex = existing[rec.EMP_ID] || null;
    var m = mergeGeneratedWithExisting(ex, gen);
    counts[m.action]++;
    if (m.action === 'KEEP_APPROVED') return;
    if (m.needsReason) needsReason.push(rec.EMP_ID);
    var remarks = rec.missingDates.length ? 'MISSING_DATES: ' + rec.missingDates.join(',') : '';
    if (rec.missingDates.length) withMissing.push(rec.EMP_ID);
    var vals = {};
    ATT_NUM_FIELDS.forEach(function (k) { vals[k] = m.values[k]; });
    vals.WORKED_DAYS = computeWorkedDays(vals, pop);
    vals.PAYABLE_DAYS = vals.WORKED_DAYS;
    vals.HR_OVERRIDE = m.HR_OVERRIDE;
    vals.GENERATED_VALUES_JSON = m.GENERATED_VALUES_JSON;
    if (!ex) {
      vals.PAYROLL_MONTH = period; vals.EMP_ID = rec.EMP_ID; vals.PAYROLL_CATEGORY = pop;
      vals.WORKING_DAYS = wd[pop] === undefined ? '' : wd[pop];
      vals.APPROVAL_STATUS = 'PENDING'; vals.SOURCE_REF = 'DAILY_GENERATED'; vals.ENTERED_AT = nowIso_();
      vals.OVERRIDE_REASON = ''; vals.ROW_KEY = period + '|' + rec.EMP_ID; vals.REMARKS = remarks;
      creates.push(vals);
    } else {
      if (m.action !== 'OVERRIDE') vals.OVERRIDE_REASON = '';
      var oldRem = String(ex.REMARKS || '');
      if (oldRem === '' || /^MISSING_DATES/.test(oldRem)) vals.REMARKS = remarks;
      if (m.action === 'REGENERATE') vals.SOURCE_REF = 'DAILY_GENERATED';
      updates.push({ row: ex._row, values: vals });
    }
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  appendObjects(TABS.INPUT_ATTENDANCE, creates);
  var res = { period: period, counts: counts, employeesWithMissingDates: withMissing, overridesNeedingReason: needsReason,
    skippedLockedPopulations: pp.locked };
  audit('ATT_GENERATE', period, '', res);
  return res;
}

/** Bulk-approve PENDING rows of one population. Records the active user; refuses if identity unknown. */
function approveAttendance(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  assertNotLocked(period, population);
  var user = '';
  try { user = Session.getActiveUser().getEmail(); } catch (e) { user = ''; }
  if (!user) throw new Error('Cannot determine active user email - approval refused');
  var approved = [], blocked = [], updates = [];
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period || String(r.PAYROLL_CATEGORY).trim() !== population) return;
    if (String(r.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') return;
    var problems = validateAttendanceRowForApproval(r);
    if (problems.length) { blocked.push({ EMP_ID: r.EMP_ID, problems: problems }); return; }
    updates.push({ row: r._row, values: { APPROVAL_STATUS: 'APPROVED', APPROVED_BY: user } });
    approved.push(r.EMP_ID);
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  var res = { period: period, population: population, approvedBy: user, approved: approved.length, blocked: blocked };
  audit('ATT_APPROVE', period, population, res);
  return res;
}

/** Form-submit handler for both attendance forms (site resolved from the form id). */
function onAttendanceFormSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var formId = e.source.getId();
    var site = null;
    if (formId === String(getControl('ATT_FORM_NASHIK_ID', ''))) site = SITE_NASHIK;
    else if (formId === String(getControl('ATT_FORM_PUNE_ID', ''))) site = SITE_PUNE;
    if (!site) throw new Error('Form ' + formId + ' is not a registered attendance form');
    var resp = e.response;
    var parsed = parseFormAnswers(resp.getItemResponses().map(function (ir) {
      var item = ir.getItem();
      var t = item.getType();
      var rows = null;
      if (t === FormApp.ItemType.GRID) rows = item.asGridItem().getRows();
      return { type: String(t), title: item.getTitle(), response: ir.getResponse(), rows: rows };
    }), resp.getId(), Utilities.formatDate(resp.getTimestamp(), HROS_TZ, "yyyy-MM-dd'T'HH:mm:ss"));
    var out = ingestAttendanceResponse_(parsed, site);
    audit('ATT_FORM_SUBMIT', parsed.date || '', '', { site: site, response: resp.getId(), valid: out.valid,
      rejected: out.rejected, superseded: out.superseded });
  } catch (err) {
    try { audit('ATT_FORM_ERROR', '', '', String(err && err.message ? err.message : err)); } catch (e2) { /* ignore */ }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** Pure: form item responses -> {date, marks, ack, timestamp, sourceRef}. Item types passed as strings. */
function parseFormAnswers(items, responseId, timestamp) {
  var out = { date: '', marks: {}, ack: false, timestamp: timestamp || '', sourceRef: responseId || '' };
  (items || []).forEach(function (it) {
    var type = String(it.type).toUpperCase();
    if (type.indexOf('DATE') >= 0 && type.indexOf('TIME') < 0) {
      out.date = toIsoDate(it.response);
    } else if (type.indexOf('GRID') >= 0 && it.rows && Array.isArray(it.response)) {
      it.rows.forEach(function (label, i) {
        var parsed = parseRowLabel(label);
        var v = it.response[i];
        if (parsed && v != null && String(v).trim() !== '') out.marks[parsed.empId] = String(v).trim().toUpperCase();
      });
    } else if (type.indexOf('CHECKBOX') >= 0) {
      out.ack = Array.isArray(it.response) ? it.response.length > 0 : !!it.response;
    }
  });
  return out;
}

/** Normalise one parsed response and write it (rejects < MIN_PERIOD and LOCKED populations). */
function ingestAttendanceResponse_(parsed, site) {
  var date = toIsoDate(parsed.date);
  if (!date) throw new Error('Response has no valid date');
  var period = date.slice(0, 7);
  guardPeriod_(period);
  var roster = buildRoster();
  var holidays = readObjects(TABS.HOLIDAY_CALENDAR);
  var rows = normalizeAttendanceResponse(parsed, roster, holidays, site, getWeeklyOff(site));
  var st = getPeriodStatusMap(period);
  var popOf = {};
  roster.forEach(function (e) { popOf[e.EMP_ID] = e.PAYROLL_CATEGORY; });
  rows = rows.map(function (r) {
    if (r.STATUS === 'VALID' && st[popOf[r.EMP_ID]] === PERIOD_STATUS.LOCKED) {
      r.STATUS = 'REJECTED'; r.REJECT_REASON = 'PERIOD_LOCKED';
    }
    return r;
  });
  var existing = readObjects(TABS.ATTENDANCE_DAILY).filter(function (r) { return toIsoDate(r.DATE) === date; });
  var sup = findSuperseded(existing, rows);
  updateRows(TABS.ATTENDANCE_DAILY, sup.map(function (r) { return { row: r._row, values: { STATUS: 'SUPERSEDED' } }; }));
  appendObjects(TABS.ATTENDANCE_DAILY, rows);
  return { valid: rows.filter(function (r) { return r.STATUS === 'VALID'; }).length,
    rejected: rows.filter(function (r) { return r.STATUS !== 'VALID'; }).length, superseded: sup.length };
}

// ===== 11_AttendanceForms.gs =====
/**
 * 11_AttendanceForms.gs - daily attendance Google Forms (Nashik, Pune), roster refresh, trigger install.
 */
var ATT_ROW_SEPARATOR = ' – '; // "EMP_ID – Name" (en dash with spaces)
var ATT_GRID_TITLE_PREFIX = 'Attendance – ';
var ATT_ACK_TEXT = 'All employees left blank were present (or on weekly off / holiday as per calendar)';
var ATT_MAX_TRIGGERS = 5;

var ATT_FORM_DEFS = {
  NASHIK: { site: 'NASHIK', title: 'Daily Attendance – Nashik', populations: ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT'],
    idKey: 'ATT_FORM_NASHIK_ID', rawTab: 'ATT_FORM_NASHIK_RAW' },
  PUNE: { site: 'PUNE', title: 'Daily Attendance – Pune', populations: ['PUNE_STAFF'],
    idKey: 'ATT_FORM_PUNE_ID', rawTab: 'ATT_FORM_PUNE_RAW' }
};

/** Pure. */
function formRowLabel(empId, name) { return String(empId).trim() + ATT_ROW_SEPARATOR + String(name || '').trim(); }

/** Pure. Extracts EMP_ID before " – ". Returns null if the separator is absent. */
function parseRowLabel(label) {
  var s = String(label == null ? '' : label);
  var i = s.indexOf(ATT_ROW_SEPARATOR);
  if (i <= 0) return null;
  return { empId: s.slice(0, i).trim(), name: s.slice(i + ATT_ROW_SEPARATOR.length).trim() };
}

/** Pure. {DEPARTMENT: [rowLabel,...]} for the populations; duplicate EMP_IDs dropped; blank dept -> 'Unassigned'. */
function groupRosterByDepartment(roster, populations) {
  var groups = {}, seen = {};
  roster.forEach(function (e) {
    if (populations.indexOf(e.PAYROLL_CATEGORY) < 0 || seen[e.EMP_ID]) return;
    seen[e.EMP_ID] = true;
    var d = e.DEPARTMENT || 'Unassigned';
    (groups[d] = groups[d] || []).push(formRowLabel(e.EMP_ID, e.NAME));
  });
  Object.keys(groups).forEach(function (d) { groups[d].sort(); });
  return groups;
}

function addGridForDepartment_(form, dept, labels) {
  return form.addGridItem().setTitle(ATT_GRID_TITLE_PREFIX + dept).setRows(labels).setColumns(DAILY_CODES).setRequired(false);
}

function buildAttendanceForm_(def, roster) {
  var form = FormApp.create(def.title);
  form.setDescription('Mark only exceptions (absent, half day, leave, OD etc.). Leave everyone else blank.');
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.addDateItem().setTitle('Date').setRequired(true);
  var groups = groupRosterByDepartment(roster, def.populations);
  Object.keys(groups).sort().forEach(function (d) { addGridForDepartment_(form, d, groups[d]); });
  form.addCheckboxItem().setTitle(ATT_ACK_TEXT).setChoiceValues(['Confirmed']).setRequired(true);
  return form;
}

function sheetNames_(ss) { return ss.getSheets().map(function (s) { return s.getName(); }); }

function createAttendanceForms() {
  var ss = getSpreadsheet_();
  var roster = buildRoster();
  var res = { created: [], skipped: [], notes: [] };
  Object.keys(ATT_FORM_DEFS).forEach(function (k) {
    var def = ATT_FORM_DEFS[k];
    if (String(getControl(def.idKey, '')).trim()) { res.skipped.push(k + ' (form id already in PAYROLL_CONTROL)'); return; }
    var before = sheetNames_(ss);
    var form = buildAttendanceForm_(def, roster);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    SpreadsheetApp.flush();
    var created = ss.getSheets().filter(function (s) { return before.indexOf(s.getName()) < 0; });
    var dest = created[0];
    if (!dest) { // fall back: tab linked to this form
      dest = ss.getSheets().filter(function (s) {
        try { return s.getFormUrl() === form.getEditUrl() || s.getFormUrl() === form.getPublishedUrl(); } catch (e) { return false; }
      })[0];
    }
    if (dest && !ss.getSheetByName(def.rawTab)) dest.setName(def.rawTab);
    else res.notes.push('Could not rename response tab for ' + k + '; rename manually to ' + def.rawTab);
    setControl(def.idKey, form.getId(), def.title + ' form id');
    res.created.push({ form: k, id: form.getId(), editUrl: form.getEditUrl(), liveUrl: form.getPublishedUrl() });
  });
  audit('ATT_FORMS_CREATE', '', '', res);
  return res;
}

/** Rebuild grid rows per department from the active master. Existing grids updated in place, new depts added
 * (before the checkbox), grids for departments with no active employees deleted. Never touches responses. */
function refreshAttendanceFormRosters() {
  var roster = buildRoster();
  var res = { updated: [], added: [], removed: [], skipped: [] };
  Object.keys(ATT_FORM_DEFS).forEach(function (k) {
    var def = ATT_FORM_DEFS[k];
    var id = String(getControl(def.idKey, '')).trim();
    if (!id) { res.skipped.push(k + ' (no form id)'); return; }
    var form = FormApp.openById(id);
    var groups = groupRosterByDepartment(roster, def.populations);
    var seen = {};
    form.getItems(FormApp.ItemType.GRID).forEach(function (item) {
      var title = item.getTitle();
      if (title.indexOf(ATT_GRID_TITLE_PREFIX) !== 0) return;
      var dept = title.slice(ATT_GRID_TITLE_PREFIX.length);
      if (groups[dept]) { item.asGridItem().setRows(groups[dept]); seen[dept] = true; res.updated.push(k + ':' + dept); }
      else { form.deleteItem(item); res.removed.push(k + ':' + dept); }
    });
    Object.keys(groups).sort().forEach(function (d) {
      if (seen[d]) return;
      var item = addGridForDepartment_(form, d, groups[d]);
      var items = form.getItems();
      var ackIdx = -1;
      items.forEach(function (it, i) { if (it.getTitle() === ATT_ACK_TEXT) ackIdx = i; });
      if (ackIdx >= 0) form.moveItem(item.getIndex(), ackIdx);
      res.added.push(k + ':' + d);
    });
  });
  audit('ATT_FORMS_REFRESH', '', '', res);
  return res;
}

/** Pure: which attendance triggers must be created. existing = [{handler, sourceId}]. */
function planTriggerInstall(existing, formIds, maxTriggers) {
  var toCreate = [];
  formIds.forEach(function (fid) {
    var have = existing.some(function (t) { return t.handler === 'onAttendanceFormSubmit' && t.sourceId === fid; });
    if (!have) toCreate.push(fid);
  });
  if (existing.length + toCreate.length > (maxTriggers || ATT_MAX_TRIGGERS)) {
    throw new Error('Trigger limit: ' + existing.length + ' existing + ' + toCreate.length + ' new exceeds ' + (maxTriggers || ATT_MAX_TRIGGERS));
  }
  return toCreate;
}

/** Idempotent. Creates only the attendance onFormSubmit triggers that are missing; never touches other triggers. */
function installTriggers() {
  var formIds = [];
  Object.keys(ATT_FORM_DEFS).forEach(function (k) {
    var id = String(getControl(ATT_FORM_DEFS[k].idKey, '')).trim();
    if (id) formIds.push(id);
  });
  if (!formIds.length) throw new Error('No attendance forms registered - run createAttendanceForms first');
  var existing = ScriptApp.getProjectTriggers().map(function (t) {
    return { handler: t.getHandlerFunction(), sourceId: t.getTriggerSourceId ? t.getTriggerSourceId() : '' };
  });
  var toCreate = planTriggerInstall(existing, formIds, ATT_MAX_TRIGGERS);
  toCreate.forEach(function (fid) {
    ScriptApp.newTrigger('onAttendanceFormSubmit').forForm(FormApp.openById(fid)).onFormSubmit().create();
  });
  var res = { created: toCreate.length, alreadyPresent: formIds.length - toCreate.length, totalTriggers: existing.length + toCreate.length };
  audit('TRIGGERS_INSTALL', '', '', res);
  return res;
}

// ===== 20_Feeds.gs =====
/**
 * 20_Feeds.gs - Stage 2/3 feeds: OT, canteen, efficiency normalizers (pure mappers + thin entry points)
 * and pure engine-facing readers (OT, canteen, efficiency, advance, society).
 *
 * Privacy: Overtime_Form is read header-first, only needed columns by name; password columns are never read. Only the columns matched by header name
 * (submission type, emp id, OT date, hours, decision, case no, timestamp) are ever used; approval-password
 * columns are never mapped, copied, logged or written.
 */
var FEEDS_OT_TAB = 'Overtime_Form';
var FEEDS_OT_COLS = 21;               // legacy cap on header lookup
var FEEDS_OT_MAX_HOURS = 16;
var FEEDS_NORMALIZER_VERSION = 'OT-1.0';
var FEEDS_CANTEEN_TAB = 'CANTEEN_FORM_RESPONSES';
var FEEDS_EFFICIENCY_TAB = 'EFFICIENCY_FORM_RESPONSES';
var FEEDS_MAX_TRIGGERS = 5;
var FEEDS_ALL_WORKERS = 'ALL_WORKERS';

// ================================================================ small pure helpers

function feeds_norm_(h) { return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, ''); }

/** Header row -> {normalizedHeader: firstIndex}. */
function feeds_headerIndex_(headerRow, limit) {
  var idx = {};
  for (var i = 0; i < headerRow.length && (limit == null || i < limit); i++) {
    var k = feeds_norm_(headerRow[i]);
    if (k && !(k in idx)) idx[k] = i;
  }
  return idx;
}

/** Find column by list of accepted normalized names; optional contains-fallback tokens. */
function feeds_col_(idx, names, contains) {
  for (var i = 0; i < names.length; i++) if (names[i] in idx) return idx[names[i]];
  if (contains) {
    var keys = Object.keys(idx);
    for (var j = 0; j < keys.length; j++) {
      for (var c = 0; c < contains.length; c++) if (keys[j].indexOf(contains[c]) >= 0) return idx[keys[j]];
    }
  }
  return -1;
}

function feeds_cell_(row, i) { return (i >= 0 && i < row.length) ? row[i] : ''; }
function feeds_str_(v) { return v == null ? '' : String(v).trim(); }
function feeds_isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function feeds_num_(v) {
  if (v === '' || v == null || typeof v === 'boolean' || feeds_isDate_(v)) return NaN;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v).trim().replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s);
}

function feeds_ts_(v) {
  if (v == null || v === '') return 0;
  if (feeds_isDate_(v)) return isNaN(v.getTime()) ? 0 : v.getTime();
  var t = Date.parse(String(v));
  return isNaN(t) ? 0 : t;
}

function feeds_empId_(v) { return feeds_str_(v).toUpperCase(); }

/** Efficiency EMP_ID key: only the ALL WORKERS sentinel is normalised; hyphens/spaces inside real EMP_IDs are kept. */
function feeds_effKey_(v) {
  var id = feeds_empId_(v);
  return /^ALL[\s\-_]+WORKERS$/.test(id) ? FEEDS_ALL_WORKERS : id;
}

/** Date | ISO | dd-mm-yyyy | dd/mm/yyyy (optional time) -> 'YYYY-MM-DD' or ''. */
function feeds_parseDate_(v) {
  if (v == null || v === '') return '';
  if (feeds_isDate_(v)) return toIsoDate(v);
  var s = String(v).trim();
  var iso = toIsoDate(s);
  if (iso) return iso;
  var m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:$|[T\s])/.exec(s);
  if (m) {
    var d = +m[1], mo = +m[2], y = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return '';
    return y + '-' + pad2_(mo) + '-' + pad2_(d);
  }
  return '';
}

var FEEDS_MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Loose period parser: Date, 'YYYY-MM', 'YYYY-MM-01', 'Sep 2026', 'September-2026' -> 'YYYY-MM' or ''. */
function feeds_parsePeriodLoose_(v) {
  var p = normalizePeriod(v);
  if (p) return p;
  var m = /^([A-Za-z]{3,9})[\s\-\/,.]+(\d{4})$/.exec(feeds_str_(v));
  if (m) {
    var i = FEEDS_MONTHS_.indexOf(m[1].toLowerCase().slice(0, 3));
    if (i >= 0) return m[2] + '-' + pad2_(i + 1);
  }
  return '';
}

function feeds_keySet_(keys) {
  var set = {};
  if (!keys) return set;
  if (Array.isArray(keys)) { keys.forEach(function (k) { set[String(k)] = true; }); return set; }
  Object.keys(keys).forEach(function (k) { if (keys[k]) set[k] = true; });
  return set;
}

function feeds_rosterMap_(roster) {
  var map = {};
  (roster || []).forEach(function (r) { map[feeds_empId_(r.EMP_ID)] = r; });
  return map;
}

// ================================================================ OT mapping (pure)

/**
 * Event-log semantics of Overtime_Form (headers: Timestamp, Submission Type, EMP ID, Date Of OT, OT Hours,
 * Approval Decision, Case No ...): an employee/supervisor "Apply For OT" row carries no decision; the manager's
 * final decision arrives as a separate "Approval Of Manager" row that repeats EMP ID / Date / Hours and carries
 * Approval Decision = Approved | Rejected. Only "Approval Of Manager" + exactly "Approved" is counted.
 *
 * @param {Array} headerRow  selected header cells (needed columns only)
 * @param {Array<Array>} rows data rows zipped from the selected columns
 * @param {string} period 'YYYY-MM'
 * @param {Array} roster active roster [{EMP_ID, PAYROLL_CATEGORY}]
 * @param {Array|Object} existingKeys OT_KEYs already in INPUT_OT
 * @param {Object} [opts] {firstRow: sheet row number of rows[0], default 2, enteredAt}
 * @returns {{valid:Array, exceptions:Array, pendingCount:number, pendingEmpIds:Array, duplicateSkipped:number, missingColumns:Array}}
 *   pendingEmpIds holds one (upper-case) EMP_ID per pending event so callers can split the count by population.
 */
function mapOtRows(headerRow, rows, period, roster, existingKeys, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2;
  var enteredAt = opts.enteredAt || '';
  var idx = feeds_headerIndex_(headerRow, FEEDS_OT_COLS);
  var c = {
    ts: feeds_col_(idx, ['timestamp']),
    type: feeds_col_(idx, ['submissiontype']),
    emp: feeds_col_(idx, ['empid', 'employeeid', 'employeecode']),
    date: feeds_col_(idx, ['dateofot', 'otdate']),
    hours: feeds_col_(idx, ['othours', 'overtimehours']),
    decision: feeds_col_(idx, ['approvaldecision', 'decision']),
    kase: feeds_col_(idx, ['caseno', 'caseid', 'casenumber'])
  };
  var missing = [];
  ['type', 'emp', 'date', 'hours', 'decision'].forEach(function (k) { if (c[k] < 0) missing.push(k); });
  var out = { valid: [], exceptions: [], pendingCount: 0, pendingEmpIds: [], duplicateSkipped: 0, missingColumns: missing };
  if (missing.length) return out; // fail closed: nothing counted without required headers

  var pStart = periodStart(period), pEnd = periodEnd(period);
  var have = feeds_keySet_(existingKeys);
  var rosterMap = feeds_rosterMap_(roster);

  // pass 1: in-memory filter of rows whose OT date is in the period (or unparseable on decisive rows)
  var events = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var date = feeds_parseDate_(feeds_cell_(row, c.date));
    var decRaw = feeds_str_(feeds_cell_(row, c.decision));
    if (!date) {
      if (decRaw) events.push({ i: i, date: '', decRaw: decRaw, row: row, bad: true });
      continue;
    }
    if (date < pStart || date > pEnd) continue;
    events.push({ i: i, date: date, decRaw: decRaw, row: row });
  }

  var emps = {};        // EMP|DATE -> has an approval-type row (approved or rejected) for pending logic
  var groups = {};      // EMP|DATE|CASE -> {approved:[], rejected:[]}
  var applies = [];
  var decisive = [];

  events.forEach(function (ev) {
    var row = ev.row;
    ev.emp = feeds_empId_(feeds_cell_(row, c.emp));
    ev.type = feeds_norm_(feeds_cell_(row, c.type));
    ev.kase = feeds_str_(feeds_cell_(row, c.kase));
    ev.ts = feeds_ts_(feeds_cell_(row, c.ts));
    ev.dec = ev.decRaw.toLowerCase();
    ev.srcRow = firstRow + ev.i;
    var isApprovalType = ev.type.indexOf('approval') >= 0;
    var isApplyType = ev.type.indexOf('apply') >= 0;
    if (ev.bad) { decisive.push(ev); return; }
    var dayKey = ev.emp + '|' + ev.date;
    if (isApprovalType) {
      emps[dayKey] = true;
      if (ev.dec === 'approved' || ev.dec === 'rejected') {
        var gk = dayKey + '|' + ev.kase.toUpperCase();
        var g = groups[gk] || (groups[gk] = { approved: [], rejected: [] });
        (ev.dec === 'approved' ? g.approved : g.rejected).push(ev);
      } else if (!ev.dec) {
        out.pendingCount++;               // approval row without decision = still pending
        out.pendingEmpIds.push(ev.emp);
      } else {
        decisive.push(ev);                // unrecognised decision text
      }
    } else if (ev.dec === 'approved') {
      decisive.push(ev);                  // Approved on a non-approval row = ambiguous
    } else if (isApplyType || !ev.type) {
      if (!ev.dec) applies.push(ev);
    }
  });

  applies.forEach(function (ev) { if (!emps[ev.emp + '|' + ev.date]) { out.pendingCount++; out.pendingEmpIds.push(ev.emp); } });

  function baseRow(ev, extra) {
    var o = {
      PAYROLL_MONTH: period, EMP_ID: ev.emp, OT_HOURS: '', SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'APPROVED',
      ENTERED_AT: enteredAt, SOURCE_CASE_NOS: ev.kase ? "'" + ev.kase : '', SOURCE_EVENT_COUNT: 1,
      DATE_RANGE: ev.date ? ev.date + '..' + ev.date : '', OT_KEY: '', OT_DATE: ev.date || '', SOURCE_ROW: ev.srcRow,
      NORMALIZER_VERSION: FEEDS_NORMALIZER_VERSION, ELIGIBILITY: 'VALID', EXCEPTION_REASON: ''
    };
    o.OT_KEY = ev.emp + '|' + (ev.date || 'NODATE') + '|' + ev.srcRow;
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function pushException(ev, reason) {
    var key = ev.emp + '|' + (ev.date || 'NODATE') + '|' + ev.srcRow;
    if (have[key]) { out.duplicateSkipped++; return; }
    have[key] = true;
    var h = feeds_num_(feeds_cell_(ev.row, c.hours));
    out.exceptions.push(baseRow(ev, { ELIGIBILITY: 'EXCEPTION', EXCEPTION_REASON: reason,
      OT_HOURS: isNaN(h) ? '' : h, APPROVAL_STATUS: 'EXCEPTION' }));
  }
  function acceptApproved(ev) {
    var hours = feeds_num_(feeds_cell_(ev.row, c.hours));
    if (!ev.emp) return pushException(ev, 'MISSING_EMP_ID');
    if (!rosterMap[ev.emp]) return pushException(ev, 'UNKNOWN_OR_INACTIVE_EMP_ID');
    if (isNaN(hours)) return pushException(ev, 'HOURS_NOT_NUMERIC');
    if (hours <= 0) return pushException(ev, 'HOURS_NOT_POSITIVE');
    if (hours > FEEDS_OT_MAX_HOURS) return pushException(ev, 'HOURS_OVER_' + FEEDS_OT_MAX_HOURS);
    var key = ev.emp + '|' + ev.date + '|' + ev.srcRow;
    if (have[key]) { out.duplicateSkipped++; return; }
    have[key] = true;
    out.valid.push(baseRow(ev, { OT_HOURS: hours }));
  }

  decisive.forEach(function (ev) {
    pushException(ev, ev.bad ? 'OT_DATE_UNPARSEABLE' : (ev.dec === 'approved' ? 'APPROVED_ON_NON_APPROVAL_ROW' : 'UNRECOGNISED_DECISION'));
  });

  Object.keys(groups).forEach(function (gk) {
    var g = groups[gk];
    if (!g.approved.length) return;
    var order = function (a, b) { return (a.ts - b.ts) || (a.i - b.i); };
    g.approved.sort(order);
    g.rejected.sort(order);
    var latestApproved = g.approved[g.approved.length - 1];
    var latestRejected = g.rejected.length ? g.rejected[g.rejected.length - 1] : null;
    if (latestRejected && order(latestRejected, latestApproved) > 0) {
      g.approved.forEach(function (ev) { pushException(ev, 'REVOKED_BY_LATER_REJECTION'); });
      return;
    }
    if (g.approved.length > 1) {
      var hrs = g.approved.map(function (ev) { return feeds_num_(feeds_cell_(ev.row, c.hours)); });
      var same = hrs.every(function (h) { return h === hrs[0]; });
      if (!same) {
        g.approved.forEach(function (ev) { pushException(ev, 'CONFLICTING_DUPLICATE_APPROVALS'); });
        return;
      }
      // identical repeated approvals of the same event: count the latest only
      g.approved.slice(0, -1).forEach(function () { out.duplicateSkipped++; });
    }
    acceptApproved(latestApproved);
  });

  return out;
}

// ================================================================ canteen / efficiency mapping (pure)

function feeds_latestPerKey_(items) {
  var best = {};
  items.forEach(function (it) {
    var cur = best[it.key];
    if (!cur || it.ts > cur.ts || (it.ts === cur.ts && it.i > cur.i)) best[it.key] = it;
  });
  return best;
}

function feeds_commonCols_(idx) {
  return {
    ts: feeds_col_(idx, ['timestamp']),
    month: feeds_col_(idx, ['payrollmonth', 'period', 'month']),
    emp: feeds_col_(idx, ['employeeid', 'empid']),
    subType: feeds_col_(idx, ['submissiontype', 'correctiontype']),
    prevRef: feeds_col_(idx, ['previoussubmissionreference', 'priorresponsereference', 'previousreference'], ['previous', 'prior']),
    reason: feeds_col_(idx, ['correctionreason'])
  };
}

/**
 * Canteen form responses -> INPUT_CANTEEN rows. Latest response per PERIOD|EMP_ID wins; a latest response that
 * fails validation yields an exception (no fallback to an older one). Manual HR rows are never touched here.
 * @returns {{valid:Array, exceptions:Array, skippedExisting:number, missingColumns:Array}}
 */
function mapCanteenRows(headerRow, rows, period, roster, existingRefs, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2;
  var idx = feeds_headerIndex_(headerRow);
  var c = feeds_commonCols_(idx);
  c.amount = feeds_col_(idx, ['deductionamountinr', 'deductionamount', 'amountinr', 'amount'], ['amount']);
  var out = { valid: [], exceptions: [], skippedExisting: 0, missingColumns: [] };
  ['month', 'emp', 'amount'].forEach(function (k) { if (c[k] < 0) out.missingColumns.push(k); });
  if (out.missingColumns.length) return out;
  var have = feeds_keySet_(existingRefs), rosterMap = feeds_rosterMap_(roster);

  var items = [];
  rows.forEach(function (row, i) {
    if (feeds_parsePeriodLoose_(feeds_cell_(row, c.month)) !== period) return;
    var emp = feeds_empId_(feeds_cell_(row, c.emp));
    if (!emp) return;
    items.push({ i: i, row: row, emp: emp, key: period + '|' + emp, ts: feeds_ts_(feeds_cell_(row, c.ts)) });
  });
  var best = feeds_latestPerKey_(items);
  Object.keys(best).sort().forEach(function (k) {
    var it = best[k], row = it.row;
    var ref = FEEDS_CANTEEN_TAB + '!' + (firstRow + it.i);
    if (have[ref]) { out.skippedExisting++; return; }
    var amount = feeds_num_(feeds_cell_(row, c.amount));
    var reason = '';
    if (!rosterMap[it.emp]) reason = 'UNKNOWN_OR_INACTIVE_EMP_ID';
    else if (isNaN(amount)) reason = 'AMOUNT_NOT_NUMERIC';
    else if (amount < 0) reason = 'AMOUNT_NEGATIVE';
    else if (/correction/i.test(feeds_str_(feeds_cell_(row, c.subType))) && !feeds_str_(feeds_cell_(row, c.prevRef))) {
      reason = 'CORRECTION_WITHOUT_REFERENCE';
    }
    var o = { PAYROLL_MONTH: period, EMP_ID: it.emp, AMOUNT_INR: reason ? '' : amount, SOURCE: 'FORM_CANTEEN',
      SOURCE_REF: ref, KEY: k, STATUS: reason ? 'EXCEPTION' : 'VALID', ENTERED_AT: opts.enteredAt || '',
      REMARKS: reason || feeds_str_(feeds_cell_(row, c.reason)) };
    (reason ? out.exceptions : out.valid).push(o);
  });
  return out;
}

/**
 * Efficiency form responses -> INPUT_EFFICIENCY rows. EMP_ID may be ALL_WORKERS.
 * @returns {{valid:Array, exceptions:Array, skippedExisting:number, missingColumns:Array}}
 */
function mapEfficiencyRows(headerRow, rows, period, roster, existingRefs, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2;
  var idx = feeds_headerIndex_(headerRow);
  var c = feeds_commonCols_(idx);
  c.pct = feeds_col_(idx, ['productionefficiencypercent', 'efficiencyachieved', 'efficiencypct', 'efficiency'], ['efficiency']);
  c.days = feeds_col_(idx, ['physicalpresentdaysoptional', 'physicalpresentdays', 'applicabledays', 'eligibledays'],
    ['physicalpresent', 'applicabledays']);
  var out = { valid: [], exceptions: [], skippedExisting: 0, missingColumns: [] };
  ['month', 'emp', 'pct'].forEach(function (k) { if (c[k] < 0) out.missingColumns.push(k); });
  if (out.missingColumns.length) return out;
  var have = feeds_keySet_(existingRefs), rosterMap = feeds_rosterMap_(roster);

  var items = [];
  rows.forEach(function (row, i) {
    if (feeds_parsePeriodLoose_(feeds_cell_(row, c.month)) !== period) return;
    var emp = feeds_effKey_(feeds_cell_(row, c.emp));
    if (!emp) return;
    items.push({ i: i, row: row, emp: emp, key: period + '|' + emp, ts: feeds_ts_(feeds_cell_(row, c.ts)) });
  });
  var best = feeds_latestPerKey_(items);
  Object.keys(best).sort().forEach(function (k) {
    var it = best[k], row = it.row;
    var ref = FEEDS_EFFICIENCY_TAB + '!' + (firstRow + it.i);
    if (have[ref]) { out.skippedExisting++; return; }
    var pct = feeds_num_(feeds_cell_(row, c.pct));
    var daysRaw = feeds_cell_(row, c.days);
    var days = (daysRaw === '' || daysRaw == null) ? '' : feeds_num_(daysRaw);
    var reason = '';
    if (it.emp !== FEEDS_ALL_WORKERS) {
      var r = rosterMap[it.emp];
      if (!r) reason = 'UNKNOWN_OR_INACTIVE_EMP_ID';
      else if (r.PAYROLL_CATEGORY && r.PAYROLL_CATEGORY !== POP.PERMANENT_WORKER) reason = 'NOT_A_PERMANENT_WORKER';
    }
    if (!reason) {
      if (isNaN(pct)) reason = 'EFFICIENCY_NOT_NUMERIC';
      else if (pct < 0 || pct > 100) reason = 'EFFICIENCY_OUT_OF_RANGE';
      else if (days !== '' && (isNaN(days) || days < 0 || days > 31)) reason = 'PHYSICAL_DAYS_INVALID';
      else if (/correction/i.test(feeds_str_(feeds_cell_(row, c.subType))) && !feeds_str_(feeds_cell_(row, c.prevRef))) {
        reason = 'CORRECTION_WITHOUT_REFERENCE';
      }
    }
    var o = { PAYROLL_MONTH: period, EMP_ID: it.emp, EFFICIENCY_PCT: reason ? '' : pct,
      PHYSICAL_PRESENT_DAYS_OVERRIDE: reason ? '' : days, SOURCE: 'FORM_EFFICIENCY', SOURCE_REF: ref, KEY: k,
      STATUS: reason ? 'EXCEPTION' : 'VALID', ENTERED_AT: opts.enteredAt || '',
      REMARKS: reason || feeds_str_(feeds_cell_(row, c.reason)) };
    (reason ? out.exceptions : out.valid).push(o);
  });
  return out;
}

// ================================================================ engine-facing readers (pure)

function feeds_add_(map, id, n) { map[id] = (map[id] || 0) + n; }

/**
 * VALID OT hours per EMP_ID for the period. Legacy rows (no NORMALIZER_VERSION) and anything not ELIGIBILITY=VALID
 * are never counted.
 */
function sumOtHours(rows, period) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.ELIGIBILITY).toUpperCase() !== 'VALID') return;
    if (!feeds_str_(r.NORMALIZER_VERSION)) return;
    var st = feeds_str_(r.APPROVAL_STATUS).toUpperCase();
    if (st && st !== 'APPROVED') return;
    var h = feeds_num_(r.OT_HOURS);
    if (isNaN(h) || h <= 0) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), h);
  });
  return out;
}

/** Latest row per key (ENTERED_AT, then position) among usable rows of the period. */
function feeds_latestRows_(rows, period, keyFn) {
  var best = {};
  (rows || []).forEach(function (r, i) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var st = feeds_str_(r.STATUS).toUpperCase();
    if (st && st !== 'VALID') return;
    var k = keyFn(r);
    if (!k) return;
    var it = { r: r, ts: feeds_ts_(r.ENTERED_AT), i: i };
    var cur = best[k];
    if (!cur || it.ts > cur.ts || (it.ts === cur.ts && it.i > cur.i)) best[k] = it;
  });
  return best;
}

/** {EMP_ID: amount} - latest VALID row per PERIOD|EMP_ID wins (form or HR_MANUAL). */
function canteenByEmp(rows, period) {
  var best = feeds_latestRows_(rows, period, function (r) { return feeds_empId_(r.EMP_ID); });
  var out = {};
  Object.keys(best).forEach(function (id) {
    var a = feeds_num_(best[id].r.AMOUNT_INR);
    if (!isNaN(a) && a >= 0) out[id] = a;
  });
  return out;
}

/**
 * {EMP_ID: {pct, physicalDaysOverride, source}} for workerIds. A per-employee row overrides ALL_WORKERS entirely.
 */
function efficiencyByEmp(rows, period, workerIds) {
  var best = feeds_latestRows_(rows, period, function (r) {
    return feeds_effKey_(r.EMP_ID);
  });
  function read(it, source) {
    var pct = feeds_num_(it.r.EFFICIENCY_PCT);
    if (isNaN(pct)) return null;
    var d = feeds_num_(it.r.PHYSICAL_PRESENT_DAYS_OVERRIDE);
    return { pct: pct, physicalDaysOverride: isNaN(d) ? null : d, source: source };
  }
  var all = best[FEEDS_ALL_WORKERS] ? read(best[FEEDS_ALL_WORKERS], FEEDS_ALL_WORKERS) : null;
  var out = {};
  (workerIds || []).forEach(function (raw) {
    var id = feeds_empId_(raw);
    var own = best[id] ? read(best[id], 'EMP') : null;
    var v = own || all;
    if (v) out[id] = { pct: v.pct, physicalDaysOverride: v.physicalDaysOverride, source: v.source };
  });
  return out;
}

function feeds_sumApproved_(rows, period, col) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.APPROVAL_STATUS).toUpperCase() !== 'APPROVED') return;
    var n = feeds_num_(r[col]);
    if (isNaN(n)) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), n);
  });
  return out;
}

/** {EMP_ID: RECOVERY_THIS_MONTH_INR} from APPROVED INPUT_ADVANCE rows (multiple advances sum). */
function advanceByEmp(rows, period) { return feeds_sumApproved_(rows, period, 'RECOVERY_THIS_MONTH_INR'); }

/** {EMP_ID: TOTAL_RECOVERY_INR} from APPROVED INPUT_SOCIETY rows. */
function societyByEmp(rows, period) { return feeds_sumApproved_(rows, period, 'TOTAL_RECOVERY_INR'); }

// ================================================================ trigger planning (pure)

/**
 * existing: [{handler, sourceId}], wanted: [{handler, formId}]. Returns {toCreate:[...], present:n}; throws if the
 * project would exceed max triggers.
 */
function feeds_planTriggers(existing, wanted, max) {
  var toCreate = [], present = 0;
  wanted.forEach(function (w) {
    var dup = existing.some(function (e) { return e.handler === w.handler && String(e.sourceId) === String(w.formId); });
    if (dup) present++; else toCreate.push(w);
  });
  if (existing.length + toCreate.length > (max || FEEDS_MAX_TRIGGERS)) {
    throw new Error('Installing ' + toCreate.length + ' trigger(s) would exceed the ' + (max || FEEDS_MAX_TRIGGERS) +
      ' trigger limit (' + existing.length + ' already installed)');
  }
  return { toCreate: toCreate, present: present };
}

/** Pure: [{title, response}] -> 'YYYY-MM' of the "Payroll Month" answer, or ''. */
function feeds_periodFromAnswers(items) {
  for (var i = 0; i < (items || []).length; i++) {
    if (/payroll\s*month|^period$/i.test(String(items[i].title || ''))) {
      var v = items[i].response;
      if (Array.isArray(v)) v = v[0];
      return feeds_parsePeriodLoose_(v);
    }
  }
  return '';
}

// ================================================================ sheet-touching entry points

function feeds_isPasswordHeader_(h) { return feeds_norm_(h).indexOf('password') >= 0; }

/** Throws if any selected header is a password column. */
function feeds_assertNoPassword_(headers, cols) {
  cols.forEach(function (c) {
    if (feeds_isPasswordHeader_(headers[c])) throw new Error('Refusing to read password column ' + (c + 1));
  });
}

/**
 * Pure: pick columns by header name. defs=[{key, names, required}]. Password headers are never eligible.
 * Returns {cols:[0-based indexes, unique], missing:[keys]}.
 */
function feeds_selectColumns_(headers, defs) {
  var idx = {};
  headers.forEach(function (h, i) {
    var k = feeds_norm_(h);
    if (k && !feeds_isPasswordHeader_(h) && !(k in idx)) idx[k] = i;
  });
  var cols = [], missing = [];
  defs.forEach(function (d) {
    var at = feeds_col_(idx, d.names);
    if (at < 0) { if (d.required) missing.push(d.key); return; }
    if (cols.indexOf(at) < 0) cols.push(at);
  });
  cols.sort(function (a, b) { return a - b; });
  feeds_assertNoPassword_(headers, cols);
  return { cols: cols, missing: missing };
}

/** Reads row 1 only, then each selected column individually; zips into {header, rows} (selected columns only). */
function feeds_readColumns_(sheet, defs) {
  var lc = sheet.getLastColumn(), lr = sheet.getLastRow();
  if (lc < 1) return { header: [], rows: [], missing: defs.filter(function (d) { return d.required; }).map(function (d) { return d.key; }) };
  var headers = sheet.getRange(1, 1, 1, lc).getValues()[0];
  var sel = feeds_selectColumns_(headers, defs);
  var header = sel.cols.map(function (c) { return headers[c]; });
  var rows = [];
  if (!sel.missing.length && lr >= 2) {
    var data = sel.cols.map(function (c) { return sheet.getRange(2, c + 1, lr - 1, 1).getValues(); });
    for (var r = 0; r < lr - 1; r++) rows.push(data.map(function (col) { return col[r][0]; }));
  }
  return { header: header, rows: rows, missing: sel.missing };
}

var FEEDS_OT_DEFS = [
  { key: 'Timestamp', names: ['timestamp'] },
  { key: 'Submission Type', names: ['submissiontype'], required: true },
  { key: 'EMP ID', names: ['empid', 'employeeid', 'employeecode'], required: true },
  { key: 'Date Of OT', names: ['dateofot', 'otdate'], required: true },
  { key: 'OT Hours', names: ['othours', 'overtimehours'], required: true },
  { key: 'Approval Decision', names: ['approvaldecision', 'decision'], required: true },
  { key: 'Case No', names: ['caseno', 'caseid', 'casenumber'] }
];

/** Whole non-password columns of a form-response tab, read column by column. */
function feeds_readFormColumns_(sheet) {
  var lc = sheet.getLastColumn();
  if (lc < 1) return { header: [], rows: [], missing: [] };
  var headers = sheet.getRange(1, 1, 1, lc).getValues()[0];
  var defs = [];
  headers.forEach(function (h, i) {
    if (feeds_norm_(h) && !feeds_isPasswordHeader_(h)) defs.push({ key: 'c' + i, names: [feeds_norm_(h)] });
  });
  return feeds_readColumns_(sheet, defs);
}

function feeds_lockedPops_(period) {
  var st = getPeriodStatusMap(period), locked = {};
  POPULATION_LIST.forEach(function (p) { if (st[p] === PERIOD_STATUS.LOCKED) locked[p] = true; });
  return locked;
}

function feeds_toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'HR OS', 5); } catch (e) { /* not in UI context */ }
}

function feeds_existingValues_(tab, col) {
  var set = {};
  readObjects(tab).forEach(function (r) { var v = feeds_str_(r[col]); if (v) set[v] = true; });
  return set;
}

/** Pure: pending OT events -> {population: count}. Events of unknown/inactive EMP_IDs go under UNKNOWN (only when > 0). */
function feeds_pendingByPopulation(pendingEmpIds, popOf) {
  var out = {};
  POPULATION_LIST.forEach(function (p) { out[p] = 0; });
  var unknown = 0;
  (pendingEmpIds || []).forEach(function (id) {
    var p = popOf[feeds_empId_(id)];
    if (p && p in out) out[p]++; else unknown++;
  });
  if (unknown > 0) out.UNKNOWN = unknown;
  return out;
}

/** Pure: JSON text of OT_PENDING_<period> -> {population: count}; blank/invalid -> {}. */
function feeds_parsePendingOt(raw) {
  try {
    var o = JSON.parse(String(raw == null ? '' : raw));
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}

/** Sync approved OT events for the period from Overtime_Form (needed columns only, never password columns) into INPUT_OT. Append-only, idempotent. */
function syncOtFromForm(period) {
  guardPeriod_(period);
  var sheet = resolveSheet_(FEEDS_OT_TAB);
  if (sheet.getLastRow() < 2) {
    setControl('OT_PENDING_' + period, JSON.stringify(feeds_pendingByPopulation([], {})), 'pending OT events per population; written by OT sync');
    return { period: period, written: 0, message: 'Overtime_Form is empty' };
  }
  var block = feeds_readColumns_(sheet, FEEDS_OT_DEFS); // header row, then only the needed columns
  if (block.missing.length) throw new Error('Overtime_Form is missing required column(s): ' + block.missing.join(', '));
  var header = block.header, rows = block.rows;
  var roster = buildRoster();
  var popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var existing = feeds_existingValues_(TABS.INPUT_OT, 'OT_KEY');
  var res = mapOtRows(header, rows, period, roster, existing, { firstRow: 2, enteredAt: nowIso_() });
  if (res.missingColumns.length) throw new Error('Overtime_Form is missing required column(s): ' + res.missingColumns.join(', '));
  var locked = feeds_lockedPops_(period);
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[o.EMP_ID];
    if (pop && locked[pop]) { lockedSkipped++; return false; }
    return true;
  }
  var valid = res.valid.filter(open), exceptions = res.exceptions.filter(open);
  var toWrite = valid.concat(exceptions);
  if (toWrite.length) appendObjects(TABS.INPUT_OT, toWrite, { textHeaders: ['OT_KEY', 'OT_DATE', 'DATE_RANGE'] });
  var summary = { period: period, validWritten: valid.length, exceptionsWritten: exceptions.length,
    pending: res.pendingCount, duplicatesSkipped: res.duplicateSkipped, lockedSkipped: lockedSkipped,
    validHours: valid.reduce(function (s, o) { return s + o.OT_HOURS; }, 0) };
  // remember pending (not yet approved/rejected) OT events per population so readiness can WARN
  summary.pendingByPopulation = feeds_pendingByPopulation(res.pendingEmpIds, popOf);
  setControl('OT_PENDING_' + period, JSON.stringify(summary.pendingByPopulation), 'pending OT events per population; written by OT sync');
  audit('OT_SYNC', period, '', summary);
  feeds_toast_('OT sync: ' + valid.length + ' valid, ' + exceptions.length + ' exception(s), ' + res.pendingCount + ' pending');
  return summary;
}

function feeds_syncForm_(period, tab, target, mapper, name, action) {
  guardPeriod_(period);
  var sheet = getSheet(tab);
  if (!sheet) throw new Error('Missing tab ' + tab);
  var block = feeds_readFormColumns_(sheet);
  var roster = buildRoster();
  var refs = feeds_existingValues_(target, 'SOURCE_REF');
  var res = mapper(block.header, block.rows, period, roster, refs, { firstRow: 2, enteredAt: nowIso_() });
  if (res.missingColumns.length) throw new Error(tab + ' is missing required column(s): ' + res.missingColumns.join(', '));
  var locked = feeds_lockedPops_(period), popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[o.EMP_ID];
    if (o.EMP_ID === FEEDS_ALL_WORKERS) pop = POP.PERMANENT_WORKER;
    if (pop && locked[pop]) { lockedSkipped++; return false; }
    return true;
  }
  var toWrite = res.valid.concat(res.exceptions).filter(open);
  if (toWrite.length) appendObjects(target, toWrite, { textHeaders: ['KEY', 'SOURCE_REF'] });
  var summary = { period: period, feed: name, written: toWrite.length - res.exceptions.filter(open).length,
    exceptions: res.exceptions.filter(open).length, skippedExisting: res.skippedExisting, lockedSkipped: lockedSkipped };
  audit(action, period, '', summary);
  feeds_toast_(name + ' sync: ' + summary.written + ' written, ' + summary.exceptions + ' exception(s)');
  return summary;
}

function syncCanteenFromForm(period) {
  return feeds_syncForm_(period, FEEDS_CANTEEN_TAB, TABS.INPUT_CANTEEN, mapCanteenRows, 'CANTEEN', 'CANTEEN_SYNC');
}

function syncEfficiencyFromForm(period) {
  return feeds_syncForm_(period, FEEDS_EFFICIENCY_TAB, TABS.INPUT_EFFICIENCY, mapEfficiencyRows, 'EFFICIENCY', 'EFFICIENCY_SYNC');
}

function feeds_onSubmit_(e, syncFn, label) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var period = '';
    if (e && e.response && e.response.getItemResponses) {
      period = feeds_periodFromAnswers(e.response.getItemResponses().map(function (ir) {
        return { title: ir.getItem().getTitle(), response: ir.getResponse() };
      }));
    }
    if (!period && e && e.namedValues) {
      var k = Object.keys(e.namedValues).filter(function (n) { return /payroll\s*month/i.test(n); })[0];
      if (k) period = feeds_parsePeriodLoose_(e.namedValues[k][0]);
    }
    if (!period) { audit(label + '_SUBMIT_SKIPPED', '', '', 'Payroll Month not found in response'); return null; }
    return syncFn(period);
  } catch (err) {
    try { audit(label + '_SUBMIT_ERROR', '', '', String(err && err.message ? err.message : err)); } catch (e2) { /* ignore */ }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function onCanteenFormSubmit(e) { return feeds_onSubmit_(e, syncCanteenFromForm, 'CANTEEN'); }
function onEfficiencyFormSubmit(e) { return feeds_onSubmit_(e, syncEfficiencyFromForm, 'EFFICIENCY'); }

/** Idempotently install canteen/efficiency onFormSubmit triggers when their form IDs are in PAYROLL_CONTROL. */
function installFeedTriggers() {
  var wanted = [];
  var cid = String(getControl('CANTEEN_FORM_ID', '')).trim();
  var eid = String(getControl('EFFICIENCY_FORM_ID', '')).trim();
  if (cid) wanted.push({ handler: 'onCanteenFormSubmit', formId: cid });
  if (eid) wanted.push({ handler: 'onEfficiencyFormSubmit', formId: eid });
  if (!wanted.length) {
    return 'Set CANTEEN_FORM_ID and/or EFFICIENCY_FORM_ID in PAYROLL_CONTROL, then run this again.';
  }
  var existing = ScriptApp.getProjectTriggers().map(function (t) {
    return { handler: t.getHandlerFunction(), sourceId: t.getTriggerSourceId ? t.getTriggerSourceId() : '' };
  });
  var plan = feeds_planTriggers(existing, wanted, FEEDS_MAX_TRIGGERS);
  plan.toCreate.forEach(function (w) {
    ScriptApp.newTrigger(w.handler).forForm(FormApp.openById(w.formId)).onFormSubmit().create();
  });
  var res = { created: plan.toCreate.length, alreadyPresent: plan.present, totalTriggers: existing.length + plan.toCreate.length,
    missingFormIds: (cid ? [] : ['CANTEEN_FORM_ID']).concat(eid ? [] : ['EFFICIENCY_FORM_ID']) };
  audit('FEED_TRIGGERS_INSTALL', '', '', res);
  return res;
}

// ===== 30_Calc.gs =====
/**
 * 30_Calc.gs - pure payroll calculation (DESIGN.md section 5 and 6).
 * No SpreadsheetApp / Utilities usage. Global scope, Apps Script V8 style.
 * Internal helpers are prefixed calc_ to avoid collisions with other files.
 */

var CALC_VERSION = 'CALC-1.0';

var OUTPUT_COLUMNS = [
  'RUN_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'EMPLOYEE_NAME', 'DEPARTMENT', 'DESIGNATION',
  'WORKING_DAYS', 'PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WO_DAYS', 'PH_DAYS', 'EL', 'CL', 'SL',
  'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS', 'WORKED_PAYABLE_DAYS', 'FIXED_GROSS', 'PAY_BASIS', 'RATE',
  'BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'MEDICAL', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'WASHING',
  'HEAT', 'VDA', 'PRODUCTION_ALLOWANCE', 'GROSS_EARNINGS', 'OT_HOURS', 'OT_AMOUNT', 'ARREARS',
  'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT', 'PRODUCTION_INCENTIVE', 'OT_EXTRA_WORK',
  'TOTAL_EARNINGS', 'PF_EMPLOYEE', 'ESI_EMPLOYEE', 'PT', 'MLWF', 'CANTEEN', 'SOCIETY', 'ADVANCE', 'TDS',
  'EFFICIENCY_PCT', 'EFFICIENCY_ELIGIBLE_AMOUNT', 'EFFICIENCY_DEDUCTION', 'OTHER_DEDUCTION',
  'TOTAL_DEDUCTIONS', 'NET_PAY', 'EMPLOYER_PF', 'EMPLOYER_ESI', 'BONUS_PROVISION', 'GRATUITY_PROVISION',
  'FLAGS', 'CALC_VERSION', 'CALCULATED_AT'
];

var CALC_EARNING_TYPES = ['ARREARS', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT', 'OT_EXTRA_WORK', 'PRODUCTION_INCENTIVE'];
var CALC_DEDUCTION_TYPES = ['TDS', 'OTHER_DEDUCTION', 'PENALTY', 'CANTEEN_EXTRA'];

var CALC_STAFF_COMPONENTS = ['BASIC', 'HRA', 'CONVEYANCE', 'MEDICAL', 'EDUCATION', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'WASHING'];

var CALC_COMMON_STATUTORY = ['PF_WAGE_CEILING', 'PF_EMPLOYEE_RATE', 'PF_MAX_EMPLOYEE', 'ESI_EMPLOYEE_RATE',
  'ESI_EXEMPT_ABOVE', 'ESI_EMPLOYER_RATE', 'PT_SLABS', 'PT_FEB_AMOUNT', 'MLWF_MONTHS', 'MLWF_EMPLOYEE_RATE'];

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

function calc_isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** blank -> 0 ; numeric (number or numeric string) -> number ; anything else -> NaN */
function calc_num(v) {
  if (calc_isBlank(v)) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    var s = v.replace(/,/g, '').trim();
    if (s === '' || isNaN(Number(s))) return NaN;
    return Number(s);
  }
  return NaN;
}

function calc_monthNames_() {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
}

/** 'Feb' | 'February' | 'YYYY-MM' | 2 -> month number 1..12 (0 if unknown) */
function calc_monthNum(m) {
  if (typeof m === 'number') return (m >= 1 && m <= 12) ? m : 0;
  var s = String(m === null || m === undefined ? '' : m).trim();
  var mm = /^\d{4}-(\d{1,2})/.exec(s);
  if (mm) return Number(mm[1]);
  var idx = calc_monthNames_().indexOf(s.substring(0, 3).toLowerCase());
  return idx >= 0 ? idx + 1 : 0;
}

function calc_monthNameFromPeriod(period) {
  var n = calc_monthNum(period);
  if (!n) return '';
  var nm = calc_monthNames_()[n - 1];
  return nm.charAt(0).toUpperCase() + nm.substring(1);
}

/** Date | 'YYYY-MM' | 'YYYY-MM-DD' -> 'YYYY-MM' ('' if blank/unparseable) */
function calc_periodKey(v) {
  if (calc_isBlank(v)) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var mo = v.getMonth() + 1;
    return v.getFullYear() + '-' + (mo < 10 ? '0' + mo : '' + mo);
  }
  var m = /^(\d{4})-(\d{1,2})/.exec(String(v).trim());
  if (!m) return '';
  return m[1] + '-' + (Number(m[2]) < 10 ? '0' + Number(m[2]) : m[2]);
}

function calc_ex_(list, severity, code, message) {
  list.push({ severity: severity, code: code, message: message });
}

function calc_hasBlocker_(list) {
  for (var i = 0; i < list.length; i++) if (list[i].severity === 'BLOCKER') return true;
  return false;
}

function calc_setHas_(set, id) {
  if (!set) return false;
  if (typeof set.has === 'function') return set.has(id);
  if (Array.isArray(set)) return set.indexOf(id) >= 0;
  if (typeof set === 'object') return set[id] === true || set[id] === 1;
  return false;
}

/** Google Sheets ROUND semantics (half away from zero) with float-noise guard. */
function roundSheets(x, digits) {
  if (typeof x !== 'number' || !isFinite(x)) return x;
  var d = digits || 0;
  var p = Math.pow(10, d);
  var a = Math.abs(x) * p;
  var r = Math.floor(a + 0.5 + 1e-9) / p;
  if (r === 0) return 0;
  return x < 0 ? -r : r;
}

function calc_r2_(x) { return roundSheets(x, 2); }

/* ------------------------------------------------------------------ */
/* Statutory configuration                                             */
/* ------------------------------------------------------------------ */

function requiredStatutoryKeys(population) {
  var common = CALC_COMMON_STATUTORY.slice();
  if (population === 'STAFF') {
    return common.concat(['STAFF_OT_MULTIPLIER', 'STAFF_PF_WAGE_COMPONENTS', 'STAFF_COMPONENT_PCTS',
      'EMPLOYER_PF_RATE_STAFF', 'BONUS_RATE_STAFF', 'GRATUITY_RATE_STAFF']);
  }
  if (population === 'PERMANENT_WORKER') {
    return common.concat(['WORKER_VDA_RATE', 'WORKER_HEAT_RATE', 'WORKER_OT_MULTIPLIER',
      'EMPLOYER_PF_RATE_WORKER', 'BONUS_RATE_WORKER', 'GRATUITY_RATE_WORKER']);
  }
  return [];
}

function calc_parseStatutoryValue_(key, raw) {
  if (key === 'PT_SLABS' || key === 'STAFF_COMPONENT_PCTS') {
    if (typeof raw === 'object' && raw !== null) return raw;
    return JSON.parse(String(raw));
  }
  if (key === 'MLWF_MONTHS') {
    if (typeof raw === 'number') return [raw];
    return String(raw).split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ''; }).map(Number);
  }
  if (key === 'STAFF_PF_WAGE_COMPONENTS') {
    return String(raw).split(',').map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return s !== ''; });
  }
  if (typeof raw === 'number') return raw;
  var s2 = String(raw).trim();
  if (s2 !== '' && !isNaN(Number(s2))) return Number(s2);
  return s2;
}

/**
 * configRows: [{KEY, VALUE, EFFECTIVE_FROM, EFFECTIVE_TO, VERSION}]
 * Returns {values, missing, invalid}. `missing` is computed for `population`
 * when given, else for the union of STAFF and PERMANENT_WORKER keys.
 */
function resolveStatutory(configRows, period, population) {
  var p = calc_periodKey(period);
  var best = {};
  (configRows || []).forEach(function (r) {
    if (!r || calc_isBlank(r.KEY) || calc_isBlank(r.VALUE)) return;
    var from = calc_periodKey(r.EFFECTIVE_FROM);
    var to = calc_periodKey(r.EFFECTIVE_TO);
    if (from && p < from) return;
    if (to && p > to) return;
    var ver = calc_isBlank(r.VERSION) ? 0 : Number(r.VERSION);
    if (isNaN(ver)) ver = 0;
    var key = String(r.KEY).trim();
    if (!best[key] || ver > best[key].ver) best[key] = { ver: ver, raw: r.VALUE };
  });
  var values = {};
  var invalid = [];
  Object.keys(best).forEach(function (k) {
    try {
      values[k] = calc_parseStatutoryValue_(k, best[k].raw);
    } catch (e) {
      invalid.push(k);
    }
  });
  var req = population ? requiredStatutoryKeys(population)
    : requiredStatutoryKeys('STAFF').concat(requiredStatutoryKeys('PERMANENT_WORKER'));
  var seen = {};
  var missing = [];
  req.forEach(function (k) {
    if (seen[k]) return;
    seen[k] = true;
    if (values[k] === undefined) missing.push(k);
  });
  return { values: values, missing: missing, invalid: invalid };
}

/* ------------------------------------------------------------------ */
/* PT, efficiency                                                      */
/* ------------------------------------------------------------------ */

/** PT per DESIGN 5.1: 0 if gross 0 or exempt; Feb flat; else slab on the given gross. */
function ptAmount(grossForPt, monthName, empId, cfg, ptExemptSet) {
  var g = Number(grossForPt);
  if (!isFinite(g) || g <= 0) return 0;
  if (calc_setHas_(ptExemptSet, empId)) return 0;
  if (calc_monthNum(monthName) === 2) return Number(cfg.PT_FEB_AMOUNT);
  var slabs = (cfg.PT_SLABS || []).slice().sort(function (a, b) { return a.min - b.min; });
  for (var i = 0; i < slabs.length; i++) {
    if (slabs[i].max === null || slabs[i].max === undefined || g <= slabs[i].max) return Number(slabs[i].pt);
  }
  return slabs.length ? Number(slabs[slabs.length - 1].pt) : 0;
}

/** Slab amount for floor(pct): highest configured percent <= floor(pct); none -> 0 (<81), >=85 -> 85 slab. */
function efficiencySlab(pct, efficiencyConfigRows) {
  var p = Number(pct);
  if (calc_isBlank(pct) || !isFinite(p)) return null;
  var f = Math.floor(p + 1e-9);
  var rows = (efficiencyConfigRows || []).map(function (r) {
    return { pct: Number(r.EFFICIENCY_PERCENT_EXACT), amt: Number(r.INCENTIVE_SLAB_INR) };
  }).filter(function (r) { return isFinite(r.pct) && isFinite(r.amt); })
    .sort(function (a, b) { return a.pct - b.pct; });
  var amount = 0;
  for (var i = 0; i < rows.length; i++) if (rows[i].pct <= f) amount = rows[i].amt;
  return amount;
}

/* ------------------------------------------------------------------ */
/* Adjustments aggregation                                             */
/* ------------------------------------------------------------------ */

/**
 * rows: INPUT_ADJUSTMENTS rows {PAYROLL_MONTH, EMP_ID, ADJUSTMENT_TYPE, SIGNED_AMOUNT_INR, APPROVAL_STATUS}.
 * Returns {ARREARS..CANTEEN_EXTRA (numbers), exceptions: [...]}.
 */
function aggregateAdjustments(rows, period, empId) {
  var out = {};
  CALC_EARNING_TYPES.concat(CALC_DEDUCTION_TYPES).forEach(function (t) { out[t] = 0; });
  var exceptions = [];
  var p = calc_periodKey(period);
  (rows || []).forEach(function (r) {
    if (!r || String(r.EMP_ID).trim() !== String(empId).trim()) return;
    if (calc_periodKey(r.PAYROLL_MONTH) !== p) return;
    if (String(r.APPROVAL_STATUS || '').trim().toUpperCase() !== 'APPROVED') return;
    var type = String(r.ADJUSTMENT_TYPE || '').trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(out, type)) {
      calc_ex_(exceptions, 'WARN', 'UNKNOWN_ADJUSTMENT_TYPE',
        'Approved adjustment with unknown type "' + r.ADJUSTMENT_TYPE + '" ignored for ' + empId);
      return;
    }
    var amt = calc_num(r.SIGNED_AMOUNT_INR);
    if (isNaN(amt) || calc_isBlank(r.SIGNED_AMOUNT_INR)) {
      calc_ex_(exceptions, 'BLOCKER', 'INVALID_ADJUSTMENT_AMOUNT',
        'Approved adjustment ' + type + ' for ' + empId + ' has a non-numeric amount');
      return;
    }
    out[type] += amt;
  });
  out.exceptions = exceptions;
  return out;
}

/* ------------------------------------------------------------------ */
/* Words / hash                                                        */
/* ------------------------------------------------------------------ */

var CALC_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
var CALC_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function calc_below100_(n) {
  if (n < 20) return CALC_ONES[n];
  return CALC_TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + CALC_ONES[n % 10] : '');
}

function calc_wordsIndian_(n) {
  var parts = [];
  var crore = Math.floor(n / 10000000); n = n % 10000000;
  var lakh = Math.floor(n / 100000); n = n % 100000;
  var thousand = Math.floor(n / 1000); n = n % 1000;
  var hundred = Math.floor(n / 100); n = n % 100;
  if (crore) parts.push(calc_wordsIndian_(crore) + ' Crore');
  if (lakh) parts.push(calc_below100_(lakh) + ' Lakh');
  if (thousand) parts.push(calc_below100_(thousand) + ' Thousand');
  if (hundred) parts.push(CALC_ONES[hundred] + ' Hundred');
  if (n) parts.push(calc_below100_(n));
  return parts.join(' ');
}

function amountToIndianWords(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  var neg = n < 0;
  var v = roundSheets(Math.abs(n));
  if (v === 0) return 'Zero Rupees Only';
  return (neg ? 'Minus ' : '') + calc_wordsIndian_(v) + ' Rupees Only';
}

/** Canonical string of rows sorted by EMP_ID, excluding RUN_ID and CALCULATED_AT; hashed via injected sha256Fn. */
function hashRows(rows, columns, sha256Fn) {
  var cols = (columns || OUTPUT_COLUMNS).filter(function (c) { return c !== 'RUN_ID' && c !== 'CALCULATED_AT'; });
  var sorted = (rows || []).slice().sort(function (a, b) {
    var x = String(a.EMP_ID), y = String(b.EMP_ID);
    if (x < y) return -1;
    if (x > y) return 1;
    var px = String(a.POPULATION || ''), py = String(b.POPULATION || '');
    return px < py ? -1 : (px > py ? 1 : 0);
  });
  var lines = [cols.join('|')];
  sorted.forEach(function (r) {
    lines.push(cols.map(function (c) {
      var v = r[c];
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return String(roundSheets(v, 6));
      return String(v).replace(/[\r\n|]/g, ' ');
    }).join('|'));
  });
  return sha256Fn(lines.join('\n'));
}

/* ------------------------------------------------------------------ */
/* Shared calc plumbing                                                */
/* ------------------------------------------------------------------ */

function calc_newRow_(ctx, population) {
  var row = {};
  OUTPUT_COLUMNS.forEach(function (c) { row[c] = null; });
  var emp = ctx.emp || {};
  row.PERIOD = ctx.period;
  row.POPULATION = population;
  row.EMP_ID = emp.EMP_ID === undefined ? null : emp.EMP_ID;
  row.EMPLOYEE_NAME = emp.EMPLOYEE_NAME === undefined ? null : emp.EMPLOYEE_NAME;
  row.DEPARTMENT = emp.DEPARTMENT === undefined ? null : emp.DEPARTMENT;
  row.DESIGNATION = emp.DESIGNATION === undefined ? null : emp.DESIGNATION;
  row.CALC_VERSION = CALC_VERSION;
  return row;
}

/**
 * Reads and validates attendance/feeds/adjustments. Writes attendance columns onto row.
 * Returns plain numbers (0 for blank), pp = null if blank.
 */
function calc_readInputs_(ctx, population, row, ex) {
  var att = ctx.attendance || {};
  var adj = ctx.adjustments || {};
  var inp = {};

  function read(label, v, allowNegative) {
    var n = calc_num(v);
    if (isNaN(n)) {
      calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', label + ' is not a number');
      return 0;
    }
    if (n < 0 && !allowNegative) {
      calc_ex_(ex, 'BLOCKER', 'NEGATIVE_INPUT', label + ' is negative');
      return 0;
    }
    return n;
  }

  var wd = calc_num(ctx.workingDays);
  if (calc_isBlank(ctx.workingDays) || isNaN(wd) || wd <= 0) {
    calc_ex_(ex, 'BLOCKER', 'INVALID_WORKING_DAYS', 'WORKING_DAYS must be a positive number for ' + population);
    wd = 0;
  }
  inp.wd = wd;
  inp.present = read('PRESENT_DAYS', att.PRESENT_DAYS);
  inp.pp = calc_isBlank(att.PHYSICAL_PRESENT_DAYS) ? null : read('PHYSICAL_PRESENT_DAYS', att.PHYSICAL_PRESENT_DAYS);
  inp.wo = read('WEEK_OFF', att.WEEK_OFF);
  inp.ph = read('PH', att.PH);
  inp.el = read('EL_AVAILED', att.EL_AVAILED);
  inp.cl = read('CL_AVAILED', att.CL_AVAILED);
  inp.sl = read('SL_AVAILED', att.SL_AVAILED);
  inp.plo = read('PAID_LEAVE_OTHER', att.PAID_LEAVE_OTHER);
  inp.lwp = read('ABSENT_LWP_DAYS', att.ABSENT_LWP_DAYS);
  inp.ot = read('OT_HOURS', ctx.otHours);
  inp.canteen = read('CANTEEN', ctx.canteen);
  inp.society = read('SOCIETY', ctx.society);
  inp.advance = read('ADVANCE', ctx.advance);
  var types = CALC_EARNING_TYPES.concat(CALC_DEDUCTION_TYPES);
  types.forEach(function (t) { inp[t] = read('ADJUSTMENT ' + t, adj[t], true); });

  inp.w = inp.present + inp.ph + inp.el + inp.cl + inp.sl + inp.plo + (population === 'PERMANENT_WORKER' ? 0 : inp.wo);

  row.WORKING_DAYS = wd || null;
  row.PRESENT_DAYS = inp.present;
  row.PHYSICAL_PRESENT_DAYS = inp.pp;
  row.WO_DAYS = inp.wo;
  row.PH_DAYS = inp.ph;
  row.EL = inp.el;
  row.CL = inp.cl;
  row.SL = inp.sl;
  row.PAID_LEAVE_OTHER = inp.plo;
  row.ABSENT_LWP_DAYS = inp.lwp;
  row.WORKED_PAYABLE_DAYS = inp.w;

  if (wd > 0 && inp.w > wd) {
    if (population === 'PERMANENT_WORKER') {
      calc_ex_(ex, 'BLOCKER', 'WORKED_EXCEEDS_WORKING_DAYS', 'Worked days ' + inp.w + ' exceed working days ' + wd);
    } else {
      calc_ex_(ex, 'WARN', 'WORKED_EXCEEDS_WORKING_DAYS', 'Worked days ' + inp.w + ' exceed working days ' + wd);
    }
  }
  return inp;
}

function calc_checkCfg_(population, cfg, ex) {
  var missing = requiredStatutoryKeys(population).filter(function (k) {
    return !cfg || cfg[k] === undefined || cfg[k] === null;
  });
  if (missing.length) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_STATUTORY_KEY', 'Missing statutory keys: ' + missing.join(', '));
  }
}

function calc_writeAdjustments_(row, inp) {
  row.OT_HOURS = inp.ot;
  row.ARREARS = inp.ARREARS;
  row.DISPATCH_INCENTIVE = inp.DISPATCH_INCENTIVE;
  row.OTHER_ALLOWANCE = inp.OTHER_ALLOWANCE;
  row.LEAVE_ENCASHMENT = inp.LEAVE_ENCASHMENT;
  row.PRODUCTION_INCENTIVE = inp.PRODUCTION_INCENTIVE;
  row.OT_EXTRA_WORK = inp.OT_EXTRA_WORK;
  row.CANTEEN = inp.canteen;
  row.SOCIETY = inp.society;
  row.ADVANCE = inp.advance;
  row.TDS = inp.TDS;
  row.OTHER_DEDUCTION = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA;
}

function calc_finalize_(row, ex) {
  var bad = [];
  OUTPUT_COLUMNS.forEach(function (c) {
    if (typeof row[c] === 'number' && !isFinite(row[c])) { row[c] = null; bad.push(c); }
  });
  if (bad.length) calc_ex_(ex, 'BLOCKER', 'NON_FINITE_VALUE', 'Non-finite values in: ' + bad.join(', '));
  if (typeof row.NET_PAY === 'number' && row.NET_PAY < 0) {
    calc_ex_(ex, 'BLOCKER', 'NEGATIVE_NET_PAY', 'Net pay is negative (' + row.NET_PAY + ')');
  }
  var otherBlocker = ex.some(function (e) { return e.severity === 'BLOCKER' && e.code !== 'NEGATIVE_NET_PAY'; });
  if (otherBlocker) row.NET_PAY = null;
  var seen = {};
  var codes = [];
  ex.forEach(function (e) { if (!seen[e.code]) { seen[e.code] = true; codes.push(e.code); } });
  row.FLAGS = codes.join(';');
  return { row: row, exceptions: ex };
}

/* Shared PF / statutory pieces */
function calc_pf_(wage, cfg, rate) {
  return wage <= cfg.PF_WAGE_CEILING ? wage * rate : cfg.PF_MAX_EMPLOYEE;
}

function calc_mlwf_(period, cfg) {
  var m = calc_monthNum(period);
  return (cfg.MLWF_MONTHS || []).indexOf(m) >= 0 ? Number(cfg.MLWF_EMPLOYEE_RATE) : 0;
}

/* ------------------------------------------------------------------ */
/* STAFF                                                               */
/* ------------------------------------------------------------------ */

function calcStaff(ctx) {
  var ex = [];
  var row = calc_newRow_(ctx, 'STAFF');
  var cfg = ctx.cfg || {};
  var inp = calc_readInputs_(ctx, 'STAFF', row, ex);
  calc_checkCfg_('STAFF', cfg, ex);
  var s = ctx.salary;
  var fg = 0, basicPm = 0;
  if (!s) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_SALARY_STRUCTURE', 'No SALARY_STRUCTURE row');
  } else {
    fg = calc_num(s.FIXED_GROSS_PM_AS_SOURCE_INR);
    basicPm = calc_num(s.BASIC_PM_INR);
    if (isNaN(fg) || fg <= 0) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_SALARY_STRUCTURE', 'Fixed gross is zero or invalid');
      fg = 0;
    }
    if (isNaN(basicPm)) { calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', 'BASIC_PM_INR is not a number'); basicPm = 0; }
    if (inp.ot > 0 && basicPm <= 0) calc_ex_(ex, 'BLOCKER', 'MISSING_BASIC_FOR_OT', 'OT hours present but BASIC_PM_INR is zero');
  }
  var pcts = cfg.STAFF_COMPONENT_PCTS || {};
  if (cfg.STAFF_COMPONENT_PCTS) {
    CALC_STAFF_COMPONENTS.forEach(function (c) {
      if (typeof pcts[c] !== 'number' || !isFinite(pcts[c])) {
        calc_ex_(ex, 'BLOCKER', 'MISSING_COMPONENT_PCT', 'STAFF_COMPONENT_PCTS lacks ' + c);
      }
    });
  }
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var wd = inp.wd, w = inp.w;
  var gross = fg * w / wd;
  var earned = {};
  CALC_STAFF_COMPONENTS.forEach(function (c) { earned[c] = roundSheets(gross * pcts[c]); row[c] = earned[c]; });

  var pfWage = 0;
  (cfg.STAFF_PF_WAGE_COMPONENTS || []).forEach(function (c) {
    if (earned[c] === undefined) calc_ex_(ex, 'BLOCKER', 'UNKNOWN_PF_COMPONENT', 'Unknown PF wage component ' + c);
    else pfWage += earned[c];
  });
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var ot = (basicPm / wd / 8) * Number(cfg.STAFF_OT_MULTIPLIER) * inp.ot;
  var pf = calc_pf_(pfWage, cfg, Number(cfg.PF_EMPLOYEE_RATE));
  var esi = fg <= cfg.ESI_EXEMPT_ABOVE ? roundSheets(fg * cfg.ESI_EMPLOYEE_RATE / wd * w) : 0;
  var pt = ptAmount(gross, calc_monthNameFromPeriod(ctx.period), row.EMP_ID, cfg, ctx.ptExemptSet);
  var mlwf = calc_mlwf_(ctx.period, cfg);
  var otherDed = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA;
  var ded = pf + esi + pt + inp.canteen + inp.society + inp.advance + inp.TDS + mlwf + otherDed;
  var extras = inp.ARREARS + inp.DISPATCH_INCENTIVE + inp.OTHER_ALLOWANCE + inp.LEAVE_ENCASHMENT +
    inp.PRODUCTION_INCENTIVE + inp.OT_EXTRA_WORK;
  var totalEarn = gross + ot + extras;

  calc_writeAdjustments_(row, inp);
  row.FIXED_GROSS = fg;
  row.GROSS_EARNINGS = calc_r2_(gross);
  row.OT_AMOUNT = calc_r2_(ot);
  row.TOTAL_EARNINGS = calc_r2_(totalEarn);
  row.PF_EMPLOYEE = calc_r2_(pf);
  row.ESI_EMPLOYEE = esi;
  row.PT = pt;
  row.MLWF = mlwf;
  row.TOTAL_DEDUCTIONS = calc_r2_(ded);
  row.NET_PAY = roundSheets(gross - ded + ot + extras);
  row.EMPLOYER_PF = roundSheets(calc_pf_(pfWage, cfg, Number(cfg.EMPLOYER_PF_RATE_STAFF)));
  row.EMPLOYER_ESI = fg <= cfg.ESI_EXEMPT_ABOVE ? roundSheets(fg * cfg.ESI_EMPLOYER_RATE / wd * w) : 0;
  row.BONUS_PROVISION = roundSheets(earned.BASIC * cfg.BONUS_RATE_STAFF);
  row.GRATUITY_PROVISION = roundSheets(earned.BASIC * cfg.GRATUITY_RATE_STAFF);
  return calc_finalize_(row, ex);
}

/* ------------------------------------------------------------------ */
/* PERMANENT_WORKER                                                    */
/* ------------------------------------------------------------------ */

function calcWorker(ctx) {
  var ex = [];
  var row = calc_newRow_(ctx, 'PERMANENT_WORKER');
  var cfg = ctx.cfg || {};
  var inp = calc_readInputs_(ctx, 'PERMANENT_WORKER', row, ex);
  calc_checkCfg_('PERMANENT_WORKER', cfg, ex);
  var s = ctx.salary;
  var m = {};
  var fg = 0;
  if (!s) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_SALARY_STRUCTURE', 'No SALARY_STRUCTURE row');
  } else {
    var keys = { BASIC: 'BASIC_PM_INR', HRA: 'HRA_PM_INR', CONVEYANCE: 'CONVEYANCE_PM_INR', WASHING: 'WASHING_PM_INR',
      EDUCATION: 'EDUCATION_PM_INR', HEAT: 'HEAT_MASTER_INR', VDA: 'VDA_MASTER_INR', PRODUCTION: 'PRODUCTION_MASTER_INR' };
    Object.keys(keys).forEach(function (k) {
      var n = calc_num(s[keys[k]]);
      if (isNaN(n) || n < 0) { calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', keys[k] + ' is invalid'); n = 0; }
      m[k] = n;
    });
    fg = calc_num(s.FIXED_GROSS_PM_AS_SOURCE_INR);
    if (isNaN(fg) || fg < 0) { calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', 'FIXED_GROSS_PM_AS_SOURCE_INR is invalid'); fg = 0; }
    if (!ex.length && m.BASIC + m.HRA + m.CONVEYANCE + m.WASHING + m.EDUCATION <= 0) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_SALARY_STRUCTURE', 'All worker master components are zero');
    }
  }
  if (inp.pp === null) calc_ex_(ex, 'BLOCKER', 'MISSING_PHYSICAL_PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS is required for VDA');

  var pct = ctx.efficiencyPct;
  var pctNum = calc_isBlank(pct) ? NaN : calc_num(pct);
  if (calc_isBlank(pct)) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_EFFICIENCY_PCT', 'Efficiency % is missing');
  } else if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
    calc_ex_(ex, 'BLOCKER', 'INVALID_EFFICIENCY_PCT', 'Efficiency % must be between 0 and 100');
  }
  if (!ctx.efficiencyConfig || !ctx.efficiencyConfig.length) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_EFFICIENCY_CONFIG', 'EFFICIENCY_CONFIG is empty');
  }
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var wd = inp.wd, w = inp.w, pp = inp.pp;
  var basic = roundSheets(m.BASIC / wd * w);
  var hra = roundSheets(m.HRA / wd * w);
  var conv = roundSheets(m.CONVEYANCE / wd * w);
  var wash = roundSheets(m.WASHING / wd * w);
  var edu = roundSheets(m.EDUCATION / wd * w);
  var heat = m.HEAT === 150 ? roundSheets(w * cfg.WORKER_HEAT_RATE) : 0;
  var vda = roundSheets(cfg.WORKER_VDA_RATE * pp);
  var prod = m.PRODUCTION;
  var ap = basic + hra + conv + wash + edu;
  var ot = ((m.BASIC + m.VDA) / wd / 8) * Number(cfg.WORKER_OT_MULTIPLIER) * inp.ot;
  var extras = inp.DISPATCH_INCENTIVE + inp.OTHER_ALLOWANCE + inp.LEAVE_ENCASHMENT + inp.ARREARS +
    inp.PRODUCTION_INCENTIVE + inp.OT_EXTRA_WORK;
  var totalEarn = roundSheets(ap + heat + vda + prod + ot + extras);

  var eligible = efficiencySlab(pctNum, ctx.efficiencyConfig);
  var effDed = prod - eligible;
  if (effDed < 0) {
    calc_ex_(ex, 'WARN', 'EFFICIENCY_ELIGIBLE_EXCEEDS_PRODUCTION', 'Eligible efficiency amount exceeds production allowance; deduction clamped to 0');
    effDed = 0;
  }
  calc_ex_(ex, 'WARN', 'EFFICIENCY_RULE_UNCONFIRMED', 'Efficiency deduction rule is unconfirmed');

  var pfWage = basic + vda;
  var pf = roundSheets(calc_pf_(pfWage, cfg, Number(cfg.PF_EMPLOYEE_RATE)));
  var esiApplies = fg <= cfg.ESI_EXEMPT_ABOVE;
  var esi = esiApplies ? roundSheets(fg * cfg.ESI_EMPLOYEE_RATE / wd * w) : 0;
  if (esi > 0) calc_ex_(ex, 'WARN', 'WORKER_ESI_BASIS_UNCONFIRMED', 'Worker ESI basis (fixed gross) is unconfirmed');
  var pt = ptAmount(totalEarn, calc_monthNameFromPeriod(ctx.period), row.EMP_ID, cfg, ctx.ptExemptSet);
  var mlwf = calc_mlwf_(ctx.period, cfg);
  var otherDed = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA;
  var ded = pf + esi + pt + inp.canteen + inp.society + inp.advance + effDed + mlwf + inp.TDS + otherDed;

  calc_writeAdjustments_(row, inp);
  row.FIXED_GROSS = fg;
  row.BASIC = basic; row.HRA = hra; row.CONVEYANCE = conv; row.WASHING = wash; row.EDUCATION = edu;
  row.MEDICAL = 0; row.PRO_DEV = 0; row.COMMUNICATION = 0; row.UNIFORM = 0;
  row.HEAT = heat; row.VDA = vda; row.PRODUCTION_ALLOWANCE = prod;
  row.GROSS_EARNINGS = ap;
  row.OT_AMOUNT = calc_r2_(ot);
  row.TOTAL_EARNINGS = totalEarn;
  row.PF_EMPLOYEE = pf;
  row.ESI_EMPLOYEE = esi;
  row.PT = pt;
  row.MLWF = mlwf;
  row.EFFICIENCY_PCT = pctNum;
  row.EFFICIENCY_ELIGIBLE_AMOUNT = eligible;
  row.EFFICIENCY_DEDUCTION = effDed;
  row.TOTAL_DEDUCTIONS = calc_r2_(ded);
  row.NET_PAY = roundSheets(totalEarn - ded);
  row.EMPLOYER_PF = roundSheets(calc_pf_(pfWage, cfg, Number(cfg.EMPLOYER_PF_RATE_WORKER)));
  row.EMPLOYER_ESI = esiApplies ? roundSheets(fg * cfg.ESI_EMPLOYER_RATE / wd * w) : 0;
  row.BONUS_PROVISION = roundSheets(pfWage * cfg.BONUS_RATE_WORKER);
  row.GRATUITY_PROVISION = roundSheets(pfWage * cfg.GRATUITY_RATE_WORKER);
  return calc_finalize_(row, ex);
}

/* ------------------------------------------------------------------ */
/* CONSULTANT / PUNE_STAFF                                             */
/* ------------------------------------------------------------------ */

function calc_simple_(ctx, population) {
  var ex = [];
  var row = calc_newRow_(ctx, population);
  var inp = calc_readInputs_(ctx, population, row, ex);
  var r = ctx.rate;
  var basis = null, rate = 0, mg = 0;
  if (!r) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_RATE_PROFILE', 'No PAYROLL_RATE_PROFILE row');
  } else {
    basis = String(r.PAY_BASIS || '').trim().toUpperCase();
    rate = calc_num(r.RATE_AMOUNT_INR);
    mg = calc_num(r.MONTHLY_GROSS_INR);
    if (population === 'PUNE_STAFF') {
      if (basis !== 'MONTHLY_GROSS_PRORATED') {
        calc_ex_(ex, 'BLOCKER', 'INVALID_PAY_BASIS', 'PUNE_STAFF requires MONTHLY_GROSS_PRORATED, got "' + basis + '"');
      }
    } else if (basis !== 'DAILY_RATE' && basis !== 'MONTHLY_GROSS_PRORATED') {
      calc_ex_(ex, 'BLOCKER', 'INVALID_PAY_BASIS', 'Unknown PAY_BASIS "' + basis + '"');
    }
    if (basis === 'DAILY_RATE' && (isNaN(rate) || rate <= 0)) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_RATE', 'RATE_AMOUNT_INR is zero or invalid');
    }
    if (basis === 'MONTHLY_GROSS_PRORATED' && (isNaN(mg) || mg <= 0)) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_RATE', 'MONTHLY_GROSS_INR is zero or invalid');
    }
    if (basis === 'MONTHLY_GROSS_PRORATED' && population === 'CONSULTANT' && inp.ot > 0) {
      calc_ex_(ex, 'BLOCKER', 'BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM', 'Monthly-gross consultant has OT hours');
    }
  }
  if (inp.DISPATCH_INCENTIVE !== 0 || inp.LEAVE_ENCASHMENT !== 0) {
    calc_ex_(ex, 'BLOCKER', 'ADJUSTMENT_NOT_APPLICABLE',
      'DISPATCH_INCENTIVE / LEAVE_ENCASHMENT are not payable for ' + population);
  }
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var wd = inp.wd, w = inp.w;
  var gross, ot;
  if (basis === 'DAILY_RATE') {
    gross = rate * w;
    ot = rate / 8 * inp.ot;
    row.RATE = rate;
  } else {
    gross = mg * w / wd;
    ot = population === 'PUNE_STAFF' ? mg / wd / 8 * inp.ot : 0;
    row.FIXED_GROSS = mg;
  }
  var otherDed = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA + inp.TDS;
  var ded = inp.canteen + inp.society + inp.advance + otherDed;
  var extras = inp.OTHER_ALLOWANCE + inp.PRODUCTION_INCENTIVE + inp.OT_EXTRA_WORK + inp.ARREARS;

  calc_writeAdjustments_(row, inp);
  row.PAY_BASIS = basis;
  row.GROSS_EARNINGS = calc_r2_(gross);
  row.OT_AMOUNT = calc_r2_(ot);
  row.TOTAL_EARNINGS = calc_r2_(gross + ot + extras);
  row.PF_EMPLOYEE = 0; row.ESI_EMPLOYEE = 0; row.PT = 0; row.MLWF = 0;
  row.TOTAL_DEDUCTIONS = calc_r2_(ded);
  row.NET_PAY = roundSheets(gross - ded + ot + extras);
  row.EMPLOYER_PF = 0; row.EMPLOYER_ESI = 0; row.BONUS_PROVISION = 0; row.GRATUITY_PROVISION = 0;
  return calc_finalize_(row, ex);
}

function calcConsultant(ctx) { return calc_simple_(ctx, 'CONSULTANT'); }
function calcPune(ctx) { return calc_simple_(ctx, 'PUNE_STAFF'); }

function calcEmployee(ctx) {
  switch (ctx && ctx.population) {
    case 'STAFF': return calcStaff(ctx);
    case 'PERMANENT_WORKER': return calcWorker(ctx);
    case 'CONSULTANT': return calcConsultant(ctx);
    case 'PUNE_STAFF': return calcPune(ctx);
    default:
      var ex = [];
      var row = calc_newRow_(ctx || {}, ctx && ctx.population ? ctx.population : null);
      calc_ex_(ex, 'BLOCKER', 'UNKNOWN_POPULATION', 'Unknown population "' + (ctx && ctx.population) + '"');
      return calc_finalize_(row, ex);
  }
}

// ===== 31_Readiness.gs =====
/**
 * 31_Readiness.gs - payroll readiness (DESIGN section 3). buildReadiness is pure; checkReadiness gathers inputs
 * from the sheets (via engine_readSources_ in 32_Engine.gs), runs the checks and rewrites PAYROLL_READINESS
 * rows for the period (other periods are never touched). Only STATUS = BLOCKED blocks approval.
 * Helpers are prefixed rdy_.
 */
var RDY_MAX_IDS = 20;
var RDY_REQUIRED_FEEDS = ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS'];
var RDY_ATT_FIELDS = ['PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS'];
var RDY_CHECK_NAMES = ['PERIOD_WORKING_DAYS', 'ATTENDANCE_COVERAGE', 'ATTENDANCE_APPROVED_VALID',
  'DAILY_ATTENDANCE_COMPLETE', 'SALARY_PRESENT_NONZERO', 'FEEDS_COMPLETE', 'OT_EXCEPTIONS', 'STATUTORY_CONFIG',
  'DUPLICATE_MASTER_IDS', 'CONSULTANT_MONTHLY_OT', 'EFFICIENCY_CONFIG_CONFIRMED', 'NEGATIVE_NET_PAY'];

// ---------------------------------------------------------------- pure helpers

function rdy_id_(v) { return String(v == null ? '' : v).trim(); }

/** blank -> 0; numeric -> number; anything else -> NaN. */
function rdy_num_(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v).replace(/,/g, '').trim();
  if (s === '' || isNaN(Number(s))) return NaN;
  return Number(s);
}

function rdy_uniq_(arr) {
  var seen = {}, out = [];
  arr.forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } });
  return out;
}

/** Up to 20 items then ", +N more". */
function rdy_list_(items) {
  var a = items || [];
  var head = a.slice(0, RDY_MAX_IDS).join(', ');
  return a.length > RDY_MAX_IDS ? head + ', +' + (a.length - RDY_MAX_IDS) + ' more' : head;
}

function rdy_res_(blockers, warns, okDetail) {
  var parts = [];
  if (blockers.length) parts.push(blockers.join('; '));
  if (warns.length) parts.push(warns.join('; '));
  if (blockers.length) return { status: 'BLOCKED', detail: parts.join(' | ') };
  if (warns.length) return { status: 'WARN', detail: parts.join(' | ') };
  return { status: 'READY', detail: okDetail || 'OK' };
}

function rdy_set_(list) {
  var s = {};
  if (Array.isArray(list)) list.forEach(function (x) { s[rdy_id_(x)] = true; });
  else if (list && typeof list === 'object') Object.keys(list).forEach(function (k) { if (list[k]) s[k] = true; });
  return s;
}

function rdy_worked_(row, population) {
  var n = function (k) { return rdy_num_(row[k]); };
  var w = n('PRESENT_DAYS') + n('EL_AVAILED') + n('CL_AVAILED') + n('SL_AVAILED') + n('PH') + n('PAID_LEAVE_OTHER');
  if (population !== 'PERMANENT_WORKER') w += n('WEEK_OFF');
  return w;
}

/** Attendance rows relevant to this population (its category, or unknown category and not active elsewhere). */
function rdy_popAttendance_(inputs, rosterSet) {
  var pop = inputs.population;
  var all = inputs.allActiveIds ? rdy_set_(inputs.allActiveIds) : null;
  return (inputs.attendanceRows || []).filter(function (r) {
    var id = rdy_id_(r.EMP_ID);
    var cat = rdy_id_(r.PAYROLL_CATEGORY);
    if (cat === pop) return true;
    if (rosterSet[id]) return true;
    if (cat === '' || POPULATION_LIST.indexOf(cat) < 0) return !(all && all[id]);
    return false;
  });
}

// ---------------------------------------------------------------- the 12 checks

function rdy_check1_(inputs) {
  var row = inputs.periodCategoryRow;
  if (!row) return { status: 'BLOCKED', detail: 'No PAYROLL_PERIOD_CATEGORY row for ' + inputs.period + ' x ' + inputs.population };
  var wd = rdy_num_(row.WORKING_DAYS);
  var dim = daysInMonth(inputs.period);
  if (row.WORKING_DAYS === '' || row.WORKING_DAYS == null || isNaN(wd) || wd <= 0) {
    return { status: 'BLOCKED', detail: 'WORKING_DAYS must be a positive number (got "' + (row.WORKING_DAYS == null ? '' : row.WORKING_DAYS) + '")' };
  }
  if (wd > dim) return { status: 'BLOCKED', detail: 'WORKING_DAYS ' + wd + ' exceeds days in month ' + dim };
  return { status: 'READY', detail: 'WORKING_DAYS=' + wd };
}

function rdy_check2_(inputs, ctx) {
  var counts = {};
  ctx.attRows.forEach(function (r) { var id = rdy_id_(r.EMP_ID); counts[id] = (counts[id] || 0) + 1; });
  var missing = ctx.rosterIds.filter(function (id) { return !counts[id]; });
  var dups = Object.keys(counts).filter(function (id) { return counts[id] > 1; });
  var unknown = Object.keys(counts).filter(function (id) { return !ctx.rosterSet[id]; });
  var b = [];
  if (missing.length) b.push('no attendance row: ' + rdy_list_(missing));
  if (dups.length) b.push('duplicate attendance rows: ' + rdy_list_(dups));
  if (unknown.length) b.push('unknown/inactive EMP_ID in attendance: ' + rdy_list_(unknown));
  return rdy_res_(b, [], ctx.rosterIds.length + ' employees covered');
}

function rdy_check3_(inputs, ctx) {
  var pop = inputs.population, dim = daysInMonth(inputs.period);
  var wd = inputs.periodCategoryRow ? rdy_num_(inputs.periodCategoryRow.WORKING_DAYS) : NaN;
  var notApproved = [], badNum = [], overDim = [], overWd = [], noReason = [];
  ctx.attRows.forEach(function (r) {
    var id = rdy_id_(r.EMP_ID);
    if (rdy_id_(r.APPROVAL_STATUS).toUpperCase() !== 'APPROVED') notApproved.push(id);
    var bad = false;
    RDY_ATT_FIELDS.forEach(function (k) {
      if (k === 'PRESENT_DAYS' && (r[k] === '' || r[k] == null)) { bad = true; return; }
      var n = rdy_num_(r[k]);
      if (isNaN(n) || n < 0) bad = true;
    });
    if (bad) { badNum.push(id); return; }
    var w = rdy_worked_(r, pop);
    if (w > dim) overDim.push(id + '(' + w + ')');
    else if (isFinite(wd) && wd > 0 && w > wd) overWd.push(id + '(' + w + ')');
    if (rdy_id_(r.HR_OVERRIDE).toUpperCase() === 'Y' && rdy_id_(r.OVERRIDE_REASON) === '') noReason.push(id);
  });
  var b = [], w = [];
  if (notApproved.length) b.push('attendance not APPROVED: ' + rdy_list_(notApproved));
  if (badNum.length) b.push('blank/non-numeric/negative day fields: ' + rdy_list_(badNum));
  if (overDim.length) b.push('worked days exceed days in month: ' + rdy_list_(overDim));
  if (noReason.length) b.push('HR_OVERRIDE=Y without OVERRIDE_REASON: ' + rdy_list_(noReason));
  if (overWd.length) {
    var msg = 'worked days exceed WORKING_DAYS: ' + rdy_list_(overWd);
    if (pop === 'PERMANENT_WORKER') b.push(msg); else w.push(msg);
  }
  return rdy_res_(b, w, ctx.attRows.length + ' rows approved and valid');
}

function rdy_check4_(inputs, ctx) {
  var m = inputs.dailyMissingByEmp;
  if (m == null) return { status: 'READY', detail: 'No daily attendance data for period (monthly entry)' };
  var bad = ctx.rosterIds.filter(function (id) { return m[id] && m[id].length; })
    .map(function (id) { return id + '(' + m[id].length + ' dates, from ' + m[id][0] + ')'; });
  return rdy_res_(bad.length ? ['missing daily dates: ' + rdy_list_(bad)] : [], [], 'Daily attendance complete');
}

function rdy_check5_(inputs, ctx) {
  var pop = inputs.population;
  var missing = [], zero = [];
  ctx.rosterIds.forEach(function (id) {
    if (pop === 'STAFF' || pop === 'PERMANENT_WORKER') {
      var s = (inputs.salaryByEmp || {})[id];
      if (!s) { missing.push(id); return; }
      var fg = rdy_num_(s.FIXED_GROSS_PM_AS_SOURCE_INR), basic = rdy_num_(s.BASIC_PM_INR);
      if (!(fg > 0) && !(basic > 0)) zero.push(id);
    } else {
      var r = (inputs.rateByEmp || {})[id];
      if (!r) { missing.push(id); return; }
      var basis = rdy_id_(r.PAY_BASIS).toUpperCase();
      var amt = basis === 'DAILY_RATE' ? rdy_num_(r.RATE_AMOUNT_INR) : rdy_num_(r.MONTHLY_GROSS_INR);
      if (!(amt > 0)) zero.push(id);
    }
  });
  var b = [];
  if (missing.length) b.push('no salary structure / rate profile: ' + rdy_list_(missing));
  if (zero.length) b.push('zero pay structure: ' + rdy_list_(zero));
  return rdy_res_(b, [], 'Pay structure present for all');
}

function rdy_check6_(inputs) {
  var feeds = RDY_REQUIRED_FEEDS.slice();
  if (inputs.population === 'PERMANENT_WORKER') feeds.push('EFFICIENCY');
  var fs = inputs.feedStatus || {};
  var open = feeds.filter(function (f) {
    var v = fs[f];
    if (v && typeof v === 'object') v = v.STATUS;
    return String(v == null ? '' : v).trim().toUpperCase() !== 'COMPLETE';
  });
  return rdy_res_(open.length ? ['feeds not COMPLETE: ' + open.join(', ')] : [], [], 'All required feeds COMPLETE');
}

function rdy_check7_(inputs, ctx) {
  var all = inputs.allActiveIds ? rdy_set_(inputs.allActiveIds) : null;
  var ids = [];
  (inputs.otExceptionRows || []).forEach(function (r) {
    if (rdy_id_(r.ELIGIBILITY).toUpperCase() !== 'EXCEPTION') return;
    var p = normalizePeriod(r.PAYROLL_MONTH);
    if (p && p !== inputs.period) return;
    var id = rdy_id_(r.EMP_ID);
    // unattributable (unknown EMP_ID) exceptions block every population - fail closed
    if (ctx.rosterSet[id] || (all ? !all[id] : false)) ids.push(id === '' ? '(blank EMP_ID)' : id);
  });
  var b = ids.length ? ['OT exceptions (' + ids.length + '): ' + rdy_list_(rdy_uniq_(ids))] : [];
  var w = inputs.pendingOtCount > 0 ? ['pending OT events: ' + inputs.pendingOtCount] : [];
  return rdy_res_(b, w, 'No OT exceptions');
}

function rdy_check8_(inputs) {
  var pop = inputs.population;
  var required = requiredStatutoryKeys(pop);
  if (!required.length) return { status: 'READY', detail: 'No statutory keys required for ' + pop };
  var st = inputs.statutoryResolved;
  if (!st) return { status: 'BLOCKED', detail: 'Statutory config not resolved for ' + inputs.period };
  var b = [];
  if (st.missing && st.missing.length) b.push('missing keys: ' + st.missing.join(', '));
  if (st.invalid && st.invalid.length) b.push('invalid values: ' + st.invalid.join(', '));
  return rdy_res_(b, [], 'All statutory keys present');
}

function rdy_check9_(inputs, ctx) {
  var counts = {};
  (inputs.roster || []).forEach(function (e) { var id = rdy_id_(e.EMP_ID); counts[id] = (counts[id] || 0) + 1; });
  var dups = Object.keys(counts).filter(function (id) { return counts[id] > 1; });
  (inputs.masterDuplicateIds || []).forEach(function (x) {
    var id = rdy_id_(x);
    if (ctx.rosterSet[id] && dups.indexOf(id) < 0) dups.push(id);
  });
  return rdy_res_(dups.length ? ['duplicate active EMP_ID in EMPLOYEE_MASTER: ' + rdy_list_(dups)] : [], [], 'No duplicates');
}

function rdy_check10_(inputs, ctx) {
  if (inputs.population !== 'CONSULTANT') return { status: 'READY', detail: 'Not applicable' };
  var ot = inputs.otHoursByEmp || {};
  var bad = ctx.rosterIds.filter(function (id) {
    var r = (inputs.rateByEmp || {})[id];
    if (!r) return false;
    var basis = rdy_id_(r.PAY_BASIS).toUpperCase();
    return basis === 'MONTHLY_GROSS_PRORATED' && rdy_num_(ot[id]) > 0;
  });
  return rdy_res_(bad.length ? ['monthly consultant with OT hours (BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM): ' + rdy_list_(bad)] : [],
    [], 'No monthly consultant OT');
}

function rdy_check11_(inputs) {
  if (inputs.population !== 'PERMANENT_WORKER') return { status: 'READY', detail: 'Not applicable' };
  var rows = inputs.efficiencyConfigRows || [];
  var unconfirmed = rows.filter(function (r) { return rdy_id_(r.IMPLEMENTATION_STATE).toUpperCase() !== 'CONFIRMED'; });
  if (!rows.length) return { status: 'WARN', detail: 'EFFICIENCY_CONFIG has no rows' };
  if (unconfirmed.length) {
    return { status: 'WARN', detail: unconfirmed.length + ' of ' + rows.length + ' EFFICIENCY_CONFIG rows not CONFIRMED (state: ' +
      rdy_uniq_(unconfirmed.map(function (r) { return rdy_id_(r.IMPLEMENTATION_STATE) || '(blank)'; })).join(', ') + ')' };
  }
  return { status: 'READY', detail: 'EFFICIENCY_CONFIG CONFIRMED' };
}

function rdy_check12_(inputs) {
  if (!inputs.calcResults) return { status: 'READY', detail: 'No draft calculated yet' };
  var neg = [];
  inputs.calcResults.forEach(function (res) {
    var row = res.row || {};
    var flagged = (res.exceptions || []).some(function (e) { return e.code === 'NEGATIVE_NET_PAY'; });
    if (flagged || (typeof row.NET_PAY === 'number' && row.NET_PAY < 0)) neg.push(rdy_id_(row.EMP_ID));
  });
  return rdy_res_(neg.length ? ['negative net pay: ' + rdy_list_(neg)] : [], [], 'No negative net pay');
}

/** Extra row (only when calcResults supplied): any other BLOCKER raised by the calculation. */
function rdy_calcBlockers_(inputs) {
  var ids = [];
  inputs.calcResults.forEach(function (res) {
    var other = (res.exceptions || []).some(function (e) { return e.severity === 'BLOCKER' && e.code !== 'NEGATIVE_NET_PAY'; });
    if (other) ids.push(rdy_id_((res.row || {}).EMP_ID));
  });
  return rdy_res_(ids.length ? ['calculation blockers: ' + rdy_list_(ids)] : [], [], 'No calculation blockers');
}

/**
 * inputs = {period, population, roster, allActiveIds?, masterDuplicateIds?, periodCategoryRow, attendanceRows,
 *   dailyMissingByEmp (null = no daily data), salaryByEmp, rateByEmp, feedStatus, otExceptionRows, otHoursByEmp,
 *   pendingOtCount?, statutoryResolved, efficiencyConfigRows, calcResults?}
 * Returns [{PERIOD, POPULATION, CHECK, STATUS, DETAIL}].
 */
function buildReadiness(inputs) {
  var pop = inputs.population;
  var roster = (inputs.roster || []).filter(function (e) {
    return !e.PAYROLL_CATEGORY || rdy_id_(e.PAYROLL_CATEGORY) === pop;
  });
  var rosterIds = rdy_uniq_(roster.map(function (e) { return rdy_id_(e.EMP_ID); }).filter(function (x) { return x; }));
  var rosterSet = rdy_set_(rosterIds);
  var ctx = { rosterIds: rosterIds, rosterSet: rosterSet };
  ctx.attRows = rdy_popAttendance_(inputs, rosterSet);
  var scoped = {};
  Object.keys(inputs).forEach(function (k) { scoped[k] = inputs[k]; });
  scoped.roster = roster;

  var results = [
    rdy_check1_(scoped), rdy_check2_(scoped, ctx), rdy_check3_(scoped, ctx), rdy_check4_(scoped, ctx),
    rdy_check5_(scoped, ctx), rdy_check6_(scoped), rdy_check7_(scoped, ctx), rdy_check8_(scoped),
    rdy_check9_(scoped, ctx), rdy_check10_(scoped, ctx), rdy_check11_(scoped), rdy_check12_(scoped)
  ];
  var out = results.map(function (r, i) {
    return { PERIOD: inputs.period, POPULATION: pop, CHECK: RDY_CHECK_NAMES[i], STATUS: r.status, DETAIL: r.detail };
  });
  if (inputs.calcResults) {
    var cb = rdy_calcBlockers_(inputs);
    out.push({ PERIOD: inputs.period, POPULATION: pop, CHECK: 'CALC_BLOCKERS', STATUS: cb.status, DETAIL: cb.detail });
  }
  return out;
}

/** Summary of readiness rows: {blocked, warn, ready, byPopulation:{pop:{blocked,warn,ready}}}. */
function rdy_summarize_(rows) {
  var s = { blocked: 0, warn: 0, ready: 0, byPopulation: {} };
  rows.forEach(function (r) {
    var p = s.byPopulation[r.POPULATION] || (s.byPopulation[r.POPULATION] = { blocked: 0, warn: 0, ready: 0 });
    var k = r.STATUS === 'BLOCKED' ? 'blocked' : (r.STATUS === 'WARN' ? 'warn' : 'ready');
    p[k]++; s[k]++;
  });
  return s;
}

// ---------------------------------------------------------------- sheet-touching entry point

/**
 * checkReadiness(period, population?) - runs the checks for one or all populations, rewrites the PAYROLL_READINESS
 * rows of that period (and those populations only), returns {period, blocked, warn, ready, byPopulation, rows}.
 * opts (internal, used by calculateDraft): {sources, calcResultsByPop}.
 */
function checkReadiness(period, population, opts) {
  guardPeriod_(period);
  opts = opts || {};
  var pops = population ? [population] : POPULATION_LIST.slice();
  pops.forEach(function (p) { if (!isKnownPopulation(p)) throw new Error('Unknown population "' + p + '"'); });
  var src = opts.sources || engine_readSources_(period);
  var checkedAt = nowIso_();
  var rows = [], done = [], skippedLocked = [];
  pops.forEach(function (pop) {
    var pc = engine_periodCatRow_(src, pop);
    if (pc && rdy_id_(pc.STATUS) === PERIOD_STATUS.LOCKED) { skippedLocked.push(pop); return; }
    var calcResults = opts.calcResultsByPop && opts.calcResultsByPop[pop];
    if (!calcResults) {
      try { calcResults = engine_calcPopulation(src, pop, '', checkedAt).results; } catch (e) { calcResults = null; }
    }
    var inputs = engine_readinessInputs_(src, pop, calcResults);
    buildReadiness(inputs).forEach(function (r) { r.CHECKED_AT = checkedAt; rows.push(r); });
    done.push(pop);
  });
  engine_replaceRows_(TABS.PAYROLL_READINESS, ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL', 'CHECKED_AT'], rows,
    function (o) { return normalizePeriod(o.PERIOD) === period && done.indexOf(rdy_id_(o.POPULATION)) >= 0; });
  var sum = rdy_summarize_(rows);
  var res = { period: period, populations: done, skippedLocked: skippedLocked, blocked: sum.blocked, warn: sum.warn,
    ready: sum.ready, byPopulation: sum.byPopulation, rows: rows };
  audit('READINESS', period, population || '', { blocked: sum.blocked, warn: sum.warn, ready: sum.ready });
  return res;
}

// ===== 32_Engine.gs =====
/**
 * 32_Engine.gs - payroll engine orchestration (DESIGN sections 5-7). Pure joiners first (buildEngineContexts,
 * engine_pickSalary, engine_calcPopulation, engine_recon), sheet-touching code after.
 * Feed readers come from 20_Feeds.gs: sumOtHours, canteenByEmp, efficiencyByEmp, advanceByEmp, societyByEmp.
 * Helpers are prefixed engine_.
 */
var ENGINE_POP_TABS = { STAFF: 'PAYROLL_STAFF', PERMANENT_WORKER: 'PAYROLL_WORKER', CONSULTANT: 'PAYROLL_CONSULTANT',
  PUNE_STAFF: 'PAYROLL_PUNE_STAFF' };
var ENGINE_EXCEPTION_COLUMNS = ['RUN_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'SEVERITY', 'CODE', 'MESSAGE'];
var ENGINE_RECON_COLUMNS = ['PERIOD', 'POPULATION', 'HEADCOUNT', 'TOTAL_GROSS', 'TOTAL_DEDUCTIONS', 'TOTAL_NET',
  'PREV_PERIOD_NET', 'DELTA_PCT', 'RUN_ID'];
var ENGINE_ATT_FIELDS = ['PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS'];
var ENGINE_PERIOD_CAT_COLUMNS = ['DRAFT_RUN_ID', 'DRAFT_HASH', 'HR_APPROVED_BY', 'HR_APPROVED_AT',
  'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT'];

// ---------------------------------------------------------------- pure

function engine_id_(v) { return String(v == null ? '' : v).trim(); }

function engine_dateLo_(v) {
  var d = toIsoDate(v);
  if (d) return d;
  var p = normalizePeriod(v);
  return p ? p + '-01' : '';
}

function engine_dateHi_(v) {
  var d = toIsoDate(v);
  if (d) return d;
  var p = normalizePeriod(v);
  return p ? periodEnd(p) : '';
}

/**
 * Effective-dated pick (DESIGN section 1): per EMP_ID the row with the latest EFFECTIVE_FROM <= period end and
 * (EFFECTIVE_TO blank or >= period start). Rows with blank/unparseable EFFECTIVE_FROM are ignored. Ties: later row.
 * Returns {EMP_ID: row}.
 */
function engine_pickSalary(rows, period) {
  var start = periodStart(period), end = periodEnd(period), best = {};
  (rows || []).forEach(function (r, i) {
    var id = engine_id_(r.EMP_ID);
    if (!id) return;
    var from = engine_dateLo_(r.EFFECTIVE_FROM), to = engine_dateHi_(r.EFFECTIVE_TO);
    if (!from || from > end) return;
    if (to && to < start) return;
    var cur = best[id];
    if (!cur || from > cur.from || (from === cur.from && i >= cur.i)) best[id] = { from: from, i: i, row: r };
  });
  var out = {};
  Object.keys(best).forEach(function (k) { out[k] = best[k].row; });
  return out;
}

/** Rate profile: single current row per EMP_ID (last row wins). */
function engine_pickRate(rows) {
  var out = {};
  (rows || []).forEach(function (r) { var id = engine_id_(r.EMP_ID); if (id) out[id] = r; });
  return out;
}

/** PT_EXEMPTIONS rows active in the period -> {EMP_ID: true}. */
function engine_ptExemptSet(rows, period) {
  var start = periodStart(period), end = periodEnd(period), out = {};
  (rows || []).forEach(function (r) {
    var id = engine_id_(r.EMP_ID);
    if (!id) return;
    var from = engine_dateLo_(r.EFFECTIVE_FROM), to = engine_dateHi_(r.EFFECTIVE_TO);
    if (from && from > end) return;
    if (to && to < start) return;
    out[id] = true;
  });
  return out;
}

/** EMPLOYEE_MASTER rows -> {all: active entries in known populations (duplicates kept), duplicateIds, allActiveIds}. */
function engine_rosterFromMaster(rows) {
  var all = [], counts = {};
  (rows || []).forEach(function (r) {
    if (String(r.STATUS_AS_SOURCE || '').trim().toLowerCase() !== 'active') return;
    var pop = engine_id_(r.PAYROLL_CATEGORY), id = engine_id_(r.EMP_ID);
    if (!id || !isKnownPopulation(pop)) return;
    counts[id] = (counts[id] || 0) + 1;
    var doj = '';
    if (typeof parseDoj === 'function') { try { doj = parseDoj(r.DOJ_AS_SOURCE) || ''; } catch (e) { doj = ''; } }
    all.push({ EMP_ID: id, PAYROLL_CATEGORY: pop, SITE: siteForPopulation(pop), EMPLOYEE_NAME: String(r.EMPLOYEE_NAME || ''),
      DEPARTMENT: String(r.DEPARTMENT || '').trim(), DESIGNATION: String(r.DESIGNATION || '').trim(), DOJ: doj });
  });
  return { all: all, duplicateIds: Object.keys(counts).filter(function (k) { return counts[k] > 1; }),
    allActiveIds: Object.keys(counts) };
}

/**
 * Joins everything into calcEmployee ctx objects (field names as 30_Calc.gs reads them).
 * args = {period, population, workingDays, employees[{EMP_ID,EMPLOYEE_NAME,DEPARTMENT,DESIGNATION}],
 *   attendanceByEmp, salaryByEmp, rateByEmp, otByEmp, canteenByEmp, societyByEmp, advanceByEmp, efficiencyByEmp,
 *   adjustmentRows, cfg, ptExemptSet, efficiencyConfig}
 */
function buildEngineContexts(args) {
  var pop = args.population, period = args.period;
  var num = function (map, id) { var v = map ? map[id] : undefined; return v === undefined || v === null || v === '' ? 0 : v; };
  return (args.employees || []).map(function (e) {
    var id = engine_id_(e.EMP_ID);
    var attRow = (args.attendanceByEmp || {})[id];
    var att = {};
    if (attRow) ENGINE_ATT_FIELDS.forEach(function (k) { att[k] = attRow[k]; });
    var ctx = {
      period: period,
      population: pop,
      emp: { EMP_ID: id, EMPLOYEE_NAME: e.EMPLOYEE_NAME !== undefined ? e.EMPLOYEE_NAME : (e.NAME || ''),
        DEPARTMENT: e.DEPARTMENT || '', DESIGNATION: e.DESIGNATION || '' },
      workingDays: args.workingDays,
      attendance: att,
      otHours: num(args.otByEmp, id),
      canteen: num(args.canteenByEmp, id),
      society: num(args.societyByEmp, id),
      advance: num(args.advanceByEmp, id),
      adjustments: aggregateAdjustments(args.adjustmentRows || [], period, id),
      cfg: args.cfg || {},
      ptExemptSet: args.ptExemptSet || {},
      hasAttendance: !!attRow,
      attendanceApproved: !!attRow && engine_id_(attRow.APPROVAL_STATUS).toUpperCase() === 'APPROVED'
    };
    if (pop === 'STAFF' || pop === 'PERMANENT_WORKER') ctx.salary = (args.salaryByEmp || {})[id] || null;
    else ctx.rate = (args.rateByEmp || {})[id] || null;
    if (pop === 'PERMANENT_WORKER') {
      var pct = args.efficiencyByEmp ? args.efficiencyByEmp[id] : undefined;
      // real efficiencyByEmp (20_Feeds.gs) returns {pct, physicalDaysOverride, source}; calcWorker wants the number
      if (pct !== null && typeof pct === 'object') pct = pct.pct;
      ctx.efficiencyPct = pct === undefined ? null : pct;
      ctx.efficiencyConfig = args.efficiencyConfig || [];
    }
    return ctx;
  });
}

function engine_prevPeriod(period) {
  var p = parsePeriod(period);
  var y = p.month === 1 ? p.year - 1 : p.year, m = p.month === 1 ? 12 : p.month - 1;
  return y + '-' + pad2_(m);
}

function engine_feedStatusMap(rows, period) {
  var map = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) !== period) return;
    var f = engine_id_(r.FEED).toUpperCase();
    if (f) map[f] = engine_id_(r.STATUS).toUpperCase();
  });
  return map;
}

function engine_call_(name, args) {
  var fn = (typeof globalThis !== 'undefined' ? globalThis : this)[name];
  if (typeof fn !== 'function') throw new Error('Feed reader ' + name + ' (20_Feeds.gs) is not loaded');
  return fn.apply(null, args);
}

/** Everything derived from the raw sheet bundle for one population. */
function engine_derive_(src, pop) {
  var period = src.period;
  var roster = src.roster.all.filter(function (e) { return e.PAYROLL_CATEGORY === pop; });
  var seen = {}, employees = [];
  roster.forEach(function (e) { if (!seen[e.EMP_ID]) { seen[e.EMP_ID] = true; employees.push(e); } });
  var workerIds = pop === 'PERMANENT_WORKER' ? employees.map(function (e) { return e.EMP_ID; }) : [];
  var attendanceRows = src.attendance.filter(function (r) {
    return engine_id_(r.PAYROLL_CATEGORY) === pop || seen[engine_id_(r.EMP_ID)];
  });
  var attendanceByEmp = {};
  attendanceRows.forEach(function (r) { var id = engine_id_(r.EMP_ID); if (!attendanceByEmp[id]) attendanceByEmp[id] = r; });
  var d = {
    roster: roster, employees: employees, attendanceRows: attendanceRows, attendanceByEmp: attendanceByEmp,
    otByEmp: engine_call_('sumOtHours', [src.otRows, period]),
    canteenByEmp: engine_call_('canteenByEmp', [src.canteenRows, period]),
    societyByEmp: engine_call_('societyByEmp', [src.societyRows, period]),
    advanceByEmp: engine_call_('advanceByEmp', [src.advanceRows, period]),
    efficiencyByEmp: pop === 'PERMANENT_WORKER' ? engine_call_('efficiencyByEmp', [src.efficiencyRows, period, workerIds]) : {},
    statutory: resolveStatutory(src.statutoryRows, period, pop),
    salaryByEmp: engine_pickSalary(src.salaryRows, period),
    rateByEmp: engine_pickRate(src.rateRows),
    ptExemptSet: engine_ptExemptSet(src.ptExemptRows, period),
    dailyMissingByEmp: null
  };
  if (src.dailyRows && src.dailyRows.length) {
    var missing = {};
    aggregateDaily(src.dailyRows, period, roster, src.holidayRows || [], '').forEach(function (rec) {
      if (rec.missingDates.length) missing[rec.EMP_ID] = rec.missingDates;
    });
    d.dailyMissingByEmp = missing;
  }
  return d;
}

function engine_periodCatRow_(src, pop) {
  var rows = src.periodCat || [];
  for (var i = 0; i < rows.length; i++) if (engine_id_(rows[i].PAYROLL_CATEGORY) === pop) return rows[i];
  return null;
}

/** Pending OT events for pop (+ unattributable ones) from the OT_PENDING_<period> control value written by syncOtFromForm. */
function engine_pendingOt_(src, pop) {
  var o = {};
  try { o = JSON.parse(String(src.otPendingRaw == null ? '' : src.otPendingRaw)) || {}; } catch (e) { o = {}; }
  if (typeof o !== 'object' || Array.isArray(o)) o = {};
  var n = Number(o[pop]) + Number(o.UNKNOWN || 0);
  return isFinite(n) && n > 0 ? n : 0;
}

/** Inputs for buildReadiness (31_Readiness.gs) for one population. */
function engine_readinessInputs_(src, pop, calcResults) {
  var d = engine_derive_(src, pop);
  var otEx = src.otRows.filter(function (r) {
    return engine_id_(r.ELIGIBILITY).toUpperCase() === 'EXCEPTION' && normalizePeriod(r.PAYROLL_MONTH) === src.period;
  });
  return {
    period: src.period, population: pop, roster: d.roster, allActiveIds: src.roster.allActiveIds,
    masterDuplicateIds: src.roster.duplicateIds, periodCategoryRow: engine_periodCatRow_(src, pop),
    attendanceRows: src.attendance, dailyMissingByEmp: d.dailyMissingByEmp, salaryByEmp: d.salaryByEmp,
    rateByEmp: d.rateByEmp, feedStatus: src.feedStatus, otExceptionRows: otEx, otHoursByEmp: d.otByEmp,
    statutoryResolved: d.statutory, efficiencyConfigRows: src.efficiencyConfig, calcResults: calcResults || null,
    pendingOtCount: engine_pendingOt_(src, pop)
  };
}

/**
 * Calculates one population. Returns {rows (OUTPUT_COLUMNS objects), exceptions (PAYROLL_EXCEPTIONS objects),
 * results ([{row, exceptions}]), ctxs}. Engine-level checks (missing attendance, duplicate master id,
 * unapproved attendance, adjustment problems) are merged into the calc exceptions.
 */
function engine_calcPopulation(src, pop, runId, calcAt) {
  var d = engine_derive_(src, pop);
  var pc = engine_periodCatRow_(src, pop);
  var dupSet = {};
  (src.roster.duplicateIds || []).forEach(function (x) { dupSet[x] = true; });
  var ctxs = buildEngineContexts({
    period: src.period, population: pop, workingDays: pc ? pc.WORKING_DAYS : '', employees: d.employees,
    attendanceByEmp: d.attendanceByEmp, salaryByEmp: d.salaryByEmp, rateByEmp: d.rateByEmp, otByEmp: d.otByEmp,
    canteenByEmp: d.canteenByEmp, societyByEmp: d.societyByEmp, advanceByEmp: d.advanceByEmp,
    efficiencyByEmp: d.efficiencyByEmp, adjustmentRows: src.adjustmentRows, cfg: d.statutory.values,
    ptExemptSet: d.ptExemptSet, efficiencyConfig: src.efficiencyConfig
  });
  var rows = [], exceptions = [], results = [];
  ctxs.forEach(function (ctx) {
    var res = calcEmployee(ctx);
    var extra = [];
    if (!ctx.hasAttendance) extra.push({ severity: 'BLOCKER', code: 'MISSING_ATTENDANCE', message: 'No INPUT_ATTENDANCE row' });
    else if (!ctx.attendanceApproved) extra.push({ severity: 'WARN', code: 'ATTENDANCE_NOT_APPROVED', message: 'Attendance row is not APPROVED' });
    if (dupSet[ctx.emp.EMP_ID]) extra.push({ severity: 'BLOCKER', code: 'DUPLICATE_MASTER_ID', message: 'EMP_ID appears more than once among active master rows' });
    ((ctx.adjustments && ctx.adjustments.exceptions) || []).forEach(function (e) { extra.push(e); });
    var all = res.exceptions.concat(extra);
    var row = res.row;
    if (extra.some(function (e) { return e.severity === 'BLOCKER'; }) && row.NET_PAY !== null &&
        !res.exceptions.some(function (e) { return e.severity === 'BLOCKER' && e.code !== 'NEGATIVE_NET_PAY'; })) {
      row.NET_PAY = null;
    }
    var seen = {}, codes = [];
    all.forEach(function (e) { if (!seen[e.code]) { seen[e.code] = true; codes.push(e.code); } });
    row.FLAGS = codes.join(';');
    row.RUN_ID = runId;
    row.CALCULATED_AT = calcAt;
    rows.push(row);
    results.push({ row: row, exceptions: all });
    all.forEach(function (e) {
      exceptions.push({ RUN_ID: runId, PERIOD: src.period, POPULATION: pop, EMP_ID: ctx.emp.EMP_ID, SEVERITY: e.severity,
        CODE: e.code, MESSAGE: e.message });
    });
  });
  return { rows: rows, exceptions: exceptions, results: results, ctxs: ctxs };
}

function engine_sum_(rows, col) {
  var t = 0;
  rows.forEach(function (r) { var n = Number(r[col]); if (isFinite(n)) t += n; });
  return roundSheets(t, 2);
}

/** One PAYROLL_RECON row. prevNet: number or null/undefined when no locked previous period. */
function engine_recon(period, pop, rows, prevNet, runId) {
  var net = engine_sum_(rows, 'NET_PAY');
  var hasPrev = prevNet !== null && prevNet !== undefined && prevNet !== '';
  return {
    PERIOD: period, POPULATION: pop, HEADCOUNT: rows.length, TOTAL_GROSS: engine_sum_(rows, 'TOTAL_EARNINGS'),
    TOTAL_DEDUCTIONS: engine_sum_(rows, 'TOTAL_DEDUCTIONS'), TOTAL_NET: net,
    PREV_PERIOD_NET: hasPrev ? prevNet : '',
    DELTA_PCT: hasPrev && prevNet !== 0 ? roundSheets((net - prevNet) / prevNet * 100, 2) : '',
    RUN_ID: runId
  };
}

function engine_sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}

function engine_runId_(period, population, date) {
  return 'RUN-' + period + '-' + (population || 'ALL') + '-' + Utilities.formatDate(date || new Date(), HROS_TZ, 'yyyyMMddHHmmss');
}

// ---------------------------------------------------------------- sheet-touching

function engine_readOpt_(name) { return getSheet(name) ? readObjects(name) : []; }

function engine_inPeriod_(rows, col, period) {
  return rows.filter(function (r) { return normalizePeriod(r[col]) === period; });
}

/** Reads every source tab once. */
function engine_readSources_(period) {
  var daily = engine_readOpt_(TABS.ATTENDANCE_DAILY).filter(function (r) {
    return toIsoDate(r.DATE).slice(0, 7) === period;
  });
  return {
    period: period,
    roster: engine_rosterFromMaster(readObjects(TABS.EMPLOYEE_MASTER)),
    periodCat: engine_inPeriod_(engine_readOpt_(TABS.PAYROLL_PERIOD_CATEGORY), 'PAYROLL_MONTH', period),
    attendance: engine_inPeriod_(engine_readOpt_(TABS.INPUT_ATTENDANCE), 'PAYROLL_MONTH', period),
    dailyRows: daily,
    holidayRows: engine_readOpt_(TABS.HOLIDAY_CALENDAR),
    salaryRows: engine_readOpt_('SALARY_STRUCTURE'),
    rateRows: engine_readOpt_('PAYROLL_RATE_PROFILE'),
    feedStatus: engine_feedStatusMap(engine_readOpt_(TABS.FEED_STATUS), period),
    otRows: engine_readOpt_(TABS.INPUT_OT),
    canteenRows: engine_readOpt_(TABS.INPUT_CANTEEN),
    efficiencyRows: engine_readOpt_(TABS.INPUT_EFFICIENCY),
    advanceRows: engine_readOpt_(TABS.INPUT_ADVANCE),
    societyRows: engine_readOpt_(TABS.INPUT_SOCIETY),
    adjustmentRows: engine_readOpt_(TABS.INPUT_ADJUSTMENTS),
    statutoryRows: engine_readOpt_(TABS.STATUTORY_CONFIG),
    ptExemptRows: engine_readOpt_(TABS.PT_EXEMPTIONS),
    efficiencyConfig: engine_readOpt_(TABS.EFFICIENCY_CONFIG),
    lockedPrevRows: engine_inPeriod_(engine_readOpt_(TABS.PAYROLL_LOCKED), 'PERIOD', engine_prevPeriod(period)),
    otPendingRaw: getSheet(TABS.PAYROLL_CONTROL) ? readControlMap()['OT_PENDING_' + period] : ''
  };
}

function engine_prevNet_(src, pop) {
  var rows = src.lockedPrevRows.filter(function (r) { return engine_id_(r.POPULATION) === pop; });
  if (!rows.length) return null;
  return engine_sum_(rows, 'NET_PAY');
}

/**
 * Replaces rows of an engine-owned tab: reads all data rows, keeps those where matchFn(rowObject) is false, writes
 * kept + new back with one setValues, clears only leftover trailing rows of the data region. Header row is written
 * when empty, missing columns are appended on the right (existing columns never reordered).
 */
function engine_replaceRows_(sheetName, wantedHeaders, newObjs, matchFn) {
  var sheet = ensureSheet(sheetName);
  ensureHeaders(sheet, wantedHeaders);
  var headers = getHeaders(sheet), lc = headers.length, lr = sheet.getLastRow();
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var kept = [], oldCount = 0;
  if (lr >= 2 && lc > 0) {
    var vals = sheet.getRange(2, 1, lr - 1, lc).getValues();
    oldCount = vals.length;
    vals.forEach(function (row) {
      var blank = true, obj = {};
      for (var c = 0; c < lc; c++) {
        if (row[c] !== '' && row[c] != null) blank = false;
        if (headers[c] && !(headers[c] in obj)) obj[headers[c]] = row[c];
      }
      if (blank) return;
      if (!matchFn(obj)) kept.push(row);
    });
  }
  var fresh = (newObjs || []).map(function (o) {
    var arr = new Array(lc);
    for (var i = 0; i < lc; i++) arr[i] = '';
    Object.keys(o).forEach(function (k) { if (k in idx) arr[idx[k]] = o[k] == null ? '' : o[k]; });
    return arr;
  });
  var total = kept.concat(fresh);
  if (total.length) {
    var text = {};
    HROS_TEXT_HEADERS.forEach(function (h) { text[h] = true; });
    headers.forEach(function (h, i) {
      if (h && text[h]) sheet.getRange(2, i + 1, total.length, 1).setNumberFormat('@');
    });
    sheet.getRange(2, 1, total.length, lc).setValues(total);
  }
  if (oldCount > total.length) sheet.getRange(2 + total.length, 1, oldCount - total.length, lc).clearContent();
  return { kept: kept.length, written: fresh.length };
}

/**
 * calculateDraft(period, population?) - engine run (DESIGN sections 5-7). Allowed when STATUS is PENDING/DRAFT/blank;
 * HR_APPROVED / ACCOUNTS_APPROVED are reset to DRAFT (with AUDIT entry, approval stamps cleared); LOCKED refused
 * (an explicit population throws; in an ALL run locked populations are skipped and reported).
 */
function calculateDraft(period, population) {
  guardPeriod_(period);
  var pops = population ? [population] : POPULATION_LIST.slice();
  pops.forEach(function (p) { if (!isKnownPopulation(p)) throw new Error('Unknown population "' + p + '"'); });
  var src = engine_readSources_(period);
  var active = [], skippedLocked = [], prevStatus = {};
  pops.forEach(function (pop) {
    var pc = engine_periodCatRow_(src, pop);
    var st = pc ? engine_id_(pc.STATUS).toUpperCase() : '';
    if (st === PERIOD_STATUS.LOCKED) {
      if (population) throw new Error('Period ' + period + ' x ' + pop + ' is LOCKED - recalculation refused');
      skippedLocked.push(pop);
      return;
    }
    if (st !== '' && [PERIOD_STATUS.PENDING, PERIOD_STATUS.DRAFT, PERIOD_STATUS.HR_APPROVED,
      PERIOD_STATUS.ACCOUNTS_APPROVED].indexOf(st) < 0) {
      throw new Error('Unknown STATUS "' + st + '" for ' + period + ' x ' + pop);
    }
    prevStatus[pop] = st || PERIOD_STATUS.PENDING;
    active.push(pop);
  });
  if (!active.length) throw new Error('All requested populations are LOCKED for ' + period);

  var pcSheet = getSheet(TABS.PAYROLL_PERIOD_CATEGORY);
  var pcHeaders = pcSheet ? getHeaders(pcSheet) : [];
  var missingCols = ENGINE_PERIOD_CAT_COLUMNS.concat(['STATUS']).filter(function (c) { return pcHeaders.indexOf(c) < 0; });
  if (missingCols.length) throw new Error('PAYROLL_PERIOD_CATEGORY lacks columns ' + missingCols.join(', ') + ' (run HR OS > Setup)');

  var now = new Date();
  var runId = engine_runId_(period, population, now);
  var calcAt = nowIso_();
  var allRows = [], allEx = [], recon = [], summaries = [], calcByPop = {}, byPop = {};
  active.forEach(function (pop) {
    var c = engine_calcPopulation(src, pop, runId, calcAt);
    byPop[pop] = c;
    calcByPop[pop] = c.results;
    allRows = allRows.concat(c.rows);
    allEx = allEx.concat(c.exceptions);
    recon.push(engine_recon(period, pop, c.rows, engine_prevNet_(src, pop), runId));
  });

  var inActive = function (o) { return normalizePeriod(o.PERIOD) === period && active.indexOf(engine_id_(o.POPULATION)) >= 0; };
  engine_replaceRows_(TABS.PAYROLL_DRAFT, OUTPUT_COLUMNS, allRows, inActive);
  active.forEach(function (pop) {
    engine_replaceRows_(ENGINE_POP_TABS[pop], OUTPUT_COLUMNS, byPop[pop].rows,
      function (o) { return normalizePeriod(o.PERIOD) === period; });
  });
  engine_replaceRows_(TABS.PAYROLL_EXCEPTIONS, ENGINE_EXCEPTION_COLUMNS, allEx, inActive);
  engine_replaceRows_(TABS.PAYROLL_RECON, ENGINE_RECON_COLUMNS, recon, inActive);

  active.forEach(function (pop) {
    var c = byPop[pop];
    var hash = hashRows(c.rows, OUTPUT_COLUMNS, engine_sha256Hex_);
    var pc = engine_periodCatRow_(src, pop);
    var reset = prevStatus[pop] === PERIOD_STATUS.HR_APPROVED || prevStatus[pop] === PERIOD_STATUS.ACCOUNTS_APPROVED;
    if (pc) {
      var vals = { DRAFT_RUN_ID: runId, DRAFT_HASH: hash, STATUS: PERIOD_STATUS.DRAFT };
      if (reset) {
        vals.HR_APPROVED_BY = ''; vals.HR_APPROVED_AT = ''; vals.ACCOUNTS_APPROVED_BY = ''; vals.ACCOUNTS_APPROVED_AT = '';
      }
      updateRows(TABS.PAYROLL_PERIOD_CATEGORY, [{ row: pc._row, values: vals }]);
    }
    if (reset) {
      audit('STATUS_RESET', period, pop, { from: prevStatus[pop], to: PERIOD_STATUS.DRAFT, reason: 'draft recalculated', runId: runId });
    }
    var blockers = c.exceptions.filter(function (e) { return e.SEVERITY === 'BLOCKER'; }).length;
    var warns = c.exceptions.length - blockers;
    var s = { population: pop, headcount: c.rows.length, blockers: blockers, warns: warns,
      totalNet: engine_sum_(c.rows, 'NET_PAY'), hash: hash, statusFrom: prevStatus[pop], statusTo: PERIOD_STATUS.DRAFT,
      statusUpdated: !!pc };
    summaries.push(s);
    audit('CALC_DRAFT', period, pop, { runId: runId, headcount: s.headcount, blockers: blockers, warns: warns, hash: hash });
  });

  var readiness = checkReadiness(period, population, { sources: src, calcResultsByPop: calcByPop });
  return { period: period, runId: runId, populations: summaries, skippedLocked: skippedLocked,
    readiness: { blocked: readiness.blocked, warn: readiness.warn, ready: readiness.ready } };
}

// ===== 40_Approval.gs =====
/**
 * 40_Approval.gs - HR / Accounts approvals and owner reopen (DESIGN section 7).
 * Pure: approvalDecision, reopenDecision. Sheet-touching: hrApprove, accountsApprove, reopenPeriod, approval_* helpers.
 */

// ---------------------------------------------------------------- pure

function approval_email_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function approval_blockedCount_(rows) {
  return (rows || []).filter(function (r) { return String(r && r.STATUS).trim().toUpperCase() === 'BLOCKED'; }).length;
}

/**
 * approvalDecision({action:'HR'|'ACCOUNTS', status, userEmail, approverEmail, readinessRows, storedHash, currentHash})
 * -> {ok, newStatus, reason}. Hash mismatch -> newStatus DRAFT, reason INPUTS_OR_DRAFT_CHANGED (caller writes reset+audit).
 */
function approvalDecision(a) {
  a = a || {};
  var status = String(a.status == null ? '' : a.status).trim().toUpperCase();
  var isHr = a.action === 'HR';
  if (!isHr && a.action !== 'ACCOUNTS') return { ok: false, newStatus: status, reason: 'UNKNOWN_ACTION' };
  var user = approval_email_(a.userEmail);
  if (!user) return { ok: false, newStatus: status, reason: 'USER_EMAIL_UNKNOWN' };
  var need = isHr ? PERIOD_STATUS.DRAFT : PERIOD_STATUS.HR_APPROVED;
  if (status !== need) return { ok: false, newStatus: status, reason: 'STATUS_NOT_' + need };
  var approver = approval_email_(a.approverEmail);
  if (!approver) return { ok: false, newStatus: status, reason: 'APPROVER_EMAIL_NOT_CONFIGURED' };
  if (user !== approver) return { ok: false, newStatus: status, reason: 'USER_NOT_' + (isHr ? 'HR' : 'ACCOUNTS') + '_APPROVER' };
  var stored = String(a.storedHash == null ? '' : a.storedHash).trim();
  if (!stored) return { ok: false, newStatus: status, reason: 'NO_DRAFT_HASH' };
  if (String(a.currentHash == null ? '' : a.currentHash) !== stored) {
    return { ok: false, newStatus: PERIOD_STATUS.DRAFT, reason: 'INPUTS_OR_DRAFT_CHANGED' };
  }
  var blocked = approval_blockedCount_(a.readinessRows);
  if (blocked > 0) return { ok: false, newStatus: status, reason: 'READINESS_BLOCKED(' + blocked + ')' };
  return { ok: true, newStatus: isHr ? PERIOD_STATUS.HR_APPROVED : PERIOD_STATUS.ACCOUNTS_APPROVED, reason: 'OK' };
}

/** Reopen rule: owner only; from HR_APPROVED or ACCOUNTS_APPROVED to DRAFT; never from LOCKED. */
function reopenDecision(status, userEmail, ownerEmail) {
  var st = String(status == null ? '' : status).trim().toUpperCase();
  var user = approval_email_(userEmail), owner = approval_email_(ownerEmail);
  if (st === PERIOD_STATUS.LOCKED) return { ok: false, newStatus: st, reason: 'LOCKED_CANNOT_REOPEN' };
  if (!user) return { ok: false, newStatus: st, reason: 'USER_EMAIL_UNKNOWN' };
  if (!owner || user !== owner) return { ok: false, newStatus: st, reason: 'USER_NOT_OWNER' };
  if (st !== PERIOD_STATUS.HR_APPROVED && st !== PERIOD_STATUS.ACCOUNTS_APPROVED) {
    return { ok: false, newStatus: st, reason: 'STATUS_NOT_APPROVED' };
  }
  return { ok: true, newStatus: PERIOD_STATUS.DRAFT, reason: 'OK' };
}

// ---------------------------------------------------------------- sheet-touching helpers

function approval_userEmail_() {
  var u = '';
  try { u = Session.getActiveUser().getEmail(); } catch (e) { u = ''; }
  if (!u) { try { u = Session.getEffectiveUser().getEmail(); } catch (e2) { u = ''; } }
  return String(u || '').trim();
}

function approval_ownerEmail_() {
  try {
    var o = SpreadsheetApp.getActive().getOwner();
    return o ? String(o.getEmail() || '').trim() : '';
  } catch (e) { return ''; }
}

/**
 * Re-runs the calc in memory (no writes) from freshly read sources and hashes it exactly as calculateDraft does.
 * Returns {hash, src, calc}.
 */
function approval_recomputeHash_(period, population, src) {
  src = src || engine_readSources_(period);
  var calc = engine_calcPopulation(src, population, '', nowIso_());
  return { hash: hashRows(calc.rows, OUTPUT_COLUMNS, engine_sha256Hex_), src: src, calc: calc };
}

function approval_pcRow_(period, population) {
  var rows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY);
  for (var i = 0; i < rows.length; i++) {
    if (normalizePeriod(rows[i].PAYROLL_MONTH) === period && String(rows[i].PAYROLL_CATEGORY).trim() === population) return rows[i];
  }
  throw new Error('No PAYROLL_PERIOD_CATEGORY row for ' + period + ' x ' + population);
}

var APPROVAL_STAMP_COLUMNS = ['HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT'];

/** Update PAYROLL_PERIOD_CATEGORY row; legacy columns (APPROVED_BY/AT) only when present. */
function approval_writePc_(pcRow, values) {
  var headers = getHeaders(resolveSheet_(TABS.PAYROLL_PERIOD_CATEGORY));
  var v = {};
  Object.keys(values).forEach(function (k) {
    if ((k === 'APPROVED_BY' || k === 'APPROVED_AT') && headers.indexOf(k) < 0) return;
    v[k] = values[k];
  });
  updateRows(TABS.PAYROLL_PERIOD_CATEGORY, [{ row: pcRow._row, values: v }]);
}

function approval_resetValues_() {
  return { STATUS: PERIOD_STATUS.DRAFT, HR_APPROVED_BY: '', HR_APPROVED_AT: '', ACCOUNTS_APPROVED_BY: '',
    ACCOUNTS_APPROVED_AT: '', APPROVED_BY: '', APPROVED_AT: '' };
}

function approval_run_(action, period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var isHr = action === 'HR';
  var auditName = isHr ? 'HR_APPROVE' : 'ACCOUNTS_APPROVE';
  var user = approval_userEmail_();
  var pc = approval_pcRow_(period, population);
  var status = String(pc.STATUS || '').trim().toUpperCase();
  var approver = getControl(isHr ? 'HR_APPROVER_EMAIL' : 'ACCOUNTS_APPROVER_EMAIL', '');

  // Fresh sources shared by the readiness re-run and the hash recompute.
  var re = approval_recomputeHash_(period, population);
  var readiness = checkReadiness(period, population, { sources: re.src, calcResultsByPop: (function () {
    var m = {}; m[population] = re.calc.results; return m; })() });
  var d = approvalDecision({ action: action, status: status, userEmail: user, approverEmail: approver,
    readinessRows: readiness.rows, storedHash: pc.DRAFT_HASH, currentHash: re.hash });

  if (d.ok) {
    var vals = { STATUS: d.newStatus, APPROVED_BY: user, APPROVED_AT: nowIso_() };
    vals[isHr ? 'HR_APPROVED_BY' : 'ACCOUNTS_APPROVED_BY'] = user;
    vals[isHr ? 'HR_APPROVED_AT' : 'ACCOUNTS_APPROVED_AT'] = nowIso_();
    approval_writePc_(pc, vals);
    audit(auditName, period, population, { result: 'APPROVED', user: user, status: d.newStatus, hash: re.hash });
    return { ok: true, status: d.newStatus, reason: d.reason };
  }
  if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
    if (status === PERIOD_STATUS.HR_APPROVED || status === PERIOD_STATUS.ACCOUNTS_APPROVED) {
      approval_writePc_(pc, approval_resetValues_());
      audit('STATUS_RESET', period, population, { from: status, to: PERIOD_STATUS.DRAFT, reason: d.reason, user: user });
    }
    audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, status: PERIOD_STATUS.DRAFT,
      note: 'recalculate the draft' });
    return { ok: false, status: PERIOD_STATUS.DRAFT, reason: d.reason };
  }
  audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, status: status });
  return { ok: false, status: status, reason: d.reason };
}

function hrApprove(period, population) { return approval_run_('HR', period, population); }

function accountsApprove(period, population) { return approval_run_('ACCOUNTS', period, population); }

/** Owner only. HR_APPROVED / ACCOUNTS_APPROVED -> DRAFT, approval stamps cleared. Never from LOCKED. */
function reopenPeriod(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var user = approval_userEmail_();
  var pc = approval_pcRow_(period, population);
  var status = String(pc.STATUS || '').trim().toUpperCase();
  var d = reopenDecision(status, user, approval_ownerEmail_());
  if (!d.ok) {
    audit('REOPEN', period, population, { result: 'REFUSED', reason: d.reason, user: user, status: status });
    return { ok: false, status: status, reason: d.reason };
  }
  approval_writePc_(pc, approval_resetValues_());
  audit('REOPEN', period, population, { result: 'REOPENED', from: status, to: PERIOD_STATUS.DRAFT, user: user });
  return { ok: true, status: PERIOD_STATUS.DRAFT, reason: d.reason };
}

// ===== 41_Lock.gs =====
/**
 * 41_Lock.gs - period x population lock (DESIGN section 7). Copies the draft rows into append-only PAYROLL_LOCKED.
 * Pure: lockIdFor, buildLockRows, lockDecision. Sheet-touching: lockPeriod.
 */

// ---------------------------------------------------------------- pure

function lockIdFor(period, population, date) {
  return 'LOCK-' + period + '-' + population + '-' + Utilities.formatDate(date || new Date(), HROS_TZ, 'yyyyMMddHHmm');
}

/** Draft rows of period x population -> PAYROLL_LOCKED objects (LOCK_ID first, then OUTPUT_COLUMNS). */
function buildLockRows(draftRows, lockId, period, population) {
  return (draftRows || []).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population;
  }).map(function (r) {
    var o = { LOCK_ID: lockId };
    OUTPUT_COLUMNS.forEach(function (c) { o[c] = r[c] === undefined || r[c] === null ? '' : r[c]; });
    return o;
  });
}

/**
 * lockDecision({status, userEmail, accountsEmail, ownerEmail, storedHash, currentHash, draftSheetHash, draftRowCount,
 * existingLockedCount}) -> {ok, newStatus, reason}. A hash mismatch gives newStatus DRAFT (caller resets + audits).
 */
function lockDecision(a) {
  var status = String(a.status == null ? '' : a.status).trim().toUpperCase();
  var user = approval_email_(a.userEmail);
  if (!user) return { ok: false, newStatus: status, reason: 'USER_EMAIL_UNKNOWN' };
  if (status !== PERIOD_STATUS.ACCOUNTS_APPROVED) return { ok: false, newStatus: status, reason: 'STATUS_NOT_ACCOUNTS_APPROVED' };
  if (user !== approval_email_(a.accountsEmail) && user !== approval_email_(a.ownerEmail)) {
    return { ok: false, newStatus: status, reason: 'USER_NOT_ACCOUNTS_APPROVER_OR_OWNER' };
  }
  if (a.existingLockedCount > 0) return { ok: false, newStatus: status, reason: 'ALREADY_IN_PAYROLL_LOCKED' };
  var stored = String(a.storedHash == null ? '' : a.storedHash).trim();
  if (!stored) return { ok: false, newStatus: status, reason: 'NO_DRAFT_HASH' };
  if (String(a.currentHash) !== stored || String(a.draftSheetHash) !== stored) {
    return { ok: false, newStatus: PERIOD_STATUS.DRAFT, reason: 'INPUTS_OR_DRAFT_CHANGED' };
  }
  if (!(a.draftRowCount > 0)) return { ok: false, newStatus: status, reason: 'NO_DRAFT_ROWS' };
  return { ok: true, newStatus: PERIOD_STATUS.LOCKED, reason: 'OK' };
}

// ---------------------------------------------------------------- sheet-touching

function lockPeriod(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var user = approval_userEmail_();
  var pc = approval_pcRow_(period, population);
  var status = String(pc.STATUS || '').trim().toUpperCase();
  var re = approval_recomputeHash_(period, population);
  var draftRows = readObjects(TABS.PAYROLL_DRAFT).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population;
  });
  var lockedSheet = getSheet(TABS.PAYROLL_LOCKED);
  var existing = lockedSheet ? readObjects(lockedSheet).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population;
  }).length : 0;
  var d = lockDecision({ status: status, userEmail: user, accountsEmail: getControl('ACCOUNTS_APPROVER_EMAIL', ''),
    ownerEmail: approval_ownerEmail_(), storedHash: pc.DRAFT_HASH, currentHash: re.hash,
    draftSheetHash: hashRows(draftRows, OUTPUT_COLUMNS, engine_sha256Hex_), draftRowCount: draftRows.length,
    existingLockedCount: existing });
  if (!d.ok) {
    if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
      approval_writePc_(pc, approval_resetValues_());
      audit('STATUS_RESET', period, population, { from: status, to: PERIOD_STATUS.DRAFT, reason: d.reason, user: user });
    }
    audit('LOCK', period, population, { result: 'REFUSED', reason: d.reason, user: user, status: d.newStatus });
    return { ok: false, status: d.newStatus, reason: d.reason };
  }
  var lockId = lockIdFor(period, population, new Date());
  var sheet = ensureSheet(TABS.PAYROLL_LOCKED);
  ensureHeaders(sheet, ['LOCK_ID'].concat(OUTPUT_COLUMNS));
  var rows = buildLockRows(draftRows, lockId, period, population);
  appendObjects(sheet, rows);
  if (!isSheetProtected(sheet)) protectSheet(sheet, 'HR OS PAYROLL_LOCKED (append-only, owner edit)');
  approval_writePc_(pc, { STATUS: PERIOD_STATUS.LOCKED, LOCKED_AT: nowIso_(), LOCK_ID: lockId });
  audit('LOCK', period, population, { result: 'LOCKED', lockId: lockId, rows: rows.length, user: user, hash: re.hash });
  return { ok: true, status: PERIOD_STATUS.LOCKED, reason: 'OK', lockId: lockId, rows: rows.length };
}

// ===== 50_Payslips.gs =====
/**
 * 50_Payslips.gs - Stage 8: payslip PDFs from PAYROLL_LOCKED (STAFF, PERMANENT_WORKER only).
 * Template placeholder syntax (read from the two template Docs): {{TOKEN}}, e.g. {{PAYROLL_PERIOD}}.
 * Pure parts (token maps, formatting, replacements, templateTokenCheck) never touch Drive/Sheets.
 * PDFs are created in the owner-only payslip folder; sharing is never changed here.
 */
var PAYSLIP_BATCH_SIZE = 25;
var PAYSLIP_JOB_PROP = 'PAYSLIP_JOB';
var PAYSLIP_POPULATIONS = ['STAFF', 'PERMANENT_WORKER'];
var PAYSLIP_CONTINUE_FN = 'continuePayslips_';

// ---------------------------------------------------------------- pure formatting

/** 1234567 -> '12,34,567' (Indian grouping, 0 decimals, half away from zero). Blank -> '0'. Non-numeric throws. */
function payslipMoney(v) {
  if (v === '' || v == null) return '0';
  var n = Number(v);
  if (typeof v === 'boolean' || !isFinite(n)) throw new Error('Non-numeric money value "' + v + '"');
  var neg = n < 0;
  var s = String(Math.floor(Math.abs(n) + 0.5));
  if (s.length > 3) {
    var last3 = s.slice(-3), rest = s.slice(0, -3);
    s = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (neg && s !== '0' ? '-' : '') + s;
}

/** Days / hours: up to 1 decimal, no trailing zero. Blank -> '0'. */
function payslipDays(v) {
  if (v === '' || v == null) return '0';
  var n = Number(v);
  if (typeof v === 'boolean' || !isFinite(n)) throw new Error('Non-numeric days value "' + v + '"');
  var r = Math.round(Math.abs(n) * 10) / 10;
  return (n < 0 && r !== 0 ? '-' : '') + String(r);
}

/** '2026-09' -> 'September 2026'. */
function payslipPeriodLabel(period) {
  return monthName(period) + ' ' + parsePeriod(period).year;
}

// ---------------------------------------------------------------- token maps

function pslM_(col) { return function (row) { return payslipMoney(row[col]); }; }
function pslD_(col) { return function (row) { return payslipDays(row[col]); }; }
function pslBlank_() { return ''; }
function pslEmp_(empCol, rowCol) {
  return function (row, emp) {
    var v = emp && emp[empCol] != null && emp[empCol] !== '' ? emp[empCol] : (rowCol ? row[rowCol] : '');
    if (Object.prototype.toString.call(v) === '[object Date]') v = toIsoDate(v);
    return v == null ? '' : String(v);
  };
}

/** Sensitive identifiers and leave balances: always blank in v1 (DESIGN section 8). */
var PAYSLIP_BLANK_TOKENS = ['UAN', 'ESI_NO', 'PAN', 'BANK_NAME', 'BANK_ACCOUNT', 'ACCOUNT_NO', 'IFSC',
  'EL_AVAILABLE', 'CL_AVAILABLE', 'SL_AVAILABLE'];

/**
 * *_RATE tokens show the employee's fixed monthly structure effective for the period (SALARY_STRUCTURE, picked with
 * engine_pickSalary). Token functions receive (lockedRow, empMasterRow, salaryRow). A missing salary row makes
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
    return payslipMoney(sal[col]);
  };
}

function pslCommonMap_() {
  var m = {
    PAYROLL_PERIOD: function (row) { return payslipPeriodLabel(row.PERIOD); },
    EMP_NAME: pslEmp_('EMPLOYEE_NAME', 'EMPLOYEE_NAME'),
    EMP_ID: function (row, emp) { return String((emp && emp.EMP_ID) || row.EMP_ID || ''); },
    DEPARTMENT: pslEmp_('DEPARTMENT', 'DEPARTMENT'),
    DESIGNATION: pslEmp_('DESIGNATION', 'DESIGNATION'),
    DOJ: pslEmp_('DOJ_AS_SOURCE'),
    PRESENT_DAYS: pslD_('PRESENT_DAYS'), EL_DAYS: pslD_('EL'), CL_DAYS: pslD_('CL'), SL_DAYS: pslD_('SL'),
    PH_DAYS: pslD_('PH_DAYS'), DAYS_PAYABLE: pslD_('WORKED_PAYABLE_DAYS'),
    BASIC_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.BASIC_RATE), HRA_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.HRA_RATE),
    CONVEYANCE_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.CONVEYANCE_RATE),
    EDUCATION_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.EDUCATION_RATE), WASHING_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.WASHING_RATE),
    BASIC: pslM_('BASIC'), HRA: pslM_('HRA'), CONVEYANCE: pslM_('CONVEYANCE'), EDUCATION: pslM_('EDUCATION'),
    WASHING: pslM_('WASHING'), ARREARS: pslM_('ARREARS'),
    OT_HOURS: pslD_('OT_HOURS'), OT_AMOUNT: pslM_('OT_AMOUNT'),
    DISPATCH_INCENTIVE: pslM_('DISPATCH_INCENTIVE'), OTHER_ALLOWANCE: pslM_('OTHER_ALLOWANCE'),
    GROSS_EARNINGS: pslM_('TOTAL_EARNINGS'),
    PF_EMPLOYEE: pslM_('PF_EMPLOYEE'), ESI_EMPLOYEE: pslM_('ESI_EMPLOYEE'), PROF_TAX: pslM_('PT'),
    MLWF: pslM_('MLWF'), SALARY_ADVANCE: pslM_('ADVANCE'), SOCIETY: pslM_('SOCIETY'), CANTEEN: pslM_('CANTEEN'),
    OTHER_DEDUCTION: pslM_('OTHER_DEDUCTION'), TOTAL_DEDUCTIONS: pslM_('TOTAL_DEDUCTIONS'),
    NET_PAY: pslM_('NET_PAY'),
    NET_PAY_WORDS: function (row) { return amountToIndianWords(Number(row.NET_PAY || 0)); }
  };
  PAYSLIP_BLANK_TOKENS.forEach(function (t) { m[t] = pslBlank_; });
  return m;
}

function pslExtend_(base, extra) { Object.keys(extra).forEach(function (k) { base[k] = extra[k]; }); return base; }

var PAYSLIP_TOKEN_MAP_STAFF = pslExtend_(pslCommonMap_(), {
  WEEKLY_OFF_DAYS: pslD_('WO_DAYS'),
  MEDICAL_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.MEDICAL_RATE), PRO_DEV_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.PRO_DEV_RATE),
  COMMUNICATION_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.COMMUNICATION_RATE),
  UNIFORM_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.UNIFORM_RATE),
  MEDICAL: pslM_('MEDICAL'), PRO_DEV: pslM_('PRO_DEV'), COMMUNICATION: pslM_('COMMUNICATION'),
  UNIFORM: pslM_('UNIFORM'), TDS: pslM_('TDS')
});

var PAYSLIP_TOKEN_MAP_WORKER = pslExtend_(pslCommonMap_(), {
  WORKING_DAYS: pslD_('WORKING_DAYS'),
  HEAT_ALLOWANCE_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.HEAT_ALLOWANCE_RATE),
  VDA_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.VDA_RATE),
  PRODUCTION_ALLOWANCE_RATE: pslRate_(PAYSLIP_RATE_COLUMNS.PRODUCTION_ALLOWANCE_RATE),
  HEAT_ALLOWANCE: pslM_('HEAT'), VDA: pslM_('VDA'), PRODUCTION_ALLOWANCE: pslM_('PRODUCTION_ALLOWANCE'),
  PRODUCTION_ALLOWANCE_OFFSET: pslM_('EFFICIENCY_DEDUCTION'), LEAVE_ENCASHMENT: pslM_('LEAVE_ENCASHMENT')
});

function payslipTokenMap(population) {
  if (population === POP.STAFF) return PAYSLIP_TOKEN_MAP_STAFF;
  if (population === POP.PERMANENT_WORKER) return PAYSLIP_TOKEN_MAP_WORKER;
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

/** {token: string} for every token of the population's map. Throws on non-numeric amounts. */
function buildReplacements(population, lockedRow, emp, salary) {
  var map = payslipTokenMap(population), out = {};
  Object.keys(map).forEach(function (t) {
    var d = map[t];
    var v = typeof d === 'function' ? d(lockedRow, emp || {}, salary || null) : (lockedRow[d] == null ? '' : lockedRow[d]);
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
  if (PAYSLIP_POPULATIONS.indexOf(population) < 0) {
    throw new Error('Payslips are only for STAFF and PERMANENT_WORKER (got "' + population + '")');
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
    return String(r.LOCK_ID).trim() === useLock && String(r.POPULATION).trim() === population;
  });
  if (!lockedRows.length) throw new Error('No PAYROLL_LOCKED rows for LOCK_ID ' + useLock);
  return { lockId: useLock, folderId: folderId, lockedRows: lockedRows };
}

function payslipSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function payslipTemplateId_(population) {
  var key = population === POP.STAFF ? 'PAYSLIP_TEMPLATE_STAFF_ID' : 'PAYSLIP_TEMPLATE_WORKER_ID';
  var id = String(getControl(key, '')).trim();
  if (!id) throw new Error(key + ' is blank in PAYROLL_CONTROL');
  return id;
}

function generateOnePayslip_(ctx, row, emp, salary) {
  var repl = buildReplacements(ctx.population, row, emp, salary);
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
      var res = generateOnePayslip_(ctx, row, master[id], salaryByEmp[id.trim()] || null);
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
    remaining: remaining, continuationScheduled: continuing };
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

// ===== 51_Email.gs =====
/**
 * 51_Email.gs - Stage 8: payslip email queue and gated sending.
 * Sending needs EMAIL_RELEASE_ENABLED=TRUE, EMAIL_RELEASE_<period>=TRUE and runner = ACCOUNTS_APPROVER_EMAIL.
 */
var EMAIL_QUOTA_RESERVE = 5;

function emailValid_(s) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s == null ? '' : s).trim()); }

function emailIsTrue_(v) { return v === true || (typeof v === 'string' && v.trim() === 'TRUE'); }

/** Pure gate. Returns {allowed, reasons[]}. */
function emailReleaseAllowed(controlMap, period, userEmail, accountsEmail) {
  var c = controlMap || {}, reasons = [];
  if (!emailIsTrue_(c.EMAIL_RELEASE_ENABLED)) reasons.push('EMAIL_RELEASE_ENABLED is not TRUE');
  if (!emailIsTrue_(c['EMAIL_RELEASE_' + period])) reasons.push('EMAIL_RELEASE_' + period + ' is not TRUE');
  var u = String(userEmail || '').trim().toLowerCase(), a = String(accountsEmail || '').trim().toLowerCase();
  if (!u || !a || u !== a) reasons.push('runner is not ACCOUNTS_APPROVER_EMAIL');
  return { allowed: reasons.length === 0, reasons: reasons };
}

/**
 * Pure. GENERATED register rows for lockId -> PAYSLIP_EMAIL_LOG rows to append (QUEUED, or SKIPPED for
 * blank/invalid email). Idempotent: an EMP_ID already in the log for lockId is skipped, except a previously
 * SKIPPED one whose email is now valid.
 */
function buildEmailQueue(registerRows, master, existingLog, lockId) {
  var emails = {};
  (master || []).forEach(function (m) { var id = String(m.EMP_ID).trim(); if (!(id in emails)) emails[id] = m.EMAIL_ID; });
  var logged = {};
  (existingLog || []).forEach(function (l) {
    if (String(l.LOCK_ID) !== lockId) return;
    var id = String(l.EMP_ID), st = String(l.STATUS);
    if (st !== 'SKIPPED') logged[id] = 'ACTIVE';
    else if (!logged[id]) logged[id] = 'SKIPPED';
  });
  var seen = {}, out = [];
  (registerRows || []).forEach(function (r) {
    if (String(r.LOCK_ID) !== lockId || String(r.STATUS) !== 'GENERATED') return;
    var id = String(r.EMP_ID);
    if (seen[id]) return;
    seen[id] = true;
    var to = String(emails[id] == null ? '' : emails[id]).trim();
    var valid = emailValid_(to);
    if (logged[id] === 'ACTIVE') return;
    if (logged[id] === 'SKIPPED' && !valid) return;
    out.push({ LOCK_ID: lockId, PERIOD: r.PERIOD, EMP_ID: id, TO_EMAIL: to, PDF_ID: r.PDF_ID,
      STATUS: valid ? 'QUEUED' : 'SKIPPED', ATTEMPTED_AT: '', ERROR: valid ? '' : 'blank or invalid EMAIL_ID' });
  });
  return out;
}

function emailSubject(period) { return 'Payslip – ' + payslipPeriodLabel(period) + ' – Varsha Forgings'; }

function emailBody_(period) {
  return 'Dear Employee,\n\nPlease find attached your payslip for ' + payslipPeriodLabel(period) +
    '.\n\nThis is a system-generated email from Varsha Forgings Pvt Ltd. For any query, contact HR.\n\nRegards,\nVarsha Forgings';
}

function queuePayslipEmailsOne_(period, population) {
  guardPeriod_(period);
  if (PAYSLIP_POPULATIONS.indexOf(population) < 0) throw new Error('Payslip emails are only for STAFF and PERMANENT_WORKER');
  var st = payslipLockId_(period, population);
  if (st.status !== PERIOD_STATUS.LOCKED) throw new Error(period + ' x ' + population + ' is not LOCKED - queue refused');
  if (!st.lockId) throw new Error('No LOCK_ID for ' + period + ' x ' + population);
  var register = readObjects(TABS.PAYSLIP_REGISTER).filter(function (r) { return String(r.POPULATION) === population; });
  var rows = buildEmailQueue(register, readObjects(TABS.EMPLOYEE_MASTER), readObjects(TABS.PAYSLIP_EMAIL_LOG), st.lockId);
  appendObjects(TABS.PAYSLIP_EMAIL_LOG, rows);
  var summary = { period: period, population: population, lockId: st.lockId,
    queued: rows.filter(function (r) { return r.STATUS === 'QUEUED'; }).length,
    skipped: rows.filter(function (r) { return r.STATUS === 'SKIPPED'; }).length };
  audit('PAYSLIP_EMAILS_QUEUED', period, population, summary);
  return summary;
}

function sendQueuedEmailsOne_(period, population) {
  guardPeriod_(period);
  if (PAYSLIP_POPULATIONS.indexOf(population) < 0) throw new Error('Payslip emails are only for STAFF and PERMANENT_WORKER');
  var control = readControlMap();
  var gate = emailReleaseAllowed(control, period, auditUser_(), control.ACCOUNTS_APPROVER_EMAIL);
  if (!gate.allowed) {
    audit('PAYSLIP_EMAIL_REFUSED', period, population, gate.reasons);
    throw new Error('Email release refused: ' + gate.reasons.join('; '));
  }
  var st = payslipLockId_(period, population);
  if (st.status !== PERIOD_STATUS.LOCKED || !st.lockId) throw new Error(period + ' x ' + population + ' is not LOCKED - send refused');
  var inPop = {};
  readObjects(TABS.PAYSLIP_REGISTER).forEach(function (r) {
    if (String(r.LOCK_ID) === st.lockId && String(r.POPULATION) === population) inPop[String(r.EMP_ID)] = true;
  });
  var queued = readObjects(TABS.PAYSLIP_EMAIL_LOG).filter(function (l) {
    return String(l.LOCK_ID) === st.lockId && String(l.STATUS) === 'QUEUED' && inPop[String(l.EMP_ID)];
  });
  var sent = 0, failed = 0, stoppedForQuota = false;
  for (var i = 0; i < queued.length; i++) {
    var l = queued[i];
    if (MailApp.getRemainingDailyQuota() <= EMAIL_QUOTA_RESERVE) { stoppedForQuota = true; break; }
    var upd;
    try {
      var blob = DriveApp.getFileById(String(l.PDF_ID)).getBlob();
      MailApp.sendEmail({ to: String(l.TO_EMAIL), subject: emailSubject(period), body: emailBody_(period),
        attachments: [blob], name: 'Varsha Forgings HR' });
      upd = { STATUS: 'SENT', ATTEMPTED_AT: nowIso_(), ERROR: '' };
      sent++;
    } catch (e) {
      upd = { STATUS: 'FAILED', ATTEMPTED_AT: nowIso_(), ERROR: String(e && e.message ? e.message : e) };
      failed++;
    }
    updateRows(TABS.PAYSLIP_EMAIL_LOG, [{ row: l._row, values: upd }]);
  }
  var summary = { period: period, population: population, lockId: st.lockId, sent: sent, failed: failed,
    remainingQueued: queued.length - sent - failed, stoppedForQuota: stoppedForQuota };
  audit('PAYSLIP_EMAILS_SENT', period, population, summary);
  return summary;
}

/** Menu passes only the period: with no population, handle each payslip population (errors reported per population). */
function emailEachPopulation_(fn, period, population) {
  if (population) return fn(period, population);
  var out = {};
  PAYSLIP_POPULATIONS.forEach(function (p) {
    try { out[p] = fn(period, p); } catch (e) { out[p] = { refused: String(e && e.message ? e.message : e) }; }
  });
  return out;
}

function queuePayslipEmails(period, population) { return emailEachPopulation_(queuePayslipEmailsOne_, period, population); }
function sendQueuedEmails(period, population) { return emailEachPopulation_(sendQueuedEmailsOne_, period, population); }

// ===== 90_Menu.gs =====
/**
 * 90_Menu.gs - "HR OS" menu (DESIGN section 4). Later-stage items go through callStage_ so the menu works now.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('HR OS')
    .addSubMenu(ui.createMenu('Setup')
      .addItem('Run setup (idempotent)', 'menuSetup')
      .addItem('Create attendance forms', 'menuCreateForms')
      .addItem('Refresh form rosters', 'menuRefreshRosters')
      .addItem('Install triggers', 'menuInstallTriggers'))
    .addSubMenu(ui.createMenu('Month')
      .addItem('Prepare month...', 'menuPrepareMonth')
      .addItem('Prepare monthly attendance (HR entry)', 'menuPrepareAttendance')
      .addItem('Generate monthly attendance from daily', 'menuGenerateAttendance')
      .addItem('Approve attendance (population)...', 'menuApproveAttendance')
      .addSeparator()
      .addItem('Sync OT', 'menuSyncOt')
      .addItem('Sync canteen', 'menuSyncCanteen')
      .addItem('Sync efficiency', 'menuSyncEfficiency')
      .addItem('Mark feed complete...', 'menuMarkFeed'))
    .addSubMenu(ui.createMenu('Payroll')
      .addItem('Check readiness', 'menuCheckReadiness')
      .addItem('Calculate draft', 'menuCalculateDraft')
      .addItem('HR approve (population)', 'menuHrApprove')
      .addItem('Accounts approve (population)', 'menuAccountsApprove')
      .addItem('Lock period (population)', 'menuLock')
      .addItem('Reopen (owner only, before lock)', 'menuReopen'))
    .addSubMenu(ui.createMenu('Payslips')
      .addItem('Generate payslips (locked only)', 'menuGeneratePayslips')
      .addItem('Queue emails', 'menuQueueEmails')
      .addItem('Send queued emails', 'menuSendEmails'))
    .addToUi();
}

function alert_(title, msg) { SpreadsheetApp.getUi().alert(title, String(msg), SpreadsheetApp.getUi().ButtonSet.OK); }

function ask_(title, prompt) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(title, prompt, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? String(r.getResponseText()).trim() : null;
}

function askPeriod_(title) {
  var p = ask_(title, 'PERIOD (YYYY-MM), minimum ' + HROS_MIN_PERIOD_FLOOR);
  if (p === null) return null;
  guardPeriod_(p);
  return p;
}

function askPopulation_(title) {
  var p = ask_(title, 'Population: ' + POPULATION_LIST.join(' / '));
  if (p === null) return null;
  p = p.toUpperCase();
  if (!isKnownPopulation(p)) throw new Error('Unknown population "' + p + '"');
  return p;
}

/** Run fn, show JSON result or error. */
function run_(title, fn) {
  try {
    var r = fn();
    if (r === null || r === undefined) return;
    alert_(title, typeof r === 'string' ? r : JSON.stringify(r, null, 2));
  } catch (e) {
    alert_(title + ' - refused', e && e.message ? e.message : e);
  }
}

/** Call a later-stage global function if it exists; else tell the user which stage delivers it. */
function callStage_(fnName, stage, args) {
  var g = (typeof globalThis !== 'undefined') ? globalThis : this;
  if (typeof g[fnName] !== 'function') return 'Not yet available (Stage ' + stage + ')';
  return g[fnName].apply(null, args || []);
}

function menuSetup() { run_('Setup', hrosSetup); }
function menuCreateForms() { run_('Create attendance forms', createAttendanceForms); }
function menuRefreshRosters() { run_('Refresh form rosters', refreshAttendanceFormRosters); }
/** Attendance-form triggers (needs the forms) and canteen/efficiency-form triggers (need their form IDs in PAYROLL_CONTROL). */
function menuInstallTriggers() {
  run_('Install triggers', function () {
    var out = {};
    try { out.attendance = installTriggers(); } catch (e) { out.attendance = 'skipped: ' + (e && e.message ? e.message : e); }
    out.canteenAndEfficiency = installFeedTriggers();
    return out;
  });
}

function menuPrepareMonth() { run_('Prepare month', function () { var p = askPeriod_('Prepare month'); return p && prepareMonth(p); }); }
function menuPrepareAttendance() { run_('Prepare monthly attendance', function () { var p = askPeriod_('Prepare monthly attendance'); return p && prepareMonthlyAttendance(p); }); }
function menuGenerateAttendance() { run_('Generate monthly attendance', function () { var p = askPeriod_('Generate monthly attendance'); return p && generateMonthlyAttendance(p); }); }
function menuApproveAttendance() {
  run_('Approve attendance', function () {
    var p = askPeriod_('Approve attendance'); if (!p) return null;
    var pop = askPopulation_('Approve attendance'); if (!pop) return null;
    return approveAttendance(p, pop);
  });
}
function menuMarkFeed() {
  run_('Mark feed complete', function () {
    var p = askPeriod_('Mark feed complete'); if (!p) return null;
    var f = ask_('Mark feed complete', 'Feed: ' + FEED_LIST.join(' / ')); if (!f) return null;
    return markFeedComplete(p, f);
  });
}

function menuSyncOt() { run_('Sync OT', function () { var p = askPeriod_('Sync OT'); return p && callStage_('syncOtFromForm', 2, [p]); }); }
function menuSyncCanteen() { run_('Sync canteen', function () { var p = askPeriod_('Sync canteen'); return p && callStage_('syncCanteenFromForm', 3, [p]); }); }
function menuSyncEfficiency() { run_('Sync efficiency', function () { var p = askPeriod_('Sync efficiency'); return p && callStage_('syncEfficiencyFromForm', 3, [p]); }); }

function menuCheckReadiness() { run_('Check readiness', function () { var p = askPeriod_('Check readiness'); return p && callStage_('checkReadiness', 4, [p]); }); }
function menuCalculateDraft() { run_('Calculate draft', function () { var p = askPeriod_('Calculate draft'); return p && callStage_('calculateDraft', 5, [p]); }); }
function popAction_(title, fnName, stage) {
  run_(title, function () {
    var p = askPeriod_(title); if (!p) return null;
    var pop = askPopulation_(title); if (!pop) return null;
    return callStage_(fnName, stage, [p, pop]);
  });
}
function menuHrApprove() { popAction_('HR approve', 'hrApprove', 6); }
function menuAccountsApprove() { popAction_('Accounts approve', 'accountsApprove', 6); }
function menuLock() { popAction_('Lock period', 'lockPeriod', 7); }
function menuReopen() { popAction_('Reopen', 'reopenPeriod', 6); }
function menuGeneratePayslips() { popAction_('Generate payslips', 'generatePayslips', 8); }
function menuQueueEmails() { run_('Queue emails', function () { var p = askPeriod_('Queue emails'); return p && callStage_('queuePayslipEmails', 8, [p]); }); }
function menuSendEmails() { run_('Send queued emails', function () { var p = askPeriod_('Send queued emails'); return p && callStage_('sendQueuedEmails', 8, [p]); }); }

// ===== 99_Audit.gs =====
/**
 * 99_Audit.gs - append-only audit trail into AUDIT_LOG using its existing header
 * (Timestamp, Module, Status, User, Message). Unknown headers get JSON in the last column.
 */
var AUDIT_MODULE = 'HROS';

/** Pure: map an audit entry onto a header list. Returns array aligned with headers. */
function buildAuditRow(headers, entry) {
  var known = {
    TIMESTAMP: entry.timestamp, MODULE: AUDIT_MODULE, STATUS: entry.action, USER: entry.user,
    MESSAGE: entry.message, ACTION: entry.action, PERIOD: entry.period, POPULATION: entry.population,
    DETAIL: entry.detail
  };
  var row = headers.map(function (h) {
    var k = String(h || '').trim().toUpperCase();
    return (k in known && known[k] != null) ? known[k] : '';
  });
  var hasMessage = headers.some(function (h) {
    var k = String(h || '').trim().toUpperCase();
    return k === 'MESSAGE' || k === 'DETAIL';
  });
  if (!hasMessage && headers.length) {
    row[headers.length - 1] = JSON.stringify({ action: entry.action, period: entry.period,
      population: entry.population, detail: entry.detail });
  }
  return row;
}

function auditUser_() {
  var u = '';
  try { u = Session.getActiveUser().getEmail(); } catch (e) { /* ignore */ }
  if (!u) { try { u = Session.getEffectiveUser().getEmail(); } catch (e2) { /* ignore */ } }
  return u || 'unknown';
}

function audit(action, period, population, detail) {
  var sheet = ensureSheet(TABS.AUDIT_LOG);
  var headers = getHeaders(sheet);
  if (!headers.length) {
    ensureHeaders(sheet, ['Timestamp', 'Module', 'Status', 'User', 'Message']);
    headers = getHeaders(sheet);
  }
  var d = detail == null ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  var msg = [action, period ? 'period=' + period : '', population ? 'pop=' + population : '', d]
    .filter(function (x) { return x; }).join(' | ');
  var row = buildAuditRow(headers, {
    timestamp: Utilities.formatDate(new Date(), HROS_TZ, 'yyyy-MM-dd HH:mm:ss'),
    action: action, period: period || '', population: population || '', detail: d, message: msg, user: auditUser_()
  });
  var start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, 1, headers.length).setValues([row]);
}
