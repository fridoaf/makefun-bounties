// Mara Voss on foot: walking, running, punching, and getting in and out of
// cars. The player is a circle with a facing; the car she drives lives in
// vehicles.js and she just points at it while she is inside.

import { PLAYER } from './config.js';
import { clamp } from './utils.js';
import { collideCircle } from './city.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    hp: PLAYER.maxHp,
    inCar: null,
    punchCooldown: 0,
    punchAnim: 0,
    hurtFlash: 0,
    walkPhase: 0,
    moving: false,
  };
}

/** Step Mara on foot. Returns 'punched' on the frame she swings. */
export function updatePlayerOnFoot(game, input, dt) {
  const p = game.player;
  const axis = input.walkAxis();
  const running = input.is('run');
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.moving = axis.x !== 0 || axis.y !== 0;
  if (p.moving) {
    p.angle = Math.atan2(axis.y, axis.x);
    p.walkPhase += dt * (running ? 13 : 9);
    p.x += axis.x * speed * dt;
    p.y += axis.y * speed * dt;
  }
  p.x = clamp(p.x, 16, 2560 - 16);
  p.y = clamp(p.y, 16, 1920 - 16);
  const push = collideCircle(game.city, p.x, p.y, PLAYER.radius);
  if (push.hit) {
    p.x += push.x;
    p.y += push.y;
  }
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.punchAnim > 0) p.punchAnim -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;

  // Slow health regen when the heat is off.
  if (game.wanted === 0 && p.hp < PLAYER.maxHp) {
    p.hp = Math.min(PLAYER.maxHp, p.hp + PLAYER.hpRegen * dt);
  }

  // Punch: a swing in front of her, on a cooldown.
  if (input.wasPressed('punch') && p.punchCooldown <= 0) {
    p.punchCooldown = PLAYER.punchCooldown;
    p.punchAnim = 0.22;
    return 'punched';
  }
  return null;
}

/** The nearest car Mara can reach from where she stands, or null. */
export function nearestCar(game, maxDist = 78) {
  const p = game.player;
  let best = null;
  let bestD = maxDist;
  for (const car of game.cars) {
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Step into a car: Mara hides inside it and the car takes her inputs. */
export function enterCar(game, car) {
  const p = game.player;
  p.inCar = car;
  car.parked = false;
  car.npc = false;
  car.route = null;
  p.x = car.x;
  p.y = car.y;
}

/** Step out: Mara appears beside the car and it rolls to a stop. */
export function exitCar(game) {
  const p = game.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 34;
  p.y = car.y + Math.sin(side) * 34;
  p.angle = car.angle;
  car.speed = 0;
  const push = collideCircle(game.city, p.x, p.y, PLAYER.radius);
  if (push.hit) {
    p.x += push.x;
    p.y += push.y;
  }
}

/** Draw Mara: shadow, body, head, and the swing arc while she punches. */
export function drawPlayer(ctx, game) {
  const p = game.player;
  if (p.inCar) return;
  const bob = p.moving ? Math.sin(p.walkPhase) * 2 : 0;
  ctx.save();
  ctx.translate(p.x, p.y + bob * 0.4);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body: teal jacket, the colour the player reads as "you".
  ctx.rotate(p.angle);
  ctx.fillStyle = p.hurtFlash > 0 ? '#ff6a6a' : '#19b8a6';
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f7a6e';
  ctx.fillRect(-4, -PLAYER.radius, 8, PLAYER.radius * 2);
  // Head and hair.
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(4, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1f1a';
  ctx.beginPath();
  ctx.arc(1, 0, 6.5, Math.PI * 0.5, Math.PI * 1.5);
  ctx.fill();
  // Punch swing.
  if (p.punchAnim > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.punchRange * 0.8, -PLAYER.punchArc, PLAYER.punchArc);
    ctx.stroke();
  }
  ctx.restore();
}
