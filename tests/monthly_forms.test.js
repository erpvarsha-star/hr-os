'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { plain, loadGs } = require('./load');
const { makeFormApp } = require('./fakes');
const { P, HR, OWNER, world } = require('./regenv');

const extraMaster = [
  { EMP_ID: 'S3', EMPLOYEE_NAME: 'Staff Three', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Forge', DOJ_AS_SOURCE: '01/01/2020' },
  { EMP_ID: 'P2', EMPLOYEE_NAME: 'Pune Two', PAYROLL_CATEGORY: 'PUNE_STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Sales', DOJ_AS_SOURCE: '01/01/2020' },
];
const HDR = ['Timestamp', 'Email Address', 'Payroll month', 'Days present for Staff counted', 'Days present for Permanent worker counted',
  'Days present for Consultant counted', 'S1 – Staff One', 'S2 – Staff Two', 'S3 – Staff Three', 'W1 – Worker One', 'C1 – Consultant One', 'Remarks'];
const row = (o) => { const d = Object.assign({ Timestamp: 't', 'Email Address': HR, 'Payroll month': P, 'Days present for Staff counted': 'Excluding weekly offs',
  'Days present for Permanent worker counted': 'Excluding weekly offs', 'Days present for Consultant counted': 'Including weekly offs' }, o); return HDR.map((h) => (h in d ? d[h] : '')); };

function mk(opts = {}) {
  const env = world(Object.assign({ master: extraMaster }, opts));
  env.c.FormApp = makeFormApp(env);
  env.mails = [];
  env.c.MailApp = { sendEmail: (m) => { if (env.mailFails) throw new Error('mail down'); env.mails.push(m); } };
  return env;
}
const ev = (sheet, r) => ({ range: { getSheet: () => sheet, getRow: () => r } });
function submit(env, values, tab = 'ATT_MONTHLY_VFL_RAW', hdr = HDR) {
  const sh = env.sheets[tab] || env.put(tab, hdr);
  sh.data.push(values);
  return plain(env.c.hrosOnFormSubmit(ev(sh, sh.data.length)));
}
const att = (env) => env.rowsOf('INPUT_ATTENDANCE');
const strip = (r) => { const o = Object.assign({}, r); delete o.ENTERED_AT; return o; };

test('parseMonthlyAttendanceRow: period, per-category mode, blanks skipped, bad labels ignored, remarks', () => {
  const env = mk();
  const v = row({ 'S1 – Staff One': 22, 'S2 – Staff Two': '', 'W1 – Worker One': '25.5', Remarks: 'hello' });
  const h = HDR.concat(['Random question', 'no label']);
  const p = plain(env.c.parseMonthlyAttendanceRow(h, v.concat(['x', 5])));
  assert.equal(p.email, HR);
  assert.equal(p.period, P);
  assert.deepEqual(p.includesWO, { STAFF: 'N', PERMANENT_WORKER: 'N', CONSULTANT: 'Y' });
  assert.deepEqual(p.entries, [{ empId: 'S1', days: 22 }, { empId: 'W1', days: '25.5' }]);
  assert.equal(p.remarks, 'hello');
  assert.deepEqual(p.errors, []);
  const bad = plain(env.c.parseMonthlyAttendanceRow(HDR, row({ 'Payroll month': '' })));
  assert.equal(bad.errors.length, 1);
  const dt = plain(env.c.parseMonthlyAttendanceRow(HDR, row({ 'Payroll month': new Date(2026, 8, 1) })));
  assert.equal(dt.period, P, 'a month the sheet turned into a date');
});

test('form submit writes the same INPUT_ATTENDANCE rows as registerSubmit', () => {
  const env = mk();
  const out = submit(env, row({ 'S1 – Staff One': 22, 'S3 – Staff Three': 26, 'W1 – Worker One': 25.5, 'C1 – Consultant One': 26 }));
  assert.equal(out.ok, true);
  assert.equal(att(env).length, 4);
  const ref = mk();
  ref.c.registerSubmit({ period: P, includesWO: { STAFF: 'N', PERMANENT_WORKER: 'N', CONSULTANT: 'Y' },
    entries: [{ empId: 'S1', days: 22 }, { empId: 'S3', days: 26 }, { empId: 'W1', days: 25.5 }, { empId: 'C1', days: 26 }] });
  assert.deepEqual(att(env).map(strip), att(ref).map(strip));
  assert.ok(att(env).every((r) => r.APPROVAL_STATUS === 'PENDING' && r.SOURCE_REF === 'REGISTER' && r.ENTERED_BY === HR));
  assert.equal(env.mails.length, 1);
  assert.equal(env.mails[0].to, HR);
  assert.match(env.mails[0].subject, /2026-09 – saved$/);
  assert.match(env.mails[0].body, /Created: 4, updated: 0/);
  assert.ok(env.rowsOf('AUDIT_LOG').some((r) => /ATT_MONTHLY_FORM_SUBMIT/.test(r.Message)));
});

test('second submission updates only newly filled employees; APPROVED rows are skipped and reported', () => {
  const env = mk();
  submit(env, row({ 'S1 – Staff One': 22 }));
  assert.equal(att(env).length, 1);
  env.editCells('INPUT_ATTENDANCE', { EMP_ID: 'S1' }, { APPROVAL_STATUS: 'APPROVED' });
  submit(env, row({ 'S1 – Staff One': 10, 'S2 – Staff Two': 20 }));
  const by = Object.fromEntries(att(env).map((r) => [r.EMP_ID, r]));
  assert.equal(by.S1.PRESENT_DAYS, 22, 'approved row untouched');
  assert.equal(by.S2.PRESENT_DAYS, 20);
  assert.match(env.mails[1].body, /already APPROVED: 1 \(S1\)/);
  submit(env, row({ 'S2 – Staff Two': 21 }));
  assert.equal(att(env).length, 2);
  assert.equal(att(env).find((r) => r.EMP_ID === 'S2').PRESENT_DAYS, 21);
  assert.equal(att(env).find((r) => r.EMP_ID === 'S2').ENTERED_BY, HR);
});

test('invalid value -> nothing written, mail says NOT saved; disallowed email -> nothing written', () => {
  const env = mk();
  submit(env, row({ 'S1 – Staff One': 22, 'S2 – Staff Two': 40 }));
  assert.equal(att(env).length, 0);
  assert.match(env.mails[0].subject, /NOT saved/);
  assert.match(env.mails[0].body, /S2: days present must be/);
  submit(env, row({ 'S1 – Staff One': 22, 'S2 – Staff Two': '25.3' }));
  assert.equal(att(env).length, 0);
  submit(env, row({ 'S1 – Staff One': 22, 'Email Address': 'someone@else.com' }));
  assert.equal(att(env).length, 0);
  assert.match(env.mails[2].body, /Not allowed/);
  assert.equal(env.mails[2].to, 'someone@else.com');
  // owner and REGISTER_ENTRY_EMAILS are allowed
  submit(env, row({ 'S1 – Staff One': 22, 'Email Address': OWNER }));
  assert.equal(att(env).length, 1);
  const env2 = mk({ control: [{ KEY: 'REGISTER_ENTRY_EMAILS', VALUE: 'clerk@varshaforgings.com' }] });
  submit(env2, row({ 'S1 – Staff One': 22, 'Email Address': 'clerk@varshaforgings.com' }));
  assert.equal(att(env2).length, 1);
});

test('mail failure never throws; missing email skips mail and audits', () => {
  const env = mk();
  env.mailFails = true;
  assert.equal(submit(env, row({ 'S1 – Staff One': 22 })).ok, true);
  assert.equal(att(env).length, 1);
  assert.ok(env.rowsOf('AUDIT_LOG').some((r) => /ATT_MONTHLY_MAIL_FAILED/.test(r.Message)));
  const env2 = mk();
  const out = submit(env2, row({ 'S1 – Staff One': 22, 'Email Address': '' }));
  assert.equal(out.ok, false);
  assert.equal(att(env2).length, 0);
  assert.equal(env2.mails.length, 0);
  assert.ok(env2.rowsOf('AUDIT_LOG').some((r) => /ATT_MONTHLY_MAIL_SKIPPED/.test(r.Message)));
});

test('Pune tab routes to the same path', () => {
  const env = mk();
  const h = ['Timestamp', 'Email Address', 'Payroll month', 'Days present for Pune staff counted', 'P1 – Pune One', 'P2 – Pune Two', 'Remarks'];
  const out = submit(env, ['t', HR, P, 'Including weekly offs', 26, '', ''], 'ATT_MONTHLY_PUNE_RAW', h);
  assert.equal(out.ok, true);
  const r = att(env)[0];
  assert.deepEqual([r.EMP_ID, r.PAYROLL_CATEGORY, r.PRESENT_DAYS, r.REGISTER_INCLUDES_WO], ['P1', 'PUNE_STAFF', 22, 'Y']);
});

test('form build: verified email, month choices, one mode question per category, sections per department, one item per employee', () => {
  const env = mk({ periodRows: [{ PAYROLL_MONTH: '2026-08', PAYROLL_CATEGORY: 'STAFF', STATUS: 'LOCKED' }] });
  const roster = env.c.buildRoster(undefined, { asOf: '2026-09-30' });
  const f = env.c.buildMonthlyAttendanceForm_(env.c.ATT_MONTHLY_FORM_DEFS.VFL, roster);
  assert.equal(f.collectEmail, true);
  assert.match(f.description, /DAYS PRESENT/);
  const titles = f.items.map((i) => i.title);
  assert.deepEqual(titles, ['Payroll month', 'Days present for Staff counted', 'Days present for Permanent worker counted', 'Days present for Consultant counted',
    'Department – Dept', 'C1 – Consultant One', 'S1 – Staff One', 'S2 – Staff Two', 'W1 – Worker One', 'Department – Forge', 'S3 – Staff Three', 'Remarks']);
  assert.deepEqual(plain(f.items[0].choices), ['2026-09'], 'August is below MIN_PERIOD');
  assert.equal(f.items[0].required, true);
  assert.deepEqual(plain(f.items[1].choices), ['Excluding weekly offs', 'Including weekly offs']);
  const t = f.items[5];
  assert.deepEqual(plain([t.type, t.required, t.validation.min, t.validation.max, t.validation.help]), ['TEXT', false, 0, 31, '0 to 31, halves allowed']);
  assert.equal(f.items[titles.length - 1].type, 'PARAGRAPH_TEXT');
  // Pune form: only Pune staff
  const pf = env.c.buildMonthlyAttendanceForm_(env.c.ATT_MONTHLY_FORM_DEFS.PUNE, roster);
  assert.deepEqual(pf.items.map((i) => i.title), ['Payroll month', 'Days present for Pune staff counted', 'Department – Dept', 'P1 – Pune One',
    'Department – Sales', 'P2 – Pune Two', 'Remarks']);
});

test('month choices fall back to this and last month when no period rows are open', () => {
  const env = mk({ periodRows: [] });
  env.sheets.PAYROLL_PERIOD_CATEGORY.data.length = 1;
  const ps = plain(env.c.monthlyOpenPeriods_());
  assert.ok(ps.length >= 1 && ps.every((p) => /^\d{4}-\d{2}$/.test(p) && p >= '2026-09'));
});

test('create + refresh: ids stored, response tab renamed, new employee in the right section, exited employee removed', () => {
  const env = mk();
  const res = plain(env.c.createAttendanceForms());
  assert.equal(res.created.length, 4);
  const ctl = env.c.readControlMap();
  assert.ok(ctl.ATT_MONTHLY_VFL_ID && ctl.ATT_MONTHLY_PUNE_ID);
  assert.ok(env.sheets.ATT_MONTHLY_VFL_RAW && env.sheets.ATT_MONTHLY_PUNE_RAW && env.sheets.ATT_FORM_VFL_RAW);
  const form = env.c.FormApp.openById(ctl.ATT_MONTHLY_VFL_ID);
  assert.equal(form.destination, 'FAKE_SS_ID');
  const before = form.items.slice();
  env.addRows('EMPLOYEE_MASTER', [
    { EMP_ID: 'S9', EMPLOYEE_NAME: 'New Forge', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Forge', DOJ_AS_SOURCE: '01/01/2020' },
    { EMP_ID: 'S8', EMPLOYEE_NAME: 'New Dept', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'Stores', DOJ_AS_SOURCE: '01/01/2020' }]);
  env.editCells('EMPLOYEE_MASTER', { EMP_ID: 'S2' }, { STATUS_AS_SOURCE: 'Inactive', LAST_WORKING_DAY: '01/01/2025' });
  const r = plain(env.c.refreshAttendanceFormRosters());
  assert.ok(r.added.includes('MONTHLY_VFL:S9') && r.added.includes('MONTHLY_VFL:S8'));
  assert.deepEqual(r.removed.filter((x) => /^MONTHLY/.test(x)), ['MONTHLY_VFL:S2']);
  const titles = form.items.map((i) => i.title);
  assert.deepEqual(titles.slice(titles.indexOf('Department – Forge')), ['Department – Forge', 'S3 – Staff Three', 'S9 – New Forge', 'Department – Stores', 'S8 – New Dept', 'Remarks']);
  assert.ok(!titles.includes('S2 – Staff Two'));
  before.filter((i) => i.title !== 'S2 – Staff Two').forEach((i) => assert.ok(form.items.includes(i), 'existing item kept: ' + i.title));
  // a department that empties out loses its section
  env.editCells('EMPLOYEE_MASTER', { EMP_ID: 'S8' }, { STATUS_AS_SOURCE: 'Inactive', LAST_WORKING_DAY: '01/01/2025' });
  env.c.refreshAttendanceFormRosters();
  assert.ok(!form.items.some((i) => i.title === 'Department – Stores'));
  // second create is a no-op
  assert.equal(plain(env.c.createAttendanceForms()).created.length, 0);
});
