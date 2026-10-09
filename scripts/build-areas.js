/**
 * 澄果團隊｜生活圈頁面產生器
 * ------------------------------------------------
 * 四個主力生活圈各自一個獨立頁面：
 *   areas/art-museum/     美術館特區（鼓山區）
 *   areas/nong16/         農十六特區（鼓山區）
 *   areas/ruifeng-arena/  瑞豐・巨蛋（左營區）
 *   areas/zhongdu/        中都重劃區（三民區）
 *
 * 為什麼要有這幾頁：
 * 原本「美術館特區」只是 communities/index.html#area-01 這樣的錨點，
 * 沒有獨立網址，也就沒有自己的 title、H1 與 description。
 * 但「美術館特區 房價」「農十六 行情」這類詞的搜尋量遠大於任何單一社區名，
 * 而且 AI 引擎被問到「高雄美術館特區的行情如何」時，
 * 找不到一個「就是在回答這件事」的頁面。
 *
 * 內容全部由既有資料算出來，不新增任何人工填寫的欄位：
 *   data/market-data.json     近一年的區域均價與價格帶（首頁用的同一份）
 *   data/communities.json     社區清單、門牌、規格
 *   data/community-deals.json 逐筆成交（算筆數、單價範圍、期間）
 *
 * ⚠️ 產生出來的 HTML 不要直接改，會被覆蓋。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, head, header, footer, sectionHead } from "./lib/layout.js";
import { specVal, yearBuilt, unitCount, updatedDate, twDate } from "./build-communities.js";
import { webSlug } from "./build-articles.js";
import { devSlugOf, schoolSlugOf, schoolNames } from "./build-index-pages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* 生活圈的基本設定。slug 用英數，網址才乾淨、分享出去不會變成一串 %E7%BE%8E。
   title/desc 的關鍵字刻意用使用者實際會搜的說法（「美術館特區房價」），
   而不是內部用的生活圈代碼。 */
export const AREAS = [
  {
    code: "01", name: "美術館特區", district: "鼓山區", slug: "art-museum", img: "area-01-artmuseum.jpg",
    aka: ["高雄美術館特區", "美術館園區", "美術館重劃區"],
    intro: "高雄市鼓山區的美術館特區，以 41 公頃的內惟埤文化園區與高雄市立美術館為核心，"
         + "是高雄少數以公園綠地為規劃主軸的住宅重劃區。區內以電梯住宅大樓為主，"
         + "坪數帶從 20 坪的小宅到 100 坪以上的大坪數產品都有。",
  },
  {
    code: "02", name: "農十六特區", district: "鼓山區", slug: "nong16", img: "area-02-nong16.jpg",
    aka: ["農16", "農十六", "高雄農十六"],
    intro: "農十六特區位於高雄市鼓山區，範圍大致在裕誠路、中華一路、大順一路與龍德路一帶，"
         + "是高雄早期開發的高價住宅區之一。區內大樓的屋齡跨度大，"
         + "從 1980 年代的中古大樓到近年完工的新案都有。",
  },
  {
    code: "03", name: "瑞豐・巨蛋", district: "左營區", slug: "ruifeng-arena", img: "area-03-ruifeng.jpg",
    aka: ["瑞豐夜市", "巨蛋商圈", "高雄巨蛋"],
    intro: "瑞豐・巨蛋生活圈位於高雄市左營區，以捷運紅線巨蛋站、高雄巨蛋與瑞豐夜市為中心，"
         + "新莊一路、博愛二路、裕誠路一帶的住宅大樓最集中，是高雄生活機能與捷運條件都相對成熟的區域。",
  },
  {
    code: "04", name: "中都重劃區", district: "三民區", slug: "zhongdu", img: "area-04-zhongdu.jpg",
    aka: ["中都", "中都濕地", "高雄中都重劃區"],
    intro: "中都重劃區位於高雄市三民區，鄰近中都濕地公園與愛河，"
         + "是四個生活圈裡開發最晚的一區，新建案比例高，區內成交以近年交屋的新案為主。",
  },
];

