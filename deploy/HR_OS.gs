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
  INPUT_LEAVE: 'INPUT_LEAVE',
  ATTENDANCE_COMPARISON: 'ATTENDANCE_COMPARISON',
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
  ATT_FORM_VFL_RAW: 'ATT_FORM_VFL_RAW',
  ATT_FORM_PUNE_RAW: 'ATT_FORM_PUNE_RAW',
  PAYROLL_CATEGORY_CONFIG: 'PAYROLL_CATEGORY_CONFIG',
  PAYROLL_SUPPLEMENTARY: 'PAYROLL_SUPPLEMENTARY',
  EMPLOYEE_STATUTORY_IDS: 'EMPLOYEE_STATUTORY_IDS',
  SALARY_STRUCTURE: 'SALARY_STRUCTURE',
  PAYROLL_RATE_PROFILE: 'PAYROLL_RATE_PROFILE'
};

var POP = {
  STAFF: 'STAFF',
  PERMANENT_WORKER: 'PERMANENT_WORKER',
  CONSULTANT: 'CONSULTANT',
  PUNE_STAFF: 'PUNE_STAFF'
};
/** Defaults used when the PAYROLL_CATEGORY_CONFIG tab is absent (or empty). With the tab, the configured ACTIVE rows rule. */
var POPULATION_LIST = ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'];
var SITE_VFL = 'VFL';
var SITE_PUNE = 'PUNE';

var DAILY_CODES = ['P', 'HD', 'A', 'WO', 'PH', 'EL', 'CL', 'SL', 'OD', 'COFF', 'LWP'];
var WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
var FEED_LIST = ['ATTENDANCE', 'CANTEEN', 'OT', 'EFFICIENCY', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'HOLIDAYS', 'LEAVE'];
var LEAVE_TYPES = ['EL', 'CL', 'SL', 'OD', 'COFF', 'LWP'];
/**
 * Exception codes that block a WHOLE population (global problems: working days, statutory / calculation config).
 * Every other calculation / feed problem is employee-level: severity HOLD (that employee is excluded from NET, the
 * approval hash and the lock, and the rest of the population continues).
 */
var GLOBAL_BLOCKER_CODES = ['INVALID_WORKING_DAYS', 'MISSING_STATUTORY_KEY', 'UNKNOWN_POPULATION',
  'MISSING_EFFICIENCY_CONFIG', 'MISSING_COMPONENT_PCT', 'UNKNOWN_PF_COMPONENT', 'LEAVE_SOURCE_UNREACHABLE'];
var ADJUSTMENT_TYPES = ['ARREARS', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT', 'OT_EXTRA_WORK',
  'PRODUCTION_INCENTIVE', 'TDS', 'OTHER_DEDUCTION', 'PENALTY', 'CANTEEN_EXTRA'];
var APPROVAL_STATUSES = ['PENDING', 'APPROVED'];

/** Legacy PAYROLL_PERIOD_CATEGORY.STATUS value HR sets after entering + approving the working days (sheet note). */
var LEGACY_WORKING_DAYS_APPROVED = 'APPROVED';

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

var DOJ_MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * 'd-Mon-yy' / 'd-Mon-yyyy' / 'd Mon yyyy' text (e.g. 5-Jun-05, 05-Jun-2005) -> ISO date, or '' when not that shape / not a
 * real date. Unambiguous (the month is a name). 2-digit years: > the current 2-digit year -> 19yy, else 20yy.
 */
function parseDojMonthText_(v) {
  var m = /^(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})\.?[\s\-\/.,]+(\d{2}|\d{4})$/.exec(String(v == null ? '' : v).trim());
  if (!m) return '';
  var mo = DOJ_MONTHS_.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
  if (mo < 1) return '';
  var d = +m[1], y = +m[3];
  if (m[3].length === 2) y = y > (new Date().getFullYear() % 100) ? 1900 + y : 2000 + y;
  if (d < 1 || d > 31) return '';
  var dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 ? y + '-' + pad2_(mo) + '-' + pad2_(d) : '';
}

/** DOJ cell -> ISO, DAY-FIRST for numeric text (dd/mm/yyyy); Date, ISO and d-Mon-yy(yy) exact. Unparseable -> ''. */
function parseDojDayFirst_(v) {
  if (v == null || v === '') return '';
  var iso = toIsoDate(v);
  if (iso) return iso;
  var s = String(v).trim();
  var mon = parseDojMonthText_(s);
  if (mon) return mon;
  var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (!m) return '';
  var d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  var dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 ? y + '-' + pad2_(mo) + '-' + pad2_(d) : '';
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

// ---------------------------------------------------------------- payroll categories (PAYROLL_CATEGORY_CONFIG)
// Adding a category = adding a row to PAYROLL_CATEGORY_CONFIG. Everything that used to iterate the four hard-coded
// populations (period rows, feeds, readiness, engine, approvals, lock, payslips, register, daily forms) iterates the
// configured ACTIVE categories. CALC_METHOD picks which of the four calculation functions is used.

var CATEGORY_CONFIG_HEADERS = ['CATEGORY_CODE', 'DISPLAY_NAME', 'CALC_METHOD', 'SITE', 'PAYSLIP', 'PAYSLIP_TEMPLATE_KEY',
  'RATE_SOURCE', 'ACTIVE', 'APPROVED_BY', 'APPROVED_AT'];
var CALC_METHODS = ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'];
var RATE_SOURCES = ['SALARY_STRUCTURE', 'RATE_PROFILE'];
var PAYSLIP_TEMPLATE_KEYS = ['STAFF', 'WORKER'];
/** Seed rows of PAYROLL_CATEGORY_CONFIG = the built-in defaults (APPROVED_BY blank: the owner signs them off once). */
var CATEGORY_DEFAULTS = [
  { CATEGORY_CODE: 'STAFF', DISPLAY_NAME: 'Staff', CALC_METHOD: 'STAFF', SITE: 'VFL', PAYSLIP: 'Y',
    PAYSLIP_TEMPLATE_KEY: 'STAFF', RATE_SOURCE: 'SALARY_STRUCTURE', ACTIVE: 'Y' },
  { CATEGORY_CODE: 'PERMANENT_WORKER', DISPLAY_NAME: 'Permanent worker', CALC_METHOD: 'PERMANENT_WORKER', SITE: 'VFL',
    PAYSLIP: 'Y', PAYSLIP_TEMPLATE_KEY: 'WORKER', RATE_SOURCE: 'SALARY_STRUCTURE', ACTIVE: 'Y' },
  { CATEGORY_CODE: 'CONSULTANT', DISPLAY_NAME: 'Consultant', CALC_METHOD: 'CONSULTANT', SITE: 'VFL', PAYSLIP: 'N',
    PAYSLIP_TEMPLATE_KEY: '', RATE_SOURCE: 'RATE_PROFILE', ACTIVE: 'Y' },
  { CATEGORY_CODE: 'PUNE_STAFF', DISPLAY_NAME: 'Pune staff', CALC_METHOD: 'PUNE_STAFF', SITE: 'PUNE', PAYSLIP: 'N',
    PAYSLIP_TEMPLATE_KEY: '', RATE_SOURCE: 'RATE_PROFILE', ACTIVE: 'Y' }
];
/** Population tab names of the four built-in categories; any other category writes to PAYROLL_<CODE>. */
var CATEGORY_TABS_DEFAULT = { STAFF: 'PAYROLL_STAFF', PERMANENT_WORKER: 'PAYROLL_WORKER', CONSULTANT: 'PAYROLL_CONSULTANT',
  PUNE_STAFF: 'PAYROLL_PUNE_STAFF' };

var HROS_CATEGORY_CACHE_ = null;

/** Forget the per-execution category cache (Apps Script runs each execution in a fresh scope; tests call this after editing the tab). */
function categoryConfigReset_() { HROS_CATEGORY_CACHE_ = null; }

function cat_yn_(v) { return String(v == null ? '' : v).trim().toUpperCase() === 'Y'; }

/** Pure: one PAYROLL_CATEGORY_CONFIG row object -> normalized entry (or null when the code is blank). */
function categoryEntryFromRow(r) {
  var code = String(r.CATEGORY_CODE == null ? '' : r.CATEGORY_CODE).trim();
  if (!code) return null;
  return { code: code, displayName: String(r.DISPLAY_NAME == null ? '' : r.DISPLAY_NAME).trim() || code,
    method: String(r.CALC_METHOD == null ? '' : r.CALC_METHOD).trim().toUpperCase(),
    site: String(r.SITE == null ? '' : r.SITE).trim().toUpperCase(),
    payslip: cat_yn_(r.PAYSLIP), templateKey: String(r.PAYSLIP_TEMPLATE_KEY == null ? '' : r.PAYSLIP_TEMPLATE_KEY).trim().toUpperCase(),
    rateSource: String(r.RATE_SOURCE == null ? '' : r.RATE_SOURCE).trim().toUpperCase() || 'SALARY_STRUCTURE',
    active: cat_yn_(r.ACTIVE), approvedBy: String(r.APPROVED_BY == null ? '' : r.APPROVED_BY).trim(), fromSheet: true };
}

/** Pure: problems in a category entry (used by the setup / approval and by tests). */
function categoryEntryProblems(e) {
  var out = [];
  if (CALC_METHODS.indexOf(e.method) < 0) out.push(e.code + ': CALC_METHOD must be one of ' + CALC_METHODS.join(', '));
  if (e.site !== SITE_VFL && e.site !== SITE_PUNE) out.push(e.code + ': SITE must be VFL or PUNE');
  if (RATE_SOURCES.indexOf(e.rateSource) < 0) out.push(e.code + ': RATE_SOURCE must be SALARY_STRUCTURE or RATE_PROFILE');
  if (e.payslip && PAYSLIP_TEMPLATE_KEYS.indexOf(e.templateKey) < 0) out.push(e.code + ': PAYSLIP=Y needs PAYSLIP_TEMPLATE_KEY STAFF or WORKER');
  return out;
}

function categoryDefaults_() {
  return CATEGORY_DEFAULTS.map(function (r) { var e = categoryEntryFromRow(r); e.fromSheet = false; return e; });
}

/**
 * All configured categories (active or not). Tab absent / empty / unreadable -> the built-in defaults (approved = true).
 * A first row with a blank CATEGORY_CODE is skipped; a duplicate code keeps the first row.
 */
function categoryConfigAll_() {
  if (HROS_CATEGORY_CACHE_) return HROS_CATEGORY_CACHE_;
  var list = null;
  try {
    var sheet = getSheet(TABS.PAYROLL_CATEGORY_CONFIG);
    if (sheet) {
      var rows = readObjects(sheet), seen = {};
      list = [];
      rows.forEach(function (r) {
        var e = categoryEntryFromRow(r);
        if (!e || seen[e.code]) return;
        seen[e.code] = true;
        list.push(e);
      });
      if (!list.length) list = null;
    }
  } catch (err) { list = null; }
  HROS_CATEGORY_CACHE_ = list || categoryDefaults_();
  return HROS_CATEGORY_CACHE_;
}

/** ACTIVE configured categories in configured order. */
function categoryList() { return categoryConfigAll_().filter(function (e) { return e.active; }); }

/** Codes of the ACTIVE categories (replaces the former hard-coded POPULATION_LIST). */
function populationList() { return categoryList().map(function (e) { return e.code; }); }

/** Config entry (active or not) of a category code, or null. */
function categoryEntry(code) {
  var all = categoryConfigAll_(), c = String(code == null ? '' : code).trim();
  for (var i = 0; i < all.length; i++) if (all[i].code === c) return all[i];
  return null;
}

/** True when the code is a configured category, active or not (an unconfigured one is UNKNOWN_CATEGORY). */
function isConfiguredCategory(code) { return !!categoryEntry(code); }

/** CALC_METHOD of a category ('' when the category is not configured). */
function categoryMethod(code) {
  var e = categoryEntry(code);
  return e ? e.method : '';
}

function isKnownPopulation(pop) { var e = categoryEntry(pop); return !!e && e.active; }

function siteForPopulation(pop) {
  var e = categoryEntry(pop);
  if (e && e.active && (e.site === SITE_VFL || e.site === SITE_PUNE)) return e.site;
  throw new Error('Unknown population "' + pop + '"');
}

/** Name of the population output tab (PAYROLL_STAFF ...; PAYROLL_<CODE> for a new category, max 100 chars). */
function populationTab(code) {
  var c = String(code == null ? '' : code).trim();
  return CATEGORY_TABS_DEFAULT[c] || ('PAYROLL_' + c).slice(0, 100);
}

/** Active categories that get a payslip (PAYSLIP = Y). */
function payslipPopulations() { return categoryList().filter(function (e) { return e.payslip; }).map(function (e) { return e.code; }); }

/** Codes of the ACTIVE categories of a site. */
function populationsOfSite(site) { return categoryList().filter(function (e) { return e.site === site; }).map(function (e) { return e.code; }); }

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
  var key = site === SITE_PUNE ? 'PUNE_WEEKLY_OFF' : 'VFL_WEEKLY_OFF';
  var v = String(getControl(key, 'SUN')).trim().toUpperCase();
  if (WEEKDAY_CODES.indexOf(v) < 0) throw new Error(key + ' must be one of ' + WEEKDAY_CODES.join(',') + ' (got "' + v + '")');
  return v;
}

/** Owner approver (approves attendance disputes). PAYROLL_CONTROL OWNER_APPROVER_EMAIL, seeded by setup. */
function getOwnerApproverEmail() { return String(getControl('OWNER_APPROVER_EMAIL', '')).trim(); }

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

/**
 * Which employees does a lock freeze? A LOCKED period x population freezes its employees EXCEPT the ones that were held in
 * the locked run and are not in PAYROLL_LOCKED yet: they can still be fixed (register, attendance approval, feeds) and paid
 * by a supplementary run. Returns {pops:{pop:true}, open:{EMP_ID_UPPERCASE:true}, isLocked(pop, empId)}.
 */
function lockScope_(period) {
  var st = getPeriodStatusMap(period), pops = {}, any = false;
  populationList().forEach(function (p) { if (st[p] === PERIOD_STATUS.LOCKED) { pops[p] = true; any = true; } });
  var open = {};
  if (any && getSheet(TABS.PAYROLL_DRAFT)) {
    var lockedIds = {};
    if (getSheet(TABS.PAYROLL_LOCKED)) {
      readObjects(TABS.PAYROLL_LOCKED).forEach(function (r) {
        if (normalizePeriod(r.PERIOD) === period) lockedIds[String(r.POPULATION).trim() + '|' + String(r.EMP_ID).trim().toUpperCase()] = true;
      });
    }
    readObjects(TABS.PAYROLL_DRAFT).forEach(function (r) {
      var pop = String(r.POPULATION == null ? '' : r.POPULATION).trim();
      if (normalizePeriod(r.PERIOD) !== period || !pops[pop]) return;
      if (String(r.RUN_ID == null ? '' : r.RUN_ID).indexOf('SUPP-') === 0) return;
      if (String(r.FLAGS == null ? '' : r.FLAGS).split(';').indexOf('HOLD') < 0) return;
      var id = String(r.EMP_ID).trim().toUpperCase();
      if (!lockedIds[pop + '|' + id]) open[id] = true;
    });
  }
  return { pops: pops, open: open, isLocked: function (pop, empId) {
    return !!pops[pop] && !open[String(empId == null ? '' : empId).trim().toUpperCase()];
  } };
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

/**
 * Protection that only the script owner (effective user) can edit through, plus the optional extra editors (approver
 * emails: a script run by a non-editor cannot write a protected tab). Never removes existing protections.
 */
function protectSheet(sheet, description, extraEditorEmails) {
  var protection = sheet.protect().setDescription(description || 'HR OS protected');
  try {
    var me = Session.getEffectiveUser();
    protection.addEditor(me);
    var keep = {};
    keep[String(me.getEmail()).toLowerCase()] = true;
    (extraEditorEmails || []).forEach(function (e) {
      var em = String(e == null ? '' : e).trim();
      if (!em) return;
      try { protection.addEditor(em); keep[em.toLowerCase()] = true; } catch (e1) { /* not a valid Google account: skip */ }
    });
    var editors = protection.getEditors();
    for (var i = 0; i < editors.length; i++) {
      if (!keep[String(editors[i].getEmail()).toLowerCase()]) protection.removeEditor(editors[i]);
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
 * 02_Setup.gs - idempotent setup (DESIGN section 2). Builds EVERY tab the code uses (exact headers, validations, hidden /
 * protected state, tab order) on a spreadsheet that holds only the Google-Form response tabs plus the imported tabs.
 * Adds only: missing tabs, missing headers (to the right), missing config keys, seed rows, data validation. Never deletes,
 * clears or renames a tab or a row; the only thing it does to existing tabs is to move them into the standard order.
 */
var HROS_DEFAULT_EFFECTIVE_FROM = '2026-09';

var HROS_PERIOD_CATEGORY_HEADERS = ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE',
  'DRAFT_RUN_ID', 'DRAFT_HASH', 'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'];
var HROS_STATUTORY_HEADERS = ['KEY', 'VALUE', 'NOTE', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'VERSION', 'APPROVED_BY', 'APPROVED_AT'];
var HROS_EFFICIENCY_HEADERS = ['EFFICIENCY_PERCENT_EXACT', 'INCENTIVE_SLAB_INR', 'BASIS', 'SOURCE', 'IMPLEMENTATION_STATE', 'NOTE'];
var HROS_EMPLOYEE_MASTER_HEADERS = ['EMP_ID', 'EMPLOYEE_NAME', 'EMAIL_ID', 'DOJ_AS_SOURCE', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE',
  'DEPARTMENT', 'DESIGNATION', 'PLANT_TO_VERIFY', 'MANAGER_EMAIL_TO_VERIFY', 'STATUTORY_PROFILE_TO_VERIFY', 'SOURCE_RECORD_KEY',
  'SOURCE_TAB', 'SOURCE_ROW', 'DUPLICATE_FLAG', 'VALIDATION_STATE', 'SOURCE_SNAPSHOT_DATE', 'HR_SIGNOFF_BY', 'HR_SIGNOFF_AT',
  'REVIEW_NOTE', 'LAST_WORKING_DAY'];
var HROS_SALARY_STRUCTURE_HEADERS = ['EMP_ID', 'PAYROLL_CATEGORY', 'SOURCE_PAYROLL_MONTH', 'EFFECTIVE_FROM', 'EFFECTIVE_TO',
  'EMPLOYMENT_STATUS_AT_SOURCE', 'BASIC_PM_INR', 'HRA_PM_INR', 'CONVEYANCE_PM_INR', 'EDUCATION_PM_INR', 'MEDICAL_PM_INR',
  'PRO_DEV_PM_INR', 'COMMUNICATION_PM_INR', 'UNIFORM_PM_INR', 'WASHING_PM_INR', 'HEAT_MASTER_INR', 'VDA_MASTER_INR',
  'PRODUCTION_MASTER_INR', 'FIXED_GROSS_PM_AS_SOURCE_INR', 'CTC_PA_AS_SOURCE_INR', 'CTC_PM_AS_SOURCE_INR', 'SOURCE_TAB',
  'SOURCE_ROW', 'SOURCE_ROW_KEY', 'VERSION_STATE', 'HR_APPROVED_BY', 'HR_APPROVED_AT', 'VALIDATION_NOTE'];
var HROS_RATE_PROFILE_HEADERS = ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR',
  'ATTENDANCE_REQUIRED', 'WORKING_DAYS_REQUIRED', 'PRESENT_DAYS_REQUIRED', 'WORKED_DAYS_REQUIRED', 'OT_METHOD', 'BASELINE_MONTH',
  'SOURCE_MONTH', 'SOURCE_USAGE', 'SOURCE_SPREADSHEET_ID', 'SOURCE_SHEET', 'SOURCE_ROW', 'VERSION_STATE', 'NOTE',
  'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'HR_APPROVED_BY', 'HR_APPROVED_AT'];
/** The ONLY place sensitive identity values live: hidden + protected (HR / owner edit). */
var HROS_STATUTORY_ID_HEADERS = ['EMP_ID', 'UAN', 'ESI_NO', 'PAN', 'BANK_NAME', 'BANK_ACCOUNT', 'IFSC'];
var HROS_INPUT_OT_HEADERS = ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'APPROVAL_STATUS', 'ENTERED_AT', 'SOURCE_CASE_NOS',
  'SOURCE_EVENT_COUNT', 'DATE_RANGE', 'OT_KEY', 'OT_DATE', 'SOURCE_ROW', 'NORMALIZER_VERSION', 'ELIGIBILITY', 'EXCEPTION_REASON'];
var HROS_INPUT_CANTEEN_HEADERS = ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS'];
var HROS_INPUT_EFFICIENCY_HEADERS = ['PAYROLL_MONTH', 'EMP_ID', 'EFFICIENCY_PCT', 'PHYSICAL_PRESENT_DAYS_OVERRIDE', 'SOURCE',
  'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS'];
var HROS_INPUT_ADVANCE_HEADERS = ['PAYROLL_MONTH', 'EMP_ID', 'EMPLOYEE_NAME_DISPLAY', 'ADVANCE_TYPE', 'ADVANCE_DATE',
  'ORIGINAL_ADVANCE_INR', 'OPENING_BALANCE_INR', 'RECOVERY_THIS_MONTH_INR', 'CLOSING_BALANCE_INR', 'ACCOUNTS_LEDGER_REFERENCE',
  'SOURCE_BATCH_ID', 'APPROVAL_STATUS', 'APPROVED_BY', 'ENTERED_AT', 'REMARKS'];
var HROS_INPUT_SOCIETY_HEADERS = ['PAYROLL_MONTH', 'EMP_ID', 'EMPLOYEE_NAME_DISPLAY', 'SOCIETY_NAME', 'LOAN_REFERENCE',
  'GENERAL_EMI_INR', 'EMERGENCY_EMI_INR', 'EDUCATION_EMI_INR', 'SHARES_OTHER_INR', 'TOTAL_RECOVERY_INR', 'OUTSTANDING_BALANCE_INR',
  'APPROVAL_STATUS', 'SOURCE_BATCH_ID', 'REMARKS'];
var HROS_INPUT_ADJUSTMENTS_HEADERS = ['ENTRY_ID', 'PAYROLL_MONTH', 'EMP_ID', 'EMPLOYEE_NAME_DISPLAY', 'ADJUSTMENT_TYPE',
  'SIGNED_AMOUNT_INR', 'REASON', 'SOURCE_REFERENCE', 'APPROVAL_STATUS', 'APPROVED_BY', 'APPROVED_AT', 'REVERSAL_OF_ENTRY_ID',
  'ENTERED_BY', 'ENTERED_AT'];
var HROS_INPUT_LEAVE_HEADERS = ['PAYROLL_MONTH', 'EMP_ID', 'LEAVE_TYPE', 'DAYS', 'FROM_DATE', 'TO_DATE', 'SOURCE_REF', 'CASE_NO',
  'KEY', 'STATUS', 'EXCEPTION_REASON', 'NORMALIZER_VERSION', 'ENTERED_AT'];
var HROS_INPUT_ATTENDANCE_HEADERS = ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'WEEK_OFF', 'PH',
  'EL_AVAILED', 'CL_AVAILED', 'SL_AVAILED', 'PAID_LEAVE_OTHER', 'WORKED_DAYS', 'PAYABLE_DAYS', 'APPROVAL_STATUS', 'APPROVED_BY',
  'SOURCE_REF', 'ENTERED_AT', 'REMARKS', 'PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS', 'GENERATED_VALUES_JSON', 'HR_OVERRIDE',
  'OVERRIDE_REASON', 'ROW_KEY', 'REGISTER_DAYS_PRESENT', 'REGISTER_INCLUDES_WO', 'ENTERED_BY'];
var HROS_ATTENDANCE_DAILY_HEADERS = ['PERIOD', 'DATE', 'SITE', 'EMP_ID', 'CODE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS',
  'REJECT_REASON', 'ENTERED_AT'];
var HROS_COMPARISON_HEADERS = ['PERIOD', 'EMP_ID', 'NAME', 'POPULATION', 'DAILY_PRESENT', 'REGISTER_PRESENT', 'DIFF', 'STATUS',
  'HR_DECIDED_DAYS', 'HR_REASON', 'HR_BY', 'HR_AT', 'OWNER_DECISION', 'OWNER_BY', 'OWNER_AT', 'HR_STAMPED_DAYS'];
var HROS_READINESS_HEADERS = ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL', 'CHECKED_AT'];
var HROS_EXCEPTION_HEADERS = ['RUN_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'SEVERITY', 'CODE', 'MESSAGE'];
var HROS_RECON_HEADERS = ['PERIOD', 'POPULATION', 'HEADCOUNT', 'TOTAL_GROSS', 'TOTAL_DEDUCTIONS', 'TOTAL_NET', 'PREV_PERIOD_NET',
  'DELTA_PCT', 'RUN_ID'];
/** Supplementary (top-up) run of released employees: one row per SUPP_ID (42_Supplementary.gs). */
var HROS_SUPPLEMENTARY_HEADERS = ['PERIOD', 'POPULATION', 'SUPP_ID', 'EMP_IDS', 'HASH', 'STATUS', 'CREATED_BY', 'CREATED_AT',
  'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCK_ID', 'LOCKED_AT'];
var HROS_SUPP_STATUSES = ['DRAFT', 'HR_APPROVED', 'ACCOUNTS_APPROVED', 'LOCKED', 'SUPERSEDED'];
var HROS_PAYSLIP_REGISTER_HEADERS = ['LOCK_ID', 'PERIOD', 'EMP_ID', 'POPULATION', 'DOC_ID', 'PDF_ID', 'PDF_URL', 'GENERATED_AT', 'STATUS'];
var HROS_EMAIL_LOG_HEADERS = ['LOCK_ID', 'PERIOD', 'EMP_ID', 'TO_EMAIL', 'PDF_ID', 'STATUS', 'ATTEMPTED_AT', 'ERROR'];
var HROS_AUDIT_HEADERS = ['Timestamp', 'Module', 'Status', 'User', 'Message'];

/** Form-response tabs created by Google Forms / code: never created here, only placed in the tab order when present. */
var HROS_FORM_TABS_INPUT = ['OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'];
var HROS_FORM_TABS_ATTENDANCE = ['ATT_FORM_VFL_RAW', 'ATT_FORM_PUNE_RAW'];

/**
 * The tab registry, in tab order: Control -> Config -> Masters -> Monthly inputs -> Attendance -> Readiness / Payroll ->
 * Payslips -> Audit. {name, group, headers, hidden, protect: [control keys of the extra editors], validations: [[column, list]]}.
 * A function (not a var) so it can read constants of files that load later.
 */
function hrosTabSpecs_() {
  var yn = ['Y', 'N'];
  var specs = [
    { name: TABS.PAYROLL_CONTROL, group: 'Control', headers: ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'] },
    { name: TABS.PAYROLL_PERIOD_CATEGORY, group: 'Control', headers: HROS_PERIOD_CATEGORY_HEADERS },
    { name: TABS.FEED_STATUS, group: 'Control', headers: ['PERIOD', 'FEED', 'STATUS', 'MARKED_BY', 'MARKED_AT', 'NOTE'],
      validations: [['STATUS', ['OPEN', 'COMPLETE']]] },
    { name: TABS.PAYROLL_CATEGORY_CONFIG, group: 'Config', headers: CATEGORY_CONFIG_HEADERS,
      validations: [['CALC_METHOD', CALC_METHODS], ['SITE', [SITE_VFL, SITE_PUNE]], ['PAYSLIP', yn],
        ['PAYSLIP_TEMPLATE_KEY', PAYSLIP_TEMPLATE_KEYS], ['RATE_SOURCE', RATE_SOURCES], ['ACTIVE', yn]] },
    { name: TABS.STATUTORY_CONFIG, group: 'Config', headers: HROS_STATUTORY_HEADERS },
    { name: TABS.EFFICIENCY_CONFIG, group: 'Config', headers: HROS_EFFICIENCY_HEADERS },
    { name: TABS.PT_EXEMPTIONS, group: 'Config', headers: ['EMP_ID', 'REASON', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'APPROVED_BY'] },
    { name: TABS.HOLIDAY_CALENDAR, group: 'Config', headers: ['DATE', 'SITE', 'HOLIDAY_NAME', 'PAID'],
      validations: [['SITE', ['VFL', 'PUNE', 'ALL']], ['PAID', yn]] },
    { name: TABS.EMPLOYEE_MASTER, group: 'Masters', headers: HROS_EMPLOYEE_MASTER_HEADERS },
    { name: TABS.SALARY_STRUCTURE, group: 'Masters', headers: HROS_SALARY_STRUCTURE_HEADERS },
    { name: TABS.PAYROLL_RATE_PROFILE, group: 'Masters', headers: HROS_RATE_PROFILE_HEADERS },
    { name: TABS.EMPLOYEE_STATUTORY_IDS, group: 'Masters', headers: HROS_STATUTORY_ID_HEADERS, hidden: true,
      protect: ['HR_APPROVER_EMAIL', 'OWNER_APPROVER_EMAIL'] },
    { name: TABS.INPUT_OT, group: 'Monthly inputs', headers: HROS_INPUT_OT_HEADERS },
    { name: TABS.INPUT_CANTEEN, group: 'Monthly inputs', headers: HROS_INPUT_CANTEEN_HEADERS },
    { name: TABS.INPUT_EFFICIENCY, group: 'Monthly inputs', headers: HROS_INPUT_EFFICIENCY_HEADERS },
    { name: TABS.INPUT_ADVANCE, group: 'Monthly inputs', headers: HROS_INPUT_ADVANCE_HEADERS,
      validations: [['APPROVAL_STATUS', APPROVAL_STATUSES]] },
    { name: TABS.INPUT_SOCIETY, group: 'Monthly inputs', headers: HROS_INPUT_SOCIETY_HEADERS,
      validations: [['APPROVAL_STATUS', APPROVAL_STATUSES]] },
    { name: TABS.INPUT_ADJUSTMENTS, group: 'Monthly inputs', headers: HROS_INPUT_ADJUSTMENTS_HEADERS,
      validations: [['ADJUSTMENT_TYPE', ADJUSTMENT_TYPES], ['APPROVAL_STATUS', APPROVAL_STATUSES]] },
    { name: TABS.INPUT_LEAVE, group: 'Monthly inputs', headers: HROS_INPUT_LEAVE_HEADERS },
    { name: TABS.ATTENDANCE_DAILY, group: 'Attendance', headers: HROS_ATTENDANCE_DAILY_HEADERS },
    { name: TABS.INPUT_ATTENDANCE, group: 'Attendance', headers: HROS_INPUT_ATTENDANCE_HEADERS,
      validations: [['APPROVAL_STATUS', APPROVAL_STATUSES]] },
    { name: TABS.ATTENDANCE_COMPARISON, group: 'Attendance', headers: HROS_COMPARISON_HEADERS,
      validations: [['OWNER_DECISION', ['APPROVED', 'REJECTED']]] },
    { name: TABS.PAYROLL_READINESS, group: 'Payroll', headers: HROS_READINESS_HEADERS },
    { name: TABS.PAYROLL_DRAFT, group: 'Payroll', headers: HROS_OUTPUT_COLUMNS }
  ];
  var seen = {};
  populationList().forEach(function (code) {
    var tab = populationTab(code);
    if (seen[tab]) return;
    seen[tab] = true;
    specs.push({ name: tab, group: 'Payroll', headers: HROS_OUTPUT_COLUMNS });
  });
  specs.push({ name: TABS.PAYROLL_EXCEPTIONS, group: 'Payroll', headers: HROS_EXCEPTION_HEADERS });
  specs.push({ name: TABS.PAYROLL_RECON, group: 'Payroll', headers: HROS_RECON_HEADERS });
  specs.push({ name: TABS.PAYROLL_SUPPLEMENTARY, group: 'Payroll', headers: HROS_SUPPLEMENTARY_HEADERS,
    validations: [['STATUS', HROS_SUPP_STATUSES]] });
  specs.push({ name: TABS.PAYROLL_LOCKED, group: 'Payroll', headers: ['LOCK_ID'].concat(HROS_OUTPUT_COLUMNS), hidden: true,
    protect: ['ACCOUNTS_APPROVER_EMAIL', 'OWNER_APPROVER_EMAIL'] });
  specs.push({ name: TABS.PAYSLIP_REGISTER, group: 'Payslips', headers: HROS_PAYSLIP_REGISTER_HEADERS });
  specs.push({ name: TABS.PAYSLIP_EMAIL_LOG, group: 'Payslips', headers: HROS_EMAIL_LOG_HEADERS });
  specs.push({ name: TABS.AUDIT_LOG, group: 'Audit', headers: HROS_AUDIT_HEADERS });
  return specs;
}

/** Tab names in the standard order, with the form-response tabs that exist slotted next to what they feed. */
function hrosTabOrder_(existingNames, otTab) {
  var have = {};
  existingNames.forEach(function (n) { have[n] = true; });
  var out = [];
  hrosTabSpecs_().forEach(function (sp) {
    if (sp.name === TABS.ATTENDANCE_DAILY) {
      HROS_FORM_TABS_ATTENDANCE.forEach(function (n) { if (have[n] && out.indexOf(n) < 0) out.push(n); });
    }
    if (sp.name === TABS.INPUT_ATTENDANCE) {
      var forms = HROS_FORM_TABS_INPUT.concat(otTab ? [otTab] : []);
      forms.forEach(function (n) { if (have[n] && out.indexOf(n) < 0) out.push(n); });
    }
    out.push(sp.name);
  });
  return out;
}

var HROS_CONTROL_DEFAULTS = [
  ['HR_APPROVER_EMAIL', 'hr@varshaforgings.com', 'HR approver (state machine)'],
  ['ACCOUNTS_APPROVER_EMAIL', 'accounts@varshaforgings.com', 'Accounts approver (state machine)'],
  ['MIN_PERIOD', '2026-09', 'Earliest period any write path accepts'],
  ['PAYSLIP_TEMPLATE_STAFF_ID', '1T7kwVNmOczXk4_-4OstofWOPSWGuEQxg7hKFo-Jci_w', 'Staff payslip template Doc'],
  ['PAYSLIP_TEMPLATE_WORKER_ID', '1MSmi8qVRL8SI8-svVihasYbLFGNo8Xkzko4VUaIX8SU', 'Worker payslip template Doc'],
  ['PAYSLIP_FOLDER_ID', '', 'Blank = payslip step blocked'],
  ['EMAIL_RELEASE_ENABLED', 'FALSE', 'Payslip email release switch'],
  ['VFL_WEEKLY_OFF', 'SUN', 'Weekly off used to default blank attendance'],
  ['PUNE_WEEKLY_OFF', 'SUN', 'Weekly off used to default blank attendance'],
  ['OT_SOURCE_SPREADSHEET_ID', '', 'Blank = read the OT form responses from a local tab of this spreadsheet; set only to read an external response spreadsheet'],
  ['OT_SOURCE_TAB', 'OT_FORM_RESPONSES', 'OT form-response tab (local; falls back to Overtime_Form if absent). With an external ID: the tab there (default Form Responses 1)'],
  ['OT_WINDOW_START_2026-09', '2026-08-26', 'one-time catch-up: Aug salary paid OT to 25-Aug'],
  ['LEAVE_WINDOW_START_2026-09', '2026-08-26', 'one-time catch-up: Aug payroll counted leave to 25-Aug; default leave window = calendar month'],
  ['OWNER_APPROVER_EMAIL', 'yash.munot@gmail.com', 'confirm owner email (owner approval of attendance disputes)'],
  ['REGISTER_ENTRY_EMAILS', '', 'Extra people (comma separated) who may submit the monthly attendance register; HR_APPROVER_EMAIL and OWNER_APPROVER_EMAIL always may'],
  ['LEAVE_SOURCE_SPREADSHEET_ID', '1pwVE0XKqAhAKHbyqtlF9GzfuGnidnZuw2zKbtMjUz9Q', 'Leave application spreadsheet (read-only; give the script runner view access). Blank = read a local tab of this spreadsheet'],
  ['LEAVE_SOURCE_TAB', 'Leave_Applications', 'Leave form-response tab in the leave spreadsheet (or the local tab when the ID is blank)']
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

/** Move the tabs that exist into the standard order (moves only; nothing is deleted, cleared or renamed). Returns notes. */
function hrosOrderTabs_(ss, order) {
  var notes = [];
  try {
    if (typeof ss.setActiveSheet !== 'function' || typeof ss.moveActiveSheet !== 'function') return ['tab order not supported'];
    var current = ss.getSheets().map(function (s) { return s.getName(); });
    var want = order.filter(function (n) { return current.indexOf(n) >= 0; });
    for (var i = 0; i < want.length; i++) {
      if (current[i] === want[i]) continue;
      ss.setActiveSheet(ss.getSheetByName(want[i]));
      ss.moveActiveSheet(i + 1);
      current.splice(current.indexOf(want[i]), 1);
      current.splice(i, 0, want[i]);
    }
  } catch (e) { notes.push('tab order: ' + String(e && e.message ? e.message : e)); }
  return notes;
}

/**
 * One-time, idempotent relabel of the plant site to VFL (Waluj); safe to run when nothing needs migrating. Called first by hrosSetup.
 * Returns the list of changes made ([] when there was nothing to do). Never deletes response data.
 */
function hrosMigrateSiteToVfl() {
  var changes = [];
  var ss = getSpreadsheet_();
  var OLD_SITE = 'NASHIK', OLD_WEEKLY_OFF_KEY = 'NASHIK_WEEKLY_OFF', OLD_FORM_ID_KEY = 'ATT_FORM_NASHIK_ID';
  var OLD_RAW_TAB = 'ATT_FORM_NASHIK_RAW', OLD_KEPT_TAB = 'ATT_FORM_NASHIK_OLD';

  // 1. SITE cells (a pure relabel: APPROVED_BY / APPROVED_AT are untouched, so the category approval stays valid)
  [TABS.PAYROLL_CATEGORY_CONFIG, TABS.HOLIDAY_CALENDAR].forEach(function (tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh) return;
    var ups = [];
    readObjects(sh).forEach(function (r) {
      if (String(r.SITE == null ? '' : r.SITE).trim().toUpperCase() === OLD_SITE) ups.push({ row: r._row, values: { SITE: SITE_VFL } });
    });
    if (ups.length) {
      updateRows(sh, ups);
      changes.push(tab + ': SITE ' + OLD_SITE + ' -> ' + SITE_VFL + ' on ' + ups.length + ' row(s)');
    }
  });
  categoryConfigReset_();

  // 2. control keys
  var ctl = ss.getSheetByName(TABS.PAYROLL_CONTROL);
  if (ctl) {
    var rows = readObjects(ctl);
    var keyOf = function (r) { return String(r.KEY == null ? '' : r.KEY).trim(); };
    var hasNew = rows.some(function (r) { return keyOf(r) === 'VFL_WEEKLY_OFF'; });
    var toDelete = [];
    rows.forEach(function (r) {
      var k = keyOf(r);
      if (k === OLD_WEEKLY_OFF_KEY) {
        if (hasNew) { toDelete.push(r._row); changes.push('PAYROLL_CONTROL: removed ' + OLD_WEEKLY_OFF_KEY + ' (VFL_WEEKLY_OFF already present)'); }
        else {
          updateRows(ctl, [{ row: r._row, values: { KEY: 'VFL_WEEKLY_OFF' } }]);
          hasNew = true;
          changes.push('PAYROLL_CONTROL: renamed ' + OLD_WEEKLY_OFF_KEY + ' -> VFL_WEEKLY_OFF (value kept)');
        }
      } else if (k === OLD_FORM_ID_KEY) {
        toDelete.push(r._row);
        changes.push('PAYROLL_CONTROL: removed ' + OLD_FORM_ID_KEY + ' (the old form is retired; the new one gets ATT_FORM_VFL_ID)');
      }
    });
    toDelete.sort(function (a, b) { return b - a; }).forEach(function (n) { ctl.deleteRow(n); });
  }

  // 3. the old form-response tab: unlink the form, delete when it holds no responses, otherwise keep it under a new name
  var raw = ss.getSheetByName(OLD_RAW_TAB);
  if (raw) {
    try {
      var url = raw.getFormUrl();
      if (url) {
        FormApp.openByUrl(url).removeDestination();
        changes.push(OLD_RAW_TAB + ': form unlinked');
      }
    } catch (e) { changes.push(OLD_RAW_TAB + ': could not unlink form (' + String(e && e.message ? e.message : e) + ')'); }
    if (raw.getLastRow() <= 1) {
      ss.deleteSheet(raw);
      changes.push(OLD_RAW_TAB + ': empty tab deleted');
    } else if (ss.getSheetByName(OLD_KEPT_TAB)) {
      changes.push(OLD_RAW_TAB + ': has responses but ' + OLD_KEPT_TAB + ' already exists; left as is, rename it by hand');
    } else {
      raw.setName(OLD_KEPT_TAB);
      changes.push(OLD_RAW_TAB + ': has responses, renamed to ' + OLD_KEPT_TAB + ' (kept)');
    }
  }
  return changes;
}

function hrosSetup() {
  var log = { createdTabs: [], headersWritten: [], columnsAdded: {}, keysAdded: {}, ptSeeded: [], categoriesSeeded: [], validations: [],
    hidden: [], protectedTabs: [], notes: [], siteMigration: [] };
  var ss = getSpreadsheet_();
  log.siteMigration = hrosMigrateSiteToVfl();
  var specs = hrosTabSpecs_();

  // 1. every tab of the registry: create when missing, write / complete the header (columns are only appended on the right)
  specs.forEach(function (sp) {
    var existed = !!ss.getSheetByName(sp.name);
    var sheet = ensureSheet(sp.name);
    if (!existed) log.createdTabs.push(sp.name);
    var r = ensureHeaders(sheet, sp.headers);
    if (r.written.length) log.headersWritten.push(sp.name);
    if (r.added.length) log.columnsAdded[sp.name] = r.added;
  });

  // 2. control keys
  log.keysAdded.PAYROLL_CONTROL = addMissingKeys_(TABS.PAYROLL_CONTROL, HROS_CONTROL_DEFAULTS, function (o) {
    o.UPDATED_AT = nowIso_();
  });

  // 3. statutory config: version existing rows, then add missing keys
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

  // 4. PT exemptions seed
  var pt = ensureSheet(TABS.PT_EXEMPTIONS);
  var haveEmp = {};
  readObjects(pt).forEach(function (r) { haveEmp[String(r.EMP_ID).trim()] = true; });
  var seed = HROS_PT_EXEMPTION_SEED.filter(function (id) { return !haveEmp[id]; }).map(function (id) {
    return { EMP_ID: id, REASON: 'carried from Aug worker template R17', EFFECTIVE_FROM: HROS_DEFAULT_EFFECTIVE_FROM,
      EFFECTIVE_TO: '', APPROVED_BY: 'SETUP_SEED' };
  });
  appendObjects(pt, seed);
  log.ptSeeded = seed.map(function (s) { return s.EMP_ID; });

  // 5. category config: seed the four built-in categories when the tab has no rows (APPROVED_BY blank: the owner signs off)
  var cc = ensureSheet(TABS.PAYROLL_CATEGORY_CONFIG);
  if (!readObjects(cc).length) {
    appendObjects(cc, CATEGORY_DEFAULTS.map(function (r) { return Object.assign({}, r); }));
    log.categoriesSeeded = CATEGORY_DEFAULTS.map(function (r) { return r.CATEGORY_CODE; });
  }
  categoryConfigReset_();

  // 6. data validation
  specs.forEach(function (sp) {
    (sp.validations || []).forEach(function (v) {
      setListValidation(ensureSheet(sp.name), v[0], v[1]);
      log.validations.push(sp.name + '.' + v[0]);
    });
  });

  // 7. protect the append-only ledger and the statutory-ID tab (idempotent); the extra editors are the approvers who write
  //    through the menu (a script run by a non-editor cannot write a protected tab)
  var ctl = readControlMap();
  specs.forEach(function (sp) {
    if (!sp.protect) return;
    var sheet = ensureSheet(sp.name);
    if (!isSheetProtected(sheet)) {
      var emails = sp.protect.map(function (k) { return String(ctl[k] == null ? '' : ctl[k]).trim(); }).filter(function (e) { return e; });
      protectSheet(sheet, sp.name + ' (HR OS: append-only / restricted)', emails);
      log.protectedTabs.push(sp.name);
    }
  });

  // 7b. remove the placeholder tab left by the clean-up script (only if it exists, is empty and is not the last tab)
  try {
    var tmp = ss.getSheetByName('_TEMP');
    if (tmp && ss.getSheets().length > 1 && tmp.getLastRow() <= 1 && tmp.getLastColumn() <= 1 && typeof ss.deleteSheet === 'function') {
      ss.deleteSheet(tmp);
      log.notes.push('removed empty _TEMP tab');
    }
  } catch (e3) { log.notes.push('could not remove _TEMP: ' + String(e3 && e3.message ? e3.message : e3)); }

  // 8. tab order, then hide the sensitive tabs (the first tab is activated so no hidden tab is the active one)
  var otTab = String(ctl.OT_SOURCE_TAB || '').trim();
  log.notes = log.notes.concat(hrosOrderTabs_(ss, hrosTabOrder_(ss.getSheets().map(function (s) { return s.getName(); }), otTab)));
  try {
    if (typeof ss.setActiveSheet === 'function') ss.setActiveSheet(ss.getSheetByName(TABS.PAYROLL_CONTROL));
  } catch (e) { /* ignore */ }
  specs.forEach(function (sp) {
    if (!sp.hidden) return;
    var sheet = ensureSheet(sp.name);
    try {
      if (typeof sheet.hideSheet === 'function') { sheet.hideSheet(); log.hidden.push(sp.name); }
    } catch (e2) { log.notes.push('could not hide ' + sp.name + ': ' + String(e2 && e2.message ? e2.message : e2)); }
  });

  audit('SETUP', '', '', log);
  return log;
}

/** Insert one PAYROLL_PERIOD_CATEGORY row per ACTIVE category and the FEED_STATUS rows for a period if absent. */
function prepareMonth(period) {
  guardPeriod_(period);
  var ppc = ensureSheet(TABS.PAYROLL_PERIOD_CATEGORY);
  var haveP = {};
  readObjects(ppc).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) === period) haveP[String(r.PAYROLL_CATEGORY).trim()] = true;
  });
  var newP = populationList().filter(function (p) { return !haveP[p]; }).map(function (p) {
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

/** Parse DOJ. Date/ISO and d-Mon-yy / d-Mon-yyyy exact. dd/mm/yyyy: if ambiguous (both parts <= 12) take the EARLIER reading
 * (excludes fewer days -> more missing-date flags -> fail closed). Unparseable -> ''. */
function parseDoj(v) {
  if (v == null || v === '') return '';
  var iso = toIsoDate(v);
  if (iso) return iso;
  var mon = parseDojMonthText_(v);
  if (mon) return mon;
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

/**
 * Roster rule for joiners: is an employee with this DOJ_AS_SOURCE on the roster of a period ending at endIso?
 * Date / ISO are exact. dd/mm/yyyy is read as day-first; when the day-first and month-first readings would give
 * DIFFERENT answers (e.g. 03/10/2026 for a September run) the employee is INCLUDED with warn = 'AMBIGUOUS'.
 * Blank -> included, no warning. Non-blank but unparseable -> included, warn = 'UNPARSEABLE'.
 * @returns {{include:boolean, warn:string}}
 */
function dojRosterDecision(v, endIso) {
  if (v == null || v === '') return { include: true, warn: '' };
  var iso = toIsoDate(v);
  if (iso) return { include: iso <= endIso, warn: '' };
  var mon = parseDojMonthText_(v);
  if (mon) return { include: mon <= endIso, warn: '' };
  var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(v).trim());
  if (!m) return { include: true, warn: 'UNPARSEABLE' };
  var a = +m[1], b = +m[2], y = +m[3];
  var real = function (yy, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(yy, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 ? yy + '-' + pad2_(mo) + '-' + pad2_(d) : '';
  };
  var cands = [];
  [real(y, b, a), real(y, a, b)].forEach(function (c) { if (c && cands.indexOf(c) < 0) cands.push(c); });
  if (!cands.length) return { include: true, warn: 'UNPARSEABLE' };
  var inc = cands.map(function (c) { return c <= endIso; });
  var same = inc.every(function (x) { return x === inc[0]; });
  return same ? { include: inc[0], warn: '' } : { include: true, warn: 'AMBIGUOUS' };
}

/** EMPLOYEE_MASTER columns (first non-blank wins) that may hold a leaver's last working day. Absent column = no leavers. */
var ATT_LWD_HEADERS = ['LAST_WORKING_DAY', 'LAST_WORKING_DATE', 'LWD_AS_SOURCE', 'DOL_AS_SOURCE', 'DATE_OF_LEAVING',
  'RELIEVING_DATE'];

/** Raw last-working-day cell of an EMPLOYEE_MASTER row ('' when no such column / blank). */
function masterLastWorkingDay_(r) {
  for (var i = 0; i < ATT_LWD_HEADERS.length; i++) {
    var v = r[ATT_LWD_HEADERS[i]];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

/**
 * Roster rule for LEAVERS (non-Active employees): included when the last working day is on or after the period start
 * (they were paid for part of the month). Date / ISO exact; dd/mm/yyyy day-first, and when the two readings disagree the
 * employee is INCLUDED with warn 'AMBIGUOUS' (fail towards paying attention). Blank / unparseable -> not included.
 * @returns {{include:boolean, warn:string, lwd:string}}
 */
function leaverRosterDecision(v, startIso) {
  if (v == null || v === '') return { include: false, warn: '', lwd: '' };
  var iso = toIsoDate(v);
  if (iso) return { include: iso >= startIso, warn: '', lwd: iso };
  var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(v).trim());
  if (!m) return { include: false, warn: '', lwd: '' };
  var a = +m[1], b = +m[2], y = +m[3];
  var real = function (yy, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(yy, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 ? yy + '-' + pad2_(mo) + '-' + pad2_(d) : '';
  };
  var cands = [];
  [real(y, b, a), real(y, a, b)].forEach(function (c) { if (c && cands.indexOf(c) < 0) cands.push(c); });
  if (!cands.length) return { include: false, warn: '', lwd: '' };
  var inc = cands.map(function (c) { return c >= startIso; });
  var any = inc.some(function (x) { return x; }), all = inc.every(function (x) { return x; });
  return { include: any, warn: any && !all ? 'AMBIGUOUS' : '', lwd: cands[0] };
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

/** True when the category's CALC_METHOD is PERMANENT_WORKER (no week-off component, worked <= working days ...). */
function att_isWorker_(population) { return (categoryMethod(population) || population) === POP.PERMANENT_WORKER; }

/** WORKED_DAYS. Workers exclude WEEK_OFF (matches Aug worker template); everyone else includes it. */
function computeWorkedDays(record, population) {
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var n = function (k) { return attNum_(record[k]); };
  var sum = n('PRESENT_DAYS') + n('EL_AVAILED') + n('CL_AVAILED') + n('SL_AVAILED') + n('PH') + n('PAID_LEAVE_OTHER');
  if (!att_isWorker_(population)) sum += n('WEEK_OFF');
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
  var source = site === SITE_PUNE ? 'FORM_PUNE' : 'FORM_VFL';
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

/**
 * Employee-level problems of one INPUT_ATTENDANCE row (shared by the readiness check and the engine so both hold the
 * same employees): [{code, message}]. Codes: ATTENDANCE_NOT_APPROVED, ATTENDANCE_INVALID_VALUE (blank PRESENT_DAYS,
 * non-numeric or negative fields), ATTENDANCE_OVER_MONTH (worked days > days in the month), HR_OVERRIDE_WITHOUT_REASON.
 */
function attendanceRowProblems(row, population, period) {
  var out = [];
  if (!row) return out;
  if (String(row.APPROVAL_STATUS == null ? '' : row.APPROVAL_STATUS).trim().toUpperCase() !== 'APPROVED') {
    out.push({ code: 'ATTENDANCE_NOT_APPROVED', message: 'Attendance row is not APPROVED' });
  }
  var bad = [];
  ATT_NUM_FIELDS.forEach(function (k) {
    if (k === 'PRESENT_DAYS' && (row[k] === '' || row[k] == null)) { bad.push(k + ' blank'); return; }
    var n = attNum_(row[k]);
    if (isNaN(n) || n < 0) bad.push(k);
  });
  if (bad.length) {
    out.push({ code: 'ATTENDANCE_INVALID_VALUE', message: 'Blank / non-numeric / negative day fields: ' + bad.join(', ') });
  } else {
    var w = computeWorkedDays(row, population), dim = daysInMonth(period);
    if (w > dim + 1e-9) {
      out.push({ code: 'ATTENDANCE_OVER_MONTH', message: 'Worked days ' + w + ' exceed days in month ' + dim });
    }
  }
  if (String(row.HR_OVERRIDE || '').trim().toUpperCase() === 'Y' && String(row.OVERRIDE_REASON || '').trim() === '') {
    out.push({ code: 'HR_OVERRIDE_WITHOUT_REASON', message: 'HR_OVERRIDE=Y needs OVERRIDE_REASON' });
  }
  return out;
}

/** True when the INPUT_ATTENDANCE row comes from the monthly register (the pay source, DESIGN section 2). */
function isRegisterRow_(row) {
  return !!row && String(row.SOURCE_REF == null ? '' : row.SOURCE_REF).trim().toUpperCase() === 'REGISTER';
}

// ================================================================ sheet-touching entry points

function periodPopulationsOpen_(period) {
  var st = getPeriodStatusMap(period);
  var open = [], locked = [];
  populationList().forEach(function (p) { (st[p] === PERIOD_STATUS.LOCKED ? locked : open).push(p); });
  var scope = lockScope_(period);
  // isLocked(pop, empId): the population is LOCKED and the employee is not a held-and-unlocked one (see lockScope_)
  return { open: open, locked: locked, status: st, scope: scope, isLocked: scope.isLocked };
}

/**
 * Active roster from EMPLOYEE_MASTER (STATUS_AS_SOURCE = Active). Duplicate EMP_IDs kept once and reported.
 * With a period, employees whose DOJ is after the period end are left out (roster.joinersExcluded); an ambiguous or
 * unparseable DOJ keeps the employee in with DOJ_WARN set (roster.dojWarnings).
 */
function buildRoster(period, opts) {
  var rows = readObjects(TABS.EMPLOYEE_MASTER), seen = {}, roster = [], duplicates = [], excluded = [], warnings = [];
  var end = period ? periodEnd(period) : '';
  // without a period, opts.asOf (ISO date, e.g. today or the date of a daily response) keeps leavers whose last working day
  // is on / after it (still working their notice); without either, only Active employees are listed
  var start = period ? periodStart(period) : String((opts && opts.asOf) || '');
  rows.forEach(function (r) {
    var active = String(r.STATUS_AS_SOURCE || '').trim().toLowerCase() === 'active';
    var pop = String(r.PAYROLL_CATEGORY || '').trim();
    var id = String(r.EMP_ID || '').trim();
    if (!id || !isKnownPopulation(pop)) return;
    var lv = { include: false, warn: '', lwd: '' };
    if (!active) {
      // leaver: a non-Active employee whose last working day is on/after the period start stays on the roster
      if (!start) return;
      lv = leaverRosterDecision(masterLastWorkingDay_(r), start);
      if (!lv.include) return;
    }
    var dec = end ? dojRosterDecision(r.DOJ_AS_SOURCE, end) : { include: true, warn: '' };
    if (!dec.include) { if (excluded.indexOf(id) < 0) excluded.push(id); return; }
    if (seen[id]) { duplicates.push(id); return; }
    seen[id] = true;
    if (dec.warn) warnings.push(id);
    var entry = { EMP_ID: id, PAYROLL_CATEGORY: pop, SITE: siteForPopulation(pop), NAME: String(r.EMPLOYEE_NAME || ''),
      DEPARTMENT: String(r.DEPARTMENT || '').trim(), DOJ: parseDoj(r.DOJ_AS_SOURCE), DOJ_WARN: dec.warn };
    if (!active) { entry.LEAVER = true; entry.LWD = lv.lwd; entry.LWD_WARN = lv.warn; }
    roster.push(entry);
  });
  roster.duplicates = duplicates;
  roster.joinersExcluded = excluded;
  roster.dojWarnings = warnings;
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

/**
 * Keeps INPUT_ATTENDANCE.WORKING_DAYS equal to PAYROLL_PERIOD_CATEGORY.WORKING_DAYS (the value the engine really uses)
 * for the period's PENDING rows. APPROVED rows and LOCKED populations are never touched; a blank category value is
 * not copied. Returns the number of rows updated.
 */
function refreshAttendanceWorkingDays_(period) {
  var pp = periodPopulationsOpen_(period), wd = workingDaysFor_(period), updates = [];
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (String(r.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') return;
    var cat = String(r.PAYROLL_CATEGORY || '').trim();
    if (pp.isLocked(cat, r.EMP_ID)) return;
    var want = wd[cat];
    if (want === undefined || want === null || want === '') return;
    var have = r.WORKING_DAYS;
    if (have !== '' && have != null && Number(have) === Number(want)) return;
    updates.push({ row: r._row, values: { WORKING_DAYS: want } });
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  return updates.length;
}

/** Sept-style: pre-fill one PENDING row per active employee for HR to type counts into. Existing rows untouched. */
function prepareMonthlyAttendance(period) {
  guardPeriod_(period);
  var pp = periodPopulationsOpen_(period);
  var roster = buildRoster(period), wd = workingDaysFor_(period), existing = existingAttendanceByEmp_(period);
  var rows = [], skipped = 0;
  roster.forEach(function (e) {
    if (pp.isLocked(e.PAYROLL_CATEGORY, e.EMP_ID)) { skipped++; return; }
    if (existing[e.EMP_ID]) return;
    rows.push({ PAYROLL_MONTH: period, EMP_ID: e.EMP_ID, PAYROLL_CATEGORY: e.PAYROLL_CATEGORY,
      WORKING_DAYS: wd[e.PAYROLL_CATEGORY] === undefined ? '' : wd[e.PAYROLL_CATEGORY],
      APPROVAL_STATUS: 'PENDING', SOURCE_REF: 'HR_MONTHLY_ENTRY', ENTERED_AT: nowIso_(), HR_OVERRIDE: 'N',
      ROW_KEY: period + '|' + e.EMP_ID });
  });
  appendObjects(TABS.INPUT_ATTENDANCE, rows);
  var refreshed = refreshAttendanceWorkingDays_(period);
  var res = { period: period, rowsAdded: rows.length, workingDaysRefreshed: refreshed, skippedLocked: skipped,
    lockedPopulations: pp.locked, duplicateMasterIds: roster.duplicates, joinersExcluded: roster.joinersExcluded,
    dojWarnings: roster.dojWarnings };
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
  var roster = buildRoster(period).filter(function (e) { return !pp.isLocked(e.PAYROLL_CATEGORY, e.EMP_ID); });
  var holidays = readObjects(TABS.HOLIDAY_CALENDAR);
  var records = aggregateDaily(daily, period, roster, holidays, getWeeklyOff(SITE_VFL));
  var wd = workingDaysFor_(period), existing = existingAttendanceByEmp_(period);
  var creates = [], updates = [], counts = { CREATE: 0, REGENERATE: 0, UNCHANGED: 0, OVERRIDE: 0, KEEP_APPROVED: 0 };
  var registerKept = [];
  var needsReason = [], withMissing = [];
  records.forEach(function (rec) {
    var pop = rec.PAYROLL_CATEGORY;
    var gen = generatedValuesFromRecord(rec);
    var ex = existing[rec.EMP_ID] || null;
    // the monthly register is the pay source: its rows are compared with the daily data (ATTENDANCE_COMPARISON), never regenerated
    if (ex && isRegisterRow_(ex)) { registerKept.push(rec.EMP_ID); return; }
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
  var refreshed = refreshAttendanceWorkingDays_(period);
  var res = { period: period, counts: counts, employeesWithMissingDates: withMissing, overridesNeedingReason: needsReason,
    workingDaysRefreshed: refreshed, skippedLockedPopulations: pp.locked, registerRowsKept: registerKept.length };
  audit('ATT_GENERATE', period, '', res);
  return res;
}

/** Bulk-approve PENDING rows of one population. Records the active user; refuses if identity unknown. */
function approveAttendance(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  // a LOCKED population refuses attendance approval, except for employees that were held in the locked run and are not
  // locked yet (they are approved so that a supplementary run can pay them)
  var scope = lockScope_(period), lockedPop = !!scope.pops[population];
  if (lockedPop && !Object.keys(scope.open).length) assertNotLocked(period, population);
  var user = '';
  try { user = Session.getActiveUser().getEmail(); } catch (e) { user = ''; }
  if (!user) throw new Error('Cannot determine active user email - approval refused');
  var approved = [], blocked = [], updates = [];
  // an employee with an open daily-vs-register dispute stays PENDING until the owner approved HR's decision AND the
  // decided days are in the attendance row (same rule the engine uses for the hold)
  var openDispute = {};
  if (typeof cmp_storedRows_ === 'function' && getSheet(TABS.ATTENDANCE_COMPARISON)) {
    var attBy = {};
    readObjects(TABS.INPUT_ATTENDANCE).forEach(function (a) {
      var id = String(a.EMP_ID).trim();
      if (normalizePeriod(a.PAYROLL_MONTH) === period && !(id in attBy)) attBy[id] = a;
    });
    attendanceDisputeStages(cmp_storedRows_(period), attBy, getOwnerApproverEmail(), period).forEach(function (d) {
      openDispute[String(d.EMP_ID).trim()] = true;
    });
  }
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period || String(r.PAYROLL_CATEGORY).trim() !== population) return;
    if (scope.isLocked(population, r.EMP_ID)) return;
    if (String(r.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') return;
    var problems = validateAttendanceRowForApproval(r);
    if (openDispute[String(r.EMP_ID).trim()]) problems.push('attendance dispute open (daily vs register): see ATTENDANCE_COMPARISON');
    if (problems.length) { blocked.push({ EMP_ID: r.EMP_ID, problems: problems }); return; }
    updates.push({ row: r._row, values: { APPROVAL_STATUS: 'APPROVED', APPROVED_BY: user } });
    approved.push(r.EMP_ID);
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  var res = { period: period, population: population, approvedBy: user, approved: approved.length, blocked: blocked };
  audit('ATT_APPROVE', period, population, res);
  return res;
}

/**
 * Pure: one row of an attendance form-response tab (ATT_FORM_VFL_RAW / ATT_FORM_PUNE_RAW) -> the parsed response
 * {date, marks, ack, timestamp, sourceRef} that normalizeAttendanceResponse expects. Column headers of a linked
 * response sheet are the question titles: "Timestamp", "Date", "Attendance – <Dept> [EMP_ID – Name]" (one per grid
 * row, the cell holds the chosen code) and the acknowledgement checkbox title.
 */
function parseAttendanceRawRow(headers, values, sheetName, rowNum) {
  var out = { date: '', marks: {}, ack: false, timestamp: '', sourceRef: sheetName + '!' + rowNum };
  (headers || []).forEach(function (h, i) {
    var title = String(h == null ? '' : h).trim();
    var v = values[i];
    if (/^timestamp$/i.test(title)) {
      out.timestamp = Object.prototype.toString.call(v) === '[object Date]'
        ? Utilities.formatDate(v, HROS_TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(v == null ? '' : v);
    } else if (/^date$/i.test(title)) {
      out.date = feeds_parseDate_(v);
    } else if (title.indexOf(ATT_GRID_TITLE_PREFIX) === 0) {
      var m = /\[(.+)\]\s*$/.exec(title);
      var code = String(v == null ? '' : v).trim();
      var lbl = m ? parseRowLabel(m[1]) : null;
      if (lbl && code) out.marks[lbl.empId] = code.toUpperCase();
    } else if (title === ATT_ACK_TEXT) {
      out.ack = String(v == null ? '' : v).trim() !== '';
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
  var roster = buildRoster(undefined, { asOf: date });
  var holidays = readObjects(TABS.HOLIDAY_CALENDAR);
  var rows = normalizeAttendanceResponse(parsed, roster, holidays, site, getWeeklyOff(site));
  var scope = lockScope_(period);
  var popOf = {};
  roster.forEach(function (e) { popOf[e.EMP_ID] = e.PAYROLL_CATEGORY; });
  rows = rows.map(function (r) {
    if (r.STATUS === 'VALID' && scope.isLocked(popOf[r.EMP_ID], r.EMP_ID)) {
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
 * 11_AttendanceForms.gs - daily attendance Google Forms (VFL Waluj plant, Pune office), roster refresh, trigger install.
 */
var ATT_ROW_SEPARATOR = ' – '; // "EMP_ID – Name" (en dash with spaces)
var ATT_GRID_TITLE_PREFIX = 'Attendance – ';
var ATT_ACK_TEXT = 'All employees left blank were present (or on weekly off / holiday as per calendar)';
var ATT_MAX_TRIGGERS = 5;

/**
 * One daily form per SITE. `populations` are the built-in defaults; the forms use attFormPopulations_(site), the ACTIVE
 * categories of that site in PAYROLL_CATEGORY_CONFIG (so a new category shows up in the form of its site).
 */
var ATT_FORM_DEFS = {
  VFL: { site: 'VFL', title: 'Daily Attendance – VFL Waluj', populations: ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT'],
    idKey: 'ATT_FORM_VFL_ID', rawTab: 'ATT_FORM_VFL_RAW' },
  PUNE: { site: 'PUNE', title: 'Daily Attendance – Pune', populations: ['PUNE_STAFF'],
    idKey: 'ATT_FORM_PUNE_ID', rawTab: 'ATT_FORM_PUNE_RAW' }
};

function attFormPopulations_(def) { return populationsOfSite(def.site); }

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
  var groups = groupRosterByDepartment(roster, attFormPopulations_(def));
  Object.keys(groups).sort().forEach(function (d) { addGridForDepartment_(form, d, groups[d]); });
  form.addCheckboxItem().setTitle(ATT_ACK_TEXT).setChoiceValues(['Confirmed']).setRequired(true);
  return form;
}

function sheetNames_(ss) { return ss.getSheets().map(function (s) { return s.getName(); }); }

function createAttendanceForms() {
  var ss = getSpreadsheet_();
  var roster = buildRoster(undefined, { asOf: nowIso_().slice(0, 10) });
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
  var roster = buildRoster(undefined, { asOf: nowIso_().slice(0, 10) });
  var res = { updated: [], added: [], removed: [], skipped: [] };
  Object.keys(ATT_FORM_DEFS).forEach(function (k) {
    var def = ATT_FORM_DEFS[k];
    var id = String(getControl(def.idKey, '')).trim();
    if (!id) { res.skipped.push(k + ' (no form id)'); return; }
    var form = FormApp.openById(id);
    var groups = groupRosterByDepartment(roster, attFormPopulations_(def));
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

// ================================================================ one spreadsheet-level form-submit trigger

var HROS_SUBMIT_HANDLER = 'hrosOnFormSubmit';

/** Response tab -> handler key. Tabs not listed are ignored. The OT source tab is resolved dynamically (see routeFormSubmit). */
var HROS_FORM_ROUTES = {
  ATT_FORM_VFL_RAW: 'ATT_VFL',
  ATT_FORM_PUNE_RAW: 'ATT_PUNE',
  CANTEEN_FORM_RESPONSES: 'CANTEEN',
  EFFICIENCY_FORM_RESPONSES: 'EFFICIENCY',
  OT_FORM_RESPONSES: 'OT'
};

/** Pure. otTabName = the local OT source tab currently in use (e.g. a renamed response tab), or '' when none. */
function routeFormSubmit(sheetName, otTabName) {
  var n = String(sheetName == null ? '' : sheetName).trim();
  if (Object.prototype.hasOwnProperty.call(HROS_FORM_ROUTES, n)) return HROS_FORM_ROUTES[n];
  if (n && otTabName && n === String(otTabName).trim()) return 'OT';
  return null;
}

/**
 * The ONE installable onFormSubmit trigger (spreadsheet level, no form IDs needed). Routes by the name of the sheet
 * the response landed in: daily attendance (VFL / Pune raw tabs), the OT source tab (syncOtFromForm for the
 * period of the OT date), canteen, efficiency. Every other tab is ignored.
 */
function hrosOnFormSubmit(e) {
  var sheet = e && e.range && e.range.getSheet ? e.range.getSheet() : null;
  var name = sheet ? sheet.getName() : '';
  var route = routeFormSubmit(name, feeds_localOtTabName_());
  if (!route) return null;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (route === 'ATT_VFL' || route === 'ATT_PUNE') {
      var site = route === 'ATT_PUNE' ? SITE_PUNE : SITE_VFL;
      var rowNum = e.range.getRow(), lc = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lc).getValues()[0];
      var values = sheet.getRange(rowNum, 1, 1, lc).getValues()[0];
      var parsed = parseAttendanceRawRow(headers, values, name, rowNum);
      var out = ingestAttendanceResponse_(parsed, site);
      audit('ATT_FORM_SUBMIT', parsed.date || '', '', { site: site, source: parsed.sourceRef, valid: out.valid,
        rejected: out.rejected, superseded: out.superseded });
      return out;
    }
    if (route === 'OT') {
      var otPeriod = feeds_otPeriodOfRow_(sheet, e.range.getRow());
      if (!otPeriod) { audit('OT_SUBMIT_SKIPPED', '', '', 'OT date not found or outside the payroll periods'); return null; }
      return syncOtFromForm(otPeriod);
    }
    var period = feeds_periodFromNamedValues(e.namedValues);
    if (!period) { audit(route + '_SUBMIT_SKIPPED', '', '', 'Payroll Month not found in response'); return null; }
    if (route === 'CANTEEN') return syncCanteenFromForm(period);
    return syncEfficiencyFromForm(period);
  } catch (err) {
    try { audit(route + '_SUBMIT_ERROR', '', '', String(err && err.message ? err.message : err)); } catch (e2) { /* ignore */ }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Pure: is the single trigger needed? existing = [{handler}]. Foreign triggers are only counted, never touched.
 * Throws if creating it would exceed maxTriggers.
 */
function planFormSubmitTrigger(existing, maxTriggers) {
  var max = maxTriggers || ATT_MAX_TRIGGERS;
  var present = (existing || []).filter(function (t) { return t.handler === HROS_SUBMIT_HANDLER; }).length;
  if (present) return { create: false, present: present, total: existing.length };
  if (existing.length + 1 > max) throw new Error('Trigger limit: ' + existing.length + ' existing + 1 new exceeds ' + max);
  return { create: true, present: 0, total: existing.length + 1 };
}

/** Idempotent. Creates the single spreadsheet onFormSubmit trigger if missing; never deletes or edits other triggers. */
function installTriggers() {
  var existing = ScriptApp.getProjectTriggers().map(function (t) { return { handler: t.getHandlerFunction() }; });
  var plan = planFormSubmitTrigger(existing, ATT_MAX_TRIGGERS);
  if (plan.create) {
    ScriptApp.newTrigger(HROS_SUBMIT_HANDLER).forSpreadsheet(getSpreadsheet_()).onFormSubmit().create();
  }
  var res = { created: plan.create ? 1 : 0, alreadyPresent: plan.present, totalTriggers: plan.total,
    note: plan.present > 1 ? 'more than one ' + HROS_SUBMIT_HANDLER + ' trigger exists - ask the owner to remove the extra ones' : '' };
  audit('TRIGGERS_INSTALL', '', '', res);
  return res;
}

// ===== 12_Register.gs =====
/**
 * 12_Register.gs - monthly attendance register (DESIGN section 2, "Monthly attendance register").
 * One number per employee ("days present") plus one toggle per population ("INCLUDES / EXCLUDES weekly offs");
 * everything else (WEEK_OFF, PH, EL/CL/SL, C/Off, OD, LWP) is derived from the calendar and the approved leave.
 * Pure: deriveMonthlyAttendance, applyPhysicalOverride, registerValuesFromDerived, pickDefaultRegisterPeriod,
 * registerUserAllowed, validateRegisterEntries. Sheet-touching: registerLoad, registerSubmit,
 * refreshRegisterAttendance_ (the HTML page and its entry points are in 13_RegisterPage.gs).
 * Helpers are prefixed register_ / reg_.
 */
var REGISTER_SOURCE_REF = 'REGISTER';
var REGISTER_COLUMNS = ['REGISTER_DAYS_PRESENT', 'REGISTER_INCLUDES_WO', 'ENTERED_BY', 'GENERATED_VALUES_JSON', 'HR_OVERRIDE',
  'OVERRIDE_REASON', 'ROW_KEY', 'PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS'];

// ================================================================ pure

function reg_r2_(x) { return Math.round(x * 100) / 100; }

/** ISO dates of the period that fall on the weekly-off weekday. */
function weeklyOffDatesInMonth(period, weeklyOffDay) {
  return enumerateDates(period).filter(function (d) { return weekdayOf(d) === weeklyOffDay; });
}

/** ISO dates of the period that are PAID holidays for the site (HOLIDAY_CALENDAR PAID=Y, SITE = site or ALL). */
function paidHolidayDatesInMonth(period, holidays, site) {
  return enumerateDates(period).filter(function (d) { return isPaidHoliday_(holidays, d, site); });
}

function reg_leaveNum_(v) {
  if (v === '' || v == null) return 0;
  var n = Number(v);
  return isNaN(n) ? NaN : n;
}

/**
 * Pure. Turns the ONE number HR enters per employee into every INPUT_ATTENDANCE component.
 *  WEEK_OFF = weekly-off weekdays of the month for the site, minus dates that are paid holidays (workers: 0, the worker
 *  template has no week-off); PH = paid holidays of the month (site or ALL) that do not fall on the weekly off.
 *  includesWO = true (not for PERMANENT_WORKER): PRESENT_DAYS = registerDays - WEEK_OFF (min 0, WARN when negative);
 *  otherwise PRESENT_DAYS = registerDays. PHYSICAL_PRESENT_DAYS = that figure. Approved leave adds EL/CL/SL
 *  (EL_AVAILED / CL_AVAILED / SL_AVAILED), C/Off -> PAID_LEAVE_OTHER, LWP -> ABSENT_LWP_DAYS; OD days are ADDED to
 *  PRESENT_DAYS (worked, but not physical). Employee-level exception ATTENDANCE_OVER_MONTH (BLOCKER for that employee,
 *  the engine turns it into a HOLD) when PRESENT + WEEK_OFF + PH + EL + CL + SL + PAID_LEAVE_OTHER exceeds the days in
 *  the month.
 * @param {number} registerDays 0..days in month, step 0.5
 * @param {boolean|string} includesWO true / 'Y' when the entered days INCLUDE weekly offs
 * @param {string} population an active category code (PAYROLL_CATEGORY_CONFIG)
 * @param {string} period 'YYYY-MM'
 * @param {string} site 'VFL' | 'PUNE'
 * @param {Array} holidays HOLIDAY_CALENDAR rows {DATE, SITE, PAID}
 * @param {string} weeklyOffDay 'SUN'..'SAT'
 * @param {Object} approvedLeaveDays {EL, CL, SL, OD, COFF, LWP} days inside the period (missing = 0)
 * @returns {{ok:boolean, PRESENT_DAYS:number, PHYSICAL_PRESENT_DAYS:number, WEEK_OFF:number, PH:number, EL_AVAILED:number,
 *   CL_AVAILED:number, SL_AVAILED:number, PAID_LEAVE_OTHER:number, ABSENT_LWP_DAYS:number, OD_DAYS:number,
 *   WORKED_DAYS:number, REGISTER_DAYS_PRESENT:number, REGISTER_INCLUDES_WO:string, exceptions:Array, warnings:Array}}
 */
function deriveMonthlyAttendance(registerDays, includesWO, population, period, site, holidays, weeklyOffDay, approvedLeaveDays) {
  parsePeriod(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  if (WEEKDAY_CODES.indexOf(weeklyOffDay) < 0) throw new Error('Invalid weekly off "' + weeklyOffDay + '"');
  var dim = daysInMonth(period);
  var inc = includesWO === true || String(includesWO == null ? '' : includesWO).trim().toUpperCase() === 'Y';
  var out = { ok: false, PRESENT_DAYS: 0, PHYSICAL_PRESENT_DAYS: 0, WEEK_OFF: 0, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0,
    SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0, OD_DAYS: 0, WORKED_DAYS: 0,
    REGISTER_DAYS_PRESENT: registerDays, REGISTER_INCLUDES_WO: inc ? 'Y' : 'N', exceptions: [], warnings: [] };
  var reg = (registerDays === '' || registerDays == null || typeof registerDays === 'boolean') ? NaN : Number(registerDays);
  if (isNaN(reg) || reg < 0 || reg > dim || Math.abs(reg * 2 - Math.round(reg * 2)) > 1e-9) {
    out.exceptions.push({ severity: 'BLOCKER', code: 'REGISTER_DAYS_INVALID',
      message: 'Days present must be 0..' + dim + ' in steps of 0.5 (got "' + registerDays + '")' });
    return out;
  }
  var leave = approvedLeaveDays || {};
  var lv = {};
  var badLeave = false;
  LEAVE_TYPES.forEach(function (t) {
    var n = reg_leaveNum_(leave[t]);
    if (isNaN(n) || n < 0) { badLeave = true; n = 0; }
    lv[t] = n;
  });
  if (badLeave) {
    out.exceptions.push({ severity: 'BLOCKER', code: 'LEAVE_DAYS_INVALID', message: 'Approved leave days are not non-negative numbers' });
    return out;
  }
  var isWorker = att_isWorker_(population);
  var dates = enumerateDates(period);
  var phSet = {};
  dates.forEach(function (d) { if (isPaidHoliday_(holidays, d, site)) phSet[d] = true; });
  var wo = 0, ph = 0;
  dates.forEach(function (d) {
    var isWo = weekdayOf(d) === weeklyOffDay;
    if (phSet[d]) { if (!isWo) ph++; } else if (isWo) wo++;
  });
  out.WEEK_OFF = isWorker ? 0 : wo;
  out.PH = ph;
  var present = reg;
  if (inc) {
    if (isWorker) {
      out.warnings.push({ code: 'REGISTER_WO_IGNORED_FOR_WORKER',
        message: 'PERMANENT_WORKER has no week-off component: the entered days are used as they are' });
    } else {
      present = reg - out.WEEK_OFF;
      if (present < 0) {
        out.warnings.push({ code: 'REGISTER_LESS_THAN_WEEK_OFF',
          message: 'Days present ' + reg + ' (incl. week-off) is less than the ' + out.WEEK_OFF + ' week-off day(s); PRESENT_DAYS set to 0' });
        present = 0;
      }
    }
  }
  out.PHYSICAL_PRESENT_DAYS = reg_r2_(present);
  out.OD_DAYS = reg_r2_(lv.OD);
  out.PRESENT_DAYS = reg_r2_(present + lv.OD);
  out.EL_AVAILED = reg_r2_(lv.EL);
  out.CL_AVAILED = reg_r2_(lv.CL);
  out.SL_AVAILED = reg_r2_(lv.SL);
  out.PAID_LEAVE_OTHER = reg_r2_(lv.COFF);
  out.ABSENT_LWP_DAYS = reg_r2_(lv.LWP);
  out.WORKED_DAYS = reg_r2_(out.PRESENT_DAYS + out.WEEK_OFF + out.PH + out.EL_AVAILED + out.CL_AVAILED + out.SL_AVAILED +
    out.PAID_LEAVE_OTHER);
  if (out.WORKED_DAYS > dim + 1e-9) {
    out.exceptions.push({ severity: 'BLOCKER', code: 'ATTENDANCE_OVER_MONTH',
      message: 'Present ' + out.PRESENT_DAYS + ' + week-off ' + out.WEEK_OFF + ' + PH ' + out.PH + ' + EL/CL/SL ' +
        (out.EL_AVAILED + out.CL_AVAILED + out.SL_AVAILED) + ' + other paid leave ' + out.PAID_LEAVE_OTHER + ' = ' +
        out.WORKED_DAYS + ' exceeds the ' + dim + ' days of ' + period });
  }
  out.ok = true;
  return out;
}

/**
 * Pure. Replaces the physical days of a derived record with HR's owner-approved dispute decision (OD days stay
 * additive to PRESENT_DAYS) and re-checks the month total. Returns a new object.
 */
function applyPhysicalOverride(derived, decidedDays, population, period) {
  var d = JSON.parse(JSON.stringify(derived));
  var n = Number(decidedDays);
  if (isNaN(n) || n < 0 || n > daysInMonth(period)) throw new Error('Decided days must be 0..' + daysInMonth(period));
  d.PHYSICAL_PRESENT_DAYS = reg_r2_(n);
  d.PRESENT_DAYS = reg_r2_(n + (d.OD_DAYS || 0));
  d.WORKED_DAYS = reg_r2_(d.PRESENT_DAYS + d.WEEK_OFF + d.PH + d.EL_AVAILED + d.CL_AVAILED + d.SL_AVAILED + d.PAID_LEAVE_OTHER);
  d.exceptions = (d.exceptions || []).filter(function (e) { return e.code !== 'ATTENDANCE_OVER_MONTH'; });
  if (d.WORKED_DAYS > daysInMonth(period) + 1e-9) {
    d.exceptions.push({ severity: 'BLOCKER', code: 'ATTENDANCE_OVER_MONTH',
      message: 'Worked days ' + d.WORKED_DAYS + ' exceed the ' + daysInMonth(period) + ' days of ' + period });
  }
  return d;
}

/** Pure. The INPUT_ATTENDANCE cells for a derived record ({field: value}); snapshot goes to GENERATED_VALUES_JSON. */
function registerValuesFromDerived(d, enteredBy, enteredAt) {
  var snap = {};
  ATT_NUM_FIELDS.forEach(function (k) { snap[k] = d[k]; });
  snap.OD_DAYS = d.OD_DAYS;
  snap.REGISTER_DAYS_PRESENT = d.REGISTER_DAYS_PRESENT;
  snap.REGISTER_INCLUDES_WO = d.REGISTER_INCLUDES_WO;
  var v = {};
  ATT_NUM_FIELDS.forEach(function (k) { v[k] = d[k]; });
  v.WORKED_DAYS = d.WORKED_DAYS;
  v.PAYABLE_DAYS = d.WORKED_DAYS;
  v.REGISTER_DAYS_PRESENT = d.REGISTER_DAYS_PRESENT;
  v.REGISTER_INCLUDES_WO = d.REGISTER_INCLUDES_WO;
  v.SOURCE_REF = REGISTER_SOURCE_REF;
  v.ENTERED_BY = enteredBy || '';
  v.ENTERED_AT = enteredAt || '';
  v.GENERATED_VALUES_JSON = JSON.stringify(snap);
  v.HR_OVERRIDE = 'N';
  v.OVERRIDE_REASON = '';
  return v;
}

/** Pure. Latest period >= minPeriod with a population that is not LOCKED; else todayPeriod (if >= min); else minPeriod. */
function pickDefaultRegisterPeriod(periodCatRows, minPeriod, todayPeriod) {
  var open = {};
  (periodCatRows || []).forEach(function (r) {
    var p = normalizePeriod(r.PAYROLL_MONTH);
    if (!p || p < minPeriod) return;
    if (String(r.STATUS == null ? '' : r.STATUS).trim().toUpperCase() !== PERIOD_STATUS.LOCKED) open[p] = true;
  });
  var ps = Object.keys(open).sort();
  if (ps.length) return ps[ps.length - 1];
  return todayPeriod && todayPeriod >= minPeriod ? todayPeriod : minPeriod;
}

/** Pure. Who may submit the register: HR approver, owner, or REGISTER_ENTRY_EMAILS (comma separated). Unknown user: never. */
function registerUserAllowed(user, hrEmail, ownerEmail, extraCsv) {
  var u = String(user == null ? '' : user).trim().toLowerCase();
  if (!u) return false;
  var list = [hrEmail, ownerEmail].concat(String(extraCsv == null ? '' : extraCsv).split(','));
  return list.some(function (e) { return String(e == null ? '' : e).trim().toLowerCase() === u; });
}

/**
 * Pure. Validates submitted entries against the roster: each {empId, days}. Blank days = not entered (skipped).
 * Returns {entries:[{empId, days}], notEntered:[ids], errors:[text]}; any error means nothing may be written.
 */
function validateRegisterEntries(rawEntries, rosterMap, period) {
  var dim = daysInMonth(period), seen = {}, out = { entries: [], notEntered: [], errors: [] };
  (rawEntries || []).forEach(function (e) {
    var id = String(e && e.empId != null ? e.empId : '').trim();
    if (!id) return;
    if (seen[id]) { out.errors.push(id + ': entered twice'); return; }
    seen[id] = true;
    if (!rosterMap[id]) { out.errors.push(id + ': not on the roster of ' + period); return; }
    var raw = e.days;
    if (raw === '' || raw == null) { out.notEntered.push(id); return; }
    var n = typeof raw === 'boolean' ? NaN : Number(raw);
    if (isNaN(n) || n < 0 || n > dim || Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) {
      out.errors.push(id + ': days present must be 0..' + dim + ' in steps of 0.5 (got "' + raw + '")');
      return;
    }
    out.entries.push({ empId: id, days: n });
  });
  return out;
}

// ================================================================ sheet-touching

/** Throws unless the active user may run the register (HR approver / owner / REGISTER_ENTRY_EMAILS). Returns the email. */
function register_requireUser_() {
  var user = approval_userEmail_();
  if (!user) throw new Error('Cannot determine your Google account email - the register was not opened / saved');
  var ctl = readControlMap();
  if (!registerUserAllowed(user, ctl.HR_APPROVER_EMAIL, ctl.OWNER_APPROVER_EMAIL, ctl.REGISTER_ENTRY_EMAILS)) {
    throw new Error('Not allowed: ' + user + ' is not HR_APPROVER_EMAIL, OWNER_APPROVER_EMAIL or listed in REGISTER_ENTRY_EMAILS');
  }
  return user;
}

function register_requireColumns_() {
  var headers = getHeaders(resolveSheet_(TABS.INPUT_ATTENDANCE));
  var missing = REGISTER_COLUMNS.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) throw new Error('INPUT_ATTENDANCE lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup)');
}

/** Everything the register needs for a period, read once. */
function register_ctx_(period) {
  var roster = buildRoster(period), rosterMap = {};
  roster.forEach(function (e) { rosterMap[e.EMP_ID] = e; });
  var leaveRows = getSheet(TABS.INPUT_LEAVE) ? readObjects(TABS.INPUT_LEAVE) : [];
  var pp = periodPopulationsOpen_(period);
  return { period: period, roster: roster, rosterMap: rosterMap,
    holidays: getSheet(TABS.HOLIDAY_CALENDAR) ? readObjects(TABS.HOLIDAY_CALENDAR) : [],
    weeklyOff: { VFL: getWeeklyOff(SITE_VFL), PUNE: getWeeklyOff(SITE_PUNE) },
    leaveByEmp: leaveByEmp(leaveRows, period), workingDays: workingDaysFor_(period),
    lockedPops: pp.locked, isLocked: pp.isLocked, existing: existingAttendanceByEmp_(period) };
}

function register_derive_(ctx, emp, registerDays, includesWO) {
  return deriveMonthlyAttendance(registerDays, includesWO, emp.PAYROLL_CATEGORY, ctx.period, emp.SITE, ctx.holidays,
    ctx.weeklyOff[emp.SITE], ctx.leaveByEmp[emp.EMP_ID] || {});
}

function register_remarks_(existingRemarks, d) {
  var old = String(existingRemarks == null ? '' : existingRemarks);
  if (old !== '' && !/^(MISSING_DATES|REGISTER)/.test(old)) return null; // keep HR's own note
  var codes = d.warnings.map(function (w) { return w.code; }).concat(d.exceptions.map(function (e) { return e.code; }));
  return codes.length ? 'REGISTER: ' + codes.join(',') : 'REGISTER';
}

/**
 * Data for the page: {period, daysInMonth, defaultPeriod, populations:[{population, includesWO:'Y'|'N'}],
 * employees:[{empId, name, department, population, days, state:'OPEN'|'APPROVED'|'LOCKED'}]}.
 */
function registerLoad(period) {
  register_requireUser_();
  var min = getMinPeriod();
  var pcRows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY);
  var today = normalizePeriod(new Date());
  var def = pickDefaultRegisterPeriod(pcRows, min, today);
  var p = String(period == null ? '' : period).trim() || def;
  guardPeriod_(p);
  var ctx = register_ctx_(p);
  var incBy = {};
  var popList = populationList();
  popList.forEach(function (pop) { incBy[pop] = { Y: 0, N: 0 }; });
  var employees = ctx.roster.map(function (e) {
    var row = ctx.existing[e.EMP_ID];
    var days = '';
    if (row && row.REGISTER_DAYS_PRESENT !== '' && row.REGISTER_DAYS_PRESENT != null && isFinite(Number(row.REGISTER_DAYS_PRESENT))) {
      days = Number(row.REGISTER_DAYS_PRESENT);
      incBy[e.PAYROLL_CATEGORY][String(row.REGISTER_INCLUDES_WO).trim().toUpperCase() === 'Y' ? 'Y' : 'N']++;
    } // rows typed directly are not prefilled: the register value is the pay source
    var state = ctx.isLocked(e.PAYROLL_CATEGORY, e.EMP_ID) ? 'LOCKED'
      : (row && String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED' ? 'APPROVED' : 'OPEN');
    return { empId: e.EMP_ID, name: e.NAME, department: e.DEPARTMENT, population: e.PAYROLL_CATEGORY, days: days, state: state };
  });
  employees.sort(function (a, b) {
    var pa = popList.indexOf(a.population), pb = popList.indexOf(b.population);
    return pa - pb || (a.empId < b.empId ? -1 : (a.empId > b.empId ? 1 : 0));
  });
  var pops = popList.filter(function (pop) { return employees.some(function (e) { return e.population === pop; }); })
    .map(function (pop) { return { population: pop, includesWO: (incBy[pop].Y > 0 && incBy[pop].N === 0) ? 'Y' : 'N' }; });
  return { period: p, daysInMonth: daysInMonth(p), defaultPeriod: def, populations: pops, employees: employees };
}

/**
 * Writes INPUT_ATTENDANCE for PENDING rows only (APPROVED rows and LOCKED populations are reported, never written).
 * payload = {period, includesWO:{POPULATION:'Y'|'N'}, entries:[{empId, days}]}. Nothing is written when any entry is invalid.
 */
function registerSubmit(payload) {
  payload = payload || {};
  var period = String(payload.period == null ? '' : payload.period).trim();
  guardPeriod_(period);
  var user = register_requireUser_();
  register_requireColumns_();
  var ctx = register_ctx_(period);
  var val = validateRegisterEntries(payload.entries, ctx.rosterMap, period);
  if (val.errors.length) throw new Error('Register not saved - fix these first: ' + val.errors.slice(0, 20).join('; ') +
    (val.errors.length > 20 ? '; +' + (val.errors.length - 20) + ' more' : ''));
  var incMap = payload.includesWO || {};
  var now = nowIso_();
  var creates = [], updates = [], res = { period: period, written: 0, created: 0, updated: 0, notEntered: val.notEntered,
    skippedApproved: [], skippedLocked: [], skippedDuplicateRows: [], exceptions: [], warnings: [] };
  val.entries.forEach(function (en) {
    var emp = ctx.rosterMap[en.empId], pop = emp.PAYROLL_CATEGORY;
    if (ctx.isLocked(pop, en.empId)) { res.skippedLocked.push(en.empId); return; }
    var row = ctx.existing[en.empId];
    if (ctx.existing.__dups.indexOf(en.empId) >= 0) { res.skippedDuplicateRows.push(en.empId); return; }
    if (row && String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') { res.skippedApproved.push(en.empId); return; }
    var inc = incMap[pop];
    var d = register_derive_(ctx, emp, en.days, inc === true || String(inc == null ? 'N' : inc).trim().toUpperCase() === 'Y');
    d.exceptions.forEach(function (x) { res.exceptions.push({ EMP_ID: en.empId, code: x.code, message: x.message }); });
    d.warnings.forEach(function (x) { res.warnings.push({ EMP_ID: en.empId, code: x.code, message: x.message }); });
    var vals = registerValuesFromDerived(d, user, now);
    var rem = register_remarks_(row ? row.REMARKS : '', d);
    if (rem !== null) vals.REMARKS = rem;
    if (row) { updates.push({ row: row._row, values: vals }); res.updated++; }
    else {
      vals.PAYROLL_MONTH = period; vals.EMP_ID = en.empId; vals.PAYROLL_CATEGORY = pop;
      vals.WORKING_DAYS = ctx.workingDays[pop] === undefined ? '' : ctx.workingDays[pop];
      vals.APPROVAL_STATUS = 'PENDING'; vals.ROW_KEY = period + '|' + en.empId;
      creates.push(vals); res.created++;
    }
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  appendObjects(TABS.INPUT_ATTENDANCE, creates);
  res.written = res.created + res.updated;
  audit('REGISTER_SUBMIT', period, '', { by: user, written: res.written, created: res.created, updated: res.updated,
    skippedApproved: res.skippedApproved.length, skippedLocked: res.skippedLocked.length, notEntered: res.notEntered.length,
    exceptions: res.exceptions.map(function (x) { return x.EMP_ID + ':' + x.code; }), includesWO: incMap });
  return res;
}

/**
 * Re-derives the register rows of a period from their stored REGISTER_DAYS_PRESENT / REGISTER_INCLUDES_WO with the CURRENT
 * approved leave (called after every leave sync). PENDING rows are rewritten when a component changed; a row whose
 * dispute decision was applied (HR_OVERRIDE=Y, reason ATTENDANCE_DISPUTE...) keeps its decided physical days.
 * APPROVED rows are never touched: those whose leave-derived numbers are now different are listed as staleApproved.
 */
function refreshRegisterAttendance_(period) {
  register_requireColumns_();
  var ctx = register_ctx_(period), updates = [], stale = [], unchanged = 0;
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (row) {
    if (normalizePeriod(row.PAYROLL_MONTH) !== period || !isRegisterRow_(row)) return;
    var id = String(row.EMP_ID).trim(), emp = ctx.rosterMap[id];
    if (!emp || ctx.isLocked(emp.PAYROLL_CATEGORY, id)) return;
    var reg = row.REGISTER_DAYS_PRESENT;
    if (reg === '' || reg == null || isNaN(Number(reg))) return;
    var d = register_derive_(ctx, emp, Number(reg), String(row.REGISTER_INCLUDES_WO).trim().toUpperCase() === 'Y');
    if (!d.ok) return;
    var overridden = String(row.HR_OVERRIDE).trim().toUpperCase() === 'Y' && /^ATTENDANCE_DISPUTE/.test(String(row.OVERRIDE_REASON));
    var eff = overridden ? applyPhysicalOverride(d, row.PHYSICAL_PRESENT_DAYS, emp.PAYROLL_CATEGORY, period) : d;
    var same = ATT_NUM_FIELDS.every(function (k) { return attValuesEqual_(row[k], eff[k]); });
    var approved = String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED';
    if (same) { unchanged++; return; }
    if (approved) { stale.push(id); return; }
    var vals = {};
    ATT_NUM_FIELDS.forEach(function (k) { vals[k] = eff[k]; });
    vals.WORKED_DAYS = eff.WORKED_DAYS; vals.PAYABLE_DAYS = eff.WORKED_DAYS;
    vals.GENERATED_VALUES_JSON = registerValuesFromDerived(d, '', '').GENERATED_VALUES_JSON;
    var rem = register_remarks_(row.REMARKS, eff);
    if (rem !== null) vals.REMARKS = rem;
    updates.push({ row: row._row, values: vals });
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  var res = { period: period, refreshed: updates.length, unchanged: unchanged, staleApproved: stale };
  if (updates.length || stale.length) audit('REGISTER_REFRESH', period, '', res);
  return res;
}

// ===== 13_RegisterPage.gs =====
/**
 * 13_RegisterPage.gs - the HTML page of the monthly attendance register and its entry points.
 *  - menu "HR OS > Month > Open monthly attendance register" opens it as a modal dialog (no deployment needed);
 *  - doGet serves the same page when the script is also deployed as a web app (deploy "Execute as: User accessing the
 *    web app" so the runner's email is known; every server call checks it, see register_requireUser_).
 * The page never reads or shows anything but employee code, name and the days figure.
 */
function registerPageHtml_() {
  return [
    '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">',
    '<title>Monthly attendance register</title>',
    '<style>',
    'body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#202124}',
    'h2{margin:0 0 8px}fieldset{margin:10px 0;border:1px solid #c9ced6;border-radius:4px}',
    'legend{font-weight:bold}label{margin-right:16px}',
    'table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #d5d9e0;padding:4px 8px;text-align:left}',
    'th{background:#f1f3f4;position:sticky;top:0}td.num{width:140px}input.days{width:100px}',
    '.pop td{background:#e8eefc;font-weight:bold}.note{color:#5f6368;font-size:12px}',
    '#msg{margin-top:12px;white-space:pre-wrap}.err{color:#b00020}.ok{color:#1b7f3b}',
    'button{padding:6px 14px;margin-right:8px}',
    '</style></head><body>',
    '<h2>Monthly attendance register</h2>',
    '<div>Period <input id="period" type="month"> <button id="load">Load</button>',
    ' <span class="note">One number per employee. Weekly offs, holidays and approved leave are added automatically.</span></div>',
    '<div id="cats"></div>',
    '<table id="tbl"><thead><tr><th>Employee</th><th>Days present</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table>',
    '<p><button id="submit" disabled>Submit register</button><span class="note">Only PENDING attendance rows are written; approved or locked rows are skipped.</span></p>',
    '<div id="msg"></div>',
    '<script>',
    'var state=null;',
    'function el(t,a,txt){var e=document.createElement(t);if(a)for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e;}',
    'function say(t,c){var m=document.getElementById("msg");m.className=c||"";m.textContent=t;}',
    'function fail(e){say(String(e&&e.message?e.message:e),"err");document.getElementById("submit").disabled=false;}',
    'function render(d){',
    ' state=d;say("");document.getElementById("period").value=d.period;',
    ' var cats=document.getElementById("cats");cats.textContent="";',
    ' d.populations.forEach(function(p){',
    '  var f=el("fieldset");f.appendChild(el("legend",null,p.population));',
    '  [["N","Days present EXCLUDES weekly offs"],["Y","Days present INCLUDES weekly offs"]].forEach(function(o){',
    '   var l=el("label");var r=el("input",{type:"radio",name:"inc_"+p.population,value:o[0]});if(p.includesWO===o[0])r.checked=true;',
    '   l.appendChild(r);l.appendChild(document.createTextNode(" "+o[1]));f.appendChild(l);});',
    '  cats.appendChild(f);});',
    ' var body=document.getElementById("rows");body.textContent="";var last="";',
    ' d.employees.forEach(function(e){',
    '  if(e.population!==last){last=e.population;var h=el("tr",{"class":"pop"});var c=el("td",{colspan:"3"},e.population);h.appendChild(c);body.appendChild(h);}',
    '  var tr=el("tr");tr.appendChild(el("td",null,e.empId+" \\u2013 "+e.name));',
    '  var td=el("td",{"class":"num"});var i=el("input",{type:"number","class":"days","data-emp":e.empId,min:"0",max:String(d.daysInMonth),step:"0.5"});',
    '  if(e.days!=="")i.value=e.days;if(e.state!=="OPEN")i.disabled=true;td.appendChild(i);tr.appendChild(td);',
    '  tr.appendChild(el("td",null,e.state==="OPEN"?"":e.state));body.appendChild(tr);});',
    ' document.getElementById("submit").disabled=false;}',
    'document.getElementById("load").onclick=function(){say("Loading...");',
    ' google.script.run.withSuccessHandler(render).withFailureHandler(fail).registerApiLoad(document.getElementById("period").value||"");};',
    'document.getElementById("submit").onclick=function(){',
    ' if(!state)return;var inc={};state.populations.forEach(function(p){var r=document.querySelector("input[name=inc_"+p.population+"]:checked");inc[p.population]=r?r.value:"N";});',
    ' var entries=[];Array.prototype.forEach.call(document.querySelectorAll("input.days"),function(i){if(i.disabled)return;entries.push({empId:i.getAttribute("data-emp"),days:i.value});});',
    ' document.getElementById("submit").disabled=true;say("Saving...");',
    ' google.script.run.withSuccessHandler(function(r){document.getElementById("submit").disabled=false;',
    '  var t="Saved "+r.written+" row(s) ("+r.created+" new, "+r.updated+" updated).";',
    '  if(r.notEntered.length)t+="\\nNot entered: "+r.notEntered.length;',
    '  if(r.skippedApproved.length)t+="\\nSkipped (already APPROVED): "+r.skippedApproved.join(", ");',
    '  if(r.skippedLocked.length)t+="\\nSkipped (LOCKED): "+r.skippedLocked.join(", ");',
    '  if(r.exceptions.length)t+="\\nEXCEPTIONS (employee will be on HOLD): "+r.exceptions.map(function(x){return x.EMP_ID+" "+x.code;}).join("; ");',
    '  if(r.warnings.length)t+="\\nWarnings: "+r.warnings.map(function(x){return x.EMP_ID+" "+x.code;}).join("; ");',
    '  say(t,r.exceptions.length?"err":"ok");}).withFailureHandler(fail).registerApiSubmit({period:state.period,includesWO:inc,entries:entries});};',
    'document.getElementById("load").click();',
    '</script></body></html>'
  ].join('\n');
}

/** Web-app entry (only used when the script is deployed as a web app). */
function doGet(e) {
  return HtmlService.createHtmlOutput(registerPageHtml_()).setTitle('HR OS - Monthly attendance register');
}

/** Menu entry: the register as a modal dialog of the spreadsheet (no deployment needed). */
function registerOpenDialog() {
  var out = HtmlService.createHtmlOutput(registerPageHtml_()).setWidth(980).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(out, 'Monthly attendance register');
  return null;
}

/** google.script.run: page data. */
function registerApiLoad(period) { return JSON.parse(JSON.stringify(registerLoad(period))); }

/** google.script.run: submit. Serialised with the script lock so two submissions cannot interleave. */
function registerApiSubmit(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return JSON.parse(JSON.stringify(registerSubmit(payload)));
  } finally {
    lock.releaseLock();
  }
}

// ===== 14_Employees.gs =====
/**
 * 14_Employees.gs - HR-only "Add or update employee" and "Mark employee exit" (modal dialog, no Google Form, so the
 * sensitive statutory IDs never land in a form-response tab). Pure validation / row building first (Node-testable),
 * sheet-touching server functions after. Runner must be HR_APPROVER_EMAIL or OWNER_APPROVER_EMAIL.
 *
 * Add / update writes EMPLOYEE_MASTER (STATUS_AS_SOURCE Active, VALIDATION_STATE PENDING_HR_APPROVAL), a NEW
 * effective-dated SALARY_STRUCTURE / PAYROLL_RATE_PROFILE row (VERSION_STATE PENDING, HR_APPROVED_BY blank; older rows are
 * never touched, a salary revision is just a later row) and, when given, the statutory IDs into the hidden protected
 * EMPLOYEE_STATUTORY_IDS tab only. Until HR approves the new row (Payroll > Approve salary structure) the employee is on
 * HOLD (SALARY_NOT_APPROVED), the rest of the population is not blocked.
 */
var EMP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-]{1,24}$/;
/** SALARY_STRUCTURE components (input key -> column) per calc method; every other component is written as 0. */
var EMP_SALARY_COLUMNS = { BASIC: 'BASIC_PM_INR', HRA: 'HRA_PM_INR', CONVEYANCE: 'CONVEYANCE_PM_INR', EDUCATION: 'EDUCATION_PM_INR',
  MEDICAL: 'MEDICAL_PM_INR', PRO_DEV: 'PRO_DEV_PM_INR', COMMUNICATION: 'COMMUNICATION_PM_INR', UNIFORM: 'UNIFORM_PM_INR',
  WASHING: 'WASHING_PM_INR' };
var EMP_COMPONENTS_STAFF = ['BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'MEDICAL', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'WASHING'];
var EMP_COMPONENTS_WORKER = ['BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'WASHING'];
var EMP_OT_METHODS = ['DAILY_RATE_DIV_8_X_OT_HOURS', 'MONTHLY_GROSS_DIV_WORKING_DAYS_DIV_8_X_OT_HOURS',
  'BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM'];
var EMP_PAY_BASES = ['DAILY_RATE', 'MONTHLY_GROSS_PRORATED'];
var EMP_DIALOG_SOURCE = 'HR_OS_DIALOG';

// ================================================================ pure

function emp_str_(v) { return String(v == null ? '' : v).trim(); }

/** Number of a form field: blank -> 0; anything not a finite number -> NaN. */
function emp_num_(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'boolean') return NaN;
  var n = Number(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : NaN;
}

/** 'YYYY-MM-DD' (date input) or 'dd/mm/yyyy' -> ISO date, '' when it is not a real date. */
function emp_isoDate_(v) {
  var s = emp_str_(v), y, m, d;
  var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s), b = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (a) { y = +a[1]; m = +a[2]; d = +a[3]; } else if (b) { d = +b[1]; m = +b[2]; y = +b[3]; } else return '';
  var dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return y + '-' + pad2_(m) + '-' + pad2_(d);
}

/** ISO date -> 'dd/mm/yyyy' (the text format DOJ_AS_SOURCE uses, read day-first by the roster rule). */
function emp_dojText_(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }

function emp_components_(method) { return method === 'PERMANENT_WORKER' ? EMP_COMPONENTS_WORKER : EMP_COMPONENTS_STAFF; }

/**
 * Pure. SALARY_STRUCTURE values from the dialog's salary section.
 * salary = {BASIC, HRA, CONVEYANCE, EDUCATION, MEDICAL, PRO_DEV, COMMUNICATION, UNIFORM, WASHING, heat (150|0|true|false),
 * vda, production}. STAFF: the nine components; PERMANENT_WORKER: BASIC, HRA, CONVEYANCE, EDUCATION, WASHING + heat flag
 * (150 or 0), VDA master, production master. FIXED_GROSS_PM_AS_SOURCE_INR is the auto-sum of everything entered
 * (worker: the five components + the heat amount 150 + VDA master + production master).
 * Returns {errors, values:{column: number}, fixedGross}.
 */
function emp_salaryValues(method, salary) {
  var errors = [], values = {}, sal = salary || {}, sum = 0;
  Object.keys(EMP_SALARY_COLUMNS).forEach(function (k) { values[EMP_SALARY_COLUMNS[k]] = 0; });
  values.HEAT_MASTER_INR = 0; values.VDA_MASTER_INR = 0; values.PRODUCTION_MASTER_INR = 0;
  emp_components_(method).forEach(function (k) {
    var n = emp_num_(sal[k]);
    if (isNaN(n) || n < 0) { errors.push(k + ' must be a number >= 0'); return; }
    values[EMP_SALARY_COLUMNS[k]] = n;
    sum += n;
  });
  if (method === 'PERMANENT_WORKER') {
    var heat = sal.heat === true || sal.heat === 'true' ? 150 : (sal.heat === false || sal.heat === 'false' ? 0 : emp_num_(sal.heat));
    if (heat !== 0 && heat !== 150) errors.push('Heat must be 150 (heat allowance) or 0');
    else { values.HEAT_MASTER_INR = heat; sum += heat; }
    var vda = emp_num_(sal.vda), prod = emp_num_(sal.production);
    if (isNaN(vda) || vda < 0) errors.push('VDA master must be a number >= 0'); else { values.VDA_MASTER_INR = vda; sum += vda; }
    if (isNaN(prod) || prod < 0) errors.push('Production master must be a number >= 0'); else { values.PRODUCTION_MASTER_INR = prod; sum += prod; }
  }
  if (!errors.length && !(values.BASIC_PM_INR > 0)) errors.push('BASIC must be greater than 0');
  var fg = Math.round(sum * 100) / 100;
  if (!errors.length && !(fg > 0)) errors.push('Fixed gross must be greater than 0');
  values.FIXED_GROSS_PM_AS_SOURCE_INR = fg;
  return { errors: errors, values: values, fixedGross: fg };
}

/** Pure. PAYROLL_RATE_PROFILE values from the dialog's rate section {payBasis, rate, monthlyGross, otMethod}. */
function emp_rateValues(method, rate) {
  var errors = [], r = rate || {}, values = {};
  var basis = emp_str_(r.payBasis).toUpperCase();
  if (EMP_PAY_BASES.indexOf(basis) < 0) errors.push('PAY_BASIS must be DAILY_RATE or MONTHLY_GROSS_PRORATED');
  if (method === 'PUNE_STAFF' && basis && basis !== 'MONTHLY_GROSS_PRORATED') errors.push('This category requires MONTHLY_GROSS_PRORATED');
  var rateAmt = emp_num_(r.rate), gross = emp_num_(r.monthlyGross);
  if (basis === 'DAILY_RATE') {
    if (isNaN(rateAmt) || !(rateAmt > 0)) errors.push('Daily rate must be a number greater than 0');
    values.RATE_AMOUNT_INR = rateAmt; values.MONTHLY_GROSS_INR = '';
  } else if (basis === 'MONTHLY_GROSS_PRORATED') {
    if (isNaN(gross) || !(gross > 0)) errors.push('Monthly gross must be a number greater than 0');
    values.MONTHLY_GROSS_INR = gross; values.RATE_AMOUNT_INR = '';
  }
  var ot = emp_str_(r.otMethod).toUpperCase();
  if (!ot) ot = basis === 'DAILY_RATE' ? EMP_OT_METHODS[0] : (method === 'PUNE_STAFF' ? EMP_OT_METHODS[1] : EMP_OT_METHODS[2]);
  if (EMP_OT_METHODS.indexOf(ot) < 0) errors.push('OT_METHOD must be one of ' + EMP_OT_METHODS.join(', '));
  values.PAY_BASIS = basis; values.OT_METHOD = ot;
  return { errors: errors, values: values };
}

/** Pure. Statutory IDs from the dialog: {fields:{UAN,ESI_NO,PAN,BANK_NAME,BANK_ACCOUNT,IFSC}} of the non-blank ones, errors, warnings. */
function emp_idValues(ids) {
  var i = ids || {}, out = { fields: {}, errors: [], warnings: [] };
  var map = { UAN: 'uan', ESI_NO: 'esiNo', PAN: 'pan', BANK_NAME: 'bankName', BANK_ACCOUNT: 'bankAccount', IFSC: 'ifsc' };
  Object.keys(map).forEach(function (f) {
    var v = emp_str_(i[map[f]]);
    if (v) out.fields[f] = (f === 'PAN' || f === 'IFSC') ? v.toUpperCase() : v;
  });
  if (out.fields.PAN && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(out.fields.PAN)) out.errors.push('PAN looks wrong (expected 5 letters, 4 digits, 1 letter)');
  if (out.fields.IFSC && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(out.fields.IFSC)) out.errors.push('IFSC looks wrong (expected 4 letters, 0, 6 characters)');
  if (out.fields.UAN && !/^\d{12}$/.test(out.fields.UAN)) out.warnings.push('UAN is normally 12 digits');
  if (out.fields.ESI_NO && !/^\d{10}$|^\d{17}$/.test(out.fields.ESI_NO)) out.warnings.push('ESI number is normally 10 or 17 digits');
  if (out.fields.BANK_ACCOUNT && !/^\d{6,20}$/.test(out.fields.BANK_ACCOUNT)) out.warnings.push('Bank account is normally 6-20 digits');
  return out;
}

/**
 * Pure. Validates the whole dialog payload. ctx = {mode:'ADD'|'UPDATE', category: config entry of the chosen category (or
 * null), master: existing EMPLOYEE_MASTER rows of the EMP_ID, latestPay: the latest existing row of the pay tab for the
 * EMP_ID (or null), payRows: all rows of the EMP_ID in the pay tab, minPeriod}. Returns
 * {errors, warnings, mode, empId, master:{...}, pay:null|{kind:'SALARY'|'RATE', values, effectiveFrom, unchanged}, ids:{fields}}.
 */
function empValidateInput(input, ctx) {
  var errors = [], warnings = [], inp = input || {};
  var mode = emp_str_(inp.mode).toUpperCase() === 'UPDATE' ? 'UPDATE' : 'ADD';
  var empId = emp_str_(inp.empId);
  if (!EMP_ID_PATTERN.test(empId)) errors.push('EMP_ID must be 2-25 letters / digits / . _ - (got "' + empId + '")');
  var existing = ctx.master || [];
  if (mode === 'ADD' && existing.length) errors.push('EMP_ID ' + empId + ' already exists in EMPLOYEE_MASTER (use Update; a re-hire needs a new EMP_ID)');
  if (mode === 'UPDATE' && !existing.length) errors.push('EMP_ID ' + empId + ' is not in EMPLOYEE_MASTER (use Add)');
  var name = emp_str_(inp.name), email = emp_str_(inp.email);
  if (!name) errors.push('Name is required');
  if (name.length > 120) errors.push('Name is too long');
  if (email && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) errors.push('Email address is not valid');
  var cat = ctx.category;
  if (!cat || !cat.active) errors.push('Category "' + emp_str_(inp.category) + '" is not an active category of PAYROLL_CATEGORY_CONFIG');
  var doj = emp_isoDate_(inp.doj);
  if (mode === 'ADD' && !doj) errors.push('Date of joining is required (a real date)');
  if (mode === 'UPDATE' && emp_str_(inp.doj) && !doj) errors.push('Date of joining is not a real date');
  var master = { EMP_ID: empId, EMPLOYEE_NAME: name, EMAIL_ID: email, PAYROLL_CATEGORY: cat ? cat.code : emp_str_(inp.category),
    DEPARTMENT: emp_str_(inp.department), DESIGNATION: emp_str_(inp.designation), DOJ_ISO: doj };
  var site = emp_str_(inp.site).toUpperCase();
  if (cat && site && site !== cat.site) warnings.push('Site ' + site + ' differs from the category site ' + cat.site + ' (the category site is used)');

  // pay section
  var pay = null;
  var oldCat = existing.length ? emp_str_(existing[0].PAYROLL_CATEGORY) : '';
  var catChanged = mode === 'UPDATE' && cat && oldCat && oldCat !== cat.code;
  var wantsPay = mode === 'ADD' || !!inp.salary || !!inp.rate || catChanged;
  if (cat && cat.active && wantsPay) {
    var salaryKind = cat.rateSource !== 'RATE_PROFILE';
    var block = salaryKind ? inp.salary : inp.rate;
    if (!block) {
      errors.push((salaryKind ? 'The salary structure' : 'The rate profile') + ' section is required' + (catChanged ? ' when the category changes' : ' for a new employee'));
    } else {
      var res = salaryKind ? emp_salaryValues(cat.method, block) : emp_rateValues(cat.method, block);
      res.errors.forEach(function (e) { errors.push(e); });
      var em = emp_str_(inp.effectiveMonth);
      if (em && !/^\d{4}-(0[1-9]|1[0-2])$/.test(em)) errors.push('Effective month must be YYYY-MM');
      var month = em || (mode === 'ADD' && doj ? doj.slice(0, 7) : '');
      if (mode === 'UPDATE' && !em) errors.push('Choose the effective month of the salary revision');
      if (mode === 'ADD' && !month) errors.push('Effective month cannot be derived (date of joining missing)');
      if (mode === 'UPDATE' && em && ctx.minPeriod && em < ctx.minPeriod) errors.push('Effective month ' + em + ' is earlier than MIN_PERIOD ' + ctx.minPeriod);
      var effectiveFrom = month ? month + '-01' : '';
      if (effectiveFrom && (ctx.payRows || []).some(function (r) { return engine_dateLo_(r.EFFECTIVE_FROM) === effectiveFrom; })) {
        errors.push('A row effective from ' + effectiveFrom + ' already exists for ' + empId + ' - choose a later effective month');
      }
      if (!res.errors.length) {
        pay = { kind: salaryKind ? 'SALARY' : 'RATE', values: res.values, effectiveFrom: effectiveFrom, unchanged: false };
        // an update whose numbers equal the latest row is not a revision
        if (mode === 'UPDATE' && !catChanged && ctx.latestPay) {
          var same = Object.keys(res.values).every(function (col) {
            var a = ctx.latestPay[col], b = res.values[col];
            if (b === '' || b == null) return a === '' || a == null || Number(a) === 0;
            return String(a).trim().toUpperCase() === String(b).trim().toUpperCase() || (isFinite(Number(a)) && Number(a) === Number(b));
          });
          if (same) pay.unchanged = true;
        }
      }
    }
  }
  var ids = emp_idValues(inp.ids);
  ids.errors.forEach(function (e) { errors.push(e); });
  ids.warnings.forEach(function (w) { warnings.push(w); });
  return { errors: errors, warnings: warnings, mode: mode, empId: empId, master: master, pay: pay, ids: ids.fields, catChanged: !!catChanged };
}

/**
 * Pure. Validates an exit. ctx = {master: rows of the EMP_ID}. Returns {errors, lwd (ISO), row (the master row to update)}.
 * The last working day cannot be before the date of joining; an already-exited employee may have the date corrected.
 */
function empValidateExit(empId, lastWorkingDay, ctx) {
  var errors = [], rows = (ctx && ctx.master) || [], id = emp_str_(empId);
  var lwd = emp_isoDate_(lastWorkingDay);
  if (!id) errors.push('EMP_ID is required');
  if (!lwd) errors.push('Last working day must be a real date');
  var target = null;
  if (id) {
    if (!rows.length) errors.push('EMP_ID ' + id + ' is not in EMPLOYEE_MASTER');
    else {
      var active = rows.filter(function (r) { return emp_str_(r.STATUS_AS_SOURCE).toLowerCase() === 'active'; });
      if (active.length > 1) errors.push('EMP_ID ' + id + ' has more than one Active row in EMPLOYEE_MASTER - resolve the duplicate first');
      else if (active.length === 1) target = active[0];
      else {
        var leaver = rows.filter(function (r) { return emp_str_(masterLastWorkingDay_(r)) !== ''; });
        target = leaver[0] || null;
        if (!target) errors.push('EMP_ID ' + id + ' is not Active (nothing to exit)');
      }
    }
  }
  if (target && lwd) {
    var doj = typeof parseDoj === 'function' ? parseDoj(target.DOJ_AS_SOURCE) : '';
    if (doj && lwd < doj) errors.push('Last working day ' + lwd + ' is before the date of joining ' + doj);
  }
  return { errors: errors, lwd: lwd, row: target };
}

// ================================================================ sheet-touching

/** Throws unless the runner is HR_APPROVER_EMAIL or OWNER_APPROVER_EMAIL. Returns the email. */
function emp_requireUser_() {
  var user = approval_userEmail_();
  if (!user) throw new Error('Cannot determine your Google account email - nothing was saved');
  var ctl = readControlMap();
  if (!registerUserAllowed(user, ctl.HR_APPROVER_EMAIL, ctl.OWNER_APPROVER_EMAIL, '')) {
    throw new Error('Not allowed: ' + user + ' is not HR_APPROVER_EMAIL or OWNER_APPROVER_EMAIL');
  }
  return user;
}

function emp_masterRows_(empId) {
  var want = emp_str_(empId).toLowerCase();
  return readObjects(TABS.EMPLOYEE_MASTER).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === want; });
}

function emp_requireColumns_(tab, cols) {
  var headers = getHeaders(resolveSheet_(tab));
  var missing = cols.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) throw new Error(tab + ' lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup > Run setup)');
  return headers;
}

/** Latest row of an EMP_ID in a pay tab by EFFECTIVE_FROM (blank = oldest), ties later row. */
function emp_latestPay_(rows) {
  var best = null;
  (rows || []).forEach(function (r, i) {
    var from = engine_dateLo_(r.EFFECTIVE_FROM) || '0000-00-00';
    if (!best || from > best.from || (from === best.from && i >= best.i)) best = { from: from, i: i, row: r };
  });
  return best ? best.row : null;
}

function emp_payRowsOf_(tab, empId) {
  var want = emp_str_(empId).toLowerCase();
  if (!getSheet(tab)) return [];
  return readObjects(tab).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === want; });
}

/** Refresh the daily-form rosters after a joiner / leaver; never fails the save. Returns a short note. */
function emp_refreshRosters_() {
  try {
    var r = refreshAttendanceFormRosters();
    return { ok: true, updated: (r.updated || []).length, added: (r.added || []).length, removed: (r.removed || []).length };
  } catch (e) {
    return { ok: false, note: 'form rosters not refreshed (run HR OS > Setup > Refresh form rosters): ' + String(e && e.message ? e.message : e) };
  }
}

/** Upserts the statutory IDs of one employee into EMPLOYEE_STATUTORY_IDS (the only tab that holds them). Returns fields written. */
function emp_writeStatutoryIds_(empId, fields) {
  var names = Object.keys(fields);
  if (!names.length) return 0;
  var sheet = resolveSheet_(TABS.EMPLOYEE_STATUTORY_IDS);
  emp_requireColumns_(TABS.EMPLOYEE_STATUTORY_IDS, HROS_STATUTORY_ID_HEADERS);
  var text = HROS_STATUTORY_ID_HEADERS;
  var hit = readObjects(sheet).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === emp_str_(empId).toLowerCase(); })[0];
  if (hit) updateRows(sheet, [{ row: hit._row, values: fields }], { textHeaders: text });
  else { var o = { EMP_ID: empId }; names.forEach(function (n) { o[n] = fields[n]; }); appendObjects(sheet, [o], { textHeaders: text }); }
  return names.length;
}

/**
 * Save the dialog: Add (new EMP_ID) or Update. Nothing is written when validation fails. payload: see empValidateInput
 * (mode, empId, name, email, doj, category, department, designation, site, effectiveMonth, salary | rate, ids).
 */
function empSave(payload) {
  var user = emp_requireUser_();
  var inp = payload || {};
  var mode = emp_str_(inp.mode).toUpperCase() === 'UPDATE' ? 'UPDATE' : 'ADD';
  var empId = emp_str_(inp.empId);
  var cat = categoryEntry(inp.category);
  var masterRows = emp_masterRows_(empId);
  var payTab = cat && cat.rateSource === 'RATE_PROFILE' ? TABS.PAYROLL_RATE_PROFILE : TABS.SALARY_STRUCTURE;
  var payRows = emp_payRowsOf_(payTab, empId);
  var v = empValidateInput(inp, { mode: mode, category: cat, master: masterRows, payRows: payRows, latestPay: emp_latestPay_(payRows),
    minPeriod: getMinPeriod() });
  if (v.errors.length) throw new Error('Employee not saved - fix these first: ' + v.errors.join('; '));
  // a salary revision must not start in a LOCKED period of the category
  if (v.pay && !v.pay.unchanged && mode === 'UPDATE' && isLocked(v.pay.effectiveFrom.slice(0, 7), cat.code)) {
    throw new Error('Employee not saved - ' + v.pay.effectiveFrom.slice(0, 7) + ' x ' + cat.code + ' is LOCKED; choose a later effective month');
  }
  var masterHeaders = emp_requireColumns_(TABS.EMPLOYEE_MASTER, ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE']);
  if (Object.keys(v.ids).length) {
    if (!getSheet(TABS.EMPLOYEE_STATUTORY_IDS)) throw new Error('Tab EMPLOYEE_STATUTORY_IDS is missing (run HR OS > Setup > Run setup); nothing was saved');
    emp_requireColumns_(TABS.EMPLOYEE_STATUTORY_IDS, HROS_STATUTORY_ID_HEADERS);
  }
  if (v.pay && !v.pay.unchanged) emp_requireColumns_(payTab, ['EMP_ID', 'EFFECTIVE_FROM', 'VERSION_STATE', 'HR_APPROVED_BY']);
  var has = function (h) { return masterHeaders.indexOf(h) >= 0; };
  var today = nowIso_().slice(0, 10);
  var res = { ok: true, mode: mode, empId: empId, category: cat.code, changed: [], salary: null, statutoryFieldsWritten: 0,
    warnings: v.warnings, pendingHrApproval: false };

  // 1. EMPLOYEE_MASTER
  if (mode === 'ADD') {
    var row = { EMP_ID: empId, EMPLOYEE_NAME: v.master.EMPLOYEE_NAME, PAYROLL_CATEGORY: cat.code, STATUS_AS_SOURCE: 'Active' };
    var opt = { EMAIL_ID: v.master.EMAIL_ID, DOJ_AS_SOURCE: emp_dojText_(v.master.DOJ_ISO), DEPARTMENT: v.master.DEPARTMENT,
      DESIGNATION: v.master.DESIGNATION, PLANT_TO_VERIFY: cat.site, DUPLICATE_FLAG: 'NONE', VALIDATION_STATE: 'PENDING_HR_APPROVAL',
      SOURCE_TAB: EMP_DIALOG_SOURCE, SOURCE_SNAPSHOT_DATE: today, REVIEW_NOTE: 'added by ' + user };
    Object.keys(opt).forEach(function (k) { if (has(k)) row[k] = opt[k]; });
    appendObjects(TABS.EMPLOYEE_MASTER, [row], { textHeaders: ['EMP_ID', 'DOJ_AS_SOURCE', 'LAST_WORKING_DAY', 'SOURCE_SNAPSHOT_DATE'] });
    res.changed = ['NEW_EMPLOYEE'];
    res.pendingHrApproval = true;
  } else {
    var cur = masterRows.filter(function (r) { return emp_str_(r.STATUS_AS_SOURCE).toLowerCase() === 'active'; })[0] || masterRows[0];
    var vals = {};
    var set = function (col, val, old) { if (has(col) && emp_str_(val) !== '' && emp_str_(val) !== emp_str_(old)) { vals[col] = val; res.changed.push(col); } };
    set('EMPLOYEE_NAME', v.master.EMPLOYEE_NAME, cur.EMPLOYEE_NAME);
    set('EMAIL_ID', v.master.EMAIL_ID, cur.EMAIL_ID);
    set('DEPARTMENT', v.master.DEPARTMENT, cur.DEPARTMENT);
    set('DESIGNATION', v.master.DESIGNATION, cur.DESIGNATION);
    set('PAYROLL_CATEGORY', cat.code, cur.PAYROLL_CATEGORY);
    if (v.master.DOJ_ISO) set('DOJ_AS_SOURCE', emp_dojText_(v.master.DOJ_ISO), cur.DOJ_AS_SOURCE);
    if (v.pay && !v.pay.unchanged && has('VALIDATION_STATE')) { vals.VALIDATION_STATE = 'PENDING_HR_APPROVAL'; res.pendingHrApproval = true; }
    if (Object.keys(vals).length) updateRows(TABS.EMPLOYEE_MASTER, [{ row: cur._row, values: vals }], { textHeaders: ['DOJ_AS_SOURCE'] });
  }

  // 2. new effective-dated pay row (older rows are never touched)
  if (v.pay && v.pay.unchanged) res.salary = { added: false, note: 'numbers equal the latest row - no new row' };
  else if (v.pay) {
    var pr = Object.assign({ EMP_ID: empId, PAYROLL_CATEGORY: cat.code, EFFECTIVE_FROM: v.pay.effectiveFrom, EFFECTIVE_TO: '',
      VERSION_STATE: 'PENDING', HR_APPROVED_BY: '', HR_APPROVED_AT: '' }, v.pay.values);
    var ph = getHeaders(resolveSheet_(payTab));
    if (v.pay.kind === 'SALARY') {
      pr.SOURCE_TAB = EMP_DIALOG_SOURCE; pr.SOURCE_PAYROLL_MONTH = ''; pr.EMPLOYMENT_STATUS_AT_SOURCE = 'Active';
      pr.VALIDATION_NOTE = 'added by ' + user + ' via the employee dialog; HR must approve';
    } else {
      pr.ATTENDANCE_REQUIRED = 'YES'; pr.WORKING_DAYS_REQUIRED = 'YES'; pr.PRESENT_DAYS_REQUIRED = 'YES'; pr.WORKED_DAYS_REQUIRED = 'YES';
      pr.NOTE = 'added by ' + user + ' via the employee dialog; HR must approve';
    }
    var clean = {};
    Object.keys(pr).forEach(function (k) { if (ph.indexOf(k) >= 0) clean[k] = pr[k]; });
    appendObjects(payTab, [clean], { textHeaders: ['EFFECTIVE_FROM', 'EFFECTIVE_TO'] });
    res.salary = { added: true, tab: payTab, effectiveFrom: v.pay.effectiveFrom, versionState: 'PENDING' };
    res.pendingHrApproval = true;
  }

  // 3. statutory IDs: only ever into EMPLOYEE_STATUTORY_IDS (values are never returned, logged or audited)
  res.statutoryFieldsWritten = emp_writeStatutoryIds_(empId, v.ids);

  res.rosterRefresh = emp_refreshRosters_();
  audit(mode === 'ADD' ? 'EMPLOYEE_ADD' : 'EMPLOYEE_UPDATE', '', cat.code, { by: user, empId: empId, changed: res.changed,
    salaryRow: res.salary && res.salary.added ? 'PENDING effective ' + res.salary.effectiveFrom : 'none',
    statutoryFields: res.statutoryFieldsWritten, pendingHrApproval: res.pendingHrApproval });
  return res;
}

/**
 * Mark an employee's exit: LAST_WORKING_DAY is set and STATUS_AS_SOURCE becomes Non-Active. The roster keeps the employee
 * for every period up to the month of the last working day (leaver rule), then drops him; there is no automatic
 * proration - HR enters the days worked in the register.
 */
function empMarkExit(empId, lastWorkingDay) {
  var user = emp_requireUser_();
  var v = empValidateExit(empId, lastWorkingDay, { master: emp_masterRows_(empId) });
  if (v.errors.length) throw new Error('Exit not saved - ' + v.errors.join('; '));
  emp_requireColumns_(TABS.EMPLOYEE_MASTER, ['STATUS_AS_SOURCE', 'LAST_WORKING_DAY']);
  var prev = emp_str_(masterLastWorkingDay_(v.row));
  updateRows(TABS.EMPLOYEE_MASTER, [{ row: v.row._row, values: { STATUS_AS_SOURCE: 'Non-Active', LAST_WORKING_DAY: v.lwd } }],
    { textHeaders: ['LAST_WORKING_DAY'] });
  var res = { ok: true, empId: emp_str_(empId), lastWorkingDay: v.lwd, status: 'Non-Active', onRosterThrough: v.lwd.slice(0, 7),
    previousLastWorkingDay: prev, note: 'The employee stays on the roster for periods up to ' + v.lwd.slice(0, 7) +
      '; days worked are entered in the register (no automatic proration).' };
  res.rosterRefresh = emp_refreshRosters_();
  audit('EMPLOYEE_EXIT', '', emp_str_(v.row.PAYROLL_CATEGORY), { by: user, empId: res.empId, lastWorkingDay: v.lwd, previous: prev });
  return res;
}

/** Page data: active categories, departments already in use, the runner. No employee data. */
function empLoad() {
  var user = emp_requireUser_();
  var depts = {};
  readObjects(TABS.EMPLOYEE_MASTER).forEach(function (r) { var d = emp_str_(r.DEPARTMENT); if (d) depts[d] = true; });
  return { user: user, minPeriod: getMinPeriod(), today: nowIso_().slice(0, 10), otMethods: EMP_OT_METHODS, payBases: EMP_PAY_BASES,
    departments: Object.keys(depts).sort().slice(0, 200),
    categories: categoryList().map(function (e) {
      return { code: e.code, name: e.displayName, site: e.site, method: e.method, rateSource: e.rateSource };
    }) };
}

/**
 * Lookup for the dialog (update / exit): master fields, latest pay row values and, for the statutory IDs, only whether a
 * value is on file (never the value itself).
 */
function empLookup(empId) {
  emp_requireUser_();
  var rows = emp_masterRows_(empId);
  if (!rows.length) return { exists: false };
  var cur = rows.filter(function (r) { return emp_str_(r.STATUS_AS_SOURCE).toLowerCase() === 'active'; })[0] || rows[0];
  var cat = categoryEntry(cur.PAYROLL_CATEGORY);
  var out = { exists: true, name: emp_str_(cur.EMPLOYEE_NAME), email: emp_str_(cur.EMAIL_ID), category: emp_str_(cur.PAYROLL_CATEGORY),
    status: emp_str_(cur.STATUS_AS_SOURCE), department: emp_str_(cur.DEPARTMENT), designation: emp_str_(cur.DESIGNATION),
    doj: typeof parseDoj === 'function' ? parseDoj(cur.DOJ_AS_SOURCE) : '', lastWorkingDay: toIsoDate(masterLastWorkingDay_(cur)),
    duplicates: rows.length > 1, idsOnFile: {} };
  var payTab = cat && cat.rateSource === 'RATE_PROFILE' ? TABS.PAYROLL_RATE_PROFILE : TABS.SALARY_STRUCTURE;
  var latest = emp_latestPay_(emp_payRowsOf_(payTab, empId));
  if (latest) {
    out.pay = { kind: payTab === TABS.SALARY_STRUCTURE ? 'SALARY' : 'RATE', effectiveFrom: engine_dateLo_(latest.EFFECTIVE_FROM),
      versionState: emp_str_(latest.VERSION_STATE), approved: payTab === TABS.SALARY_STRUCTURE ? emp_str_(latest.HR_APPROVED_BY) !== '' : calc_isRateApproved(latest), values: {} };
    var cols = payTab === TABS.SALARY_STRUCTURE
      ? Object.keys(EMP_SALARY_COLUMNS).map(function (k) { return [k, EMP_SALARY_COLUMNS[k]]; }).concat([['heat', 'HEAT_MASTER_INR'], ['vda', 'VDA_MASTER_INR'], ['production', 'PRODUCTION_MASTER_INR']])
      : [['payBasis', 'PAY_BASIS'], ['rate', 'RATE_AMOUNT_INR'], ['monthlyGross', 'MONTHLY_GROSS_INR'], ['otMethod', 'OT_METHOD']];
    cols.forEach(function (c) { out.pay.values[c[0]] = latest[c[1]] === undefined ? '' : latest[c[1]]; });
  }
  if (getSheet(TABS.EMPLOYEE_STATUTORY_IDS)) {
    var hit = readObjects(TABS.EMPLOYEE_STATUTORY_IDS).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === emp_str_(empId).toLowerCase(); })[0];
    if (hit) HROS_STATUTORY_ID_HEADERS.slice(1).forEach(function (f) { out.idsOnFile[f] = emp_str_(hit[f]) !== ''; });
  }
  return out;
}

// ================================================================ dialog page

function empPageHtml_() {
  return [
    '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8"><title>Employees</title>',
    '<style>',
    'body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#202124;font-size:13px}h2{margin:0 0 8px}',
    'fieldset{margin:10px 0;border:1px solid #c9ced6;border-radius:4px}legend{font-weight:bold}',
    'label{display:inline-block;min-width:150px;margin:3px 0}input,select{padding:3px;margin:2px 8px 2px 0}',
    'input.w{width:230px}input.n{width:110px}.note{color:#5f6368;font-size:12px}.hidden{display:none}',
    '#msg{margin-top:12px;white-space:pre-wrap}.err{color:#b00020}.ok{color:#1b7f3b}button{padding:6px 14px;margin-right:8px}',
    '</style></head><body>',
    '<h2>Employees</h2>',
    '<div><label><input type="radio" name="mode" value="ADD" checked> Add employee</label>',
    '<label><input type="radio" name="mode" value="UPDATE"> Update employee / salary revision</label>',
    '<label><input type="radio" name="mode" value="EXIT"> Mark employee exit</label></div>',
    '<div>Employee code <input id="empId" class="n" autocomplete="off"> <button id="lookup" type="button">Load</button>',
    ' <span class="note" id="loaded"></span></div>',
    '<div id="exitBox" class="hidden"><fieldset><legend>Exit</legend><label>Last working day</label><input id="lwd" type="date">',
    '<div class="note">Status becomes Non-Active; the employee stays on the roster for periods up to that month. Days worked are entered in the register (no automatic proration).</div></fieldset></div>',
    '<div id="mainBox">',
    '<fieldset><legend>Employee</legend>',
    '<label>Name</label><input id="name" class="w"><label>Email</label><input id="email" class="w"><br>',
    '<label>Date of joining</label><input id="doj" type="date"><label>Category</label><select id="category"></select> <span class="note" id="siteNote"></span><br>',
    '<label>Department</label><input id="department" class="w" list="depts"><datalist id="depts"></datalist>',
    '<label>Designation</label><input id="designation" class="w"></fieldset>',
    '<fieldset id="salBox"><legend>Salary structure (per month, INR)</legend><div id="salFields"></div>',
    '<div id="workerFields"><label>Heat allowance</label><select id="heat"><option value="0">No</option><option value="150">Yes (150)</option></select>',
    '<label>VDA master</label><input id="vda" class="n" type="number" min="0" step="any">',
    '<label>Production master</label><input id="production" class="n" type="number" min="0" step="any"></div>',
    '<div><b>Fixed gross (auto sum): <span id="fg">0</span></b></div></fieldset>',
    '<fieldset id="rateBox"><legend>Rate profile</legend>',
    '<label>Pay basis</label><select id="payBasis"><option value="DAILY_RATE">DAILY_RATE</option><option value="MONTHLY_GROSS_PRORATED">MONTHLY_GROSS_PRORATED</option></select>',
    '<label>Daily rate</label><input id="rate" class="n" type="number" min="0" step="any">',
    '<label>Monthly gross</label><input id="monthlyGross" class="n" type="number" min="0" step="any"><br>',
    '<label>OT method</label><select id="otMethod"><option value="">(default for the basis)</option></select></fieldset>',
    '<div><label>Effective from month</label><input id="effectiveMonth" type="month"> <span class="note">Add: blank = month of joining. Revision: required; older rows are kept.</span></div>',
    '<fieldset><legend>Statutory IDs (optional; stored only in the hidden EMPLOYEE_STATUTORY_IDS tab; blank = unchanged)</legend>',
    '<label>UAN</label><input id="uan" class="w" autocomplete="off"><label>ESI number</label><input id="esiNo" class="w" autocomplete="off"><br>',
    '<label>PAN</label><input id="pan" class="w" autocomplete="off"><label>Bank name</label><input id="bankName" class="w" autocomplete="off"><br>',
    '<label>Bank account</label><input id="bankAccount" class="w" autocomplete="off"><label>IFSC</label><input id="ifsc" class="w" autocomplete="off">',
    '<div class="note" id="idsNote"></div></fieldset></div>',
    '<p><button id="save" type="button">Save</button><span class="note">New pay rows stay PENDING (employee on HOLD) until HR runs Payroll &gt; Approve salary structure.</span></p>',
    '<div id="msg"></div>',
    '<script>',
    'var LOADED_CAT="",CFG=null,STAFF=["BASIC","HRA","CONVEYANCE","EDUCATION","MEDICAL","PRO_DEV","COMMUNICATION","UNIFORM","WASHING"],WORKER=["BASIC","HRA","CONVEYANCE","EDUCATION","WASHING"];',
    'function $(i){return document.getElementById(i);}',
    'function say(t,c){var m=$("msg");m.className=c||"";m.textContent=t;}',
    'function fail(e){say(String(e&&e.message?e.message:e),"err");$("save").disabled=false;}',
    'function mode(){return document.querySelector("input[name=mode]:checked").value;}',
    'function cat(){var c=$("category").value;for(var i=0;i<CFG.categories.length;i++)if(CFG.categories[i].code===c)return CFG.categories[i];return null;}',
    'function buildSal(){var c=cat(),w=c&&c.method==="PERMANENT_WORKER",keys=w?WORKER:STAFF,h="";keys.forEach(function(k){h+="<label>"+k+"</label><input class=\\"n sal\\" id=\\"s_"+k+"\\" data-k=\\""+k+"\\" type=\\"number\\" min=\\"0\\" step=\\"any\\"> ";});',
    ' $("salFields").innerHTML=h;$("workerFields").className=w?"":"hidden";Array.prototype.forEach.call(document.querySelectorAll(".sal,#vda,#production,#heat"),function(i){i.oninput=sum;i.onchange=sum;});sum();}',
    'function sum(){var t=0;Array.prototype.forEach.call(document.querySelectorAll(".sal"),function(i){t+=Number(i.value)||0;});',
    ' var c=cat();if(c&&c.method==="PERMANENT_WORKER"){t+=(Number($("heat").value)||0)+(Number($("vda").value)||0)+(Number($("production").value)||0);}$("fg").textContent=Math.round(t*100)/100;}',
    'function layout(){var m=mode(),ex=m==="EXIT";$("exitBox").className=ex?"":"hidden";$("mainBox").className=ex?"hidden":"";var c=cat();',
    ' $("salBox").className=c&&c.rateSource==="RATE_PROFILE"?"hidden":"";$("rateBox").className=c&&c.rateSource==="RATE_PROFILE"?"":"hidden";',
    ' $("siteNote").textContent=c?("Site: "+c.site+" | calc: "+c.method):"";$("empId").readOnly=false;}',
    'function fill(d){$("loaded").textContent=d.exists?("Found: "+d.status+(d.duplicates?" (duplicate rows!)":"")):"Not found";if(!d.exists)return;',
    ' LOADED_CAT=d.category;$("name").value=d.name;$("email").value=d.email;$("category").value=d.category;$("department").value=d.department;$("designation").value=d.designation;$("doj").value=d.doj||"";$("lwd").value=d.lastWorkingDay||"";',
    ' layout();buildSal();if(d.pay){var v=d.pay.values;for(var k in v){var e=$("s_"+k)||$(k);if(e)e.value=v[k];}sum();$("loaded").textContent+=" | latest pay row from "+d.pay.effectiveFrom+" ("+(d.pay.approved?"approved":"PENDING")+")";}',
    ' var on=[];for(var f in d.idsOnFile)if(d.idsOnFile[f])on.push(f);$("idsNote").textContent=on.length?("On file: "+on.join(", ")+" (leave blank to keep)"):"";}',
    'function payload(){var p={mode:mode(),empId:$("empId").value,name:$("name").value,email:$("email").value,doj:$("doj").value,category:$("category").value,department:$("department").value,designation:$("designation").value,site:cat()?cat().site:"",effectiveMonth:$("effectiveMonth").value,',
    ' ids:{uan:$("uan").value,esiNo:$("esiNo").value,pan:$("pan").value,bankName:$("bankName").value,bankAccount:$("bankAccount").value,ifsc:$("ifsc").value}};',
    ' var c=cat(),sendPay=p.mode==="ADD"||!!$("effectiveMonth").value||(LOADED_CAT!==""&&$("category").value!==LOADED_CAT);',
    ' if(sendPay){if(c&&c.rateSource==="RATE_PROFILE"){p.rate={payBasis:$("payBasis").value,rate:$("rate").value,monthlyGross:$("monthlyGross").value,otMethod:$("otMethod").value};}',
    ' else{var s={};Array.prototype.forEach.call(document.querySelectorAll(".sal"),function(i){s[i.getAttribute("data-k")]=i.value;});s.heat=$("heat").value;s.vda=$("vda").value;s.production=$("production").value;p.salary=s;}}return p;}',
    'Array.prototype.forEach.call(document.querySelectorAll("input[name=mode]"),function(r){r.onchange=layout;});',
    '$("category").onchange=function(){layout();buildSal();};',
    '$("lookup").onclick=function(){say("Loading...");google.script.run.withSuccessHandler(function(d){say("");fill(d);}).withFailureHandler(fail).empApiLookup($("empId").value);};',
    '$("save").onclick=function(){$("save").disabled=true;say("Saving...");',
    ' if(mode()==="EXIT"){google.script.run.withSuccessHandler(function(r){$("save").disabled=false;say("Exit saved for "+r.empId+": last working day "+r.lastWorkingDay+" ("+r.status+").\\n"+r.note+(r.rosterRefresh&&!r.rosterRefresh.ok?"\\n"+r.rosterRefresh.note:""),"ok");}).withFailureHandler(fail).empApiExit({empId:$("empId").value,lastWorkingDay:$("lwd").value});return;}',
    ' google.script.run.withSuccessHandler(function(r){$("save").disabled=false;var t=(r.mode==="ADD"?"Added ":"Updated ")+r.empId+" ("+r.category+").";',
    '  if(r.salary)t+="\\nPay row: "+(r.salary.added?"added, effective "+r.salary.effectiveFrom+", PENDING HR approval":r.salary.note);',
    '  if(r.statutoryFieldsWritten)t+="\\nStatutory IDs saved ("+r.statutoryFieldsWritten+" field(s)) in the hidden tab.";',
    '  if(r.pendingHrApproval)t+="\\nThe employee is on HOLD until HR approves the salary structure (Payroll > Approve salary structure).";',
    '  if(r.warnings&&r.warnings.length)t+="\\nWarnings: "+r.warnings.join("; ");',
    '  if(r.rosterRefresh&&!r.rosterRefresh.ok)t+="\\n"+r.rosterRefresh.note;say(t,"ok");}).withFailureHandler(fail).empApiSave(payload());};',
    'google.script.run.withSuccessHandler(function(d){CFG=d;var s=$("category");d.categories.forEach(function(c){var o=document.createElement("option");o.value=c.code;o.textContent=c.name+" ("+c.code+")";s.appendChild(o);});',
    ' var dl=$("depts");d.departments.forEach(function(x){var o=document.createElement("option");o.value=x;dl.appendChild(o);});',
    ' var ot=$("otMethod");d.otMethods.forEach(function(x){var o=document.createElement("option");o.value=x;o.textContent=x;ot.appendChild(o);});layout();buildSal();',
    ' if(window.EMP_START_MODE){var r=document.querySelector("input[name=mode][value="+window.EMP_START_MODE+"]");if(r){r.checked=true;layout();}}}).withFailureHandler(fail).empApiLoad();',
    '</script></body></html>'
  ].join('\n');
}

/** Menu entry: the employee dialog (mode ADD, UPDATE or EXIT preselected). */
function empOpenDialog(startMode) {
  emp_requireUser_();
  var html = empPageHtml_();
  var mode = /^(ADD|UPDATE|EXIT)$/.test(String(startMode)) ? startMode : 'ADD';
  html = html.replace('<script>', '<script>window.EMP_START_MODE=' + JSON.stringify(mode) + ';');
  var out = HtmlService.createHtmlOutput(html).setWidth(900).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(out, mode === 'EXIT' ? 'Mark employee exit' : 'Add or update employee');
  return null;
}

/** google.script.run: page data (categories, departments). */
function empApiLoad() { return JSON.parse(JSON.stringify(empLoad())); }
/** google.script.run: lookup (never returns statutory ID values). */
function empApiLookup(empId) { return JSON.parse(JSON.stringify(empLookup(empId))); }

function emp_locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return JSON.parse(JSON.stringify(fn())); } finally { lock.releaseLock(); }
}
/** google.script.run: save, serialised with the script lock. The result never contains statutory ID values. */
function empApiSave(payload) { return emp_locked_(function () { return empSave(payload); }); }
/** google.script.run: exit. */
function empApiExit(payload) { return emp_locked_(function () { return empMarkExit((payload || {}).empId, (payload || {}).lastWorkingDay); }); }

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
var FEEDS_OT_LOCAL_TAB = 'OT_FORM_RESPONSES';      // default local OT source (the OT form is linked into this spreadsheet)
var FEEDS_OT_EXTERNAL_TAB = 'Form Responses 1';    // default tab name when an external source spreadsheet is configured

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

/** Efficiency EMP_ID key (per employee only; hyphens/spaces inside real EMP_IDs are kept). */
function feeds_effKey_(v) { return feeds_empId_(v); }

/** True for the retired blanket sentinel ALL_WORKERS / ALL WORKERS (sheet rule: per employee, no blanket). */
function feeds_isBlanketKey_(v) { return /^ALL[\s\-_]+WORKERS$/.test(feeds_empId_(v)); }

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
 * @param {Object} [opts] {firstRow: sheet row number of rows[0], default 2, enteredAt, windowStart, windowEnd
 *   (ISO dates; default = the calendar month of period, see feeds_otWindow)}
 * Reversals: events are grouped by Case No + EMP + date (case blank -> EMP + date). The LATEST decisive row
 * (Approved or Rejected, by timestamp then row) of a group wins: Rejected excludes the group, a corrected approval
 * takes the latest hours. Exception rows carry OT_HOURS = 0 and the original hours in EXCEPTION_REASON so the
 * sheet's Monthly OT Report SUMIFS is never inflated.
 * @returns {{valid:Array, exceptions:Array, pendingCount:number, pendingEmpIds:Array, duplicateSkipped:number, revokedCount:number, correctedCount:number, missingColumns:Array}}
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
  var out = { valid: [], exceptions: [], pendingCount: 0, pendingEmpIds: [], duplicateSkipped: 0, revokedCount: 0,
    correctedCount: 0, missingColumns: missing };
  if (missing.length) return out; // fail closed: nothing counted without required headers

  var pStart = opts.windowStart || periodStart(period), pEnd = opts.windowEnd || periodEnd(period);
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
    var rawH = feeds_str_(feeds_cell_(ev.row, c.hours));
    out.exceptions.push(baseRow(ev, { ELIGIBILITY: 'EXCEPTION',
      EXCEPTION_REASON: reason + (rawH ? ' | ORIGINAL_OT_HOURS=' + rawH : ''), OT_HOURS: 0, APPROVAL_STATUS: 'EXCEPTION' }));
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
      out.revokedCount++;                 // latest decision is a rejection: nothing payable, no exception
      return;
    }
    if (g.approved.length > 1) {
      var hrs = g.approved.map(function (ev) { return feeds_num_(feeds_cell_(ev.row, c.hours)); });
      var same = hrs.every(function (h) { return h === hrs[0]; });
      if (!same) out.correctedCount++;    // corrected approval: the latest hours win
      g.approved.slice(0, -1).forEach(function () { out.duplicateSkipped++; });
    }
    acceptApproved(latestApproved);
  });

  return out;
}

/**
 * OT window for a period (pure). Default = the calendar month of the OT date. PAYROLL_CONTROL key
 * OT_WINDOW_START_<YYYY-MM> (ISO date) moves the window start for that period only, e.g. the one-time
 * catch-up OT_WINDOW_START_2026-09 = 2026-08-26 (August salary paid OT only up to 25-Aug).
 * controlMap: {KEY: VALUE} (raw cell values; Date cells accepted). Throws on a malformed / out-of-range override.
 * @returns {{start:string, end:string, overridden:boolean}}
 */
function feeds_otWindow(period, controlMap) {
  parsePeriod(period);
  var start = periodStart(period), end = periodEnd(period), overridden = false;
  var key = 'OT_WINDOW_START_' + period;
  var raw = controlMap ? controlMap[key] : '';
  if (raw !== '' && raw != null) {
    var iso = feeds_parseDate_(raw);
    if (!iso) throw new Error(key + ' must be a date (YYYY-MM-DD), got "' + raw + '"');
    if (iso > end) throw new Error(key + ' (' + iso + ') is after the end of the period ' + end);
    if (iso !== start) { start = iso; overridden = true; }
  }
  return { start: start, end: end, overridden: overridden };
}

function feeds_otSame_(fresh, live) {
  var a = feeds_num_(fresh.OT_HOURS), b = feeds_num_(live.OT_HOURS);
  return feeds_str_(fresh.ELIGIBILITY).toUpperCase() === feeds_str_(live.ELIGIBILITY).toUpperCase() &&
    (isNaN(a) ? 0 : a) === (isNaN(b) ? 0 : b) &&
    feeds_str_(fresh.EXCEPTION_REASON) === feeds_str_(live.EXCEPTION_REASON);
}

/**
 * Re-sync planner (pure). existing = INPUT_OT row objects ({_row, ...}); fresh = rows produced by mapOtRows for the
 * period. Only rows written by the normalizer (NORMALIZER_VERSION set, OT_KEY set, not HR_MANUAL, not already
 * SUPERSEDED) can be superseded; legacy Apr-Aug rows and manual HR rows are never touched.
 * A live row whose OT_KEY is in fresh with identical hours/eligibility/reason is kept (idempotent re-run);
 * every other live row is superseded and every unmatched fresh row is appended.
 * @returns {{supersede:Array, append:Array, unchanged:number}}
 */
function feeds_planOtResync(existing, fresh, period) {
  var freshByKey = {};
  (fresh || []).forEach(function (f) { freshByKey[f.OT_KEY] = f; });
  var matched = {}, supersede = [], unchanged = 0;
  (existing || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (!feeds_str_(r.NORMALIZER_VERSION) || !feeds_str_(r.OT_KEY)) return;
    if (feeds_str_(r.SOURCE_REF).toUpperCase() === 'HR_MANUAL') return;
    if (feeds_str_(r.ELIGIBILITY).toUpperCase() === 'SUPERSEDED') return;
    var f = freshByKey[feeds_str_(r.OT_KEY)];
    if (f && !matched[f.OT_KEY] && feeds_otSame_(f, r)) { matched[f.OT_KEY] = true; unchanged++; return; }
    supersede.push(r);
  });
  var append = (fresh || []).filter(function (f) { return !matched[f.OT_KEY]; });
  return { supersede: supersede, append: append, unchanged: unchanged };
}

/** Cell updates that mark a live INPUT_OT row SUPERSEDED. Hours are zeroed (Monthly OT Report SUMIFS ignores ELIGIBILITY) and preserved in the reason. */
function feeds_supersedeValues(row, stamp) {
  var h = feeds_str_(row.OT_HOURS);
  return { ELIGIBILITY: 'SUPERSEDED', OT_HOURS: 0,
    EXCEPTION_REASON: 'SUPERSEDED_BY_RESYNC ' + (stamp || '') + ' | WAS=' + (feeds_str_(row.ELIGIBILITY) || 'VALID') +
      (h ? ' | ORIGINAL_OT_HOURS=' + h : '') };
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
    reason: feeds_col_(idx, ['correctionreason'], ['correctionreason'])
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
 * Efficiency form responses -> INPUT_EFFICIENCY rows, per employee (the ALL_WORKERS blanket convention is retired:
 * such a row becomes an ALL_WORKERS_NOT_SUPPORTED exception).
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
    var r = rosterMap[it.emp];
    if (feeds_isBlanketKey_(it.emp)) reason = 'ALL_WORKERS_NOT_SUPPORTED';
    else if (!r) reason = 'UNKNOWN_OR_INACTIVE_EMP_ID';
    else if (r.PAYROLL_CATEGORY && (categoryMethod(r.PAYROLL_CATEGORY) || r.PAYROLL_CATEGORY) !== POP.PERMANENT_WORKER) reason = 'NOT_A_PERMANENT_WORKER';
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
 * Payable OT hours per EMP_ID for the period, from two kinds of INPUT_OT rows:
 *  1. rows written by syncOtFromForm: NORMALIZER_VERSION set, ELIGIBILITY = VALID (SUPERSEDED / EXCEPTION never count);
 *  2. manual HR rows (e.g. CON##/BUNG## employees who are not on the OT form): SOURCE_REF (column D) = HR_MANUAL,
 *     APPROVAL_STATUS = APPROVED, period >= MIN_PERIOD, not EXCEPTION/SUPERSEDED.
 * Legacy Apr-Aug rows (no NORMALIZER_VERSION, not HR_MANUAL) are never counted.
 */
function sumOtHours(rows, period) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var elig = feeds_str_(r.ELIGIBILITY).toUpperCase();
    var st = feeds_str_(r.APPROVAL_STATUS).toUpperCase();
    if (feeds_str_(r.SOURCE_REF).toUpperCase() === 'HR_MANUAL') {
      if (period < HROS_MIN_PERIOD_FLOOR) return;
      if (st !== 'APPROVED') return;
      if (elig === 'EXCEPTION' || elig === 'SUPERSEDED') return;
    } else {
      if (elig !== 'VALID') return;
      if (!feeds_str_(r.NORMALIZER_VERSION)) return;
      if (st && st !== 'APPROVED') return;
    }
    var h = feeds_num_(r.OT_HOURS);
    if (isNaN(h) || h <= 0) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), h);
  });
  return out;
}

/**
 * Latest row per key (ENTERED_AT, then position) of the period. EXCEPTION rows take part: when the latest response
 * for an employee is invalid there is NO fallback to an older valid one (the caller sees best[k].invalid).
 */
function feeds_latestRows_(rows, period, keyFn) {
  var best = {};
  (rows || []).forEach(function (r, i) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var st = feeds_str_(r.STATUS).toUpperCase();
    var k = keyFn(r);
    if (!k) return;
    var it = { r: r, ts: feeds_ts_(r.ENTERED_AT), i: i, invalid: !!st && st !== 'VALID' };
    var cur = best[k];
    if (!cur || it.ts > cur.ts || (it.ts === cur.ts && it.i > cur.i)) best[k] = it;
  });
  return best;
}

/** [{EMP_ID, reason, sourceRef}] for keys whose LATEST row of the period is an EXCEPTION (canteen / efficiency). */
function feeds_currentExceptions(rows, period, keyFn) {
  var best = feeds_latestRows_(rows, period, keyFn || function (r) { return feeds_empId_(r.EMP_ID); });
  return Object.keys(best).filter(function (k) { return best[k].invalid; }).sort().map(function (k) {
    var r = best[k].r;
    return { EMP_ID: feeds_empId_(r.EMP_ID), reason: feeds_str_(r.REMARKS), sourceRef: feeds_str_(r.SOURCE_REF) };
  });
}

function canteenExceptions(rows, period) { return feeds_currentExceptions(rows, period); }
function efficiencyExceptions(rows, period) { return feeds_currentExceptions(rows, period, function (r) { return feeds_effKey_(r.EMP_ID); }); }

/** {EMP_ID: amount} - latest row per PERIOD|EMP_ID wins (form or HR_MANUAL); an invalid latest row yields nothing. */
function canteenByEmp(rows, period) {
  var best = feeds_latestRows_(rows, period, function (r) { return feeds_empId_(r.EMP_ID); });
  var out = {};
  Object.keys(best).forEach(function (id) {
    if (best[id].invalid) return;
    var a = feeds_num_(best[id].r.AMOUNT_INR);
    if (!isNaN(a) && a >= 0) out[id] = a;
  });
  return out;
}

/**
 * {EMP_ID: {pct, physicalDaysOverride, source}} for workerIds, per employee only (no blanket row). An employee with no
 * usable latest row is simply absent (the calculation then pays no production allowance and warns).
 */
function efficiencyByEmp(rows, period, workerIds) {
  var best = feeds_latestRows_(rows, period, function (r) { return feeds_effKey_(r.EMP_ID); });
  var out = {};
  (workerIds || []).forEach(function (raw) {
    var id = feeds_empId_(raw);
    var it = best[id];
    if (!it || it.invalid) return;
    var pct = feeds_num_(it.r.EFFICIENCY_PCT);
    if (isNaN(pct)) return;
    var d = feeds_num_(it.r.PHYSICAL_PRESENT_DAYS_OVERRIDE);
    out[id] = { pct: pct, physicalDaysOverride: isNaN(d) ? null : d, source: 'EMP' };
  });
  return out;
}

function feeds_approvedRows_(rows, period) {
  return (rows || []).filter(function (r) {
    return normalizePeriod(r.PAYROLL_MONTH) === period && feeds_str_(r.APPROVAL_STATUS).toUpperCase() === 'APPROVED';
  });
}

function feeds_sumApproved_(rows, period, col) {
  var out = {};
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var n = feeds_num_(r[col]);
    if (isNaN(n)) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), n);
  });
  return out;
}

/** {EMP_ID: RECOVERY_THIS_MONTH_INR} from APPROVED INPUT_ADVANCE rows (multiple advances sum). */
function advanceByEmp(rows, period) { return feeds_sumApproved_(rows, period, 'RECOVERY_THIS_MONTH_INR'); }

/**
 * Advance checks on APPROVED rows of the period: [{EMP_ID, severity, code, message}].
 *  - WARN  ADVANCE_RECOVERY_EXCEEDS_BALANCE: RECOVERY_THIS_MONTH_INR > OPENING_BALANCE_INR (when both numbers exist)
 *  - BLOCKER ADVANCE_DUPLICATE_LEDGER_REFERENCE: the same ACCOUNTS_LEDGER_REFERENCE twice for one EMP_ID and period
 */
function advanceIssues(rows, period) {
  var out = [], seen = {}, dupDone = {};
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var id = feeds_empId_(r.EMP_ID);
    var rec = feeds_num_(r.RECOVERY_THIS_MONTH_INR), open = feeds_num_(r.OPENING_BALANCE_INR);
    if (!isNaN(rec) && !isNaN(open) && rec > open) {
      out.push({ EMP_ID: id, severity: 'WARN', code: 'ADVANCE_RECOVERY_EXCEEDS_BALANCE',
        message: 'Advance recovery ' + rec + ' exceeds opening balance ' + open });
    }
    var ref = feeds_str_(r.ACCOUNTS_LEDGER_REFERENCE).toUpperCase();
    if (!ref) return;
    var k = id + '|' + ref;
    if (seen[k] && !dupDone[k]) {
      dupDone[k] = true;
      out.push({ EMP_ID: id, severity: 'BLOCKER', code: 'ADVANCE_DUPLICATE_LEDGER_REFERENCE',
        message: 'ACCOUNTS_LEDGER_REFERENCE ' + ref + ' appears more than once for ' + id + ' in ' + period });
    }
    seen[k] = true;
  });
  return out;
}

var FEEDS_SOCIETY_COMPONENTS = ['GENERAL_EMI_INR', 'EMERGENCY_EMI_INR', 'EDUCATION_EMI_INR', 'SHARES_OTHER_INR'];

/**
 * One APPROVED INPUT_SOCIETY row -> {total, mismatch, components}. total = TOTAL_RECOVERY_INR when present, else the
 * sum of the four component columns (blank = 0; NaN when nothing usable). Both present and different -> mismatch.
 */
function feeds_societyRowTotal_(r) {
  var comp = 0, anyComp = false;
  FEEDS_SOCIETY_COMPONENTS.forEach(function (c) {
    var n = feeds_num_(r[c]);
    if (!isNaN(n)) { comp += n; anyComp = true; }
  });
  var tot = feeds_num_(r.TOTAL_RECOVERY_INR);
  if (!isNaN(tot)) return { total: tot, components: anyComp ? comp : null, mismatch: anyComp && Math.abs(tot - comp) > 0.005 };
  return { total: anyComp ? comp : NaN, components: anyComp ? comp : null, mismatch: false };
}

/** {EMP_ID: recovery} from APPROVED INPUT_SOCIETY rows: TOTAL_RECOVERY_INR, or the component sum when the total is blank. */
function societyByEmp(rows, period) {
  var out = {};
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var t = feeds_societyRowTotal_(r).total;
    if (isNaN(t)) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), t);
  });
  return out;
}

/** WARN SOCIETY_TOTAL_MISMATCH where TOTAL_RECOVERY_INR and the component sum are both present and differ. */
function societyIssues(rows, period) {
  var out = [];
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var t = feeds_societyRowTotal_(r);
    if (t.mismatch) {
      out.push({ EMP_ID: feeds_empId_(r.EMP_ID), severity: 'WARN', code: 'SOCIETY_TOTAL_MISMATCH',
        message: 'TOTAL_RECOVERY_INR ' + t.total + ' differs from the component sum ' + t.components + ' (total is used)' });
    }
  });
  return out;
}

/** Pure: form-response event namedValues ({header: [value]}) -> 'YYYY-MM' of the "Payroll Month" answer, or ''. */
function feeds_periodFromNamedValues(namedValues) {
  var nv = namedValues || {};
  var k = Object.keys(nv).filter(function (n) { return /payroll\s*month|^period$/i.test(String(n).trim()); })[0];
  if (k === undefined) return '';
  var v = nv[k];
  if (Array.isArray(v)) v = v[0];
  return feeds_parsePeriodLoose_(v);
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
  populationList().forEach(function (p) { if (st[p] === PERIOD_STATUS.LOCKED) locked[p] = true; });
  return locked;
}

/** (population, empId) -> true when that employee is frozen by a lock (held-and-unlocked employees of a locked run stay open). */
function feeds_lockedFn_(period) { return lockScope_(period).isLocked; }

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
  populationList().forEach(function (p) { out[p] = 0; });
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

/**
 * Name of the LOCAL tab syncOtFromForm reads when no external spreadsheet is configured: PAYROLL_CONTROL OT_SOURCE_TAB
 * (seeded OT_FORM_RESPONSES) when that tab exists, else the legacy Overtime_Form tab, else ''.
 */
function feeds_localOtTabName_() {
  try {
    if (String(getControl('OT_SOURCE_SPREADSHEET_ID', '')).trim()) return '';
    var want = String(getControl('OT_SOURCE_TAB', '')).trim() || FEEDS_OT_LOCAL_TAB;
    if (getSheet(want)) return want;
    return getSheet(FEEDS_OT_TAB) ? FEEDS_OT_TAB : '';
  } catch (e) { return ''; }
}

/**
 * Opens the OT source. Default: a LOCAL tab of this spreadsheet (the OT form is linked into it) named by
 * PAYROLL_CONTROL OT_SOURCE_TAB (seeded OT_FORM_RESPONSES); if that tab is absent the legacy Overtime_Form tab is used.
 * Only when OT_SOURCE_SPREADSHEET_ID is set (seeded blank) is an external response spreadsheet opened
 * (SpreadsheetApp.openById) and OT_SOURCE_TAB (default "Form Responses 1") read there.
 */
function feeds_openOtSource_() {
  var id = String(getControl('OT_SOURCE_SPREADSHEET_ID', '')).trim();
  var tab = String(getControl('OT_SOURCE_TAB', '')).trim();
  if (!id) {
    var local = tab || FEEDS_OT_LOCAL_TAB;
    var sheet = getSheet(local) || getSheet(FEEDS_OT_TAB);
    if (!sheet) throw new Error('OT source tab not found: neither "' + local + '" nor "' + FEEDS_OT_TAB + '" exists (PAYROLL_CONTROL OT_SOURCE_TAB)');
    return { sheet: sheet, label: sheet.getName() };
  }
  tab = tab || FEEDS_OT_EXTERNAL_TAB;
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) {
    throw new Error('Cannot open the OT source spreadsheet (OT_SOURCE_SPREADSHEET_ID): ' + (e && e.message ? e.message : e));
  }
  var ext = ss.getSheetByName(tab);
  if (!ext) throw new Error('OT source spreadsheet has no tab "' + tab + '" (OT_SOURCE_TAB)');
  return { sheet: ext, label: 'external:' + tab };
}

/**
 * Pure: the payroll period an OT date belongs to. Default = its calendar month; when the NEXT month has an
 * OT_WINDOW_START_<next> override that starts on or before the date (the September catch-up from 26-Aug) the date belongs
 * to that next period. '' when the date is not a valid date.
 */
function feeds_otPeriodForDate(dateIso, controlMap) {
  var iso = feeds_parseDate_(dateIso);
  if (!iso) return '';
  var cal = iso.slice(0, 7), p = parsePeriod(cal);
  var next = p.month === 12 ? (p.year + 1) + '-01' : p.year + '-' + pad2_(p.month + 1);
  var raw = controlMap ? controlMap['OT_WINDOW_START_' + next] : '';
  if (raw !== '' && raw != null) {
    var start = feeds_parseDate_(raw);
    if (start && start <= iso) return next;
  }
  return cal;
}

/** Period of the OT event in one row of the OT source tab (reads the header row and the single Date Of OT cell); '' if unusable or before MIN_PERIOD. */
function feeds_otPeriodOfRow_(sheet, rowNum) {
  var lc = sheet.getLastColumn();
  if (lc < 1) return '';
  var headers = sheet.getRange(1, 1, 1, lc).getValues()[0];
  var col = -1;
  headers.forEach(function (h, i) { if (col < 0 && ['dateofot', 'otdate'].indexOf(feeds_norm_(h)) >= 0) col = i; });
  if (col < 0) return '';
  var period = feeds_otPeriodForDate(sheet.getRange(rowNum, col + 1, 1, 1).getValues()[0][0], readControlMap());
  if (!period) return '';
  try { guardPeriod_(period); } catch (e) { return ''; }
  return period;
}

/**
 * Sync approved OT events for the period from the OT source (needed columns only, never password columns) into
 * INPUT_OT. Re-sync reflects the latest decision: previously written normalizer rows of the period that no longer
 * match are marked ELIGIBILITY=SUPERSEDED (cell updates) and the fresh set is appended; identical rows are kept.
 * The window is the calendar month of the OT date unless OT_WINDOW_START_<period> moves its start.
 */
function syncOtFromForm(period) {
  guardPeriod_(period);
  var src = feeds_openOtSource_();
  var sheet = src.sheet;
  if (sheet.getLastRow() < 2) {
    setControl('OT_PENDING_' + period, JSON.stringify(feeds_pendingByPopulation([], {})), 'pending OT events per population; written by OT sync');
    return { period: period, written: 0, message: 'OT source is empty' };
  }
  var block = feeds_readColumns_(sheet, FEEDS_OT_DEFS); // header row, then only the needed columns
  if (block.missing.length) throw new Error('OT source is missing required column(s): ' + block.missing.join(', '));
  var header = block.header, rows = block.rows;
  var roster = buildRoster(period);
  var popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var win = feeds_otWindow(period, readControlMap());
  var res = mapOtRows(header, rows, period, roster, {}, { firstRow: 2, enteredAt: nowIso_(),
    windowStart: win.start, windowEnd: win.end });
  if (res.missingColumns.length) throw new Error('OT source is missing required column(s): ' + res.missingColumns.join(', '));
  var isLockedEmp = feeds_lockedFn_(period);
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[String(o.EMP_ID).toUpperCase()];
    if (pop && isLockedEmp(pop, o.EMP_ID)) { lockedSkipped++; return false; }
    return true;
  }
  var fresh = res.valid.concat(res.exceptions).filter(open);
  var existing = readObjects(TABS.INPUT_OT).filter(function (r) {
    var pop = popOf[String(r.EMP_ID).toUpperCase()];
    return !(pop && isLockedEmp(pop, r.EMP_ID));
  });
  var plan = feeds_planOtResync(existing, fresh, period);
  var stamp = nowIso_();
  // supersede first: if the append fails the sheet under-pays (visible, re-run fixes) rather than double counts
  updateRows(TABS.INPUT_OT, plan.supersede.map(function (r) { return { row: r._row, values: feeds_supersedeValues(r, stamp) }; }));
  if (plan.append.length) appendObjects(TABS.INPUT_OT, plan.append, { textHeaders: ['OT_KEY', 'OT_DATE', 'DATE_RANGE'] });
  var newValid = plan.append.filter(function (o) { return o.ELIGIBILITY === 'VALID'; });
  var summary = { period: period, source: src.label, window: win.start + '..' + win.end, windowOverridden: win.overridden,
    validWritten: newValid.length,
    exceptionsWritten: plan.append.length - newValid.length, superseded: plan.supersede.length, unchanged: plan.unchanged,
    revokedByRejection: res.revokedCount, correctedApprovals: res.correctedCount,
    pending: res.pendingCount, duplicatesSkipped: res.duplicateSkipped, lockedSkipped: lockedSkipped,
    validHours: newValid.reduce(function (t, o) { return t + o.OT_HOURS; }, 0) };
  // remember pending (not yet approved/rejected) OT events per population so readiness can WARN
  summary.pendingByPopulation = feeds_pendingByPopulation(res.pendingEmpIds, popOf);
  setControl('OT_PENDING_' + period, JSON.stringify(summary.pendingByPopulation), 'pending OT events per population; written by OT sync');
  audit('OT_SYNC', period, '', summary);
  feeds_toast_('OT sync: ' + summary.validWritten + ' new valid, ' + summary.superseded + ' superseded, ' +
    summary.exceptionsWritten + ' exception(s), ' + res.pendingCount + ' pending');
  return summary;
}

function feeds_syncForm_(period, tab, target, mapper, name, action) {
  guardPeriod_(period);
  var sheet = getSheet(tab);
  if (!sheet) throw new Error('Missing tab ' + tab);
  var block = feeds_readFormColumns_(sheet);
  var roster = buildRoster(period);
  // only VALID rows make a response "already imported"; an EXCEPTION is re-evaluated on every sync (so fixing the
  // cause, e.g. the master, clears it) and only re-written when it is a new problem
  var refs = {}, excKeys = {};
  readObjects(target).forEach(function (r) {
    var ref = feeds_str_(r.SOURCE_REF), st = feeds_str_(r.STATUS).toUpperCase();
    if (!ref) return;
    if (st === 'EXCEPTION') excKeys[ref + '|' + feeds_str_(r.REMARKS)] = true; else refs[ref] = true;
  });
  var res = mapper(block.header, block.rows, period, roster, refs, { firstRow: 2, enteredAt: nowIso_() });
  if (res.missingColumns.length) throw new Error(tab + ' is missing required column(s): ' + res.missingColumns.join(', '));
  res.exceptions = res.exceptions.filter(function (o) {
    if (excKeys[o.SOURCE_REF + '|' + o.REMARKS]) { res.skippedExisting++; return false; }
    return true;
  });
  var isLockedEmp = feeds_lockedFn_(period), popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[o.EMP_ID];
    if (pop && isLockedEmp(pop, o.EMP_ID)) { lockedSkipped++; return false; }
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

// ===== 21_Leave.gs =====
/**
 * 21_Leave.gs - leave sync (DESIGN section 2, "Leave").
 * The leave application form lives in its OWN spreadsheet (its own approval process and yearly balances). It is read
 * READ-ONLY (SpreadsheetApp.openById, header-selective reads, password columns never selected) and normalised into the
 * controlled INPUT_LEAVE tab; the register derivation (12_Register.gs) then turns approved leave into EL / CL / SL /
 * C-Off / OD / LWP days. The same spreadsheet also holds the yearly leave balances printed on the payslip.
 *
 * Source layout (Leave_Applications): an event log. Employees add "Apply ..." rows; the approver later adds separate
 * "Approval (for admin use only)" rows (a new row, not an update) that repeat the employee / dates / type and carry the
 * decision. Most approvals have no Apply row in the log, so an approval is self-contained; an Apply row only links, by
 * EMP_ID + start + end + type (never by Case No, which is shared by different leaves).
 * Pure: mapLeaveRows, leave_window, leave_normalizeType, leave_planResync, leaveByEmp, leaveExceptions, leave_balanceColumns_.
 * Sheet-touching: syncLeaveFromSource, leaveAutoSync_, leave_readBalances_.
 */
var LEAVE_NORMALIZER_VERSION = 'LEAVE-1.0';
var LEAVE_MAX_SPAN_DAYS = 92;
var LEAVE_DEFAULT_TAB = 'Leave_Applications';
var LEAVE_DEFS = [
  { key: 'Timestamp', names: ['timestamp'] },
  { key: 'Submission Type', names: ['submissiontype'], required: true },
  { key: 'Employee ID', names: ['employeeid', 'empid', 'employeecode'], required: true },
  { key: 'Leave Start Date', names: ['leavestartdate', 'startdate', 'fromdate'], required: true },
  { key: 'Leave Start Date Half', names: ['leavestartdatehalf', 'startdatehalf'] },
  { key: 'Leave End Date', names: ['leaveenddate', 'enddate', 'todate'], required: true },
  { key: 'Leave End Date Half', names: ['leaveenddatehalf', 'enddatehalf'] },
  { key: 'Leave Type', names: ['leavetype'], required: true },
  { key: 'Approval Decision', names: ['approvaldecision', 'decision'], required: true },
  { key: 'Approved Number of days', names: ['approvednumberofdays', 'approveddays'] },
  { key: 'Case No', names: ['caseno', 'caseid', 'casenumber'] }
];
var LEAVE_BALANCE_TABS = { STAFF: 'Leave Databse Staff', PERMANENT_WORKER: 'Leave Dadabase PW', CONSULTANT: 'Leave Dadabase CON' };
var LEAVE_BALANCE_ALIASES = {
  EL: ['elavailable', 'elbalance', 'elavailablebalance', 'availableel', 'elavail'],
  CL: ['clavailable', 'clbalance', 'clavailablebalance', 'availablecl', 'clavail'],
  SL: ['slavailable', 'slbalance', 'slavailablebalance', 'availablesl', 'slavail']
};
var LEAVE_BALANCE_EMP_ALIASES = ['employeeid', 'empid', 'empcode', 'employeecode'];
var LEAVE_BALANCE_HEADER_SCAN_ROWS = 6;

// ================================================================ pure helpers

/**
 * 'Earned Leave (EL)', 'casual Leave (CL)', 'MEdical Leave (SL)', 'Outdoor Duty (OD)', 'Compensatory Off- C/Off',
 * 'Leave Without Pay (LWP)' -> EL | CL | SL | OD | COFF | LWP (case / spacing insensitive). Anything that does not
 * match exactly one type -> null (the caller raises an exception row).
 */
function leave_normalizeType(raw) {
  var s = String(raw == null ? '' : raw).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  var hits = [];
  if (/\bel\b|earned/.test(s)) hits.push('EL');
  if (/\bcl\b|casual/.test(s)) hits.push('CL');
  if (/\bsl\b|medical|sick/.test(s)) hits.push('SL');
  if (/\bod\b|outdoor/.test(s)) hits.push('OD');
  if (/c\s*\/\s*off|compensat/.test(s)) hits.push('COFF');
  if (/\blwp\b|without pay|loss of pay/.test(s)) hits.push('LWP');
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Half-day flag cell -> 'FULL' | 'HALF' | 'UNKNOWN'. Blank = full day. SIDE-AWARE (side = 'START' | 'END'): the leave form's
 * flags are "First Half" / "Second Half" on both sides, meaning "leave begins at the start of the day (full first day)" /
 * "begins after lunch (half first day)" for the start date, and "runs to the end of the day (full last day)" / "ends at
 * lunch (half last day)" for the end date. So START "Second Half" = half, START "First Half" = full,
 * END "First Half" = half, END "Second Half" = full. Generic words (Half, Half Day, Yes, 0.5) mean half on either side.
 */
function leave_halfFlag_(v, side) {
  if (v == null || v === '') return 'FULL';
  if (v === true) return 'HALF';
  if (v === false) return 'FULL';
  if (typeof v === 'number') return v === 0 ? 'FULL' : (v === 0.5 ? 'HALF' : 'UNKNOWN');
  var s = String(v).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return 'FULL';
  if (/\bno\b|\bnot\b|^n$|^false$|^0$|^none$|^-$|full/.test(s)) return 'FULL';
  if (/^(second|2nd)\b/.test(s)) return side === 'END' ? 'FULL' : 'HALF';
  if (/^(first|1st)\b/.test(s)) return side === 'END' ? 'HALF' : 'FULL';
  if (/half|^yes$|^y$|^true$|^1$|^0\.5$/.test(s)) return 'HALF';
  return 'UNKNOWN';
}

/**
 * Leave window of a period (pure). Default = the CALENDAR month of the period (the leave sheet's own 26th-25th "Month" column
 * is never used). PAYROLL_CONTROL key LEAVE_WINDOW_START_<YYYY-MM> (ISO date) moves the start for that period only, e.g. the
 * one-time catch-up LEAVE_WINDOW_START_2026-09 = 2026-08-26 (August payroll counted leave only up to 25-Aug).
 * @returns {{start:string, end:string, overridden:boolean}}
 */
function leave_window(period, controlMap) {
  parsePeriod(period);
  var start = periodStart(period), end = periodEnd(period), overridden = false;
  var key = 'LEAVE_WINDOW_START_' + period;
  var raw = controlMap ? controlMap[key] : '';
  if (raw !== '' && raw != null) {
    var iso = feeds_parseDate_(raw);
    if (!iso) throw new Error(key + ' must be a date (YYYY-MM-DD), got "' + raw + '"');
    if (iso > end) throw new Error(key + ' (' + iso + ') is after the end of the period ' + end);
    if (iso !== start) { start = iso; overridden = true; }
  }
  return { start: start, end: end, overridden: overridden };
}

function leave_addDays_(iso, n) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/** Inclusive ISO dates start..end (start <= end, span already checked by the caller). */
function leave_range_(start, end) {
  var out = [], d = start;
  while (d <= end) { out.push(d); d = leave_addDays_(d, 1); }
  return out;
}

function leave_r2_(x) { return Math.round(x * 100) / 100; }

/** Timestamp cell -> 'YYYY-MM' ('' if unusable). */
function leave_tsPeriod_(v) {
  var iso = feeds_parseDate_(v);
  return iso ? iso.slice(0, 7) : '';
}

/**
 * Pure. Leave source rows -> INPUT_LEAVE rows for ONE period.
 *  - Window: the calendar month of the period unless opts.window {start, end} moves it (LEAVE_WINDOW_START_<period>, see
 *    leave_window). The sheet's 26th-25th cycle / Month column is not used.
 *  - Groups: an approval is linked to an application ONLY by EMP_ID + start date + end date + normalized leave type. Case No is
 *    informational (kept in CASE_NO); it is shared by different leaves of one employee and is never a grouping key. The
 *    LATEST decisive row (Approved / Rejected, by timestamp then row) of a group wins; only Approved counts; a later Rejected
 *    revokes (counted, no exception). An Apply row that itself carries Approval Decision = Approved counts as approved.
 *  - Days: 'Approved Number of days' when present (it wins; the half-day flags are then ignored), otherwise computed from the
 *    dates with the side-aware half-day flags. Approved days are CALENDAR days including weekly offs (as the leave sheet
 *    deducts them); they are never rescaled and spread evenly over ALL dates of the range (no weekly-off / holiday exclusion);
 *    only the dates inside the window are counted. Multi-month leave is therefore split per date.
 *  - Exceptions (never counted): unknown employee, unknown leave type, unparseable / implausible dates, end before start,
 *    invalid or over-range approved days, unrecognised half-day flag (only when the days are computed from flags) or
 *    decision, and a date claimed by two DIFFERENT approved leaves of one employee for more than one day. Only groups that
 *    touch the window can raise exceptions.
 * @param {Array} headers selected header cells; @param {Array<Array>} rows zipped rows; @param {string} period
 * @param {Array} roster [{EMP_ID, PAYROLL_CATEGORY, SITE}]
 * @param {Object} [opts] {firstRow, enteredAt, sourceLabel, window {start, end}}
 * @returns {{valid:Array, exceptions:Array, pendingCount:number, revokedCount:number, missingColumns:Array}}
 */
function mapLeaveRows(headers, rows, period, roster, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2, enteredAt = opts.enteredAt || '', label = opts.sourceLabel || 'LEAVE';
  var idx = feeds_headerIndex_(headers);
  var c = {};
  LEAVE_DEFS.forEach(function (d) { c[d.key] = feeds_col_(idx, d.names); });
  var out = { valid: [], exceptions: [], pendingCount: 0, revokedCount: 0, missingColumns: [] };
  LEAVE_DEFS.forEach(function (d) { if (d.required && c[d.key] < 0) out.missingColumns.push(d.key); });
  if (out.missingColumns.length) return out; // fail closed: nothing counted without the required headers

  var pStart = opts.window ? opts.window.start : periodStart(period), pEnd = opts.window ? opts.window.end : periodEnd(period);
  var rosterMap = feeds_rosterMap_(roster);
  var cell = function (row, key) { return feeds_cell_(row, c[key]); };

  var parsed = [];
  rows.forEach(function (row, i) {
    var emp = feeds_empId_(cell(row, 'Employee ID')), typeRaw = feeds_str_(cell(row, 'Submission Type'));
    if (!emp && !typeRaw) return; // empty template row
    var tn = feeds_norm_(typeRaw);
    var p = {
      i: i, srcRow: firstRow + i, emp: emp, typeRaw: typeRaw,
      kind: tn.indexOf('approval') >= 0 ? 'APPROVAL' : (tn.indexOf('apply') >= 0 ? 'APPLY' : 'OTHER'),
      ts: feeds_ts_(cell(row, 'Timestamp')), tsRaw: cell(row, 'Timestamp'),
      ltRaw: feeds_str_(cell(row, 'Leave Type')),
      start: feeds_parseDate_(cell(row, 'Leave Start Date')), end: feeds_parseDate_(cell(row, 'Leave End Date')),
      startRaw: feeds_str_(cell(row, 'Leave Start Date')), endRaw: feeds_str_(cell(row, 'Leave End Date')),
      startHalf: leave_halfFlag_(cell(row, 'Leave Start Date Half'), 'START'), endHalf: leave_halfFlag_(cell(row, 'Leave End Date Half'), 'END'),
      dec: feeds_str_(cell(row, 'Approval Decision')).toLowerCase(),
      decRaw: feeds_str_(cell(row, 'Approval Decision')),
      appDaysRaw: cell(row, 'Approved Number of days'),
      kase: feeds_str_(cell(row, 'Case No'))
    };
    p.type = leave_normalizeType(p.ltRaw);
    p.fb = p.emp + '|' + p.start + '|' + p.end + '|' + (p.type || p.ltRaw.toLowerCase());
    parsed.push(p);
  });

  function relevant(p) {
    var s = p.start, e = p.end;
    if (!s && !e) { var tp = leave_tsPeriod_(p.tsRaw); return !tp || tp === period; }
    if (s && e && e < s) return (s >= pStart && s <= pEnd) || (e >= pStart && e <= pEnd);
    var lo = s || e, hi = e || s;
    return lo <= pEnd && hi >= pStart;
  }
  var order = function (a, b) { return (a.ts - b.ts) || (a.i - b.i); };

  var problems = [];  // {p, reason, detail}
  function problem(p, reason, detail) { problems.push({ p: p, reason: reason, detail: detail || '' }); }

  // groups: ONLY EMP_ID + start + end + type (Case No never groups)
  var groups = {}, groupOrder = [];
  parsed.forEach(function (p) {
    if (p.kind === 'OTHER') return;
    var gid = p.fb;
    if (!groups[gid]) { groups[gid] = []; groupOrder.push(gid); }
    groups[gid].push(p);
  });

  var winners = [];
  groupOrder.forEach(function (gid) {
    var g = groups[gid].slice().sort(order);
    // a decisive row: Approved / Rejected on an approval row, or Approved / Rejected written on the application row itself
    var decisive = g.filter(function (p) { return p.dec === 'approved' || p.dec === 'rejected'; });
    var odd = g.filter(function (p) { return p.kind === 'APPROVAL' && p.dec && p.dec !== 'approved' && p.dec !== 'rejected'; });
    var lastD = decisive.length ? decisive[decisive.length - 1] : null;
    var lastOdd = odd.length ? odd[odd.length - 1] : null;
    if (lastOdd && (!lastD || order(lastOdd, lastD) > 0)) {
      if (relevant(lastOdd)) problem(lastOdd, 'UNRECOGNISED_DECISION', '"' + lastOdd.decRaw + '"');
      return;
    }
    if (!lastD) { if (relevant(g[g.length - 1])) out.pendingCount++; return; }
    if (!relevant(lastD)) return;
    if (lastD.dec === 'rejected') { out.revokedCount++; return; }
    winners.push(lastD);
  });

  winners.sort(function (a, b) {
    return a.emp < b.emp ? -1 : (a.emp > b.emp ? 1 : ((a.start < b.start ? -1 : (a.start > b.start ? 1 : 0)) || order(a, b)));
  });

  var used = {};
  winners.forEach(function (w) {
    var fail = function (reason, detail) { problem(w, reason, detail); };
    if (!w.emp) return fail('MISSING_EMP_ID');
    if (!rosterMap[w.emp]) return fail('UNKNOWN_OR_INACTIVE_EMP_ID');
    if (!w.type) return fail('UNKNOWN_LEAVE_TYPE', '"' + w.ltRaw + '"');
    if (!w.start) return fail('START_DATE_UNPARSEABLE', '"' + w.startRaw + '"');
    if (!w.end) return fail('END_DATE_UNPARSEABLE', '"' + w.endRaw + '"');
    if (w.end < w.start) return fail('END_BEFORE_START', w.start + '..' + w.end);
    if (w.start < '2020-01-01' || w.end > '2100-12-31') return fail('DATE_IMPLAUSIBLE', w.start + '..' + w.end);
    var spanCap = leave_addDays_(w.start, LEAVE_MAX_SPAN_DAYS + 1); // never enumerate a runaway range
    var dates = leave_range_(w.start, w.end < spanCap ? w.end : spanCap);
    if (dates.length > LEAVE_MAX_SPAN_DAYS) return fail('LEAVE_SPAN_TOO_LONG', dates.length + ' day(s) from ' + w.start);
    var approved = null;
    if (w.appDaysRaw !== '' && w.appDaysRaw != null) {
      approved = feeds_num_(w.appDaysRaw);
      if (isNaN(approved) || approved <= 0) return fail('APPROVED_DAYS_INVALID', '"' + w.appDaysRaw + '"');
      if (approved > dates.length) return fail('APPROVED_DAYS_EXCEED_RANGE', approved + ' > ' + dates.length + ' date(s)');
    } else if (w.startHalf === 'UNKNOWN' || w.endHalf === 'UNKNOWN') {
      return fail('HALF_DAY_FLAG_UNRECOGNISED');
    }
    // per-date share: approved days spread evenly over ALL calendar dates of the range; otherwise the flag weights
    var share = dates.map(function (d) {
      if (approved !== null) return approved / dates.length;
      var x = 1;
      if (d === w.start && w.startHalf === 'HALF') x = 0.5;
      if (d === w.end && w.endHalf === 'HALF') x = 0.5;
      return x;
    });
    var days = 0, clash = '';
    dates.forEach(function (d, k) {
      if (d < pStart || d > pEnd) return;
      var a = share[k];
      if (a <= 0) return;
      var u = used[w.emp + '|' + d] || 0;
      if (u + a > 1 + 1e-9 && !clash) clash = d;
      days += a;
    });
    if (clash) return fail('OVERLAPS_OTHER_LEAVE', 'on ' + clash);
    days = leave_r2_(days);
    if (days <= 0) return;
    dates.forEach(function (d, k) {
      if (d >= pStart && d <= pEnd) used[w.emp + '|' + d] = (used[w.emp + '|' + d] || 0) + share[k];
    });
    out.valid.push({ PAYROLL_MONTH: period, EMP_ID: w.emp, LEAVE_TYPE: w.type, DAYS: days, FROM_DATE: w.start, TO_DATE: w.end,
      SOURCE_REF: label + '!' + w.srcRow, CASE_NO: w.kase, KEY: w.emp + '|' + w.type + '|' + w.start + '|' + w.end, STATUS: 'VALID',
      EXCEPTION_REASON: '', NORMALIZER_VERSION: LEAVE_NORMALIZER_VERSION, ENTERED_AT: enteredAt });
  });

  problems.forEach(function (x) {
    var p = x.p;
    out.exceptions.push({ PAYROLL_MONTH: period, EMP_ID: p.emp, LEAVE_TYPE: p.type || p.ltRaw, DAYS: 0,
      FROM_DATE: p.start, TO_DATE: p.end, SOURCE_REF: label + '!' + p.srcRow, CASE_NO: p.kase,
      KEY: p.emp + '|' + (p.type || 'RAW') + '|' + (p.start || 'NODATE') + '|' + (p.end || 'NODATE') + '|R' + p.srcRow,
      STATUS: 'EXCEPTION', EXCEPTION_REASON: x.reason + (x.detail ? ' | ' + x.detail : '') +
        (p.appDaysRaw !== '' && p.appDaysRaw != null ? ' | APPROVED_DAYS=' + p.appDaysRaw : ''),
      NORMALIZER_VERSION: LEAVE_NORMALIZER_VERSION, ENTERED_AT: enteredAt });
  });
  return out;
}

function leave_isNormalizerRow_(r) {
  return !!feeds_str_(r.NORMALIZER_VERSION) && !!feeds_str_(r.KEY);
}

/** {EMP_ID: {EL, CL, SL, OD, COFF, LWP}} in-period days of the VALID normalizer rows of the period. */
function leaveByEmp(rows, period) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.STATUS).toUpperCase() !== 'VALID' || !leave_isNormalizerRow_(r)) return;
    var t = feeds_str_(r.LEAVE_TYPE).toUpperCase();
    if (LEAVE_TYPES.indexOf(t) < 0) return;
    var n = feeds_num_(r.DAYS);
    if (isNaN(n) || n <= 0) return;
    var id = feeds_empId_(r.EMP_ID);
    var e = out[id] || (out[id] = {});
    e[t] = leave_r2_((e[t] || 0) + n);
  });
  return out;
}

/** [{EMP_ID, reason, sourceRef}] for the current (not superseded) EXCEPTION rows of the period. */
function leaveExceptions(rows, period) {
  var out = [];
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.STATUS).toUpperCase() !== 'EXCEPTION' || !leave_isNormalizerRow_(r)) return;
    out.push({ EMP_ID: feeds_empId_(r.EMP_ID), reason: feeds_str_(r.EXCEPTION_REASON), sourceRef: feeds_str_(r.SOURCE_REF) });
  });
  return out;
}

function leave_same_(fresh, live) {
  var a = feeds_num_(fresh.DAYS), b = feeds_num_(live.DAYS);
  return feeds_str_(fresh.STATUS).toUpperCase() === feeds_str_(live.STATUS).toUpperCase() &&
    (isNaN(a) ? 0 : a) === (isNaN(b) ? 0 : b) && feeds_str_(fresh.EXCEPTION_REASON) === feeds_str_(live.EXCEPTION_REASON) &&
    feeds_str_(fresh.LEAVE_TYPE) === feeds_str_(live.LEAVE_TYPE);
}

/**
 * Re-sync planner (pure), same pattern as OT: normalizer rows of the period that are not SUPERSEDED and identical to a
 * fresh row (same KEY, status, type, days, reason) are kept; every other live normalizer row is superseded and every
 * unmatched fresh row is appended. existing = INPUT_LEAVE row objects ({_row, ...}).
 * @returns {{supersede:Array, append:Array, unchanged:number}}
 */
function leave_planResync(existing, fresh, period) {
  var freshByKey = {};
  (fresh || []).forEach(function (f) { freshByKey[f.KEY] = f; });
  var matched = {}, supersede = [], unchanged = 0;
  (existing || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period || !leave_isNormalizerRow_(r)) return;
    if (feeds_str_(r.STATUS).toUpperCase() === 'SUPERSEDED') return;
    var f = freshByKey[feeds_str_(r.KEY)];
    if (f && !matched[f.KEY] && leave_same_(f, r)) { matched[f.KEY] = true; unchanged++; return; }
    supersede.push(r);
  });
  return { supersede: supersede, append: (fresh || []).filter(function (f) { return !matched[f.KEY]; }), unchanged: unchanged };
}

/** Cell updates marking a live INPUT_LEAVE row SUPERSEDED (days zeroed, original kept in the reason). */
function leave_supersedeValues(row, stamp) {
  var d = feeds_str_(row.DAYS);
  return { STATUS: 'SUPERSEDED', DAYS: 0,
    EXCEPTION_REASON: 'SUPERSEDED_BY_RESYNC ' + (stamp || '') + ' | WAS=' + (feeds_str_(row.STATUS) || 'VALID') +
      (d ? ' | ORIGINAL_DAYS=' + d : '') };
}

// ================================================================ leave balances for the payslip (pure part)

/**
 * Pure. Locates the employee-code column and each EL / CL / SL "available" column INDEPENDENTLY across the header rows
 * (the real tabs keep "EMP CODE" in row 1 and "EL/CL/SL Available" in row 3). Each must match exactly once over all the
 * scanned rows (alias match on the normalized header; password headers are never eligible); anything else = not found
 * (-1) with a note. A column that is not found leaves only its own token blank.
 * @param {Array<Array>} headerRows the first rows of the tab (a plain 1-D header row is accepted too)
 * @returns {{emp:number, EL:number, CL:number, SL:number, headerRow:number, firstDataOffset:number, ok:boolean, notes:Array}}
 *   headerRow = 1-based number of the last header row that held a found column; first data row is searched below it.
 */
function leave_balanceColumns_(headerRows) {
  var rows = headerRows || [];
  if (rows.length && !Array.isArray(rows[0])) rows = [rows];
  var hits = {};   // normalized header -> [{c, r}]
  rows.forEach(function (row, r) {
    (row || []).forEach(function (h, i) {
      var k = feeds_norm_(h);
      if (!k || feeds_isPasswordHeader_(h)) return;
      (hits[k] || (hits[k] = [])).push({ c: i, r: r + 1 });
    });
  });
  var notes = [], lastRow = 0;
  var pick = function (label, aliases) {
    var found = [];
    aliases.forEach(function (a) { (hits[a] || []).forEach(function (x) { found.push(x); }); });
    if (found.length !== 1) { notes.push(label + (found.length ? ' matches ' + found.length + ' columns' : ' column not found')); return -1; }
    lastRow = Math.max(lastRow, found[0].r);
    return found[0].c;
  };
  var cols = { emp: pick('EMP CODE', LEAVE_BALANCE_EMP_ALIASES), EL: pick('EL Available', LEAVE_BALANCE_ALIASES.EL),
    CL: pick('CL Available', LEAVE_BALANCE_ALIASES.CL), SL: pick('SL Available', LEAVE_BALANCE_ALIASES.SL), notes: notes };
  cols.headerRow = lastRow;
  cols.ok = cols.emp >= 0 && (cols.EL >= 0 || cols.CL >= 0 || cols.SL >= 0);
  return cols;
}

/** Employee-code shaped cell (VFL1234, CON01, S1 ...): letters then digits. Header words such as "EMP CODE" do not match. */
function leave_isEmpCode_(v) {
  var s = feeds_str_(v);
  return /^[A-Za-z][A-Za-z\-]*\d+$/.test(s);
}

/**
 * Pure. Rows below the identified header -> {byEmp:{EMP_ID:{EL,CL,SL}}, ambiguous:[ids]}. An employee that appears in more
 * than one row is AMBIGUOUS and gets no balance (never guessed). Non-numeric cell or a column that was not found (-1) ->
 * that balance is left out.
 */
function leave_balancesFromRows(cols, rows) {
  var byEmp = {}, count = {};
  (rows || []).forEach(function (r) {
    var id = feeds_empId_(feeds_cell_(r, cols.emp));
    if (!id) return;
    count[id] = (count[id] || 0) + 1;
    if (count[id] > 1) return;
    var b = {};
    ['EL', 'CL', 'SL'].forEach(function (t) {
      if (cols[t] < 0) return;
      var n = feeds_num_(feeds_cell_(r, cols[t]));
      if (!isNaN(n)) b[t] = n;
    });
    byEmp[id] = b;
  });
  var ambiguous = Object.keys(count).filter(function (id) { return count[id] > 1; });
  ambiguous.forEach(function (id) { delete byEmp[id]; });
  return { byEmp: byEmp, ambiguous: ambiguous };
}

// ================================================================ sheet-touching

/**
 * Opens the leave source READ-ONLY. LEAVE_SOURCE_SPREADSHEET_ID (seeded) -> that spreadsheet's LEAVE_SOURCE_TAB
 * (default Leave_Applications); blank -> a local tab of this spreadsheet with that name.
 */
function leave_openSource_(tabOverride) {
  var id = String(getControl('LEAVE_SOURCE_SPREADSHEET_ID', '')).trim();
  var tab = String(tabOverride || getControl('LEAVE_SOURCE_TAB', '') || LEAVE_DEFAULT_TAB).trim();
  if (!id) {
    var local = getSheet(tab);
    if (!local) throw new Error('Leave source tab "' + tab + '" not found in this spreadsheet (PAYROLL_CONTROL LEAVE_SOURCE_TAB / LEAVE_SOURCE_SPREADSHEET_ID)');
    return { sheet: local, label: tab, ss: null };
  }
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) {
    throw new Error('Cannot open the leave spreadsheet (LEAVE_SOURCE_SPREADSHEET_ID ' + id + '): ' + (e && e.message ? e.message : e) +
      '. Give the Google account that runs HR OS (the script runner) at least VIEW access to the leave spreadsheet, then run Sync leave again.');
  }
  var sheet = ss.getSheetByName(tab);
  if (!sheet) throw new Error('The leave spreadsheet has no tab "' + tab + '" (PAYROLL_CONTROL LEAVE_SOURCE_TAB)');
  return { sheet: sheet, label: 'leave:' + tab, ss: ss };
}

function leave_clearError_(period) {
  var key = 'LEAVE_SYNC_ERROR_' + period;
  var map = readControlMap();
  if (map[key] !== undefined && String(map[key]) !== '') setControl(key, '', 'Leave sync failed; cleared by the next successful sync');
}

/**
 * Sync approved leave of the period from the leave spreadsheet into INPUT_LEAVE (read-only source; needed columns only,
 * never a password column). Re-sync supersedes changed rows and appends fresh ones; LOCKED populations are never
 * touched. Afterwards the PENDING register rows of the period are re-derived with the new leave.
 */
function syncLeaveFromSource(period) {
  guardPeriod_(period);
  var src = leave_openSource_();
  var block = feeds_readColumns_(src.sheet, LEAVE_DEFS);
  if (block.missing.length) throw new Error('Leave source is missing required column(s): ' + block.missing.join(', '));
  var roster = buildRoster(period);
  var popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var win = leave_window(period, readControlMap());
  var res = mapLeaveRows(block.header, block.rows, period, roster, { firstRow: 2, enteredAt: nowIso_(), sourceLabel: src.label,
    window: { start: win.start, end: win.end } });
  if (res.missingColumns.length) throw new Error('Leave source is missing required column(s): ' + res.missingColumns.join(', '));
  var isLockedEmp = feeds_lockedFn_(period), lockedSkipped = 0;
  var open = function (o) {
    var pop = popOf[String(o.EMP_ID).toUpperCase()];
    if (pop && isLockedEmp(pop, o.EMP_ID)) { lockedSkipped++; return false; }
    return true;
  };
  var fresh = res.valid.concat(res.exceptions).filter(open);
  var existing = readObjects(TABS.INPUT_LEAVE).filter(function (r) {
    var pop = popOf[String(r.EMP_ID).toUpperCase()];
    return !(pop && isLockedEmp(pop, r.EMP_ID));
  });
  var plan = leave_planResync(existing, fresh, period);
  var stamp = nowIso_();
  updateRows(TABS.INPUT_LEAVE, plan.supersede.map(function (r) { return { row: r._row, values: leave_supersedeValues(r, stamp) }; }));
  if (plan.append.length) {
    appendObjects(TABS.INPUT_LEAVE, plan.append, { textHeaders: ['KEY', 'SOURCE_REF', 'CASE_NO', 'FROM_DATE', 'TO_DATE', 'EMP_ID'] });
  }
  var newValid = plan.append.filter(function (o) { return o.STATUS === 'VALID'; });
  var refresh = null, refreshNote = '';
  try { refresh = refreshRegisterAttendance_(period); } catch (e) { refreshNote = String(e && e.message ? e.message : e); }
  var summary = { period: period, window: win.start + '..' + win.end, source: src.label, validWritten: newValid.length,
    validDays: leave_r2_(newValid.reduce(function (t, o) { return t + o.DAYS; }, 0)),
    exceptionsWritten: plan.append.length - newValid.length, superseded: plan.supersede.length, unchanged: plan.unchanged,
    pending: res.pendingCount, revokedByRejection: res.revokedCount, lockedSkipped: lockedSkipped,
    registerRowsRefreshed: refresh ? refresh.refreshed : 0, registerStaleApproved: refresh ? refresh.staleApproved : [],
    registerRefreshNote: refreshNote };
  leave_clearError_(period);
  audit('LEAVE_SYNC', period, '', summary);
  feeds_toast_('Leave sync: ' + summary.validWritten + ' new valid, ' + summary.superseded + ' superseded, ' +
    summary.exceptionsWritten + ' exception(s)');
  return summary;
}

/**
 * Called at the start of calculateDraft: never throws. On failure the error is stored in PAYROLL_CONTROL
 * LEAVE_SYNC_ERROR_<period> (readiness then shows the population-level BLOCKER LEAVE_SOURCE_UNREACHABLE) and the LEAVE
 * feed is set back to OPEN. Returns {ok, summary | error}.
 */
function leaveAutoSync_(period) {
  try {
    return { ok: true, summary: syncLeaveFromSource(period) };
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    try { setControl('LEAVE_SYNC_ERROR_' + period, msg, 'Leave sync failed; cleared by the next successful sync'); } catch (e1) { /* ignore */ }
    try { markFeedComplete(period, 'LEAVE', 'leave sync failed: ' + msg, 'OPEN'); } catch (e2) { /* ignore */ }
    try { audit('LEAVE_SYNC_FAILED', period, '', msg); } catch (e3) { /* ignore */ }
    return { ok: false, error: msg };
  }
}

/**
 * EL / CL / SL available balances for the payslip: {byEmp:{EMP_ID:{EL,CL,SL}}, matched, note}. Read-only, header-mapped,
 * generation time only. When the tab / columns cannot be identified confidently, or an employee has several rows, the
 * balance is left out (blank token) and the note says why - nothing is guessed.
 */
function leave_readBalances_(population, empIds) {
  var out = { byEmp: {}, matched: 0, note: '' };
  var tab = LEAVE_BALANCE_TABS[population];
  if (!tab) { out.note = 'no leave-balance tab for ' + population; return out; }
  var src;
  try { src = leave_openSource_(tab); } catch (e) { out.note = String(e && e.message ? e.message : e); return out; }
  var sheet = src.sheet, lc = sheet.getLastColumn(), lr = sheet.getLastRow();
  if (lc < 1 || lr < 2) { out.note = 'balance tab ' + tab + ' is empty'; return out; }
  var hdrRows = sheet.getRange(1, 1, Math.min(LEAVE_BALANCE_HEADER_SCAN_ROWS, lr), lc).getValues();
  var cols = leave_balanceColumns_(hdrRows);
  if (!cols.ok) { out.note = 'could not identify the employee and EL/CL/SL available columns in ' + tab + ' (' + cols.notes.join('; ') + ') - balances left blank'; return out; }
  var used = [cols.emp, cols.EL, cols.CL, cols.SL].filter(function (k) { return k >= 0; });
  hdrRows.forEach(function (h) { feeds_assertNoPassword_(h, used); });
  var missing = ['EL', 'CL', 'SL'].filter(function (t) { return cols[t] < 0; });
  // data starts at the first row below the header rows whose employee cell looks like an employee code
  var from = cols.headerRow + 1, n = lr - cols.headerRow;
  if (n < 1) { out.note = 'balance tab ' + tab + ' has no data rows'; return out; }
  var empVals = sheet.getRange(from, cols.emp + 1, n, 1).getValues();
  var first = -1;
  for (var i = 0; i < n; i++) { if (leave_isEmpCode_(empVals[i][0])) { first = i; break; } }
  if (first < 0) { out.note = 'no employee-code rows found in ' + tab + ' - balances left blank'; return out; }
  var m = n - first, base = from + first;
  var colVals = { emp: sheet.getRange(base, cols.emp + 1, m, 1).getValues() };
  ['EL', 'CL', 'SL'].forEach(function (t) { if (cols[t] >= 0) colVals[t] = sheet.getRange(base, cols[t] + 1, m, 1).getValues(); });
  var rows = [];
  for (var j = 0; j < m; j++) {
    var row = [];
    row[cols.emp] = colVals.emp[j][0];
    ['EL', 'CL', 'SL'].forEach(function (t) { if (cols[t] >= 0) row[cols[t]] = colVals[t][j][0]; });
    rows.push(row);
  }
  var parsedBal = leave_balancesFromRows(cols, rows);
  var want = {};
  (empIds || []).forEach(function (id) { want[feeds_empId_(id)] = true; });
  Object.keys(parsedBal.byEmp).forEach(function (id) {
    if (want[id]) { out.byEmp[id] = parsedBal.byEmp[id]; out.matched++; }
  });
  var notes = [];
  if (missing.length) notes.push(missing.join('/') + ' available column not found in ' + tab + ' (token left blank)');
  var amb = parsedBal.ambiguous.filter(function (id) { return want[id]; });
  if (amb.length) notes.push(amb.length + ' employee(s) appear in several rows of ' + tab + ' (balances left blank, not guessed)');
  out.note = notes.join('; ');
  return out;
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
 * Per key, the STATUTORY_CONFIG row that applies to the period: effective (EFFECTIVE_FROM <= period, EFFECTIVE_TO
 * blank or >= period), non-blank KEY and VALUE, highest VERSION (first row among equals).
 * Returns {KEY: {ver, raw, row, approved}}; approved = APPROVED_BY is not blank.
 */
function calc_statutoryWinners_(configRows, period) {
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
    if (!best[key] || ver > best[key].ver) best[key] = { ver: ver, raw: r.VALUE, row: r, approved: !calc_isBlank(r.APPROVED_BY) };
  });
  return best;
}

/**
 * configRows: [{KEY, VALUE, EFFECTIVE_FROM, EFFECTIVE_TO, VERSION, APPROVED_BY}]
 * Returns {values, missing, invalid, unapproved}. `missing` / `unapproved` are computed for `population` when given,
 * else for the union of STAFF and PERMANENT_WORKER keys. unapproved = required keys whose applicable row has a blank
 * APPROVED_BY (sheet rules R11 / R27: no statutory value is used before Accounts signs it).
 */
function resolveStatutory(configRows, period, population) {
  var best = calc_statutoryWinners_(configRows, period);
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
  var missing = [], unapproved = [];
  req.forEach(function (k) {
    if (seen[k]) return;
    seen[k] = true;
    if (values[k] === undefined) missing.push(k);
    else if (!best[k].approved) unapproved.push(k);
  });
  return { values: values, missing: missing, invalid: invalid, unapproved: unapproved };
}

/** PAYROLL_RATE_PROFILE row approved by the user as the July 2026 proxy (VERSION_STATE USER_APPROVED_JULY_PROXY) - R28. */
function calc_isProxyRate(rateRow) {
  return !!rateRow && /PROXY/i.test(String(rateRow.VERSION_STATE == null ? '' : rateRow.VERSION_STATE));
}

/** Rate profile approval: blank VERSION_STATE = no gate; any state containing APPROVED (not UNAPPROVED) counts as approved. */
function calc_isRateApproved(rateRow) {
  var st = String(rateRow && rateRow.VERSION_STATE != null ? rateRow.VERSION_STATE : '').trim().toUpperCase();
  if (!st) return true;
  return /(^|[^A-Z])APPROVED/.test(st);
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

/** Slab amount for floor(pct): highest configured percent <= floor(pct); none -> 0 (<81), >85 -> the 85 slab. It is the amount PAID (no deduction, no proration). */
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

/** Built-in category code -> calc method, used when the caller (a test, or the engine before config) gives no ctx.method. */
var CALC_DEFAULT_METHODS = { STAFF: 'STAFF', PERMANENT_WORKER: 'PERMANENT_WORKER', CONSULTANT: 'CONSULTANT', PUNE_STAFF: 'PUNE_STAFF' };

/** ctx.method (the CALC_METHOD of the category, set by the engine) or the built-in method of the population code. */
function calc_methodOf_(ctx) {
  if (ctx && ctx.method) return String(ctx.method).trim().toUpperCase();
  var p = ctx && ctx.population ? String(ctx.population).trim() : '';
  return Object.prototype.hasOwnProperty.call(CALC_DEFAULT_METHODS, p) ? CALC_DEFAULT_METHODS[p] : '';
}

/** The output ROW's POPULATION is the category code (ctx.population); falls back to the method name. */
function calc_newRow_(ctx, method) {
  var row = {};
  OUTPUT_COLUMNS.forEach(function (c) { row[c] = null; });
  var emp = ctx.emp || {};
  row.PERIOD = ctx.period;
  row.POPULATION = ctx.population || method;
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
function calc_readInputs_(ctx, method, row, ex) {
  var population = ctx.population || method;
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

  inp.w = inp.present + inp.ph + inp.el + inp.cl + inp.sl + inp.plo + (method === 'PERMANENT_WORKER' ? 0 : inp.wo);

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
    if (method === 'PERMANENT_WORKER') {
      calc_ex_(ex, 'BLOCKER', 'WORKED_EXCEEDS_WORKING_DAYS', 'Worked days ' + inp.w + ' exceed working days ' + wd);
    } else {
      calc_ex_(ex, 'WARN', 'WORKED_EXCEEDS_WORKING_DAYS', 'Worked days ' + inp.w + ' exceed working days ' + wd);
    }
  }
  return inp;
}

function calc_checkCfg_(method, cfg, ex) {
  var missing = requiredStatutoryKeys(method).filter(function (k) {
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

  // Production (efficiency) pay = the slab amount for floor(pct) from EFFICIENCY_CONFIG: <81 -> 0, 81..85 -> slab,
  // >85 -> the 85 slab. It is an earning; there is NO deduction and NO proration. No % submitted -> 0 + WARN.
  var pct = ctx.efficiencyPct;
  var pctNum = calc_isBlank(pct) ? NaN : calc_num(pct);
  var pctMissing = calc_isBlank(pct);
  if (pctMissing) {
    calc_ex_(ex, 'WARN', 'EFFICIENCY_NOT_SUBMITTED', 'No efficiency % submitted: production allowance is 0');
  } else {
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      calc_ex_(ex, 'BLOCKER', 'INVALID_EFFICIENCY_PCT', 'Efficiency % must be between 0 and 100');
    }
    if (!ctx.efficiencyConfig || !ctx.efficiencyConfig.length) {
      calc_ex_(ex, 'BLOCKER', 'MISSING_EFFICIENCY_CONFIG', 'EFFICIENCY_CONFIG is empty');
    }
  }
  if (ctx.physicalDaysSource === 'EFFICIENCY_OVERRIDE') {
    calc_ex_(ex, 'WARN', 'PHYSICAL_DAYS_FROM_EFFICIENCY_FORM', 'PHYSICAL_PRESENT_DAYS taken from the efficiency form override');
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
  var eligible = pctMissing ? 0 : efficiencySlab(pctNum, ctx.efficiencyConfig);
  var prod = eligible;
  var ap = basic + hra + conv + wash + edu;
  var ot = ((m.BASIC + m.VDA) / wd / 8) * Number(cfg.WORKER_OT_MULTIPLIER) * inp.ot;
  var extras = inp.DISPATCH_INCENTIVE + inp.OTHER_ALLOWANCE + inp.LEAVE_ENCASHMENT + inp.ARREARS +
    inp.PRODUCTION_INCENTIVE + inp.OT_EXTRA_WORK;
  var totalEarn = roundSheets(ap + heat + vda + prod + ot + extras);

  var pfWage = basic + vda;
  var pf = roundSheets(calc_pf_(pfWage, cfg, Number(cfg.PF_EMPLOYEE_RATE)));
  var esiApplies = fg <= cfg.ESI_EXEMPT_ABOVE;
  var esi = esiApplies ? roundSheets(fg * cfg.ESI_EMPLOYEE_RATE / wd * w) : 0;
  if (esi > 0) calc_ex_(ex, 'WARN', 'WORKER_ESI_BASIS_UNCONFIRMED', 'Worker ESI basis (fixed gross) is unconfirmed');
  var pt = ptAmount(totalEarn, calc_monthNameFromPeriod(ctx.period), row.EMP_ID, cfg, ctx.ptExemptSet);
  var mlwf = calc_mlwf_(ctx.period, cfg);
  var otherDed = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA;
  var ded = pf + esi + pt + inp.canteen + inp.society + inp.advance + mlwf + inp.TDS + otherDed;

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
  row.EFFICIENCY_PCT = pctMissing ? null : pctNum;
  row.EFFICIENCY_ELIGIBLE_AMOUNT = eligible;
  row.EFFICIENCY_DEDUCTION = 0;
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

function calc_simple_(ctx, method) {
  var ex = [];
  var population = ctx.population || method;
  var row = calc_newRow_(ctx, method);
  var inp = calc_readInputs_(ctx, method, row, ex);
  var r = ctx.rate;
  var basis = null, rate = 0, mg = 0;
  if (!r) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_RATE_PROFILE', 'No PAYROLL_RATE_PROFILE row');
  } else {
    basis = String(r.PAY_BASIS || '').trim().toUpperCase();
    rate = calc_num(r.RATE_AMOUNT_INR);
    mg = calc_num(r.MONTHLY_GROSS_INR);
    if (method === 'PUNE_STAFF') {
      if (basis !== 'MONTHLY_GROSS_PRORATED') {
        calc_ex_(ex, 'BLOCKER', 'INVALID_PAY_BASIS', population + ' requires MONTHLY_GROSS_PRORATED, got "' + basis + '"');
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
    if (basis === 'MONTHLY_GROSS_PRORATED' && method === 'CONSULTANT' && inp.ot > 0) {
      calc_ex_(ex, 'BLOCKER', 'BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM', 'Monthly-gross consultant has OT hours');
    }
    if (calc_isProxyRate(r)) {
      calc_ex_(ex, 'WARN', 'PROXY_RATE_JUL2026', 'Rate is the approved July 2026 proxy (VERSION_STATE ' + r.VERSION_STATE + ')');
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
    ot = method === 'PUNE_STAFF' ? mg / wd / 8 * inp.ot : 0;
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
  switch (calc_methodOf_(ctx)) {
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
 * rows for the period (other periods are never touched). Only STATUS = BLOCKED (global problems) blocks approval;
 * STATUS = HOLD lists employee-level problems: those employees are excluded from NET / hash / lock and the rest of
 * the population continues. Helpers are prefixed rdy_.
 */
var RDY_MAX_IDS = 20;
var RDY_UNASSIGNED = '(UNASSIGNED)';
var RDY_REQUIRED_FEEDS = ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'LEAVE'];
var RDY_ATT_FIELDS = ['PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS'];
var RDY_CHECK_NAMES = ['PERIOD_WORKING_DAYS', 'ATTENDANCE_COVERAGE', 'ATTENDANCE_APPROVED_VALID',
  'DAILY_ATTENDANCE_COMPLETE', 'SALARY_PRESENT_NONZERO', 'FEEDS_COMPLETE', 'OT_EXCEPTIONS', 'STATUTORY_CONFIG',
  'DUPLICATE_MASTER_IDS', 'CONSULTANT_MONTHLY_OT', 'EFFICIENCY_CONFIG_CONFIRMED', 'NEGATIVE_NET_PAY',
  'PAY_STRUCTURE_APPROVED', 'CANTEEN_EFFICIENCY_EXCEPTIONS', 'LEAVE_EXCEPTIONS', 'ATTENDANCE_DISPUTES'];
/** Engine HOLD codes that already have their own readiness check (CALC_BLOCKERS lists only the others). */
var RDY_COVERED_CODES = ['SALARY_NOT_APPROVED', 'NEGATIVE_NET_PAY', 'MISSING_ATTENDANCE', 'DUPLICATE_ATTENDANCE_ROWS', 'ATTENDANCE_NOT_APPROVED',
  'ATTENDANCE_INVALID_VALUE', 'ATTENDANCE_OVER_MONTH', 'HR_OVERRIDE_WITHOUT_REASON', 'DAILY_ATTENDANCE_MISSING',
  'DUPLICATE_MASTER_ID', 'OT_EXCEPTION', 'CANTEEN_EXCEPTION', 'EFFICIENCY_EXCEPTION', 'LEAVE_EXCEPTION',
  'ATTENDANCE_DISPUTE', 'MISSING_SALARY_STRUCTURE', 'ZERO_SALARY_STRUCTURE', 'MISSING_RATE_PROFILE', 'ZERO_RATE',
  'BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM'];

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

/** blockers = global (BLOCKED), holds = employee-level (HOLD), warns (WARN). Precedence BLOCKED > HOLD > WARN > READY. */
function rdy_res_(blockers, warns, okDetail, holds) {
  holds = holds || [];
  var parts = [];
  if (blockers.length) parts.push(blockers.join('; '));
  if (holds.length) parts.push('employee HOLD (excluded from NET and lock): ' + holds.join('; '));
  if (warns.length) parts.push(warns.join('; '));
  if (blockers.length) return { status: 'BLOCKED', detail: parts.join(' | ') };
  if (holds.length) return { status: 'HOLD', detail: parts.join(' | ') };
  if (warns.length) return { status: 'WARN', detail: parts.join(' | ') };
  return { status: 'READY', detail: okDetail || 'OK' };
}

function rdy_set_(list) {
  var s = {};
  if (Array.isArray(list)) list.forEach(function (x) { s[rdy_id_(x)] = true; });
  else if (list && typeof list === 'object') Object.keys(list).forEach(function (k) { if (list[k]) s[k] = true; });
  return s;
}

function rdy_worked_(row, method) {
  var n = function (k) { return rdy_num_(row[k]); };
  var w = n('PRESENT_DAYS') + n('EL_AVAILED') + n('CL_AVAILED') + n('SL_AVAILED') + n('PH') + n('PAID_LEAVE_OTHER');
  if (method !== 'PERMANENT_WORKER') w += n('WEEK_OFF');
  return w;
}

/** CALC_METHOD of the population under check (inputs.method, else the configured / built-in method of the category). */
function rdy_method_(inputs) {
  if (inputs.method) return String(inputs.method).trim().toUpperCase();
  return typeof categoryMethod === 'function' ? (categoryMethod(inputs.population) || inputs.population) : inputs.population;
}

/**
 * Pay-structure approval gate shared by the readiness check and the engine. ids = the population's employee ids;
 * pay = {id: SALARY_STRUCTURE row or PAYROLL_RATE_PROFILE row}; salaryBased = the method reads SALARY_STRUCTURE
 * (STAFF / PERMANENT_WORKER), otherwise PAYROLL_RATE_PROFILE. A row counts as approved when HR_APPROVED_BY is set
 * (salary structure) or VERSION_STATE is an approved state (rate profile; blank = no gate).
 * Returns {unapproved:[ids], approvedCount, mode}: mode BLOCK = NO row of the population is approved (population-level
 * blocker, the initial sign-off has not happened), HOLD = some are approved so the unapproved ones (added later, e.g.
 * new joiners or salary revisions) are per-employee holds SALARY_NOT_APPROVED, OK = nothing unapproved.
 */
function rdy_payGate_(ids, pay, salaryBased) {
  var unapproved = [], approved = 0;
  (ids || []).forEach(function (id) {
    var r = (pay || {})[id];
    if (!r) return;
    var ok = salaryBased ? rdy_id_(r.HR_APPROVED_BY) !== '' : calc_isRateApproved(r);
    if (ok) approved++; else unapproved.push(id);
  });
  var mode = !unapproved.length ? 'OK' : (approved === 0 ? 'BLOCK' : 'HOLD');
  return { unapproved: unapproved, approvedCount: approved, mode: mode };
}

function rdy_salaryBased_(method) { return method === 'STAFF' || method === 'PERMANENT_WORKER'; }

/** Attendance rows relevant to this population (its category, or unknown category and not active elsewhere). */
function rdy_popAttendance_(inputs, rosterSet) {
  var pop = inputs.population;
  var all = inputs.allActiveIds ? rdy_set_(inputs.allActiveIds) : null;
  return (inputs.attendanceRows || []).filter(function (r) {
    var id = rdy_id_(r.EMP_ID);
    var cat = rdy_id_(r.PAYROLL_CATEGORY);
    if (cat === pop) return true;
    if (rosterSet[id]) return true;
    if (cat === '' || !isKnownPopulation(cat)) return !(all && all[id]);
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
  var b = [], h = [];
  if (missing.length) h.push('no attendance row: ' + rdy_list_(missing));
  if (dups.length) h.push('duplicate attendance rows: ' + rdy_list_(dups));
  if (unknown.length) b.push('unknown/inactive EMP_ID in attendance: ' + rdy_list_(unknown));
  return rdy_res_(b, [], ctx.rosterIds.length + ' employees covered', h);
}

function rdy_check3_(inputs, ctx) {
  var pop = inputs.population, method = rdy_method_(inputs), dim = daysInMonth(inputs.period);
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
    var w = rdy_worked_(r, method);
    if (w > dim) overDim.push(id + '(' + w + ')');
    else if (isFinite(wd) && wd > 0 && w > wd) overWd.push(id + '(' + w + ')');
    if (rdy_id_(r.HR_OVERRIDE).toUpperCase() === 'Y' && rdy_id_(r.OVERRIDE_REASON) === '') noReason.push(id);
  });
  var h = [], w = [];
  if (notApproved.length) h.push('attendance not APPROVED: ' + rdy_list_(notApproved));
  if (badNum.length) h.push('blank/non-numeric/negative day fields: ' + rdy_list_(badNum));
  if (overDim.length) h.push('ATTENDANCE_OVER_MONTH (worked days exceed days in month): ' + rdy_list_(overDim));
  if (noReason.length) h.push('HR_OVERRIDE=Y without OVERRIDE_REASON: ' + rdy_list_(noReason));
  if (overWd.length) {
    var msg = 'worked days exceed WORKING_DAYS: ' + rdy_list_(overWd);
    if (method === 'PERMANENT_WORKER') h.push(msg); else w.push(msg);
  }
  return rdy_res_([], w, ctx.attRows.length + ' rows approved and valid', h);
}

function rdy_check4_(inputs, ctx) {
  var m = inputs.dailyMissingByEmp;
  if (m == null) return { status: 'READY', detail: 'No daily attendance data for period (monthly entry)' };
  var bad = ctx.rosterIds.filter(function (id) { return m[id] && m[id].length; })
    .map(function (id) { return id + '(' + m[id].length + ' dates, from ' + m[id][0] + ')'; });
  return rdy_res_([], [], 'Daily attendance complete', bad.length ? ['missing daily dates: ' + rdy_list_(bad)] : []);
}

function rdy_check5_(inputs, ctx) {
  var method = rdy_method_(inputs);
  var missing = [], zero = [];
  ctx.rosterIds.forEach(function (id) {
    if (rdy_salaryBased_(method)) {
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
  var h = [];
  if (missing.length) h.push('no salary structure / rate profile: ' + rdy_list_(missing));
  if (zero.length) h.push('zero pay structure: ' + rdy_list_(zero));
  return rdy_res_([], [], 'Pay structure present for all', h);
}

function rdy_check6_(inputs) {
  var feeds = RDY_REQUIRED_FEEDS.slice();
  if (rdy_method_(inputs) === 'PERMANENT_WORKER') feeds.push('EFFICIENCY');
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
  var own = [], unknown = [];
  (inputs.otExceptionRows || []).forEach(function (r) {
    if (rdy_id_(r.ELIGIBILITY).toUpperCase() !== 'EXCEPTION') return;
    var p = normalizePeriod(r.PAYROLL_MONTH);
    if (p && p !== inputs.period) return;
    var id = rdy_id_(r.EMP_ID);
    if (ctx.rosterSet[id]) own.push(id);
    // unattributable (unknown EMP_ID) exceptions block every population - fail closed
    else if (all ? !all[id] : false) unknown.push(id === '' ? '(blank EMP_ID)' : id);
  });
  var b = unknown.length ? ['OT exceptions for unknown EMP_ID (' + unknown.length + '): ' + rdy_list_(rdy_uniq_(unknown))] : [];
  var h = own.length ? ['OT exceptions (' + own.length + '): ' + rdy_list_(rdy_uniq_(own))] : [];
  var w = inputs.pendingOtCount > 0 ? ['pending OT events: ' + inputs.pendingOtCount] : [];
  return rdy_res_(b, w, 'No OT exceptions', h);
}

function rdy_check8_(inputs) {
  var pop = inputs.population;
  var required = requiredStatutoryKeys(rdy_method_(inputs));
  if (!required.length) return { status: 'READY', detail: 'No statutory keys required for ' + pop };
  var st = inputs.statutoryResolved;
  if (!st) return { status: 'BLOCKED', detail: 'Statutory config not resolved for ' + inputs.period };
  var b = [];
  if (st.missing && st.missing.length) b.push('missing keys: ' + st.missing.join(', '));
  if (st.invalid && st.invalid.length) b.push('invalid values: ' + st.invalid.join(', '));
  if (st.unapproved && st.unapproved.length) {
    b.push('not approved by Accounts (APPROVED_BY blank; use HR OS > Payroll > Approve statutory config): ' + st.unapproved.join(', '));
  }
  return rdy_res_(b, [], 'All statutory keys present and approved');
}

function rdy_check9_(inputs, ctx) {
  var counts = {};
  (inputs.roster || []).forEach(function (e) { var id = rdy_id_(e.EMP_ID); counts[id] = (counts[id] || 0) + 1; });
  var dups = Object.keys(counts).filter(function (id) { return counts[id] > 1; });
  (inputs.masterDuplicateIds || []).forEach(function (x) {
    var id = rdy_id_(x);
    if (ctx.rosterSet[id] && dups.indexOf(id) < 0) dups.push(id);
  });
  return rdy_res_([], [], 'No duplicates', dups.length ? ['duplicate active EMP_ID in EMPLOYEE_MASTER: ' + rdy_list_(dups)] : []);
}

function rdy_check10_(inputs, ctx) {
  if (rdy_method_(inputs) !== 'CONSULTANT') return { status: 'READY', detail: 'Not applicable' };
  var ot = inputs.otHoursByEmp || {};
  var bad = ctx.rosterIds.filter(function (id) {
    var r = (inputs.rateByEmp || {})[id];
    if (!r) return false;
    var basis = rdy_id_(r.PAY_BASIS).toUpperCase();
    return basis === 'MONTHLY_GROSS_PRORATED' && rdy_num_(ot[id]) > 0;
  });
  return rdy_res_([], [], 'No monthly consultant OT',
    bad.length ? ['monthly consultant with OT hours (BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM): ' + rdy_list_(bad)] : []);
}

function rdy_check11_(inputs) {
  if (rdy_method_(inputs) !== 'PERMANENT_WORKER') return { status: 'READY', detail: 'Not applicable' };
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
  return rdy_res_([], [], 'No negative net pay', neg.length ? ['negative net pay: ' + rdy_list_(neg)] : []);
}

/**
 * Sheet rules R11 / R27 / PROCESS_FLOW 1.0: pay structures must be approved before they are used.
 * SALARY_STRUCTURE categories: the effective row needs HR_APPROVED_BY. PAYROLL_RATE_PROFILE categories: VERSION_STATE
 * must be an approved state (blank = no gate); USER_APPROVED_JULY_PROXY counts as approved but raises a WARN
 * (PROXY_RATE_JUL2026, R28). Population-level BLOCKER only when NO row of the population is approved (the initial HR
 * sign-off is missing); rows added after that sign-off (new joiners, salary revisions) are per-employee HOLDs
 * (SALARY_NOT_APPROVED) - the rest of the population is not blocked.
 */
function rdy_check13_(inputs, ctx) {
  var method = rdy_method_(inputs), b = [], w = [], h = [];
  var salaryBased = rdy_salaryBased_(method);
  var gate = rdy_payGate_(ctx.rosterIds, salaryBased ? inputs.salaryByEmp : inputs.rateByEmp, salaryBased);
  if (gate.mode === 'BLOCK') {
    b.push(salaryBased
      ? 'SALARY_STRUCTURE not HR-approved for this population (HR_APPROVED_BY blank; use HR OS > Payroll > Approve salary structure): ' + rdy_list_(gate.unapproved)
      : 'PAYROLL_RATE_PROFILE not approved for this population (VERSION_STATE): ' + rdy_list_(gate.unapproved));
  } else if (gate.mode === 'HOLD') {
    h.push('SALARY_NOT_APPROVED (' + (salaryBased ? 'HR_APPROVED_BY blank' : 'VERSION_STATE not approved') + '; HR OS > Payroll > Approve salary structure): ' + rdy_list_(gate.unapproved));
  }
  if (!salaryBased) {
    var rates = inputs.rateByEmp || {};
    var proxy = ctx.rosterIds.filter(function (id) { return rates[id] && calc_isRateApproved(rates[id]) && calc_isProxyRate(rates[id]); });
    if (proxy.length) w.push('PROXY_RATE_JUL2026: ' + proxy.length + ' employee(s) paid on the approved July 2026 proxy rates');
  }
  return rdy_res_(b, w, 'Pay structure approved', h);
}

/** Splits exception rows into employees of this population (known) and unattributable ones (unknown). */
function rdy_exceptionList_(rows, ctx, allowUnknown) {
  var known = [], unknown = [];
  (rows || []).forEach(function (r) {
    var id = rdy_id_(r.EMP_ID);
    var text = (id || '(blank EMP_ID)') + (r.reason ? ': ' + r.reason : '');
    if (ctx.rosterSet[id]) known.push(text);
    else if (allowUnknown(id)) unknown.push(text);
  });
  return { known: known, unknown: unknown };
}

/**
 * Canteen / efficiency: when the LATEST response of an employee is invalid (EXCEPTION row) there is no fallback to an
 * older valid one. The exception holds the employee (HOLD); unknown / inactive EMP_IDs cannot be attributed and block
 * every population for canteen, and the worker population for efficiency.
 */
function rdy_check14_(inputs, ctx) {
  var pop = inputs.population, all = inputs.allActiveIds ? rdy_set_(inputs.allActiveIds) : null;
  var unknownAll = function (id) { return all ? !all[id] : false; };
  var canteen = rdy_exceptionList_(inputs.canteenExceptions, ctx, unknownAll);
  var eff = rdy_exceptionList_(inputs.efficiencyExceptions, ctx, function (id) { return rdy_method_(inputs) === 'PERMANENT_WORKER' && unknownAll(id); });
  var b = [], h = [];
  if (canteen.unknown.length) b.push('canteen EXCEPTION rows for unknown EMP_ID (' + canteen.unknown.length + '): ' + rdy_list_(canteen.unknown));
  if (eff.unknown.length) b.push('efficiency EXCEPTION rows for unknown EMP_ID (' + eff.unknown.length + '): ' + rdy_list_(eff.unknown));
  if (canteen.known.length) h.push('canteen EXCEPTION rows (' + canteen.known.length + '): ' + rdy_list_(canteen.known));
  if (eff.known.length) h.push('efficiency EXCEPTION rows (' + eff.known.length + '): ' + rdy_list_(eff.known));
  return rdy_res_(b, [], 'No canteen / efficiency exceptions', h);
}

/** Leave sync: current EXCEPTION rows in INPUT_LEAVE hold the employee; an unreachable leave source blocks the population. */
function rdy_check15_(inputs, ctx) {
  var all = inputs.allActiveIds ? rdy_set_(inputs.allActiveIds) : null;
  var lv = rdy_exceptionList_(inputs.leaveExceptions, ctx, function (id) { return all ? !all[id] : false; });
  var b = [], h = [];
  if (rdy_id_(inputs.leaveSyncError)) b.push('LEAVE_SOURCE_UNREACHABLE: ' + rdy_id_(inputs.leaveSyncError));
  if (lv.unknown.length) b.push('leave EXCEPTION rows for unknown EMP_ID (' + lv.unknown.length + '): ' + rdy_list_(lv.unknown));
  if (lv.known.length) h.push('leave EXCEPTION rows (' + lv.known.length + '): ' + rdy_list_(lv.known));
  return rdy_res_(b, [], 'No leave exceptions', h);
}

/** Daily-vs-register attendance disputes (October onward): each unresolved dispute holds that employee. */
function rdy_check16_(inputs, ctx) {
  var h = [];
  (inputs.attendanceDisputes || []).forEach(function (d) {
    var id = rdy_id_(d.EMP_ID);
    if (ctx.rosterSet[id]) h.push(id + ' (' + (d.stage || 'DISPUTE') + ')');
  });
  return rdy_res_([], [], 'No open attendance disputes', h.length ? ['attendance disputes (' + h.length + '): ' + rdy_list_(h)] : []);
}

/**
 * Extra row (only when calcResults supplied): BLOCKED for global calculation problems (GLOBAL_BLOCKER_CODES), HOLD for
 * the other employee-level problems that have no dedicated check.
 */
function rdy_calcBlockers_(inputs) {
  var blockers = [], holds = [];
  inputs.calcResults.forEach(function (res) {
    var id = rdy_id_((res.row || {}).EMP_ID);
    var g = false, hd = false;
    (res.exceptions || []).forEach(function (e) {
      if (e.severity !== 'BLOCKER' && e.severity !== 'HOLD') return;
      if (GLOBAL_BLOCKER_CODES.indexOf(e.code) >= 0) g = true;
      else if (RDY_COVERED_CODES.indexOf(e.code) < 0) hd = true;
    });
    if (g) blockers.push(id); else if (hd) holds.push(id);
  });
  return rdy_res_(blockers.length ? ['calculation blockers: ' + rdy_list_(blockers)] : [], [], 'No calculation blockers',
    holds.length ? ['calculation holds: ' + rdy_list_(holds)] : []);
}

/**
 * inputs = {period, population, roster, allActiveIds?, masterDuplicateIds?, periodCategoryRow, attendanceRows,
 *   dailyMissingByEmp (null = no daily data), salaryByEmp, rateByEmp, feedStatus, otExceptionRows, otHoursByEmp,
 *   pendingOtCount?, statutoryResolved, efficiencyConfigRows, canteenExceptions?, efficiencyExceptions?,
 *   leaveExceptions?, leaveSyncError?, attendanceDisputes?, calcResults?}
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
    rdy_check9_(scoped, ctx), rdy_check10_(scoped, ctx), rdy_check11_(scoped), rdy_check12_(scoped),
    rdy_check13_(scoped, ctx), rdy_check14_(scoped, ctx), rdy_check15_(scoped, ctx), rdy_check16_(scoped, ctx)
  ];
  var out = results.map(function (r, i) {
    return { PERIOD: inputs.period, POPULATION: pop, CHECK: RDY_CHECK_NAMES[i], STATUS: r.status, DETAIL: r.detail };
  });
  if (inputs.categoryUnapproved) {
    out.push({ PERIOD: inputs.period, POPULATION: pop, CHECK: 'CATEGORY_CONFIG', STATUS: 'BLOCKED',
      DETAIL: 'PAYROLL_CATEGORY_CONFIG row of ' + pop + ' is not approved (APPROVED_BY blank; owner: HR OS > Payroll > Approve category config)' });
  }
  if (inputs.calcResults) {
    var cb = rdy_calcBlockers_(inputs);
    out.push({ PERIOD: inputs.period, POPULATION: pop, CHECK: 'CALC_BLOCKERS', STATUS: cb.status, DETAIL: cb.detail });
  }
  return out;
}

/** Summary of readiness rows: {blocked, hold, warn, ready, byPopulation:{pop:{blocked,hold,warn,ready}}}. */
function rdy_summarize_(rows) {
  var s = { blocked: 0, hold: 0, warn: 0, ready: 0, byPopulation: {} };
  rows.forEach(function (r) {
    var p = s.byPopulation[r.POPULATION] || (s.byPopulation[r.POPULATION] = { blocked: 0, hold: 0, warn: 0, ready: 0 });
    var k = r.STATUS === 'BLOCKED' ? 'blocked' : (r.STATUS === 'HOLD' ? 'hold' : (r.STATUS === 'WARN' ? 'warn' : 'ready'));
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
  var pops = population ? [population] : populationList();
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
  // employees whose category is not in PAYROLL_CATEGORY_CONFIG: HOLD (not population-blocking), listed under UNASSIGNED
  var unk = (src.roster && src.roster.unknownCategory) || [];
  if (!population && unk.length) {
    rows.push({ PERIOD: period, POPULATION: RDY_UNASSIGNED, CHECK: 'UNKNOWN_CATEGORY', STATUS: 'HOLD', CHECKED_AT: checkedAt,
      DETAIL: 'employee HOLD (excluded from every run): category not in PAYROLL_CATEGORY_CONFIG: ' +
        rdy_list_(unk.map(function (u) { return u.EMP_ID + ' (' + (u.PAYROLL_CATEGORY || 'blank') + ')'; })) });
  }
  engine_replaceRows_(TABS.PAYROLL_READINESS, ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL', 'CHECKED_AT'], rows,
    function (o) { return normalizePeriod(o.PERIOD) === period && (done.indexOf(rdy_id_(o.POPULATION)) >= 0 || (!population && rdy_id_(o.POPULATION) === RDY_UNASSIGNED)); });
  var sum = rdy_summarize_(rows);
  var res = { period: period, populations: done, skippedLocked: skippedLocked, blocked: sum.blocked, hold: sum.hold,
    warn: sum.warn, ready: sum.ready, byPopulation: sum.byPopulation, rows: rows };
  audit('READINESS', period, population || '', { blocked: sum.blocked, hold: sum.hold, warn: sum.warn, ready: sum.ready });
  return res;
}

// ===== 32_Engine.gs =====
/**
 * 32_Engine.gs - payroll engine orchestration (DESIGN sections 5-7). Pure joiners first (buildEngineContexts,
 * engine_pickSalary, engine_calcPopulation, engine_recon), sheet-touching code after.
 * Exception severities: BLOCKER = global (population) problem, HOLD = employee-level problem (that employee's row is
 * written with FLAGS containing HOLD and NET_PAY null and is excluded from recon totals, the approval hash and the
 * lock), WARN = informational.
 * Feed readers come from 20_Feeds.gs: sumOtHours, canteenByEmp, efficiencyByEmp, advanceByEmp, societyByEmp.
 * Helpers are prefixed engine_.
 */
/** Output tab per category: built-in names for the four defaults, PAYROLL_<CODE> for a configured new category. */
function engine_popTab_(pop) { return populationTab(pop); }
/** RUN_ID prefix of supplementary (top-up) runs written to PAYROLL_DRAFT (42_Supplementary.gs). */
var ENGINE_SUPP_PREFIX = 'SUPP-';
/** RUN type of a PAYROLL_DRAFT row from its RUN_ID: SUPPLEMENTARY for top-up runs, else NORMAL. */
function engine_runType_(runId) { return String(runId == null ? '' : runId).indexOf(ENGINE_SUPP_PREFIX) === 0 ? 'SUPPLEMENTARY' : 'NORMAL'; }
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

/**
 * Rate profile. Without a period: single current row per EMP_ID (last row wins). With a period the rows are effective-
 * dated like SALARY_STRUCTURE: per EMP_ID the row with the latest EFFECTIVE_FROM <= period end (a blank EFFECTIVE_FROM is a
 * legacy row that is always effective, oldest) and EFFECTIVE_TO blank or >= period start; ties: the later row. A salary
 * revision is therefore a new row, older rows stay untouched.
 */
function engine_pickRate(rows, period) {
  var out = {};
  if (!period) {
    (rows || []).forEach(function (r) { var id = engine_id_(r.EMP_ID); if (id) out[id] = r; });
    return out;
  }
  var start = periodStart(period), end = periodEnd(period), best = {};
  (rows || []).forEach(function (r, i) {
    var id = engine_id_(r.EMP_ID);
    if (!id) return;
    var from = engine_dateLo_(r.EFFECTIVE_FROM) || '0000-00-00', to = engine_dateHi_(r.EFFECTIVE_TO);
    if (from > end) return;
    if (to && to < start) return;
    var cur = best[id];
    if (!cur || from > cur.from || (from === cur.from && i >= cur.i)) best[id] = { from: from, i: i, row: r };
  });
  Object.keys(best).forEach(function (k) { out[k] = best[k].row; });
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

/**
 * EMPLOYEE_MASTER rows -> {all: active entries in known populations (duplicates kept), duplicateIds, allActiveIds,
 * joinersExcluded, dojWarnings}. With a period, employees whose DOJ is after the period end are excluded; an
 * ambiguous / unparseable DOJ keeps the employee in with DOJ_WARN set (DOJ_AMBIGUOUS / DOJ_UNPARSEABLE warning).
 */
function engine_rosterFromMaster(rows, period) {
  var all = [], counts = {}, excluded = [], warnings = [], unknownCategory = [], unkSeen = {};
  var end = period ? periodEnd(period) : '';
  var start = period ? periodStart(period) : '';
  (rows || []).forEach(function (r) {
    var active = String(r.STATUS_AS_SOURCE || '').trim().toLowerCase() === 'active';
    var pop = engine_id_(r.PAYROLL_CATEGORY), id = engine_id_(r.EMP_ID);
    if (!id) return;
    if (!isKnownPopulation(pop)) {
      // a category that is not in PAYROLL_CATEGORY_CONFIG at all (typo, new category not configured yet) -> employee HOLD
      // UNKNOWN_CATEGORY; a configured but INACTIVE category is simply not paid
      if (start && !isConfiguredCategory(pop) && !unkSeen[id]) {
        var okRoster = active;
        if (!active) okRoster = leaverRosterDecision(masterLastWorkingDay_(r), start).include;
        if (okRoster && (!end || dojRosterDecision(r.DOJ_AS_SOURCE, end).include)) {
          unkSeen[id] = true;
          unknownCategory.push({ EMP_ID: id, PAYROLL_CATEGORY: pop, EMPLOYEE_NAME: String(r.EMPLOYEE_NAME || '') });
        }
      }
      return;
    }
    var lv = { include: false, warn: '', lwd: '' };
    if (!active) { // leaver with a last working day on/after the period start (same rule as buildRoster)
      if (!start) return;
      lv = leaverRosterDecision(masterLastWorkingDay_(r), start);
      if (!lv.include) return;
    }
    var dec = end ? dojRosterDecision(r.DOJ_AS_SOURCE, end) : { include: true, warn: '' };
    if (!dec.include) { if (excluded.indexOf(id) < 0) excluded.push(id); return; }
    counts[id] = (counts[id] || 0) + 1;
    if (dec.warn) warnings.push(id);
    var doj = '';
    if (typeof parseDoj === 'function') { try { doj = parseDoj(r.DOJ_AS_SOURCE) || ''; } catch (e) { doj = ''; } }
    var entry = { EMP_ID: id, PAYROLL_CATEGORY: pop, SITE: siteForPopulation(pop), EMPLOYEE_NAME: String(r.EMPLOYEE_NAME || ''),
      DEPARTMENT: String(r.DEPARTMENT || '').trim(), DESIGNATION: String(r.DESIGNATION || '').trim(), DOJ: doj,
      DOJ_WARN: dec.warn };
    if (!active) { entry.LEAVER = true; entry.LWD = lv.lwd; entry.LWD_WARN = lv.warn; }
    all.push(entry);
  });
  return { all: all, duplicateIds: Object.keys(counts).filter(function (k) { return counts[k] > 1; }),
    allActiveIds: Object.keys(counts), joinersExcluded: excluded, dojWarnings: warnings, unknownCategory: unknownCategory };
}

/**
 * Joins everything into calcEmployee ctx objects (field names as 30_Calc.gs reads them).
 * args = {period, population, workingDays, employees[{EMP_ID,EMPLOYEE_NAME,DEPARTMENT,DESIGNATION}],
 *   attendanceByEmp, salaryByEmp, rateByEmp, otByEmp, canteenByEmp, societyByEmp, advanceByEmp, efficiencyByEmp,
 *   adjustmentRows, cfg, ptExemptSet, efficiencyConfig}
 */
function buildEngineContexts(args) {
  var pop = args.population, period = args.period;
  var method = args.method || (typeof categoryMethod === 'function' ? categoryMethod(pop) : '') || pop;
  var num = function (map, id) { var v = map ? map[id] : undefined; return v === undefined || v === null || v === '' ? 0 : v; };
  return (args.employees || []).map(function (e) {
    var id = engine_id_(e.EMP_ID);
    var attRow = (args.attendanceByEmp || {})[id];
    var att = {};
    if (attRow) ENGINE_ATT_FIELDS.forEach(function (k) { att[k] = attRow[k]; });
    var ctx = {
      period: period,
      population: pop,
      method: method,
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
    if (method === 'STAFF' || method === 'PERMANENT_WORKER') ctx.salary = (args.salaryByEmp || {})[id] || null;
    else ctx.rate = (args.rateByEmp || {})[id] || null;
    if (method === 'PERMANENT_WORKER') {
      var pct = args.efficiencyByEmp ? args.efficiencyByEmp[id] : undefined;
      var override = null;
      // real efficiencyByEmp (20_Feeds.gs) returns {pct, physicalDaysOverride, source}; calcWorker wants the number
      if (pct !== null && typeof pct === 'object') { override = pct.physicalDaysOverride; pct = pct.pct; }
      ctx.efficiencyPct = pct === undefined ? null : pct;
      ctx.efficiencyConfig = args.efficiencyConfig || [];
      // PHYSICAL_PRESENT_DAYS (VDA basis): HR's value, else the efficiency-form override, else PRESENT_DAYS
      // (the August VDA used the Present column). Never a blocker.
      if (attRow && (att.PHYSICAL_PRESENT_DAYS === '' || att.PHYSICAL_PRESENT_DAYS == null)) {
        if (override !== null && override !== undefined && override !== '' && isFinite(Number(override))) {
          att.PHYSICAL_PRESENT_DAYS = Number(override);
          ctx.physicalDaysSource = 'EFFICIENCY_OVERRIDE';
        } else if (att.PRESENT_DAYS !== '' && att.PRESENT_DAYS != null) {
          att.PHYSICAL_PRESENT_DAYS = att.PRESENT_DAYS;
          ctx.physicalDaysSource = 'PRESENT_DAYS';
        }
      }
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

/** Like engine_call_ but returns dflt when the (optional) reader is not loaded. */
function engine_callOpt_(name, args, dflt) {
  var fn = (typeof globalThis !== 'undefined' ? globalThis : this)[name];
  return typeof fn === 'function' ? fn.apply(null, args) : dflt;
}

/** Everything derived from the raw sheet bundle for one population. */
function engine_derive_(src, pop) {
  var period = src.period;
  var method = categoryMethod(pop) || pop;
  var roster = src.roster.all.filter(function (e) { return e.PAYROLL_CATEGORY === pop; });
  var seen = {}, employees = [];
  roster.forEach(function (e) { if (!seen[e.EMP_ID]) { seen[e.EMP_ID] = true; employees.push(e); } });
  var workerIds = method === 'PERMANENT_WORKER' ? employees.map(function (e) { return e.EMP_ID; }) : [];
  var attendanceRows = src.attendance.filter(function (r) {
    return engine_id_(r.PAYROLL_CATEGORY) === pop || seen[engine_id_(r.EMP_ID)];
  });
  var attendanceByEmp = {};
  attendanceRows.forEach(function (r) { var id = engine_id_(r.EMP_ID); if (!attendanceByEmp[id]) attendanceByEmp[id] = r; });
  var attCount = {};
  attendanceRows.forEach(function (r) { var id = engine_id_(r.EMP_ID); attCount[id] = (attCount[id] || 0) + 1; });
  var exBy = function (list, valueKey) {
    var m = {};
    (list || []).forEach(function (x) {
      var id = engine_id_(x.EMP_ID);
      if (!id || !seen[id]) return;
      (m[id] = m[id] || []).push(x[valueKey || 'reason'] || '');
    });
    return m;
  };
  var otExRows = (src.otRows || []).filter(function (r) {
    return engine_id_(r.ELIGIBILITY).toUpperCase() === 'EXCEPTION' && normalizePeriod(r.PAYROLL_MONTH) === period;
  }).map(function (r) { return { EMP_ID: r.EMP_ID, reason: engine_id_(r.EXCEPTION_REASON) }; });
  var d = {
    attendanceCount: attCount,
    otExByEmp: exBy(otExRows),
    canteenExByEmp: exBy(engine_callOpt_('canteenExceptions', [src.canteenRows || [], period], [])),
    efficiencyExByEmp: method === 'PERMANENT_WORKER'
      ? exBy(engine_callOpt_('efficiencyExceptions', [src.efficiencyRows || [], period], [])) : {},
    leaveExByEmp: exBy(engine_callOpt_('leaveExceptions', [src.leaveRows || [], period], [])),
    roster: roster, employees: employees, attendanceRows: attendanceRows, attendanceByEmp: attendanceByEmp,
    otByEmp: engine_call_('sumOtHours', [src.otRows, period]),
    canteenByEmp: engine_call_('canteenByEmp', [src.canteenRows, period]),
    societyByEmp: engine_call_('societyByEmp', [src.societyRows, period]),
    advanceByEmp: engine_call_('advanceByEmp', [src.advanceRows, period]),
    efficiencyByEmp: method === 'PERMANENT_WORKER' ? engine_call_('efficiencyByEmp', [src.efficiencyRows, period, workerIds]) : {},
    statutory: resolveStatutory(src.statutoryRows, period, method),
    salaryByEmp: engine_pickSalary(src.salaryRows, period),
    rateByEmp: engine_pickRate(src.rateRows, period),
    ptExemptSet: engine_ptExemptSet(src.ptExemptRows, period),
    feedIssues: engine_callOpt_('advanceIssues', [src.advanceRows || [], period], [])
      .concat(engine_callOpt_('societyIssues', [src.societyRows || [], period], [])),
    dailyMissingByEmp: null
  };
  d.method = method;
  d.disputes = [];
  if (src.dailyRows && src.dailyRows.length) {
    var missing = {};
    // employees paid from the monthly register are checked by the daily-vs-register comparison instead
    var dailyRoster = roster.filter(function (e) { return !isRegisterRow_(attendanceByEmp[e.EMP_ID]); });
    aggregateDaily(src.dailyRows, period, dailyRoster, src.holidayRows || [], '').forEach(function (rec) {
      if (rec.missingDates.length) missing[rec.EMP_ID] = rec.missingDates;
    });
    d.dailyMissingByEmp = missing;
    d.disputes = engine_callOpt_('attendanceDisputesLive', [src, pop, roster, attendanceByEmp], []);
  }
  return d;
}

function engine_periodCatRow_(src, pop) {
  var rows = src.periodCat || [];
  for (var i = 0; i < rows.length; i++) if (engine_id_(rows[i].PAYROLL_CATEGORY) === pop) return rows[i];
  return null;
}

/** True when the category row comes from PAYROLL_CATEGORY_CONFIG and its APPROVED_BY is blank (owner sign-off missing). */
function engine_categoryUnapproved_(pop) {
  var e = categoryEntry(pop);
  return !!e && e.fromSheet === true && !e.approvedBy;
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
    period: src.period, population: pop, method: d.method, roster: d.roster,
    categoryUnapproved: engine_categoryUnapproved_(pop), allActiveIds: src.roster.allActiveIds,
    masterDuplicateIds: src.roster.duplicateIds, periodCategoryRow: engine_periodCatRow_(src, pop),
    attendanceRows: src.attendance, dailyMissingByEmp: d.dailyMissingByEmp, salaryByEmp: d.salaryByEmp,
    rateByEmp: d.rateByEmp, feedStatus: src.feedStatus, otExceptionRows: otEx, otHoursByEmp: d.otByEmp,
    statutoryResolved: d.statutory, efficiencyConfigRows: src.efficiencyConfig, calcResults: calcResults || null,
    pendingOtCount: engine_pendingOt_(src, pop),
    canteenExceptions: engine_callOpt_('canteenExceptions', [src.canteenRows || [], src.period], []),
    efficiencyExceptions: engine_callOpt_('efficiencyExceptions', [src.efficiencyRows || [], src.period], []),
    leaveExceptions: engine_callOpt_('leaveExceptions', [src.leaveRows || [], src.period], []),
    leaveSyncError: src.leaveSyncError || '',
    attendanceDisputes: d.disputes
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
  var dupSet = {}, dojWarn = {};
  (src.roster.duplicateIds || []).forEach(function (x) { dupSet[x] = true; });
  d.employees.forEach(function (e) { if (e.DOJ_WARN) dojWarn[e.EMP_ID] = e.DOJ_WARN; });
  var ctxs = buildEngineContexts({
    period: src.period, population: pop, method: d.method, workingDays: pc ? pc.WORKING_DAYS : '', employees: d.employees,
    attendanceByEmp: d.attendanceByEmp, salaryByEmp: d.salaryByEmp, rateByEmp: d.rateByEmp, otByEmp: d.otByEmp,
    canteenByEmp: d.canteenByEmp, societyByEmp: d.societyByEmp, advanceByEmp: d.advanceByEmp,
    efficiencyByEmp: d.efficiencyByEmp, adjustmentRows: src.adjustmentRows, cfg: d.statutory.values,
    ptExemptSet: d.ptExemptSet, efficiencyConfig: src.efficiencyConfig
  });
  var rows = [], exceptions = [], results = [], held = [];
  var leaverBy = {};
  d.employees.forEach(function (e) { if (e.LEAVER) leaverBy[e.EMP_ID] = e; });
  var disputeBy = {};
  (d.disputes || []).forEach(function (x) { disputeBy[engine_id_(x.EMP_ID)] = x; });
  // pay-structure approval: once part of the population is approved, an unapproved row (new joiner / salary revision)
  // holds only that employee; when NOTHING is approved the readiness check blocks the population instead
  var salaryBased = rdy_salaryBased_(d.method);
  var payGate = rdy_payGate_(d.employees.map(function (e) { return e.EMP_ID; }), salaryBased ? d.salaryByEmp : d.rateByEmp, salaryBased);
  var payHold = {};
  if (payGate.mode === 'HOLD') payGate.unapproved.forEach(function (x) { payHold[x] = true; });
  ctxs.forEach(function (ctx) {
    var res = calcEmployee(ctx);
    var id = ctx.emp.EMP_ID;
    var extra = [];
    var hold = function (code, message) { extra.push({ severity: 'HOLD', code: code, message: message }); };
    if (!ctx.hasAttendance) hold('MISSING_ATTENDANCE', 'No INPUT_ATTENDANCE row');
    else {
      if ((d.attendanceCount[id] || 0) > 1) hold('DUPLICATE_ATTENDANCE_ROWS', 'More than one INPUT_ATTENDANCE row for the period');
      attendanceRowProblems(d.attendanceByEmp[id], pop, src.period).forEach(function (p) { hold(p.code, p.message); });
    }
    if (payHold[id]) hold('SALARY_NOT_APPROVED', (salaryBased ? 'SALARY_STRUCTURE row not HR-approved (HR_APPROVED_BY blank)' : 'PAYROLL_RATE_PROFILE row not approved (VERSION_STATE)') + ' - HR OS > Payroll > Approve salary structure');
    if (dupSet[id]) hold('DUPLICATE_MASTER_ID', 'EMP_ID appears more than once among active master rows');
    if (d.dailyMissingByEmp && d.dailyMissingByEmp[id] && d.dailyMissingByEmp[id].length) {
      hold('DAILY_ATTENDANCE_MISSING', 'Daily attendance missing for ' + d.dailyMissingByEmp[id].length + ' date(s), from ' + d.dailyMissingByEmp[id][0]);
    }
    if (d.otExByEmp[id]) hold('OT_EXCEPTION', 'OT exception row(s): ' + d.otExByEmp[id].join(' / '));
    if (d.canteenExByEmp[id]) hold('CANTEEN_EXCEPTION', 'Latest canteen response is invalid: ' + d.canteenExByEmp[id].join(' / '));
    if (d.efficiencyExByEmp[id]) hold('EFFICIENCY_EXCEPTION', 'Latest efficiency response is invalid: ' + d.efficiencyExByEmp[id].join(' / '));
    if (d.leaveExByEmp[id]) hold('LEAVE_EXCEPTION', 'Leave exception row(s): ' + d.leaveExByEmp[id].join(' / '));
    if (disputeBy[id]) hold('ATTENDANCE_DISPUTE', 'Daily vs register attendance dispute: ' + (disputeBy[id].message || disputeBy[id].stage));
    (d.feedIssues || []).forEach(function (i) {
      if (i.EMP_ID === id) extra.push({ severity: i.severity, code: i.code, message: i.message });
    });
    if (dojWarn[id]) {
      extra.push({ severity: 'WARN', code: 'DOJ_' + dojWarn[id],
        message: 'DOJ_AS_SOURCE could not be read unambiguously against the period end; employee included' });
    }
    if (leaverBy[id]) {
      extra.push({ severity: 'WARN', code: 'LEAVER_IN_PERIOD', message: 'Employee left on ' + (leaverBy[id].LWD || '?') +
        (leaverBy[id].LWD_WARN ? ' (last working day ambiguous)' : '') });
    }
    ((ctx.adjustments && ctx.adjustments.exceptions) || []).forEach(function (e) { extra.push(e); });
    // employee-level BLOCKERs become HOLD; only GLOBAL_BLOCKER_CODES keep blocking the whole population
    var all = res.exceptions.concat(extra).map(function (e) {
      return e.severity === 'BLOCKER' && GLOBAL_BLOCKER_CODES.indexOf(e.code) < 0
        ? { severity: 'HOLD', code: e.code, message: e.message } : e;
    });
    var row = res.row;
    var isHeld = all.some(function (e) { return e.severity === 'HOLD'; });
    var isBlocked = all.some(function (e) { return e.severity === 'BLOCKER'; });
    if (isHeld || isBlocked) row.NET_PAY = null;
    var seen = {}, codes = isHeld ? ['HOLD'] : [];
    if (isHeld) seen.HOLD = true;
    all.forEach(function (e) { if (!seen[e.code]) { seen[e.code] = true; codes.push(e.code); } });
    row.FLAGS = codes.join(';');
    row.RUN_ID = runId;
    row.CALCULATED_AT = calcAt;
    rows.push(row);
    results.push({ row: row, exceptions: all, held: isHeld });
    if (isHeld) {
      held.push({ EMP_ID: id, codes: all.filter(function (e) { return e.severity === 'HOLD'; }).map(function (e) { return e.code; }) });
    }
    all.forEach(function (e) {
      exceptions.push({ RUN_ID: runId, PERIOD: src.period, POPULATION: pop, EMP_ID: id, SEVERITY: e.severity,
        CODE: e.code, MESSAGE: e.message });
    });
  });
  return { rows: rows, exceptions: exceptions, results: results, ctxs: ctxs, held: held };
}

/** True when a draft / locked row belongs to a held employee (FLAGS contains the token HOLD). */
function engine_isHeldRow_(row) {
  return String(row && row.FLAGS != null ? row.FLAGS : '').split(';').indexOf('HOLD') >= 0;
}

/** Rows that flow into NET totals, the approval hash and the lock (held employees excluded). */
function engine_payableRows_(rows) {
  return (rows || []).filter(function (r) { return !engine_isHeldRow_(r); });
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
  var ctl = getSheet(TABS.PAYROLL_CONTROL) ? readControlMap() : {};
  return {
    period: period,
    roster: engine_rosterFromMaster(readObjects(TABS.EMPLOYEE_MASTER), period),
    periodCat: engine_inPeriod_(engine_readOpt_(TABS.PAYROLL_PERIOD_CATEGORY), 'PAYROLL_MONTH', period),
    attendance: engine_inPeriod_(engine_readOpt_(TABS.INPUT_ATTENDANCE), 'PAYROLL_MONTH', period),
    dailyRows: daily,
    holidayRows: engine_readOpt_(TABS.HOLIDAY_CALENDAR),
    salaryRows: engine_readOpt_(TABS.SALARY_STRUCTURE),
    rateRows: engine_readOpt_(TABS.PAYROLL_RATE_PROFILE),
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
    otPendingRaw: ctl['OT_PENDING_' + period] === undefined ? '' : ctl['OT_PENDING_' + period],
    leaveRows: engine_readOpt_(TABS.INPUT_LEAVE),
    comparisonRows: engine_inPeriod_(engine_readOpt_(TABS.ATTENDANCE_COMPARISON), 'PERIOD', period),
    leaveSyncError: String(ctl['LEAVE_SYNC_ERROR_' + period] || ''),
    ownerEmail: String(ctl.OWNER_APPROVER_EMAIL || '').trim()
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
  var pops = population ? [population] : populationList();
  pops.forEach(function (p) { if (!isKnownPopulation(p)) throw new Error('Unknown population "' + p + '"'); });
  // the leave source is a separate spreadsheet: re-read it now; a failure is recorded (LEAVE feed OPEN + population BLOCKER)
  var leaveSync = engine_callOpt_('leaveAutoSync_', [period], null);
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
    // legacy: the sheet note tells HR to set STATUS = APPROVED once the working days are entered and approved;
    // that means "working days approved" and is treated exactly like PENDING (the legacy APPROVED_BY / APPROVED_AT
    // columns keep the record; they are never overwritten by the payroll approvals)
    if (st === LEGACY_WORKING_DAYS_APPROVED) st = PERIOD_STATUS.PENDING;
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
    if (src.leaveSyncError) {
      allEx.push({ RUN_ID: runId, PERIOD: period, POPULATION: pop, EMP_ID: '', SEVERITY: 'BLOCKER',
        CODE: 'LEAVE_SOURCE_UNREACHABLE', MESSAGE: src.leaveSyncError });
    }
    recon.push(engine_recon(period, pop, engine_payableRows_(c.rows), engine_prevNet_(src, pop), runId));
  });

  var inActive = function (o) { return normalizePeriod(o.PERIOD) === period && active.indexOf(engine_id_(o.POPULATION)) >= 0; };
  // supplementary (top-up) rows share PAYROLL_DRAFT: a normal run never removes them
  var inActiveNormal = function (o) { return inActive(o) && engine_runType_(o.RUN_ID) === 'NORMAL'; };
  engine_replaceRows_(TABS.PAYROLL_DRAFT, OUTPUT_COLUMNS, allRows, inActiveNormal);
  active.forEach(function (pop) {
    engine_replaceRows_(engine_popTab_(pop), OUTPUT_COLUMNS, byPop[pop].rows,
      function (o) { return normalizePeriod(o.PERIOD) === period; });
  });
  // employees whose category is not configured: HOLD exception rows (no draft row, no population involved)
  var unknownCat = (src.roster.unknownCategory || []);
  var unkEx = unknownCat.map(function (u) {
    return { RUN_ID: runId, PERIOD: period, POPULATION: u.PAYROLL_CATEGORY || RDY_UNASSIGNED, EMP_ID: u.EMP_ID, SEVERITY: 'HOLD',
      CODE: 'UNKNOWN_CATEGORY', MESSAGE: 'PAYROLL_CATEGORY "' + u.PAYROLL_CATEGORY + '" is not in PAYROLL_CATEGORY_CONFIG' };
  });
  if (!population) allEx = allEx.concat(unkEx);
  var inActiveEx = function (o) {
    return inActive(o) || (!population && normalizePeriod(o.PERIOD) === period && engine_id_(o.CODE) === 'UNKNOWN_CATEGORY');
  };
  engine_replaceRows_(TABS.PAYROLL_EXCEPTIONS, ENGINE_EXCEPTION_COLUMNS, allEx, inActiveEx);
  engine_replaceRows_(TABS.PAYROLL_RECON, ENGINE_RECON_COLUMNS, recon, inActive);

  active.forEach(function (pop) {
    var c = byPop[pop];
    var hash = hashRows(engine_payableRows_(c.rows), OUTPUT_COLUMNS, engine_sha256Hex_);
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
    var blockers = c.exceptions.filter(function (e) { return e.SEVERITY === 'BLOCKER'; }).length +
      (src.leaveSyncError ? 1 : 0);
    var holds = c.exceptions.filter(function (e) { return e.SEVERITY === 'HOLD'; }).length;
    var warns = c.exceptions.length - blockers - holds + (src.leaveSyncError ? 1 : 0);
    var s = { population: pop, headcount: c.rows.length, payable: engine_payableRows_(c.rows).length,
      held: c.held.map(function (h) { return h.EMP_ID; }), blockers: blockers, holds: holds, warns: warns,
      totalNet: engine_sum_(engine_payableRows_(c.rows), 'NET_PAY'), hash: hash, statusFrom: prevStatus[pop],
      statusTo: PERIOD_STATUS.DRAFT, statusUpdated: !!pc };
    summaries.push(s);
    audit('CALC_DRAFT', period, pop, { runId: runId, headcount: s.headcount, payable: s.payable, held: s.held,
      blockers: blockers, holds: holds, warns: warns, hash: hash });
  });

  var readiness = checkReadiness(period, population, { sources: src, calcResultsByPop: calcByPop });
  return { period: period, runId: runId, populations: summaries, skippedLocked: skippedLocked, leaveSync: leaveSync,
    unknownCategory: population ? [] : unknownCat.map(function (u) { return u.EMP_ID; }),
    readiness: { blocked: readiness.blocked, hold: readiness.hold, warn: readiness.warn, ready: readiness.ready } };
}

// ===== 33_Comparison.gs =====
/**
 * 33_Comparison.gs - daily forms vs monthly register (October onward, only when daily data exists for the period)
 * and the dispute flow (DESIGN section 2, "Daily vs register comparison and disputes").
 *  - buildAttendanceComparison(period) writes ATTENDANCE_COMPARISON: DAILY_PRESENT (P + 0.5 x HD, OD excluded to match
 *    the physical figure) against REGISTER_PRESENT (the register's PHYSICAL days). |DIFF| < 0.01 = MATCH, else DISPUTE.
 *  - A DISPUTE holds that employee (ATTENDANCE_DISPUTE, employee-level HOLD) until HR filled HR_DECIDED_DAYS +
 *    HR_REASON and submitted them (runner = HR_APPROVER_EMAIL) AND the owner approved (runner = OWNER_APPROVER_EMAIL).
 *    The owner's approval writes the decided days into the PENDING INPUT_ATTENDANCE row (HR_OVERRIDE=Y + audit).
 *    A REJECTED decision keeps the employee on hold.
 * The engine and readiness compute the comparison LIVE (attendanceDisputesLive) and only merge the stored HR / owner
 * columns, so a stale sheet can never release a hold.
 * Pure: attendanceComparisonRows, attendanceDisputeStages, disputeHrPlan. Sheet-touching: the rest.
 */
var ATT_COMPARISON_COLUMNS = ['PERIOD', 'EMP_ID', 'NAME', 'POPULATION', 'DAILY_PRESENT', 'REGISTER_PRESENT', 'DIFF', 'STATUS',
  'HR_DECIDED_DAYS', 'HR_REASON', 'HR_BY', 'HR_AT', 'OWNER_DECISION', 'OWNER_BY', 'OWNER_AT', 'HR_STAMPED_DAYS'];
var ATT_COMPARISON_KEEP = ['HR_DECIDED_DAYS', 'HR_REASON', 'HR_BY', 'HR_AT', 'OWNER_DECISION', 'OWNER_BY', 'OWNER_AT', 'HR_STAMPED_DAYS'];
var ATT_COMPARISON_TOLERANCE = 0.01;

// ================================================================ pure

function cmp_str_(v) { return v == null ? '' : String(v).trim(); }
function cmp_r2_(x) { return Math.round(x * 100) / 100; }

/** The register's physical days of an INPUT_ATTENDANCE row: the pre-override snapshot when present, else the column. */
function comparisonRegisterPhysical_(attRow) {
  var v = NaN;
  try {
    var snap = attRow.GENERATED_VALUES_JSON ? JSON.parse(attRow.GENERATED_VALUES_JSON) : null;
    if (snap && snap.PHYSICAL_PRESENT_DAYS !== undefined && snap.PHYSICAL_PRESENT_DAYS !== '') v = Number(snap.PHYSICAL_PRESENT_DAYS);
  } catch (e) { v = NaN; }
  if (isNaN(v)) v = attNum_(attRow.PHYSICAL_PRESENT_DAYS);
  return v;
}

/**
 * Pure. One comparison row per roster employee whose INPUT_ATTENDANCE row comes from the register.
 * @param {Array} roster [{EMP_ID, PAYROLL_CATEGORY, DOJ?, NAME | EMPLOYEE_NAME}]
 * @param {Array} attendanceRows INPUT_ATTENDANCE row objects of the period
 * @param {Array} dailyRows ATTENDANCE_DAILY rows of the period
 * @param {Array} storedRows existing ATTENDANCE_COMPARISON rows (HR / owner columns are carried over per EMP_ID)
 */
function attendanceComparisonRows(period, roster, attendanceRows, dailyRows, storedRows) {
  var daily = {};
  aggregateDaily(dailyRows || [], period, roster || [], [], '').forEach(function (r) { daily[r.EMP_ID] = r; });
  var att = {};
  (attendanceRows || []).forEach(function (r) {
    var id = cmp_str_(r.EMP_ID);
    if (normalizePeriod(r.PAYROLL_MONTH) === period && isRegisterRow_(r) && !(id in att)) att[id] = r;
  });
  var stored = {};
  (storedRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) === period) stored[cmp_str_(r.EMP_ID)] = r;
  });
  var out = [];
  (roster || []).forEach(function (e) {
    var id = cmp_str_(e.EMP_ID), a = att[id];
    if (!a) return;
    var reg = comparisonRegisterPhysical_(a);
    var dRec = daily[id];
    var dp = dRec ? dRec.PHYSICAL_PRESENT_DAYS : 0;
    var diff = cmp_r2_(reg - dp);
    var row = { PERIOD: period, EMP_ID: id, NAME: e.NAME !== undefined ? e.NAME : (e.EMPLOYEE_NAME || ''),
      POPULATION: e.PAYROLL_CATEGORY, DAILY_PRESENT: cmp_r2_(dp), REGISTER_PRESENT: isNaN(reg) ? '' : cmp_r2_(reg),
      DIFF: isNaN(diff) ? '' : diff, STATUS: (!isNaN(diff) && Math.abs(diff) < ATT_COMPARISON_TOLERANCE) ? 'MATCH' : 'DISPUTE' };
    var old = stored[id] || {};
    ATT_COMPARISON_KEEP.forEach(function (k) { row[k] = old[k] === undefined ? '' : old[k]; });
    out.push(row);
  });
  return out;
}

/** True when HR's decision on a comparison row is complete and stamped for exactly the days now in HR_DECIDED_DAYS. */
function disputeHrStamped_(row, dim) {
  var days = row.HR_DECIDED_DAYS === '' || row.HR_DECIDED_DAYS == null ? NaN : Number(row.HR_DECIDED_DAYS);
  if (isNaN(days) || days < 0 || days > dim) return false;
  if (!cmp_str_(row.HR_REASON) || !cmp_str_(row.HR_BY)) return false;
  var st = row.HR_STAMPED_DAYS === '' || row.HR_STAMPED_DAYS == null ? NaN : Number(row.HR_STAMPED_DAYS);
  return !isNaN(st) && Math.abs(st - days) < 1e-9;
}

/**
 * Pure. Open disputes among live comparison rows: [{EMP_ID, stage, message}]. A DISPUTE is resolved only when HR's stamped
 * decision exists, the owner APPROVED it (OWNER_BY = the configured owner) and the decided days are really in the
 * employee's INPUT_ATTENDANCE row (HR_OVERRIDE=Y, reason ATTENDANCE_DISPUTE...). Stages: AWAITING_HR, AWAITING_OWNER,
 * OWNER_REJECTED, OWNER_STAMP_INVALID, DECISION_NOT_APPLIED.
 */
function attendanceDisputeStages(liveRows, attendanceByEmp, ownerEmail, period) {
  var dim = daysInMonth(period), out = [];
  (liveRows || []).forEach(function (r) {
    if (cmp_str_(r.STATUS).toUpperCase() !== 'DISPUTE') return;
    var id = cmp_str_(r.EMP_ID);
    var hold = function (stage, message) { out.push({ EMP_ID: id, stage: stage, message: message }); };
    var diffTxt = 'daily ' + r.DAILY_PRESENT + ' vs register ' + r.REGISTER_PRESENT;
    if (!disputeHrStamped_(r, dim)) return hold('AWAITING_HR', diffTxt + ': waiting for HR decision');
    var od = cmp_str_(r.OWNER_DECISION).toUpperCase();
    if (od === 'REJECTED') return hold('OWNER_REJECTED', diffTxt + ': owner rejected the decision');
    if (od !== 'APPROVED') return hold('AWAITING_OWNER', diffTxt + ': waiting for owner approval');
    if (!cmp_str_(ownerEmail) || cmp_str_(r.OWNER_BY).toLowerCase() !== cmp_str_(ownerEmail).toLowerCase()) {
      return hold('OWNER_STAMP_INVALID', diffTxt + ': OWNER_BY is not the configured owner (use the owner menu action)');
    }
    var a = (attendanceByEmp || {})[id];
    var applied = a && Math.abs(attNum_(a.PHYSICAL_PRESENT_DAYS) - Number(r.HR_DECIDED_DAYS)) < 0.01 &&
      cmp_str_(a.HR_OVERRIDE).toUpperCase() === 'Y' && /^ATTENDANCE_DISPUTE/.test(cmp_str_(a.OVERRIDE_REASON));
    if (!applied) return hold('DECISION_NOT_APPLIED', diffTxt + ': decided days are not in INPUT_ATTENDANCE (owner approval must be re-run)');
  });
  return out;
}

/**
 * Engine hook (cross-file, called through engine_callOpt_): live disputes of one population.
 * src = engine sources; roster = engine roster of the population; attendanceByEmp = {EMP_ID: INPUT_ATTENDANCE row}.
 */
function attendanceDisputesLive(src, pop, roster, attendanceByEmp) {
  var rows = attendanceComparisonRows(src.period, roster, Object.keys(attendanceByEmp || {}).map(function (k) { return attendanceByEmp[k]; }),
    src.dailyRows || [], src.comparisonRows || []);
  return attendanceDisputeStages(rows, attendanceByEmp, src.ownerEmail, src.period);
}

/**
 * Pure. What HR's submit does with each DISPUTE row: stamp (complete + changed), unchanged (already stamped for these
 * days), awaiting (nothing entered yet), invalid (partial / out of range). A changed decision also resets an earlier
 * owner decision (the owner approved other days).
 */
function disputeHrPlan(storedRows, period) {
  var dim = daysInMonth(period), plan = { stamp: [], unchanged: [], awaiting: [], invalid: [] };
  (storedRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) !== period || cmp_str_(r.STATUS).toUpperCase() !== 'DISPUTE') return;
    var id = cmp_str_(r.EMP_ID);
    var raw = r.HR_DECIDED_DAYS, reason = cmp_str_(r.HR_REASON);
    var blankDays = raw === '' || raw == null;
    if (blankDays && !reason) { plan.awaiting.push(id); return; }
    var days = blankDays ? NaN : Number(raw);
    if (isNaN(days) || days < 0 || days > dim) { plan.invalid.push(id + ': HR_DECIDED_DAYS must be 0..' + dim); return; }
    if (!reason) { plan.invalid.push(id + ': HR_REASON is required'); return; }
    if (disputeHrStamped_(r, dim)) { plan.unchanged.push(id); return; }
    plan.stamp.push({ row: r, empId: id, days: days, resetsOwner: !!cmp_str_(r.OWNER_DECISION) });
  });
  return plan;
}

// ================================================================ sheet-touching

function cmp_dailyRows_(period) {
  return (getSheet(TABS.ATTENDANCE_DAILY) ? readObjects(TABS.ATTENDANCE_DAILY) : []).filter(function (r) {
    return toIsoDate(r.DATE).slice(0, 7) === period;
  });
}

function cmp_storedRows_(period) {
  return (getSheet(TABS.ATTENDANCE_COMPARISON) ? readObjects(TABS.ATTENDANCE_COMPARISON) : []).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period;
  });
}

/**
 * Builds / refreshes ATTENDANCE_COMPARISON for the period (only when ATTENDANCE_DAILY has rows for it). HR / owner
 * columns of existing EMP_IDs are kept; LOCKED populations are never touched.
 */
function buildAttendanceComparison(period) {
  guardPeriod_(period);
  var daily = cmp_dailyRows_(period);
  if (!daily.length) throw new Error('No ATTENDANCE_DAILY rows for ' + period + ' - the daily-vs-register comparison only applies when daily data exists');
  var pp = periodPopulationsOpen_(period);
  var roster = buildRoster(period);
  var att = readObjects(TABS.INPUT_ATTENDANCE).filter(function (r) { return normalizePeriod(r.PAYROLL_MONTH) === period; });
  var rows = attendanceComparisonRows(period, roster, att, daily, cmp_storedRows_(period)).filter(function (r) {
    return pp.locked.indexOf(r.POPULATION) < 0;
  });
  engine_replaceRows_(TABS.ATTENDANCE_COMPARISON, ATT_COMPARISON_COLUMNS, rows, function (o) {
    return normalizePeriod(o.PERIOD) === period && pp.locked.indexOf(cmp_str_(o.POPULATION)) < 0;
  });
  var res = { period: period, compared: rows.length,
    match: rows.filter(function (r) { return r.STATUS === 'MATCH'; }).length,
    dispute: rows.filter(function (r) { return r.STATUS === 'DISPUTE'; }).length, lockedPopulations: pp.locked };
  audit('ATT_COMPARISON', period, '', res);
  return res;
}

/**
 * HR submits the dispute decisions typed in ATTENDANCE_COMPARISON (HR_DECIDED_DAYS + HR_REASON): stamps HR_BY / HR_AT.
 * Runner must be HR_APPROVER_EMAIL.
 */
function submitDisputeDecisions(period) {
  guardPeriod_(period);
  var user = approval_userEmail_();
  var hr = getControl('HR_APPROVER_EMAIL', '');
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(hr) || approval_email_(user) !== approval_email_(hr)) {
    audit('DISPUTE_HR_SUBMIT', period, '', { result: 'REFUSED', reason: 'USER_NOT_HR_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_HR_APPROVER' };
  }
  approval_requireStampColumns_(TABS.ATTENDANCE_COMPARISON, ['HR_BY', 'HR_AT', 'HR_STAMPED_DAYS', 'OWNER_DECISION']);
  var plan = disputeHrPlan(cmp_storedRows_(period), period), now = nowIso_();
  var pp = periodPopulationsOpen_(period);
  var updates = [], skippedLocked = [];
  plan.stamp.forEach(function (s) {
    if (pp.locked.indexOf(cmp_str_(s.row.POPULATION)) >= 0) { skippedLocked.push(s.empId); return; }
    var v = { HR_BY: user, HR_AT: now, HR_STAMPED_DAYS: s.days };
    if (s.resetsOwner) { v.OWNER_DECISION = ''; v.OWNER_BY = ''; v.OWNER_AT = ''; }
    updates.push({ row: s.row._row, values: v });
  });
  updateRows(TABS.ATTENDANCE_COMPARISON, updates);
  var res = { ok: true, reason: 'OK', period: period, stamped: updates.length, unchanged: plan.unchanged.length,
    awaitingHrInput: plan.awaiting, invalid: plan.invalid, ownerDecisionsReset: plan.stamp.filter(function (s) { return s.resetsOwner; })
      .map(function (s) { return s.empId; }), skippedLocked: skippedLocked };
  audit('DISPUTE_HR_SUBMIT', period, '', { result: 'STAMPED', user: user, stamped: res.stamped, invalid: res.invalid.length,
    ownerDecisionsReset: res.ownerDecisionsReset });
  return res;
}

/**
 * Owner decision on the HR-stamped disputes. Runner must be OWNER_APPROVER_EMAIL.
 * APPROVED: the decided days replace PRESENT_DAYS / PHYSICAL_PRESENT_DAYS of that employee's PENDING register row in
 * INPUT_ATTENDANCE (HR_OVERRIDE=Y, OVERRIDE_REASON=ATTENDANCE_DISPUTE ...); a row that is already APPROVED, locked or not
 * from the register is reported and its decision is NOT stamped (fail closed). REJECTED: the employee stays on hold.
 * empIds (optional) limits the decision to those employees.
 */
function ownerDecideDisputes(period, decision, empIds) {
  guardPeriod_(period);
  decision = String(decision || 'APPROVED').trim().toUpperCase();
  if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new Error('Decision must be APPROVED or REJECTED');
  var user = approval_userEmail_();
  var owner = getOwnerApproverEmail();
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(owner) || approval_email_(user) !== approval_email_(owner)) {
    audit('DISPUTE_OWNER_DECISION', period, '', { result: 'REFUSED', reason: 'USER_NOT_OWNER_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_OWNER_APPROVER' };
  }
  approval_requireStampColumns_(TABS.ATTENDANCE_COMPARISON, ['OWNER_DECISION', 'OWNER_BY', 'OWNER_AT']);
  var want = null;
  if (empIds && empIds.length) { want = {}; empIds.forEach(function (x) { want[cmp_str_(x)] = true; }); }
  var dim = daysInMonth(period), pp = periodPopulationsOpen_(period), now = nowIso_();
  var res = { ok: true, reason: 'OK', period: period, decision: decision, decided: [], skipped: [] };
  var compUpdates = [], attUpdates = [];
  var ctx = decision === 'APPROVED' ? register_ctx_(period) : null;
  cmp_storedRows_(period).forEach(function (r) {
    if (cmp_str_(r.STATUS).toUpperCase() !== 'DISPUTE') return;
    var id = cmp_str_(r.EMP_ID);
    if (want && !want[id]) return;
    var skip = function (why) { res.skipped.push({ EMP_ID: id, reason: why }); };
    if (pp.locked.indexOf(cmp_str_(r.POPULATION)) >= 0) return skip('POPULATION_LOCKED');
    if (!disputeHrStamped_(r, dim)) return skip('HR_DECISION_MISSING_OR_NOT_SUBMITTED');
    var cur = cmp_str_(r.OWNER_DECISION).toUpperCase();
    if (cur === 'REJECTED' && decision === 'APPROVED') return skip('ALREADY_REJECTED_CLEAR_OWNER_DECISION_FIRST');
    if (cur && cur !== decision) return skip('ALREADY_DECIDED_' + cur);
    if (decision === 'APPROVED') {
      var emp = ctx.rosterMap[id], row = ctx.existing[id];
      if (!emp || !row || ctx.existing.__dups.indexOf(id) >= 0) return skip('NO_SINGLE_ATTENDANCE_ROW');
      if (!isRegisterRow_(row)) return skip('NOT_A_REGISTER_ROW');
      if (String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') {
        return skip('ATTENDANCE_ALREADY_APPROVED (set the INPUT_ATTENDANCE row back to PENDING, then approve again)');
      }
      var d = register_derive_(ctx, emp, Number(row.REGISTER_DAYS_PRESENT), String(row.REGISTER_INCLUDES_WO).trim().toUpperCase() === 'Y');
      if (!d.ok) return skip('REGISTER_ROW_INVALID');
      var eff = applyPhysicalOverride(d, Number(r.HR_DECIDED_DAYS), emp.PAYROLL_CATEGORY, period);
      var vals = {};
      ATT_NUM_FIELDS.forEach(function (k) { vals[k] = eff[k]; });
      vals.WORKED_DAYS = eff.WORKED_DAYS; vals.PAYABLE_DAYS = eff.WORKED_DAYS;
      vals.GENERATED_VALUES_JSON = registerValuesFromDerived(d, '', '').GENERATED_VALUES_JSON;
      vals.HR_OVERRIDE = 'Y';
      vals.OVERRIDE_REASON = 'ATTENDANCE_DISPUTE: ' + cmp_str_(r.HR_REASON) + ' (HR ' + cmp_str_(r.HR_BY) + ', owner ' + user + ')';
      attUpdates.push({ row: row._row, values: vals });
    }
    compUpdates.push({ row: r._row, values: { OWNER_DECISION: decision, OWNER_BY: user, OWNER_AT: now } });
    res.decided.push(id);
  });
  updateRows(TABS.INPUT_ATTENDANCE, attUpdates);
  updateRows(TABS.ATTENDANCE_COMPARISON, compUpdates);
  audit('DISPUTE_OWNER_DECISION', period, '', { result: decision, user: user, decided: res.decided,
    skipped: res.skipped.map(function (s) { return s.EMP_ID + ':' + s.reason; }) });
  return res;
}

function ownerApproveDisputes(period) { return ownerDecideDisputes(period, 'APPROVED'); }

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
  return { hash: hashRows(engine_payableRows_(calc.rows), OUTPUT_COLUMNS, engine_sha256Hex_), src: src, calc: calc };
}

function approval_pcRow_(period, population) {
  var rows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY);
  for (var i = 0; i < rows.length; i++) {
    if (normalizePeriod(rows[i].PAYROLL_MONTH) === period && String(rows[i].PAYROLL_CATEGORY).trim() === population) return rows[i];
  }
  throw new Error('No PAYROLL_PERIOD_CATEGORY row for ' + period + ' x ' + population);
}

/** Update the PAYROLL_PERIOD_CATEGORY row. Only the new HR_/ACCOUNTS_ columns are ever stamped: the legacy
 * APPROVED_BY / APPROVED_AT columns (working-days approval) are never overwritten. */
function approval_writePc_(pcRow, values) {
  var v = {};
  Object.keys(values).forEach(function (k) {
    if (k === 'APPROVED_BY' || k === 'APPROVED_AT') throw new Error('Legacy column ' + k + ' is not written by payroll approvals');
    v[k] = values[k];
  });
  updateRows(TABS.PAYROLL_PERIOD_CATEGORY, [{ row: pcRow._row, values: v }]);
}

function approval_resetValues_() {
  return { STATUS: PERIOD_STATUS.DRAFT, HR_APPROVED_BY: '', HR_APPROVED_AT: '', ACCOUNTS_APPROVED_BY: '',
    ACCOUNTS_APPROVED_AT: '' };
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
    var vals = { STATUS: d.newStatus };
    vals[isHr ? 'HR_APPROVED_BY' : 'ACCOUNTS_APPROVED_BY'] = user;
    vals[isHr ? 'HR_APPROVED_AT' : 'ACCOUNTS_APPROVED_AT'] = nowIso_();
    approval_writePc_(pc, vals);
    var held = re.calc.held.map(function (h) { return h.EMP_ID; });
    audit(auditName, period, population, { result: 'APPROVED', user: user, status: d.newStatus, hash: re.hash, held: held });
    return { ok: true, status: d.newStatus, reason: d.reason, held: held };
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

// ================================================================ approval gates for master data (R11 / R27 / PROCESS_FLOW 1.0)

/**
 * Pure. Which effective pay-structure rows of a population still need the HR stamp for the period.
 * roster = engine roster entries ({EMP_ID, PAYROLL_CATEGORY}); rows = row objects ({_row, ...}); rateBased = the category
 * reads PAYROLL_RATE_PROFILE (RATE_SOURCE) instead of SALARY_STRUCTURE. A SALARY_STRUCTURE row is pending while
 * HR_APPROVED_BY is blank; a rate-profile row while its VERSION_STATE is not an approved state (blank = approved).
 * Returns {population, period, employees, withEffectiveRow, alreadyApproved, toStamp:[{row, empId, effectiveFrom, versionState}],
 * withoutRow:[ids]}.
 */
function salaryApprovalPlan(salaryRows, roster, period, population, rateBased) {
  var pick = rateBased ? engine_pickRate(salaryRows, period) : engine_pickSalary(salaryRows, period);
  var ids = [], seen = {};
  (roster || []).forEach(function (e) {
    var id = engine_id_(e.EMP_ID);
    if (engine_id_(e.PAYROLL_CATEGORY) !== population || seen[id]) return;
    seen[id] = true; ids.push(id);
  });
  var plan = { population: population, period: period, employees: ids.length, withEffectiveRow: 0, alreadyApproved: 0,
    toStamp: [], withoutRow: [] };
  ids.forEach(function (id) {
    var r = pick[id];
    if (!r) { plan.withoutRow.push(id); return; }
    plan.withEffectiveRow++;
    var approved = rateBased ? calc_isRateApproved(r) : engine_id_(r.HR_APPROVED_BY) !== '';
    if (approved) plan.alreadyApproved++;
    else plan.toStamp.push({ row: r._row, empId: id, effectiveFrom: engine_dateLo_(r.EFFECTIVE_FROM), versionState: engine_id_(r.VERSION_STATE) });
  });
  return plan;
}

/** Pure. STATUTORY_CONFIG rows applying to the period that still need Accounts' APPROVED_BY stamp. */
function statutoryApprovalPlan(configRows, period) {
  var best = calc_statutoryWinners_(configRows, period);
  var plan = { period: period, keys: Object.keys(best).length, alreadyApproved: 0, toStamp: [] };
  Object.keys(best).sort().forEach(function (k) {
    if (best[k].approved) plan.alreadyApproved++;
    else plan.toStamp.push({ row: best[k].row._row, key: k });
  });
  return plan;
}

function approval_requireStampColumns_(tab, cols) {
  var headers = getHeaders(resolveSheet_(tab));
  var missing = cols.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) throw new Error(tab + ' lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup)');
}

/** Tab that holds the pay structure of an active category (RATE_SOURCE) and whether it is the rate-profile kind. */
function approval_payTab_(population) {
  var e = categoryEntry(population);
  if (!e || !e.active) throw new Error('Unknown population "' + population + '"');
  return e.rateSource === 'RATE_PROFILE' ? { tab: TABS.PAYROLL_RATE_PROFILE, rateBased: true }
    : { tab: TABS.SALARY_STRUCTURE, rateBased: false };
}

/** Read-only counts and the list of pending rows (empId, effective from) for the HR confirmation dialog. */
function planSalaryStructureApproval(period, population) {
  guardPeriod_(period);
  var pt = approval_payTab_(population);
  var roster = engine_rosterFromMaster(readObjects(TABS.EMPLOYEE_MASTER), period);
  var plan = salaryApprovalPlan(readObjects(pt.tab), roster.all, period, population, pt.rateBased);
  plan.tab = pt.tab;
  return plan;
}

/**
 * HR approves the pending pay-structure rows effective for the period of one category (active employees only): the
 * SALARY_STRUCTURE row (HR_APPROVED_BY / HR_APPROVED_AT) or the PAYROLL_RATE_PROFILE row (VERSION_STATE APPROVED +
 * HR_APPROVED_BY / HR_APPROVED_AT). Rows added later through the employee dialog (new joiners, revisions) are approved the
 * same way; a revision effective from a later month is approved by running this for that month. Runner must be
 * HR_APPROVER_EMAIL; audited; idempotent. The employee's VALIDATION_STATE PENDING_HR_APPROVAL becomes HR_APPROVED.
 */
function approveSalaryStructure(period, population) {
  var plan = planSalaryStructureApproval(period, population);
  var user = approval_userEmail_();
  var approver = getControl('HR_APPROVER_EMAIL', '');
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(approver) || approval_email_(user) !== approval_email_(approver)) {
    audit('SALARY_APPROVE', period, population, { result: 'REFUSED', reason: 'USER_NOT_HR_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_HR_APPROVER' };
  }
  var rateBased = plan.tab === TABS.PAYROLL_RATE_PROFILE;
  approval_requireStampColumns_(plan.tab, rateBased ? ['VERSION_STATE', 'HR_APPROVED_BY', 'HR_APPROVED_AT'] : ['HR_APPROVED_BY', 'HR_APPROVED_AT']);
  var now = nowIso_();
  updateRows(plan.tab, plan.toStamp.map(function (t) {
    var v = { HR_APPROVED_BY: user, HR_APPROVED_AT: now };
    if (rateBased) v.VERSION_STATE = 'APPROVED';
    else if (t.versionState.toUpperCase() === 'PENDING') v.VERSION_STATE = 'APPROVED';
    return { row: t.row, values: v };
  }));
  approval_signOffMaster_(plan.toStamp.map(function (t) { return t.empId; }), user, now);
  var res = { ok: true, reason: 'OK', period: period, population: population, stamped: plan.toStamp.length,
    alreadyApproved: plan.alreadyApproved, employeesWithoutStructure: plan.withoutRow };
  audit('SALARY_APPROVE', period, population, { result: 'APPROVED', user: user, stamped: res.stamped,
    alreadyApproved: res.alreadyApproved, withoutStructure: plan.withoutRow.length,
    empIds: plan.toStamp.map(function (t) { return t.empId; }) });
  return res;
}

/** EMPLOYEE_MASTER.VALIDATION_STATE PENDING_HR_APPROVAL -> HR_APPROVED (+ HR_SIGNOFF_BY / _AT when the columns exist). */
function approval_signOffMaster_(empIds, user, now) {
  if (!empIds.length || !getSheet(TABS.EMPLOYEE_MASTER)) return;
  var want = {};
  empIds.forEach(function (id) { want[id] = true; });
  var headers = getHeaders(resolveSheet_(TABS.EMPLOYEE_MASTER));
  if (headers.indexOf('VALIDATION_STATE') < 0) return;
  var ups = [];
  readObjects(TABS.EMPLOYEE_MASTER).forEach(function (r) {
    if (!want[engine_id_(r.EMP_ID)] || engine_id_(r.VALIDATION_STATE).toUpperCase() !== 'PENDING_HR_APPROVAL') return;
    var v = { VALIDATION_STATE: 'HR_APPROVED' };
    if (headers.indexOf('HR_SIGNOFF_BY') >= 0) v.HR_SIGNOFF_BY = user;
    if (headers.indexOf('HR_SIGNOFF_AT') >= 0) v.HR_SIGNOFF_AT = now;
    ups.push({ row: r._row, values: v });
  });
  updateRows(TABS.EMPLOYEE_MASTER, ups);
}

/** Read-only counts for the Accounts confirmation dialog. */
function planStatutoryApproval(period) {
  guardPeriod_(period);
  return statutoryApprovalPlan(readObjects(TABS.STATUTORY_CONFIG), period);
}

/**
 * Accounts approves the STATUTORY_CONFIG rows that apply to the period. Runner must be ACCOUNTS_APPROVER_EMAIL.
 * Stamps APPROVED_BY / APPROVED_AT on rows that are still blank; audited. No statutory value is used before this.
 */
function approveStatutoryConfig(period) {
  var plan = planStatutoryApproval(period);
  var user = approval_userEmail_();
  var approver = getControl('ACCOUNTS_APPROVER_EMAIL', '');
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(approver) || approval_email_(user) !== approval_email_(approver)) {
    audit('STATUTORY_APPROVE', period, '', { result: 'REFUSED', reason: 'USER_NOT_ACCOUNTS_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_ACCOUNTS_APPROVER' };
  }
  approval_requireStampColumns_(TABS.STATUTORY_CONFIG, ['APPROVED_BY', 'APPROVED_AT']);
  var now = nowIso_();
  updateRows(TABS.STATUTORY_CONFIG, plan.toStamp.map(function (t) {
    return { row: t.row, values: { APPROVED_BY: user, APPROVED_AT: now } };
  }));
  var res = { ok: true, reason: 'OK', period: period, stamped: plan.toStamp.length, alreadyApproved: plan.alreadyApproved };
  audit('STATUTORY_APPROVE', period, '', { result: 'APPROVED', user: user, stamped: res.stamped,
    alreadyApproved: res.alreadyApproved, keys: plan.toStamp.map(function (t) { return t.key; }) });
  return res;
}

// ================================================================ category config sign-off (owner)

/** Pure. Rows of PAYROLL_CATEGORY_CONFIG that still need the owner's stamp, and configuration problems that refuse it. */
function categoryApprovalPlan(configRows) {
  var plan = { rows: 0, alreadyApproved: 0, toStamp: [], problems: [] };
  var seen = {};
  (configRows || []).forEach(function (r) {
    var e = categoryEntryFromRow(r);
    if (!e) return;
    plan.rows++;
    if (seen[e.code]) { plan.problems.push(e.code + ': duplicate CATEGORY_CODE'); return; }
    seen[e.code] = true;
    categoryEntryProblems(e).forEach(function (p) { plan.problems.push(p); });
    if (e.approvedBy) plan.alreadyApproved++; else plan.toStamp.push({ row: r._row, code: e.code });
  });
  return plan;
}

/** Read-only counts for the owner's confirmation dialog. */
function planCategoryApproval() {
  return categoryApprovalPlan(getSheet(TABS.PAYROLL_CATEGORY_CONFIG) ? readObjects(TABS.PAYROLL_CATEGORY_CONFIG) : []);
}

/**
 * The owner signs off PAYROLL_CATEGORY_CONFIG: stamps APPROVED_BY / APPROVED_AT on the rows still blank. Runner must be
 * OWNER_APPROVER_EMAIL. Refused while a row is misconfigured (unknown CALC_METHOD / SITE / RATE_SOURCE, PAYSLIP=Y without a
 * template key). Until a category row is approved its population is BLOCKED in readiness (CATEGORY_CONFIG).
 */
function approveCategoryConfig() {
  var plan = planCategoryApproval();
  var user = approval_userEmail_();
  var owner = getOwnerApproverEmail();
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(owner) || approval_email_(user) !== approval_email_(owner)) {
    audit('CATEGORY_APPROVE', '', '', { result: 'REFUSED', reason: 'USER_NOT_OWNER', user: user });
    return { ok: false, reason: 'USER_NOT_OWNER' };
  }
  if (plan.problems.length) {
    audit('CATEGORY_APPROVE', '', '', { result: 'REFUSED', reason: 'CONFIG_PROBLEMS', problems: plan.problems });
    return { ok: false, reason: 'CONFIG_PROBLEMS', problems: plan.problems };
  }
  approval_requireStampColumns_(TABS.PAYROLL_CATEGORY_CONFIG, ['APPROVED_BY', 'APPROVED_AT']);
  var now = nowIso_();
  updateRows(TABS.PAYROLL_CATEGORY_CONFIG, plan.toStamp.map(function (t) {
    return { row: t.row, values: { APPROVED_BY: user, APPROVED_AT: now } };
  }));
  categoryConfigReset_();
  var res = { ok: true, reason: 'OK', stamped: plan.toStamp.length, alreadyApproved: plan.alreadyApproved };
  audit('CATEGORY_APPROVE', '', '', { result: 'APPROVED', user: user, stamped: res.stamped,
    categories: plan.toStamp.map(function (t) { return t.code; }) });
  return res;
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

/**
 * Draft rows of period x population -> PAYROLL_LOCKED objects (LOCK_ID first, then OUTPUT_COLUMNS). Held employees
 * (FLAGS contains HOLD) are never locked here; a later supplementary run may lock them under a second LOCK_ID.
 */
function buildLockRows(draftRows, lockId, period, population) {
  return (draftRows || []).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population && !engine_isHeldRow_(r);
  }).map(function (r) {
    var o = { LOCK_ID: lockId };
    OUTPUT_COLUMNS.forEach(function (c) { o[c] = r[c] === undefined || r[c] === null ? '' : r[c]; });
    return o;
  });
}

/**
 * lockDecision({status, userEmail, accountsEmail, ownerEmail, storedHash, currentHash, draftSheetHash, draftRowCount
 * (payable = non-held rows), alreadyLockedEmpIds}) -> {ok, newStatus, reason}. A hash mismatch gives newStatus DRAFT
 * (caller resets + audits). Only an EMP_ID that is already in PAYROLL_LOCKED for the period x population refuses the
 * lock (a second LOCK_ID with different EMP_IDs is allowed); held employees never refuse it.
 */
function lockDecision(a) {
  var status = String(a.status == null ? '' : a.status).trim().toUpperCase();
  var user = approval_email_(a.userEmail);
  if (!user) return { ok: false, newStatus: status, reason: 'USER_EMAIL_UNKNOWN' };
  if (status !== PERIOD_STATUS.ACCOUNTS_APPROVED) return { ok: false, newStatus: status, reason: 'STATUS_NOT_ACCOUNTS_APPROVED' };
  if (user !== approval_email_(a.accountsEmail) && user !== approval_email_(a.ownerEmail)) {
    return { ok: false, newStatus: status, reason: 'USER_NOT_ACCOUNTS_APPROVER_OR_OWNER' };
  }
  if ((a.alreadyLockedEmpIds || []).length > 0) return { ok: false, newStatus: status, reason: 'EMP_ALREADY_LOCKED' };
  var stored = String(a.storedHash == null ? '' : a.storedHash).trim();
  if (!stored) return { ok: false, newStatus: status, reason: 'NO_DRAFT_HASH' };
  if (String(a.currentHash) !== stored || String(a.draftSheetHash) !== stored) {
    return { ok: false, newStatus: PERIOD_STATUS.DRAFT, reason: 'INPUTS_OR_DRAFT_CHANGED' };
  }
  if (!(a.draftRowCount > 0)) return { ok: false, newStatus: status, reason: 'NO_PAYABLE_ROWS' };
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
  // supplementary (top-up) rows share PAYROLL_DRAFT but are locked by supplementaryLock, never by this function
  var draftRows = readObjects(TABS.PAYROLL_DRAFT).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population && engine_runType_(r.RUN_ID) === 'NORMAL';
  });
  var payable = engine_payableRows_(draftRows);
  var heldRows = draftRows.filter(engine_isHeldRow_);
  var lockedSheet = getSheet(TABS.PAYROLL_LOCKED);
  var lockedIds = {};
  (lockedSheet ? readObjects(lockedSheet) : []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population) lockedIds[String(r.EMP_ID).trim()] = true;
  });
  var overlap = payable.map(function (r) { return String(r.EMP_ID).trim(); }).filter(function (id) { return lockedIds[id]; });
  var d = lockDecision({ status: status, userEmail: user, accountsEmail: getControl('ACCOUNTS_APPROVER_EMAIL', ''),
    ownerEmail: approval_ownerEmail_(), storedHash: pc.DRAFT_HASH, currentHash: re.hash,
    draftSheetHash: hashRows(payable, OUTPUT_COLUMNS, engine_sha256Hex_), draftRowCount: payable.length,
    alreadyLockedEmpIds: overlap });
  if (!d.ok) {
    if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
      approval_writePc_(pc, approval_resetValues_());
      audit('STATUS_RESET', period, population, { from: status, to: PERIOD_STATUS.DRAFT, reason: d.reason, user: user });
    }
    audit('LOCK', period, population, { result: 'REFUSED', reason: d.reason, user: user, status: d.newStatus,
      alreadyLocked: overlap });
    return { ok: false, status: d.newStatus, reason: d.reason, alreadyLocked: overlap };
  }
  var lockId = lockIdFor(period, population, new Date());
  var sheet = ensureSheet(TABS.PAYROLL_LOCKED);
  ensureHeaders(sheet, ['LOCK_ID'].concat(OUTPUT_COLUMNS));
  var rows = buildLockRows(draftRows, lockId, period, population);
  appendObjects(sheet, rows);
  if (!isSheetProtected(sheet)) protectSheet(sheet, 'HR OS PAYROLL_LOCKED (append-only, owner edit)');
  approval_writePc_(pc, { STATUS: PERIOD_STATUS.LOCKED, LOCKED_AT: nowIso_(), LOCK_ID: lockId });
  var held = heldRows.map(function (r) { return { EMP_ID: String(r.EMP_ID).trim(), flags: String(r.FLAGS || '') }; });
  audit('LOCK', period, population, { result: 'LOCKED', lockId: lockId, rows: rows.length, user: user, hash: re.hash,
    heldNotLocked: held.map(function (h) { return h.EMP_ID; }) });
  return { ok: true, status: PERIOD_STATUS.LOCKED, reason: 'OK', lockId: lockId, rows: rows.length, held: held };
}

// ===== 42_Supplementary.gs =====
/**
 * 42_Supplementary.gs - supplementary (top-up) run for employees that were HELD in a locked run.
 *
 * After a period x population is LOCKED, employees that were held (FLAGS HOLD in the locked run's draft) and are not in
 * PAYROLL_LOCKED can still be fixed (register, attendance approval, feeds, salary approval, ...). "Run top-up for released
 * employees" recalculates the population, takes ONLY those held EMP_IDs that no longer have any HOLD issue, writes their rows
 * to PAYROLL_DRAFT with RUN_ID SUPP-<period>-<population>-<timestamp> (RUN type SUPPLEMENTARY) and records the set in
 * PAYROLL_SUPPLEMENTARY (SUPP_ID, EMP_IDS, HASH, STATUS, HR_*, ACCOUNTS_*, LOCK_ID). HR then Accounts approve that set (its
 * own hash: any change of the inputs resets it to DRAFT), then Accounts / owner lock it under a NEW LOCK_ID into
 * PAYROLL_LOCKED. An EMP_ID already locked for the period x population is never locked again. Payslips and emails work per
 * LOCK_ID (generatePayslips(period, population, lockId)).
 */
var SUPP_OPEN_STATUSES = ['DRAFT', 'HR_APPROVED', 'ACCOUNTS_APPROVED'];

// ---------------------------------------------------------------- pure

function supp_id_(v) { return String(v == null ? '' : v).trim(); }

function suppIdFor(period, population, date) {
  return ENGINE_SUPP_PREFIX + period + '-' + population + '-' + Utilities.formatDate(date || new Date(), HROS_TZ, 'yyyyMMddHHmmss');
}

/** LOCK_ID of a supplementary lock: the normal pattern plus -SUPP (-SUPP2 ... when the id is taken). */
function suppLockIdFor(period, population, date, takenIds) {
  var base = lockIdFor(period, population, date) + '-SUPP', id = base, n = 1;
  var taken = {};
  (takenIds || []).forEach(function (t) { taken[supp_id_(t)] = true; });
  while (taken[id]) { n++; id = base + n; }
  return id;
}

/**
 * Employees that were held in the locked run and are not locked yet: draftRows = PAYROLL_DRAFT rows, lockedRows =
 * PAYROLL_LOCKED rows (any period / population; filtered here). Supplementary draft rows are ignored.
 */
function suppCandidates(draftRows, lockedRows, period, population) {
  var locked = {};
  (lockedRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) === period && supp_id_(r.POPULATION) === population) locked[supp_id_(r.EMP_ID)] = true;
  });
  var out = [], seen = {};
  (draftRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) !== period || supp_id_(r.POPULATION) !== population) return;
    if (engine_runType_(r.RUN_ID) !== 'NORMAL' || !engine_isHeldRow_(r)) return;
    var id = supp_id_(r.EMP_ID);
    if (!id || locked[id] || seen[id]) return;
    seen[id] = true; out.push(id);
  });
  return out.sort();
}

/**
 * Splits the candidates by the fresh calculation: released = still on the roster, no HOLD and no blocker (a numeric
 * NET_PAY); stillHeld = with their HOLD codes. results = engine_calcPopulation(...).results.
 */
function suppPartition(candidates, results) {
  var by = {};
  (results || []).forEach(function (res) { by[supp_id_((res.row || {}).EMP_ID)] = res; });
  var released = [], stillHeld = [];
  (candidates || []).forEach(function (id) {
    var res = by[id];
    if (!res) { stillHeld.push({ empId: id, codes: ['NOT_ON_ROSTER'] }); return; }
    var codes = (res.exceptions || []).filter(function (e) { return e.severity === 'HOLD' || e.severity === 'BLOCKER'; })
      .map(function (e) { return e.code; });
    var net = res.row ? res.row.NET_PAY : null;
    if (res.held || codes.length || typeof net !== 'number') stillHeld.push({ empId: id, codes: codes.length ? codes : ['NO_NET_PAY'] });
    else released.push(id);
  });
  return { released: released, stillHeld: stillHeld };
}

/** The payable rows of a calculation for the given EMP_IDs (the rows the supplementary hash and lock are made of). */
function suppRowsFor(calcRows, empIds) {
  var want = {};
  (empIds || []).forEach(function (id) { want[supp_id_(id)] = true; });
  return engine_payableRows_(calcRows).filter(function (r) { return want[supp_id_(r.EMP_ID)]; });
}

function suppEmpList_(text) {
  return String(text == null ? '' : text).split(',').map(supp_id_).filter(function (x) { return x; });
}

// ---------------------------------------------------------------- sheet-touching

function supp_requireSheet_() {
  var sheet = getSheet(TABS.PAYROLL_SUPPLEMENTARY);
  if (!sheet) throw new Error('Tab PAYROLL_SUPPLEMENTARY is missing (run HR OS > Setup > Run setup)');
  var headers = getHeaders(sheet);
  var missing = HROS_SUPPLEMENTARY_HEADERS.filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) throw new Error('PAYROLL_SUPPLEMENTARY lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup)');
  return sheet;
}

/** The non-locked, non-superseded supplementary set of a period x population (the latest one), or null. */
function supp_openSet_(period, population) {
  var rows = readObjects(TABS.PAYROLL_SUPPLEMENTARY).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && supp_id_(r.POPULATION) === population &&
      SUPP_OPEN_STATUSES.indexOf(supp_id_(r.STATUS).toUpperCase()) >= 0;
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function supp_draftRowsOf_(suppId) {
  return readObjects(TABS.PAYROLL_DRAFT).filter(function (r) { return supp_id_(r.RUN_ID) === suppId; });
}

function supp_resetValues_() {
  return { STATUS: 'DRAFT', HR_APPROVED_BY: '', HR_APPROVED_AT: '', ACCOUNTS_APPROVED_BY: '', ACCOUNTS_APPROVED_AT: '' };
}

/**
 * Menu "Payroll > Run top-up for released employees": recalculates a LOCKED period x population and writes the released
 * held employees as a SUPPLEMENTARY draft set (status DRAFT, needs HR then Accounts approval and its own lock). A set
 * that is still open (not locked) is superseded by the new one (approvals cleared).
 */
function supplementaryRun(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  supp_requireSheet_();
  var pc = approval_pcRow_(period, population);
  if (supp_id_(pc.STATUS).toUpperCase() !== PERIOD_STATUS.LOCKED) {
    throw new Error(period + ' x ' + population + ' is ' + (supp_id_(pc.STATUS) || 'not set') + ', not LOCKED - use the normal draft, a top-up is only for a locked run');
  }
  var user = approval_userEmail_();
  var draftRows = readObjects(TABS.PAYROLL_DRAFT);
  var lockedRows = getSheet(TABS.PAYROLL_LOCKED) ? readObjects(TABS.PAYROLL_LOCKED) : [];
  var cands = suppCandidates(draftRows, lockedRows, period, population);
  if (!cands.length) return { ok: false, reason: 'NO_HELD_EMPLOYEES', message: 'No employee was held in the locked run, or all of them are already locked' };
  var src = engine_readSources_(period);
  var now = new Date();
  var suppId = suppIdFor(period, population, now), n = 1;
  var usedIds = {};
  readObjects(TABS.PAYROLL_SUPPLEMENTARY).forEach(function (r) { usedIds[supp_id_(r.SUPP_ID)] = true; });
  var baseId = suppId;
  while (usedIds[suppId]) { n++; suppId = baseId + '-' + n; }
  var calc = engine_calcPopulation(src, population, suppId, nowIso_());
  var part = suppPartition(cands, calc.results);
  if (!part.released.length) {
    audit('SUPP_DRAFT', period, population, { result: 'NOTHING_RELEASED', by: user, stillHeld: part.stillHeld });
    return { ok: false, reason: 'NO_RELEASED_EMPLOYEES', stillHeld: part.stillHeld };
  }
  var rows = suppRowsFor(calc.rows, part.released);
  var hash = hashRows(rows, OUTPUT_COLUMNS, engine_sha256Hex_);
  var superseded = [];
  var old = supp_openSet_(period, population);
  if (old) {
    updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: old._row, values: { STATUS: 'SUPERSEDED' } }]);
    superseded.push(supp_id_(old.SUPP_ID));
  }
  var draft = ensureSheet(TABS.PAYROLL_DRAFT);
  ensureHeaders(draft, OUTPUT_COLUMNS);
  appendObjects(draft, rows.map(function (r) {
    var o = {};
    OUTPUT_COLUMNS.forEach(function (c) { o[c] = r[c] === undefined || r[c] === null ? '' : r[c]; });
    return o;
  }));
  appendObjects(TABS.PAYROLL_SUPPLEMENTARY, [{ PERIOD: period, POPULATION: population, SUPP_ID: suppId, EMP_IDS: part.released.join(','),
    HASH: hash, STATUS: 'DRAFT', CREATED_BY: user, CREATED_AT: nowIso_() }], { textHeaders: ['SUPP_ID', 'EMP_IDS', 'HASH', 'LOCK_ID'] });
  audit('SUPP_DRAFT', period, population, { result: 'DRAFT', suppId: suppId, by: user, empIds: part.released, stillHeld: part.stillHeld,
    superseded: superseded, hash: hash });
  return { ok: true, suppId: suppId, empIds: part.released, stillHeld: part.stillHeld, rows: rows.length, hash: hash,
    superseded: superseded, totalNet: engine_sum_(rows, 'NET_PAY') };
}

/** Recomputes (no writes) the payable rows of the set's EMP_IDs from fresh sources and their hash. */
function supp_recompute_(period, population, empIds) {
  var src = engine_readSources_(period);
  var calc = engine_calcPopulation(src, population, '', nowIso_());
  var rows = suppRowsFor(calc.rows, empIds);
  return { hash: hashRows(rows, OUTPUT_COLUMNS, engine_sha256Hex_), rows: rows, held: calc.held };
}

function supp_alreadyLocked_(period, population, empIds) {
  if (!getSheet(TABS.PAYROLL_LOCKED)) return [];
  var locked = {};
  readObjects(TABS.PAYROLL_LOCKED).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) === period && supp_id_(r.POPULATION) === population) locked[supp_id_(r.EMP_ID)] = true;
  });
  return empIds.filter(function (id) { return locked[id]; });
}

function supp_approve_(action, period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  supp_requireSheet_();
  var isHr = action === 'HR';
  var auditName = isHr ? 'SUPP_HR_APPROVE' : 'SUPP_ACCOUNTS_APPROVE';
  var supp = supp_openSet_(period, population);
  if (!supp) return { ok: false, reason: 'NO_OPEN_SUPPLEMENTARY', message: 'Run the top-up first' };
  var user = approval_userEmail_();
  var status = supp_id_(supp.STATUS).toUpperCase();
  var ids = suppEmpList_(supp.EMP_IDS);
  var locked = supp_alreadyLocked_(period, population, ids);
  if (locked.length) {
    audit(auditName, period, population, { result: 'REFUSED', reason: 'EMP_ALREADY_LOCKED', empIds: locked, suppId: supp.SUPP_ID });
    return { ok: false, status: status, reason: 'EMP_ALREADY_LOCKED', alreadyLocked: locked };
  }
  var re = supp_recompute_(period, population, ids);
  var d = approvalDecision({ action: action, status: status, userEmail: user,
    approverEmail: getControl(isHr ? 'HR_APPROVER_EMAIL' : 'ACCOUNTS_APPROVER_EMAIL', ''), readinessRows: [],
    storedHash: supp.HASH, currentHash: re.hash });
  if (d.ok) {
    var vals = { STATUS: d.newStatus };
    vals[isHr ? 'HR_APPROVED_BY' : 'ACCOUNTS_APPROVED_BY'] = user;
    vals[isHr ? 'HR_APPROVED_AT' : 'ACCOUNTS_APPROVED_AT'] = nowIso_();
    updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: vals }]);
    audit(auditName, period, population, { result: 'APPROVED', user: user, suppId: supp.SUPP_ID, status: d.newStatus, hash: re.hash });
    return { ok: true, status: d.newStatus, suppId: supp_id_(supp.SUPP_ID), reason: 'OK' };
  }
  if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
    if (status !== 'DRAFT') {
      updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: supp_resetValues_() }]);
      audit('SUPP_STATUS_RESET', period, population, { from: status, to: 'DRAFT', reason: d.reason, user: user, suppId: supp.SUPP_ID });
    }
    audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, note: 'run the top-up again' });
    return { ok: false, status: 'DRAFT', reason: d.reason, message: 'Inputs changed since the top-up was calculated: run it again' };
  }
  audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, status: status });
  return { ok: false, status: status, reason: d.reason };
}

function supplementaryHrApprove(period, population) { return supp_approve_('HR', period, population); }
function supplementaryAccountsApprove(period, population) { return supp_approve_('ACCOUNTS', period, population); }

/**
 * Locks the ACCOUNTS_APPROVED supplementary set under a new LOCK_ID (Accounts approver or owner). The rows go to
 * PAYROLL_LOCKED; an EMP_ID that is already locked for the period x population refuses the lock (EMP_ALREADY_LOCKED).
 */
function supplementaryLock(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  supp_requireSheet_();
  var supp = supp_openSet_(period, population);
  if (!supp) return { ok: false, reason: 'NO_OPEN_SUPPLEMENTARY', message: 'Run the top-up first' };
  var user = approval_userEmail_();
  var status = supp_id_(supp.STATUS).toUpperCase();
  var ids = suppEmpList_(supp.EMP_IDS);
  var overlap = supp_alreadyLocked_(period, population, ids);
  var re = supp_recompute_(period, population, ids);
  var sheetRows = supp_draftRowsOf_(supp_id_(supp.SUPP_ID));
  var payable = engine_payableRows_(sheetRows);
  var d = lockDecision({ status: status, userEmail: user, accountsEmail: getControl('ACCOUNTS_APPROVER_EMAIL', ''),
    ownerEmail: approval_ownerEmail_(), storedHash: supp.HASH, currentHash: re.hash,
    draftSheetHash: hashRows(payable, OUTPUT_COLUMNS, engine_sha256Hex_), draftRowCount: payable.length, alreadyLockedEmpIds: overlap });
  if (!d.ok) {
    if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
      updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: supp_resetValues_() }]);
      audit('SUPP_STATUS_RESET', period, population, { from: status, to: 'DRAFT', reason: d.reason, user: user, suppId: supp.SUPP_ID });
    }
    audit('SUPP_LOCK', period, population, { result: 'REFUSED', reason: d.reason, user: user, suppId: supp.SUPP_ID, alreadyLocked: overlap });
    return { ok: false, status: d.newStatus, reason: d.reason, alreadyLocked: overlap };
  }
  var sheet = ensureSheet(TABS.PAYROLL_LOCKED);
  ensureHeaders(sheet, ['LOCK_ID'].concat(OUTPUT_COLUMNS));
  var taken = readObjects(sheet).map(function (r) { return r.LOCK_ID; });
  readObjects(TABS.PAYROLL_PERIOD_CATEGORY).forEach(function (r) { taken.push(r.LOCK_ID); });
  var lockId = suppLockIdFor(period, population, new Date(), taken);
  var rows = buildLockRows(payable, lockId, period, population);
  appendObjects(sheet, rows);
  if (!isSheetProtected(sheet)) protectSheet(sheet, 'HR OS PAYROLL_LOCKED (append-only, owner edit)');
  updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: { STATUS: 'LOCKED', LOCK_ID: lockId, LOCKED_AT: nowIso_() } }],
    { textHeaders: ['LOCK_ID'] });
  audit('SUPP_LOCK', period, population, { result: 'LOCKED', lockId: lockId, suppId: supp.SUPP_ID, rows: rows.length, user: user, hash: re.hash });
  return { ok: true, status: 'LOCKED', lockId: lockId, suppId: supp_id_(supp.SUPP_ID), rows: rows.length, empIds: ids,
    note: 'Generate payslips for this LOCK_ID: HR OS > Payslips > Generate payslips (enter the LOCK_ID)' };
}

// ===== 50_Payslips.gs =====
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
  OTHER_ALLOWANCE: pslSumL_(PAYSLIP_OTHER_ALLOWANCE_COLS),
  // worker TOTAL_EARNINGS is a whole rupee (ROUND of the sum): print OT to whole rupees so the slip foots exactly (stored value unchanged)
  OT_AMOUNT: function (row) { return payslipMoneyLine(roundSheets(Number(row.OT_AMOUNT || 0))); }
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

/** LOCKED status + the LOCK_ID to work on: the given one (a supplementary lock) or the population's main LOCK_ID. */
function email_lockOf_(period, population, lockId) {
  var st = payslipLockId_(period, population);
  var use = String(lockId || st.lockId || '').trim();
  return { status: st.status, lockId: use };
}

function queuePayslipEmailsOne_(period, population, lockId) {
  guardPeriod_(period);
  if (payslipPopulations().indexOf(population) < 0) throw new Error('Payslip emails are only for ' + payslipPopulations().join(' and '));
  var st = email_lockOf_(period, population, lockId);
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

function sendQueuedEmailsOne_(period, population, lockId) {
  guardPeriod_(period);
  if (payslipPopulations().indexOf(population) < 0) throw new Error('Payslip emails are only for ' + payslipPopulations().join(' and '));
  var control = readControlMap();
  var gate = emailReleaseAllowed(control, period, auditUser_(), control.ACCOUNTS_APPROVER_EMAIL);
  if (!gate.allowed) {
    audit('PAYSLIP_EMAIL_REFUSED', period, population, gate.reasons);
    throw new Error('Email release refused: ' + gate.reasons.join('; '));
  }
  var st = email_lockOf_(period, population, lockId);
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
function emailEachPopulation_(fn, period, population, lockId) {
  if (population) return fn(period, population, lockId);
  var out = {};
  payslipPopulations().forEach(function (p) {
    try { out[p] = fn(period, p); } catch (e) { out[p] = { refused: String(e && e.message ? e.message : e) }; }
  });
  return out;
}

/** lockId (optional, needs a population): a supplementary (top-up) LOCK_ID instead of the population's main one. */
function queuePayslipEmails(period, population, lockId) { return emailEachPopulation_(queuePayslipEmailsOne_, period, population, lockId); }
function sendQueuedEmails(period, population, lockId) { return emailEachPopulation_(sendQueuedEmailsOne_, period, population, lockId); }

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
    .addSubMenu(ui.createMenu('Employees')
      .addItem('Add or update employee', 'menuEmployeeDialog')
      .addItem('Mark employee exit', 'menuEmployeeExit'))
    .addSubMenu(ui.createMenu('Month')
      .addItem('Prepare month...', 'menuPrepareMonth')
      .addItem('Open monthly attendance register', 'menuOpenRegister')
      .addItem('Prepare monthly attendance (HR entry)', 'menuPrepareAttendance')
      .addItem('Generate monthly attendance from daily', 'menuGenerateAttendance')
      .addItem('Approve attendance (population)...', 'menuApproveAttendance')
      .addSeparator()
      .addItem('Build daily vs register comparison', 'menuBuildComparison')
      .addItem('Submit dispute decisions', 'menuSubmitDisputes')
      .addItem('Owner: approve attendance disputes', 'menuOwnerApproveDisputes')
      .addSeparator()
      .addItem('Sync leave', 'menuSyncLeave')
      .addItem('Sync OT', 'menuSyncOt')
      .addItem('Sync canteen', 'menuSyncCanteen')
      .addItem('Sync efficiency', 'menuSyncEfficiency')
      .addItem('Mark feed complete...', 'menuMarkFeed'))
    .addSubMenu(ui.createMenu('Payroll')
      .addItem('Approve salary structure (HR)...', 'menuApproveSalary')
      .addItem('Approve statutory config (Accounts)...', 'menuApproveStatutory')
      .addItem('Approve category config (owner)...', 'menuApproveCategory')
      .addSeparator()
      .addItem('Check readiness', 'menuCheckReadiness')
      .addItem('Calculate draft', 'menuCalculateDraft')
      .addItem('HR approve (population)', 'menuHrApprove')
      .addItem('Accounts approve (population)', 'menuAccountsApprove')
      .addItem('Lock period (population)', 'menuLock')
      .addItem('Reopen (owner only, before lock)', 'menuReopen')
      .addSeparator()
      .addItem('Run top-up for released employees...', 'menuSuppRun')
      .addItem('Top-up: HR approve...', 'menuSuppHrApprove')
      .addItem('Top-up: Accounts approve...', 'menuSuppAccountsApprove')
      .addItem('Top-up: lock...', 'menuSuppLock'))
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
  var p = ask_(title, 'Population: ' + populationList().join(' / '));
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
/** The single spreadsheet-level onFormSubmit trigger (attendance forms, OT form, canteen, efficiency). */
function menuInstallTriggers() { run_('Install triggers', installTriggers); }

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

function menuOpenRegister() { run_('Monthly attendance register', registerOpenDialog); }
function menuSyncLeave() { run_('Sync leave', function () { var p = askPeriod_('Sync leave'); return p && syncLeaveFromSource(p); }); }
function menuBuildComparison() { run_('Daily vs register comparison', function () { var p = askPeriod_('Daily vs register comparison'); return p && buildAttendanceComparison(p); }); }
function menuSubmitDisputes() { run_('Submit dispute decisions', function () { var p = askPeriod_('Submit dispute decisions'); return p && submitDisputeDecisions(p); }); }
/** Shows how many HR-submitted disputes are waiting, asks for a YES, then stamps (the runner check happens inside). */
function menuOwnerApproveDisputes() {
  run_('Owner: approve attendance disputes', function () {
    var p = askPeriod_('Owner: approve attendance disputes'); if (!p) return null;
    var waiting = cmp_storedRows_(p).filter(function (r) {
      return String(r.STATUS).trim().toUpperCase() === 'DISPUTE' && String(r.HR_BY || '').trim() && !String(r.OWNER_DECISION || '').trim();
    });
    var text = waiting.length + ' HR-submitted dispute decision(s) wait for the owner (' +
      waiting.slice(0, 20).map(function (r) { return r.EMP_ID + ' -> ' + r.HR_DECIDED_DAYS + ' days'; }).join(', ') +
      ').\nYou must be logged in as OWNER_APPROVER_EMAIL. Approve them now?';
    if (!confirm_('Owner: approve attendance disputes', text)) return 'Cancelled - nothing was approved.';
    return ownerApproveDisputes(p);
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
/** Shows the counts, asks for a YES, then stamps (the runner check happens inside the approve function). */
function confirm_(title, text) {
  var ui = SpreadsheetApp.getUi();
  return ui.alert(title, text, ui.ButtonSet.YES_NO) === ui.Button.YES;
}
function menuApproveSalary() {
  run_('Approve salary structure', function () {
    var p = askPeriod_('Approve salary structure'); if (!p) return null;
    var pop = askPopulation_('Approve salary structure'); if (!pop) return null;
    var plan = planSalaryStructureApproval(p, pop);
    var list = plan.toStamp.slice(0, 40).map(function (t) { return t.empId + ' (from ' + (t.effectiveFrom || '?') + ')'; }).join(', ');
    var text = 'Period ' + p + ', ' + pop + ' (' + plan.tab + '): ' + plan.employees + ' active employee(s), ' + plan.withEffectiveRow +
      ' with an effective row.\n' + plan.toStamp.length + ' pending row(s) will be stamped HR-approved' + (list ? ': ' + list : '') + '; ' +
      plan.alreadyApproved + ' already approved' + (plan.withoutRow.length ? ', ' + plan.withoutRow.length + ' employee(s) have NO structure (' + plan.withoutRow.slice(0, 15).join(', ') + ')' : '') +
      '.\nYou must be logged in as HR_APPROVER_EMAIL. Stamp now?';
    if (!confirm_('Approve salary structure', text)) return 'Cancelled - nothing was stamped.';
    return approveSalaryStructure(p, pop);
  });
}
function menuApproveStatutory() {
  run_('Approve statutory config', function () {
    var p = askPeriod_('Approve statutory config'); if (!p) return null;
    var plan = planStatutoryApproval(p);
    var text = 'Period ' + p + ': ' + plan.keys + ' STATUTORY_CONFIG key(s) apply; ' + plan.toStamp.length + ' will be stamped approved (' +
      plan.toStamp.slice(0, 25).map(function (t) { return t.key; }).join(', ') + '), ' + plan.alreadyApproved +
      ' already approved.\nYou must be logged in as ACCOUNTS_APPROVER_EMAIL. Stamp now?';
    if (!confirm_('Approve statutory config', text)) return 'Cancelled - nothing was stamped.';
    return approveStatutoryConfig(p);
  });
}
function menuApproveCategory() {
  run_('Approve category config', function () {
    var plan = planCategoryApproval();
    var text = plan.rows + ' PAYROLL_CATEGORY_CONFIG row(s); ' + plan.toStamp.length + ' will be stamped approved (' +
      plan.toStamp.map(function (t) { return t.code; }).join(', ') + '), ' + plan.alreadyApproved + ' already approved' +
      (plan.problems.length ? '.\nPROBLEMS (approval will be refused): ' + plan.problems.join('; ') : '') +
      '.\nYou must be logged in as OWNER_APPROVER_EMAIL. Stamp now?';
    if (!confirm_('Approve category config', text)) return 'Cancelled - nothing was stamped.';
    return approveCategoryConfig();
  });
}
function menuEmployeeDialog() { run_('Add or update employee', function () { return empOpenDialog('ADD'); }); }
function menuEmployeeExit() { run_('Mark employee exit', function () { return empOpenDialog('EXIT'); }); }
function menuSuppRun() { popAction_('Run top-up', 'supplementaryRun', 9); }
function menuSuppHrApprove() { popAction_('Top-up: HR approve', 'supplementaryHrApprove', 9); }
function menuSuppAccountsApprove() { popAction_('Top-up: Accounts approve', 'supplementaryAccountsApprove', 9); }
function menuSuppLock() { popAction_('Top-up: lock', 'supplementaryLock', 9); }
/** Period, population and an optional LOCK_ID (blank = the population's main lock; a top-up lock id for a supplementary set). */
function lockAction_(title, fn) {
  run_(title, function () {
    var p = askPeriod_(title); if (!p) return null;
    var pop = askPopulation_(title); if (!pop) return null;
    var lid = ask_(title, 'LOCK_ID (blank = the main lock of ' + p + ' x ' + pop + '; enter a top-up LOCK_ID for a supplementary set)');
    if (lid === null) return null;
    return callStage_(fn, 8, [p, pop, lid || undefined]);
  });
}
function menuGeneratePayslips() { lockAction_('Generate payslips', 'generatePayslips'); }
function menuQueueEmails() { lockAction_('Queue emails', 'queuePayslipEmails'); }
function menuSendEmails() { lockAction_('Send queued emails', 'sendQueuedEmails'); }

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
