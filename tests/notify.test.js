'use strict';
// 61_Notify.gs (Telegram + email notifier, stage notifications) and 62_Reminders.gs (daily reminder, digest, triggers).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, makeFormApp } = require('./fakes');
const { plain } = require('./load');

const OWNER = 'yash.munot@gmail.com', HR = 'hr@varshaforgings.com', ACC = 'accounts@varshaforgings.com';
const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0';
const AUDIT_HDR = ['Timestamp', 'Module', 'Status', 'User', 'Message'];

/** In-memory Telegram + Mail + Properties + time triggers. tg.respond(method, payload) may return {status, body}. */
function google() {
  const props = {}, mails = [], fetches = [], triggers = [];
  const tg = { updates: [], respond: null, down: false };
  const UrlFetchApp = { fetch: (url, opts) => {
    const m = /\/bot([^/]+)\/(\w+)$/.exec(url);
    const payload = JSON.parse(opts.payload || '{}');
    fetches.push({ url, method: m[2], payload, opts });
    if (tg.down) throw new Error('network down ' + url);
    let res = tg.respond ? tg.respond(m[2], payload) : null;
    if (!res) {
      if (m[2] === 'getUpdates') res = { status: 200, body: { ok: true, result: tg.updates.filter((u) => !payload.offset || u.update_id >= payload.offset) } };
      else if (m[2] === 'getMe') res = { status: 200, body: { ok: true, result: { username: 'vfl_payroll_bot' } } };
      else res = { status: 200, body: { ok: true, result: {} } };
    }
    return { getResponseCode: () => res.status, getContentText: () => JSON.stringify(res.body) };
  } };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; } }) };
  const MailApp = { getRemainingDailyQuota: () => 100, sendEmail: (o) => { if (mails.fail) throw new Error('mail down'); mails.push(o); } };
  const ScriptApp = {
    getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler, _t: t })),
    newTrigger: (handler) => {
      const t = { handler }; const b = {};
      b.timeBased = () => b; b.everyDays = (n) => { t.every = n; return b; }; b.atHour = (h) => { t.hour = h; return b; }; b.nearMinute = (m) => { t.minute = m; return b; };
      b.inTimezone = (z) => { t.tz = z; return b; }; b.forSpreadsheet = () => b; b.onFormSubmit = () => { t.event = 'FORM_SUBMIT'; return b; };
      b.create = () => { triggers.push(t); return t; };
      return b;
    },
    deleteTrigger: (tr) => { const i = triggers.indexOf(tr._t); if (i < 0) throw new Error('no such trigger'); triggers.splice(i, 1); },
  };
  return { props, mails, fetches, triggers, tg, UrlFetchApp, PropertiesService, MailApp, ScriptApp };
}

function world(opts = {}) {
  const g = google();
  const holder = {};
  const FormApp = { openById: (id) => { if (id !== 'FORM_VFL') throw new Error('no form'); return { getPublishedUrl: () => 'https://forms/live/VFL' }; } };
  const env = makeEnv({ user: opts.user || OWNER, globals: { UrlFetchApp: g.UrlFetchApp, PropertiesService: g.PropertiesService, MailApp: g.MailApp, ScriptApp: g.ScriptApp, FormApp } });
  holder.env = env;
  env.put('AUDIT_LOG', AUDIT_HDR);
  env.put('PAYROLL_CONTROL', ['KEY', 'VALUE', 'NOTE', 'UPDATED_AT'], [
    { KEY: 'HR_APPROVER_EMAIL', VALUE: HR }, { KEY: 'ACCOUNTS_APPROVER_EMAIL', VALUE: ACC }, { KEY: 'OWNER_APPROVER_EMAIL', VALUE: OWNER },
    { KEY: 'REGISTER_ENTRY_EMAILS_VFL', VALUE: 'hrmanager@varshaforgings.com, second@varshaforgings.com' }, { KEY: 'REGISTER_ENTRY_EMAILS_PUNE', VALUE: 'ea@varshaforgings.com' },
    { KEY: 'ATT_FORM_VFL_ID', VALUE: 'FORM_VFL' }, { KEY: 'DAILY_REMINDER_FROM', VALUE: '2026-10-01' }]);
  env.put('TELEGRAM_CHATS', ['CHAT_ID', 'NAME', 'USERNAME', 'FIRST_SEEN', 'EMAIL', 'ACTIVE']);
  return Object.assign(env, { g });
}
const audits = (env) => env.rowsOf('AUDIT_LOG');
const notifyAudits = (env) => audits(env).filter((r) => r.Status === 'NOTIFY');
const link = (env, chat, email, active = 'Y') => env.addRows('TELEGRAM_CHATS', [{ CHAT_ID: String(chat), NAME: 'n', EMAIL: email, ACTIVE: active }]);
const startMsg = (id, chat, o = {}) => ({ update_id: id, message: Object.assign({ chat: { id: chat, type: 'private', first_name: 'Asha', last_name: 'K', username: 'asha' }, text: '/start' }, o) });

test('notifyEmailList / notifyChatMap are pure and forgiving', () => {
  const { c } = makeEnv();
  assert.deepEqual(plain(c.notifyEmailList(' A@x.com, b@y.com;a@x.com  nope ')), ['a@x.com', 'b@y.com']);
  assert.deepEqual(plain(c.notifyEmailList(['A@x.com', '', null])), ['a@x.com']);
  assert.deepEqual(plain(c.notifyEmailList('')), []);
  assert.deepEqual(plain(c.notifyChatMap([{ CHAT_ID: 1, EMAIL: 'A@x.com', ACTIVE: 'Y' }, { CHAT_ID: 2, EMAIL: 'a@x.com', ACTIVE: '' }, { CHAT_ID: 3, EMAIL: 'a@x.com', ACTIVE: 'N' },
    { CHAT_ID: 4, EMAIL: '', ACTIVE: 'Y' }, { CHAT_ID: 5, EMAIL: 'b@x.com', ACTIVE: 'n' }])), { 'a@x.com': ['1', '2'] });
});

