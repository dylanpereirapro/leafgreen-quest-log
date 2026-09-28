// Builds the two tile maps (Kanto, Sevii) in code and paints them to offscreen canvases.
// Layout is a loose, original re-imagining of the region: towns sit in roughly their real places.
import { SPOTS, ROUTES, FERRY } from "./data.js";
import { toCanvas } from "./art.js";

export const TILE = 16;
const W_ = 0, GRASS = 1, TALL = 2, TREE = 3, PATH = 4, MOUNT = 5, TOWN = 6, FLOWER = 7, BRIDGE = 8, ICE = 9;
export const TILES = { WATER: W_, GRASS, TALL, TREE, PATH, MOUNT, TOWN, FLOWER, BRIDGE, ICE };

/* ---------- deterministic noise ---------- */
function hash(x, y, seed = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy);
  const sx = ((t) => t * t * (3 - 2 * t))(fx - x0), sy = ((t) => t * t * (3 - 2 * t))(fy - y0);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inEllipse = (x, y, e) => ((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 < 1;

/* ---------- world designs ---------- */
const SIZES = {
  house: [4, 3], center: [4, 3], mart: [4, 3], gym: [5, 4], lab: [5, 3], museum: [5, 3], tower: [4, 5], dept: [5, 4],
  mansion: [5, 4], corner: [5, 3], silph: [5, 6], dojo: [4, 3], plateau: [7, 4], cottage: [3, 3], plant: [4, 4],
  gate: [4, 2], daycare: [4, 3], ttower: [4, 5], warehouse: [5, 3],
};

const DESIGNS = {
  kanto: {
    w: 112, h: 104,
    coast: [[2, 3], [108, 3], [109, 40], [108, 74], [96, 78], [88, 84], [86, 90], [30, 90], [29, 82], [2, 81]],
    islands: [{ x: 22, y: 97, rx: 8, ry: 5.5 }],
    forests: [{ rect: [13, 34, 31, 49], density: 0.9 }],
    safari: { rect: [53, 64, 72, 76], pond: { x: 58, y: 69, rx: 2.6, ry: 1.8 } },
    mountains: [
      { x: 44, y: 14, rx: 8, ry: 5 }, { x: 94, y: 16, rx: 6, ry: 5 }, { x: 8, y: 25, rx: 6, ry: 9 },
      { x: 50, y: 10, rx: 3, ry: 3 }, { x: 78, y: 59, rx: 2.5, ry: 2.2 },
      { x: 44, y: 97, rx: 3, ry: 2 }, { x: 49.5, y: 97, rx: 2, ry: 1.6 },
      { x: 104, y: 10, rx: 3, ry: 2.5 }, { x: 30, y: 60, rx: 2.5, ry: 2 }, { x: 86, y: 66, rx: 3, ry: 2 },
    ],
    ice: [],
    water: [
      { x: 58, y: 10, rx: 5, ry: 4 }, { rect: [60, 13, 72, 14] }, { rect: [99, 14, 101, 30] }, { x: 99, y: 32, rx: 2.2, ry: 2.2 },
      { x: 70, y: 72, rx: 7, ry: 4 }, { x: 40, y: 64, rx: 3, ry: 2 },
    ],
    towns: {
      pallet: ["house:nw", "house:ne", "lab:se"], viridian: ["house:nw", "center:ne", "gym:sw", "mart:se"],
      pewter: ["museum:nw", "center:ne", "gym:sw", "house:se"], cerulean: ["house:nw", "center:ne", "gym:sw", "mart:se"],
      lavender: ["tower:nw", "center:ne", "house:se"], celadon: ["dept:nw", "mansion:ne", "gym:sw", "corner:se"],
      saffron: ["silph:nw", "dojo:ne", "gym:sw", "center:se"], vermilion: ["center:nw", "house:ne", "gym:sw", "mart:se"],
      fuchsia: ["house:nw", "center:ne", "gym:sw", "mart:se"], cinnabar: ["mansion:nw", "lab:ne", "gym:sw", "center:se"],
      indigo: ["plateau:n"], bill: ["cottage:ne"], power: ["plant:ne"], safari: ["gate:n"],
    },
    ship: { x: 72, y: 71 },
  },
  sevii: {
    w: 84, h: 60, coast: null,
    islands: [
      { x: 13, y: 20, rx: 6.5, ry: 15.5 }, { x: 32, y: 12, rx: 5.5, ry: 7.5 }, { x: 32, y: 35, rx: 7, ry: 5 }, { x: 25, y: 41, rx: 4.5, ry: 3.5 },
      { x: 52, y: 10, rx: 7.5, ry: 5.5 }, { x: 52, y: 32, rx: 6.5, ry: 6 }, { x: 70, y: 22, rx: 6.5, ry: 9 },
      { x: 70, y: 47, rx: 7.5, ry: 7 }, { x: 60, y: 54, rx: 3, ry: 2 },
    ],
    forests: [{ ellipse: { x: 25, y: 41, rx: 4, ry: 3 }, density: 0.85 }],
    mountains: [{ x: 15, y: 8, rx: 5, ry: 4.5 }, { x: 73, y: 15, rx: 2.5, ry: 2 }, { x: 60, y: 54, rx: 2, ry: 1.3 }],
    ice: [{ x: 57, y: 7, rx: 3, ry: 2.2 }],
    water: [{ x: 50, y: 35, rx: 1.6, ry: 1.2 }],
    towns: {
      s1: ["house:nw", "center:ne"], s2: ["house:nw", "center:ne"], s3: ["house:nw", "center:ne"], s4: ["daycare:nw", "center:ne"],
      s5: ["center:ne", "warehouse:sw"], s6: ["house:nw", "center:ne"], s7: ["ttower:nw", "center:ne"],
    },
  },
};

/* ---------- routes as polylines ---------- */
// Tile point -> world pixel at the centre of the 2x2 block that starts there.
export const tp = (x, y) => [(x + 1) * TILE, (y + 1) * TILE];

function orthoPoints(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i];
    if (ax !== bx && ay !== by) out.push([bx, ay]);
    out.push([bx, by]);
  }
  return out;
}

