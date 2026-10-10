/**
 * 澄果團隊｜YouTube 自動字幕擷取
 * ------------------------------------------------
 * 用 yt-dlp 抓頻道影片的字幕（優先人工字幕，沒有才用自動字幕），
 * 轉成純文字寫進 data/video-transcripts.json。
 *
 * ⚠️ 自動字幕一定有錯字，社區名稱（京城馥之森、農十六、瑞豐）尤其容易被聽錯。
 *    所以這支程式「只抓不發布」——抓完先讓人校對，
 *    校對過的在 JSON 裡標 reviewed: true，之後重抓不會被蓋掉。
 *
 * 用法：
 *   node scripts/fetch-transcripts.js            只抓還沒有逐字稿的
 *   node scripts/fetch-transcripts.js --force    重抓全部（已校對的仍然保留）
 *   node scripts/fetch-transcripts.js --id=XXXX  只抓指定影片
 *
 * 需要 yt-dlp（workflow 裡用 pip 安裝）。本機沒有的話會明確報錯，不會寫出半成品。
 */

import { readFileSync, writeFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data/video-transcripts.json");

/* 字幕語言的偏好順序：繁中 → 中文 → 簡中（簡中會轉不了繁，但有總比沒有好，
   人工校對時一併處理）→ 英文自動翻譯當最後手段 */
const LANGS = ["zh-Hant", "zh-TW", "zh", "zh-Hans", "zh-CN"];
/* 下載時用萬用字元，避免實際語言代碼是 zh-Hant-TW、zh-orig 這類變體而漏掉。
   挑選時再依上面的偏好順序決定用哪一軌。 */
const SUB_LANGS = "zh.*,cmn.*,en.*";

/* yt-dlp 失敗時真正有用的是 stderr，不是「Command failed」。
   第一版沒印出來，導致 19 支全失敗卻查不出原因，這裡一律帶出來。 */
function errText(e) {
  const err = [e.stderr, e.stdout].map(x => (x ? x.toString() : "")).join("\n");
  const line = err.split("\n").map(x => x.trim())
    .find(x => /ERROR|WARNING|Sign in|bot|unavailable|private|not available/i.test(x));
  return (line || String(e.message).split("\n")[0]).slice(0, 180);
}

/* 這支影片到底有哪些字幕軌？診斷用，結果會寫進 JSON，
   因為我們不一定看得到 Actions 的日誌。 */
function listSubs(videoId) {
  try {
    const out = execFileSync("yt-dlp", ["--list-subs", "--no-warnings", "--skip-download",
      `https://www.youtube.com/watch?v=${videoId}`],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 90000 }).toString();
    const langs = [...out.matchAll(/^([\w-]+)\s+\S+\s+vtt/gm)].map(m => m[1]);
    const has = /Available (automatic captions|subtitles)/.test(out);
    return { langs: [...new Set(langs)], hasAny: has || langs.length > 0, raw: out.slice(0, 400) };
  } catch (e) {
    return { langs: [], hasAny: false, error: errText(e) };
  }
}

function readJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return fallback; }
}

/* ---------- VTT → 純文字 ----------
   自動字幕的 VTT 是滾動式的：下一行會把上一行整段重複一次再加幾個字。
   直接串起來會得到大量重複，所以要逐行比對、只保留新增的部分。 */
export function vttToText(vtt) {
  const lines = String(vtt).split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const l = raw
      .replace(/<[^>]*>/g, "")          // <c> <00:00:01.000> 這類標記
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim();
    if (!l) continue;
    if (/^WEBVTT|^Kind:|^Language:|^NOTE\b/.test(l)) continue;
    if (/^\d+$/.test(l)) continue;                       // 序號
    if (/-->/.test(l)) continue;                         // 時間軸
    const prev = out.length ? out[out.length - 1] : "";
    if (l === prev) continue;                            // 完全重複
    if (prev && l.startsWith(prev)) { out[out.length - 1] = l; continue; }  // 滾動式累加
    if (prev && prev.endsWith(l)) continue;              // 被上一行包住
    out.push(l);
  }
  /* 中文不需要詞間空白；英數之間的空白保留 */
  return out.join("").replace(/\s+/g, " ")
    .replace(/ (?=[一-鿿])/g, "")
    .replace(/(?<=[一-鿿]) /g, "")
    .trim();
}

/* YouTube 常擋資料中心 IP（GitHub Actions 就是），回「Sign in to confirm you're not a bot」。
   換一個 player client 通常就過得去，所以依序試幾種，哪一種成功記在診斷裡。 */
const CLIENTS = ["", "youtube:player_client=android", "youtube:player_client=ios", "youtube:player_client=tv"];

