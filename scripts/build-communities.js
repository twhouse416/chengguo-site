/**
 * 澄果團隊｜社區獨立頁面產生器
 * ------------------------------------------------
 * 為每個社區產生一個獨立頁面，包含：
 *   - 社區基本資料（戶數、樓層、坪數、公設比、車位）
 *   - 實價登錄成交紀錄（逐筆列出，不算平均）
 *   - 條件觀察、學區資訊、FAQ
 *
 * 成交紀錄由 scripts/fetch-market-data.js 每日更新到 data/community-deals.json。
 *
 * 為什麼逐筆列出而不算平均：
 * 單一社區半年成交常常只有個位數，算平均容易失真。
 * 逐筆列出樓層、坪數、單價，讓人自己找條件相近的比對，反而更有參考價值。
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, fmtDate, head, header, footer, sectionHead } from "./lib/layout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "communities");

/* ---------- 成交紀錄表格 ---------- */
function dealsTable(deals) {
  if (!deals?.length) {
    return `<div class="border border-line rounded-sm bg-surface p-8">
      <p class="text-[16px] text-inkSoft leading-[1.9]">
        近期尚未擷取到這個社區的實價登錄成交紀錄。內政部資料每月公告三次，
        新成交需要一段時間才會揭露。想知道目前的行情與屋主開價，歡迎直接來電。
      </p>
      <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電詢問行情 ${BRAND.phone}</a>
    </div>`;
  }

  const prices = deals.map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
  const low = prices[0], high = prices[prices.length - 1];

  /* 資料多時只列最近 40 筆，其餘收在展開區塊裡，避免頁面過長 */
  const SHOW = 40;
  const shown = deals.slice(0, SHOW);
  const rest = deals.slice(SHOW);
  const presale = deals.filter(d => d.kind === "預售").length;
  const span = deals.length
    ? `${fmtDate(deals[deals.length - 1].date)}－${fmtDate(deals[0].date)}`
    : "";

  return `<div class="mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
    <div>
      <span class="font-mono text-[12px] text-inkFaint">成交筆數</span>
      <span class="font-mono text-[24px] font-semibold text-ink ml-2">${deals.length}</span>
    </div>
    <div>
      <span class="font-mono text-[12px] text-inkFaint">單價範圍</span>
      <span class="font-mono text-[24px] font-semibold text-orangeDeep ml-2">${low}–${high}</span>
      <span class="font-mono text-[13px] text-inkSoft ml-1">萬/坪</span>
    </div>
    ${presale ? `<div>
      <span class="font-mono text-[12px] text-inkFaint">其中預售</span>
      <span class="font-mono text-[20px] font-semibold text-ink ml-2">${presale}</span>
      <span class="font-mono text-[13px] text-inkSoft ml-1">筆</span>
    </div>` : ""}
    ${span ? `<div class="font-mono text-[12px] text-inkFaint">期間 ${span}</div>` : ""}
  </div>

  <div class="overflow-x-auto border border-line rounded-sm bg-surface">
    <table class="w-full text-[15px] min-w-[640px]">
      <thead>
        <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
          <th class="text-left font-normal py-3 px-4">成交日期</th>
          <th class="text-left font-normal py-3 px-4">類型</th>
          <th class="text-left font-normal py-3 px-4">樓層</th>
          <th class="text-left font-normal py-3 px-4">格局</th>
          <th class="text-right font-normal py-3 px-4">坪數</th>
          <th class="text-right font-normal py-3 px-4">單價</th>
          <th class="text-right font-normal py-3 px-4">總價</th>
        </tr>
      </thead>
      <tbody>
        ${shown.map(d => `<tr class="border-b border-line last:border-0">
          <td class="py-3.5 px-4 font-mono text-[14px] text-inkSoft">${fmtDate(d.date)}</td>
          <td class="py-3.5 px-4 text-[14px] ${d.kind === "預售" ? "text-orangeDeep" : "text-inkFaint"}">${esc(d.kind || "成屋")}</td>
          <td class="py-3.5 px-4 text-inkSoft">${esc(d.floor || "—")}${d.unit ? `<span class="block font-mono text-[12px] text-inkFaint">${esc(d.unit)}</span>` : ""}</td>
          <td class="py-3.5 px-4 text-inkSoft">${esc(d.layout || "—")}</td>
          <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.ping || "—"}</td>
          <td class="py-3.5 px-4 text-right font-mono font-semibold text-ink">${d.unitPrice}</td>
          <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.totalPrice ? d.totalPrice.toLocaleString("zh-TW") : "—"}</td>
        </tr>`).join("\n        ")}
      </tbody>
    </table>
  </div>

  ${rest.length ? `<details class="mt-4 group">
    <summary class="font-mono text-[13px] text-orangeDeep inline-flex items-center gap-2 select-none">
      展開其餘 ${rest.length} 筆較早的成交
      <span class="transition group-open:rotate-180 text-[10px]">▼</span>
    </summary>
    <div class="overflow-x-auto border border-line rounded-sm bg-surface mt-3">
      <table class="w-full text-[15px] min-w-[640px]">
        <thead>
          <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
            <th class="text-left font-normal py-3 px-4">成交日期</th>
            <th class="text-left font-normal py-3 px-4">類型</th>
            <th class="text-left font-normal py-3 px-4">樓層</th>
            <th class="text-left font-normal py-3 px-4">格局</th>
            <th class="text-right font-normal py-3 px-4">坪數</th>
            <th class="text-right font-normal py-3 px-4">單價</th>
            <th class="text-right font-normal py-3 px-4">總價</th>
          </tr>
        </thead>
        <tbody>
          ${rest.map(d => `<tr class="border-b border-line last:border-0">
            <td class="py-3.5 px-4 font-mono text-[14px] text-inkSoft">${fmtDate(d.date)}</td>
            <td class="py-3.5 px-4 text-[14px] ${d.kind === "預售" ? "text-orangeDeep" : "text-inkFaint"}">${esc(d.kind || "成屋")}</td>
            <td class="py-3.5 px-4 text-inkSoft">${esc(d.floor || "—")}${d.unit ? `<span class="block font-mono text-[12px] text-inkFaint">${esc(d.unit)}</span>` : ""}</td>
            <td class="py-3.5 px-4 text-inkSoft">${esc(d.layout || "—")}</td>
            <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.ping || "—"}</td>
            <td class="py-3.5 px-4 text-right font-mono font-semibold text-ink">${d.unitPrice}</td>
            <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.totalPrice ? d.totalPrice.toLocaleString("zh-TW") : "—"}</td>
          </tr>`).join("\n          ")}
        </tbody>
      </table>
    </div>
  </details>` : ""}

  <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
    單價單位為萬元／坪，總價單位為萬元。含車位的交易，單價會被車位價格拉低，
    比對時請留意坪數與格局是否相近。標示「預售」者為預售屋買賣，交屋時間與成屋不同。
    資料來源為內政部不動產交易實價查詢服務網，涵蓋近四季公告的交易。
  </p>`;
}