export function routesFor(region) {
  const ids = new Set(SPOTS.filter((s) => s.region === region).map((s) => s.id));
  const byId = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
  return ROUTES.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b, o = {}]) => {
    const pts = orthoPoints([[byId[a].x, byId[a].y], ...(o.via || []), [byId[b].x, byId[b].y]]);
    return { a, b, surf: !!o.surf, pts };
  });
}

/* ---------- generation ---------- */
function generate(region) {
  const D = DESIGNS[region];
  const { w, h } = D;
  const t = new Uint8Array(w * h);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? W_ : t[y * w + x]);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) t[y * w + x] = v; };
  const forEachIn = (shape, fn) => {
    if (shape.rect) { const [x0, y0, x1, y1] = shape.rect; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y); return; }
    const e = shape.ellipse || shape;
    for (let y = Math.floor(e.y - e.ry - 1); y <= e.y + e.ry + 1; y++)
      for (let x = Math.floor(e.x - e.rx - 1); x <= e.x + e.rx + 1; x++) {
        const jx = (noise(x, y, 3, 7) - 0.5) * 0.9, jy = (noise(x, y, 3, 9) - 0.5) * 0.9;
        if (inEllipse(x + 0.5 + jx, y + 0.5 + jy, e)) fn(x, y);
      }
  };

  // 1. land
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let land = false;
    if (D.coast) {
      const jx = (noise(x, y, 4, 1) - 0.5) * 3, jy = (noise(x, y, 4, 2) - 0.5) * 3;
      land = inPoly(x + 0.5 + jx, y + 0.5 + jy, D.coast);
    }
    if (land) set(x, y, GRASS);
  }
  for (const isl of D.islands) forEachIn(isl, (x, y) => set(x, y, GRASS));

  // 2. trees: scattered woods, dense forests, the safari zone
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (at(x, y) === GRASS && noise(x, y, 5, 3) > 0.6 && hash(x, y, 4) > 0.25) set(x, y, TREE);
  for (const f of D.forests) forEachIn(f, (x, y) => { if (at(x, y) !== W_ && hash(x, y, 5) < f.density) set(x, y, TREE); });
  if (D.safari) {
    forEachIn({ rect: D.safari.rect }, (x, y) => {
      if (at(x, y) === W_) return;
      const edge = x === D.safari.rect[0] || x === D.safari.rect[2] || y === D.safari.rect[1];
      set(x, y, edge ? TREE : noise(x, y, 3, 11) > 0.62 ? TREE : noise(x, y, 4, 12) > 0.35 ? TALL : GRASS);
    });
    forEachIn(D.safari.pond, (x, y) => set(x, y, W_));
  }

  // 3. mountains and ice
  for (const m of D.mountains) forEachIn(m, (x, y) => set(x, y, MOUNT));
  for (const m of D.ice) forEachIn(m, (x, y) => set(x, y, ICE));

  // 4. towns: clear a floor around the buildings, ring it with trees
  const buildings = [];
  const townRects = [];
  const spots = SPOTS.filter((s) => s.region === region);
  for (const s of spots) {
    const tpl = D.towns[s.id];
    if (!tpl) continue;
    const cx = s.x, cy = s.y;
    let x0 = cx - 3, y0 = cy - 3, x1 = cx + 4, y1 = cy + 4;
    for (const entry of tpl) {
      const [type, q] = entry.split(":");
      const [bw, bh] = SIZES[type];
      let bx, by;
      if (q === "nw") { bx = cx - 1 - bw; by = cy - 1 - bh; }
      else if (q === "ne") { bx = cx + 3; by = cy - 1 - bh; }
      else if (q === "sw") { bx = cx - 1 - bw; by = cy + 3; }
      else if (q === "se") { bx = cx + 3; by = cy + 3; }
      else { bx = cx + 1 - Math.floor(bw / 2); by = cy - 1 - bh; }
      buildings.push({ type, x: bx, y: by, w: bw, h: bh, seed: hash(bx, by, 21) });
      x0 = Math.min(x0, bx - 1); y0 = Math.min(y0, by - 1); x1 = Math.max(x1, bx + bw); y1 = Math.max(y1, by + bh);
    }
    townRects.push([x0, y0, x1, y1]);
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      const ring = x < x0 || x > x1 || y < y0 || y > y1;
      if (ring) { if (at(x, y) === GRASS || at(x, y) === TALL) set(x, y, TREE); }
      else set(x, y, hash(x, y, 31) < 0.05 && (x === x0 || x === x1 || y === y1) ? FLOWER : TOWN);
    }
  }

  // 5. lakes, rivers, bays (cut after towns so harbours can bite into them)
  for (const wtr of D.water) forEachIn(wtr, (x, y) => set(x, y, W_));

  // 6. routes: sand paths on land, bridges over water, tunnels through rock, dotted lanes on the sea
  const routes = routesFor(region);
  const pathMask = new Uint8Array(w * h);
  for (const r of routes) {
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let k = 0; k <= n; k++) {
        const x = ax + Math.sign(bx - ax) * k, y = ay + Math.sign(by - ay) * k;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const X = x + dx, Y = y + dy, cur = at(X, Y);
          if (cur === MOUNT || cur === ICE) continue;
          if (cur === W_) { if (!r.surf) { set(X, Y, BRIDGE); pathMask[Y * w + X] = 1; } continue; }
          if (cur !== BRIDGE) set(X, Y, PATH);
          pathMask[Y * w + X] = 1;
        }
      }
    }
  }
  // clear a verge beside paths, then sprinkle tall grass further out
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!pathMask[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === TREE) set(x + dx, y + dy, GRASS);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== GRASS) continue;
    let near = false;
    for (let dy = -4; dy <= 4 && !near; dy++) for (let dx = -4; dx <= 4; dx++) if (pathMask[(y + dy) * w + (x + dx)] && Math.abs(dx) + Math.abs(dy) >= 2) { near = true; break; }
    if (near && noise(x, y, 3, 13) > 0.58) set(x, y, TALL);
    else if (hash(x, y, 14) < 0.012) set(x, y, FLOWER);
  }

  return { region, w, h, t, at, buildings, townRects, routes, spots, ferry: FERRY[region], ship: D.ship };
}

