// ===============================================================
// Salford Hongkongers — Google Apps Script Backend (Code.gs)
// ===============================================================
// Sheets:
//    "Registration" : Timestamp | Event | Name | Email | Phone | Attendees | IsNewArrival | Notes
//    "Checkin"      : Timestamp | Name | Date | Time | Type
//    "Volunteer"    : Timestamp | Name | Email | Phone | District | Interests | Availability
//    "Enquiry"      : Timestamp | Name | Email | Phone | Category | Subject | Message
//
// Actions (doGet ?action=):
//   register    — Event registration form
//   checkin     — Volunteer clock in / out
//   leaderboard — Top 3 volunteers by hours this month
//   volunteer   — Join volunteer team form
//   enquiry     — General enquiry / contact form
//
// All notifications → hkerssalford@gmail.com
// ===============================================================

var REGISTRATION_SHEET = "Registration";
var CHECKIN_SHEET      = "Checkin";
var VOLUNTEER_SHEET    = "Volunteer";
var ENQUIRY_SHEET      = "Enquiry";
var NOTIFY_EMAIL       = "hkerssalford@gmail.com";

// ── Get (or auto-create) the backing Spreadsheet ────────────────────────────────────────────────────────
// Standalone Web Apps cannot use getActiveSpreadsheet().
// We store the Spreadsheet ID in Script Properties after first creation.
function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id    = props.getProperty("SPREADSHEET_ID");

  // Fallback to known ID if property missing
  if (!id) {
    id = "12F_XnrzRgXe0bCWuK2XloMnkALIxsUJdHm-17kSqdeE";
    props.setProperty("SPREADSHEET_ID", id);
  }

  return SpreadsheetApp.openById(id);
}

// ── Shared style constants ─────────────────────────────────────────────────────────────────────────────
var RED       = "#c0392b";
var LIGHT_RED = "#fdceea";

// ── Entry point ────────────────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  var action = e.parameter.action || "";
  var result;

  try {
    if      (action === "register")    result = handleRegister(e.parameter);
    else if (action === "checkin")     result = handleCheckin(e.parameter);
    else if (action === "leaderboard") result = handleLeaderboard(e.parameter);
    else if (action === "volunteer")   result = handleVolunteer(e.parameter);
    else if (action === "enquiry")     result = handleEnquiry(e.parameter);
    else result = { ok: false, error: "Unknown action: " + action };
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 1) EVENT REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
function handleRegister(params) {
  var event     = params.event     || "";
  var name      = params.name      || "";
  var email     = params.email     || "";
  var phone     = params.phone     || "";
  var attendees = params.attendees || "1";
  var isNew     = params.isNew     || "no";
  var notes     = params.notes     || "";

  if (!event || !name) {
    return { ok: false, error: "Missing event or name" };
  }

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(REGISTRATION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRATION_SHEET);
    sheet.appendRow(["Timestamp","Event","Name","Email","Phone","Attendees","IsNewArrival","Notes"]);
    formatHeader(sheet);
  }

  var timestamp = new Date();
  sheet.appendRow([timestamp, event, name, email, phone, attendees, isNew, notes]);

  // Send notification email
  try {
    var subject = "新活動登記 — " + event;
    var body = 
      "活動: " + event + "\n" +
      "姓名: " + name + "\n" +
      "電郵: " + email + "\n" +
      "電話: " + phone + "\n" +
      "人數: " + attendees + "\n" +
      "新到港: " + isNew + "\n" +
      "備註: " + notes + "\n\n" +
      "時間: " + timestamp;
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch (mailErr) {
    Logger.log("Email send failed: " + mailErr.message);
  }

  return { ok: true, message: "登記成功" };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 2) VOLUNTEER CHECK-IN / CHECK-OUT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
