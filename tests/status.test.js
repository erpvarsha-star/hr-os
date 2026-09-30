'use strict';
// 60_Status.gs: payroll status engine (pure core with fakes + the thin sheet reader).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

const P = '2026-10', PREV = '2026-09';
const { c } = makeEnv();

const POPS = [{ code: 'STAFF', site: 'VFL' }, { code: 'PUNE_STAFF', site: 'PUNE' }];
const roster = [
  { EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF' }, { EMP_ID: 'S2', PAYROLL_CATEGORY: 'STAFF' }, { EMP_ID: 'S3', PAYROLL_CATEGORY: 'STAFF' },
  { EMP_ID: 'P1', PAYROLL_CATEGORY: 'PUNE_STAFF' },
];
const att = (id, o = {}) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, PRESENT_DAYS: 24, APPROVAL_STATUS: 'PENDING' }, o);
const base = (o = {}) => Object.assign({
  period: P, populations: POPS, roster, autoIds: {},
  feedStatus: { HOLIDAYS: 'COMPLETE' },
  periodCat: [{ PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 26 }, { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'PUNE_STAFF', WORKING_DAYS: 26 }],
  attendance: [att('S1'), att('S2', { APPROVAL_STATUS: 'APPROVED' }), att('S3'), att('P1')],
  otPendingRaw: JSON.stringify({ STAFF: 0, PUNE_STAFF: 0 }), otRows: [],
  canteenRows: [], societyRows: [], advanceRows: [],
}, o);
const run = (o) => plain(c.payrollStatusCompute(base(o)));
const item = (st, pop, key) => st.populations.find((p) => p.population === pop).items.find((i) => i.key === key);

test('item keys follow the FEED_STATUS feed names and the result shape', () => {
  const st = run();
  assert.deepEqual(st.populations[0].items.map((i) => i.key), ['HOLIDAYS', 'WORKING_DAYS', 'ATTENDANCE', 'OT', 'CANTEEN', 'SOCIETY', 'ADVANCE']);
  ['HOLIDAYS', 'CANTEEN', 'SOCIETY', 'ADVANCE', 'OT'].forEach((k) => assert.ok(plain(c.FEED_LIST).includes(k), k + ' is a FEED_LIST feed'));
  assert.equal(st.period, P);
  assert.deepEqual(Object.keys(st.overall).sort(), ['notReady', 'populations', 'ready']);
});

test('HOLIDAYS: ok only when the FEED_STATUS HOLIDAYS row is COMPLETE', () => {
  assert.equal(item(run(), 'STAFF', 'HOLIDAYS').ok, true);
  assert.equal(item(run({ feedStatus: { HOLIDAYS: 'OPEN' } }), 'STAFF', 'HOLIDAYS').ok, false);
  assert.equal(item(run({ feedStatus: {} }), 'STAFF', 'HOLIDAYS').ok, false);
});

test('WORKING_DAYS: per population; blank, zero, text, over the month and a missing row are not ok', () => {
  const pc = (wd) => [{ PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: wd }, { PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'PUNE_STAFF', WORKING_DAYS: 26 }];
  assert.equal(item(run(), 'STAFF', 'WORKING_DAYS').ok, true);
  [''.toString(), 0, 'abc', 32].forEach((v) => assert.equal(item(run({ periodCat: pc(v) }), 'STAFF', 'WORKING_DAYS').ok, false, String(v)));
  assert.equal(item(run({ periodCat: pc('') }), 'PUNE_STAFF', 'WORKING_DAYS').ok, true, 'other population unaffected');
  assert.equal(item(run({ periodCat: [] }), 'STAFF', 'WORKING_DAYS').ok, false);
  assert.equal(item(run({ periodCat: [{ PAYROLL_MONTH: PREV, PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 26 }] }), 'STAFF', 'WORKING_DAYS').ok, false, 'other period does not count');
});

test('ATTENDANCE: lists roster employees without a numeric present-days row, counts APPROVED vs PENDING, skips auto-attendance ids', () => {
  let st = run();
  assert.equal(item(st, 'STAFF', 'ATTENDANCE').ok, true);
  assert.match(item(st, 'STAFF', 'ATTENDANCE').detail, /3\/3 attendance entered \(1 APPROVED, 2 PENDING\)/);
  st = run({ attendance: [att('S1'), att('S3', { PRESENT_DAYS: '' }), att('P1')] });
  assert.deepEqual(item(st, 'STAFF', 'ATTENDANCE').missing, ['S2', 'S3']);
  assert.equal(item(st, 'STAFF', 'ATTENDANCE').ok, false);
  assert.equal(item(st, 'PUNE_STAFF', 'ATTENDANCE').ok, true);
  st = run({ attendance: [att('S1'), att('S2', { PRESENT_DAYS: 'x' }), att('S3', { PAYROLL_MONTH: PREV }), att('P1')] });
  assert.deepEqual(item(st, 'STAFF', 'ATTENDANCE').missing, ['S2', 'S3'], 'text and other-period rows do not count');
  st = run({ attendance: [att('S1'), att('S3'), att('P1')], autoIds: { S2: true } });
  assert.equal(item(st, 'STAFF', 'ATTENDANCE').ok, true, 'auto-attendance employee needs no row');
  assert.equal(item(run({ attendance: [att('S1', { PRESENT_DAYS: 0 }), att('S2'), att('S3'), att('P1')] }), 'STAFF', 'ATTENDANCE').ok, true, '0 days present is a value');
});

