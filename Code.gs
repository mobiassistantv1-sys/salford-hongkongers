// ============================================================
// Salford Hongkongers - Volunteer Check-in Backend
// Google Apps Script (Code.gs)
// ============================================================
// Sheets structure:
//   Sheet1 "Checkin"   : Timestamp | Name | Date | Time | Type (in/out)
//   Sheet2 "Volunteer" : Timestamp | Name | Email | Phone | District | Interests | Availability
// ============================================================

var SS = SpreadsheetApp.getActiveSpreadsheet();
var CHECKIN_SHEET   = "Checkin";
var VOLUNTEER_SHEET = "Volunteer";
var ENQUIRY_SHEET   = "Enquiry";

// ── Entry point ─────────────────────────────────────────────
function doGet(e) {
  var action = e.parameter.action || "";
  var result;

  try {
    if (action === "checkin") {
      result = handleCheckin(e.parameter);
    } else if (action === "leaderboard") {
      result = handleLeaderboard(e.parameter);
    } else if (action === "volunteer") {
      result = handleVolunteer(e.parameter);
    } else if (action === "enquiry") {
      result = handleEnquiry(e.parameter);
    } else {
      result = { ok: false, error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 1. Record Clock In / Clock Out ──────────────────────────
function handleCheckin(p) {
  var name = (p.name || "").trim();
  var type = (p.type || "").trim();   // "in" or "out"
  var date = (p.date || "").trim();   // YYYY-MM-DD
  var time = (p.time || "").trim();   // HH:MM

  if (!name || !type || !date || !time) {
    return { ok: false, error: "Missing required fields" };
  }

  var sheet = getOrCreateSheet(CHECKIN_SHEET, ["Timestamp","Name","Date","Time","Type"]);
  sheet.appendRow([new Date().toISOString(), name, date, time, type]);

  return { ok: true, message: name + " clocked " + type + " at " + time };
}

// ── 2. Monthly Leaderboard (top 3 by total hours) ───────────
function handleLeaderboard(p) {
  // month param: "YYYY-MM", defaults to current month
  var monthParam = (p.month || "").trim();
  var now = new Date();
  var targetMonth = monthParam ||
    (now.getFullYear() + "-" + pad(now.getMonth() + 1));

  var sheet = SS.getSheetByName(CHECKIN_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { ok: true, month: targetMonth, top3: [] };
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  // columns: [Timestamp, Name, Date, Time, Type]

  // Group clock-in/out pairs per person for the target month
  var records = {}; // name -> { ins: [timeStr], outs: [timeStr] }

  data.forEach(function(row) {
    var date = String(row[2]).trim();       // YYYY-MM-DD
    var time = String(row[3]).trim();       // HH:MM
    var type = String(row[4]).trim();       // in / out
    var name = String(row[1]).trim();

    if (!date.startsWith(targetMonth)) return;
    if (!name) return;

    if (!records[name]) records[name] = { pairs: [], lastIn: null };

    if (type === "in") {
      records[name].lastIn = date + "T" + time;
    } else if (type === "out" && records[name].lastIn) {
      var inDt  = new Date(records[name].lastIn);
      var outDt = new Date(date + "T" + time);
      var hours = (outDt - inDt) / 3600000; // ms → hours
      if (hours > 0 && hours < 24) {        // sanity check
        records[name].pairs.push(hours);
      }
      records[name].lastIn = null;
    }
  });

  // Sum hours per person
  var totals = Object.keys(records).map(function(name) {
    var total = records[name].pairs.reduce(function(a, b) { return a + b; }, 0);
    return { name: name, hours: Math.round(total * 10) / 10 };
  });

  // Sort descending, take top 3
  totals.sort(function(a, b) { return b.hours - a.hours; });
  var top3 = totals.slice(0, 3);

  return { ok: true, month: targetMonth, top3: top3 };
}

// ── 3. Volunteer Registration ────────────────────────────────
function handleVolunteer(p) {
  var name         = (p.name         || "").trim();
  var email        = (p.email        || "").trim();
  var phone        = (p.phone        || "").trim();
  var district     = (p.district     || "").trim();
  var interests    = (p.interests    || "").trim();
  var availability = (p.availability || "").trim();

  if (!name || !email) {
    return { ok: false, error: "Name and email are required" };
  }

  var sheet = getOrCreateSheet(VOLUNTEER_SHEET,
    ["Timestamp","Name","Email","Phone","District","Interests","Availability"]);
  sheet.appendRow([
    new Date().toISOString(),
    name, email, phone, district, interests, availability
  ]);

  return { ok: true, message: "Thank you " + name + "! Your application has been received." };
}

// ── 4. Enquiry Form ──────────────────────────────────────────
function handleEnquiry(p) {
  var name     = (p.name     || "").trim();
  var phone    = (p.phone    || "").trim();
  var email    = (p.email    || "").trim();
  var category = (p.category || "").trim();
  var subject  = (p.subject  || "").trim();
  var message  = (p.message  || "").trim();

  if (!name || !email || !message) {
    return { ok: false, error: "Name, email and message are required" };
  }

  var sheet = getOrCreateSheet(ENQUIRY_SHEET,
    ["Timestamp","Name","Phone","Email","Category","Subject","Message"]);
  sheet.appendRow([
    new Date().toISOString(),
    name, phone, email, category, subject, message
  ]);

  // Optional: send notification email
  try {
    MailApp.sendEmail({
      to: "salfordhongkongers@gmail.com",
      subject: "[查詢] " + (category || "一般查詢") + " - " + (subject || name),
      body: "新查詢收到：\n\n姓名：" + name + "\n電話：" + phone +
            "\n電郵：" + email + "\n類別：" + category +
            "\n主題：" + subject + "\n\n內容：\n" + message +
            "\n\n─────────────\n時間：" + new Date().toLocaleString("zh-HK")
    });
  } catch(mailErr) {
    // Non-fatal: still save the record even if email fails
  }

  return { ok: true, message: "Thank you " + name + "! We will get back to you soon." };
}

// ── Helpers ──────────────────────────────────────────────────
function getOrCreateSheet(name, headers) {
  var sheet = SS.getSheetByName(name);
  if (!sheet) {
    sheet = SS.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
