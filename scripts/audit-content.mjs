/**
 * 澄果團隊｜全站內容一致性稽核
 * ------------------------------------------------
 * 目的：把「文字、表格、封面圖、建置產出」之間的數字矛盾一次抓出來，
 * 不要再靠人眼在頁面上發現。
 *
 * 用法：node scripts/audit-content.mjs          （只檢查資料與文章）
 *       node scripts/audit-content.mjs --built  （連同已建置的 HTML 一起檢查）
 *
 * 檢查項目
 *   A 封面圖 ↔ 文章：SVG 裡的每個數字，必須在該篇文章內文找得到
 *   B 關鍵指標：站上公告的指標值 vs 由原始資料重算的值
 *   C 文章內部：note/摘要宣稱的數字 vs 同篇表格內的數字
 *   D 資料品質：學區欄位格式、規格空值、草稿
 *   E 建置產出：{{ }} 殘留、NaN/undefined、內鏈死連結、JSON-LD
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const BUILT = process.argv.includes("--built");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf-8"));
const communities = read("data/communities.json").communities.filter(c => !c.draft);
const dealsMap = read("data/community-deals.json").deals;
const articles = read("data/articles.json").articles.filter(a => !a.draft);

let FAIL = 0, WARN = 0;
const fail = (...m) => { FAIL++; console.log("  ✗", ...m); };
const warn = (...m) => { WARN++; console.log("  !", ...m); };
const ok = (...m) => console.log("  ✓", ...m);

/* ---------- 共用計算 ---------- */
const SINCE = "2020-01-01";
const med = a => { const s = [...a].sort((x, y) => x - y); const n = s.length;
  return !n ? 0 : (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2); };
const specOf = (c, re) => (c.specs || []).find(p => re.test(p[0]))?.[1] ?? "";
const yearOf = c => { const m = String(specOf(c, /完工/)).match(/(19|20)\d{2}/); return m ? +m[0] : null; };
const ratioOf = c => { const m = String(specOf(c, /公設比/)).match(/([\d.]+)\s*%/); return m ? +m[1] : null; };
const homesOf = c => (dealsMap[c.slug] || []).filter(d =>
  d.use !== "店面" && d.unitPrice >= 3 && d.unitPrice <= 150 && String(d.date || "") >= SINCE);

/* 建置時會代入的變數，稽核時要先還原，否則會誤判 */
const STATS = {
  communityCount: communities.length,
  dealTotal: Object.values(dealsMap).reduce((n, v) => n + v.length, 0),
  ratioCount: communities.filter(c => ratioOf(c) !== null).length,
  ruifengCount: communities.filter(c => String(c.area || "").includes("瑞豐")).length,
  ruifengDeals: communities.filter(c => String(c.area || "").includes("瑞豐"))
    .reduce((n, c) => n + (dealsMap[c.slug] || []).filter(d => d.use !== "店面").length, 0),
};

/* ---------- A 封面圖 ↔ 文章 ---------- */
console.log("\n【A】封面圖表數字 vs 文章內文");
const NUM = /\d[\d,]*(?:\.\d+)?/g;
for (const a of articles) {
  if (!a.cover || !a.cover.endsWith(".svg")) continue;   // 照片封面沒有數字可比
  const p = path.join(ROOT, a.cover);
  if (!fs.existsSync(p)) { fail(`${a.slug}：封面檔不存在 ${a.cover}`); continue; }
  const svgText = fs.readFileSync(p, "utf-8")
    .replace(/<[^>]*>/g, " ")           // 只留文字節點
    .replace(/&[a-z]+;/g, " ");
  const body = JSON.stringify(a)
    .replace(/\{\{\s*社區數\s*\}\}/g, String(STATS.communityCount))
    .replace(/\{\{\s*成交筆數\s*\}\}/g, STATS.dealTotal.toLocaleString("en-US"))
    .replace(/\{\{\s*有公設比社區數\s*\}\}/g, String(STATS.ratioCount))
    .replace(/\{\{\s*瑞豐社區數\s*\}\}/g, String(STATS.ruifengCount))
    .replace(/\{\{\s*瑞豐成交筆數\s*\}\}/g, STATS.ruifengDeals.toLocaleString("en-US"));
  const missing = [...new Set(svgText.match(NUM) || [])]
    .filter(n => {
      const v = parseFloat(n.replace(/,/g, ""));
      if (!isFinite(v) || v <= 3 || /^0\d/.test(n)) return false;  // 跳過序號 01..07 與小整數
      return !body.includes(n) && !body.includes(n.replace(/,/g, ""));
    });
  if (missing.length) warn(`${a.slug}：封面有、內文沒有的數字 → ${missing.join(" ")}（可能是只畫在圖上的補充值，也可能是圖沒跟著更新）`);
}
if (!WARN) ok("封面與內文數字一致");

