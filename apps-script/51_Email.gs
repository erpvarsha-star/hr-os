/**
 * 51_Email.gs - Stage 8: payslip email queue and gated sending.
 * Sending needs EMAIL_RELEASE_ENABLED=TRUE, EMAIL_RELEASE_<period>=TRUE and runner = ACCOUNTS_APPROVER_EMAIL.
 */
var EMAIL_QUOTA_RESERVE = 5;

function emailValid_(s) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s == null ? '' : s).trim()); }

function emailIsTrue_(v) { return v === true || (typeof v === 'string' && v.trim() === 'TRUE'); }

/** Pure gate. Returns {allowed, reasons[]}. */
function emailReleaseAllowed(controlMap, period, userEmail, accountsEmail) {
  var c = controlMap || {}, reasons = [];
  if (!emailIsTrue_(c.EMAIL_RELEASE_ENABLED)) reasons.push('EMAIL_RELEASE_ENABLED is not TRUE');
  if (!emailIsTrue_(c['EMAIL_RELEASE_' + period])) reasons.push('EMAIL_RELEASE_' + period + ' is not TRUE');
  var u = String(userEmail || '').trim().toLowerCase(), a = String(accountsEmail || '').trim().toLowerCase();
  if (!u || !a || u !== a) reasons.push('runner is not ACCOUNTS_APPROVER_EMAIL');
  return { allowed: reasons.length === 0, reasons: reasons };
}

/**
 * Pure. GENERATED register rows for lockId -> PAYSLIP_EMAIL_LOG rows to append (QUEUED, or SKIPPED for
 * blank/invalid email). Idempotent: an EMP_ID already in the log for lockId is skipped, except a previously
 * SKIPPED one whose email is now valid.
 */
function buildEmailQueue(registerRows, master, existingLog, lockId) {
  var emails = {};
  (master || []).forEach(function (m) { var id = String(m.EMP_ID).trim(); if (!(id in emails)) emails[id] = m.EMAIL_ID; });
  var logged = {};
  (existingLog || []).forEach(function (l) {
    if (String(l.LOCK_ID) !== lockId) return;
    var id = String(l.EMP_ID), st = String(l.STATUS);
    if (st !== 'SKIPPED') logged[id] = 'ACTIVE';
    else if (!logged[id]) logged[id] = 'SKIPPED';
  });
  var seen = {}, out = [];
  (registerRows || []).forEach(function (r) {
    if (String(r.LOCK_ID) !== lockId || String(r.STATUS) !== 'GENERATED') return;
    var id = String(r.EMP_ID);
    if (seen[id]) return;
    seen[id] = true;
    var to = String(emails[id] == null ? '' : emails[id]).trim();
    var valid = emailValid_(to);
    if (logged[id] === 'ACTIVE') return;
    if (logged[id] === 'SKIPPED' && !valid) return;
    out.push({ LOCK_ID: lockId, PERIOD: r.PERIOD, EMP_ID: id, TO_EMAIL: to, PDF_ID: r.PDF_ID,
      STATUS: valid ? 'QUEUED' : 'SKIPPED', ATTEMPTED_AT: '', ERROR: valid ? '' : 'blank or invalid EMAIL_ID' });
  });
  return out;
}

function emailSubject(period) { return 'Payslip – ' + payslipPeriodLabel(period) + ' – Varsha Forgings'; }

function emailBody_(period) {
  return 'Dear Employee,\n\nPlease find attached your payslip for ' + payslipPeriodLabel(period) +
    '.\n\nThis is a system-generated email from Varsha Forgings Pvt Ltd. For any query, contact HR.\n\nRegards,\nVarsha Forgings';
}

/** LOCKED status + the LOCK_ID to work on: the given one (a supplementary lock) or the population's main LOCK_ID. */
function email_lockOf_(period, population, lockId) {
  var st = payslipLockId_(period, population);
  var use = String(lockId || st.lockId || '').trim();
  return { status: st.status, lockId: use };
}

