(() => {
'use strict';

/* ---------- constants and helpers ---------- */
const H = 600, DT = 1 / 120, REF = 1200, SIZES = { small: 880, medium: 1200, large: 1600 }, MAXP = 8, ARSENAL = 10, CELL = 2;
let W = REF;   // world width in pixels, set by the map size at the start of each match
const OOB = 'oob', GROUND = 'ground', LIQ = 'liquid';
const SEATS = [{ name: 'Mint', c: '#5ee6d0' }, { name: 'Rose', c: '#ff6b93' }, { name: 'Amber', c: '#ffa23f' }, { name: 'Lilac', c: '#c4a1ff' },
               { name: 'Azure', c: '#62b0ff' }, { name: 'Lime', c: '#b9e04c' }, { name: 'Pearl', c: '#f1ece4' }, { name: 'Ruby', c: '#e5533d' }];
const HAZ = '#fff2b8', WATERC = '#9fd4f0', LAVAC = '#ff9a3d', INK = '#120d1c';
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = a => a[(Math.random() * a.length) | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * Math.random()); };
const listNames = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* what the ground is made of: every 2 pixel cell holds one of these */
const AIR = 0, DIRT = 1, ROCK = 2, LOOSE = 3, WATER = 4, LAVA = 5, TURF = 6, BUILT = 7, STONE = 8;
const SOLID = new Uint8Array(16); for (const t of [DIRT, ROCK, LOOSE, TURF, BUILT, STONE]) SOLID[t] = 1;

/* spec fields: r blast radius, dmg, danger (how far friends should stay), flight flags, one impact kind, or self for weapons that fire nothing */
const WEAPONS = {
  shell:    { name: 'Shell',         desc: 'One honest round. Leaves a crater a tank can sit in.', rating: 2,   spec: { r: 44, dmg: 26 } },
  heavy:    { name: 'Heavy Shell',   desc: 'A wide blast that forgives a near miss and throws dirt everywhere.', rating: 3.2, spec: { r: 68, dmg: 34 } },
  crater:   { name: 'Crater Maker',  desc: 'Removes a tenth of the map. Mind your own tank.', rating: 4.5, spec: { r: 115, dmg: 44, danger: 150 } },
  three:    { name: 'Three-Way',     desc: 'Three shells fanned 6° apart.', rating: 3.4, spec: { r: 36, dmg: 17 }, fan: [-6, 0, 6] },
  scatter:  { name: 'Scattershot',   desc: 'Six pellets in a loose spread that pock the ground.', rating: 2.6, spec: { r: 22, dmg: 10 }, pellets: 6 },
  cluster:  { name: 'Cluster',       desc: 'Splits into six bomblets at the top of its arc.', rating: 3.6, spec: { r: 32, dmg: 14, split: true, danger: 130 } },
  bouncer:  { name: 'Bouncer',       desc: 'Explodes, hops, and explodes again three more times, bigger each time.', rating: 3.2, spec: { r: 28, dmg: 11, bounce: 3, grow: 9, danger: 90 } },
  roller:   { name: 'Roller',        desc: 'Lands, then rolls downhill and into tunnels until it meets a tank or a dip.', rating: 3, spec: { r: 46, dmg: 28, roll: true } },
  driller:  { name: 'Driller',       desc: 'Bores a shaft far down, then blows a cave at the bottom. Anything underground comes out.', rating: 3.2, spec: { r: 46, dmg: 24, kind: 'drill' } },
  dirt:     { name: 'Dirt Dump',     desc: 'Drops a truckload of loose dirt that pours down and buries whatever is under it.', rating: 2.4, spec: { r: 0, dmg: 0, kind: 'dirt', danger: 70 } },
  strike:   { name: 'Airstrike',     desc: 'Marks a spot, then seven bombs carpet it from above.', rating: 4, spec: { r: 14, dmg: 5, kind: 'strike', danger: 160 } },
  fountain: { name: 'Fountain',      desc: 'Bursts on impact and throws eight bomblets back into the air.', rating: 3.2, spec: { r: 26, dmg: 9, kind: 'fountain', danger: 140 } },
  cracker:  { name: 'Firecracker',   desc: 'Seven blasts march forward from where it lands, cutting a trench.', rating: 3.2, spec: { r: 30, dmg: 12, kind: 'cracker', danger: 110 } },
  needle:   { name: 'Needle',        desc: 'Punches through thin cover. Tiny blast, heavy damage on a direct hit.', rating: 3, spec: { r: 14, dmg: 58, bore: 36, boreR: 3 } },
  homer:    { name: 'Homer',         desc: 'Curves toward the nearest rival on the way down.', rating: 3.8, spec: { r: 38, dmg: 24, homing: true } },
  sauce:    { name: 'Hot Sauce',     desc: 'Splashes real lava that runs downhill and pools. A tank that ends its turn in lava burns.', rating: 3.2, spec: { r: 30, dmg: 16, kind: 'sauce', danger: 90 } },
  rail:     { name: 'Rail Slug',     desc: 'Flies dead straight and bores clean through a hillside before it goes off.', rating: 3, spec: { r: 30, dmg: 34, straight: true, bore: 90, boreR: 6 } },
  skipper:  { name: 'Skipper',       desc: 'Skips three times, chipping the ground at each touch, then goes off.', rating: 3, spec: { r: 50, dmg: 30, skip: 3 } },
  mole:     { name: 'Mole',          desc: 'Digs a real tunnel sideways through the ground and blows up when it reaches a tank.', rating: 3.2, spec: { r: 46, dmg: 30, kind: 'mole' } },
  sink:     { name: 'Sinkhole',      desc: 'The ground under it simply goes away, leaving a wide pit.', rating: 2.4, spec: { r: 60, dmg: 12, kind: 'sink', danger: 100 } },
  bags:     { name: 'Bunker',        desc: 'Fires nothing. Builds a brick wall on each side of your tank.', rating: 1.2, spec: { r: 0, dmg: 0, self: 'bags' } },
  hop:      { name: 'Hop Shell',     desc: 'Moves your tank to where it lands. Hit a tank and you trade places.', rating: 1.5, spec: { r: 0, dmg: 0, kind: 'hop' } },
  thump:    { name: 'Thumper',       desc: 'A huge shockwave that leaves the ground alone and throws tanks sideways.', rating: 2.8, spec: { r: 150, dmg: 16, kind: 'thump' } },
  airburst: { name: 'Airburst',      desc: 'Pops just above the ground and sprays nine pellets downward.', rating: 3.4, spec: { r: 22, dmg: 10, burst: true, danger: 120 } },
  boomer:   { name: 'Boomerang',     desc: 'Turns around at the top of its arc and comes back.', rating: 2.8, spec: { r: 42, dmg: 26, boom: true } },
  plumb:    { name: 'Plumb Bob',     desc: 'Stops dead at the top of its arc and drops straight down.', rating: 3, spec: { r: 44, dmg: 28, plumb: true } },
  buster:   { name: 'Bunker Buster', desc: 'Drives deep into the ground before it goes off and hollows out a cave.', rating: 3.4, spec: { r: 64, dmg: 34, pierce: true } },
  leveler:  { name: 'Leveler',       desc: 'Flattens a wide stretch of ground. Shaves the hills and fills the pits.', rating: 2.4, spec: { r: 80, dmg: 14, kind: 'level', danger: 150 } },
  arc:      { name: 'Arc Coil',      desc: 'After the blast, a spark jumps to the next two tanks in reach.', rating: 3.6, spec: { r: 30, dmg: 22, kind: 'arc' } },
  swipe:    { name: 'Pickpocket',    desc: 'A direct hit takes 15 from them and gives it to you.', rating: 3.2, spec: { r: 28, dmg: 14, kind: 'steal' } },
  marbles:  { name: 'Marbles',       desc: 'Four rollers that fan out and chase the slope.', rating: 3, spec: { r: 28, dmg: 13, roll: true }, fan: [-7, -2.5, 2.5, 7] },
  double:   { name: 'Double Tap',    desc: 'Two shells on the same line. The second lands in the crater of the first.', rating: 3.2, spec: { r: 42, dmg: 20 }, repeat: 2, gap: 0.3, jitter: 0 },
  stutter:  { name: 'Stutter Gun',   desc: 'Eight small rounds in a quick, shaky burst that chews through cover.', rating: 3, spec: { r: 18, dmg: 8 }, repeat: 8, gap: 0.1, jitter: 1.6 },
  hole:     { name: 'Black Hole',    desc: 'Opens a singularity that eats the ground and drags tanks in, then pops.', rating: 3.8, spec: { r: 60, dmg: 20, kind: 'hole', danger: 210 } },
  swarm:    { name: 'Hornet Nest',   desc: 'Cracks open and releases eight hornets that chase the nearest rival. Ground stops them.', rating: 3.2, spec: { r: 20, dmg: 6, kind: 'swarm', danger: 90 } },
  hiccup:   { name: 'Hiccup Gas',    desc: 'Any tank caught in the cloud hiccups on its next shot and fires off line.', rating: 2.6, spec: { r: 20, dmg: 6, kind: 'hiccup', danger: 90 } },
  bubble:   { name: 'Soap Bubble',   desc: 'Fires nothing. Wraps your tank in a bubble that soaks up the next 35 damage.', rating: 1.6, spec: { r: 0, dmg: 0, self: 'bubble' } },
  lift:     { name: 'High Ground',   desc: 'Fires nothing. Raises a tall plateau under your tank.', rating: 1.3, spec: { r: 0, dmg: 0, self: 'lift' } },
  geyser:   { name: 'Geyser',        desc: 'Erupts real water, floods the hole, and throws the tank it hits into the air.', rating: 2.8, spec: { r: 36, dmg: 14, kind: 'geyser' } },
  thunder:  { name: 'Thunderhead',   desc: 'Calls four lightning strikes somewhere around where it lands.', rating: 3.4, spec: { r: 14, dmg: 5, kind: 'thunder', danger: 170 } },
  smoke:    { name: 'Smoke Screen',  desc: 'Hides a wide patch of the map for two rounds. Computers aim worse into it.', rating: 1.4, spec: { r: 0, dmg: 0, kind: 'smoke' } },
  pinball:  { name: 'Pinball',       desc: 'Bounces off the side walls of the map. Try a bank shot.', rating: 2.8, spec: { r: 46, dmg: 28, walls: true } },
  chute:    { name: 'Parachute Bomb', desc: 'Opens a chute at the top of its arc and drifts down on the wind. Enormous blast.', rating: 3.6, spec: { r: 76, dmg: 34, chute: true } },
  prism:    { name: 'Prism',         desc: 'Hangs in the air and burns nine light rays down into the ground.', rating: 3.2, spec: { r: 12, dmg: 8, kind: 'prism', danger: 150 } },
  sticky:   { name: 'Sticky Bomb',   desc: 'Sticks where it lands and goes off after the next tank fires. Huge blast, time to drive away.', rating: 3.4, spec: { r: 88, dmg: 40, kind: 'sticky' } },
  phantom:  { name: 'Phantom',       desc: 'Passes straight through the ground. Only a direct hit on a tank counts.', rating: 2.8, spec: { r: 24, dmg: 32, ghost: true } },
  saw:      { name: 'Buzzsaw',       desc: 'Cuts a trench along the surface and straight through walls until it reaches a tank.', rating: 2.8, spec: { r: 30, dmg: 24, kind: 'saw' } },
  frog:     { name: 'Frog',          desc: 'Lands with a pop, then hops three times toward the nearest rival and blows up.', rating: 3.2, spec: { r: 38, dmg: 22, hops: 3 } },
  encore:   { name: 'Encore',        desc: 'Repeats the last weapon anyone fired.', rating: 2.8, spec: { r: 44, dmg: 26, meta: true } },
  mystery:  { name: 'Mystery Box',   desc: 'Turns into a random weapon the moment you fire it.', rating: 2.6, spec: { r: 44, dmg: 26, meta: true } },
};
const WEAPON_IDS = Object.keys(WEAPONS), KINDS = WEAPON_IDS.length;
const MYSTERY_POOL = WEAPON_IDS.filter(id => id !== 'encore' && id !== 'mystery');
const TRACER = { name: 'Tracer', desc: 'Five free ranging shots: one on your aim, then 5° and 10° above and below it. Flags show where each lands. No damage.', fan: [-10, -5, 0, 5, 10], spec: { r: 0, dmg: 0, tracer: true } };
const SHAPES = {
  dig:    { name: 'Dig',    key: 'Z', desc: 'Cut a tunnel along your barrel. Frees a buried tank.' },
  burrow: { name: 'Burrow', key: 'X', desc: 'Drop your tank into a foxhole. Only steep shots get out.' },
  wall:   { name: 'Wall',   key: 'C', desc: 'Raise a brick wall in front of your tank.' },
  bridge: { name: 'Bridge', key: 'V', desc: 'Lay a bridge ahead, over gaps, water or lava.' },
};

const LEVELS = {
  rookie:  { label: 'Rookie',  sa: 9,   sp: 10,  learn: 0.93, floor: 0.6, dodge: 0,    smart: 0 },
  regular: { label: 'Regular', sa: 4.5, sp: 5.5, learn: 0.8,  floor: 0.4, dodge: 0.15, smart: 0.5 },
  veteran: { label: 'Veteran', sa: 2,   sp: 2.4, learn: 0.7,  floor: 0.3, dodge: 0.35, smart: 1 },
  ace:     { label: 'Ace',     sa: 0.4, sp: 0.45, learn: 0.6, floor: 0.5, dodge: 0.6,  smart: 1 },
};

const BIOMES = {
  hills:   { label: 'Foothills', top: '#3f6a3c', bot: '#172419', line: '#b5e86f', turf: '#5c9a3e', dust: '#9c8a5a', prop: 'tree',   pc: '#234a2b', blurb: 'Rolling green hills with a pond and water pockets underground.' },
  mesa:    { label: 'Mesa',      top: '#b9683d', bot: '#4f2418', line: '#f6c88f', turf: '#dc9360', dust: '#d9a273', prop: 'cactus', pc: '#3f6a45', blurb: 'Flat-topped terraces over hollow caves.' },
  peaks:   { label: 'Peaks',     top: '#66758e', bot: '#232a3a', line: '#f5f9ff', turf: '#e3ebf7', dust: '#c9d3e4', prop: 'pine',   pc: '#27433c', blurb: 'Sharp ridges with a lake in the lowest valley.' },
  islands: { label: 'Islands',   top: '#c7a565', bot: '#4f3c29', line: '#f6e6ad', turf: '#e6d291', dust: '#d8c08a', prop: 'palm',   pc: '#2f6a45', sea: 446, blurb: 'Low ground is under real water. Tanks float, and a big enough crater floods.' },
  canyon:  { label: 'Canyon',    top: '#a54b3a', bot: '#371720', line: '#ffb48a', turf: '#cf6f52', dust: '#c98a70', prop: 'cactus', pc: '#5a5a34', blurb: 'High rims over a gorge with a river, and lava deep under one side.' },
  caldera: { label: 'Caldera',   top: '#2e2428', bot: '#0c090b', line: '#ff7a3c', turf: '#6a2a18', dust: '#6b5a5a', prop: 'snag',   pc: '#17100f', embers: true, blurb: 'A volcanic cone with a lava lake in the crater and a magma chamber below.' },
  moon:    { label: 'Moon',      top: '#8d8d99', bot: '#2c2c36', line: '#e6e6f0', turf: '#b4b4c0', dust: '#b9b9c4', prop: 'rock',   pc: '#5c5c68', space: true, blurb: 'Low gravity, no wind, hollow lava tubes. Only meteors count as weather there.' },
};
const TIMES = {
  dawn:  { label: 'dawn',  sky: ['#2b3a67', '#8e6fa3', '#f2a28c', '#ffd9a6'], orb: { x: 290, y: 392, r: 70, c: '#ffe7b8', glow: '255,214,170' }, stars: 0.2, ridge: ['#8d6f9c', '#614f80'], tint: [255, 150, 110, 0.10], cloud: 0.5, haze: '#f7c2a0' },
  noon:  { label: 'noon',  sky: ['#2f7fd1', '#69aee8', '#a9d6f5', '#dff1fb'], orb: { x: 900, y: 105, r: 44, c: '#fff7cf', glow: '255,250,210' }, stars: 0, ridge: ['#93b6d6', '#7096ba'], tint: null, cloud: 0.85, haze: '#cfe6f6' },
  dusk:  { label: 'dusk',  sky: ['#171231', '#4b2a5e', '#c2546e', '#ffb07a'], orb: { x: 815, y: 312, r: 92, c: '#ffdc9c', glow: '255,214,150' }, stars: 0.8, ridge: ['#643363', '#452552'], tint: [60, 20, 70, 0.22], cloud: 0.22, haze: '#e88a7a' },
  night: { label: 'night', sky: ['#05060f', '#0c1230', '#1b2350', '#2d3a6b'], orb: { x: 910, y: 120, r: 34, c: '#e9edff', glow: '200,210,255', moon: true }, stars: 1, ridge: ['#1d2649', '#141a36'], tint: [8, 10, 40, 0.42], cloud: 0.1, haze: '#2d3a6b' },
  space: { label: '',      sky: ['#000003', '#04040a', '#080812', '#0d0d18'], orb: { x: 900, y: 130, r: 50, c: '#3f7fd6', glow: '90,150,255', earth: true }, stars: 1, ridge: ['#3c3c48', '#2b2b35'], tint: null, cloud: 0, haze: '#1a1a26' },
};
const WEATHER = {
  clear:   { label: 'clear',   blurb: 'Clear skies. No surprises.' },
  rain:    { label: 'rain',    over: 0.35, blurb: 'Rain slowly fills craters and tunnels with water. Lava splashes are smaller.' },
  snow:    { label: 'snow',    over: 0.28, blurb: 'Snow. Rollers and marbles bog down quickly.' },
  fog:     { label: 'fog',     over: 0.25, blurb: 'Fog hides the trace of your last shot.' },
  storm:   { label: 'storm',   over: 0.55, blurb: 'Gusting wind, heavy rain that floods low ground, and lightning after some shots.' },
  meteors: { label: 'meteors', blurb: 'Stray rocks may fall after any shot and punch new craters.' },
};

/* ---------- state ---------- */
const cv = $('field'), ctx = cv.getContext('2d');
let S = null;            // current game
let G = null;            // its ground grid
let paused = false, armed = false, preview = null;
let stable = {};         // last resumable snapshot (start of a turn)
let soundOn = true, AC = null;
const TYPES = ['human', 'rookie', 'regular', 'veteran', 'ace'];
let settings = { players: [{ type: 'human' }, { type: 'regular' }], mode: 'volleys', volleys: 10, health: 150, deal: 'draft', teams: 'ffa', confirm: 'on',
                 size: 'auto', biome: 'random', time: 'random', weather: 'clear', wind: 'calm' };
const OPTS = {
  mode: [['volleys', 'Most damage dealt'], ['health', 'Last tank standing']],
  deal: [['draft', 'Draft them in turn'], ['random', 'Random deal']],
  confirm: [['on', 'On'], ['off', 'Off']],
  teams: [['ffa', 'Everyone for themselves'], ['teams', 'Two teams, left against right']],
  biome: [['random', 'Random']].concat(Object.keys(BIOMES).map(k => [k, BIOMES[k].label])),
  size: [['auto', 'Auto'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']],
  time: [['random', 'Random'], ['dawn', 'Dawn'], ['noon', 'Noon'], ['dusk', 'Dusk'], ['night', 'Night']],
  weather: [['random', 'Random'], ['clear', 'Clear'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog'], ['storm', 'Storm'], ['meteors', 'Meteors']],
  wind: [['calm', 'Calm'], ['breeze', 'Breeze'], ['gusty', 'Gusty']],
};
try {
  const s = JSON.parse(localStorage.getItem('craterclub.settings.v3') || 'null');
  if (s && typeof s === 'object') {
    for (const k in OPTS) if (OPTS[k].some(o => o[0] === s[k])) settings[k] = s[k];
    if (Array.isArray(s.players) && s.players.length >= 2 && s.players.length <= MAXP && s.players.every(p => p && TYPES.includes(p.type))) settings.players = s.players.map(p => ({ type: p.type }));
    if (Number.isInteger(s.volleys) && s.volleys >= 1 && s.volleys <= 60) settings.volleys = s.volleys;
    if (Number.isInteger(s.health) && s.health >= 20 && s.health <= 999) settings.health = s.health;
  }
} catch (e) {}

const cur = () => S.tanks[S.turn];
const colorOf = o => o < 0 ? HAZ : S.tanks[o].color;
const sameTeam = (a, b) => S.teamOf[a] === S.teamOf[b];
const canHuman = () => S && !S.demo && !paused && S.phase === 'aim' && !cur().isAI && !cur().dead && !(cur().moveLeft > 0);
const nearestRival = (o, x) => { let best = null, bd = 1e9; for (const k of S.live) if (o < 0 || !sameTeam(k.id, o)) { const d = Math.abs(k.x - x); if (d < bd) { bd = d; best = k; } } return best; };
const floatText = (k, text, c) => S.floats.push({ x: k.x + rand(-10, 10), y: k.y - 30 - rand(0, 14), t: 0, text, c });

