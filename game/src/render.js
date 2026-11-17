// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. Everything is drawn procedurally — sky,
// sea, lighthouse, ships, fog, storms — with canvas gradients and paths.
// Text that holds a number is rebuilt only when the number changes.
import { BEAM, FIELD, FLARE, FONT, HARBOR, HORN, LAMP, LIGHTHOUSE, LIVES, NIGHTS, NIGHT_SECONDS, PALETTE, QUOTA } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const TAU = Math.PI * 2;
const HORIZON_Y = 150;
const MOON = { x: 1060, y: 68, r: 34 };

/** Stars and coastline bumps are fixed at load, so the sky never flickers. */
const starRandom = createRandom(20261117);
const STARS = [];
for (let i = 0; i < 130; i += 1) {
  STARS.push({
    x: starRandom() * FIELD.width,
    y: starRandom() * 138,
    r: 0.5 + starRandom() * 1.4,
    phase: starRandom() * TAU,
    speed: 0.4 + starRandom() * 0.9,
  });
}
const coastRandom = createRandom(770031);
const COAST_BUMPS = [];
for (let x = 0; x <= FIELD.width; x += 32) {
  COAST_BUMPS.push({ x, y: 692 + coastRandom() * 10 });
}
const blockRandom = createRandom(5150);
const BREAKWATER = [];
for (let x = 0; x < FIELD.width; x += 46) {
  BREAKWATER.push({ x, w: 40 + blockRandom() * 8, h: 14 + blockRandom() * 8 });
}

function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  return d;
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

