// Solara Bay — procedural WebAudio: engine hum, siren, and effects.
// No audio files, no network. Everything is synthesized at runtime.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.musicTimer = 0;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: two alternating tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speed01, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + speed01 * 0.10 : 0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(48 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  sirenWail(dt) {
    if (!this.ctx || !this.sirenOn || !this.sirenOsc) return;
    const t = this.ctx.currentTime;
    this.sirenOsc.frequency.setTargetAtTime(Math.sin(t * 4.4) > 0 ? 880 : 660, t, 0.05);
  }

  tone(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {
      // Audio is decoration; never break the game for it.
    }
  }

  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'pickup': this.tone(660, 0.12, 'sine', 0.18); this.tone(990, 0.16, 'sine', 0.14, 0.08); break;
      case 'coin': this.tone(880, 0.1, 'triangle', 0.18); this.tone(1320, 0.18, 'triangle', 0.14, 0.07); break;
      case 'punch': this.tone(160, 0.1, 'square', 0.2); this.tone(90, 0.12, 'sine', 0.22, 0.02); break;
      case 'hurt': this.tone(220, 0.18, 'sawtooth', 0.16); break;
      case 'crash': this.tone(70, 0.3, 'sawtooth', 0.22); this.tone(50, 0.35, 'square', 0.14, 0.05); break;
      case 'door': this.tone(300, 0.08, 'square', 0.1); break;
      case 'mission': this.tone(523, 0.14, 'triangle', 0.16); this.tone(659, 0.14, 'triangle', 0.16, 0.12); this.tone(784, 0.22, 'triangle', 0.16, 0.24); break;
      case 'missionDone': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.16, i * 0.11)); break;
      case 'objective': this.tone(784, 0.12, 'sine', 0.14); break;
      case 'fail': this.tone(392, 0.25, 'sawtooth', 0.14); this.tone(311, 0.35, 'sawtooth', 0.14, 0.2); break;
      case 'sirenBlip': this.tone(880, 0.1, 'sine', 0.14); this.tone(660, 0.14, 'sine', 0.14, 0.09); break;
      default: break;
    }
  }

  // A tiny synth loop: bass note + sparkle, one step per call from main.
  musicTick(dt) {
    if (!this.ctx || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.42;
    const bass = [110, 110, 130.8, 98][this.musicStep % 4];
    this.tone(bass, 0.4, 'triangle', 0.05);
    if (this.musicStep % 2 === 0) this.tone(bass * 4, 0.18, 'sine', 0.03);
    this.musicStep++;
  }
}
