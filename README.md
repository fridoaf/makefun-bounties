# Solara Bay — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/fridoaf/makefun-bounties/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/fridoaf/makefun-bounties/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Bay** is a 2.5D top-down open-world crime game, built from scratch for
make.fun's "Make GTA 6" bounty ($1,666 in prizes). You play **Mara Voss**, a
courier in debt to the local syndicate, driving and fighting her way through
six districts of a fictional sunlit coastal city to settle the score with
club owner **Dario Kess**. Every name, place, character, and vehicle is
original — nothing from Rockstar or GTA.

## What you can do

- **Explore 6 districts** — Marina Quay, Old Coral, Neon Row, Palm Heights,
  Dockside, and Coral Beach — on foot or behind the wheel, with a full
  day → dusk → night cycle and street lamps that switch on after dark.
- **Drive 7 original cars** (city hatch, sedan, taxi, van, sport coupe,
  dock truck, patrol car), each with its own speed and handling. Steal
  parked cars or traffic — the owner runs, and the police notice.
- **Live with a wanted level (0–5 stars).** Patrol cars chase and ram you,
  officers on foot try to arrest you. Lay low, swap cars, or pay the fine
  to cool off. Get busted or wasted and you restart from the mission
  checkpoint.
- **Play 5 story missions** with briefings, objectives, timers, checkpoints,
  and payouts — plus taxi fares and 8 hidden packages scattered around the
  city.
- **Fight** with close combat: punches, knockback, enemy HP bars, a boss
  fight against Dario Kess, particles, and screen shake.
- **HUD + minimap** — health, armor, money, wanted stars, clock, speed,
  active objective, dialog, and a live minimap with police, traffic, and
  mission markers.
- **Procedural audio** (WebAudio): engine hum that follows speed, police
  siren, pickup/coin/crash effects, and a small synth loop. No audio files.
- **Save** — progress autosaves to localStorage; continue from the title
  screen.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests, no libraries: `game/index.html` plus
ES modules under `game/src/`. `main.ts` (Node 22, standard library only)
copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` for the make.fun grader:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| Shift | Run |
| E | Enter / exit nearest car |
| F | Interact / start mission / taxi |
| Space | Punch (on foot) / handbrake (driving) |
| M | Mute |
| Esc | Pause |
| R | Restart from checkpoint (after busted / wasted) |

## Screenshots

Four real renders of the game running in Chrome desktop, in `screenshots/`
(the first by name is the cover):

1. `1-cover-chase.jpg` — sunset police chase in Neon Row, 3 stars
2. `2-city-drive.jpg` — daytime traffic in Marina Quay
3. `3-mission-foot.jpg` — on-foot fight in Dockside during a mission
4. `4-night-wanted.jpg` — night wanted level on Coral Beach

---

<sub>Entered on [make.fun](https://make.fun/?ref=qnjk6cmf&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
