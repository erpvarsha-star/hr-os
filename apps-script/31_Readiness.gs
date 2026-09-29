/**
 * 31_Readiness.gs - payroll readiness (DESIGN section 3). buildReadiness is pure; checkReadiness gathers inputs
 * from the sheets (via engine_readSources_ in 32_Engine.gs), runs the checks and rewrites PAYROLL_READINESS
 * rows for the period (other periods are never touched). Only STATUS = BLOCKED blocks approval.
 * Helpers are prefixed rdy_.
 */
var RDY_MAX_IDS = 20;
var RDY_REQUIRED_FEEDS = ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS'];
var RDY_ATT_FIELDS = ['PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED', 'CL_AVAILED',
  'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS'];
var RDY_CHECK_NAMES = ['PERIOD_WORKING_DAYS', 'ATTENDANCE_COVERAGE', 'ATTENDANCE_APPROVED_VALID',
  'DAILY_ATTENDANCE_COMPLETE', 'SALARY_PRESENT_NONZERO', 'FEEDS_COMPLETE', 'OT_EXCEPTIONS', 'STATUTORY_CONFIG',
  'DUPLICATE_MASTER_IDS', 'CONSULTANT_MONTHLY_OT', 'EFFICIENCY_CONFIG_CONFIRMED', 'NEGATIVE_NET_PAY'];

// ---------------------------------------------------------------- pure helpers

function rdy_id_(v) { return String(v == null ? '' : v).trim(); }

/** blank -> 0; numeric -> number; anything else -> NaN. */
function rdy_num_(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v).replace(/,/g, '').trim();
  if (s === '' || isNaN(Number(s))) return NaN;
  return Number(s);
}

function rdy_uniq_(arr) {
  var seen = {}, out = [];
  arr.forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } });
  return out;
}

/** Up to 20 items then ", +N more". */
function rdy_list_(items) {
  var a = items || [];
  var head = a.slice(0, RDY_MAX_IDS).join(', ');
  return a.length > RDY_MAX_IDS ? head + ', +' + (a.length - RDY_MAX_IDS) + ' more' : head;
}

function rdy_res_(blockers, warns, okDetail) {
  var parts = [];
  if (blockers.length) parts.push(blockers.join('; '));
  if (warns.length) parts.push(warns.join('; '));
  if (blockers.length) return { status: 'BLOCKED', detail: parts.join(' | ') };
  if (warns.length) return { status: 'WARN', detail: parts.join(' | ') };
  return { status: 'READY', detail: okDetail || 'OK' };
}

function rdy_set_(list) {
  var s = {};
  if (Array.isArray(list)) list.forEach(function (x) { s[rdy_id_(x)] = true; });
  else if (list && typeof list === 'object') Object.keys(list).forEach(function (k) { if (list[k]) s[k] = true; });
  return s;
}

function rdy_worked_(row, population) {
  var n = function (k) { return rdy_num_(row[k]); };
  var w = n('PRESENT_DAYS') + n('EL_AVAILED') + n('CL_AVAILED') + n('SL_AVAILED') + n('PH') + n('PAID_LEAVE_OTHER');
  if (population !== 'PERMANENT_WORKER') w += n('WEEK_OFF');
  return w;
}

/** Attendance rows relevant to this population (its category, or unknown category and not active elsewhere). */
function rdy_popAttendance_(inputs, rosterSet) {
  var pop = inputs.population;
  var all = inputs.allActiveIds ? rdy_set_(inputs.allActiveIds) : null;
  return (inputs.attendanceRows || []).filter(function (r) {
    var id = rdy_id_(r.EMP_ID);
    var cat = rdy_id_(r.PAYROLL_CATEGORY);
    if (cat === pop) return true;
    if (rosterSet[id]) return true;
    if (cat === '' || POPULATION_LIST.indexOf(cat) < 0) return !(all && all[id]);
    return false;
  });
}

// ---------------------------------------------------------------- the 12 checks

