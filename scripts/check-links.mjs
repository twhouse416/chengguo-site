/**
 * 澄果團隊｜文章外部連結健檢
 * ------------------------------------------------
 * 為什麼要有這支：
 * 文章裡引用的官方出處（財政部、央行、內政部、區公所……）會搬家或下架，
 * 而政府網站改版特別頻繁。連結掛掉的文章對讀者是死路，對 Google 的
 * E-E-A-T 也是扣分，但沒有人會定期去點。
 *
 * 另一個用途（2026/11）：開發時的沙箱連不到 .gov.tw，無法親自確認
 * 候選網址指到哪一頁。這支會把每個網址的「最終網址」與「頁面標題」抓回來，
 * 所以指錯地方也看得出來——不是只看通不通。
 *
 * 用法：
 *   node scripts/check-links.mjs            檢查文章裡的所有外部連結
 *   node scripts/check-links.mjs --candidates  連同下方 CANDIDATES 一起檢查
 *
 * 刻意不讓它失敗阻斷建置：連結掛掉是內容問題，由人判斷要換成什麼。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WITH_CANDIDATES = process.argv.includes("--candidates");

/* 一次性的候選清單：要補進文章 sources 欄位之前先驗一遍。
   驗完、網址確定之後，這個陣列就可以清空（留著也只是多檢查幾條）。 */
const CANDIDATES = [
  /* 第二輪（2026/11/20）。第一輪驗出兩個錯，所以這一輪的原則是：
       - 猜出來的網址一律先丟進來驗，不要直接寫進文章
       - 已知會轉址的，直接改用最終網址，省一次跳轉
     第一輪的教訓：
       pcode=D0060069 我以為是「不動產經紀業管理條例」，實際是「獎勵辦法」——差三碼是不同法規
       pip.moi.gov.tw 回 200 但標題是「Request Rejected」，被防火牆擋掉，只看狀態碼看不出來
       www.ris.gov.tw/app/portal/219 我以為是門牌查詢，實際是「年歲對照表」
       高雄歸「高雄國稅局」不是「南區國稅局」，南區管的是雲嘉南 */

  /* 法條（要精確到條例本身，不要拿到施行細則或獎勵辦法） */
  "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0060066",   // 應為 不動產經紀業管理條例
  "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0340003",   // 應為 所得稅法（房地合一在這部）
  "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0340072",   // 應為 遺產及贈與稅法

  /* 主管機關（高雄在地） */
  "https://www.ntbk.gov.tw/",                                     // 應為 財政部高雄國稅局
  "https://www.kctax.gov.tw/main/index.aspx",                     // 高雄市稅捐稽徵處（已知最終網址）

  /* 全國性機關（用第一輪驗出的最終網址，省一次轉址） */
  "https://www.cbc.gov.tw/tw/mp-1.html",                          // 中央銀行
  "https://www.jcic.org.tw/main_ch/index.aspx",                   // 金融聯合徵信中心

  /* 稅務入口網的節稅手冊：讀者比法條好讀，但路徑是猜的，要驗 */
  "https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-saving-manual/local/land-value-tax/D58m6We",
  "https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-saving-manual",

  /* 地政司：第一輪 www.land.moi.gov.tw 完全連不到，試不帶 www 與替代入口 */
  "https://land.moi.gov.tw/",
  "https://www.land.moi.gov.tw/chhtml/index",
  "https://www.land.moi.gov.tw/",
];

/* ---------- 收集文章裡的外部連結 ---------- */
function collect() {
  const p = path.join(ROOT, "data/articles.json");
  const arts = JSON.parse(fs.readFileSync(p, "utf-8")).articles.filter(a => !a.draft);
  const map = new Map();   // url → [{slug, where}]
  const add = (url, slug, where) => {
    const u = url.replace(/[.,。、）)]+$/, "");
    if (!/^https?:\/\//.test(u)) return;
    if (!map.has(u)) map.set(u, []);
    map.get(u).push({ slug, where });
  };
  for (const a of arts) {
    (a.sources || []).forEach(s => s?.url && add(s.url, a.slug, "資料來源欄位"));
    /* 內文的 markdown 連結與裸網址都要抓 */
    const text = JSON.stringify(a);
    for (const m of text.matchAll(/https?:\/\/[^"\\\s)）]+/g)) {
      add(m[0], a.slug, "內文");
    }
  }
  return map;
}

/* ---------- 抓一頁 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function probe(url) {
  /* 政府網站多半擋沒有 UA 的請求，也常對 HEAD 回 405，所以一律用 GET。 */
  const headers = {
    "user-agent": "Mozilla/5.0 (compatible; k7-link-check/1.0; +https://k7.com.tw/)",
    "accept": "text/html,application/xhtml+xml,*/*",
    "accept-language": "zh-TW,zh;q=0.9",
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: ac.signal });
      clearTimeout(timer);
      let title = "";
      const ct = res.headers.get("content-type") || "";
      if (/html/i.test(ct)) {
        const body = (await res.text()).slice(0, 200000);
        const m = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (m) title = m[1].replace(/\s+/g, " ").trim().slice(0, 70);
      } else {
        title = `（${ct.split(";")[0] || "非 HTML"}）`;
      }
      return { ok: res.status >= 200 && res.status < 400, status: res.status,
               finalUrl: res.url !== url ? res.url : "", title };
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 2) {
        return { ok: false, status: 0, finalUrl: "",
                 title: String(e.message || e).slice(0, 60) };
      }
      await sleep(2000);
    }
  }
}

