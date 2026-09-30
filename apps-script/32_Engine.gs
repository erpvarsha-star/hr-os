/**
 * 32_Engine.gs - payroll engine orchestration (DESIGN sections 5-7). Pure joiners first (buildEngineContexts,
 * engine_pickSalary, engine_calcPopulation, engine_recon), sheet-touching code after.
 * Exception severities: BLOCKER = global (population) problem, HOLD = employee-level problem (that employee's row is
 * written with FLAGS containing HOLD and NET_PAY null and is excluded from recon totals, the approval hash and the
 * lock), WARN = informational.
 * Feed readers come from 20_Feeds.gs: sumOtHours, canteenByEmp, efficiencyByEmp, advanceByEmp, societyByEmp.
 * Helpers are prefixed engine_.
 */
/** Output tab per category: built-in names for the four defaults, PAYROLL_<CODE> for a configured new category. */
function engine_popTab_(pop) { return populationTab(pop); }
/** RUN_ID prefix of supplementary (top-up) runs written to PAYROLL_DRAFT (42_Supplementary.gs). */
var ENGINE_SUPP_PREFIX = 'SUPP-';
/** RUN type of a PAYROLL_DRAFT row from its RUN_ID: SUPPLEMENTARY for top-up runs, else NORMAL. */
function engine_runType_(runId) { return String(runId == null ? '' : runId).indexOf(ENGINE_SUPP_PREFIX) === 0 ? 'SUPPLEMENTARY' : 'NORMAL'; }
var ENGINE_EXCEPTION_COLUMNS = ['RUN_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'SEVERITY', 'CODE', 'MESSAGE'];
var ENGINE_RECON_COLUMNS = ['PERIOD', 'POPULATION', 'HEADCOUNT', 'TOTAL_GROSS', 'TOTAL_DEDUCTIONS', 'TOTAL_NET',
  'PREV_PERIOD_NET', 'DELTA_PCT', 'RUN_ID'];
var ENGINE_ATT_FIELDS = ['PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS'];
var ENGINE_PERIOD_CAT_COLUMNS = ['DRAFT_RUN_ID', 'DRAFT_HASH', 'HR_APPROVED_BY', 'HR_APPROVED_AT',
  'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT'];

// ---------------------------------------------------------------- pure

function engine_id_(v) { return String(v == null ? '' : v).trim(); }

function engine_dateLo_(v) {
  var d = toIsoDate(v);
  if (d) return d;
  var p = normalizePeriod(v);
  return p ? p + '-01' : '';
}

function engine_dateHi_(v) {
  var d = toIsoDate(v);
  if (d) return d;
  var p = normalizePeriod(v);
  return p ? periodEnd(p) : '';
}

/**
 * Effective-dated pick (DESIGN section 1): per EMP_ID the row with the latest EFFECTIVE_FROM <= period end and
 * (EFFECTIVE_TO blank or >= period start). Rows with blank/unparseable EFFECTIVE_FROM are ignored. Ties: later row.
 * Returns {EMP_ID: row}.
 */
function engine_pickSalary(rows, period) {
  var start = periodStart(period), end = periodEnd(period), best = {};
  (rows || []).forEach(function (r, i) {
    var id = engine_id_(r.EMP_ID);
    if (!id) return;
    var from = engine_dateLo_(r.EFFECTIVE_FROM), to = engine_dateHi_(r.EFFECTIVE_TO);
    if (!from || from > end) return;
    if (to && to < start) return;
    var cur = best[id];
    if (!cur || from > cur.from || (from === cur.from && i >= cur.i)) best[id] = { from: from, i: i, row: r };
  });
  var out = {};
  Object.keys(best).forEach(function (k) { out[k] = best[k].row; });
  return out;
}

/**
 * Rate profile. Without a period: single current row per EMP_ID (last row wins). With a period the rows are effective-
 * dated like SALARY_STRUCTURE: per EMP_ID the row with the latest EFFECTIVE_FROM <= period end (a blank EFFECTIVE_FROM is a
 * legacy row that is always effective, oldest) and EFFECTIVE_TO blank or >= period start; ties: the later row. A salary
 * revision is therefore a new row, older rows stay untouched.
 */
function engine_pickRate(rows, period) {
  var out = {};
  if (!period) {
    (rows || []).forEach(function (r) { var id = engine_id_(r.EMP_ID); if (id) out[id] = r; });
    return out;
  }
  var start = periodStart(period), end = periodEnd(period), best = {};
  (rows || []).forEach(function (r, i) {
    var id = engine_id_(r.EMP_ID);
    if (!id) return;
    var from = engine_dateLo_(r.EFFECTIVE_FROM) || '0000-00-00', to = engine_dateHi_(r.EFFECTIVE_TO);
    if (from > end) return;
    if (to && to < start) return;
    var cur = best[id];
    if (!cur || from > cur.from || (from === cur.from && i >= cur.i)) best[id] = { from: from, i: i, row: r };
  });
  Object.keys(best).forEach(function (k) { out[k] = best[k].row; });
  return out;
}

/** PT_EXEMPTIONS rows active in the period -> {EMP_ID: true}. */
function engine_ptExemptSet(rows, period) {
  var start = periodStart(period), end = periodEnd(period), out = {};
  (rows || []).forEach(function (r) {
    var id = engine_id_(r.EMP_ID);
    if (!id) return;
    var from = engine_dateLo_(r.EFFECTIVE_FROM), to = engine_dateHi_(r.EFFECTIVE_TO);
    if (from && from > end) return;
    if (to && to < start) return;
    out[id] = true;
  });
  return out;
}

/**
 * EMPLOYEE_MASTER rows -> {all: active entries in known populations (duplicates kept), duplicateIds, allActiveIds,
 * joinersExcluded, dojWarnings}. With a period, employees whose DOJ is after the period end are excluded; an
 * ambiguous / unparseable DOJ keeps the employee in with DOJ_WARN set (DOJ_AMBIGUOUS / DOJ_UNPARSEABLE warning).
 */
function engine_rosterFromMaster(rows, period) {
  var all = [], counts = {}, excluded = [], warnings = [], unknownCategory = [], unkSeen = {};
  var end = period ? periodEnd(period) : '';
  var start = period ? periodStart(period) : '';
  (rows || []).forEach(function (r) {
    var active = String(r.STATUS_AS_SOURCE || '').trim().toLowerCase() === 'active';
    var pop = engine_id_(r.PAYROLL_CATEGORY), id = engine_id_(r.EMP_ID);
    if (!id) return;
    if (!isKnownPopulation(pop)) {
      // a category that is not in PAYROLL_CATEGORY_CONFIG at all (typo, new category not configured yet) -> employee HOLD
      // UNKNOWN_CATEGORY; a configured but INACTIVE category is simply not paid
      if (start && !isConfiguredCategory(pop) && !unkSeen[id]) {
        var okRoster = active;
        if (!active) okRoster = leaverRosterDecision(masterLastWorkingDay_(r), start).include;
        if (okRoster && (!end || dojRosterDecision(r.DOJ_AS_SOURCE, end).include)) {
          unkSeen[id] = true;
          unknownCategory.push({ EMP_ID: id, PAYROLL_CATEGORY: pop, EMPLOYEE_NAME: String(r.EMPLOYEE_NAME || '') });
        }
      }
      return;
    }
    var lv = { include: false, warn: '', lwd: '' };
    if (!active) { // leaver with a last working day on/after the period start (same rule as buildRoster)
      if (!start) return;
      lv = leaverRosterDecision(masterLastWorkingDay_(r), start);
      if (!lv.include) return;
    }
    var dec = end ? dojRosterDecision(r.DOJ_AS_SOURCE, end) : { include: true, warn: '' };
    if (!dec.include) { if (excluded.indexOf(id) < 0) excluded.push(id); return; }
    counts[id] = (counts[id] || 0) + 1;
    if (dec.warn) warnings.push(id);
    var doj = '';
    if (typeof parseDoj === 'function') { try { doj = parseDoj(r.DOJ_AS_SOURCE) || ''; } catch (e) { doj = ''; } }
    var entry = { EMP_ID: id, PAYROLL_CATEGORY: pop, SITE: siteForPopulation(pop), EMPLOYEE_NAME: String(r.EMPLOYEE_NAME || ''),
      DEPARTMENT: String(r.DEPARTMENT || '').trim(), DESIGNATION: String(r.DESIGNATION || '').trim(), DOJ: doj,
      GENDER: normalizeGender(r.GENDER), DOJ_WARN: dec.warn };
    if (!active) { entry.LEAVER = true; entry.LWD = lv.lwd; entry.LWD_WARN = lv.warn; }
    all.push(entry);
  });
  return { all: all, duplicateIds: Object.keys(counts).filter(function (k) { return counts[k] > 1; }),
    allActiveIds: Object.keys(counts), joinersExcluded: excluded, dojWarnings: warnings, unknownCategory: unknownCategory };
}

/**
 * Joins everything into calcEmployee ctx objects (field names as 30_Calc.gs reads them).
 * args = {period, population, workingDays, employees[{EMP_ID,EMPLOYEE_NAME,DEPARTMENT,DESIGNATION}],
 *   attendanceByEmp, salaryByEmp, rateByEmp, otByEmp, canteenByEmp, societyByEmp, advanceByEmp, efficiencyByEmp,
 *   adjustmentRows, cfg, ptExemptSet, efficiencyConfig}
 */
function buildEngineContexts(args) {
  var pop = args.population, period = args.period;
  var method = args.method || (typeof categoryMethod === 'function' ? categoryMethod(pop) : '') || pop;
  var num = function (map, id) { var v = map ? map[id] : undefined; return v === undefined || v === null || v === '' ? 0 : v; };
  return (args.employees || []).map(function (e) {
    var id = engine_id_(e.EMP_ID);
    var attRow = (args.attendanceByEmp || {})[id];
    var att = {};
    if (attRow) ENGINE_ATT_FIELDS.forEach(function (k) { att[k] = attRow[k]; });
    var ctx = {
      period: period,
      population: pop,
      method: method,
      emp: { EMP_ID: id, EMPLOYEE_NAME: e.EMPLOYEE_NAME !== undefined ? e.EMPLOYEE_NAME : (e.NAME || ''),
        DEPARTMENT: e.DEPARTMENT || '', DESIGNATION: e.DESIGNATION || '', GENDER: normalizeGender(e.GENDER) },
      zeroPayAllowed: !!(args.zeroPayIds && args.zeroPayIds[id.toUpperCase()]),
      workingDays: args.workingDays,
      attendance: att,
      otHours: num(args.otByEmp, id),
      canteen: num(args.canteenByEmp, id),
      society: num(args.societyByEmp, id),
      advance: num(args.advanceByEmp, id),
      adjustments: aggregateAdjustments(args.adjustmentRows || [], period, id),
      cfg: args.cfg || {},
      ptExemptSet: args.ptExemptSet || {},
      hasAttendance: !!attRow,
      attendanceApproved: !!attRow && engine_id_(attRow.APPROVAL_STATUS).toUpperCase() === 'APPROVED'
    };
    if (method === 'STAFF' || method === 'PERMANENT_WORKER') ctx.salary = (args.salaryByEmp || {})[id] || null;
    else ctx.rate = (args.rateByEmp || {})[id] || null;
    if (method === 'PERMANENT_WORKER') {
      var pct = args.efficiencyByEmp ? args.efficiencyByEmp[id] : undefined;
      var override = null;
      // real efficiencyByEmp (20_Feeds.gs) returns {pct, physicalDaysOverride, source}; calcWorker wants the number
      if (pct !== null && typeof pct === 'object') { override = pct.physicalDaysOverride; pct = pct.pct; }
      ctx.efficiencyPct = pct === undefined ? null : pct;
      ctx.efficiencyConfig = args.efficiencyConfig || [];
      // PHYSICAL_PRESENT_DAYS (VDA basis): HR's value, else the efficiency-form override, else PRESENT_DAYS
      // (the August VDA used the Present column). Never a blocker.
      if (attRow && (att.PHYSICAL_PRESENT_DAYS === '' || att.PHYSICAL_PRESENT_DAYS == null)) {
        if (override !== null && override !== undefined && override !== '' && isFinite(Number(override))) {
          att.PHYSICAL_PRESENT_DAYS = Number(override);
          ctx.physicalDaysSource = 'EFFICIENCY_OVERRIDE';
        } else if (att.PRESENT_DAYS !== '' && att.PRESENT_DAYS != null) {
          att.PHYSICAL_PRESENT_DAYS = att.PRESENT_DAYS;
          ctx.physicalDaysSource = 'PRESENT_DAYS';
        }
      }
    }
    return ctx;
  });
}

function engine_prevPeriod(period) {
  var p = parsePeriod(period);
  var y = p.month === 1 ? p.year - 1 : p.year, m = p.month === 1 ? 12 : p.month - 1;
  return y + '-' + pad2_(m);
}

function engine_feedStatusMap(rows, period) {
  var map = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) !== period) return;
    var f = engine_id_(r.FEED).toUpperCase();
    if (f) map[f] = engine_id_(r.STATUS).toUpperCase();
  });
  return map;
}

