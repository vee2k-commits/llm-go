/* ============================================================================
 * vee-sfx.js — Vee Arcade WebAudio synth grammar (DESIGN-BIBLE §3d)
 *
 * Master chain:  voice → per-voice gain → lowpass 8kHz
 *                → music bus (0.18) or sfx bus (0.35)
 *                → compressor (threshold -18dB, ratio 4) → destination
 *
 * All envelopes: exponentialRampToValueAtTime, 10ms attack floor (no clicks).
 * Triangle/sine favored over sawtooth; failure is a sigh, never a buzz.
 *
 * Load after vee-game.js. Exposes: window.VeeSFX
 * ========================================================================== */
(function (global) {
"use strict";

var ATTACK_FLOOR = 0.01;          // 10ms — exponential envelopes only
var LOWPASS_HZ = 8000;            // removes oscillator harshness for kids' ears

function SFXKit() {
  this.ctx = null;
  this.ready = false;
  this.muted = false;
  this._noiseBuf = null;
  this._duckTimer = 0;
  this._musicTimer = 0;
  this.music = { playing: false, bpm: 100, tier: 0, seed: 1, nextTime: 0, step: 0 };
}

/* ---- lazy AudioContext; browsers require a user gesture to unlock ------ */
SFXKit.prototype.ensure = function () {
  if (this.ctx) return this.ctx;
  var AC = global.AudioContext || global.webkitAudioContext;
  if (!AC) return null;
  var c = this.ctx = new AC();

  /* master chain per doctrine */
  this.comp = c.createDynamicsCompressor();
  this.comp.threshold.value = -18;
  this.comp.ratio.value = 4;
  this.comp.connect(c.destination);

  this.musicBus = c.createGain(); this.musicBus.gain.value = 0.18;
  this.sfxBus   = c.createGain(); this.sfxBus.gain.value = 0.35;
  this.musicBus.connect(this.comp);
  this.sfxBus.connect(this.comp);

  /* shared noise buffer (1s white noise) */
  this._noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  var d = this._noiseBuf.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  this.ready = true;
  return c;
};
/* Call from the first pointerdown/keydown so autoplay policies allow sound. */
SFXKit.prototype.unlock = function () {
  var c = this.ensure();
  if (c && c.state === "suspended") c.resume();
};

/* ---- one voice: osc/noise → gain envelope → lowpass → bus -------------- */
SFXKit.prototype.voice = function (o) {
  var c = this.ensure();
  if (!c || this.muted) return;
  var t0 = c.currentTime + (o.delay || 0);
  var dur = o.dur || 0.1;
  var src;

  if (o.noise) {
    src = c.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
  } else {
    src = c.createOscillator();
    src.type = o.type || "triangle";
    src.frequency.setValueAtTime(Math.max(1, o.freq), t0);
    if (o.to != null) {
      src.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
    }
  }
  if (o.filter) {
    var f = c.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.freq, t0);
    if (o.filter.to != null) f.frequency.exponentialRampToValueAtTime(o.filter.to, t0 + dur);
    f.Q.value = o.filter.Q || 1;
    src.connect(f);
    src = f;
  }

  var g = c.createGain();
  var peak = o.gain != null ? o.gain : 0.15;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.max(ATTACK_FLOOR, o.attack || ATTACK_FLOOR));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  var lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = LOWPASS_HZ;

  src.connect(g); g.connect(lp);
  lp.connect(o.bus === "music" ? this.musicBus : this.sfxBus);

  if (o.noise) { src.start(t0); src.stop(t0 + dur); }
  else { src.start(t0); src.stop(t0 + dur + 0.02); }
  if (o.bus !== "music") this._duck();
};

/* ---- music ducking: −6dB on the music bus during SFX clusters ---------- */
SFXKit.prototype._duck = function () {
  if (!this.ready) return;
  var c = this.ctx, self = this;
  this.musicBus.gain.cancelScheduledValues(c.currentTime);
  this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, c.currentTime);
  this.musicBus.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 0.03);   // 0.18 → −6dB
  global.clearTimeout(this._duckTimer);
  this._duckTimer = global.setTimeout(function () {
    var t = c.currentTime;
    self.musicBus.gain.cancelScheduledValues(t);
    self.musicBus.gain.setValueAtTime(self.musicBus.gain.value, t);
    self.musicBus.gain.exponentialRampToValueAtTime(0.18, t + 0.15);
  }, 250);
};

