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
import { SITE, BRAND, esc, head, header, footer, ORG_ID, orgRef, fitTitle } from "./lib/layout.js";
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

/* ───────────────────────────────────────────────────────────
   跨學階對照
   ───────────────────────────────────────────────────────────
   高雄的學區以里鄰劃分，同一個里通常同時對應一所國小與一所國中，
   所以「中山國小學區」與「七賢國中學區」的社區清單幾乎完全一樣
   （實測 129 比 129，內容重複率 77%）。兩頁都放同一張社區表格，
   Google 會挑一頁收錄、另一頁丟進「替代頁面」。

   這裡算的是另一個學階的組成：國中頁列出學生來自哪些國小學區，
   國小頁列出這些社區會升到哪些國中。這份資料只有同時掌握
   國小與國中欄位才算得出來，是各頁獨有的內容，也剛好是家長
   真正會問的問題（「讀這個國小之後是哪個國中」）。 */
function crossStage(items, dealsMap, want /* "primary" | "junior" */) {
  const m = new Map();
  items.forEach(c => {
    const names = splitSchools(c?.school?.[want]);
    (names.length ? names : ["（未登載）"]).forEach(n => {
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(c);
    });
  });
  return [...m.entries()].map(([name, cs]) => {
    const rows = cs.map(c => statOf(c, dealsMap));
    const prices = rows.flatMap(r => (dealsMap[r.c.slug] || [])
      .filter(d => d.use !== "店面" && String(d.date || "") >= STAT_SINCE)
      .map(d => d.unitPrice).filter(Boolean)).sort((a, b) => a - b);
    const p = normalPrices(prices);
    const med = p.length ? p[Math.floor(p.length / 2)] : 0;
    return {
      name, count: cs.length,
      deals: rows.reduce((n, r) => n + r.n, 0),
      med: med ? Math.round(med * 10) / 10 : 0,
      sample: p.length,
      slug: HAS_SCHOOL.has(name) ? schoolSlug(name) : "",
      top: rows.sort((a, b) => b.n - a.n).slice(0, 3).map(r => r.c.name),
    };
  }).sort((a, b) => b.count - a.count);
}

function crossTable(list, captionText, otherStage) {
  return `<div class="overflow-x-auto border border-line rounded-sm bg-surface">
    <table class="w-full text-[15px] min-w-[620px]">
      <caption class="sr-only">${esc(captionText)}</caption>
      <thead>
        <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
          <th scope="col" class="text-left font-normal py-3 px-4">${esc(otherStage)}</th>
          <th scope="col" class="text-right font-normal py-3 px-4">社區數</th>
          <th scope="col" class="text-right font-normal py-3 px-4">成交筆數</th>
          <th scope="col" class="text-right font-normal py-3 px-4">單價中位<span class="block font-mono text-[11px] text-inkFaint">近三年</span></th>
          <th scope="col" class="text-left font-normal py-3 px-4">成交量較大的社區</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(x => `<tr class="border-b border-line last:border-0">
          <th scope="row" class="py-3.5 px-4 text-left font-normal">
            ${x.slug
              ? `<a href="../${x.slug}/index.html" class="text-ink hover:text-orangeDeep font-medium">${esc(x.name)}</a>`
              : `<span class="font-medium">${esc(x.name)}</span>`}
          </th>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] text-inkSoft">${x.count}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] text-inkSoft">${x.deals.toLocaleString("en-US")}</td>
          <td class="py-3.5 px-4 text-right font-mono text-[14px] text-ink">${x.med ? x.med.toFixed(1) : "—"}${x.med && x.sample < 12 ? `<span class="text-orangeDeep" title="近三年可用成交僅 ${x.sample} 筆，參考性有限">＊</span>` : ""}</td>
          <td class="py-3.5 px-4 text-[14px] text-inkSoft">${esc(x.top.join("、"))}</td>
        </tr>`).join("\n        ")}
      </tbody>
    </table>
  </div>
  <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
    單價單位為萬元／坪，取近三年住家成交的中位數，已排除店面與異常值。
    一個社區跨鄰時學區欄位可能並列兩所學校，那個社區會同時出現在兩列，所以社區數加總可能大於本頁的社區總數。
  </p>`;
}

