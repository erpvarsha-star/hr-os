import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ctxVm = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', '30_Calc.gs'), 'utf8'), ctxVm, { filename: '30_Calc.gs' });
const C = (name) => vm.runInContext(name, ctxVm);
const plain = (x) => JSON.parse(JSON.stringify(x));

const roundSheets = C('roundSheets'), resolveStatutory = C('resolveStatutory'), ptAmount = C('ptAmount');
const efficiencySlab = C('efficiencySlab'), calcStaff = C('calcStaff'), calcWorker = C('calcWorker');
const calcConsultant = C('calcConsultant'), calcPune = C('calcPune'), calcEmployee = C('calcEmployee');
const aggregateAdjustments = C('aggregateAdjustments'), amountToIndianWords = C('amountToIndianWords');
const hashRows = C('hashRows'), requiredStatutoryKeys = C('requiredStatutoryKeys');
const OUTPUT_COLUMNS = plain(C('OUTPUT_COLUMNS'));

const cfgRows = [
  ['PF_WAGE_CEILING', 15000], ['PF_EMPLOYEE_RATE', 0.12], ['PF_MAX_EMPLOYEE', 1800], ['ESI_EMPLOYEE_RATE', 0.0075],
  ['ESI_EXEMPT_ABOVE', 21000], ['ESI_EMPLOYER_RATE', 0.0325], ['WORKER_VDA_RATE', 103], ['WORKER_HEAT_RATE', 5.78],
  ['PT_SLABS', '[{"min":0,"max":7500,"pt":0},{"min":7500.01,"max":10000,"pt":175},{"min":10000.01,"max":null,"pt":200}]'],
  ['MLWF_EMPLOYEE_RATE', 25], ['PT_FEB_AMOUNT', 300], ['MLWF_MONTHS', '6,12'], ['STAFF_OT_MULTIPLIER', 2],
  ['WORKER_OT_MULTIPLIER', 2], ['STAFF_PF_WAGE_COMPONENTS', 'BASIC,CONVEYANCE,EDUCATION,MEDICAL'],
  ['STAFF_COMPONENT_PCTS', '{"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}'],
  ['EMPLOYER_PF_RATE_STAFF', 0.1301], ['EMPLOYER_PF_RATE_WORKER', 0.1301], ['BONUS_RATE_STAFF', 0.0833],
  ['GRATUITY_RATE_STAFF', 0.0483], ['BONUS_RATE_WORKER', 0.18], ['GRATUITY_RATE_WORKER', 0.0481],
].map(([KEY, VALUE]) => ({ KEY, VALUE, EFFECTIVE_FROM: '2026-09', EFFECTIVE_TO: '', VERSION: 1 }));

const resolved = (period, pop) => resolveStatutory(cfgRows, period, pop);
const cfg = resolved('2026-09').values;
const effCfg = [[81, 4500], [82, 5000], [83, 6500], [84, 7500], [85, 8500]].map(
  ([p, a]) => ({ EFFICIENCY_PERCENT_EXACT: p, INCENTIVE_SLAB_INR: a, IMPLEMENTATION_STATE: 'SOURCE-RULE RECON PENDING' }));

const zeroAdj = { ARREARS: 0, DISPATCH_INCENTIVE: 0, OTHER_ALLOWANCE: 0, LEAVE_ENCASHMENT: 0, OT_EXTRA_WORK: 0,
  PRODUCTION_INCENTIVE: 0, TDS: 0, OTHER_DEDUCTION: 0, PENALTY: 0, CANTEEN_EXTRA: 0 };
const emp = (id) => ({ EMP_ID: id, EMPLOYEE_NAME: 'Test ' + id, DEPARTMENT: 'D', DESIGNATION: 'X' });
const noNaN = (row) => OUTPUT_COLUMNS.forEach((c) => {
  assert.ok(!(typeof row[c] === 'number' && !Number.isFinite(row[c])), 'non-finite ' + c);
});
const codes = (r) => r.exceptions.map((e) => e.code);

