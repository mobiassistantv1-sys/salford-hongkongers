// ============================================================
// Salford Hongkongers — Unified Volunteer Apps Script v2
// Handles: (1) Volunteer Registration → 義工資料 Sheet
//          (2) Punch In/Out → 2026 Sheet
//          (3) Volunteer lookup / verify
//
// Deploy: Extensions > Apps Script > Deploy > New Deployment
//   Type: Web App | Execute as: Me | Who has access: Anyone
// Copy the Web App URL into BOTH HTML files where indicated.
// ============================================================

const SPREADSHEET_ID  = '1FtfXxl8qktmF-FNUy_ItOVED0nwBM5DdohrwHXimtkM';
const VOLUNTEER_SHEET = '義工資料'; // A=編號 B=義工登記名字 C=First Name D=Surname E=Nickname/關係圖 F=WhatsApp登記號碼
const LOG_SHEET       = '2026';     // A=Month B=Date C=Day D=Time E=Hours F=Activities G=參與人數 H=Category I=Manpower J=Names
const HOURS_SHEET     = '時數';     // A=Name B=Attendance C=Total No. of Hours

// ============================================================
// OUTPUT HELPER
// ============================================================
function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GET HANDLER
// ============================================================
function doGet(e) {
  const action = (e.parameter.action || '').trim();
  let result;
  try {
    switch (action) {
      case 'getVolunteers':  result = getVolunteers(); break;
      case 'verify':         result = verifyVolunteer(e.parameter.name, e.parameter.phone); break;
      case 'getPunchStatus': result = getPunchStatus(e.parameter.name, e.parameter.date); break;
      case 'ping':           result = { ok: true, time: new Date().toISOString() }; break;
      default:               result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.toString() };
  }
  return jsonOut(result);
}

// ============================================================
// POST HANDLER
// ============================================================
function doPost(e) {
  let result;
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = (payload.action || '').trim();
    switch (action) {
      case 'register': result = registerVolunteer(payload); break;
      case 'punchIn':  result = punchIn(payload);  break;
      case 'punchOut': result = punchOut(payload); break;
      default:         result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.toString() };
  }
  return jsonOut(result);
}

// ============================================================
// 1. REGISTER VOLUNTEER → 義工資料 Sheet
//    Payload fields: name, firstName, surname, nickname, whatsapp
// ============================================================
function registerVolunteer(payload) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(VOLUNTEER_SHEET);
  if (!sheet) throw new Error('Sheet not found: ' + VOLUNTEER_SHEET);

  const name      = (payload.name      || '').trim();
  const firstName = (payload.firstName || '').trim();
  const surname   = (payload.surname   || '').trim();
  const nickname  = (payload.nickname  || name).trim();
  const whatsapp  = (payload.whatsapp  || payload.phone || '').trim();

  if (!name) return { success: false, error: '姓名不能為空' };

  // Duplicate check: same name + same whatsapp
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const existingName = (data[i][1] || '').toString().trim();
    const existingWA   = (data[i][5] || '').toString().trim();
    if (existingName === name && existingWA === whatsapp) {
      return { success: false, duplicate: true, message: '此義工已登記' };
    }
  }

  // Auto-increment 編號
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const id = parseInt(data[i][0]);
    if (!isNaN(id) && id > maxId) maxId = id;
  }
  const newId = maxId + 1;

  // Append: 編號 | 義工登記名字 | First Name | Surname | Nickname/關係圖 | WhatsApp登記號碼
  sheet.appendRow([newId, name, firstName, surname, nickname, whatsapp]);

  return { success: true, id: newId, name: name, message: '登記成功！歡迎加入 Salford Hongkongers 義工團隊！' };
}

// ============================================================
// 2. GET VOLUNTEERS — array for autocomplete
// ============================================================
function getVolunteers() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(VOLUNTEER_SHEET);
  if (!sheet) return { volunteers: [] };

  const data = sheet.getDataRange().getValues();
  const volunteers = [];
  for (let i = 1; i < data.length; i++) {
    const name = (data[i][1] || '').toString().trim();
    const wa   = (data[i][5] || '').toString().trim();
    if (name) volunteers.push({ name: name, whatsapp: wa });
  }
  return { volunteers: volunteers };
}

// ============================================================
// 3. VERIFY VOLUNTEER — match name + last 4 digits of WhatsApp
// ============================================================
function verifyVolunteer(name, phone) {
  name  = (name  || '').trim();
  phone = (phone || '').trim();
  if (!name || !phone) return { verified: false, message: '請輸入姓名及電話尾4位' };

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(VOLUNTEER_SHEET);
  if (!sheet) return { verified: false, message: 'Sheet 未找到' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const sheetName = (data[i][1] || '').toString().trim();
    const sheetWA   = (data[i][5] || '').toString().replace(/\s+/g, '');
    const last4     = sheetWA.slice(-4);
    if (sheetName === name && last4 === phone) {
      return { verified: true, name: sheetName, message: '核對成功' };
    }
  }
  return { verified: false, message: '姓名或電話尾4位不符，請重試' };
}

