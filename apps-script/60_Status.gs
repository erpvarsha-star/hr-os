/**
 * 60_Status.gs - payroll status engine (read-only). Answers "is every input for this period in?" per population.
 *
 * payrollStatusCompute(inp) is PURE (all sheet data passed in); payrollStatus(period) is the thin sheet reader.
 * The result is what the month-end digest (61_Notify.gs / 62_Reminders.gs) shows today, and what an October autopilot
 * (auto calculate / lock) can reuse: {period, ready, overall, populations:[{population, site, ready, items:[{key, ok, detail,
 * missing:[EMP_IDs]}]}]}. Nothing here writes to a sheet or changes calculation / readiness / approval / lock behaviour.
 *
 * Item keys use the FEED_STATUS feed names (FEED_LIST in 00_Config.gs): HOLIDAYS, CANTEEN, SOCIETY, ADVANCE, OT; the
 * other two are WORKING_DAYS (PAYROLL_PERIOD_CATEGORY) and ATTENDANCE (INPUT_ATTENDANCE).
 */
var STATUS_ITEM_KEYS = ['HOLIDAYS', 'WORKING_DAYS', 'ATTENDANCE', 'OT', 'CANTEEN', 'SOCIETY', 'ADVANCE'];
var STATUS_FIRST_MONTH_NOTE = 'no previous month to compare - HR confirms via Mark feed complete';
var STATUS_MAX_IDS = 10;

// ---------------------------------------------------------------- pure helpers

function status_id_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function status_str_(v) { return String(v == null ? '' : v).trim(); }

/** blank / non-numeric -> NaN. */
function status_num_(v) {
  if (v === '' || v == null) return NaN;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v).replace(/,/g, '').trim();
  return s === '' || isNaN(Number(s)) ? NaN : Number(s);
}

function status_inPeriod_(rows, col, period) {
  return (rows || []).filter(function (r) { return normalizePeriod(r[col]) === period; });
}

/** Up to STATUS_MAX_IDS ids, then ", +N more". */
function statusIdList(ids) {
  var a = ids || [];
  var head = a.slice(0, STATUS_MAX_IDS).join(', ');
  return a.length > STATUS_MAX_IDS ? head + ', +' + (a.length - STATUS_MAX_IDS) + ' more' : head;
}

function status_item_(key, ok, detail, missing) {
  return { key: key, ok: !!ok, detail: detail, missing: missing || [] };
}

function status_feedComplete_(feedStatus, feed) {
  var v = (feedStatus || {})[feed];
  if (v && typeof v === 'object') v = v.STATUS;
  return status_id_(v) === 'COMPLETE';
}

// ---------------------------------------------------------------- the items (pure)

function status_holidays_(inp) {
  var done = status_feedComplete_(inp.feedStatus, 'HOLIDAYS');
  return status_item_('HOLIDAYS', done, done ? 'HOLIDAYS feed COMPLETE' : 'HOLIDAYS feed not marked COMPLETE (HR OS > Month > Mark feed complete)');
}

function status_workingDays_(inp, pop) {
  var row = null;
  status_inPeriod_(inp.periodCat, 'PAYROLL_MONTH', inp.period).forEach(function (r) { if (!row && status_str_(r.PAYROLL_CATEGORY) === pop) row = r; });
  if (!row) return status_item_('WORKING_DAYS', false, 'no PAYROLL_PERIOD_CATEGORY row for ' + inp.period + ' (run Prepare month)');
  var wd = status_num_(row.WORKING_DAYS);
  if (!(wd > 0)) return status_item_('WORKING_DAYS', false, 'WORKING_DAYS not filled');
  if (wd > daysInMonth(inp.period)) return status_item_('WORKING_DAYS', false, 'WORKING_DAYS ' + wd + ' exceeds days in month');
  return status_item_('WORKING_DAYS', true, 'WORKING_DAYS=' + wd);
}

