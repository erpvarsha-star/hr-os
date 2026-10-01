/**
 * 22_Advance.gs - advance/loan ledger (ADVANCE_LEDGER) and society carry-forward (owner decisions 1 and 2).
 *
 * Advance: Accounts' "VFPL Advance\Loan Form" records only a NEW loan (opening amount + instalment); HR OS tracks
 * the running OUTSTANDING_BALANCE_INR itself and stops recovering once it reaches zero. advanceGenerateRecoveries
 * only PROPOSES a PENDING INPUT_ADVANCE row per period (still needs normal approval); the ledger balance is only
 * decremented once that row is used by a LOCKED payroll run (hook from 41_Lock.gs, wrapped so it can never fail the lock).
 *
 * Society: the same per-employee EMI repeats every month until changed, so societyGenerateCarryforward copies the
 * latest APPROVED INPUT_SOCIETY row of the previous period into a new PENDING row of the current period.
 *
 * Both generators skip a row that is already APPROVED, and skip a row that looks hand-edited: they only touch a row
 * whose REMARKS still exactly equals the marker they themselves last wrote (ADVANCE_AUTO_MARKER / SOCIETY_AUTO_MARKER).
 */
var ADVANCE_FORM_SOURCE_TAB_KEY = 'ADVANCE_FORM_SOURCE_TAB';
var ADVANCE_FORM_SOURCE_TAB_DEFAULT = 'Advance Loan Form Responses';
var ADVANCE_AUTO_MARKER = 'AUTO_RECOVERY';
var SOCIETY_AUTO_MARKER = 'AUTO_CARRYFORWARD';

/**
 * Tolerant column mapping for the Advance/Loan Google Form (actual headers not seen; accepts the common variants).
 * Only EMP_ID and the loan amount are required; a missing instalment defaults to the full opening amount (closes in
 * one recovery).
 */
var FEEDS_ADVANCE_LOAN_COLS = [
  { key: 'Timestamp', names: ['timestamp'] },
  { key: 'EMP_ID', names: ['empid', 'employeecode', 'employeeid'], required: true },
  { key: 'Loan Amount', names: ['loanamount', 'advanceamount', 'amount', 'openingamount'], required: true },
  { key: 'Monthly Instalment', names: ['monthlyinstalment', 'emi', 'monthlyemi', 'instalment', 'installment'] },
  { key: 'Loan Date', names: ['loandate', 'date', 'advancedate'] },
  { key: 'Reason', names: ['reason', 'purpose'] }
];

// ================================================================ small pure helpers (reuse feeds_* from 20_Feeds.gs)

/** Name of the local Advance/Loan form-response tab currently in use (PAYROLL_CONTROL ADVANCE_FORM_SOURCE_TAB), or '' when absent. */
function advance_sourceTabName_() {
  try {
    var want = String(getControl(ADVANCE_FORM_SOURCE_TAB_KEY, '')).trim() || ADVANCE_FORM_SOURCE_TAB_DEFAULT;
    return getSheet(want) ? want : '';
  } catch (e) { return ''; }
}

function advance_openEmpSet_(ledgerRows) {
  var out = {};
  (ledgerRows || []).forEach(function (r) { if (feeds_str_(r.STATUS).toUpperCase() === 'OPEN') out[feeds_empId_(r.EMP_ID)] = true; });
  return out;
}

function advance_activeLedger_(ledgerRows) {
  return (ledgerRows || []).filter(function (r) { return feeds_str_(r.STATUS).toUpperCase() === 'OPEN'; });
}

function advance_groupByEmp_(rows) {
  var map = {};
  (rows || []).forEach(function (r) { var id = feeds_empId_(r.EMP_ID); (map[id] = map[id] || []).push(r); });
  return map;
}

/** Next 1-based loan sequence for an employee from the CURRENT ledger (count of rows already on file + 1). */
function advance_nextSeq_(empId, ledgerRows) {
  var n = 0;
  (ledgerRows || []).forEach(function (r) { if (feeds_empId_(r.EMP_ID) === empId) n++; });
  return n + 1;
}

function advance_loanId_(empId, seq) { return 'ADV-' + empId + '-' + seq; }

// ================================================================ pure: form ingestion mapping

/**
 * Pure. Advance/Loan form responses -> new ADVANCE_LEDGER row objects (no LOAN_ID yet; the caller assigns it so the
 * sequence reflects the real ledger). existingRefs = {SOURCE_REF: true} already imported (never duplicated).
 * @returns {{valid:Array, skipped:Array, missingColumns:Array}}
 */
