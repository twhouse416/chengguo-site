/**
 * 澄果團隊｜買方需求回報頁（內部用）
 * ------------------------------------------------
 * 用途：團隊成員在外面收到買方需求時，用手機開一個網址就能回報，
 *       不必登入後台、不必找電腦。送出後直接寄到團隊信箱，
 *       由後台的「買方需求」分頁審核後才會上到首頁的需求牆。
 *
 * 這一頁刻意「只有網址的人才找得到」：
 *   - noindex,nofollow，不進 sitemap.xml、不進 llms.txt
 *   - 導覽列與頁尾都不連它
 *   - 頁面本身不含任何客戶個資欄位（姓名、電話一律不收）
 *
 * 匿名化是硬性要求（data/buyers.json 的 _法規提醒）：
 * 需求牆的內容不得出現姓名、電話、公司或社區名稱。
 * 所以這一頁在送出前會先用社區清單與常見樣式自動檢查一次，
 * 檢出來的東西擋在前面，而不是等上架時才用肉眼抓。
 *
 * 新增頂層產出目錄時，記得同步加進 .github/workflows/build-site.yml
 * 的提交清單，否則頁面永遠不會上線（稽核 I 會擋）。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, BRAND, esc, head, footer } from "./lib/layout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DIR = "buyer-intake";

/* 需求牆的欄位（與 admin 的「買方需求」分頁一致）：
   area 想找的區域／size 坪數／budget 預算／updated 更新時間／notes 需求重點 */
const FIELDS = [
  { id: "area", label: "想找的區域", required: true,
    hint: "寫生活圈或行政區，不要寫特定社區名稱。例如：美術館特區、農十六",
    placeholder: "美術館特區 / 農十六" },
  { id: "size", label: "坪數", required: true,
    hint: "寫區間比寫單一數字好用，買方條件通常有彈性", placeholder: "30–40 坪" },
  { id: "budget", label: "預算", required: true,
    hint: "總價。有上限就寫上限，有區間就寫區間", placeholder: "1,300 萬內" },
];

function fieldHtml(f) {
  return `<label class="block">
      <span class="block text-[15px] font-medium text-ink mb-2">${esc(f.label)}${f.required ? `<span class="text-fail ml-1">*</span>` : ""}</span>
      <input id="bi-${f.id}" name="${esc(f.label)}" type="text" autocomplete="off"
        placeholder="${esc(f.placeholder)}"
        class="w-full px-4 py-3 text-[16px] border border-line rounded-sm bg-surface outline-none focus:border-orange" />
      <span class="block text-[13px] text-inkFaint mt-1.5 leading-relaxed">${esc(f.hint)}</span>
    </label>`;
}

