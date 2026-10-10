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

// 預售 vs 成屋
const pr = [];
for (const c of communities) {
  const ds = homesOf(c);
  const pre = ds.filter(d => d.kind === "預售").map(d => d.unitPrice);
  const fin = ds.filter(d => d.kind === "成屋").map(d => d.unitPrice);
  if (pre.length >= 3 && fin.length >= 3) pr.push(med(fin) - med(pre));
}
push("預售／成屋可配對社區", pr.length, 10, 0.15);
push("成屋−預售 中位差（萬）", Math.abs(med(pr)), 0.05, 2);   // 接近 0，用絕對值比

/* 有表格且表格含行情數字，卻沒寫統計基準 */
const SITEY = /(本站|收錄的|個社區|筆成交|單價中位|成交單價|萬／坪)/;
for (const a of articles) {
  const t = (a.blocks || []).filter(b => b.type === "table");
  if (!t.length || a.statsBasis) continue;
  if (t.some(x => SITEY.test(JSON.stringify(x)))) fail(`${a.slug}：表格含站上行情數字，卻沒有 statsBasis`);
}

/* 車位：車位總價只在生活圈資料池裡（community-deals.json 沒有保留這個欄位），
   所以要另外讀 data/area-deals/*.json。這組數字支撐「高雄車位值多少錢」那一篇。 */
try {
  const poolDir = path.join(ROOT, "data/area-deals");
  const pk = { flat: [], mech: [], withKind: 0, disclosed: 0 };
  for (const f of fs.readdirSync(poolDir).filter(x => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(poolDir, f), "utf-8"));
    const ix = Object.fromEntries(d.columns.map((c, i) => [c, i]));
    for (const r of d.rows) {
      const roc = String(r[ix["交易年月日"]] || "");
      if (roc.length < 6) continue;
      const ym = `${+roc.slice(0, -4) + 1911}-${roc.slice(-4, -2)}`;
      if (ym < "2020-01") continue;
      const kind = r[ix["車位類別"]] || "";
      const price = (+r[ix["車位總價元"]] || 0) / 10000;
      const ping = (+r[ix["建物移轉總面積平方公尺"]] || 0) * 0.3025;
      if (kind) pk.withKind++;
      if (kind && price > 0) pk.disclosed++;
      if (!(price > 0) || ping < 25 || ping > 60) continue;
      if (kind === "坡道平面") pk.flat.push(price);
      if (kind === "坡道機械") pk.mech.push(price);
    }
  }
  push("車位揭露率 %", pk.disclosed / Math.max(1, pk.withKind) * 100, 61, 0.05);
  push("坡道平面車位中位（萬）", med(pk.flat), 195);
  push("坡道機械車位中位（萬）", med(pk.mech), 100);
  push("坡道平面樣本數", pk.flat.length, 4354);
} catch (e) {
  warn(`車位指標無法計算：${e.message}`);
}

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

/* ---------- C2 FAQ ↔ 表格 ---------- */
console.log("\n【C2】FAQ 數字 vs 同篇表格");
let c2 = 0;
for (const a of articles) {
  const tables = (a.blocks || []).filter(b => b.type === "table");
  if (!tables.length || !(a.faq || []).length) continue;
  const tableNums = new Set(tables.flatMap(t => t.rows.flat()).join(" ").match(NUM) || []);
  const faqText = a.faq.map(f => f.q + " " + f.a).join(" ");
  /* FAQ 常直接引用表格裡的行情值；凡是「數字＋單位」卻在表格找不到的，都要人工看一眼 */
  const claims = [...new Set((faqText.match(/\d[\d,]*\.\d+\s*(?:萬|％|%|坪)/g) || [])
    .map(x => x.replace(/\s*(?:萬|％|%|坪)$/, "")))];
  const orphan = claims.filter(n => !tableNums.has(n));
  if (orphan.length) { warn(`${a.slug}：FAQ 有、表格沒有的行情數字 → ${orphan.join(" ")}`); c2++; }
}
if (!c2) ok("FAQ 數字都能在同篇表格裡找到");

/* ---------- G 跨篇比較宣稱 ---------- */
/* 文章裡的「哪一區最便宜／最貴」這類排序宣稱，過去只能靠人讀出來。
   這裡把四區的四個指標實際算一次，再掃描每一段文字的斷言。
   判定方式：在一個句子裡找到最高／最低這類詞之後，取「離它最近的生活圈名」
   當主詞，再比對該區在該指標上是不是真的最高／最低。
   取最近者是必要的——「瑞豐與農十六並列四區最低」這種句子有兩個區名，
   只有最靠近的那個才是被宣稱的對象。 */
