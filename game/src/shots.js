// The screenshot scenes behind ?shot=start|play|storm|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot — the keeper's eye, picking the ship in most danger
// and aiming the bright pool just ahead of it on the way home — so the frame
// is what a short game really looks like and the same seed always gives the
// same frame.
import { BEAM, HARBOR, LAMP, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const STORM_SECONDS = 20;
const END_LIMIT_SECONDS = 600;

/** Distance from point P to segment AB. */
function segmentPointDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The autopilot: a closure that remembers which ship it is guiding, so the
 * beam does not thrash between ships. Each step it returns the input the
 * world would get from a player — beam angle and length, horn, flare.
 */
export function makeAutopilot() {
  let targetId = -1;
  return function pilot(state) {
    // The ship in most danger: nearest a rock, or farthest from the harbour.
    let target = null;
    let bestUrgency = -Infinity;
    for (const ship of state.ships) {
      let rockGap = Infinity;
      for (const rock of state.rocks) {
        const gap = Math.hypot(ship.x - rock.x, ship.y - rock.y) - rock.r - ship.radius;
        if (gap < rockGap) rockGap = gap;
      }
      const harbourDist = Math.hypot(HARBOR.cx - ship.x, HARBOR.cy - ship.y);
      // Danger first; among safe ships, the one closest to home, so the
      // beam finishes saves instead of starting new ones.
      let urgency = (1 - harbourDist / 1400) * 100;
      if (rockGap < 280) urgency += (280 - rockGap) * 2.2;
      if (ship.id === targetId) urgency += 25;
      if (urgency > bestUrgency) {
        bestUrgency = urgency;
        target = ship;
      }
    }
    if (!target) return { beamAngle: -0.6, beamLength: 700, horn: false, flare: false };
    targetId = target.id;

    // Aim the bright pool just ahead of the ship, on the way to the harbour.
    const hx = HARBOR.cx - target.x;
    const hy = HARBOR.cy - target.y;
    const hd = Math.hypot(hx, hy) || 1;
    let px = target.x + (hx / hd) * 230;
    let py = target.y + (hy / hd) * 230;
    // Route the pool around any rock on the way there.
    for (const rock of state.rocks) {
      const d = segmentPointDistance(rock.x, rock.y, target.x, target.y, px, py);
      const need = rock.r + target.radius + 34;
      if (d < need) {
        const vx = (px - target.x) / 230;
        const vy = (py - target.y) / 230;
        const rx = rock.x - target.x;
        const ry = rock.y - target.y;
        const side = vx * ry - vy * rx >= 0 ? 1 : -1;
        const push = need - d + 50;
        px += -vy * side * push;
        py += vx * side * push;
      }
    }
    // Aim the beam at the midpoint between the ship and the pool, so the ship
    // itself stays inside the cone while the pool lands ahead of it.
    const ax = (target.x + px) / 2;
    const ay = (target.y + py) / 2;
    const beamAngle = Math.atan2(ay - LAMP.y, ax - LAMP.x);
    // The pool is the aim point itself, kept on the water: the beam's length
    // is the distance to it, and the beam lights everything along the way.
    const beamLength = Math.max(
      BEAM.minLength,
      Math.min(BEAM.maxLength, Math.hypot(px - LAMP.x, Math.min(py, 700) - LAMP.y)),
    );

    // The horn when the guided ship is closing on a rock: the blast turns it
    // for the harbour and hurries it past the danger.
    let horn = false;
    if (state.hornCharges > 0) {
      for (const rock of state.rocks) {
        if (Math.hypot(target.x - rock.x, target.y - rock.y) < rock.r + target.radius + 100) {
          horn = true;
          break;
        }
      }
    }
    // The flare when a storm is bearing down on any ship.
    let flare = false;
    if (state.flareCharges > 0) {
      for (const storm of state.storms) {
        for (const ship of state.ships) {
          if (Math.hypot(ship.x - storm.x, ship.y - storm.y) < storm.r + 130) {
            flare = true;
            break;
          }
        }
        if (flare) break;
      }
    }
    return { beamAngle, beamLength, horn, flare };
  };
}

function endSummary(state) {
  return {
    reason: state.win ? 'victory' : state.overReason,
    shipsSaved: state.saved,
    savedNight: state.savedNight,
    quota: state.night >= 3 ? 8 : [4, 6, 8][state.night - 1],
    score: state.score,
    dawnBonus: 250 * (state.win ? 3 : state.night - 1),
    noWreckBonus: state.win && state.wrecks === 0 ? 500 : 0,
  };
}

/**
 * Set `world` to the named scene (start, play, storm or end; any other name
 * is start) and return the screen to draw over it, the best score to show,
 * and the end-of-game summary when there is one.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'start') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      const angle = -0.55 + 0.6 * Math.sin(world.state.time * 0.22);
      const length = 720 + 120 * Math.sin(world.state.time * 0.13 + 1);
      world.step(STEP, { beamAngle: angle, beamLength: length, horn: false, flare: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, summary: null };
  }
  if (name === 'storm') {
    // Drag a storm cell into mid-field so the frame is properly dramatic.
    if (world.state.storms.length > 0) {
      const storm = world.state.storms[0];
      storm.x = 640;
      storm.y = 360;
      storm.vx = 6;
      storm.vy = 3;
    }
    const pilot = makeAutopilot();
    for (let index = 0; index < STORM_SECONDS / STEP; index += 1) {
      const input = pilot(world.state);
      if (index === Math.round(8 / STEP)) input.flare = true;
      world.step(STEP, input, false);
      if (world.state.over || world.state.win) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score, summary: null };
  }
  if (name === 'end') {
    const pilot = makeAutopilot();
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, pilot(world.state), false);
      if (events & (EVENT_WIN | EVENT_OVER)) break;
    }
    const win = world.state.win;
    return {
      screen: win ? SCREEN_VICTORY : SCREEN_OVER,
      best: world.state.score,
      summary: endSummary(world.state),
    };
  }
  const pilot = makeAutopilot();
  for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
    world.step(STEP, pilot(world.state), false);
    if (world.state.over || world.state.win) break;
  }
  return { screen: SCREEN_PLAY, best: world.state.score, summary: null };
}
