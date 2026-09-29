/**
 * 33_Comparison.gs - daily forms vs monthly register (October onward, only when daily data exists for the period)
 * and the dispute flow (DESIGN section 2, "Daily vs register comparison and disputes").
 *  - buildAttendanceComparison(period) writes ATTENDANCE_COMPARISON: DAILY_PRESENT (P + 0.5 x HD, OD excluded to match
 *    the physical figure) against REGISTER_PRESENT (the register's PHYSICAL days). |DIFF| < 0.01 = MATCH, else DISPUTE.
 *  - A DISPUTE holds that employee (ATTENDANCE_DISPUTE, employee-level HOLD) until HR filled HR_DECIDED_DAYS +
 *    HR_REASON and submitted them (runner = HR_APPROVER_EMAIL) AND the owner approved (runner = OWNER_APPROVER_EMAIL).
 *    The owner's approval writes the decided days into the PENDING INPUT_ATTENDANCE row (HR_OVERRIDE=Y + audit).
 *    A REJECTED decision keeps the employee on hold.
 * The engine and readiness compute the comparison LIVE (attendanceDisputesLive) and only merge the stored HR / owner
 * columns, so a stale sheet can never release a hold.
 * Pure: attendanceComparisonRows, attendanceDisputeStages, disputeHrPlan. Sheet-touching: the rest.
 */
var ATT_COMPARISON_COLUMNS = ['PERIOD', 'EMP_ID', 'NAME', 'POPULATION', 'DAILY_PRESENT', 'REGISTER_PRESENT', 'DIFF', 'STATUS',
  'HR_DECIDED_DAYS', 'HR_REASON', 'HR_BY', 'HR_AT', 'OWNER_DECISION', 'OWNER_BY', 'OWNER_AT', 'HR_STAMPED_DAYS'];
var ATT_COMPARISON_KEEP = ['HR_DECIDED_DAYS', 'HR_REASON', 'HR_BY', 'HR_AT', 'OWNER_DECISION', 'OWNER_BY', 'OWNER_AT', 'HR_STAMPED_DAYS'];
var ATT_COMPARISON_TOLERANCE = 0.01;

// ================================================================ pure

function cmp_str_(v) { return v == null ? '' : String(v).trim(); }
function cmp_r2_(x) { return Math.round(x * 100) / 100; }

/** The register's physical days of an INPUT_ATTENDANCE row: the pre-override snapshot when present, else the column. */
function comparisonRegisterPhysical_(attRow) {
  var v = NaN;
  try {
    var snap = attRow.GENERATED_VALUES_JSON ? JSON.parse(attRow.GENERATED_VALUES_JSON) : null;
    if (snap && snap.PHYSICAL_PRESENT_DAYS !== undefined && snap.PHYSICAL_PRESENT_DAYS !== '') v = Number(snap.PHYSICAL_PRESENT_DAYS);
  } catch (e) { v = NaN; }
  if (isNaN(v)) v = attNum_(attRow.PHYSICAL_PRESENT_DAYS);
  return v;
}

/**
 * Pure. One comparison row per roster employee whose INPUT_ATTENDANCE row comes from the register.
 * @param {Array} roster [{EMP_ID, PAYROLL_CATEGORY, DOJ?, NAME | EMPLOYEE_NAME}]
 * @param {Array} attendanceRows INPUT_ATTENDANCE row objects of the period
 * @param {Array} dailyRows ATTENDANCE_DAILY rows of the period
 * @param {Array} storedRows existing ATTENDANCE_COMPARISON rows (HR / owner columns are carried over per EMP_ID)
 */