function rdy_check1_(inputs) {
  var row = inputs.periodCategoryRow;
  if (!row) return { status: 'BLOCKED', detail: 'No PAYROLL_PERIOD_CATEGORY row for ' + inputs.period + ' x ' + inputs.population };
  var wd = rdy_num_(row.WORKING_DAYS);
  var dim = daysInMonth(inputs.period);
  if (row.WORKING_DAYS === '' || row.WORKING_DAYS == null || isNaN(wd) || wd <= 0) {
    return { status: 'BLOCKED', detail: 'WORKING_DAYS must be a positive number (got "' + (row.WORKING_DAYS == null ? '' : row.WORKING_DAYS) + '")' };
  }
  if (wd > dim) return { status: 'BLOCKED', detail: 'WORKING_DAYS ' + wd + ' exceeds days in month ' + dim };
  return { status: 'READY', detail: 'WORKING_DAYS=' + wd };
}

function rdy_check2_(inputs, ctx) {
  var counts = {};
  ctx.attRows.forEach(function (r) { var id = rdy_id_(r.EMP_ID); counts[id] = (counts[id] || 0) + 1; });
  var missing = ctx.rosterIds.filter(function (id) { return !counts[id]; });
  var dups = Object.keys(counts).filter(function (id) { return counts[id] > 1; });
  var unknown = Object.keys(counts).filter(function (id) { return !ctx.rosterSet[id]; });
  var b = [];
  if (missing.length) b.push('no attendance row: ' + rdy_list_(missing));
  if (dups.length) b.push('duplicate attendance rows: ' + rdy_list_(dups));
  if (unknown.length) b.push('unknown/inactive EMP_ID in attendance: ' + rdy_list_(unknown));
  return rdy_res_(b, [], ctx.rosterIds.length + ' employees covered');
}

function rdy_check3_(inputs, ctx) {
  var pop = inputs.population, dim = daysInMonth(inputs.period);
  var wd = inputs.periodCategoryRow ? rdy_num_(inputs.periodCategoryRow.WORKING_DAYS) : NaN;
  var notApproved = [], badNum = [], overDim = [], overWd = [], noReason = [];
  ctx.attRows.forEach(function (r) {
    var id = rdy_id_(r.EMP_ID);
    if (rdy_id_(r.APPROVAL_STATUS).toUpperCase() !== 'APPROVED') notApproved.push(id);
    var bad = false;
    RDY_ATT_FIELDS.forEach(function (k) {
      if (k === 'PRESENT_DAYS' && (r[k] === '' || r[k] == null)) { bad = true; return; }
      var n = rdy_num_(r[k]);
      if (isNaN(n) || n < 0) bad = true;
    });
    if (bad) { badNum.push(id); return; }
    var w = rdy_worked_(r, pop);
    if (w > dim) overDim.push(id + '(' + w + ')');
    else if (isFinite(wd) && wd > 0 && w > wd) overWd.push(id + '(' + w + ')');
    if (rdy_id_(r.HR_OVERRIDE).toUpperCase() === 'Y' && rdy_id_(r.OVERRIDE_REASON) === '') noReason.push(id);
  });
  var b = [], w = [];
  if (notApproved.length) b.push('attendance not APPROVED: ' + rdy_list_(notApproved));
  if (badNum.length) b.push('blank/non-numeric/negative day fields: ' + rdy_list_(badNum));
  if (overDim.length) b.push('worked days exceed days in month: ' + rdy_list_(overDim));
  if (noReason.length) b.push('HR_OVERRIDE=Y without OVERRIDE_REASON: ' + rdy_list_(noReason));
  if (overWd.length) {
    var msg = 'worked days exceed WORKING_DAYS: ' + rdy_list_(overWd);
    if (pop === 'PERMANENT_WORKER') b.push(msg); else w.push(msg);
  }
  return rdy_res_(b, w, ctx.attRows.length + ' rows approved and valid');
}

function rdy_check4_(inputs, ctx) {
  var m = inputs.dailyMissingByEmp;
  if (m == null) return { status: 'READY', detail: 'No daily attendance data for period (monthly entry)' };
  var bad = ctx.rosterIds.filter(function (id) { return m[id] && m[id].length; })
    .map(function (id) { return id + '(' + m[id].length + ' dates, from ' + m[id][0] + ')'; });
  return rdy_res_(bad.length ? ['missing daily dates: ' + rdy_list_(bad)] : [], [], 'Daily attendance complete');
}

