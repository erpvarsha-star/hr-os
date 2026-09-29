'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');
const { P, HR, OWNER, world } = require('./regenv');

// ---------------------------------------------------------------- pure derivation
const pure = loadGs(['00_Config.gs', '01_SheetUtil.gs', '99_Audit.gs', '10_Attendance.gs', '12_Register.gs']);
const derive = (reg, inc, pop = 'STAFF', over = {}) => plain(pure.deriveMonthlyAttendance(reg, inc, pop, over.period || P, over.site || 'NASHIK',
  over.holidays || [], over.wo || 'SUN', over.leave || {}));
const hol = (DATE, SITE, PAID = 'Y') => ({ DATE, SITE, HOLIDAY_NAME: 'h', PAID });

test('derive: EXCLUDES weekly offs (default) - present is used as entered, week-off added from the calendar', () => {
  const d = derive(22, false);
  assert.deepEqual([d.ok, d.PRESENT_DAYS, d.PHYSICAL_PRESENT_DAYS, d.WEEK_OFF, d.PH, d.WORKED_DAYS], [true, 22, 22, 4, 0, 26]);
  assert.equal(d.REGISTER_INCLUDES_WO, 'N');
  assert.deepEqual([d.EL_AVAILED, d.CL_AVAILED, d.SL_AVAILED, d.PAID_LEAVE_OTHER, d.ABSENT_LWP_DAYS], [0, 0, 0, 0, 0]);
  assert.deepEqual(d.exceptions, []);
});

test('derive: INCLUDES weekly offs - week-off count is subtracted (min 0, WARN when negative)', () => {
  const d = derive(26, true);
  assert.deepEqual([d.PRESENT_DAYS, d.PHYSICAL_PRESENT_DAYS, d.WEEK_OFF, d.WORKED_DAYS], [22, 22, 4, 26]);
  assert.equal(d.REGISTER_INCLUDES_WO, 'Y');
  assert.equal(derive(26, 'Y').PRESENT_DAYS, 22, "'Y' text is accepted");
  const low = derive(3, true);
  assert.equal(low.PRESENT_DAYS, 0);
  assert.ok(low.warnings.some((w) => w.code === 'REGISTER_LESS_THAN_WEEK_OFF'));
});

test('derive: PERMANENT_WORKER has no week-off component (INCLUDES is ignored with a WARN)', () => {
  const ex = derive(22, false, 'PERMANENT_WORKER');
  assert.deepEqual([ex.WEEK_OFF, ex.PRESENT_DAYS, ex.WORKED_DAYS], [0, 22, 22]);
  const inc = derive(26, true, 'PERMANENT_WORKER');
  assert.deepEqual([inc.WEEK_OFF, inc.PRESENT_DAYS], [0, 26]);
  assert.ok(inc.warnings.some((w) => w.code === 'REGISTER_WO_IGNORED_FOR_WORKER'));
});

test('derive: paid holiday on the weekly off counts as week-off nowhere twice (WEEK_OFF excludes it, PH excludes it)', () => {
  // 2026-09-13 is a Sunday (weekly off) AND a paid holiday; 2026-09-14 is a Monday paid holiday
  const d = derive(20, false, 'STAFF', { holidays: [hol('2026-09-13', 'ALL'), hol('2026-09-14', 'ALL')] });
  assert.equal(d.WEEK_OFF, 3, 'Sundays 6, 20, 27 (13 is a paid holiday)');
  assert.equal(d.PH, 1, 'only the Monday: the holiday on the weekly off is not a PH');
  assert.equal(d.WORKED_DAYS, 24);
  // worker: no WEEK_OFF, but the Monday PH still counts
  const w = derive(20, false, 'PERMANENT_WORKER', { holidays: [hol('2026-09-13', 'ALL'), hol('2026-09-14', 'ALL')] });
  assert.deepEqual([w.WEEK_OFF, w.PH], [0, 1]);
});

