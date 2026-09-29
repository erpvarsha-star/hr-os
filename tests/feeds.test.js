'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');

const ctx = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '20_Feeds.gs']);
const P = '2026-10';
const roster = [
  { EMP_ID: 'VFL1001', PAYROLL_CATEGORY: 'STAFF' },
  { EMP_ID: 'VFL4001', PAYROLL_CATEGORY: 'PERMANENT_WORKER' },
  { EMP_ID: 'VFL4002', PAYROLL_CATEGORY: 'PERMANENT_WORKER' },
];
const OT_HDR = ['Timestamp', 'Submission Type', 'EMP ID', 'Name', 'Department', 'Designation', 'Reporting Manager Name',
  'Reporting Manager Email ID', 'Date Of OT', 'Reason for OT', 'OT Time (From)', 'OT Time (To)', 'OT Hours',
  'Name Of Approver', 'Approval Decision', 'Remarks', 'Approval Password (HT)', 'Approval Password (Machine Shop)',
  'Approval Password (VMC Shop)', 'Approval Password (HOD)', 'Case No'];
const ot = (o) => {
  const r = new Array(21).fill('');
  const set = (h, v) => { r[OT_HDR.indexOf(h)] = v; };
  set('Timestamp', o.ts || '2026-10-06 10:00:00'); set('Submission Type', o.type || 'Approval Of Manager');
  set('EMP ID', o.emp || 'VFL4001'); set('Date Of OT', o.date || '2026-10-05'); set('OT Hours', o.h === undefined ? 4.5 : o.h);
  set('Approval Decision', o.dec === undefined ? 'Approved' : o.dec); set('Case No', o.kase === undefined ? 17363 : o.kase);
  set('Approval Password (HT)', 'SECRET');
  return r;
};
const mapOt = (rows, existing = [], p = P, opts = undefined) => plain(ctx.mapOtRows(OT_HDR, rows, p, roster, existing, opts));
const reasonOf = (e) => e.EXCEPTION_REASON.split(' | ')[0];

test('OT: only explicit Approved approval rows count; apply rows are pending WARN', () => {
  const r = mapOt([
    ot({}),
    ot({ type: 'Apply For OT', dec: '', emp: 'VFL4002' }),
    ot({ type: 'Approval Of Manager', dec: 'Rejected', emp: 'VFL4002', date: '2026-10-07' }),
    ot({ type: 'Apply For OT', dec: '', emp: 'VFL4001', date: '2026-10-05' }), // has approval row -> not pending
  ]);
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].OT_HOURS, 4.5);
  assert.equal(r.valid[0].ELIGIBILITY, 'VALID');
  assert.equal(r.valid[0].NORMALIZER_VERSION, ctx.FEEDS_NORMALIZER_VERSION);
  assert.equal(r.pendingCount, 1);
  assert.deepEqual(r.pendingEmpIds, ['VFL4002']);
  assert.equal(r.exceptions.length, 0);
});

test('OT: pending events split by population (unknown EMP_IDs under UNKNOWN); OT_PENDING JSON parser is forgiving', () => {
  const r = mapOt([
    ot({ type: 'Apply For OT', dec: '', emp: 'VFL4002' }),
    ot({ type: 'Apply For OT', dec: '', emp: 'VFL4001', date: '2026-10-09' }),
    ot({ type: 'Apply For OT', dec: '', emp: 'vfl1001', date: '2026-10-09' }),
    ot({ type: 'Apply For OT', dec: '', emp: 'GHOST', date: '2026-10-10' }),
    ot({ type: 'Approval Of Manager', dec: '', emp: 'VFL1001', date: '2026-10-11' }),
  ]);
  assert.equal(r.pendingCount, 5);
  const popOf = { VFL1001: 'STAFF', VFL4001: 'PERMANENT_WORKER', VFL4002: 'PERMANENT_WORKER' };
  assert.deepEqual(plain(ctx.feeds_pendingByPopulation(r.pendingEmpIds, popOf)),
    { STAFF: 2, PERMANENT_WORKER: 2, CONSULTANT: 0, PUNE_STAFF: 0, UNKNOWN: 1 });
  assert.deepEqual(plain(ctx.feeds_pendingByPopulation([], {})), { STAFF: 0, PERMANENT_WORKER: 0, CONSULTANT: 0, PUNE_STAFF: 0 });
  assert.deepEqual(plain(ctx.feeds_parsePendingOt('{"STAFF":2}')), { STAFF: 2 });
  assert.deepEqual(plain(ctx.feeds_parsePendingOt('garbage')), {});
  assert.deepEqual(plain(ctx.feeds_parsePendingOt('')), {});
});

