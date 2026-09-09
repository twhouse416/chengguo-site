/**
 * 澄果團隊｜跨類型的站內連結
 * ------------------------------------------------
 * 社區頁彼此已經互連、文章頁彼此也已經互連，但「文章 → 社區」
 * 與「工具 → 社區」之間是斷的。使用者查完學區、看完比較文章之後，
 * 沒有一條路通往真正會產生詢問的社區頁；Google 也因此判斷不出
 * 社區頁的重要性。這個檔案負責補上那幾條線。
 *
 * 連結一律由資料生成，不手寫：新增社區、社區改隸生活圈、改學區，
 * 相關區塊都會自己跟著變，不會出現連到已刪除頁面的死連結。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc } from "./layout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/* 已發布的社區（草稿不列入，否則會連到不存在的頁面） */
export function loadCommunities() {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "data/communities.json"), "utf-8"));
  const list = Array.isArray(raw) ? raw : (raw.communities || raw.items || []);
  return list.filter(c => c && c.slug && !c.draft);
}

/* 四大生活圈的名稱，用來判斷文章在講哪一區 */
export const AREA_NAMES = ["美術館特區", "農十六特區", "瑞豐・巨蛋", "中都重劃區"];

/* 文章提到哪些生活圈：拿標題、摘要、關鍵字與內文一起比對。
   「瑞豐・巨蛋」在文章裡的寫法不一定帶那個間隔號，所以另外列別名。 */
const AREA_ALIASES = {
  "美術館特區": ["美術館特區", "美術館"],
  "農十六特區": ["農十六"],
  "瑞豐・巨蛋": ["瑞豐", "巨蛋"],
  "中都重劃區": ["中都"],
};

export function areasMentioned(article) {
  const text = JSON.stringify([
    article.title, article.summary, article.keywords, article.blocks,
  ]);
  return AREA_NAMES.filter(name =>
    (AREA_ALIASES[name] || [name]).some(k => text.includes(k)));
}

/* 社區卡片的格子。up 是回到站根目錄的相對路徑前綴（notes/ 是 "../"，
   tools/xxx/ 是 "../../"），寫死會在其中一種頁面上壞掉。 */
function cards(items, up) {
  return `<div class="grid sm:grid-cols-2 gap-4">
      ${items.map(c => `<a href="${up}communities/${c.slug}.html"
        class="border border-line rounded-sm bg-surface px-5 py-4 hover:border-orange hover:bg-tint transition">
        <span class="font-mono text-[12px] text-inkFaint block">${esc(c.area || "")}</span>
        <span class="text-[16px] font-bold tracking-tight">${esc(c.name)}</span>
      </a>`).join("\n      ")}
    </div>`;
}

/**
 * 文章底部的「這篇提到的生活圈」區塊。
 * 只列文章實際提到的那幾區，沒提到就整段不輸出——
 * 每篇文章都掛一份完整社區清單，對讀者是雜訊，對 SEO 也沒有加分。
 */
export function articleRelated(article, up = "../") {
  const areas = areasMentioned(article);
  if (!areas.length) return "";

  const all = loadCommunities();
  const groups = areas
    .map(area => ({ area, items: all.filter(c => c.area === area).slice(0, 4) }))
    .filter(g => g.items.length);

  if (!groups.length) return "";

  return `<section class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-2">Communities</div>
    <h2 class="text-[19px] font-bold tracking-tight mb-2">這篇提到的生活圈，我們整理過的社區</h2>
    <p class="text-[15px] text-inkSoft leading-[1.9] mb-6">
      每個社區頁都有實價登錄的逐筆成交紀錄、規格與學區資料。
      想先看整區行情，可以到<a href="${up}index.html#areas" class="text-orangeDeep hover:underline">首頁的生活圈行情</a>。
    </p>
    ${groups.map(g => `<div class="mb-6 last:mb-0">
      <div class="font-mono text-[13px] text-inkSoft mb-3">${esc(g.area)}</div>
      ${cards(g.items, up)}
    </div>`).join("\n    ")}
  </section>`;
}

/**
 * 學區查詢工具底部的「各學區對應的社區」。
 * 依社區資料裡的國小學區分組，查完學區的人可以直接往下看社區。
 */
export function schoolZoneRelated(up = "../../") {
  const all = loadCommunities();

  const bySchool = new Map();
  all.forEach(c => {
    const s = c.school?.primary;
    if (!s) return;
    if (!bySchool.has(s)) bySchool.set(s, []);
    bySchool.get(s).push(c);
  });
  if (!bySchool.size) return "";

  const groups = [...bySchool.entries()].sort((a, b) => b[1].length - a[1].length);

  return `<section class="mt-14 pt-8 border-t border-line">
    <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-2">Communities</div>
    <h2 class="text-[19px] font-bold tracking-tight mb-2">這些學區裡，我們整理過的社區</h2>
    <p class="text-[15px] text-inkSoft leading-[1.9] mb-6">
      查到學區之後，可以直接看該學區內社區的實價登錄成交紀錄。
      要提醒的是學區以里、鄰劃分，同一個社區也可能跨鄰，
      以下依社區所在里別對應，實際仍請向學校確認。
      想先看整區行情，可以到<a href="${up}index.html#areas" class="text-orangeDeep hover:underline">首頁的生活圈行情</a>。
    </p>
    ${groups.map(([school, items]) => `<div class="mb-6 last:mb-0">
      <div class="font-mono text-[13px] text-inkSoft mb-3">${esc(school)}　${items.length} 個社區</div>
      ${cards(items, up)}
    </div>`).join("\n    ")}
  </section>`;
}
