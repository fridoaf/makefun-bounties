// The city alive: traffic cars that follow the streets and pedestrians who
// walk the sidewalks and run from trouble. Both are simple waypoint walkers —
// the roads are the graph, so nobody ever drives through a building.

import { ROAD } from './config.js';
import { makeRng, pick, range, rangeInt } from './utils.js';
import { createCar, steerNpcCar } from './vehicles.js';
import { isOnRoad } from './city.js';

const PED_COLORS = ['#e8a34f', '#7a9ae8', '#c96a8a', '#8a6ac9', '#6ac98a', '#e8e86a', '#c9c9c9'];

export function createTraffic(city, rng) {
  const cars = [];
  const types = ['hatch', 'sedan', 'taxi', 'van', 'sport', 'truck'];
  for (let i = 0; i < 12; i += 1) {
    const p = city.intersections[rangeInt(rng, 0, city.intersections.length - 1)];
    const type = pick(rng, types);
    const car = createCar(type, p.x + range(rng, -20, 20), p.y + range(rng, -20, 20), range(rng, 0, Math.PI * 2), { npc: true });
    car.route = pickRoute(city, rng, p);
    car.routeIndex = 0;
    cars.push(car);
  }
  // A few parked cars in the parking lots, free for the taking.
  for (const b of city.buildings) {
    if (!b.parking) continue;
    for (let i = 0; i < 2; i += 1) {
      const type = pick(rng, types);
      cars.push(createCar(type, b.x + 30 + i * 60, b.y + 24, Math.PI / 2, { parked: true }));
    }
  }
  const peds = [];
  for (let i = 0; i < 16; i += 1) {
    const p = city.intersections[rangeInt(rng, 0, city.intersections.length - 1)];
    peds.push(makePed(city, rng, p.x, p.y));
  }
  return { cars, peds };
}

/** The intersection nearest a point, so a lost car can find the grid again. */
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

/** A route is a short chain of intersections; the car retargets at each one. */
export function pickRoute(city, rng, from) {
  const route = [from];
  let current = from;
  for (let i = 0; i < 4; i += 1) {
    const nexts = city.intersections.filter(
      (p) => p !== current && (p.x === current.x || p.y === current.y),
    );
    const next = pick(rng, nexts);
    if (!next) break;
    route.push(next);
    current = next;
  }
  return route;
}

function makePed(city, rng, x, y) {
  return {
    x,
    y,
    angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 38, 68),
    color: pick(rng, PED_COLORS),
    target: null,
    road: null, // the sidewalk line the ped walks: {vertical, line, side}
    dir: rng() < 0.5 ? 1 : -1,
    fleeing: 0,
    fleeAngle: 0,
    down: 0,
    phase: range(rng, 0, Math.PI * 2),
    city,
    rng,
  };
}

/**
 * The ped's next stop along its sidewalk. Peds never cut across a block:
 * they walk their sidewalk line, and only at an intersection do they
 * sometimes turn onto the crossing street — like crossing at the corner.
 */
