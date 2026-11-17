# Beaconkeeper — build transcript

Built 2026-11-17 for make.fun best-game-01 ("Make the best game", $1,000).
Original 2D canvas game in vanilla JavaScript: no libraries, no external
assets, no network requests, no keys, no paid services. All art is drawn
procedurally; all sound is synthesized with WebAudio.

## What was built

`game/index.html` (19 lines) — full-window canvas `#game`, status line for
screen readers, loads `src/main.js`.

| File | Lines | What it does |
|---|---|---|
| `game/src/config.js` | 101 | All tuning numbers + palette: field 1280×720, 1/60 s step, ship kinds, beam, harbour, nights (75 s, quotas 4/6/8), horn/flare charges |
| `game/src/random.js` | 12 | mulberry32 seeded RNG |
| `game/src/world.js` | 597 | DOM-free simulation: ships, rocks, fog, storms, beam/pool, horn, flare, lightning, saves/wrecks/combo, 3 nights, events; no `Date.now`, no `Math.random` |
| `game/src/input.js` | 105 | Mouse aim (angle + reach), arrow-key rotation, one-shot action flags (confirm/flare/pause/mute/restart) |
| `game/src/render.js` | 754 | Canvas renderer: sky + stars + moon, moon glint, wave strokes, coast + breakwater + harbour lights, lighthouse + beam + pool, fog, rocks (hidden in fog unless lit/flared/near a ship), storm swirls + rain + lightning, ships (hull/mast/sail/lantern/wake), particles, popups, HUD, title/pause/over/victory overlays |
| `game/src/audio.js` | 208 | WebAudio synth, lazy on first gesture: foghorn, save chime (rises with combo), wreck crash, dawn bell, thunder, flare, looping waves; mute flag |
| `game/src/shots.js` | 182 | Staged scenes + autopilot (aims the pool ahead of the ship most in danger, routes around rocks, horns near rocks, flares near storms) |
| `game/src/main.js` | 257 | Boot, fixed-step loop, 5 screens, `?seed=` / `?shot=` handling, `window.__shotReady`, visibility auto-pause, best score in localStorage |
| `capture-shots.cjs` | 36 | Dev tool: headless Chromium (playwright-core + Chrome for Testing) captures `shots.json` to `screenshots/` as 1280×720 JPEG |
| `shots.json` | 1 | 4 shots: 1-start, 2-play, 3-storm, 4-end (all `&seed=1`) |

`main.ts`, `serve.ts`, `vendor/makefun-game.ts`, `LICENSE` (MIT) are the kit
starter's, untouched. Total game code: 2,216 lines across 8 modules.

## Verification (all run, all passing)

1. **Syntax** — `node --check` on `.mjs` copies of every `game/src/*.js`
   (plain `node --check` on `.js` rejects ES-module syntax without a
   `package.json`; the `.mjs` copies pass): **PASS**.
   `grep` confirms no `Math.random` / `Date.now` in `world.js` (only a
   comment mentions them; `audio.js` uses `Math.random` for noise, and
   `main.js` only for the default seed when no `?seed=` is given).
2. **Headless Node sim** (`/tmp/bk-sim.mjs`, not in the repo):
   - End shot, seed 1: **VICTORY** — score 20,664, 43 ships saved,
     0 wrecks, 3 lives left, 225.1 s.
   - Play shot (26 s): sane state, 6 ships at sea, 0 wrecks.
   - Storm shot (20 s, forced storm + flare at 8 s): sane state, 0 wrecks.
   - Start shot (5 s title backdrop): title screen, score 0.
   - Determinism: same seed twice → byte-identical ship positions/scores;
     a different seed differs.
   - Robustness sweep (`/tmp/bk-seeds.mjs`): the end-shot autopilot wins
     from seeds 1–8, **8/8**, every win with 0 wrecks (one seed had 1 wreck
     in an earlier run; final code: 0 wrecks on all 8).
3. **Dossier determinism** — `MAKEFUN_OUTPUT_DIR=/tmp/bk-out1 node main.ts`
   vs `/tmp/bk-out2`, `diff -r`: **byte-identical**. (Note: `main.ts`
   refuses an empty `screenshots/` — `buildDossier` throws "screenshots/
   holds no image" — so the determinism run was done after capturing.)
4. **Serve smoke test** — `node serve.ts --port 8091`: `/` 200 (859 B),
   `/src/main.js` 200, `/src/world.js` 200; path traversal (`/../main.ts`)
   404; server killed after the test.
5. **Screenshots** — `node capture-shots.cjs`: **ALL_SHOTS_OK**. All four
   are 1280×720 JPEG, quality 82, each ≤ 256 KiB: 1-start 79,485 B;
   2-play 67,217 B; 3-storm 65,071 B; 4-end 77,046 B. Each was read back
   and visually checked: title panel over a live sweeping beam; play with
   beam, fog, storm swirl and lit ships; storm with flare-lit coast;
   victory "DAWN BREAKS" panel with the score breakdown
   (43 saved, +750 dawn, +500 no wrecks, 20,664).

## Bugs found and fixed during the build

- **Ship ids never incremented** (`spawnShip` used `state.nextShipId`
  without `++`): every ship had id 1, so the autopilot's target hysteresis
  was meaningless and the beam thrashed. Found via a debug script showing
  two ships with id 1.
- **Lookout vs horn/beam steering fought each other**: both turned the
  heading every step and partly cancelled, so horned ships drove into
  rocks. The lookout now has the helm outright while a rock is close.
- **Beam lit check used the pool distance**: ships beyond the pool were
  unlit even when inside the cone. The beam now lights everything in its
  cone out to its reach; the pool is the aim point.
- **Safety clamp teleported ships into rocks**: a ship turned around by
  the lookout before entering the field was clamped to x=1256, next to a
  rock. Replaced with directional edge bounce (bounce only when moving
  outward) plus a non-teleporting last-resort clamp.
- **Ships hovered at the right edge**: the lookout's straight "away"
  direction pushed them out of the field. The lookout now blends "away"
  with "toward the harbour" so edge-caught ships slide past the rock.
- **Unlit ships milled around the top**: the wander random-walk could
  cancel the current. Unlit ships now drift toward the current's direction
  with a wobble on top.
- **`NIGHTS` not imported in `render.js`**: the play shot timed out in
  headless Chromium (`ReferenceError` in `drawHud`); the title shot had
  passed because it never calls `drawHud`. Fixed the import.
- **`file://` CORS blocks ES modules**: `capture-shots.cjs` now launches
  Chromium with `--allow-file-access-from-files`.
- **HUD label duplication** (`NIGHT NIGHT 1 / 3`, `COMBO ×1.00 COMBO 0`):
  the cached-label prefixes were doubled by the values passed in. HUD
  rebuilt with plain strings for night/saved/combo; saved count capped at
  the quota for display.

## Not done (for the coordinator)

- No GitHub repo was created, nothing was pushed, nothing was submitted,
  `makefun check` / `bundle` were not run — those are the coordinator's
  steps. Screenshots are real renders of the game's own code, captured
  with `capture-shots.cjs` in this session.
