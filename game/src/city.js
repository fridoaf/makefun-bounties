// Solara Bay itself: the street grid, the six districts, the buildings, the
// parks, the lamps and the named places missions point at. The city is built
// once from a seed, so the same seed always builds the same streets.

import { DISTRICTS, ROADS_H, ROADS_V, ROAD, SAND, WATER, WORLD } from './config.js';
import { clamp, makeRng, pick, range, rangeInt } from './utils.js';

const ROOFS = ['#b0563a', '#7a6a8a', '#4a7a8a', '#8a7a4a', '#5a5a6e', '#a05a6a', '#6a8a5a'];
const WALLS = ['#c9b8a3', '#b8a898', '#a8b0b8', '#c8a890', '#9aa8b0'];
const PARKS = [
  { x: 860, y: 1160, w: 320, h: 240 },
  { x: 1300, y: 1560, w: 300, h: 150 },
  { x: 360, y: 740, w: 300, h: 220 },
];

/** Named places the missions and the HUD point at. All sit on a road edge. */
export const SPOTS = {
  delivery: { x: 780, y: 420, label: 'Harbour Office' },
  club: { x: 1260, y: 900, label: 'Lumen Club' },
  warehouse: { x: 1740, y: 1300, label: 'Warehouse 7' },
  beach: { x: 1400, y: 1760, label: 'Coral Beach' },
  safehouse: { x: 300, y: 1620, label: 'Safehouse' },
  hq: { x: 1740, y: 420, label: 'SBPD HQ' },
  hospital: { x: 1260, y: 280, label: 'Solara General' },
  gas: { x: 780, y: 1480, label: 'Bay Fuel' },
  playerStart: { x: 345, y: 1300, label: 'Palm Heights' },
};

