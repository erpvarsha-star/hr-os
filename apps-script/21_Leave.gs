/**
 * 21_Leave.gs - leave sync (DESIGN section 2, "Leave").
 * The leave application form lives in its OWN spreadsheet (its own approval process and yearly balances). It is read
 * READ-ONLY (SpreadsheetApp.openById, header-selective reads, password columns never selected) and normalised into the
 * controlled INPUT_LEAVE tab; the register derivation (12_Register.gs) then turns approved leave into EL / CL / SL /
 * C-Off / OD / LWP days. The same spreadsheet also holds the yearly leave balances printed on the payslip.
 *
 * Source layout (Leave_Applications): an event log. Employees add "Apply ..." rows; the approver later adds separate
 * "Approval (for admin use only)" rows (a new row, not an update) that repeat the employee / dates / type and carry the
 * decision. Most approvals have no Apply row in the log, so an approval is self-contained; an Apply row only links, by
 * EMP_ID + start + end + type (never by Case No, which is shared by different leaves).
 * Pure: mapLeaveRows, leave_window, leave_normalizeType, leave_planResync, leaveByEmp, leaveExceptions, leave_balanceColumns_.
 * Sheet-touching: syncLeaveFromSource, leaveAutoSync_, leave_readBalances_.
 */
var LEAVE_NORMALIZER_VERSION = 'LEAVE-1.0';
var LEAVE_MAX_SPAN_DAYS = 92;
var LEAVE_DEFAULT_TAB = 'Leave_Applications';
var LEAVE_DEFS = [
  { key: 'Timestamp', names: ['timestamp'] },
  { key: 'Submission Type', names: ['submissiontype'], required: true },
  { key: 'Employee ID', names: ['employeeid', 'empid', 'employeecode'], required: true },
  { key: 'Leave Start Date', names: ['leavestartdate', 'startdate', 'fromdate'], required: true },
  { key: 'Leave Start Date Half', names: ['leavestartdatehalf', 'startdatehalf'] },
  { key: 'Leave End Date', names: ['leaveenddate', 'enddate', 'todate'], required: true },
  { key: 'Leave End Date Half', names: ['leaveenddatehalf', 'enddatehalf'] },
  { key: 'Leave Type', names: ['leavetype'], required: true },
  { key: 'Approval Decision', names: ['approvaldecision', 'decision'], required: true },
  { key: 'Approved Number of days', names: ['approvednumberofdays', 'approveddays'] },
  { key: 'Case No', names: ['caseno', 'caseid', 'casenumber'] }
];
var LEAVE_BALANCE_TABS = { STAFF: 'Leave Databse Staff', PERMANENT_WORKER: 'Leave Dadabase PW', CONSULTANT: 'Leave Dadabase CON' };
var LEAVE_BALANCE_ALIASES = {
  EL: ['elavailable', 'elbalance', 'elavailablebalance', 'availableel', 'elavail'],
  CL: ['clavailable', 'clbalance', 'clavailablebalance', 'availablecl', 'clavail'],
  SL: ['slavailable', 'slbalance', 'slavailablebalance', 'availablesl', 'slavail']
};
var LEAVE_BALANCE_EMP_ALIASES = ['employeeid', 'empid', 'empcode', 'employeecode'];
var LEAVE_BALANCE_HEADER_SCAN_ROWS = 6;

// ================================================================ pure helpers

/**
 * 'Earned Leave (EL)', 'casual Leave (CL)', 'MEdical Leave (SL)', 'Outdoor Duty (OD)', 'Compensatory Off- C/Off',
 * 'Leave Without Pay (LWP)' -> EL | CL | SL | OD | COFF | LWP (case / spacing insensitive). Anything that does not
 * match exactly one type -> null (the caller raises an exception row).
 */