test('OT: not synced, pending events, synced-clean; UNKNOWN pending counts for everyone; HR_MANUAL / normalizer rows prove a sync', () => {
  assert.equal(item(run(), 'STAFF', 'OT').ok, true);
  let it = item(run({ otPendingRaw: undefined }), 'STAFF', 'OT');
  assert.equal(it.ok, false);
  assert.match(it.detail, /not synced/);
  it = item(run({ otPendingRaw: '' }), 'STAFF', 'OT');
  assert.equal(it.ok, false);
  it = item(run({ otPendingRaw: JSON.stringify({ STAFF: 2, PUNE_STAFF: 0 }) }), 'STAFF', 'OT');
  assert.equal(it.ok, false);
  assert.match(it.detail, /2 OT request/);
  assert.equal(item(run({ otPendingRaw: JSON.stringify({ STAFF: 2, PUNE_STAFF: 0 }) }), 'PUNE_STAFF', 'OT').ok, true, 'pending is per population');
  assert.equal(item(run({ otPendingRaw: JSON.stringify({ STAFF: 0, UNKNOWN: 1 }) }), 'PUNE_STAFF', 'OT').ok, false, 'UNKNOWN blocks every population');
  assert.equal(item(run({ otPendingRaw: undefined, otRows: [{ PAYROLL_MONTH: P, EMP_ID: 'S1', NORMALIZER_VERSION: 'OT-1.0' }] }), 'STAFF', 'OT').ok, true);
  assert.equal(item(run({ otPendingRaw: undefined, otRows: [{ PAYROLL_MONTH: P, EMP_ID: 'S1', SOURCE_REF: 'HR_MANUAL' }] }), 'STAFF', 'OT').ok, true);
  assert.equal(item(run({ otPendingRaw: undefined, otRows: [{ PAYROLL_MONTH: PREV, EMP_ID: 'S1', NORMALIZER_VERSION: 'OT-1.0' }] }), 'STAFF', 'OT').ok, false, 'other period does not count');
  assert.equal(item(run({ otPendingRaw: 'not json' }), 'STAFF', 'OT').ok, false);
});

const canteen = (id, p, o = {}) => Object.assign({ PAYROLL_MONTH: p, EMP_ID: id, AMOUNT_INR: 500, STATUS: 'VALID', ENTERED_AT: p + '-28T10:00:00' }, o);
const soc = (id, p, o = {}) => Object.assign({ PAYROLL_MONTH: p, EMP_ID: id, TOTAL_RECOVERY_INR: 1000, APPROVAL_STATUS: 'APPROVED' }, o);
const adv = (id, p, o = {}) => Object.assign({ PAYROLL_MONTH: p, EMP_ID: id, RECOVERY_THIS_MONTH_INR: 1000, CLOSING_BALANCE_INR: 0, APPROVAL_STATUS: 'APPROVED' }, o);

test('CANTEEN / SOCIETY / ADVANCE: expected = who had a counted row last month; 0 amount counts; new people are fine', () => {
  const st = run({
    canteenRows: [canteen('S1', PREV), canteen('S2', PREV), canteen('S3', PREV, { STATUS: 'EXCEPTION' }), canteen('S1', P), canteen('S9', P)],
    societyRows: [soc('S1', PREV), soc('S2', PREV, { APPROVAL_STATUS: 'PENDING' }), soc('S1', P, { TOTAL_RECOVERY_INR: 0, APPROVAL_STATUS: 'PENDING' })],
    advanceRows: [adv('S2', PREV), adv('S2', P, { RECOVERY_THIS_MONTH_INR: 0 }), adv('S1', PREV)],
  });
  const ca = item(st, 'STAFF', 'CANTEEN');
  assert.deepEqual([ca.ok, ca.missing], [false, ['S2']], 'S3 had only an EXCEPTION row (not counted) so is not expected; S9 is new');
  const so = item(st, 'STAFF', 'SOCIETY');
  assert.deepEqual([so.ok, so.missing], [true, []], 'S1 had an APPROVED row last month and has a (0, pending) row now; S2 PENDING last month is not expected');
  assert.match(so.detail, /1 not yet approved/);
  const ad = item(st, 'STAFF', 'ADVANCE');
  assert.deepEqual([ad.ok, ad.missing], [false, ['S1']]);
  // a person not on the active roster of the population is never listed (left / other population)
  const st2 = run({ canteenRows: [canteen('X9', PREV), canteen('P1', PREV)] });
  assert.deepEqual(item(st2, 'STAFF', 'CANTEEN').missing, []);
  assert.deepEqual(item(st2, 'PUNE_STAFF', 'CANTEEN').missing, ['P1'], 'per population');
  assert.equal(item(st2, 'STAFF', 'CANTEEN').ok, true);
});

