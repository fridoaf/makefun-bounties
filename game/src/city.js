// Solara Bay — the city itself: road grid, blocks, buildings, parks,
// landmarks, and the day/night palette. Gameplay rules live elsewhere;
// this module only knows where things are and whether a spot is solid.

import { CFG, DISTRICTS } from './config.js';
import { clamp, mulberry32, rand, randi, rectsOverlap, circleHitsRect } from './utils.js';

export const ROADS_H = [200, 560, 920, 1280, 1640];
export const ROADS_V = [280, 760, 1240, 1720, 2200];
export const ROAD_W = 96;

export const BUILDINGS = [];
export const PARKS = [];
export const LANDMARKS = {}; // name -> { x, y, label, color }

// City blocks sit between the roads; each pair is [min, max] along one axis.
const BLOCK_X = [[24, 224], [336, 704], [816, 1184], [1296, 1664], [1776, 2144], [2256, 2536]];
const BLOCK_Y = [[24, 144], [256, 504], [616, 864], [976, 1224], [1336, 1584], [1696, 1896]];

// "col,row" of the block grid -> landmark placed there instead of houses.
const LANDMARK_BLOCKS = {
  '0,0': { name: 'marina',    label: 'Marina Quay',    color: '#3f7d8c' },
  '2,0': { name: 'hospital',  label: 'Solara General', color: '#e8e8e8' },
  '1,2': { name: 'police',    label: 'Bay Precinct',   color: '#3a5a8a' },
  '4,3': { name: 'gas',       label: 'Dockside Fuel',  color: '#d88a2a' },
  '5,0': { name: 'club',      label: 'Club Lumen',     color: '#ff2e88' },
  '3,4': { name: 'market',    label: 'Palm Market',    color: '#7a9a4a' },
};

const ROOFS = ['#b98a5e', '#8a9bb0', '#a08a7a', '#7a8a6a', '#c2a878', '#9678a8', '#5e7a8a'];

export function buildCity() {
  const rng = mulberry32(20261123);
  BUILDINGS.length = 0;
  PARKS.length = 0;
  for (const key of Object.keys(LANDMARKS)) delete LANDMARKS[key];

  for (let bi = 0; bi < BLOCK_X.length; bi++) {
    for (let bj = 0; bj < BLOCK_Y.length; bj++) {
      const [x0, x1] = BLOCK_X[bi];
      const [y0, y1] = BLOCK_Y[bj];
      const lm = LANDMARK_BLOCKS[bi + ',' + bj];
      if (lm) {
        const w = Math.min(220, x1 - x0 - 24);
        const h = Math.min(140, y1 - y0 - 24);
        const b = { x: x0 + 12, y: y0 + 12, w, h, hgt: 26, color: lm.color, roof: '#333743', landmark: lm.name };
        BUILDINGS.push(b);
        LANDMARKS[lm.name] = { x: b.x + b.w / 2, y: b.y + b.h / 2, label: lm.label, color: lm.color };
        continue;
      }
      if (rng() < 0.16) {
        const trees = [];
        const n = 5 + randi(rng, 0, 4);
        for (let t = 0; t < n; t++) {
          trees.push({ x: rand(rng, x0 + 14, x1 - 14), y: rand(rng, y0 + 14, y1 - 14), r: rand(rng, 10, 18) });
        }
        PARKS.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees });
        continue;
      }
      const count = 1 + randi(rng, 0, 2);
      for (let k = 0; k < count; k++) {
        const bw = 60 + rng() * 90;
        const bh = 50 + rng() * 80;
        const bx = x0 + 8 + rng() * Math.max(1, x1 - x0 - 16 - bw);
        const by = y0 + 8 + rng() * Math.max(1, y1 - y0 - 16 - bh);
        const rect = { x: bx, y: by, w: bw, h: bh };
        if (BUILDINGS.some((o) => rectsOverlap(o, rect, 6))) continue;
        BUILDINGS.push({
          ...rect,
          hgt: 12 + rng() * 36,
          color: ROOFS[randi(rng, 0, ROOFS.length - 1)],
          roof: '#2f333d',
        });
      }
    }
  }
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function isSolid(x, y, r) {
  if (x < r || y < r || x > CFG.WORLD_W - r || y > CFG.WORLD_H - r) return true;
  for (const b of BUILDINGS) {
    if (circleHitsRect(x, y, r, b)) return true;
  }
  return false;
}

