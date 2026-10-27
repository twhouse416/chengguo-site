/**
 * 澄果團隊｜四個彙整頁（hub）
 * ------------------------------------------------
 *   /areas/       四大生活圈總覽
 *   /schools/     學區總覽（國小／國中）
 *   /developers/  建商總覽
 *   /tools/       試算工具總覽
 *
 * 這四個網址原本沒有 index.html，使用者或 AI 直接輸入會 404。
 * 彙整頁同時是「完整清單」型的內容，AI 搜尋引擎特別容易引用，
 * 也把內部連結分配給底下 30 多個子頁。
 *
 * ⚠️ 產生出來的 HTML 不要直接編輯，會被覆蓋。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, head, header, footer, orgRef } from "./lib/layout.js";
import { yearBuilt, unitCount, twDate } from "./build-communities.js";
import { TOOLS } from "./build-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const nf = n => Number(n || 0).toLocaleString("en-US");
const med = a => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return !n ? 0 : (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2); };
const SINCE = "2020-01-01";

/* ---------- 共用：頁面骨架 ---------- */
function shell({ eyebrow, h1, lead, crumb, body, faq, faqHeading = "常見問題", jsonLd, meta, hasBuyers, dataUpdated }) {
  return [
    head({ ...meta, depth: 1, jsonLd }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span><span>${esc(crumb)}</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">${esc(eyebrow)}</div>
  <h1 class="display text-[30px] md:text-[38px]">${esc(h1)}</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-3xl">${lead}</p>
  ${dataUpdated ? `<p class="mt-4 font-mono text-[12px] text-inkFaint">
    成交資料更新於 <time datetime="${dataUpdated}">${twDate(dataUpdated)}</time>
  </p>` : ""}

  ${body}

  <section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">FAQ</div>
    <!-- 這一段原本只有 h1 然後直接跳到問題的 h3，標題層級少一階。
         /areas/、/developers/、/tools/ 這三個彙整頁的 body 沒有自己的 h2，
         所以整頁變成 h1 → h3，螢幕閱讀器的大綱會斷掉。
         /schools/ 因為 body 本來就有 h2 才沒出問題。 -->
    <h2 class="display text-[23px] mb-8">${esc(faqHeading)}</h2>
    ${faq.map(([q, a]) => `<div class="mb-7">
      <h3 class="text-[17px] font-bold text-ink leading-[1.7]">${esc(q)}</h3>
      <p class="mt-2.5 text-[16px] text-inkSoft leading-[1.95]">${esc(a)}</p>
    </div>`).join("\n    ")}
  </section>
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}

/* ---------- 共用：卡片 ---------- */
function card(href, name, sub, metaLine) {
  return `<a href="${href}" class="block border border-line rounded-sm bg-surface p-6 hover:border-orange transition">
    <div class="text-[18px] font-bold text-ink leading-[1.5]">${esc(name)}</div>
    ${sub ? `<div class="mt-2 text-[15px] text-inkSoft leading-[1.8]">${esc(sub)}</div>` : ""}
    ${metaLine ? `<div class="mt-3 font-mono text-[12px] text-inkFaint">${esc(metaLine)}</div>` : ""}
  </a>`;
}
const grid = cards => `<div class="grid gap-4 sm:grid-cols-2 mt-8">\n    ${cards.join("\n    ")}\n  </div>`;

function ld({ name, url, description, items, crumb }) {
  return [
    { "@context": "https://schema.org", "@type": "CollectionPage",
      name, url, description, inLanguage: "zh-TW",
      publisher: orgRef(),
      mainEntity: { "@type": "ItemList", name, numberOfItems: items.length,
        itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, url: x.url })) } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: crumb, item: url },
      ] },
  ];
}
const faqLd = faq => ({ "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

/* 依社區 slug 清單算出成交筆數與單價中位數。
   /schools/ 與 /developers/ 兩個彙整頁原本只寫「N 個社區」，
   頁面本文卻宣稱「每一頁列出成交筆數與單價區間」——說到沒做到，
   而且整頁純文字不到 900 字，Google 把 /schools/ 歸到
   「已檢索－目前尚未建立索引」。這些數字建置時本來就算得出來，補上去。 */
function statsOf(slugs, dealsMap) {
  const ds = (slugs || []).flatMap(sg => (dealsMap[sg] || []).filter(d =>
    d.use !== "店面" && d.unitPrice >= 3 && d.unitPrice <= 150 && String(d.date || "") >= SINCE));
  return { deals: ds.length, up: med(ds.map(d => d.unitPrice)) };
}
/* 卡片第二行：N 個社區・2020 年起成交 N 筆・單價中位 N 萬 */
function statLine(count, st) {
  const bits = [`${count} 個社區`];
  if (st.deals) bits.push(`2020 年起成交 ${nf(st.deals)} 筆`);
  if (st.up) bits.push(`單價中位 ${st.up.toFixed(1)} 萬／坪`);
  return bits.join("・");
}

/* ================= /areas/ ================= */
function areasHub({ areas, communities, dealsMap, hasBuyers, dataUpdated, trend = null }) {
  const url = `${SITE}/areas/`;
  const rows = areas.map(a => {
    const list = communities.filter(c => c.area === a.name);
    const ds = list.flatMap(c => (dealsMap[c.slug] || []).filter(d =>
      d.use !== "店面" && d.unitPrice >= 3 && d.unitPrice <= 150 && String(d.date || "") >= SINCE));
    return { ...a, n: list.length, deals: ds.length,
      up: med(ds.map(d => d.unitPrice)), tp: med(ds.map(d => d.totalPrice).filter(Boolean)) };
  }).sort((x, y) => y.n - x.n);
  const totalC = rows.reduce((n, r) => n + r.n, 0);
  const totalD = rows.reduce((n, r) => n + r.deals, 0);
  const lead = `澄果團隊深耕的四個高雄生活圈，合計 ${nf(totalC)} 個社區、`
    + `${nf(totalD)} 筆 2020 年起的住家實價登錄成交紀錄。每個生活圈頁都列出該區的社區清單、`
    + `成交行情、屋齡結構與學區分布，單價與總價中位數取自逐筆成交紀錄而非平均值。`;
  const faq = [
    ["澄果團隊服務哪些生活圈？",
      `鼓山區的美術館特區與農十六特區、左營與鼓山交界的瑞豐・巨蛋生活圈，以及三民區的中都重劃區，共四個，合計 ${totalC} 個社區。`],
    ["四個生活圈的房價差多少？",
      rows.map(r => `${r.name}單價中位數 ${r.up.toFixed(1)} 萬／坪、總價中位數 ${nf(Math.round(r.tp))} 萬`).join("；")
      + "。以上取 2020 年 1 月起的住家成交紀錄計算，已排除店面與解約紀錄。"],
    ["哪一個生活圈的單價最高、哪一個總價門檻最低？",
      (() => {
        const byUp = rows.filter(r => r.up).slice().sort((a, b) => b.up - a.up);
        const byTp = rows.filter(r => r.tp).slice().sort((a, b) => a.tp - b.tp);
        return `單價中位數最高的是${byUp[0].name}（${byUp[0].up.toFixed(1)} 萬／坪），最低的是${byUp[byUp.length - 1].name}（${byUp[byUp.length - 1].up.toFixed(1)} 萬／坪）；`
          + `總價門檻最低的是${byTp[0].name}（中位 ${nf(Math.round(byTp[0].tp))} 萬），最高的是${byTp[byTp.length - 1].name}（中位 ${nf(Math.round(byTp[byTp.length - 1].tp))} 萬）。`
          + `單價高不等於總價高——坪數結構的影響往往比單價還大。`;
      })()],
    ["哪一個生活圈的成交量最多？",
      (() => {
        const byD = rows.filter(r => r.deals).slice().sort((a, b) => b.deals - a.deals);
        return byD.map(r => `${r.name} ${nf(r.deals)} 筆（${r.n} 個社區）`).join("、")
          + "。成交筆數多代表可比的參考案例多，不論買方估價或賣方訂價都比較有依據。";
      })()],
    ...(trend ? [["高雄這四個生活圈的房價走勢，長期來看漲了多少？",
      `四區合併計算的電梯住宅成交單價中位數，從 ${trend.first.year} 年的 ${trend.first.unit} 萬元／坪`
      + `到 ${trend.last.year} 年的 ${trend.last.unit} 萬元／坪，累計`
      + (trend.changePct > 0 ? `上漲約 ${trend.changePct}%` : trend.changePct < 0 ? `下跌約 ${Math.abs(trend.changePct)}%` : "大致持平")
      + `，計算樣本 ${nf(trend.sample)} 筆；高點在 ${trend.peak.year} 年的 ${trend.peak.unit} 萬元／坪。`
      + `各區逐年的數字與起算年不同的說明，在「高雄四大生活圈房價走勢（${trend.span}）」那一頁。`]] : []),
    ["這些數字多久更新一次？",
      "內政部於每月 1、11、21 日批次公告實價登錄，本站於公告隔日自動更新，所以行情會隨新成交累積變動。各頁都標示成交資料的更新日期。"],
  ];
  const items = rows.map(r => ({ name: r.name, url: `${SITE}/areas/${r.slug}/` }));
  return shell({
    eyebrow: "Areas", crumb: "生活圈",
    faqHeading: "關於高雄四大生活圈的常見問題", h1: "高雄四大生活圈",
    lead: esc(lead), hasBuyers, dataUpdated,
    body: `${trend ? `<div class="mt-8 border-l-2 border-orange pl-5">
    <p class="text-[16px] text-ink leading-[1.9] max-w-3xl">
      <strong class="font-bold">要看長期走勢，四區並排比較比一頁一頁點更快。</strong>
      ${trend.span} 逐年單價中位數：${trend.first.unit} → ${trend.last.unit} 萬元／坪，
      高點在 ${trend.peak.year} 年的 ${trend.peak.unit} 萬元／坪，樣本 ${nf(trend.sample)} 筆。
    </p>
    <a href="${trend.slug}/index.html" class="inline-block mt-4 py-1.5 font-mono text-[13px] text-orangeDeep hover:underline">看高雄四大生活圈房價走勢 →</a>
  </div>` : ""}
  ${grid(rows.map(r => card(`${r.slug}/index.html`, r.name,
      `${r.n} 個社區・2020 年起成交 ${nf(r.deals)} 筆`
      + (r.up ? `・單價中位 ${r.up.toFixed(1)} 萬／坪` : "")
      + (r.tp ? `・總價中位 ${nf(Math.round(r.tp))} 萬` : ""),
      `單價中位 ${r.up.toFixed(1)} 萬／坪　總價中位 ${nf(Math.round(r.tp))} 萬`)))}`,
    faq,
    meta: {
      title: `高雄四大生活圈房價一覽｜美術館、農十六、瑞豐巨蛋、中都｜${BRAND.teamName}`,
      description: `美術館特區、農十六特區、瑞豐・巨蛋、中都重劃區共 ${totalC} 個社區的實價登錄行情對照，含單價與總價中位數、成交筆數與屋齡結構。`,
      keywords: "高雄生活圈,美術館特區房價,農十六房價,瑞豐巨蛋房價,中都重劃區房價,高雄買房",
      canonical: url, ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
    },
    jsonLd: [...ld({ name: "高雄四大生活圈", url, description: lead, items, crumb: "生活圈" }), faqLd(faq)],
  });
}

/* ================= /schools/ ================= */
function schoolsHub({ schools, dealsMap = {}, hasBuyers, dataUpdated }) {
  const url = `${SITE}/schools/`;
  schools = schools.map(s => ({ ...s, st: statsOf(s.slugs, dealsMap) }));
  const es = schools.filter(s => /國小/.test(s.name)).sort((a, b) => b.count - a.count);
  const js = schools.filter(s => !/國小/.test(s.name)).sort((a, b) => b.count - a.count);
  const total = schools.reduce((n, s) => n + s.count, 0);
  const lead = `本站把收錄社區的學區欄位整理成 ${schools.length} 個學區頁（國小 ${es.length} 所、國中 ${js.length} 所），`
    + `每一頁列出該學區的社區清單、成交筆數與近三年單價區間，並附上官方學區劃分的里鄰原文。`
    + `要先說清楚：高雄市的學區以「里」與「鄰」劃分，社區名稱不是依據，同一個社區跨鄰時不同門牌也可能分屬不同學校。`
    + `底下每一所學校都標了對應社區數、2020 年起的成交筆數與單價中位數，可以先看量級再點進去看逐筆成交。`;
  const faq = [
    ["高雄的學區怎麼查才準？",
      "要看那一戶所在的里與鄰，不是看社區名稱或路名。先查門牌屬於哪一個里，再對應學區劃分表，最後向學校或區公所確認。本站的學區查詢工具可以用行政區與里別查到對應的國小與國中。"],
    ["這些學區頁是官方資料嗎？",
      "不是。表格是本站社區資料裡「學區」欄位的整理結果，官方依據是各頁附的高雄市學區劃分一覽表原文。正式歸屬請以入學當年度教育局及學校的公告為準。"],
    ["為什麼有些學校沒有專頁？",
      "學區頁只替收錄社區數達 3 個以上的學校建立，數量太少的學校不另外開頁，避免用單一社區代表整個學區。該社區的學區資訊仍會寫在它自己的社區頁上。"],
    [`收錄社區最多的學區是哪幾個？`,
      `以本站收錄的社區數排序，國小是${es.slice(0, 3).map(x => `${x.name}（${x.count} 個社區、2020 年起成交 ${nf(x.st.deals)} 筆、單價中位 ${x.st.up.toFixed(1)} 萬／坪）`).join("、")}；`
      + `國中是${js.slice(0, 3).map(x => `${x.name}（${x.count} 個社區、2020 年起成交 ${nf(x.st.deals)} 筆、單價中位 ${x.st.up.toFixed(1)} 萬／坪）`).join("、")}。`
      + `社區數多代表本站的樣本多、行情比較有依據，不代表學校排名。`],
    ["不同學區的房價差多少？",
      `以本站收錄社區的成交資料看，${[...es, ...js].filter(x => x.st.up).sort((a, b) => b.st.up - a.st.up).slice(0, 1).map(x => `單價中位數最高的是 ${x.name} 學區的 ${x.st.up.toFixed(1)} 萬／坪`)[0]}，`
      + `${[...es, ...js].filter(x => x.st.up).sort((a, b) => a.st.up - b.st.up).slice(0, 1).map(x => `最低的是 ${x.name} 學區的 ${x.st.up.toFixed(1)} 萬／坪`)[0]}。`
      + `但這個差距主要反映的是生活圈與屋齡結構，不是學校本身的溢價——同一個學區裡不同社區的差距，往往比學區之間還大。`],
    ["總量管制學校是什麼意思？",
      "表示該校容量已接近上限、名額有限，即使戶籍設在學區內仍可能需要抽籤或改分發到鄰近學校，部分學校還會要求一定的設籍期間。以就學為主要購屋考量時，務必在下訂前直接向學校確認。"],
  ];
  const sec = (title, arr, note) => `<section class="mt-14">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-2">
      <h2 class="display text-[23px]">${esc(title)}</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${arr.length} 所</span>
    </div>
    <p class="text-[15px] text-inkFaint leading-[1.9] mt-3">${esc(note)}</p>
    ${grid(arr.map(s => card(`${s.slug}/index.html`, s.name, statLine(s.count, s.st), "")))}
  </section>`;
  const items = schools.map(s => ({ name: s.name, url: `${SITE}/schools/${s.slug}/` }));
  return shell({
    eyebrow: "School Zones", crumb: "學區",
    faqHeading: "關於高雄學區的常見問題", h1: "高雄學區總覽",
    lead: esc(lead), hasBuyers, dataUpdated,
    body: `<div class="mt-8 border-l-2 border-orange pl-5">
    <p class="text-[16px] text-ink leading-[1.9] max-w-3xl">
      <strong class="font-bold">要查特定門牌的學區，用工具比看清單快。</strong>
      選擇行政區與里別，一次查出對應的國小與國中。
    </p>
    <a href="../tools/school-zone/index.html" class="inline-block mt-4 py-1.5 font-mono text-[13px] text-orangeDeep hover:underline">用里別查學區 →</a>
  </div>
  ${sec("國小學區", es, `依社區數排序，合計涵蓋 ${es.reduce((n, s) => n + s.count, 0)} 個社區次。`)}
  ${sec("國中學區", js, `依社區數排序，合計涵蓋 ${js.reduce((n, s) => n + s.count, 0)} 個社區次。`)}`,
    faq,
    meta: {
      title: `高雄學區總覽｜${schools.length} 個學區的社區清單與行情｜${BRAND.teamName}`,
      description: `高雄鼓山、左營、三民區共 ${schools.length} 個國小與國中學區，每個學區列出對應社區、實價登錄成交筆數與單價區間，並附官方里鄰劃分原文。`,
      keywords: "高雄學區,高雄國小學區,高雄國中學區,鼓山區學區,左營區學區,三民區學區,學區宅,高雄學區查詢",
      canonical: url, ogImage: `${SITE}/assets/logo-full.png`,
    },
    jsonLd: [...ld({ name: "高雄學區總覽", url, description: lead, items, crumb: "學區" }), faqLd(faq)],
  });
}

/* ================= /developers/ ================= */
function developersHub({ developers, dealsMap = {}, hasBuyers, dataUpdated }) {
  const url = `${SITE}/developers/`;
  const rows = developers.map(d => ({ ...d, st: statsOf(d.slugs, dealsMap) }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((n, d) => n + d.count, 0);
  const lead = `本站收錄社區的建設公司中，有 ${rows.length} 家在四大生活圈推案 3 個社區以上，合計 ${total} 個社區。`
    + `每一頁列出該建商在本站收錄的作品、完工年、戶數與實價登錄成交行情，`
    + `可以用來比較同一家建商不同年代、不同生活圈的案子。`
    + `底下每一家都標了社區數、2020 年起的成交筆數與單價中位數，可以先看量級再點進去看逐筆成交。`;
  const faq = [
    ["為什麼要看建商？",
      "同一家建商的案子在格局規劃、用料與公設配置上往往有延續性，看過它早期的案子，對新案的實際使用狀況會比較有概念。不過建商只是參考之一，屋齡、生活圈、樓層與屋況的影響通常更直接。"],
    ["建商名稱怎麼認定？",
      "以社區規格表的「建設公司」欄位為準，資料取自好房網、成家網、591、信義房屋、樂居等公開平台並於社區頁註明出處。同一集團不同公司名稱、或兩個平台記載不一致時，社區頁會並列說明。"],
    [`本站收錄最多社區的建商是哪幾家？`,
      `${rows.slice(0, 5).map(d => `${d.name}（${d.count} 個社區、2020 年起成交 ${nf(d.st.deals)} 筆）`).join("、")}。`
      + `這是本站收錄範圍內的數字，只涵蓋美術館特區、農十六特區、瑞豐・巨蛋與中都重劃區，不等於該建商在高雄的總推案量。`],
    ["為什麼有些建商沒有專頁？",
      `建商頁只替本站收錄 3 個社區以上的建商建立，少於 3 個不另外開頁，避免用單一個案代表一家公司。該社區的建商資訊仍會寫在它自己的社區頁上。`],
  ];
  const items = rows.map(d => ({ name: d.name, url: `${SITE}/developers/${d.slug}/` }));
  return shell({
    eyebrow: "Developers", crumb: "建商",
    faqHeading: "關於高雄建商的常見問題", h1: "高雄建商總覽",
    lead: esc(lead), hasBuyers, dataUpdated,
    body: grid(rows.map(d => card(`${d.slug}/index.html`, d.name, statLine(d.count, d.st), ""))),
    faq,
    meta: {
      title: `高雄建商總覽｜${rows.length} 家建設公司的社區與實價登錄行情｜${BRAND.teamName}`,
      description: `美術館特區、農十六、瑞豐巨蛋與中都重劃區共 ${rows.length} 家建商、${total} 個社區，每家列出作品清單、完工年、戶數與成交行情。`,
      keywords: "高雄建商,高雄建設公司,京城建設,皇苑建設,高雄推案,建商評價,高雄買房",
      canonical: url, ogImage: `${SITE}/assets/logo-full.png`,
    },
    jsonLd: [...ld({ name: "高雄建商總覽", url, description: lead, items, crumb: "建商" }), faqLd(faq)],
  });
}

/* ================= /tools/ ================= */
function toolsHub({ hasBuyers }) {
  const url = `${SITE}/tools/`;
  const lead = `四個免費試算工具，資料與演算法都寫在頁面上，不需要留任何個人資料就能使用。`
    + `學區查詢依高雄市學區劃分一覽表逐字轉錄；房貸、新青安與持有稅試算的公式與參數都公開標示，可以自己核對。`;
  const faq = [
    ["這些工具要留資料嗎？",
      "不用。四個工具都在瀏覽器裡計算，不會把你輸入的數字送到任何伺服器，也不需要註冊或留下聯絡方式。"],
    ["試算結果可以直接拿去跟銀行談嗎？",
      "試算是估算，用來抓量級與比較方案。實際的貸款成數、利率與年限由銀行依個人條件核定，稅額則以稅捐稽徵機關的核定為準，簽約前請以正式文件為準。"],
    ["四個工具分別在算什麼？",
      "學區查詢：選行政區與里別，查出對應的國小與國中學區，並標示總量管制與自由學區。"
      + "房貸試算：輸入總價、成數、年限與利率，算出月付金、總利息與收入負擔比，可加入寬限期。"
      + "新青安 3.0 試算：檢核年齡、所得與房屋總價三道門檻，並算出利息補貼「3＋3」逐年退場後月付金的變化。"
      + "房地合一稅試算：輸入買價、賣價、必要費用與持有年數，自動判斷稅率級距，並把四個級距加上自住優惠的稅額並列比較。"],
    ["算完之後要去哪裡看實際行情？",
      "本站收錄高雄四大生活圈的社區逐筆實價登錄成交紀錄，日期、坪數、樓層、格局與車位都列出來。房貸與新青安兩個工具頁底下也附了四個生活圈近一年的常見總價與自備款推算，可以直接對照。"],
    ["學區查詢的資料從哪裡來？",
      "依高雄市 115 學年度國民小學、國民中學學區劃分一覽表逐字轉錄，未經改寫，目前收錄鼓山區、左營區與三民區。學區以里、鄰劃分，工具查到里，鄰別請對照頁面上的原文。"],
  ];
  const items = TOOLS.map(t => ({ name: t.title, url: `${SITE}/tools/${t.slug}/` }));
  return shell({
    eyebrow: "Tools", crumb: "試算工具",
    faqHeading: "關於試算工具的常見問題", h1: "買房試算工具",
    lead: esc(lead), hasBuyers, dataUpdated: "",
    body: grid(TOOLS.map(t => card(`${t.slug}/index.html`, t.title, t.intro, t.code))),
    faq,
    meta: {
      title: `買房試算工具｜學區查詢、房貸、新青安、持有稅｜${BRAND.teamName}`,
      description: "四個免費工具：高雄學區查詢、房貸試算、新青安資格與額度試算、房屋稅與地價稅試算。公式與資料來源都公開標示，不需留個人資料。",
      keywords: "高雄學區查詢,房貸試算,新青安試算,房屋稅試算,地價稅試算,買房工具",
      canonical: url, ogImage: `${SITE}/assets/logo-full.png`,
    },
    jsonLd: [...ld({ name: "買房試算工具", url, description: lead, items, crumb: "試算工具" }), faqLd(faq)],
  });
}

/* ---------- 入口 ---------- */
export function buildHubs({ areas = [], communities = [], dealsMap = {},
                            indexPages = { developers: [], schools: [] },
                            hasBuyers = false, dataUpdated = "", trend = null } = {}) {
  const out = [
    ["areas", areasHub({ areas, communities, dealsMap, hasBuyers, dataUpdated, trend })],
    ["schools", schoolsHub({ schools: indexPages.schools || [], dealsMap, hasBuyers, dataUpdated })],
    ["developers", developersHub({ developers: indexPages.developers || [], dealsMap, hasBuyers, dataUpdated })],
    ["tools", toolsHub({ hasBuyers })],
  ];
  out.forEach(([dir, html]) => {
    mkdirSync(path.join(ROOT, dir), { recursive: true });
    writeFileSync(path.join(ROOT, dir, "index.html"), html, "utf-8");
    console.log("[產生]", `${dir}/index.html`);
  });
  return out.map(([dir]) => dir);
}