test('OT: ambiguous rows (Approved on Apply row, odd decision) are exceptions; a later rejection revokes silently', () => {
  const r = mapOt([
    ot({ type: 'Apply For OT', dec: 'Approved', date: '2026-10-08' }),
    ot({ dec: 'Approved with changes', date: '2026-10-09' }),
    ot({ date: '2026-10-10', ts: '2026-10-11 09:00:00' }),
    ot({ date: '2026-10-10', dec: 'Rejected', ts: '2026-10-12 09:00:00' }),
  ]);
  assert.equal(r.valid.length, 0);
  assert.deepEqual(r.exceptions.map(reasonOf).sort(), ['APPROVED_ON_NON_APPROVAL_ROW', 'UNRECOGNISED_DECISION']);
  assert.ok(r.exceptions.every((e) => e.ELIGIBILITY === 'EXCEPTION' && e.OT_HOURS === 0), 'exceptions carry OT_HOURS=0');
  assert.ok(r.exceptions.every((e) => /ORIGINAL_OT_HOURS=4\.5/.test(e.EXCEPTION_REASON)), 'original hours kept in the reason');
  assert.equal(r.revokedCount, 1);
});

test('OT: key idempotency (existing keys skipped; same-run re-map identical)', () => {
  const rows = [ot({}), ot({ emp: 'VFL4002', date: '2026-10-06' })];
  const a = mapOt(rows);
  assert.equal(a.valid.length, 2);
  assert.equal(a.valid[0].OT_KEY, 'VFL4001|2026-10-05|2');
  assert.equal(a.valid[1].OT_KEY, 'VFL4002|2026-10-06|3');
  const b = mapOt(rows, a.valid.map((v) => v.OT_KEY));
  assert.equal(b.valid.length, 0);
  assert.equal(b.duplicateSkipped, 2);
  assert.deepEqual(mapOt(rows), a);
});

test('OT: case no is text with apostrophe, same case reused across emp/date gives distinct keys', () => {
  const r = mapOt([ot({ kase: 17363 }), ot({ kase: 17363, emp: 'VFL4002' })]);
  assert.equal(r.valid[0].SOURCE_CASE_NOS, "'17363");
  assert.equal(typeof r.valid[0].SOURCE_CASE_NOS, 'string');
  assert.notEqual(r.valid[0].OT_KEY, r.valid[1].OT_KEY);
});

test('OT: DATE_RANGE built from real dates; PAYROLL_MONTH is period text; dd-mm-yyyy and Date parsed', () => {
  const r = mapOt([ot({ date: '05-10-2026' }), ot({ date: new Date(2026, 9, 6), emp: 'VFL4002' })]);
  assert.equal(r.valid[0].DATE_RANGE, '2026-10-05..2026-10-05');
  assert.equal(r.valid[1].DATE_RANGE, '2026-10-06..2026-10-06');
  assert.equal(r.valid[0].PAYROLL_MONTH, '2026-10');
  assert.equal(r.valid[0].SOURCE_REF, 'OVERTIME_FORM');
  assert.equal(r.valid[0].SOURCE_EVENT_COUNT, 1);
  assert.ok(!/NaN/.test(JSON.stringify(r.valid)));
});

test('OT: >16h, non numeric, zero and unknown EMP are exceptions', () => {
  const r = mapOt([ot({ h: 17 }), ot({ h: 'abc', emp: 'VFL4002' }), ot({ h: 0, date: '2026-10-06' }),
    ot({ emp: 'VFL9999', date: '2026-10-07' }), ot({ h: 16, date: '2026-10-08' })]);
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].OT_HOURS, 16);
  assert.deepEqual(r.exceptions.map(reasonOf),
    ['HOURS_OVER_16', 'HOURS_NOT_NUMERIC', 'HOURS_NOT_POSITIVE', 'UNKNOWN_OR_INACTIVE_EMP_ID']);
  assert.ok(r.exceptions.every((e) => e.OT_HOURS === 0), 'exception rows never carry hours (Monthly OT Report SUMIFS)');
  assert.match(r.exceptions[0].EXCEPTION_REASON, /ORIGINAL_OT_HOURS=17/);
  assert.match(r.exceptions[1].EXCEPTION_REASON, /ORIGINAL_OT_HOURS=abc/);
});

test('OT: out-of-period events are ignored entirely', () => {
  const r = mapOt([ot({ date: '2026-09-30' }), ot({ date: '2026-11-01' }), ot({ type: 'Apply For OT', dec: '', date: '2026-09-28' })]);
  assert.equal(r.valid.length + r.exceptions.length + r.pendingCount, 0);
});