/** Daylight period from the game clock (minutes since midnight). */
export function skyPeriod(minutes) {
  const h = ((minutes % 1440) + 1440) % 1440 / 60;
  if (h >= 5.5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19.5) return 'dusk';
  return 'night';
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];

  // The street grid as block edges, and the margin a building must keep
  // from a road centre (half the road plus the sidewalk, plus a little).
  const xs = [0, ...ROADS_V, WORLD.width];
  const ys = [0, ...ROADS_H, WORLD.height];
  const margin = ROAD.width / 2 + ROAD.walk + 8;

  /** The block (between roads) holding the point, shrunk by the margin. */
  function blockOf(px, py) {
    let x0 = 0;
    let x1 = WORLD.width;
    for (let i = 0; i < xs.length - 1; i += 1) {
      if (px >= xs[i] && px < xs[i + 1]) {
        x0 = xs[i];
        x1 = xs[i + 1];
      }
    }
    let y0 = 0;
    let y1 = WORLD.height;
    for (let j = 0; j < ys.length - 1; j += 1) {
      if (py >= ys[j] && py < ys[j + 1]) {
        y0 = ys[j];
        y1 = ys[j + 1];
      }
    }
    return {
      x: x0 + margin,
      y: y0 + margin,
      w: x1 - x0 - 2 * margin,
      h: y1 - y0 - 2 * margin,
    };
  }

  // Landmark buildings first: each mission place gets a named building in
  // the block just south-east of its road point, tucked against the
  // block's south edge so it never sticks out into a road.
  const landmarks = [
    { spot: 'delivery', w: 150, h: 110, roof: '#3a6a8a', label: 'HARBOUR OFFICE' },
    { spot: 'club', w: 190, h: 130, roof: '#8a2a6a', label: 'LUMEN CLUB' },
    { spot: 'warehouse', w: 210, h: 140, roof: '#6a6a5a', label: 'WAREHOUSE 7' },
    { spot: 'hq', w: 170, h: 120, roof: '#2a4a8a', label: 'SBPD HQ' },
    { spot: 'hospital', w: 180, h: 120, roof: '#e8e8e8', label: 'SOLARA GENERAL' },
    { spot: 'gas', w: 120, h: 90, roof: '#d8a03a', label: 'BAY FUEL' },
    { spot: 'safehouse', w: 110, h: 90, roof: '#7a5a3a', label: 'SAFEHOUSE' },
  ];
  for (const lm of landmarks) {
    const s = SPOTS[lm.spot];
    const block = blockOf(s.x + 80, s.y + 80);
    const w = Math.min(lm.w, block.w - 20);
    const h = Math.min(lm.h, block.h - 20);
    const bx = block.x + 10;
    const by = block.y + block.h - h - 10;
    buildings.push({
      x: bx, y: by, w, h, height: 22,
      roof: lm.roof, wall: '#c9b8a3', label: lm.label, landmark: true,
    });
  }

  // Fill every block between two roads with one to three buildings, or a
  // parking lot. Blocks are the rectangles the grid leaves open.
  for (let bi = 0; bi < xs.length - 1; bi += 1) {
    for (let bj = 0; bj < ys.length - 1; bj += 1) {
      const bx0 = xs[bi] + margin;
      const bx1 = xs[bi + 1] - margin;
      const by0 = ys[bj] + margin;
      const by1 = ys[bj + 1] - margin;
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 90 || bh < 80) continue;
      // Skip the harbour water and the beach sand.
      if (bx0 < WATER.w && by0 < WATER.h) continue;
      if (by0 > SAND.y - 40) continue;
      const roll = rng();
      if (roll < 0.10) {
        // Parking lot: a few parked cars live here (spawned by traffic).
        buildings.push({ x: bx0, y: by0, w: bw, h: bh, parking: true });
        continue;
      }
      if (roll < 0.18) continue; // empty lot, a breather between blocks
      // One building per cell of a small grid inside the block, so the city
      // reads dense instead of leaving big empty lawns.
      const cols = bw > 300 ? 2 : 1;
      const rows = bh > 260 ? 2 : 1;
      for (let ci = 0; ci < cols; ci += 1) {
        for (let cj = 0; cj < rows; cj += 1) {
          if (rng() < 0.12) continue; // an occasional empty cell
          const cw = bw / cols;
          const ch = bh / rows;
          const w = range(rng, 70, Math.min(150, cw - 24));
          const h = range(rng, 60, Math.min(120, ch - 24));
          const x = bx0 + ci * cw + range(rng, 6, Math.max(6, cw - w - 6));
          const y = by0 + cj * ch + range(rng, 6, Math.max(6, ch - h - 6));
          const rect = { x, y, w, h };
          if (buildings.some((b) => !b.parking && rectsHit(b, rect, 10))) continue;
          buildings.push({
            x, y, w, h,
            height: range(rng, 10, 30),
            roof: pick(rng, ROOFS),
            wall: pick(rng, WALLS),
            label: '',
            landmark: false,
          });
        }
      }
    }
  }

  // Trees in the parks and a palm line along the beach.
  for (const p of PARKS) {
    const n = Math.floor((p.w * p.h) / 9000);
    for (let i = 0; i < n; i += 1) {
      trees.push({ x: range(rng, p.x + 16, p.x + p.w - 16), y: range(rng, p.y + 16, p.y + p.h - 16), r: range(rng, 9, 15), palm: rng() < 0.4 });
    }
  }
  for (let x = 120; x < WORLD.width - 60; x += 130) {
    trees.push({ x: x + range(rng, -20, 20), y: SAND.y + 34 + range(rng, -6, 26), r: range(rng, 10, 14), palm: true });
  }

  // Street lamps along every road, on the sidewalk edge.
  for (const x of ROADS_V) {
    for (let y = 120; y < WORLD.height - 60; y += 230) {
      lamps.push({ x: x + ROAD.width / 2 + ROAD.walk - 4, y });
    }
  }
  for (const y of ROADS_H) {
    for (let x = 120; x < WORLD.width - 60; x += 230) {
      lamps.push({ x, y: y + ROAD.width / 2 + ROAD.walk - 4 });
    }
  }

  const intersections = [];
  for (const x of ROADS_V) for (const y of ROADS_H) intersections.push({ x, y });

  return { buildings, trees, lamps, parks: PARKS, intersections, seed };
}

function rectsHit(a, b, pad) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

/** True when the point is on asphalt (a road or the beach road). */
export function isOnRoad(city, x, y) {
  for (const rx of ROADS_V) if (Math.abs(x - rx) <= ROAD.width / 2) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) <= ROAD.width / 2) return true;
  return false;
}

