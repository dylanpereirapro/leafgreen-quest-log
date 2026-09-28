// App glue: picks HUD or World Map mode from the screen shape, wires every button.
import { QUESTS } from "./data.js";
import {
  S, save, byId, nextQuest, setQuest, toggleStep, stepsOf, toggleItem, toggleExclusive, setDex,
  exportCode, importCode, resetAll, itemById, isRevealed, trainerSpot,
} from "./state.js";
import { unlockAudio, audioReady, sfx } from "./audio.js";
import { MapView } from "./map.js";
import { iconURL } from "./art.js";
import {
  $, $$, esc, renderCards, renderBadges, renderDex, renderStory, renderQuestLists, screenHTML, colTabHTML, ui,
  openTextbox, closeTextbox, advanceTextbox, textboxOpen, spotPages, showBanner, hideBanner, flash, toast, wipe, reducedMotion,
} from "./ui.js";

const app = $("#app");
let mode = null;

/* ---------- mode detection ---------- */
// Unfolded inner screen (wide, near square) = World Map. Cover screen or split-screen (narrow/tall) = HUD.
export function computeMode(w = innerWidth, h = innerHeight) {
  return w >= 600 && h >= 420 && h / w <= 1.6 ? "map" : "hud";
}

const map = new MapView($("#map"), {
  reducedMotion,
  onSpot: (spot, revealed) => openTextbox(spotPages(spot, revealed)),
  onEmpty: () => { if (textboxOpen()) closeTextbox(); },
  onFerry: () => sail(),
  onCrossRegion: (region) => switchRegion(region, true),
});
map.trainerAt = trainerSpot().id;

function mapVisible() { return mode === "map" || app.classList.contains("map-open"); }
function syncMapRunning() {
  if (mapVisible()) { map.start(); requestAnimationFrame(() => map.resize()); }
  else map.stop();
}

function applyMode(next, animate) {
  if (next === mode) { if (mapVisible()) map.resize(); return; }
  const swap = () => {
    mode = next;
    app.dataset.mode = next;
    if (next === "map") app.classList.remove("map-open");
    closeTextbox();
    closeMenu(true);
    syncMapRunning();
    renderAll();
    updateRegionUI();
  };
  if (animate && mode !== null) wipe(swap); else swap();
}

let rzT = null;
function onResize() {
  clearTimeout(rzT);
  rzT = setTimeout(() => applyMode(computeMode(), true), 90);
}
addEventListener("resize", onResize);
screen.orientation?.addEventListener?.("change", onResize);

/* ---------- rendering ---------- */
function renderAll(popBadge) {
  renderStory();
  renderCards();
  renderBadges(popBadge);
  renderDex();
  renderQuestLists();
  if (openScreenName) refreshScreen();
  renderMute();
  renderLegend();
  $("#panel").classList.toggle("closed", !S.panelOpen);
  app.classList.toggle("panel-open", S.panelOpen);
}

function renderMute() {
  $$('[data-act="mute"]').forEach((b) => {
    const on = S.sound && audioReady();
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Sound on. Tap to mute" : "Sound off");
    b.classList.toggle("off", !on);
  });
}

// The legend has its own open/closed memory per mode; on the small cover screen it starts closed.
const legendKey = () => (mode === "hud" ? "legendOpenHud" : "legendOpen");
function renderLegend() {
  const L = $("[data-legend]");
  L.classList.toggle("collapsed", !S[legendKey()]);
  $$("[data-filter]", L).forEach((b) => b.setAttribute("aria-pressed", String(!!S.filters[b.dataset.filter])));
}

function updateRegionUI() {
  $('[data-bind="regionName"]').textContent = map.region === "kanto" ? "KANTO" : "SEVII ISLANDS";
  const fb = $('[data-act="ferry"]');
  fb.textContent = map.region === "kanto" ? "SEVII ▶" : "◀ KANTO";
  fb.classList.toggle("locked", !map.seviiOpen());
}

