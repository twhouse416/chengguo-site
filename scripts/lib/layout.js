/**
 * 澄果團隊｜全站共用樣板
 * ------------------------------------------------
 * head、header、footer 等各頁共用的結構集中在這裡，
 * 改一次全站生效。
 */

export const SITE = "https://twhouse416.github.io/chengguo-site";

export const BRAND = {
  teamName: "台灣房屋 澄果團隊",
  legalName: "澄果資產有限公司",
  address: "804 高雄市鼓山區青海路416號",
  addressShort: "鼓山區青海路416號",
  phone: "07-9766977",
  phoneHref: "tel:0797669977",
  officialSite: "https://store.twhg.com.tw/TE80",
  facebook: "https://www.facebook.com/TWhouseo8",
  instagram: "https://www.instagram.com/twhouse_o8",
  youtube: "https://www.youtube.com/@%E5%8F%B0%E7%81%A3%E6%88%BF%E5%B1%8B%E6%BE%84%E6%9E%9C%E5%9C%98%E9%9A%8A",
  /* Web3Forms 存取金鑰。到 https://web3forms.com 輸入收件信箱即可免費取得，
     金鑰貼在這裡就會生效。留空時表單會顯示「尚未啟用」提示。 */
  formKey: "1ed3ef7d-7db9-47d6-9648-134f82d63a7c",
};

export const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* **粗體** → <strong> */
export const rich = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-ink">$1</strong>');

export const fmtDate = d => String(d || "").replaceAll("-", ".");

export const today = () => new Date().toISOString().slice(0, 10);

/* 依 showFrom / showUntil 判斷建置當下要不要輸出 */
export function visible(b) {
  const t = today();
  if (b.showFrom && t < b.showFrom) return false;
  if (b.showUntil && t >= b.showUntil) return false;
  return true;
}

export const AUTO_NOTE = `<!--
  ⚠️ 這個檔案由 scripts/build-site.js 自動產生，請勿直接編輯。
  要修改內容請改 scripts/ 底下的樣板，或在後台編輯 data/ 裡的資料。
  直接改這個檔案，下次自動建置時會被覆蓋。
-->`;

/* ---------- head ---------- */
export function head({ title, description, keywords, canonical, ogImage, ogType = "website", depth = 0, extra = "", jsonLd = [] }) {
  const up = "../".repeat(depth);
  return `${AUTO_NOTE}
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/png" href="${up}assets/logo-icon.png" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${keywords ? `<meta name="keywords" content="${esc(keywords)}" />` : ""}
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="${ogType}" />
<meta property="og:site_name" content="${BRAND.teamName}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:locale" content="zh_TW" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ogImage}" />
${extra}
${jsonLd.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n")}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = { theme: { extend: {
    colors: { ink:'#16191D', inkSoft:'#474D55', inkFaint:'#737A83',
      paper:'#F4F4F2', surface:'#FFFFFF', line:'#DEDCD7',
      orange:'#FD7305', orangeDeep:'#B85400', tint:'#FCEFE3' },
    fontFamily: { sans:['"Noto Sans TC"','sans-serif'], mono:['"IBM Plex Mono"','monospace'] },
    borderRadius: { DEFAULT:'3px', sm:'2px', md:'4px' },
  }}}
</script>
<style>
  html { scroll-behavior: smooth; }
  /* 錨點跳轉時預留 sticky header 的高度，避免標題被蓋住 */
  section[id], article[id] { scroll-margin-top: 84px; }
  body { background:#F4F4F2; -webkit-font-smoothing:antialiased; }
  ::selection { background:#FD7305; color:#fff; }
  .display { font-weight:900; letter-spacing:-0.02em; line-height:1.25; }
  :focus-visible { outline:2px solid #FD7305; outline-offset:2px; }
  /* hidden 屬性預設是 display:none，但會被 Tailwind 的 flex/grid 等 display 類別蓋過。
     加上這條確保 hidden 一定生效。 */
  [hidden] { display: none !important; }
  details > summary { list-style: none; cursor: pointer; }
  details > summary::-webkit-details-marker { display: none; }
  details[open] .faq-plus { transform: rotate(45deg); }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition: none !important; } }
</style>
</head>
<body class="font-sans text-ink">`;
}

