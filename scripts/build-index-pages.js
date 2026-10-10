/**
 * 澄果團隊｜建商頁與學區頁
 * ------------------------------------------------
 * 兩組從既有資料自動生出來的長尾落地頁：
 *
 *   developers/<slug>/   例如 developers/jingcheng/
 *     「京城建設在高雄有哪些社區」——認建商的買方會整家看下去，
 *     而這類查詢目前站上沒有任何頁面在回答。
 *
 *   schools/<slug>/      例如 schools/zhongshan-elementary/
 *     「中山國小學區有哪些社區」——家長最高意圖的查詢。
 *     這一頁同時放官方的里鄰劃分原文（data/school-zones.json，
 *     逐字轉錄自高雄市學區劃分一覽表），以及本站社區的學區登載，
 *     並講清楚兩者的關係：官方以里鄰劃分，社區名稱不是依據。
 *
 * 兩組都只在「收錄的社區數達到門檻」時才產生頁面。
 * 一家建商只有一個社區、一所學校只對到一個社區，做成獨立頁沒有資訊量，
 * 反而是薄內容頁，對整站有害。
 *
 * ⚠️ 產生出來的 HTML 不要直接改，會被覆蓋。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, head, header, footer } from "./lib/layout.js";
import { specVal, yearBuilt, unitCount, updatedDate, twDate, devName } from "./build-communities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* 達到這個社區數才做獨立頁。低於門檻的不做，免得產生薄內容頁。 */
const MIN_DEV = 3;
const MIN_SCHOOL = 3;

/* 這一輪實際產生了哪些建商／學區頁。
   社區頁要在建商或學區「有頁面」時才放連結，不然會連到 404。
   buildIndexPages 在 build-site.js 裡先於 buildCommunities 執行？
   —— 不是，順序是社區頁先跑。所以這裡先預掃一次社區設定，
   把達門檻的名單算出來，兩邊用的是同一組判斷。 */
let HAS_DEV = null;
let HAS_SCHOOL = null;
function ensureSets() {
  if (HAS_DEV && HAS_SCHOOL) return;
  HAS_DEV = new Set(); HAS_SCHOOL = new Set();
  let list = [];
  try {
    list = (JSON.parse(readFileSync(path.join(ROOT, "data/communities.json"), "utf-8")).communities || [])
      .filter(c => !c.draft);
  } catch { return; }
  const d = new Map(), sc = new Map();
  list.forEach(c => {
    const k = devName(c);
    if (k) d.set(k, (d.get(k) || 0) + 1);
    schoolNames(c).forEach(n => sc.set(n, (sc.get(n) || 0) + 1));
  });
  [...d.entries()].forEach(([k, n]) => { if (n >= MIN_DEV) HAS_DEV.add(k); });
  [...sc.entries()].forEach(([k, n]) => { if (n >= MIN_SCHOOL) HAS_SCHOOL.add(k); });
}
/* 給社區頁用：達門檻才回 slug，否則回空字串（不放連結） */
export function devSlugOf(rawName) {
  ensureSets();
  const k = devName(rawName);
  return k && HAS_DEV.has(k) ? devSlug(k) : "";
}
export function schoolSlugOf(rawName) {
  ensureSets();
  const k = splitSchools(rawName)[0] || "";
  return k && HAS_SCHOOL.has(k) ? schoolSlug(k) : "";
}

/* 學校名稱正規化：不同批次的社區資料寫法不一致
   （「中山國小」「市立中山國小」「鼓山區中山國小」都出現過）。 */
/* 一個欄位裡可能並列兩所學校（「龍華國小／勝利國小」），拆開後各自正規化 */
export function splitSchools(s) {
  return String(s || "")
    .split(/[\/\uFF0F\u3001,\uFF0C;\uFF1B]/)
    .map(normSchool)
    .filter(Boolean);
}

/* 一個社區涉及的所有學校（國小＋國中，含並列寫法），去重 */
export function schoolNames(c) {
  const out = new Set();
  [c?.school?.primary, c?.school?.junior].filter(Boolean)
    .forEach(x => splitSchools(x).forEach(n => out.add(n)));
  return [...out];
}