const staffSalary = { BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890, EDUCATION_PM_INR: 1890, MEDICAL_PM_INR: 1890,
  PRO_DEV_PM_INR: 945, COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260, WASHING_PM_INR: 2835, FIXED_GROSS_PM_AS_SOURCE_INR: 31500 };

function staffCtx(over) {
  return Object.assign({
    period: '2026-09', population: 'STAFF', emp: emp('S1'), salary: staffSalary, workingDays: 31, otHours: 0,
    canteen: 0, society: 100, advance: 0,
    attendance: { PRESENT_DAYS: 24, PHYSICAL_PRESENT_DAYS: 24, WEEK_OFF: 4, PH: 1, EL_AVAILED: 2, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0 },
    adjustments: Object.assign({}, zeroAdj, { OTHER_DEDUCTION: 1000 }), cfg, ptExemptSet: new Set(), efficiencyConfig: effCfg,
  }, over);
}

const workerSalary = { BASIC_PM_INR: 15477, HRA_PM_INR: 7000, CONVEYANCE_PM_INR: 2500, WASHING_PM_INR: 2130, EDUCATION_PM_INR: 2000,
  HEAT_MASTER_INR: 150, VDA_MASTER_INR: 2790, PRODUCTION_MASTER_INR: 8500, FIXED_GROSS_PM_AS_SOURCE_INR: 40547 };

function workerCtx(over) {
  return Object.assign({
    period: '2026-08', population: 'PERMANENT_WORKER', emp: emp('W1'), salary: workerSalary, workingDays: 27, otHours: 98.5,
    canteen: 0, society: 4780, advance: 1500, efficiencyPct: 80,
    attendance: { PRESENT_DAYS: 25, PHYSICAL_PRESENT_DAYS: 25, WEEK_OFF: 4, PH: 1, EL_AVAILED: 0, CL_AVAILED: 1, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0 },
    // 240 = unexplained gap between the documented OT (16,660) and TOTAL_EARNINGS 57,238 in the August example
    adjustments: Object.assign({}, zeroAdj, { OTHER_ALLOWANCE: 240 }), cfg, ptExemptSet: new Set(), efficiencyConfig: effCfg,
  }, over);
}

const rateCtx = (population, rate, over) => Object.assign({
  period: '2026-09', population, emp: emp('R1'), rate, workingDays: 30, otHours: 0, canteen: 0, society: 0, advance: 0,
  attendance: { PRESENT_DAYS: 0, WEEK_OFF: 0, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0 },
  adjustments: Object.assign({}, zeroAdj), cfg, ptExemptSet: new Set(), efficiencyConfig: effCfg,
}, over);

test('roundSheets: half away from zero and float guard', () => {
  assert.strictEqual(roundSheets(2.5), 3);
  assert.strictEqual(roundSheets(-2.5), -3);
  assert.strictEqual(roundSheets(2.4), 2);
  assert.strictEqual(roundSheets(-2.4), -2);
  assert.strictEqual(roundSheets(1.005, 2), 1.01);
  assert.strictEqual(roundSheets(1.4999999999999998), 2); // float noise around 1.5 rounds up
  assert.strictEqual(roundSheets(2.675 * 100 / 100, 2), 2.68);
  assert.strictEqual(roundSheets(-0.2), 0);
  assert.strictEqual(roundSheets(16660.18), 16660);
});

test('STAFF acceptance example', () => {
  const r = calcStaff(staffCtx());
  const row = r.row;
  assert.strictEqual(row.WORKED_PAYABLE_DAYS, 31);
  assert.strictEqual(row.GROSS_EARNINGS, 31500);
  assert.strictEqual(row.BASIC, 12600);
  assert.strictEqual(row.WASHING, 2835);
  assert.strictEqual(row.PF_EMPLOYEE, 1800);
  assert.strictEqual(row.ESI_EMPLOYEE, 0);
  assert.strictEqual(row.PT, 200);
  assert.strictEqual(row.MLWF, 0);
  assert.strictEqual(row.TOTAL_DEDUCTIONS, 3100);
  assert.strictEqual(row.NET_PAY, 28400);
  assert.strictEqual(row.BONUS_PROVISION, 1050);
  assert.strictEqual(row.GRATUITY_PROVISION, 609);
  assert.strictEqual(row.EMPLOYER_PF, 1800);
  assert.strictEqual(row.EMPLOYER_ESI, 0);
  assert.strictEqual(row.CALC_VERSION, 'CALC-1.0');
  assert.strictEqual(row.RUN_ID, null);
  assert.deepStrictEqual(plain(Object.keys(row)), OUTPUT_COLUMNS);
  assert.deepStrictEqual(plain(r.exceptions), []);
  assert.strictEqual(row.FLAGS, '');
  noNaN(row);
});