function attendanceComparisonRows(period, roster, attendanceRows, dailyRows, storedRows) {
  var daily = {};
  aggregateDaily(dailyRows || [], period, roster || [], [], '').forEach(function (r) { daily[r.EMP_ID] = r; });
  var att = {};
  (attendanceRows || []).forEach(function (r) {
    var id = cmp_str_(r.EMP_ID);
    if (normalizePeriod(r.PAYROLL_MONTH) === period && isRegisterRow_(r) && !(id in att)) att[id] = r;
  });
  var stored = {};
  (storedRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) === period) stored[cmp_str_(r.EMP_ID)] = r;
  });
  var out = [];
  (roster || []).forEach(function (e) {
    var id = cmp_str_(e.EMP_ID), a = att[id];
    if (!a) return;
    var reg = comparisonRegisterPhysical_(a);
    var dRec = daily[id];
    var dp = dRec ? dRec.PHYSICAL_PRESENT_DAYS : 0;
    var diff = cmp_r2_(reg - dp);
    var row = { PERIOD: period, EMP_ID: id, NAME: e.NAME !== undefined ? e.NAME : (e.EMPLOYEE_NAME || ''),
      POPULATION: e.PAYROLL_CATEGORY, DAILY_PRESENT: cmp_r2_(dp), REGISTER_PRESENT: isNaN(reg) ? '' : cmp_r2_(reg),
      DIFF: isNaN(diff) ? '' : diff, STATUS: (!isNaN(diff) && Math.abs(diff) < ATT_COMPARISON_TOLERANCE) ? 'MATCH' : 'DISPUTE' };
    var old = stored[id] || {};
    ATT_COMPARISON_KEEP.forEach(function (k) { row[k] = old[k] === undefined ? '' : old[k]; });
    out.push(row);
  });
  return out;
}

/** True when HR's decision on a comparison row is complete and stamped for exactly the days now in HR_DECIDED_DAYS. */
function disputeHrStamped_(row, dim) {
  var days = row.HR_DECIDED_DAYS === '' || row.HR_DECIDED_DAYS == null ? NaN : Number(row.HR_DECIDED_DAYS);
  if (isNaN(days) || days < 0 || days > dim) return false;
  if (!cmp_str_(row.HR_REASON) || !cmp_str_(row.HR_BY)) return false;
  var st = row.HR_STAMPED_DAYS === '' || row.HR_STAMPED_DAYS == null ? NaN : Number(row.HR_STAMPED_DAYS);
  return !isNaN(st) && Math.abs(st - days) < 1e-9;
}

/**
 * Pure. Open disputes among live comparison rows: [{EMP_ID, stage, message}]. A DISPUTE is resolved only when HR's stamped
 * decision exists, the owner APPROVED it (OWNER_BY = the configured owner) and the decided days are really in the
 * employee's INPUT_ATTENDANCE row (HR_OVERRIDE=Y, reason ATTENDANCE_DISPUTE...). Stages: AWAITING_HR, AWAITING_OWNER,
 * OWNER_REJECTED, OWNER_STAMP_INVALID, DECISION_NOT_APPLIED.
 */
function attendanceDisputeStages(liveRows, attendanceByEmp, ownerEmail, period) {
  var dim = daysInMonth(period), out = [];
  (liveRows || []).forEach(function (r) {
    if (cmp_str_(r.STATUS).toUpperCase() !== 'DISPUTE') return;
    var id = cmp_str_(r.EMP_ID);
    var hold = function (stage, message) { out.push({ EMP_ID: id, stage: stage, message: message }); };
    var diffTxt = 'daily ' + r.DAILY_PRESENT + ' vs register ' + r.REGISTER_PRESENT;
    if (!disputeHrStamped_(r, dim)) return hold('AWAITING_HR', diffTxt + ': waiting for HR decision');
    var od = cmp_str_(r.OWNER_DECISION).toUpperCase();
    if (od === 'REJECTED') return hold('OWNER_REJECTED', diffTxt + ': owner rejected the decision');
    if (od !== 'APPROVED') return hold('AWAITING_OWNER', diffTxt + ': waiting for owner approval');
    if (!cmp_str_(ownerEmail) || cmp_str_(r.OWNER_BY).toLowerCase() !== cmp_str_(ownerEmail).toLowerCase()) {
      return hold('OWNER_STAMP_INVALID', diffTxt + ': OWNER_BY is not the configured owner (use the owner menu action)');
    }
    var a = (attendanceByEmp || {})[id];
    var applied = a && Math.abs(attNum_(a.PHYSICAL_PRESENT_DAYS) - Number(r.HR_DECIDED_DAYS)) < 0.01 &&
      cmp_str_(a.HR_OVERRIDE).toUpperCase() === 'Y' && /^ATTENDANCE_DISPUTE/.test(cmp_str_(a.OVERRIDE_REASON));
    if (!applied) return hold('DECISION_NOT_APPLIED', diffTxt + ': decided days are not in INPUT_ATTENDANCE (owner approval must be re-run)');
  });
  return out;
}

