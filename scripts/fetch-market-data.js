/**
 * 澄果團隊｜四大生活圈行情自動更新腳本（v2）
 * ------------------------------------------------
 * 資料來源：內政部不動產交易實價查詢服務網（plvr.land.moi.gov.tw）
 * 官方資料本身「每月 1、11、21 日」批次公告，不是逐日更新。
 * 本腳本設計為「每日執行、有新一期資料才會變動結果」。
 *
 * v2 變更：
 * - 生活圈行情用「近四季（約一年）」的成屋資料計算單價平均
 * - 「最新即時檔」只有十天份，不能當一整季看待
 *
 * 執行方式： node scripts/fetch-market-data.js
 * 由 .github/workflows/update-market-data.yml 每日排程呼叫。
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-lvr");
const AREAS_CONFIG = JSON.parse(readFileSync(path.join(ROOT, "config/areas.json"), "utf-8"));
const OUTPUT_PATH = path.join(ROOT, "data/market-data.json");
const COMMUNITY_CONFIG = path.join(ROOT, "data/communities.json");
const COMMUNITY_OUTPUT = path.join(ROOT, "data/community-deals.json");

const CURRENT_ZIP_URL = "https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip";
const SEASON_ZIP_URL = (season) =>
  `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;

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

/* ---------- 工具：計算「N 個月前」對應的季別代碼（民國年+S+季） ---------- */
function seasonCodeMonthsAgo(monthsAgo) {
  const now = new Date();
  let rocYear = now.getFullYear() - 1911;
  let quarter = Math.ceil((now.getMonth() + 1) / 3);
  let quartersBack = Math.round(monthsAgo / 3);
  quarter -= quartersBack;
  while (quarter <= 0) {
    quarter += 4;
    rocYear -= 1;
  }
  return `${rocYear}S${quarter}`;
}

/* ---------- 下載並解壓 ---------- */
function sleep(sec) {
  /* 同步等待，避免對內政部的伺服器造成連續請求 */
  execSync(`sleep ${sec}`);
}