export function normSchool(s) {
  return String(s || "")
    .replace(/^高雄市/, "")
    .replace(/^(市立|私立|縣立)/, "")
    .replace(/^[\u4e00-\u9fa5]{1,3}區/, "")
    .trim();
}

/* 生活圈 → 獨立頁 slug（與 build-areas.js 一致） */
const AREA_SLUG = {
  "美術館特區": "art-museum", "農十六特區": "nong16",
  "瑞豐・巨蛋": "ruifeng-arena", "中都重劃區": "zhongdu",
};

/* ---------- 建商名稱 ----------
   正規化用 build-communities.js 的 devName（同一支，避免兩邊規則不一致
   導致「京城建設」與「京城建設股份有限公司」被當成兩家、slug 又相同而互相覆蓋）。 */
const devKey = devName;
const devLabel = n => String(n || "");

/* 建商 slug：中文名沒辦法直接當網址（會變成一長串 %E4%BA%AC），
   所以維護一張對照表。表裡沒有的建商用代碼式 slug，
   仍然是英數、仍然穩定，只是可讀性差一點。 */
const DEV_SLUG = {
  "京城建設": "jingcheng", "皇苑建設": "huangyuan", "全誠建設": "quancheng",
  "遠見建設": "yuanjian", "麗晶建設": "lijing", "太子建設": "taizi",
  "鼎宇建設": "dingyu", "興富發": "xingfufa", "隆大建設": "longda",
  "國硯建設": "guoyan", "城揚建設": "chengyang", "雄崗建設": "xionggang",
  "上揚建設": "shangyang", "新宿建設": "xinsu", "齊裕建設": "qiyu",
  "全泉開發": "quanquan", "榮欣建設": "rongxin", "泰郡建設": "taijun",
  "笙富建設": "shengfu", "百星建設": "baixing", "天邑建設": "tianyi",
  "皇邑建設": "huangyi", "崑郡建設": "kunjun", "芳崗建設": "fanggang",
  "串本建設": "chuanben", "嵩豐建設": "songfeng", "源鑫建設": "yuanxin",
  "進隆建設": "jinlong", "同盛建設": "tongsheng", "利融建設": "lirong",
  "國美建設": "guomei", "高承開發": "gaocheng",
  "興富發建設": "xingfufa", "北京建設": "beijing", "光洲建設": "guangzhou",
  "太普開發": "taipu", "堅山建設": "jianshan", "勝偕建設": "shengxie",
  "棋琴建設": "qiqin", "振美建設": "zhenmei", "永信建設開發": "yongxin",
  "福懋建設": "fumao", "嵩豐建設": "songfeng",
};
function devSlug(name) {
  const base = devLabel(name);
  if (DEV_SLUG[base]) return DEV_SLUG[base];
  /* 對照表沒有的：用名稱的 UTF-8 位元組做一個短而穩定的代碼。
     同一個名稱每次算出來都一樣，不會因為排序改變而換網址。 */
  let h = 0;
  for (const ch of base) h = (h * 31 + ch.codePointAt(0)) % 0xFFFFFFFF;
  return `dev-${h.toString(36)}`;
}

/* ---------- 學校 ---------- */
/* 學校名稱 → slug。用學校名的注音／拼音沒有現成資料，
   所以同樣維護一張表，表外的用代碼式 slug。 */
