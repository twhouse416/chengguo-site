/**
 * 澄果團隊｜全站靜態建置
 * ------------------------------------------------
 * 一次產生所有頁面，內容在建置時就寫成 HTML，
 * 不執行 JavaScript 的爬蟲（ChatGPT、Perplexity 等）也讀得到完整內容。
 *
 * 產生：
 *   index.html            首頁
 *   notes/index.html      文章列表
 *   notes/<slug>.html     各篇文章
 *   videos/index.html     影片專區
 *   tools/<name>/         四個試算工具
 *   sitemap.xml           網站地圖
 *
 * 資料來源：data/ 底下的 JSON（由後台或 GitHub Actions 維護）
 *
 * ⚠️ 不要直接編輯產生出來的 HTML，會被覆蓋。
 *    要改文案請改 scripts/build-home.js、scripts/build-pages.js。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SITE, BRAND, head, header, footer } from "./lib/layout.js";
import { buildHome } from "./build-home.js";
import { buildNotesIndex, buildVideosIndex, buildDealsIndex } from "./build-pages.js";
import { buildArticles } from "./build-articles.js";
import { buildTools } from "./build-tools.js";
import { buildCommunities } from "./build-communities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readJson(rel, fallback) {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, rel), "utf-8"));
  } catch (e) {
    console.warn(`[警告] 讀不到 ${rel}，使用預設值：${e.message}`);
    return fallback;
  }
}

function buildSitemap(articles, communities = [], hasDeals = false) {
  const today = new Date().toISOString().slice(0, 10);
  const pages = [
    { loc: `${SITE}/`, priority: "1.0", freq: "daily" },
    { loc: `${SITE}/notes/`, priority: "0.8", freq: "weekly" },
    { loc: `${SITE}/videos/`, priority: "0.8", freq: "weekly" },
    { loc: `${SITE}/tools/school-zone/`, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/tools/mortgage/`, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/tools/qingan/`, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/tools/property-tax/`, priority: "0.7", freq: "monthly" },
    ...(hasDeals ? [{ loc: `${SITE}/deals/`, priority: "0.7", freq: "weekly" }] : []),
    ...(communities.length ? [{ loc: `${SITE}/communities/`, priority: "0.8", freq: "weekly" }] : []),
    ...communities.map(c => ({
      loc: `${SITE}/communities/${c.slug}.html`,
      priority: "0.9", freq: "weekly",
    })),
    ...articles.map(a => ({
      loc: `${SITE}/notes/${a.slug}.html`,
      lastmod: a.updated || a.date,
      priority: "0.9", freq: "monthly",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod || today}</lastmod>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
  writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf-8");
  console.log(`[產生] sitemap.xml（${pages.length} 個網址）`);
}

/* robots.txt 也依 site-config.json 的 siteUrl 產生，
   換網域時只要改設定檔一處，不必再手動改這個檔。 */
function buildRobots() {
  const txt = `User-agent: *
Allow: /

# 後台不需要被搜尋引擎收錄
Disallow: /admin/

Sitemap: ${SITE}/sitemap.xml
`;
  writeFileSync(path.join(ROOT, "robots.txt"), txt, "utf-8");
  console.log("[產生] robots.txt");
}

/* ---------- llms.txt ----------
 * 給 AI 引擎（ChatGPT、Perplexity、Claude、Gemini 等）看的純文字說明檔。
 * 爬蟲不會讀懂整站的導覽結構，但會讀根目錄的 llms.txt，
 * 所以這裡把「我們是誰、資料從哪來、多久更新、網站怎麼分類、引用時要注意什麼」
 * 一次講清楚。內容依實際資料量自動產生，不會寫死數字。
 */
