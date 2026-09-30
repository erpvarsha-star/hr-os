/**
 * 21_Leave.gs - leave sync (DESIGN section 2, "Leave").
 * The leave application form lives in its OWN spreadsheet (its own approval process and yearly balances). It is read
 * READ-ONLY (SpreadsheetApp.openById, header-selective reads, password columns never selected) and normalised into the
 * controlled INPUT_LEAVE tab; the register derivation (12_Register.gs) then turns approved leave into EL / CL / SL /
 * C-Off / OD / LWP days. The same spreadsheet also holds the yearly leave balances printed on the payslip.
 *
 * Source layout (Leave_Applications): an event log. Employees add "Apply ..." rows; the approver later adds separate
 * "Approval (for admin use only)" rows (a new row, not an update) that repeat the employee / dates / type and carry the
 * decision. Most approvals have no Apply row in the log, so an approval is self-contained; an Apply row only links.
 * Pure: mapLeaveRows, leave_normalizeType, leave_planResync, leaveByEmp, leaveExceptions, leave_balancesFromRows.
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

/** Half-day flag cell -> 'FULL' | 'HALF' | 'UNKNOWN'. Blank = full day. */
function leave_halfFlag_(v) {
  if (v == null || v === '') return 'FULL';
  if (v === true) return 'HALF';
  if (v === false) return 'FULL';
  if (typeof v === 'number') return v === 0 ? 'FULL' : (v === 0.5 ? 'HALF' : 'UNKNOWN');
  var s = String(v).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return 'FULL';
  if (/\bno\b|\bnot\b|^n$|^false$|^0$|^none$|^-$|full/.test(s)) return 'FULL';
  if (/half|^yes$|^y$|^true$|^1$|^0\.5$/.test(s)) return 'HALF';
  return 'UNKNOWN';
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
 *  - Groups: an Approval row joins an Apply row by Case No (with the same EMP_ID) when both have one; otherwise by
 *    EMP_ID + start date + end date + normalized leave type. The LATEST decisive approval (Approved / Rejected, by
 *    timestamp then row) of a group wins; only Approved counts; a later Rejected revokes (counted, no exception).
 *  - Days: 'Approved Number of days' when present, otherwise computed from the dates with the half-day flags. Only
 *    dates that are not the site's weekly off / a paid holiday carry leave (the register adds WEEK_OFF and PH itself).
 *    Multi-month leave is split per date; only dates inside the period are counted (when the approved figure differs
 *    from the computed one it is spread proportionally over the working dates and a NOTE is kept).
 *  - Exceptions (never counted): unknown employee, unknown leave type, unparseable / implausible dates, end before
 *    start, invalid approved days, unrecognised half-day flag or decision, an Approved decision on a non-approval row,
 *    duplicates and overlaps with another approved leave. Only groups that touch the period can raise exceptions.
 * @param {Array} headers selected header cells; @param {Array<Array>} rows zipped rows; @param {string} period
 * @param {Array} roster [{EMP_ID, PAYROLL_CATEGORY, SITE}]
 * @param {Object} [opts] {firstRow, enteredAt, sourceLabel, holidays (HOLIDAY_CALENDAR rows), weeklyOffBySite {NASHIK:'SUN'}}
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

  var pStart = periodStart(period), pEnd = periodEnd(period);
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
      startHalf: leave_halfFlag_(cell(row, 'Leave Start Date Half')), endHalf: leave_halfFlag_(cell(row, 'Leave End Date Half')),
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

  // Approved on a non-approval row is ambiguous; unrecognised decision text is never guessed.
  var members = [];
  parsed.forEach(function (p) {
    if (p.kind !== 'APPROVAL') {
      if (p.dec === 'approved' && relevant(p)) problem(p, 'APPROVED_ON_NON_APPROVAL_ROW');
      if (p.kind === 'OTHER') return;
    }
    members.push(p);
  });

  // groups: case groups first, then rows without a case join a case group with the same fallback key
  var groups = {}, groupOrder = [], fbToGroup = {};
  function addTo(gid, p) { if (!groups[gid]) { groups[gid] = []; groupOrder.push(gid); } groups[gid].push(p); }
  members.forEach(function (p) {
    if (!p.kase) return;
    var gid = 'C|' + p.emp + '|' + p.kase.toUpperCase();
    addTo(gid, p);
    if (!(p.fb in fbToGroup)) fbToGroup[p.fb] = gid;
  });
  members.forEach(function (p) {
    if (p.kase) return;
    addTo(p.fb in fbToGroup ? fbToGroup[p.fb] : 'F|' + p.fb, p);
  });

  var winners = [];
  groupOrder.forEach(function (gid) {
    var g = groups[gid].slice().sort(order);
    var decisive = g.filter(function (p) { return p.kind === 'APPROVAL' && (p.dec === 'approved' || p.dec === 'rejected'); });
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

  var used = {}, seenKey = {};
  function siteOf(emp) { var r = rosterMap[emp]; return r ? (r.SITE || siteForPopulation(r.PAYROLL_CATEGORY)) : ''; }
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
    if (w.startHalf === 'UNKNOWN' || w.endHalf === 'UNKNOWN') return fail('HALF_DAY_FLAG_UNRECOGNISED');
    var approved = null;
    if (w.appDaysRaw !== '' && w.appDaysRaw != null) {
      approved = feeds_num_(w.appDaysRaw);
      if (isNaN(approved) || approved <= 0) return fail('APPROVED_DAYS_INVALID', '"' + w.appDaysRaw + '"');
      if (approved > dates.length) return fail('APPROVED_DAYS_EXCEED_RANGE', approved + ' > ' + dates.length + ' date(s)');
    }
    var site = siteOf(w.emp);
    var off = function (d) {
      var wo = opts.weeklyOffBySite && opts.weeklyOffBySite[site];
      if (wo && weekdayOf(d) === wo) return true;
      return opts.holidays ? isPaidHoliday_(opts.holidays, d, site) : false;
    };
    var weights = dates.map(function (d) {
      var x = 1;
      if (d === w.start && w.startHalf === 'HALF') x = 0.5;
      if (d === w.end && w.endHalf === 'HALF') x = 0.5;
      return off(d) ? 0 : x;
    });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return fail('NO_WORKING_DAYS_IN_LEAVE', 'all dates are weekly off / paid holidays');
    var scale = approved === null ? 1 : approved / total;
    var note = '';
    if (approved !== null && Math.abs(approved - total) > 1e-9) {
      note = 'NOTE: approved days ' + approved + ' differ from computed ' + leave_r2_(total) + '; spread proportionally';
    }
    var fromTo = w.emp + '|' + w.type + '|' + w.start + '|' + w.end;
    if (seenKey[fromTo]) return fail('DUPLICATE_APPROVED_LEAVE', fromTo);
    var days = 0, clash = '';
    dates.forEach(function (d, k) {
      if (d < pStart || d > pEnd) return;
      var a = weights[k] * scale;
      if (a <= 0) return;
      var u = used[w.emp + '|' + d] || 0;
      if (u + a > 1 + 1e-9 && !clash) clash = d;
      days += a;
    });
    if (clash) return fail('OVERLAPS_OTHER_LEAVE', 'on ' + clash);
    days = leave_r2_(days);
    if (days <= 0) return; // every in-period date is a weekly off / holiday
    seenKey[fromTo] = true;
    dates.forEach(function (d, k) {
      if (d >= pStart && d <= pEnd) used[w.emp + '|' + d] = (used[w.emp + '|' + d] || 0) + weights[k] * scale;
    });
    out.valid.push({ PAYROLL_MONTH: period, EMP_ID: w.emp, LEAVE_TYPE: w.type, DAYS: days, FROM_DATE: w.start, TO_DATE: w.end,
      SOURCE_REF: label + '!' + w.srcRow, CASE_NO: w.kase, KEY: fromTo, STATUS: 'VALID', EXCEPTION_REASON: note,
      NORMALIZER_VERSION: LEAVE_NORMALIZER_VERSION, ENTERED_AT: enteredAt });
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
 * Pure. Locates the employee column and the EL / CL / SL "available" columns in ONE header row. Each balance column
 * must be identified exactly once (alias match on the normalized header); anything else = not confident -> null entry.
 * @returns {{emp:number, EL:number, CL:number, SL:number, ok:boolean, notes:Array}}
 */
function leave_balanceColumns_(headerRow) {
  var counts = {}, at = {};
  (headerRow || []).forEach(function (h, i) {
    var k = feeds_norm_(h);
    if (!k || feeds_isPasswordHeader_(h)) return;
    counts[k] = (counts[k] || 0) + 1;
    if (!(k in at)) at[k] = i;
  });
  var pick = function (aliases) {
    var hits = aliases.filter(function (a) { return counts[a]; });
    if (hits.length !== 1 || counts[hits[0]] !== 1) return -1;
    return at[hits[0]];
  };
  var cols = { emp: pick(LEAVE_BALANCE_EMP_ALIASES), EL: pick(LEAVE_BALANCE_ALIASES.EL), CL: pick(LEAVE_BALANCE_ALIASES.CL),
    SL: pick(LEAVE_BALANCE_ALIASES.SL), notes: [] };
  cols.ok = cols.emp >= 0 && cols.EL >= 0 && cols.CL >= 0 && cols.SL >= 0;
  return cols;
}

/**
 * Pure. Rows below the identified header -> {byEmp:{EMP_ID:{EL,CL,SL}}, ambiguous:[ids]}. An employee that appears in more
 * than one row (blocks per payroll cycle) is AMBIGUOUS and gets no balance (never guessed). Non-numeric cell -> that
 * balance is left out.
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
  var holidays = getSheet(TABS.HOLIDAY_CALENDAR) ? readObjects(TABS.HOLIDAY_CALENDAR) : [];
  var res = mapLeaveRows(block.header, block.rows, period, roster, { firstRow: 2, enteredAt: nowIso_(), sourceLabel: src.label,
    holidays: holidays, weeklyOffBySite: { NASHIK: getWeeklyOff(SITE_NASHIK), PUNE: getWeeklyOff(SITE_PUNE) } });
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
  var summary = { period: period, source: src.label, validWritten: newValid.length,
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
  var headerRowNo = 0, cols = null;
  for (var r = 1; r <= Math.min(LEAVE_BALANCE_HEADER_SCAN_ROWS, lr); r++) {
    var hdr = sheet.getRange(r, 1, 1, lc).getValues()[0];
    var found = leave_balanceColumns_(hdr);
    if (found.ok) { headerRowNo = r; cols = found; feeds_assertNoPassword_(hdr, [found.emp, found.EL, found.CL, found.SL]); break; }
  }
  if (!cols) { out.note = 'could not identify the employee and EL/CL/SL available columns in ' + tab + ' - balances left blank'; return out; }
  var n = lr - headerRowNo;
  var colVals = {};
  ['emp', 'EL', 'CL', 'SL'].forEach(function (k) { colVals[k] = sheet.getRange(headerRowNo + 1, cols[k] + 1, n, 1).getValues(); });
  var rows = [];
  for (var i = 0; i < n; i++) {
    var row = [];
    row[cols.emp] = colVals.emp[i][0]; row[cols.EL] = colVals.EL[i][0]; row[cols.CL] = colVals.CL[i][0]; row[cols.SL] = colVals.SL[i][0];
    rows.push(row);
  }
  var parsedBal = leave_balancesFromRows(cols, rows);
  var want = {};
  (empIds || []).forEach(function (id) { want[feeds_empId_(id)] = true; });
  Object.keys(parsedBal.byEmp).forEach(function (id) {
    if (want[id]) { out.byEmp[id] = parsedBal.byEmp[id]; out.matched++; }
  });
  var amb = parsedBal.ambiguous.filter(function (id) { return want[id]; });
  if (amb.length) out.note = amb.length + ' employee(s) appear in several rows of ' + tab + ' (balances left blank, not guessed)';
  return out;
}
