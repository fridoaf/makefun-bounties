// Solara Bay — boot, game loop, state machine, input, camera.
// Wires every system together. Rendering order: city, markers, parked cars,
// traffic, police, combat, player, particles, sky tint, HUD.
//
// Staging for screenshots: ?shot=cover|drive|foot|night starts the game
// straight into a staged scene (real game, real rendering — only the
// player position, clock, wanted level and mission are preset). The same
// staging is available by hand from the console as window.SOLARA_DEBUG.

import { CFG } from './config.js';
import { buildCity, drawCity, skyOverlay, lampsOn, LANDMARKS } from './city.js';
import { Player } from './player.js';
import { Vehicle } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions, PACKAGES } from './missions.js';
import { AudioSys } from './audio.js';
import { drawHUD, drawTitle, drawPause, drawEnd } from './hud.js';
import { saveGame, loadGame, applySave, hasSave, clearSave } from './save.js';
import { clamp, dist, lerp } from './utils.js';

buildCity();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  state: 'title', // title | playing | paused | busted | wasted | won
  time: 0,
  tod: 0.3, // 0..1 across the day; 0.3 is a sunny morning
  player: new Player(CFG.START_X, CFG.START_Y),
  traffic: new Traffic(),
  police: new Police(),
  combat: new Combat(),
  missions: new Missions(),
  audio: new AudioSys(),
  parkedCars: [],
  notifications: [],
  camera: { x: CFG.START_X, y: CFG.START_Y, zoom: 1 },
  keys: {},
  pressed: {},
  checkpoint: null,
  hasSave: hasSave(),
  autosaveCd: 0,
};

function notify(text) {
  game.notifications.push({ text, t: 4 });
  if (game.notifications.length > 4) game.notifications.shift();
}
game.notify = notify;

game.setCheckpoint = function () {
  game.checkpoint = {
    x: game.player.x,
    y: game.player.y,
    money: game.player.money,
    hp: game.player.hp,
    idx: game.missions.idx,
    step: game.missions.step,
    storyDone: game.missions.storyDone,
    packagesTaken: PACKAGES.map((p) => p.taken),
    packagesFound: game.missions.packagesFound,
  };
  saveGame(game);
};

function restoreCheckpoint() {
  const c = game.checkpoint;
  if (!c) return false;
  game.player.x = c.x;
  game.player.y = c.y;
  game.player.money = c.money;
  game.player.hp = Math.max(50, c.hp);
  game.player.armor = 0;
  if (game.player.vehicle) {
    game.player.vehicle.owner = 'parked';
    game.player.vehicle = null;
    game.player.onFoot = true;
  }
  game.missions.idx = c.idx;
  game.missions.step = c.step;
  game.missions.storyDone = c.storyDone;
  game.missions.active = false;
  game.missions.fightSpawned = false;
  game.missions.chaseCar = null;
  game.missions.stealCar = null;
  game.missions.kills = 0;
  game.missions.packagesFound = c.packagesFound;
  c.packagesTaken.forEach((taken, i) => { if (PACKAGES[i]) PACKAGES[i].taken = taken; });
  game.combat.clearEnemies();
  game.police.clear(game);
  game.state = 'playing';
  notify('Kembali ke checkpoint misi.');
  return true;
}
game.restoreCheckpoint = restoreCheckpoint;

game.busted = function () {
  if (game.state !== 'playing') return;
  game.state = 'busted';
  const fine = Math.min(200, Math.floor(game.player.money * 0.25));
  game.player.money -= fine;
  game.audio.sfx('fail');
  game.audio.setSiren(false);
  notify('Denda $' + fine + ' dibayar.');
};

game.wasted = function () {
  if (game.state !== 'playing') return;
  game.state = 'wasted';
  game.audio.sfx('fail');
  game.audio.setSiren(false);
};

game.winGame = function () {
  game.state = 'won';
  game.audio.sfx('missionDone');
  saveGame(game);
};

