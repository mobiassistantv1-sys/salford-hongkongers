import { readFileSync } from "node:fs";
const NS = "yauoicafequeue-default-rtdb", DB = "http://127.0.0.1:9000", AU = "http://127.0.0.1:9099", D = "id.salfordhongkongers.co.uk";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fails++; };
const put = async (p, v) => { const r = await fetch(`${DB}/${p}.json?ns=${NS}`, { method: "PUT", headers: OWNER, body: JSON.stringify(v) }); if (!r.ok) throw new Error(await r.text()); };
const get = async p => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: OWNER })).json();
const as = (tok) => ({
  read: async p => (await fetch(`${DB}/${p}.json?ns=${NS}&auth=${tok}`)).ok,
  write: async (p, v, method = "PUT") => (await fetch(`${DB}/${p}.json?ns=${NS}&auth=${tok}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) })).ok,
});
async function signUp(email, password) {
  const r = await fetch(`${AU}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(email ? { email, password, returnSecureToken: true } : { returnSecureToken: true }) });
  const j = await r.json(); return { uid: j.localId, tok: j.idToken };
}
await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: "PUT", headers: OWNER, body: readFileSync("ordering-setup/database.rules.json", "utf8") });
const anon = await signUp(), vol = await signUp(`447700900111-0@${D}`, "x12345678"), staff = await signUp(`447700900222-0@${D}`, "x12345678"), att = await signUp(`447700900333-0@${D}`, "x12345678");
await put("", {
  ordering: { qrTokens: { T1: "k1" }, roles: { [staff.uid]: "staff" }, public: { stock: { pineapple: 30, cocktail: 30, sausage: 30, eggtart: 30 } } },
  yauoicafe: { queue: { q1: { number: 1, party: 2, status: "waiting", joinedAt: 1, uid: anon.uid } }, queuePrivate: { q1: { name: "Chan", phone: "07700900999" } } },
  queuePrivate: { q1: { name: "Lee", phone: "07700900998" } },
  shk: {
    uids: { [vol.uid]: "447700900111", [staff.uid]: "447700900222" },
    directory: { "447700900111": { gen: 0, claimed: true }, "447700900222": { gen: 0, claimed: true }, "447700900333": { gen: 0, imported: true, claimed: false } },
    people: {
      "447700900111": { name: "Vol", phone: "447700900111", status: "active", uid: vol.uid, roles: { volunteer: true } },
      "447700900222": { name: "Staff", phone: "447700900222", status: "active", uid: staff.uid, roles: { volunteer: true, cafe: "staff" } },
      "447700900333": { name: "Imported", phone: "447700900333", status: "active", imported: true, roles: { volunteer: true } },
    },
  },
});
const A = as(anon.tok), V = as(vol.tok), S = as(staff.tok), X = as(att.tok);
const order = t => ({ code: "T1", k: "k1", table: t, status: "new", lines: [{ id: "milktea", qty: 1 }], at: { ".sv": "timestamp" }, no: 1 });
ok(!(await A.write("ordering/orders/2026-11-20", order('<img src=x onerror=alert(1)>'), "POST")), "1. customer order with HTML in table is blocked");
ok(await A.write("ordering/orders/2026-11-20", order("T1"), "POST"), "1. normal customer order still works");
ok(!(await A.write("ordering/orders/2026-11-20", { ...order("T1"), k: "wrong" }, "POST")), "1. order with wrong QR key still blocked");
ok(await S.write("ordering/orders/2026-11-20", { code: "W01", k: "staff", staff: "x", table: "W01", status: "new", lines: [{ id: "a", qty: 1 }], no: 2 }, "POST"), "1. staff takeaway order still works");
ok(!(await A.write("ordering/public/stock", { pineapple: 0, cocktail: 0, sausage: 0, eggtart: 0 })), "4. stranger cannot zero all stock");
ok(await A.write("ordering/public/stock", { pineapple: 28, cocktail: 30, sausage: 29, eggtart: 30 }), "4. customer can still reserve a normal order");
ok(await S.write("ordering/public/stock", { pineapple: 0, cocktail: 0, sausage: 0, eggtart: 0 }), "4. staff can still set stock to 0");
ok(!(await V.read("yauoicafe/queuePrivate")), "3. ordinary volunteer cannot read customer phone numbers");
ok(!(await V.read("queuePrivate")), "3. ordinary volunteer cannot read SHK queue phone numbers");
ok(await S.read("yauoicafe/queuePrivate"), "3. café staff can read queue names/phones");
ok(!(await A.read("yauoicafe/queuePrivate")), "3. anonymous cannot read queue phones");
ok(await V.read("ordering/orders"), "3. volunteers can still see orders (kitchen)");
// 2. hijacking an imported record
ok(await X.write(`shk/uids/${att.uid}`, "447700900333"), "2. link account to imported number (allowed, as before)");
ok(!(await X.write("shk/people/447700900333", { uid: att.uid, claimedAt: { ".sv": "timestamp" } }, "PATCH")), "2. claiming imported record WITHOUT going pending is blocked");
ok(await X.write("shk/people/447700900333", { uid: att.uid, claimedAt: { ".sv": "timestamp" }, status: "pending" }, "PATCH"), "2. claiming sets status to pending");
ok(!(await X.write("shk/people/447700900333/status", "active")), "2. claimer cannot make themselves active");
ok((await get("shk/people/447700900333/status")) === "pending", "2. record is pending, waiting for admin");
ok(!(await V.write("shk/people/447700900111/status", "pending")), "2. existing active volunteer cannot be flipped by self");
console.log(fails ? `\n${fails} FAILURES` : "\nSECURITY ALL PASSED");
process.exit(fails ? 1 : 0);
