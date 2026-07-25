# 澄果團隊網站｜行情資料自動更新設定說明

你目前沒有任何 GitHub／伺服器環境，以下是從零開始、完全免費的設定步驟。

## 步驟

1. **註冊 GitHub 帳號**（如果還沒有）：https://github.com/signup
2. **建立一個新的 Repository**（儲存庫），例如取名 `chengguo-site`，設為 Public
3. 把這個資料夾（`chengguo-site/`）裡的所有檔案上傳到這個 Repository
   - 最簡單的方式：在 GitHub 網頁上點「Add file → Upload files」，把整個資料夾拖進去
4. 到 Repository 的 **Settings → Pages**，Source 選擇 `main` branch，儲存
   - 幾分鐘後，你的網站就會出現在 `https://<你的帳號>.github.io/chengguo-site/`
5. 到 Repository 的 **Actions** 分頁，你會看到「每日更新四大生活圈行情」這個工作流程
   - 預設每天台灣時間早上 7:00 自動執行
   - 也可以手動點 **Run workflow** 立刻執行一次，測試看看有沒有正確抓到資料

## 之後要調整生活圈範圍時

不用改程式碼，只要編輯 `config/areas.json` 裡的 `keywords`（路名關鍵字），
下次排程執行時就會用新的範圍重新計算。

## 檔案結構

```
chengguo-site/
├─ index.html                 首頁（React + Tailwind，透過 CDN 載入，免建置工具）
├─ config/areas.json          四大生活圈的行政區與路名關鍵字設定
├─ data/market-data.json      每日自動產生的行情資料（會被排程覆蓋）
├─ scripts/fetch-market-data.js   抓取與計算行情的腳本
└─ .github/workflows/update-market-data.yml   每日排程設定
```

## 已知限制（老實說明）

- 內政部實價登錄資料本身每月僅公告 1、11、21 日三次，「每日更新」指的是「每天自動檢查、有新資料才變動」，不是每天都有全新成交數字
- 四大生活圈的路名範圍是初步推測，樣本數可能偏少，畫面上會標示「樣本數偏少，僅供參考」
- 內政部下載連結格式若未來調整，`scripts/fetch-market-data.js` 裡的網址可能需要更新