function downloadAndExtract(url, label, retries = 3) {
  const zipPath = path.join(TMP, `${label}.zip`);
  const extractDir = path.join(TMP, label);
  mkdirSync(extractDir, { recursive: true });

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[下載] ${label}${attempt > 1 ? `（第 ${attempt} 次嘗試）` : ""}: ${url}`);
    try {
      /* 加上 User-Agent 與逾時，並在重試之間等待，降低被視為異常流量的機會 */
      execSync(
        `curl -L -f -s --connect-timeout 30 --max-time 300 ` +
        `-A "Mozilla/5.0 (compatible; chengguo-site/1.0)" ` +
        `-o "${zipPath}" "${url}"`,
        { stdio: "inherit" }
      );
      execSync(`unzip -o -q "${zipPath}" -d "${extractDir}"`);
      return extractDir;
    } catch (e) {
      console.warn(`[警告] ${label} 第 ${attempt} 次下載失敗：${e.message}`);
      if (attempt < retries) {
        const wait = attempt * 20;
        console.log(`       ${wait} 秒後重試…`);
        sleep(wait);
      }
    }
  }
  console.warn(`[警告] ${label} 重試 ${retries} 次仍失敗，這段資料先跳過`);
  return null;
}

/* ---------- 簡易 CSV 解析（處理雙引號內含逗號的欄位） ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

/* ---------- 讀取某個解壓目錄下，所有「不動產買賣_a」主檔 ---------- */
function readAllMainCsv(extractDir) {
  if (!extractDir) return [];
  const files = readdirSync(extractDir).filter(f => /_lvr_land_a\.csv$/i.test(f));
  let records = [];
  for (const file of files) {
    const raw = readFileSync(path.join(extractDir, file), "utf-8");
    const rows = parseCSV(raw);
    if (rows.length < 3) continue;
    const header = rows[0]; // 中文欄名
    rows.slice(2).forEach(r => { // 第2行是英文欄名，資料從第3行開始
      const record = {};
      header.forEach((h, idx) => { record[h.trim()] = r[idx]; });
      records.push(record);
    });
  }
  return records;
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

  if (matched.length === 0) return { sampleSize: 0, avgPricePerPing: null, bandLow: null, bandHigh: null };

  /* 第一層保護：單價明顯不合理的直接剔除。
     透天的總價含土地、坪數只算建物，大基地小建物的案子單價會暴衝到數百萬，
     那不是行情而是資料特性造成的假象，必須先擋掉。 */
  const SR = AREAS_CONFIG.sanityRange || {};
  const minY = (SR.minWanPerPing ?? 0) * 10000;
  const maxY = (SR.maxWanPerPing ?? Infinity) * 10000;

  const all = matched
    .map(r => parseFloat(r["單價元平方公尺"]) / M2_TO_PING)
    .filter(v => v >= minY && v <= maxY)
    .sort((a, b) => a - b);

  if (all.length === 0) return { sampleSize: 0, avgPricePerPing: null, bandLow: null, bandHigh: null };

  /* 第二層保護：剔除頭尾極端值。
     10 筆以上剔各 10%；5～9 筆也要剔掉頭尾各 1 筆——
     小樣本反而更禁不起一個離群值，原本「不足10筆就不剔除」是錯的設計。 */
  const cut = all.length >= 10 ? Math.floor(all.length * 0.1) : (all.length >= 5 ? 1 : 0);
  const prices = cut > 0 ? all.slice(cut, all.length - cut) : all;

  /* 代表值用平均數，但是「修剪後的平均」——頭尾極端值已在上一步剔除，
     所以少數高價或低價案不會把數字帶偏，同時保留全部樣本的資訊。 */
  const mean = prices.reduce((s, v) => s + v, 0) / prices.length;

  // 取 25%～75% 百分位當作「常見成交價格帶」
  const pct = (p) => prices[Math.min(prices.length - 1, Math.floor(prices.length * p))];
  const toWan = (v) => Math.round(v / 10000);

  return {
    sampleSize: all.length,          // 已扣掉單價不合理的
    rawSize: matched.length,         // 篩選條件命中的原始筆數
    trimmedSize: prices.length,      // 實際用來計算的筆數
    avgPricePerPing: Math.round(mean / 1000) / 10, // 修剪後平均，萬元/坪
    bandLow: toWan(pct(0.25)),
    bandHigh: toWan(pct(0.75)),
  };
}

/* ---------- 讀取預售屋買賣（_b 檔），新建案的交易多在這裡 ---------- */
let presaleHeaderLogged = false;

function readAllPresaleCsv(extractDir) {
  if (!extractDir) return [];
  const files = readdirSync(extractDir).filter(f => /_lvr_land_b\.csv$/i.test(f));
  if (!files.length && !presaleHeaderLogged) {
    console.log("[預售] 這個壓縮檔裡沒有 _lvr_land_b.csv（預售屋買賣）");
    presaleHeaderLogged = true;
  }
  let records = [];
  for (const file of files) {
    const raw = readFileSync(path.join(extractDir, file), "utf-8");
    const rows = parseCSV(raw);
    if (rows.length < 3) continue;
    const header = rows[0];

    if (!presaleHeaderLogged) {
      console.log(`[預售] ${file} 的欄位（共 ${header.length} 個）：`);
      console.log(`       ${header.map(h => h.trim()).join(" / ")}`);
      presaleHeaderLogged = true;
    }

    rows.slice(2).forEach(r => {
      const rec = {};
      header.forEach((h, idx) => { rec[h.trim()] = r[idx]; });
      rec.__presale = true;
      records.push(rec);
    });
  }
  return records;
}

/* ---------- 依社區地址關鍵字，抓出每一筆成交紀錄 ---------- */
function collectCommunityDeals(records) {
  let config;
  try {
    config = JSON.parse(readFileSync(COMMUNITY_CONFIG, "utf-8"));
  } catch {
    console.warn("[提示] 沒有 data/communities.json，略過社區成交紀錄");
    return null;
  }

  const result = {};
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
    /* 大樓一樓的店面在「建物型態」上一樣是住宅大樓，只有「主要用途」看得出來。
       社區頁逐筆列出時保留店面成交（對想買店面的人有價值），但標示清楚，
       且不納入上方的單價範圍統計，避免被誤讀成住家行情。 */
    use: /商業|店鋪|店面/.test((r["主要用途"] || "").trim()) ? "店面" : "",
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
    .slice(0, 300);   // 每個社區最多保留 300 筆
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

const PING_PER_M2 = 0.3025;

async function main() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  /* 下載四期：最新即時檔 + 往前三季。
     注意「最新即時檔」只涵蓋最近一批公告（約十天），筆數很少，
     不能把它當成一整季看待。 */
  const currentDir = downloadAndExtract(CURRENT_ZIP_URL, "current");
  const prevSeasonDir = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(3)), "prev1");

  let trendDir1 = null, trendDir2 = null;
  try {
    trendDir1 = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(6)), "trend1");
    trendDir2 = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(9)), "trend2");
  } catch (e) {
    console.warn("[警告] 較早的季檔下載失敗，樣本會少一些：", e.message);
  }

  /* 生活圈行情用「近四季（約一年）」計算。
     原本只用 current + 上一季，但 current 只有十天份，
     實際等於單季樣本——美術館特區一度只有 104 筆，四個區有兩個不到 40 筆。
     四期資料本來就已經下載了（社區比對在用），拿來一起算不增加任何成本。
     代價是時間窗變長、短期波動被平滑，但樣本足夠比反應靈敏重要。 */
  const recentRecords = [
    ...readAllMainCsv(currentDir),
    ...readAllMainCsv(prevSeasonDir),
    ...readAllMainCsv(trendDir1),
    ...readAllMainCsv(trendDir2),
  ];
  console.log(`[生活圈] 近四季成屋共 ${recentRecords.length} 筆可供比對`);

  /* 走勢改為不計算：可比較的區間要再往前四季，得多下載四個大檔，
     而網站本來就不顯示漲跌幅，成本不值得。 */
  const trendRecords = [];

  // 社區成交：時間窗拉到近四季，且含預售屋（新建案的交易多在預售檔）
  const communityRecords = [
    ...readAllMainCsv(currentDir),    ...readAllPresaleCsv(currentDir),
    ...readAllMainCsv(prevSeasonDir), ...readAllPresaleCsv(prevSeasonDir),
    ...readAllMainCsv(trendDir1),     ...readAllPresaleCsv(trendDir1),
    ...readAllMainCsv(trendDir2),     ...readAllPresaleCsv(trendDir2),
  ];
  const presaleCount = communityRecords.filter(r => r.__presale).length;
  console.log(`[社區] 可比對紀錄共 ${communityRecords.length} 筆（成屋 ${communityRecords.length - presaleCount} 筆、預售 ${presaleCount} 筆，近四季）`);

  /* ---------- 保護機制 ----------
     下載失敗時 recentRecords 會是空的，若照常寫入會把網站上正確的行情清成空白。
     資料量明顯不足時直接中止，保留既有資料，等下次排程再試。 */
  const MIN_RECORDS = 5000;   // 全台一期實價登錄通常有數萬筆，低於此值視為下載不完整
  if (recentRecords.length < MIN_RECORDS) {
    console.error(
      `[中止] 只讀到 ${recentRecords.length} 筆資料（預期至少 ${MIN_RECORDS} 筆），` +
      `研判下載不完整或內政部暫時無法連線。`
    );
    console.error("[中止] 未寫入任何檔案，網站上的現有資料保持不變。稍後再執行一次即可。");
    process.exit(1);
  }

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
      lowSample: (main.sampleSize ?? 0) < 5,
      trendPct: main.trendPct ?? null,
    };
  });

  const output = {
    updatedAt: new Date().toISOString(),
    sourceNote: "資料來源：內政部不動產交易實價查詢服務網（每月1、11、21日批次公告，非逐日即時資料）。單價為近四季（約一年）成屋成交的平均價，已先剔除頭尾各一成極端值與單價明顯異常者再平均，價格帶取25%～75%百分位。電梯住宅與透天分開統計，不限屋齡。",
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
    writeFileSync(COMMUNITY_OUTPUT, JSON.stringify(community, null, 2) + "\n", "utf-8");
    console.log("[完成] 已寫入", COMMUNITY_OUTPUT);
  }

  rmSync(TMP, { recursive: true, force: true });
}

main().catch(err => {
  console.error("[失敗]", err);
  process.exit(1);
});