function engine_call_(name, args) {
  var fn = (typeof globalThis !== 'undefined' ? globalThis : this)[name];
  if (typeof fn !== 'function') throw new Error('Feed reader ' + name + ' (20_Feeds.gs) is not loaded');
  return fn.apply(null, args);
}

/** Like engine_call_ but returns dflt when the (optional) reader is not loaded. */
function engine_callOpt_(name, args, dflt) {
  var fn = (typeof globalThis !== 'undefined' ? globalThis : this)[name];
  return typeof fn === 'function' ? fn.apply(null, args) : dflt;
}

/** Everything derived from the raw sheet bundle for one population. */
function engine_derive_(src, pop) {
  var period = src.period;
  var method = categoryMethod(pop) || pop;
  var roster = src.roster.all.filter(function (e) { return e.PAYROLL_CATEGORY === pop; });
  var seen = {}, employees = [];
  roster.forEach(function (e) { if (!seen[e.EMP_ID]) { seen[e.EMP_ID] = true; employees.push(e); } });
  var workerIds = method === 'PERMANENT_WORKER' ? employees.map(function (e) { return e.EMP_ID; }) : [];
  var attendanceRows = src.attendance.filter(function (r) {
    return engine_id_(r.PAYROLL_CATEGORY) === pop || seen[engine_id_(r.EMP_ID)];
  });
  var attendanceByEmp = {};
  attendanceRows.forEach(function (r) { var id = engine_id_(r.EMP_ID); if (!attendanceByEmp[id]) attendanceByEmp[id] = r; });
  var attCount = {};
  attendanceRows.forEach(function (r) { var id = engine_id_(r.EMP_ID); attCount[id] = (attCount[id] || 0) + 1; });
  var exBy = function (list, valueKey) {
    var m = {};
    (list || []).forEach(function (x) {
      var id = engine_id_(x.EMP_ID);
      if (!id || !seen[id]) return;
      (m[id] = m[id] || []).push(x[valueKey || 'reason'] || '');
    });
    return m;
  };
  var otExRows = (src.otRows || []).filter(function (r) {
    return engine_id_(r.ELIGIBILITY).toUpperCase() === 'EXCEPTION' && normalizePeriod(r.PAYROLL_MONTH) === period;
  }).map(function (r) { return { EMP_ID: r.EMP_ID, reason: engine_id_(r.EXCEPTION_REASON) }; });
  var d = {
    attendanceCount: attCount,
    otExByEmp: exBy(otExRows),
    canteenExByEmp: exBy(engine_callOpt_('canteenExceptions', [src.canteenRows || [], period], [])),
    efficiencyExByEmp: method === 'PERMANENT_WORKER'
      ? exBy(engine_callOpt_('efficiencyExceptions', [src.efficiencyRows || [], period], [])) : {},
    leaveExByEmp: exBy(engine_callOpt_('leaveExceptions', [src.leaveRows || [], period], [])),
    roster: roster, employees: employees, attendanceRows: attendanceRows, attendanceByEmp: attendanceByEmp,
    otByEmp: engine_call_('sumOtHours', [src.otRows, period]),
    canteenByEmp: engine_call_('canteenByEmp', [src.canteenRows, period]),
    societyByEmp: engine_call_('societyByEmp', [src.societyRows, period]),
    advanceByEmp: engine_call_('advanceByEmp', [src.advanceRows, period]),
    efficiencyByEmp: method === 'PERMANENT_WORKER' ? engine_call_('efficiencyByEmp', [src.efficiencyRows, period, workerIds]) : {},
    statutory: resolveStatutory(src.statutoryRows, period, method),
    salaryByEmp: engine_pickSalary(src.salaryRows, period),
    rateByEmp: engine_pickRate(src.rateRows, period),
    ptExemptSet: engine_ptExemptSet(src.ptExemptRows, period),
    feedIssues: engine_callOpt_('advanceIssues', [src.advanceRows || [], period], [])
      .concat(engine_callOpt_('societyIssues', [src.societyRows || [], period], [])),
    dailyMissingByEmp: null
  };
  d.method = method;
  d.disputes = [];
  if (src.dailyRows && src.dailyRows.length) {
    var missing = {};
    // employees paid from the monthly register are checked by the daily-vs-register comparison instead
    var dailyRoster = roster.filter(function (e) { return !isRegisterRow_(attendanceByEmp[e.EMP_ID]) && !isAutoAttendanceRow_(attendanceByEmp[e.EMP_ID]); });
    aggregateDaily(src.dailyRows, period, dailyRoster, src.holidayRows || [], '').forEach(function (rec) {
      if (rec.missingDates.length) missing[rec.EMP_ID] = rec.missingDates;
    });
    d.dailyMissingByEmp = missing;
    d.disputes = engine_callOpt_('attendanceDisputesLive', [src, pop, roster, attendanceByEmp], []);
  }
  return d;
}

