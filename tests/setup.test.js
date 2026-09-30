'use strict';
// Setup on an EMPTY spreadsheet (only Google-Form response tabs) builds every tab the code uses.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

function emptyWorld() {
  const env = makeEnv({ user: 'owner@varshaforgings.com' });
  ['OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'].forEach((n) => env.put(n, ['Timestamp', 'x'], []));
  return env;
}

test('setup creates every tab with exact headers, seeds, hides + protects the sensitive tabs, orders the tabs', () => {
  const env = emptyWorld();
  const log = plain(env.c.hrosSetup());
  const specs = env.c.hrosTabSpecs_();
  specs.forEach((sp) => {
    assert.ok(env.sheets[sp.name], 'tab ' + sp.name);
    assert.deepEqual(env.sheets[sp.name].data[0].slice(0, sp.headers.length), plain(sp.headers), sp.name + ' header');
  });
  // every tab the code names in TABS (except the form-created raw tabs) is built
  const tabs = plain(env.c.TABS);
  Object.keys(tabs).filter((k) => !/^ATT_(FORM|MONTHLY)_/.test(k)).forEach((k) => {
    if (/^PAYROLL_(STAFF|WORKER|CONSULTANT|PUNE_STAFF)$/.test(k)) assert.ok(env.sheets[tabs[k]], k);
    else assert.ok(env.sheets[tabs[k]], k + ' -> ' + tabs[k]);
  });
  // hidden + protected
  ['EMPLOYEE_STATUTORY_IDS', 'PAYROLL_LOCKED'].forEach((n) => {
    assert.equal(env.sheets[n].hidden, true, n + ' hidden');
    assert.equal(env.sheets[n].protections.length, 1, n + ' protected');
  });
  assert.deepEqual(env.sheets.EMPLOYEE_STATUTORY_IDS.protections[0].editors.sort(), ['hr@varshaforgings.com', 'owner@varshaforgings.com', 'yash.munot@gmail.com'].sort().filter((x, i, a) => a.indexOf(x) === i).concat([]).sort());
  assert.equal(env.sheets.PAYROLL_CONTROL.hidden, false);
  assert.equal(env.sheets.EMPLOYEE_MASTER.hidden, false);
  assert.ok(log.hidden.includes('EMPLOYEE_STATUTORY_IDS') && log.hidden.includes('PAYROLL_LOCKED'));
  // seeds
  const ctl = Object.fromEntries(env.rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]));
  assert.equal(ctl.MIN_PERIOD, '2026-09');
  assert.equal(ctl.OT_SOURCE_TAB, 'OT_FORM_RESPONSES');
  assert.equal(env.rowsOf('PAYROLL_CATEGORY_CONFIG').map((r) => r.CATEGORY_CODE).join(), 'STAFF,PERMANENT_WORKER,CONSULTANT,PUNE_STAFF');
  assert.ok(env.rowsOf('PAYROLL_CATEGORY_CONFIG').every((r) => r.APPROVED_BY === ''));
  assert.equal(env.rowsOf('PT_EXEMPTIONS').length, 3);
  assert.equal(env.rowsOf('STATUTORY_CONFIG').length, 12);
  // order: Control -> Config -> Masters -> Monthly inputs -> Attendance -> Payroll -> Payslips -> Audit, forms next to what they feed
  const order = Object.keys(env.sheets);
  const at = (n) => order.indexOf(n);
  const seq = ['PAYROLL_CONTROL', 'PAYROLL_CATEGORY_CONFIG', 'EMPLOYEE_MASTER', 'INPUT_OT', 'OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'INPUT_ATTENDANCE', 'PAYROLL_READINESS',
    'PAYROLL_DRAFT', 'PAYROLL_STAFF', 'PAYROLL_LOCKED', 'PAYSLIP_REGISTER', 'AUDIT_LOG'];
  seq.forEach((n, i) => { assert.ok(at(n) >= 0, n); if (i) assert.ok(at(n) > at(seq[i - 1]), n + ' after ' + seq[i - 1]); });
  assert.equal(order[0], 'PAYROLL_CONTROL');
  // idempotent
  const snap = JSON.stringify(Object.keys(env.sheets).map((k) => [k, env.sheets[k].data.length, env.sheets[k].protections.length]));
  const auditN = env.rowsOf('AUDIT_LOG').length;
  const log2 = plain(env.c.hrosSetup());
  assert.equal(log2.createdTabs.length, 0);
  assert.equal(log2.protectedTabs.length, 0);
  assert.equal(JSON.stringify(Object.keys(env.sheets).map((k) => [k, env.sheets[k].data.length, env.sheets[k].protections.length])).replace(/AUDIT_LOG",\d+/, ''), snap.replace(/AUDIT_LOG",\d+/, ''));
  assert.equal(env.rowsOf('AUDIT_LOG').length, auditN + 1);
  // the code can run on the fresh sheet: prepareMonth, category approval
  assert.equal(plain(env.c.prepareMonth('2026-09')).periodRowsAdded, 4);
});

