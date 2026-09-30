'use strict';
// Shared in-memory fake of the Google environment used by the newer test files (days form, triggers, gates ...).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGs } = require('./load');

const pad = (n, w = 2) => String(n).padStart(w, '0');
function formatDate(d, tz, fmt) {
  const map = { yyyy: pad(d.getFullYear(), 4), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()),
    mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}
const blank = (v) => v === '' || v == null;

function makeSheet(name) {
  const s = { name, data: [], calls: [] };
  s.getName = () => name;
  s.getLastRow = () => { for (let r = s.data.length; r >= 1; r--) if ((s.data[r - 1] || []).some((v) => !blank(v))) return r; return 0; };
  s.getLastColumn = () => { let m = 0; s.data.forEach((row) => row.forEach((v, i) => { if (!blank(v)) m = Math.max(m, i + 1); })); return m; };
  s.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => {
      s.calls.push({ r, c, nr, nc });
      const out = [];
      for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
      return out;
    },
    setValues: (vals) => { assert.equal(vals.length, nr); vals.forEach((row, i) => { assert.equal(row.length, nc); while (s.data.length < r + i) s.data.push([]); row.forEach((v, j) => { s.data[r - 1 + i][c - 1 + j] = v; }); }); },
    setNumberFormat() {},
    setDataValidation() {},
    clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.data[r - 1 + i]) s.data[r - 1 + i][c - 1 + j] = ''; },
  });
  s.protections = [];
  s.hidden = false;
  s.protect = () => {
    const p = { editors: [], desc: '', setDescription(d) { p.desc = d; return p; }, addEditor(u) { p.editors.push(typeof u === 'string' ? u : u.getEmail()); return p; },
      addEditors(list) { list.forEach((u) => p.editors.push(u)); return p; }, getEditors: () => p.editors.map((e) => ({ getEmail: () => e })),
      removeEditor() { return p; }, canDomainEdit: () => false, setDomainEdit() { return p; }, setWarningOnly() { return p; } };
    s.protections.push(p); return p;
  };
  s.getProtections = () => s.protections;
  s.hideSheet = () => { s.hidden = true; return s; };
  s.showSheet = () => { s.hidden = false; return s; };
  s.isSheetHidden = () => s.hidden;
  s.objs = () => { const h = s.data[0] || []; return s.data.slice(1).filter((row) => row.some((v) => !blank(v))).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] === undefined ? '' : row[i]]))); };
  return s;
}

const FILES = ['00_Config.gs', '01_SheetUtil.gs', '02_Setup.gs', '10_Attendance.gs', '11_AttendanceForms.gs', '12_Register.gs', '13_RegisterPage.gs', '14_Employees.gs',
  '20_Feeds.gs', '21_Leave.gs', '30_Calc.gs', '31_Readiness.gs', '32_Engine.gs', '33_Comparison.gs', '40_Approval.gs', '41_Lock.gs', '42_Supplementary.gs', '50_Payslips.gs',
  '51_Email.gs', '90_Menu.gs', '99_Audit.gs'];