const SCHOOL_SLUG = {
  "中山國小": "zhongshan-es", "龍華國小": "longhua-es", "新莊國小": "xinzhuang-es",
  "勝利國小": "shengli-es", "新上國小": "xinshang-es", "三民國小": "sanmin-es",
  "十全國小": "shiquan-es", "鼓山國小": "gushan-es", "內惟國小": "neiwei-es",
  "河濱國小": "hebin-es", "七賢國中": "qixian-js", "明華國中": "minghua-js",
  "龍華國中": "longhua-js", "左營國中": "zuoying-js", "大義國中": "dayi-js",
  "三民國中": "sanmin-js", "前金國中": "qianjin-js", "鼓山高中國中部": "gushan-hs-js",
};
function schoolSlug(name) {
  if (SCHOOL_SLUG[name]) return SCHOOL_SLUG[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 0xFFFFFFFF;
  return `school-${h.toString(36)}`;
}

/* ---------- 共用：社區表格 ---------- */
function commTable(rows, captionText) {
  return `<div class="overflow-x-auto border border-line rounded-sm bg-surface">
    <table class="w-full text-[15px] min-w-[640px]">
      <caption class="sr-only">${esc(captionText)}</caption>
      <thead>
        <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
          <th scope="col" class="text-left font-normal py-3 px-4">社區</th>
          <th scope="col" class="text-left font-normal py-3 px-4">生活圈</th>
          <th scope="col" class="text-left font-normal py-3 px-4">完工</th>
          <th scope="col" class="text-right font-normal py-3 px-4">戶數</th>
          <th scope="col" class="text-right font-normal py-3 px-4">成交筆數</th>
          <th scope="col" class="text-right font-normal py-3 px-4">住家單價區間<span class="block font-mono text-[11px] text-inkFaint">近三年</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr class="border-b border-line last:border-0">
          <th scope="row" class="py-3.5 px-4 text-left font-normal">
            <a href="../../communities/${r.c.slug}.html" class="text-ink hover:text-orangeDeep font-medium">${esc(r.c.name)}</a>
            <span class="block font-mono text-[12px] text-inkFaint mt-0.5">${esc(r.c.address.replace(`高雄市${r.c.district}`, ""))}</span>
          </th>
          <td class="py-3.5 px-4 text-[14px] text-inkSoft">${esc(r.c.area)}</td>
          <td class="py-3.5 px-4 font-mono text-[14px] text-inkSoft">${r.year || "—"}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] text-inkSoft">${r.units || "—"}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] ${r.n < 12 ? "text-inkFaint" : "text-ink"}">${r.n}${r.n > 0 && r.n < 12 ? `<span class="text-orangeDeep" title="成交筆數少於 12 筆，行情參考性有限">＊</span>` : ""}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] text-ink">${r.low ? `${r.low}–${r.high}` : "—"}${r.fellBack ? `<span class="text-orangeDeep" title="近三年成交不足三筆，改用全部歷史計算">⁺</span>` : ""}${!r.fellBack && r.usable < 5 ? `<span class="text-inkFaint" title="近三年可用成交僅 ${r.usable} 筆，參考性有限">˙</span>` : ""}</td>
        </tr>`).join("\n        ")}
      </tbody>
    </table>
  </div>
  <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
    單價單位為萬元／坪，已排除店面成交。標 <span class="text-orangeDeep">＊</span> 者成交筆數少於 12 筆，
    行情參考性有限，建議點進社區頁看逐筆紀錄。完工年以內政部實價登錄的建築完成年月為基準。
  </p>`;
}

/* 與生活圈頁的表格採同一套規則：單價只取近三年、用 Q1–Q3 而不是最低～最高。
   資料池回補到 2012 年後，全期間會把十四年的價格混成一個數字；
   而最低～最高會被親屬移轉、持分交易這類異常價拉開（蘭園畫世紀近三年
   min-max 是 4.6–40.8，Q1–Q3 是 22.5–29.7）。
   成交筆數仍為全部歷史的累計；近三年不足 3 筆者退回全期間。 */
/* 摘要用的「一般成交」樣本：排除被標＊的特殊交易（親屬移轉、持分交易等）。
   門檻與社區頁逐筆表格的 ＊ 一致：低於中位六成或高於一點六倍。
   樣本少於 5 筆時不排除，因為中位數本身就不可靠。 */
function normalPrices(sorted) {
  /* 門檻訂在 3 筆：原本訂 5 筆，導致只有三、四筆的社區完全不排除異常，
     區間變成「博源新家大廈 5.7–30.7」「貝多芬 8–33.9」這種沒有意義的數字。
     三筆時中位數雖然只是中間那一筆，但拿來擋掉低於六成的親屬移轉仍然有效。 */
  if (sorted.length < 3) return sorted;
  const m = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  if (!(m > 0)) return sorted;
  const out = sorted.filter(v => v >= m * 0.6 && v <= m * 1.6);
  return out.length >= 2 ? out : sorted;
}

/* 摘要區間：樣本夠多才用 Q1–Q3，少的時候用最低～最高。
   Q1–Q3 的用意是擋掉尾端的極端值，但樣本只有四、五筆時，
   取 25/75 百分位等於直接丟掉最低與最高那一筆真實成交——
   捷運城品排除特殊交易後剩 4 筆（35.4、41.7、42.6、47.1），
   Q1–Q3 會顯示成 41.7–47.1，把 35.4 這筆真實成交藏起來，屋主會高估。
   異常值已經在 normalPrices 擋掉了，小樣本直接用全距才完整。 */
function summaryRange(normal) {
  if (!normal.length) return [0, 0];
  if (normal.length < 8) return [normal[0], normal[normal.length - 1]];
  const at = f => normal[Math.min(normal.length - 1, Math.floor(normal.length * f))];
  return [at(0.25), at(0.75)];
}

const STAT_SINCE = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
})();

function statOf(c, dealsMap) {
  const deals = dealsMap[c.slug] || [];
  const homes = deals.filter(d => d.use !== "店面");
  const recent = homes.filter(d => String(d.date || "") >= STAT_SINCE);
  const fellBack = recent.length < 3 && homes.length > 0;
  const p = normalPrices((recent.length >= 3 ? recent : homes)
    .map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b));
  const [lo, hi] = summaryRange(p);
  return { c, n: deals.length, low: lo, high: hi, fellBack, usable: p.length,
           year: yearBuilt(c), units: unitCount(c) };
}

function areaBreakdown(items) {
  const m = new Map();
  items.forEach(c => m.set(c.area, (m.get(c.area) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/* ---------- 建商頁 ---------- */
function developerPage(name, items, ctx) {
  const { dealsMap, dataUpdated, hasBuyers } = ctx;
  const slug = devSlug(name);
  const url = `${SITE}/developers/${slug}/`;
  const label = devLabel(name);
  const rows = items.map(c => statOf(c, dealsMap)).sort((a, b) => b.n - a.n);
  const dealTotal = rows.reduce((n, r) => n + r.n, 0);
  const years = items.map(c => Number(yearBuilt(c))).filter(Boolean).sort();
  const areas = areaBreakdown(items);

  const lead = `${label}在本站收錄的高雄四大生活圈內共有 ${items.length} 個社區，`
    + `合計 ${dealTotal.toLocaleString("en-US")} 筆內政部實價登錄成交紀錄`
    + (years.length ? `，完工年從 ${years[0]} 年到 ${years[years.length - 1]} 年` : "")
    + `，分布在${areas.map(([a, n]) => `${a}（${n} 個）`).join("、")}。`;

  const faq = [
    [`${label}在高雄有哪些社區？`,
      `本站收錄的高雄四大生活圈內，${label}共有 ${items.length} 個社區：${items.map(c => c.name).join("、")}。`
      + `完整資料在本頁下方的表格，每一個社區名稱都可以點進去看逐筆實價登錄成交、規格、學區與常見問題。`
      + `要提醒的是，這是本站收錄範圍內的數量，${label}在高雄其他區域可能還有其他案子，不在本站的整理範圍。`],
    [`${label}的社區在哪一個生活圈最多？`,
      `以本站收錄的社區來看，${areas.map(([a, n]) => `${a}有 ${n} 個`).join("、")}。`
      + `${areas[0] ? `${areas[0][0]}是這家建商在本站範圍內最集中的區域。` : ""}`
      + `不同生活圈的行情與生活條件差異不小，可以先看各生活圈的行情頁再回來比個別社區。`],
    [`買同一家建商的房子有什麼要注意的？`,
      `同一家建商的案子在用料、格局規劃與公設配置上通常有延續性，看過一個案子對其他案子會比較有感。`
      + `但要注意年代差異——早期與近期的案子在結構工法、車位型式、公設比與管線配置上可能差很多，`
      + `不能直接把某一案的印象套到另一案。實際的屋況、管委會運作與修繕紀錄，還是要一個一個看。`
      + `建商名稱各平台的記載也常不一致（有的寫母公司、有的寫案名公司），本頁以本站規格表登載的名稱歸類。`],
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "CollectionPage",
      name: `${label}高雄社區一覽`, url, description: lead, inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      about: { "@type": "Organization", name: name },
      publisher: { "@type": "RealEstateAgent", name: BRAND.teamName, url: `${SITE}/` },
      mainEntity: {
        "@type": "ItemList", name: `${label}的社區`, numberOfItems: items.length,
        itemListElement: items.map((c, i) => ({
          "@type": "ListItem", position: i + 1,
          item: { "@type": "ApartmentComplex", name: c.name, url: `${SITE}/communities/${c.slug}.html` },
        })),
      },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "社區行情", item: `${SITE}/communities/` },
        { "@type": "ListItem", position: 3, name: `${label}的社區`, item: url },
      ],
    },
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  return [
    head({
      title: `${label}高雄社區一覽｜${items.length} 個社區實價登錄行情｜${BRAND.teamName}`,
      description: `${label}在高雄美術館特區、農十六特區、瑞豐巨蛋與中都重劃區的 ${items.length} 個社區，含完工年、戶數、實價登錄成交筆數與近三年住家單價區間。`,
      keywords: [`${label}`, `${label}高雄`, `${label}社區`, `${label}建案`, `${name}`, "高雄建商", "高雄社區實價登錄"].join(","),
      canonical: url, ogImage: `${SITE}/assets/logo-full.png`, depth: 2, jsonLd,
    }),
    header({ depth: 2, hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span>
    <a href="../../communities/index.html" class="hover:text-orangeDeep">社區行情</a><span class="mx-2">/</span>
    <span>${esc(label)}</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Developer</div>
  <h1 class="display text-[30px] md:text-[38px]">${esc(label)}在高雄的社區</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-3xl">${esc(lead)}</p>
  ${dataUpdated ? `<p class="mt-4 font-mono text-[12px] text-inkFaint">
    資料更新於 <time datetime="${dataUpdated}">${twDate(dataUpdated)}</time>
    ・成交紀錄來源：內政部不動產交易實價查詢服務網
  </p>` : ""}
  <div class="mt-8 h-px bg-line"></div>

  <section class="mt-12">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">社區一覽</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${items.length} 個社區・成交 ${dealTotal.toLocaleString("en-US")} 筆</span>
    </div>
    ${commTable(rows, `${label}在高雄的 ${items.length} 個社區，欄位為社區名稱、生活圈、完工年、總戶數、實價登錄成交筆數（全部歷史）、近三年住家單價區間`)}
  </section>

  <section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">關於${esc(label)}的常見問題</h2>
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

  <section class="mt-16">
    <h2 class="display text-[21px] mb-6">依生活圈看行情</h2>
    <div class="grid sm:grid-cols-2 gap-5">
      ${areas.filter(([a]) => AREA_SLUG[a]).map(([a, n]) => `<a href="../../areas/${AREA_SLUG[a]}/index.html" class="border border-line rounded-sm bg-surface p-6 hover:border-orange hover:bg-tint transition block">
        <div class="text-[19px] font-bold tracking-tight">${esc(a)}</div>
        <p class="mt-2 font-mono text-[13px] text-inkSoft">${esc(label)}在這一區有 ${n} 個社區</p>
      </a>`).join("\n      ")}
    </div>
  </section>

  <section class="mt-16 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">在看${esc(label)}的案子？</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      同一家建商不同年代的案子，屋況與管委會運作差很多。
      澄果團隊在這幾個生活圈長期成交，可以告訴你各社區目前的實際市況與該注意的地方。
    </p>
    <div class="mt-6 flex flex-wrap gap-3">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
      <a href="#estimate" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">我是屋主，想估價 →</a>
    </div>
  </section>
</main>`,
    footer({ depth: 2, hasBuyers }),
  ].join("\n");
}

