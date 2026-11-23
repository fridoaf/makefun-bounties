// Ember Pact — the rules of the duel.
// One file, one job: suits, advantage, and how a round is scored.
// Nothing here touches the DOM; state.js drives the game with these pure rules.

export const SUITS = {
  ember: { name: 'Ember', glyph: '🔥', color: '#e5484d', dark: '#8f1d22', beats: 'thorn' },
  tide: { name: 'Tide', glyph: '💧', color: '#3e8fe8', dark: '#174a80', beats: 'ember' },
  thorn: { name: 'Thorn', glyph: '🌿', color: '#46a758', dark: '#1d5c2e', beats: 'tide' },
  stone: { name: 'Stone', glyph: '🪨', color: '#c19a3d', dark: '#6d5420', beats: null },
};

export const SUIT_ORDER = ['ember', 'tide', 'thorn', 'stone'];
export const START_LIFE = 20;
export const HAND_SIZE = 5;
export const OVERTIME_ROUND = 40;

/** Build a fresh 36-card deck: every suit at powers 1..9. */
export function buildDeck() {
  const deck = [];
  for (const suit of SUIT_ORDER) {
    for (let power = 1; power <= 9; power++) {
      deck.push({ id: `${suit}-${power}`, suit, power });
    }
  }
  return deck;
}

/** Suit advantage: the cycle Ember > Thorn > Tide > Ember. Stone is neutral. */
export function advantageOf(attackerSuit, defenderSuit) {
  if (SUITS[attackerSuit].beats === defenderSuit) return 3;
  if (SUITS[defenderSuit].beats === attackerSuit) return -3;
  return 0;
}

/** A card's fighting strength against one foe card (never below 0). */
export function effectivePower(card, foeCard) {
  return Math.max(0, card.power + advantageOf(card.suit, foeCard.suit));
}

/**
 * Score one revealed round.
 * Higher effective power wins and deals the difference (at least 1).
 * A tie deals nothing. Winning twice in a row with the same suit seals
 * a Pact: +2 damage and the winner mends 1 life.
 */
export function resolveRound(yourCard, foeCard, yourLastWinSuit, foeLastWinSuit) {
  const yourPower = effectivePower(yourCard, foeCard);
  const foePower = effectivePower(foeCard, yourCard);
  if (yourPower === foePower) {
    return { winner: 'tie', damage: 0, pact: false, yourPower, foePower };
  }
  const youWin = yourPower > foePower;
  const lastWinSuit = youWin ? yourLastWinSuit : foeLastWinSuit;
  const winSuit = youWin ? yourCard.suit : foeCard.suit;
  const pact = lastWinSuit === winSuit;
  const damage = Math.abs(yourPower - foePower) + (pact ? 2 : 0);
  return { winner: youWin ? 'you' : 'foe', damage, pact, yourPower, foePower };
}

/** A tiny seeded RNG (mulberry32) so screenshot presets are repeatable. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle that never mutates its input. */
export function shuffle(cards, rng = Math.random) {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