/* ---------- quest completion ---------- */
function completeQuest(n) {
  const q = QUESTS.find((x) => x.n === n);
  const granted = setQuest(n, true);
  const badge = granted.find((id) => id.startsWith("b"));
  badge ? sfx.badge() : sfx.quest();
  flash();
  showBanner({ head: "QUEST COMPLETE!", line: `You got: ${q.reward}!`, badge });
  renderAll(badge);
  map.syncReveals();
  setTimeout(() => map.walkToCurrent(), reducedMotion() ? 0 : 900);
  const undo = n;
  toast(`Q${String(n).padStart(2, "0")} done. <button class="linkbtn" data-undo="${undo}">UNDO</button>`, 5000);
}

function uncompleteQuest(n) {
  setQuest(n, false);
  map.syncReveals();
  map.trainerAt = trainerSpot().id;
  map.placeTrainer();
  renderAll();
}

/* ---------- start menu ---------- */
const menu = $("#menu");
let menuIdx = 0;
function openMenu() {
  if (!menu.hidden) return closeMenu();
  sfx.confirm();
  menu.hidden = false;
  pushLayer("menu");
  moveCursor(0, true);
  $$("button", menu)[0].focus({ preventScroll: true });
}
function closeMenu(silent) {
  if (menu.hidden) return;
  menu.hidden = true;
  if (!silent) sfx.cancel();
  dropLayer("menu");
}
function moveCursor(i, quiet) {
  const items = $$("button", menu);
  menuIdx = (i + items.length) % items.length;
  items.forEach((b, k) => b.classList.toggle("cur", k === menuIdx));
  const cur = $(".cursor", menu);
  cur.style.top = `${items[menuIdx].offsetTop + items[menuIdx].offsetHeight / 2}px`;
  if (!quiet) sfx.blip();
}
menu.addEventListener("pointerover", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const i = $$("button", menu).indexOf(b);
  if (i !== menuIdx) moveCursor(i);
});
menu.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { moveCursor(menuIdx + 1); $$("button", menu)[menuIdx].focus(); e.preventDefault(); }
  if (e.key === "ArrowUp") { moveCursor(menuIdx - 1); $$("button", menu)[menuIdx].focus(); e.preventDefault(); }
});

function go(target) {
  const [name, tab] = target.split(":");
  sfx.confirm();
  if (name === "map") { if (mode === "hud") openHudMap(); closeMenu(true); return; }
  if (name === "close") { closeMenu(true); return; }
  if (tab) ui.colTab = tab;
  openScreen(name);
  closeMenu(true);
}

/* ---------- screens ---------- */
let openScreenName = null;
function openScreen(name) {
  const { title, body } = screenHTML(name);
  const sc = $("#screen");
  $(".scr-title", sc).textContent = title;
  $(".scr-body", sc).innerHTML = body;
  sc.dataset.screen = name;
  if (!openScreenName) pushLayer("screen");
  openScreenName = name;
  sc.hidden = false;
  renderDex();
  $(".scr-back", sc).focus({ preventScroll: true });
}
function refreshScreen() {
  const sc = $("#screen");
  const body = $(".scr-body", sc);
  const keep = body.scrollTop;
  if (openScreenName === "collection") {
    const cb = $(".colbody", body);
    const top = cb ? cb.scrollTop : 0;
    body.innerHTML = screenHTML("collection").body;
    renderDex();
    if ($(".colbody", body)) $(".colbody", body).scrollTop = top;
  } else if (openScreenName === "quests") {
    const ql = $(".qlist", body); const top = ql ? ql.scrollTop : 0;
    body.innerHTML = screenHTML("quests").body;
    if ($(".qlist", body)) $(".qlist", body).scrollTop = top;
  } else if (openScreenName === "options") {
    const sb = $("[data-savebox]", body);
    const open = sb && !sb.hidden ? sb.outerHTML : null;
    body.innerHTML = screenHTML("options").body;
    if (open) $("[data-savebox]", body).outerHTML = open;
  } else body.innerHTML = screenHTML(openScreenName).body;
  body.scrollTop = keep;
}
function closeScreen(silent) {
  if (!openScreenName) return;
  openScreenName = null;
  $("#screen").hidden = true;
  if (!silent) sfx.cancel();
  dropLayer("screen");
}

