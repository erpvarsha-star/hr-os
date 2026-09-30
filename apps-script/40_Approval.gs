/**
 * 40_Approval.gs - HR / Accounts approvals and owner reopen (DESIGN section 7).
 * Pure: approvalDecision, reopenDecision. Sheet-touching: hrApprove, accountsApprove, reopenPeriod, approval_* helpers.
 */

// ---------------------------------------------------------------- pure

function approval_email_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function approval_blockedCount_(rows) {
  return (rows || []).filter(function (r) { return String(r && r.STATUS).trim().toUpperCase() === 'BLOCKED'; }).length;
}

/**
 * approvalDecision({action:'HR'|'ACCOUNTS', status, userEmail, approverEmail, readinessRows, storedHash, currentHash})
 * -> {ok, newStatus, reason}. Hash mismatch -> newStatus DRAFT, reason INPUTS_OR_DRAFT_CHANGED (caller writes reset+audit).
 */
function approvalDecision(a) {
  a = a || {};
  var status = String(a.status == null ? '' : a.status).trim().toUpperCase();
  var isHr = a.action === 'HR';
  if (!isHr && a.action !== 'ACCOUNTS') return { ok: false, newStatus: status, reason: 'UNKNOWN_ACTION' };
  var user = approval_email_(a.userEmail);
  if (!user) return { ok: false, newStatus: status, reason: 'USER_EMAIL_UNKNOWN' };
  var need = isHr ? PERIOD_STATUS.DRAFT : PERIOD_STATUS.HR_APPROVED;
  if (status !== need) return { ok: false, newStatus: status, reason: 'STATUS_NOT_' + need };
  var approver = approval_email_(a.approverEmail);
  if (!approver) return { ok: false, newStatus: status, reason: 'APPROVER_EMAIL_NOT_CONFIGURED' };
  if (user !== approver) return { ok: false, newStatus: status, reason: 'USER_NOT_' + (isHr ? 'HR' : 'ACCOUNTS') + '_APPROVER' };
  var stored = String(a.storedHash == null ? '' : a.storedHash).trim();
  if (!stored) return { ok: false, newStatus: status, reason: 'NO_DRAFT_HASH' };
  if (String(a.currentHash == null ? '' : a.currentHash) !== stored) {
    return { ok: false, newStatus: PERIOD_STATUS.DRAFT, reason: 'INPUTS_OR_DRAFT_CHANGED' };
  }
  var blocked = approval_blockedCount_(a.readinessRows);
  if (blocked > 0) return { ok: false, newStatus: status, reason: 'READINESS_BLOCKED(' + blocked + ')' };
  return { ok: true, newStatus: isHr ? PERIOD_STATUS.HR_APPROVED : PERIOD_STATUS.ACCOUNTS_APPROVED, reason: 'OK' };
}

/** Reopen rule: owner only; from HR_APPROVED or ACCOUNTS_APPROVED to DRAFT; never from LOCKED. */
function reopenDecision(status, userEmail, ownerEmail) {
  var st = String(status == null ? '' : status).trim().toUpperCase();
  var user = approval_email_(userEmail), owner = approval_email_(ownerEmail);
  if (st === PERIOD_STATUS.LOCKED) return { ok: false, newStatus: st, reason: 'LOCKED_CANNOT_REOPEN' };
  if (!user) return { ok: false, newStatus: st, reason: 'USER_EMAIL_UNKNOWN' };
  if (!owner || user !== owner) return { ok: false, newStatus: st, reason: 'USER_NOT_OWNER' };
  if (st !== PERIOD_STATUS.HR_APPROVED && st !== PERIOD_STATUS.ACCOUNTS_APPROVED) {
    return { ok: false, newStatus: st, reason: 'STATUS_NOT_APPROVED' };
  }
  return { ok: true, newStatus: PERIOD_STATUS.DRAFT, reason: 'OK' };
}

// ---------------------------------------------------------------- sheet-touching helpers

function approval_userEmail_() {
  var u = '';
  try { u = Session.getActiveUser().getEmail(); } catch (e) { u = ''; }
  if (!u) { try { u = Session.getEffectiveUser().getEmail(); } catch (e2) { u = ''; } }
  return String(u || '').trim();
}

function approval_ownerEmail_() {
  try {
    var o = SpreadsheetApp.getActive().getOwner();
    return o ? String(o.getEmail() || '').trim() : '';
  } catch (e) { return ''; }
}

