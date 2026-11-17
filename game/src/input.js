// Keyboard and pointer input. The mouse aims the lighthouse beam (its angle
// and its reach); the arrow keys rotate it. One-shot presses (start, foghorn,
// flare, pause, mute, restart) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.
import { BEAM, FIELD, LAMP } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_FLARE = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const FLARE = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);
/** How fast the arrow keys sweep the beam, in radians per second. */
const ROT_SPEED = 1.9;

export function createInput(target) {
  let left = false;
  let right = false;
  let actions = 0;
  let angle = -0.6;
  let length = 700;
  let lastAim = 'keys';

  function fieldPoint(event) {
    const rect = target.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * FIELD.width) / rect.width,
      y: ((event.clientY - rect.top) * FIELD.height) / rect.height,
    };
  }

  function aimAt(point) {
    angle = Math.atan2(point.y - LAMP.y, point.x - LAMP.x);
    length = Math.max(
      BEAM.minLength,
      Math.min(BEAM.maxLength, Math.hypot(point.x - LAMP.x, point.y - LAMP.y)),
    );
    lastAim = 'mouse';
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) {
      left = true;
      lastAim = 'keys';
    } else if (RIGHT.has(event.code)) {
      right = true;
      lastAim = 'keys';
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (FLARE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_FLARE;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
  });
  target.addEventListener('pointermove', (event) => {
    aimAt(fieldPoint(event));
  });
  target.addEventListener('pointerdown', (event) => {
    aimAt(fieldPoint(event));
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    direction() {
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The beam's angle and reach after applying key rotation for `dt` seconds. */
    beam(dt) {
      if (lastAim === 'keys') {
        const dir = (right ? 1 : 0) - (left ? 1 : 0);
        if (dir !== 0) angle += dir * ROT_SPEED * dt;
      }
      return { beamAngle: angle, beamLength: length };
    },
  };
}
