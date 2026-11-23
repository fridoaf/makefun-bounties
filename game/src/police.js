// Solara Bay — the wanted level and the police response.
// Heat rises with crimes and cools when the player stays out of sight.
// Patrol cars chase and ram; officers on foot try to make the arrest.

import { Vehicle } from './vehicles.js';
import { nearestRoadPoint } from './city.js';
import { HEAT_PER_STAR, MAX_WANTED } from './config.js';
import { angDiff, clamp, dist } from './utils.js';

export class Police {
  constructor() {
    this.heat = 0;
    this.cars = [];
    this.officers = [];
    this.quiet = 0;
    this.spawnCd = 0;
  }

  get stars() {
    if (this.heat <= 0) return 0;
    return Math.min(MAX_WANTED, Math.ceil(this.heat / HEAT_PER_STAR));
  }

  addWanted(n, reason, game) {
    this.heat = clamp(this.heat + n * HEAT_PER_STAR, 0, MAX_WANTED * HEAT_PER_STAR);
    this.quiet = 0;
    if (game) {
      game.notify('Wanted +' + n + (reason ? ' — ' + reason : ''));
      game.audio.sfx('sirenBlip');
      game.traffic.scatterFrom(game.player.x, game.player.y);
    }
  }

  clear(game) {
    this.heat = 0;
    this.cars = [];
    this.officers = [];
    this.quiet = 0;
    if (game) game.audio.setSiren(false);
  }

  spawnCar(game) {
    const p = game.player.pos;
    const spot = nearestRoadPoint(
      clamp(p.x + (Math.random() < 0.5 ? -620 : 620), 80, 2480),
      clamp(p.y + (Math.random() < 0.5 ? -460 : 460), 80, 1840),
    );
    const angle = spot.axis === 'h' ? 0 : Math.PI / 2;
    const car = new Vehicle('police', spot.x, spot.y, angle, { owner: 'police' });
    // ox/oy: pursuit offset from the player — cars with different offsets
    // hold different lanes instead of all piling onto one point.
    this.cars.push({ veh: car, stuck: 0, ox: 0, oy: 0 });
  }

  spawnOfficer(game) {
    const p = game.player.pos;
    const spot = nearestRoadPoint(p.x + (Math.random() < 0.5 ? -160 : 160), p.y + (Math.random() < 0.5 ? -160 : 160));
    this.officers.push({ x: spot.x, y: spot.y, arrest: 0, speed: 235 });
  }

  update(dt, game) {
    const player = game.player;
    const pp = player.pos;
    this.spawnCd -= dt;

    const wantCars = Math.min(this.stars, 4);
    while (this.cars.length < wantCars && this.spawnCd <= 0) {
      this.spawnCar(game);
      this.spawnCd = 1.2;
    }
    if (this.stars === 0) {
      // With no heat, patrols give up and drive off.
      this.cars = this.cars.filter((c) => dist(c.veh.x, c.veh.y, pp.x, pp.y) < 900);
      this.officers = [];
    }
    if (!player.onFoot && this.stars >= 2 && this.officers.length < 2 && this.spawnCd <= 0) {
      this.spawnOfficer(game);
      this.spawnCd = 2;
    }

    // Nearest police distance decides whether the heat can cool.
    let nearest = Infinity;
    for (const c of this.cars) nearest = Math.min(nearest, dist(c.veh.x, c.veh.y, pp.x, pp.y));
    for (const o of this.officers) nearest = Math.min(nearest, dist(o.x, o.y, pp.x, pp.y));
    if (this.stars > 0 && nearest > 560) {
      this.quiet += dt;
      if (this.quiet > 5) this.heat = Math.max(0, this.heat - 7 * dt);
    } else {
      this.quiet = 0;
    }

    // Chase cars: steer at the player (plus this car's pursuit offset, so
    // patrols hold different lanes instead of stacking on one point),
    // ram on contact.
    for (const c of this.cars) {
      const v = c.veh;
      const tx = pp.x + (c.ox || 0);
      const ty = pp.y + (c.oy || 0);
      const want = Math.atan2(ty - v.y, tx - v.x);
      const steer = clamp(angDiff(v.angle, want) * 1.6, -1, 1);
      const d = dist(v.x, v.y, pp.x, pp.y);
      const dtgt = dist(v.x, v.y, tx, ty);
      v.update(dt, { throttle: dtgt > 46 ? 1 : 0.4, steer, brake: false }, game.tod);
      if (d < 52) {
        if (player.vehicle) {
          player.vehicle.speed *= 0.82;
          player.vehicle.health -= 10 * dt;
          if (Math.random() < dt * 2) game.audio.sfx('crash');
          if (player.vehicle.health <= 0) {
            game.combat.burst(v.x, v.y, '#ff9040', 22);
            player.vehicle.health = 100;
            player.exitVehicle(game);
            game.notify('Your car is wrecked!');
          }
        } else {
          player.damage(12, game);
        }
      }
      // A patrol car stuck against a wall reverses out instead of pushing forever.
      if (Math.abs(v.speed) < 8 && d > 90) {
        c.stuck += dt;
        if (c.stuck > 1.6) {
          v.update(dt, { throttle: -0.7, steer: -steer, brake: false }, game.tod);
          if (c.stuck > 2.6) c.stuck = 0;
        }
      } else {
        c.stuck = 0;
      }
    }

    // Officers on foot chase Mara and hold her to make the arrest.
    for (const o of this.officers) {
      const d = dist(o.x, o.y, pp.x, pp.y);
      if (player.onFoot) {
        const a = Math.atan2(pp.y - o.y, pp.x - o.x);
        o.x += Math.cos(a) * o.speed * dt;
        o.y += Math.sin(a) * o.speed * dt;
        if (d < 28) {
          o.arrest += dt;
          if (o.arrest > 1.2) {
            game.busted();
            return;
          }
        } else {
          o.arrest = Math.max(0, o.arrest - dt);
        }
      } else if (d > 700) {
        o.x = pp.x + 500;
        o.y = pp.y;
      }
    }

    // Keep patrol cars from piling onto each other.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i].veh;
        const b = this.cars[j].veh;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d > 0.01 && d < 52) {
          const push = (52 - d) / 2;
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          a.x -= Math.cos(ang) * push;
          a.y -= Math.sin(ang) * push;
          b.x += Math.cos(ang) * push;
          b.y += Math.sin(ang) * push;
        }
      }
    }

    game.audio.setSiren(this.stars > 0 && nearest < 700);
  }

  draw(ctx, tod) {
    for (const c of this.cars) c.veh.draw(ctx, tod);
    for (const o of this.officers) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(o.x + 1, o.y + 3, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2e4a7a';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8e2f2';
      ctx.beginPath();
      ctx.arc(o.x, o.y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      if (o.arrest > 0) {
        ctx.strokeStyle = '#ffd23e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(o.x, o.y, 15, -Math.PI / 2, -Math.PI / 2 + (o.arrest / 1.2) * Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
