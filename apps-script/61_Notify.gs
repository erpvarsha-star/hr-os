/**
 * 61_Notify.gs - alerts: Telegram first, email (MailApp) as the fallback; stage notifications for the payroll flow.
 *
 * Secrets: the bot token lives ONLY in Script Properties (TELEGRAM_BOT_TOKEN), never in a sheet and never in a log / error text.
 * People: TELEGRAM_CHATS (CHAT_ID, NAME, USERNAME, FIRST_SEEN, EMAIL, ACTIVE). Anyone who presses Start in the bot is recorded
 * with a blank EMAIL; only the owner typing an email against a chat links it to a person. An unmapped chat never gets payroll data.
 * No webhook is used: telegramPoll_() pulls getUpdates, on demand (menu "Telegram: refresh chats", via telegramPollUpdates_())
 * and automatically every 5 minutes once reminder triggers are installed (62_Reminders.gs, via telegramPollUpdatesTrigger_()) -
 * so pressing Start registers a person within about 5 minutes without the owner doing anything.
 *
 * Message rule: short, totals per population are fine, never a figure of an individual. AUDIT_LOG gets subject + channel + ok only.
 */
var TELEGRAM_TOKEN_PROP = 'TELEGRAM_BOT_TOKEN';
var TELEGRAM_OFFSET_PROP = 'TELEGRAM_UPDATE_OFFSET';
var TELEGRAM_API_ = 'https://api.telegram.org/bot';
var TELEGRAM_MAX_TEXT = 3800;
var TELEGRAM_START_REPLY = 'Registered. Ask the payroll owner to link you.';
var TELEGRAM_REPEAT_REPLY = "You're registered. Ask the payroll owner to link your email in TELEGRAM_CHATS if alerts aren't reaching you yet.";

// ---------------------------------------------------------------- pure helpers

/** Pure. "a@x.com, B@y.com; c@z" -> ['a@x.com','b@y.com'] (lower-cased, deduplicated, must contain @). */
function notifyEmailList(v) {
  var seen = {}, out = [];
  (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,;]+/)).forEach(function (x) {
    x = String(x == null ? '' : x).trim().toLowerCase();
    if (x && x.indexOf('@') > 0 && !seen[x]) { seen[x] = true; out.push(x); }
  });
  return out;
}

/** Pure. TELEGRAM_CHATS rows -> {email: [chatId,...]} for ACTIVE rows with an EMAIL (ACTIVE blank counts as Y; only N switches off). */
function notifyChatMap(rows) {
  var map = {};
  (rows || []).forEach(function (r) {
    var email = String(r.EMAIL == null ? '' : r.EMAIL).trim().toLowerCase();
    var chat = String(r.CHAT_ID == null ? '' : r.CHAT_ID).trim();
    if (!email || !chat) return;
    if (String(r.ACTIVE == null ? '' : r.ACTIVE).trim().toUpperCase() === 'N') return;
    (map[email] = map[email] || []);
    if (map[email].indexOf(chat) < 0) map[email].push(chat);
  });
  return map;
}

/**
 * Pure. getUpdates result array + known chat ids -> {offset, newChats:[{chatId,name,username}], replyTo:[chatId], repeatTo:[chatId]}.
 * Only a private chat is looked at. A chat not yet known that sends /start (or /start@bot ...) is recorded and goes in
 * replyTo; a chat already known (passed in, or recorded earlier in this same batch) that sends /start again goes in
 * repeatTo instead (no new row, a different short reply, and only once per batch even if it sends /start several times).
 * Every update advances the offset regardless.
 */
function telegramPlanUpdates(updates, knownChatIds, prevOffset) {
  var preKnown = {};
  (knownChatIds || []).forEach(function (id) { preKnown[String(id)] = true; });
  var known = {};
  Object.keys(preKnown).forEach(function (id) { known[id] = true; });
  var offset = prevOffset || 0, newChats = [], repeatTo = [], seenRepeat = {};
  (updates || []).forEach(function (u) {
    if (u && typeof u.update_id === 'number' && u.update_id + 1 > offset) offset = u.update_id + 1;
    var m = u && u.message;
    if (!m || !m.chat || m.chat.type !== 'private') return;
    if (!/^\/start(@\w+)?(\s|$)/i.test(String(m.text || '').trim())) return;
    var id = String(m.chat.id);
    if (preKnown[id]) {
      if (!seenRepeat[id]) { seenRepeat[id] = true; repeatTo.push(id); }
      return;
    }
    if (known[id]) return; // already registered earlier in this same batch - nothing more to do
    known[id] = true;
    var name = [m.chat.first_name, m.chat.last_name].filter(function (x) { return x; }).join(' ');
    newChats.push({ chatId: id, name: name, username: m.chat.username ? '@' + m.chat.username : '' });
  });
  return { offset: offset, newChats: newChats, replyTo: newChats.map(function (c) { return c.chatId; }), repeatTo: repeatTo };
}