test('OT: password columns are never copied to output', () => {
  const r = mapOt([ot({})]);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('OT: missing required header fails closed', () => {
  const r = plain(ctx.mapOtRows(['Timestamp', 'EMP ID'], [['t', 'VFL4001']], P, roster, []));
  assert.equal(r.valid.length, 0);
  assert.ok(r.missingColumns.length > 0);
});

test('sumOtHours: only VALID rows with NORMALIZER_VERSION; legacy Apr-Aug rows never counted; period formats', () => {
  const rows = [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', OT_HOURS: 4, ELIGIBILITY: 'VALID', NORMALIZER_VERSION: 'OT-1.0' },
    { PAYROLL_MONTH: '2026-10-01', EMP_ID: 'A', OT_HOURS: 2, ELIGIBILITY: 'VALID', NORMALIZER_VERSION: 'OT-1.0' },
    { PAYROLL_MONTH: new Date(2026, 9, 1), EMP_ID: 'A', OT_HOURS: 1, ELIGIBILITY: 'VALID', NORMALIZER_VERSION: 'OT-1.0' },
    { PAYROLL_MONTH: new Date(2026, 9, 1), EMP_ID: 'B', OT_HOURS: 120.5, APPROVAL_STATUS: 'APPROVED' }, // legacy
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', OT_HOURS: 9, ELIGIBILITY: 'VALID' }, // no version
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', OT_HOURS: 9, ELIGIBILITY: 'EXCEPTION', NORMALIZER_VERSION: 'OT-1.0' },
    { PAYROLL_MONTH: '2026-11', EMP_ID: 'A', OT_HOURS: 50, ELIGIBILITY: 'VALID', NORMALIZER_VERSION: 'OT-1.0' },
  ];
  assert.deepEqual(plain(ctx.sumOtHours(rows, '2026-10')), { A: 7 });
});

test('period normalization of Date / YYYY-MM-01 / YYYY-MM', () => {
  assert.equal(ctx.normalizePeriod(new Date(2026, 9, 1)), '2026-10');
  assert.equal(ctx.normalizePeriod('2026-10-01'), '2026-10');
  assert.equal(ctx.normalizePeriod('2026-10'), '2026-10');
  assert.equal(ctx.feeds_parsePeriodLoose_('Oct 2026'), '2026-10');
  const rows = [{ PAYROLL_MONTH: new Date(2026, 9, 1), EMP_ID: 'X', AMOUNT_INR: 300, SOURCE: 'HR_MANUAL' },
    { PAYROLL_MONTH: '2026-10-01', EMP_ID: 'Y', AMOUNT_INR: 100, SOURCE: 'HR_MANUAL' }];
  assert.deepEqual(plain(ctx.canteenByEmp(rows, '2026-10')), { X: 300, Y: 100 });
});

const CAN_HDR = ['Timestamp', 'Email Address', 'Payroll Month', 'Employee ID', 'Employee Name', 'Plant / location',
  'Deduction amount (INR)', 'Submission type', 'Previous submission reference', 'Correction reason'];
const can = (ts, month, emp, amt, type = 'NEW', prev = '') => [ts, 'x@y', month, emp, '', 'Waluj', amt, type, prev, ''];

test('canteen mapper: latest per PERIOD|EMP wins, invalid latest not replaced by older, correction needs ref', () => {
  const rows = [
    can('2026-10-20 10:00:00', 'Oct 2026', 'VFL4001', 500),
    can('2026-10-21 10:00:00', '2026-10', 'vfl4001', 650, 'CORRECTION', 'row 2'),
    can('2026-10-20 10:00:00', '2026-10', 'VFL4002', 400),
    can('2026-10-22 10:00:00', '2026-10', 'VFL4002', -5),
    can('2026-10-20 10:00:00', '2026-09', 'VFL4001', 999),
    can('2026-10-20 10:00:00', '2026-10', 'VFL9999', 10),
  ];
  const r = plain(ctx.mapCanteenRows(CAN_HDR, rows, P, roster, []));
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].AMOUNT_INR, 650);
  assert.equal(r.valid[0].KEY, '2026-10|VFL4001');
  assert.equal(r.valid[0].SOURCE_REF, 'CANTEEN_FORM_RESPONSES!3');
  assert.deepEqual(r.exceptions.map((e) => e.REMARKS).sort(), ['AMOUNT_NEGATIVE', 'UNKNOWN_OR_INACTIVE_EMP_ID']);
  const again = plain(ctx.mapCanteenRows(CAN_HDR, rows, P, roster, ['CANTEEN_FORM_RESPONSES!3', 'CANTEEN_FORM_RESPONSES!5', 'CANTEEN_FORM_RESPONSES!7']));
  assert.equal(again.valid.length + again.exceptions.length, 0);
  const noRef = plain(ctx.mapCanteenRows(CAN_HDR, [can('t', P, 'VFL4001', 5, 'CORRECTION', '')], P, roster, []));
  assert.equal(noRef.exceptions[0].REMARKS, 'CORRECTION_WITHOUT_REFERENCE');
});

