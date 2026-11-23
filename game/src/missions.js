// Solara Bay — story missions and side work.
// Five missions for Mara Voss, plus hidden packages and taxi fares.
// This file knows the story; the engine in main.js drives it.

import { LANDMARKS, nearestRoadPoint } from './city.js';
import { Vehicle } from './vehicles.js';
import { clamp, dist, randi } from './utils.js';

// Eight hidden packages, all on roads so they are always reachable.
export const PACKAGES = [
  { x: 280, y: 560, taken: false },
  { x: 760, y: 200, taken: false },
  { x: 1240, y: 920, taken: false },
  { x: 1720, y: 560, taken: false },
  { x: 2200, y: 1280, taken: false },
  { x: 760, y: 1640, taken: false },
  { x: 1720, y: 200, taken: false },
  { x: 1240, y: 1640, taken: false },
];

export const MISSIONS = [
  {
    id: 'm1', name: 'Paket Tepat Waktu', reward: 300,
    brief: 'Mara: "Satu paket untuk Marina Quay, lalu antar ke Palm Heights sebelum jam habis."',
    steps: [
      { type: 'pickup', lm: 'marina', r: 110, text: 'Ambil paket di Marina Quay (tekan F)' },
      { type: 'deliver', x: 1240, y: 1280, r: 80, text: 'Antar paket ke Palm Heights', timer: 90 },
    ],
  },
  {
    id: 'm2', name: 'Mobil Dario', reward: 450,
    brief: 'Dario Kess memamerkan Vela GT barunya di Neon Row. Ambil mobil itu, bawa ke bengkel Dockside Fuel.',
    steps: [
      { type: 'goto', lm: 'club', r: 120, text: 'Pergi ke Club Lumen, Neon Row' },
      { type: 'steal', x: 2140, y: 200, r: 70, text: 'Curi Vela GT merah muda itu (tekan E)' },
      { type: 'deliverCar', lm: 'gas', r: 120, text: 'Bawa Vela GT ke Dockside Fuel' },
    ],
  },
  {
    id: 'm3', name: 'Kejar Kurir', reward: 500,
    brief: 'Kurir saingan kabur lewat Coral Beach dengan daftar pelanggan kita. Kejar dia sampai menyerah.',
    steps: [
      { type: 'chase', x: 1760, y: 1640, r: 90, text: 'Kejar kurir saingan di jalan pantai' },
    ],
  },
  {
    id: 'm4', name: 'Penyelamatan Dockside', reward: 600,
    brief: 'Rekan Mara, Ivo, dikepung anak buah Dario di gudang Dockside. Bebaskan dia, lalu bawa ke rumah sakit.',
    steps: [
      { type: 'goto', x: 280, y: 1280, r: 90, text: 'Pergi ke gudang Dockside' },
      { type: 'fight', x: 280, y: 1280, r: 130, kills: 3, text: 'Kalahkan 3 anak buah Dario (Space untuk memukul)' },
      { type: 'deliver', lm: 'hospital', r: 110, text: 'Bawa Ivo ke Solara General' },
    ],
  },
  {
    id: 'm5', name: 'Konfrontasi Neon Row', reward: 800,
    brief: 'Terakhir: masuk Club Lumen dan hadapi Dario Kess sendiri. Akhiri utang ini malam ini juga.',
    steps: [
      { type: 'goto', lm: 'club', r: 120, text: 'Masuk ke Club Lumen' },
      { type: 'fight', lm: 'club', r: 140, kills: 5, boss: true, text: 'Kalahkan Dario Kess dan pengawalnya' },
    ],
  },
];

function resolveTarget(step) {
  if (step.lm && LANDMARKS[step.lm]) {
    const lm = LANDMARKS[step.lm];
    return { x: lm.x, y: lm.y, r: step.r, label: lm.label };
  }
  return { x: step.x, y: step.y, r: step.r, label: '' };
}