function status_attendance_(inp, popRoster) {
  var auto = inp.autoIds || {};
  var need = popRoster.filter(function (e) { return !auto[status_id_(e.EMP_ID)]; });
  var byEmp = {};
  status_inPeriod_(inp.attendance, 'PAYROLL_MONTH', inp.period).forEach(function (r) {
    var id = status_id_(r.EMP_ID);
    var numeric = !isNaN(status_num_(r.PRESENT_DAYS)) && status_num_(r.PRESENT_DAYS) >= 0;
    // a numeric row wins over a blank duplicate
    if (!byEmp[id] || (numeric && !byEmp[id].numeric)) byEmp[id] = { row: r, numeric: numeric };
  });
  var missing = [], approved = 0, pending = 0;
  need.forEach(function (e) {
    var hit = byEmp[status_id_(e.EMP_ID)];
    if (!hit || !hit.numeric) { missing.push(String(e.EMP_ID).trim()); return; }
    if (status_id_(hit.row.APPROVAL_STATUS) === 'APPROVED') approved++; else pending++;
  });
  var have = need.length - missing.length;
  var detail = have + '/' + need.length + ' attendance entered (' + approved + ' APPROVED, ' + pending + ' PENDING)';
  if (Object.keys(auto).length && popRoster.length !== need.length) detail += '; ' + (popRoster.length - need.length) + ' automatic';
  if (missing.length) detail += '; missing ' + missing.length;
  return status_item_('ATTENDANCE', missing.length === 0, detail, missing);
}

/**
 * OT: synced for the period (OT_PENDING_<period> written by Sync OT - it is written even when the source is empty - or
 * INPUT_OT holds normalizer / HR_MANUAL rows of the period) and no pending (undecided) OT events in the OT window for the
 * population. The pending count is the one Sync OT stored (nothing external is re-read here). Events of unknown EMP_IDs
 * (stored under UNKNOWN) count against every population, exactly as readiness does. All populations are checked: every
 * category's calculation reads OT hours.
 */
function status_ot_(inp, pop) {
  var raw = inp.otPendingRaw, parsed = null, stored = raw !== undefined && raw !== null && String(raw).trim() !== '';
  if (stored) { try { parsed = JSON.parse(String(raw)); } catch (e) { parsed = null; } }
  var hasRows = (inp.otRows || []).some(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== inp.period) return false;
    return status_str_(r.NORMALIZER_VERSION) !== '' || status_id_(r.SOURCE_REF) === 'HR_MANUAL';
  });
  if (!stored && !hasRows) return status_item_('OT', false, 'OT not synced for ' + inp.period + ' (HR OS > Month > Sync OT)');
  if (stored && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
    return status_item_('OT', false, 'OT pending record unreadable - run Sync OT again');
  }
  var pend = stored ? Number(parsed[pop] || 0) + Number(parsed.UNKNOWN || 0) : 0;
  if (!isFinite(pend)) pend = 0;
  if (pend > 0) return status_item_('OT', false, pend + ' OT request(s) still waiting for a manager decision');
  return status_item_('OT', true, stored ? 'OT synced, none pending' : 'OT rows present; Sync OT not run since (pending unknown)');
}

/**
 * Feed specs for the "same people as last month" rule. counted(row) = the row counts in the calculation; present(row) = the
 * row is an entry for the employee (a 0 amount counts). CANTEEN counts VALID (or blank status) rows, SOCIETY / ADVANCE
 * APPROVED rows; a not-yet-approved SOCIETY / ADVANCE row still proves the entry exists (it is listed as PENDING).
 */
var STATUS_PREV_FEEDS = [
  { key: 'CANTEEN', rows: 'canteenRows', counted: function (r) { var s = status_id_(r.STATUS); return s === '' || s === 'VALID'; },
    present: function (r) { return status_id_(r.STATUS) !== 'EXCEPTION'; } },
  { key: 'SOCIETY', rows: 'societyRows', counted: function (r) { return status_id_(r.APPROVAL_STATUS) === 'APPROVED'; },
    present: function () { return true; } },
  { key: 'ADVANCE', rows: 'advanceRows', counted: function (r) { return status_id_(r.APPROVAL_STATUS) === 'APPROVED'; },
    present: function () { return true; }, balanceCol: 'CLOSING_BALANCE_INR' }
];

