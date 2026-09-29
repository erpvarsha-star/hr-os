/**
 * 10_Attendance.gs - attendance logic. Pure functions first (Node-testable), sheet-touching entry points after.
 * Dates are ISO strings 'YYYY-MM-DD'. Roster entries: {EMP_ID, PAYROLL_CATEGORY, SITE, DOJ ('' or ISO)}.
 */
var ATT_NUM_FIELDS = ['PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS'];

// ================================================================ pure

function attNum_(v) {
  if (v === '' || v == null) return 0;
  var n = Number(v);
  return isNaN(n) ? NaN : n;
}

function attEntryTime_(v) {
  if (v == null || v === '') return 0;
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  var t = Date.parse(String(v));
  return isNaN(t) ? 0 : t;
}

/** Parse DOJ. Date/ISO exact. dd/mm/yyyy: if ambiguous (both parts <= 12) take the EARLIER reading
 * (excludes fewer days -> more missing-date flags -> fail closed). Unparseable -> ''. */
function parseDoj(v) {
  if (v == null || v === '') return '';
  var iso = toIsoDate(v);
  if (iso) return iso;
  var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(v).trim());
  if (!m) return '';
  var a = +m[1], b = +m[2], y = +m[3];
  var cands = [];
  if (b >= 1 && b <= 12 && a >= 1 && a <= 31) cands.push(y + '-' + pad2_(b) + '-' + pad2_(a)); // dd/mm
  if (a >= 1 && a <= 12 && b >= 1 && b <= 31) cands.push(y + '-' + pad2_(a) + '-' + pad2_(b)); // mm/dd
  if (!cands.length) return '';
  cands.sort();
  return cands[0];
}

/**
 * Roster rule for joiners: is an employee with this DOJ_AS_SOURCE on the roster of a period ending at endIso?
 * Date / ISO are exact. dd/mm/yyyy is read as day-first; when the day-first and month-first readings would give
 * DIFFERENT answers (e.g. 03/10/2026 for a September run) the employee is INCLUDED with warn = 'AMBIGUOUS'.
 * Blank -> included, no warning. Non-blank but unparseable -> included, warn = 'UNPARSEABLE'.
 * @returns {{include:boolean, warn:string}}
 */
function dojRosterDecision(v, endIso) {
  if (v == null || v === '') return { include: true, warn: '' };
  var iso = toIsoDate(v);
  if (iso) return { include: iso <= endIso, warn: '' };
  var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(v).trim());
  if (!m) return { include: true, warn: 'UNPARSEABLE' };
  var a = +m[1], b = +m[2], y = +m[3];
  var real = function (yy, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(yy, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 ? yy + '-' + pad2_(mo) + '-' + pad2_(d) : '';
  };
  var cands = [];
  [real(y, b, a), real(y, a, b)].forEach(function (c) { if (c && cands.indexOf(c) < 0) cands.push(c); });
  if (!cands.length) return { include: true, warn: 'UNPARSEABLE' };
  var inc = cands.map(function (c) { return c <= endIso; });
  var same = inc.every(function (x) { return x === inc[0]; });
  return same ? { include: inc[0], warn: '' } : { include: true, warn: 'AMBIGUOUS' };
}

/** EMPLOYEE_MASTER columns (first non-blank wins) that may hold a leaver's last working day. Absent column = no leavers. */
var ATT_LWD_HEADERS = ['LAST_WORKING_DAY', 'LAST_WORKING_DATE', 'LWD_AS_SOURCE', 'DOL_AS_SOURCE', 'DATE_OF_LEAVING',
  'RELIEVING_DATE'];

