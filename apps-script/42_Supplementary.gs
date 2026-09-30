/**
 * 42_Supplementary.gs - supplementary (top-up) run for employees that were HELD in a locked run.
 *
 * After a period x population is LOCKED, employees that were held (FLAGS HOLD in the locked run's draft) and are not in
 * PAYROLL_LOCKED can still be fixed (register, attendance approval, feeds, salary approval, ...). "Run top-up for released
 * employees" recalculates the population, takes ONLY those held EMP_IDs that no longer have any HOLD issue, writes their rows
 * to PAYROLL_DRAFT with RUN_ID SUPP-<period>-<population>-<timestamp> (RUN type SUPPLEMENTARY) and records the set in
 * PAYROLL_SUPPLEMENTARY (SUPP_ID, EMP_IDS, HASH, STATUS, HR_*, ACCOUNTS_*, LOCK_ID). HR then Accounts approve that set (its
 * own hash: any change of the inputs resets it to DRAFT), then Accounts / owner lock it under a NEW LOCK_ID into
 * PAYROLL_LOCKED. An EMP_ID already locked for the period x population is never locked again. Payslips and emails work per
 * LOCK_ID (generatePayslips(period, population, lockId)).
 */
var SUPP_OPEN_STATUSES = ['DRAFT', 'HR_APPROVED', 'ACCOUNTS_APPROVED'];

// ---------------------------------------------------------------- pure

function supp_id_(v) { return String(v == null ? '' : v).trim(); }

function suppIdFor(period, population, date) {
  return ENGINE_SUPP_PREFIX + period + '-' + population + '-' + Utilities.formatDate(date || new Date(), HROS_TZ, 'yyyyMMddHHmmss');
}

/** LOCK_ID of a supplementary lock: the normal pattern plus -SUPP (-SUPP2 ... when the id is taken). */
function suppLockIdFor(period, population, date, takenIds) {
  var base = lockIdFor(period, population, date) + '-SUPP', id = base, n = 1;
  var taken = {};
  (takenIds || []).forEach(function (t) { taken[supp_id_(t)] = true; });
  while (taken[id]) { n++; id = base + n; }
  return id;
}

/**
 * Employees that were held in the locked run and are not locked yet: draftRows = PAYROLL_DRAFT rows, lockedRows =
 * PAYROLL_LOCKED rows (any period / population; filtered here). Supplementary draft rows are ignored.
 */
function suppCandidates(draftRows, lockedRows, period, population) {
  var locked = {};
  (lockedRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) === period && supp_id_(r.POPULATION) === population) locked[supp_id_(r.EMP_ID)] = true;
  });
  var out = [], seen = {};
  (draftRows || []).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) !== period || supp_id_(r.POPULATION) !== population) return;
    if (engine_runType_(r.RUN_ID) !== 'NORMAL' || !engine_isHeldRow_(r)) return;
    var id = supp_id_(r.EMP_ID);
    if (!id || locked[id] || seen[id]) return;
    seen[id] = true; out.push(id);
  });
  return out.sort();
}

/**
 * Splits the candidates by the fresh calculation: released = still on the roster, no HOLD and no blocker (a numeric
 * NET_PAY); stillHeld = with their HOLD codes. results = engine_calcPopulation(...).results.
 */
function suppPartition(candidates, results) {
  var by = {};
  (results || []).forEach(function (res) { by[supp_id_((res.row || {}).EMP_ID)] = res; });
  var released = [], stillHeld = [];
  (candidates || []).forEach(function (id) {
    var res = by[id];
    if (!res) { stillHeld.push({ empId: id, codes: ['NOT_ON_ROSTER'] }); return; }
    var codes = (res.exceptions || []).filter(function (e) { return e.severity === 'HOLD' || e.severity === 'BLOCKER'; })
      .map(function (e) { return e.code; });
    var net = res.row ? res.row.NET_PAY : null;
    if (res.held || codes.length || typeof net !== 'number') stillHeld.push({ empId: id, codes: codes.length ? codes : ['NO_NET_PAY'] });
    else released.push(id);
  });
  return { released: released, stillHeld: stillHeld };
}