/**
 * Re-runs the calc in memory (no writes) from freshly read sources and hashes it exactly as calculateDraft does.
 * Returns {hash, src, calc}.
 */
function approval_recomputeHash_(period, population, src) {
  src = src || engine_readSources_(period);
  var calc = engine_calcPopulation(src, population, '', nowIso_());
  return { hash: hashRows(engine_payableRows_(calc.rows), OUTPUT_COLUMNS, engine_sha256Hex_), src: src, calc: calc };
}

function approval_pcRow_(period, population) {
  var rows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY);
  for (var i = 0; i < rows.length; i++) {
    if (normalizePeriod(rows[i].PAYROLL_MONTH) === period && String(rows[i].PAYROLL_CATEGORY).trim() === population) return rows[i];
  }
  throw new Error('No PAYROLL_PERIOD_CATEGORY row for ' + period + ' x ' + population);
}

/** Update the PAYROLL_PERIOD_CATEGORY row. Only the new HR_/ACCOUNTS_ columns are ever stamped: the legacy
 * APPROVED_BY / APPROVED_AT columns (working-days approval) are never overwritten. */
function approval_writePc_(pcRow, values) {
  var v = {};
  Object.keys(values).forEach(function (k) {
    if (k === 'APPROVED_BY' || k === 'APPROVED_AT') throw new Error('Legacy column ' + k + ' is not written by payroll approvals');
    v[k] = values[k];
  });
  updateRows(TABS.PAYROLL_PERIOD_CATEGORY, [{ row: pcRow._row, values: v }]);
}

function approval_resetValues_() {
  return { STATUS: PERIOD_STATUS.DRAFT, HR_APPROVED_BY: '', HR_APPROVED_AT: '', ACCOUNTS_APPROVED_BY: '',
    ACCOUNTS_APPROVED_AT: '' };
}

function approval_run_(action, period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var isHr = action === 'HR';
  var auditName = isHr ? 'HR_APPROVE' : 'ACCOUNTS_APPROVE';
  var user = approval_userEmail_();
  var pc = approval_pcRow_(period, population);
  var status = String(pc.STATUS || '').trim().toUpperCase();
  var approver = getControl(isHr ? 'HR_APPROVER_EMAIL' : 'ACCOUNTS_APPROVER_EMAIL', '');

  // Fresh sources shared by the readiness re-run and the hash recompute.
  var re = approval_recomputeHash_(period, population);
  var readiness = checkReadiness(period, population, { sources: re.src, calcResultsByPop: (function () {
    var m = {}; m[population] = re.calc.results; return m; })() });
  var d = approvalDecision({ action: action, status: status, userEmail: user, approverEmail: approver,
    readinessRows: readiness.rows, storedHash: pc.DRAFT_HASH, currentHash: re.hash });

  if (d.ok) {
    var vals = { STATUS: d.newStatus };
    vals[isHr ? 'HR_APPROVED_BY' : 'ACCOUNTS_APPROVED_BY'] = user;
    vals[isHr ? 'HR_APPROVED_AT' : 'ACCOUNTS_APPROVED_AT'] = nowIso_();
    approval_writePc_(pc, vals);
    var held = re.calc.held.map(function (h) { return h.EMP_ID; });
    audit(auditName, period, population, { result: 'APPROVED', user: user, status: d.newStatus, hash: re.hash, held: held });
    return { ok: true, status: d.newStatus, reason: d.reason, held: held };
  }
  if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
    if (status === PERIOD_STATUS.HR_APPROVED || status === PERIOD_STATUS.ACCOUNTS_APPROVED) {
      approval_writePc_(pc, approval_resetValues_());
      audit('STATUS_RESET', period, population, { from: status, to: PERIOD_STATUS.DRAFT, reason: d.reason, user: user });
    }
    audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, status: PERIOD_STATUS.DRAFT,
      note: 'recalculate the draft' });
    return { ok: false, status: PERIOD_STATUS.DRAFT, reason: d.reason };
  }
  audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, status: status });
  return { ok: false, status: status, reason: d.reason };
}

function hrApprove(period, population) { return approval_run_('HR', period, population); }

function accountsApprove(period, population) { return approval_run_('ACCOUNTS', period, population); }