test('a configured 5th category gets its PAYROLL_<CODE> tab on setup', () => {
  const env = emptyWorld();
  env.put('PAYROLL_CATEGORY_CONFIG', plain(env.c.CATEGORY_CONFIG_HEADERS), [{ CATEGORY_CODE: 'CONTRACT_NSK', CALC_METHOD: 'CONSULTANT', SITE: 'VFL', PAYSLIP: 'N', RATE_SOURCE: 'RATE_PROFILE', ACTIVE: 'Y' }]);
  env.c.hrosSetup();
  assert.deepEqual(env.sheets.PAYROLL_CONTRACT_NSK.data[0], plain(env.c.HROS_OUTPUT_COLUMNS));
  assert.equal(env.sheets.PAYROLL_STAFF, undefined, 'only configured categories');
});

test('setup removes an empty _TEMP tab, but keeps one that holds data', () => {
  const env = emptyWorld();
  env.put('_TEMP', [], []);
  env.sheets._TEMP.data = [];
  env.c.hrosSetup();
  assert.equal(env.sheets._TEMP, undefined, 'empty _TEMP removed');
  const env2 = emptyWorld();
  env2.put('_TEMP', ['note'], [{ note: 'keep me' }]);
  env2.c.hrosSetup();
  assert.ok(env2.sheets._TEMP, 'non-empty _TEMP kept');
});

// ---- one-time NASHIK -> VFL migration ----
const fs = require('node:fs');
const path = require('node:path');
const CTL_H = ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'];
function oldWorld(opts = {}) {
  const unlinked = [];
  const env = makeEnv({ user: 'owner@varshaforgings.com', globals: { FormApp: { openByUrl: (u) => { if (opts.formGone) throw new Error('gone'); return { removeDestination: () => unlinked.push(u) }; } } } });
  ['OT_FORM_RESPONSES', 'CANTEEN_FORM_RESPONSES', 'EFFICIENCY_FORM_RESPONSES'].forEach((n) => env.put(n, ['Timestamp', 'x'], []));
  env.c.hrosSetup();
  // turn the freshly set-up sheet back into the pre-rename state
  env.editCells('PAYROLL_CATEGORY_CONFIG', { SITE: 'VFL' }, { SITE: ' nashik ' });
  env.editCells('PAYROLL_CATEGORY_CONFIG', { CATEGORY_CODE: 'STAFF' }, { APPROVED_BY: 'owner@varshaforgings.com', APPROVED_AT: '2026-09-20' });
  env.editCells('PAYROLL_CONTROL', { KEY: 'VFL_WEEKLY_OFF' }, { KEY: 'NASHIK_WEEKLY_OFF', VALUE: 'MON' });
  env.addRows('PAYROLL_CONTROL', [{ KEY: 'ATT_FORM_NASHIK_ID', VALUE: 'FORM1' }]);
  env.put('HOLIDAY_CALENDAR', plain(env.c.hrosTabSpecs_().find((s) => s.name === 'HOLIDAY_CALENDAR').headers),
    [{ DATE: '2026-10-02', SITE: 'NASHIK', HOLIDAY_NAME: 'Gandhi', PAID: 'Y' }, { DATE: '2026-10-03', SITE: 'PUNE', HOLIDAY_NAME: 'x', PAID: 'Y' }]);
  const raw = env.put('ATT_FORM_NASHIK_RAW', ['Timestamp', 'Date'], opts.responses ? [{ Timestamp: 't', Date: 'd' }] : []);
  raw.formUrl = 'https://forms/old';
  return { env, unlinked };
}
const ctlMap = (env) => Object.fromEntries(env.rowsOf('PAYROLL_CONTROL').map((r) => [r.KEY, r.VALUE]));