/* ---------- 小工具 ---------- */
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
const r1 = n => Math.round(n * 10) / 10;
/* 2019-06-14 → 2019 年 6 月（月份不留前導零） */
const ym = d => {
  const m = String(d || "").match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]} 年 ${Number(m[2])} 月` : "";
};

/* 從社區的 addressRanges 整理出這一區收錄的路段。
   一區有一百多個社區時，「分布在哪些路」是使用者真的會想知道的事，
   而且這串路名本身就是長尾關鍵字（「美術東二路 社區」）。 */
function roadsOf(items) {
  const count = new Map();
  items.forEach(c => (c.addressRanges || []).forEach(r => {
    if (!r.road) return;
    count.set(r.road, (count.get(r.road) || 0) + 1);
  }));
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
}

/* 建商分布：只列出在這一區有兩個以上社區的建商。
   一個社區一家建商列出來沒有資訊量，兩個以上才看得出誰在這一區推案多。 */
function developersOf(items) {
  const count = new Map();
  items.forEach(c => {
    const raw = specVal(c, "建設公司");
    if (!raw) return;
    /* 「皇邑建設（信義房屋記為天邑建設）」這種要取括號前的主名稱；
       「全泉開發、寶日營造」這種以頓號分隔的取第一個。 */
    const name = raw.split(/[（(]/)[0].split(/[、,，/]/)[0].trim();
    if (!name) return;
    count.set(name, (count.get(name) || 0) + 1);
  });
  return [...count.entries()].filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
}

/* 屋齡分布：用完工年分組，讓人一眼看出這一區是新案多還是中古多 */
function eraOf(items) {
  const buckets = [
    ["2020 年後", y => y >= 2020],
    ["2010–2019 年", y => y >= 2010 && y <= 2019],
    ["2000–2009 年", y => y >= 2000 && y <= 2009],
    ["1990–1999 年", y => y >= 1990 && y <= 1999],
    ["1989 年以前", y => y > 0 && y <= 1989],
  ];
  const out = buckets.map(([label]) => ({ label, n: 0 }));
  let unknown = 0;
  items.forEach(c => {
    const y = Number(yearBuilt(c));
    if (!y) { unknown++; return; }
    const i = buckets.findIndex(([, f]) => f(y));
    if (i >= 0) out[i].n++; else unknown++;
  });
  return { rows: out.filter(r => r.n > 0), unknown };
}

/* ---------- 行情區塊 ----------
   數字與首頁用的是同一份 market-data.json，說明文字也刻意保持一致，
   免得同一個數字在兩頁上有兩種解釋。 */
function marketBlock(areaMarket) {
  const types = (areaMarket?.types || []).filter(t => t.avgPricePerPing || t.sampleSize);
  if (!types.length) {
    return `<p class="text-[16px] text-inkSoft leading-[1.9]">
      近一年這一區還沒有足夠的成交紀錄可以計算區域均價。下方的社區清單仍有逐筆成交可以參考。
    </p>`;
  }
  return `<div class="grid sm:grid-cols-2 gap-6">
    ${types.map(t => `<div class="border border-line rounded-sm bg-surface p-7">
      <div class="font-mono text-[12px] tracking-wider text-inkFaint">${esc(t.label)}</div>
      ${t.avgPricePerPing ? `<div class="mt-2">
        <span class="font-mono text-[32px] font-semibold text-ink leading-none">${t.avgPricePerPing}</span>
        <span class="font-mono text-[13px] text-inkSoft ml-1">萬元／坪</span>
      </div>
      <dl class="mt-5 pt-5 border-t border-line space-y-2.5 font-mono text-[13px]">
        ${t.bandLow && t.bandHigh ? `<div class="flex justify-between gap-3">
          <dt class="text-inkFaint">常見單價區間</dt><dd class="text-ink">${t.bandLow}–${t.bandHigh} 萬元／坪</dd>
        </div>` : ""}
        ${t.medianTotalPrice ? `<div class="flex justify-between gap-3">
          <dt class="text-inkFaint">常見總價</dt><dd class="text-ink">${Number(t.medianTotalPrice).toLocaleString("en-US")} 萬元</dd>
        </div>` : ""}
        <div class="flex justify-between gap-3">
          <dt class="text-inkFaint">計算樣本</dt><dd class="text-ink">${t.sampleSize} 筆${t.buildingSize ? `・${t.buildingSize} 個門牌` : ""}</dd>
        </div>
      </dl>
      ${t.lowSample ? `<p class="font-mono text-[12px] text-orangeDeep mt-4">樣本數偏少，僅供參考</p>` : ""}
      ${(t.sampleSize >= 20 && t.buildingSize > 0 && t.sampleSize / t.buildingSize > 3.5)
        ? `<p class="font-mono text-[12px] text-orangeDeep mt-4">含新案交屋的一手成交，會高於區內中古行情</p>` : ""}`
      : `<p class="text-[15px] text-inkSoft leading-[1.9] mt-3">近一年無成交紀錄。</p>`}
    </div>`).join("\n    ")}
  </div>

  <p class="text-[14px] text-inkFaint leading-[1.9] mt-5 max-w-3xl">
    以上為近四季（約一年）成屋成交的每坪平均單價，已先剔除頭尾各一成極端值與單價明顯異常者。
    「常見單價區間」是把成交由低到高排列後去掉最高與最低各四分之一的範圍，
    實際成交仍可能高於或低於此區間。「常見總價」取正中間那一筆，比平均數不容易被少數高價案拉高。
    電梯住宅與透天分開計算，兩者的單價不能直接比較。資料來源為內政部不動產交易實價查詢服務網。
  </p>`;
}

/* ---------- 社區清單表格 ----------
   用真的 <table>：AI 引擎解析 HTML 表格比解析一堆卡片 <div> 準確得多，
   而且一百多個社區用表格比卡片好掃。 */
/* 生活圈的「屋主估價」區塊。
   這一段的目的跟上面的買方內容不同：它要回答屋主的三個問題——
   我這區現在行情多少、我的社區好不好賣、我家落在什麼位置。
   數字全部由該區的實際成交算出來，所以每一區的內容都不一樣，
   不會變成四頁雷同的樣板。 */
/* 價格水準只看近一年
   ------------------------------------------------
   資料池回補到 2012 年之後，成交紀錄橫跨十四年。拿全期間算中位數會嚴重失真：
   美術館特區 2012 年的中位數是 18.3 萬、2024 年因新成屋交屋潮衝到 45.3 萬、
   2025 與 2026 回到 36 萬附近。全期間混在一起算出來是 26.2 萬，
   比近一年的 36.3 萬低了快三成——這一區標題寫著「有房子要賣？」，
   屋主照這個數字訂價會直接少賣幾百萬。
   所以價格水準（單價、總價、坪數）一律只取近一年，與首頁行情的「近四季」一致。
   例外是下面的「同社區內部價差」與「年周轉率」：那兩個衡量的是離散度與換手頻率，
   不是價格水準，樣本需要拉長才穩定，各自有自己的期間說明。 */
function sinceISO(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
const PRICE_WINDOW_MONTHS = 12;

function sellerBlock(area, items, dealsMap) {
  const since = sinceISO(PRICE_WINDOW_MONTHS);
  const homes = items.flatMap(c => (dealsMap[c.slug] || [])
    .filter(d => d.use !== "店面" && d.unitPrice >= 3 && d.unitPrice <= 150
      && String(d.date || "") >= since));
  if (homes.length < 50) return "";

  const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
  const up = homes.map(d => d.unitPrice).sort((a, b) => a - b);
  const tp = homes.map(d => d.totalPrice).filter(Boolean).sort((a, b) => a - b);
  const pingArr = homes.map(d => d.ping).filter(Boolean).sort((a, b) => a - b);

  /* 社區內部價差：各社區自己的 Q1–Q3，再取中位數。
     屋主最常見的誤判就是拿鄰居的成交價當自己的開價依據。 */
  const spreads = items.map(c => {
    const v = (dealsMap[c.slug] || [])
      .filter(d => d.use !== "店面" && d.unitPrice >= 3 && d.unitPrice <= 150)
      .map(d => d.unitPrice).sort((a, b) => a - b);
    return v.length >= 20 ? q(v, 0.75) - q(v, 0.25) : null;
  }).filter(x => x !== null).sort((a, b) => a - b);

  /* 年周轉率：近三年成屋成交 ÷ 總戶數。排除 2021 年後完工的交屋潮。 */
  const turn = items.map(c => {
    const u = unitCount(c);
    const y = yearBuilt(c);
    if (!u || u < 30 || !y || Number(String(y).slice(0, 4)) > 2020) return null;
    const n = (dealsMap[c.slug] || [])
      .filter(d => d.kind === "成屋" && d.use !== "店面" && String(d.date || "") >= "2023-01-01").length;
    return n >= 3 ? n / u / 3 * 100 : null;
  }).filter(x => x !== null).sort((a, b) => a - b);

  const f1 = n => n.toFixed(1);
  const rows = [
    ["住家成交單價中位數（近一年）", `${f1(q(up, 0.5))} 萬元／坪`],
    ["單價常見區間（近一年 Q1–Q3）", `${f1(q(up, 0.25))} – ${f1(q(up, 0.75))} 萬元／坪`],
    ...(tp.length ? [["總價中位數（近一年）", `${Math.round(q(tp, 0.5)).toLocaleString("en-US")} 萬元`]] : []),
    ...(pingArr.length ? [["成交坪數中位數（近一年）", `${f1(q(pingArr, 0.5))} 坪`]] : []),
    ...(spreads.length >= 3 ? [["同社區內部價差中位數", `${f1(q(spreads, 0.5))} 萬元／坪`]] : []),
    ...(turn.length >= 3 ? [["社區年周轉率中位數", `${f1(q(turn, 0.5))}%（100 戶約成交 ${(q(turn, 0.5)).toFixed(1)} 戶／年）`]] : []),
  ];

  return `<section class="mt-16" id="valuation">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Free Valuation</div>
    <h2 class="display text-[23px] mb-4">在${esc(area.name)}有房子要賣？先看這幾個數字</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      下面的數字全部由${esc(area.name)}的 ${items.length} 個社區、${homes.length.toLocaleString("en-US")} 筆住家成交算出來，
      是你訂價時的參考底線。但要先說清楚：<strong class="font-bold text-ink">區域中位數不是你的開價</strong>，
      你的樓層、坪數、車位與屋況都會把它拉開。
    </p>
    <div class="overflow-x-auto border border-line rounded-sm bg-surface">
      <table class="w-full text-[15px] min-w-[480px]">
        <caption class="sr-only">${esc(area.name)}的住家成交單價、總價、坪數、同社區價差與周轉率</caption>
        <tbody>
          ${rows.map(([k, v]) => `<tr class="border-b border-line last:border-0">
            <th scope="row" class="py-3.5 px-4 text-left font-normal text-inkSoft">${esc(k)}</th>
            <td class="py-3.5 px-4 text-right font-mono text-[14px] text-ink">${esc(v)}</td>
          </tr>`).join("\n          ")}
        </tbody>
      </table>
    </div>
    ${spreads.length >= 3 ? `<p class="text-[15px] text-inkSoft leading-[1.9] mt-4 max-w-3xl">
      注意「同社區內部價差」那一列：在${esc(area.name)}，同一個社區的成交單價上下差了
      ${f1(q(spreads, 0.5))} 萬元／坪。以 40 坪換算是總價差
      ${Math.round(q(spreads, 0.5) * 40).toLocaleString("en-US")} 萬元。
      所以鄰居賣多少，不等於你賣得到多少——要挑樓層、坪數與車位條件相近的那幾筆來比。
    </p>` : ""}
    <p class="mt-5 font-mono text-[13px]">
      <a href="../../notes/how-to-price-your-home-kaohsiung.html" class="text-orangeDeep hover:underline mr-4">開價怎麼訂 →</a>
      <a href="../../notes/home-selling-costs-taiwan.html" class="text-orangeDeep hover:underline mr-4">賣房要付哪些錢 →</a>
      <a href="../../notes/community-turnover-kaohsiung.html" class="text-orangeDeep hover:underline">社區一年成交幾戶 →</a>
    </p>
    <div class="mt-7 bg-tint border-l-2 border-orange px-6 py-5">
      <p class="text-[16px] leading-[1.95] text-ink">
        <strong class="font-bold">想知道你那一戶的實際區間？</strong>
        把社區、樓層、坪數與車位條件給我們，用同社區的逐筆成交比給你看，並說明判斷依據。不收費，也不需要先簽委託。
      </p>
      <a href="#estimate" class="inline-flex items-center mt-4 px-6 py-3 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">免費估價 →</a>
    </div>
  </section>`;
}

/* 表格裡的單價範圍與中位數同樣只取近三年。
   資料池回補到 2012 年之後，全期間會把十四年的價格壓成一個數字——
   阿曼十六全期間中位是 23.5 萬，近三年是 38.1 萬；市政總裁全期間範圍是
   7.9–35.5 萬，那個 7.9 是十幾年前的紀錄，跟現在的行情無關。
   成交筆數欄位維持全部歷史（那是資料厚度，不是價格水準）。
   近三年不足 3 筆的社區退回全期間，避免數字變成空白。 */
const TABLE_SINCE = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
})();

function communityTable(items, dealsMap, areaName) {
  const rows = items.map(c => {
    const deals = dealsMap[c.slug] || [];
    const homes = deals.filter(d => d.use !== "店面");
    const recent = homes.filter(d => String(d.date || "") >= TABLE_SINCE);
    const prices = (recent.length >= 3 ? recent : homes)
      .map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
    return {
      c, n: deals.length,
      recentN: recent.length,
      low: prices.length ? prices[Math.floor(prices.length * 0.25)] : 0,
      high: prices.length ? prices[Math.min(prices.length - 1, Math.floor(prices.length * 0.75))] : 0,
      mid: r1(median(prices)),
      year: yearBuilt(c), units: unitCount(c),
    };
  }).sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name, "zh-Hant"));

  return `<div class="overflow-x-auto border border-line rounded-sm bg-surface">
    <table class="w-full text-[15px] min-w-[680px]">
      <caption class="sr-only">${esc(areaName)}社區一覽，共 ${items.length} 個社區，欄位為社區名稱、完工年、總戶數、實價登錄成交筆數（全部歷史）、近三年住家單價範圍（萬元／坪）、近三年單價中位數</caption>
      <thead>
        <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
          <th scope="col" class="text-left font-normal py-3 px-4">社區</th>
          <th scope="col" class="text-left font-normal py-3 px-4">完工</th>
          <th scope="col" class="text-right font-normal py-3 px-4">戶數</th>
          <th scope="col" class="text-right font-normal py-3 px-4">成交筆數</th>
          <th scope="col" class="text-right font-normal py-3 px-4">住家單價區間<span class="block font-mono text-[11px] text-inkFaint">近三年 Q1–Q3</span></th>
          <th scope="col" class="text-right font-normal py-3 px-4">中位<span class="block font-mono text-[11px] text-inkFaint">近三年</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr class="border-b border-line last:border-0">
          <th scope="row" class="py-3.5 px-4 text-left font-normal">
            <a href="../../communities/${r.c.slug}.html" class="text-ink hover:text-orangeDeep font-medium">${esc(r.c.name)}</a>
            <span class="block font-mono text-[12px] text-inkFaint mt-0.5">${esc(r.c.address.replace(`高雄市${r.c.district}`, ""))}</span>
          </th>
          <td class="py-3.5 px-4 font-mono text-[14px] text-inkSoft">${r.year || "—"}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] text-inkSoft">${r.units || "—"}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] ${r.n < 12 ? "text-inkFaint" : "text-ink"}">${r.n}${r.n < 12 && r.n > 0 ? `<span class="text-orangeDeep" title="成交筆數少於 12 筆，行情參考性有限">＊</span>` : ""}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] text-ink">${r.low ? `${r.low}–${r.high}` : "—"}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] font-semibold text-orangeDeep">${r.mid || "—"}</td>
        </tr>`).join("\n        ")}
      </tbody>
    </table>
  </div>
  <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
    單價單位為萬元／坪，<strong class="font-bold text-inkSoft">區間與中位數只計算近三年的成交，且取 25～75 百分位</strong>（更早的價格與現在差距大；最低～最高容易被親屬移轉、持分交易這類異常價拉開；
    近三年不足三筆者改以全部歷史計算）。成交筆數欄為全部歷史的累計。已排除店面成交（店面單價本來就高一截，混進來會讓人誤判住家行情）。
    標 <span class="text-orangeDeep">＊</span> 者成交筆數少於 12 筆，單價範圍的參考性有限，
    建議點進社區頁看逐筆紀錄，並搭配同路段的其他社區一起比。
  </p>`;
}