/** Owner only. HR_APPROVED / ACCOUNTS_APPROVED -> DRAFT, approval stamps cleared. Never from LOCKED. */
function reopenPeriod(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var user = approval_userEmail_();
  var pc = approval_pcRow_(period, population);
  var status = String(pc.STATUS || '').trim().toUpperCase();
  var d = reopenDecision(status, user, approval_ownerEmail_());
  if (!d.ok) {
    audit('REOPEN', period, population, { result: 'REFUSED', reason: d.reason, user: user, status: status });
    return { ok: false, status: status, reason: d.reason };
  }
  approval_writePc_(pc, approval_resetValues_());
  audit('REOPEN', period, population, { result: 'REOPENED', from: status, to: PERIOD_STATUS.DRAFT, user: user });
  return { ok: true, status: PERIOD_STATUS.DRAFT, reason: d.reason };
}

// ================================================================ approval gates for master data (R11 / R27 / PROCESS_FLOW 1.0)

/**
 * Pure. Which effective pay-structure rows of a population still need the HR stamp for the period.
 * roster = engine roster entries ({EMP_ID, PAYROLL_CATEGORY}); rows = row objects ({_row, ...}); rateBased = the category
 * reads PAYROLL_RATE_PROFILE (RATE_SOURCE) instead of SALARY_STRUCTURE. A SALARY_STRUCTURE row is pending while
 * HR_APPROVED_BY is blank; a rate-profile row while its VERSION_STATE is not an approved state (blank = approved).
 * Returns {population, period, employees, withEffectiveRow, alreadyApproved, toStamp:[{row, empId, effectiveFrom, versionState}],
 * withoutRow:[ids]}.
 */
function salaryApprovalPlan(salaryRows, roster, period, population, rateBased) {
  var pick = rateBased ? engine_pickRate(salaryRows, period) : engine_pickSalary(salaryRows, period);
  var ids = [], seen = {};
  (roster || []).forEach(function (e) {
    var id = engine_id_(e.EMP_ID);
    if (engine_id_(e.PAYROLL_CATEGORY) !== population || seen[id]) return;
    seen[id] = true; ids.push(id);
  });
  var plan = { population: population, period: period, employees: ids.length, withEffectiveRow: 0, alreadyApproved: 0,
    toStamp: [], withoutRow: [] };
  ids.forEach(function (id) {
    var r = pick[id];
    if (!r) { plan.withoutRow.push(id); return; }
    plan.withEffectiveRow++;
    var approved = rateBased ? calc_isRateApproved(r) : engine_id_(r.HR_APPROVED_BY) !== '';
    if (approved) plan.alreadyApproved++;
    else plan.toStamp.push({ row: r._row, empId: id, effectiveFrom: engine_dateLo_(r.EFFECTIVE_FROM), versionState: engine_id_(r.VERSION_STATE) });
  });
  return plan;
}

/** Pure. STATUTORY_CONFIG rows applying to the period that still need Accounts' APPROVED_BY stamp. */
function statutoryApprovalPlan(configRows, period) {
  var best = calc_statutoryWinners_(configRows, period);
  var plan = { period: period, keys: Object.keys(best).length, alreadyApproved: 0, toStamp: [] };
  Object.keys(best).sort().forEach(function (k) {
    if (best[k].approved) plan.alreadyApproved++;
    else plan.toStamp.push({ row: best[k].row._row, key: k });
  });
  return plan;
}

function approval_requireStampColumns_(tab, cols) {
  var headers = getHeaders(resolveSheet_(tab));
  var missing = cols.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) throw new Error(tab + ' lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup)');
}

/** Tab that holds the pay structure of an active category (RATE_SOURCE) and whether it is the rate-profile kind. */
function approval_payTab_(population) {
  var e = categoryEntry(population);
  if (!e || !e.active) throw new Error('Unknown population "' + population + '"');
  return e.rateSource === 'RATE_PROFILE' ? { tab: TABS.PAYROLL_RATE_PROFILE, rateBased: true }
    : { tab: TABS.SALARY_STRUCTURE, rateBased: false };
}

/** Read-only counts and the list of pending rows (empId, effective from) for the HR confirmation dialog. */
function planSalaryStructureApproval(period, population) {
  guardPeriod_(period);
  var pt = approval_payTab_(population);
  var roster = engine_rosterFromMaster(readObjects(TABS.EMPLOYEE_MASTER), period);
  var plan = salaryApprovalPlan(readObjects(pt.tab), roster.all, period, population, pt.rateBased);
  plan.tab = pt.tab;
  return plan;
}