test('hrosMigrateSiteToVfl: relabels sites, moves weekly-off key, drops old form id, deletes the empty old raw tab', () => {
  const { env, unlinked } = oldWorld();
  const ch = plain(env.c.hrosMigrateSiteToVfl());
  assert.ok(ch.length >= 5);
  assert.ok(env.rowsOf('PAYROLL_CATEGORY_CONFIG').filter((r) => r.CATEGORY_CODE !== 'PUNE_STAFF').every((r) => r.SITE === 'VFL'));
  assert.equal(env.rowsOf('PAYROLL_CATEGORY_CONFIG').find((r) => r.CATEGORY_CODE === 'PUNE_STAFF').SITE, 'PUNE');
  assert.deepEqual(env.rowsOf('HOLIDAY_CALENDAR').map((r) => r.SITE), ['VFL', 'PUNE']);
  const ctl = ctlMap(env);
  assert.equal(ctl.VFL_WEEKLY_OFF, 'MON');
  assert.ok(!('NASHIK_WEEKLY_OFF' in ctl) && !('ATT_FORM_NASHIK_ID' in ctl));
  assert.ok(!env.sheets.ATT_FORM_NASHIK_RAW && !env.sheets.ATT_FORM_NASHIK_OLD);
  assert.deepEqual(unlinked, ['https://forms/old']);
  assert.equal(env.c.getWeeklyOff('VFL'), 'MON');
});

test('hrosMigrateSiteToVfl: existing VFL_WEEKLY_OFF wins, old row just removed; already-deleted form does not break it', () => {
  const { env } = oldWorld({ formGone: true });
  env.addRows('PAYROLL_CONTROL', [{ KEY: 'VFL_WEEKLY_OFF', VALUE: 'SAT' }]);
  const ch = plain(env.c.hrosMigrateSiteToVfl());
  assert.ok(ch.some((c) => /could not unlink/.test(c)));
  assert.equal(ctlMap(env).VFL_WEEKLY_OFF, 'SAT');
  assert.equal(env.rowsOf('PAYROLL_CONTROL').filter((r) => /WEEKLY_OFF/.test(r.KEY) && /^(NASHIK|VFL)/.test(r.KEY)).length, 1);
  assert.ok(!env.sheets.ATT_FORM_NASHIK_RAW);
});

test('hrosMigrateSiteToVfl: old raw tab with responses is renamed to ATT_FORM_NASHIK_OLD, never deleted', () => {
  const { env } = oldWorld({ responses: true });
  env.c.hrosMigrateSiteToVfl();
  assert.ok(!env.sheets.ATT_FORM_NASHIK_RAW);
  assert.equal(env.sheets.ATT_FORM_NASHIK_OLD.getName(), 'ATT_FORM_NASHIK_OLD');
  assert.equal(env.rowsOf('ATT_FORM_NASHIK_OLD').length, 1);
});

test('hrosMigrateSiteToVfl: second run is a no-op (and Setup runs it first)', () => {
  const { env } = oldWorld({ responses: true });
  const log = plain(env.c.hrosSetup());
  assert.ok(log.siteMigration.length > 0);
  const snap = JSON.stringify(Object.keys(env.sheets).map((k) => [k, env.sheets[k].data]));
  assert.deepEqual(plain(env.c.hrosMigrateSiteToVfl()), []);
  assert.deepEqual(plain(env.c.hrosSetup().siteMigration), []);
  assert.equal(JSON.stringify(Object.keys(env.sheets).map((k) => [k, env.sheets[k].data])).replace(/AUDIT_LOG.*/, ''), snap.replace(/AUDIT_LOG.*/, ''));
});