function rdy_check5_(inputs, ctx) {
  var pop = inputs.population;
  var missing = [], zero = [];
  ctx.rosterIds.forEach(function (id) {
    if (pop === 'STAFF' || pop === 'PERMANENT_WORKER') {
      var s = (inputs.salaryByEmp || {})[id];
      if (!s) { missing.push(id); return; }
      var fg = rdy_num_(s.FIXED_GROSS_PM_AS_SOURCE_INR), basic = rdy_num_(s.BASIC_PM_INR);
      if (!(fg > 0) && !(basic > 0)) zero.push(id);
    } else {
      var r = (inputs.rateByEmp || {})[id];
      if (!r) { missing.push(id); return; }
      var basis = rdy_id_(r.PAY_BASIS).toUpperCase();
      var amt = basis === 'DAILY_RATE' ? rdy_num_(r.RATE_AMOUNT_INR) : rdy_num_(r.MONTHLY_GROSS_INR);
      if (!(amt > 0)) zero.push(id);
    }
  });
  var b = [];
  if (missing.length) b.push('no salary structure / rate profile: ' + rdy_list_(missing));
  if (zero.length) b.push('zero pay structure: ' + rdy_list_(zero));
  return rdy_res_(b, [], 'Pay structure present for all');
}

function rdy_check6_(inputs) {
  var feeds = RDY_REQUIRED_FEEDS.slice();
  if (inputs.population === 'PERMANENT_WORKER') feeds.push('EFFICIENCY');
  var fs = inputs.feedStatus || {};
  var open = feeds.filter(function (f) {
    var v = fs[f];
    if (v && typeof v === 'object') v = v.STATUS;
    return String(v == null ? '' : v).trim().toUpperCase() !== 'COMPLETE';
  });
  return rdy_res_(open.length ? ['feeds not COMPLETE: ' + open.join(', ')] : [], [], 'All required feeds COMPLETE');
}

function rdy_check7_(inputs, ctx) {
  var all = inputs.allActiveIds ? rdy_set_(inputs.allActiveIds) : null;
  var ids = [];
  (inputs.otExceptionRows || []).forEach(function (r) {
    if (rdy_id_(r.ELIGIBILITY).toUpperCase() !== 'EXCEPTION') return;
    var p = normalizePeriod(r.PAYROLL_MONTH);
    if (p && p !== inputs.period) return;
    var id = rdy_id_(r.EMP_ID);
    // unattributable (unknown EMP_ID) exceptions block every population - fail closed
    if (ctx.rosterSet[id] || (all ? !all[id] : false)) ids.push(id === '' ? '(blank EMP_ID)' : id);
  });
  var b = ids.length ? ['OT exceptions (' + ids.length + '): ' + rdy_list_(rdy_uniq_(ids))] : [];
  var w = inputs.pendingOtCount > 0 ? ['pending OT events: ' + inputs.pendingOtCount] : [];
  return rdy_res_(b, w, 'No OT exceptions');
}

function rdy_check8_(inputs) {
  var pop = inputs.population;
  var required = requiredStatutoryKeys(pop);
  if (!required.length) return { status: 'READY', detail: 'No statutory keys required for ' + pop };
  var st = inputs.statutoryResolved;
  if (!st) return { status: 'BLOCKED', detail: 'Statutory config not resolved for ' + inputs.period };
  var b = [];
  if (st.missing && st.missing.length) b.push('missing keys: ' + st.missing.join(', '));
  if (st.invalid && st.invalid.length) b.push('invalid values: ' + st.invalid.join(', '));
  return rdy_res_(b, [], 'All statutory keys present');
}

function rdy_check9_(inputs, ctx) {
  var counts = {};
  (inputs.roster || []).forEach(function (e) { var id = rdy_id_(e.EMP_ID); counts[id] = (counts[id] || 0) + 1; });
  var dups = Object.keys(counts).filter(function (id) { return counts[id] > 1; });
  (inputs.masterDuplicateIds || []).forEach(function (x) {
    var id = rdy_id_(x);
    if (ctx.rosterSet[id] && dups.indexOf(id) < 0) dups.push(id);
  });
  return rdy_res_(dups.length ? ['duplicate active EMP_ID in EMPLOYEE_MASTER: ' + rdy_list_(dups)] : [], [], 'No duplicates');
}

