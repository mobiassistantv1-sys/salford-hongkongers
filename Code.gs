// ===================================================================
// Salford Hongkongers — Google Apps Script Backend (Code.gs)
// ===================================================================
// Sheets:
//   "Registration" : Timestamp | Event | Name | Email | Phone | Attendees | IsNewArrival | Notes
//   "Checkin"      : Timestamp | Name | Date | Time | Type
//   "Volunteer"    : Timestamp | Name | Email | Phone | District | Interests | Availability
//   "Enquiry"      : Timestamp | Name | Email | Phone | Category | Subject | Message
//
// Actions (doGet ?action=):
//   register    — Event registration form
//   checkin     — Volunteer clock in / out
//   leaderboard — Top 3 volunteers by hours this month
//   volunteer   — Join volunteer team form
//   enquiry     — General enquiry / contact form
//
// All notifications → hkerssalford@gmail.com
// ===================================================================

var SS               = SpreadsheetApp.getActiveSpreadsheet();
var REGISTRATION_SHEET = "Registration";
var CHECKIN_SHEET      = "Checkin";
var VOLUNTEER_SHEET    = "Volunteer";
var ENQUIRY_SHEET      = "Enquiry";
var NOTIFY_EMAIL       = "hkerssalford@gmail.com";

// ━━ Shared style constants ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var RED       = "#c0392b";
var LIGHT_RED = "#fdecea";

// ━━ Entry point ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. EVENT REGISTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function handleRegister(p) {
  var event       = (p.event       || "").trim();
  var name        = (p.name        || "").trim();
  var email       = (p.email       || "").trim();
  var phone       = (p.phone       || "").trim();
  var attendees   = (p.attendees   || "1").trim();
  var isNewArrival= (p.isNewArrival|| "").trim();
  var notes       = (p.notes       || "").trim();

  if (!event || !name || !email) {
    return { ok: false, error: "Event, Name and Email are required" };
  }

  var sheet = getOrCreateSheet(REGISTRATION_SHEET, [
    "Timestamp","Event","Name","Email","Phone","Attendees","IsNewArrival","Notes"
  ]);
  sheet.appendRow([
    new Date().toISOString(), event, name, email, phone, attendees, isNewArrival, notes
  ]);

  sendRegistrationNotification(event, name, email, phone, attendees, isNewArrival, notes);

  return { ok: true, message: "Registration received for " + name + ". See you at " + event + "!" };
}

