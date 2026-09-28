// Original pixel art, drawn from character grids. No game sprites or official art used.

// Paint a grid of characters onto a canvas context. '.' = transparent.
export function paint(ctx, rows, pal, x = 0, y = 0, s = 1, flip = false) {
  const w = rows[0].length;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < w; c++) {
      const ch = row[flip ? w - 1 - c : c];
      if (ch === "." || ch === " ") continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x + c * s, y + r * s, s, s);
    }
  }
}

export function toCanvas(rows, pal, s = 1, flip = false) {
  const c = document.createElement("canvas");
  c.width = rows[0].length * s; c.height = rows.length * s;
  paint(c.getContext("2d"), rows, pal, 0, 0, s, flip);
  return c;
}

/* ---------- trainer (16x16, four facings, walk cycle) ---------- */
const TP = {
  k: "#1e2230", c: "#43b05c", C: "#2d7d40", w: "#f4f4ec", s: "#f6c9a0", S: "#dca47c", h: "#6b4128",
  e: "#1e2230", j: "#e2603c", y: "#f0b93a", Y: "#c8902a", p: "#3b4a86", b: "#2a2d38",
};
const HEAD_DOWN = [
  "................",
  ".....kkkkkk.....",
  "....kccwwcck....",
  "...kcccwwccck...",
  "...kCCCCCCCCk...",
  "...khsssssshk...",
  "...ksesssssek...",
  "...kSssssssSk...",
];
const HEAD_UP = [
  "................",
  ".....kkkkkk.....",
  "....kcccccck....",
  "...kcccccccck...",
  "...kCCCCCCCCk...",
  "...khhhhhhhhk...",
  "...khhhhhhhhk...",
  "...kShhhhhhSk...",
];
const HEAD_SIDE = [
  "................",
  ".....kkkkkk.....",
  "....kccccwwk....",
  "...kcccccwwck...",
  "...kCCCCCCCCCk..",
  "....khhssssk....",
  "....khsssesk....",
  "....khssssSk....",
];
const BODY_DOWN = [
  "....kkjjjjkk....",
  "...kjjjwwjjjk...",
  "..ksjjjwwjjjsk..",
  "..ksjjjjjjjjsk..",
  "...kppppppppk...",
  "...kpppkkpppk...",
];
const BODY_UP = [
  "....kkjjjjkk....",
  "...kjyyyyyyjk...",
  "..ksjyyyyyyjsk..",
  "..ksjyYYYYyjsk..",
  "...kppppppppk...",
  "...kpppkkpppk...",
];
const BODY_SIDE = [
  ".....kkjjkk.....",
  "....kyjjjjjk....",
  "....kyjjsjjk....",
  "....kyjjsjjk....",
  ".....kppppk.....",
  ".....kppppk.....",
];
const LEGS = {
  down: [["...kpppk.kpppk..", "...kbbbk.kbbbk.."], ["...kbbbk.kpppk..", ".........kbbbk.."]],
  up: [["...kpppk.kpppk..", "...kbbbk.kbbbk.."], ["...kbbbk.kpppk..", ".........kbbbk.."]],
  side: [[".....kpkkpk.....", ".....kbk.kbk...."], ["....kppk.kppk...", "....kbbk.kbbk..."]],
};

function frame(dir, walk) {
  const head = dir === "down" ? HEAD_DOWN : dir === "up" ? HEAD_UP : HEAD_SIDE;
  const body = dir === "down" ? BODY_DOWN : dir === "up" ? BODY_UP : BODY_SIDE;
  const legs = LEGS[dir][walk ? 1 : 0];
  const rows = [...head, ...body, ...legs];
  // walking frames bob up one pixel
  return walk ? [...rows.slice(1), "................"] : rows;
}

