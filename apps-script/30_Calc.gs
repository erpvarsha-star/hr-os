/**
 * 30_Calc.gs - pure payroll calculation (DESIGN.md section 5 and 6).
 * No SpreadsheetApp / Utilities usage. Global scope, Apps Script V8 style.
 * Internal helpers are prefixed calc_ to avoid collisions with other files.
 */

var CALC_VERSION = 'CALC-1.0';

var OUTPUT_COLUMNS = [
  'RUN_ID', 'PERIOD', 'POPULATION', 'EMP_ID', 'EMPLOYEE_NAME', 'DEPARTMENT', 'DESIGNATION',
  'WORKING_DAYS', 'PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WO_DAYS', 'PH_DAYS', 'EL', 'CL', 'SL',
  'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS', 'WORKED_PAYABLE_DAYS', 'FIXED_GROSS', 'PAY_BASIS', 'RATE',
  'BASIC', 'HRA', 'CONVEYANCE', 'EDUCATION', 'MEDICAL', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'WASHING',
  'HEAT', 'VDA', 'PRODUCTION_ALLOWANCE', 'GROSS_EARNINGS', 'OT_HOURS', 'OT_AMOUNT', 'ARREARS',
  'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT', 'PRODUCTION_INCENTIVE', 'OT_EXTRA_WORK',
  'TOTAL_EARNINGS', 'PF_EMPLOYEE', 'ESI_EMPLOYEE', 'PT', 'MLWF', 'CANTEEN', 'SOCIETY', 'ADVANCE', 'TDS',
  'EFFICIENCY_PCT', 'EFFICIENCY_ELIGIBLE_AMOUNT', 'EFFICIENCY_DEDUCTION', 'OTHER_DEDUCTION',
  'TOTAL_DEDUCTIONS', 'NET_PAY', 'EMPLOYER_PF', 'EMPLOYER_ESI', 'BONUS_PROVISION', 'GRATUITY_PROVISION',
  'FLAGS', 'CALC_VERSION', 'CALCULATED_AT'
];

var CALC_EARNING_TYPES = ['ARREARS', 'DISPATCH_INCENTIVE', 'OTHER_ALLOWANCE', 'LEAVE_ENCASHMENT', 'OT_EXTRA_WORK', 'PRODUCTION_INCENTIVE'];
var CALC_DEDUCTION_TYPES = ['TDS', 'OTHER_DEDUCTION', 'PENALTY', 'CANTEEN_EXTRA'];

var CALC_STAFF_COMPONENTS = ['BASIC', 'HRA', 'CONVEYANCE', 'MEDICAL', 'EDUCATION', 'PRO_DEV', 'COMMUNICATION', 'UNIFORM', 'WASHING'];

var CALC_COMMON_STATUTORY = ['PF_WAGE_CEILING', 'PF_EMPLOYEE_RATE', 'PF_MAX_EMPLOYEE', 'ESI_EMPLOYEE_RATE',
  'ESI_EXEMPT_ABOVE', 'ESI_EMPLOYER_RATE', 'PT_SLABS', 'PT_FEB_AMOUNT', 'MLWF_MONTHS', 'MLWF_EMPLOYEE_RATE'];

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

function calc_isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** blank -> 0 ; numeric (number or numeric string) -> number ; anything else -> NaN */
function calc_num(v) {
  if (calc_isBlank(v)) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    var s = v.replace(/,/g, '').trim();
    if (s === '' || isNaN(Number(s))) return NaN;
    return Number(s);
  }
  return NaN;
}

function calc_monthNames_() {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
}

/** 'Feb' | 'February' | 'YYYY-MM' | 2 -> month number 1..12 (0 if unknown) */
function calc_monthNum(m) {
  if (typeof m === 'number') return (m >= 1 && m <= 12) ? m : 0;
  var s = String(m === null || m === undefined ? '' : m).trim();
  var mm = /^\d{4}-(\d{1,2})/.exec(s);
  if (mm) return Number(mm[1]);
  var idx = calc_monthNames_().indexOf(s.substring(0, 3).toLowerCase());
  return idx >= 0 ? idx + 1 : 0;
}

function calc_monthNameFromPeriod(period) {
  var n = calc_monthNum(period);
  if (!n) return '';
  var nm = calc_monthNames_()[n - 1];
  return nm.charAt(0).toUpperCase() + nm.substring(1);
}

/** Date | 'YYYY-MM' | 'YYYY-MM-DD' -> 'YYYY-MM' ('' if blank/unparseable) */
function calc_periodKey(v) {
  if (calc_isBlank(v)) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var mo = v.getMonth() + 1;
    return v.getFullYear() + '-' + (mo < 10 ? '0' + mo : '' + mo);
  }
  var m = /^(\d{4})-(\d{1,2})/.exec(String(v).trim());
  if (!m) return '';
  return m[1] + '-' + (Number(m[2]) < 10 ? '0' + Number(m[2]) : m[2]);
}

function calc_ex_(list, severity, code, message) {
  list.push({ severity: severity, code: code, message: message });
}

function calc_hasBlocker_(list) {
  for (var i = 0; i < list.length; i++) if (list[i].severity === 'BLOCKER') return true;
  return false;
}

function calc_setHas_(set, id) {
  if (!set) return false;
  if (typeof set.has === 'function') return set.has(id);
  if (Array.isArray(set)) return set.indexOf(id) >= 0;
  if (typeof set === 'object') return set[id] === true || set[id] === 1;
  return false;
}

