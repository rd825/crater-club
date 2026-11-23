// Headless test harness: a controllable clock + a match driver that advances the engine
// frame-by-frame until the match ends, with no DOM/canvas/audio.

import { Engine } from '../../src/engine/engine.ts';
import { silentAudio } from '../../src/engine/bridge.ts';
import type { UIBridge, Scheduler } from '../../src/engine/bridge.ts';
import type { MatchConfig, GameOverResult, DraftView } from '../../src/engine/types.ts';

/** A Scheduler whose timers only fire when the test advances the clock. */
export class FakeClock implements Scheduler {
  now = 0;
  private q: { due: number; fn: () => void }[] = [];
  set(fn: () => void, ms: number): void {
    this.q.push({ due: this.now + ms, fn });
  }
  /** Advance the clock by `ms`, firing due callbacks in time order. */
  advance(ms: number): void {
    const target = this.now + ms;
    // process in small sweeps so callbacks that schedule sooner-due timers still fire
    while (true) {
      const next = this.q.filter((e) => e.due <= target).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      this.q.splice(this.q.indexOf(next), 1);
      this.now = Math.max(this.now, next.due);
      next.fn();
    }
    this.now = target;
  }
  pending(): number {
    return this.q.length;
  }
}

export interface RunResult {
  eng: Engine;
  frames: number;
  over: GameOverResult | null;
  errors: string[];
  syncs: number;
}

export interface CapturingUI extends UIBridge {
  over: GameOverResult | null;
  drafts: number;
  syncs: number;
}

export function capturingUI(): CapturingUI {
  const ui: CapturingUI = {
    over: null,
    drafts: 0,
    syncs: 0,
    onSync() { ui.syncs++; },
    onAim() {},
    onScores() {},
    onBanner() {},
    onBuildCards() {},
    onDraft(_v: DraftView | null) { ui.drafts++; },
    onGameOver(r: GameOverResult) { ui.over = r; },
    closeOverlays() {},
  };
  return ui;
}

const FRAME_SECONDS = 0.05; // matches the engine's 50ms real-time clamp
const FRAME_MS = 50;

/** Run a full match to completion (or until `cap` frames). Volleys mode is guaranteed to terminate. */
export function runMatch(cfg: MatchConfig, cap = 120_000): RunResult {
  const clock = new FakeClock();
  const ui = capturingUI();
  const errors: string[] = [];
  const eng = new Engine(ui, silentAudio, clock);
  eng.newGame(cfg);
  let frames = 0;
  while (eng.S.phase !== 'over' && frames < cap) {
    try {
      clock.advance(FRAME_MS);
      eng.advance(FRAME_SECONDS);
    } catch (e) {
      errors.push(String((e as Error)?.stack || e));
      break;
    }
    frames++;
  }
  // flush the deferred onGameOver (scheduled ~900ms out)
  try {
    clock.advance(5000);
  } catch (e) {
    errors.push(String((e as Error)?.stack || e));
  }
  return { eng, frames, over: ui.over, errors, syncs: ui.syncs };
}

/** Advance an engine a fixed number of frames (for mid-match inspection). */
export function stepFrames(eng: Engine, clock: FakeClock, n: number): void {
  for (let i = 0; i < n; i++) {
    clock.advance(FRAME_MS);
    eng.advance(FRAME_SECONDS);
  }
}
