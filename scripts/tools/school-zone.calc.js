
const { useState, useEffect, useMemo } = React;

const BRAND = {
  officialSite: "https://store.twhg.com.tw/TE80",
  phone: "07-9766977",
  phoneHref: "tel:0797669977",
};

/* 從官方學區原文抽出里名：里名前必須是分隔符或字串開頭 */
function extractVillages(zone) {
  const out = [];
  const re = /(^|[^\u4e00-\u9fff])([\u4e00-\u9fff]{2,3}里)/g;
  let m;
  while ((m = re.exec(zone)) !== null) {
    if (!out.includes(m[2])) out.push(m[2]);
  }
  return out;
}

/* 把符合的里名在原文中標起來 */
function Highlight({ text, term }) {
  if (!term) return <>{text}</>;
  const parts = text.split(term);
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && <mark>{term}</mark>}
        </React.Fragment>
      ))}
    </>
  );
}

function Calculator() {

  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [district, setDistrict] = useState("");
  const [village, setVillage] = useState("");

  useEffect(() => {
    fetch(`../../data/school-zones.json?t=${Date.now()}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const districts = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.entries.map(e => e.zoneDistrict))];
  }, [data]);

  const villages = useMemo(() => {
    if (!data || !district) return [];
    const set = new Set();
    data.entries
      .filter(e => e.zoneDistrict === district)
      .forEach(e => extractVillages(e.zone).forEach(v => set.add(v)));
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [data, district]);

  const results = useMemo(() => {
    if (!data || !district || !village) return [];
    return data.entries.filter(
      e => e.zoneDistrict === district && e.zone.includes(village)
    );
  }, [data, district, village]);
  return (
    <>
{/* 查詢區 */}
        <div className="mt-8 bg-surface border border-line rounded-sm p-7">
          <div className="grid sm:grid-cols-2 gap-6">
            <label className="block">
              <span className="block font-mono text-[12px] tracking-wider text-inkFaint mb-2">行政區</span>
              <select
                className="w-full border border-line rounded-sm px-4 py-3 text-[16px] bg-surface"
                value={district}
                onChange={e => { setDistrict(e.target.value); setVillage(""); }}>
                <option value="">請選擇</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block font-mono text-[12px] tracking-wider text-inkFaint mb-2">
                里別{district && `（${villages.length} 個）`}
              </span>
              <select
                className="w-full border border-line rounded-sm px-4 py-3 text-[16px] bg-surface disabled:bg-paper disabled:text-inkFaint"
                value={village}
                disabled={!district}
                onChange={e => setVillage(e.target.value)}>
                <option value="">{district ? "請選擇" : "請先選行政區"}</option>
                {villages.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>

          {error && (
            <p className="mt-6 text-[15px] text-orangeDeep">學區資料讀取失敗，請重新整理頁面再試一次。</p>
          )}
          {!error && !data && (
            <p className="mt-6 font-mono text-[13px] text-inkFaint">讀取學區資料中…</p>
          )}
        </div>

        {/* 結果 */}
        {village && (
          <section className="mt-10">
            <h2 className="display text-[20px] mb-1">
              {district}{village}　對應學區
            </h2>
            <p className="text-[15px] text-inkSoft mb-6">
              共 {results.length} 筆。請對照原文確認你的「鄰」別是否落在範圍內。
            </p>

            <div className="space-y-4">
              {results.map((r, i) => (
                <article key={i} className="bg-surface border border-line rounded-sm p-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                    <h3 className="text-[19px] font-bold tracking-tight">{r.school}</h3>
                    {r.schoolDistrict !== district && (
                      <span className="font-mono text-[12px] text-orangeDeep border border-orange/40 rounded-sm px-2 py-0.5">
                        校址位於 {r.schoolDistrict}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[12px] tracking-wider text-inkFaint mb-2">官方學區原文</div>
                  <p className="text-[15px] leading-[1.95] text-inkSoft">
                    <Highlight text={r.zone} term={village} />
                  </p>
                </article>
              ))}
            </div>

            {results.length > 1 && (
              <p className="mt-5 text-[15px] text-inkSoft leading-[1.9]">
                查到多筆，通常代表這個里被切分成不同鄰、分屬不同學校，或屬於「自由學區」可自行選擇。
                請依原文的鄰別範圍判斷，不確定時建議直接向學校或區公所確認。
              </p>
            )}
          </section>
        )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("calc")).render(<Calculator />);
