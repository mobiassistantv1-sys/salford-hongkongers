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

  /* Volunteer levels by total service time (minutes). A certificate needs 10 hours. */
  const TIERS = [
    { min: 0, zh: "初級義工", en: "Starter Volunteer", c1: "#b9a58f", c2: "#8c7760" },
    { min: 300, zh: "銀級義工", en: "Silver Volunteer", c1: "#d9dde2", c2: "#8e98a3" },
    { min: 600, zh: "金級義工", en: "Gold Volunteer", c1: "#f6d36b", c2: "#b8860b" },
    { min: 1200, zh: "白金義工", en: "Platinum Volunteer", c1: "#eef1f4", c2: "#6f7f8f" },
    { min: 1800, zh: "鑽石義工", en: "Diamond Volunteer", c1: "#bfe9fb", c2: "#2a86b8" }
  ];
  const CERT_MIN = 600;
  const tierOf = min => { let t = TIERS[0]; TIERS.forEach(x => { if (min >= x.min) t = x; }); return t; };
  const nextTier = min => TIERS.find(x => x.min > min) || null;
  const fmtMin = (m, en) => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60;
    return en ? h + (h === 1 ? " hour" : " hours") + (r ? " " + r + " min" : "") : h + " 小時" + (r ? " " + r + " 分鐘" : ""); };
  /* One person's service time: every completed check-in across SHK events (read one by one — a volunteer may
     only read their own attendance), plus the hours copied from the SHK record sheet when that sync runs.
     The sheet already contains the check-ins, so the larger of the two totals is used, never the sum. */
  async function volunteerHours(db, pid) {
    const evs = (await db.ref("shk/events").get()).val() || {};
    const ids = Object.keys(evs);
    const rows = await Promise.all(ids.map(eid => db.ref("shk/attendance/" + eid + "/" + pid).get().then(s => s.val()).catch(() => null)));
    const sessions = [];
    let open = null;
    rows.forEach((r, i) => {
      if (!r || !r.in) return;
      const e = evs[ids[i]] || {};
      if (!r.out) { open = { title: e.title || "", date: e.date || dateKey(r.in) }; return; }
      sessions.push({ title: e.title || "", date: e.date || dateKey(r.in), min: Math.round(roundedHours(r.in, r.out) * 60) });
    });
    sessions.sort((a, b) => b.date.localeCompare(a.date));
    let liveMin = sessions.reduce((n, s) => n + s.min, 0);
    let sheet = null;
    try { sheet = (await db.ref("shk/hours/" + pid).get()).val(); } catch (e) {}
    const sheetMin = sheet && sheet.total ? Math.round(sheet.total * 60) : 0;
    const useSheet = sheetMin > liveMin;
    return {
      minutes: Math.max(liveMin, sheetMin),
      count: useSheet ? (sheet.count || sessions.length) : sessions.length,
      sessions: useSheet && !sessions.length ? (sheet.recent || []).map(r => ({ title: r.title, date: r.date, min: Math.round((r.hours || 0) * 60) })) : sessions,
      first: sessions.length ? sessions[sessions.length - 1].date : null,
      last: sessions.length ? sessions[0].date : null,
      open, fromSheet: useSheet
    };
  }

  window.SHK = { FIREBASE, ID_DOMAIN, normPhone, prettyPhone, authEmail, pidFromEmail, signInPhone, authErrorText, hhmm, dateKey, roundedHours, londonParts, esc,
    TIERS, CERT_MIN, tierOf, nextTier, fmtMin, volunteerHours };
})();