/**
 * Engine hook (cross-file, called through engine_callOpt_): live disputes of one population.
 * src = engine sources; roster = engine roster of the population; attendanceByEmp = {EMP_ID: INPUT_ATTENDANCE row}.
 */
function attendanceDisputesLive(src, pop, roster, attendanceByEmp) {
  var rows = attendanceComparisonRows(src.period, roster, Object.keys(attendanceByEmp || {}).map(function (k) { return attendanceByEmp[k]; }),
    src.dailyRows || [], src.comparisonRows || []);
  return attendanceDisputeStages(rows, attendanceByEmp, src.ownerEmail, src.period);
}

/**
 * Pure. What HR's submit does with each DISPUTE row: stamp (complete + changed), unchanged (already stamped for these
 * days), awaiting (nothing entered yet), invalid (partial / out of range). A changed decision also resets an earlier
 * owner decision (the owner approved other days).
 */
function disputeHrPlan(storedRows, period) {
  var dim = daysInMonth(period), plan = { stamp: [], unchanged: [], awaiting: [], invalid: [] };
  (storedRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) !== period || cmp_str_(r.STATUS).toUpperCase() !== 'DISPUTE') return;
    var id = cmp_str_(r.EMP_ID);
    var raw = r.HR_DECIDED_DAYS, reason = cmp_str_(r.HR_REASON);
    var blankDays = raw === '' || raw == null;
    if (blankDays && !reason) { plan.awaiting.push(id); return; }
    var days = blankDays ? NaN : Number(raw);
    if (isNaN(days) || days < 0 || days > dim) { plan.invalid.push(id + ': HR_DECIDED_DAYS must be 0..' + dim); return; }
    if (!reason) { plan.invalid.push(id + ': HR_REASON is required'); return; }
    if (disputeHrStamped_(r, dim)) { plan.unchanged.push(id); return; }
    plan.stamp.push({ row: r, empId: id, days: days, resetsOwner: !!cmp_str_(r.OWNER_DECISION) });
  });
  return plan;
}

// ================================================================ sheet-touching

function cmp_dailyRows_(period) {
  return (getSheet(TABS.ATTENDANCE_DAILY) ? readObjects(TABS.ATTENDANCE_DAILY) : []).filter(function (r) {
    return toIsoDate(r.DATE).slice(0, 7) === period;
  });
}

function cmp_storedRows_(period) {
  return (getSheet(TABS.ATTENDANCE_COMPARISON) ? readObjects(TABS.ATTENDANCE_COMPARISON) : []).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period;
  });
}

/**
 * Builds / refreshes ATTENDANCE_COMPARISON for the period (only when ATTENDANCE_DAILY has rows for it). HR / owner
 * columns of existing EMP_IDs are kept; LOCKED populations are never touched.
 */
