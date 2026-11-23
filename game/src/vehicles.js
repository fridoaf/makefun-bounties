// Solara Bay — arcade car physics and drawing.
// One vehicle: accelerate, steer, bounce off buildings, draw itself.
// No traffic rules here; traffic and police just steer these.

import { CAR_TYPES } from './config.js';
import { clamp, TAU } from './utils.js';
import { isSolid, lampsOn } from './city.js';

export class Vehicle {
  constructor(typeKey, x, y, angle, opts = {}) {
    const t = CAR_TYPES[typeKey];
    this.type = typeKey;
    this.name = t.name;
    this.top = t.top;
    this.accel = t.accel;
    this.grip = t.grip;
    this.color = opts.color || t.color;
    this.w = t.w;
    this.l = t.l;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.owner = opts.owner || 'npc'; // 'player' | 'npc' | 'police' | 'parked'
    this.stolen = false;
    this.health = 100;
    this.braking = false;
    this.sirenPhase = Math.random() * TAU;
  }

  // ctl: { throttle: -1..1, steer: -1..1, brake: bool }
  update(dt, ctl, tod) {
    const t = ctl.throttle || 0;
    if (t > 0) this.speed += this.accel * t * dt;
    else if (t < 0) this.speed += this.accel * t * 0.7 * dt;
    else this.speed *= Math.max(0, 1 - 0.55 * dt);
    if (ctl.brake) {
      this.speed *= Math.max(0, 1 - 4.5 * dt);
      this.braking = true;
    } else {
      this.braking = false;
    }
    this.speed = clamp(this.speed, -130, this.top);
    if (Math.abs(this.speed) < 4 && t === 0) this.speed = 0;

    // Steering only bites while moving, and more so at speed.
    const steerAmount = (ctl.steer || 0) * this.grip * clamp(Math.abs(this.speed) / 160, 0, 1);
    this.angle += steerAmount * Math.sign(this.speed || 1) * dt;

    const nx = this.x + Math.cos(this.angle) * this.speed * dt;
    const ny = this.y + Math.sin(this.angle) * this.speed * dt;
    const r = this.w / 2 + 2;
    if (!isSolid(nx, this.y, r)) this.x = nx;
    else this.speed *= 0.45;
    if (!isSolid(this.x, ny, r)) this.y = ny;
    else this.speed *= 0.45;

    this.x = clamp(this.x, 20, 2540);
    this.y = clamp(this.y, 20, 1900);
    if (this.type === 'police') this.sirenPhase += dt * 9;
  }

  draw(ctx, tod) {
    const night = lampsOn(tod);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Shadow under the body.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(-this.l / 2 + 4, -this.w / 2 + 5, this.l, this.w);
    // Headlight cones after dark.
    if (night) {
      ctx.fillStyle = 'rgba(255,240,180,0.13)';
      ctx.beginPath();
      ctx.moveTo(this.l / 2, -this.w / 2 + 6);
      ctx.lineTo(this.l / 2 + 150, -this.w / 2 - 26);
      ctx.lineTo(this.l / 2 + 150, this.w / 2 + 26);
      ctx.lineTo(this.l / 2, this.w / 2 - 6);
      ctx.closePath();
      ctx.fill();
    }
    // Wheels.
    ctx.fillStyle = '#14151a';
    const ww = 14;
    const wh = 7;
    ctx.fillRect(-this.l / 2 + 8, -this.w / 2 - 3, ww, wh);
    ctx.fillRect(-this.l / 2 + 8, this.w / 2 - 4, ww, wh);
    ctx.fillRect(this.l / 2 - 22, -this.w / 2 - 3, ww, wh);
    ctx.fillRect(this.l / 2 - 22, this.w / 2 - 4, ww, wh);
    // Body with a light roof sheen.
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(-this.l / 2, -this.w / 2, this.l, this.w, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.roundRect(-this.l / 2 + 4, -this.w / 2 + 4, this.l - 8, 10, 6);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.roundRect(-this.l * 0.18, -this.w / 2 + 6, this.l * 0.36, this.w - 12, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.55)';
    ctx.fillRect(this.l * 0.16, -this.w / 2 + 8, 5, this.w - 16);
    // Taxi checker stripe.
    if (this.type === 'taxi') {
      ctx.fillStyle = '#14151a';
      for (let i = 0; i < 5; i++) ctx.fillRect(-this.l / 2 + 10 + i * 12, -3, 6, 6);
    }
    // Police livery + flashing light bar.
    if (this.type === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-this.l / 2 + 6, -this.w / 2 + 2, this.l - 12, 6);
      ctx.fillRect(-this.l / 2 + 6, this.w / 2 - 8, this.l - 12, 6);
      const flash = Math.sin(this.sirenPhase) > 0;
      ctx.fillStyle = flash ? '#ff2b2b' : '#2b6bff';
      ctx.fillRect(-8, -this.w / 2 + 2, 8, 7);
      ctx.fillStyle = flash ? '#2b6bff' : '#ff2b2b';
      ctx.fillRect(0, -this.w / 2 + 2, 8, 7);
    }
    // Headlights and brake lights.
    ctx.fillStyle = night ? '#fff6c8' : '#e8e2b8';
    ctx.fillRect(this.l / 2 - 3, -this.w / 2 + 4, 4, 7);
    ctx.fillRect(this.l / 2 - 3, this.w / 2 - 11, 4, 7);
    ctx.fillStyle = this.braking ? '#ff2020' : '#a02020';
    ctx.fillRect(-this.l / 2 - 1, -this.w / 2 + 4, 4, 7);
    ctx.fillRect(-this.l / 2 - 1, this.w / 2 - 11, 4, 7);
    ctx.restore();
  }
}
