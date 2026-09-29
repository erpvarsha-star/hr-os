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
  PAYSLIP_REGISTER: ['LOCK_ID', 'PERIOD', 'EMP_ID', 'POPULATION', 'DOC_ID', 'PDF_ID', 'PDF_URL', 'GENERATED_AT', 'STATUS'],
  ATTENDANCE_COMPARISON: ['PERIOD', 'EMP_ID', 'NAME', 'POPULATION', 'DAILY_PRESENT', 'REGISTER_PRESENT', 'DIFF', 'STATUS',
    'HR_DECIDED_DAYS', 'HR_REASON', 'HR_BY', 'HR_AT', 'OWNER_DECISION', 'OWNER_BY', 'OWNER_AT', 'HR_STAMPED_DAYS']
};

/** Existing tabs that only get columns appended on the right. */
var HROS_APPEND_COLUMNS = {
  PAYROLL_PERIOD_CATEGORY: ['DRAFT_RUN_ID', 'DRAFT_HASH', 'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY',
    'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'],
  STATUTORY_CONFIG: ['EFFECTIVE_FROM', 'EFFECTIVE_TO', 'VERSION', 'APPROVED_BY', 'APPROVED_AT'],
  INPUT_ATTENDANCE: ['PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS', 'GENERATED_VALUES_JSON', 'HR_OVERRIDE',
    'OVERRIDE_REASON', 'ROW_KEY', 'REGISTER_DAYS_PRESENT', 'REGISTER_INCLUDES_WO', 'ENTERED_BY'],
  INPUT_OT: ['OT_KEY', 'OT_DATE', 'SOURCE_ROW', 'NORMALIZER_VERSION', 'ELIGIBILITY', 'EXCEPTION_REASON']
};

/** Header-less today: write full header only when row 1 is empty. */
var HROS_HEADER_ONLY_TABS = {
  INPUT_CANTEEN: ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS'],
  INPUT_EFFICIENCY: ['PAYROLL_MONTH', 'EMP_ID', 'EFFICIENCY_PCT', 'PHYSICAL_PRESENT_DAYS_OVERRIDE', 'SOURCE',
    'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS'],
  PAYSLIP_EMAIL_LOG: ['LOCK_ID', 'PERIOD', 'EMP_ID', 'TO_EMAIL', 'PDF_ID', 'STATUS', 'ATTEMPTED_AT', 'ERROR'],
  INPUT_LEAVE: ['PAYROLL_MONTH', 'EMP_ID', 'LEAVE_TYPE', 'DAYS', 'FROM_DATE', 'TO_DATE', 'SOURCE_REF', 'CASE_NO', 'KEY',
    'STATUS', 'EXCEPTION_REASON', 'NORMALIZER_VERSION', 'ENTERED_AT']
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
  ['PUNE_WEEKLY_OFF', 'SUN', 'Weekly off used to default blank attendance'],
  ['OT_SOURCE_SPREADSHEET_ID', '', 'Blank = read the OT form responses from a local tab of this spreadsheet; set only to read an external response spreadsheet'],
  ['OT_SOURCE_TAB', 'OT_FORM_RESPONSES', 'OT form-response tab (local; falls back to Overtime_Form if absent). With an external ID: the tab there (default Form Responses 1)'],
  ['OT_WINDOW_START_2026-09', '2026-08-26', 'one-time catch-up: Aug salary paid OT to 25-Aug'],
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
  setListValidation(ensureSheet(TABS.ATTENDANCE_COMPARISON), 'OWNER_DECISION', ['APPROVED', 'REJECTED']);
  log.validations = ['INPUT_ADJUSTMENTS.ADJUSTMENT_TYPE', 'INPUT_ATTENDANCE.APPROVAL_STATUS', 'HOLIDAY_CALENDAR.SITE',
    'HOLIDAY_CALENDAR.PAID', 'FEED_STATUS.STATUS', 'ATTENDANCE_COMPARISON.OWNER_DECISION'];

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
