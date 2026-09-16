/**
 * 澄果團隊｜內政部實價登錄資料源探測（v4）
 * ------------------------------------------------
 * v3 已經找到關鍵：「非本期下載」分頁真的列出了過去每一期的批次——
 *   發布日期 20260701 / 20260711 / 20260721 / 20260801 / 20260811 / 20260821 / 20260901
 * 每一列後面都有一個「下載」。空窗期（7～9 月）的資料就在這幾期裡。
 *
 * 也確認了 Download?...&period=... 是沒用的：六種 period 下載回來的 MD5 完全一樣，
 * 參數被忽略，回傳的都是同一個本期檔案。
 *
 * 剩下的問題只有一個：那個「下載」按鈕實際送出的網址長什麼樣。
 * v3 看到頁面裡有 DownloadHistory?type=history&fileName= 與 javaScript:downloadLast(
 * 但括號裡的參數被我的比對式吃掉了（href 裡是雙引號包單引號，正則在第一個單引號就斷了）。
 *
 * v4 用三個方法把它挖出來：
 *   一、改用只認雙引號的比對式重抓 href／onclick，並把每一個「發布日期」附近的
 *       原始 HTML 原封不動印出來，參數一定在裡面。
 *   二、直接抓 /js/downloadManager.js，把 downloadLast 這個函式的內容印出來，
 *       它怎麼組網址一看就知道。
 *   三、照猜測的幾種寫法實際下載 20260701 那一期，回傳 ZIP 就算成功。
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
/* 帶 Referer 與 cookie 罐：歷史下載常要求先進過頁面 */
const JAR = () => `-b "${path.join(TMP, "cookie.txt")}" -c "${path.join(TMP, "cookie.txt")}"`;
const UA = `-A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" -e "${BASE}/DownloadOpenData"`;

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}
function get(url, file) {
  try {
    run(`curl -sL --connect-timeout 20 --max-time 120 ${UA} ${JAR()} -o "${file}" "${url}"`);
    return existsSync(file) ? statSync(file).size : 0;
  } catch { return 0; }
}
function isZip(file) {
  if (!existsSync(file) || statSync(file).size < 4) return false;
  const b = readFileSync(file).subarray(0, 2);
  return b[0] === 0x50 && b[1] === 0x4b;
}
function peek(file, n = 220) {
  if (!existsSync(file)) return "（沒有檔案）";
  if (isZip(file)) return "★★ 是 ZIP 檔 ★★";
  return readFileSync(file).subarray(0, n).toString("utf-8").replace(/\s+/g, " ").trim();
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

function inspectZip(zipPath) {
  const dir = path.join(TMP, "x");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try { run(`unzip -o -q "${zipPath}" -d "${dir}"`); }
  catch { return `      解壓失敗`; }
  const lines = [];
  for (const suffix of ["a", "b"]) {
    const files = readdirSync(dir).filter(f => new RegExp(`^E_lvr_land_${suffix}\\.csv$`, "i").test(f));
    if (!files.length) { lines.push(`      高雄 _${suffix}：不存在`); continue; }
    let n = 0, dates = [], roadHits = 0, hits = [];
    for (const f of files) {
      const rows = parseCSV(readFileSync(path.join(dir, f), "utf-8"));
      if (rows.length < 3) continue;
      const h = rows[0].map(x => x.trim());
      const iD = h.indexOf("交易年月日"), iA = h.indexOf("土地位置建物門牌"), iF = h.indexOf("移轉層次");
      rows.slice(2).forEach(r => {
        n++;
        const d = String(r[iD] || "").trim();
        if (d.length >= 6) dates.push(d);
        if (iA < 0) return;
        const a = norm(r[iA]);
        if (a.includes(norm(ROAD_ONLY))) roadHits++;
        if (a.includes(norm(KEYWORD))) hits.push(`${r[iA]}｜${roc(d)}｜${r[iF] || ""}`);
      });
    }
    dates.sort();
    lines.push(`      ${suffix === "a" ? "成屋" : "預售"} ${n} 筆` +
      (dates.length ? `，交易日 ${roc(dates[0])} ～ ${roc(dates[dates.length - 1])}` : "") +
      `，「${ROAD_ONLY}」${roadHits} 筆／「${KEYWORD}」${hits.length} 筆`);
    hits.slice(0, 10).forEach(x => lines.push(`        ★ ${x}`));
  }
  rmSync(dir, { recursive: true, force: true });
  return lines.join("\n");
}

async function main() {
  console.log(`\n=== 內政部實價登錄資料源探測 v4 ===`);
  console.log(`門牌關鍵字：${KEYWORD}（對照組：${ROAD_ONLY}）`);
  console.log(`今天：${new Date().toISOString().slice(0, 10)}\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  /* 先進一次首頁，把 cookie 拿到手 */
  get(`${BASE}/DownloadOpenData`, path.join(TMP, "home.html"));

  /* ---------- 一、非本期清單的原始 HTML ---------- */
  console.log(`══════════════════════════════════════════`);
  console.log(`一、「下載」按鈕的原始碼長什麼樣`);
  console.log(`══════════════════════════════════════════`);
  const f = path.join(TMP, "list.html");
  const size = get(`${BASE}/DownloadHistory_ajax_list`, f);
  console.log(`DownloadHistory_ajax_list：${size} bytes\n`);
  if (size) {
    const html = readFileSync(f, "utf-8");

    /* 只認雙引號，這樣 href="javaScript:downloadLast('20260701')" 的單引號才不會把比對切斷 */
    const attrs = new Set();
    for (const m of html.matchAll(/(?:href|onclick|onChange|data-[a-z-]+)\s*=\s*"([^"]{2,200})"/gi)) {
      attrs.add(m[1].replace(/\s+/g, " ").trim());
    }
    console.log(`  href／onclick／data-* 的完整內容（${attrs.size}）：`);
    [...attrs].slice(0, 60).forEach(a => console.log(`    ${a}`));

    /* 每一個發布日期附近的原始 HTML，參數一定在這裡面 */
    console.log(`\n  每一期「發布日期」前後的原始碼：`);
    const seen = new Set();
    for (const m of html.matchAll(/2026\d{4}/g)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      const s = Math.max(0, m.index - 260);
      const snippet = html.slice(s, m.index + 320).replace(/\s+/g, " ");
      console.log(`\n    ── ${m[0]} ──`);
      console.log(`    ${snippet}`);
    }
  }

  /* ---------- 二、downloadLast 是怎麼組網址的 ---------- */
  console.log(`\n══════════════════════════════════════════`);
  console.log(`二、downloadLast 函式的內容`);
  console.log(`══════════════════════════════════════════`);
  for (const js of ["/js/downloadManager.js", "/js/menu_ajax.js", "/js/qt/qt-ajax.js"]) {
    const jf = path.join(TMP, "s.js");
    const n = get(BASE + js, jf);
    console.log(`\n【${js}】${n} bytes`);
    if (!n) { console.log(`  拿不到`); continue; }
    const src = readFileSync(jf, "utf-8");
    /* 把含有 download / History / season 的行印出來，網址組法就在裡面 */
    const lines = src.split("\n")
      .map((l, i) => [i + 1, l.trim()])
      .filter(([, l]) => /download|History|season|url\s*[:=]|\.zip/i.test(l));
    console.log(`  相關的 ${lines.length} 行：`);
    lines.slice(0, 60).forEach(([i, l]) => console.log(`    ${String(i).padStart(4)}  ${l.slice(0, 170)}`));
  }

  /* ---------- 三、實際試抓 20260701 那一期 ---------- */
  console.log(`\n══════════════════════════════════════════`);
  console.log(`三、實際試抓 20260701 這一期`);
  console.log(`══════════════════════════════════════════`);
  console.log(`（回傳 ZIP 就是成功，其餘都是錯誤頁）\n`);

  const P = "20260701";
  const TRIES = [
    `${BASE}/DownloadHistory?type=history&fileName=${P}`,
    `${BASE}/DownloadHistory?type=history&fileName=${P}.zip`,
    `${BASE}/DownloadHistory?type=history&fileName=lvr_landcsv.zip&period=${P}`,
    `${BASE}/DownloadHistory?type=history&fileName=lvr_landcsv.zip&historyName=${P}`,
    `${BASE}/DownloadHistory?type=history&fileName=lvr_landcsv.zip&date=${P}`,
    `${BASE}/DownloadHistory?type=history&fileName=${P}_lvr_landcsv.zip`,
    `${BASE}/DownloadHistory?type=season&fileName=lvr_landcsv.zip&season=115S2`,
    `${BASE}/Download?type=history&fileName=lvr_landcsv.zip&historyName=${P}`,
  ];
  for (const u of TRIES) {
    const zf = path.join(TMP, "t.zip");
    rmSync(zf, { force: true });
    const n = get(u, zf);
    const ok = isZip(zf);
    console.log(`${u}`);
    console.log(`  ${(n / 1024).toFixed(0)} KB　${ok ? "★★ ZIP ★★" : "不是 ZIP"}`);
    console.log(`  ${peek(zf)}`);
    if (ok) console.log(inspectZip(zf));
    console.log("");
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`══════════════════════════════════════════`);
  console.log(`第三節只要有一行出現 ★★ ZIP ★★，空窗期就能補齊。`);
  console.log(`都沒有的話，把第一、二節的內容貼給我，網址的組法就在那裡面。`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