let trainerCache = null;
// Returns canvases: trainer[dir][frameIndex], dir in down/up/left/right, 4 frames (stand, walk, stand, walk-mirrored).
export function trainerFrames() {
  if (trainerCache) return trainerCache;
  const out = {};
  for (const dir of ["down", "up", "left", "right"]) {
    const base = dir === "left" || dir === "right" ? "side" : dir;
    const flip = dir === "left";
    const stand = toCanvas(frame(base, false), TP, 1, flip);
    const walk = toCanvas(frame(base, true), TP, 1, flip);
    const walk2 = base === "side" ? walk : toCanvas(frame(base, true), TP, 1, true);
    out[dir] = [stand, walk, stand, walk2];
  }
  return (trainerCache = out);
}

/* ---------- badges (16x16 gems with an original type glyph) ---------- */
const GLYPHS = {
  rock: ["...##...", "..#..#..", ".#.##.#.", "#.####.#", "#.####.#", ".#.##.#.", "..#..#..", "...##..."],
  water: ["...##...", "...##...", "..####..", ".######.", ".######.", ".####.#.", "..####..", "........"],
  electric: ["....###.", "...###..", "..###...", ".######.", "...###..", "..###...", ".##.....", "#......."],
  grass: ["......##", "....####", "..#####.", ".####.#.", ".###.##.", ".#.###..", "..##....", ".#......"],
  poison: ["....##..", "...#..#.", "...#..#.", ".##.##..", "#..#....", "#..#.##.", ".##.#..#", ".....##."],
  psychic: ["........", "..####..", ".#....#.", "#..##..#", "#..##..#", ".#....#.", "..####..", "........"],
  fire: ["...#....", "...##...", "..###.#.", ".######.", "########", "###..###", ".##..##.", "..####.."],
  ground: ["........", "...#....", "..###...", "..####..", ".####.#.", ".#####.#", "########", "########"],
};
export const BADGE_GLYPH = { b1: "rock", b2: "water", b3: "electric", b4: "grass", b5: "poison", b6: "psychic", b7: "fire", b8: "ground" };

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("");
}

const GEM = [
  "....kkkkkkkk....",
  "...kHHHHHHHHk...",
  "..kHhhhhhhhhmk..",
  ".kHhhmmmmmmmmdk.",
  "kHhmmmmmmmmmmmdk",
  "kHhmmmmmmmmmmmdk",
  "kHmmmmmmmmmmmmdk",
  "kHmmmmmmmmmmmmdk",
  "kHmmmmmmmmmmmmdk",
  "kHmmmmmmmmmmmmdk",
  "khmmmmmmmmmmmmdk",
  "khmmmmmmmmmmmddk",
  ".kmmmmmmmmmmmdk.",
  "..kmmmmmmmmmddk.",
  "...kddddddddddk.",
  "....kkkkkkkkkk..",
];

const badgeCache = {};
// A badge as a canvas (scale s). Unearned badges render as a dark socket silhouette.
export function badgeCanvas(id, color, s = 4, earned = true) {
  const key = id + s + earned;
  if (badgeCache[key]) return badgeCache[key];
  const pal = earned
    ? { k: "#1a1f2c", H: shade(color, 0.7), h: shade(color, 0.35), m: color, d: shade(color, -0.35), "#": "#fffbe8" }
    : { k: "#0e1322", H: "#3a4462", h: "#323b56", m: "#2a3149", d: "#222840", "#": "#3d4766" };
  const c = toCanvas(GEM, pal, s);
  const g = GLYPHS[BADGE_GLYPH[id]];
  if (g) paint(c.getContext("2d"), g, pal, 4 * s, 4 * s, s);
  return (badgeCache[key] = c);
}
export const badgeURL = (id, color, s, earned) => badgeCanvas(id, color, s, earned).toDataURL();

