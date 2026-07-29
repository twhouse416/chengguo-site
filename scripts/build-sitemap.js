/**
 * 澄果團隊｜自動產生 sitemap.xml
 * ------------------------------------------------
 * 依 data/articles.json 裡「已發布」的文章，加上固定頁面，
 * 產生給搜尋引擎看的網站地圖。
 *
 * 由 .github/workflows/build-sitemap.yml 在每次推送時執行。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE = "https://twhouse416.github.io/chengguo-site";

const today = new Date().toISOString().slice(0, 10);

/* 固定頁面 */
const staticPages = [
  { loc: `${SITE}/`,                            priority: "1.0", freq: "daily"   },
  { loc: `${SITE}/notes/`,                      priority: "0.8", freq: "weekly"  },
  { loc: `${SITE}/videos/`,                     priority: "0.8", freq: "weekly"  },
  { loc: `${SITE}/tools/school-zone/`,          priority: "0.7", freq: "monthly" },
  { loc: `${SITE}/tools/mortgage/`,             priority: "0.7", freq: "monthly" },
  { loc: `${SITE}/tools/qingan/`,               priority: "0.7", freq: "monthly" },
  { loc: `${SITE}/tools/property-tax/`,         priority: "0.7", freq: "monthly" },
];

/* 已發布的文章 */
let articlePages = [];
try {
  const data = JSON.parse(readFileSync(path.join(ROOT, "data/articles.json"), "utf-8"));
  articlePages = (data.articles || [])
    .filter(a => !a.draft)
    .map(a => ({
      loc: `${SITE}/notes/${a.slug}.html`,
      lastmod: a.updated || a.date,
      priority: "0.9",
      freq: "monthly",
    }));
} catch (e) {
  console.warn("[警告] 讀取文章資料失敗，sitemap 只會包含固定頁面：", e.message);
}

const all = [...staticPages, ...articlePages];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod || today}</lastmod>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf-8");
console.log(`[完成] sitemap.xml 已產生，共 ${all.length} 個網址（其中文章 ${articlePages.length} 篇）`);