function engine_periodCatRow_(src, pop) {
  var rows = src.periodCat || [];
  for (var i = 0; i < rows.length; i++) if (engine_id_(rows[i].PAYROLL_CATEGORY) === pop) return rows[i];
  return null;
}

/** True when the category row comes from PAYROLL_CATEGORY_CONFIG and its APPROVED_BY is blank (owner sign-off missing). */
function engine_categoryUnapproved_(pop) {
  var e = categoryEntry(pop);
  return !!e && e.fromSheet === true && !e.approvedBy;
}

/** Pending OT events for pop (+ unattributable ones) from the OT_PENDING_<period> control value written by syncOtFromForm. */
function engine_pendingOt_(src, pop) {
  var o = {};
  try { o = JSON.parse(String(src.otPendingRaw == null ? '' : src.otPendingRaw)) || {}; } catch (e) { o = {}; }
  if (typeof o !== 'object' || Array.isArray(o)) o = {};
  var n = Number(o[pop]) + Number(o.UNKNOWN || 0);
  return isFinite(n) && n > 0 ? n : 0;
}

/** Inputs for buildReadiness (31_Readiness.gs) for one population. */
function engine_readinessInputs_(src, pop, calcResults) {
  var d = engine_derive_(src, pop);
  var otEx = src.otRows.filter(function (r) {
    return engine_id_(r.ELIGIBILITY).toUpperCase() === 'EXCEPTION' && normalizePeriod(r.PAYROLL_MONTH) === src.period;
  });
  return {
    period: src.period, population: pop, method: d.method, roster: d.roster,
    categoryUnapproved: engine_categoryUnapproved_(pop), allActiveIds: src.roster.allActiveIds,
    masterDuplicateIds: src.roster.duplicateIds, periodCategoryRow: engine_periodCatRow_(src, pop),
    attendanceRows: src.attendance, dailyMissingByEmp: d.dailyMissingByEmp, salaryByEmp: d.salaryByEmp,
    rateByEmp: d.rateByEmp, feedStatus: src.feedStatus, otExceptionRows: otEx, otHoursByEmp: d.otByEmp,
    zeroPayIds: src.zeroPayIds, statutoryResolved: d.statutory, efficiencyConfigRows: src.efficiencyConfig, calcResults: calcResults || null,
    pendingOtCount: engine_pendingOt_(src, pop),
    canteenExceptions: engine_callOpt_('canteenExceptions', [src.canteenRows || [], src.period], []),
    efficiencyExceptions: engine_callOpt_('efficiencyExceptions', [src.efficiencyRows || [], src.period], []),
    leaveExceptions: engine_callOpt_('leaveExceptions', [src.leaveRows || [], src.period], []),
    leaveSyncError: src.leaveSyncError || '',
    attendanceDisputes: d.disputes
  };
}

