# 澄果團隊網站

網址：https://twhouse416.github.io/chengguo-site/

---

## ⚠️ 這兩個檔案絕對不要用上傳覆蓋

| 檔案 | 誰在維護 | 覆蓋的後果 |
|---|---|---|
| `data/market-data.json` | GitHub Actions 每天自動更新 | 行情變回示意假資料，要到 Actions 手動重跑 |
| `data/articles.json` | 你在後台編輯 | 已發布的文章全變回草稿，內容遺失 |

批次上傳檔案時，**若清單中出現這兩個，請取消勾選不要上傳**。

### 萬一被覆蓋了怎麼救

**行情資料**：Actions → 「每日更新四大生活圈行情」→ Run workflow，跑完就恢復。

**文章**：兩種方式
1. 後台 →「備份紀錄」→ 找到時間點 → 還原（最快，但只限同一台電腦的瀏覽器）
2. GitHub 檔案歷史復原：開啟 `https://github.com/twhouse416/chengguo-site/commits/main/data/articles.json`，
   找到覆蓋**之前**那一筆（訊息通常是「更新文章 YYYY-MM-DD」），點 `<>` 檢視當時檔案，
   **先用 Ctrl+F 搜尋你文章的標題確認版本正確**，再點 Raw 複製內容貼回。

---

## 檔案結構

```
chengguo-site/
├─ index.html                     首頁
├─ admin/index.html               文章後台（寫文章、發布）
├─ notes/
│  ├─ index.html                  文章列表
│  └─ article.html                文章內頁（?slug=文章代號）
├─ tools/
│  ├─ school-zone/                學區查詢
│  ├─ mortgage/                   房貸試算
│  ├─ qingan/                     新青安 3.0 試算
│  └─ property-tax/               房地合一稅試算
├─ assets/
│  └─ articles/                  文章用圖（後台上傳會放這裡）
├─ config/areas.json              四大生活圈路名設定
├─ data/
│  ├─ market-data.json            行情資料（每日自動更新）
│  ├─ school-zones.json           學區資料
│  └─ articles.json               文章內容
├─ scripts/
│  ├─ fetch-market-data.js        抓取實價登錄
│  └─ check-articles.js           檢查文章時效
└─ .github/workflows/
   ├─ update-market-data.yml      每日更新行情
   └─ check-articles.yml          每月檢查文章時效
```

## 寫新文章

開 https://twhouse416.github.io/chengguo-site/admin/

1. 按「＋ 寫新文章」
2. 填標題、摘要、分類，用下方按鈕加入段落／小標／表格等區塊
3. 右邊即時預覽
4. 按「完成」回到列表
5. **要讓修改生效，必須擇一：**
   - 已設定權杖 → 按「發布設定 → 發布到網站」
   - 沒設定權杖 → 按「下載」，把 articles.json 上傳到 GitHub 的 data 資料夾覆蓋原檔

在後台的編輯只存在瀏覽器裡，沒有發布或下載就會消失。

### 備份

每次開啟後台、發布前、下載前，系統都會自動存一份到瀏覽器，最多保留 10 份。
點右上角「備份紀錄」可以查看並一鍵還原。

備份只存在這台電腦的這個瀏覽器，換電腦或清除瀏覽資料就會消失。重要版本建議另外按「下載」保存檔案。

### 關於 GitHub 權杖

到 https://github.com/settings/personal-access-tokens/new 建立 Fine-grained token：
- Repository access → Only select repositories → chengguo-site
- Permissions → Repository permissions → Contents → Read and write

權杖只存在瀏覽器分頁，關掉就清除。不要在公用電腦使用。

### 加圖片

文章可以有封面圖，內文也可以插圖。

**有設定權杖**：在後台直接按「選擇圖片」，會自動壓縮（寬 1600px）並上傳到 `assets/articles/`。

**沒有權杖**：先自己把圖片放到 GitHub 的 `assets/articles/` 資料夾，再到後台的路徑欄位填 `assets/articles/檔名.jpg`。

記得填「替代文字」，這是給看不到圖片的人和搜尋引擎看的。

### 排程顯示

每個區塊都可以設「起始日／結束日」，用來做時間到自動換內容。
例如政策上路前後要講不同的話，就寫兩段，一段設結束日、一段設起始日為同一天。

## 行情資料

每天台灣時間早上 7:00 自動抓取內政部實價登錄，計算四大生活圈的均價與價格帶。
內政部資料每月僅公告 1、11、21 日三次，所以不是每天都會有新數字。

要調整生活圈範圍，編輯 `config/areas.json` 的 `keywords`（路名關鍵字），不用改程式碼。

## 文章時效

每月 1 號自動檢查有沒有文章超過 `reviewBy` 日期，有的話會在 GitHub 開 issue 提醒。
超過期限的文章，頁面上會自動顯示「內容可能已不是最新狀況」的提醒。

## 已知限制

- 內政部實價登錄下載連結若變更，`scripts/fetch-market-data.js` 需更新
- 學區資料僅收錄鼓山、左營、三民三區的國小，需手動更新學年度
- 後台必須透過網址開啟，不能直接雙擊本機檔案