function leave_normalizeType(raw) {
  var s = String(raw == null ? '' : raw).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  var hits = [];
  if (/\bel\b|earned/.test(s)) hits.push('EL');
  if (/\bcl\b|casual/.test(s)) hits.push('CL');
  if (/\bsl\b|medical|sick/.test(s)) hits.push('SL');
  if (/\bod\b|outdoor/.test(s)) hits.push('OD');
  if (/c\s*\/\s*off|compensat/.test(s)) hits.push('COFF');
  if (/\blwp\b|without pay|loss of pay/.test(s)) hits.push('LWP');
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Half-day flag cell -> 'FULL' | 'HALF' | 'UNKNOWN'. Blank = full day. SIDE-AWARE (side = 'START' | 'END'): the leave form's
 * flags are "First Half" / "Second Half" on both sides, meaning "leave begins at the start of the day (full first day)" /
 * "begins after lunch (half first day)" for the start date, and "runs to the end of the day (full last day)" / "ends at
 * lunch (half last day)" for the end date. So START "Second Half" = half, START "First Half" = full,
 * END "First Half" = half, END "Second Half" = full. Generic words (Half, Half Day, Yes, 0.5) mean half on either side.
 */
function leave_halfFlag_(v, side) {
  if (v == null || v === '') return 'FULL';
  if (v === true) return 'HALF';
  if (v === false) return 'FULL';
  if (typeof v === 'number') return v === 0 ? 'FULL' : (v === 0.5 ? 'HALF' : 'UNKNOWN');
  var s = String(v).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return 'FULL';
  if (/\bno\b|\bnot\b|^n$|^false$|^0$|^none$|^-$|full/.test(s)) return 'FULL';
  if (/^(second|2nd)\b/.test(s)) return side === 'END' ? 'FULL' : 'HALF';
  if (/^(first|1st)\b/.test(s)) return side === 'END' ? 'HALF' : 'FULL';
  if (/half|^yes$|^y$|^true$|^1$|^0\.5$/.test(s)) return 'HALF';
  return 'UNKNOWN';
}

/**
 * Leave window of a period (pure). Default = the CALENDAR month of the period (the leave sheet's own 26th-25th "Month" column
 * is never used). PAYROLL_CONTROL key LEAVE_WINDOW_START_<YYYY-MM> (ISO date) moves the start for that period only, e.g. the
 * one-time catch-up LEAVE_WINDOW_START_2026-09 = 2026-08-26 (August payroll counted leave only up to 25-Aug).
 * @returns {{start:string, end:string, overridden:boolean}}
 */
function leave_window(period, controlMap) {
  parsePeriod(period);
  var start = periodStart(period), end = periodEnd(period), overridden = false;
  var key = 'LEAVE_WINDOW_START_' + period;
  var raw = controlMap ? controlMap[key] : '';
  if (raw !== '' && raw != null) {
    var iso = feeds_parseDate_(raw);
    if (!iso) throw new Error(key + ' must be a date (YYYY-MM-DD), got "' + raw + '"');
    if (iso > end) throw new Error(key + ' (' + iso + ') is after the end of the period ' + end);
    if (iso !== start) { start = iso; overridden = true; }
  }
  return { start: start, end: end, overridden: overridden };
}

function leave_addDays_(iso, n) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/** Inclusive ISO dates start..end (start <= end, span already checked by the caller). */
function leave_range_(start, end) {
  var out = [], d = start;
  while (d <= end) { out.push(d); d = leave_addDays_(d, 1); }
  return out;
}

function leave_r2_(x) { return Math.round(x * 100) / 100; }

/** Timestamp cell -> 'YYYY-MM' ('' if unusable). */
function leave_tsPeriod_(v) {
  var iso = feeds_parseDate_(v);
  return iso ? iso.slice(0, 7) : '';
}

/**
 * Pure. Leave source rows -> INPUT_LEAVE rows for ONE period.
 *  - Window: the calendar month of the period unless opts.window {start, end} moves it (LEAVE_WINDOW_START_<period>, see
 *    leave_window). The sheet's 26th-25th cycle / Month column is not used.
 *  - Groups: an approval is linked to an application ONLY by EMP_ID + start date + end date + normalized leave type. Case No is
 *    informational (kept in CASE_NO); it is shared by different leaves of one employee and is never a grouping key. The
 *    LATEST decisive row (Approved / Rejected, by timestamp then row) of a group wins; only Approved counts; a later Rejected
 *    revokes (counted, no exception). An Apply row that itself carries Approval Decision = Approved counts as approved.
 *  - Days: 'Approved Number of days' when present (it wins; the half-day flags are then ignored), otherwise computed from the
 *    dates with the side-aware half-day flags. Approved days are CALENDAR days including weekly offs (as the leave sheet
 *    deducts them); they are never rescaled and spread evenly over ALL dates of the range (no weekly-off / holiday exclusion);
 *    only the dates inside the window are counted. Multi-month leave is therefore split per date.
 *  - Exceptions (never counted): unknown employee, unknown leave type, unparseable / implausible dates, end before start,
 *    invalid or over-range approved days, unrecognised half-day flag (only when the days are computed from flags) or
 *    decision, and a date claimed by two DIFFERENT approved leaves of one employee for more than one day. Only groups that
 *    touch the window can raise exceptions.
 * @param {Array} headers selected header cells; @param {Array<Array>} rows zipped rows; @param {string} period
 * @param {Array} roster [{EMP_ID, PAYROLL_CATEGORY, SITE}]
 * @param {Object} [opts] {firstRow, enteredAt, sourceLabel, window {start, end}}
 * @returns {{valid:Array, exceptions:Array, pendingCount:number, revokedCount:number, missingColumns:Array}}
 */
function mapLeaveRows(headers, rows, period, roster, opts) {
  parsePeriod(period);
  opts = opts || {};
  var firstRow = opts.firstRow || 2, enteredAt = opts.enteredAt || '', label = opts.sourceLabel || 'LEAVE';
  var idx = feeds_headerIndex_(headers);
  var c = {};
  LEAVE_DEFS.forEach(function (d) { c[d.key] = feeds_col_(idx, d.names); });
  var out = { valid: [], exceptions: [], pendingCount: 0, revokedCount: 0, missingColumns: [] };
  LEAVE_DEFS.forEach(function (d) { if (d.required && c[d.key] < 0) out.missingColumns.push(d.key); });
  if (out.missingColumns.length) return out; // fail closed: nothing counted without the required headers

  var pStart = opts.window ? opts.window.start : periodStart(period), pEnd = opts.window ? opts.window.end : periodEnd(period);
  var rosterMap = feeds_rosterMap_(roster);
  var cell = function (row, key) { return feeds_cell_(row, c[key]); };

  var parsed = [];
  rows.forEach(function (row, i) {
    var emp = feeds_empId_(cell(row, 'Employee ID')), typeRaw = feeds_str_(cell(row, 'Submission Type'));
    if (!emp && !typeRaw) return; // empty template row
    var tn = feeds_norm_(typeRaw);
    var p = {
      i: i, srcRow: firstRow + i, emp: emp, typeRaw: typeRaw,
      kind: tn.indexOf('approval') >= 0 ? 'APPROVAL' : (tn.indexOf('apply') >= 0 ? 'APPLY' : 'OTHER'),
      ts: feeds_ts_(cell(row, 'Timestamp')), tsRaw: cell(row, 'Timestamp'),
      ltRaw: feeds_str_(cell(row, 'Leave Type')),
      start: feeds_parseDate_(cell(row, 'Leave Start Date')), end: feeds_parseDate_(cell(row, 'Leave End Date')),
      startRaw: feeds_str_(cell(row, 'Leave Start Date')), endRaw: feeds_str_(cell(row, 'Leave End Date')),
      startHalf: leave_halfFlag_(cell(row, 'Leave Start Date Half'), 'START'), endHalf: leave_halfFlag_(cell(row, 'Leave End Date Half'), 'END'),
      dec: feeds_str_(cell(row, 'Approval Decision')).toLowerCase(),
      decRaw: feeds_str_(cell(row, 'Approval Decision')),
      appDaysRaw: cell(row, 'Approved Number of days'),
      kase: feeds_str_(cell(row, 'Case No'))
    };
    p.type = leave_normalizeType(p.ltRaw);
    p.fb = p.emp + '|' + p.start + '|' + p.end + '|' + (p.type || p.ltRaw.toLowerCase());
    parsed.push(p);
  });

  function relevant(p) {
    var s = p.start, e = p.end;
    if (!s && !e) { var tp = leave_tsPeriod_(p.tsRaw); return !tp || tp === period; }
    if (s && e && e < s) return (s >= pStart && s <= pEnd) || (e >= pStart && e <= pEnd);
    var lo = s || e, hi = e || s;
    return lo <= pEnd && hi >= pStart;
  }
  var order = function (a, b) { return (a.ts - b.ts) || (a.i - b.i); };

  var problems = [];  // {p, reason, detail}
  function problem(p, reason, detail) { problems.push({ p: p, reason: reason, detail: detail || '' }); }

  // groups: ONLY EMP_ID + start + end + type (Case No never groups)
  var groups = {}, groupOrder = [];
  parsed.forEach(function (p) {
    if (p.kind === 'OTHER') return;
    var gid = p.fb;
    if (!groups[gid]) { groups[gid] = []; groupOrder.push(gid); }
    groups[gid].push(p);
  });

  var winners = [];
  groupOrder.forEach(function (gid) {
    var g = groups[gid].slice().sort(order);
    // a decisive row: Approved / Rejected on an approval row, or Approved / Rejected written on the application row itself
    var decisive = g.filter(function (p) { return p.dec === 'approved' || p.dec === 'rejected'; });
    var odd = g.filter(function (p) { return p.kind === 'APPROVAL' && p.dec && p.dec !== 'approved' && p.dec !== 'rejected'; });
    var lastD = decisive.length ? decisive[decisive.length - 1] : null;
    var lastOdd = odd.length ? odd[odd.length - 1] : null;
    if (lastOdd && (!lastD || order(lastOdd, lastD) > 0)) {
      if (relevant(lastOdd)) problem(lastOdd, 'UNRECOGNISED_DECISION', '"' + lastOdd.decRaw + '"');
      return;
    }
    if (!lastD) { if (relevant(g[g.length - 1])) out.pendingCount++; return; }
    if (!relevant(lastD)) return;
    if (lastD.dec === 'rejected') { out.revokedCount++; return; }
    winners.push(lastD);
  });

  winners.sort(function (a, b) {
    return a.emp < b.emp ? -1 : (a.emp > b.emp ? 1 : ((a.start < b.start ? -1 : (a.start > b.start ? 1 : 0)) || order(a, b)));
  });

  var used = {};
  winners.forEach(function (w) {
    var fail = function (reason, detail) { problem(w, reason, detail); };
    if (!w.emp) return fail('MISSING_EMP_ID');
    if (!rosterMap[w.emp]) return fail('UNKNOWN_OR_INACTIVE_EMP_ID');
    if (!w.type) return fail('UNKNOWN_LEAVE_TYPE', '"' + w.ltRaw + '"');
    if (!w.start) return fail('START_DATE_UNPARSEABLE', '"' + w.startRaw + '"');
    if (!w.end) return fail('END_DATE_UNPARSEABLE', '"' + w.endRaw + '"');
    if (w.end < w.start) return fail('END_BEFORE_START', w.start + '..' + w.end);
    if (w.start < '2020-01-01' || w.end > '2100-12-31') return fail('DATE_IMPLAUSIBLE', w.start + '..' + w.end);
    var spanCap = leave_addDays_(w.start, LEAVE_MAX_SPAN_DAYS + 1); // never enumerate a runaway range
    var dates = leave_range_(w.start, w.end < spanCap ? w.end : spanCap);
    if (dates.length > LEAVE_MAX_SPAN_DAYS) return fail('LEAVE_SPAN_TOO_LONG', dates.length + ' day(s) from ' + w.start);
    var approved = null;
    if (w.appDaysRaw !== '' && w.appDaysRaw != null) {
      approved = feeds_num_(w.appDaysRaw);
      if (isNaN(approved) || approved <= 0) return fail('APPROVED_DAYS_INVALID', '"' + w.appDaysRaw + '"');
      if (approved > dates.length) return fail('APPROVED_DAYS_EXCEED_RANGE', approved + ' > ' + dates.length + ' date(s)');
    } else if (w.startHalf === 'UNKNOWN' || w.endHalf === 'UNKNOWN') {
      return fail('HALF_DAY_FLAG_UNRECOGNISED');
    }
    // per-date share: approved days spread evenly over ALL calendar dates of the range; otherwise the flag weights
    var share = dates.map(function (d) {
      if (approved !== null) return approved / dates.length;
      var x = 1;
      if (d === w.start && w.startHalf === 'HALF') x = 0.5;
      if (d === w.end && w.endHalf === 'HALF') x = 0.5;
      return x;
    });
    var days = 0, clash = '';
    dates.forEach(function (d, k) {
      if (d < pStart || d > pEnd) return;
      var a = share[k];
      if (a <= 0) return;
      var u = used[w.emp + '|' + d] || 0;
      if (u + a > 1 + 1e-9 && !clash) clash = d;
      days += a;
    });
    if (clash) return fail('OVERLAPS_OTHER_LEAVE', 'on ' + clash);
    days = leave_r2_(days);
    if (days <= 0) return;
    dates.forEach(function (d, k) {
      if (d >= pStart && d <= pEnd) used[w.emp + '|' + d] = (used[w.emp + '|' + d] || 0) + share[k];
    });
    out.valid.push({ PAYROLL_MONTH: period, EMP_ID: w.emp, LEAVE_TYPE: w.type, DAYS: days, FROM_DATE: w.start, TO_DATE: w.end,
      SOURCE_REF: label + '!' + w.srcRow, CASE_NO: w.kase, KEY: w.emp + '|' + w.type + '|' + w.start + '|' + w.end, STATUS: 'VALID',
      EXCEPTION_REASON: '', NORMALIZER_VERSION: LEAVE_NORMALIZER_VERSION, ENTERED_AT: enteredAt });
  });

  problems.forEach(function (x) {
    var p = x.p;
    out.exceptions.push({ PAYROLL_MONTH: period, EMP_ID: p.emp, LEAVE_TYPE: p.type || p.ltRaw, DAYS: 0,
      FROM_DATE: p.start, TO_DATE: p.end, SOURCE_REF: label + '!' + p.srcRow, CASE_NO: p.kase,
      KEY: p.emp + '|' + (p.type || 'RAW') + '|' + (p.start || 'NODATE') + '|' + (p.end || 'NODATE') + '|R' + p.srcRow,
      STATUS: 'EXCEPTION', EXCEPTION_REASON: x.reason + (x.detail ? ' | ' + x.detail : '') +
        (p.appDaysRaw !== '' && p.appDaysRaw != null ? ' | APPROVED_DAYS=' + p.appDaysRaw : ''),
      NORMALIZER_VERSION: LEAVE_NORMALIZER_VERSION, ENTERED_AT: enteredAt });
  });
  return out;
}

function leave_isNormalizerRow_(r) {
  return !!feeds_str_(r.NORMALIZER_VERSION) && !!feeds_str_(r.KEY);
}

/** {EMP_ID: {EL, CL, SL, OD, COFF, LWP}} in-period days of the VALID normalizer rows of the period. */
function leaveByEmp(rows, period) {
  var out = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.STATUS).toUpperCase() !== 'VALID' || !leave_isNormalizerRow_(r)) return;
    var t = feeds_str_(r.LEAVE_TYPE).toUpperCase();
    if (LEAVE_TYPES.indexOf(t) < 0) return;
    var n = feeds_num_(r.DAYS);
    if (isNaN(n) || n <= 0) return;
    var id = feeds_empId_(r.EMP_ID);
    var e = out[id] || (out[id] = {});
    e[t] = leave_r2_((e[t] || 0) + n);
  });
  return out;
}

