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
import { SITE, BRAND, esc, head, header, footer } from "./lib/layout.js";
import { yearBuilt, unitCount, twDate } from "./build-communities.js";
import { TOOLS } from "./build-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const nf = n => Number(n || 0).toLocaleString("en-US");
const med = a => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return !n ? 0 : (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2); };
const SINCE = "2020-01-01";

/* ---------- 共用：頁面骨架 ---------- */
function shell({ eyebrow, h1, lead, crumb, body, faq, jsonLd, meta, hasBuyers, dataUpdated }) {
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
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
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
      publisher: { "@type": "RealEstateAgent", name: BRAND.teamName, url: `${SITE}/` },
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

/* ================= /areas/ ================= */
function areasHub({ areas, communities, dealsMap, hasBuyers, dataUpdated }) {
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
    ["這些數字多久更新一次？",
      "內政部於每月 1、11、21 日批次公告實價登錄，本站於公告隔日自動更新，所以行情會隨新成交累積變動。各頁都標示成交資料的更新日期。"],
  ];
  const items = rows.map(r => ({ name: r.name, url: `${SITE}/areas/${r.slug}/` }));
  return shell({
    eyebrow: "Areas", crumb: "生活圈", h1: "高雄四大生活圈",
    lead: esc(lead), hasBuyers, dataUpdated,
    body: grid(rows.map(r => card(`${r.slug}/index.html`, r.name,
      `${r.n} 個社區・2020 年起成交 ${nf(r.deals)} 筆`,
      `單價中位 ${r.up.toFixed(1)} 萬／坪　總價中位 ${nf(Math.round(r.tp))} 萬`))),
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
function schoolsHub({ schools, hasBuyers, dataUpdated }) {
  const url = `${SITE}/schools/`;
  const es = schools.filter(s => /國小/.test(s.name)).sort((a, b) => b.count - a.count);
  const js = schools.filter(s => !/國小/.test(s.name)).sort((a, b) => b.count - a.count);
  const total = schools.reduce((n, s) => n + s.count, 0);
  const lead = `本站把收錄社區的學區欄位整理成 ${schools.length} 個學區頁（國小 ${es.length} 所、國中 ${js.length} 所），`
    + `每一頁列出該學區的社區清單、成交筆數與近三年單價區間，並附上官方學區劃分的里鄰原文。`
    + `要先說清楚：高雄市的學區以「里」與「鄰」劃分，社區名稱不是依據，同一個社區跨鄰時不同門牌也可能分屬不同學校。`;
  const faq = [
    ["高雄的學區怎麼查才準？",
      "要看那一戶所在的里與鄰，不是看社區名稱或路名。先查門牌屬於哪一個里，再對應學區劃分表，最後向學校或區公所確認。本站的學區查詢工具可以用行政區與里別查到對應的國小與國中。"],
    ["這些學區頁是官方資料嗎？",
      "不是。表格是本站社區資料裡「學區」欄位的整理結果，官方依據是各頁附的高雄市學區劃分一覽表原文。正式歸屬請以入學當年度教育局及學校的公告為準。"],
    ["為什麼有些學校沒有專頁？",
      "學區頁只替收錄社區數達 3 個以上的學校建立，數量太少的學校不另外開頁，避免用單一社區代表整個學區。該社區的學區資訊仍會寫在它自己的社區頁上。"],
    ["總量管制學校是什麼意思？",
      "表示該校容量已接近上限、名額有限，即使戶籍設在學區內仍可能需要抽籤或改分發到鄰近學校，部分學校還會要求一定的設籍期間。以就學為主要購屋考量時，務必在下訂前直接向學校確認。"],
  ];
  const sec = (title, arr, note) => `<section class="mt-14">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-2">
      <h2 class="display text-[23px]">${esc(title)}</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${arr.length} 所</span>
    </div>
    <p class="text-[15px] text-inkFaint leading-[1.9] mt-3">${esc(note)}</p>
    ${grid(arr.map(s => card(`${s.slug}/index.html`, s.name, `${s.count} 個社區`, "")))}
  </section>`;
  const items = schools.map(s => ({ name: s.name, url: `${SITE}/schools/${s.slug}/` }));
  return shell({
    eyebrow: "School Zones", crumb: "學區", h1: "高雄學區總覽",
    lead: esc(lead), hasBuyers, dataUpdated,
    body: `<div class="mt-8 border-l-2 border-orange pl-5">
    <p class="text-[16px] text-ink leading-[1.9] max-w-3xl">
      <strong class="font-bold">要查特定門牌的學區，用工具比看清單快。</strong>
      選擇行政區與里別，一次查出對應的國小與國中。
    </p>
    <a href="../tools/school-zone/index.html" class="inline-block mt-4 font-mono text-[13px] text-orangeDeep hover:underline">用里別查學區 →</a>
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
function developersHub({ developers, hasBuyers, dataUpdated }) {
  const url = `${SITE}/developers/`;
  const rows = developers.slice().sort((a, b) => b.count - a.count);
  const total = rows.reduce((n, d) => n + d.count, 0);
  const lead = `本站收錄社區的建設公司中，有 ${rows.length} 家在四大生活圈推案 3 個社區以上，合計 ${total} 個社區。`
    + `每一頁列出該建商在本站收錄的作品、完工年、戶數與實價登錄成交行情，`
    + `可以用來比較同一家建商不同年代、不同生活圈的案子。`;
  const faq = [
    ["為什麼要看建商？",
      "同一家建商的案子在格局規劃、用料與公設配置上往往有延續性，看過它早期的案子，對新案的實際使用狀況會比較有概念。不過建商只是參考之一，屋齡、生活圈、樓層與屋況的影響通常更直接。"],
    ["建商名稱怎麼認定？",
      "以社區規格表的「建設公司」欄位為準，資料取自好房網、成家網、591、信義房屋、樂居等公開平台並於社區頁註明出處。同一集團不同公司名稱、或兩個平台記載不一致時，社區頁會並列說明。"],
    ["為什麼有些建商沒有專頁？",
      `建商頁只替本站收錄 3 個社區以上的建商建立，少於 3 個不另外開頁，避免用單一個案代表一家公司。該社區的建商資訊仍會寫在它自己的社區頁上。`],
  ];
  const items = rows.map(d => ({ name: d.name, url: `${SITE}/developers/${d.slug}/` }));
  return shell({
    eyebrow: "Developers", crumb: "建商", h1: "高雄建商總覽",
    lead: esc(lead), hasBuyers, dataUpdated,
    body: grid(rows.map(d => card(`${d.slug}/index.html`, d.name, `${d.count} 個社區`, ""))),
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
    ["學區查詢的資料從哪裡來？",
      "依高雄市 115 學年度國民小學、國民中學學區劃分一覽表逐字轉錄，未經改寫，目前收錄鼓山區、左營區與三民區。學區以里、鄰劃分，工具查到里，鄰別請對照頁面上的原文。"],
  ];
  const items = TOOLS.map(t => ({ name: t.title, url: `${SITE}/tools/${t.slug}/` }));
  return shell({
    eyebrow: "Tools", crumb: "試算工具", h1: "買房試算工具",
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
                            hasBuyers = false, dataUpdated = "" } = {}) {
  const out = [
    ["areas", areasHub({ areas, communities, dealsMap, hasBuyers, dataUpdated })],
    ["schools", schoolsHub({ schools: indexPages.schools || [], hasBuyers, dataUpdated })],
    ["developers", developersHub({ developers: indexPages.developers || [], hasBuyers, dataUpdated })],
    ["tools", toolsHub({ hasBuyers })],
  ];
  out.forEach(([dir, html]) => {
    mkdirSync(path.join(ROOT, dir), { recursive: true });
    writeFileSync(path.join(ROOT, dir, "index.html"), html, "utf-8");
    console.log("[產生]", `${dir}/index.html`);
  });
  return out.map(([dir]) => dir);
}
