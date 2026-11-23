// Everything the player reads: health and cash, the wanted stars, the clock,
// the objective line, the minimap, the screen-edge arrow to the job, and the
// title / pause / busted / wasted screens. All of it is drawn on the canvas
// so it is in every screenshot.

import { FONT, PACKAGE_COUNT, WORLD } from './config.js';
import { clamp, clockText, moneyText } from './utils.js';
import { currentObjective, missionMarker } from './missions.js';
import { skyPeriod } from './city.js';

const MM = { x: 1280 - 224, y: 12, w: 212, h: 158 };

export function drawHud(ctx, game) {
  const p = game.player;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // --- top-left: wanted, cash, health, packages ---
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < game.wanted ? '★' : '☆';
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = game.wanted > 0 ? '#ffcf3a' : 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.fillText(stars, 16, 36);
  ctx.shadowBlur = 0;
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = '#7dff8a';
  ctx.fillText(moneyText(game.cash), 16, 66);
  // Health bar.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, 76, 170, 14);
  ctx.fillStyle = p.hp > 30 ? '#37d67a' : '#ff5040';
  ctx.fillRect(18, 78, 166 * clamp(p.hp / 100, 0, 1), 10);
  ctx.fillStyle = '#fff';
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`HP ${Math.ceil(p.hp)}`, 192, 88);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `14px ${FONT}`;
  ctx.fillText(`Packages ${game.missions.packagesTaken}/${PACKAGE_COUNT}`, 16, 112);

  // --- minimap + clock, top-right ---
  drawMinimap(ctx, game);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 17px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(clockText(game.clockMin), 1280 - 16, MM.y + MM.h + 24);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`${skyPeriod(game.clockMin)} · ${districtAt(game)}`, 1280 - 16, MM.y + MM.h + 44);

  // --- objective, bottom-left ---
  ctx.textAlign = 'left';
  ctx.font = `bold 16px ${FONT}`;
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(`◆ ${currentObjective(game)}`, 16, 720 - 58);
  if (game.missions.taxi?.state === 'ride') {
    ctx.fillStyle = '#7dff8a';
    ctx.fillText(`TAXI: drop the passenger — $${game.missions.taxi.fare} (${Math.ceil(game.missions.taxi.timer)}s)`, 16, 720 - 36);
  } else if (game.missions.taxi?.state === 'hail') {
    ctx.fillStyle = '#7dff8a';
    ctx.fillText('TAXI: a passenger is hailing — press F near them', 16, 720 - 36);
  }

  // --- speed, bottom-right, while driving ---
  if (p.inCar) {
    const kmh = Math.round(Math.abs(p.inCar.speed) * 0.45);
    ctx.textAlign = 'right';
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${kmh}`, 1280 - 52, 720 - 24);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('km/h', 1280 - 16, 720 - 24);
    ctx.fillText(p.inCar.label, 1280 - 16, 720 - 52);
    if (p.inCar.stolen) {
      ctx.fillStyle = '#ff9a3a';
      ctx.fillText('STOLEN', 1280 - 16, 720 - 72);
    }
  } else {
    ctx.textAlign = 'right';
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('WASD move · Shift run · Space punch · E car · F interact · M mute', 1280 - 16, 720 - 16);
  }

  // --- subtitle dialog, lower-centre ---
  const line = currentDialogLine(game);
  if (line) {
    ctx.textAlign = 'center';
    ctx.font = `italic 17px ${FONT}`;
    const w = ctx.measureText(line).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(640 - w / 2, 720 - 132, w, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(line, 640, 720 - 111);
  }

  // --- notifications, top-centre ---
  ctx.textAlign = 'center';
  ctx.font = `bold 15px ${FONT}`;
  let ny = 20;
  for (const n of game.notifs) {
    ctx.globalAlpha = clamp(n.life / 1.2, 0, 1);
    const w = ctx.measureText(n.text).width + 24;
    ctx.fillStyle = 'rgba(10,14,28,0.78)';
    ctx.fillRect(640 - w / 2, ny, w, 26);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(n.text, 640, ny + 18);
    ny += 32;
  }
  ctx.globalAlpha = 1;

  // --- edge arrow to the mission marker ---
  const marker = missionMarker(game);
  if (marker) drawEdgeArrow(ctx, game, marker);

  // --- busted progress while a cop holds her ---
  if (game.bustTimer > 0) {
    ctx.textAlign = 'center';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = '#ff5040';
    ctx.fillText('THE SBPD ARE GRABBING YOU — DRIVE!', 640, 120);
  }
  ctx.restore();
}

function currentDialogLine(game) {
  if (!game.dialogLines || game.dialogIndex >= game.dialogLines.length) return null;
  return game.dialogLines[game.dialogIndex];
}

function districtAt(game) {
  const { x, y } = game.player;
  if (y > 1480) return 'Coral Beach';
  if (x < 780 && y < 680) return 'Marina Quay';
  if (x >= 1740 && y < 680) return 'Old Coral';
  if (x >= 780 && x < 1740 && y >= 680 && y < 1080) return 'Neon Row';
  if (x < 780 && y >= 1080) return 'Palm Heights';
  if (x >= 1740 && y >= 1080) return 'Dockside';
  return 'Solara Bay';
}

/** The minimap: roads, districts, water, and every dot that matters. */
export function drawMinimap(ctx, game) {
  const sx = MM.w / WORLD.width;
  const sy = MM.h / WORLD.height;
  const toMap = (x, y) => ({ x: MM.x + x * sx, y: MM.y + y * sy });

  ctx.save();
  ctx.fillStyle = 'rgba(8,12,24,0.82)';
  ctx.fillRect(MM.x - 4, MM.y - 4, MM.w + 8, MM.h + 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MM.x - 4, MM.y - 4, MM.w + 8, MM.h + 8);
  // Ground, water, sand.
  ctx.fillStyle = '#4a6a44';
  ctx.fillRect(MM.x, MM.y, MM.w, MM.h);
  ctx.fillStyle = '#2f6f8f';
  ctx.fillRect(MM.x, MM.y, 700 * sx, 150 * sy);
  ctx.fillStyle = '#e8d28a';
  ctx.fillRect(MM.x, MM.y + 1796 * sy, MM.w, 124 * sy);
  // Roads.
  ctx.strokeStyle = '#c9ccd2';
  ctx.lineWidth = 2;
  for (const rx of [300, 780, 1260, 1740, 2220]) {
    ctx.beginPath();
    ctx.moveTo(MM.x + rx * sx, MM.y);
    ctx.lineTo(MM.x + rx * sx, MM.y + MM.h);
    ctx.stroke();
  }
  for (const ry of [280, 680, 1080, 1480, 1760]) {
    ctx.beginPath();
    ctx.moveTo(MM.x, MM.y + ry * sy);
    ctx.lineTo(MM.x + MM.w, MM.y + ry * sy);
    ctx.stroke();
  }
  const dot = (x, y, color, r = 3) => {
    const p = toMap(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Hidden packages.
  for (const pkg of game.missions.packages) {
    if (!pkg.taken) dot(pkg.x, pkg.y, '#b8ff5a', 2);
  }
  // Taxi hail / destination.
  const taxi = game.missions.taxi;
  if (taxi) dot(taxi.state === 'hail' ? taxi.x : taxi.dest.x, taxi.state === 'hail' ? taxi.y : taxi.dest.y, '#7dff8a', 3.5);
  // Enemies.
  for (const e of game.enemies) if (e.alive) dot(e.x, e.y, '#ff4040', 3);
  // Police.
  for (const c of game.policeCars) dot(c.x, c.y, '#3a8aff', 3);
  for (const c of game.footCops) dot(c.x, c.y, '#3a8aff', 2.5);
  // Mission marker: a yellow diamond.
  const marker = missionMarker(game);
  if (marker) {
    const p = toMap(marker.x, marker.y);
    ctx.fillStyle = '#ffd24a';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  // The player, white with a dark ring.
  const pp = toMap(game.player.x, game.player.y);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // North arrow.
  ctx.fillStyle = '#fff';
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('N ↑', MM.x + 4, MM.y + 14);
  ctx.restore();
}

/** An arrow at the screen edge pointing at an off-screen marker. */
function drawEdgeArrow(ctx, game, marker) {
  const cam = game.camera;
  const vx = 1280 / cam.zoom;
  const vy = 720 / cam.zoom;
  const sx = (marker.x - (cam.x - vx / 2)) / vx * 1280;
  const sy = (marker.y - (cam.y - vy / 2)) / vy * 720;
  if (sx > 40 && sx < 1240 && sy > 40 && sy < 680) {
    // On screen: a floating diamond over the spot.
    ctx.save();
    ctx.translate(sx, sy - 34 + Math.sin(game.time * 4) * 4);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
    ctx.fillStyle = '#ffd24a';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(marker.label, sx, sy - 48 + Math.sin(game.time * 4) * 4);
    return;
  }
  const cx = clamp(sx, 50, 1230);
  const cy = clamp(sy, 60, 660);
  const ang = Math.atan2(sy - 360, sx - 640);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffd24a';
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  // The label sits above the arrow when the arrow is near the bottom edge,
  // so it never collides with the objective line, and stays on screen. When
  // it would only repeat the objective line, the arrow alone is enough.
  if (!currentObjective(game).startsWith(marker.label)) {
    const lx = clamp(cx, 130, 1150);
    ctx.fillText(marker.label, lx, cy > 600 ? cy - 30 : cy + 26);
  }
}

// ---------------------------------------------------------------- screens

export function drawTitle(ctx, game) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,26,0.72)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24a';
  ctx.font = `bold 74px ${FONT}`;
  ctx.fillText('SOLARA BAY', 640, 190);
  ctx.fillStyle = '#fff';
  ctx.font = `26px ${FONT}`;
  ctx.fillText('An open-world crime story — 6 districts, 5 jobs, 1 debt', 640, 238);
  ctx.font = `17px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const lines = [
    'WASD / arrows — walk & drive · Shift — run · Space — punch / handbrake',
    'E — steal & enter cars · F — interact · M — mute · Esc — pause',
    'Steal cars, dodge the SBPD, finish all five jobs to clear the debt.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, 640, 300 + i * 28));
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = game.save ? '#7dff8a' : '#fff';
  ctx.fillText(game.save ? '▶  ENTER — Continue your story' : '▶  ENTER — New game', 640, 430);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Mara Voss owes the Kess syndicate. The city is the only way out.', 640, 480);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('A fictional city. No real places, people, or cars. All art and sound are procedural.', 640, 690);
  ctx.restore();
}

export function drawPaused(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,26,0.66)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillText('PAUSED', 640, 320);
  ctx.font = `18px ${FONT}`;
  ctx.fillText('Esc — resume · Enter — resume · M — mute', 640, 370);
  ctx.restore();
}

