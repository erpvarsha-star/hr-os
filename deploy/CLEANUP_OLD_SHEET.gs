/**
 * CLEANUP_OLD_SHEET.gs - ONE-TIME, THROW-AWAY script. Paste it into the Apps Script project bound to the HR OS spreadsheet,
 * run step1_preview (changes nothing), then step2_cleanup, then DELETE this file's contents.
 * It is NOT part of HR_OS.gs. It keeps every Google-Form response tab and removes everything else (after a backup copy).
 * It never touches data inside the tabs it keeps.
 */
var CLEANUP_KEEP_NAMES = ['CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES', 'OT_FORM_RESPONSES'];
var CLEANUP_RENAME_RULES = [
  { target: 'CANTEEN_FORM_RESPONSES', test: function (t) { return /canteen/i.test(t); } },
  { target: 'EFFICIENCY_FORM_RESPONSES', test: function (t) { return /efficiency/i.test(t); } },
  { target: 'OT_FORM_RESPONSES', test: function (t) { return /overtime/i.test(t) || /(^|[^a-z])ot([^a-z]|$)/i.test(t); } }
];
var CLEANUP_TEMP_NAME = '_TEMP';

/**
 * Pure planner (no Google services).
 * @param {{name:string, formUrl:(string|null), formTitle:string, rows:number}[]} sheetInfos
 * @param {{handler:string, type:string}[]} triggerInfos
 */
function cleanup_buildPlan(sheetInfos, triggerInfos) {
  var plan = { keep: [], del: [], renames: [], manual: [], triggers: (triggerInfos || []).slice(), warnings: [], needTemp: false };
  var infos = sheetInfos || [];
  var allNames = {};
  infos.forEach(function (s) { allNames[s.name] = true; });

  infos.forEach(function (s) {
    var linked = !!s.formUrl;
    var named = CLEANUP_KEEP_NAMES.indexOf(s.name) >= 0;
    if (linked || named) {
      plan.keep.push({ name: s.name, formUrl: s.formUrl || null, formTitle: s.formTitle || '', rows: s.rows,
        reason: linked ? 'linked to a Google Form' : 'protected name' });
    } else {
      plan.del.push({ name: s.name, rows: s.rows });
    }
  });

  // zero-sheet guard: a spreadsheet cannot have 0 tabs
  if (!plan.keep.length) {
    plan.warnings.push('No tab linked to a Google Form was found. Everything would be deleted, so a placeholder tab ' + CLEANUP_TEMP_NAME + ' is used.');
    var tmpAt = -1;
    plan.del.forEach(function (d, i) { if (d.name === CLEANUP_TEMP_NAME) tmpAt = i; });
    if (tmpAt >= 0) {
      var t = plan.del.splice(tmpAt, 1)[0];
      plan.keep.push({ name: t.name, formUrl: null, formTitle: '', rows: t.rows, reason: 'placeholder (a spreadsheet needs one tab)' });
    } else {
      plan.needTemp = true;
    }
  }

  // rename proposals: only for form-linked tabs
  var matches = {}; // sheet name -> [targets]
  plan.keep.forEach(function (k) {
    if (!k.formUrl) return;
    var text = (k.formTitle || '') + ' ' + k.name;
    matches[k.name] = CLEANUP_RENAME_RULES.filter(function (r) { return r.test(text); }).map(function (r) { return r.target; });
  });
  CLEANUP_RENAME_RULES.forEach(function (r) {
    var cands = Object.keys(matches).filter(function (n) { return matches[n].indexOf(r.target) >= 0; });
    if (!cands.length) return;
    if (cands.indexOf(r.target) >= 0) return; // already correctly named
    var free = !allNames[r.target];
    var unique = cands.length === 1 && matches[cands[0]].length === 1;
    if (free && unique) plan.renames.push({ from: cands[0], to: r.target });
    else plan.manual.push({ from: cands, to: r.target,
      why: !free ? 'a tab named ' + r.target + ' already exists' : (cands.length > 1 ? 'more than one tab matches' : 'the tab also matches another form name') });
  });

  if (!plan.keep.some(function (k) { return k.formUrl; })) {
    plan.warnings.unshift('WARNING: no form-linked tab found. The form response tabs may already be gone or the forms were unlinked.');
  }
  return plan;
}

