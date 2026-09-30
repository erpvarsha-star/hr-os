/**
 * 20_Feeds.gs - Stage 2/3 feeds: OT, canteen, efficiency normalizers (pure mappers + thin entry points)
 * and pure engine-facing readers (OT, canteen, efficiency, advance, society).
 *
 * Privacy: Overtime_Form is read header-first, only needed columns by name; password columns are never read. Only the columns matched by header name
 * (submission type, emp id, OT date, hours, decision, case no, timestamp) are ever used; approval-password
 * columns are never mapped, copied, logged or written.
 */
var FEEDS_OT_TAB = 'Overtime_Form';
var FEEDS_OT_COLS = 21;               // legacy cap on header lookup
var FEEDS_OT_MAX_HOURS = 16;
var FEEDS_NORMALIZER_VERSION = 'OT-1.0';
var FEEDS_CANTEEN_TAB = 'CANTEEN_FORM_RESPONSES';
var FEEDS_EFFICIENCY_TAB = 'EFFICIENCY_FORM_RESPONSES';
var FEEDS_OT_LOCAL_TAB = 'OT_FORM_RESPONSES';      // default local OT source (the OT form is linked into this spreadsheet)
var FEEDS_OT_EXTERNAL_TAB = 'Form Responses 1';    // default tab name when an external source spreadsheet is configured

// ================================================================ small pure helpers

function feeds_norm_(h) { return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, ''); }

/** Header row -> {normalizedHeader: firstIndex}. */
function feeds_headerIndex_(headerRow, limit) {
  var idx = {};
  for (var i = 0; i < headerRow.length && (limit == null || i < limit); i++) {
    var k = feeds_norm_(headerRow[i]);
    if (k && !(k in idx)) idx[k] = i;
  }
  return idx;
}

/** Find column by list of accepted normalized names; optional contains-fallback tokens. */
function feeds_col_(idx, names, contains) {
  for (var i = 0; i < names.length; i++) if (names[i] in idx) return idx[names[i]];
  if (contains) {
    var keys = Object.keys(idx);
    for (var j = 0; j < keys.length; j++) {
      for (var c = 0; c < contains.length; c++) if (keys[j].indexOf(contains[c]) >= 0) return idx[keys[j]];
    }
  }
  return -1;
}

function feeds_cell_(row, i) { return (i >= 0 && i < row.length) ? row[i] : ''; }
function feeds_str_(v) { return v == null ? '' : String(v).trim(); }
function feeds_isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function feeds_num_(v) {
  if (v === '' || v == null || typeof v === 'boolean' || feeds_isDate_(v)) return NaN;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v).trim().replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s);
}

function feeds_ts_(v) {
  if (v == null || v === '') return 0;
  if (feeds_isDate_(v)) return isNaN(v.getTime()) ? 0 : v.getTime();
  var t = Date.parse(String(v));
  return isNaN(t) ? 0 : t;
}

function feeds_empId_(v) { return feeds_str_(v).toUpperCase(); }

/** Efficiency EMP_ID key (per employee only; hyphens/spaces inside real EMP_IDs are kept). */
function feeds_effKey_(v) { return feeds_empId_(v); }

/** True for the retired blanket sentinel ALL_WORKERS / ALL WORKERS (sheet rule: per employee, no blanket). */
function feeds_isBlanketKey_(v) { return /^ALL[\s\-_]+WORKERS$/.test(feeds_empId_(v)); }

/** Date | ISO | dd-mm-yyyy | dd/mm/yyyy (optional time) -> 'YYYY-MM-DD' or ''. */
function feeds_parseDate_(v) {
  if (v == null || v === '') return '';
  if (feeds_isDate_(v)) return toIsoDate(v);
  var s = String(v).trim();
  var iso = toIsoDate(s);
  if (iso) return iso;
  var m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:$|[T\s])/.exec(s);
  if (m) {
    var d = +m[1], mo = +m[2], y = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) return '';
    return y + '-' + pad2_(mo) + '-' + pad2_(d);
  }
  return '';
}

var FEEDS_MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Loose period parser: Date, 'YYYY-MM', 'YYYY-MM-01', 'Sep 2026', 'September-2026' -> 'YYYY-MM' or ''. */
function feeds_parsePeriodLoose_(v) {
  var p = normalizePeriod(v);
  if (p) return p;
  var m = /^([A-Za-z]{3,9})[\s\-\/,.]+(\d{4})$/.exec(feeds_str_(v));
  if (m) {
    var i = FEEDS_MONTHS_.indexOf(m[1].toLowerCase().slice(0, 3));
    if (i >= 0) return m[2] + '-' + pad2_(i + 1);
  }
  return '';
}

function feeds_keySet_(keys) {
  var set = {};
  if (!keys) return set;
  if (Array.isArray(keys)) { keys.forEach(function (k) { set[String(k)] = true; }); return set; }
  Object.keys(keys).forEach(function (k) { if (keys[k]) set[k] = true; });
  return set;
}

function feeds_rosterMap_(roster) {
  var map = {};
  (roster || []).forEach(function (r) { map[feeds_empId_(r.EMP_ID)] = r; });
  return map;
}

// ================================================================ OT mapping (pure)

/**
 * Event-log semantics of Overtime_Form (headers: Timestamp, Submission Type, EMP ID, Date Of OT, OT Hours,
 * Approval Decision, Case No ...): an employee/supervisor "Apply For OT" row carries no decision; the manager's
 * final decision arrives as a separate "Approval Of Manager" row that repeats EMP ID / Date / Hours and carries
 * Approval Decision = Approved | Rejected. Only "Approval Of Manager" + exactly "Approved" is counted.
 *
 * @param {Array} headerRow  selected header cells (needed columns only)
 * @param {Array<Array>} rows data rows zipped from the selected columns
 * @param {string} period 'YYYY-MM'
 * @param {Array} roster active roster [{EMP_ID, PAYROLL_CATEGORY}]
 * @param {Array|Object} existingKeys OT_KEYs already in INPUT_OT
 * @param {Object} [opts] {firstRow: sheet row number of rows[0], default 2, enteredAt, windowStart, windowEnd
 *   (ISO dates; default = the calendar month of period, see feeds_otWindow)}
 * Reversals: events are grouped by Case No + EMP + date (case blank -> EMP + date). The LATEST decisive row
 * (Approved or Rejected, by timestamp then row) of a group wins: Rejected excludes the group, a corrected approval
 * takes the latest hours. Exception rows carry OT_HOURS = 0 and the original hours in EXCEPTION_REASON so the
 * sheet's Monthly OT Report SUMIFS is never inflated.
 * @returns {{valid:Array, exceptions:Array, pendingCount:number, pendingEmpIds:Array, duplicateSkipped:number, revokedCount:number, correctedCount:number, missingColumns:Array}}
 *   pendingEmpIds holds one (upper-case) EMP_ID per pending event so callers can split the count by population.
 */
