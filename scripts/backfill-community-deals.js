/**
 * 澄果團隊｜社區成交紀錄一次性回補
 * ------------------------------------------------
 * 每日的行情更新只抓最近四季，較早的成交（例如已完銷的預售案）抓不到。
 * 這支腳本可以往回下載多期資料，把歷史成交補進 data/community-deals.json。
 *
 * 用法：
 *   node scripts/backfill-community-deals.js [期數]
 *   例如 node scripts/backfill-community-deals.js 12   （回補近 3 年）
 *
 * 注意：
 *   - 每期都要下載一個大檔案，12 期約需 10–15 分鐘
 *   - 內政部可能因短時間大量請求而暫時擋下，腳本每期之間會等待
 *   - 結果與既有資料「合併」，不會覆蓋已有的紀錄
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-backfill");
const COMMUNITY_CONFIG = path.join(ROOT, "data/communities.json");
const COMMUNITY_OUTPUT = path.join(ROOT, "data/community-deals.json");

const M2_TO_PING = 0.3025;
const SEASON_ZIP_URL = season =>
  `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;

/* ---------- 共用工具（與 fetch-market-data.js 相同邏輯） ---------- */

function normalize(str) {
  return String(str || "")
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "");
}

function inAddressRange(normAddr, ranges) {
  if (!ranges?.length) return false;
  for (const r of ranges) {
    const road = normalize(r.road || "");
    if (!road || !normAddr.includes(road)) continue;
    const after = normAddr.split(road)[1] || "";
    const m = after.match(/^(\d+)/);
    if (!m) continue;
    const no = parseInt(m[1], 10);
    if (no >= (r.from ?? -Infinity) && no <= (r.to ?? Infinity)) return true;
  }
  return false;
}

function rocToDate(v) {
  const s = String(v || "").trim();
  if (s.length < 6) return "";
  const y = parseInt(s.slice(0, s.length - 4), 10) + 1911;
  const m = s.slice(-4, -2);
  const d = s.slice(-2);
  if (!y || m === "00" || d === "00") return "";
  return `${y}-${m}-${d}`;
}

function parseCSV(text) {
  const rows = []; let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

function readCsv(dir, pattern, isPresale) {
  if (!dir) return [];
  const files = readdirSync(dir).filter(f => pattern.test(f));
  let records = [];
  for (const file of files) {
    const rows = parseCSV(readFileSync(path.join(dir, file), "utf-8"));
    if (rows.length < 3) continue;
    const header = rows[0];
    rows.slice(2).forEach(r => {
      const rec = {};
      header.forEach((h, idx) => { rec[h.trim()] = r[idx]; });
      if (isPresale) rec.__presale = true;
      records.push(rec);
    });
  }
  return records;
}

/* 季別代碼：往回第 n 期（0 = 當季） */
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
      console.warn(`  [警告] ${season} 第 ${attempt} 次失敗：${e.message}`);
      if (attempt < 3) execSync(`sleep ${attempt * 20}`);
    }
  }
  return null;
}

function toDeal(r) {
  const unitM2 = parseFloat(r["單價元平方公尺"]);
  const areaM2 = parseFloat(r["建物移轉總面積平方公尺"]) || 0;
  const rooms = r["建物現況格局-房"] || "";
  const halls = r["建物現況格局-廳"] || "";
  const baths = r["建物現況格局-衛"] || "";
  return {
    date: rocToDate(r["交易年月日"]),
    floor: (r["移轉層次"] || "").trim(),
    totalFloor: (r["總樓層數"] || "").trim(),
    ping: Math.round(areaM2 * M2_TO_PING * 100) / 100,
    unitPrice: Math.round(unitM2 / M2_TO_PING / 1000) / 10,
    totalPrice: Math.round((parseFloat(r["總價元"]) || 0) / 10000),
    layout: rooms ? `${rooms}房${halls ? halls + "廳" : ""}${baths ? baths + "衛" : ""}` : "",
    parking: (r["車位類別"] || "").trim(),
    kind: r.__presale ? "預售" : "成屋",
    project: (r["建案名稱"] || "").trim(),
    unit: (r["棟及號"] || "").trim(),
    addr: (r["土地位置建物門牌"] || "").trim(),
    note: (r["備註"] || "").trim().slice(0, 40),
  };
}

function mergeDeals(oldList, newList) {
  const key = d => `${d.date}|${d.floor}|${d.ping}|${d.totalPrice}|${d.project || ""}`;
  const map = new Map();
  [...oldList, ...newList].forEach(d => { if (d?.date) map.set(key(d), d); });
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
}

