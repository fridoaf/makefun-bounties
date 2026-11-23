// The cars: arcade physics, collisions, and the top-down drawing of every
// vehicle type. A car is a point with a heading and a speed; steering bites
// harder the faster it goes, and the handbrake trades grip for slide.

import { CAR_TYPES } from './config.js';
import { angleDiff, clamp } from './utils.js';
import { collideCircle, isOnRoad } from './city.js';

let nextId = 1;

/** Make a car of `type` at (x, y), facing `angle` radians. */
export function createCar(type, x, y, angle, opts = {}) {
  const def = CAR_TYPES[type] ?? CAR_TYPES.sedan;
  return {
    id: nextId,
    type,
    def,
    label: def.label,
    x,
    y,
    angle,
    speed: 0,
    color: opts.color ?? def.color,
    stolen: opts.stolen ?? false,
    parked: opts.parked ?? false,
    npc: opts.npc ?? false,
    // NPC route state (traffic cars only).
    route: opts.route ?? null,
    routeIndex: 0,
    wait: 0,
    // Crash flash timer, for the scrape spark.
    scrape: 0,
    // How badly the car is banged up, 0..1 (cosmetic smoke past 0.5).
    damage: 0,
  };
}

/**
 * Drive `car` from the player's input. Returns whether it just crashed into
 * something hard, and whether that crash was the player ramming a patrol car
 * head-on (the only crash the law holds against her — a cop ramming her
 * during a chase is the cop's doing, not a new crime).
 */
export function driveCar(car, input, dt, city, others) {
  const def = car.def;
  const throttle = input.throttle();
  const steer = input.steer();
  const handbrake = input.is('punch');

  // Engine and brakes.
  if (throttle > 0) car.speed += def.accel * dt;
  else if (throttle < 0) {
    car.speed -= (car.speed > 30 ? 620 : 260) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  const top = def.top * (isOnRoad(city, car.x, car.y) ? 1 : 0.62);
  car.speed = clamp(car.speed, -def.top * 0.45, top);

  // Steering: no bite at a standstill, full bite at speed; the handbrake
  // loosens the rear so the car slides.
  const steerRate = def.steer * clamp(Math.abs(car.speed) / 140, 0, 1) * (handbrake ? 1.35 : 1);
  car.angle += steer * steerRate * Math.sign(car.speed) * dt;
  car.speed -= car.speed * (handbrake ? 1.6 : 0.35) * dt * 0.2;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // World edge: the map ends at the water and the sand.
  car.x = clamp(car.x, 24, 2560 - 24);
  car.y = clamp(car.y, 24, 1920 - 24);

  // Buildings: slide along them, lose speed, take damage on a hard hit.
  const before = Math.abs(car.speed);
  const push = collideCircle(city, car.x, car.y, car.def.len * 0.42);
  if (push.hit) {
    car.x += push.x;
    car.y += push.y;
    if (before > 170) {
      car.damage = clamp(car.damage + 0.12, 0, 1);
      car.scrape = 0.35;
    }
    car.speed *= 0.55;
  }

  // Other cars: soft push-apart, and a thud when the closing speed is high.
  let crashed = push.hit && before > 260;
  let hitPolice = false;
  for (const other of others) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    const min = (car.def.len + other.def.len) * 0.36;
    if (d < min && d > 0.01) {
      const overlap = (min - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      car.x -= ux * overlap;
      car.y -= uy * overlap;
      other.x += ux * overlap;
      other.y += uy * overlap;
      const closing = Math.abs(car.speed - other.speed);
      if (closing > 200) {
        crashed = true;
        car.scrape = 0.3;
        other.scrape = 0.3;
        car.speed *= 0.7;
        other.speed *= 0.7;
        // Ramming a patrol car head-on, at speed, is a crime; being rammed
        // by one while it chases her is not.
        if (other.type === 'patrol' && Math.abs(car.speed) > 150) {
          const toCop = Math.atan2(dy, dx);
          if (Math.abs(angleDiff(car.angle, toCop)) < 1.2) hitPolice = true;
        }
      }
    }
  }
  if (car.scrape > 0) car.scrape -= dt;
  return { crashed, hitPolice };
}

/** Steer an NPC car toward a point, at its cruising speed (or `cruise`). */
export function steerNpcCar(car, tx, ty, dt, city, others, cruise = null) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const turn = clamp(angleDiff(car.angle, want), -1, 1);
  car.angle += turn * 2.4 * dt;
  const target = cruise ?? car.def.top * 0.42;
  car.speed += (target - car.speed) * Math.min(1, 1.6 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 24, 2560 - 24);
  car.y = clamp(car.y, 24, 1920 - 24);
  const push = collideCircle(city, car.x, car.y, car.def.len * 0.42);
  if (push.hit) {
    car.x += push.x;
    car.y += push.y;
    car.speed *= 0.6;
    car.angle += 0.6 * dt * 10;
  }
  for (const other of others) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    const min = (car.def.len + other.def.len) * 0.36;
    if (d < min && d > 0.01) {
      car.x -= (dx / d) * ((min - d) / 2);
      car.y -= (dy / d) * ((min - d) / 2);
      car.speed *= 0.85;
    }
  }
  if (car.scrape > 0) car.scrape -= dt;
}