/* ---------- 單一社區頁 ---------- */
function communityPage(c, deals, others, hasBuyers) {
  const url = `${SITE}/communities/${c.slug}.html`;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ApartmentComplex",
      name: c.name,
      url,
      description: c.summary,
      address: {
        "@type": "PostalAddress",
        streetAddress: c.address.replace("高雄市", "").replace(c.district, ""),
        addressLocality: "高雄市",
        addressRegion: c.district,
        addressCountry: "TW",
      },
      ...(c.specs?.find(s => s[0] === "總戶數")
        ? { numberOfAccommodationUnits: c.specs.find(s => s[0] === "總戶數")[1] } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "社區行情", item: `${SITE}/communities/` },
        { "@type": "ListItem", position: 3, name: c.name, item: url },
      ],
    },
  ];

  if (c.faq?.length) {
    jsonLd.push({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: c.faq.map(([q, a]) => ({
        "@type": "Question", name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    });
  }

  const kw = [c.name, ...(c.aliases || []), `${c.name}實價登錄`, `${c.name}房價`,
              `${c.name}成交`, c.area, `高雄${c.district}`].join(",");

  return [
    head({
      title: `${c.name}實價登錄與社區介紹｜${c.area}｜${BRAND.teamName}`,
      description: `${c.name}（${c.address}）的實價登錄成交紀錄、社區基本資料、學區與看屋重點。${c.summary}`,
      keywords: kw,
      canonical: url,
      ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 1, jsonLd,
    }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-4xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span>
    <a href="index.html" class="hover:text-orangeDeep">社區行情</a><span class="mx-2">/</span>
    <span>${esc(c.name)}</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">${esc(c.area)}・${esc(c.district)}</div>
  <h1 class="display text-[30px] md:text-[38px]">${esc(c.name)}</h1>
  <p class="mt-4 text-[17px] text-inkSoft leading-[1.95] max-w-2xl">${esc(c.summary)}</p>
  <p class="mt-3 font-mono text-[14px] text-inkFaint">${esc(c.address)}</p>
  <div class="mt-6 h-px bg-line"></div>

  <!-- 基本資料 -->
  <section class="mt-10">
    <h2 class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-5">社區資料</h2>
    <dl class="grid sm:grid-cols-2 gap-x-10 border-t border-line">
      ${(c.specs || []).map(([k, v]) => `<div class="flex justify-between gap-4 py-4 border-b border-line">
        <dt class="text-[15px] text-inkFaint shrink-0">${esc(k)}</dt>
        <dd class="text-[15px] text-ink text-right">${esc(v)}</dd>
      </div>`).join("\n      ")}
    </dl>
  </section>

  <!-- 成交紀錄 -->
  <section class="mt-14" id="deals">
    <h2 class="display text-[23px] mb-2">實價登錄成交紀錄</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-2xl">
      逐筆列出近期成交，不做平均。同一個社區，樓層、面向、坪數與車位配置不同，
      單價落差往往比想像中大——找條件跟你要看的那戶相近的來比，會準確得多。
    </p>
    ${dealsTable(deals)}
  </section>

  <!-- 條件觀察 -->
  ${(c.highlights?.length || c.considerations?.length) ? `<section class="mt-14">
    <h2 class="display text-[23px] mb-6">看屋前先知道的事</h2>
    <div class="grid md:grid-cols-2 gap-8">
      ${c.highlights?.length ? `<div>
        <div class="font-mono text-[12px] tracking-wider text-orangeDeep mb-4">條件優勢</div>
        <ul class="space-y-3">
          ${c.highlights.map(h => `<li class="flex gap-3 text-[15px] text-inkSoft leading-[1.9] pb-3 border-b border-line">
            <span class="text-orange shrink-0 font-bold">✓</span><span>${esc(h)}</span></li>`).join("\n          ")}
        </ul>
      </div>` : ""}
      ${c.considerations?.length ? `<div>
        <div class="font-mono text-[12px] tracking-wider text-inkFaint mb-4">要納入考量的地方</div>
        <ul class="space-y-3">
          ${c.considerations.map(h => `<li class="flex gap-3 text-[15px] text-inkSoft leading-[1.9] pb-3 border-b border-line">
            <span class="text-inkFaint shrink-0">・</span><span>${esc(h)}</span></li>`).join("\n          ")}
        </ul>
      </div>` : ""}
    </div>
  </section>` : ""}

  <!-- 學區 -->
  ${c.school ? `<section class="mt-14">
    <h2 class="display text-[23px] mb-6">學區</h2>
    <div class="border border-line rounded-sm bg-surface p-7">
      <div class="grid sm:grid-cols-2 gap-6">
        <div>
          <div class="font-mono text-[12px] text-inkFaint mb-1">國小</div>
          <div class="text-[19px] font-bold tracking-tight">${esc(c.school.primary || "—")}</div>
        </div>
        <div>
          <div class="font-mono text-[12px] text-inkFaint mb-1">國中</div>
          <div class="text-[19px] font-bold tracking-tight">${esc(c.school.junior || "—")}</div>
        </div>
      </div>
      ${c.school.note ? `<p class="text-[15px] text-orangeDeep leading-[1.9] mt-6 pt-6 border-t border-line">${esc(c.school.note)}</p>` : ""}
      <a href="../tools/school-zone/index.html" class="inline-block mt-5 font-mono text-[13px] text-orangeDeep hover:underline">用學區查詢工具核對 →</a>
    </div>
  </section>` : ""}

  <!-- FAQ -->
  ${c.faq?.length ? `<section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">關於${esc(c.name)}的常見問題</h2>
    <div class="border-t border-line">
      ${c.faq.map(([q, a]) => `<details class="border-b border-line group">
        <summary class="w-full flex items-start justify-between gap-6 py-6 text-left">
          <h3 class="text-[17px] font-bold leading-snug tracking-tight group-hover:text-orangeDeep transition">${esc(q)}</h3>
          <span class="faq-plus font-mono text-[20px] text-orangeDeep shrink-0 leading-none mt-1 transition-transform">＋</span>
        </summary>
        <p class="text-[16px] text-inkSoft leading-[2] pb-7 pr-12">${esc(a)}</p>
      </details>`).join("\n      ")}
    </div>
  </section>` : ""}

  <!-- CTA -->
  <section class="mt-14 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">在看${esc(c.name)}，或想賣掉手上這戶？</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      實價登錄是已經發生的事，屋主現在的開價與可談空間不會寫在上面。
      澄果團隊長期在${esc(c.area)}成交，可以告訴你目前的實際市況。
    </p>
    <div class="mt-6 flex flex-wrap gap-3">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
      <a href="${BRAND.officialSite}" target="_blank" rel="noopener noreferrer"
        class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">看在售物件 ↗</a>
    </div>
  </section>

  <!-- 免責 -->
  <section class="mt-10 border-t border-line pt-8">
    <p class="text-[14px] text-inkFaint leading-[1.9]">
      本頁的社區基本資料整理自公開資訊，成交紀錄來自內政部不動產交易實價查詢服務網，
      僅供參考。建案規格、公設比與車位配置請以建商公開資料與產權登記為準；
      實際成交條件因個案而異，簽約前請自行查證。
    </p>
  </section>

  <!-- 其他社區 -->
  ${others.length ? `<nav class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-5">其他社區</div>
    <div class="grid sm:grid-cols-2 gap-4">
      ${others.map(o => `<a href="${o.slug}.html" class="border border-line rounded-sm bg-surface px-5 py-4 hover:border-orange hover:bg-tint transition">
        <span class="font-mono text-[12px] text-inkFaint block">${esc(o.area)}</span>
        <span class="text-[16px] font-bold tracking-tight">${esc(o.name)}</span>
      </a>`).join("\n      ")}
    </div>
  </nav>` : ""}
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}

/* ---------- 社區列表頁 ---------- */
function communityIndex(list, dealsMap, hasBuyers) {
  const jsonLd = list.length ? [{
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: list.map((c, i) => ({
      "@type": "ListItem", position: i + 1,
      url: `${SITE}/communities/${c.slug}.html`, name: c.name,
    })),
  }] : [];

  return [
    head({
      title: `高雄社區行情｜美術館特區、農十六社區實價登錄｜${BRAND.teamName}`,
      description: "高雄美術館特區、農十六特區各社區的實價登錄成交紀錄、社區基本資料與學區資訊。逐筆列出成交，不做平均，方便對照條件相近的戶別。",
      keywords: "高雄社區行情,美術館特區社區,農十六社區,社區實價登錄,高雄社區房價",
      canonical: `${SITE}/communities/`,
      ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 1, jsonLd,
    }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span><span>社區行情</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Communities</div>
  <h1 class="display text-[30px] md:text-[36px]">社區行情</h1>
  <p class="mt-4 text-[16px] text-inkSoft leading-[1.9] max-w-2xl">
    我們把常被問到的社區整理成獨立頁面，列出實價登錄的每一筆成交紀錄、社區基本資料與學區資訊。
    成交紀錄逐筆呈現、不做平均，方便你找條件相近的戶別來比對。
  </p>
  <div class="mt-6 h-px bg-line"></div>

  ${list.length === 0 ? `<div class="mt-10 border border-line rounded-sm bg-surface p-8">
    <p class="text-[16px] text-inkSoft leading-[1.9]">社區頁面陸續整理中。想了解特定社區的行情，歡迎直接來電。</p>
    <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
  </div>` : `
  <div class="mt-10 grid md:grid-cols-2 gap-6">
    ${list.map(c => {
      const deals = dealsMap[c.slug] || [];
      const prices = deals.map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
      return `<a href="${c.slug}.html" class="border border-line rounded-sm bg-surface p-7 hover:border-orange hover:bg-tint transition flex flex-col">
      <div class="font-mono text-[12px] tracking-wider text-inkFaint">${esc(c.area)}・${esc(c.district)}</div>
      <h2 class="text-[21px] font-bold tracking-tight mt-1 mb-3">${esc(c.name)}</h2>
      <p class="text-[15px] text-inkSoft leading-[1.85] flex-1">${esc(c.summary)}</p>
      <div class="mt-5 pt-5 border-t border-line flex items-baseline justify-between">
        ${prices.length ? `<div>
          <span class="font-mono text-[12px] text-inkFaint">單價範圍</span>
          <span class="font-mono text-[20px] font-semibold text-orangeDeep ml-2">${prices[0]}–${prices[prices.length - 1]}</span>
          <span class="font-mono text-[12px] text-inkSoft ml-1">萬/坪</span>
        </div>` : `<span class="font-mono text-[13px] text-inkFaint">成交資料整理中</span>`}
        <span class="font-mono text-[12px] text-orangeDeep">查看 →</span>
      </div>
    </a>`;
    }).join("\n    ")}
  </div>`}

  <section class="mt-14 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">想查的社區不在名單上？</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      我們手上有更多社區的成交資料與屋況紀錄，只是還沒整理成頁面。
      直接告訴我們社區名稱，可以馬上幫你查。
    </p>
    <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
  </section>
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}

/* ---------- 主流程 ---------- */
export function buildCommunities(hasBuyers) {
  let config, dealsData;
  try {
    config = JSON.parse(readFileSync(path.join(ROOT, "data/communities.json"), "utf-8"));
  } catch {
    console.warn("[提示] 沒有 data/communities.json，略過社區頁");
    return [];
  }
  try {
    dealsData = JSON.parse(readFileSync(path.join(ROOT, "data/community-deals.json"), "utf-8"));
  } catch {
    dealsData = { deals: {} };
  }

  const list = (config.communities || []).filter(c => !c.draft);
  mkdirSync(OUT_DIR, { recursive: true });

  /* 清掉已不再發布的頁面 */
  readdirSync(OUT_DIR)
    .filter(f => f.endsWith(".html") && f !== "index.html")
    .forEach(f => {
      if (!list.some(c => `${c.slug}.html` === f)) {
        unlinkSync(path.join(OUT_DIR, f));
        console.log("[移除] 已不再發布：", f);
      }
    });

  list.forEach(c => {
    const others = list.filter(o => o.slug !== c.slug).slice(0, 4);
    const html = communityPage(c, dealsData.deals?.[c.slug] || [], others, hasBuyers);
    writeFileSync(path.join(OUT_DIR, `${c.slug}.html`), html, "utf-8");
    console.log("[產生]", `communities/${c.slug}.html`);
  });

  writeFileSync(path.join(OUT_DIR, "index.html"),
    communityIndex(list, dealsData.deals || {}, hasBuyers), "utf-8");
  console.log("[產生] communities/index.html");
  console.log(`[完成] 共產生 ${list.length} 個社區頁`);

  return list;
}
