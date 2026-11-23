// The game object and its two verbs: step it forward, draw it. Everything
// else is a module this file wires together — the loop in main.js only ever
// calls createGame, stepGame and drawGame.

import { CLOCK_START_MINUTES, SKY } from './config.js';
import { clamp, makeRng } from './utils.js';
import { SPOTS, buildCity, drawBuildings, drawGround, drawLampGlow, skyPeriod } from './city.js';
import { createCar, drawCar, driveCar } from './vehicles.js';
import { createPlayer, drawPlayer, enterCar, exitCar, nearestCar, updatePlayerOnFoot } from './player.js';
import { createTraffic, drawTraffic, updateTraffic } from './traffic.js';
import { drawFootCops, raiseWanted, updatePolice } from './police.js';
import { drawEnemies, drawParticles, playerPunch, spawnBurst, spawnDust, updateEnemies, updateParticles } from './combat.js';
import { createMissionState, missionMarker, updateMissions } from './missions.js';
import { drawHud } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame } from './save.js';

/** Build a fresh game. `save` (from loadSave) restores Mara's progress. */
export function createGame(seed, save = null) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const traffic = createTraffic(city, rng);
  const start = SPOTS.playerStart;
  const player = createPlayer(start.x, start.y);

  const game = {
    seed,
    rng,
    city,
    player,
    cars: [...traffic.cars],
    trafficCars: traffic.cars,
    peds: traffic.peds,
    policeCars: [],
    footCops: [],
    enemies: [],
    particles: [],
    missions: createMissionState(),
    cash: 120,
    wanted: 0,
    hiddenTimer: 0,
    bustTimer: 0,
    busted: false,
    wasted: false,
    clockMin: CLOCK_START_MINUTES,
    time: 0,
    camera: { x: start.x, y: start.y, zoom: 1 },
    notifs: [],
    dialogLines: [],
    dialogIndex: 0,
    dialogTimer: 0,
    crimePulse: null,
    sirenOn: false,
    lastInteract: false,
    audio: createAudio(),
    save: save ?? loadSave(),
  };

  // A parked hatch by the safehouse, so Mara can drive from the first minute.
  const starterCar = createCar('hatch', 300, 1380, Math.PI / 2, { parked: true, color: '#5fb2e8' });
  game.cars.push(starterCar);
  game.trafficCars.push(starterCar);

  // Restore a save, if there is one.
  if (game.save) {
    const s = game.save;
    game.cash = s.cash ?? 120;
    game.player.hp = s.hp ?? 100;
    game.player.x = s.x ?? start.x;
    game.player.y = s.y ?? start.y;
    game.clockMin = s.clockMin ?? CLOCK_START_MINUTES;
    game.missions.done = s.missionsDone ?? [false, false, false, false, false];
    game.missions.storyDone = !!s.storyDone;
    if (Array.isArray(s.packagesTaken)) {
      s.packagesTaken.forEach((taken, i) => {
        if (taken && game.missions.packages[i]) game.missions.packages[i].taken = true;
      });
      game.missions.packagesTaken = game.missions.packages.filter((p) => p.taken).length;
    }
    game.camera.x = game.player.x;
    game.camera.y = game.player.y;
  }

  game.notify = (text) => {
    game.notifs.push({ text, life: 4.5 });
    if (game.notifs.length > 4) game.notifs.shift();
  };
  game.raiseWanted = (stars, x, y, reason) => raiseWanted(game, stars, x, y, reason);
  game.saveGame = () => saveGame(game);
  return game;
}

