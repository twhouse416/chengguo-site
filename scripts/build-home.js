/**
 * 澄果團隊｜首頁靜態產生器
 * ------------------------------------------------
 * 首頁的所有內容在建置時就寫成 HTML，不依賴 JavaScript。
 * 要改文案請改這個檔案，不要改 index.html（會被覆蓋）。
 */

import { SITE, BRAND, esc, fmtDate, head, header, footer, sectionHead, socialLinks } from "./lib/layout.js";

/* ================= 固定文案 ================= */

const HIGHLIGHTS = [
  "深耕高雄美術館特區、農十六特區、瑞豐巨蛋與中都重劃區",
  "截至 115 年 7 月，約 58% 成交業績來自美術館特區與農十六",
  "免費房屋估價與成交行情分析",
  "房地合一稅、土地增值稅概算",
  "客製化售屋策略規劃",
  "首購預算評估與換屋時程規劃",
];

const FACTS = [
  ["58", "%", "成交集中美術館、農十六", "截至 115 年 7 月"],
  ["10", "年以上", "深耕四大生活圈", ""],
  ["150", "件以上", "累計服務件數", ""],
  ["15", "項", "歷年評鑑與競賽獲獎", ""],
];

const AREA_META = {
  "01": { district: "鼓山區", desc: "公園綠帶與美術館園區環繞，學區成熟，四區中總價門檻最高。", img: "assets/area-01-artmuseum.jpg" },
  "02": { district: "鼓山區", desc: "重劃區規劃完整，新成屋比例高，車位與公設條件普遍較好。", img: "assets/area-02-nong16.jpg" },
  "03": { district: "左營區", desc: "巨蛋商圈與捷運紅線交會，生活機能密集，通勤族接受度高。", img: "assets/area-03-ruifeng.jpg" },
  "04": { district: "三民區", desc: "愛河與中都濕地公園相鄰，新興換屋區，總價門檻相對親民。", img: "assets/area-04-zhongdu.jpg" },
};

const SERVICES = [
  { kicker: "Sell", title: "我要賣房",
    lead: "先知道值多少，再決定賣不賣。估價不收費，也不必馬上委託。",
    items: ["免費房屋估價：同社區近期成交比對，不只給一個數字",
      "成交行情分析：樓層、面向、車位、屋況如何影響價格",
      "房地合一稅、土地增值稅概算，先算清楚淨到手金額",
      "客製化售屋策略：訂價、開價空間、上架時機與帶看安排",
      "換屋屋主的兩案時程銜接規劃"],
    cta: "請澄果幫我估價" },
  { kicker: "First Home", title: "我要買房（首購）",
    lead: "第一次買房，我們把每個步驟拆開講清楚。",
    items: ["依收入與自備款，先抓出合理的總價帶",
      "新青安 3.0 資格、額度與月付試算",
      "四區比較：學區、通勤、機能怎麼取捨",
      "看屋陪同、實價登錄比對、議價策略",
      "貸款送件到交屋，全程有人可以問"],
    cta: "聊聊我的預算能買哪一區" },
  { kicker: "Trade Up", title: "我要換屋",
    lead: "先買後賣還是先賣後買，數字先算清楚再決定。",
    items: ["舊屋合理售價評估（社區行情＋實價登錄比對）",
      "房地合一稅、重購退稅試算，抓出稅務時程",
      "資金缺口與過渡期方案盤點",
      "新屋條件排序：坪數、格局、學區的取捨",
      "兩案時程銜接，避免空窗期或雙重負擔"],
    cta: "請澄果評估換屋時機" },
];

const AWARDS = [
  "104年度評鑑優質", "104年度第2季團隊績效第3名", "106年度評鑑優質",
  "107年度評鑑優質", "107年度第1季團隊績效第2名", "107年度上半季戰力精進第1名",
  "108年度評鑑優質", "108年度第1季團隊績效第3名", "109年度評鑑優質",
  "110年度評鑑優質", "820全國房仲日捐血競賽亞軍", "111年度評鑑優質",
  "111第3季王者之王獎第3名", "112年度評鑑優質", "113年度評鑑優質",
];

const TOOLS = [
  { title: "學區查詢", desc: "選行政區與里別，查出對應的國小學區。", href: "tools/school-zone/index.html", illus: "school" },
  { title: "房貸試算", desc: "總價、成數、年限一改，月付金馬上跟著跑。", href: "tools/mortgage/index.html", illus: "mortgage" },
  { title: "新青安 3.0 試算", desc: "先看資格過不過，再算補貼退場後月付怎麼變。", href: "tools/qingan/index.html", illus: "qingan" },
  { title: "房地合一稅試算", desc: "換屋賣舊屋前，先抓出稅負與時程。", href: "tools/property-tax/index.html", illus: "tax" },
];

