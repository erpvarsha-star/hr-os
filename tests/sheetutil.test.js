'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGs, plain } = require('./load');

const ctx = loadGs(['00_Config.gs', '01_SheetUtil.gs']);

/** Minimal in-memory sheet: only what ensureHeaders/readObjects/appendObjects touch. */
function mockSheet(grid) {
  const g = grid.map((r) => r.slice());
  const width = () => g.reduce((m, r) => Math.max(m, r.length), 0);
  const lastRowWithData = () => { let n = 0; g.forEach((r, i) => { if (r.some((v) => v !== '' && v != null)) n = i + 1; }); return n; };
  return {
    g,
    getName: () => 'T',
    getLastColumn: () => { let m = 0; g.forEach((r) => r.forEach((v, i) => { if (v !== '' && v != null) m = Math.max(m, i + 1); })); return m; },
    getLastRow: lastRowWithData,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((g[r - 1 + i] || [])[c - 1 + j] ?? ''); out.push(row); } return out; },
        setValues: (vals) => { vals.forEach((row, i) => { g[r - 1 + i] = g[r - 1 + i] || []; row.forEach((v, j) => { g[r - 1 + i][c - 1 + j] = v; }); }); },
        setNumberFormat() {},
      };
    },
    width,
  };
}

test('ensureHeaders appends missing columns to the right, never removes or reorders', () => {
  const s = mockSheet([['KEY', 'VALUE', 'NOTE'], ['a', 1, 'x']]);
  const r = plain(ctx.ensureHeaders(s, ['VALUE', 'EXTRA1', 'KEY', 'EXTRA2']));
  assert.deepEqual(r.added, ['EXTRA1', 'EXTRA2']);
  assert.deepEqual(s.g[0], ['KEY', 'VALUE', 'NOTE', 'EXTRA1', 'EXTRA2']);
  assert.deepEqual(s.g[1], ['a', 1, 'x']); // data untouched
  // idempotent
  assert.deepEqual(plain(ctx.ensureHeaders(s, ['VALUE', 'EXTRA1', 'KEY', 'EXTRA2'])).added, []);
  assert.deepEqual(s.g[0], ['KEY', 'VALUE', 'NOTE', 'EXTRA1', 'EXTRA2']);
});

test('ensureHeaders writes full header only when row 1 is empty', () => {
  const empty = mockSheet([['']]);
  assert.deepEqual(plain(ctx.ensureHeaders(empty, ['A', 'B'])).written, ['A', 'B']);
  assert.deepEqual(empty.g[0], ['A', 'B']);
  const fresh = mockSheet([]);
  ctx.ensureHeaders(fresh, ['A']);
  assert.deepEqual(fresh.g[0], ['A']);
  // existing header with different order is left as is
  const keep = mockSheet([['Z', 'A']]);
  ctx.ensureHeaders(keep, ['A', 'Z', 'Q']);
  assert.deepEqual(keep.g[0], ['Z', 'A', 'Q']);
});

test('readObjects / appendObjects are header-mapped; unknown columns throw', () => {
  const s = mockSheet([['EMP_ID', 'CODE'], ['E1', 'P'], ['', ''], ['E2', 'A']]);
  const rows = plain(ctx.readObjects(s));
  assert.deepEqual(rows, [{ _row: 2, EMP_ID: 'E1', CODE: 'P' }, { _row: 4, EMP_ID: 'E2', CODE: 'A' }]);
  const start = ctx.appendObjects(s, [{ CODE: 'WO', EMP_ID: 'E3' }]);
  assert.equal(start, 5);
  assert.deepEqual(s.g[4], ['E3', 'WO']);
  assert.throws(() => ctx.appendObjects(s, [{ NOPE: 1 }]), /Unknown column/);
});

test('updateRows writes only named cells and refuses the header row', () => {
  const s = mockSheet([['A', 'B', 'C'], [1, 2, 3]]);
  ctx.updateRows(s, [{ row: 2, values: { A: 9, C: 8 } }]);
  assert.deepEqual(s.g[1], [9, 2, 8]);
  assert.throws(() => ctx.updateRows(s, [{ row: 1, values: { A: 1 } }]), /header row/);
});
