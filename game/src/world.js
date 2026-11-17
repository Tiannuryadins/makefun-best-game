// Beaconkeeper's rules and state, with no drawing and no browser in it: the
// ships, the rocks, the fog, the storms, the lighthouse beam, the nights, the
// score and the lives. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing
// about screens or sound. The only randomness comes from the seeded generator
// handed to createWorld — no Date.now, no Math.random anywhere in this file —
// so the same seed always plays the same night.
import {
  BEAM,
  CURRENT,
  FIELD,
  FLARE,
  FOGS,
  HARBOR,
  HORN,
  LAMP,
  LIGHTHOUSE,
  LIT_MEMORY,
  LIVES,
  MAX_SHIPS,
  NIGHTS,
  NIGHT_SECONDS,
  QUOTA,
  ROCKS,
  SHIP_TYPES,
  SPAWN_INTERVAL,
  STORMS,
} from './config.js';

export const KIND_SLOOP = 'sloop';
export const KIND_BRIG = 'brig';
export const KIND_GALLEON = 'galleon';

export const EVENT_SAVE = 1;
export const EVENT_WRECK = 2;
export const EVENT_OVER = 4;
export const EVENT_DAWN = 8;
export const EVENT_WIN = 16;
export const EVENT_THUNDER = 32;
export const EVENT_HORN = 64;
export const EVENT_FLARE = 128;

const TAU = Math.PI * 2;

/** Smallest signed angle from `from` to `to`, in (-PI, PI]. */
function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  return d;
}

/** Turn `heading` toward `target` by at most `maxTurn` radians. */
function turnToward(heading, target, maxTurn) {
  const d = angleDiff(heading, target);
  if (d > maxTurn) return heading + maxTurn;
  if (d < -maxTurn) return heading - maxTurn;
  return target;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Distance from point P to segment AB. */
function segmentPointDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return distance(px, py, ax + t * dx, ay + t * dy);
}

/** One ship, fresh from the edge of the sea. */
function spawnShip(state, random) {
  const roll = random();
  const type = roll < 0.5 ? KIND_SLOOP : roll < 0.8 ? KIND_BRIG : KIND_GALLEON;
  const spec = SHIP_TYPES[type];
  let x;
  let y;
  let heading;
  if (random() < 0.55) {
    // Off the top edge, sailing down toward the coast.
    x = 220 + random() * 980;
    y = -24;
    heading = Math.atan2(480 - y, 640 - x) + (random() - 0.5) * 0.7;
  } else {
    // Off the right edge, sailing in toward the harbour side.
    x = FIELD.width + 24;
    y = 90 + random() * 380;
    heading = Math.atan2(500 - y, 700 - x) + (random() - 0.5) * 0.7;
  }
  return {
    id: state.nextShipId++,
    type,
    x,
    y,
    heading,
    speed: spec.speed,
    turn: spec.turn,
    radius: spec.radius,
    base: spec.base,
    lit: false,
    litTime: 0,
    horned: 0,
    phase: random() * TAU,
    wakeTimer: 0,
    wake: [],
  };
}

/** Lay the rocks: clear of the harbour approach and the lighthouse headland,
 * and far enough apart that a careful ship can always thread between them. */
