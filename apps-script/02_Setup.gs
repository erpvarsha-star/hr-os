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
  'REVIEW_NOTE', 'LAST_WORKING_DAY', 'GENDER'];
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
/** Telegram chats that pressed Start; the owner types EMAIL to link a chat to a person (61_Notify.gs). */
var TELEGRAM_CHAT_HEADERS = ['CHAT_ID', 'NAME', 'USERNAME', 'FIRST_SEEN', 'EMAIL', 'ACTIVE'];
/** Running advance/loan ledger (22_Advance.gs): one row per loan, OUTSTANDING_BALANCE_INR decremented at lock time. */
var HROS_ADVANCE_LEDGER_HEADERS = ['EMP_ID', 'LOAN_ID', 'OPENING_AMOUNT_INR', 'MONTHLY_INSTALMENT_INR', 'OPENING_DATE',
  'SOURCE', 'SOURCE_REF', 'OUTSTANDING_BALANCE_INR', 'STATUS', 'CLOSED_AT', 'NOTE'];
var HROS_ADVANCE_SOURCES = ['FORM', 'ONE_TIME_IMPORT', 'HR_MANUAL'];
var HROS_ADVANCE_STATUSES = ['OPEN', 'CLOSED'];
/** "Who overrode what" trail: every edit Sheets lets through on a protected system tab (63_CorrectionsLog.gs). */
var CORRECTIONS_LOG_HEADERS = ['TIMESTAMP', 'SHEET', 'CELL', 'OLD_VALUE', 'NEW_VALUE', 'USER_EMAIL'];
/** The three people allowed to edit a protected system-only tab (protectSheet unions these with whoever runs setup). */
var HROS_PROTECT_SYSTEM_TABS = ['HR_APPROVER_EMAIL', 'OWNER_APPROVER_EMAIL', 'ACCOUNTS_APPROVER_EMAIL'];

