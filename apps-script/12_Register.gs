/**
 * 12_Register.gs - monthly attendance register (DESIGN section 2, "Monthly attendance register").
 * One number per employee ("days present") plus one toggle per population ("INCLUDES / EXCLUDES weekly offs");
 * everything else (WEEK_OFF, PH, EL/CL/SL, C/Off, OD, LWP) is derived from the calendar and the approved leave.
 * Pure: deriveMonthlyAttendance, applyPhysicalOverride, registerValuesFromDerived, pickDefaultRegisterPeriod,
 * registerUserAllowed, validateRegisterEntries. Sheet-touching: registerLoad, registerSubmit,
 * refreshRegisterAttendance_ (the HTML page and its entry points are in 13_RegisterPage.gs).
 * Helpers are prefixed register_ / reg_.
 */
var REGISTER_SOURCE_REF = 'REGISTER';
var REGISTER_COLUMNS = ['REGISTER_DAYS_PRESENT', 'REGISTER_INCLUDES_WO', 'ENTERED_BY', 'GENERATED_VALUES_JSON', 'HR_OVERRIDE',
  'OVERRIDE_REASON', 'ROW_KEY', 'PHYSICAL_PRESENT_DAYS', 'ABSENT_LWP_DAYS'];

// ================================================================ pure

function reg_r2_(x) { return Math.round(x * 100) / 100; }

/** ISO dates of the period that fall on the weekly-off weekday. */
function weeklyOffDatesInMonth(period, weeklyOffDay) {
  return enumerateDates(period).filter(function (d) { return weekdayOf(d) === weeklyOffDay; });
}

/** ISO dates of the period that are PAID holidays for the site (HOLIDAY_CALENDAR PAID=Y, SITE = site or ALL). */
function paidHolidayDatesInMonth(period, holidays, site) {
  return enumerateDates(period).filter(function (d) { return isPaidHoliday_(holidays, d, site); });
}

function reg_leaveNum_(v) {
  if (v === '' || v == null) return 0;
  var n = Number(v);
  return isNaN(n) ? NaN : n;
}

/**
 * Pure. Turns the ONE number HR enters per employee into every INPUT_ATTENDANCE component.
 *  WEEK_OFF = weekly-off weekdays of the month for the site, minus dates that are paid holidays (workers: 0, the worker
 *  template has no week-off); PH = paid holidays of the month (site or ALL) that do not fall on the weekly off.
 *  includesWO = true (not for PERMANENT_WORKER): PRESENT_DAYS = registerDays - WEEK_OFF (min 0, WARN when negative);
 *  otherwise PRESENT_DAYS = registerDays. PHYSICAL_PRESENT_DAYS = that figure. Approved leave adds EL/CL/SL
 *  (EL_AVAILED / CL_AVAILED / SL_AVAILED), C/Off -> PAID_LEAVE_OTHER, LWP -> ABSENT_LWP_DAYS; OD days are ADDED to
 *  PRESENT_DAYS (worked, but not physical). Employee-level exception ATTENDANCE_OVER_MONTH (BLOCKER for that employee,
 *  the engine turns it into a HOLD) when PRESENT + WEEK_OFF + PH + EL + CL + SL + PAID_LEAVE_OTHER exceeds the days in
 *  the month.
 * @param {number} registerDays 0..days in month, step 0.5
 * @param {boolean|string} includesWO true / 'Y' when the entered days INCLUDE weekly offs
 * @param {string} population an active category code (PAYROLL_CATEGORY_CONFIG)
 * @param {string} period 'YYYY-MM'
 * @param {string} site 'NASHIK' | 'PUNE'
 * @param {Array} holidays HOLIDAY_CALENDAR rows {DATE, SITE, PAID}
 * @param {string} weeklyOffDay 'SUN'..'SAT'
 * @param {Object} approvedLeaveDays {EL, CL, SL, OD, COFF, LWP} days inside the period (missing = 0)
 * @returns {{ok:boolean, PRESENT_DAYS:number, PHYSICAL_PRESENT_DAYS:number, WEEK_OFF:number, PH:number, EL_AVAILED:number,
 *   CL_AVAILED:number, SL_AVAILED:number, PAID_LEAVE_OTHER:number, ABSENT_LWP_DAYS:number, OD_DAYS:number,
 *   WORKED_DAYS:number, REGISTER_DAYS_PRESENT:number, REGISTER_INCLUDES_WO:string, exceptions:Array, warnings:Array}}
 */
