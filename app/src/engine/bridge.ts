// Interfaces the pure engine calls instead of touching the DOM / WebAudio directly.
// The browser implements them (React store + WebAudio); tests pass silent stubs.
// This is the decoupling that lets a whole match run headless and deterministic.

import type { GameOverResult, DraftView, Banner } from './types.ts';

/** Everything the engine wants the UI to reflect. No DOM types leak into the engine. */
export interface UIBridge {
  /** Turn/arsenal/aim/fuel changed — the HUD should re-read engine state. */
  onSync(): void;
  /** The aim sliders should mirror the current tank's angle/power. */
  onAim(): void;
  /** Scores changed. */
  onScores(): void;
  /** A transient on-canvas banner (or null to clear). */
  onBanner(b: Banner | null): void;
  /** Rebuild the per-tank score cards (new match / restore). */
  onBuildCards(): void;
  /** Draft screen state changed (or null when leaving the draft). */
  onDraft(view: DraftView | null): void;
  /** The match ended. */
  onGameOver(result: GameOverResult): void;
  /** Close any open overlay (menu/draft/picker/over). */
  closeOverlays(): void;
}

/** Sound effects. `boom` scales with blast radius. */
export interface AudioBridge {
  fire(): void;
  pop(): void;
  zap(): void;
  arm(): void;
  thud(): void;
  thunder(): void;
  boom(r: number): void;
  splash(): void;
  sizzle(): void;
}

/** Wall-clock scheduler (the original's setTimeout-based `later`). Injectable so tests can flush timers. */
export interface Scheduler {
  set(fn: () => void, ms: number): void;
}

/** Browser scheduler. */
export const realScheduler: Scheduler = {
  set: (fn, ms) => {
    setTimeout(fn, ms);
  },
};

export const silentUI: UIBridge = {
  onSync() {},
  onAim() {},
  onScores() {},
  onBanner() {},
  onBuildCards() {},
  onDraft() {},
  onGameOver() {},
  closeOverlays() {},
};

export const silentAudio: AudioBridge = {
  fire() {},
  pop() {},
  zap() {},
  arm() {},
  thud() {},
  thunder() {},
  boom() {},
  splash() {},
  sizzle() {},
};