test('derive: holidays respect the SITE (site or ALL), PAID=Y, and the month', () => {
  const holidays = [hol('2026-09-15', 'PUNE'), hol('2026-09-16', 'ALL'), hol('2026-09-17', 'NASHIK', 'N'), hol('2026-10-01', 'ALL'), hol('2026-09-18', 'NASHIK')];
  assert.equal(derive(20, false, 'STAFF', { holidays, site: 'NASHIK' }).PH, 2, '16 (ALL) and 18 (NASHIK)');
  assert.equal(derive(20, false, 'PUNE_STAFF', { holidays, site: 'PUNE' }).PH, 2, '15 (PUNE) and 16 (ALL)');
});

test('derive: weekly-off weekday comes from the site control (SAT)', () => {
  // Saturdays of September 2026: 5, 12, 19, 26
  assert.equal(derive(22, false, 'PUNE_STAFF', { site: 'PUNE', wo: 'SAT' }).WEEK_OFF, 4);
  assert.throws(() => derive(22, false, 'STAFF', { wo: 'XXX' }), /Invalid weekly off/);
  assert.throws(() => derive(22, false, 'NOPE'), /Unknown population/);
});

test('derive: approved leave fills EL/CL/SL/C-Off/LWP; OD is ADDED to PRESENT_DAYS but not to PHYSICAL', () => {
  const d = derive(18, false, 'STAFF', { leave: { EL: 1, CL: 2, SL: 0.5, OD: 2, COFF: 1, LWP: 3 } });
  assert.deepEqual([d.EL_AVAILED, d.CL_AVAILED, d.SL_AVAILED, d.PAID_LEAVE_OTHER, d.ABSENT_LWP_DAYS], [1, 2, 0.5, 1, 3]);
  assert.equal(d.PHYSICAL_PRESENT_DAYS, 18, 'physical excludes OD');
  assert.equal(d.PRESENT_DAYS, 20, 'OD is worked');
  assert.equal(d.OD_DAYS, 2);
  assert.equal(d.WORKED_DAYS, 20 + 4 + 0 + 1 + 2 + 0.5 + 1, 'LWP is unpaid: not part of worked days');
  assert.deepEqual(d.exceptions, []);
  // with INCLUDES the OD is still added after the week-off subtraction
  const inc = derive(22, true, 'STAFF', { leave: { OD: 1 } });
  assert.deepEqual([inc.PHYSICAL_PRESENT_DAYS, inc.PRESENT_DAYS], [18, 19]);
});

test('derive: present + WO + PH + EL + CL + SL + other paid leave over the month -> employee-level ATTENDANCE_OVER_MONTH', () => {
  const over = derive(28, false);
  assert.equal(over.ok, true);
  assert.deepEqual(over.exceptions.map((e) => [e.severity, e.code]), [['BLOCKER', 'ATTENDANCE_OVER_MONTH']]);
  assert.match(over.exceptions[0].message, /32 exceeds the 30 days/);
  const withLeave = derive(24, false, 'STAFF', { leave: { EL: 3 } });
  assert.equal(withLeave.exceptions[0].code, 'ATTENDANCE_OVER_MONTH'); // 24 + 4 + 3 = 31
  assert.deepEqual(derive(23, false, 'STAFF', { leave: { EL: 3 } }).exceptions, []); // 30 exactly is fine
  // LWP and OD-free: unpaid leave never causes it
  assert.deepEqual(derive(22, false, 'STAFF', { leave: { LWP: 20 } }).exceptions, []);
});

test('derive: invalid register days are refused (range, step 0.5, non-numbers)', () => {
  [-1, 31, 10.3, 'abc', '', null, true].forEach((v) => {
    const d = derive(v, false);
    assert.equal(d.ok, false, String(v));
    assert.equal(d.exceptions[0].code, 'REGISTER_DAYS_INVALID');
  });
  assert.equal(derive(0, false).ok, true);
  assert.equal(derive(30, true).ok, true);
  assert.equal(derive(10.5, false).ok, true);
  assert.equal(derive(5, false, 'STAFF', { leave: { EL: -1 } }).exceptions[0].code, 'LEAVE_DAYS_INVALID');
});

