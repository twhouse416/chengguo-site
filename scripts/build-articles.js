/**
 * 澄果團隊｜文章靜態頁產生器
 * ------------------------------------------------
 * 依 data/articles.json 裡「已發布」的文章，各產生一個真正的 HTML 檔案，
 * 內容直接寫在 HTML 裡，不需要執行 JavaScript 就讀得到。
 *
 * 為什麼要這樣做：
 * Google 雖然會執行 JS，但索引優先度較低；ChatGPT、Perplexity 等 AI 爬蟲
 * 多半不執行 JS，只讀原始 HTML。內容若靠 JS 載入，它們看到的是空白頁。
 *
 * 輸出：notes/<slug>.html
 * 舊網址 notes/article.html?slug=xxx 仍可使用，會自動導向新網址。
 *
 * 由 .github/workflows/build-articles.yml 在 articles.json 變動時執行。
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, rich, fmtDate, visible, head, header, footer , thumbOf, imgSize } from "./lib/layout.js";
import { articleRelated, articleNext } from "./lib/related.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "notes");
const today = new Date().toISOString().slice(0, 10);

/* ---------- 區塊轉 HTML ---------- */
/* ---------- 站台統計的自動代入 ----------
 * 文章裡的「N 個社區、N 筆成交」如果寫死，資料一長就會對不上——
 * 2026/10 回補資料池之後，成交從 10,302 筆變成 26,276 筆，
 * 七篇文章裡 51 處計數全部過期，而且沒有任何機制會發現。
 *
 * 作法：文章內文寫 {{社區數}}、{{成交筆數}}、{{資料更新日}}，
 * 建置時代入當下的真實數字，之後永遠不會再錯。
 * 衍生統計（單價中位數、百分比）無法這樣處理——那些跟解讀文字綁在一起，
 * 數字變了文案也要改——改用 statsBasis 標明統計基準，見 basisNote()。
 */
let STATS = { communityCount: 0, dealTotal: 0, dataUpdated: "", areas: [] };
export function setArticleStats(s) { STATS = { ...STATS, ...s }; }

const nf = n => Number(n || 0).toLocaleString("en-US");
export function fillStats(text) {
  return String(text || "")
    .replace(/\{\{\s*社區數\s*\}\}/g, () => nf(STATS.communityCount))
    .replace(/\{\{\s*成交筆數\s*\}\}/g, () => nf(STATS.dealTotal))
    .replace(/\{\{\s*資料更新日\s*\}\}/g, () => STATS.dataUpdated || "")
    .replace(/\{\{\s*有公設比社區數\s*\}\}/g, () => nf(STATS.ratioCount))
    /* 生活圈層級：{{瑞豐社區數}}、{{瑞豐成交筆數}}，四個生活圈都可用 */
    .replace(/\{\{\s*([^}\s]+?)(社區數|成交筆數)\s*\}\}/g, (whole, key, kind) => {
      const a = (STATS.areas || []).find(x => x.key.includes(key) || key.includes(x.key));
      if (!a) return whole;
      return nf(kind === "社區數" ? a.communities : a.deals);
    });
}

/* 把整份文章物件裡的 {{...}} 一次代入。
   之前是逐個出口呼叫 fillStats，結果漏掉相關文章區塊、文章列表、llms.txt——
   那些地方會渲染「別篇」的標題與摘要，於是 {{ }} 又跑出來。
   正確的做法是在載入文章之後就把資料代乾淨，所有下游自然都對。 */
export function fillArticleStats(node) {
  if (typeof node === "string") return fillStats(node);
  if (Array.isArray(node)) return node.map(fillArticleStats);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = fillArticleStats(v);
    return out;
  }
  return node;
}

/* 統計基準：文章可在 statsBasis 填寫這份分析用的資料範圍與基準日。
   有填就在內文最前面顯示，讓讀者知道數字是對哪一份快照成立的。 */
function basisNote(a) {
  if (!a.statsBasis) return "";
  return `<p class="text-[14px] text-inkFaint leading-[1.9] mb-8 pb-6 border-b border-line">
    <strong class="font-bold text-inkSoft">統計基準</strong>：${esc(fillStats(a.statsBasis))}
  </p>`;
}

/* 建置時的過期檢查：文章若寫死了看起來像「全站計數」的數字，
   而且跟現況差距超過一成，就在日誌示警。寧可吵一點，也不要安靜地錯。 */
