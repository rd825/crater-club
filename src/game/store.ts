// A minimal external store for useSyncExternalStore. The engine state is read directly by
// React components; this store only carries a version counter that bumps when the engine
// signals a UI-relevant change, plus the overlay/draft/gameover view state.

import type { DraftView, GameOverResult } from '../engine/types.ts';

export type Overlay = 'menu' | 'draft' | 'picker' | 'over' | null;

export class Store {
  version = 0;
  overlay: Overlay = 'menu';
  draftView: DraftView | null = null;
  overResult: GameOverResult | null = null;
  soundState: 'off' | 'paused' | 'on' = 'on';
  /** A resumable match snapshot is in localStorage (enables the menu's Resume button). */
  hasResume = false;

  private listeners = new Set<() => void>();

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): number => this.version;

  bump(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}
