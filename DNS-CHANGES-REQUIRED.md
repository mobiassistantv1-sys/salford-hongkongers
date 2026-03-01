# DNS Changes Required for salfordhongkongers.co.uk

## 需要在 GoDaddy DNS 後台執行以下變更

### 1. 修改 SPF 記錄（TXT 記錄）
**現有值（錯誤）：** v=spf1 include:secureserver.net -all
**正確值：** v=spf1 include:spf.protection.outlook.com -all
**原因：** 網站使用 Microsoft 365 郵件，但 SPF 仍指向 GoDaddy，導致郵件可能被標為垃圾郵件

### 2. 新增 DMARC 記錄（TXT 記錄）
**記錄名稱：** _dmarc.salfordhongkongers.co.uk
**值：** v=DMARC1; p=quarantine; rua=mailto:salfordhongkongers@gmail.com; ruf=mailto:salfordhongkongers@gmail.com; fo=1; pct=100
**原因：** 防止任何人偽冒 @salfordhongkongers.co.uk 發送釣魚郵件

### 3. 新增 CAA 記錄
**記錄名稱：** salfordhongkongers.co.uk
**值：** 0 issue "letsencrypt.org"
**原因：** 限制只有 Let's Encrypt 可為此域名簽發 SSL 憑證，防止惡意 CA 冒簽

### 4. GitHub Pages Enforce HTTPS
請前往以下連結手動勾選：
https://github.com/mobiassistantv1-sys/salford-hongkongers/settings/pages
在「Enforce HTTPS」選項打勾

---
更新日期：2026-02-28
由 Nebula 安全審查生成