/** Google Sheets ROUND semantics (half away from zero) with float-noise guard. */
function roundSheets(x, digits) {
  if (typeof x !== 'number' || !isFinite(x)) return x;
  var d = digits || 0;
  var p = Math.pow(10, d);
  var a = Math.abs(x) * p;
  var r = Math.floor(a + 0.5 + 1e-9) / p;
  if (r === 0) return 0;
  return x < 0 ? -r : r;
}

function calc_r2_(x) { return roundSheets(x, 2); }

/* ------------------------------------------------------------------ */
/* Statutory configuration                                             */
/* ------------------------------------------------------------------ */

function requiredStatutoryKeys(population) {
  var common = CALC_COMMON_STATUTORY.slice();
  if (population === 'STAFF') {
    return common.concat(['STAFF_OT_MULTIPLIER', 'STAFF_PF_WAGE_COMPONENTS', 'STAFF_COMPONENT_PCTS',
      'EMPLOYER_PF_RATE_STAFF', 'BONUS_RATE_STAFF', 'GRATUITY_RATE_STAFF']);
  }
  if (population === 'PERMANENT_WORKER') {
    return common.concat(['WORKER_VDA_RATE', 'WORKER_HEAT_RATE', 'WORKER_OT_MULTIPLIER',
      'EMPLOYER_PF_RATE_WORKER', 'BONUS_RATE_WORKER', 'GRATUITY_RATE_WORKER']);
  }
  return [];
}

function calc_parseStatutoryValue_(key, raw) {
  if (key === 'PT_SLABS' || key === 'STAFF_COMPONENT_PCTS') {
    if (typeof raw === 'object' && raw !== null) return raw;
    return JSON.parse(String(raw));
  }
  if (key === 'MLWF_MONTHS') {
    if (typeof raw === 'number') return [raw];
    return String(raw).split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ''; }).map(Number);
  }
  if (key === 'STAFF_PF_WAGE_COMPONENTS') {
    return String(raw).split(',').map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return s !== ''; });
  }
  if (typeof raw === 'number') return raw;
  var s2 = String(raw).trim();
  if (s2 !== '' && !isNaN(Number(s2))) return Number(s2);
  return s2;
}

/**
 * Per key, the STATUTORY_CONFIG row that applies to the period: effective (EFFECTIVE_FROM <= period, EFFECTIVE_TO
 * blank or >= period), non-blank KEY and VALUE, highest VERSION (first row among equals).
 * Returns {KEY: {ver, raw, row, approved}}; approved = APPROVED_BY is not blank.
 */
function calc_statutoryWinners_(configRows, period) {
  var p = calc_periodKey(period);
  var best = {};
  (configRows || []).forEach(function (r) {
    if (!r || calc_isBlank(r.KEY) || calc_isBlank(r.VALUE)) return;
    var from = calc_periodKey(r.EFFECTIVE_FROM);
    var to = calc_periodKey(r.EFFECTIVE_TO);
    if (from && p < from) return;
    if (to && p > to) return;
    var ver = calc_isBlank(r.VERSION) ? 0 : Number(r.VERSION);
    if (isNaN(ver)) ver = 0;
    var key = String(r.KEY).trim();
    if (!best[key] || ver > best[key].ver) best[key] = { ver: ver, raw: r.VALUE, row: r, approved: !calc_isBlank(r.APPROVED_BY) };
  });
  return best;
}

/**
 * configRows: [{KEY, VALUE, EFFECTIVE_FROM, EFFECTIVE_TO, VERSION, APPROVED_BY}]
 * Returns {values, missing, invalid, unapproved}. `missing` / `unapproved` are computed for `population` when given,
 * else for the union of STAFF and PERMANENT_WORKER keys. unapproved = required keys whose applicable row has a blank
 * APPROVED_BY (sheet rules R11 / R27: no statutory value is used before Accounts signs it).
 */
function resolveStatutory(configRows, period, population) {
  var best = calc_statutoryWinners_(configRows, period);
  var values = {};
  var invalid = [];
  Object.keys(best).forEach(function (k) {
    try {
      values[k] = calc_parseStatutoryValue_(k, best[k].raw);
    } catch (e) {
      invalid.push(k);
    }
  });
  var req = population ? requiredStatutoryKeys(population)
    : requiredStatutoryKeys('STAFF').concat(requiredStatutoryKeys('PERMANENT_WORKER'));
  var seen = {};
  var missing = [], unapproved = [];
  req.forEach(function (k) {
    if (seen[k]) return;
    seen[k] = true;
    if (values[k] === undefined) missing.push(k);
    else if (!best[k].approved) unapproved.push(k);
  });
  return { values: values, missing: missing, invalid: invalid, unapproved: unapproved };
}

/** PAYROLL_RATE_PROFILE row approved by the user as the July 2026 proxy (VERSION_STATE USER_APPROVED_JULY_PROXY) - R28. */
function calc_isProxyRate(rateRow) {
  return !!rateRow && /PROXY/i.test(String(rateRow.VERSION_STATE == null ? '' : rateRow.VERSION_STATE));
}

/** Rate profile approval: blank VERSION_STATE = no gate; any state containing APPROVED (not UNAPPROVED) counts as approved. */
function calc_isRateApproved(rateRow) {
  var st = String(rateRow && rateRow.VERSION_STATE != null ? rateRow.VERSION_STATE : '').trim().toUpperCase();
  if (!st) return true;
  return /(^|[^A-Z])APPROVED/.test(st);
}

/* ------------------------------------------------------------------ */
/* PT, efficiency                                                      */
/* ------------------------------------------------------------------ */

/** GENDER cell (M / F / Male / Female, any case) -> 'M' | 'F' | '' (blank or unrecognised: never guessed). */
function normalizeGender(v) {
  var t = String(v == null ? '' : v).trim().toUpperCase();
  if (t === 'F' || t === 'FEMALE') return 'F';
  if (t === 'M' || t === 'MALE') return 'M';
  return '';
}

