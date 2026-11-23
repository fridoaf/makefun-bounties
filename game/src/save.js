// Save and load, in the browser's localStorage only. The save holds Mara's
// money, which jobs are done, which packages she found, the clock, and where
// she was standing — never the world itself, which rebuilds from its seed.

import { SAVE_KEY } from './config.js';

export function saveGame(game) {
  try {
    const data = {
      cash: Math.floor(game.cash),
      hp: Math.round(game.player.hp),
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      clockMin: Math.floor(game.clockMin),
      missionsDone: game.missions.done,
      packagesTaken: game.missions.packages.map((p) => p.taken),
      storyDone: game.missions.storyDone,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Private windows and full storage: the save just does not stick.
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || !Array.isArray(data.missionsDone)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
