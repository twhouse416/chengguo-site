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

import { SITE } from "./lib/layout.js";
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

  /* 網站地圖 */
  buildSitemap(articles, communities, dealCount > 0);

  console.log(`[完成] 全站建置：文章 ${articles.length} 篇、影片 ${(videos.videos || []).filter(v => !v.hidden).length} 支、賀成交 ${dealCount} 筆、買方需求 ${hasBuyers ? "有" : "無"}`);
}

main();