/** [{EMP_ID, reason, sourceRef}] for the current (not superseded) EXCEPTION rows of the period. */
function leaveExceptions(rows, period) {
  var out = [];
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
    if (feeds_str_(r.STATUS).toUpperCase() !== 'EXCEPTION' || !leave_isNormalizerRow_(r)) return;
    out.push({ EMP_ID: feeds_empId_(r.EMP_ID), reason: feeds_str_(r.EXCEPTION_REASON), sourceRef: feeds_str_(r.SOURCE_REF) });
  });
  return out;
}

function leave_same_(fresh, live) {
  var a = feeds_num_(fresh.DAYS), b = feeds_num_(live.DAYS);
  return feeds_str_(fresh.STATUS).toUpperCase() === feeds_str_(live.STATUS).toUpperCase() &&
    (isNaN(a) ? 0 : a) === (isNaN(b) ? 0 : b) && feeds_str_(fresh.EXCEPTION_REASON) === feeds_str_(live.EXCEPTION_REASON) &&
    feeds_str_(fresh.LEAVE_TYPE) === feeds_str_(live.LEAVE_TYPE);
}

/**
 * Re-sync planner (pure), same pattern as OT: normalizer rows of the period that are not SUPERSEDED and identical to a
 * fresh row (same KEY, status, type, days, reason) are kept; every other live normalizer row is superseded and every
 * unmatched fresh row is appended. existing = INPUT_LEAVE row objects ({_row, ...}).
 * @returns {{supersede:Array, append:Array, unchanged:number}}
 */
