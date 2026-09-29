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
var FEEDS_MAX_TRIGGERS = 5;
var FEEDS_ALL_WORKERS = 'ALL_WORKERS';

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

/** Efficiency EMP_ID key: only the ALL WORKERS sentinel is normalised; hyphens/spaces inside real EMP_IDs are kept. */
function feeds_effKey_(v) {
  var id = feeds_empId_(v);
  return /^ALL[\s\-_]+WORKERS$/.test(id) ? FEEDS_ALL_WORKERS : id;
}

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
 * @param {Object} [opts] {firstRow: sheet row number of rows[0], default 2, enteredAt}
 * @returns {{valid:Array, exceptions:Array, pendingCount:number, pendingEmpIds:Array, duplicateSkipped:number, missingColumns:Array}}
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
  var out = { valid: [], exceptions: [], pendingCount: 0, pendingEmpIds: [], duplicateSkipped: 0, missingColumns: missing };
  if (missing.length) return out; // fail closed: nothing counted without required headers

  var pStart = periodStart(period), pEnd = periodEnd(period);
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
    var h = feeds_num_(feeds_cell_(ev.row, c.hours));
    out.exceptions.push(baseRow(ev, { ELIGIBILITY: 'EXCEPTION', EXCEPTION_REASON: reason,
      OT_HOURS: isNaN(h) ? '' : h, APPROVAL_STATUS: 'EXCEPTION' }));
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
      g.approved.forEach(function (ev) { pushException(ev, 'REVOKED_BY_LATER_REJECTION'); });
      return;
    }
    if (g.approved.length > 1) {
      var hrs = g.approved.map(function (ev) { return feeds_num_(feeds_cell_(ev.row, c.hours)); });
      var same = hrs.every(function (h) { return h === hrs[0]; });
      if (!same) {
        g.approved.forEach(function (ev) { pushException(ev, 'CONFLICTING_DUPLICATE_APPROVALS'); });
        return;
      }
      // identical repeated approvals of the same event: count the latest only
      g.approved.slice(0, -1).forEach(function () { out.duplicateSkipped++; });
    }
    acceptApproved(latestApproved);
  });

  return out;
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
    reason: feeds_col_(idx, ['correctionreason'])
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
 * Efficiency form responses -> INPUT_EFFICIENCY rows. EMP_ID may be ALL_WORKERS.
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
    if (it.emp !== FEEDS_ALL_WORKERS) {
      var r = rosterMap[it.emp];
      if (!r) reason = 'UNKNOWN_OR_INACTIVE_EMP_ID';
      else if (r.PAYROLL_CATEGORY && r.PAYROLL_CATEGORY !== POP.PERMANENT_WORKER) reason = 'NOT_A_PERMANENT_WORKER';
    }
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
 * VALID OT hours per EMP_ID for the period. Legacy rows (no NORMALIZER_VERSION) and anything not ELIGIBILITY=VALID
 * are never counted.
 */
function sumOtHours(rows, period) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.ELIGIBILITY).toUpperCase() !== 'VALID') return;
    if (!feeds_str_(r.NORMALIZER_VERSION)) return;
    var st = feeds_str_(r.APPROVAL_STATUS).toUpperCase();
    if (st && st !== 'APPROVED') return;
    var h = feeds_num_(r.OT_HOURS);
    if (isNaN(h) || h <= 0) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), h);
  });
  return out;
}

/** Latest row per key (ENTERED_AT, then position) among usable rows of the period. */
function feeds_latestRows_(rows, period, keyFn) {
  var best = {};
  (rows || []).forEach(function (r, i) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    var st = feeds_str_(r.STATUS).toUpperCase();
    if (st && st !== 'VALID') return;
    var k = keyFn(r);
    if (!k) return;
    var it = { r: r, ts: feeds_ts_(r.ENTERED_AT), i: i };
    var cur = best[k];
    if (!cur || it.ts > cur.ts || (it.ts === cur.ts && it.i > cur.i)) best[k] = it;
  });
  return best;
}

/** {EMP_ID: amount} - latest VALID row per PERIOD|EMP_ID wins (form or HR_MANUAL). */
function canteenByEmp(rows, period) {
  var best = feeds_latestRows_(rows, period, function (r) { return feeds_empId_(r.EMP_ID); });
  var out = {};
  Object.keys(best).forEach(function (id) {
    var a = feeds_num_(best[id].r.AMOUNT_INR);
    if (!isNaN(a) && a >= 0) out[id] = a;
  });
  return out;
}

/**
 * {EMP_ID: {pct, physicalDaysOverride, source}} for workerIds. A per-employee row overrides ALL_WORKERS entirely.
 */