function mapOtRows(headerRow, rows, period, roster, existingKeys, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2;
  var enteredAt = opts.enteredAt || '';
  var idx = feeds_headerIndex_(headerRow, FEEDS_OT_COLS);
  var c = {
    ts: feeds_col_(idx, ['timestamp']),
    type: feeds_col_(idx, ['submissiontype']),
    emp: feeds_col_(idx, ['empid', 'employeeid', 'employeecode']),
    date: feeds_col_(idx, ['dateofot', 'otdate']),
    hours: feeds_col_(idx, ['othours', 'overtimehours']),
    decision: feeds_col_(idx, ['approvaldecision', 'decision']),
    kase: feeds_col_(idx, ['caseno', 'caseid', 'casenumber'])
  };
  var missing = [];
  ['type', 'emp', 'date', 'hours', 'decision'].forEach(function (k) { if (c[k] < 0) missing.push(k); });
  var out = { valid: [], exceptions: [], pendingCount: 0, pendingEmpIds: [], duplicateSkipped: 0, revokedCount: 0,
    correctedCount: 0, missingColumns: missing };
  if (missing.length) return out; // fail closed: nothing counted without required headers

  var pStart = opts.windowStart || periodStart(period), pEnd = opts.windowEnd || periodEnd(period);
  var have = feeds_keySet_(existingKeys);
  var rosterMap = feeds_rosterMap_(roster);

  // pass 1: in-memory filter of rows whose OT date is in the period (or unparseable on decisive rows)
  var events = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var date = feeds_parseDate_(feeds_cell_(row, c.date));
    var decRaw = feeds_str_(feeds_cell_(row, c.decision));
    if (!date) {
      if (decRaw) events.push({ i: i, date: '', decRaw: decRaw, row: row, bad: true });
      continue;
    }
    if (date < pStart || date > pEnd) continue;
    events.push({ i: i, date: date, decRaw: decRaw, row: row });
  }

  var emps = {};        // EMP|DATE -> has an approval-type row (approved or rejected) for pending logic
  var groups = {};      // EMP|DATE|CASE -> {approved:[], rejected:[]}
  var applies = [];
  var decisive = [];

  events.forEach(function (ev) {
    var row = ev.row;
    ev.emp = feeds_empId_(feeds_cell_(row, c.emp));
    ev.type = feeds_norm_(feeds_cell_(row, c.type));
    ev.kase = feeds_str_(feeds_cell_(row, c.kase));
    ev.ts = feeds_ts_(feeds_cell_(row, c.ts));
    ev.dec = ev.decRaw.toLowerCase();
    ev.srcRow = firstRow + ev.i;
    var isApprovalType = ev.type.indexOf('approval') >= 0;
    var isApplyType = ev.type.indexOf('apply') >= 0;
    if (ev.bad) { decisive.push(ev); return; }
    var dayKey = ev.emp + '|' + ev.date;
    if (isApprovalType) {
      emps[dayKey] = true;
      if (ev.dec === 'approved' || ev.dec === 'rejected') {
        var gk = dayKey + '|' + ev.kase.toUpperCase();
        var g = groups[gk] || (groups[gk] = { approved: [], rejected: [] });
        (ev.dec === 'approved' ? g.approved : g.rejected).push(ev);
      } else if (!ev.dec) {
        out.pendingCount++;               // approval row without decision = still pending
        out.pendingEmpIds.push(ev.emp);
      } else {
        decisive.push(ev);                // unrecognised decision text
      }
    } else if (ev.dec === 'approved') {
      decisive.push(ev);                  // Approved on a non-approval row = ambiguous
    } else if (isApplyType || !ev.type) {
      if (!ev.dec) applies.push(ev);
    }
  });

  applies.forEach(function (ev) { if (!emps[ev.emp + '|' + ev.date]) { out.pendingCount++; out.pendingEmpIds.push(ev.emp); } });

  function baseRow(ev, extra) {
    var o = {
      PAYROLL_MONTH: period, EMP_ID: ev.emp, OT_HOURS: '', SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'APPROVED',
      ENTERED_AT: enteredAt, SOURCE_CASE_NOS: ev.kase ? "'" + ev.kase : '', SOURCE_EVENT_COUNT: 1,
      DATE_RANGE: ev.date ? ev.date + '..' + ev.date : '', OT_KEY: '', OT_DATE: ev.date || '', SOURCE_ROW: ev.srcRow,
      NORMALIZER_VERSION: FEEDS_NORMALIZER_VERSION, ELIGIBILITY: 'VALID', EXCEPTION_REASON: ''
    };
    o.OT_KEY = ev.emp + '|' + (ev.date || 'NODATE') + '|' + ev.srcRow;
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function pushException(ev, reason) {
    var key = ev.emp + '|' + (ev.date || 'NODATE') + '|' + ev.srcRow;
    if (have[key]) { out.duplicateSkipped++; return; }
    have[key] = true;
    var rawH = feeds_str_(feeds_cell_(ev.row, c.hours));
    out.exceptions.push(baseRow(ev, { ELIGIBILITY: 'EXCEPTION',
      EXCEPTION_REASON: reason + (rawH ? ' | ORIGINAL_OT_HOURS=' + rawH : ''), OT_HOURS: 0, APPROVAL_STATUS: 'EXCEPTION' }));
  }
  function acceptApproved(ev) {
    var hours = feeds_num_(feeds_cell_(ev.row, c.hours));
    if (!ev.emp) return pushException(ev, 'MISSING_EMP_ID');
    if (!rosterMap[ev.emp]) return pushException(ev, 'UNKNOWN_OR_INACTIVE_EMP_ID');
    if (isNaN(hours)) return pushException(ev, 'HOURS_NOT_NUMERIC');
    if (hours <= 0) return pushException(ev, 'HOURS_NOT_POSITIVE');
    if (hours > FEEDS_OT_MAX_HOURS) return pushException(ev, 'HOURS_OVER_' + FEEDS_OT_MAX_HOURS);
    var key = ev.emp + '|' + ev.date + '|' + ev.srcRow;
    if (have[key]) { out.duplicateSkipped++; return; }
    have[key] = true;
    out.valid.push(baseRow(ev, { OT_HOURS: hours }));
  }

  decisive.forEach(function (ev) {
    pushException(ev, ev.bad ? 'OT_DATE_UNPARSEABLE' : (ev.dec === 'approved' ? 'APPROVED_ON_NON_APPROVAL_ROW' : 'UNRECOGNISED_DECISION'));
  });

  Object.keys(groups).forEach(function (gk) {
    var g = groups[gk];
    if (!g.approved.length) return;
    var order = function (a, b) { return (a.ts - b.ts) || (a.i - b.i); };
    g.approved.sort(order);
    g.rejected.sort(order);
    var latestApproved = g.approved[g.approved.length - 1];
    var latestRejected = g.rejected.length ? g.rejected[g.rejected.length - 1] : null;
    if (latestRejected && order(latestRejected, latestApproved) > 0) {
      out.revokedCount++;                 // latest decision is a rejection: nothing payable, no exception
      return;
    }
    if (g.approved.length > 1) {
      var hrs = g.approved.map(function (ev) { return feeds_num_(feeds_cell_(ev.row, c.hours)); });
      var same = hrs.every(function (h) { return h === hrs[0]; });
      if (!same) out.correctedCount++;    // corrected approval: the latest hours win
      g.approved.slice(0, -1).forEach(function () { out.duplicateSkipped++; });
    }
    acceptApproved(latestApproved);
  });

  return out;
}

