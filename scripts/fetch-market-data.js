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

const CURRENT_ZIP_URL = "https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip";
const SEASON_ZIP_URL = (season) =>
  `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;

const M2_TO_PING = 0.3025; // 平方公尺 轉 坪

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
function downloadAndExtract(url, label) {
  const zipPath = path.join(TMP, `${label}.zip`);
  const extractDir = path.join(TMP, label);
  mkdirSync(extractDir, { recursive: true });
  console.log(`[下載] ${label}: ${url}`);
  try {
    execSync(`curl -L -f -s -o "${zipPath}" "${url}"`, { stdio: "inherit" });
    execSync(`unzip -o -q "${zipPath}" -d "${extractDir}"`);
    return extractDir;
  } catch (e) {
    console.warn(`[警告] ${label} 下載或解壓失敗，這段資料先跳過：`, e.message);
    return null;
  }
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
  const matched = records.filter(r => {
    const district = r["鄉鎮市區"] || "";
    const address = r["土地位置建物門牌"] || "";
    const type = r["建物型態"] || "";
    if (!district.includes(area.district)) return false;
    if (!area.keywords.some(k => address.includes(k))) return false;
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
  try {
    const trendDir1 = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(6)), "trend1");
    const trendDir2 = downloadAndExtract(SEASON_ZIP_URL(seasonCodeMonthsAgo(9)), "trend2");
    trendRecords = [
      ...readAllMainCsv(trendDir1),
      ...readAllMainCsv(trendDir2),
    ];
  } catch (e) {
    console.warn("[警告] 走勢比較資料下載失敗，本次先不計算走勢：", e.message);
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

  rmSync(TMP, { recursive: true, force: true });
}

main().catch(err => {
  console.error("[失敗]", err);
  process.exit(1);
});
