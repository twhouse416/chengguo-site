/**
 * 澄果團隊｜內政部實價登錄下載來源
 * ------------------------------------------------
 * 內政部提供三種批次檔，各有各的用途與限制：
 *
 *   1. 本期十天檔　Download?type=zip&fileName=lvr_landcsv.zip
 *      最近一次公告（每月 1、11、21 日）的內容，全台約 1.7 MB。
 *      只有「最新那一批」，下一次公告之後舊的就被換掉。
 *
 *   2. 非本期批次　DownloadHistory?type=history&fileName=<發布日期>
 *      過去七期的十天檔，每個約 14 MB。發布日期形如 20260701。
 *      注意：fileName 就是日期本身，不要加 .zip，加了會回傳錯誤頁。
 *      期別清單可以從 DownloadHistory_ajax_list 讀出來（裡面是
 *      href="javaScript:downloadLast('20260701');" 這種寫法），
 *      所以不必寫死，內政部換期我們自動跟上。
 *
 *   3. 季檔　DownloadSeason?season=115S2&type=zip&fileName=lvr_landcsv.zip
 *      一整季的彙整，每個約 14 MB。本季的要等季末才發布，
 *      季中去抓會回傳 HTML 錯誤頁。
 *
 * 實測（2026-09）確認的兩件事：
 *   - Download 的 period 參數是無效的：六種寫法抓回來的 MD5 完全一樣。
 *   - 查詢網站看得到、但季檔裡沒有的成交，就在「非本期批次」裡——
 *     因為那些案件公告於七、八月，當時的十天檔早被換掉，
 *     而涵蓋它們的季檔還沒發布。這是原本資料會缺一段的真正原因。
 *
 * 搭配 deal-pool.js 使用：每次下載到的都先存進資料池，
 * 例行更新只要抓「本期 + 七期歷史」就足以覆蓋近三個月的所有公告，
 * 連續幾次更新失敗也不會掉資料。季檔則留給一次性的長期回補。
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const BASE = "https://plvr.land.moi.gov.tw";
const UA = `-A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" -e "${BASE}/DownloadOpenData"`;

export const CURRENT_URL = `${BASE}/Download?type=zip&fileName=lvr_landcsv.zip`;
export const historyUrl = p => `${BASE}/DownloadHistory?type=history&fileName=${p}`;
export const seasonUrl = s => `${BASE}/DownloadSeason?season=${s}&type=zip&fileName=lvr_landcsv.zip`;

/* 「往回第 N 季」的季別代碼（民國年 S 季）。back=1 是上一季。 */
export function seasonCode(back) {
  const now = new Date();
  let y = now.getFullYear() - 1911;
  let q = Math.ceil((now.getMonth() + 1) / 3) - back;
  while (q <= 0) { q += 4; y -= 1; }
  return `${y}S${q}`;
}

/**
 * 從內政部網站讀出目前提供哪幾期「非本期批次」。
 * 讀不到時回傳空陣列，呼叫端照常跑本期十天檔，不會整個中斷。
 */
