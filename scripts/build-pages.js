/**
 * 澄果團隊｜文章列表頁與影片專區的靜態產生器
 * ------------------------------------------------
 * 兩頁都在建置時就寫成 HTML。
 * 分類篩選與影片播放器用原生 JavaScript，不依賴框架，
 * 即使爬蟲不執行 JS，內容仍完整可讀。
 */

import { SITE, BRAND, esc, fmtDate, head, header, footer, sectionHead } from "./lib/layout.js";
import { dealCard } from "./build-home.js";

/* ================= 文章列表 ================= */
export function buildNotesIndex({ articles, hasBuyers }) {
  const tags = [...new Set(articles.map(a => a.tag))];

  const jsonLd = articles.length ? [{
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: articles.map((a, i) => ({
      "@type": "ListItem", position: i + 1,
      url: `${SITE}/notes/${a.slug}.html`, name: a.title,
    })),
  }] : [];

  const cards = articles.map(a => `<article class="border-t-2 border-ink pt-5" data-tag="${esc(a.tag)}">
    ${a.cover ? `<a href="${a.slug}.html" class="block mb-4">
      <img src="../${esc(a.cover)}" alt="${esc(a.coverAlt || a.title)}" loading="lazy"
        class="w-full aspect-[3/2] object-cover bg-paper rounded-sm border border-line" /></a>` : ""}
    <div class="flex items-center gap-3 mb-3 font-mono text-[12px]">
      <span class="text-orangeDeep tracking-wider">${esc(a.tag)}</span>
      <time class="text-inkFaint" datetime="${a.date}">${fmtDate(a.date)}</time>
      ${a.readMinutes ? `<span class="text-inkFaint">約 ${a.readMinutes} 分鐘</span>` : ""}
    </div>
    <h2 class="text-[19px] font-bold leading-snug mb-3 tracking-tight">
      <a href="${a.slug}.html" class="hover:text-orangeDeep transition">${esc(a.title)}</a></h2>
    <p class="text-[15px] text-inkSoft leading-[1.9]">${esc(a.summary)}</p>
    <a href="${a.slug}.html" class="inline-block mt-4 font-mono text-[13px] text-orangeDeep hover:underline">閱讀全文 →</a>
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
      description: "高雄買房知識文章：新青安3.0門檻、自備款試算、房地合一稅與重購退稅、換屋順序規劃，以及美術館特區、農十六、瑞豐巨蛋、中都重劃區的在地比較。",
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
    首購與換屋最常卡住的幾個問題，我們整理成好讀的說明。內容會隨法規與市場變動更新，發布日期標在每篇文章上。
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
        uploadDate: v.published,
        embedUrl: `https://www.youtube.com/embed/${v.videoId}`,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      },
    })),
  }] : [];

  const cards = list.map(v => `<article data-cat="${esc(v.category || "")}">
    <button class="play-btn group block w-full text-left" data-id="${esc(v.videoId)}" data-title="${esc(v.titleShown || v.title)}"
      aria-label="播放 ${esc(v.titleShown || v.title)}">
      <div class="relative w-full aspect-video rounded-sm overflow-hidden border border-line bg-ink">
        <img src="${esc(v.thumb)}" alt="" loading="lazy" class="w-full h-full object-cover group-hover:opacity-90 transition" />
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
export function buildDealsIndex({ deals, hasBuyers }) {
  const all = (deals?.deals || []).filter(d => !d.hidden && d.img);

  /* 依區域分組，讓訪客一眼看出我們在哪些區域成交 */
  const byArea = {};
  all.forEach(d => { (byArea[d.area] || (byArea[d.area] = [])).push(d); });
  const areas = Object.keys(byArea);

  const jsonLd = [{
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "賀成交", item: `${SITE}/deals/` },
    ],
  }];

  return [
    head({
      title: `賀成交｜澄果團隊成交實績｜${BRAND.teamName}`,
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
    <div class="grid md:grid-cols-3 gap-6">
      ${byArea[area].map(d => dealCard(d, 1)).join("\n      ")}
    </div>
  </section>`).join("")}

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
