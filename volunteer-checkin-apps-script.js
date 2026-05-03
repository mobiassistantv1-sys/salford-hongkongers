// Salford Hongkongers — Volunteer Apps Script
// Sheet ID: 1FtfXxl8qktmF-FNUy_ItOVED0nwBM5DdohrwHXimtkM
// Deploy: Web App | Execute as: Me | Access: Anyone
// Handles: volunteer register, check-in/out, event registration, enquiry/feedback

const SS_ID   = '1FtfXxl8qktmF-FNUy_ItOVED0nwBM5DdohrwHXimtkM';
const VOL     = '義工資料'; // cols: 編號 | 名字 | FirstName | Surname | Nickname | WhatsApp
const LOG     = '2026';    // cols: Month|Date|Day|Time|Hours|Activities|參與|Category|Manpower|Names
const HRS     = '時數';    // cols: Name | Attendance | Total Hours
const EVT     = '活動登記'; // cols: 時間戳記|姓名|電郵|電話類型|電話|居住地點|活動|備註
const ENQ     = '查詢意見'; // cols: 時間戳記|姓名|電郵|電話|類別|主題|訊息
const NOTIFY  = 'hkerssalford@gmail.com';

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
    try {
      const raw = e.postData && e.postData.contents;
      p = raw ? JSON.parse(raw) : e.parameter;
    } catch(_) {
      p = e.parameter;
    }
    if (!p || !p.action) return out({ error: 'missing action' });
    if (p.action === 'register')       return out(register(p));
    if (p.action === 'punchIn')        return out(punchIn(p));
    if (p.action === 'punchOut')       return out(punchOut(p));
    if (p.action === 'eventRegister')  return out(eventRegister(p));
    if (p.action === 'enquiry')        return out(handleEnquiry(p));
    return out({ error: 'unknown action' });
  } catch(err) { return out({ error: err.toString() }); }
}

// ── Volunteer Register ────────────────────────────────────
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

  // Notify org
  try {
    MailApp.sendEmail(NOTIFY,
      `新義工登記 — ${name}`,
      `姓名: ${name}\nWhatsApp: ${wa}\n電郵: ${p.email||''}\n興趣技能: ${p.skills||''}\n備註: ${p.notes||''}\n時間: ${new Date()}`
    );
  } catch(e) {}

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

// ── Event Registration ────────────────────────────────────
function eventRegister(p) {
  const name      = (p.name      || '').trim();
  const email     = (p.email     || '').trim();
  const phoneType = (p.phoneType || 'UK').trim();
  const phone     = (p.phone     || '').trim();
  const postcode  = (p.postcode  || '').trim();
  const eventName = (p.eventName || '').trim();
  const notes     = (p.notes     || '').trim();

  if (!name || !email) return { success: false, error: '請填寫姓名及電郵' };

  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(EVT);
  if (!sheet) {
    sheet = ss.insertSheet(EVT);
    sheet.appendRow(['時間戳記','姓名','電郵','電話類型','電話','居住地點','活動','備註']);
    formatHeader(sheet);
  }
  sheet.appendRow([new Date(), name, email, phoneType, phone, postcode, eventName, notes]);

  // Notify org
  try {
    MailApp.sendEmail(NOTIFY,
      `新活動登記 — ${eventName} — ${name}`,
      `姓名: ${name}\n電郵: ${email}\n電話 (${phoneType}): ${phone}\n居住地點: ${postcode}\n活動: ${eventName}\n備註: ${notes}\n時間: ${new Date()}`
    );
  } catch(e) {}

  // Auto-reply to registrant
  if (email) {
    try {
      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f9f9f9;padding:24px;border-radius:12px;">
          <div style="background:#c0392b;padding:16px 24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;font-size:1.4rem;margin:0;">Salford Hongkongers CIC</h1>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0;">
            <h2 style="color:#c0392b;">活動登記確認 ✓</h2>
            <p>親愛的 <strong>${name}</strong>，</p>
            <p>感謝你報名參加 <strong>「${eventName}」</strong>！我們已成功收到你的登記。</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;width:35%;">姓名</td><td style="padding:8px;">${name}</td></tr>
              <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;">活動</td><td style="padding:8px;">${eventName}</td></tr>
              <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;">居住地區</td><td style="padding:8px;">${postcode || '未填寫'}</td></tr>
            </table>
            <p>我們將在活動前以電郵或電話通知你詳情及時間安排。</p>
            <p>如有任何疑問，請隨時聯絡我們：</p>
            <p>📧 <a href="mailto:${NOTIFY}" style="color:#c0392b;">${NOTIFY}</a></p>
            <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;">
            <p style="color:#888;font-size:0.85rem;text-align:center;">Salford Hongkongers CIC · 沙福香港人社區互助中心<br>salfordhongkongers.co.uk</p>
          </div>
        </div>`;
      MailApp.sendEmail({ to: email, subject: `活動登記確認 — ${eventName} | Salford Hongkongers`, htmlBody });
    } catch(e) {}
  }

  return { success: true, message: '登記成功！確認電郵已發送至 ' + email };
}

// ── Enquiry / Feedback ────────────────────────────────────
function handleEnquiry(p) {
  const name     = (p.name     || '匿名').trim();
  const email    = (p.email    || '').trim();
  const phone    = (p.phone    || '').trim();
  const category = (p.category || '').trim();
  const subject  = (p.subject  || '').trim();
  const message  = (p.message  || '').trim();

  if (!message) return { success: false, error: '請填寫訊息內容' };

  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(ENQ);
  if (!sheet) {
    sheet = ss.insertSheet(ENQ);
    sheet.appendRow(['時間戳記','姓名','電郵','電話','類別','主題','訊息']);
    formatHeader(sheet);
  }
  sheet.appendRow([new Date(), name, email, phone, category, subject, message]);

  // Forward each case to hkerssalford@gmail.com
  try {
    const subjectLine = `新查詢 — [${category || '未分類'}] ${name}`;
    const body =
      `姓名: ${name}\n` +
      `電郵: ${email || '未填寫'}\n` +
      `電話: ${phone || '未填寫'}\n` +
      `類別: ${category}\n` +
      `主題: ${subject}\n` +
      `訊息:\n${message}\n\n` +
      `提交時間: ${new Date()}`;
    MailApp.sendEmail(NOTIFY, subjectLine, body);
  } catch(e) {}

  return { success: true, message: '訊息已送出，我們將盡快回覆你。' };
}

// ── Helper ────────────────────────────────────────────────
function formatHeader(sheet) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  h.setBackground('#c0392b');
  h.setFontColor('#ffffff');
  h.setFontWeight('bold');
}

function pad(n) { return n < 10 ? '0'+n : ''+n; }