/** A fresh world: sheets, fake SpreadsheetApp/Session/LockService/ScriptApp, and the whole code base in one context. */
function makeEnv(opts = {}) {
  const env = { user: opts.user || 'hr@varshaforgings.com', sheets: {}, external: {}, triggers: (opts.triggers || []).slice(), created: [] };
  const ss = {
    getSheetByName: (n) => env.sheets[n] || null,
    insertSheet: (n) => (env.sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(env.sheets),
    setActiveSheet: (sh) => { env.active = sh; return sh; },
    moveActiveSheet: (pos) => { // 1-based position among all tabs (tab order = insertion order of env.sheets)
      const names = Object.keys(env.sheets).filter((n) => env.sheets[n] !== env.active), me = env.active.getName();
      names.splice(Math.max(0, Math.min(names.length, pos - 1)), 0, me);
      const next = {}; names.forEach((n) => { next[n] = env.sheets[n]; }); env.sheets = next;
    },
    getOwner: () => ({ getEmail: () => 'owner@varshaforgings.com' }),
    getId: () => 'FAKE_SS_ID',
    toast() {},
  };
  env.ss = ss;
  const resetCat = (name) => { if (name === 'PAYROLL_CATEGORY_CONFIG' && env.c && env.c.categoryConfigReset_) env.c.categoryConfigReset_(); };
  env.put = (name, headers, rows = []) => {
    const s = makeSheet(name);
    s.data = [headers.slice()].concat(rows.map((r) => headers.map((h) => (h in r ? r[h] : ''))));
    env.sheets[name] = s;
    resetCat(name);
    return s;
  };
  env.rowsOf = (name) => (env.sheets[name] ? env.sheets[name].objs() : []);
  env.addRows = (name, objs) => {
    const s = env.sheets[name], h = s.data[0];
    objs.forEach((o) => {
      Object.keys(o).forEach((k) => { if (h.indexOf(k) < 0) throw new Error(`no column ${k} in ${name}`); });
      s.data.push(h.map((k) => (k in o ? o[k] : '')));
    });
    resetCat(name);
  };
  env.editCells = (name, where, values) => {
    const s = env.sheets[name], h = s.data[0];
    let hits = 0;
    s.data.forEach((row, i) => {
      if (i === 0) return;
      if (!Object.keys(where).every((k) => String(row[h.indexOf(k)]) === String(where[k]))) return;
      Object.keys(values).forEach((k) => { row[h.indexOf(k)] = values[k]; });
      hits++;
    });
    assert.ok(hits > 0, `no row matched ${JSON.stringify(where)} in ${name}`);
    resetCat(name);
  };
  const Utilities = {
    formatDate, getUuid: () => 'u', sleep() {},
    computeDigest: (alg, str) => Array.from(crypto.createHash('sha256').update(str, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
  };
  const me = () => ({ getEmail: () => env.user });
  const dv = () => { const b = { requireValueInList() { return b; }, setAllowInvalid() { return b; }, build() { return {}; } }; return b; };
  env.dialogs = [];
  const HtmlService = { createHtmlOutput: (html) => { const o = { html, title: '' }; o.setWidth = (w) => { o.width = w; return o; }; o.setHeight = (h) => { o.height = h; return o; }; o.setTitle = (t) => { o.title = t; return o; }; o.getContent = () => html; return o; } };
  const ui = { showModalDialog: (out, title) => { env.dialogs.push({ out, title }); } };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ss, getActive: () => ss, flush() {}, ProtectionType: { SHEET: 'SHEET' }, newDataValidation: dv, getUi: () => ui,
    openById: (id) => {
      if (id === 'FAKE_SS_ID') return ss;
      if (env.external[id]) return { getSheetByName: (n) => env.external[id][n] || null };
      throw new Error('cannot open ' + id);
    },
  };
  const ScriptApp = {
    getProjectTriggers: () => env.triggers.map((t) => ({ getHandlerFunction: () => t.handler })),
    newTrigger: (handler) => {
      const t = { handler };
      const b = { forSpreadsheet: (sp) => { t.spreadsheet = sp; return b; }, forForm: () => { throw new Error('per-form triggers are retired'); },
        onFormSubmit: () => { t.event = 'FORM_SUBMIT'; return b; }, create: () => { env.triggers.push(t); env.created.push(t); return t; } };
      return b;
    },
    deleteTrigger: () => { throw new Error('triggers must never be deleted here'); },
  };
  const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  env.c = loadGs(FILES, Object.assign({ Utilities, SpreadsheetApp, HtmlService, Session: { getActiveUser: me, getEffectiveUser: me }, LockService, ScriptApp }, opts.globals || {}));
  return env;
}

/** Header of the leave application form responses (a password column is included on purpose: it must never be read). */
const LEAVE_HDR = ['Timestamp', 'Submission Type', 'Email Address', 'Employee ID', 'Name', 'Department', 'Reason for Leave', 'Leave Start Date',
  'Leave Start Date Half', 'Number of Leave in working days', 'Leave End Date', 'Leave End Date Half', 'Leave Type', 'Approval Decision',
  'Approved Number of days', 'Remarks', 'Password', 'Month', 'Case No'];
const leaveRow = (o) => Object.assign({ Timestamp: '2026-09-10 10:00:00', 'Submission Type': 'Approval (for admin use only)', 'Employee ID': '', 'Leave Type': '',
  'Leave Start Date': '', 'Leave End Date': '', 'Approval Decision': 'Approved', Password: 'SECRET-SENTINEL' }, o);

const LEAVE_INPUT_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'LEAVE_TYPE', 'DAYS', 'FROM_DATE', 'TO_DATE', 'SOURCE_REF', 'CASE_NO', 'KEY', 'STATUS',
  'EXCEPTION_REASON', 'NORMALIZER_VERSION', 'ENTERED_AT'];

module.exports = { makeEnv, makeSheet, blank, LEAVE_HDR, LEAVE_INPUT_HDR, leaveRow };