/**
 * OT window for a period (pure). Default = the calendar month of the OT date. PAYROLL_CONTROL key
 * OT_WINDOW_START_<YYYY-MM> (ISO date) moves the window start for that period only, e.g. the one-time
 * catch-up OT_WINDOW_START_2026-09 = 2026-08-26 (August salary paid OT only up to 25-Aug).
 * controlMap: {KEY: VALUE} (raw cell values; Date cells accepted). Throws on a malformed / out-of-range override.
 * @returns {{start:string, end:string, overridden:boolean}}
 */
function feeds_otWindow(period, controlMap) {
  parsePeriod(period);
  var start = periodStart(period), end = periodEnd(period), overridden = false;
  var key = 'OT_WINDOW_START_' + period;
  var raw = controlMap ? controlMap[key] : '';
  if (raw !== '' && raw != null) {
    var iso = feeds_parseDate_(raw);
    if (!iso) throw new Error(key + ' must be a date (YYYY-MM-DD), got "' + raw + '"');
    if (iso > end) throw new Error(key + ' (' + iso + ') is after the end of the period ' + end);
    if (iso !== start) { start = iso; overridden = true; }
  }
  return { start: start, end: end, overridden: overridden };
}

function feeds_otSame_(fresh, live) {
  var a = feeds_num_(fresh.OT_HOURS), b = feeds_num_(live.OT_HOURS);
  return feeds_str_(fresh.ELIGIBILITY).toUpperCase() === feeds_str_(live.ELIGIBILITY).toUpperCase() &&
    (isNaN(a) ? 0 : a) === (isNaN(b) ? 0 : b) &&
    feeds_str_(fresh.EXCEPTION_REASON) === feeds_str_(live.EXCEPTION_REASON);
}

/**
 * Re-sync planner (pure). existing = INPUT_OT row objects ({_row, ...}); fresh = rows produced by mapOtRows for the
 * period. Only rows written by the normalizer (NORMALIZER_VERSION set, OT_KEY set, not HR_MANUAL, not already
 * SUPERSEDED) can be superseded; legacy Apr-Aug rows and manual HR rows are never touched.
 * A live row whose OT_KEY is in fresh with identical hours/eligibility/reason is kept (idempotent re-run);
 * every other live row is superseded and every unmatched fresh row is appended.
 * @returns {{supersede:Array, append:Array, unchanged:number}}
 */
function feeds_planOtResync(existing, fresh, period) {
  var freshByKey = {};
  (fresh || []).forEach(function (f) { freshByKey[f.OT_KEY] = f; });
  var matched = {}, supersede = [], unchanged = 0;
  (existing || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (!feeds_str_(r.NORMALIZER_VERSION) || !feeds_str_(r.OT_KEY)) return;
    if (feeds_str_(r.SOURCE_REF).toUpperCase() === 'HR_MANUAL') return;
    if (feeds_str_(r.ELIGIBILITY).toUpperCase() === 'SUPERSEDED') return;
    var f = freshByKey[feeds_str_(r.OT_KEY)];
    if (f && !matched[f.OT_KEY] && feeds_otSame_(f, r)) { matched[f.OT_KEY] = true; unchanged++; return; }
    supersede.push(r);
  });
  var append = (fresh || []).filter(function (f) { return !matched[f.OT_KEY]; });
  return { supersede: supersede, append: append, unchanged: unchanged };
}

/** Cell updates that mark a live INPUT_OT row SUPERSEDED. Hours are zeroed (Monthly OT Report SUMIFS ignores ELIGIBILITY) and preserved in the reason. */
function feeds_supersedeValues(row, stamp) {
  var h = feeds_str_(row.OT_HOURS);
  return { ELIGIBILITY: 'SUPERSEDED', OT_HOURS: 0,
    EXCEPTION_REASON: 'SUPERSEDED_BY_RESYNC ' + (stamp || '') + ' | WAS=' + (feeds_str_(row.ELIGIBILITY) || 'VALID') +
      (h ? ' | ORIGINAL_OT_HOURS=' + h : '') };
}

// ================================================================ canteen / efficiency mapping (pure)

function feeds_latestPerKey_(items) {
  var best = {};
  items.forEach(function (it) {
    var cur = best[it.key];
    if (!cur || it.ts > cur.ts || (it.ts === cur.ts && it.i > cur.i)) best[it.key] = it;
  });
  return best;
}

function feeds_commonCols_(idx) {
  return {
    ts: feeds_col_(idx, ['timestamp']),
    month: feeds_col_(idx, ['payrollmonth', 'period', 'month']),
    emp: feeds_col_(idx, ['employeeid', 'empid']),
    subType: feeds_col_(idx, ['submissiontype', 'correctiontype']),
    prevRef: feeds_col_(idx, ['previoussubmissionreference', 'priorresponsereference', 'previousreference'], ['previous', 'prior']),
    reason: feeds_col_(idx, ['correctionreason'], ['correctionreason'])
  };
}