export class Missions {
  constructor() {
    this.idx = 0;
    this.step = 0;
    this.active = false;
    this.timer = 0;
    this.dialog = []; // { speaker, text, t }
    this.kills = 0;
    this.killsNeeded = 0;
    this.chaseCar = null;
    this.chaseHold = 0;
    this.stealCar = null;
    this.fightSpawned = false;
    this.taxi = null; // { phase, px, py, dx, dy, fare, timer }
    this.storyDone = false;
    this.packagesFound = 0;
  }

  current() {
    return MISSIONS[this.idx] || null;
  }

  currentStep() {
    const m = this.current();
    return m ? m.steps[this.step] : null;
  }

  say(speaker, text) {
    this.dialog.push({ speaker, text, t: 7 });
    if (this.dialog.length > 3) this.dialog.shift();
  }

  start(idx, game) {
    this.idx = idx;
    this.step = 0;
    this.active = true;
    this.timer = 0;
    this.kills = 0;
    this.fightSpawned = false;
    this.chaseCar = null;
    this.stealCar = null;
    const m = this.current();
    if (!m) return;
    this.say('MARA', m.brief);
    game.notify('Misi ' + (idx + 1) + '/5: ' + m.name);
    game.audio.sfx('mission');
    game.setCheckpoint();
  }

  objectiveText() {
    if (this.storyDone) return 'Cerita selesai — jelajahi Solara Bay sesukamu.';
    const s = this.currentStep();
    if (!s) return 'Bicara dengan kontakmu untuk misi berikutnya.';
    let t = s.text;
    if (s.type === 'fight') t += '  (' + this.kills + '/' + this.killsNeeded + ')';
    if (s.timer && this.timer > 0) t += '  — ' + Math.ceil(this.timer) + ' dtk';
    return t;
  }

  target() {
    if (this.storyDone) return null;
    const s = this.currentStep();
    if (!s) return null;
    if (s.type === 'chase' && this.chaseCar) {
      return { x: this.chaseCar.x, y: this.chaseCar.y, r: 80, label: 'Kurir saingan' };
    }
    if (s.type === 'steal' && this.stealCar) {
      return { x: this.stealCar.x, y: this.stealCar.y, r: 70, label: 'Vela GT' };
    }
    return resolveTarget(s);
  }

  // Called by main.js when the player presses F near an objective.
  interact(game) {
    const s = this.currentStep();
    if (!s || !this.active) return false;
    const p = game.player.pos;
    if (s.type === 'pickup') {
      const t = resolveTarget(s);
      if (dist(p.x, p.y, t.x, t.y) < t.r) {
        game.notify('Paket diambil. Cepat, antar ke Palm Heights!');
        game.audio.sfx('pickup');
        this.advance(game);
        return true;
      }
    }
    // Taxi pickup / drop-off.
    if (this.taxi) {
      if (this.taxi.phase === 'wait' && dist(p.x, p.y, this.taxi.px, this.taxi.py) < 60) {
        this.taxi.phase = 'ride';
        this.say('PENUMPANG', 'Ke ' + this.taxi.destName + ', tolong. Saya buru-buru!');
        return true;
      }
      if (this.taxi.phase === 'ride' && dist(p.x, p.y, this.taxi.dx, this.taxi.dy) < 70) {
        const bonus = this.taxi.timer > 30 ? 50 : 0;
        const fare = this.taxi.fare + bonus;
        game.player.money += fare;
        game.notify('Tarif taksi +$' + fare + (bonus ? ' (bonus tepat waktu!)' : ''));
        game.audio.sfx('coin');
        this.taxi = null;
        return true;
      }
    }
    return false;
  }

  advance(game) {
    this.step++;
    this.timer = 0;
    this.fightSpawned = false;
    const m = this.current();
    if (!m) return;
    if (this.step >= m.steps.length) {
      this.complete(game);
      return;
    }
    const s = this.currentStep();
    if (s.timer) this.timer = s.timer;
    if (s.type === 'fight') {
      this.kills = 0;
      this.killsNeeded = s.kills;
    }
    game.audio.sfx('objective');
  }

