/**
 * 14_Employees.gs - HR-only "Add or update employee" and "Mark employee exit" (modal dialog, no Google Form, so the
 * sensitive statutory IDs never land in a form-response tab). Pure validation / row building first (Node-testable),
 * sheet-touching server functions after. Runner must be HR_APPROVER_EMAIL or OWNER_APPROVER_EMAIL.
 *
 * Add / update writes EMPLOYEE_MASTER (STATUS_AS_SOURCE Active, VALIDATION_STATE PENDING_HR_APPROVAL), a NEW
 * effective-dated SALARY_STRUCTURE / PAYROLL_RATE_PROFILE row (VERSION_STATE PENDING, HR_APPROVED_BY blank; older rows are
 * never touched, a salary revision is just a later row) and, when given, the statutory IDs into the hidden protected
 * EMPLOYEE_STATUTORY_IDS tab only. Until HR approves the new row (Payroll > Approve salary structure) the employee is on
 * HOLD (SALARY_NOT_APPROVED), the rest of the population is not blocked.
 */
var EMP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-]{1,24}$/;
/** SALARY_STRUCTURE components (input key -> column) per calc method; every other component is written as 0. */
var EMP_SALARY_COLUMNS = { BASIC: 'BASIC_PM_INR', HRA: 'HRA_PM_INR', CONVEYANCE: 'CONVEYANCE_PM_INR', EDUCATION: 'EDUCATION_PM_INR',
  MEDICAL: 'MEDICAL_PM_INR', PRO_DEV: 'PRO_DEV_PM_INR', COMMUNICATION: 'COMMUNICATION_PM_INR', UNIFORM: 'UNIFORM_PM_INR',
  WASHING: 'WASHING_PM_INR' };
var EMP_COMPONENTS_STAFF = ['BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'MEDICAL', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'WASHING'];
var EMP_COMPONENTS_WORKER = ['BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'WASHING'];
var EMP_OT_METHODS = ['DAILY_RATE_DIV_8_X_OT_HOURS', 'MONTHLY_GROSS_DIV_WORKING_DAYS_DIV_8_X_OT_HOURS',
  'BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM'];
var EMP_PAY_BASES = ['DAILY_RATE', 'MONTHLY_GROSS_PRORATED'];
var EMP_DIALOG_SOURCE = 'HR_OS_DIALOG';

// ================================================================ pure

function emp_str_(v) { return String(v == null ? '' : v).trim(); }

/** Number of a form field: blank -> 0; anything not a finite number -> NaN. */
function emp_num_(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'boolean') return NaN;
  var n = Number(String(v).replace(/,/g, '').trim());
  return isFinite(n) ? n : NaN;
}

/** 'YYYY-MM-DD' (date input) or 'dd/mm/yyyy' -> ISO date, '' when it is not a real date. */
function emp_isoDate_(v) {
  var s = emp_str_(v), y, m, d;
  var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s), b = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (a) { y = +a[1]; m = +a[2]; d = +a[3]; } else if (b) { d = +b[1]; m = +b[2]; y = +b[3]; } else return '';
  var dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return y + '-' + pad2_(m) + '-' + pad2_(d);
}

/** ISO date -> 'dd/mm/yyyy' (the text format DOJ_AS_SOURCE uses, read day-first by the roster rule). */
function emp_dojText_(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }

function emp_components_(method) { return method === 'PERMANENT_WORKER' ? EMP_COMPONENTS_WORKER : EMP_COMPONENTS_STAFF; }

/**
 * Pure. SALARY_STRUCTURE values from the dialog's salary section.
 * salary = {BASIC, HRA, CONVEYANCE, EDUCATION, MEDICAL, PRO_DEV, COMMUNICATION, UNIFORM, WASHING, heat (150|0|true|false),
 * vda, production}. STAFF: the nine components; PERMANENT_WORKER: BASIC, HRA, CONVEYANCE, EDUCATION, WASHING + heat flag
 * (150 or 0), VDA master, production master. FIXED_GROSS_PM_AS_SOURCE_INR is the auto-sum of everything entered
 * (worker: the five components + the heat amount 150 + VDA master + production master).
 * Returns {errors, values:{column: number}, fixedGross}.
 */
function emp_salaryValues(method, salary) {
  var errors = [], values = {}, sal = salary || {}, sum = 0;
  Object.keys(EMP_SALARY_COLUMNS).forEach(function (k) { values[EMP_SALARY_COLUMNS[k]] = 0; });
  values.HEAT_MASTER_INR = 0; values.VDA_MASTER_INR = 0; values.PRODUCTION_MASTER_INR = 0;
  emp_components_(method).forEach(function (k) {
    var n = emp_num_(sal[k]);
    if (isNaN(n) || n < 0) { errors.push(k + ' must be a number >= 0'); return; }
    values[EMP_SALARY_COLUMNS[k]] = n;
    sum += n;
  });
  if (method === 'PERMANENT_WORKER') {
    var heat = sal.heat === true || sal.heat === 'true' ? 150 : (sal.heat === false || sal.heat === 'false' ? 0 : emp_num_(sal.heat));
    if (heat !== 0 && heat !== 150) errors.push('Heat must be 150 (heat allowance) or 0');
    else { values.HEAT_MASTER_INR = heat; sum += heat; }
    var vda = emp_num_(sal.vda), prod = emp_num_(sal.production);
    if (isNaN(vda) || vda < 0) errors.push('VDA master must be a number >= 0'); else { values.VDA_MASTER_INR = vda; sum += vda; }
    if (isNaN(prod) || prod < 0) errors.push('Production master must be a number >= 0'); else { values.PRODUCTION_MASTER_INR = prod; sum += prod; }
  }
  if (!errors.length && !(values.BASIC_PM_INR > 0)) errors.push('BASIC must be greater than 0');
  var fg = Math.round(sum * 100) / 100;
  if (!errors.length && !(fg > 0)) errors.push('Fixed gross must be greater than 0');
  values.FIXED_GROSS_PM_AS_SOURCE_INR = fg;
  return { errors: errors, values: values, fixedGross: fg };
}