function queuePayslipEmailsOne_(period, population, lockId) {
  guardPeriod_(period);
  if (payslipPopulations().indexOf(population) < 0) throw new Error('Payslip emails are only for ' + payslipPopulations().join(' and '));
  var st = email_lockOf_(period, population, lockId);
  if (st.status !== PERIOD_STATUS.LOCKED) throw new Error(period + ' x ' + population + ' is not LOCKED - queue refused');
  if (!st.lockId) throw new Error('No LOCK_ID for ' + period + ' x ' + population);
  var register = readObjects(TABS.PAYSLIP_REGISTER).filter(function (r) { return String(r.POPULATION) === population; });
  var rows = buildEmailQueue(register, readObjects(TABS.EMPLOYEE_MASTER), readObjects(TABS.PAYSLIP_EMAIL_LOG), st.lockId);
  appendObjects(TABS.PAYSLIP_EMAIL_LOG, rows);
  var summary = { period: period, population: population, lockId: st.lockId,
    queued: rows.filter(function (r) { return r.STATUS === 'QUEUED'; }).length,
    skipped: rows.filter(function (r) { return r.STATUS === 'SKIPPED'; }).length };
  audit('PAYSLIP_EMAILS_QUEUED', period, population, summary);
  return summary;
}

function sendQueuedEmailsOne_(period, population, lockId) {
  guardPeriod_(period);
  if (payslipPopulations().indexOf(population) < 0) throw new Error('Payslip emails are only for ' + payslipPopulations().join(' and '));
  var control = readControlMap();
  var gate = emailReleaseAllowed(control, period, auditUser_(), control.ACCOUNTS_APPROVER_EMAIL);
  if (!gate.allowed) {
    audit('PAYSLIP_EMAIL_REFUSED', period, population, gate.reasons);
    throw new Error('Email release refused: ' + gate.reasons.join('; '));
  }
  var st = email_lockOf_(period, population, lockId);
  if (st.status !== PERIOD_STATUS.LOCKED || !st.lockId) throw new Error(period + ' x ' + population + ' is not LOCKED - send refused');
  var inPop = {};
  readObjects(TABS.PAYSLIP_REGISTER).forEach(function (r) {
    if (String(r.LOCK_ID) === st.lockId && String(r.POPULATION) === population) inPop[String(r.EMP_ID)] = true;
  });
  var queued = readObjects(TABS.PAYSLIP_EMAIL_LOG).filter(function (l) {
    return String(l.LOCK_ID) === st.lockId && String(l.STATUS) === 'QUEUED' && inPop[String(l.EMP_ID)];
  });
  var sent = 0, failed = 0, stoppedForQuota = false;
  for (var i = 0; i < queued.length; i++) {
    var l = queued[i];
    if (MailApp.getRemainingDailyQuota() <= EMAIL_QUOTA_RESERVE) { stoppedForQuota = true; break; }
    var upd;
    try {
      var blob = DriveApp.getFileById(String(l.PDF_ID)).getBlob();
      MailApp.sendEmail({ to: String(l.TO_EMAIL), subject: emailSubject(period), body: emailBody_(period),
        attachments: [blob], name: 'Varsha Forgings HR' });
      upd = { STATUS: 'SENT', ATTEMPTED_AT: nowIso_(), ERROR: '' };
      sent++;
    } catch (e) {
      upd = { STATUS: 'FAILED', ATTEMPTED_AT: nowIso_(), ERROR: String(e && e.message ? e.message : e) };
      failed++;
    }
    updateRows(TABS.PAYSLIP_EMAIL_LOG, [{ row: l._row, values: upd }]);
  }
  var summary = { period: period, population: population, lockId: st.lockId, sent: sent, failed: failed,
    remainingQueued: queued.length - sent - failed, stoppedForQuota: stoppedForQuota };
  audit('PAYSLIP_EMAILS_SENT', period, population, summary);
  return summary;
}

/** Menu passes only the period: with no population, handle each payslip population (errors reported per population). */
function emailEachPopulation_(fn, period, population, lockId) {
  if (population) return fn(period, population, lockId);
  var out = {};
  payslipPopulations().forEach(function (p) {
    try { out[p] = fn(period, p); } catch (e) { out[p] = { refused: String(e && e.message ? e.message : e) }; }
  });
  return out;
}

/** lockId (optional, needs a population): a supplementary (top-up) LOCK_ID instead of the population's main one. */
function queuePayslipEmails(period, population, lockId) { return emailEachPopulation_(queuePayslipEmailsOne_, period, population, lockId); }
function sendQueuedEmails(period, population, lockId) { return emailEachPopulation_(sendQueuedEmailsOne_, period, population, lockId); }