/* ---------- HUD map overlay ---------- */
function openHudMap(spotId) {
  if (!app.classList.contains("map-open")) {
    app.classList.add("map-open");
    pushLayer("hudmap");
  }
  syncMapRunning();
  updateRegionUI();
  if (spotId) requestAnimationFrame(() => map.focusSpot(spotId));
}
function closeHudMap() {
  if (!app.classList.contains("map-open")) return;
  app.classList.remove("map-open");
  closeTextbox();
  syncMapRunning();
  dropLayer("hudmap");
}

function showSpot(id) {
  const spot = byId[id];
  closeScreen(true);
  if (mode === "hud") openHudMap();
  if (spot.region !== map.region) { map.setRegion(spot.region, { center: false }); updateRegionUI(); }
  requestAnimationFrame(() => {
    map.focusSpot(id);
    openTextbox(spotPages(spot, isRevealed(spot)));
  });
}

/* ---------- ferry ---------- */
function sail() {
  if (!map.seviiOpen()) {
    sfx.error();
    openTextbox([{ title: "FERRY", lines: ["The ferry doesn't sail for you yet.", "Bill offers a ride once you have the Volcano Badge (quest 16)."] }]);
    return;
  }
  switchRegion(map.region === "kanto" ? "sevii" : "kanto");
}
function switchRegion(region, followTrainer) {
  closeTextbox();
  sfx.sail();
  toast(region === "sevii" ? "Sailing to the Sevii Islands…" : "Sailing back to Kanto…", 1800);
  wipe(() => {
    map.setRegion(region);
    if (followTrainer) map.placeTrainer();
    updateRegionUI();
  });
}

/* ---------- back button / layers (Android back gesture closes the top layer) ---------- */
const layers = [];
let popping = false;
// One history entry covers every open layer, so the back gesture closes the top one.
function pushLayer(name) { layers.push(name); if (layers.length === 1) history.pushState({ lg: 1 }, ""); }
function dropLayer(name) {
  const i = layers.lastIndexOf(name);
  if (i < 0) return;
  layers.splice(i, 1);
  if (!layers.length && !popping) history.back();
}
addEventListener("popstate", () => {
  const top = layers[layers.length - 1];
  if (!top) return;
  popping = true;
  if (textboxOpen()) closeTextbox();
  if (top === "screen") closeScreen();
  else if (top === "menu") closeMenu();
  else if (top === "hudmap") closeHudMap();
  popping = false;
  if (layers.length) history.pushState({ lg: 1 }, "");
});

/* ---------- press-and-hold for the dex buttons ---------- */
let holdT = null, holdI = null;
function dexBump(code) { const d = parseInt(code.slice(3), 10); setDex(S.dex + d); sfx.blip(); renderDex(); if (openScreenName === "dex" || openScreenName === "collection") refreshScreen(); }
app.addEventListener("pointerdown", (e) => {
  const b = e.target.closest("[data-hold]");
  if (!b) return;
  e.preventDefault();
  dexBump(b.dataset.hold);
  clearTimeout(holdT); clearInterval(holdI);
  holdT = setTimeout(() => { holdI = setInterval(() => dexBump(b.dataset.hold), 90); }, 420);
});
const stopHold = () => { clearTimeout(holdT); clearInterval(holdI); };
addEventListener("pointerup", stopHold);
addEventListener("pointercancel", stopHold);
app.addEventListener("keydown", (e) => { const b = e.target.closest("[data-hold]"); if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); dexBump(b.dataset.hold); } });

