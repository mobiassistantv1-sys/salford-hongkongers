# 友愛冰室 QR 落單 + SHK 帳戶同義工打卡 — 上線設定指南

上線前跟以下步驟做，大約 45 分鐘。全部喺 Firebase、Google Apps Script 同 GitHub 網頁度撳，唔使寫 code。
Firebase 專案用排隊系統嗰個：**yauoicafequeue**。

| 頁面 | 網址 | 邊個用 |
|---|---|---|
| 客人落單 | `salfordhongkongers.co.uk/qr/T1` … `/qr/T9`、`/qr/TA`（外賣） | 客人 scan 枱上 QR |
| 冰室後台 | `salfordhongkongers.co.uk/staff/` | 冰室員工、經理（個人帳戶登入） |
| 義工打卡 | `salfordhongkongers.co.uk/volunteer/` | 義工（scan 活動 QR） |
| 登記／啟用帳戶 | `salfordhongkongers.co.uk/volunteer/join/` | 所有人第一次用 |
| SHK 管理 | `salfordhongkongers.co.uk/admin/` | Manson（批核、設層級、開活動 QR） |

**一個帳戶，兩邊通用。** 每人用自己 WhatsApp 號碼 + 自己密碼登入。義工、冰室員工、冰室經理、管理員係同一個帳戶上面開關嘅層級，喺 `/admin/` 設定。
客人頁冇任何後台連結。所有權限由 Firebase 伺服器端規則控制，唔係靠隱藏掣。

---

## 1. 開啟登入方式
Firebase Console → yauoicafequeue → **Authentication** → Sign-in method：
- 開啟 **Anonymous**（客人落單用，客人唔使登入）
- 開啟 **Email/Password**（所有個人帳戶用；系統自動將電話號碼轉做登入電郵，唔會寄信）

## 2. 改資料庫規則（最重要）
Realtime Database → **Rules**。
1. **先複製現有規則，另外儲存一份備份。** 排隊系統（`queue`、`counter`）正在用緊現有規則，唔可以刪。
2. 打開 `database.rules.json`，將入面 `"ordering": { … }` 同 `"shk": { … }` 兩大段加入現有 `"rules"` 入面，同 `queue` 並排。
3. 撳 **Publish**。

改完用 **Rules Playground** 試：

| 模擬 | 位置 | 預期 |
|---|---|---|
| 未登入，Read | `/ordering/orders` | ❌ Denied |
| 未登入，Read | `/ordering/public` | ✅ Allowed |
| 未登入，Read | `/shk/people` | ❌ Denied（個人資料） |
| 未登入，Read | `/shk/eventTokens` | ❌ Denied（打卡碼） |

（第 3 步開好自己帳戶之後，再用自己 UID 試 `/shk/people` 應該 ✅ Allowed。）

## 3. 開你自己嘅管理員帳戶
1. 手機開 `salfordhongkongers.co.uk/volunteer/join/`，輸入你 WhatsApp 號碼，填名、設密碼，提交。
2. Firebase → Authentication → Users，抄低你嘅 **User UID**；電郵開頭嗰串數字就係你嘅「電話 ID」（例如 `447123456789`）。
3. Realtime Database → Data，手動加：
   - `shk` → `admins` → `<你嘅 UID>`: `true`
   - `shk` → `people` → `<電話 ID>` → `status`: `active`
   - `shk` → `people` → `<電話 ID>` → `roles` → `admin`: `true`、`volunteer`: `true`、`cafe`: `manager`
   - `ordering` → `roles` → `<你嘅 UID>`: `manager`
4. 開 `/admin/` 用電話 + 密碼登入，見到「SHK 管理」就成功。之後所有人嘅層級都喺呢度設，唔使再入 Firebase。

## 4. 設定 QR 碼、限量數字
Realtime Database → Data → 喺根目錄撳 ⋮ → **Import JSON** 只會覆蓋成個資料庫，**唔好用**。改為：
1. 喺 `ordering` 加 `qrTokens`，內容跟 Claude 另外俾你嘅 `qrTokens.json`（10 個隨機碼，同已經整好嘅 QR 卡一致）
2. 喺 `ordering` → `public` 加 `stock`：`pineapple: 0`、`cocktail: 0`、`sausage: 0`、`eggtart: 0`

> `qrTokens.json` 唔可以放入 GitHub（呢個 repo 係公開嘅）。

## 4b. 義工資料同 Google Sheet 同步（Apps Script）
用**同時擁有義工 Sheet 同 Firebase 專案嘅 Google 帳戶**做：
1. 開 `script.google.com` → **New project**，改名「SHK 義工同步」。
2. 將 `volunteer-sync/Code.gs` 成個貼入 `Code.gs`。
3. Project Settings → 剔 **Show "appsscript.json" manifest file**，再將 `volunteer-sync/appsscript.json` 貼入去。
4. 喺上面揀 function 再撳 **Run**，順序：
   - `importVolunteers` — 第一次會叫你批准權限。完成後 Execution log 會列出冇電話或者重複電話嘅人，要手動補。
   - `pushCategories` — 將活動類別帶入管理頁。
   - `setupHourlyTrigger` — 之後每個鐘自動同步，同埋每日凌晨 3 點自動清理（私隱政策第 6 條）：刪除前一日嘅排隊記錄；30 日前嘅冰室訂單清走名、過敏備註同其他備註，訂單內容同收款保留。
