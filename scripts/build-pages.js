/**
 * 澄果團隊｜文章列表頁與影片專區的靜態產生器
 * ------------------------------------------------
 * 兩頁都在建置時就寫成 HTML。
 * 分類篩選與影片播放器用原生 JavaScript，不依賴框架，
 * 即使爬蟲不執行 JS，內容仍完整可讀。
 */

import { SITE, BRAND, esc, fmtDate, head, header, footer, sectionHead , thumbOf, imgSize, orgRef, unitStr } from "./lib/layout.js";
import { webSlug, fillStats } from "./build-articles.js";
import { dealCard } from "./build-home.js";
import { isoDate } from "./build-communities.js";

/* ================= 文章列表 ================= */
export function buildNotesIndex({ articles, hasBuyers }) {
  const tags = [...new Set(articles.map(a => a.tag))];

  const jsonLd = articles.length ? [{
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: articles.map((a, i) => ({
      "@type": "ListItem", position: i + 1,
      url: `${SITE}/notes/${webSlug(a.slug)}.html`, name: a.title,
    })),
  }] : [];

  const cards = articles.map(a => `<article class="border-t-2 border-ink pt-5" data-tag="${esc(a.tag)}">
    ${a.cover ? `<a href="${webSlug(a.slug)}.html" class="block mb-4">
      <img src="../${esc(thumbOf(a.cover))}" alt="${esc(a.coverAlt || a.title)}" loading="lazy"${imgSize(thumbOf(a.cover))}
        class="w-full aspect-[3/2] object-cover bg-paper rounded-sm border border-line" /></a>` : ""}
    <div class="flex items-center gap-3 mb-3 font-mono text-[12px]">
      <span class="text-orangeDeep tracking-wider">${esc(a.tag)}</span>
      <time class="text-inkFaint" datetime="${a.date}">${fmtDate(a.date)}</time>
      ${a.readMinutes ? `<span class="text-inkFaint">約 ${a.readMinutes} 分鐘</span>` : ""}
    </div>
    <h2 class="text-[19px] font-bold leading-snug mb-3 tracking-tight">
      <a href="${webSlug(a.slug)}.html" class="hover:text-orangeDeep transition">${esc(a.title)}</a></h2>
    <p class="text-[15px] text-inkSoft leading-[1.9]">${esc(a.summary)}</p>
    <a href="${webSlug(a.slug)}.html" class="inline-block mt-4 py-1.5 font-mono text-[13px] text-orangeDeep hover:underline">閱讀全文 →</a>
  </article>`).join("\n      ");

  const empty = `<div class="mt-10 border border-line rounded-sm bg-surface p-8">
    <p class="text-[16px] text-inkSoft leading-[1.9]">
      文章正在準備中，近期陸續發布。如果有想先了解的問題，歡迎直接來電，我們可以直接回答你。
    </p>
    <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
  </div>`;

  return [
    head({
      title: "知識文章｜台灣房屋 澄果團隊",
      description: fillStats("高雄買房賣房知識文章：買方看新青安3.0門檻、自備款、公設比與屋齡對房價的影響；賣方看開價怎麼訂、稅費與淨到手、建物現況告知與委託簽約。數據取自本站整理的{{社區數}}個社區、{{成交筆數}}筆實價登錄成交。"),
      keywords: "高雄買房知識,新青安3.0,房地合一稅,重購退稅,換屋規劃,美術館特區,農十六,中都重劃區",
      canonical: `${SITE}/notes/`,
      ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 1, jsonLd,
    }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-5xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span><span>知識文章</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Notes</div>
  <h1 class="display text-[30px] md:text-[36px]">知識文章</h1>
  <p class="mt-4 text-[16px] text-inkSoft leading-[1.9] max-w-2xl">
    買房、賣房、換屋最常卡住的幾個問題，我們用自己整理的實價登錄資料回答——
    ${fillStats("{{社區數}} 個社區、{{成交筆數}} 筆成交")}。內容會隨法規與市場變動更新，發布日期標在每篇文章上。
    要賣房的話，下面的「賣房」分類有訂價、稅費與委託簽約的完整說明。
  </p>
  <div class="mt-6 h-px bg-line"></div>

  ${articles.length === 0 ? empty : `
  <div class="flex flex-wrap gap-2 mt-8" id="tagFilter">
    <button data-tag="全部" class="tag-btn px-4 py-2 text-[14px] rounded-sm border bg-ink text-white border-ink transition">全部</button>
    ${tags.map(t => `<button data-tag="${esc(t)}" class="tag-btn px-4 py-2 text-[14px] rounded-sm border bg-surface text-inkSoft border-line hover:border-ink transition">${esc(t)}</button>`).join("\n    ")}
  </div>

  <div class="mt-10 grid md:grid-cols-2 gap-x-8 gap-y-10" id="articleGrid">
      ${cards}
  </div>

  <script>
    /* 分類篩選：純原生，內容本身已在 HTML 裡，爬蟲讀得到 */
    (function () {
      var btns = document.querySelectorAll(".tag-btn");
      var items = document.querySelectorAll("#articleGrid article");
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          var tag = b.dataset.tag;
          btns.forEach(function (x) {
            var on = x === b;
            x.className = "tag-btn px-4 py-2 text-[14px] rounded-sm border transition " +
              (on ? "bg-ink text-white border-ink" : "bg-surface text-inkSoft border-line hover:border-ink");
          });
          items.forEach(function (it) {
            it.style.display = (tag === "全部" || it.dataset.tag === tag) ? "" : "none";
          });
        });
      });
    })();
  </script>`}
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}

/* ================= 影片專區 ================= */
export function buildVideosIndex({ videos, hasBuyers }) {
  const list = (videos?.videos || []).filter(v => !v.hidden);
  const cats = [...new Set(list.map(v => v.category).filter(Boolean))];

  const jsonLd = list.length ? [{
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: list.slice(0, 30).map((v, i) => ({
      "@type": "ListItem", position: i + 1,
      item: {
        "@type": "VideoObject",
        name: v.titleShown || v.title,
        description: v.descShown || v.desc || (v.titleShown || v.title),
        thumbnailUrl: v.thumb,
        uploadDate: isoDate(v.published),
        embedUrl: `https://www.youtube.com/embed/${v.videoId}`,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      },
    })),
  }] : [];

  const cards = list.map(v => `<article data-cat="${esc(v.category || "")}">
    <button class="play-btn group block w-full text-left" data-id="${esc(v.videoId)}" data-title="${esc(v.titleShown || v.title)}"
      aria-label="播放 ${esc(v.titleShown || v.title)}">
      <div class="relative w-full aspect-video rounded-sm overflow-hidden border border-line bg-ink">
        <img src="${esc(v.thumb)}" alt="${esc(v.title || "澄果團隊社區介紹影片")} 影片縮圖"${imgSize(v.thumb)} loading="lazy" class="w-full h-full object-cover group-hover:opacity-90 transition" />
        <span class="absolute inset-0 flex items-center justify-center">
          <span class="w-14 h-14 rounded-full bg-orange/95 flex items-center justify-center group-hover:scale-110 transition">
            <svg viewBox="0 0 24 24" class="w-6 h-6 ml-0.5" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
          </span></span>
      </div>
      <div class="flex items-center gap-3 mt-4 font-mono text-[12px]">
        ${v.category ? `<span class="text-orangeDeep tracking-wider">${esc(v.category)}</span>` : ""}
        <time class="text-inkFaint" datetime="${v.published}">${fmtDate(v.published)}</time>
      </div>
      <h2 class="text-[17px] font-bold leading-snug mt-1.5 tracking-tight group-hover:text-orangeDeep transition">${esc(v.titleShown || v.title)}</h2>
      ${(v.descShown || v.desc) ? `<p class="text-[14px] text-inkSoft leading-[1.85] mt-2">${esc(v.descShown || v.desc)}</p>` : ""}
    </button>
  </article>`).join("\n      ");

  const empty = `<div class="mt-10 border border-line rounded-sm bg-surface p-8">
    <p class="text-[16px] text-inkSoft leading-[1.9]">影片同步中，稍後會顯示在這裡。也可以先到我們的 YouTube 頻道觀看。</p>
    <a href="${videos?.channelUrl || BRAND.youtube}" target="_blank" rel="noopener noreferrer"
      class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">前往 YouTube 頻道</a>
  </div>`;

  return [
    head({
      title: "影片專區｜台灣房屋 澄果團隊",
      description: "澄果團隊影片專區：高雄美術館特區、農十六、瑞豐巨蛋與中都重劃區的社區開箱、生活圈導覽與購屋知識分享。",
      keywords: "高雄社區開箱,美術館特區影片,農十六社區,高雄房仲影片,澄果團隊",
      canonical: `${SITE}/videos/`,
      ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 1, jsonLd,
    }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-6xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span><span>影片</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Videos</div>
  <h1 class="display text-[30px] md:text-[36px]">影片專區</h1>
  <p class="mt-4 text-[16px] text-inkSoft leading-[1.9] max-w-2xl">
    社區開箱、生活圈導覽與購屋知識分享。影片同步自澄果團隊的 YouTube 頻道，新片上架後這裡也會自動更新。
  </p>
  <div class="mt-6 h-px bg-line"></div>

  ${list.length === 0 ? empty : `
  ${cats.length ? `<div class="flex flex-wrap gap-2 mt-8" id="catFilter">
    <button data-cat="全部" class="cat-btn px-4 py-2 text-[14px] rounded-sm border bg-ink text-white border-ink transition">全部</button>
    ${cats.map(c => `<button data-cat="${esc(c)}" class="cat-btn px-4 py-2 text-[14px] rounded-sm border bg-surface text-inkSoft border-line hover:border-ink transition">${esc(c)}</button>`).join("\n    ")}
  </div>` : ""}

  <div class="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10" id="videoGrid">
      ${cards}
  </div>

  <div class="mt-14 pt-8 border-t border-line">
    <a href="${videos?.channelUrl || BRAND.youtube}" target="_blank" rel="noopener noreferrer"
      class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-ink/25 text-ink hover:bg-ink hover:text-white transition">到 YouTube 看更多</a>
  </div>`}

  <section class="mt-14 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">想看某個社區的實際屋況？</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      影片拍不完，但我們手上有更多物件。告訴我們你在看哪一區、什麼樣的坪數格局，直接帶你去現場。
    </p>
    <a href="${BRAND.phoneHref}" class="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
  </section>
</main>

<div id="player" hidden class="fixed inset-0 z-[100] bg-ink/90 flex items-center justify-center p-4 md:p-10">
  <div class="w-full max-w-4xl" id="playerBox">
    <div class="aspect-video bg-black rounded-sm overflow-hidden"><div id="playerFrame" class="w-full h-full"></div></div>
    <div class="flex flex-wrap items-start justify-between gap-4 mt-5">
      <h2 class="text-[19px] font-bold text-white leading-snug flex-1 min-w-[240px]" id="playerTitle"></h2>
      <div class="flex gap-3">
        <a id="playerYt" href="#" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center px-5 py-2.5 text-[14px] rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">在 YouTube 開啟</a>
        <button id="playerClose" class="inline-flex items-center px-5 py-2.5 text-[14px] rounded-sm bg-white text-ink hover:bg-orange hover:text-white transition">關閉</button>
      </div>
    </div>
  </div>
</div>

<script>
  /* 分類篩選與播放器：純原生 */
  (function () {
    var btns = document.querySelectorAll(".cat-btn");
    var items = document.querySelectorAll("#videoGrid article");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var cat = b.dataset.cat;
        btns.forEach(function (x) {
          var on = x === b;
          x.className = "cat-btn px-4 py-2 text-[14px] rounded-sm border transition " +
            (on ? "bg-ink text-white border-ink" : "bg-surface text-inkSoft border-line hover:border-ink");
        });
        items.forEach(function (it) {
          it.style.display = (cat === "全部" || it.dataset.cat === cat) ? "" : "none";
        });
      });
    });

    var modal = document.getElementById("player");
    var frame = document.getElementById("playerFrame");
    var titleEl = document.getElementById("playerTitle");
    var ytLink = document.getElementById("playerYt");

    function open(id, title) {
      titleEl.textContent = title;
      ytLink.href = "https://www.youtube.com/watch?v=" + id;
      frame.innerHTML = '<iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/' + id +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="' + title +
        '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      modal.removeAttribute("hidden");
      document.body.style.overflow = "hidden";
    }
    function close() {
      modal.setAttribute("hidden", "");
      frame.innerHTML = "";
      document.body.style.overflow = "";
    }

    document.querySelectorAll(".play-btn").forEach(function (b) {
      b.addEventListener("click", function () { open(b.dataset.id, b.dataset.title); });
    });
    document.getElementById("playerClose").addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  })();
</script>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}


