/**
 * ORGANISE_TABS.gs - ONE-TIME, THROW-AWAY script. Paste it into the Apps Script project bound to the HR OS spreadsheet
 * as an extra file named ORGANISE_TABS, run organiseTabs_step1_preview (changes nothing), then organiseTabs_step2_apply,
 * then DELETE the file. It is NOT part of HR_OS.gs and does not depend on it.
 * It only reorders tabs and sets tab colours. It never deletes or renames a tab, never changes hidden state, and never
 * touches protections, data or formulas. Running it twice gives the same result.
 *
 * Groups, in tab order, with tab colour:
 *   1. Control & setup            #607D8B  slate grey
 *   2. Masters                    #1E88E5  blue
 *   3. Attendance                 #00ACC1  teal
 *   4. Monthly inputs             #43A047  green
 *   5. Form responses (raw)       #FB8C00  orange
 *   6. Payroll run                #8E24AA  purple
 *   7. Payslips                   #EC407A  pink
 *   8. Locked & audit             #C62828  dark red
 *   9. Not recognised (at the end) no colour
 * The table below was derived from hrosTabSpecs_() (apps-script/02_Setup.gs); a test keeps the two in step.
 */
var ORGTABS_GROUPS = [
  { key: 'CONTROL', label: 'Control & setup', color: '#607D8B',
    tabs: ['PAYROLL_CONTROL', 'PAYROLL_PERIOD_CATEGORY', 'FEED_STATUS', 'PAYROLL_CATEGORY_CONFIG', 'STATUTORY_CONFIG', 'EFFICIENCY_CONFIG', 'PT_EXEMPTIONS', 'HOLIDAY_CALENDAR'] },
  { key: 'MASTERS', label: 'Masters', color: '#1E88E5',
    tabs: ['EMPLOYEE_MASTER', 'SALARY_STRUCTURE', 'PAYROLL_RATE_PROFILE', 'EMPLOYEE_STATUTORY_IDS'] },
  { key: 'ATTENDANCE', label: 'Attendance', color: '#00ACC1',
    tabs: ['INPUT_ATTENDANCE', 'ATTENDANCE_DAILY', 'ATTENDANCE_COMPARISON'] },
  { key: 'INPUTS', label: 'Monthly inputs', color: '#43A047',
    tabs: ['INPUT_LEAVE', 'INPUT_OT', 'INPUT_CANTEEN', 'INPUT_EFFICIENCY', 'INPUT_ADVANCE', 'INPUT_SOCIETY', 'INPUT_ADJUSTMENTS'] },
  { key: 'FORMS', label: 'Form responses (raw, do not edit)', color: '#FB8C00',
    tabs: ['ATT_FORM_VFL_RAW', 'ATT_FORM_PUNE_RAW', 'ATT_MONTHLY_VFL_RAW', 'ATT_MONTHLY_PUNE_RAW', 'OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'] },
  { key: 'PAYROLL', label: 'Payroll run', color: '#8E24AA',
    // extra category output tabs (PAYROLL_<CODE>) are slotted in after PAYROLL_PUNE_STAFF
    tabs: ['PAYROLL_READINESS', 'PAYROLL_DRAFT', 'PAYROLL_STAFF', 'PAYROLL_WORKER', 'PAYROLL_CONSULTANT', 'PAYROLL_PUNE_STAFF', '@EXTRA_CATEGORY_TABS', 'PAYROLL_EXCEPTIONS', 'PAYROLL_RECON', 'PAYROLL_SUPPLEMENTARY'] },
  { key: 'PAYSLIPS', label: 'Payslips', color: '#EC407A',
    tabs: ['PAYSLIP_REGISTER', 'PAYSLIP_EMAIL_LOG'] },
  { key: 'AUDIT', label: 'Locked & audit', color: '#C62828',
    tabs: ['PAYROLL_LOCKED', 'AUDIT_LOG', 'TELEGRAM_CHATS'] }
];
var ORGTABS_UNKNOWN_LABEL = 'Not recognised - review/delete by hand';
var ORGTABS_EXTRA_MARK = '@EXTRA_CATEGORY_TABS';

/**
 * Pure planner (no Google services).
 * @param {string[]} currentNames tab names in their current order
 * @param {string[]} formLinkedNames tabs (from currentNames) that are linked to a Google Form
 * @param {string[]=} extraPayrollNames extra category output tab names (PAYROLL_<CODE>) read from PAYROLL_CATEGORY_CONFIG
 * @return {{order:{name:string,group:string,color:(string|null)}[], unknown:string[]}}
 */
function organiseTabs_plan(currentNames, formLinkedNames, extraPayrollNames) {
  var cur = (currentNames || []).slice();
  var have = {};
  cur.forEach(function (n) { have[n] = true; });
  var linked = {};
  (formLinkedNames || []).forEach(function (n) { linked[n] = true; });
  var known = {};
  ORGTABS_GROUPS.forEach(function (g) { g.tabs.forEach(function (n) { known[n] = true; }); });
  var extra = [];
  (extraPayrollNames || []).forEach(function (n) { if (have[n] && !known[n] && extra.indexOf(n) < 0) { extra.push(n); known[n] = true; } });

  var order = [];
  var placed = {};
  ORGTABS_GROUPS.forEach(function (g) {
    var names = [];
    g.tabs.forEach(function (n) {
      if (n === ORGTABS_EXTRA_MARK) { extra.forEach(function (x) { names.push(x); }); return; }
      names.push(n);
    });
    if (g.key === 'FORMS') {
      cur.forEach(function (n) { if (!known[n] && linked[n]) names.push(n); });
    }
    names.forEach(function (n) {
      if (have[n] && !placed[n]) { placed[n] = true; order.push({ name: n, group: g.label, color: g.color }); }
    });
  });
  var unknown = [];
  cur.forEach(function (n) {
    if (!placed[n]) { placed[n] = true; unknown.push(n); order.push({ name: n, group: ORGTABS_UNKNOWN_LABEL, color: null }); }
  });
  return { order: order, unknown: unknown };
}

