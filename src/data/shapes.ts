// Ground-shaping tools. Verbatim port of src/a_core.js:81-86.

export interface Shape {
  name: string;
  key: string;
  desc: string;
}

export type ShapeTool = 'dig' | 'burrow' | 'wall' | 'bridge';

export const SHAPES: Record<ShapeTool, Shape> = {
  dig: { name: 'Dig', key: 'Z', desc: 'Bore a deep, widening tunnel along your barrel. Frees a buried tank.' },
  burrow: { name: 'Mound', key: 'X', desc: 'Pile up a pillar of earth under your tank and ride it to the high ground.' },
  wall: { name: 'Wall', key: 'C', desc: 'Raise a tall brick wall out ahead — cover that your own shots clear.' },
  bridge: { name: 'Bridge', key: 'V', desc: 'Lay a long bridge ahead, over gaps, water or lava.' },
};