/* ================= 賀成交列表 ================= */
export function buildDealsIndex({ deals, hasBuyers, market }) {
  const all = (deals?.deals || []).filter(d => !d.hidden && d.img);

  /* 依區域分組，讓訪客一眼看出我們在哪些區域成交 */
  const byArea = {};
  all.forEach(d => { (byArea[d.area] || (byArea[d.area] = [])).push(d); });
  const areas = Object.keys(byArea);

  /* 原本這一頁只有圖片與一句說明，可讀文字 262 字，
     卻被全站每一頁連過來、也在 sitemap 裡——全站連入最多的頁是全站最薄的頁。
     下面補的是本來就有的資料（賀成交分區筆數 × 該區近一年行情）
     與團隊自己的作業流程說明，不替任何一筆成交補上沒有的數字。 */
  const AREA_SLUG = {
    "美術館特區": "art-museum", "農十六特區": "nong16",
    "瑞豐・巨蛋": "ruifeng-arena", "中都重劃區": "zhongdu",
  };
  const mkt = new Map((market?.areas || []).map(a => [a.name, a]));
  const dist = areas.map(area => {
    const m = mkt.get(area) || {};
    const ele = (m.types || []).find(t => t.key === "elevator") || m;
    return {
      area, count: byArea[area].length,
      slug: AREA_SLUG[area] || "",
      unit: ele.avgPricePerPing || 0,
      total: ele.medianTotalPrice || 0,
      sample: ele.sampleSize || 0,
    };
  }).sort((a, b) => b.count - a.count);

  const dealFaq = [
    ["賀成交為什麼不寫成交價？",
      "成交價要等內政部實價登錄公告之後才是公開資訊，公告前揭露會動到屋主與買方的隱私；"
      + "而且單看一筆價格沒有意義，要和同社區、同樓層、同屋況的紀錄放在一起比才看得出貴或便宜。"
      + "想看數字的話，本站每一個社區頁都有該社區的逐筆實價登錄成交紀錄，那是官方公告後的資料，比任何一張賀成交圖都完整。"],
    ["這些成交都是澄果團隊自己經手的嗎？",
      "是。這一頁只放團隊實際成交的案件，不收錄同業案件，也不把同一筆成交重複計算。"
      + "目前列出 " + all.length + " 筆，分布在" + dist.map(d => `${d.area}（${d.count} 筆）`).join("、") + "。"],
    ["我手上的房子，怎麼知道現在值多少？",
      "先看你的社區頁——本站收錄的社區都有逐筆成交紀錄與近三年單價區間，可以先抓出自己的位置。"
      + "但逐筆紀錄不會告訴你樓層、面向、屋況與車位條件造成的差距，這部分需要實際看過房子才估得準。"
      + "澄果團隊的估價不收費，也不需要先簽委託。"],
  ];

  /* 這一頁的 dateModified 取最新一筆成交的日期：
     賀成交是持續累積的內容，讓搜尋引擎知道它有在更新。 */
  const latest = all.map(d => d.date).filter(Boolean).sort().pop();

  const jsonLd = [{
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "賀成交", item: `${SITE}/deals/` },
    ],
  }, {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `賀成交｜澄果團隊成交實績`,
    url: `${SITE}/deals/`,
    inLanguage: "zh-TW",
    ...(latest ? { dateModified: String(latest).slice(0, 10) } : {}),
    publisher: orgRef(),
  }, {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: dealFaq.map(([q, a]) => ({
      "@type": "Question", name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }];

  return [
    head({
      /* 後綴縮短成「｜澄果團隊」之後，原本的「賀成交｜澄果團隊成交實績｜台灣房屋 澄果團隊」
         會變成「…｜澄果團隊成交實績｜澄果團隊」，團隊名出現兩次。改掉前段的重複。 */
      title: `賀成交｜高雄美術館、農十六成交實績｜${BRAND.teamName}`,
      description: "澄果團隊在高雄美術館特區、農十六、瑞豐巨蛋與中都重劃區的成交實績紀錄。感謝每一組信任我們的屋主與買方。",
      keywords: "澄果團隊成交,高雄房仲實績,美術館特區成交,農十六成交",
      canonical: `${SITE}/deals/`,
      ogImage: all[0] ? `${SITE}/${all[0].img}` : `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 1, jsonLd,
    }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-6xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span><span>賀成交</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Closed</div>
  <h1 class="display text-[30px] md:text-[36px]">賀成交</h1>
  <p class="mt-4 text-[16px] text-inkSoft leading-[1.9] max-w-2xl">${esc(deals?.intro || "")}</p>
  ${all.length ? `<p class="mt-3 font-mono text-[13px] text-inkFaint">共 ${all.length} 筆成交紀錄</p>` : ""}
  <div class="mt-6 h-px bg-line"></div>

  ${all.length === 0 ? `<div class="mt-10 border border-line rounded-sm bg-surface p-8">
    <p class="text-[16px] text-inkSoft leading-[1.9]">成交紀錄整理中，近期陸續更新。</p>
  </div>` : areas.map(area => `
  <section class="mt-12">
    <h2 class="display text-[20px] mb-1">${esc(area)}</h2>
    <p class="font-mono text-[13px] text-inkFaint mb-6">${byArea[area].length} 筆</p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
      ${byArea[area].map(d => dealCard(d, 1)).join("\n      ")}
    </div>
  </section>`).join("")}

  ${dist.length ? `<section class="mt-16 pt-10 border-t-2 border-ink">
    <h2 class="display text-[23px] mb-4">成交分布與各區行情</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      左邊是本頁列出的成交筆數，右邊是該生活圈近一年電梯住宅的實價登錄行情。
      兩者不是同一件事——賀成交是團隊的服務紀錄，行情是整個生活圈的市場數字，
      放在一起只是讓你知道這些成交是在什麼價位帶的區域裡完成的。
    </p>
    <div class="overflow-x-auto border border-line rounded-sm bg-surface">
      <table class="w-full text-[15px] min-w-[560px]">
        <caption class="sr-only">澄果團隊賀成交的生活圈分布，以及各生活圈近一年電梯住宅的單價中位數、總價中位數與樣本數</caption>
        <thead>
          <tr class="border-b border-line bg-paper font-mono text-[12px] tracking-wider text-inkFaint">
            <th scope="col" class="text-left font-normal py-3 px-4">生活圈</th>
            <th scope="col" class="text-right font-normal py-3 px-4">本頁成交</th>
            <th scope="col" class="text-right font-normal py-3 px-4">單價中位<span class="block font-mono text-[11px] text-inkFaint">近一年</span></th>
            <th scope="col" class="text-right font-normal py-3 px-4">總價中位</th>
            <th scope="col" class="text-right font-normal py-3 px-4">行情樣本</th>
          </tr>
        </thead>
        <tbody>
          ${dist.map(d => `<tr class="border-b border-line last:border-0">
            <th scope="row" class="py-3.5 px-4 text-left font-normal">
              ${d.slug
                ? `<a href="../areas/${d.slug}/index.html" class="text-ink hover:text-orangeDeep font-medium">${esc(d.area)}</a>`
                : `<span class="font-medium">${esc(d.area)}</span>`}
            </th>
            <td class="py-3.5 px-4 text-right font-mono text-[14px] text-inkSoft">${d.count} 筆</td>
            <td class="py-3.5 px-4 text-right font-mono text-[14px] text-ink">${d.unit ? `${unitStr(d.unit)} 萬／坪` : "—"}</td>
            <td class="py-3.5 px-4 text-right font-mono text-[14px] text-ink">${d.total ? `${d.total.toLocaleString("en-US")} 萬` : "—"}</td>
            <td class="py-3.5 px-4 text-right font-mono text-[14px] text-inkFaint">${d.sample || "—"}</td>
          </tr>`).join("\n          ")}
        </tbody>
      </table>
    </div>
    <p class="text-[14px] text-inkFaint leading-[1.9] mt-4">
      行情取自內政部不動產交易實價查詢服務網，近一年電梯住宅（住宅大樓＋華廈）的中位數，已排除店面成交。
      ${market?.updatedAt ? `資料更新於 ${String(market.updatedAt).slice(0, 10)}。` : ""}
    </p>
  </section>` : ""}

  <section class="mt-16">
    <h2 class="display text-[23px] mb-4">一筆成交是怎麼談成的</h2>
    <p class="text-[16px] text-inkSoft leading-[1.9] mb-6 max-w-3xl">
      圖上看到的是結果，過程大致是這四段。寫出來不是為了講流程有多專業，
      而是因為大部分屋主在簽委託之前並不知道這幾個環節會決定最後拿到多少。
    </p>
    <div class="border-t border-line">
      ${[
        ["訂價",
          "先把同社區的逐筆實價登錄成交攤開，挑樓層、坪數、車位條件接近的來比，而不是拿整棟的平均或鄰居口頭講的數字當依據。"
          + "同一個社區的價差中位數就有三成，比錯對象會從第一天就偏掉。"],
        ["開價與上架",
          "開價是訂價加上預留的議價空間，空間留多少取決於這個社區的成交頻率——一年成交十幾戶的社區和兩三年才成交一戶的社區，策略不一樣。"],
        ["帶看與回報",
          "每一組看完的反應都要回報給屋主，包括嫌的地方。看了十組沒有出價，問題通常不在買方。"],
        ["議價與簽約",
          "買方出價之後要處理的是價格之外的條件：交屋時間、貸款成數不足的處理、傢俱與裝潢的歸屬、稅費負擔。"
          + "這些談不清楚，簽約後才會變成糾紛。"],
      ].map(([t, d], i) => `<div class="border-b border-line py-6">
        <div class="flex items-baseline gap-4">
          <span class="font-mono text-[13px] text-orangeDeep shrink-0">0${i + 1}</span>
          <div>
            <h3 class="text-[17px] font-bold tracking-tight">${esc(t)}</h3>
            <p class="mt-2 text-[16px] text-inkSoft leading-[1.95] max-w-3xl">${esc(d)}</p>
          </div>
        </div>
      </div>`).join("\n      ")}
    </div>
    <p class="text-[15px] text-inkSoft leading-[1.9] mt-6 max-w-3xl">
      訂價那一段的數字依據，寫在
      <a href="../notes/how-to-price-your-home-kaohsiung.html" class="text-orangeDeep hover:underline">賣房開價怎麼訂</a>
      與
      <a href="../notes/community-turnover-kaohsiung.html" class="text-orangeDeep hover:underline">你的社區一年成交幾戶</a>
      這兩篇；稅費與淨到手的算法在
      <a href="../notes/home-selling-costs-taiwan.html" class="text-orangeDeep hover:underline">賣房要付哪些錢</a>。
    </p>
  </section>

  <section class="mt-16 pt-10 border-t-2 border-ink">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">FAQ</div>
    <h2 class="display text-[23px] mb-8">關於賀成交的常見問題</h2>
    <div class="border-t border-line">
      ${dealFaq.map(([q, a]) => `<details class="border-b border-line group">
        <summary class="w-full flex items-start justify-between gap-6 py-6 text-left">
          <h3 class="text-[17px] font-bold leading-snug tracking-tight group-hover:text-orangeDeep transition">${esc(q)}</h3>
          <span class="faq-plus font-mono text-[20px] text-orangeDeep shrink-0 leading-none mt-1 transition-transform">＋</span>
        </summary>
        <p class="text-[16px] text-inkSoft leading-[2] pb-7 pr-12">${esc(a)}</p>
      </details>`).join("\n      ")}
    </div>
  </section>

  <section class="mt-16 bg-ink text-white/75 rounded-sm p-8">
    <h2 class="display text-[20px] text-white">下一個，換你的房子</h2>
    <p class="mt-3 text-[16px] leading-[1.9] max-w-xl">
      每一筆成交背後，都是屋主與我們一起把價格、時機與條件談出來的結果。
      想知道你的房子現在值多少，先估價再決定要不要賣。
    </p>
    <div class="mt-6 flex flex-wrap gap-3">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">免費估價 ${BRAND.phone}</a>
      <a href="../index.html#services" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">看售屋服務</a>
    </div>
  </section>
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");
}