console.log("\n【G】四區比較宣稱 vs 實際排序");
const AREAS = ["美術館特區", "農十六特區", "瑞豐・巨蛋", "中都重劃區"];
const ALIAS = { "美術館特區": ["美術館特區", "美術館"], "農十六特區": ["農十六特區", "農十六"],
                "瑞豐・巨蛋": ["瑞豐・巨蛋", "瑞豐巨蛋", "瑞豐"], "中都重劃區": ["中都重劃區", "中都"] };
const areaStat = {};
for (const a of AREAS) {
  const key = a.replace(/特區|重劃區|・巨蛋/g, "");
  const list = communities.filter(c => String(c.area || "").includes(key));
  const ds = list.flatMap(homesOf);
  areaStat[a] = { 單價: med(ds.map(d => d.unitPrice)), 總價: med(ds.map(d => d.totalPrice).filter(Boolean)),
                  坪數: med(ds.map(d => d.ping).filter(Boolean)), 公設比: med(list.map(ratioOf).filter(v => v !== null)) };
}
const METRICS = { 單價: /單價|每坪|萬／坪/, 總價: /總價|門檻/, 坪數: /坪數/, 公設比: /公設比/ };
const rankOf = m => {
  const vs = AREAS.map(a => [a, areaStat[a][m]]).sort((x, y) => x[1] - y[1]);
  return { min: vs.filter(v => v[1] === vs[0][1]).map(v => v[0]),
           max: vs.filter(v => v[1] === vs[3][1]).map(v => v[0]) };
};
/* 把一篇文章攤成「真正的句子」，不要拿 JSON 字串硬切 */
function sentencesOf(a) {
  const out = [];
  /* 分號也要斷句：「…是四大生活圈最高；總價…美術館最高」是兩個獨立宣稱 */
  const push = t => String(t || "").split(/[。！？；\n]/).forEach(x => x.trim() && out.push(x.trim()));
  push(a.title); push(a.summary); push(a.statsBasis);
  (a.blocks || []).forEach(b => {
    push(b.text);
    (b.items || []).forEach(push);
    (b.rows || []).forEach(r => r.forEach(push));
  });
  (a.faq || []).forEach(f => { push(f.q); push(f.a); });
  return out;
}
const LOW = /(最低|最便宜|最親民|最少|最小)/g;
const HIGH = /(最高|最貴|最大)/g;
let gBad = 0, gSeen = 0;
for (const a of articles) {
  for (const raw of sentencesOf(a)) {
    const sent = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "");
    for (const [kind, re] of [["min", LOW], ["max", HIGH]]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sent))) {
        /* 指標也要取「離這個最高／最低詞最近的那一個」。
           一句話裡可能同時有單價與總價，用第一個出現的會判錯。 */
        let metric = null, metricD = 1e9;
        for (const k of Object.keys(METRICS)) {
          const re2 = new RegExp(METRICS[k].source, "g");
          let mm;
          while ((mm = re2.exec(sent))) {
            const d = Math.abs(mm.index - m.index);
            if (d < metricD) { metricD = d; metric = k; }
          }
        }
        if (!metric || metricD > 30) continue;
        /* 找出這個宣稱的主詞。規則有三層，由強到弱：
           1. 句首 12 字內出現的生活圈名 → 它就是主詞（「瑞豐・巨蛋略高，可能跟它總價門檻最低…」）
           2. 句子裡有「並列」→ 代表多區共享極值，只要其中一個對就算對
           3. 否則取離最高／最低詞最近的區名
           括號內容先拿掉，「四區最低（與農十六並列）」的括號會把主詞判錯。 */
        const flat = sent.replace(/（[^）]*）/g, "");
        const mentioned = AREAS.filter(area => ALIAS[area].some(al => flat.includes(al)));
        if (!mentioned.length) continue;
        const r = rankOf(metric);
        let best = null, bestD = 1e9;
        for (const area of AREAS) {
          for (const al of ALIAS[area]) {
            let i = -1;
            while ((i = flat.indexOf(al, i + 1)) >= 0) {
              if (i < 12 && (!best || bestD === 1e9)) { best = area; bestD = 0; }
              const d = Math.abs(i - m.index);
              if (bestD !== 0 && d < bestD) { bestD = d; best = area; }
            }
          }
        }
        if (!best || bestD > 30) continue;
        gSeen++;
        if (/並列/.test(flat) ? !mentioned.some(x => r[kind].includes(x)) : !r[kind].includes(best)) {
          fail(`${a.slug}：宣稱「${best}」的${metric}${kind === "min" ? "最低" : "最高"}，實際是 ${r[kind].join("、")}`);
          fail(`    句子：${sent.slice(0, 70)}`);
          gBad++;
        }
      }
    }
  }
}
if (!gBad) ok(`四區的最高／最低宣稱與實際排序一致（檢查 ${gSeen} 句）`);
for (const m of Object.keys(METRICS)) {
  const r = rankOf(m);
  ok(`${m}：最低 ${r.min.join("、")}／最高 ${r.max.join("、")}（${AREAS.map(x => `${x.slice(0, 3)} ${areaStat[x][m].toFixed(1)}`).join("、")}）`);
}

