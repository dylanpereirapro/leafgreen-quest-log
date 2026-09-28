// Interactive map: camera, pinch/pan with momentum, fog of war, markers, walking trainer.
import { SPOTS, FERRY, COLLECTION } from "./data.js";
import { S, save, byId, isRevealed, nextQuest, questsAt, isDone, trainerSpot, progressN } from "./state.js";
import { getWorld, waterFrames, tp, TILE } from "./world.js";
import { trainerFrames, icon } from "./art.js";
import { sfx } from "./audio.js";

const FOG_R = 12; // tiles of clear sky around a reached spot
const FOG_PAD = 40; // fog continues this many tiles past the map edge
const ease = (t) => 1 - Math.pow(1 - t, 3);

export class MapView {
  constructor(canvas, hooks) {
    this.cv = canvas;
    this.g = canvas.getContext("2d");
    this.hooks = hooks; // { onSpot(spot), onFerry(), onEmpty(), reducedMotion() }
    this.region = trainerSpot().region;
    this.cam = { x: 0, y: 0, z: 1 };
    this.vel = { x: 0, y: 0 };
    this.pointers = new Map();
    this.running = false;
    this.anim = null; // camera fly-to
    this.walk = null; // trainer walk
    this.reveal = {}; // spotId -> progress 0..1
    this.fogDirty = true;
    this.water = waterFrames();
    this.frames = trainerFrames();
    this.trainer = { region: this.region, x: 0, y: 0, dir: "down", dist: 0 };
    this.placeTrainer();
    this.bindInput();
    this.fog = document.createElement("canvas");
  }

  get world() { return getWorld(this.region); }