/* ---------- 學區頁 ---------- */
function schoolPage(name, items, ctx) {
  const { dealsMap, dataUpdated, hasBuyers, zones } = ctx;
  const slug = schoolSlug(name);
  const url = `${SITE}/schools/${slug}/`;
  const stage = /國中|高中/.test(name) ? "國民中學" : "國民小學";
  const rows = items.map(c => statOf(c, dealsMap)).sort((a, b) => b.n - a.n);
  const dealTotal = rows.reduce((n, r) => n + r.n, 0);
  const areas = areaBreakdown(items);

  /* 官方學區原文：data/school-zones.json 是逐字轉錄的，
     這裡只挑出這所學校的那幾筆，不改寫一個字。 */
  const official = (zones.entries || []).filter(e => e.school === name || e.school === name.replace("國小", "國民小學"));
  const capped = items.some(c => /總量管制/.test(c.school?.note || ""));

  const lead = `本站收錄的高雄四大生活圈社區中，學區欄位登載為${name}的有 ${items.length} 個社區，`
    + `合計 ${dealTotal.toLocaleString("en-US")} 筆內政部實價登錄成交紀錄，`
    + `分布在${areas.map(([a, n]) => `${a}（${n} 個）`).join("、")}。`
    + `要特別說明：高雄市的學區是以「里」與「鄰」劃分，社區名稱不是學區的依據，`
    + `同一個社區跨鄰時不同門牌也可能分屬不同學校。`;

  const faq = [
    [`${name}學區有哪些社區？`,
      `本站收錄的社區中，學區欄位登載為${name}的有 ${items.length} 個：${items.map(c => c.name).join("、")}。`
      + `完整清單在本頁下方表格。但這只是本站的整理結果，不是官方依據——`
      + `高雄市的學區以里、鄰劃分，正式歸屬請用本站的學區查詢工具選擇該戶所在的行政區與里別核對，`
      + `並以入學當年度教育局及學校的公告為準。`],
    [`怎麼確認某一戶是不是${name}學區？`,
      `要看那一戶所在的「里」與「鄰」，不是看社區名稱或路名。同一條路的單號側與雙號側可能分屬不同學校，`
      + `同一個社區跨鄰時也可能一部分在學區內、一部分不在。`
      + `那一戶的門牌屬於哪一個里，可以在戶籍資料或內政部戶政司的門牌查詢服務查到，`
      + `查到里別之後再用本站的學區查詢工具對應學校，最後向學校或區公所確認。`
      + `學區每學年可能調整，簽約前再確認一次最保險。`],
    ...(capped ? [[`${name}是總量管制學校嗎？設籍就一定能讀嗎？`,
      `本站的社區資料中，${name}被標示為總量管制學校。總量管制表示該校容量已接近上限、名額有限，`
      + `即使戶籍設在學區內，仍可能需要抽籤或改分發到鄰近學校。`
      + `部分熱門學校還會要求一定的設籍期間。以就學為主要購屋考量的話，`
      + `務必在下訂之前直接向學校確認當學年度的實際狀況與設籍要求。`]] : []),
    [`${name}學區的社區行情大概多少？`,
      `本頁下方的表格列出這 ${items.length} 個社區各自的實價登錄成交筆數與近三年住家單價區間。`
      + `學區只是影響房價的其中一個因素，屋齡、生活圈、坪數與屋況的影響往往更大，`
      + `所以同一個學區內的社區價差可能很大，不宜把學區當成單一的價格依據。`
      + `建議點進個別社區頁看逐筆成交紀錄，挑條件接近的來比。`],
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "CollectionPage",
      name: `${name}學區社區一覽`, url, description: lead, inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      about: { "@type": "School", name, address: { "@type": "PostalAddress", addressLocality: "高雄市", addressCountry: "TW" } },
      publisher: { "@type": "RealEstateAgent", name: BRAND.teamName, url: `${SITE}/` },
      mainEntity: {
        "@type": "ItemList", name: `${name}學區的社區`, numberOfItems: items.length,
        itemListElement: items.map((c, i) => ({
          "@type": "ListItem", position: i + 1,
          item: { "@type": "ApartmentComplex", name: c.name, url: `${SITE}/communities/${c.slug}.html` },
        })),
      },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "學區查詢", item: `${SITE}/tools/school-zone/` },
        { "@type": "ListItem", position: 3, name: `${name}學區`, item: url },
      ],
    },
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  return [
    head({
      title: `${name}學區有哪些社區？${items.length} 個社區實價登錄行情｜${BRAND.teamName}`,
      description: `學區登載為${name}的 ${items.length} 個高雄社區，含完工年、戶數、實價登錄成交筆數與近三年住家單價區間，並附高雄市${stage}學區劃分的官方里鄰原文。`,
      keywords: [`${name}學區`, `${name}學區社區`, `${name}`, "高雄學區", `高雄${stage}學區`, "學區宅"].join(","),
      canonical: url, ogImage: `${SITE}/assets/logo-full.png`, depth: 2, jsonLd,
    }),
    header({ depth: 2, hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span>
    <a href="../../tools/school-zone/index.html" class="hover:text-orangeDeep">學區查詢</a><span class="mx-2">/</span>
    <span>${esc(name)}</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">School Zone</div>
  <h1 class="display text-[30px] md:text-[38px]">${esc(name)}學區有哪些社區</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-3xl">${esc(lead)}</p>
  ${dataUpdated ? `<p class="mt-4 font-mono text-[12px] text-inkFaint">
    成交資料更新於 <time datetime="${dataUpdated}">${twDate(dataUpdated)}</time>
  </p>` : ""}

  <div class="mt-8 border-l-2 border-orange pl-5">
    <p class="text-[16px] text-ink leading-[1.9] max-w-3xl">
      <strong class="font-bold">這一頁不是學區的正式依據。</strong>
      表格是本站社區資料裡「學區」欄位的整理結果，官方依據是下方的里鄰劃分原文。
      請用學區查詢工具核對你要看的那一戶所在的里別，並以入學當年度教育局及學校的公告為準。
    </p>
    <a href="../../tools/school-zone/index.html" class="inline-block mt-4 font-mono text-[13px] text-orangeDeep hover:underline">用里別查學區 →</a>
  </div>

  <section class="mt-14">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">社區一覽</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${items.length} 個社區・成交 ${dealTotal.toLocaleString("en-US")} 筆</span>
    </div>
    ${commTable(rows, `學區登載為${name}的 ${items.length} 個社區，欄位為社區名稱、生活圈、完工年、總戶數、實價登錄成交筆數（全部歷史）、近三年住家單價區間`)}
  </section>

  ${official.length ? `<section class="mt-16" id="official">
    <h2 class="display text-[23px] mb-4">${esc(name)}的官方學區範圍</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      以下為官方學區劃分一覽表的原文，逐字轉錄、未經改寫。鄰別與自由學區的註記一併保留。
    </p>
    ${official.map(e => `<div class="border border-line rounded-sm bg-surface p-6 mb-4">
      <div class="font-mono text-[12px] text-inkFaint">${esc(e.stage || stage)}・校址 ${esc(e.schoolDistrict || "")}・學區所在 ${esc(e.zoneDistrict || "")}</div>
      <p class="text-[16px] text-ink leading-[2] mt-3">${esc(e.zone)}</p>
    </div>`).join("\n    ")}
    <p class="text-[13px] text-inkFaint leading-relaxed mt-3">
      資料來源：${esc(zones.sourceName || "高雄市學區劃分一覽表")}（${esc(zones.schoolYear || "")} 學年度）。
      ${zones.sourceUrl ? `<a href="${zones.sourceUrl}" target="_blank" rel="noopener noreferrer" class="text-orangeDeep hover:underline">官方原始檔</a>` : ""}
    </p>
  </section>` : `<section class="mt-16">
    <h2 class="display text-[23px] mb-4">${esc(name)}的官方學區範圍</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] max-w-3xl">
      本站的學區劃分資料目前只收錄鼓山區、左營區與三民區的範圍，這所學校的官方原文不在收錄範圍內。
      請用<a href="../../tools/school-zone/index.html" class="text-orangeDeep hover:underline">學區查詢工具</a>或直接向學校確認。
    </p>
  </section>`}

  <section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">關於${esc(name)}學區的常見問題</h2>
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

  <section class="mt-16 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">想確認某一戶實際讀哪一間？</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      學區牽涉到鄰別與設籍時間，社區跨鄰的狀況也不少。
      把你在看的物件門牌給我們，澄果團隊直接幫你查清楚。
    </p>
    <div class="mt-6 flex flex-wrap gap-3">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
      <a href="#estimate" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">我是屋主，想估價 →</a>
    </div>
  </section>
</main>`,
    footer({ depth: 2, hasBuyers }),
  ].join("\n");
}

/* ---------- 主流程 ---------- */
function cleanStale(dir, keep) {
  if (!existsSync(dir)) return;
  readdirSync(dir).forEach(f => {
    if (!keep.has(f)) {
      rmSync(path.join(dir, f), { recursive: true, force: true });
      console.log("[移除] 已不再符合門檻：", path.join(path.basename(dir), f));
    }
  });
}

export function buildIndexPages({ hasBuyers = false } = {}) {
  let config, dealsData, zones;
  try {
    config = JSON.parse(readFileSync(path.join(ROOT, "data/communities.json"), "utf-8"));
  } catch {
    console.warn("[提示] 沒有 data/communities.json，略過建商頁與學區頁");
    return { developers: [], schools: [] };
  }
  try { dealsData = JSON.parse(readFileSync(path.join(ROOT, "data/community-deals.json"), "utf-8")); }
  catch { dealsData = { deals: {} }; }
  try { zones = JSON.parse(readFileSync(path.join(ROOT, "data/school-zones.json"), "utf-8")); }
  catch { zones = { entries: [] }; }

  const list = (config.communities || []).filter(c => !c.draft);
  const dealsMap = dealsData.deals || {};
  const dataUpdated = updatedDate(dealsData.updatedAt);
  const ctx = { dealsMap, dataUpdated, hasBuyers, zones };

  /* ---- 建商 ---- */
  const byDev = new Map();
  list.forEach(c => {
    const k = devKey(c);
    if (!k) return;
    if (!byDev.has(k)) byDev.set(k, []);
    byDev.get(k).push(c);
  });
  const devs = [...byDev.entries()].filter(([, v]) => v.length >= MIN_DEV)
    .sort((a, b) => b[1].length - a[1].length);
  const devKeep = new Set();
  devs.forEach(([name, items]) => {
    const slug = devSlug(name);
    devKeep.add(slug);
    const dir = path.join(ROOT, "developers", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), developerPage(name, items, ctx), "utf-8");
    console.log("[產生]", `developers/${slug}/index.html`, `（${devLabel(name)}：${items.length} 個社區）`);
  });
  cleanStale(path.join(ROOT, "developers"), devKeep);

  /* ---- 學區 ---- */
  const bySchool = new Map();
  list.forEach(c => {
    schoolNames(c).forEach(k => {
      if (!bySchool.has(k)) bySchool.set(k, []);
      bySchool.get(k).push(c);
    });
  });
  const schools = [...bySchool.entries()].filter(([, v]) => v.length >= MIN_SCHOOL)
    .sort((a, b) => b[1].length - a[1].length);
  const schoolKeep = new Set();
  schools.forEach(([name, items]) => {
    const slug = schoolSlug(name);
    schoolKeep.add(slug);
    const dir = path.join(ROOT, "schools", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), schoolPage(name, items, ctx), "utf-8");
    console.log("[產生]", `schools/${slug}/index.html`, `（${name}：${items.length} 個社區）`);
  });
  cleanStale(path.join(ROOT, "schools"), schoolKeep);

  console.log(`[完成] 共產生 ${devs.length} 個建商頁、${schools.length} 個學區頁`);
  return {
    developers: devs.map(([name, items]) => ({ slug: devSlug(name), name: devLabel(name), count: items.length })),
    schools: schools.map(([name, items]) => ({ slug: schoolSlug(name), name, count: items.length })),
  };
}
