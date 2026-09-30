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
/** Normalised SITE cell; the pre-rename code of the VFL Waluj plant is still accepted until the sheet is migrated. */
function legacySite_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'NASHIK' ? SITE_VFL : s; // legacy-alias
}

function categoryEntryFromRow(r) {
  var code = String(r.CATEGORY_CODE == null ? '' : r.CATEGORY_CODE).trim();
  if (!code) return null;
  var site = legacySite_(r.SITE);
  return { code: code, displayName: String(r.DISPLAY_NAME == null ? '' : r.DISPLAY_NAME).trim() || code,
    method: String(r.CALC_METHOD == null ? '' : r.CALC_METHOD).trim().toUpperCase(),
    site: site,
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