test('STAFF: proration, OT, MLWF in June, exemption, ESI below limit, extras', () => {
  const r = calcStaff(staffCtx({
    period: '2026-06', otHours: 10,
    attendance: { PRESENT_DAYS: 20, WEEK_OFF: 4, PH: 0, EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0 },
    workingDays: 30, ptExemptSet: new Set(['S1']),
    salary: Object.assign({}, staffSalary, { FIXED_GROSS_PM_AS_SOURCE_INR: 18000, BASIC_PM_INR: 7200 }),
    adjustments: Object.assign({}, zeroAdj, { ARREARS: 500 }),
  }));
  const row = r.row;
  assert.strictEqual(row.WORKED_PAYABLE_DAYS, 24);
  assert.strictEqual(row.GROSS_EARNINGS, 14400);
  assert.strictEqual(row.PT, 0);
  assert.strictEqual(row.MLWF, 25);
  assert.strictEqual(row.ESI_EMPLOYEE, 108); // 18000*0.0075/30*24
});

test('STAFF: ESI applies when fixed gross <= 21,000', () => {
  const r = calcStaff(staffCtx({
    salary: Object.assign({}, staffSalary, { FIXED_GROSS_PM_AS_SOURCE_INR: 18000, BASIC_PM_INR: 7200 }),
    adjustments: Object.assign({}, zeroAdj), society: 0,
  }));
  assert.strictEqual(r.row.ESI_EMPLOYEE, 135);
  assert.strictEqual(r.row.EMPLOYER_ESI, 585);
});

test('STAFF: OT amount = basic/wd/8*2*hrs', () => {
  const r = calcStaff(staffCtx({ otHours: 10, adjustments: Object.assign({}, zeroAdj), society: 0 }));
  assert.strictEqual(r.row.OT_AMOUNT, roundSheets(12600 / 31 / 8 * 2 * 10, 2));
  assert.strictEqual(r.row.NET_PAY, roundSheets(31500 - 1800 - 200 + 12600 / 31 / 8 * 2 * 10));
});

test('WORKER example reproduced exactly with synthetic masters', () => {
  const r = calcWorker(workerCtx());
  const row = r.row;
  assert.strictEqual(row.WORKED_PAYABLE_DAYS, 27);
  assert.strictEqual(row.HEAT, 156);
  assert.strictEqual(row.VDA, 2575);
  assert.strictEqual(row.PRODUCTION_ALLOWANCE, 8500);
  assert.strictEqual(row.GROSS_EARNINGS, 29107);
  assert.strictEqual(roundSheets(row.OT_AMOUNT), 16660);
  assert.strictEqual(row.TOTAL_EARNINGS, 57238);
  assert.strictEqual(row.EFFICIENCY_ELIGIBLE_AMOUNT, 0);
  assert.strictEqual(row.EFFICIENCY_DEDUCTION, 8500);
  assert.strictEqual(row.PF_EMPLOYEE, 1800);
  assert.strictEqual(row.ESI_EMPLOYEE, 0);
  assert.strictEqual(row.PT, 200);
  assert.strictEqual(row.MLWF, 0);
  assert.strictEqual(row.TOTAL_DEDUCTIONS, 16780);
  assert.strictEqual(row.NET_PAY, 40458);
  assert.ok(row.FLAGS.split(';').includes('EFFICIENCY_RULE_UNCONFIRMED'));
  assert.ok(!row.FLAGS.includes('WORKER_ESI_BASIS_UNCONFIRMED'));
  assert.strictEqual(r.exceptions.filter((e) => e.severity === 'BLOCKER').length, 0);
  noNaN(row);
});

