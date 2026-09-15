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
 * 記憶體：早期版本把所有期別的紀錄先 concat 成一個大陣列再比對，跑 20 期
 * （約 130 萬筆）時 Node 的堆積會爆掉（FATAL ERROR: JavaScript heap out of memory）。
 * 現在改成「下載一期 → 立刻比對 → 丟掉」，記憶體只需容納單一期，跑 40 期也不會爆。
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

/* 四大生活圈都在高雄，季檔裡高雄是 E_lvr_land_a.csv。
   只讀這一支，記憶體與解析時間都省下二十分之一；
   萬一檔名對不上（內政部改格式）就退回讀全部，不會整個跑不動。 */
const CITY_PREFIX = "E";

function readCsv(dir) {
  const records = [];
  const all = readdirSync(dir).filter(f => /_lvr_land_a\.csv$/i.test(f));
  const city = all.filter(f => f.toUpperCase().startsWith(CITY_PREFIX + "_"));
  for (const file of (city.length ? city : all)) {
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
  const m = s.match(/^(.*?)(\d+)號/);
  const raw = m ? m[1] + m[2] + "號" : s;
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

  const areas = AREAS.areas.filter(a => !onlyCode || a.code === onlyCode);
  if (!areas.length) { console.log(`找不到代碼 ${onlyCode} 的生活圈`); return; }

  /* 每個生活圈一組累加器，逐期累進，不保留原始紀錄 */
  const acc = new Map();
  areas.forEach(a => acc.set(a.code, {
    area: a, matched: 0, doors: new Map(),
    keys: (a.keywords || []).map(normalize),
    ranges: a.roadRanges || [],
  }));

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  let readTotal = 0;
  for (let i = 0; i < periods; i++) {
    const season = seasonCode(i + 1);
    process.stdout.write(`下載 ${season} … `);
    const dir = download(season);
    if (!dir) { console.log("❌ 失敗，跳過"); continue; }

    const recs = readCsv(dir);
    readTotal += recs.length;

    for (const r of recs) {
      const price = parseFloat(r["單價元平方公尺"]);
      if (!(price > 0)) continue;
      const type = r["建物型態"] || "";
      if (!TYPE_MATCH.some(k => type.includes(k))) continue;
      const use = (r["主要用途"] || "").trim();
      if (use && (AREAS.excludeUses || []).some(k => use.includes(k))) continue;

      const district = r["鄉鎮市區"] || "";
      const addr = normalize(r["土地位置建物門牌"]);

      for (const st of acc.values()) {
        const a = st.area;
        const byKeyword = district.includes(a.district) && st.keys.some(k => addr.includes(k));
        const byRange = st.ranges.some(rg =>
          district.includes(rg.district || a.district) && inAddressRange(addr, [rg]));
        if (!byKeyword && !byRange) continue;

        st.matched++;
        const door = doorKey(r["土地位置建物門牌"]);
        let v = st.doors.get(door);
        if (!v) { v = { prices: [], pings: [], dates: [], floors: new Set() }; st.doors.set(door, v); }
        v.prices.push(Math.round(price / M2_TO_PING / 1000) / 10);
        const ping = parseFloat(r["建物移轉總面積平方公尺"] || 0) * M2_TO_PING;
        if (ping > 0) v.pings.push(Math.round(ping * 10) / 10);
        const date = rocToDate(r["交易年月日"]);
        if (date) v.dates.push(date);
        const fl = (r["總樓層數"] || "").trim();
        if (fl) v.floors.add(fl);
        break;   // 一筆成交只歸一個生活圈
      }
    }

    console.log(`✅ ${recs.length} 筆（累計比對到 ${[...acc.values()].reduce((s, x) => s + x.matched, 0)} 筆）`);
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(TMP, { recursive: true, force: true });

  if (!readTotal) { console.log("\n沒有讀到任何資料，無法診斷。"); return; }
  console.log(`\n合計讀取 ${readTotal} 筆（高雄市成屋）`);

  const out = { 產生時間: new Date().toISOString(), 期數: periods, 生活圈: [] };

  for (const st of acc.values()) {
    const area = st.area;
    console.log(`\n══════════════════════════════════════════════════════════`);
    console.log(`【${area.code} ${area.name}】${area.district}　共 ${st.matched} 筆成交`);
    console.log(`══════════════════════════════════════════════════════════`);
    if (!st.matched) { console.log("（沒有抓到任何紀錄）"); continue; }

    const rows = [...st.doors.entries()]
      .map(([door, v]) => ({
        door, n: v.prices.length,
        med: median(v.prices), min: Math.min(...v.prices), max: Math.max(...v.prices),
        ping: v.pings.length ? median(v.pings) : 0,
        last: v.dates.sort().slice(-1)[0] || "",
        floors: [...v.floors].join("/"),
      }))
      .sort((a, b) => b.n - a.n || b.med - a.med);

    console.log(`\n共 ${rows.length} 個門牌有成交，前 25 名：\n`);
    console.log(`${"門牌".padEnd(24)}${"筆數".padStart(5)}${"中位數".padStart(8)}${"坪數".padStart(8)}  ${"最近成交".padEnd(12)}總樓層`);
    console.log("─".repeat(76));
    rows.slice(0, 25).forEach(r => {
      console.log(`${r.door.padEnd(24)}${String(r.n).padStart(5)}${r.med.toFixed(1).padStart(8)}` +
        `${(r.ping || 0).toFixed(1).padStart(8)}  ${(r.last || "—").padEnd(12)}${r.floors}`);
    });
    console.log("─".repeat(76));
    console.log(`（完整清單在下載的 door-index.json 裡，共 ${rows.length} 個門牌）`);

    out.生活圈.push({
      代碼: area.code, 名稱: area.name, 行政區: area.district,
      成交筆數: st.matched, 門牌數: rows.length,
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

  writeFileSync(path.join(ROOT, "door-index.json"), JSON.stringify(out, null, 1), "utf-8");
  console.log(`\n[完成] 門牌索引已寫入 door-index.json（` +
    `${out.生活圈.reduce((s, a) => s + a.門牌數, 0)} 個門牌）`);
  console.log(`這個檔案會被打包成可下載的檔案，不必從畫面上複製。`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
