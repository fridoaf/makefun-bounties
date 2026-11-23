// Solara Bay — Mara Voss, on foot and behind the wheel.
// Owns walking, getting in and out of cars, health, and the player drawing.

import { CFG } from './config.js';
import { clamp } from './utils.js';
import { isSolid } from './city.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.dir = -Math.PI / 2;
    this.hp = CFG.PLAYER_HP;
    this.armor = 0;
    this.money = 0;
    this.onFoot = true;
    this.vehicle = null;
    this.speed = 0;
    this.punchCd = 0;
    this.hurtCd = 0;
    this.moving = false;
  }

  get pos() {
    return this.vehicle ? { x: this.vehicle.x, y: this.vehicle.y } : { x: this.x, y: this.y };
  }

  update(dt, keys, game) {
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    if (!this.onFoot && this.vehicle) {
      // Driving: the car does the physics, Mara just rides along.
      const throttle = (keys.w || keys.up ? 1 : 0) - (keys.s || keys.down ? 1 : 0);
      const steer = (keys.a || keys.left ? -1 : 0) + (keys.d || keys.right ? 1 : 0);
      this.vehicle.update(dt, { throttle, steer, brake: !!keys.space }, game.tod);
      this.x = this.vehicle.x;
      this.y = this.vehicle.y;
      this.dir = this.vehicle.angle;
      this.speed = Math.abs(this.vehicle.speed);
      this.moving = this.speed > 5;
      return;
    }
    // On foot: 8-way movement, buildings block each axis separately so
    // Mara slides along walls instead of sticking to them.
    let ix = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0);
    let iy = (keys.s || keys.down ? 1 : 0) - (keys.w || keys.up ? 1 : 0);
    const len = Math.hypot(ix, iy);
    this.moving = len > 0;
    if (len > 0) {
      ix /= len;
      iy /= len;
      this.dir = Math.atan2(iy, ix);
      const spd = keys.shift ? CFG.RUN_SPEED : CFG.WALK_SPEED;
      this.speed = spd;
      const nx = this.x + ix * spd * dt;
      const ny = this.y + iy * spd * dt;
      if (!isSolid(nx, this.y, 14)) this.x = nx;
      if (!isSolid(this.x, ny, 14)) this.y = ny;
      this.x = clamp(this.x, 16, CFG.WORLD_W - 16);
      this.y = clamp(this.y, 16, CFG.WORLD_H - 16);
    } else {
      this.speed = 0;
    }
  }

  enterVehicle(v) {
    this.vehicle = v;
    this.onFoot = false;
    v.owner = 'player';
    this.x = v.x;
    this.y = v.y;
  }

  exitVehicle(game) {
    if (!this.vehicle) return;
    const v = this.vehicle;
    // Step out on the car's left side; fall back to the right if blocked.
    const bx = v.x - Math.sin(v.angle) * 34;
    const by = v.y + Math.cos(v.angle) * 34;
    this.vehicle = null;
    this.onFoot = true;
    this.x = isSolid(bx, by, 14) ? v.x + Math.sin(v.angle) * 34 : bx;
    this.y = isSolid(bx, by, 14) ? v.y - Math.cos(v.angle) * 34 : by;
    this.speed = 0;
    if (game) game.audio.sfx('door');
  }

  damage(n, game) {
    if (this.hurtCd > 0) return;
    this.hurtCd = 0.45;
    let left = n;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, left);
      this.armor -= absorbed;
      left -= absorbed;
    }
    this.hp -= left;
    if (game) {
      game.combat.burst(this.x, this.y, '#ff5040', 10);
      game.audio.sfx('hurt');
      if (this.hp <= 0) {
        this.hp = 0;
        game.wasted();
      }
    }
  }

  heal(n) {
    this.hp = Math.min(CFG.PLAYER_HP, this.hp + n);
  }

  draw(ctx) {
    if (!this.onFoot) return; // the car drawing covers the driver
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(this.dir);
    // Yellow courier jacket, arms, head — Mara faces her walking direction.
    ctx.fillStyle = '#e8b23a';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.fillRect(6, -9, 12, 5);
    ctx.fillRect(6, 4, 12, 5);
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(4, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.arc(2, 0, 6.5, Math.PI * 0.6, Math.PI * 1.5);
    ctx.fill();
    ctx.restore();
    if (this.hurtCd > 0.25) {
      ctx.strokeStyle = 'rgba(255,60,40,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
