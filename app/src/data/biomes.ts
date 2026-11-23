// Terrains. Verbatim port of src/a_core.js:95-103.

export interface Biome {
  label: string;
  top: string; // sky-side dirt gradient
  bot: string; // deep dirt gradient
  line: string; // surface highlight
  turf: string;
  dust: string; // debris color
  prop: string; // scenery sprite name
  pc: string; // prop color
  blurb: string;
  sea?: number; // sea level px (islands)
  embers?: boolean; // caldera
  space?: boolean; // moon: low gravity, no wind
}

export const BIOMES: Record<string, Biome> = {
  hills: { label: 'Foothills', top: '#3f6a3c', bot: '#172419', line: '#b5e86f', turf: '#5c9a3e', dust: '#9c8a5a', prop: 'tree', pc: '#234a2b', blurb: 'Rolling green hills with a pond and water pockets underground.' },
  mesa: { label: 'Mesa', top: '#b9683d', bot: '#4f2418', line: '#f6c88f', turf: '#dc9360', dust: '#d9a273', prop: 'cactus', pc: '#3f6a45', blurb: 'Flat-topped terraces over hollow caves.' },
  peaks: { label: 'Peaks', top: '#66758e', bot: '#232a3a', line: '#f5f9ff', turf: '#e3ebf7', dust: '#c9d3e4', prop: 'pine', pc: '#27433c', blurb: 'Sharp ridges with a lake in the lowest valley.' },
  islands: { label: 'Islands', top: '#c7a565', bot: '#4f3c29', line: '#f6e6ad', turf: '#e6d291', dust: '#d8c08a', prop: 'palm', pc: '#2f6a45', sea: 446, blurb: 'Low ground is under real water. Tanks float, and a big enough crater floods.' },
  canyon: { label: 'Canyon', top: '#a54b3a', bot: '#371720', line: '#ffb48a', turf: '#cf6f52', dust: '#c98a70', prop: 'cactus', pc: '#5a5a34', blurb: 'High rims over a gorge with a river, and lava deep under one side.' },
  caldera: { label: 'Caldera', top: '#2e2428', bot: '#0c090b', line: '#ff7a3c', turf: '#6a2a18', dust: '#6b5a5a', prop: 'snag', pc: '#17100f', embers: true, blurb: 'A volcanic cone with a lava lake in the crater and a magma chamber below.' },
  moon: { label: 'Moon', top: '#8d8d99', bot: '#2c2c36', line: '#e6e6f0', turf: '#b4b4c0', dust: '#b9b9c4', prop: 'rock', pc: '#5c5c68', space: true, blurb: 'Low gravity, no wind, hollow lava tubes. Only meteors count as weather there.' },
};