  /* ---------- lifecycle ---------- */
  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.syncReveals();
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(50, now - this.last);
      this.last = now;
      this.update(dt, now);
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.vw = Math.max(1, r.width); this.vh = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cv.width = Math.round(this.vw * this.dpr);
    this.cv.height = Math.round(this.vh * this.dpr);
    const W = this.world.w * TILE, H = this.world.h * TILE;
    this.zMin = Math.min(this.vw / W, this.vh / H) * 0.98;
    this.zMax = 4;
    // first show, or the screen width changed a lot (fold/unfold): reset to a comfortable zoom
    const jump = this.lastVw && Math.abs(this.vw - this.lastVw) / this.lastVw > 0.3;
    this.lastVw = this.vw;
    if (jump) this.cam.z = this.vw / (34 * TILE);
    if (!this.sized) {
      this.sized = true;
      this.cam.z = Math.max(this.zMin, Math.min(this.zMax, this.vw / (34 * TILE)));
      this.cam.x = this.trainer.x; this.cam.y = this.trainer.y;
    }
    this.cam.z = Math.max(this.zMin, Math.min(this.zMax, this.cam.z));
    this.clamp();
  }

  setRegion(region, { center = true } = {}) {
    this.region = region;
    this.fogDirty = true;
    this.walk = null;
    this.vel = { x: 0, y: 0 };
    if (this.running) this.resize();
    this.syncReveals();
    if (center) {
      const target = this.trainer.region === region ? this.trainer : this.ferryPos();
      this.cam.x = target.x; this.cam.y = target.y;
      this.cam.z = Math.max(this.zMin, Math.min(this.zMax, this.vw / (26 * TILE)));
      this.clamp();
    }
  }

  ferryPos() { const f = FERRY[this.region]; const [x, y] = tp(f.x, f.y); return { x, y }; }
  seviiOpen() { return progressN() >= 17; }

  /* ---------- trainer ---------- */
  placeTrainer() {
    const s = trainerSpot();
    const [x, y] = tp(s.x, s.y);
    Object.assign(this.trainer, { region: s.region, x, y, dir: "down", dist: 0 });
  }

  // Called after a quest completes. Walks the trainer along routes to the new quest spot.
  walkToCurrent() {
    const to = trainerSpot();
    const fromId = this.trainerAt || to.id;
    this.trainerAt = to.id;
    if (!this.running || this.hooks.reducedMotion() || to.region !== this.trainer.region || fromId === to.id) {
      const crossing = to.region !== this.trainer.region;
      this.placeTrainer();
      if (this.running && crossing) this.hooks.onCrossRegion?.(to.region);
      else if (this.running) this.flyTo(this.trainer.x, this.trainer.y);
      return;
    }
    const path = this.findPath(fromId, to.id);
    if (!path) { this.placeTrainer(); this.flyTo(this.trainer.x, this.trainer.y); return; }
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const speed = Math.max(9 * TILE, len / 4.5) / 1000; // px per ms, capped at about 4.5 s per walk
    this.walk = { path, i: 1, speed, len };
    this.trainer.x = path[0][0]; this.trainer.y = path[0][1];
  }

  findPath(a, b) {
    const routes = this.world.routes;
    const dist = { [a]: 0 }, prev = {}, todo = new Set([a]);
    const segLen = (r) => r.pts.reduce((s, p, i) => (i ? s + Math.abs(p[0] - r.pts[i - 1][0]) + Math.abs(p[1] - r.pts[i - 1][1]) : 0), 0);
    while (todo.size) {
      let u = null;
      for (const n of todo) if (u === null || dist[n] < dist[u]) u = n;
      todo.delete(u);
      if (u === b) break;
      for (const r of routes) {
        if (r.a !== u && r.b !== u) continue;
        const v = r.a === u ? r.b : r.a;
        const d = dist[u] + segLen(r);
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = { u, r }; todo.add(v); }
      }
    }
    if (dist[b] === undefined) return null;
    const pts = [];
    let cur = b;
    while (cur !== a) {
      const { u, r } = prev[cur];
      const seg = (r.a === u ? r.pts : [...r.pts].reverse()).map((p) => tp(p[0], p[1]));
      pts.unshift(...(pts.length ? seg.slice(0, -1) : seg));
      cur = u;
    }
    return pts;
  }

  /* ---------- fog ---------- */
  syncReveals() {
    for (const id in this.reveal) if (!isRevealed(byId[id])) delete this.reveal[id];
    this.fogDirty = true;
    if (!this.running) return; // reveals play the next time the map is on screen
    const seen = new Set(S.seen);
    let changed = false;
    for (const s of this.world.spots) {
      if (!isRevealed(s) || this.reveal[s.id] !== undefined) continue;
      const animate = !seen.has(s.id) && !this.hooks.reducedMotion();
      this.reveal[s.id] = animate ? 0 : 1;
      if (animate) this.revealAnimating = true;
      if (!seen.has(s.id)) { S.seen.push(s.id); changed = true; }
    }
    if (changed) save("seen");
  }

  drawFog() {
    const { w, h, routes } = this.world;
    const P = FOG_PAD, f = this.fog;
    if (f.width !== w + 2 * P || f.height !== h + 2 * P) { f.width = w + 2 * P; f.height = h + 2 * P; }
    const g = f.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, f.width, f.height);
    if (!nextQuest()) return; // story finished: the whole map is open
    g.fillStyle = "#0c1226";
    g.fillRect(0, 0, f.width, f.height);
    g.globalCompositeOperation = "destination-out";
    const hole = (x, y, r) => {
      if (r <= 0) return;
      const grd = g.createRadialGradient(x + P, y + P, r * 0.45, x + P, y + P, r);
      grd.addColorStop(0, "rgba(0,0,0,1)"); grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x + P, y + P, r, 0, Math.PI * 2); g.fill();
    };
    const rv = (id) => ease(Math.min(1, this.reveal[id] ?? 0));
    for (const s of this.world.spots) if (this.reveal[s.id] !== undefined) hole(s.x + 1, s.y + 1, FOG_R * rv(s.id));
    for (const r of routes) {
      const p = Math.min(rv(r.a), rv(r.b));
      if (p <= 0) continue;
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= n; k += 2) hole(ax + 1 + Math.sign(bx - ax) * k, ay + 1 + Math.sign(by - ay) * k, 8 * p);
      }
    }
    g.globalCompositeOperation = "source-over";
  }

  /* ---------- camera ---------- */
  clamp() {
    const W = this.world.w * TILE, H = this.world.h * TILE, z = this.cam.z;
    const hw = this.vw / 2 / z, hh = this.vh / 2 / z, m = 60 / z;
    this.cam.x = W < hw * 2 ? W / 2 : Math.max(hw - m, Math.min(W - hw + m, this.cam.x));
    this.cam.y = H < hh * 2 ? H / 2 : Math.max(hh - m, Math.min(H - hh + m, this.cam.y));
  }
  flyTo(x, y, z = this.cam.z) {
    if (this.hooks.reducedMotion()) { Object.assign(this.cam, { x, y, z }); this.clamp(); return; }
    this.anim = { from: { ...this.cam }, to: { x, y, z: Math.max(this.zMin, Math.min(this.zMax, z)) }, t: 0, dur: 650 };
  }
  centerOnMe() {
    if (this.trainer.region !== this.region) { this.hooks.onCrossRegion?.(this.trainer.region, true); return; }
    this.flyTo(this.trainer.x, this.trainer.y, Math.max(this.cam.z, this.vw / (22 * TILE)));
  }
  focusSpot(id) {
    const s = byId[id];
    if (s.region !== this.region) this.setRegion(s.region, { center: false });
    const [x, y] = tp(s.x, s.y);
    this.flyTo(x, y, Math.max(this.cam.z, this.vw / (24 * TILE)));
  }
  zoomBy(f, sx = this.vw / 2, sy = this.vh / 2) {
    const z0 = this.cam.z, z = Math.max(this.zMin, Math.min(this.zMax, z0 * f));
    const wx = this.cam.x + (sx - this.vw / 2) / z0, wy = this.cam.y + (sy - this.vh / 2) / z0;
    this.cam.z = z;
    this.cam.x = wx - (sx - this.vw / 2) / z; this.cam.y = wy - (sy - this.vh / 2) / z;
    this.clamp();
  }
  toScreen(wx, wy) { return [(wx - this.cam.x) * this.cam.z + this.vw / 2, (wy - this.cam.y) * this.cam.z + this.vh / 2]; }

  /* ---------- input ---------- */
  bindInput() {
    const cv = this.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now() });
      this.vel = { x: 0, y: 0 }; this.anim = null; this.samples = [];
      if (this.pointers.size === 2) this.startPinch();
    });
    cv.addEventListener("pointermove", (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const [x, y] = pos(e);
      if (this.pointers.size === 1) {
        const dx = x - p.x, dy = y - p.y;
        this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z;
        this.clamp();
        const now = performance.now();
        this.samples.push({ dx, dy, t: now });
        while (this.samples.length && now - this.samples[0].t > 90) this.samples.shift();
        if (Math.hypot(x - p.sx, y - p.sy) > 8) p.moved = true;
      }
      p.x = x; p.y = y;
      if (this.pointers.size === 2) this.movePinch();
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.pinched = true; return; }
      if (this.pointers.size === 0) {
        if (!p.moved && !this.pinched && performance.now() - p.t < 400) this.tap(p.x, p.y);
        else if (this.samples?.length && !this.hooks.reducedMotion()) {
          const span = Math.max(16, performance.now() - this.samples[0].t);
          const sx = this.samples.reduce((a, s) => a + s.dx, 0), sy = this.samples.reduce((a, s) => a + s.dy, 0);
          this.vel = { x: sx / span, y: sy / span };
        }
        this.pinched = false;
      }
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = pos(e); this.zoomBy(Math.exp(-e.deltaY * 0.0015), x, y); }, { passive: false });
    cv.addEventListener("keydown", (e) => {
      const step = 60 / this.cam.z;
      const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (k) { this.cam.x += k[0]; this.cam.y += k[1]; this.clamp(); e.preventDefault(); }
      if (e.key === "+" || e.key === "=") this.zoomBy(1.25);
      if (e.key === "-") this.zoomBy(0.8);
    });
  }
  startPinch() {
    const [a, b] = [...this.pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: this.cam.z, wx: this.cam.x + (mx - this.vw / 2) / this.cam.z, wy: this.cam.y + (my - this.vh / 2) / this.cam.z };
  }
  movePinch() {
    const [a, b] = [...this.pointers.values()];
    const P = this.pinch;
    if (!P) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    this.cam.z = Math.max(this.zMin, Math.min(this.zMax, P.z0 * (d / P.d0)));
    this.cam.x = P.wx - (mx - this.vw / 2) / this.cam.z;
    this.cam.y = P.wy - (my - this.vh / 2) / this.cam.z;
    this.clamp();
  }

  tap(x, y) {
    let best = null, bd = 30;
    for (const m of this.markers || []) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return this.hooks.onEmpty();
    sfx.blip();
    if (best.ferry) return this.hooks.onFerry();
    this.hooks.onSpot(best.spot, !best.fogged);
  }

  /* ---------- per-frame ---------- */
  update(dt, now) {
    const rm = this.hooks.reducedMotion();
    if (this.anim) {
      const A = this.anim;
      A.t += dt;
      const k = ease(Math.min(1, A.t / A.dur));
      this.cam.x = A.from.x + (A.to.x - A.from.x) * k;
      this.cam.y = A.from.y + (A.to.y - A.from.y) * k;
      this.cam.z = A.from.z + (A.to.z - A.from.z) * k;
      this.clamp();
      if (A.t >= A.dur) this.anim = null;
    }
    if (!this.pointers.size && (Math.abs(this.vel.x) > 0.01 || Math.abs(this.vel.y) > 0.01)) {
      this.cam.x -= (this.vel.x * dt) / this.cam.z; this.cam.y -= (this.vel.y * dt) / this.cam.z;
      const f = Math.exp(-dt / 325);
      this.vel.x *= f; this.vel.y *= f;
      this.clamp();
    }
    if (this.walk) {
      const W = this.walk, T = this.trainer;
      let move = W.speed * dt;
      while (move > 0 && W.i < W.path.length) {
        const [tx, ty] = W.path[W.i];
        const dx = tx - T.x, dy = ty - T.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy)) T.dir = dx > 0 ? "right" : "left"; else if (d > 0) T.dir = dy > 0 ? "down" : "up";
        if (d <= move) { T.x = tx; T.y = ty; move -= d; W.i++; T.dist += d; }
        else { T.x += (dx / d) * move; T.y += (dy / d) * move; T.dist += move; move = 0; }
      }
      if (Math.floor(T.dist / 16) !== W.lastStep) { W.lastStep = Math.floor(T.dist / 16); if (W.lastStep % 2 === 0) sfx.step(); }
      if (!this.pointers.size) {
        this.cam.x += (T.x - this.cam.x) * Math.min(1, dt / 180);
        this.cam.y += (T.y - this.cam.y) * Math.min(1, dt / 180);
        this.clamp();
      }
      if (W.i >= W.path.length) { this.walk = null; T.dir = "down"; T.dist = 0; this.hooks.onArrive?.(); }
    }
    if (this.revealAnimating) {
      let any = false;
      for (const id in this.reveal) if (this.reveal[id] < 1) { this.reveal[id] = Math.min(1, this.reveal[id] + dt / 1400); any = true; }
      this.revealAnimating = any;
      this.fogDirty = true;
    }
    if (rm) this.vel = { x: 0, y: 0 };
  }

  draw(now) {
    const g = this.g, { cam, dpr, vw, vh } = this;
    const world = this.world;
    const rm = this.hooks.reducedMotion();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#3a6cc0";
    g.fillRect(0, 0, vw, vh);
    // world-space layers
    const ox = vw / 2 - cam.x * cam.z, oy = vh / 2 - cam.y * cam.z;
    g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * ox, dpr * oy);
    const frame = rm ? 0 : Math.floor(now / 260) % 4;
    const pat = (this.pats ||= this.water.map((c) => g.createPattern(c, "repeat")))[frame];
    g.fillStyle = pat;
    const x0 = cam.x - vw / 2 / cam.z - 16, y0 = cam.y - vh / 2 / cam.z - 16;
    g.fillRect(Math.floor(x0 / 16) * 16, Math.floor(y0 / 16) * 16, vw / cam.z + 48, vh / cam.z + 48);
    g.drawImage(world.land, 0, 0);
    if (this.fogDirty) { this.drawFog(); this.fogDirty = false; }
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.6;
    g.drawImage(this.fog, -FOG_PAD * TILE, -FOG_PAD * TILE, this.fog.width * TILE, this.fog.height * TILE);
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = false;
    // screen-space layers
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawMarkers(g, now, rm);
    if (this.trainer.region === this.region) this.drawTrainer(g, now);
  }

  drawTrainer(g, now) {
    const T = this.trainer;
    // Idle: stand just right of the spot marker so both stay visible. Walking: on the route.
    const want = this.walk ? 0 : 26;
    this.trOff = (this.trOff ?? want) + (want - (this.trOff ?? want)) * 0.2;
    let [sx, sy] = this.toScreen(T.x, T.y);
    sx += this.trOff; sy += this.trOff * 0.3;
    const scale = Math.max(this.cam.z, 1.9);
    const size = 16 * scale;
    const walking = !!this.walk;
    const fi = walking ? Math.floor(T.dist / 7) % 4 : 0;
    const img = this.frames[T.dir][fi];
    g.fillStyle = "rgba(10,20,10,.3)";
    g.beginPath(); g.ellipse(sx, sy + size * 0.18, size * 0.32, size * 0.1, 0, 0, Math.PI * 2); g.fill();
    const tile = this.world.at(Math.floor(T.x / TILE), Math.floor(T.y / TILE));
    if (tile === 0) { // surfing: a little wake under the trainer
      g.fillStyle = "rgba(240,248,255,.8)";
      g.fillRect(sx - size * 0.45, sy + size * 0.1, size * 0.9, Math.max(2, scale));
    }
    g.drawImage(img, Math.round(sx - size / 2), Math.round(sy - size * 0.8), size, size);
  }

  spotFlags(s) {
    const qs = questsAt(s.id);
    const items = [], gifts = [];
    for (const sec of COLLECTION) for (const it of sec.items) {
      if (it[3] !== s.id || S.c[it[0]]) continue;
      if (sec.kind === "item") items.push(it); else if (sec.kind === "gift") gifts.push(it);
    }
    return { qs, items, gifts, done: qs.length > 0 && qs.every((q) => isDone(q.n)) };
  }

  drawMarkers(g, now, rm) {
    const markers = [];
    const F = S.filters;
    const nq = nextQuest();
    const z = this.cam.z;
    const showSmallLabels = z >= 0.85, showTownLabels = z >= 0.42;
    const bob = rm ? 0 : Math.sin(now / 180) * 3;
    g.font = "8px 'Press Start 2P', monospace";
    g.textAlign = "center";
    g.textBaseline = "top";
    for (const s of this.world.spots) {
      const [wx, wy] = tp(s.x, s.y);
      const [x, y] = this.toScreen(wx, wy);
      if (x < -60 || y < -60 || x > this.vw + 60 || y > this.vh + 60) continue;
      const fogged = this.reveal[s.id] === undefined;
      const fl = this.spotFlags(s);
      const isNext = nq && nq.spot === s.id;
      const cats = { story: fl.qs.length > 0 || ["town", "cave", "forest", "landmark"].includes(s.kind), legend: s.kind === "legend", items: fl.items.length > 0, gifts: fl.gifts.length > 0 };
      const visible = isNext || (F.story && cats.story) || (F.legend && cats.legend) || (F.items && cats.items) || (F.gifts && cats.gifts);
      if (!visible) continue;
      const S2 = 3;
      if (fogged) {
        const ic = icon("unknown", S2);
        g.globalAlpha = 0.85;
        g.drawImage(ic, x - ic.width / 2, y - ic.height / 2);
        g.globalAlpha = 1;
        markers.push({ spot: s, x, y, fogged: true });
        continue;
      }
      const kindIcon = s.kind === "legend" ? "legend" : s.kind === "cave" ? "cave" : s.kind === "forest" ? "forest" : s.kind === "landmark" ? "landmark" : "town";
      // plate behind the icon
      g.fillStyle = "#1e2230";
      g.fillRect(x - 16, y - 16, 32, 32);
      g.fillStyle = isNext ? "#fff4c0" : "#f8f8f0";
      g.fillRect(x - 14, y - 14, 28, 28);
      g.fillStyle = "#c8d0e0";
      g.fillRect(x - 14, y + 11, 28, 3);
      const ic = icon(kindIcon, S2);
      g.drawImage(ic, x - ic.width / 2, y - ic.height / 2 - 1);
      if (fl.done) { const c = icon("check", 2); g.drawImage(c, x + 6, y + 4); }
      if (F.items && fl.items.length) { const c = icon("item", 2); g.drawImage(c, x + 10, y - 22); }
      if (F.gifts && fl.gifts.length) { const c = icon("gift", 2); g.drawImage(c, x - 28, y - 22); }
      if (s.kind === "legend" && !(F.legend === false)) this.sparkle(g, x, y, now, rm);
      if (isNext) this.bang(g, x, y - 30 + bob);
      const label = s.kind === "town" ? showTownLabels : showSmallLabels;
      if (label || isNext) {
        const tw = g.measureText(s.name).width + 10;
        g.fillStyle = "rgba(20,26,44,.88)";
        g.fillRect(x - tw / 2, y + 19, tw, 14);
        g.fillStyle = isNext ? "#f8c030" : "#f8f8f0";
        g.fillText(s.name, x, y + 22);
      }
      markers.push({ spot: s, x, y });
    }
    // ferry
    if (FERRY[this.region]) {
      const [wx, wy] = tp(FERRY[this.region].x, FERRY[this.region].y);
      const [x, y] = this.toScreen(wx, wy + 18);
      const open = this.seviiOpen();
      g.globalAlpha = open ? 1 : 0.55;
      g.fillStyle = "#1e2230"; g.fillRect(x - 16, y - 16, 32, 32);
      g.fillStyle = open ? "#bfe0ff" : "#8a94ac"; g.fillRect(x - 14, y - 14, 28, 28);
      const ic = icon("ferry", 3);
      g.drawImage(ic, x - ic.width / 2, y - ic.height / 2 + (open && !rm ? Math.sin(now / 300) * 1.5 : 0));
      g.globalAlpha = 1;
      if (showTownLabels) {
        const label = this.region === "kanto" ? "FERRY" : "TO KANTO";
        const tw = g.measureText(label).width + 10;
        g.fillStyle = "rgba(20,26,44,.88)"; g.fillRect(x - tw / 2, y + 19, tw, 14);
        g.fillStyle = "#bfe0ff"; g.fillText(label, x, y + 22);
      }
      markers.push({ ferry: true, x, y });
    }
    this.markers = markers;
  }

  bang(g, x, y) {
    g.fillStyle = "#1e2230"; g.fillRect(x - 9, y - 11, 18, 20); g.fillRect(x - 3, y + 9, 6, 4);
    g.fillStyle = "#f8f8f0"; g.fillRect(x - 7, y - 9, 14, 16); g.fillRect(x - 1, y + 7, 2, 4);
    g.fillStyle = "#e8452c"; g.fillRect(x - 2, y - 7, 4, 8); g.fillRect(x - 2, y + 3, 4, 3);
  }

  sparkle(g, x, y, now, rm) {
    const pts = [[-20, -14, 0], [19, -6, 1.7], [-12, 16, 3.1]];
    for (const [dx, dy, ph] of pts) {
      const k = rm ? 0.8 : (Math.sin(now / 260 + ph) + 1) / 2;
      if (k < 0.25) continue;
      const s = Math.round(2 + k * 3);
      g.fillStyle = k > 0.7 ? "#fffbe0" : "#f8c030";
      g.fillRect(x + dx - 1, y + dy - s, 2, s * 2);
      g.fillRect(x + dx - s, y + dy - 1, s * 2, 2);
    }
  }
}
