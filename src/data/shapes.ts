// Ground-shaping tools. Verbatim port of src/a_core.js:81-86.

export interface Shape {
  name: string;
  key: string;
  desc: string;
}

export type ShapeTool = 'dig' | 'burrow' | 'wall' | 'bridge';

export const SHAPES: Record<ShapeTool, Shape> = {
  dig: { name: 'Dig', key: 'Z', desc: 'Cut a tunnel along your barrel. Frees a buried tank.' },
  burrow: { name: 'Burrow', key: 'X', desc: 'Drop your tank into a foxhole. Only steep shots get out.' },
  wall: { name: 'Wall', key: 'C', desc: 'Raise a brick wall in front of your tank.' },
  bridge: { name: 'Bridge', key: 'V', desc: 'Lay a bridge ahead, over gaps, water or lava.' },
};