test('telegramPlanUpdates: only private /start chats are recorded, known chats ignored, offset advances past every update', () => {
  const { c } = makeEnv();
  const plan = plain(c.telegramPlanUpdates([startMsg(10, 111), startMsg(11, 111), startMsg(12, 222, { text: 'hello' }), startMsg(13, 333, { chat: { id: 333, type: 'group' } }),
    startMsg(14, 444, { text: '/start@vfl_bot' }), startMsg(15, 555), { update_id: 16, edited_message: {} }], ['555'], 5));
  assert.deepEqual(plan.newChats.map((x) => x.chatId), ['111', '444']);
  assert.deepEqual(plan.newChats[0], { chatId: '111', name: 'Asha K', username: '@asha' });
  assert.equal(plan.offset, 17);
  assert.equal(plain(c.telegramPlanUpdates([], [], 9)).offset, 9);
});

test('notify_: linked active chat gets Telegram only; no mail', () => {
  const w = world();
  w.g.props.TELEGRAM_BOT_TOKEN = TOKEN;
  link(w, 777, HR);
  const r = plain(w.c.notify_([HR], 'Draft ready', 'STAFF: 10 employees, total net 1,000.00'));
  assert.deepEqual(r, [{ to: HR, channel: 'TELEGRAM', ok: true }]);
  assert.equal(w.g.mails.length, 0);
  assert.equal(w.g.fetches.length, 1);
  assert.equal(w.g.fetches[0].payload.chat_id, '777');
  assert.match(w.g.fetches[0].payload.text, /^Draft ready\nSTAFF: 10 employees/);
});

test('notify_: no token, unmapped person, inactive chat or a failed Telegram send all fall back to email', () => {
  const w = world();
  assert.equal(plain(w.c.notify_([HR], 's1', 'b1'))[0].channel, 'EMAIL', 'no token');
  w.g.props.TELEGRAM_BOT_TOKEN = TOKEN;
  assert.equal(plain(w.c.notify_([ACC], 's2', 'b2'))[0].channel, 'EMAIL', 'unmapped');
  link(w, 1, 'inactive@x.com', 'N');
  assert.equal(plain(w.c.notify_(['inactive@x.com'], 's3', 'b3'))[0].channel, 'EMAIL', 'inactive chat');
  link(w, 2, OWNER);
  w.g.tg.respond = (m) => (m === 'sendMessage' ? { status: 403, body: { ok: false, description: 'bot was blocked by the user' } } : null);
  assert.equal(plain(w.c.notify_([OWNER], 's4', 'b4'))[0].channel, 'EMAIL', 'HTTP failure');
  w.g.tg.respond = null; w.g.tg.down = true;
  assert.equal(plain(w.c.notify_([OWNER], 's5', 'b5'))[0].channel, 'EMAIL', 'network exception');
  assert.deepEqual(w.g.mails.map((m) => m.subject), ['s1', 's2', 's3', 's4', 's5']);
  assert.equal(w.g.mails[0].to, HR);
});

test('notify_: logs subject + channel + ok only (no body text, no token); never throws; email failure reported', () => {
  const w = world();
  w.g.props.TELEGRAM_BOT_TOKEN = TOKEN;
  link(w, 7, HR);
  w.c.notify_([HR, ACC], 'Approved - STAFF', 'SECRET BODY total net 5,00,000.00');
  const rows = notifyAudits(w);
  assert.equal(rows.length, 2, 'HR telegram; ACC has no chat -> email');
  assert.ok(rows.every((r) => !/SECRET BODY|5,00,000/.test(r.Message) && !r.Message.includes(TOKEN)));
  assert.match(rows[0].Message, /Approved - STAFF/);
  assert.match(rows[0].Message, /"channel":"TELEGRAM"/);
  assert.match(rows[1].Message, /"channel":"EMAIL"/);
  w.g.mails.fail = true;
  const r = plain(w.c.notify_([ACC], 's', 'b'));
  assert.deepEqual(r, [{ to: ACC, channel: 'EMAIL', ok: false }]);
  assert.match(notifyAudits(w).pop().Message, /"ok":false/);
  w.c.audit = () => { throw new Error('audit down'); };
  assert.doesNotThrow(() => w.c.notify_([ACC], 's', 'b'));
  assert.deepEqual(plain(w.c.notify_([], 's', 'b')), []);
});

test('Telegram errors never expose the token (the URL carries it)', () => {
  const w = world();
  w.g.tg.down = true;
  w.g.props.TELEGRAM_BOT_TOKEN = TOKEN;
  const r = plain(w.c.telegramApi_(TOKEN, 'getMe', {}));
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(TOKEN));
  assert.throws(() => w.c.telegramPollUpdates_(), (e) => !e.message.includes(TOKEN) && /getUpdates failed/.test(e.message));
});

test('telegramSetToken: owner only, format checked, accepted only when Telegram getMe says ok, stored in Script Properties not the sheet', () => {
  const w = world({ user: HR });
  assert.throws(() => w.c.telegramSetToken(TOKEN), /Owner only/);
  assert.equal(w.g.props.TELEGRAM_BOT_TOKEN, undefined);
  w.user = OWNER;
  assert.throws(() => w.c.telegramSetToken('not a token'), /does not look like a bot token/);
  w.g.tg.respond = () => ({ status: 401, body: { ok: false, description: 'Unauthorized' } });
  assert.throws(() => w.c.telegramSetToken(TOKEN), /did not accept the token/);
  assert.equal(w.g.props.TELEGRAM_BOT_TOKEN, undefined, 'a rejected token is not saved');
  w.g.tg.respond = null;
  assert.match(w.c.telegramSetToken(' ' + TOKEN + ' '), /Bot token saved \(bot @vfl_payroll_bot\)/);
  assert.equal(w.g.props.TELEGRAM_BOT_TOKEN, TOKEN);
  const everything = JSON.stringify(Object.values(w.sheets).map((s) => s.data));
  assert.ok(!everything.includes(TOKEN), 'the token is in no sheet, audit log included');
  assert.ok(audits(w).some((r) => r.Status === 'TELEGRAM_TOKEN_SET'));
});

