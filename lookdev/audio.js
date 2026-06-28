// SIGNAL LOST — shared Web Audio engine for the lookdev scenes.
// Rich procedural soundscapes out of the box; auto-layers real ElevenLabs clips
// from the Audio Forge catalog (/api/manifest -> /audio/*) when they exist.
// Everything is gated on a user gesture (AudioContext autoplay policy).

export class Mixer {
  constructor(masterGain = 0.9) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = masterGain;
    // soft limiter so overlapping layers never clip
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 24; this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.master.connect(this.comp).connect(this.ctx.destination);
  }
  get now() { return this.ctx.currentTime; }
  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }
  // a destination gain you can fade as a sub-bus
  bus(gain = 1) { const g = this.ctx.createGain(); g.gain.value = gain; g.connect(this.master); return g; }
}

let _nb = null;
export function noiseBuffer(ctx, secs = 2) {
  // cache a single long noise buffer per context (cheap, reused by every layer)
  if (_nb && _nb.ctx === ctx) return _nb.buf;
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  _nb = { ctx, buf: b }; return b;
}

// a looping filtered-noise bed (rain, roar, air, hiss). Returns {src,f,g}.
export function noiseBed(ctx, dest, { type = 'lowpass', freq = 500, q = 0.7, gain = 0.1 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 2); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(dest); src.start();
  return { src, f, g };
}

// a sustained oscillator (drone, hum, sub). Returns {o,g}.
export function tone(ctx, dest, { type = 'sine', freq = 80, gain = 0.05, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  const g = ctx.createGain(); g.gain.value = gain;
  o.connect(g).connect(dest); o.start();
  return { o, g };
}

// a one-shot enveloped noise burst (ignition crack, thunder, clunk, impact).
export function burst(ctx, dest, { type = 'bandpass', freq = 180, q = 1, gain = 0.4, attack = 0.005, decay = 0.4 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 2); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(f).connect(g).connect(dest); src.start(); src.stop(t + attack + decay + 0.05);
}

// a one-shot pitched blip (beep, sonar, comms tick).
export function blip(ctx, dest, { type = 'sine', freq = 660, gain = 0.12, dur = 0.12, slideTo = null } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); const t = ctx.currentTime;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(); o.stop(t + dur + 0.02);
}

// Loads the Audio Forge catalog and plays clips by id (real ElevenLabs audio).
// Positional playback via an optional THREE.PositionalAudio-like panner.
export class ClipBank {
  constructor(mixer) { this.mix = mixer; this.map = {}; this.buffers = {}; this.ready = false; }
  async load() {
    try {
      const r = await fetch('/api/manifest', { cache: 'no-store' });
      const j = await r.json();
      for (const it of (j.items || [])) if (it.file) this.map[it.id] = it.file;
      this.ready = true;
    } catch (e) { /* offline / no catalog -> procedural only */ }
    return this;
  }
  has(id) { return !!this.map[id]; }
  // fuzzy: first catalog id that contains the token (so 'launch-roar' matches 'sfx:launch-roar-01')
  find(token) { if (this.map[token]) return token; return Object.keys(this.map).find(k => k.includes(token)) || null; }
  async _buf(id) {
    if (this.buffers[id]) return this.buffers[id];
    const r = await fetch('/' + this.map[id]); const ab = await r.arrayBuffer();
    const b = await this.mix.ctx.decodeAudioData(ab); this.buffers[id] = b; return b;
  }
  async play(idOrToken, { loop = false, gain = 1, dest = null, rate = 1 } = {}) {
    const id = this.map[idOrToken] ? idOrToken : this.find(idOrToken);
    if (!id) return null;
    try {
      const b = await this._buf(id);
      const s = this.mix.ctx.createBufferSource(); s.buffer = b; s.loop = loop; s.playbackRate.value = rate;
      const g = this.mix.ctx.createGain(); g.gain.value = gain;
      s.connect(g).connect(dest || this.mix.master); s.start();
      return { s, g };
    } catch (e) { return null; }
  }
}

// tiny helpers
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
