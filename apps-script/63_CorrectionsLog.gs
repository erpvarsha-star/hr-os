/**
 * 63_CorrectionsLog.gs - the ONE onEdit simple trigger in this project (Apps Script runs only one; there was none
 * before this file). Logs every edit Sheets lets through on a protected system-only tab to CORRECTIONS_LOG.
 *
 * Because a protected tab can only be edited by one of the three protected editors (HR_APPROVER_EMAIL,
 * OWNER_APPROVER_EMAIL, ACCOUNTS_APPROVER_EMAIL) or the menu actions that run as one of them, this really only logs
 * "who overrode what" by that small set of people - it is the intended audit trail, not a general-purpose edit log.
 *
 * The watch-list is read from hrosTabSpecs_() (02_Setup.gs) so it can never drift from the real protect list; a
 * dedicated test asserts the two stay identical.
 */

/**
 * Pure (sheet access only through readControlMap, wrapped). Every tab name onEdit watches: every hrosTabSpecs_ tab
 * with a protect list (except CORRECTIONS_LOG itself, to avoid logging its own writes), plus the dynamic
 * form-response tabs hrosSetup protects (not in the registry: created by Google Forms, not by setup).
 */
function correctionsLogWatchList_() {
  var out = [];
  hrosTabSpecs_().forEach(function (sp) {
    if (sp.protect && sp.protect.length && sp.name !== TABS.CORRECTIONS_LOG) out.push(sp.name);
  });
  var ctl = {};
  try { ctl = readControlMap(); } catch (e) { ctl = {}; }
  var dyn = HROS_FORM_TABS_INPUT.concat(HROS_FORM_TABS_ATTENDANCE).concat([FEEDS_OT_TAB]);
  var advTab = String(ctl.ADVANCE_FORM_SOURCE_TAB || '').trim();
  if (advTab) dyn.push(advTab);
  dyn.forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); });
  return out;
}

/**
 * The single onEdit simple trigger (Apps Script fires this automatically for any user edit in the Sheets UI; no
 * installation needed, and only one onEdit function may exist project-wide). Entirely wrapped so a logging failure
 * never blocks the user's edit - simple triggers cannot show UI or usefully throw anyway.
 */
function onEdit(e) {
  try {
    if (!e || !e.range || typeof e.range.getSheet !== 'function') return;
    var sheet = e.range.getSheet();
    var name = sheet.getName();
    if (name === TABS.CORRECTIONS_LOG) return;
    if (correctionsLogWatchList_().indexOf(name) < 0) return;
    var userEmail = '';
    try { userEmail = Session.getActiveUser().getEmail(); } catch (e1) { /* ignore */ }
    var oldVal, newVal;
    if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1) {
      oldVal = e.oldValue === undefined ? '' : String(e.oldValue);
      newVal = e.value !== undefined ? String(e.value) : String(e.range.getValue());
    } else {
      // multi-cell paste: e.oldValue is not available for a range; the current values are the best we can show
      oldVal = 'MULTI_CELL_OLD_UNAVAILABLE';
      try { newVal = e.range.getValues().map(function (row) { return row.join(','); }).join(' | '); } catch (e2) { newVal = ''; }
    }
    var log = ensureSheet(TABS.CORRECTIONS_LOG);
    if (!getHeaders(log).length) ensureHeaders(log, CORRECTIONS_LOG_HEADERS);
    appendObjects(log, [{ TIMESTAMP: nowIso_(), SHEET: name, CELL: e.range.getA1Notation(), OLD_VALUE: oldVal,
      NEW_VALUE: newVal, USER_EMAIL: userEmail || 'unknown' }]);
  } catch (err) { /* never block the user's edit */ }
}