function leave_planResync(existing, fresh, period) {
  var freshByKey = {};
  (fresh || []).forEach(function (f) { freshByKey[f.KEY] = f; });
  var matched = {}, supersede = [], unchanged = 0;
  (existing || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== period || !leave_isNormalizerRow_(r)) return;
    if (feeds_str_(r.STATUS).toUpperCase() === 'SUPERSEDED') return;
    var f = freshByKey[feeds_str_(r.KEY)];
    if (f && !matched[f.KEY] && leave_same_(f, r)) { matched[f.KEY] = true; unchanged++; return; }
    supersede.push(r);
  });
  return { supersede: supersede, append: (fresh || []).filter(function (f) { return !matched[f.KEY]; }), unchanged: unchanged };
}

/** Cell updates marking a live INPUT_LEAVE row SUPERSEDED (days zeroed, original kept in the reason). */
function leave_supersedeValues(row, stamp) {
  var d = feeds_str_(row.DAYS);
  return { STATUS: 'SUPERSEDED', DAYS: 0,
    EXCEPTION_REASON: 'SUPERSEDED_BY_RESYNC ' + (stamp || '') + ' | WAS=' + (feeds_str_(row.STATUS) || 'VALID') +
      (d ? ' | ORIGINAL_DAYS=' + d : '') };
}