test('telegramPollUpdates_: registers /start chats with a blank EMAIL, replies once, stores the offset, is idempotent', () => {
  const w = world();
  w.g.props.TELEGRAM_BOT_TOKEN = TOKEN;
  w.g.tg.updates = [startMsg(100, 111), startMsg(101, 222, { text: 'hi' })];
  let r = plain(w.c.telegramPollUpdates_());
  assert.deepEqual([r.updates, r.newChats], [2, 1]);
  const rows = w.rowsOf('TELEGRAM_CHATS');
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].CHAT_ID, rows[0].NAME, rows[0].USERNAME, rows[0].EMAIL, rows[0].ACTIVE], ['111', 'Asha K', '@asha', '', 'Y']);
  assert.ok(rows[0].FIRST_SEEN);
  assert.equal(w.g.props.TELEGRAM_UPDATE_OFFSET, '102');
  const replies = w.g.fetches.filter((f) => f.method === 'sendMessage');
  assert.equal(replies.length, 1);
  assert.deepEqual([replies[0].payload.chat_id, replies[0].payload.text], ['111', 'Registered. Ask the payroll owner to link you.']);
  const first = w.g.fetches.find((f) => f.method === 'getUpdates');
  assert.equal(first.payload.offset, undefined);
  assert.equal(first.opts.muteHttpExceptions, true);
  // the same person presses Start again later: no new row, no second reply
  w.g.tg.updates.push(startMsg(103, 111));
  r = plain(w.c.telegramPollUpdates_());
  assert.equal(r.newChats, 0);
  assert.equal(w.rowsOf('TELEGRAM_CHATS').length, 1);
  assert.equal(w.g.fetches.filter((f) => f.method === 'sendMessage').length, 1);
  assert.equal(w.g.fetches.filter((f) => f.method === 'getUpdates').pop().payload.offset, 102, 'uses the stored offset');
  assert.equal(w.g.props.TELEGRAM_UPDATE_OFFSET, '104');
  // an unmapped chat never receives payroll data
  assert.equal(plain(w.c.notify_([HR], 'Payroll', 'x'))[0].channel, 'EMAIL');
  assert.equal(w.g.fetches.filter((f) => f.method === 'sendMessage').length, 1, 'still only the registration reply');
});

