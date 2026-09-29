/**
 * 41_Lock.gs - period x population lock (DESIGN section 7). Copies the draft rows into append-only PAYROLL_LOCKED.
 * Pure: lockIdFor, buildLockRows, lockDecision. Sheet-touching: lockPeriod.
 */

// ---------------------------------------------------------------- pure

function lockIdFor(period, population, date) {
  return 'LOCK-' + period + '-' + population + '-' + Utilities.formatDate(date || new Date(), HROS_TZ, 'yyyyMMddHHmm');
}

/** Draft rows of period x population -> PAYROLL_LOCKED objects (LOCK_ID first, then OUTPUT_COLUMNS). */
function buildLockRows(draftRows, lockId, period, population) {
  return (draftRows || []).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population;
  }).map(function (r) {
    var o = { LOCK_ID: lockId };
    OUTPUT_COLUMNS.forEach(function (c) { o[c] = r[c] === undefined || r[c] === null ? '' : r[c]; });
    return o;
  });
}

/**
 * lockDecision({status, userEmail, accountsEmail, ownerEmail, storedHash, currentHash, draftSheetHash, draftRowCount,
 * existingLockedCount}) -> {ok, newStatus, reason}. A hash mismatch gives newStatus DRAFT (caller resets + audits).
 */
function lockDecision(a) {
  var status = String(a.status == null ? '' : a.status).trim().toUpperCase();
  var user = approval_email_(a.userEmail);
  if (!user) return { ok: false, newStatus: status, reason: 'USER_EMAIL_UNKNOWN' };
  if (status !== PERIOD_STATUS.ACCOUNTS_APPROVED) return { ok: false, newStatus: status, reason: 'STATUS_NOT_ACCOUNTS_APPROVED' };
  if (user !== approval_email_(a.accountsEmail) && user !== approval_email_(a.ownerEmail)) {
    return { ok: false, newStatus: status, reason: 'USER_NOT_ACCOUNTS_APPROVER_OR_OWNER' };
  }
  if (a.existingLockedCount > 0) return { ok: false, newStatus: status, reason: 'ALREADY_IN_PAYROLL_LOCKED' };
  var stored = String(a.storedHash == null ? '' : a.storedHash).trim();
  if (!stored) return { ok: false, newStatus: status, reason: 'NO_DRAFT_HASH' };
  if (String(a.currentHash) !== stored || String(a.draftSheetHash) !== stored) {
    return { ok: false, newStatus: PERIOD_STATUS.DRAFT, reason: 'INPUTS_OR_DRAFT_CHANGED' };
  }
  if (!(a.draftRowCount > 0)) return { ok: false, newStatus: status, reason: 'NO_DRAFT_ROWS' };
  return { ok: true, newStatus: PERIOD_STATUS.LOCKED, reason: 'OK' };
}

// ---------------------------------------------------------------- sheet-touching

function lockPeriod(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  var user = approval_userEmail_();
  var pc = approval_pcRow_(period, population);
  var status = String(pc.STATUS || '').trim().toUpperCase();
  var re = approval_recomputeHash_(period, population);
  var draftRows = readObjects(TABS.PAYROLL_DRAFT).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population;
  });
  var lockedSheet = getSheet(TABS.PAYROLL_LOCKED);
  var existing = lockedSheet ? readObjects(lockedSheet).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && String(r.POPULATION).trim() === population;
  }).length : 0;
  var d = lockDecision({ status: status, userEmail: user, accountsEmail: getControl('ACCOUNTS_APPROVER_EMAIL', ''),
    ownerEmail: approval_ownerEmail_(), storedHash: pc.DRAFT_HASH, currentHash: re.hash,
    draftSheetHash: hashRows(draftRows, OUTPUT_COLUMNS, engine_sha256Hex_), draftRowCount: draftRows.length,
    existingLockedCount: existing });
  if (!d.ok) {
    if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
      approval_writePc_(pc, approval_resetValues_());
      audit('STATUS_RESET', period, population, { from: status, to: PERIOD_STATUS.DRAFT, reason: d.reason, user: user });
    }
    audit('LOCK', period, population, { result: 'REFUSED', reason: d.reason, user: user, status: d.newStatus });
    return { ok: false, status: d.newStatus, reason: d.reason };
  }
  var lockId = lockIdFor(period, population, new Date());
  var sheet = ensureSheet(TABS.PAYROLL_LOCKED);
  ensureHeaders(sheet, ['LOCK_ID'].concat(OUTPUT_COLUMNS));
  var rows = buildLockRows(draftRows, lockId, period, population);
  appendObjects(sheet, rows);
  if (!isSheetProtected(sheet)) protectSheet(sheet, 'HR OS PAYROLL_LOCKED (append-only, owner edit)');
  approval_writePc_(pc, { STATUS: PERIOD_STATUS.LOCKED, LOCKED_AT: nowIso_(), LOCK_ID: lockId });
  audit('LOCK', period, population, { result: 'LOCKED', lockId: lockId, rows: rows.length, user: user, hash: re.hash });
  return { ok: true, status: PERIOD_STATUS.LOCKED, reason: 'OK', lockId: lockId, rows: rows.length };
}
