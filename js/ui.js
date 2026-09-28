// Menus, quest card, badge case, text box, reward banner. Pure DOM, no framework.
import { QUESTS, COLLECTION, EXCLUSIVES, DEX } from "./data.js";
import {
  S, save, byId, nextQuest, doneCount, stepsOf, questsAt, isDone, isRevealed, collectionTotals, itemById,
} from "./state.js";
import { badgeURL, discURL, iconURL } from "./art.js";
import { sfx } from "./audio.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad = (n) => String(n).padStart(2, "0");

export const reducedMotion = () => S.motion === "reduced" || (S.motion === "auto" && matchMedia("(prefers-reduced-motion: reduce)").matches);

const BADGES = COLLECTION.find((c) => c.id === "badges").items;
const HM_COLORS = ["#8fd66a", "#7ab8f0", "#5f8fe0", "#d8a060", "#f8e070", "#c08060", "#60c8e8"];

/* ---------- quest card (HUD + panel) ---------- */
export function renderCards() {
  for (const el of $$("[data-card]")) renderQuestCard(el);
}

function renderQuestCard(el) {
  const q = nextQuest();
  if (!q) {
    el.innerHTML = `<div class="qhead"><span class="chip gold">HALL OF FAME</span><span class="qno">${QUESTS.length}/${QUESTS.length}</span></div>
      <h2 class="qtitle">Every quest done</h2>
      <p class="qdone-note">Your story log is complete. Keep hunting the dex, or tap START to tidy up your collection.</p>
      <button class="qdone ready" data-go="collection">OPEN COLLECTION</button>`;
    return;
  }
  const st = stepsOf(q.n);
  const all = st.every(Boolean);
  el.innerHTML = `<div class="qhead"><span class="chip">NEXT QUEST</span><span class="qno">Q${pad(q.n)}<small>/${QUESTS.length}</small></span></div>
    <h2 class="qtitle">${esc(q.title)}</h2>
    <button class="qplace" data-act="showSpot" data-spot="${q.spot}"><img src="${iconURL(byId[q.spot].kind === "legend" ? "legend" : byId[q.spot].kind === "cave" ? "cave" : "town", 2)}" alt="">${esc(byId[q.spot].name)}<span aria-hidden="true">▶</span></button>
    <ul class="qsteps">${q.steps.map((s, i) => `<li><button class="step" role="checkbox" aria-checked="${st[i]}" data-step="${i}" data-q="${q.n}"><span class="box" aria-hidden="true"></span><span class="st">${esc(s)}</span></button></li>`).join("")}</ul>
    <div class="qreward"><span class="lbl">REWARD</span><span class="rw">${esc(q.reward)}</span></div>
    ${q.tip ? `<p class="qtip"><b>TIP</b> ${esc(q.tip)}</p>` : ""}
    <button class="qdone${all ? " ready" : ""}" data-act="complete" data-q="${q.n}">QUEST COMPLETE</button>`;
}

/* ---------- badge case strip ---------- */
export function renderBadges(popId) {
  for (const el of $$("[data-badges]")) {
    const got = BADGES.filter((b) => S.c[b[0]]).length;
    el.innerHTML = `<div class="bc-head"><span>BADGES</span><span>${got}/8</span></div>
      <div class="bc-grid">${BADGES.map(([id, name, , , col]) => `<button class="badge${S.c[id] ? " got" : ""}${popId === id ? " pop" : ""}" data-go="collection:badges" aria-label="${esc(name)}${S.c[id] ? ", earned" : ", not yet"}"><img src="${badgeURL(id, col, 3, !!S.c[id])}" alt=""></button>`).join("")}</div>`;
  }
}

/* ---------- dex counter ---------- */
export function renderDex() {
  for (const el of $$("[data-dex]")) {
    el.innerHTML = `<span class="lbl">DEX</span>
      <button class="pxbtn sq" data-hold="dex-1" aria-label="One less caught">-</button>
      <span class="dexn" aria-live="polite">${S.dex}<small>/${DEX.kanto}</small></span>
      <button class="pxbtn sq" data-hold="dex+1" aria-label="One more caught">+</button>
      <div class="bar" aria-hidden="true"><i style="width:${(S.dex / DEX.kanto) * 100}%"></i><b style="left:${(DEX.nationalAt / DEX.kanto) * 100}%"></b></div>`;
  }
}

