// BTC race bot: an early-grind rider for cbBTC 1-minute bars.
//
// Idea, from the dev window's own shape: a 24h BTC window moves a few percent
// in one slow direction, while 1-minute noise is ~8 bps and a full round trip
// costs ~30-40 bps. Fast signals (EMA 8/21 and the like) whipsaw themselves to
// death on that noise; the strategies that made money on the dev window were
// the ones that bought early, held through the grind, and only left on a real
// reversal. So this bot does exactly that:
//
//   - Enter early (from scored bar 30) when the first 30 bars are not already
//     falling hard (30-bar return above -1%). If the open is a sharp fall it
//     waits flat and only enters once 60-bar momentum turns positive.
//   - Hold with a wide trailing stop (2% below the peak value since entry) and
//     a wide hard stop (4% below cost). Both are far outside hourly noise, so
//     ordinary chop does not shake it out; a genuine down-day exits near -2%.
//   - One strict re-entry after a stop-out, only on a strong recovery
//     (120-bar return above +1.5%). No re-entry after that.
//
// Entry and exit counts follow confirmed fills, not orders sent: a buy the
// market refuses (slippage, no bar) is simply sent again on the next bar,
// and a sell it refuses is re-decided the same way. The bot reads fills from
// whether a position appears or disappears between batches, so it can never
// stall flat after a rejected order.
//
// Everything is deterministic: plain float arithmetic on the closes the
// harness sends, no clock, no randomness, no network, no files. One asset,
// long only, at most one position, whole cash in on entry, whole position out
// on exit.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on

// Entry: from this scored bar on, enter when the opening bars are not falling hard.
const ENTRY_BAR = 30;
const ENTRY_RET_BARS = 30;
const ENTRY_RET_MIN = -0.01; // 30-bar return above -1%
// If the open fell hard, wait for momentum to turn: 60-bar return above 0%.
const WAIT_RET_BARS = 60;
const WAIT_RET_MIN = 0;
// One re-entry after a stop-out, only on a strong recovery.
const REENTRY_RET_BARS = 120;
const REENTRY_RET_MIN = 0.015;
// Exits, on position value vs its cost (fees included) and vs its peak.
const STOP_NUM = 96n; // value below 96% of cost
const TRAIL_NUM = 98n; // value below 98% of peak value
const PCT_DEN = 100n;

class Rider {
  private closes: number[] = [];
  private scored = 0;
  private peakValue = 0n;
  private entries = 0; // confirmed entries (a position appeared)
  private stoppedOut = false; // True after a confirmed exit on stop/trailing
  private hadPosition = false;

  private ret(bars: number): number | null {
    if (this.closes.length <= bars) return null;
    return this.closes[this.closes.length - 1]! / this.closes[this.closes.length - 1 - bars]! - 1;
  }

  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    if (state.warmingUp) return [];
    const bars = batch.bars.filter((b) => b.symbol === SYMBOL);
    if (bars.length === 0) return []; // no CBBTC bar this minute: decide nothing
    this.closes.push(Number(bars[bars.length - 1]!.c));
    this.scored += 1;

    const held = state.positions.get(SYMBOL);
    // Confirm fills from position changes: a buy sent last bar shows up as a
    // position now; a sell sent last bar makes it disappear.
    if (held !== undefined && !this.hadPosition) {
      this.entries += 1;
      this.stoppedOut = false;
      this.peakValue = 0n;
    }
    if (held === undefined && this.hadPosition) {
      this.stoppedOut = true;
      this.peakValue = 0n;
    }
    this.hadPosition = held !== undefined;
    if (held === undefined) return this.maybeEnter(state);
    return this.maybeExit(state, held.qty, held.cost);
  }

  private maybeEnter(state: BarsState): (BuyInput | SellInput)[] {
    if (this.entries === 0) {
      if (this.scored >= ENTRY_BAR) {
        const r = this.ret(ENTRY_RET_BARS);
        if (r !== null && r > ENTRY_RET_MIN) return this.buy(state);
      }
      const r = this.ret(WAIT_RET_BARS);
      if (r !== null && r > WAIT_RET_MIN) return this.buy(state);
      return [];
    }
    // One re-entry after a stop-out, on a strong recovery only.
    if (!this.stoppedOut || this.entries >= 2) return [];
    const r = this.ret(REENTRY_RET_BARS);
    if (r !== null && r > REENTRY_RET_MIN) return this.buy(state);
    return [];
  }

  private buy(state: BarsState): (BuyInput | SellInput)[] {
    const room = state.weightRoom(SYMBOL);
    const cash = state.cash < room ? state.cash : room;
    if (cash <= 0n) return [];
    // No state change here: the entry is counted when the position appears.
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }

  private maybeExit(state: BarsState, qty: bigint, cost: bigint): (BuyInput | SellInput)[] {
    const value = state.value(SYMBOL, qty);
    if (value <= 0n) return [];
    if (this.peakValue === 0n) this.peakValue = value;
    else if (value > this.peakValue) this.peakValue = value;
    if (value * PCT_DEN < cost * STOP_NUM) return this.sell(qty);
    if (value * PCT_DEN < this.peakValue * TRAIL_NUM) return this.sell(qty);
    return [];
  }

  private sell(qty: bigint): (BuyInput | SellInput)[] {
    // No state change here: the exit is counted when the position disappears.
    return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }
}

const rider = new Rider();
await runBars({ onBatch: (state, batch) => rider.onBatch(state, batch) });