test('canteenByEmp: latest wins over form rows, HR_MANUAL rows preserved and counted, an invalid LATEST row leaves no value', () => {
  const rows = [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', AMOUNT_INR: 500, SOURCE: 'FORM_CANTEEN', STATUS: 'VALID', ENTERED_AT: '2026-10-20T10:00:00' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', AMOUNT_INR: 650, SOURCE: 'FORM_CANTEEN', STATUS: 'VALID', ENTERED_AT: '2026-10-21T10:00:00' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', AMOUNT_INR: 9999, SOURCE: 'FORM_CANTEEN', STATUS: 'EXCEPTION', ENTERED_AT: '2026-10-25T10:00:00' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'M', AMOUNT_INR: 200, SOURCE: 'HR_MANUAL', ENTERED_AT: '2026-10-22T10:00:00' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', AMOUNT_INR: 300, SOURCE: 'FORM_CANTEEN', STATUS: 'VALID', ENTERED_AT: '2026-10-20T10:00:00' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', AMOUNT_INR: 350, SOURCE: 'HR_MANUAL', ENTERED_AT: '2026-10-23T10:00:00' },
  ];
  // A: the latest response (10-25) is an EXCEPTION -> no silent fallback to the older 650
  assert.deepEqual(plain(ctx.canteenByEmp(rows, P)), { M: 200, B: 350 });
  assert.deepEqual(plain(ctx.canteenExceptions(rows, P)).map((e) => e.EMP_ID), ['A']);
  // a later valid row (HR fixes it) clears the exception again
  const fixed = rows.concat([{ PAYROLL_MONTH: '2026-10', EMP_ID: 'A', AMOUNT_INR: 700, SOURCE: 'HR_MANUAL', STATUS: 'VALID', ENTERED_AT: '2026-10-26T10:00:00' }]);
  assert.deepEqual(plain(ctx.canteenByEmp(fixed, P)).A, 700);
  assert.deepEqual(plain(ctx.canteenExceptions(fixed, P)), []);
});

const EFF_HDR = ['Timestamp', 'Email Address', 'Payroll Month', 'Employee ID', 'Employee Name (optional)', 'Plant / location',
  'Production efficiency percent', 'Physical present days (optional)', 'Submission type', 'Previous submission reference', 'Correction reason'];
const eff = (ts, emp, pct, days = '') => [ts, 'm@y', '2026-10', emp, '', 'Waluj', pct, days, 'NEW', '', ''];

test('efficiency mapper: per employee, ALL_WORKERS retired, range validation, latest wins, staff rejected', () => {
  const rows = [
    eff('2026-10-30 10:00:00', 'ALL_WORKERS', 90),
    eff('2026-10-30 11:00:00', 'VFL4001', 80, 24),
    eff('2026-10-30 12:00:00', 'VFL4001', 82, 25),
    eff('2026-10-30 12:00:00', 'VFL4002', 120),
    eff('2026-10-30 12:00:00', 'VFL1001', 90),
  ];
  const r = plain(ctx.mapEfficiencyRows(EFF_HDR, rows, P, roster, []));
  const by = Object.fromEntries(r.valid.map((v) => [v.EMP_ID, v]));
  assert.ok(!by.ALL_WORKERS, 'no blanket row');
  assert.equal(by.VFL4001.EFFICIENCY_PCT, 82);
  assert.equal(by.VFL4001.PHYSICAL_PRESENT_DAYS_OVERRIDE, 25);
  assert.deepEqual(r.exceptions.map((e) => e.REMARKS).sort(), ['ALL_WORKERS_NOT_SUPPORTED', 'EFFICIENCY_OUT_OF_RANGE', 'NOT_A_PERMANENT_WORKER']);
});

