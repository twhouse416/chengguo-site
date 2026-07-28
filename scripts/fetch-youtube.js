/**
 * 澄果團隊｜YouTube 頻道影片自動同步
 * ------------------------------------------------
 * 讀取頻道的公開 RSS（YouTube 官方提供，不需要 API 金鑰），
 * 取得最新影片清單，與 data/videos.json 裡的 overrides 合併後寫回。
 *
 * overrides 是你在後台做的調整（改標題、分類、隱藏、指定首頁影片），
 * 每次自動更新都會保留，不會被 YouTube 上的原始資料蓋掉。
 *
 * 注意：YouTube RSS 只提供最新 15 支影片。更早的影片一旦抓過就會留在
 * videos.json 裡，不會因為滑出 RSS 範圍而消失。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data/videos.json");

const data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
const channelId = data.channelId;

if (!channelId) {
  console.error("[失敗] data/videos.json 裡沒有設定 channelId");
  process.exit(1);
}

const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

/* ---------- 從 XML 取出標籤內容 ---------- */
function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}
function pickAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`));
  return m ? m[1] : "";
}
function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

async function main() {
  console.log("[讀取]", RSS_URL);
  const res = await fetch(RSS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; chengguo-site-bot/1.0)" },
  });
  if (!res.ok) throw new Error(`RSS 讀取失敗（HTTP ${res.status}）`);
  const xml = await res.text();

  const entries = xml.split("<entry>").slice(1);
  console.log(`[解析] RSS 中有 ${entries.length} 支影片`);

  const fetched = entries.map(e => {
    const videoId = unescapeXml(pick(e, "yt:videoId"));
    const desc = unescapeXml(pick(e, "media:description"));
    return {
      videoId,
      title: unescapeXml(pick(e, "title")),
      desc: desc.split("\n")[0].slice(0, 160),   // 取第一行當摘要
      published: unescapeXml(pick(e, "published")).slice(0, 10),
      thumb: pickAttr(e, "media:thumbnail", "url")
        || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }).filter(v => v.videoId);

  /* 與既有清單合併：保留已抓過但已滑出 RSS 範圍的舊影片 */
  const known = new Map((data.videos || []).map(v => [v.videoId, v]));
  fetched.forEach(v => {
    const prev = known.get(v.videoId) || {};
    known.set(v.videoId, { ...prev, ...v });   // YouTube 上的原始資料以最新為準
  });

  /* 套用後台的覆寫設定 */
  const overrides = data.overrides || {};
  const merged = [...known.values()].map(v => {
    const o = overrides[v.videoId] || {};
    return {
      ...v,
      titleShown: o.title || v.title,
      descShown: o.desc || v.desc,
      category: o.category || "",
      hidden: !!o.hidden,
      order: typeof o.order === "number" ? o.order : null,
    };
  });

  /* 排序：有指定順序的優先，其餘依發布日新到舊 */
  merged.sort((a, b) => {
    if (a.order !== null && b.order !== null) return a.order - b.order;
    if (a.order !== null) return -1;
    if (b.order !== null) return 1;
    return (b.published || "").localeCompare(a.published || "");
  });

  data.videos = merged;
  data.updatedAt = new Date().toISOString();

  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");

  const visible = merged.filter(v => !v.hidden).length;
  console.log(`[完成] 共 ${merged.length} 支影片，其中 ${visible} 支公開顯示`);
}

main().catch(err => {
  console.error("[失敗]", err.message);
  process.exit(1);
});
