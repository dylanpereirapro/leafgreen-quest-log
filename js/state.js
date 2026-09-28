// Save state: one object, saved to localStorage on every change, exportable as a save code.
import { QUESTS, SPOTS, COLLECTION, EXCLUSIVES, DEX } from "./data.js";

const KEY = "lgql-save-v1";
const listeners = new Set();

function defaults() {
  return {
    v: 1, q: {}, steps: {}, c: {}, x: {}, dex: 0,
    sound: true, speed: 1, motion: "auto",
    filters: { story: true, legend: true, items: true, gifts: true },
    seen: [], legendOpen: true, legendOpenHud: false, panelOpen: true,
  };
}

function load() {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === "object") return merge(d, raw);
  } catch (e) { /* private mode or corrupt save: start fresh */ }
  return d;
}

function merge(d, raw) {
  const out = { ...d, ...raw };
  out.filters = { ...d.filters, ...(raw.filters || {}) };
  for (const k of ["q", "steps", "c", "x"]) out[k] = raw[k] && typeof raw[k] === "object" ? raw[k] : {};
  out.dex = clampDex(raw.dex);
  out.seen = Array.isArray(raw.seen) ? raw.seen : [];
  return out;
}

const clampDex = (n) => Math.max(0, Math.min(DEX.kanto, Number.isFinite(+n) ? Math.round(+n) : 0));

export const S = load();

export function save(reason) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(reason));
}
export const onChange = (fn) => listeners.add(fn);

/* ---------- derived ---------- */
export const byId = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
export const collectionItems = COLLECTION.flatMap((sec) => sec.items.map(([id, name, where, spot, color]) => ({ id, name, where, spot, color, sec })));
export const itemById = Object.fromEntries(collectionItems.map((i) => [i.id, i]));

export const isDone = (n) => !!S.q[n];
export const nextQuest = () => QUESTS.find((q) => !S.q[q.n]) || null;
export const doneCount = () => QUESTS.filter((q) => S.q[q.n]).length;
// The quest number the player is "on": fog lifts on spots whose unlock <= this.
export const progressN = () => (nextQuest() ? nextQuest().n : QUESTS.length + 1);
export const isRevealed = (spot) => spot.unlock <= progressN();
export const questsAt = (id) => QUESTS.filter((q) => q.spot === id);

// Where the trainer stands: the next quest's spot, or the last quest's spot when finished.
export function trainerSpot() {
  const nq = nextQuest();
  return byId[nq ? nq.spot : QUESTS[QUESTS.length - 1].spot];
}

export function stepsOf(n) {
  const q = QUESTS.find((x) => x.n === n);
  const arr = S.steps[n] || [];
  return q.steps.map((_, i) => !!arr[i]);
}
export function toggleStep(n, i) {
  const arr = stepsOf(n);
  arr[i] = !arr[i];
  S.steps[n] = arr;
  save("step");
  return arr[i];
}

export function setQuest(n, done) {
  const q = QUESTS.find((x) => x.n === n);
  S.q[n] = !!done;
  if (!done) delete S.q[n];
  const granted = [];
  if (done) {
    S.steps[n] = q.steps.map(() => true);
    for (const id of q.grants || []) if (!S.c[id]) { S.c[id] = true; granted.push(id); }
  }
  save("quest");
  return granted;
}

export function toggleItem(id) { S.c[id] = !S.c[id]; if (!S.c[id]) delete S.c[id]; save("item"); return !!S.c[id]; }
export function toggleExclusive(name) { S.x[name] = !S.x[name]; if (!S.x[name]) delete S.x[name]; save("item"); return !!S.x[name]; }
export function setDex(n) { S.dex = clampDex(n); save("dex"); }

export function collectionTotals() {
  let got = 0, total = 0;
  for (const i of collectionItems) { total++; if (S.c[i.id]) got++; }
  for (const n of EXCLUSIVES) { total++; if (S.x[n]) got++; }
  return { got, total };
}

export function resetAll() {
  const keep = { sound: S.sound, speed: S.speed, motion: S.motion };
  const d = defaults();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d, keep);
  save("reset");
}

/* ---------- save codes ---------- */
// Format: LGQ1.<base64url JSON>.<4-char checksum>. Only progress travels; settings stay per device.
function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).slice(-4).padStart(4, "0");
}
const b64enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function exportCode() {
  const body = b64enc(JSON.stringify({ q: S.q, steps: S.steps, c: S.c, x: S.x, dex: S.dex, seen: S.seen }));
  return `LGQ1.${body}.${checksum(body)}`;
}

// Returns {ok, msg}. Accepts a save code, or raw JSON from the old single-page version.
export function importCode(text) {
  const t = (text || "").trim().replace(/\s+/g, "");
  let data;
  try {
    if (t.startsWith("LGQ1.")) {
      const [, body, sum] = t.split(".");
      if (!body || checksum(body) !== sum) return { ok: false, msg: "That code is damaged. Copy the whole thing and try again." };
      data = JSON.parse(b64dec(body));
    } else if (t.startsWith("{")) {
      data = JSON.parse(text);
    } else return { ok: false, msg: "That isn't a save code. It should start with LGQ1." };
  } catch (e) { return { ok: false, msg: "Couldn't read that code." }; }
  if (!data || typeof data !== "object" || typeof data.q !== "object") return { ok: false, msg: "No quest data in that code." };
  const m = merge(defaults(), data);
  Object.assign(S, { q: m.q, steps: m.steps, c: m.c, x: m.x, dex: m.dex, seen: m.seen });
  save("import");
  return { ok: true, msg: `Save loaded. ${doneCount()}/${QUESTS.length} quests done.` };
}