/** Form-response tabs created by Google Forms / code: never created here, only placed in the tab order when present. */
var HROS_FORM_TABS_INPUT = ['OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'];
var HROS_FORM_TABS_ATTENDANCE = ['ATT_FORM_VFL_RAW', 'ATT_FORM_PUNE_RAW', 'ATT_MONTHLY_VFL_RAW', 'ATT_MONTHLY_PUNE_RAW'];

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
    { name: TABS.EMPLOYEE_MASTER, group: 'Masters', headers: HROS_EMPLOYEE_MASTER_HEADERS,
      validations: [['GENDER', ['M', 'F']]] },
    { name: TABS.SALARY_STRUCTURE, group: 'Masters', headers: HROS_SALARY_STRUCTURE_HEADERS },
    { name: TABS.PAYROLL_RATE_PROFILE, group: 'Masters', headers: HROS_RATE_PROFILE_HEADERS },
    { name: TABS.EMPLOYEE_STATUTORY_IDS, group: 'Masters', headers: HROS_STATUTORY_ID_HEADERS, hidden: true,
      protect: HROS_PROTECT_SYSTEM_TABS },
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
    { name: TABS.ADVANCE_LEDGER, group: 'Ledgers', headers: HROS_ADVANCE_LEDGER_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS,
      validations: [['SOURCE', HROS_ADVANCE_SOURCES], ['STATUS', HROS_ADVANCE_STATUSES]] },
    { name: TABS.ATTENDANCE_DAILY, group: 'Attendance', headers: HROS_ATTENDANCE_DAILY_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS },
    { name: TABS.INPUT_ATTENDANCE, group: 'Attendance', headers: HROS_INPUT_ATTENDANCE_HEADERS,
      validations: [['APPROVAL_STATUS', APPROVAL_STATUSES]] },
    { name: TABS.ATTENDANCE_COMPARISON, group: 'Attendance', headers: HROS_COMPARISON_HEADERS,
      validations: [['OWNER_DECISION', ['APPROVED', 'REJECTED']]] },
    { name: TABS.PAYROLL_READINESS, group: 'Payroll', headers: HROS_READINESS_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS },
    { name: TABS.PAYROLL_DRAFT, group: 'Payroll', headers: HROS_OUTPUT_COLUMNS, protect: HROS_PROTECT_SYSTEM_TABS }
  ];
  var seen = {};
  populationList().forEach(function (code) {
    var tab = populationTab(code);
    if (seen[tab]) return;
    seen[tab] = true;
    specs.push({ name: tab, group: 'Payroll', headers: HROS_OUTPUT_COLUMNS, protect: HROS_PROTECT_SYSTEM_TABS });
  });
  specs.push({ name: TABS.PAYROLL_EXCEPTIONS, group: 'Payroll', headers: HROS_EXCEPTION_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS });
  specs.push({ name: TABS.PAYROLL_RECON, group: 'Payroll', headers: HROS_RECON_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS });
  specs.push({ name: TABS.PAYROLL_SUPPLEMENTARY, group: 'Payroll', headers: HROS_SUPPLEMENTARY_HEADERS,
    validations: [['STATUS', HROS_SUPP_STATUSES]], protect: HROS_PROTECT_SYSTEM_TABS });
  specs.push({ name: TABS.PAYROLL_LOCKED, group: 'Payroll', headers: ['LOCK_ID'].concat(HROS_OUTPUT_COLUMNS), hidden: true,
    protect: HROS_PROTECT_SYSTEM_TABS });
  specs.push({ name: TABS.PAYSLIP_REGISTER, group: 'Payslips', headers: HROS_PAYSLIP_REGISTER_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS });
  specs.push({ name: TABS.PAYSLIP_EMAIL_LOG, group: 'Payslips', headers: HROS_EMAIL_LOG_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS });
  specs.push({ name: TABS.AUDIT_LOG, group: 'Audit', headers: HROS_AUDIT_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS });
  // Telegram chat registry (chat ids mapped to people by the owner): only the owner edits it
  specs.push({ name: TABS.TELEGRAM_CHATS, group: 'Audit', headers: TELEGRAM_CHAT_HEADERS, protect: ['OWNER_APPROVER_EMAIL'],
    validations: [['ACTIVE', yn]] });
  // corrections trail for protected system tabs (63_CorrectionsLog.gs); never itself on the onEdit watch-list
  specs.push({ name: TABS.CORRECTIONS_LOG, group: 'Audit', headers: CORRECTIONS_LOG_HEADERS, protect: HROS_PROTECT_SYSTEM_TABS });
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
  ['EMAIL_QUOTA_RESERVE', '10', 'Daily mail recipients kept free for alerts; payslip sending stops at this many remaining and resumes next day 09:00 IST'],
  ['VFL_WEEKLY_OFF', 'SUN', 'Weekly off used to default blank attendance'],
  ['PUNE_WEEKLY_OFF', 'SUN', 'Weekly off used to default blank attendance'],
  ['OT_SOURCE_SPREADSHEET_ID', '', 'Blank = read the OT form responses from a local tab of this spreadsheet; set only to read an external response spreadsheet'],
  ['OT_SOURCE_TAB', 'OT_FORM_RESPONSES', 'OT form-response tab (local; falls back to Overtime_Form if absent). With an external ID: the tab there (default Form Responses 1)'],
  ['OT_WINDOW_START_2026-09', '2026-08-26', 'one-time catch-up: Aug salary paid OT to 25-Aug'],
  ['LEAVE_WINDOW_START_2026-09', '2026-08-26', 'one-time catch-up: Aug payroll counted leave to 25-Aug; default leave window = calendar month'],
  ['OWNER_APPROVER_EMAIL', 'yash.munot@gmail.com', 'confirm owner email (owner approval of attendance disputes)'],
  ['REGISTER_ENTRY_EMAILS', '', 'Extra people (comma separated) who may submit the monthly attendance register; HR_APPROVER_EMAIL and OWNER_APPROVER_EMAIL always may'],
  ['REGISTER_ENTRY_EMAILS_VFL', 'hrmanager@varshaforgings.com', 'People (comma/space/semicolon separated) who may enter monthly days present for VFL employees only'],
  ['REGISTER_ENTRY_EMAILS_PUNE', 'ea.varshaforgings@gmail.com', 'People (comma/space/semicolon separated) who may enter monthly days present for Pune employees only'],
  ['LEAVE_SOURCE_SPREADSHEET_ID', '1pwVE0XKqAhAKHbyqtlF9GzfuGnidnZuw2zKbtMjUz9Q', 'Leave application spreadsheet (read-only; give the script runner view access). Blank = read a local tab of this spreadsheet'],
  ['LEAVE_SOURCE_TAB', 'Leave_Applications', 'Leave form-response tab in the leave spreadsheet (or the local tab when the ID is blank)'],
  ['AUTO_FULL_ATTENDANCE_EMP_IDS', 'VFL1001', 'Employees marked present for every working day automatically - no register/form entry needed (comma separated EMP_IDs; a row entered by HR wins)'],
  ['ZERO_PAY_ALLOWED_EMP_IDS', 'VFL1001', 'Zero salary is intentional; do not hold (comma separated EMP_IDs; no payslip is generated for a zero row)'],
  ['DAILY_REMINDER_FROM', '2026-10-01', 'Daily attendance reminders (11:00) and escalation (14:00) are active from this date (YYYY-MM-DD)'],
  ['STAGE_NOTIFICATIONS', 'Y', 'Y = tell HR / Accounts / owner after calculate, approve and lock; N = off'],
  ['ADVANCE_FORM_SOURCE_TAB', 'Advance Loan Form Responses', 'VFPL Advance\\Loan Form response tab (local; owner links the form here). Used only to record NEW loans - HR OS tracks the running balance itself (22_Advance.gs)']
];

