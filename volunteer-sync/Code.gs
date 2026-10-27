/**
 * Salford Hongkongers — Firebase ↔ Google Sheet sync for volunteer accounts and check-in.
 *
 * Runs as a separate Apps Script project under the Google account that can edit the
 * "2026 Salford Hongkongers CIC Year Plan" sheet AND is an owner/editor of the Firebase
 * project yauoicafequeue. No keys are stored: it uses that account's own sign-in.
 *
 * Run once from the editor, in this order:
 *   1. importVolunteers()   — copies 義工資料 into Firebase so existing volunteers only set a password
 *   2. pushCategories()     — copies the activity categories from the 2026 tab
 *   3. setupHourlyTrigger() — then syncAll() runs every hour by itself
 *
 * syncAll() each hour:
 *   - adds newly approved volunteers to 義工資料 with the next 編號
 *   - writes every closed event to the year tab (same layout as before: one row per time slot,
 *     names from column J) and one row per person to 打卡明細 (full record)
 *   - copies each person's total hours (from 時數) back to Firebase so volunteers can see them
 */

const SS_ID = '1FtfXxl8qktmF-FNUy_ItOVED0nwBM5DdohrwHXimtkM';
const DB = 'https://yauoicafequeue-default-rtdb.europe-west1.firebasedatabase.app';
const TZ = 'Europe/London';
const VOL = '義工資料';
const HRS = '時數';
const DETAIL = '打卡明細';
const YEAR_HEADER = ['Month', 'Date', 'Day', 'Time', 'Hours', 'Activities', '參與人數', 'Category', 'Count', 'Names'];
const DETAIL_HEADER = ['日期 Date', '活動 Event', '類別 Category', '義工編號 ID', '名字 Name', '打卡入 In', '打卡出 Out', '時數 Hours', '備註 Note', 'Event ID'];

// ── Firebase REST (signed in as the account running this script) ─────────
function fb_(method, path, body) {
  const opt = { method: method, muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body !== undefined) opt.payload = JSON.stringify(body);
  const res = UrlFetchApp.fetch(DB + '/' + path + '.json', opt);
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

// Same rules as shk/shk.js normPhone()
function normPhone_(s) {
  let d = String(s || '').replace(/[^\d+]/g, '');
  if (d.indexOf('+') === 0) d = d.slice(1);
  if (d.indexOf('00') === 0) d = d.slice(2);
  d = d.replace(/\D/g, '');
  if (/^07\d{9}$/.test(d)) d = '44' + d.slice(1);
  else if (/^7\d{9}$/.test(d)) d = '44' + d;
  else if (/^[4-9]\d{7}$/.test(d)) d = '852' + d;
  else if (/^4407\d{9}$/.test(d)) d = '44' + d.slice(3);
  return /^\d{10,15}$/.test(d) ? d : null;
}
function prettyPhone_(pid) {
  if (pid.indexOf('44') === 0) return '0' + pid.slice(2);
  if (pid.indexOf('852') === 0) return '852 ' + pid.slice(3);
  return pid;
}

// ── 1. Import existing volunteers (safe to run again: only adds missing people) ──
function importVolunteers() {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(VOL).getDataRange().getValues();
  const dir = fb_('get', 'shk/directory') || {};
  const upd = {}, seen = {}, skipped = [], dups = [];
  let added = 0, already = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], id = r[0], name = String(r[1] || '').trim();
    if (!name) continue;
    const pid = normPhone_(r[5]);
    if (!pid) { skipped.push(id + ' ' + name + '（電話：' + r[5] + '）'); continue; }
    if (seen[pid]) { dups.push(id + ' ' + name + ' 同 ' + seen[pid] + ' 用同一個電話'); continue; }
    seen[pid] = id + ' ' + name;
    if (dir[pid]) { already++; continue; }
    // Only what the account needs. The 關係圖 / nickname notes stay in the sheet.
    upd['shk/people/' + pid] = { name: name, first: String(r[2] || '').trim().replace(/^No Match$/, ''), surname: String(r[3] || '').trim().replace(/^No Match$/, ''), phone: pid, legacyId: id, status: 'active', roles: { volunteer: true }, imported: true };
    upd['shk/directory/' + pid] = { legacyId: id, gen: 0, imported: true, claimed: false };
    added++;
  }
  if (added) fbPatchChunked_(upd);
  const msg = '已匯入 ' + added + ' 人；之前已匯入 ' + already + ' 人。\n' +
    (skipped.length ? '冇電話或電話格式唔啱（' + skipped.length + '）：\n  ' + skipped.join('\n  ') + '\n' : '') +
    (dups.length ? '同一個電話（' + dups.length + '），只匯入第一個：\n  ' + dups.join('\n  ') : '');
  Logger.log(msg);
  return msg;
}

// ── 2. Activity categories from the year tab (column H) ──
function pushCategories() {
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(String(new Date().getFullYear())) || SpreadsheetApp.openById(SS_ID).getSheetByName('2026');
  const vals = sh.getRange(2, 8, Math.max(1, sh.getLastRow() - 1), 1).getValues().map(r => String(r[0]).trim()).filter(Boolean);
  const cats = Array.from(new Set(vals.concat(['友愛冰室'])));
  const existing = fb_('get', 'shk/categories') || [];
  const merged = Array.from(new Set((Array.isArray(existing) ? existing : Object.values(existing)).concat(cats))).filter(Boolean);
  fb_('put', 'shk/categories', merged);
  Logger.log('類別：' + merged.join('、'));
}

// ── 3. Hourly sync ──
function syncAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const people = fb_('get', 'shk/people') || {};
    addNewVolunteers_(ss, people);
    syncEvents_(ss, people);
    SpreadsheetApp.flush();
    pushHours_(ss, people);
  } finally { lock.releaseLock(); }
}

