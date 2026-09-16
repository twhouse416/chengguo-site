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
        <img src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg"
          onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${id}/hqdefault.jpg';"
          alt="${esc(title)}" loading="lazy"
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

  /* 單價範圍只算住家，店面單價本來就高一截，混進來會讓人誤判住家行情 */
  const homes = deals.filter(d => d.use !== "店面");
  const prices = homes.map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
  const low = prices[0], high = prices[prices.length - 1];
  const shops = deals.length - homes.length;

  /* 特殊交易的標記
     ------------------------------------------------
     實價登錄裡本來就混有親屬間移轉、部分持分、含增建或瑕疵屋等成交，
     單價會明顯低於行情（也偶有偏高的）。這些是真實登錄資料、不能刪，
     但直接跟一般成交並列，客戶容易誤判「這個社區可以買到 6.9 萬」。
     作法：跟同社區住家單價的中位數比，低於六成或高於一點六倍的標星號，
     並在表格下方說明可能的原因。只標記、不下定論——我們無從得知
     每一筆的實際情形，說死了反而不實在。 */
  const mid = prices.length
    ? (prices.length % 2 ? prices[(prices.length - 1) / 2]
       : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
    : 0;
  const isOutlier = d =>
    d.use !== "店面" && d.unitPrice && mid > 0 && prices.length >= 5
    && (d.unitPrice < mid * 0.6 || d.unitPrice > mid * 1.6);
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

  return `<div class="mb-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
    <div>
      <span class="font-mono text-[12px] text-inkFaint">收錄筆數</span>
      <span class="font-mono text-[24px] font-semibold text-ink ml-2">${deals.length}</span>
      ${deals.length >= DEAL_CAP ? `<span class="font-mono text-[12px] text-inkFaint ml-1">（僅收錄最近 ${DEAL_CAP} 筆）</span>` : ""}
    </div>
    ${prices.length ? `<div>
      <span class="font-mono text-[12px] text-inkFaint">住家單價範圍</span>
      <span class="font-mono text-[24px] font-semibold text-orangeDeep ml-2">${low}–${high}</span>
      <span class="font-mono text-[13px] text-inkSoft ml-1">萬/坪</span>
      ${shops ? `<span class="font-mono text-[12px] text-inkFaint ml-1">（另有 ${shops} 筆店面未計入）</span>` : ""}
    </div>` : `<div>
      <span class="font-mono text-[12px] text-inkFaint">住家單價範圍</span>
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
          <td class="py-3.5 px-4 text-[14px] ${d.kind === "預售" ? "text-orangeDeep" : "text-inkFaint"}">${esc(d.kind || "成屋")}${d.use === "店面" ? `<span class="block font-mono text-[11px] text-ink bg-tint border border-orange/40 rounded-sm px-1 mt-1 inline-block">店面</span>` : ""}</td>
          <td class="py-3.5 px-4 text-inkSoft">${esc(d.floor || "—")}${d.unit ? `<span class="block font-mono text-[12px] text-inkFaint">${esc(d.unit)}</span>` : ""}</td>
          <td class="py-3.5 px-4 text-inkSoft">${esc(d.layout || "—")}</td>
          <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.ping || "—"}</td>
          <td class="py-3.5 px-4 text-right font-mono font-semibold text-ink">${d.unitPrice}${isOutlier(d) ? `<span class="text-orangeDeep font-normal" title="與本社區一般成交價差距較大，可能為特殊交易，詳見表格下方說明">＊</span>` : ""}</td>
          <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.totalPrice ? d.totalPrice.toLocaleString("zh-TW") : "—"}</td>
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
            <td class="py-3.5 px-4 text-[14px] ${d.kind === "預售" ? "text-orangeDeep" : "text-inkFaint"}">${esc(d.kind || "成屋")}${d.use === "店面" ? `<span class="block font-mono text-[11px] text-ink bg-tint border border-orange/40 rounded-sm px-1 mt-1 inline-block">店面</span>` : ""}</td>
            <td class="py-3.5 px-4 text-inkSoft">${esc(d.floor || "—")}${d.unit ? `<span class="block font-mono text-[12px] text-inkFaint">${esc(d.unit)}</span>` : ""}</td>
            <td class="py-3.5 px-4 text-inkSoft">${esc(d.layout || "—")}</td>
            <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.ping || "—"}</td>
            <td class="py-3.5 px-4 text-right font-mono font-semibold text-ink">${d.unitPrice}${isOutlier(d) ? `<span class="text-orangeDeep font-normal" title="與本社區一般成交價差距較大，可能為特殊交易，詳見表格下方說明">＊</span>` : ""}</td>
            <td class="py-3.5 px-4 text-right font-mono text-inkSoft">${d.totalPrice ? d.totalPrice.toLocaleString("zh-TW") : "—"}</td>
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
      return `<a href="#area-${esc(code)}" data-hub-link data-area="${esc(code)}"
        class="border border-line rounded-sm bg-surface p-7 hover:border-orange hover:bg-tint transition flex flex-col">
        <div class="font-mono text-[12px] tracking-wider text-inkFaint">${esc(AREA_DISTRICT[area] || "")}</div>
        <h2 class="text-[23px] font-bold tracking-tight mt-1">${esc(area)}</h2>
        <p class="text-[15px] text-inkSoft leading-[1.85] mt-3 flex-1">${esc(top.join("、"))}${items.length > 3 ? " 等" : ""}</p>
        <div class="mt-5 pt-5 border-t border-line flex items-baseline justify-between gap-3">
          <div class="font-mono text-[12px] text-inkFaint">
            <span class="text-[20px] font-semibold text-ink">${items.length}</span> 個社區<span class="mx-1.5">・</span>成交 ${total.toLocaleString("en-US")} 筆
          </div>
          <span class="font-mono text-[12px] text-orangeDeep shrink-0">查看 →</span>
        </div>
      </a>`;
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

