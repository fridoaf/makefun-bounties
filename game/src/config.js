// Solara Bay — tuning numbers and static world tables.
// Nothing in this file moves or draws; it only answers "how big, how fast,
// where is what" for the rest of the game.

export const CFG = {
  WORLD_W: 2560,
  WORLD_H: 1920,
  VIEW_W: 1280,
  VIEW_H: 720,
  WALK_SPEED: 210,
  RUN_SPEED: 330,
  DAY_SECONDS: 360, // one full day/night cycle, in seconds of play
  PLAYER_HP: 100,
  SAVE_KEY: 'solara-bay-save-v1',
  START_X: 1240,
  START_Y: 920,
};

// Six districts, each a rectangle of the map with its own ground colour.
// The layout is a 3 x 2 grid; the order here is the order the minimap reads.
export const DISTRICTS = [
  { name: 'Marina Quay',  x0: 0,    y0: 0,   x1: 853,  y1: 960,  ground: '#b3a37e', tint: '#3f7d8c' },
  { name: 'Old Coral',    x0: 853,  y0: 0,   x1: 1707, y1: 960,  ground: '#a89a7c', tint: '#a4552f' },
  { name: 'Neon Row',     x0: 1707, y0: 0,   x1: 2560, y1: 960,  ground: '#8d89a8', tint: '#ff2e88' },
  { name: 'Dockside',     x0: 0,    y0: 960, x1: 853,  y1: 1920, ground: '#948c81', tint: '#c77b21' },
  { name: 'Palm Heights', x0: 853,  y0: 960, x1: 1707, y1: 1920, ground: '#9db384', tint: '#4d7a3a' },
  { name: 'Coral Beach',  x0: 1707, y0: 960, x1: 2560, y1: 1920, ground: '#dfc389', tint: '#2e8fa3' },
];

// The car roster. Every name, colour and handling figure is invented here.
export const CAR_TYPES = {
  hatch:  { name: 'Pipit Hatch',  top: 300, accel: 430, grip: 3.4, color: '#4da3ff', w: 42, l: 72 },
  sedan:  { name: 'Coral Sedan',  top: 350, accel: 460, grip: 3.1, color: '#c94f4f', w: 44, l: 80 },
  taxi:   { name: 'Bay Taxi',     top: 330, accel: 450, grip: 3.1, color: '#f2c230', w: 44, l: 80 },
  van:    { name: 'Dock Van',     top: 270, accel: 360, grip: 2.6, color: '#e8e4da', w: 48, l: 92 },
  sport:  { name: 'Vela GT',      top: 520, accel: 640, grip: 3.8, color: '#ff2e88', w: 44, l: 82 },
  truck:  { name: 'Harbor Truck', top: 250, accel: 330, grip: 2.4, color: '#7a8a99', w: 50, l: 104 },
  police: { name: 'Bay Patrol',   top: 470, accel: 590, grip: 3.6, color: '#2e4a7a', w: 46, l: 84 },
};

export const HEAT_PER_STAR = 20;
export const MAX_WANTED = 5;