/* ---------- 單一生活圈頁 ---------- */
function areaPage(area, ctx) {
  const { items, dealsMap, areaMarket, dataUpdated, articles, others } = ctx;
  const url = `${SITE}/areas/${area.slug}/`;

  const dealTotal = items.reduce((n, c) => n + (dealsMap[c.slug] || []).length, 0);
  const allPrices = items.flatMap(c => (dealsMap[c.slug] || [])
    .filter(d => d.use !== "店面").map(d => d.unitPrice).filter(Boolean));
  const dates = items.flatMap(c => (dealsMap[c.slug] || []).map(d => d.date)).filter(Boolean).sort();
  const roads = roadsOf(items);
  const devs = developersOf(items);
  const era = eraOf(items);
  const elevator = (areaMarket?.types || []).find(t => t.key === "elevator") || areaMarket;

  /* 可直接被引用的一句話。放在 H1 底下第一段，
     主詞、地點、數量、期間、價格全部寫在同一句裡。 */
  const lead = [
    `${area.name}位於高雄市${area.district}，`,
    `本站收錄 ${items.length} 個社區、${dealTotal.toLocaleString("en-US")} 筆內政部實價登錄成交紀錄`,
    dates.length ? `，涵蓋 ${ym(dates[0])}至 ${ym(dates[dates.length - 1])}` : "",
    elevator?.avgPricePerPing
      ? `。近一年電梯住宅成交均價每坪 ${elevator.avgPricePerPing} 萬元`
        + (elevator.bandLow ? `，常見單價區間 ${elevator.bandLow} 至 ${elevator.bandHigh} 萬元／坪` : "")
        + (elevator.medianTotalPrice ? `，常見總價 ${Number(elevator.medianTotalPrice).toLocaleString("en-US")} 萬元` : "")
      : "",
    "。",
  ].join("");

  const faq = [
    [`${area.name}的房價行情大概多少？`,
      elevator?.avgPricePerPing
        ? `近一年${area.name}的電梯住宅成交均價是每坪 ${elevator.avgPricePerPing} 萬元，常見單價區間 ${elevator.bandLow}–${elevator.bandHigh} 萬元／坪，常見總價 ${Number(elevator.medianTotalPrice || 0).toLocaleString("en-US")} 萬元，計算樣本為 ${elevator.sampleSize} 筆成交。不過區域均價只能抓大概的範圍，同一個生活圈裡不同社區、不同屋齡、不同樓層的價差往往比區域之間的價差還大。本頁下方列出這一區 ${items.length} 個社區各自的成交筆數與單價範圍，建議直接看你要買的那幾個社區的逐筆紀錄。`
        : `這一區近一年的成交樣本還不足以計算可靠的區域均價。本頁下方列出 ${items.length} 個社區各自的實價登錄成交筆數與單價範圍，建議直接看個別社區的逐筆紀錄，或直接問我們目前的實際市況。`],
    [`${area.name}有哪些社區？`,
      `本站目前收錄 ${items.length} 個社區，分布在 ${roads.length} 條路段，其中社區數最多的是${roads.slice(0, 5).map(([r, n]) => `${r}（${n} 個）`).join("、")}。完整清單在本頁下方的社區一覽表，每一個社區名稱都可以點進去看逐筆實價登錄成交、社區規格與學區。清單是依成交筆數排序的，筆數多的社區行情參考性比較高。`],
    [`${area.name}的社區屋齡大概是什麼分布？`,
      era.rows.length
        ? `以本站收錄的社區來看，${era.rows.map(r => `${r.label}完工的有 ${r.n} 個`).join("、")}${era.unknown ? `，另有 ${era.unknown} 個社區的完工時間公開資料未載明` : ""}。屋齡直接影響貸款成數與年限、管線與公共設備的維護狀況，以及未來的修繕費用，看屋時建議一併問管委會的修繕紀錄與公共基金餘額。`
        : `本站收錄的社區中，完工時間的公開資料還不完整，暫時無法呈現屋齡分布。個別社區的完工年月可以在社區頁的規格表看到，該欄位以內政部實價登錄的建築完成年月為基準。`],
    [`在${area.name}買房，要準備多少自備款？`,
      elevator?.medianTotalPrice
        ? `以這一區近一年的常見總價 ${Number(elevator.medianTotalPrice).toLocaleString("en-US")} 萬元來算，貸款八成、自備兩成的話，自備款大約是 ${Math.round(elevator.medianTotalPrice * 0.2).toLocaleString("en-US")} 萬元。除了自備款，還要準備仲介費、代書費、登記規費與契稅，以及進場整理的裝潢費用。實際貸款成數會依屋齡、物件條件與個人信用狀況調整，屋齡較高的物件銀行可能把成數或年限壓低。建議用本站的房貸試算工具，從你每月可負擔的還款金額反推可承受的總價與自備款。`
        : `一般以貸款八成、自備兩成來抓。除了自備款，還要準備仲介費、代書費、登記規費與契稅，以及裝潢費用。實際成數會依屋齡、物件條件與個人信用狀況調整。建議用本站的房貸試算工具，從你每月可負擔的還款金額反推總價與自備款。`],
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${area.name}房價行情與社區一覽`,
      url,
      description: lead,
      inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      about: {
        "@type": "Place",
        name: `高雄市${area.district}${area.name}`,
        alternateName: area.aka,
        address: {
          "@type": "PostalAddress",
          addressLocality: "高雄市",
          addressRegion: area.district,
          addressCountry: "TW",
        },
        containedInPlace: { "@type": "City", name: "高雄市" },
      },
      publisher: {
        "@type": "RealEstateAgent",
        name: BRAND.teamName,
        legalName: BRAND.legalName,
        url: `${SITE}/`,
        telephone: "+886-7-9766977",
      },
      mainEntity: {
        "@type": "ItemList",
        name: `${area.name}社區一覽`,
        numberOfItems: items.length,
        itemListElement: items.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "ApartmentComplex",
            name: c.name,
            url: `${SITE}/communities/${c.slug}.html`,
          },
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "社區行情", item: `${SITE}/communities/` },
        { "@type": "ListItem", position: 3, name: area.name, item: url },
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

  /* 這一區的成交資料集：跟社區頁一樣標 Dataset，但範圍是整個生活圈。
     AI 被問到「高雄美術館特區的成交資料哪裡有」時，指向的就是這一頁。 */
  if (dealTotal) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${area.name}實價登錄成交紀錄彙總`,
      description: `高雄市${area.district}${area.name}內 ${items.length} 個社區、共 ${dealTotal} 筆不動產買賣成交紀錄的彙總，含各社區的成交筆數、住家單價範圍與單價中位數。已排除實價登錄標示解約的紀錄。`,
      url,
      temporalCoverage: `${dates[0]}/${dates[dates.length - 1]}`,
      spatialCoverage: { "@type": "Place", name: `高雄市${area.district}${area.name}` },
      creator: {
        "@type": "GovernmentOrganization",
        name: "內政部不動產交易實價查詢服務網",
        url: "https://plvr.land.moi.gov.tw/",
      },
      publisher: { "@type": "Organization", name: BRAND.legalName, url: `${SITE}/` },
      isAccessibleForFree: true,
      inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      variableMeasured: ["社區名稱", "完工年", "總戶數", "成交筆數", "住家單價範圍（萬元／坪）", "單價中位數（萬元／坪）"],
    });
  }

  /* 相關文章：標題或標籤裡提到這個生活圈的就列出來 */
  const rel = articles.filter(a => {
    const hay = [a.title, a.excerpt, ...(a.tags || [])].filter(Boolean).join(" ");
    return [area.name, ...area.aka].some(k => hay.includes(k));
  }).slice(0, 3);

  return [
    head({
      title: `高雄${area.name}房價行情與社區一覽｜${items.length} 個社區實價登錄｜${BRAND.teamName}`,
      description: `高雄${area.name}（${area.district}）的房價行情與 ${items.length} 個社區的實價登錄成交紀錄。`
        + (elevator?.avgPricePerPing ? `近一年電梯住宅成交均價每坪 ${elevator.avgPricePerPing} 萬元，常見單價 ${elevator.bandLow}–${elevator.bandHigh} 萬元／坪。` : "")
        + `含各社區完工年、戶數、成交筆數與單價範圍。`,
      keywords: [`${area.name}房價`, `${area.name}行情`, `${area.name}社區`,
                 `高雄${area.name}`, ...area.aka, `高雄${area.district}房價`,
                 `${area.name}實價登錄`].join(","),
      canonical: url,
      ogImage: `${SITE}/assets/${area.img}`,
      depth: 2, jsonLd,
    }),
    header({ depth: 2, hasBuyers: ctx.hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span>
    <a href="../../communities/index.html" class="hover:text-orangeDeep">社區行情</a><span class="mx-2">/</span>
    <span>${esc(area.name)}</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">高雄市${esc(area.district)}</div>
  <h1 class="display text-[30px] md:text-[40px]">高雄${esc(area.name)}房價行情與社區一覽</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-3xl">${esc(lead)}</p>
  <p class="mt-4 text-[16px] text-inkSoft leading-[1.95] max-w-3xl">${esc(area.intro)}</p>
  ${dataUpdated ? `<p class="mt-4 font-mono text-[12px] text-inkFaint">
    資料更新於 <time datetime="${dataUpdated}">${twDate(dataUpdated)}</time>
    ・來源：內政部不動產交易實價查詢服務網（每月 1、11、21 日批次公告）
  </p>` : ""}
  <div class="mt-8 h-px bg-line"></div>

  <!-- 區域行情 -->
  <section class="mt-12" id="market">
    <h2 class="display text-[23px] mb-6">${esc(area.name)}近一年成交行情</h2>
    ${marketBlock(areaMarket)}
  </section>

  <!-- 社區一覽 -->
  <section class="mt-16" id="communities">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">${esc(area.name)}社區一覽</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${items.length} 個社區・成交 ${dealTotal.toLocaleString("en-US")} 筆</span>
    </div>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      依實價登錄成交筆數排序。點社區名稱可以看該社區的逐筆成交紀錄、規格、學區與常見問題。
      成交紀錄逐筆呈現、不做平均——同一個社區裡樓層、面向、坪數與車位配置不同，
      單價落差往往比想像中大。
    </p>
    ${communityTable(items, dealsMap, area.name)}
  </section>

  <!-- 路段分布 -->
  ${roads.length ? `<section class="mt-16" id="roads">
    <h2 class="display text-[23px] mb-4">${esc(area.name)}的社區分布路段</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      本站收錄的 ${items.length} 個社區，門牌分布在以下 ${roads.length} 條路段（括號內為該路段的社區數）。
    </p>
    <p class="text-[16px] text-ink leading-[2.2]">
      ${roads.map(([r, n]) => `<span class="inline-block mr-3">${esc(r)}<span class="font-mono text-[13px] text-inkFaint ml-1">（${n}）</span></span>`).join("")}
    </p>
  </section>` : ""}

  <!-- 建商與屋齡 -->
  <section class="mt-16 grid md:grid-cols-2 gap-10">
    ${devs.length ? `<div>
      <h2 class="display text-[21px] mb-5">在這一區推案較多的建商</h2>
      <dl class="border-t border-line">
        ${devs.slice(0, 10).map(([d, n]) => { const ds = devSlugOf(d); return `<div class="flex justify-between gap-4 py-3.5 border-b border-line">
          <dt class="text-[15px] text-ink">${ds
            ? `<a href="../../developers/${ds}/index.html" class="hover:text-orangeDeep">${esc(d)}</a>` : esc(d)}</dt>
          <dd class="font-mono text-[14px] text-inkSoft shrink-0">${n} 個社區</dd>
        </div>`; }).join("\n        ")}
      </dl>
      <p class="text-[13px] text-inkFaint leading-relaxed mt-3">
        只列出在這一區有兩個以上社區的建商。建商名稱取自公開平台，各平台記載可能不同。
      </p>
    </div>` : ""}
    ${era.rows.length ? `<div>
      <h2 class="display text-[21px] mb-5">社區完工年代分布</h2>
      <dl class="border-t border-line">
        ${era.rows.map(r => `<div class="flex justify-between gap-4 py-3.5 border-b border-line">
          <dt class="text-[15px] text-ink">${esc(r.label)}</dt>
          <dd class="font-mono text-[14px] text-inkSoft shrink-0">${r.n} 個社區</dd>
        </div>`).join("\n        ")}
        ${era.unknown ? `<div class="flex justify-between gap-4 py-3.5 border-b border-line">
          <dt class="text-[15px] text-inkFaint">公開資料未載明</dt>
          <dd class="font-mono text-[14px] text-inkFaint shrink-0">${era.unknown} 個社區</dd>
        </div>` : ""}
      </dl>
      <p class="text-[13px] text-inkFaint leading-relaxed mt-3">
        完工年以內政部實價登錄的建築完成年月為基準。
      </p>
    </div>` : ""}
  </section>

  <!-- FAQ -->
  <section class="mt-16 pt-10 border-t-2 border-ink" id="faq">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">關於${esc(area.name)}的常見問題</h2>
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
    <h2 class="display text-[21px] mb-6">在${esc(area.name)}買賣前，可以先算的事</h2>
    <div class="grid sm:grid-cols-2 gap-5">
      ${[["房貸試算", "../../tools/mortgage/index.html", "從每月可負擔的還款金額反推總價與自備款"],
         ["學區查詢", "../../tools/school-zone/index.html", "選行政區與里別，查對應的國小、國中學區"],
         ["新青安試算", "../../tools/qingan/index.html", "資格條件、額度與利率補貼試算"],
         ["稅費概算", "../../tools/property-tax/index.html", "房地合一稅、土地增值稅與重購退稅"]]
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

  <!-- 學區 -->
  ${(() => {
    /* 用 schoolNames 正規化：資料裡「龍華國小」「市立龍華國小」
       「市立鼓山區龍華國小」是同一所，並列寫法（龍華國小／勝利國小）
       也要拆開。不正規化的話同一所學校會被拆成好幾列。 */
    const m = new Map();
    items.forEach(c => schoolNames(c).forEach(n => {
      const sl = schoolSlugOf(n);
      if (sl) m.set(n, { slug: sl, n: (m.get(n)?.n || 0) + 1 });
    }));
    const rows = [...m.entries()].sort((a, b) => b[1].n - a[1].n);
    if (!rows.length) return "";
    return `<section class="mt-16" id="schools">
    <h2 class="display text-[21px] mb-4">依學區看${esc(area.name)}的社區</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      括號內是本站社區資料中學區欄位登載為該校的社區數。學區以里、鄰劃分，
      社區名稱不是依據，實際歸屬請用學區查詢工具核對該戶所在的里別。
    </p>
    <p class="text-[16px] text-ink leading-[2.2]">
      ${rows.map(([n, v]) => `<a href="../../schools/${v.slug}/index.html" class="inline-block mr-4 text-orangeDeep hover:underline">${esc(n)}<span class="font-mono text-[13px] text-inkFaint ml-1">（${v.n}）</span></a>`).join("")}
    </p>
  </section>`;
  })()}

  ${sellerBlock(area, items, dealsMap)}

  <!-- 其他生活圈 -->
  <section class="mt-16">
    <h2 class="display text-[21px] mb-6">其他生活圈</h2>
    <div class="grid sm:grid-cols-3 gap-5">
      ${others.map(o => `<a href="../${o.slug}/index.html" class="border border-line rounded-sm bg-surface p-6 hover:border-orange hover:bg-tint transition block">
        <div class="font-mono text-[12px] tracking-wider text-inkFaint">高雄市${esc(o.district)}</div>
        <div class="text-[19px] font-bold tracking-tight mt-1">${esc(o.name)}</div>
        <div class="font-mono text-[13px] text-inkSoft mt-3">${o.count} 個社區・成交 ${o.deals.toLocaleString("en-US")} 筆</div>
      </a>`).join("\n      ")}
    </div>
    <a href="../../communities/index.html" class="inline-block mt-6 font-mono text-[13px] text-orangeDeep hover:underline">看全部 ${ctx.totalCommunities} 個社區 →</a>
  </section>

  <!-- CTA -->
  <section class="mt-16 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">在看${esc(area.name)}的房子？</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      實價登錄是已經發生的事，屋主現在的開價與可談空間不會寫在上面。
      澄果團隊長期在${esc(area.name)}成交，可以告訴你目前的實際市況與各社區的屋況差異。
    </p>
    <div class="mt-6 flex flex-wrap gap-4">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
      <a href="#estimate" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white/10 transition">我是屋主，想估價 →</a>
      ${BRAND.lineUrl ? `<a href="${BRAND.lineUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white/10 transition">用 LINE 問</a>` : ""}
    </div>
  </section>
</main>`,
    footer({ depth: 2, hasBuyers: ctx.hasBuyers }),
  ].join("\n");
}

/* ---------- 主流程 ---------- */
export function buildAreas({ market, articles = [], hasBuyers = false } = {}) {
  let config, dealsData;
  try {
    config = JSON.parse(readFileSync(path.join(ROOT, "data/communities.json"), "utf-8"));
  } catch {
    console.warn("[提示] 沒有 data/communities.json，略過生活圈頁");
    return [];
  }
  try {
    dealsData = JSON.parse(readFileSync(path.join(ROOT, "data/community-deals.json"), "utf-8"));
  } catch { dealsData = { deals: {} }; }

  const list = (config.communities || []).filter(c => !c.draft);
  const dealsMap = dealsData.deals || {};
  const dataUpdated = updatedDate(dealsData.updatedAt);

  /* 每一區的社區與成交數先算好，四頁都要用（頁尾的「其他生活圈」卡片） */
  const stat = AREAS.map(a => {
    const items = list.filter(c => c.areaCode === a.code);
    return {
      ...a, items,
      count: items.length,
      deals: items.reduce((n, c) => n + (dealsMap[c.slug] || []).length, 0),
    };
  });

  const built = [];
  stat.forEach(s => {
    if (!s.items.length) {
      console.log(`[略過] 生活圈「${s.name}」目前沒有已發布的社區`);
      return;
    }
    const dir = path.join(ROOT, "areas", s.slug);
    mkdirSync(dir, { recursive: true });
    const html = areaPage(s, {
      items: s.items, dealsMap, dataUpdated, articles, hasBuyers,
      areaMarket: (market?.areas || []).find(x => x.code === s.code),
      others: stat.filter(o => o.slug !== s.slug && o.count > 0),
      totalCommunities: list.length,
    });
    writeFileSync(path.join(dir, "index.html"), html, "utf-8");
    console.log("[產生]", `areas/${s.slug}/index.html`);
    built.push({ slug: s.slug, name: s.name, count: s.count, deals: s.deals, district: s.district });
  });

  console.log(`[完成] 共產生 ${built.length} 個生活圈頁`);
  return built;
}
