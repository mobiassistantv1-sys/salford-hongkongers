// Pull the latest posts from the SHK Facebook Page into data/fb-feed.json
// (read by the "最新消息 / Latest news" section on index.html).
// Needs two GitHub repository secrets: FB_PAGE_ID and FB_PAGE_TOKEN (a Page access token).
// Without them the job exits quietly, so the workflow can sit here until the token exists.
import { readFile, writeFile } from "node:fs/promises";

const PAGE = process.env.FB_PAGE_ID;
const TOKEN = process.env.FB_PAGE_TOKEN;
const FILE = "data/fb-feed.json";
const REFRESH_MS = 2 * 24 * 3600 * 1000; // Facebook image links expire, so rewrite at least every 2 days

if (!PAGE || !TOKEN) {
  console.log("FB_PAGE_ID / FB_PAGE_TOKEN not set — skipping.");
  process.exit(0);
}

const url = `https://graph.facebook.com/${encodeURIComponent(PAGE)}/posts` +
  `?fields=message,created_time,permalink_url,full_picture&limit=12&access_token=${encodeURIComponent(TOKEN)}`;
const res = await fetch(url);
const body = await res.json().catch(() => ({}));
if (!res.ok || body.error) {
  console.error("Facebook Graph API error:", body.error?.message || `HTTP ${res.status}`);
  process.exit(1);
}

const posts = (body.data || [])
  .filter(p => p.message || p.full_picture)
  .slice(0, 6)
  .map(p => ({
    id: p.id,
    text: (p.message || "").slice(0, 500),
    image: p.full_picture || "",
    date: p.created_time,
    link: p.permalink_url,
  }));

let prev = null;
try { prev = JSON.parse(await readFile(FILE, "utf8")); } catch {}
const sameIds = prev && JSON.stringify((prev.posts || []).map(p => p.id + p.text)) === JSON.stringify(posts.map(p => p.id + p.text));
const fresh = prev?.updated && Date.now() - Date.parse(prev.updated) < REFRESH_MS;
if (sameIds && fresh) {
  console.log("No new posts.");
  process.exit(0);
}

await writeFile(FILE, JSON.stringify({ updated: new Date().toISOString(), posts }, null, 2) + "\n");
console.log(`Wrote ${posts.length} posts to ${FILE}.`);