test('telegram menu actions are owner-only; test message reports the channel', () => {
  const w = world({ user: HR });
  assert.throws(() => w.c.telegramRefreshChats(), /Owner only/);
  w.g.props.TELEGRAM_BOT_TOKEN = TOKEN;
  assert.match(w.c.telegramSendTestToMe(), /Sent via EMAIL to hr@varshaforgings.com \(your chat is not linked yet/);
  link(w, 5, HR);
  assert.equal(w.c.telegramSendTestToMe(), 'Sent via TELEGRAM to ' + HR);
});

// ---------------------------------------------------------------- reminders

test('reminderDecision: before start date, weekly off, paid holiday, received, missing', () => {
  const { c } = makeEnv();
  const a = { site: 'VFL', date: '2026-10-07', from: '2026-10-01', weeklyOff: 'SUN', holidays: [], dailyRows: [], hasPopulations: true };
  const d = (o) => plain(c.reminderDecision(Object.assign({}, a, o)));
  assert.equal(d({}).action, 'SEND');
  assert.match(d({ date: '2026-09-30' }).reason, /before DAILY_REMINDER_FROM/);
  assert.match(d({ from: '' }).reason, /before DAILY_REMINDER_FROM/);
  assert.equal(d({ date: '2026-10-04' }).reason, 'weekly off', '4 Oct 2026 is a Sunday');
  assert.equal(d({ date: '2026-10-04', weeklyOff: 'MON' }).action, 'SEND', 'weekly off is per site setting');
  assert.equal(d({ holidays: [{ DATE: '2026-10-07', SITE: 'VFL', PAID: 'Y' }] }).reason, 'paid holiday');
  assert.equal(d({ holidays: [{ DATE: '2026-10-07', SITE: 'PUNE', PAID: 'Y' }] }).action, 'SEND', 'another site holiday');
  assert.equal(d({ holidays: [{ DATE: '2026-10-07', SITE: 'ALL', PAID: 'Y' }] }).action, 'SKIP');
  assert.equal(d({ holidays: [{ DATE: '2026-10-07', SITE: 'VFL', PAID: 'N' }] }).action, 'SEND', 'an unpaid holiday is no excuse');
  assert.equal(d({ dailyRows: [{ DATE: '2026-10-07', SITE: 'VFL', EMP_ID: 'a' }] }).reason, 'daily attendance received');
  assert.equal(d({ dailyRows: [{ DATE: '2026-10-07', SITE: 'PUNE', EMP_ID: 'a' }, { DATE: '2026-10-06', SITE: 'VFL', EMP_ID: 'a' }] }).action, 'SEND');
  assert.equal(d({ hasPopulations: false }).action, 'SKIP');
});

function reminderWorld() {
  const w = world();
  w.put('ATTENDANCE_DAILY', ['PERIOD', 'DATE', 'SITE', 'EMP_ID', 'CODE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'REJECT_REASON', 'ENTERED_AT']);
  w.put('HOLIDAY_CALENDAR', ['DATE', 'SITE', 'HOLIDAY_NAME', 'PAID']);
  return w;
}

test('dailyAttendance reminder: checks the shift-day that just finished (today - 1 day), not today', () => {
  const w = reminderWorld();
  // today is 8-Oct; the shift-day that finished at 07:00 today is 7-Oct 07:00 -> 8-Oct 07:00
  w.addRows('ATTENDANCE_DAILY', [{ PERIOD: '2026-10', DATE: '2026-10-07', SITE: 'PUNE', EMP_ID: 'P1', CODE: 'P', STATUS: 'VALID' }]);
  let r = plain(w.c.attendanceReminderRun_('REMINDER', '2026-10-08'));
  assert.deepEqual(r.map((x) => [x.site, x.action]), [['VFL', 'SEND'], ['PUNE', 'SKIP']]);
  assert.deepEqual(w.g.mails.map((m) => m.to).sort(), ['hrmanager@varshaforgings.com', 'second@varshaforgings.com']);
  assert.equal(w.g.mails[0].subject, 'Daily attendance for VFL Waluj not received for shift-day 07-Oct-2026 (07:00 07-Oct to 07:00 08-Oct).');
  assert.match(w.g.mails[0].body, /Daily attendance for VFL Waluj not received for shift-day 07-Oct-2026 \(07:00 07-Oct to 07:00 08-Oct\)\. Form: https:\/\/forms\/live\/VFL/);
  w.g.mails.length = 0;
  r = plain(w.c.attendanceReminderRun_('ESCALATION', '2026-10-08'));
  assert.deepEqual(w.g.mails.map((m) => m.to).sort(), ['hrmanager@varshaforgings.com', OWNER, 'second@varshaforgings.com'].sort());
  assert.match(w.g.mails[0].body, /Still missing after the 11:00 reminder/);
  // once VFL arrives for the shift-day (7-Oct), the 14:00 run stays quiet
  w.addRows('ATTENDANCE_DAILY', [{ PERIOD: '2026-10', DATE: '2026-10-07', SITE: 'VFL', EMP_ID: 'V1', CODE: 'P', STATUS: 'VALID' }]);
  w.g.mails.length = 0;
  plain(w.c.attendanceReminderRun_('ESCALATION', '2026-10-08'));
  assert.equal(w.g.mails.length, 0);
  // a daily row filed under TODAY's date (the shift-day that just started, not yet finished) does not count
  const w2 = reminderWorld();
  w2.addRows('ATTENDANCE_DAILY', [{ PERIOD: '2026-10', DATE: '2026-10-08', SITE: 'VFL', EMP_ID: 'V1', CODE: 'P', STATUS: 'VALID' }]);
  assert.equal(plain(w2.c.attendanceReminderRun_('REMINDER', '2026-10-08'))[0].action, 'SEND', 'today\'s own shift-day row does not satisfy yesterday\'s check');
});

test('dailyAttendance reminder: silent before DAILY_REMINDER_FROM, on the shift-day\'s Sunday and on a paid holiday for that shift-day; both site forms covered', () => {
  const w = reminderWorld();
  assert.ok(plain(w.c.attendanceReminderRun_('REMINDER', '2026-10-01')).every((x) => x.action === 'SKIP'), 'shift-day 30-Sep is before DAILY_REMINDER_FROM 1-Oct');
  // shift-day 4-Oct-2026 is a Sunday; it is checked the following day, 5-Oct
  assert.ok(plain(w.c.attendanceReminderRun_('REMINDER', '2026-10-05')).every((x) => x.action === 'SKIP'), 'shift-day was a Sunday');
  w.addRows('HOLIDAY_CALENDAR', [{ DATE: '2026-10-20', SITE: 'VFL', HOLIDAY_NAME: 'Dussehra', PAID: 'Y' }]);
  assert.deepEqual(plain(w.c.attendanceReminderRun_('REMINDER', '2026-10-21')).map((x) => x.action), ['SKIP', 'SEND'], 'shift-day 20-Oct (checked on 21-Oct) was VFL\'s paid holiday');
  assert.equal(w.g.mails.length, 1);
  assert.equal(w.g.mails[0].to, 'ea@varshaforgings.com');
  assert.match(w.g.mails[0].body, /form link unavailable/, 'no Pune form id stored');
  assert.equal(w.g.triggers.length, 0, 'running a reminder never installs a trigger');
});

test('the entry points are plain functions the time trigger can call (event argument ignored)', () => {
  const w = reminderWorld();
  assert.equal(typeof w.c.dailyAttendanceReminder, 'function');
  assert.equal(typeof w.c.dailyAttendanceEscalation, 'function');
  assert.equal(typeof w.c.inputDigest, 'function');
  assert.doesNotThrow(() => w.c.dailyAttendanceReminder({ 'time-driven': 1 }));
});

// ---------------------------------------------------------------- triggers

test('planReminderTriggers: creates only the missing ones, counts foreign triggers, limit 20', () => {
  const { c } = makeEnv();
  assert.deepEqual(plain(c.planReminderTriggers([{ handler: 'x' }])), { create: ['dailyAttendanceReminder', 'dailyAttendanceEscalation', 'inputDigest'], present: [], total: 4 });
  assert.deepEqual(plain(c.planReminderTriggers([{ handler: 'inputDigest' }])).create, ['dailyAttendanceReminder', 'dailyAttendanceEscalation']);
  const seventeen = Array.from({ length: 17 }, (_, i) => ({ handler: 'f' + i }));
  assert.equal(c.planReminderTriggers(seventeen).create.length, 3, '17 + 3 = 20 is allowed');
  assert.throws(() => c.planReminderTriggers(seventeen.concat([{ handler: 'f17' }])), /Trigger limit/);
  assert.equal(c.planReminderTriggers(seventeen.concat([{ handler: 'f17' }, { handler: 'dailyAttendanceReminder' }, { handler: 'dailyAttendanceEscalation' }, { handler: 'inputDigest' }].slice(1))).create.length, 0, 'all present: no limit error');
  assert.equal(c.ATT_MAX_TRIGGERS, 5, 'the form-submit cap is unchanged');
});

test('installReminderTriggers: owner only, 11:00 / 14:00 / 11:05 daily in the script time zone, idempotent, foreign triggers untouched', () => {
  const w = world({ user: HR });
  w.g.triggers.push({ handler: 'PHASE1_V2' });
  assert.throws(() => w.c.installReminderTriggers(), /Owner only/);
  assert.equal(w.g.triggers.length, 1);
  w.user = OWNER;
  const r = plain(w.c.installReminderTriggers());
  assert.deepEqual(r.created, ['dailyAttendanceReminder', 'dailyAttendanceEscalation', 'inputDigest']);
  const mine = w.g.triggers.filter((t) => t.handler !== 'PHASE1_V2').map((t) => [t.handler, t.every, t.hour, t.minute, t.tz]);
  assert.deepEqual(mine, [['dailyAttendanceReminder', 1, 11, 0, 'Asia/Kolkata'], ['dailyAttendanceEscalation', 1, 14, 0, 'Asia/Kolkata'], ['inputDigest', 1, 11, 5, 'Asia/Kolkata']]);
  const again = plain(w.c.installReminderTriggers());
  assert.deepEqual([again.created.length, again.alreadyPresent.length], [0, 3]);
  assert.equal(w.g.triggers.length, 4);
  assert.ok(audits(w).some((x) => x.Status === 'REMINDER_TRIGGERS_INSTALL'));
});

test('removeReminderTriggers deletes only the three reminder triggers (never the form-submit or foreign ones)', () => {
  const w = world();
  w.g.triggers.push({ handler: 'PHASE1_V2' }, { handler: 'hrosOnFormSubmit' });
  w.c.installReminderTriggers();
  assert.equal(w.g.triggers.length, 5);
  const r = plain(w.c.removeReminderTriggers());
  assert.deepEqual(r.removed.sort(), ['dailyAttendanceEscalation', 'dailyAttendanceReminder', 'inputDigest']);
  assert.deepEqual(w.g.triggers.map((t) => t.handler), ['PHASE1_V2', 'hrosOnFormSubmit']);
  w.user = HR;
  assert.throws(() => w.c.removeReminderTriggers(), /Owner only/);
});

test('installTriggers (form submit) ignores the reminder triggers for its cap of 5, and still reports the true total', () => {
  const w = world();
  w.g.triggers.push({ handler: 'a' }, { handler: 'b' }, { handler: 'c' });
  w.c.installReminderTriggers(); // 3 foreign + 3 reminder = 6 > 5 if they were counted
  const r = plain(w.c.installTriggers());
  assert.deepEqual([r.created, r.totalTriggers], [1, 7]);
  assert.ok(w.g.triggers.some((t) => t.handler === 'hrosOnFormSubmit'));
});

test('appsscript.json: explicit scopes include external_request (re-authorise once) and the time zone is Asia/Kolkata', () => {
  const m = require('../apps-script/appsscript.json');
  assert.equal(m.timeZone, 'Asia/Kolkata');
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/script.send_mail'));
  assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/script.scriptapp'));
});

// ---------------------------------------------------------------- digest

function digestWorld(over = {}) {
  const w = world();
  w.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DOJ_AS_SOURCE'], [
    { EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '01/04/2019' },
    { EMP_ID: 'P1', PAYROLL_CATEGORY: 'PUNE_STAFF', STATUS_AS_SOURCE: 'Active', DOJ_AS_SOURCE: '01/04/2019' }]);
  w.put('PAYROLL_PERIOD_CATEGORY', ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS'],
    ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((p) => ({ PAYROLL_MONTH: '2026-09', PAYROLL_CATEGORY: p, WORKING_DAYS: 26, STATUS: 'PENDING' })));
  w.put('FEED_STATUS', ['PERIOD', 'FEED', 'STATUS'], ['HOLIDAYS', 'CANTEEN', 'SOCIETY', 'ADVANCE'].map((FEED) => ({ PERIOD: '2026-09', FEED, STATUS: 'COMPLETE' })));
  w.put('INPUT_ATTENDANCE', ['PAYROLL_MONTH', 'EMP_ID', 'PRESENT_DAYS', 'APPROVAL_STATUS'], [{ PAYROLL_MONTH: '2026-09', EMP_ID: 'S1', PRESENT_DAYS: 24, APPROVAL_STATUS: 'PENDING' }]);
  w.put('INPUT_OT', ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'NORMALIZER_VERSION']);
  ['INPUT_CANTEEN', 'INPUT_SOCIETY', 'INPUT_ADVANCE'].forEach((t) => w.put(t, ['PAYROLL_MONTH', 'EMP_ID', 'STATUS', 'APPROVAL_STATUS', 'CLOSING_BALANCE_INR']));
  const ctl = w.sheets.PAYROLL_CONTROL;
  ctl.data.push(['OT_PENDING_2026-09', '{"STAFF":0,"PERMANENT_WORKER":0,"CONSULTANT":0,"PUNE_STAFF":0}', '', '']);
  return w;
}

