/**
 * 友愛冰室 — 每日日結 Google Doc（Daily takings report）
 *
 * Runs as its own Apps Script project under salfordhongkongers@gmail.com (owner of Firebase
 * project yauoicafequeue). No keys: it uses that account's own sign-in, like volunteer-sync/.
 *
 * Run once from the editor:  setup()   → makes the Drive folder + a daily ~23:59 trigger
 * Any time:                  reportToday()  or  reportFor('2026-11-05')
 *
 * Each report = one Google Doc "友愛冰室 日結 YYYY-MM-DD" in folder "友愛冰室 日結 Daily Takings":
 *   1. 總結：已收（現金／卡）、折扣、餐點總額、未埋單
 *   2. 每款餐點：數量、銀碼（按分類，包括加配；已取消嘅唔計）
 *   3. 收款記錄：時間、枱、方式、金額、折扣、經手人
 * Prices are worked out with the same menu.js as the website and staff page,
 * so the Doc matches the staff page 日結 to the penny. Re-running a day replaces that day's Doc.
 */

const DB = 'https://yauoicafequeue-default-rtdb.europe-west1.firebasedatabase.app';
const MENU_URL = 'https://salfordhongkongers.co.uk/yauoicafe/order/menu.js';
const TZ = 'Europe/London';
const FOLDER_NAME = '友愛冰室 日結 Daily Takings';