test('efficiencyByEmp: per employee only; ALL_WORKERS rows are ignored; invalid latest gives nothing', () => {
  const rows = [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'ALL_WORKERS', EFFICIENCY_PCT: 90, PHYSICAL_PRESENT_DAYS_OVERRIDE: '', STATUS: 'VALID', ENTERED_AT: '2026-10-30T10:00:00' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'VFL4001', EFFICIENCY_PCT: 80, PHYSICAL_PRESENT_DAYS_OVERRIDE: 24, STATUS: 'VALID', ENTERED_AT: '2026-10-29T10:00:00' },
    { PAYROLL_MONTH: '2026-09', EMP_ID: 'VFL4002', EFFICIENCY_PCT: 10, STATUS: 'VALID' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'VFL4003', EFFICIENCY_PCT: 84, STATUS: 'VALID', ENTERED_AT: '2026-10-29T10:00:00' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'VFL4003', EFFICIENCY_PCT: '', STATUS: 'EXCEPTION', REMARKS: 'EFFICIENCY_OUT_OF_RANGE', ENTERED_AT: '2026-10-30T10:00:00' },
  ];
  const r = plain(ctx.efficiencyByEmp(rows, P, ['VFL4001', 'VFL4002', 'VFL4003']));
  assert.deepEqual(r.VFL4001, { pct: 80, physicalDaysOverride: 24, source: 'EMP' });
  assert.ok(!('VFL4002' in r), 'no blanket fallback');
  assert.ok(!('VFL4003' in r), 'invalid latest row: no fallback to the older 84');
  assert.deepEqual(plain(ctx.efficiencyExceptions(rows, P)).map((e) => [e.EMP_ID, e.reason]), [['VFL4003', 'EFFICIENCY_OUT_OF_RANGE']]);
  assert.deepEqual(plain(ctx.efficiencyByEmp(rows.slice(1, 2), P, ['VFL4002'])), {}); // no row for period -> missing
});

test('advance / society: APPROVED only, per period, summed', () => {
  const adv = [
    { PAYROLL_MONTH: new Date(2026, 9, 1), EMP_ID: 'A', RECOVERY_THIS_MONTH_INR: 1500, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10-01', EMP_ID: 'A', RECOVERY_THIS_MONTH_INR: 500, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', RECOVERY_THIS_MONTH_INR: 999, APPROVAL_STATUS: 'PENDING' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', RECOVERY_THIS_MONTH_INR: 100, APPROVAL_STATUS: '' },
    { PAYROLL_MONTH: '2026-11', EMP_ID: 'A', RECOVERY_THIS_MONTH_INR: 77, APPROVAL_STATUS: 'APPROVED' },
  ];
  assert.deepEqual(plain(ctx.advanceByEmp(adv, P)), { A: 2000 });
  const soc = [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'W', TOTAL_RECOVERY_INR: 4780, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'X', TOTAL_RECOVERY_INR: 10, APPROVAL_STATUS: 'PENDING' },
  ];
  assert.deepEqual(plain(ctx.societyByEmp(soc, P)), { W: 4780 });
});

function fakeSheet(headers, rows) {
  const calls = [];
  return {
    calls,
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getRange(r, c, nr, nc) {
      calls.push({ row: r, col: c, nrows: nr, ncols: nc });
      return { getValues: () => {
        const all = [headers, ...rows];
        return all.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc));
      } };
    },
  };
}

test('sheet read never touches a password column (OT and form tabs)', () => {
  const hdr = ['Timestamp', 'Submission Type', 'EMP ID', 'Date Of OT', 'OT Hours', 'Approval Decision',
    'Approval Password (HT)', 'Approval Password (HOD)', 'Approval Password Case No', 'Case No', 'Month'];
  const rows = [['2026-10-06 10:00:00', 'Approval Of Manager', 'VFL4001', '2026-10-05', 4.5, 'Approved', 'S1', 'S2', 'S3', 77, 'x']];
  const sh = fakeSheet(hdr, rows);
  const blk = plain(ctx.feeds_readColumns_(sh, ctx.FEEDS_OT_DEFS));
  const touched = new Set();
  sh.calls.forEach((c) => { for (let i = c.col; i < c.col + c.ncols; i++) if (c.row > 1 || c.nrows > 1 || c.ncols === hdr.length) touched.add(i); });
  sh.calls.filter((c) => !(c.row === 1 && c.nrows === 1 && c.col === 1)).forEach((c) => {
    for (let i = c.col; i < c.col + c.ncols; i++) assert.ok(!/password/i.test(hdr[i - 1]), `read column ${i}`);
  });
  assert.deepEqual(blk.header, ['Timestamp', 'Submission Type', 'EMP ID', 'Date Of OT', 'OT Hours', 'Approval Decision', 'Case No']);
  assert.equal(blk.rows.length, 1);
  assert.ok(!JSON.stringify(blk).includes('S1'));
  const m = plain(ctx.mapOtRows(blk.header, blk.rows, P, roster, []));
  assert.equal(m.valid.length, 1);
  assert.equal(m.valid[0].SOURCE_CASE_NOS, "'77");
  // form tab
  const fs = fakeSheet(['Timestamp', 'Payroll Month', 'Employee ID', 'Deduction amount (INR)', 'Password'], [['t', '2026-10', 'VFL4001', 5, 'pw']]);
  const fb = plain(ctx.feeds_readFormColumns_(fs));
  fs.calls.filter((c) => c.row > 1).forEach((c) => assert.ok(c.col + c.ncols - 1 <= 4));
  assert.ok(!JSON.stringify(fb).includes('pw'));
  // assertion + fail closed
  assert.throws(() => ctx.feeds_assertNoPassword_(hdr, [6]), /password/);
  const miss = plain(ctx.feeds_readColumns_(fakeSheet(['Timestamp', 'EMP ID'], [['t', 'x']]), ctx.FEEDS_OT_DEFS));
  assert.ok(miss.missing.length > 0);
  assert.equal(miss.rows.length, 0);
});

