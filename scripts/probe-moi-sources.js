/**
 * 澄果團隊｜內政部實價登錄資料源探測
 * ------------------------------------------------
 * 要解決的問題：
 * 內政部的查詢網站上看得到的成交，我們下載得到的檔案裡不一定有。
 * 例如賓果家築 115/06/28 那幾筆，查詢網站有，但我們抓到的第 2 季檔只到 115/05/19。
 * 原因是「十天檔」只保留最近一批公告，季檔則要等季末才發布、而且會分批補齊。
 * 中間那段成交，要嘛等季檔補上，要嘛得找到別的下載來源。
 *
 * 這支腳本不改任何資料，只做三件事：
 *   1. 逐一測試各個候選網址能不能下載（HTTP 狀態、檔案大小）
 *   2. 下載得到的，解開來看高雄的資料「交易日最早到最晚是哪一天」
 *   3. 順便查指定門牌在每個檔案裡有沒有出現
 *
 * 跑完看輸出就知道：
 *   - 空窗期的資料有沒有辦法補
 *   - 各個來源各自涵蓋到哪個日期
 *
 * 用法：
 *   node scripts/probe-moi-sources.js [門牌關鍵字]
 *   node scripts/probe-moi-sources.js 美術東六街117
 *
 * 只讀不寫，不會更動 repo 內任何檔案。
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-probe");
const KEYWORD = (process.argv[2] || "美術東六街117").trim();

const BASE = "https://plvr.land.moi.gov.tw";

function seasonCode(back) {
  const now = new Date();
  let y = now.getFullYear() - 1911;
  let q = Math.ceil((now.getMonth() + 1) / 3) - back;
  while (q <= 0) { q += 4; y -= 1; }
  return `${y}S${q}`;
}

/* 候選來源。註解寫清楚每一個在測什麼，測不到也是有用的結論。 */
const CANDIDATES = [
  {
    label: "十天檔（現行每次更新在用的）",
    url: `${BASE}/Download?type=zip&fileName=lvr_landcsv.zip`,
  },
  {
    label: `本季季檔 ${seasonCode(0)}（測試季中是否已可下載）`,
    url: `${BASE}/DownloadSeason?season=${seasonCode(0)}&type=zip&fileName=lvr_landcsv.zip`,
  },
  {
    label: `上一季季檔 ${seasonCode(1)}（現行在用的）`,
    url: `${BASE}/DownloadSeason?season=${seasonCode(1)}&type=zip&fileName=lvr_landcsv.zip`,
  },
  {
    label: `上上季季檔 ${seasonCode(2)}`,
    url: `${BASE}/DownloadSeason?season=${seasonCode(2)}&type=zip&fileName=lvr_landcsv.zip`,
  },
  {
    label: "歷史批次檔清單頁（若有，就能逐期補回空窗）",
    url: `${BASE}/DownloadHistory`,
    expectHtml: true,
  },
  {
    label: "資料下載頁（列出目前提供哪些檔案）",
    url: `${BASE}/DownloadOpenData`,
    expectHtml: true,
  },
];

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

function head(url) {
  try {
    const out = run(`curl -sIL --connect-timeout 20 --max-time 60 ` +
      `-A "Mozilla/5.0 (compatible; chengguo-site/1.0)" -o /dev/null ` +
      `-w "%{http_code}|%{content_type}|%{size_download}" "${url}"`);
    const [code, type] = out.trim().split("|");
    return { code, type };
  } catch (e) {
    return { code: "ERR", type: e.message.slice(0, 80) };
  }
}