/* ---------- painting ---------- */
const PAL = {
  grass: "#7cc85c", grassD: "#5aa848", grassL: "#a6e27a",
  tall: "#5cb04a", tallD: "#2f7d38", tallL: "#93d86c",
  path: "#ecdca4", pathD: "#d4c088", pathE: "#c4ac6c",
  town: "#efe6c6", townD: "#e0d4aa",
  rock: "#c09a68", rockD: "#9c7848", rockL: "#dcc090", cliff: "#8a6438", cliffD: "#624424",
  ice: "#cfe6f4", iceD: "#98bcd8", iceL: "#f4fbff", iceC: "#7fa6c8", iceCD: "#5b84aa",
  sand: "#f2e2a8", sandD: "#d8c080", foam: "#e8f4ff",
  plank: "#b88850", plankD: "#86602e",
};

const TREE_ROWS = [
  ".....kkkkkk.....",
  "...kkggggggkk...",
  "..kgglllgggggk..",
  ".kgglllggggGGgk.",
  ".kglllggggGGggk.",
  "kgggggggGGgggGgk",
  "kggggggGGgggGGgk",
  "kGggggGGgggGGggk",
  "kGGgggggggGGgGGk",
  ".kGGggggGGggGGk.",
  ".kkGGGGGGGGGGkk.",
  "..kkkGGGGGGkkk..",
  "....kkkttkkk....",
  "......kttk......",
  "......kttk......",
  "......kkkk......",
];
const TREE_PAL = { k: "#1f5530", g: "#3f9e4c", G: "#2c7a3a", l: "#72cc62", t: "#7a5030" };
let treeImg = null;