/**
 * Canteen form responses -> INPUT_CANTEEN rows. Latest response per PERIOD|EMP_ID wins; a latest response that
 * fails validation yields an exception (no fallback to an older one). Manual HR rows are never touched here.
 * @returns {{valid:Array, exceptions:Array, skippedExisting:number, missingColumns:Array}}
 */
function mapCanteenRows(headerRow, rows, period, roster, existingRefs, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2;
  var idx = feeds_headerIndex_(headerRow);
  var c = feeds_commonCols_(idx);
  c.amount = feeds_col_(idx, ['deductionamountinr', 'deductionamount', 'amountinr', 'amount'], ['amount']);
  var out = { valid: [], exceptions: [], skippedExisting: 0, missingColumns: [] };
  ['month', 'emp', 'amount'].forEach(function (k) { if (c[k] < 0) out.missingColumns.push(k); });
  if (out.missingColumns.length) return out;
  var have = feeds_keySet_(existingRefs), rosterMap = feeds_rosterMap_(roster);

  var items = [];
  rows.forEach(function (row, i) {
    if (feeds_parsePeriodLoose_(feeds_cell_(row, c.month)) !== period) return;
    var emp = feeds_empId_(feeds_cell_(row, c.emp));
    if (!emp) return;
    items.push({ i: i, row: row, emp: emp, key: period + '|' + emp, ts: feeds_ts_(feeds_cell_(row, c.ts)) });
  });
  var best = feeds_latestPerKey_(items);
  Object.keys(best).sort().forEach(function (k) {
    var it = best[k], row = it.row;
    var ref = FEEDS_CANTEEN_TAB + '!' + (firstRow + it.i);
    if (have[ref]) { out.skippedExisting++; return; }
    var amount = feeds_num_(feeds_cell_(row, c.amount));
    var reason = '';
    if (!rosterMap[it.emp]) reason = 'UNKNOWN_OR_INACTIVE_EMP_ID';
    else if (isNaN(amount)) reason = 'AMOUNT_NOT_NUMERIC';
    else if (amount < 0) reason = 'AMOUNT_NEGATIVE';
    else if (/correction/i.test(feeds_str_(feeds_cell_(row, c.subType))) && !feeds_str_(feeds_cell_(row, c.prevRef))) {
      reason = 'CORRECTION_WITHOUT_REFERENCE';
    }
    var o = { PAYROLL_MONTH: period, EMP_ID: it.emp, AMOUNT_INR: reason ? '' : amount, SOURCE: 'FORM_CANTEEN',
      SOURCE_REF: ref, KEY: k, STATUS: reason ? 'EXCEPTION' : 'VALID', ENTERED_AT: opts.enteredAt || '',
      REMARKS: reason || feeds_str_(feeds_cell_(row, c.reason)) };
    (reason ? out.exceptions : out.valid).push(o);
  });
  return out;
}

/**
 * Efficiency form responses -> INPUT_EFFICIENCY rows, per employee (the ALL_WORKERS blanket convention is retired:
 * such a row becomes an ALL_WORKERS_NOT_SUPPORTED exception).
 * @returns {{valid:Array, exceptions:Array, skippedExisting:number, missingColumns:Array}}
 */
function mapEfficiencyRows(headerRow, rows, period, roster, existingRefs, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2;
  var idx = feeds_headerIndex_(headerRow);
  var c = feeds_commonCols_(idx);
  c.pct = feeds_col_(idx, ['productionefficiencypercent', 'efficiencyachieved', 'efficiencypct', 'efficiency'], ['efficiency']);
  c.days = feeds_col_(idx, ['physicalpresentdaysoptional', 'physicalpresentdays', 'applicabledays', 'eligibledays'],
    ['physicalpresent', 'applicabledays']);
  var out = { valid: [], exceptions: [], skippedExisting: 0, missingColumns: [] };
  ['month', 'emp', 'pct'].forEach(function (k) { if (c[k] < 0) out.missingColumns.push(k); });
  if (out.missingColumns.length) return out;
  var have = feeds_keySet_(existingRefs), rosterMap = feeds_rosterMap_(roster);

  var items = [];
  rows.forEach(function (row, i) {
    if (feeds_parsePeriodLoose_(feeds_cell_(row, c.month)) !== period) return;
    var emp = feeds_effKey_(feeds_cell_(row, c.emp));
    if (!emp) return;
    items.push({ i: i, row: row, emp: emp, key: period + '|' + emp, ts: feeds_ts_(feeds_cell_(row, c.ts)) });
  });
  var best = feeds_latestPerKey_(items);
  Object.keys(best).sort().forEach(function (k) {
    var it = best[k], row = it.row;
    var ref = FEEDS_EFFICIENCY_TAB + '!' + (firstRow + it.i);
    if (have[ref]) { out.skippedExisting++; return; }
    var pct = feeds_num_(feeds_cell_(row, c.pct));
    var daysRaw = feeds_cell_(row, c.days);
    var days = (daysRaw === '' || daysRaw == null) ? '' : feeds_num_(daysRaw);
    var reason = '';
    var r = rosterMap[it.emp];
    if (feeds_isBlanketKey_(it.emp)) reason = 'ALL_WORKERS_NOT_SUPPORTED';
    else if (!r) reason = 'UNKNOWN_OR_INACTIVE_EMP_ID';
    else if (r.PAYROLL_CATEGORY && (categoryMethod(r.PAYROLL_CATEGORY) || r.PAYROLL_CATEGORY) !== POP.PERMANENT_WORKER) reason = 'NOT_A_PERMANENT_WORKER';
    if (!reason) {
      if (isNaN(pct)) reason = 'EFFICIENCY_NOT_NUMERIC';
      else if (pct < 0 || pct > 100) reason = 'EFFICIENCY_OUT_OF_RANGE';
      else if (days !== '' && (isNaN(days) || days < 0 || days > 31)) reason = 'PHYSICAL_DAYS_INVALID';
      else if (/correction/i.test(feeds_str_(feeds_cell_(row, c.subType))) && !feeds_str_(feeds_cell_(row, c.prevRef))) {
        reason = 'CORRECTION_WITHOUT_REFERENCE';
      }
    }
    var o = { PAYROLL_MONTH: period, EMP_ID: it.emp, EFFICIENCY_PCT: reason ? '' : pct,
      PHYSICAL_PRESENT_DAYS_OVERRIDE: reason ? '' : days, SOURCE: 'FORM_EFFICIENCY', SOURCE_REF: ref, KEY: k,
      STATUS: reason ? 'EXCEPTION' : 'VALID', ENTERED_AT: opts.enteredAt || '',
      REMARKS: reason || feeds_str_(feeds_cell_(row, c.reason)) };
    (reason ? out.exceptions : out.valid).push(o);
  });
  return out;
}

