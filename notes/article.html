<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/png" href="../assets/logo-icon.png" />
<title>知識文章｜台灣房屋 澄果團隊</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: { extend: {
      colors: { ink:'#16191D', inkSoft:'#474D55', inkFaint:'#737A83',
        paper:'#F4F4F2', surface:'#FFFFFF', line:'#DEDCD7',
        orange:'#FD7305', orangeDeep:'#B85400', tint:'#FCEFE3' },
      fontFamily: { sans:['"Noto Sans TC"','sans-serif'], mono:['"IBM Plex Mono"','monospace'] },
      borderRadius: { DEFAULT:'3px', sm:'2px', md:'4px' },
    }}
  }
</script>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

<style>
  body { background:#F4F4F2; -webkit-font-smoothing:antialiased; }
  ::selection { background:#FD7305; color:#fff; }
  .display { font-weight:900; letter-spacing:-0.02em; line-height:1.25; }
  :focus-visible { outline:2px solid #FD7305; outline-offset:2px; }
</style>
</head>
<body class="font-sans text-ink">
<div id="root"></div>

<script type="text/babel">
const { useState, useEffect } = React;

const BRAND = {
  phone: "07-9766977",
  phoneHref: "tel:0797669977",
};

/* 依 showFrom / showUntil 判斷這個區塊今天該不該顯示 */
function isVisible(block, today) {
  if (block.showFrom && today < block.showFrom) return false;
  if (block.showUntil && today >= block.showUntil) return false;
  return true;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,"0")}.${String(dt.getDate()).padStart(2,"0")}`;
}

/* 支援在文字中用 **粗體** 標記重點 */
function RichText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i} className="font-bold text-ink">{p.slice(2, -2)}</strong>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  );
}

function Block({ block }) {
  switch (block.type) {
    case "h":
      return <h2 className="display text-[23px] mt-16 mb-6 pt-7 border-t border-line">{block.text}</h2>;

    case "p": {
      /* 貼進來的長文若含換行，自動拆成多段，避免全部擠在一起 */
      const paras = String(block.text || "").split(/\n\s*\n|\n/).map(t => t.trim()).filter(Boolean);
      return (
        <div className="mb-8">
          {paras.map((t, i) => (
            <p key={i} className="text-[17px] leading-[2.05] text-inkSoft mb-5 last:mb-0">
              <RichText text={t} />
            </p>
          ))}
        </div>
      );
    }

    case "list":
      return (
        <ul className="mb-9 space-y-4">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[17px] leading-[1.95] text-inkSoft">
              <span className="font-mono text-[13px] text-orangeDeep pt-1.5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span><RichText text={it} /></span>
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div className="mb-10 overflow-x-auto">
          <table className="w-full text-[16px] border border-line bg-surface">
            <thead>
              <tr className="border-b border-line bg-paper">
                {block.head.map((h, i) => (
                  <th key={i} className={`font-mono text-[13px] tracking-wider text-inkFaint font-normal py-3 px-4 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className={`py-3.5 px-4 leading-relaxed ${j === 0 ? "text-left text-ink" : "text-right text-inkSoft"}`}>
                      <RichText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "note":
      return (
        <div className="mb-9 bg-tint border-l-2 border-orange px-6 py-5">
          <p className="text-[16px] leading-[1.95] text-orangeDeep"><RichText text={block.text} /></p>
        </div>
      );

    case "quote":
      return (
        <blockquote className="my-14 py-7 border-y-2 border-ink">
          <p className="display text-[20px] md:text-[22px] leading-[1.6]">{block.text}</p>
        </blockquote>
      );

    case "image":
      return (
        <figure className="my-12">
          <img src={`../${block.src}`} alt={block.alt || ""} loading="lazy"
            className="w-full h-auto rounded-sm border border-line bg-surface" />
          {block.caption && (
            <figcaption className="mt-3 text-[14px] text-inkFaint leading-relaxed">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    default:
      return null;
  }
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const slug = new URLSearchParams(window.location.search).get("slug");
  const today = todayStr();

  useEffect(() => {
    fetch("../data/articles.json")
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const article = data?.articles?.find(a => a.slug === slug && !a.draft);
  const others = (data?.articles ?? []).filter(a => !a.draft && a.slug !== slug).slice(0, 3);

  useEffect(() => {
    if (article) document.title = `${article.title}｜台灣房屋 澄果團隊`;
  }, [article]);

  return (
    <div>
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-line">
        <div className="max-w-3xl mx-auto px-6 h-[68px] flex items-center justify-between">
          <a href="../index.html" className="flex items-center gap-3">
            <img src="../assets/logo-icon.png" alt="" className="w-9 h-9 object-contain" />
            <span className="leading-tight">
              <span className="block font-mono text-[11px] tracking-[0.2em] text-inkFaint">TAIWAN REALTY</span>
              <span className="block text-[17px] font-bold tracking-tight">澄果團隊</span>
            </span>
          </a>
          <a href="index.html" className="text-[15px] text-inkSoft hover:text-ink">← 所有文章</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14">
        {error && <p className="text-[16px] text-orangeDeep">文章讀取失敗，請重新整理頁面再試一次。</p>}
        {!error && !data && <p className="font-mono text-[13px] text-inkFaint">讀取中…</p>}

        {data && !article && (
          <div className="border border-line bg-surface rounded-sm p-8">
            <h1 className="display text-[24px] mb-4">找不到這篇文章</h1>
            <p className="text-[16px] text-inkSoft leading-[1.9]">
              這篇文章可能尚未發布，或連結有誤。
            </p>
            <a href="index.html"
              className="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">
              回到文章列表
            </a>
          </div>
        )}

        {article && (
          <>
            <article>
              <div className="flex items-center gap-4 font-mono text-[12px] mb-4">
                <span className="text-orangeDeep tracking-wider">{article.tag}</span>
                <span className="text-inkFaint">{fmtDate(article.date)}</span>
                {article.readMinutes && <span className="text-inkFaint">約 {article.readMinutes} 分鐘</span>}
              </div>

              <h1 className="display text-[28px] md:text-[34px]">{article.title}</h1>
              <p className="mt-5 text-[17px] text-inkSoft leading-[1.95]">{article.summary}</p>

              {article.cover && (
                <img src={`../${article.cover}`} alt={article.coverAlt || article.title} loading="eager"
                  className="w-full h-auto rounded-sm border border-line bg-surface mt-8" />
              )}

              {article.reviewBy && today >= article.reviewBy && (
                <div className="mt-7 bg-tint border-l-2 border-orange px-6 py-5">
                  <p className="text-[16px] leading-[1.95] text-orangeDeep">
                    本文最後更新於 {fmtDate(article.updated || article.date)}。
                    房市與法規變動快，部分內容可能已不是最新狀況，建議來電向我們確認。
                  </p>
                </div>
              )}

              <div className="mt-10">
                {article.blocks
                  .filter(b => isVisible(b, today))
                  .map((b, i) => <Block key={i} block={b} />)}
              </div>
            </article>

            <section className="mt-14 bg-ink text-white/75 rounded-sm p-8">
              <h2 className="display text-[20px] text-white">有問題，直接問比較快</h2>
              <p className="mt-3 text-[16px] leading-[1.9]">
                每個人的狀況都不一樣。把你的情形說給我們聽，
                澄果團隊會用實際成交資料和在地經驗回答你。
              </p>
              <a href={BRAND.phoneHref}
                className="inline-flex items-center mt-6 px-7 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">
                來電諮詢 {BRAND.phone}
              </a>
            </section>

            {others.length > 0 && (
              <section className="mt-14 pt-8 border-t border-line">
                <div className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-6">More</div>
                <div className="space-y-6">
                  {others.map(a => (
                    <a key={a.slug} href={`article.html?slug=${a.slug}`} className="flex gap-4 group items-start">
                      {a.cover && (
                        <img src={`../${a.cover}`} alt="" loading="lazy"
                          className="w-24 aspect-[3/2] object-contain bg-paper rounded-sm border border-line shrink-0" />
                      )}
                      <div>
                        <div className="font-mono text-[12px] text-orangeDeep tracking-wider mb-1">{a.tag}</div>
                        <h3 className="text-[17px] font-bold leading-snug group-hover:text-orangeDeep transition">
                          {a.title}
                        </h3>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="max-w-3xl mx-auto px-6 py-8 font-mono text-[12px] text-inkFaint flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <span>© {new Date().getFullYear()} 澄果資產有限公司</span>
          <a href="../index.html" className="hover:text-orangeDeep">回首頁</a>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>
