/**
 * 澄果團隊｜四大生活圈行情自動更新腳本（v4）
 * ------------------------------------------------
 * 資料來源：內政部不動產交易實價查詢服務網（plvr.land.moi.gov.tw）
 * 官方資料本身「每月 1、11、21 日」批次公告，不是逐日更新。
 * 本腳本設計為「每日執行、有新一期資料才會變動結果」。
 *
 * v2 變更：
 * - 生活圈行情用「近四季（約一年）」的成屋資料計算單價平均與總價中位數
 * - 「最新即時檔」只有十天份，不能當一整季看待
 *
 * v3 變更：改用「成交資料池」（data/area-deals/，見 scripts/lib/deal-pool.js）
 * - 下載到的紀錄凡是落在四大生活圈範圍內，一律先存進池子，不再用社區設定當過濾條件
 * - 社區成交與生活圈行情都改成從池子撈，不再直接讀當次下載的檔案
 * - 為什麼：內政部的十天檔只保留最近一批公告，過期就下架。原本的做法等於
 *   「當下沒設定到的社區，那段成交永久遺失」——新增社區時補不回歷史。
 *   改成先存後撈之後，社區設定變成查詢條件，改門牌、加社區都只是重撈一次。
 *
 * v4 變更：下載來源改為「本期十天檔 + 內政部提供的全部非本期批次（約七期）」
 * - 不再每次下載季檔。池子已經保存全部歷史，季檔給不了新東西，
 *   每次多抓四個 14 MB 的檔案只是浪費時間；季檔留給一次性回補。
 * - 非本期批次是關鍵：內政部查詢網站看得到、但季檔裡還沒有的那段成交，
 *   就在這七期裡（網址 DownloadHistory?type=history&fileName=<發布日期>）。
 *   原本資料會缺一塊，正是因為只抓本期與季檔，中間那幾批從來沒被抓過。
 * - 期別清單從網站讀出來，不寫死，內政部換期會自動跟上。
 *
 * 執行方式： node scripts/fetch-market-data.js
 * 由 .github/workflows/update-market-data.yml 每日排程呼叫。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mergeIntoPool, loadPool } from "./lib/deal-pool.js";
import { shopUse, fixShopTags } from "./lib/shop-use.js";
import {
  CURRENT_URL, historyUrl, seasonUrl, seasonCode,
  listHistoryPeriods, downloadAndExtract as dl, readAll, dateRange,
} from "./lib/moi-download.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-lvr");
const AREAS_CONFIG = JSON.parse(readFileSync(path.join(ROOT, "config/areas.json"), "utf-8"));
const OUTPUT_PATH = path.join(ROOT, "data/market-data.json");
const COMMUNITY_CONFIG = path.join(ROOT, "data/communities.json");
const COMMUNITY_OUTPUT = path.join(ROOT, "data/community-deals.json");

/* 下載網址與 CSV 讀取都移到 scripts/lib/moi-download.js，
   回補腳本與這一支共用同一份，不再各寫一次。 */

const M2_TO_PING = 0.3025; // 平方公尺 轉 坪

/* 判斷門牌是否落在指定路名的號碼範圍內。
   成屋社區常有多個門牌（分棟或跨路），逐一列舉容易漏抓，用範圍比較保險。
   例如 { road: "美術東四路", from: 289, to: 320 } */
function inAddressRange(normAddr, ranges) {
  if (!ranges?.length) return false;
  for (const r of ranges) {
    const road = normalize(r.road || "");
    if (!road || !normAddr.includes(road)) continue;
    const after = normAddr.split(road)[1] || "";
    const m = after.match(/^(\d+)/);
    if (!m) continue;
    const no = parseInt(m[1], 10);
    if (no < (r.from ?? -Infinity) || no > (r.to ?? Infinity)) continue;
    /* parity：odd 只取單號、even 只取雙號，不填則不限。
       台灣門牌單雙號分列道路兩側，不區分會抓到對街的社區。 */
    if (r.parity === "odd" && no % 2 === 0) continue;
    if (r.parity === "even" && no % 2 === 1) continue;
    return true;
  }
  return false;
}