function sendRegistrationNotification(event, name, email, phone, attendees, isNewArrival, notes) {
  var subject = "[SHK 活動登記] " + event + " — " + name;

  var rows = [
    ["活動 Event",          event],
    ["姓名 Name",           name],
    ["電郵 Email",          '<a href="mailto:' + email + '" style="color:' + RED + ';">' + email + '</a>'],
    ["電話 Phone",          phone       || "—"],
    ["參加人數 Attendees",  attendees   || "1"],
    ["新移民 New Arrival",  isNewArrival === "yes" ? "是 Yes" : "否 No"],
    ["備注 Notes",          notes       || "—"]
  ];

  var html = buildHtmlEmail(
    "活動登記通知 Event Registration",
    rows,
    null  // no message block
  );

  var plain =
    "New event registration from salfordhongkongers.co.uk\n\n" +
    "Event:       " + event       + "\n" +
    "Name:        " + name        + "\n" +
    "Email:       " + email       + "\n" +
    "Phone:       " + (phone      || "—") + "\n" +
    "Attendees:   " + (attendees  || "1") + "\n" +
    "New Arrival: " + (isNewArrival === "yes" ? "Yes" : "No") + "\n" +
    "Notes:       " + (notes      || "—");

  sendMail(NOTIFY_EMAIL, subject, plain, html, email);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. VOLUNTEER CHECK-IN / CHECK-OUT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function handleCheckin(p) {
  var name = (p.name || "").trim();
  var type = (p.type || "").trim();   // "in" or "out"
  var date = (p.date || "").trim();   // YYYY-MM-DD
  var time = (p.time || "").trim();   // HH:MM

  if (!name || !type || !date || !time) {
    return { ok: false, error: "Missing required fields (name, type, date, time)" };
  }

  var sheet = getOrCreateSheet(CHECKIN_SHEET, ["Timestamp","Name","Date","Time","Type"]);
  sheet.appendRow([new Date().toISOString(), name, date, time, type]);

  return { ok: true, message: name + " clocked " + type + " at " + time + " on " + date };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. MONTHLY LEADERBOARD — top 3 volunteers by total hours
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function handleLeaderboard(p) {
  var now          = new Date();
  var monthParam   = (p.month || "").trim();
  var targetMonth  = monthParam || (now.getFullYear() + "-" + pad(now.getMonth() + 1));

  var sheet = SS.getSheetByName(CHECKIN_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { ok: true, month: targetMonth, top3: [] };
  }

  var data    = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var records = {}; // name -> { ins: [], outs: [] }

  data.forEach(function(row) {
    var dateStr = String(row[2]).trim();
    if (!dateStr.startsWith(targetMonth)) return;

    var n    = String(row[1]).trim();
    var t    = String(row[3]).trim();
    var type = String(row[4]).trim().toLowerCase();

    if (!records[n]) records[n] = { ins: [], outs: [] };
    if (type === "in")  records[n].ins.push(t);
    if (type === "out") records[n].outs.push(t);
  });

  var totals = [];
  for (var n in records) {
    var ins  = records[n].ins.sort();
    var outs = records[n].outs.sort();
    var mins = 0;
    for (var i = 0; i < Math.min(ins.length, outs.length); i++) {
      var inT  = parseTime(ins[i]);
      var outT = parseTime(outs[i]);
      if (inT !== null && outT !== null) mins += (outT - inT);
    }
    totals.push({ name: n, hours: Math.round((mins / 60) * 10) / 10 });
  }

  totals.sort(function(a, b) { return b.hours - a.hours; });
  return { ok: true, month: targetMonth, top3: totals.slice(0, 3) };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. JOIN VOLUNTEER TEAM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function handleVolunteer(p) {
  var name         = (p.name         || "").trim();
  var email        = (p.email        || "").trim();
  var phone        = (p.phone        || "").trim();
  var district     = (p.district     || "").trim();
  var interests    = (p.interests    || "").trim();
  var availability = (p.availability || "").trim();

  if (!name || !email) {
    return { ok: false, error: "Name and Email are required" };
  }

  var sheet = getOrCreateSheet(VOLUNTEER_SHEET, [
    "Timestamp","Name","Email","Phone","District","Interests","Availability"
  ]);
  sheet.appendRow([
    new Date().toISOString(), name, email, phone, district, interests, availability
  ]);

  sendVolunteerNotification(name, email, phone, district, interests, availability);

  return { ok: true, message: "Thank you " + name + "! We'll be in touch soon." };
}

function sendVolunteerNotification(name, email, phone, district, interests, availability) {
  var subject = "[SHK 義工申請] " + name;

  var rows = [
    ["姓名 Name",           name],
    ["電郵 Email",          '<a href="mailto:' + email + '" style="color:' + RED + ';">' + email + '</a>'],
    ["電話 Phone",          phone        || "—"],
    ["地區 District",       district     || "—"],
    ["興趣 Interests",      interests    || "—"],
    ["可用時間 Availability", availability || "—"]
  ];

  var html = buildHtmlEmail(
    "新義工申請 New Volunteer Application",
    rows,
    null
  );

  var plain =
    "New volunteer application from salfordhongkongers.co.uk\n\n" +
    "Name:         " + name         + "\n" +
    "Email:        " + email        + "\n" +
    "Phone:        " + (phone        || "—") + "\n" +
    "District:     " + (district     || "—") + "\n" +
    "Interests:    " + (interests    || "—") + "\n" +
    "Availability: " + (availability || "—");

  sendMail(NOTIFY_EMAIL, subject, plain, html, email);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. GENERAL ENQUIRY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function handleEnquiry(p) {
  var name     = (p.name     || "").trim();
  var email    = (p.email    || "").trim();
  var phone    = (p.phone    || "").trim();
  var category = (p.category || "").trim();
  var subject  = (p.subject  || "").trim();
  var message  = (p.message  || "").trim();

  if (!name || !email || !message) {
    return { ok: false, error: "Name, Email and Message are required" };
  }

  var sheet = getOrCreateSheet(ENQUIRY_SHEET, [
    "Timestamp","Name","Email","Phone","Category","Subject","Message"
  ]);
  sheet.appendRow([
    new Date().toISOString(), name, email, phone, category, subject, message
  ]);

  sendEnquiryNotification(name, email, phone, category, subject, message);

  return { ok: true, message: "Your enquiry has been received. We'll get back to you soon!" };
}

function sendEnquiryNotification(name, email, phone, category, subject, message) {
  var emailSubject = "[SHK 查詢] " + (subject || category || "新查詢 New Enquiry");

  var rows = [
    ["姓名 Name",     name],
    ["電郵 Email",    '<a href="mailto:' + email + '" style="color:' + RED + ';">' + email + '</a>'],
    ["電話 Phone",    phone    || "—"],
    ["類別 Category", category || "—"],
    ["主題 Subject",  subject  || "—"]
  ];

  var html = buildHtmlEmail(
    "新查詢 New Enquiry",
    rows,
    message
  );

  var plain =
    "New enquiry from salfordhongkongers.co.uk\n\n" +
    "Name:     " + name     + "\n" +
    "Email:    " + email    + "\n" +
    "Phone:    " + (phone    || "—") + "\n" +
    "Category: " + (category || "—") + "\n" +
    "Subject:  " + (subject  || "—") + "\n\n" +
    "Message:\n" + message;

  sendMail(NOTIFY_EMAIL, emailSubject, plain, html, email);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED HTML EMAIL BUILDER
// rows: [ ["Label", "Value"], ... ]
// messageBlock: string or null
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildHtmlEmail(title, rows, messageBlock) {
  var rowsHtml = rows.map(function(r, i) {
    var bg = i % 2 === 0 ? "#ffffff" : "#fafafa";
    return (
      '<tr style="background:' + bg + ';">' +
        '<td style="padding:10px 14px;color:#888;width:160px;font-size:14px;border-bottom:1px solid #f0f0f0;">' + r[0] + '</td>' +
        '<td style="padding:10px 14px;font-weight:600;font-size:14px;border-bottom:1px solid #f0f0f0;">' + r[1] + '</td>' +
      '</tr>'
    );
  }).join("");

  var msgHtml = messageBlock
    ? '<div style="margin-top:20px;">' +
        '<p style="color:#888;margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;">訊息 Message</p>' +
        '<div style="background:#fafafa;border-left:4px solid ' + RED + ';padding:14px 16px;border-radius:0 4px 4px 0;font-size:14px;line-height:1.7;white-space:pre-wrap;">' + messageBlock + '</div>' +
      '</div>'
    : "";

  return (
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">' +
      '<div style="background:' + RED + ';padding:22px 24px;">' +
        '<h2 style="color:#fff;margin:0;font-size:18px;letter-spacing:.03em;">&#x1F1ED;&#x1F1F0; Salford Hongkongers</h2>' +
        '<p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:14px;">' + title + '</p>' +
      '</div>' +
      '<div style="padding:24px;">' +
        '<table style="width:100%;border-collapse:collapse;">' + rowsHtml + '</table>' +
        msgHtml +
        '<div style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;font-size:12px;color:#bbb;">' +
          'Received via <a href="https://salfordhongkongers.co.uk" style="color:#bbb;">salfordhongkongers.co.uk</a> &bull; ' +
          new Date().toUTCString() +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED MAIL SENDER  (replyTo is optional)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendMail(to, subject, plain, html, replyTo) {
  var opts = {
    to:       to,
    subject:  subject,
    body:     plain,
    htmlBody: html
  };
  if (replyTo) opts.replyTo = replyTo;

  try {
    MailApp.sendEmail(opts);
  } catch (e) {
    Logger.log("sendMail failed: " + e.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getOrCreateSheet(name, headers) {
  var sheet = SS.getSheetByName(name);
  if (!sheet) {
    sheet = SS.insertSheet(name);
    if (headers && headers.length) {
      var headerRow = sheet.getRange(1, 1, 1, headers.length);
      headerRow.setValues([headers]);
      headerRow.setFontWeight("bold");
      headerRow.setBackground("#fdecea");
    }
  }
  return sheet;
}

function parseTime(timeStr) {
  var parts = String(timeStr).split(":");
  if (parts.length < 2) return null;
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function pad(num) {
  return num < 10 ? "0" + num : "" + num;
}