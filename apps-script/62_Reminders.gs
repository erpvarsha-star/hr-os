/**
 * 62_Reminders.gs - time-driven alerts: daily attendance reminder (11:00) + escalation (14:00), month-end input digest
 * (11:05, day 1-10). Nothing here runs until the owner installs the triggers (HR OS > Alerts > Install reminder triggers).
 * Apps Script time triggers fire inside the hour asked for (atHour) within about +-15 minutes of nearMinute, not to the second.
 */
var REMINDER_HANDLERS = {
  dailyAttendanceReminder: { hour: 11, minute: 0 },
  dailyAttendanceEscalation: { hour: 14, minute: 0 },
  inputDigest: { hour: 11, minute: 5 }
};
/**
 * Apps Script allows 20 triggers per user per script. The HR OS form-submit trigger keeps its own conservative cap
 * (ATT_MAX_TRIGGERS, which does not count these three); the reminder triggers are checked against the platform limit.
 */
var HROS_PLATFORM_MAX_TRIGGERS = 20;
var REMINDER_FROM_DEFAULT = '2026-10-01';
var DIGEST_DONE_PROP_PREFIX = 'DIGEST_ALL_READY_SENT_';

function reminderHandlerNames_() { return Object.keys(REMINDER_HANDLERS); }

// ---------------------------------------------------------------- pure

/**
 * Pure. What to do for one site on one date. args: {site, date, from (ISO, PAYROLL_CONTROL DAILY_REMINDER_FROM), weeklyOff
 * (SUN..SAT), holidays (HOLIDAY_CALENDAR rows), dailyRows (ATTENDANCE_DAILY rows), hasPopulations}.
 * Returns {site, action:'SEND'|'SKIP', reason}. A daily response counts when ATTENDANCE_DAILY has any row for the site and date.
 */
function reminderDecision(a) {
  if (!a.hasPopulations) return { site: a.site, action: 'SKIP', reason: 'no active population at this site' };
  if (!a.from || a.date < a.from) return { site: a.site, action: 'SKIP', reason: 'before DAILY_REMINDER_FROM ' + (a.from || '(blank)') };
  if (weekdayOf(a.date) === a.weeklyOff) return { site: a.site, action: 'SKIP', reason: 'weekly off' };
  if (isPaidHoliday_(a.holidays, a.date, a.site)) return { site: a.site, action: 'SKIP', reason: 'paid holiday' };
  var got = (a.dailyRows || []).some(function (r) {
    return toIsoDate(r.DATE) === a.date && legacySite_(r.SITE) === a.site;
  });
  return got ? { site: a.site, action: 'SKIP', reason: 'daily attendance received' } : { site: a.site, action: 'SEND', reason: 'not received' };
}

/**
 * Pure. Existing triggers [{handler}] -> {create:[handlers missing], present:[handlers already there], total}. Throws when
 * creating them would pass maxTriggers. Foreign triggers are only counted, never touched.
 */
function planReminderTriggers(existing, maxTriggers) {
  var max = maxTriggers || HROS_PLATFORM_MAX_TRIGGERS;
  var have = {};
  (existing || []).forEach(function (t) { have[t.handler] = true; });
  var names = reminderHandlerNames_();
  var create = names.filter(function (n) { return !have[n]; }), present = names.filter(function (n) { return have[n]; });
  if ((existing || []).length + create.length > max) {
    throw new Error('Trigger limit: ' + existing.length + ' existing + ' + create.length + ' new exceeds ' + max + ' (Apps Script allows 20 per script)');
  }
  return { create: create, present: present, total: (existing || []).length + create.length };
}

// ---------------------------------------------------------------- daily attendance reminder

function reminder_liveUrl_(site) {
  var def = ATT_FORM_DEFS[site];
  try {
    var id = def ? String(getControl(def.idKey, '')).trim() : '';
    if (id) return String(FormApp.openById(id).getPublishedUrl());
  } catch (e) { /* fall through */ }
  return '(form link unavailable - ask HR)';
}

/**
 * mode 'REMINDER' -> REGISTER_ENTRY_EMAILS_<SITE>; 'ESCALATION' -> the same people plus the owner, only for sites still missing. dateIso defaults to today.
 * Returns [{site, action, reason, sent}].
 */
function attendanceReminderRun_(mode, dateIso) {
  var date = dateIso || status_todayIso_();
  var from = toIsoDate(getControl('DAILY_REMINDER_FROM', REMINDER_FROM_DEFAULT));
  var holidays = status_readOpt_(TABS.HOLIDAY_CALENDAR), daily = status_readOpt_(TABS.ATTENDANCE_DAILY).filter(function (r) { return toIsoDate(r.DATE) === date; });
  var owner = getOwnerApproverEmail(), out = [];
  [SITE_VFL, SITE_PUNE].forEach(function (site) {
    var d = reminderDecision({ site: site, date: date, from: from, weeklyOff: getWeeklyOff(site), holidays: holidays, dailyRows: daily,
      hasPopulations: populationsOfSite(site).length > 0 });
    var sent = [];
    if (d.action === 'SEND') {
      var subject = 'Daily attendance for ' + site + ' not received for ' + date;
      var text = subject + '. Form: ' + reminder_liveUrl_(site);
      var to = notifyEmailList(getControl('REGISTER_ENTRY_EMAILS_' + site, ''));
      if (mode === 'ESCALATION') to = notifyEmailList(to.concat([owner]));
      if (mode === 'ESCALATION') text = 'Still missing after the 11:00 reminder. ' + text;
      sent = notify_(to, subject, text);
    }
    out.push({ site: site, action: d.action, reason: d.reason, sent: sent });
  });
  return out;
}

