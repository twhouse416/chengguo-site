/**
 * 澄果團隊｜內政部實價登錄資料源探測（v2）
 * ------------------------------------------------
 * 第一次探測（v1）已經確認的事：
 *   - 十天檔：高雄成屋 788 筆，交易日最晚 2026-08-22
 *   - 115S2 季檔：高雄成屋 9,651 筆，交易日最晚 2026-06-03
 *   - 115S3 季檔：回傳的是 HTML 錯誤頁，本季還不能下載
 *   - 「美術東六街117」在上面每一個檔案裡都命中 0 筆
 *
 * 也就是說，內政部查詢網站看得到的那幾筆，確實不在任何「目前可下載」的檔案裡。
 * 原因是批次公告的時間差：那些成交公告於 7～8 月，
 * 當時的十天檔早就被新的一批換掉，而涵蓋它們的 115S3 季檔要等本季結束才發布。
 *
 * v2 要回答的是「那些過期的批次，還有沒有辦法拿到」。
 * DownloadOpenData 頁面上有一個「歷史資料」分頁（#tab_opendata_history_content），
 * 但內容是 JavaScript 動態載入的，所以 v1 只看到一個錨點、看不到真正的網址。
 * 這一版改成：
 *   1. 把頁面原始碼裡所有像網址的字串挖出來（含 JS 變數、ajax 參數）
 *   2. 逐一測試幾個猜測的歷史批次端點，印出狀態與前幾百個字元
 *   3. 順便用「路名」層級再比對一次，確認比對邏輯本身沒壞
 *      （如果路名有命中、門牌沒有，就是資料真的沒有，不是程式的問題）
 *
 * 只讀不寫，不會更動 repo 內任何檔案。
 *
 * 用法：
 *   node scripts/probe-moi-sources.js [門牌關鍵字]
 *   node scripts/probe-moi-sources.js 美術東六街117
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-probe");
const KEYWORD = (process.argv[2] || "美術東六街117").trim();
/* 去掉結尾數字，得到路名，用來做對照組 */
const ROAD_ONLY = KEYWORD.replace(/[0-9０-９]+$/, "") || KEYWORD;

const BASE = "https://plvr.land.moi.gov.tw";

function seasonCode(back) {
  const now = new Date();
  let y = now.getFullYear() - 1911;
  let q = Math.ceil((now.getMonth() + 1) / 3) - back;
  while (q <= 0) { q += 4; y -= 1; }
  return `${y}S${q}`;
}

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

const UA = `-A "Mozilla/5.0 (compatible; chengguo-site/1.0)"`;

function probeUrl(url) {
  try {
    const out = run(`curl -sL --connect-timeout 20 --max-time 90 ${UA} ` +
      `-o "${path.join(TMP, "probe.bin")}" ` +
      `-w "%{http_code}|%{content_type}|%{size_download}" "${url}"`);
    const [code, type, size] = out.trim().split("|");
    return { code, type, size: parseInt(size, 10) || 0 };
  } catch (e) {
    return { code: "ERR", type: e.message.slice(0, 100), size: 0 };
  }
}

function peek(n = 300) {
  const f = path.join(TMP, "probe.bin");
  if (!existsSync(f)) return "";
  const buf = readFileSync(f);
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (isZip) return "（是 ZIP 檔）";
  return buf.slice(0, n).toString("utf-8").replace(/\s+/g, " ").trim();
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

const norm = s => String(s || "")
  .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/\s+/g, "");

const roc = s => {
  s = String(s || "").trim();
  if (s.length < 6) return "";
  return `${parseInt(s.slice(0, s.length - 4), 10) + 1911}-${s.slice(-4, -2)}-${s.slice(-2)}`;
};

/* 看一個解壓目錄裡高雄（E 檔）的日期範圍與命中情況 */
function inspect(dir) {
  const out = [];
  for (const suffix of ["a", "b"]) {
    const re = new RegExp(`^E_lvr_land_${suffix}\\.csv$`, "i");
    const files = readdirSync(dir).filter(f => re.test(f));
    if (!files.length) { out.push(`  高雄 _${suffix} 檔：不存在`); continue; }
    let n = 0, hits = [], roadHits = 0, dates = [];
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
    const kind = suffix === "a" ? "成屋" : "預售";
    out.push(`  高雄 ${kind}：${n} 筆` +
      (dates.length ? `，交易日 ${roc(dates[0])} ～ ${roc(dates[dates.length - 1])}` : ""));
    /* 路名層級的命中數是對照組：路名有、門牌沒有 → 資料真的沒有，不是比對壞掉 */
    out.push(`    「${ROAD_ONLY}」命中 ${roadHits} 筆　／　「${KEYWORD}」命中 ${hits.length} 筆`);
    hits.slice(0, 15).forEach(h => out.push(`      ${h}`));
    if (hits.length > 15) out.push(`      …還有 ${hits.length - 15} 筆`);
  }
  return out.join("\n");
}

function downloadAndInspect(url) {
  const zip = path.join(TMP, "x.zip");
  const dir = path.join(TMP, "x");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    run(`curl -sL -f --connect-timeout 30 --max-time 300 ${UA} -o "${zip}" "${url}"`);
  } catch { return "  下載失敗"; }
  const size = existsSync(zip) ? statSync(zip).size : 0;
  if (!size) return "  下載到空檔案";
  try { run(`unzip -o -q "${zip}" -d "${dir}"`); }
  catch { return `  下載 ${(size / 1024 / 1024).toFixed(1)} MB，但不是有效的壓縮檔（回傳的多半是錯誤頁）`; }
  return `  下載 ${(size / 1024 / 1024).toFixed(1)} MB\n` + inspect(dir);
}

