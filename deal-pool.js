/**
 * 澄果團隊｜四大生活圈成交資料池
 * ------------------------------------------------
 * 為什麼要有這個東西
 *
 * 原本的流程是「下載內政部檔案 → 用社區設定當過濾條件 → 只留下命中的那幾筆」。
 * 沒命中的整批丟掉。問題在於社區設定會變：新增一個社區、修正一組門牌範圍，
 * 想補它的歷史成交時，當初那些檔案已經抓不回來了——
 * 內政部的「十天檔」只保留最近一批公告，季檔則要等一季結束才發布，
 * 中間那段成交等於永久遺失。賓果家築 115/06 的幾筆就是這樣掉的。
 *
 * 改成資料池之後，順序反過來：
 *   下載 → 凡是落在四大生活圈範圍內的，全部存進池子（去重）→ 社區從池子裡撈。
 * 社區設定變成「查詢條件」而不是「過濾條件」，改門牌、加社區都只是重撈一次，
 * 不必也不可能再去跟內政部要回舊檔案。
 *
 * 存哪些資料
 *   只存後續計算會用到的欄位，且用「欄位名一列 + 資料多列」的表格式存法，
 *   不是每一筆都重複寫一次欄位名——同樣的內容，檔案小一半以上。
 *   讀進來之後會還原成和內政部原始 CSV 一樣的物件，
 *   所以行情計算、社區比對那些既有函式完全不用改。
 *
 * 檔案位置：data/area-deals/<生活圈代碼>.json，一個生活圈一個檔。
 * 四大生活圈近五年約 9,500 筆，四個檔合計約 1.5 MB。
 * 這個檔案只有建置時在 GitHub Actions 裡被讀取，不會送到瀏覽器，
 * 客戶開網頁載入的仍然只有該社區自己的成交紀錄。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
export const POOL_DIR = path.join(ROOT, "data/area-deals");

/* 要保留的欄位。順序即檔案裡的欄位順序，往後只能往後面加，不要插在中間，
   否則舊檔案讀進來會整個錯位。真的要改順序，就重跑一次回補。 */
export const COLUMNS = [
  "鄉鎮市區",
  "土地位置建物門牌",
  "交易年月日",
  "單價元平方公尺",
  "總價元",
  "建物移轉總面積平方公尺",
  "建物型態",
  "主要用途",
  "建築完成年月",
  "移轉層次",
  "總樓層數",
  "建物現況格局-房",
  "建物現況格局-廳",
  "建物現況格局-衛",
  "車位類別",
  "車位總價元",
  "解約情形",
  "備註",
  "建案名稱",
  "棟及號",
];

/* 實價登錄的門牌用全形數字（美術東四路６９８號），比對前一律轉半形 */
export function normalize(str) {
  return String(str || "")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "");
}

export function inAddressRange(normAddr, ranges) {
  if (!ranges?.length) return false;
  for (const r of ranges) {
    const road = normalize(r.road || "");
    if (!road || !normAddr.includes(road)) continue;
    const after = normAddr.split(road)[1] || "";
    const m = after.match(/^(\d+)/);
    if (!m) continue;
    const no = parseInt(m[1], 10);
    if (no < (r.from ?? -Infinity) || no > (r.to ?? Infinity)) continue;
    if (r.parity === "odd" && no % 2 === 0) continue;
    if (r.parity === "even" && no % 2 === 1) continue;
    return true;
  }
  return false;
}

/**
 * 一筆成交屬於哪個生活圈。比對條件與首頁行情用的是同一套
 * （行政區 + keywords 或 roadRanges），但這裡「不做」型態、用途、屋齡的篩選——
 * 那些是統計時才該套用的條件，存進池子時全部保留，
 * 否則哪天想改統計方式，又得回頭去跟內政部重抓。
 * 同時命中兩個生活圈時歸給先設定的那一個，避免同一筆重複計算。
 */
export function areaOf(record, areasConfig) {
  const district = record["鄉鎮市區"] || "";
  const addr = normalize(record["土地位置建物門牌"]);
  if (!addr) return null;
  for (const a of areasConfig.areas) {
    const byKeyword = district.includes(a.district)
      && (a.keywords || []).some(k => addr.includes(normalize(k)));
    const byRange = (a.roadRanges || []).some(rg =>
      district.includes(rg.district || a.district) && inAddressRange(addr, [rg]));
    if (byKeyword || byRange) return a.code;
  }
  return null;
}