/* ==========================================================================
 * Named SFX recipes — verbatim from DESIGN-BIBLE §3d table
 * ======================================================================== */
SFXKit.prototype.tick = function () {          /* square 660, 60ms, g 0.15 */
  this.voice({ type: "square", freq: 660, dur: 0.06, gain: 0.15 });
};
SFXKit.prototype.confirm = function () {       /* triangle 523→784, 140ms */
  this.voice({ type: "triangle", freq: 523, to: 784, dur: 0.14, gain: 0.2 });
};
SFXKit.prototype.jump = function () {          /* square 320→640, 130ms + puff */
  this.voice({ type: "square", freq: 320, to: 640, dur: 0.13, gain: 0.15 });
  this.voice({ noise: true, filter: { type: "highpass", freq: 1200 }, dur: 0.05, gain: 0.04 });
};
SFXKit.prototype.land = function () {          /* noise lowpass 300Hz + 110 thump */
  this.voice({ noise: true, filter: { type: "lowpass", freq: 300 }, dur: 0.09, gain: 0.25 });
  this.voice({ type: "sine", freq: 110, dur: 0.09, gain: 0.2 });
};
SFXKit.prototype.coin = function () {          /* 988 for 70ms, then 1319 for 120ms */
  this.voice({ type: "square", freq: 988, dur: 0.07, gain: 0.14 });
  this.voice({ type: "square", freq: 1319, dur: 0.12, gain: 0.14, delay: 0.07 });
};
SFXKit.prototype.powerUp = function () {       /* 523-659-784-1047, 55ms/note */
  var seq = [523, 659, 784, 1047];
  for (var i = 0; i < seq.length; i++) {
    this.voice({ type: "triangle", freq: seq[i], dur: 0.055, gain: 0.16, delay: i * 0.055 });
  }
};
SFXKit.prototype.pop = function () {           /* brick/pop: 440→220 + noise 40ms */
  this.voice({ type: "triangle", freq: 440, to: 220, dur: 0.08, gain: 0.2 });
  this.voice({ noise: true, filter: { type: "bandpass", freq: 900, Q: 0.8 }, dur: 0.04, gain: 0.1 });
};
/* Bounce pitch ladder — rising excitement: pitch ×1.06 each consecutive hit */
SFXKit.prototype.bounce = function (step) {
  this.voice({ type: "sine", freq: 300 * Math.pow(1.06, step || 0), dur: 0.09, gain: 0.18 });
};
SFXKit.prototype.gentleFail = function () {    /* sine 330→262 minor-second sigh */
  this.voice({ type: "sine", freq: 330, to: 262, dur: 0.3, gain: 0.16, attack: 0.02 });
};
SFXKit.prototype.whoosh = function () {        /* bandpass noise 400→2400Hz */
  this.voice({ noise: true, filter: { type: "bandpass", freq: 400, to: 2400, Q: 1.2 }, dur: 0.18, gain: 0.12 });
};
SFXKit.prototype.sticker = function () {       /* bell: 1568 + 2349 partial */
  this.voice({ type: "sine", freq: 1568, dur: 0.4, gain: 0.15 });
  this.voice({ type: "sine", freq: 2349, dur: 0.35, gain: 0.06 });
};
SFXKit.prototype.fanfare = function (noteIdx) { /* I–IV–V–I, 112 BPM, triangle+sine sub */
  var bpm = 112, beat = 60 / bpm;
  var chords = [[262, 330, 392], [349, 440, 523], [392, 494, 587], [262, 330, 392]];
  if (noteIdx != null) {                        /* single beat (celebration hook) */
    this._triad(chords[noteIdx % 4], 0, beat * 0.9);
    return;
  }
  for (var i = 0; i < 4; i++) this._triad(chords[i], i * beat, beat * 0.9); /* 1.6s */
};
SFXKit.prototype._triad = function (freqs, delay, dur) {
  for (var i = 0; i < freqs.length; i++) {
    this.voice({ type: "triangle", freq: freqs[i], dur: dur, gain: 0.08, delay: delay });
  }
  this.voice({ type: "sine", freq: freqs[0] / 2, dur: dur, gain: 0.1, delay: delay });
};

/* ==========================================================================
 * Music — 2-bar pentatonic loop generator (90–112 BPM, C major pentatonic),
 * triangle melody + sine bass + noise hat on off-beats (gain 0.05).
 * +1 semitone per tier helper (doctrine: +1 semitone every 3 levels).
 * ======================================================================== */