function tileCanvas(fn) {
  const c = document.createElement("canvas");
  c.width = c.height = TILE;
  fn(c.getContext("2d"));
  return c;
}

// Pre-rendered tile variants so the big map paints with fast drawImage calls.
function makeAtlas() {
  const A = {};
  const variants = (n, fn) => Array.from({ length: n }, (_, v) => tileCanvas((g) => fn(g, v)));
  A[GRASS] = variants(4, (g, v) => {
    g.fillStyle = PAL.grass; g.fillRect(0, 0, 16, 16);
    const tufts = [[3, 4], [10, 11], [11, 3], [4, 12]].slice(0, 1 + v);
    g.fillStyle = PAL.grassD;
    for (const [x, y] of tufts) { g.fillRect(x, y, 1, 2); g.fillRect(x + 2, y, 1, 2); g.fillRect(x + 1, y + 1, 1, 2); }
    if (v % 2) { g.fillStyle = PAL.grassL; g.fillRect(7 + v, 7, 1, 1); g.fillRect(2, 9, 1, 1); }
  });
  A[TALL] = variants(2, (g, v) => {
    g.fillStyle = PAL.tall; g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 4; i++) {
      const x = 1 + (i % 2) * 8 + (v && i > 1 ? 1 : 0), y = 2 + Math.floor(i / 2) * 8;
      g.fillStyle = PAL.tallD;
      g.fillRect(x, y + 1, 1, 4); g.fillRect(x + 2, y, 1, 5); g.fillRect(x + 4, y + 1, 1, 4); g.fillRect(x + 1, y + 4, 4, 1);
      g.fillStyle = PAL.tallL; g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y + 1, 1, 1); g.fillRect(x + 4, y + 1, 1, 1);
    }
  });
  A[PATH] = variants(3, (g, v) => {
    g.fillStyle = PAL.path; g.fillRect(0, 0, 16, 16);
    g.fillStyle = PAL.pathD;
    [[2, 3], [9, 6], [5, 12], [13, 13], [12, 2]].slice(v, v + 3).forEach(([x, y]) => g.fillRect(x, y, 2, 1));
  });
  A[TOWN] = variants(2, (g, v) => {
    g.fillStyle = PAL.town; g.fillRect(0, 0, 16, 16);
    g.fillStyle = PAL.townD; g.fillRect(0, 15, 16, 1); g.fillRect(v ? 7 : 15, 0, 1, 16);
  });
  A[FLOWER] = variants(2, (g, v) => {
    g.fillStyle = PAL.grass; g.fillRect(0, 0, 16, 16);
    const petal = v ? "#f8f0f0" : "#f06070";
    for (const [x, y] of [[3, 3], [10, 9]]) {
      g.fillStyle = petal; g.fillRect(x, y - 1, 2, 1); g.fillRect(x - 1, y, 1, 2); g.fillRect(x + 2, y, 1, 2); g.fillRect(x, y + 2, 2, 1);
      g.fillStyle = "#f8d040"; g.fillRect(x, y, 2, 2);
    }
  });
  A[MOUNT] = variants(3, (g, v) => {
    g.fillStyle = PAL.rock; g.fillRect(0, 0, 16, 16);
    g.fillStyle = PAL.rockD;
    for (let i = 0; i < 3; i++) g.fillRect((i * 5 + v * 3) % 14, 3 + i * 5, 5, 1);
    g.fillStyle = PAL.rockL; g.fillRect((v * 7 + 4) % 13, 1 + v * 3, 3, 1); g.fillRect((v * 5 + 9) % 13, 10, 2, 1);
  });
  A[ICE] = variants(2, (g, v) => {
    g.fillStyle = PAL.ice; g.fillRect(0, 0, 16, 16);
    g.fillStyle = PAL.iceD; g.fillRect(2 + v * 5, 4, 5, 1); g.fillRect(8 - v * 4, 11, 6, 1);
    g.fillStyle = PAL.iceL; g.fillRect(4, 2, 2, 1); g.fillRect(11, 8, 2, 1);
  });
  A[BRIDGE] = variants(1, (g) => {
    g.fillStyle = PAL.plank; g.fillRect(0, 0, 16, 16);
    g.fillStyle = PAL.plankD; for (let y = 3; y < 16; y += 4) g.fillRect(0, y, 16, 1);
  });
  treeImg = [toCanvas(TREE_ROWS, TREE_PAL), toCanvas(TREE_ROWS, { ...TREE_PAL, g: "#48a854", l: "#86d670" }, 1, true)];
  return A;
}

