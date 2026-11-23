// Ember Pact — everything the player sees.
// One file, one job: turn game state into DOM. It never changes the rules;
// state.js owns the duel, this file only draws it.

import { SUITS, START_LIFE } from './rules.js';
import { taunt } from './ai.js';

const $ = (sel) => document.querySelector(sel);

/** One face-up card element. */
export function cardElement(card, { playable = false, selected = false, winner = false, loser = false } = {}) {
  const suit = SUITS[card.suit];
  const el = document.createElement('div');
  el.className = 'card' + (playable ? ' playable' : '') + (selected ? ' selected' : '') + (winner ? ' winner' : '') + (loser ? ' loser' : '');
  el.style.setProperty('--suit', suit.color);
  el.innerHTML =
    `<div class="power">${card.power}<small> /9</small></div>` +
    `<div class="glyph">${suit.glyph}</div>` +
    `<div class="suitname">${suit.name}</div>` +
    `<div class="corner">${card.power}</div>`;
  el.setAttribute('aria-label', `${suit.name} ${card.power}`);
  return el;
}

/** One face-down card back. */
export function cardBackElement() {
  const el = document.createElement('div');
  el.className = 'card back';
  el.innerHTML = '<span class="mini">🔥</span>';
  el.setAttribute('aria-label', 'face-down card');
  return el;
}

/** A card that flips from its back to its face. */
export function flipCardElement(card) {
  const wrap = document.createElement('div');
  wrap.className = 'flip';
  wrap.innerHTML = '<div class="inner"></div>';
  const inner = wrap.firstChild;
  const back = cardBackElement();
  back.classList.add('face');
  const front = cardElement(card);
  front.classList.add('face', 'front');
  inner.append(back, front);
  return wrap;
}

export function lifeBar(life, you) {
  const pct = Math.max(0, Math.min(100, (life / START_LIFE) * 100));
  return `<div class="lifebar${you ? ' you' : ''}"><div class="fill" style="width:${pct}%"></div><span>${life} / ${START_LIFE} ♥</span></div>`;
}

/** The static table shell; renderTable fills it per state. */
export function buildShell() {
  document.getElementById('app').innerHTML = `
    <header>
      <div class="brand">EMBER PACT <small>· DUEL OF THE FOUR SUITS</small></div>
      <div class="meta" id="round-meta"></div>
      <div class="spacer"></div>
      <button id="mute-btn" type="button">🔊 Sound on</button>
      <button id="quit-btn" type="button">Title screen</button>
    </header>
    <div id="table">
      <div id="board">
        <div class="player-row" id="foe-row"></div>
        <div id="arena"></div>
        <div id="result-banner"></div>
        <div class="player-row" id="you-row"></div>
        <div id="controls"></div>
      </div>
      <aside id="log-panel">
        <h2>THE PACT</h2>
        <div class="cycle">🔥 Ember beats 🌿 Thorn<br>🌿 Thorn beats 💧 Tide<br>💧 Tide beats 🔥 Ember<br>🪨 Stone fears nothing.<br><b>Advantage: +3 power.</b><br><b>Pact:</b> win twice in a row with the same suit: +2 damage, +1 life.</div>
        <h2>DUEL LOG</h2>
        <ul id="log-list"></ul>
      </aside>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
    <div id="overlay-root"></div>`;
}

/** Draw the whole table for the current state. */
export function renderTable(game, ui) {
  $('#round-meta').textContent = `Round ${game.round + 1}  ·  Deck ${game.deck.length} cards  ·  Discard ${game.discard.length}`;

  const foeRow = $('#foe-row');
  foeRow.innerHTML = '';
  const foeWho = document.createElement('div');
  foeWho.className = 'who';
  foeWho.innerHTML = '<div class="name">🧙 The Warden</div><div class="sub">Keeper of the Last Ember</div>';
  const foeHand = document.createElement('div');
  foeHand.className = 'hand';
  game.foeHand.forEach(() => foeHand.append(cardBackElement()));
  const foeLife = document.createElement('div');
  foeLife.innerHTML = lifeBar(game.foeLife, false);
  foeRow.append(foeWho, foeHand, foeLife);

  const youRow = $('#you-row');
  youRow.innerHTML = '';
  const youLife = document.createElement('div');
  youLife.innerHTML = lifeBar(game.yourLife, true);
  const yourHand = document.createElement('div');
  yourHand.className = 'hand';
  game.yourHand.forEach((card, i) => {
    const el = cardElement(card, { playable: game.phase === 'play', selected: ui.selected === i });
    el.dataset.index = i;
    el.addEventListener('click', () => ui.onPick(i));
    yourHand.append(el);
  });
  const youWho = document.createElement('div');
  youWho.className = 'who you';
  youWho.innerHTML = '<div class="name">You</div><div class="sub">Challenger of the Pact</div>';
  youRow.append(youLife, yourHand, youWho);

  renderArena(game, ui);
  renderLog(game);

  const controls = $('#controls');
  controls.innerHTML = '';
  const mulligan = document.createElement('button');
  mulligan.type = 'button';
  mulligan.textContent = game.mulliganUsed ? 'Mulligan used' : '🔄 Mulligan (M) — redraw hand';
  mulligan.disabled = game.mulliganUsed || game.phase !== 'play';
  mulligan.addEventListener('click', () => ui.onMulligan());
  const play = document.createElement('button');
  play.type = 'button';
  play.textContent = ui.selected == null ? 'Pick a card (keys 1–5)' : `⚔ Play ${describeCard(game.yourHand[ui.selected])} (Enter)`;
  play.disabled = ui.selected == null || game.phase !== 'play';
  play.addEventListener('click', () => ui.onConfirm());
  const hint = document.createElement('span');
  hint.id = 'hint';
  hint.textContent = 'Click a card to select it, click again to play — or press 1–5 then Enter. R restarts, Esc quits to title.';
  controls.append(mulligan, play, hint);

  const status = $('#status');
  if (status) status.textContent = `Your life ${game.yourLife}, Warden life ${game.foeLife}, round ${game.round + 1}.`;
}