function fb_(path) {
  const res = UrlFetchApp.fetch(DB + '/' + path + '.json', {
    muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  if (res.getResponseCode() >= 300) throw new Error('GET /' + path + ' → ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText() || 'null');
}

/* Load the live menu.js (same code the website runs) */
function menu_() {
  const src = UrlFetchApp.fetch(MENU_URL).getContentText();
  const window = {};
  new Function('window', src)(window);   // menu.js only defines window.YO; no network or DOM use
  return window.YO;
}

const money_ = p => '£' + ((p || 0) / 100).toFixed(2);
const hhmm_ = ms => ms ? Utilities.formatDate(new Date(ms), TZ, 'HH:mm') : '--:--';
const tableLabel_ = t => t && t.indexOf('W') === 0 ? '外賣 ' + t : (t || '?');

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function setup() {
  const f = folder_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'reportToday').forEach(t => ScriptApp.deleteTrigger(t));
  /* Apps Script runs a daily trigger within ±15 min of nearMinute, so it can land just after midnight */
  ScriptApp.newTrigger('reportToday').timeBased().atHour(23).nearMinute(59).everyDays(1).inTimezone(TZ).create();
  Logger.log('OK：資料夾「' + FOLDER_NAME + '」 ' + f.getUrl() + '；每晚大約 23:59 自動出日結。');
}

/* "Today" = the trading day: before 06:00 still counts as the previous day (trigger may run at 00:10). */
function reportToday() { reportFor(Utilities.formatDate(new Date(Date.now() - 6 * 3600e3), TZ, 'yyyy-MM-dd')); }

function reportFor(day) {
  const Y = menu_();
  const P = fb_('ordering/public') || {};
  const orders = fb_('ordering/orders/' + day) || {};
  const pays = Object.values(fb_('ordering/payments/' + day) || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
  if (!Object.keys(orders).length && !pays.length) { Logger.log(day + '：冇訂單，唔出日結。'); return; }

  /* per item: qty + amount (same pricing as staff page: Y.mkLine with Square prices in P) */
  const sold = {}; let gross = 0, unpaid = 0, nOrders = 0; const cancelled = [];
  Object.keys(orders).forEach(id => {
    const o = orders[id]; nOrders++; let oTotal = 0;
    (o.lines || []).forEach(l => {
      const it = Y.byId[l.itemId]; if (!it) return;
      const qty = Math.max(1, Math.min(50, l.qty | 0));
      const ln = Y.mkLine(l.itemId, qty, l.sel || {}, P);
      if (l.x) { cancelled.push(tableLabel_(o.table) + ' ' + Y.itemName(it, P, 'zh') + ' ×' + qty); return; }
      const amt = ln.unit * qty; oTotal += amt;
      const s = sold[l.itemId] = sold[l.itemId] || { qty: 0, amt: 0 };
      s.qty += qty; s.amt += amt;
    });
    gross += oTotal; if (!o.paid) unpaid += oTotal;
  });
  const cash = pays.filter(p => p.m === 'cash').reduce((a, p) => a + (p.amt || 0), 0);
  const card = pays.filter(p => p.m === 'card').reduce((a, p) => a + (p.amt || 0), 0);
  const disc = pays.reduce((a, p) => a + (p.discAmt || 0), 0);
  const gap = gross - unpaid - disc - (cash + card);   /* should be 0; non-zero = changed after payment */

  /* build the Doc (replace an earlier one for the same day) */
  const folder = folder_(), name = '友愛冰室 日結 ' + day;
  const old = folder.getFilesByName(name); while (old.hasNext()) old.next().setTrashed(true);
  const doc = DocumentApp.create(name); DriveApp.getFileById(doc.getId()).moveTo(folder);
  const b = doc.getBody(); b.clear();
  b.appendParagraph(name).setHeading(DocumentApp.ParagraphHeading.TITLE);
  b.appendParagraph('自動產生 ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') + '。請同 Square 當日總數對數。').setItalic(true);

  b.appendParagraph('總結 Summary').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const sum = [['項目', '銀碼'],
    ['現金 Cash', money_(cash)], ['卡 Card', money_(card)], ['已收合共 Total taken', money_(cash + card)],
    ['折扣 Discounts', money_(disc)], ['餐點總額（未扣折扣）Gross', money_(gross)],
    ['未埋單 Unpaid', money_(unpaid)], ['訂單數 Orders', String(nOrders)]];
  if (gap) sum.push(['⚠ 差額（埋單後有改動，請核對）', money_(gap)]);
  table_(b, sum, [1]);

  b.appendParagraph('每款餐點 Items sold').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  b.appendParagraph('包括未埋單；銀碼已計加配（例如凍飲、多士、烘底），未扣折扣。');
  Y.CATS.forEach(cat => {
    const items = Y.MENU.filter(m => m.cat === cat.id && sold[m.id]).sort((a, z) => sold[z.id].amt - sold[a.id].amt);
    if (!items.length) return;
    b.appendParagraph(cat.zh + ' ' + cat.en).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const rows = [['餐點', '數量', '銀碼']];
    let q = 0, a = 0;
    items.forEach(m => { rows.push([Y.itemName(m, P, 'zh') + ' ' + Y.itemName(m, P, 'en'), String(sold[m.id].qty), money_(sold[m.id].amt)]); q += sold[m.id].qty; a += sold[m.id].amt; });
    rows.push(['小計', String(q), money_(a)]);
    table_(b, rows, [1, 2], true);
  });

  b.appendParagraph('收款記錄 Payments').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const pr = [['時間', '枱', '方式', '金額', '折扣', '經手']];
  pays.forEach(p => pr.push([hhmm_(p.at), tableLabel_(p.table), p.m === 'cash' ? '現金' : '卡', money_(p.amt),
    p.disc ? p.disc + '% −' + money_(p.discAmt) + (p.discNote ? '（' + p.discNote + '）' : '') : '—', p.byName || (p.by === 'manager' ? '經理' : '員工')]));
  if (pays.length) table_(b, pr, [3]); else b.appendParagraph('今日未有收款記錄。');

  if (cancelled.length) {
    b.appendParagraph('已取消 Cancelled').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    cancelled.forEach(c => b.appendListItem(c));
  }
  doc.saveAndClose();
  Logger.log('日結完成：' + doc.getUrl());
}

/* table with bold header, right-aligned money/number columns, optional bold last row */
function table_(body, rows, rightCols, boldLast) {
  const t = body.appendTable(rows);
  for (let r = 0; r < t.getNumRows(); r++) {
    const row = t.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      if (rightCols.indexOf(c) >= 0) cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      if (r === 0 || (boldLast && r === t.getNumRows() - 1)) cell.editAsText().setBold(true);
    }
  }
  return t;
}