/* ---------- 社群 icon ---------- */
export function socialLinks(variant = "light", size = "md") {
  const box = size === "sm" ? "w-9 h-9" : "w-10 h-10";
  const ic = size === "sm" ? "w-[17px] h-[17px]" : "w-[19px] h-[19px]";
  const st = variant === "dark"
    ? "border-white/25 text-white/70 hover:text-white hover:border-white hover:bg-white/10"
    : "border-line text-inkSoft hover:text-orangeDeep hover:border-orange";
  const cls = `${box} flex items-center justify-center border rounded-sm transition ${st}`;
  return `<div class="flex items-center gap-2">
    <a href="${BRAND.facebook}" target="_blank" rel="noopener noreferrer" aria-label="澄果團隊 Facebook" title="Facebook" class="${cls}">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="${ic}"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z"/></svg>
    </a>
    <a href="${BRAND.instagram}" target="_blank" rel="noopener noreferrer" aria-label="澄果團隊 Instagram" title="Instagram" class="${cls}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${ic}">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" /></svg>
    </a>
  </div>`;
}

/* ---------- Header ----------
   depth：0 = 根目錄，1 = notes/ videos/，2 = tools/xxx/
   hasBuyers：沒有買方需求時不顯示該項目
*/
export function header({ depth = 0, hasBuyers = false, compact = false } = {}) {
  const up = "../".repeat(depth);
  const home = depth === 0 ? "" : `${up}index.html`;
  const nav = [
    [`${home}#services`, "服務項目"],
    [`${home}#areas`, "生活圈行情"],
    [`${up}communities/index.html`, "社區行情"],
    [`${home}#tools`, "試算工具"],
    ...(hasBuyers ? [[`${home}#buyers`, "買方需求"]] : []),
    [`${home}#faq`, "常見問題"],
    [`${up}notes/index.html`, "知識文章"],
    [`${up}videos/index.html`, "影片"],
  ];
  /* 看物件單獨拉出來，用外連樣式強調 */
  const listingLink = `<a href="${BRAND.officialSite}" target="_blank" rel="noopener noreferrer"
      class="inline-flex items-center gap-1.5 text-[15px] font-medium text-orangeDeep hover:text-orange whitespace-nowrap">
      看在售物件
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5" aria-hidden="true">
        <path d="M7 17L17 7M17 7H9M17 7v8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>`;
  const width = compact ? "max-w-3xl" : "max-w-6xl";

  return `<header class="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-line">
  <div class="${width} mx-auto px-6 h-[68px] flex items-center justify-between">
    <a href="${depth === 0 ? "#top" : up + "index.html"}" class="flex items-center gap-3 shrink-0 mr-6">
      <img src="${up}assets/logo-icon.png" alt="" class="w-9 h-9 object-contain" />
      <span class="leading-tight">
        <span class="block font-mono text-[11px] tracking-[0.2em] text-inkFaint">TAIWAN REALTY</span>
        <span class="block text-[17px] font-bold tracking-tight text-ink">澄果團隊</span>
      </span>
    </a>
    ${compact ? "" : `<nav class="hidden xl:flex items-center gap-5 text-[15px] text-inkSoft whitespace-nowrap">
      ${nav.map(([h, l]) => `<a href="${h}" class="hover:text-ink transition">${l}</a>`).join("\n      ")}
      ${listingLink}
    </nav>`}
    <div class="hidden ${compact ? "sm" : "xl"}:flex items-center gap-4 shrink-0">
      ${compact ? "" : socialLinks("light", "sm")}
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-6 py-3 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition whitespace-nowrap">來電諮詢 ${BRAND.phone}</a>
    </div>
    ${compact ? "" : `<button id="menuBtn" aria-label="開啟選單" aria-expanded="false"
      class="xl:hidden w-9 h-9 flex items-center justify-center border border-line rounded-sm">
      <span class="text-lg leading-none">☰</span>
    </button>`}
  </div>
  ${compact ? "" : `<div id="mobileMenu" hidden
    class="xl:hidden bg-surface border-t border-line overflow-y-auto overscroll-contain"
    style="max-height:calc(100vh - 68px)">
    <div class="px-6 py-4">
      <nav class="grid grid-cols-2 gap-x-4">
        ${[...nav, [`${home}#about`, "關於團隊"], [`${home}#deals`, "近期成交"]]
          .map(([h, l]) => `<a href="${h}" class="menu-link text-[16px] text-inkSoft py-2.5 border-b border-line">${l}</a>`).join("\n        ")}
      </nav>
      <div class="py-3">${listingLink}</div>
      <a href="${BRAND.phoneHref}" class="flex items-center justify-center px-6 py-3 text-[15px] font-medium rounded-sm bg-orange text-white">來電諮詢 ${BRAND.phone}</a>
      <div class="pt-4 pb-1">${socialLinks("light")}</div>
    </div>
  </div>`}
</header>`;
}

