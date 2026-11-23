// Screenshot scenes: each one builds a real game, drops Mara into a real
// moment of it, and plays the simulation forward with an autopilot holding
// the keys — so every screenshot is a frame the game itself produced, with
// the same seed always giving the same frame.

import { STEP } from './config.js';
import { angleDiff } from './utils.js';
import { createGame, stepGame } from './state.js';
import { makeScriptedInput } from './input.js';
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';

/**
 * A driver that follows a chain of close-spaced road waypoints. Waypoints
 * sit ~200 px apart, so the car rounds corners instead of cutting them, and
 * if it ever wedges against something it reverses out and carries on.
 */
function makeDriver(waypoints) {
  const points = [...waypoints];
  let stuckTime = 0;
  let reverseTime = 0;
  return (game, input) => {
    const car = game.player.inCar;
    if (!car) return;
    while (points.length > 0 && Math.hypot(points[0].x - car.x, points[0].y - car.y) < 60) {
      points.shift();
    }
    if (reverseTime > 0) {
      reverseTime -= STEP;
      input.set('down', true);
      input.set('up', false);
      input.set('left', false);
      input.set('right', false);
      return;
    }
    if (Math.abs(car.speed) < 30) {
      stuckTime += STEP;
      if (stuckTime > 0.8) {
        stuckTime = 0;
        reverseTime = 0.7;
        return;
      }
    } else {
      stuckTime = 0;
    }
    const wp = points[0] ?? { x: 1260, y: 680 };
    const want = Math.atan2(wp.y - car.y, wp.x - car.x);
    const diff = angleDiff(car.angle, want);
    input.set('up', true);
    input.set('down', false);
    input.set('left', diff < -0.06);
    input.set('right', diff > 0.06);
  };
}

/** Walk Mara toward a point, on foot. */
function walkPilot(game, input, tx, ty) {
  const p = game.player;
  input.set('right', p.x < tx - 12);
  input.set('left', p.x > tx + 12);
  input.set('down', p.y < ty - 12);
  input.set('up', p.y > ty + 12);
}

function runSeconds(game, input, seconds, pilot) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    pilot(game, input);
    stepGame(game, input, STEP);
  }
}

function putPlayerInCar(game, type, x, y, angle, color, speed = 0) {
  const car = createCar(type, x, y, angle, { color });
  car.speed = speed;
  game.cars.push(car);
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
  game.player.inCar = car;
  car.parked = false;
  return car;
}

/** Park a patrol car behind the player, already rolling, for a chase shot. */
function placeChaser(game, x, y, angle, speed) {
  const car = createCar('patrol', x, y, angle, { npc: true });
  car.speed = speed;
  game.policeCars.push(car);
  game.cars.push(car);
  return car;
}

/**
 * Stage one named scene and return the game ready to draw: 'cover',
 * 'drive', 'foot' or 'night'. Any other name stages the cover.
 */
export function stageShot(name, seed = 7) {
  const input = makeScriptedInput();
  const game = createGame(seed);

  if (name === 'drive') {
    // Mid-morning at Marina Quay: a sedan rolling south, traffic, no heat.
    game.clockMin = 10 * 60 + 30;
    startMission(game, 0);
    putPlayerInCar(game, 'sedan', 780, 500, Math.PI / 2, '#c94f4f', 240);
    const drive = makeDriver([
      { x: 780, y: 700 }, { x: 780, y: 900 }, { x: 780, y: 1080 },
      { x: 1000, y: 1080 }, { x: 1260, y: 1080 }, { x: 1260, y: 1300 },
    ]);
    runSeconds(game, input, 2.5, drive);
    return game;
  }

  if (name === 'foot') {
    // Late afternoon at Warehouse 7: Mara on foot, guards closing in.
    game.clockMin = 16 * 60 + 5;
    startMission(game, 4);
    game.player.x = 1700;
    game.player.y = 1240;
    game.player.hp = 100;
    const m = game.missions.current;
    m.def.steps[m.stepIndex].x = 1740;
    m.def.steps[m.stepIndex].y = 1300;
    game.enemies.forEach((e, i) => {
      e.x = 1840 + (i % 2) * 80;
      e.y = 1160 + Math.floor(i / 2) * 110;
    });
    runSeconds(game, input, 1.6, (g, inp) => walkPilot(g, inp, 1740, 1300));
    return game;
  }

  if (name === 'night') {
    // Night on Coral Beach: the rival ahead, the SBPD behind, lamps on.
    game.clockMin = 22 * 60 + 15;
    startMission(game, 2);
    putPlayerInCar(game, 'sport', 1100, 1760, 0, '#e83a7d', 280);
    placeChaser(game, 950, 1760, 0, 300);
    game.wanted = 2;
    game.hiddenTimer = 0;
    const drive = makeDriver([
      { x: 1400, y: 1760 }, { x: 1700, y: 1760 }, { x: 2000, y: 1760 }, { x: 2220, y: 1760 },
    ]);
    runSeconds(game, input, 2.2, drive);
    return game;
  }

  // Cover: dusk in Neon Row, a Vesper GT at speed with two patrol cars on
  // its tail, all three on the same road — the cops start a few car lengths
  // back so the frame catches the chase, not the pile-up, and the moving
  // traffic is cleared out of the shot so nothing can stall the run.
  game.clockMin = 18 * 60 + 40;
  startMission(game, 0);
  const clearTraffic = (c) => !c.npc;
  game.cars = game.cars.filter(clearTraffic);
  game.trafficCars = game.trafficCars.filter(clearTraffic);
  putPlayerInCar(game, 'sport', 900, 1080, 0, '#e83a7d', 320);
  placeChaser(game, 700, 1080, 0, 310);
  placeChaser(game, 640, 1100, 0, 300);
  game.wanted = 3;
  game.hiddenTimer = 0;
  const drive = makeDriver([
    { x: 1200, y: 1080 }, { x: 1500, y: 1080 }, { x: 1800, y: 1080 }, { x: 2100, y: 1080 },
  ]);
  runSeconds(game, input, 1.6, drive);
  return game;
}
