/*
 * 逐頁判斷「這一頁的內容到底是哪一天真的變過」。
 *
 * 為什麼需要這支：
 *   sitemap 的 <lastmod> 定義是「這個頁面的內容最後變動的時間」。
 *   原本的寫法是拿該社區「最新一筆成交日」當 lastmod，講的是資料有多新，
 *   不是頁面哪天改過。結果 2026-10 整輪 SEO 改版（Dataset schema、
 *   自備款 FAQ 改用實際中位數、相關社區改三組、內部連結目錄化、作者署名）
 *   明明改到了每一個社區頁，sitemap 卻對 Google 說「這頁自 2024-08 沒變過」，
 *   Google 自然不會回來重爬，改版效果遲遲不被重新評估。
 *
 *   反過來，如果每次建置都寫成「今天」也不行：全站每天因為行情與 YouTube
 *   同步而重建，天天都說全部改過，Google 會判定這個欄位不可信而整個忽略。
 *
 * 做法：
 *   建置完成後掃描每一個進 sitemap 的 HTML，把「不算實質變動」的痕跡遮掉
 *   （資料重新抓取但數字沒變時只會動到那行「資料更新於 X」），算出內容指紋，
 *   跟上一次建置存下來的指紋比對。指紋一樣就沿用舊的 lastmod，
 *   指紋不一樣才把 lastmod 設成今天。
 *
 *   這樣 lastmod 永遠說實話，而且完全自動 —— 不需要任何人記得去手動
 *   更新一個「模板最後改版日」常數，改了版型隔天 sitemap 就會自己反映。
 *
 * 狀態檔放在 config/ 而不是 data/：
 *   build-site.yml 的 push 觸發條件是 data/** 與 scripts/**，
 *   狀態檔每次建置都會變，放進 data/ 會讓建置提交自己觸發下一次建置，無限迴圈。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const STATE_PATH = "config/page-state.json";

/* 算內容指紋前要遮掉的東西 —— 只遮「重抓資料但內容沒變」會動到的兩處：
     1. 頁面上那行「資料更新於 <time datetime="…">…</time>」
     2. JSON-LD 的 dateModified（含我們自己等一下要寫回去的值）
   成交筆數、價格、中位數、FAQ 數字、相關社區、版型文案都不遮，
   那些變了就是真的變了。 */
export function fingerprint(html) {
  const normalized = html
    .replace(/(資料更新於\s*<time\s+datetime=")\d{4}-\d{2}-\d{2}("[^>]*>)[^<]*(<\/time>)/g, "$1$2$3")
    .replace(/"dateModified":"[^"]*"/g, '"dateModified":""');
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/* Dataset 的 dateModified 講的是「這份資料集什麼時候更新」，那本來就該是資料更新日，不要動。
   Article 類的 dateModified 是編輯意義上的「文章最後更新日」，由作者決定，也不要動。
   其餘頁面層級的實體（ApartmentComplex、CollectionPage、WebPage、AboutPage…）
   原本被塞的是資料更新日，語意不對，換成這一頁真正的內容變動日。 */
const KEEP_OWN_DATE = new Set(["Dataset", "Article", "BlogPosting", "NewsArticle"]);

export function stampDateModified(html, date) {
  return html.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    (whole, body) => {
      let obj;
      try { obj = JSON.parse(body); } catch { return whole; }
      const list = Array.isArray(obj) ? obj : [obj];
      let touched = false;
      for (const o of list) {
        if (!o || typeof o !== "object") continue;
        const t = Array.isArray(o["@type"]) ? o["@type"][0] : o["@type"];
        if (KEEP_OWN_DATE.has(t)) continue;
        /* 只改已經有這個欄位的實體，不替任何實體新增原本沒有的宣告 */
        if (typeof o.dateModified === "string" && o.dateModified !== date) {
          o.dateModified = date;
          touched = true;
        }
      }
      return touched ? `<script type="application/ld+json">${JSON.stringify(obj)}</script>` : whole;
    }
  );
}

/* https://k7.com.tw/areas/art-museum/ → areas/art-museum/index.html */
export function urlToFile(loc, site) {
  let p = loc.startsWith(site) ? loc.slice(site.length) : loc;
  p = p.replace(/^\//, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  return p;
}

export function readState(root) {
  const full = path.join(root, STATE_PATH);
  if (!existsSync(full)) return {};
  try {
    const parsed = JSON.parse(readFileSync(full, "utf-8"));
    return parsed.pages || {};
  } catch {
    return {};
  }
}

export function writeState(root, pages, today) {
  const full = path.join(root, STATE_PATH);
  mkdirSync(path.dirname(full), { recursive: true });
  const sorted = {};
  Object.keys(pages).sort().forEach(k => { sorted[k] = pages[k]; });
  writeFileSync(full, JSON.stringify({
    _說明: "每一頁的內容指紋與真正的最後變動日，給 sitemap 的 lastmod 用。由 scripts/lib/page-dates.js 自動維護，不要手改。",
    generated: today,
    pages: sorted,
  }, null, 1) + "\n", "utf-8");
}

/*
 * 就地把 pages 陣列每一筆的 lastmod 換成「這一頁真正的內容變動日」，
 * 同時把該頁 JSON-LD 的 dateModified 對齊成同一個日期。
 * 回傳統計數字給 build-site.js 印出來。
 */
export function applyContentLastmod(pages, { root, site, today }) {
  const prev = readState(root);
  const next = {};
  let unchanged = 0, changed = 0, added = 0, missing = 0;

  for (const p of pages) {
    const rel = urlToFile(p.loc, site);
    const full = path.join(root, rel);
    if (!existsSync(full)) {
      /* sitemap 裡有、檔案卻不在：保留原本算出來的 lastmod，不要瞎掰 */
      missing++;
      continue;
    }
    const html = readFileSync(full, "utf-8");
    const fp = fingerprint(html);
    const before = prev[rel];

    let lastmod;
    if (!before) { lastmod = today; added++; }
    else if (before.fingerprint === fp) { lastmod = before.lastmod; unchanged++; }
    else { lastmod = today; changed++; }

    const stamped = stampDateModified(html, lastmod);
    if (stamped !== html) writeFileSync(full, stamped, "utf-8");

    next[rel] = { fingerprint: fp, lastmod };
    p.lastmod = lastmod;
  }

  writeState(root, next, today);
  return { unchanged, changed, added, missing, total: pages.length };
}