// ================================================================ leave balances for the payslip (pure part)

/**
 * Pure. Locates the employee-code column and each EL / CL / SL "available" column INDEPENDENTLY across the header rows
 * (the real tabs keep "EMP CODE" in row 1 and "EL/CL/SL Available" in row 3). Each must match exactly once over all the
 * scanned rows (alias match on the normalized header; password headers are never eligible); anything else = not found
 * (-1) with a note. A column that is not found leaves only its own token blank.
 * @param {Array<Array>} headerRows the first rows of the tab (a plain 1-D header row is accepted too)
 * @returns {{emp:number, EL:number, CL:number, SL:number, headerRow:number, firstDataOffset:number, ok:boolean, notes:Array}}
 *   headerRow = 1-based number of the last header row that held a found column; first data row is searched below it.
 */
function leave_balanceColumns_(headerRows) {
  var rows = headerRows || [];
  if (rows.length && !Array.isArray(rows[0])) rows = [rows];
  var hits = {};   // normalized header -> [{c, r}]
  rows.forEach(function (row, r) {
    (row || []).forEach(function (h, i) {
      var k = feeds_norm_(h);
      if (!k || feeds_isPasswordHeader_(h)) return;
      (hits[k] || (hits[k] = [])).push({ c: i, r: r + 1 });
    });
  });
  var notes = [], lastRow = 0;
  var pick = function (label, aliases) {
    var found = [];
    aliases.forEach(function (a) { (hits[a] || []).forEach(function (x) { found.push(x); }); });
    if (found.length !== 1) { notes.push(label + (found.length ? ' matches ' + found.length + ' columns' : ' column not found')); return -1; }
    lastRow = Math.max(lastRow, found[0].r);
    return found[0].c;
  };
  var cols = { emp: pick('EMP CODE', LEAVE_BALANCE_EMP_ALIASES), EL: pick('EL Available', LEAVE_BALANCE_ALIASES.EL),
    CL: pick('CL Available', LEAVE_BALANCE_ALIASES.CL), SL: pick('SL Available', LEAVE_BALANCE_ALIASES.SL), notes: notes };
  cols.headerRow = lastRow;
  cols.ok = cols.emp >= 0 && (cols.EL >= 0 || cols.CL >= 0 || cols.SL >= 0);
  return cols;
}