/** Raw last-working-day cell of an EMPLOYEE_MASTER row ('' when no such column / blank). */
function masterLastWorkingDay_(r) {
  for (var i = 0; i < ATT_LWD_HEADERS.length; i++) {
    var v = r[ATT_LWD_HEADERS[i]];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

/**
 * Roster rule for LEAVERS (non-Active employees): included when the last working day is on or after the period start
 * (they were paid for part of the month). Date / ISO exact; dd/mm/yyyy day-first, and when the two readings disagree the
 * employee is INCLUDED with warn 'AMBIGUOUS' (fail towards paying attention). Blank / unparseable -> not included.
 * @returns {{include:boolean, warn:string, lwd:string}}
 */
function leaverRosterDecision(v, startIso) {
  if (v == null || v === '') return { include: false, warn: '', lwd: '' };
  var iso = toIsoDate(v);
  if (iso) return { include: iso >= startIso, warn: '', lwd: iso };
  var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(String(v).trim());
  if (!m) return { include: false, warn: '', lwd: '' };
  var a = +m[1], b = +m[2], y = +m[3];
  var real = function (yy, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(yy, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 ? yy + '-' + pad2_(mo) + '-' + pad2_(d) : '';
  };
  var cands = [];
  [real(y, b, a), real(y, a, b)].forEach(function (c) { if (c && cands.indexOf(c) < 0) cands.push(c); });
  if (!cands.length) return { include: false, warn: '', lwd: '' };
  var inc = cands.map(function (c) { return c >= startIso; });
  var any = inc.some(function (x) { return x; }), all = inc.every(function (x) { return x; });
  return { include: any, warn: any && !all ? 'AMBIGUOUS' : '', lwd: cands[0] };
}

/** Latest VALID row per KEY (EMP_ID|DATE) within period. Later ENTERED_AT wins; ties -> later array position. */
function pickLatestValid(dailyRows, period) {
  var best = {};
  (dailyRows || []).forEach(function (r, i) {
    if (String(r.STATUS || '').trim().toUpperCase() !== 'VALID') return;
    var date = toIsoDate(r.DATE);
    if (!date || date.slice(0, 7) !== period) return;
    var emp = String(r.EMP_ID || '').trim();
    var key = r.KEY ? String(r.KEY) : emp + '|' + date;
    var t = attEntryTime_(r.ENTERED_AT);
    var cur = best[key];
    if (!cur || t >= cur.t) best[key] = { t: t, i: i, row: r, emp: emp, date: date };
  });
  return best;
}

/** Given existing daily rows and new VALID rows, list existing VALID rows to mark SUPERSEDED. */
function findSuperseded(existingRows, newRows) {
  var keys = {};
  (newRows || []).forEach(function (r) {
    if (String(r.STATUS).toUpperCase() === 'VALID') keys[r.KEY || (r.EMP_ID + '|' + toIsoDate(r.DATE))] = true;
  });
  var out = [];
  (existingRows || []).forEach(function (r) {
    var key = r.KEY || (String(r.EMP_ID).trim() + '|' + toIsoDate(r.DATE));
    if (String(r.STATUS).toUpperCase() === 'VALID' && keys[key]) out.push(r);
  });
  return out;
}

/**
 * Aggregate daily rows into one monthly record per roster employee.
 * Days with no VALID record (on/after DOJ) are MISSING, never assumed present.
 * `holidays` and `weeklyOff` are accepted for interface symmetry but deliberately not used to fill gaps
 * (defaulting happens only in normalizeAttendanceResponse at entry time).
 */
function aggregateDaily(dailyRows, period, roster, holidays, weeklyOff) {
  parsePeriod(period);
  var latest = pickLatestValid(dailyRows, period);
  var dates = enumerateDates(period);
  return (roster || []).map(function (emp) {
    var id = String(emp.EMP_ID).trim();
    var doj = emp.DOJ ? parseDoj(emp.DOJ) : '';
    var c = {};
    DAILY_CODES.forEach(function (k) { c[k] = 0; });
    var missing = [], recorded = 0, invalid = [];
    dates.forEach(function (d) {
      if (doj && d < doj) return;
      var hit = latest[id + '|' + d];
      var code = hit ? String(hit.row.CODE || '').trim().toUpperCase() : '';
      if (!hit) { missing.push(d); return; }
      if (DAILY_CODES.indexOf(code) < 0) { missing.push(d); invalid.push(d); return; }
      c[code]++;
      recorded++;
    });
    return {
      EMP_ID: id, PAYROLL_CATEGORY: emp.PAYROLL_CATEGORY, PERIOD: period,
      counts: c,
      PRESENT_DAYS: c.P + c.OD + 0.5 * c.HD,
      PHYSICAL_PRESENT_DAYS: c.P + 0.5 * c.HD,
      WEEK_OFF: c.WO,
      PH: c.PH,
      EL_AVAILED: c.EL, CL_AVAILED: c.CL, SL_AVAILED: c.SL,
      PAID_LEAVE_OTHER: c.COFF,
      ABSENT_LWP_DAYS: c.A + c.LWP + 0.5 * c.HD,
      recordedDays: recorded, missingDates: missing, invalidCodeDates: invalid
    };
  });
}

/** WORKED_DAYS. Workers exclude WEEK_OFF (matches Aug worker template); everyone else includes it. */
function computeWorkedDays(record, population) {
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var n = function (k) { return attNum_(record[k]); };
  var sum = n('PRESENT_DAYS') + n('EL_AVAILED') + n('CL_AVAILED') + n('SL_AVAILED') + n('PH') + n('PAID_LEAVE_OTHER');
  if (population !== POP.PERMANENT_WORKER) sum += n('WEEK_OFF');
  return sum;
}

function generatedValuesFromRecord(record) {
  var o = {};
  ATT_NUM_FIELDS.forEach(function (k) { o[k] = record[k]; });
  return o;
}

function attValuesEqual_(a, b) {
  return Math.abs(attNum_(a) - attNum_(b)) < 1e-9;
}

/**
 * Merge freshly generated values into an existing INPUT_ATTENDANCE row.
 * existing: row object or null. generated: {ATT_NUM_FIELDS...}.
 * Returns {action, values, HR_OVERRIDE, OVERRIDE_REASON, needsReason, GENERATED_VALUES_JSON}
 *  action: CREATE | REGENERATE | KEEP_APPROVED | UNCHANGED | OVERRIDE
 * Rules: APPROVED rows are never touched. A PENDING row whose numbers are all blank or still equal to the
 * previously generated snapshot is regenerated. Otherwise HR typed something: if it differs from the new
 * generated numbers the HR values are kept, HR_OVERRIDE=Y and OVERRIDE_REASON is required.
 */
function mergeGeneratedWithExisting(existing, generated) {
  var json = JSON.stringify(generated);
  if (!existing) {
    return { action: 'CREATE', values: generated, HR_OVERRIDE: 'N', OVERRIDE_REASON: '', needsReason: false,
      GENERATED_VALUES_JSON: json };
  }
  if (String(existing.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') {
    return { action: 'KEEP_APPROVED', values: null, HR_OVERRIDE: existing.HR_OVERRIDE || 'N',
      OVERRIDE_REASON: existing.OVERRIDE_REASON || '', needsReason: false,
      GENERATED_VALUES_JSON: existing.GENERATED_VALUES_JSON || '' };
  }
  var prev = null;
  try { prev = existing.GENERATED_VALUES_JSON ? JSON.parse(existing.GENERATED_VALUES_JSON) : null; } catch (e) { prev = null; }
  var allBlank = ATT_NUM_FIELDS.every(function (k) { return existing[k] === '' || existing[k] == null; });
  var equalsNew = ATT_NUM_FIELDS.every(function (k) { return attValuesEqual_(existing[k], generated[k]); });
  var equalsPrev = !!prev && ATT_NUM_FIELDS.every(function (k) { return attValuesEqual_(existing[k], prev[k]); });
  var reason = String(existing.OVERRIDE_REASON || '').trim();
  if (allBlank || equalsPrev) {
    return { action: 'REGENERATE', values: generated, HR_OVERRIDE: 'N', OVERRIDE_REASON: '', needsReason: false,
      GENERATED_VALUES_JSON: json };
  }
  if (equalsNew) {
    return { action: 'UNCHANGED', values: generated, HR_OVERRIDE: 'N', OVERRIDE_REASON: '', needsReason: false,
      GENERATED_VALUES_JSON: json };
  }
  var kept = {};
  ATT_NUM_FIELDS.forEach(function (k) { kept[k] = existing[k]; });
  return { action: 'OVERRIDE', values: kept, HR_OVERRIDE: 'Y', OVERRIDE_REASON: reason, needsReason: reason === '',
    GENERATED_VALUES_JSON: json };
}

/** Is there a paid holiday for the date at site? */
function isPaidHoliday_(holidays, date, site) {
  return (holidays || []).some(function (h) {
    var s = String(h.SITE || 'ALL').trim().toUpperCase();
    return toIsoDate(h.DATE) === date && (s === site || s === 'ALL') && String(h.PAID).trim().toUpperCase() === 'Y';
  });
}

function isUnpaidHoliday_(holidays, date, site) {
  return (holidays || []).some(function (h) {
    var s = String(h.SITE || 'ALL').trim().toUpperCase();
    return toIsoDate(h.DATE) === date && (s === site || s === 'ALL') && String(h.PAID).trim().toUpperCase() !== 'Y';
  });
}

/**
 * Turn one parsed form response into ATTENDANCE_DAILY rows.
 * response: {date:'YYYY-MM-DD', marks:{EMP_ID: CODE}, ack:boolean, timestamp, sourceRef}
 * Blank -> WO if weekday == weeklyOff, else PH if paid holiday, else P. Blank on an UNPAID holiday is
 * not defaulted (employee stays missing). Invalid code / unknown EMP_ID -> REJECTED row, employee not defaulted.
 * Response-level failure (bad date, ack missing) -> single REJECTED row with EMP_ID '*'.
 */
function normalizeAttendanceResponse(response, roster, holidays, site, weeklyOff) {
  var source = site === SITE_PUNE ? 'FORM_PUNE' : 'FORM_NASHIK';
  var entered = response.timestamp || '';
  var date = toIsoDate(response.date);
  function row(emp, code, status, reason) {
    return { PERIOD: date ? date.slice(0, 7) : '', DATE: date, SITE: site, EMP_ID: emp, CODE: code, SOURCE: source,
      SOURCE_REF: response.sourceRef || '', KEY: emp + '|' + date, STATUS: status, REJECT_REASON: reason || '',
      ENTERED_AT: entered };
  }
  if (!date) return [row('*', '', 'REJECTED', 'BAD_DATE')];
  if (!response.ack) return [row('*', '', 'REJECTED', 'ACK_NOT_CHECKED')];
  if (WEEKDAY_CODES.indexOf(weeklyOff) < 0) throw new Error('Invalid weekly off "' + weeklyOff + '"');
  var marks = response.marks || {};
  var inSite = {};
  var out = [];
  (roster || []).forEach(function (e) {
    if (e.SITE !== site) return;
    var id = String(e.EMP_ID).trim();
    inSite[id] = true;
    var doj = e.DOJ ? parseDoj(e.DOJ) : '';
    var raw = marks[id];
    var code = raw == null ? '' : String(raw).trim().toUpperCase();
    if (code) {
      if (DAILY_CODES.indexOf(code) < 0) out.push(row(id, code, 'REJECTED', 'INVALID_CODE'));
      else out.push(row(id, code, 'VALID'));
      return;
    }
    if (doj && date < doj) return; // not yet joined
    if (weekdayOf(date) === weeklyOff) out.push(row(id, 'WO', 'VALID'));
    else if (isPaidHoliday_(holidays, date, site)) out.push(row(id, 'PH', 'VALID'));
    else if (isUnpaidHoliday_(holidays, date, site)) return; // do not guess: stays missing
    else out.push(row(id, 'P', 'VALID'));
  });
  Object.keys(marks).forEach(function (id) {
    if (!inSite[id] && String(marks[id] || '').trim() !== '') out.push(row(id, String(marks[id]).toUpperCase(), 'REJECTED', 'UNKNOWN_EMP_ID'));
  });
  return out;
}

/** Fail-closed pre-approval check for one INPUT_ATTENDANCE row. Returns list of problems (empty = ok). */
function validateAttendanceRowForApproval(row) {
  var problems = [];
  ATT_NUM_FIELDS.forEach(function (k) {
    if (row[k] === '' || row[k] == null) { if (k === 'PRESENT_DAYS') problems.push('PRESENT_DAYS blank'); return; }
    var n = Number(row[k]);
    if (isNaN(n) || n < 0) problems.push(k + ' not a non-negative number');
  });
  if (String(row.HR_OVERRIDE || '').toUpperCase() === 'Y' && String(row.OVERRIDE_REASON || '').trim() === '') {
    problems.push('HR_OVERRIDE=Y needs OVERRIDE_REASON');
  }
  if (/^MISSING_DATES/.test(String(row.REMARKS || ''))) problems.push('daily attendance has missing dates');
  return problems;
}

/**
 * Employee-level problems of one INPUT_ATTENDANCE row (shared by the readiness check and the engine so both hold the
 * same employees): [{code, message}]. Codes: ATTENDANCE_NOT_APPROVED, ATTENDANCE_INVALID_VALUE (blank PRESENT_DAYS,
 * non-numeric or negative fields), ATTENDANCE_OVER_MONTH (worked days > days in the month), HR_OVERRIDE_WITHOUT_REASON.
 */
function attendanceRowProblems(row, population, period) {
  var out = [];
  if (!row) return out;
  if (String(row.APPROVAL_STATUS == null ? '' : row.APPROVAL_STATUS).trim().toUpperCase() !== 'APPROVED') {
    out.push({ code: 'ATTENDANCE_NOT_APPROVED', message: 'Attendance row is not APPROVED' });
  }
  var bad = [];
  ATT_NUM_FIELDS.forEach(function (k) {
    if (k === 'PRESENT_DAYS' && (row[k] === '' || row[k] == null)) { bad.push(k + ' blank'); return; }
    var n = attNum_(row[k]);
    if (isNaN(n) || n < 0) bad.push(k);
  });
  if (bad.length) {
    out.push({ code: 'ATTENDANCE_INVALID_VALUE', message: 'Blank / non-numeric / negative day fields: ' + bad.join(', ') });
  } else {
    var w = computeWorkedDays(row, population), dim = daysInMonth(period);
    if (w > dim + 1e-9) {
      out.push({ code: 'ATTENDANCE_OVER_MONTH', message: 'Worked days ' + w + ' exceed days in month ' + dim });
    }
  }
  if (String(row.HR_OVERRIDE || '').trim().toUpperCase() === 'Y' && String(row.OVERRIDE_REASON || '').trim() === '') {
    out.push({ code: 'HR_OVERRIDE_WITHOUT_REASON', message: 'HR_OVERRIDE=Y needs OVERRIDE_REASON' });
  }
  return out;
}

/** True when the INPUT_ATTENDANCE row comes from the monthly register (the pay source, DESIGN section 2). */
function isRegisterRow_(row) {
  return !!row && String(row.SOURCE_REF == null ? '' : row.SOURCE_REF).trim().toUpperCase() === 'REGISTER';
}

// ================================================================ sheet-touching entry points

function periodPopulationsOpen_(period) {
  var st = getPeriodStatusMap(period);
  var open = [], locked = [];
  POPULATION_LIST.forEach(function (p) { (st[p] === PERIOD_STATUS.LOCKED ? locked : open).push(p); });
  return { open: open, locked: locked, status: st };
}

/**
 * Active roster from EMPLOYEE_MASTER (STATUS_AS_SOURCE = Active). Duplicate EMP_IDs kept once and reported.
 * With a period, employees whose DOJ is after the period end are left out (roster.joinersExcluded); an ambiguous or
 * unparseable DOJ keeps the employee in with DOJ_WARN set (roster.dojWarnings).
 */
function buildRoster(period) {
  var rows = readObjects(TABS.EMPLOYEE_MASTER), seen = {}, roster = [], duplicates = [], excluded = [], warnings = [];
  var end = period ? periodEnd(period) : '';
  var start = period ? periodStart(period) : '';
  rows.forEach(function (r) {
    var active = String(r.STATUS_AS_SOURCE || '').trim().toLowerCase() === 'active';
    var pop = String(r.PAYROLL_CATEGORY || '').trim();
    var id = String(r.EMP_ID || '').trim();
    if (!id || !isKnownPopulation(pop)) return;
    var lv = { include: false, warn: '', lwd: '' };
    if (!active) {
      // leaver: a non-Active employee whose last working day is on/after the period start stays on the roster
      if (!start) return;
      lv = leaverRosterDecision(masterLastWorkingDay_(r), start);
      if (!lv.include) return;
    }
    var dec = end ? dojRosterDecision(r.DOJ_AS_SOURCE, end) : { include: true, warn: '' };
    if (!dec.include) { if (excluded.indexOf(id) < 0) excluded.push(id); return; }
    if (seen[id]) { duplicates.push(id); return; }
    seen[id] = true;
    if (dec.warn) warnings.push(id);
    var entry = { EMP_ID: id, PAYROLL_CATEGORY: pop, SITE: siteForPopulation(pop), NAME: String(r.EMPLOYEE_NAME || ''),
      DEPARTMENT: String(r.DEPARTMENT || '').trim(), DOJ: parseDoj(r.DOJ_AS_SOURCE), DOJ_WARN: dec.warn };
    if (!active) { entry.LEAVER = true; entry.LWD = lv.lwd; entry.LWD_WARN = lv.warn; }
    roster.push(entry);
  });
  roster.duplicates = duplicates;
  roster.joinersExcluded = excluded;
  roster.dojWarnings = warnings;
  return roster;
}

function workingDaysFor_(period) {
  var map = {};
  readObjects(TABS.PAYROLL_PERIOD_CATEGORY).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) === period) map[String(r.PAYROLL_CATEGORY).trim()] = r.WORKING_DAYS;
  });
  return map;
}

