# 澄果團隊網站

網址：https://twhouse416.github.io/chengguo-site/

---

## ⚠️ 這些檔案是自動產生的，不要直接編輯

`index.html`、`notes/*.html`、`videos/index.html`、`sitemap.xml`
都由 `scripts/build-site.js` 自動產生，直接改會在下次建置時被覆蓋。

**要改文案請改這裡：**

| 想改什麼 | 改哪個檔案 |
|---|---|
| 首頁文案、FAQ、服務項目、數據 | `scripts/build-home.js` |
| 文章列表頁、影片頁的文案 | `scripts/build-pages.js` |
| 文章內頁版型 | `scripts/build-articles.js` |
| 選單、頁尾、品牌資訊 | `scripts/lib/layout.js` |
| 文章、影片、買方需求的**內容** | 後台 `/admin/` |

改完推上 GitHub，Actions 會自動重新建置。

## ⚠️ 這兩個檔案絕對不要用上傳覆蓋

| 檔案 | 誰在維護 | 覆蓋的後果 |
|---|---|---|
| `data/market-data.json` | GitHub Actions 每天自動更新 | 行情變回示意假資料，要到 Actions 手動重跑 |
| `data/articles.json` | 你在後台編輯 | 已發布的文章全變回草稿，內容遺失 |
| `data/videos.json` | Actions 每 6 小時同步 YouTube ＋ 你在後台調整 | 影片清單清空、顯示設定遺失 |
| `data/buyers.json` | 你在後台編輯 | 買方需求全部消失 |

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

## 全站靜態化

所有頁面在建置時就產生完整 HTML，不依賴 JavaScript。

**為什麼**：Google 雖然會執行 JS，但索引優先度較低；ChatGPT、Perplexity 等 AI 爬蟲
多半不執行 JS，只讀原始 HTML。內容若靠 JS 載入，它們看到的會是空白頁。

實測：首頁靜態化後，爬蟲可讀的純文字從 0 字增加到約 4,800 字。

**什麼時候會重新建置**
- 你在後台發布文章、影片設定、買方需求 → 自動觸發
- 每日行情更新 → 一併重建
- 每 6 小時 YouTube 同步 → 一併重建
- 也可以到 Actions →「全站靜態建置」→ Run workflow 手動執行

## 文章靜態頁

每次 `data/articles.json` 有變動，GitHub Actions 會自動為每篇「已發布」的文章
產生一個真正的 HTML 檔案（`notes/<slug>.html`），內容直接寫在 HTML 裡。

**為什麼要這樣做**：Google 雖然會執行 JavaScript，但索引優先度較低；
ChatGPT、Perplexity 等 AI 爬蟲多半不執行 JS，只讀原始 HTML。
內容若靠 JS 載入，它們看到的會是空白頁。

你不需要做任何事——在後台發布文章後，約 1–2 分鐘靜態頁就會自動產生。
文章改回草稿時，對應的靜態頁也會自動刪除。

舊網址 `notes/article.html?slug=xxx` 仍可使用，會自動轉到新網址。

## SEO / GEO

網站已做的搜尋最佳化：

- 每篇文章動態產生獨立的 title、description、Open Graph（分享到 LINE、FB 會顯示正確標題與縮圖）
- 結構化資料：首頁為 RealEstateAgent（含服務區域）、文章為 Article ＋ BreadcrumbList ＋ FAQPage
- `sitemap.xml` 每次文章更新時自動重新產生
- `robots.txt` 已排除後台頁面

寫文章時建議填的三個欄位（在後台編輯畫面下方「搜尋最佳化」區）：

| 欄位 | 為什麼重要 |
|---|---|
| 關鍵字 | 用大家實際會搜尋的說法，例如「美術館特區房價」而不是「本區行情」 |
| 常見問題 | AI 與 Google 精選摘要最容易引用問答格式。回答要寫成可獨立閱讀的完整句子 |
| 資料來源 | 標示官方出處，提升可信度，也是 AI 判斷內容可信與否的依據 |

### 提交給 Google

網站上線後建議到 Google Search Console 提交 sitemap：
`https://twhouse416.github.io/chengguo-site/sitemap.xml`

## 買方需求牆

在後台的「買方需求」分頁新增，顯示在首頁（賀成交下方）。
用途是讓屋主知道「有人正在找我這種房子」，是開發賣方委託的入口。

每筆包含：想找的區域、坪數、預算、需求重點。沒有任何需求時，首頁不會顯示這個區塊。

**刊登前務必確認**：內容必須匿名化，不要出現姓名、電話、職業、公司、指定社區名稱，
或任何可辨識特定人的描述。依個人資料保護法，刊登買方需求前應先取得買方同意。

## 影片

影片清單每 6 小時自動同步自 YouTube 頻道（`UCrqD_LHzrYm4sLQXc0Cvwiw`），
你在 YouTube 上傳新片後，網站會自動出現，不用做任何事。

到後台的「影片」分頁可以調整：

- **網站顯示標題**——YouTube 上的標題通常較口語，網站上可以改成更好搜尋的寫法
- **分類**——社區開箱、生活圈導覽、知識分享、團隊日常
- **隱藏**——不想放在網站上的影片可以勾選隱藏
- **首頁主視覺影片**——留空會自動用最新一支

這些調整存在 `overrides` 裡，自動同步時不會被覆蓋。改完記得按「儲存設定」。

要立刻同步一次：Actions →「同步 YouTube 影片」→ Run workflow。

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
