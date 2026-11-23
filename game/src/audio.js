// Ember Pact — tiny sounds, made in code.
// One file, one job: WebAudio blips. No audio files, no network, and the
// whole thing stays silent until the player first interacts.

let ctx = null;
let muted = false;

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

function tone(freq, dur, type = 'sine', gain = 0.08, when = 0) {
  if (muted) return;
  try {
    ctx = ctx ?? new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch {
    // No audio device, or the browser said no: the game plays on silently.
  }
}

export const sfx = {
  click() { tone(660, 0.07, 'triangle', 0.05); },
  deal() { tone(440, 0.08, 'triangle', 0.05); tone(554, 0.08, 'triangle', 0.05, 0.07); },
  flip() { tone(880, 0.09, 'sine', 0.06); },
  winRound() { tone(523, 0.12, 'triangle', 0.07); tone(784, 0.16, 'triangle', 0.07, 0.1); },
  loseRound() { tone(311, 0.16, 'sawtooth', 0.04); tone(233, 0.2, 'sawtooth', 0.04, 0.12); },
  winGame() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, i * 0.13)); },
  loseGame() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.24, 'sawtooth', 0.04, i * 0.15)); },
};