export function renderStory() {
  const d = doneCount();
  for (const el of $$('[data-bind="storyCount"]')) el.textContent = `${d}/${QUESTS.length}`;
  for (const el of $$('[data-bind="storyBar"]')) el.style.width = `${(d / QUESTS.length) * 100}%`;
}

/* ---------- quest list ---------- */
export function questListHTML() {
  const nq = nextQuest();
  let h = "";
  for (const q of QUESTS) {
    if (q.act) h += `<h3 class="act">${esc(q.act.toUpperCase())}</h3>`;
    const done = isDone(q.n), next = nq === q;
    h += `<div class="qrow${done ? " done" : ""}${next ? " next" : ""}">
      <button class="ck" role="checkbox" aria-checked="${done}" aria-label="Quest ${q.n} done" data-qtoggle="${q.n}"></button>
      <button class="qrow-main" data-act="showSpot" data-spot="${q.spot}">
        <span class="qn">Q${pad(q.n)}${next ? ' <em class="tag">NEXT</em>' : ""}</span>
        <span class="qt">${esc(q.title)}</span>
        <span class="qp">${esc(byId[q.spot].name)} · ★ ${esc(q.reward)}</span>
      </button></div>`;
  }
  return h;
}
export function renderQuestLists() {
  for (const el of $$("[data-qlist]")) {
    const keep = el.scrollTop;
    el.innerHTML = questListHTML();
    el.scrollTop = keep;
  }
}

/* ---------- full-screen menu screens ---------- */
const COL_TABS = [
  ["badges", "BADGES"], ["hms", "HMs"], ["legend", "LEGENDS"], ["gifts", "ONE-OFFS"], ["corner", "PRIZES"], ["keys", "KEY ITEMS"], ["excl", "EXCLUSIVES"],
];
export const ui = { colTab: "badges" };

export function screenHTML(name) {
  if (name === "quests") return { title: "QUESTS", body: `<p class="hint">Tick quests off here, or tap one to see it on the map.</p><div class="qlist" data-qlist="screen">${questListHTML()}</div>` };
  if (name === "collection") return { title: "COLLECTION", body: collectionHTML() };
  if (name === "dex") return { title: "POKéDEX", body: dexHTML() };
  if (name === "options") return { title: "OPTIONS", body: optionsHTML() };
  return { title: "", body: "" };
}

function collectionHTML() {
  const { got, total } = collectionTotals();
  const tabs = COL_TABS.map(([id, label]) => `<button class="tab" role="tab" aria-selected="${ui.colTab === id}" data-coltab="${id}">${label}</button>`).join("");
  return `<div class="prog"><span>COLLECTED</span><div class="bar"><i style="width:${(got / total) * 100}%"></i></div><span class="num">${got}/${total}</span></div>
    <div class="dexrow in-screen" data-dex="screen"></div>
    <div class="tabs" role="tablist">${tabs}</div>
    <div class="colbody">${colTabHTML(ui.colTab)}</div>`;
}

export function colTabHTML(tab) {
  if (tab === "excl") {
    const n = EXCLUSIVES.filter((x) => S.x[x]).length;
    return `<p class="hint">Only in LeafGreen. Tap the ones you've caught. <b>${n}/${EXCLUSIVES.length}</b></p>
      <div class="chips">${EXCLUSIVES.map((x) => `<button class="chip" aria-pressed="${!!S.x[x]}" data-excl="${esc(x)}">${esc(x)}</button>`).join("")}</div>`;
  }
  const sec = COLLECTION.find((c) => c.id === tab);
  const n = sec.items.filter((i) => S.c[i[0]]).length;
  const head = `<p class="hint">${sec.note ? esc(sec.note) + ". " : ""}<b>${n}/${sec.items.length}</b></p>`;
  if (tab === "badges") {
    return head + `<div class="case">${sec.items.map(([id, name, where, , col]) => `<button class="socket${S.c[id] ? " got" : ""}" aria-pressed="${!!S.c[id]}" data-item="${id}">
      <img src="${badgeURL(id, col, 4, !!S.c[id])}" alt=""><span class="nm">${esc(name)}</span><span class="wh">${esc(where)}</span></button>`).join("")}</div>`;
  }
  const ic = (id, i) => (tab === "hms" ? discURL(HM_COLORS[i], !!S.c[id]) : iconURL(sec.kind === "legend" ? "legend" : sec.kind === "gift" ? "gift" : "item", 3));
  return head + `<div class="rows">${sec.items.map(([id, name, where], i) => `<button class="row${S.c[id] ? " got" : ""}" role="checkbox" aria-checked="${!!S.c[id]}" data-item="${id}">
    <img src="${ic(id, i)}" alt=""><span class="txt"><b>${esc(name)}</b><small>${esc(where)}</small></span><span class="box" aria-hidden="true"></span></button>`).join("")}</div>`;
}

