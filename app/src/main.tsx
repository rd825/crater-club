import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameController } from './game/controller.ts';
import { GameCtx } from './ui/ctx.tsx';
import { App } from './ui/App.tsx';
import './styles.css';

const controller = new GameController();
// Exposed for end-to-end tests to drive and inspect the game. Attached only in dev (`vite dev`)
// and in the e2e build (`vite build --mode e2e`, used by playwright.config.ts) — never in a
// plain production `vite build`, so real deploys don't ship the hook.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  (window as unknown as { __crater?: GameController }).__crater = controller;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameCtx.Provider value={controller}>
      <App />
    </GameCtx.Provider>
  </StrictMode>,
);
