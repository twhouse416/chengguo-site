/**
 * 澄果團隊｜四大生活圈行情自動更新腳本
 * ------------------------------------------------
 * 資料來源：內政部不動產交易實價查詢服務網（plvr.land.moi.gov.tw）
 * 官方資料本身「每月 1、11、21 日」批次公告，不是逐日更新。
 * 本腳本設計為「每日執行、有新一期資料才會變動結果」，
 * 而不是假裝每天都有新成交數字。
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

/* ---------- 工具：計算「N 季前」的季別代碼（民國年+S+季） ---------- */
function seasonCodeMonthsAgo(monthsAgo) {
  const now = new Date();
  const totalMonths = now.getFullYear() - 1911 * 0; // placeholder, 下面重算
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
  execSync(`curl -L -f -s -o "${zipPath}" "${url}"`, { stdio: "inherit" });
  execSync(`unzip -o -q "${zipPath}" -d "${extractDir}"`);
  return extractDir;
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

/* ---------- 依生活圈設定篩選 + 計算平均單價（元/坪） ---------- */
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

  if (matched.length === 0) return { sampleSize: 0, avgPricePerPing: null };

  const pricesPerPing = matched.map(r => parseFloat(r["單價元平方公尺"]) / M2_TO_PING);
  const avg = pricesPerPing.reduce((a, b) => a + b, 0) / pricesPerPing.length;
  return {
    sampleSize: matched.length,
    avgPricePerPing: Math.round(avg / 1000) / 10, // 換算成「萬元/坪」，取一位小數
  };
}

async function main() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  // 1. 本期資料
  const currentDir = downloadAndExtract(CURRENT_ZIP_URL, "current");
  const currentRecords = readAllMainCsv(currentDir);

  // 2. 半年前資料（用來算走勢），抓不到就略過走勢計算
  let trendRecords = [];
  try {
    const pastSeason = seasonCodeMonthsAgo(6);
    const pastDir = downloadAndExtract(SEASON_ZIP_URL(pastSeason), "past");
    trendRecords = readAllMainCsv(pastDir);
  } catch (e) {
    console.warn("[警告] 半年前資料下載失敗，本次先不計算走勢：", e.message);
  }

  const areas = AREAS_CONFIG.areas.map(area => {
    const current = computeAreaAverage(currentRecords, area);
    const past = trendRecords.length ? computeAreaAverage(trendRecords, area) : { avgPricePerPing: null };

    let trendPct = null;
    if (current.avgPricePerPing && past.avgPricePerPing) {
      trendPct = Math.round(((current.avgPricePerPing - past.avgPricePerPing) / past.avgPricePerPing) * 1000) / 10;
    }

    return {
      code: area.code,
      name: area.name,
      avgPricePerPing: current.avgPricePerPing,
      sampleSize: current.sampleSize,
      lowSample: current.sampleSize < 5,
      trendPct,
    };
  });

  const output = {
    updatedAt: new Date().toISOString(),
    sourceNote: "資料來源：內政部不動產交易實價查詢服務網（每月1、11、21日批次公告，非逐日即時資料）",
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
