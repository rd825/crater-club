import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameController } from '../game/controller.ts';

export const GameCtx = createContext<GameController | null>(null);

export function useGame(): GameController {
  const g = useContext(GameCtx);
  if (!g) throw new Error('GameController not provided');
  return g;
}

/** Re-render whenever the engine signals a UI change. */
export function useVersion(): number {
  const g = useGame();
  return useSyncExternalStore(g.store.subscribe, g.store.getSnapshot, g.store.getSnapshot);
}