function dexHTML() {
  const pct = Math.round((S.dex / DEX.kanto) * 100);
  const toNat = Math.max(0, DEX.nationalAt - S.dex);
  return `<div class="dexbig">
    <div class="dexscreen"><span class="dexcount">${S.dex}</span><span class="dexof">/ ${DEX.kanto} CAUGHT</span></div>
    <div class="dexbtns">
      <button class="pxbtn" data-hold="dex-10">-10</button><button class="pxbtn big" data-hold="dex-1" aria-label="One less">-</button>
      <button class="pxbtn big" data-hold="dex+1" aria-label="One more">+</button><button class="pxbtn" data-hold="dex+10">+10</button>
    </div>
    <div class="bar tall" aria-hidden="true"><i style="width:${pct}%"></i><b style="left:${(DEX.nationalAt / DEX.kanto) * 100}%"></b></div>
    <p class="hint">${pct}% of the Kanto dex. ${toNat ? `${toNat} more for Oak's National Dex upgrade (60 caught, after the Hall of Fame).` : "Enough for Oak's National Dex upgrade once you're in the Hall of Fame."}</p>
  </div>`;
}

function optionsHTML() {
  const seg = (key, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${S[key] === v}" data-opt="${key}" data-val="${v}">${l}</button>`).join("")}</div>`;
  return `<div class="opts">
    <div class="opt"><span class="ol">SOUND</span>${seg("sound", [[true, "ON"], [false, "OFF"]])}</div>
    <div class="opt"><span class="ol">TEXT SPEED</span>${seg("speed", [[0, "SLOW"], [1, "MID"], [2, "FAST"]])}</div>
    <div class="opt"><span class="ol">MOTION</span>${seg("motion", [["auto", "AUTO"], ["reduced", "REDUCED"]])}</div>
    <div class="opt col"><span class="ol">SAVE CODE</span>
      <p class="hint">Copy this code somewhere safe. Paste it back on any phone to restore your progress.</p>
      <div class="rowbtns"><button class="pxbtn" data-act="export">SHOW MY CODE</button><button class="pxbtn" data-act="importOpen">LOAD A CODE</button></div>
      <div class="savebox" data-savebox hidden></div>
    </div>
    <div class="opt col"><span class="ol">RESET</span><button class="pxbtn warn" data-act="reset">RESET ALL PROGRESS</button></div>
    <p class="about">Fan-made companion. Not affiliated with Nintendo, Creatures or Game Freak. All art and sound are original and drawn in code. Game facts checked against Bulbapedia.</p>
  </div>`;
}

/* ---------- text box (GBA style, types out) ---------- */
const tb = { pages: [], page: 0, typing: false, timer: null };
const SPEEDS = [[1, 38], [1, 18], [3, 12]]; // [chars per tick, ms per tick]

export function spotPages(spot, revealed) {
  if (!revealed) return [{ title: "???", lines: ["You haven't made it this far yet.", "Keep following the story to lift the fog here."] }];
  const pages = [];
  const qs = questsAt(spot.id);
  const qLines = qs.map((q) => `Q${pad(q.n)} ${q.title}${isDone(q.n) ? " ✓" : nextQuest() === q ? " ◀ NEXT" : ""}`);
  pages.push({ title: spot.name, lines: qLines.length ? qLines : ["No story quest here.", ...(spot.info ? [] : ["A good stop to heal up and shop."])] });
  const chunk = (title, lines) => { for (let i = 0; i < lines.length; i += 3) pages.push({ title, lines: lines.slice(i, i + 3) }); };
  if (spot.info?.length) chunk("SIDE NOTES", spot.info);
  const here = [];
  for (const sec of COLLECTION) for (const it of sec.items) if (it[3] === spot.id) here.push(`${S.c[it[0]] ? "✓" : "□"} ${it[1]}: ${it[2]}`);
  if (here.length) chunk("ITEMS + GIFTS", here);
  if (spot.catch?.length) chunk("CATCH HERE", spot.catch);
  return pages;
}

export function openTextbox(pages) {
  const box = $("#textbox");
  tb.pages = pages; tb.page = 0;
  box.hidden = false;
  box.classList.remove("closing");
  showPage();
}
export function closeTextbox() {
  const box = $("#textbox");
  clearInterval(tb.timer);
  tb.typing = false;
  if (!box.hidden) box.hidden = true;
}
export const textboxOpen = () => !$("#textbox").hidden;

function showPage() {
  const p = tb.pages[tb.page];
  const box = $("#textbox");
  $(".tb-title", box).textContent = p.title.toUpperCase();
  $(".tb-count", box).textContent = tb.pages.length > 1 ? `${tb.page + 1}/${tb.pages.length}` : "";
  const linesEl = $(".tb-lines", box);
  linesEl.innerHTML = p.lines.map(() => `<p></p>`).join("");
  const targets = $$("p", linesEl);
  box.classList.remove("done");
  clearInterval(tb.timer);
  if (reducedMotion()) { p.lines.forEach((l, i) => (targets[i].textContent = l)); finishPage(); return; }
  let li = 0, ci = 0;
  const [step, ms] = SPEEDS[S.speed] || SPEEDS[1];
  tb.typing = true;
  tb.timer = setInterval(() => {
    for (let k = 0; k < step; k++) {
      if (li >= p.lines.length) { finishPage(); return; }
      ci++;
      targets[li].textContent = p.lines[li].slice(0, ci);
      if (ci % 3 === 0) sfx.text();
      if (ci >= p.lines[li].length) { li++; ci = 0; }
    }
  }, ms);
}
function finishPage() {
  clearInterval(tb.timer);
  tb.typing = false;
  const p = tb.pages[tb.page];
  $$(".tb-lines p", $("#textbox")).forEach((el, i) => (el.textContent = p.lines[i]));
  $("#textbox").classList.add("done");
}
// Tap: finish typing, else next page, else close.
export function advanceTextbox() {
  if (tb.typing) { finishPage(); return; }
  if (tb.page < tb.pages.length - 1) { tb.page++; sfx.blip(); showPage(); return; }
  sfx.cancel();
  closeTextbox();
}

/* ---------- reward banner, flash, toast ---------- */
let bannerTimer = null;
export function showBanner({ head, line, badge }) {
  const b = $("#banner");
  $(".bn-head", b).textContent = head;
  $(".bn-line", b).textContent = line;
  const img = $(".bn-badge", b);
  if (badge) { const it = itemById[badge]; img.src = badgeURL(badge, it.color, 6, true); img.hidden = false; }
  else img.hidden = true;
  b.hidden = false;
  b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, badge ? 3200 : 2600);
}
export function hideBanner() { clearTimeout(bannerTimer); $("#banner").hidden = true; }

export function flash() {
  if (reducedMotion()) return;
  const f = $("#flash");
  f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
}

let toastTimer = null;
export function toast(html, ms = 2600) {
  const t = $("#toast");
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- screen wipe ---------- */
export function wipe(mid) {
  if (reducedMotion()) { mid(); return Promise.resolve(); }
  const w = $("#wipe");
  return new Promise((res) => {
    w.className = "in";
    setTimeout(() => {
      mid();
      w.className = "out";
      setTimeout(() => { w.className = ""; res(); }, 300);
    }, 300);
  });
}

export { isRevealed };