test('WORKER: VDA uses physical present days; WO excluded from worked days', () => {
  const r = calcWorker(workerCtx({
    attendance: { PRESENT_DAYS: 20, PHYSICAL_PRESENT_DAYS: 18, WEEK_OFF: 4, PH: 1, EL_AVAILED: 1, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0 },
  }));
  assert.strictEqual(r.row.WORKED_PAYABLE_DAYS, 22);
  assert.strictEqual(r.row.VDA, roundSheets(103 * 18));
  assert.strictEqual(r.row.HEAT, roundSheets(22 * 5.78));
  assert.strictEqual(r.row.BASIC, roundSheets(15477 / 27 * 22));
});

test('WORKER: ESI flag, missing efficiency and missing pp are BLOCKERs, PT exemption', () => {
  const esi = calcWorker(workerCtx({ salary: Object.assign({}, workerSalary, { FIXED_GROSS_PM_AS_SOURCE_INR: 20000 }) }));
  assert.strictEqual(esi.row.ESI_EMPLOYEE, roundSheets(20000 * 0.0075 / 27 * 27));
  assert.ok(esi.row.FLAGS.includes('WORKER_ESI_BASIS_UNCONFIRMED'));

  const noEff = calcWorker(workerCtx({ efficiencyPct: null }));
  assert.ok(codes(noEff).includes('MISSING_EFFICIENCY_PCT'));
  assert.strictEqual(noEff.row.NET_PAY, null);

  const att = Object.assign({}, workerCtx().attendance); delete att.PHYSICAL_PRESENT_DAYS;
  const noPp = calcWorker(workerCtx({ attendance: att }));
  assert.ok(codes(noPp).includes('MISSING_PHYSICAL_PRESENT_DAYS'));
  assert.strictEqual(noPp.row.NET_PAY, null);

  const ex = calcWorker(workerCtx({ ptExemptSet: new Set(['W1']) }));
  assert.strictEqual(ex.row.PT, 0);
  assert.strictEqual(ex.row.NET_PAY, 40658);
});

test('WORKER: worked days above working days is a BLOCKER', () => {
  const r = calcWorker(workerCtx({ workingDays: 20 }));
  assert.ok(codes(r).includes('WORKED_EXCEEDS_WORKING_DAYS'));
  assert.strictEqual(r.row.NET_PAY, null);
});

test('CONSULTANT: daily rate, monthly prorated, monthly OT blocker', () => {
  const daily = calcConsultant(rateCtx('CONSULTANT', { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 700 }, {
    otHours: 53, attendance: { PRESENT_DAYS: 12 },
  }));
  assert.strictEqual(daily.row.GROSS_EARNINGS, 8400);
  assert.strictEqual(daily.row.OT_AMOUNT, 4637.5);
  assert.strictEqual(daily.row.NET_PAY, roundSheets(8400 + 4637.5));
  assert.strictEqual(daily.row.PF_EMPLOYEE, 0);
  assert.strictEqual(daily.row.RATE, 700);

  const monthly = calcConsultant(rateCtx('CONSULTANT', { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 20000 }, {
    attendance: { PRESENT_DAYS: 15, WEEK_OFF: 4 },
  }));
  assert.strictEqual(monthly.row.GROSS_EARNINGS, 12666.67);
  assert.strictEqual(monthly.row.NET_PAY, 12667);
  assert.strictEqual(monthly.row.WORKED_PAYABLE_DAYS, 19);

  const blocked = calcConsultant(rateCtx('CONSULTANT', { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 20000 }, {
    otHours: 2, attendance: { PRESENT_DAYS: 19 },
  }));
  assert.ok(codes(blocked).includes('BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM'));
  assert.strictEqual(blocked.row.NET_PAY, null);
});