/** Plain-text rendering of the plan (used for both the alert and the log). */
function cleanup_formatPlan_(plan) {
  var L = [];
  plan.warnings.forEach(function (w) { L.push(w); });
  if (plan.warnings.length) L.push('');
  L.push('TABS TO KEEP (' + plan.keep.length + '):');
  plan.keep.forEach(function (k) {
    L.push('  + ' + k.name + ' (' + k.rows + ' rows) - ' + k.reason);
    if (k.formUrl) L.push('      form: ' + k.formUrl + (k.formTitle ? '  "' + k.formTitle + '"' : ''));
  });
  L.push('');
  L.push('TABS TO DELETE (' + plan.del.length + '):');
  plan.del.forEach(function (d) { L.push('  - ' + d.name + ' (' + d.rows + ' rows)'); });
  if (!plan.del.length) L.push('  (none)');
  L.push('');
  L.push('RENAMES:');
  plan.renames.forEach(function (r) { L.push('  ' + r.from + '  ->  ' + r.to); });
  plan.manual.forEach(function (m) { L.push('  rename manually: ' + m.from.join(', ') + '  ->  ' + m.to + ' (' + m.why + ')'); });
  if (!plan.renames.length && !plan.manual.length) L.push('  (none)');
  if (plan.needTemp) { L.push(''); L.push('A placeholder tab ' + CLEANUP_TEMP_NAME + ' will be added (HR OS setup removes it later).'); }
  L.push('');
  L.push('TRIGGERS TO DELETE (' + plan.triggers.length + '):');
  plan.triggers.forEach(function (t) { L.push('  - ' + t.handler + ' [' + t.type + ']'); });
  if (!plan.triggers.length) L.push('  (none)');
  L.push('');
  L.push('Named ranges: all will be removed.');
  return L.join('\n');
}

function cleanup_readSheetInfos_(ss) {
  return ss.getSheets().map(function (sh) {
    var url = null, title = '';
    try { url = sh.getFormUrl() || null; } catch (e) { url = null; }
    if (url) {
      try { title = FormApp.openByUrl(url).getTitle() || ''; } catch (e2) { title = ''; }
    }
    return { name: sh.getName(), formUrl: url, formTitle: title, rows: sh.getLastRow() };
  });
}

function cleanup_readTriggerInfos_() {
  return ScriptApp.getProjectTriggers().map(function (t) {
    var type = '';
    try { type = String(t.getEventType()); } catch (e) { type = '?'; }
    return { handler: t.getHandlerFunction(), type: type };
  });
}

function cleanup_plan_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return { ss: ss, plan: cleanup_buildPlan(cleanup_readSheetInfos_(ss), cleanup_readTriggerInfos_()) };
}

/** STEP 1 - changes nothing. */
function step1_preview() {
  var p = cleanup_plan_();
  var text = cleanup_formatPlan_(p.plan);
  Logger.log(text);
  SpreadsheetApp.getUi().alert('CLEAN-UP PREVIEW (nothing has been changed)', text, SpreadsheetApp.getUi().ButtonSet.OK);
  return text;
}