/* 實價登錄的門牌使用全形數字（例如 美術東四路６９８號），
   比對前統一轉成半形，否則關鍵字永遠對不上。 */
function normalize(str) {
  return String(str || "")
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "");
}

/* 屋齡＝交易年 − 建築完成年（民國年）。
   建築完成年月空白時回傳 null，代表無法判斷。 */
function ageYears(r) {
  const built = String(r["建築完成年月"] || "").trim();
  const deal = String(r["交易年月日"] || "").trim();
  if (built.length < 6 || deal.length < 6) return null;
  const by = parseInt(built.slice(0, built.length - 4), 10);
  const dy = parseInt(deal.slice(0, deal.length - 4), 10);
  if (!by || !dy || by < 1 || dy < by) return null;
  return dy - by;
}

/* 關於單價：直接使用內政部的「單價元平方公尺」，不要自己扣車位。
   一度以為這個欄位含車位需要自己扣，實測證明不用——
   例：美術東四路43號，總價 2,058 萬、建物 150.46 ㎡、車位價 270 萬、車位 33.1 ㎡
       不扣車位：2058 ÷ 150.46 = 45.2 萬/坪
       扣掉車位：(2058-270) ÷ (150.46-33.1) = 50.4 萬/坪  ← 內政部給的就是這個
   內政部在「車位總價元」有揭露時已經先扣過，重複扣會高估。
   車位價未揭露（為 0）時內政部無從扣起，那類紀錄單價本來就偏低，屬於資料限制。 */

/* 同一棟的門牌：取到「號」為止，樓層與「之N」都算同一棟。
   例：高雄市三民區德旺街192號十五樓之3 → 高雄市三民區德旺街192號 */
