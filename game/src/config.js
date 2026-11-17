// Beaconkeeper — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size. The sea fills most
// of the field, the coast and breakwater run along the bottom edge, and the
// lighthouse stands on the headland at the bottom left.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The lighthouse rock at the bottom left; the beam starts at the lamp room. */
export const LIGHTHOUSE = { x: 120, y: 648 };
export const LAMP = { x: 120, y: 552 };

/** The beam: a wedge from the lamp to the bright pool. The pool is where the
 * keeper aims it — the mouse sets its distance, clamped to this range. */
export const BEAM = {
  minLength: 150,
  maxLength: 1200,
  /** Half-angle of the cone, in radians: wide enough to light a small group. */
  halfAngle: 0.3,
};

/** The harbour gap in the breakwater along the bottom edge, and its centre. */
export const HARBOR = { x0: 1020, x1: 1140, y: 706, cx: 1080, cy: 712 };

/** The current that carries every ship: down, and gently toward the harbour. */
export const CURRENT = { x: 6, y: 16 };

export const NIGHTS = 3;
/** Seconds of play in one night, before dawn breaks. */
export const NIGHT_SECONDS = 75;
/** Ships to save in each night, or the dawn ends the game. */
export const QUOTA = [4, 6, 8];
/** Seconds between ship spawns, per night. */
export const SPAWN_INTERVAL = [4.2, 3.4, 2.8];
/** How many ships can be at sea at once. */
export const MAX_SHIPS = 7;

export const LIVES = 3;

/** Ship kinds: speed in px/s, turn rate in rad/s, hull radius, save points. */
export const SHIP_TYPES = {
  sloop: { speed: 60, turn: 1.7, radius: 13, base: 100 },
  brig: { speed: 48, turn: 1.35, radius: 16, base: 150 },
  galleon: { speed: 36, turn: 1.05, radius: 20, base: 250 },
};

/** Foghorn: how many blasts are held, how fast one comes back, how far the
 * blast reaches from the bright pool, how long a horned ship is boosted. */
export const HORN = {
  charges: 3,
  max: 3,
  recharge: 14,
  radius: 300,
  boost: 4,
  speedMult: 1.6,
};

/** Flare: lights the whole coast for a few seconds and shoves storm cells away. */
export const FLARE = { charges: 2, duration: 3 };

export const ROCKS = { min: 8, max: 12 };
export const FOGS = { min: 3, max: 5 };
export const STORMS = { min: 1, max: 3 };

/** A lit ship keeps steering at the pool for this long after the beam leaves it. */
export const LIT_MEMORY = 2.0;

export const PALETTE = {
  backdrop: '#05070d',
  skyTop: '#0a1026',
  skyHorizon: '#1d2f52',
  seaTop: '#123349',
  seaDeep: '#071a2a',
  moon: '#f4ead0',
  moonGlint: '#e8d9a8',
  coast: '#1a2027',
  breakwater: '#2b333d',
  breakwaterTop: '#46525f',
  harbourLight: '#ffd97a',
  beam: '#ffe9a8',
  fog: '#b8c9dd',
  storm: '#0d1526',
  rock: '#232a33',
  rockTop: '#3a4552',
  foam: '#cfe3ef',
  panel: '#101623',
  panelEdge: '#2c3a52',
  text: '#eef1f5',
  muted: '#93a0b4',
  gold: '#f2c94c',
  danger: '#e5534b',
  heart: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'beaconkeeper.best';
