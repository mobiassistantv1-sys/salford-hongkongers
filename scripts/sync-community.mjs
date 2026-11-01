// Daily (12:00 UK time) pull of public Salford community information into data/community.json,
// read by /info/. Headlines, short excerpts and links only — every item links back to its source.
// Sources (all public, no keys needed):
//   council  Salford City Council news RSS        https://news.salford.gov.uk/news/rss
//   events   Salford Community Leisure + Salford Museum events (WordPress REST API)
//   cvs      Salford CVS news RSS (voluntary & community sector)
//   hk       GOV.UK news mentioning Hong Kong / BN(O)
//   warnings Met Office weather warnings, North West England
// A source that fails keeps its previous items, so one broken site never empties the page.
import { readFile, writeFile } from "node:fs/promises";

const FILE = "data/community.json";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const london = (d = new Date()) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d)
  .reduce((o, p) => (o[p.type] = p.value, o), {});

let prev = {};
try { prev = JSON.parse(await readFile(FILE, "utf8")); } catch {}

// Scheduled runs fire at 11:07 and 12:07 UTC so one of them is 12:07 UK time in both GMT and BST.
if (process.env.GITHUB_EVENT_NAME === "schedule") {
  const now = london();
  const today = `${now.year}-${now.month}-${now.day}`;
  const last = prev.updated ? (p => `${p.year}-${p.month}-${p.day}`)(london(new Date(prev.updated))) : "";
  if (Number(now.hour) < 12 || last === today) { console.log(`Not 12:00 UK yet or already updated today (${today}) — skipping.`); process.exit(0); }
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = s => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = (s, max = 170) => {
  let t = decode(decode(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "…" : t;
};
const tag = (xml, name) => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i")) || [])[1] || "";
const iso = s => { const t = Date.parse(String(s).trim().replace(/^\w+,\s*/, "")); return isNaN(t) ? null : new Date(t).toISOString(); };

async function get(url, type = "text") {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/xml,application/json,text/html;q=0.9,*/*;q=0.8", "Accept-Language": "en-GB" }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return type === "json" ? res.json() : res.text();
}
function rss(xml, source, n) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]).map(it => ({
    title: clean(tag(it, "title"), 140), text: clean(tag(it, "description")),
    link: decode(tag(it, "link")).trim(), date: iso(tag(it, "pubDate")), source,
  })).filter(i => i.title && /^https:\/\//.test(i.link)).slice(0, n);
}
function atom(xml, source) {
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]).map(e => ({
    title: clean(tag(e, "title"), 140), text: clean(tag(e, "summary")),
    link: (e.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "", date: iso(tag(e, "updated")), source,
  })).filter(i => i.title && /^https:\/\//.test(i.link));
}
async function wpEvents(base, source) {
  const list = await get(`${base}/wp-json/wp/v2/event?per_page=12&_fields=link,title,excerpt,date_gmt`, "json");
  return list.map(e => ({ title: clean(e.title?.rendered, 140), text: clean(e.excerpt?.rendered), link: e.link, date: e.date_gmt ? e.date_gmt + "Z" : null, source }))
    .filter(i => i.title && /^https:\/\//.test(i.link));
}
const dedupe = list => { const seen = new Set(); return list.filter(i => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };
const newest = (a, b) => (b.date || "").localeCompare(a.date || "");

const sources = {
  council: async () => rss(await get("https://news.salford.gov.uk/news/rss"), "Salford City Council", 8),
  events: async () => {
    const parts = await Promise.allSettled([
      wpEvents("https://salfordcommunityleisure.co.uk", "Salford Community Leisure"),
      wpEvents("https://salfordmuseum.com", "Salford Museum & Art Gallery"),
    ]);
    const ok = parts.filter(p => p.status === "fulfilled").flatMap(p => p.value);
    if (!ok.length) throw new Error(parts.map(p => p.reason?.message).join("; "));
    return dedupe(ok.sort(newest)).slice(0, 8);
  },
  cvs: async () => rss(await get("https://salfordcvs.co.uk/rss.xml"), "Salford CVS", 5),
  hk: async () => atom(await get("https://www.gov.uk/search/news-and-communications.atom?keywords=%22Hong+Kong%22&order=updated-newest"), "GOV.UK")
    .filter(i => /hong\s?kong|bn\(o\)|british national \(overseas\)/i.test(i.title + " " + i.text)).slice(0, 4),
  warnings: async () => rss(await get("https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/nw"), "Met Office", 5),
};

const out = { updated: new Date().toISOString() };
let okCount = 0;
for (const [key, fn] of Object.entries(sources)) {
  try { out[key] = await fn(); okCount++; console.log(`${key}: ${out[key].length} items`); }
  catch (e) { out[key] = prev[key] || []; console.error(`${key}: FAILED (${e.message}) — kept ${out[key].length} previous items`); }
}
if (!okCount) { console.error("Every source failed — leaving the file unchanged."); process.exit(1); }
await writeFile(FILE, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${FILE}`);