5. 如果 `importVolunteers` 出 401／403 錯誤：Firebase → Project settings → Users and permissions，確認呢個 Google 帳戶係 Owner 或 Editor。仲唔得就話 Claude 知，改用 service account。

同步做咩：
- 活動喺 `/admin/` 撳「結束打卡」之後，一個鐘內寫入 Sheet 年份分頁（每個時段一行，名放 Names 欄），同新分頁 **打卡明細**（每人一行，有實際上落班時間）。
- 新批核嘅義工自動加入「義工資料」，用下一個編號。
- 「時數」分頁嘅總數同最近記錄會顯示喺義工自己嘅打卡頁。
- 已同步嘅活動「重新開放」再結束，會取代舊行，唔會重複。

## 5. Square 價錢自動同步
GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**，加 3 個：

| Secret 名 | 內容 | 喺邊度攞 |
|---|---|---|
| `SQUARE_ACCESS_TOKEN` | Square production access token | Square Developer Dashboard → 你個 app → Credentials。建議開一個只有 **ITEMS_READ** 權限嘅 token |
| `FIREBASE_SERVICE_ACCOUNT` | 成個 JSON 檔案內容 | Firebase → Project settings → Service accounts → Generate new private key |
| `FIREBASE_DB_URL` | `https://yauoicafequeue-default-rtdb.europe-west1.firebasedatabase.app` | — |

加好之後：Actions → **Sync Square prices to QR menu** → Run workflow。綠剔就代表成功。
之後逢星期五至日 07:00–14:30（UTC）每 30 分鐘自動同步。喺 Square 改價，最遲半個鐘就會更新；急嘅話手動 Run 一次。

## 6. 合併上線
GitHub 上面嘅 Pull Request 撳 **Merge**，大約 1 分鐘後網站就會更新。

## 7. 上線測試（全部過先開始用）
1. 後台：用平板開 `/staff/`，用你個人帳戶登入，撳「開啟新單響鈴」。
2. 「今日供應」：菠蘿包 +8。
3. 用手機 scan **T3** QR，叫 1 份全日早餐加 1 個菠蘿油，再提交。
4. 平板應該響鈴、閃紅，顯示 T3；菠蘿包變成 7 個。
5. 「埋單」揀 T3，喺 Square POS 用自訂金額收錢，再撳「卡已收」。T3 會變返空枱。
6. 「日結」應該見到啱啱嗰筆錢，同埋係你名收嘅。
7. 用手機開 `/staff/`，用錯密碼試，應該入唔到。
8. 義工打卡：`/admin/` → 活動打卡 → 開一個測試活動 → 用另一部手機 scan 張 QR → 登入 → 上班打卡 → 落班打卡。
9. `/admin/` 撳「結束打卡」，喺 Apps Script 手動 Run `syncAll`，Sheet 應該見到新行同「打卡明細」。測試完喺 Sheet 刪咗嗰幾行，再喺 `/admin/` 刪測試活動嘅打卡記錄。

---

### 員工同義工點開帳戶
- 叫佢開 `/volunteer/join/` 輸入 WhatsApp 號碼。舊義工會自動搵到記錄，只需要設密碼；新人要填名，等你喺 `/admin/` → 等待批核 批准。
- 冰室員工：喺 `/admin/` → 人員 → 搵佢 → 撳「冰室員工」或「冰室經理」。
- 唔記得密碼：`/admin/` → 人員 → 搵佢 → 「重設帳戶」（撳兩下確認），佢再用同一個號碼去 `/volunteer/join/` 設新密碼。舊記錄同時數唔會冇。
- 有人走咗：撳「停用」，即刻入唔到冰室後台同打唔到卡。

### 每日點用
- **開店**：平板開 `/staff/` → 登入 → 撳「開啟新單響鈴」→ 保持屏幕開住同插住電。
- **出爐**：「今日供應」撳 +4、+8、+12。
- **缺貨**：「餐牌」撳「售罄」；冇某樣跟配就去「今日供應」→「選項上下線」。
- **活動**：開活動前喺 `/admin/` → 活動打卡 開新活動 → 印 QR 或者用平板顯示。完咗撳「結束打卡」，有人未落班會提你補打。
- **埋單**：喺 Square POS 用「自訂金額」收錢，收完先喺後台撳「現金已收」或「卡已收」。
- **收工**：經理睇「日結」，同 Square 當日總數對數。

### 已知限制（第一版）
- 打印機未接駁：新單喺平板顯示同響鈴。打印機到咗再加 CloudPRNT。
- 收錢喺 Square POS 用自訂金額，所以 Square 報表冇逐項餐點；逐項記錄喺後台「日結」。
- 加菜式、改選項要改 `order/menu.js`，叫 Claude 或者 Ivan 改。
- 知道某位舊義工電話嘅人，可以喺佢本人之前搶先啟用佢帳戶。如果有人話「已經登記咗」但佢冇整過，用「重設帳戶」再叫佢重新設定。
- `forms.html` 嗰個義工登記表格仍然係舊 Google Form 版本，未轉過嚟。