/* ---------- H 事實用語一致 ---------- */
/* 同一件事在站上必須只有一種說法。這些是踩過的坑，寫死成規則。 */
console.log("\n【H】固定事實的用語");
const BANNED = [
  [/每日自動更新|每天自動更新|資料每日更新/, "實價登錄不是每日更新，內政部是每月 1、11、21 日批次公告"],
  [/內政部於\s*2、12、22|內政部每月\s*2、12、22/, "2、12、22 是本站的更新日，內政部的公告日是 1、11、21"],
];
let hBad = 0;
for (const a of articles) {
  const text = JSON.stringify(a, null, 0);
  for (const [re, why] of BANNED) {
    if (re.test(text)) { fail(`${a.slug}：${why}`); hBad++; }
  }
}
if (!hBad) ok("更新頻率的說法全站一致（內政部 1、11、21 公告）");

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
      let parsed;
      try { parsed = JSON.parse(m[1]); } catch { fail(`${rel}：JSON-LD 無法解析`); ld++; continue; }
      /* Google 對 Dataset 的要求比 schema.org 嚴：creator 只收 Person／Organization
         （GovernmentOrganization 會被判「物件類型無效」），license 是建議欄位。
         這兩項原本要等 Search Console 回報才知道，改成建置時就擋下來。 */
      for (const o of (Array.isArray(parsed) ? parsed : [parsed])) {
        if (o?.["@type"] !== "Dataset") continue;
        const ct = o.creator?.["@type"];
        if (ct && !["Person", "Organization"].includes(ct)) {
          fail(`${rel}：Dataset 的 creator 型別「${ct}」Google 不接受，只能是 Person 或 Organization`); ld++;
        }
        if (!o.license) { fail(`${rel}：Dataset 缺少 license 欄位`); ld++; }
      }
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

/* ---------- F 目錄 hub 頁 ---------- */
console.log("\n【F】目錄是否有 index（缺少時該網址會 404）");
for (const d of ["tools", "developers", "schools", "areas", "communities", "notes", "videos", "about"]) {
  if (!fs.existsSync(path.join(ROOT, d))) continue;
  if (!fs.existsSync(path.join(ROOT, d, "index.html"))) warn(`/${d}/ 沒有 index.html——使用者或 AI 直接輸入這個網址會 404`);
}

/* ---------- I 產出是否會被提交 ---------- */
/* build-site.js 產生的頂層目錄，必須出現在 build-site.yml 的提交清單裡。
   漏掉的話頁面會在本機與 CI 產生、卻永遠不會進 repo，也就永遠不會上線——
   /faq/ 就這樣消失了兩輪才被發現。 */
console.log("\n【I】建置產出 vs workflow 提交清單");
{
  const wf = path.join(ROOT, ".github/workflows/build-site.yml");
  if (!fs.existsSync(wf)) warn("找不到 .github/workflows/build-site.yml，略過");
  else {
    const y = fs.readFileSync(wf, "utf-8");
    const m = y.match(/git-push-retry\.sh[^\n]*\n([\s\S]*?)(?:\n\s*\n|$)/);
    const listed = new Set((m ? m[1] : "").split(/[\s\\]+/).filter(Boolean)
      .map(x => x.replace(/\/.*$/, "")));
    /* 建置會產生的頂層目錄：有 index.html 而且不是原始碼或資料夾 */
    const SKIP = new Set(["node_modules", ".git", ".github", "scripts", "data", "config", "src", "admin", "assets"]);
    const made = fs.readdirSync(ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith("."))
      .filter(e => fs.existsSync(path.join(ROOT, e.name, "index.html")))
      .map(e => e.name);
    const missing = made.filter(d => !listed.has(d));
    if (missing.length) missing.forEach(d => fail(`/${d}/ 有產出但不在 build-site.yml 的提交清單裡——頁面不會上線`));
    else ok(`${made.length} 個產出目錄都在提交清單裡（${made.join("、")}）`);
  }
}

console.log(`\n═══ 稽核結束：${FAIL} 項錯誤、${WARN} 項提醒 ═══`);
process.exit(FAIL ? 1 : 0);