function deriveMonthlyAttendance(registerDays, includesWO, population, period, site, holidays, weeklyOffDay, approvedLeaveDays) {
  parsePeriod(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  if (WEEKDAY_CODES.indexOf(weeklyOffDay) < 0) throw new Error('Invalid weekly off "' + weeklyOffDay + '"');
  var dim = daysInMonth(period);
  var inc = includesWO === true || String(includesWO == null ? '' : includesWO).trim().toUpperCase() === 'Y';
  var out = { ok: false, PRESENT_DAYS: 0, PHYSICAL_PRESENT_DAYS: 0, WEEK_OFF: 0, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0,
    SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0, OD_DAYS: 0, WORKED_DAYS: 0,
    REGISTER_DAYS_PRESENT: registerDays, REGISTER_INCLUDES_WO: inc ? 'Y' : 'N', exceptions: [], warnings: [] };
  var reg = (registerDays === '' || registerDays == null || typeof registerDays === 'boolean') ? NaN : Number(registerDays);
  if (isNaN(reg) || reg < 0 || reg > dim || Math.abs(reg * 2 - Math.round(reg * 2)) > 1e-9) {
    out.exceptions.push({ severity: 'BLOCKER', code: 'REGISTER_DAYS_INVALID',
      message: 'Days present must be 0..' + dim + ' in steps of 0.5 (got "' + registerDays + '")' });
    return out;
  }
  var leave = approvedLeaveDays || {};
  var lv = {};
  var badLeave = false;
  LEAVE_TYPES.forEach(function (t) {
    var n = reg_leaveNum_(leave[t]);
    if (isNaN(n) || n < 0) { badLeave = true; n = 0; }
    lv[t] = n;
  });
  if (badLeave) {
    out.exceptions.push({ severity: 'BLOCKER', code: 'LEAVE_DAYS_INVALID', message: 'Approved leave days are not non-negative numbers' });
    return out;
  }
  var isWorker = att_isWorker_(population);
  var dates = enumerateDates(period);
  var phSet = {};
  dates.forEach(function (d) { if (isPaidHoliday_(holidays, d, site)) phSet[d] = true; });
  var wo = 0, ph = 0;
  dates.forEach(function (d) {
    var isWo = weekdayOf(d) === weeklyOffDay;
    if (phSet[d]) { if (!isWo) ph++; } else if (isWo) wo++;
  });
  out.WEEK_OFF = isWorker ? 0 : wo;
  out.PH = ph;
  var present = reg;
  if (inc) {
    if (isWorker) {
      out.warnings.push({ code: 'REGISTER_WO_IGNORED_FOR_WORKER',
        message: 'PERMANENT_WORKER has no week-off component: the entered days are used as they are' });
    } else {
      present = reg - out.WEEK_OFF;
      if (present < 0) {
        out.warnings.push({ code: 'REGISTER_LESS_THAN_WEEK_OFF',
          message: 'Days present ' + reg + ' (incl. week-off) is less than the ' + out.WEEK_OFF + ' week-off day(s); PRESENT_DAYS set to 0' });
        present = 0;
      }
    }
  }
  out.PHYSICAL_PRESENT_DAYS = reg_r2_(present);
  out.OD_DAYS = reg_r2_(lv.OD);
  out.PRESENT_DAYS = reg_r2_(present + lv.OD);
  out.EL_AVAILED = reg_r2_(lv.EL);
  out.CL_AVAILED = reg_r2_(lv.CL);
  out.SL_AVAILED = reg_r2_(lv.SL);
  out.PAID_LEAVE_OTHER = reg_r2_(lv.COFF);
  out.ABSENT_LWP_DAYS = reg_r2_(lv.LWP);
  out.WORKED_DAYS = reg_r2_(out.PRESENT_DAYS + out.WEEK_OFF + out.PH + out.EL_AVAILED + out.CL_AVAILED + out.SL_AVAILED +
    out.PAID_LEAVE_OTHER);
  if (out.WORKED_DAYS > dim + 1e-9) {
    out.exceptions.push({ severity: 'BLOCKER', code: 'ATTENDANCE_OVER_MONTH',
      message: 'Present ' + out.PRESENT_DAYS + ' + week-off ' + out.WEEK_OFF + ' + PH ' + out.PH + ' + EL/CL/SL ' +
        (out.EL_AVAILED + out.CL_AVAILED + out.SL_AVAILED) + ' + other paid leave ' + out.PAID_LEAVE_OTHER + ' = ' +
        out.WORKED_DAYS + ' exceeds the ' + dim + ' days of ' + period });
  }
  out.ok = true;
  return out;
}

/**
 * Pure. Replaces the physical days of a derived record with HR's owner-approved dispute decision (OD days stay
 * additive to PRESENT_DAYS) and re-checks the month total. Returns a new object.
 */
function applyPhysicalOverride(derived, decidedDays, population, period) {
  var d = JSON.parse(JSON.stringify(derived));
  var n = Number(decidedDays);
  if (isNaN(n) || n < 0 || n > daysInMonth(period)) throw new Error('Decided days must be 0..' + daysInMonth(period));
  d.PHYSICAL_PRESENT_DAYS = reg_r2_(n);
  d.PRESENT_DAYS = reg_r2_(n + (d.OD_DAYS || 0));
  d.WORKED_DAYS = reg_r2_(d.PRESENT_DAYS + d.WEEK_OFF + d.PH + d.EL_AVAILED + d.CL_AVAILED + d.SL_AVAILED + d.PAID_LEAVE_OTHER);
  d.exceptions = (d.exceptions || []).filter(function (e) { return e.code !== 'ATTENDANCE_OVER_MONTH'; });
  if (d.WORKED_DAYS > daysInMonth(period) + 1e-9) {
    d.exceptions.push({ severity: 'BLOCKER', code: 'ATTENDANCE_OVER_MONTH',
      message: 'Worked days ' + d.WORKED_DAYS + ' exceed the ' + daysInMonth(period) + ' days of ' + period });
  }
  return d;
}

/** Pure. The INPUT_ATTENDANCE cells for a derived record ({field: value}); snapshot goes to GENERATED_VALUES_JSON. */
function registerValuesFromDerived(d, enteredBy, enteredAt) {
  var snap = {};
  ATT_NUM_FIELDS.forEach(function (k) { snap[k] = d[k]; });
  snap.OD_DAYS = d.OD_DAYS;
  snap.REGISTER_DAYS_PRESENT = d.REGISTER_DAYS_PRESENT;
  snap.REGISTER_INCLUDES_WO = d.REGISTER_INCLUDES_WO;
  var v = {};
  ATT_NUM_FIELDS.forEach(function (k) { v[k] = d[k]; });
  v.WORKED_DAYS = d.WORKED_DAYS;
  v.PAYABLE_DAYS = d.WORKED_DAYS;
  v.REGISTER_DAYS_PRESENT = d.REGISTER_DAYS_PRESENT;
  v.REGISTER_INCLUDES_WO = d.REGISTER_INCLUDES_WO;
  v.SOURCE_REF = REGISTER_SOURCE_REF;
  v.ENTERED_BY = enteredBy || '';
  v.ENTERED_AT = enteredAt || '';
  v.GENERATED_VALUES_JSON = JSON.stringify(snap);
  v.HR_OVERRIDE = 'N';
  v.OVERRIDE_REASON = '';
  return v;
}

/** Pure. Latest period >= minPeriod with a population that is not LOCKED; else todayPeriod (if >= min); else minPeriod. */
function pickDefaultRegisterPeriod(periodCatRows, minPeriod, todayPeriod) {
  var open = {};
  (periodCatRows || []).forEach(function (r) {
    var p = normalizePeriod(r.PAYROLL_MONTH);
    if (!p || p < minPeriod) return;
    if (String(r.STATUS == null ? '' : r.STATUS).trim().toUpperCase() !== PERIOD_STATUS.LOCKED) open[p] = true;
  });
  var ps = Object.keys(open).sort();
  if (ps.length) return ps[ps.length - 1];
  return todayPeriod && todayPeriod >= minPeriod ? todayPeriod : minPeriod;
}

/** Pure. Who may submit the register: HR approver, owner, or REGISTER_ENTRY_EMAILS (comma separated). Unknown user: never. */
function registerUserAllowed(user, hrEmail, ownerEmail, extraCsv) {
  var u = String(user == null ? '' : user).trim().toLowerCase();
  if (!u) return false;
  var list = [hrEmail, ownerEmail].concat(String(extraCsv == null ? '' : extraCsv).split(','));
  return list.some(function (e) { return String(e == null ? '' : e).trim().toLowerCase() === u; });
}

/**
 * Pure. Validates submitted entries against the roster: each {empId, days}. Blank days = not entered (skipped).
 * Returns {entries:[{empId, days}], notEntered:[ids], errors:[text]}; any error means nothing may be written.
 */
function validateRegisterEntries(rawEntries, rosterMap, period) {
  var dim = daysInMonth(period), seen = {}, out = { entries: [], notEntered: [], errors: [] };
  (rawEntries || []).forEach(function (e) {
    var id = String(e && e.empId != null ? e.empId : '').trim();
    if (!id) return;
    if (seen[id]) { out.errors.push(id + ': entered twice'); return; }
    seen[id] = true;
    if (!rosterMap[id]) { out.errors.push(id + ': not on the roster of ' + period); return; }
    var raw = e.days;
    if (raw === '' || raw == null) { out.notEntered.push(id); return; }
    var n = typeof raw === 'boolean' ? NaN : Number(raw);
    if (isNaN(n) || n < 0 || n > dim || Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) {
      out.errors.push(id + ': days present must be 0..' + dim + ' in steps of 0.5 (got "' + raw + '")');
      return;
    }
    out.entries.push({ empId: id, days: n });
  });
  return out;
}

// ================================================================ sheet-touching

/** Throws unless the active user may run the register (HR approver / owner / REGISTER_ENTRY_EMAILS). Returns the email. */
function register_requireUser_() {
  var user = approval_userEmail_();
  if (!user) throw new Error('Cannot determine your Google account email - the register was not opened / saved');
  var ctl = readControlMap();
  if (!registerUserAllowed(user, ctl.HR_APPROVER_EMAIL, ctl.OWNER_APPROVER_EMAIL, ctl.REGISTER_ENTRY_EMAILS)) {
    throw new Error('Not allowed: ' + user + ' is not HR_APPROVER_EMAIL, OWNER_APPROVER_EMAIL or listed in REGISTER_ENTRY_EMAILS');
  }
  return user;
}

function register_requireColumns_() {
  var headers = getHeaders(resolveSheet_(TABS.INPUT_ATTENDANCE));
  var missing = REGISTER_COLUMNS.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) throw new Error('INPUT_ATTENDANCE lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup)');
}