/** 11:00 time trigger. No-op before DAILY_REMINDER_FROM, on the site's weekly off and on its paid holidays. */
function dailyAttendanceReminder() { return attendanceReminderRun_('REMINDER'); }

/** 14:00 time trigger: if a site is still missing, the owner is told too. */
function dailyAttendanceEscalation() { return attendanceReminderRun_('ESCALATION'); }

// ---------------------------------------------------------------- month-end input digest

function digest_periodLocked_(period) {
  var st = getPeriodStatusMap(period), pops = populationList();
  return pops.length > 0 && pops.every(function (p) { return st[p] === PERIOD_STATUS.LOCKED; });
}

/**
 * 11:05 time trigger, day 1-10 of the month after the payroll period (period = previous calendar month). HR gets the full
 * digest, the site's REGISTER_ENTRY_EMAILS_<SITE> get their site's attendance lines. Once every population is ready one
 * "all inputs received" message goes to HR and the owner and the digest stops for that period.
 */
function inputDigest() { return inputDigestRun_(status_todayIso_()); }

function inputDigestRun_(todayIso) {
  var period = statusDigestPeriod(todayIso);
  if (!period) return { skipped: 'outside day 1-10' };
  if (period < getMinPeriod()) return { skipped: 'period ' + period + ' is before MIN_PERIOD' };
  if (digest_periodLocked_(period)) return { skipped: period + ' is already locked', period: period };
  var props = notify_props_(), doneKey = DIGEST_DONE_PROP_PREFIX + period;
  if (props.getProperty(doneKey)) return { skipped: 'all inputs already reported for ' + period, period: period };
  var st = payrollStatus(period);
  var hr = notifyEmailList(getControl('HR_APPROVER_EMAIL', '')), owner = notifyEmailList(getOwnerApproverEmail());
  if (st.ready) {
    var msg = 'All inputs received for ' + period + ' - ready to calculate.';
    var sent = notify_(notifyEmailList(hr.concat(owner)), 'Payroll ' + period + ': all inputs received', msg);
    props.setProperty(doneKey, todayIso);
    audit('INPUT_DIGEST', period, '', { allReady: true });
    return { period: period, ready: true, sent: sent };
  }
  var full = statusDigestText(st, {});
  var sentHr = notify_(hr, 'Payroll inputs ' + period + ': still waiting', full.text);
  var sentSites = [];
  [SITE_VFL, SITE_PUNE].forEach(function (site) {
    var part = statusDigestText(st, { sites: [site], onlyKeys: ['ATTENDANCE'], onlyOpen: true });
    if (!part.populationsShown) return;
    sentSites = sentSites.concat(notify_(notifyEmailList(getControl('REGISTER_ENTRY_EMAILS_' + site, '')).filter(function (e) { return hr.indexOf(e) < 0; }),
      'Attendance for ' + period + ' still missing (' + site + ')', part.text));
  });
  audit('INPUT_DIGEST', period, '', { allReady: false, notReady: st.overall.notReady });
  return { period: period, ready: false, sent: sentHr.concat(sentSites) };
}

// ---------------------------------------------------------------- install / remove (owner only, explicit menu actions)

function installReminderTriggers() {
  notify_requireOwner_();
  var existing = ScriptApp.getProjectTriggers().map(function (t) { return { handler: t.getHandlerFunction() }; });
  var plan = planReminderTriggers(existing, HROS_PLATFORM_MAX_TRIGGERS);
  plan.create.forEach(function (name) {
    var h = REMINDER_HANDLERS[name];
    ScriptApp.newTrigger(name).timeBased().everyDays(1).atHour(h.hour).nearMinute(h.minute).inTimezone(HROS_TZ).create();
  });
  var res = { created: plan.create, alreadyPresent: plan.present, totalTriggers: plan.total };
  audit('REMINDER_TRIGGERS_INSTALL', '', '', res);
  return res;
}

function removeReminderTriggers() {
  notify_requireOwner_();
  var names = reminderHandlerNames_(), removed = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names.indexOf(t.getHandlerFunction()) < 0) return; // never touch any other trigger
    ScriptApp.deleteTrigger(t);
    removed.push(t.getHandlerFunction());
  });
  audit('REMINDER_TRIGGERS_REMOVE', '', '', { removed: removed });
  return { removed: removed };
}
