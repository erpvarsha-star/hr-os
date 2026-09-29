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
