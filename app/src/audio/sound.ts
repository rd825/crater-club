// WebAudio sound, implementing AudioBridge. Port of src/base.html:1692-1737 + src/f_ui.js:1-2.
// Browsers only allow audio after a user gesture, so wake() must be called on pointer/key input.

import { clamp } from '../engine/math.ts';
import type { AudioBridge } from '../engine/bridge.ts';

type AC = AudioContext & { tries?: number };

export class WebAudio implements AudioBridge {
  soundOn = true;
  private ac: AC | null = null;
  private noiseBuf: AudioBuffer | null = null;
  /** Gate set by the controller: sound only plays during a live (non-demo) match. */
  gate: () => boolean = () => true;
  onState: () => void = () => {};

  /** Create/resume the audio context. Call on every click and key press. */
  wake(): void {
    if (!this.soundOn) return;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ac = this.ac;
      if (ac && (ac.state === 'closed' || (ac.state !== 'running' && (ac.tries || 0) >= 3))) {
        if (ac.state !== 'closed') { const c = ac.close(); if (c && c.catch) c.catch(() => {}); }
        this.ac = null;
      }
      if (!this.ac) { this.ac = new Ctor() as AC; this.ac.tries = 0; this.noiseBuf = null; this.ac.onstatechange = () => this.onState(); }
      const a = this.ac;
      if (a.state !== 'running') { a.tries = (a.tries || 0) + 1; const r = a.resume(); if (r && r.catch) r.catch(() => {}); } else a.tries = 0;
    } catch {
      this.ac = null;
    }
    this.onState();
  }

  get state(): 'off' | 'paused' | 'on' {
    if (!this.soundOn) return 'off';
    return this.ac && this.ac.state !== 'running' ? 'paused' : 'on';
  }

  toggle(): void {
    this.soundOn = !this.soundOn;
    if (this.soundOn) this.wake();
    this.onState();
  }

  private canSfx(): boolean {
    return this.soundOn && !!this.ac && this.ac.state === 'running' && this.gate();
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'triangle'): void {
    if (!this.canSfx()) return;
    const AC = this.ac!;
    try {
      const o = AC.createOscillator(), g = AC.createGain(), n = AC.currentTime;
      o.type = type; o.frequency.setValueAtTime(f0, n); o.frequency.exponentialRampToValueAtTime(f1, n + dur);
      g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(0.001, n + dur);
      o.connect(g).connect(AC.destination); o.start(n); o.stop(n + dur + 0.02);
    } catch {
      /* ignore */
    }
  }

  private noise(dur: number, vol: number, f0: number, f1: number): void {
    if (!this.canSfx()) return;
    const AC = this.ac!;
    try {
      if (!this.noiseBuf) {
        this.noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(), n = AC.currentTime;
      s.buffer = this.noiseBuf; fl.type = 'lowpass'; fl.frequency.setValueAtTime(f0, n); fl.frequency.exponentialRampToValueAtTime(f1, n + dur);
      g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(0.001, n + dur);
      s.connect(fl).connect(g).connect(AC.destination); s.start(n, Math.random() * 0.4, dur + 0.05);
    } catch {
      /* ignore */
    }
  }

  fire() { this.tone(240, 60, 0.2, 0.22); }
  pop() { this.tone(700, 300, 0.08, 0.12, 'square'); }
  zap() { this.tone(1400, 200, 0.14, 0.12, 'sawtooth'); }
  arm() { this.tone(520, 780, 0.07, 0.1, 'sine'); }
  thud() { this.noise(0.35, 0.3, 500, 90); }
  thunder() { this.noise(0.9, 0.5, 900, 60); }
  boom(r: number) { this.noise(0.25 + r / 140, clamp(r / 90, 0.12, 0.5), 1400, 90); this.tone(120, 40, 0.25, clamp(r / 160, 0.05, 0.3), 'sine'); }
  splash() { this.noise(0.45, 0.28, 2600, 500); }
  sizzle() { this.noise(0.7, 0.16, 5200, 1800); }
}