test('efficiency: hyphenated EMP_IDs are kept, "all workers" is an exception, correction-reason header with suffix is read', () => {
  const hdr = ['Timestamp', 'Payroll Month', 'Employee ID', 'Production Efficiency Percent', 'Submission type',
    'Previous submission reference (required if CORRECTION)', 'Correction reason (required if CORRECTION)'];
  const rost = [{ EMP_ID: 'TW-1', PAYROLL_CATEGORY: 'PERMANENT_WORKER' }];
  const r = plain(ctx.mapEfficiencyRows(hdr, [['2026-10-02 10:00:00', '2026-10', 'all workers', 90, 'NEW', '', ''],
    ['2026-10-02 10:00:00', '2026-10', 'tw-1', 82, 'CORRECTION', 'row 2', 'typo in first entry']], P, rost, []));
  assert.deepEqual(r.valid.map((x) => x.EMP_ID), ['TW-1']);
  assert.equal(r.valid[0].REMARKS, 'typo in first entry', 'correction reason picked up despite the "(required if CORRECTION)" suffix');
  assert.deepEqual(r.exceptions.map((x) => x.REMARKS), ['ALL_WORKERS_NOT_SUPPORTED']);
  const rows = [{ PAYROLL_MONTH: P, EMP_ID: 'ALL-WORKERS', EFFICIENCY_PCT: 90, STATUS: 'VALID' }, { PAYROLL_MONTH: P, EMP_ID: 'TW-1', EFFICIENCY_PCT: 82, STATUS: 'VALID' }];
  const m = plain(ctx.efficiencyByEmp(rows, P, ['TW-1', 'TW-2']));
  assert.equal(m['TW-1'].pct, 82);
  assert.ok(!('TW-2' in m));
});

// ================================================================ OT window, reversals, re-sync, manual rows
test('OT window: default = calendar month; OT_WINDOW_START_<period> moves the start (Sept catch-up from 26-Aug)', () => {
  assert.deepEqual(plain(ctx.feeds_otWindow('2026-10', {})), { start: '2026-10-01', end: '2026-10-31', overridden: false });
  assert.deepEqual(plain(ctx.feeds_otWindow('2026-09', { 'OT_WINDOW_START_2026-09': '2026-08-26' })), { start: '2026-08-26', end: '2026-09-30', overridden: true });
  assert.deepEqual(plain(ctx.feeds_otWindow('2026-09', { 'OT_WINDOW_START_2026-09': new Date(2026, 7, 26) })).start, '2026-08-26');
  assert.equal(ctx.feeds_otWindow('2026-10', { 'OT_WINDOW_START_2026-09': '2026-08-26' }).start, '2026-10-01', 'override is per period');
  assert.throws(() => ctx.feeds_otWindow('2026-09', { 'OT_WINDOW_START_2026-09': 'soon' }), /must be a date/);
  assert.throws(() => ctx.feeds_otWindow('2026-09', { 'OT_WINDOW_START_2026-09': '2026-10-02' }), /after the end/);
  const w = plain(ctx.feeds_otWindow('2026-09', { 'OT_WINDOW_START_2026-09': '2026-08-26' }));
  const rows = [ot({ date: '2026-08-25', kase: 1 }), ot({ date: '2026-08-26', emp: 'VFL4002', kase: 2 }), ot({ date: '2026-08-31', kase: 3 }),
    ot({ date: '2026-09-30', emp: 'VFL4002', kase: 4 }), ot({ date: '2026-10-01', kase: 5 })];
  const r = mapOt(rows, [], '2026-09', { windowStart: w.start, windowEnd: w.end });
  assert.deepEqual(r.valid.map((v) => v.OT_DATE), ['2026-08-26', '2026-08-31', '2026-09-30']);
  assert.ok(r.valid.every((v) => v.PAYROLL_MONTH === '2026-09'), 'catch-up days are paid in the September run');
  assert.equal(mapOt(rows, [], '2026-09').valid.length, 1, 'without the override only 30-Sep is in September');
});

