/**
 * 澄果團隊｜「店面」標籤的判定
 * ------------------------------------------------
 * 大樓一樓的店面在實價登錄的「建物型態」欄位一樣寫住宅大樓，
 * 只有「主要用途」看得出來，所以原本是看到主要用途含商業／店鋪／店面就標店面。
 *
 * 但這樣會誤標：二樓以上的戶別也有不少把主要用途登記成「商業用」，
 * 實際上是住家或事務所，不是店面。被誤標的後果不只是多一個標籤——
 * 社區頁的「住家單價範圍」會把店面排除在外，等於把正常的住家成交從行情裡拿掉。
 *
 * 所以改成：主要用途符合，**而且**移轉層次包含一樓，才算店面。
 * 移轉層次可能寫成「一層」「一層，夾層」「一層，見其他登記事項」這種複合寫法，
 * 要逐段切開比對，不能用 includes("一層")——那會把「十一層」「二十一層」也算進去。
 */

/* 移轉層次裡有沒有一樓（含騎樓） */
export function isShopFloor(floor) {
  return String(floor || "")
    .split(/[，,、;；]/)
    .map(s => s.trim())
    .some(s => s === "一層" || s === "騎樓");
}

/* 一筆實價登錄紀錄的 use 欄位值："店面" 或 "" */
export function shopUse(record) {
  const purpose = (record["主要用途"] || "").trim();
  if (!/商業|店鋪|店面/.test(purpose)) return "";
  return isShopFloor(record["移轉層次"]) ? "店面" : "";
}

/**
 * 修正既有紀錄：把二樓以上被標成店面的清掉。
 * 已經存進 data/community-deals.json 的舊資料不會自己更新，
 * 每次跑更新時順手修一次，跑過一次就全部歸位。
 */
export function fixShopTags(deals) {
  let fixed = 0;
  for (const d of deals || []) {
    if (d.use === "店面" && !isShopFloor(d.floor)) { d.use = ""; fixed++; }
  }
  return fixed;
}