const SHIP_HULL = {
  sloop: '#8a6b46',
  brig: '#7a5c3e',
  galleon: '#6b4e33',
};
const SHIP_SAIL = {
  sloop: '#f5efe0',
  brig: '#efe6cc',
  galleon: '#e8dcc0',
};

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function panel(x, y, width, height, radius) {
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
    } else {
      context.rect(x, y, width, height);
    }
    context.fillStyle = 'rgba(8, 12, 20, 0.55)';
    context.fill();
    context.strokeStyle = 'rgba(120, 150, 190, 0.25)';
    context.lineWidth = 1;
    context.stroke();
  }

  function drawSky(state) {
    const sky = context.createLinearGradient(0, 0, 0, HORIZON_Y);
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(1, PALETTE.skyHorizon);
    context.fillStyle = sky;
    context.fillRect(0, 0, FIELD.width, HORIZON_Y);
    for (const star of STARS) {
      const alpha = 0.25 + 0.65 * Math.abs(Math.sin(state.time * star.speed + star.phase));
      context.globalAlpha = alpha;
      context.fillStyle = '#dfe8ff';
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
    // The moon, with its halo.
    const halo = context.createRadialGradient(MOON.x, MOON.y, 4, MOON.x, MOON.y, 90);
    halo.addColorStop(0, 'rgba(244, 234, 208, 0.35)');
    halo.addColorStop(1, 'rgba(244, 234, 208, 0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(MOON.x, MOON.y, 90, 0, TAU);
    context.fill();
    context.fillStyle = PALETTE.moon;
    context.beginPath();
    context.arc(MOON.x, MOON.y, MOON.r, 0, TAU);
    context.fill();
    context.fillStyle = 'rgba(190, 175, 140, 0.5)';
    context.beginPath();
    context.arc(MOON.x - 10, MOON.y - 6, 7, 0, TAU);
    context.arc(MOON.x + 8, MOON.y + 10, 5, 0, TAU);
    context.fill();
  }

  function drawSea(state) {
    const sea = context.createLinearGradient(0, HORIZON_Y, 0, FIELD.height);
    sea.addColorStop(0, PALETTE.seaTop);
    sea.addColorStop(1, PALETTE.seaDeep);
    context.fillStyle = sea;
    context.fillRect(0, HORIZON_Y, FIELD.width, FIELD.height - HORIZON_Y);
    // Moon glint: a shimmering column of light under the moon.
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i += 1) {
      const y = HORIZON_Y + 12 + i * 20;
      const spread = 26 + i * 2.2;
      const hash = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      const frac = hash - Math.floor(hash);
      const wobble = Math.sin(state.time * 1.3 + i * 1.7) * 10 + (frac - 0.5) * spread * 0.9;
      const width = spread * (0.45 + frac * 0.6);
      const alpha = 0.04 + 0.06 * Math.abs(Math.sin(state.time * 0.9 + i * 0.8 + frac * 3));
      context.globalAlpha = alpha;
      context.fillStyle = PALETTE.moonGlint;
      context.fillRect(MOON.x - width / 2 + wobble, y, width, 3);
    }
    context.restore();
    // Wave strokes: rows of small arcs, breathing with the swell.
    context.strokeStyle = 'rgba(140, 190, 225, 0.13)';
    context.lineWidth = 2;
    for (let row = 0; row < 20; row += 1) {
      const y = HORIZON_Y + 26 + row * 27;
      const offset = (row % 2) * 45;
      for (let col = 0; col < 15; col += 1) {
        const x = offset + col * 92 + Math.sin(state.time * 0.7 + row * 0.6 + col) * 6;
        context.beginPath();
        context.arc(x, y, 15, Math.PI * 0.15, Math.PI * 0.85);
        context.stroke();
      }
    }
  }

  function drawCoast(state) {
    // The rocky shore along the bottom edge.
    context.fillStyle = PALETTE.coast;
    context.beginPath();
    context.moveTo(0, FIELD.height);
    context.lineTo(0, COAST_BUMPS[0].y);
    for (const bump of COAST_BUMPS) context.lineTo(bump.x, bump.y);
    context.lineTo(FIELD.width, FIELD.height);
    context.closePath();
    context.fill();
    // The breakwater: stone blocks, with a gap for the harbour mouth.
    for (const block of BREAKWATER) {
      if (block.x + block.w > HARBOR.x0 - 8 && block.x < HARBOR.x1 + 8) continue;
      context.fillStyle = PALETTE.breakwater;
      context.fillRect(block.x, FIELD.height - block.h, block.w, block.h);
      context.fillStyle = PALETTE.breakwaterTop;
      context.fillRect(block.x, FIELD.height - block.h, block.w, 3);
    }
    // The harbour mouth: two short jetties and golden lights.
    for (const jettyX of [HARBOR.x0 - 14, HARBOR.x1 - 2]) {
      context.fillStyle = PALETTE.breakwater;
      context.fillRect(jettyX, 668, 14, 52);
      context.fillStyle = PALETTE.breakwaterTop;
      context.fillRect(jettyX, 668, 14, 3);
    }
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i += 1) {
      const lx = HARBOR.x0 + 18 + i * 32;
      const glow = context.createRadialGradient(lx, 692, 1, lx, 692, 16);
      glow.addColorStop(0, 'rgba(255, 217, 122, 0.8)');
      glow.addColorStop(1, 'rgba(255, 217, 122, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(lx, 692, 16, 0, TAU);
      context.fill();
    }
    context.restore();
    // Buoys bobbing by the harbour mouth.
    for (const [bx, phase, color] of [[986, 0, '#e5534b'], [1174, 2.1, '#3fae6a']]) {
      const by = 678 + Math.sin(state.time * 1.1 + phase) * 3;
      context.fillStyle = color;
      context.beginPath();
      context.arc(bx, by, 5, 0, TAU);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.7)';
      context.fillRect(bx - 1, by - 9, 2, 5);
    }
  }

  /** Is this rock lit by the beam right now? */
  function rockLit(rock, state) {
    const dx = rock.x - LAMP.x;
    const dy = rock.y - LAMP.y;
    const d = Math.hypot(dx, dy);
    if (d > state.beamLength + 30) return false;
    return Math.abs(angleDiff(state.beamAngle, Math.atan2(dy, dx))) <= BEAM.halfAngle + 0.08;
  }

  /** Rocks inside a fog bank are hidden unless lit, flared, or a ship is very close. */
  function rockHidden(rock, state) {
    if (state.flareTimer > 0) return false;
    let inFog = false;
    for (const fog of state.fogs) {
      const dx = (rock.x - fog.x) / fog.rx;
      const dy = (rock.y - fog.y) / fog.ry;
      if (dx * dx + dy * dy < 1) {
        inFog = true;
        break;
      }
    }
    if (!inFog) return false;
    if (rockLit(rock, state)) return false;
    for (const ship of state.ships) {
      if (Math.hypot(ship.x - rock.x, ship.y - rock.y) < 70) return false;
    }
    return true;
  }

  function drawRock(rock, state, revealed) {
    context.save();
    context.translate(rock.x, rock.y);
    context.beginPath();
    for (let i = 0; i < rock.verts.length; i += 1) {
      const v = rock.verts[i];
      const x = Math.cos(v.a) * v.d;
      const y = Math.sin(v.a) * v.d;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = revealed ? PALETTE.rockTop : PALETTE.rock;
    context.fill();
    context.strokeStyle = 'rgba(120, 140, 165, 0.5)';
    context.lineWidth = 1.5;
    context.stroke();
    // Foam ring, lapping at the base.
    context.strokeStyle = `rgba(207, 227, 239, ${revealed ? 0.5 : 0.3})`;
    context.lineWidth = 2;
    context.beginPath();
    const foamR = rock.r + 4 + Math.sin(state.time * 1.4 + rock.x * 0.05) * 2;
    context.ellipse(0, 0, foamR * 1.15, foamR * 0.7, 0, 0, TAU);
    context.stroke();
    context.restore();
  }

  function drawFog(state) {
    for (const fog of state.fogs) {
      context.save();
      context.translate(fog.x, fog.y);
      context.scale(fog.rx, fog.ry);
      const g = context.createRadialGradient(0, 0, 0.1, 0, 0, 1);
      g.addColorStop(0, 'rgba(184, 201, 221, 0.5)');
      g.addColorStop(0.7, 'rgba(184, 201, 221, 0.28)');
      g.addColorStop(1, 'rgba(184, 201, 221, 0)');
      context.fillStyle = g;
      context.beginPath();
      context.arc(0, 0, 1, 0, TAU);
      context.fill();
      context.restore();
    }
  }

  function drawStorms(state) {
    for (const storm of state.storms) {
      context.save();
      context.translate(storm.x, storm.y);
      const g = context.createRadialGradient(0, 0, 4, 0, 0, storm.r);
      g.addColorStop(0, 'rgba(13, 21, 38, 0.92)');
      g.addColorStop(0.75, 'rgba(13, 21, 38, 0.55)');
      g.addColorStop(1, 'rgba(13, 21, 38, 0)');
      context.fillStyle = g;
      context.beginPath();
      context.arc(0, 0, storm.r, 0, TAU);
      context.fill();
      // The swirl: arcs turning with the storm.
      context.strokeStyle = 'rgba(150, 175, 210, 0.35)';
      context.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        const r = storm.r * (0.35 + i * 0.22);
        context.beginPath();
        context.arc(0, 0, r, storm.swirl + i * 2.1, storm.swirl + i * 2.1 + Math.PI * 1.1);
        context.stroke();
      }
      // Rain streaks inside the cell.
      context.strokeStyle = 'rgba(180, 200, 230, 0.4)';
      context.lineWidth = 1.5;
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU;
        const rr = storm.r * (0.25 + ((i * 37) % 10) / 14);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        context.beginPath();
        context.moveTo(px, py);
        context.lineTo(px - 4, py + 12);
        context.stroke();
      }
      context.restore();
    }
    // Lightning: one jagged bolt from the first storm cell while the flash lasts.
    if (state.flash > 0 && state.storms.length > 0) {
      const storm = state.storms[0];
      context.save();
      context.globalAlpha = Math.min(1, state.flash * 4);
      context.strokeStyle = '#fff6c8';
      context.lineWidth = 3;
      context.beginPath();
      let bx = storm.x;
      let by = storm.y - storm.r * 0.7;
      context.moveTo(bx, by);
      for (let i = 0; i < 6; i += 1) {
        bx += Math.sin(i * 7.3 + Math.floor(state.time * 30)) * 22;
        by += storm.r * 0.32;
        context.lineTo(bx, by);
      }
      context.stroke();
      context.restore();
    }
  }

  function drawShip(ship, state) {
    // The wake: a fading trail behind the stern.
    if (ship.wake.length > 1) {
      context.strokeStyle = 'rgba(207, 227, 239, 0.22)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(ship.wake[0].x, ship.wake[0].y);
      for (let i = 1; i < ship.wake.length; i += 1) context.lineTo(ship.wake[i].x, ship.wake[i].y);
      context.stroke();
    }
    const r = ship.radius;
    const len = r * 2.4;
    const wid = r * 1.5;
    // A lit ship glows warm in the beam.
    if (ship.lit) {
      context.save();
      context.globalCompositeOperation = 'lighter';
      const glow = context.createRadialGradient(ship.x, ship.y, 2, ship.x, ship.y, r * 3.2);
      glow.addColorStop(0, 'rgba(255, 233, 168, 0.35)');
      glow.addColorStop(1, 'rgba(255, 233, 168, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(ship.x, ship.y, r * 3.2, 0, TAU);
      context.fill();
      context.restore();
    }
    context.save();
    context.translate(ship.x, ship.y);
    context.rotate(ship.heading + Math.PI / 2);
    // Hull: a pointed bow, a rounded stern.
    context.beginPath();
    context.moveTo(0, -len / 2);
    context.quadraticCurveTo(wid / 2, -len / 6, wid / 2, len / 6);
    context.quadraticCurveTo(wid / 2, len / 2, 0, len / 2);
    context.quadraticCurveTo(-wid / 2, len / 2, -wid / 2, len / 6);
    context.quadraticCurveTo(-wid / 2, -len / 6, 0, -len / 2);
    context.fillStyle = SHIP_HULL[ship.type];
    context.fill();
    context.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    context.lineWidth = 1;
    context.stroke();
    // Deck stripe.
    context.strokeStyle = 'rgba(240, 220, 180, 0.5)';
    context.beginPath();
    context.moveTo(0, -len / 2 + 4);
    context.lineTo(0, len / 2 - 4);
    context.stroke();
    // Mast and sail.
    context.strokeStyle = '#3a2c1c';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, len * 0.3);
    context.lineTo(0, -len * 0.62);
    context.stroke();
    const billow = Math.sin(state.time * 1.6 + ship.phase) * 2;
    context.beginPath();
    context.moveTo(0, -len * 0.6);
    context.quadraticCurveTo(wid * 0.62 + billow, -len * 0.05, 0, len * 0.22);
    context.closePath();
    context.fillStyle = SHIP_SAIL[ship.type];
    context.fill();
    // Pennant at the masthead.
    context.fillStyle = PALETTE.danger;
    context.beginPath();
    context.moveTo(0, -len * 0.62);
    context.lineTo(10, -len * 0.62 + 3);
    context.lineTo(0, -len * 0.62 + 6);
    context.closePath();
    context.fill();
    // The stern lantern.
    context.fillStyle = '#ffd97a';
    context.beginPath();
    context.arc(0, len * 0.42, 3, 0, TAU);
    context.fill();
    context.restore();
    // Lantern light spilling on the water.
    context.save();
    context.globalCompositeOperation = 'lighter';
    const lg = context.createRadialGradient(ship.x, ship.y, 1, ship.x, ship.y, r * 1.8);
    lg.addColorStop(0, 'rgba(255, 217, 122, 0.28)');
    lg.addColorStop(1, 'rgba(255, 217, 122, 0)');
    context.fillStyle = lg;
    context.beginPath();
    context.arc(ship.x, ship.y, r * 1.8, 0, TAU);
    context.fill();
    context.restore();
  }

  function drawBeam(state) {
    const pool = state.pool;
    context.save();
    context.globalCompositeOperation = 'lighter';
    // The wedge: bright at the lamp, fading to the pool.
    const grad = context.createLinearGradient(LAMP.x, LAMP.y, pool.x, pool.y);
    grad.addColorStop(0, 'rgba(255, 233, 168, 0.5)');
    grad.addColorStop(0.7, 'rgba(255, 233, 168, 0.16)');
    grad.addColorStop(1, 'rgba(255, 233, 168, 0.05)');
    context.fillStyle = grad;
    context.beginPath();
    context.moveTo(LAMP.x, LAMP.y);
    const left = state.beamAngle - BEAM.halfAngle;
    const right = state.beamAngle + BEAM.halfAngle;
    context.lineTo(LAMP.x + Math.cos(left) * state.beamLength, LAMP.y + Math.sin(left) * state.beamLength);
    context.lineTo(LAMP.x + Math.cos(right) * state.beamLength, LAMP.y + Math.sin(right) * state.beamLength);
    context.closePath();
    context.fill();
    // The bright pool where the beam lands.
    const poolGrad = context.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, 78);
    poolGrad.addColorStop(0, 'rgba(255, 240, 190, 0.55)');
    poolGrad.addColorStop(0.5, 'rgba(255, 233, 168, 0.18)');
    poolGrad.addColorStop(1, 'rgba(255, 233, 168, 0)');
    context.fillStyle = poolGrad;
    context.beginPath();
    context.ellipse(pool.x, pool.y, 78, 30, state.beamAngle, 0, TAU);
    context.fill();
    // A ring while the foghorn is sounding.
    if (state.hornFlash > 0) {
      context.globalAlpha = state.hornFlash * 2;
      context.strokeStyle = '#ffe9a8';
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(pool.x, pool.y, 96, 38, state.beamAngle, 0, TAU);
      context.stroke();
      context.globalAlpha = 1;
    }
    context.restore();
  }

  function drawLighthouse(state) {
    // The headland rock the tower stands on.
    context.fillStyle = '#141a21';
    context.beginPath();
    context.moveTo(48, 706);
    context.lineTo(72, 668);
    context.lineTo(104, 652);
    context.lineTo(140, 648);
    context.lineTo(172, 660);
    context.lineTo(196, 690);
    context.lineTo(204, 706);
    context.closePath();
    context.fill();
    const tx = LIGHTHOUSE.x;
    // The tower: a striped trapezoid, red over white.
    context.beginPath();
    context.moveTo(tx - 24, 652);
    context.lineTo(tx - 17, 562);
    context.lineTo(tx + 17, 562);
    context.lineTo(tx + 24, 652);
    context.closePath();
    context.fillStyle = '#e8e2d4';
    context.fill();
    context.save();
    context.clip();
    context.fillStyle = '#b03a32';
    context.fillRect(tx - 26, 632, 52, 14);
    context.fillRect(tx - 26, 596, 52, 14);
    context.restore();
    context.strokeStyle = 'rgba(0,0,0,0.35)';
    context.lineWidth = 1;
    context.stroke();
    // The gallery platform.
    context.fillStyle = '#1c222b';
    context.fillRect(tx - 28, 556, 56, 8);
    // The lamp room, glowing.
    const lampGlow = context.createRadialGradient(LAMP.x, LAMP.y, 2, LAMP.x, LAMP.y, 60);
    lampGlow.addColorStop(0, 'rgba(255, 240, 190, 0.9)');
    lampGlow.addColorStop(1, 'rgba(255, 240, 190, 0)');
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.fillStyle = lampGlow;
    context.beginPath();
    context.arc(LAMP.x, LAMP.y, 60, 0, TAU);
    context.fill();
    context.restore();
    context.fillStyle = '#ffe9a8';
    context.fillRect(tx - 13, 532, 26, 24);
    context.strokeStyle = '#1c222b';
    context.lineWidth = 2;
    context.strokeRect(tx - 13, 532, 26, 24);
    context.beginPath();
    context.moveTo(tx - 13, 532);
    context.lineTo(tx, 532);
    context.lineTo(tx, 556);
    context.lineTo(tx - 13, 556);
    context.closePath();
    context.fillStyle = 'rgba(255, 255, 255, 0.45)';
    context.fill();
    // The little red roof.
    context.fillStyle = '#b03a32';
    context.beginPath();
    context.moveTo(tx - 16, 532);
    context.lineTo(tx, 518);
    context.lineTo(tx + 16, 532);
    context.closePath();
    context.fill();
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const p of state.popups) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      text(p.text, p.x, p.y, 24, p.color, 'center', '700');
    }
    context.globalAlpha = 1;
  }

  function drawHeart(x, y, size, filled) {
    context.beginPath();
    context.moveTo(x, y + size * 0.9);
    context.bezierCurveTo(x - size * 1.2, y, x - size * 0.6, y - size, x, y - size * 0.3);
    context.bezierCurveTo(x + size * 0.6, y - size, x + size * 1.2, y, x, y + size * 0.9);
    context.fillStyle = filled ? PALETTE.heart : 'rgba(120, 130, 150, 0.4)';
    context.fill();
  }

  function drawHud(state) {
    const timeLeft = Math.max(0, state.timer);
    const fraction = timeLeft / NIGHT_SECONDS;
    const quota = QUOTA[state.night - 1];
    const mult = Math.min(3, 1 + 0.25 * Math.max(0, state.combo - 1)).toFixed(2);
    // Score and combo, top left.
    panel(16, 14, 290, 66, 10);
    text(scoreLabel(state.score), 32, 62, 26, PALETTE.text, 'left', '700');
    text('COMBO', 290, 36, 12, PALETTE.muted, 'right', '700');
    text(`×${mult}`, 290, 62, 20, state.combo >= 2 ? PALETTE.gold : PALETTE.muted, 'right', '700');
    // Night, dawn timer and the quota, top centre.
    panel(FIELD.width / 2 - 170, 14, 340, 66, 10);
    text(`NIGHT ${state.night} / ${NIGHTS}`, FIELD.width / 2, 38, 16, PALETTE.text, 'center', '700');
    context.fillStyle = 'rgba(255, 255, 255, 0.14)';
    context.fillRect(FIELD.width / 2 - 140, 48, 280, 9);
    context.fillStyle = fraction > 0.35 ? PALETTE.gold : PALETTE.danger;
    context.fillRect(FIELD.width / 2 - 140, 48, 280 * fraction, 9);
    text(`SAVED ${Math.min(state.savedNight, quota)} / ${quota}`, FIELD.width / 2, 76, 15, PALETTE.text, 'center', '700');
    // Lives, horn and flares, top right.
    panel(FIELD.width - 266, 14, 250, 66, 10);
    for (let i = 0; i < LIVES; i += 1) {
      drawHeart(FIELD.width - 236 + i * 26, 46, 9, i < state.lives);
    }
    text('HORN', FIELD.width - 158, 40, 13, PALETTE.muted, 'left', '700');
    for (let i = 0; i < HORN.max; i += 1) {
      context.fillStyle = i < state.hornCharges ? PALETTE.gold : 'rgba(120, 130, 150, 0.35)';
      context.beginPath();
      context.arc(FIELD.width - 148 + i * 16, 56, 5, 0, TAU);
      context.fill();
    }
    text('FLARE', FIELD.width - 96, 40, 13, PALETTE.muted, 'left', '700');
    for (let i = 0; i < FLARE.charges; i += 1) {
      context.fillStyle = i < state.flareCharges ? '#9fd0ff' : 'rgba(120, 130, 150, 0.35)';
      context.beginPath();
      context.arc(FIELD.width - 88 + i * 16, 56, 5, 0, TAU);
      context.fill();
    }
    // Controls hint, bottom left; best score, bottom right.
    context.globalAlpha = 0.8;
    text('Mouse aim · Space foghorn · F flare · P pause · M mute', 16, FIELD.height - 16, 15, PALETTE.muted, 'left');
    context.globalAlpha = 1;
  }

  function drawOverlayPanel(title, lines, prompt, titleColor) {
    const width = 640;
    const lineHeight = 32;
    const height = 150 + lines.length * lineHeight + 66;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(6, 10, 18, 0.82)';
    context.beginPath();
    if (typeof context.roundRect === 'function') context.roundRect(x, y, width, height, 16);
    else context.rect(x, y, width, height);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 46, titleColor || PALETTE.text, 'center', '800');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 128 + i * lineHeight, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.gold, 'center', '700');
  }

  /** Paint one frame: the sea, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, summary) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';

    drawSky(state);
    drawSea(state);
    drawCoast(state);
    // Rocks first, under the fog; revealed rocks are drawn again over it.
    for (const rock of state.rocks) {
      if (!rockHidden(rock, state)) drawRock(rock, state, false);
    }
    drawFog(state);
    for (const rock of state.rocks) {
      if (rockHidden(rock, state)) continue;
      // A rock inside fog is only drawn over the fog when something reveals it.
      let inFog = false;
      for (const fog of state.fogs) {
        const dx = (rock.x - fog.x) / fog.rx;
        const dy = (rock.y - fog.y) / fog.ry;
        if (dx * dx + dy * dy < 1) {
          inFog = true;
          break;
        }
      }
      if (inFog) drawRock(rock, state, true);
    }
    drawStorms(state);
    for (const ship of state.ships) drawShip(ship, state);
    drawBeam(state);
    drawLighthouse(state);
    drawParticles(state);

    // Lightning flash and the flare's warm wash over the whole coast.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 246, 200, ${Math.min(0.28, state.flash)})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (state.flareTimer > 0) {
      const g = context.createRadialGradient(LAMP.x, LAMP.y, 40, LAMP.x, LAMP.y, 900);
      g.addColorStop(0, 'rgba(255, 220, 150, 0.16)');
      g.addColorStop(1, 'rgba(255, 220, 150, 0)');
      context.fillStyle = g;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_TITLE) {
      const lines = [
        'Guide the fleet home through rocks, fog and storms — before dawn.',
        '',
        'Mouse aims the beam · ships steer toward its bright pool',
        'Space / Click — foghorn blast   ·   F — flare   ·   P — pause',
        'Save the quota each night: 4, then 6, then 8 ships. Three wrecks ends it.',
        '',
        bestLabel(best),
      ];
      drawOverlayPanel('BEACONKEEPER', lines, 'Press Space or click to begin the night', PALETTE.gold);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawOverlayPanel('PAUSED', ['The ships will wait for you.'], 'Press P or click to resume');
    } else if (screen === SCREEN_OVER) {
      const reason = summary && summary.reason === 'dawn'
        ? `Dawn came with ${summary.savedNight} of ${summary.quota} ships saved.`
        : 'Three ships wrecked on the rocks.';
      const lines = [
        reason,
        '',
        finalLabel(state.score),
        bestLabel(best),
      ];
      drawOverlayPanel('THE LIGHT GOES OUT', lines, 'Press R or click to keep again');
    } else if (screen === SCREEN_VICTORY) {
      // Dawn breaks over the harbour.
      const dawn = context.createLinearGradient(0, 0, 0, HORIZON_Y + 120);
      dawn.addColorStop(0, 'rgba(255, 170, 90, 0.28)');
      dawn.addColorStop(1, 'rgba(255, 170, 90, 0)');
      context.fillStyle = dawn;
      context.fillRect(0, 0, FIELD.width, HORIZON_Y + 120);
      const s = summary || { shipsSaved: state.saved, dawnBonus: 750, noWreckBonus: 0 };
      const lines = [
        'The fleet is home. The last night is done.',
        '',
        `Ships saved  ${s.shipsSaved}`,
        `Dawn bonus  +${s.dawnBonus}`,
        s.noWreckBonus > 0 ? `No wrecks  +${s.noWreckBonus}` : 'A wreck or two along the way',
        '',
        finalLabel(state.score),
        bestLabel(best),
      ];
      drawOverlayPanel('DAWN BREAKS', lines, 'Press R or click to keep again', PALETTE.gold);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