/** One fixed step of the whole simulation. */
export function stepGame(game, input, dt) {
  game.time += dt;
  game.clockMin = (game.clockMin + dt) % 1440; // 1 real second = 1 game minute
  for (const n of game.notifs) n.life -= dt;
  game.notifs = game.notifs.filter((n) => n.life > 0);
  if (game.crimePulse) {
    game.crimePulse.t -= dt;
    if (game.crimePulse.t <= 0) game.crimePulse = null;
  }
  game.lastInteract = input.wasPressed('interact');
  if (input.pressed?.delete) input.pressed.delete('interact');

  const p = game.player;

  if (p.inCar) {
    const car = p.inCar;
    const { crashed, hitPolice } = driveCar(car, input, dt, game.city, game.cars);
    // Mara rides inside the car: her position IS the car's, so the camera,
    // the missions, the police and the minimap all follow the drive.
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (crashed) {
      game.audio?.thud();
      spawnBurst(game, car.x, car.y, '#ffd24a', 8);
      if (hitPolice) game.raiseWanted(1, car.x, car.y, 'You rammed a patrol car');
    }
    // Dust and tyre smoke when she really pushes it.
    if (Math.abs(car.speed) > 240 && Math.random() < 0.35) {
      spawnDust(game, car.x - Math.cos(car.angle) * car.def.len * 0.5, car.y - Math.sin(car.angle) * car.def.len * 0.5);
    }
    if (input.wasPressed('enter')) {
      input.pressed?.delete('enter');
      exitCar(game);
      game.audio?.ensure();
    }
  } else {
    const swung = updatePlayerOnFoot(game, input, dt);
    if (swung === 'punched') playerPunch(game);
    if (input.wasPressed('enter')) {
      input.pressed?.delete('enter');
      const car = nearestCar(game);
      if (car) {
        const wasPatrol = car.type === 'patrol';
        const wasTaken = car.parked || car.npc;
        enterCar(game, car);
        game.audio?.ensure();
        if (wasPatrol) {
          game.raiseWanted(2, car.x, car.y, 'You stole a patrol car!');
        } else if (wasTaken) {
          car.stolen = true;
          const seen = game.policeCars.some((c) => Math.hypot(c.x - car.x, c.y - car.y) < 520)
            || game.footCops.some((c) => Math.hypot(c.x - car.x, c.y - car.y) < 300);
          if (seen) game.raiseWanted(1, car.x, car.y, 'Car theft witnessed');
          else game.notify('Car taken — keep it out of sight of the SBPD.');
        }
      }
    }
  }

  updateTraffic(game, dt);
  updatePolice(game, dt);
  updateMissions(game, dt);
  updateEnemies(game, dt);
  updateParticles(game, dt);
  game.audio?.update(game, dt);

  // Camera: follows Mara, pulls back a little at speed.
  const targetZoom = p.inCar ? (Math.abs(p.inCar.speed) > 260 ? 0.86 : 0.95) : 1;
  game.camera.zoom += (targetZoom - game.camera.zoom) * Math.min(1, 2 * dt);
  game.camera.x += (p.x - game.camera.x) * Math.min(1, 5 * dt);
  game.camera.y += (p.y - game.camera.y) * Math.min(1, 5 * dt);
  const hw = 640 / game.camera.zoom;
  const hh = 360 / game.camera.zoom;
  game.camera.x = clamp(game.camera.x, hw, 2560 - hw);
  game.camera.y = clamp(game.camera.y, hh, 1920 - hh);
}

/** Draw the world, the wash of the hour, and the HUD. */
export function drawGame(ctx, game) {
  const period = skyPeriod(game.clockMin);
  const cam = game.camera;
  ctx.save();
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.translate(640, 360);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawGround(ctx, game.city, cam, period);
  drawBuildings(ctx, game.city, cam, period);

  // Mission and package markers on the ground.
  const marker = missionMarker(game);
  if (marker) {
    const pulse = 26 + Math.sin(game.time * 4) * 6;
    ctx.strokeStyle = 'rgba(255, 210, 74, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  const taxi = game.missions.taxi;
  if (taxi) {
    const tx = taxi.state === 'hail' ? taxi.x : taxi.dest.x;
    const ty = taxi.state === 'hail' ? taxi.y : taxi.dest.y;
    ctx.strokeStyle = 'rgba(125, 255, 138, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(tx, ty, 24 + Math.sin(game.time * 4) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const pkg of game.missions.packages) {
    if (pkg.taken) continue;
    ctx.save();
    ctx.translate(pkg.x, pkg.y + Math.sin(game.time * 3 + pkg.x) * 3);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#b8ff5a';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  drawTraffic(ctx, game);
  const cars = [...game.cars].sort((a, b) => a.y - b.y);
  const flashing = Math.floor(game.time * 2.4) % 2 === 0;
  for (const car of cars) drawCar(ctx, car, period, flashing);
  drawPlayer(ctx, game);
  drawEnemies(ctx, game);
  drawFootCops(ctx, game);
  drawParticles(ctx, game);

  // Headlight cone at night, in front of Mara's car.
  if ((period === 'night' || period === 'dusk') && game.player.inCar) {
    const car = game.player.inCar;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const g = ctx.createLinearGradient(0, 0, 190, 0);
    g.addColorStop(0, 'rgba(255, 240, 170, 0.20)');
    g.addColorStop(1, 'rgba(255, 240, 170, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(car.def.len / 2, 0);
    ctx.lineTo(190, -46);
    ctx.lineTo(190, 46);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // The wash of the hour, then the lamp pools shining through it.
  ctx.fillStyle = SKY[period].wash;
  ctx.fillRect(0, 0, 1280, 720);
  if (SKY[period].lamp) {
    ctx.save();
    ctx.translate(640, 360);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawLampGlow(ctx, game.city, cam);
    ctx.restore();
  }

  drawHud(ctx, game);
}
