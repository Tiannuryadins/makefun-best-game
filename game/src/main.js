// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, game over and victory.
//
// ?seed=N fixes the night's pattern. ?shot=start|play|storm|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, NIGHTS, QUOTA, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_DAWN,
  EVENT_FLARE,
  EVENT_HORN,
  EVENT_OVER,
  EVENT_SAVE,
  EVENT_THUNDER,
  EVENT_WIN,
  EVENT_WRECK,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_FLARE,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import {
  bell,
  chime,
  click,
  crash,
  flareSound,
  horn,
  isMuted,
  setMuted,
  startWaves,
  stopWaves,
  thunder,
  unlock,
} from './audio.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_VICTORY,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.summary);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let summary = null;
  let accumulator = 0;
  let last = performance.now();
  // One-shot presses, queued by handleActions and spent by the next fixed step.
  let pendingHorn = false;
  let pendingFlare = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each wreck.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    summary = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    unlock();
    startWaves();
    announce(`Night 1 of ${NIGHTS}. Save ${QUOTA[0]} ships before dawn. ${LIVES} lives.`);
  }

  function endGame(reason) {
    summary = {
      reason,
      shipsSaved: world.state.saved,
      savedNight: world.state.savedNight,
      quota: QUOTA[world.state.night - 1],
      score: world.state.score,
      dawnBonus: 250 * (world.state.night - 1),
      noWreckBonus: 0,
    };
    screen = SCREEN_OVER;
    stopWaves();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    summary = {
      reason: 'victory',
      shipsSaved: world.state.saved,
      savedNight: world.state.savedNight,
      quota: QUOTA[NIGHTS - 1],
      score: world.state.score,
      dawnBonus: 250 * NIGHTS,
      noWreckBonus: world.state.wrecks === 0 ? 500 : 0,
    };
    screen = SCREEN_VICTORY;
    stopWaves();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Victory. Dawn breaks, ${world.state.saved} ships saved. Score ${world.state.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_SAVE) chime(world.state.combo);
    if (events & EVENT_WRECK) {
      crash();
      announce(world.state.lives === 1 ? 'Wrecked. 1 life left.' : `Wrecked. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_HORN) horn();
    if (events & EVENT_FLARE) flareSound();
    if (events & EVENT_THUNDER) thunder();
    if (events & EVENT_DAWN) {
      bell();
      announce(`Night ${world.state.night - 1} complete. Night ${world.state.night} begins.`);
    }
    if (events & EVENT_WIN) {
      bell();
      winGame();
    } else if (events & EVENT_OVER) {
      endGame(world.state.overReason);
    }
  }

  function handleActions(dt) {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      setMuted(!isMuted());
      announce(isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) {
        click();
        startGame();
      } else if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
        click();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        click();
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // Playing: a click or Space is a foghorn blast, F is a flare.
    if (actions & ACTION_CONFIRM) pendingHorn = true;
    if (actions & ACTION_FLARE) pendingFlare = true;
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  }

  function step(beam) {
    if (screen === SCREEN_TITLE) {
      const angle = -0.55 + 0.6 * Math.sin(world.state.time * 0.22);
      const length = 720 + 120 * Math.sin(world.state.time * 0.13 + 1);
      world.step(STEP, { beamAngle: angle, beamLength: length, horn: false, flare: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, { ...beam, horn: pendingHorn, flare: pendingFlare }, false);
    pendingHorn = false;
    pendingFlare = false;
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions(STEP);
    const beam = input.beam(STEP);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(beam);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, summary);
  }

  // Leaving the tab pauses a running game rather than letting ships wreck unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Beaconkeeper. Press Space or click to begin the night.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