function mapAdvanceLoanRows(headerRow, rows, existingRefs, opts) {
  opts = opts || {};
  var firstRow = opts.firstRow || 2;
  var label = opts.sourceLabel || 'ADVANCE_LOAN_FORM';
  var idx = feeds_headerIndex_(headerRow);
  var c = {
    emp: feeds_col_(idx, ['empid', 'employeecode', 'employeeid']),
    amount: feeds_col_(idx, ['loanamount', 'advanceamount', 'amount', 'openingamount'], ['amount']),
    inst: feeds_col_(idx, ['monthlyinstalment', 'emi', 'monthlyemi', 'instalment', 'installment'], ['instalment', 'installment', 'emi']),
    date: feeds_col_(idx, ['loandate', 'date', 'advancedate']),
    reason: feeds_col_(idx, ['reason', 'purpose'])
  };
  var out = { valid: [], skipped: [], missingColumns: [] };
  if (c.emp < 0) out.missingColumns.push('emp');
  if (c.amount < 0) out.missingColumns.push('amount');
  if (out.missingColumns.length) return out;
  var have = feeds_keySet_(existingRefs);
  (rows || []).forEach(function (row, i) {
    var ref = label + '!' + (firstRow + i);
    if (have[ref]) return;
    var empId = feeds_empId_(feeds_cell_(row, c.emp));
    var amount = feeds_num_(feeds_cell_(row, c.amount));
    if (!empId || isNaN(amount) || amount <= 0) {
      out.skipped.push({ row: firstRow + i, reason: !empId ? 'MISSING_EMP_ID' : 'AMOUNT_INVALID' });
      return;
    }
    var inst = feeds_num_(feeds_cell_(row, c.inst));
    if (isNaN(inst) || inst <= 0) inst = amount;
    out.valid.push({ EMP_ID: empId, OPENING_AMOUNT_INR: amount, MONTHLY_INSTALMENT_INR: inst,
      OPENING_DATE: feeds_parseDate_(feeds_cell_(row, c.date)) || '', SOURCE: 'FORM', SOURCE_REF: ref,
      OUTSTANDING_BALANCE_INR: amount, STATUS: 'OPEN', CLOSED_AT: '', NOTE: feeds_str_(feeds_cell_(row, c.reason)) });
  });
  return out;
}

// ================================================================ sheet-touching: form sync

/** Re-reads the whole Advance/Loan source tab and appends any ADVANCE_LEDGER rows missing (matched by SOURCE_REF; never duplicated). */
function syncAdvanceLoans() {
  var tab = advance_sourceTabName_();
  if (!tab) {
    var skipped = { written: 0, skipped: 0, message: 'Advance loan source tab not found (PAYROLL_CONTROL ' + ADVANCE_FORM_SOURCE_TAB_KEY + ')' };
    audit('ADVANCE_SYNC_SKIPPED', '', '', skipped.message);
    return skipped;
  }
  var sheet = getSheet(tab);
  var block = feeds_readColumns_(sheet, FEEDS_ADVANCE_LOAN_COLS);
  var ledgerRows = readObjects(TABS.ADVANCE_LEDGER);
  var existingRefs = {};
  ledgerRows.forEach(function (r) { var ref = feeds_str_(r.SOURCE_REF); if (ref) existingRefs[ref] = true; });
  var mapped = mapAdvanceLoanRows(block.header, block.rows, existingRefs, { firstRow: 2, sourceLabel: tab });
  if (mapped.missingColumns.length) throw new Error('Advance loan source "' + tab + '" is missing required column(s): ' + mapped.missingColumns.join(', '));
  var seqByEmp = {};
  var toWrite = mapped.valid.map(function (v) {
    var seq = seqByEmp[v.EMP_ID] || advance_nextSeq_(v.EMP_ID, ledgerRows);
    seqByEmp[v.EMP_ID] = seq + 1;
    v.LOAN_ID = advance_loanId_(v.EMP_ID, seq);
    return v;
  });
  if (toWrite.length) appendObjects(TABS.ADVANCE_LEDGER, toWrite, { textHeaders: ['LOAN_ID'] });
  var summary = { tab: tab, written: toWrite.length, skipped: mapped.skipped.length };
  audit('ADVANCE_SYNC', '', '', summary);
  return summary;
}

// ================================================================ one-time opening-balance import