function existingAttendanceByEmp_(period) {
  var map = {}, dup = [];
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var id = String(r.EMP_ID).trim();
    if (map[id]) dup.push(id); else map[id] = r;
  });
  map.__dups = dup;
  return map;
}

/**
 * Keeps INPUT_ATTENDANCE.WORKING_DAYS equal to PAYROLL_PERIOD_CATEGORY.WORKING_DAYS (the value the engine really uses)
 * for the period's PENDING rows. APPROVED rows and LOCKED populations are never touched; a blank category value is
 * not copied. Returns the number of rows updated.
 */
function refreshAttendanceWorkingDays_(period) {
  var pp = periodPopulationsOpen_(period), wd = workingDaysFor_(period), updates = [];
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (String(r.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') return;
    var cat = String(r.PAYROLL_CATEGORY || '').trim();
    if (pp.locked.indexOf(cat) >= 0) return;
    var want = wd[cat];
    if (want === undefined || want === null || want === '') return;
    var have = r.WORKING_DAYS;
    if (have !== '' && have != null && Number(have) === Number(want)) return;
    updates.push({ row: r._row, values: { WORKING_DAYS: want } });
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  return updates.length;
}

/** Sept-style: pre-fill one PENDING row per active employee for HR to type counts into. Existing rows untouched. */
function prepareMonthlyAttendance(period) {
  guardPeriod_(period);
  var pp = periodPopulationsOpen_(period);
  var roster = buildRoster(period), wd = workingDaysFor_(period), existing = existingAttendanceByEmp_(period);
  var rows = [], skipped = 0;
  roster.forEach(function (e) {
    if (pp.locked.indexOf(e.PAYROLL_CATEGORY) >= 0) { skipped++; return; }
    if (existing[e.EMP_ID]) return;
    rows.push({ PAYROLL_MONTH: period, EMP_ID: e.EMP_ID, PAYROLL_CATEGORY: e.PAYROLL_CATEGORY,
      WORKING_DAYS: wd[e.PAYROLL_CATEGORY] === undefined ? '' : wd[e.PAYROLL_CATEGORY],
      APPROVAL_STATUS: 'PENDING', SOURCE_REF: 'HR_MONTHLY_ENTRY', ENTERED_AT: nowIso_(), HR_OVERRIDE: 'N',
      ROW_KEY: period + '|' + e.EMP_ID });
  });
  appendObjects(TABS.INPUT_ATTENDANCE, rows);
  var refreshed = refreshAttendanceWorkingDays_(period);
  var res = { period: period, rowsAdded: rows.length, workingDaysRefreshed: refreshed, skippedLocked: skipped,
    lockedPopulations: pp.locked, duplicateMasterIds: roster.duplicates, joinersExcluded: roster.joinersExcluded,
    dojWarnings: roster.dojWarnings };
  audit('ATT_PREPARE', period, '', res);
  return res;
}

/** Oct-onward: aggregate ATTENDANCE_DAILY into INPUT_ATTENDANCE. APPROVED rows never touched. */
function generateMonthlyAttendance(period) {
  guardPeriod_(period);
  var pp = periodPopulationsOpen_(period);
  var daily = readObjects(TABS.ATTENDANCE_DAILY).filter(function (r) {
    return toIsoDate(r.DATE).slice(0, 7) === period;
  });
  if (!daily.length) throw new Error('No ATTENDANCE_DAILY rows for ' + period + ' - use prepareMonthlyAttendance for monthly entry');
  var roster = buildRoster(period).filter(function (e) { return pp.locked.indexOf(e.PAYROLL_CATEGORY) < 0; });
  var holidays = readObjects(TABS.HOLIDAY_CALENDAR);
  var records = aggregateDaily(daily, period, roster, holidays, getWeeklyOff(SITE_NASHIK));
  var wd = workingDaysFor_(period), existing = existingAttendanceByEmp_(period);
  var creates = [], updates = [], counts = { CREATE: 0, REGENERATE: 0, UNCHANGED: 0, OVERRIDE: 0, KEEP_APPROVED: 0 };
  var needsReason = [], withMissing = [];
  records.forEach(function (rec) {
    var pop = rec.PAYROLL_CATEGORY;
    var gen = generatedValuesFromRecord(rec);
    var ex = existing[rec.EMP_ID] || null;
    var m = mergeGeneratedWithExisting(ex, gen);
    counts[m.action]++;
    if (m.action === 'KEEP_APPROVED') return;
    if (m.needsReason) needsReason.push(rec.EMP_ID);
    var remarks = rec.missingDates.length ? 'MISSING_DATES: ' + rec.missingDates.join(',') : '';
    if (rec.missingDates.length) withMissing.push(rec.EMP_ID);
    var vals = {};
    ATT_NUM_FIELDS.forEach(function (k) { vals[k] = m.values[k]; });
    vals.WORKED_DAYS = computeWorkedDays(vals, pop);
    vals.PAYABLE_DAYS = vals.WORKED_DAYS;
    vals.HR_OVERRIDE = m.HR_OVERRIDE;
    vals.GENERATED_VALUES_JSON = m.GENERATED_VALUES_JSON;
    if (!ex) {
      vals.PAYROLL_MONTH = period; vals.EMP_ID = rec.EMP_ID; vals.PAYROLL_CATEGORY = pop;
      vals.WORKING_DAYS = wd[pop] === undefined ? '' : wd[pop];
      vals.APPROVAL_STATUS = 'PENDING'; vals.SOURCE_REF = 'DAILY_GENERATED'; vals.ENTERED_AT = nowIso_();
      vals.OVERRIDE_REASON = ''; vals.ROW_KEY = period + '|' + rec.EMP_ID; vals.REMARKS = remarks;
      creates.push(vals);
    } else {
      if (m.action !== 'OVERRIDE') vals.OVERRIDE_REASON = '';
      var oldRem = String(ex.REMARKS || '');
      if (oldRem === '' || /^MISSING_DATES/.test(oldRem)) vals.REMARKS = remarks;
      if (m.action === 'REGENERATE') vals.SOURCE_REF = 'DAILY_GENERATED';
      updates.push({ row: ex._row, values: vals });
    }
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  appendObjects(TABS.INPUT_ATTENDANCE, creates);
  var refreshed = refreshAttendanceWorkingDays_(period);
  var res = { period: period, counts: counts, employeesWithMissingDates: withMissing, overridesNeedingReason: needsReason,
    workingDaysRefreshed: refreshed, skippedLockedPopulations: pp.locked };
  audit('ATT_GENERATE', period, '', res);
  return res;
}

/** Bulk-approve PENDING rows of one population. Records the active user; refuses if identity unknown. */
function approveAttendance(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  assertNotLocked(period, population);
  var user = '';
  try { user = Session.getActiveUser().getEmail(); } catch (e) { user = ''; }
  if (!user) throw new Error('Cannot determine active user email - approval refused');
  var approved = [], blocked = [], updates = [];
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period || String(r.PAYROLL_CATEGORY).trim() !== population) return;
    if (String(r.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') return;
    var problems = validateAttendanceRowForApproval(r);
    if (problems.length) { blocked.push({ EMP_ID: r.EMP_ID, problems: problems }); return; }
    updates.push({ row: r._row, values: { APPROVAL_STATUS: 'APPROVED', APPROVED_BY: user } });
    approved.push(r.EMP_ID);
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  var res = { period: period, population: population, approvedBy: user, approved: approved.length, blocked: blocked };
  audit('ATT_APPROVE', period, population, res);
  return res;
}

/**
 * Pure: one row of an attendance form-response tab (ATT_FORM_NASHIK_RAW / ATT_FORM_PUNE_RAW) -> the parsed response
 * {date, marks, ack, timestamp, sourceRef} that normalizeAttendanceResponse expects. Column headers of a linked
 * response sheet are the question titles: "Timestamp", "Date", "Attendance – <Dept> [EMP_ID – Name]" (one per grid
 * row, the cell holds the chosen code) and the acknowledgement checkbox title.
 */
function parseAttendanceRawRow(headers, values, sheetName, rowNum) {
  var out = { date: '', marks: {}, ack: false, timestamp: '', sourceRef: sheetName + '!' + rowNum };
  (headers || []).forEach(function (h, i) {
    var title = String(h == null ? '' : h).trim();
    var v = values[i];
    if (/^timestamp$/i.test(title)) {
      out.timestamp = Object.prototype.toString.call(v) === '[object Date]'
        ? Utilities.formatDate(v, HROS_TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(v == null ? '' : v);
    } else if (/^date$/i.test(title)) {
      out.date = feeds_parseDate_(v);
    } else if (title.indexOf(ATT_GRID_TITLE_PREFIX) === 0) {
      var m = /\[(.+)\]\s*$/.exec(title);
      var code = String(v == null ? '' : v).trim();
      var lbl = m ? parseRowLabel(m[1]) : null;
      if (lbl && code) out.marks[lbl.empId] = code.toUpperCase();
    } else if (title === ATT_ACK_TEXT) {
      out.ack = String(v == null ? '' : v).trim() !== '';
    }
  });
  return out;
}

/** Normalise one parsed response and write it (rejects < MIN_PERIOD and LOCKED populations). */
function ingestAttendanceResponse_(parsed, site) {
  var date = toIsoDate(parsed.date);
  if (!date) throw new Error('Response has no valid date');
  var period = date.slice(0, 7);
  guardPeriod_(period);
  var roster = buildRoster();
  var holidays = readObjects(TABS.HOLIDAY_CALENDAR);
  var rows = normalizeAttendanceResponse(parsed, roster, holidays, site, getWeeklyOff(site));
  var st = getPeriodStatusMap(period);
  var popOf = {};
  roster.forEach(function (e) { popOf[e.EMP_ID] = e.PAYROLL_CATEGORY; });
  rows = rows.map(function (r) {
    if (r.STATUS === 'VALID' && st[popOf[r.EMP_ID]] === PERIOD_STATUS.LOCKED) {
      r.STATUS = 'REJECTED'; r.REJECT_REASON = 'PERIOD_LOCKED';
    }
    return r;
  });
  var existing = readObjects(TABS.ATTENDANCE_DAILY).filter(function (r) { return toIsoDate(r.DATE) === date; });
  var sup = findSuperseded(existing, rows);
  updateRows(TABS.ATTENDANCE_DAILY, sup.map(function (r) { return { row: r._row, values: { STATUS: 'SUPERSEDED' } }; }));
  appendObjects(TABS.ATTENDANCE_DAILY, rows);
  return { valid: rows.filter(function (r) { return r.STATUS === 'VALID'; }).length,
    rejected: rows.filter(function (r) { return r.STATUS !== 'VALID'; }).length, superseded: sup.length };
}
