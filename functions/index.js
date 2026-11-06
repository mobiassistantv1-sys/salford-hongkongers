/* 友愛冰室 — Star CloudPRNT server (Star mC-Print3 MCP31CI).
   1) New order written by the QR page -> trigger puts ONE queue entry per order.
   2) Printer POSTs every few seconds -> we answer with the next queued order.
   3) Printer GETs the whole order as one StarPRNT job (kitchen, bar, floor; partial cut after each).
      Fallback if the printer asks for PNG: slips stacked in one image, one cut at the end.
   4) Printer confirms (DELETE) -> entry removed, order marked printed.
   Protocol: https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-guide.html */
"use strict";
const { onRequest } = require("firebase-functions/v2/https");
const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const { Y, groups, noticeRows, slipCanvas, starprnt, stackPng, STATIONS } = require("./slips");
const STARPRNT = "application/vnd.star.starprnt";

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

async function publicData() { const P = (await db.ref("ordering/public").get()).val() || {}; Y.applySpecial(P); return P; }

/* ---------- 1) queue new orders ---------- */
exports.queueSlips = onValueCreated({ ref: "/ordering/orders/{day}/{oid}", region: REGION }, async ev => {
  const o = ev.data.val() || {}; const { day, oid } = ev.params;
  if (!Object.keys(groups(o, await publicData())).length) return;
  const at = o.at || Date.now();
  await db.ref(`${Q}/${at}_${oid}`).set({ day, oid, at, tries: 0 });
});

/* cancel / void AFTER the slips were printed -> print a notice so the kitchen and bar stop making it */
async function queueNotice(day, oid, kind, extra) {
  const o = (await db.ref(`ordering/orders/${day}/${oid}`).get()).val();
  if (!o || !o.print) return;                       /* not printed yet: the main job simply leaves it out */
  const at = Date.now();
  await db.ref(`${Q}/${at}_${oid}_${kind}${extra != null ? extra : ""}`).set({ day, oid, at, tries: 0, notice: kind, line: extra != null ? extra : null });
}
exports.cancelNotice = onValueCreated({ ref: "/ordering/orders/{day}/{oid}/lines/{i}/x", region: REGION }, async ev => {
  if (ev.data.val() === true) await queueNotice(ev.params.day, ev.params.oid, "cancel", +ev.params.i);
});
/* staff tapped 重印 (orders/{day}/{oid}/rp = {at, st}) -> queue a reprint of all slips or one station */
exports.reprint = onValueWritten({ ref: "/ordering/orders/{day}/{oid}/rp", region: REGION }, async ev => {
  const v = ev.data.after.val(); if (!v) return;
  const at = Date.now(), { day, oid } = ev.params;
  await db.ref(`${Q}/${at}_${oid}_rp`).set({ day, oid, at, tries: 0, reprint: true, st: STATIONS.includes(v.st) ? v.st : null });
});
exports.voidNotice = onValueCreated({ ref: "/ordering/orders/{day}/{oid}/void", region: REGION }, async ev => {
  await queueNotice(ev.params.day, ev.params.oid, "void");
});

async function nextJob() {
  const s = await db.ref(Q).orderByKey().limitToFirst(5).get();
  const now = Date.now(); let job = null; const drop = {};
  s.forEach(c => { const v = c.val(); if (job) return; if (!v || now - (v.at || 0) > MAX_AGE) drop[`${Q}/${c.key}`] = null; else job = { key: c.key, ...v }; });
  if (Object.keys(drop).length) await db.ref().update(drop);
  return job;
}

/* stations of a queue entry: whole order, or one station for entries queued by the old version */
const stationsOf = (j, g) => (j.st ? [j.st] : STATIONS).filter(st => g[st]);

async function render(key, type) {
  const j = (await db.ref(`${Q}/${key}`).get()).val(); if (!j) return null;
  const [oSnap, P] = [await db.ref(`ordering/orders/${j.day}/${j.oid}`).get(), await publicData()];
  const o = oSnap.val(); if (!o) return null;
  if (j.notice) {
    const rows = j.notice === "cancel" ? noticeRows(o, P, [j.line]) : noticeRows(o, P, (o.lines || []).map((l, i) => i).filter(i => !(o.lines[i] || {}).x));
    if (!rows.length) return null;
    const c = slipCanvas(Object.assign({}, o, { allergy: "", note: j.notice === "void" && o.void ? "原因：" + o.void.reason : "" }), j.notice, rows, { time: hhmm(Date.now()) });
    return type === STARPRNT ? starprnt([c]) : stackPng([c]);
  }
  if (o.void) return null;                          /* voided before printing: nothing to print */
  const g = groups(o, P), sts = stationsOf(j, g); if (!sts.length) return null;
  /* add-on = same table already had an earlier unpaid order today (same rule as staff page) */
  const all = (await db.ref(`ordering/orders/${j.day}`).get()).val() || {};
  const addOn = Object.keys(all).some(id => id !== j.oid && all[id].table === o.table && (all[id].at || 0) < (o.at || 0) && !all[id].paid);
  const meta = { time: hhmm(o.at || Date.now()), addOn, reprint: !!j.reprint };
  const canvases = sts.map(st => slipCanvas(o, st, g[st], meta));
  return type === STARPRNT ? starprnt(canvases) : stackPng(canvases);
}

async function confirm(mac, key, code) {
  const ok = /^2/.test(code || "");
  const ref = db.ref(`${Q}/${key}`); const j = (await ref.get()).val(); if (!j) return;
  const mark = v => { const u = { [`${Q}/${key}`]: null };
    (j.notice ? [j.notice + (j.line != null ? "_" + j.line : "")] : j.st ? [j.st] : STATIONS).forEach(st => { u[`ordering/orders/${j.day}/${j.oid}/print/${st}`] = v; }); return u; };
  if (ok) await db.ref().update(mark(Date.now()));
  else if ((j.tries || 0) + 1 >= MAX_TRIES) await db.ref().update(mark("fail:" + code));
  else await ref.child("tries").set((j.tries || 0) + 1);
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
      return res.json(j ? { jobReady: true, mediaTypes: [STARPRNT, "image/png"], jobToken: j.key } : { jobReady: false });
    }
    if (!allowed(q.mac)) return res.status(403).send("unknown printer");
    if (req.method === "DELETE" || (req.method === "GET" && q.delete !== undefined)) {
      let key = q.token; if (!key) { const j = await nextJob(); key = j && j.key; }  /* firmware without token support */
      if (key) await confirm(q.mac, key, q.code);
      return res.status(200).send("OK");
    }
    if (req.method === "GET") {
      let key = q.token; if (!key) { const j = await nextJob(); key = j && j.key; }
      const type = q.type === STARPRNT ? STARPRNT : "image/png";
      const body = key && await render(key, type);
      if (!body) { if (key) await db.ref(`${Q}/${key}`).remove(); return res.status(404).send("no job"); }
      res.set("Content-Type", type);
      if (type === "image/png") { res.set("X-Star-Cut", "partial; feed=true"); res.set("X-Star-ImageDitherPattern", "none"); }
      return res.status(200).send(body);
    }
    return res.status(405).send("method");
  } catch (e) {
    console.error(e); return res.status(500).send("error");
  }
});