function efficiencyByEmp(rows, period, workerIds) {
  var best = feeds_latestRows_(rows, period, function (r) {
    return feeds_effKey_(r.EMP_ID);
  });
  function read(it, source) {
    var pct = feeds_num_(it.r.EFFICIENCY_PCT);
    if (isNaN(pct)) return null;
    var d = feeds_num_(it.r.PHYSICAL_PRESENT_DAYS_OVERRIDE);
    return { pct: pct, physicalDaysOverride: isNaN(d) ? null : d, source: source };
  }
  var all = best[FEEDS_ALL_WORKERS] ? read(best[FEEDS_ALL_WORKERS], FEEDS_ALL_WORKERS) : null;
  var out = {};
  (workerIds || []).forEach(function (raw) {
    var id = feeds_empId_(raw);
    var own = best[id] ? read(best[id], 'EMP') : null;
    var v = own || all;
    if (v) out[id] = { pct: v.pct, physicalDaysOverride: v.physicalDaysOverride, source: v.source };
  });
  return out;
}

function feeds_sumApproved_(rows, period, col) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.APPROVAL_STATUS).toUpperCase() !== 'APPROVED') return;
    var n = feeds_num_(r[col]);
    if (isNaN(n)) return;
    feeds_add_(out, feeds_empId_(r.EMP_ID), n);
  });
  return out;
}

/** {EMP_ID: RECOVERY_THIS_MONTH_INR} from APPROVED INPUT_ADVANCE rows (multiple advances sum). */
function advanceByEmp(rows, period) { return feeds_sumApproved_(rows, period, 'RECOVERY_THIS_MONTH_INR'); }

/** {EMP_ID: TOTAL_RECOVERY_INR} from APPROVED INPUT_SOCIETY rows. */
function societyByEmp(rows, period) { return feeds_sumApproved_(rows, period, 'TOTAL_RECOVERY_INR'); }

// ================================================================ trigger planning (pure)

/**
 * existing: [{handler, sourceId}], wanted: [{handler, formId}]. Returns {toCreate:[...], present:n}; throws if the
 * project would exceed max triggers.
 */
function feeds_planTriggers(existing, wanted, max) {
  var toCreate = [], present = 0;
  wanted.forEach(function (w) {
    var dup = existing.some(function (e) { return e.handler === w.handler && String(e.sourceId) === String(w.formId); });
    if (dup) present++; else toCreate.push(w);
  });
  if (existing.length + toCreate.length > (max || FEEDS_MAX_TRIGGERS)) {
    throw new Error('Installing ' + toCreate.length + ' trigger(s) would exceed the ' + (max || FEEDS_MAX_TRIGGERS) +
      ' trigger limit (' + existing.length + ' already installed)');
  }
  return { toCreate: toCreate, present: present };
}

/** Pure: [{title, response}] -> 'YYYY-MM' of the "Payroll Month" answer, or ''. */
function feeds_periodFromAnswers(items) {
  for (var i = 0; i < (items || []).length; i++) {
    if (/payroll\s*month|^period$/i.test(String(items[i].title || ''))) {
      var v = items[i].response;
      if (Array.isArray(v)) v = v[0];
      return feeds_parsePeriodLoose_(v);
    }
  }
  return '';
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
  POPULATION_LIST.forEach(function (p) { if (st[p] === PERIOD_STATUS.LOCKED) locked[p] = true; });
  return locked;
}

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
  POPULATION_LIST.forEach(function (p) { out[p] = 0; });
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

/** Sync approved OT events for the period from Overtime_Form (needed columns only, never password columns) into INPUT_OT. Append-only, idempotent. */
function syncOtFromForm(period) {
  guardPeriod_(period);
  var sheet = resolveSheet_(FEEDS_OT_TAB);
  if (sheet.getLastRow() < 2) {
    setControl('OT_PENDING_' + period, JSON.stringify(feeds_pendingByPopulation([], {})), 'pending OT events per population; written by OT sync');
    return { period: period, written: 0, message: 'Overtime_Form is empty' };
  }
  var block = feeds_readColumns_(sheet, FEEDS_OT_DEFS); // header row, then only the needed columns
  if (block.missing.length) throw new Error('Overtime_Form is missing required column(s): ' + block.missing.join(', '));
  var header = block.header, rows = block.rows;
  var roster = buildRoster();
  var popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var existing = feeds_existingValues_(TABS.INPUT_OT, 'OT_KEY');
  var res = mapOtRows(header, rows, period, roster, existing, { firstRow: 2, enteredAt: nowIso_() });
  if (res.missingColumns.length) throw new Error('Overtime_Form is missing required column(s): ' + res.missingColumns.join(', '));
  var locked = feeds_lockedPops_(period);
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[o.EMP_ID];
    if (pop && locked[pop]) { lockedSkipped++; return false; }
    return true;
  }
  var valid = res.valid.filter(open), exceptions = res.exceptions.filter(open);
  var toWrite = valid.concat(exceptions);
  if (toWrite.length) appendObjects(TABS.INPUT_OT, toWrite, { textHeaders: ['OT_KEY', 'OT_DATE', 'DATE_RANGE'] });
  var summary = { period: period, validWritten: valid.length, exceptionsWritten: exceptions.length,
    pending: res.pendingCount, duplicatesSkipped: res.duplicateSkipped, lockedSkipped: lockedSkipped,
    validHours: valid.reduce(function (s, o) { return s + o.OT_HOURS; }, 0) };
  // remember pending (not yet approved/rejected) OT events per population so readiness can WARN
  summary.pendingByPopulation = feeds_pendingByPopulation(res.pendingEmpIds, popOf);
  setControl('OT_PENDING_' + period, JSON.stringify(summary.pendingByPopulation), 'pending OT events per population; written by OT sync');
  audit('OT_SYNC', period, '', summary);
  feeds_toast_('OT sync: ' + valid.length + ' valid, ' + exceptions.length + ' exception(s), ' + res.pendingCount + ' pending');
  return summary;
}

