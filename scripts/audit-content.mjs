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
 *   P 房價走勢頁 vs 生活圈頁：同一個（生活圈, 年度）的單價中位必須一致
 *   Q 統計值的名稱 vs 算法：修剪後平均不可以被寫成「中位」
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
/* 把訊息留下來，讓 CI 能把內容寫進 GitHub issue。
   原本只印到 stdout，而這支腳本從來沒有被任何 workflow 執行過——
   等於稽核只在有人手動跑的時候才存在。2026-10 補上機器可讀的輸出。 */
const FAIL_MSGS = [], WARN_MSGS = [];
const fail = (...m) => { FAIL++; FAIL_MSGS.push(m.join(" ")); console.log("  ✗", ...m); };
const warn = (...m) => { WARN++; WARN_MSGS.push(m.join(" ")); console.log("  !", ...m); };
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
  /* 四個生活圈的通用計數，與 build-site.js 的 STATS.areas 同一套算法 */
  areaStats: ["美術館特區", "農十六特區", "瑞豐", "中都"].map(key => {
    const list = communities.filter(c => String(c.area || "").includes(key.replace("特區", "")));
    return {
      key,
      communities: list.length,
      deals: list.reduce((n, c) => n + (dealsMap[c.slug] || []).filter(d => d.use !== "店面").length, 0),
    };
  }),
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
    .replace(/\{\{\s*瑞豐成交筆數\s*\}\}/g, STATS.ruifengDeals.toLocaleString("en-US"))
    /* 生活圈層級的變數原本只寫死瑞豐那兩個，所以其他生活圈的文章
       （例如農十六那篇）用 {{農十六社區數}} 時，這裡代不進去，
       封面圖上的數字會被誤判成「內文沒有」。改成和 build-articles.js
       的 fillStats 同一套通用規則。2026-10 補上。 */
    .replace(/\{\{\s*([^}\s]+?)(社區數|成交筆數)\s*\}\}/g, (whole, key, kind) => {
      const a = (STATS.areaStats || []).find(x => x.key.includes(key) || key.includes(x.key));
      if (!a) return whole;
      return (kind === "社區數" ? a.communities : a.deals).toLocaleString("en-US");
    });
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
push("2020起住家成交", all.length, 12066);
push("有公設比社區", withRatio.length, 229, 0.05);
push("公設比中位", med(withRatio.map(ratioOf)), 30.56);
push("有公設比社區的成交樣本", withRatio.flatMap(homesOf).length, 11570);

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
push("成屋−預售 中位差（萬）", Math.abs(med(pr)), 0.08, 2);   // 接近 0，用絕對值比

/* 有表格且表格含行情數字，卻沒寫統計基準 */
const SITEY = /(本站|收錄的|個社區|筆成交|單價中位|成交單價|萬／坪)/;
for (const a of articles) {
  const t = (a.blocks || []).filter(b => b.type === "table");
  if (!t.length || a.statsBasis) continue;
  if (t.some(x => SITEY.test(JSON.stringify(x)))) fail(`${a.slug}：表格含站上行情數字，卻沒有 statsBasis`);
}

/* 車位：行情更新後 community-deals.json 已帶 parkingPrice，
   所以改用與其他指標同一份資料計算，不再讀生活圈資料池。 */
{
  const pkAll = communities.flatMap(c => (dealsMap[c.slug] || [])
    .filter(d => d.use !== "店面" && String(d.date || "") >= SINCE));
  const kind = pkAll.filter(d => d.parking);
  const val = kind.filter(d => d.parkingPrice);
  const typ = val.filter(d => d.ping >= 25 && d.ping <= 60);
  push("車位揭露率 %", kind.length ? val.length / kind.length * 100 : 0, 53, 0.05);
  push("坡道平面車位中位（萬）", med(typ.filter(d => d.parking === "坡道平面").map(d => d.parkingPrice)), 200);
  push("坡道機械車位中位（萬）", med(typ.filter(d => d.parking === "坡道機械").map(d => d.parkingPrice)), 105);
  push("坡道平面樣本數", typ.filter(d => d.parking === "坡道平面").length, 2648);
}

/* 樓高與房數：支撐「大樓蓋越高越貴嗎」與「買幾房最好」兩篇。
   樓高那篇的重點是「固定屋齡後差距消失」，所以要盯的是控制後的兩個值，
   不是原始的 8.6 萬價差。 */
{
  const CN = { 一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 };
  const flr = v => { const t = String(v||"").split("，")[0].replace(/[^0-9一二三四五六七八九十]/g,"");
    if (!t) return null; if (/^\d+$/.test(t)) return +t;
    const m = t.match(/^(.*?)十(.*)$/); if (m) return (m[1]?(CN[m[1]]||0):1)*10+(CN[m[2]]||0);
    return CN[t] ?? null; };
  const base = communities.flatMap(c => (dealsMap[c.slug]||[])
    .filter(d => d.use !== "店面" && d.unitPrice >= 3 && d.unitPrice <= 150 && String(d.date||"") >= SINCE)
    .map(d => ({ ...d, year: yearOf(c) })));
  const bandOf = d => { const n = flr(d.totalFloor); return !n ? null : n <= 12 ? "low" : n <= 20 ? "mid" : "high"; };
  const newer = base.filter(d => (d.year||0) >= 2020);
  push("2020後完工 13–20層 單價中位", med(newer.filter(d => bandOf(d)==="mid").map(d=>d.unitPrice)), 39.7);
  push("2020後完工 21層以上 單價中位", med(newer.filter(d => bandOf(d)==="high").map(d=>d.unitPrice)), 37.6);
  const rooms = n => base.filter(d => String(d.layout||"").startsWith(n + "房"));
  push("3 房成交筆數", rooms(3).length, 5202);
  push("1 房單價中位", med(rooms(1).map(d=>d.unitPrice)), 34.9);
  push("4 房單價中位", med(rooms(4).map(d=>d.unitPrice)), 31.3);
}

