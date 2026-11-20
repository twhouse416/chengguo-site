/**
 * 澄果團隊｜法規原文擷取（一次性工具）
 * ------------------------------------------------
 * 為什麼要有這支：
 * 要寫「斡旋金／要約書」「驗屋點交」「履約保證」「買賣流程總覽」這幾篇，
 * 內容有一半是法律規定——瑕疵擔保的期間、定型化契約的應記載事項、
 * 仲介收受斡旋金前的告知義務。這些不能憑印象寫，也不能照抄網路文章，
 * 必須看法條原文。
 *
 * 開發端的沙箱連不到 .gov.tw（不在允許清單），但 GitHub Actions 連得到。
 * 所以用跟連結健檢一樣的做法：在 Actions 這邊抓，把原文寫進 .github/
 * 之下提交回 repo（GitHub Pages 不會發布以點開頭的目錄，不會出現在網站上），
 * 開發端 clone 就讀得到。
 *
 * 抓回來的只是「寫稿時的對照材料」，不會直接進網站。
 * 文章寫完之後這支和它的工作流程就可以刪掉。
 *
 * 用法： node scripts/fetch-law-sources.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const OUT = path.join(process.cwd(), ".github/source-extracts");
fs.mkdirSync(OUT, { recursive: true });

const UA = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/pdf,*/*",
  "accept-language": "zh-TW,zh;q=0.9",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function grab(url, binary = false) {
  for (let i = 1; i <= 3; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 40000);
    try {
      const res = await fetch(url, { headers: UA, redirect: "follow", signal: ac.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      clearTimeout(t);
      if (i === 3) throw e;
      await sleep(3000);
    }
  }
}

/* 全國法規資料庫的條文頁：把 HTML 轉成純文字，保留條號與分行 */
function lawText(html) {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  /* 每一條的容器是 .row，條號在 .col-no，條文在 .col-data */
  s = s.replace(/<div[^>]*class="[^"]*col-no[^"]*"[^>]*>/gi, "\n\n【條號】")
       .replace(/<div[^>]*class="[^"]*col-data[^"]*"[^>]*>/gi, "\n")
       .replace(/<br\s*\/?>/gi, "\n")
       .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
       .replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return s.split("\n").map(l => l.trim()).filter(Boolean).join("\n")
          .replace(/\n{3,}/g, "\n\n");
}

/* 從整部法規裡只取出指定條號（含該條全文到下一條為止） */
function pickArticles(text, nums) {
  const out = [];
  const lines = text.split("\n");
  let cur = null, buf = [];
  const flush = () => { if (cur !== null && nums.includes(cur)) out.push(buf.join("\n")); };
  for (const ln of lines) {
    const m = ln.match(/^【條號】\s*第\s*([\d\-之]+)\s*條/) || ln.match(/^第\s*([\d\-之]+)\s*條$/);
    if (m) { flush(); cur = m[1].replace(/\s/g, ""); buf = [`第 ${cur} 條`]; continue; }
    if (cur !== null) buf.push(ln);
  }
  flush();
  return out.join("\n\n──────────\n\n");
}

/* ---------- 要抓什麼 ---------- */
const LAWS = [
  { file: "民法-瑕疵擔保與袋地通行.md",
    url: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0000001",
    pick: ["354","355","356","357","358","359","360","361","362","363","364","365","366","787"],
    why: "驗屋點交：物之瑕疵擔保的檢查義務、通知期間、買方可主張什麼；787 是袋地通行權（謄本篇已引用）" },
  { file: "不動產經紀業管理條例.md",
    url: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0060066",
    pick: null,
    why: "斡旋金／要約書：仲介的告知義務、不動產說明書、服務報酬上限、簽約前應提供什麼" },
  { file: "不動產經紀業管理條例施行細則.md",
    url: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0060068",
    pick: null,
    why: "同上的細節規定" },
];

/* 行政院的定型化契約 PDF（已驗證可下載） */
const PDFS = [
  { file: "成屋買賣定型化契約應記載及不得記載事項.md",
    url: "https://www.ey.gov.tw/File/399F33D0683F2239?A=C",
    why: "驗屋點交與履約保證：點交程序、漏水與瑕疵的處理、價金交付方式的應記載內容" },
  { file: "不動產委託銷售契約書範本.md",
    url: "https://www.ey.gov.tw/File/B78B1054BB1E18E",
    why: "委託銷售的約定事項（既有文章已引用，這次順便留底對照）" },
];

/* 要約書範本的網址我不確定，所以不用猜的——
   改成去消保會網站把連結文字含關鍵字的連結全部列出來，
   看實際有哪些頁面，下次再精準抓。 */
const DISCOVER = [
  { name: "行政院消費者保護會", url: "https://cpc.ey.gov.tw/" },
];
const DISCOVER_KEYS = /要約|斡旋|成屋|預售|委託銷售|履約保證|不動產|房屋/;

/* ---------- 執行 ---------- */
const report = [];
const note = (s) => { console.log(s); report.push(s); };

for (const L of LAWS) {
  try {
    const html = await grab(L.url);
    let text = lawText(html);
    if (L.pick) {
      const picked = pickArticles(text, L.pick);
      text = picked || `（沒有抓到指定條號，以下為全文前 20000 字供人工確認）\n\n${text.slice(0, 20000)}`;
    }
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
    fs.writeFileSync(path.join(OUT, L.file),
      `# ${L.file.replace(/\.md$/, "")}\n\n` +
      `網址：${L.url}\n頁面標題：${title}\n抓取時間：${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n` +
      `用途：${L.why}\n\n---\n\n${text.slice(0, 120000)}\n`, "utf-8");
    note(`[法規] ${L.file}  ${text.length} 字  標題：${title}`);
  } catch (e) {
    note(`[法規] ${L.file}  失敗：${e.message}`);
  }
  await sleep(1500);
}

/* PDF 需要 poppler-utils 轉文字，工作流程會先裝好 */
let hasPdftotext = true;
try { execSync("which pdftotext", { stdio: "ignore" }); } catch { hasPdftotext = false; }

for (const P of PDFS) {
  try {
    const buf = await grab(P.url, true);
    const tmp = path.join("/tmp", "src.pdf");
    fs.writeFileSync(tmp, buf);
    let text = "";
    if (hasPdftotext) {
      text = execSync(`pdftotext -layout -enc UTF-8 ${tmp} -`, { maxBuffer: 50e6 }).toString();
    } else {
      text = "（這台機器沒有 pdftotext，無法轉文字）";
    }
    fs.writeFileSync(path.join(OUT, P.file),
      `# ${P.file.replace(/\.md$/, "")}\n\n` +
      `網址：${P.url}\n檔案大小：${(buf.length / 1024).toFixed(0)} KB\n` +
      `抓取時間：${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n用途：${P.why}\n\n---\n\n` +
      text.replace(/\n{3,}/g, "\n\n").slice(0, 120000) + "\n", "utf-8");
    note(`[PDF ] ${P.file}  ${(buf.length / 1024).toFixed(0)} KB → ${text.length} 字`);
  } catch (e) {
    note(`[PDF ] ${P.file}  失敗：${e.message}`);
  }
  await sleep(1500);
}

for (const D of DISCOVER) {
  try {
    const html = await grab(D.url);
    const links = [];
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!t || !DISCOVER_KEYS.test(t)) continue;
      const href = new URL(m[1], D.url).href;
      links.push(`- ${t}\n  ${href}`);
    }
    fs.writeFileSync(path.join(OUT, `探索-${D.name}.md`),
      `# ${D.name} 站上與不動產有關的連結\n\n` +
      `起點：${D.url}\n抓取時間：${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n` +
      `用途：要約書範本的官方網址我不確定，先把連結列出來，不用猜的\n\n---\n\n` +
      ([...new Set(links)].join("\n") || "（沒有找到符合關鍵字的連結）") + "\n", "utf-8");
    note(`[探索] ${D.name}  找到 ${new Set(links).size} 條相關連結`);
  } catch (e) {
    note(`[探索] ${D.name}  失敗：${e.message}`);
  }
}

fs.writeFileSync(path.join(OUT, "README.md"),
  `# 法規原文擷取\n\n這個資料夾是寫稿時的對照材料，不會進網站。\n` +
  `抓取時間：${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n\n` +
  report.map(r => `- ${r}`).join("\n") + "\n", "utf-8");

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### 法規原文擷取\n\n${report.map(r => `- ${r}`).join("\n")}\n`);
}
console.log("\n完成。檔案在 .github/source-extracts/");
