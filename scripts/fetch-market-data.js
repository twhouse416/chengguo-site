/**
 * 澄果團隊｜四大生活圈行情自動更新腳本（v2）
 * ------------------------------------------------
 * 資料來源：內政部不動產交易實價查詢服務網（plvr.land.moi.gov.tw）
 * 官方資料本身「每月 1、11、21 日」批次公告，不是逐日更新。
 * 本腳本設計為「每日執行、有新一期資料才會變動結果」。
 *
 * v2 變更：
 * - 「本期均價」改成合併最近兩季（約近6個月）資料計算，避免單季樣本數太少
 * - 「走勢」改成比較「再往前兩季」（約6個月前的區間）
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

/* 實價登錄的門牌使用全形數字（例如 美術東四路６９８號），
   比對前統一轉成半形，否則關鍵字永遠對不上。 */
function normalize(str) {
  return String(str || "")
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "");
}

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

/* ---------- 依生活圈設定篩選 + 計算平均單價（萬元/坪） ---------- */
function computeAreaAverage(records, area) {
  const normKeywords = area.keywords.map(normalize);
  const matched = records.filter(r => {
    const district = r["鄉鎮市區"] || "";
    const address = normalize(r["土地位置建物門牌"]);
    const type = r["建物型態"] || "";
    if (!district.includes(area.district)) return false;
    if (!normKeywords.some(k => address.includes(k))) return false;
    if (AREAS_CONFIG.propertyTypeFilter && !type.includes(AREAS_CONFIG.propertyTypeFilter)) return false;
    const unitPrice = parseFloat(r["單價元平方公尺"]);
    return unitPrice > 0;
  });

  if (matched.length === 0) return { sampleSize: 0, avgPricePerPing: null, bandLow: null, bandHigh: null };

  const pricesPerPing = matched
    .map(r => parseFloat(r["單價元平方公尺"]) / M2_TO_PING)
    .sort((a, b) => a - b);
  const avg = pricesPerPing.reduce((a, b) => a + b, 0) / pricesPerPing.length;

  // 取 25%～75% 百分位當作「常見成交價格帶」，避免極端值拉走整體印象
  const pct = (p) => pricesPerPing[Math.min(pricesPerPing.length - 1, Math.floor(pricesPerPing.length * p))];
  const toWan = (v) => Math.round(v / 10000);

  return {
    sampleSize: matched.length,
    avgPricePerPing: Math.round(avg / 1000) / 10, // 換算成「萬元/坪」，取一位小數
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
    if (!keys.length && !(c.projectNames || []).length) { result[c.slug] = []; return; }

    const normKeys = keys.map(normalize);
    /* 預售屋尚未編門牌時，改用「建案名稱」比對。預售屋資料（_b 檔）有這個欄位。 */
    const normProjects = (c.projectNames || []).map(normalize);

    const matched = records.filter(r => {
      const district = r["鄉鎮市區"] || "";
      if (c.district && !district.includes(c.district)) return false;
      if (!(parseFloat(r["單價元平方公尺"]) > 0)) return false;

      const address = normalize(r["土地位置建物門牌"]);
      const project = normalize(r["建案名稱"] || "");

      const byAddress = normKeys.length > 0 && normKeys.some(k => address.includes(k));
      const byProject = normProjects.length > 0 && normProjects.some(k => project.includes(k));
      return byAddress || byProject;
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

      const roads = [...new Set(normKeys.map(k => k.replace(/[0-9]+.*$/, "")).filter(Boolean))];
      if (roads.length) console.log(`  ↳ 以下列出實價登錄上這幾條路的實際門牌，供調整關鍵字：`);
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

  // 近6個月窗口：本期 + 上一季
  const currentDir = downloadAndExtract(CURRENT_ZIP_URL, "current");
  const prevSeasonDir = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(3)), "prev1");
  const recentRecords = [
    ...readAllMainCsv(currentDir),
    ...readAllMainCsv(prevSeasonDir),
  ];

  // 6個月前窗口（拿來算走勢）：往前兩季 + 往前三季
  let trendRecords = [];
  let trendDir1 = null, trendDir2 = null;
  try {
    trendDir1 = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(6)), "trend1");
    trendDir2 = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(9)), "trend2");
    trendRecords = [
      ...readAllMainCsv(trendDir1),
      ...readAllMainCsv(trendDir2),
    ];
  } catch (e) {
    console.warn("[警告] 走勢比較資料下載失敗，本次先不計算走勢：", e.message);
  }

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

  const areas = AREAS_CONFIG.areas.map(area => {
    const current = computeAreaAverage(recentRecords, area);
    const past = trendRecords.length ? computeAreaAverage(trendRecords, area) : { avgPricePerPing: null };

    let trendPct = null;
    if (current.avgPricePerPing && past.avgPricePerPing) {
      trendPct = Math.round(((current.avgPricePerPing - past.avgPricePerPing) / past.avgPricePerPing) * 1000) / 10;
    }

    return {
      code: area.code,
      name: area.name,
      avgPricePerPing: current.avgPricePerPing,
      bandLow: current.bandLow,
      bandHigh: current.bandHigh,
      sampleSize: current.sampleSize,
      lowSample: current.sampleSize < 5,
      trendPct, // 保留供內部參考，網站不直接顯示漲跌幅
    };
  });

  const output = {
    updatedAt: new Date().toISOString(),
    sourceNote: "資料來源：內政部不動產交易實價查詢服務網（每月1、11、21日批次公告，非逐日即時資料）。均價與價格帶為近兩季（約6個月）成交合併計算，價格帶取25%～75%百分位。",
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
