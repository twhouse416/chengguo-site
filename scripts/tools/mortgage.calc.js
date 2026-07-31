
const { useState, useMemo } = React;

const BRAND = {
  officialSite: "https://store.twhg.com.tw/TE80",
  phone: "07-9766977",
  phoneHref: "tel:0797669977",
};

const fmtWan = n => (Math.round(n * 10) / 10).toLocaleString("zh-TW");
const fmtMoney = n => Math.round(n).toLocaleString("zh-TW");

/* 本息平均攤還，支援寬限期（寬限期內只繳息） */
function calc({ price, ratio, years, rate, graceYears }) {
  const loanWan = price * (ratio / 100);          // 貸款金額（萬）
  const P = loanWan * 10000;                       // 元
  const i = rate / 100 / 12;                       // 月利率
  const n = years * 12;                            // 總期數
  const g = Math.min(graceYears * 12, n - 1);      // 寬限期數

  const gracePayment = P * i;                      // 寬限期月付（只繳息）
  const m = n - g;                                 // 攤還期數
  const payment = i === 0 ? P / m : (P * i) / (1 - Math.pow(1 + i, -m));

  const totalPaid = gracePayment * g + payment * m;
  const totalInterest = totalPaid - P;

  return {
    loanWan,
    downWan: price - loanWan,
    P,
    gracePayment,
    payment,
    graceMonths: g,
    totalPaid,
    totalInterest,
  };
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block font-mono text-[12px] tracking-wider text-inkFaint mb-2">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-inkFaint mt-1.5">{hint}</span>}
    </label>
  );
}

function NumInput({ value, onChange, suffix, step = 1, min = 0 }) {
  return (
    <div className="flex items-center border border-line rounded-sm bg-surface focus-within:border-orange">
      <input
        type="number" inputMode="decimal" step={step} min={min}
        className="w-full px-4 py-3 text-[17px] font-mono bg-transparent outline-none"
        value={value}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      {suffix && <span className="px-4 text-[14px] text-inkFaint shrink-0">{suffix}</span>}
    </div>
  );
}

