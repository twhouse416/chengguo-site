/**
 * 澄果團隊｜回補四大生活圈成交資料池
 * ------------------------------------------------
 * 把內政部「拿得到的所有批次」下載回來，落在四大生活圈範圍內的全部存進
 * data/area-deals/。跑完之後，社區頁的成交是從池子撈的，
 * 新增社區或修改門牌範圍都不必再向內政部重抓。
 *
 * 會抓三種來源（見 scripts/lib/moi-download.js 的說明）：
 *   - 季檔 N 期：長期歷史
 *   - 非本期批次七期：季檔還沒收錄的那一段（這正是原本資料會缺一塊的原因）
 *   - 本期十天檔：最近一次公告
 *
 * 用法：
 *   node scripts/backfill-area-pool.js [季檔期數]
 *   node scripts/backfill-area-pool.js 20      近 20 季（五年）＋ 全部非本期 ＋ 本期
 *   node scripts/backfill-area-pool.js 0       只抓非本期與本期（很快，用來補空窗）
 *
 * 記憶體：逐檔處理——下載一個、比對完立刻存檔並刪掉暫存，
 * 不把所有期別堆在記憶體裡（早期版本那樣做，跑 20 季會爆掉 Node 的堆積上限）。
 * 另外只讀高雄的 E_lvr_land_*.csv。
 *
 * 逐檔存檔還有一個好處：中途失敗也保住前面的成果，不必從頭再跑半小時。
 *
 * 這支腳本只寫 data/area-deals/，不會動 data/communities.json 或
 * data/community-deals.json。要讓社區頁反映新資料，回補完再跑一次
 * 「更新四大生活圈行情」。
 */

import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeIntoPool, loadPool } from "./lib/deal-pool.js";
import {
  CURRENT_URL, historyUrl, seasonUrl, seasonCode,
  listHistoryPeriods, downloadAndExtract, readAll, dateRange,
} from "./lib/moi-download.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-pool");
const AREAS = JSON.parse(readFileSync(path.join(ROOT, "config/areas.json"), "utf-8"));
const CITY = "E";   // 四大生活圈都在高雄

async function main() {
  const seasons = Math.max(0, parseInt(process.argv[2], 10) || 20);

  console.log(`\n=== 回補四大生活圈成交資料池 ===`);
  console.log(`生活圈：${AREAS.areas.map(a => a.name).join("、")}`);
  console.log(`季檔：近 ${seasons} 季\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const before = loadPool().length;
  console.log(`資料池現有 ${before} 筆\n`);

  /* 要抓的清單。先季檔（由舊到新），再非本期，最後本期——
     同一筆在多個檔案裡出現時，後寫入的會覆蓋前面的，
     所以讓最新的檔案最後處理，內容以最新公告為準。 */
  const jobs = [];
  for (let i = seasons; i >= 1; i--) {
    const s = seasonCode(i);
    jobs.push({ label: `季檔 ${s}`, url: seasonUrl(s), key: `s${s}` });
  }
  const periods = listHistoryPeriods(TMP);
  console.log(`非本期批次：${periods.length ? periods.join("、") : "（清單讀不到）"}\n`);
  periods.forEach(p => jobs.push({ label: `非本期 ${p}`, url: historyUrl(p), key: `h${p}` }));
  jobs.push({ label: "本期十天檔", url: CURRENT_URL, key: "current" });

  let ok = 0, skipped = 0, readTotal = 0;
  for (const job of jobs) {
    process.stdout.write(`${job.label} … `);
    const dir = downloadAndExtract(job.url, job.key, TMP);
    if (!dir) { console.log("略過"); skipped++; continue; }

    const recs = readAll(dir, CITY);
    readTotal += recs.length;
    const range = dateRange(recs);

    const { added, total } = mergeIntoPool(recs, AREAS);
    const sum = Object.values(added).reduce((s, n) => s + n, 0);
    console.log(`讀 ${recs.length} 筆` +
      (range ? `（交易日 ${range[0]} ～ ${range[1]}）` : "") +
      `，池中新增 ${sum} 筆，累計 ${total} 筆`);
    ok++;

    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(TMP, { recursive: true, force: true });

  const pool = loadPool();
  const range = dateRange(pool);

  console.log(`\n────────────────────────────────`);
  console.log(`檔案：成功 ${ok} 個、略過 ${skipped} 個，共讀取 ${readTotal} 筆（高雄）`);
  console.log(`資料池：${before} → ${pool.length} 筆`);
  if (range) console.log(`交易日範圍：${range[0]} ～ ${range[1]}`);
  console.log(`\n下一步：跑一次「更新四大生活圈行情」，社區頁才會反映池子裡的新資料。`);

  if (!ok) {
    console.error(`\n[中止] 所有檔案都下載失敗，資料池未變動。`);
    process.exit(1);
  }
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
