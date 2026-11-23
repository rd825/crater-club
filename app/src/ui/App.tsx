import { useEffect, useRef } from 'react';
import { useGame, useVersion } from './ctx.tsx';
import { Hud } from './Hud.tsx';
import { Menu } from './Menu.tsx';
import { Draft } from './Draft.tsx';
import { Picker } from './Picker.tsx';
import { GameOver } from './GameOver.tsx';

export function App(): React.JSX.Element {
  const g = useGame();
  useVersion();
  const cvRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cvRef.current && stageRef.current) g.attach(cvRef.current, stageRef.current);
    g.boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlay = g.store.overlay;

  return (
    <div className="app">
      <Hud />
      <div className="stage" ref={stageRef}>
        <canvas id="field" ref={cvRef} />
      </div>
      {overlay === 'menu' && <Menu />}
      {overlay === 'draft' && <Draft />}
      {overlay === 'picker' && <Picker />}
      {overlay === 'over' && <GameOver />}
    </div>
  );
}