function communityIndex(list, dealsMap, hasBuyers) {
  const groups = groupByArea(list);
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
    先選一個生活圈，或直接用上方搜尋找社區名稱。
  </p>
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
      const prices = deals.map(d => d.unitPrice).filter(Boolean).sort((a, b) => a - b);
      /* 排序與搜尋用的資料：搜尋比對社區名、別名、生活圈與地址；
         排序只用可靠的欄位（成交筆數、單價中位數），屋齡與戶數在規格表裡是
         自由文字（「店舖9戶／住宅769戶」這種），解析容易出錯，不拿來排序。 */
      const mid = prices.length
        ? (prices.length % 2 ? prices[(prices.length - 1) / 2]
           : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
        : 0;
      const hay = [c.name, ...(c.aliases || []), c.area, c.district, c.address]
        .filter(Boolean).join(" ");
      return `<a href="${c.slug}.html" data-card data-name="${esc(hay)}" data-deals="${deals.length}" data-price="${Math.round(mid * 10) / 10}"
      class="border border-line rounded-sm bg-surface p-7 hover:border-orange hover:bg-tint transition flex flex-col">
      <div class="font-mono text-[12px] tracking-wider text-inkFaint">${esc(c.area)}・${esc(c.district)}</div>
      <h3 class="text-[21px] font-bold tracking-tight mt-1 mb-3">${esc(c.name)}</h3>
      <p data-summary class="text-[15px] text-inkSoft leading-[1.85] flex-1">${esc(c.summary)}</p>
      <div class="mt-5 pt-5 border-t border-line flex items-baseline justify-between gap-4">
        ${prices.length ? `<div>
          <span class="font-mono text-[12px] text-inkFaint">單價範圍</span>
          <span class="font-mono text-[20px] font-semibold text-orangeDeep ml-2">${prices[0]}–${prices[prices.length - 1]}</span>
          <span class="font-mono text-[12px] text-inkSoft ml-1">萬/坪</span>
          ${/* 成交筆數：排序選單有「成交筆數多到少」，卡片上看不到筆數的話，
                使用者不知道為什麼是這個順序。少於 LOW_SAMPLE 筆的另外標記——
                三、五筆算出來的單價範圍，看起來跟三百筆的一樣可靠，那是誤導。 */""}
          <div class="mt-1 font-mono text-[12px] text-inkFaint">
            成交 ${deals.length} 筆${deals.length < LOW_SAMPLE
              ? `<span class="text-orangeDeep ml-1.5" title="成交筆數少，單價範圍的參考性有限">・樣本少</span>`
              : ""}
          </div>
        </div>` : `<span class="font-mono text-[13px] text-inkFaint">成交資料整理中</span>`}
        <span class="font-mono text-[12px] text-orangeDeep shrink-0">查看 →</span>
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
    /* 其他社區：同一個生活圈的優先，不足 4 個才補其他區。
       原本是直接取名單前 4 個，結果農十六的社區頁推薦的全是美術館，
       對正在看那一區的人沒有意義。 */
    const pool = list.filter(o => o.slug !== c.slug);
    const others = [
      ...pool.filter(o => o.area === c.area),
      ...pool.filter(o => o.area !== c.area),
    ].slice(0, 4);
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