// ================================================================ engine-facing readers (pure)

function feeds_add_(map, id, n) { map[id] = (map[id] || 0) + n; }

/**
 * Payable OT hours per EMP_ID for the period, from two kinds of INPUT_OT rows:
 *  1. rows written by syncOtFromForm: NORMALIZER_VERSION set, ELIGIBILITY = VALID (SUPERSEDED / EXCEPTION never count);
 *  2. manual HR rows (e.g. CON##/BUNG## employees who are not on the OT form): SOURCE_REF (column D) = HR_MANUAL,
 *     APPROVAL_STATUS = APPROVED, period >= MIN_PERIOD, not EXCEPTION/SUPERSEDED.
 * Legacy Apr-Aug rows (no NORMALIZER_VERSION, not HR_MANUAL) are never counted.
 */
function sumOtHours(rows, period) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var elig = feeds_str_(r.ELIGIBILITY).toUpperCase();
    var st = feeds_str_(r.APPROVAL_STATUS).toUpperCase();
    if (feeds_str_(r.SOURCE_REF).toUpperCase() === 'HR_MANUAL') {
      if (period < HROS_MIN_PERIOD_FLOOR) return;
      if (st !== 'APPROVED') return;
      if (elig === 'EXCEPTION' || elig === 'SUPERSEDED') return;
    } else {
      if (elig !== 'VALID') return;
      if (!feeds_str_(r.NORMALIZER_VERSION)) return;
      if (st && st !== 'APPROVED') return;
    }
    var h = feeds_num_(r.OT_HOURS);
    if (isNaN(h) || h <= 0) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), h);
  });
  return out;
}

/**
 * Latest row per key (ENTERED_AT, then position) of the period. EXCEPTION rows take part: when the latest response
 * for an employee is invalid there is NO fallback to an older valid one (the caller sees best[k].invalid).
 */
function feeds_latestRows_(rows, period, keyFn) {
  var best = {};
  (rows || []).forEach(function (r, i) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var st = feeds_str_(r.STATUS).toUpperCase();
    var k = keyFn(r);
    if (!k) return;
    var it = { r: r, ts: feeds_ts_(r.ENTERED_AT), i: i, invalid: !!st && st !== 'VALID' };
    var cur = best[k];
    if (!cur || it.ts > cur.ts || (it.ts === cur.ts && it.i > cur.i)) best[k] = it;
  });
  return best;
}

/** [{EMP_ID, reason, sourceRef}] for keys whose LATEST row of the period is an EXCEPTION (canteen / efficiency). */
function feeds_currentExceptions(rows, period, keyFn) {
  var best = feeds_latestRows_(rows, period, keyFn || function (r) { return feeds_empId_(r.EMP_ID); });
  return Object.keys(best).filter(function (k) { return best[k].invalid; }).sort().map(function (k) {
    var r = best[k].r;
    return { EMP_ID: feeds_empId_(r.EMP_ID), reason: feeds_str_(r.REMARKS), sourceRef: feeds_str_(r.SOURCE_REF) };
  });
}

function canteenExceptions(rows, period) { return feeds_currentExceptions(rows, period); }
function efficiencyExceptions(rows, period) { return feeds_currentExceptions(rows, period, function (r) { return feeds_effKey_(r.EMP_ID); }); }

/** {EMP_ID: amount} - latest row per PERIOD|EMP_ID wins (form or HR_MANUAL); an invalid latest row yields nothing. */
function canteenByEmp(rows, period) {
  var best = feeds_latestRows_(rows, period, function (r) { return feeds_empId_(r.EMP_ID); });
  var out = {};
  Object.keys(best).forEach(function (id) {
    if (best[id].invalid) return;
    var a = feeds_num_(best[id].r.AMOUNT_INR);
    if (!isNaN(a) && a >= 0) out[id] = a;
  });
  return out;
}

/**
 * {EMP_ID: {pct, physicalDaysOverride, source}} for workerIds, per employee only (no blanket row). An employee with no
 * usable latest row is simply absent (the calculation then pays no production allowance and warns).
 */
function efficiencyByEmp(rows, period, workerIds) {
  var best = feeds_latestRows_(rows, period, function (r) { return feeds_effKey_(r.EMP_ID); });
  var out = {};
  (workerIds || []).forEach(function (raw) {
    var id = feeds_empId_(raw);
    var it = best[id];
    if (!it || it.invalid) return;
    var pct = feeds_num_(it.r.EFFICIENCY_PCT);
    if (isNaN(pct)) return;
    var d = feeds_num_(it.r.PHYSICAL_PRESENT_DAYS_OVERRIDE);
    out[id] = { pct: pct, physicalDaysOverride: isNaN(d) ? null : d, source: 'EMP' };
  });
  return out;
}

function feeds_approvedRows_(rows, period) {
  return (rows || []).filter(function (r) {
    return normalizePeriod(r.PAYROLL_MONTH) === period && feeds_str_(r.APPROVAL_STATUS).toUpperCase() === 'APPROVED';
  });
}

function feeds_sumApproved_(rows, period, col) {
  var out = {};
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var n = feeds_num_(r[col]);
    if (isNaN(n)) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), n);
  });
  return out;
}

/** {EMP_ID: RECOVERY_THIS_MONTH_INR} from APPROVED INPUT_ADVANCE rows (multiple advances sum). */
function advanceByEmp(rows, period) { return feeds_sumApproved_(rows, period, 'RECOVERY_THIS_MONTH_INR'); }

/**
 * Advance checks on APPROVED rows of the period: [{EMP_ID, severity, code, message}].
 *  - WARN  ADVANCE_RECOVERY_EXCEEDS_BALANCE: RECOVERY_THIS_MONTH_INR > OPENING_BALANCE_INR (when both numbers exist)
 *  - BLOCKER ADVANCE_DUPLICATE_LEDGER_REFERENCE: the same ACCOUNTS_LEDGER_REFERENCE twice for one EMP_ID and period
 */