function Calculator() {

  const [price, setPrice] = useState(1200);
  const [ratio, setRatio] = useState(80);
  const [years, setYears] = useState(30);
  const [rate, setRate] = useState(2.3);
  const [graceYears, setGraceYears] = useState(0);
  const [income, setIncome] = useState("");

  const ok = price > 0 && years > 0 && rate >= 0;
  const r = useMemo(() => ok ? calc({ price, ratio, years, rate, graceYears }) : null, [price, ratio, years, rate, graceYears, ok]);

  const burden = r && income > 0 ? (r.payment / (income * 10000)) * 100 : null;
  return (
    <>
<div className="mt-8 grid lg:grid-cols-5 gap-8">
          {/* 輸入 */}
          <div className="lg:col-span-2 bg-surface border border-line rounded-sm p-7 space-y-6 h-fit">
            <Field label="房屋總價" hint="以萬元為單位">
              <NumInput value={price} onChange={setPrice} suffix="萬" step={10} />
            </Field>

            <Field label={`貸款成數　${ratio}%`} hint={r ? `貸款 ${fmtWan(r.loanWan)} 萬・自備 ${fmtWan(r.downWan)} 萬` : null}>
              <input type="range" min="10" max="90" step="1" value={ratio}
                onChange={e => setRatio(Number(e.target.value))} className="w-full mt-1" />
            </Field>

            <Field label="貸款年限">
              <NumInput value={years} onChange={setYears} suffix="年" min={1} />
            </Field>

            <Field label="年利率" hint="預設 2.3% 僅供試算，實際以銀行核貸為準">
              <NumInput value={rate} onChange={setRate} suffix="%" step={0.01} />
            </Field>

            <Field label="寬限期" hint="寬限期內只繳利息，不還本金">
              <NumInput value={graceYears} onChange={setGraceYears} suffix="年" min={0} />
            </Field>

            <Field label="家庭月收入（選填）" hint="填了才會顯示負擔比">
              <NumInput value={income} onChange={setIncome} suffix="萬" step={0.5} />
            </Field>
          </div>

          {/* 結果 */}
          <div className="lg:col-span-3 space-y-6">
            {!ok && (
              <div className="bg-surface border border-line rounded-sm p-7 text-[16px] text-inkSoft">
                請填入總價、年限與利率。
              </div>
            )}

            {ok && r && (
              <>
                <div className="bg-surface border border-line rounded-sm p-7">
                  {r.graceMonths > 0 && (
                    <div className="mb-6 pb-6 border-b border-line">
                      <div className="font-mono text-[12px] tracking-wider text-inkFaint mb-1">
                        寬限期月付（前 {graceYears} 年，只繳息）
                      </div>
                      <div className="font-mono text-[32px] font-semibold leading-none">
                        {fmtMoney(r.gracePayment)}
                        <span className="text-[14px] font-normal text-inkSoft ml-2">元 / 月</span>
                      </div>
                    </div>
                  )}

                  <div className="font-mono text-[12px] tracking-wider text-inkFaint mb-1">
                    {r.graceMonths > 0 ? `寬限期後月付（第 ${graceYears + 1} 年起）` : "每月應繳"}
                  </div>
                  <div className="font-mono text-[40px] font-semibold text-orangeDeep leading-none">
                    {fmtMoney(r.payment)}
                    <span className="text-[15px] font-normal text-inkSoft ml-2">元 / 月</span>
                  </div>

                  {burden !== null && (
                    <div className="mt-6 pt-6 border-t border-line">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="font-mono text-[12px] tracking-wider text-inkFaint">佔家庭月收入</span>
                        <span className="font-mono text-[20px] font-semibold">{burden.toFixed(1)}%</span>
                      </div>
                      <div className="h-[6px] bg-line rounded-sm overflow-hidden">
                        <div className="h-full bg-orange"
                          style={{ width: `${Math.min(burden, 100)}%` }} />
                      </div>
                      <p className="text-[14px] text-inkSoft leading-[1.8] mt-3">
                        {burden <= 30
                          ? "負擔比偏低，除了月付之外還有餘裕應付裝潢、稅費與突發支出。"
                          : burden <= 40
                          ? "負擔比落在常見範圍。記得把管理費、房屋稅、地價稅與修繕費一起算進生活開支。"
                          : "負擔比偏高，建議重新檢視總價或成數，並預留至少半年生活準備金再進場。"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-surface border border-line rounded-sm p-7">
                  <div className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-5">Summary</div>
                  <dl className="divide-y divide-line">
                    {[
                      ["貸款金額", `${fmtWan(r.loanWan)} 萬元`],
                      ["自備款", `${fmtWan(r.downWan)} 萬元`],
                      ["利息總額", `${fmtMoney(r.totalInterest)} 元`],
                      ["本息合計", `${fmtMoney(r.totalPaid)} 元`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between py-3">
                        <dt className="text-[15px] text-inkSoft">{k}</dt>
                        <dd className="font-mono text-[17px]">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-6">
                    <div className="font-mono text-[12px] tracking-wider text-inkFaint mb-2">本金與利息比例</div>
                    <div className="flex h-[10px] rounded-sm overflow-hidden">
                      <div className="bg-ink" style={{ width: `${(r.P / r.totalPaid) * 100}%` }} />
                      <div className="bg-orange" style={{ width: `${(r.totalInterest / r.totalPaid) * 100}%` }} />
                    </div>
                    <div className="flex justify-between font-mono text-[12px] text-inkSoft mt-2">
                      <span>本金 {((r.P / r.totalPaid) * 100).toFixed(0)}%</span>
                      <span className="text-orangeDeep">利息 {((r.totalInterest / r.totalPaid) * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {r.graceMonths > 0 && (
                    <p className="text-[14px] text-inkSoft leading-[1.85] mt-6 pt-6 border-t border-line">
                      寬限期讓前期壓力變小，但本金沒有減少，寬限期結束後月付會跳升，
                      而且整段期間付出的利息會比不用寬限期更多。用之前先確認寬限期滿後的月付負擔得起。
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("calc")).render(<Calculator />);
