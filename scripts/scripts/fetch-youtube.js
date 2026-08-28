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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* YouTube 的 RSS 對機房 IP（GitHub Actions 就是）偶爾會回 5xx，
   不是我們的設定有問題，隔一下再要通常就過了。
   跟 fetch-market-data.js 一樣做重試，間隔逐次拉長。 */
async function fetchRss(tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      /* 加逾時：對方不回應時要主動放棄，否則整個工作會一直卡著 */
      const res = await fetch(RSS_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; chengguo-site-bot/1.0)" },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return await res.text();
      console.log(`[重試] 第 ${i} 次讀取回 HTTP ${res.status}`);
    } catch (e) {
      console.log(`[重試] 第 ${i} 次讀取出錯：${e.message}`);
    }
    if (i < tries) {
      const wait = i * 20;
      console.log(`[等待] ${wait} 秒後再試`);
      await sleep(wait * 1000);
    }
  }
  return null;
}

async function main() {
  console.log("[讀取]", RSS_URL);
  const xml = await fetchRss();

  /* 全部重試都失敗：保留現有的 videos.json，不要讓整個流程變紅。
     影片清單沿用上一次的結果，網站照常重新建置，下一輪排程再試。 */
  if (xml === null) {
    console.log("[略過] YouTube RSS 這次讀不到，沿用現有影片清單，不做更動");
    console.log("::warning::YouTube RSS 暫時無法讀取，本次略過影片同步");
    return;
  }

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
  const fetchedIds = new Set(fetched.map(v => v.videoId));
  fetched.forEach(v => {
    const prev = known.get(v.videoId) || {};
    known.set(v.videoId, { ...prev, ...v, missingSince: undefined });   // 重新出現就清掉標記
  });

  /* ---- 自動隱藏已從 YouTube 下架的影片 ----
     RSS 只提供最新 15 支，所以「不在 RSS 裡」有兩種可能：
       (a) 影片被改成不公開／私人／刪除
       (b) 影片還在，只是比較舊、滑出了 15 支的範圍
     用 RSS 中最舊那支的發布日當界線：比它新、卻不在 RSS 裡的，
     就是 (a)，自動隱藏。比它舊的屬於 (b)，保持原狀。 */
  const oldestInFeed = fetched.length
    ? fetched.map(v => v.published).sort()[0]
    : null;

  let autoHidden = 0, autoRestored = 0;
  if (oldestInFeed) {
    known.forEach((v, id) => {
      const shouldBeInFeed = v.published && v.published >= oldestInFeed;

      if (shouldBeInFeed && !fetchedIds.has(id)) {
        /* 該出現卻沒出現：研判已在 YouTube 上改為不公開或刪除 */
        if (!v.autoHidden) {
          v.autoHidden = true;
          v.missingSince = new Date().toISOString().slice(0, 10);
          autoHidden++;
          console.log(`[下架] ${(v.titleShown || v.title || id).slice(0, 40)}　已從 YouTube 移除或改為不公開，網站上自動隱藏`);
        }
      } else if (fetchedIds.has(id) && v.autoHidden) {
        /* 又出現了：可能是改回公開，取消自動隱藏 */
        delete v.autoHidden;
        delete v.missingSince;
        autoRestored++;
        console.log(`[恢復] ${(v.titleShown || v.title || id).slice(0, 40)}　已重新公開，取消自動隱藏`);
      }
    });
  }
  if (autoHidden) console.log(`[提示] 本次自動隱藏 ${autoHidden} 支影片`);
  if (autoRestored) console.log(`[提示] 本次恢復 ${autoRestored} 支影片`);

  /* 套用後台的覆寫設定 */
  const overrides = data.overrides || {};
  const merged = [...known.values()].map(v => {
    const o = overrides[v.videoId] || {};
    return {
      ...v,
      autoHidden: v.autoHidden || undefined,
      missingSince: v.missingSince || undefined,
      titleShown: o.title || v.title,
      descShown: o.desc || v.desc,
      category: o.category || "",
      /* 手動隱藏，或因為在 YouTube 上被下架而自動隱藏 */
      hidden: !!o.hidden || !!v.autoHidden,
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
