
const { useState, useMemo } = React;

const BRAND = {
  officialSite: "https://store.twhg.com.tw/TE80",
  phone: "07-9766977",
  phoneHref: "tel:0797669977",
};

/* 房屋總價上限（萬元），依購屋所在縣市三級制 */
const PRICE_CAPS = [
  { name: "臺北市", cap: 3500 },
  { name: "新北市", cap: 2500 },
  { name: "新竹縣", cap: 2500 },
  { name: "新竹市", cap: 2500 },
  { name: "高雄市", cap: 2000 },
  { name: "其他縣市", cap: 2000 },
];

/* 家庭狀況對應的貸款額度上限（萬元） */
const QUOTAS = [
  { key: "single", label: "一般首購", quota: 1000, note: "未符合下列婚育條件" },
  { key: "newly",  label: "新婚 2 年內", quota: 1200, note: "申請日前 2 年內結婚" },
  { key: "child",  label: "育有未成年子女", quota: 1500, note: "子女未滿 18 歲" },
];

const fmt = n => Math.round(n).toLocaleString("zh-TW");
const fmtW = n => (Math.round(n * 10) / 10).toLocaleString("zh-TW");

/* 3+3 利息補貼退場：前3年補貼2碼，滿3年後每年減半碼，第7年起回復原利率 */
function rateForYear(year, baseRate) {
  if (year <= 3) return baseRate - 0.5;
  if (year === 4) return baseRate - 0.375;
  if (year === 5) return baseRate - 0.25;
  if (year === 6) return baseRate - 0.125;
  return baseRate;
}

/* 逐月模擬：利率變動時，以當時餘額與剩餘期數重算月付 */
function simulate({ loanWan, years, graceYears, baseRate }) {
  const P = loanWan * 10000;
  const n = years * 12;
  const g = Math.min(graceYears * 12, n - 1);

  let balance = P;
  let payment = 0;
  let prevRate = null;
  let totalInterest = 0;
  const phases = [];

  for (let m = 0; m < n; m++) {
    const year = Math.floor(m / 12) + 1;
    const rate = rateForYear(year, baseRate);
    const i = rate / 100 / 12;
    const inGrace = m < g;

    if (rate !== prevRate || m === g) {
      if (inGrace) {
        payment = balance * i;
      } else {
        const rem = n - m;
        payment = i === 0 ? balance / rem : (balance * i) / (1 - Math.pow(1 + i, -rem));
      }
      phases.push({ startYear: year, startMonth: m, rate, payment, grace: inGrace });
      prevRate = rate;
    }

    const interest = balance * i;
    totalInterest += interest;
    if (!inGrace) balance -= payment - interest;
  }

  /* 合併相鄰且月付相同的階段 */
  const merged = phases.filter((p, idx) =>
    idx === 0 || Math.round(p.payment) !== Math.round(phases[idx - 1].payment) || p.grace !== phases[idx - 1].grace
  );

  return { P, totalInterest, totalPaid: P + totalInterest, phases: merged, n };
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
      <input type="number" inputMode="decimal" step={step} min={min}
        className="w-full px-4 py-3 text-[17px] font-mono bg-transparent outline-none"
        value={value}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      {suffix && <span className="px-4 text-[14px] text-inkFaint shrink-0">{suffix}</span>}
    </div>
  );
}

function Check({ ok, children, detail }) {
  return (
    <li className="flex gap-3 py-3 border-b border-line last:border-0">
      <span className={`font-mono text-[13px] shrink-0 mt-0.5 ${ok ? "text-pass" : "text-fail"}`}>
        {ok ? "通過" : "不符"}
      </span>
      <span className="flex-1">
        <span className="block text-[15px]">{children}</span>
        {detail && <span className="block text-[13px] text-inkFaint mt-1 leading-relaxed">{detail}</span>}
      </span>
    </li>
  );
}