// Closest point on any road centreline, plus that road's travel angle.
export function nearestRoadPoint(x, y) {
  let bestH = ROADS_H[0];
  let bestV = ROADS_V[0];
  for (const h of ROADS_H) if (Math.abs(y - h) < Math.abs(y - bestH)) bestH = h;
  for (const v of ROADS_V) if (Math.abs(x - v) < Math.abs(x - bestV)) bestV = v;
  if (Math.abs(y - bestH) <= Math.abs(x - bestV)) {
    return { x: clamp(x, 0, CFG.WORLD_W), y: bestH, axis: 'h', angle: 0 };
  }
  return { x: bestV, y: clamp(y, 0, CFG.WORLD_H), axis: 'v', angle: Math.PI / 2 };
}

// tod is 0..1 across the day. Returns the screen tint drawn over the world.
export function skyOverlay(tod) {
  if (tod < 0.12) return { color: '255,140,60', alpha: 0.10 }; // dawn
  if (tod < 0.45) return { color: '0,0,0', alpha: 0 };         // day
  if (tod < 0.60) return { color: '255,110,50', alpha: 0.22 }; // dusk
  return { color: '8,14,46', alpha: 0.40 };                    // night
}

export function lampsOn(tod) {
  return tod >= 0.55 || tod < 0.12;
}

export function clockLabel(tod) {
  const mins = Math.floor(tod * 24 * 60);
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return h + ':' + m;
}

function visibleBuildings(cam) {
  const pad = 120;
  return BUILDINGS.filter(
    (b) =>
      b.x + b.w > cam.x - 640 - pad && b.x < cam.x + 640 + pad &&
      b.y + b.h > cam.y - 360 - pad && b.y < cam.y + 360 + pad,
  );
}