/* 農十六特區：支撐「高雄農十六特區買房指南」。
   那篇把四區對照、房型、總價帶與屋齡結構的數字都寫死在表格裡，
   社區一旦增減或成交累積，表格就會和實況脫鉤。
   這裡盯的是文章論點真正依賴的幾個數字——
   「總價中位四區最低」與「單價只差 8%、總價差 27%」這兩句話是整篇的骨幹。 */
{
  const inArea = key => communities.filter(c => String(c.area || "").includes(key));
  const n16 = inArea("農十六");
  const art = inArea("美術館");
  const n16h = n16.flatMap(homesOf);
  const arth = art.flatMap(homesOf);
  push("農十六社區數", n16.length, 72, 0.05);
  push("農十六 2020起住家成交", n16h.length, 2340);
  push("農十六 單價中位", med(n16h.map(d => d.unitPrice)), 30.0);
  push("農十六 總價中位", med(n16h.map(d => d.totalPrice).filter(Boolean)), 1220);
  push("農十六 坪數中位", med(n16h.map(d => d.ping).filter(Boolean)), 40.2);
  push("農十六 公設比中位", med(n16.map(ratioOf).filter(v => v !== null)), 29.26);
  /* 文章宣稱「單價只低 8%、總價低 27%」，兩個比值一起盯，
     只盯單邊的話其中一句話走掉了也看不出來。 */
  const uA = med(arth.map(d => d.unitPrice));
  const uN = med(n16h.map(d => d.unitPrice));
  const tA = med(arth.map(d => d.totalPrice).filter(Boolean));
  const tN = med(n16h.map(d => d.totalPrice).filter(Boolean));
  push("農十六 vs 美術館 單價低 %", uA ? (uA - uN) / uA * 100 : 0, 8, 0.25);
  push("農十六 vs 美術館 總價低 %", tA ? (tA - tN) / tA * 100 : 0, 27, 0.15);
  /* 「2000–2009 年完工的佔 41 個」與「2020 年以後只有 1 個」
     是「四區裡屋齡跨度最大、近年幾乎沒新案」這個論點的依據 */
  const era = (lo, hi) => n16.filter(c => { const y = yearOf(c); return y && y >= lo && y <= hi; }).length;
  push("農十六 2000-2009 完工社區", era(2000, 2009), 41, 0.08);
  push("農十六 2020後完工社區", era(2020, 2099), 1, 1);
}

