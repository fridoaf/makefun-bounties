// Ember Pact — the game state machine.
// One file, one job: hold the duel's state and advance it one round at a
// time. Pure logic, no DOM: render.js draws whatever this holds, and the
// node test in /tmp can drive whole games through it.

import { buildDeck, shuffle, resolveRound, START_LIFE, HAND_SIZE, OVERTIME_ROUND, makeRng } from './rules.js';
import { chooseCard } from './ai.js';

export const PHASES = ['title', 'play', 'reveal', 'won', 'lost'];

/** A brand-new duel, waiting on the title screen. */
export function createGame(seed = Date.now()) {
  return {
    phase: 'title',
    seed,
    deck: [],
    discard: [],
    yourHand: [],
    foeHand: [],
    yourLife: START_LIFE,
    foeLife: START_LIFE,
    round: 0,
    yourLastWinSuit: null,
    foeLastWinSuit: null,
    yourLastCard: null,
    mulliganUsed: false,
    lastRound: null,
    log: [],
    winner: null,
  };
}

/** Deal a fresh duel: shuffled deck, five cards each, life restored. */
export function startGame(game, seed = Date.now()) {
  const rng = makeRng(seed);
  const fresh = createGame(seed);
  fresh.phase = 'play';
  fresh.deck = shuffle(buildDeck(), rng);
  fresh.yourHand = drawUp(fresh, HAND_SIZE);
  fresh.foeHand = drawUp(fresh, HAND_SIZE);
  fresh.log = ['The Warden shuffles the ember deck. Five cards each. Duel!'];
  return fresh;
}

/** Draw from the deck, reshuffling the discard pile when it runs dry. */
export function drawCard(game) {
  if (game.deck.length === 0) {
    if (game.discard.length === 0) return null;
    game.deck = shuffle(game.discard, Math.random);
    game.discard = [];
    game.log.push('The discard pile is shuffled back into the deck.');
  }
  return game.deck.pop();
}

export function drawUp(game, count) {
  const hand = [];
  while (hand.length < count) {
    const card = drawCard(game);
    if (!card) break;
    hand.push(card);
  }
  return hand;
}

/** Refill both hands to five after a round. */
export function refillHands(game) {
  game.yourHand = game.yourHand.concat(drawUp(game, HAND_SIZE - game.yourHand.length));
  game.foeHand = game.foeHand.concat(drawUp(game, HAND_SIZE - game.foeHand.length));
}

/**
 * Play one round: the player picks a card by hand index, the Warden picks
 * one of its own, both are revealed and the damage is dealt.
 * Returns the round result, or null when the pick is not legal.
 */
export function playRound(game, yourIndex) {
  if (game.phase !== 'play') return null;
  if (yourIndex < 0 || yourIndex >= game.yourHand.length) return null;

  const yourCard = game.yourHand.splice(yourIndex, 1)[0];
  const foeIndex = chooseCard(game.foeHand, {
    yourLife: game.yourLife,
    foeLife: game.foeLife,
    yourLastCard: game.yourLastCard,
  });
  const foeCard = game.foeHand.splice(foeIndex, 1)[0];
  game.yourLastCard = yourCard;

  const result = resolveRound(yourCard, foeCard, game.yourLastWinSuit, game.foeLastWinSuit);
  game.round += 1;
  game.discard.push(yourCard, foeCard);

  if (result.winner === 'you') {
    game.foeLife = Math.max(0, game.foeLife - result.damage);
    if (result.pact) game.yourLife = Math.min(START_LIFE, game.yourLife + 1);
    game.yourLastWinSuit = yourCard.suit;
    game.foeLastWinSuit = null;
  } else if (result.winner === 'foe') {
    game.yourLife = Math.max(0, game.yourLife - result.damage);
    if (result.pact) game.foeLife = Math.min(START_LIFE, game.foeLife + 1);
    game.foeLastWinSuit = foeCard.suit;
    game.yourLastWinSuit = null;
  }

  game.lastRound = { yourCard, foeCard, ...result, round: game.round };
  game.log.push(describeRound(game.lastRound));
  if (result.pact) game.log.push('PACT! Same winning suit twice — +2 damage, +1 life.');

  refillHands(game);
  game.phase = 'reveal';
  return game.lastRound;
}

