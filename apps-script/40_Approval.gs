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
  return { hash: hashRows(calc.rows, OUTPUT_COLUMNS, engine_sha256Hex_), src: src, calc: calc };
}

function approval_pcRow_(period, population) {
  var rows = readObjects(TABS.PAYROLL_PERIOD_CATEGORY);
  for (var i = 0; i < rows.length; i++) {
    if (normalizePeriod(rows[i].PAYROLL_MONTH) === period && String(rows[i].PAYROLL_CATEGORY).trim() === population) return rows[i];
  }
  throw new Error('No PAYROLL_PERIOD_CATEGORY row for ' + period + ' x ' + population);
}

var APPROVAL_STAMP_COLUMNS = ['HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT'];

/** Update PAYROLL_PERIOD_CATEGORY row; legacy columns (APPROVED_BY/AT) only when present. */
function approval_writePc_(pcRow, values) {
  var headers = getHeaders(resolveSheet_(TABS.PAYROLL_PERIOD_CATEGORY));
  var v = {};
  Object.keys(values).forEach(function (k) {
    if ((k === 'APPROVED_BY' || k === 'APPROVED_AT') && headers.indexOf(k) < 0) return;
    v[k] = values[k];
  });
  updateRows(TABS.PAYROLL_PERIOD_CATEGORY, [{ row: pcRow._row, values: v }]);
}

function approval_resetValues_() {
  return { STATUS: PERIOD_STATUS.DRAFT, HR_APPROVED_BY: '', HR_APPROVED_AT: '', ACCOUNTS_APPROVED_BY: '',
    ACCOUNTS_APPROVED_AT: '', APPROVED_BY: '', APPROVED_AT: '' };
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
    var vals = { STATUS: d.newStatus, APPROVED_BY: user, APPROVED_AT: nowIso_() };
    vals[isHr ? 'HR_APPROVED_BY' : 'ACCOUNTS_APPROVED_BY'] = user;
    vals[isHr ? 'HR_APPROVED_AT' : 'ACCOUNTS_APPROVED_AT'] = nowIso_();
    approval_writePc_(pc, vals);
    audit(auditName, period, population, { result: 'APPROVED', user: user, status: d.newStatus, hash: re.hash });
    return { ok: true, status: d.newStatus, reason: d.reason };
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
