/**
 * 澄果團隊｜門牌比對診斷工具
 * ------------------------------------------------
 * 用途：當某個社區的成交筆數跟實價登錄網站對不起來時，
 * 用這支腳本把內政部原始檔案裡「所有含指定關鍵字的列」直接印出來，
 * 看清楚到底是「檔案裡就沒有」還是「有但被我們的條件濾掉了」。
 *
 * 用法：
 *   node scripts/debug-address-match.js "裕誠路168" 4
 *   node scripts/debug-address-match.js "龍勝路28" 4
 *
 * 第一個參數是門牌關鍵字（會自動做全形轉半形），第二個是往回幾期。
 * 這支腳本只讀不寫，不會動到 data/ 底下任何檔案。
 */

import { readFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-debug");

const AREAS = JSON.parse(readFileSync(path.join(ROOT, "config/areas.json"), "utf-8"));
/* 判定用的型態與用途條件直接讀設定檔，避免跟正式流程不一致 */
const TYPE_MATCH = (AREAS.propertyTypes || []).flatMap(t => t.match);
const EXCLUDE_USES = AREAS.excludeUses || [];

const SEASON_ZIP_URL = season =>
  `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;

function normalize(str) {
  return String(str || "")
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "");
}

function rocToDate(v) {
  const s = String(v || "").trim();
  if (s.length < 6) return "";
  const y = parseInt(s.slice(0, s.length - 4), 10) + 1911;
  return `${y}-${s.slice(-4, -2)}-${s.slice(-2)}`;
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
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
  let rocYear = now.getFullYear() - 1911;
  let q = Math.ceil((now.getMonth() + 1) / 3) - back;
  while (q <= 0) { q += 4; rocYear -= 1; }
  return `${rocYear}S${q}`;
}

function download(season) {
  const zip = path.join(TMP, `${season}.zip`);
  const dir = path.join(TMP, season);
  mkdirSync(dir, { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync(
        `curl -L -f -s --connect-timeout 30 --max-time 300 ` +
        `-A "Mozilla/5.0 (compatible; chengguo-site/1.0)" -o "${zip}" "${SEASON_ZIP_URL(season)}"`,
        { stdio: "inherit" }
      );
      execSync(`unzip -o -q "${zip}" -d "${dir}"`);
      return dir;
    } catch (e) {
      console.warn(`  [警告] ${season} 第 ${attempt} 次下載失敗：${e.message}`);
      if (attempt < 3) execSync(`sleep ${attempt * 20}`);
    }
  }
  return null;
}

function readCsv(dir, pattern, isPresale) {
  const files = readdirSync(dir).filter(f => pattern.test(f));
  const records = [];
  for (const file of files) {
    const rows = parseCSV(readFileSync(path.join(dir, file), "utf-8"));
    if (rows.length < 3) continue;
    const header = rows[0];
    rows.slice(2).forEach(r => {
      const rec = {};
      header.forEach((h, i) => { rec[h.trim()] = r[i]; });
      rec.__file = file;
      rec.__presale = !!isPresale;
      records.push(rec);
    });
  }
  return records;
}

async function main() {
  const keyword = normalize(process.argv[2] || "");
  const periods = parseInt(process.argv[3], 10) || 4;
  if (!keyword) {
    console.error('用法：node scripts/debug-address-match.js "裕誠路168" 4');
    process.exit(1);
  }

  console.log(`\n=== 門牌比對診斷 ===`);
  console.log(`關鍵字：${keyword}（已做全形轉半形）`);
  console.log(`期數：${periods}`);
  console.log(`納入型態：${TYPE_MATCH.join("／") || "（未設定）"}`);
  console.log(`排除用途：${EXCLUDE_USES.join("、") || "（無）"}\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  let totalHits = 0;

  for (let i = 0; i < periods; i++) {
    const season = seasonCode(i);
    console.log(`\n────────── [${i + 1}/${periods}] ${season} ──────────`);

    const dir = download(season);
    if (!dir) {
      console.log(`❌ ${season} 下載失敗（這一期的資料完全沒有進來）`);
      continue;
    }

    const files = readdirSync(dir).filter(f => /_lvr_land_[ab]\.csv$/i.test(f));
    console.log(`✅ 下載成功，壓縮檔內共 ${readdirSync(dir).length} 個檔案`);

    const records = [
      ...readCsv(dir, /_lvr_land_a\.csv$/i, false),
      ...readCsv(dir, /_lvr_land_b\.csv$/i, true),
    ];
    console.log(`   讀到 ${records.length} 筆（全台）`);

    /* 不套任何條件，純粹找門牌含關鍵字的列 */
    const hits = records.filter(r =>
      normalize(r["土地位置建物門牌"]).includes(keyword)
    );

    if (!hits.length) {
      console.log(`   🔍 這一期完全沒有門牌含「${keyword}」的紀錄`);
      continue;
    }

    console.log(`   🔍 找到 ${hits.length} 筆門牌含「${keyword}」：\n`);
    totalHits += hits.length;

    const M2 = 0.3025;
    const wan = v => (v / M2 / 10000).toFixed(1);   // 元/㎡ → 萬元/坪

    hits.forEach(r => {
      const date = rocToDate(r["交易年月日"]);
      const price = parseFloat(r["單價元平方公尺"]);
      const cancelled = (r["解約情形"] || "").trim();
      const district = (r["鄉鎮市區"] || "").trim();
      const type = (r["建物型態"] || "").trim();

      const total = parseFloat(r["總價元"]) || 0;
      const area = parseFloat(r["建物移轉總面積平方公尺"]) || 0;
      const pkPrice = parseFloat(r["車位總價元"]) || 0;
      const pkArea = parseFloat(r["車位移轉總面積平方公尺"]) || 0;

      /* 扣掉車位後重算：車位的價格與面積比例不同，含車位的成交
         用內政部給的單價會失真，這裡兩種都算出來對照 */
      const netTotal = total - pkPrice;
      const netArea = area - pkArea;
      const netUnit = netArea > 0 ? netTotal / netArea : 0;

      const reasons = [];
      if (!(price > 0)) reasons.push(`單價元平方公尺無效（${r["單價元平方公尺"]}）`);
      if (cancelled) reasons.push(`已解約（${cancelled}）`);
      if (!date) reasons.push(`交易年月日無法解析（${r["交易年月日"]}）`);
      if (TYPE_MATCH.length && !TYPE_MATCH.some(k => type.includes(k)))
        reasons.push(`建物型態不在統計範圍（${type || "空白"}）`);
      const use = (r["主要用途"] || "").trim();
      if (use && EXCLUDE_USES.some(k => use.includes(k)))
        reasons.push(`主要用途被排除（${use}）`);

      const verdict = reasons.length ? `⛔ 會被濾掉：${reasons.join("、")}` : `✔ 條件全過`;

      console.log(`   ${date}  ${district}${(r["土地位置建物門牌"] || "").trim()}`);
      console.log(`      檔案 ${r.__file}${r.__presale ? "（預售）" : ""}　移轉層次 ${(r["移轉層次"] || "").trim()}／${(r["總樓層數"] || "").trim()}`);
      console.log(`      建物型態「${type}」　主要用途「${(r["主要用途"] || "").trim()}」`);
      console.log(`      總價 ${total.toLocaleString()} 元　建物面積 ${area} ㎡（${(area * M2).toFixed(1)} 坪）`);
      console.log(`      車位 ${(r["車位類別"] || "無").trim()}　車位價 ${pkPrice.toLocaleString()} 元　車位面積 ${pkArea} ㎡`);
      console.log(`      內政部單價 ${wan(price)} 萬/坪　｜　扣車位後 ${netUnit ? wan(netUnit) : "—"} 萬/坪`);
      console.log(`      ${verdict}\n`);
    });

    rmSync(dir, { recursive: true, force: true });
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`\n=== 診斷結束：${periods} 期內共找到 ${totalHits} 筆含「${keyword}」的紀錄 ===`);
  console.log(`（這個數字不套任何篩選條件，是檔案裡的原始筆數）\n`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
