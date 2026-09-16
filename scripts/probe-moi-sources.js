/**
 * 澄果團隊｜內政部實價登錄資料源探測（v3）
 * ------------------------------------------------
 * 前兩次探測的結論：
 *   v1：內政部查詢網站看得到的成交，確實不在任何「目前可下載」的檔案裡。
 *       十天檔交易日到 2026-08-22、115S2 季檔到 2026-06-03、115S3 還不能下載，
 *       「美術東六街117」在三個檔案裡都是 0 筆（路名有命中，所以比對邏輯沒壞）。
 *   v2：找到兩條很像的線索——
 *       (a) 下載頁有一個分頁叫「非本期下載」，內容由 DownloadHistory_ajax_list 動態載入，
 *           那支網址回傳 20 KB 的 HTML 表格，看起來就是歷史批次清單。
 *       (b) Download?...&period=1150801 回傳了 1,770 KB 的 ZIP。
 *           但大小和本期十天檔一模一樣，很可能是參數被忽略、回傳同一個檔案。
 *
 * v3 就是把這兩件事查清楚：
 *   一、把 DownloadHistory_ajax_list 的表格內容整個攤開——
 *       連結、onclick、隱藏欄位、下拉選單的值，全部印出來。
 *       只要裡面有帶期別參數的下載網址，空窗期就能一次補齊。
 *   二、用不同的 period 各下載一次，比對檔案的 MD5 與交易日範圍。
 *       MD5 相同 → 參數被忽略，此路不通；不同 → 真的能指定期別。
 *
 * 只讀不寫，不會更動 repo 內任何檔案。
 *
 * 用法：node scripts/probe-moi-sources.js [門牌關鍵字]
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-probe");
const KEYWORD = (process.argv[2] || "美術東六街117").trim();
const ROAD_ONLY = KEYWORD.replace(/[0-9０-９]+$/, "") || KEYWORD;
const BASE = "https://plvr.land.moi.gov.tw";
const UA = `-A "Mozilla/5.0 (compatible; chengguo-site/1.0)"`;

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

function get(url, file) {
  try {
    run(`curl -sL --connect-timeout 20 --max-time 120 ${UA} -o "${file}" "${url}"`);
    return existsSync(file) ? statSync(file).size : 0;
  } catch { return 0; }
}

function md5(file) {
  try { return run(`md5sum "${file}"`).trim().split(/\s+/)[0]; } catch { return "?"; }
}

const norm = s => String(s || "")
  .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/\s+/g, "");

const roc = s => {
  s = String(s || "").trim();
  if (s.length < 6) return "";
  return `${parseInt(s.slice(0, s.length - 4), 10) + 1911}-${s.slice(-4, -2)}-${s.slice(-2)}`;
};

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

/* 解開一個 zip，回報高雄的日期範圍與關鍵字命中 */
function inspectZip(zipPath, label) {
  const dir = path.join(TMP, "x");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try { run(`unzip -o -q "${zipPath}" -d "${dir}"`); }
  catch { return `    不是有效的壓縮檔`; }
  const lines = [];
  for (const suffix of ["a", "b"]) {
    const re = new RegExp(`^E_lvr_land_${suffix}\\.csv$`, "i");
    const files = readdirSync(dir).filter(f => re.test(f));
    if (!files.length) { lines.push(`    高雄 _${suffix} 檔：不存在`); continue; }
    let n = 0, dates = [], roadHits = 0, hits = [];
    for (const f of files) {
      const rows = parseCSV(readFileSync(path.join(dir, f), "utf-8"));
      if (rows.length < 3) continue;
      const header = rows[0].map(h => h.trim());
      const iDate = header.indexOf("交易年月日");
      const iAddr = header.indexOf("土地位置建物門牌");
      const iFloor = header.indexOf("移轉層次");
      rows.slice(2).forEach(r => {
        n++;
        const d = String(r[iDate] || "").trim();
        if (d.length >= 6) dates.push(d);
        if (iAddr < 0) return;
        const a = norm(r[iAddr]);
        if (a.includes(norm(ROAD_ONLY))) roadHits++;
        if (a.includes(norm(KEYWORD))) hits.push(`${r[iAddr]}｜${roc(d)}｜${r[iFloor] || ""}`);
      });
    }
    dates.sort();
    lines.push(`    ${suffix === "a" ? "成屋" : "預售"} ${n} 筆` +
      (dates.length ? `，交易日 ${roc(dates[0])} ～ ${roc(dates[dates.length - 1])}` : "") +
      `，「${ROAD_ONLY}」${roadHits} 筆／「${KEYWORD}」${hits.length} 筆`);
    hits.slice(0, 10).forEach(h => lines.push(`      ★ ${h}`));
  }
  rmSync(dir, { recursive: true, force: true });
  return lines.join("\n");
}

