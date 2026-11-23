// Mara Voss's story: five jobs for the syndicate she owes, plus the side
// work that pays the rent — taxi fares and eight hidden packages. A mission
// is a chain of steps; each step names a place, a job, and what finishes it.

import { MISSION_REWARDS, PACKAGE_COUNT, PACKAGE_REWARD } from './config.js';
import { createCar } from './vehicles.js';
import { createEnemy } from './combat.js';

export const PACKAGE_SPOTS = [
  { x: 300, y: 500 }, { x: 780, y: 200 }, { x: 1740, y: 900 }, { x: 2220, y: 1300 },
  { x: 1260, y: 1300 }, { x: 300, y: 1760 }, { x: 2220, y: 1760 }, { x: 1740, y: 300 },
];

const MISSION_DEFS = [
  {
    id: 1,
    title: 'First Delivery',
    start: { x: 780, y: 1480, label: 'Bay Fuel — meet the fixer' },
    brief: [
      'Mara Voss, courier, in debt to the Kess syndicate.',
      'The fixer at Bay Fuel has a first job: a package at the safehouse.',
      'Take it to the Harbour Office — fast. The client pays for speed.',
    ],
    reward: MISSION_REWARDS[0],
    steps: [
      { kind: 'goto', x: 300, y: 1620, radius: 70, label: 'Pick up the package at the safehouse' },
      { kind: 'goto', x: 780, y: 420, radius: 70, label: 'Deliver to the Harbour Office', timer: 90, needCar: false },
    ],
  },
  {
    id: 2,
    title: 'The Quiet Lift',
    start: { x: 1260, y: 900, label: 'Lumen Club — Dario\'s car' },
    brief: [
      'Dario Kess parks his Vesper GT outside his own club. Insulting, really.',
      'Take it. Bring it to the safehouse. And do not let the SBPD see you.',
      'If the heat rises past one star, the job is blown.',
    ],
    reward: MISSION_REWARDS[1],
    steps: [
      { kind: 'steal', x: 1260, y: 900, radius: 80, label: 'Get in Dario\'s Vesper GT' },
      { kind: 'goto', x: 300, y: 1620, radius: 70, label: 'Bring the Vesper to the safehouse', needCar: true, maxWanted: 1 },
    ],
  },
  {
    id: 3,
    title: 'Beach Runner',
    start: { x: 1400, y: 1760, label: 'Coral Beach — the rival' },
    brief: [
      'A rival courier is running Kess cargo down Coral Beach.',
      'Ram his sedan until he drops the package, then grab it.',
      'Deliver it to the Harbour Office and the route is yours.',
    ],
    reward: MISSION_REWARDS[2],
    steps: [
      { kind: 'chase', label: 'Ram the rival courier — 3 hits to stop him' },
      { kind: 'goto', x: 0, y: 0, radius: 55, label: 'Grab the dropped package', dynamic: true },
      { kind: 'goto', x: 780, y: 420, radius: 70, label: 'Deliver the package to the Harbour Office' },
    ],
  },
  {
    id: 4,
    title: 'Dockside Rescue',
    start: { x: 1740, y: 1300, label: 'Warehouse 7 — Rook is pinned' },
    brief: [
      'Rook, Mara\'s wheelman, is pinned at Warehouse 7 with the SBPD closing in.',
      'Reach him, then drive him to the safehouse. The heat is already on you.',
    ],
    reward: MISSION_REWARDS[3],
    steps: [
      { kind: 'goto', x: 1740, y: 1300, radius: 70, label: 'Reach Rook at Warehouse 7', setWanted: 2 },
      { kind: 'goto', x: 300, y: 1620, radius: 70, label: 'Drive Rook to the safehouse', needCar: true },
    ],
  },
  {
    id: 5,
    title: 'The Neon Reckoning',
    start: { x: 1260, y: 900, label: 'Lumen Club — end it' },
    brief: [
      'Five jobs, one debt, and Dario Kess at the end of it.',
      'Walk into the Lumen Club. His guards come first. Then him.',
      'Finish this and the debt is gone. Finish this and Solara Bay is yours.',
    ],
    reward: MISSION_REWARDS[4],
    steps: [
      { kind: 'fight', x: 1260, y: 900, label: 'Fight through Dario\'s guards' },
      { kind: 'fight', x: 1260, y: 900, label: 'Defeat Dario Kess' },
    ],
  },
];

