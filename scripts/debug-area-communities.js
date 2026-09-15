/**
 * 澄果團隊｜生活圈熱門社區診斷
 * ------------------------------------------------
 * 用實價登錄算出每個生活圈「哪幾棟成交最多」，用來決定接下來要建哪些社區頁。
 * 樂居、591 這些平台查得到有哪些建案，但查不到成交筆數排行——那要自己算。
 *
 * 同一個門牌（取到「號」為止）視為同一棟，列出：
 *   - 成交筆數（由多到少）
 *   - 單價中位數與最低/最高
 *   - 坪數中位數（判斷是大坪數豪宅還是小宅）
 *   - 最近一筆成交日期（看這棟現在還熱不熱）
 *
 * 一個社區常橫跨多個門牌，所以同一社區可能分成好幾列，
 * 看到相鄰號碼、筆數與價位都相近的，通常就是同一個社區。
 *
 * 用法：
 *   node scripts/debug-area-communities.js [期數] [生活圈代碼]
 *   node scripts/debug-area-communities.js 8 02      近 8 期的農十六
 *
 * 另外會把結果寫成 door-index.json（門牌索引），由 workflow 打包成可下載的
 * 檔案。門牌數量動輒兩三百筆，用看的、用複製貼上的都不切實際，下載檔案最省事。
 *
 * 只讀不寫，不會動到 data/ 底下任何檔案。
 */

import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-commdebug");
const AREAS = JSON.parse(readFileSync(path.join(ROOT, "config/areas.json"), "utf-8"));
/* 診斷時把所有型態群組合起來看（電梯住宅＋透天），才知道整個生活圈抓到什麼 */
const TYPE_MATCH = (AREAS.propertyTypes || []).flatMap(t => t.match);

const M2_TO_PING = 0.3025;
const SEASON_ZIP_URL = s =>
  `https://plvr.land.moi.gov.tw/DownloadSeason?season=${s}&type=zip&fileName=lvr_landcsv.zip`;

function normalize(str) {
  return String(str || "")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "");
}

/* 與 fetch-market-data.js 相同的路段判斷：路名＋號碼範圍＋單雙號 */
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
    if (r.parity === "odd" && no % 2 === 0) continue;
    if (r.parity === "even" && no % 2 === 1) continue;
    return true;
  }
  return false;
}

/* 從門牌取出路名：去掉縣市與行政區，取到「路/街/大道」為止。
   巷弄以後的部分不要，否則每條巷都變成一個獨立項目，看不出分布。 */
function roadOf(addr) {
  let s = normalize(addr).replace(/^.*?[縣市]/, "").replace(/^.*?區/, "");
  const m = s.match(/^(.*?(?:[路街]|大道))/);
  return m ? m[1] : (s.slice(0, 8) || "（無法判讀）");
}

/* 關於單價：直接使用內政部的「單價元平方公尺」，不要自己扣車位。
   一度以為這個欄位含車位需要自己扣，實測證明不用——
   例：美術東四路43號，總價 2,058 萬、建物 150.46 ㎡、車位價 270 萬、車位 33.1 ㎡
       不扣車位：2058 ÷ 150.46 = 45.2 萬/坪
       扣掉車位：(2058-270) ÷ (150.46-33.1) = 50.4 萬/坪  ← 內政部給的就是這個
   內政部在「車位總價元」有揭露時已經先扣過，重複扣會高估。
   車位價未揭露（為 0）時內政部無從扣起，那類紀錄單價本來就偏低，屬於資料限制。 */

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function parseCSV(text) {
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
  return rows;
}

function seasonCode(back) {
  const now = new Date();
  let y = now.getFullYear() - 1911;
  let q = Math.ceil((now.getMonth() + 1) / 3) - back;
  while (q <= 0) { q += 4; y -= 1; }
  return `${y}S${q}`;
}