/** Pure. PAYROLL_RATE_PROFILE values from the dialog's rate section {payBasis, rate, monthlyGross, otMethod}. */
function emp_rateValues(method, rate) {
  var errors = [], r = rate || {}, values = {};
  var basis = emp_str_(r.payBasis).toUpperCase();
  if (EMP_PAY_BASES.indexOf(basis) < 0) errors.push('PAY_BASIS must be DAILY_RATE or MONTHLY_GROSS_PRORATED');
  if (method === 'PUNE_STAFF' && basis && basis !== 'MONTHLY_GROSS_PRORATED') errors.push('This category requires MONTHLY_GROSS_PRORATED');
  var rateAmt = emp_num_(r.rate), gross = emp_num_(r.monthlyGross);
  if (basis === 'DAILY_RATE') {
    if (isNaN(rateAmt) || !(rateAmt > 0)) errors.push('Daily rate must be a number greater than 0');
    values.RATE_AMOUNT_INR = rateAmt; values.MONTHLY_GROSS_INR = '';
  } else if (basis === 'MONTHLY_GROSS_PRORATED') {
    if (isNaN(gross) || !(gross > 0)) errors.push('Monthly gross must be a number greater than 0');
    values.MONTHLY_GROSS_INR = gross; values.RATE_AMOUNT_INR = '';
  }
  var ot = emp_str_(r.otMethod).toUpperCase();
  if (!ot) ot = basis === 'DAILY_RATE' ? EMP_OT_METHODS[0] : (method === 'PUNE_STAFF' ? EMP_OT_METHODS[1] : EMP_OT_METHODS[2]);
  if (EMP_OT_METHODS.indexOf(ot) < 0) errors.push('OT_METHOD must be one of ' + EMP_OT_METHODS.join(', '));
  values.PAY_BASIS = basis; values.OT_METHOD = ot;
  return { errors: errors, values: values };
}

/** Pure. Statutory IDs from the dialog: {fields:{UAN,ESI_NO,PAN,BANK_NAME,BANK_ACCOUNT,IFSC}} of the non-blank ones, errors, warnings. */
function emp_idValues(ids) {
  var i = ids || {}, out = { fields: {}, errors: [], warnings: [] };
  var map = { UAN: 'uan', ESI_NO: 'esiNo', PAN: 'pan', BANK_NAME: 'bankName', BANK_ACCOUNT: 'bankAccount', IFSC: 'ifsc' };
  Object.keys(map).forEach(function (f) {
    var v = emp_str_(i[map[f]]);
    if (v) out.fields[f] = (f === 'PAN' || f === 'IFSC') ? v.toUpperCase() : v;
  });
  if (out.fields.PAN && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(out.fields.PAN)) out.errors.push('PAN looks wrong (expected 5 letters, 4 digits, 1 letter)');
  if (out.fields.IFSC && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(out.fields.IFSC)) out.errors.push('IFSC looks wrong (expected 4 letters, 0, 6 characters)');
  if (out.fields.UAN && !/^\d{12}$/.test(out.fields.UAN)) out.warnings.push('UAN is normally 12 digits');
  if (out.fields.ESI_NO && !/^\d{10}$|^\d{17}$/.test(out.fields.ESI_NO)) out.warnings.push('ESI number is normally 10 or 17 digits');
  if (out.fields.BANK_ACCOUNT && !/^\d{6,20}$/.test(out.fields.BANK_ACCOUNT)) out.warnings.push('Bank account is normally 6-20 digits');
  return out;
}

/**
 * Pure. Validates the whole dialog payload. ctx = {mode:'ADD'|'UPDATE', category: config entry of the chosen category (or
 * null), master: existing EMPLOYEE_MASTER rows of the EMP_ID, latestPay: the latest existing row of the pay tab for the
 * EMP_ID (or null), payRows: all rows of the EMP_ID in the pay tab, minPeriod}. Returns
 * {errors, warnings, mode, empId, master:{...}, pay:null|{kind:'SALARY'|'RATE', values, effectiveFrom, unchanged}, ids:{fields}}.
 */