/** Pure. Validates/normalizes one import row ({empId, outstanding, monthlyInstalment, note}). */
function advance_validateImportRow_(r) {
  r = r || {};
  var errors = [];
  var empId = feeds_empId_(r.empId);
  if (!empId) errors.push('EMP_ID is required');
  var outstanding = feeds_num_(r.outstanding);
  if (isNaN(outstanding) || outstanding < 0) errors.push('outstanding amount must be a non-negative number');
  var hasInst = !(r.monthlyInstalment === '' || r.monthlyInstalment == null);
  var instalment = hasInst ? feeds_num_(r.monthlyInstalment) : outstanding;
  if (isNaN(instalment) || instalment <= 0) errors.push('monthly instalment must be a positive number');
  return { empId: empId, outstanding: isNaN(outstanding) ? 0 : outstanding, instalment: isNaN(instalment) ? 0 : instalment,
    note: feeds_str_(r.note), errors: errors };
}

/**
 * Pure. rows = [{empId, outstanding, monthlyInstalment, note}]. existingOpenEmpIds = {EMP_ID: true} (an EMP_ID with
 * an OPEN ledger row already). Refuses (ok:false, toAppend:[]) on ANY error unless opts.force - avoids double-counting
 * a loan that is already on the ledger.
 * @returns {{ok:boolean, errors:Array, toAppend:Array}}
 */
function planAdvanceImport(rows, existingOpenEmpIds, opts) {
  opts = opts || {};
  var force = !!opts.force;
  var existing = existingOpenEmpIds || {};
  var result = { ok: true, errors: [], toAppend: [] };
  var seenInBatch = {};
  (rows || []).forEach(function (raw, i) {
    var v = advance_validateImportRow_(raw);
    if (v.errors.length) { result.errors.push({ line: i + 1, empId: v.empId, reason: v.errors.join('; ') }); return; }
    if (!force && existing[v.empId]) { result.errors.push({ line: i + 1, empId: v.empId, reason: 'already has an OPEN advance loan (pass force to import anyway)' }); return; }
    if (!force && seenInBatch[v.empId]) { result.errors.push({ line: i + 1, empId: v.empId, reason: 'duplicate EMP_ID in this import' }); return; }
    seenInBatch[v.empId] = true;
    result.toAppend.push(v);
  });
  if (result.errors.length) { result.ok = false; result.toAppend = []; }
  return result;
}

/**
 * One-time opening-balance import -> appends ADVANCE_LEDGER rows (SOURCE=ONE_TIME_IMPORT). Refuses (writes nothing)
 * if any row is invalid, or an EMP_ID already has an OPEN ledger row, unless opts.force.
 */
function advanceImportOpeningBalances(rows, opts) {
  opts = opts || {};
  var ledgerRows = readObjects(TABS.ADVANCE_LEDGER);
  var plan = planAdvanceImport(rows, advance_openEmpSet_(ledgerRows), opts);
  if (!plan.ok) { audit('ADVANCE_IMPORT_REFUSED', '', '', { errors: plan.errors }); return plan; }
  var now = nowIso_();
  var seqByEmp = {};
  var toWrite = plan.toAppend.map(function (v) {
    var seq = seqByEmp[v.empId] || advance_nextSeq_(v.empId, ledgerRows);
    seqByEmp[v.empId] = seq + 1;
    return { EMP_ID: v.empId, LOAN_ID: advance_loanId_(v.empId, seq), OPENING_AMOUNT_INR: v.outstanding,
      MONTHLY_INSTALMENT_INR: v.instalment, OPENING_DATE: now.slice(0, 10), SOURCE: 'ONE_TIME_IMPORT', SOURCE_REF: '',
      OUTSTANDING_BALANCE_INR: v.outstanding, STATUS: 'OPEN', CLOSED_AT: '', NOTE: v.note };
  });
  if (toWrite.length) appendObjects(TABS.ADVANCE_LEDGER, toWrite, { textHeaders: ['LOAN_ID'] });
  var res = { ok: true, errors: [], written: toWrite.length, rows: toWrite };
  audit('ADVANCE_IMPORT', '', '', { written: toWrite.length, empIds: toWrite.map(function (r) { return r.EMP_ID; }) });
  return res;
}