async function main() {
  console.log(`\n=== 內政部實價登錄資料源探測 v2 ===`);
  console.log(`門牌關鍵字：${KEYWORD}（對照組：${ROAD_ONLY}）`);
  console.log(`今天：${new Date().toISOString().slice(0, 10)}\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  /* ---------- 一、把 DownloadOpenData 頁面裡所有像網址的字串挖出來 ---------- */
  console.log(`══════════════════════════════════════════`);
  console.log(`一、資料下載頁的原始碼裡有哪些網址`);
  console.log(`══════════════════════════════════════════`);
  for (const page of [`${BASE}/DownloadOpenData`, `${BASE}/DownloadHistory`]) {
    const st = probeUrl(page);
    console.log(`\n${page}\n  HTTP ${st.code}　${st.size} bytes`);
    if (st.code !== "200" || !st.size) { console.log(`  → 拿不到內容`); continue; }
    const html = readFileSync(path.join(TMP, "probe.bin"), "utf-8");

    /* href/action 之外，也把 JS 字串裡的路徑挖出來——歷史資料那一頁是動態載入的，
       真正的網址通常寫在 inline script 裡，不會出現在 href 上。 */
    const urls = new Set();
    for (const m of html.matchAll(/["'`]([^"'`\s<>]*(?:Download|download|history|History|season|Season|ajax|Ajax)[^"'`\s<>]*)["'`]/g)) {
      const u = m[1];
      if (u.length > 3 && !u.startsWith("#") && !/\.(png|jpg|gif|svg|ico)$/i.test(u)) urls.add(u);
    }
    console.log(`  挖到 ${urls.size} 個候選路徑：`);
    [...urls].slice(0, 60).forEach(u => console.log(`    ${u}`));

    const seasons = [...new Set([...html.matchAll(/\b1[01]\dS[1-4]\b/g)].map(m => m[0]))].sort();
    if (seasons.length) console.log(`  頁面提到的季別：${seasons.join("、")}`);

    /* 歷史資料分頁的標題文字，看它自稱提供什麼 */
    const tabs = [...new Set([...html.matchAll(/<a[^>]*href="#tab_[^"]*"[^>]*>([^<]{2,30})</g)].map(m => m[1].trim()))];
    if (tabs.length) console.log(`  頁面分頁：${tabs.join(" ｜ ")}`);
  }

  /* ---------- 二、猜測的歷史批次端點 ---------- */
  console.log(`\n══════════════════════════════════════════`);
  console.log(`二、測試可能的歷史批次下載端點`);
  console.log(`══════════════════════════════════════════`);
  console.log(`（目的：找出能拿到「已經過期的十天檔」的網址。`);
  console.log(`  回傳 ZIP 才算數，回傳 HTML 代表那個網址不是這樣用的。）\n`);

  const GUESSES = [
    `${BASE}/DownloadHistory?type=history&fileName=lvr_landcsv.zip`,
    `${BASE}/DownloadHistory?fileName=lvr_landcsv.zip&type=zip`,
    `${BASE}/Download?type=history&fileName=lvr_landcsv.zip`,
    `${BASE}/DownloadSeason?season=115S3&type=zip&fileName=lvr_landcsv.zip`,
    `${BASE}/DownloadSeason?season=115S2&type=zip&fileName=lvr_landcsv.zip&t=${Date.now()}`,
    `${BASE}/Download?type=zip&fileName=lvr_landcsv.zip&period=1150801`,
    `${BASE}/DownloadHistory_ajax_list`,
    `${BASE}/ppTransactionQuery`,
  ];
  for (const u of GUESSES) {
    const st = probeUrl(u);
    console.log(`${u}`);
    console.log(`  HTTP ${st.code}　${st.type}　${(st.size / 1024).toFixed(0)} KB`);
    console.log(`  開頭：${peek(200) || "（空）"}\n`);
  }

  /* ---------- 三、現有可下載來源的實際涵蓋範圍 ---------- */
  console.log(`══════════════════════════════════════════`);
  console.log(`三、目前確定可下載的來源，各自涵蓋到哪一天`);
  console.log(`══════════════════════════════════════════`);
  const SOURCES = [
    ["十天檔（每次更新在用的）", `${BASE}/Download?type=zip&fileName=lvr_landcsv.zip`],
    [`季檔 ${seasonCode(1)}`, `${BASE}/DownloadSeason?season=${seasonCode(1)}&type=zip&fileName=lvr_landcsv.zip`],
  ];
  for (const [label, url] of SOURCES) {
    console.log(`\n【${label}】`);
    console.log(downloadAndInspect(url));
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`\n══════════════════════════════════════════`);
  console.log(`怎麼看這份報告`);
  console.log(`══════════════════════════════════════════`);
  console.log(`1. 第二節如果有任何一個網址回傳 ZIP，那條路就通了，空窗期可以一次補齊。`);
  console.log(`2. 第一節挖到的候選路徑，如果出現像 DownloadHistory?type=... 之類帶參數的，`);
  console.log(`   那就是內政部真正在用的歷史下載網址，把它貼給我。`);
  console.log(`3. 第三節的「路名命中數」是對照組：路名有命中、門牌沒有，`);
  console.log(`   代表那幾筆成交確實不在這個檔案裡，不是比對程式壞掉。`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