/** Employee-code shaped cell (VFL1234, CON01, S1 ...): letters then digits. Header words such as "EMP CODE" do not match. */
function leave_isEmpCode_(v) {
  var s = feeds_str_(v);
  return /^[A-Za-z][A-Za-z\-]*\d+$/.test(s);
}

/**
 * Pure. Rows below the identified header -> {byEmp:{EMP_ID:{EL,CL,SL}}, ambiguous:[ids]}. An employee that appears in more
 * than one row is AMBIGUOUS and gets no balance (never guessed). Non-numeric cell or a column that was not found (-1) ->
 * that balance is left out.
 */
function leave_balancesFromRows(cols, rows) {
  var byEmp = {}, count = {};
  (rows || []).forEach(function (r) {
    var id = feeds_empId_(feeds_cell_(r, cols.emp));
    if (!id) return;
    count[id] = (count[id] || 0) + 1;
    if (count[id] > 1) return;
    var b = {};
    ['EL', 'CL', 'SL'].forEach(function (t) {
      if (cols[t] < 0) return;
      var n = feeds_num_(feeds_cell_(r, cols[t]));
      if (!isNaN(n)) b[t] = n;
    });
    byEmp[id] = b;
  });
  var ambiguous = Object.keys(count).filter(function (id) { return count[id] > 1; });
  ambiguous.forEach(function (id) { delete byEmp[id]; });
  return { byEmp: byEmp, ambiguous: ambiguous };
}

// ================================================================ sheet-touching

/**
 * Opens the leave source READ-ONLY. LEAVE_SOURCE_SPREADSHEET_ID (seeded) -> that spreadsheet's LEAVE_SOURCE_TAB
 * (default Leave_Applications); blank -> a local tab of this spreadsheet with that name.
 */
