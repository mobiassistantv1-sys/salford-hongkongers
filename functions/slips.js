/* 友愛冰室 — render order slips as PNG for the Star mC-Print3 (CloudPRNT).
   Grouping copies slipsFor() in /yauoicafe/staff/index.html so paper = screen. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

/* Load the same menu.js the website uses (single source of truth). */
const MENU_JS = path.join(__dirname, "menu.js");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(MENU_JS, "utf8"), sandbox);
const Y = sandbox.window.YO;
const byId = Y.byId;

GlobalFonts.registerFromPath(path.join(__dirname, "fonts", "NotoSansHK-Bold.otf"), "HK");

const W = 576;            /* 72 mm print width at 203 dpi */
const PAD = 8;

const STATIONS = ["kitchen", "bar", "floor"];
const TITLE = { kitchen: "廚房 KITCHEN", bar: "水吧 BAR", floor: "樓面 FLOOR · 埋單用", cancel: "⚠ 取消 CANCEL · 唔使做", void: "⚠ 整張作廢 VOID · 唔使做" };

/* rows for a cancel / void notice: the line(s) that no longer need making */
function noticeRows(o, P, idxs) {
  return idxs.map(i => (o.lines || [])[i]).filter(l => l && byId[l.itemId]).map(l => {
    const ln = Y.mkLine(l.itemId, Math.max(1, Math.min(50, l.qty | 0)), l.sel || {}, P);
    return { q: ln.qty, name: Y.itemName(byId[l.itemId], P, "zh"), sub: ln.desc.map(x => x.zh).join("、") }; });
}

/* -> { kitchen:[{q,name,sub,al}], bar:[...], floor:[...] }  (empty stations omitted) */
function groups(o, P) {
  const L = (o.lines || []).map(l => {
    if (l.x || !byId[l.itemId]) return null;
    const ln = Y.mkLine(l.itemId, Math.max(1, Math.min(50, l.qty | 0)), l.sel || {}, P);
    return ln;
  }).filter(Boolean);
  const al = l => Y.lineAllergens(l.itemId, l.sel).map(c => Y.alName(c, "zh"));
  /* set drink of an All Day Set: only the drink's own allergens go on the bar slip */
  const drinkAl = sel => Y.sortAl(["setdrink", "taste"].flatMap(k =>
    (sel[k] || []).flatMap(id => ((Y.G[k].choices.find(c => c.id === id) || {}).al) || []))).map(c => Y.alName(c, "zh"));
  const out = {};
  const kit = L.filter(l => ["allday", "sandwich"].includes(byId[l.itemId].cat) && byId[l.itemId].st !== "bar");
  if (kit.length) out.kitchen = kit.map(l => { const it = byId[l.itemId];
    return { q: l.qty, name: Y.itemName(it, P, "zh") + (it.cat === "allday" ? "（全日早餐）" : ""),
      sub: l.desc.filter(x => x.st === "kitchen").map(x => x.zh).join("、"), al: al(l) }; });
  const bar = [];
  L.forEach(l => { const it = byId[l.itemId];
    if (it.cat === "drinks") bar.push({ q: l.qty, name: l.desc.filter(x => x.g === "drink").map(x => x.zh).join(""),
      sub: l.desc.filter(x => x.g === "taste").map(x => x.zh).join("、"), al: al(l) });
    else if (it.cat === "allday") bar.push({ q: l.qty, name: l.desc.filter(x => x.g === "setdrink").map(x => x.zh).join(""),
      sub: [l.desc.filter(x => x.g === "taste").map(x => x.zh).join("、"), "跟 " + it.zh + " 全日早餐"].filter(Boolean).join(" · "),
      al: drinkAl(l.sel) }); });
  /* toast is made at the bar: set add-on toast + toast items (西多士, 煉奶牛油多士, 花生醬多士) */
  L.forEach(l => { const it = byId[l.itemId];
    if (it.cat === "allday") l.desc.filter(x => x.g === "toast").forEach(x => bar.push({ q: l.qty, name: x.zh, sub: "跟 " + it.zh + " 全日早餐",
      al: Y.sortAl((l.sel.toast || []).flatMap(id => ((Y.G.toast.choices.find(c => c.id === id) || {}).al) || [])).map(c => Y.alName(c, "zh")) }));
    else if (it.st === "bar") bar.push({ q: l.qty, name: Y.itemName(it, P, "zh"), sub: l.desc.map(x => x.zh).join("、"), al: al(l) }); });
  if (bar.length) out.bar = bar;
  /* floor slip = the whole order with prices + total, for taking payment (always printed) */
  out.floor = L.map(l => { const it = byId[l.itemId];
    return { q: l.qty, name: Y.itemName(it, P, "zh") + (it.cat === "allday" ? "早餐" : ""),
      sub: l.desc.map(x => x.zh).join("、"), al: al(l), price: l.unit * l.qty }; });
  if (!out.floor.length) delete out.floor;
  return out;
}

