/**
 * 澄果團隊｜文章時效檢查
 * ------------------------------------------------
 * 檢查 data/articles.json 裡有沒有超過 reviewBy 日期的文章。
 * 有的話輸出清單，由 GitHub Actions 開一個 issue 提醒。
 *
 * 這只負責「提醒」，不會自動改內容——需要判斷的內容還是要人看過。
 */

import { readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const data = JSON.parse(readFileSync(path.join(ROOT, "data/articles.json"), "utf-8"));
const today = new Date().toISOString().slice(0, 10);

const due = (data.articles || []).filter(a => a.reviewBy && a.reviewBy <= today);
const drafts = (data.articles || []).filter(a => a.draft);

let body = "";

if (due.length > 0) {
  body += "## 這些文章該回頭看了\n\n";
  body += "| 文章 | 分類 | 最後更新 | 檢視期限 |\n|---|---|---|---|\n";
  due.forEach(a => {
    body += `| ${a.title} | ${a.tag} | ${a.updated || a.date} | ${a.reviewBy} |\n`;
  });
  body += "\n檢查完之後，記得在 `data/articles.json` 裡更新該篇的 `updated` 與 `reviewBy` 日期。\n";
  body += "\n讀者端目前會看到「本文最後更新於…，部分內容可能已不是最新狀況」的提醒。\n";
}

if (drafts.length > 0) {
  body += `\n## 另外有 ${drafts.length} 篇還是草稿（未公開）\n\n`;
  drafts.forEach(a => { body += `- ${a.title}\n`; });
  body += "\n審閱完把該篇的 `draft` 改成 `false` 就會發布。\n";
}

if (body) {
  console.log(body);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `has_items=true\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `body<<EOF\n${body}\nEOF\n`);
  }
} else {
  console.log("所有文章都在有效期限內，沒有草稿待處理。");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `has_items=false\n`);
  }
}