var PENTATONIC = [262, 294, 330, 392, 440, 523, 587, 659];   // C major pentatonic, 2 octaves
var BASS_ROOTS = { C: [131, 175, 196, 131], F: [175, 131, 196, 175], G: [196, 175, 131, 196] };

function seededWalk(seed, len) {
  /* deterministic melodic walk over the pentatonic scale — no wrong notes */
  var s = seed >>> 0, out = [], idx = 2;
  function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
  for (var i = 0; i < len; i++) {
    var r = rnd();
    idx += r < 0.45 ? 1 : r < 0.9 ? -1 : 0;
    idx = Math.max(0, Math.min(PENTATONIC.length - 1, idx));
    out.push(rnd() < 0.2 ? 0 : PENTATONIC[idx]);           // rests keep it sparse
  }
  return out;
}

SFXKit.prototype.startMusic = function (opts) {
  opts = opts || {};
  var c = this.ensure();
  if (!c) return;
  this.stopMusic();
  this.music.playing = true;
  this.music.bpm = Math.max(90, Math.min(112, opts.bpm || 100));
  this.music.seed = opts.seed != null ? opts.seed : 7;
  this.music.tier = opts.tier || 0;
  this.music.key = opts.key || "C";
  this.music.melody = seededWalk(this.music.seed, 16);      // 2 bars × 8 eighth notes
  this.music.step = 0;
  this.music.nextTime = c.currentTime + 0.1;

  var self = this;
  this._musicTimer = global.setInterval(function () { self._schedule(); }, 100);
};
SFXKit.prototype._schedule = function () {
  var c = this.ctx, m = this.music;
  if (!m.playing || !c) return;
  var eighth = 60 / m.bpm / 2;
  var transpose = Math.pow(2, m.tier / 12);                 // +1 semitone per tier
  while (m.nextTime < c.currentTime + 0.25) {               // 250ms lookahead
    var s = m.step % 16, bar = Math.floor(s / 8) % 2;
    var t = m.nextTime - c.currentTime;
    /* melody — triangle, pentatonic */
    var note = m.melody[s];
    if (note) {
      this.voice({ type: "triangle", freq: note * transpose, dur: eighth * 0.9, gain: 0.5, delay: t, bus: "music" });
    }
    /* bass — sine root on downbeats, fifth on beat 3 */
    if (s % 4 === 0) {
      var roots = BASS_ROOTS[m.key] || BASS_ROOTS.C;
      var bf = roots[Math.floor(s / 4) % 4];
      if (s % 8 === 4) bf *= 1.5;
      this.voice({ type: "sine", freq: bf * transpose, dur: eighth * 3.5, gain: 0.5, delay: t, bus: "music" });
    }
    /* noise hat on off-beats at gain 0.05 */
    if (s % 2 === 1) {
      this.voice({ noise: true, filter: { type: "highpass", freq: 6000 }, dur: 0.03, gain: 0.28, delay: t, bus: "music" });
    }
    m.nextTime += eighth;
    m.step++;
  }
};
SFXKit.prototype.stopMusic = function () {
  this.music.playing = false;
  if (this._musicTimer) { global.clearInterval(this._musicTimer); this._musicTimer = 0; }
};
/* Doctrine emotional mapping: hurry mode = +12 BPM, +1 semitone. */
SFXKit.prototype.hurry = function () {
  if (!this.music.playing) return;
  var opts = { bpm: this.music.bpm + 12, seed: this.music.seed, tier: this.music.tier + 1, key: this.music.key };
  this.startMusic(opts);
};
/* Failure screen: stop music, one warm I chord, no sting loop. */
SFXKit.prototype.failureChord = function () {
  this.stopMusic();
  this._triad([262, 330, 392], 0, 0.9);
};

/* ---- volume / mute ------------------------------------------------------ */
SFXKit.prototype.setMusicVolume = function (v) { if (this.ready) this.musicBus.gain.value = Math.max(0, Math.min(1, v)); };
SFXKit.prototype.setSfxVolume   = function (v) { if (this.ready) this.sfxBus.gain.value = Math.max(0, Math.min(1, v)); };
SFXKit.prototype.setMuted = function (on) {
  this.muted = !!on;
  if (this.muted) this.stopMusic();
};

global.VeeSFX = new SFXKit();
global.VeeSFX.Kit = SFXKit;                 /* exported for tests / alt kits */
})(typeof window !== "undefined" ? window : this);