test('CONSULTANT: deductions and allowances', () => {
  const r = calcConsultant(rateCtx('CONSULTANT', { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 600 }, {
    attendance: { PRESENT_DAYS: 10 }, canteen: 100, society: 50, advance: 200,
    adjustments: Object.assign({}, zeroAdj, { OTHER_DEDUCTION: 10, TDS: 40, OTHER_ALLOWANCE: 300 }),
  }));
  assert.strictEqual(r.row.TOTAL_DEDUCTIONS, 400);
  assert.strictEqual(r.row.NET_PAY, 6000 - 400 + 300);
  const bad = calcConsultant(rateCtx('CONSULTANT', { PAY_BASIS: 'DAILY_RATE', RATE_AMOUNT_INR: 600 }, {
    attendance: { PRESENT_DAYS: 10 }, adjustments: Object.assign({}, zeroAdj, { DISPATCH_INCENTIVE: 5 }),
  }));
  assert.ok(codes(bad).includes('ADJUSTMENT_NOT_APPLICABLE'));
});

test('PUNE: prorated gross, OT on gross/wd/8, negative net BLOCKER', () => {
  const p = calcPune(rateCtx('PUNE_STAFF', { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 15000 }, {
    workingDays: 31, otHours: 8, attendance: { PRESENT_DAYS: 25, WEEK_OFF: 4 },
  }));
  assert.strictEqual(p.row.GROSS_EARNINGS, roundSheets(15000 * 29 / 31, 2));
  assert.strictEqual(p.row.OT_AMOUNT, roundSheets(15000 / 31 / 8 * 8, 2));
  assert.strictEqual(p.row.NET_PAY, roundSheets(15000 * 29 / 31 + 15000 / 31));

  const neg = calcPune(rateCtx('PUNE_STAFF', { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 3000 }, {
    workingDays: 30, attendance: { PRESENT_DAYS: 10 }, advance: 5000,
  }));
  assert.ok(codes(neg).includes('NEGATIVE_NET_PAY'));
  assert.ok(neg.row.NET_PAY < 0);
});

test('calcEmployee dispatches; unknown population is a BLOCKER', () => {
  assert.strictEqual(calcEmployee(staffCtx()).row.NET_PAY, 28400);
  assert.strictEqual(calcEmployee(workerCtx()).row.NET_PAY, 40458);
  const u = calcEmployee({ period: '2026-09', population: 'X', emp: emp('Z') });
  assert.ok(codes(u).includes('UNKNOWN_POPULATION'));
  assert.strictEqual(u.row.NET_PAY, null);
});

test('ptAmount rules', () => {
  const pt = (g, m, id, ex) => ptAmount(g, m || 'Sep', id || 'E1', cfg, ex || new Set());
  assert.strictEqual(pt(5000, 'Feb'), 300);
  assert.strictEqual(pt(31500, 'Feb'), 300);
  assert.strictEqual(pt(31500, 'Feb', 'E1', new Set(['E1'])), 0);
  assert.strictEqual(pt(31500, 'Sep', 'E1', ['E1']), 0);
  assert.strictEqual(pt(7500), 0);
  assert.strictEqual(pt(7600), 175);
  assert.strictEqual(pt(10000), 175);
  assert.strictEqual(pt(10001), 200);
  assert.strictEqual(pt(0, 'Feb'), 0);
  assert.strictEqual(pt(0), 0);
});

test('MLWF only in Jun and Dec', () => {
  const mlwf = (period) => calcStaff(staffCtx({ period })).row.MLWF;
  assert.strictEqual(mlwf('2026-06'), 25);
  assert.strictEqual(mlwf('2026-12'), 25);
  ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11'].forEach((m) => assert.strictEqual(mlwf('2026-' + m), 0));
});