function rdy_check10_(inputs, ctx) {
  if (inputs.population !== 'CONSULTANT') return { status: 'READY', detail: 'Not applicable' };
  var ot = inputs.otHoursByEmp || {};
  var bad = ctx.rosterIds.filter(function (id) {
    var r = (inputs.rateByEmp || {})[id];
    if (!r) return false;
    var basis = rdy_id_(r.PAY_BASIS).toUpperCase();
    return basis === 'MONTHLY_GROSS_PRORATED' && rdy_num_(ot[id]) > 0;
  });
  return rdy_res_(bad.length ? ['monthly consultant with OT hours (BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM): ' + rdy_list_(bad)] : [],
    [], 'No monthly consultant OT');
}

function rdy_check11_(inputs) {
  if (inputs.population !== 'PERMANENT_WORKER') return { status: 'READY', detail: 'Not applicable' };
  var rows = inputs.efficiencyConfigRows || [];
  var unconfirmed = rows.filter(function (r) { return rdy_id_(r.IMPLEMENTATION_STATE).toUpperCase() !== 'CONFIRMED'; });
  if (!rows.length) return { status: 'WARN', detail: 'EFFICIENCY_CONFIG has no rows' };
  if (unconfirmed.length) {
    return { status: 'WARN', detail: unconfirmed.length + ' of ' + rows.length + ' EFFICIENCY_CONFIG rows not CONFIRMED (state: ' +
      rdy_uniq_(unconfirmed.map(function (r) { return rdy_id_(r.IMPLEMENTATION_STATE) || '(blank)'; })).join(', ') + ')' };
  }
  return { status: 'READY', detail: 'EFFICIENCY_CONFIG CONFIRMED' };
}

function rdy_check12_(inputs) {
  if (!inputs.calcResults) return { status: 'READY', detail: 'No draft calculated yet' };
  var neg = [];
  inputs.calcResults.forEach(function (res) {
    var row = res.row || {};
    var flagged = (res.exceptions || []).some(function (e) { return e.code === 'NEGATIVE_NET_PAY'; });
    if (flagged || (typeof row.NET_PAY === 'number' && row.NET_PAY < 0)) neg.push(rdy_id_(row.EMP_ID));
  });
  return rdy_res_(neg.length ? ['negative net pay: ' + rdy_list_(neg)] : [], [], 'No negative net pay');
}

/** Extra row (only when calcResults supplied): any other BLOCKER raised by the calculation. */
function rdy_calcBlockers_(inputs) {
  var ids = [];
  inputs.calcResults.forEach(function (res) {
    var other = (res.exceptions || []).some(function (e) { return e.severity === 'BLOCKER' && e.code !== 'NEGATIVE_NET_PAY'; });
    if (other) ids.push(rdy_id_((res.row || {}).EMP_ID));
  });
  return rdy_res_(ids.length ? ['calculation blockers: ' + rdy_list_(ids)] : [], [], 'No calculation blockers');
}

/**
 * inputs = {period, population, roster, allActiveIds?, masterDuplicateIds?, periodCategoryRow, attendanceRows,
 *   dailyMissingByEmp (null = no daily data), salaryByEmp, rateByEmp, feedStatus, otExceptionRows, otHoursByEmp,
 *   pendingOtCount?, statutoryResolved, efficiencyConfigRows, calcResults?}
 * Returns [{PERIOD, POPULATION, CHECK, STATUS, DETAIL}].
 */
