/**
 * 澄果團隊｜常見問題彙整頁 /faq/
 * ------------------------------------------------
 * 把 24 篇文章裡的 133 題 FAQ 集中成一頁，依主題分組。
 *
 * 設計取捨：
 *   這一頁只放「問題 + 一句話直答 + 連到完整說明」，不整段複製文章的答案。
 *   理由有兩個——完整複製會和文章頁形成大量重複內容；而 AI 搜尋引擎要的是
 *   一個能直接引用的短答，長篇論證它自己會去文章頁取。
 *   直答取自該題答案的第一句（文章的 FAQ 都是先給結論再解釋），
 *   太短時補第二句，確保能獨立成立。
 *
 * 社區頁的 1,000 多題 FAQ 刻意不收：它們是同型模板題（每個社區 4–5 題），
 * 放上來只會稀釋這一頁，對搜尋與 AI 都沒有幫助。
 *
 * ⚠️ 產生出來的 HTML 不要直接編輯，會被覆蓋。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, head, header, footer } from "./lib/layout.js";
import { webSlug, fillStats } from "./build-articles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* markdown 連結與粗體在這一頁不需要，轉成純文字 */
const plain = t => String(t || "")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  .replace(/\*\*/g, "")
  .trim();

/* 取第一句當直答；不足 22 字就補到第二句 */
function shortAnswer(text) {
  const t = plain(text);
  const one = t.match(/^(.{8,90}?[。！？])/);
  let s = one ? one[1] : t.slice(0, 80);
  if (s.length < 22) {
    const two = t.match(/^(.{8,120}?[。！？].{5,90}?[。！？])/);
    if (two) s = two[1];
  }
  return s;
}

/* 文章分類 → 這一頁的分組（順序就是頁面上的順序） */
const GROUPS = [
  ["買房入門", ["首購"]],
  ["選屋與行情", ["選屋", "生活圈"]],
  ["貸款", ["貸款"]],
  ["賣房", ["賣房"]],
  ["稅務與換屋", ["稅務", "換屋"]],
];

export function buildFaq({ articles = [], hasBuyers = false, dataUpdated = "" } = {}) {
  /* 收集：每題記下來源文章與錨點 */
  const items = [];
  articles.filter(a => !a.draft).forEach(a => {
    (a.faq || []).forEach((f, i) => {
      items.push({
        q: plain(fillStats(f.q)),
        short: shortAnswer(fillStats(f.a)),
        tag: a.tag || "其他",
        source: a.title,
        href: `../notes/${webSlug(a.slug)}.html#faq-${i + 1}`,
        url: `${SITE}/notes/${webSlug(a.slug)}.html#faq-${i + 1}`,
      });
    });
  });

  /* 同一個問題在不同篇出現過就只留第一個 */
  const seen = new Set();
  const uniq = items.filter(x => (seen.has(x.q) ? false : (seen.add(x.q), true)));

  const grouped = GROUPS.map(([name, tags]) => [name, uniq.filter(x => tags.includes(x.tag))])
    .filter(([, list]) => list.length);
  const rest = uniq.filter(x => !GROUPS.some(([, tags]) => tags.includes(x.tag)));
  if (rest.length) grouped.push(["其他", rest]);

  const total = uniq.length;
  const url = `${SITE}/faq/`;
  const lead = `買房、賣房、換屋最常被問到的 ${total} 個問題，每一題先給一句話的答案，`
    + `要看完整說明與數據依據再點進對應的文章。行情類的答案都算自本站收錄社區的內政部實價登錄成交紀錄，`
    + `每篇文章都標示統計方法與基準日。`;

  const nav = grouped.map(([name, list]) =>
    `<a href="#${encodeURIComponent(name)}" class="font-mono text-[13px] px-3 py-1.5 border border-line rounded-sm hover:border-orange transition">${esc(name)}（${list.length}）</a>`
  ).join("\n      ");

  const body = grouped.map(([name, list]) => `<section class="mt-14" id="${encodeURIComponent(name)}">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">${esc(name)}</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${list.length} 題</span>
    </div>
    <div class="space-y-7">
      ${list.map(x => `<div class="border-l-2 border-line pl-6">
        <h3 class="text-[17px] font-bold text-ink leading-snug">${esc(x.q)}</h3>
        <p class="mt-2.5 text-[16px] text-inkSoft leading-[1.95]">${esc(x.short)}</p>
        <a href="${x.href}" class="inline-block mt-2 font-mono text-[12px] text-orangeDeep hover:underline">完整說明：${esc(x.source)} →</a>
      </div>`).join("\n      ")}
    </div>
  </section>`).join("\n  ");

  const jsonLd = [
    { "@context": "https://schema.org", "@type": "FAQPage",
      name: "常見問題", url, inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      publisher: { "@type": "RealEstateAgent", name: BRAND.teamName, url: `${SITE}/` },
      mainEntity: uniq.map(x => ({
        "@type": "Question", name: x.q,
        acceptedAnswer: { "@type": "Answer", text: x.short, url: x.url },
      })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "常見問題", item: url },
      ] },
  ];

  const html = [
    head({
      title: `高雄買房賣房常見問題｜${total} 題一次看｜${BRAND.teamName}`,
      description: `高雄買房、賣房、換屋的 ${total} 個常見問題與直接回答：自備款、貸款成數、公設比、屋齡、學區、開價、稅費與委託簽約，數據取自本站整理的內政部實價登錄成交紀錄。`,
      keywords: "高雄買房常見問題,高雄賣房問題,自備款要多少,貸款成數,公設比,學區查詢,房地合一稅,仲介服務費",
      canonical: url, ogImage: `${SITE}/assets/logo-full.png`, depth: 1, jsonLd,
    }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span><span>常見問題</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">FAQ</div>
  <h1 class="display text-[30px] md:text-[38px]">常見問題</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-3xl">${esc(lead)}</p>

  <div class="flex flex-wrap gap-2 mt-7">
      ${nav}
  </div>

  ${body}

  <section class="mt-16 pt-10 border-t-2 border-ink">
    <p class="text-[16px] text-inkSoft leading-[1.95] max-w-3xl">
      找不到你的問題？歡迎直接來電，我們會用實際成交資料回答，而不是憑印象。
    </p>
    <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-5 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
  </section>
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");

  mkdirSync(path.join(ROOT, "faq"), { recursive: true });
  writeFileSync(path.join(ROOT, "faq", "index.html"), html, "utf-8");
  console.log("[產生]", `faq/index.html（${total} 題，${grouped.length} 個分類）`);
  return { count: total };
}