test('applyPhysicalOverride: decided days replace physical + present (OD stays additive) and the month is re-checked', () => {
  const d = derive(18, false, 'STAFF', { leave: { OD: 2 } });
  const o = plain(pure.applyPhysicalOverride(d, 20, 'STAFF', P));
  assert.deepEqual([o.PHYSICAL_PRESENT_DAYS, o.PRESENT_DAYS, o.WORKED_DAYS], [20, 22, 26]);
  assert.deepEqual(o.exceptions, []);
  assert.equal(plain(pure.applyPhysicalOverride(d, 27, 'STAFF', P)).exceptions[0].code, 'ATTENDANCE_OVER_MONTH');
  assert.throws(() => pure.applyPhysicalOverride(d, 31, 'STAFF', P), /Decided days/);
});

test('pickDefaultRegisterPeriod / registerUserAllowed / validateRegisterEntries', () => {
  const rows = [{ PAYROLL_MONTH: '2026-09', STATUS: 'LOCKED' }, { PAYROLL_MONTH: '2026-10-01', STATUS: 'PENDING' }, { PAYROLL_MONTH: '2026-11', STATUS: 'LOCKED' },
    { PAYROLL_MONTH: '2026-08', STATUS: 'PENDING' }];
  assert.equal(pure.pickDefaultRegisterPeriod(rows, '2026-09', '2026-12'), '2026-10', 'latest period that still has an open population, never before MIN');
  assert.equal(pure.pickDefaultRegisterPeriod([], '2026-09', '2026-12'), '2026-12');
  assert.equal(pure.pickDefaultRegisterPeriod([], '2026-09', '2026-05'), '2026-09');
  assert.equal(pure.registerUserAllowed('HR@varshaforgings.com', HR, OWNER, ''), true);
  assert.equal(pure.registerUserAllowed(OWNER, HR, OWNER, ''), true);
  assert.equal(pure.registerUserAllowed('clerk@x.com', HR, OWNER, 'a@x.com, clerk@x.com'), true);
  assert.equal(pure.registerUserAllowed('clerk@x.com', HR, OWNER, ''), false);
  assert.equal(pure.registerUserAllowed('', HR, OWNER, ''), false, 'unknown user: never');
  const map = { S1: {}, S2: {} };
  const v = plain(pure.validateRegisterEntries([{ empId: 'S1', days: '22' }, { empId: 'S2', days: '' }, { empId: 'S1', days: 3 }, { empId: 'ZZ', days: 4 },
    { empId: 'S2', days: 10.3 }], map, P));
  assert.equal(v.entries.length, 1);
  assert.deepEqual(v.notEntered, ['S2']);
  assert.equal(v.errors.length, 3);
});

// ---------------------------------------------------------------- server side
const att = (id, cat, over = {}) => Object.assign({ PAYROLL_MONTH: P, EMP_ID: id, PAYROLL_CATEGORY: cat, WORKING_DAYS: 26, APPROVAL_STATUS: 'PENDING' }, over);