/** After the reveal pause, either continue or end the duel. */
export function advanceAfterReveal(game) {
  if (game.phase !== 'reveal') return game;
  if (game.yourLife <= 0 || game.foeLife <= 0) {
    game.phase = game.foeLife <= 0 ? 'won' : 'lost';
    game.winner = game.phase === 'won' ? 'you' : 'foe';
    game.log.push(game.phase === 'won' ? 'Victory! The Warden bows to you.' : 'Defeat. The last ember fades.');
    return game;
  }
  if (game.round >= OVERTIME_ROUND) {
    game.phase = game.yourLife >= game.foeLife ? 'won' : 'lost';
    game.winner = game.phase === 'won' ? 'you' : 'foe';
    game.log.push('Overtime! The higher life takes the duel.');
    return game;
  }
  game.phase = 'play';
  return game;
}

/** Once per duel, throw the hand away and draw five fresh cards. */
export function mulligan(game) {
  if (game.phase !== 'play' || game.mulliganUsed) return false;
  game.discard.push(...game.yourHand);
  game.yourHand = drawUp(game, HAND_SIZE);
  game.mulliganUsed = true;
  game.log.push('You call a mulligan and draw a fresh hand.');
  return true;
}

export function describeRound(r) {
  const suitName = (c) => `${c.power} ${c.suit}`;
  if (r.winner === 'tie') {
    return `Round ${r.round}: ${suitName(r.yourCard)} vs ${suitName(r.foeCard)} — tie, no damage.`;
  }
  const who = r.winner === 'you' ? 'You win' : 'The Warden wins';
  return `Round ${r.round}: ${suitName(r.yourCard)} (${r.yourPower}) vs ${suitName(r.foeCard)} (${r.foePower}) — ${who}, ${r.damage} damage.`;
}

/** A fixed mid-duel state used only for the play screenshot (?shot=play). */
export function presetMidGame() {
  const game = startGame(createGame(20261122), 20261122);
  game.round = 6;
  game.yourLife = 20;
  game.foeLife = 14;
  game.yourHand = [
    { id: 'ember-9', suit: 'ember', power: 9 },
    { id: 'tide-4', suit: 'tide', power: 4 },
    { id: 'thorn-7', suit: 'thorn', power: 7 },
    { id: 'stone-6', suit: 'stone', power: 6 },
    { id: 'ember-3', suit: 'ember', power: 3 },
  ];
  game.foeHand = [
    { id: 'tide-8', suit: 'tide', power: 8 },
    { id: 'stone-2', suit: 'stone', power: 2 },
    { id: 'thorn-5', suit: 'thorn', power: 5 },
    { id: 'ember-6', suit: 'ember', power: 6 },
    { id: 'tide-1', suit: 'tide', power: 1 },
  ];
  game.lastRound = {
    yourCard: { id: 'thorn-8', suit: 'thorn', power: 8 },
    foeCard: { id: 'tide-5', suit: 'tide', power: 5 },
    winner: 'you',
    damage: 6,
    pact: false,
    yourPower: 11,
    foePower: 5,
    round: 6,
  };
  game.yourLastWinSuit = 'thorn';
  game.log = [
    'Round 5: 6 stone (6) vs 2 ember (2) — You win, 4 damage.',
    'Round 6: 8 thorn (11) vs 5 tide (5) — You win, 6 damage.',
    'Thorn beats Tide! Your 8 becomes 11.',
  ];
  game.phase = 'reveal';
  return game;
}

/** A fixed finished duel used only for the win/loss screenshots. */
export function presetEnd(won) {
  const game = presetMidGame();
  game.round = 11;
  game.yourLife = won ? 12 : 0;
  game.foeLife = won ? 0 : 9;
  game.phase = won ? 'won' : 'lost';
  game.winner = won ? 'you' : 'foe';
  game.log.push(won ? 'Victory! The Warden bows to you.' : 'Defeat. The last ember fades.');
  return game;
}