/** True when the Maharashtra women's PT exemption applies: GENDER F, PT_WOMEN_EXEMPT_UPTO configured, basis 0 < amount <= limit. */
function ptWomenExempt(grossForPt, gender, cfg) {
  var g = Number(grossForPt), lim = cfg ? Number(cfg.PT_WOMEN_EXEMPT_UPTO) : NaN;
  if (cfg == null || cfg.PT_WOMEN_EXEMPT_UPTO === undefined || cfg.PT_WOMEN_EXEMPT_UPTO === null || cfg.PT_WOMEN_EXEMPT_UPTO === '') return false;
  return normalizeGender(gender) === 'F' && isFinite(lim) && isFinite(g) && g > 0 && g <= lim;
}

/** PT per DESIGN 5.1: 0 if gross 0, exempt (PT_EXEMPTIONS) or a woman up to PT_WOMEN_EXEMPT_UPTO; Feb flat; else slab on the given gross. */
function ptAmount(grossForPt, monthName, empId, cfg, ptExemptSet, gender) {
  var g = Number(grossForPt);
  if (!isFinite(g) || g <= 0) return 0;
  if (calc_setHas_(ptExemptSet, empId)) return 0;
  if (ptWomenExempt(g, gender, cfg)) return 0;
  if (calc_monthNum(monthName) === 2) return Number(cfg.PT_FEB_AMOUNT);
  var slabs = (cfg.PT_SLABS || []).slice().sort(function (a, b) { return a.min - b.min; });
  for (var i = 0; i < slabs.length; i++) {
    if (slabs[i].max === null || slabs[i].max === undefined || g <= slabs[i].max) return Number(slabs[i].pt);
  }
  return slabs.length ? Number(slabs[slabs.length - 1].pt) : 0;
}

/** INFO exception when PT is 0 only because of the women's exemption (not when a PT_EXEMPTIONS row already exempts the employee). */
function calc_ptInfo_(ex, ctx, basis, empId, cfg) {
  if (calc_setHas_(ctx.ptExemptSet, empId)) return;
  if (ptWomenExempt(basis, (ctx.emp || {}).GENDER, cfg)) {
    calc_ex_(ex, 'INFO', 'PT_WOMEN_EXEMPT', 'PT 0: female employee, PT basis ' + calc_r2_(Number(basis)) + ' <= ' + cfg.PT_WOMEN_EXEMPT_UPTO);
  }
}

/** Slab amount for floor(pct): highest configured percent <= floor(pct); none -> 0 (<81), >85 -> the 85 slab. It is the amount PAID (no deduction, no proration). */
function efficiencySlab(pct, efficiencyConfigRows) {
  var p = Number(pct);
  if (calc_isBlank(pct) || !isFinite(p)) return null;
  var f = Math.floor(p + 1e-9);
  var rows = (efficiencyConfigRows || []).map(function (r) {
    return { pct: Number(r.EFFICIENCY_PERCENT_EXACT), amt: Number(r.INCENTIVE_SLAB_INR) };
  }).filter(function (r) { return isFinite(r.pct) && isFinite(r.amt); })
    .sort(function (a, b) { return a.pct - b.pct; });
  var amount = 0;
  for (var i = 0; i < rows.length; i++) if (rows[i].pct <= f) amount = rows[i].amt;
  return amount;
}

/* ------------------------------------------------------------------ */
/* Adjustments aggregation                                             */
/* ------------------------------------------------------------------ */

/**
 * rows: INPUT_ADJUSTMENTS rows {PAYROLL_MONTH, EMP_ID, ADJUSTMENT_TYPE, SIGNED_AMOUNT_INR, APPROVAL_STATUS}.
 * Returns {ARREARS..CANTEEN_EXTRA (numbers), exceptions: [...]}.
 */
function aggregateAdjustments(rows, period, empId) {
  var out = {};
  CALC_EARNING_TYPES.concat(CALC_DEDUCTION_TYPES).forEach(function (t) { out[t] = 0; });
  var exceptions = [];
  var p = calc_periodKey(period);
  (rows || []).forEach(function (r) {
    if (!r || String(r.EMP_ID).trim() !== String(empId).trim()) return;
    if (calc_periodKey(r.PAYROLL_MONTH) !== p) return;
    if (String(r.APPROVAL_STATUS || '').trim().toUpperCase() !== 'APPROVED') return;
    var type = String(r.ADJUSTMENT_TYPE || '').trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(out, type)) {
      calc_ex_(exceptions, 'WARN', 'UNKNOWN_ADJUSTMENT_TYPE',
        'Approved adjustment with unknown type "' + r.ADJUSTMENT_TYPE + '" ignored for ' + empId);
      return;
    }
    var amt = calc_num(r.SIGNED_AMOUNT_INR);
    if (isNaN(amt) || calc_isBlank(r.SIGNED_AMOUNT_INR)) {
      calc_ex_(exceptions, 'BLOCKER', 'INVALID_ADJUSTMENT_AMOUNT',
        'Approved adjustment ' + type + ' for ' + empId + ' has a non-numeric amount');
      return;
    }
    out[type] += amt;
  });
  out.exceptions = exceptions;
  return out;
}

/* ------------------------------------------------------------------ */
/* Words / hash                                                        */
/* ------------------------------------------------------------------ */

var CALC_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
var CALC_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function calc_below100_(n) {
  if (n < 20) return CALC_ONES[n];
  return CALC_TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + CALC_ONES[n % 10] : '');
}