function feeds_syncForm_(period, tab, target, mapper, name, action) {
  guardPeriod_(period);
  var sheet = getSheet(tab);
  if (!sheet) throw new Error('Missing tab ' + tab);
  var block = feeds_readFormColumns_(sheet);
  var roster = buildRoster();
  var refs = feeds_existingValues_(target, 'SOURCE_REF');
  var res = mapper(block.header, block.rows, period, roster, refs, { firstRow: 2, enteredAt: nowIso_() });
  if (res.missingColumns.length) throw new Error(tab + ' is missing required column(s): ' + res.missingColumns.join(', '));
  var locked = feeds_lockedPops_(period), popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var lockedSkipped = 0;
  function open(o) {
    var pop = popOf[o.EMP_ID];
    if (o.EMP_ID === FEEDS_ALL_WORKERS) pop = POP.PERMANENT_WORKER;
    if (pop && locked[pop]) { lockedSkipped++; return false; }
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

function feeds_onSubmit_(e, syncFn, label) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var period = '';
    if (e && e.response && e.response.getItemResponses) {
      period = feeds_periodFromAnswers(e.response.getItemResponses().map(function (ir) {
        return { title: ir.getItem().getTitle(), response: ir.getResponse() };
      }));
    }
    if (!period && e && e.namedValues) {
      var k = Object.keys(e.namedValues).filter(function (n) { return /payroll\s*month/i.test(n); })[0];
      if (k) period = feeds_parsePeriodLoose_(e.namedValues[k][0]);
    }
    if (!period) { audit(label + '_SUBMIT_SKIPPED', '', '', 'Payroll Month not found in response'); return null; }
    return syncFn(period);
  } catch (err) {
    try { audit(label + '_SUBMIT_ERROR', '', '', String(err && err.message ? err.message : err)); } catch (e2) { /* ignore */ }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function onCanteenFormSubmit(e) { return feeds_onSubmit_(e, syncCanteenFromForm, 'CANTEEN'); }
function onEfficiencyFormSubmit(e) { return feeds_onSubmit_(e, syncEfficiencyFromForm, 'EFFICIENCY'); }

/** Idempotently install canteen/efficiency onFormSubmit triggers when their form IDs are in PAYROLL_CONTROL. */
function installFeedTriggers() {
  var wanted = [];
  var cid = String(getControl('CANTEEN_FORM_ID', '')).trim();
  var eid = String(getControl('EFFICIENCY_FORM_ID', '')).trim();
  if (cid) wanted.push({ handler: 'onCanteenFormSubmit', formId: cid });
  if (eid) wanted.push({ handler: 'onEfficiencyFormSubmit', formId: eid });
  if (!wanted.length) {
    return 'Set CANTEEN_FORM_ID and/or EFFICIENCY_FORM_ID in PAYROLL_CONTROL, then run this again.';
  }
  var existing = ScriptApp.getProjectTriggers().map(function (t) {
    return { handler: t.getHandlerFunction(), sourceId: t.getTriggerSourceId ? t.getTriggerSourceId() : '' };
  });
  var plan = feeds_planTriggers(existing, wanted, FEEDS_MAX_TRIGGERS);
  plan.toCreate.forEach(function (w) {
    ScriptApp.newTrigger(w.handler).forForm(FormApp.openById(w.formId)).onFormSubmit().create();
  });
  var res = { created: plan.toCreate.length, alreadyPresent: plan.present, totalTriggers: existing.length + plan.toCreate.length,
    missingFormIds: (cid ? [] : ['CANTEEN_FORM_ID']).concat(eid ? [] : ['EFFICIENCY_FORM_ID']) };
  audit('FEED_TRIGGERS_INSTALL', '', '', res);
  return res;
}