/**
 * Calculates one population. Returns {rows (OUTPUT_COLUMNS objects), exceptions (PAYROLL_EXCEPTIONS objects),
 * results ([{row, exceptions}]), ctxs}. Engine-level checks (missing attendance, duplicate master id,
 * unapproved attendance, adjustment problems) are merged into the calc exceptions.
 */
function engine_calcPopulation(src, pop, runId, calcAt) {
  var d = engine_derive_(src, pop);
  var pc = engine_periodCatRow_(src, pop);
  var dupSet = {}, dojWarn = {};
  (src.roster.duplicateIds || []).forEach(function (x) { dupSet[x] = true; });
  d.employees.forEach(function (e) { if (e.DOJ_WARN) dojWarn[e.EMP_ID] = e.DOJ_WARN; });
  var ctxs = buildEngineContexts({
    period: src.period, population: pop, method: d.method, workingDays: pc ? pc.WORKING_DAYS : '', employees: d.employees,
    attendanceByEmp: d.attendanceByEmp, salaryByEmp: d.salaryByEmp, rateByEmp: d.rateByEmp, otByEmp: d.otByEmp,
    canteenByEmp: d.canteenByEmp, societyByEmp: d.societyByEmp, advanceByEmp: d.advanceByEmp,
    efficiencyByEmp: d.efficiencyByEmp, adjustmentRows: src.adjustmentRows, cfg: d.statutory.values,
    ptExemptSet: d.ptExemptSet, efficiencyConfig: src.efficiencyConfig, zeroPayIds: src.zeroPayIds
  });
  var rows = [], exceptions = [], results = [], held = [];
  var leaverBy = {};
  d.employees.forEach(function (e) { if (e.LEAVER) leaverBy[e.EMP_ID] = e; });
  var disputeBy = {};
  (d.disputes || []).forEach(function (x) { disputeBy[engine_id_(x.EMP_ID)] = x; });
  // pay-structure approval: once part of the population is approved, an unapproved row (new joiner / salary revision)
  // holds only that employee; when NOTHING is approved the readiness check blocks the population instead
  var salaryBased = rdy_salaryBased_(d.method);
  var payGate = rdy_payGate_(d.employees.map(function (e) { return e.EMP_ID; }), salaryBased ? d.salaryByEmp : d.rateByEmp, salaryBased);
  var payHold = {};
  if (payGate.mode === 'HOLD') payGate.unapproved.forEach(function (x) { payHold[x] = true; });
  ctxs.forEach(function (ctx) {
    var res = calcEmployee(ctx);
    var id = ctx.emp.EMP_ID;
    var extra = [];
    var hold = function (code, message) { extra.push({ severity: 'HOLD', code: code, message: message }); };
    if (!ctx.hasAttendance) hold('MISSING_ATTENDANCE', 'No INPUT_ATTENDANCE row');
    else {
      if ((d.attendanceCount[id] || 0) > 1) hold('DUPLICATE_ATTENDANCE_ROWS', 'More than one INPUT_ATTENDANCE row for the period');
      attendanceRowProblems(d.attendanceByEmp[id], pop, src.period).forEach(function (p) { hold(p.code, p.message); });
    }
    if (payHold[id]) hold('SALARY_NOT_APPROVED', (salaryBased ? 'SALARY_STRUCTURE row not HR-approved (HR_APPROVED_BY blank)' : 'PAYROLL_RATE_PROFILE row not approved (VERSION_STATE)') + ' - HR OS > Payroll > Approve salary structure');
    if (dupSet[id]) hold('DUPLICATE_MASTER_ID', 'EMP_ID appears more than once among active master rows');
    if (d.dailyMissingByEmp && d.dailyMissingByEmp[id] && d.dailyMissingByEmp[id].length) {
      hold('DAILY_ATTENDANCE_MISSING', 'Daily attendance missing for ' + d.dailyMissingByEmp[id].length + ' date(s), from ' + d.dailyMissingByEmp[id][0]);
    }
    if (d.otExByEmp[id]) hold('OT_EXCEPTION', 'OT exception row(s): ' + d.otExByEmp[id].join(' / '));
    if (d.canteenExByEmp[id]) hold('CANTEEN_EXCEPTION', 'Latest canteen response is invalid: ' + d.canteenExByEmp[id].join(' / '));
    if (d.efficiencyExByEmp[id]) hold('EFFICIENCY_EXCEPTION', 'Latest efficiency response is invalid: ' + d.efficiencyExByEmp[id].join(' / '));
    if (d.leaveExByEmp[id]) hold('LEAVE_EXCEPTION', 'Leave exception row(s): ' + d.leaveExByEmp[id].join(' / '));
    if (disputeBy[id]) hold('ATTENDANCE_DISPUTE', 'Daily vs register attendance dispute: ' + (disputeBy[id].message || disputeBy[id].stage));
    (d.feedIssues || []).forEach(function (i) {
      if (i.EMP_ID === id) extra.push({ severity: i.severity, code: i.code, message: i.message });
    });
    if (dojWarn[id]) {
      extra.push({ severity: 'WARN', code: 'DOJ_' + dojWarn[id],
        message: 'DOJ_AS_SOURCE could not be read unambiguously against the period end; employee included' });
    }
    if (leaverBy[id]) {
      extra.push({ severity: 'WARN', code: 'LEAVER_IN_PERIOD', message: 'Employee left on ' + (leaverBy[id].LWD || '?') +
        (leaverBy[id].LWD_WARN ? ' (last working day ambiguous)' : '') });
    }
    ((ctx.adjustments && ctx.adjustments.exceptions) || []).forEach(function (e) { extra.push(e); });
    // employee-level BLOCKERs become HOLD; only GLOBAL_BLOCKER_CODES keep blocking the whole population
    var all = res.exceptions.concat(extra).map(function (e) {
      return e.severity === 'BLOCKER' && GLOBAL_BLOCKER_CODES.indexOf(e.code) < 0
        ? { severity: 'HOLD', code: e.code, message: e.message } : e;
    });
    var row = res.row;
    var isHeld = all.some(function (e) { return e.severity === 'HOLD'; });
    var isBlocked = all.some(function (e) { return e.severity === 'BLOCKER'; });
    if (isHeld || isBlocked) row.NET_PAY = null;
    var seen = {}, codes = isHeld ? ['HOLD'] : [];
    if (isHeld) seen.HOLD = true;
    all.forEach(function (e) { if (!seen[e.code]) { seen[e.code] = true; codes.push(e.code); } });
    row.FLAGS = codes.join(';');
    row.RUN_ID = runId;
    row.CALCULATED_AT = calcAt;
    rows.push(row);
    results.push({ row: row, exceptions: all, held: isHeld });
    if (isHeld) {
      held.push({ EMP_ID: id, codes: all.filter(function (e) { return e.severity === 'HOLD'; }).map(function (e) { return e.code; }) });
    }
    all.forEach(function (e) {
      exceptions.push({ RUN_ID: runId, PERIOD: src.period, POPULATION: pop, EMP_ID: id, SEVERITY: e.severity,
        CODE: e.code, MESSAGE: e.message });
    });
  });
  return { rows: rows, exceptions: exceptions, results: results, ctxs: ctxs, held: held };
}