function calc_wordsIndian_(n) {
  var parts = [];
  var crore = Math.floor(n / 10000000); n = n % 10000000;
  var lakh = Math.floor(n / 100000); n = n % 100000;
  var thousand = Math.floor(n / 1000); n = n % 1000;
  var hundred = Math.floor(n / 100); n = n % 100;
  if (crore) parts.push(calc_wordsIndian_(crore) + ' Crore');
  if (lakh) parts.push(calc_below100_(lakh) + ' Lakh');
  if (thousand) parts.push(calc_below100_(thousand) + ' Thousand');
  if (hundred) parts.push(CALC_ONES[hundred] + ' Hundred');
  if (n) parts.push(calc_below100_(n));
  return parts.join(' ');
}

function amountToIndianWords(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  var neg = n < 0;
  var v = roundSheets(Math.abs(n));
  if (v === 0) return 'Zero Rupees Only';
  return (neg ? 'Minus ' : '') + calc_wordsIndian_(v) + ' Rupees Only';
}

/** Canonical string of rows sorted by EMP_ID, excluding RUN_ID and CALCULATED_AT; hashed via injected sha256Fn. */
function hashRows(rows, columns, sha256Fn) {
  var cols = (columns || OUTPUT_COLUMNS).filter(function (c) { return c !== 'RUN_ID' && c !== 'CALCULATED_AT'; });
  var sorted = (rows || []).slice().sort(function (a, b) {
    var x = String(a.EMP_ID), y = String(b.EMP_ID);
    if (x < y) return -1;
    if (x > y) return 1;
    var px = String(a.POPULATION || ''), py = String(b.POPULATION || '');
    return px < py ? -1 : (px > py ? 1 : 0);
  });
  var lines = [cols.join('|')];
  sorted.forEach(function (r) {
    lines.push(cols.map(function (c) {
      var v = r[c];
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return String(roundSheets(v, 6));
      return String(v).replace(/[\r\n|]/g, ' ');
    }).join('|'));
  });
  return sha256Fn(lines.join('\n'));
}

/* ------------------------------------------------------------------ */
/* Shared calc plumbing                                                */
/* ------------------------------------------------------------------ */

/** Built-in category code -> calc method, used when the caller (a test, or the engine before config) gives no ctx.method. */
var CALC_DEFAULT_METHODS = { STAFF: 'STAFF', PERMANENT_WORKER: 'PERMANENT_WORKER', CONSULTANT: 'CONSULTANT', PUNE_STAFF: 'PUNE_STAFF' };

/** ctx.method (the CALC_METHOD of the category, set by the engine) or the built-in method of the population code. */
function calc_methodOf_(ctx) {
  if (ctx && ctx.method) return String(ctx.method).trim().toUpperCase();
  var p = ctx && ctx.population ? String(ctx.population).trim() : '';
  return Object.prototype.hasOwnProperty.call(CALC_DEFAULT_METHODS, p) ? CALC_DEFAULT_METHODS[p] : '';
}

/** The output ROW's POPULATION is the category code (ctx.population); falls back to the method name. */
function calc_newRow_(ctx, method) {
  var row = {};
  OUTPUT_COLUMNS.forEach(function (c) { row[c] = null; });
  var emp = ctx.emp || {};
  row.PERIOD = ctx.period;
  row.POPULATION = ctx.population || method;
  row.EMP_ID = emp.EMP_ID === undefined ? null : emp.EMP_ID;
  row.EMPLOYEE_NAME = emp.EMPLOYEE_NAME === undefined ? null : emp.EMPLOYEE_NAME;
  row.DEPARTMENT = emp.DEPARTMENT === undefined ? null : emp.DEPARTMENT;
  row.DESIGNATION = emp.DESIGNATION === undefined ? null : emp.DESIGNATION;
  row.CALC_VERSION = CALC_VERSION;
  return row;
}

/**
 * Reads and validates attendance/feeds/adjustments. Writes attendance columns onto row.
 * Returns plain numbers (0 for blank), pp = null if blank.
 */