function buildLlmsTxt({ communities, articles, dealTotal, dataUpdated }) {
  const byArea = {};
  communities.forEach(c => { byArea[c.area] = (byArea[c.area] || 0) + 1; });
  const txt = `# ${"台灣房屋 澄果團隊"}（澄果資產有限公司）

高雄在地房仲團隊，深耕鼓山區美術館特區、鼓山區農十六特區、左營區瑞豐巨蛋生活圈
與三民區中都重劃區 10 年以上。網站提供這四個生活圈的社區實價登錄成交紀錄、
社區規格、學區資訊與購屋試算工具。

網址：${SITE}/
電話：07-9766977
地址：804 高雄市鼓山區青海路416號

## 資料來源與更新頻率

社區成交紀錄全部來自內政部不動產交易實價查詢服務網（https://plvr.land.moi.gov.tw/），
該平台每月 1、11、21 日批次公告，本站於公告後更新。
${dataUpdated ? `成交資料最後更新：${dataUpdated}\n` : ""}目前收錄 ${communities.length} 個社區、${dealTotal.toLocaleString("en-US")} 筆成交紀錄。

社區規格（建商、營造、戶數、樓層、公設比、車位、基地面積）取自好房網、成家網、
591、信義房屋、樂居等公開平台，頁面上會註明出處；同一項目有兩種記載時並列兩者，
並建議查閱建物謄本確認。查不到的欄位一律留空，不做推測。

## 門牌範圍的驗證方式

每個社區頁的門牌範圍，是用內政部實價登錄的「建築完成年月」加「總樓層數」
交叉驗證過的——同一組門牌內所有成交的這兩個欄位必須完全一致，
才認定是同一棟建築。各平台登錄的代表門牌常與實際門牌不同，
本站以實價登錄為準，差異寫在頁面的門牌說明裡。

## 網站結構

- ${SITE}/ ：首頁，含四個生活圈的行情摘要與服務說明
- ${SITE}/communities/ ：社區總覽（依生活圈分組）
${Object.entries(byArea).map(([a, n]) => `  - ${a}：${n} 個社區`).join("\n")}
- ${SITE}/communities/<slug>.html ：單一社區頁，含實價登錄逐筆成交、社區規格、學區、常見問題
- ${SITE}/tools/mortgage/ ：房貸試算
- ${SITE}/tools/qingan/ ：新青安貸款資格與額度試算
- ${SITE}/tools/property-tax/ ：房地合一稅與土地增值稅概算
- ${SITE}/tools/school-zone/ ：學區查詢
- ${SITE}/notes/ ：購屋知識文章（${articles.length} 篇）
- ${SITE}/videos/ ：社區與區域介紹影片

## 引用說明

社區頁的成交紀錄以 schema.org 的 Dataset 標記，含 temporalCoverage、
spatialCoverage、creator 與 dateModified，可據此判斷資料的涵蓋範圍與時效。
引用單價或行情時請一併標明資料期間與筆數；成交筆數少於 12 筆的社區，
頁面上已標註樣本偏少，不宜單獨作為行情依據。

本站不提供房價預測，也不對學區劃分做保證（學區以里、鄰劃分且逐年調整，
須以入學當年度教育局公告為準）。
`;
  writeFileSync(path.join(ROOT, "llms.txt"), txt, "utf-8");
  console.log("[產生] llms.txt");
}

/* ---------- 404 ----------
 * GitHub Pages 要根目錄有 404.html 才會回自訂錯誤頁。
 * 沒有的話打錯網址的人與爬蟲拿到的是預設頁，也白白流失一次導流。
 */
