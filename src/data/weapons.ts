// The 50 weapons + Tracer. Verbatim port of src/a_core.js:26-80.
// spec fields: r blast radius, dmg, danger (how far friends should stay), flight flags,
// one impact `kind`, or `self` for weapons that fire nothing.

export type WeaponKind =
  | 'drill'
  | 'dirt'
  | 'strike'
  | 'fountain'
  | 'cracker'
  | 'sauce'
  | 'mole'
  | 'sink'
  | 'hop'
  | 'thump'
  | 'level'
  | 'arc'
  | 'steal'
  | 'hole'
  | 'swarm'
  | 'hiccup'
  | 'geyser'
  | 'thunder'
  | 'smoke'
  | 'prism'
  | 'sticky'
  | 'saw';

export type SelfKind = 'bubble';

export interface WeaponSpec {
  r: number; // blast radius
  dmg: number; // base damage
  danger?: number; // how far friends should stay (AI self-safety)
  // flight / behavior flags
  split?: boolean;
  roll?: boolean;
  homing?: boolean;
  straight?: boolean;
  burst?: boolean;
  boom?: boolean; // boomerang
  plumb?: boolean;
  pierce?: boolean;
  walls?: boolean;
  chute?: boolean;
  ghost?: boolean;
  meta?: boolean; // encore / mystery
  coin?: boolean; // Coin Toss: on-impact coin flip that triples damage when it lands golden
  tracer?: boolean;
  bounce?: number;
  grow?: number;
  skip?: number;
  hops?: number;
  bore?: number;
  boreR?: number;
  kind?: WeaponKind;
  self?: SelfKind;
}

export interface Weapon {
  name: string;
  desc: string;
  rating?: number; // every drafted weapon has one; Tracer (never drafted) omits it
  spec: WeaponSpec;
  fan?: number[]; // angle offsets in degrees
  pellets?: number;
  repeat?: number;
  gap?: number;
  jitter?: number;
}

