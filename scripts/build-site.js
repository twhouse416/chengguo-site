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

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SITE, BRAND, head, header, footer } from "./lib/layout.js";
import { buildHome } from "./build-home.js";
import { buildNotesIndex, buildVideosIndex, buildDealsIndex } from "./build-pages.js";
import { buildArticles, webSlug, setArticleStats, checkStaleCounts, fillArticleStats } from "./build-articles.js";
import { buildTools } from "./build-tools.js";
import { buildCommunities } from "./build-communities.js";
import { buildAreas } from "./build-areas.js";
import { buildIndexPages, devSlugOf, schoolSlugOf, schoolNames } from "./build-index-pages.js";
import { devName } from "./build-communities.js";
import { buildAbout } from "./build-about.js";
import { buildHubs } from "./build-hubs.js";
import { buildFaq } from "./build-faq.js";

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

/* 工具頁與關於頁的內容是寫死在程式裡的，不會隨資料每天變動。
   改了 build-tools.js / build-about.js 的文案時，手動更新這個日期。 */
const STATIC_CONTENT_DATE = "2026-10-08";

/* sitemap 的 lastmod 必須說實話。
   全站每天因為行情與 YouTube 同步而重建，如果每一頁都寫成「今天」，
   Google 會判定這個欄位不可信並整個忽略，檢索預算就無法集中到真正改過的頁面。
   所以這裡逐頁推算：社區頁用該社區最新一筆成交日，生活圈／學區／建商頁
   取旗下社區的最大值，列表頁取其資料來源的最新日期，工具頁用上面的常數。 */
function maxDate(list) {
  const ds = list.filter(Boolean).map(x => String(x).slice(0, 10)).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x));
  return ds.length ? ds.sort().at(-1) : "";
}