/** Say a queue of subtitle lines, one after another. */
export function say(game, lines) {
  game.dialogLines = [...lines];
  game.dialogIndex = 0;
  game.dialogTimer = 5;
}

export function createMissionState() {
  return {
    defs: MISSION_DEFS,
    done: [false, false, false, false, false],
    current: null, // { def, stepIndex, timer, data }
    taxi: null,
    taxiTimer: 18,
    packages: PACKAGE_SPOTS.map((p) => ({ ...p, taken: false })),
    packagesTaken: 0,
    storyDone: false,
  };
}

export function nextMissionIndex(game) {
  return game.missions.done.findIndex((d) => !d);
}

export function startMission(game, index) {
  const def = MISSION_DEFS[index];
  game.missions.current = { def, stepIndex: 0, timer: 0, data: {} };
  say(game, [`JOB ${def.id}: ${def.title}`, ...def.brief]);
  game.notify(`New job: ${def.title} — $${def.reward} on completion`);
  enterStep(game);
}

function enterStep(game) {
  const m = game.missions.current;
  if (!m) return;
  const step = m.def.steps[m.stepIndex];
  m.timer = step.timer ?? 0;
  m.data = {};
  if (step.setWanted !== undefined) {
    game.wanted = step.setWanted;
    game.hiddenTimer = 0;
  }
  if (step.kind === 'steal') {
    // Dario's Vesper GT, parked outside the club.
    const car = createCar('sport', 1330, 940, Math.PI / 2, { parked: true, color: '#e83a7d' });
    car.missionCar = true;
    game.cars.push(car);
    m.data.car = car;
  }
  if (step.kind === 'chase') {
    const rival = createCar('sedan', 1700, 1760, 0, { npc: true, color: '#7a3ad8' });
    rival.missionCar = true;
    rival.rival = true;
    game.cars.push(rival);
    m.data.rival = rival;
    m.data.hits = 0;
    m.data.hitCooldown = 0;
  }
  if (step.kind === 'fight') {
    const n = m.stepIndex === 0 ? 4 : 1;
    game.enemies = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const kind = m.stepIndex === 1 ? 'dario' : 'guard';
      game.enemies.push(createEnemy(1260 + Math.cos(a) * 130, 900 + Math.sin(a) * 110, kind));
    }
    game.notify(m.stepIndex === 0 ? 'Four guards between you and the club.' : 'Dario Kess himself. End it.');
  }
  if (step.kind === 'goto' && step.dynamic) {
    // The dropped package lies where the rival stopped.
    const rival = m.data.rival;
    step.x = rival ? rival.x : 1400;
    step.y = rival ? rival.y : 1760;
  }
}

function failMission(game, why) {
  const m = game.missions.current;
  if (!m) return;
  game.notify(`Job failed — ${why}. Try again from the start.`);
  say(game, [`${m.def.title}: job failed.`, why]);
  game.missions.current = null;
  game.enemies = [];
  // Tow the mission cars away so a retry starts clean.
  game.cars = game.cars.filter((c) => !c.missionCar);
  game.policeCars = game.policeCars.filter((c) => !c.missionCar);
}

function finishStep(game) {
  const m = game.missions.current;
  m.stepIndex += 1;
  if (m.stepIndex >= m.def.steps.length) {
    finishMission(game);
    return;
  }
  enterStep(game);
}

