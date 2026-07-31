/**
 * 澄果團隊｜試算工具頁的靜態外殼
 * ------------------------------------------------
 * 工具頁的結構：
 *   靜態 HTML（爬蟲讀得到）
 *     ├─ 麵包屑、H1、開頭說明
 *     ├─ 提醒框（若有）
 *     ├─ <div id="calc"> ← React 只掛載計算器
 *     ├─ Notes 說明段落
 *     ├─ FAQ（若有）
 *     └─ CTA
 *
 * 計算器本身是互動元件，維持 React；
 * 但所有文字內容都在 HTML 裡，不執行 JS 也讀得到。
 */

import { SITE, BRAND, esc, head, header, footer } from "./layout.js";

/**
 * @param {object} o
 * @param {string} o.slug        工具目錄名，例如 mortgage
 * @param {string} o.code        Tool 01 之類的編號
 * @param {string} o.title       H1
 * @param {string} o.pageTitle   <title>
 * @param {string} o.description meta description
 * @param {string} o.keywords
 * @param {string} o.intro       H1 底下的說明段落（純文字，可含換行）
 * @param {string} [o.warn]      橘色提醒框內容
 * @param {string[]} o.notes     底部說明條列
 * @param {string} [o.sourceName] 來源名稱
 * @param {string} [o.sourceUrl]
 * @param {Array<[string,string]>} [o.faq]
 * @param {string} o.ctaTitle
 * @param {string} o.ctaBody
 * @param {string} o.calcScript  React 計算器的程式碼（不含 <script> 標籤）
 * @param {boolean} [o.wide]     版面寬度用 max-w-4xl（預設）或 max-w-5xl
 * @param {boolean} hasBuyers
 */
export function buildTool(o, hasBuyers = false) {
  const url = `${SITE}/tools/${o.slug}/`;
  const width = o.wide ? "max-w-5xl" : "max-w-4xl";

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: o.title,
      url,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      inLanguage: "zh-TW",
      description: o.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "TWD" },
      provider: {
        "@type": "RealEstateAgent",
        name: BRAND.teamName,
        telephone: "+886-7-9766977",
        address: {
          "@type": "PostalAddress", streetAddress: BRAND.addressShort,
          addressLocality: "高雄市", postalCode: "804", addressCountry: "TW",
        },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "試算工具", item: `${SITE}/#tools` },
        { "@type": "ListItem", position: 3, name: o.title, item: url },
      ],
    },
  ];

  if (o.faq?.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: o.faq.map(([q, a]) => ({
        "@type": "Question", name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    });
  }

  return [
    head({
      title: o.pageTitle,
      description: o.description,
      keywords: o.keywords,
      canonical: url,
      ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 2,
      jsonLd,
    }),
    header({ depth: 2, hasBuyers, compact: true }),
    `<main class="${width} mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span>
    <a href="../../index.html#tools" class="hover:text-orangeDeep">試算工具</a><span class="mx-2">/</span>
    <span>${esc(o.title)}</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">${esc(o.code)}</div>
  <h1 class="display text-[30px] md:text-[36px]">${esc(o.title)}</h1>
  <p class="mt-4 text-[16px] text-inkSoft leading-[1.9] max-w-2xl">${o.intro}</p>
  ${o.warn ? `<div class="mt-5 bg-tint border border-orange/30 rounded-sm px-5 py-4 text-[15px] text-orangeDeep leading-[1.8]">${o.warn}</div>` : ""}
  <div class="mt-6 h-px bg-line"></div>

  <!-- 計算器：互動元件，由 React 掛載 -->
  <div id="calc" class="mt-8">
    <p class="font-mono text-[13px] text-inkFaint">載入試算工具中…</p>
    <noscript>
      <p class="text-[15px] text-inkSoft leading-[1.9]">
        試算功能需要開啟 JavaScript 才能使用。你也可以直接來電
        <a href="${BRAND.phoneHref}" class="text-orangeDeep underline">${BRAND.phone}</a>，我們幫你算。
      </p>
    </noscript>
  </div>

  <section class="mt-14 border-t border-line pt-8">
    <h2 class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-4">Notes</h2>
    <ul class="space-y-3 text-[15px] text-inkSoft leading-[1.9]">
      ${o.notes.map(n => `<li>・ ${n}</li>`).join("\n      ")}
    </ul>
    ${o.sourceUrl ? `<a href="${o.sourceUrl}" target="_blank" rel="noopener noreferrer"
      class="inline-block mt-5 font-mono text-[13px] text-orangeDeep hover:underline">${esc(o.sourceName || "資料來源")} →</a>` : ""}
  </section>

  ${o.faq?.length ? `<section class="mt-14 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">常見問題</h2>
    <div class="border-t border-line">
      ${o.faq.map(([q, a]) => `<details class="border-b border-line group">
        <summary class="w-full flex items-start justify-between gap-6 py-6 text-left">
          <h3 class="text-[17px] font-bold leading-snug tracking-tight group-hover:text-orangeDeep transition">${esc(q)}</h3>
          <span class="faq-plus font-mono text-[20px] text-orangeDeep shrink-0 leading-none mt-1 transition-transform">＋</span>
        </summary>
        <p class="text-[16px] text-inkSoft leading-[2] pb-7 pr-12">${esc(a)}</p>
      </details>`).join("\n      ")}
    </div>
  </section>` : ""}

  <section class="mt-12 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">${esc(o.ctaTitle)}</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">${o.ctaBody}</p>
    <div class="mt-6 flex flex-wrap gap-3">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
      <a href="${BRAND.officialSite}" target="_blank" rel="noopener noreferrer"
        class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">官方網站</a>
    </div>
  </section>

  <nav class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-5">其他工具</div>
    <div class="grid sm:grid-cols-3 gap-4">
      ${[["school-zone", "學區查詢"], ["mortgage", "房貸試算"], ["qingan", "新青安 3.0 試算"], ["property-tax", "房地合一稅試算"]]
        .filter(([s]) => s !== o.slug)
        .map(([s, t]) => `<a href="../${s}/index.html" class="border border-line rounded-sm bg-surface px-5 py-4 hover:border-orange hover:bg-tint transition">
          <span class="text-[16px] font-bold tracking-tight">${t}</span>
          <span class="block font-mono text-[12px] text-orangeDeep mt-1">開始使用 →</span></a>`).join("\n      ")}
    </div>
  </nav>
</main>

<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="text/babel">
${o.calcScript}
</script>`,
    footer({ depth: 2, hasBuyers, compact: true }),
  ].join("\n");
}