function fetchTo(url, file) {
  try {
    run(`curl -sL -f --connect-timeout 30 --max-time 300 ` +
      `-A "Mozilla/5.0 (compatible; chengguo-site/1.0)" -o "${file}" "${url}"`);
    return existsSync(file) ? statSync(file).size : 0;
  } catch { return 0; }
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

/* 看一個解壓目錄裡，高雄（E 檔）的成交日期範圍與關鍵字命中情況 */
function inspect(dir) {
  const report = [];
  for (const suffix of ["a", "b"]) {
    const re = new RegExp(`^E_lvr_land_${suffix}\\.csv$`, "i");
    const files = readdirSync(dir).filter(f => re.test(f));
    if (!files.length) { report.push(`  高雄 _${suffix} 檔：不存在`); continue; }
    let n = 0, hits = [], dates = [];
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
        if (iAddr >= 0 && norm(r[iAddr]).includes(norm(KEYWORD))) {
          hits.push(`${r[iAddr]}｜${roc(d)}｜${r[iFloor] || ""}`);
        }
      });
    }
    dates.sort();
    const kind = suffix === "a" ? "成屋" : "預售";
    report.push(`  高雄 ${kind}：${n} 筆` +
      (dates.length ? `，交易日 ${roc(dates[0])} ～ ${roc(dates[dates.length - 1])}` : ""));
    report.push(`    「${KEYWORD}」命中 ${hits.length} 筆`);
    hits.slice(0, 12).forEach(h => report.push(`      ${h}`));
    if (hits.length > 12) report.push(`      …還有 ${hits.length - 12} 筆`);
  }
  return report.join("\n");
}

async function main() {
  console.log(`\n=== 內政部實價登錄資料源探測 ===`);
  console.log(`門牌關鍵字：${KEYWORD}`);
  console.log(`今天：${new Date().toISOString().slice(0, 10)}\n`);

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  for (const c of CANDIDATES) {
    console.log(`──────────────────────────────────────────`);
    console.log(`【${c.label}】`);
    console.log(`  ${c.url}`);
    const h = head(c.url);
    console.log(`  HTTP ${h.code}　${h.type || ""}`);

    if (h.code !== "200") { console.log(`  → 這個來源目前拿不到，跳過\n`); continue; }

    if (c.expectHtml) {
      /* 清單頁：把可能是下載連結的部分印出來，人看得懂就知道有沒有歷史批次可用 */
      const f = path.join(TMP, "page.html");
      fetchTo(c.url, f);
      const html = readFileSync(f, "utf-8");
      const links = [...new Set(
        [...html.matchAll(/(?:href|action)\s*=\s*["']([^"']+)["']/gi)]
          .map(m => m[1])
          .filter(u => /download|season|history|csv|zip/i.test(u))
      )].slice(0, 40);
      const seasons = [...new Set(
        [...html.matchAll(/\b1[01]\dS[1-4]\b/g)].map(m => m[0])
      )].sort();
      console.log(`  頁面大小 ${(html.length / 1024).toFixed(0)} KB`);
      console.log(`  疑似下載連結 ${links.length} 個：`);
      links.forEach(u => console.log(`    ${u}`));
      if (seasons.length) console.log(`  頁面提到的季別：${seasons.join("、")}`);
      console.log("");
      continue;
    }

    const zip = path.join(TMP, "x.zip");
    const dir = path.join(TMP, "x");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const size = fetchTo(c.url, zip);
    console.log(`  下載 ${(size / 1024 / 1024).toFixed(1)} MB`);
    if (!size) { console.log(`  → 下載失敗\n`); continue; }
    try {
      run(`unzip -o -q "${zip}" -d "${dir}"`);
    } catch (e) {
      console.log(`  → 不是有效的壓縮檔（可能回傳的是錯誤頁）\n`);
      continue;
    }
    console.log(inspect(dir));
    console.log("");
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`──────────────────────────────────────────`);
  console.log(`看完上面的輸出，重點在兩件事：`);
  console.log(`  1. 各來源的「交易日最晚到哪一天」——差距就是空窗期`);
  console.log(`  2. 有沒有出現可以逐期下載歷史批次的網址——有的話空窗就能一次補齊`);
}

main().catch(e => { console.error("[失敗]", e); process.exit(1); });