function handleCheckin(params) {
  var name = params.name || "";
  var type = params.type || "in"; // "in" or "out"

  if (!name) {
    return { ok: false, error: "Missing name" };
  }

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(CHECKIN_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CHECKIN_SHEET);
    sheet.appendRow(["Timestamp","Name","Date","Time","Type"]);
    formatHeader(sheet);
  }

  var now       = new Date();
  var dateStr   = Utilities.formatDate(now, "Europe/London", "yyyy-MM-dd");
  var timeStr   = Utilities.formatDate(now, "Europe/London", "HH:mm:ss");
  
  sheet.appendRow([now, name, dateStr, timeStr, type]);

  var action = (type === "in") ? "簽到" : "簽退";
  return { ok: true, message: action + "成功", time: timeStr };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 3) LEADERBOARD — Top volunteers by hours this month
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
function handleLeaderboard(params) {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(CHECKIN_SHEET);
  
  if (!sheet) {
    return { ok: true, leaderboard: [], month: "" };
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { ok: true, leaderboard: [], month: "" };
  }

  // Get current month bounds using Europe/London timezone
  var now        = new Date();
  var yearStr    = Utilities.formatDate(now, "Europe/London", "yyyy");
  var monthStr   = Utilities.formatDate(now, "Europe/London", "MM");
  var year       = parseInt(yearStr);
  var month      = parseInt(monthStr) - 1; // 0-indexed
  // Build start/end in UTC to match stored timestamps
  var monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  var monthEnd   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));

  // Parse check-in/out pairs
  var volunteers = {}; // name → { clockIns: [...], clockOuts: [...] }

  for (var i = 1; i < data.length; i++) {
    var row       = data[i];
    var timestamp = row[0];
    var vName     = row[1];
    var vType     = row[4]; // "in" or "out"

    if (!vName || !timestamp) continue;
    
    var d = new Date(timestamp);
    if (d < monthStart || d > monthEnd) continue;

    if (!volunteers[vName]) {
      volunteers[vName] = { clockIns: [], clockOuts: [] };
    }

    if (vType === "in") {
      volunteers[vName].clockIns.push(d);
    } else if (vType === "out") {
      volunteers[vName].clockOuts.push(d);
    }
  }

  // Calculate hours for each volunteer
  var results = [];
  for (var name in volunteers) {
    var v = volunteers[name];
    var totalHours = calculateHours(v.clockIns, v.clockOuts);
    if (totalHours > 0) {
      results.push({ name: name, hours: totalHours });
    }
  }

  // Sort descending by hours, take top 3
  results.sort(function(a, b) { return b.hours - a.hours; });
  var top3 = results.slice(0, 3);

  var monthName = Utilities.formatDate(now, "Europe/London", "yyyy年MM月");

  return { ok: true, leaderboard: top3, month: monthName };
}

/**
 * Calculate total hours from arrays of clock-in and clock-out times.
 * Pairs each clock-in with the next clock-out.
 */
function calculateHours(clockIns, clockOuts) {
  // Sort both arrays
  clockIns.sort(function(a, b) { return a - b; });
  clockOuts.sort(function(a, b) { return a - b; });

  var totalMs = 0;
  var inIdx = 0;
  var outIdx = 0;

  while (inIdx < clockIns.length && outIdx < clockOuts.length) {
    var inTime = clockIns[inIdx];
    var outTime = clockOuts[outIdx];

    if (inTime < outTime) {
      // Valid pair
      totalMs += (outTime - inTime);
      inIdx++;
      outIdx++;
    } else {
      // Out before In, skip this out
      outIdx++;
    }
  }

  var hours = totalMs / (1000 * 60 * 60);
  return Math.round(hours * 10) / 10; // 1 decimal place
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 4) VOLUNTEER JOIN FORM
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
function handleVolunteer(params) {
  var name         = params.name         || "";
  var email        = params.email        || "";
  var phone        = params.phone        || "";
  var district     = params.district     || "";
  var interests    = params.interests    || "";
  var availability = params.availability || "";

  if (!name || !email) {
    return { ok: false, error: "Missing name or email" };
  }

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(VOLUNTEER_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(VOLUNTEER_SHEET);
    sheet.appendRow(["Timestamp","Name","Email","Phone","District","Interests","Availability"]);
    formatHeader(sheet);
  }

  var timestamp = new Date();
  sheet.appendRow([timestamp, name, email, phone, district, interests, availability]);

  // Send notification email
  try {
    var subject = "新義工登記 — " + name;
    var body = 
      "姓名: " + name + "\n" +
      "電郵: " + email + "\n" +
      "電話: " + phone + "\n" +
      "地區: " + district + "\n" +
      "興趣: " + interests + "\n" +
      "可用時間: " + availability + "\n\n" +
      "時間: " + timestamp;
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch (mailErr) {
    Logger.log("Email send failed: " + mailErr.message);
  }

  return { ok: true, message: "登記成功" };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// 5) ENQUIRY / CONTACT FORM
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
function handleEnquiry(params) {
  var name     = params.name     || "";
  var email    = params.email    || "";
  var phone    = params.phone    || "";
  var category = params.category || "";
  var subject  = params.subject  || "";
  var message  = params.message  || "";

  if (!name || !email || !message) {
    return { ok: false, error: "Missing required fields" };
  }

  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(ENQUIRY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ENQUIRY_SHEET);
    sheet.appendRow(["Timestamp","Name","Email","Phone","Category","Subject","Message"]);
    formatHeader(sheet);
  }

  var timestamp = new Date();
  sheet.appendRow([timestamp, name, email, phone, category, subject, message]);

  // Send notification email
  try {
    var emailSubject = "新查詢 — " + category + " — " + name;
    var body = 
      "姓名: " + name + "\n" +
      "電郵: " + email + "\n" +
      "電話: " + phone + "\n" +
      "類別: " + category + "\n" +
      "主旨: " + subject + "\n" +
      "訊息: " + message + "\n\n" +
      "時間: " + timestamp;
    MailApp.sendEmail(NOTIFY_EMAIL, emailSubject, body);
  } catch (mailErr) {
    Logger.log("Email send failed: " + mailErr.message);
  }

  return { ok: true, message: "訊息已送出" };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// HELPER: Format header row
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
function formatHeader(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setBackground(RED);
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
}