function status_prevFeed_(inp, spec, popRoster) {
  var prev = engine_prevPeriod(inp.period);
  var all = inp[spec.rows] || [];
  var prevCounted = status_inPeriod_(all, 'PAYROLL_MONTH', prev).filter(spec.counted);
  var marked = status_feedComplete_(inp.feedStatus, spec.key);
  if (!prevCounted.length) {
    return { key: spec.key, ok: marked, detail: STATUS_FIRST_MONTH_NOTE + (marked ? ' (marked COMPLETE)' : ' (not yet marked COMPLETE)'), missing: [],
      firstMonth: true };
  }
  var expected = {};
  prevCounted.forEach(function (r) { expected[status_id_(r.EMP_ID)] = true; });
  if (spec.balanceCol) {
    // anyone whose latest earlier APPROVED entry still shows money outstanding is expected to have a row again
    var latest = {};
    all.forEach(function (r) {
      var p = normalizePeriod(r.PAYROLL_MONTH);
      if (!p || p >= inp.period || !spec.counted(r)) return;
      var id = status_id_(r.EMP_ID);
      if (!latest[id] || p >= latest[id].p) latest[id] = { p: p, r: r };
    });
    Object.keys(latest).forEach(function (id) { if (status_num_(latest[id].r[spec.balanceCol]) > 0) expected[id] = true; });
  }
  var have = {}, pendingCount = 0;
  status_inPeriod_(all, 'PAYROLL_MONTH', inp.period).forEach(function (r) {
    if (!spec.present(r)) return;
    var id = status_id_(r.EMP_ID);
    if (!have[id]) { have[id] = true; if (!spec.counted(r)) pendingCount++; }
  });
  var exp = 0, missing = [];
  popRoster.forEach(function (e) {
    var id = status_id_(e.EMP_ID);
    if (!expected[id]) return;
    exp++;
    if (!have[id]) missing.push(String(e.EMP_ID).trim());
  });
  var detail = (exp - missing.length) + '/' + exp + ' expected entries in (same people as ' + prev + ')';
  if (pendingCount) detail += '; ' + pendingCount + ' not yet approved';
  if (missing.length) detail += '; missing ' + missing.length;
  return { key: spec.key, ok: missing.length === 0, detail: detail, missing: missing, firstMonth: false };
}

/**
 * PURE core. inp = {period, populations:[{code, site}], roster:[{EMP_ID, PAYROLL_CATEGORY}] (period roster), autoIds:{ID:true},
 * feedStatus:{FEED:'COMPLETE'|'OPEN'}, periodCat, attendance, otPendingRaw, otRows, canteenRows, societyRows, advanceRows}
 * (row arrays are whole tabs; they are filtered by period here).
 */
function payrollStatusCompute(inp) {
  parsePeriod(inp.period);
  var pops = (inp.populations || []).map(function (p) {
    var popRoster = (inp.roster || []).filter(function (e) { return status_str_(e.PAYROLL_CATEGORY) === p.code; });
    var items = [status_holidays_(inp), status_workingDays_(inp, p.code), status_attendance_(inp, popRoster), status_ot_(inp, p.code)];
    STATUS_PREV_FEEDS.forEach(function (spec) { items.push(status_prevFeed_(inp, spec, popRoster)); });
    items.forEach(function (it) { delete it.firstMonth; });
    var ready = items.every(function (it) { return it.ok; });
    return { population: p.code, site: p.site || '', employees: popRoster.length, ready: ready, items: items };
  });
  var notReady = pops.filter(function (p) { return !p.ready; }).map(function (p) { return p.population; });
  var ready = pops.length > 0 && notReady.length === 0;
  return { period: inp.period, ready: ready, overall: { ready: ready, populations: pops.length, notReady: notReady }, populations: pops };
}

// ---------------------------------------------------------------- digest text (pure)

var STATUS_TICK = '✅', STATUS_WAIT = '⏳';

/**
 * Plain-text digest of a payrollStatusCompute result. opts.onlyKeys = ['ATTENDANCE'] limits the items, opts.sites = ['VFL']
 * limits the populations, opts.onlyOpen drops populations that are already ok for the shown items.
 */
