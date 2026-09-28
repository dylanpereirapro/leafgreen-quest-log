// End-to-end checks. Run: python3 -m http.server 8787 (in the project root), then node tests/run.mjs [baseURL]
import { launch } from "./browser.mjs";
import { mkdirSync } from "fs";

const BASE = process.argv[2] || "http://localhost:8787/";
const SHOTS = "tests/shots";
mkdirSync(SHOTS, { recursive: true });
const FOLDED = { width: 384, height: 850 }, UNFOLDED = { width: 884, height: 1000 };
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  PASS", msg); } else { fail++; console.log("  FAIL", msg); } };
const wait = (p, ms) => p.waitForTimeout(ms);

const b = await launch();

async function newPage(viewport, opts = {}) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") p.errors.push(m.text()); });
  return { ctx, p };
}
const mode = (p) => p.evaluate(() => window.__lgql.mode());
const fits = (p) => p.evaluate(() => {
  const d = document.scrollingElement;
  const hud = document.querySelector("#hud");
  const card = document.querySelector('#hud .qcard'), steps = document.querySelector('#hud .qsteps');
  const over = (el) => el && el.scrollHeight > el.clientHeight + 1;
  const wide = [...document.querySelectorAll("#hud *")].some((el) => el.getBoundingClientRect().right > innerWidth + 1);
  return { page: d.scrollHeight <= innerHeight + 1 && d.scrollWidth <= innerWidth + 1, hud: !over(hud), card: !over(card), steps: !over(steps), wide: !wide };
});

/* 1. Folded: Quest HUD */
console.log("FOLDED 384x850");
const { ctx, p } = await newPage(FOLDED);
await p.goto(BASE);
await wait(p, 700);
ok((await mode(p)) === "hud", "folded opens in HUD mode");
let f = await fits(p);
ok(f.page && f.hud && f.card && f.steps && f.wide, `HUD fits one screen, no scroll (${JSON.stringify(f)})`);
const tapH = await p.evaluate(() => Math.min(...[...document.querySelectorAll("#hud button")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height)));
ok(tapH >= 36, `smallest HUD tap target ${Math.round(tapH)}px`);
await p.screenshot({ path: `${SHOTS}/folded-hud.png` });

// tick steps, complete quest 1
for (let i = 0; i < 3; i++) await p.tap(`#hud .step[data-step="${i}"]`);
ok((await p.$$eval('#hud .step[aria-checked="true"]', (e) => e.length)) === 3, "steps tick on tap");
ok(await p.$eval("#hud .qdone", (e) => e.classList.contains("ready")), "complete button lights up when all steps ticked");
await p.tap("#hud .qdone");
await wait(p, 250);
ok(await p.isVisible("#banner"), "reward banner shows on quest complete");
ok((await p.textContent(".bn-line")).includes("Your starter"), "banner names the reward");
await p.screenshot({ path: `${SHOTS}/folded-reward.png` });
await p.tap("#banner");
ok((await p.evaluate(() => JSON.parse(localStorage.getItem("lgql-save-v1")).q["1"])) === true, "progress saved to localStorage");
ok((await p.textContent("#hud .qtitle")).includes("Oak's Parcel"), "HUD moves to quest 2");

// complete through quest 4 to earn a badge (second tap confirms when steps are unticked)
for (let n = 2; n <= 4; n++) { await p.tap("#hud .qdone"); await p.tap("#hud .qdone"); await wait(p, 200); await p.evaluate(() => document.querySelector("#banner").click()); }
ok(await p.evaluate(() => !!window.__lgql.S.c.b1), "Boulder Badge granted by quest 4");
ok((await p.$$eval("#hud .badge.got", (e) => e.length)) === 1, "badge case shows 1 badge");

// dex counter
await p.tap('#hud [data-hold="dex+1"]'); await p.tap('#hud [data-hold="dex+1"]'); await p.tap('#hud [data-hold="dex-1"]');
ok((await p.evaluate(() => window.__lgql.S.dex)) === 1, "dex + and - work");

/* 2. Live resize to unfolded */
console.log("LIVE RESIZE -> 884x1000");
await p.setViewportSize(UNFOLDED);
await wait(p, 900);
ok((await mode(p)) === "map", "unfolding switches to World Map mode");
ok(await p.isVisible("#map") && await p.isVisible("#panel"), "map canvas and quest panel visible");
ok((await p.textContent("#panel .qtitle")).includes("Mt. Moon"), "same state after the switch (quest 5 is next)");
const cw = await p.$eval("#map", (c) => c.width);
ok(cw >= 884, `canvas sized to the screen (${cw}px backing width)`);
await wait(p, 1600);
await p.screenshot({ path: `${SHOTS}/unfolded-map.png` });

