/**
 * 澄果團隊｜關於團隊頁
 * ------------------------------------------------
 * 原本團隊介紹只是首頁的一個 #about 區塊，沒有獨立網址。
 * 不動產屬於 Google 定義的 YMYL（Your Money or Your Life）領域，
 * 對 E-E-A-T（經驗、專業、權威、可信）的要求比一般主題高很多，
 * 而「誰在講這些話、憑什麼」需要一個可以被連結、被引用的頁面。
 *
 * 內容全部沿用首頁已在用的事實（獲獎紀錄、服務年數、件數、服務項目、
 * 聯絡資訊），沒有新增任何未經確認的敘述。
 *
 * 署名層級：澄果團隊決定文章與頁面的作者一律用團隊名
 * （台灣房屋 澄果團隊 / 澄果資產有限公司），不列個別經紀人姓名與證號，
 * 所以這一頁與文章頁的 author 都是 Organization，不是 Person。
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, head, header, footer } from "./lib/layout.js";
import { AWARDS, HIGHLIGHTS, FACTS } from "./build-home.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SERVICES = [
  ["免費房屋估價", "依同社區近期成交案例、樓層面向、屋況與車位條件提供售價區間，不收費也不需要先簽委託。"],
  ["成交行情分析", "以內政部不動產交易實價查詢服務網的資料，逐筆比對同社區、同路段的成交紀錄。"],
  ["售屋策略規劃", "訂價、開價空間、上架時機與帶看安排的客製化規劃。"],
  ["稅費概算", "房地合一稅、土地增值稅與重購退稅的概算與時程提醒。"],
  ["首購購屋規劃", "總價帶評估、新青安貸款試算、看屋陪同與議價策略。"],
  ["換屋規劃", "舊屋估價、稅務時程、資金缺口與兩案時程的銜接規劃。"],
];

export function buildAbout({ hasBuyers = false, communityCount = 0, dealTotal = 0, dataUpdated = "" } = {}) {
  const url = `${SITE}/about/`;

  const lead = `澄果團隊隸屬台灣房屋，公司全名為澄果資產有限公司，`
    + `深耕高雄市鼓山區美術館特區、鼓山區農十六特區、左營區瑞豐巨蛋生活圈`
    + `與三民區中都重劃區 10 年以上，累計服務件數超過 150 件，`
    + `歷年獲台灣房屋評鑑與競賽獎項 ${AWARDS.length} 項。`
    + (communityCount ? `本站整理了這四個生活圈內 ${communityCount} 個社區的實價登錄成交紀錄，共 ${dealTotal.toLocaleString("en-US")} 筆。` : "");

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: `關於台灣房屋 澄果團隊`,
      url, description: lead, inLanguage: "zh-TW",
      ...(dataUpdated ? { dateModified: dataUpdated } : {}),
      mainEntity: {
        "@type": "RealEstateAgent",
        "@id": `${SITE}/#organization`,
        name: BRAND.teamName,
        legalName: BRAND.legalName,
        url: `${SITE}/`,
        logo: `${SITE}/assets/logo-full.png`,
        image: `${SITE}/assets/team-office.jpg`,
        telephone: "+886-7-9766977",
        address: {
          "@type": "PostalAddress",
          streetAddress: BRAND.addressShort,
          addressLocality: "高雄市",
          postalCode: "804",
          addressCountry: "TW",
        },
        areaServed: [
          { "@type": "Place", name: "高雄市鼓山區美術館特區" },
          { "@type": "Place", name: "高雄市鼓山區農十六特區" },
          { "@type": "Place", name: "高雄市左營區瑞豐巨蛋生活圈" },
          { "@type": "Place", name: "高雄市三民區中都重劃區" },
        ],
        sameAs: [BRAND.officialSite, BRAND.facebook, BRAND.instagram, BRAND.youtube].filter(Boolean),
        knowsLanguage: "zh-TW",
        award: AWARDS,
        makesOffer: SERVICES.map(([n, d]) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: n, description: d },
        })),
      },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "關於團隊", item: url },
      ],
    },
  ];

  const html = [
    head({
      title: `關於台灣房屋 澄果團隊｜高雄美術館特區、農十六、瑞豐巨蛋、中都在地房仲`,
      description: `澄果資產有限公司（台灣房屋 澄果團隊）深耕高雄鼓山美術館特區、農十六特區、左營瑞豐巨蛋與三民中都重劃區 10 年以上，累計服務超過 150 件，歷年獲獎 ${AWARDS.length} 項。地址 ${BRAND.address}，電話 ${BRAND.phone}。`,
      keywords: "澄果團隊,台灣房屋澄果團隊,澄果資產有限公司,高雄房仲,美術館特區房仲,農十六房仲,高雄買房顧問",
      canonical: url, ogImage: `${SITE}/assets/team-office.jpg`, depth: 1, jsonLd,
    }),
    header({ depth: 1, hasBuyers }),
    `<main class="max-w-4xl mx-auto px-6 py-14">
  <nav aria-label="麵包屑" class="font-mono text-[12px] text-inkFaint mb-6">
    <a href="../index.html" class="hover:text-orangeDeep">首頁</a><span class="mx-2">/</span><span>關於團隊</span>
  </nav>

  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">About</div>
  <h1 class="display text-[30px] md:text-[40px]">關於${esc(BRAND.teamName)}</h1>
  <p class="mt-5 text-[17px] text-inkSoft leading-[1.95] max-w-3xl">${esc(lead)}</p>

  <div class="mt-10 grid sm:grid-cols-2 gap-x-10 border-t border-line">
    ${FACTS.map(([n, u, label, note]) => `<div class="py-5 border-b border-line">
      <div class="font-mono"><span class="text-[30px] font-semibold text-ink">${n}</span><span class="text-[14px] text-inkSoft ml-1">${esc(u)}</span></div>
      <div class="text-[15px] text-inkSoft mt-1">${esc(label)}${note ? `<span class="font-mono text-[12px] text-inkFaint ml-2">${esc(note)}</span>` : ""}</div>
    </div>`).join("\n    ")}
  </div>

  <section class="mt-14">
    <h2 class="display text-[23px] mb-6">我們做的事</h2>
    <dl class="border-t border-line">
      ${SERVICES.map(([n, d]) => `<div class="py-5 border-b border-line">
        <dt class="text-[17px] font-bold tracking-tight">${esc(n)}</dt>
        <dd class="text-[16px] text-inkSoft leading-[1.9] mt-2">${esc(d)}</dd>
      </div>`).join("\n      ")}
    </dl>
  </section>

  <section class="mt-14">
    <h2 class="display text-[23px] mb-6">為什麼只做這四個生活圈</h2>
    <p class="text-[16px] text-inkSoft leading-[1.95] max-w-3xl">
      同一個社區裡，樓層、面向、坪數與車位配置不同，單價落差往往比不同區之間還大。
      這種差異沒有捷徑，只能靠長期在同一片區域成交、實際走過每一棟樓才累積得出來。
      與其把範圍拉大到整個高雄，我們選擇把這四個生活圈做到能逐棟、逐門牌講清楚——
      本站的社區頁就是這件事的成果：門牌範圍用內政部實價登錄的建築完成年月與總樓層
      交叉驗證過，成交紀錄逐筆列出而不算平均，查不到的規格就留空不做推測。
    </p>
    <ul class="mt-6 border-t border-line">
      ${HIGHLIGHTS.map(h => `<li class="py-3.5 border-b border-line text-[16px] text-inkSoft leading-[1.85] flex gap-3">
        <span class="text-orange shrink-0 font-bold">✓</span><span>${esc(h)}</span></li>`).join("\n      ")}
    </ul>
  </section>

  <section class="mt-14">
    <h2 class="display text-[23px] mb-6">歷年獲獎紀錄（${AWARDS.length} 項）</h2>
    <ul class="grid sm:grid-cols-2 gap-x-8 border-t border-line">
      ${AWARDS.map(a => `<li class="py-3 border-b border-line font-mono text-[14px] text-inkSoft">— ${esc(a)}</li>`).join("\n      ")}
    </ul>
  </section>

  <section class="mt-14">
    <h2 class="display text-[23px] mb-6">聯絡與門市資訊</h2>
    <dl class="border-t border-line">
      ${[["公司全名", BRAND.legalName], ["統一編號", BRAND.taxId],
         ["加盟店全名", BRAND.franchiseName], ["加盟品牌", BRAND.franchiseBrand],
         ["品牌", BRAND.teamName],
         ["成立年份", `${BRAND.foundingYear} 年`], ["團隊人數", `${BRAND.teamSize} 人`],
         ["地址", BRAND.address],
         ["電話", BRAND.phone], ["服務區域", "高雄市鼓山區、左營區、三民區（美術館特區、農十六特區、瑞豐巨蛋生活圈、中都重劃區）"]]
        .map(([k, v]) => `<div class="flex flex-wrap justify-between gap-4 py-4 border-b border-line">
        <dt class="text-[15px] text-inkFaint shrink-0">${esc(k)}</dt>
        <dd class="text-[15px] text-ink text-right">${esc(v)}</dd>
      </div>`).join("\n      ")}
    </dl>
    <div class="mt-7 flex flex-wrap gap-4">
      <a href="${BRAND.phoneHref}" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">來電諮詢 ${BRAND.phone}</a>
      ${BRAND.lineUrl ? `<a href="${BRAND.lineUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-line text-ink hover:bg-tint transition">用 LINE 問</a>` : ""}
      <a href="${BRAND.officialSite}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-7 py-3.5 text-[15px] font-medium rounded-sm border border-line text-ink hover:bg-tint transition">看在售物件</a>
    </div>
  </section>
</main>`,
    footer({ depth: 1, hasBuyers }),
  ].join("\n");

  const dir = path.join(ROOT, "about");
  writeFileSync(path.join(dir, "index.html"), html, "utf-8");
  console.log("[產生] about/index.html");
  return true;
}