// A few parked cars the player can take from the street.
function seedParkedCars() {
  const spots = [
    { type: 'hatch', x: 760, y: 640 },
    { type: 'sedan', x: 1240, y: 1000 },
    { type: 'van', x: 1720, y: 640 },
    { type: 'taxi', x: 280, y: 1000 },
    { type: 'hatch', x: 2200, y: 640 },
    { type: 'sedan', x: 760, y: 1360 },
  ];
  for (const s of spots) {
    game.parkedCars.push(new Vehicle(s.type, s.x, s.y, Math.random() < 0.5 ? 0 : Math.PI / 2, { owner: 'parked' }));
  }
}
seedParkedCars();
game.setCheckpoint();

// ---- Input ---------------------------------------------------------------
const KEYMAP = {
  KeyW: 'w', ArrowUp: 'up',
  KeyA: 'a', ArrowLeft: 'left',
  KeyS: 's', ArrowDown: 'down',
  KeyD: 'd', ArrowRight: 'right',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  KeyE: 'e', KeyF: 'f', Space: 'space',
  KeyM: 'm', Escape: 'esc', Enter: 'enter',
  KeyR: 'r', KeyN: 'n',
};

window.addEventListener('keydown', (ev) => {
  const k = KEYMAP[ev.code];
  if (!k) return;
  if (['up', 'down', 'left', 'right', 'space'].includes(k)) ev.preventDefault();
  if (!ev.repeat) {
    game.pressed[k] = true;
    game.audio.ensure();
  }
  game.keys[k] = true;
});
window.addEventListener('keyup', (ev) => {
  const k = KEYMAP[ev.code];
  if (k) game.keys[k] = false;
});
canvas.addEventListener('click', () => game.audio.ensure());