/** Reads the live spreadsheet and builds the plan. */
function orgTabs_gather_(ss) {
  var sheets = ss.getSheets();
  var names = sheets.map(function (s) { return s.getName(); });
  var linked = [];
  sheets.forEach(function (s) {
    try { if (s.getFormUrl()) linked.push(s.getName()); } catch (e) { /* no form info: treat as not linked */ }
  });
  var extra = [];
  try {
    var cfg = ss.getSheetByName('PAYROLL_CATEGORY_CONFIG');
    if (cfg && cfg.getLastRow() > 1) {
      var vals = cfg.getRange(1, 1, cfg.getLastRow(), Math.max(1, cfg.getLastColumn())).getValues();
      var col = vals[0].map(function (h) { return String(h).trim(); }).indexOf('CATEGORY_CODE');
      if (col >= 0) {
        for (var i = 1; i < vals.length; i++) {
          var code = String(vals[i][col] == null ? '' : vals[i][col]).trim();
          if (code) extra.push(('PAYROLL_' + code).slice(0, 100));
        }
      }
    }
  } catch (e2) { /* config unreadable: only the default category tabs are placed in the payroll group */ }
  return { sheets: sheets, names: names, plan: organiseTabs_plan(names, linked, extra) };
}

/** Plain-text rendering of the plan (used for both the alert and the log). */
function orgTabs_format_(plan) {
  var L = [];
  var lastGroup = null, n = 0;
  plan.order.forEach(function (o) {
    if (o.group !== lastGroup) { lastGroup = o.group; L.push(''); L.push(o.group + (o.color ? ' (' + o.color + ')' : ' (no colour)') + ':'); }
    n++;
    L.push('  ' + n + '. ' + o.name);
  });
  L.push('');
  if (plan.unknown.length) {
    L.push('NOT RECOGNISED - review/delete by hand (' + plan.unknown.length + '). They go to the end with no colour:');
    plan.unknown.forEach(function (u) { L.push('  ' + u); });
  } else {
    L.push('No unrecognised tabs.');
  }
  return L.join('\n').replace(/^\n/, '');
}

function orgTabs_alert_(title, text) {
  try { SpreadsheetApp.getUi().alert(title, text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* no UI (e.g. run from a trigger) */ }
}

/** STEP 1: shows the planned order and colours. Changes nothing. */
function organiseTabs_step1_preview() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var g = orgTabs_gather_(ss);
  var text = orgTabs_format_(g.plan);
  Logger.log(text);
  orgTabs_alert_('Tab organiser - PREVIEW (nothing changed)', text);
  return g.plan;
}

/** STEP 2: applies the order and the colours. */
function organiseTabs_step2_apply() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var g = orgTabs_gather_(ss);
  var plan = g.plan;
  var byName = {};
  g.sheets.forEach(function (s) { byName[s.getName()] = s; });
  var original = null;
  try { original = ss.getActiveSheet(); } catch (e) { original = null; }

  var cur = g.names.slice();
  var moved = 0, recoloured = 0, errors = [];
  plan.order.forEach(function (o, i) {
    var sh = byName[o.name];
    if (cur[i] !== o.name) {
      var wasHidden = false;
      try {
        wasHidden = sh.isSheetHidden();
        if (wasHidden) sh.showSheet(); // a hidden tab cannot be activated; hidden state is restored right after
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(i + 1);
        cur.splice(cur.indexOf(o.name), 1);
        cur.splice(i, 0, o.name);
        moved++;
      } catch (e) {
        errors.push('move ' + o.name + ': ' + e);
      }
      try { if (wasHidden) sh.hideSheet(); } catch (e2) { errors.push('re-hide ' + o.name + ': ' + e2); }
    }
    try {
      var want = o.color ? o.color.toLowerCase() : null;
      var have = sh.getTabColor();
      have = have ? String(have).toLowerCase() : null;
      if (have !== want) { sh.setTabColor(o.color); recoloured++; }
    } catch (e3) {
      errors.push('colour ' + o.name + ': ' + e3);
    }
  });
  try { if (original) ss.setActiveSheet(original); } catch (e4) { /* best effort */ }

  var summary = 'Tabs: ' + plan.order.length + '. Moved: ' + moved + '. Recoloured: ' + recoloured + '.' +
    (plan.unknown.length ? '\nNot recognised (left at the end, no colour): ' + plan.unknown.join(', ') : '') +
    (errors.length ? '\nErrors:\n  ' + errors.join('\n  ') : '') +
    (moved === 0 && recoloured === 0 && !errors.length ? '\nNothing to change - already organised.' : '') +
    '\nYou can now delete this ORGANISE_TABS file.';
  Logger.log(summary);
  orgTabs_alert_('Tab organiser - done', summary);
  return { moved: moved, recoloured: recoloured, unknown: plan.unknown.slice(), errors: errors };
}