function finishMission(game) {
  const m = game.missions.current;
  const def = m.def;
  game.cash += def.reward;
  game.missions.done[def.id - 1] = true;
  game.missions.current = null;
  game.enemies = [];
  game.cars = game.cars.filter((c) => !c.missionCar);
  game.policeCars = game.policeCars.filter((c) => !c.missionCar);
  game.notify(`Job complete: ${def.title} — earned $${def.reward}`);
  say(game, [`${def.title} — complete.`, `+$${def.reward}. The city notices people who finish jobs.`]);
  if (game.missions.done.every(Boolean)) {
    game.missions.storyDone = true;
    say(game, ['THE DEBT IS PAID.', 'Solara Bay is yours now, Mara. Drive anywhere.']);
    game.notify('Story complete — Solara Bay is yours. Free roam!');
  }
  game.saveGame();
}

/** Where the HUD arrow and the minimap should point right now. */
export function missionMarker(game) {
  const m = game.missions.current;
  if (m) {
    const step = m.def.steps[m.stepIndex];
    if (step.kind === 'steal' && m.data.car) return { x: m.data.car.x, y: m.data.car.y, label: step.label };
    if (step.kind === 'chase' && m.data.rival) return { x: m.data.rival.x, y: m.data.rival.y, label: step.label };
    if (step.kind === 'fight') return { x: step.x, y: step.y, label: step.label };
    return { x: step.x, y: step.y, label: step.label };
  }
  const next = nextMissionIndex(game);
  if (next >= 0) {
    const def = MISSION_DEFS[next];
    return { x: def.start.x, y: def.start.y, label: `Next job: ${def.title}` };
  }
  return null;
}

export function currentObjective(game) {
  const m = game.missions.current;
  if (!m) {
    const next = nextMissionIndex(game);
    if (next >= 0) return `Next job: ${MISSION_DEFS[next].title} — head to the yellow marker`;
    return 'Free roam — Solara Bay is yours';
  }
  const step = m.def.steps[m.stepIndex];
  let text = step.label;
  if (m.timer > 0) text += ` — ${Math.ceil(m.timer)}s`;
  if (step.kind === 'chase') text += ` (${m.data.hits ?? 0}/3)`;
  return text;
}

export function updateMissions(game, dt) {
  // Subtitle queue.
  if (game.dialogLines && game.dialogIndex < game.dialogLines.length) {
    game.dialogTimer -= dt;
    if (game.dialogTimer <= 0) {
      game.dialogIndex += 1;
      game.dialogTimer = 5;
    }
  }

  const m = game.missions.current;
  const p = game.player;

  // Auto-start the next job when Mara reaches its start marker.
  if (!m) {
    const next = nextMissionIndex(game);
    if (next >= 0) {
      const def = MISSION_DEFS[next];
      if (Math.hypot(p.x - def.start.x, p.y - def.start.y) < 75) {
        startMission(game, next);
        return;
      }
    }
  } else {
    const step = m.def.steps[m.stepIndex];
    if (m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(game, 'Out of time');
        return;
      }
    }
    if (step.maxWanted !== undefined && game.wanted > step.maxWanted) {
      failMission(game, 'The SBPD spotted you');
      return;
    }
    switch (step.kind) {
      case 'goto': {
        const d = Math.hypot(p.x - step.x, p.y - step.y);
        const okCar = !step.needCar || p.inCar;
        if (d < step.radius && okCar) {
          if (step.needCar && !p.inCar) break;
          finishStep(game);
        }
        break;
      }
      case 'steal': {
        if (p.inCar && p.inCar === m.data.car) {
          finishStep(game);
        }
        break;
      }
      case 'chase': {
        const rival = m.data.rival;
        if (!rival) break;
        if (m.data.hitCooldown > 0) m.data.hitCooldown -= dt;
        // The rival cruises east along the beach road, weaving a little.
        rival.angle = 0 + Math.sin(game.time * 0.8) * 0.12;
        rival.speed = 250;
        rival.x += Math.cos(rival.angle) * rival.speed * dt;
        rival.y += Math.sin(rival.angle) * rival.speed * dt;
        if (rival.x > 2400) rival.x = 300;
        // A ram: Mara's car overlapping the rival at speed.
        if (p.inCar && m.data.hitCooldown <= 0) {
          const d = Math.hypot(p.x - rival.x, p.y - rival.y);
          if (d < 62 && Math.abs(p.inCar.speed) > 120) {
            m.data.hits += 1;
            m.data.hitCooldown = 1.5;
            rival.speed = 60;
            game.audio?.thud();
            game.notify(`Hit ${m.data.hits}/3 — he's wobbling!`);
            if (m.data.hits >= 3) {
              rival.speed = 0;
              rival.parked = true;
              finishStep(game);
            }
          }
        }
        break;
      }
      case 'fight': {
        if (game.enemies.length === 0 || game.enemies.every((e) => !e.alive)) {
          finishStep(game);
        }
        break;
      }
      default:
        break;
    }
  }

  // --- side work: hidden packages ---
  for (const pkg of game.missions.packages) {
    if (pkg.taken) continue;
    if (Math.hypot(p.x - pkg.x, p.y - pkg.y) < 42) {
      pkg.taken = true;
      game.missions.packagesTaken += 1;
      game.cash += PACKAGE_REWARD;
      game.audio?.pickup();
      game.notify(`Hidden package ${game.missions.packagesTaken}/${PACKAGE_COUNT} — +$${PACKAGE_REWARD}`);
    }
  }

  // --- side work: taxi fares ---
  updateTaxi(game, dt);
}