/** True when a draft / locked row belongs to a held employee (FLAGS contains the token HOLD). */
function engine_isHeldRow_(row) {
  return String(row && row.FLAGS != null ? row.FLAGS : '').split(';').indexOf('HOLD') >= 0;
}

/** Rows that flow into NET totals, the approval hash and the lock (held employees excluded). */
function engine_payableRows_(rows) {
  return (rows || []).filter(function (r) { return !engine_isHeldRow_(r); });
}

function engine_sum_(rows, col) {
  var t = 0;
  rows.forEach(function (r) { var n = Number(r[col]); if (isFinite(n)) t += n; });
  return roundSheets(t, 2);
}

/** One PAYROLL_RECON row. prevNet: number or null/undefined when no locked previous period. */
function engine_recon(period, pop, rows, prevNet, runId) {
  var net = engine_sum_(rows, 'NET_PAY');
  var hasPrev = prevNet !== null && prevNet !== undefined && prevNet !== '';
  return {
    PERIOD: period, POPULATION: pop, HEADCOUNT: rows.length, TOTAL_GROSS: engine_sum_(rows, 'TOTAL_EARNINGS'),
    TOTAL_DEDUCTIONS: engine_sum_(rows, 'TOTAL_DEDUCTIONS'), TOTAL_NET: net,
    PREV_PERIOD_NET: hasPrev ? prevNet : '',
    DELTA_PCT: hasPrev && prevNet !== 0 ? roundSheets((net - prevNet) / prevNet * 100, 2) : '',
    RUN_ID: runId
  };
}