/**
 * HR approves the pending pay-structure rows effective for the period of one category (active employees only): the
 * SALARY_STRUCTURE row (HR_APPROVED_BY / HR_APPROVED_AT) or the PAYROLL_RATE_PROFILE row (VERSION_STATE APPROVED +
 * HR_APPROVED_BY / HR_APPROVED_AT). Rows added later through the employee dialog (new joiners, revisions) are approved the
 * same way; a revision effective from a later month is approved by running this for that month. Runner must be
 * HR_APPROVER_EMAIL; audited; idempotent. The employee's VALIDATION_STATE PENDING_HR_APPROVAL becomes HR_APPROVED.
 */
function approveSalaryStructure(period, population) {
  var plan = planSalaryStructureApproval(period, population);
  var user = approval_userEmail_();
  var approver = getControl('HR_APPROVER_EMAIL', '');
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(approver) || approval_email_(user) !== approval_email_(approver)) {
    audit('SALARY_APPROVE', period, population, { result: 'REFUSED', reason: 'USER_NOT_HR_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_HR_APPROVER' };
  }
  var rateBased = plan.tab === TABS.PAYROLL_RATE_PROFILE;
  approval_requireStampColumns_(plan.tab, rateBased ? ['VERSION_STATE', 'HR_APPROVED_BY', 'HR_APPROVED_AT'] : ['HR_APPROVED_BY', 'HR_APPROVED_AT']);
  var now = nowIso_();
  updateRows(plan.tab, plan.toStamp.map(function (t) {
    var v = { HR_APPROVED_BY: user, HR_APPROVED_AT: now };
    if (rateBased) v.VERSION_STATE = 'APPROVED';
    else if (t.versionState.toUpperCase() === 'PENDING') v.VERSION_STATE = 'APPROVED';
    return { row: t.row, values: v };
  }));
  approval_signOffMaster_(plan.toStamp.map(function (t) { return t.empId; }), user, now);
  var res = { ok: true, reason: 'OK', period: period, population: population, stamped: plan.toStamp.length,
    alreadyApproved: plan.alreadyApproved, employeesWithoutStructure: plan.withoutRow };
  audit('SALARY_APPROVE', period, population, { result: 'APPROVED', user: user, stamped: res.stamped,
    alreadyApproved: res.alreadyApproved, withoutStructure: plan.withoutRow.length,
    empIds: plan.toStamp.map(function (t) { return t.empId; }) });
  return res;
}

/** EMPLOYEE_MASTER.VALIDATION_STATE PENDING_HR_APPROVAL -> HR_APPROVED (+ HR_SIGNOFF_BY / _AT when the columns exist). */
function approval_signOffMaster_(empIds, user, now) {
  if (!empIds.length || !getSheet(TABS.EMPLOYEE_MASTER)) return;
  var want = {};
  empIds.forEach(function (id) { want[id] = true; });
  var headers = getHeaders(resolveSheet_(TABS.EMPLOYEE_MASTER));
  if (headers.indexOf('VALIDATION_STATE') < 0) return;
  var ups = [];
  readObjects(TABS.EMPLOYEE_MASTER).forEach(function (r) {
    if (!want[engine_id_(r.EMP_ID)] || engine_id_(r.VALIDATION_STATE).toUpperCase() !== 'PENDING_HR_APPROVAL') return;
    var v = { VALIDATION_STATE: 'HR_APPROVED' };
    if (headers.indexOf('HR_SIGNOFF_BY') >= 0) v.HR_SIGNOFF_BY = user;
    if (headers.indexOf('HR_SIGNOFF_AT') >= 0) v.HR_SIGNOFF_AT = now;
    ups.push({ row: r._row, values: v });
  });
  updateRows(TABS.EMPLOYEE_MASTER, ups);
}

/** Read-only counts for the Accounts confirmation dialog. */
function planStatutoryApproval(period) {
  guardPeriod_(period);
  return statutoryApprovalPlan(readObjects(TABS.STATUTORY_CONFIG), period);
}

/**
 * Accounts approves the STATUTORY_CONFIG rows that apply to the period. Runner must be ACCOUNTS_APPROVER_EMAIL.
 * Stamps APPROVED_BY / APPROVED_AT on rows that are still blank; audited. No statutory value is used before this.
 */
