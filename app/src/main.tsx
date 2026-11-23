import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameController } from './game/controller.ts';
import { GameCtx } from './ui/ctx.tsx';
import { App } from './ui/App.tsx';
import './styles.css';

const controller = new GameController();
// Exposed for end-to-end tests to drive and inspect the game.
(window as unknown as { __crater?: GameController }).__crater = controller;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameCtx.Provider value={controller}>
      <App />
    </GameCtx.Provider>
  </StrictMode>,
);
