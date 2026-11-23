// Solara Bay — every tuning number in one place, so balance lives here and
// nowhere else. The world is a fixed 2560x1920 logical map; the renderer
// scales the 1280x720 view to the window, so no rule below depends on screen size.

export const WORLD = { width: 2560, height: 1920 };
export const VIEW = { width: 1280, height: 720 };

/** Fixed simulation step, seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

export const ROAD = { width: 66, walk: 16 };

// Vertical roads (x) and horizontal roads (y) of the street grid.
export const ROADS_V = [300, 780, 1260, 1740, 2220];
export const ROADS_H = [280, 680, 1080, 1480, 1760];

// Six districts, as rectangles over the map. The beach is the strip along the
// south edge; the harbour water sits in the north-west corner.
export const DISTRICTS = [
  { name: 'Marina Quay', x: 0, y: 0, w: 780, h: 680, tint: '#7fb3c8' },
  { name: 'Old Coral', x: 1740, y: 0, w: 820, h: 680, tint: '#c8a06a' },
  { name: 'Neon Row', x: 780, y: 680, w: 960, h: 400, tint: '#c86ad8' },
  { name: 'Palm Heights', x: 0, y: 1080, w: 780, h: 680, tint: '#8fc86a' },
  { name: 'Dockside', x: 1740, y: 1080, w: 820, h: 680, tint: '#9aa3ad' },
  { name: 'Coral Beach', x: 0, y: 1480, w: 2560, h: 440, tint: '#e8d28a' },
];

export const WATER = { x: 0, y: 0, w: 700, h: 150 };
export const SAND = { x: 0, y: 1796, w: 2560, h: 124 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  punchRange: 46,
  punchArc: 1.15,
  punchDamage: 22,
  punchCooldown: 0.42,
  maxHp: 100,
  hpRegen: 2.2,
};

// Arcade car types: top speed, acceleration, steering bite, and how much
// grip the handbrake keeps. Names and colours are the game's own.
export const CAR_TYPES = {
  hatch: { label: 'Pico Hatch', top: 300, accel: 330, steer: 2.6, grip: 5.2, color: '#5fb2e8', len: 52, wid: 26 },
  sedan: { label: 'Meridian Sedan', top: 350, accel: 380, steer: 2.5, grip: 5.6, color: '#c94f4f', len: 58, wid: 27 },
  taxi: { label: 'Bay Taxi', top: 330, accel: 360, steer: 2.5, grip: 5.4, color: '#f2c230', len: 56, wid: 27 },
  van: { label: 'Dock Van', top: 265, accel: 280, steer: 2.1, grip: 4.6, color: '#8d97a3', len: 66, wid: 30 },
  sport: { label: 'Vesper GT', top: 470, accel: 520, steer: 3.0, grip: 6.4, color: '#e83a7d', len: 56, wid: 27 },
  truck: { label: 'Haul Truck', top: 235, accel: 240, steer: 1.8, grip: 4.2, color: '#4f8a5f', len: 78, wid: 32 },
  patrol: { label: 'SBPD Patrol', top: 420, accel: 470, steer: 2.9, grip: 6.0, color: '#2f6fd0', len: 58, wid: 27 },
};

export const WANTED = {
  max: 5,
  // Seconds hidden from every cop before one star fades.
  hideSeconds: 14,
  fadeEvery: 7,
  // How far a cop can see the player, by wanted level.
  sight: [0, 420, 520, 640, 780, 940],
  policeCars: [0, 1, 2, 2, 3, 4],
  footCops: [0, 1, 1, 2, 2, 3],
};

export const MISSION_REWARDS = [250, 400, 500, 650, 1000];
export const PACKAGE_REWARD = 100;
export const PACKAGE_COUNT = 8;

export const SAVE_KEY = 'solara-bay.save.v1';

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

// Daylight palettes, blended by the clock. Each entry: ground, road, roof
// tint multiplier, sky wash over the scene, lamp glow on/off.
export const SKY = {
  dawn: { wash: 'rgba(255, 150, 110, 0.10)', lamp: false, shade: 0.12 },
  day: { wash: 'rgba(255, 244, 214, 0.05)', lamp: false, shade: 0 },
  dusk: { wash: 'rgba(255, 110, 60, 0.22)', lamp: true, shade: 0.16 },
  night: { wash: 'rgba(8, 14, 46, 0.48)', lamp: true, shade: 0.3 },
};

/** Game clock: 1 real second = 1 game minute. Start mid-morning. */
export const CLOCK_START_MINUTES = 9 * 60 + 35;
