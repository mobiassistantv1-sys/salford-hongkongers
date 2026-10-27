// Copies prices from Square into Firebase (/ordering/public/prices) so the QR menu
// always matches Square. Runs from GitHub Actions; secrets never touch the repo.
// Env: SQUARE_ACCESS_TOKEN, FIREBASE_SERVICE_ACCOUNT (JSON), FIREBASE_DB_URL
import fs from "node:fs";
import vm from "node:vm";
import admin from "firebase-admin";

const { SQUARE_ACCESS_TOKEN, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DB_URL } = process.env;
if (!SQUARE_ACCESS_TOKEN || !FIREBASE_SERVICE_ACCOUNT || !FIREBASE_DB_URL) {
  console.error("Missing SQUARE_ACCESS_TOKEN, FIREBASE_SERVICE_ACCOUNT or FIREBASE_DB_URL");
  process.exit(1);
}

// Load the shared menu (order/menu.js) without a browser.
const sandbox = { window: {}, Intl };
vm.runInNewContext(fs.readFileSync(new URL("../order/menu.js", import.meta.url), "utf8"), sandbox);
const Y = sandbox.window.YO;

const wanted = new Map(); // squareId -> [{kind, key}]
const add = (sq, kind, key) => { if (!sq) return; if (!wanted.has(sq)) wanted.set(sq, []); wanted.get(sq).push({ kind, key }); };
for (const m of Y.MENU) { add(m.sq, "item", m.id); add(m.sqT, "item", m.id + ":toasted"); }
for (const gid of Object.keys(Y.G)) {
  const g = Y.G[gid];
  for (const c of g.choices) if (c.sq) add(c.sq, "mod", g.id + ":" + c.id);
}

const res = await fetch("https://connect.squareup.com/v2/catalog/batch-retrieve", {
  method: "POST",
  headers: { Authorization: "Bearer " + SQUARE_ACCESS_TOKEN, "Content-Type": "application/json", "Square-Version": "2024-10-17" },
  body: JSON.stringify({ object_ids: [...wanted.keys()] })
});
if (!res.ok) { console.error("Square error", res.status, await res.text()); process.exit(1); }
const { objects = [] } = await res.json();

const items = {}, mods = {}, missing = [];
for (const obj of objects) {
  const amount = obj.item_variation_data?.price_money?.amount ?? obj.modifier_data?.price_money?.amount;
  if (obj.is_deleted || amount == null) continue;
  for (const t of wanted.get(obj.id) || []) (t.kind === "item" ? items : mods)[t.key] = Number(amount);
}
for (const [sq, targets] of wanted) for (const t of targets) if ((t.kind === "item" ? items : mods)[t.key] == null) missing.push(t.key + " (" + sq + ")");

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)), databaseURL: FIREBASE_DB_URL });
await admin.database().ref("ordering/public/prices").set({ items, mods, syncedAt: Date.now(), missing });
console.log(`Synced ${Object.keys(items).length} item prices and ${Object.keys(mods).length} modifier prices.`);
if (missing.length) console.warn("No price in Square for:", missing.join(", "));
await admin.app().delete();