/** The middle of the table: the two played cards and the result line. */
export function renderArena(game, ui) {
  const arena = $('#arena');
  arena.innerHTML = '';
  const banner = $('#result-banner');
  banner.textContent = '';
  banner.className = '';

  const foeSlot = document.createElement('div');
  foeSlot.className = 'played';
  foeSlot.innerHTML = '<div class="tag">WARDEN</div>';
  const youSlot = document.createElement('div');
  youSlot.className = 'played';
  youSlot.innerHTML = '<div class="tag">YOU</div>';
  const vs = document.createElement('div');
  vs.className = 'vs';
  vs.textContent = 'VS';

  const r = game.lastRound;
  if (game.phase === 'play' || !r) {
    foeSlot.append(emptySlot('The Warden waits…'));
    youSlot.append(emptySlot('Choose a card from your hand.'));
  } else {
    const foeFlip = flipCardElement(r.foeCard);
    const youCard = cardElement(r.yourCard, {
      winner: r.winner === 'you',
      loser: r.winner === 'foe',
    });
    if (r.winner === 'foe') {
      foeFlip.querySelector('.front').classList.add('winner');
    } else if (r.winner === 'you') {
      foeFlip.querySelector('.front').classList.add('loser');
    }
    foeSlot.append(foeFlip);
    youSlot.append(youCard);
    if (ui.revealStage === 'hidden') {
      // Foe card still face-down while the Warden "thinks".
    } else {
      foeFlip.classList.add('flipped');
    }
    if (ui.revealStage === 'done') {
      const text =
        r.winner === 'tie'
          ? `Tie — ${r.yourPower} vs ${r.foePower}. No damage.`
          : r.winner === 'you'
            ? `You win the round! ${r.yourPower} vs ${r.foePower} — ${r.damage} damage${r.pact ? ' (PACT!)' : ''}`
            : `The Warden wins. ${r.foePower} vs ${r.yourPower} — ${r.damage} damage${r.pact ? ' (PACT!)' : ''}`;
      banner.textContent = text + '  ·  ' + taunt(r.winner);
      banner.className = r.winner === 'foe' ? 'lose' : r.winner === 'tie' ? 'tie' : '';
    }
  }
  arena.append(foeSlot, vs, youSlot);
}

function emptySlot(text) {
  const el = document.createElement('div');
  el.className = 'empty-slot';
  el.textContent = text;
  return el;
}

export function renderLog(game) {
  const list = $('#log-list');
  if (!list) return;
  list.innerHTML = '';
  game.log.slice(-9).forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    list.append(li);
  });
}

export function describeCard(card) {
  if (!card) return '';
  return `${SUITS[card.suit].glyph} ${card.power} ${SUITS[card.suit].name}`;
}

/** Title screen overlay. */
export function renderTitle(ui) {
  const root = $('#overlay-root');
  root.innerHTML = `
    <div class="overlay"><div class="sheet">
      <h1>🔥 EMBER PACT</h1>
      <div class="tagline">A duel of four suits against the Warden of the Last Ember.</div>
      <div class="howto">
        <div class="suits">🔥 &gt; 🌿 &gt; 💧 &gt; 🔥 &nbsp;·&nbsp; 🪨 neutral</div>
        Each round you and the Warden play one card face up. The stronger
        card wins and deals the difference as damage. A suit advantage is
        worth <b>+3 power</b>. Win twice in a row with the same suit to seal
        a <b>Pact: +2 damage and +1 life</b>. First to 0 life loses.
        The Warden loves its advantage suits and saves its 9s — read it, and counter it.
      </div>
      <button class="bigbtn" id="start-btn" type="button">⚔ Begin the duel</button>
      <div class="keys">Mouse: click a card to select it, click again to play · Keys: 1–5 select, Enter play, M mulligan, R restart, Esc title</div>
    </div></div>`;
  $('#start-btn').addEventListener('click', () => ui.onStart());
}

/** Win / loss overlay, with confetti on a win. */
export function renderEnd(game, ui) {
  const won = game.phase === 'won';
  const root = $('#overlay-root');
  root.innerHTML = `
    ${won ? '<div class="confetti" id="confetti"></div>' : ''}
    <div class="overlay"><div class="sheet">
      <h1 class="${won ? '' : 'lose'}">${won ? '🏆 VICTORY!' : '🥀 DEFEAT'}</h1>
      <div class="tagline">${won ? 'The Pact is yours. The Warden bows and the ember is yours to keep.' : 'The last ember fades. The Warden keeps the table — this time.'}</div>
      <div class="final">Duel lasted <b>${game.round} rounds</b> · Your life <b>${game.yourLife}</b> · Warden's life <b>${game.foeLife}</b></div>
      <button class="bigbtn" id="again-btn" type="button">↻ Duel again (R)</button>
      <button class="bigbtn ghost" id="title-btn" type="button">Title screen</button>
    </div></div>`;
  if (won) {
    const box = $('#confetti');
    const colors = ['#d9a441', '#e5484d', '#3e8fe8', '#46a758', '#f5efe2'];
    for (let i = 0; i < 70; i++) {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 1.2}s`;
      box.append(piece);
    }
  }
  $('#again-btn').addEventListener('click', () => ui.onStart());
  $('#title-btn').addEventListener('click', () => ui.onTitle());
}

/** Clear any overlay (back to the bare table). */
export function clearOverlay() {
  const root = $('#overlay-root');
  if (root) root.innerHTML = '';
}