export function drawEnd(ctx, game, kind) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,26,0.78)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  if (kind === 'busted') {
    ctx.fillStyle = '#6aa8ff';
    ctx.font = `bold 64px ${FONT}`;
    ctx.fillText('BUSTED', 640, 300);
    ctx.fillStyle = '#fff';
    ctx.font = `20px ${FONT}`;
    ctx.fillText('The SBPD caught up with Mara. The debt still stands.', 640, 350);
  } else {
    ctx.fillStyle = '#ff5040';
    ctx.font = `bold 64px ${FONT}`;
    ctx.fillText('WASTED', 640, 300);
    ctx.fillStyle = '#fff';
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Mara went down in the streets of Solara Bay.', 640, 350);
  }
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Cash kept: ${moneyText(game.cash)} · Jobs done: ${game.missions.done.filter(Boolean).length}/5`, 640, 400);
  ctx.fillStyle = '#ffd24a';
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText('ENTER — retry from the last job', 640, 460);
  ctx.restore();
}

export function drawStoryDone(ctx, game) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,26,0.6)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24a';
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillText('THE DEBT IS PAID', 640, 300);
  ctx.fillStyle = '#fff';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('All five jobs done. Solara Bay belongs to Mara Voss now.', 640, 350);
  ctx.font = `18px ${FONT}`;
  ctx.fillText('ENTER — keep driving the city', 640, 410);
  ctx.restore();
}