export const FAQS = [
  ["高雄美術館特區的房仲該怎麼挑？",
   "建議看三件事：是不是真的長期在這個商圈成交、能不能提出同社區的實際成交比對、以及願不願意誠實說明物件的缺點。澄果團隊深耕高雄美術館特區與農十六特區十年以上，截至 115 年 7 月，約 58% 的成交業績來自這兩大商圈。"],
  ["農十六特區適合現在賣房嗎？",
   "要看你的持有時間、稅務條件與資金規劃，沒有一體適用的答案。持有未滿 2 年的房地合一稅率是 45%，超過 10 年則降到 15%；若設籍居住連續滿 6 年，還有課稅所得 400 萬元以下免稅的自住優惠。建議先做稅費概算，再決定時機。"],
  ["房屋估價需要收費嗎？",
   "澄果團隊的房屋估價完全免費，也不需要先簽委託。我們會依同社區近期成交案例、樓層面向、屋況與車位條件提供售價區間，並說明判斷依據。"],
  ["房屋出售的流程有哪些？",
   "大致是：估價與訂價 → 簽委託 → 準備文件與屋況整理 → 上架行銷與帶看 → 議價與簽約 → 用印、完稅 → 交屋。其中稅費概算建議在訂價階段就先做，才能算出實際淨到手的金額。"],
  ["高雄美術館特區的房價怎麼看？",
   "美術館特區緊鄰內惟埤文化園區，綠地與景觀是核心價值，在四大生活圈中總價門檻最高。本站首頁的行情區塊每日自動抓取內政部實價登錄，顯示近半年的每坪均價與常見成交價格帶，可以先抓範圍。"],
  ["農十六和美術館特區差在哪裡？",
   "兩區都在鼓山區、屋齡分布接近，主要差異在生活型態：美術館特區買的是生活品質，有大面積綠地與開闊景觀；農十六特區買的是生活機能，商圈、學校、醫療與採買動線集中。至於車位、公設與屋況，同一區內社區之間的差異往往比兩區之間更大。"],
  ["房地合一稅怎麼算？",
   "課稅所得 =（成交價 − 取得成本 − 必要費用 − 土地漲價總數額），再依持有期間套用稅率：2 年以內 45%、超過 2 年未逾 5 年 35%、超過 5 年未逾 10 年 20%、超過 10 年 15%。符合自住條件者，課稅所得 400 萬元以下免稅、超過部分課 10%。本站有房地合一稅試算工具可以先估算。"],
  ["換屋可以申請重購退稅嗎？",
   "可以。新舊房地的移轉登記日間隔須在 2 年以內，先買後賣或先賣後買都適用，新舊屋也都須符合自住規定。新屋價格大於或等於舊屋售價可全額退還，較低則按比例退還。要注意退稅後新屋有 5 年閉鎖期，不得出租、營業或再移轉。"],
  ["房子大概多久可以成交？",
   "受訂價、屋況、社區去化速度與當下市場氣氛影響，差異相當大。訂價是否貼近市場通常是最關鍵的因素——開價偏離行情太多，前期帶看量就會明顯不足。我們會在委託前先說明合理的時間預期。"],
  ["新青安 3.0 的條件是什麼？",
   "自 2026 年 8 月 1 日起實施。額度依家庭狀況分級：一般首購 1,000 萬、申請日前 2 年內結婚 1,200 萬、育有未成年子女 1,500 萬。新增三道門檻：申貸年齡未滿 50 歲且年齡加年限不超過 80、本人年所得不超過 200 萬、房屋總價上限（高雄為 2,000 萬）。並改為一生限貸一次。"],
];