/* ---------- B 關鍵指標重算 ---------- */
console.log("\n【B】關鍵指標：文章所載 vs 重算");
const all = communities.flatMap(homesOf);
const withRatio = communities.filter(c => ratioOf(c) !== null);
const checks = [];
const push = (name, got, want, tol = 0.05) => checks.push({ name, got, want, tol });

push("全站社區數（非草稿）", communities.length, communities.length, 0);
push("2020起住家成交", all.length, 12029);
push("有公設比社區", withRatio.length, 229, 0.05);
push("公設比中位", med(withRatio.map(ratioOf)), 30.56);
push("有公設比社區的成交樣本", withRatio.flatMap(homesOf).length, 11535);

// 樓層溢價
const CN = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 };
const flr = s => { const t = String(s||"").split("，")[0].replace(/[^0-9一二三四五六七八九十]/g,"");
  if (!t) return null; if (/^\d+$/.test(t)) return +t;
  const m = t.match(/^(.*?)十(.*)$/); if (m) return (m[1] ? (CN[m[1]]||0) : 1)*10 + (CN[m[2]]||0);
  return CN[t] ?? null; };
const pct = [];
for (const c of communities) {
  const ds = homesOf(c).filter(d => d.floor && d.totalFloor);
  const tf = flr(ds[0]?.totalFloor); if (!tf || tf < 10) continue;
  const lo = ds.filter(d => flr(d.floor) && flr(d.floor) <= tf/3).map(d => d.unitPrice);
  const hi = ds.filter(d => flr(d.floor) && flr(d.floor) > tf*2/3).map(d => d.unitPrice);
  if (lo.length < 5 || hi.length < 5) continue;
  pct.push((med(hi) - med(lo)) / med(lo) * 100);
}
push("樓層可配對社區", pct.length, 154);
push("樓層溢價中位 %", med(pct), 6.7);

// 同社區價差
const spread = communities.map(c => {
  const v = homesOf(c).map(d => d.unitPrice).sort((x,y)=>x-y);
  if (v.length < 20) return null;
  const at = f => v[Math.min(v.length-1, Math.floor(v.length*f))];
  return { gap: at(.75) - at(.25), pct: (at(.75)-at(.25)) / med(v) * 100 };
}).filter(Boolean);
push("成交滿20筆社區", spread.length, 157);
push("Q1–Q3 價差中位", med(spread.map(s=>s.gap)), 8.6);
push("價差百分比中位", med(spread.map(s=>s.pct)), 31, 0.06);

// 周轉率（滾動近三年）
const TH = new Date(Date.now() - 1095*864e5).toISOString().slice(0,10);
const turn = communities.map(c => {
  const m = String(specOf(c, /總戶數/)).match(/(\d[\d,]*)\s*戶/); const u = m ? +m[1].replace(/,/g,"") : 0;
  const y = yearOf(c);
  if (!u || u < 30 || !y || y > 2020) return null;
  const n = (dealsMap[c.slug]||[]).filter(d => d.kind === "成屋" && d.use !== "店面" && String(d.date||"") >= TH).length;
  return n >= 3 ? n/u/3*100 : null;
}).filter(v => v !== null);
push("周轉率合格社區", turn.length, 199);
push("周轉率中位 %", med(turn), 2.3);