test('OT reversals: latest decisive row wins by case (rejection excludes, corrected approval takes latest hours)', () => {
  const r = mapOt([
    ot({ kase: 700, h: 4, ts: '2026-10-06 10:00:00' }),
    ot({ kase: 700, h: 6, ts: '2026-10-07 10:00:00' }),                           // corrected approval -> 6 h
    ot({ kase: 701, emp: 'VFL4002', h: 5, ts: '2026-10-06 10:00:00' }),
    ot({ kase: 701, emp: 'VFL4002', dec: 'Rejected', ts: '2026-10-08 10:00:00' }), // rejected later -> nothing
    ot({ kase: 702, date: '2026-10-09', h: 3, ts: '2026-10-06 10:00:00' }),
    ot({ kase: 702, date: '2026-10-09', dec: 'Rejected', ts: '2026-10-07 10:00:00' }),
    ot({ kase: 702, date: '2026-10-09', h: 2.5, ts: '2026-10-08 10:00:00' }),      // re-approved after rejection -> 2.5
  ]);
  assert.deepEqual(r.valid.map((v) => [v.EMP_ID, v.OT_DATE, v.OT_HOURS]).sort(), [['VFL4001', '2026-10-05', 6], ['VFL4001', '2026-10-09', 2.5]]);
  assert.equal(r.exceptions.length, 0, 'a decision reversal is not an error');
  assert.equal(r.revokedCount, 1);
  assert.equal(r.correctedCount, 2, "cases 700 and 702 carry a corrected hours value");
  // no case number: grouped by EMP + date
  const n = mapOt([ot({ kase: '', h: 4, ts: '2026-10-06 10:00:00' }), ot({ kase: '', dec: 'Rejected', ts: '2026-10-07 10:00:00' })]);
  assert.equal(n.valid.length, 0);
});

test('OT re-sync plan: identical rows kept, changed/reversed rows superseded (hours zeroed, original kept), legacy + manual untouched', () => {
  const live = (o) => Object.assign({ PAYROLL_MONTH: '2026-10', EMP_ID: 'VFL4001', OT_HOURS: 4, SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'APPROVED',
    NORMALIZER_VERSION: 'OT-1.0', ELIGIBILITY: 'VALID', EXCEPTION_REASON: '' }, o);
  const existing = [
    live({ _row: 2, OT_KEY: 'VFL4001|2026-10-05|2' }),                    // unchanged
    live({ _row: 3, OT_KEY: 'VFL4001|2026-10-06|3', EMP_ID: 'VFL4002' }), // reversed (not in fresh any more)
    live({ _row: 4, OT_KEY: 'VFL4001|2026-10-07|4', OT_HOURS: 3 }),      // corrected: fresh has new row/key
    live({ _row: 5, OT_KEY: 'X|2026-10-08|5', ELIGIBILITY: 'SUPERSEDED' }),
    { _row: 6, PAYROLL_MONTH: '2026-10', EMP_ID: 'VFL4001', OT_HOURS: 9, SOURCE_REF: 'HR_MANUAL', APPROVAL_STATUS: 'APPROVED' },
    { _row: 7, PAYROLL_MONTH: '2026-08', EMP_ID: 'VFL4001', OT_HOURS: 99, SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'APPROVED' },
    live({ _row: 8, PAYROLL_MONTH: '2026-09', OT_KEY: 'VFL4001|2026-09-30|8' }),
  ];
  const fresh = [
    { OT_KEY: 'VFL4001|2026-10-05|2', OT_HOURS: 4, ELIGIBILITY: 'VALID', EXCEPTION_REASON: '' },
    { OT_KEY: 'VFL4001|2026-10-07|9', OT_HOURS: 5, ELIGIBILITY: 'VALID', EXCEPTION_REASON: '' },
  ];
  const plan = plain(ctx.feeds_planOtResync(existing, fresh, '2026-10'));
  assert.deepEqual(plan.supersede.map((r) => r._row), [3, 4]);
  assert.deepEqual(plan.append.map((r) => r.OT_KEY), ['VFL4001|2026-10-07|9']);
  assert.equal(plan.unchanged, 1);
  const v = plain(ctx.feeds_supersedeValues(existing[1], 'T'));
  assert.equal(v.ELIGIBILITY, 'SUPERSEDED');
  assert.equal(v.OT_HOURS, 0);
  assert.match(v.EXCEPTION_REASON, /SUPERSEDED_BY_RESYNC T \| WAS=VALID \| ORIGINAL_OT_HOURS=4/);
  assert.deepEqual(Object.keys(v).sort(), ['ELIGIBILITY', 'EXCEPTION_REASON', 'OT_HOURS']);
});

