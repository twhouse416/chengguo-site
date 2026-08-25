/**
 * 澄果團隊｜從網址匯入文章
 * ------------------------------------------------
 * 讀取 data/import-queue.json 裡待處理的網址，抓回內容轉成本站的文章格式，
 * 一律存成草稿，讓你在後台編輯調整後再決定要不要發布。
 *
 * 為什麼這樣設計：
 * 匯入的是初稿，不是直接上線。你可以在後台改標題、補 FAQ、加關鍵字，
 * 讓自己網站的版本比來源更完整，而不是單純的複製。
 *
 * 用法：
 *   node scripts/import-articles.js            處理佇列
 *   node scripts/import-articles.js --dry      只顯示會抓到什麼，不寫檔
 *   node scripts/import-articles.js <網址>     直接匯入單一網址
 *
 * 佇列由後台的「從網址匯入」寫入，處理完會自動清空。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTICLES_PATH = path.join(ROOT, "data/articles.json");
const QUEUE_PATH = path.join(ROOT, "data/import-queue.json");
const DRY = process.argv.includes("--dry");

/* 部分網站（例如有 Cloudflare 保護的）會擋掉標頭不完整的請求，
   這裡送出與一般瀏覽器相同的標頭，不做任何規避或偽裝驗證的動作。 */
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

function loadConfig() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "data/site-config.json"), "utf-8"));
  } catch {
    return {};
  }
}

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        `來源網站拒絕自動讀取（HTTP ${res.status}）。` +
        `這個網站有防護機制，無法自動匯入——請改用後台的「貼上長文，自動分段」手動貼入。`);
    }
    throw new Error(`讀取失敗（HTTP ${res.status}）`);
  }
  return res.text();
}

/* ---------- HTML 工具 ---------- */
const decode = s => String(s || "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const stripTags = s => decode(String(s || "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

function metaContent(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|` +
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  const m = html.match(re);
  return m ? decode(m[1] || m[2] || "") : "";
}

/* 從頻道頁取出文章網址 */
function extractArticleUrls(html) {
  const ids = new Set();
  const re = /\/articles\/(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

/* 民國或英文日期轉 YYYY-MM-DD */
const MONTHS = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",
                 Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };

function parseDate(html) {
  /* 頁面上的「發佈時間：Aug 21, 2026」 */
  const m = html.match(/發佈時間[：:]\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/);
  if (m) return `${m[3]}-${MONTHS[m[1]] || "01"}-${String(m[2]).padStart(2, "0")}`;
  const iso = html.match(/"datePublished"\s*:\s*"([\d]{4}-[\d]{2}-[\d]{2})/);
  if (iso) return iso[1];
  return new Date().toISOString().slice(0, 10);
}

/* 取出文章主體。R.TUBE 用 Nuxt SSR，內容在頁面裡。 */
function extractBody(html) {
  /* 主體通常包在 article 或帶 content 類別的容器 */
  const candidates = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class=["'][^"']*(?:article-content|content-body|ProseMirror)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]+class=["'][^"']*(?:tag|author|comment))/i,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m && stripTags(m[1]).length > 300) return m[1];
  }
  return "";
}

/* 把 HTML 轉成本站的 blocks 格式 */
function htmlToBlocks(html) {
  const blocks = [];
  if (!html) return blocks;

  /* 逐一取出區塊層級的標籤 */
  const re = /<(h[1-6]|p|ul|ol|table|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];

    if (/^h[1-6]$/.test(tag)) {
      const t = stripTags(inner);
      if (t) blocks.push({ type: "h", text: t });
      continue;
    }

    if (tag === "p") {
      const t = inner
        .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
        .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
      const text = stripTags(t);
      if (text && text.length > 1) blocks.push({ type: "p", text });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = [];
      const li = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let x;
      while ((x = li.exec(inner)) !== null) {
        const t = stripTags(
          x[1].replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
              .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**"));
        if (t) items.push(t);
      }
      if (items.length) blocks.push({ type: "list", items });
      continue;
    }

    if (tag === "blockquote") {
      const t = stripTags(inner);
      if (t) blocks.push({ type: "quote", text: t });
      continue;
    }

    if (tag === "table") {
      const rows = [];
      const tr = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let r;
      while ((r = tr.exec(inner)) !== null) {
        const cells = [];
        const td = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let c;
        while ((c = td.exec(r[1])) !== null) cells.push(stripTags(c[1]));
        if (cells.length) rows.push(cells);
      }
      if (rows.length > 1) {
        blocks.push({ type: "table", head: rows[0], rows: rows.slice(1) });
      }
      continue;
    }
  }
  return blocks;
}

/* 從 hashtag 取關鍵字 */
function extractKeywords(html) {
  const tags = [...html.matchAll(/#([\u4e00-\u9fff\w]{2,20})/g)].map(m => m[1]);
  return [...new Set(tags)].slice(0, 10);
}

/* 網址代號：用 R.TUBE 的文章編號，穩定且不會撞名 */
const slugOf = id => `rtube-${id}`;

/* 從網址取出來源與識別碼，用來產生不會撞名的 slug */
function parseSource(url) {
  const rtube = url.match(/rtube\.com\.tw\/articles\/(\d+)/);
  if (rtube) return { site: "rtube", id: rtube[1], slug: `rtube-${rtube[1]}` };

  /* 其他網站：用網域與路徑組出代號 */
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").split(".")[0];
    const tail = u.pathname.replace(/\/$/, "").split("/").pop() || "article";
    return { site: host, id: tail, slug: `${host}-${tail}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60) };
  } catch {
    return null;
  }
}