export function buildBuyerIntake({ communities = [] } = {}) {
  const url = `${SITE}/${DIR}/`;

  /* 把社區名稱交給前端做匿名化檢查。
     只取有名字的，順便把常見的別名切出來（「京城寶格麗/京城國寶」這種）。 */
  const names = [...new Set(communities
    .flatMap(c => String(c.name || "").split(/[\/／]/))
    .map(s => s.trim())
    .filter(s => s.length >= 2))].sort();

  const html = [
    head({
      title: `買方需求回報（內部）｜${BRAND.teamName}`,
      description: "澄果團隊內部使用的買方需求回報表單，送出後由後台審核才會上架。",
      canonical: url,
      depth: 1,
      noindex: true,
    }),
    `<main id="main" class="max-w-2xl mx-auto px-6 py-12">
  <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-3">Internal</div>
  <h1 class="display text-[28px] md:text-[32px]">買方需求回報</h1>
  <p class="mt-4 text-[16px] text-inkSoft leading-[1.9]">
    收到買方需求時填這一張，送出後會寄到團隊信箱。
    <strong class="text-ink font-medium">送出不等於上架</strong>——需求牆的內容仍由後台的「買方需求」分頁確認後才會出現在官網首頁。
  </p>

  <div class="mt-6 bg-tint border border-orange/30 rounded-sm px-5 py-4 text-[15px] text-orangeDeep leading-[1.8]">
    <strong class="font-bold">上牆的欄位不要填客戶的姓名、電話、公司，也不要填特定社區名稱。</strong>
    前三項是個資法的要求——需求牆是公開頁面，刊登內容須以不可識別特定個人為原則。
    社區名稱是另一回事：它不是買方的個資，但公開寫「有買方要找 ○○ 社區、預算 1,300 萬」，
    等於把買方的底價攤給那棟的所有屋主看，議價地位會整個翻轉。
    <strong class="font-bold">買方確實指名某個社區時，填下面的「買方指名的社區」欄位</strong>，
    那一欄只寄給團隊、不會上牆。
  </div>

  <form id="bi-form" class="mt-10 space-y-7" novalidate>
    <input type="hidden" name="access_key" value="${BRAND.formKey}" />
    <input type="hidden" name="subject" value="澄果團隊｜買方需求待上架" />
    <input type="hidden" name="from_name" value="澄果團隊買方需求回報" />
    <input type="checkbox" name="botcheck" class="hidden" style="display:none" tabindex="-1" autocomplete="off" />
    <input type="hidden" id="bi-json" name="可直接貼進後台的 JSON" value="" />

    <label class="block">
      <span class="block text-[15px] font-medium text-ink mb-2">回報人<span class="text-fail ml-1">*</span></span>
      <input id="bi-by" name="回報人" type="text" autocomplete="off" placeholder="你的名字"
        class="w-full px-4 py-3 text-[16px] border border-line rounded-sm bg-surface outline-none focus:border-orange" />
      <span class="block text-[13px] text-inkFaint mt-1.5 leading-relaxed">只給團隊內部對照用，不會出現在需求牆上。</span>
    </label>

    ${FIELDS.map(fieldHtml).join("\n    ")}

    <label class="block">
      <span class="block text-[15px] font-medium text-ink mb-2">需求重點</span>
      <textarea id="bi-notes" name="需求重點" rows="5"
        placeholder="一行一項，例如：&#10;三房含平面車位&#10;需電梯大樓&#10;可接受屋齡 20 年內&#10;資金已備妥，可配合交屋時間"
        class="w-full px-4 py-3 text-[16px] border border-line rounded-sm bg-surface outline-none focus:border-orange leading-[1.8]"></textarea>
      <span class="block text-[13px] text-inkFaint mt-1.5 leading-relaxed">一行一項。這幾行會原樣出現在需求牆的卡片上，寫得越具體，屋主越判斷得出自己符不符合。</span>
    </label>

    <label class="block">
      <span class="block text-[15px] font-medium text-ink mb-2">買方指名的社區</span>
      <input id="bi-named" name="買方指名的社區（內部，不上牆）" type="text" autocomplete="off"
        placeholder="京城VPARK、美術白天鵝（可填多個）"
        class="w-full px-4 py-3 text-[16px] border border-line rounded-sm bg-surface outline-none focus:border-orange" />
      <span class="block text-[13px] text-inkFaint mt-1.5 leading-relaxed">
        <strong class="text-ink font-medium">這一欄只寄給團隊，不會進需求牆。</strong>
        買方指名單一社區時，需求牆幫不上忙——該做的是直接開發那棟的屋主。填在這裡，
        團隊才知道要去敲哪一棟的門；上牆的部分仍然只寫生活圈。
      </span>
    </label>

    <label class="block">
      <span class="block text-[15px] font-medium text-ink mb-2">更新時間</span>
      <input id="bi-updated" name="更新時間" type="text" autocomplete="off" placeholder="2026.10"
        class="w-full px-4 py-3 text-[16px] border border-line rounded-sm bg-surface outline-none focus:border-orange" />
      <span class="block text-[13px] text-inkFaint mt-1.5 leading-relaxed">格式 YYYY.MM，留空會自動帶今天的年月。</span>
    </label>

    <div id="bi-warn" hidden class="border border-fail/40 bg-surface rounded-sm px-5 py-4 text-[15px] leading-[1.8]">
      <strong class="font-bold text-fail">送出前請先處理這幾個地方</strong>
      <ul id="bi-warn-list" class="mt-2 space-y-1 text-inkSoft"></ul>
    </div>

    <div id="bi-soft" hidden class="border border-orange/40 bg-tint rounded-sm px-5 py-4 text-[15px] leading-[1.8]">
      <strong class="font-bold text-orangeDeep">請確認一下</strong>
      <ul id="bi-soft-list" class="mt-2 space-y-1 text-inkSoft"></ul>
      <button type="button" id="bi-soft-ok"
        class="mt-3 inline-flex items-center px-5 py-2.5 text-[14px] font-medium rounded-sm border border-line bg-surface text-ink hover:border-orange transition">
        這不是社區名，繼續
      </button>
    </div>

    <div class="border-t border-line pt-7">
      <div class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep uppercase mb-4">上架後會長這樣</div>
      <div id="bi-preview" class="border border-line rounded-sm bg-paper p-7 max-w-sm">
        <div class="flex items-baseline justify-between gap-3 mb-4">
          <span class="font-mono text-[12px] tracking-[0.18em] text-orangeDeep">01</span>
          <span id="pv-updated" class="font-mono text-[12px] text-inkFaint"></span>
        </div>
        <h3 id="pv-area" class="text-[19px] font-bold tracking-tight leading-snug mb-5 text-inkFaint">（想找的區域）</h3>
        <dl class="space-y-3 mb-5">
          <div class="flex gap-4 pb-3 border-b border-line">
            <dt class="font-mono text-[12px] text-inkFaint w-12 shrink-0 pt-1">坪數</dt>
            <dd id="pv-size" class="text-[15px] text-inkFaint">—</dd></div>
          <div class="flex gap-4 pb-3 border-b border-line">
            <dt class="font-mono text-[12px] text-inkFaint w-12 shrink-0 pt-1">預算</dt>
            <dd id="pv-budget" class="font-mono text-[17px] font-semibold text-inkFaint">—</dd></div>
        </dl>
        <ul id="pv-notes" class="space-y-2 mb-6"></ul>
        <span class="font-mono text-[14px] text-orangeDeep">我的房子符合，來電洽詢 →</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-4 pt-2">
      <button type="submit" id="bi-submit"
        class="inline-flex items-center px-8 py-3.5 text-[15px] font-medium rounded-sm bg-orange text-white hover:bg-orangeDeep transition">送出</button>
      <button type="button" id="bi-copy"
        class="inline-flex items-center px-6 py-3.5 text-[15px] font-medium rounded-sm border border-line text-ink hover:border-orange transition">複製 JSON</button>
      <span id="bi-status" class="text-[14px] text-inkSoft leading-[1.8]"></span>
    </div>
  </form>

  <p class="mt-12 pt-6 border-t border-line text-[14px] text-inkFaint leading-[1.9]">
    這一頁沒有被網站的導覽列、sitemap 或搜尋引擎收錄，只有拿到網址的人開得到。
    需求牆的實際內容在後台的「買方需求」分頁維護，可以排序、暫時隱藏或刪除。
  </p>
</main>

<script>
(function () {
  var form = document.getElementById("bi-form");
  if (!form) return;
  /* 社區名稱清單，用來擋住「不要寫特定社區名稱」這條規則 */
  var COMMUNITIES = ${JSON.stringify(names)};
  /* 兩個字的社區名有不少是日常用語（微風、遇見、飛揚、本然、極美…），
     硬擋會把「希望有微風穿堂」這種正常句子也擋下來。
     所以三個字以上才算確定命中，兩個字只提醒、可以略過。 */
  var SURE = COMMUNITIES.filter(function (n) { return n.length >= 3; });
  var MAYBE = COMMUNITIES.filter(function (n) { return n.length < 3; });

  var el = function (id) { return document.getElementById(id); };
  var status = el("bi-status"), submit = el("bi-submit");

  function say(msg, ok) {
    status.textContent = msg;
    status.className = "text-[14px] leading-[1.8] " + (ok ? "text-pass" : "text-inkSoft");
  }

  function notesArr() {
    return el("bi-notes").value.split("\\n").map(function (t) { return t.trim(); }).filter(Boolean);
  }
  function defaultUpdated() {
    var d = new Date();
    return d.getFullYear() + "." + (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1);
  }
  function entry() {
    return {
      area: el("bi-area").value.trim(),
      size: el("bi-size").value.trim(),
      budget: el("bi-budget").value.trim(),
      updated: el("bi-updated").value.trim() || defaultUpdated(),
      notes: notesArr()
    };
  }

  /* ---- 匿名化檢查 ----
     hard：一定要改掉才能送（姓名、電話、公司，這些是個資法的紅線）
     soft：提醒一下，確認過可以略過（兩個字的社區名容易誤判） */
  var softOk = false;   /* 使用者按過「這不是社區名」就不再擋 */

  function scan() {
    var e = entry();
    /* 只掃會上牆的欄位。「買方指名的社區」是內部欄位，本來就該寫社區名，不掃。 */
    var all = [e.area, e.size, e.budget].concat(e.notes).join("　");
    var hard = [], soft = [];

    /* 電話：09 開頭的手機樣式，或連續 8 碼以上數字（先把「1,300 萬」這類金額拿掉再比） */
    if (/09\\d{2}[-\\s]?\\d{3}[-\\s]?\\d{3}/.test(all) || /\\d[\\d\\-\\s]{8,}\\d/.test(all.replace(/[\\d,]+\\s*萬/g, ""))) {
      hard.push("內容裡有看起來像電話號碼的數字，請移除。");
    }
    /* 稱謂：王先生、陳小姐這種 */
    if (/[\\u4e00-\\u9fa5]\\s*(先生|小姐|太太|女士|老師|醫師|律師|董事長|總經理)/.test(all)) {
      hard.push("內容裡有像是稱呼特定人的字樣（例如「王先生」），請移除。");
    }
    /* 公司 */
    if (/(有限公司|股份有限|企業社|工作室)/.test(all)) {
      hard.push("內容裡有公司名稱，請移除。");
    }

    function hits(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        if (all.indexOf(list[i]) !== -1 && out.indexOf(list[i]) === -1) out.push(list[i]);
      }
      return out;
    }
    var sure = hits(SURE), maybe = hits(MAYBE);
    var named = el("bi-named").value.trim();
    function advise(ns) {
      return "上牆的欄位出現社區名稱「" + ns.slice(0, 5).join("、") + "」。"
        + "需求牆只寫生活圈——寫出單一社區等於把買方的預算攤給那棟的屋主看。"
        + (named ? "請把它從上牆的欄位移除（你已經填在「買方指名的社區」裡了）。"
                 : "買方確實指名這個社區的話，請改填到下面的「買方指名的社區」欄位。");
    }
    if (sure.length) hard.push(advise(sure));
    if (maybe.length) {
      soft.push(advise(maybe) + "（「" + maybe.join("、") + "」也可能只是一般用語，確認不是社區名就按下面的按鈕繼續。）");
    }
    return { hard: hard, soft: soft };
  }

  function fill(boxId, listId, list) {
    var box = el(boxId), ul = el(listId);
    ul.innerHTML = "";
    if (!list.length) { box.setAttribute("hidden", ""); return; }
    for (var i = 0; i < list.length; i++) {
      var li = document.createElement("li");
      li.textContent = "・" + list[i];
      ul.appendChild(li);
    }
    box.removeAttribute("hidden");
  }
  function renderWarn(r) {
    fill("bi-warn", "bi-warn-list", r.hard);
    fill("bi-soft", "bi-soft-list", softOk ? [] : r.soft);
  }
  el("bi-soft-ok").addEventListener("click", function () {
    softOk = true;
    el("bi-soft").setAttribute("hidden", "");
    say("好，這幾個字當成一般用語處理。");
  });

  /* ---- 即時預覽 ---- */
  function sync() {
    var e = entry();
    el("pv-area").textContent = e.area || "（想找的區域）";
    el("pv-area").className = "text-[19px] font-bold tracking-tight leading-snug mb-5 " + (e.area ? "text-ink" : "text-inkFaint");
    el("pv-size").textContent = e.size || "—";
    el("pv-size").className = "text-[15px] " + (e.size ? "text-ink" : "text-inkFaint");
    el("pv-budget").textContent = e.budget || "—";
    el("pv-budget").className = "font-mono text-[17px] font-semibold " + (e.budget ? "text-ink" : "text-inkFaint");
    el("pv-updated").textContent = e.updated;
    var ul = el("pv-notes");
    ul.innerHTML = "";
    for (var i = 0; i < e.notes.length; i++) {
      var li = document.createElement("li");
      li.className = "flex gap-2.5 text-[15px] text-inkSoft leading-[1.8]";
      var dot = document.createElement("span");
      dot.className = "text-orange shrink-0"; dot.textContent = "・";
      var sp = document.createElement("span"); sp.textContent = e.notes[i];
      li.appendChild(dot); li.appendChild(sp); ul.appendChild(li);
    }
    el("bi-json").value = JSON.stringify(e, null, 2);
    renderWarn(scan());
  }
  form.addEventListener("input", sync);
  sync();

  /* ---- 複製 JSON ---- */
  el("bi-copy").addEventListener("click", function () {
    var txt = JSON.stringify(entry(), null, 2);
    function done() { say("JSON 已複製，可以直接貼進後台。", true); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { say("複製失敗，請手動選取。"); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (err) { say("複製失敗，請手動選取。"); }
      document.body.removeChild(ta);
    }
  });

  /* ---- 送出 ---- */
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var e = entry();
    if (!el("bi-by").value.trim()) { say("請填回報人"); el("bi-by").focus(); return; }
    if (!e.area) { say("請填想找的區域"); el("bi-area").focus(); return; }
    if (!e.size) { say("請填坪數"); el("bi-size").focus(); return; }
    if (!e.budget) { say("請填預算"); el("bi-budget").focus(); return; }

    var r = scan();
    renderWarn(r);
    if (r.hard.length) { say("還有要處理的地方，請看上面的提示。"); return; }
    if (r.soft.length && !softOk) { say("請先確認上面那幾個字不是社區名。"); return; }

    if (!el("bi-updated").value.trim()) el("bi-updated").value = e.updated;
    el("bi-json").value = JSON.stringify(e, null, 2);

    submit.disabled = true; submit.textContent = "送出中…"; say("");
    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.success) throw new Error(d.message || "送出失敗");
        form.reset(); softOk = false; sync();
        say("已送出，等後台確認後會上架。可以接著填下一筆。", true);
        submit.disabled = false; submit.textContent = "送出";
      })
      .catch(function () {
        say("送出時發生問題，請稍後再試。急件可以先用「複製 JSON」存下來。");
        submit.disabled = false; submit.textContent = "送出";
      });
  });
})();
</script>`,
    /* compact：內部頁不需要頁尾那張公開的賣方估價表單，
       同一頁出現兩個「送出」按鈕只會害人按錯。 */
    footer({ depth: 1, hasBuyers: false, compact: true }),
  ].join("\n");

  mkdirSync(path.join(ROOT, DIR), { recursive: true });
  writeFileSync(path.join(ROOT, DIR, "index.html"), html, "utf-8");
  console.log("[產生]", `${DIR}/index.html`, `（內部用，noindex；社區名稱比對清單 ${names.length} 筆）`);
  return DIR;
}