export const WEAPONS: Record<string, Weapon> = {
  shell: { name: 'Shell', desc: 'One honest round. Leaves a crater a tank can sit in.', rating: 2, spec: { r: 44, dmg: 26 } },
  heavy: { name: 'Heavy Shell', desc: 'A wide blast that forgives a near miss and throws dirt everywhere.', rating: 3.2, spec: { r: 68, dmg: 34 } },
  crater: { name: 'Crater Maker', desc: 'Removes a tenth of the map. Mind your own tank.', rating: 4.5, spec: { r: 115, dmg: 44, danger: 150 } },
  three: { name: 'Three-Way', desc: 'Three shells fanned 6° apart.', rating: 3.4, spec: { r: 36, dmg: 17 }, fan: [-6, 0, 6] },
  scatter: { name: 'Scattershot', desc: 'Six pellets in a loose spread that pock the ground.', rating: 2.6, spec: { r: 22, dmg: 10 }, pellets: 6 },
  cluster: { name: 'Cluster', desc: 'Splits into six bomblets at the top of its arc.', rating: 3.6, spec: { r: 32, dmg: 14, split: true, danger: 130 } },
  bouncer: { name: 'Bouncer', desc: 'Explodes, hops, and explodes again three more times, bigger each time.', rating: 3.2, spec: { r: 28, dmg: 11, bounce: 3, grow: 9, danger: 90 } },
  roller: { name: 'Roller', desc: 'Lands, then rolls downhill and into tunnels until it meets a tank or a dip.', rating: 3, spec: { r: 46, dmg: 28, roll: true } },
  driller: { name: 'Driller', desc: 'Bores a shaft far down, then blows a cave at the bottom. Anything underground comes out.', rating: 3.2, spec: { r: 46, dmg: 24, kind: 'drill' } },
  dirt: { name: 'Dirt Dump', desc: 'Drops a truckload of loose dirt that pours down and buries whatever is under it.', rating: 2.4, spec: { r: 0, dmg: 0, kind: 'dirt', danger: 70 } },
  strike: { name: 'Airstrike', desc: 'Marks a spot, then seven bombs carpet it from above.', rating: 4, spec: { r: 14, dmg: 5, kind: 'strike', danger: 160 } },
  fountain: { name: 'Fountain', desc: 'Bursts on impact and throws eight bomblets back into the air.', rating: 3.2, spec: { r: 26, dmg: 9, kind: 'fountain', danger: 140 } },
  cracker: { name: 'Firecracker', desc: 'Seven blasts march forward from where it lands, cutting a trench.', rating: 3.2, spec: { r: 30, dmg: 12, kind: 'cracker', danger: 110 } },
  needle: { name: 'Needle', desc: 'Punches through thin cover. Tiny blast, heavy damage on a direct hit.', rating: 3, spec: { r: 14, dmg: 58, bore: 36, boreR: 3 } },
  homer: { name: 'Homer', desc: 'Curves toward the nearest rival on the way down.', rating: 3.8, spec: { r: 38, dmg: 24, homing: true } },
  sauce: { name: 'Hot Sauce', desc: 'Splashes real lava that runs downhill and pools. A tank that ends its turn in lava burns.', rating: 3.2, spec: { r: 30, dmg: 16, kind: 'sauce', danger: 90 } },
  rail: { name: 'Rail Slug', desc: 'Flies dead straight and tears through any terrain in its path until it reaches a tank or flies off the map.', rating: 3, spec: { r: 30, dmg: 34, straight: true, bore: 100000, boreR: 6 } },
  skipper: { name: 'Skipper', desc: 'Skips three times, chipping the ground at each touch, then goes off.', rating: 3, spec: { r: 50, dmg: 30, skip: 3 } },
  mole: { name: 'Mole', desc: 'Digs a real tunnel sideways through the ground and blows up when it reaches a tank.', rating: 3.2, spec: { r: 46, dmg: 30, kind: 'mole' } },
  sink: { name: 'Sinkhole', desc: 'The ground under it simply goes away, leaving a wide pit.', rating: 2.4, spec: { r: 60, dmg: 12, kind: 'sink', danger: 100 } },
  cointoss: { name: 'Coin Toss', desc: 'Flip a coin downrange: lands golden and it hits for triple, otherwise an honest shot.', rating: 3, spec: { r: 40, dmg: 18, coin: true } },
  hop: { name: 'Hop Shell', desc: 'Moves your tank to where it lands. Hit a tank and you trade places.', rating: 1.5, spec: { r: 0, dmg: 0, kind: 'hop' } },
  thump: { name: 'Thumper', desc: 'A huge shockwave that leaves the ground alone and throws tanks sideways.', rating: 2.8, spec: { r: 150, dmg: 16, kind: 'thump' } },
  airburst: { name: 'Airburst', desc: 'Pops just above the ground and sprays nine pellets downward.', rating: 3.4, spec: { r: 22, dmg: 10, burst: true, danger: 120 } },
  boomer: { name: 'Grenade', desc: 'Lobs over cover, bounces once a little bigger, and blasts where it settles.', rating: 2.8, spec: { r: 50, dmg: 27, bounce: 1, grow: 10, danger: 80 } },
  plumb: { name: 'Plumb Bob', desc: 'Stops dead at the top of its arc and drops straight down.', rating: 3, spec: { r: 44, dmg: 28, plumb: true } },
  buster: { name: 'Bunker Buster', desc: 'Drives deep into the ground before it goes off and hollows out a cave.', rating: 3.4, spec: { r: 64, dmg: 34, pierce: true } },
  leveler: { name: 'Leveler', desc: 'Flattens a wide stretch of ground. Shaves the hills and fills the pits.', rating: 2.4, spec: { r: 80, dmg: 14, kind: 'level', danger: 150 } },
  arc: { name: 'Arc Coil', desc: 'After the blast, a spark jumps to the next two tanks in reach.', rating: 3.6, spec: { r: 30, dmg: 22, kind: 'arc' } },
  swipe: { name: 'Pickpocket', desc: 'A direct hit takes 15 from them and gives it to you.', rating: 3.2, spec: { r: 28, dmg: 14, kind: 'steal' } },
  marbles: { name: 'Marbles', desc: 'Four rollers that fan out and chase the slope.', rating: 3, spec: { r: 28, dmg: 13, roll: true }, fan: [-7, -2.5, 2.5, 7] },
  double: { name: 'Double Tap', desc: 'Two shells on the same line. The second lands in the crater of the first.', rating: 3.2, spec: { r: 42, dmg: 20 }, repeat: 2, gap: 0.3, jitter: 0 },
  stutter: { name: 'Stutter Gun', desc: 'Eight small rounds in a quick, shaky burst that chews through cover.', rating: 3, spec: { r: 18, dmg: 8 }, repeat: 8, gap: 0.1, jitter: 1.6 },
  hole: { name: 'Black Hole', desc: 'Opens a singularity that eats the ground and drags tanks in, then pops.', rating: 3.8, spec: { r: 60, dmg: 20, kind: 'hole', danger: 210 } },
  swarm: { name: 'Hornet Nest', desc: 'Cracks open and releases eight hornets that chase the nearest rival. Ground stops them.', rating: 3.2, spec: { r: 20, dmg: 6, kind: 'swarm', danger: 90 } },
  hiccup: { name: 'Hiccup Gas', desc: 'Any tank caught in the cloud fires its next shot inverted: mirrored angle and flipped power.', rating: 2.6, spec: { r: 20, dmg: 6, kind: 'hiccup', danger: 90 } },
  bubble: { name: 'Soap Bubble', desc: 'Fires nothing. Wraps your tank in a bubble that blocks the next hit entirely, then pops.', rating: 1.6, spec: { r: 0, dmg: 0, self: 'bubble' } },
  lift: { name: 'Mortar', desc: 'A heavy shell on a steep, lazy arc. Wide, reliable blast where it drops.', rating: 3, spec: { r: 60, dmg: 32, danger: 70 } },
  geyser: { name: 'Geyser', desc: 'Erupts real water, floods the hole, and throws the tank it hits into the air.', rating: 2.8, spec: { r: 36, dmg: 14, kind: 'geyser' } },
  thunder: { name: 'Thunderhead', desc: 'Calls four lightning strikes somewhere around where it lands.', rating: 3.4, spec: { r: 14, dmg: 5, kind: 'thunder', danger: 170 } },
  nuke: { name: 'Nuke', desc: 'The big one. A compact blast that hits harder than anything else on the field.', rating: 4.6, spec: { r: 50, dmg: 60, danger: 110 } },
  pinball: { name: 'Pinball', desc: 'Bounces off the side walls of the map. Try a bank shot.', rating: 2.8, spec: { r: 46, dmg: 28, walls: true } },
  chute: { name: 'Parachute Bomb', desc: 'Opens a chute at the top of its arc and drifts down on the wind. Enormous blast.', rating: 3.6, spec: { r: 76, dmg: 34, chute: true } },
  prism: { name: 'Prism', desc: 'Hangs in the air and burns nine light rays down into the ground.', rating: 3.2, spec: { r: 12, dmg: 8, kind: 'prism', danger: 150 } },
  sticky: { name: 'Sticky Bomb', desc: 'Sticks where it lands and goes off after the next tank fires. Huge blast, time to drive away.', rating: 3.4, spec: { r: 88, dmg: 40, kind: 'sticky' } },
  phantom: { name: 'Phantom', desc: 'Flies dead straight — through hills and through tank after tank, striking every rival on its line.', rating: 3.6, spec: { r: 24, dmg: 32, ghost: true, straight: true } },
  saw: { name: 'Buzzsaw', desc: 'Cuts a trench along the surface and straight through walls until it reaches a tank.', rating: 2.8, spec: { r: 30, dmg: 24, kind: 'saw' } },
  frog: { name: 'Frog', desc: 'Lands with a pop, then hops three times toward the nearest rival and blows up.', rating: 3.2, spec: { r: 38, dmg: 22, hops: 3 } },
  encore: { name: 'Encore', desc: 'Repeats the last weapon anyone fired.', rating: 2.8, spec: { r: 44, dmg: 26, meta: true } },
  mystery: { name: 'Mystery Box', desc: 'Turns into a random weapon the moment you fire it.', rating: 2.6, spec: { r: 44, dmg: 26, meta: true } },
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const KINDS = WEAPON_IDS.length;
export const MYSTERY_POOL = WEAPON_IDS.filter((id) => id !== 'encore' && id !== 'mystery');

export const TRACER: Weapon = {
  name: 'Tracer',
  desc: 'Five free ranging shots: one on your aim, then 5° and 10° above and below it. Flags show where each lands. No damage.',
  fan: [-10, -5, 0, 5, 10],
  spec: { r: 0, dmg: 0, tracer: true },
};