export function drawCity(ctx, cam, tod) {
  const vx0 = cam.x - 660;
  const vy0 = cam.y - 380;
  const vx1 = cam.x + 660;
  const vy1 = cam.y + 380;

  // District ground, clipped to the view.
  for (const d of DISTRICTS) {
    if (d.x1 < vx0 || d.x0 > vx1 || d.y1 < vy0 || d.y0 > vy1) continue;
    ctx.fillStyle = d.ground;
    ctx.fillRect(
      Math.max(d.x0, vx0), Math.max(d.y0, vy0),
      Math.min(d.x1, vx1) - Math.max(d.x0, vx0),
      Math.min(d.y1, vy1) - Math.max(d.y0, vy0),
    );
  }

  // Water along the south and east edges of Coral Beach.
  ctx.fillStyle = '#2e7fa3';
  ctx.fillRect(Math.max(vx0, 0), 1880, Math.min(vx1, CFG.WORLD_W) - Math.max(vx0, 0), 40);
  ctx.fillRect(2536, Math.max(vy0, 0), 24, Math.min(vy1, CFG.WORLD_H) - Math.max(vy0, 0));
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = Math.max(vx0, 0); x < Math.min(vx1, CFG.WORLD_W); x += 90) {
    ctx.moveTo(x, 1892);
    ctx.quadraticCurveTo(x + 22, 1886, x + 45, 1892);
  }
  ctx.stroke();

  // Parks and their trees.
  for (const p of PARKS) {
    if (p.x + p.w < vx0 || p.x > vx1 || p.y + p.h < vy0 || p.y > vy1) continue;
    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    for (const t of p.trees) {
      ctx.fillStyle = '#2f5d2a';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a7a38';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Roads: asphalt, sidewalks, centre dashes, crosswalks.
  ctx.fillStyle = '#3c3f46';
  for (const y of ROADS_H) ctx.fillRect(Math.max(vx0, 0), y - ROAD_W / 2, Math.min(vx1, CFG.WORLD_W) - Math.max(vx0, 0), ROAD_W);
  for (const x of ROADS_V) ctx.fillRect(x - ROAD_W / 2, Math.max(vy0, 0), ROAD_W, Math.min(vy1, CFG.WORLD_H) - Math.max(vy0, 0));
  ctx.fillStyle = '#9a9a92';
  for (const y of ROADS_H) {
    ctx.fillRect(Math.max(vx0, 0), y - ROAD_W / 2 - 10, Math.min(vx1, CFG.WORLD_W) - Math.max(vx0, 0), 10);
    ctx.fillRect(Math.max(vx0, 0), y + ROAD_W / 2, Math.min(vx1, CFG.WORLD_W) - Math.max(vx0, 0), 10);
  }
  for (const x of ROADS_V) {
    ctx.fillRect(x - ROAD_W / 2 - 10, Math.max(vy0, 0), 10, Math.min(vy1, CFG.WORLD_H) - Math.max(vy0, 0));
    ctx.fillRect(x + ROAD_W / 2, Math.max(vy0, 0), 10, Math.min(vy1, CFG.WORLD_H) - Math.max(vy0, 0));
  }
  ctx.fillStyle = '#e8d44d';
  for (const y of ROADS_H) {
    for (let x = Math.floor(vx0 / 44) * 44; x < vx1; x += 44) {
      if (ROADS_V.some((v) => Math.abs(x - v) < 60)) continue;
      ctx.fillRect(x, y - 2, 24, 4);
    }
  }
  for (const x of ROADS_V) {
    for (let y = Math.floor(vy0 / 44) * 44; y < vy1; y += 44) {
      if (ROADS_H.some((h) => Math.abs(y - h) < 60)) continue;
      ctx.fillRect(x - 2, y, 4, 24);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const y of ROADS_H) {
    for (const x of ROADS_V) {
      if (x < vx0 - 80 || x > vx1 + 80 || y < vy0 - 80 || y > vy1 + 80) continue;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(x + i * 12 - 4, y - ROAD_W / 2 + 6, 8, 16);
        ctx.fillRect(x + i * 12 - 4, y + ROAD_W / 2 - 22, 8, 16);
      }
    }
  }

  // Buildings, drawn pseudo-3D: shadow, side wall, roof, roof detail.
  const night = lampsOn(tod);
  for (const b of visibleBuildings(cam)) {
    const lift = b.hgt * 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 7, b.y + 7 + lift * 0.4, b.w, b.h);
    ctx.fillStyle = '#23262e';
    ctx.fillRect(b.x, b.y + lift * 0.4, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, b.w * 0.22, b.h * 0.22);
    if (night) {
      ctx.fillStyle = 'rgba(255,220,120,0.85)';
      ctx.fillRect(b.x + 10, b.y + b.h - 12, 8, 6);
      ctx.fillRect(b.x + b.w - 18, b.y + 8, 8, 6);
    }
    if (b.landmark === 'hospital') {
      ctx.fillStyle = '#d21f2b';
      ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 4, 28, 8);
      ctx.fillRect(b.x + b.w / 2 - 4, b.y + b.h / 2 - 14, 8, 28);
    } else if (b.landmark === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', b.x + b.w / 2, b.y + b.h / 2);
    } else if (b.landmark === 'club') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♪', b.x + b.w / 2, b.y + b.h / 2);
    } else if (b.landmark) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.landmark[0].toUpperCase(), b.x + b.w / 2, b.y + b.h / 2);
    }
  }

  // Street lamps at intersections, glowing after dark.
  for (const y of ROADS_H) {
    for (const x of ROADS_V) {
      if (x < vx0 - 40 || x > vx1 + 40 || y < vy0 - 40 || y > vy1 + 40) continue;
      ctx.fillStyle = '#22242a';
      ctx.fillRect(x + ROAD_W / 2 + 2, y - ROAD_W / 2 - 8, 4, 16);
      if (night) {
        ctx.fillStyle = 'rgba(255,214,110,0.20)';
        ctx.beginPath();
        ctx.arc(x + ROAD_W / 2 + 4, y - ROAD_W / 2 - 8, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd66e';
        ctx.beginPath();
        ctx.arc(x + ROAD_W / 2 + 4, y - ROAD_W / 2 - 8, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // District names, faint on the ground.
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of DISTRICTS) {
    const cx = (d.x0 + d.x1) / 2;
    const cy = (d.y0 + d.y1) / 2;
    if (cx < vx0 - 200 || cx > vx1 + 200 || cy < vy0 - 200 || cy > vy1 + 200) continue;
    ctx.fillText(d.name.toUpperCase(), cx, cy);
  }
}
