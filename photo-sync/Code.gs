/**
 * SHK event photos — bridge between Google Drive and the website's face-blur job.
 *
 * Folders (in salfordhongkongers@gmail.com Drive, "SHK 活動相 Event Photos"):
 *   SRC "1 原圖・未模糊（唔好分享）"  — upload originals here, one sub-folder per event, e.g. "2026-11-29 Boardgame"
 *   OUT "2 已模糊・可以公開"          — blurred copies appear here; whatever is in here is shown on the website
 *
 * The GitHub Action "Blur event photos" calls this web app every 30 minutes:
 *   list → get original → blurs faces on GitHub → put blurred copy into OUT → mark original as done.
 * Delete a photo from OUT and it disappears from the website on the next run.
 *
 * Setup (once): run setupToken() from the editor, then Deploy → New deployment → Web app,
 * Execute as: Me, Who has access: Anyone. Give the web app URL and the token from the log to GitHub secrets
 * PHOTO_API and PHOTO_TOKEN. The token lives only in Script Properties, never in the code.
 */
const SRC = '1Xf03UIQWkRixgIGcsgGEgOF4Hzj-wnxb';
const OUT = '1xsElt5OtZOM3tWygICXZJ_XqtzM8GwRj';

function setupToken() {
  const t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', t);
  Logger.log('PHOTO_TOKEN = ' + t);
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (x) {}
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || p.token !== token) return out_({ error: 'forbidden' });
  try { return out_(handle_(p)); } catch (err) { return out_({ error: String(err) }); }
}

function handle_(p) {
  switch (p.action) {
    case 'list': return { pending: walk_(SRC, true) };
    case 'published': return { files: walk_(OUT, false) };
    case 'get': return { data: Utilities.base64Encode(fileIn_(p.id, p.tree === 'out' ? OUT : SRC).getBlob().getBytes()) };
    case 'put': {
      const src = fileIn_(p.sourceId, SRC);
      const f = albumFolder_(p.album).createFile(Utilities.newBlob(Utilities.base64Decode(p.data), 'image/jpeg', p.name));
      f.setDescription('SHK-src:' + p.sourceId + (p.faces != null ? ' faces:' + p.faces : ''));
      src.setDescription('SHK-done:' + f.getId());
      return { id: f.getId() };
    }
    case 'fail':
      fileIn_(p.id, SRC).setDescription('SHK-error: ' + String(p.msg || '').slice(0, 200));
      return { ok: true };
  }
  throw new Error('unknown action');
}

/* every image under a folder; album = sub-folder path */
function walk_(rootId, pendingOnly) {
  const res = [];
  (function rec(folder, album) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next(), m = f.getMimeType();
      if (!/^image\//.test(m) || f.isTrashed()) continue;
      if (pendingOnly && /^SHK-(done|error)/.test(f.getDescription() || '')) continue;
      res.push({ id: f.getId(), name: f.getName(), album: album, mime: m, date: f.getDateCreated().toISOString(), size: f.getSize() });
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) { const s = subs.next(); rec(s, album ? album + ' / ' + s.getName() : s.getName()); }
  })(DriveApp.getFolderById(rootId), '');
  return res;
}

/* only hand out files that really sit inside our folder */
function fileIn_(id, rootId) {
  const f = DriveApp.getFileById(id), queue = [], seen = {};
  const ps = f.getParents(); while (ps.hasNext()) queue.push(ps.next());
  while (queue.length) {
    const p = queue.shift(), pid = p.getId();
    if (pid === rootId) return f;
    if (seen[pid]) continue; seen[pid] = 1;
    const up = p.getParents(); while (up.hasNext()) queue.push(up.next());
  }
  throw new Error('file is not in the photo folder');
}

function albumFolder_(album) {
  let f = DriveApp.getFolderById(OUT);
  (album ? album.split(' / ') : []).forEach(n => { const it = f.getFoldersByName(n); f = it.hasNext() ? it.next() : f.createFolder(n); });
  return f;
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