function engine_sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}

function engine_runId_(period, population, date) {
  return 'RUN-' + period + '-' + (population || 'ALL') + '-' + Utilities.formatDate(date || new Date(), HROS_TZ, 'yyyyMMddHHmmss');
}

// ---------------------------------------------------------------- sheet-touching

function engine_readOpt_(name) { return getSheet(name) ? readObjects(name) : []; }

function engine_inPeriod_(rows, col, period) {
  return rows.filter(function (r) { return normalizePeriod(r[col]) === period; });
}

/** Reads every source tab once. */
function engine_readSources_(period) {
  var daily = engine_readOpt_(TABS.ATTENDANCE_DAILY).filter(function (r) {
    return toIsoDate(r.DATE).slice(0, 7) === period;
  });
  var ctl = getSheet(TABS.PAYROLL_CONTROL) ? readControlMap() : {};
  var roster = engine_rosterFromMaster(readObjects(TABS.EMPLOYEE_MASTER), period);
  var attendance = engine_inPeriod_(engine_readOpt_(TABS.INPUT_ATTENDANCE), 'PAYROLL_MONTH', period);
  var holidayRows = engine_readOpt_(TABS.HOLIDAY_CALENDAR), leaveRows = engine_readOpt_(TABS.INPUT_LEAVE);
  // AUTO_FULL_ATTENDANCE_EMP_IDS: an APPROVED full-attendance row is added IN MEMORY for listed employees without a row
  // (nothing is written to the sheet, so HR's later row simply replaces it); readiness, calc and lock all read this list
  var autoIds = parseIdSet_(ctl.AUTO_FULL_ATTENDANCE_EMP_IDS);
  if (Object.keys(autoIds).length) {
    attendance = attendance.concat(autoFullAttendanceRows(period, roster.all, attendance, autoIds, holidayRows,
      { VFL: getWeeklyOff(SITE_VFL), PUNE: getWeeklyOff(SITE_PUNE) }, leaveByEmp(leaveRows, period), nowIso_()));
  }
  return {
    period: period,
    roster: roster,
    periodCat: engine_inPeriod_(engine_readOpt_(TABS.PAYROLL_PERIOD_CATEGORY), 'PAYROLL_MONTH', period),
    attendance: attendance,
    dailyRows: daily,
    holidayRows: holidayRows,
    salaryRows: engine_readOpt_(TABS.SALARY_STRUCTURE),
    rateRows: engine_readOpt_(TABS.PAYROLL_RATE_PROFILE),
    feedStatus: engine_feedStatusMap(engine_readOpt_(TABS.FEED_STATUS), period),
    otRows: engine_readOpt_(TABS.INPUT_OT),
    canteenRows: engine_readOpt_(TABS.INPUT_CANTEEN),
    efficiencyRows: engine_readOpt_(TABS.INPUT_EFFICIENCY),
    advanceRows: engine_readOpt_(TABS.INPUT_ADVANCE),
    societyRows: engine_readOpt_(TABS.INPUT_SOCIETY),
    adjustmentRows: engine_readOpt_(TABS.INPUT_ADJUSTMENTS),
    statutoryRows: engine_readOpt_(TABS.STATUTORY_CONFIG),
    ptExemptRows: engine_readOpt_(TABS.PT_EXEMPTIONS),
    efficiencyConfig: engine_readOpt_(TABS.EFFICIENCY_CONFIG),
    lockedPrevRows: engine_inPeriod_(engine_readOpt_(TABS.PAYROLL_LOCKED), 'PERIOD', engine_prevPeriod(period)),
    otPendingRaw: ctl['OT_PENDING_' + period] === undefined ? '' : ctl['OT_PENDING_' + period],
    leaveRows: leaveRows,
    zeroPayIds: parseIdSet_(ctl.ZERO_PAY_ALLOWED_EMP_IDS),
    comparisonRows: engine_inPeriod_(engine_readOpt_(TABS.ATTENDANCE_COMPARISON), 'PERIOD', period),
    leaveSyncError: String(ctl['LEAVE_SYNC_ERROR_' + period] || ''),
    ownerEmail: String(ctl.OWNER_APPROVER_EMAIL || '').trim()
  };
}

