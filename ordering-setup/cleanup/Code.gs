/**
 * 友愛冰室 — daily privacy clean-up (privacy policy, section 6).
 * Runs every night at 03:00 London time:
 *  - café queue: entries from before today are deleted
 *  - QR orders older than ALLERGY_DAYS: name, allergy note and free-text note are removed;
 *    the items ordered and payment records stay for the accounts.
 * Set up: paste this file and appsscript.json into a new Apps Script project owned by the
 * Google account that owns the Firebase project, then run setupDailyTrigger once.
 */
const DB = 'https://yauoicafequeue-default-rtdb.europe-west1.firebasedatabase.app';
const TZ = 'Europe/London';
const ALLERGY_DAYS = 30;

function fb_(method, path, body, shallow) {
  const opt = { method: method, muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body !== undefined) opt.payload = JSON.stringify(body);
  const res = UrlFetchApp.fetch(DB + '/' + path + '.json' + (shallow ? '?shallow=true' : ''), opt);
  const code = res.getResponseCode(), text = res.getContentText();
  if (code >= 300) throw new Error(method + ' /' + path + ' → ' + code + ' ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}
function fbPatchChunked_(updates) {
  const keys = Object.keys(updates);
  for (let i = 0; i < keys.length; i += 200) {
    const part = {};
    keys.slice(i, i + 200).forEach(k => part[k] = updates[k]);
    fb_('patch', '', part);
  }
}

function dailyCleanup() {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const q = fb_('get', 'queue') || {};
  const qdel = {};
  Object.keys(q).forEach(k => {
    const at = q[k] && q[k].joinedAt;
    if (!at || Utilities.formatDate(new Date(at), TZ, 'yyyy-MM-dd') < today) qdel['queue/' + k] = null;
  });
  if (Object.keys(qdel).length) fbPatchChunked_(qdel);

  const cutoff = Utilities.formatDate(new Date(Date.now() - ALLERGY_DAYS * 864e5), TZ, 'yyyy-MM-dd');
  const done = fb_('get', 'ordering/meta/cleanedThrough') || '';
  const days = Object.keys(fb_('get', 'ordering/orders', undefined, true) || {}).filter(d => d < cutoff && d > done).sort();
  let n = 0;
  days.forEach(d => {
    const orders = fb_('get', 'ordering/orders/' + d) || {};
    const upd = {};
    Object.keys(orders).forEach(id => ['allergy', 'name', 'note'].forEach(f => {
      if (orders[id][f]) { upd['ordering/orders/' + d + '/' + id + '/' + f] = null; n++; }
    }));
    if (Object.keys(upd).length) fbPatchChunked_(upd);
    fb_('put', 'ordering/meta/cleanedThrough', d);
  });
  Logger.log('排隊刪除 ' + Object.keys(qdel).length + ' 個；訂單清走 ' + n + ' 項個人備註（' + days.length + ' 日）。');
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyCleanup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyCleanup').timeBased().atHour(3).everyDays(1).inTimezone(TZ).create();
  Logger.log('已設定每日凌晨 3 點清理排隊同過敏備註。');
}