test('registerSubmit writes PENDING rows: derived components, REGISTER source, who / when, snapshot; audits', () => {
  const env = world({ holidays: [{ DATE: '2026-09-14', SITE: 'ALL', HOLIDAY_NAME: 'x', PAID: 'Y' }] });
  const r = plain(env.c.registerSubmit({ period: P, includesWO: { STAFF: 'N', PERMANENT_WORKER: 'Y' },
    entries: [{ empId: 'S1', days: 22 }, { empId: 'W1', days: 25 }, { empId: 'S2', days: '' }] }));
  assert.deepEqual([r.written, r.created, r.updated, r.notEntered], [2, 2, 0, ['S2']]);
  const rows = env.rowsOf('INPUT_ATTENDANCE');
  const s1 = rows.find((x) => x.EMP_ID === 'S1'), w1 = rows.find((x) => x.EMP_ID === 'W1');
  assert.deepEqual([s1.PRESENT_DAYS, s1.PHYSICAL_PRESENT_DAYS, s1.WEEK_OFF, s1.PH, s1.WORKED_DAYS, s1.PAYABLE_DAYS], [22, 22, 4, 1, 27, 27]);
  assert.deepEqual([s1.SOURCE_REF, s1.REGISTER_DAYS_PRESENT, s1.REGISTER_INCLUDES_WO, s1.ENTERED_BY, s1.APPROVAL_STATUS, s1.WORKING_DAYS],
    ['REGISTER', 22, 'N', HR, 'PENDING', 26]);
  assert.match(String(s1.ENTERED_AT), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(s1.ROW_KEY, `${P}|S1`);
  assert.equal(s1.HR_OVERRIDE, 'N');
  assert.deepEqual([w1.WEEK_OFF, w1.PRESENT_DAYS, w1.REGISTER_INCLUDES_WO], [0, 25, 'Y']);
  assert.equal(JSON.parse(s1.GENERATED_VALUES_JSON).PHYSICAL_PRESENT_DAYS, 22);
  assert.equal(rows.find((x) => x.EMP_ID === 'S2'), undefined, 'blank = not entered, no row');
  assert.match(env.rowsOf('AUDIT_LOG').map((x) => x.Message).join('\n'), /REGISTER_SUBMIT/);
  // idempotent re-submit updates in place, never duplicates
  const again = plain(env.c.registerSubmit({ period: P, includesWO: { STAFF: 'N' }, entries: [{ empId: 'S1', days: 23 }] }));
  assert.deepEqual([again.created, again.updated], [0, 1]);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').filter((x) => x.EMP_ID === 'S1').length, 1);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S1').PRESENT_DAYS, 23);
});

test('registerSubmit: over-month is reported (employee will be held), still written; approved / locked rows are never written', () => {
  const env = world({
    attendance: [att('S2', 'STAFF', { APPROVAL_STATUS: 'APPROVED', PRESENT_DAYS: 20, SOURCE_REF: 'REGISTER' })],
    periodRows: [],
  });
  env.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: 'PUNE_STAFF' }, { STATUS: 'LOCKED' });
  const r = plain(env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S1', days: 28 }, { empId: 'S2', days: 10 }, { empId: 'P1', days: 20 }] }));
  assert.deepEqual(r.exceptions.map((x) => [x.EMP_ID, x.code]), [['S1', 'ATTENDANCE_OVER_MONTH']]);
  assert.deepEqual(r.skippedApproved, ['S2']);
  assert.deepEqual(r.skippedLocked, ['P1']);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S2').PRESENT_DAYS, 20, 'approved row untouched');
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'P1'), undefined);
  assert.ok(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S1'));
});

test('registerSubmit: any invalid entry refuses the whole submission; wrong user / MIN_PERIOD / locked columns refused', () => {
  const env = world();
  assert.throws(() => env.c.registerSubmit({ period: P, entries: [{ empId: 'S1', days: 20 }, { empId: 'NOPE', days: 5 }, { empId: 'S2', days: 10.3 }] }), /NOPE: not on the roster.*S2/);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').length, 0, 'nothing written');
  assert.throws(() => env.c.registerSubmit({ period: '2026-08', entries: [] }), /earlier than MIN_PERIOD/);
  env.user = 'clerk@x.com';
  assert.throws(() => env.c.registerSubmit({ period: P, entries: [{ empId: 'S1', days: 20 }] }), /Not allowed/);
  assert.throws(() => env.c.registerLoad(P), /Not allowed/);
  const blankEnv = world();
  blankEnv.user = '';
  assert.throws(() => blankEnv.c.registerSubmit({ period: P, entries: [] }), /Cannot determine your Google account email/);
  // a listed clerk may submit
  env.user = 'clerk@x.com';
  env.c.setControl('REGISTER_ENTRY_EMAILS', 'clerk@x.com', 'test');
  assert.equal(plain(env.c.registerSubmit({ period: P, entries: [{ empId: 'S1', days: 20 }] })).written, 1);
  // missing setup columns are named
  const bare = world();
  bare.sheets.INPUT_ATTENDANCE.data[0] = bare.sheets.INPUT_ATTENDANCE.data[0].filter((h) => h !== 'REGISTER_DAYS_PRESENT');
  assert.throws(() => bare.c.registerSubmit({ period: P, entries: [] }), /lacks column.*REGISTER_DAYS_PRESENT.*Setup/);
});

