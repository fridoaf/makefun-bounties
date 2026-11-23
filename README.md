# BTC race bot — btc-race-24h-20261123-0511

A trend-riding bot for cbBTC (Coinbase Wrapped BTC) on 1-minute Orca
Whirlpool bars, built for the make.fun 24h live race.

## Strategy

An "early-grind rider": a 24h BTC window moves a few percent in one slow
direction while 1-minute noise is ~8 bps and a full round trip costs
~30–40 bps, so fast signals whipsaw themselves to death. This bot buys early,
holds through the grind, and only leaves on a real reversal:

- **Enter** from scored bar 30 when the first 30 bars are not falling hard
  (30-bar return above -1%). If the open is a sharp fall, it waits flat and
  enters once 60-bar momentum turns positive.
- **Hold** with a wide trailing stop (2% below the peak position value) and a
  wide hard stop (4% below cost) — far outside hourly noise, so ordinary chop
  does not shake it out; a genuine down-day exits near -2%.
- **One strict re-entry** after a stop-out, only on a strong recovery
  (120-bar return above +1.5%).

Entry/exit counts follow confirmed fills, not orders sent: a refused order is
simply re-decided on the next bar, so the bot can never stall flat after a
rejection. Deterministic (float arithmetic on closes only), stdlib only,
no network, no clock, no files. Long only, one position, whole cash in,
whole position out.

## Local grade (dev window)

`node cli/makefun.mjs grade-local --kit . --bot . --driver process --worktree`
in the kit dir:

- **Net PnL +36.31 USDC** (return +3.63%), 1 trade, max drawdown 1.98%,
  guardrails met, two executions reproduced byte for byte.
- Dev gate: net PnL > $0, so the entry qualifies for the live race.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's bars-replay/v1
  SDK shim.
- `LICENSE` — MIT.