test('sumOtHours: SUPERSEDED never counts; HR_MANUAL rows (e.g. CON/BUNG staff) count when APPROVED and period >= MIN_PERIOD', () => {
  const rows = [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', OT_HOURS: 4, ELIGIBILITY: 'SUPERSEDED', NORMALIZER_VERSION: 'OT-1.0' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', OT_HOURS: 5, ELIGIBILITY: 'VALID', NORMALIZER_VERSION: 'OT-1.0' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'CON01', OT_HOURS: 12, SOURCE_REF: 'HR_MANUAL', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: new Date(2026, 9, 1), EMP_ID: 'con01', OT_HOURS: 3, SOURCE_REF: 'hr_manual', APPROVAL_STATUS: 'approved' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'BUNG23', OT_HOURS: 8, SOURCE_REF: 'HR_MANUAL', APPROVAL_STATUS: 'PENDING' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'BUNG24', OT_HOURS: 8, SOURCE_REF: 'HR_MANUAL', APPROVAL_STATUS: 'APPROVED', ELIGIBILITY: 'EXCEPTION' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'BUNG25', OT_HOURS: 'x', SOURCE_REF: 'HR_MANUAL', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-08', EMP_ID: 'CON01', OT_HOURS: 50, SOURCE_REF: 'HR_MANUAL', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'Z', OT_HOURS: 7, SOURCE_REF: 'OVERTIME_FORM', APPROVAL_STATUS: 'APPROVED' }, // legacy-style: no version
  ];
  assert.deepEqual(plain(ctx.sumOtHours(rows, '2026-10')), { A: 5, CON01: 15 });
  assert.deepEqual(plain(ctx.sumOtHours(rows, '2026-08')), {}, 'pre-MIN_PERIOD manual rows never count');
});

test('society: TOTAL_RECOVERY_INR, else component sum; both present and different -> WARN (total used)', () => {
  const soc = [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', TOTAL_RECOVERY_INR: '', GENERAL_EMI_INR: 1000, EMERGENCY_EMI_INR: 500, EDUCATION_EMI_INR: '', SHARES_OTHER_INR: 100, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', TOTAL_RECOVERY_INR: 1500, GENERAL_EMI_INR: 1000, EMERGENCY_EMI_INR: 500, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'C', TOTAL_RECOVERY_INR: 1000, GENERAL_EMI_INR: 1000, EMERGENCY_EMI_INR: 500, APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'D', TOTAL_RECOVERY_INR: '', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'E', GENERAL_EMI_INR: 900, APPROVAL_STATUS: 'PENDING' },
  ];
  assert.deepEqual(plain(ctx.societyByEmp(soc, P)), { A: 1600, B: 1500, C: 1000 });
  const w = plain(ctx.societyIssues(soc, P));
  assert.deepEqual(w.map((x) => [x.EMP_ID, x.severity, x.code]), [['C', 'WARN', 'SOCIETY_TOTAL_MISMATCH']]);
});

test('advance: WARN when recovery > opening balance; BLOCKER on duplicate ledger reference for the same EMP and period', () => {
  const adv = [
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', OPENING_BALANCE_INR: 1000, RECOVERY_THIS_MONTH_INR: 1500, ACCOUNTS_LEDGER_REFERENCE: 'L1', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'A', OPENING_BALANCE_INR: 5000, RECOVERY_THIS_MONTH_INR: 500, ACCOUNTS_LEDGER_REFERENCE: 'l1', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', OPENING_BALANCE_INR: 1000, RECOVERY_THIS_MONTH_INR: 500, ACCOUNTS_LEDGER_REFERENCE: 'L1', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', OPENING_BALANCE_INR: 1000, RECOVERY_THIS_MONTH_INR: 500, ACCOUNTS_LEDGER_REFERENCE: '', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'B', OPENING_BALANCE_INR: 1000, RECOVERY_THIS_MONTH_INR: 500, ACCOUNTS_LEDGER_REFERENCE: '', APPROVAL_STATUS: 'APPROVED' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'C', OPENING_BALANCE_INR: 1, RECOVERY_THIS_MONTH_INR: 999, ACCOUNTS_LEDGER_REFERENCE: 'L1', APPROVAL_STATUS: 'PENDING' },
    { PAYROLL_MONTH: '2026-10', EMP_ID: 'D', OPENING_BALANCE_INR: '', RECOVERY_THIS_MONTH_INR: 999, APPROVAL_STATUS: 'APPROVED' },
  ];
  const i = plain(ctx.advanceIssues(adv, P));
  assert.deepEqual(i.map((x) => [x.EMP_ID, x.severity, x.code]),
    [['A', 'WARN', 'ADVANCE_RECOVERY_EXCEEDS_BALANCE'], ['A', 'BLOCKER', 'ADVANCE_DUPLICATE_LEDGER_REFERENCE']]);
  assert.deepEqual(plain(ctx.advanceByEmp(adv, P)), { A: 2000, B: 1500, D: 999 });
});