test('registerLoad: roster rows (DOJ rule, leavers), prefill from INPUT_ATTENDANCE, per-population toggle default EXCLUDES', () => {
  const env = world({
    master: [
      { EMP_ID: 'J1', EMPLOYEE_NAME: 'Joiner', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '2026-10-05' },
      { EMP_ID: 'L1', EMPLOYEE_NAME: 'Leaver In', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Non-Active', DOJ_AS_SOURCE: '2020-01-01', LAST_WORKING_DAY: '2026-09-12' },
      { EMP_ID: 'L2', EMPLOYEE_NAME: 'Leaver Out', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Non-Active', DOJ_AS_SOURCE: '2020-01-01', LAST_WORKING_DAY: '2026-08-31' },
      { EMP_ID: 'X1', EMPLOYEE_NAME: 'Archived', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Non-Active', DOJ_AS_SOURCE: '2020-01-01' },
    ],
    attendance: [att('S1', 'STAFF', { REGISTER_DAYS_PRESENT: 21, REGISTER_INCLUDES_WO: 'Y', SOURCE_REF: 'REGISTER' }),
      att('W1', 'PERMANENT_WORKER', { REGISTER_DAYS_PRESENT: 24, REGISTER_INCLUDES_WO: 'N', SOURCE_REF: 'REGISTER', APPROVAL_STATUS: 'APPROVED' })],
  });
  const d = plain(env.c.registerLoad(P));
  assert.equal(d.period, P);
  assert.equal(d.daysInMonth, 30);
  assert.deepEqual(d.employees.map((e) => e.empId), ['L1', 'S1', 'S2', 'W1', 'C1', 'P1']);
  assert.equal(d.employees.find((e) => e.empId === 'S1').days, 21);
  assert.equal(d.employees.find((e) => e.empId === 'S2').days, '');
  assert.equal(d.employees.find((e) => e.empId === 'W1').state, 'APPROVED');
  assert.deepEqual(d.populations.map((p) => [p.population, p.includesWO]), [['STAFF', 'Y'], ['PERMANENT_WORKER', 'N'], ['CONSULTANT', 'N'], ['PUNE_STAFF', 'N']]);
  // default period when none is asked for: the latest open one
  assert.equal(plain(env.c.registerLoad('')).period, P);
});

test('page: modal dialog from the menu (no deployment), doGet for a deployed URL, no password / sensitive words, exposes the toggle text', () => {
  const env = world();
  env.c.menuOpenRegister();
  assert.equal(env.dialogs.length, 1);
  assert.equal(env.dialogs[0].title, 'Monthly attendance register');
  const html = env.dialogs[0].out.html;
  assert.match(html, /Days present INCLUDES weekly offs/);
  assert.match(html, /Days present EXCLUDES weekly offs/);
  assert.match(html, /registerApiLoad/);
  assert.match(html, /registerApiSubmit/);
  assert.match(html, /step:"0\.5"/);
  assert.doesNotMatch(html, /password/i);
  const web = env.c.doGet({});
  assert.equal(web.html, html);
  assert.match(web.title, /attendance register/);
  // the google.script.run entry points return plain JSON and go through the same checks
  assert.equal(plain(env.c.registerApiLoad(P)).period, P);
  assert.equal(plain(env.c.registerApiSubmit({ period: P, entries: [{ empId: 'S1', days: 20 }] })).written, 1);
  env.user = 'stranger@x.com';
  assert.throws(() => env.c.registerApiLoad(P), /Not allowed/);
});

test('menu: register, leave, comparison and dispute actions exist and the menu registers them', () => {
  const env = world();
  const items = [];
  const menu = { addItem: (l, f) => { items.push([l, f]); return menu; }, addSubMenu: (m) => menu, addSeparator: () => menu, addToUi() {} };
  const c2 = loadGs(['00_Config.gs', '90_Menu.gs'], { SpreadsheetApp: { getUi: () => ({ createMenu: () => menu }) } });
  c2.onOpen();
  const fns = items.map((i) => i[1]);
  ['menuOpenRegister', 'menuSyncLeave', 'menuBuildComparison', 'menuSubmitDisputes', 'menuOwnerApproveDisputes'].forEach((f) => assert.ok(fns.includes(f), f));
  assert.ok(items.some((i) => i[0] === 'Owner: approve attendance disputes'));
  assert.ok(items.some((i) => i[0] === 'Open monthly attendance register'));
  assert.ok(items.some((i) => i[0] === 'Sync leave'));
  assert.ok(items.some((i) => i[0] === 'Submit dispute decisions'));
  assert.ok(env);
});

test('leavers: non-Active employees with a last working day on/after the period start stay on the roster (buildRoster and the engine roster agree)', () => {
  const d = (v) => plain(pure.leaverRosterDecision(v, '2026-09-01'));
  assert.deepEqual(d('2026-09-01'), { include: true, warn: '', lwd: '2026-09-01' });
  assert.equal(d('2026-08-31').include, false);
  assert.equal(d('').include, false);
  assert.equal(d('garbage').include, false);
  assert.equal(d('15/09/2026').include, true, 'day-first');
  assert.deepEqual([d('03/09/2026').include, d('03/09/2026').warn], [true, 'AMBIGUOUS'], '3 Sep or 9 Mar: included with a warning');
  assert.equal(d('05/05/2026').include, false, 'both readings are before the period');
  assert.equal(d(new Date(2026, 8, 20)).lwd, '2026-09-20');
  const env = world({ master: [
    { EMP_ID: 'L1', EMPLOYEE_NAME: 'Leaver', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Non-Active', DOJ_AS_SOURCE: '2020-01-01', LAST_WORKING_DAY: '2026-09-12' },
    { EMP_ID: 'L2', EMPLOYEE_NAME: 'Gone', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Non-Active', DOJ_AS_SOURCE: '2020-01-01', LAST_WORKING_DAY: '2026-08-31' },
  ] });
  const roster = plain(env.c.buildRoster(P));
  assert.ok(roster.some((e) => e.EMP_ID === 'L1' && e.LEAVER === true && e.LWD === '2026-09-12'));
  assert.ok(!roster.some((e) => e.EMP_ID === 'L2'));
  const eng = plain(env.c.engine_rosterFromMaster(env.rowsOf('EMPLOYEE_MASTER'), P));
  assert.ok(eng.all.some((e) => e.EMP_ID === 'L1' && e.LEAVER === true));
  assert.ok(!eng.all.some((e) => e.EMP_ID === 'L2'));
  assert.ok(!plain(env.c.engine_rosterFromMaster(env.rowsOf('EMPLOYEE_MASTER'), undefined)).all.some((e) => e.EMP_ID === 'L1'), 'no period: active only');
});

test('generateMonthlyAttendance never regenerates register rows (the register is the pay source); other employees still get daily-generated rows', () => {
  const daily = [];
  ['S1', 'S2'].forEach((id) => { for (let d = 1; d <= 30; d++) daily.push({ PERIOD: P, DATE: `${P}-${String(d).padStart(2, '0')}`, SITE: 'NASHIK', EMP_ID: id, CODE: d % 7 === 6 ? 'WO' : 'P', SOURCE: 'FORM_NASHIK',
    SOURCE_REF: 'x', KEY: `${id}|${P}-${d}`, STATUS: 'VALID', ENTERED_AT: '2026-10-01T10:00:00' }); });
  const env = world({ daily });
  env.c.registerSubmit({ period: P, includesWO: {}, entries: [{ empId: 'S1', days: 20 }] });
  const before = JSON.stringify(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S1'));
  const r = plain(env.c.generateMonthlyAttendance(P));
  assert.equal(r.registerRowsKept, 1);
  assert.equal(JSON.stringify(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S1')), before);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S2').SOURCE_REF, 'DAILY_GENERATED');
});

test('page script (tiny DOM stub): renders toggles + one input per employee, submit sends period, per-population toggle and entries', () => {
  const env = world();
  const html = env.c.registerPageHtml_();
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  const all = [];
  const mk = (tag) => {
    const e = { tag, attrs: {}, children: [], textContent: '', value: '', checked: false, disabled: false, className: '' };
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); if (k === 'class') e.className = String(v); if (k === 'value') e.value = String(v); };
    e.getAttribute = (k) => e.attrs[k];
    e.appendChild = (c) => { e.children.push(c); return c; };
    all.push(e);
    return e;
  };
  const byId = {};
  ['period', 'load', 'cats', 'rows', 'submit', 'msg'].forEach((id) => { byId[id] = mk('el'); byId[id].id = id; });
  byId.load.click = () => byId.load.onclick();
  const document = {
    getElementById: (id) => byId[id],
    createElement: mk, createTextNode: (t) => ({ text: t }),
    querySelector: (sel) => { const m = /input\[name=(.+)\]:checked/.exec(sel); return m ? all.find((e) => e.attrs.name === m[1] && e.checked) || null : null; },
    querySelectorAll: () => all.filter((e) => e.tag === 'input' && e.attrs.class === 'days'),
  };
  let submitted = null;
  const data = plain(env.c.registerLoad(P));
  const run = (handlers) => ({ withSuccessHandler: (ok) => run(Object.assign({}, handlers, { ok })), withFailureHandler: (bad) => run(Object.assign({}, handlers, { bad })),
    registerApiLoad: () => handlers.ok(data),
    registerApiSubmit: (payload) => { submitted = payload; handlers.ok({ written: payload.entries.length, created: payload.entries.length, updated: 0, notEntered: [], skippedApproved: [], skippedLocked: [], exceptions: [], warnings: [] }); } });
  new Function('document', 'google', script)(document, { script: { run: run({}) } });
  // loaded automatically: 4 population fieldsets with two radios each, one number input per roster employee
  assert.equal(byId.cats.children.length, 4);
  const radios = all.filter((e) => e.tag === 'input' && e.attrs.type === 'radio');
  assert.equal(radios.length, 8);
  assert.deepEqual(radios.filter((r) => r.checked).map((r) => r.attrs.value), ['N', 'N', 'N', 'N'], 'default EXCLUDES');
  const inputs = all.filter((e) => e.tag === 'input' && e.attrs.class === 'days');
  assert.deepEqual(inputs.map((i) => i.attrs['data-emp']), ['S1', 'S2', 'W1', 'C1', 'P1']);
  assert.equal(inputs[0].attrs.step, '0.5');
  assert.equal(inputs[0].attrs.max, '30');
  // HR toggles STAFF to INCLUDES and types two numbers
  radios.filter((r) => r.attrs.name === 'inc_STAFF').forEach((r) => { r.checked = r.attrs.value === 'Y'; });
  inputs[0].value = '26'; inputs[1].value = '21.5';
  byId.submit.onclick();
  assert.equal(submitted.period, P);
  assert.equal(submitted.includesWO.STAFF, 'Y');
  assert.equal(submitted.includesWO.PERMANENT_WORKER, 'N');
  assert.deepEqual(submitted.entries.filter((e) => e.days !== '').map((e) => [e.empId, e.days]), [['S1', '26'], ['S2', '21.5']]);
  assert.match(byId.msg.textContent, /Saved 5 row\(s\)/);
  // and the real server accepts exactly that payload
  const res = plain(env.c.registerSubmit(submitted));
  assert.equal(res.written, 2);
  assert.equal(env.rowsOf('INPUT_ATTENDANCE').find((x) => x.EMP_ID === 'S1').PRESENT_DAYS, 22);
});
