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
      .addItem('Sync days form \u2192 monthly attendance', 'menuSyncDaysForm')
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
/** The single spreadsheet-level onFormSubmit trigger (attendance forms, days form, canteen, efficiency). */
function menuInstallTriggers() { run_('Install triggers', installTriggers); }

function menuPrepareMonth() { run_('Prepare month', function () { var p = askPeriod_('Prepare month'); return p && prepareMonth(p); }); }
function menuPrepareAttendance() { run_('Prepare monthly attendance', function () { var p = askPeriod_('Prepare monthly attendance'); return p && prepareMonthlyAttendance(p); }); }
function menuSyncDaysForm() { run_('Sync days form', function () { var p = askPeriod_('Sync days form'); return p && syncDaysFormToAttendance(p); }); }
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
