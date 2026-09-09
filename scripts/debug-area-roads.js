/**
 * 澄果團隊｜生活圈路名分布診斷
 * ------------------------------------------------
 * 首頁四大生活圈的均價，是用 config/areas.json 的路名關鍵字比對門牌抓出來的。
 * 這支腳本用「完全相同的條件」跑一次，但不只給總數，而是印出：
 *
 *   - 每個生活圈實際抓到哪些路，各幾筆
 *   - 每條路的單價中位數與最低/最高
 *   - 每一筆是被哪個關鍵字勾中的
 *
 * 目的是看出誤抓：某條路筆數很多、單價卻明顯偏離其他路，通常就是
 * 關鍵字太寬（例如「九如」會抓到整條橫貫市區的九如路）。
 *
 * 用法：
 *   node scripts/debug-area-roads.js [期數]      預設 2 期（與首頁均價相同）
 *
 * 只讀不寫，不會動到 data/ 底下任何檔案。
 */

import { readFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-areadebug");
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

async function main() {
  const periods = parseInt(process.argv[2], 10) || 3;
  console.log(`\n=== 生活圈路名分布診斷（近 ${periods} 期）===`);
  console.log(`（從上一季往回抓——本季的季檔內政部通常還沒公告）`);
  console.log(`建物型態：${(AREAS.propertyTypes || []).map(x => x.label + "(" + x.match.join("/") + ")").join("、")}`);
  console.log(`排除用途：${(AREAS.excludeUses || []).join("、") || "（無）"}\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  let all = [];
  for (let i = 0; i < periods; i++) {
    const season = seasonCode(i + 1);   // 跳過本季：季檔要季末才公告
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
  console.log(`\n合計 ${all.length} 筆（全台）\n`);

  for (const area of AREAS.areas) {
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

    console.log(`\n══════════════════════════════════════════`);
    console.log(`【${area.code} ${area.name}】${area.district}　共 ${matched.length} 筆`);
    console.log(`整條路：${(area.keywords || []).join("、") || "（無）"}`);
    if (ranges.length) {
      console.log(`路段：　${ranges.map(r => {
        const p = r.parity === "odd" ? "單號" : r.parity === "even" ? "雙號" : "單雙皆取";
        const n = (r.from != null || r.to != null) ? `${r.from ?? "不限"}-${r.to ?? "不限"}號` : "全路";
        const d = r.district ? `${r.district}／` : "";
        return `${d}${r.road} ${n}（${p}）`;
      }).join("；")}`);
    }
    console.log(`══════════════════════════════════════════`);

    if (!matched.length) { console.log("（沒有抓到任何紀錄）"); continue; }

    /* 依路名分組 */
    const byRoad = new Map();
    matched.forEach(r => {
      const addr = normalize(r["土地位置建物門牌"]);
      const road = roadOf(r["土地位置建物門牌"]);
      const price = Math.round(parseFloat(r["單價元平方公尺"]) / M2_TO_PING / 1000) / 10;
      const dist = r["鄉鎮市區"] || "";
      const hitKey = (dist.includes(area.district)
          ? (area.keywords || []).find(k => addr.includes(normalize(k))) : null)
        || (ranges.some(rg => dist.includes(rg.district || area.district) && inAddressRange(addr, [rg]))
            ? "（路段範圍）" : "?");
      if (!byRoad.has(road)) byRoad.set(road, { prices: [], keys: new Set() });
      byRoad.get(road).prices.push(price);
      byRoad.get(road).keys.add(hitKey);
    });

    const rows = [...byRoad.entries()]
      .map(([road, v]) => ({
        road,
        n: v.prices.length,
        med: median(v.prices),
        min: Math.min(...v.prices),
        max: Math.max(...v.prices),
        keys: [...v.keys].join(","),
      }))
      .sort((a, b) => b.n - a.n);

    const allPrices = matched.map(r =>
      Math.round(parseFloat(r["單價元平方公尺"]) / M2_TO_PING / 1000) / 10);
    const areaMed = median(allPrices);

    console.log(`\n${"路名".padEnd(16)}${"筆數".padStart(5)}${"中位數".padStart(9)}${"最低".padStart(8)}${"最高".padStart(8)}   命中關鍵字`);
    console.log("─".repeat(74));
    rows.forEach(r => {
      /* 中位數偏離全區 25% 以上就標出來，通常是誤抓的訊號 */
      const off = areaMed ? Math.abs(r.med - areaMed) / areaMed : 0;
      const flag = off > 0.25 ? "  ⚠ 偏離全區中位數" : "";
      console.log(
        `${r.road.padEnd(16)}${String(r.n).padStart(5)}${r.med.toFixed(1).padStart(9)}${r.min.toFixed(1).padStart(8)}${r.max.toFixed(1).padStart(8)}   ${r.keys}${flag}`
      );
    });
    console.log("─".repeat(74));
    console.log(`全區平均 ${mean(allPrices).toFixed(1)} 萬/坪　中位數 ${areaMed.toFixed(1)} 萬/坪`);
    console.log(`（首頁顯示的是剔除頭尾各一成後的平均，會比這裡的原始平均再收斂一點）`);

    /* 門牌層級：同一棟大樓會有很多筆成交。若某一棟就佔了整區的一大半，
       那首頁的數字其實是那一棟的價格，不是整個生活圈的行情。 */
    const byDoor = new Map();
    matched.forEach(r => {
      const raw = normalize(r["土地位置建物門牌"]);
      /* 取到「號」為止，樓層與「之N」不計，同一棟就會合併 */
      const m = raw.match(/^(.*?\d+號)/);
      const door = m ? m[1].replace(/^.*?[縣市]/, "").replace(/^.*?區/, "") : raw.slice(0, 20);
      const price = Math.round(parseFloat(r["單價元平方公尺"]) / M2_TO_PING / 1000) / 10;
      if (!byDoor.has(door)) byDoor.set(door, []);
      byDoor.get(door).push(price);
    });
    const doors = [...byDoor.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
    console.log(`\n門牌集中度（前 ${doors.length} 名，共 ${byDoor.size} 個門牌）`);
    console.log("─".repeat(74));
    doors.forEach(([door, ps]) => {
      const share = (ps.length / matched.length * 100).toFixed(1);
      console.log(`${door.padEnd(24)}${String(ps.length).padStart(5)} 筆　佔 ${share.padStart(5)}%　平均 ${mean(ps).toFixed(1)} 萬/坪`);
    });
    console.log("─".repeat(74));
  }

  console.log(`\n\n=== 判讀方式 ===`);
  console.log(`1. 看「筆數」多但價格明顯偏離的路 —— 通常是關鍵字太寬抓進來的`);
  console.log(`2. 看有沒有你認為不屬於這個生活圈的路名出現`);
  console.log(`3. 看有沒有該有的路沒出現 —— 那是關鍵字漏了\n`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
