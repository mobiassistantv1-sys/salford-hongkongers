// Salford Hongkongers — Volunteer Apps Script
// Sheet ID: 1FtfXxl8qktmF-FNUy_ItOVED0nwBM5DdohrwHXimtkM
// Deploy: Web App | Execute as: Me | Access: Anyone

const SS_ID   = '1FtfXxl8qktmF-FNUy_ItOVED0nwBM5DdohrwHXimtkM';
const VOL     = '義工資料'; // cols: 編號 | 名字 | FirstName | Surname | Nickname | WhatsApp
const LOG     = '2026';    // cols: Month|Date|Day|Time|Hours|Activities|參與|Category|Manpower|Names
const HRS     = '時數';    // cols: Name | Attendance | Total Hours

function out(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const a = e.parameter.action || '';
    if (a === 'getVolunteers') return out(getVolunteers());
    if (a === 'verify')        return out(verify(e.parameter.name, e.parameter.phone));
    if (a === 'ping')          return out({ ok: true });
    return out({ error: 'unknown action' });
  } catch(err) { return out({ error: err.toString() }); }
}

function doPost(e) {
  try {
    let p;
    // Support both JSON body and URL-encoded / FormData
    try {
      const raw = e.postData && e.postData.contents;
      p = raw ? JSON.parse(raw) : e.parameter;
    } catch(_) {
      p = e.parameter;
    }
    if (!p || !p.action) return out({ error: 'missing action' });
    if (p.action === 'register') return out(register(p));
    if (p.action === 'punchIn')  return out(punchIn(p));
    if (p.action === 'punchOut') return out(punchOut(p));
    return out({ error: 'unknown action' });
  } catch(err) { return out({ error: err.toString() }); }
}

// ── Register ──────────────────────────────────────────────
function register(p) {
  const firstName = (p.firstName || '').trim();
  const surname   = (p.surname   || '').trim();
  const name      = (p.name || [firstName, surname].filter(Boolean).join(' ')).trim();
  const wa        = (p.whatsapp || p.phone || '').trim();
  if (!name) return { success: false, error: '請輸入姓名' };

  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(VOL);
  const rows  = sheet.getDataRange().getValues();

  // Duplicate check
  if (rows.slice(1).some(r => r[1] === name && r[5] === wa))
    return { success: false, duplicate: true, message: '此義工已登記' };

  const nextId = rows.slice(1).reduce((m, r) => Math.max(m, +r[0] || 0), 0) + 1;
  sheet.appendRow([nextId, name, firstName, surname, p.nickname||name, wa]);
  return { success: true, id: nextId, message: '登記成功！歡迎加入 Salford Hongkongers！' };
}

// ── Volunteer list (for autocomplete) ─────────────────────
function getVolunteers() {
  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(VOL).getDataRange().getValues();
  return { volunteers: rows.slice(1).map(r => ({ name: r[1], whatsapp: r[5] })).filter(v => v.name) };
}

// ── Verify name + last 4 digits ───────────────────────────
function verify(name, phone) {
  name  = (name  || '').trim();
  phone = (phone || '').trim();
  if (!name || !phone) return { verified: false, message: '請輸入姓名及電話尾4位' };

  const rows = SpreadsheetApp.openById(SS_ID).getSheetByName(VOL).getDataRange().getValues();
  const match = rows.slice(1).find(r => r[1] === name && r[5].toString().replace(/\s/g,'').slice(-4) === phone);
  return match
    ? { verified: true,  name: name, message: '核對成功' }
    : { verified: false, message: '姓名或電話尾4位不符' };
}

// ── Punch In ──────────────────────────────────────────────
function punchIn(p) {
  const name = (p.name || '').trim();
  if (!name) return { success: false, error: '請輸入姓名' };

  const now   = new Date();
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(LOG);
  const rows  = sheet.getDataRange().getValues();
  const m     = now.getMonth() + 1, d = now.getDate();
  const hhmm  = pad(now.getHours()) + pad(now.getMinutes());

  // Already punched in today?
  const exists = rows.slice(1).find(r => +r[0]===m && +r[1]===d && r[9]===name && !String(r[3]).includes('-'));
  if (exists) return { success: false, alreadyIn: true, message: '你今日已打咗入，請先打出' };

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  sheet.appendRow([m, d, days[now.getDay()], hhmm, '', '打卡 — '+name, '', '義工打卡', 1, name]);
  return { success: true, punchInTime: hhmm, message: name+' 打卡入成功！' };
}

// ── Punch Out ─────────────────────────────────────────────
function punchOut(p) {
  const name = (p.name || '').trim();
  if (!name) return { success: false, error: '請輸入姓名' };

  const now   = new Date();
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(LOG);
  const rows  = sheet.getDataRange().getValues();
  const m     = now.getMonth() + 1, d = now.getDate();
  const hhmm  = pad(now.getHours()) + pad(now.getMinutes());

  // Find open punch-in row
  let ri = -1;
  for (let i = rows.length - 1; i >= 1; i--) {
    const r = rows[i];
    if (+r[0]===m && +r[1]===d && r[9]===name && !String(r[3]).includes('-')) { ri = i; break; }
  }
  if (ri < 0) return { success: false, message: '找不到今日打卡入記錄，請先打卡入' };

  const inTime = String(rows[ri][3]);
  const hours  = Math.round(((+hhmm.slice(0,2)*60 + +hhmm.slice(2)) - (+inTime.slice(0,2)*60 + +inTime.slice(2))) / 60 * 10) / 10;
  sheet.getRange(ri+1, 4).setValue(inTime+'-'+hhmm);
  sheet.getRange(ri+1, 5).setValue(hours);
  addHours(name, hours);

  return { success: true, punchInTime: inTime, punchOutTime: hhmm, hours, message: name+' 打卡出！今日 '+hours+' 小時' };
}

// ── Update 時數 Sheet ──────────────────────────────────────
function addHours(name, h) {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(HRS);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === name) {
      sheet.getRange(i+1,2).setValue((+rows[i][1]||0)+1);
      sheet.getRange(i+1,3).setValue(Math.round(((+rows[i][2]||0)+h)*10)/10);
      return;
    }
  }
  sheet.appendRow([name, 1, h]);
}

function pad(n) { return n < 10 ? '0'+n : ''+n; }