function nearestEnterableCar(maxDist) {
  const p = game.player;
  let best = null;
  let bd = maxDist;
  const all = [...game.parkedCars, ...game.traffic.cars.map((c) => c.veh), ...game.police.cars.map((c) => c.veh)];
  for (const v of all) {
    const d = dist(p.x, p.y, v.x, v.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function tryEnterCar() {
  const p = game.player;
  const v = nearestEnterableCar(62);
  if (!v) return;
  if (v.owner === 'police') {
    game.police.addWanted(2, 'mencuri mobil polisi!', game);
  } else if (v.owner === 'npc' || v.owner === 'parked') {
    if (!v.stolen && v.owner !== 'parked') {
      game.police.addWanted(1, 'mobil curian terlihat', game);
    }
    v.stolen = true;
    game.traffic.scatterFrom(v.x, v.y, 160);
    notify('Mobil diambil: ' + v.name + (v.owner === 'npc' ? ' — pemiliknya kabur!' : ''));
  }
  // Remove it from the parked list so it is not drawn twice as parked.
  game.parkedCars = game.parkedCars.filter((c) => c !== v);
  p.enterVehicle(v, game);
  game.audio.sfx('door');
  game.combat.burst(v.x, v.y, 'rgba(255,255,255,0.6)', 6, 80);
}

function handlePressed() {
  const pr = game.pressed;
  if (pr.m) {
    game.audio.setMuted(!game.audio.muted);
    notify(game.audio.muted ? 'Suara mati (M untuk hidupkan)' : 'Suara hidup');
  }
  if (game.state === 'title') {
    if (pr.enter) {
      if (game.hasSave && !pr.n) {
        const data = loadGame();
        if (data && applySave(game, data)) {
          notify('Save dimuat — selamat datang kembali di Solara Bay.');
        }
      } else {
        clearSave();
      }
      game.state = 'playing';
      game.audio.ensure();
    }
    return;
  }
  if (game.state === 'paused') {
    if (pr.esc || pr.enter) game.state = 'playing';
    if (pr.r) restoreCheckpoint();
    return;
  }
  if (game.state === 'busted' || game.state === 'wasted' || game.state === 'won') {
    if (pr.r) restoreCheckpoint();
    if (pr.enter) game.state = 'playing';
    return;
  }
  // Playing.
  if (pr.esc) {
    game.state = 'paused';
    return;
  }
  if (pr.e) {
    if (game.player.onFoot) tryEnterCar();
    else game.player.exitVehicle(game);
  }
  if (pr.f) {
    if (!game.missions.active && !game.missions.storyDone) {
      game.missions.acceptNext(game);
    } else {
      game.missions.interact(game);
    }
  }
  if (pr.space && game.player.onFoot) game.combat.punch(game);
}

// ---- Update ---------------------------------------------------------------
function update(dt) {
  game.time += dt;
  game.tod = (game.tod + dt / CFG.DAY_SECONDS) % 1;
  for (const n of game.notifications) n.t -= dt;
  game.notifications = game.notifications.filter((n) => n.t > 0);

  game.player.update(dt, game.keys, game);
  game.crashWantedCd = Math.max(0, (game.crashWantedCd || 0) - dt);
  game.traffic.update(dt, game);
  game.police.update(dt, game);
  game.combat.update(dt, game);
  game.missions.update(dt, game);

  // Parked cars stay put, but their health still matters if rammed.
  for (const v of game.parkedCars) {
    if (v.health < 100) v.health = Math.min(100, v.health + 2 * dt);
  }

  // Player car vs traffic: simple push-apart so cars do not overlap.
  const pv = game.player.vehicle;
  if (pv) {
    for (const c of game.traffic.cars) {
      const d = dist(pv.x, pv.y, c.veh.x, c.veh.y);
      if (d > 0.01 && d < 46) {
        const a = Math.atan2(c.veh.y - pv.y, c.veh.x - pv.x);
        const push = (46 - d) / 2;
        c.veh.x += Math.cos(a) * push;
        c.veh.y += Math.sin(a) * push;
        if (Math.abs(pv.speed) > 120 && Math.random() < dt * 6 && game.crashWantedCd <= 0) {
          game.crashWantedCd = 2;
          game.audio.sfx('crash');
          game.combat.burst(pv.x, pv.y, '#ffb040', 8, 140);
          game.police.addWanted(1, 'tabrakan', game);
        }
      }
    }
    // A ramming patrol car stays on the player's bumper instead of driving
    // through the car and parking on top of it (the ram in police.js still
    // triggers at < 52, so the chase is unchanged — only the visual stack).
    for (const c of game.police.cars) {
      const d = dist(pv.x, pv.y, c.veh.x, c.veh.y);
      if (d > 0.01 && d < 46) {
        const a = Math.atan2(c.veh.y - pv.y, c.veh.x - pv.x);
        const push = 46 - d;
        c.veh.x += Math.cos(a) * push;
        c.veh.y += Math.sin(a) * push;
      }
    }
    // Running over a pedestrian is a crime, and the crowd reacts.
    for (const ped of game.traffic.peds) {
      if (Math.abs(pv.speed) > 60 && dist(pv.x, pv.y, ped.x, ped.y) < 26) {
        ped.x += 220;
        game.police.addWanted(1, 'pejalan kaki tertabrak', game);
        game.traffic.scatterFrom(pv.x, pv.y, 260);
        game.combat.burst(ped.x, ped.y, '#ff5040', 10, 120);
      }
    }
  }

  // Camera follows the player; pulls back a little at high speed.
  const pp = game.player.pos;
  const targetZoom = pv ? lerp(1, 0.82, clamp(Math.abs(pv.speed) / 520, 0, 1)) : 1;
  game.camera.zoom = lerp(game.camera.zoom, targetZoom, Math.min(1, 2.5 * dt));
  game.camera.x = lerp(game.camera.x, clamp(pp.x, 640, CFG.WORLD_W - 640), Math.min(1, 6 * dt));
  game.camera.y = lerp(game.camera.y, clamp(pp.y, 360, CFG.WORLD_H - 360), Math.min(1, 6 * dt));

  // Audio follows the car.
  game.audio.setEngine(pv ? clamp(Math.abs(pv.speed) / 520, 0, 1) : 0, !!pv);
  game.audio.sirenWail(dt);
  game.audio.musicTick(dt);

  // Autosave every 20 seconds while playing.
  game.autosaveCd -= dt;
  if (game.autosaveCd <= 0) {
    game.autosaveCd = 20;
    saveGame(game);
  }
}

// ---- Render ---------------------------------------------------------------
function render() {
  const cam = game.camera;
  const shakeX = game.combat.shake > 0 ? (Math.random() - 0.5) * game.combat.shake : 0;
  const shakeY = game.combat.shake > 0 ? (Math.random() - 0.5) * game.combat.shake : 0;
  ctx.fillStyle = '#10131c';
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);

  ctx.save();
  ctx.translate(CFG.VIEW_W / 2, CFG.VIEW_H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

  drawCity(ctx, cam, game.tod);
  game.missions.drawMarkers(ctx, game.time);
  for (const v of game.parkedCars) v.draw(ctx, game.tod);
  if (game.missions.chaseCar) game.missions.chaseCar.draw(ctx, game.tod);
  game.traffic.draw(ctx, game.tod);
  game.police.draw(ctx, game.tod);
  game.combat.draw(ctx);
  if (game.player.vehicle) game.player.vehicle.draw(ctx, game.tod);
  game.player.draw(ctx);
  ctx.restore();

  // Day/night tint over the world, under the HUD.
  const tint = skyOverlay(game.tod);
  if (tint.alpha > 0) {
    ctx.fillStyle = 'rgba(' + tint.color + ',' + tint.alpha + ')';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  }
  if (lampsOn(game.tod)) {
    ctx.fillStyle = 'rgba(255,220,130,0.03)';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
  }

  if (game.state === 'playing') drawHUD(ctx, game);
  else if (game.state === 'title') drawTitle(ctx, game);
  else if (game.state === 'paused') { drawHUD(ctx, game); drawPause(ctx, game); }
  else if (game.state === 'busted') drawEnd(ctx, game, 'busted');
  else if (game.state === 'wasted') drawEnd(ctx, game, 'wasted');
  else if (game.state === 'won') { drawHUD(ctx, game); drawEnd(ctx, game, 'won'); }
}

// ---- Main loop ------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  // Input is read once per frame, BEFORE the state dispatch, so keys work
  // in every state — title, paused, busted/wasted/won — not just `playing`.
  // update() used to be the only caller and it only runs while playing, and
  // `pressed` is cleared at the end of every frame, so every non-playing
  // branch of handlePressed() was dead code (Enter on the title screen and
  // Esc/Enter to resume from pause never fired). Called here exactly once
  // per frame, so a single press can never double-fire (e.g. E entering
  // and immediately exiting a car in the same frame).
  handlePressed();
  if (game.state === 'playing') update(dt);
  else if (game.state === 'title') {
    // Slow cinematic pan behind the title screen.
    game.time += dt;
    game.camera.x = 1280 + Math.sin(game.time * 0.05) * 500;
    game.camera.y = 960 + Math.cos(game.time * 0.04) * 300;
    game.tod = (game.tod + dt / CFG.DAY_SECONDS) % 1;
  }
  render();
  game.pressed = {};
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- Debug hooks + shot staging ------------------------------------------
// The hooks only move the player and the clock; the game keeps rendering
// for real. ?shot= presets use them so headless Chrome can capture the
// same scenes a human would stage from the console.
window.SOLARA_DEBUG = {
  game,
  teleport(x, y) {
    if (game.player.vehicle) game.player.exitVehicle(game);
    game.player.x = x;
    game.player.y = y;
    game.camera.x = x;
    game.camera.y = y;
  },
  setTime(t) { game.tod = t; },
  setWanted(n) {
    game.police.heat = n * 20;
    game.police.quiet = 0;
  },
  startMission(i) {
    game.missions.idx = i;
    game.missions.start(i, game);
  },
  spawnCar(type, x, y) {
    const v = new Vehicle(type, x, y, 0, { owner: 'parked' });
    game.parkedCars.push(v);
    return v;
  },
  play() { game.state = 'playing'; },
  landmarks: LANDMARKS,
};

function driveCar(type, x, y, angle, speed) {
  const v = new Vehicle(type, x, y, angle, { owner: 'parked' });
  game.parkedCars.push(v);
  game.player.x = x;
  game.player.y = y;
  game.camera.x = x;
  game.camera.y = y;
  game.player.enterVehicle(v, game);
  game.parkedCars = game.parkedCars.filter((c) => c !== v);
  v.speed = speed;
  // Coast: no throttle held, so the car stays near its staging spot
  // instead of driving out of the frame before the capture.
  return v;
}

function stageShot(name) {
  const dbg = window.SOLARA_DEBUG;
  game.state = 'playing';
  if (name === 'cover') {
    // Sunset police chase in Neon Row, 3 stars, driving west.
    driveCar('sport', 2050, 200, Math.PI, 220);
    dbg.setTime(0.52);
    dbg.setWanted(3);
    // Pull two patrol cars in close behind the player so they are in frame.
    // Different lanes, angles, speeds and pursuit offsets, so the chase
    // holds formation instead of the two cars stacking on one point.
    const lanes = [
      { x: 2260, y: 130, angle: Math.PI - 0.08, speed: 280, ox: 40, oy: -70 },
      { x: 2420, y: 280, angle: Math.PI + 0.08, speed: 250, ox: 40, oy: 70 },
    ];
    for (let i = 0; i < 2; i++) {
      game.police.spawnCar(game);
      const pc = game.police.cars[game.police.cars.length - 1];
      pc.veh.x = lanes[i].x;
      pc.veh.y = lanes[i].y;
      pc.veh.angle = lanes[i].angle;
      pc.veh.speed = lanes[i].speed;
      pc.ox = lanes[i].ox;
      pc.oy = lanes[i].oy;
    }
    game.missions.start(1, game);
  } else if (name === 'drive') {
    // Daytime in Marina Quay, taxi, no heat.
    driveCar('taxi', 500, 200, 0, 130);
    dbg.setTime(0.30);
    dbg.setWanted(0);
  } else if (name === 'foot') {
    // On-foot fight in Dockside during mission 4.
    dbg.teleport(340, 1280);
    dbg.setTime(0.35);
    game.missions.start(3, game);
    game.missions.step = 1; // jump to the fight step; enemies spawn on the next update
    game.missions.kills = 0;
    game.missions.killsNeeded = 3;
    setTimeout(() => {
      const e = game.combat.enemies[0];
      if (e) {
        e.hp = 30; // show a part-drained HP bar
        game.combat.burst(e.x, e.y, '#ffd23e', 10, 130);
      }
    }, 1500);
  } else if (name === 'night') {
    // Night on Coral Beach, 2 stars, driving west.
    driveCar('sedan', 1950, 1640, Math.PI, 180);
    dbg.setTime(0.80);
    dbg.setWanted(2);
    game.police.spawnCar(game);
    const pc = game.police.cars[game.police.cars.length - 1];
    pc.veh.x = 2250;
    pc.veh.y = 1640;
    pc.veh.angle = Math.PI;
    pc.veh.speed = 220;
    // Hold the north lane so this staged car does not stack onto the
    // second patrol car the chase loop spawns (both steer at the player).
    pc.ox = 40;
    pc.oy = -70;
  }
  window.__shotReady = true;
}

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  // Full-bleed canvas for screenshots: hide the page chrome so the capture
  // is exactly the 1280x720 game frame.
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;border-radius:0';
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.style.cssText = 'max-width:none;padding:0;margin:0';
  for (const el of document.querySelectorAll('h1, p')) el.style.display = 'none';
  // Give the loop a moment to settle, then stage the scene.
  setTimeout(() => stageShot(shot), 400);
}
