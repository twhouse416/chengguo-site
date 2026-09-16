/**
 * 澄果團隊｜回補四大生活圈成交資料池
 * ------------------------------------------------
 * 一次把過去 N 季的實價登錄下載回來，落在四大生活圈範圍內的全部存進
 * data/area-deals/。跑完之後，每個社區頁的成交紀錄都是從池子裡撈，
 * 新增社區、修改門牌範圍都不必再向內政部重抓。
 *
 * 用法：
 *   node scripts/backfill-area-pool.js [期數]
 *   node scripts/backfill-area-pool.js 20      近 20 季（五年）
 *
 * 記憶體：逐季處理——下載一季、比對完立刻存檔並刪掉暫存，
 * 不把所有季別的紀錄堆在記憶體裡（早期版本那樣做，跑 20 季會爆掉 Node 的堆積上限）。
 * 另外只讀高雄的 E_lvr_land_*.csv，不讀其他縣市。
 *
 * 成屋（_a）與預售（_b）都會收。新建案的成交多半登錄在預售檔，
 * 少了它，剛交屋的社區頁會是空的。
 *
 * 這支腳本只寫 data/area-deals/，不會動 data/communities.json 或
 * data/community-deals.json。要讓社區頁反映新資料，回補完再跑一次
 * 「更新四大生活圈行情」。
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeIntoPool, loadPool } from "./lib/deal-pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-pool");
const AREAS = JSON.parse(readFileSync(path.join(ROOT, "config/areas.json"), "utf-8"));

/* 四大生活圈都在高雄，季檔裡高雄是 E_lvr_land_*.csv。
   只讀這一支，記憶體與解析時間都省下二十分之一；
   萬一檔名對不上（內政部改格式）就退回讀全部，不會整個跑不動。 */
const CITY_PREFIX = "E";

const SEASON_ZIP_URL = s =>
  `https://plvr.land.moi.gov.tw/DownloadSeason?season=${s}&type=zip&fileName=lvr_landcsv.zip`;

function seasonCode(back) {
  const now = new Date();
  let y = now.getFullYear() - 1911;
  let q = Math.ceil((now.getMonth() + 1) / 3) - back;
  while (q <= 0) { q += 4; y -= 1; }
  return `${y}S${q}`;
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
  return rows.filter(r => r.length > 1);
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

/* suffix: "a" 成屋、"b" 預售 */
function readCsv(dir, suffix, presale) {
  const re = new RegExp(`_lvr_land_${suffix}\\.csv$`, "i");
  const all = readdirSync(dir).filter(f => re.test(f));
  const city = all.filter(f => f.toUpperCase().startsWith(CITY_PREFIX + "_"));
  const files = city.length ? city : all;
  const out = [];
  for (const file of files) {
    const rows = parseCSV(readFileSync(path.join(dir, file), "utf-8"));
    if (rows.length < 3) continue;
    const header = rows[0];
    rows.slice(2).forEach(r => {
      const rec = {};
      header.forEach((h, i) => { rec[h.trim()] = r[i]; });
      if (presale) rec.__presale = true;
      out.push(rec);
    });
  }
  return out;
}

async function main() {
  const periods = parseInt(process.argv[2], 10) || 20;

  console.log(`\n=== 回補四大生活圈成交資料池（近 ${periods} 季）===`);
  console.log(`（從上一季往回抓——本季的季檔內政部通常還沒公告）`);
  console.log(`生活圈：${AREAS.areas.map(a => a.name).join("、")}\n`);

  const existing = loadPool().length;
  console.log(`資料池現有 ${existing} 筆\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  let readTotal = 0, ok = 0, fail = 0;
  for (let i = 0; i < periods; i++) {
    const season = seasonCode(i + 1);
    process.stdout.write(`${season} … `);
    const dir = download(season);
    if (!dir) { console.log("下載失敗，跳過"); fail++; continue; }

    const recs = [...readCsv(dir, "a", false), ...readCsv(dir, "b", true)];
    readTotal += recs.length;

    /* 逐季併入並存檔。這樣中途失敗也保住前面幾季的成果，
       不必從頭再跑一次三十分鐘。 */
    const { added, total } = mergeIntoPool(recs, AREAS);
    const sum = Object.values(added).reduce((s, n) => s + n, 0);
    console.log(`讀 ${recs.length} 筆，池中新增 ${sum} 筆，累計 ${total} 筆`);
    ok++;

    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(TMP, { recursive: true, force: true });

  const after = loadPool();
  const dates = after.map(r => String(r["交易年月日"] || "")).filter(Boolean).sort();

  console.log(`\n────────────────────────────────`);
  console.log(`季檔：成功 ${ok} 季、失敗 ${fail} 季，共讀取 ${readTotal} 筆（高雄）`);
  console.log(`資料池：${existing} → ${after.length} 筆`);
  if (dates.length) {
    const fmt = s => `${parseInt(s.slice(0, s.length - 4), 10) + 1911}-${s.slice(-4, -2)}-${s.slice(-2)}`;
    console.log(`交易日範圍：${fmt(dates[0])} ～ ${fmt(dates[dates.length - 1])}`);
  }
  console.log(`\n下一步：跑一次「更新四大生活圈行情」，社區頁才會反映池子裡的新資料。`);

  if (!ok) {
    console.error(`\n[中止] 所有季檔都下載失敗，資料池未變動。`);
    process.exit(1);
  }
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