// ---------------------------------------------------------------- token / Telegram API

function notify_props_() { return PropertiesService.getScriptProperties(); }

function notify_token_() {
  try { return String(notify_props_().getProperty(TELEGRAM_TOKEN_PROP) || '').trim(); } catch (e) { return ''; }
}

/** Calls a Bot API method. Never throws, never returns the token / URL: {ok, status, result, error}. */
function telegramApi_(token, method, payload) {
  try {
    var resp = UrlFetchApp.fetch(TELEGRAM_API_ + token + '/' + method, { method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload || {}), muteHttpExceptions: true });
    var status = resp.getResponseCode(), body = null;
    try { body = JSON.parse(resp.getContentText()); } catch (e1) { body = null; }
    var ok = status >= 200 && status < 300 && !!body && body.ok === true;
    return { ok: ok, status: status, result: body ? body.result : null, error: ok ? '' : ('HTTP ' + status + (body && body.description ? ' ' + body.description : '')) };
  } catch (e) {
    return { ok: false, status: 0, result: null, error: 'fetch failed' };
  }
}

// ---------------------------------------------------------------- chats registry

function notify_chatRows_() { return getSheet(TABS.TELEGRAM_CHATS) ? readObjects(TABS.TELEGRAM_CHATS) : []; }

/**
 * Shared core for both the manual menu refresh and the automatic 5-minute trigger: pulls pending bot updates
 * (getUpdates, stored offset, no webhook), records every new /start chat in TELEGRAM_CHATS (EMAIL blank, ACTIVE Y),
 * replies once to each new chat, and once more (a different, shorter message) to a chat that already exists but sends
 * /start again. Throws if there is no token yet or getUpdates fails - callers decide how to handle that.
 * Returns {updates, newChats, names}.
 */
function telegramPoll_() {
  var token = notify_token_();
  if (!token) throw new Error('No Telegram bot token yet (HR OS > Alerts > Telegram: set bot token)');
  var props = notify_props_();
  var prevOffset = parseInt(props.getProperty(TELEGRAM_OFFSET_PROP) || '0', 10) || 0;
  var req = { timeout: 0, allowed_updates: ['message'] };
  if (prevOffset > 0) req.offset = prevOffset;
  var res = telegramApi_(token, 'getUpdates', req);
  if (!res.ok) throw new Error('Telegram getUpdates failed: ' + res.error);
  var updates = Array.isArray(res.result) ? res.result : [];
  var sheet = ensureSheet(TABS.TELEGRAM_CHATS);
  ensureHeaders(sheet, TELEGRAM_CHAT_HEADERS);
  var known = notify_chatRows_().map(function (r) { return String(r.CHAT_ID).trim(); });
  var plan = telegramPlanUpdates(updates, known, prevOffset);
  if (plan.newChats.length) {
    appendObjects(sheet, plan.newChats.map(function (c) {
      return { CHAT_ID: c.chatId, NAME: c.name, USERNAME: c.username, FIRST_SEEN: nowIso_(), EMAIL: '', ACTIVE: 'Y' };
    }), { textHeaders: ['CHAT_ID'] });
  }
  // the offset is stored after the rows are written: a failed write re-reads the same updates next time (no chat is lost)
  if (plan.offset > prevOffset) props.setProperty(TELEGRAM_OFFSET_PROP, String(plan.offset));
  plan.replyTo.forEach(function (chatId) { telegramApi_(token, 'sendMessage', { chat_id: chatId, text: TELEGRAM_START_REPLY }); });
  plan.repeatTo.forEach(function (chatId) { telegramApi_(token, 'sendMessage', { chat_id: chatId, text: TELEGRAM_REPEAT_REPLY }); });
  return { updates: updates.length, newChats: plan.newChats.length, names: plan.newChats.map(function (c) { return c.name || c.username || c.chatId; }) };
}

/** Manual version (menu "Telegram: refresh chats"): same polling as telegramPoll_(), plus an audit row for the click. */
function telegramPollUpdates_() {
  var out = telegramPoll_();
  audit('TELEGRAM_REFRESH', '', '', { updates: out.updates, newChats: out.newChats });
  return out;
}

