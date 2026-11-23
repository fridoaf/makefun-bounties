// Solara Bay — ambient traffic and pedestrians.
// NPC cars drive the road grid and stop for the car ahead; pedestrians walk
// the sidewalks and run from trouble. No mission logic lives here.

import { Vehicle } from './vehicles.js';
import { ROADS_H, ROADS_V, nearestRoadPoint } from './city.js';
import { CFG } from './config.js';
import { clamp, dist, rand, randi } from './utils.js';

const CAR_KEYS = ['hatch', 'sedan', 'taxi', 'van', 'sport', 'truck'];
const PED_COLORS = ['#d96a6a', '#6a8ad9', '#6ad98a', '#d9c26a', '#b06ad9', '#e8e8e8', '#5a4a3a'];

export class Traffic {
  constructor() {
    this.cars = [];
    this.peds = [];
    this.spawnAll();
  }

  spawnAll() {
    for (let i = 0; i < 12; i++) this.cars.push(this.makeCar());
    for (let i = 0; i < 16; i++) this.peds.push(this.makePed());
  }

  makeCar() {
    const axis = Math.random() < 0.5 ? 'h' : 'v';
    const line = axis === 'h'
      ? ROADS_H[randi(Math.random, 0, ROADS_H.length - 1)]
      : ROADS_V[randi(Math.random, 0, ROADS_V.length - 1)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x = axis === 'h' ? rand(Math.random, 120, CFG.WORLD_W - 120) : line;
    const y = axis === 'h' ? line : rand(Math.random, 120, CFG.WORLD_H - 120);
    const angle = axis === 'h' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const type = CAR_KEYS[randi(Math.random, 0, CAR_KEYS.length - 1)];
    const veh = new Vehicle(type, x, y, angle, { owner: 'npc' });
    return { veh, axis, line, dir, cruise: rand(Math.random, 100, 165), wait: 0 };
  }

  makePed() {
    const p = nearestRoadPoint(rand(Math.random, 100, CFG.WORLD_W - 100), rand(Math.random, 100, CFG.WORLD_H - 100));
    const off = 62;
    const x = p.axis === 'h' ? p.x : p.x + (Math.random() < 0.5 ? -off : off);
    const y = p.axis === 'h' ? p.y + (Math.random() < 0.5 ? -off : off) : p.y;
    return {
      x, y,
      tx: x, ty: y,
      speed: rand(Math.random, 45, 80),
      color: PED_COLORS[randi(Math.random, 0, PED_COLORS.length - 1)],
      flee: 0,
      bob: Math.random() * 6,
    };
  }

  nearestCar(x, y, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const c of this.cars) {
      const d = dist(x, y, c.veh.x, c.veh.y);
      if (d < bd) { bd = d; best = c.veh; }
    }
    return best;
  }

  // Pedestrians near a crime scene run away from it.
  scatterFrom(x, y, radius = 200) {
    for (const p of this.peds) {
      if (dist(x, y, p.x, p.y) < radius) {
        p.flee = 2.5;
        const a = Math.atan2(p.y - y, p.x - x);
        p.tx = clamp(p.x + Math.cos(a) * 320, 30, CFG.WORLD_W - 30);
        p.ty = clamp(p.y + Math.sin(a) * 320, 30, CFG.WORLD_H - 30);
      }
    }
  }

  update(dt, game) {
    const player = game.player;
    const pv = player.vehicle;
    for (const c of this.cars) {
      const v = c.veh;
      // Is something stopped in front of us on the same lane?
      let blocked = false;
      const aheadX = v.x + Math.cos(v.angle) * 62;
      const aheadY = v.y + Math.sin(v.angle) * 62;
      for (const o of this.cars) {
        if (o === c) continue;
        if (dist(aheadX, aheadY, o.veh.x, o.veh.y) < 46) { blocked = true; break; }
      }
      if (!blocked && pv && dist(aheadX, aheadY, pv.x, pv.y) < 50) blocked = true;
      if (!blocked && player.onFoot && dist(aheadX, aheadY, player.x, player.y) < 34) blocked = true;

      const target = blocked ? 0 : c.cruise;
      v.speed += clamp(target - v.speed, -320 * dt, 260 * dt);
      // Drive straight along the lane, snapping back onto it.
      if (c.axis === 'h') {
        v.y += (c.line - v.y) * Math.min(1, 3 * dt);
        v.x += Math.cos(v.angle) * v.speed * dt;
        v.angle = c.dir > 0 ? 0 : Math.PI;
      } else {
        v.x += (c.line - v.x) * Math.min(1, 3 * dt);
        v.y += Math.sin(v.angle) * v.speed * dt;
        v.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      // Turn at an intersection sometimes; wrap at the world edge.
      const nearCross = c.axis === 'h'
        ? ROADS_V.some((rv) => Math.abs(v.x - rv) < 8)
        : ROADS_H.some((rh) => Math.abs(v.y - rh) < 8);
      if (nearCross && Math.random() < dt * 0.35) {
        if (c.axis === 'h') {
          const cross = ROADS_V.reduce((a, b) => (Math.abs(v.x - a) < Math.abs(v.x - b) ? a : b));
          c.axis = 'v';
          c.line = cross;
          c.dir = Math.random() < 0.5 ? 1 : -1;
          v.x = cross;
        } else {
          const cross = ROADS_H.reduce((a, b) => (Math.abs(v.y - a) < Math.abs(v.y - b) ? a : b));
          c.axis = 'h';
          c.line = cross;
          c.dir = Math.random() < 0.5 ? 1 : -1;
          v.y = cross;
        }
      }
      if (v.x < 40 || v.x > CFG.WORLD_W - 40 || v.y < 40 || v.y > CFG.WORLD_H - 40) {
        const fresh = this.makeCar();
        c.veh = fresh.veh;
        c.axis = fresh.axis;
        c.line = fresh.line;
        c.dir = fresh.dir;
        c.cruise = fresh.cruise;
      }
    }

    for (const p of this.peds) {
      p.bob += dt * 8;
      p.flee = Math.max(0, p.flee - dt);
      const d = dist(p.x, p.y, p.tx, p.ty);
      if (d < 12) {
        // Pick a new sidewalk stroll target near a random road.
        const np = nearestRoadPoint(rand(Math.random, 100, CFG.WORLD_W - 100), rand(Math.random, 100, CFG.WORLD_H - 100));
        const off = 62;
        p.tx = np.axis === 'h' ? np.x : np.x + (Math.random() < 0.5 ? -off : off);
        p.ty = np.axis === 'h' ? np.y + (Math.random() < 0.5 ? -off : off) : np.y;
        p.tx = clamp(p.tx, 30, CFG.WORLD_W - 30);
        p.ty = clamp(p.ty, 30, CFG.WORLD_H - 30);
      } else {
        const spd = p.flee > 0 ? p.speed * 2.4 : p.speed;
        const a = Math.atan2(p.ty - p.y, p.tx - p.x);
        p.x += Math.cos(a) * spd * dt;
        p.y += Math.sin(a) * spd * dt;
      }
    }
  }

  draw(ctx, tod) {
    for (const c of this.cars) c.veh.draw(ctx, tod);
    for (const p of this.peds) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(p.x + 1, p.y + 3, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const bob = Math.sin(p.bob) * 1.2;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob * 0.3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8c9a0';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 2 + bob * 0.3, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