test('hrosMigrateSiteToVfl: category approval survives the relabel (APPROVED_BY untouched, approval gate has no SITE hash)', () => {
  const { env } = oldWorld();
  env.editCells('PAYROLL_CATEGORY_CONFIG', { CATEGORY_CODE: 'PERMANENT_WORKER' }, { APPROVED_BY: 'owner@varshaforgings.com' });
  const approvedBefore = env.rowsOf('PAYROLL_CATEGORY_CONFIG').map((r) => [r.CATEGORY_CODE, r.APPROVED_BY, r.APPROVED_AT]);
  env.c.hrosMigrateSiteToVfl();
  assert.deepEqual(env.rowsOf('PAYROLL_CATEGORY_CONFIG').map((r) => [r.CATEGORY_CODE, r.APPROVED_BY, r.APPROVED_AT]), approvedBefore);
  const staff = plain(env.c.categoryEntry('STAFF'));
  assert.equal(staff.site, 'VFL');
  assert.equal(staff.approvedBy, 'owner@varshaforgings.com');
});

// the live sheet still has the OLD SITE list (no VFL) built with setAllowInvalid(false)
function oldSiteValidation(env) {
  [['PAYROLL_CATEGORY_CONFIG', ['NASHIK', 'PUNE']], ['HOLIDAY_CALENDAR', ['NASHIK', 'PUNE', 'ALL']]].forEach(([tab, list]) => {
    const sh = env.sheets[tab], col = sh.data[0].indexOf('SITE') + 1;
    for (let r = 2; r <= 1000; r++) sh.validations[r + ',' + col] = { list, allowInvalid: false };
  });
}

test('hrosSetup on a sheet with the old reject-invalid SITE validation migrates NASHIK -> VFL and re-validates with VFL', () => {
  const { env } = oldWorld();
  oldSiteValidation(env);
  const sh = env.sheets.PAYROLL_CATEGORY_CONFIG, col = sh.data[0].indexOf('SITE') + 1;
  assert.throws(() => sh.getRange(2, col).setValues([['VFL']]), /data validation/, 'the fake enforces the old list');
  env.c.hrosSetup();
  assert.ok(env.rowsOf('PAYROLL_CATEGORY_CONFIG').filter((r) => r.CATEGORY_CODE !== 'PUNE_STAFF').every((r) => r.SITE === 'VFL'));
  assert.deepEqual(env.rowsOf('HOLIDAY_CALENDAR').map((r) => r.SITE), ['VFL', 'PUNE']);
  assert.ok(sh.clearedValidations.some((c) => c.c === col && c.r === 2), 'SITE validation cleared before the write');
  assert.deepEqual(plain(sh.validationAt(2, col).list), ['VFL', 'PUNE']);
  const hol = env.sheets.HOLIDAY_CALENDAR;
  assert.deepEqual(plain(hol.validationAt(2, hol.data[0].indexOf('SITE') + 1).list), ['VFL', 'PUNE', 'ALL']);
});

test('legacy NASHIK rows work before the migration has run', () => {
  const { env } = oldWorld();
  env.c.categoryConfigReset_();
  assert.equal(env.rowsOf('PAYROLL_CATEGORY_CONFIG').find((r) => r.CATEGORY_CODE === 'STAFF').SITE.trim().toLowerCase(), 'nashik');
  assert.equal(env.c.categoryEntry('STAFF').site, 'VFL');
  assert.equal(env.c.siteForPopulation('STAFF'), 'VFL');
  assert.equal(env.c.siteForPopulation('PUNE_STAFF'), 'PUNE');
});

test('a NASHIK holiday row still applies to VFL (and not to PUNE)', () => {
  const hol = [{ DATE: '2026-10-02', SITE: 'NASHIK', PAID: 'Y' }];
  const { env } = oldWorld();
  assert.equal(env.c.isPaidHoliday_(hol, '2026-10-02', 'VFL'), true);
  assert.equal(env.c.isPaidHoliday_(hol, '2026-10-02', 'PUNE'), false);
  assert.deepEqual(plain(env.c.paidHolidayDatesInMonth('2026-10', hol, 'VFL')), ['2026-10-02']);
});

test('no NASHIK left in apps-script/ except inside hrosMigrateSiteToVfl and lines tagged legacy-alias', () => {
  const dir = path.join(__dirname, '..', 'apps-script');
  const bad = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).forEach((f) => {
    let inMig = false;
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^function hrosMigrateSiteToVfl\b/.test(line)) inMig = true;
      if (/nashik/i.test(line) && !inMig && !/\/\/ legacy-alias\s*$/.test(line)) bad.push(f + ':' + (i + 1));
      if (inMig && /^}/.test(line)) inMig = false;
    });
  });
  assert.deepEqual(bad, []);
});