// tap the next-quest marker
const mk = await p.evaluate(() => window.__lgql.map.markers.find((m) => m.spot && m.spot.id === "mtmoon"));
ok(!!mk, "Mt. Moon marker on screen");
if (mk) {
  await p.mouse.click(mk.x, mk.y);
  await wait(p, 200);
  ok(await p.isVisible("#textbox"), "tapping a spot opens the text box");
  await wait(p, 1200);
  await p.screenshot({ path: `${SHOTS}/unfolded-textbox.png` });
  const t1 = await p.textContent(".tb-title");
  await p.click("#textbox .tb-lines"); await p.click("#textbox .tb-lines");
  await wait(p, 100);
  ok((await p.textContent(".tb-title")) !== t1 || !(await p.isVisible("#textbox")), "tap skips typing, then advances the page");
  await p.click(".tb-x");
}
// pan and zoom
const c0 = await p.evaluate(() => ({ ...window.__lgql.map.cam }));
await p.mouse.move(300, 500); await p.mouse.down(); await p.mouse.move(200, 420, { steps: 6 }); await p.mouse.up();
const c1 = await p.evaluate(() => ({ ...window.__lgql.map.cam }));
ok(c1.x !== c0.x && c1.y !== c0.y, "drag pans the map");
await p.mouse.move(300, 500); await p.mouse.wheel(0, -400); await wait(p, 100);
const c2 = await p.evaluate(() => window.__lgql.map.cam.z);
ok(c2 > c1.z, "wheel/pinch zoom changes zoom");
await p.click('[data-act="me"]'); await wait(p, 800);
const me = await p.evaluate(() => { const m = window.__lgql.map; return Math.hypot(m.cam.x - m.trainer.x, m.cam.y - m.trainer.y); });
ok(me < 40, "Center on me flies to the trainer");
// ferry locked before quest 16
await p.click('[data-act="ferry"]'); await wait(p, 150); await p.click("#textbox .tb-lines");
ok((await p.textContent("#textbox")).includes("Volcano Badge"), "ferry explains it is locked");
await p.click(".tb-x");
// filters
await p.click('[data-filter="legend"]');
ok((await p.evaluate(() => window.__lgql.S.filters.legend)) === false, "legend filter toggles");
await p.click('[data-filter="legend"]');
// start menu + collection
await p.click('#world [data-act="menu"]');
ok(await p.isVisible("#menu"), "START opens the menu");
await p.keyboard.press("ArrowDown");
ok(await p.$eval('#menu button.cur', (b) => b.textContent === "QUESTS"), "cursor moves with the arrow keys");
await p.click('#menu [data-go="collection"]'); await wait(p, 200);
ok(await p.isVisible("#screen .case"), "collection opens on the badge case");
await p.click('#screen [data-item="b2"]');
ok(await p.evaluate(() => !!window.__lgql.S.c.b2), "tapping a badge socket collects it");
await p.click('#screen [data-coltab="excl"]');
await p.click('#screen [data-excl="Vulpix"]');
ok(await p.evaluate(() => !!window.__lgql.S.x.Vulpix), "exclusives grid toggles");
await p.screenshot({ path: `${SHOTS}/unfolded-collection.png` });
await p.click("#screen .scr-back");

/* 3. Complete a quest while unfolded: trainer walks */
await p.click("#panel .qdone"); await p.click("#panel .qdone");
await wait(p, 1300);
ok(await p.evaluate(() => !!window.__lgql.map.walk), "trainer walks to the next quest after completing one");
await wait(p, 5000);
const at = await p.evaluate(() => { const m = window.__lgql.map; return !m.walk; });
ok(at, "walk finishes");

