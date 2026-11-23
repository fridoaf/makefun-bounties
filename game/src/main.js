// Ember Pact — the bootstrap.
// One file, one job: own the current duel, wire state + render + input, and
// stage each round's reveal (flip, then result, then next round).
// `?shot=title|play|win|loss` jumps straight to a finished frame so the
// screenshots show the real game in each of its states.

import { createGame, startGame, playRound, advanceAfterReveal, mulligan, presetMidGame, presetEnd } from './state.js';
import { buildShell, renderTable, renderTitle, renderEnd, clearOverlay } from './render.js';
import { bindInput } from './input.js';
import { sfx, toggleMute, isMuted } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const shotMode = shot === 'title' || shot === 'play' || shot === 'win' || shot === 'loss';

let game = createGame();
let selected = null;
let revealStage = 'none'; // none | hidden | shown | done
let revealTimer = null;

const ui = {
  get selected() {
    return selected;
  },
  get revealStage() {
    return revealStage;
  },
  onPick(i) {
    if (game.phase !== 'play' || i < 0 || i >= game.yourHand.length) return;
    if (selected === i) {
      // A second click on the selected card plays it at once.
      this.onConfirm();
      return;
    }
    selected = i;
    sfx.click();
    renderTable(game, ui);
  },
  onConfirm() {
    if (game.phase !== 'play' || selected == null) return;
    const result = playRound(game, selected);
    selected = null;
    if (!result) return;
    sfx.deal();
    revealStage = 'hidden';
    renderTable(game, ui);
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      revealStage = 'shown';
      sfx.flip();
      renderTable(game, ui);
    }, 650);
    revealTimer = setTimeout(() => {
      revealStage = 'done';
      if (result.winner === 'you') sfx.winRound();
      else if (result.winner === 'foe') sfx.loseRound();
      renderTable(game, ui);
    }, 1350);
    revealTimer = setTimeout(() => {
      advanceAfterReveal(game);
      revealStage = 'none';
      renderTable(game, ui);
      if (game.phase === 'won') {
        sfx.winGame();
        renderEnd(game, ui);
      } else if (game.phase === 'lost') {
        sfx.loseGame();
        renderEnd(game, ui);
      }
    }, 2600);
  },
  onMulligan() {
    if (mulligan(game)) {
      sfx.deal();
      selected = null;
      renderTable(game, ui);
    }
  },
  onStart() {
    clearTimeout(revealTimer);
    game = startGame(createGame());
    selected = null;
    revealStage = 'none';
    sfx.deal();
    clearOverlay();
    renderTable(game, ui);
  },
  onTitle() {
    clearTimeout(revealTimer);
    game = createGame();
    selected = null;
    revealStage = 'none';
    renderTable(game, ui);
    renderTitle(ui);
  },
  onMute() {
    const nowMuted = toggleMute();
    const btn = document.getElementById('mute-btn');
    if (btn) btn.textContent = nowMuted ? '🔇 Sound off' : '🔊 Sound on';
  },
};

buildShell();
bindInput(ui);

if (shotMode) {
  document.body.classList.add('no-anim');
  if (shot === 'title') {
    renderTable(game, ui);
    renderTitle(ui);
  } else if (shot === 'play') {
    game = presetMidGame();
    revealStage = 'done';
    renderTable(game, ui);
  } else {
    game = presetEnd(shot === 'win');
    revealStage = 'done';
    renderTable(game, ui);
    renderEnd(game, ui);
  }
} else {
  renderTable(game, ui);
  renderTitle(ui);
}