/** The payable rows of a calculation for the given EMP_IDs (the rows the supplementary hash and lock are made of). */
function suppRowsFor(calcRows, empIds) {
  var want = {};
  (empIds || []).forEach(function (id) { want[supp_id_(id)] = true; });
  return engine_payableRows_(calcRows).filter(function (r) { return want[supp_id_(r.EMP_ID)]; });
}

function suppEmpList_(text) {
  return String(text == null ? '' : text).split(',').map(supp_id_).filter(function (x) { return x; });
}

// ---------------------------------------------------------------- sheet-touching

function supp_requireSheet_() {
  var sheet = getSheet(TABS.PAYROLL_SUPPLEMENTARY);
  if (!sheet) throw new Error('Tab PAYROLL_SUPPLEMENTARY is missing (run HR OS > Setup > Run setup)');
  var headers = getHeaders(sheet);
  var missing = HROS_SUPPLEMENTARY_HEADERS.filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) throw new Error('PAYROLL_SUPPLEMENTARY lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup)');
  return sheet;
}

/** The non-locked, non-superseded supplementary set of a period x population (the latest one), or null. */
function supp_openSet_(period, population) {
  var rows = readObjects(TABS.PAYROLL_SUPPLEMENTARY).filter(function (r) {
    return normalizePeriod(r.PERIOD) === period && supp_id_(r.POPULATION) === population &&
      SUPP_OPEN_STATUSES.indexOf(supp_id_(r.STATUS).toUpperCase()) >= 0;
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function supp_draftRowsOf_(suppId) {
  return readObjects(TABS.PAYROLL_DRAFT).filter(function (r) { return supp_id_(r.RUN_ID) === suppId; });
}

function supp_resetValues_() {
  return { STATUS: 'DRAFT', HR_APPROVED_BY: '', HR_APPROVED_AT: '', ACCOUNTS_APPROVED_BY: '', ACCOUNTS_APPROVED_AT: '' };
}

/**
 * Menu "Payroll > Run top-up for released employees": recalculates a LOCKED period x population and writes the released
 * held employees as a SUPPLEMENTARY draft set (status DRAFT, needs HR then Accounts approval and its own lock). A set
 * that is still open (not locked) is superseded by the new one (approvals cleared).
 */
function supplementaryRun(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  supp_requireSheet_();
  var pc = approval_pcRow_(period, population);
  if (supp_id_(pc.STATUS).toUpperCase() !== PERIOD_STATUS.LOCKED) {
    throw new Error(period + ' x ' + population + ' is ' + (supp_id_(pc.STATUS) || 'not set') + ', not LOCKED - use the normal draft, a top-up is only for a locked run');
  }
  var user = approval_userEmail_();
  var draftRows = readObjects(TABS.PAYROLL_DRAFT);
  var lockedRows = getSheet(TABS.PAYROLL_LOCKED) ? readObjects(TABS.PAYROLL_LOCKED) : [];
  var cands = suppCandidates(draftRows, lockedRows, period, population);
  if (!cands.length) return { ok: false, reason: 'NO_HELD_EMPLOYEES', message: 'No employee was held in the locked run, or all of them are already locked' };
  var src = engine_readSources_(period);
  var now = new Date();
  var suppId = suppIdFor(period, population, now), n = 1;
  var usedIds = {};
  readObjects(TABS.PAYROLL_SUPPLEMENTARY).forEach(function (r) { usedIds[supp_id_(r.SUPP_ID)] = true; });
  var baseId = suppId;
  while (usedIds[suppId]) { n++; suppId = baseId + '-' + n; }
  var calc = engine_calcPopulation(src, population, suppId, nowIso_());
  var part = suppPartition(cands, calc.results);
  if (!part.released.length) {
    audit('SUPP_DRAFT', period, population, { result: 'NOTHING_RELEASED', by: user, stillHeld: part.stillHeld });
    return { ok: false, reason: 'NO_RELEASED_EMPLOYEES', stillHeld: part.stillHeld };
  }
  var rows = suppRowsFor(calc.rows, part.released);
  var hash = hashRows(rows, OUTPUT_COLUMNS, engine_sha256Hex_);
  var superseded = [];
  var old = supp_openSet_(period, population);
  if (old) {
    updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: old._row, values: { STATUS: 'SUPERSEDED' } }]);
    superseded.push(supp_id_(old.SUPP_ID));
  }
  var draft = ensureSheet(TABS.PAYROLL_DRAFT);
  ensureHeaders(draft, OUTPUT_COLUMNS);
  appendObjects(draft, rows.map(function (r) {
    var o = {};
    OUTPUT_COLUMNS.forEach(function (c) { o[c] = r[c] === undefined || r[c] === null ? '' : r[c]; });
    return o;
  }));
  appendObjects(TABS.PAYROLL_SUPPLEMENTARY, [{ PERIOD: period, POPULATION: population, SUPP_ID: suppId, EMP_IDS: part.released.join(','),
    HASH: hash, STATUS: 'DRAFT', CREATED_BY: user, CREATED_AT: nowIso_() }], { textHeaders: ['SUPP_ID', 'EMP_IDS', 'HASH', 'LOCK_ID'] });
  audit('SUPP_DRAFT', period, population, { result: 'DRAFT', suppId: suppId, by: user, empIds: part.released, stillHeld: part.stillHeld,
    superseded: superseded, hash: hash });
  return { ok: true, suppId: suppId, empIds: part.released, stillHeld: part.stillHeld, rows: rows.length, hash: hash,
    superseded: superseded, totalNet: engine_sum_(rows, 'NET_PAY') };
}

