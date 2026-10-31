/* Salford Hongkongers — shared account helpers (volunteers, café staff, admin).
   One account per person. Login ID = WhatsApp number, password chosen by the person.
   Firebase sign-in email is derived: <phoneDigits>-<gen>@id.salfordhongkongers.co.uk
   (gen goes up when an admin resets the account, so the person can register again). */
(function () {
  "use strict";
  const FIREBASE = {
    apiKey: "AIzaSyBCCnoKm-ypR-3MfzwTRXLd1TTplcqteY8",
    authDomain: "yauoicafequeue.firebaseapp.com",
    databaseURL: "https://yauoicafequeue-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "yauoicafequeue",
    storageBucket: "yauoicafequeue.firebasestorage.app",
    messagingSenderId: "354774084334",
    appId: "1:354774084334:web:9c8923bd9ece01b45f61ff"
  };
  const ID_DOMAIN = "id.salfordhongkongers.co.uk";

  /* UK 07… → 447…, HK 8-digit mobile → 852…, keep other international numbers as digits */
  function normPhone(s) {
    let d = String(s || "").replace(/[^\d+]/g, "");
    if (d.indexOf("+") === 0) d = d.slice(1);
    if (d.indexOf("00") === 0) d = d.slice(2);
    d = d.replace(/\D/g, "");
    if (/^07\d{9}$/.test(d)) d = "44" + d.slice(1);
    else if (/^7\d{9}$/.test(d)) d = "44" + d;
    else if (/^[4-9]\d{7}$/.test(d)) d = "852" + d;
    else if (/^4407\d{9}$/.test(d)) d = "44" + d.slice(3);
    return /^\d{10,15}$/.test(d) ? d : null;
  }
  function prettyPhone(pid) {
    if (!pid) return "";
    if (pid.indexOf("44") === 0) return "0" + pid.slice(2, 6) + " " + pid.slice(6);
    if (pid.indexOf("852") === 0) return "+852 " + pid.slice(3, 7) + " " + pid.slice(7);
    return "+" + pid;
  }
  const authEmail = (pid, gen) => pid + "-" + (gen || 0) + "@" + ID_DOMAIN;
  function pidFromEmail(email) { const m = /^(\d{10,15})-\d+@/.exec(email || ""); return m ? m[1] : null; }

  async function signInPhone(auth, db, phone, password) {
    const pid = normPhone(phone);
    if (!pid) { const e = new Error("bad-phone"); e.code = "bad-phone"; throw e; }
    const g = (await db.ref("shk/directory/" + pid + "/gen").get()).val() || 0;
    await auth.signInWithEmailAndPassword(authEmail(pid, g), password);
    return pid;
  }
  function authErrorText(err, en) {
    const c = (err && err.code) || "";
    if (c === "bad-phone") return en ? "Please enter a valid WhatsApp number." : "請輸入正確嘅 WhatsApp 號碼。";
    if (c === "auth/too-many-requests") return en ? "Too many attempts. Wait a few minutes." : "試錯太多次，請等幾分鐘再試。";
    if (c === "auth/network-request-failed") return en ? "No connection. Check your internet." : "網絡連唔到，請檢查上網。";
    return en ? "Phone number or password is wrong." : "電話號碼或密碼唔啱。";
  }

  function londonParts(ts) {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
    const o = {}; f.formatToParts(new Date(ts)).forEach(p => { o[p.type] = p.value; });
    return o;
  }
  const hhmm = ts => { if (!ts) return "--:--"; const p = londonParts(ts); return p.hour + ":" + p.minute; };
  const dateKey = ts => { const p = londonParts(ts || Date.now()); return p.year + "-" + p.month + "-" + p.day; };
  /* hours between two timestamps, each rounded to the nearest 15 minutes */
  function roundedHours(inTs, outTs) {
    const q = 15 * 60000, a = Math.round(inTs / q) * q, b = Math.round(outTs / q) * q;
    return Math.max(0, Math.round((b - a) / 3600000 * 100) / 100);
  }
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  window.SHK = { FIREBASE, ID_DOMAIN, normPhone, prettyPhone, authEmail, pidFromEmail, signInPhone, authErrorText, hhmm, dateKey, roundedHours, londonParts, esc };
})();