test('inputDigest: only day 1-10 (previous month); HR gets the full digest, the Pune entry people only their attendance lines', () => {
  const w = digestWorld();
  assert.equal(plain(w.c.inputDigestRun_('2026-10-15')).skipped, 'outside day 1-10');
  assert.equal(w.g.mails.length, 0);
  const r = plain(w.c.inputDigestRun_('2026-10-03'));
  assert.equal(r.period, '2026-09');
  assert.equal(r.ready, false);
  const toHr = w.g.mails.filter((m) => m.to === HR);
  assert.equal(toHr.length, 1);
  assert.match(toHr[0].body, /Payroll inputs for 2026-09/);
  assert.match(toHr[0].body, /⏳ ATTENDANCE/);
  assert.match(toHr[0].body, /P1/, 'missing Pune employee listed');
  const toPune = w.g.mails.filter((m) => m.to === 'ea@varshaforgings.com');
  assert.equal(toPune.length, 1);
  assert.match(toPune[0].body, /PUNE_STAFF/);
  assert.doesNotMatch(toPune[0].body, /HOLIDAYS/, 'attendance lines only');
  assert.equal(w.g.mails.filter((m) => m.to === 'hrmanager@varshaforgings.com').length, 0, 'VFL attendance is complete: nothing for the VFL entry people');
  assert.equal(w.g.triggers.length, 0);
});