/* ---------- 主流程 ---------- */
async function main() {
  const periods = parseInt(process.argv[2], 10) || 12;
  console.log(`[回補] 準備下載近 ${periods} 期（約 ${Math.round(periods / 4 * 10) / 10} 年）的資料\n`);

  const config = JSON.parse(readFileSync(COMMUNITY_CONFIG, "utf-8"));
  const communities = config.communities || [];
  if (!communities.length) {
    console.log("[回補] 沒有設定任何社區，結束");
    return;
  }

  let archive = { updatedAt: null, deals: {} };
  try { archive = JSON.parse(readFileSync(COMMUNITY_OUTPUT, "utf-8")); } catch {}
  archive.deals = archive.deals || {};

  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const found = {};
  communities.forEach(c => { found[c.slug] = 0; });
  let okPeriods = 0;

  for (let i = 0; i < periods; i++) {
    const season = seasonCode(i);
    console.log(`[${i + 1}/${periods}] 下載 ${season} …`);
    const dir = download(season);
    if (!dir) { console.warn(`  跳過 ${season}\n`); continue; }
    okPeriods++;

    const records = [
      ...readCsv(dir, /_lvr_land_a\.csv$/i, false),
      ...readCsv(dir, /_lvr_land_b\.csv$/i, true),
    ];
    console.log(`  讀到 ${records.length} 筆`);

    communities.forEach(c => {
      const keys = (c.addressKeywords || []).map(normalize);
      const projects = (c.projectNames || []).map(normalize);
      const ranges = c.addressRanges || [];
      if (!keys.length && !projects.length && !ranges.length) return;

      const matched = records.filter(r => {
        if (c.district && !(r["鄉鎮市區"] || "").includes(c.district)) return false;
        if (!(parseFloat(r["單價元平方公尺"]) > 0)) return false;
        /* 排除已解約的紀錄 */
        if ((r["解約情形"] || "").trim()) return false;
        const addr = normalize(r["土地位置建物門牌"]);
        const proj = normalize(r["建案名稱"] || "");
        return (keys.length && keys.some(k => addr.includes(k)))
            || inAddressRange(addr, ranges)
            || (projects.length && projects.some(k => proj.includes(k)));
      }).map(toDeal).filter(d => d.date && d.unitPrice > 0);

      /* 統計這期有多少筆因為解約被排除，方便核對 */
      const cancelled = records.filter(r => {
        if (!(r["解約情形"] || "").trim()) return false;
        if (c.district && !(r["鄉鎮市區"] || "").includes(c.district)) return false;
        const proj = normalize(r["建案名稱"] || "");
        return projects.length && projects.some(k => proj.includes(k));
      }).length;
      if (cancelled) console.log(`    ${c.name}：另有 ${cancelled} 筆已解約，未納入`);

      if (matched.length) {
        archive.deals[c.slug] = mergeDeals(archive.deals[c.slug] || [], matched);
        found[c.slug] += matched.length;
        console.log(`    ${c.name}：本期 ${matched.length} 筆`);
      }
    });

    /* 清掉這期的檔案，避免磁碟撐爆 */
    rmSync(dir, { recursive: true, force: true });
    if (i < periods - 1) execSync("sleep 5");
    console.log("");
  }

  /* 列出每個社區實際比對到的門牌與建案名稱，方便確認範圍有沒有抓錯 */
  console.log("");
  console.log("=".repeat(50));
  console.log("[核對] 各社區實際比對到的門牌／建案名稱：");
  communities.forEach(c => {
    const list = archive.deals[c.slug] || [];
    if (!list.length) return;
    const addrs = {};
    list.forEach(d => {
      const k = d.project ? `建案：${d.project}` : (d.addr || "（無門牌）");
      addrs[k] = (addrs[k] || 0) + 1;
    });
    console.log(`  ${c.name}（${list.length} 筆）`);
    Object.entries(addrs).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .forEach(([k, n]) => console.log(`     ${n} 筆　${k}`));
  });

  archive.updatedAt = new Date().toISOString();
  archive.backfilledAt = new Date().toISOString();
  archive.backfillPeriods = okPeriods;
  writeFileSync(COMMUNITY_OUTPUT, JSON.stringify(archive, null, 2) + "\n", "utf-8");

  console.log("=".repeat(50));
  console.log(`[完成] 成功下載 ${okPeriods}/${periods} 期`);
  communities.forEach(c => {
    const total = (archive.deals[c.slug] || []).length;
    console.log(`  ${c.name}：本次找到 ${found[c.slug]} 筆，累計 ${total} 筆`);
  });

  rmSync(TMP, { recursive: true, force: true });
}

main().catch(err => {
  console.error("[失敗]", err.message);
  process.exit(1);
});
