/**
 * 32_Engine.gs - payroll engine orchestration (DESIGN sections 5-7). Pure joiners first (buildEngineContexts,
 * engine_pickSalary, engine_calcPopulation, engine_recon), sheet-touching code after.
 * Feed readers come from 20_Feeds.gs: sumOtHours, canteenByEmp, efficiencyByEmp, advanceByEmp, societyByEmp.
 * Helpers are prefixed engine_.
 */
var ENGINE_POP_TABS = { STAFF: 'PAYROLL_STAFF', PERMANENT_WORKER: 'PAYROLL_WORKER', CONSULTANT: 'PAYROLL_CONSULTANT',
  PUNE_STAFF: 'PAYROLL_PUNE_STAFF' };
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

/** Rate profile: single current row per EMP_ID (last row wins). */
function engine_pickRate(rows) {
  var out = {};
  (rows || []).forEach(function (r) { var id = engine_id_(r.EMP_ID); if (id) out[id] = r; });
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

/** EMPLOYEE_MASTER rows -> {all: active entries in known populations (duplicates kept), duplicateIds, allActiveIds}. */
function engine_rosterFromMaster(rows) {
  var all = [], counts = {};
  (rows || []).forEach(function (r) {
    if (String(r.STATUS_AS_SOURCE || '').trim().toLowerCase() !== 'active') return;
    var pop = engine_id_(r.PAYROLL_CATEGORY), id = engine_id_(r.EMP_ID);
    if (!id || !isKnownPopulation(pop)) return;
    counts[id] = (counts[id] || 0) + 1;
    var doj = '';
    if (typeof parseDoj === 'function') { try { doj = parseDoj(r.DOJ_AS_SOURCE) || ''; } catch (e) { doj = ''; } }
    all.push({ EMP_ID: id, PAYROLL_CATEGORY: pop, SITE: siteForPopulation(pop), EMPLOYEE_NAME: String(r.EMPLOYEE_NAME || ''),
      DEPARTMENT: String(r.DEPARTMENT || '').trim(), DESIGNATION: String(r.DESIGNATION || '').trim(), DOJ: doj });
  });
  return { all: all, duplicateIds: Object.keys(counts).filter(function (k) { return counts[k] > 1; }),
    allActiveIds: Object.keys(counts) };
}

/**
 * Joins everything into calcEmployee ctx objects (field names as 30_Calc.gs reads them).
 * args = {period, population, workingDays, employees[{EMP_ID,EMPLOYEE_NAME,DEPARTMENT,DESIGNATION}],
 *   attendanceByEmp, salaryByEmp, rateByEmp, otByEmp, canteenByEmp, societyByEmp, advanceByEmp, efficiencyByEmp,
 *   adjustmentRows, cfg, ptExemptSet, efficiencyConfig}
 */
function buildEngineContexts(args) {
  var pop = args.population, period = args.period;
  var num = function (map, id) { var v = map ? map[id] : undefined; return v === undefined || v === null || v === '' ? 0 : v; };
  return (args.employees || []).map(function (e) {
    var id = engine_id_(e.EMP_ID);
    var attRow = (args.attendanceByEmp || {})[id];
    var att = {};
    if (attRow) ENGINE_ATT_FIELDS.forEach(function (k) { att[k] = attRow[k]; });
    var ctx = {
      period: period,
      population: pop,
      emp: { EMP_ID: id, EMPLOYEE_NAME: e.EMPLOYEE_NAME !== undefined ? e.EMPLOYEE_NAME : (e.NAME || ''),
        DEPARTMENT: e.DEPARTMENT || '', DESIGNATION: e.DESIGNATION || '' },
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
    if (pop === 'STAFF' || pop === 'PERMANENT_WORKER') ctx.salary = (args.salaryByEmp || {})[id] || null;
    else ctx.rate = (args.rateByEmp || {})[id] || null;
    if (pop === 'PERMANENT_WORKER') {
      var pct = args.efficiencyByEmp ? args.efficiencyByEmp[id] : undefined;
      // real efficiencyByEmp (20_Feeds.gs) returns {pct, physicalDaysOverride, source}; calcWorker wants the number
      if (pct !== null && typeof pct === 'object') pct = pct.pct;
      ctx.efficiencyPct = pct === undefined ? null : pct;
      ctx.efficiencyConfig = args.efficiencyConfig || [];
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

/** Everything derived from the raw sheet bundle for one population. */
function engine_derive_(src, pop) {
  var period = src.period;
  var roster = src.roster.all.filter(function (e) { return e.PAYROLL_CATEGORY === pop; });
  var seen = {}, employees = [];
  roster.forEach(function (e) { if (!seen[e.EMP_ID]) { seen[e.EMP_ID] = true; employees.push(e); } });
  var workerIds = pop === 'PERMANENT_WORKER' ? employees.map(function (e) { return e.EMP_ID; }) : [];
  var attendanceRows = src.attendance.filter(function (r) {
    return engine_id_(r.PAYROLL_CATEGORY) === pop || seen[engine_id_(r.EMP_ID)];
  });
  var attendanceByEmp = {};
  attendanceRows.forEach(function (r) { var id = engine_id_(r.EMP_ID); if (!attendanceByEmp[id]) attendanceByEmp[id] = r; });
  var d = {
    roster: roster, employees: employees, attendanceRows: attendanceRows, attendanceByEmp: attendanceByEmp,
    otByEmp: engine_call_('sumOtHours', [src.otRows, period]),
    canteenByEmp: engine_call_('canteenByEmp', [src.canteenRows, period]),
    societyByEmp: engine_call_('societyByEmp', [src.societyRows, period]),
    advanceByEmp: engine_call_('advanceByEmp', [src.advanceRows, period]),
    efficiencyByEmp: pop === 'PERMANENT_WORKER' ? engine_call_('efficiencyByEmp', [src.efficiencyRows, period, workerIds]) : {},
    statutory: resolveStatutory(src.statutoryRows, period, pop),
    salaryByEmp: engine_pickSalary(src.salaryRows, period),
    rateByEmp: engine_pickRate(src.rateRows),
    ptExemptSet: engine_ptExemptSet(src.ptExemptRows, period),
    dailyMissingByEmp: null
  };
  if (src.dailyRows && src.dailyRows.length) {
    var missing = {};
    aggregateDaily(src.dailyRows, period, roster, src.holidayRows || [], '').forEach(function (rec) {
      if (rec.missingDates.length) missing[rec.EMP_ID] = rec.missingDates;
    });
    d.dailyMissingByEmp = missing;
  }
  return d;
}

function engine_periodCatRow_(src, pop) {
  var rows = src.periodCat || [];
  for (var i = 0; i < rows.length; i++) if (engine_id_(rows[i].PAYROLL_CATEGORY) === pop) return rows[i];
  return null;
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
    period: src.period, population: pop, roster: d.roster, allActiveIds: src.roster.allActiveIds,
    masterDuplicateIds: src.roster.duplicateIds, periodCategoryRow: engine_periodCatRow_(src, pop),
    attendanceRows: src.attendance, dailyMissingByEmp: d.dailyMissingByEmp, salaryByEmp: d.salaryByEmp,
    rateByEmp: d.rateByEmp, feedStatus: src.feedStatus, otExceptionRows: otEx, otHoursByEmp: d.otByEmp,
    statutoryResolved: d.statutory, efficiencyConfigRows: src.efficiencyConfig, calcResults: calcResults || null,
    pendingOtCount: engine_pendingOt_(src, pop)
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
  var dupSet = {};
  (src.roster.duplicateIds || []).forEach(function (x) { dupSet[x] = true; });
  var ctxs = buildEngineContexts({
    period: src.period, population: pop, workingDays: pc ? pc.WORKING_DAYS : '', employees: d.employees,
    attendanceByEmp: d.attendanceByEmp, salaryByEmp: d.salaryByEmp, rateByEmp: d.rateByEmp, otByEmp: d.otByEmp,
    canteenByEmp: d.canteenByEmp, societyByEmp: d.societyByEmp, advanceByEmp: d.advanceByEmp,
    efficiencyByEmp: d.efficiencyByEmp, adjustmentRows: src.adjustmentRows, cfg: d.statutory.values,
    ptExemptSet: d.ptExemptSet, efficiencyConfig: src.efficiencyConfig
  });
  var rows = [], exceptions = [], results = [];
  ctxs.forEach(function (ctx) {
    var res = calcEmployee(ctx);
    var extra = [];
    if (!ctx.hasAttendance) extra.push({ severity: 'BLOCKER', code: 'MISSING_ATTENDANCE', message: 'No INPUT_ATTENDANCE row' });
    else if (!ctx.attendanceApproved) extra.push({ severity: 'WARN', code: 'ATTENDANCE_NOT_APPROVED', message: 'Attendance row is not APPROVED' });
    if (dupSet[ctx.emp.EMP_ID]) extra.push({ severity: 'BLOCKER', code: 'DUPLICATE_MASTER_ID', message: 'EMP_ID appears more than once among active master rows' });
    ((ctx.adjustments && ctx.adjustments.exceptions) || []).forEach(function (e) { extra.push(e); });
    var all = res.exceptions.concat(extra);
    var row = res.row;
    if (extra.some(function (e) { return e.severity === 'BLOCKER'; }) && row.NET_PAY !== null &&
        !res.exceptions.some(function (e) { return e.severity === 'BLOCKER' && e.code !== 'NEGATIVE_NET_PAY'; })) {
      row.NET_PAY = null;
    }
    var seen = {}, codes = [];
    all.forEach(function (e) { if (!seen[e.code]) { seen[e.code] = true; codes.push(e.code); } });
    row.FLAGS = codes.join(';');
    row.RUN_ID = runId;
    row.CALCULATED_AT = calcAt;
    rows.push(row);
    results.push({ row: row, exceptions: all });
    all.forEach(function (e) {
      exceptions.push({ RUN_ID: runId, PERIOD: src.period, POPULATION: pop, EMP_ID: ctx.emp.EMP_ID, SEVERITY: e.severity,
        CODE: e.code, MESSAGE: e.message });
    });
  });
  return { rows: rows, exceptions: exceptions, results: results, ctxs: ctxs };
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
  return {
    period: period,
    roster: engine_rosterFromMaster(readObjects(TABS.EMPLOYEE_MASTER)),
    periodCat: engine_inPeriod_(engine_readOpt_(TABS.PAYROLL_PERIOD_CATEGORY), 'PAYROLL_MONTH', period),
    attendance: engine_inPeriod_(engine_readOpt_(TABS.INPUT_ATTENDANCE), 'PAYROLL_MONTH', period),
    dailyRows: daily,
    holidayRows: engine_readOpt_(TABS.HOLIDAY_CALENDAR),
    salaryRows: engine_readOpt_('SALARY_STRUCTURE'),
    rateRows: engine_readOpt_('PAYROLL_RATE_PROFILE'),
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
    otPendingRaw: getSheet(TABS.PAYROLL_CONTROL) ? readControlMap()['OT_PENDING_' + period] : ''
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
  var pops = population ? [population] : POPULATION_LIST.slice();
  pops.forEach(function (p) { if (!isKnownPopulation(p)) throw new Error('Unknown population "' + p + '"'); });
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
    recon.push(engine_recon(period, pop, c.rows, engine_prevNet_(src, pop), runId));
  });

  var inActive = function (o) { return normalizePeriod(o.PERIOD) === period && active.indexOf(engine_id_(o.POPULATION)) >= 0; };
  engine_replaceRows_(TABS.PAYROLL_DRAFT, OUTPUT_COLUMNS, allRows, inActive);
  active.forEach(function (pop) {
    engine_replaceRows_(ENGINE_POP_TABS[pop], OUTPUT_COLUMNS, byPop[pop].rows,
      function (o) { return normalizePeriod(o.PERIOD) === period; });
  });
  engine_replaceRows_(TABS.PAYROLL_EXCEPTIONS, ENGINE_EXCEPTION_COLUMNS, allEx, inActive);
  engine_replaceRows_(TABS.PAYROLL_RECON, ENGINE_RECON_COLUMNS, recon, inActive);

  active.forEach(function (pop) {
    var c = byPop[pop];
    var hash = hashRows(c.rows, OUTPUT_COLUMNS, engine_sha256Hex_);
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
    var blockers = c.exceptions.filter(function (e) { return e.SEVERITY === 'BLOCKER'; }).length;
    var warns = c.exceptions.length - blockers;
    var s = { population: pop, headcount: c.rows.length, blockers: blockers, warns: warns,
      totalNet: engine_sum_(c.rows, 'NET_PAY'), hash: hash, statusFrom: prevStatus[pop], statusTo: PERIOD_STATUS.DRAFT,
      statusUpdated: !!pc };
    summaries.push(s);
    audit('CALC_DRAFT', period, pop, { runId: runId, headcount: s.headcount, blockers: blockers, warns: warns, hash: hash });
  });

  var readiness = checkReadiness(period, population, { sources: src, calcResultsByPop: calcByPop });
  return { period: period, runId: runId, populations: summaries, skippedLocked: skippedLocked,
    readiness: { blocked: readiness.blocked, warn: readiness.warn, ready: readiness.ready } };
}