/* ================= 工具插圖 ================= */
const ILLUS = {
  school: `<svg viewBox="0 0 220 130" fill="none" class="w-full h-full" aria-hidden="true">
    <rect x="1" y="1" width="218" height="128" stroke="#C9C6C0" stroke-width="1"/>
    <path d="M0 44 H220 M0 88 H220 M56 0 V130 M112 0 V130 M168 0 V130" stroke="#C9C6C0" stroke-width="1"/>
    <path d="M56 44 H168 V88 H56 Z" fill="#FD7305" fill-opacity="0.08" stroke="#FD7305" stroke-width="1.5" stroke-dasharray="5 4"/>
    <g stroke="#16191D" stroke-width="1.5" stroke-linejoin="round">
      <path d="M92 74 V58 L104 50 L116 58 V74 Z" fill="#fff"/><path d="M100 74 V64 H108 V74"/><path d="M104 50 V44"/>
      <path d="M104 44 H112 V48 H104" fill="#FD7305" stroke="none"/></g>
    <g transform="translate(150,26)"><path d="M0 18 C0 18 -8 8 -8 2 A8 8 0 1 1 8 2 C8 8 0 18 0 18 Z" fill="#FD7305"/><circle cx="0" cy="2" r="3" fill="#fff"/></g>
  </svg>`,
  mortgage: `<svg viewBox="0 0 220 130" fill="none" class="w-full h-full" aria-hidden="true">
    <path d="M12 118 H208" stroke="#C9C6C0" stroke-width="1"/>
    ${[[24,34],[62,52],[100,70],[138,88],[176,104]].map(([x,h]) =>
      `<rect x="${x-12}" y="${118-h}" width="24" height="${h*0.42}" fill="#FD7305" fill-opacity="0.85"/>
       <rect x="${x-12}" y="${118-h+h*0.42}" width="24" height="${h*0.58}" fill="#16191D" fill-opacity="0.12" stroke="#16191D" stroke-width="1" stroke-opacity="0.3"/>`).join("")}
    <path d="M12 62 H208" stroke="#16191D" stroke-width="1.5" stroke-dasharray="4 4"/><circle cx="208" cy="62" r="3" fill="#16191D"/>
  </svg>`,
  qingan: `<svg viewBox="0 0 220 130" fill="none" class="w-full h-full" aria-hidden="true">
    <path d="M14 116 H206" stroke="#C9C6C0" stroke-width="1"/><path d="M14 116 V16" stroke="#C9C6C0" stroke-width="1"/>
    <rect x="20" y="88" width="66" height="28" fill="#FD7305" fill-opacity="0.14"/><path d="M20 88 H86" stroke="#FD7305" stroke-width="2.5"/>
    <path d="M86 88 V76 H116 V64 H146 V52 H176 V40 H206" stroke="#16191D" stroke-width="2" stroke-linejoin="round"/>
    ${[[86,76],[116,64],[146,52],[176,40]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="#16191D" stroke-width="1.5"/>`).join("")}
    <circle cx="20" cy="88" r="3.5" fill="#FD7305"/>
  </svg>`,
  tax: `<svg viewBox="0 0 220 130" fill="none" class="w-full h-full" aria-hidden="true">
    <g stroke="#16191D" stroke-width="1.5" stroke-linejoin="round">
      <path d="M30 82 V54 L54 36 L78 54 V82 Z" fill="#fff"/><path d="M46 82 V66 H62 V82"/></g>
    <path d="M104 40 H200 M104 62 H200 M104 84 H200" stroke="#C9C6C0" stroke-width="1"/>
    <rect x="104" y="34" width="76" height="12" fill="#FD7305" fill-opacity="0.9"/>
    <rect x="104" y="56" width="54" height="12" fill="#FD7305" fill-opacity="0.55"/>
    <rect x="104" y="78" width="30" height="12" fill="#FD7305" fill-opacity="0.28"/>
    <path d="M104 106 H200" stroke="#16191D" stroke-width="1.5"/>
    <path d="M194 101 L200 106 L194 111" stroke="#16191D" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="54" cy="100" r="3.5" fill="#FD7305"/>
  </svg>`,
};

/* ================= 各區塊 ================= */

function heroSection(heroVideo) {
  const media = heroVideo
    ? `<div class="relative w-full aspect-[3/2] rounded-sm overflow-hidden bg-ink">
        <iframe class="absolute inset-0 w-full h-full"
          src="https://www.youtube-nocookie.com/embed/${heroVideo.videoId}?autoplay=1&mute=1&loop=1&playlist=${heroVideo.videoId}&controls=0&modestbranding=1&playsinline=1&rel=0&disablekb=1"
          title="${esc(heroVideo.titleShown || heroVideo.title)}" loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <a href="videos/index.html" aria-label="前往影片專區" class="absolute inset-0 block"></a>
      </div>`
    : `<img src="assets/area-01-artmuseum.jpg" alt="高雄美術館特區空拍" class="w-full aspect-[3/2] object-cover rounded-sm" />`;

  return `<section id="top" class="border-b border-line">
  <div class="max-w-6xl mx-auto px-6 pt-16 pb-16 grid lg:grid-cols-12 gap-12 items-center">
    <div class="lg:col-span-6">
      <div class="font-mono text-[11px] tracking-[0.18em] text-orangeDeep uppercase mb-5">高雄 · 鼓山 / 左營 / 三民</div>
      <h1 class="display text-[34px] md:text-[46px] text-ink">美術館房地產顧問<br />為您解決家的大小事</h1>
      <p class="mt-7 text-[17px] text-inkSoft leading-[2] max-w-xl">
        深耕高雄美術館特區、農十六特區、瑞豐巨蛋與中都重劃區十年以上。
        提供房屋出售規劃、免費房屋估價、成交行情分析與首購換屋建議，
        用內政部實價登錄的實際成交數字，協助買賣雙方在談價之前先掌握市場。
      </p>
      <div class="mt-9 flex flex-wrap gap-3">
        <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
        <a href="#services" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-white transition">我要賣房 / 我要買房</a>
      </div>
    </div>
    <div class="lg:col-span-6">${media}</div>
  </div>
