// Solara Bay — close combat, enemy AI, particles, screen shake.
// Enemies chase Mara and swing when close; Mara's punch answers back.

import { CFG } from './config.js';
import { angDiff, clamp, dist } from './utils.js';

export class Combat {
  constructor() {
    this.enemies = [];
    this.particles = [];
    this.shake = 0;
  }

  spawnEnemy(x, y, hp, name, boss = false) {
    this.enemies.push({
      x, y, hp, max: hp, name, boss,
      speed: boss ? 165 : 145,
      attackCd: 0,
      hurtCd: 0,
      kx: 0, ky: 0,
    });
  }

  clearEnemies() {
    this.enemies = [];
  }

  burst(x, y, color, n = 12, speed = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.4,
        max: 0.8,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // Mara's punch: hits enemies in front of her, knocks them back.
  punch(game) {
    const p = game.player;
    if (p.punchCd > 0 || !p.onFoot) return;
    p.punchCd = 0.38;
    game.audio.sfx('punch');
    let hitAny = false;
    for (const e of this.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > 56) continue;
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      if (Math.abs(angDiff(p.dir, a)) > 1.1) continue;
      hitAny = true;
      e.hp -= 25;
      e.hurtCd = 0.3;
      const kb = 260;
      e.kx = Math.cos(a) * kb;
      e.ky = Math.sin(a) * kb;
      this.burst(e.x, e.y, '#ffd23e', 8, 130);
      this.shake = Math.max(this.shake, 5);
      if (e.hp <= 0) {
        this.burst(e.x, e.y, '#ff5040', 20, 220);
        p.money += e.boss ? 250 : 40;
        game.notify(e.name + ' is down! +$' + (e.boss ? 250 : 40));
        game.audio.sfx('coin');
        game.missions.onEnemyDown(game);
      }
    }
    if (!hitAny) this.burst(p.x + Math.cos(p.dir) * 30, p.y + Math.sin(p.dir) * 30, 'rgba(255,255,255,0.5)', 4, 60);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  update(dt, game) {
    const p = game.player;
    this.shake = Math.max(0, this.shake - dt * 26);
    for (const e of this.enemies) {
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.hurtCd = Math.max(0, e.hurtCd - dt);
      // Knockback decay.
      e.x += e.kx * dt;
      e.y += e.ky * dt;
      e.kx *= Math.max(0, 1 - 6 * dt);
      e.ky *= Math.max(0, 1 - 6 * dt);
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < 430 && d > 30) {
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
      } else if (d <= 30 && e.attackCd <= 0) {
        e.attackCd = 0.9;
        p.damage(e.boss ? 14 : 8, game);
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        p.x += Math.cos(a) * 14;
        p.y += Math.sin(a) * 14;
        this.shake = Math.max(this.shake, 4);
      }
    }
    // Keep enemies from stacking on each other.
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d > 0.01 && d < 30) {
          const push = (30 - d) / 2;
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          a.x -= Math.cos(ang) * push;
          a.y -= Math.sin(ang) * push;
          b.x += Math.cos(ang) * push;
          b.y += Math.sin(ang) * push;
        }
      }
    }
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.max(0, 1 - 3 * dt);
      pt.vy *= Math.max(0, 1 - 3 * dt);
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    // Slow health regen when no enemy is near.
    const near = this.enemies.some((e) => dist(e.x, e.y, p.x, p.y) < 300);
    if (!near && p.hp > 0 && p.hp < CFG.PLAYER_HP) p.hp = Math.min(CFG.PLAYER_HP, p.hp + 2.2 * dt);
  }

  draw(ctx) {
    for (const e of this.enemies) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(e.x + 1, e.y + 4, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.boss ? '#3a1a2e' : '#5a2a3a';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.boss ? 15 : 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(e.x, e.y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      // HP bar above the head.
      const w = e.boss ? 44 : 30;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - (e.boss ? 28 : 24), w, 5);
      ctx.fillStyle = e.hp / e.max > 0.35 ? '#57d977' : '#ff5040';
      ctx.fillRect(e.x - w / 2, e.y - (e.boss ? 28 : 24), w * clamp(e.hp / e.max, 0, 1), 5);
      if (e.boss) {
        ctx.fillStyle = '#ffd23e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(e.name.toUpperCase(), e.x, e.y - 34);
      }
    }
    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }
}