/* 備註欄：支撐「實價登錄的備註欄怎麼看」。
   這篇的全部論點都建立在「同社區同年份對照」上，所以要盯的是
   控制後的兩個比值，不是原始的 +12.9%——原始值本來就是年份造成的。 */
{
  const DEC = /裝潢|裝修|傢俱|家俱|家具/;
  const KIN = /親友|親屬|親等|二親|三親|關係人/;
  const resale = c => homesOf(c).filter(d => d.kind === "成屋");
  const pool = communities.flatMap(resale);
  const noted = pool.filter(d => String(d.note || "").trim()).length;
  push("備註欄 成屋樣本", pool.length, 10841);
  push("有備註比率 %", pool.length ? noted / pool.length * 100 : 0, 38.7);
  push("含裝潢傢俱筆數", pool.filter(d => DEC.test(d.note || "")).length, 1508);
  push("親友交易筆數", pool.filter(d => KIN.test(d.note || "")).length, 377);
  /* 同社區同年份對照：有註記 ≥1 筆、無備註 ≥2 筆才算一格 */
  const cells = re => {
    const rs = [];
    for (const c of communities) {
      const g = {};
      for (const d of resale(c)) (g[String(d.date).slice(0, 4)] ||= []).push(d);
      for (const y of Object.keys(g)) {
        const A = g[y].filter(d => re.test(d.note || "")).map(d => d.unitPrice);
        const B = g[y].filter(d => !String(d.note || "").trim()).map(d => d.unitPrice);
        if (A.length >= 1 && B.length >= 2) rs.push(med(A) / med(B));
      }
    }
    return rs;
  };
  const dc = cells(DEC), kc = cells(KIN);
  push("裝潢 同社區同年份對照格數", dc.length, 440, 0.08);
  push("裝潢 同社區同年份 %", (med(dc) - 1) * 100, 2.3, 0.35);
  push("親友 同社區同年份對照格數", kc.length, 199, 0.08);
  push("親友 同社區同年份 %", Math.abs((med(kc) - 1) * 100), 17.5, 0.12);
  push("親友 偏低格數", kc.filter(x => x < 1).length, 168, 0.08);
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
        /* 去括號時同步記下「flat 第 j 個字元原本在 sent 的哪一格」。
           少了這張對照表，i 是 flat 座標、m.index 是 sent 座標，
           兩套座標相減會把主詞判給錯的區——只要「最低」前面出現過括號就會發生。 */
        let flat = "", pos = [], depth = 0;
        for (let k = 0; k < sent.length; k++) {
          const ch = sent[k];
          if (ch === "（") { depth++; continue; }
          if (ch === "）") { if (depth) depth--; continue; }
          if (depth) continue;
          flat += ch; pos.push(k);
        }
        const mentioned = AREAS.filter(area => ALIAS[area].some(al => flat.includes(al)));
        if (!mentioned.length) continue;
        const r = rankOf(metric);
        let best = null, bestD = 1e9;
        for (const area of AREAS) {
          for (const al of ALIAS[area]) {
            let i = -1;
            while ((i = flat.indexOf(al, i + 1)) >= 0) {
              /* 被「與／和／跟／比」帶出來的區名是拿來對照的，不是這句話的主詞。
                 踩過的句子：「單價與農十六同為四區最低水準，公設比則是單獨最低」——
                 這是瑞豐那篇在講自己，但農十六落在句首 12 字內，
                 規則一就把主詞判給了農十六，於是報出一條不存在的錯誤。
                 假警報比漏抓更糟：報幾次之後就沒有人會再看這個稽核了。 */
              if (/[與和跟比]$/.test(flat.slice(0, i))) continue;
              if (i < 12 && (!best || bestD === 1e9)) { best = area; bestD = 0; }
              const d = Math.abs(pos[i] - m.index);   // 換回 sent 座標再比
              if (bestD !== 0 && d < bestD) { bestD = d; best = area; }
            }
          }
        }
        if (!best || bestD > 30) continue;

        /* 否定句要反過來判。
           「美術館特區不是四區裡單價最高的」是一個正確的句子，
           但原本的規則只看「出現了最高＋出現了區名」，會把它判成錯誤宣稱。
           否定詞必須緊接在「最高／最低」之前（10 個字元內）才算——
           「不是最高」是否定，「雖然不是新案，但單價最高」不是。
           反過來之後這條規則仍然有效：如果某區其實就是最高的，
           而文章寫它「不是最高」，一樣會被抓出來。 */
        const before = sent.slice(Math.max(0, m.index - 10), m.index);
        const negated = /(不是|並非|不算|未必|稱不上|談不上|沒有一?個?是)[^。]{0,6}$/.test(before);

        /* 否定句的主詞一定在否定詞之前：「美術館特區不是…最高的」。
           「總價不是最低的——農十六的中位數比這裡低」這種句子，
           否定詞前面沒有任何區名，後面那個區名是用來對照的、不是主詞，
           用「離最高／最低最近」的規則會判給錯的區。判不出主詞就跳過，
           寧可漏抓也不要製造假警報——假警報多了，真錯誤就會被忽略。 */
        let subj = best;
        if (negated) {
          const head = sent.slice(0, m.index);
          let hd = 1e9;
          subj = null;
          for (const area of AREAS) {
            for (const al of ALIAS[area]) {
              let i = -1;
              while ((i = head.indexOf(al, i + 1)) >= 0) {
                const d = m.index - i;
                if (d < hd) { hd = d; subj = area; }
              }
            }
          }
          if (!subj) continue;
        }

        gSeen++;
        /* 並列的說法不只「並列」一種：「與農十六同為四區最低水準」講的是
           兩區同處最低，而且句子自己把兩個數字都寫出來了（30.1 與 30.0），
           這是誠實的陳述，不該被當成「宣稱自己是唯一最低」。
           只要句子裡有並列語氣，就改判成「提到的區當中有一個是極值即可」。 */
        const JOINT = /(並列|同為|同列|皆為|均為|一樣|相當|同樣)/;
        const claimTrue = JOINT.test(flat)
          ? mentioned.some(x => r[kind].includes(x))
          : r[kind].includes(subj);
        if (negated ? claimTrue : !claimTrue) {
          fail(`${a.slug}：宣稱「${subj}」的${metric}${negated ? "不是" : ""}${kind === "min" ? "最低" : "最高"}，實際是 ${r[kind].join("、")}`);
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
  [/每日自動|每天自動|資料每日更新/, "實價登錄不是每日更新，內政部是每月 1、11、21 日批次公告"],
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

/* ---------- J 自訂色票是否真的存在 ---------- */
/* Tailwind 只會為「掃得到、而且有定義」的 class 產生 CSS。
   程式碼裡寫了 text-pass / border-fail，但 tailwind.config.js 沒定義這個色票時，
   不會有任何錯誤——class 照樣輸出到 HTML，只是沒有樣式，
   「通過」和「不符」就長得一模一樣。新青安與房地合一稅兩個工具頁曾經就是這樣。 */
console.log("\n【J】自訂色票 class 是否在 tailwind.config.js 有定義");
{
  const cfgPath = path.join(ROOT, "tailwind.config.js");
  if (!fs.existsSync(cfgPath)) warn("找不到 tailwind.config.js，略過");
  else {
    const cfg = fs.readFileSync(cfgPath, "utf-8");
    const colorsBlock = cfg.match(/colors:\s*\{([\s\S]*?)\n\s*\}/);
    const defined = new Set((colorsBlock ? colorsBlock[1] : "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .match(/([A-Za-z][A-Za-z0-9]*)\s*:/g)?.map(x => x.replace(/\s*:$/, "")) || []);
    /* Tailwind 內建的色票名與功能名都不必在 config 裡定義 */
    const BUILTIN = new Set(["inherit", "current", "transparent", "black", "white",
      "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime",
      "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
      "fuchsia", "pink", "rose"]);
    /* 掃原始碼：text-xxx / bg-xxx / border-xxx / fill-xxx / ring-xxx，
       排除帶單位或數字的（text-[16px]、border-2、bg-opacity-50 之類） */
    const srcFiles = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.(js|mjs)$/.test(e.name)) srcFiles.push(f);
      }
    })(path.join(ROOT, "scripts"));
    /* 只掃 class / className 屬性裡的字，不要掃整個檔案——
       border-radius:、text-align:、text-anchor= 這些 CSS／SVG 屬性名
       長得跟 Tailwind 的色票 class 一樣，掃全文會生出一堆假警報。 */
    const bad = new Map();
    for (const f of srcFiles) {
      const txt = fs.readFileSync(f, "utf-8");
      for (const attr of txt.matchAll(/\bclass(?:Name)?=(?:"([^"]*)"|\{`([^`]*)`\}|`([^`]*)`)/g)) {
        const cls = attr[1] || attr[2] || attr[3] || "";
        for (const m of cls.matchAll(/(?:^|[\s:[("'])(?:text|bg|border|fill|ring|decoration|outline|divide|from|via|to)-([a-zA-Z][a-zA-Z0-9]*)(?![\w-])/g)) {
          const name = m[1];
          if (defined.has(name) || BUILTIN.has(name)) continue;
          /* 這些是 Tailwind 的功能性後綴，不是色票 */
          if (/^(left|right|center|justify|start|end|top|bottom|xs|sm|md|lg|xl|solid|dashed|dotted|double|none|hidden|collapse|separate|fixed|local|scroll|repeat|cover|contain|clip|border|padding|content|auto|balance|pretty|wrap|nowrap|ellipsis|opacity|dense|y|x|t|b|l|r|offset|inset|width|color|style)$/.test(name)) continue;
          if (!bad.has(name)) bad.set(name, new Set());
          bad.get(name).add(path.relative(ROOT, f));
        }
      }
    }
    if (bad.size) {
      for (const [name, files] of bad) {
        fail(`色票「${name}」在 tailwind.config.js 沒有定義，class 會輸出但沒有樣式（出現在 ${[...files].join("、")}）`);
      }
    } else ok(`掃描 ${srcFiles.length} 個原始檔：所有自訂色票 class 都有定義（${[...defined].join("、")}）`);
  }
}

/* ---------- K 重複網址（/xxx/index.html） ---------- */
/* 每個目錄頁都有兩個可到達的網址：/videos/ 與 /videos/index.html，
   canonical 指向前者。只要站內還有連到後者的連結，Google 就會爬到它、
   然後在 Search Console 歸到「替代頁面（有適當的標準標記）」——
   不是錯誤，但會一直累積、而且那份報告的「驗證」永遠不會通過。
   建置時有一道「內部連結改目錄形式」的處理，但它只掃 HTML 屬性，
   掃不到 React 計算器編譯後塞進 <script> 裡的連結，所以這裡補驗一次。 */
console.log("\n【K】是否還有連到 /xxx/index.html 的重複網址");
if (BUILT) {
  const hits = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".html")) {
        /* Babel 會把 JSX 文字裡的中文轉成 \uXXXX，但網址是 ASCII，直接掃原文即可 */
        const txt = fs.readFileSync(f, "utf-8");
        const rel = path.relative(ROOT, f);
        /* notes/article.html 是舊網址的轉址殼，本身 noindex，裡面的 index.html
           是 JS 的 fallback 目標、不是可被爬的連結，排除。 */
        if (rel === "notes/article.html") continue;
        for (const m of txt.matchAll(/["'(]([^"'()\s]*\/index\.html)(?:["'?#)])/g)) {
          hits.push(`${rel} → ${m[1]}`);
        }
      }
    }
  };
  walk(ROOT);
  if (hits.length) {
    for (const h of hits.slice(0, 20)) fail(`連到 /index.html 會製造重複網址：${h}`);
    if (hits.length > 20) fail(`…另有 ${hits.length - 20} 處`);
  } else ok("全站沒有連到 /xxx/index.html 的連結（含工具頁編譯後的 script）");
} else {
  warn("需要 --built 才能檢查（目前沒有已建置的 HTML）");
}

/* ---------- L 彙整頁的內容量 ---------- */
/* 彙整頁的本體是連結清單，純文字很容易不到 1,000 字。
   Google 對這種頁面的處理是「已檢索－目前尚未建立索引」：爬了，但判斷不值得收。
   /schools/ 在 2026-10 就是這樣掉出索引的（當時 816 字），
   而 /areas/、/developers/、/tools/ 當時比它還薄，只是還沒輪到。
   門檻設 1,000 字：低於這個數就提醒，不當成錯誤——要補什麼是內容判斷，不是機械規則。 */
console.log("\n【L】彙整頁的內容量（太薄會被 Google 歸為「已檢索－尚未建立索引」）");
if (BUILT) {
  const MIN = 1000;
  /* 清單原本漏了 deals 與 about，所以 /deals/ 的 262 字從這個檢查底下溜過去——
     而它是全站連入最多的頁（導覽列與頁尾每一頁都連）。
     這個清單要和 build-site.js 實際產出的目錄一致，不要只列想得到的那幾個。
     2026-10 補上 deals、about。 */
  const HUBS = ["areas", "schools", "developers", "tools", "notes", "communities", "videos", "faq", "deals", "about"];
  let thin = 0;
  for (const d of HUBS) {
    const f = path.join(ROOT, d, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf-8");
    const m = html.match(/<main[\s\S]*?<\/main>/);
    const text = (m ? m[0] : html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < MIN) { warn(`/${d}/ 的 main 純文字只有 ${text.length} 字（建議 ${MIN} 字以上），容易被判定為內容不足`); thin++; }
  }
  if (!thin) ok(`${HUBS.filter(d => fs.existsSync(path.join(ROOT, d, "index.html"))).length} 個彙整頁的內容量都在門檻以上`);
} else {
  warn("需要 --built 才能檢查（目前沒有已建置的 HTML）");
}

/* ---------- M 文章的站內連入分布 ---------- */
/* 原本 More 區塊取「最新三篇」、Next 區塊取「同分類最新三篇」，
   所以站內連結幾乎由日期決定：最新的三篇各拿三十幾個連入，
   有十二篇是零。文章一旦不是最新的，連入就歸零，
   Google 與 AI 引擎也看不出哪幾篇屬於同一個主題群。
   改成相關度排序之後，這一檢查負責確認沒有回到老樣子。 */
console.log("\n【M】文章的站內連入（孤兒與過度集中）");
if (BUILT) {
  const dir = path.join(ROOT, "notes");
  if (!fs.existsSync(dir)) warn("找不到 notes/，略過");
  else {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".html") && !["index.html", "article.html"].includes(f));
    const inbound = new Map();
    const real = [];
    for (const f of files) {
      const html = fs.readFileSync(path.join(dir, f), "utf-8");
      /* 舊網址的轉跳殼是 noindex，不是真正的文章，不列入 */
      if (/name="robots" content="noindex/.test(html.slice(0, 1200))) continue;
      real.push(f);
      inbound.set(decodeURIComponent(f.replace(/\.html$/, "")), 0);
    }
    for (const f of real) {
      const html = fs.readFileSync(path.join(dir, f), "utf-8");
      const m = html.match(/<main[\s\S]*?<\/main>/);
      const main = m ? m[0] : html;
      const self = decodeURIComponent(f.replace(/\.html$/, ""));
      const seen = new Set();
      for (const mm of main.matchAll(/href="([^"#?]+?)\.html"/g)) {
        const t = decodeURIComponent(mm[1].split("/").pop());
        if (t !== self && inbound.has(t) && !seen.has(t)) { seen.add(t); inbound.set(t, inbound.get(t) + 1); }
      }
    }
    const orphans = [...inbound].filter(([, n]) => !n).map(([k]) => k);
    if (orphans.length) orphans.forEach(o => fail(`文章「${o}」沒有任何站內連入——除了 sitemap 之外沒有路徑走到它`));
    const vals = [...inbound.values()];
    const max = Math.max(...vals), min = Math.min(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    /* 單篇吃掉超過平均四倍，代表又回到「只連最新幾篇」的狀態 */
    const hogs = [...inbound].filter(([, n]) => n > avg * 4);
    hogs.forEach(([k, n]) => warn(`文章「${k}」拿到 ${n} 個站內連入（平均 ${avg.toFixed(1)}），連結過度集中`));
    if (!orphans.length && !hogs.length) ok(`${vals.length} 篇文章都有站內連入（最少 ${min}、最多 ${max}、平均 ${avg.toFixed(1)}）`);
  }
} else {
  warn("需要 --built 才能檢查（目前沒有已建置的 HTML）");
}

/* ---------- N 社區之間的成交歸屬 ---------- */
/* 比對用的 projectNames 是**子字串**比對（fetch-market-data.js 的 stillBelongs
   與 deal-pool 的收錄邏輯都是 project.includes(name)）。
   所以只要有一個社區把過短的名稱放進 projectNames，它就會把
   所有「名稱包含它」的建案通通吸過來。

   2026-10 實際發生過：博愛大廈的 projectNames 有一個裸的「博愛」，
   結果把博愛香榭（2021 完工、興富發）的 295 筆預售全部吸進去——
   一棟 1998 年的大樓，社區頁上寫著「其中 295 筆為預售屋買賣」，
   成交筆數 391（真正屬於它的只有 96），連帶讓生活圈頁與學區頁的
   成交筆數一起灌水。

   這裡用成交資料本身回頭驗證：如果一筆成交的建案名稱**精確等於**
   另一個社區登記的名稱，而這個社區沒登記這個名稱，那它就是被誤收的。
   這是錯誤不是提醒——頁面上的數字會直接錯給客戶看。 */
console.log("\n【N】社區之間的成交歸屬（建案名稱子字串誤收）");
{
  const norm = x => String(x || "").replace(/\s+/g, "");
  const owner = new Map();                 // 建案名稱 → 擁有它的社區集合
  for (const c of communities) {
    for (const n of (c.projectNames || [])) {
      const k = norm(n);
      if (!k) continue;
      if (!owner.has(k)) owner.set(k, new Set());
      owner.get(k).add(c.name);
    }
  }
  let bad = 0;
  for (const c of communities) {
    const mine = new Set((c.projectNames || []).map(norm));
    const hit = new Map();
    for (const d of (dealsMap[c.slug] || [])) {
      const p = norm(d.project);
      if (!p || mine.has(p)) continue;
      const o = owner.get(p);
      if (o && !o.has(c.name)) hit.set(p, (hit.get(p) || 0) + 1);
    }
    for (const [p, n] of hit) {
      bad++;
      fail(`${c.name} 收錄了 ${n} 筆建案名稱為「${p}」的成交，但那個名稱登記在「${[...owner.get(p)].join("、")}」`
         + `——檢查 ${c.name} 的 projectNames 有沒有過短而把別的建案吸進來`);
    }
  }

  /* 另外把「還沒出事但有風險」的短名稱列出來：
     某個社區的 projectNames 是另一個社區名稱的子字串，目前還沒抓到東西，
     但只要那個建案之後出現在實價登錄就會中。 */
  const risky = [];
  for (const [a, ca] of owner) {
    for (const [b, cb] of owner) {
      if (a === b || a.length < 2 || !b.includes(a)) continue;
      const sameOwner = [...ca].every(x => cb.has(x)) && [...cb].every(x => ca.has(x));
      if (!sameOwner) risky.push(`「${a}」(${[...ca].join("、")}) 是「${b}」(${[...cb].join("、")}) 的子字串`);
    }
  }
  if (risky.length) warn(`${risky.length} 組比對名稱有子字串重疊，目前尚未誤收但有風險：${risky.slice(0, 6).join("；")}${risky.length > 6 ? `…另 ${risky.length - 6} 組` : ""}`);
  if (!bad) ok(`${communities.length} 個社區的成交歸屬沒有跨社區誤收`);
}

/* ---------- O 規格表的完工時間 vs 實價登錄的建築完成年月 ---------- */
/* 門牌範圍是用「建築完成年月＋總樓層」驗證過的，所以同一個範圍內的成交
   這個欄位會一致——那就是這棟樓在官方登記上的完工時間。
   規格表的「完工時間」取自樂居、好房網這些平台，和官方登記不一定相同。

   站上的既有慣例是「有兩說就並列、註明出處」，已經這樣寫的不算錯；
   這裡只挑「只寫一個日期、又和官方登記差半年以上、而且沒交代差異」的，
   因為那會讓讀者以為是確定的事實。屋齡直接影響貸款年限與定價，差一年有感。

   用提醒不用錯誤：哪個日期才對是內容判斷（有的案子分批取得使照），
   不是機械規則能定的。 */
console.log("\n【O】規格表完工時間 vs 實價登錄建築完成年月");
{
  const pool = (() => {
    const dir = path.join(ROOT, "data/area-deals");
    if (!fs.existsSync(dir)) return null;
    const out = [];
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
      let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")); } catch { continue; }
      const ci = (d.columns || []).indexOf("土地位置建物門牌");
      const yi = (d.columns || []).indexOf("建築完成年月");
      if (ci < 0 || yi < 0) continue;
      for (const r of (d.rows || [])) {
        const a = String(r[ci] || ""), y = String(r[yi] || "").trim();
        if (a && y) out.push([a, y]);
      }
    }
    return out;
  })();

  if (!pool || !pool.length) {
    warn("讀不到 data/area-deals 資料池，略過這項檢查");
  } else {
    const norm = x => String(x || "")
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/\s+/g, "");
    const inRange = (a, ranges) => {
      for (const r of (ranges || [])) {
        const road = norm(r.road || "");
        if (!road || !a.includes(road)) continue;
        const m = (a.split(road)[1] || "").match(/^(\d+)/);
        if (!m) continue;
        const no = +m[1];
        if (no < (r.from ?? -Infinity) || no > (r.to ?? Infinity)) continue;
        if (r.parity === "odd" && no % 2 === 0) continue;
        if (r.parity === "even" && no % 2 === 1) continue;
        return true;
      }
      return false;
    };
    const normed = pool.map(([a, y]) => [norm(a), y]);
    let n = 0;
    for (const c of communities) {
      const ranges = c.addressRanges || [];
      if (!ranges.length) continue;
      const spec = (c.specs || []).find(p => /完工/.test(p[0]));
      if (!spec) continue;
      const txt = String(spec[1]);
      /* 已經並列兩說、寫了範圍、或註明以實價登錄為準的，照慣例不算錯 */
      if (/實價登錄|不一致|另有|另記|推算|參考資料|交屋|[~～]|\d\s*至\s*\d/.test(txt)) continue;
      const m = txt.match(/((?:19|20)\d{2})[\/\-年]?\s*(\d{1,2})?/);
      if (!m) continue;
      const sy = +m[1], sm = m[2] ? +m[2] : null;
      const cnt = new Map();
      for (const [a, y] of normed) if (inRange(a, ranges)) cnt.set(y, (cnt.get(y) || 0) + 1);
      if (!cnt.size) continue;
      const [roc, hits] = [...cnt].sort((a, b) => b[1] - a[1])[0];
      if (hits < 5 || roc.length < 6) continue;
      const ry = +roc.slice(0, roc.length - 4) + 1911, rm = +roc.slice(-4, -2);
      const diff = Math.abs((sy * 12 + (sm || rm)) - (ry * 12 + rm));
      if (diff < 6) continue;
      n++;
      warn(`${c.name}：規格表寫「${txt.slice(0, 20)}」，實價登錄的建築完成年月是 ${ry}/${String(rm).padStart(2, "0")}`
         + `（${hits} 筆成交一致），差 ${diff} 個月且未在規格表裡交代`);
    }
    if (!n) ok("規格表的完工時間與實價登錄的建築完成年月沒有未交代的落差");
  }
}

/* ───────────────────────────────────────────────────────────
   【P】房價走勢頁 vs 生活圈頁的逐年數字
   ───────────────────────────────────────────────────────────
   areas/trend/ 把四個生活圈的逐年單價中位數並排成一張表，
   生活圈頁自己也各有一張。兩邊都由 scripts/lib/area-stats.js 的 yearly() 算出來，
   所以「資料正確」不等於「頁面正確」——中間還有兩套不同的渲染程式，
   欄位錯位、取錯索引、四捨五入不一致都會讓同一個數字在兩頁長得不一樣，
   而這種錯誤讀者一眼看得出來，稽核卻抓不到。
   這支檢查的是渲染後的 HTML，不是資料：從兩邊的表格把
   （生活圈, 年度 → 單價中位）解析出來逐格相比。 */
if (BUILT) {
  console.log("\n【P】房價走勢頁 vs 生活圈頁的逐年單價");
  const trendFile = path.join(ROOT, "areas/trend/index.html");
  if (!fs.existsSync(trendFile)) {
    warn("找不到 areas/trend/index.html——房價走勢落地頁沒有產生出來");
  } else {
    const txt = fs.readFileSync(trendFile, "utf-8");
    /* 只取「四個生活圈逐年對照」那一張表 */
    const seg = txt.match(/id="compare"[\s\S]*?<\/table>/);
    const cellNum = td => {
      const m = td.replace(/<span[\s\S]*?<\/span>/g, "").match(/>\s*(-?\d+(?:\.\d+)?)\s*$/)
             || td.replace(/<span[\s\S]*?<\/span>/g, "").match(/(-?\d+(?:\.\d+)?)/);
      return m ? Number(m[1]) : null;
    };
    if (!seg) {
      fail("areas/trend/index.html：找不到四區逐年對照表（id=\"compare\"）");
    } else {
      /* 表頭：第一欄是年度、第二欄是四區整體，之後才是各生活圈 */
      const ths = [...seg[0].matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)]
        .map(m => m[1].replace(/<[^>]+>/g, "").replace(/萬／坪/g, "").trim());
      const areaCols = ths.slice(2);
      /* 表身：每一列 th 是年度，td 依表頭順序 */
      const bodyRows = [...seg[0].matchAll(/<tr class="border-b border-line last:border-0">([\s\S]*?)<\/tr>/g)];
      const onTrend = new Map();   // `${區}|${年}` → 單價
      for (const [, row] of bodyRows) {
        const y = (row.match(/<th scope="row"[^>]*>([\s\S]*?)<\/th>/) || [])[1];
        const year = y ? Number(y.replace(/<[^>]+>/g, "").replace(/[^\d]/g, "").slice(0, 4)) : null;
        if (!year) continue;
        const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
        areaCols.forEach((name, i) => {
          const raw = tds[i + 1];                  // tds[0] 是四區整體
          if (raw === undefined) return;
          if (/^\s*—\s*$/.test(raw.replace(/<[^>]+>/g, ""))) return;
          const v = cellNum(raw);
          if (v !== null) onTrend.set(`${name}|${year}`, v);
        });
      }

      /* 生活圈頁自己的逐年表 */
      let checked = 0, bad = 0;
      const areaDirs = fs.existsSync(path.join(ROOT, "areas"))
        ? fs.readdirSync(path.join(ROOT, "areas"), { withFileTypes: true })
            .filter(e => e.isDirectory() && e.name !== "trend").map(e => e.name)
        : [];
      for (const slug of areaDirs) {
        const f = path.join(ROOT, "areas", slug, "index.html");
        if (!fs.existsSync(f)) continue;
        const a = fs.readFileSync(f, "utf-8");
        const h1 = (a.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "";
        /* H1 是「高雄○○房價行情與社區一覽」，取出生活圈名以對上表頭 */
        const name = areaCols.find(n => h1.includes(n));
        if (!name) { warn(`areas/${slug}/：H1「${h1.replace(/<[^>]+>/g, "").trim()}」對不上走勢頁表頭的任何一欄`); continue; }
        const tseg = a.match(/id="trend"[\s\S]*?<\/table>/);
        if (!tseg) continue;   // 樣本不足、沒有走勢區塊是正常的
        for (const [, row] of tseg[0].matchAll(/<tr class="border-b border-line last:border-0">([\s\S]*?)<\/tr>/g)) {
          const y = (row.match(/<th scope="row"[^>]*>([\s\S]*?)<\/th>/) || [])[1];
          const year = y ? Number(y.replace(/<[^>]+>/g, "").trim()) : null;
          if (!year) continue;
          const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
          const mine = cellNum(tds[0] || "");
          const theirs = onTrend.get(`${name}|${year}`);
          if (mine === null) continue;
          if (theirs === undefined) {
            fail(`${name} ${year} 年：生活圈頁有 ${mine} 萬／坪，但房價走勢頁那一格是空的`);
            bad++;
            continue;
          }
          checked++;
          if (Math.abs(mine - theirs) > 0.001) {
            fail(`${name} ${year} 年單價中位不一致：生活圈頁 ${mine}、房價走勢頁 ${theirs}（萬／坪）`);
            bad++;
          }
        }
      }
      if (!checked) warn("沒有比對到任何逐年數字——解析方式可能已經跟模板脫鉤，請確認");
      else if (!bad) ok(`房價走勢頁與 ${areaDirs.length} 個生活圈頁的逐年單價完全一致（比對 ${checked} 格）`);
    }
  }
}

/* ───────────────────────────────────────────────────────────
   【Q】統計值的名稱必須跟算法一致
   ───────────────────────────────────────────────────────────
   市場資料的 avgPricePerPing 這個欄位名是歷史包袱，它實際上是哪一種
   統計量，由 fetch-market-data.js 的 AREA_STAT_KIND 決定：
     "median"       中位數（2026/10/31 起）
     "trimmed-mean" 剔除頭尾各一成後的平均（2026/09/09–10/31）
   這個欄位的值在 2026 年內被改過三次方向，每次都有人忘了改文案：
     09/09 上午改成中位數、下午改回平均，文案跟著改了
     10/27 文案被寫成「近一年中位」，但當時的值是平均——數字對、名稱錯，
           四個生活圈頁都中招，而且頁面看起來完全正常，只有知道算法的人
           才看得出名稱掛錯
   所以這條檢查不寫死方向，改成讀 AREA_STAT_KIND，再反過來禁止另一個詞。
   以後只要改算法，沒同步改文案就會立刻報錯。 */
console.log("\n【Q】統計值的名稱 vs 實際算法");
{
  const FMD = path.join(ROOT, "scripts/fetch-market-data.js");
  const kindM = fs.existsSync(FMD)
    ? (fs.readFileSync(FMD, "utf-8").match(/AREA_STAT_KIND\s*=\s*"([a-z-]+)"/) || [])[1]
    : null;
  if (!kindM) {
    warn("找不到 fetch-market-data.js 的 AREA_STAT_KIND，無法檢查統計值用字");
  } else {
    /* 口徑是中位數時，禁止把它講成平均；是修剪後平均時，禁止講成中位 */
    const BAN = kindM === "median"
      ? { re: /(平均單價|成交均價|區域均價|每坪平均|均價)/, say: "中位數", wrong: "平均" }
      : { re: /中位/, say: "修剪後平均", wrong: "中位" };

    const SRC = path.join(ROOT, "scripts");
    const walkJs = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : walkJs(p);
      return /\.(js|mjs)$/.test(e.name) ? [p] : [];
    });
    let qBad = 0, qSeen = 0;
    for (const f of fs.existsSync(SRC) ? walkJs(SRC) : []) {
      const rel = path.relative(ROOT, f);
      /* 產生端的註解本來就會提到兩種算法；稽核自己的訊息字串也含這些詞 */
      if (/fetch-market-data\.js$|audit-content\.mjs$/.test(rel)) continue;
      const src = fs.readFileSync(f, "utf-8");
      src.split("\n").forEach((line, i) => {
        if (!line.includes("avgPricePerPing")) return;
        if (/^\s*\/[/*]|^\s*\*/.test(line)) return;            // 整行是註解就不算
        qSeen++;
        /* 只看同一段樣板字串，整行一起看會把相鄰但無關的兩段誤判 */
        for (const seg of line.match(/`[^`]*`/g) || []) {
          if (seg.includes("avgPricePerPing") && BAN.re.test(seg)) {
            fail(`${rel}:${i + 1}：avgPricePerPing 現在是${BAN.say}，卻被寫成「${BAN.wrong}」`
               + ` → ${seg.replace(/\s+/g, " ").slice(0, 70)}`);
            qBad++;
          }
        }
      });
    }
    if (!qBad) ok(`avgPricePerPing 的用字與 AREA_STAT_KIND（${kindM}）一致（檢查 ${qSeen} 處引用）`);
  }
}

console.log(`\n═══ 稽核結束：${FAIL} 項錯誤、${WARN} 項提醒 ═══`);

/* ---------- 給 CI 用的輸出 ---------- */
/* --digest 會連提醒一起帶出來（每週巡檢用）；平常只帶錯誤。 */
if (process.env.GITHUB_OUTPUT) {
  const digest = process.argv.includes("--digest");
  let body = "";
  if (FAIL) {
    body += `## 稽核發現 ${FAIL} 項錯誤\n\n`;
    body += FAIL_MSGS.map(m => `- ${m}`).join("\n") + "\n";
  }
  if (digest && WARN) {
    body += `\n## 另有 ${WARN} 項提醒\n\n`;
    body += WARN_MSGS.map(m => `- ${m}`).join("\n") + "\n";
  }
  if (body) {
    body += `\n---\n由 \`scripts/audit-content.mjs\` 自動產生。`
         + `本機重現：\`node scripts/build-site.js && node scripts/audit-content.mjs --built\`\n`;
  }
  const out = [
    `fail_count=${FAIL}`,
    `warn_count=${WARN}`,
    `has_errors=${FAIL ? "true" : "false"}`,
    `body<<AUDIT_EOF\n${body}\nAUDIT_EOF`,
  ].join("\n") + "\n";
  fs.appendFileSync(process.env.GITHUB_OUTPUT, out);
}

/* 錯誤不讓 CI 變紅：行情更新與全站建置不該因為內容問題而停擺，
   網站照樣要上線。改成開 issue 通知，由人判斷。
   --strict 時才用 exit code 1（本機與手動檢查用）。 */
process.exit(FAIL && process.argv.includes("--strict") ? 1 : 0);
