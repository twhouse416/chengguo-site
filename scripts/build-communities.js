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

/* 摘要用的單價範圍只取近三年，詳見 communityPage 內的說明 */
/* 摘要用的「一般成交」樣本：排除被標＊的特殊交易（親屬移轉、持分交易等）。
   門檻與社區頁逐筆表格的 ＊ 一致：低於中位六成或高於一點六倍。
   樣本少於 5 筆時不排除，因為中位數本身就不可靠。 */
function normalPrices(sorted) {
  if (sorted.length < 5) return sorted;
  const m = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  if (!(m > 0)) return sorted;
  const out = sorted.filter(v => v >= m * 0.6 && v <= m * 1.6);
  return out.length >= 3 ? out : sorted;
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

const RANGE_SINCE = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
})();
const OUT_DIR = path.join(ROOT, "communities");

/* ---------- 社區介紹影片 ----------
 * data/communities.json 每個社區可加一個 video 物件：
 *   "video": { "id": "YouTube 網址或影片 ID", "title": "...", "desc": "...", "date": "2026-08-20" }
 * 沒填 id 就整個區塊不顯示。
 *
 * 顯示方式為「封面替身」：先只放 YouTube 縮圖，使用者點了才真的載入 iframe。
 * 這樣社區頁不會因為嵌了影片就多背 YouTube 播放器的載入成本。
 */

/* Google 的 VideoObject 要求 uploadDate 是完整 ISO 8601（含時區），
   純日期 2026-08-27 會被判定為「datetime 值無效／缺少時區」。
   後台的日期選擇器只能給純日期，所以在這裡補上台灣時區。 */
