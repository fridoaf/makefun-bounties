# SOLARA BAY: 2.5D open-world crime — 6 districts, 5 story missions, wanted/police dispatch, boss, procedural audio

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/fridoaf/makefun-bounties/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/fridoaf/makefun-bounties/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Bay** is a 2.5D top-down open-world crime game built for make.fun's
"Make GTA 6" bounty (gta6-01, $1,666 in prizes). You are **Mara Voss**, a
courier who owes the Kess syndicate. Across one continuous coastal city you
drive, steal, fight, and run five story jobs to clear the debt — and end it
with club owner **Dario Kess** himself. Every name, place, character, and
vehicle is original; nothing here comes from Rockstar or GTA.

## The city — 6 districts, one map

A single 2560×1920 open map with a full day → dusk → night cycle. Street
lamps switch on after dark, headlights cut through the night, and each
district reads differently at a glance:

| District | Character |
| --- | --- |
| Marina Quay | Harbour, piers, daytime traffic |
| Old Coral | Tight old-town streets, SBPD headquarters |
| Neon Row | Nightlife strip, sunset police chases |
| Palm Heights | Hillside roads, the safehouse |
| Dockside | Warehouses, on-foot mission fights |
| Coral Beach | Sand, palms, night wanted-level chases |

## Story — 5 missions

Five story jobs with briefings, step-by-step objectives, a 90-second
delivery timer, a stealth car theft, a beach-road chase, a rescue under
police heat, and a boss fight against **Dario Kess**. Progress autosaves to
localStorage — continue from the title screen.

Side work pays the rent: taxi fares (pick up a hailing passenger, drop them
at the marker before the clock runs out) and **8 hidden packages** scattered
around the city, $100 each.

## Wanted — police dispatch

- **Wanted level 0–5 stars.** Steal a car in sight of the law, hit a
  pedestrian, punch a bystander, or ram a patrol car and the heat rises.
  Patrol cars chase and ram you; officers on foot run you down and try to
  arrest you.
- **Dispatch escalates** with the wanted level — more patrol cars, more foot
  cops, wider sight, faster pursuit.
- **Cool off** by breaking line of sight and laying low; stars fade one at a
  time. Get **busted** (caught) or **wasted** (HP gone) and you retry from
  your last saved job.

## Driving & combat

- **7 original cars** — Pico Hatch, Meridian Sedan, Bay Taxi, Dock Van,
  Vesper GT sport coupe, Haul Truck, SBPD Patrol — each with its own top
  speed, acceleration, and handling. Steal parked cars or pull drivers out
  of traffic; a stolen car is flagged on the HUD.
- **Traffic and pedestrians** live on the same streets: 12 traffic cars
  follow the road grid and stop for the car ahead; 16 pedestrians walk the
  sidewalks and run from trouble.
- **Close combat on foot** — punches with knockback, enemy HP bars,
  particles, and a hurt flash. Guards chase and swing back.
- **HUD + minimap** — health, cash, wanted stars, clock, speed, active
  objective, subtitle dialog, notifications, and a live minimap with the
  player, police, enemies, taxi jobs, packages, and the yellow mission
  marker. A screen-edge arrow points at the job when it is off-screen.

## Procedural audio

All sound is synthesized live with WebAudio — no audio files, no network.
Engine hum that follows your speed, a two-tone police siren, pickup blips,
crash thuds, and a small synth bass-and-lead loop. Press **M** to mute.

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
| Enter | Start / confirm |
| WASD / arrow keys | Move on foot, drive |
| Shift | Run |
| Space | Punch (on foot) / handbrake (driving) |
| E | Enter / exit the nearest car |
| F | Interact (taxi passenger) |
| Esc | Pause / resume |
| M | Mute |

## Folder structure

```text
.
├── game/                  # The playable game (static files, ES modules)
│   ├── index.html         # Entry point, canvas + HUD
│   └── src/               # One job per file
│       ├── audio.js       # Procedural WebAudio: engine, siren, music, SFX
│       ├── city.js        # 6 districts, street grid, buildings, day cycle
│       ├── combat.js      # Punches, enemies, knockback, particles
│       ├── config.js      # Tuning constants and palettes
│       ├── hud.js         # HUD, minimap, menus, end screens
│       ├── input.js       # Keyboard + mouse, scripted input for shots
│       ├── main.js        # Boot, game loop, screen state machine
│       ├── missions.js    # 5 story missions, taxi fares, hidden packages
│       ├── player.js      # On-foot movement, entering/exiting cars
│       ├── police.js      # Wanted 0–5, dispatch, pursuit, busted
│       ├── save.js        # localStorage save / continue
│       ├── shots.js       # Screenshot scenes (real simulation, autopilot)
│       ├── state.js       # Game object: step it, draw it
│       ├── traffic.js     # Traffic cars and pedestrians
│       ├── utils.js       # Math, seeded RNG, collision helpers
│       └── vehicles.js    # 7 original cars, arcade physics, stealing
├── screenshots/           # 4 real renders of the game in desktop Chrome
│   ├── 1-cover-chase.jpg  # Dusk police chase in Neon Row, wanted ★★★
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

Four real renders of the game running in desktop Chrome, in `screenshots/`
(the first by name is the cover):

1. `1-cover-chase.jpg` — dusk police chase in Neon Row, wanted ★★★
2. `2-city-drive.jpg` — daytime traffic in Marina Quay
3. `3-mission-foot.jpg` — on-foot fight in Dockside during a mission
4. `4-night-wanted.jpg` — night wanted level on Coral Beach

---

<sub>Entered on [make.fun](https://make.fun/?ref=qnjk6cmf&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