</section>`;
}

function summarySection() {
  return `<section id="summary" class="bg-surface border-b border-line">
  <div class="max-w-6xl mx-auto px-6 py-16">
    <div class="grid lg:grid-cols-12 gap-10">
      <div class="lg:col-span-5">
        <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Why Us</div>
        <h2 class="display text-2xl md:text-[28px]">為什麼屋主與買方選擇澄果團隊</h2>
        <p class="mt-5 text-[16px] text-inkSoft leading-[1.95]">
          我們長期專注於高雄美術館特區與農十六商圈，不追求服務全高雄，而是把一個商圈做深、做精。
          累積下來的在地成交經驗，讓我們熟悉各社區行情、買方需求與市場變化。
        </p>
      </div>
      <div class="lg:col-span-7">
        <ul class="grid sm:grid-cols-2 gap-x-8 gap-y-3">
          ${HIGHLIGHTS.map(h => `<li class="flex gap-3 text-[15px] text-ink leading-[1.85] py-2 border-b border-line">
            <span class="text-orange shrink-0 font-bold">✓</span><span>${esc(h)}</span></li>`).join("\n          ")}
        </ul>
      </div>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-14 pt-10 border-t border-line">
      ${FACTS.map(([n, unit, label, note]) => `<div>
        <div class="font-mono text-[38px] font-semibold leading-none text-ink">${n}<span class="text-[15px] font-normal text-inkSoft ml-1">${unit}</span></div>
        <div class="text-[14px] text-inkSoft mt-3 leading-snug">${esc(label)}</div>
        ${note ? `<div class="font-mono text-[12px] text-inkFaint mt-1">${esc(note)}</div>` : ""}
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
}

function servicesSection() {
  return `<section id="services" class="max-w-6xl mx-auto px-6 py-20">
  ${sectionHead("Services", "賣房、首購、換屋，各有各的關卡",
    "不論你現在站在哪一個位置，我們把會遇到的事情列出來，你可以先看哪一段最需要人幫忙。")}
  <div class="grid md:grid-cols-3 gap-px bg-line border border-line rounded-sm overflow-hidden">
    ${SERVICES.map(s => `<div class="bg-surface p-8 flex flex-col">
      <div class="font-mono text-[12px] tracking-[0.18em] text-inkFaint uppercase">${s.kicker}</div>
      <h3 class="display text-xl mt-2 mb-3">${esc(s.title)}</h3>
      <p class="text-[15px] text-inkSoft leading-relaxed mb-7">${esc(s.lead)}</p>
      <ul class="space-y-3 text-[15px] text-ink/80 leading-relaxed mb-8 flex-1">
        ${s.items.map((t, j) => `<li class="flex gap-3 pb-3 border-b border-line last:border-0">
          <span class="font-mono text-[12px] text-orangeDeep pt-1 shrink-0">${String(j + 1).padStart(2, "0")}</span>
          <span>${esc(t)}</span></li>`).join("\n        ")}
      </ul>
      <a href="${BRAND.phoneHref}" class="font-mono text-[15px] text-orangeDeep hover:underline">${esc(s.cta)} →</a>
    </div>`).join("\n    ")}
  </div>
</section>`;
}

function areasSection(market) {
  const areas = market?.areas || [];
  const bands = areas.filter(a => a.bandLow && a.bandHigh);
  const domain = bands.length
    ? { min: Math.min(...bands.map(a => a.bandLow)), max: Math.max(...bands.map(a => a.bandHigh)) }
    : null;

  const band = a => {
    if (!a.bandLow || !a.bandHigh || !domain) {
      return `<div class="h-9 flex items-center font-mono text-[11px] text-inkFaint">成交資料不足</div>`;
    }
    const span = domain.max - domain.min || 1;
    const left = ((a.bandLow - domain.min) / span) * 100;
    const width = ((a.bandHigh - a.bandLow) / span) * 100;
    const avg = Math.min(Math.max(((a.avgPricePerPing - domain.min) / span) * 100, 0), 100);
    return `<div class="h-9 pt-3">
      <div class="relative h-[3px] bg-line rounded-sm">
        <div class="absolute h-[3px] bg-orange/35 rounded-sm" style="left:${left}%;width:${width}%"></div>
        <div class="absolute w-[3px] h-[11px] bg-ink -top-[4px] rounded-sm" style="left:calc(${avg}% - 1.5px)"></div>
      </div>
      <div class="font-mono text-[11px] text-inkSoft mt-2">成交帶 ${a.bandLow}–${a.bandHigh} 萬</div>
    </div>`;
  };

  return `<section id="areas" class="max-w-6xl mx-auto px-6 py-20">
  ${sectionHead("Market Data", "四個主力生活圈，現在的行情",
    "近六個月大樓實際成交的每坪均價與常見價格帶（取 25%–75% 百分位）。數字用來抓範圍，實際行情會因屋齡、樓層、格局與座向而有落差。")}
  <div class="grid sm:grid-cols-2 gap-6">
    ${areas.map(a => {
      const m = AREA_META[a.code] || {};
      return `<article class="flex flex-col border border-line rounded-sm bg-surface overflow-hidden">
      <img src="${m.img}" alt="${esc(a.name)}" class="w-full aspect-[3/2] object-cover shrink-0" loading="lazy" />
      <div class="flex flex-col flex-1 p-7">
        <div class="font-mono text-[12px] tracking-wider text-inkFaint">${esc(m.district || "")}</div>
        <h3 class="text-xl font-bold mt-1 mb-2.5 tracking-tight">${esc(a.name)}</h3>
        <p class="text-[15px] text-inkSoft leading-[1.85]">${esc(m.desc || "")}</p>
        <div class="mt-auto pt-5">
          <div class="font-mono text-[30px] font-semibold text-ink leading-none">${a.avgPricePerPing ?? "—"}<span class="text-[13px] font-normal text-inkSoft ml-1">萬/坪</span></div>
          ${band(a)}
          ${a.lowSample ? `<p class="font-mono text-[12px] text-orangeDeep mt-2">樣本數偏少，僅供參考</p>` : ""}
        </div>
      </div>
    </article>`;
    }).join("\n    ")}
  </div>
  ${domain ? `<div class="mt-8 pt-4 border-t border-line flex justify-between font-mono text-[11px] text-inkFaint">
    <span>${domain.min} 萬/坪</span><span>四區共用刻度｜直線為該區均價</span><span>${domain.max} 萬/坪</span>
  </div>` : ""}
  <p class="mt-4 font-mono text-[11px] text-inkFaint">
    ${market?.updatedAt
      ? `資料更新於 ${new Date(market.updatedAt).toLocaleDateString("zh-TW")}・來源：內政部不動產交易實價查詢服務網`
      : "尚未執行首次自動更新，目前為示意資料"}
  </p>
</section>`;
}

function listingsSection() {
  return `<section id="listings" class="bg-ink text-white/80">
  <div class="max-w-6xl mx-auto px-6 py-20">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orange uppercase mb-4">Listings</div>
    <h2 class="display text-[28px] md:text-[36px] text-white leading-tight">在售物件，都在台灣房屋官網</h2>
    <p class="mt-6 text-[17px] leading-[2] max-w-3xl">
      澄果團隊的所有委託案件都刊登在台灣房屋官方系統，物件狀態即時同步——
      你看到的一定是還在市場上的房子，不會點進來才發現已經成交。
    </p>

    <ul class="mt-10 grid md:grid-cols-3 gap-x-8">
      ${[
        "完整照片、格局圖與物件明細",
        "價格、坪數、屋齡、車位條件一次看清楚",
        "可直接線上預約看屋，或來電由我們安排",
      ].map(t => `<li class="flex gap-3 text-[16px] leading-[1.9] py-4 border-t border-white/15">
        <span class="text-orange shrink-0 font-bold">✓</span><span>${esc(t)}</span></li>`).join("\n      ")}
    </ul>

    <div class="mt-10 flex flex-wrap gap-3">
      <a href="${BRAND.officialSite}" target="_blank" rel="noopener noreferrer"
        class="inline-flex items-center gap-2 px-8 py-4 text-[16px] font-bold rounded-sm bg-orange text-white hover:bg-orangeDeep transition">
        前往看在售物件
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4" aria-hidden="true">
          <path d="M7 17L17 7M17 7H9M17 7v8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
      <a href="${BRAND.phoneHref}"
        class="inline-flex items-center px-8 py-4 text-[16px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">
        直接來電 ${BRAND.phone}
      </a>
    </div>

    <p class="mt-6 font-mono text-[13px] text-white/45 leading-relaxed">
      想找的條件在官網上沒看到？很多屋主的委託還在準備階段，來電告訴我們需求，我們幫你留意。
    </p>
  </div>
</section>`;
}

function experienceSection() {
  return `<section id="experience" class="bg-surface border-y border-line">
  <div class="max-w-6xl mx-auto px-6 py-20 grid lg:grid-cols-12 gap-12">
    <div class="lg:col-span-5">
      <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Experience</div>
      <h2 class="display text-2xl md:text-[28px]">我們如何協助屋主規劃售屋</h2>
      <div class="mt-6 h-px bg-line"></div>
      <svg viewBox="0 0 320 300" fill="none" class="w-full max-w-[320px] mt-8" role="img"
        aria-label="同一社區不同樓層與條件的成交單價落差示意圖">
        <rect x="20" y="20" width="150" height="250" fill="#FFFFFF" stroke="#16191D" stroke-width="1.5"/>
        ${[0,1,2,3,4,5].map(i => {
          const y = 32 + i * 40, hl = i === 1 || i === 4;
          return `<g><rect x="30" y="${y}" width="130" height="30" fill="${hl ? "#FCEFE3" : "#F4F4F2"}" stroke="${hl ? "#FD7305" : "#DEDCD7"}" stroke-width="${hl ? 1.5 : 1}"/>
          ${[0,1,2,3].map(j => `<rect x="${40 + j*30}" y="${y+8}" width="18" height="14" fill="${hl ? "#FD7305" : "#DEDCD7"}" fill-opacity="${hl ? 0.5 : 0.8}"/>`).join("")}</g>`;
        }).join("")}
        <g font-family="'IBM Plex Mono', monospace">
          <path d="M170 87 H210" stroke="#FD7305" stroke-width="1.5"/><circle cx="170" cy="87" r="3.5" fill="#FD7305"/>
          <text x="218" y="82" font-size="19" font-weight="600" fill="#16191D">42.5</text>
          <text x="218" y="99" font-size="11" fill="#737A83">高樓層・面公園</text>
          <path d="M170 207 H210" stroke="#FD7305" stroke-width="1.5"/><circle cx="170" cy="207" r="3.5" fill="#FD7305"/>
          <text x="218" y="202" font-size="19" font-weight="600" fill="#16191D">35.8</text>
          <text x="218" y="219" font-size="11" fill="#737A83">低樓層・面路</text>
          <path d="M300 92 V202" stroke="#DEDCD7" stroke-width="1"/>
          <path d="M296 98 L300 92 L304 98 M296 196 L300 202 L304 196" stroke="#DEDCD7" stroke-width="1" fill="none" stroke-linecap="round"/>
          <text x="288" y="152" font-size="11" fill="#B85400" text-anchor="end">價差</text>
          <text x="288" y="166" font-size="11" fill="#B85400" text-anchor="end">6.7 萬/坪</text>
        </g>
        <text x="20" y="292" font-family="'Noto Sans TC', sans-serif" font-size="12" fill="#737A83">同一社區，條件不同，單價就不同</text>
      </svg>
    </div>
    <div class="lg:col-span-7 space-y-6">
      <p class="text-[17px] text-inkSoft leading-[2]">多年來服務美術館特區與農十六商圈，我們發現即使是同一個社區，不同樓層、面向、屋況、車位配置與當下的市場供需，都可能讓成交價出現明顯落差。</p>
      <p class="text-[17px] text-inkSoft leading-[2]">因此我們不會直接套用區域平均行情來估價。實際做法是先比對同社區、條件相近的近期成交案例，再參考目前的帶看反應與買方需求結構，給出更貼近市場的售價區間與策略建議。</p>
      <p class="text-[17px] text-inkSoft leading-[2]">同樣的邏輯也用在買方身上。我們會把你要看的物件放回它所在的社區行情裡比較，讓你知道這個開價是偏高、合理，還是有議價空間——而不是憑感覺出價。</p>
      <p class="font-mono text-[13px] text-inkFaint leading-relaxed">左圖數字為示意，實際落差依社區與物件條件而異。</p>
      <div class="pt-2"><a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a></div>
    </div>
  </div>
</section>`;
}

function aboutSection() {
  return `<section id="about" class="bg-surface border-y border-line">
  <div class="max-w-6xl mx-auto px-6 py-20 grid lg:grid-cols-12 gap-12">
    <div class="lg:col-span-4">
      <img src="assets/team-office.jpg" alt="台灣房屋 澄果團隊 門市" class="w-full aspect-[4/5] object-cover rounded-sm" loading="lazy" />
    </div>
    <div class="lg:col-span-8">
      <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">About</div>
      <h2 class="display text-2xl md:text-[28px]">在同一片生活圈裡，待得夠久</h2>
      <div class="mt-6 h-px bg-line"></div>
      <p class="mt-8 text-[17px] text-inkSoft leading-[1.9]">
        澄果團隊長期深耕鼓山美術館特區、農十六特區、左營瑞豐巨蛋生活圈與三民區中都重劃區。
        我們提供區域房價分析、市場趨勢、社區條件比較，以及首購購屋建議與換屋規劃，
        協助買賣雙方在同一組數據上討論，而不是各說各話。
      </p>
      <details class="mt-8 group">
        <summary class="font-mono text-[12px] text-orangeDeep inline-flex items-center gap-2 select-none">
          歷年獲獎紀錄（${AWARDS.length} 項）<span class="transition group-open:rotate-180 text-[10px]">▼</span>
        </summary>
        <ul class="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-1.5 font-mono text-[12px] text-inkSoft">
          ${AWARDS.map(a => `<li class="flex gap-2"><span class="text-line">—</span><span>${esc(a)}</span></li>`).join("\n          ")}
        </ul>
      </details>
      <div class="mt-9"><a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢澄果團隊</a></div>
    </div>
  </div>
</section>`;
}

function articlesSection(articles) {
  const list = articles.slice(0, 6);
  if (!list.length) {
    return `<section id="knowledge" class="bg-surface border-y border-line">
      <div class="max-w-6xl mx-auto px-6 py-20">
        ${sectionHead("Notes", "買房前，先把該懂的事搞懂", "首購與換屋最常卡住的幾個問題，我們整理成好讀的說明。")}
        <p class="text-[16px] text-inkSoft leading-[1.9]">文章正在準備中，近期陸續發布。有想先了解的問題，歡迎直接來電。</p>
      </div></section>`;
  }
  return `<section id="knowledge" class="bg-surface border-y border-line">
  <div class="max-w-6xl mx-auto px-6 py-20">
    ${sectionHead("Notes", "買房前，先把該懂的事搞懂", "首購與換屋最常卡住的幾個問題，我們整理成好讀的說明。")}
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
      ${list.map(a => `<article class="border-t-2 border-ink pt-5">
        ${a.cover ? `<a href="notes/${a.slug}.html" class="block mb-4">
          <img src="${esc(a.cover)}" alt="${esc(a.coverAlt || a.title)}" loading="lazy"
            class="w-full aspect-[3/2] object-cover bg-paper rounded-sm border border-line" /></a>` : ""}
        <div class="font-mono text-[12px] tracking-wider text-orangeDeep mb-3">${esc(a.tag)}</div>
        <h3 class="text-[17px] font-bold leading-snug mb-3 tracking-tight">
          <a href="notes/${a.slug}.html" class="hover:text-orangeDeep transition">${esc(a.title)}</a></h3>
        <p class="text-[15px] text-inkSoft leading-[1.85]">${esc(a.summary)}</p>
        <a href="notes/${a.slug}.html" class="inline-block font-mono text-[12px] text-orangeDeep mt-5 hover:underline">閱讀全文 →</a>
      </article>`).join("\n      ")}
    </div>
    <div class="mt-12">
      <a href="notes/index.html" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-white transition">看所有文章</a>
    </div>
  </div>
</section>`;
}

function toolsSection() {
  return `<section id="tools" class="max-w-6xl mx-auto px-6 py-20">
  ${sectionHead("Tools", "先算清楚，再做決定", "不需要留資料就能用。首購與換屋最常用到的四個工具，陸續上線中。")}
  <div class="grid sm:grid-cols-2 gap-6">
    ${TOOLS.map((t, i) => `<a href="${t.href}" class="sm:aspect-square flex flex-col border border-line rounded-sm bg-surface p-8 hover:bg-tint hover:border-orange transition">
      <div class="font-mono text-[12px] tracking-[0.18em] text-inkFaint">${String(i + 1).padStart(2, "0")}</div>
      <h3 class="text-[22px] font-bold mt-3 mb-3 tracking-tight">${esc(t.title)}</h3>
      <p class="text-[16px] text-inkSoft leading-[1.9]">${esc(t.desc)}</p>
      <div class="flex-1 min-h-[130px] flex items-center justify-center py-6"><div class="w-full max-w-[260px]">${ILLUS[t.illus]}</div></div>
      <span class="font-mono text-[13px] text-orangeDeep">開始使用 →</span>
    </a>`).join("\n    ")}
  </div>
</section>`;
}

function dealsSection(dealsData) {
  const all = (dealsData?.deals || []).filter(d => !d.hidden && d.img);
  if (!all.length) return "";

  const shown = all.slice(0, 6);
  const more = all.length - shown.length;

  return `<section id="deals" class="bg-surface border-t border-line">
  <div class="max-w-6xl mx-auto px-6 py-20">
    ${sectionHead("Closed", "賀成交", dealsData.intro || "")}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
      ${shown.map(d => dealCard(d)).join("\n      ")}
    </div>
    ${more > 0 ? `<div class="mt-12">
      <a href="deals/index.html" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-white transition">
        看全部 ${all.length} 筆成交紀錄
      </a>
    </div>` : ""}
  </div>
</section>`;
}

/* 單張成交卡片，首頁與賀成交列表共用 */
export function dealCard(d, depth = 0) {
  const up = "../".repeat(depth);
  const title = [d.community, d.caption].filter(Boolean).join("　");
  return `<figure>
    <img src="${up}${esc(d.img)}" alt="${esc(d.area)} ${esc(title)} 成交" loading="lazy"
      class="w-full h-auto rounded-sm border border-line bg-paper" />
    <figcaption class="mt-4">
      <div class="font-mono text-[11px] tracking-wider text-inkFaint">
        ${esc(d.area)}${d.date ? `・${esc(d.date)}` : ""}
      </div>
      <div class="text-[14px] text-ink mt-1">${esc(title)}</div>
    </figcaption>
  </figure>`;
}

function buyersSection(buyersData) {
  const list = (buyersData?.buyers || []).filter(b => !b.hidden);
  if (!list.length) return "";
  return `<section id="buyers" class="bg-surface border-y border-line">
  <div class="max-w-6xl mx-auto px-6 py-20">
    ${sectionHead("Buyers", "這些買方，正在找你的房子", buyersData.intro || "")}
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${list.map((b, i) => `<article class="border border-line rounded-sm bg-paper p-7 flex flex-col">
        <div class="flex items-baseline justify-between gap-3 mb-4">
          <span class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep">${String(i + 1).padStart(2, "0")}</span>
          ${b.updated ? `<span class="font-mono text-[12px] text-inkFaint">${esc(b.updated)}</span>` : ""}
        </div>
        <h3 class="text-[19px] font-bold tracking-tight leading-snug mb-5">${esc(b.area)}</h3>
        <dl class="space-y-3 mb-5">
          <div class="flex gap-4 pb-3 border-b border-line">
            <dt class="font-mono text-[12px] text-inkFaint w-12 shrink-0 pt-1">坪數</dt>
            <dd class="text-[15px] text-ink">${esc(b.size)}</dd></div>
          <div class="flex gap-4 pb-3 border-b border-line">
            <dt class="font-mono text-[12px] text-inkFaint w-12 shrink-0 pt-1">預算</dt>
            <dd class="font-mono text-[17px] font-semibold text-ink">${esc(b.budget)}</dd></div>
        </dl>
        ${b.notes?.length ? `<ul class="space-y-2 mb-6 flex-1">
          ${b.notes.map(n => `<li class="flex gap-2.5 text-[15px] text-inkSoft leading-[1.8]"><span class="text-orange shrink-0">・</span><span>${esc(n)}</span></li>`).join("")}
        </ul>` : ""}
        <a href="${BRAND.phoneHref}" class="font-mono text-[14px] text-orangeDeep hover:underline mt-auto">我的房子符合，來電洽詢 →</a>
      </article>`).join("\n      ")}
    </div>
    <div class="mt-12 flex flex-wrap items-center gap-6">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">免費估價 ${BRAND.phone}</a>
      <p class="text-[15px] text-inkSoft leading-[1.9]">沒有完全符合的也沒關係，買方條件通常有調整空間。先估價，再決定要不要賣。</p>
    </div>
  </div>
</section>`;
}

function faqSection() {
  return `<section id="faq" class="max-w-6xl mx-auto px-6 py-20">
  ${sectionHead("FAQ", "常見問題", "買方與屋主最常問的十個問題。找不到答案的，直接來電問我們最快。")}
  <div class="border-t border-line">
    ${FAQS.map(([q, a]) => `<details class="border-b border-line group">
      <summary class="w-full flex items-start justify-between gap-6 py-6 text-left">
        <h3 class="text-[17px] md:text-[18px] font-bold leading-snug tracking-tight group-hover:text-orangeDeep transition">${esc(q)}</h3>
        <span class="faq-plus font-mono text-[20px] text-orangeDeep shrink-0 leading-none mt-1 transition-transform">＋</span>
      </summary>
      <p class="text-[16px] text-inkSoft leading-[2] pb-7 pr-12 max-w-4xl">${esc(a)}</p>
    </details>`).join("\n    ")}
  </div>
</section>`;
}

/* ================= 組裝 ================= */
export function buildHome({ market, articles, buyers, videos, deals }) {
  const hasBuyers = (buyers?.buyers || []).some(b => !b.hidden);
  const visibleVideos = (videos?.videos || []).filter(v => !v.hidden);
  const heroVideo = videos?.heroVideoId
    ? visibleVideos.find(v => v.videoId === videos.heroVideoId)
    : visibleVideos[0];

  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "RealEstateAgent",
      name: BRAND.teamName, legalName: BRAND.legalName, url: `${SITE}/`,
      logo: `${SITE}/assets/logo-full.png`, image: `${SITE}/assets/team-office.jpg`,
      telephone: "+886-7-9766977",
      address: { "@type": "PostalAddress", streetAddress: BRAND.addressShort, addressLocality: "高雄市", postalCode: "804", addressCountry: "TW" },
      areaServed: ["高雄市鼓山區美術館特區", "高雄市鼓山區農十六特區", "高雄市左營區瑞豐巨蛋生活圈", "高雄市三民區中都重劃區"]
        .map(n => ({ "@type": "Place", name: n })),
      sameAs: [BRAND.officialSite, BRAND.facebook, BRAND.instagram, BRAND.youtube],
      description: "深耕高雄鼓山美術館特區、農十六特區、左營瑞豐巨蛋生活圈與三民區中都重劃區10年以上，累計服務件數超過150件。提供區域房價分析、免費房屋估價、售屋策略規劃、首購購屋建議與換屋規劃。",
      knowsLanguage: "zh-TW",
      hasOfferCatalog: {
        "@type": "OfferCatalog", name: "服務項目",
        itemListElement: [
          ["免費房屋估價", "依同社區近期成交案例、樓層面向、屋況與車位條件提供售價區間，不收費且無須先簽委託。"],
          ["成交行情分析", "以內政部實價登錄資料分析區域與社區成交行情。"],
          ["售屋策略規劃", "訂價、開價空間、上架時機與帶看安排的客製化規劃。"],
          ["稅費概算", "房地合一稅、土地增值稅與重購退稅概算。"],
          ["首購購屋規劃", "總價帶評估、新青安貸款試算、看屋陪同與議價策略。"],
          ["換屋規劃", "舊屋估價、稅務時程、資金缺口與兩案時程銜接規劃。"],
        ].map(([name, description]) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name, description } })),
      },
    },
    {
      "@context": "https://schema.org", "@type": "WebSite",
      name: BRAND.teamName, url: `${SITE}/`, inLanguage: "zh-TW",
      publisher: {
        "@type": "Organization", name: BRAND.legalName, url: `${SITE}/`,
        logo: `${SITE}/assets/logo-full.png`, telephone: "+886-7-9766977",
        address: { "@type": "PostalAddress", streetAddress: BRAND.addressShort, addressLocality: "高雄市", postalCode: "804", addressCountry: "TW" },
        sameAs: [BRAND.officialSite, BRAND.facebook, BRAND.instagram, BRAND.youtube],
      },
    },
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: FAQS.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  return [
    head({
      title: "台灣房屋 澄果團隊｜美術館房地產顧問，為您解決家的大小事",
      description: "高雄美術館特區、農十六房仲。台灣房屋澄果團隊深耕十年以上，截至115年7月約58%成交來自兩大商圈。提供免費房屋估價、成交行情分析、售屋策略規劃、房地合一稅概算，以及首購與換屋購屋建議。",
      keywords: "高雄美術館房仲,農十六房仲,高雄房仲推薦,免費房屋估價,美術館特區房價,農十六房價,高雄房屋出售,售屋流程,房地合一稅,瑞豐巨蛋,中都重劃區,台灣房屋澄果團隊",
      canonical: `${SITE}/`,
      ogImage: `${SITE}/assets/area-01-artmuseum.jpg`,
      depth: 0, jsonLd,
    }),
    header({ depth: 0, hasBuyers }),
    "<main>",
    heroSection(heroVideo),
    summarySection(),
    servicesSection(),
    areasSection(market),
    listingsSection(),
    experienceSection(),
    aboutSection(),
    articlesSection(articles),
    toolsSection(),
    dealsSection(deals),
    buyersSection(buyers),
    faqSection(),
    "</main>",
    footer({ depth: 0, hasBuyers }),
  ].join("\n");
}
