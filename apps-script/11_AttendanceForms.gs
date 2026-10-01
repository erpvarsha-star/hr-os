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

/** Every form the create / refresh menu actions manage: the two daily forms and the two monthly days-present forms. */
function attAllFormJobs_() {
  var jobs = [];
  Object.keys(ATT_FORM_DEFS).forEach(function (k) { jobs.push({ key: k, def: ATT_FORM_DEFS[k], monthly: false }); });
  Object.keys(ATT_MONTHLY_FORM_DEFS).forEach(function (k) { jobs.push({ key: 'MONTHLY_' + k, def: ATT_MONTHLY_FORM_DEFS[k], monthly: true }); });
  return jobs;
}

function createAttendanceForms() {
  var ss = getSpreadsheet_();
  var roster = buildRoster(undefined, { asOf: nowIso_().slice(0, 10) });
  var res = { created: [], skipped: [], notes: [] };
  attAllFormJobs_().forEach(function (job) {
    var k = job.key, def = job.def;
    if (String(getControl(def.idKey, '')).trim()) { res.skipped.push(k + ' (form id already in PAYROLL_CONTROL)'); return; }
    var before = sheetNames_(ss);
    var form = job.monthly ? buildMonthlyAttendanceForm_(def, withoutAutoAttendance_(roster, autoFullAttendanceIdSet_())) : buildAttendanceForm_(def, roster);
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
  attAllFormJobs_().forEach(function (job) {
    var k = job.key, def = job.def;
    var id = String(getControl(def.idKey, '')).trim();
    if (!id) { res.skipped.push(k + ' (no form id)'); return; }
    var form = FormApp.openById(id);
    if (job.monthly) { refreshMonthlyForm_(k, def, form, withoutAutoAttendance_(roster, autoFullAttendanceIdSet_()), res); return; }
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
  ATT_MONTHLY_VFL_RAW: 'ATT_MONTHLY_VFL',
  ATT_MONTHLY_PUNE_RAW: 'ATT_MONTHLY_PUNE',
  CANTEEN_FORM_RESPONSES: 'CANTEEN',
  EFFICIENCY_FORM_RESPONSES: 'EFFICIENCY',
  OT_FORM_RESPONSES: 'OT'
};

/**
 * Pure. otTabName = the local OT source tab currently in use (e.g. a renamed response tab), or '' when none.
 * advTabName = the local Advance/Loan source tab currently in use (22_Advance.gs), or '' when none.
 */
function routeFormSubmit(sheetName, otTabName, advTabName) {
  var n = String(sheetName == null ? '' : sheetName).trim();
  if (Object.prototype.hasOwnProperty.call(HROS_FORM_ROUTES, n)) return HROS_FORM_ROUTES[n];
  if (n && otTabName && n === String(otTabName).trim()) return 'OT';
  if (n && advTabName && n === String(advTabName).trim()) return 'ADVANCE_LOAN';
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
  var route = routeFormSubmit(name, feeds_localOtTabName_(), advance_sourceTabName_());
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
    if (route === 'ATT_MONTHLY_VFL' || route === 'ATT_MONTHLY_PUNE') {
      var mrow = e.range.getRow(), mlc = sheet.getLastColumn();
      var mh = sheet.getRange(1, 1, 1, mlc).getValues()[0];
      var mv = sheet.getRange(mrow, 1, 1, mlc).getValues()[0];
      return processMonthlyAttendanceSubmit_(parseMonthlyAttendanceRow(mh, mv), e, name + '!' + mrow, route === 'ATT_MONTHLY_PUNE' ? SITE_PUNE : SITE_VFL);
    }
    if (route === 'OT') {
      var otPeriod = feeds_otPeriodOfRow_(sheet, e.range.getRow());
      if (!otPeriod) { audit('OT_SUBMIT_SKIPPED', '', '', 'OT date not found or outside the payroll periods'); return null; }
      return syncOtFromForm(otPeriod);
    }
    if (route === 'ADVANCE_LOAN') return syncAdvanceLoans();
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
  var all = ScriptApp.getProjectTriggers().map(function (t) { return { handler: t.getHandlerFunction() }; });
  // the optional alert triggers (62_Reminders.gs) are checked against the platform limit of 20, not this cap of 5
  var alertNames = typeof REMINDER_HANDLERS === 'undefined' ? [] : Object.keys(REMINDER_HANDLERS);
  var existing = all.filter(function (t) { return alertNames.indexOf(t.handler) < 0; });
  var plan = planFormSubmitTrigger(existing, ATT_MAX_TRIGGERS);
  if (plan.create) {
    ScriptApp.newTrigger(HROS_SUBMIT_HANDLER).forSpreadsheet(getSpreadsheet_()).onFormSubmit().create();
  }
  var res = { created: plan.create ? 1 : 0, alreadyPresent: plan.present, totalTriggers: all.length + (plan.create ? 1 : 0),
    note: plan.present > 1 ? 'more than one ' + HROS_SUBMIT_HANDLER + ' trigger exists - ask the owner to remove the extra ones' : '' };
  audit('TRIGGERS_INSTALL', '', '', res);
  return res;
}

// ================================================================ monthly days-present forms (feed registerApply_)

var ATT_MONTHLY_FORM_DEFS = {
  VFL: { site: 'VFL', title: 'Monthly Attendance – VFL Waluj', idKey: 'ATT_MONTHLY_VFL_ID', rawTab: 'ATT_MONTHLY_VFL_RAW' },
  PUNE: { site: 'PUNE', title: 'Monthly Attendance – Pune', idKey: 'ATT_MONTHLY_PUNE_ID', rawTab: 'ATT_MONTHLY_PUNE_RAW' }
};
var ATT_MONTHLY_DESCRIPTION = 'Enter DAYS PRESENT for the month per employee (0 to days in month, halves like 25.5 allowed). ' +
  'Leave, weekly offs and holidays are added automatically. Leave a box blank if not ready; you can submit again later - only filled boxes are saved.';
var ATT_MONTHLY_PERIOD_TITLE = 'Payroll month';
var ATT_MONTHLY_MODE_PREFIX = 'Days present for ';
var ATT_MONTHLY_MODE_SUFFIX = ' counted';
var ATT_MONTHLY_EXCL = 'Excluding weekly offs';
var ATT_MONTHLY_INCL = 'Including weekly offs';
var ATT_MONTHLY_SECTION_PREFIX = 'Department – ';
var ATT_MONTHLY_REMARKS_TITLE = 'Remarks';

function monthlyPopulations_(def) { return populationsOfSite(def.site); }

function monthlyModeTitle_(pop) {
  var e = categoryEntry(pop);
  return ATT_MONTHLY_MODE_PREFIX + (e ? e.displayName : pop) + ATT_MONTHLY_MODE_SUFFIX;
}

/** Periods HR can still enter: >= the minimum period with at least one population not LOCKED (latest first). Fallback: this and last month. */
function monthlyOpenPeriods_() {
  var min = getMinPeriod(), open = {};
  try {
    if (getSheet(TABS.PAYROLL_PERIOD_CATEGORY)) {
      readObjects(TABS.PAYROLL_PERIOD_CATEGORY).forEach(function (r) {
        var p = normalizePeriod(r.PAYROLL_MONTH);
        if (!p || p < min) return;
        if (String(r.STATUS == null ? '' : r.STATUS).trim().toUpperCase() !== PERIOD_STATUS.LOCKED) open[p] = true;
      });
    }
  } catch (err) { open = {}; }
  var list = Object.keys(open);
  if (!list.length) {
    var now = new Date(), cur = normalizePeriod(new Date(now.getFullYear(), now.getMonth(), 1));
    var prev = normalizePeriod(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    list = [cur, prev].filter(function (p) { return p && p >= min; });
    if (!list.length) list = [min];
  }
  return list.sort().reverse();
}

function attMonthlyTextItem_(form, label) {
  var v = FormApp.createTextValidation().requireNumberBetween(0, 31).setHelpText('0 to 31, halves allowed').build();
  return form.addTextItem().setTitle(label).setRequired(false).setValidation(v);
}

function attMonthlySection_(form, dept, labels) {
  form.addPageBreakItem().setTitle(ATT_MONTHLY_SECTION_PREFIX + dept);
  labels.forEach(function (l) { attMonthlyTextItem_(form, l); });
}

function attMonthlyModeItem_(form, pop) {
  return form.addMultipleChoiceItem().setTitle(monthlyModeTitle_(pop)).setChoiceValues([ATT_MONTHLY_EXCL, ATT_MONTHLY_INCL]).setRequired(true);
}

function buildMonthlyAttendanceForm_(def, roster) {
  var form = FormApp.create(def.title);
  // VERIFIED = signed-in Google account; a typed-in email would let anyone pose as HR.
  if (typeof form.setEmailCollectionType === 'function' && typeof FormApp.EmailCollectionType !== 'undefined') {
    form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  } else {
    form.setCollectEmail(true);
  }
  form.setDescription(ATT_MONTHLY_DESCRIPTION);
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.addListItem().setTitle(ATT_MONTHLY_PERIOD_TITLE).setChoiceValues(monthlyOpenPeriods_()).setRequired(true);
  var pops = monthlyPopulations_(def);
  pops.forEach(function (pop) { attMonthlyModeItem_(form, pop); });
  var groups = groupRosterByDepartment(roster, pops);
  Object.keys(groups).sort().forEach(function (d) { attMonthlySection_(form, d, groups[d]); });
  form.addParagraphTextItem().setTitle(ATT_MONTHLY_REMARKS_TITLE).setRequired(false);
  return form;
}

/** Reads the layout of a monthly form: section page breaks, employee items, the Remarks item. */
function attMonthlyLayout_(form) {
  var items = form.getItems(), L = { sections: {}, emps: [], remarksIdx: items.length, firstBreak: items.length, modeTitles: {}, count: items.length };
  var cur = null;
  items.forEach(function (it, i) {
    var t = it.getType(), title = it.getTitle();
    if (t === FormApp.ItemType.PAGE_BREAK) {
      if (L.firstBreak === items.length) L.firstBreak = i;
      if (title.indexOf(ATT_MONTHLY_SECTION_PREFIX) === 0) {
        cur = title.slice(ATT_MONTHLY_SECTION_PREFIX.length);
        L.sections[cur] = { breakItem: it, breakIdx: i, endIdx: items.length, count: 0 };
      }
    } else if (t === FormApp.ItemType.PARAGRAPH_TEXT && title === ATT_MONTHLY_REMARKS_TITLE) {
      L.remarksIdx = i;
    } else if (t === FormApp.ItemType.TEXT) {
      var pr = parseRowLabel(title);
      if (pr) { L.emps.push({ item: it, empId: pr.empId, dept: cur }); if (cur && L.sections[cur]) L.sections[cur].count++; }
    } else if (t === FormApp.ItemType.MULTIPLE_CHOICE) L.modeTitles[title] = true;
  });
  var names = Object.keys(L.sections).sort(function (a, b) { return L.sections[a].breakIdx - L.sections[b].breakIdx; });
  names.forEach(function (n, j) { L.sections[n].endIdx = j + 1 < names.length ? L.sections[names[j + 1]].breakIdx : L.remarksIdx; });
  return L;
}

/** Month choices rebuilt; new roster employees added to their department section (created if needed); employees no longer on the roster removed. */
function refreshMonthlyForm_(k, def, form, roster, res) {
  var pops = monthlyPopulations_(def), groups = groupRosterByDepartment(roster, pops);
  var want = {};
  Object.keys(groups).forEach(function (d) { groups[d].forEach(function (l) { want[parseRowLabel(l).empId] = d; }); });
  form.getItems(FormApp.ItemType.LIST).forEach(function (it) {
    if (it.getTitle() === ATT_MONTHLY_PERIOD_TITLE) it.asListItem().setChoiceValues(monthlyOpenPeriods_());
  });
  var L = attMonthlyLayout_(form);
  pops.forEach(function (pop) {
    if (L.modeTitles[monthlyModeTitle_(pop)]) return;
    var it = attMonthlyModeItem_(form, pop);
    if (L.firstBreak < form.getItems().length - 1) form.moveItem(it.getIndex(), L.firstBreak);
    L = attMonthlyLayout_(form);
  });
  var have = {};
  L.emps.forEach(function (x) {
    if (want[x.empId] === undefined) { form.deleteItem(x.item); res.removed.push(k + ':' + x.empId); } else have[x.empId] = true;
  });
  Object.keys(groups).sort().forEach(function (d) {
    groups[d].forEach(function (label) {
      var id = parseRowLabel(label).empId;
      if (have[id]) return;
      have[id] = true;
      var lay = attMonthlyLayout_(form);
      if (lay.sections[d]) {
        var item = attMonthlyTextItem_(form, label);
        if (lay.sections[d].endIdx < lay.count) form.moveItem(item.getIndex(), lay.sections[d].endIdx);
      } else {
        attMonthlySection_(form, d, [label]);
        var after = attMonthlyLayout_(form);
        if (after.remarksIdx < after.count - 1) {
          var rem = form.getItems()[after.remarksIdx];
          form.moveItem(rem.getIndex(), after.count - 1);
        }
      }
      res.added.push(k + ':' + id);
    });
  });
  // sections left without employees are dropped (their page break only)
  var fin = attMonthlyLayout_(form);
  Object.keys(fin.sections).forEach(function (d) { if (!fin.sections[d].count) form.deleteItem(fin.sections[d].breakItem); });
  res.updated.push(k);
}

/**
 * Pure. One row of a monthly response tab -> {email, period, includesWO:{POP:'Y'|'N'}, entries:[{empId, days}], remarks, errors:[]}.
 * Only non-blank number cells whose header parses as "EMP_ID – Name" become entries.
 */
function parseMonthlyAttendanceRow(headers, values) {
  var out = { email: '', period: '', includesWO: {}, entries: [], remarks: '', errors: [] };
  var cats = categoryList();
  (headers || []).forEach(function (h, i) {
    var title = String(h == null ? '' : h).trim(), v = values[i];
    var sv = v == null ? '' : (typeof v === 'string' ? v.trim() : v);
    var low = title.toLowerCase();
    if (low === 'email address' || low === 'email') { out.email = String(sv).trim(); return; }
    if (title === ATT_MONTHLY_PERIOD_TITLE) { out.period = normalizePeriod(sv); return; }
    if (title === ATT_MONTHLY_REMARKS_TITLE) { out.remarks = String(sv); return; }
    if (title.indexOf(ATT_MONTHLY_MODE_PREFIX) === 0 && title.slice(-ATT_MONTHLY_MODE_SUFFIX.length) === ATT_MONTHLY_MODE_SUFFIX) {
      var nm = title.slice(ATT_MONTHLY_MODE_PREFIX.length, title.length - ATT_MONTHLY_MODE_SUFFIX.length).trim().toLowerCase();
      cats.forEach(function (c) {
        if (c.displayName.toLowerCase() === nm || c.code.toLowerCase() === nm) {
          out.includesWO[c.code] = String(sv).trim().toLowerCase() === ATT_MONTHLY_INCL.toLowerCase() ? 'Y' : 'N';
        }
      });
      return;
    }
    var pr = parseRowLabel(title);
    if (pr && sv !== '') out.entries.push({ empId: pr.empId, days: sv });
  });
  if (!out.period) out.errors.push('Payroll month is missing or not recognised');
  return out;
}

/** Pure. Plain-text result mail. out = {ok, period, reason, res}. */
function monthlyResultEmail_(out) {
  var lines = [], r = out.res || {};
  function ids(a) { a = a || []; return a.length + (a.length ? ' (' + a.slice(0, 30).join(', ') + (a.length > 30 ? ', ...' : '') + ')' : ''); }
  if (out.ok) {
    lines.push('Monthly attendance for ' + out.period + ' was saved (as PENDING attendance rows; HR still approves them per group).');
    lines.push('Created: ' + r.created + ', updated: ' + r.updated);
    lines.push('Not entered (blank): ' + ids(r.notEntered));
    lines.push('Skipped, already APPROVED: ' + ids(r.skippedApproved));
    lines.push('Skipped, period LOCKED: ' + ids(r.skippedLocked));
    if ((r.skippedDuplicateRows || []).length) lines.push('Skipped, duplicate attendance rows: ' + ids(r.skippedDuplicateRows));
    if ((r.exceptions || []).length) {
      lines.push('', 'Exceptions:');
      r.exceptions.forEach(function (x) { lines.push('  ' + x.EMP_ID + ': ' + x.code + ' - ' + x.message); });
    }
    if ((r.warnings || []).length) {
      lines.push('', 'Warnings:');
      r.warnings.forEach(function (x) { lines.push('  ' + x.EMP_ID + ': ' + x.code + ' - ' + x.message); });
    }
  } else {
    lines.push('Monthly attendance' + (out.period ? ' for ' + out.period : '') + ' was NOT saved. Nothing was written.', '', 'Reason: ' + out.reason);
    lines.push('', 'Fix the entries and submit the form again.');
  }
  return { subject: 'HR OS – monthly attendance ' + (out.period || '') + ' – ' + (out.ok ? 'saved' : 'NOT saved'), body: lines.join('\n') };
}

/** Authorises the respondent, applies the entries through registerApply_ (all-or-nothing), audits and mails the result. Never throws for a bad submission. */
function processMonthlyAttendanceSubmit_(parsed, e, sourceRef, formSite) {
  var email = String(parsed.email || '').trim();
  if (!email) { try { email = String(e.response.getRespondentEmail() || '').trim(); } catch (x) { email = ''; } }
  var out = { ok: false, period: parsed.period, reason: '', res: null, email: email };
  if (!email) out.reason = 'Respondent email not available (form must collect verified email addresses)';
  else {
    var ctl = readControlMap();
    var mine = registerAllowedSites(email, ctl);
    var sites = mine === 'ALL' ? [formSite] : mine.filter(function (s) { return s === formSite; });
    if (!sites.length) {
      out.reason = 'Not allowed: ' + email + ' may not enter attendance for site ' + formSite +
        ' (needs HR_APPROVER_EMAIL, OWNER_APPROVER_EMAIL, REGISTER_ENTRY_EMAILS or REGISTER_ENTRY_EMAILS_' + formSite + ')';
    } else if (parsed.errors.length) out.reason = parsed.errors.join('; ');
    else {
      try {
        out.res = registerApply_(parsed.period, parsed.includesWO, parsed.entries, email, sites);
        out.ok = true;
      } catch (err) { out.reason = String(err && err.message ? err.message : err); }
    }
  }
  var r = out.res || {};
  var detail = { by: email, source: sourceRef, ok: out.ok, reason: out.reason, remarks: parsed.remarks };
  if (out.ok) {
    detail.created = r.created; detail.updated = r.updated; detail.notEntered = (r.notEntered || []).length;
    detail.skippedApproved = (r.skippedApproved || []).length; detail.skippedLocked = (r.skippedLocked || []).length;
    detail.exceptions = (r.exceptions || []).map(function (x) { return x.EMP_ID + ':' + x.code; });
  }
  try { audit('ATT_MONTHLY_FORM_SUBMIT', parsed.period || '', '', detail); } catch (x2) { /* ignore */ }
  if (!email) { try { audit('ATT_MONTHLY_MAIL_SKIPPED', parsed.period || '', '', 'no respondent email'); } catch (x3) { /* ignore */ } }
  else {
    try {
      var m = monthlyResultEmail_(out);
      MailApp.sendEmail({ to: email, subject: m.subject, body: m.body });
    } catch (mailErr) {
      try { audit('ATT_MONTHLY_MAIL_FAILED', parsed.period || '', '', String(mailErr && mailErr.message ? mailErr.message : mailErr)); } catch (x4) { /* ignore */ }
    }
  }
  return out;
}