/* ---------- 聯絡表單 ----------
   靜態網站沒有後端，透過 Web3Forms 把內容寄到指定信箱。
   金鑰設定在 BRAND.formKey，留空時顯示提示而不渲染表單。

   個資法：蒐集姓名電話屬特定目的蒐集，必須有告知事項與同意勾選。
   下方的告知內容請由澄果團隊確認後再上線。
*/
const FIELD_CLS = "w-full bg-white/5 border border-white/20 rounded-sm px-4 py-2.5 " +
  "text-[15px] text-white placeholder-white/35 focus:border-orange focus:bg-white/10 outline-none transition";
const LABEL_CLS = "block font-mono text-[12px] tracking-wider text-white/50 mb-1.5";

export function contactForm() {
  if (!BRAND.formKey) {
    return `<div class="border border-white/15 rounded-sm p-7">
      <h3 class="text-[18px] font-bold text-white mb-3">留下聯絡方式</h3>
      <p class="text-[15px] leading-[1.9] text-white/60">
        線上表單準備中。想詢問任何問題，歡迎直接來電
        <a href="${BRAND.phoneHref}" class="text-orange hover:underline">${BRAND.phone}</a>，
        或透過 <a href="${BRAND.facebook}" target="_blank" rel="noopener noreferrer" class="text-orange hover:underline">Facebook</a>
        與 <a href="${BRAND.instagram}" target="_blank" rel="noopener noreferrer" class="text-orange hover:underline">Instagram</a> 私訊我們。
      </p>
    </div>`;
  }

  return `<div class="border border-white/15 rounded-sm p-7">
  <h3 class="text-[18px] font-bold text-white">留下聯絡方式，我們回電給你</h3>
  <p class="text-[14px] leading-[1.85] text-white/55 mt-2">
    不方便講電話也沒關係，填一下需求，我們會挑你方便的時段聯絡。
  </p>

  <form id="contactForm" class="mt-6 space-y-4" novalidate>
    <input type="hidden" name="access_key" value="${BRAND.formKey}" />
    <input type="hidden" name="subject" value="澄果團隊官網｜客戶諮詢" />
    <input type="hidden" name="from_name" value="澄果團隊官網" />
    <!-- 蜜罐欄位：機器人會填，真人看不到，用來擋垃圾訊息 -->
    <input type="checkbox" name="botcheck" class="hidden" style="display:none" tabindex="-1" autocomplete="off" />

    <div class="grid sm:grid-cols-2 gap-4">
      <div>
        <label class="${LABEL_CLS}" for="cf-name">稱呼 <span class="text-orange">*</span></label>
        <input id="cf-name" name="稱呼" required maxlength="30" class="${FIELD_CLS}" placeholder="王先生 / 陳小姐" />
      </div>
      <div>
        <label class="${LABEL_CLS}" for="cf-phone">聯絡電話 <span class="text-orange">*</span></label>
        <input id="cf-phone" name="聯絡電話" required type="tel" inputmode="tel" maxlength="20"
          class="${FIELD_CLS}" placeholder="09xx-xxx-xxx" />
      </div>
    </div>

    <div>
      <label class="${LABEL_CLS}" for="cf-email">Email（選填）</label>
      <input id="cf-email" name="Email" type="email" maxlength="80" class="${FIELD_CLS}" placeholder="要收書面資料再填" />
    </div>

    <div class="grid sm:grid-cols-2 gap-4">
      <div>
        <label class="${LABEL_CLS}" for="cf-type">需求類型</label>
        <select id="cf-type" name="需求類型" class="${FIELD_CLS}">
          ${["我要賣房", "我要買房", "想先估價", "換屋規劃", "其他"]
            .map(o => `<option value="${o}" class="text-ink">${o}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="${LABEL_CLS}" for="cf-time">方便聯絡的時段</label>
        <select id="cf-time" name="方便聯絡時段" class="${FIELD_CLS}">
          ${["都可以", "上午 9-12 點", "下午 1-6 點", "晚上 6-9 點", "假日"]
            .map(o => `<option value="${o}" class="text-ink">${o}</option>`).join("")}
        </select>
      </div>
    </div>

    <div>
      <label class="${LABEL_CLS}" for="cf-msg">想詢問的內容</label>
      <textarea id="cf-msg" name="詢問內容" rows="3" maxlength="500" class="${FIELD_CLS}"
        placeholder="例如：想知道美術館特區三房的行情，預算 1,500 萬左右"></textarea>
    </div>

    <button type="submit" id="cf-submit"
      class="w-full inline-flex items-center justify-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition disabled:opacity-50">
      送出
    </button>

    <p class="text-[13px] leading-[1.8] text-white/45">
      送出前會顯示
      <button type="button" id="cf-privacy-open" class="text-orange/80 hover:text-orange hover:underline">個資蒐集告知事項</button>
      ，同意後才會送出。
    </p>

    <p id="cf-status" class="text-[14px] leading-[1.8]" role="status" aria-live="polite"></p>
  </form>
</div>

<!-- 個資告知事項 -->
<div id="cf-privacy" hidden class="fixed inset-0 z-[110] bg-ink/90 flex items-center justify-center p-4 md:p-10">
  <div class="bg-surface text-ink rounded-sm max-w-2xl w-full max-h-[85vh] overflow-y-auto">
    <div class="p-8">
      <h3 class="display text-[20px] mb-5">個人資料蒐集、處理及利用告知事項</h3>
      <div class="space-y-4 text-[15px] leading-[1.9] text-inkSoft">
        <p>依《個人資料保護法》第 8 條規定，${BRAND.legalName}（以下稱本公司）於蒐集您的個人資料前，謹告知下列事項：</p>
        <div>
          <div class="font-bold text-ink mb-1">一、蒐集目的</div>
          <p>不動產仲介服務、客戶管理與服務、行銷業務聯繫，以及回覆您的諮詢需求。</p>
        </div>
        <div>
          <div class="font-bold text-ink mb-1">二、蒐集的個人資料類別</div>
          <p>您於本表單主動提供的姓名或稱呼、聯絡電話、電子郵件位址，以及您所填寫的需求內容。</p>
        </div>
        <div>
          <div class="font-bold text-ink mb-1">三、利用期間、地區、對象及方式</div>
          <p>期間：自您提供之日起，至您要求停止利用或本公司停止提供服務時止。<br />
             地區：中華民國境內。<br />
             對象：本公司及所屬經紀人員。非經您同意或法令規定，不會提供予第三人。<br />
             方式：以電話、簡訊、電子郵件或通訊軟體與您聯繫，並於前述蒐集目的範圍內使用。</p>
        </div>
        <div>
          <div class="font-bold text-ink mb-1">四、您得行使的權利</div>
          <p>依個資法第 3 條，您得向本公司請求查詢、閱覽、製給複製本、補充或更正、停止蒐集處理利用，或請求刪除您的個人資料。
             請來電 <a href="${BRAND.phoneHref}" class="text-orangeDeep hover:underline">${BRAND.phone}</a> 或親洽本公司辦理。</p>
        </div>
        <div>
          <div class="font-bold text-ink mb-1">五、不提供個人資料的影響</div>
          <p>本表單為選擇性填寫。若不提供聯絡方式，本公司將無法與您聯繫或提供相關服務，但不影響您以電話等其他方式洽詢。</p>
        </div>
      </div>
      <div class="mt-7 flex flex-wrap gap-3">
        <button type="button" id="cf-privacy-agree"
          class="inline-flex items-center px-7 py-3 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">
          我已閱讀並同意，送出
        </button>
        <button type="button" id="cf-privacy-close"
          class="inline-flex items-center px-7 py-3 text-[15px] font-medium rounded-sm border border-line text-ink hover:bg-paper transition">
          再想一下
        </button>
      </div>
    </div>
  </div>
</div>`;
}

/* ---------- Footer ---------- */
export function footer({ depth = 0, hasBuyers = false, compact = false } = {}) {
  const up = "../".repeat(depth);
  const home = depth === 0 ? "" : `${up}index.html`;
  const width = compact ? "max-w-3xl" : "max-w-6xl";
  const links = [
    [`${home}#services`, "服務項目"], [`${home}#areas`, "生活圈行情"], [`${home}#about`, "關於團隊"],
    [`${home}#tools`, "試算工具"], [`${up}notes/index.html`, "知識文章"], [`${up}videos/index.html`, "影片"],
    [`${home}#deals`, "近期成交"],
    ...(hasBuyers ? [[`${home}#buyers`, "買方需求"]] : []),
    [`${home}#faq`, "常見問題"],
  ];

  if (compact) {
    return `<footer class="border-t border-line">
  <div class="${width} mx-auto px-6 py-8 font-mono text-[12px] text-inkFaint flex flex-wrap gap-x-6 gap-y-2 justify-between">
    <span>© ${new Date().getFullYear()} ${BRAND.legalName}</span>
    <span class="flex flex-wrap gap-x-6 gap-y-2">
      <a href="${BRAND.officialSite}" target="_blank" rel="noopener noreferrer" class="text-orangeDeep hover:text-orange">看在售物件 ↗</a>
      <a href="${up}index.html" class="hover:text-orangeDeep">回首頁</a>
    </span>
  </div>
</footer>
</body>
</html>`;
  }

  return `<footer id="contact" class="bg-ink text-white/75">
  <div class="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-12 gap-10">
    <div class="md:col-span-7">
      <h2 class="display text-2xl text-white">先聊聊，不用急著決定</h2>
      <p class="mt-5 text-[16px] leading-[2] max-w-md">
        不論是想知道自己的預算能買哪一區，或是手上房子現在值多少，都可以先問。我們會用實際成交資料回答你。
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
        <a href="${BRAND.officialSite}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-white/30 text-white hover:bg-white hover:text-ink transition">看在售物件 ↗</a>
      </div>
      <nav aria-label="頁尾導覽" class="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-[14px]">
        ${links.map(([h, l]) => `<a href="${h}" class="hover:text-orange transition">${l}</a>`).join("\n        ")}
      </nav>
      <div class="mt-8">${socialLinks("dark")}</div>
    </div>
    <div class="md:col-span-5">
      ${contactForm()}
    </div>
  </div>

  <div class="border-t border-white/10">
    <div class="max-w-6xl mx-auto px-6 py-6 font-mono text-[13px] text-white/55 flex flex-wrap gap-x-8 gap-y-1">
      <span class="text-white/80">${BRAND.teamName}</span>
      <span>${BRAND.legalName}</span>
      <span>${BRAND.address}</span>
      <span><a href="${BRAND.phoneHref}" class="hover:text-orange transition">${BRAND.phone}</a></span>
    </div>
  </div>

  <div class="border-t border-white/10">
    <div class="max-w-6xl mx-auto px-6 py-5 font-mono text-[12px] text-white/40 flex flex-wrap gap-x-6 gap-y-1 justify-between">
      <span>© ${new Date().getFullYear()} ${BRAND.legalName}</span>
      <span>行情資料來源：內政部不動產交易實價查詢服務網</span>
    </div>
  </div>
</footer>

<script>
  /* 聯絡表單：送到 Web3Forms，全程原生 JavaScript */
  (function () {
    var form = document.getElementById("contactForm");
    if (!form) return;

    var status = document.getElementById("cf-status");
    var submit = document.getElementById("cf-submit");
    var modal = document.getElementById("cf-privacy");
    var agreed = false;          // 這次工作階段是否已同意告知事項
    var pendingSubmit = false;   // 是否因為要看告知事項而暫停送出

    function openModal(pending) {
      pendingSubmit = !!pending;
      modal.removeAttribute("hidden");
      document.body.style.overflow = "hidden";
    }
    function closeModal() {
      modal.setAttribute("hidden", "");
      document.body.style.overflow = "";
    }

    /* 主動點連結查看：只是閱讀，不會觸發送出 */
    document.getElementById("cf-privacy-open").addEventListener("click", function () {
      openModal(false);
    });
    document.getElementById("cf-privacy-close").addEventListener("click", function () {
      closeModal();
      if (pendingSubmit) {
        pendingSubmit = false;
        say("需要同意告知事項才能送出。你也可以直接來電 ${BRAND.phone}。");
      }
    });
    document.getElementById("cf-privacy-agree").addEventListener("click", function () {
      agreed = true;
      closeModal();
      if (pendingSubmit) { pendingSubmit = false; send(); }
    });
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hasAttribute("hidden")) closeModal();
    });

    function say(msg, ok) {
      status.textContent = msg;
      status.className = "text-[14px] leading-[1.8] " + (ok ? "text-orange" : "text-white/70");
    }

    function send() {
      submit.disabled = true;
      submit.textContent = "送出中…";
      say("");

      fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.success) throw new Error(d.message || "送出失敗");
          form.reset();
          agreed = false;   /* 下一次送出仍需再次同意 */
          say("已收到你的訊息，我們會盡快與你聯絡。急件請直接來電 ${BRAND.phone}。", true);
          submit.textContent = "已送出";
        })
        .catch(function () {
          say("送出時發生問題，請稍後再試，或直接來電 ${BRAND.phone}。");
          submit.disabled = false;
          submit.textContent = "送出";
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = form.querySelector("#cf-name").value.trim();
      var phone = form.querySelector("#cf-phone").value.trim();

      if (!name) { say("請填寫稱呼"); form.querySelector("#cf-name").focus(); return; }
      if (!phone) { say("請填寫聯絡電話"); form.querySelector("#cf-phone").focus(); return; }
      /* 電話只做寬鬆檢查：市話、手機、含分機或連字號都放行 */
      if (phone.replace(/[^0-9]/g, "").length < 8) {
        say("電話號碼看起來不完整，請再確認一次"); form.querySelector("#cf-phone").focus(); return;
      }

      /* 資料填妥後才顯示告知事項，同意即接著送出 */
      if (!agreed) { openModal(true); return; }
      send();
    });
  })();

  /* 手機選單：純原生，不依賴框架 */
  (function () {
    var btn = document.getElementById("menuBtn");
    var menu = document.getElementById("mobileMenu");
    if (!btn || !menu) return;

    function setOpen(open) {
      if (open) {
        menu.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
        btn.firstElementChild.textContent = "✕";
      } else {
        menu.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
        btn.firstElementChild.textContent = "☰";
      }
    }

    btn.addEventListener("click", function () { setOpen(menu.hasAttribute("hidden")); });

    /* 點選單項目後自動關閉，否則跳到區塊時畫面仍被選單蓋住 */
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hasAttribute("hidden")) setOpen(false);
    });

    /* 視窗放大到桌機寬度時，把選單收起來，避免殘留 */
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 1280 && !menu.hasAttribute("hidden")) setOpen(false);
    });
  })();
</script>
</body>
</html>`;
}

/* ---------- 區塊標題 ---------- */
export function sectionHead(label, title, note) {
  return `<div class="mb-10">
    <div class="font-mono text-[11px] tracking-[0.18em] text-orangeDeep uppercase mb-3">${esc(label)}</div>
    <h2 class="display text-2xl md:text-[28px] text-ink">${esc(title)}</h2>
    ${note ? `<p class="mt-4 text-[16px] text-inkSoft leading-[1.9] max-w-3xl">${esc(note)}</p>` : ""}
    <div class="mt-6 h-px bg-line"></div>
  </div>`;
}