export function checkStaleCounts(articles) {
  /* 只檢查「宣稱是全站範圍」的計數。文章裡大量出現的子集數字
     （瑞豐 35 個社區、1,010 筆成交）是正確的，不能一起抓進來示警，
     否則警告會被雜訊淹沒而失去作用。
     判準：數字前方 14 字內出現 本站／全站／站上／收錄 這類全域字眼，
     且中間沒有生活圈、建商、學區之類的限定詞（「本站收錄的瑞豐 35 個社區」是對的）。 */
  const SCOPE = "(?:本站|全站|站上|收錄|本網站)";
  const warn = [];
  articles.filter(a => !a.draft).forEach(a => {
    const text = JSON.stringify(a);
    [[new RegExp(SCOPE + "[^，。！？]{0,14}?([\\d,]{4,})\\s*筆", "g"), STATS.dealTotal, "筆成交"],
     [new RegExp(SCOPE + "[^，。！？]{0,14}?(\\d{2,4})\\s*個社區", "g"), STATS.communityCount, "個社區"]]
      .forEach(([re, now, label]) => {
        for (const m of text.matchAll(re)) {
          /* 句子裡若指名生活圈，就跟該生活圈的數字比，不要跟全站比——
             「本站收錄的瑞豐 35 個社區」要對照瑞豐的 37，不是全站的 255。 */
          const areaHit = (STATS.areas || []).find(x => m[0].includes(x.key));
          const base = areaHit ? (label === "個社區" ? areaHit.communities : areaHit.deals) : now;
          const scope = areaHit ? areaHit.key : "全站";
          if (/建設|國小|國中/.test(m[0])) continue;
          const v = Number(String(m[1]).replace(/,/g, ""));
          if (!v || !base) continue;
          if (Math.abs(v - base) / base > 0.1) {
            warn.push(`${a.slug}：寫死「${m[1]} ${label}」，${scope}現況 ${nf(base)}`);
          }
        }
      });
  });
  const uniq = [...new Set(warn)];
  if (uniq.length) {
    console.warn(`[提醒] ${uniq.length} 處文章計數與現況差距超過一成（數字若是指某個生活圈，請自行對照該區）：`);
    uniq.slice(0, 15).forEach(w => console.warn("        " + w));
    if (uniq.length > 15) console.warn(`        … 另 ${uniq.length - 15} 處`);
  }
  return uniq;
}

function blockHtml(b, fallbackAlt = "") {
  switch (b.type) {
    case "h":
      return `<h2 class="display text-[23px] mt-16 mb-6 pt-7 border-t border-line">${esc(fillStats(b.text))}</h2>`;

    case "p": {
      const paras = fillStats(b.text).split(/\n\s*\n|\n/).map(t => t.trim()).filter(Boolean);
      return `<div class="mb-8">${paras
        .map(t => `<p class="text-[17px] leading-[2.05] text-inkSoft mb-5 last:mb-0">${rich(t)}</p>`)
        .join("")}</div>`;
    }

    case "list":
      return `<ul class="mb-9 space-y-4">${(b.items || [])
        .map((it, i) => `<li class="flex gap-3 text-[17px] leading-[1.95] text-inkSoft">
          <span class="font-mono text-[13px] text-orangeDeep pt-1.5 shrink-0">${String(i + 1).padStart(2, "0")}</span>
          <span>${rich(fillStats(it))}</span></li>`)
        .join("")}</ul>`;

    case "table":
      return `<div class="mb-10 overflow-x-auto"><table class="w-full text-[16px] border border-line bg-surface">
        <thead><tr class="border-b border-line bg-paper">${(b.head || [])
          .map((h, i) => `<th class="font-mono text-[13px] tracking-wider text-inkFaint font-normal py-3 px-4 ${i === 0 ? "text-left" : "text-right"}">${esc(fillStats(h))}</th>`)
          .join("")}</tr></thead>
        <tbody>${(b.rows || [])
          .map(row => `<tr class="border-b border-line last:border-0">${row
            .map((c, j) => `<td class="py-3.5 px-4 leading-relaxed ${j === 0 ? "text-left text-ink" : "text-right text-inkSoft"}">${rich(fillStats(c))}</td>`)
            .join("")}</tr>`)
          .join("")}</tbody></table></div>`;

    case "note":
      return `<div class="mb-9 bg-tint border-l-2 border-orange px-6 py-5">
        <p class="text-[16px] leading-[1.95] text-orangeDeep">${rich(fillStats(b.text))}</p></div>`;

    case "quote":
      return `<blockquote class="my-14 py-7 border-y-2 border-ink">
        <p class="display text-[20px] md:text-[22px] leading-[1.6]">${esc(fillStats(b.text))}</p></blockquote>`;

    case "image":
      return `<figure class="my-12">
        <img src="../${esc(b.src)}" alt="${esc(b.alt || fallbackAlt)}" loading="lazy"${imgSize(b.src)}
          class="w-full h-auto rounded-sm border border-line bg-surface" />
        ${b.caption ? `<figcaption class="mt-3 text-[14px] text-inkFaint leading-relaxed">${esc(b.caption)}</figcaption>` : ""}
      </figure>`;

    default:
      return "";
  }
}