function download(season) {
  const zip = path.join(TMP, `${season}.zip`);
  const dir = path.join(TMP, season);
  mkdirSync(dir, { recursive: true });
  for (let a = 1; a <= 3; a++) {
    try {
      execSync(`curl -L -f -s --connect-timeout 30 --max-time 300 ` +
        `-A "Mozilla/5.0 (compatible; chengguo-site/1.0)" -o "${zip}" "${SEASON_ZIP_URL(season)}"`,
        { stdio: "inherit" });
      execSync(`unzip -o -q "${zip}" -d "${dir}"`);
      return dir;
    } catch (e) {
      console.warn(`  [警告] ${season} 第 ${a} 次失敗`);
      if (a < 3) execSync(`sleep ${a * 20}`);
    }
  }
  return null;
}

function readCsv(dir) {
  const records = [];
  for (const file of readdirSync(dir).filter(f => /_lvr_land_a\.csv$/i.test(f))) {
    const rows = parseCSV(readFileSync(path.join(dir, file), "utf-8"));
    if (rows.length < 3) continue;
    const header = rows[0];
    rows.slice(2).forEach(r => {
      const rec = {};
      header.forEach((h, i) => { rec[h.trim()] = r[i]; });
      records.push(rec);
    });
  }
  return records;
}


/* 同一棟：門牌取到「號」為止，樓層與「之N」不計 */
function doorKey(addr) {
  const s = normalize(addr);
  const m = s.match(/^(.*?\d+號)/);
  const raw = m ? m[1] : s;
  return raw.replace(/^.*?[縣市]/, "").replace(/^.*?區/, "");
}

function rocToDate(v) {
  const s = String(v || "").trim();
  if (s.length < 6) return "";
  return `${parseInt(s.slice(0, s.length - 4), 10) + 1911}-${s.slice(-4, -2)}-${s.slice(-2)}`;
}

