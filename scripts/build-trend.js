/**
 * 澄果團隊｜高雄房價走勢落地頁  areas/trend/
 * ------------------------------------------------
 * 為什麼要有這一頁：
 * 「高雄房價走勢」「高雄房價這幾年漲多少」是比任何社區名、甚至比生活圈名
 * 搜尋量都大的問法，而站上原本沒有一個網址在回答它——
 * 逐年資料只存在於四個生活圈頁內部的一個 H2 區塊（areas/<slug>/#trend），
 * 標題與網址講的都是那一個生活圈，不是「高雄房價走勢」。
 * AI 引擎被問到這件事時，也沒有一頁可以整段引用。
 *
 * 這一頁不新增任何資料：數字全部來自 data/area-deals/ 的同一個資料池、
 * 同一支 scripts/lib/area-stats.js 的 yearly()，所以這頁與生活圈頁上的
 * 同一年、同一區的數字必然一致（不一致就是程式有錯，不是資料有兩套）。
 * 這一頁多做的事只有兩件：
 *   1. 把四個生活圈的成交倒進同一個池子，算出一條「整體」序列
 *      （合併是重算中位數，不是把四個中位數再平均）
 *   2. 把四條序列並排成同一張可比較的表
 *
 * ⚠️ 產生出來的 HTML 不要直接改，會被覆蓋。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, head, header, footer, orgRef, fitTitle } from "./lib/layout.js";
import { updatedDate, twDate } from "./build-communities.js";
import { webSlug } from "./build-articles.js";
import { AREAS } from "./build-areas.js";
import { yearly } from "./lib/area-stats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const TREND_SLUG = "trend";
export const TREND_URL = `${SITE}/areas/${TREND_SLUG}/`;

const nf = n => Number(n).toLocaleString("en-US");

/* 實價登錄自 2012 年 8 月 1 日起申報，所以序列的第一年只有五個月的成交，
   不是「那一年成交特別少」。這句話在頁面與 FAQ 都要講，否則讀者會誤判。 */
const REGISTRY_START_YEAR = 2012;

/* 漲跌的說法集中在這裡，頁面與 FAQ 共用，避免同一組數字兩種講法 */
function moveWord(pct) {
  if (pct === null) return "";
  if (pct > 0) return `上漲約 ${pct}%`;
  if (pct < 0) return `下跌約 ${Math.abs(pct)}%`;
  return "大致持平";
}
function peakWord(t) {
  return t.peak.year === t.last.year
    ? `${t.last.year} 年是這段期間的高點。`
    : `高點在 ${t.peak.year} 年的 ${t.peak.unit} 萬元／坪，${t.last.year} 年`
      + (t.fromPeakPct === 0 ? "與高點相當。"
         : `比高點${t.fromPeakPct > 0 ? "高" : "低"}約 ${Math.abs(t.fromPeakPct)}%。`);
}

/* ───────────────────────────────────────────────────────────
   整體走勢的橫條
   ───────────────────────────────────────────────────────────
   跟生活圈頁同一種畫法：純 HTML／CSS，不載任何圖表套件。
   條長只是視覺輔助，真正的資料是同一列的數字與下方的表格——
   爬蟲與 AI 讀到的是文字，不是圖。 */
function bars(t) {
  const max = Math.max(...t.rows.map(r => r.unit));
  return `<div class="border border-line rounded-sm bg-surface p-5 md:p-7">
      <ul class="space-y-2.5">
        ${t.rows.map(r => `<li class="flex items-center gap-3">
          <span class="font-mono text-[13px] text-inkFaint w-11 shrink-0 text-right">${r.year}</span>
          <span class="flex-1 h-5 bg-paper rounded-sm overflow-hidden" aria-hidden="true">
            <span class="block h-full ${r.year === t.peak.year ? "bg-orange" : "bg-orangeDeep/35"}" style="width:${Math.round((r.unit / max) * 100)}%"></span>
          </span>
          <span class="font-mono text-[14px] text-ink w-[4.5rem] shrink-0 text-right">${r.unit}</span>
          <span class="font-mono text-[12px] text-inkFaint w-[4.5rem] shrink-0 text-right">${nf(r.n)} 筆</span>
        </li>`).join("\n        ")}
      </ul>
    </div>`;
}