/* ---------- 結構化資料 ---------- */
function jsonLd(a) {
  const url = `${SITE}/notes/${webSlug(a.slug)}.html`;
  const img = a.cover ? `${SITE}/${a.cover}` : `${SITE}/assets/logo-full.png`;

  const blocks = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: fillStats(a.title),
      description: fillStats(a.summary),
      image: [img],
      datePublished: a.date,
      dateModified: a.updated || a.date,
      inLanguage: "zh-TW",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: {
        "@type": "Organization",
        name: BRAND.teamName,
        url: BRAND.officialSite,
        telephone: BRAND.phone,
        address: {
          "@type": "PostalAddress",
          streetAddress: "鼓山區青海路416號",
          addressLocality: "高雄市",
          postalCode: "804",
          addressCountry: "TW",
        },
      },
      publisher: {
        "@type": "Organization",
        name: BRAND.legalName,
        logo: { "@type": "ImageObject", url: `${SITE}/assets/logo-full.png` },
      },
      ...(a.keywords?.length ? { keywords: a.keywords.join(", ") } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "知識文章", item: `${SITE}/notes/` },
        { "@type": "ListItem", position: 3, name: a.title, item: url },
      ],
    },
  ];

  if (a.faq?.length) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: a.faq.map(f => ({
        "@type": "Question",
        name: fillStats(f.q),
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return blocks;   // 交給 head() 統一輸出
}

/* ---------- 整頁 HTML ---------- */
function pageHtml(a, others, hasBuyers) {
  const url = `${SITE}/notes/${webSlug(a.slug)}.html`;
  const img = a.cover ? `${SITE}/${a.cover}` : `${SITE}/assets/area-01-artmuseum.jpg`;
  const stale = a.reviewBy && today >= a.reviewBy;

  return [
    head({
      title: `${a.title}｜${BRAND.teamName}`,
      description: fillStats(a.summary),
      keywords: a.keywords?.length ? a.keywords.join("、") : "",
      canonical: url, ogImage: img, ogType: "article", depth: 1,
      extra: `<meta property="article:published_time" content="${a.date}" />
<meta property="article:modified_time" content="${a.updated || a.date}" />`,
      jsonLd: jsonLd(a),
    }),
    header({ depth: 1, hasBuyers, compact: true }),
    `<main class="max-w-3xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span>
    <a href="index.html" class="hover:text-orangeDeep">知識文章</a>
  </nav>

  <article>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] mb-4">
      <span class="text-orangeDeep tracking-wider">${esc(a.tag)}</span>
      <time class="text-inkFaint" datetime="${a.date}">${fmtDate(a.date)}</time>
      ${a.readMinutes ? `<span class="text-inkFaint">約 ${a.readMinutes} 分鐘</span>` : ""}
    </div>
    ${/* 署名列
         ------------------------------------------------
         原本文章只有 Article schema 裡的 author，頁面上看不到署名。
         不動產屬 Google 定義的 YMYL 領域，「誰寫的、憑什麼」要讓讀者
         在頁面上直接看到，不能只寫在結構化資料裡。
         署名一律用團隊名（澄果團隊的決定，不列個別經紀人），連到關於團隊頁。
         有 updated 且與發佈日不同時一併標出最後更新日——
         稅務與貸款類文章的時效性讀者最在意。 */""}
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px] text-inkFaint mb-7 pb-6 border-b border-line">
      <span>作者</span>
      <a href="../about/index.html" rel="author" class="text-ink font-medium hover:text-orangeDeep">${esc(BRAND.teamName)}</a>
      <span>・高雄在地房仲，深耕美術館特區、農十六、瑞豐巨蛋與中都重劃區</span>
      ${a.updated && a.updated !== a.date
        ? `<span class="font-mono text-[13px] w-full sm:w-auto">最後更新 <time datetime="${a.updated}">${fmtDate(a.updated)}</time></span>`
        : ""}
    </div>
    <h1 class="display text-[28px] md:text-[34px]">${esc(a.title)}</h1>
    <p class="mt-5 text-[17px] text-inkSoft leading-[1.95]">${esc(fillStats(a.summary))}</p>
    ${stale ? `<div class="mt-7 bg-tint border-l-2 border-orange px-6 py-5">
      <p class="text-[16px] leading-[1.95] text-orangeDeep">
        本文最後更新於 ${fmtDate(a.updated || a.date)}。房市與法規變動快，部分內容可能已不是最新狀況，建議來電向我們確認。
      </p></div>` : ""}
    ${a.cover ? `<img src="../${esc(a.cover)}" alt="${esc(a.coverAlt || a.title)}"${imgSize(a.cover)}
      class="w-full h-auto rounded-sm border border-line bg-surface mt-8" />` : ""}
    <div class="mt-10">
      ${basisNote(a)}
      ${(a.blocks || []).filter(visible).map(b => blockHtml(b, a.title)).join("\n      ")}
    </div>
  </article>

  ${a.faq?.length ? `<section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">常見問題</h2>
    <div class="space-y-6">
      ${a.faq.map(f => `<div class="border-l-2 border-line pl-6">
        <h3 class="text-[17px] font-bold leading-snug mb-3">${esc(fillStats(f.q))}</h3>
        <p class="text-[16px] leading-[1.95] text-inkSoft">${esc(f.a)}</p></div>`).join("\n      ")}
    </div>
  </section>` : ""}

  ${a.sources?.length ? `<section class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-4">Sources</div>
    <ul class="space-y-2">
      ${a.sources.map(sc => `<li class="text-[15px] text-inkSoft leading-relaxed">
        <a href="${esc(sc.url)}" target="_blank" rel="noopener noreferrer nofollow"
          class="hover:text-orangeDeep underline decoration-line underline-offset-4">${esc(sc.name)}</a></li>`).join("\n      ")}
    </ul>
    <p class="text-[14px] text-inkFaint leading-relaxed mt-4">
      本文內容依上述公開資料整理，並結合澄果團隊在地實務經驗。法規與行情可能變動，正式決策請以主管機關公告為準。
    </p>
  </section>` : ""}

  <section class="mt-14 pt-8 border-t border-line">
    <div class="flex flex-wrap gap-6 items-start">
      <img src="../assets/logo-icon.png" alt="" width="56" height="56" class="w-14 h-14 object-contain shrink-0" />
      <div class="flex-1 min-w-[240px]">
        <div class="font-mono text-[12px] tracking-wider text-inkFaint mb-1">關於作者</div>
        <h2 class="text-[18px] font-bold tracking-tight mb-3">${BRAND.teamName}</h2>
        <p class="text-[15px] text-inkSoft leading-[1.9]">
          深耕高雄鼓山美術館特區、農十六特區、左營瑞豐巨蛋生活圈與三民區中都重劃區 10 年以上，
          累計服務件數超過 150 件，歷年獲台灣房屋評鑑優質與團隊績效獎項共 15 項。
          截至 115 年 7 月，約 58% 成交業績來自美術館特區與農十六。
          提供免費房屋估價、成交行情分析、售屋策略規劃，以及首購購屋建議與換屋規劃。
        </p>
        <p class="font-mono text-[13px] text-inkFaint leading-[1.9] mt-3">
          ${BRAND.address}｜<a href="${BRAND.phoneHref}" class="hover:text-orangeDeep">${BRAND.phone}</a>
        </p>
      </div>
    </div>
  </section>

  <section class="mt-14 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">有問題，直接問比較快</h2>
    <p class="mt-3 text-[16px] leading-[1.9]">
      每個人的狀況都不一樣。把你的情形說給我們聽，澄果團隊會用實際成交資料和在地經驗回答你。
    </p>
    <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
  </section>

  ${articleRelated(a, "../")}
  ${articleNext(a, "../")}

  ${others.length ? `<section class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">More</div>
    <div class="space-y-6">
      ${others.map(o => `<a href="${webSlug(o.slug)}.html" class="flex gap-4 group items-start">
        ${o.cover ? `<img src="../${esc(thumbOf(o.cover))}" alt="${esc(o.title)}" loading="lazy"${imgSize(thumbOf(o.cover))}
          class="w-24 aspect-[3/2] object-cover bg-paper rounded-sm border border-line shrink-0" />` : ""}
        <div>
          <div class="font-mono text-[12px] text-orangeDeep tracking-wider mb-1">${esc(o.tag)}</div>
          <h3 class="text-[17px] font-bold leading-snug group-hover:text-orangeDeep transition">${esc(o.title)}</h3>
        </div></a>`).join("\n      ")}
    </div>
  </section>` : ""}
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}

/* ---------- 主流程 ---------- */
/* ---------- 網址用的英數 slug ----------
 * 後台建立文章時，slug 是從中文標題自動帶出來的，於是產生了
 *   notes/高雄美術館買房攻略-房價-生活機能-建案與選屋重點一次看-高雄買房顧問澄果團隊.html
 * 這種網址。分享出去會變成一長串 %E9%AB%98%E9%9B%84...，沒人想點，
 * 而且寫進 sitemap 的 <loc> 沒有做 URL 編碼、不符 sitemap 規範。
 *
 * 這裡不動 data/articles.json（後台還是照原本的方式管理），
 * 只在產生 HTML 時把網址換成英數 slug，並在舊的中文檔名留一個
 * noindex 的轉跳頁，先前分享出去的連結不會失效。
 *
 * 以後新增文章時，建議直接在後台把 slug 填成英數。
 */
const SLUG_ALIAS = {
  "高雄美術館買房攻略-房價-生活機能-建案與選屋重點一次看-高雄買房顧問澄果團隊": "meishuguan-buying-guide",
  "為什麼我們專營高雄美術館特區": "why-we-focus-art-museum",
};
export function webSlug(slug) {
  return SLUG_ALIAS[slug] || slug;
}
/* 需要留轉跳頁的舊檔名 */
function aliasPairs(articles) {
  return articles
    .filter(a => SLUG_ALIAS[a.slug])
    .map(a => ({ from: a.slug, to: SLUG_ALIAS[a.slug], title: a.title }));
}
function redirectPage({ from, to, title }) {
  /* 純 HTML 的轉跳（GitHub Pages 不能設 301），
     加 noindex 與 canonical，讓搜尋引擎只收新網址。 */
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>網址已更新｜${esc(title)}</title>
<meta name="robots" content="noindex,follow" />
<link rel="canonical" href="${SITE}/notes/${to}.html" />
<meta http-equiv="refresh" content="0; url=${to}.html" />
<script>location.replace("${to}.html" + location.hash);</script>
<style>body{background:#F4F4F2;color:#474D55;font-family:system-ui,"Noto Sans TC",sans-serif;
padding:12vh 8vw;line-height:1.9}a{color:#C1502E}</style>
</head>
<body>
<p>這篇文章的網址已經更新，正在帶你過去。</p>
<p><a href="${to}.html">${esc(title)}</a></p>
</body>
</html>
`;
}

export function buildArticles({ articles, hasBuyers }) {
  const published = articles;
  mkdirSync(OUT_DIR, { recursive: true });

  /* 先清掉舊的產生檔（避免文章改為草稿後靜態頁還留著） */
  const keep = new Set(["index.html", "article.html"]);
  readdirSync(OUT_DIR)
    .filter(f => f.endsWith(".html") && !keep.has(f))
    .forEach(f => {
      if (!published.some(a => `${webSlug(a.slug)}.html` === f || `${a.slug}.html` === f)) {
        unlinkSync(path.join(OUT_DIR, f));
        console.log("[移除] 已不再發布：", f);
      }
    });

  published.forEach(a => {
    const others = published.filter(o => o.slug !== a.slug).slice(0, 3);
    writeFileSync(path.join(OUT_DIR, `${webSlug(a.slug)}.html`), pageHtml(a, others, hasBuyers), "utf-8");
    console.log("[產生]", `notes/${webSlug(a.slug)}.html`);
  });

  /* 舊的中文檔名：留一個 noindex 的轉跳頁，先前分享出去的連結不會失效 */
  aliasPairs(published).forEach(pair => {
    writeFileSync(path.join(OUT_DIR, `${pair.from}.html`), redirectPage(pair), "utf-8");
    console.log("[產生] 舊網址轉跳：", `notes/${pair.from}.html`, "→", `${pair.to}.html`);
  });
  console.log(`[完成] 共產生 ${published.length} 個靜態文章頁`);
}