/** Everything the register needs for a period, read once. */
function register_ctx_(period) {
  var roster = buildRoster(period), rosterMap = {};
  roster.forEach(function (e) { rosterMap[e.EMP_ID] = e; });
  var leaveRows = getSheet(TABS.INPUT_LEAVE) ? readObjects(TABS.INPUT_LEAVE) : [];
  var pp = periodPopulationsOpen_(period);
  return { period: period, roster: roster, rosterMap: rosterMap,
    holidays: getSheet(TABS.HOLIDAY_CALENDAR) ? readObjects(TABS.HOLIDAY_CALENDAR) : [],
    weeklyOff: { NASHIK: getWeeklyOff(SITE_NASHIK), PUNE: getWeeklyOff(SITE_PUNE) },
    leaveByEmp: leaveByEmp(leaveRows, period), workingDays: workingDaysFor_(period),
    lockedPops: pp.locked, isLocked: pp.isLocked, existing: existingAttendanceByEmp_(period) };
}

function register_derive_(ctx, emp, registerDays, includesWO) {
  return deriveMonthlyAttendance(registerDays, includesWO, emp.PAYROLL_CATEGORY, ctx.period, emp.SITE, ctx.holidays,
    ctx.weeklyOff[emp.SITE], ctx.leaveByEmp[emp.EMP_ID] || {});
}