function empValidateInput(input, ctx) {
  var errors = [], warnings = [], inp = input || {};
  var mode = emp_str_(inp.mode).toUpperCase() === 'UPDATE' ? 'UPDATE' : 'ADD';
  var empId = emp_str_(inp.empId);
  if (!EMP_ID_PATTERN.test(empId)) errors.push('EMP_ID must be 2-25 letters / digits / . _ - (got "' + empId + '")');
  var existing = ctx.master || [];
  if (mode === 'ADD' && existing.length) errors.push('EMP_ID ' + empId + ' already exists in EMPLOYEE_MASTER (use Update; a re-hire needs a new EMP_ID)');
  if (mode === 'UPDATE' && !existing.length) errors.push('EMP_ID ' + empId + ' is not in EMPLOYEE_MASTER (use Add)');
  var name = emp_str_(inp.name), email = emp_str_(inp.email);
  if (!name) errors.push('Name is required');
  if (name.length > 120) errors.push('Name is too long');
  if (email && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) errors.push('Email address is not valid');
  var cat = ctx.category;
  if (!cat || !cat.active) errors.push('Category "' + emp_str_(inp.category) + '" is not an active category of PAYROLL_CATEGORY_CONFIG');
  var doj = emp_isoDate_(inp.doj);
  if (mode === 'ADD' && !doj) errors.push('Date of joining is required (a real date)');
  if (mode === 'UPDATE' && emp_str_(inp.doj) && !doj) errors.push('Date of joining is not a real date');
  var master = { EMP_ID: empId, EMPLOYEE_NAME: name, EMAIL_ID: email, PAYROLL_CATEGORY: cat ? cat.code : emp_str_(inp.category),
    DEPARTMENT: emp_str_(inp.department), DESIGNATION: emp_str_(inp.designation), DOJ_ISO: doj, GENDER: '' };
  // optional GENDER (M / F / Male / Female, any case); blank = unknown (normal PT slabs, never guessed from the name)
  if (emp_str_(inp.gender)) {
    master.GENDER = normalizeGender(inp.gender);
    if (!master.GENDER) errors.push('Gender must be M or F (or left blank)');
  }
  var site = emp_str_(inp.site).toUpperCase();
  if (cat && site && site !== cat.site) warnings.push('Site ' + site + ' differs from the category site ' + cat.site + ' (the category site is used)');

  // pay section
  var pay = null;
  var oldCat = existing.length ? emp_str_(existing[0].PAYROLL_CATEGORY) : '';
  var catChanged = mode === 'UPDATE' && cat && oldCat && oldCat !== cat.code;
  var wantsPay = mode === 'ADD' || !!inp.salary || !!inp.rate || catChanged;
  if (cat && cat.active && wantsPay) {
    var salaryKind = cat.rateSource !== 'RATE_PROFILE';
    var block = salaryKind ? inp.salary : inp.rate;
    if (!block) {
      errors.push((salaryKind ? 'The salary structure' : 'The rate profile') + ' section is required' + (catChanged ? ' when the category changes' : ' for a new employee'));
    } else {
      var res = salaryKind ? emp_salaryValues(cat.method, block) : emp_rateValues(cat.method, block);
      res.errors.forEach(function (e) { errors.push(e); });
      var em = emp_str_(inp.effectiveMonth);
      if (em && !/^\d{4}-(0[1-9]|1[0-2])$/.test(em)) errors.push('Effective month must be YYYY-MM');
      var month = em || (mode === 'ADD' && doj ? doj.slice(0, 7) : '');
      if (mode === 'UPDATE' && !em) errors.push('Choose the effective month of the salary revision');
      if (mode === 'ADD' && !month) errors.push('Effective month cannot be derived (date of joining missing)');
      if (mode === 'UPDATE' && em && ctx.minPeriod && em < ctx.minPeriod) errors.push('Effective month ' + em + ' is earlier than MIN_PERIOD ' + ctx.minPeriod);
      var effectiveFrom = month ? month + '-01' : '';
      if (effectiveFrom && (ctx.payRows || []).some(function (r) { return engine_dateLo_(r.EFFECTIVE_FROM) === effectiveFrom; })) {
        errors.push('A row effective from ' + effectiveFrom + ' already exists for ' + empId + ' - choose a later effective month');
      }
      if (!res.errors.length) {
        pay = { kind: salaryKind ? 'SALARY' : 'RATE', values: res.values, effectiveFrom: effectiveFrom, unchanged: false };
        // an update whose numbers equal the latest row is not a revision
        if (mode === 'UPDATE' && !catChanged && ctx.latestPay) {
          var same = Object.keys(res.values).every(function (col) {
            var a = ctx.latestPay[col], b = res.values[col];
            if (b === '' || b == null) return a === '' || a == null || Number(a) === 0;
            return String(a).trim().toUpperCase() === String(b).trim().toUpperCase() || (isFinite(Number(a)) && Number(a) === Number(b));
          });
          if (same) pay.unchanged = true;
        }
      }
    }
  }
  var ids = emp_idValues(inp.ids);
  ids.errors.forEach(function (e) { errors.push(e); });
  ids.warnings.forEach(function (w) { warnings.push(w); });
  return { errors: errors, warnings: warnings, mode: mode, empId: empId, master: master, pay: pay, ids: ids.fields, catChanged: !!catChanged };
}

/**
 * Pure. Validates an exit. ctx = {master: rows of the EMP_ID}. Returns {errors, lwd (ISO), row (the master row to update)}.
 * The last working day cannot be before the date of joining; an already-exited employee may have the date corrected.
 */
function empValidateExit(empId, lastWorkingDay, ctx) {
  var errors = [], rows = (ctx && ctx.master) || [], id = emp_str_(empId);
  var lwd = emp_isoDate_(lastWorkingDay);
  if (!id) errors.push('EMP_ID is required');
  if (!lwd) errors.push('Last working day must be a real date');
  var target = null;
  if (id) {
    if (!rows.length) errors.push('EMP_ID ' + id + ' is not in EMPLOYEE_MASTER');
    else {
      var active = rows.filter(function (r) { return emp_str_(r.STATUS_AS_SOURCE).toLowerCase() === 'active'; });
      if (active.length > 1) errors.push('EMP_ID ' + id + ' has more than one Active row in EMPLOYEE_MASTER - resolve the duplicate first');
      else if (active.length === 1) target = active[0];
      else {
        var leaver = rows.filter(function (r) { return emp_str_(masterLastWorkingDay_(r)) !== ''; });
        target = leaver[0] || null;
        if (!target) errors.push('EMP_ID ' + id + ' is not Active (nothing to exit)');
      }
    }
  }
  if (target && lwd) {
    var doj = typeof parseDoj === 'function' ? parseDoj(target.DOJ_AS_SOURCE) : '';
    if (doj && lwd < doj) errors.push('Last working day ' + lwd + ' is before the date of joining ' + doj);
  }
  return { errors: errors, lwd: lwd, row: target };
}

// ================================================================ sheet-touching

/** Throws unless the runner is HR_APPROVER_EMAIL or OWNER_APPROVER_EMAIL. Returns the email. */
function emp_requireUser_() {
  var user = approval_userEmail_();
  if (!user) throw new Error('Cannot determine your Google account email - nothing was saved');
  var ctl = readControlMap();
  if (!registerUserAllowed(user, ctl.HR_APPROVER_EMAIL, ctl.OWNER_APPROVER_EMAIL, '')) {
    throw new Error('Not allowed: ' + user + ' is not HR_APPROVER_EMAIL or OWNER_APPROVER_EMAIL');
  }
  return user;
}

function emp_masterRows_(empId) {
  var want = emp_str_(empId).toLowerCase();
  return readObjects(TABS.EMPLOYEE_MASTER).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === want; });
}

function emp_requireColumns_(tab, cols) {
  var headers = getHeaders(resolveSheet_(tab));
  var missing = cols.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) throw new Error(tab + ' lacks column(s) ' + missing.join(', ') + ' (run HR OS > Setup > Run setup)');
  return headers;
}

/** Latest row of an EMP_ID in a pay tab by EFFECTIVE_FROM (blank = oldest), ties later row. */
function emp_latestPay_(rows) {
  var best = null;
  (rows || []).forEach(function (r, i) {
    var from = engine_dateLo_(r.EFFECTIVE_FROM) || '0000-00-00';
    if (!best || from > best.from || (from === best.from && i >= best.i)) best = { from: from, i: i, row: r };
  });
  return best ? best.row : null;
}

function emp_payRowsOf_(tab, empId) {
  var want = emp_str_(empId).toLowerCase();
  if (!getSheet(tab)) return [];
  return readObjects(tab).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === want; });
}

/** Refresh the daily-form rosters after a joiner / leaver; never fails the save. Returns a short note. */
function emp_refreshRosters_() {
  try {
    var r = refreshAttendanceFormRosters();
    return { ok: true, updated: (r.updated || []).length, added: (r.added || []).length, removed: (r.removed || []).length };
  } catch (e) {
    return { ok: false, note: 'form rosters not refreshed (run HR OS > Setup > Refresh form rosters): ' + String(e && e.message ? e.message : e) };
  }
}