/* ---------- 主流程 ---------- */
const map = collect();
if (WITH_CANDIDATES) {
  CANDIDATES.forEach(u => { if (!map.has(u)) map.set(u, [{ slug: "（候選，尚未使用）", where: "候選清單" }]); });
}
const urls = [...map.keys()].sort();
console.log(`要檢查 ${urls.length} 條外部連結${WITH_CANDIDATES ? "（含候選清單）" : ""}\n`);

const dead = [], moved = [], rows = [];
for (const u of urls) {
  const r = await probe(u);
  const users = map.get(u);
  const tag = r.ok ? (r.finalUrl ? "→轉址" : " 正常 ") : " 失效 ";
  console.log(`[${tag}] ${String(r.status).padStart(3)}  ${u}`);
  if (r.title) console.log(`             ${r.title}`);
  if (r.finalUrl) console.log(`             轉到 ${r.finalUrl}`);
  rows.push({ url: u, ...r, users });
  if (!r.ok) dead.push({ url: u, status: r.status, note: r.title, users });
  else if (r.finalUrl) moved.push({ url: u, to: r.finalUrl, users });
  await sleep(800);          // 對政府網站客氣一點，不要連續猛打
}

console.log(`\n═══ 完成：${urls.length} 條，失效 ${dead.length} 條、轉址 ${moved.length} 條 ═══`);

/* ---------- 給 CI 用的輸出 ---------- */
if (process.env.GITHUB_STEP_SUMMARY) {
  const esc = s => String(s || "").replace(/\|/g, "\\|");
  let md = `### 文章外部連結健檢\n\n共 ${urls.length} 條：正常 ${urls.length - dead.length} 條、`
         + `失效 ${dead.length} 條、轉址 ${moved.length} 條\n\n`
         + `| 狀態 | 網址 | 實際頁面標題 | 用在哪 |\n|---|---|---|---|\n`;
  for (const r of rows) {
    const who = [...new Set(r.users.map(x => x.slug))].slice(0, 2).join("、")
      + (new Set(r.users.map(x => x.slug)).size > 2 ? " 等" : "");
    md += `| ${r.ok ? (r.finalUrl ? "轉址" : "正常") : "**失效 " + r.status + "**"} `
        + `| ${esc(r.url)} | ${esc(r.title)}${r.finalUrl ? `<br>→ ${esc(r.finalUrl)}` : ""} | ${esc(who)} |\n`;
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
/* 把報告也寫成檔案提交回 repo，開發端就不必請使用者複製貼上。
   放在 .github/ 之下：GitHub Pages 不會發布以點開頭的目錄，
   所以這份報告進得了版本庫、但不會出現在網站上。 */
{
  const dir = path.join(ROOT, ".github");
  if (fs.existsSync(dir)) {
    const esc = s => String(s || "").replace(/\|/g, "\\|");
    let md = `# 文章外部連結健檢\n\n`
      + `檢查時間：${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n\n`
      + `共 ${urls.length} 條：正常 ${urls.length - dead.length} 條、失效 ${dead.length} 條、轉址 ${moved.length} 條\n\n`
      + `| 狀態 | 網址 | 實際頁面標題 | 用在哪 |\n|---|---|---|---|\n`;
    for (const r of rows) {
      const who = [...new Set(r.users.map(x => x.slug))].slice(0, 3).join("、");
      md += `| ${r.ok ? (r.finalUrl ? "轉址" : "正常") : "失效 " + r.status} `
          + `| ${esc(r.url)} | ${esc(r.title)}${r.finalUrl ? `<br>→ ${esc(r.finalUrl)}` : ""} | ${esc(who)} |\n`;
    }
    fs.writeFileSync(path.join(dir, "link-check-report.md"), md, "utf-8");
    console.log("\n[寫出] .github/link-check-report.md");
  }
}

if (process.env.GITHUB_OUTPUT) {
  let body = "";
  if (dead.length) {
    body += `## ${dead.length} 條外部連結失效\n\n`;
    for (const d of dead) {
      const who = [...new Set(d.users.map(x => `${x.slug}（${x.where}）`))].join("、");
      body += `- ${d.url}\n  狀態 ${d.status}${d.note ? `：${d.note}` : ""}\n  用在：${who}\n`;
    }
    body += `\n政府網站改版很常見，多半是搬家不是下架；`
         + `請到該機關網站找新的頁面，在後台把文章的「資料來源」換掉。\n`;
  }
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    [`dead_count=${dead.length}`, `moved_count=${moved.length}`,
     `has_dead=${dead.length ? "true" : "false"}`,
     `body<<LINK_EOF\n${body}\nLINK_EOF`].join("\n") + "\n");
}
process.exit(0);