/** STEP 2 - backup, then rename / delete. Returns the report text ('' when aborted). */
function step2_cleanup() {
  var ui = SpreadsheetApp.getUi();
  var p = cleanup_plan_();
  var ss = p.ss, plan = p.plan;
  var text = cleanup_formatPlan_(plan);
  Logger.log(text);

  // (a) confirmation
  var answer = ui.prompt('CONFIRM CLEAN-UP', text + '\n\nType DELETE (capital letters) and press OK to continue. Anything else cancels.', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK || String(answer.getResponseText()).trim() !== 'DELETE') {
    Logger.log('Aborted: DELETE was not typed. Nothing was changed.');
    ui.alert('Cancelled', 'DELETE was not typed. Nothing was changed.', ui.ButtonSet.OK);
    return '';
  }

  // (b) backup copy, abort everything on failure
  var backupUrl;
  try {
    var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm') + ' IST';
    var copy = DriveApp.getFileById(ss.getId()).makeCopy('HR OS backup before rebuild ' + stamp);
    backupUrl = copy.getUrl();
    if (!backupUrl) throw new Error('the copy has no URL');
  } catch (e) {
    var msg = 'The backup copy FAILED, so NOTHING was deleted or changed. Reason: ' + (e && e.message ? e.message : e);
    Logger.log(msg);
    ui.alert('Backup failed - stopped', msg, ui.ButtonSet.OK);
    return '';
  }
  Logger.log('Backup: ' + backupUrl);
  ui.alert('Backup made', 'Backup copy (keep this link):\n' + backupUrl, ui.ButtonSet.OK);

  var errors = [], renamed = [], deleted = 0, triggersDeleted = 0, namedRemoved = 0;

  // (c) never leave zero sheets
  if (plan.needTemp) {
    try { ss.insertSheet(CLEANUP_TEMP_NAME); } catch (e1) { errors.push('could not add ' + CLEANUP_TEMP_NAME + ': ' + (e1 && e1.message ? e1.message : e1)); }
  }

  // (d) renames
  plan.renames.forEach(function (r) {
    try {
      var sh = ss.getSheetByName(r.from);
      if (!sh) throw new Error('tab not found');
      sh.setName(r.to);
      renamed.push(r.from + ' -> ' + r.to);
    } catch (e2) { errors.push('rename ' + r.from + ': ' + (e2 && e2.message ? e2.message : e2)); }
  });

  // (e) delete tabs (skip any that cannot be deleted)
  plan.del.forEach(function (d) {
    try {
      var sh2 = ss.getSheetByName(d.name);
      if (!sh2) throw new Error('tab not found');
      ss.deleteSheet(sh2);
      deleted++;
    } catch (e3) { errors.push('delete ' + d.name + ': ' + (e3 && e3.message ? e3.message : e3)); }
  });

  // (f) all triggers of this script project
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      try { ScriptApp.deleteTrigger(t); triggersDeleted++; } catch (e4) { errors.push('trigger ' + t.getHandlerFunction() + ': ' + (e4 && e4.message ? e4.message : e4)); }
    });
  } catch (e5) { errors.push('triggers: ' + (e5 && e5.message ? e5.message : e5)); }

  // (g) named ranges
  try {
    ss.getNamedRanges().forEach(function (nr) {
      try { nr.remove(); namedRemoved++; } catch (e6) { errors.push('named range: ' + (e6 && e6.message ? e6.message : e6)); }
    });
  } catch (e7) { errors.push('named ranges: ' + (e7 && e7.message ? e7.message : e7)); }

  // (h) report
  var keptNames = ss.getSheets().map(function (s) { return s.getName(); });
  var report = [
    'CLEAN-UP FINISHED',
    'Backup copy: ' + backupUrl,
    'Tabs now in the sheet: ' + keptNames.join(', '),
    'Tabs deleted: ' + deleted,
    'Renamed: ' + (renamed.length ? renamed.join('; ') : 'none'),
    'Triggers deleted: ' + triggersDeleted,
    'Named ranges removed: ' + namedRemoved,
    'Errors: ' + (errors.length ? '\n  ' + errors.join('\n  ') : 'none'),
    '',
    'Triggers installed by other people are not visible to you — each of them must open Extensions ▸ Apps Script ▸ Triggers and delete theirs.'
  ].join('\n');
  Logger.log(report);
  ui.alert('Clean-up report', report, ui.ButtonSet.OK);
  return report;
}
