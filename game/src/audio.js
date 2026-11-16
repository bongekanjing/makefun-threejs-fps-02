// Synthesised sound for VESPER YARD. Every effect is built from oscillators
// and filtered noise in a WebAudio graph — no audio files, no network.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noiseBuf = null;
  }

  /** Create the context on a user gesture (browsers block it before then). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  get ready() {
    return !!this.ctx && !this.muted;
  }

  _noise(dur, filterType, freq, gain, when = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, type, gain, slideTo = null, when = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(kind) {
    if (!this.ready) return;
    if (kind === 'sniper') {
      this._noise(0.28, 'lowpass', 900, 0.9);
      this._tone(140, 0.22, 'sawtooth', 0.5, 55);
      this._noise(0.12, 'highpass', 2400, 0.35);
    } else if (kind === 'shotgun') {
      this._noise(0.3, 'lowpass', 700, 1.0);
      this._tone(110, 0.25, 'square', 0.45, 45);
    } else if (kind === 'smg') {
      this._noise(0.09, 'bandpass', 1800, 0.55);
      this._tone(220, 0.07, 'square', 0.28, 120);
    } else if (kind === 'pistol') {
      this._noise(0.12, 'bandpass', 1500, 0.6);
      this._tone(190, 0.09, 'square', 0.32, 90);
    } else {
      this._noise(0.14, 'bandpass', 1300, 0.7);
      this._tone(170, 0.11, 'sawtooth', 0.4, 70);
    }
  }

  dryFire() {
    this._tone(1400, 0.04, 'square', 0.12);
  }

  reload() {
    this._tone(900, 0.04, 'square', 0.14);
    this._tone(650, 0.04, 'square', 0.14, null, 0.28);
    this._tone(1100, 0.05, 'square', 0.18, null, 0.62);
  }

  step(run) {
    this._noise(0.07, 'lowpass', run ? 500 : 380, run ? 0.16 : 0.1);
  }

  hit() {
    this._tone(2100, 0.05, 'sine', 0.3);
  }

  kill() {
    this._tone(1568, 0.09, 'sine', 0.28);
    this._tone(2093, 0.14, 'sine', 0.28, null, 0.08);
  }

  hurt() {
    this._tone(160, 0.14, 'sawtooth', 0.3, 90);
  }

  buy() {
    this._tone(880, 0.06, 'sine', 0.25);
    this._tone(1318, 0.1, 'sine', 0.25, null, 0.06);
  }

  plantBeep(final = false) {
    this._tone(final ? 1568 : 1046, final ? 0.3 : 0.09, 'square', 0.22);
  }

  defuseBeep() {
    this._tone(1318, 0.08, 'square', 0.2);
  }

  explosion() {
    this._noise(1.1, 'lowpass', 420, 1.0);
    this._tone(70, 0.9, 'sine', 0.8, 30);
    this._noise(0.4, 'highpass', 1200, 0.4);
  }

  roundWin() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.3, null, i * 0.11));
  }

  roundLose() {
    [392, 330, 262].forEach((f, i) => this._tone(f, 0.26, 'triangle', 0.28, null, i * 0.13));
  }

  denied() {
    this._tone(220, 0.12, 'square', 0.2, 180);
  }
}