/* 4. Back to folded, then split screen */
console.log("LIVE RESIZE -> folded, then split screen");
await p.setViewportSize(FOLDED);
await wait(p, 900);
ok((await mode(p)) === "hud", "folding switches back to HUD");
ok((await p.textContent("#hud .qtitle")).includes("Misty"), "HUD shows the same next quest (quest 6)");
f = await fits(p);
ok(f.page && f.hud && f.card && f.steps && f.wide, `HUD still fits after the round trip (${JSON.stringify(f)})`);
await p.screenshot({ path: `${SHOTS}/folded-after-roundtrip.png` });
await p.tap('#hud [data-act="menu"]'); await wait(p, 150);
await p.screenshot({ path: `${SHOTS}/folded-menu.png` });
await p.tap('#menu [data-go="map"]'); await wait(p, 900);
ok(await p.isVisible("#map") && (await mode(p)) === "hud", "START > MAP opens the full map on the cover screen");
await p.screenshot({ path: `${SHOTS}/folded-map.png` });
await p.tap('[data-act="closeMap"]'); await wait(p, 200);
ok(!(await p.isVisible("#map")), "BACK returns to the HUD");
await p.setViewportSize({ width: 442, height: 1000 });
await wait(p, 700);
ok((await mode(p)) === "hud", "split screen (442x1000) falls back to HUD");
f = await fits(p);
ok(f.page && f.hud && f.wide, "split-screen HUD fits");
await p.screenshot({ path: `${SHOTS}/split-screen.png` });
await p.setViewportSize({ width: 884, height: 480 });
await wait(p, 700);
ok((await mode(p)) === "map", "top/bottom split on the inner screen (884x480) keeps the map");

/* 5. Save code round trip */
console.log("SAVE CODE");
await p.setViewportSize(FOLDED); await wait(p, 700);
const code = await p.evaluate(() => import("./js/state.js").then((m) => m.exportCode()));
ok(/^LGQ1\.[A-Za-z0-9_-]+\.[a-z0-9]{4}$/.test(code), "export gives a LGQ1 save code");
const fresh = await newPage(FOLDED);
await fresh.p.goto(BASE); await wait(fresh.p, 500);
await fresh.p.tap('#hud [data-act="menu"]');
await fresh.p.tap('#menu [data-go="options"]');
await fresh.p.tap('[data-act="importOpen"]');
await fresh.p.fill("[data-savebox] textarea", code);
await fresh.p.tap('[data-act="import"]'); await fresh.p.tap('[data-act="import"]');
await wait(fresh.p, 200);
ok((await fresh.p.evaluate(() => Object.keys(window.__lgql.S.q).length)) === 5, "import restores 5 finished quests on a fresh device");
const bad = await fresh.p.evaluate(() => import("./js/state.js").then((m) => m.importCode("LGQ1.abc.zzzz").ok));
ok(bad === false, "damaged codes are rejected");
await fresh.p.screenshot({ path: `${SHOTS}/folded-options.png` });
ok(fresh.p.errors.length === 0, `no console errors on fresh device (${fresh.p.errors.join(" | ")})`);
await fresh.ctx.close();

/* 6. Every quest card fits the cover screen (and a smaller 360x740 one) */
console.log("ALL 23 QUEST CARDS FIT");
for (const vp of [FOLDED, { width: 360, height: 740 }]) {
  const t = await newPage(vp);
  await t.p.goto(BASE);
  const bad = [];
  for (let n = 1; n <= 23; n++) {
    await t.p.evaluate((n) => { const q = {}; for (let i = 1; i < n; i++) q[i] = true; localStorage.setItem("lgql-save-v1", JSON.stringify({ q })); }, n);
    await t.p.goto(BASE); await wait(t.p, 250);
    const r = await fits(t.p);
    if (!(r.page && r.hud && r.card && r.steps && r.wide)) bad.push(n);
  }
  ok(bad.length === 0, `${vp.width}x${vp.height}: every quest card fits without scrolling${bad.length ? " (overflow on " + bad.join(",") + ")" : ""}`);
  if (vp.width === 360) await t.p.screenshot({ path: `${SHOTS}/small-360-q22.png` });
  await t.ctx.close();
}

/* 7. Reduced motion */
const rm = await newPage(FOLDED, { reducedMotion: "reduce" });
await rm.p.goto(BASE); await wait(rm.p, 400);
ok(await rm.p.evaluate(() => document.documentElement.hasAttribute("data-rm")), "reduced-motion setting respected");
await rm.ctx.close();

/* 8. Offline after first visit */
console.log("OFFLINE");
const off = await newPage(UNFOLDED);
await off.p.goto(BASE);
await off.p.evaluate(() => navigator.serviceWorker.ready);
await wait(off.p, 800);
await off.ctx.setOffline(true);
await off.p.reload();
await wait(off.p, 800);
ok((await off.p.evaluate(() => window.__lgql?.mode())) === "map", "app loads fully offline after the first visit");
ok(await off.p.evaluate(() => document.fonts.check("12px 'Press Start 2P'")), "pixel font available offline");
await off.ctx.close();

ok(p.errors.length === 0, `no console errors in main run (${p.errors.join(" | ")})`);
await ctx.close();
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