/* ───────────────────────────────────────────────────────────
   四區並排的逐年比較表
   ───────────────────────────────────────────────────────────
   中都重劃區的序列從 2018 年才開始（開發最晚、2018 年前成交量不到門檻），
   所以表格一定會有空格。空格用「—」並在 th 上標 title，
   不要補 0、也不要補前一年的數字——那會變成憑空造出來的成交。 */
function matrix(series, combined) {
  const years = [...new Set([...combined.rows.map(r => r.year),
                             ...series.flatMap(s => s.t.rows.map(r => r.year))])]
    .sort((a, b) => a - b);
  const cell = (t, y) => t.rows.find(r => r.year === y) || null;

  return `<div class="overflow-x-auto border border-line rounded-sm bg-surface">
      <table class="w-full text-[15px] min-w-[720px]">
        <caption class="sr-only">高雄四大生活圈 ${combined.span} 各年度電梯住宅成交的單價中位數（萬元／坪）與成交筆數，含四區合併計算的整體中位數</caption>
        <thead>
          <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
            <th scope="col" class="text-left font-normal py-3 px-4">年度</th>
            <th scope="col" class="text-right font-normal py-3 px-4 bg-tint">四區整體<span class="block font-mono text-[11px]">萬／坪</span></th>
            ${series.map(s => `<th scope="col" class="text-right font-normal py-3 px-4">${esc(s.name)}<span class="block font-mono text-[11px]">萬／坪</span></th>`).join("\n            ")}
          </tr>
        </thead>
        <tbody>
          ${years.map(y => {
            const c = cell(combined, y);
            return `<tr class="border-b border-line last:border-0">
            <th scope="row" class="py-3 px-4 text-left font-normal font-mono text-[14px]">${y}${y === REGISTRY_START_YEAR ? `<span class="text-inkFaint text-[11px] ml-1">8–12 月</span>` : ""}</th>
            <td class="py-3 px-4 text-right font-mono text-[14px] text-ink bg-tint">${c ? `${c.unit}<span class="block text-[11px] text-inkFaint">${nf(c.n)} 筆</span>` : "—"}</td>
            ${series.map(s => {
              const x = cell(s.t, y);
              return `<td class="py-3 px-4 text-right font-mono text-[14px] ${x && x.year === s.t.peak.year ? "text-orangeDeep font-bold" : "text-inkSoft"}">${x ? `${x.unit}<span class="block text-[11px] text-inkFaint font-normal">${nf(x.n)} 筆</span>` : "—"}</td>`;
            }).join("\n            ")}
          </tr>`;
          }).join("\n          ")}
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-ink bg-paper">
            <th scope="row" class="py-3 px-4 text-left font-normal font-mono text-[13px] text-inkFaint">累計變動</th>
            <td class="py-3 px-4 text-right font-mono text-[14px] text-ink bg-tint">${combined.changePct > 0 ? "+" : ""}${combined.changePct}%</td>
            ${series.map(s => `<td class="py-3 px-4 text-right font-mono text-[14px] text-inkSoft">${s.t.changePct > 0 ? "+" : ""}${s.t.changePct}%<span class="block text-[11px] text-inkFaint">${s.t.first.year} 起</span></td>`).join("\n            ")}
          </tr>
        </tfoot>
      </table>
    </div>`;
}

/* ───────────────────────────────────────────────────────────
   頁面
   ─────────────────────────────────────────────────────────── */