async function main() {
  const periods = parseInt(process.argv[2], 10) || 4;
  const onlyCode = (process.argv[3] || "").trim();

  console.log(`\n=== 生活圈熱門社區診斷（近 ${periods} 期）===`);
  console.log(`（從上一季往回抓——本季的季檔內政部通常還沒公告）`);
  if (onlyCode) console.log(`只看生活圈代碼 ${onlyCode}`);
  console.log(`建物型態：${(AREAS.propertyTypes || []).map(x => x.label).join("、")}`);
  console.log(`排除用途：${(AREAS.excludeUses || []).join("、") || "（無）"}\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  let all = [];
  for (let i = 0; i < periods; i++) {
    const season = seasonCode(i + 1);
    process.stdout.write(`下載 ${season} … `);
    const dir = download(season);
    if (!dir) { console.log("❌ 失敗，跳過"); continue; }
    const recs = readCsv(dir);
    console.log(`✅ ${recs.length} 筆`);
    all = all.concat(recs);
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(TMP, { recursive: true, force: true });

  if (!all.length) { console.log("\n沒有讀到任何資料，無法診斷。"); return; }
  console.log(`\n合計 ${all.length} 筆（全台）`);

  const areas = AREAS.areas.filter(a => !onlyCode || a.code === onlyCode);
  if (!areas.length) { console.log(`找不到代碼 ${onlyCode} 的生活圈`); return; }

  /* 同時累積成結構化資料，最後寫成檔案 */
  const out = { 產生時間: new Date().toISOString(), 期數: periods, 生活圈: [] };

  for (const area of areas) {
    const keys = (area.keywords || []).map(normalize);
    const ranges = area.roadRanges || [];

    const matched = all.filter(r => {
      const district = r["鄉鎮市區"] || "";
      const addr = normalize(r["土地位置建物門牌"]);
      const byKeyword = district.includes(area.district) && keys.some(k => addr.includes(k));
      const byRange = ranges.some(rg =>
        district.includes(rg.district || area.district) && inAddressRange(addr, [rg]));
      if (!byKeyword && !byRange) return false;
      const type = r["建物型態"] || "";
      if (!TYPE_MATCH.some(k => type.includes(k))) return false;
      const use = (r["主要用途"] || "").trim();
      if (use && (AREAS.excludeUses || []).some(k => use.includes(k))) return false;
      return parseFloat(r["單價元平方公尺"]) > 0;
    });

    console.log(`\n══════════════════════════════════════════════════════════`);
    console.log(`【${area.code} ${area.name}】${area.district}　共 ${matched.length} 筆成交`);
    console.log(`══════════════════════════════════════════════════════════`);
    if (!matched.length) { console.log("（沒有抓到任何紀錄）"); continue; }

    const byDoor = new Map();
    matched.forEach(r => {
      const door = doorKey(r["土地位置建物門牌"]);
      const price = Math.round(parseFloat(r["單價元平方公尺"]) / M2_TO_PING / 1000) / 10;
      const ping = Math.round(parseFloat(r["建物移轉總面積平方公尺"] || 0) * M2_TO_PING * 10) / 10;
      const date = rocToDate(r["交易年月日"]);
      const floors = (r["總樓層數"] || "").trim();
      if (!byDoor.has(door)) byDoor.set(door, { prices: [], pings: [], dates: [], floors: new Set() });
      const v = byDoor.get(door);
      v.prices.push(price);
      if (ping > 0) v.pings.push(ping);
      if (date) v.dates.push(date);
      if (floors) v.floors.add(floors);
    });

    const rows = [...byDoor.entries()]
      .map(([door, v]) => ({
        door, n: v.prices.length,
        med: median(v.prices), min: Math.min(...v.prices), max: Math.max(...v.prices),
        ping: v.pings.length ? median(v.pings) : 0,
        last: v.dates.sort().slice(-1)[0] || "",
        floors: [...v.floors].join("/"),
      }))
      .sort((a, b) => b.n - a.n || b.med - a.med);

    console.log(`\n共 ${rows.length} 個門牌有成交，以下依筆數排序：\n`);
    console.log(`${"門牌".padEnd(22)}${"筆數".padStart(4)}${"中位數".padStart(8)}${"最低".padStart(7)}${"最高".padStart(7)}${"坪數".padStart(7)}  ${"最近成交".padEnd(11)}總樓層`);
    console.log("─".repeat(88));
    rows.forEach(r => {
      console.log(
        `${r.door.padEnd(22)}${String(r.n).padStart(4)}${r.med.toFixed(1).padStart(8)}` +
        `${r.min.toFixed(1).padStart(7)}${r.max.toFixed(1).padStart(7)}${(r.ping || 0).toFixed(1).padStart(7)}  ` +
        `${(r.last || "—").padEnd(11)}${r.floors}`
      );
    });
    console.log("─".repeat(88));

    const top = rows.slice(0, 10).reduce((s, r) => s + r.n, 0);
    console.log(`前 10 個門牌合計 ${top} 筆，佔全區 ${(top / matched.length * 100).toFixed(0)}%`);

    out.生活圈.push({
      代碼: area.code, 名稱: area.name, 行政區: area.district,
      成交筆數: matched.length, 門牌數: rows.length,
      門牌: rows.map(r => ({
        門牌: r.door, 筆數: r.n,
        單價中位數: Math.round(r.med * 10) / 10,
        單價最低: Math.round(r.min * 10) / 10,
        單價最高: Math.round(r.max * 10) / 10,
        坪數中位數: Math.round(r.ping * 10) / 10,
        最近成交: r.last, 總樓層: r.floors,
      })),
    });
  }

  const outPath = path.join(ROOT, "door-index.json");
  writeFileSync(outPath, JSON.stringify(out, null, 1), "utf-8");
  console.log(`\n[完成] 門牌索引已寫入 door-index.json（` +
    `${out.生活圈.reduce((s, a) => s + a.門牌數, 0)} 個門牌）`);
  console.log(`這個檔案會被打包成可下載的檔案，不必從畫面上複製。`);

  console.log(`\n\n=== 怎麼看 ===`);
  console.log(`1. 筆數多＝市場流通性高，建社區頁的效益最大（有成交紀錄可以列）`);
  console.log(`2. 相鄰門牌、筆數與價位都相近的，通常是同一個社區的不同棟`);
  console.log(`3. 坪數中位數看得出產品定位：30 坪上下是首購換屋、80 坪以上是大坪數`);
  console.log(`4. 最近成交太舊（半年以上沒有）代表這棟現在沒什麼在流通\n`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
