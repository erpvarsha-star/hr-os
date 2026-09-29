/**
 * 01_SheetUtil.gs - header-mapped sheet access. Never clears or deletes anything.
 * Row 1 is always the header row. Sheet objects are passed in so tests can mock them.
 */
var HROS_TEXT_HEADERS = ['PAYROLL_MONTH', 'PERIOD', 'DATE', 'EMP_ID', 'KEY', 'ROW_KEY', 'SOURCE_REF', 'EFFECTIVE_FROM',
  'EFFECTIVE_TO', 'LOCK_ID'];

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(HROS_SPREADSHEET_ID);
}

function getSheet(name) { return getSpreadsheet_().getSheetByName(name); }

function resolveSheet_(sheetOrName) {
  if (typeof sheetOrName === 'string') {
    var s = getSheet(sheetOrName);
    if (!s) throw new Error('Missing tab ' + sheetOrName + ' (run HR OS > Setup first)');
    return s;
  }
  return sheetOrName;
}

/** Create the tab if missing; never touches an existing one. */
function ensureSheet(name) {
  var ss = getSpreadsheet_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getHeaders(sheet) {
  var lc = sheet.getLastColumn();
  if (lc < 1) return [];
  return sheet.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h == null ? '' : h).trim(); });
}

/** Array of objects keyed by header, plus _row (1-based sheet row). Blank rows skipped. */
function readObjects(sheetOrName) {
  var sheet = resolveSheet_(sheetOrName);
  var lc = sheet.getLastColumn(), lr = sheet.getLastRow();
  if (lc < 1 || lr < 2) return [];
  var values = sheet.getRange(1, 1, lr, lc).getValues();
  var headers = values[0].map(function (h) { return String(h == null ? '' : h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r], blank = true, obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (row[c] !== '' && row[c] != null) blank = false;
      if (headers[c] && !(headers[c] in obj)) obj[headers[c]] = row[c];
    }
    if (!blank) out.push(obj);
  }
  return out;
}

function textHeaderSet_(opts) {
  var set = {};
  HROS_TEXT_HEADERS.concat((opts && opts.textHeaders) || []).forEach(function (h) { set[h] = true; });
  return set;
}

/** Append objects as rows mapped by header. Unknown keys throw (fail closed). Returns first row written. */
function appendObjects(sheetOrName, objs, opts) {
  if (!objs || !objs.length) return 0;
  var sheet = resolveSheet_(sheetOrName);
  var headers = getHeaders(sheet);
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var rows = objs.map(function (o) {
    var arr = new Array(headers.length);
    for (var i = 0; i < arr.length; i++) arr[i] = '';
    Object.keys(o).forEach(function (k) {
      if (k === '_row') return;
      if (!(k in idx)) throw new Error('Unknown column "' + k + '" for tab ' + sheet.getName());
      arr[idx[k]] = o[k] == null ? '' : o[k];
    });
    return arr;
  });
  var start = sheet.getLastRow() + 1;
  var text = textHeaderSet_(opts);
  headers.forEach(function (h, i) {
    if (h && text[h]) sheet.getRange(start, i + 1, rows.length, 1).setNumberFormat('@');
  });
  sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
  return start;
}

/** updates = [{row, values:{HEADER: value}}]. Writes only the named cells (contiguous groups). */
function updateRows(sheetOrName, updates, opts) {
  if (!updates || !updates.length) return;
  var sheet = resolveSheet_(sheetOrName);
  var headers = getHeaders(sheet);
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var text = textHeaderSet_(opts);
  updates.forEach(function (u) {
    if (!(u.row >= 2)) throw new Error('Refusing to update row ' + u.row + ' (header row or invalid)');
    var cols = Object.keys(u.values).map(function (k) {
      if (!(k in idx)) throw new Error('Unknown column "' + k + '" for tab ' + sheet.getName());
      return idx[k];
    }).sort(function (a, b) { return a - b; });
    var byCol = {};
    Object.keys(u.values).forEach(function (k) { byCol[idx[k]] = u.values[k] == null ? '' : u.values[k]; });
    cols.forEach(function (c) { if (text[headers[c]]) sheet.getRange(u.row, c + 1).setNumberFormat('@'); });
    var i = 0;
    while (i < cols.length) {
      var j = i;
      while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
      var vals = [];
      for (var k = i; k <= j; k++) vals.push(byCol[cols[k]]);
      sheet.getRange(u.row, cols[i] + 1, 1, vals.length).setValues([vals]);
      i = j + 1;
    }
  });
}

/** Update the cells of one row by header name. */
function updateCells(sheetOrName, rowNum, values, opts) {
  updateRows(sheetOrName, [{ row: rowNum, values: values }], opts);
}

/**
 * Append missing header names to the right of the last non-blank header. Existing columns are never
 * removed, renamed or reordered. If row 1 is entirely blank the full header is written.
 * Returns {written:[...]} for a fresh header or {added:[...]} for appended columns.
 */
function ensureHeaders(sheet, wanted) {
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h == null ? '' : h).trim(); })
    : [];
  var lastNonBlank = -1;
  existing.forEach(function (h, i) { if (h !== '') lastNonBlank = i; });
  if (lastNonBlank < 0) {
    sheet.getRange(1, 1, 1, wanted.length).setValues([wanted.slice()]);
    return { written: wanted.slice(), added: [] };
  }
  var have = {};
  existing.forEach(function (h) { if (h) have[h] = true; });
  var missing = wanted.filter(function (h) { return !have[h]; });
  if (missing.length) sheet.getRange(1, lastNonBlank + 2, 1, missing.length).setValues([missing]);
  return { written: [], added: missing };
}

/** Warning-style protection that only the owner can edit through. Never removes existing protections. */
function protectSheet(sheet, description) {
  var protection = sheet.protect().setDescription(description || 'HR OS protected');
  try {
    var me = Session.getEffectiveUser();
    protection.addEditor(me);
    var editors = protection.getEditors();
    for (var i = 0; i < editors.length; i++) {
      if (editors[i].getEmail() !== me.getEmail()) protection.removeEditor(editors[i]);
    }
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (e) {
    protection.setWarningOnly(true);
  }
  return protection;
}

function isSheetProtected(sheet) {
  return sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length > 0;
}

function setListValidation(sheet, headerName, list, rows) {
  var headers = getHeaders(sheet);
  var col = headers.indexOf(headerName);
  if (col < 0) throw new Error('Column ' + headerName + ' not found on ' + sheet.getName());
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  sheet.getRange(2, col + 1, rows || 1000, 1).setDataValidation(rule);
}
