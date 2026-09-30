'use strict';
// scripts/make-import-workbook.py embeds the tab headers / seeds as JSON: they must equal what Apps Script setup builds.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeEnv } = require('./fakes');
const { plain } = require('./load');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'make-import-workbook.py'), 'utf8');
const m = /SCHEMA = json\.loads\(r"""([\s\S]*?)"""\)/.exec(src);

test('import workbook generator schema equals the setup registry, control defaults, statutory defaults and category seeds', () => {
  assert.ok(m, 'SCHEMA block found');
  const S = JSON.parse(m[1]);
  const c = makeEnv().c;
  const expected = {};
  c.hrosTabSpecs_().forEach((s) => { if (!/^PAYROLL_(STAFF|WORKER|CONSULTANT|PUNE_STAFF)$/.test(s.name)) expected[s.name] = plain(s.headers); });
  assert.deepEqual(S.headers, expected);
  assert.deepEqual(S.control, plain(c.HROS_CONTROL_DEFAULTS));
  assert.deepEqual(S.statutoryDefaults, plain(c.HROS_STATUTORY_DEFAULTS));
  assert.deepEqual(S.categories, plain(c.CATEGORY_DEFAULTS));
  assert.deepEqual(S.ptExemptions, plain(c.HROS_PT_EXEMPTION_SEED));
  const ctl = Object.fromEntries(S.control.map(([k, v]) => [k, v]));
  assert.equal(ctl.PAYSLIP_FOLDER_ID, '');
  assert.equal(ctl.EMAIL_RELEASE_ENABLED, 'FALSE');
  assert.equal(ctl.LEAVE_SOURCE_SPREADSHEET_ID, '1pwVE0XKqAhAKHbyqtlF9GzfuGnidnZuw2zKbtMjUz9Q');
  assert.deepEqual(S.headers.EMPLOYEE_STATUTORY_IDS, ['EMP_ID', 'UAN', 'ESI_NO', 'PAN', 'BANK_NAME', 'BANK_ACCOUNT', 'IFSC']);
});

test('*.xlsx is git-ignored (the import workbook holds statutory IDs)', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8'), /^\*\.xlsx$/m);
});
