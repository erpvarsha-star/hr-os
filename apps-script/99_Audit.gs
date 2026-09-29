/**
 * 99_Audit.gs - append-only audit trail into AUDIT_LOG using its existing header
 * (Timestamp, Module, Status, User, Message). Unknown headers get JSON in the last column.
 */
var AUDIT_MODULE = 'HROS';

/** Pure: map an audit entry onto a header list. Returns array aligned with headers. */
function buildAuditRow(headers, entry) {
  var known = {
    TIMESTAMP: entry.timestamp, MODULE: AUDIT_MODULE, STATUS: entry.action, USER: entry.user,
    MESSAGE: entry.message, ACTION: entry.action, PERIOD: entry.period, POPULATION: entry.population,
    DETAIL: entry.detail
  };
  var row = headers.map(function (h) {
    var k = String(h || '').trim().toUpperCase();
    return (k in known && known[k] != null) ? known[k] : '';
  });
  var hasMessage = headers.some(function (h) {
    var k = String(h || '').trim().toUpperCase();
    return k === 'MESSAGE' || k === 'DETAIL';
  });
  if (!hasMessage && headers.length) {
    row[headers.length - 1] = JSON.stringify({ action: entry.action, period: entry.period,
      population: entry.population, detail: entry.detail });
  }
  return row;
}

function auditUser_() {
  var u = '';
  try { u = Session.getActiveUser().getEmail(); } catch (e) { /* ignore */ }
  if (!u) { try { u = Session.getEffectiveUser().getEmail(); } catch (e2) { /* ignore */ } }
  return u || 'unknown';
}

function audit(action, period, population, detail) {
  var sheet = ensureSheet(TABS.AUDIT_LOG);
  var headers = getHeaders(sheet);
  if (!headers.length) {
    ensureHeaders(sheet, ['Timestamp', 'Module', 'Status', 'User', 'Message']);
    headers = getHeaders(sheet);
  }
  var d = detail == null ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  var msg = [action, period ? 'period=' + period : '', population ? 'pop=' + population : '', d]
    .filter(function (x) { return x; }).join(' | ');
  var row = buildAuditRow(headers, {
    timestamp: Utilities.formatDate(new Date(), HROS_TZ, 'yyyy-MM-dd HH:mm:ss'),
    action: action, period: period || '', population: population || '', detail: d, message: msg, user: auditUser_()
  });
  var start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, 1, headers.length).setValues([row]);
}