function doorKey(addr) {
  const s = normalize(addr);
  const m = s.match(/^(.*?\d+號)/);
  return m ? m[1] : s;
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/* ---------- 依生活圈設定篩選 + 計算單價平均（萬元/坪） ----------
   typeGroup 指定建物型態群組（電梯住宅／透天），不給就不限型態。 */
function computeAreaAverage(records, area, typeGroup) {
  /* keywords：整條路都屬於這個生活圈，巷弄自動涵蓋
     roadRanges：只有某一段屬於，用號碼範圍與單雙號界定 */
  const normKeywords = (area.keywords || []).map(normalize);
  const ranges = area.roadRanges || [];

  const matched = records.filter(r => {
    const district = r["鄉鎮市區"] || "";
    const address = normalize(r["土地位置建物門牌"]);
    const type = r["建物型態"] || "";

    /* keywords 用生活圈本身的行政區。
       roadRanges 可以各自指定 district——有些路的單雙號分屬不同行政區，
       例如明誠三路雙號在鼓山區，卻屬於瑞豐巨蛋（左營區）生活圈。 */
    const byKeyword = district.includes(area.district)
      && normKeywords.some(k => address.includes(k));
    const byRange = ranges.some(rg =>
      district.includes(rg.district || area.district) && inAddressRange(address, [rg]));
    if (!byKeyword && !byRange) return false;
    if (typeGroup && !typeGroup.match.some(k => type.includes(k))) return false;

    /* 排除非住宅用途。大樓一樓的店面「建物型態」一樣是住宅大樓，
       只有「主要用途」分得出來，不排除的話店面的高單價會混進住宅行情。
       主要用途空白時不排除——實價登錄常有空值，全濾掉會損失太多樣本。 */
    const use = (r["主要用途"] || "").trim();
    if (use && (AREAS_CONFIG.excludeUses || []).some(k => use.includes(k))) return false;

    /* 屋齡上限：既然對外宣告「N 年內」，屋齡不明的就不能混進來 */
    const maxAge = typeGroup?.maxAgeYears ?? AREAS_CONFIG.maxAgeYears;
    if (maxAge != null) {
      const age = ageYears(r);
      if (age === null || age > maxAge) return false;
    }

    const unitPrice = parseFloat(r["單價元平方公尺"]);
    return unitPrice > 0;
  });

  if (matched.length === 0) {
    return { sampleSize: 0, buildingSize: 0, avgPricePerPing: null, bandLow: null, bandHigh: null, medianTotalPrice: null };
  }

  /* 第一層保護：單價明顯不合理的直接剔除。
     透天的總價含土地、坪數只算建物，大基地小建物的案子單價會暴衝到數百萬，
     那不是行情而是資料特性造成的假象，必須先擋掉。 */
  const SR = AREAS_CONFIG.sanityRange || {};
  const minY = (SR.minWanPerPing ?? 0) * 10000;
  const maxY = (SR.maxWanPerPing ?? Infinity) * 10000;

  const valid = matched.filter(r => {
    const v = parseFloat(r["單價元平方公尺"]) / M2_TO_PING;
    return v >= minY && v <= maxY;
  });

  if (valid.length === 0) {
    return { sampleSize: 0, buildingSize: 0, avgPricePerPing: null, bandLow: null, bandHigh: null, medianTotalPrice: null };
  }

  /* 代表值以「每一筆成交」為單位計算——這代表「現在實際在成交的房子，
     大約多少錢一坪」，貼近買方看到的行情。
     曾經改成以「棟」為單位（每棟先取中位數再平均各棟），那個數字代表的是
     「這一區典型的一棟社區」，會低於實際成交行情，最後沒有採用。
     副作用是新建案完銷時大量同價成交會把數字帶高，所以另外提供棟數，
     讓讀者看得出樣本是分散在很多社區，還是集中在少數幾棟。 */
  const all = valid
    .map(r => parseFloat(r["單價元平方公尺"]) / M2_TO_PING)
    .sort((a, b) => a - b);

  /* 剔除頭尾極端值。10 筆以上剔各 10%；5～9 筆剔掉頭尾各 1 筆——
     小樣本反而更禁不起一個離群值。 */
  const cut = all.length >= 10 ? Math.floor(all.length * 0.1) : (all.length >= 5 ? 1 : 0);
  const prices = cut > 0 ? all.slice(cut, all.length - cut) : all;

  const mean = prices.reduce((s, v) => s + v, 0) / prices.length;

  // 取 25%～75% 百分位當作「常見成交價格帶」
  const pct = (p) => prices[Math.min(prices.length - 1, Math.floor(prices.length * p))];
  const toWan = (v) => Math.round(v / 10000);

  /* 總價中位數：單價接近的兩區，總價門檻可能差很多——
     中都的坪數普遍小於美術館，單價相近但總價低一截，這一項才看得出來。
     總價含車位（買方實際付的金額），用中位數避免少數豪宅拉高。 */
  const totals = valid
    .map(r => parseFloat(r["總價元"]))
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const medianTotalPrice = totals.length ? Math.round(median(totals) / 10000) : null;

  /* 棟數：同一門牌（取到「號」為止）算一棟，用來標示樣本的分散程度 */
  const buildingSize = new Set(valid.map(r => doorKey(r["土地位置建物門牌"]))).size;

  return {
    sampleSize: all.length,          // 成交筆數（已扣掉單價不合理的）
    buildingSize,                    // 這些成交分布在幾個門牌
    rawSize: matched.length,         // 篩選條件命中的原始筆數
    trimmedSize: prices.length,      // 實際用來計算的筆數
    avgPricePerPing: Math.round(mean / 1000) / 10, // 修剪後平均，萬元/坪
    bandLow: toWan(pct(0.25)),
    bandHigh: toWan(pct(0.75)),
    medianTotalPrice,                // 總價中位數，萬元
  };
}

/* ---------- 依社區地址關鍵字，抓出每一筆成交紀錄 ---------- */

/* collectCommunityDeals 讀進來的社區設定，供 pruneStale 重用 */
let COMMUNITY_LIST = [];

/**
 * 一筆「已經存在 community-deals.json 裡的成交」現在還屬不屬於這個社區。
 *
 * 為什麼需要這個：合併是累積的（回補來的歷史不能被沖掉），
 * 但社區的門牌範圍會修正。範圍改了之後，舊設定抓進來的成交不會自己消失，
 * 於是同一筆成交可能同時留在兩個社區裡——例如印象巴黎的門牌修正成
 * 430-458 雙號之後，先前抓到的 451、457 等單號仍留著，而那些其實是京城莫札特的。
 *
 * 判定方式與當初擷取時完全一樣：門牌關鍵字、門牌範圍、建案名稱三者有一個命中就保留。
 * 三種比對條件都沒設的社區不動它（沒有依據可以判斷）。
 * 沒有門牌也沒有建案名稱的紀錄一律保留，寧可多留也不要誤刪。
 */
function stillBelongs(deal, c) {
  const keys = (c.addressKeywords || []).map(normalize);
  const projects = (c.projectNames || []).map(normalize);
  const ranges = c.addressRanges || [];
  if (!keys.length && !projects.length && !ranges.length) return true;

  const address = normalize(deal.addr || "");
  const project = normalize(deal.project || "");
  if (!address && !project) return true;

  if (keys.length && keys.some(k => address.includes(k))) return true;
  if (ranges.length && inAddressRange(address, ranges)) return true;
  if (projects.length && project && projects.some(k => project.includes(k))) return true;
  return false;
}


function collectCommunityDeals(records) {
  let config;
  try {
    config = JSON.parse(readFileSync(COMMUNITY_CONFIG, "utf-8"));
  } catch {
    console.warn("[提示] 沒有 data/communities.json，略過社區成交紀錄");
    return null;
  }

  const result = {};
  COMMUNITY_LIST = config.communities || [];
  (config.communities || []).forEach(c => {
    const keys = c.addressKeywords || [];
    if (!keys.length && !(c.projectNames || []).length && !(c.addressRanges || []).length) { result[c.slug] = []; return; }

    const normKeys = keys.map(normalize);
    /* 預售屋尚未編門牌時，改用「建案名稱」比對。預售屋資料（_b 檔）有這個欄位。 */
    const normProjects = (c.projectNames || []).map(normalize);

    const matched = records.filter(r => {
      const district = r["鄉鎮市區"] || "";
      if (c.district && !district.includes(c.district)) return false;
      if (!(parseFloat(r["單價元平方公尺"]) > 0)) return false;

      /* 排除已解約的紀錄：那不是真實成交，價格不能拿來參考 */
      if ((r["解約情形"] || "").trim()) return false;

      const address = normalize(r["土地位置建物門牌"]);
      const project = normalize(r["建案名稱"] || "");

      const byAddress = normKeys.length > 0 && normKeys.some(k => address.includes(k));
      const byRange = inAddressRange(address, c.addressRanges);
      const byProject = normProjects.length > 0 && normProjects.some(k => project.includes(k));
      return byAddress || byRange || byProject;
    });

    const deals = matched.map(r => {
      const unitM2 = parseFloat(r["單價元平方公尺"]);
      const areaM2 = parseFloat(r["建物移轉總面積平方公尺"]) || 0;
      const rooms = r["建物現況格局-房"] || "";
      const halls = r["建物現況格局-廳"] || "";
      const baths = r["建物現況格局-衛"] || "";
      return {
        date: rocToDate(r["交易年月日"]),
        floor: (r["移轉層次"] || "").trim(),
        totalFloor: (r["總樓層數"] || "").trim(),
        ping: Math.round(areaM2 * PING_PER_M2 * 100) / 100,
        unitPrice: Math.round((unitM2 / M2_TO_PING) / 1000) / 10,   // 萬元/坪
        totalPrice: Math.round((parseFloat(r["總價元"]) || 0) / 10000),  // 萬元
        layout: rooms ? `${rooms}房${halls ? halls + "廳" : ""}${baths ? baths + "衛" : ""}` : "",
        parking: (r["車位類別"] || "").trim(),
        kind: r.__presale ? "預售" : "成屋",
    /* 店面判定見 lib/shop-use.js：主要用途符合「且」移轉層次在一樓才算。
       社區頁逐筆列出時保留店面成交（對想買店面的人有價值），但標示清楚，
       且不納入上方的單價範圍統計，避免被誤讀成住家行情。 */
        use: shopUse(r),
        addr: (r["土地位置建物門牌"] || "").trim(),
        project: (r["建案名稱"] || "").trim(),
        unit: (r["棟及號"] || "").trim(),
        note: (r["備註"] || "").trim().slice(0, 40),
      };
    }).filter(d => d.date && d.unitPrice > 0);

    /* 去重：不同批次資料若有重疊，同一筆交易可能出現兩次 */
    const seen = new Set();
    const unique = deals.filter(d => {
      const key = `${d.date}|${d.floor}|${d.ping}|${d.totalPrice}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    deals.length = 0;
    deals.push(...unique);

    /* 新到舊 */
    deals.sort((a, b) => b.date.localeCompare(a.date));
    result[c.slug] = deals;
    console.log(`[社區] ${c.name}：${deals.length} 筆成交`);

    /* 抓不到時列出同路段的門牌樣本，方便判斷關鍵字要怎麼調 */
    if (deals.length === 0) {
      /* 從所有關鍵字裡取出不重複的路名，每條路各列樣本 */
      /* 預售屋：列出同行政區的建案名稱，方便找出正確寫法 */
      const allProjects = [...new Set(records
        .filter(r => (r["建案名稱"] || "").trim())
        .map(r => `${(r["鄉鎮市區"] || "").trim()}｜${r["建案名稱"].trim()}`))].sort();

      const inDistrict = allProjects.filter(n => n.startsWith(c.district || ""));
      console.log(`  ↳ 全部資料中含「建案名稱」的紀錄共 ${allProjects.length} 種`);

      if (inDistrict.length) {
        console.log(`  ↳ ${c.district} 的預售建案名稱共 ${inDistrict.length} 個：`);
        inDistrict.slice(0, 80).forEach(n => console.log(`       ${n}`));
      } else if (allProjects.length) {
        console.log(`  ↳ ${c.district} 沒有預售建案紀錄。以下列出前 40 個當參考（確認欄位有讀到）：`);
        allProjects.slice(0, 40).forEach(n => console.log(`       ${n}`));
      } else {
        console.log(`  ↳ 完全沒有讀到「建案名稱」欄位。可能原因：`);
        console.log(`       1. 下載的 zip 裡沒有預售屋檔案（_lvr_land_b.csv）`);
        console.log(`       2. 預售屋檔案的欄位名稱不是「建案名稱」`);
      }

      const roads = [...new Set([
        ...normKeys.map(k => k.replace(/[0-9]+.*$/, "")),
        ...(c.addressRanges || []).map(r => normalize(r.road || "")),
      ].filter(Boolean))];
      if (roads.length) console.log(`  ↳ 以下列出實價登錄上這幾條路的實際門牌，供調整範圍：`);
      roads.forEach(road => {
        const sample = [...new Set(records
          .filter(r => normalize(r["土地位置建物門牌"]).includes(road))
          .map(r => r["土地位置建物門牌"]))]
          .sort()
          .slice(0, 25);
        console.log(`     【${road}】共 ${sample.length} 種門牌（最多列 25 筆）`);
        sample.forEach(a => console.log(`       ${a}`));
        if (!sample.length) console.log(`       （近四季沒有這條路的交易紀錄）`);
      });
    }
  });

  return { updatedAt: new Date().toISOString(), deals: result };
}

/* 合併兩批成交紀錄，去重後依日期新到舊排序 */
export function mergeDeals(oldList, newList) {
  const key = d => `${d.date}|${d.floor}|${d.ping}|${d.totalPrice}|${d.project || ""}`;
  const map = new Map();
  [...oldList, ...newList].forEach(d => { if (d?.date) map.set(key(d), d); });
  return [...map.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    /* 每個社區最多保留 600 筆。社區頁預設只顯示最近 100 筆，
       其餘收在展開區塊裡（見 build-communities.js 的 DEAL_CAP／SHOW）。
       改這個數字時，build-communities.js 的 DEAL_CAP 要一起改，
       否則頁面上的「僅收錄最近 N 筆」會寫錯。 */
    .slice(0, 600);
}

/* 民國年月日（如 1140312）轉西元 YYYY-MM-DD */
function rocToDate(v) {
  const s = String(v || "").trim();
  if (s.length < 6) return "";
  const y = parseInt(s.slice(0, s.length - 4), 10) + 1911;
  const m = s.slice(-4, -2);
  const d = s.slice(-2);
  if (!y || m === "00" || d === "00") return "";
  return `${y}-${m}-${d}`;
}

/* 「N 個月前」的民國年月日（如 1150915），用來切時間窗。
   實價登錄的交易年月日就是這個格式的純數字，轉成整數比大小即可，
   不必轉成 Date，也就不會有時區問題。 */
function rocCutoffMonthsAgo(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  const y = d.getFullYear() - 1911;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${day}`, 10);
}

const PING_PER_M2 = 0.3025;

async function main() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  /* ---------- 下載 ----------
     抓「本期十天檔 + 內政部目前提供的全部非本期批次（約七期）」。
     這樣一次涵蓋近三個月的所有公告，就算連續幾次排程失敗也不會漏掉任何一批。

     為什麼不再每次都抓季檔：資料池已經保存了所有歷史，季檔提供不了新東西，
     每次多抓四個 14 MB 的檔案只是浪費時間。季檔留給一次性的長期回補
     （scripts/backfill-area-pool.js）。
     例外是池子還沒建立的時候——那時沒有歷史可用，就退回抓上一季墊底，
     這一版剛上線、還沒跑過回補時就是走這條路。 */
  const poolBefore = loadPool();
  const jobs = [];
  const periods = listHistoryPeriods(TMP);
  console.log(`[下載] 非本期批次：${periods.length ? periods.join("、") : "（清單讀不到）"}`);
  periods.forEach(p => jobs.push({ label: `非本期 ${p}`, url: historyUrl(p), key: `h${p}` }));
  jobs.push({ label: "本期十天檔", url: CURRENT_URL, key: "current" });

  if (poolBefore.length < 500) {
    console.log(`[下載] 資料池只有 ${poolBefore.length} 筆，先補抓上一季季檔墊底`);
    console.log(`       （正常情況請改跑「回補生活圈成交資料池」，一次補齊長期歷史）`);
    const s = seasonCode(1);
    jobs.unshift({ label: `季檔 ${s}`, url: seasonUrl(s), key: `s${s}` });
  }

  /* 逐檔下載 → 立刻併進資料池 → 丟掉解壓目錄與紀錄。
     八個檔案加起來三十幾萬筆，全部堆在記憶體裡沒有必要也不安全
     （之前的診斷腳本就是這樣把 Node 的堆積撐爆的）。 */
  let downloadedCount = 0, fileCount = 0, addedTotal = 0;
  for (const job of jobs) {
    process.stdout.write(`[下載] ${job.label} … `);
    const dir = dl(job.url, job.key, TMP);
    if (!dir) { console.log("略過"); continue; }
    const recs = readAll(dir);   // 全台；生活圈的篩選交給資料池
    const range = dateRange(recs);
    downloadedCount += recs.length;
    fileCount++;

    const { added } = mergeIntoPool(recs, AREAS_CONFIG);
    const sum = Object.values(added).reduce((a, b) => a + b, 0);
    addedTotal += sum;
    console.log(`${recs.length} 筆` + (range ? `（交易日 ${range[0]} ～ ${range[1]}）` : "") +
      `，池中新增 ${sum} 筆`);

    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`[下載] 成功讀取 ${fileCount} 個檔案、共 ${downloadedCount} 筆（全台，含預售）`);

  /* ---------- 保護機制 ----------
     這裡要分清楚兩件事：
       (1) 下載失敗 —— 內政部連不上或擋流量。這不致命：資料池裡已經有東西，
           照樣可以重算行情與社區成交，只是這一輪沒有新資料而已。
       (2) 資料池是空的 —— 那才真的不能算，硬算會把網站上正確的數字洗成空白。
     舊版把兩者混為一談，只要下載失敗就整個中止，結果是「池子明明已經補好了，
     社區頁卻永遠更新不了」。現在只有第 (2) 種情況才中止。 */
  const MIN_RECORDS = 5000;
  if (downloadedCount < MIN_RECORDS) {
    console.warn(
      `[警告] 這次只下載到 ${downloadedCount} 筆（預期至少 ${MIN_RECORDS} 筆），` +
      `研判內政部暫時無法連線或擋了流量。`
    );
    console.warn(`       這一輪沒有新資料，但仍會用資料池裡既有的內容重算行情與社區成交。`);
  }

  const pool = loadPool();
  const poolRange = dateRange(pool);
  console.log(`[資料池] 共 ${pool.length} 筆（這次新增 ${addedTotal} 筆）` +
    (poolRange ? `，交易日 ${poolRange[0]} ～ ${poolRange[1]}` : ""));
  if (pool.length < 100) {
    console.error(`[中止] 資料池裡幾乎沒有東西，可能是第一次執行或設定有誤。`);
    console.error(`       請先跑「回補生活圈成交資料池」，再跑這一支。`);
    process.exit(1);
  }

  /* 生活圈行情用「近四季（約一年）的成屋」計算。
     池子裡是全部歷史，所以這裡要自己把時間窗切出來，
     否則首頁的數字會隨著池子愈積愈久而慢慢變成「十年平均」。 */
  const cutoff = rocCutoffMonthsAgo(12);
  const recentRecords = pool.filter(r => {
    if (r.__presale) return false;
    const d = parseInt(String(r["交易年月日"] || "").trim(), 10);
    return d >= cutoff;
  });
  console.log(`[生活圈] 近四季成屋共 ${recentRecords.length} 筆可供比對（交易日 ${cutoff} 之後）`);

  /* 走勢改為不計算：可比較的區間要再往前四季，得多下載四個大檔，
     而網站本來就不顯示漲跌幅，成本不值得。 */
  const trendRecords = [];

  /* 社區成交改成從池子撈，時間窗不設限——社區頁本來就該列出完整的成交歷史。
     含預售屋：新建案的交易多半登錄在預售檔，少了它剛交屋的社區頁會是空的。 */
  const communityRecords = pool;
  const presaleCount = communityRecords.filter(r => r.__presale).length;
  console.log(`[社區] 可比對紀錄共 ${communityRecords.length} 筆（成屋 ${communityRecords.length - presaleCount} 筆、預售 ${presaleCount} 筆，全部歷史）`);

  const TYPES = AREAS_CONFIG.propertyTypes || [];

  const areas = AREAS_CONFIG.areas.map(area => {
    /* 每個建物型態群組各算一組數字。
       電梯住宅與透天的單價意義不同（透天總價含土地、坪數只算建物），
       混在一起平均對兩者都不準，所以分開統計、分開顯示。 */
    const byType = TYPES.map(t => {
      const cur = computeAreaAverage(recentRecords, area, t);
      const past = trendRecords.length
        ? computeAreaAverage(trendRecords, area, t) : { avgPricePerPing: null };
      let trendPct = null;
      if (cur.avgPricePerPing && past.avgPricePerPing) {
        trendPct = Math.round(((cur.avgPricePerPing - past.avgPricePerPing) / past.avgPricePerPing) * 1000) / 10;
      }
      return {
        key: t.key,
        label: t.label,
        avgPricePerPing: cur.avgPricePerPing,
        bandLow: cur.bandLow,
        bandHigh: cur.bandHigh,
        sampleSize: cur.sampleSize,
        buildingSize: cur.buildingSize ?? 0,
        medianTotalPrice: cur.medianTotalPrice ?? null,
        lowSample: cur.sampleSize > 0 && cur.sampleSize < 5,
        trendPct,
      };
    });

    const main = byType[0] || {};
    return {
      code: area.code,
      name: area.name,
      types: byType,
      /* 以下沿用原欄位名，指向第一組（電梯住宅），
         讓舊的前端程式與既有資料格式不會壞掉 */
      avgPricePerPing: main.avgPricePerPing ?? null,
      bandLow: main.bandLow ?? null,
      bandHigh: main.bandHigh ?? null,
      sampleSize: main.sampleSize ?? 0,
      buildingSize: main.buildingSize ?? 0,
      medianTotalPrice: main.medianTotalPrice ?? null,
      lowSample: (main.sampleSize ?? 0) < 5,
      trendPct: main.trendPct ?? null,
    };
  });

  const output = {
    updatedAt: new Date().toISOString(),
    sourceNote: "資料來源：內政部不動產交易實價查詢服務網（每月1、11、21日批次公告，非逐日即時資料）。單價為近四季（約一年）成屋成交的平均價，已先剔除頭尾各一成極端值與單價明顯異常者再平均，常見單價區間為去掉最高與最低各四分之一後的範圍；另標示這些成交分布的門牌數，以及排序後正中間那一筆的成交總價（含車位）。電梯住宅與透天分開統計，不限屋齡。",
    areas,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log("[完成] 已寫入", OUTPUT_PATH);

  /* 社區成交紀錄：用同一份下載資料，不重複抓 */
  const community = collectCommunityDeals(communityRecords);
  if (community) {
    /* 與既有紀錄合併，而不是覆蓋。
       這樣一次性回補的歷史資料會被保留，每日更新只是往上疊加新成交。 */
    let previous = null;
    try { previous = JSON.parse(readFileSync(COMMUNITY_OUTPUT, "utf-8")); } catch {}

    if (previous?.deals) {
      const allSlugs = new Set([...Object.keys(previous.deals), ...Object.keys(community.deals)]);
      allSlugs.forEach(slug => {
        const merged = mergeDeals(previous.deals[slug] || [], community.deals[slug] || []);
        const added = merged.length - (previous.deals[slug] || []).length;
        community.deals[slug] = merged;
        if (added > 0) console.log(`[社區] ${slug}：新增 ${added} 筆，累計 ${merged.length} 筆`);
        else console.log(`[社區] ${slug}：無新增，維持 ${merged.length} 筆`);
      });
    }
    /* 舊資料修正：門牌範圍修正前抓進來、現在已經不屬於這個社區的成交，清掉。
       不這樣做的話，同一筆成交會同時留在兩個社區裡。 */
    let dropped = 0;
    COMMUNITY_LIST.forEach(c => {
      const list = community.deals[c.slug];
      if (!list) return;
      const kept = list.filter(d => stillBelongs(d, c));
      if (kept.length !== list.length) {
        console.log(`[社區] ${c.slug}：移除 ${list.length - kept.length} 筆已不屬於本社區的舊紀錄`);
        dropped += list.length - kept.length;
        community.deals[c.slug] = kept;
      }
    });
    if (dropped) console.log(`[社區] 共移除 ${dropped} 筆門牌範圍修正前的舊紀錄`);

    /* 舊資料修正：二樓以上曾被誤標成店面，一併清掉（跑過一次就全部歸位） */
    let fixedShop = 0;
    Object.values(community.deals).forEach(list => { fixedShop += fixShopTags(list); });
    if (fixedShop) console.log(`[社區] 修正 ${fixedShop} 筆誤標為店面的成交（非一樓）`);

    writeFileSync(COMMUNITY_OUTPUT, JSON.stringify(community, null, 2) + "\n", "utf-8");
    console.log("[完成] 已寫入", COMMUNITY_OUTPUT);
  }

  rmSync(TMP, { recursive: true, force: true });
}

main().catch(err => {
  console.error("[失敗]", err);
  process.exit(1);
});