function register_remarks_(existingRemarks, d) {
  var old = String(existingRemarks == null ? '' : existingRemarks);
  if (old !== '' && !/^(MISSING_DATES|REGISTER)/.test(old)) return null; // keep HR's own note
  var codes = d.warnings.map(function (w) { return w.code; }).concat(d.exceptions.map(function (e) { return e.code; }));
  return codes.length ? 'REGISTER: ' + codes.join(',') : 'REGISTER';
}

/**
 * Data for the page: {period, daysInMonth, defaultPeriod, populations:[{population, includesWO:'Y'|'N'}],
 * employees:[{empId, name, department, population, days, state:'OPEN'|'APPROVED'|'LOCKED'}]}.
 */
function registerLoad(period) {
  register_requireUser_();
  var min = getMinPeriod();
  var pcRows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY);
  var today = normalizePeriod(new Date());
  var def = pickDefaultRegisterPeriod(pcRows, min, today);
  var p = String(period == null ? '' : period).trim() || def;
  guardPeriod_(p);
  var ctx = register_ctx_(p);
  var incBy = {};
  var popList = populationList();
  popList.forEach(function (pop) { incBy[pop] = { Y: 0, N: 0 }; });
  var employees = ctx.roster.map(function (e) {
    var row = ctx.existing[e.EMP_ID];
    var days = '';
    if (row && row.REGISTER_DAYS_PRESENT !== '' && row.REGISTER_DAYS_PRESENT != null && isFinite(Number(row.REGISTER_DAYS_PRESENT))) {
      days = Number(row.REGISTER_DAYS_PRESENT);
      incBy[e.PAYROLL_CATEGORY][String(row.REGISTER_INCLUDES_WO).trim().toUpperCase() === 'Y' ? 'Y' : 'N']++;
    } // rows typed directly are not prefilled: the register value is the pay source
    var state = ctx.isLocked(e.PAYROLL_CATEGORY, e.EMP_ID) ? 'LOCKED'
      : (row && String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED' ? 'APPROVED' : 'OPEN');
    return { empId: e.EMP_ID, name: e.NAME, department: e.DEPARTMENT, population: e.PAYROLL_CATEGORY, days: days, state: state };
  });
  employees.sort(function (a, b) {
    var pa = popList.indexOf(a.population), pb = popList.indexOf(b.population);
    return pa - pb || (a.empId < b.empId ? -1 : (a.empId > b.empId ? 1 : 0));
  });
  var pops = popList.filter(function (pop) { return employees.some(function (e) { return e.population === pop; }); })
    .map(function (pop) { return { population: pop, includesWO: (incBy[pop].Y > 0 && incBy[pop].N === 0) ? 'Y' : 'N' }; });
  return { period: p, daysInMonth: daysInMonth(p), defaultPeriod: def, populations: pops, employees: employees };
}