function calc_readInputs_(ctx, method, row, ex) {
  var population = ctx.population || method;
  var att = ctx.attendance || {};
  var adj = ctx.adjustments || {};
  var inp = {};

  function read(label, v, allowNegative) {
    var n = calc_num(v);
    if (isNaN(n)) {
      calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', label + ' is not a number');
      return 0;
    }
    if (n < 0 && !allowNegative) {
      calc_ex_(ex, 'BLOCKER', 'NEGATIVE_INPUT', label + ' is negative');
      return 0;
    }
    return n;
  }

  var wd = calc_num(ctx.workingDays);
  if (calc_isBlank(ctx.workingDays) || isNaN(wd) || wd <= 0) {
    calc_ex_(ex, 'BLOCKER', 'INVALID_WORKING_DAYS', 'WORKING_DAYS must be a positive number for ' + population);
    wd = 0;
  }
  inp.wd = wd;
  inp.present = read('PRESENT_DAYS', att.PRESENT_DAYS);
  inp.pp = calc_isBlank(att.PHYSICAL_PRESENT_DAYS) ? null : read('PHYSICAL_PRESENT_DAYS', att.PHYSICAL_PRESENT_DAYS);
  inp.wo = read('WEEK_OFF', att.WEEK_OFF);
  inp.ph = read('PH', att.PH);
  inp.el = read('EL_AVAILED', att.EL_AVAILED);
  inp.cl = read('CL_AVAILED', att.CL_AVAILED);
  inp.sl = read('SL_AVAILED', att.SL_AVAILED);
  inp.plo = read('PAID_LEAVE_OTHER', att.PAID_LEAVE_OTHER);
  inp.lwp = read('ABSENT_LWP_DAYS', att.ABSENT_LWP_DAYS);
  inp.ot = read('OT_HOURS', ctx.otHours);
  inp.canteen = read('CANTEEN', ctx.canteen);
  inp.society = read('SOCIETY', ctx.society);
  inp.advance = read('ADVANCE', ctx.advance);
  var types = CALC_EARNING_TYPES.concat(CALC_DEDUCTION_TYPES);
  types.forEach(function (t) { inp[t] = read('ADJUSTMENT ' + t, adj[t], true); });

  inp.w = inp.present + inp.ph + inp.el + inp.cl + inp.sl + inp.plo + (method === 'PERMANENT_WORKER' ? 0 : inp.wo);

  row.WORKING_DAYS = wd || null;
  row.PRESENT_DAYS = inp.present;
  row.PHYSICAL_PRESENT_DAYS = inp.pp;
  row.WO_DAYS = inp.wo;
  row.PH_DAYS = inp.ph;
  row.EL = inp.el;
  row.CL = inp.cl;
  row.SL = inp.sl;
  row.PAID_LEAVE_OTHER = inp.plo;
  row.ABSENT_LWP_DAYS = inp.lwp;
  row.WORKED_PAYABLE_DAYS = inp.w;

  if (wd > 0 && inp.w > wd) {
    if (method === 'PERMANENT_WORKER') {
      calc_ex_(ex, 'BLOCKER', 'WORKED_EXCEEDS_WORKING_DAYS', 'Worked days ' + inp.w + ' exceed working days ' + wd);
    } else {
      calc_ex_(ex, 'WARN', 'WORKED_EXCEEDS_WORKING_DAYS', 'Worked days ' + inp.w + ' exceed working days ' + wd);
    }
  }
  return inp;
}

function calc_checkCfg_(method, cfg, ex) {
  var missing = requiredStatutoryKeys(method).filter(function (k) {
    return !cfg || cfg[k] === undefined || cfg[k] === null;
  });
  if (missing.length) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_STATUTORY_KEY', 'Missing statutory keys: ' + missing.join(', '));
  }
}

function calc_writeAdjustments_(row, inp) {
  row.OT_HOURS = inp.ot;
  row.ARREARS = inp.ARREARS;
  row.DISPATCH_INCENTIVE = inp.DISPATCH_INCENTIVE;
  row.OTHER_ALLOWANCE = inp.OTHER_ALLOWANCE;
  row.LEAVE_ENCASHMENT = inp.LEAVE_ENCASHMENT;
  row.PRODUCTION_INCENTIVE = inp.PRODUCTION_INCENTIVE;
  row.OT_EXTRA_WORK = inp.OT_EXTRA_WORK;
  row.CANTEEN = inp.canteen;
  row.SOCIETY = inp.society;
  row.ADVANCE = inp.advance;
  row.TDS = inp.TDS;
  row.OTHER_DEDUCTION = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA;
}

function calc_finalize_(row, ex) {
  var bad = [];
  OUTPUT_COLUMNS.forEach(function (c) {
    if (typeof row[c] === 'number' && !isFinite(row[c])) { row[c] = null; bad.push(c); }
  });
  if (bad.length) calc_ex_(ex, 'BLOCKER', 'NON_FINITE_VALUE', 'Non-finite values in: ' + bad.join(', '));
  if (typeof row.NET_PAY === 'number' && row.NET_PAY < 0) {
    calc_ex_(ex, 'BLOCKER', 'NEGATIVE_NET_PAY', 'Net pay is negative (' + row.NET_PAY + ')');
  }
  var otherBlocker = ex.some(function (e) { return e.severity === 'BLOCKER' && e.code !== 'NEGATIVE_NET_PAY'; });
  if (otherBlocker) row.NET_PAY = null;
  var seen = {};
  var codes = [];
  ex.forEach(function (e) { if (!seen[e.code]) { seen[e.code] = true; codes.push(e.code); } });
  row.FLAGS = codes.join(';');
  return { row: row, exceptions: ex };
}

/* Shared PF / statutory pieces */
function calc_pf_(wage, cfg, rate) {
  return wage <= cfg.PF_WAGE_CEILING ? wage * rate : cfg.PF_MAX_EMPLOYEE;
}

function calc_mlwf_(period, cfg) {
  var m = calc_monthNum(period);
  return (cfg.MLWF_MONTHS || []).indexOf(m) >= 0 ? Number(cfg.MLWF_EMPLOYEE_RATE) : 0;
}

/* ------------------------------------------------------------------ */
/* STAFF                                                               */
/* ------------------------------------------------------------------ */

