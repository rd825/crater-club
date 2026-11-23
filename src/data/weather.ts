// Weather. Verbatim port of src/a_core.js:111-118.

export interface Weather {
  label: string;
  over?: number; // overcast overlay opacity
  blurb: string;
}

export const WEATHER: Record<string, Weather> = {
  clear: { label: 'clear', blurb: 'Clear skies. No surprises.' },
  rain: { label: 'rain', over: 0.35, blurb: 'Rain slowly fills craters and tunnels with water. Lava splashes are smaller.' },
  snow: { label: 'snow', over: 0.28, blurb: 'Snow. Rollers and marbles bog down quickly.' },
  fog: { label: 'fog', over: 0.25, blurb: 'Fog hides the trace of your last shot.' },
  storm: { label: 'storm', over: 0.55, blurb: 'Gusting wind, heavy rain that floods low ground, and lightning after some shots.' },
  meteors: { label: 'meteors', blurb: 'Stray rocks may fall after any shot and punch new craters.' },
};
