import { chromium } from "playwright";
const NS = "yauoicafequeue-default-rtdb", DB = "http://127.0.0.1:9000", AU = "http://127.0.0.1:9099", SITE = "http://127.0.0.1:8080";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const ok = (c, m) => { if (!c) { console.log("FAIL:", m); fails++; } else console.log("PASS:", m); };
let fails = 0;
const dbGet = async p => (await fetch(`${DB}/${p}.json?ns=${NS}`, { headers: OWNER })).json();
const dbPut = async (p, v) => { const r = await fetch(`${DB}/${p}.json?ns=${NS}`, { method: "PUT", headers: OWNER, body: JSON.stringify(v) }); if (!r.ok) throw new Error("put " + p + " " + r.status + " " + await r.text()); };
async function signUp(email, password) {
  const r = await fetch(`${AU}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  return (await r.json()).localId;
}
// rules
import { readFileSync } from "node:fs";
const rules = readFileSync("ordering-setup/database.rules.json", "utf8");
let r = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: "PUT", headers: OWNER, body: rules });
ok(r.ok, "rules loaded into emulator " + r.status + (r.ok ? "" : await r.text()));

const A = "447999000001", V = "447700900555", NEW = "447700900777", D = "id.salfordhongkongers.co.uk";
const Auid = await signUp(`${A}-0@${D}`, "adminpass1"), Vuid = await signUp(`${V}-0@${D}`, "volpass123");
const T = Date.parse("2026-10-28T10:00:00Z");
await dbPut("", {
  ordering: { roles: { [Vuid]: "staff" } },
  shk: {
    admins: { [Auid]: true }, uids: { [Auid]: A, [Vuid]: V },
    directory: { [A]: { gen: 0, claimed: true }, [V]: { gen: 0, claimed: true } },
    people: {
      [A]: { name: "Admin", phone: A, status: "active", uid: Auid, roles: { volunteer: true, admin: true }, createdAt: 1 },
      [V]: { name: "Siu Ming", first: "", surname: "", email: "", phone: V, status: "active", uid: Vuid, roles: { volunteer: true, cafe: "staff" }, createdAt: 1 },
    },
    events: { e1: { title: "茶聚", date: "2026-10-28", open: false }, e2: { title: "Boardgame", date: "2026-10-31", open: false }, e3: { title: "Other", date: "2026-11-01", open: false } },
    attendance: { e1: { [V]: { in: T, out: T + 5 * 3600e3 } }, e2: { [V]: { in: T + 3 * 864e5, out: T + 3 * 864e5 + 6 * 3600e3 } } },
  },
});

const browser = await chromium.launch();
async function ctx() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => {
    let real;
    Object.defineProperty(window, "firebase", { configurable: true, get() { return real; }, set(v) {
      real = v;
      if (v && !v.__hooked) { const oi = v.initializeApp.bind(v); v.initializeApp = function (...a) { const app = oi(...a);
        try { v.auth().useEmulator("http://127.0.0.1:9099", { disableWarnings: true }); } catch (e) {}
        try { v.database().useEmulator("127.0.0.1", 9000); } catch (e) {} return app; }; v.__hooked = true; }
    } });
  });
  const p = await c.newPage();
  p.on("pageerror", e => { console.log("PAGEERROR", e.message); fails++; });
  return p;
}
const txt = p => p.evaluate(() => document.body.innerText);
const waitText = async (p, s, ms = 15000) => { try { await p.waitForFunction(t => document.body.innerText.includes(t), s, { timeout: ms }); return true; } catch { console.log("--- page text:\n" + (await txt(p)).slice(0, 1500)); return false; } };

// 1. volunteer "me" page
let p = await ctx();
await p.goto(SITE + "/volunteer/me/");
await p.fill("#ph", "07700900555"); await p.fill("#pw", "volpass123"); await p.click("#lf button[type=submit]");
ok(await waitText(p, "你好，Siu Ming"), "volunteer logs in");
ok(await waitText(p, "11 小時"), "total 11 hours from two check-ins");
ok((await txt(p)).includes("金級義工證"), "tier = 金級義工證");
ok((await txt(p)).includes("再做 9 小時 就升到 白金義工證"), "progress to platinum");
ok((await txt(p)).includes("請先喺下面「個人資料」填好英文名同英文姓"), "certificate asks for full name first");
ok((await txt(p)).includes("Boardgame"), "recent sessions listed");
await p.screenshot({ path: "shots/me-1.png", fullPage: true });
await p.fill("#fn", "Tai Man"); await p.fill("#sn", "Chan"); await p.fill("#em", "tm@example.com"); await p.click("#pf button[type=submit]");
ok(await waitText(p, "已儲存"), "profile saved");
let pv = await dbGet(`shk/people/${V}`);
ok(pv.first === "Tai Man" && pv.surname === "Chan" && pv.email === "tm@example.com", "profile written to database");
ok(await waitText(p, "睇 / 下載證明"), "certificate button appears");
await p.fill("#cp", "wrongpass1"); await p.fill("#p1", "newpass456"); await p.fill("#p2", "newpass456"); await p.click("#pwf button[type=submit]");
ok(await waitText(p, "而家嘅密碼唔啱"), "wrong current password rejected");
await p.fill("#cp", "volpass123"); await p.fill("#p1", "newpass456"); await p.fill("#p2", "newpass456"); await p.click("#pwf button[type=submit]");
ok(await waitText(p, "密碼已更改"), "password changed");
await p.fill("#np", "07700900777"); await p.click("#phf button[type=submit]");
ok(await waitText(p, "已送出申請"), "phone change requested");
pv = await dbGet(`shk/people/${V}`);
ok(pv.phoneRequest && pv.phoneRequest.phone === NEW, "phoneRequest stored");

// rules checks as the volunteer
const res = await p.evaluate(async ({ V }) => {
  const db = firebase.database(), out = {};
  const t = async (k, f) => { try { await f(); out[k] = "allowed"; } catch (e) { out[k] = "denied"; } };
  await t("makeSelfAdmin", () => db.ref("shk/people/" + V + "/roles/admin").set(true));
  await t("approveSelfStatus", () => db.ref("shk/people/" + V + "/status").set("pending"));
  await t("readAllPeople", () => db.ref("shk/people").get());
  await t("readEvents", () => db.ref("shk/events").get());
  await t("readOthersAttendance", () => db.ref("shk/attendance").get());
  return out;
}, { V });
ok(res.makeSelfAdmin === "denied", "cannot make self admin");
ok(res.approveSelfStatus === "denied", "cannot change own status");
ok(res.readAllPeople === "denied", "cannot read everyone's profiles");
ok(res.readEvents === "allowed", "can read event list");
ok(res.readOthersAttendance === "denied", "cannot read all attendance");

// 2. certificate
await p.goto(SITE + "/volunteer/certificate/");
ok(await waitText(p, "確認證明信上嘅名字"), "certificate asks to confirm name");
ok((await txt(p)).includes("Tai Man Chan"), "confirm shows full name");
await p.click("#go");
await p.waitForSelector(".cert h1", { timeout: 15000 });
ok((await p.textContent(".cert")).includes("Throughout their time with us, Tai Man has been diligent"), "letter uses first name");
ok((await p.textContent(".cert")).includes("11 hours"), "letter shows hours");
ok((await p.textContent(".cert")).includes("Confirmation of Volunteer Service: Tai Man Chan") && !(await p.textContent(".cert")).includes("Gold"), "letter title, no tier");
await p.setViewportSize({ width: 1200, height: 900 });
await p.emulateMedia({ media: "print" });
await p.pdf({ path: "shots/certificate.pdf", format: "A4", landscape: false, printBackground: true, preferCSSPageSize: true });
await p.emulateMedia({ media: "screen" });
pv = await dbGet(`shk/people/${V}`);
ok(pv.cert && /^SHK-VC-2026-/.test(pv.cert.no) && pv.cert.name === "Tai Man Chan", "cert recorded " + JSON.stringify(pv.cert));
const lock = await p.evaluate(async V => { try { await firebase.database().ref("shk/people/" + V + "/first").set("Changed"); return "allowed"; } catch (e) { return "denied"; } }, V);
ok(lock === "denied", "full name locked after certificate");
const em = await p.evaluate(async V => { try { await firebase.database().ref("shk/people/" + V + "/email").set("x@y.com"); return "allowed"; } catch (e) { return "denied"; } }, V);
ok(em === "allowed", "email still editable after certificate");
await p.goto(SITE + "/volunteer/me/");
ok(await waitText(p, "英文全名唔可以再改"), "me page shows name locked");
ok(await p.$eval("#fn", e => e.readOnly), "first name field read-only");

// 3. admin moves the phone number
const a = await ctx();
await a.goto(SITE + "/admin/");
await a.fill("#ph", "07999000001"); await a.fill("#pw", "adminpass1"); await a.click("#lf button[type=submit]");
await a.waitForSelector('[data-act="tab"][data-v="people"]', { timeout: 15000 });
ok((await a.textContent('[data-act="tab"][data-v="people"]')).includes("1"), "people tab shows 1 request");
await a.click('[data-act="tab"][data-v="people"]');
ok(await waitText(a, "申請改電話"), "admin sees phone request");
ok(await waitText(a, "已發服務證明"), "admin sees certificate issued");
await a.screenshot({ path: "shots/admin-people.png", fullPage: true });
await a.click('[data-act="movephone"]'); await a.click('[data-act="movephone"]');
ok(await waitText(a, "已將 Siu Ming 轉去"), "admin move notice");
const s = await dbGet("shk");
ok(!s.people[V] && s.people[NEW] && s.people[NEW].first === "Tai Man" && s.people[NEW].cert && !s.people[NEW].uid && !s.people[NEW].phoneRequest, "profile moved to new number");
ok(s.attendance.e1[NEW] && !s.attendance.e1[V] && s.attendance.e2[NEW], "attendance moved");
ok(s.directory[NEW] && s.directory[NEW].imported === true && s.directory[NEW].claimed === false && !s.directory[V], "directory moved");
ok(!(s.uids || {})[Vuid], "old login unlinked");
const ord = await dbGet("ordering/roles");
ok(!(ord || {})[Vuid], "old café access removed");

// 4. volunteer activates with the new number
p = await ctx();
await p.goto(SITE + "/volunteer/join/");
await p.fill("#ph", "07700900777"); await p.click("#f1 button[type=submit]");
ok(await waitText(p, "搵到你嘅義工記錄"), "join finds moved record");
await p.fill("#p1", "freshpass9"); await p.fill("#p2", "freshpass9"); await p.check("#ok"); await p.click("#f2 button[type=submit]");
await p.waitForTimeout(3000);
await p.goto(SITE + "/volunteer/me/");
if (await p.$("#ph")) { await p.fill("#ph", "07700900777"); await p.fill("#pw", "freshpass9"); await p.click("#lf button[type=submit]"); }
ok(await waitText(p, "你好，Siu Ming"), "logs in with new number");
ok(await waitText(p, "11 小時"), "hours kept after number change");
ok((await txt(p)).includes("07700 900777"), "shows new number");
await p.screenshot({ path: "shots/me-after-move.png", fullPage: true });

// 5. admin unlocks name
await a.reload(); await a.waitForSelector('[data-act="tab"][data-v="people"]'); await a.click('[data-act="tab"][data-v="people"]');
await a.waitForSelector('[data-act="unlockcert"]'); await a.click('[data-act="unlockcert"]'); await a.click('[data-act="unlockcert"]');
await a.waitForTimeout(1000);
ok(!(await dbGet(`shk/people/${NEW}/cert`)), "admin unlock removes certificate lock");

// 6. sample page
await p.goto(SITE + "/volunteer/certificate/?sample");
ok(await waitText(p, "Tai Man Chan"), "sample certificate renders without login");

console.log(fails ? `\n${fails} FAILURES` : "\nALL PASSED");
await browser.close();
process.exit(fails ? 1 : 0);
