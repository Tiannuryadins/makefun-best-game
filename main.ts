// Beaconkeeper for best-game-01 (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to the output directory and writes dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// Beaconkeeper: you are the keeper of the last lighthouse on a rocky coast. Aim the beam with
// the mouse, steer sloops, brigs and galleons through rocks, fog banks and storm cells, and bring
// them into the harbour before dawn — three nights in a row, quotas 4, 6 and 8 ships. Space or
// click sounds the foghorn, F fires a flare, P pauses, R restarts. Score is ships saved times a
// combo multiplier, plus a dawn bonus and a no-wrecks bonus.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const shotsDir = join(here, 'screenshots');

if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing');
}
if (!existsSync(shotsDir)) {
  throw new Error('screenshots/ is missing');
}
// The gate takes 3 or 4 screenshots: refuse here where the scorer would refuse.
const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`screenshots/ holds ${shots.length} files, expected 3 to 4`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