/** Pure. Paste text "EMP_ID, outstanding[, instalment]" per line -> {rows:[{empId,outstanding,monthlyInstalment,note}], errors}. */
function advance_parseImportText(text) {
  var lines = String(text == null ? '' : text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });
  var rows = [], errors = [];
  lines.forEach(function (line, i) {
    var parts = line.split(/[,\t]+/).map(function (p) { return p.trim(); });
    if (parts.length < 2) { errors.push('line ' + (i + 1) + ': expected EMP_ID, amount[, instalment]'); return; }
    rows.push({ empId: parts[0], outstanding: parts[1], monthlyInstalment: parts[2] || '', note: '' });
  });
  return { rows: rows, errors: errors };
}

// ================================================================ monthly recovery proposal

/** Pure. One employee's open loans -> {recovery, loanIds}. recovery = sum of min(instalment, balance) per loan, capped at the combined outstanding. */
function advance_recoveryForEmp_(loans) {
  var total = 0, loanIds = [], combined = 0;
  (loans || []).forEach(function (l) {
    var bal = feeds_num_(l.OUTSTANDING_BALANCE_INR); if (isNaN(bal) || bal < 0) bal = 0;
    combined += bal;
    var inst = feeds_num_(l.MONTHLY_INSTALMENT_INR); if (isNaN(inst) || inst < 0) inst = 0;
    var rec = Math.min(inst, bal);
    if (rec > 0) { total += rec; loanIds.push(feeds_str_(l.LOAN_ID)); }
  });
  if (total > combined) total = combined; // never recover more than is owed, across all loans
  return { recovery: Math.round(total * 100) / 100, loanIds: loanIds };
}

/**
 * Pure. ledgerRows = ADVANCE_LEDGER objects, inputRows = INPUT_ADVANCE objects of any period (filtered here).
 * An existing row is updated only when APPROVAL_STATUS is not APPROVED and REMARKS still equals ADVANCE_AUTO_MARKER
 * exactly (anything else = hand-edited, skipped and listed).
 */
function planAdvanceRecoveries(period, ledgerRows, inputRows) {
  var byEmp = advance_groupByEmp_(advance_activeLedger_(ledgerRows));
  var existingByEmp = {};
  (inputRows || []).forEach(function (r) { if (normalizePeriod(r.PAYROLL_MONTH) === period) existingByEmp[feeds_empId_(r.EMP_ID)] = r; });
  var res = { created: [], updated: [], skippedHandEdited: [], skippedApproved: [] };
  Object.keys(byEmp).sort().forEach(function (empId) {
    var plan = advance_recoveryForEmp_(byEmp[empId]);
    if (plan.recovery <= 0) return;
    var sourceRef = plan.loanIds.join(',');
    var existing = existingByEmp[empId];
    if (!existing) { res.created.push({ empId: empId, recovery: plan.recovery, sourceRef: sourceRef }); return; }
    if (feeds_str_(existing.APPROVAL_STATUS).toUpperCase() === 'APPROVED') { res.skippedApproved.push(empId); return; }
    if (feeds_str_(existing.REMARKS) !== ADVANCE_AUTO_MARKER) { res.skippedHandEdited.push(empId); return; }
    res.updated.push({ row: existing._row, empId: empId, recovery: plan.recovery, sourceRef: sourceRef });
  });
  return res;
}

/** Proposes PENDING INPUT_ADVANCE recoveries for the period from the ADVANCE_LEDGER (still needs normal approval). */
function advanceGenerateRecoveries(period) {
  guardPeriod_(period);
  var ledgerRows = readObjects(TABS.ADVANCE_LEDGER);
  var inputRows = readObjects(TABS.INPUT_ADVANCE);
  var plan = planAdvanceRecoveries(period, ledgerRows, inputRows);
  var now = nowIso_();
  var updates = plan.updated.map(function (u) {
    return { row: u.row, values: { RECOVERY_THIS_MONTH_INR: u.recovery, APPROVAL_STATUS: 'PENDING',
      SOURCE_BATCH_ID: u.sourceRef, REMARKS: ADVANCE_AUTO_MARKER, ENTERED_AT: now } };
  });
  var creates = plan.created.map(function (c) {
    return { PAYROLL_MONTH: period, EMP_ID: c.empId, EMPLOYEE_NAME_DISPLAY: '', ADVANCE_TYPE: '', ADVANCE_DATE: '',
      ORIGINAL_ADVANCE_INR: '', OPENING_BALANCE_INR: '', RECOVERY_THIS_MONTH_INR: c.recovery, CLOSING_BALANCE_INR: '',
      ACCOUNTS_LEDGER_REFERENCE: '', SOURCE_BATCH_ID: c.sourceRef, APPROVAL_STATUS: 'PENDING', APPROVED_BY: '',
      ENTERED_AT: now, REMARKS: ADVANCE_AUTO_MARKER };
  });
  updateRows(TABS.INPUT_ADVANCE, updates);
  if (creates.length) appendObjects(TABS.INPUT_ADVANCE, creates);
  var summary = { period: period, created: creates.length, updated: updates.length,
    skippedHandEdited: plan.skippedHandEdited, skippedApproved: plan.skippedApproved };
  audit('ADVANCE_RECOVERY_GENERATE', period, '', summary);
  return summary;
}