function advanceIssues(rows, period) {
  var out = [], seen = {}, dupDone = {};
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var id = feeds_empId_(r.EMP_ID);
    var rec = feeds_num_(r.RECOVERY_THIS_MONTH_INR), open = feeds_num_(r.OPENING_BALANCE_INR);
    if (!isNaN(rec) && !isNaN(open) && rec > open) {
      out.push({ EMP_ID: id, severity: 'WARN', code: 'ADVANCE_RECOVERY_EXCEEDS_BALANCE',
        message: 'Advance recovery ' + rec + ' exceeds opening balance ' + open });
    }
    var ref = feeds_str_(r.ACCOUNTS_LEDGER_REFERENCE).toUpperCase();
    if (!ref) return;
    var k = id + '|' + ref;
    if (seen[k] && !dupDone[k]) {
      dupDone[k] = true;
      out.push({ EMP_ID: id, severity: 'BLOCKER', code: 'ADVANCE_DUPLICATE_LEDGER_REFERENCE',
        message: 'ACCOUNTS_LEDGER_REFERENCE ' + ref + ' appears more than once for ' + id + ' in ' + period });
    }
    seen[k] = true;
  });
  return out;
}

var FEEDS_SOCIETY_COMPONENTS = ['GENERAL_EMI_INR', 'EMERGENCY_EMI_INR', 'EDUCATION_EMI_INR', 'SHARES_OTHER_INR'];

/**
 * One APPROVED INPUT_SOCIETY row -> {total, mismatch, components}. total = TOTAL_RECOVERY_INR when present, else the
 * sum of the four component columns (blank = 0; NaN when nothing usable). Both present and different -> mismatch.
 */
function feeds_societyRowTotal_(r) {
  var comp = 0, anyComp = false;
  FEEDS_SOCIETY_COMPONENTS.forEach(function (c) {
    var n = feeds_num_(r[c]);
    if (!isNaN(n)) { comp += n; anyComp = true; }
  });
  var tot = feeds_num_(r.TOTAL_RECOVERY_INR);
  if (!isNaN(tot)) return { total: tot, components: anyComp ? comp : null, mismatch: anyComp && Math.abs(tot - comp) > 0.005 };
  return { total: anyComp ? comp : NaN, components: anyComp ? comp : null, mismatch: false };
}

/** {EMP_ID: recovery} from APPROVED INPUT_SOCIETY rows: TOTAL_RECOVERY_INR, or the component sum when the total is blank. */
function societyByEmp(rows, period) {
  var out = {};
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var t = feeds_societyRowTotal_(r).total;
    if (isNaN(t)) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), t);
  });
  return out;
}

/** WARN SOCIETY_TOTAL_MISMATCH where TOTAL_RECOVERY_INR and the component sum are both present and differ. */
function societyIssues(rows, period) {
  var out = [];
  feeds_approvedRows_(rows, period).forEach(function (r) {
    var t = feeds_societyRowTotal_(r);
    if (t.mismatch) {
      out.push({ EMP_ID: feeds_empId_(r.EMP_ID), severity: 'WARN', code: 'SOCIETY_TOTAL_MISMATCH',
        message: 'TOTAL_RECOVERY_INR ' + t.total + ' differs from the component sum ' + t.components + ' (total is used)' });
    }
  });
  return out;
}

/** Pure: form-response event namedValues ({header: [value]}) -> 'YYYY-MM' of the "Payroll Month" answer, or ''. */
function feeds_periodFromNamedValues(namedValues) {
  var nv = namedValues || {};
  var k = Object.keys(nv).filter(function (n) { return /payroll\s*month|^period$/i.test(String(n).trim()); })[0];
  if (k === undefined) return '';
  var v = nv[k];
  if (Array.isArray(v)) v = v[0];
  return feeds_parsePeriodLoose_(v);
}

// ================================================================ sheet-touching entry points

function feeds_isPasswordHeader_(h) { return feeds_norm_(h).indexOf('password') >= 0; }

/** Throws if any selected header is a password column. */
function feeds_assertNoPassword_(headers, cols) {
  cols.forEach(function (c) {
    if (feeds_isPasswordHeader_(headers[c])) throw new Error('Refusing to read password column ' + (c + 1));
  });
}

/**
 * Pure: pick columns by header name. defs=[{key, names, required}]. Password headers are never eligible.
 * Returns {cols:[0-based indexes, unique], missing:[keys]}.
 */
function feeds_selectColumns_(headers, defs) {
  var idx = {};
  headers.forEach(function (h, i) {
    var k = feeds_norm_(h);
    if (k && !feeds_isPasswordHeader_(h) && !(k in idx)) idx[k] = i;
  });
  var cols = [], missing = [];
  defs.forEach(function (d) {
    var at = feeds_col_(idx, d.names);
    if (at < 0) { if (d.required) missing.push(d.key); return; }
    if (cols.indexOf(at) < 0) cols.push(at);
  });
  cols.sort(function (a, b) { return a - b; });
  feeds_assertNoPassword_(headers, cols);
  return { cols: cols, missing: missing };
}

/** Reads row 1 only, then each selected column individually; zips into {header, rows} (selected columns only). */
function feeds_readColumns_(sheet, defs) {
  var lc = sheet.getLastColumn(), lr = sheet.getLastRow();
  if (lc < 1) return { header: [], rows: [], missing: defs.filter(function (d) { return d.required; }).map(function (d) { return d.key; }) };
  var headers = sheet.getRange(1, 1, 1, lc).getValues()[0];
  var sel = feeds_selectColumns_(headers, defs);
  var header = sel.cols.map(function (c) { return headers[c]; });
  var rows = [];
  if (!sel.missing.length && lr >= 2) {
    var data = sel.cols.map(function (c) { return sheet.getRange(2, c + 1, lr - 1, 1).getValues(); });
    for (var r = 0; r < lr - 1; r++) rows.push(data.map(function (col) { return col[r][0]; }));
  }
  return { header: header, rows: rows, missing: sel.missing };
}

var FEEDS_OT_DEFS = [
  { key: 'Timestamp', names: ['timestamp'] },
  { key: 'Submission Type', names: ['submissiontype'], required: true },
  { key: 'EMP ID', names: ['empid', 'employeeid', 'employeecode'], required: true },
  { key: 'Date Of OT', names: ['dateofot', 'otdate'], required: true },
  { key: 'OT Hours', names: ['othours', 'overtimehours'], required: true },
  { key: 'Approval Decision', names: ['approvaldecision', 'decision'], required: true },
  { key: 'Case No', names: ['caseno', 'caseid', 'casenumber'] }
];