function addNewVolunteers_(ss, people) {
  const sh = ss.getSheetByName(VOL);
  const rows = sh.getDataRange().getValues();
  let next = rows.slice(1).reduce((m, r) => Math.max(m, +r[0] || 0), 0);
  const upd = {};
  Object.keys(people).forEach(pid => {
    const p = people[pid];
    if (p.status !== 'active' || p.legacyId) return;
    next++;
    sh.appendRow([next, p.name || '', p.first || '', p.surname || '', p.name || '', prettyPhone_(pid)]);
    upd['shk/people/' + pid + '/legacyId'] = next;
    upd['shk/directory/' + pid + '/legacyId'] = next;
    p.legacyId = next;
  });
  if (Object.keys(upd).length) fb_('patch', '', upd);
}

function yearSheet_(ss, year) {
  let sh = ss.getSheetByName(year);
  if (!sh) { sh = ss.insertSheet(year); sh.appendRow(YEAR_HEADER); }
  return sh;
}
function detailSheet_(ss) {
  let sh = ss.getSheetByName(DETAIL);
  if (!sh) { sh = ss.insertSheet(DETAIL); sh.appendRow(DETAIL_HEADER); sh.setFrozenRows(1); }
  return sh;
}
const round15_ = ts => Math.round(ts / 900000) * 900000;
const hhmm_ = ts => Utilities.formatDate(new Date(ts), TZ, 'HHmm');
const hhmmColon_ = ts => Utilities.formatDate(new Date(ts), TZ, 'HH:mm');

// Remove rows written earlier for this event (if an event was reopened and closed again)
function removeEventRows_(ss, eid) {
  const det = ss.getSheetByName(DETAIL);
  if (det && det.getLastRow() > 1) {
    const ids = det.getRange(2, 10, det.getLastRow() - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0] === eid) det.deleteRow(i + 2);
  }
  ss.getSheets().forEach(sh => {
    if (!/^\d{4}$/.test(sh.getName()) || sh.getLastRow() < 2) return;
    const notes = sh.getRange(2, 6, sh.getLastRow() - 1, 1).getNotes();
    for (let i = notes.length - 1; i >= 0; i--) if (notes[i][0] === 'event:' + eid) sh.deleteRow(i + 2);
  });
}

function syncEvents_(ss, people) {
  const events = fb_('get', 'shk/events') || {};
  const att = fb_('get', 'shk/attendance') || {};
  Object.keys(events).forEach(eid => {
    const e = events[eid];
    if (e.open || e.syncedAt) return;
    removeEventRows_(ss, eid);
    const done = Object.keys(att[eid] || {}).map(pid => Object.assign({ pid: pid }, att[eid][pid])).filter(r => r.in && r.out && r.out > r.in);
    if (done.length) {
      const d = new Date(e.date + 'T12:00:00Z');
      const month = +e.date.slice(5, 7), day = +e.date.slice(8, 10), dow = Utilities.formatDate(d, TZ, 'EEE');
      // year tab: one row per time slot, like the existing sheet
      const slots = {};
      done.forEach(r => {
        const a = round15_(r.in), b = round15_(r.out), key = hhmm_(a) + '-' + hhmm_(b);
        (slots[key] = slots[key] || { a: a, b: b, names: [] }).names.push((people[r.pid] && people[r.pid].name) || r.pid);
      });
      const ys = yearSheet_(ss, e.date.slice(0, 4));
      Object.keys(slots).sort().forEach((key, i) => {
        const s = slots[key], hours = Math.round((s.b - s.a) / 36000) / 100;
        ys.appendRow([month, day, dow, key, hours, e.title, i === 0 ? (e.participants || '') : '', e.category || '', s.names.length].concat(s.names.sort()));
        ys.getRange(ys.getLastRow(), 6).setNote('event:' + eid);
      });
      // full record: one row per person
      const det = detailSheet_(ss);
      done.sort((x, y) => x.in - y.in).forEach(r => {
        const p = people[r.pid] || {};
        det.appendRow([e.date, e.title, e.category || '', p.legacyId || '', p.name || r.pid, hhmmColon_(r.in), hhmmColon_(r.out), Math.round((round15_(r.out) - round15_(r.in)) / 36000) / 100, r.edited ? '管理員補打' : '', eid]);
      });
    }
    fb_('patch', 'shk/events/' + eid, { syncedAt: Date.now() });
  });
}

// Totals from the 時數 tab (it already adds up every year-tab row), recent sessions from 打卡明細
function pushHours_(ss, people) {
  const totals = {};
  const hs = ss.getSheetByName(HRS);
  if (hs && hs.getLastRow() > 1) hs.getRange(2, 1, hs.getLastRow() - 1, 3).getValues().forEach(r => { const n = String(r[0]).trim(); if (n) totals[n] = { count: +r[1] || 0, total: +r[2] || 0 }; });
  const recent = {};
  const det = ss.getSheetByName(DETAIL);
  if (det && det.getLastRow() > 1) det.getRange(2, 1, det.getLastRow() - 1, 8).getValues().forEach(r => {
    const n = String(r[4]).trim();
    (recent[n] = recent[n] || []).push({ date: r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd') : String(r[0]), title: String(r[1]), hours: +r[7] || 0 });
  });
  const out = {};
  Object.keys(people).forEach(pid => {
    const n = String(people[pid].name || '').trim(), t = totals[n] || { count: 0, total: 0 };
    out[pid] = { total: t.total, count: t.count, recent: (recent[n] || []).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20), updatedAt: Date.now() };
  });
  fb_('put', 'shk/hours', out);
}

function setupHourlyTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncAll').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  Logger.log('已設定每小時同步一次。');
}