function trendPage({ series, combined, dataUpdated, articles, hasBuyers, counts }) {
  const url = TREND_URL;
  const span = combined.span;

  /* 可以被整段引用的一句話：主詞、地點、期間、數字、樣本數、資料來源
     全部寫在同一段裡，AI 引擎取到這一段就不需要再回頭找上下文。 */
  const lead = `高雄四大生活圈（鼓山區美術館特區、鼓山區農十六特區、左營區瑞豐・巨蛋、`
    + `三民區中都重劃區）的電梯住宅成交單價中位數，從 ${combined.first.year} 年的 `
    + `${combined.first.unit} 萬元／坪，到 ${combined.last.year} 年的 ${combined.last.unit} 萬元／坪，`
    + `${moveWord(combined.changePct)}。${peakWord(combined)}`
    + `本頁依據內政部不動產交易實價查詢服務網的 ${nf(combined.sample)} 筆成屋成交紀錄，`
    + `逐年計算單價中位數，並列出各年度樣本數。`;

  /* 漲幅排名：四個生活圈的起算年不同（中都從 2018 年起），
     所以排名一定要把起算年寫出來，否則是拿不同期間相比。 */
  const byMove = series.filter(s => s.t.changePct !== null)
    .slice().sort((a, b) => b.t.changePct - a.t.changePct);
  const byLast = series.slice().sort((a, b) => b.t.last.unit - a.t.last.unit);

  const faq = [
    [`高雄房價這幾年漲了多少？`, lead
      + `逐年的數字與各年度樣本數列在本頁的比較表。要注意最新一年的樣本通常還不完整——`
      + `實價登錄每月 1、11、21 日分批公告，當年度的成交會持續補進來。`],

    [`高雄哪一個生活圈的房價漲最多？`,
      `以內政部實價登錄的電梯住宅成交單價中位數計算，`
      + byMove.map(s => `${s.name}（高雄市${s.district}）從 ${s.t.first.year} 年的 ${s.t.first.unit} 萬元／坪到 ${s.t.last.year} 年的 ${s.t.last.unit} 萬元／坪，${moveWord(s.t.changePct)}`).join("；")
      + `。四區的起算年不同：${series.filter(s => s.t.first.year > REGISTRY_START_YEAR).map(s => `${s.name}的序列從 ${s.t.first.year} 年才開始（該區開發較晚，更早的年度成交量不足 30 筆、不列出）`).join("、") || "皆自 2012 年起"}，`
      + `所以漲幅不是同一段期間相比，直接比大小會誤判。`],

    [`現在高雄哪一區的單價最高？`,
      `以 ${combined.last.year} 年的成交單價中位數排序：`
      + byLast.map(s => `${s.name} ${s.t.last.unit} 萬元／坪（${nf(s.t.last.n)} 筆）`).join("、")
      + `。這是區域的中位數，同一個生活圈內不同社區、不同屋齡與樓層的價差，`
      + `往往比生活圈之間的價差還大，所以要比的是具體社區而不是區域平均。`],

    [`高雄房價的高點在哪一年？現在跟高點差多少？`,
      `四區合併計算，單價中位數的高點在 ${combined.peak.year} 年的 ${combined.peak.unit} 萬元／坪`
      + `（該年 ${nf(combined.peak.n)} 筆成交），${combined.last.year} 年為 ${combined.last.unit} 萬元／坪，`
      + (combined.fromPeakPct === 0 ? "與高點相當。" : `比高點${combined.fromPeakPct > 0 ? "高" : "低"}約 ${Math.abs(combined.fromPeakPct)}%。`)
      + `各生活圈的高點年份不一致：${series.map(s => `${s.name}在 ${s.t.peak.year} 年（${s.t.peak.unit} 萬元／坪）`).join("、")}。`
      + `另外要分開看價與量：${combined.peak.year} 年的成交量是 ${nf(combined.peak.n)} 筆，`
      + `${combined.last.year} 年是 ${nf(combined.last.n)} 筆，`
      + `${combined.last.year === new Date().getFullYear() ? "但當年度尚未公告完，量不能直接拿來比。" : "量與價不一定同向。"}`],

    [`為什麼用中位數不用平均價？`,
      `這十幾年裡有大坪數新案交屋潮這類結構性變化，平均會被少數高價案拉走。`
      + `例如一年裡出現十筆百坪以上的新成屋成交，平均單價就會被往上帶，`
      + `但多數買方實際面對的價格並沒有變。中位數是把該年所有成交依單價排序後取中間那一筆，`
      + `不受極端值影響，比較接近「一般物件大概多少錢」。`
      + `本頁所有的「中位」都是這個意思，沒有任何一個數字是平均值。`],

    [`為什麼走勢只從 ${REGISTRY_START_YEAR} 年開始？`,
      `因為不動產成交案件實際資訊申報（實價登錄）自民國 101 年（${REGISTRY_START_YEAR} 年）8 月 1 日起實施，`
      + `在那之前的成交價格沒有法定申報義務，也就沒有可用的公開逐筆資料。`
      + `所以 ${REGISTRY_START_YEAR} 年這一列只含 8 月到 12 月的成交（${nf(combined.first.n)} 筆），`
      + `不是那一年的成交特別少，拿它跟完整年度比成交量並不對等；但單價中位數不受期間長度影響，可以比。`],

    [`這一頁的數字和生活圈頁上的為什麼要一致？`,
      `因為是同一份資料、同一支程式算出來的。本頁與四個生活圈頁的逐年走勢，`
      + `都讀 data/area-deals 的同一個成交資料池、套用同一組篩選條件，`
      + `差別只在本頁多算了一條「四區合併」的序列。如果您在兩邊看到同一年、同一區的數字不同，`
      + `那是本站的錯誤，歡迎直接告訴我們。資料更新日期標在頁面上方。`],

    [`這個走勢可以用來判斷現在該不該買嗎？`,
      `走勢能回答的是「過去的成交落在什麼區間」，不能回答「接下來會怎樣」。`
      + `實價登錄是已經發生、而且延遲一到兩個月才公告的事；屋主現在的開價、`
      + `可談的空間、以及貸款條件（成數、年限、利率）都不在這份資料裡，`
      + `而後面這幾項對能不能成交的影響往往比區域走勢更直接。`
      + `建議把走勢當成「出價時手上要有的參考區間」，實際決策再加上您要看的那幾個社區的逐筆成交與現況。`],
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `高雄四大生活圈房價走勢（${span}）`,
      url,
      description: lead,
      inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      about: series.map(s => ({
        "@type": "Place",
        name: `高雄市${s.district}${s.name}`,
        address: {
          "@type": "PostalAddress",
          addressLocality: "高雄市",
          addressRegion: s.district,
          addressCountry: "TW",
        },
      })),
      publisher: orgRef(),
      isPartOf: { "@type": "WebSite", name: BRAND.teamName, url: `${SITE}/` },
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `高雄四大生活圈電梯住宅逐年成交單價中位數（${span}）`,
      description: `高雄市鼓山區美術館特區、農十六特區、左營區瑞豐・巨蛋、三民區中都重劃區，`
        + `${span} 各年度電梯住宅（住宅大樓與華廈）成屋成交的單價中位數（萬元／坪）、總價中位數（萬元）與成交筆數，`
        + `共 ${nf(combined.sample)} 筆。已排除實價登錄標示解約的紀錄、店面與非住宅用途、預售屋，`
        + `以及單價超出 3–150 萬元／坪合理區間的資料異常；單一年度成交少於 30 筆者不列出。`,
      url,
      temporalCoverage: `${combined.first.year}/${combined.last.year}`,
      spatialCoverage: { "@type": "City", name: "高雄市" },
      /* creator 的 @type 只能是 Person 或 Organization，政府機關用 additionalType 標示 */
      creator: {
        "@type": "Organization",
        additionalType: "https://schema.org/GovernmentOrganization",
        name: "內政部不動產交易實價查詢服務網",
        url: "https://plvr.land.moi.gov.tw/",
      },
      license: "https://data.gov.tw/license",
      publisher: orgRef(),
      isAccessibleForFree: true,
      inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      variableMeasured: ["年度", "生活圈", "單價中位數（萬元／坪）", "總價中位數（萬元）", "成交筆數"],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "生活圈", item: `${SITE}/areas/` },
        { "@type": "ListItem", position: 3, name: "房價走勢", item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(([q, a]) => ({
        "@type": "Question", name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  /* 相關文章：講房價、行情、走勢、政策的文章 */
  const rel = articles.filter(a => {
    const hay = [a.title, a.excerpt, ...(a.tags || [])].filter(Boolean).join(" ");
    return /房價|行情|走勢|實價登錄|升息|利率|信用管制/.test(hay);
  }).slice(0, 4);

  return [
    head({
      title: fitTitle([
        `高雄房價走勢 ${span}`,
        `｜單價中位 ${combined.first.unit}→${combined.last.unit} 萬／坪`,
        `、${nf(combined.sample)} 筆`,
      ]) + `｜${BRAND.teamName}`,
      /* description 會被 clampDesc 截到約 95 字，所以把最重要的
         （期間、數字、漲幅、樣本量）全部放在前半段，四區名稱放最後。 */
      description: `高雄四大生活圈 ${span} 逐年房價走勢：電梯住宅成交單價中位數 `
        + `${combined.first.unit}→${combined.last.unit} 萬元／坪、${moveWord(combined.changePct)}，`
        + `高點 ${combined.peak.year} 年 ${combined.peak.unit} 萬，依內政部實價登錄 ${nf(combined.sample)} 筆成交計算。`
        + `含美術館特區、農十六、瑞豐巨蛋、中都逐年對照。`,
      keywords: ["高雄房價走勢", "高雄房價", "高雄房價這幾年漲多少", "高雄房價趨勢",
                 "鼓山區房價走勢", "左營區房價走勢", "三民區房價走勢",
                 "美術館特區房價走勢", "農十六房價走勢", "瑞豐巨蛋房價走勢", "中都重劃區房價走勢",
                 "高雄實價登錄", "高雄單價中位數"].join(","),
      canonical: url,
      ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 2, jsonLd,
    }),
    header({ depth: 2, hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span>
    <a href="../index.html" class="hover:text-orangeDeep">生活圈</a><span class="mx-2">/</span>
    <span>房價走勢</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">高雄市・${span}</div>
  <h1 class="display text-[30px] md:text-[40px]">高雄四大生活圈房價走勢（${span}）</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-3xl">${esc(lead)}</p>
  ${dataUpdated ? `<p class="mt-4 font-mono text-[12px] text-inkFaint">
    資料更新於 <time datetime="${dataUpdated}">${twDate(dataUpdated)}</time>
    ・來源：內政部不動產交易實價查詢服務網（每月 1、11、21 日批次公告）
  </p>` : ""}

  <!-- 四個數字的摘要 -->
  <dl class="mt-8 grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line rounded-sm overflow-hidden">
    ${[[`${combined.last.year} 年單價中位`, `${combined.last.unit}`, "萬元／坪"],
       [`${combined.first.year} 年單價中位`, `${combined.first.unit}`, "萬元／坪"],
       [`${span} 累計變動`, `${combined.changePct > 0 ? "+" : ""}${combined.changePct}`, "%"],
       ["計算樣本", nf(combined.sample), "筆成交"]]
      .map(([k, v, u]) => `<div class="bg-surface p-5">
      <dt class="font-mono text-[11px] tracking-wider text-inkFaint">${esc(k)}</dt>
      <dd class="mt-2 font-mono text-[26px] text-ink leading-none">${v}<span class="text-[12px] text-inkFaint ml-1.5">${u}</span></dd>
    </div>`).join("\n    ")}
  </dl>

  <!-- 整體走勢 -->
  <section class="mt-16" id="overall">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">四區整體逐年單價中位數</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${nf(combined.sample)} 筆成交</span>
    </div>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-7 max-w-3xl">
      把四個生活圈的成交倒進同一個池子重算中位數，不是把四個區的中位數再平均——
      後者會讓成交量少的生活圈權重被不當放大。深色的那一年是這段期間的高點。
      每一年的樣本數都列在右邊，樣本少的年份（${REGISTRY_START_YEAR} 年只有 8–12 月、
      以及尚未公告完的最新一年）參考性較低。
    </p>
    ${bars(combined)}
  </section>

  <!-- 四區對照 -->
  <section class="mt-16" id="compare">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">四個生活圈逐年對照</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">單位：萬元／坪</span>
    </div>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-7 max-w-3xl">
      同一年、同一區的數字與該生活圈頁上的完全相同（同一份資料、同一支程式）。
      橘色標的是該區自己的高點年份。中都重劃區的序列從 ${series.find(s => s.slug === "zhongdu")?.t.first.year || 2018} 年開始——
      該區開發最晚，更早的年度成交量不足 30 筆，寧可留空也不補數字。
    </p>
    ${matrix(series, combined)}
    <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
      「累計變動」是各區自己第一個可計算年度到 ${combined.last.year} 年的變動，起算年不同，
      不能直接拿來比快慢。<br />
      另外提醒一個容易誤讀的地方：生活圈頁最上方寫的是「近一年」——
      從今天往回推十二個月，會跨到前一年；本頁的 ${combined.last.year} 年是「日曆年度」，
      只含 ${combined.last.year} 年 1 月以後的成交。兩個數字不同不是矛盾，是期間的切法不同。
    </p>
  </section>

  <!-- 各區摘要卡 -->
  <section class="mt-16" id="areas">
    <h2 class="display text-[23px] mb-6">各生活圈的走勢摘要</h2>
    <div class="grid sm:grid-cols-2 gap-5">
      ${series.map(s => `<a href="../${s.slug}/index.html#trend" class="border border-line rounded-sm bg-surface p-6 hover:border-orange hover:bg-tint transition block">
        <div class="font-mono text-[12px] tracking-wider text-inkFaint">高雄市${esc(s.district)}</div>
        <div class="text-[19px] font-bold tracking-tight mt-1">${esc(s.name)}</div>
        <p class="mt-3 text-[15px] text-inkSoft leading-[1.9]">
          ${s.t.first.year} 年 ${s.t.first.unit} → ${s.t.last.year} 年 ${s.t.last.unit} 萬元／坪，${moveWord(s.t.changePct)}。
          高點 ${s.t.peak.year} 年 ${s.t.peak.unit} 萬元／坪。
        </p>
        <div class="font-mono text-[13px] text-inkFaint mt-3">${counts[s.slug] || 0} 個社區・走勢樣本 ${nf(s.t.sample)} 筆</div>
        <div class="font-mono text-[13px] text-orangeDeep mt-3">看${esc(s.name)}逐年走勢與社區清單 →</div>
      </a>`).join("\n      ")}
    </div>
  </section>

  <!-- 統計方法 -->
  <section class="mt-16" id="method">
    <h2 class="display text-[21px] mb-5">這些數字是怎麼算的</h2>
    <div class="border-l-2 border-orange pl-5 max-w-3xl">
      <ul class="text-[16px] text-inkSoft leading-[2] space-y-2">
        <li><strong class="text-ink font-bold">資料來源</strong>：內政部不動產交易實價查詢服務網的逐筆成交紀錄，不是本站自行估價或開價資料。</li>
        <li><strong class="text-ink font-bold">物件範圍</strong>：電梯住宅（建物型態為住宅大樓或華廈）的成屋買賣。</li>
        <li><strong class="text-ink font-bold">排除</strong>：實價登錄標示解約的紀錄、店面與非住宅用途、預售屋，以及單價超出 3–150 萬元／坪合理區間的資料異常。</li>
        <li><strong class="text-ink font-bold">為什麼排除預售</strong>：預售的「交易年月日」是簽約日，交屋還要兩三年，混進逐年序列會讓年份失真。</li>
        <li><strong class="text-ink font-bold">統計值</strong>：單價中位數，不是平均。單一年度成交少於 30 筆者不列出。</li>
        <li><strong class="text-ink font-bold">起點</strong>：實價登錄自 ${REGISTRY_START_YEAR} 年 8 月 1 日起實施申報，${REGISTRY_START_YEAR} 年只含 8–12 月的成交。</li>
        <li><strong class="text-ink font-bold">更新</strong>：內政部每月 1、11、21 日批次公告，本站於公告隔日自動更新，最新一年的數字會持續補進來。</li>
      </ul>
    </div>
  </section>

  <!-- FAQ -->
  <section class="mt-16 pt-10 border-t-2 border-ink" id="faq">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">關於高雄房價走勢的常見問題</h2>
    <div class="border-t border-line">
      ${faq.map(([q, a]) => `<details class="border-b border-line group">
        <summary class="w-full flex items-start justify-between gap-6 py-6 text-left">
          <h3 class="text-[17px] font-bold leading-snug tracking-tight group-hover:text-orangeDeep transition">${esc(q)}</h3>
          <span class="faq-plus font-mono text-[20px] text-orangeDeep shrink-0 leading-none mt-1 transition-transform">＋</span>
        </summary>
        <p class="text-[16px] text-inkSoft leading-[2] pb-7 pr-12">${esc(a)}</p>
      </details>`).join("\n      ")}
    </div>
  </section>

  <!-- 工具與文章 -->
  <section class="mt-16">
    <h2 class="display text-[21px] mb-6">知道區間之後，可以先算的事</h2>
    <div class="grid sm:grid-cols-2 gap-5">
      ${[["房貸試算", "../../tools/mortgage/index.html", "從每月可負擔的還款金額反推總價與自備款"],
         ["新青安試算", "../../tools/qingan/index.html", "資格條件、額度與利率補貼試算"],
         ["稅費概算", "../../tools/property-tax/index.html", "房地合一稅、土地增值稅與重購退稅"],
         ["學區查詢", "../../tools/school-zone/index.html", "選行政區與里別，查對應的國小、國中學區"]]
        .map(([t, href, d]) => `<a href="${href}" class="border border-line rounded-sm bg-surface p-6 hover:border-orange hover:bg-tint transition block">
        <div class="text-[18px] font-bold tracking-tight">${t}</div>
        <p class="mt-2 text-[15px] text-inkSoft leading-[1.85]">${d}</p>
      </a>`).join("\n      ")}
    </div>
    ${rel.length ? `<div class="mt-8">
      <div class="font-mono text-[12px] tracking-wider text-inkFaint mb-4">相關文章</div>
      <ul class="border-t border-line">
        ${rel.map(a => `<li class="border-b border-line py-4">
          <a href="../../notes/${encodeURIComponent(webSlug(a.slug))}.html" class="text-[16px] text-ink hover:text-orangeDeep">${esc(a.title)}</a>
        </li>`).join("\n        ")}
      </ul>
    </div>` : ""}
  </section>

  <!-- CTA -->
  <section class="mt-16 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">走勢看完了，想知道現在實際能買到多少？</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      實價登錄是已經發生、而且延遲一到兩個月才公告的事。屋主現在的開價、可談的空間、
      以及各社區的屋況差異都不在這份資料裡。澄果團隊長期在這四個生活圈成交，
      可以直接告訴你目前的市況。
    </p>
    <div class="mt-6 flex flex-wrap gap-4">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
      <a href="../index.html" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white/10 transition">看四大生活圈行情 →</a>
      ${BRAND.lineUrl ? `<a href="${BRAND.lineUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white/10 transition">用 LINE 問</a>` : ""}
    </div>
  </section>
</main>`,
    footer({ depth: 2, hasBuyers }),
  ].join("\n");
}

/* ---------- 主流程 ---------- */
export function buildTrend({ areas = [], articles = [], hasBuyers = false } = {}) {
  /* areas 是 buildAreas() 的回傳值：只對實際有產生頁面的生活圈做對照，
     否則表格會出現連不過去的欄位。 */
  const live = new Set(areas.map(a => a.slug));
  const counts = Object.fromEntries(areas.map(a => [a.slug, a.count]));

  const series = AREAS.filter(a => live.has(a.slug))
    .map(a => ({ ...a, t: yearly(a.code) }))
    .filter(s => s.t);

  if (series.length < 2) {
    console.log("[略過] 可計算逐年走勢的生活圈不足兩個，不產生 areas/trend/");
    return null;
  }

  const combined = yearly(series.map(s => s.code));
  if (!combined) {
    console.log("[略過] 四區合併的逐年走勢算不出來，不產生 areas/trend/");
    return null;
  }

  let dataUpdated = "";
  try {
    dataUpdated = updatedDate(JSON.parse(
      readFileSync(path.join(ROOT, "data/community-deals.json"), "utf-8")).updatedAt);
  } catch { /* 沒有成交檔時就不標更新日期 */ }

  const dir = path.join(ROOT, "areas", TREND_SLUG);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"),
    trendPage({ series, combined, dataUpdated, articles, hasBuyers, counts }), "utf-8");
  console.log("[產生]", `areas/${TREND_SLUG}/index.html`);

  return {
    slug: TREND_SLUG,
    span: combined.span,
    sample: combined.sample,
    first: combined.first,
    last: combined.last,
    changePct: combined.changePct,
    peak: combined.peak,
    areas: series.map(s => ({ slug: s.slug, name: s.name, district: s.district, t: s.t })),
  };
}
