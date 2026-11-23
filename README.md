# SOLARA BAY: 2.5D open-world crime — 6 districts, 5 story missions, wanted/police dispatch, boss, procedural audio

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/fridoaf/makefun-bounties/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/fridoaf/makefun-bounties/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Bay** is a 2.5D top-down open-world crime game built from scratch for
make.fun's "Make GTA 6" bounty (gta6-01, $1,666 in prizes). You play **Mara
Voss**, a courier in debt to the local syndicate, driving and fighting across
six districts of a fictional sunlit coastal city to settle the score with
club owner **Dario Kess**. Every name, place, character, and vehicle is
original — nothing from Rockstar or GTA.

## The city — 6 districts

Solara Bay is one continuous open map with a full day → dusk → night cycle;
street lamps switch on after dark.

| District | Character |
| --- | --- |
| Marina Quay | Harbourside promenade, daytime traffic |
| Old Coral | Tight old-town streets |
| Neon Row | Nightlife strip, sunset police chases |
| Palm Heights | Wealthy hillside roads |
| Dockside | Warehouses and on-foot mission fights |
| Coral Beach | Night wanted-level shootouts on the sand |

## Story — 5 missions

Five story missions with briefings, objectives, timers, checkpoints, and
payouts, plus side work: taxi fares and 8 hidden packages scattered around
the city. The arc builds to a boss fight against **Dario Kess** himself.
Progress autosaves to localStorage — continue from the title screen.

## Wanted system — police dispatch

- **Wanted level 0–5 stars.** Steal a car or cause chaos and the police
  notice: patrol cars chase and ram you, officers on foot try to arrest you.
- **Police dispatch** escalates with your wanted level — more units, faster
  response, tighter pursuit the higher the heat.
- **Cool off** by laying low, swapping cars, or paying the fine. Get busted
  or wasted and you restart from the mission checkpoint (press **R**).

## Driving & combat

- **7 original cars** — city hatch, sedan, taxi, van, sport coupe, dock
  truck, patrol car — each with its own speed and handling. Steal parked
  cars or traffic; the owner runs, and the police notice.
- **Close combat on foot** — punches, knockback, enemy HP bars, particles,
  and screen shake.
- **HUD + minimap** — health, armor, money, wanted stars, clock, speed,
  active objective, dialog, and a live minimap with police, traffic, and
  mission markers.

## Procedural audio

All sound is synthesized live with WebAudio — no audio files. Engine hum
that follows your speed, a police siren, pickup / coin / crash effects, and
a small synth loop. Press **M** to mute.

## Run it

Requires **Node 22** and a modern desktop browser. No build step, no network
requests, no libraries.

```sh
node serve.ts
# open http://localhost:8080
```

`serve.ts` (Node 22, standard library only) serves `game/` on port 8080 so
the game can be played and screenshotted without any build step.

To build the make.fun entry bundle, `main.ts` (Node 22, standard library
only) copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` for the grader:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Key | Action |
| --- | --- |
| Enter | Start / confirm on the title screen |
| WASD / arrow keys | Move on foot, drive |
| Shift | Run |
| E | Enter / exit the nearest car |
| F | Interact / start mission / taxi |
| Space | Punch (on foot) / handbrake (driving) |
| Esc | Pause / resume |
| R | Restart from checkpoint (after busted / wasted) |
| M | Mute |

## Folder structure

```text
.
├── game/                  # The playable game (static files, ES modules)
│   ├── index.html         # Entry point
│   └── src/               # Game code: city, missions, police, combat,
│       │                 # vehicles, traffic, audio, HUD, player, save
│       ├── audio.js       # Procedural WebAudio: engine, siren, effects
│       ├── city.js        # 6 districts, day/night cycle, lamps
│       ├── combat.js      # Punches, knockback, HP bars, boss fight
│       ├── config.js      # Tuning constants
│       ├── hud.js         # HUD + minimap
│       ├── main.js        # Game loop and state machine
│       ├── missions.js    # 5 story missions, briefings, checkpoints
│       ├── player.js      # On-foot movement and stats
│       ├── police.js      # Wanted levels 0–5, dispatch, pursuit
│       ├── save.js        # localStorage autosave / continue
│       ├── traffic.js     # Traffic cars and pedestrians
│       ├── utils.js       # Shared helpers
│       └── vehicles.js    # 7 original cars, handling, stealing
├── screenshots/           # 4 real renders of the game in Chrome desktop
│   ├── 1-cover-chase.jpg  # Sunset police chase in Neon Row, 3 stars
│   ├── 2-city-drive.jpg   # Daytime traffic in Marina Quay
│   ├── 3-mission-foot.jpg # On-foot fight in Dockside during a mission
│   └── 4-night-wanted.jpg # Night wanted level on Coral Beach
├── vendor/                # Vendored make.fun library (dossier builder)
├── main.ts                # Entry driver: copies game/ + screenshots/,
│                          # writes dossier.json
├── serve.ts               # Tiny static server for local play (port 8080)
├── LICENSE                # MIT
└── README.md              # This file
```

## Screenshots

Four real renders of the game running in Chrome desktop, in `screenshots/`
(the first by name is the cover):

1. `1-cover-chase.jpg` — sunset police chase in Neon Row, 3 stars
2. `2-city-drive.jpg` — daytime traffic in Marina Quay
3. `3-mission-foot.jpg` — on-foot fight in Dockside during a mission
4. `4-night-wanted.jpg` — night wanted level on Coral Beach

---

<sub>Entered on [make.fun](https://make.fun/?ref=qnjk6cmf&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