function engine_prevNet_(src, pop) {
  var rows = src.lockedPrevRows.filter(function (r) { return engine_id_(r.POPULATION) === pop; });
  if (!rows.length) return null;
  return engine_sum_(rows, 'NET_PAY');
}

/**
 * Replaces rows of an engine-owned tab: reads all data rows, keeps those where matchFn(rowObject) is false, writes
 * kept + new back with one setValues, clears only leftover trailing rows of the data region. Header row is written
 * when empty, missing columns are appended on the right (existing columns never reordered).
 */
function engine_replaceRows_(sheetName, wantedHeaders, newObjs, matchFn) {
  var sheet = ensureSheet(sheetName);
  ensureHeaders(sheet, wantedHeaders);
  var headers = getHeaders(sheet), lc = headers.length, lr = sheet.getLastRow();
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var kept = [], oldCount = 0;
  if (lr >= 2 && lc > 0) {
    var vals = sheet.getRange(2, 1, lr - 1, lc).getValues();
    oldCount = vals.length;
    vals.forEach(function (row) {
      var blank = true, obj = {};
      for (var c = 0; c < lc; c++) {
        if (row[c] !== '' && row[c] != null) blank = false;
        if (headers[c] && !(headers[c] in obj)) obj[headers[c]] = row[c];
      }
      if (blank) return;
      if (!matchFn(obj)) kept.push(row);
    });
  }
  var fresh = (newObjs || []).map(function (o) {
    var arr = new Array(lc);
    for (var i = 0; i < lc; i++) arr[i] = '';
    Object.keys(o).forEach(function (k) { if (k in idx) arr[idx[k]] = o[k] == null ? '' : o[k]; });
    return arr;
  });
  var total = kept.concat(fresh);
  if (total.length) {
    var text = {};
    HROS_TEXT_HEADERS.forEach(function (h) { text[h] = true; });
    headers.forEach(function (h, i) {
      if (h && text[h]) sheet.getRange(2, i + 1, total.length, 1).setNumberFormat('@');
    });
    sheet.getRange(2, 1, total.length, lc).setValues(total);
  }
  if (oldCount > total.length) sheet.getRange(2 + total.length, 1, oldCount - total.length, lc).clearContent();
  return { kept: kept.length, written: fresh.length };
}

/**
 * calculateDraft(period, population?) - engine run (DESIGN sections 5-7). Allowed when STATUS is PENDING/DRAFT/blank;
 * HR_APPROVED / ACCOUNTS_APPROVED are reset to DRAFT (with AUDIT entry, approval stamps cleared); LOCKED refused
 * (an explicit population throws; in an ALL run locked populations are skipped and reported).
 */
