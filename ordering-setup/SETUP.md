# 友愛冰室 QR 落單 — 上線設定指南

上線前要做 7 步，大約 30 分鐘。全部喺 Firebase 同 GitHub 網頁度撳，唔使寫 code。
Firebase 專案用排隊系統嗰個：**yauoicafequeue**。

| 頁面 | 網址 | 邊個用 |
|---|---|---|
| 客人落單 | `salfordhongkongers.co.uk/qr/T1` … `/qr/T9`、`/qr/TA`（外賣） | 客人 scan 枱上 QR |
| 後台 | `salfordhongkongers.co.uk/staff/` | 經理、員工（要登入） |

客人頁冇任何後台連結。後台權限由 Firebase 伺服器端規則控制，唔係靠隱藏掣。

---

## 1. 開啟登入方式
Firebase Console → yauoicafequeue → **Authentication** → Sign-in method：
- 開啟 **Anonymous**（客人落單用，客人唔使登入）
- 開啟 **Email/Password**（經理同員工用）

## 2. 開兩個後台帳戶（密碼決定登入層級）
後台登入頁只有一格「密碼」。輸入經理密碼就係經理身份，輸入員工密碼就係員工身份。

Authentication → Users → Add user：

| 身份 | 電郵（一定要一模一樣） | 密碼 |
|---|---|---|
| 經理 | `cafe-manager@salfordhongkongers.co.uk` | 經理專用密碼 |
| 員工 | `cafe-staff@salfordhongkongers.co.uk` | 員工共用密碼，**一定要同經理唔同** |

- 呢兩個電郵唔會收信，只係用嚟登入。開好之後，抄低兩個帳戶嘅 **User UID**。
- 密碼最少 6 個字（Firebase 要求），建議 10 個字以上，夾雜英文同數字。呢個 repo 係公開嘅，任何人都可以試撞密碼，太短會易估。
- **密碼唔好寫入 GitHub 或者任何公開地方。**
- 改密碼：Authentication → Users → 揀帳戶 → ⋮ → Reset password。員工離職就換員工密碼。

## 3. 改資料庫規則（最重要）
Realtime Database → **Rules**。
1. **先複製現有規則，另外儲存一份備份。** 排隊系統（`queue`、`counter`）正在用緊現有規則，唔可以刪。
2. 打開 `database.rules.ordering.json`，將入面 `"ordering": { … }` 成段加入現有 `"rules"` 入面，同 `queue` 並排。
3. 撳 **Publish**。

改完用 **Rules Playground** 試以下 4 個情況：

| 模擬 | 位置 | 預期 |
|---|---|---|
| 未登入，Read | `/ordering/orders` | ❌ Denied |
| 未登入，Read | `/ordering/public` | ✅ Allowed |
| Authenticated，UID = 員工 UID，Read | `/ordering/payments` | ❌ Denied（員工睇唔到營業額） |
| Authenticated，UID = 經理 UID，Read | `/ordering/payments` | ✅ Allowed |

## 4. 設定權限、QR 碼、限量數字
Realtime Database → Data → 喺根目錄撳 ⋮ → **Import JSON** 只會覆蓋成個資料庫，**唔好用**。改為：
1. 喺根目錄加 `ordering` → `roles`，入面加兩行：`<經理 UID>`: `manager`、`<員工 UID>`: `staff`
2. 喺 `ordering` 加 `qrTokens`，內容跟 Claude 另外俾你嘅 `qrTokens.json`（10 個隨機碼，同已經整好嘅 QR 卡一致）
3. 喺 `ordering` → `public` 加 `stock`：`pineapple: 0`、`cocktail: 0`、`sausage: 0`、`eggtart: 0`

> `qrTokens.json` 唔可以放入 GitHub（呢個 repo 係公開嘅）。

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
1. 後台：用平板開 `/staff/`，輸入員工密碼登入（頂部會顯示「員工」），撳「開啟新單響鈴」。
2. 「今日供應」：菠蘿包 +8。
3. 用手機 scan **T3** QR，叫 1 份全日早餐加 1 個菠蘿油，再提交。
4. 平板應該響鈴、閃紅，顯示 T3；菠蘿包變成 7 個。
5. 「埋單」揀 T3，喺 Square POS 用自訂金額收錢，再撳「卡已收」。T3 會變返空枱。
6. 登出，輸入經理密碼登入（頂部顯示「經理」），「日結」應該見到啱啱嗰筆錢。
7. 用手機開 `/staff/`，用錯密碼試，應該入唔到。

---

### 每日點用
- **開店**：平板開 `/staff/` → 輸入員工密碼 → 撳「開啟新單響鈴」→ 保持屏幕開住同插住電。
- **出爐**：「今日供應」撳 +4、+8、+12。
- **缺貨**：「餐牌」撳「售罄」；冇某樣跟配就去「今日供應」→「選項上下線」。
- **埋單**：喺 Square POS 用「自訂金額」收錢，收完先喺後台撳「現金已收」或「卡已收」。
- **收工**：經理睇「日結」，同 Square 當日總數對數。

### 已知限制（第一版）
- 打印機未接駁：新單喺平板顯示同響鈴。打印機到咗再加 CloudPRNT。
- 收錢喺 Square POS 用自訂金額，所以 Square 報表冇逐項餐點；逐項記錄喺後台「日結」。
- 加菜式、改選項要改 `order/menu.js`，叫 Claude 或者 Ivan 改。
