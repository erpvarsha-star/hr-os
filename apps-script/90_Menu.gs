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
      .addItem('Install triggers', 'menuInstallTriggers')
      .addItem('Attendance: check form for duplicate columns...', 'menuCheckFormDuplicateColumns'))
    .addItem('About HR OS', 'menuAbout')
    .addSubMenu(ui.createMenu('Employees')
      .addItem('Add or update employee', 'menuEmployeeDialog')
      .addItem('Mark employee exit', 'menuEmployeeExit')
      .addItem('Bulk mark exits', 'menuEmployeeBulkExit'))
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
      .addItem('Sync advance loans', 'menuSyncAdvanceLoans')
      .addItem('Advance: import opening balances...', 'menuAdvanceImportOpening')
      .addItem('Generate advance recoveries...', 'menuAdvanceGenerateRecoveries')
      .addItem('Generate society carry-forward...', 'menuSocietyCarryforward')
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
      .addItem('Send queued emails', 'menuSendEmails')
      .addSeparator()
      .addItem('Send test payslip to me...', 'menuTestPayslip'))
    .addSubMenu(ui.createMenu('Alerts')
      .addItem('Payroll status...', 'menuPayrollStatus')
      .addSeparator()
      .addItem('Telegram: set bot token', 'menuTelegramSetToken')
      .addItem('Telegram: refresh chats', 'menuTelegramRefreshChats')
      .addItem('Telegram: send test message to me', 'menuTelegramTest')
      .addSeparator()
      .addItem('Install reminder triggers', 'menuInstallReminderTriggers')
      .addItem('Remove reminder triggers', 'menuRemoveReminderTriggers'))
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
/** Read-only: lists duplicate header text in a raw form response tab's row 1 so HR can clean up the Google Form by hand. */
function menuCheckFormDuplicateColumns() {
  run_('Attendance: check form for duplicate columns', function () {
    var t = ask_('Attendance: check form for duplicate columns',
      'Raw response tab name (e.g. ' + ATT_FORM_DEFS.VFL.rawTab + ' or ' + ATT_FORM_DEFS.PUNE.rawTab + ')');
    if (!t) return null;
    var r = checkAttFormDuplicateColumns_(t);
    if (!r.duplicates.length) return 'No duplicate headers in ' + r.tab + '.';
    return r.duplicates.map(function (d) {
      return d.header + ': appears ' + d.count + ' times, at columns ' + d.columns.join(', ');
    }).join('\n');
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
function menuSyncAdvanceLoans() { run_('Sync advance loans', syncAdvanceLoans); }
function menuAdvanceGenerateRecoveries() { run_('Generate advance recoveries', function () { var p = askPeriod_('Generate advance recoveries'); return p && advanceGenerateRecoveries(p); }); }
function menuSocietyCarryforward() { run_('Generate society carry-forward', function () { var p = askPeriod_('Generate society carry-forward'); return p && societyGenerateCarryforward(p); }); }
function menuAdvanceImportOpening() {
  run_('Advance: import opening balances', function () {
    var text = ask_('Advance: import opening balances', 'Paste one employee per line: EMP_ID, outstanding amount[, monthly instalment]');
    if (!text) return null;
    var parsed = advance_parseImportText(text);
    if (parsed.errors.length) return 'Could not parse:\n' + parsed.errors.join('\n');
    var ledgerRows = readObjects(TABS.ADVANCE_LEDGER);
    var plan = planAdvanceImport(parsed.rows, advance_openEmpSet_(ledgerRows), {});
    if (!plan.ok) {
      var lines = plan.errors.map(function (e) { return 'line ' + e.line + ' ' + e.empId + ': ' + e.reason; });
      return 'Refused - fix these first:\n' + lines.join('\n');
    }
    var preview = plan.toAppend.map(function (v) { return v.empId + ': opening ' + v.outstanding + ', instalment ' + v.instalment; }).join('\n');
    if (!confirm_('Advance: import opening balances', plan.toAppend.length + ' loan(s) will be imported:\n' + preview + '\n\nApply now?')) return 'Cancelled - nothing was imported.';
    return advanceImportOpeningBalances(parsed.rows, {});
  });
}

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
function hrosVersion_() { return typeof HROS_VERSION === 'undefined' ? 'dev' : HROS_VERSION; }
function menuAbout() {
  alert_('About HR OS', 'Version: ' + hrosVersion_() + '\n\nThe Apps Script project must contain only HR_OS.gs and appsscript.json');
}
function bulkExitLines_(list, label) {
  return list.map(function (x) { return '  ' + label + (x.line ? 'line ' + x.line + ': ' : '') + (x.empId ? x.empId + ' ' : '') + (x.lastWorkingDay || '') +
    ((x.reason || x.note) ? ' - ' + (x.reason || x.note) : ''); });
}
function menuEmployeeBulkExit() {
  run_('Bulk mark exits', function () {
    var text = ask_('Bulk mark exits', 'Paste one employee per line: EMP_ID, DD-MM-YYYY (e.g. E101, 31-07-2026)');
    if (!text) return null;
    var pv = empBulkExit(text, false);
    var lines = ['Will mark Non-Active: ' + pv.done.length + ' | skipped: ' + pv.skipped.length + ' | errors: ' + pv.errors.length, '']
      .concat(bulkExitLines_(pv.done, 'OK ')).concat(bulkExitLines_(pv.skipped, 'SKIP ')).concat(bulkExitLines_(pv.errors, 'ERROR '));
    if (!pv.done.length) return lines.join('\n') + '\n\nNothing to apply.';
    if (!confirm_('Bulk mark exits - apply?', lines.join('\n') + '\n\nApply the ' + pv.done.length + ' exit(s) now? Lines with errors are not applied.')) return 'Cancelled - nothing was changed.';
    return empBulkExit(text, true);
  });
}
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
function menuTestPayslip() {
  run_('Send test payslip to me', function () {
    var id = ask_('Send test payslip to me', 'EMP_ID (blank = VFL1001)'); if (id === null) return null;
    var p = ask_('Send test payslip to me', 'PERIOD YYYY-MM (blank = latest draft, else latest locked)'); if (p === null) return null;
    return callStage_('payslipTestSend', 8, [id || 'VFL1001', p || '']);
  });
}
function menuSendEmails() { lockAction_('Send queued emails', 'sendQueuedEmails'); }

// ---- Alerts: status, Telegram, reminder triggers (61_Notify.gs, 62_Reminders.gs)
/** Blank period = the previous calendar month (the month being paid). Shows the same digest the month-end e-mail carries. */
function menuPayrollStatus() {
  run_('Payroll status', function () {
    var def = statusDefaultPeriod(status_todayIso_(), getMinPeriod());
    var p = ask_('Payroll status', 'PERIOD (YYYY-MM); blank = ' + def);
    if (p === null) return null;
    p = p || def;
    guardPeriod_(p);
    return statusDigestText(payrollStatus(p), {}).text;
  });
}
function menuTelegramSetToken() {
  run_('Telegram: set bot token', function () {
    notify_requireOwner_();
    var t = ask_('Telegram: set bot token', 'Paste the bot token from @BotFather (it is stored in Script Properties, not in the sheet)');
    return t ? telegramSetToken(t) : null;
  });
}
function menuTelegramRefreshChats() { run_('Telegram: refresh chats', telegramRefreshChats); }
function menuTelegramTest() { run_('Telegram: send test message', telegramSendTestToMe); }
function menuInstallReminderTriggers() { run_('Install reminder triggers', installReminderTriggers); }
function menuRemoveReminderTriggers() { run_('Remove reminder triggers', removeReminderTriggers); }