/** Whole non-password columns of a form-response tab, read column by column. */
function feeds_readFormColumns_(sheet) {
  var lc = sheet.getLastColumn();
  if (lc < 1) return { header: [], rows: [], missing: [] };
  var headers = sheet.getRange(1, 1, 1, lc).getValues()[0];
  var defs = [];
  headers.forEach(function (h, i) {
    if (feeds_norm_(h) && !feeds_isPasswordHeader_(h)) defs.push({ key: 'c' + i, names: [feeds_norm_(h)] });
  });
  return feeds_readColumns_(sheet, defs);
}

function feeds_lockedPops_(period) {
  var st = getPeriodStatusMap(period), locked = {};
  populationList().forEach(function (p) { if (st[p] === PERIOD_STATUS.LOCKED) locked[p] = true; });
  return locked;
}

/** (population, empId) -> true when that employee is frozen by a lock (held-and-unlocked employees of a locked run stay open). */
function feeds_lockedFn_(period) { return lockScope_(period).isLocked; }

function feeds_toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'HR OS', 5); } catch (e) { /* not in UI context */ }
}

function feeds_existingValues_(tab, col) {
  var set = {};
  readObjects(tab).forEach(function (r) { var v = feeds_str_(r[col]); if (v) set[v] = true; });
  return set;
}

/** Pure: pending OT events -> {population: count}. Events of unknown/inactive EMP_IDs go under UNKNOWN (only when > 0). */
function feeds_pendingByPopulation(pendingEmpIds, popOf) {
  var out = {};
  populationList().forEach(function (p) { out[p] = 0; });
  var unknown = 0;
  (pendingEmpIds || []).forEach(function (id) {
    var p = popOf[feeds_empId_(id)];
    if (p && p in out) out[p]++; else unknown++;
  });
  if (unknown > 0) out.UNKNOWN = unknown;
  return out;
}

/** Pure: JSON text of OT_PENDING_<period> -> {population: count}; blank/invalid -> {}. */
function feeds_parsePendingOt(raw) {
  try {
    var o = JSON.parse(String(raw == null ? '' : raw));
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}

/**
 * Name of the LOCAL tab syncOtFromForm reads when no external spreadsheet is configured: PAYROLL_CONTROL OT_SOURCE_TAB
 * (seeded OT_FORM_RESPONSES) when that tab exists, else the legacy Overtime_Form tab, else ''.
 */
function feeds_localOtTabName_() {
  try {
    if (String(getControl('OT_SOURCE_SPREADSHEET_ID', '')).trim()) return '';
    var want = String(getControl('OT_SOURCE_TAB', '')).trim() || FEEDS_OT_LOCAL_TAB;
    if (getSheet(want)) return want;
    return getSheet(FEEDS_OT_TAB) ? FEEDS_OT_TAB : '';
  } catch (e) { return ''; }
}

/**
 * Opens the OT source. Default: a LOCAL tab of this spreadsheet (the OT form is linked into it) named by
 * PAYROLL_CONTROL OT_SOURCE_TAB (seeded OT_FORM_RESPONSES); if that tab is absent the legacy Overtime_Form tab is used.
 * Only when OT_SOURCE_SPREADSHEET_ID is set (seeded blank) is an external response spreadsheet opened
 * (SpreadsheetApp.openById) and OT_SOURCE_TAB (default "Form Responses 1") read there.
 */
function feeds_openOtSource_() {
  var id = String(getControl('OT_SOURCE_SPREADSHEET_ID', '')).trim();
  var tab = String(getControl('OT_SOURCE_TAB', '')).trim();
  if (!id) {
    var local = tab || FEEDS_OT_LOCAL_TAB;
    var sheet = getSheet(local) || getSheet(FEEDS_OT_TAB);
    if (!sheet) throw new Error('OT source tab not found: neither "' + local + '" nor "' + FEEDS_OT_TAB + '" exists (PAYROLL_CONTROL OT_SOURCE_TAB)');
    return { sheet: sheet, label: sheet.getName() };
  }
  tab = tab || FEEDS_OT_EXTERNAL_TAB;
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) {
    throw new Error('Cannot open the OT source spreadsheet (OT_SOURCE_SPREADSHEET_ID): ' + (e && e.message ? e.message : e));
  }
  var ext = ss.getSheetByName(tab);
  if (!ext) throw new Error('OT source spreadsheet has no tab "' + tab + '" (OT_SOURCE_TAB)');
  return { sheet: ext, label: 'external:' + tab };
}

/**
 * Pure: the payroll period an OT date belongs to. Default = its calendar month; when the NEXT month has an
 * OT_WINDOW_START_<next> override that starts on or before the date (the September catch-up from 26-Aug) the date belongs
 * to that next period. '' when the date is not a valid date.
 */
function feeds_otPeriodForDate(dateIso, controlMap) {
  var iso = feeds_parseDate_(dateIso);
  if (!iso) return '';
  var cal = iso.slice(0, 7), p = parsePeriod(cal);
  var next = p.month === 12 ? (p.year + 1) + '-01' : p.year + '-' + pad2_(p.month + 1);
  var raw = controlMap ? controlMap['OT_WINDOW_START_' + next] : '';
  if (raw !== '' && raw != null) {
    var start = feeds_parseDate_(raw);
    if (start && start <= iso) return next;
  }
  return cal;
}

/** Period of the OT event in one row of the OT source tab (reads the header row and the single Date Of OT cell); '' if unusable or before MIN_PERIOD. */
function feeds_otPeriodOfRow_(sheet, rowNum) {
  var lc = sheet.getLastColumn();
  if (lc < 1) return '';
  var headers = sheet.getRange(1, 1, 1, lc).getValues()[0];
  var col = -1;
  headers.forEach(function (h, i) { if (col < 0 && ['dateofot', 'otdate'].indexOf(feeds_norm_(h)) >= 0) col = i; });
  if (col < 0) return '';
  var period = feeds_otPeriodForDate(sheet.getRange(rowNum, col + 1, 1, 1).getValues()[0][0], readControlMap());
  if (!period) return '';
  try { guardPeriod_(period); } catch (e) { return ''; }
  return period;
}