function build404() {
  const html = [
    head({
      title: `找不到這個頁面｜${BRAND.teamName}`,
      description: "這個網址不存在或已經搬家。可以從社區行情、試算工具或購屋知識重新找。",
      canonical: `${SITE}/404.html`,
      depth: 0,
      noindex: true,
    }),
    header({ depth: 0, hasBuyers: false }),
    `<main class="max-w-3xl mx-auto px-6 py-24">
  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">404</div>
  <h1 class="display text-[32px] md:text-[40px]">找不到這個頁面</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-xl">
    這個網址不存在，或是內容搬到別的位置了。下面幾個入口可以直接過去：
  </p>
  <div class="mt-10 grid sm:grid-cols-2 gap-5">
    ${[
      ["社區行情", "communities/index.html", "各社區的實價登錄逐筆成交、規格與學區"],
      ["購屋知識", "notes/index.html", "稅費、貸款、買賣時機的說明文章"],
      ["房貸試算", "tools/mortgage/index.html", "從月付金反推可負擔的總價"],
      ["學區查詢", "tools/school-zone/index.html", "用門牌核對國小、國中學區"],
    ].map(([t, href, d]) => `<a href="${href}" class="border border-line rounded-sm bg-surface p-6 hover:border-orange hover:bg-tint transition block">
      <div class="text-[18px] font-bold tracking-tight">${t}</div>
      <p class="mt-2 text-[15px] text-inkSoft leading-[1.85]">${d}</p>
    </a>`).join("\n    ")}
  </div>
  <p class="mt-12 text-[16px] text-inkSoft leading-[1.9]">
    想查的社區找不到，直接問我們最快。
    <a href="${BRAND.phoneHref}" class="text-orangeDeep hover:underline font-medium">${BRAND.phone}</a>
  </p>
</main>`,
    footer({ depth: 0, hasBuyers: false }),
  ].join("\n");
  writeFileSync(path.join(ROOT, "404.html"), html, "utf-8");
  console.log("[產生] 404.html");
}

function main() {
  const market = readJson("data/market-data.json", { areas: [] });
  const articlesData = readJson("data/articles.json", { articles: [] });
  const buyers = readJson("data/buyers.json", { buyers: [] });
  const videos = readJson("data/videos.json", { videos: [] });
  const deals = readJson("data/deals.json", { deals: [] });

  const articles = (articlesData.articles || []).filter(a => !a.draft);
  const hasBuyers = (buyers.buyers || []).some(b => !b.hidden);

  /* 首頁 */
  writeFileSync(path.join(ROOT, "index.html"),
    buildHome({ market, articles, buyers, videos, deals }), "utf-8");
  console.log("[產生] index.html");

  /* 文章列表 */
  mkdirSync(path.join(ROOT, "notes"), { recursive: true });
  writeFileSync(path.join(ROOT, "notes/index.html"),
    buildNotesIndex({ articles, hasBuyers }), "utf-8");
  console.log("[產生] notes/index.html");

  /* 各篇文章 */
  buildArticles({ articles, hasBuyers });

  /* 影片專區 */
  mkdirSync(path.join(ROOT, "videos"), { recursive: true });
  writeFileSync(path.join(ROOT, "videos/index.html"),
    buildVideosIndex({ videos, hasBuyers }), "utf-8");
  console.log("[產生] videos/index.html");

  /* 賀成交 */
  const dealCount = (deals.deals || []).filter(d => !d.hidden && d.img).length;
  if (dealCount > 0) {
    mkdirSync(path.join(ROOT, "deals"), { recursive: true });
    writeFileSync(path.join(ROOT, "deals/index.html"),
      buildDealsIndex({ deals, hasBuyers }), "utf-8");
    console.log("[產生] deals/index.html");
  }

  /* 試算工具 */
  buildTools(hasBuyers);

  /* 社區頁 */
  const communities = buildCommunities(hasBuyers);

  /* 網站地圖、robots.txt、llms.txt、404 */
  buildSitemap(articles, communities, dealCount > 0);
  buildRobots();
  const communityDeals = readJson("data/community-deals.json", { deals: {} });
  buildLlmsTxt({
    communities,
    articles,
    dealTotal: Object.values(communityDeals.deals || {}).reduce((a, b) => a + b.length, 0),
    dataUpdated: String(communityDeals.updatedAt || "").slice(0, 10),
  });
  build404();

  console.log(`[完成] 全站建置：文章 ${articles.length} 篇、影片 ${(videos.videos || []).filter(v => !v.hidden).length} 支、賀成交 ${dealCount} 筆、買方需求 ${hasBuyers ? "有" : "無"}`);
}

main();
