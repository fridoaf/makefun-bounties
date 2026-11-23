// Solara Bay — save / load through localStorage.
// A save is browser state, never a file in the repo.

import { CFG } from './config.js';
import { PACKAGES } from './missions.js';

export function hasSave() {
  try {
    return !!localStorage.getItem(CFG.SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(game) {
  try {
    const data = {
      money: game.player.money,
      hp: game.player.hp,
      x: game.player.x,
      y: game.player.y,
      missionIdx: game.missions.idx,
      missionStep: game.missions.step,
      storyDone: game.missions.storyDone,
      packagesFound: game.missions.packagesFound,
      packagesTaken: PACKAGES.map((p) => p.taken),
      tod: game.tod,
      savedAt: Date.now(),
    };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function applySave(game, data) {
  if (!data) return false;
  game.player.money = data.money || 0;
  game.player.hp = data.hp || CFG.PLAYER_HP;
  game.player.x = data.x || CFG.START_X;
  game.player.y = data.y || CFG.START_Y;
  game.missions.idx = data.missionIdx || 0;
  game.missions.step = data.missionStep || 0;
  game.missions.storyDone = !!data.storyDone;
  game.missions.packagesFound = data.packagesFound || 0;
  if (Array.isArray(data.packagesTaken)) {
    data.packagesTaken.forEach((taken, i) => {
      if (PACKAGES[i]) PACKAGES[i].taken = !!taken;
    });
  }
  game.tod = typeof data.tod === 'number' ? data.tod : 0.3;
  game.missions.active = false;
  game.missions.fightSpawned = false;
  return true;
}

export function clearSave() {
  try {
    localStorage.removeItem(CFG.SAVE_KEY);
  } catch {
    // ignore
  }
}
