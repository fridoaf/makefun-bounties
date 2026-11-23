// Procedural sound: no audio files, no network. A WebAudio graph built from
// oscillators and filtered noise — engine hum that follows the speed, a
// two-tone police siren, coin blips, thuds, and a small synth loop that plays
// while Mara drives. Everything is guarded: in a headless browser, or before
// the first click, it simply stays silent.

const BASS_LINE = [55, 55, 65.41, 49, 55, 55, 73.42, 65.41];
const LEAD_LINE = [220, 0, 261.63, 0, 329.63, 0, 293.66, 261.63];

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    musicGain: null,
    muted: false,
    musicStep: 0,
    nextNoteTime: 0,
    started: false,

    /** Build the graph on the first user gesture (browsers demand one). */
    ensure() {
      if (this.started) return;
      try {
        const AC = window.AudioContext ?? window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        // Engine: a low sawtooth through a low-pass, its pitch tied to speed.
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 55;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
        // Siren: a square wave that wails between two tones.
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'square';
        this.sirenOsc.frequency.value = 720;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.started = true;
      } catch {
        // Audio is decoration; a failure here never stops the game.
        this.started = false;
      }
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
      }
      return this.muted;
    },

    /** Per-frame: engine pitch from the car, siren wail, music scheduler. */
    update(game, dt) {
      if (!this.started || !this.ctx) return;
      const t = this.ctx.currentTime;
      const car = game.player.inCar;
      const speed = car ? Math.abs(car.speed) : 0;
      this.engineGain.gain.setTargetAtTime(car ? 0.05 + speed / 9000 : 0.015, t, 0.1);
      this.engineOsc.frequency.setTargetAtTime(52 + speed * 0.32, t, 0.08);
      const sirenOn = game.sirenOn && !this.muted;
      this.sirenGain.gain.setTargetAtTime(sirenOn ? 0.045 : 0, t, 0.15);
      if (sirenOn) {
        const phase = Math.floor(t * 1.6) % 2;
        this.sirenOsc.frequency.setTargetAtTime(phase === 0 ? 715 : 950, t, 0.05);
      }
      // Music: an 8-step loop, bass on every step, lead on the odd ones.
      const stepDur = 60 / 112 / 2;
      while (this.nextNoteTime < t + 0.15) {
        const i = this.musicStep % 8;
        const bass = BASS_LINE[i];
        if (bass) this.note(bass, this.nextNoteTime, stepDur * 0.95, 'triangle', 0.5);
        const lead = LEAD_LINE[i];
        if (lead) this.note(lead, this.nextNoteTime, stepDur * 0.8, 'square', 0.1);
        this.musicStep += 1;
        this.nextNoteTime += stepDur;
      }
      void dt;
    },

    note(freq, when, dur, type, vol) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    },

    blip(freq, dur, type, vol) {
      if (!this.started || !this.ctx || this.muted) return;
      this.note(freq, this.ctx.currentTime, dur, type, vol);
    },

    pickup() {
      if (!this.started) return;
      this.blip(880, 0.12, 'sine', 0.5);
      setTimeout(() => this.blip(1318, 0.16, 'sine', 0.4), 70);
    },

    punch() {
      if (!this.started || !this.ctx) return;
      this.noiseBurst(0.09, 0.25);
    },

    thud() {
      if (!this.started || !this.ctx) return;
      this.noiseBurst(0.22, 0.5);
      this.blip(70, 0.2, 'sine', 0.6);
    },

    noiseBurst(dur, vol) {
      if (!this.ctx) return;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(this.master);
      src.start();
    },
  };
  return audio;
}
