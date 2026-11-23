// Procedural sprites + the weapon-icon DSL. Verbatim port of src/base.html:1276-1402.
// Built lazily (needs `document`) and memoized.

import { SIZES } from '../engine/constants.ts';
import { createRng } from '../engine/rng.ts';

export interface Sprites {
  puff: HTMLCanvasElement;
  soot: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  fireball: HTMLCanvasElement;
  vignette: HTMLCanvasElement;
}

export interface Star { x: number; y: number; s: number; a: number; ph: number }
export interface Ridge { y: number; a: [number, number, number][] }

function sprite(w: number, h: number, fn: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d')!);
  return c;
}

let cached: Sprites | null = null;
export function getSprites(): Sprites {
  if (cached) return cached;
  const softBlob = (rgb: string) =>
    sprite(256, 128, (c) => {
      const g = c.createRadialGradient(128, 128, 4, 128, 128, 128);
      g.addColorStop(0, 'rgba(' + rgb + ',.8)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.scale(1, 0.5); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    });
  const puff = softBlob('238,240,247'), soot = softBlob('46,40,54');
  const glow = sprite(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,246,214,1)'); g.addColorStop(0.3, 'rgba(255,190,90,.5)'); g.addColorStop(1, 'rgba(255,150,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
  const fireball = sprite(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,236,1)'); g.addColorStop(0.25, 'rgba(255,226,132,.95)'); g.addColorStop(0.55, 'rgba(255,140,50,.7)');
    g.addColorStop(0.8, 'rgba(205,62,30,.25)'); g.addColorStop(1, 'rgba(160,30,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  const vignette = sprite(256, 128, (c) => {
    const g = c.createRadialGradient(128, 128, 78, 128, 128, 190);
    g.addColorStop(0, 'rgba(8,5,14,0)'); g.addColorStop(1, 'rgba(8,5,14,.5)');
    c.scale(1, 0.5); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  cached = { puff, soot, glow, fireball, vignette };
  return cached;
}

const sr = createRng(0xc0ffee);
export const STARS: Star[] = Array.from({ length: 130 }, () => ({ x: sr.random() * SIZES.large, y: sr.random() * 300, s: sr.rand(0.6, 1.8), a: sr.rand(0.25, 0.9), ph: sr.rand(0, 6.28) }));
export const RIDGE: Ridge[] = [
  { y: 292, a: [[40, 0.0036, 2.4], [16, 0.011, 0.5], [6, 0.033, 1.9]] },
  { y: 318, a: [[46, 0.0052, 1.1], [20, 0.0171, 4.0], [8, 0.041, 2.2]] },
  { y: 372, a: [[38, 0.0071, 3.3], [16, 0.0213, 0.7], [7, 0.052, 5.1]] },
];

// ---- weapon icons ----
let iconCache: Record<string, string> | null = null;
export function getIcons(): Record<string, string> {
  if (iconCache) return iconCache;
  const C = '#f7ead9', A = '#ffc56b', R = '#ff6b93', B = '#9fd4f0', G = '#a6e86a', P = '#c4a1ff', K = '#120d1c', TAU = 6.2832, PI = Math.PI;
  interface I {
    x: CanvasRenderingContext2D;
    col(v: string): I; w(v: number): I; dash(on: number | boolean): I;
    ball(a: number, b: number, r: number): I; ring(a: number, b: number, r: number): I;
    arc(a: number, b: number, r: number, s: number, e: number): I; dome(a: number, b: number, r: number): I;
    ell(a: number, b: number, rx: number, ry: number): I; box(a: number, b: number, w: number, h: number): I;
    ln(...p: number[]): I; poly(...p: number[]): I;
    q(a: number, b: number, c1: number, c2: number, d: number, e: number): I;
    drop(a: number, b: number, s: number): I;
    burst(a: number, b: number, r0: number, r1: number, n: number, s?: number, e?: number): I;
    txt(s: string, a: number, b: number, size: number): I;
  }
  const render = (fn: (i: I) => void): string => {
    const c = document.createElement('canvas'); c.width = c.height = 60; const x = c.getContext('2d')!;
    x.scale(2.5, 2.5); x.lineCap = x.lineJoin = 'round'; x.lineWidth = 1.7; x.strokeStyle = x.fillStyle = C;
    const i: I = {
      x,
      col(v) { x.strokeStyle = x.fillStyle = v; return i; },
      w(v) { x.lineWidth = v; return i; },
      dash(on) { x.setLineDash(on ? [1.4, 2.8] : []); return i; },
      ball(a, b, r) { x.beginPath(); x.arc(a, b, r, 0, TAU); x.fill(); return i; },
      ring(a, b, r) { x.beginPath(); x.arc(a, b, r, 0, TAU); x.stroke(); return i; },
      arc(a, b, r, s, e) { x.beginPath(); x.arc(a, b, r, s, e); x.stroke(); return i; },
      dome(a, b, r) { x.beginPath(); x.arc(a, b, r, PI, 0); x.closePath(); x.fill(); return i; },
      ell(a, b, rx, ry) { x.beginPath(); x.ellipse(a, b, rx, ry, 0, 0, TAU); x.fill(); return i; },
      box(a, b, w, h) { x.fillRect(a, b, w, h); return i; },
      ln(...p) { x.beginPath(); x.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) x.lineTo(p[k], p[k + 1]); x.stroke(); return i; },
      poly(...p) { x.beginPath(); x.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) x.lineTo(p[k], p[k + 1]); x.closePath(); x.fill(); return i; },
      q(a, b, c1, c2, d, e) { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(c1, c2, d, e); x.stroke(); return i; },
      drop(a, b, s) { x.beginPath(); x.moveTo(a, b - s); x.quadraticCurveTo(a + s * 1.2, b + s * 0.3, a, b + s * 0.9); x.quadraticCurveTo(a - s * 1.2, b + s * 0.3, a, b - s); x.fill(); return i; },
      burst(a, b, r0, r1, n, s, e) {
        for (let k = 0; k < n; k++) { const t = s == null ? (k / n) * TAU : s + (e! - s) * (n === 1 ? 0.5 : k / (n - 1)); i.ln(a + Math.cos(t) * r0, b + Math.sin(t) * r0, a + Math.cos(t) * r1, b + Math.sin(t) * r1); }
        return i;
      },
      txt(s, a, b, size) { x.font = '700 ' + size + 'px sans-serif'; x.textAlign = 'center'; x.fillText(s, a, b); return i; },
    };
    fn(i); return c.toDataURL();
  };
  const D: Record<string, (i: I) => void> = {
    dig: (i) => i.ln(2, 21, 22, 21).w(3).ln(5, 17, 16, 7).w(1.7).col(A).poly(13, 3, 21, 3, 21, 11),
    burrow: (i) => i.ln(2, 21, 22, 21).dome(12, 21, 8.5).col(A).ln(12, 19, 12, 6).poly(8.8, 9.5, 15.2, 9.5, 12, 4),
    wall: (i) => i.col(A).box(8, 4, 8, 17).col(K).w(1).ln(8, 9, 16, 9).ln(8, 14, 16, 14).ln(12, 4, 12, 9).ln(10, 9, 10, 14).ln(14, 14, 14, 21).col(C).w(1.7).ln(2, 21, 22, 21),
    bridge: (i) => i.ln(5, 10, 5, 21).ln(19, 10, 19, 21).col(A).w(2.6).ln(2, 10, 22, 10).w(1.3).col(B).q(6, 20, 9, 17, 12, 20).q(12, 20, 15, 17, 18, 20),
    tracer: (i) => i.dash(1).arc(10, 20, 8, PI, 0).dash(0).ln(18, 20, 18, 11).col(A).poly(18, 11, 23, 13.2, 18, 15.4),
    shell: (i) => i.ball(13, 12, 5).ln(2, 9, 6, 9).ln(1, 12, 5, 12).ln(2, 15, 6, 15),
    heavy: (i) => i.ball(12, 12, 7).col(A).ring(12, 12, 10),
    crater: (i) => i.ln(2, 12, 6, 12).arc(12, 12, 6, 0, PI).ln(18, 12, 22, 12).col(A).burst(12, 10, 2.5, 7.5, 5, PI + 0.3, TAU - 0.3),
    three: (i) => i.ln(4, 20, 6, 10).ln(4, 20, 13, 9).ln(4, 20, 19, 13).ball(6, 8, 2.5).ball(14, 7, 2.5).ball(20, 12, 2.5),
    scatter: (i) => i.ball(7, 7, 1.9).ball(14, 5, 1.9).ball(19, 10, 1.9).ball(11, 13, 1.9).ball(18, 17, 1.9).ln(3, 21, 6, 17),
    cluster: (i) => i.ball(12, 5, 3.2).ln(12, 9, 5, 17).ln(12, 9, 12, 18).ln(12, 9, 19, 17).col(A).ball(5, 19, 1.9).ball(12, 20, 1.9).ball(19, 19, 1.9),
    bouncer: (i) => i.ln(2, 21, 22, 21).dash(1).arc(6.5, 21, 4.5, PI, 0).arc(14.5, 21, 3.5, PI, 0).dash(0).ball(20, 17.5, 2.7),
    roller: (i) => i.ln(2, 9, 22, 20).ball(9.5, 8.8, 3.6).col(A).arc(9.5, 8.8, 6, -0.3, 1.1),
    driller: (i) => i.ln(3, 7, 9, 7).ln(15, 7, 21, 7).w(2.4).ln(12, 2, 12, 16).poly(8.5, 15, 15.5, 15, 12, 21.5).w(1.3).col(A).ln(9.5, 9, 14.5, 10.5).ln(9.5, 12, 14.5, 13.5),
    dirt: (i) => i.dome(12, 21, 8.5).col(A).ln(12, 2, 12, 8).poly(9.3, 7, 14.7, 7, 12, 11),
    strike: (i) => i.ln(6, 2, 6, 7).ln(12, 4, 12, 9).ln(18, 2, 18, 7).ball(6, 10, 2.3).ball(12, 12, 2.3).ball(18, 10, 2.3).col(A).ln(4, 20, 20, 20).ln(12, 17, 12, 23),
    fountain: (i) => i.ln(3, 21, 21, 21).q(12, 21, 6, 4, 4, 15).q(12, 21, 12, 2, 12, 9).q(12, 21, 18, 4, 20, 15).col(A).ball(4, 15, 1.8).ball(12, 8, 1.8).ball(20, 15, 1.8),
    cracker: (i) => i.ln(2, 21, 22, 21).col(A).burst(5, 16, 1, 3, 6).burst(12, 15, 1, 3.6, 6).burst(19, 14, 1, 4.2, 6),
    needle: (i) => i.w(1.5).ln(4, 20, 20, 4).ball(20, 4, 1.7).col(A).ring(5.5, 18.5, 2.4),
    homer: (i) => i.dash(1).arc(8, 17, 10, -PI / 2, 0).dash(0).ball(8, 7, 2.6).col(R).ring(18, 18, 3.4).ball(18, 18, 1.2),
    sauce: (i) => i.col(A).drop(12, 11, 8).col(R).drop(12, 14, 4),
    rail: (i) => i.w(2.6).ln(3, 12, 17, 12).poly(16, 8, 22.5, 12, 16, 16).w(1.2).col(A).ln(3, 7.5, 10, 7.5).ln(3, 16.5, 10, 16.5),
    skipper: (i) => i.ln(2, 20, 22, 20).dash(1).arc(7, 20, 4, PI, 0).arc(15, 20, 4, PI, 0).dash(0).ell(20, 14.5, 3.2, 1.7),
    mole: (i) => i.ln(2, 9, 22, 9).dash(1).ln(3, 16, 14, 16).dash(0).ball(17.5, 16, 3).col(A).dome(17.5, 9, 3.2),
    sink: (i) => i.ln(2, 9, 6, 9).q(6, 9, 12, 26, 18, 9).ln(18, 9, 22, 9).col(A).ln(12, 2, 12, 8).poly(9.5, 7, 14.5, 7, 12, 10.5),
    bags: (i) => i.box(3, 9, 4.5, 12).box(16.5, 9, 4.5, 12).col(A).dome(12, 21, 4),
    hop: (i) => i.ring(5, 17, 2.8).dash(1).arc(12, 17, 7, PI, 0).dash(0).col(A).ball(19, 17, 2.8),
    thump: (i) => i.ball(12, 19, 2.2).col(A).arc(12, 19, 5.5, PI, 0).arc(12, 19, 9, PI, 0).arc(12, 19, 12.5, PI * 1.1, -PI * 0.1),
    airburst: (i) => i.ln(3, 21, 21, 21).ln(12, 9, 6, 18).ln(12, 9, 12, 19).ln(12, 9, 18, 18).col(A).burst(12, 6, 1.6, 4.6, 8),
    boomer: (i) => i.ball(12, 16, 6).col(K).w(1.3).ln(7.5, 12, 16.5, 12).col(A).box(10.3, 6, 3.4, 4).ln(13.7, 7, 18, 3).burst(18.6, 2.6, 0.8, 2.7, 5),
    plumb: (i) => i.dash(1).q(2, 20, 6, 3, 13, 4).dash(0).ln(13, 4, 13, 14).poly(10.2, 14, 15.8, 14, 13, 20.5),
    buster: (i) => i.ln(2, 9, 8, 9).ln(16, 9, 22, 9).w(2.4).ln(12, 2, 12, 13).poly(8.5, 12, 15.5, 12, 12, 17.5).w(1.5).col(A).burst(12, 18, 2.5, 5.5, 5, 0.2, PI - 0.2),
    leveler: (i) => i.q(2, 8, 7, 1, 12, 8).q(12, 8, 17, 15, 22, 8).col(A).ln(2, 20, 22, 20).ln(12, 12, 12, 15).poly(9.8, 14.5, 14.2, 14.5, 12, 18),
    arc: (i) => i.ball(4, 18, 2.3).ball(20, 6, 2.3).col(B).ln(6, 16, 10.5, 11, 12.5, 14.5, 18, 8),
    swipe: (i) => i.col(A).ring(15, 9, 5.5).ln(15, 6.5, 15, 11.5).col(C).ln(11, 18, 4, 18).poly(6, 15.2, 6, 20.8, 2, 18),
    marbles: (i) => i.ln(2, 11, 22, 21).ball(6, 9.6, 2.5).ball(12, 12.6, 2.5).ball(18, 15.6, 2.5),
    double: (i) => i.ball(9, 14.5, 3.3).ball(17, 8, 3.3).dash(1).ln(2, 20, 5.5, 17.2),
    stutter: (i) => i.ball(4, 19, 1.5).ball(8, 16, 1.5).ball(12, 13, 1.5).ball(16, 10, 1.5).ball(20, 7, 1.5),
    hole: (i) => i.col(P).arc(12, 12, 9, 0.3, 2.5).arc(12, 12, 9, 3.45, 5.6).arc(12, 12, 5.6, 1.6, 4).arc(12, 12, 5.6, 4.8, 7).col(C).ball(12, 12, 2.4),
    swarm: (i) => i.ell(7.5, 15, 4.2, 5.2).col(K).w(1.2).ln(4.5, 13, 10.5, 13).ln(4, 16, 11, 16).col(A).ball(15, 6, 1.5).ball(19.5, 10, 1.5).ball(15, 11.5, 1.5).ball(20, 16, 1.5).ball(16, 19, 1.5),
    hiccup: (i) => i.col(G).ball(8, 14, 4.3).ball(13, 10.5, 5.4).ball(17.5, 14.5, 4.2).col(K).w(1.8).ln(12.8, 8, 12.8, 13).ball(12.8, 16, 1.1),
    bubble: (i) => i.col(B).ring(12, 12, 9.5).arc(12, 12, 6.8, -2.5, -1.5).col(C).dome(12, 18, 4.2),
    lift: (i) => i.w(2.6).ln(3, 21, 10, 13).w(1.4).col(A).dash(1).q(8, 13, 15, 2, 21, 14).dash(0).ball(21, 14, 2.4),
    geyser: (i) => i.ln(3, 21, 21, 21).col(B).w(2.8).ln(12, 20, 12, 9).w(1.7).q(12, 9, 6, 2, 4.5, 11).q(12, 9, 18, 2, 19.5, 11),
    thunder: (i) => i.ball(8, 8, 3.6).ball(13, 6.5, 4.6).ball(17.5, 9, 3.5).col(A).poly(13.5, 11, 9, 17, 12.2, 17, 10.5, 22.5, 16.5, 15, 13.2, 15),
    smoke: (i) => i.col('#b5a6c6').ball(8, 14.5, 5).ball(14, 10, 6).ball(17.5, 16, 4.6),
    pinball: (i) => i.w(2.4).ln(21, 2, 21, 22).w(1.7).dash(1).ln(3, 19, 20, 11).ln(20, 11, 10, 5).dash(0).ball(9, 4.6, 2.6),
    chute: (i) => i.ln(4.2, 10, 12, 19).ln(19.8, 10, 12, 19).ball(12, 20, 2.5).col(A).dome(12, 10, 8),
    prism: (i) => i.ln(12, 3, 17.5, 11.5, 6.5, 11.5, 12, 3).col(A).ln(9, 13.5, 4, 22).ln(12, 13.5, 12, 22.5).ln(15, 13.5, 20, 22),
    sticky: (i) => i.ball(11, 14, 6.2).ball(5.5, 20.5, 1.5).ball(17, 20.8, 1.3).ln(15, 9.5, 18, 6.5).col(R).ball(19, 5.5, 1.8),
    phantom: (i) => { const x = i.x; x.globalAlpha = 0.92; x.beginPath(); x.arc(12, 11, 6.5, PI, 0); x.lineTo(18.5, 20); x.lineTo(16.3, 17.6); x.lineTo(14.2, 20); x.lineTo(12, 17.6); x.lineTo(9.8, 20); x.lineTo(7.7, 17.6); x.lineTo(5.5, 20); x.closePath(); x.fill(); i.col(K).ball(9.8, 11, 1.2).ball(14.2, 11, 1.2); },
    saw: (i) => i.ring(12, 12, 5.6).burst(12, 12, 5.6, 9, 10).col(A).ball(12, 12, 1.8),
    frog: (i) => i.col(G).dome(12, 19, 8).ball(7.5, 10.5, 3).ball(16.5, 10.5, 3).col(K).ball(7.5, 10.5, 1.2).ball(16.5, 10.5, 1.2).w(1.2).arc(12, 15, 3, 0.3, PI - 0.3),
    encore: (i) => i.w(2).arc(12, 12, 7, 0.9, 5.3).poly(13.4, 3, 19.6, 7.6, 13, 9.6),
    mystery: (i) => i.ln(4, 6, 20, 6, 20, 20, 4, 20, 4, 6).col(A).txt('?', 12, 17.5, 12),
  };
  iconCache = {};
  for (const k in D) iconCache[k] = render(D[k]);
  return iconCache;
}

export function iconSrc(id: string): string {
  const icons = getIcons();
  return icons[id] || icons.shell;
}
