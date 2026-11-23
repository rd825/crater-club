// The single full-scene renderer. Verbatim port of src/e_draw.js (draw) + src/base.html
// drawTank/drawProp/rr/tag/aimText/chipName. Imperative: no React in this path.

import { CELL, WATER, INK, WATERC, LAVAC, REF, H } from '../engine/constants.ts';
import { clamp } from '../engine/math.ts';
import { mix } from '../engine/color.ts';
import { WEATHER } from '../data/weather.ts';
import { WEAPONS } from '../data/weapons.ts';
import { makeCache, buildTables, shade, retop, type TerrainCache } from './terrain.ts';
import { getSprites, STARS, RIDGE } from './sprites.ts';
import type { Engine } from '../engine/engine.ts';
import type { Tank } from '../engine/types.ts';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cache: TerrainCache | null = null;

  constructor(public cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!;
  }

  private ensureCache(eng: Engine): TerrainCache {
    if (!this.cache || this.cache.gen !== eng.gen || this.cache.cv.width !== eng.G.cols) {
      this.cache = makeCache(eng.G);
      buildTables(this.cache, eng.G, eng.S);
      shade(this.cache, eng.G, 0, 0, eng.G.cols - 1, eng.G.rows - 1);
      this.cache.gen = eng.gen;
      eng.G.dirty = null;
    }
    return this.cache;
  }

  private rr(x: number, y: number, w: number, h: number, r: number): void {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  private tag(text: string, x: number, y: number, c: string, font?: string): void {
    const ctx = this.ctx;
    ctx.font = font || '700 13px "Bricolage Grotesque", system-ui, sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = INK; ctx.globalAlpha = 0.66; this.rr(x - tw / 2, y - 13, tw, 18, 6); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = c; ctx.fillText(text, x, y);
  }
  private aimText(a: number): string { a = Math.round(a); return a === 90 ? '90° ↑' : a < 90 ? a + '° →' : '← ' + (180 - a) + '°'; }
  private chipName(eng: Engine, id: string): string { return id === 'encore' ? 'Encore (' + WEAPONS[eng.S.lastId || 'shell'].name + ')' : WEAPONS[id].name; }

  private drawProp(type: string, s: number, f: number): void {
    const ctx = this.ctx;
    if (type === 'tree') { ctx.fillRect(-1.5, -11 * s, 3, 12 * s); ctx.beginPath(); ctx.arc(0, -17 * s, 8 * s, 0, 6.2832); ctx.arc(5 * s * f, -12 * s, 5 * s, 0, 6.2832); ctx.fill(); }
    else if (type === 'pine') { ctx.fillRect(-1.5, -6 * s, 3, 7 * s); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, (-28 + i * 6) * s); ctx.lineTo((-5 - i * 2) * s, (-14 + i * 5) * s); ctx.lineTo((5 + i * 2) * s, (-14 + i * 5) * s); ctx.closePath(); ctx.fill(); } }
    else if (type === 'cactus') { this.rr(-2.5, -19 * s, 5, 20 * s, 2.5); ctx.fill(); this.rr(-8 * f - 1.5, -15 * s, 3, 7 * s, 1.5); ctx.fill(); ctx.fillRect(Math.min(0, -8 * f), -10 * s, 8, 2.5); }
    else if (type === 'palm') {
      ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, 1); ctx.quadraticCurveTo(5 * f, -12 * s, 2 * f, -24 * s); ctx.stroke(); ctx.lineWidth = 2.2;
      for (const a of [-2.7, -2.1, -1.2, -0.5, 0.1]) { ctx.beginPath(); ctx.moveTo(2 * f, -24 * s); ctx.quadraticCurveTo(2 * f + Math.cos(a) * 8 * s, -24 * s + Math.sin(a) * 8 * s - 3, 2 * f + Math.cos(a) * 14 * s, -24 * s + Math.sin(a) * 9 * s + 4); ctx.stroke(); }
    } else if (type === 'snag') { ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(1 * f, -18 * s); ctx.moveTo(0.5 * f, -9 * s); ctx.lineTo(7 * f, -15 * s); ctx.moveTo(0.8 * f, -13 * s); ctx.lineTo(-5 * f, -20 * s); ctx.stroke(); }
    else { ctx.beginPath(); ctx.ellipse(0, 1, 9 * s, 6 * s, 0, Math.PI, 0); ctx.fill(); }
  }

  private drawTank(eng: Engine, t: Tank): void {
    const ctx = this.ctx, S = eng.S, reduced = eng.reduced;
    const dead = t.dead, c = dead ? '#3a3340' : t.color, hi = dead ? '#4c4454' : t.hi, lo = dead ? '#262029' : t.lo, afloat = t.afloat;
    const tilt = eng.tiltOf(t);
    if (!afloat && !t.falling) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(t.x, t.y + 1.5, 18, 3.4, tilt, 0, 6.2832); ctx.fill(); }
    ctx.save(); ctx.translate(t.x, t.y + (afloat && !reduced ? Math.sin(S.time * 2 + t.id) * 1.2 : 0));
    if (!dead) {
      ctx.save(); ctx.translate(0, -12.5); ctx.rotate((-t.angle * Math.PI) / 180);
      const rc = -(t.recoil || 0) * 5;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      ctx.fillStyle = lo; this.rr(rc + 2, -2.5, 17, 5, 1.6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; this.rr(rc + 2.6, -2, 16, 2, 1); ctx.fill();
      ctx.fillStyle = hi; this.rr(rc + 16, -3.5, 4.6, 7, 1.5); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(dead ? 0.25 : tilt);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; this.rr(-15, -8, 30, 8.5, 4.2); ctx.stroke();
    ctx.fillStyle = '#1b1428'; ctx.fill(); ctx.strokeStyle = lo; ctx.lineWidth = 1.3; ctx.stroke();
    for (const wx of [-10.2, -3.4, 3.4, 10.2]) {
      ctx.fillStyle = '#3d3254'; ctx.beginPath(); ctx.arc(wx, -3.8, 2.5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#7a6b96'; ctx.beginPath(); ctx.arc(wx, -3.8, 0.9, 0, 6.2832); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-12.5, -8); ctx.lineTo(-9.5, -13); ctx.lineTo(9.5, -13); ctx.lineTo(12.5, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lo; ctx.fillRect(-11.4, -9.6, 22.8, 1.5);
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -13, 6.4, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = hi; ctx.fillRect(-8.8, -12.6, 17.6, 1.4);
    ctx.strokeStyle = hi; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -13, 4.3, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = lo; ctx.beginPath(); ctx.arc(2, -15.6, 1.2, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (t.shield > 0 && !dead) {
      ctx.beginPath(); ctx.arc(t.x, t.y - 8, 21, 0, 6.2832);
      ctx.fillStyle = 'rgba(190,232,255,.14)'; ctx.fill(); ctx.strokeStyle = 'rgba(190,232,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(t.x, t.y - 8, 16, -2.5, -1.7); ctx.stroke();
    }
  }

  draw(eng: Engine): void {
    const ctx = this.ctx, cv = this.cv, S = eng.S, G = eng.G, W = eng.W, reduced = eng.reduced;
    if (!S) return;
    const C = this.ensureCache(eng);
    const sp = getSprites();
    const sc = cv.width / W, sky = S.sky, pal = S.pal, wx = WEATHER[S.env.weather], T = S.time, z = reduced ? 1 : S.z;
    if (G.dirty) { const d = G.dirty; G.dirty = null; retop(C, G, d[0] - 1, d[2] + 1); shade(C, G, d[0] - 3, d[1] - 3, d[2] + 3, d[3] + 3); }
    ctx.setTransform(sc * z, 0, 0, sc * z, sc * S.zx * (1 - z), sc * S.zy * (1 - z));
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.sky[0]); g.addColorStop(0.42, sky.sky[1]); g.addColorStop(0.72, sky.sky[2]); g.addColorStop(1, sky.sky[3]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (sky.stars) {
      ctx.fillStyle = '#fff4dc';
      for (const s of STARS) { ctx.globalAlpha = s.a * sky.stars * (1 - s.y / 330) * (reduced ? 1 : 0.65 + 0.35 * Math.sin(T * 1.7 + s.ph)); ctx.fillRect(s.x, s.y, s.s, s.s); }
      ctx.globalAlpha = 1;
    }
    const o = Object.assign({}, sky.orb, { x: (sky.orb.x * W) / REF });
    g = ctx.createRadialGradient(o.x, o.y, o.r * 0.2, o.x, o.y, o.r * 4.4);
    g.addColorStop(0, 'rgba(' + o.glow + ',.46)'); g.addColorStop(0.3, 'rgba(' + o.glow + ',.17)'); g.addColorStop(1, 'rgba(' + o.glow + ',0)');
    ctx.fillStyle = g; ctx.fillRect(o.x - o.r * 4.4, o.y - o.r * 4.4, o.r * 8.8, o.r * 8.8);
    g = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.1, o.x, o.y, o.r);
    g.addColorStop(0, mix(o.c, '#ffffff', 0.55)); g.addColorStop(1, o.c);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.2832); ctx.fill();
    if (o.moon) { ctx.fillStyle = 'rgba(120,130,170,.35)'; for (const [dx, dy, r] of [[-10, -6, 7], [9, 4, 9], [-4, 13, 5]]) { ctx.beginPath(); ctx.arc(o.x + dx, o.y + dy, r, 0, 6.2832); ctx.fill(); } }
    if (o.earth) {
      ctx.save(); ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.2832); ctx.clip();
      ctx.fillStyle = '#5fae6e'; ctx.beginPath(); ctx.ellipse(o.x - 14, o.y - 8, 20, 13, 0.5, 0, 6.2832); ctx.ellipse(o.x + 22, o.y + 18, 14, 9, -0.4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(o.x + 6, o.y - 26, 30, 6, 0.2, 0, 6.2832); ctx.ellipse(o.x - 18, o.y + 22, 24, 5, -0.2, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,10,.45)'; ctx.beginPath(); ctx.arc(o.x + 30, o.y + 10, o.r * 1.05, 0, 6.2832); ctx.fill(); ctx.restore();
    }
    if (sky.cloud) {
      ctx.globalAlpha = Math.min(1, sky.cloud + (wx.over ? 0.25 : 0));
      for (const c of eng.CLOUDS) for (const q of c.parts) ctx.drawImage(sp.puff, c.x + q.dx - q.w / 2, c.y + q.dy - q.h / 2, q.w, q.h);
      ctx.globalAlpha = 1;
    }
    RIDGE.forEach((rd, i) => {
      const base = i === 0 ? mix(sky.ridge[0], sky.sky[2], 0.5) : sky.ridge[i - 1];
      g = ctx.createLinearGradient(0, rd.y - 80, 0, H - 40); g.addColorStop(0, base); g.addColorStop(1, mix(base, sky.haze, 0.6));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + 8; x += 8) { let y = rd.y; for (const [am, f, ph] of rd.a) y += am * Math.sin(x * f + ph); ctx.lineTo(x, y); }
      ctx.lineTo(W + 8, H); ctx.closePath(); ctx.fill();
    });
    if (wx.over) { ctx.fillStyle = 'rgba(48,53,70,' + wx.over + ')'; ctx.fillRect(0, 0, W, H); }
    if (S.precip === 'rain') {
      ctx.strokeStyle = 'rgba(205,225,255,.5)'; ctx.lineWidth = 1.2; ctx.beginPath();
      const sl = (S.wind * 4 - 50) * 0.02;
      for (const d of S.drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - sl, d.y - 13); }
      ctx.stroke();
    } else if (S.precip === 'snow') { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (const d of S.drops) ctx.fillRect(d.x, d.y, 2 + d.s * 1.5, 2 + d.s * 1.5); }
    else if (S.precip === 'embers') { ctx.fillStyle = '#ff9a4d'; for (const d of S.drops) { ctx.globalAlpha = 0.25 + d.s * 0.6; ctx.fillRect(d.x, d.y, 2, 2); } ctx.globalAlpha = 1; }

    ctx.save();
    if (S.shake > 0.3 && !reduced) ctx.translate((Math.random() * 2 - 1) * S.shake, (Math.random() * 2 - 1) * S.shake);

    const tr = S.phase === 'aim' && !S.demo && S.env.weather !== 'fog' ? S.traces[S.turn] : null;
    if (tr && tr.length > 3) {
      ctx.setLineDash([2, 7]); ctx.beginPath(); ctx.moveTo(tr[0], tr[1]); for (let i = 2; i < tr.length; i += 2) ctx.lineTo(tr[i], tr[i + 1]);
      ctx.strokeStyle = INK; ctx.globalAlpha = 0.3; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = eng.cur().color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    g = ctx.createLinearGradient(0, 200, 0, H); g.addColorStop(0, C.backTop); g.addColorStop(1, C.backBot);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
    for (let c = 0, top = C.top, n = G.cols; c < n; c++) { const y = (top[c] + 2) * CELL; ctx.lineTo(c * CELL, y); ctx.lineTo(c * CELL + CELL, y); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    for (const t of S.tanks) this.drawTank(eng, t);

    ctx.imageSmoothingEnabled = true; ctx.drawImage(C.cv, 0, 0, W, H);
    ctx.fillStyle = ctx.strokeStyle = pal.pc; ctx.lineCap = 'round';
    for (const p of S.props) { ctx.save(); ctx.translate(p.x, p.y0 + 1); this.drawProp(pal.prop, p.s, p.f); ctx.restore(); }
    ctx.lineCap = 'butt';
    for (const b of S.bombs) {
      ctx.fillStyle = '#1b1428'; ctx.strokeStyle = eng.colorOf(b.owner); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, 6.2832); ctx.fill(); ctx.stroke();
      if (reduced || Math.sin(T * 9) > 0) { ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.8, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(sp.glow, b.x - 14, b.y - 14, 28, 28); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
    for (const hl of S.holes) {
      const hr = 14 + hl.t * 23;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.drawImage(sp.glow, hl.x - hr * 2.4, hl.y - hr * 2.4, hr * 4.8, hr * 4.8); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05030a'; ctx.beginPath(); ctx.arc(hl.x, hl.y, hr * 0.72 + Math.sin(hl.t * 20) * 2, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#c4a1ff'; ctx.lineWidth = 2.4;
      for (let j = 0; j < 4; j++) { const a = -hl.t * 5 * (j + 1) + j * 2; ctx.globalAlpha = 0.9 - j * 0.2; ctx.beginPath(); ctx.arc(hl.x, hl.y, hr * (0.9 + j * 0.3), a, a + 2.3); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const b of S.bits) {
      if (b.rain) { ctx.fillStyle = 'rgba(190,225,255,.7)'; ctx.fillRect(b.x, b.y, 1.4, 4); continue; }
      ctx.fillStyle = b.t === WATER ? WATERC : b.t === 5 ? LAVAC : pal.dust; ctx.fillRect(b.x - 1.3, b.y - 1.3, 2.8, 2.8);
    }

    for (const q of S.puffs) { ctx.globalAlpha = (1 - q.t / q.life) * (q.dark ? 0.55 : 0.4); ctx.drawImage(q.dark ? sp.soot : sp.puff, q.x - q.r * 1.3, q.y - q.r * 0.85, q.r * 2.6, q.r * 1.7); }
    ctx.globalAlpha = 1;

    for (const p of S.projs) {
      const c = p.seek ? '#ffe14a' : eng.colorOf(p.owner), tl = p.trail!, n = tl.length >> 1;
      const rad = p.seek ? 2.6 : p.tracer ? 3 : clamp(2.4 + (p.r || 20) / 22, 3.2, 7.5), fade = p.ghost ? 0.45 : 1;
      ctx.strokeStyle = c; ctx.lineCap = 'round';
      if (p.ghost) ctx.setLineDash([3, 5]);
      for (let i = 1; i < n; i++) { const k = i / n; ctx.globalAlpha = k * 0.6 * fade; ctx.lineWidth = rad * 0.9 * k + 0.4; ctx.beginPath(); ctx.moveTo(tl[2 * i - 2], tl[2 * i - 1]); ctx.lineTo(tl[2 * i], tl[2 * i + 1]); ctx.stroke(); }
      ctx.setLineDash([]); ctx.lineCap = 'butt';
      if (!p.tracer) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * fade; ctx.drawImage(sp.glow, p.x - rad * 3.4, p.y - rad * 3.4, rad * 6.8, rad * 6.8); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = fade;
      if (p.chute && p.vy > 0) {
        ctx.strokeStyle = '#f7ead9'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - 14, p.y - 20); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x + 14, p.y - 20); ctx.stroke();
        ctx.fillStyle = c; ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y - 20, 14, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (p.kind === 'saw' && p.moling) {
        ctx.strokeStyle = '#f7ead9'; ctx.lineWidth = 1.8;
        for (let j = 0; j < 8; j++) { const a = T * 22 * (p.dir || 1) + j * 0.785; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6); ctx.lineTo(p.x + Math.cos(a + 0.5) * 11, p.y + Math.sin(a + 0.5) * 11); ctx.stroke(); }
      }
      ctx.fillStyle = p.seek ? '#2a2206' : '#fff6df'; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(p.x - rad * 0.3, p.y - rad * 0.3, rad * 0.3, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      if (p.y < -6 && p.x > 0 && p.x < W) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(p.x, 4); ctx.lineTo(p.x - 6, 14); ctx.lineTo(p.x + 6, 14); ctx.closePath(); ctx.fill(); }
    }
    for (const b of S.bolts) {
      ctx.lineJoin = 'bevel';
      ctx.beginPath(); ctx.moveTo(b.pts[0], b.pts[1]); for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = b.c; ctx.lineWidth = 10; ctx.globalAlpha = (1 - b.t) * 0.3; ctx.stroke();
      ctx.lineWidth = 5; ctx.globalAlpha = (1 - b.t) * 0.5; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 1 - b.t; ctx.stroke();
    }
    for (const b of S.booms) {
      const k = b.t, e = 1 - (1 - k) * (1 - k), rad = b.r * (0.35 + 0.75 * e);
      if (b.soft) {
        ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = b.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, rad * 1.1, 0, 6.2832); ctx.stroke();
      } else {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * (b.r > 120 ? 0.6 : 1);
        ctx.drawImage(sp.fireball, b.x - rad * 1.3, b.y - rad * 1.3, rad * 2.6, rad * 2.6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = b.c; ctx.lineWidth = 3.5 * (1 - k) + 0.6; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.45 + 1.1 * e), 0, 6.2832); ctx.stroke();
        if (b.r >= 60) { ctx.globalAlpha = (1 - k) * 0.4; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.6 + 1.7 * e), 0, 6.2832); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
    for (const q of S.parts) {
      const a = 1 - q.t / q.life;
      if (q.spark) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.strokeStyle = q.c; ctx.lineWidth = q.s; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
      else { ctx.globalAlpha = a; ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.s, q.s); }
    }
    ctx.globalAlpha = 1;
    if (S.env.weather === 'fog') { ctx.globalAlpha = 0.6; for (const f of eng.FOG) ctx.drawImage(sp.puff, f.x - f.w / 2, f.y - f.h / 2, f.w, f.h); ctx.globalAlpha = 1; }
    for (const m of S.smokes) {
      ctx.globalAlpha = m.turns <= 1 ? 0.6 : 1;
      for (const q of m.puffs) { ctx.drawImage(sp.puff, m.x + q.dx - q.w / 2, m.y + q.dy - q.h / 2, q.w, q.h); ctx.drawImage(sp.puff, m.x + q.dx - q.w / 2, m.y + q.dy - q.h / 2, q.w, q.h); }
      ctx.globalAlpha = 1;
    }

    const preview = eng.preview;
    if (preview && S.phase === 'aim' && !S.demo && !eng.cur().shaped && !S.tracerRound) {
      const t = eng.cur(); ctx.globalAlpha = reduced ? 0.5 : 0.36 + 0.14 * Math.sin(T * 6);
      if (preview === 'dig') {
        const a = (t.angle * Math.PI) / 180;
        ctx.strokeStyle = t.color; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(t.x, t.y - 9); ctx.lineTo(t.x + Math.cos(a) * 104, t.y - 9 - Math.sin(a) * 104); ctx.stroke(); ctx.lineCap = 'butt';
      } else {
        const b = eng.shapeBox(t, preview);
        ctx.fillStyle = preview === 'burrow' ? INK : t.color; ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
        ctx.globalAlpha = 0.9; ctx.strokeStyle = t.color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
    const mk = !S.demo && S.phase !== 'over' ? S.marks[S.turn] : null;
    if (mk) for (const m of mk) {
      const mine = m.lab === 0, col = mine ? eng.cur().color : '#f7ead9';
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m.x, m.y + 1); ctx.lineTo(m.x, m.y - 20); ctx.stroke();
      ctx.strokeStyle = '#f7ead9'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(m.x, m.y - 20); ctx.lineTo(m.x + 12, m.y - 15.5); ctx.lineTo(m.x, m.y - 11); ctx.closePath(); ctx.fill(); ctx.stroke();
      this.tag(eng.offsetLabel(m.lab), m.x, m.y - 27, col, '700 12px "Bricolage Grotesque", system-ui, sans-serif');
    }
    if (S.phase === 'aim' && !S.demo) {
      const t = eng.cur(), a = (t.angle * Math.PI) / 180, len = t.power * 3.2, px = t.x, py = t.y - 12;
      const ex = px + Math.cos(a) * len, ey = py - Math.sin(a) * len;
      ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * 24, py - Math.sin(a) * 24); ctx.lineTo(ex, ey);
      ctx.strokeStyle = INK; ctx.globalAlpha = 0.3; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = t.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(ex, ey, 6, 0, 6.2832); ctx.fillStyle = eng.armed ? t.color : INK; ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
      this.tag(this.aimText(t.angle) + '  ·  ' + Math.round(t.power), clamp(ex, 60, W - 60), Math.max(22, ey - 14), '#f7ead9', '600 12px "Bricolage Grotesque", system-ui, sans-serif');
    }
    for (const t of S.live) {
      const top = t.y - 36, hot = eng.inLava(t);
      this.tag(t.name + (eng.isBuried(t) ? ' (buried)' : '') + (hot ? ' (in lava)' : '') + (t.hiccup ? ' (hiccups)' : ''), t.x, top, t.color);
      if (S.health) {
        const w = 36, f = clamp(t.hp / S.cfg.health, 0, 1);
        ctx.fillStyle = INK; this.rr(t.x - w / 2 - 1.5, top + 7, w + 3, 7, 3); ctx.fill();
        ctx.fillStyle = f > 0.5 ? '#7be08a' : f > 0.25 ? '#ffc56b' : '#ff5a5a'; this.rr(t.x - w / 2, top + 8.5, Math.max(3, w * f), 4, 2); ctx.fill();
      }
      if (S.phase === 'aim' && t === eng.cur()) {
        const bob = reduced ? 0 : Math.sin(T * 5) * 2.5, y = top - 20 + bob;
        ctx.beginPath(); ctx.moveTo(t.x, y + 6); ctx.lineTo(t.x - 6, y - 3); ctx.lineTo(t.x + 6, y - 3); ctx.closePath();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.color; ctx.fill();
      }
    }
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const f of S.floats) {
      const pop = reduced ? 1 : 1 + 0.6 * Math.max(0, 1 - f.t * 7);
      ctx.font = '400 ' + Math.round(22 * pop) + 'px "Bowlby One", "Arial Black", sans-serif';
      ctx.globalAlpha = clamp(1.5 - f.t, 0, 1); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.c; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.drawImage(sp.vignette, 0, 0, W, H);
    if (S.flash > 0.02) { ctx.fillStyle = 'rgba(255,255,255,' + S.flash * (reduced ? 0.12 : 0.45) + ')'; ctx.fillRect(0, 0, W, H); }
    const big = (text: string, c: string, al: number) => {
      ctx.globalAlpha = al; ctx.font = '400 ' + (text.length > 30 ? 24 : 34) + 'px "Bowlby One", "Arial Black", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(text, W / 2, 70); ctx.fillStyle = c; ctx.fillText(text, W / 2, 70); ctx.globalAlpha = 1;
    };
    if (eng.armed && S.phase === 'aim' && !S.demo) {
      const t = eng.cur(), id = t.weapons[t.sel];
      big('Fire ' + (S.tracerRound ? 'Tracer' : this.chipName(eng, id)) + '?', t.color, 1);
      this.tag(this.aimText(t.angle) + ', power ' + Math.round(t.power) + '. Fire again to confirm, Esc to cancel.', W / 2, 100, '#f7ead9');
    } else if (S.banner && !S.demo) { const b = S.banner; big(b.text, b.c, clamp(Math.min(b.t * 5, (1.9 - b.t) * 2.5), 0, 1)); }
  }
}