function Calculator() {

  const [age, setAge] = useState(35);
  const [income, setIncome] = useState(90);
  const [city, setCity] = useState("高雄市");
  const [price, setPrice] = useState(1200);
  const [family, setFamily] = useState("single");
  const [noHouse, setNoHouse] = useState(true);
  const [firstTime, setFirstTime] = useState(true);

  const [loan, setLoan] = useState(900);
  const [years, setYears] = useState(30);
  const [graceYears, setGraceYears] = useState(0);
  const [baseRate, setBaseRate] = useState(2.275);

  const cap = PRICE_CAPS.find(c => c.name === city)?.cap ?? 2000;
  const quota = QUOTAS.find(q => q.key === family)?.quota ?? 1000;

  const maxYearsByAge = Math.max(0, Math.min(40, 80 - age));
  const checks = {
    age: age >= 18 && age < 50,
    ageTerm: years <= maxYearsByAge,
    income: income <= 200,
    price: price <= cap,
    noHouse,
    firstTime,
  };
  const allPass = Object.values(checks).every(Boolean);
  const loanCapped = Math.min(loan, quota, price);

  const sim = useMemo(
    () => (loanCapped > 0 && years > 0 ? simulate({ loanWan: loanCapped, years, graceYears, baseRate }) : null),
    [loanCapped, years, graceYears, baseRate]
  );
  return (
    <>
{/* 資格檢核 */}
        <section className="mt-10">
          <h2 className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-4">Step 1　資格檢核</h2>
          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 bg-surface border border-line rounded-sm p-7 space-y-6 h-fit">
              <Field label="申貸年齡" hint={`年齡＋貸款年限不得超過 80，你最長可貸 ${maxYearsByAge} 年`}>
                <NumInput value={age} onChange={setAge} suffix="歲" />
              </Field>

              <Field label="本人年所得總額" hint="以借款人本人計算，不是夫妻合計">
                <NumInput value={income} onChange={setIncome} suffix="萬" step={5} />
              </Field>

              <Field label="購屋所在縣市" hint={`總價上限 ${cap.toLocaleString()} 萬元`}>
                <select className="w-full border border-line rounded-sm px-4 py-3 text-[17px] bg-surface"
                  value={city} onChange={e => setCity(e.target.value)}>
                  {PRICE_CAPS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </Field>

              <Field label="房屋總價">
                <NumInput value={price} onChange={setPrice} suffix="萬" step={10} />
              </Field>

              <Field label="家庭狀況" hint={`貸款額度上限 ${quota.toLocaleString()} 萬元`}>
                <select className="w-full border border-line rounded-sm px-4 py-3 text-[17px] bg-surface"
                  value={family} onChange={e => setFamily(e.target.value)}>
                  {QUOTAS.map(q => <option key={q.key} value={q.key}>{q.label}（{q.quota} 萬）</option>)}
                </select>
              </Field>

              <div className="space-y-3 pt-2">
                <label className="flex gap-3 items-start cursor-pointer">
                  <input type="checkbox" checked={noHouse} onChange={e => setNoHouse(e.target.checked)} className="mt-0.5" />
                  <span className="text-[15px] leading-snug">本人、配偶及未成年子女名下皆無自有住宅</span>
                </label>
                <label className="flex gap-3 items-start cursor-pointer">
                  <input type="checkbox" checked={firstTime} onChange={e => setFirstTime(e.target.checked)} className="mt-0.5" />
                  <span className="text-[15px] leading-snug">未曾申請過青安貸款（一生限貸一次）</span>
                </label>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className={`border rounded-sm p-7 ${allPass ? "bg-surface border-line" : "bg-surface border-fail/40"}`}>
                <div className="flex items-baseline gap-3 mb-5">
                  <span className={`display text-[22px] ${allPass ? "text-pass" : "text-fail"}`}>
                    {allPass ? "初步符合資格" : "有條件未通過"}
                  </span>
                </div>
                <ul>
                  <Check ok={checks.age} detail="申貸時須年滿 18 歲且未滿 50 歲">
                    年齡 {age} 歲
                  </Check>
                  <Check ok={checks.ageTerm} detail={`年齡 ${age} ＋ 年限 ${years} ＝ ${age + years}，不得超過 80`}>
                    年齡加貸款年限
                  </Check>
                  <Check ok={checks.income} detail="借款人本人年所得總額不得超過 200 萬元">
                    本人年所得 {income} 萬
                  </Check>
                  <Check ok={checks.price} detail={`${city}總價上限 ${cap.toLocaleString()} 萬元`}>
                    房屋總價 {price} 萬
                  </Check>
                  <Check ok={checks.noHouse} detail="現在名下有沒有房，不是有沒有買過房">
                    名下無自有住宅
                  </Check>
                  <Check ok={checks.firstTime} detail="需簽署自住切結，貸後會跨部會勾稽">
                    一生限貸一次
                  </Check>
                </ul>
                <p className="text-[14px] text-inkFaint leading-[1.85] mt-5 pt-5 border-t border-line">
                  這裡只檢核方案明訂的門檻。實際能不能核貸、能貸多少成數，仍由銀行依物件條件與信用狀況審查。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 月付試算 */}
        <section className="mt-14">
          <h2 className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-4">Step 2　月付試算</h2>
          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 bg-surface border border-line rounded-sm p-7 space-y-6 h-fit">
              <Field label="貸款金額"
                hint={loan > loanCapped ? `已自動下修為 ${fmtW(loanCapped)} 萬（受額度上限或總價限制）` : `額度上限 ${quota} 萬`}>
                <NumInput value={loan} onChange={setLoan} suffix="萬" step={10} />
              </Field>
              <Field label="貸款年限" hint={`最長 40 年，且不得超過 ${maxYearsByAge} 年`}>
                <NumInput value={years} onChange={setYears} suffix="年" min={1} />
              </Field>
              <Field label="寬限期" hint="最長 5 年，期內只繳息">
                <NumInput value={graceYears} onChange={setGraceYears} suffix="年" min={0} />
              </Field>
              <Field label="補貼期滿後利率"
                hint="一段式機動利率的原始水準。目前約 2.275%（郵儲基準 1.72% ＋ 0.555%），會隨升降息變動">
                <NumInput value={baseRate} onChange={setBaseRate} suffix="%" step={0.005} />
              </Field>
            </div>

            <div className="lg:col-span-3 space-y-6">
              {sim && (
                <>
                  <div className="bg-surface border border-line rounded-sm p-7">
                    <div className="font-mono text-[12px] tracking-wider text-inkFaint mb-1">起始月付（前 3 年補貼後）</div>
                    <div className="font-mono text-[40px] font-semibold text-orangeDeep leading-none">
                      {fmt(sim.phases[0].payment)}
                      <span className="text-[15px] font-normal text-inkSoft ml-2">元 / 月</span>
                    </div>
                    <div className="font-mono text-[13px] text-inkSoft mt-2">
                      年利率 {rateForYear(1, baseRate).toFixed(3)}%
                      {sim.phases[0].grace && "・寬限期內只繳息"}
                    </div>
                  </div>

                  <div className="bg-surface border border-line rounded-sm p-7">
                    <div className="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-1">
                      月付變化
                    </div>
                    <p className="text-[14px] text-inkSoft leading-[1.8] mb-5">
                      利息補貼採「3＋3」逐年退場，月付會分階段往上調。
                    </p>
                    <table className="w-full text-[15px]">
                      <thead>
                        <tr className="font-mono text-[12px] tracking-wider text-inkFaint border-b border-line">
                          <th className="text-left pb-2 font-normal">期間</th>
                          <th className="text-right pb-2 font-normal">年利率</th>
                          <th className="text-right pb-2 font-normal">月付金</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sim.phases.map((p, i) => {
                          const next = sim.phases[i + 1];
                          const endYear = next ? next.startYear - 1 : years;
                          return (
                            <tr key={i} className="border-b border-line last:border-0">
                              <td className="py-3">
                                第 {p.startYear}{endYear > p.startYear ? `–${endYear}` : ""} 年
                                {p.grace && <span className="text-[13px] text-inkFaint ml-2">寬限期</span>}
                              </td>
                              <td className="py-3 text-right font-mono text-inkSoft">{p.rate.toFixed(3)}%</td>
                              <td className="py-3 text-right font-mono">{fmt(p.payment)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-surface border border-line rounded-sm p-7">
                    <dl className="divide-y divide-line">
                      {[
                        ["實際貸款金額", `${fmtW(loanCapped)} 萬元`],
                        ["自備款（總價 − 貸款）", `${fmtW(Math.max(0, price - loanCapped))} 萬元`],
                        ["利息總額", `${fmt(sim.totalInterest)} 元`],
                        ["本息合計", `${fmt(sim.totalPaid)} 元`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between py-3">
                          <dt className="text-[15px] text-inkSoft">{k}</dt>
                          <dd className="font-mono text-[17px]">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("calc")).render(<Calculator />);
