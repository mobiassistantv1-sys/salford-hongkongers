/* Local check: renders the three slips for a sample order into test-out/. Run: npm test */
"use strict";
const fs = require("fs");
const assert = require("assert");
const { groups, renderSlip, STATIONS } = require("./slips");

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
assert.strictEqual(g.bar.length, 2);
assert.strictEqual(g.floor.length, 4, "floor = whole order, cancelled line skipped");
assert.ok(g.floor.every(r => r.price > 0), "floor rows carry prices");
assert.ok(g.kitchen[0].al.includes("花生"), "satay shows peanut");
assert.strictEqual(g.bar[0].al.join(), "奶", "set drink shows only the drink's allergens");
fs.mkdirSync("test-out", { recursive: true });
STATIONS.forEach(st => fs.writeFileSync(`test-out/${st}.png`, renderSlip(order, st, g[st], { time: "10:42", addOn: st === "bar", reprint: false })));
console.log("ok", JSON.stringify(g, null, 1));
