
const { useState, useMemo } = React;

const BRAND = {
  officialSite: "https://store.twhg.com.tw/TE80",
  phone: "07-9766977",
  phoneHref: "tel:0797669977",
};

/* 房地合一稅 2.0 稅率級距（境內居住者個人）
   upTo 是該級距的持有年數上限；超過上限就落到下一級。
   資料來源：財政部南區國稅局「輕鬆看懂房地合一稅 2.0」。 */
const BRACKETS = [
  { key: "u2",   label: "2 年以內",         rate: 45, upTo: 2 },
  { key: "2to5", label: "超過 2 年未逾 5 年",  rate: 35, upTo: 5 },
  { key: "5to10",label: "超過 5 年未逾 10 年", rate: 20, upTo: 10 },
  { key: "o10",  label: "超過 10 年",        rate: 15, upTo: Infinity },
];

/* 持有年數 → 級距。「2 年以內」含滿 2 年，所以用 <= 判斷。 */
function bracketOf(years) {
  return BRACKETS.find(b => years <= b.upTo) || BRACKETS[BRACKETS.length - 1];
}

const SELF_USE_EXEMPT = 400; // 自住免稅額（萬元）
const SELF_USE_RATE = 10;    // 自住超額部分稅率

const fmtW = n => {
  const v = Math.round(n * 100) / 100;
  /* 站內其他地方的負數都用全形減號，這裡統一 */
  return v < 0 ? "−" + Math.abs(v).toLocaleString("zh-TW") : v.toLocaleString("zh-TW");
};

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block font-mono text-[12px] tracking-wider text-inkFaint mb-2">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-inkFaint mt-1.5 leading-relaxed">{hint}</span>}
    </label>
  );
}

function NumInput({ value, onChange, suffix, step = 1, min = 0 }) {
  return (
    <div className="flex items-center border border-line rounded-sm bg-surface focus-within:border-orange">
      <input type="number" inputMode="decimal" step={step} min={min}
        className="w-full px-4 py-3 text-[17px] font-mono bg-transparent outline-none"
        value={value}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      {suffix && <span className="px-4 text-[14px] text-inkFaint shrink-0">{suffix}</span>}
    </div>
  );
}

function Row({ label, value, strong, note }) {
  return (
    <div className="flex items-baseline justify-between py-3 border-b border-line last:border-0 gap-4">
      <div>
        <span className={`text-[15px] ${strong ? "text-ink font-medium" : "text-inkSoft"}`}>{label}</span>
        {note && <span className="block text-[13px] text-inkFaint mt-0.5 leading-relaxed">{note}</span>}
      </div>
      <span className={`font-mono shrink-0 ${strong ? "text-[19px] font-semibold" : "text-[17px]"}`}>{value}</span>
    </div>
  );
}