// ================================================================ lock-time ledger decrement (hooked from 41_Lock.gs)

/** Pure. loans = OPEN ADVANCE_LEDGER rows of one employee, oldest first; amount = the recovered total. Never negative. */
function advance_decrementPlan_(loans, amount) {
  var remaining = amount, updates = [];
  (loans || []).forEach(function (l) {
    if (remaining <= 0) return;
    var bal = feeds_num_(l.OUTSTANDING_BALANCE_INR); if (isNaN(bal) || bal < 0) bal = 0;
    var take = Math.min(remaining, bal);
    if (take <= 0) return;
    var newBal = Math.round((bal - take) * 100) / 100;
    remaining = Math.round((remaining - take) * 100) / 100;
    updates.push({ row: l._row, newBalance: newBal < 0 ? 0 : newBal, closed: newBal <= 1e-9 });
  });
  return updates;
}

/**
 * Called once a lock succeeds (41_Lock.gs), for the employees just locked. Decrements ADVANCE_LEDGER
 * OUTSTANDING_BALANCE_INR by the APPROVED, AUTO_RECOVERY-sourced INPUT_ADVANCE recovery of the period (oldest loan
 * first), closing a loan that hits zero. Wrapped so it can never fail or slow the lock.
 */
function advanceApplyLockRecoveries_(period, population, lockedEmpIds) {
  try {
    var byEmp = {};
    readObjects(TABS.INPUT_ADVANCE).forEach(function (r) {
      if (normalizePeriod(r.PAYROLL_MONTH) !== period) return;
      if (feeds_str_(r.APPROVAL_STATUS).toUpperCase() !== 'APPROVED') return;
      if (feeds_str_(r.REMARKS) !== ADVANCE_AUTO_MARKER) return;
      byEmp[feeds_empId_(r.EMP_ID)] = r;
    });
    var ledgerByEmp = advance_groupByEmp_(advance_activeLedger_(readObjects(TABS.ADVANCE_LEDGER)));
    var cellUpdates = [], closedCount = 0, touchedEmps = 0;
    (lockedEmpIds || []).forEach(function (rawId) {
      var id = feeds_empId_(rawId);
      var row = byEmp[id];
      if (!row) return;
      var amount = feeds_num_(row.RECOVERY_THIS_MONTH_INR);
      if (isNaN(amount) || amount <= 0) return;
      var loans = (ledgerByEmp[id] || []).slice().sort(function (a, b) {
        return feeds_str_(a.OPENING_DATE).localeCompare(feeds_str_(b.OPENING_DATE)) || feeds_str_(a.LOAN_ID).localeCompare(feeds_str_(b.LOAN_ID));
      });
      var plan = advance_decrementPlan_(loans, amount);
      if (!plan.length) return;
      touchedEmps++;
      plan.forEach(function (p) {
        var vals = { OUTSTANDING_BALANCE_INR: p.newBalance };
        if (p.closed) { vals.STATUS = 'CLOSED'; vals.CLOSED_AT = nowIso_(); closedCount++; }
        cellUpdates.push({ row: p.row, values: vals });
      });
    });
    if (cellUpdates.length) updateRows(TABS.ADVANCE_LEDGER, cellUpdates);
    var summary = { period: period, population: population, employeesTouched: touchedEmps, loansUpdated: cellUpdates.length, closed: closedCount };
    if (cellUpdates.length) audit('ADVANCE_LOCK_DECREMENT', period, population, summary);
    return summary;
  } catch (e) {
    try { audit('ADVANCE_LOCK_DECREMENT_ERROR', period, population, String(e && e.message ? e.message : e)); } catch (e2) { /* never fail the lock */ }
    return null;
  }
}

// ================================================================ society carry-forward (owner decision 2)