function calcStaff(ctx) {
  var ex = [];
  var row = calc_newRow_(ctx, 'STAFF');
  var cfg = ctx.cfg || {};
  var inp = calc_readInputs_(ctx, 'STAFF', row, ex);
  calc_checkCfg_('STAFF', cfg, ex);
  var s = ctx.salary;
  var fg = 0, basicPm = 0, zeroPay = false;
  if (!s) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_SALARY_STRUCTURE', 'No SALARY_STRUCTURE row');
  } else {
    fg = calc_num(s.FIXED_GROSS_PM_AS_SOURCE_INR);
    basicPm = calc_num(s.BASIC_PM_INR);
    if (!isNaN(fg) && fg === 0 && ctx.zeroPayAllowed) {
      zeroPay = true; // ZERO_PAY_ALLOWED_EMP_IDS: zero salary is intentional, a normal all-zero row
    } else if (isNaN(fg) || fg <= 0) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_SALARY_STRUCTURE', 'Fixed gross is zero or invalid');
      fg = 0;
    }
    if (isNaN(basicPm)) { calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', 'BASIC_PM_INR is not a number'); basicPm = 0; }
    if (inp.ot > 0 && basicPm <= 0) calc_ex_(ex, 'BLOCKER', 'MISSING_BASIC_FOR_OT', 'OT hours present but BASIC_PM_INR is zero');
  }
  var pcts = cfg.STAFF_COMPONENT_PCTS || {};
  if (cfg.STAFF_COMPONENT_PCTS) {
    CALC_STAFF_COMPONENTS.forEach(function (c) {
      if (typeof pcts[c] !== 'number' || !isFinite(pcts[c])) {
        calc_ex_(ex, 'BLOCKER', 'MISSING_COMPONENT_PCT', 'STAFF_COMPONENT_PCTS lacks ' + c);
      }
    });
  }
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var wd = inp.wd, w = inp.w;
  var gross = fg * w / wd;
  var earned = {};
  CALC_STAFF_COMPONENTS.forEach(function (c) { earned[c] = roundSheets(gross * pcts[c]); row[c] = earned[c]; });

  var pfWage = 0;
  (cfg.STAFF_PF_WAGE_COMPONENTS || []).forEach(function (c) {
    if (earned[c] === undefined) calc_ex_(ex, 'BLOCKER', 'UNKNOWN_PF_COMPONENT', 'Unknown PF wage component ' + c);
    else pfWage += earned[c];
  });
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var ot = (basicPm / wd / 8) * Number(cfg.STAFF_OT_MULTIPLIER) * inp.ot;
  var pf = calc_pf_(pfWage, cfg, Number(cfg.PF_EMPLOYEE_RATE));
  var esi = fg <= cfg.ESI_EXEMPT_ABOVE ? roundSheets(fg * cfg.ESI_EMPLOYEE_RATE / wd * w) : 0;
  var pt = ptAmount(gross, calc_monthNameFromPeriod(ctx.period), row.EMP_ID, cfg, ctx.ptExemptSet, (ctx.emp || {}).GENDER);
  calc_ptInfo_(ex, ctx, gross, row.EMP_ID, cfg);
  var mlwf = zeroPay ? 0 : calc_mlwf_(ctx.period, cfg);
  var otherDed = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA;
  var ded = pf + esi + pt + inp.canteen + inp.society + inp.advance + inp.TDS + mlwf + otherDed;
  var extras = inp.ARREARS + inp.DISPATCH_INCENTIVE + inp.OTHER_ALLOWANCE + inp.LEAVE_ENCASHMENT +
    inp.PRODUCTION_INCENTIVE + inp.OT_EXTRA_WORK;
  var totalEarn = gross + ot + extras;

  calc_writeAdjustments_(row, inp);
  row.FIXED_GROSS = fg;
  row.GROSS_EARNINGS = calc_r2_(gross);
  row.OT_AMOUNT = calc_r2_(ot);
  row.TOTAL_EARNINGS = calc_r2_(totalEarn);
  row.PF_EMPLOYEE = calc_r2_(pf);
  row.ESI_EMPLOYEE = esi;
  row.PT = pt;
  row.MLWF = mlwf;
  row.TOTAL_DEDUCTIONS = calc_r2_(ded);
  row.NET_PAY = roundSheets(gross - ded + ot + extras);
  row.EMPLOYER_PF = roundSheets(calc_pf_(pfWage, cfg, Number(cfg.EMPLOYER_PF_RATE_STAFF)));
  row.EMPLOYER_ESI = fg <= cfg.ESI_EXEMPT_ABOVE ? roundSheets(fg * cfg.ESI_EMPLOYER_RATE / wd * w) : 0;
  row.BONUS_PROVISION = roundSheets(earned.BASIC * cfg.BONUS_RATE_STAFF);
  row.GRATUITY_PROVISION = roundSheets(earned.BASIC * cfg.GRATUITY_RATE_STAFF);
  return calc_finalize_(row, ex);
}

/* ------------------------------------------------------------------ */
/* PERMANENT_WORKER                                                    */
/* ------------------------------------------------------------------ */