/** Upserts the statutory IDs of one employee into EMPLOYEE_STATUTORY_IDS (the only tab that holds them). Returns fields written. */
function emp_writeStatutoryIds_(empId, fields) {
  var names = Object.keys(fields);
  if (!names.length) return 0;
  var sheet = resolveSheet_(TABS.EMPLOYEE_STATUTORY_IDS);
  emp_requireColumns_(TABS.EMPLOYEE_STATUTORY_IDS, HROS_STATUTORY_ID_HEADERS);
  var text = HROS_STATUTORY_ID_HEADERS;
  var hit = readObjects(sheet).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === emp_str_(empId).toLowerCase(); })[0];
  if (hit) updateRows(sheet, [{ row: hit._row, values: fields }], { textHeaders: text });
  else { var o = { EMP_ID: empId }; names.forEach(function (n) { o[n] = fields[n]; }); appendObjects(sheet, [o], { textHeaders: text }); }
  return names.length;
}

/**
 * Save the dialog: Add (new EMP_ID) or Update. Nothing is written when validation fails. payload: see empValidateInput
 * (mode, empId, name, email, doj, category, department, designation, site, effectiveMonth, salary | rate, ids).
 */
function empSave(payload) {
  var user = emp_requireUser_();
  var inp = payload || {};
  var mode = emp_str_(inp.mode).toUpperCase() === 'UPDATE' ? 'UPDATE' : 'ADD';
  var empId = emp_str_(inp.empId);
  var cat = categoryEntry(inp.category);
  var masterRows = emp_masterRows_(empId);
  var payTab = cat && cat.rateSource === 'RATE_PROFILE' ? TABS.PAYROLL_RATE_PROFILE : TABS.SALARY_STRUCTURE;
  var payRows = emp_payRowsOf_(payTab, empId);
  var v = empValidateInput(inp, { mode: mode, category: cat, master: masterRows, payRows: payRows, latestPay: emp_latestPay_(payRows),
    minPeriod: getMinPeriod() });
  if (v.errors.length) throw new Error('Employee not saved - fix these first: ' + v.errors.join('; '));
  // a salary revision must not start in a LOCKED period of the category
  if (v.pay && !v.pay.unchanged && mode === 'UPDATE' && isLocked(v.pay.effectiveFrom.slice(0, 7), cat.code)) {
    throw new Error('Employee not saved - ' + v.pay.effectiveFrom.slice(0, 7) + ' x ' + cat.code + ' is LOCKED; choose a later effective month');
  }
  var masterHeaders = emp_requireColumns_(TABS.EMPLOYEE_MASTER, ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE']);
  if (Object.keys(v.ids).length) {
    if (!getSheet(TABS.EMPLOYEE_STATUTORY_IDS)) throw new Error('Tab EMPLOYEE_STATUTORY_IDS is missing (run HR OS > Setup > Run setup); nothing was saved');
    emp_requireColumns_(TABS.EMPLOYEE_STATUTORY_IDS, HROS_STATUTORY_ID_HEADERS);
  }
  if (v.pay && !v.pay.unchanged) emp_requireColumns_(payTab, ['EMP_ID', 'EFFECTIVE_FROM', 'VERSION_STATE', 'HR_APPROVED_BY']);
  var has = function (h) { return masterHeaders.indexOf(h) >= 0; };
  var today = nowIso_().slice(0, 10);
  var res = { ok: true, mode: mode, empId: empId, category: cat.code, changed: [], salary: null, statutoryFieldsWritten: 0,
    warnings: v.warnings, pendingHrApproval: false };

  // 1. EMPLOYEE_MASTER
  if (mode === 'ADD') {
    var row = { EMP_ID: empId, EMPLOYEE_NAME: v.master.EMPLOYEE_NAME, PAYROLL_CATEGORY: cat.code, STATUS_AS_SOURCE: 'Active' };
    var opt = { EMAIL_ID: v.master.EMAIL_ID, DOJ_AS_SOURCE: emp_dojText_(v.master.DOJ_ISO), DEPARTMENT: v.master.DEPARTMENT,
      DESIGNATION: v.master.DESIGNATION, PLANT_TO_VERIFY: cat.site, DUPLICATE_FLAG: 'NONE', VALIDATION_STATE: 'PENDING_HR_APPROVAL',
      SOURCE_TAB: EMP_DIALOG_SOURCE, SOURCE_SNAPSHOT_DATE: today, REVIEW_NOTE: 'added by ' + user, GENDER: v.master.GENDER };
    Object.keys(opt).forEach(function (k) { if (has(k)) row[k] = opt[k]; });
    appendObjects(TABS.EMPLOYEE_MASTER, [row], { textHeaders: ['EMP_ID', 'DOJ_AS_SOURCE', 'LAST_WORKING_DAY', 'SOURCE_SNAPSHOT_DATE'] });
    res.changed = ['NEW_EMPLOYEE'];
    res.pendingHrApproval = true;
  } else {
    var cur = masterRows.filter(function (r) { return emp_str_(r.STATUS_AS_SOURCE).toLowerCase() === 'active'; })[0] || masterRows[0];
    var vals = {};
    var set = function (col, val, old) { if (has(col) && emp_str_(val) !== '' && emp_str_(val) !== emp_str_(old)) { vals[col] = val; res.changed.push(col); } };
    set('EMPLOYEE_NAME', v.master.EMPLOYEE_NAME, cur.EMPLOYEE_NAME);
    set('EMAIL_ID', v.master.EMAIL_ID, cur.EMAIL_ID);
    set('DEPARTMENT', v.master.DEPARTMENT, cur.DEPARTMENT);
    set('DESIGNATION', v.master.DESIGNATION, cur.DESIGNATION);
    set('GENDER', v.master.GENDER, normalizeGender(cur.GENDER));
    set('PAYROLL_CATEGORY', cat.code, cur.PAYROLL_CATEGORY);
    if (v.master.DOJ_ISO) set('DOJ_AS_SOURCE', emp_dojText_(v.master.DOJ_ISO), cur.DOJ_AS_SOURCE);
    if (v.pay && !v.pay.unchanged && has('VALIDATION_STATE')) { vals.VALIDATION_STATE = 'PENDING_HR_APPROVAL'; res.pendingHrApproval = true; }
    if (Object.keys(vals).length) updateRows(TABS.EMPLOYEE_MASTER, [{ row: cur._row, values: vals }], { textHeaders: ['DOJ_AS_SOURCE'] });
  }

  // 2. new effective-dated pay row (older rows are never touched)
  if (v.pay && v.pay.unchanged) res.salary = { added: false, note: 'numbers equal the latest row - no new row' };
  else if (v.pay) {
    var pr = Object.assign({ EMP_ID: empId, PAYROLL_CATEGORY: cat.code, EFFECTIVE_FROM: v.pay.effectiveFrom, EFFECTIVE_TO: '',
      VERSION_STATE: 'PENDING', HR_APPROVED_BY: '', HR_APPROVED_AT: '' }, v.pay.values);
    var ph = getHeaders(resolveSheet_(payTab));
    if (v.pay.kind === 'SALARY') {
      pr.SOURCE_TAB = EMP_DIALOG_SOURCE; pr.SOURCE_PAYROLL_MONTH = ''; pr.EMPLOYMENT_STATUS_AT_SOURCE = 'Active';
      pr.VALIDATION_NOTE = 'added by ' + user + ' via the employee dialog; HR must approve';
    } else {
      pr.ATTENDANCE_REQUIRED = 'YES'; pr.WORKING_DAYS_REQUIRED = 'YES'; pr.PRESENT_DAYS_REQUIRED = 'YES'; pr.WORKED_DAYS_REQUIRED = 'YES';
      pr.NOTE = 'added by ' + user + ' via the employee dialog; HR must approve';
    }
    var clean = {};
    Object.keys(pr).forEach(function (k) { if (ph.indexOf(k) >= 0) clean[k] = pr[k]; });
    appendObjects(payTab, [clean], { textHeaders: ['EFFECTIVE_FROM', 'EFFECTIVE_TO'] });
    res.salary = { added: true, tab: payTab, effectiveFrom: v.pay.effectiveFrom, versionState: 'PENDING' };
    res.pendingHrApproval = true;
  }

  // 3. statutory IDs: only ever into EMPLOYEE_STATUTORY_IDS (values are never returned, logged or audited)
  res.statutoryFieldsWritten = emp_writeStatutoryIds_(empId, v.ids);

  res.rosterRefresh = emp_refreshRosters_();
  audit(mode === 'ADD' ? 'EMPLOYEE_ADD' : 'EMPLOYEE_UPDATE', '', cat.code, { by: user, empId: empId, changed: res.changed,
    salaryRow: res.salary && res.salary.added ? 'PENDING effective ' + res.salary.effectiveFrom : 'none',
    statutoryFields: res.statutoryFieldsWritten, pendingHrApproval: res.pendingHrApproval });
  return res;
}

/**
 * Mark an employee's exit: LAST_WORKING_DAY is set and STATUS_AS_SOURCE becomes Non-Active. The roster keeps the employee
 * for every period up to the month of the last working day (leaver rule), then drops him; there is no automatic
 * proration - HR enters the days worked in the register.
 */
function empMarkExit(empId, lastWorkingDay) {
  var user = emp_requireUser_();
  var v = empValidateExit(empId, lastWorkingDay, { master: emp_masterRows_(empId) });
  if (v.errors.length) throw new Error('Exit not saved - ' + v.errors.join('; '));
  emp_requireColumns_(TABS.EMPLOYEE_MASTER, ['STATUS_AS_SOURCE', 'LAST_WORKING_DAY']);
  var prev = emp_str_(masterLastWorkingDay_(v.row));
  updateRows(TABS.EMPLOYEE_MASTER, [{ row: v.row._row, values: { STATUS_AS_SOURCE: 'Non-Active', LAST_WORKING_DAY: v.lwd } }],
    { textHeaders: ['LAST_WORKING_DAY'] });
  var res = { ok: true, empId: emp_str_(empId), lastWorkingDay: v.lwd, status: 'Non-Active', onRosterThrough: v.lwd.slice(0, 7),
    previousLastWorkingDay: prev, note: 'The employee stays on the roster for periods up to ' + v.lwd.slice(0, 7) +
      '; days worked are entered in the register (no automatic proration).' };
  res.rosterRefresh = emp_refreshRosters_();
  audit('EMPLOYEE_EXIT', '', emp_str_(v.row.PAYROLL_CATEGORY), { by: user, empId: res.empId, lastWorkingDay: v.lwd, previous: prev });
  return res;
}

var EMP_MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Pure. Parses pasted bulk-exit lines: 'EMP_ID, DD-MM-YYYY' (also '/' separators, DD-Mon-YYYY, tab / comma / spaces between
 * the fields). Blank lines are ignored. Returns {rows:[{empId, lastWorkingDay (ISO)}], errors:[{line, text, reason}]}.
 */
function empParseBulkExits(text) {
  var rows = [], errors = [], seen = {};
  String(text == null ? '' : text).replace(/\r/g, '').split('\n').forEach(function (raw, i) {
    var t = raw.trim();
    if (!t) return;
    var err = function (reason) { errors.push({ line: i + 1, text: t, reason: reason }); };
    var parts = t.split(/[\t,;]+|\s+/).filter(function (x) { return x !== ''; });
    if (parts.length !== 2) return err('expected EMP_ID and a date, e.g. E101, 31-07-2026');
    var id = parts[0], d = parts[1], iso = '';
    var m = /^(\d{1,2})[-\/.]([A-Za-z]{3})[A-Za-z]*[-\/.](\d{4})$/.exec(d);
    if (m) {
      var mi = EMP_MONTHS_.indexOf(m[2].toLowerCase());
      if (mi >= 0) iso = emp_isoDate_(m[1] + '/' + (mi + 1) + '/' + m[3]);
    } else {
      m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(d);
      if (m) iso = emp_isoDate_(m[1] + '/' + m[2] + '/' + m[3]);
      else iso = emp_isoDate_(d);
    }
    if (!iso) return err('"' + d + '" is not a real date (use DD-MM-YYYY)');
    var key = id.toLowerCase();
    if (seen[key]) return err('duplicate EMP_ID ' + id + ' (first on line ' + seen[key] + ')');
    seen[key] = i + 1;
    rows.push({ empId: id, lastWorkingDay: iso });
  });
  return { rows: rows, errors: errors };
}

/**
 * Bulk exit. apply=false: preview only (nothing written). apply=true: empMarkExit for every valid row under the script lock.
 * Returns {applied, done:[], skipped:[], errors:[]}; each entry {empId, lastWorkingDay, line?, note|reason}.
 * An employee who is already Non-Active is skipped, not an error.
 */
function empBulkExit(text, apply) {
  emp_requireUser_();
  var parsed = empParseBulkExits(text);
  var out = { applied: !!apply, done: [], skipped: [], errors: parsed.errors.slice() };
  var valid = [];
  parsed.rows.forEach(function (r) {
    var rows = emp_masterRows_(r.empId);
    var anyActive = rows.some(function (x) { return emp_str_(x.STATUS_AS_SOURCE).toLowerCase() === 'active'; });
    if (rows.length && !anyActive) {
      out.skipped.push({ empId: r.empId, lastWorkingDay: r.lastWorkingDay, reason: 'skipped (already Non-Active)' });
      return;
    }
    var v = empValidateExit(r.empId, r.lastWorkingDay, { master: rows });
    if (v.errors.length) out.errors.push({ empId: r.empId, text: r.empId + ', ' + r.lastWorkingDay, reason: v.errors.join('; ') });
    else valid.push(r);
  });
  if (!apply) {
    out.done = valid.map(function (r) { return { empId: r.empId, lastWorkingDay: r.lastWorkingDay, note: 'will be marked Non-Active' }; });
    return out;
  }
  emp_locked_(function () {
    valid.forEach(function (r) {
      try {
        var res = empMarkExit(r.empId, r.lastWorkingDay);
        out.done.push({ empId: r.empId, lastWorkingDay: res.lastWorkingDay, note: 'marked Non-Active' });
      } catch (e) {
        out.errors.push({ empId: r.empId, text: r.empId + ', ' + r.lastWorkingDay, reason: e && e.message ? e.message : String(e) });
      }
    });
    return null;
  });
  return out;
}

/** Page data: active categories, departments already in use, the runner. No employee data. */
function empLoad() {
  var user = emp_requireUser_();
  var depts = {};
  readObjects(TABS.EMPLOYEE_MASTER).forEach(function (r) { var d = emp_str_(r.DEPARTMENT); if (d) depts[d] = true; });
  return { user: user, minPeriod: getMinPeriod(), today: nowIso_().slice(0, 10), otMethods: EMP_OT_METHODS, payBases: EMP_PAY_BASES,
    departments: Object.keys(depts).sort().slice(0, 200),
    categories: categoryList().map(function (e) {
      return { code: e.code, name: e.displayName, site: e.site, method: e.method, rateSource: e.rateSource };
    }) };
}

/**
 * Lookup for the dialog (update / exit): master fields, latest pay row values and, for the statutory IDs, only whether a
 * value is on file (never the value itself).
 */
function empLookup(empId) {
  emp_requireUser_();
  var rows = emp_masterRows_(empId);
  if (!rows.length) return { exists: false };
  var cur = rows.filter(function (r) { return emp_str_(r.STATUS_AS_SOURCE).toLowerCase() === 'active'; })[0] || rows[0];
  var cat = categoryEntry(cur.PAYROLL_CATEGORY);
  var out = { exists: true, name: emp_str_(cur.EMPLOYEE_NAME), email: emp_str_(cur.EMAIL_ID), category: emp_str_(cur.PAYROLL_CATEGORY),
    status: emp_str_(cur.STATUS_AS_SOURCE), department: emp_str_(cur.DEPARTMENT), designation: emp_str_(cur.DESIGNATION), gender: normalizeGender(cur.GENDER),
    doj: typeof parseDoj === 'function' ? parseDoj(cur.DOJ_AS_SOURCE) : '', lastWorkingDay: toIsoDate(masterLastWorkingDay_(cur)),
    duplicates: rows.length > 1, idsOnFile: {} };
  var payTab = cat && cat.rateSource === 'RATE_PROFILE' ? TABS.PAYROLL_RATE_PROFILE : TABS.SALARY_STRUCTURE;
  var latest = emp_latestPay_(emp_payRowsOf_(payTab, empId));
  if (latest) {
    out.pay = { kind: payTab === TABS.SALARY_STRUCTURE ? 'SALARY' : 'RATE', effectiveFrom: engine_dateLo_(latest.EFFECTIVE_FROM),
      versionState: emp_str_(latest.VERSION_STATE), approved: payTab === TABS.SALARY_STRUCTURE ? emp_str_(latest.HR_APPROVED_BY) !== '' : calc_isRateApproved(latest), values: {} };
    var cols = payTab === TABS.SALARY_STRUCTURE
      ? Object.keys(EMP_SALARY_COLUMNS).map(function (k) { return [k, EMP_SALARY_COLUMNS[k]]; }).concat([['heat', 'HEAT_MASTER_INR'], ['vda', 'VDA_MASTER_INR'], ['production', 'PRODUCTION_MASTER_INR']])
      : [['payBasis', 'PAY_BASIS'], ['rate', 'RATE_AMOUNT_INR'], ['monthlyGross', 'MONTHLY_GROSS_INR'], ['otMethod', 'OT_METHOD']];
    cols.forEach(function (c) { out.pay.values[c[0]] = latest[c[1]] === undefined ? '' : latest[c[1]]; });
  }
  if (getSheet(TABS.EMPLOYEE_STATUTORY_IDS)) {
    var hit = readObjects(TABS.EMPLOYEE_STATUTORY_IDS).filter(function (r) { return emp_str_(r.EMP_ID).toLowerCase() === emp_str_(empId).toLowerCase(); })[0];
    if (hit) HROS_STATUTORY_ID_HEADERS.slice(1).forEach(function (f) { out.idsOnFile[f] = emp_str_(hit[f]) !== ''; });
  }
  return out;
}

// ================================================================ dialog page

function empPageHtml_() {
  return [
    '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8"><title>Employees</title>',
    '<style>',
    'body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#202124;font-size:13px}h2{margin:0 0 8px}',
    'fieldset{margin:10px 0;border:1px solid #c9ced6;border-radius:4px}legend{font-weight:bold}',
    'label{display:inline-block;min-width:150px;margin:3px 0}input,select{padding:3px;margin:2px 8px 2px 0}',
    'input.w{width:230px}input.n{width:110px}.note{color:#5f6368;font-size:12px}.hidden{display:none}',
    '#msg{margin-top:12px;white-space:pre-wrap}.err{color:#b00020}.ok{color:#1b7f3b}button{padding:6px 14px;margin-right:8px}',
    '</style></head><body>',
    '<h2>Employees</h2>',
    '<div><label><input type="radio" name="mode" value="ADD" checked> Add employee</label>',
    '<label><input type="radio" name="mode" value="UPDATE"> Update employee / salary revision</label>',
    '<label><input type="radio" name="mode" value="EXIT"> Mark employee exit</label></div>',
    '<div>Employee code <input id="empId" class="n" autocomplete="off"> <button id="lookup" type="button">Load</button>',
    ' <span class="note" id="loaded"></span></div>',
    '<div id="exitBox" class="hidden"><fieldset><legend>Exit</legend><label>Last working day</label><input id="lwd" type="date">',
    '<div class="note">Status becomes Non-Active; the employee stays on the roster for periods up to that month. Days worked are entered in the register (no automatic proration).</div></fieldset></div>',
    '<div id="mainBox">',
    '<fieldset><legend>Employee</legend>',
    '<label>Name</label><input id="name" class="w"><label>Email</label><input id="email" class="w"><br>',
    '<label>Date of joining</label><input id="doj" type="date"><label>Category</label><select id="category"></select> <span class="note" id="siteNote"></span><br>',
    '<label>Department</label><input id="department" class="w" list="depts"><datalist id="depts"></datalist>',
    '<label>Designation</label><input id="designation" class="w">',
    '<label>Gender (optional)</label><select id="gender"><option value="">-</option><option value="M">M</option><option value="F">F</option></select></fieldset>',
    '<fieldset id="salBox"><legend>Salary structure (per month, INR)</legend><div id="salFields"></div>',
    '<div id="workerFields"><label>Heat allowance</label><select id="heat"><option value="0">No</option><option value="150">Yes (150)</option></select>',
    '<label>VDA master</label><input id="vda" class="n" type="number" min="0" step="any">',
    '<label>Production master</label><input id="production" class="n" type="number" min="0" step="any"></div>',
    '<div><b>Fixed gross (auto sum): <span id="fg">0</span></b></div></fieldset>',
    '<fieldset id="rateBox"><legend>Rate profile</legend>',
    '<label>Pay basis</label><select id="payBasis"><option value="DAILY_RATE">DAILY_RATE</option><option value="MONTHLY_GROSS_PRORATED">MONTHLY_GROSS_PRORATED</option></select>',
    '<label>Daily rate</label><input id="rate" class="n" type="number" min="0" step="any">',
    '<label>Monthly gross</label><input id="monthlyGross" class="n" type="number" min="0" step="any"><br>',
    '<label>OT method</label><select id="otMethod"><option value="">(default for the basis)</option></select></fieldset>',
    '<div><label>Effective from month</label><input id="effectiveMonth" type="month"> <span class="note">Add: blank = month of joining. Revision: required; older rows are kept.</span></div>',
    '<fieldset><legend>Statutory IDs (optional; stored only in the hidden EMPLOYEE_STATUTORY_IDS tab; blank = unchanged)</legend>',
    '<label>UAN</label><input id="uan" class="w" autocomplete="off"><label>ESI number</label><input id="esiNo" class="w" autocomplete="off"><br>',
    '<label>PAN</label><input id="pan" class="w" autocomplete="off"><label>Bank name</label><input id="bankName" class="w" autocomplete="off"><br>',
    '<label>Bank account</label><input id="bankAccount" class="w" autocomplete="off"><label>IFSC</label><input id="ifsc" class="w" autocomplete="off">',
    '<div class="note" id="idsNote"></div></fieldset></div>',
    '<p><button id="save" type="button">Save</button><span class="note">New pay rows stay PENDING (employee on HOLD) until HR runs Payroll &gt; Approve salary structure.</span></p>',
    '<div id="msg"></div>',
    '<script>',
    'var LOADED_CAT="",CFG=null,STAFF=["BASIC","HRA","CONVEYANCE","EDUCATION","MEDICAL","PRO_DEV","COMMUNICATION","UNIFORM","WASHING"],WORKER=["BASIC","HRA","CONVEYANCE","EDUCATION","WASHING"];',
    'function $(i){return document.getElementById(i);}',
    'function say(t,c){var m=$("msg");m.className=c||"";m.textContent=t;}',
    'function fail(e){say(String(e&&e.message?e.message:e),"err");$("save").disabled=false;}',
    'function mode(){return document.querySelector("input[name=mode]:checked").value;}',
    'function cat(){var c=$("category").value;for(var i=0;i<CFG.categories.length;i++)if(CFG.categories[i].code===c)return CFG.categories[i];return null;}',
    'function buildSal(){var c=cat(),w=c&&c.method==="PERMANENT_WORKER",keys=w?WORKER:STAFF,h="";keys.forEach(function(k){h+="<label>"+k+"</label><input class=\\"n sal\\" id=\\"s_"+k+"\\" data-k=\\""+k+"\\" type=\\"number\\" min=\\"0\\" step=\\"any\\"> ";});',
    ' $("salFields").innerHTML=h;$("workerFields").className=w?"":"hidden";Array.prototype.forEach.call(document.querySelectorAll(".sal,#vda,#production,#heat"),function(i){i.oninput=sum;i.onchange=sum;});sum();}',
    'function sum(){var t=0;Array.prototype.forEach.call(document.querySelectorAll(".sal"),function(i){t+=Number(i.value)||0;});',
    ' var c=cat();if(c&&c.method==="PERMANENT_WORKER"){t+=(Number($("heat").value)||0)+(Number($("vda").value)||0)+(Number($("production").value)||0);}$("fg").textContent=Math.round(t*100)/100;}',
    'function layout(){var m=mode(),ex=m==="EXIT";$("exitBox").className=ex?"":"hidden";$("mainBox").className=ex?"hidden":"";var c=cat();',
    ' $("salBox").className=c&&c.rateSource==="RATE_PROFILE"?"hidden":"";$("rateBox").className=c&&c.rateSource==="RATE_PROFILE"?"":"hidden";',
    ' $("siteNote").textContent=c?("Site: "+c.site+" | calc: "+c.method):"";$("empId").readOnly=false;}',
    'function fill(d){$("loaded").textContent=d.exists?("Found: "+d.status+(d.duplicates?" (duplicate rows!)":"")):"Not found";if(!d.exists)return;',
    ' LOADED_CAT=d.category;$("name").value=d.name;$("email").value=d.email;$("category").value=d.category;$("department").value=d.department;$("designation").value=d.designation;$("gender").value=d.gender||"";$("doj").value=d.doj||"";$("lwd").value=d.lastWorkingDay||"";',
    ' layout();buildSal();if(d.pay){var v=d.pay.values;for(var k in v){var e=$("s_"+k)||$(k);if(e)e.value=v[k];}sum();$("loaded").textContent+=" | latest pay row from "+d.pay.effectiveFrom+" ("+(d.pay.approved?"approved":"PENDING")+")";}',
    ' var on=[];for(var f in d.idsOnFile)if(d.idsOnFile[f])on.push(f);$("idsNote").textContent=on.length?("On file: "+on.join(", ")+" (leave blank to keep)"):"";}',
    'function payload(){var p={mode:mode(),empId:$("empId").value,name:$("name").value,email:$("email").value,doj:$("doj").value,category:$("category").value,department:$("department").value,designation:$("designation").value,gender:$("gender").value,site:cat()?cat().site:"",effectiveMonth:$("effectiveMonth").value,',
    ' ids:{uan:$("uan").value,esiNo:$("esiNo").value,pan:$("pan").value,bankName:$("bankName").value,bankAccount:$("bankAccount").value,ifsc:$("ifsc").value}};',
    ' var c=cat(),sendPay=p.mode==="ADD"||!!$("effectiveMonth").value||(LOADED_CAT!==""&&$("category").value!==LOADED_CAT);',
    ' if(sendPay){if(c&&c.rateSource==="RATE_PROFILE"){p.rate={payBasis:$("payBasis").value,rate:$("rate").value,monthlyGross:$("monthlyGross").value,otMethod:$("otMethod").value};}',
    ' else{var s={};Array.prototype.forEach.call(document.querySelectorAll(".sal"),function(i){s[i.getAttribute("data-k")]=i.value;});s.heat=$("heat").value;s.vda=$("vda").value;s.production=$("production").value;p.salary=s;}}return p;}',
    'Array.prototype.forEach.call(document.querySelectorAll("input[name=mode]"),function(r){r.onchange=layout;});',
    '$("category").onchange=function(){layout();buildSal();};',
    '$("lookup").onclick=function(){say("Loading...");google.script.run.withSuccessHandler(function(d){say("");fill(d);}).withFailureHandler(fail).empApiLookup($("empId").value);};',
    '$("save").onclick=function(){$("save").disabled=true;say("Saving...");',
    ' if(mode()==="EXIT"){google.script.run.withSuccessHandler(function(r){$("save").disabled=false;say("Exit saved for "+r.empId+": last working day "+r.lastWorkingDay+" ("+r.status+").\\n"+r.note+(r.rosterRefresh&&!r.rosterRefresh.ok?"\\n"+r.rosterRefresh.note:""),"ok");}).withFailureHandler(fail).empApiExit({empId:$("empId").value,lastWorkingDay:$("lwd").value});return;}',
    ' google.script.run.withSuccessHandler(function(r){$("save").disabled=false;var t=(r.mode==="ADD"?"Added ":"Updated ")+r.empId+" ("+r.category+").";',
    '  if(r.salary)t+="\\nPay row: "+(r.salary.added?"added, effective "+r.salary.effectiveFrom+", PENDING HR approval":r.salary.note);',
    '  if(r.statutoryFieldsWritten)t+="\\nStatutory IDs saved ("+r.statutoryFieldsWritten+" field(s)) in the hidden tab.";',
    '  if(r.pendingHrApproval)t+="\\nThe employee is on HOLD until HR approves the salary structure (Payroll > Approve salary structure).";',
    '  if(r.warnings&&r.warnings.length)t+="\\nWarnings: "+r.warnings.join("; ");',
    '  if(r.rosterRefresh&&!r.rosterRefresh.ok)t+="\\n"+r.rosterRefresh.note;say(t,"ok");}).withFailureHandler(fail).empApiSave(payload());};',
    'google.script.run.withSuccessHandler(function(d){CFG=d;var s=$("category");d.categories.forEach(function(c){var o=document.createElement("option");o.value=c.code;o.textContent=c.name+" ("+c.code+")";s.appendChild(o);});',
    ' var dl=$("depts");d.departments.forEach(function(x){var o=document.createElement("option");o.value=x;dl.appendChild(o);});',
    ' var ot=$("otMethod");d.otMethods.forEach(function(x){var o=document.createElement("option");o.value=x;o.textContent=x;ot.appendChild(o);});layout();buildSal();',
    ' if(window.EMP_START_MODE){var r=document.querySelector("input[name=mode][value="+window.EMP_START_MODE+"]");if(r){r.checked=true;layout();}}}).withFailureHandler(fail).empApiLoad();',
    '</script></body></html>'
  ].join('\n');
}

/** Menu entry: the employee dialog (mode ADD, UPDATE or EXIT preselected). */
function empOpenDialog(startMode) {
  emp_requireUser_();
  var html = empPageHtml_();
  var mode = /^(ADD|UPDATE|EXIT)$/.test(String(startMode)) ? startMode : 'ADD';
  html = html.replace('<script>', '<script>window.EMP_START_MODE=' + JSON.stringify(mode) + ';');
  var out = HtmlService.createHtmlOutput(html).setWidth(900).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(out, mode === 'EXIT' ? 'Mark employee exit' : 'Add or update employee');
  return null;
}

/** google.script.run: page data (categories, departments). */
function empApiLoad() { return JSON.parse(JSON.stringify(empLoad())); }
/** google.script.run: lookup (never returns statutory ID values). */
function empApiLookup(empId) { return JSON.parse(JSON.stringify(empLookup(empId))); }

function emp_locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return JSON.parse(JSON.stringify(fn())); } finally { lock.releaseLock(); }
}
/** google.script.run: save, serialised with the script lock. The result never contains statutory ID values. */
function empApiSave(payload) { return emp_locked_(function () { return empSave(payload); }); }
/** google.script.run: exit. */
function empApiExit(payload) { return emp_locked_(function () { return empMarkExit((payload || {}).empId, (payload || {}).lastWorkingDay); }); }