function society_prevPeriod_(period) {
  var p = parsePeriod(period);
  var y = p.month === 1 ? p.year - 1 : p.year, m = p.month === 1 ? 12 : p.month - 1;
  return y + '-' + pad2_(m);
}

var SOCIETY_CARRYFORWARD_FIELDS = ['SOCIETY_NAME', 'LOAN_REFERENCE', 'GENERAL_EMI_INR', 'EMERGENCY_EMI_INR',
  'EDUCATION_EMI_INR', 'SHARES_OTHER_INR', 'TOTAL_RECOVERY_INR'];

/**
 * Pure. rows = INPUT_SOCIETY objects (any period). activeEmpIds = {EMP_ID: true} (roster of the CURRENT period).
 * For each EMP_ID, the LATEST APPROVED row of the previous period (by _row) is carried forward as a PENDING row of
 * `period` with the same component/total columns; same hand-edited/approved skip rule as advance.
 */
function planSocietyCarryforward(period, rows, activeEmpIds) {
  var prev = society_prevPeriod_(period);
  var latestByEmp = {};
  (rows || []).forEach(function (r) {
    if (normalizePeriod(r.PAYROLL_MONTH) !== prev) return;
    if (feeds_str_(r.APPROVAL_STATUS).toUpperCase() !== 'APPROVED') return;
    var id = feeds_empId_(r.EMP_ID);
    var cur = latestByEmp[id];
    if (!cur || r._row > cur._row) latestByEmp[id] = r;
  });
  var existingByEmp = {};
  (rows || []).forEach(function (r) { if (normalizePeriod(r.PAYROLL_MONTH) === period) existingByEmp[feeds_empId_(r.EMP_ID)] = r; });
  var res = { created: [], updated: [], skippedHandEdited: [], skippedApproved: [], skippedInactive: [] };
  Object.keys(latestByEmp).sort().forEach(function (empId) {
    if (activeEmpIds && !activeEmpIds[empId]) { res.skippedInactive.push(empId); return; }
    var src = latestByEmp[empId];
    var fields = {};
    SOCIETY_CARRYFORWARD_FIELDS.forEach(function (k) { fields[k] = src[k]; });
    var existing = existingByEmp[empId];
    if (!existing) { res.created.push(Object.assign({ empId: empId }, fields)); return; }
    if (feeds_str_(existing.APPROVAL_STATUS).toUpperCase() === 'APPROVED') { res.skippedApproved.push(empId); return; }
    if (feeds_str_(existing.REMARKS) !== SOCIETY_AUTO_MARKER) { res.skippedHandEdited.push(empId); return; }
    res.updated.push(Object.assign({ row: existing._row, empId: empId }, fields));
  });
  return res;
}

/** Carries forward last period's APPROVED society EMI as a PENDING row of `period`, active roster employees only. */
function societyGenerateCarryforward(period) {
  guardPeriod_(period);
  var rows = readObjects(TABS.INPUT_SOCIETY);
  var activeSet = {};
  buildRoster(period).forEach(function (r) { activeSet[feeds_empId_(r.EMP_ID)] = true; });
  var plan = planSocietyCarryforward(period, rows, activeSet);
  var updates = plan.updated.map(function (u) {
    var v = { REMARKS: SOCIETY_AUTO_MARKER, APPROVAL_STATUS: 'PENDING' };
    SOCIETY_CARRYFORWARD_FIELDS.forEach(function (k) { v[k] = u[k]; });
    return { row: u.row, values: v };
  });
  var creates = plan.created.map(function (c) {
    var v = { PAYROLL_MONTH: period, EMP_ID: c.empId, EMPLOYEE_NAME_DISPLAY: '', APPROVAL_STATUS: 'PENDING',
      OUTSTANDING_BALANCE_INR: '', SOURCE_BATCH_ID: '', REMARKS: SOCIETY_AUTO_MARKER };
    SOCIETY_CARRYFORWARD_FIELDS.forEach(function (k) { v[k] = c[k]; });
    return v;
  });
  updateRows(TABS.INPUT_SOCIETY, updates);
  if (creates.length) appendObjects(TABS.INPUT_SOCIETY, creates);
  var summary = { period: period, created: creates.length, updated: updates.length,
    skippedHandEdited: plan.skippedHandEdited, skippedApproved: plan.skippedApproved, skippedInactive: plan.skippedInactive };
  audit('SOCIETY_CARRYFORWARD', period, '', summary);
  return summary;
}