export function isoDate(d) {
  if (!d) return "";
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+08:00`;
  return s;   /* 已經是完整格式就原樣沿用 */
}

/* 影片說明常常是直接從 YouTube 複製過來的長文，裡面有大量換行。
   HTML 不認換行字元，全部塞進一個 <p> 會擠成一大坨，所以要自己分段：
   空行分段落，段落內的單一換行轉成 <br>。 */
export function descBlocks(desc) {
  return String(desc || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);
}

/* 給 Google 的 description 要的是一段乾淨的文字，不是整篇。
   取前面幾段、去掉換行，過長就截斷。 */
export function descForSchema(desc, fallback) {
  const blocks = descBlocks(desc);
  if (!blocks.length) return fallback;
  let s = blocks.slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
  if (s.length > 300) s = s.slice(0, 297).trimEnd() + "…";
  return s;
}

/* 接受完整網址或裸 ID，統一取出 11 碼影片 ID */
export function ytId(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : "";
}

/* ---------- 從規格表裡把數字拆出來給結構化資料用 ----------
 * specs 是給人看的自由文字（「地上 15 層、地下 2 層」「689 戶（688 戶住家、1 戶店面）」
 * 「2003/12（內政部實價登錄）；平台另載 2003/09」），schema.org 的
 * yearBuilt / numberOfFloors / numberOfAccommodationUnits 期待的是純數字。
 * 這幾個小工具只做「抓得到就抓、抓不到回空」，不做推測。
 */
export function specVal(c, key) {
  return (c.specs || []).find(s => s[0] === key)?.[1] || "";
}
export function yearBuilt(c) {
  /* 完工時間可能寫成 2006/05、2006年3月、1991/05（內政部實價登錄）…
     一律取第一個四位數年份；抓不到就不輸出這個欄位。 */
  const v = specVal(c, "完工時間");
  const m = v.match(/(?:19|20)\d{2}/);
  if (m) return m[0];
  /* 也有寫成民國年的（「使照104年」）。民國年加 1911 換成西元，
     只認 60~130 這個區間，免得把樓層或戶數誤判成年份。 */
  const roc = v.match(/(\d{2,3})\s*年/);
  if (roc) {
    const y = Number(roc[1]);
    if (y >= 60 && y <= 130) return String(y + 1911);
  }
  return "";
}

/* 實價登錄的總樓層數是國字（「二十四層」），規格表缺樓層時用它補。
   只處理到 99 層，夠用。 */
const CN_NUM = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function cnFloorToNumber(txt) {
  const s = String(txt || "").replace(/層$/, "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const i = s.indexOf("十");
  if (i < 0) return CN_NUM[s] ?? null;
  const tens = i === 0 ? 1 : (CN_NUM[s.slice(0, i)] ?? null);
  const ones = i === s.length - 1 ? 0 : (CN_NUM[s.slice(i + 1)] ?? null);
  if (tens === null || ones === null) return null;
  return tens * 10 + ones;
}

export function floorsAbove(c, deals = []) {
  const m = specVal(c, "樓層規劃").match(/地上\s*(\d+)\s*層/);
  if (m) return Number(m[1]);
  /* 規格表沒寫樓層時，改用實價登錄的總樓層數——同一棟的成交這個欄位一致，
     取第一筆即可（門牌範圍本來就是用「完工年月＋總樓層」驗證過的）。 */
  const tf = deals.find(d => d.totalFloor)?.totalFloor;
  return cnFloorToNumber(tf);
}
export function unitCount(c) {
  /* 「689 戶（688 戶住家、1 戶店面）」要取前面的總數，不是括號裡的 688 */
  const m = specVal(c, "總戶數").match(/(\d[\d,]*)\s*戶/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/* 資料更新日：community-deals.json 的 updatedAt 是完整 ISO 時間，
   頁面上只顯示到日期，schema 的 dateModified 也用日期就夠。 */
export function updatedDate(iso) {
  const s = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
export function twDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : "";
}

/* 說明文字排版：前兩段直接顯示，其餘收進展開區塊，
   免得整篇 YouTube 說明把社區資料表推到很下面。 */
const LEAD = 3;
function descHtml(desc, title) {
  const blocks = descBlocks(desc);
  if (!blocks.length) return `<p class="text-[15px] text-inkSoft leading-[1.9] mt-4">${esc(title)}</p>`;

  const para = b => `<p class="text-[15px] text-inkSoft leading-[1.9]">${esc(b).replace(/\n/g, "<br />")}</p>`;
  const lead = blocks.slice(0, LEAD).map(para).join("\n      ");
  const rest = blocks.slice(LEAD);

  return `<div class="mt-5 space-y-4">
      ${lead}
    </div>
    ${rest.length ? `<details class="mt-4 group">
      <summary class="font-mono text-[13px] text-orangeDeep inline-flex items-center gap-2 select-none cursor-pointer">
        展開完整影片說明
        <span class="transition group-open:rotate-180 text-[10px]">▼</span>
      </summary>
      <div class="mt-4 space-y-4">
        ${rest.map(para).join("\n        ")}
      </div>
    </details>` : ""}`;
}

function videoSection(c) {
  const id = ytId(c.video?.id);
  if (!id) return "";
  const title = c.video.title || `${c.name} 社區介紹`;
  const desc = c.video.desc || "";

  return `
  <!-- 社區介紹影片 -->
  <section class="mt-10" id="video">
    <h2 class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-5">社區介紹影片</h2>
    <div id="ytBox" class="relative w-full aspect-video rounded-sm overflow-hidden border border-line bg-ink">
      <button type="button" id="ytPlay" class="group absolute inset-0 w-full h-full text-left"
        aria-label="播放 ${esc(title)}">
        <img src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg" width="1280" height="720"
          onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${id}/hqdefault.jpg';"
          alt="${esc(title)} 影片縮圖" loading="lazy"
          class="w-full h-full object-cover group-hover:opacity-90 transition" />
        <span class="absolute inset-0 flex items-center justify-center">
          <span class="w-16 h-16 rounded-full bg-orange/95 flex items-center justify-center group-hover:scale-110 transition">
            <svg viewBox="0 0 24 24" class="w-7 h-7 ml-1" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
          </span></span>
      </button>
    </div>
    ${descHtml(desc, title)}
    <p class="text-[13px] text-inkFaint mt-4">
      影片由${esc(BRAND.teamName)}拍攝製作。
      <a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer"
        class="text-orangeDeep hover:underline">在 YouTube 觀看 ↗</a>
    </p>
  </section>

  <script>
    (function () {
      var btn = document.getElementById("ytPlay");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var box = document.getElementById("ytBox");
        box.innerHTML = '<iframe class="w-full h-full" ' +
          'src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1" ' +
          'title="${esc(title).replace(/'/g, "&#39;")}" ' +
          'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" ' +
          'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      });
    })();
  </script>`;
}

/* 社區成交紀錄的兩個門檻。
   DEAL_CAP：每個社區最多保留幾筆（要與 fetch-market-data.js 的上限一致）。
   LOW_SAMPLE：低於這個筆數就在列表頁標「樣本少」。 */
const DEAL_CAP = 600;
const LOW_SAMPLE = 10;

/* ---------- 成交紀錄表格 ---------- */
function dealsTable(deals, c = {}, dataUpdated = "") {
  if (!deals?.length) {
    return `<div class="border border-line rounded-sm bg-surface p-8">
      <p class="text-[16px] text-inkSoft leading-[1.9]">
        近期尚未擷取到這個社區的實價登錄成交紀錄。內政部資料每月公告三次，
        新成交需要一段時間才會揭露。想知道目前的行情與屋主開價，歡迎直接來電。
      </p>
      <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電詢問行情 ${BRAND.phone}</a>
    </div>`;
  }

  /* 單價範圍只算住家，店面單價本來就高一截，混進來會讓人誤判住家行情。
     期間限近三年：資料池回補到 2012 年後，成交橫跨十四年，
     把 2012 年的價格和 2026 年並列成一個「範圍」會讓人嚴重低估現在的行情
     （例如捷運城品全期間是 5.6–47.1 萬，近三年是 12.7–47.1 萬）。
     逐筆成交表格仍然完整呈現所有年份，範圍只是摘要，取近三年才有參考價值。
     不用近一年是因為單一社區一年內往往只有個位數成交，範圍會失真。 */
  const homes = deals.filter(d => d.use !== "店面");
  const recentHomes = homes.filter(d => String(d.date || "") >= RANGE_SINCE);
  const prices = (recentHomes.length >= 3 ? recentHomes : homes)
    .map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
  /* 用 Q1–Q3 而不是最低～最高：實價登錄裡本來就混有親屬移轉、持分交易，
     一筆 4.6 萬就會把「範圍」拉成無意義的區間（蘭園畫世紀近三年 min-max 是
     4.6–40.8，Q1–Q3 是 21.6–29.4）。25～75 百分位也是本站行情區一貫的呈現方式。
     逐筆表格仍完整列出所有成交，含被標＊的異常價。 */
  /* 摘要再排除掉被標＊的特殊交易。
     站上已經把「低於中位六成或高於一點六倍」的成交判定為親屬移轉、持分交易
     這類非市場行情，卻又拿它們去算摘要區間，是自相矛盾的。
     捷運城品近三年 8 筆裡有 3 筆被標＊，含在內是 18.8–42.6，
     排除後是 35.4–42.6、中位 41.7，後者才是屋主真正該參考的數字。
     門檻與逐筆表格的 ＊ 完全一致，樣本少於 5 筆時不排除（基準不可靠）。 */
  const rawMid = prices.length
    ? (prices.length % 2 ? prices[(prices.length - 1) / 2]
       : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
    : 0;
  const normal = (prices.length >= 5 && rawMid > 0)
    ? prices.filter(v => v >= rawMid * 0.6 && v <= rawMid * 1.6)
    : prices;
  const [low, high] = summaryRange(normal);
  const excluded = prices.length - normal.length;
  const shops = deals.length - homes.length;

  /* 特殊交易的標記
     ------------------------------------------------
     實價登錄裡本來就混有親屬間移轉、部分持分、含增建或瑕疵屋等成交，
     單價會明顯低於行情（也偶有偏高的）。這些是真實登錄資料、不能刪，
     但直接跟一般成交並列，客戶容易誤判「這個社區可以買到 6.9 萬」。
     作法：跟同社區住家單價的中位數比，低於六成或高於一點六倍的標星號，
     並在表格下方說明可能的原因。只標記、不下定論——我們無從得知
     每一筆的實際情形，說死了反而不實在。 */
  /* 顯示用的中位數同樣取排除特殊交易後的樣本；
     但 ＊ 的判定門檻仍用 rawMid，逐筆表格的標記不受影響。 */
  const mid = normal.length
    ? (normal.length % 2 ? normal[(normal.length - 1) / 2]
       : (normal[normal.length / 2 - 1] + normal[normal.length / 2]) / 2)
    : 0;
  const isOutlier = d =>
    d.use !== "店面" && d.unitPrice && rawMid > 0 && prices.length >= 5
    && (d.unitPrice < rawMid * 0.6 || d.unitPrice > rawMid * 1.6);
  const outliers = deals.filter(isOutlier).length;

  /* 預設只列最近 100 筆，其餘收在展開區塊裡。
     一次把六百筆全部攤開，手機上要捲很久、頁面也重；
     一百筆已經足夠看出近期行情，想追溯更早的點開就有。 */
  const SHOW = 100;
  const shown = deals.slice(0, SHOW);
  const rest = deals.slice(SHOW);
  const presale = deals.filter(d => d.kind === "預售").length;
  const span = deals.length
    ? `${fmtDate(deals[deals.length - 1].date)}－${fmtDate(deals[0].date)}`
    : "";

  /* ---------- 可直接被引用的一句話 ----------
     AI 引擎（ChatGPT、Perplexity、Google AI Overviews）抓的是完整句子，
     上面那排數字方塊對人好讀，但拆成一堆 <span> 之後機器讀起來是散的。
     所以另外補一句把同樣的事實寫成一個完整句子，並標上資料更新日——
     沒有日期的數字，AI 會判斷成無法驗證時效而優先引用別人。 */
  /* 門牌數：addr 是完整地址（含「八樓之8」），直接去重會把同一個門牌的
     不同樓層算成好幾個。切到「號」為止才是真正的門牌數。 */
  const doors = new Set(
    deals.map(d => String(d.addr || "").split("號")[0]).filter(Boolean)
  ).size;
  const sentence = [
    `${c.name || "本社區"}${c.address ? `（${c.address}）` : ""}目前收錄 ${deals.length} 筆實價登錄成交紀錄`,
    span ? `，期間 ${span}` : "",
    prices.length
      ? `，近三年住家單價常見區間 ${low} 至 ${high} 萬元／坪、中位 ${Math.round(mid * 10) / 10} 萬元／坪`
      : "",
    doors > 1 ? `，分布在 ${doors} 個門牌` : "",
    presale ? `，其中 ${presale} 筆為預售屋買賣` : "",
    shops ? `，另有 ${shops} 筆店面成交未計入住家單價` : "",
    "。",
  ].join("");

  return `<p class="text-[16px] text-inkSoft leading-[1.95] mb-5 max-w-2xl">${esc(sentence)}</p>

  ${dataUpdated ? `<p class="font-mono text-[12px] text-inkFaint mb-6">
    資料更新於 <time datetime="${dataUpdated}">${twDate(dataUpdated)}</time>
    ・來源：內政部不動產交易實價查詢服務網（每月 1、11、21 日批次公告）
  </p>` : ""}

  <div class="mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
    <div>
      <span class="font-mono text-[12px] text-inkFaint">收錄筆數</span>
      <span class="font-mono text-[24px] font-semibold text-ink ml-2">${deals.length}</span>
      ${deals.length >= DEAL_CAP ? `<span class="font-mono text-[12px] text-inkFaint ml-1">（僅收錄最近 ${DEAL_CAP} 筆）</span>` : ""}
    </div>
    ${prices.length ? `<div>
      <span class="font-mono text-[12px] text-inkFaint">住家單價區間<span class="ml-1">近三年${excluded ? "，已排除 " + excluded + " 筆特殊交易" : ""}</span></span>
      <span class="font-mono text-[24px] font-semibold text-orangeDeep ml-2">${low}–${high}</span>
      <span class="font-mono text-[13px] text-inkSoft ml-1">萬/坪</span>
      ${shops ? `<span class="font-mono text-[12px] text-inkFaint ml-1">（另有 ${shops} 筆店面未計入）</span>` : ""}
    </div>` : `<div>
      <span class="font-mono text-[12px] text-inkFaint">住家單價區間<span class="ml-1">近三年${excluded ? "，已排除 " + excluded + " 筆特殊交易" : ""}</span></span>
      <span class="font-mono text-[13px] text-inkSoft ml-2">近期只有店面成交，無住家紀錄</span>
    </div>`}
    ${presale ? `<div>
      <span class="font-mono text-[12px] text-inkFaint">其中預售</span>
      <span class="font-mono text-[20px] font-semibold text-ink ml-2">${presale}</span>
      <span class="font-mono text-[13px] text-inkSoft ml-1">筆</span>
    </div>` : ""}
    ${span ? `<div class="font-mono text-[12px] text-inkFaint">期間 ${span}</div>` : ""}
  </div>

  <div class="overflow-x-auto border border-line rounded-sm bg-surface">
    <table class="w-full text-[15px] min-w-[640px]">
      ${/* caption 是給機器看的表格標題：AI 解析 HTML 表格時靠它判斷這張表在講什麼。
           視覺上用 sr-only 藏起來，因為上方的 h2 與摘要句已經講過同樣的事。 */""}
      <caption class="sr-only">${esc(c.name || "本社區")}實價登錄成交紀錄${span ? `（${span}）` : ""}，共 ${deals.length} 筆，欄位為成交日期、類型、移轉層次、格局、建物移轉總面積（坪）、單價（萬元／坪）、總價（萬元）</caption>
      <thead>
        <tr class="dl-head">
          <th scope="col" class="dl-th">成交日期</th>
          <th scope="col" class="dl-th">類型</th>
          <th scope="col" class="dl-th">樓層</th>
          <th scope="col" class="dl-th">格局</th>
          <th scope="col" class="dl-th-r">坪數</th>
          <th scope="col" class="dl-th-r">單價</th>
          <th scope="col" class="dl-th-r">總價</th>
        </tr>
      </thead>
      <tbody>
        ${shown.map(d => `<tr class="dl-row">
          <td class="dl-date">${fmtDate(d.date)}</td>
          <td class="dl-kind ${d.kind === "預售" ? "text-orangeDeep" : "text-inkFaint"}">${esc(d.kind || "成屋")}${d.use === "店面" ? `<span class="dl-tag">店面</span>` : ""}</td>
          <td class="dl-cell">${esc(d.floor || "—")}${d.unit ? `<span class="dl-sub">${esc(d.unit)}</span>` : ""}</td>
          <td class="dl-cell">${esc(d.layout || "—")}</td>
          <td class="dl-num">${d.ping || "—"}</td>
          <td class="dl-num-em">${d.unitPrice}${isOutlier(d) ? `<span class="text-orangeDeep font-normal" title="與本社區一般成交價差距較大，可能為特殊交易，詳見表格下方說明">＊</span>` : ""}</td>
          <td class="dl-num">${d.totalPrice ? d.totalPrice.toLocaleString("zh-TW") : "—"}</td>
        </tr>`).join("\n        ")}
      </tbody>
    </table>
  </div>

  ${rest.length ? `<details class="mt-4 group">
    <summary class="font-mono text-[13px] text-orangeDeep inline-flex items-center gap-2 select-none">
      顯示較早的 ${rest.length} 筆成交（${fmtDate(rest[rest.length - 1].date)} 起）
      <span class="transition group-open:rotate-180 text-[10px]">▼</span>
    </summary>
    <div class="overflow-x-auto border border-line rounded-sm bg-surface mt-3">
      <table class="w-full text-[15px] min-w-[640px]">
        <thead>
          <tr class="dl-head">
            <th class="dl-th">成交日期</th>
            <th class="dl-th">類型</th>
            <th class="dl-th">樓層</th>
            <th class="dl-th">格局</th>
            <th class="dl-th-r">坪數</th>
            <th class="dl-th-r">單價</th>
            <th class="dl-th-r">總價</th>
          </tr>
        </thead>
        <tbody>
          ${rest.map(d => `<tr class="dl-row">
            <td class="dl-date">${fmtDate(d.date)}</td>
            <td class="dl-kind ${d.kind === "預售" ? "text-orangeDeep" : "text-inkFaint"}">${esc(d.kind || "成屋")}${d.use === "店面" ? `<span class="dl-tag">店面</span>` : ""}</td>
            <td class="dl-cell">${esc(d.floor || "—")}${d.unit ? `<span class="dl-sub">${esc(d.unit)}</span>` : ""}</td>
            <td class="dl-cell">${esc(d.layout || "—")}</td>
            <td class="dl-num">${d.ping || "—"}</td>
            <td class="dl-num-em">${d.unitPrice}${isOutlier(d) ? `<span class="text-orangeDeep font-normal" title="與本社區一般成交價差距較大，可能為特殊交易，詳見表格下方說明">＊</span>` : ""}</td>
            <td class="dl-num">${d.totalPrice ? d.totalPrice.toLocaleString("zh-TW") : "—"}</td>
          </tr>`).join("\n          ")}
        </tbody>
      </table>
    </div>
  </details>` : ""}

  ${outliers ? `<p class="text-[14px] text-inkSoft leading-[1.9] mt-4 border-l-2 border-orange pl-4">
    <span class="text-orangeDeep font-bold">＊</span>
    標記的 ${outliers} 筆，單價與本社區其他成交差距較大，<strong class="text-ink font-bold">很可能不是一般的市場交易</strong>。
    實價登錄會如實收錄各種移轉情形，常見的原因包括：親屬或關係人之間的移轉、
    只買賣部分持分（不是完整一戶）、屋況有瑕疵或需要大幅整修、含未登記增建，
    以及買賣雙方有其他約定（例如帶租約、附帶條件）。
    單價明顯偏高的，則常見於坪數很小的產品、含裝潢家電，或高樓層的景觀戶。
    這幾筆不宜當作行情參考，判斷這個社區的價格時建議先把它們排除。
    想知道某一筆的實際情形，可以問我們，我們幫你查。
  </p>` : ""}

  <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
    單價單位為萬元／坪，總價單位為萬元。含車位的交易，單價會被車位價格拉低，
    比對時請留意坪數與格局是否相近。標示「預售」者為預售屋買賣，交屋時間與成屋不同。
    已排除實價登錄上標示解約的紀錄。資料來源為內政部不動產交易實價查詢服務網。
  </p>`;
}

/* ---------- 相關社區：三組交叉連結 ----------
 * 原本只給「其他社區」四個（同生活圈優先），對使用者幫助有限，
 * 對整站的權重流動也只多四條邊。
 *
 * 看社區的人真正會想比的是三種：
 *   1. 同生活圈、價格帶接近的 —— 這是最直接的替代選項
 *   2. 同一家建商的其他社區 —— 認建商的買方會一路看下去
 *   3. 同路段的 —— 走路五分鐘內，生活條件幾乎一樣
 * 三組都是從既有欄位算出來的，不需要新增任何人工資料。
 *
 * 每一組都可能空（例如建商只推過一案），空的就不顯示這一組，
 * 不用假資料填滿版面。
 */
function relatedBlocks(c, groups) {
  const blocks = groups.filter(g => g.items.length);
  if (!blocks.length) return "";
  return `<nav class="mt-14 pt-8 border-t border-line" aria-label="相關社區">
    ${blocks.map(g => `<div class="mb-9 last:mb-0">
      <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-2">${esc(g.label)}</div>
      <p class="text-[14px] text-inkFaint leading-[1.8] mb-4">${esc(g.hint)}${g.devSlug
        ? ` <a href="../developers/${g.devSlug}/index.html" class="text-orangeDeep hover:underline">看這家建商的全部社區 →</a>` : ""}</p>
      <div class="grid sm:grid-cols-2 gap-4">
        ${g.items.map(o => `<a href="${o.slug}.html" class="border border-line rounded-sm bg-surface px-5 py-4 hover:border-orange hover:bg-tint transition flex items-baseline justify-between gap-3">
          <span>
            <span class="font-mono text-[12px] text-inkFaint block">${esc(o.meta)}</span>
            <span class="text-[16px] font-bold tracking-tight">${esc(o.name)}</span>
          </span>
          <span class="cc-go">→</span>
        </a>`).join("\n        ")}
      </div>
    </div>`).join("\n    ")}
  </nav>`;
}

/* 建商名稱正規化：「皇邑建設（信義房屋記為天邑建設）」取括號前，
   「全泉開發、寶日營造」取第一個。同一家建商在不同社區的寫法常不一致。 */
/* 建商名稱正規化（建商頁 scripts/build-index-pages.js 也用同一支）。
   同一家建商在不同社區的登載寫法常不一致：
     「京城建設」「京城建設股份有限公司」
     「皇邑建設（信義房屋記為天邑建設）」
     「全泉開發、寶日營造」
   不先正規化就會被當成不同建商，建商頁還會因為 slug 相同而互相覆蓋。 */
export function devName(c) {
  const raw = typeof c === "string" ? c : specVal(c, "建設公司");
  if (!raw) return "";
  return raw
    .split(/[（(]/)[0]              /* 去掉括號附註 */
    .split(/[、,，/]/)[0]           /* 多家並列取第一家 */
    .trim()
    .replace(/(股份有限公司|有限公司|股份公司|公司)$/, "")  /* 去掉法人尾綴 */
    .replace(/機構$/, "")
    .trim();
}
const devKey = devName;
const devLabel = devName;

/* 建商頁的 slug 與門檻都定義在 build-index-pages.js，這裡只借來用，
   免得兩邊各自維護一張表而對不起來。門檻沒過的建商沒有頁面，回空字串。 */
import { devSlugOf, schoolSlugOf } from "./build-index-pages.js";

/* 社區的主要路段：取第一個 addressRange 的路名。
   巷弄要連同巷號一起算（美術東二路132巷 和 美術東二路 是不同路段）。 */
function mainRoad(c) {
  return (c.addressRanges || [])[0]?.road || "";
}

/* 單價中位數，用來找價格帶接近的社區 */
function midPrice(deals) {
  const p = (deals || []).filter(d => d.use !== "店面")
    .map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
  if (!p.length) return 0;
  return p.length % 2 ? p[(p.length - 1) / 2] : (p[p.length / 2 - 1] + p[p.length / 2]) / 2;
}

/* 組出三組相關社區。dealsMap 用來算價格帶。 */
export function relatedGroups(c, list, dealsMap) {
  const pool = list.filter(o => o.slug !== c.slug);
  const used = new Set();
  const take = (arr, n) => {
    const out = [];
    for (const o of arr) {
      if (used.has(o.slug)) continue;
      used.add(o.slug); out.push(o);
      if (out.length >= n) break;
    }
    return out;
  };

  /* 1) 同路段 */
  const road = mainRoad(c);
  const sameRoad = road
    ? pool.filter(o => (o.addressRanges || []).some(r => r.road === road))
    : [];

  /* 2) 同建商 */
  const dev = devKey(c);
  const sameDev = dev ? pool.filter(o => devKey(o) === dev) : [];

  /* 3) 同生活圈、單價中位數最接近的。沒有成交的社區算不出價格帶，
        改用同生活圈且完工年最接近的遞補，總比留白好。 */
  const myMid = midPrice(dealsMap[c.slug]);
  const sameArea = pool.filter(o => o.area === c.area);
  const byPrice = myMid
    ? sameArea.map(o => ({ o, d: Math.abs(midPrice(dealsMap[o.slug]) - myMid), has: midPrice(dealsMap[o.slug]) > 0 }))
        .filter(x => x.has).sort((a, b) => a.d - b.d).map(x => x.o)
    : (() => {
        const y = Number(yearBuilt(c));
        return y ? sameArea.map(o => ({ o, d: Math.abs(Number(yearBuilt(o)) - y) || 999 }))
          .sort((a, b) => a.d - b.d).map(x => x.o) : sameArea;
      })();

  /* 先挑最專一的（同路段），再同建商，最後同價格帶，避免同一個社區重複出現 */
  const g1 = take(sameRoad, 4);
  const g2 = take(sameDev, 4);
  const g3 = take(byPrice, 4);
  /* 三組都空的時候（例如這一區只有這一個社區），至少給同生活圈的四個 */
  const g4 = (g1.length + g2.length + g3.length) ? [] : take(sameArea.length ? sameArea : pool, 4);

  const meta = o => [o.area, yearBuilt(o) ? `${yearBuilt(o)} 年完工` : ""].filter(Boolean).join("・");
  const wrap = arr => arr.map(o => ({ slug: o.slug, name: o.name, meta: meta(o) }));

  return [
    { label: `同在${road}的社區`, items: wrap(g1),
      hint: `門牌在同一條路段，走路可及，生活條件與棟距環境最接近，是比價時最直接的對照。` },
    { label: `${devLabel(c)}的其他社區`, items: wrap(g2), devSlug: devSlugOf(devKey(c)),
      hint: `${devKey(c)} 在本站收錄範圍內的其他社區，用料與規劃風格通常有延續性。` },
    { label: `${c.area}價格帶接近的社區`, items: wrap(g3),
      hint: `同一個生活圈內，實價登錄單價中位數與本社區最接近的幾個，總價預算相近的話可以一起看。` },
    { label: `${c.area}的其他社區`, items: wrap(g4), hint: `同一個生活圈內的其他社區。` },
  ];
}

/* ---------- 單一社區頁 ---------- */
function communityPage(c, deals, others, hasBuyers, dataUpdated = "") {
  const url = `${SITE}/communities/${c.slug}.html`;

  /* 成交總價中位數（含車位，與表格上的總價欄一致），用來把自備款 FAQ
     換成這個社區的實際金額。只算住家，店面總價不能拿來推自住自備款。 */
  const totals = (deals || []).filter(d => d.use !== "店面" && d.totalPrice > 0)
    .map(d => d.totalPrice).sort((a, b) => a - b);
  const dealMid = totals.length
    ? Math.round(totals.length % 2 ? totals[(totals.length - 1) / 2]
        : (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2)
    : 0;
  const dealDates = (deals || []).map(d => d.date).filter(Boolean).sort();
  const dealSpan = dealDates.length
    ? `${dealDates.length} 筆成交，${dealDates[0].slice(0, 4)}－${dealDates[dealDates.length - 1].slice(0, 4)} 年`
    : "";

  const units = unitCount(c);
  const floors = floorsAbove(c, deals);
  const built = yearBuilt(c);
  const parkingSpec = specVal(c, "車位");

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ApartmentComplex",
      name: c.name,
      ...(c.aliases?.length ? { alternateName: c.aliases } : {}),
      url,
      description: c.summary,
      address: {
        "@type": "PostalAddress",
        streetAddress: c.address.replace("高雄市", "").replace(c.district, ""),
        addressLocality: "高雄市",
        addressRegion: c.district,
        addressCountry: "TW",
      },
      /* 生活圈：把社區跟商圈的關係講清楚，AI 被問到
         「美術館特區有哪些社區」時才連得起來。 */
      containedInPlace: {
        "@type": "Place",
        name: `高雄市${c.district}${c.area}`,
        address: {
          "@type": "PostalAddress",
          addressLocality: "高雄市",
          addressRegion: c.district,
          addressCountry: "TW",
        },
      },
      /* 以下幾項原本只寫在給人看的規格表裡，機器讀不到。
         schema 這幾個欄位期待純數字，所以用 specVal 拆出來；拆不到就不輸出。 */
      ...(units ? { numberOfAccommodationUnits: units } : {}),
      ...(floors ? { numberOfFloors: floors } : {}),
      ...(built ? { yearBuilt: built } : {}),
      ...(parkingSpec ? {
        amenityFeature: [{
          "@type": "LocationFeatureSpecification",
          name: "車位", value: parkingSpec,
        }],
      } : {}),
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      /* 每一頁都帶上組織實體，不只首頁有 */
      provider: {
        "@type": "RealEstateAgent",
        name: BRAND.teamName,
        legalName: BRAND.legalName,
        url: `${SITE}/`,
        telephone: "+886-7-9766977",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "社區行情", item: `${SITE}/communities/` },
        ...(AREA_SLUG[c.area]
          ? [{ "@type": "ListItem", position: 3, name: c.area, item: `${SITE}/areas/${AREA_SLUG[c.area]}/` }] : []),
        { "@type": "ListItem", position: AREA_SLUG[c.area] ? 4 : 3, name: c.name, item: url },
      ],
    },
  ];

  /* 有影片才加 VideoObject，讓 Google 知道這頁有影片，搜尋結果可能出現縮圖 */
  const vid = ytId(c.video?.id);
  if (vid) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: c.video.title || `${c.name} 社區介紹`,
      description: descForSchema(c.video.desc, `${c.name}（${c.address}）的社區環境與周邊生活機能介紹。`),
      thumbnailUrl: [`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`],
      ...(c.video.date ? { uploadDate: isoDate(c.video.date) } : {}),
      embedUrl: `https://www.youtube.com/embed/${vid}`,
      contentUrl: `https://www.youtube.com/watch?v=${vid}`,
      publisher: { "@type": "Organization", name: BRAND.teamName },
    });
  }

  /* ---------- Dataset：把實價登錄表格標成資料集 ----------
     這是全站最有價值的差異化資產——253 個社區、一萬多筆一手成交紀錄。
     AI 引擎對有 Dataset 標記的資料特別願意引用，因為可以確認
     來源（內政部）、涵蓋範圍（哪個門牌、哪段期間）與更新時間。
     沒有這個標記，同一張表只是「一堆 <td>」。 */
  if (deals.length) {
    const dates = deals.map(d => d.date).filter(Boolean).sort();
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${c.name}實價登錄成交紀錄`,
      description: `${c.name}（${c.address}）的不動產買賣成交紀錄，逐筆列出成交日期、移轉層次、總樓層數、建物移轉總面積、建物現況格局、單價與總價，共 ${deals.length} 筆。已排除實價登錄標示解約的紀錄。`,
      url: `${url}#deals`,
      temporalCoverage: `${dates[0]}/${dates[dates.length - 1]}`,
      spatialCoverage: { "@type": "Place", name: c.address },
      creator: {
        "@type": "GovernmentOrganization",
        name: "內政部不動產交易實價查詢服務網",
        url: "https://plvr.land.moi.gov.tw/",
      },
      publisher: {
        "@type": "Organization",
        name: BRAND.legalName,
        url: `${SITE}/`,
      },
      isAccessibleForFree: true,
      inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      variableMeasured: [
        "成交日期", "交易類型", "移轉層次", "總樓層數",
        "建物移轉總面積（坪）", "建物現況格局", "單價（萬元／坪）",
        "總價（萬元）", "車位類別",
      ],
      about: { "@type": "ApartmentComplex", name: c.name, url },
    });
  }

  /* ---------- 自備款 FAQ 去樣板化 ----------
     253 個社區頁的「買 XX 要準備多少自備款」答案高度相似（都是貸款八成、
     自備兩成、仲介費代書費規費契稅），Google 可能判定為樣板內容而降低價值。
     這裡在原本的答案前面補一句用該社區實際成交總價中位數算出來的金額，
     每一頁的數字都不一樣，而且對讀者實際有用得多。
     原本審過的文案完整保留在後面，只是前面多一句具體數字。 */
  const faqList = (c.faq || []).map(([q, a]) => {
    if (!/自備款/.test(q) || !dealMid) return [q, a];
    const down = Math.round(dealMid * 0.2);
    const lead = `以本社區近期實價登錄成交總價的中位數 ${dealMid.toLocaleString("en-US")} 萬元估算，`
      + `貸款八成、自備兩成的話，自備款大約是 ${down.toLocaleString("en-US")} 萬元`
      + `（${dealSpan}）。實際成交總價因樓層、坪數與是否含車位而異，這只是抓一個量級。`;
    return [q, `${lead}${a}`];
  });

  if (faqList.length) {
    jsonLd.push({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faqList.map(([q, a]) => ({
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
    ${AREA_SLUG[c.area] ? `<a href="../areas/${AREA_SLUG[c.area]}/index.html" class="hover:text-orangeDeep">${esc(c.area)}</a><span class="mx-2">/</span>` : ""}
    <span>${esc(c.name)}</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">${esc(c.area)}・${esc(c.district)}</div>
  <h1 class="display text-[30px] md:text-[38px]">${esc(c.name)}</h1>
  <p class="mt-4 text-[17px] text-inkSoft leading-[1.95] max-w-2xl">${esc(c.summary)}</p>
  <p class="mt-3 font-mono text-[14px] text-inkFaint">${esc(c.address)}</p>
  <div class="mt-6 h-px bg-line"></div>
${videoSection(c)}

  <!-- 基本資料 -->
  <section class="mt-10">
    <h2 class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-5">社區資料</h2>
    <dl class="grid sm:grid-cols-2 gap-x-10 border-t border-line">
      ${(c.specs || []).map(([k, v]) => `<div class="flex justify-between gap-4 py-4 border-b border-line">
        <dt class="text-[15px] text-inkFaint shrink-0">${esc(k)}</dt>
        <dd class="text-[15px] text-ink text-right">${esc(v)}</dd>
      </div>`).join("\n      ")}
    </dl>
    <p class="text-[13px] text-inkFaint leading-relaxed mt-4">
      資料來源：樂居網。建案規格可能因來源而有差異，實際條件請以社區管委會、建商公開資料與產權登記為準。
    </p>
  </section>

  <!-- 成交紀錄 -->
  <section class="mt-14" id="deals">
    <h2 class="display text-[23px] mb-2">實價登錄成交紀錄</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-2xl">
      逐筆列出近期成交，不做平均。同一個社區，樓層、面向、坪數與車位配置不同，
      單價落差往往比想像中大——找條件跟你要看的那戶相近的來比，會準確得多。
    </p>
    ${dealsTable(deals, c, dataUpdated)}
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
      <div class="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[13px]">
        <a href="../tools/school-zone/index.html" class="text-orangeDeep hover:underline">用學區查詢工具核對里別 →</a>
        ${[c.school.primary, c.school.junior].filter(Boolean)
          .map(n => ({ n, s: schoolSlugOf(n) })).filter(x => x.s)
          .map(x => `<a href="../schools/${x.s}/index.html" class="text-orangeDeep hover:underline">${esc(x.n)}學區的其他社區 →</a>`).join("\n        ")}
      </div>
    </div>
  </section>` : ""}

  <!-- FAQ -->
  ${faqList.length ? `<section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">關於${esc(c.name)}的常見問題</h2>
    <div class="border-t border-line">
      ${faqList.map(([q, a]) => `<details class="border-b border-line group">
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
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      想知道你在${esc(c.name)}的那一戶值多少？我們用本頁這些成交紀錄，挑樓層、坪數與車位條件相近的來比，抓出區間並說明判斷依據。
      <strong class="font-bold text-white">不收費，也不需要先簽委託。</strong>
    </p>
    <div class="mt-6 flex flex-wrap gap-3">
      <a href="#estimate" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">免費估價 →</a>
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">來電諮詢 ${BRAND.phone}</a>
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

  <!-- 相關社區 -->
  ${relatedBlocks(c, others)}
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}

/* ---------- 社區列表頁 ---------- */
/* 生活圈的顯示順序：先照這裡排，沒列到的排在後面。
   依社區數排序會讓農十六在補齊之前一直吊車尾，
   但這是團隊的主力區之一，順序應該由我們決定，不是由資料多寡決定。 */
const AREA_ORDER = ["美術館特區", "農十六特區", "瑞豐・巨蛋", "中都重劃區"];

function groupByArea(list) {
  const map = new Map();
  list.forEach(c => {
    const key = c.area || "其他";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  });
  const rank = a => {
    const i = AREA_ORDER.indexOf(a);
    return i === -1 ? AREA_ORDER.length : i;
  };
  return [...map.entries()]
    .map(([area, items]) => ({ area, items }))
    .sort((a, b) => rank(a.area) - rank(b.area) || a.area.localeCompare(b.area, "zh-Hant"));
}


/* ---------- 第一層：生活圈入口 ----------
   五十幾個社區平鋪在一頁，手機上要捲二十個螢幕。買方本來就是先選區域再挑社區，
   所以第一層只給四張生活圈卡片，選了之後才在同一頁展開該區的清單。
   不換頁有兩個好處：點下去是瞬間的，而且整份社區清單仍然在同一個網址底下，
   搜尋引擎看到的還是「五十幾個社區集中的一頁」。
   沒有 JavaScript 時所有區塊照常全部列出，入口卡片就是普通的錨點連結。 */
/* 生活圈獨立頁的 slug（scripts/build-areas.js 產生） */
const AREA_SLUG = {
  "美術館特區": "art-museum",
  "農十六特區": "nong16",
  "瑞豐・巨蛋": "ruifeng-arena",
  "中都重劃區": "zhongdu",
};

const AREA_DISTRICT = {
  "美術館特區": "鼓山區", "農十六特區": "鼓山區",
  "瑞豐・巨蛋": "左營區", "中都重劃區": "三民區",
};

function areaHub(groups, dealsMap) {
  const byArea = new Map(groups.map(g => [g.area, g.items]));
  return `<div id="areaHub" class="mt-10 grid sm:grid-cols-2 gap-5">
    ${AREA_ORDER.map(area => {
      const items = byArea.get(area) || [];
      const total = items.reduce((n, c) => n + (dealsMap[c.slug] || []).length, 0);
      const code = items[0]?.areaCode || "";
      /* 代表社區：成交量最多的三個，讓人一眼認出這一區收了哪些 */
      const top = [...items]
        .sort((a, b) => (dealsMap[b.slug] || []).length - (dealsMap[a.slug] || []).length)
        .slice(0, 3).map(c => c.name);

      if (!items.length) {
        return `<div class="border border-line border-dashed rounded-sm bg-paper p-7">
          <div class="font-mono text-[12px] tracking-wider text-inkFaint">${esc(AREA_DISTRICT[area] || "")}</div>
          <h2 class="text-[21px] font-bold tracking-tight mt-1">${esc(area)}</h2>
          <p class="text-[15px] text-inkSoft leading-[1.85] mt-3">
            這一區的社區頁還在整理。想先查某個社區的成交行情，
            ${BRAND.lineUrl
              ? `<a href="${BRAND.lineUrl}" target="_blank" rel="noopener noreferrer" class="text-orangeDeep hover:underline">用 LINE 問我們</a>最快。`
              : `<a href="${BRAND.phoneHref}" class="text-orangeDeep hover:underline">直接來電</a>問我們最快。`}
          </p>
        </div>`;
      }
      /* 卡片本體仍是同頁展開（原本的行為，點了直接看清單）；
         底下另外給一條通往生活圈獨立頁的連結——那一頁有區域均價、
         路段分布、建商與完工年代，是「美術館特區房價」這類查詢的落地頁。 */
      const slug = AREA_SLUG[area];
      return `<div class="border border-line rounded-sm bg-surface hover:border-orange transition flex flex-col">
        <a href="#area-${esc(code)}" data-hub-link data-area="${esc(code)}" class="p-7 flex flex-col flex-1 hover:bg-tint transition">
          <div class="font-mono text-[12px] tracking-wider text-inkFaint">${esc(AREA_DISTRICT[area] || "")}</div>
          <h2 class="text-[23px] font-bold tracking-tight mt-1">${esc(area)}</h2>
          <p class="text-[15px] text-inkSoft leading-[1.85] mt-3 flex-1">${esc(top.join("、"))}${items.length > 3 ? " 等" : ""}</p>
          <div class="mt-5 pt-5 border-t border-line flex items-baseline justify-between gap-3">
            <div class="font-mono text-[12px] text-inkFaint">
              <span class="text-[20px] font-semibold text-ink">${items.length}</span> 個社區<span class="mx-1.5">・</span>成交 ${total.toLocaleString("en-US")} 筆
            </div>
            <span class="cc-go">看清單 →</span>
          </div>
        </a>
        ${slug ? `<a href="../areas/${slug}/index.html" class="border-t border-line px-7 py-4 font-mono text-[13px] text-orangeDeep hover:bg-tint transition flex items-center justify-between gap-3">
          <span>${esc(area)}行情與路段分布</span><span aria-hidden="true">→</span>
        </a>` : ""}
      </div>`;
    }).join("\n    ")}
  </div>

  <div id="areaBack" hidden class="mt-10">
    <a href="#" data-hub-back class="font-mono text-[13px] text-orangeDeep hover:underline">← 回生活圈</a>
  </div>`;
}

/* 列表頁的搜尋／排序／檢視切換
   ------------------------------------------------
   社區會愈來愈多，平鋪的卡片到二十幾個就開始難找。
   三個功能都是純前端、不需要後端：
     搜尋——即時篩選，比對社區名、別名、生活圈與地址
     排序——依成交筆數或單價；屋齡與戶數在規格表是自由文字，解析不可靠故不列入
     檢視——卡片（適合瀏覽）／精簡（一頁看更多，適合比較）
   沒有 JavaScript 時整條工具列不顯示，所有社區照常全部列出，不影響 SEO 與爬蟲。 */
function toolbar(total) {
  return `
  <div id="commTools" hidden class="mt-10 border border-line rounded-sm bg-surface p-5">
    <div class="flex flex-wrap items-end gap-4">
      <label class="flex-1 min-w-[220px]">
        <span class="block font-mono text-[12px] tracking-wider text-inkFaint mb-2">搜尋社區</span>
        <input id="commSearch" type="search" autocomplete="off" placeholder="社區名稱、路名都可以，例如 皇苑、德興街"
          class="w-full border border-line rounded-sm px-4 py-2.5 text-[16px] bg-surface" />
      </label>
      <div id="commTools2" class="flex flex-wrap items-end gap-4">
      <label class="min-w-[180px]">
        <span class="block font-mono text-[12px] tracking-wider text-inkFaint mb-2">排序</span>
        <select id="commSort" class="w-full border border-line rounded-sm px-4 py-2.5 text-[16px] bg-surface">
          <option value="default">預設（依生活圈）</option>
          <option value="deals">成交筆數多到少</option>
          <option value="priceDesc">單價高到低</option>
          <option value="priceAsc">單價低到高</option>
          <option value="name">社區名稱</option>
        </select>
      </label>
      <div>
        <span class="block font-mono text-[12px] tracking-wider text-inkFaint mb-2">檢視</span>
        <div class="flex border border-line rounded-sm overflow-hidden">
          <button type="button" data-view="card" class="view-btn px-4 py-2.5 text-[15px] bg-ink text-white">卡片</button>
          <button type="button" data-view="compact" class="view-btn px-4 py-2.5 text-[15px] bg-surface text-inkSoft">精簡</button>
        </div>
      </div>
      </div>
    </div>
    <p id="commCount" class="font-mono text-[12px] text-inkFaint mt-4">共 ${total} 個社區</p>
  </div>`;
}

function emptyState() {
  return `
  <div id="commEmpty" hidden class="mt-12 border border-line rounded-sm bg-surface p-8">
    <p class="text-[16px] text-inkSoft leading-[1.9]">
      沒有符合的社區。換個關鍵字試試，或直接告訴我們社區名稱，我們手上還有很多沒整理成頁面的資料。
    </p>
    <a href="${BRAND.lineUrl || BRAND.phoneHref}"${BRAND.lineUrl ? ' target="_blank" rel="noopener noreferrer"' : ''}
      class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">
      ${BRAND.lineUrl ? "用 LINE 問我們" : `來電諮詢 ${BRAND.phone}`}
    </a>
  </div>`;
}

function listScript() {
  return `
<style>
  /* 精簡檢視：一欄、一列一個社區，左邊名稱、右邊數字。
     社區多的生活圈（美術館特區有四十幾個）用卡片檢視要捲很久，
     精簡檢視把每一列壓到一百像素以內，一個螢幕看得到六、七個，掃視快很多。
     想看介紹再切回卡片。 */
  .compact [data-grid] { grid-template-columns: 1fr; gap: 0; }
  .compact [data-card] {
    display: grid; grid-template-columns: 1fr auto; align-items: center;
    column-gap: 1rem; padding: 0.65rem 1rem; border-radius: 0; margin-top: -1px;
  }
  .compact [data-summary] { display: none; }
  .compact [data-card] > div:first-child { grid-column: 1; grid-row: 1; font-size: 11px; }
  .compact [data-card] h3 { grid-column: 1; grid-row: 2; font-size: 16px; margin: 0.1rem 0 0; }
  .compact [data-card] > div:last-child {
    grid-column: 2; grid-row: 1 / 3; display: block; text-align: right;
    margin: 0; padding: 0; border: 0;
  }
  .compact [data-card] > div:last-child > span:last-child { display: none; }
</style>
<script>
  (function () {
    var tools = document.getElementById("commTools");
    if (!tools) return;
    tools.hidden = false;   /* 有 JS 才顯示工具列 */

    var search = document.getElementById("commSearch");
    var sort = document.getElementById("commSort");
    var count = document.getElementById("commCount");
    var empty = document.getElementById("commEmpty");
    var groups = [].slice.call(document.querySelectorAll("[data-group]"));
    var main = document.querySelector("main");
    var TOTAL = document.querySelectorAll("[data-grid] [data-card]").length;

    /* 記住每張卡片原本的位置，切回「預設」時能還原 */
    groups.forEach(function (g) {
      var grid = g.querySelector("[data-grid]");
      [].slice.call(grid.children).forEach(function (el, i) { el.dataset.order = i; });
    });

    function num(el, key) { return parseFloat(el.dataset[key]) || 0; }

    function apply() {
      var q = (search.value || "").trim().toLowerCase();
      var mode = sort.value;
      var shown = 0;

      groups.forEach(function (g) {
        var grid = g.querySelector("[data-grid]");
        var cards = [].slice.call(grid.querySelectorAll("[data-card]"));
        var visible = 0;
        /* 搜尋時跨全部生活圈；沒搜尋時只顯示選中的那一區，
           還沒選（入口那一層）就全部收起來，畫面上只留四張生活圈卡片。 */
        var inScope = q ? true : (current ? g.dataset.area === current : false);

        cards.forEach(function (c) {
          var hit = !q || (c.dataset.name || "").toLowerCase().indexOf(q) !== -1;
          c.hidden = !hit;
          if (hit) visible++;
        });

        cards.sort(function (a, b) {
          if (mode === "deals") return num(b, "deals") - num(a, "deals");
          if (mode === "priceDesc") return num(b, "price") - num(a, "price");
          if (mode === "priceAsc") {
            /* 沒有成交資料的排最後，不要讓 0 佔住最前面 */
            var pa = num(a, "price") || Infinity, pb = num(b, "price") || Infinity;
            return pa - pb;
          }
          if (mode === "name") {
            return (a.querySelector("h3").textContent || "")
              .localeCompare(b.querySelector("h3").textContent || "", "zh-Hant");
          }
          return num(a, "order") - num(b, "order");
        }).forEach(function (c) { grid.appendChild(c); });

        var badge = g.querySelector("[data-group-count]");
        if (badge) badge.textContent = visible;
        g.hidden = !inScope || visible === 0;
        if (inScope) shown += visible;
      });

      if (q) count.textContent = "跨全部生活圈找到 " + shown + " 個社區";
      else if (current) count.textContent = "這一區共 " + shown + " 個社區";
      else count.textContent = "共 " + TOTAL + " 個社區，先選生活圈，或直接搜尋社區名稱";
      /* 入口那一層本來就沒有卡片，不該跳出「找不到社區」 */
      if (empty) empty.hidden = (!q && !current) || shown !== 0;
    }

    /* ---------- 兩層瀏覽 ----------
       第一層是生活圈入口，第二層是該區的社區清單，兩層都在同一頁、靠網址的 #area-XX 切換。
       這樣做的好處：點下去不必重新載入、上一頁會正常運作，而且
       「美術館特區的社區清單」這個網址可以直接傳給客戶。
       搜尋時自動跨全部生活圈——知道社區名字的人不該被逼著先選區域。 */
    var tools2 = document.getElementById("commTools2");
    var hub = document.getElementById("areaHub");
    var back = document.getElementById("areaBack");
    var COMPACT_FROM = 12;   /* 社區多到這個數量就預設用精簡檢視 */
    var current = "";

    function setView(compact) {
      main.classList.toggle("compact", compact);
      [].slice.call(document.querySelectorAll(".view-btn")).forEach(function (x) {
        var on = (x.dataset.view === "compact") === compact;
        x.className = "view-btn px-4 py-2.5 text-[15px] " +
          (on ? "bg-ink text-white" : "bg-surface text-inkSoft");
      });
    }

    function areaOf(hash) {
      /* 樣板字串會吃掉反斜線，所以這裡要寫兩個 */
      var m = /^#area-(\\w+)$/.exec(hash || "");
      if (!m) return "";
      return groups.some(function (g) { return g.dataset.area === m[1]; }) ? m[1] : "";
    }

    function route(scroll) {
      var searching = !!(search.value || "").trim();
      current = areaOf(location.hash);
      var showHub = !current && !searching;

      if (hub) hub.hidden = !showHub;
      if (back) back.hidden = showHub;
      /* 搜尋框永遠在——知道社區名字的人不必先選區域；
         排序與檢視切換要有清單才有意義，入口那一層收起來。 */
      if (tools2) tools2.hidden = showHub;

      if (current && !searching) {
        var g = groups.filter(function (x) { return x.dataset.area === current; })[0];
        setView(g && g.querySelectorAll("[data-card]").length > COMPACT_FROM);
      }
      apply();
      if (scroll && current && !searching) {
        var t = document.getElementById("area-" + current);
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    [].slice.call(document.querySelectorAll("[data-hub-link]")).forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        location.hash = "area-" + a.dataset.area;
      });
    });
    if (back) back.querySelector("[data-hub-back]").addEventListener("click", function (e) {
      e.preventDefault();
      search.value = "";
      /* 用 pushState 清掉 hash，保留上一頁可以回到剛才看的生活圈 */
      history.pushState("", "", location.pathname + location.search);
      route(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("hashchange", function () { route(true); });

    search.addEventListener("input", function () { route(false); });
    sort.addEventListener("change", apply);

    [].slice.call(document.querySelectorAll(".view-btn")).forEach(function (b) {
      b.addEventListener("click", function () { setView(b.dataset.view === "compact"); });
    });

    route(false);
  })();
</script>`;
}

function communityIndex(list, dealsMap, hasBuyers, dataUpdated = "") {
  const groups = groupByArea(list);
  const dealTotal = Object.values(dealsMap).reduce((a, b) => a + b.length, 0);
  const jsonLd = list.length ? [{
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: `高雄社區行情一覽`,
    url: `${SITE}/communities/`,
    inLanguage: "zh-TW",
    description: `高雄美術館特區、農十六特區、瑞豐・巨蛋與中都重劃區共 ${list.length} 個社區的實價登錄成交紀錄，合計 ${dealTotal} 筆。`,
    ...(dataUpdated ? { dateModified: dataUpdated } : {}),
    publisher: { "@type": "RealEstateAgent", name: BRAND.teamName, url: `${SITE}/` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: list.length,
      itemListElement: list.map((c, i) => ({
        "@type": "ListItem", position: i + 1,
        url: `${SITE}/communities/${c.slug}.html`, name: c.name,
      })),
    },
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
    先選一個生活圈，或直接用上方搜尋找社區名稱。
  </p>
  ${dataUpdated ? `<p class="mt-4 font-mono text-[12px] text-inkFaint">
    收錄 ${list.length} 個社區、成交 ${Object.values(dealsMap).reduce((a, b) => a + b.length, 0).toLocaleString("en-US")} 筆
    ・資料更新於 <time datetime="${dataUpdated}">${twDate(dataUpdated)}</time>
    ・來源：內政部不動產交易實價查詢服務網
  </p>` : ""}
  <div class="mt-6 h-px bg-line"></div>

  ${list.length === 0 ? `<div class="mt-10 border border-line rounded-sm bg-surface p-8">
    <p class="text-[16px] text-inkSoft leading-[1.9]">社區頁面陸續整理中。想了解特定社區的行情，歡迎直接來電。</p>
    <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
  </div>` : areaHub(groups, dealsMap) + toolbar(list.length) + groups.map(g => `
  <section class="mt-12" data-group id="area-${esc(g.items[0]?.areaCode || "")}" data-area="${esc(g.items[0]?.areaCode || "")}">
    <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3">
      <h2 class="display text-[23px]">${esc(g.area)}</h2>
      <span class="font-mono text-[12px] text-inkFaint shrink-0"><span data-group-count>${g.items.length}</span> 個社區</span>
    </div>

    <div class="mt-6 grid md:grid-cols-2 gap-6" data-grid>
    ${g.items.map(c => {
      const deals = dealsMap[c.slug] || [];
      /* 卡片上的單價範圍同樣限近三年，理由見社區頁的說明 */
      const recent = deals.filter(d => String(d.date || "") >= RANGE_SINCE);
      const prices = (recent.length >= 3 ? recent : deals)
        .map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
      /* 排序與搜尋用的資料：搜尋比對社區名、別名、生活圈與地址；
         排序只用可靠的欄位（成交筆數、單價中位數），屋齡與戶數在規格表裡是
         自由文字（「店舖9戶／住宅769戶」這種），解析容易出錯，不拿來排序。 */
      const mid = prices.length
        ? (prices.length % 2 ? prices[(prices.length - 1) / 2]
           : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
        : 0;
      /* 卡片上的區間同樣用 Q1–Q3，並排除標＊的特殊交易，理由見社區頁的說明 */
      const np = normalPrices(prices);
      const [cardLow, cardHigh] = summaryRange(np);
      const hay = [c.name, ...(c.aliases || []), c.area, c.district, c.address]
        .filter(Boolean).join(" ");
      return `<a href="${c.slug}.html" data-card data-name="${esc(hay)}" data-deals="${deals.length}" data-price="${Math.round(mid * 10) / 10}"
      class="cc-card">
      <div class="cc-eyebrow">${esc(c.area)}・${esc(c.district)}</div>
      <h3 class="cc-name">${esc(c.name)}</h3>
      <p data-summary class="cc-sum">${esc(c.summary)}</p>
      <div class="cc-foot">
        ${prices.length ? `<div>
          <span class="cc-eyebrow">單價區間 近三年</span>
          <span class="cc-price">${cardLow}–${cardHigh}</span>
          <span class="cc-unit">萬/坪</span>
          ${/* 成交筆數：排序選單有「成交筆數多到少」，卡片上看不到筆數的話，
                使用者不知道為什麼是這個順序。少於 LOW_SAMPLE 筆的另外標記——
                三、五筆算出來的單價範圍，看起來跟三百筆的一樣可靠，那是誤導。 */""}
          <div class="cc-meta">
            成交 ${deals.length} 筆${deals.length < LOW_SAMPLE
              ? `<span class="text-orangeDeep ml-1.5" title="成交筆數少，單價範圍的參考性有限">・樣本少</span>`
              : ""}
          </div>
        </div>` : `<span class="font-mono text-[13px] text-inkFaint">成交資料整理中</span>`}
        <span class="cc-go">查看 →</span>
      </div>
    </a>`;
    }).join("\n    ")}
    </div>

    ${/* 社區數還少的區塊，補一句邀請詢問。等這一區補到 3 個以上就自動消失，
         不必回頭改程式。空著不講話會像「這一區我們沒在做」，講清楚反而是入口。 */""}
    ${g.items.length < 3 ? `<p class="mt-5 text-[15px] text-inkSoft leading-[1.9]">
      這一區還有更多社區正在整理中。想先查某個社區的成交行情，
      ${BRAND.lineUrl
        ? `<a href="${BRAND.lineUrl}" target="_blank" rel="noopener noreferrer" class="text-orangeDeep hover:underline">用 LINE 問我們</a>最快。`
        : `<a href="${BRAND.phoneHref}" class="text-orangeDeep hover:underline">直接來電</a>問我們最快。`}
    </p>` : ""}
  </section>`).join("\n") + emptyState() + listScript()}

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
  const dealsMap = dealsData.deals || {};
  /* 成交資料的更新日：顯示在頁面上，同時寫進 ApartmentComplex 與 Dataset 的
     dateModified。搜尋引擎與 AI 引擎都靠這個判斷資料新鮮度。 */
  const dataUpdated = updatedDate(dealsData.updatedAt);
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
    /* 相關社區：同路段、同建商、同價格帶三組（見 relatedGroups） */
    const others = relatedGroups(c, list, dealsMap);
    const html = communityPage(c, dealsMap[c.slug] || [], others, hasBuyers, dataUpdated);
    writeFileSync(path.join(OUT_DIR, `${c.slug}.html`), html, "utf-8");
    console.log("[產生]", `communities/${c.slug}.html`);
  });

  writeFileSync(path.join(OUT_DIR, "index.html"),
    communityIndex(list, dealsMap, hasBuyers, dataUpdated), "utf-8");
  console.log("[產生] communities/index.html");
  console.log(`[完成] 共產生 ${list.length} 個社區頁`);

  return list;
}