async function importOne(url, data, existing) {
  const src = parseSource(url);
  if (!src) { console.warn(`  [略過] 網址格式看不懂：${url}`); return "failed"; }

  if (existing.has(src.slug)) {
    console.log(`  [已存在] ${src.slug}　先前匯入過，保留你在後台的修改，未覆蓋`);
    return "skipped";
  }

  const html = await get(url);

  const title = metaContent(html, "og:title")
    || stripTags((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
  const summary = metaContent(html, "og:description");
  const cover = metaContent(html, "og:image");
  const date = parseDate(html);
  const blocks = htmlToBlocks(extractBody(html));

  const wordCount = blocks.reduce((n, b) =>
    n + (b.text?.length || 0) + (b.items?.join("").length || 0), 0);

  if (wordCount < 200) {
    console.warn(`  [失敗] 只解析到 ${wordCount} 字，內容可能不是靜態輸出，無法自動匯入`);
    console.warn(`         你可以改用後台的「貼上長文，自動分段」手動貼進來`);
    return "failed";
  }

  const article = {
    slug: src.slug,
    tag: "市場觀察",
    title: title.replace(/\s*[-｜|]\s*R\.TUBE.*$/i, "").trim(),
    summary,
    date,
    updated: new Date().toISOString().slice(0, 10),
    readMinutes: Math.max(3, Math.round(wordCount / 400)),
    draft: true,                    /* 一律先進草稿 */
    cover: cover || undefined,
    coverAlt: title,
    keywords: extractKeywords(html),
    blocks,
    _import: { url, site: src.site, importedAt: new Date().toISOString() },
  };

  data.articles.unshift(article);
  existing.set(src.slug, article);
  console.log(`  [匯入] ${article.title.slice(0, 42)}`);
  console.log(`         ${wordCount} 字、${blocks.length} 個區塊、${article.keywords.length} 個關鍵字`);
  return "added";
}

async function main() {
  /* 命令列直接給網址時，優先處理那個 */
  const cliUrl = process.argv.find(a => a.startsWith("http"));
  let urls = [];

  if (cliUrl) {
    urls = [cliUrl];
  } else {
    try {
      const q = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"));
      urls = (q.urls || []).filter(u => typeof u === "string" && u.startsWith("http"));
    } catch {
      console.log("[提示] 沒有 data/import-queue.json，沒有待匯入的網址");
      return;
    }
  }

  if (!urls.length) {
    console.log("[提示] 佇列是空的，沒有要匯入的網址");
    return;
  }

  console.log(`[匯入] 共 ${urls.length} 個網址\n`);

  const data = JSON.parse(readFileSync(ARTICLES_PATH, "utf-8"));
  data.articles = data.articles || [];
  const existing = new Map(data.articles.map(a => [a.slug, a]));

  let added = 0, skipped = 0, failed = 0;

  for (const url of urls) {
    console.log(`[處理] ${url}`);
    try {
      const r = await importOne(url, data, existing);
      if (r === "added") added++;
      else if (r === "skipped") skipped++;
      else failed++;
    } catch (e) {
      console.warn(`  [失敗] ${e.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 1500));   /* 放慢速度，不對來源網站造成負擔 */
    console.log("");
  }

  console.log("=".repeat(50));
  console.log(`[完成] 匯入 ${added} 篇、已存在略過 ${skipped} 篇、失敗 ${failed} 篇`);

  if (DRY) { console.log("[試跑] 未寫入任何檔案"); return; }

  if (added > 0) {
    writeFileSync(ARTICLES_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log("[完成] 已寫入", ARTICLES_PATH);
    console.log("[提醒] 匯入的文章都是草稿。請到後台檢查排版、補上 FAQ 與關鍵字後再發布。");
  }

  /* 佇列處理完就清空，避免下次重複匯入 */
  if (!cliUrl) {
    writeFileSync(QUEUE_PATH, JSON.stringify({
      _說明: "待匯入的文章網址。在後台的「從網址匯入」填入後儲存，GitHub Actions 會自動處理並清空這裡。",
      urls: [],
      lastRun: new Date().toISOString(),
      lastResult: { added, skipped, failed },
    }, null, 2) + "\n", "utf-8");
    console.log("[完成] 佇列已清空");
  }
}

main().catch(err => {
  console.error("[失敗]", err.message);
  process.exit(1);
});