function Calculator() {

  const [sell, setSell] = useState(1500);
  const [buy, setBuy] = useState(1000);
  const [fee, setFee] = useState(50);
  const [landGain, setLandGain] = useState(30);
  const [years, setYears] = useState(3);

  const [selfUse, setSelfUse] = useState(false);
  const [repurchase, setRepurchase] = useState(false);
  const [newPrice, setNewPrice] = useState(1200);

  const yrs = Number(years) >= 0 ? Number(years) : 0;
  const bracket = bracketOf(yrs);
  const holding = bracket.key;

  const r = useMemo(() => {
    const income = sell - buy - fee - landGain;   // 課稅所得
    if (income <= 0) {
      return { income, taxable: 0, rate: 0, tax: 0, refund: 0, final: 0, loss: true };
    }
    let taxable, rate, tax;
    if (selfUse) {
      taxable = Math.max(0, income - SELF_USE_EXEMPT);
      rate = SELF_USE_RATE;
      tax = taxable * rate / 100;
    } else {
      taxable = income;
      rate = bracket.rate;
      tax = taxable * rate / 100;
    }
    const ratio = repurchase && sell > 0 ? Math.min(1, newPrice / sell) : 0;
    const refund = tax * ratio;
    return { income, taxable, rate, tax, refund, ratio, final: tax - refund, loss: false };
  }, [sell, buy, fee, landGain, selfUse, repurchase, newPrice, bracket]);
  /* 下一個級距還差幾個月、少繳多少。用來提醒級距邊界。 */
  const next = useMemo(() => {
    if (selfUse || bracket.upTo === Infinity) return null;
    const i = BRACKETS.indexOf(bracket);
    const nb = BRACKETS[i + 1];
    const gapYears = bracket.upTo - yrs;
    if (gapYears < 0 || gapYears > 1.5) return null;   // 離邊界太遠就不提醒
    /* 級距是「超過」才跨，所以剛好滿 N 年時剩的不是幾個月，而是「再過一天」。
       寫成「再持有 1 個月」會誤導，這種情況分開講。 */
    const months = gapYears <= 0 ? 0 : Math.max(1, Math.ceil(gapYears * 12));
    const saving = r.loss ? 0 : r.income * (bracket.rate - nb.rate) / 100;
    return { months, at: bracket.upTo, rate: nb.rate, saving };
  }, [selfUse, bracket, yrs, r]);

  return (
    <>
<div className="mt-10 grid lg:grid-cols-5 gap-8">
          {/* 輸入 */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface border border-line rounded-sm p-7 space-y-6">
              <div className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase">基本資料</div>

              <Field label="賣出成交總價">
                <NumInput value={sell} onChange={setSell} suffix="萬" step={10} />
              </Field>

              <Field label="當初取得成本" hint="買入總價，含契稅、代書費等取得時支出">
                <NumInput value={buy} onChange={setBuy} suffix="萬" step={10} />
              </Field>

              <Field label="必要費用" hint="仲介費、廣告費、清潔搬運費、印花稅、代書費、規費等，須有憑證">
                <NumInput value={fee} onChange={setFee} suffix="萬" step={1} />
              </Field>

              <Field label="土地漲價總數額" hint="土地增值稅單上的金額，可自所得中減除">
                <NumInput value={landGain} onChange={setLandGain} suffix="萬" step={1} />
              </Field>

              <Field label="持有年數" hint="從取得日到出售日，可填小數（例如 2.5 年）。繼承或受贈取得可併計前手持有期間。">
                <NumInput value={years} onChange={setYears} suffix="年" step={0.5} />
              </Field>

              <div className="bg-paper border border-line rounded-sm px-4 py-3">
                <span className="font-mono text-[12px] text-inkFaint">持有 {fmtW(yrs)} 年　落在</span>
                <span className="block text-[15px] mt-1">
                  {bracket.label}　<strong className="font-semibold text-orangeDeep">稅率 {bracket.rate}%</strong>
                </span>
                {next && (
                  <span className="block text-[13px] text-inkSoft mt-2 leading-relaxed">
                    {next.months === 0
                      ? <>級距是「超過」才跨，<strong className="font-semibold text-ink">只要持有超過 {fmtW(next.at)} 年</strong>就降到 {next.rate}%</>
                      : <>再持有 <strong className="font-semibold text-ink">{next.months} 個月</strong>（超過 {fmtW(next.at)} 年）就降到 {next.rate}%</>}
                    {next.saving > 0 && <>，以目前的課稅所得估算，稅額少 <strong className="font-semibold text-orangeDeep">{fmtW(next.saving)} 萬</strong></>}。
                  </span>
                )}
              </div>
            </div>

            <div className="bg-surface border border-line rounded-sm p-7 space-y-5">
              <div className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase">優惠適用</div>

              <label className="flex gap-3 items-start cursor-pointer">
                <input type="checkbox" checked={selfUse} onChange={e => setSelfUse(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="block text-[15px] leading-snug">符合自住房地優惠
                    {selfUse && yrs < 6 &&
                      <span className="font-mono text-[12px] text-fail ml-2">持有年數未滿 6 年</span>}
                  </span>
                  <span className="block text-[13px] text-inkFaint mt-1 leading-relaxed">
                    本人、配偶或未成年子女設籍、持有並居住連續滿 6 年，期間無出租或營業使用，
                    且前 6 年內未曾使用過此優惠。
                  </span>
                </span>
              </label>

              <label className="flex gap-3 items-start cursor-pointer">
                <input type="checkbox" checked={repurchase} onChange={e => setRepurchase(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="block text-[15px] leading-snug">申請重購退稅</span>
                  <span className="block text-[13px] text-inkFaint mt-1 leading-relaxed">
                    先買後賣或先賣後買皆可，兩案移轉登記間隔須在 2 年內，新舊屋都須符合自住規定。
                  </span>
                </span>
              </label>

              {repurchase && (
                <Field label="重購房屋總價" hint="新屋價格大於等於舊屋售價可全額退稅，否則按比例退還">
                  <NumInput value={newPrice} onChange={setNewPrice} suffix="萬" step={10} />
                </Field>
              )}
            </div>
          </div>

          {/* 結果 */}
          <div className="lg:col-span-3 space-y-6">
            {r.loss ? (
              <div className="bg-surface border border-line rounded-sm p-7">
                <div className="display text-[22px] mb-3">本次交易無應納稅額</div>
                <p className="text-[15px] text-inkSoft leading-[1.9]">
                  課稅所得為 {fmtW(r.income)} 萬元，未產生所得，因此不需繳納房地合一稅。
                </p>
                <p className="text-[15px] text-orangeDeep leading-[1.9] mt-4 pt-4 border-t border-line">
                  即使賠錢賣，仍須在所有權移轉登記日次日起 30 日內完成申報。
                  未申報會被處 3,000 元至 3 萬元罰鍰。
                </p>
              </div>
            ) : (
              <>
                <div className="bg-surface border border-line rounded-sm p-7">
                  <div className="font-mono text-[12px] tracking-wider text-inkFaint mb-1">
                    {r.refund > 0 ? "重購退稅後實際負擔" : "應納稅額"}
                  </div>
                  <div className="font-mono text-[40px] font-semibold text-orangeDeep leading-none">
                    {fmtW(r.final)}
                    <span className="text-[15px] font-normal text-inkSoft ml-2">萬元</span>
                  </div>
                  <div className="font-mono text-[13px] text-inkSoft mt-2">
                    適用稅率 {r.rate}%
                    {selfUse && "・自住優惠"}
                  </div>
                </div>

                <div className="bg-surface border border-line rounded-sm p-7">
                  <div className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-4">計算過程</div>
                  <Row label="賣出成交總價" value={`${fmtW(sell)} 萬`} />
                  <Row label="減：取得成本" value={`− ${fmtW(buy)} 萬`} />
                  <Row label="減：必要費用" value={`− ${fmtW(fee)} 萬`} />
                  <Row label="減：土地漲價總數額" value={`− ${fmtW(landGain)} 萬`} />
                  <Row label="課稅所得" value={`${fmtW(r.income)} 萬`} strong />

                  {selfUse && (
                    <Row label="減：自住免稅額" value={`− ${fmtW(Math.min(r.income, SELF_USE_EXEMPT))} 萬`}
                      note="自住房地優惠，課稅所得 400 萬元以下免稅" />
                  )}

                  <Row label="課稅基礎" value={`${fmtW(r.taxable)} 萬`} />
                  <Row label={`乘：適用稅率 ${r.rate}%`} value={`${fmtW(r.tax)} 萬`} strong
                    note={selfUse ? "超過免稅額部分適用 10% 優惠稅率" : `持有${bracket.label}`} />

                  {r.refund > 0 && (
                    <>
                      <Row label="減：重購退稅"
                        value={`− ${fmtW(r.refund)} 萬`}
                        note={`退還比例 ${(r.ratio * 100).toFixed(1)}%（重購 ${fmtW(newPrice)} 萬 ÷ 出售 ${fmtW(sell)} 萬）`} />
                      <Row label="實際負擔" value={`${fmtW(r.final)} 萬`} strong />
                    </>
                  )}
                </div>

                {/* 情境比較：四種稅率一次並列，自住優惠也放進來比 */}
                {(
                  <div className="bg-surface border border-line rounded-sm p-7">
                    <div className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-1">
                      不同持有期間比較
                    </div>
                    <p className="text-[14px] text-inkSoft leading-[1.8] mb-5">
                      同樣的課稅所得 {fmtW(r.income)} 萬元，四個級距的稅額差距如下。
                      目前的持有年數落在<strong className="font-medium text-ink">{bracket.label}</strong>。
                    </p>
                    <table className="w-full text-[15px]">
                      <thead>
                        <tr className="font-mono text-[12px] tracking-wider text-inkFaint border-b border-line">
                          <th className="text-left pb-2 font-normal">持有期間</th>
                          <th className="text-right pb-2 font-normal">稅率</th>
                          <th className="text-right pb-2 font-normal">應納稅額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {BRACKETS.map(b => (
                          <tr key={b.key}
                            className={`border-b border-line last:border-0 ${!selfUse && b.key === holding ? "bg-tint" : ""}`}>
                            <td className="py-3">
                              {b.label}
                              {!selfUse && b.key === holding &&
                                <span className="font-mono text-[12px] text-orangeDeep ml-2">← 你的情況</span>}
                            </td>
                            <td className="py-3 text-right font-mono text-inkSoft">{b.rate}%</td>
                            <td className="py-3 text-right font-mono">{fmtW(r.income * b.rate / 100)} 萬</td>
                          </tr>
                        ))}
                        <tr className={`border-t-2 border-ink ${selfUse ? "bg-tint" : ""}`}>
                          <td className="py-3">
                            符合自住優惠（滿 6 年）
                            {selfUse && <span className="font-mono text-[12px] text-orangeDeep ml-2">← 你的情況</span>}
                          </td>
                          <td className="py-3 text-right font-mono text-inkSoft">10%</td>
                          <td className="py-3 text-right font-mono text-pass">
                            {fmtW(Math.max(0, r.income - SELF_USE_EXEMPT) * SELF_USE_RATE / 100)} 萬
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="bg-paper border border-line rounded-sm p-7">
                  <div className="display text-[19px] mb-2">賣價填多少才接近行情？</div>
                  <p className="text-[15px] text-inkSoft leading-[1.9]">
                    試算的結果完全取決於你填的賣出價。與其猜，不如直接看同社區最近實際成交多少——
                    本站收錄高雄四大生活圈的社區逐筆成交紀錄，日期、坪數、樓層、格局、車位都列出來。
                  </p>
                  <p className="mt-5 font-mono text-[13px] leading-[2.2]">
                    <a href="../../communities/" className="text-orangeDeep hover:underline mr-4">社區成交行情總覽 →</a>
                    <a href="../../areas/art-museum/" className="text-orangeDeep hover:underline mr-4">美術館特區 →</a>
                    <a href="../../areas/nong16/" className="text-orangeDeep hover:underline mr-4">農十六特區 →</a>
                    <a href="../../areas/ruifeng-arena/" className="text-orangeDeep hover:underline mr-4">瑞豐・巨蛋 →</a>
                    <a href="../../areas/zhongdu/" className="text-orangeDeep hover:underline">中都重劃區 →</a>
                  </p>
                </div>

                {repurchase && (
                  <div className="bg-surface border border-orange/30 rounded-sm p-7">
                    <div className="text-[15px] font-medium mb-2">重購退稅的閉鎖期</div>
                    <p className="text-[15px] text-inkSoft leading-[1.9]">
                      申請重購退稅後，新屋在 5 年內不得改作出租、營業等其他用途，也不得再移轉。
                      違反時國稅局會追繳已退還的稅款。換屋前請把這 5 年一起考慮進去。
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("calc")).render(<Calculator />);