/* 去重用的鍵。同一筆交易在十天檔與季檔裡都會出現，內容完全一樣；
   同一門牌同一天也可能有多筆不同戶別的成交，所以樓層、面積、總價都要進來。 */
export function dealKey(r) {
  return [
    r["交易年月日"], normalize(r["土地位置建物門牌"]), r["移轉層次"],
    r["建物移轉總面積平方公尺"], r["總價元"], r.__presale ? "P" : "A",
  ].join("|");
}

function poolPath(code) {
  return path.join(POOL_DIR, `${code}.json`);
}

/* 讀單一生活圈。回傳的每一筆都是和內政部 CSV 同樣欄位名的物件，
   預售屋另外帶 __presale = true。 */
export function loadArea(code) {
  const p = poolPath(code);
  if (!existsSync(p)) return [];
  let data;
  try { data = JSON.parse(readFileSync(p, "utf-8")); }
  catch (e) { console.warn(`[資料池] ${code}.json 讀取失敗，視為空的：${e.message}`); return []; }
  const cols = data.columns || COLUMNS;
  return (data.rows || []).map(row => {
    const rec = {};
    cols.forEach((c, i) => { rec[c] = row[i] ?? ""; });
    /* 檔案裡預售是 1、成屋是 0；還原成程式其他地方習慣的 true / 不存在，
       否則 0 會被當成「有這個欄位」而讓某些判斷寫法出錯。 */
    if (String(rec.__presale) === "1") rec.__presale = true;
    else delete rec.__presale;
    return rec;
  });
}

/* 讀全部生活圈。onlyCode 給值時只讀那一個。 */
export function loadPool(onlyCode) {
  if (!existsSync(POOL_DIR)) return [];
  const codes = readdirSync(POOL_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(/\.json$/, ""))
    .filter(c => !onlyCode || c === onlyCode);
  return codes.flatMap(loadArea);
}

export function saveArea(code, records) {
  mkdirSync(POOL_DIR, { recursive: true });
  /* 依交易日新到舊排序，方便人直接打開檔案看最近的成交 */
  const sorted = [...records].sort((a, b) =>
    String(b["交易年月日"] || "").localeCompare(String(a["交易年月日"] || "")));
  const rows = sorted.map(r => {
    const row = COLUMNS.map(c => r[c] ?? "");
    row.push(r.__presale ? 1 : 0);
    return row;
  });
  const body = {
    _說明: "四大生活圈成交資料池。columns 是欄位名，rows 每一列對應一筆成交，最後一欄 1 代表預售屋。由 scripts/lib/deal-pool.js 維護，請勿手動編輯。",
    生活圈代碼: code,
    更新時間: new Date().toISOString(),
    筆數: rows.length,
    columns: [...COLUMNS, "__presale"],
    rows,
  };
  /* rows 逐列輸出：每筆一行，diff 看得出來到底多了哪幾筆 */
  const head = JSON.stringify(body, (k, v) => (k === "rows" ? "__ROWS__" : v), 1);
  const rowsText = rows.map(r => "  " + JSON.stringify(r)).join(",\n");
  const text = head.replace('"__ROWS__"', `[\n${rowsText}\n ]`);
  writeFileSync(poolPath(code), text + "\n", "utf-8");
  return rows.length;
}

/**
 * 把新下載到的紀錄併進資料池。
 * 回傳 { total, added: { 生活圈代碼: 新增筆數 } }，方便在記錄檔裡看出這次多了什麼。
 */
export function mergeIntoPool(records, areasConfig) {
  const byArea = new Map();
  areasConfig.areas.forEach(a => byArea.set(a.code, new Map()));

  /* 先把既有的讀進來 */
  for (const code of byArea.keys()) {
    const m = byArea.get(code);
    loadArea(code).forEach(r => m.set(dealKey(r), r));
  }
  const before = new Map([...byArea].map(([c, m]) => [c, m.size]));

  let matched = 0;
  for (const r of records) {
    if (!(parseFloat(r["單價元平方公尺"]) > 0)) continue;
    const code = areaOf(r, areasConfig);
    if (!code || !byArea.has(code)) continue;
    matched++;
    const m = byArea.get(code);
    const k = dealKey(r);
    /* 同一筆重複出現時保留後來的——季檔會修正早先十天檔裡的內容 */
    m.set(k, r);
  }

  const added = {};
  let total = 0;
  for (const [code, m] of byArea) {
    const n = saveArea(code, [...m.values()]);
    added[code] = n - (before.get(code) || 0);
    total += n;
  }
  return { total, matched, added };
}