export function listHistoryPeriods(tmpDir) {
  const f = path.join(tmpDir, "history-list.html");
  mkdirSync(tmpDir, { recursive: true });
  try {
    execSync(`curl -sL -f --connect-timeout 20 --max-time 60 ${UA} ` +
      `-o "${f}" "${BASE}/DownloadHistory_ajax_list"`, { stdio: "pipe" });
  } catch {
    console.warn("[警告] 讀不到非本期清單，這次只抓本期十天檔");
    return [];
  }
  if (!existsSync(f)) return [];
  const html = readFileSync(f, "utf-8");
  /* href="javaScript:downloadLast('20260701');" */
  const set = new Set();
  for (const m of html.matchAll(/downloadLast\(\s*['"](\d{8})['"]\s*\)/g)) set.add(m[1]);
  rmSync(f, { force: true });
  return [...set].sort();   // 舊到新
}

/**
 * 下載並解壓。成功回傳解壓目錄，失敗回傳 null（不丟例外，讓呼叫端決定要不要繼續）。
 * 回傳的目錄由呼叫端負責刪除。
 */
export function downloadAndExtract(url, label, tmpDir, retries = 3) {
  const zip = path.join(tmpDir, `${label}.zip`);
  const dir = path.join(tmpDir, label);
  mkdirSync(dir, { recursive: true });

  for (let a = 1; a <= retries; a++) {
    try {
      execSync(`curl -sL -f --connect-timeout 30 --max-time 300 ${UA} -o "${zip}" "${url}"`,
        { stdio: "pipe" });
      /* 內政部在資料還沒發布時會回傳 HTML 錯誤頁而不是 404，
         所以要自己檢查檔頭是不是 ZIP（PK），否則 unzip 會噴一堆看不懂的訊息。 */
      const head = readFileSync(zip).subarray(0, 2);
      if (!(head[0] === 0x50 && head[1] === 0x4b)) {
        console.warn(`  [略過] ${label} 回傳的不是壓縮檔（該期資料應該還沒發布）`);
        rmSync(zip, { force: true });
        rmSync(dir, { recursive: true, force: true });
        return null;
      }
      execSync(`unzip -o -q "${zip}" -d "${dir}"`);
      rmSync(zip, { force: true });
      return dir;
    } catch (e) {
      console.warn(`  [警告] ${label} 第 ${a} 次下載失敗`);
      if (a < retries) execSync(`sleep ${a * 15}`);
    }
  }
  rmSync(dir, { recursive: true, force: true });
  return null;
}

/* ---------- CSV ---------- */

export function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

/**
 * 讀取解壓目錄裡的成交紀錄。
 * suffix "a" 是成屋、"b" 是預售（新建案的交易多半登錄在預售檔，不能不讀）。
 * cityPrefix 給值時只讀該縣市的檔案（高雄是 E），記憶體與時間都省下一大截；
 * 檔名對不上時自動退回讀全部，不會整個跑不動。
 */
export function readCsv(dir, suffix, presale, cityPrefix) {
  if (!dir) return [];
  const re = new RegExp(`_lvr_land_${suffix}\\.csv$`, "i");
  const all = readdirSync(dir).filter(f => re.test(f));
  const city = cityPrefix
    ? all.filter(f => f.toUpperCase().startsWith(cityPrefix.toUpperCase() + "_"))
    : [];
  const files = city.length ? city : all;
  const out = [];
  for (const file of files) {
    const rows = parseCSV(readFileSync(path.join(dir, file), "utf-8"));
    if (rows.length < 3) continue;
    const header = rows[0];
    /* 第 2 行是英文欄名，資料從第 3 行開始 */
    rows.slice(2).forEach(r => {
      const rec = {};
      header.forEach((h, i) => { rec[h.trim()] = r[i]; });
      if (presale) rec.__presale = true;
      out.push(rec);
    });
  }
  return out;
}

/* 成屋＋預售一起讀 */
export function readAll(dir, cityPrefix) {
  return [...readCsv(dir, "a", false, cityPrefix), ...readCsv(dir, "b", true, cityPrefix)];
}

/* 民國年月日轉西元。長度不一（830122 六碼、1150513 七碼），
   所以不能用字串直接比大小，要先切出年份。 */
export function rocToDate(v) {
  const s = String(v || "").trim();
  if (s.length < 6) return "";
  return `${parseInt(s.slice(0, s.length - 4), 10) + 1911}-${s.slice(-4, -2)}-${s.slice(-2)}`;
}

/* 一批紀錄的交易日範圍。用西元字串比大小才正確。 */
export function dateRange(records) {
  const ds = records.map(r => rocToDate(r["交易年月日"])).filter(Boolean).sort();
  return ds.length ? [ds[0], ds[ds.length - 1]] : null;
}
