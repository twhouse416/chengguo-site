/** 澄果團隊｜Tailwind 設定
 *  ------------------------------------------------
 *  原本用的是 cdn.tailwindcss.com（開發用版本）：載入約 120KB 的 JS，
 *  在使用者的瀏覽器裡即時編譯 CSS，編譯完才上妝。Tailwind 官方明講
 *  不要用在正式網站——首屏會慢，而且會先閃出沒有樣式的畫面。
 *
 *  改成建置時就把用到的 class 編成 assets/tailwind.css。
 *  content 掃的是「產生後的 HTML」，所以順序一定是先跑 build-site.js
 *  再編 CSS（npm run build 已經串好）。
 */
module.exports = {
  content: [
    "./index.html",
    "./notes/**/*.html",
    "./communities/**/*.html",
    "./tools/**/*.html",
    "./videos/**/*.html",
    "./deals/**/*.html",
    "./admin/**/*.html",
    /* 後台的樣式是 JS 動態組出來的，掃原始碼才抓得到 */
    "./scripts/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#16191D", inkSoft: "#474D55", inkFaint: "#737A83",
        paper: "#F4F4F2", surface: "#FFFFFF", line: "#DEDCD7",
        orange: "#FD7305", orangeDeep: "#B85400", tint: "#FCEFE3",
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      borderRadius: { DEFAULT: "3px", sm: "2px", md: "4px" },
    },
  },
  plugins: [],
};