  complete(game) {
    const m = this.current();
    game.player.money += m.reward;
    game.notify('Misi selesai: ' + m.name + '  +$' + m.reward);
    game.audio.sfx('missionDone');
    game.combat.burst(game.player.x, game.player.y, '#ffd23e', 26, 240);
    this.active = false;
    game.setCheckpoint();
    if (this.idx >= MISSIONS.length - 1) {
      this.storyDone = true;
      game.winGame();
      return;
    }
    this.idx++;
    this.step = 0;
    this.say('KONTAK', 'Kerja bagus, Mara. Misi berikutnya: ' + MISSIONS[this.idx].name + '. Pergi ke penanda kuning.');
    game.notify('Misi baru: ' + MISSIONS[this.idx].name + ' — tekan F untuk mulai');
  }

  // The next mission only starts when the player accepts it at the marker.
  acceptNext(game) {
    if (this.active || this.storyDone) return;
    const m = this.current();
    if (!m) return;
    const t = resolveTarget(m.steps[0]);
    const p = game.player.pos;
    if (dist(p.x, p.y, t.x, t.y) > 150) {
      game.notify('Pergi ke penanda kuning dan tekan F untuk mulai: ' + m.name);
      return;
    }
    this.start(this.idx, game);
  }

  onEnemyDown(game) {
    const s = this.currentStep();
    if (!s || s.type !== 'fight') return;
    this.kills++;
    if (this.kills >= this.killsNeeded) {
      game.notify('Semua musuh kalah!');
      this.advance(game);
    }
  }

  maybeStartTaxi(game) {
    if (this.taxi || Math.random() > 0.004) return;
    const p = game.player.pos;
    const spot = nearestRoadPoint(p.x + (Math.random() < 0.5 ? -500 : 500), p.y + (Math.random() < 0.5 ? -380 : 380));
    const dest = nearestRoadPoint(p.x + (Math.random() < 0.5 ? -700 : 700), p.y + (Math.random() < 0.5 ? -500 : 500));
    const fare = 80 + randi(Math.random, 0, 7) * 10;
    this.taxi = {
      phase: 'wait',
      px: spot.x, py: spot.y,
      dx: dest.x, dy: dest.y,
      destName: 'tujuan',
      fare,
      timer: 75,
    };
    game.notify('Penumpang taksi menunggu di dekat sini (penanda hijau). Tekan F untuk mengantar.');
  }