/* ---------- one click handler for everything ---------- */
app.addEventListener("click", (e) => {
  const t = e.target;
  const el = (sel) => t.closest(sel);
  let b;
  if ((b = el("[data-undo]"))) { uncompleteQuest(+b.dataset.undo); sfx.cancel(); toast("Undone.", 1200); return; }
  if ((b = el("[data-step]"))) {
    const on = toggleStep(+b.dataset.q, +b.dataset.step);
    on ? sfx.check() : sfx.uncheck();
    renderCards();
    return;
  }
  if ((b = el("[data-qtoggle]"))) {
    const n = +b.dataset.qtoggle;
    if (S.q[n]) { uncompleteQuest(n); sfx.uncheck(); }
    else if (nextQuest()?.n === n) completeQuest(n);
    else { setQuest(n, true); sfx.check(); map.syncReveals(); map.trainerAt = trainerSpot().id; map.placeTrainer(); renderAll(); }
    return;
  }
  if ((b = el("[data-item]"))) {
    const on = toggleItem(b.dataset.item);
    if (on && b.dataset.item.startsWith("b")) { sfx.badge(); renderAll(b.dataset.item); }
    else { on ? sfx.check() : sfx.uncheck(); renderAll(); }
    if (on && b.dataset.item.startsWith("b")) {
      const sock = $(`#screen [data-item="${b.dataset.item}"]`);
      sock?.classList.add("pop");
    }
    return;
  }
  if ((b = el("[data-excl]"))) { const on = toggleExclusive(b.dataset.excl); on ? sfx.check() : sfx.uncheck(); refreshScreen(); return; }
  if ((b = el("[data-coltab]"))) { ui.colTab = b.dataset.coltab; sfx.blip(); refreshScreen(); return; }
  if ((b = el("[data-filter]"))) { const k = b.dataset.filter; S.filters[k] = !S.filters[k]; save("filter"); sfx.blip(); renderLegend(); return; }
  if ((b = el("[data-opt]"))) {
    const raw = b.dataset.val;
    const v = raw === "true" ? true : raw === "false" ? false : /^\d+$/.test(raw) ? +raw : raw;
    S[b.dataset.opt] = v; save("opt");
    if (b.dataset.opt === "sound" && v) unlockAudio();
    sfx.blip();
    document.documentElement.toggleAttribute("data-rm", reducedMotion());
    renderAll();
    return;
  }
  if ((b = el("[data-go]"))) { go(b.dataset.go); return; }
  if ((b = el("#textbox"))) { if (!el(".tb-x")) advanceTextbox(); else { sfx.cancel(); closeTextbox(); } return; }
  if ((b = el("#banner"))) { hideBanner(); return; }
  if (!(b = el("[data-act]"))) return;
  const act = b.dataset.act;
  if (act === "menu") return openMenu();
  if (act === "mute") {
    // The first tap only wakes the audio, so a tap on the muted icon turns sound on.
    S.sound = performance.now() - unlockedAt < 700 ? true : !S.sound;
    save("opt"); renderAll(); sfx.blip();
    return;
  }
  if (act === "complete") {
    const n = +b.dataset.q;
    const all = stepsOf(n).every(Boolean);
    if (!all && !b.dataset.armed) {
      b.dataset.armed = "1"; b.textContent = "TAP AGAIN TO CONFIRM"; sfx.blip();
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "QUEST COMPLETE"; } }, 3000);
      return;
    }
    completeQuest(n);
    return;
  }
  if (act === "showSpot") { sfx.confirm(); showSpot(b.dataset.spot); return; }
  if (act === "closeScreen") return closeScreen();
  if (act === "closeMap") { sfx.cancel(); return closeHudMap(); }
  if (act === "me") { sfx.blip(); return map.centerOnMe(); }
  if (act === "zin") { sfx.blip(); return map.zoomBy(1.4); }
  if (act === "zout") { sfx.blip(); return map.zoomBy(1 / 1.4); }
  if (act === "ferry") return sail();
  if (act === "panel") { S.panelOpen = !S.panelOpen; save("opt"); sfx.blip(); renderAll(); setTimeout(() => map.resize(), 260); return; }
  if (act === "legend") { S[legendKey()] = !S[legendKey()]; save("opt"); sfx.blip(); renderLegend(); return; }
  if (act === "export") {
    const box = $("[data-savebox]");
    box.hidden = false;
    box.innerHTML = `<textarea readonly rows="4" aria-label="Your save code">${esc(exportCode())}</textarea>
      <div class="rowbtns"><button class="pxbtn" data-act="copy">COPY</button>${navigator.share ? '<button class="pxbtn" data-act="share">SHARE</button>' : ""}</div>`;
    $("textarea", box).select();
    sfx.confirm();
    return;
  }
  if (act === "copy") {
    const ta = $("[data-savebox] textarea");
    ta.select();
    const done = () => { toast("Save code copied."); sfx.confirm(); };
    (navigator.clipboard?.writeText(ta.value) || Promise.reject()).then(done, () => { try { document.execCommand("copy"); done(); } catch (err) { toast("Select the code and copy it by hand."); } });
    return;
  }
  if (act === "share") { navigator.share({ title: "LeafGreen Quest Log save", text: exportCode() }).catch(() => {}); return; }
  if (act === "importOpen") {
    const box = $("[data-savebox]");
    box.hidden = false;
    box.innerHTML = `<textarea rows="4" placeholder="Paste your LGQ1 code here" aria-label="Paste a save code"></textarea>
      <div class="rowbtns"><button class="pxbtn" data-act="import">LOAD SAVE</button></div><p class="hint" data-importmsg></p>`;
    $("textarea", box).focus();
    sfx.confirm();
    return;
  }
  if (act === "import") {
    const box = $("[data-savebox]");
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "TAP AGAIN: REPLACES PROGRESS"; sfx.blip(); return; }
    const r = importCode($("textarea", box).value);
    $("[data-importmsg]", box).textContent = r.msg;
    delete b.dataset.armed; b.textContent = "LOAD SAVE";
    if (r.ok) { sfx.badge(); map.trainerAt = trainerSpot().id; map.placeTrainer(); map.reveal = {}; map.syncReveals(); renderAll(); toast(r.msg); }
    else sfx.error();
    return;
  }
  if (act === "reset") {
    if (!b.dataset.armed) {
      b.dataset.armed = "1"; b.textContent = "TAP AGAIN TO WIPE EVERYTHING"; sfx.error();
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "RESET ALL PROGRESS"; } }, 3500);
      return;
    }
    resetAll();
    map.reveal = {}; map.trainerAt = trainerSpot().id; map.placeTrainer(); map.syncReveals();
    renderAll(); toast("Progress wiped. Fresh start."); sfx.cancel();
  }
});