test('resolveStatutory picks highest effective version; reports missing', () => {
  const rows = [
    { KEY: 'PF_MAX_EMPLOYEE', VALUE: 1800, EFFECTIVE_FROM: '2026-09', EFFECTIVE_TO: '', VERSION: 1 },
    { KEY: 'PF_MAX_EMPLOYEE', VALUE: 1950, EFFECTIVE_FROM: '2026-11', EFFECTIVE_TO: '', VERSION: 2 },
    { KEY: 'PF_MAX_EMPLOYEE', VALUE: 1700, EFFECTIVE_FROM: '2026-09', EFFECTIVE_TO: '2026-10', VERSION: 3 },
    { KEY: 'PF_EMPLOYEE_RATE', VALUE: '0.12', EFFECTIVE_FROM: '', EFFECTIVE_TO: '', VERSION: 1 },
    { KEY: 'MLWF_MONTHS', VALUE: '6, 12', VERSION: 1 },
    { KEY: 'PT_SLABS', VALUE: '[{"min":0,"max":null,"pt":10}]', VERSION: 1 },
    { KEY: 'STAFF_PF_WAGE_COMPONENTS', VALUE: 'BASIC,CONVEYANCE', VERSION: 1 },
  ];
  assert.strictEqual(resolveStatutory(rows, '2026-09').values.PF_MAX_EMPLOYEE, 1700);
  assert.strictEqual(resolveStatutory(rows, '2026-10').values.PF_MAX_EMPLOYEE, 1700);
  assert.strictEqual(resolveStatutory(rows, '2026-11').values.PF_MAX_EMPLOYEE, 1950);
  assert.strictEqual(resolveStatutory(rows, '2026-08').values.PF_MAX_EMPLOYEE, undefined);
  const res = resolveStatutory(rows, '2026-11', 'STAFF');
  assert.strictEqual(res.values.PF_EMPLOYEE_RATE, 0.12);
  assert.deepStrictEqual(plain(res.values.MLWF_MONTHS), [6, 12]);
  assert.deepStrictEqual(plain(res.values.PT_SLABS), [{ min: 0, max: null, pt: 10 }]);
  assert.deepStrictEqual(plain(res.values.STAFF_PF_WAGE_COMPONENTS), ['BASIC', 'CONVEYANCE']);
  assert.ok(res.missing.includes('ESI_EMPLOYEE_RATE'));
  assert.ok(res.missing.includes('STAFF_COMPONENT_PCTS'));
  assert.ok(!res.missing.includes('PF_EMPLOYEE_RATE'));
  assert.deepStrictEqual(plain(resolved('2026-09', 'STAFF').missing), []);
  assert.deepStrictEqual(plain(resolved('2026-09', 'PERMANENT_WORKER').missing), []);
  assert.deepStrictEqual(plain(requiredStatutoryKeys('CONSULTANT')), []);
});

test('missing statutory keys make calc BLOCKER, not NaN', () => {
  const r = calcStaff(staffCtx({ cfg: {} }));
  assert.ok(codes(r).includes('MISSING_STATUTORY_KEY'));
  assert.strictEqual(r.row.NET_PAY, null);
  noNaN(r.row);
});

test('efficiencySlab', () => {
  assert.strictEqual(efficiencySlab(80, effCfg), 0);
  assert.strictEqual(efficiencySlab(80.99, effCfg), 0);
  assert.strictEqual(efficiencySlab(81, effCfg), 4500);
  assert.strictEqual(efficiencySlab(83.7, effCfg), 6500);
  assert.strictEqual(efficiencySlab(85, effCfg), 8500);
  assert.strictEqual(efficiencySlab(90, effCfg), 8500);
  assert.strictEqual(efficiencySlab(100, effCfg), 8500);
  assert.strictEqual(efficiencySlab(null, effCfg), null);
});

test('worker at 90% efficiency: eligible 8,500, deduction 0', () => {
  const r = calcWorker(workerCtx({ efficiencyPct: 90 }));
  assert.strictEqual(r.row.EFFICIENCY_DEDUCTION, 0);
  assert.strictEqual(r.row.NET_PAY, 40458 + 8500);
});

test('amountToIndianWords', () => {
  assert.strictEqual(amountToIndianWords(0), 'Zero Rupees Only');
  assert.strictEqual(amountToIndianWords(40458), 'Forty Thousand Four Hundred Fifty Eight Rupees Only');
  assert.strictEqual(amountToIndianWords(150000), 'One Lakh Fifty Thousand Rupees Only');
  assert.strictEqual(amountToIndianWords(12345678),
    'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only');
  assert.strictEqual(amountToIndianWords(28400), 'Twenty Eight Thousand Four Hundred Rupees Only');
  assert.strictEqual(amountToIndianWords(-100), 'Minus One Hundred Rupees Only');
  assert.strictEqual(amountToIndianWords(null), '');
});