function updateTaxi(game, dt) {
  const ms = game.missions;
  if (!ms.taxi) {
    // A hail appears when Mara is driving and free.
    ms.taxiTimer -= dt;
    if (ms.taxiTimer <= 0 && game.player.inCar && !game.missions.current) {
      ms.taxiTimer = 26;
      const spot = randomSidewalkSpot(game);
      if (spot) {
        ms.taxi = { state: 'hail', x: spot.x, y: spot.y, fare: 0, timer: 0, dest: null };
        game.notify('Taxi hail nearby — press F at the passenger.');
      }
    }
    return;
  }
  const taxi = ms.taxi;
  const p = game.player;
  if (taxi.state === 'hail') {
    if (Math.hypot(p.x - taxi.x, p.y - taxi.y) < 60 && p.inCar && game.lastInteract) {
      taxi.state = 'ride';
      taxi.dest = randomRoadDest(game);
      const d = Math.hypot(taxi.dest.x - p.x, taxi.dest.y - p.y);
      taxi.fare = 40 + Math.round(d / 22);
      taxi.timer = 45 + d / 40;
      game.notify(`Passenger aboard — take them to the marker. Fare $${taxi.fare}`);
    }
    // The hail gives up after a while.
    taxi.timer += dt;
    if (taxi.timer > 30) {
      ms.taxi = null;
      ms.taxiTimer = 20;
    }
    return;
  }
  // Riding: the clock runs.
  taxi.timer -= dt;
  if (taxi.timer <= 0) {
    game.notify('The passenger gave up and walked off.');
    ms.taxi = null;
    ms.taxiTimer = 20;
    return;
  }
  if (Math.hypot(p.x - taxi.dest.x, p.y - taxi.dest.y) < 70 && p.inCar) {
    game.cash += taxi.fare;
    game.audio?.pickup();
    game.notify(`Fare paid — +$${taxi.fare}. Nice driving.`);
    ms.taxi = null;
    ms.taxiTimer = 22;
  }
}

function randomSidewalkSpot(game) {
  for (let i = 0; i < 10; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const d = 180 + Math.random() * 260;
    const x = game.player.x + Math.cos(a) * d;
    const y = game.player.y + Math.sin(a) * d;
    if (x > 60 && x < 2500 && y > 60 && y < 1860) return { x, y };
  }
  return null;
}

function randomRoadDest(game) {
  const p = game.player;
  for (let i = 0; i < 12; i += 1) {
    const vertical = Math.random() < 0.5;
    const dest = vertical
      ? { x: [300, 780, 1260, 1740, 2220][Math.floor(Math.random() * 5)], y: 80 + Math.random() * 1760 }
      : { x: 80 + Math.random() * 2400, y: [280, 680, 1080, 1480, 1760][Math.floor(Math.random() * 5)] };
    if (Math.hypot(dest.x - p.x, dest.y - p.y) > 500) return dest;
  }
  return { x: 1260, y: 680 };
}