/**
 * Sync approved OT events for the period from the OT source (needed columns only, never password columns) into
 * INPUT_OT. Re-sync reflects the latest decision: previously written normalizer rows of the period that no longer
 * match are marked ELIGIBILITY=SUPERSEDED (cell updates) and the fresh set is appended; identical rows are kept.
 * The window is the calendar month of the OT date unless OT_WINDOW_START_<period> moves its start.
 */
function syncOtFromForm(period) {
  guardPeriod_(period);
  var src = feeds_openOtSource_();
  var sheet = src.sheet;
  if (sheet.getLastRow() < 2) {
    setControl('OT_PENDING_' + period, JSON.stringify(feeds_pendingByPopulation([], {})), 'pending OT events per population; written by OT sync');
    return { period: period, written: 0, message: 'OT source is empty' };
  }
  var block = feeds_readColumns_(sheet, FEEDS_OT_DEFS); // header row, then only the needed columns
  if (block.missing.length) throw new Error('OT source is missing required column(s): ' + block.missing.join(', '));
  var header = block.header, rows = block.rows;
  var roster = buildRoster(period);
  var popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var win = feeds_otWindow(period, readControlMap());
  var res = mapOtRows(header, rows, period, roster, {}, { firstRow: 2, enteredAt: nowIso_(),
    windowStart: win.start, windowEnd: win.end });
  if (res.missingColumns.length) throw new Error('OT source is missing required column(s): ' + res.missingColumns.join(', '));
  var isLockedEmp = feeds_lockedFn_(period);
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[String(o.EMP_ID).toUpperCase()];
    if (pop && isLockedEmp(pop, o.EMP_ID)) { lockedSkipped++; return false; }
    return true;
  }
  var fresh = res.valid.concat(res.exceptions).filter(open);
  var existing = readObjects(TABS.INPUT_OT).filter(function (r) {
    var pop = popOf[String(r.EMP_ID).toUpperCase()];
    return !(pop && isLockedEmp(pop, r.EMP_ID));
  });
  var plan = feeds_planOtResync(existing, fresh, period);
  var stamp = nowIso_();
  // supersede first: if the append fails the sheet under-pays (visible, re-run fixes) rather than double counts
  updateRows(TABS.INPUT_OT, plan.supersede.map(function (r) { return { row: r._row, values: feeds_supersedeValues(r, stamp) }; }));
  if (plan.append.length) appendObjects(TABS.INPUT_OT, plan.append, { textHeaders: ['OT_KEY', 'OT_DATE', 'DATE_RANGE'] });
  var newValid = plan.append.filter(function (o) { return o.ELIGIBILITY === 'VALID'; });
  var summary = { period: period, source: src.label, window: win.start + '..' + win.end, windowOverridden: win.overridden,
    validWritten: newValid.length,
    exceptionsWritten: plan.append.length - newValid.length, superseded: plan.supersede.length, unchanged: plan.unchanged,
    revokedByRejection: res.revokedCount, correctedApprovals: res.correctedCount,
    pending: res.pendingCount, duplicatesSkipped: res.duplicateSkipped, lockedSkipped: lockedSkipped,
    validHours: newValid.reduce(function (t, o) { return t + o.OT_HOURS; }, 0) };
  // remember pending (not yet approved/rejected) OT events per population so readiness can WARN
  summary.pendingByPopulation = feeds_pendingByPopulation(res.pendingEmpIds, popOf);
  setControl('OT_PENDING_' + period, JSON.stringify(summary.pendingByPopulation), 'pending OT events per population; written by OT sync');
  audit('OT_SYNC', period, '', summary);
  feeds_toast_('OT sync: ' + summary.validWritten + ' new valid, ' + summary.superseded + ' superseded, ' +
    summary.exceptionsWritten + ' exception(s), ' + res.pendingCount + ' pending');
  return summary;
}

function feeds_syncForm_(period, tab, target, mapper, name, action) {
  guardPeriod_(period);
  var sheet = getSheet(tab);
  if (!sheet) throw new Error('Missing tab ' + tab);
  var block = feeds_readFormColumns_(sheet);
  var roster = buildRoster(period);
  // only VALID rows make a response "already imported"; an EXCEPTION is re-evaluated on every sync (so fixing the
  // cause, e.g. the master, clears it) and only re-written when it is a new problem
  var refs = {}, excKeys = {};
  readObjects(target).forEach(function (r) {
    var ref = feeds_str_(r.SOURCE_REF), st = feeds_str_(r.STATUS).toUpperCase();
    if (!ref) return;
    if (st === 'EXCEPTION') excKeys[ref + '|' + feeds_str_(r.REMARKS)] = true; else refs[ref] = true;
  });
  var res = mapper(block.header, block.rows, period, roster, refs, { firstRow: 2, enteredAt: nowIso_() });
  if (res.missingColumns.length) throw new Error(tab + ' is missing required column(s): ' + res.missingColumns.join(', '));
  res.exceptions = res.exceptions.filter(function (o) {
    if (excKeys[o.SOURCE_REF + '|' + o.REMARKS]) { res.skippedExisting++; return false; }
    return true;
  });
  var isLockedEmp = feeds_lockedFn_(period), popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[o.EMP_ID];
    if (pop && isLockedEmp(pop, o.EMP_ID)) { lockedSkipped++; return false; }
    return true;
  }
  var toWrite = res.valid.concat(res.exceptions).filter(open);
  if (toWrite.length) appendObjects(target, toWrite, { textHeaders: ['KEY', 'SOURCE_REF'] });
  var summary = { period: period, feed: name, written: toWrite.length - res.exceptions.filter(open).length,
    exceptions: res.exceptions.filter(open).length, skippedExisting: res.skippedExisting, lockedSkipped: lockedSkipped };
  audit(action, period, '', summary);
  feeds_toast_(name + ' sync: ' + summary.written + ' written, ' + summary.exceptions + ' exception(s)');
  return summary;
}

function syncCanteenFromForm(period) {
  return feeds_syncForm_(period, FEEDS_CANTEEN_TAB, TABS.INPUT_CANTEEN, mapCanteenRows, 'CANTEEN', 'CANTEEN_SYNC');
}

function syncEfficiencyFromForm(period) {
  return feeds_syncForm_(period, FEEDS_EFFICIENCY_TAB, TABS.INPUT_EFFICIENCY, mapEfficiencyRows, 'EFFICIENCY', 'EFFICIENCY_SYNC');
}