/** Draw one car, top-down, with headlights and (for patrol cars) a light bar. */
export function drawCar(ctx, car, period, flashing) {
  const { len, wid } = car.def;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-len / 2 + 4, -wid / 2 + 5, len, wid);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 7);
  ctx.fill();
  // Roof and windows.
  ctx.fillStyle = 'rgba(20,24,32,0.85)';
  roundRect(ctx, -len * 0.18, -wid * 0.36, len * 0.34, wid * 0.72, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,190,230,0.5)';
  ctx.fillRect(len * 0.3, -wid * 0.3, 5, wid * 0.6);
  // Wheels.
  ctx.fillStyle = '#14161a';
  ctx.fillRect(-len * 0.32, -wid / 2 - 3, 12, 5);
  ctx.fillRect(len * 0.22, -wid / 2 - 3, 12, 5);
  ctx.fillRect(-len * 0.32, wid / 2 - 2, 12, 5);
  ctx.fillRect(len * 0.22, wid / 2 - 2, 12, 5);
  // Headlights at night; brake lights when reversing or handbraking.
  if (period === 'night' || period === 'dusk') {
    ctx.fillStyle = 'rgba(255, 244, 180, 0.95)';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 4, 5);
    ctx.fillRect(len / 2 - 2, wid / 2 - 8, 4, 5);
  }
  ctx.fillStyle = 'rgba(255, 40, 40, 0.9)';
  ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 5);
  ctx.fillRect(-len / 2, wid / 2 - 8, 3, 5);
  // Police light bar, alternating red and blue.
  if (car.type === 'patrol') {
    ctx.fillStyle = flashing ? '#ff2a2a' : '#2a6aff';
    ctx.fillRect(-6, -wid / 2 - 1, 12, 5);
    ctx.fillStyle = flashing ? '#2a6aff' : '#ff2a2a';
    ctx.fillRect(-6, wid / 2 - 4, 12, 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SBPD', 0, 3);
  }
  // Taxi sign.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.fillRect(-4, -5, 9, 10);
    ctx.fillStyle = '#f2c230';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2.5);
  }
  // Damage smoke.
  if (car.damage > 0.5) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(-len / 2 + 4, 0, 6 + car.damage * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Scrape sparks.
  if (car.scrape > 0) {
    ctx.fillStyle = 'rgba(255, 220, 80, 0.9)';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(-len / 2 + ((i * 7) % 12), -wid / 2 + ((i * 5) % 10), 3, 3);
    }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