test('inputDigest: once everything is in, one "all inputs received" message to HR and owner, then silence', () => {
  const w = digestWorld();
  w.addRows('INPUT_ATTENDANCE', [{ PAYROLL_MONTH: '2026-09', EMP_ID: 'P1', PRESENT_DAYS: 24, APPROVAL_STATUS: 'APPROVED' }]);
  const r = plain(w.c.inputDigestRun_('2026-10-04'));
  assert.equal(r.ready, true);
  assert.deepEqual(w.g.mails.map((m) => m.to).sort(), [HR, OWNER].sort());
  assert.match(w.g.mails[0].body, /All inputs received for 2026-09 - ready to calculate/);
  w.g.mails.length = 0;
  assert.match(plain(w.c.inputDigestRun_('2026-10-05')).skipped, /already reported/);
  assert.equal(w.g.mails.length, 0);
  assert.equal(plain(w.c.inputDigestRun_('2026-11-02')).ready, false, 'next month starts afresh (2026-10 has no rows)');
});

test('inputDigest: skipped once the period is locked or before MIN_PERIOD', () => {
  const w = digestWorld();
  ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].forEach((p) => w.editCells('PAYROLL_PERIOD_CATEGORY', { PAYROLL_CATEGORY: p }, { STATUS: 'LOCKED' }));
  assert.match(plain(w.c.inputDigestRun_('2026-10-03')).skipped, /already locked/);
  assert.match(plain(w.c.inputDigestRun_('2026-09-03')).skipped, /before MIN_PERIOD/);
});

test('menu: Alerts submenu labels are wired and the status dialog text is the digest', () => {
  const w = world();
  const labels = [];
  const menu = (name) => { const m = { items: [], addItem(l, fn) { labels.push([name, l, fn]); return m; }, addSeparator() { return m; }, addSubMenu(s) { return m; }, addToUi() { return m; } }; return m; };
  w.c.SpreadsheetApp.getUi = () => ({ createMenu: menu });
  w.c.onOpen();
  const alerts = labels.filter((l) => l[0] === 'Alerts').map((l) => l[1]);
  assert.deepEqual(alerts, ['Payroll status...', 'Telegram: set bot token', 'Telegram: refresh chats', 'Telegram: send test message to me', 'Install reminder triggers', 'Remove reminder triggers']);
  labels.filter((l) => l[0] === 'Alerts').forEach((l) => assert.equal(typeof w.c[l[2]], 'function', l[2]));
});

// ---------------------------------------------------------------- stage notifications

const P = '2026-09';
const CFG = [['PF_WAGE_CEILING', 15000], ['PF_EMPLOYEE_RATE', 0.12], ['PF_MAX_EMPLOYEE', 1800], ['ESI_EMPLOYEE_RATE', 0.0075], ['ESI_EXEMPT_ABOVE', 21000],
  ['ESI_EMPLOYER_RATE', 0.0325], ['WORKER_VDA_RATE', 103], ['WORKER_HEAT_RATE', 5.78],
  ['PT_SLABS', '[{"min":0,"max":7500,"pt":0},{"min":7500.01,"max":10000,"pt":175},{"min":10000.01,"max":null,"pt":200}]'],
  ['MLWF_EMPLOYEE_RATE', 25], ['PT_FEB_AMOUNT', 300], ['MLWF_MONTHS', '6,12'], ['STAFF_OT_MULTIPLIER', 2], ['WORKER_OT_MULTIPLIER', 2],
  ['STAFF_PF_WAGE_COMPONENTS', 'BASIC,CONVEYANCE,EDUCATION,MEDICAL'],
  ['STAFF_COMPONENT_PCTS', '{"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}'],
  ['EMPLOYER_PF_RATE_STAFF', 0.1301], ['EMPLOYER_PF_RATE_WORKER', 0.1301], ['BONUS_RATE_STAFF', 0.0833], ['GRATUITY_RATE_STAFF', 0.0483],
  ['BONUS_RATE_WORKER', 0.18], ['GRATUITY_RATE_WORKER', 0.0481]];
const PC_HDR = ['PAYROLL_MONTH', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'STATUS', 'APPROVED_BY', 'APPROVED_AT', 'NOTE', 'DRAFT_RUN_ID', 'DRAFT_HASH',
  'HR_APPROVED_BY', 'HR_APPROVED_AT', 'ACCOUNTS_APPROVED_BY', 'ACCOUNTS_APPROVED_AT', 'LOCKED_AT', 'LOCK_ID'];
const SAL_HDR = ['EMP_ID', 'PAYROLL_CATEGORY', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'BASIC_PM_INR', 'HRA_PM_INR', 'CONVEYANCE_PM_INR', 'EDUCATION_PM_INR', 'MEDICAL_PM_INR',
  'PRO_DEV_PM_INR', 'COMMUNICATION_PM_INR', 'UNIFORM_PM_INR', 'WASHING_PM_INR', 'HEAT_MASTER_INR', 'VDA_MASTER_INR', 'PRODUCTION_MASTER_INR', 'FIXED_GROSS_PM_AS_SOURCE_INR', 'HR_APPROVED_BY'];
const ATT_HDR = ['PAYROLL_MONTH', 'EMP_ID', 'PAYROLL_CATEGORY', 'WORKING_DAYS', 'PRESENT_DAYS', 'PHYSICAL_PRESENT_DAYS', 'WEEK_OFF', 'PH', 'EL_AVAILED',
  'CL_AVAILED', 'SL_AVAILED', 'PAID_LEAVE_OTHER', 'ABSENT_LWP_DAYS', 'APPROVAL_STATUS', 'HR_OVERRIDE'];
