/* 友愛冰室 — Star CloudPRNT server (Star mC-Print3 MCP31CI).
   1) New order written by the QR page -> trigger puts one small queue entry per station.
   2) Printer POSTs every few seconds -> we answer with the next queued slip.
   3) Printer GETs the slip as PNG (one slip = one job, cut after each).
   4) Printer confirms (DELETE) -> entry removed, order marked printed.
   Protocol: https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-guide.html */
"use strict";
const { onRequest } = require("firebase-functions/v2/https");
const { onValueCreated } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const { groups, renderSlip, STATIONS } = require("./slips");

admin.initializeApp();
const db = admin.database();
const REGION = "europe-west1";
const Q = "ordering/printq";
const MAX_AGE = 3 * 60 * 60 * 1000;  /* never print slips older than 3 h (e.g. printer was off all day) */
const MAX_TRIES = 5;

/* Printers allowed to pull orders: comma list in functions/.env, e.g. PRINTER_MAC=00:11:62:aa:bb:cc */
const hex = m => String(m || "").toLowerCase().replace(/[^0-9a-f]/g, "");  /* "00:11:62:37:10:DD" == "00-11-62-37-10-dd" */
const allowed = mac => !!hex(mac) && String(process.env.PRINTER_MAC || "").split(",").map(hex).includes(hex(mac));

const hhmm = ms => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

async function publicData() { return (await db.ref("ordering/public").get()).val() || {}; }

/* ---------- 1) queue new orders ---------- */
exports.queueSlips = onValueCreated({ ref: "/ordering/orders/{day}/{oid}", region: REGION }, async ev => {
  const o = ev.data.val() || {}; const { day, oid } = ev.params;
  const P = await publicData();
  const g = groups(o, P); const at = o.at || Date.now();
  const upd = {};
  STATIONS.forEach((st, i) => { if (g[st]) upd[`${Q}/${at}_${i}_${oid}`] = { day, oid, st, at, tries: 0 }; });
  if (Object.keys(upd).length) await db.ref().update(upd);
});

async function nextJob() {
  const s = await db.ref(Q).orderByKey().limitToFirst(5).get();
  const now = Date.now(); let job = null; const drop = {};
  s.forEach(c => { const v = c.val(); if (job) return; if (!v || now - (v.at || 0) > MAX_AGE) drop[`${Q}/${c.key}`] = null; else job = { key: c.key, ...v }; });
  if (Object.keys(drop).length) await db.ref().update(drop);
  return job;
}

async function render(key) {
  const j = (await db.ref(`${Q}/${key}`).get()).val(); if (!j) return null;
  const [oSnap, P] = [await db.ref(`ordering/orders/${j.day}/${j.oid}`).get(), await publicData()];
  const o = oSnap.val(); if (!o) return null;
  const rows = groups(o, P)[j.st]; if (!rows) return null;
  /* add-on = same table already had an earlier unpaid order today (same rule as staff page) */
  const all = (await db.ref(`ordering/orders/${j.day}`).get()).val() || {};
  const addOn = Object.keys(all).some(id => id !== j.oid && all[id].table === o.table && (all[id].at || 0) < (o.at || 0) && !all[id].paid);
  return renderSlip(o, j.st, rows, { time: hhmm(o.at || Date.now()), addOn, reprint: !!j.reprint });
}

async function confirm(mac, key, code) {
  const ok = /^2/.test(code || "");
  const ref = db.ref(`${Q}/${key}`); const j = (await ref.get()).val(); if (!j) return;
  if (ok) {
    await db.ref().update({ [`${Q}/${key}`]: null, [`ordering/orders/${j.day}/${j.oid}/print/${j.st}`]: Date.now() });
  } else if ((j.tries || 0) + 1 >= MAX_TRIES) {
    await db.ref().update({ [`${Q}/${key}`]: null, [`ordering/orders/${j.day}/${j.oid}/print/${j.st}`]: "fail:" + code });
  } else await ref.child("tries").set((j.tries || 0) + 1);
}

/* ---------- 2–4) the endpoint the printer is configured with ---------- */
exports.cloudprnt = onRequest({ region: REGION, memory: "512MiB", cors: false }, async (req, res) => {
  try {
    const q = req.query || {};
    if (req.method === "POST") {
      const b = req.body || {}; const mac = b.printerMAC;
      await db.ref("ordering/printer/status").set({ mac: mac || "", code: b.statusCode || "", at: Date.now(), ok: allowed(mac) });
      if (!allowed(mac)) return res.json({ jobReady: false });
      const j = await nextJob();
      return res.json(j ? { jobReady: true, mediaTypes: ["image/png"], jobToken: j.key } : { jobReady: false });
    }
    if (!allowed(q.mac)) return res.status(403).send("unknown printer");
    if (req.method === "DELETE" || (req.method === "GET" && q.delete !== undefined)) {
      let key = q.token; if (!key) { const j = await nextJob(); key = j && j.key; }  /* firmware without token support */
      if (key) await confirm(q.mac, key, q.code);
      return res.status(200).send("OK");
    }
    if (req.method === "GET") {
      let key = q.token; if (!key) { const j = await nextJob(); key = j && j.key; }
      const png = key && await render(key);
      if (!png) { if (key) await db.ref(`${Q}/${key}`).remove(); return res.status(404).send("no job"); }
      res.set("Content-Type", "image/png");
      res.set("X-Star-Cut", "partial; feed=true");
      res.set("X-Star-ImageDitherPattern", "none");
      if (key.split("_")[1] === "0") res.set("X-Star-Buzzerstartpattern", "1");  /* kitchen slip: beep if a buzzer is fitted */
      return res.status(200).send(png);
    }
    return res.status(405).send("method");
  } catch (e) {
    console.error(e); return res.status(500).send("error");
  }
});
