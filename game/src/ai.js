// Ember Pact — the Warden's mind.
// One file, one job: pick the opponent's card. The logic is deliberately
// readable, so a player can learn it and counter it:
//   - it loves winning with a suit advantage, and spends its cheapest such card;
//   - when either life is low it stops bluffing and plays its biggest card;
//   - otherwise it saves its 9s and plays a mid card.

import { effectivePower, advantageOf } from './rules.js';

export function chooseCard(hand, ctx) {
  const { yourLife, foeLife, yourLastCard } = ctx;

  const desperate = foeLife <= 6 || yourLife <= 6;
  if (desperate) {
    return indexOfHighest(hand);
  }

  // If the player's last card is known, hunt the suit that beats it.
  if (yourLastCard) {
    const hunters = hand
      .map((card, i) => ({ card, i }))
      .filter(({ card }) => advantageOf(card.suit, yourLastCard.suit) > 0)
      .sort((a, b) => a.card.power - b.card.power);
    if (hunters.length > 0 && Math.random() < 0.75) {
      return hunters[0].i;
    }
  }

  // Otherwise play a mid card and keep the 9s for a killing blow.
  const mids = hand
    .map((card, i) => ({ card, i }))
    .filter(({ card }) => card.power >= 4 && card.power <= 7);
  if (mids.length > 0 && Math.random() < 0.7) {
    return mids[Math.floor(Math.random() * mids.length)].i;
  }
  const cheap = hand
    .map((card, i) => ({ card, i }))
    .sort((a, b) => a.card.power - b.card.power);
  return cheap[0].i;
}

export function indexOfHighest(hand) {
  let best = 0;
  for (let i = 1; i < hand.length; i++) {
    if (hand[i].power > hand[best].power) best = i;
  }
  return best;
}

/** A taunt line for the log, matched to how the round went. */
export function taunt(outcome) {
  if (outcome === 'you') return 'The Warden grumbles and reshuffles its plans.';
  if (outcome === 'foe') return 'The Warden smiles. It saw that coming.';
  return 'Both embers sputter out. No one takes the round.';
}

export { effectivePower };