function paintBuilding(g, b) {
  const X = b.x * TILE, Y = b.y * TILE, Wp = b.w * TILE, Hp = b.h * TILE;
  const tall = ["tower", "silph", "dept", "ttower"].includes(b.type);
  const roofH = tall ? 12 : (b.h - 1) * TILE - 2;
  const roofs = {
    house: ["#d86048", "#4c90d0", "#5aa860"][Math.floor(b.seed * 3)], center: "#e04848", mart: "#4878d0", gym: "#8890a8",
    lab: "#a8b0c0", museum: "#a07850", tower: "#8060a8", silph: "#7888a0", dept: "#d8a040", mansion: "#705878",
    corner: "#e8a020", dojo: "#6a4a30", plateau: "#c83838", cottage: "#58a060", plant: "#7a8090", gate: "#6a9a58",
    daycare: "#f0a0b0", ttower: "#6a7488", warehouse: "#8a7a6a",
  };
  const roof = roofs[b.type] || "#d86048";
  const wall = b.type === "plant" || b.type === "warehouse" ? "#b8bcc4" : b.type === "dojo" ? "#d8b888" : "#f4ecd8";
  // shadow
  g.fillStyle = "rgba(20,40,20,.25)"; g.fillRect(X + 3, Y + Hp - 2, Wp, 4);
  // walls
  g.fillStyle = "#1e2230"; g.fillRect(X, Y + roofH - 2, Wp, Hp - roofH + 2);
  g.fillStyle = wall; g.fillRect(X + 1, Y + roofH, Wp - 2, Hp - roofH - 1);
  // windows
  g.fillStyle = "#1e2230";
  if (tall) {
    for (let wy = Y + roofH + 4; wy < Y + Hp - 16; wy += 9)
      for (let wx = X + 5; wx < X + Wp - 8; wx += 9) { g.fillRect(wx, wy, 6, 6); g.fillStyle = "#a8d8f8"; g.fillRect(wx + 1, wy + 1, 4, 4); g.fillStyle = "#1e2230"; }
  } else {
    for (const wx of [X + 6, X + Wp - 14]) { g.fillRect(wx, Y + Hp - 13, 8, 7); g.fillStyle = "#a8d8f8"; g.fillRect(wx + 1, Y + Hp - 12, 6, 5); g.fillStyle = "#f8fcff"; g.fillRect(wx + 1, Y + Hp - 12, 2, 2); g.fillStyle = "#1e2230"; }
  }
  // door
  const dx = X + Math.floor(Wp / 2) - 5;
  g.fillStyle = "#1e2230"; g.fillRect(dx, Y + Hp - 14, 10, 13);
  g.fillStyle = b.type === "center" || b.type === "mart" ? "#9ad0f0" : "#7a5234"; g.fillRect(dx + 1, Y + Hp - 13, 8, 12);
  // roof with shingle lines and a dark eave
  g.fillStyle = "#1e2230"; g.fillRect(X - 2, Y, Wp + 4, roofH);
  g.fillStyle = roof; g.fillRect(X - 1, Y + 1, Wp + 2, roofH - 3);
  g.fillStyle = "rgba(0,0,0,.18)"; for (let ry = Y + 5; ry < Y + roofH - 3; ry += 5) g.fillRect(X - 1, ry, Wp + 2, 1);
  g.fillStyle = "rgba(255,255,255,.28)"; g.fillRect(X - 1, Y + 1, Wp + 2, 2);
  // signs and emblems
  const sx = X + Math.floor(Wp / 2);
  if (b.type === "center") { g.fillStyle = "#f8f8f8"; g.fillRect(sx - 6, Y + roofH - 12, 12, 9); g.fillStyle = "#e04848"; g.fillRect(sx - 4, Y + roofH - 10, 3, 3); g.fillRect(sx + 1, Y + roofH - 10, 3, 3); g.fillRect(sx - 3, Y + roofH - 8, 6, 2); g.fillRect(sx - 1, Y + roofH - 6, 2, 1); }
  if (b.type === "mart") { g.fillStyle = "#f8f8f8"; g.fillRect(sx - 6, Y + roofH - 12, 12, 9); g.fillStyle = "#4878d0"; g.fillRect(sx - 3, Y + roofH - 9, 6, 5); g.fillRect(sx - 2, Y + roofH - 11, 4, 1); }
  if (b.type === "gym" || b.type === "plateau") { g.fillStyle = "#1e2230"; g.fillRect(sx - 5, Y + 4, 10, 10); g.fillStyle = "#f8c030"; g.fillRect(sx - 4, Y + 5, 8, 8); g.fillStyle = "#fff4c0"; g.fillRect(sx - 2, Y + 7, 3, 3); }
  if (b.type === "plant") { g.fillStyle = "#f8c030"; for (let i = 0; i < Wp; i += 8) g.fillRect(X + i, Y + roofH - 6, 4, 3); }
  if (b.type === "corner") { const cols = ["#f06070", "#f8d040", "#60c0f0", "#80e070"]; for (let i = 0; i < 6; i++) { g.fillStyle = cols[i % 4]; g.fillRect(X + 4 + i * 12, Y + roofH + 2, 3, 3); } }
  if (b.type === "tower") { g.fillStyle = "#1e2230"; g.fillRect(sx - 1, Y - 6, 2, 7); }
}