/** True when the point is inside a building or the harbour water. */
export function isBlocked(city, x, y) {
  if (x >= WATER.x && x <= WATER.x + WATER.w && y >= WATER.y && y <= WATER.y + WATER.h) return true;
  for (const b of city.buildings) {
    if (b.parking) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/**
 * Push a circle out of every building it overlaps. Returns the total push
 * and whether anything was hit, so callers can spark and thud.
 */
export function collideCircle(city, x, y, r) {
  let px = 0;
  let py = 0;
  let hit = false;
  for (const b of city.buildings) {
    if (b.parking) continue;
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 === 0) {
      py -= r;
      continue;
    }
    const d = Math.sqrt(d2);
    px += (dx / d) * (r - d);
    py += (dy / d) * (r - d);
  }
  // Harbour water is a wall too.
  if (x > WATER.x - r && x < WATER.x + WATER.w + r && y > WATER.y - r && y < WATER.y + WATER.h + r) {
    hit = true;
    const left = x - (WATER.x - r);
    const right = WATER.x + WATER.w + r - x;
    const top = y - (WATER.y - r);
    const bottom = WATER.y + WATER.h + r - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) px -= left;
    else if (m === right) px += right;
    else if (m === top) py -= top;
    else py += bottom;
  }
  return { x: px, y: py, hit };
}

/** The nearest point on any road centre line. */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) {
      bestD = d;
      best = { x: rx, y: clamp(y, 0, WORLD.height) };
    }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) {
      bestD = d;
      best = { x: clamp(x, 0, WORLD.width), y: ry };
    }
  }
  return best;
}

/** A random road point at least `minAway` from (x, y), for spawning cops. */
export function randomRoadPoint(rng, x, y, minAway) {
  for (let tries = 0; tries < 24; tries += 1) {
    const vertical = rng() < 0.5;
    const p = vertical
      ? { x: pick(rng, ROADS_V), y: range(rng, 60, WORLD.height - 60) }
      : { x: range(rng, 60, WORLD.width - 60), y: pick(rng, ROADS_H) };
    if (Math.hypot(p.x - x, p.y - y) >= minAway) return p;
  }
  return { x: ROADS_V[2], y: ROADS_H[1] };
}

// ---------------------------------------------------------------- drawing

export function drawGround(ctx, city, camera, period) {
  const { x: cx, y: cy, zoom } = camera;
  const vw = 1280 / zoom;
  const vh = 720 / zoom;
  const x0 = cx - vw / 2;
  const y0 = cy - vh / 2;

  ctx.fillStyle = '#6f8f5f';
  ctx.fillRect(x0, y0, vw, vh);

  // District wash, so each part of town reads differently at a glance.
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.tint;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
  ctx.restore();

  // Harbour water with a couple of wave lines.
  ctx.fillStyle = '#2f6f8f';
  ctx.fillRect(WATER.x, WATER.y, WATER.w, WATER.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(WATER.x + 30, WATER.y + 28 + i * 30);
    ctx.quadraticCurveTo(WATER.x + 200, WATER.y + 18 + i * 30, WATER.x + 380, WATER.y + 28 + i * 30);
    ctx.stroke();
  }
  // Piers.
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(120, WATER.h - 10, 26, 70);
  ctx.fillRect(420, WATER.h - 10, 26, 70);

  // Beach sand and the water line at the bottom edge.
  ctx.fillStyle = '#e8d28a';
  ctx.fillRect(SAND.x, SAND.y, SAND.w, SAND.h);
  ctx.fillStyle = '#2f7f9f';
  ctx.fillRect(0, WORLD.height - 18, WORLD.width, 18);

  // Parks.
  for (const p of city.parks) {
    ctx.fillStyle = '#4f8a4a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  // Sidewalks, then asphalt, then markings.
  ctx.fillStyle = '#9aa0a8';
  for (const rx of ROADS_V) ctx.fillRect(rx - ROAD.width / 2 - ROAD.walk, 0, ROAD.width + ROAD.walk * 2, WORLD.height);
  for (const ry of ROADS_H) ctx.fillRect(0, ry - ROAD.width / 2 - ROAD.walk, WORLD.width, ROAD.width + ROAD.walk * 2);
  ctx.fillStyle = '#33373d';
  for (const rx of ROADS_V) ctx.fillRect(rx - ROAD.width / 2, 0, ROAD.width, WORLD.height);
  for (const ry of ROADS_H) ctx.fillRect(0, ry - ROAD.width / 2, ROAD.width, WORLD.width);

  // Centre dashes.
  ctx.fillStyle = '#e8d24a';
  for (const rx of ROADS_V) {
    for (let y = 20; y < WORLD.height; y += 64) ctx.fillRect(rx - 2, y, 4, 30);
  }
  for (const ry of ROADS_H) {
    for (let x = 20; x < WORLD.width; x += 64) ctx.fillRect(x, ry - 2, 30, 4);
  }

  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const p of city.intersections) {
    for (let i = -3; i <= 3; i += 1) {
      ctx.fillRect(p.x - ROAD.width / 2 - 6 + i * 10, p.y - ROAD.width / 2 - 14, 5, 10);
      ctx.fillRect(p.x - ROAD.width / 2 - 6 + i * 10, p.y + ROAD.width / 2 + 4, 5, 10);
    }
  }

  // District names painted on the ground, big enough to read in a screenshot.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (const d of DISTRICTS) {
    ctx.fillText(d.name.toUpperCase(), d.x + d.w / 2, d.y + d.h / 2);
  }
  ctx.restore();

  // Trees.
  for (const t of city.trees) {
    if (t.x < x0 - 40 || t.x > x0 + vw + 40 || t.y < y0 - 40 || t.y > y0 + vh + 40) continue;
    ctx.fillStyle = '#2f6a2f';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a8a3a';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lamps: post + head; the glow itself is drawn after the wash.
  ctx.fillStyle = '#3a3f46';
  for (const l of city.lamps) {
    if (l.x < x0 - 20 || l.x > x0 + vw + 20 || l.y < y0 - 20 || l.y > y0 + vh + 20) continue;
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  }
}

