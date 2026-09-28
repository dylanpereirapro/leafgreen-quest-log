// Chiptune sound effects, built live with the Web Audio API. All melodies are original.
import { S } from "./state.js";

let ctx = null, master = null, unlocked = false;

export const audioReady = () => unlocked;

// Browsers only allow sound after a tap, so audio stays silent until the first one.
export function unlockAudio() {
  if (unlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
    if (ctx.state === "suspended") ctx.resume();
    unlocked = true;
  } catch (e) { unlocked = false; }
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function note(midi, at, dur, { type = "square", vol = 1, slide = 0 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz(midi), t);
  if (slide) o.frequency.linearRampToValueAtTime(hz(midi + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// seq: [[midi, beats], ...] played back to back; null midi = rest.
function seq(list, beat, opts, start = 0) {
  let at = start;
  for (const [m, b] of list) { if (m != null) note(m, at, beat * b * 0.95, opts); at += beat * b; }
  return at;
}

function play(fn) {
  if (!unlocked || !S.sound || !ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  try { fn(); } catch (e) { /* audio is decoration; never break the app */ }
}

export const sfx = {
  blip: () => play(() => note(88, 0, 0.035, { vol: 0.5 })),
  confirm: () => play(() => { note(84, 0, 0.05, { vol: 0.6 }); note(91, 0.055, 0.08, { vol: 0.6 }); }),
  cancel: () => play(() => { note(79, 0, 0.05, { vol: 0.5 }); note(72, 0.055, 0.08, { vol: 0.5 }); }),
  check: () => play(() => { note(81, 0, 0.04, { type: "triangle", vol: 0.9 }); note(88, 0.045, 0.09, { type: "triangle", vol: 0.9 }); }),
  uncheck: () => play(() => note(76, 0, 0.07, { type: "triangle", vol: 0.8, slide: -5 })),
  text: () => play(() => note(93, 0, 0.012, { vol: 0.12 })),
  step: () => play(() => note(52, 0, 0.03, { type: "triangle", vol: 0.35 })),
  error: () => play(() => { note(55, 0, 0.09, { vol: 0.5 }); note(54, 0.1, 0.14, { vol: 0.5 }); }),
  sail: () => play(() => {
    seq([[67, 1], [72, 1], [76, 2], [74, 1], [72, 1], [79, 3]], 0.11, { type: "triangle", vol: 0.8 });
    seq([[48, 3], [43, 3], [48, 3]], 0.11, { type: "triangle", vol: 0.5 });
  }),
  // Quest complete: a bright rising fanfare with a bass line under it.
  quest: () => play(() => {
    const b = 0.085;
    seq([[72, 1], [76, 1], [79, 1], [84, 2], [null, 1], [81, 1], [84, 1], [88, 4]], b, { vol: 0.55 });
    seq([[64, 1], [67, 1], [72, 1], [76, 2], [null, 1], [77, 1], [79, 1], [84, 4]], b, { vol: 0.25, type: "square" });
    seq([[48, 2], [55, 2], [53, 2], [48, 6]], b, { type: "triangle", vol: 0.9 });
  }),
  // Badge get: faster, with a trill at the top.
  badge: () => play(() => {
    const b = 0.07;
    const end = seq([[74, 1], [78, 1], [81, 1], [86, 1], [85, 1], [86, 1], [85, 1], [86, 1], [90, 5]], b, { vol: 0.55 });
    seq([[62, 2], [66, 2], [69, 2], [74, 7]], b, { vol: 0.22 });
    seq([[50, 2], [57, 2], [55, 2], [50, 7]], b, { type: "triangle", vol: 0.9 });
    note(98, end - 0.05, 0.25, { type: "triangle", vol: 0.4 });
  }),
  sparkle: () => play(() => { note(96, 0, 0.05, { type: "triangle", vol: 0.4 }); note(100, 0.06, 0.08, { type: "triangle", vol: 0.35 }); }),
};