/**
 * Automatic version (62_Reminders.gs installs this on a 5-minute time trigger): the same polling as telegramPoll_(),
 * but silent and safe for a trigger nobody is watching - no bot token yet is not an error (returns quietly), and any
 * other failure (network, Telegram API, sheet write) is caught and written to AUDIT_LOG instead of breaking the trigger.
 */
function telegramPollUpdatesTrigger_() {
  if (!notify_token_()) return;
  try {
    telegramPoll_();
  } catch (e) {
    try { audit('TELEGRAM_POLL_ERROR', '', '', String(e && e.message ? e.message : e)); } catch (e2) { /* the log never blocks the trigger */ }
  }
}

// ---------------------------------------------------------------- notify_

function notify_audit_(subject, channel, ok, to) {
  try { audit('NOTIFY', '', '', { subject: String(subject).slice(0, 120), channel: channel, ok: !!ok, to: to }); } catch (e) { /* the log never blocks an alert */ }
}

function notify_email_(email, subject, text) {
  if (typeof MailApp === 'undefined') return false; // not running inside Apps Script
  try { MailApp.sendEmail({ to: email, subject: subject, body: text }); return true; } catch (e) { return false; }
}

/**
 * Sends subject + text to each email: Telegram to its mapped ACTIVE chat(s) when a token exists, otherwise (no token, no
 * mapped chat, or every Telegram send failed) an email via MailApp. Never throws. Returns [{to, channel:'TELEGRAM'|'EMAIL'|'NONE', ok}].
 */
function notify_(emails, subject, text) {
  var out = [];
  try {
    var list = notifyEmailList(emails);
    if (!list.length) return out;
    var token = notify_token_(), chats = {};
    if (token) { try { chats = notifyChatMap(notify_chatRows_()); } catch (e0) { chats = {}; } }
    var body = String(text == null ? '' : text);
    var tgText = (subject ? subject + '\n' : '') + body;
    if (tgText.length > TELEGRAM_MAX_TEXT) tgText = tgText.slice(0, TELEGRAM_MAX_TEXT) + '...';
    list.forEach(function (email) {
      var done = false, tried = false;
      (token && chats[email] ? chats[email] : []).forEach(function (chatId) {
        tried = true;
        var r = telegramApi_(token, 'sendMessage', { chat_id: chatId, text: tgText });
        if (r.ok) done = true;
      });
      if (tried) notify_audit_(subject, 'TELEGRAM', done, email);
      if (done) { out.push({ to: email, channel: 'TELEGRAM', ok: true }); return; }
      if (typeof MailApp === 'undefined') { out.push({ to: email, channel: 'NONE', ok: false }); return; }
      var ok = notify_email_(email, subject, body);
      notify_audit_(subject, 'EMAIL', ok, email);
      out.push({ to: email, channel: 'EMAIL', ok: ok });
    });
  } catch (e) { /* notify_ never throws */ }
  return out;
}

// ---------------------------------------------------------------- owner-only menu actions

function notify_requireOwner_() {
  var owner = getOwnerApproverEmail().toLowerCase(), user = auditUser_().toLowerCase();
  if (!owner) throw new Error('OWNER_APPROVER_EMAIL is not set in PAYROLL_CONTROL');
  if (user !== owner) throw new Error('Owner only: log in as OWNER_APPROVER_EMAIL (' + owner + ')');
  return user;
}

/** Validates the token with getMe, then stores it in Script Properties. The token is never logged or echoed. */
function telegramSetToken(token) {
  notify_requireOwner_();
  token = String(token == null ? '' : token).trim();
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('That does not look like a bot token (from @BotFather: 123456:ABC...)');
  var me = telegramApi_(token, 'getMe', {});
  if (!me.ok) throw new Error('Telegram did not accept the token (' + me.error + '). Nothing was saved.');
  notify_props_().setProperty(TELEGRAM_TOKEN_PROP, token);
  audit('TELEGRAM_TOKEN_SET', '', '', { bot: me.result && me.result.username ? '@' + me.result.username : '' });
  return 'Bot token saved' + (me.result && me.result.username ? ' (bot @' + me.result.username + ')' : '') + '. Now ask each person to open the bot and press Start.';
}

function telegramRefreshChats() {
  notify_requireOwner_();
  var r = telegramPollUpdates_();
  return r.newChats + ' new chat(s) registered' + (r.names.length ? ': ' + r.names.join(', ') : '') + '. ' + r.updates +
    ' update(s) read.\nType each person\'s email in the EMAIL column of TELEGRAM_CHATS to link them.';
}