  update(dt, game) {
    for (const d of this.dialog) d.t -= dt;
    this.dialog = this.dialog.filter((d) => d.t > 0);

    const p = game.player;
    const pp = p.pos;

    // Hidden packages: walk over one to collect it.
    for (const pk of PACKAGES) {
      if (!pk.taken && dist(pp.x, pp.y, pk.x, pk.y) < 30) {
        pk.taken = true;
        this.packagesFound++;
        p.money += 150;
        game.notify('Paket tersembunyi ditemukan! +$150 (' + this.packagesFound + '/8)');
        game.audio.sfx('coin');
        game.combat.burst(pk.x, pk.y, '#57d9ff', 14, 160);
      }
    }

    // Taxi timer.
    if (this.taxi) {
      this.taxi.timer -= dt;
      if (this.taxi.timer <= 0) {
        game.notify('Penumpang taksi pergi — terlambat.');
        this.taxi = null;
      }
    } else if (p.vehicle) {
      this.maybeStartTaxi(game);
    }

    if (!this.active || this.storyDone) return;
    const s = this.currentStep();
    if (!s) return;

    if (s.timer) {
      this.timer -= dt;
      if (this.timer <= 0) {
        game.notify('Waktu habis! Misi diulang dari awal misi ini.');
        game.audio.sfx('fail');
        this.start(this.idx, game);
        return;
      }
    }

    const t = resolveTarget(s);
    switch (s.type) {
      case 'goto':
      case 'deliver':
        if (dist(pp.x, pp.y, t.x, t.y) < t.r) this.advance(game);
        break;
      case 'deliverCar':
        if (p.vehicle && dist(pp.x, pp.y, t.x, t.y) < t.r) this.advance(game);
        break;
      case 'steal': {
        if (!this.stealCar) {
          this.stealCar = new Vehicle('sport', s.x, s.y, Math.PI / 2, { owner: 'parked', color: '#ff2e88' });
          game.parkedCars.push(this.stealCar);
        }
        if (p.vehicle === this.stealCar) {
          this.stealCar.stolen = true;
          game.police.addWanted(1, 'mobil curian terlihat', game);
          game.notify('Vela GT dicuri! Polisi waspada — bawa ke bengkel, cepat!');
          this.advance(game);
        }
        break;
      }
      case 'chase': {
        if (!this.chaseCar) {
          this.chaseCar = new Vehicle('sport', s.x, s.y, 0, { owner: 'npc', color: '#57d9ff' });
          this.chaseCar.speed = 240;
        }
        const c = this.chaseCar;
        // The rival courier flees east along the beach road, then loops back.
        c.x += 250 * dt;
        c.y = 1640 + Math.sin(c.x * 0.01) * 12;
        c.angle = 0;
        if (c.x > 2400) c.x = 1500;
        const d = dist(pp.x, pp.y, c.x, c.y);
        if (d < 80) {
          this.chaseHold += dt;
          if (this.chaseHold > 2.5) {
            game.notify('Kurir menyerah! Daftar pelanggan kembali.');
            this.chaseCar = null;
            this.advance(game);
          }
        } else {
          this.chaseHold = Math.max(0, this.chaseHold - dt);
        }
        break;
      }
      case 'fight': {
        if (!this.fightSpawned) {
          this.fightSpawned = true;
          this.kills = 0;
          this.killsNeeded = s.kills;
          // Enemies gather on the road beside the target, never inside a building.
          const road = nearestRoadPoint(t.x, t.y);
          for (let i = 0; i < s.kills - (s.boss ? 1 : 0); i++) {
            game.combat.spawnEnemy(road.x + (Math.random() - 0.5) * 220, road.y + (Math.random() - 0.5) * 220, 75, 'Anak buah Dario');
          }
          if (s.boss) game.combat.spawnEnemy(road.x, road.y - 60, 220, 'Dario Kess', true);
          this.say('DARIO', 'Mara Voss. Utangmu lunas malam ini — dengan cara keras.');
        }
        break;
      }
      default:
        break;
    }
  }

  drawMarkers(ctx, time) {
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    const t = this.target();
    if (t && this.active) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, t.r * 0.55 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,210,62,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, t.r * 0.55 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(0, -t.r * 0.55 - 26);
      ctx.lineTo(10, -t.r * 0.55 - 6);
      ctx.lineTo(-10, -t.r * 0.55 - 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (!this.active && !this.storyDone) {
      // Idle marker: walk here and press F to start the next mission.
      const m = this.current();
      if (m) {
        const mt = resolveTarget(m.steps[0]);
        ctx.save();
        ctx.translate(mt.x, mt.y);
        ctx.strokeStyle = '#ffd23e';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 46 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd23e';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('F: MULAI MISI', 0, -56);
        ctx.restore();
      }
    }
    if (this.taxi) {
      const tx = this.taxi.phase === 'wait' ? { x: this.taxi.px, y: this.taxi.py } : { x: this.taxi.dx, y: this.taxi.dy };
      ctx.save();
      ctx.translate(tx.x, tx.y);
      ctx.strokeStyle = '#57d977';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#57d977';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.taxi.phase === 'wait' ? 'TAXI' : 'TUJUAN', 0, -32);
      ctx.restore();
    }
    for (const pk of PACKAGES) {
      if (pk.taken) continue;
      ctx.save();
      ctx.translate(pk.x, pk.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#57d9ff';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-7, -2, 14, 4);
      ctx.restore();
    }
  }
}