function layRocks(random) {
  const count = ROCKS.min + Math.floor(random() * (ROCKS.max - ROCKS.min + 1));
  const rocks = [];
  let guard = 0;
  while (rocks.length < count && guard < 500) {
    guard += 1;
    const x = 260 + random() * 980;
    const y = 120 + random() * 520;
    const r = 14 + random() * 16;
    if (x > 820 && y > 540) continue;
    if (distance(x, y, LIGHTHOUSE.x, LIGHTHOUSE.y) < 170) continue;
    let clear = true;
    for (const other of rocks) {
      if (distance(x, y, other.x, other.y) < other.r + r + 130) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const verts = [];
    const n = 7 + Math.floor(random() * 3);
    for (let i = 0; i < n; i += 1) {
      verts.push({ a: (i / n) * TAU, d: r * (0.75 + random() * 0.4) });
    }
    rocks.push({ x, y, r, verts });
  }
  return rocks;
}

function layFogs(random) {
  const count = FOGS.min + Math.floor(random() * (FOGS.max - FOGS.min + 1));
  const fogs = [];
  for (let i = 0; i < count; i += 1) {
    fogs.push({
      x: 300 + random() * 800,
      y: 170 + random() * 380,
      rx: 110 + random() * 50,
      ry: 60 + random() * 30,
      vx: (random() - 0.5) * 14,
      vy: (random() - 0.5) * 9,
      phase: random() * TAU,
    });
  }
  return fogs;
}

function layStorms(random) {
  const count = STORMS.min + Math.floor(random() * (STORMS.max - STORMS.min + 1));
  const storms = [];
  for (let i = 0; i < count; i += 1) {
    storms.push({
      x: 350 + random() * 700,
      y: 140 + random() * 380,
      r: 85 + random() * 15,
      vx: (random() - 0.5) * 16,
      vy: (random() - 0.5) * 10,
      swirl: random() * TAU,
    });
  }
  return storms;
}

export function createWorld(random) {
  const state = {
    time: 0,
    night: 1,
    timer: NIGHT_SECONDS,
    score: 0,
    combo: 0,
    saved: 0,
    savedNight: 0,
    wrecks: 0,
    lives: LIVES,
    beamAngle: -0.6,
    beamLength: 700,
    pool: { x: 0, y: 0 },
    hornCharges: HORN.charges,
    hornRecharge: 0,
    hornFlash: 0,
    flareCharges: FLARE.charges,
    flareTimer: 0,
    flash: 0,
    lightningTimer: 8,
    ships: [],
    rocks: [],
    fogs: [],
    storms: [],
    particles: [],
    popups: [],
    spawnTimer: 1.0,
    nextShipId: 1,
    over: false,
    win: false,
    overReason: null,
  };

  function reset() {
    state.time = 0;
    state.night = 1;
    state.timer = NIGHT_SECONDS;
    state.score = 0;
    state.combo = 0;
    state.saved = 0;
    state.savedNight = 0;
    state.wrecks = 0;
    state.lives = LIVES;
    state.beamAngle = -0.6;
    state.beamLength = 700;
    state.hornCharges = HORN.charges;
    state.hornRecharge = 0;
    state.hornFlash = 0;
    state.flareCharges = FLARE.charges;
    state.flareTimer = 0;
    state.flash = 0;
    state.lightningTimer = 8;
    state.ships = [];
    state.rocks = layRocks(random);
    state.fogs = layFogs(random);
    state.storms = layStorms(random);
    state.particles = [];
    state.popups = [];
    state.spawnTimer = 1.0;
    state.nextShipId = 1;
    state.over = false;
    state.win = false;
    state.overReason = null;
    updatePool();
  }

  function updatePool() {
    state.pool.x = LAMP.x + Math.cos(state.beamAngle) * state.beamLength;
    state.pool.y = LAMP.y + Math.sin(state.beamAngle) * state.beamLength;
  }

  function addParticles(x, y, count, color, speed) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 500) return;
      const a = random() * TAU;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 20,
        life: 0.6 + random() * 0.7,
        maxLife: 1.3,
        size: 2 + random() * 3,
        color,
      });
    }
  }

  function addPopup(x, y, text, color) {
    state.popups.push({ x, y, text, color, life: 1.4, maxLife: 1.4 });
  }

  /** The combo multiplier: x1.00 on the first save, +0.25 per save after, capped at x3.00. */
  function comboMultiplier() {
    return Math.min(3, 1 + 0.25 * Math.max(0, state.combo - 1));
  }

  function nearestRock(ship) {
    let best = null;
    let bestD = Infinity;
    for (const rock of state.rocks) {
      const d = distance(ship.x, ship.y, rock.x, rock.y) - rock.r - ship.radius;
      if (d < bestD) {
        bestD = d;
        best = rock;
      }
    }
    return { rock: best, gap: bestD };
  }

  /**
   * One fixed step. `input` is { beamAngle, beamLength, horn, flare } — horn
   * and flare are one-shot presses, consumed here. With `harmless` set (the
   * title screen's backdrop) ships sail and the beam sweeps, but nothing
   * wrecks, nothing scores and the night never ends.
   */
  function step(dt, input, harmless) {
    let events = 0;
    if (state.over || state.win) return events;
    state.time += dt;

    // The beam: where the keeper aims it, and the bright pool it lands on.
    if (typeof input.beamAngle === 'number') state.beamAngle = input.beamAngle;
    if (typeof input.beamLength === 'number') {
      state.beamLength = Math.max(BEAM.minLength, Math.min(BEAM.maxLength, input.beamLength));
    }
    updatePool();

    // Foghorn: ships near the bright pool turn for the harbour and speed up.
    if (input.horn && state.hornCharges > 0 && !harmless) {
      state.hornCharges -= 1;
      state.hornFlash = 0.35;
      events |= EVENT_HORN;
      for (const ship of state.ships) {
        if (distance(ship.x, ship.y, state.pool.x, state.pool.y) <= HORN.radius) {
          ship.horned = HORN.boost;
        }
      }
    }

    // Flare: the whole coast lights up and the storms are shoved away.
    if (input.flare && state.flareCharges > 0 && !harmless) {
      state.flareCharges -= 1;
      state.flareTimer = FLARE.duration;
      events |= EVENT_FLARE;
      for (const storm of state.storms) {
        const d = Math.max(1, distance(storm.x, storm.y, LAMP.x, LAMP.y));
        storm.vx += ((storm.x - LAMP.x) / d) * 170;
        storm.vy += ((storm.y - LAMP.y) / d) * 170;
      }
    }

    // One horn charge comes back every HORN.recharge seconds.
    if (state.hornCharges < HORN.max) {
      state.hornRecharge += dt;
      while (state.hornRecharge >= HORN.recharge) {
        state.hornRecharge -= HORN.recharge;
        state.hornCharges = Math.min(HORN.max, state.hornCharges + 1);
      }
    }
    if (state.flareTimer > 0) state.flareTimer = Math.max(0, state.flareTimer - dt);
    if (state.hornFlash > 0) state.hornFlash = Math.max(0, state.hornFlash - dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);

    // Lightning, when a storm is on the water.
    if (state.storms.length > 0) {
      state.lightningTimer -= dt;
      if (state.lightningTimer <= 0) {
        state.flash = 0.22;
        events |= EVENT_THUNDER;
        state.lightningTimer = 7 + random() * 8;
      }
    }

    // Spawning: a steady stream of ships, faster on later nights.
    if (state.ships.length < MAX_SHIPS) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.ships.push(spawnShip(state, random));
        state.spawnTimer = SPAWN_INTERVAL[state.night - 1] * (0.85 + random() * 0.3);
      }
    }

    // The fog banks drift and wrap around the field.
    for (const fog of state.fogs) {
      fog.x += fog.vx * dt;
      fog.y += fog.vy * dt;
      if (fog.x < -200) fog.x = FIELD.width + 200;
      if (fog.x > FIELD.width + 200) fog.x = -200;
      if (fog.y < 60) fog.y = 60;
      if (fog.y > 640) fog.y = 640;
    }

    // Storm cells drift, swirl, and bounce softly off the edges of the sea.
    for (const storm of state.storms) {
      storm.x += storm.vx * dt;
      storm.y += storm.vy * dt;
      storm.swirl += dt * 0.9;
      const speed = Math.hypot(storm.vx, storm.vy);
      if (speed > 90) {
        storm.vx = (storm.vx / speed) * 90;
        storm.vy = (storm.vy / speed) * 90;
      }
      if (storm.x < 120 || storm.x > 1180) storm.vx *= -1;
      if (storm.y < 90 || storm.y > 620) storm.vy *= -1;
    }

    // Particles and score popups fade out.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 30 * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.popups.length - 1; i >= 0; i -= 1) {
      const p = state.popups[i];
      p.y -= 26 * dt;
      p.life -= dt;
      if (p.life <= 0) state.popups.splice(i, 1);
    }

    // The ships.
    for (let i = state.ships.length - 1; i >= 0; i -= 1) {
      const ship = state.ships[i];
      if (ship.horned > 0) ship.horned = Math.max(0, ship.horned - dt);
      if (ship.litTime > 0) ship.litTime = Math.max(0, ship.litTime - dt);

      // Lit by the beam? Inside the cone and inside the beam's reach. The
      // bright pool is where the beam is aimed, but the beam lights
      // everything in its path — a ship beyond the pool is still lit.
      const lampDx = ship.x - LAMP.x;
      const lampDy = ship.y - LAMP.y;
      const lampDist = Math.hypot(lampDx, lampDy);
      const lampAngle = Math.atan2(lampDy, lampDx);
      const inCone = Math.abs(angleDiff(state.beamAngle, lampAngle))
        <= BEAM.halfAngle + Math.atan2(ship.radius, Math.max(1, lampDist));
      ship.lit = inCone && lampDist <= BEAM.maxLength;
      if (ship.lit) ship.litTime = LIT_MEMORY;

      // Where the ship wants to go, and how fast. The lookout has the helm
      // whenever a rock is close: it turns the ship away and nothing else
      // steers that step, so a horn or the beam can never argue it into a rock.
      let speedFactor = 0.55;
      const near = nearestRock(ship);
      const lookout = near.rock && near.gap < 70;
      if (lookout) {
        // Turn away from the rock, biased toward the harbour so a ship
        // caught between a rock and the edge of the sea slides past it
        // instead of hovering there.
        const awayX = (ship.x - near.rock.x) / Math.max(1, near.gap + near.rock.r + ship.radius);
        const awayY = (ship.y - near.rock.y) / Math.max(1, near.gap + near.rock.r + ship.radius);
        const hbX = HARBOR.cx - ship.x;
        const hbY = HARBOR.cy - ship.y;
        const hbD = Math.max(1, Math.hypot(hbX, hbY));
        const desired = Math.atan2(awayY + (hbY / hbD) * 0.6, awayX + (hbX / hbD) * 0.6);
        ship.heading = turnToward(ship.heading, desired, ship.turn * 1.6 * dt);
        if (ship.horned > 0) speedFactor = HORN.speedMult;
      } else if (ship.horned > 0) {
        const desired = Math.atan2(HARBOR.cy - ship.y, HARBOR.cx - ship.x);
        ship.heading = turnToward(ship.heading, desired, ship.turn * 1.7 * dt);
        speedFactor = HORN.speedMult;
      } else if (ship.litTime > 0) {
        // A ship that has reached its pool holds its course instead of spinning.
        if (distance(ship.x, ship.y, state.pool.x, state.pool.y) > 25) {
          const desired = Math.atan2(state.pool.y - ship.y, state.pool.x - ship.x);
          ship.heading = turnToward(ship.heading, desired, ship.turn * dt);
        }
        speedFactor = 1.0;
      } else {
        // Drifting: the current carries the ship down toward the coast, with
        // a slow wander on top — an unlit ship makes for the harbour side
        // instead of milling around the open sea.
        const drift = Math.atan2(CURRENT.y, CURRENT.x);
        ship.heading = turnToward(ship.heading, drift, 0.12 * dt);
        ship.heading += Math.sin(state.time * 0.5 + ship.phase) * 0.12 * dt;
      }

      // Storms shove ships and scramble their heading — but a ship whose
      // lookout has the helm is not shoved into a rock: the push is blunted.
      let pushX = 0;
      let pushY = 0;
      for (const storm of state.storms) {
        const d = distance(ship.x, ship.y, storm.x, storm.y);
        if (d < storm.r + ship.radius) {
          const nx = (ship.x - storm.x) / Math.max(1, d);
          const ny = (ship.y - storm.y) / Math.max(1, d);
          pushX += nx * 70;
          pushY += ny * 70;
          ship.heading += (random() - 0.5) * 1.2 * dt;
          speedFactor *= 0.75;
        }
      }
      if (lookout) {
        pushX *= 0.3;
        pushY *= 0.3;
      }

      ship.x += (Math.cos(ship.heading) * ship.speed * speedFactor + CURRENT.x + pushX) * dt;
      ship.y += (Math.sin(ship.heading) * ship.speed * speedFactor + CURRENT.y + pushY) * dt;

      // Sailing in: a ship bounces off an edge only when it is moving outward
      // through it, so a ship spawning just outside the field sails in freely
      // but nothing can ever be lost off-screen.
      if (ship.x < 12 && Math.cos(ship.heading) < 0) {
        ship.x = 12;
        ship.heading = Math.PI - ship.heading;
      } else if (ship.x > 1268 && Math.cos(ship.heading) > 0) {
        ship.x = 1268;
        ship.heading = Math.PI - ship.heading;
      }
      if (ship.y < 12 && Math.sin(ship.heading) < 0) {
        ship.y = 12;
        ship.heading = -ship.heading;
      }
      // Last resort, should never fire with the bounce above: put the ship
      // just inside the nearest edge, facing back into the field.
      if (ship.x < -40) {
        ship.x = 24;
        ship.heading = 0;
      } else if (ship.x > FIELD.width + 40) {
        ship.x = FIELD.width - 24;
        ship.heading = Math.PI;
      }
      if (ship.y < -40) {
        ship.y = 24;
        ship.heading = Math.PI / 2;
      }

      // The breakwater along the bottom: bounce off it, or sail home through the gap.
      if (ship.y >= 700) {
        if (ship.x >= HARBOR.x0 && ship.x <= HARBOR.x1) {
          if (ship.y >= HARBOR.y) {
            state.ships.splice(i, 1);
            if (!harmless) {
              state.combo += 1;
              const points = Math.round(ship.base * comboMultiplier());
              state.score += points;
              state.saved += 1;
              state.savedNight += 1;
              addPopup(ship.x, 668, `+${points}`, '#f2c94c');
              addParticles(ship.x, 690, 26, '#ffd97a', 130);
              events |= EVENT_SAVE;
            }
            continue;
          }
        } else {
          ship.y = 700;
          ship.heading = -ship.heading;
        }
      }

      // A ship that touches a rock is wrecked. A graze of a few pixels is
      // forgiven: the hull must properly overlap the rock.
      if (!harmless) {
        const hit = nearestRock(ship);
        if (hit.rock && hit.gap < -6) {
          state.ships.splice(i, 1);
          state.wrecks += 1;
          state.lives -= 1;
          state.combo = 0;
          addParticles(ship.x, ship.y, 34, '#e5534b', 170);
          addParticles(ship.x, ship.y, 18, '#8a94a6', 90);
          events |= EVENT_WRECK;
          if (state.lives <= 0) {
            state.over = true;
            state.overReason = 'wrecks';
            events |= EVENT_OVER;
          }
          continue;
        }
      }

      // A fading wake behind the stern.
      ship.wakeTimer += dt;
      if (ship.wakeTimer >= 0.12) {
        ship.wakeTimer = 0;
        ship.wake.push({ x: ship.x, y: ship.y });
        if (ship.wake.length > 16) ship.wake.shift();
      }
    }

    // Dawn: the night ends when the timer runs out.
    if (!harmless) {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.savedNight >= QUOTA[state.night - 1]) {
          state.score += 250;
          if (state.night >= NIGHTS) {
            state.win = true;
            if (state.wrecks === 0) state.score += 500;
            events |= EVENT_WIN;
          } else {
            state.night += 1;
            state.timer = NIGHT_SECONDS;
            state.savedNight = 0;
            state.spawnTimer = 1.2;
            state.hornCharges = HORN.charges;
            state.hornRecharge = 0;
            state.flareCharges = FLARE.charges;
            state.ships = [];
            state.fogs = layFogs(random);
            state.storms = layStorms(random);
            events |= EVENT_DAWN;
          }
        } else {
          state.over = true;
          state.overReason = 'dawn';
          events |= EVENT_OVER;
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, comboMultiplier };
}