function buildAttendanceComparison(period) {
  guardPeriod_(period);
  var daily = cmp_dailyRows_(period);
  if (!daily.length) throw new Error('No ATTENDANCE_DAILY rows for ' + period + ' - the daily-vs-register comparison only applies when daily data exists');
  var pp = periodPopulationsOpen_(period);
  var roster = buildRoster(period);
  var att = readObjects(TABS.INPUT_ATTENDANCE).filter(function (r) { return normalizePeriod(r.PAYROLL_MONTH) === period; });
  var rows = attendanceComparisonRows(period, roster, att, daily, cmp_storedRows_(period)).filter(function (r) {
    return pp.locked.indexOf(r.POPULATION) < 0;
  });
  engine_replaceRows_(TABS.ATTENDANCE_COMPARISON, ATT_COMPARISON_COLUMNS, rows, function (o) {
    return normalizePeriod(o.PERIOD) === period && pp.locked.indexOf(cmp_str_(o.POPULATION)) < 0;
  });
  var res = { period: period, compared: rows.length,
    match: rows.filter(function (r) { return r.STATUS === 'MATCH'; }).length,
    dispute: rows.filter(function (r) { return r.STATUS === 'DISPUTE'; }).length, lockedPopulations: pp.locked };
  audit('ATT_COMPARISON', period, '', res);
  return res;
}

/**
 * HR submits the dispute decisions typed in ATTENDANCE_COMPARISON (HR_DECIDED_DAYS + HR_REASON): stamps HR_BY / HR_AT.
 * Runner must be HR_APPROVER_EMAIL.
 */
function submitDisputeDecisions(period) {
  guardPeriod_(period);
  var user = approval_userEmail_();
  var hr = getControl('HR_APPROVER_EMAIL', '');
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(hr) || approval_email_(user) !== approval_email_(hr)) {
    audit('DISPUTE_HR_SUBMIT', period, '', { result: 'REFUSED', reason: 'USER_NOT_HR_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_HR_APPROVER' };
  }
  approval_requireStampColumns_(TABS.ATTENDANCE_COMPARISON, ['HR_BY', 'HR_AT', 'HR_STAMPED_DAYS', 'OWNER_DECISION']);
  var plan = disputeHrPlan(cmp_storedRows_(period), period), now = nowIso_();
  var pp = periodPopulationsOpen_(period);
  var updates = [], skippedLocked = [];
  plan.stamp.forEach(function (s) {
    if (pp.locked.indexOf(cmp_str_(s.row.POPULATION)) >= 0) { skippedLocked.push(s.empId); return; }
    var v = { HR_BY: user, HR_AT: now, HR_STAMPED_DAYS: s.days };
    if (s.resetsOwner) { v.OWNER_DECISION = ''; v.OWNER_BY = ''; v.OWNER_AT = ''; }
    updates.push({ row: s.row._row, values: v });
  });
  updateRows(TABS.ATTENDANCE_COMPARISON, updates);
  var res = { ok: true, reason: 'OK', period: period, stamped: updates.length, unchanged: plan.unchanged.length,
    awaitingHrInput: plan.awaiting, invalid: plan.invalid, ownerDecisionsReset: plan.stamp.filter(function (s) { return s.resetsOwner; })
      .map(function (s) { return s.empId; }), skippedLocked: skippedLocked };
  audit('DISPUTE_HR_SUBMIT', period, '', { result: 'STAMPED', user: user, stamped: res.stamped, invalid: res.invalid.length,
    ownerDecisionsReset: res.ownerDecisionsReset });
  return res;
}

/**
 * Owner decision on the HR-stamped disputes. Runner must be OWNER_APPROVER_EMAIL.
 * APPROVED: the decided days replace PRESENT_DAYS / PHYSICAL_PRESENT_DAYS of that employee's PENDING register row in
 * INPUT_ATTENDANCE (HR_OVERRIDE=Y, OVERRIDE_REASON=ATTENDANCE_DISPUTE ...); a row that is already APPROVED, locked or not
 * from the register is reported and its decision is NOT stamped (fail closed). REJECTED: the employee stays on hold.
 * empIds (optional) limits the decision to those employees.
 */
