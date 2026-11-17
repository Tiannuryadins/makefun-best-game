# Beaconkeeper

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Tiannuryadins/makefun-best-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Tiannuryadins/makefun-best-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Guide the fleet home before dawn.** You are the keeper of the last
lighthouse on a rocky coast. Aim your beam across a dark sea, steer sloops,
brigs and galleons through rocks, fog banks and storm cells, and bring them
into the harbour before the sun comes up — three nights in a row.

## The game

Ships sail in from the top and the right edges, drifting with the current.
A ship inside the lighthouse beam steers toward the beam's bright pool, so
you guide it home by aiming the light just ahead of it on the way to the
harbour. But the sea is not kind:

- **Rocks** — 8–12 of them, some hiding inside drifting fog banks, invisible
  unless the beam, a flare, or a passing ship reveals them. Touch one and the
  ship is wrecked.
- **Fog banks** — 3–5 drifting ellipses that swallow whatever is inside.
- **Storm cells** — 1–3 swirling cells that shove ships off course and
  scramble their headings, with lightning and thunder.

A ship that sails through the gap in the breakwater (bottom edge, between
the golden harbour lights) is **saved**: sloop +100, brig +150, galleon
+250, times a combo multiplier that grows +0.25 per consecutive save
without a wreck (up to ×3.00). Three wrecks ends the game.

**Three nights, 75 seconds each.** Save the quota — 4, then 6, then 8
ships — before dawn breaks, or the game is over. Finish a night for a
+250 dawn bonus; finish all three with no wrecks at all for +500 more.
Best score is kept in your browser.

## Controls

| Input | Does |
|---|---|
| Mouse | Aim the lighthouse beam (the bright pool follows your cursor) |
| ← → or A / D | Rotate the beam |
| Click or Space | Foghorn blast — ships near the bright pool turn for the harbour and speed up for 4 s (3 charges, one returns every 14 s) |
| F | Flare — lights the whole coast for 3 s and shoves storm cells away (2 per night) |
| P or Esc | Pause |
| M | Mute |
| R | Restart (on the end screens) |
| Enter / Space / Click | Start |

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no
network requests, no libraries — plain HTML, canvas and vanilla JavaScript
under `game/`, with the simulation in `game/src/world.js` (fixed 1/60 s
steps, seeded RNG, so `?seed=N` replays the same night) and the screenshots
staged by `game/src/shots.js` (`?shot=start|play|storm|end`).

## Files

- `game/index.html` — the page: a full-window canvas, nothing else.
- `game/src/config.js` — every tuning number and colour.
- `game/src/random.js` — mulberry32 seeded RNG.
- `game/src/world.js` — the rules: ships, rocks, fog, storms, nights, score.
- `game/src/input.js` — mouse aim, keys, one-shot action flags.
- `game/src/render.js` — the night sea: sky, moon glint, beam, lighthouse,
  ships, storms, HUD and screens.
- `game/src/audio.js` — WebAudio synth: foghorn, bells, thunder, waves.
- `game/src/shots.js` — the four staged screenshot scenes and the autopilot.
- `game/src/main.js` — boot, the fixed-step loop, screens, `?shot=` handling.
- `capture-shots.cjs` — dev tool: re-captures `screenshots/` with headless
  Chromium (not part of the game).
- `screenshots/` — 1-start, 2-play, 3-storm, 4-end (1280×720 JPEG).

Built by an AI agent for make.fun best-game-01.

<sub>Entered on [make.fun](https://make.fun/?ref=03phvnjs&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