test('ADVANCE: an employee whose latest earlier entry still has a positive balance is expected even without a last-month row', () => {
  const st = run({ advanceRows: [adv('S1', PREV), adv('S3', '2026-08', { CLOSING_BALANCE_INR: 4000 }), adv('S2', '2026-07', { CLOSING_BALANCE_INR: 0 }), adv('S1', P)] });
  assert.deepEqual(item(st, 'STAFF', 'ADVANCE').missing, ['S3']);
  assert.equal(item(run({ advanceRows: [adv('S1', PREV), adv('S3', '2026-08', { CLOSING_BALANCE_INR: 4000 }), adv('S3', '2026-09', { CLOSING_BALANCE_INR: 0 }), adv('S1', P)] }), 'STAFF', 'ADVANCE').missing.includes('S3'), true,
    'S3 has a last-month row (closing 0) so is expected by the same-people rule');
});

test('first month (no previous-month data): item needs the FEED_STATUS row COMPLETE and says why', () => {
  let st = run();
  ['CANTEEN', 'SOCIETY', 'ADVANCE'].forEach((k) => {
    const it = item(st, 'STAFF', k);
    assert.equal(it.ok, false, k);
    assert.match(it.detail, /no previous month to compare - HR confirms via Mark feed complete/);
    assert.deepEqual(it.missing, []);
  });
  st = run({ feedStatus: { HOLIDAYS: 'COMPLETE', CANTEEN: 'COMPLETE', SOCIETY: 'COMPLETE', ADVANCE: 'OPEN' } });
  assert.equal(item(st, 'STAFF', 'CANTEEN').ok, true);
  assert.equal(item(st, 'STAFF', 'SOCIETY').ok, true);
  assert.equal(item(st, 'STAFF', 'ADVANCE').ok, false);
  assert.match(item(st, 'STAFF', 'CANTEEN').detail, /marked COMPLETE/);
  // previous data for one feed only switches just that feed to the comparison rule
  st = run({ canteenRows: [canteen('S1', PREV), canteen('S1', P)] });
  assert.equal(item(st, 'STAFF', 'CANTEEN').ok, true);
  assert.doesNotMatch(item(st, 'STAFF', 'CANTEEN').detail, /no previous month/);
  assert.match(item(st, 'STAFF', 'SOCIETY').detail, /no previous month/);
});

test('population / overall readiness; a full set of inputs is ready', () => {
  const full = run({
    canteenRows: [canteen('S1', PREV), canteen('S1', P)], societyRows: [soc('S1', PREV), soc('S1', P)], advanceRows: [adv('S1', PREV), adv('S1', P)],
  });
  assert.equal(full.populations[0].ready, true);
  // previous-month data exists for the feed (anywhere), so Pune's expected set is simply empty: nothing missing
  assert.equal(full.populations[1].ready, true);
  assert.equal(full.ready, true);
  assert.deepEqual(full.overall.notReady, []);
  const partial = run({ canteenRows: [canteen('S1', PREV)], societyRows: [soc('S1', PREV), soc('S1', P)], advanceRows: [adv('S1', PREV), adv('S1', P)] });
  assert.equal(partial.ready, false);
  assert.deepEqual(partial.overall.notReady, ['STAFF']);
  const all = run({ feedStatus: { HOLIDAYS: 'COMPLETE', CANTEEN: 'COMPLETE', SOCIETY: 'COMPLETE', ADVANCE: 'COMPLETE' } });
  assert.equal(all.ready, true);
  assert.equal(all.overall.ready, true);
  assert.equal(run({ populations: [] }).ready, false, 'no populations is never ready');
});