function sidewalkTarget(ped) {
  const { city, rng } = ped;
  const off = ROAD.width / 2 + ROAD.walk / 2 + 4;
  if (!ped.road) {
    // Adopt the nearest road's sidewalk.
    if (rng() < 0.5) {
      const rx = [300, 780, 1260, 1740, 2220].reduce((a, b) => (Math.abs(b - ped.x) < Math.abs(a - ped.x) ? b : a));
      ped.road = { vertical: true, line: rx, side: ped.x >= rx ? 1 : -1 };
    } else {
      const ry = [280, 680, 1080, 1480, 1760].reduce((a, b) => (Math.abs(b - ped.y) < Math.abs(a - ped.y) ? b : a));
      ped.road = { vertical: false, line: ry, side: ped.y >= ry ? 1 : -1 };
    }
  }
  // Near an intersection, sometimes turn onto the crossing street.
  const near = city.intersections.find((p) => Math.hypot(p.x - ped.x, p.y - ped.y) < 70);
  if (near && rng() < 0.35) {
    if (ped.road.vertical) {
      ped.road = { vertical: false, line: near.y, side: rng() < 0.5 ? 1 : -1 };
    } else {
      ped.road = { vertical: true, line: near.x, side: rng() < 0.5 ? 1 : -1 };
    }
    ped.dir = rng() < 0.5 ? 1 : -1;
  } else if (rng() < 0.15) {
    ped.dir *= -1;
  }
  const line = ped.road.line + ped.road.side * off;
  if (ped.road.vertical) {
    let y = ped.y + ped.dir * range(rng, 150, 500);
    if (y < 60 || y > 1860) {
      ped.dir *= -1;
      y = ped.y + ped.dir * range(rng, 150, 400);
    }
    return { x: line, y: Math.max(60, Math.min(1860, y)) };
  }
  let x = ped.x + ped.dir * range(rng, 150, 500);
  if (x < 60 || x > 2500) {
    ped.dir *= -1;
    x = ped.x + ped.dir * range(rng, 150, 400);
  }
  return { x: Math.max(60, Math.min(2500, x)), y: line };
}

export function updateTraffic(game, dt) {
  const { city } = game;
  // --- cars ---
  for (const car of game.trafficCars) {
    if (car.parked || !car.route) continue;
    const target = car.route[car.routeIndex];
    if (!target) {
      const near = nearestIntersection(city, car.x, car.y);
      car.route = pickRoute(city, game.rng, near);
      car.routeIndex = 0;
      continue;
    }
    const d = Math.hypot(target.x - car.x, target.y - car.y);
    if (d < 26) {
      car.routeIndex += 1;
      if (car.routeIndex >= car.route.length) {
        car.route = pickRoute(city, game.rng, target);
        car.routeIndex = 0;
      }
      continue;
    }
    // Stop for the car ahead, like a driver stuck in traffic.
    const aheadX = car.x + Math.cos(car.angle) * 56;
    const aheadY = car.y + Math.sin(car.angle) * 56;
    const blocked = game.cars.some(
      (other) => other !== car && Math.hypot(other.x - aheadX, other.y - aheadY) < 34,
    );
    if (blocked) {
      car.speed = Math.max(0, car.speed - 300 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      continue;
    }
    steerNpcCar(car, target.x, target.y, dt, city, game.cars);
  }

  // --- pedestrians ---
  for (const ped of game.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      continue;
    }
    ped.phase += dt * 8;
    // A crime nearby sends them running the other way.
    const crime = game.crimePulse;
    if (crime && crime.t > 0 && Math.hypot(crime.x - ped.x, crime.y - ped.y) < 260) {
      ped.fleeing = 1.2;
      ped.fleeAngle = Math.atan2(ped.y - crime.y, ped.x - crime.x);
    }
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      const away = ped.fleeAngle ?? 0;
      ped.angle = away;
      ped.x += Math.cos(away) * 150 * dt;
      ped.y += Math.sin(away) * 150 * dt;
      ped.x = Math.max(16, Math.min(2544, ped.x));
      ped.y = Math.max(16, Math.min(1904, ped.y));
      continue;
    }
    if (!ped.target) ped.target = sidewalkTarget(ped);
    const d = Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y);
    if (d < 12) {
      ped.target = sidewalkTarget(ped);
      continue;
    }
    ped.angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }

  // --- cars hitting pedestrians (the player's car is a crime; traffic is not) ---
  for (const ped of game.peds) {
    if (ped.down > 0) continue;
    for (const car of game.cars) {
      if (Math.abs(car.speed) < 60) continue;
      if (Math.hypot(car.x - ped.x, car.y - ped.y) < 22) {
        ped.down = 2.2;
        ped.fleeing = 2.5;
        if (car === game.player.inCar) {
          game.raiseWanted(1, ped.x, ped.y, 'Pedestrian hit');
        }
      }
    }
  }
}

export function drawTraffic(ctx, game) {
  for (const ped of game.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.down > 0) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    const bob = Math.sin(ped.phase) * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(3, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