function buildReadiness(inputs) {
  var pop = inputs.population;
  var roster = (inputs.roster || []).filter(function (e) {
    return !e.PAYROLL_CATEGORY || rdy_id_(e.PAYROLL_CATEGORY) === pop;
  });
  var rosterIds = rdy_uniq_(roster.map(function (e) { return rdy_id_(e.EMP_ID); }).filter(function (x) { return x; }));
  var rosterSet = rdy_set_(rosterIds);
  var ctx = { rosterIds: rosterIds, rosterSet: rosterSet };
  ctx.attRows = rdy_popAttendance_(inputs, rosterSet);
  var scoped = {};
  Object.keys(inputs).forEach(function (k) { scoped[k] = inputs[k]; });
  scoped.roster = roster;

  var results = [
    rdy_check1_(scoped), rdy_check2_(scoped, ctx), rdy_check3_(scoped, ctx), rdy_check4_(scoped, ctx),
    rdy_check5_(scoped, ctx), rdy_check6_(scoped), rdy_check7_(scoped, ctx), rdy_check8_(scoped),
    rdy_check9_(scoped, ctx), rdy_check10_(scoped, ctx), rdy_check11_(scoped), rdy_check12_(scoped)
  ];
  var out = results.map(function (r, i) {
    return { PERIOD: inputs.period, POPULATION: pop, CHECK: RDY_CHECK_NAMES[i], STATUS: r.status, DETAIL: r.detail };
  });
  if (inputs.calcResults) {
    var cb = rdy_calcBlockers_(inputs);
    out.push({ PERIOD: inputs.period, POPULATION: pop, CHECK: 'CALC_BLOCKERS', STATUS: cb.status, DETAIL: cb.detail });
  }
  return out;
}

/** Summary of readiness rows: {blocked, warn, ready, byPopulation:{pop:{blocked,warn,ready}}}. */
function rdy_summarize_(rows) {
  var s = { blocked: 0, warn: 0, ready: 0, byPopulation: {} };
  rows.forEach(function (r) {
    var p = s.byPopulation[r.POPULATION] || (s.byPopulation[r.POPULATION] = { blocked: 0, warn: 0, ready: 0 });
    var k = r.STATUS === 'BLOCKED' ? 'blocked' : (r.STATUS === 'WARN' ? 'warn' : 'ready');
    p[k]++; s[k]++;
  });
  return s;
}

// ---------------------------------------------------------------- sheet-touching entry point

/**
 * checkReadiness(period, population?) - runs the checks for one or all populations, rewrites the PAYROLL_READINESS
 * rows of that period (and those populations only), returns {period, blocked, warn, ready, byPopulation, rows}.
 * opts (internal, used by calculateDraft): {sources, calcResultsByPop}.
 */
function checkReadiness(period, population, opts) {
  guardPeriod_(period);
  opts = opts || {};
  var pops = population ? [population] : POPULATION_LIST.slice();
  pops.forEach(function (p) { if (!isKnownPopulation(p)) throw new Error('Unknown population "' + p + '"'); });
  var src = opts.sources || engine_readSources_(period);
  var checkedAt = nowIso_();
  var rows = [], done = [], skippedLocked = [];
  pops.forEach(function (pop) {
    var pc = engine_periodCatRow_(src, pop);
    if (pc && rdy_id_(pc.STATUS) === PERIOD_STATUS.LOCKED) { skippedLocked.push(pop); return; }
    var calcResults = opts.calcResultsByPop && opts.calcResultsByPop[pop];
    if (!calcResults) {
      try { calcResults = engine_calcPopulation(src, pop, '', checkedAt).results; } catch (e) { calcResults = null; }
    }
    var inputs = engine_readinessInputs_(src, pop, calcResults);
    buildReadiness(inputs).forEach(function (r) { r.CHECKED_AT = checkedAt; rows.push(r); });
    done.push(pop);
  });
  engine_replaceRows_(TABS.PAYROLL_READINESS, ['PERIOD', 'POPULATION', 'CHECK', 'STATUS', 'DETAIL', 'CHECKED_AT'], rows,
    function (o) { return normalizePeriod(o.PERIOD) === period && done.indexOf(rdy_id_(o.POPULATION)) >= 0; });
  var sum = rdy_summarize_(rows);
  var res = { period: period, populations: done, skippedLocked: skippedLocked, blocked: sum.blocked, warn: sum.warn,
    ready: sum.ready, byPopulation: sum.byPopulation, rows: rows };
  audit('READINESS', period, population || '', { blocked: sum.blocked, warn: sum.warn, ready: sum.ready });
  return res;
}