/* 把 HTML 裡的表格攤成純文字，方便在記錄檔裡直接讀 */
function tableToText(html) {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(tr|table)[^>]*>/gi, "\n")
    .replace(/<\s*\/?\s*(td|th)[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .split("\n").map(l => l.replace(/\s+/g, " ").replace(/(\s*\|\s*)+/g, " | ").trim())
    .filter(l => l && l !== "|")
    .join("\n");
}

async function main() {
  console.log(`\n=== 內政部實價登錄資料源探測 v3 ===`);
  console.log(`門牌關鍵字：${KEYWORD}（對照組：${ROAD_ONLY}）`);
  console.log(`今天：${new Date().toISOString().slice(0, 10)}\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  /* ---------- 一、非本期下載清單 ---------- */
  console.log(`══════════════════════════════════════════`);
  console.log(`一、「非本期下載」的清單內容`);
  console.log(`══════════════════════════════════════════`);
  for (const p of ["DownloadHistory_ajax_list", "Download_ajax_list", "Download_ajax_active"]) {
    const url = `${BASE}/${p}`;
    const f = path.join(TMP, "list.html");
    const size = get(url, f);
    console.log(`\n【${p}】 ${size} bytes`);
    if (!size) { console.log(`  拿不到內容`); continue; }
    const html = readFileSync(f, "utf-8");

    /* 1) 所有帶參數的路徑：真正的下載網址就在這裡面 */
    const paths = new Set();
    for (const m of html.matchAll(/["'(]([^"'()\s<>]*(?:Download|download)[^"'()\s<>]*)["')]/g)) {
      if (m[1].length > 3 && !m[1].startsWith("#")) paths.add(m[1]);
    }
    /* 2) onclick / javascript 呼叫裡的參數 */
    const calls = new Set();
    for (const m of html.matchAll(/(?:onclick|href)\s*=\s*["']([^"']*(?:javascript:|\()[^"']*)["']/gi)) {
      calls.add(m[1].replace(/\s+/g, " ").slice(0, 160));
    }
    /* 3) 表單隱藏欄位與下拉選單的值：期別代碼通常在這裡 */
    const vals = new Set();
    for (const m of html.matchAll(/<(?:input|option)[^>]*value\s*=\s*["']([^"']{2,40})["'][^>]*>/gi)) {
      vals.add(m[1]);
    }

    console.log(`  含 Download 的路徑（${paths.size}）：`);
    [...paths].slice(0, 40).forEach(u => console.log(`    ${u}`));
    console.log(`  onclick／javascript 呼叫（${calls.size}）：`);
    [...calls].slice(0, 30).forEach(u => console.log(`    ${u}`));
    console.log(`  input／option 的 value（${vals.size}）：`);
    [...vals].slice(0, 60).forEach(u => console.log(`    ${u}`));

    const text = tableToText(html);
    console.log(`  表格內容（前 40 行）：`);
    text.split("\n").slice(0, 40).forEach(l => console.log(`    ${l}`));
  }

  /* ---------- 二、period 參數到底有沒有作用 ---------- */
  console.log(`\n══════════════════════════════════════════`);
  console.log(`二、period 參數有沒有作用`);
  console.log(`══════════════════════════════════════════`);
  console.log(`（MD5 都一樣 → 參數被忽略，回傳的都是同一個本期檔案，此路不通）\n`);

  const PERIODS = ["", "1150801", "1150811", "1150821", "1150901", "1150701"];
  const seen = new Map();
  for (const p of PERIODS) {
    const url = `${BASE}/Download?type=zip&fileName=lvr_landcsv.zip` + (p ? `&period=${p}` : "");
    const f = path.join(TMP, `p_${p || "none"}.zip`);
    const size = get(url, f);
    const hash = size ? md5(f) : "-";
    const label = p ? `period=${p}` : "（不帶 period）";
    console.log(`${label}　${(size / 1024).toFixed(0)} KB　MD5 ${hash.slice(0, 12)}`);
    if (size) {
      if (seen.has(hash)) {
        console.log(`    ↳ 與 ${seen.get(hash)} 完全相同`);
      } else {
        seen.set(hash, label);
        console.log(inspectZip(f, label));
      }
    }
    rmSync(f, { force: true });
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`\n══════════════════════════════════════════`);
  console.log(`結論要看什麼`);
  console.log(`══════════════════════════════════════════`);
  console.log(`1. 第二節如果出現兩個以上不同的 MD5，代表 period 真的可以指定期別，`);
  console.log(`   那就能把 7～9 月的批次逐期抓回來，空窗一次補齊。`);
  console.log(`2. 第一節如果清單裡有帶期別的下載網址，把那幾行貼給我。`);
  console.log(`3. 兩者都不通的話，就等 115S3 季檔（約 10 月下旬）自動補上。`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