/* ---------- small UI icons (9x9) ---------- */
const ICONS = {
  town: { rows: [".........", "....k....", "...kRk...", "..kRRRk..", ".kRRRRRk.", "kkkkkkkkk", ".kwwwwwk.", ".kwwkwwk.", ".kkkkkkk."], pal: { k: "#1e2230", R: "#e2603c", w: "#f8f4e0" } },
  cave: { rows: [".........", "...kkk...", "..kbbbk..", ".kbbbbbk.", ".kbkkkbk.", "kbbkkkbbk", "kbbkkkbbk", "kbbkkkbbk", "kkkkkkkkk"], pal: { k: "#1e2230", b: "#b0885a" } },
  forest: { rows: ["....k....", "...kgk...", "..kgggk..", "..kgGgk..", ".kgggggk.", ".kgGggGk.", "kkkkgkkkk", "...kbk...", "...kkk..."], pal: { k: "#1e2230", g: "#4caf50", G: "#2e7d32", b: "#7a5030" } },
  legend: { rows: ["....k....", "...kyk...", "...kyk...", "kkkyyykkk", "kyyyYyyyk", ".kkyyykk.", "..kyykyk.", ".kyk.kyk.", ".kk...kk."], pal: { k: "#1e2230", y: "#f8c030", Y: "#fff6c0" } },
  landmark: { rows: ["..k......", "..kkkkk..", "..krrrrk.", "..krrrrrk", "..kkkkkk.", "..k......", "..k......", ".kkk.....", "kkkkk...."], pal: { k: "#1e2230", r: "#e8452c" } },
  item: { rows: [".........", "...kkk...", "..k...k..", ".kkkkkkk.", ".kbbbbbk.", ".kbwwwbk.", ".kbbbbbk.", ".kbbbbbk.", ".kkkkkkk."], pal: { k: "#1e2230", b: "#4a8ae0", w: "#f8f4e0" } },
  gift: { rows: [".kk...kk.", "k..k.k..k", ".kkkkkkk.", "kppprpppk", "kkkkrkkkk", ".kpprppk.", ".kpprppk.", ".kpprppk.", ".kkkkkkk."], pal: { k: "#1e2230", p: "#f070a8", r: "#f8f4e0" } },
  check: { rows: [".........", ".......kk", "......kgk", "kk...kgk.", "kgk.kgk..", ".kgkgk...", "..kgk....", "...k.....", "........."], pal: { k: "#10301a", g: "#6ee06a" } },
  ferry: { rows: ["....k....", "....kk...", "....kwk..", "....kwwk.", "....kkkk.", "kkkkkkkkk", "krrrrrrrk", ".kwwwwwk.", "..kkkkk.."], pal: { k: "#1e2230", w: "#f8f4e0", r: "#e8452c" } },
  unknown: { rows: [".kkkkkkk.", "kmmmmmmmk", "kmmkkkmmk", "kmmmmkmmk", "kmmmkkmmk", "kmmmkmmmk", "kmmmmmmmk", "kmmmkmmmk", ".kkkkkkk."], pal: { k: "#0e1322", m: "#5a6484" } },
};
const iconCache = {};
export function icon(name, s = 3) {
  const key = name + s;
  if (!iconCache[key]) iconCache[key] = toCanvas(ICONS[name].rows, ICONS[name].pal, s);
  return iconCache[key];
}
export const iconURL = (name, s = 3) => icon(name, s).toDataURL();

/* ---------- HM disc (12x12) ---------- */
const DISC = ["...kkkkkk...", "..kmmmmmmk..", ".kmHmmmmmmk.", "kmHmmmmmmmdk", "kmmmmkkmmmdk", "kmmmkwwkmmdk", "kmmmkwwkmmdk", "kmmmmkkmmmdk", "kmmmmmmmmddk", ".kmmmmmmddk.", "..kddddddk..", "...kkkkkk..."];
export function discURL(color, earned, s = 3) {
  const pal = earned ? { k: "#1a1f2c", m: color, H: shade(color, 0.6), d: shade(color, -0.3), w: "#f8f4e0" }
    : { k: "#0e1322", m: "#2a3149", H: "#3a4462", d: "#222840", w: "#1c2438" };
  return toCanvas(DISC, pal, s).toDataURL();
}