/* ───────────────────────────────────────────────────────────
   建商作品的結構特徵
   ───────────────────────────────────────────────────────────
   原本建商頁只有一張社區表格，社區數少的那幾家（3 個社區）
   內容量只有 1,100 字出頭，而且彼此重複率 57–61%——模板一樣、
   只有表格裡的幾列不同。這裡從規格表算出這家建商的作品特徵
   （公設比、戶數、樓層、結構、車位型式與推案年代），
   並和全站中位數對照，讓每一頁有自己的數字。
   抓不到的欄位一律留空，不做推測。 */
function median(xs) {
  const a = xs.filter(v => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}
const ratioOf = c => {
  const m = String(specVal(c, "公設比")).match(/([\d.]+)\s*%/);
  return m ? Number(m[1]) : null;
};
const floorsOf = c => {
  const m = String(specVal(c, "樓層規劃")).match(/地上\s*(\d+)\s*層/);
  return m ? Number(m[1]) : null;
};
/* 自由文字欄位的眾數（車位型式、建築結構這類），只回報有登載的部分 */
function topValues(items, key, patterns) {
  const hit = new Map();
  items.forEach(c => {
    const v = String(specVal(c, key));
    patterns.forEach(([label, re]) => { if (re.test(v)) hit.set(label, (hit.get(label) || 0) + 1); });
  });
  return [...hit.entries()].sort((a, b) => b[1] - a[1]);
}

function devProfile(items, dealsMap, baseline) {
  const ratios = items.map(ratioOf).filter(v => v !== null);
  const floors = items.map(floorsOf).filter(v => v !== null);
  const units = items.map(unitCount).filter(v => v);
  const years = items.map(c => Number(yearBuilt(c))).filter(Boolean).sort((a, b) => a - b);
  const prices = items.flatMap(c => (dealsMap[c.slug] || [])
    .filter(d => d.use !== "店面" && String(d.date || "") >= STAT_SINCE)
    .map(d => d.unitPrice).filter(Boolean)).sort((a, b) => a - b);
  const p = normalPrices(prices);

  const r1 = v => (v === null ? null : Math.round(v * 10) / 10);
  return {
    ratio: r1(median(ratios)), ratioN: ratios.length,
    floors: median(floors), floorsN: floors.length,
    units: median(units), unitsN: units.length,
    unitsMin: units.length ? Math.min(...units) : null,
    unitsMax: units.length ? Math.max(...units) : null,
    price: r1(median(p)), priceN: p.length,
    years, yearFirst: years[0] || null, yearLast: years[years.length - 1] || null,
    parking: topValues(items, "車位", [["全平面", /全平面/], ["平面", /平面/], ["機械", /機械|昇降|升降/]]),
    structure: topValues(items, "建築結構", [["SRC／SC 鋼骨", /SRC|SC\b|鋼骨/], ["RC 鋼筋混凝土", /RC/]]),
    baseline,
  };
}

/* 全站基準線：所有非草稿社區的中位數，建商頁用來做對照。
   算一次就好，不要在每一頁重算。 */
function siteBaseline(allItems, dealsMap) {
  const r1 = v => (v === null ? null : Math.round(v * 10) / 10);
  const prices = allItems.flatMap(c => (dealsMap[c.slug] || [])
    .filter(d => d.use !== "店面" && String(d.date || "") >= STAT_SINCE)
    .map(d => d.unitPrice).filter(Boolean)).sort((a, b) => a - b);
  return {
    ratio: r1(median(allItems.map(ratioOf).filter(v => v !== null))),
    floors: median(allItems.map(floorsOf).filter(v => v !== null)),
    units: median(allItems.map(unitCount).filter(v => v)),
    price: r1(median(normalPrices(prices))),
    n: allItems.length,
  };
}

/* 「比全站中位高／低多少」的一句話。差距在 ±3% 以內就說「差不多」，
   小樣本（3 個社區以下有登載）會註明參考性有限。 */
function cmpWord(v, base, unit = "") {
  if (v === null || base === null || !base) return "";
  const d = (v - base) / base;
  if (Math.abs(d) < 0.03) return `與全站中位（${base}${unit}）差不多`;
  return `${d > 0 ? "高" : "低"}於全站中位（${base}${unit}）約 ${Math.abs(Math.round(d * 100))}%`;
}

function devProfileBlock(label, pf) {
  const rows = [
    ["公設比中位", pf.ratio !== null ? `${pf.ratio}%` : "", pf.ratioN, cmpWord(pf.ratio, pf.baseline.ratio, "%")],
    ["地上樓層中位", pf.floors !== null ? `${pf.floors} 層` : "", pf.floorsN, cmpWord(pf.floors, pf.baseline.floors, " 層")],
    ["總戶數中位", pf.units !== null ? `${pf.units} 戶` : "", pf.unitsN,
      pf.unitsMin !== null && pf.unitsMin !== pf.unitsMax ? `範圍 ${pf.unitsMin}–${pf.unitsMax} 戶` : ""],
    ["近三年單價中位", pf.price !== null ? `${pf.price} 萬／坪` : "", pf.priceN, cmpWord(pf.price, pf.baseline.price, " 萬／坪")],
  ].filter(r => r[1]);
  if (!rows.length) return "";

  const extra = [
    pf.parking.length ? `車位型式以${pf.parking.map(([k, n]) => `${k}（${n} 個社區）`).join("、")}登載` : "",
    pf.structure.length ? `建築結構以${pf.structure.map(([k, n]) => `${k}（${n} 個社區）`).join("、")}登載` : "",
  ].filter(Boolean);

  return `<section class="mt-16">
    <h2 class="display text-[23px] mb-4">${esc(label)}作品的結構特徵</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      下表是這家建商在本站收錄社區的規格中位數，右欄是與全站 ${pf.baseline.n} 個社區中位數的對照。
      規格取自各社區頁登載的公開平台資料，有登載的社區數列在括號裡；沒有登載的社區不列入計算，也不做推測。
    </p>
    <div class="overflow-x-auto border border-line rounded-sm bg-surface">
      <table class="w-full text-[15px] min-w-[560px]">
        <caption class="sr-only">${esc(label)}在本站收錄社區的公設比、樓層、戶數與單價中位數，以及與全站中位數的對照</caption>
        <thead>
          <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
            <th scope="col" class="text-left font-normal py-3 px-4">項目</th>
            <th scope="col" class="text-right font-normal py-3 px-4">${esc(label)}</th>
            <th scope="col" class="text-right font-normal py-3 px-4">有登載</th>
            <th scope="col" class="text-left font-normal py-3 px-4">與全站對照</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([k, v, n, cmp]) => `<tr class="border-b border-line last:border-0">
            <th scope="row" class="py-3.5 px-4 text-left font-normal">${esc(k)}</th>
            <td class="py-3.5 px-4 text-right font-mono text-[14px] text-ink">${esc(v)}</td>
            <td class="py-3.5 px-4 text-right font-mono text-[13px] text-inkFaint">${n} 個${n > 0 && n < 3 ? `<span class="text-orangeDeep" title="登載社區少於 3 個，中位數參考性有限">＊</span>` : ""}</td>
            <td class="py-3.5 px-4 text-[14px] text-inkSoft">${esc(cmp)}</td>
          </tr>`).join("\n          ")}
        </tbody>
      </table>
    </div>
    ${extra.length ? `<p class="text-[15px] text-inkSoft leading-[1.9] mt-4 max-w-3xl">${esc(extra.join("；"))}。</p>` : ""}
    ${pf.years.length >= 2 ? `<p class="text-[16px] text-inkSoft leading-[1.9] mt-5 max-w-3xl">
      推案年代集中在 ${pf.yearFirst}–${pf.yearLast} 年（本站收錄範圍內），完工年依序為 ${esc(pf.years.join("、"))}。
      跨了十年以上的建商，早期與近期的案子在車位型式、公設配置與結構工法上通常不一樣，不宜互相套用印象。
    </p>` : ""}
    <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
      單價取近三年住家成交的中位數，已排除店面與異常值。標 <span class="text-orangeDeep">＊</span> 者有登載的社區少於 3 個，中位數只能當粗略參考。
    </p>
  </section>`;
}

/* ---------- 建商頁 ---------- */
function developerPage(name, items, ctx) {
  const { dealsMap, dataUpdated, hasBuyers, baseline } = ctx;
  const slug = devSlug(name);
  const url = `${SITE}/developers/${slug}/`;
  const label = devLabel(name);
  const profile = devProfile(items, dealsMap, baseline);
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
    /* 這一題的數字每家都不一樣，是建商頁彼此區分的主要內容。
       抓不到任何規格時整題不出現，不寫空話。 */
    ...((profile.ratio !== null || profile.price !== null) ? [[
      `${label}的公設比與成交單價，跟其他建商比起來如何？`,
      [
        profile.ratio !== null
          ? `以本站登載的規格計算，${label}有 ${profile.ratioN} 個社區登載公設比，中位數為 ${profile.ratio}%，${cmpWord(profile.ratio, profile.baseline?.ratio ?? baseline.ratio, "%")}。`
          : "",
        profile.price !== null
          ? `近三年住家成交的單價中位數為 ${profile.price} 萬／坪（${profile.priceN} 筆可用成交），${cmpWord(profile.price, profile.baseline?.price ?? baseline.price, " 萬／坪")}。`
          : "",
        profile.floors !== null ? `地上樓層中位 ${profile.floors} 層。` : "",
        profile.unitsMin !== null && profile.unitsMax !== null
          ? `總戶數從 ${profile.unitsMin} 戶到 ${profile.unitsMax} 戶。`
          : "",
        `要注意的是，公設比高低不等於買貴或買便宜——公設比會受樓層數、車位型式與開放空間規劃影響，`
        + `單價更取決於生活圈、屋齡與屋況。建商只是其中一個變數，不建議單看這幾個數字下判斷。`,
      ].filter(Boolean).join(""),
    ]] : []),
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
      publisher: orgRef(),
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
      /* 建商名是實際有搜尋量的詞（Search Console 實測：光洲建設 89 次曝光、
         堅山建設 73、全誠建設 68、振美建設 42、北京建設 34，排名多在 7–11）。
         原標題「○○高雄社區一覽」沒有給點擊理由，改成問句＋這家建商的單價中位。 */
      /* 片段切細一點，預算不夠時是「逐段變短」而不是「整段消失」——
         最差的情況也要留住社區數，不要退回只剩一個問句。 */
      title: fitTitle([
        `${label}高雄有哪些社區？`,
        `${items.length} 個`,
        profile.price !== null ? `、中位 ${profile.price} 萬／坪` : "",
        profile.yearFirst ? `、${profile.yearFirst}–${profile.yearLast} 年` : "",
      ]) + `｜${BRAND.teamName}`,
      description: `${label}在高雄的 ${items.length} 個社區：`
        + (profile.price !== null ? `近三年成交單價中位 ${profile.price} 萬元／坪` : "")
        + (profile.ratio !== null ? `、公設比中位 ${profile.ratio}%` : "")
        + (profile.yearFirst ? `，推案年代 ${profile.yearFirst}–${profile.yearLast} 年` : "")
        + `，合計 ${dealTotal.toLocaleString("en-US")} 筆內政部實價登錄成交紀錄。`,
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

  ${devProfileBlock(label, profile)}

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
  const isJunior = /國中|高中/.test(name);
  const rows = items.map(c => statOf(c, dealsMap)).sort((a, b) => b.n - a.n);
  const dealTotal = rows.reduce((n, r) => n + r.n, 0);
  const areas = areaBreakdown(items);

  /* 國小頁與國中頁的社區清單幾乎相同（同一個里同時對應一小一中），
     所以兩頁的主內容必須不一樣，否則會互相搶收錄。
     國小頁：完整社區表格（家長查國小時要的就是逐個社區）。
     國中頁：以「來源國小」為主表，社區只列成交量前 20 名，
             完整清單導回對應的國小頁。 */
  const cross = crossStage(items, dealsMap, isJunior ? "primary" : "junior");

  /* 這個學區所有社區近三年住家成交的單價中位，給標題與描述用。
     算法與 statOf／crossStage 同一套（排除店面、近三年、排除特殊交易）。 */
  const zoneMid = (() => {
    const p = normalPrices(items.flatMap(c => (dealsMap[c.slug] || [])
      .filter(d => d.use !== "店面" && String(d.date || "") >= STAT_SINCE)
      .map(d => d.unitPrice).filter(Boolean)).sort((a, b) => a - b));
    if (p.length < 5) return 0;
    const m = p.length % 2 ? p[(p.length - 1) / 2] : (p[p.length / 2 - 1] + p[p.length / 2]) / 2;
    return Math.round(m * 10) / 10;
  })();
  const TOP_N = 20;
  const shown = isJunior ? rows.slice(0, TOP_N) : rows;
  const trimmed = isJunior && rows.length > TOP_N;

  /* 官方學區原文：data/school-zones.json 是逐字轉錄的，
     這裡只挑出這所學校的那幾筆，不改寫一個字。 */
  const official = (zones.entries || []).filter(e => e.school === name || e.school === name.replace("國小", "國民小學"));
  const capped = items.some(c => /總量管制/.test(c.school?.note || ""));

  const lead = `本站收錄的高雄四大生活圈社區中，學區欄位登載為${name}的有 ${items.length} 個社區，`
    + `合計 ${dealTotal.toLocaleString("en-US")} 筆內政部實價登錄成交紀錄，`
    + `分布在${areas.map(([a, n]) => `${a}（${n} 個）`).join("、")}。`
    + `要特別說明：高雄市的學區是以「里」與「鄰」劃分，社區名稱不是學區的依據，`
    + `同一個社區跨鄰時不同門牌也可能分屬不同學校。`
    + (isJunior
      ? `這一頁以「學生來自哪些國小學區」為主，並列出成交量較大的 ${Math.min(TOP_N, rows.length)} 個社區；`
        + `逐個社區的完整清單請看下表連到的各國小學區頁。`
      : `這一頁同時列出這些社區對應的國中，可以一次看完小學到國中的銜接。`);

  const faq = [
    ...(isJunior ? [[`${name}學區的學生來自哪些國小？`,
      `本站收錄的社區中，學區欄位登載為${name}的有 ${items.length} 個，`
      + `這些社區的國小學區分布為${cross.map(x => `${x.name}（${x.count} 個社區）`).join("、")}。`
      + `高雄的學區以里鄰劃分，同一個里通常同時對應一所國小與一所國中，`
      + `所以國小與國中的範圍高度重疊但不完全一致——跨鄰的社區可能國小、國中分屬不同組合。`
      + `實際銜接請以入學當年度教育局的分發公告為準。`]] : [[`${name}學區的社區之後讀哪一所國中？`,
      `本站收錄、學區欄位登載為${name}的 ${items.length} 個社區，對應的國中為`
      + `${cross.map(x => `${x.name}（${x.count} 個社區）`).join("、")}。`
      + `國小與國中的學區都以里鄰劃分、範圍高度重疊，但跨鄰的社區可能分屬不同組合，`
      + `實際分發請以入學當年度教育局公告為準。`]]),
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
      publisher: orgRef(),
      /* mainEntity 要對應頁面上真的列出來的東西。國中頁的主表是來源國小，
         社區只列前 20 名，所以不能宣告 129 個社區都是這一頁的主實體。 */
      mainEntity: isJunior
        ? {
            "@type": "ItemList", name: `${name}學區的國小學區組成`, numberOfItems: cross.length,
            itemListElement: cross.map((x, i) => ({
              "@type": "ListItem", position: i + 1,
              item: {
                "@type": "School", name: x.name,
                ...(x.slug ? { url: `${SITE}/schools/${x.slug}/` } : {}),
              },
            })),
          }
        : {
            "@type": "ItemList", name: `${name}學區的社區`, numberOfItems: items.length,
            itemListElement: items.map((c, i) => ({
              "@type": "ListItem", position: i + 1,
              item: { "@type": "ApartmentComplex", name: c.name, url: `${SITE}/communities/${c.slug}.html` },
            })),
          },
      ...(isJunior ? {
        hasPart: {
          "@type": "ItemList", name: `${name}學區成交量較大的社區`, numberOfItems: shown.length,
          itemListElement: shown.map((r, i) => ({
            "@type": "ListItem", position: i + 1,
            item: { "@type": "ApartmentComplex", name: r.c.name, url: `${SITE}/communities/${r.c.slug}.html` },
          })),
        },
      } : {}),
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
      /* 標題本來就是問句（這是對的），但少了數字——
         實測同位置「標題帶數字 1.10% / 不帶 0.72%」。補上社區數與單價中位。 */
      title: fitTitle([
        `${name}學區有哪些社區？`,
        `${items.length} 個`,
        zoneMid ? `、中位 ${zoneMid} 萬／坪` : "",
        isJunior ? `、來源國小 ${cross.length} 所` : "",
      ]) + `｜${BRAND.teamName}`,
      description: isJunior
        ? `學區登載為${name}的 ${items.length} 個高雄社區，依來源國小學區分組列出社區數、實價登錄成交筆數與近三年單價中位數，並附高雄市${stage}學區劃分的官方里鄰原文。`
        : `學區登載為${name}的 ${items.length} 個高雄社區，含完工年、戶數、實價登錄成交筆數與近三年住家單價區間，以及這些社區對應的國中，並附高雄市${stage}學區劃分的官方里鄰原文。`,
      keywords: [`${name}學區`, `${name}學區社區`, `${name}`, "高雄學區", `高雄${stage}學區`, "學區宅",
        ...(isJunior ? [`${name}來源國小`, `${name}學區範圍`] : [`${name}升哪個國中`])].join(","),
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
    <a href="../../tools/school-zone/index.html" class="inline-block mt-4 py-1.5 font-mono text-[13px] text-orangeDeep hover:underline">用里別查學區 →</a>
  </div>

  ${isJunior ? `<section class="mt-14">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">${esc(name)}學區的學生來自哪些國小</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${cross.length} 所國小</span>
    </div>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      高雄的學區以里、鄰劃分，同一個里通常同時對應一所國小與一所國中，所以國小與國中的範圍高度重疊。
      下表是本站社區資料裡「國小」欄位的組成，可以看出這個國中學區的生源結構，以及各組合的成交行情差異。
      點進國小學區頁可以看到該國小的完整社區清單與官方里鄰原文。
    </p>
    ${crossTable(cross, `${name}學區社區的國小學區組成，欄位為國小名稱、社區數、成交筆數、近三年單價中位數`, "國小學區")}
  </section>

  <section class="mt-16">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">成交量較大的社區</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">前 ${shown.length} 個・全學區 ${items.length} 個社區・成交 ${dealTotal.toLocaleString("en-US")} 筆</span>
    </div>
    ${commTable(shown, `${name}學區中成交量較大的 ${shown.length} 個社區，欄位為社區名稱、生活圈、完工年、總戶數、實價登錄成交筆數（全部歷史）、近三年住家單價區間`)}
    ${trimmed ? `<p class="text-[15px] text-inkSoft leading-[1.9] mt-5">
      這個學區共 ${items.length} 個社區，上表只列成交量前 ${TOP_N} 名。
      完整清單依國小學區分開整理在${cross.filter(x => x.slug).map(x => `<a href="../${x.slug}/index.html" class="text-orangeDeep hover:underline">${esc(x.name)}學區頁</a>`).join("、")}，
      或到<a href="../../communities/index.html" class="text-orangeDeep hover:underline">社區總覽</a>依生活圈瀏覽。
    </p>` : ""}
  </section>` : `<section class="mt-14">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">社區一覽</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${items.length} 個社區・成交 ${dealTotal.toLocaleString("en-US")} 筆</span>
    </div>
    ${commTable(rows, `學區登載為${name}的 ${items.length} 個社區，欄位為社區名稱、生活圈、完工年、總戶數、實價登錄成交筆數（全部歷史）、近三年住家單價區間`)}
  </section>

  <section class="mt-16">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3 mb-6">
      <h2 class="display text-[23px]">這些社區之後讀哪一所國中</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0">${cross.length} 所國中</span>
    </div>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      國小與國中的學區都以里、鄰劃分，範圍高度重疊但不完全一致。
      下表是本站社區資料裡「國中」欄位的組成，買在這個國小學區，之後的國中銜接可以先從這裡看。
    </p>
    ${crossTable(cross, `${name}學區社區對應的國中組成，欄位為國中名稱、社區數、成交筆數、近三年單價中位數`, "國中學區")}
  </section>`}

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
    /* index.html 是這個目錄的彙整頁（由 build-hubs.js 產生），不是子頁，
       不能當成「已不再符合門檻」刪掉。原本每次建置都會先刪掉再被重建，
       只因為 buildHubs 排在 buildIndexPages 後面才沒出事——
       建置順序一改，/schools/ 與 /developers/ 就會無聲消失。 */
    if (f === "index.html") return;
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
  /* 全站中位數基準線算一次，建商頁拿去做對照（不要在每一頁重算） */
  const baseline = siteBaseline(list, dealsMap);
  const ctx = { dealsMap, dataUpdated, hasBuyers, zones, baseline };

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
    /* slugs 給 build-hubs.js 用，讓彙整頁也能算出成交筆數與單價中位數 */
    developers: devs.map(([name, items]) => ({ slug: devSlug(name), name: devLabel(name), count: items.length, slugs: items.map(c => c.slug) })),
    schools: schools.map(([name, items]) => ({ slug: schoolSlug(name), name, count: items.length, slugs: items.map(c => c.slug) })),
  };
}