/** Sends a test message to the logged-in user (Telegram when linked, else email) and says which channel was used. */
function telegramSendTestToMe() {
  var me = auditUser_();
  if (!me || me === 'unknown') throw new Error('Cannot determine your email');
  var res = notify_([me], 'HR OS test message', 'HR OS alerts work. This is a test.');
  var r = res[0];
  if (!r) return 'Nothing was sent.';
  var why = r.channel === 'EMAIL' && notify_token_() ? ' (your chat is not linked yet: type your email in TELEGRAM_CHATS)' : '';
  return (r.ok ? 'Sent via ' : 'FAILED via ') + r.channel + ' to ' + r.to + why;
}

// ---------------------------------------------------------------- stage notifications

function stage_fmt_(n) {
  var x = Number(n);
  return isFinite(x) ? x.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0.00';
}

/** Kill switch: PAYROLL_CONTROL STAGE_NOTIFICATIONS = N turns the stage messages off (anything else = on). */
function stage_enabled_() {
  return String(getControl('STAGE_NOTIFICATIONS', 'Y')).trim().toUpperCase() !== 'N';
}

/** Pure. One stage message: {subject, text, to:[roles]} for kind CALC | HR_APPROVED | ACCOUNTS_APPROVED | LOCKED. */
function stageMessage(kind, d) {
  var pop = d.population || '', per = d.period;
  if (kind === 'CALC') {
    var lines = (d.populations || []).map(function (s) {
      return s.population + ': ' + s.payable + ' employees, ' + (s.held || []).length + ' on hold, total net ' + stage_fmt_(s.totalNet);
    });
    return { subject: 'Payroll draft ready - ' + per, text: 'Draft calculated for ' + per + '.\n' + lines.join('\n') + '\nNext: review and HR approve.', to: ['HR'] };
  }
  var head = pop + ' ' + per + ': ' + d.employees + ' employees, ' + (d.held || 0) + ' on hold, total net ' + stage_fmt_(d.net) + '.';
  if (kind === 'HR_APPROVED') return { subject: 'HR approved - ' + pop + ' ' + per, text: 'HR approved. ' + head + '\nNext: Accounts approve.', to: ['ACCOUNTS'] };
  if (kind === 'ACCOUNTS_APPROVED') return { subject: 'Accounts approved - ' + pop + ' ' + per, text: 'Accounts approved. ' + head + '\nNext: lock the period.', to: ['HR', 'OWNER'] };
  if (kind === 'LOCKED') return { subject: 'Locked - ' + pop + ' ' + per, text: 'Locked. ' + head + '\nNext: generate payslips.', to: ['HR'] };
  return null;
}

function stage_recipients_(roles) {
  var out = [];
  roles.forEach(function (r) {
    if (r === 'HR') out.push(getControl('HR_APPROVER_EMAIL', ''));
    else if (r === 'ACCOUNTS') out.push(getControl('ACCOUNTS_APPROVER_EMAIL', ''));
    else if (r === 'OWNER') out.push(getOwnerApproverEmail());
  });
  return notifyEmailList(out);
}

/** Payable rows -> {employees, net}. Uses the engine's payable-row filter (held rows are not payable). */
function stage_totals_(rows) {
  var pay = engine_payableRows_(rows || []);
  return { employees: pay.length, net: engine_sum_(pay, 'NET_PAY') };
}

/**
 * The hook the payroll actions call AFTER their work is done. Wraps EVERYTHING in try/catch: a failing notification can
 * never fail, slow down by more than a send, or roll back the payroll action. d carries what the action already computed:
 * CALC {period, populations: calculateDraft summaries}; HR_APPROVED / ACCOUNTS_APPROVED {period, population, calc} (engine result);
 * LOCKED {period, population, rows (the PAYROLL_LOCKED rows), held}.
 */
function stageNotifySafe_(kind, d) {
  try {
    if (!stage_enabled_()) return null;
    var data = { period: d.period, population: d.population };
    if (kind === 'CALC') data.populations = d.populations;
    else if (kind === 'LOCKED') { var t = stage_totals_(d.rows); data.employees = t.employees; data.net = t.net; data.held = (d.held || []).length; }
    else { var t2 = stage_totals_(d.calc && d.calc.rows); data.employees = t2.employees; data.net = t2.net; data.held = d.calc && d.calc.held ? d.calc.held.length : 0; }
    var msg = stageMessage(kind, data);
    if (!msg) return null;
    return notify_(stage_recipients_(msg.to), msg.subject, msg.text);
  } catch (e) {
    return null;
  }
}