// ============================================================
// 4. GET PUNCH STATUS — check if already punched in today
//    Returns: { status: 'none' | 'in' | 'out', ... }
// ============================================================
function getPunchStatus(name, date) {
  name = (name || '').trim();
  date = (date || '').trim(); // 'YYYY-MM-DD'
  if (!name || !date) return { status: 'none' };

  const d     = new Date(date);
  const month = d.getMonth() + 1;
  const day   = d.getDate();

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) return { status: 'none' };

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const row      = data[i];
    const rowMonth = parseInt(row[0]);
    const rowDay   = parseInt(row[1]);
    const rowAct   = (row[5] || '').toString();
    const rowNames = (row[9] || '').toString();
    const timeStr  = (row[3] || '').toString().trim();

    if (rowMonth === month && rowDay === day &&
        rowNames.includes(name) && rowAct.startsWith('打卡')) {
      // Time range (e.g. '0900-1700') means punched out; single time = still in
      if (timeStr.includes('-') && timeStr.length >= 9) {
        return { status: 'out', timeStr: timeStr };
      } else {
        return { status: 'in', punchInTime: timeStr, rowIndex: i + 1 };
      }
    }
  }
  return { status: 'none' };
}

// ============================================================
// 5. PUNCH IN — append row to 2026 Sheet
//    Row: Month|Date|Day|Time|Hours|Activities|參與人數|Category|Manpower|Names
// ============================================================
function punchIn(payload) {
  const name = (payload.name || '').trim();
  if (!name) return { success: false, error: '姓名不能為空' };

  const now   = new Date();
  const month = now.getMonth() + 1;
  const date  = now.getDate();
  const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const day   = days[now.getDay()];
  const hhmm  = pad2(now.getHours()) + pad2(now.getMinutes());

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) throw new Error('Sheet not found: ' + LOG_SHEET);

  // Prevent double punch-in
  const status = getPunchStatus(name, now.toISOString().slice(0, 10));
  if (status.status === 'in') {
    return { success: false, alreadyIn: true, message: '你今日已打咗入，請先打出' };
  }

  // Append row — Hours blank until punch-out
  sheet.appendRow([
    month,              // A: Month
    date,               // B: Date
    day,                // C: Day
    hhmm,               // D: Time (punch-in; updated to range on punch-out)
    '',                 // E: Hours (filled on punch-out)
    '打卡 — ' + name,   // F: Activities
    '',                 // G: 參與人數
    '義工打卡',          // H: Category
    1,                  // I: Manpower
    name                // J: Names
  ]);

  return { success: true, punchInTime: hhmm, message: name + ' 打卡入成功！' };
}

// ============================================================
// 6. PUNCH OUT — update today's punch-in row with time range + hours
// ============================================================
function punchOut(payload) {
  const name = (payload.name || '').trim();
  if (!name) return { success: false, error: '姓名不能為空' };

  const now   = new Date();
  const month = now.getMonth() + 1;
  const date  = now.getDate();
  const hhmm  = pad2(now.getHours()) + pad2(now.getMinutes());

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) throw new Error('Sheet not found: ' + LOG_SHEET);

  const data = sheet.getDataRange().getValues();
  // Scan bottom-up: find most recent punch-in row without punch-out
  for (let i = data.length - 1; i >= 1; i--) {
    const row      = data[i];
    const rowMonth = parseInt(row[0]);
    const rowDay   = parseInt(row[1]);
    const rowAct   = (row[5] || '').toString();
    const rowNames = (row[9] || '').toString();
    const timeStr  = (row[3] || '').toString().trim();

    // Match: same month/day, name in Names column, activity starts with 打卡, time is single value (not range)
    if (rowMonth === month && rowDay === date &&
        rowNames.includes(name) && rowAct.startsWith('打卡') &&
        timeStr.length === 4 && !timeStr.includes('-')) {

      const punchInTime = timeStr;
      const timeRange   = punchInTime + '-' + hhmm;
      const hours       = calcHours(punchInTime, hhmm);

      // Update row: col D (Time) and col E (Hours)
      const rowNum = i + 1;
      sheet.getRange(rowNum, 4).setValue(timeRange); // D: Time
      sheet.getRange(rowNum, 5).setValue(hours);     // E: Hours

      return {
        success: true,
        punchInTime: punchInTime,
        punchOutTime: hhmm,
        hours: hours,
        message: name + ' 打卡出成功！工作時數：' + hours + ' 小時'
      };
    }
  }

  // Not found = not punched in today
  return { success: false, notIn: true, message: '未找到今日打卡入記錄，請先打卡入' };
}

// ============================================================
// UTILITY: Pad 2 digits
// ============================================================
function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// ============================================================
// UTILITY: Calculate hours between HHmm strings
// ============================================================
function calcHours(startHHmm, endHHmm) {
  const startH = parseInt(startHHmm.slice(0,2));
  const startM = parseInt(startHHmm.slice(2,4));
  const endH   = parseInt(endHHmm.slice(0,2));
  const endM   = parseInt(endHHmm.slice(2,4));

  const startMin = startH * 60 + startM;
  const endMin   = endH * 60 + endM;
  const diffMin  = endMin - startMin;

  if (diffMin <= 0) return 0;
  return Math.round((diffMin / 60) * 10) / 10; // 1 decimal place
}