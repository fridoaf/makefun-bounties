// The Solara Bay Police Department: wanted stars, patrol cars that chase and
// ram, foot cops who run the player down, and the slow fade of the heat when
// nobody can see her anymore.

import { WANTED } from './config.js';
import { clamp } from './utils.js';
import { createCar, steerNpcCar } from './vehicles.js';
import { randomRoadPoint } from './city.js';

/** The intersection nearest a point. */
function nearestIntersection(city, x, y) {
  let best = city.intersections[0];
  let bestD = Infinity;
  for (const p of city.intersections) {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * The shortest road route between two points, as a chain of intersections
 * (breadth-first over the grid graph — the roads are the graph, so the route
 * never cuts across a block). The start intersection is left out.
 */
function roadRoute(city, fx, fy, tx, ty) {
  const from = nearestIntersection(city, fx, fy);
  const to = nearestIntersection(city, tx, ty);
  if (from === to) return [to];
  const prev = new Map();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const p of city.intersections) {
      if (seen.has(p) || (p.x !== cur.x && p.y !== cur.y)) continue;
      seen.add(p);
      prev.set(p, cur);
      if (p === to) {
        const route = [p];
        let node = p;
        while (prev.get(node) !== from && prev.get(node) !== undefined) {
          node = prev.get(node);
          route.unshift(node);
        }
        return route;
      }
      queue.push(p);
    }
  }
  return [to];
}
export function raiseWanted(game, stars, x, y, reason) {
  if (game.wanted >= WANTED.max && stars > 0) {
    game.wanted = WANTED.max;
  } else {
    game.wanted = clamp(game.wanted + stars, 0, WANTED.max);
  }
  game.hiddenTimer = 0;
  game.crimePulse = { x, y, t: 1.5 };
  if (reason) game.notify(`${reason} — wanted ${'★'.repeat(game.wanted) || '☆'}`);
}

export function makeFootCop(x, y) {
  return { x, y, angle: 0, speed: 208, bustTimer: 0, phase: 0 };
}

/** Keep the police count matched to the wanted level; spawn, chase, despawn. */
export function updatePolice(game, dt) {
  const wanted = game.wanted;
  const px = game.player.x;
  const py = game.player.y;

  // How long since any cop could see her.
  const sight = WANTED.sight[wanted];
  const seen = game.policeCars.some((c) => Math.hypot(c.x - px, c.y - py) < sight)
    || game.footCops.some((c) => Math.hypot(c.x - px, c.y - py) < sight);
  if (wanted > 0) {
    if (seen) game.hiddenTimer = 0;
    else game.hiddenTimer += dt;
    if (game.hiddenTimer > WANTED.hideSeconds) {
      game.wanted -= 1;
      game.hiddenTimer = game.hiddenTimer - WANTED.fadeEvery;
      if (game.wanted === 0) game.notify('You lost them. Wanted level clear.');
      else game.notify(`Heat cooling off — wanted ${'★'.repeat(game.wanted)}`);
    }
  }

  // Patrol cars: spawn up to the wanted level's count, despawn past it.
  const wantCars = WANTED.policeCars[wanted];
  while (game.policeCars.length < wantCars) {
    const spot = randomRoadPoint(game.rng, px, py, 480);
    const car = createCar('patrol', spot.x, spot.y, Math.atan2(py - spot.y, px - spot.x), { npc: true });
    game.policeCars.push(car);
    game.cars.push(car);
  }
  while (game.policeCars.length > wantCars) {
    const car = game.policeCars.pop();
    const i = game.cars.indexOf(car);
    if (i >= 0) game.cars.splice(i, 1);
  }
  const wantCops = WANTED.footCops[wanted];
  while (game.footCops.length < wantCops) {
    const spot = randomRoadPoint(game.rng, px, py, 380);
    game.footCops.push(makeFootCop(spot.x, spot.y));
  }
  while (game.footCops.length > wantCops) game.footCops.pop();

  // Chase: up close a patrol car rams her directly; further out it takes
  // the roads — a route over the intersection graph, replanned as she moves
  // — so the pursuit reads as driving, not driving through buildings.
  for (const car of game.policeCars) {
    const playerSpeed = game.player.inCar ? Math.abs(game.player.inCar.speed) : 0;
    const cruise = Math.min(430, 300 + wanted * 28 + playerSpeed * 0.55);
    const dPlayer = Math.hypot(px - car.x, py - car.y);
    if (dPlayer < 170) {
      // Close in: tail her when she is fast — a chase, not a pile-up —
      // and only ram her when she is slow enough to catch.
      const tail = playerSpeed > 200 ? playerSpeed * 0.94 : cruise;
      steerNpcCar(car, px, py, dt, game.city, game.cars, tail);
    } else {
      car.replan = (car.replan ?? 0) - dt;
      if (!car.route || car.replan <= 0 || car.routeIndex >= car.route.length) {
        car.route = roadRoute(game.city, car.x, car.y, px, py);
        car.routeIndex = 0;
        car.replan = 1.4;
      }
      const wp = car.route[car.routeIndex];
      if (!wp) {
        steerNpcCar(car, px, py, dt, game.city, game.cars, cruise);
      } else if (Math.hypot(wp.x - car.x, wp.y - car.y) < 34) {
        car.routeIndex += 1;
      } else {
        steerNpcCar(car, wp.x, wp.y, dt, game.city, game.cars, cruise);
      }
    }
    // Ram: if she is in a car and slow, a cop beside her starts the bust.
    const d = Math.hypot(car.x - px, car.y - py);
    if (game.player.inCar && d < 74 && Math.abs(game.player.inCar.speed) < 10) {
      game.bustTimer += dt;
      if (game.bustTimer > 2.5) game.busted = true;
    }
  }
  // The bust clock only runs while a cop is actually holding her still.
  const pressured = game.player.inCar
    && Math.abs(game.player.inCar.speed) < 10
    && game.policeCars.some((c) => Math.hypot(c.x - px, c.y - py) < 74);
  if (!pressured) game.bustTimer = 0;

  // Foot cops run her down on foot; one beside her long enough busts her.
  for (const cop of game.footCops) {
    if (game.player.inCar) {
      // A foot cop cannot catch a car: jog to the nearest road and wait.
      const d = Math.hypot(cop.x - px, cop.y - py);
      if (d > 700) {
        const spot = randomRoadPoint(game.rng, px, py, 380);
        cop.x = spot.x;
        cop.y = spot.y;
      }
      continue;
    }
    const d = Math.hypot(px - cop.x, py - cop.y);
    cop.angle = Math.atan2(py - cop.y, px - cop.x);
    cop.phase += dt * 10;
    if (d > 8) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
    }
    if (d < 30) {
      cop.bustTimer += dt;
      if (cop.bustTimer > 1.2) game.busted = true;
    } else {
      cop.bustTimer = 0;
    }
  }

  game.sirenOn = game.policeCars.length > 0 || game.footCops.length > 0;
}

/** Draw the foot cops: navy uniform, cap, and a reach-out arm when close. */export function drawFootCops(ctx, game) {
  for (const cop of game.footCops) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    const bob = Math.sin(cop.phase) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 11, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(cop.angle);
    ctx.fillStyle = '#1f3a6e';
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(4, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16294d';
    ctx.fillRect(-2, -7, 8, 14);
    ctx.restore();
    // Bust progress ring while a cop is grabbing her.
    if (cop.bustTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff4040';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 22, -Math.PI / 2, -Math.PI / 2 + (cop.bustTimer / 1.2) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