function fetchOne(videoId, tmp, note) {
  let lastErr = null;
  for (const client of CLIENTS) {
    const args = [
      "--skip-download",
      "--write-subs", "--write-auto-subs",
      "--sub-langs", SUB_LANGS,
      "--sub-format", "vtt",
      "--no-warnings",
      ...(client ? ["--extractor-args", client] : []),
      "-o", path.join(tmp, "%(id)s.%(ext)s"),
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    try {
      execFileSync("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
      if (note) note.client = client || "default";
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;

  const files = readdirSync(tmp).filter(f => f.startsWith(videoId) && f.endsWith(".vtt"));
  if (!files.length) return null;
  /* 依語言偏好挑一個 */
  const pick = LANGS.map(l => files.find(f => f.includes(`.${l}.`))).find(Boolean) || files[0];
  const lang = (pick.match(/\.([\w-]+)\.vtt$/) || [])[1] || "unknown";
  const text = vttToText(readFileSync(path.join(tmp, pick), "utf-8"));
  return text ? { lang, text } : null;
}

export function fetchTranscripts({ force = false, only = "" } = {}) {
  const videos = (readJson(path.join(ROOT, "data/videos.json"), { videos: [] }).videos || []);
  const store = readJson(OUT, { updatedAt: "", transcripts: {} });
  store.transcripts = store.transcripts || {};

  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "ignore" });
  } catch {
    console.error("[錯誤] 找不到 yt-dlp。請先安裝：pip install -U yt-dlp");
    process.exitCode = 1;
    return store;
  }

  const targets = videos.filter(v => {
    if (only) return v.videoId === only;
    const has = store.transcripts[v.videoId];
    if (has?.reviewed) return false;      // 校對過的不再動
    return force || !has;
  });
  console.log(`[逐字稿] 影片 ${videos.length} 支，這次要抓 ${targets.length} 支`);

  const diagnostics = [];
  const tmp = mkdtempSync(path.join(os.tmpdir(), "yt-subs-"));
  let okN = 0, noneN = 0;
  try {
    for (const v of targets) {
      try {
        const note = {};
        const got = fetchOne(v.videoId, tmp, note);
        if (!got) {
          noneN++;
          const probe = listSubs(v.videoId);
          diagnostics.push({ videoId: v.videoId, title: v.title.slice(0, 40),
            error: "下載成功但沒有產生 vtt", availableLangs: probe.langs, hasAnySubs: probe.hasAny });
          console.log(`  －  ${v.videoId}  沒有可用字幕　${v.title.slice(0, 28)}`);
          if (probe.langs.length) console.log(`       可用字幕軌：${probe.langs.join(", ")}`);
          continue;
        }
        store.transcripts[v.videoId] = {
          lang: got.lang,
          auto: true,
          reviewed: false,
          chars: got.text.length,
          client: note.client || "default",
          fetchedAt: new Date().toISOString().slice(0, 10),
          text: got.text,
        };
        okN++;
        console.log(`  ✓  ${v.videoId}  ${got.lang}　${got.text.length} 字　${v.title.slice(0, 28)}`);
      } catch (e) {
        noneN++;
        const why = errText(e);
        const probe = listSubs(v.videoId);
        diagnostics.push({ videoId: v.videoId, title: v.title.slice(0, 40),
          error: why, availableLangs: probe.langs, hasAnySubs: probe.hasAny,
          probeError: probe.error || undefined });
        console.log(`  ✗  ${v.videoId}  ${why}`);
        if (probe.langs.length) console.log(`       可用字幕軌：${probe.langs.join(", ")}`);
        else console.log(`       這支影片沒有任何字幕軌${probe.error ? "（查詢也失敗：" + probe.error + "）" : ""}`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  store.updatedAt = new Date().toISOString();
  /* 診斷寫進檔案：Actions 的日誌不一定看得到，但這個檔案會進 repo。 */
  store.diagnostics = diagnostics;
  store.ytdlpVersion = (() => {
    try { return execFileSync("yt-dlp", ["--version"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
    catch { return ""; }
  })();
  store.note = "自動字幕未經校對，reviewed 為 true 的才是人工確認過的版本；只有 reviewed 的會被用在網站上。";
  writeFileSync(OUT, JSON.stringify(store, null, 2) + "\n", "utf-8");
  const reviewed = Object.values(store.transcripts).filter(t => t.reviewed).length;
  console.log(`[逐字稿] 成功 ${okN}、無字幕或失敗 ${noneN}；目前共 ${Object.keys(store.transcripts).length} 份，其中已校對 ${reviewed} 份`);
  return store;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes("--force");
  const only = (process.argv.find(a => a.startsWith("--id=")) || "").slice(5);
  fetchTranscripts({ force, only });
}