function buildSitemap(articles, communities = [], hasDeals = false, areas = [], indexPages = { developers: [], schools: [] }, ctx = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const { dealsByCommunity = {}, videosUpdated = "", dealsUpdated = "", marketUpdated = "" } = ctx;

  /* 社區 → 最新成交日 */
  const cLast = {};
  communities.forEach(c => {
    cLast[c.slug] = maxDate((dealsByCommunity[c.slug] || []).map(d => d.date)) || c.updated || "";
  });
  /* 生活圈／學區／建商 → 旗下社區的最大值 */
  const groupLast = (filterFn) => maxDate(communities.filter(filterFn).map(c => cLast[c.slug]));
  const areaLast = {};
  areas.forEach(a => { areaLast[a.slug] = groupLast(c => c.area === a.name) || marketUpdated; });
  const devLast = {};
  (indexPages.developers || []).forEach(d => {
    devLast[d.slug] = groupLast(c => devSlugOf(devName(c)) === d.slug);
  });
  const schoolLast = {};
  (indexPages.schools || []).forEach(x => {
    schoolLast[x.slug] = groupLast(c => schoolNames(c).some(n => schoolSlugOf(n) === x.slug));
  });
  const allCommunityLast = maxDate(Object.values(cLast));
  const articlesLast = maxDate(articles.map(a => a.updated || a.date));
  const homeLast = maxDate([allCommunityLast, articlesLast, dealsUpdated, marketUpdated]);

  const pages = [
    { loc: `${SITE}/`, lastmod: homeLast, priority: "1.0", freq: "daily" },
    { loc: `${SITE}/notes/`, lastmod: articlesLast, priority: "0.8", freq: "weekly" },
    { loc: `${SITE}/videos/`, lastmod: videosUpdated, priority: "0.8", freq: "weekly" },
    { loc: `${SITE}/tools/school-zone/`, lastmod: STATIC_CONTENT_DATE, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/tools/mortgage/`, lastmod: STATIC_CONTENT_DATE, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/tools/qingan/`, lastmod: STATIC_CONTENT_DATE, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/tools/property-tax/`, lastmod: STATIC_CONTENT_DATE, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/about/`, lastmod: STATIC_CONTENT_DATE, priority: "0.7", freq: "monthly" },
    /* 四個彙整頁 */
    { loc: `${SITE}/tools/`, lastmod: STATIC_CONTENT_DATE, priority: "0.7", freq: "monthly" },
    { loc: `${SITE}/faq/`, lastmod: articlesLast, priority: "0.8", freq: "weekly" },
    ...(areas.length ? [{ loc: `${SITE}/areas/`, lastmod: maxDate(areas.map(a => areaLast[a.slug])), priority: "0.8", freq: "weekly" }] : []),
    ...((indexPages.schools || []).length ? [{ loc: `${SITE}/schools/`, lastmod: maxDate(Object.values(schoolLast)), priority: "0.7", freq: "monthly" }] : []),
    ...((indexPages.developers || []).length ? [{ loc: `${SITE}/developers/`, lastmod: maxDate(Object.values(devLast)), priority: "0.7", freq: "monthly" }] : []),
    ...(hasDeals ? [{ loc: `${SITE}/deals/`, lastmod: dealsUpdated, priority: "0.7", freq: "weekly" }] : []),
    ...(communities.length ? [{ loc: `${SITE}/communities/`, lastmod: allCommunityLast, priority: "0.8", freq: "weekly" }] : []),
    /* 生活圈頁的優先度給到 0.9：它是「美術館特區房價」這類主要關鍵字的落地頁，
       比單一社區頁重要。 */
    ...areas.map(a => ({ loc: `${SITE}/areas/${a.slug}/`, lastmod: areaLast[a.slug], priority: "0.9", freq: "weekly" })),
    ...(indexPages.developers || []).map(d => ({ loc: `${SITE}/developers/${d.slug}/`, lastmod: devLast[d.slug], priority: "0.7", freq: "monthly" })),
    ...(indexPages.schools || []).map(x => ({ loc: `${SITE}/schools/${x.slug}/`, lastmod: schoolLast[x.slug], priority: "0.7", freq: "monthly" })),
    ...communities.map(c => ({
      loc: `${SITE}/communities/${c.slug}.html`,
      lastmod: cLast[c.slug],
      priority: "0.9", freq: "weekly",
    })),
    ...articles.map(a => ({
      loc: `${SITE}/notes/${webSlug(a.slug)}.html`,
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
/* AI 搜尋引擎的「回答型」爬蟲：使用者問問題時即時抓取並附上出處連結。
   明確列出來，是因為部分爬蟲只讀自己的 User-agent 區塊，不會套用萬用字元那段；
   日後若要對「訓練型」爬蟲（GPTBot、ClaudeBot、CCBot、Google-Extended）
   採取不同政策，也只要改這裡。 */
const AI_ANSWER_BOTS = [
  "OAI-SearchBot", "ChatGPT-User",
  "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot-Extended",
  "Bingbot", "Amazonbot", "meta-externalagent",
];

function buildRobots() {
  const txt = `User-agent: *
Allow: /

# 後台不需要被搜尋引擎收錄
Disallow: /admin/

# AI 搜尋引擎：本站內容歡迎引用，請標明出處並連回原頁
${AI_ANSWER_BOTS.map(b => `User-agent: ${b}\nAllow: /\nDisallow: /admin/\n`).join("\n")}
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
function buildLlmsTxt({ communities, articles, dealTotal, dataUpdated, areas = [], indexPages = { developers: [], schools: [] } }) {
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
- 各生活圈的行情與社區一覽（含區域均價、常見單價區間、社區清單、路段分布、建商與完工年代）：
${areas.map(a => `  - ${a.name}（高雄市${a.district}）：${SITE}/areas/${a.slug}/ ｜${a.count} 個社區、${a.deals.toLocaleString("en-US")} 筆成交`).join("\n")}
- ${SITE}/communities/<slug>.html ：單一社區頁，含實價登錄逐筆成交、社區規格、學區、常見問題
${(indexPages.developers || []).length ? `- 建商頁（該建商在本站收錄範圍內的社區一覽）：
${indexPages.developers.map(d => `  - ${d.name}：${SITE}/developers/${d.slug}/ ｜${d.count} 個社區`).join("\n")}` : ""}
${(indexPages.schools || []).length ? `- 學區頁（學區欄位登載為該校的社區一覽，含官方里鄰劃分原文）：
${indexPages.schools.map(x => `  - ${x.name}：${SITE}/schools/${x.slug}/ ｜${x.count} 個社區`).join("\n")}` : ""}
- ${SITE}/tools/mortgage/ ：房貸試算
- ${SITE}/tools/qingan/ ：新青安貸款資格與額度試算
- ${SITE}/tools/property-tax/ ：房地合一稅與土地增值稅概算
- ${SITE}/tools/school-zone/ ：學區查詢
- ${SITE}/notes/ ：購屋知識文章（${articles.length} 篇）
${articles.map(a => `  - ${a.title}：${SITE}/notes/${webSlug(a.slug)}.html ｜${a.updated || a.date} 更新${a.summary ? `\n    ${a.summary}` : ""}`).join("\n")}
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
    header({ depth: 0, hasBuyers: false, isHome: false }),
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
      ["學區查詢", "tools/school-zone/index.html", "選行政區與里別，查國小、國中學區"],
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
    footer({ depth: 0, hasBuyers: false, isHome: false }),
  ].join("\n");
  writeFileSync(path.join(ROOT, "404.html"), html, "utf-8");
  console.log("[產生] 404.html");
}

/* ---------- 內部連結正規化 ----------
 * 全站的 canonical 用的是目錄形式（https://k7.com.tw/communities/），
 * 但樣板裡的連結一直寫成 communities/index.html。
 * Google 從連結爬到 index.html 版本，發現 canonical 指向另一個網址，
 * 就把它歸檔成「替代頁面（有適當的標準標記）」——歸併的結果是對的，
 * 但每一條這種連結都白白花掉一次檢索配額。
 * 站上有五千多條，而 Google 目前還有兩百多頁沒爬到，這很傷。
 *
 * 在全部頁面產生完之後統一改寫一次：
 *   href="communities/index.html"          → href="communities/"
 *   href="../index.html"                   → href="../"
 *   href="index.html"                      → href="./"
 *   href="communities/index.html#area-01"  → href="communities/#area-01"
 *
 * 只動 index.html。社區頁與文章頁的 <slug>.html 不受影響——
 * 它們的 canonical 本來就是 .html 形式。
 * 外部網址（https://…/index.html）也不動。
 */
/* 無障礙：鍵盤使用者按 Tab 第一下會拿到「跳到主要內容」，
   需要有個 id="main" 的落點。各頁的 <main> 寫在不同的建置檔裡，
   在這個收尾階段統一補上，只改一處。 */
function addMainId(html) {
  if (/<main[^>]*\sid=/.test(html)) return html;
  return html.replace(/<main(\s|>)/, '<main id="main"$1');
}

function normalizeLinks(html) {
  return html.replace(
    /href="([^"]*?)index\.html(#[^"]*|\?[^"]*)?"/g,
    (whole, prefix, tail) => {
      if (/^(https?:)?\/\//i.test(prefix)) return whole;
      return `href="${prefix || "./"}${tail || ""}"`;
    }
  );
}

/* 走訪產生出來的 HTML 一次把連結改掉。
   放在這裡而不是各個樣板裡，是因為樣板有十幾個檔案、連結散落在各處，
   集中一處才能確定沒有漏網，以後新增頁面也自動適用。
   admin 是後台應用程式，它的連結不走這套規則，排除掉。 */
function normalizeAllLinks() {
  const SKIP = new Set(["admin", "src", "node_modules", ".git", "assets", "data", "config", "scripts"]);
  let changed = 0, files = 0;
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") && e.name !== ".") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (dir === ROOT && SKIP.has(e.name)) continue;
        walk(full);
      } else if (e.name.endsWith(".html")) {
        const before = readFileSync(full, "utf-8");
        const after = addMainId(normalizeLinks(before));
        files++;
        if (after !== before) {
          writeFileSync(full, after, "utf-8");
          changed += (before.match(/href="[^"]*?index\.html/g) || []).length;
        }
      }
    }
  };
  walk(ROOT);
  console.log(`[整理] 內部連結改為目錄形式：掃描 ${files} 頁，改寫 ${changed} 條`);
}

function main() {
  const market = readJson("data/market-data.json", { areas: [] });
  const articlesData = readJson("data/articles.json", { articles: [] });
  const buyers = readJson("data/buyers.json", { buyers: [] });
  const videos = readJson("data/videos.json", { videos: [] });
  const deals = readJson("data/deals.json", { deals: [] });

  /* 文章一律依發布日期由新到舊排序。
     原本是用 articles.json 的陣列順序，等於「先加入的排前面」——
     列表頁打開看到的會是最舊的幾篇，最新、最強的反而在下半部。
     同一天發布的維持原陣列順序（穩定排序），所以你在後台調整日期
     就能控制列表頁的呈現順序。 */
  const _cfg = readJson("data/communities.json", { communities: [] });
  const _cd = readJson("data/community-deals.json", { deals: {} });
  setArticleStats({
    communityCount: (_cfg.communities || []).filter(c => !c.draft).length,
    dealTotal: Object.values(_cd.deals || {}).reduce((a, b) => a + b.length, 0),
    dataUpdated: (_cd.updatedAt || "").slice(0, 10),
    /* 查得到公設比的社區數：公設比那篇要用，隨社區增減自動更新 */
    ratioCount: (_cfg.communities || []).filter(c => !c.draft
      && (c.specs || []).some(x => /公設比/.test(x[0]) && /[\d.]+\s*%/.test(String(x[1])))).length,
    /* 生活圈層級的計數，讓文章可用 {{瑞豐社區數}} 這類變數，
       過期檢查也能用正確的分母比對 */
    areas: ["美術館特區", "農十六特區", "瑞豐", "中都"].map(key => {
      const list = (_cfg.communities || []).filter(c => !c.draft && String(c.area || "").includes(key.replace("特區", "")));
      return {
        key,
        communities: list.length,
        deals: list.reduce((n, c) => n + (_cd.deals?.[c.slug] || []).filter(d => d.use !== "店面").length, 0),
      };
    }),
  });

  /* 代入統計變數要在排序與分發之前做一次就好——首頁卡片、文章列表、
     相關文章區塊、llms.txt 都讀同一份資料，代乾淨了下游全部跟著對。 */
  const articles = fillArticleStats((articlesData.articles || [])
    .filter(a => !a.draft)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => String(y.a.date || "").localeCompare(String(x.a.date || "")) || x.i - y.i)
    .map(x => x.a));
  checkStaleCounts(articlesData.articles || []);
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

  /* 各篇文章。先把站台統計交給 build-articles，內文的 {{社區數}}、{{成交筆數}}
     才會代入當下的真實數字；接著跑一次過期檢查，文章若還寫死舊計數會示警。 */
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
  buildTools(hasBuyers, market);

  /* 社區頁 */
  const communities = buildCommunities(hasBuyers);

  /* 生活圈頁：要在社區頁之後跑，因為它讀的是同一份社區設定，
     而且頁面上的成交筆數要跟社區頁一致。 */
  const areas = buildAreas({ market, articles, hasBuyers });

  /* 建商頁與學區頁：長尾落地頁，只在社區數達門檻時產生 */
  const indexPages = buildIndexPages({ hasBuyers });

  /* 四個彙整頁：/areas/ /schools/ /developers/ /tools/
     原本這些網址沒有 index.html，直接輸入會 404。彙整頁同時是「完整清單」型內容，
     AI 搜尋引擎容易引用，也把內部連結分配給底下的子頁。 */
  const cdHub = readJson("data/community-deals.json", { deals: {} });
  buildHubs({
    areas, communities, dealsMap: cdHub.deals || {}, indexPages, hasBuyers,
    dataUpdated: String(cdHub.updatedAt || "").slice(0, 10),
  });

  /* 常見問題彙整頁：把各篇文章的 FAQ 集中成一個可被直接引用的入口 */
  buildFaq({ articles, hasBuyers, dataUpdated: String(cdHub.updatedAt || "").slice(0, 10) });

  /* 關於團隊頁：不動產屬 YMYL 領域，Google 對 E-E-A-T 的要求高，
     團隊資訊需要一個可以被連結、被引用的獨立頁面。 */
  const cd = readJson("data/community-deals.json", { deals: {} });
  mkdirSync(path.join(ROOT, "about"), { recursive: true });
  buildAbout({
    hasBuyers, communityCount: communities.length,
    dealTotal: Object.values(cd.deals || {}).reduce((a, b) => a + b.length, 0),
    dataUpdated: String(cd.updatedAt || "").slice(0, 10),
  });

  /* 網站地圖、robots.txt、llms.txt、404 */
  const cdForMap = readJson("data/community-deals.json", { deals: {} });
  buildSitemap(articles, communities, dealCount > 0, areas, indexPages, {
    dealsByCommunity: cdForMap.deals || {},
    videosUpdated: maxDate((videos.videos || []).map(v => v.published)),
    dealsUpdated: maxDate((deals.deals || []).map(d => d.date || d.createdAt)) || String(deals.updatedAt || "").slice(0, 10),
    marketUpdated: String(market?.updatedAt || cdForMap.updatedAt || "").slice(0, 10),
  });
  buildRobots();
  const communityDeals = readJson("data/community-deals.json", { deals: {} });
  buildLlmsTxt({
    communities,
    articles,
    dealTotal: Object.values(communityDeals.deals || {}).reduce((a, b) => a + b.length, 0),
    dataUpdated: String(communityDeals.updatedAt || "").slice(0, 10),
    areas, indexPages,
  });
  build404();

  /* 最後一步：把內部連結改成與 canonical 一致的目錄形式 */
  normalizeAllLinks();

  console.log(`[完成] 全站建置：文章 ${articles.length} 篇、影片 ${(videos.videos || []).filter(v => !v.hidden).length} 支、賀成交 ${dealCount} 筆、買方需求 ${hasBuyers ? "有" : "無"}`);
}

main();