/** Recomputes (no writes) the payable rows of the set's EMP_IDs from fresh sources and their hash. */
function supp_recompute_(period, population, empIds) {
  var src = engine_readSources_(period);
  var calc = engine_calcPopulation(src, population, '', nowIso_());
  var rows = suppRowsFor(calc.rows, empIds);
  return { hash: hashRows(rows, OUTPUT_COLUMNS, engine_sha256Hex_), rows: rows, held: calc.held };
}

function supp_alreadyLocked_(period, population, empIds) {
  if (!getSheet(TABS.PAYROLL_LOCKED)) return [];
  var locked = {};
  readObjects(TABS.PAYROLL_LOCKED).forEach(function (r) {
    if (normalizePeriod(r.PERIOD) === period && supp_id_(r.POPULATION) === population) locked[supp_id_(r.EMP_ID)] = true;
  });
  return empIds.filter(function (id) { return locked[id]; });
}

function supp_approve_(action, period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  supp_requireSheet_();
  var isHr = action === 'HR';
  var auditName = isHr ? 'SUPP_HR_APPROVE' : 'SUPP_ACCOUNTS_APPROVE';
  var supp = supp_openSet_(period, population);
  if (!supp) return { ok: false, reason: 'NO_OPEN_SUPPLEMENTARY', message: 'Run the top-up first' };
  var user = approval_userEmail_();
  var status = supp_id_(supp.STATUS).toUpperCase();
  var ids = suppEmpList_(supp.EMP_IDS);
  var locked = supp_alreadyLocked_(period, population, ids);
  if (locked.length) {
    audit(auditName, period, population, { result: 'REFUSED', reason: 'EMP_ALREADY_LOCKED', empIds: locked, suppId: supp.SUPP_ID });
    return { ok: false, status: status, reason: 'EMP_ALREADY_LOCKED', alreadyLocked: locked };
  }
  var re = supp_recompute_(period, population, ids);
  var d = approvalDecision({ action: action, status: status, userEmail: user,
    approverEmail: getControl(isHr ? 'HR_APPROVER_EMAIL' : 'ACCOUNTS_APPROVER_EMAIL', ''), readinessRows: [],
    storedHash: supp.HASH, currentHash: re.hash });
  if (d.ok) {
    var vals = { STATUS: d.newStatus };
    vals[isHr ? 'HR_APPROVED_BY' : 'ACCOUNTS_APPROVED_BY'] = user;
    vals[isHr ? 'HR_APPROVED_AT' : 'ACCOUNTS_APPROVED_AT'] = nowIso_();
    updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: vals }]);
    audit(auditName, period, population, { result: 'APPROVED', user: user, suppId: supp.SUPP_ID, status: d.newStatus, hash: re.hash });
    return { ok: true, status: d.newStatus, suppId: supp_id_(supp.SUPP_ID), reason: 'OK' };
  }
  if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
    if (status !== 'DRAFT') {
      updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: supp_resetValues_() }]);
      audit('SUPP_STATUS_RESET', period, population, { from: status, to: 'DRAFT', reason: d.reason, user: user, suppId: supp.SUPP_ID });
    }
    audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, note: 'run the top-up again' });
    return { ok: false, status: 'DRAFT', reason: d.reason, message: 'Inputs changed since the top-up was calculated: run it again' };
  }
  audit(auditName, period, population, { result: 'REFUSED', reason: d.reason, user: user, status: status });
  return { ok: false, status: status, reason: d.reason };
}

