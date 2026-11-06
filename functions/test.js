/* Local check: renders the three slips for a sample order into test-out/. Run: npm test */
"use strict";
const fs = require("fs");
const assert = require("assert");
const { groups, noticeRows, renderSlip, slipCanvas, starprnt, stackPng, STATIONS } = require("./slips");

const order = {
  table: "T3", no: 12, at: Date.now(), allergy: "對花生過敏", note: "少啲鹽",
  lines: [
    { itemId: "ad_satay", qty: 1, sel: { noodle: ["instant"], sides: ["sausage", "fried"], toast: ["toast"], setdrink: ["iced_milktea"], taste: ["lessice"] } },
    { itemId: "dk_hot", qty: 2, sel: { drink: ["hot_lemontea"] } },
    { itemId: "sw_hamegg", qty: 1, sel: { toastsw: ["toasted"] } },
    { itemId: "bk_pinebutter", qty: 1, sel: {} },
    { itemId: "bk_eggtart", qty: 2, sel: {}, x: true }   /* cancelled: must not print */
  ]
};
const g = groups(order, {});
assert.deepStrictEqual(Object.keys(g), STATIONS);
assert.strictEqual(g.kitchen.length, 2);
assert.strictEqual(g.bar.length, 3, "set drink, hot drinks, set add-on toast");
assert.strictEqual(g.floor.length, 4, "floor = whole order, cancelled line skipped");
assert.ok(g.floor.every(r => r.price > 0), "floor rows carry prices");
assert.ok(g.kitchen[0].al.includes("花生"), "satay shows peanut");
assert.strictEqual(g.bar[0].al.join(), "奶", "set drink shows only the drink's allergens");
fs.mkdirSync("test-out", { recursive: true });
STATIONS.forEach(st => fs.writeFileSync(`test-out/${st}.png`, renderSlip(order, st, g[st], { time: "10:42", addOn: st === "bar", reprint: false })));
console.log("ok", JSON.stringify(g, null, 1));
/* one job: 3 slips -> 3 raster blocks + 3 partial cuts */
const cv = STATIONS.map(st => slipCanvas(order, st, g[st], { time: "10:42" }));
const job = starprnt(cv);
const count = (buf, seq) => { let n = 0; for (let i = buf.indexOf(seq); i >= 0; i = buf.indexOf(seq, i + 1)) n++; return n; };
assert.strictEqual(job[0], 0x1b); assert.strictEqual(job[1], 0x40);
assert.strictEqual(job[job.length - 3], 0x1b); assert.strictEqual(job[job.length - 1], 3);
const expect = 2 + cv.reduce((a, c) => a + 9 + 72 * c.height + 3, 0);
assert.strictEqual(job.length, expect, "byte length = init + (header + 72 bytes/row + cut) per slip");
fs.writeFileSync("test-out/order.starprnt", job); fs.writeFileSync("test-out/stacked.png", stackPng(cv));
console.log("starprnt bytes", job.length, "cuts", count(job, Buffer.from([0x1b, 0x64, 3])));
/* cancel notice for line 1 (2× hot lemon tea) */
const nr = noticeRows(order, {}, [1]);
assert.strictEqual(nr.length, 1); assert.strictEqual(nr[0].q, 2);
fs.writeFileSync("test-out/cancel.png", renderSlip(order, "cancel", nr, { time: "10:50" }));

/* 是日特別麵包: staff-set name/price/allergens flow to every slip */
const { Y } = require("./slips");
const P2 = { special: { zh: "椰撻", en: "Coconut Tart", p: 180, al: ["G", "E", "M"] } };
Y.applySpecial(P2);
const g2 = groups({ table: "T1", lines: [{ itemId: "bk_special", qty: 2, sel: {} }] }, P2);
assert.strictEqual(g2.floor[0].name, "椰撻"); assert.strictEqual(g2.floor[0].price, 360);
assert.strictEqual(g2.floor[0].al.join("、"), "雞蛋、奶、麩質");
assert.ok(!g2.kitchen && !g2.bar, "bun is floor only");
assert.strictEqual(Y.applySpecial({ special: { zh: "x", p: 100 } }), false, "no allergen confirmation = not ready");
console.log("special ok");