for (const { name, got, want, tol } of checks) {
  const g = Math.round(got * 100) / 100;
  const drift = want ? Math.abs(g - want) / want : 0;
  if (drift > tol) fail(`${name}：文章 ${want} → 重算 ${g}（偏離 ${(drift*100).toFixed(1)}%）`);
  else ok(`${name} = ${g}`);
}

/* ---------- C 文章內部一致性 ---------- */
console.log("\n【C】文章內部：導言宣稱值 vs 同篇表格");
let cWarn = 0;
for (const a of articles) {
  const tables = (a.blocks||[]).filter(b => b.type === "table");
  if (!tables.length) continue;
  const lead = [a.summary, (a.blocks||[]).find(b => b.type === "note")?.text].filter(Boolean).join(" ");
  const tableNums = new Set(tables.flatMap(t => t.rows.flat()).join(" ").match(NUM) || []);
  /* 只看「數字＋單位」的行情宣稱，且排除倍數／百分比等推導說法，
     否則 30.56% 會被切成 30.5、1.3 倍會被當成行情數字，全是假警報。 */
  const leadBig = [...new Set((lead.match(/\d[\d,]*\.\d+\s*(?:萬|％|%|坪)/g) || [])
    .map(x => x.replace(/\s*(?:萬|％|%|坪)$/, "")))];
  const orphan = leadBig.filter(n => !tableNums.has(n) && !lead.includes(n + " 倍"));
  if (orphan.length) { warn(`${a.slug}：導言有、表格沒有的行情數字 → ${orphan.join(" ")}`); cWarn++; }
}
if (!cWarn) ok("導言數字都能在同篇表格裡找到");

/* ---------- D 資料品質 ---------- */
console.log("\n【D】資料品質");
const DIRTY = /(樂居|好房網|成家網|591|信義房屋|記載|另記|頁面標示|鄰近|「)/;
let dirty = 0;
for (const c of communities) {
  for (const k of ["primary", "junior"]) {
    const v = String(c.school?.[k] || "").trim();
    if (v && DIRTY.test(v)) { fail(`學區欄位含來源／贅字：${c.name}（${c.slug}）${k} =「${v}」`); dirty++; }
  }
  if (!(c.specs||[]).some(p => p[1])) warn(`規格表全空：${c.name}`);
}
if (!dirty) ok("學區欄位格式乾淨");
const noDeal = communities.filter(c => !(dealsMap[c.slug]||[]).length);
if (noDeal.length) warn(`零成交社區 ${noDeal.length} 個：${noDeal.map(c=>c.name).join("、")}`);

/* ---------- E 建置產出 ---------- */
if (BUILT) {
  console.log("\n【E】建置產出");
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === ".git" ? [] : walk(p);
    return /\.(html|txt|xml)$/.test(e.name) ? [p] : [];
  });
  const files = walk(ROOT);
  let brace = 0, nan = 0, ld = 0, dead = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, "utf-8");
    const rel = path.relative(ROOT, f);
    if (/\{\{[^}]*\}\}/.test(s) && !rel.startsWith("tools/")) { fail(`${rel}：殘留 {{ }}`); brace++; }
    if (/>(\s*)(NaN|undefined)(\s*)</.test(s)) { fail(`${rel}：輸出 NaN/undefined`); nan++; }
    for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch { fail(`${rel}：JSON-LD 無法解析`); ld++; }
    }
    if (rel.endsWith(".html")) {
      for (const m of s.matchAll(/href="((?!https?:|#|tel:|mailto:|javascript:)[^"]+)"/g)) {
        const t = m[1].split("#")[0].split("?")[0]; if (!t) continue;
        let q = path.resolve(path.dirname(f), t);
        if (!fs.existsSync(q) && !fs.existsSync(path.join(q, "index.html"))) { fail(`${rel}：死連結 ${t}`); dead++; }
      }
    }
  }
  if (!brace && !nan && !ld && !dead) ok(`掃描 ${files.length} 個檔案：無殘留變數、無 NaN、JSON-LD 全可解析、無死連結`);
}

console.log(`\n═══ 稽核結束：${FAIL} 項錯誤、${WARN} 項提醒 ═══`);
process.exit(FAIL ? 1 : 0);