function paintShip(g, s) {
  const X = s.x * TILE, Y = s.y * TILE;
  g.fillStyle = "rgba(10,30,70,.3)"; g.fillRect(X + 4, Y + 30, 92, 6);
  g.fillStyle = "#1e2230"; g.fillRect(X, Y + 10, 96, 24);
  g.fillStyle = "#f8f8f0"; g.fillRect(X + 2, Y + 12, 92, 12);
  g.fillStyle = "#2c3a78"; g.fillRect(X + 2, Y + 24, 92, 8);
  g.fillStyle = "#1e2230"; g.fillRect(X + 22, Y, 40, 12);
  g.fillStyle = "#f8f8f0"; g.fillRect(X + 24, Y + 2, 36, 10);
  g.fillStyle = "#1e2230"; for (let i = 0; i < 8; i++) g.fillRect(X + 8 + i * 11, Y + 16, 4, 4);
  g.fillStyle = "#e8452c"; g.fillRect(X + 66, Y - 4, 10, 16); g.fillStyle = "#1e2230"; g.fillRect(X + 66, Y - 6, 10, 3);
}

// Paint the static layer: everything except the animated water, which the map draws underneath.
export function paintWorld(world) {
  const { w, h, at } = world;
  const cv = document.createElement("canvas");
  cv.width = w * TILE; cv.height = h * TILE;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  const A = makeAtlas();
  const isWater = (x, y) => at(x, y) === W_;
  const isRock = (v) => v === MOUNT || v === ICE;
  const trees = [];

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = at(x, y);
    if (v === W_) continue;
    const X = x * TILE, Y = y * TILE;
    const hv = hash(x, y, 40);
    if (v === TREE) { g.drawImage(A[GRASS][0], X, Y); trees.push([X, Y, hv]); continue; }
    const set = A[v];
    g.drawImage(set[Math.floor(hv * set.length)], X, Y);
    if (v === PATH) {
      g.fillStyle = PAL.pathE;
      const soft = (n) => n === PATH || n === TOWN || n === BRIDGE || isRock(n);
      if (!soft(at(x, y - 1))) g.fillRect(X, Y, 16, 1);
      if (!soft(at(x, y + 1))) g.fillRect(X, Y + 15, 16, 1);
      if (!soft(at(x - 1, y))) g.fillRect(X, Y, 1, 16);
      if (!soft(at(x + 1, y))) g.fillRect(X + 15, Y, 1, 16);
    }
    if (isRock(v)) {
      const ice = v === ICE;
      if (!isRock(at(x, y + 1))) {
        g.fillStyle = ice ? PAL.iceC : PAL.cliff; g.fillRect(X, Y + 9, 16, 7);
        g.fillStyle = ice ? PAL.iceCD : PAL.cliffD; for (let i = 1; i < 16; i += 4) g.fillRect(X + i, Y + 10, 1, 6);
        g.fillRect(X, Y + 9, 16, 1);
      }
      if (!isRock(at(x, y - 1))) { g.fillStyle = ice ? PAL.iceL : PAL.rockL; g.fillRect(X, Y, 16, 2); }
      g.fillStyle = ice ? PAL.iceD : PAL.rockD;
      if (!isRock(at(x - 1, y))) g.fillRect(X, Y, 2, 16);
      if (!isRock(at(x + 1, y))) g.fillRect(X + 14, Y, 2, 16);
    }
    if (v === BRIDGE) {
      g.fillStyle = PAL.plankD;
      if (isWater(x - 1, y)) g.fillRect(X, Y, 2, 16);
      if (isWater(x + 1, y)) g.fillRect(X + 14, Y, 2, 16);
      if (isWater(x, y - 1)) g.fillRect(X, Y, 16, 2);
      if (isWater(x, y + 1)) g.fillRect(X, Y + 14, 16, 2);
    }
    // beaches: a sand lip on land, foam on the water side
    if (v !== BRIDGE && !isRock(v)) {
      g.fillStyle = PAL.sand;
      if (isWater(x, y + 1)) { g.fillRect(X, Y + 12, 16, 4); g.fillStyle = PAL.sandD; g.fillRect(X, Y + 12, 16, 1); g.fillStyle = PAL.sand; }
      if (isWater(x, y - 1)) g.fillRect(X, Y, 16, 3);
      if (isWater(x - 1, y)) g.fillRect(X, Y, 3, 16);
      if (isWater(x + 1, y)) g.fillRect(X + 13, Y, 3, 16);
    }
  }
  // foam lines on water tiles that touch land
  g.fillStyle = PAL.foam;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isWater(x, y)) continue;
    const X = x * TILE, Y = y * TILE;
    if (!isWater(x, y - 1)) g.fillRect(X, Y, 16, 2);
    if (!isWater(x, y + 1)) g.fillRect(X, Y + 14, 16, 2);
    if (!isWater(x - 1, y)) g.fillRect(X, Y, 2, 16);
    if (!isWater(x + 1, y)) g.fillRect(X + 14, Y, 2, 16);
  }
  // surf lanes: dotted line along the route centre wherever it crosses water
  g.fillStyle = "rgba(240,248,255,.85)";
  for (const r of world.routes) {
    if (!r.surf) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = tp(...r.pts[i - 1]), [bx, by] = tp(...r.pts[i]);
      const len = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d <= len; d += 7) {
        const px = ax + ((bx - ax) * d) / len, py = ay + ((by - ay) * d) / len;
        if (isWater(Math.floor(px / TILE), Math.floor(py / TILE)) && isWater(Math.floor((px - 1) / TILE), Math.floor((py - 1) / TILE))) g.fillRect(px - 1, py - 1, 3, 3);
      }
    }
  }
  // pier at the ferry dock
  if (world.ferry) {
    const fx = world.ferry.x * TILE, fy = world.ferry.y * TILE;
    g.fillStyle = PAL.plankD; g.fillRect(fx + 4, fy, 24, 44);
    g.fillStyle = PAL.plank; g.fillRect(fx + 6, fy, 20, 42);
    g.fillStyle = PAL.plankD; for (let yy = fy + 5; yy < fy + 42; yy += 6) g.fillRect(fx + 6, yy, 20, 1);
  }
  if (world.ship) paintShip(g, world.ship);
  // trees last, so canopies overlap neatly row by row
  for (const [X, Y, hv] of trees) g.drawImage(treeImg[hv < 0.5 ? 0 : 1], X, Y);
  world.buildings.sort((a, b) => a.y - b.y).forEach((b) => paintBuilding(g, b));
  // cave mouths on the rock face above each cave-type spot
  for (const s of world.spots) {
    if (!(s.kind === "cave" || s.kind === "legend")) continue;
    let ty = s.y;
    while (ty > s.y - 2 && !isRock(at(s.x, ty))) ty--;
    if (!isRock(at(s.x, ty))) continue;
    const X = s.x * TILE + 4, Y = ty * TILE + 2;
    g.fillStyle = "#1e2230"; g.fillRect(X + 4, Y, 16, 4); g.fillRect(X, Y + 4, 24, 12);
    g.fillStyle = "#0b0d14"; g.fillRect(X + 3, Y + 5, 18, 11); g.fillRect(X + 6, Y + 2, 12, 3);
  }
  return cv;
}

/* ---------- animated water tile ---------- */
export function waterFrames() {
  return Array.from({ length: 4 }, (_, f) => tileCanvas((g) => {
    g.fillStyle = "#4c88e0"; g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#4079d2"; g.fillRect(0, 6, 16, 2); g.fillRect(0, 14, 16, 1);
    g.fillStyle = "#9cc6fa";
    const o = f * 2;
    g.fillRect((2 + o) % 16, 3, 4, 1); g.fillRect((1 + o) % 16, 4, 1, 1); g.fillRect((6 + o) % 16, 4, 1, 1);
    g.fillRect((10 + 16 - o) % 16, 11, 4, 1); g.fillRect((9 + 16 - o) % 16, 12, 1, 1); g.fillRect((14 + 16 - o) % 16, 12, 1, 1);
  }));
}

const cache = {};
export function getWorld(region) {
  if (!cache[region]) {
    const world = generate(region);
    world.land = paintWorld(world);
    cache[region] = world;
  }
  return cache[region];
}
