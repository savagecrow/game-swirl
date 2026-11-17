// Synthesised sound (WebAudio) - no asset files.
const SND = {
  ctx: null, on: true,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f, d, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, vol = 0.1, delay = 0) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * d), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = buf; g.gain.value = vol;
    s.connect(g); g.connect(this.ctx.destination); s.start(this.ctx.currentTime + delay);
  },
  select(n) { this.tone(300 + Math.min(n, 30) * 18, 0.07, 'triangle', 0.1); },
  remove(n) {
    this.tone(220 + Math.min(n, 40) * 14, 0.18, 'square', 0.07, 300); this.noise(0.12, 0.05);
    if (n >= 12) { for (let i = 0; i < 6; i++) { this.noise(0.15, 0.06, 0.1 + i * 0.09); this.tone(500 + Math.random() * 900, 0.12, 'sine', 0.06, 400, 0.1 + i * 0.09); } }
  },
  single() { this.tone(140, 0.28, 'sawtooth', 0.1, -70); },
  column(k) { for (let i = 0; i < Math.min(k + 1, 6); i++) this.tone(440 * Math.pow(1.26, i), 0.14, 'triangle', 0.09, 0, i * 0.07); },
  win() { [523, 659, 784, 1046, 1319].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.11, 0, i * 0.11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.08, 0, i * 0.16)); },
  tick() { this.tone(900, 0.05, 'square', 0.05); },
};