/** Pseudo-3D buildings: shadow, lit roof, shaded walls, lit windows at night. */
export function drawBuildings(ctx, city, camera, period) {
  const { x: cx, y: cy, zoom } = camera;
  const vw = 1280 / zoom;
  const vh = 720 / zoom;
  const x0 = cx - vw / 2;
  const y0 = cy - vh / 2;
  const night = period === 'night' || period === 'dusk';

  const visible = city.buildings.filter(
    (b) => b.x + b.w > x0 - 60 && b.x < x0 + vw + 60 && b.y + b.h > y0 - 60 && b.y < y0 + vh + 60,
  );
  visible.sort((a, b) => a.y - b.y);

  for (const b of visible) {
    if (b.parking) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const px = b.x + 14 + i * ((b.w - 28) / 3);
        ctx.strokeRect(px, b.y + 12, (b.w - 28) / 3 - 8, 26);
      }
      continue;
    }
    const h = b.height;
    const ox = -h * 0.45;
    const oy = -h * 0.85;
    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + b.h - 4, b.w, 10);
    // Walls: the south face and the east face catch different light.
    ctx.fillStyle = shade(b.wall, -28);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + ox, b.y + b.h + oy);
    ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(b.wall, -52);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w + ox, b.y + oy);
    ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    // Roof.
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(b.x + ox, b.y + oy);
    ctx.lineTo(b.x + b.w + ox, b.y + oy);
    ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
    ctx.lineTo(b.x + ox, b.y + b.h + oy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Rooftop detail: a few lit windows at night, vents by day.
    if (night) {
      ctx.fillStyle = 'rgba(255, 214, 110, 0.9)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 13 + b.x) % 3 !== 0) continue;
          ctx.fillRect(b.x + ox + 10 + i * 34, b.y + oy + 10 + j * 34, 12, 9);
        }
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + ox + b.w * 0.2, b.y + oy + b.h * 0.25, 14, 10);
      ctx.fillRect(b.x + ox + b.w * 0.65, b.y + oy + b.h * 0.6, 14, 10);
    }
    // Landmark label on the roof.
    if (b.label) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(b.label, b.x + b.w / 2 + ox, b.y + b.h / 2 + oy);
      ctx.restore();
    }
  }
}

/** Lamp glow pools, drawn after the dusk/night wash. */
export function drawLampGlow(ctx, city, camera) {
  const { x: cx, y: cy, zoom } = camera;
  const vw = 1280 / zoom;
  const vh = 720 / zoom;
  const x0 = cx - vw / 2;
  const y0 = cy - vh / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of city.lamps) {
    if (l.x < x0 - 60 || l.x > x0 + vw + 60 || l.y < y0 - 60 || l.y > y0 + vh + 60) continue;
    const g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 46);
    g.addColorStop(0, 'rgba(255, 214, 120, 0.30)');
    g.addColorStop(1, 'rgba(255, 214, 120, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 46, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Darken or lighten a #rrggbb colour by `amt`. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