const { LEAVE_HDR, LEAVE_INPUT_HDR } = require('./fakes');

/** A compact one-employee STAFF month that can be calculated, approved twice and locked, with the real notifier loaded. */
function payrollWorld() {
  const w = world({ user: HR });
  w.sheets.PAYROLL_CONTROL.data.push(['OT_SOURCE_TAB', 'OT_FORM_RESPONSES', '', '']);
  w.put('EMPLOYEE_MASTER', ['EMP_ID', 'EMPLOYEE_NAME', 'PAYROLL_CATEGORY', 'STATUS_AS_SOURCE', 'DEPARTMENT', 'DESIGNATION', 'DOJ_AS_SOURCE'], [
    { EMP_ID: 'S1', EMPLOYEE_NAME: 'Staff', PAYROLL_CATEGORY: 'STAFF', STATUS_AS_SOURCE: 'Active', DEPARTMENT: 'HR', DESIGNATION: 'X', DOJ_AS_SOURCE: '01/04/2019' }]);
  w.put('PAYROLL_PERIOD_CATEGORY', PC_HDR, ['STAFF', 'PERMANENT_WORKER', 'CONSULTANT', 'PUNE_STAFF'].map((c) => ({ PAYROLL_MONTH: P, PAYROLL_CATEGORY: c, WORKING_DAYS: 26, STATUS: 'PENDING' })));
  w.put('INPUT_ATTENDANCE', ATT_HDR, [{ PAYROLL_MONTH: P, EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF', WORKING_DAYS: 26, PRESENT_DAYS: 22, PHYSICAL_PRESENT_DAYS: 22, WEEK_OFF: 4, PH: 0,
    EL_AVAILED: 0, CL_AVAILED: 0, SL_AVAILED: 0, PAID_LEAVE_OTHER: 0, ABSENT_LWP_DAYS: 0, APPROVAL_STATUS: 'APPROVED', HR_OVERRIDE: 'N' }]);
  w.put('SALARY_STRUCTURE', SAL_HDR, [{ EMP_ID: 'S1', PAYROLL_CATEGORY: 'STAFF', EFFECTIVE_FROM: '2026-08-01', BASIC_PM_INR: 12600, HRA_PM_INR: 7560, CONVEYANCE_PM_INR: 1890,
    EDUCATION_PM_INR: 1890, MEDICAL_PM_INR: 1890, PRO_DEV_PM_INR: 945, COMMUNICATION_PM_INR: 630, UNIFORM_PM_INR: 1260, WASHING_PM_INR: 2835, FIXED_GROSS_PM_AS_SOURCE_INR: 31500, HR_APPROVED_BY: 'hr@x' }]);
  w.put('PAYROLL_RATE_PROFILE', ['EMP_ID', 'PAYROLL_CATEGORY', 'PAY_BASIS', 'RATE_AMOUNT_INR', 'MONTHLY_GROSS_INR', 'VERSION_STATE'], []);
  w.put('STATUTORY_CONFIG', ['KEY', 'VALUE', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'VERSION', 'APPROVED_BY'], CFG.map(([KEY, VALUE]) => ({ KEY, VALUE, EFFECTIVE_FROM: '2026-09', VERSION: 1, APPROVED_BY: 'accounts@x' })));
  w.put('EFFICIENCY_CONFIG', ['EFFICIENCY_PERCENT_EXACT', 'INCENTIVE_SLAB_INR', 'IMPLEMENTATION_STATE'], [{ EFFICIENCY_PERCENT_EXACT: 85, INCENTIVE_SLAB_INR: 8500, IMPLEMENTATION_STATE: 'CONFIRMED' }]);
  w.put('INPUT_OT', ['PAYROLL_MONTH', 'EMP_ID', 'OT_HOURS', 'SOURCE_REF', 'APPROVAL_STATUS', 'NORMALIZER_VERSION', 'ELIGIBILITY']);
  w.put('INPUT_CANTEEN', ['PAYROLL_MONTH', 'EMP_ID', 'AMOUNT_INR', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  w.put('INPUT_EFFICIENCY', ['PAYROLL_MONTH', 'EMP_ID', 'EFFICIENCY_PCT', 'PHYSICAL_PRESENT_DAYS_OVERRIDE', 'SOURCE', 'SOURCE_REF', 'KEY', 'STATUS', 'ENTERED_AT', 'REMARKS']);
  w.put('INPUT_ADVANCE', ['PAYROLL_MONTH', 'EMP_ID', 'OPENING_BALANCE_INR', 'RECOVERY_THIS_MONTH_INR', 'ACCOUNTS_LEDGER_REFERENCE', 'APPROVAL_STATUS']);
  w.put('INPUT_SOCIETY', ['PAYROLL_MONTH', 'EMP_ID', 'GENERAL_EMI_INR', 'EMERGENCY_EMI_INR', 'EDUCATION_EMI_INR', 'SHARES_OTHER_INR', 'TOTAL_RECOVERY_INR', 'APPROVAL_STATUS']);
  w.put('INPUT_ADJUSTMENTS', ['PAYROLL_MONTH', 'EMP_ID', 'ADJUSTMENT_TYPE', 'SIGNED_AMOUNT_INR', 'APPROVAL_STATUS']);
  w.put('Leave_Applications', LEAVE_HDR);
  w.put('INPUT_LEAVE', LEAVE_INPUT_HDR);
  w.put('FEED_STATUS', ['PERIOD', 'FEED', 'STATUS'], ['CANTEEN', 'OT', 'ADVANCE', 'SOCIETY', 'ADJUSTMENTS', 'EFFICIENCY', 'LEAVE'].map((FEED) => ({ PERIOD: P, FEED, STATUS: 'COMPLETE' })));
  return w;
}
const pcOf = (w, pop) => w.rowsOf('PAYROLL_PERIOD_CATEGORY').find((r) => r.PAYROLL_CATEGORY === pop);
const runChain = (w) => {
  const out = {};
  w.user = HR; out.calc = plain(w.c.calculateDraft(P, 'STAFF'));
  out.hr = plain(w.c.hrApprove(P, 'STAFF'));
  w.user = ACC; out.acc = plain(w.c.accountsApprove(P, 'STAFF'));
  out.lock = plain(w.c.lockPeriod(P, 'STAFF'));
  return out;
};

test('stage notifications: calculate -> HR, HR approve -> Accounts, Accounts approve -> HR + owner, lock -> HR (totals per population only)', () => {
  const w = payrollWorld();
  const r = runChain(w);
  assert.equal(r.calc.populations[0].population, 'STAFF');
  assert.equal(r.hr.ok, true);
  assert.equal(r.acc.ok, true);
  assert.equal(r.lock.ok, true);
  assert.equal(pcOf(w, 'STAFF').STATUS, 'LOCKED');
  const sent = w.g.mails.map((m) => [m.to, m.subject]);
  assert.deepEqual(sent, [
    [HR, 'Payroll draft ready - 2026-09'],
    [ACC, 'HR approved - STAFF 2026-09'],
    [HR, 'Accounts approved - STAFF 2026-09'], [OWNER, 'Accounts approved - STAFF 2026-09'],
    [HR, 'Locked - STAFF 2026-09'],
  ]);
  const draft = w.g.mails[0].body;
  assert.match(draft, /STAFF: 1 employees, 0 on hold, total net [\d,]+\.\d\d/);
  assert.match(w.g.mails[1].body, /Next: Accounts approve/);
  const netRow = w.rowsOf('PAYROLL_STAFF')[0].NET_PAY;
  assert.ok(w.g.mails[1].body.includes('total net ' + c2(netRow)), 'the population total, from the calculation');
});
function c2(n) { return Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

test('a throwing notifier (notify_, MailApp, Telegram, audit) never breaks calculate / approve / lock', () => {
  const variants = {
    'notify_ throws': (w) => { w.c.notify_ = () => { throw new Error('boom'); }; },
    'stageNotifySafe_ itself throws': (w) => { w.c.stageNotifySafe_ = () => { throw new Error('boom'); }; },
    'MailApp throws': (w) => { w.g.mails.fail = true; },
    'Telegram throws': (w) => { w.g.props.TELEGRAM_BOT_TOKEN = TOKEN; link(w, 9, HR); link(w, 10, ACC); link(w, 11, OWNER); w.g.tg.down = true; w.g.mails.fail = true; },
    'recipient lookup throws': (w) => { w.c.getControl = () => { throw new Error('boom'); }; },
    'message builder throws': (w) => { w.c.stageMessage = () => { throw new Error('boom'); }; },
  };
  Object.keys(variants).forEach((name) => {
    const w = payrollWorld();
    const baseline = payrollWorld();
    const ok = runChain(baseline);
    if (name === 'recipient lookup throws') {
      // the payroll itself reads getControl too, so only the notification-side lookup may fail
      w.c.stage_recipients_ = () => { throw new Error('boom'); };
    } else variants[name](w);
    const r = runChain(w);
    assert.equal(r.calc.populations[0].population, 'STAFF', name);
    assert.equal(r.hr.ok && r.acc.ok && r.lock.ok, true, name);
    assert.equal(pcOf(w, 'STAFF').STATUS, 'LOCKED', name);
    assert.equal(w.rowsOf('PAYROLL_LOCKED').length, baseline.rowsOf('PAYROLL_LOCKED').length, name);
    assert.deepEqual(plain(w.rowsOf('PAYROLL_STAFF')).map((x) => x.NET_PAY), plain(baseline.rowsOf('PAYROLL_STAFF')).map((x) => x.NET_PAY), name + ': same numbers');
    assert.equal(ok.lock.ok, true);
  });
});

test('stage notifications: Telegram first for linked people, STAGE_NOTIFICATIONS = N switches them off, a refused approval sends nothing', () => {
  const w = payrollWorld();
  w.g.props.TELEGRAM_BOT_TOKEN = TOKEN;
  link(w, 41, HR);
  w.user = HR; w.c.calculateDraft(P, 'STAFF');
  assert.equal(w.g.fetches.filter((f) => f.method === 'sendMessage' && f.payload.chat_id === '41').length, 1);
  assert.equal(w.g.mails.length, 0);
  // refused: Accounts tries before HR approved -> no message
  w.user = ACC; assert.equal(w.c.accountsApprove(P, 'STAFF').ok, false);
  assert.equal(w.g.fetches.filter((f) => f.method === 'sendMessage').length, 1);
  assert.equal(w.g.mails.length, 0);
  w.sheets.PAYROLL_CONTROL.data.push(['STAGE_NOTIFICATIONS', 'N', '', '']);
  w.user = HR; assert.equal(w.c.hrApprove(P, 'STAFF').ok, true);
  assert.equal(w.g.fetches.filter((f) => f.method === 'sendMessage').length, 1, 'switched off');
  assert.equal(w.g.mails.length, 0);
});

test('setup creates TELEGRAM_CHATS (visible, header as specified, protected to the owner) and seeds DAILY_REMINDER_FROM = 2026-10-01', () => {
  const { c } = makeEnv();
  const spec = plain(c.hrosTabSpecs_().find((s) => s.name === 'TELEGRAM_CHATS'));
  assert.deepEqual(spec.headers, ['CHAT_ID', 'NAME', 'USERNAME', 'FIRST_SEEN', 'EMAIL', 'ACTIVE']);
  assert.ok(!spec.hidden);
  assert.deepEqual(spec.protect, ['OWNER_APPROVER_EMAIL']);
  const defs = Object.fromEntries(plain(c.HROS_CONTROL_DEFAULTS).map((r) => [r[0], r[1]]));
  assert.equal(defs.DAILY_REMINDER_FROM, '2026-10-01');
  assert.equal(defs.STAGE_NOTIFICATIONS, 'Y');
});