function calcWorker(ctx) {
  var ex = [];
  var row = calc_newRow_(ctx, 'PERMANENT_WORKER');
  var cfg = ctx.cfg || {};
  var inp = calc_readInputs_(ctx, 'PERMANENT_WORKER', row, ex);
  calc_checkCfg_('PERMANENT_WORKER', cfg, ex);
  var s = ctx.salary;
  var m = {};
  var fg = 0;
  if (!s) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_SALARY_STRUCTURE', 'No SALARY_STRUCTURE row');
  } else {
    var keys = { BASIC: 'BASIC_PM_INR', HRA: 'HRA_PM_INR', CONVEYANCE: 'CONVEYANCE_PM_INR', WASHING: 'WASHING_PM_INR',
      EDUCATION: 'EDUCATION_PM_INR', HEAT: 'HEAT_MASTER_INR', VDA: 'VDA_MASTER_INR', PRODUCTION: 'PRODUCTION_MASTER_INR' };
    Object.keys(keys).forEach(function (k) {
      var n = calc_num(s[keys[k]]);
      if (isNaN(n) || n < 0) { calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', keys[k] + ' is invalid'); n = 0; }
      m[k] = n;
    });
    fg = calc_num(s.FIXED_GROSS_PM_AS_SOURCE_INR);
    if (isNaN(fg) || fg < 0) { calc_ex_(ex, 'BLOCKER', 'INVALID_NUMBER', 'FIXED_GROSS_PM_AS_SOURCE_INR is invalid'); fg = 0; }
    if (!ex.length && m.BASIC + m.HRA + m.CONVEYANCE + m.WASHING + m.EDUCATION <= 0) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_SALARY_STRUCTURE', 'All worker master components are zero');
    }
  }
  if (inp.pp === null) calc_ex_(ex, 'BLOCKER', 'MISSING_PHYSICAL_PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS is required for VDA');

  // Production (efficiency) pay = the slab amount for floor(pct) from EFFICIENCY_CONFIG: <81 -> 0, 81..85 -> slab,
  // >85 -> the 85 slab. It is an earning; there is NO deduction and NO proration. No % submitted -> 0 + WARN.
  var pct = ctx.efficiencyPct;
  var pctNum = calc_isBlank(pct) ? NaN : calc_num(pct);
  var pctMissing = calc_isBlank(pct);
  if (pctMissing) {
    calc_ex_(ex, 'WARN', 'EFFICIENCY_NOT_SUBMITTED', 'No efficiency % submitted: production allowance is 0');
  } else {
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      calc_ex_(ex, 'BLOCKER', 'INVALID_EFFICIENCY_PCT', 'Efficiency % must be between 0 and 100');
    }
    if (!ctx.efficiencyConfig || !ctx.efficiencyConfig.length) {
      calc_ex_(ex, 'BLOCKER', 'MISSING_EFFICIENCY_CONFIG', 'EFFICIENCY_CONFIG is empty');
    }
  }
  if (ctx.physicalDaysSource === 'EFFICIENCY_OVERRIDE') {
    calc_ex_(ex, 'WARN', 'PHYSICAL_DAYS_FROM_EFFICIENCY_FORM', 'PHYSICAL_PRESENT_DAYS taken from the efficiency form override');
  }
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var wd = inp.wd, w = inp.w, pp = inp.pp;
  var basic = roundSheets(m.BASIC / wd * w);
  var hra = roundSheets(m.HRA / wd * w);
  var conv = roundSheets(m.CONVEYANCE / wd * w);
  var wash = roundSheets(m.WASHING / wd * w);
  var edu = roundSheets(m.EDUCATION / wd * w);
  var heat = m.HEAT === 150 ? roundSheets(w * cfg.WORKER_HEAT_RATE) : 0;
  var vda = roundSheets(cfg.WORKER_VDA_RATE * pp);
  var eligible = pctMissing ? 0 : efficiencySlab(pctNum, ctx.efficiencyConfig);
  var prod = eligible;
  var ap = basic + hra + conv + wash + edu;
  // OT rate uses the CURRENT VDA rate (WORKER_VDA_RATE per day) x working days, not the master's monthly VDA
  var ot = ((m.BASIC + Number(cfg.WORKER_VDA_RATE) * wd) / wd / 8) * Number(cfg.WORKER_OT_MULTIPLIER) * inp.ot;
  var extras = inp.DISPATCH_INCENTIVE + inp.OTHER_ALLOWANCE + inp.LEAVE_ENCASHMENT + inp.ARREARS +
    inp.PRODUCTION_INCENTIVE + inp.OT_EXTRA_WORK;
  var totalEarn = roundSheets(ap + heat + vda + prod + ot + extras);

  var pfWage = basic + vda;
  var pf = roundSheets(calc_pf_(pfWage, cfg, Number(cfg.PF_EMPLOYEE_RATE)));
  var esiApplies = fg <= cfg.ESI_EXEMPT_ABOVE;
  var esi = esiApplies ? roundSheets(fg * cfg.ESI_EMPLOYEE_RATE / wd * w) : 0;
  if (esi > 0) calc_ex_(ex, 'WARN', 'WORKER_ESI_BASIS_UNCONFIRMED', 'Worker ESI basis (fixed gross) is unconfirmed');
  var pt = ptAmount(totalEarn, calc_monthNameFromPeriod(ctx.period), row.EMP_ID, cfg, ctx.ptExemptSet, (ctx.emp || {}).GENDER);
  calc_ptInfo_(ex, ctx, totalEarn, row.EMP_ID, cfg);
  var mlwf = calc_mlwf_(ctx.period, cfg);
  var otherDed = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA;
  var ded = pf + esi + pt + inp.canteen + inp.society + inp.advance + mlwf + inp.TDS + otherDed;

  calc_writeAdjustments_(row, inp);
  row.FIXED_GROSS = fg;
  row.BASIC = basic; row.HRA = hra; row.CONVEYANCE = conv; row.WASHING = wash; row.EDUCATION = edu;
  row.MEDICAL = 0; row.PRO_DEV = 0; row.COMMUNICATION = 0; row.UNIFORM = 0;
  row.HEAT = heat; row.VDA = vda; row.PRODUCTION_ALLOWANCE = prod;
  row.GROSS_EARNINGS = ap;
  row.OT_AMOUNT = calc_r2_(ot);
  row.TOTAL_EARNINGS = totalEarn;
  row.PF_EMPLOYEE = pf;
  row.ESI_EMPLOYEE = esi;
  row.PT = pt;
  row.MLWF = mlwf;
  row.EFFICIENCY_PCT = pctMissing ? null : pctNum;
  row.EFFICIENCY_ELIGIBLE_AMOUNT = eligible;
  row.EFFICIENCY_DEDUCTION = 0;
  row.TOTAL_DEDUCTIONS = calc_r2_(ded);
  row.NET_PAY = roundSheets(totalEarn - ded);
  row.EMPLOYER_PF = roundSheets(calc_pf_(pfWage, cfg, Number(cfg.EMPLOYER_PF_RATE_WORKER)));
  row.EMPLOYER_ESI = esiApplies ? roundSheets(fg * cfg.ESI_EMPLOYER_RATE / wd * w) : 0;
  row.BONUS_PROVISION = roundSheets(pfWage * cfg.BONUS_RATE_WORKER);
  row.GRATUITY_PROVISION = roundSheets(pfWage * cfg.GRATUITY_RATE_WORKER);
  return calc_finalize_(row, ex);
}

