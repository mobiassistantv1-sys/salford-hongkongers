// ===================================================================
// Salford Hongkongers - Volunteer Check-in Backend
// Google Apps Script (Code.gs)
// ===================================================================
// Sheets structure:
//   Sheet1 "Checkin"   : Timestamp | Name | Date | Time | Type (in/out)
//   Sheet2 "Volunteer" : Timestamp | Name | Email | Phone | District | Interests | Availability
// ===================================================================

var SS = SpreadsheetApp.getActiveSpreadsheet();
var CHECKIN_SHEET   = "Checkin";
var VOLUNTEER_SHEET = "Volunteer";
var ENQUIRY_SHEET   = "Enquiry";

// ━━ Entry point ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

// ━━ 1. Record Clock In / Clock Out ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

// ━━ 2. Monthly Leaderboard (top 3 by total hours) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    var dateStr = String(row[2]).trim(); // e.g. "2026-03-15"
    if (!dateStr.startsWith(targetMonth)) return;

    var name = String(row[1]).trim();
    var time = String(row[3]).trim();
    var type = String(row[4]).trim().toLowerCase();

    if (!records[name]) records[name] = { ins: [], outs: [] };
    if (type === "in") records[name].ins.push(time);
    if (type === "out") records[name].outs.push(time);
  });

  // Compute total hours per person
  var totals = []; // [{ name, hours }]
  for (var name in records) {
    var ins  = records[name].ins.sort();
    var outs = records[name].outs.sort();
    var totalMinutes = 0;

    for (var i = 0; i < Math.min(ins.length, outs.length); i++) {
      var inTime = parseTime(ins[i]);
      var outTime = parseTime(outs[i]);
      if (inTime && outTime) {
        totalMinutes += (outTime - inTime);
      }
    }

    var hours = Math.round((totalMinutes / 60) * 10) / 10;
    totals.push({ name: name, hours: hours });
  }

  // Sort descending, take top 3
  totals.sort(function(a, b) { return b.hours - a.hours; });
  var top3 = totals.slice(0, 3);

  return { ok: true, month: targetMonth, top3: top3 };
}

// ━━ 3. New Volunteer Registration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function handleVolunteer(p) {
  var name         = (p.name || "").trim();
  var email        = (p.email || "").trim();
  var phone        = (p.phone || "").trim();
  var district     = (p.district || "").trim();
  var interests    = (p.interests || "").trim();
  var availability = (p.availability || "").trim();

  if (!name || !email) {
    return { ok: false, error: "Name and Email are required" };
  }

  var sheet = getOrCreateSheet(VOLUNTEER_SHEET, [
    "Timestamp","Name","Email","Phone","District","Interests","Availability"
  ]);
  sheet.appendRow([new Date().toISOString(), name, email, phone, district, interests, availability]);

  return { ok: true, message: "Volunteer " + name + " registered successfully" };
}

// ━━ 4. General Enquiry / Contact Form ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function handleEnquiry(p) {
  var name     = (p.name     || "").trim();
  var email    = (p.email    || "").trim();
  var phone    = (p.phone    || "").trim();
  var category = (p.category || "").trim();
  var subject  = (p.subject  || "").trim();
  var message  = (p.message  || "").trim();

  if (!name || !email || !message) {
    return { ok: false, error: "Name, Email, and Message are required" };
  }

  var sheet = getOrCreateSheet(ENQUIRY_SHEET, [
    "Timestamp","Name","Email","Phone","Category","Subject","Message"
  ]);
  sheet.appendRow([new Date().toISOString(), name, email, phone, category, subject, message]);

  sendEnquiryNotification(name, email, phone, category, subject, message);

  return { ok: true, message: "Your enquiry has been received. We'll get back to you soon!" };
}

// ━━ Email Notification (HTML) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendEnquiryNotification(name, email, phone, category, subject, message) {
  var recipient    = "hkerssalford@gmail.com";
  var emailSubject = "[SHK 查詢] " + (subject || category || "新查詢 New Enquiry");

  var htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">' +
      '<div style="background:#c0392b;padding:20px 24px;">' +
        '<h2 style="color:#fff;margin:0;font-size:20px;">Salford Hongkongers &#8212; 新查詢 New Enquiry</h2>' +
      '</div>' +
      '<div style="padding:24px;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:15px;">' +
          '<tr style="border-bottom:1px solid #f0f0f0;">' +
            '<td style="padding:10px 0;color:#888;width:130px;">姓名 Name</td>' +
            '<td style="padding:10px 0;font-weight:bold;">' + name + '</td>' +
          '</tr>' +
          '<tr style="border-bottom:1px solid #f0f0f0;">' +
            '<td style="padding:10px 0;color:#888;">電郵 Email</td>' +
            '<td style="padding:10px 0;"><a href="mailto:' + email + '" style="color:#c0392b;">' + email + '</a></td>' +
          '</tr>' +
          '<tr style="border-bottom:1px solid #f0f0f0;">' +
            '<td style="padding:10px 0;color:#888;">電話 Phone</td>' +
            '<td style="padding:10px 0;">' + (phone || '&#8212;') + '</td>' +
          '</tr>' +
          '<tr style="border-bottom:1px solid #f0f0f0;">' +
            '<td style="padding:10px 0;color:#888;">類別 Category</td>' +
            '<td style="padding:10px 0;">' + (category || '&#8212;') + '</td>' +
          '</tr>' +
          '<tr style="border-bottom:1px solid #f0f0f0;">' +
            '<td style="padding:10px 0;color:#888;">主題 Subject</td>' +
            '<td style="padding:10px 0;">' + (subject || '&#8212;') + '</td>' +
          '</tr>' +
        '</table>' +
        '<div style="margin-top:20px;">' +
          '<p style="color:#888;margin:0 0 8px;font-size:14px;">訊息 Message</p>' +
          '<div style="background:#f9f9f9;border-left:4px solid #c0392b;padding:14px 16px;border-radius:4px;font-size:15px;line-height:1.6;white-space:pre-wrap;">' + message + '</div>' +
        '</div>' +
        '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#aaa;">' +
          'Received via salfordhongkongers.co.uk &bull; ' + new Date().toUTCString() +
        '</div>' +
      '</div>' +
    '</div>';

  var plainBody =
    "New enquiry from salfordhongkongers.co.uk\n\n" +
    "Name:     " + name     + "\n" +
    "Email:    " + email    + "\n" +
    "Phone:    " + (phone    || "—") + "\n" +
    "Category: " + (category || "—") + "\n" +
    "Subject:  " + (subject  || "—") + "\n\n" +
    "Message:\n" + message;

  try {
    MailApp.sendEmail({
      to:       recipient,
      subject:  emailSubject,
      body:     plainBody,
      htmlBody: htmlBody,
      replyTo:  email
    });
  } catch (e) {
    Logger.log("Failed to send email: " + e.message);
  }
}

// ━━ Helper: Get or create a sheet with headers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getOrCreateSheet(sheetName, headers) {
  var sheet = SS.getSheetByName(sheetName);
  if (!sheet) {
    sheet = SS.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

// ━━ Helper: Parse "HH:MM" -> minutes since midnight ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function parseTime(timeStr) {
  var parts = timeStr.split(":");
  if (parts.length !== 2) return null;
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// ━━ Helper: Pad single-digit numbers with leading zero ━━━━━━━━━━━━━━━━━━━━━━━━━
function pad(num) {
  return num < 10 ? "0" + num : "" + num;
}