function calculateDraft(period, population) {
  guardPeriod_(period);
  var pops = population ? [population] : populationList();
  pops.forEach(function (p) { if (!isKnownPopulation(p)) throw new Error('Unknown population "' + p + '"'); });
  // the leave source is a separate spreadsheet: re-read it now; a failure is recorded (LEAVE feed OPEN + population BLOCKER)
  var leaveSync = engine_callOpt_('leaveAutoSync_', [period], null);
  var src = engine_readSources_(period);
  var active = [], skippedLocked = [], prevStatus = {};
  pops.forEach(function (pop) {
    var pc = engine_periodCatRow_(src, pop);
    var st = pc ? engine_id_(pc.STATUS).toUpperCase() : '';
    if (st === PERIOD_STATUS.LOCKED) {
      if (population) throw new Error('Period ' + period + ' x ' + pop + ' is LOCKED - recalculation refused');
      skippedLocked.push(pop);
      return;
    }
    // legacy: the sheet note tells HR to set STATUS = APPROVED once the working days are entered and approved;
    // that means "working days approved" and is treated exactly like PENDING (the legacy APPROVED_BY / APPROVED_AT
    // columns keep the record; they are never overwritten by the payroll approvals)
    if (st === LEGACY_WORKING_DAYS_APPROVED) st = PERIOD_STATUS.PENDING;
    if (st !== '' && [PERIOD_STATUS.PENDING, PERIOD_STATUS.DRAFT, PERIOD_STATUS.HR_APPROVED,
      PERIOD_STATUS.ACCOUNTS_APPROVED].indexOf(st) < 0) {
      throw new Error('Unknown STATUS "' + st + '" for ' + period + ' x ' + pop);
    }
    prevStatus[pop] = st || PERIOD_STATUS.PENDING;
    active.push(pop);
  });
  if (!active.length) throw new Error('All requested populations are LOCKED for ' + period);

  var pcSheet = getSheet(TABS.PAYROLL_PERIOD_CATEGORY);
  var pcHeaders = pcSheet ? getHeaders(pcSheet) : [];
  var missingCols = ENGINE_PERIOD_CAT_COLUMNS.concat(['STATUS']).filter(function (c) { return pcHeaders.indexOf(c) < 0; });
  if (missingCols.length) throw new Error('PAYROLL_PERIOD_CATEGORY lacks columns ' + missingCols.join(', ') + ' (run HR OS > Setup)');

  var now = new Date();
  var runId = engine_runId_(period, population, now);
  var calcAt = nowIso_();
  var allRows = [], allEx = [], recon = [], summaries = [], calcByPop = {}, byPop = {};
  active.forEach(function (pop) {
    var c = engine_calcPopulation(src, pop, runId, calcAt);
    byPop[pop] = c;
    calcByPop[pop] = c.results;
    allRows = allRows.concat(c.rows);
    allEx = allEx.concat(c.exceptions);
    if (src.leaveSyncError) {
      allEx.push({ RUN_ID: runId, PERIOD: period, POPULATION: pop, EMP_ID: '', SEVERITY: 'BLOCKER',
        CODE: 'LEAVE_SOURCE_UNREACHABLE', MESSAGE: src.leaveSyncError });
    }
    recon.push(engine_recon(period, pop, engine_payableRows_(c.rows), engine_prevNet_(src, pop), runId));
  });

  var inActive = function (o) { return normalizePeriod(o.PERIOD) === period && active.indexOf(engine_id_(o.POPULATION)) >= 0; };
  // supplementary (top-up) rows share PAYROLL_DRAFT: a normal run never removes them
  var inActiveNormal = function (o) { return inActive(o) && engine_runType_(o.RUN_ID) === 'NORMAL'; };
  engine_replaceRows_(TABS.PAYROLL_DRAFT, OUTPUT_COLUMNS, allRows, inActiveNormal);
  active.forEach(function (pop) {
    engine_replaceRows_(engine_popTab_(pop), OUTPUT_COLUMNS, byPop[pop].rows,
      function (o) { return normalizePeriod(o.PERIOD) === period; });
  });
  // employees whose category is not configured: HOLD exception rows (no draft row, no population involved)
  var unknownCat = (src.roster.unknownCategory || []);
  var unkEx = unknownCat.map(function (u) {
    return { RUN_ID: runId, PERIOD: period, POPULATION: u.PAYROLL_CATEGORY || RDY_UNASSIGNED, EMP_ID: u.EMP_ID, SEVERITY: 'HOLD',
      CODE: 'UNKNOWN_CATEGORY', MESSAGE: 'PAYROLL_CATEGORY "' + u.PAYROLL_CATEGORY + '" is not in PAYROLL_CATEGORY_CONFIG' };
  });
  if (!population) allEx = allEx.concat(unkEx);
  var inActiveEx = function (o) {
    return inActive(o) || (!population && normalizePeriod(o.PERIOD) === period && engine_id_(o.CODE) === 'UNKNOWN_CATEGORY');
  };
  engine_replaceRows_(TABS.PAYROLL_EXCEPTIONS, ENGINE_EXCEPTION_COLUMNS, allEx, inActiveEx);
  engine_replaceRows_(TABS.PAYROLL_RECON, ENGINE_RECON_COLUMNS, recon, inActive);

  active.forEach(function (pop) {
    var c = byPop[pop];
    var hash = hashRows(engine_payableRows_(c.rows), OUTPUT_COLUMNS, engine_sha256Hex_);
    var pc = engine_periodCatRow_(src, pop);
    var reset = prevStatus[pop] === PERIOD_STATUS.HR_APPROVED || prevStatus[pop] === PERIOD_STATUS.ACCOUNTS_APPROVED;
    if (pc) {
      var vals = { DRAFT_RUN_ID: runId, DRAFT_HASH: hash, STATUS: PERIOD_STATUS.DRAFT };
      if (reset) {
        vals.HR_APPROVED_BY = ''; vals.HR_APPROVED_AT = ''; vals.ACCOUNTS_APPROVED_BY = ''; vals.ACCOUNTS_APPROVED_AT = '';
      }
      updateRows(TABS.PAYROLL_PERIOD_CATEGORY, [{ row: pc._row, values: vals }]);
    }
    if (reset) {
      audit('STATUS_RESET', period, pop, { from: prevStatus[pop], to: PERIOD_STATUS.DRAFT, reason: 'draft recalculated', runId: runId });
    }
    var blockers = c.exceptions.filter(function (e) { return e.SEVERITY === 'BLOCKER'; }).length +
      (src.leaveSyncError ? 1 : 0);
    var holds = c.exceptions.filter(function (e) { return e.SEVERITY === 'HOLD'; }).length;
    var warns = c.exceptions.length - blockers - holds + (src.leaveSyncError ? 1 : 0);
    var s = { population: pop, headcount: c.rows.length, payable: engine_payableRows_(c.rows).length,
      held: c.held.map(function (h) { return h.EMP_ID; }), blockers: blockers, holds: holds, warns: warns,
      totalNet: engine_sum_(engine_payableRows_(c.rows), 'NET_PAY'), hash: hash, statusFrom: prevStatus[pop],
      statusTo: PERIOD_STATUS.DRAFT, statusUpdated: !!pc };
    summaries.push(s);
    audit('CALC_DRAFT', period, pop, { runId: runId, headcount: s.headcount, payable: s.payable, held: s.held,
      blockers: blockers, holds: holds, warns: warns, hash: hash });
  });

  var readiness = checkReadiness(period, population, { sources: src, calcResultsByPop: calcByPop });
  return { period: period, runId: runId, populations: summaries, skippedLocked: skippedLocked, leaveSync: leaveSync,
    unknownCategory: population ? [] : unknownCat.map(function (u) { return u.EMP_ID; }),
    readiness: { blocked: readiness.blocked, hold: readiness.hold, warn: readiness.warn, ready: readiness.ready } };
}
