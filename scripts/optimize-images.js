/**
 * 澄果團隊｜圖片最佳化
 * ------------------------------------------------
 * 做三件事：
 *   1. 把 assets 底下的照片縮到最大寬度 900px、重新壓縮
 *      （全站顯示最寬的位置約 560px，900px 已涵蓋高解析螢幕）
 *   2. 為文章與賀成交的封面另外產一張 640×427 的 -thumb.jpg
 *      首頁與列表頁只顯示小方塊，載入原圖是浪費
 *   3. 產生 data/image-sizes.json，建置時把 width/height 寫進 <img>，
 *      瀏覽器就能在圖片載入前先留好空間，版面不會往下跳
 *
 * 用法：
 *   node scripts/optimize-images.js          只產生尺寸表（不改圖）
 *   node scripts/optimize-images.js --write  實際壓縮並覆寫原圖
 *
 * 需要 sharp：npm i sharp
 * 沒安裝時只會產生尺寸表，不會中斷建置。
 *
 * 新增圖片之後跑一次 --write，再把 assets 與 data/image-sizes.json 一起提交。
 * 已經處理過的圖片再跑一次不會變差——縮圖是從原圖重新產生，
 * 但原圖若已縮到 900px 就不會再縮一次。
 */

import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");

const MAX_W = 900;
const THUMB_W = 640, THUMB_H = 427;   // 3:2，與版面的 aspect-[3/2] 一致
const QUALITY = 76;
const THUMB_DIRS = ["assets/articles", "assets/deals"];   // 這兩處的圖會出現在列表

const WRITE = process.argv.includes("--write");

let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.log("[提示] 找不到 sharp，這次只重新產生尺寸表，不壓縮圖片。");
  console.log("       要壓縮請先執行：npm i sharp");
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = p => path.relative(ROOT, p).split(path.sep).join("/");
const isPhoto = p => /\.(jpe?g|png)$/i.test(p);
const isThumb = p => /-thumb\.jpg$/i.test(p);

const sizes = {};
let saved = 0, made = 0;

for (const file of walk(ASSETS)) {
  if (!isPhoto(file)) continue;
  const key = rel(file);

  if (!sharp) {
    continue;   // 沒有 sharp 就無法讀尺寸，尺寸表維持原樣
  }

  const before = statSync(file).size;
  const img = sharp(file, { failOn: "none" }).rotate();   // rotate() 會套用 EXIF 方向
  const meta = await img.metadata();

  if (WRITE && !isThumb(file)) {
    const pipeline = sharp(file, { failOn: "none" }).rotate();
    if (meta.width > MAX_W) pipeline.resize({ width: MAX_W });
    const buf = /\.png$/i.test(file)
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ quality: QUALITY, progressive: true, mozjpeg: true }).toBuffer();
    /* 只有真的變小才覆寫，避免重複執行反而把檔案愈壓愈糊 */
    if (buf.length < before) {
      writeFileSync(file, buf);
      saved += before - buf.length;
    }
  }

  const final = await sharp(file, { failOn: "none" }).metadata();
  sizes[key] = [final.width, final.height];

  /* 列表縮圖 */
  const inThumbDir = THUMB_DIRS.some(d => key.startsWith(d + "/"));
  if (WRITE && inThumbDir && !isThumb(file)) {
    const tp = file.replace(/\.(jpe?g|png)$/i, "-thumb.jpg");
    await sharp(file, { failOn: "none" }).rotate()
      .resize({ width: THUMB_W, height: THUMB_H, fit: "cover", position: "attention" })
      .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
      .toFile(tp);
    sizes[rel(tp)] = [THUMB_W, THUMB_H];
    made++;
  }
}

if (Object.keys(sizes).length) {
  writeFileSync(
    path.join(ROOT, "data/image-sizes.json"),
    JSON.stringify(sizes, null, 1) + "\n", "utf-8"
  );
  console.log(`[完成] 尺寸表 ${Object.keys(sizes).length} 筆已寫入 data/image-sizes.json`);
} else {
  console.log("[略過] 沒有可處理的圖片，尺寸表維持原樣");
}
if (WRITE) {
  console.log(`[完成] 壓縮省下 ${(saved / 1024 / 1024).toFixed(2)} MB，另產生 ${made} 張列表縮圖`);
}
