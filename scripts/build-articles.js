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

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "notes");
const SITE = "https://twhouse416.github.io/chengguo-site";

const BRAND = {
  teamName: "台灣房屋 澄果團隊",
  legalName: "澄果資產有限公司",
  address: "804 高雄市鼓山區青海路416號",
  phone: "07-9766977",
  phoneHref: "tel:0797669977",
  officialSite: "https://store.twhg.com.tw/TE80",
};

/* ---------- 安全處理 ---------- */
const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* **粗體** 轉成 <strong> */
const rich = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-ink">$1</strong>');

const fmtDate = d => String(d || "").replaceAll("-", ".");

/* 依 showFrom / showUntil 判斷產生當下該不該輸出這個區塊 */
const today = new Date().toISOString().slice(0, 10);
function visible(b) {
  if (b.showFrom && today < b.showFrom) return false;
  if (b.showUntil && today >= b.showUntil) return false;
  return true;
}

/* ---------- 區塊轉 HTML ---------- */
function blockHtml(b) {
  switch (b.type) {
    case "h":
      return `<h2 class="display text-[23px] mt-16 mb-6 pt-7 border-t border-line">${esc(b.text)}</h2>`;

    case "p": {
      const paras = String(b.text || "").split(/\n\s*\n|\n/).map(t => t.trim()).filter(Boolean);
      return `<div class="mb-8">${paras
        .map(t => `<p class="text-[17px] leading-[2.05] text-inkSoft mb-5 last:mb-0">${rich(t)}</p>`)
        .join("")}</div>`;
    }

    case "list":
      return `<ul class="mb-9 space-y-4">${(b.items || [])
        .map((it, i) => `<li class="flex gap-3 text-[17px] leading-[1.95] text-inkSoft">
          <span class="font-mono text-[13px] text-orangeDeep pt-1.5 shrink-0">${String(i + 1).padStart(2, "0")}</span>
          <span>${rich(it)}</span></li>`)
        .join("")}</ul>`;

    case "table":
      return `<div class="mb-10 overflow-x-auto"><table class="w-full text-[16px] border border-line bg-surface">
        <thead><tr class="border-b border-line bg-paper">${(b.head || [])
          .map((h, i) => `<th class="font-mono text-[13px] tracking-wider text-inkFaint font-normal py-3 px-4 ${i === 0 ? "text-left" : "text-right"}">${esc(h)}</th>`)
          .join("")}</tr></thead>
        <tbody>${(b.rows || [])
          .map(row => `<tr class="border-b border-line last:border-0">${row
            .map((c, j) => `<td class="py-3.5 px-4 leading-relaxed ${j === 0 ? "text-left text-ink" : "text-right text-inkSoft"}">${rich(c)}</td>`)
            .join("")}</tr>`)
          .join("")}</tbody></table></div>`;

    case "note":
      return `<div class="mb-9 bg-tint border-l-2 border-orange px-6 py-5">
        <p class="text-[16px] leading-[1.95] text-orangeDeep">${rich(b.text)}</p></div>`;

    case "quote":
      return `<blockquote class="my-14 py-7 border-y-2 border-ink">
        <p class="display text-[20px] md:text-[22px] leading-[1.6]">${esc(b.text)}</p></blockquote>`;

    case "image":
      return `<figure class="my-12">
        <img src="../${esc(b.src)}" alt="${esc(b.alt || "")}" loading="lazy"
          class="w-full h-auto rounded-sm border border-line bg-surface" />
        ${b.caption ? `<figcaption class="mt-3 text-[14px] text-inkFaint leading-relaxed">${esc(b.caption)}</figcaption>` : ""}
      </figure>`;

    default:
      return "";
  }
}