// Keyboard: Escape backs out of the top layer; Enter/Space advances the text box.
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (textboxOpen()) closeTextbox();
    else if (!menu.hidden) closeMenu();
    else if (openScreenName) closeScreen();
    else if (app.classList.contains("map-open")) closeHudMap();
  }
  if ((e.key === "Enter" || e.key === " ") && textboxOpen() && document.activeElement === $("#map")) { e.preventDefault(); advanceTextbox(); }
});

/* ---------- boot ---------- */
// Sound unlocks on the first tap anywhere (browsers block audio before that).
let unlockedAt = -1e9;
addEventListener("pointerdown", () => { if (audioReady()) return; unlockAudio(); unlockedAt = performance.now(); renderMute(); }, { capture: true });

document.documentElement.toggleAttribute("data-rm", reducedMotion());
$$("[data-icon]").forEach((el) => { el.style.backgroundImage = `url(${iconURL(el.dataset.icon, 2)})`; });
matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => document.documentElement.toggleAttribute("data-rm", reducedMotion()));

// Start in the region where the trainer stands.
map.setRegion(trainerSpot().region, { center: false });
applyMode(computeMode(), false);
renderAll();
updateRegionUI();
document.fonts?.ready.then(() => { if (!menu.hidden) moveCursor(menuIdx, true); });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// Test hook (read-only view of state for automated checks).
window.__lgql = { S, mode: () => mode, map, computeMode };