function leave_openSource_(tabOverride) {
  var id = String(getControl('LEAVE_SOURCE_SPREADSHEET_ID', '')).trim();
  var tab = String(tabOverride || getControl('LEAVE_SOURCE_TAB', '') || LEAVE_DEFAULT_TAB).trim();
  if (!id) {
    var local = getSheet(tab);
    if (!local) throw new Error('Leave source tab "' + tab + '" not found in this spreadsheet (PAYROLL_CONTROL LEAVE_SOURCE_TAB / LEAVE_SOURCE_SPREADSHEET_ID)');
    return { sheet: local, label: tab, ss: null };
  }
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) {
    throw new Error('Cannot open the leave spreadsheet (LEAVE_SOURCE_SPREADSHEET_ID ' + id + '): ' + (e && e.message ? e.message : e) +
      '. Give the Google account that runs HR OS (the script runner) at least VIEW access to the leave spreadsheet, then run Sync leave again.');
  }
  var sheet = ss.getSheetByName(tab);
  if (!sheet) throw new Error('The leave spreadsheet has no tab "' + tab + '" (PAYROLL_CONTROL LEAVE_SOURCE_TAB)');
  return { sheet: sheet, label: 'leave:' + tab, ss: ss };
}

function leave_clearError_(period) {
  var key = 'LEAVE_SYNC_ERROR_' + period;
  var map = readControlMap();
  if (map[key] !== undefined && String(map[key]) !== '') setControl(key, '', 'Leave sync failed; cleared by the next successful sync');
}

/**
 * Sync approved leave of the period from the leave spreadsheet into INPUT_LEAVE (read-only source; needed columns only,
 * never a password column). Re-sync supersedes changed rows and appends fresh ones; LOCKED populations are never
 * touched. Afterwards the PENDING register rows of the period are re-derived with the new leave.
 */
function syncLeaveFromSource(period) {
  guardPeriod_(period);
  var src = leave_openSource_();
  var block = feeds_readColumns_(src.sheet, LEAVE_DEFS);
  if (block.missing.length) throw new Error('Leave source is missing required column(s): ' + block.missing.join(', '));
  var roster = buildRoster(period);
  var popOf = {};
  roster.forEach(function (r) { popOf[r.EMP_ID.toUpperCase()] = r.PAYROLL_CATEGORY; });
  var win = leave_window(period, readControlMap());
  var res = mapLeaveRows(block.header, block.rows, period, roster, { firstRow: 2, enteredAt: nowIso_(), sourceLabel: src.label,
    window: { start: win.start, end: win.end } });
  if (res.missingColumns.length) throw new Error('Leave source is missing required column(s): ' + res.missingColumns.join(', '));
  var isLockedEmp = feeds_lockedFn_(period), lockedSkipped = 0;
  var open = function (o) {
    var pop = popOf[String(o.EMP_ID).toUpperCase()];
    if (pop && isLockedEmp(pop, o.EMP_ID)) { lockedSkipped++; return false; }
    return true;
  };
  var fresh = res.valid.concat(res.exceptions).filter(open);
  var existing = readObjects(TABS.INPUT_LEAVE).filter(function (r) {
    var pop = popOf[String(r.EMP_ID).toUpperCase()];
    return !(pop && isLockedEmp(pop, r.EMP_ID));
  });
  var plan = leave_planResync(existing, fresh, period);
  var stamp = nowIso_();
  updateRows(TABS.INPUT_LEAVE, plan.supersede.map(function (r) { return { row: r._row, values: leave_supersedeValues(r, stamp) }; }));
  if (plan.append.length) {
    appendObjects(TABS.INPUT_LEAVE, plan.append, { textHeaders: ['KEY', 'SOURCE_REF', 'CASE_NO', 'FROM_DATE', 'TO_DATE', 'EMP_ID'] });
  }
  var newValid = plan.append.filter(function (o) { return o.STATUS === 'VALID'; });
  var refresh = null, refreshNote = '';
  try { refresh = refreshRegisterAttendance_(period); } catch (e) { refreshNote = String(e && e.message ? e.message : e); }
  var summary = { period: period, window: win.start + '..' + win.end, source: src.label, validWritten: newValid.length,
    validDays: leave_r2_(newValid.reduce(function (t, o) { return t + o.DAYS; }, 0)),
    exceptionsWritten: plan.append.length - newValid.length, superseded: plan.supersede.length, unchanged: plan.unchanged,
    pending: res.pendingCount, revokedByRejection: res.revokedCount, lockedSkipped: lockedSkipped,
    registerRowsRefreshed: refresh ? refresh.refreshed : 0, registerStaleApproved: refresh ? refresh.staleApproved : [],
    registerRefreshNote: refreshNote };
  leave_clearError_(period);
  audit('LEAVE_SYNC', period, '', summary);
  feeds_toast_('Leave sync: ' + summary.validWritten + ' new valid, ' + summary.superseded + ' superseded, ' +
    summary.exceptionsWritten + ' exception(s)');
  return summary;
}