/* ---------- 結構化資料 ---------- */
function jsonLd(a) {
  const url = `${SITE}/notes/${a.slug}.html`;
  const img = a.cover ? `${SITE}/${a.cover}` : `${SITE}/assets/logo-full.png`;

  const blocks = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      description: a.summary,
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
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return blocks
    .map(b => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join("\n");
}

/* ---------- 整頁 HTML ---------- */
function pageHtml(a, others) {
  const url = `${SITE}/notes/${a.slug}.html`;
  const img = a.cover ? `${SITE}/${a.cover}` : `${SITE}/assets/area-01-artmuseum.jpg`;
  const stale = a.reviewBy && today >= a.reviewBy;

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/png" href="../assets/logo-icon.png" />
<title>${esc(a.title)}｜${BRAND.teamName}</title>
<meta name="description" content="${esc(a.summary)}" />
${a.keywords?.length ? `<meta name="keywords" content="${esc(a.keywords.join("、"))}" />` : ""}
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${BRAND.teamName}" />
<meta property="og:title" content="${esc(a.title)}" />
<meta property="og:description" content="${esc(a.summary)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${img}" />
<meta property="og:locale" content="zh_TW" />
<meta property="article:published_time" content="${a.date}" />
<meta property="article:modified_time" content="${a.updated || a.date}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(a.title)}" />
<meta name="twitter:description" content="${esc(a.summary)}" />
<meta name="twitter:image" content="${img}" />

${jsonLd(a)}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = { theme: { extend: {
    colors: { ink:'#16191D', inkSoft:'#474D55', inkFaint:'#737A83',
      paper:'#F4F4F2', surface:'#FFFFFF', line:'#DEDCD7',
      orange:'#FD7305', orangeDeep:'#B85400', tint:'#FCEFE3' },
    fontFamily: { sans:['"Noto Sans TC"','sans-serif'], mono:['"IBM Plex Mono"','monospace'] },
    borderRadius: { DEFAULT:'3px', sm:'2px', md:'4px' },
  }}}
</script>
<style>
  body { background:#F4F4F2; -webkit-font-smoothing:antialiased; }
  ::selection { background:#FD7305; color:#fff; }
  .display { font-weight:900; letter-spacing:-0.02em; line-height:1.25; }
  :focus-visible { outline:2px solid #FD7305; outline-offset:2px; }
</style>
</head>
<body class="font-sans text-ink">

<header class="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-line">
  <div class="max-w-3xl mx-auto px-6 h-[68px] flex items-center justify-between">
    <a href="../index.html" class="flex items-center gap-3">
      <img src="../assets/logo-icon.png" alt="" class="w-9 h-9 object-contain" />
      <span class="leading-tight">
        <span class="block font-mono text-[11px] tracking-[0.2em] text-inkFaint">TAIWAN REALTY</span>
        <span class="block text-[17px] font-bold tracking-tight">澄果團隊</span>
      </span>
    </a>
    <a href="index.html" class="text-[15px] text-inkSoft hover:text-ink">← 所有文章</a>
  </div>
</header>

<main class="max-w-3xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a>
    <span class="mx-2">/</span>
    <a href="index.html" class="hover:text-orangeDeep">知識文章</a>
  </nav>

  <article>
    <div class="flex items-center gap-4 font-mono text-[12px] mb-4">
      <span class="text-orangeDeep tracking-wider">${esc(a.tag)}</span>
      <time class="text-inkFaint" datetime="${a.date}">${fmtDate(a.date)}</time>
      ${a.readMinutes ? `<span class="text-inkFaint">約 ${a.readMinutes} 分鐘</span>` : ""}
    </div>

    <h1 class="display text-[28px] md:text-[34px]">${esc(a.title)}</h1>
    <p class="mt-5 text-[17px] text-inkSoft leading-[1.95]">${esc(a.summary)}</p>

    ${stale ? `<div class="mt-7 bg-tint border-l-2 border-orange px-6 py-5">
      <p class="text-[16px] leading-[1.95] text-orangeDeep">
        本文最後更新於 ${fmtDate(a.updated || a.date)}。房市與法規變動快，部分內容可能已不是最新狀況，建議來電向我們確認。
      </p></div>` : ""}

    ${a.cover ? `<img src="../${esc(a.cover)}" alt="${esc(a.coverAlt || a.title)}"
      class="w-full h-auto rounded-sm border border-line bg-surface mt-8" />` : ""}

    <div class="mt-10">
      ${(a.blocks || []).filter(visible).map(blockHtml).join("\n      ")}
    </div>
  </article>

  ${a.faq?.length ? `<section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">常見問題</h2>
    <div class="space-y-6">
      ${a.faq.map(f => `<div class="border-l-2 border-line pl-6">
        <h3 class="text-[17px] font-bold leading-snug mb-3">${esc(f.q)}</h3>
        <p class="text-[16px] leading-[1.95] text-inkSoft">${esc(f.a)}</p>
      </div>`).join("\n      ")}
    </div>
  </section>` : ""}

  ${a.sources?.length ? `<section class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-4">Sources</div>
    <ul class="space-y-2">
      ${a.sources.map(sc => `<li class="text-[15px] text-inkSoft leading-relaxed">
        <a href="${esc(sc.url)}" target="_blank" rel="noopener noreferrer nofollow"
          class="hover:text-orangeDeep underline decoration-line underline-offset-4">${esc(sc.name)}</a>
      </li>`).join("\n      ")}
    </ul>
    <p class="text-[14px] text-inkFaint leading-relaxed mt-4">
      本文內容依上述公開資料整理，並結合澄果團隊在地實務經驗。法規與行情可能變動，正式決策請以主管機關公告為準。
    </p>
  </section>` : ""}

  <section class="mt-14 pt-8 border-t border-line">
    <div class="flex flex-wrap gap-6 items-start">
      <img src="../assets/logo-icon.png" alt="" class="w-14 h-14 object-contain shrink-0" />
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
    <a href="${BRAND.phoneHref}"
      class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">
      來電諮詢 ${BRAND.phone}
    </a>
  </section>

  ${others.length ? `<section class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">More</div>
    <div class="space-y-6">
      ${others.map(o => `<a href="${o.slug}.html" class="flex gap-4 group items-start">
        ${o.cover ? `<img src="../${esc(o.cover)}" alt="" loading="lazy"
          class="w-24 aspect-[3/2] object-cover bg-paper rounded-sm border border-line shrink-0" />` : ""}
        <div>
          <div class="font-mono text-[12px] text-orangeDeep tracking-wider mb-1">${esc(o.tag)}</div>
          <h3 class="text-[17px] font-bold leading-snug group-hover:text-orangeDeep transition">${esc(o.title)}</h3>
        </div>
      </a>`).join("\n      ")}
    </div>
  </section>` : ""}
</main>

<footer class="border-t border-line">
  <div class="max-w-3xl mx-auto px-6 py-8 font-mono text-[12px] text-inkFaint flex flex-wrap gap-x-6 gap-y-2 justify-between">
    <span>© ${new Date().getFullYear()} ${BRAND.legalName}</span>
    <a href="../index.html" class="hover:text-orangeDeep">回首頁</a>
  </div>
</footer>

</body>
</html>
`;
}

/* ---------- 主流程 ---------- */
function main() {
  const data = JSON.parse(readFileSync(path.join(ROOT, "data/articles.json"), "utf-8"));
  const published = (data.articles || []).filter(a => !a.draft);

  mkdirSync(OUT_DIR, { recursive: true });

  /* 先清掉舊的產生檔（避免文章改為草稿後靜態頁還留著） */
  const keep = new Set(["index.html", "article.html"]);
  readdirSync(OUT_DIR)
    .filter(f => f.endsWith(".html") && !keep.has(f))
    .forEach(f => {
      if (!published.some(a => `${a.slug}.html` === f)) {
        unlinkSync(path.join(OUT_DIR, f));
        console.log("[移除] 已不再發布：", f);
      }
    });

  published.forEach(a => {
    const others = published.filter(o => o.slug !== a.slug).slice(0, 3);
    writeFileSync(path.join(OUT_DIR, `${a.slug}.html`), pageHtml(a, others), "utf-8");
    console.log("[產生]", `notes/${a.slug}.html`);
  });

  console.log(`[完成] 共產生 ${published.length} 個靜態文章頁`);
}

main();