function ownerDecideDisputes(period, decision, empIds) {
  guardPeriod_(period);
  decision = String(decision || 'APPROVED').trim().toUpperCase();
  if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new Error('Decision must be APPROVED or REJECTED');
  var user = approval_userEmail_();
  var owner = getOwnerApproverEmail();
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(owner) || approval_email_(user) !== approval_email_(owner)) {
    audit('DISPUTE_OWNER_DECISION', period, '', { result: 'REFUSED', reason: 'USER_NOT_OWNER_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_OWNER_APPROVER' };
  }
  approval_requireStampColumns_(TABS.ATTENDANCE_COMPARISON, ['OWNER_DECISION', 'OWNER_BY', 'OWNER_AT']);
  var want = null;
  if (empIds && empIds.length) { want = {}; empIds.forEach(function (x) { want[cmp_str_(x)] = true; }); }
  var dim = daysInMonth(period), pp = periodPopulationsOpen_(period), now = nowIso_();
  var res = { ok: true, reason: 'OK', period: period, decision: decision, decided: [], skipped: [] };
  var compUpdates = [], attUpdates = [];
  var ctx = decision === 'APPROVED' ? register_ctx_(period) : null;
  cmp_storedRows_(period).forEach(function (r) {
    if (cmp_str_(r.STATUS).toUpperCase() !== 'DISPUTE') return;
    var id = cmp_str_(r.EMP_ID);
    if (want && !want[id]) return;
    var skip = function (why) { res.skipped.push({ EMP_ID: id, reason: why }); };
    if (pp.locked.indexOf(cmp_str_(r.POPULATION)) >= 0) return skip('POPULATION_LOCKED');
    if (!disputeHrStamped_(r, dim)) return skip('HR_DECISION_MISSING_OR_NOT_SUBMITTED');
    var cur = cmp_str_(r.OWNER_DECISION).toUpperCase();
    if (cur === 'REJECTED' && decision === 'APPROVED') return skip('ALREADY_REJECTED_CLEAR_OWNER_DECISION_FIRST');
    if (cur && cur !== decision) return skip('ALREADY_DECIDED_' + cur);
    if (decision === 'APPROVED') {
      var emp = ctx.rosterMap[id], row = ctx.existing[id];
      if (!emp || !row || ctx.existing.__dups.indexOf(id) >= 0) return skip('NO_SINGLE_ATTENDANCE_ROW');
      if (!isRegisterRow_(row)) return skip('NOT_A_REGISTER_ROW');
      if (String(row.APPROVAL_STATUS || '').trim().toUpperCase() === 'APPROVED') {
        return skip('ATTENDANCE_ALREADY_APPROVED (set the INPUT_ATTENDANCE row back to PENDING, then approve again)');
      }
      var d = register_derive_(ctx, emp, Number(row.REGISTER_DAYS_PRESENT), String(row.REGISTER_INCLUDES_WO).trim().toUpperCase() === 'Y');
      if (!d.ok) return skip('REGISTER_ROW_INVALID');
      var eff = applyPhysicalOverride(d, Number(r.HR_DECIDED_DAYS), emp.PAYROLL_CATEGORY, period);
      var vals = {};
      ATT_NUM_FIELDS.forEach(function (k) { vals[k] = eff[k]; });
      vals.WORKED_DAYS = eff.WORKED_DAYS; vals.PAYABLE_DAYS = eff.WORKED_DAYS;
      vals.GENERATED_VALUES_JSON = registerValuesFromDerived(d, '', '').GENERATED_VALUES_JSON;
      vals.HR_OVERRIDE = 'Y';
      vals.OVERRIDE_REASON = 'ATTENDANCE_DISPUTE: ' + cmp_str_(r.HR_REASON) + ' (HR ' + cmp_str_(r.HR_BY) + ', owner ' + user + ')';
      attUpdates.push({ row: row._row, values: vals });
    }
    compUpdates.push({ row: r._row, values: { OWNER_DECISION: decision, OWNER_BY: user, OWNER_AT: now } });
    res.decided.push(id);
  });
  updateRows(TABS.INPUT_ATTENDANCE, attUpdates);
  updateRows(TABS.ATTENDANCE_COMPARISON, compUpdates);
  audit('DISPUTE_OWNER_DECISION', period, '', { result: decision, user: user, decided: res.decided,
    skipped: res.skipped.map(function (s) { return s.EMP_ID + ':' + s.reason; }) });
  return res;
}

function ownerApproveDisputes(period) { return ownerDecideDisputes(period, 'APPROVED'); }