function wrap(ctx, text, maxW) {
  const lines = []; let cur = "";
  for (const ch of String(text)) {
    /* closing punctuation never starts a line */
    if (ctx.measureText(cur + ch).width > maxW && cur && !"）)、，。：".includes(ch)) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* Draw one slip. Two passes: measure height, then paint. */
function slipCanvas(o, station, rows, meta) {
  const draw = (ctx, paint) => {
    let y = PAD;
    const text = (s, size, x, opts = {}) => {
      ctx.font = `${size}px HK`; const maxW = (opts.maxW || W - x - PAD);
      const ls = wrap(ctx, s, maxW);
      ls.forEach(t => {
        if (paint) {
          if (opts.invert) { ctx.fillStyle = "#000"; ctx.fillRect(x - 6, y - 2, Math.min(maxW, ctx.measureText(t).width) + 12, size + 10); ctx.fillStyle = "#fff"; }
          else ctx.fillStyle = "#000";
          ctx.fillText(t, x, y + size * 0.88);
        }
        y += size + (opts.gap ?? 8);
      });
    };
    const rule = (h = 3) => { if (paint) { ctx.fillStyle = "#000"; ctx.fillRect(0, y, W, h); } y += h + 10; };

    /* header: station (inverted band), table huge, order no + time */
    if (paint) { ctx.fillStyle = "#000"; ctx.fillRect(0, y, W, 60); ctx.fillStyle = "#fff"; ctx.font = "40px HK"; ctx.fillText(TITLE[station], PAD + 4, y + 45); }
    y += 72;
    const tbl = o.table && o.table.startsWith("W") ? "外賣 " + o.table : (o.table || "?") + (o.sub ? "-" + o.sub : "");
    text(tbl, 96, PAD, { gap: 4 });
    text(`#${String(o.no || 0).padStart(3, "0")}  ${meta.time}${o.name ? "  " + o.name : ""}${meta.addOn ? "  【加單】" : ""}`, 36, PAD);
    if (meta.reprint) text("重印 REPRINT", 36, PAD, { invert: true });
    rule();

    const money = p => "£" + (p / 100).toFixed(2);
    const right = (s, size, yy) => { if (!paint) return; ctx.font = `${size}px HK`; ctx.fillStyle = "#000"; ctx.fillText(s, W - PAD - ctx.measureText(s).width, yy + size * 0.88); };
    const PRICE_W = 170;   /* right column for prices on the floor slip */
    rows.forEach(r => {
      const hasP = r.price != null, fs = hasP ? 48 : 58;   /* bill slip: smaller names, fewer wraps */
      const qx = PAD, nx = PAD + (hasP ? 86 : 104);
      ctx.font = `${fs}px HK`;
      if (paint) { ctx.fillStyle = "#000"; ctx.fillText(r.q + "×", qx, y + fs * 0.88); }
      if (hasP) right(money(r.price), 48, y);
      text(r.name, fs, nx, { gap: 6, maxW: W - nx - PAD - (hasP ? PRICE_W : 0) });
      if (r.sub) text(r.sub, 40, nx, { gap: 6 });
      if (r.al && r.al.length) text("含：" + r.al.join("、"), 34, nx + 6, { invert: true, gap: 12, maxW: W - nx - PAD - 18 });
      y += 10;
    });

    if (station === "floor") {
      const total = rows.reduce((a, r) => a + (r.price || 0), 0);
      rule();
      if (paint) { ctx.font = "56px HK"; ctx.fillStyle = "#000"; ctx.fillText("合共", PAD, y + 56 * 0.88); }
      right(money(total), 64, y - 4); y += 76;
      text("折扣喺收錢時先計", 30, PAD);
    }
    if (o.allergy) { rule(); text("⚠ 過敏：" + o.allergy, 44, PAD, { invert: true, gap: 12, maxW: W - PAD * 2 - 12 }); }
    if (o.note) { rule(o.allergy ? 0 : 3); text("【備註】" + o.note, 42, PAD, { invert: true, gap: 12, maxW: W - PAD * 2 - 12 }); }
    y += 24;
    return y;
  };
  const probe = createCanvas(W, 10).getContext("2d");
  const H = Math.ceil(draw(probe, false));
  const c = createCanvas(W, H); const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  draw(ctx, true);
  return c;
}
const renderSlip = (...a) => slipCanvas(...a).toBuffer("image/png");

/* All slips of one order as ONE StarPRNT job: raster image + partial cut after each slip.
   Commands from Star "StarPRNT Command Specifications": ESC @ init, ESC GS S raster (m=1, 1 bit/dot,
   MSB = leftmost dot), ESC d 3 = feed to cutter then partial cut. 576 dots = 72 bytes per row (max 128). */
function starprnt(canvases) {
  const parts = [Buffer.from([0x1b, 0x40])];
  canvases.forEach(c => {
    const w = c.width, h = c.height, bpr = Math.ceil(w / 8);
    const px = c.getContext("2d").getImageData(0, 0, w, h).data;
    const head = Buffer.from([0x1b, 0x1d, 0x53, 1, bpr & 255, bpr >> 8, h & 255, h >> 8, 0]);
    const data = Buffer.alloc(bpr * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 < 128) data[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
    }
    parts.push(head, data, Buffer.from([0x1b, 0x64, 3]));
  });
  return Buffer.concat(parts);
}

/* Fallback if the printer only takes PNG: slips stacked, dashed tear line between, one cut at the end. */
function stackPng(canvases) {
  const gap = 40, H = canvases.reduce((a, c) => a + c.height, 0) + gap * (canvases.length - 1);
  const out = createCanvas(W, H), ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); let y = 0;
  canvases.forEach((c, i) => { ctx.drawImage(c, 0, y); y += c.height;
    if (i < canvases.length - 1) { ctx.fillStyle = "#000"; for (let x = 0; x < W; x += 24) ctx.fillRect(x, y + gap / 2 - 2, 12, 4); y += gap; } });
  return out.toBuffer("image/png");
}

module.exports = { Y, groups, noticeRows, renderSlip, slipCanvas, starprnt, stackPng, STATIONS };
