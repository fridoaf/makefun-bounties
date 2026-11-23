// Solara Bay — HUD, minimap, dialog, and menu screens.
// Everything the player reads lives here, drawn on the main canvas.

import { CFG } from './config.js';
import { ROADS_H, ROADS_V, clockLabel, districtAt } from './city.js';
import { PACKAGES } from './missions.js';
import { clamp, dist } from './utils.js';

const MM_W = 200;
const MM_H = 152;
const MM_X = CFG.VIEW_W - MM_W - 14;
const MM_Y = CFG.VIEW_H - MM_H - 14;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,12,20,0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(0,0,0,0.55)') {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w * clamp(frac, 0, 1), h, 4);
  ctx.fill();
}

function drawStars(ctx, x, y, stars, size = 20) {
  ctx.font = size + 'px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd23e' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', x + i * (size + 2), y);
  }
}

function drawMinimap(ctx, game) {
  const sx = MM_W / 2560;
  const sy = MM_H / 1920;
  panel(ctx, MM_X, MM_Y, MM_W, MM_H);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(MM_X, MM_Y, MM_W, MM_H, 10);
  ctx.clip();
  // Roads.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (const y of ROADS_H) {
    ctx.beginPath();
    ctx.moveTo(MM_X, MM_Y + y * sy);
    ctx.lineTo(MM_X + MM_W, MM_Y + y * sy);
    ctx.stroke();
  }
  for (const x of ROADS_V) {
    ctx.beginPath();
    ctx.moveTo(MM_X + x * sx, MM_Y);
    ctx.lineTo(MM_X + x * sx, MM_Y + MM_H);
    ctx.stroke();
  }
  // Hidden packages.
  ctx.fillStyle = '#57d9ff';
  for (const pk of PACKAGES) {
    if (pk.taken) continue;
    ctx.fillRect(MM_X + pk.x * sx - 2, MM_Y + pk.y * sy - 2, 4, 4);
  }
  // Taxi marker.
  if (game.missions.taxi) {
    const t = game.missions.taxi;
    const tx = t.phase === 'wait' ? t.px : t.dx;
    const ty = t.phase === 'wait' ? t.py : t.dy;
    ctx.fillStyle = '#57d977';
    ctx.beginPath();
    ctx.arc(MM_X + tx * sx, MM_Y + ty * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Traffic dots.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const c of game.traffic.cars) {
    ctx.fillRect(MM_X + c.veh.x * sx - 1, MM_Y + c.veh.y * sy - 1, 3, 3);
  }
  // Mission target.
  const tgt = game.missions.target();
  if (tgt) {
    const pulse = 3 + Math.sin(game.time * 6) * 1.5;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(MM_X + tgt.x * sx, MM_Y + tgt.y * sy, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police.
  ctx.fillStyle = '#ff4040';
  for (const c of game.police.cars) {
    ctx.beginPath();
    ctx.arc(MM_X + c.veh.x * sx, MM_Y + c.veh.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4d8bff';
  for (const o of game.police.officers) {
    ctx.beginPath();
    ctx.arc(MM_X + o.x * sx, MM_Y + o.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const pp = game.player.pos;
  ctx.save();
  ctx.translate(MM_X + pp.x * sx, MM_Y + pp.y * sy);
  ctx.rotate(game.player.dir);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // North + district label.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('N ↑', MM_X + 6, MM_Y + 14);
  const d = districtAt(pp.x, pp.y);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(d.name, MM_X + MM_W - 6, MM_Y + 14);
}

function drawObjectiveArrow(ctx, game) {
  const tgt = game.missions.target();
  if (!tgt) return;
  const cam = game.camera;
  const sx = CFG.VIEW_W / 2 + (tgt.x - cam.x) * cam.zoom;
  const sy = CFG.VIEW_H / 2 + (tgt.y - cam.y) * cam.zoom;
  if (sx > 40 && sx < CFG.VIEW_W - 40 && sy > 40 && sy < CFG.VIEW_H - 40) return;
  const cx = CFG.VIEW_W / 2;
  const cy = CFG.VIEW_H / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  const ex = cx + Math.cos(a) * 300;
  const ey = cy + Math.sin(a) * 200;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(a);
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(dist(game.player.x, game.player.y, tgt.x, tgt.y)) + ' m', ex, ey + 26);
}

export function drawHUD(ctx, game) {
  const p = game.player;
  // Top-left: health, armor, money, wanted.
  panel(ctx, 14, 12, 300, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('MARA VOSS', 26, 34);
  bar(ctx, 26, 42, 180, 12, p.hp / CFG.PLAYER_HP, p.hp > 35 ? '#57d977' : '#ff5040');
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText(Math.ceil(p.hp) + ' HP', 212, 53);
  if (p.armor > 0) {
    bar(ctx, 26, 60, 180, 8, p.armor / 100, '#5aa8ff');
    ctx.fillText('Armor ' + Math.ceil(p.armor), 212, 68);
  }
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('$' + p.money.toLocaleString('en-US'), 26, 92);
  drawStars(ctx, 150, 88, game.police.stars, 18);

  // Top-right: clock, district, speed.
  panel(ctx, CFG.VIEW_W - 214, 12, 200, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(clockLabel(game.tod), CFG.VIEW_W - 26, 38);
  const d = districtAt(p.x, p.y);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(d.name, CFG.VIEW_W - 26, 58);
  if (p.vehicle) {
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(Math.round(Math.abs(p.vehicle.speed) * 0.36) + ' km/h', CFG.VIEW_W - 26, 84);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(p.vehicle.name, CFG.VIEW_W - 26, 100);
  } else {
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Berjalan kaki — E: masuk mobil', CFG.VIEW_W - 26, 84);
  }

  // Bottom-left: objective + mission line.
  const obj = game.missions.objectiveText();
  panel(ctx, 14, CFG.VIEW_H - 96, 430, 82);
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('OBJEKTIF', 26, CFG.VIEW_H - 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px sans-serif';
  ctx.fillText(obj.slice(0, 64), 26, CFG.VIEW_H - 54);
  const m = game.missions.current();
  if (m && !game.missions.storyDone) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Misi ' + (game.missions.idx + 1) + '/5 — ' + m.name + '   •   Paket: ' + game.missions.packagesFound + '/8', 26, CFG.VIEW_H - 34);
  }

  // Dialog lines above the objective panel.
  let dy = CFG.VIEW_H - 108;
  for (const line of game.missions.dialog.slice(-2)) {
    panel(ctx, 14, dy - 34, 560, 34);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(line.speaker, 26, dy - 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px sans-serif';
    ctx.fillText(line.text.slice(0, 78), 96, dy - 12);
    dy -= 40;
  }

  // Notifications, top centre.
  let ny = 122;
  for (const n of game.notifications.slice(-3)) {
    ctx.globalAlpha = clamp(n.t / 1.2, 0, 1);
    panel(ctx, CFG.VIEW_W / 2 - 220, ny, 440, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(n.text.slice(0, 64), CFG.VIEW_W / 2, ny + 20);
    ctx.globalAlpha = 1;
    ny += 36;
  }
  ctx.textAlign = 'left';

  drawMinimap(ctx, game);
  drawObjectiveArrow(ctx, game);

  // Wanted flash border at 3+ stars.
  if (game.police.stars >= 3) {
    const a = 0.10 + Math.sin(game.time * 6) * 0.06;
    ctx.strokeStyle = 'rgba(255,40,40,' + a.toFixed(3) + ')';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, CFG.VIEW_W - 10, CFG.VIEW_H - 10);
  }
}

function overlay(ctx) {
  ctx.fillStyle = 'rgba(8,10,18,0.72)';
  ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
}

function bigTitle(ctx, text, y, size = 54) {
  ctx.font = 'bold ' + size + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText(text, CFG.VIEW_W / 2, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, CFG.VIEW_W / 2 - 2, y - 2);
}

export function drawTitle(ctx, game) {
  overlay(ctx);
  bigTitle(ctx, 'SOLARA BAY', 150, 72);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Kota pesisir. Satu kurir. Utang yang harus lunas.', CFG.VIEW_W / 2, 210);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const lines = [
    'WASD / Panah — bergerak & mengemudi      Shift — lari',
    'E — masuk / keluar mobil      F — interaksi / mulai misi',
    'Space — pukul (jalan kaki) / rem tangan (mobil)      M — mute      Esc — jeda',
    '',
    'Curi mobil, kabur dari polisi, selesaikan 5 misi Mara Voss.',
    '8 paket tersembunyi + tarif taksi menunggu di jalan.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, CFG.VIEW_W / 2, 270 + i * 26));
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(game.hasSave ? 'ENTER — Lanjutkan / N — Permainan Baru' : 'ENTER — Permainan Baru', CFG.VIEW_W / 2, 470);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '12px sans-serif';
  ctx.fillText('Game orisinal — bukan GTA, bukan Rockstar. Semua nama, kota, dan karakter adalah fiksi.', CFG.VIEW_W / 2, 640);
}

export function drawPause(ctx, game) {
  overlay(ctx);
  bigTitle(ctx, 'JEDA', 220, 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  const lines = [
    'Esc — lanjut bermain',
    'M — suara ' + (game.audio.muted ? 'mati' : 'hidup'),
    'R — mulai ulang dari checkpoint misi',
    'Uang: $' + game.player.money.toLocaleString('en-US') + '   •   Misi: ' + (game.missions.storyDone ? 'selesai' : (game.missions.idx + 1) + '/5'),
  ];
  lines.forEach((l, i) => ctx.fillText(l, CFG.VIEW_W / 2, 300 + i * 30));
}

export function drawEnd(ctx, game, kind) {
  overlay(ctx);
  if (kind === 'busted') {
    bigTitle(ctx, 'BUSTED!', 220, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Polisi Bay Precinct menangkap Mara. Denda dibayar, mobil disita.', CFG.VIEW_W / 2, 300);
  } else if (kind === 'wasted') {
    bigTitle(ctx, 'WASTED', 220, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Mara tumbang di jalanan Solara Bay.', CFG.VIEW_W / 2, 300);
  } else if (kind === 'won') {
    bigTitle(ctx, 'UTANG LUNAS!', 200, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Dario Kess kalah. Mara Voss bebas — Solara Bay kini miliknya.', CFG.VIEW_W / 2, 280);
    ctx.fillText('Uang akhir: $' + game.player.money.toLocaleString('en-US') + '   •   Paket: ' + game.missions.packagesFound + '/8', CFG.VIEW_W / 2, 316);
  }
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('R — coba lagi dari checkpoint      ENTER — jelajahi kota', CFG.VIEW_W / 2, 380);
}