/**
 * Called at the start of calculateDraft: never throws. On failure the error is stored in PAYROLL_CONTROL
 * LEAVE_SYNC_ERROR_<period> (readiness then shows the population-level BLOCKER LEAVE_SOURCE_UNREACHABLE) and the LEAVE
 * feed is set back to OPEN. Returns {ok, summary | error}.
 */
function leaveAutoSync_(period) {
  try {
    return { ok: true, summary: syncLeaveFromSource(period) };
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    try { setControl('LEAVE_SYNC_ERROR_' + period, msg, 'Leave sync failed; cleared by the next successful sync'); } catch (e1) { /* ignore */ }
    try { markFeedComplete(period, 'LEAVE', 'leave sync failed: ' + msg, 'OPEN'); } catch (e2) { /* ignore */ }
    try { audit('LEAVE_SYNC_FAILED', period, '', msg); } catch (e3) { /* ignore */ }
    return { ok: false, error: msg };
  }
}

/**
 * EL / CL / SL available balances for the payslip: {byEmp:{EMP_ID:{EL,CL,SL}}, matched, note}. Read-only, header-mapped,
 * generation time only. When the tab / columns cannot be identified confidently, or an employee has several rows, the
 * balance is left out (blank token) and the note says why - nothing is guessed.
 */
function leave_readBalances_(population, empIds) {
  var out = { byEmp: {}, matched: 0, note: '' };
  var tab = LEAVE_BALANCE_TABS[population];
  if (!tab) { out.note = 'no leave-balance tab for ' + population; return out; }
  var src;
  try { src = leave_openSource_(tab); } catch (e) { out.note = String(e && e.message ? e.message : e); return out; }
  var sheet = src.sheet, lc = sheet.getLastColumn(), lr = sheet.getLastRow();
  if (lc < 1 || lr < 2) { out.note = 'balance tab ' + tab + ' is empty'; return out; }
  var hdrRows = sheet.getRange(1, 1, Math.min(LEAVE_BALANCE_HEADER_SCAN_ROWS, lr), lc).getValues();
  var cols = leave_balanceColumns_(hdrRows);
  if (!cols.ok) { out.note = 'could not identify the employee and EL/CL/SL available columns in ' + tab + ' (' + cols.notes.join('; ') + ') - balances left blank'; return out; }
  var used = [cols.emp, cols.EL, cols.CL, cols.SL].filter(function (k) { return k >= 0; });
  hdrRows.forEach(function (h) { feeds_assertNoPassword_(h, used); });
  var missing = ['EL', 'CL', 'SL'].filter(function (t) { return cols[t] < 0; });
  // data starts at the first row below the header rows whose employee cell looks like an employee code
  var from = cols.headerRow + 1, n = lr - cols.headerRow;
  if (n < 1) { out.note = 'balance tab ' + tab + ' has no data rows'; return out; }
  var empVals = sheet.getRange(from, cols.emp + 1, n, 1).getValues();
  var first = -1;
  for (var i = 0; i < n; i++) { if (leave_isEmpCode_(empVals[i][0])) { first = i; break; } }
  if (first < 0) { out.note = 'no employee-code rows found in ' + tab + ' - balances left blank'; return out; }
  var m = n - first, base = from + first;
  var colVals = { emp: sheet.getRange(base, cols.emp + 1, m, 1).getValues() };
  ['EL', 'CL', 'SL'].forEach(function (t) { if (cols[t] >= 0) colVals[t] = sheet.getRange(base, cols[t] + 1, m, 1).getValues(); });
  var rows = [];
  for (var j = 0; j < m; j++) {
    var row = [];
    row[cols.emp] = colVals.emp[j][0];
    ['EL', 'CL', 'SL'].forEach(function (t) { if (cols[t] >= 0) row[cols[t]] = colVals[t][j][0]; });
    rows.push(row);
  }
  var parsedBal = leave_balancesFromRows(cols, rows);
  var want = {};
  (empIds || []).forEach(function (id) { want[feeds_empId_(id)] = true; });
  Object.keys(parsedBal.byEmp).forEach(function (id) {
    if (want[id]) { out.byEmp[id] = parsedBal.byEmp[id]; out.matched++; }
  });
  var notes = [];
  if (missing.length) notes.push(missing.join('/') + ' available column not found in ' + tab + ' (token left blank)');
  var amb = parsedBal.ambiguous.filter(function (id) { return want[id]; });
  if (amb.length) notes.push(amb.length + ' employee(s) appear in several rows of ' + tab + ' (balances left blank, not guessed)');
  out.note = notes.join('; ');
  return out;
}