function approveStatutoryConfig(period) {
  var plan = planStatutoryApproval(period);
  var user = approval_userEmail_();
  var approver = getControl('ACCOUNTS_APPROVER_EMAIL', '');
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(approver) || approval_email_(user) !== approval_email_(approver)) {
    audit('STATUTORY_APPROVE', period, '', { result: 'REFUSED', reason: 'USER_NOT_ACCOUNTS_APPROVER', user: user });
    return { ok: false, reason: 'USER_NOT_ACCOUNTS_APPROVER' };
  }
  approval_requireStampColumns_(TABS.STATUTORY_CONFIG, ['APPROVED_BY', 'APPROVED_AT']);
  var now = nowIso_();
  updateRows(TABS.STATUTORY_CONFIG, plan.toStamp.map(function (t) {
    return { row: t.row, values: { APPROVED_BY: user, APPROVED_AT: now } };
  }));
  var res = { ok: true, reason: 'OK', period: period, stamped: plan.toStamp.length, alreadyApproved: plan.alreadyApproved };
  audit('STATUTORY_APPROVE', period, '', { result: 'APPROVED', user: user, stamped: res.stamped,
    alreadyApproved: res.alreadyApproved, keys: plan.toStamp.map(function (t) { return t.key; }) });
  return res;
}

// ================================================================ category config sign-off (owner)

/** Pure. Rows of PAYROLL_CATEGORY_CONFIG that still need the owner's stamp, and configuration problems that refuse it. */
function categoryApprovalPlan(configRows) {
  var plan = { rows: 0, alreadyApproved: 0, toStamp: [], problems: [] };
  var seen = {};
  (configRows || []).forEach(function (r) {
    var e = categoryEntryFromRow(r);
    if (!e) return;
    plan.rows++;
    if (seen[e.code]) { plan.problems.push(e.code + ': duplicate CATEGORY_CODE'); return; }
    seen[e.code] = true;
    categoryEntryProblems(e).forEach(function (p) { plan.problems.push(p); });
    if (e.approvedBy) plan.alreadyApproved++; else plan.toStamp.push({ row: r._row, code: e.code });
  });
  return plan;
}

/** Read-only counts for the owner's confirmation dialog. */
function planCategoryApproval() {
  return categoryApprovalPlan(getSheet(TABS.PAYROLL_CATEGORY_CONFIG) ? readObjects(TABS.PAYROLL_CATEGORY_CONFIG) : []);
}

/**
 * The owner signs off PAYROLL_CATEGORY_CONFIG: stamps APPROVED_BY / APPROVED_AT on the rows still blank. Runner must be
 * OWNER_APPROVER_EMAIL. Refused while a row is misconfigured (unknown CALC_METHOD / SITE / RATE_SOURCE, PAYSLIP=Y without a
 * template key). Until a category row is approved its population is BLOCKED in readiness (CATEGORY_CONFIG).
 */
function approveCategoryConfig() {
  var plan = planCategoryApproval();
  var user = approval_userEmail_();
  var owner = getOwnerApproverEmail();
  if (!approval_email_(user)) return { ok: false, reason: 'USER_EMAIL_UNKNOWN' };
  if (!approval_email_(owner) || approval_email_(user) !== approval_email_(owner)) {
    audit('CATEGORY_APPROVE', '', '', { result: 'REFUSED', reason: 'USER_NOT_OWNER', user: user });
    return { ok: false, reason: 'USER_NOT_OWNER' };
  }
  if (plan.problems.length) {
    audit('CATEGORY_APPROVE', '', '', { result: 'REFUSED', reason: 'CONFIG_PROBLEMS', problems: plan.problems });
    return { ok: false, reason: 'CONFIG_PROBLEMS', problems: plan.problems };
  }
  approval_requireStampColumns_(TABS.PAYROLL_CATEGORY_CONFIG, ['APPROVED_BY', 'APPROVED_AT']);
  var now = nowIso_();
  updateRows(TABS.PAYROLL_CATEGORY_CONFIG, plan.toStamp.map(function (t) {
    return { row: t.row, values: { APPROVED_BY: user, APPROVED_AT: now } };
  }));
  categoryConfigReset_();
  var res = { ok: true, reason: 'OK', stamped: plan.toStamp.length, alreadyApproved: plan.alreadyApproved };
  audit('CATEGORY_APPROVE', '', '', { result: 'APPROVED', user: user, stamped: res.stamped,
    categories: plan.toStamp.map(function (t) { return t.code; }) });
  return res;
}
