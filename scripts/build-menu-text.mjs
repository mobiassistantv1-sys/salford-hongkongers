// Writes a plain-text (crawlable) copy of the café menu into yauoicafe/menu/index.html,
// between the menu-text markers, so search engines and AI tools can read names, prices and allergens.
// Source of truth: yauoicafe/order/menu.js (items, allergens) + Firebase /ordering/public (Square prices, renamed items).
// If Firebase can't be reached, the file is left unchanged. If it has no Square prices, the menu.js prices are used,
// which is exactly what the live menu and QR ordering pages charge in that case.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const PAGE = "yauoicafe/menu/index.html";
const START = "<!-- menu-text:start -->", END = "<!-- menu-text:end -->";

const win = {};
vm.runInNewContext(readFileSync("yauoicafe/order/menu.js", "utf8"), { window: win });
const Y = win.YO;

let P;
try {
  const r = await fetch(Y.FIREBASE.databaseURL + "/ordering/public.json");
  if (!r.ok) throw new Error("HTTP " + r.status);
  P = (await r.json()) || {};
  // No Square sync yet: use the same fallback prices the live menu and ordering pages show (menu.js `p`).
  if (!P.prices || !P.prices.items) console.log("No Square prices in /ordering/public; using menu.js prices, same as the live site");
} catch (e) {
  console.log("Live prices unavailable, menu text not changed:", e.message);
  process.exit(0);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const money = p => "£" + (p / 100).toFixed(2);
const al = (codes, lang) => codes.length ? codes.map(c => Y.alName(c, lang)).join(lang === "en" ? ", " : "、") : (lang === "en" ? "none of the 14" : "冇 14 種過敏原");

const rows = [];
for (const c of Y.CATS) {
  const items = Y.MENU.filter(m => m.cat === c.id && !m.special);
  if (!items.length) continue;
  rows.push(`<h3>${esc(c.zh)} ${esc(c.en)}</h3>\n<ul>`);
  for (const m of items) {
    const codes = Y.lineAllergens(m.id, {});
    const more = Y.optionsAddAllergens(m);
    let line = `<li><b>${esc(Y.itemName(m, P, "zh"))} ${esc(Y.itemName(m, P, "en"))}</b> — ${money(Y.itemPrice(m, P, false))}`;
    if (m.d) line += `<br>${esc(m.d.zh)} ${esc(m.d.en)}`;
    if (m.g && m.g.indexOf("hot") >= 0 || m.g && m.g.indexOf("iced") >= 0) {
      const g = Y.G[m.g.indexOf("hot") >= 0 ? "hot" : "iced"];
      line += `<br>${g.choices.map(x => esc(x.zh) + " " + esc(x.en) + "（" + esc(al(x.al || [], "zh")) + "）").join("；")}`;
    }
    if (m.cat !== "drinks") {   // drinks: allergens are listed per drink above
      line += `<br>含 Contains: ${esc(al(codes, "zh"))} / ${esc(al(codes, "en"))}`;
      if (more) line += "（選項可能加過敏原 options may add more）";
    }
    rows.push(line + "</li>");
  }
  rows.push("</ul>");
}

const block = `${START}
<section class="menu-text" aria-labelledby="mt-h">
<h2 id="mt-h">全部餐牌（文字版）Full menu (text)</h2>
<p>價錢同落單系統一致，供應視乎當日。Prices match our ordering system; availability varies by day. 是日特別麵包每日更新 Daily special buns change each day.</p>
${rows.join("\n")}
</section>
${END}`;

const html = readFileSync(PAGE, "utf8");
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < a) throw new Error("menu-text markers missing in " + PAGE);
const out = html.slice(0, a) + block + html.slice(b + END.length);
if (out !== html) { writeFileSync(PAGE, out); console.log("menu text updated"); } else console.log("menu text unchanged");