/**
 * Writes INPUT_ATTENDANCE for PENDING rows only (APPROVED rows and LOCKED populations are reported, never written).
 * payload = {period, includesWO:{POPULATION:'Y'|'N'}, entries:[{empId, days}]}. Nothing is written when any entry is invalid.
 */
function registerSubmit(payload) {
  payload = payload || {};
  var period = String(payload.period == null ? '' : payload.period).trim();
  guardPeriod_(period);
  var user = register_requireUser_();
  register_requireColumns_();
  var ctx = register_ctx_(period);
  var val = validateRegisterEntries(payload.entries, ctx.rosterMap, period);
  if (val.errors.length) throw new Error('Register not saved - fix these first: ' + val.errors.slice(0, 20).join('; ') +
    (val.errors.length > 20 ? '; +' + (val.errors.length - 20) + ' more' : ''));
  var incMap = payload.includesWO || {};
  var now = nowIso_();
  var creates = [], updates = [], res = { period: period, written: 0, created: 0, updated: 0, notEntered: val.notEntered,
    skippedApproved: [], skippedLocked: [], skippedDuplicateRows: [], exceptions: [], warnings: [] };
  val.entries.forEach(function (en) {
    var emp = ctx.rosterMap[en.empId], pop = emp.PAYROLL_CATEGORY;
    if (ctx.isLocked(pop, en.empId)) { res.skippedLocked.push(en.empId); return; }
    var row = ctx.existing[en.empId];
    if (ctx.existing.__dups.indexOf(en.empId) >= 0) { res.skippedDuplicateRows.push(en.empId); return; }
    if (row && String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') { res.skippedApproved.push(en.empId); return; }
    var inc = incMap[pop];
    var d = register_derive_(ctx, emp, en.days, inc === true || String(inc == null ? 'N' : inc).trim().toUpperCase() === 'Y');
    d.exceptions.forEach(function (x) { res.exceptions.push({ EMP_ID: en.empId, code: x.code, message: x.message }); });
    d.warnings.forEach(function (x) { res.warnings.push({ EMP_ID: en.empId, code: x.code, message: x.message }); });
    var vals = registerValuesFromDerived(d, user, now);
    var rem = register_remarks_(row ? row.REMARKS : '', d);
    if (rem !== null) vals.REMARKS = rem;
    if (row) { updates.push({ row: row._row, values: vals }); res.updated++; }
    else {
      vals.PAYROLL_MONTH = period; vals.EMP_ID = en.empId; vals.PAYROLL_CATEGORY = pop;
      vals.WORKING_DAYS = ctx.workingDays[pop] === undefined ? '' : ctx.workingDays[pop];
      vals.APPROVAL_STATUS = 'PENDING'; vals.ROW_KEY = period + '|' + en.empId;
      creates.push(vals); res.created++;
    }
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  appendObjects(TABS.INPUT_ATTENDANCE, creates);
  res.written = res.created + res.updated;
  audit('REGISTER_SUBMIT', period, '', { by: user, written: res.written, created: res.created, updated: res.updated,
    skippedApproved: res.skippedApproved.length, skippedLocked: res.skippedLocked.length, notEntered: res.notEntered.length,
    exceptions: res.exceptions.map(function (x) { return x.EMP_ID + ':' + x.code; }), includesWO: incMap });
  return res;
}

/**
 * Re-derives the register rows of a period from their stored REGISTER_DAYS_PRESENT / REGISTER_INCLUDES_WO with the CURRENT
 * approved leave (called after every leave sync). PENDING rows are rewritten when a component changed; a row whose
 * dispute decision was applied (HR_OVERRIDE=Y, reason ATTENDANCE_DISPUTE...) keeps its decided physical days.
 * APPROVED rows are never touched: those whose leave-derived numbers are now different are listed as staleApproved.
 */
function refreshRegisterAttendance_(period) {
  register_requireColumns_();
  var ctx = register_ctx_(period), updates = [], stale = [], unchanged = 0;
  readObjects(TABS.INPUT_ATTENDANCE).forEach(function (row) {
    if (normalizePeriod(row.PAYROLL_MONTH) !== period || !isRegisterRow_(row)) return;
    var id = String(row.EMP_ID).trim(), emp = ctx.rosterMap[id];
    if (!emp || ctx.isLocked(emp.PAYROLL_CATEGORY, id)) return;
    var reg = row.REGISTER_DAYS_PRESENT;
    if (reg === '' || reg == null || isNaN(Number(reg))) return;
    var d = register_derive_(ctx, emp, Number(reg), String(row.REGISTER_INCLUDES_WO).trim().toUpperCase() === 'Y');
    if (!d.ok) return;
    var overridden = String(row.HR_OVERRIDE).trim().toUpperCase() === 'Y' && /^ATTENDANCE_DISPUTE/.test(String(row.OVERRIDE_REASON));
    var eff = overridden ? applyPhysicalOverride(d, row.PHYSICAL_PRESENT_DAYS, emp.PAYROLL_CATEGORY, period) : d;
    var same = ATT_NUM_FIELDS.every(function (k) { return attValuesEqual_(row[k], eff[k]); });
    var approved = String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED';
    if (same) { unchanged++; return; }
    if (approved) { stale.push(id); return; }
    var vals = {};
    ATT_NUM_FIELDS.forEach(function (k) { vals[k] = eff[k]; });
    vals.WORKED_DAYS = eff.WORKED_DAYS; vals.PAYABLE_DAYS = eff.WORKED_DAYS;
    vals.GENERATED_VALUES_JSON = registerValuesFromDerived(d, '', '').GENERATED_VALUES_JSON;
    var rem = register_remarks_(row.REMARKS, eff);
    if (rem !== null) vals.REMARKS = rem;
    updates.push({ row: row._row, values: vals });
  });
  updateRows(TABS.INPUT_ATTENDANCE, updates);
  var res = { period: period, refreshed: updates.length, unchanged: unchanged, staleApproved: stale };
  if (updates.length || stale.length) audit('REGISTER_REFRESH', period, '', res);
  return res;
}