function supplementaryHrApprove(period, population) { return supp_approve_('HR', period, population); }
function supplementaryAccountsApprove(period, population) { return supp_approve_('ACCOUNTS', period, population); }

/**
 * Locks the ACCOUNTS_APPROVED supplementary set under a new LOCK_ID (Accounts approver or owner). The rows go to
 * PAYROLL_LOCKED; an EMP_ID that is already locked for the period x population refuses the lock (EMP_ALREADY_LOCKED).
 */
function supplementaryLock(period, population) {
  guardPeriod_(period);
  if (!isKnownPopulation(population)) throw new Error('Unknown population "' + population + '"');
  supp_requireSheet_();
  var supp = supp_openSet_(period, population);
  if (!supp) return { ok: false, reason: 'NO_OPEN_SUPPLEMENTARY', message: 'Run the top-up first' };
  var user = approval_userEmail_();
  var status = supp_id_(supp.STATUS).toUpperCase();
  var ids = suppEmpList_(supp.EMP_IDS);
  var overlap = supp_alreadyLocked_(period, population, ids);
  var re = supp_recompute_(period, population, ids);
  var sheetRows = supp_draftRowsOf_(supp_id_(supp.SUPP_ID));
  var payable = engine_payableRows_(sheetRows);
  var d = lockDecision({ status: status, userEmail: user, accountsEmail: getControl('ACCOUNTS_APPROVER_EMAIL', ''),
    ownerEmail: approval_ownerEmail_(), storedHash: supp.HASH, currentHash: re.hash,
    draftSheetHash: hashRows(payable, OUTPUT_COLUMNS, engine_sha256Hex_), draftRowCount: payable.length, alreadyLockedEmpIds: overlap });
  if (!d.ok) {
    if (d.reason === 'INPUTS_OR_DRAFT_CHANGED') {
      updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: supp_resetValues_() }]);
      audit('SUPP_STATUS_RESET', period, population, { from: status, to: 'DRAFT', reason: d.reason, user: user, suppId: supp.SUPP_ID });
    }
    audit('SUPP_LOCK', period, population, { result: 'REFUSED', reason: d.reason, user: user, suppId: supp.SUPP_ID, alreadyLocked: overlap });
    return { ok: false, status: d.newStatus, reason: d.reason, alreadyLocked: overlap };
  }
  var sheet = ensureSheet(TABS.PAYROLL_LOCKED);
  ensureHeaders(sheet, ['LOCK_ID'].concat(OUTPUT_COLUMNS));
  var taken = readObjects(sheet).map(function (r) { return r.LOCK_ID; });
  readObjects(TABS.PAYROLL_PERIOD_CATEGORY).forEach(function (r) { taken.push(r.LOCK_ID); });
  var lockId = suppLockIdFor(period, population, new Date(), taken);
  var rows = buildLockRows(payable, lockId, period, population);
  appendObjects(sheet, rows);
  if (!isSheetProtected(sheet)) protectSheet(sheet, 'HR OS PAYROLL_LOCKED (append-only, owner edit)');
  updateRows(TABS.PAYROLL_SUPPLEMENTARY, [{ row: supp._row, values: { STATUS: 'LOCKED', LOCK_ID: lockId, LOCKED_AT: nowIso_() } }],
    { textHeaders: ['LOCK_ID'] });
  audit('SUPP_LOCK', period, population, { result: 'LOCKED', lockId: lockId, suppId: supp.SUPP_ID, rows: rows.length, user: user, hash: re.hash });
  return { ok: true, status: 'LOCKED', lockId: lockId, suppId: supp_id_(supp.SUPP_ID), rows: rows.length, empIds: ids,
    note: 'Generate payslips for this LOCK_ID: HR OS > Payslips > Generate payslips (enter the LOCK_ID)' };
}