var HROS_STATUTORY_DEFAULTS = [
  ['PT_FEB_AMOUNT', '300', 'February PT amount'],
  ['PT_WOMEN_EXEMPT_UPTO', '25000', 'Maharashtra PT: women (EMPLOYEE_MASTER GENDER = F) whose PT basis is up to this monthly amount pay no PT; above it the normal slabs apply'],
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
      // the live SITE column still carries the old reject-invalid list (no VFL); clear it, hrosSetup re-applies the new one
      var siteCol = getHeaders(sh).indexOf('SITE');
      if (siteCol >= 0) sh.getRange(2, siteCol + 1, Math.max(sh.getMaxRows() - 1, 1), 1).clearDataValidations();
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
    hidden: [], protectedTabs: [], notes: [], siteMigration: [],
    version: typeof HROS_VERSION === 'undefined' ? 'dev' : HROS_VERSION };
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

  // 7a. protect the dynamic form-response tabs too (created by Google Forms, never by hrosSetup, so they are not in
  //     the registry above): the daily/monthly attendance raw tabs, OT / canteen / efficiency / advance-loan responses.
  //     Google Forms writes responses as a system process, not subject to sheet edit protection, so this is safe.
  (function protectFormTabs() {
    var dyn = HROS_FORM_TABS_INPUT.concat(HROS_FORM_TABS_ATTENDANCE).concat([FEEDS_OT_TAB]);
    var advTab = String(ctl.ADVANCE_FORM_SOURCE_TAB || '').trim();
    if (advTab && dyn.indexOf(advTab) < 0) dyn.push(advTab);
    dyn.forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet || isSheetProtected(sheet)) return;
      var emails = HROS_PROTECT_SYSTEM_TABS.map(function (k) { return String(ctl[k] == null ? '' : ctl[k]).trim(); }).filter(function (e) { return e; });
      protectSheet(sheet, name + ' (HR OS: form response tab, restricted)', emails);
      log.protectedTabs.push(name);
    });
  })();

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