test('digest text: up to 10 ids then +N more, site / key filters, onlyOpen', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ EMP_ID: 'E' + i, PAYROLL_CATEGORY: 'STAFF' }));
  const st = plain(c.payrollStatusCompute(base({ roster: many.concat([{ EMP_ID: 'P1', PAYROLL_CATEGORY: 'PUNE_STAFF' }]), attendance: [att('P1')] })));
  const t = c.statusDigestText(st, {}).text;
  assert.match(t, /E0, E1, E2, E3, E4, E5, E6, E7, E8, E9, \+4 more/);
  assert.match(t, /⏳ ATTENDANCE/);
  assert.match(t, /✅ HOLIDAYS/);
  const site = c.statusDigestText(st, { sites: ['PUNE'], onlyKeys: ['ATTENDANCE'], onlyOpen: true });
  assert.equal(site.populationsShown, 0, 'Pune attendance is complete: nothing to tell the Pune entry people');
  const vfl = c.statusDigestText(st, { sites: ['VFL'], onlyKeys: ['ATTENDANCE'], onlyOpen: true });
  assert.equal(vfl.populationsShown, 1);
  assert.doesNotMatch(vfl.text, /HOLIDAYS/);
  assert.doesNotMatch(vfl.text, /PUNE_STAFF/);
});

test('statusDigestPeriod / statusDefaultPeriod: previous calendar month, day 1-10 only, clamped to MIN_PERIOD', () => {
  assert.equal(c.statusDigestPeriod('2026-10-01'), '2026-09');
  assert.equal(c.statusDigestPeriod('2026-10-10'), '2026-09');
  assert.equal(c.statusDigestPeriod('2026-10-11'), '');
  assert.equal(c.statusDigestPeriod('2027-01-03'), '2026-12');
  assert.equal(c.statusDigestPeriod('garbage'), '');
  assert.equal(c.statusDefaultPeriod('2026-09-30', '2026-09'), '2026-09', 'clamped up to the minimum');
  assert.equal(c.statusDefaultPeriod('2026-11-05', '2026-09'), '2026-10');
});

test('payrollStatus(period) reads the sheets (roster, AUTO_FULL_ATTENDANCE ids, feeds, OT pending, previous month)', () => {
  const env = makeEnv();
  env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [
    { KEY: 'AUTO_FULL_ATTENDANCE_EMP_IDS', VALUE: 'S2' }, { KEY: 'OT_PENDING_2026-10', VALUE: '{"STAFF":0,"PUNE_STAFF":0}' }]);
  env.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DOJ_AS_SOURCE'], [
    { EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'S2', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'S3', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Non-Active', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'J1', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '15/11/2026' }]);
  env.put('PAYROLL_PERIOD_CATEGORY', ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS'], [{ PAYROLL_MONTH: P, PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 27, STATUS: 'PENDING' }]);
  env.put('FEED_STATUS', ['PERIOD', 'FEED', 'STATUS'], [{ PERIOD: P, FEED: 'HOLIDAYS', STATUS: 'COMPLETE' }]);
  env.put('INPUT_ATTENDANCE', ['PAYROLL_MONTH', 'EMP_ID', 'PRESENT_DAYS', 'APPROVAL_STATUS'], [{ PAYROLL_MONTH: P, EMP_ID: 'S1', PRESENT_DAYS: 25, APPROVAL_STATUS: 'APPROVED' }]);
  env.put('INPUT_OT', ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'NORMALIZER_VERSION']);
  env.put('INPUT_CANTEEN', ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'STATUS', 'ENTERED_AT'], [{ PAYROLL_MONTH: '2026-09', EMP_ID: 'S1', AMOUNT_INR: 100, STATUS: 'VALID' }]);
  env.put('INPUT_SOCIETY', ['PAYROLL_MONTH', 'EMP_ID', 'TOTAL_RECOVERY_INR', 'APPROVAL_STATUS']);
  env.put('INPUT_ADVANCE', ['PAYROLL_MONTH', 'EMP_ID', 'CLOSING_BALANCE_INR', 'APPROVAL_STATUS']);
  env.put('AUDIT_LOG', ['Timestamp', 'Module', 'Status', 'User', 'Message']);
  const before = JSON.stringify(Object.values(env.sheets).map((s) => s.data));
  const st = plain(env.c.payrollStatus(P));
  assert.equal(JSON.stringify(Object.values(env.sheets).map((s) => s.data)), before, 'the reader writes nothing');
  const staff = st.populations.find((p) => p.population === 'STAFF');
  const get = (k) => staff.items.find((i) => i.key === k);
  assert.equal(staff.employees, 2, 'S1 and S2 (S3 is Non-Active, J1 joins after the period)');
  assert.equal(get('ATTENDANCE').ok, true, 'S2 is an AUTO_FULL_ATTENDANCE id: only S1 needs a row');
  assert.equal(get('WORKING_DAYS').ok, true);
  assert.equal(get('HOLIDAYS').ok, true);
  assert.equal(get('OT').ok, true);
  assert.equal(get('CANTEEN').ok, false, 'S1 had canteen last month and has no row now');
  assert.deepEqual(get('CANTEEN').missing, ['S1']);
  assert.match(get('SOCIETY').detail, /no previous month to compare/);
  assert.equal(st.ready, false);
});