/* ------------------------------------------------------------------ */
/* CONSULTANT / PUNE_STAFF                                             */
/* ------------------------------------------------------------------ */

function calc_simple_(ctx, method) {
  var ex = [];
  var population = ctx.population || method;
  var row = calc_newRow_(ctx, method);
  var inp = calc_readInputs_(ctx, method, row, ex);
  var r = ctx.rate;
  var basis = null, rate = 0, mg = 0;
  if (!r) {
    calc_ex_(ex, 'BLOCKER', 'MISSING_RATE_PROFILE', 'No PAYROLL_RATE_PROFILE row');
  } else {
    basis = String(r.PAY_BASIS || '').trim().toUpperCase();
    rate = calc_num(r.RATE_AMOUNT_INR);
    mg = calc_num(r.MONTHLY_GROSS_INR);
    if (method === 'PUNE_STAFF') {
      if (basis !== 'MONTHLY_GROSS_PRORATED') {
        calc_ex_(ex, 'BLOCKER', 'INVALID_PAY_BASIS', population + ' requires MONTHLY_GROSS_PRORATED, got "' + basis + '"');
      }
    } else if (basis !== 'DAILY_RATE' && basis !== 'MONTHLY_GROSS_PRORATED') {
      calc_ex_(ex, 'BLOCKER', 'INVALID_PAY_BASIS', 'Unknown PAY_BASIS "' + basis + '"');
    }
    if (basis === 'DAILY_RATE' && (isNaN(rate) || rate <= 0)) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_RATE', 'RATE_AMOUNT_INR is zero or invalid');
    }
    if (basis === 'MONTHLY_GROSS_PRORATED' && (isNaN(mg) || mg <= 0)) {
      calc_ex_(ex, 'BLOCKER', 'ZERO_RATE', 'MONTHLY_GROSS_INR is zero or invalid');
    }
    if (basis === 'MONTHLY_GROSS_PRORATED' && method === 'CONSULTANT' && inp.ot > 0) {
      calc_ex_(ex, 'BLOCKER', 'BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM', 'Monthly-gross consultant has OT hours');
    }
    if (calc_isProxyRate(r)) {
      calc_ex_(ex, 'WARN', 'PROXY_RATE_JUL2026', 'Rate is the approved July 2026 proxy (VERSION_STATE ' + r.VERSION_STATE + ')');
    }
  }
  if (inp.DISPATCH_INCENTIVE !== 0 || inp.LEAVE_ENCASHMENT !== 0) {
    calc_ex_(ex, 'BLOCKER', 'ADJUSTMENT_NOT_APPLICABLE',
      'DISPATCH_INCENTIVE / LEAVE_ENCASHMENT are not payable for ' + population);
  }
  if (calc_hasBlocker_(ex)) return calc_finalize_(row, ex);

  var wd = inp.wd, w = inp.w;
  var gross, ot;
  if (basis === 'DAILY_RATE') {
    gross = rate * w;
    ot = rate / 8 * inp.ot;
    row.RATE = rate;
  } else {
    gross = mg * w / wd;
    ot = method === 'PUNE_STAFF' ? mg / wd / 8 * inp.ot : 0;
    row.FIXED_GROSS = mg;
  }
  var otherDed = inp.OTHER_DEDUCTION + inp.PENALTY + inp.CANTEEN_EXTRA + inp.TDS;
  var ded = inp.canteen + inp.society + inp.advance + otherDed;
  var extras = inp.OTHER_ALLOWANCE + inp.PRODUCTION_INCENTIVE + inp.OT_EXTRA_WORK + inp.ARREARS;

  calc_writeAdjustments_(row, inp);
  row.PAY_BASIS = basis;
  row.GROSS_EARNINGS = calc_r2_(gross);
  row.OT_AMOUNT = calc_r2_(ot);
  row.TOTAL_EARNINGS = calc_r2_(gross + ot + extras);
  row.PF_EMPLOYEE = 0; row.ESI_EMPLOYEE = 0; row.PT = 0; row.MLWF = 0;
  row.TOTAL_DEDUCTIONS = calc_r2_(ded);
  row.NET_PAY = roundSheets(gross - ded + ot + extras);
  row.EMPLOYER_PF = 0; row.EMPLOYER_ESI = 0; row.BONUS_PROVISION = 0; row.GRATUITY_PROVISION = 0;
  return calc_finalize_(row, ex);
}

function calcConsultant(ctx) { return calc_simple_(ctx, 'CONSULTANT'); }
function calcPune(ctx) { return calc_simple_(ctx, 'PUNE_STAFF'); }

function calcEmployee(ctx) {
  switch (calc_methodOf_(ctx)) {
    case 'STAFF': return calcStaff(ctx);
    case 'PERMANENT_WORKER': return calcWorker(ctx);
    case 'CONSULTANT': return calcConsultant(ctx);
    case 'PUNE_STAFF': return calcPune(ctx);
    default:
      var ex = [];
      var row = calc_newRow_(ctx || {}, ctx && ctx.population ? ctx.population : null);
      calc_ex_(ex, 'BLOCKER', 'UNKNOWN_POPULATION', 'Unknown population "' + (ctx && ctx.population) + '"');
      return calc_finalize_(row, ex);
  }
}