test('aggregateAdjustments: approved only, period, employee, unknown type', () => {
  const rows = [
    { PAYROLL_MONTH: '2026-09-01', EMP_ID: 'E1', ADJUSTMENT_TYPE: 'ARREARS', SIGNED_AMOUNT_INR: 1000, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'E1', ADJUSTMENT_TYPE: 'ARREARS', SIGNED_AMOUNT_INR: -200, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'E1', ADJUSTMENT_TYPE: 'TDS', SIGNED_AMOUNT_INR: 300, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'E1', ADJUSTMENT_TYPE: 'PENALTY', SIGNED_AMOUNT_INR: 99, APPROVAL_STATUS: 'PENDING' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'E1', ADJUSTMENT_TYPE: 'TDS', SIGNED_AMOUNT_INR: 5, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'E2', ADJUSTMENT_TYPE: 'TDS', SIGNED_AMOUNT_INR: 7, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'E1', ADJUSTMENT_TYPE: 'BONUS_X', SIGNED_AMOUNT_INR: 7, APPROVAL_STATUS: 'APPROVED' },
  ];
  const a = aggregateAdjustments(rows, '2026-09', 'E1');
  assert.strictEqual(a.ARREARS, 800);
  assert.strictEqual(a.TDS, 300);
  assert.strictEqual(a.PENALTY, 0);
  assert.strictEqual(a.OTHER_DEDUCTION, 0);
  assert.strictEqual(a.exceptions.length, 1);
  assert.strictEqual(a.exceptions[0].severity, 'WARN');
  assert.strictEqual(a.exceptions[0].code, 'UNKNOWN_ADJUSTMENT_TYPE');
  const c = calcStaff(staffCtx({ adjustments: a, society: 0 }));
  assert.strictEqual(c.row.ARREARS, 800);
  assert.strictEqual(c.row.TDS, 300);
});

test('hashRows: order independent, ignores RUN_ID / CALCULATED_AT, sensitive to values', () => {
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const a = calcStaff(staffCtx({ emp: emp('A1') })).row;
  const b = calcStaff(staffCtx({ emp: emp('B1'), otHours: 3 })).row;
  const h1 = hashRows([a, b], OUTPUT_COLUMNS, sha);
  const h2 = hashRows([Object.assign({}, b, { RUN_ID: 'x', CALCULATED_AT: 'y' }), Object.assign({}, a, { RUN_ID: 'z' })], OUTPUT_COLUMNS, sha);
  assert.strictEqual(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(h1, hashRows([a, Object.assign({}, b, { NET_PAY: b.NET_PAY + 1 })], OUTPUT_COLUMNS, sha));
});

test('no NaN for zero working days or garbage input (BLOCKER, NET null)', () => {
  const cases = [
    calcStaff(staffCtx({ workingDays: 0 })),
    calcStaff(staffCtx({ workingDays: null })),
    calcWorker(workerCtx({ workingDays: 0 })),
    calcConsultant(rateCtx('CONSULTANT', { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 20000 }, { workingDays: 0 })),
    calcPune(rateCtx('PUNE_STAFF', { PAY_BASIS: 'MONTHLY_GROSS_PRORATED', MONTHLY_GROSS_INR: 20000 }, { workingDays: 0 })),
    calcStaff(staffCtx({ otHours: 'abc' })),
    calcStaff(staffCtx({ salary: null })),
    calcStaff(staffCtx({ salary: Object.assign({}, staffSalary, { FIXED_GROSS_PM_AS_SOURCE_INR: 0 }) })),
    calcConsultant(rateCtx('CONSULTANT', null, {})),
  ];
  cases.forEach((r) => {
    noNaN(r.row);
    assert.strictEqual(r.row.NET_PAY, null);
    assert.ok(r.exceptions.some((e) => e.severity === 'BLOCKER'));
  });
  assert.ok(codes(cases[0]).includes('INVALID_WORKING_DAYS'));
  assert.ok(codes(cases[7]).includes('ZERO_SALARY_STRUCTURE'));
});