function statusDigestText(st, opts) {
  opts = opts || {};
  var lines = ['Payroll inputs for ' + st.period + (st.ready ? ' - all received' : '')];
  var shown = 0;
  st.populations.forEach(function (p) {
    if (opts.sites && opts.sites.indexOf(p.site) < 0) return;
    var items = p.items.filter(function (it) { return !opts.onlyKeys || opts.onlyKeys.indexOf(it.key) >= 0; });
    if (opts.onlyOpen && items.every(function (it) { return it.ok; })) return;
    shown++;
    lines.push('');
    lines.push(p.population + ' (' + p.employees + ' employees)');
    items.forEach(function (it) {
      if (it.ok) { lines.push(STATUS_TICK + ' ' + it.key + ' - ' + it.detail); return; }
      lines.push(STATUS_WAIT + ' ' + it.key + ' - ' + it.detail + (it.missing.length ? ' [' + statusIdList(it.missing) + ']' : ''));
    });
  });
  return { text: lines.join('\n'), populationsShown: shown };
}

/** Pure. The payroll period the month-end digest is about on an ISO date = the PREVIOUS calendar month; day 1..10 only, else ''. */
function statusDigestPeriod(todayIso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(todayIso || ''));
  if (!m) return '';
  var day = +m[3];
  if (day < 1 || day > 10) return '';
  return engine_prevPeriod(m[1] + '-' + m[2]);
}

/** Pure. The period "Payroll status" offers by default (previous calendar month of the ISO date), clamped to the minimum. */
function statusDefaultPeriod(todayIso, minPeriod) {
  var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(todayIso || ''));
  var p = m ? engine_prevPeriod(m[1] + '-' + m[2]) : (minPeriod || HROS_MIN_PERIOD_FLOOR);
  return minPeriod && p < minPeriod ? minPeriod : p;
}

// ---------------------------------------------------------------- sheet reader

function status_readOpt_(name) { return getSheet(name) ? readObjects(name) : []; }

/** ISO date of today in the script time zone. */
function status_todayIso_() { return Utilities.formatDate(new Date(), HROS_TZ, 'yyyy-MM-dd'); }

/** Reads the sheets and returns payrollStatusCompute(...) for the period (no writes). */
function payrollStatus(period) {
  guardPeriod_(period);
  var ctl = getSheet(TABS.PAYROLL_CONTROL) ? readControlMap() : {};
  var fs = {};
  status_inPeriod_(status_readOpt_(TABS.FEED_STATUS), 'PERIOD', period).forEach(function (r) {
    var f = status_id_(r.FEED);
    if (f) fs[f] = status_id_(r.STATUS);
  });
  var prev = engine_prevPeriod(period);
  function twoPeriods(tab) {
    return status_readOpt_(tab).filter(function (r) { var p = normalizePeriod(r.PAYROLL_MONTH); return p && p <= period; });
  }
  return payrollStatusCompute({
    period: period,
    populations: categoryList().map(function (e) { return { code: e.code, site: e.site }; }),
    roster: buildRoster(period),
    autoIds: parseIdSet_(ctl.AUTO_FULL_ATTENDANCE_EMP_IDS),
    feedStatus: fs,
    periodCat: status_inPeriod_(status_readOpt_(TABS.PAYROLL_PERIOD_CATEGORY), 'PAYROLL_MONTH', period),
    attendance: status_inPeriod_(status_readOpt_(TABS.INPUT_ATTENDANCE), 'PAYROLL_MONTH', period),
    otPendingRaw: ctl['OT_PENDING_' + period],
    otRows: status_inPeriod_(status_readOpt_(TABS.INPUT_OT), 'PAYROLL_MONTH', period),
    canteenRows: twoPeriods(TABS.INPUT_CANTEEN),
    societyRows: twoPeriods(TABS.INPUT_SOCIETY),
    advanceRows: twoPeriods(TABS.INPUT_ADVANCE),
    prevPeriod: prev
  });
}
