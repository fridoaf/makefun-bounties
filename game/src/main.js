// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The screens are
// title, playing, paused, busted, wasted and the story-done card.
//
// ?shot=cover|drive|foot|night (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady.

import { STEP } from './config.js';
import { createGame, drawGame, stepGame } from './state.js';
import { createInput, makeScriptedInput } from './input.js';
import { drawEnd, drawPaused, drawStoryDone, drawTitle } from './hud.js';
import { stageShot } from './shots.js';
import { clearSave, loadSave } from './save.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
canvas.width = 1280;
canvas.height = 720;
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const game = stageShot(name, seed);
  window.__game = game; // play-test hook: the console can inspect the scene
  let painted = 0;
  function paint() {
    drawGame(ctx, game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let game = createGame(seed);
  window.__game = game; // play-test hook: the console can inspect the game
  let screen = 'title';
  let storyShown = false;
  let accumulator = 0;
  let last = performance.now();

  function startFresh() {
    clearSave();
    game = createGame(seed);
    window.__game = game;
    screen = 'playing';
    storyShown = false;
    announce('New game. Mara Voss owes the Kess syndicate. Find the yellow marker for your first job.');
  }

  function startContinuing() {
    game = createGame(seed, loadSave());
    window.__game = game;
    screen = 'playing';
    storyShown = false;
    announce('Continuing Mara\'s story.');
  }

  function retry() {
    const save = loadSave();
    game = createGame(seed, save);
    window.__game = game;
    screen = 'playing';
    storyShown = false;
    announce('Back on the streets. The job is still waiting.');
  }

  function handleKeys() {
    if (input.wasPressed('mute')) {
      const muted = game.audio.toggleMute();
      game.notify(muted ? 'Sound muted (M to unmute)' : 'Sound on');
    }
    if (screen === 'title') {
      if (input.wasPressed('confirm') || input.takeClick()) {
        if (game.save) startContinuing();
        else startFresh();
      }
      return;
    }
    if (screen === 'playing') {
      if (input.wasPressed('pause')) {
        screen = 'paused';
        announce('Paused.');
      }
      return;
    }
    if (screen === 'paused') {
      if (input.wasPressed('pause') || input.wasPressed('confirm')) {
        screen = 'playing';
        announce('Playing.');
      }
      return;
    }
    if (screen === 'busted' || screen === 'wasted') {
      if (input.wasPressed('confirm')) retry();
      return;
    }
    if (screen === 'story') {
      if (input.wasPressed('confirm')) {
        storyShown = true;
        screen = 'playing';
      }
    }
  }

  // N on the title screen starts over, wiping the save. (Kept quiet: the
  // title offers Continue / New game through Enter; N is a shortcut.)
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && screen === 'title') startFresh();
  });

  // The title's attract mode steps the city with no hands on the keys, so
  // Mara never wanders off or starts a job behind the menu.
  const quietInput = makeScriptedInput();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleKeys();
    if (screen === 'title') {
      // Attract mode: the city lives behind the title.
      while (accumulator >= STEP) {
        stepGame(game, quietInput, STEP);
        accumulator -= STEP;
      }
      drawGame(ctx, game);
      drawTitle(ctx, game);
    } else if (screen === 'playing') {
      while (accumulator >= STEP) {
        stepGame(game, input, STEP);
        accumulator -= STEP;
        if (game.busted) {
          screen = 'busted';
          announce('Busted. The SBPD caught Mara.');
          break;
        }
        if (game.wasted) {
          screen = 'wasted';
          announce('Wasted. Mara went down.');
          break;
        }
        if (game.missions.storyDone && !storyShown) {
          screen = 'story';
          break;
        }
      }
      drawGame(ctx, game);
      if (screen === 'story') drawStoryDone(ctx, game);
    } else if (screen === 'paused') {
      accumulator = 0;
      drawGame(ctx, game);
      drawPaused(ctx);
    } else if (screen === 'busted' || screen === 'wasted') {
      accumulator = 0;
      drawGame(ctx, game);
      drawEnd(ctx, game, screen);
    }
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'playing') {
      screen = 'paused';
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
