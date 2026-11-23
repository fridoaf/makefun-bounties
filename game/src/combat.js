// Close combat: Mara's punch, the syndicate guards who punch back, and the
// sparks and dust that sell every hit. Enemies are simple chasers with a
// health bar; Dario Kess is just a tougher one with a bigger bar.

import { PLAYER } from './config.js';
import { clamp } from './utils.js';

export function createEnemy(x, y, kind = 'guard') {
  const tough = kind === 'dario';
  const hp = tough ? 220 : kind === 'rival' ? 90 : 70;
  return {
    x, y,
    kind,
    hp,
    maxHp: hp,
    angle: 0,
    speed: tough ? 165 : 150,
    punchCooldown: 0,
    hurtFlash: 0,
    phase: Math.random() * Math.PI * 2,
    alive: true,
  };
}

/** Mara's swing: everything in the arc in front of her takes a hit. */
export function playerPunch(game) {
  const p = game.player;
  const px = p.x + Math.cos(p.angle) * 26;
  const py = p.y + Math.sin(p.angle) * 26;
  let hitAny = false;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - px, e.y - py);
    if (d > PLAYER.punchRange + 14) continue;
    const ang = Math.atan2(e.y - p.y, e.x - p.x);
    let diff = Math.abs(ang - p.angle) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > PLAYER.punchArc) continue;
    hurtEnemy(game, e, PLAYER.punchDamage, p.angle);
    hitAny = true;
  }
  // Bystanders get knocked down too — and the law notices if it can see.
  for (const ped of game.peds) {
    if (ped.down > 0) continue;
    const d = Math.hypot(ped.x - px, ped.y - py);
    if (d > PLAYER.punchRange + 10) continue;
    ped.down = 2.4;
    ped.fleeing = 3;
    hitAny = true;
    if (game.policeCars.some((c) => Math.hypot(c.x - ped.x, c.y - ped.y) < 520)) {
      game.raiseWanted(1, ped.x, ped.y, 'Assault witnessed');
    }
  }
  if (hitAny) game.audio?.punch();
  return hitAny;
}

function hurtEnemy(game, enemy, damage, fromAngle) {
  enemy.hp -= damage;
  enemy.hurtFlash = 0.18;
  enemy.x += Math.cos(fromAngle) * 14;
  enemy.y += Math.sin(fromAngle) * 14;
  spawnBurst(game, enemy.x, enemy.y, '#ffd24a', 8);
  if (enemy.hp <= 0) {
    enemy.alive = false;
    spawnBurst(game, enemy.x, enemy.y, '#ff5a4a', 16);
    game.audio?.thud();
    if (game.mission && game.mission.id === 5) {
      // The club fight is the job: no heat for finishing it.
      game.notify(enemy.kind === 'dario' ? 'Dario Kess is down.' : 'Guard down.');
    } else {
      game.raiseWanted(1, enemy.x, enemy.y, 'Fight in the street');
    }
  }
}

/** Guards close in and swing when they are in reach. */
export function updateEnemies(game, dt) {
  const p = game.player;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    if (e.hurtFlash > 0) e.hurtFlash -= dt;
    if (e.punchCooldown > 0) e.punchCooldown -= dt;
    e.phase += dt * 8;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (p.inCar) {
      // Guards cannot fight a car: they scatter to the sidewalk.
      const away = Math.atan2(e.y - p.y, e.x - p.x);
      e.x += Math.cos(away) * 90 * dt;
      e.y += Math.sin(away) * 90 * dt;
      continue;
    }
    if (d > 460) continue; // out of the fight, idle
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (d > 30) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    } else if (e.punchCooldown <= 0) {
      e.punchCooldown = 0.9;
      p.hp -= e.kind === 'dario' ? 14 : 9;
      p.hurtFlash = 0.25;
      p.x += Math.cos(e.angle) * 10;
      p.y += Math.sin(e.angle) * 10;
      spawnBurst(game, p.x, p.y, '#ff6a6a', 6);
      game.audio?.thud();
      if (p.hp <= 0) {
        p.hp = 0;
        game.wasted = true;
      }
    }
  }
  game.enemies = game.enemies.filter((e) => e.alive || e.hp > -40);
}

/** Draw enemies with a health bar over each head. */
export function drawEnemies(ctx, game) {
  for (const e of game.enemies) {
    if (!e.alive) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(e.angle);
    ctx.fillStyle = e.hurtFlash > 0 ? '#ff8a7a' : e.kind === 'dario' ? '#3a2a4a' : '#7a2a2a';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Health bar.
    const w = 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - w / 2, e.y - 26, w, 5);
    ctx.fillStyle = e.kind === 'dario' ? '#c93a6a' : '#ff4040';
    ctx.fillRect(e.x - w / 2, e.y - 26, w * clamp(e.hp / e.maxHp, 0, 1), 5);
    if (e.kind === 'dario') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DARIO KESS', e.x, e.y - 32);
    }
  }
}

// ---------------------------------------------------------------- particles

export function spawnBurst(game, x, y, color, n) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 160;
    game.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.35,
      max: 0.75,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

export function spawnDust(game, x, y) {
  game.particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 30,
    vy: (Math.random() - 0.5) * 30,
    life: 0.5,
    max: 0.5,
    color: '#b8a888',
    size: 3 + Math.random() * 3,
  });
}

export function updateParticles(game, dt) {
  for (const pt of game.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
  }
  game.particles = game.particles.filter((pt) => pt.life > 0);
}

export function drawParticles(ctx, game) {
  for (const pt of game.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}
