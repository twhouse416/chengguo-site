/**
 * 澄果團隊｜生活圈的縱向與結構統計
 * ------------------------------------------------
 * 為什麼要有這支：
 * 全站的價格敘述原本只到「近一年」（首頁、生活圈頁）與「近三年」（社區頁），
 * 但 data/area-deals/ 的資料池已經回補到 2012 年、共三萬多筆，
 * 裡面還有「建物現況格局-房」「總價元」這些沒被用到的欄位。
 *
 * 「美術館特區房價走勢」「中都這幾年漲多少」「美術館特區三房多少錢」
 * 「一千五百萬在美術館特區買得到什麼」——這幾種問法站上原本沒有頁面對得上，
 * 而資料其實都算得出來。這支負責算，渲染交給 build-areas.js。
 *
 * 三組輸出：
 *   yearly(code)     逐年單價中位數 + 樣本數（2012 起）
 *   byRooms(code)    近三年各房型的單價／總價中位數
 *   priceBands(code) 近三年總價帶分布
 *
 * 篩選條件刻意與 fetch-market-data.js 一致，否則同一個頁面上
 * 兩個區塊的數字會互相矛盾：
 *   - 排除「解約情形」非空（不是真實成交）
 *   - 只取 config/areas.json 的 propertyTypes（預設電梯住宅＝住宅大樓＋華廈）
 *   - 依 excludeUses 排除非住宅用途（主要用途空白者不排除）
 *   - 單價限制在 sanityRange（3–150 萬／坪）
 *   - 排除預售（__presale）：預售與成屋的時間基準不同，
 *     預售的「交易年月日」是簽約日、交屋還要兩三年，混進逐年走勢會讓年份失真
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadArea } from "./deal-pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const CONFIG = (() => {
  try { return JSON.parse(readFileSync(path.join(ROOT, "config/areas.json"), "utf-8")); }
  catch { return {}; }
})();

const M2_TO_PING = 3.3058;

/* 交易年月日可能是民國（1130815）或西元（20240815），取西元年 */
function yearOf(raw) {
  const s = String(raw || "").trim();
  if (/^\d{7,8}$/.test(s)) {
    return s.length === 8 ? Number(s.slice(0, 4)) : Number(s.slice(0, 3)) + 1911;
  }
  const m = s.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function median(xs) {
  const a = xs.slice().sort((x, y) => x - y);
  if (!a.length) return null;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}
const r1 = v => (v === null ? null : Math.round(v * 10) / 10);

/* 把資料池的一筆原始紀錄轉成統計要用的幾個數字；不符條件回 null */
function pick(r, typeMatch) {
  if (String(r["解約情形"] || "").trim()) return null;
  if (r.__presale) return null;

  const type = String(r["建物型態"] || "");
  if (typeMatch.length && !typeMatch.some(k => type.includes(k))) return null;

  const use = String(r["主要用途"] || "").trim();
  if (use && (CONFIG.excludeUses || []).some(k => use.includes(k))) return null;

  const year = yearOf(r["交易年月日"]);
  if (!year) return null;

  const unit = parseFloat(r["單價元平方公尺"]) * M2_TO_PING / 10000;   // 萬／坪
  const SR = CONFIG.sanityRange || {};
  const lo = SR.minWanPerPing ?? 0;
  const hi = SR.maxWanPerPing ?? Infinity;
  if (!(unit >= lo && unit <= hi)) return null;

  const total = parseFloat(r["總價元"]) / 10000;                        // 萬元
  const rooms = String(r["建物現況格局-房"] ?? "").trim();
  const pings = parseFloat(r["建物移轉總面積平方公尺"]) / M2_TO_PING;

  return {
    year, unit,
    total: Number.isFinite(total) && total > 0 ? total : null,
    rooms: /^[1-9]$/.test(rooms) ? Number(rooms) : null,
    pings: Number.isFinite(pings) && pings > 0 ? pings : null,
  };
}

/* code 可以是單一生活圈代碼，也可以是代碼陣列。
   傳陣列時是把幾個資料池的成交倒進同一個池子再統計，
   不是把各區的中位數再平均——後者會讓成交量少的生活圈權重被放大。 */
function rowsOf(code, typeKey = "elevator") {
  const group = (CONFIG.propertyTypes || []).find(t => t.key === typeKey);
  const typeMatch = group?.match || ["住宅大樓", "華廈"];
  const codes = Array.isArray(code) ? code : [code];
  return codes.flatMap(c => loadArea(c)).map(r => pick(r, typeMatch)).filter(Boolean);
}

/* ── 逐年單價中位數 ──
   小樣本的年份不要給中位數：十幾筆的中位數會被一兩筆特殊交易拉走，
   畫成走勢反而誤導。門檻訂 30 筆（一個生活圈一年的正常量在數百筆，
   低於 30 的都是資料池剛開始或剛結束的邊界年份）。 */
export function yearly(code, { minSample = 30, typeKey = "elevator" } = {}) {
  const rows = rowsOf(code, typeKey);
  const by = new Map();
  rows.forEach(x => {
    if (!by.has(x.year)) by.set(x.year, []);
    by.get(x.year).push(x);
  });
  const out = [...by.entries()]
    .map(([year, xs]) => ({
      year,
      n: xs.length,
      unit: r1(median(xs.map(x => x.unit))),
      /* 總價以萬元為單位，小數沒有意義（偶數筆的中位數會算出 .5） */
      total: (v => (v === null ? null : Math.round(v)))(median(xs.map(x => x.total).filter(w => w !== null))),
      thin: xs.length < minSample,
    }))
    .filter(x => !x.thin)
    .sort((a, b) => a.year - b.year);
  if (out.length < 2) return null;

  const first = out[0];
  const last = out[out.length - 1];
  const peak = out.reduce((m, x) => (x.unit > m.unit ? x : m), out[0]);
  return {
    rows: out,
    first, last, peak,
    span: `${first.year}–${last.year}`,
    changePct: first.unit ? Math.round(((last.unit - first.unit) / first.unit) * 100) : null,
    fromPeakPct: peak.unit ? Math.round(((last.unit - peak.unit) / peak.unit) * 100) : null,
    sample: out.reduce((n, x) => n + x.n, 0),
  };
}

/* ── 近三年各房型 ──
   房數用實價登錄的「建物現況格局-房」，0 房（開放式／套房登記為 0）排除，
   因為那一組混了店面改住、工作室與套房，意義不一致。
   樣本不足 15 筆的房型不輸出。 */
export function byRooms(code, { years = 3, minSample = 15, typeKey = "elevator" } = {}) {
  const since = new Date().getFullYear() - years + 1;
  const rows = rowsOf(code, typeKey).filter(x => x.year >= since && x.rooms !== null);
  const by = new Map();
  rows.forEach(x => {
    if (!by.has(x.rooms)) by.set(x.rooms, []);
    by.get(x.rooms).push(x);
  });
  const out = [...by.entries()]
    .map(([rooms, xs]) => ({
      rooms, n: xs.length,
      unit: r1(median(xs.map(x => x.unit))),
      total: Math.round(median(xs.map(x => x.total).filter(v => v !== null)) || 0) || null,
      pings: r1(median(xs.map(x => x.pings).filter(v => v !== null))),
    }))
    .filter(x => x.n >= minSample && x.unit !== null)
    .sort((a, b) => a.rooms - b.rooms);
  if (!out.length) return null;
  const tot = out.reduce((n, x) => n + x.n, 0);
  out.forEach(x => { x.share = Math.round((x.n / tot) * 100); });
  return { rows: out, sample: tot, since, years };
}

/* ── 近三年總價帶分布 ──
   買方是拿預算找房，不是拿單價找房。級距 500 萬，
   只輸出筆數達門檻的級距，尾端零星的高價併成「以上」一列。 */
export function priceBands(code, { years = 3, step = 500, minSample = 10, typeKey = "elevator" } = {}) {
  const since = new Date().getFullYear() - years + 1;
  const rows = rowsOf(code, typeKey).filter(x => x.year >= since && x.total !== null);
  if (rows.length < 30) return null;

  const by = new Map();
  rows.forEach(x => {
    const b = Math.floor(x.total / step) * step;
    if (!by.has(b)) by.set(b, []);
    by.get(b).push(x);
  });
  const sorted = [...by.entries()].sort((a, b) => a[0] - b[0]);

  const kept = [];
  let tailN = 0, tailFrom = null, tailPings = [];
  sorted.forEach(([b, xs]) => {
    if (xs.length >= minSample) {
      kept.push({
        from: b, to: b + step, n: xs.length,
        unit: r1(median(xs.map(x => x.unit))),
        pings: r1(median(xs.map(x => x.pings).filter(v => v !== null))),
        rooms: median(xs.map(x => x.rooms).filter(v => v !== null)),
      });
    } else {
      if (tailFrom === null) tailFrom = b;
      tailN += xs.length;
      tailPings.push(...xs.map(x => x.pings).filter(v => v !== null));
    }
  });
  if (!kept.length) return null;

  const tot = rows.length;
  kept.forEach(x => { x.share = Math.round((x.n / tot) * 1000) / 10; });
  const main = kept.reduce((m, x) => (x.n > m.n ? x : m), kept[0]);
  return {
    rows: kept,
    other: tailN >= minSample ? { n: tailN, share: Math.round((tailN / tot) * 1000) / 10, pings: r1(median(tailPings)) } : null,
    sample: tot, since, years, step, main,
  };
}

export function roomLabel(n) {
  return `${["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][n] || n}房`;
}
