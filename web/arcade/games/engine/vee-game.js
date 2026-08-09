/* ============================================================================
 * vee-game.js — Vee Arcade shared engine ("Paper Playground" runtime)
 *
 * Implements the DESIGN-BIBLE mechanically: locked tokens, fixed-timestep
 * loop, seeded wobble art, paper textures, juice budgets, fairness helpers,
 * HUD chrome and the parent-frame harness.
 *
 * Load order:  <script src="../vee-game.js"></script>
 *              <script src="../vee-sfx.js"></script>      (optional)
 * Exposes:     window.VeeGame
 * ========================================================================== */
(function (global) {
"use strict";

/* --------------------------------------------------------------------------
 * 0. Seeded randomness — wobble must be stable per object, never shimmering
 * ------------------------------------------------------------------------ */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* --------------------------------------------------------------------------
 * 1. DESIGN — the locked token module. Games import tokens, never hex codes.
 *    (doctrine §3a palette, §3b easing/timing/squash, §3c juice budgets)
 * ------------------------------------------------------------------------ */
var DESIGN = {
  /* §3a — "Violet's Workshop" master palette */
  colors: {
    paper:   "#FFF6E4",
    paper2:  "#F7E9CE",
    paper3:  "#EDDAB6",
    ink:     "#3A2B46",
    inkSoft: "#5C4A6E",
    violet:  "#8A5BD6",
    sun:     "#FFB63D",
    leaf:    "#4FBE6A",
    berry:   "#E0503C",
    sky:     "#7EB8F0"
  },
  inkRGBA: function (a) { return "rgba(58,43,70," + a + ")"; },

  /* §3a — reference geometry */
  refWidth: 960,                       // reference canvas width (px)
  outlineWidth: function (scale) {     // 2px at 960, never below 1.5px
    return Math.max(1.5, 2 * scale);
  },

  /* §3b — easing library (named curves only; browser `ease` is banned) */
  easing: {
    linear:    function (t) { return t; },
    easeOut:   function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },       // (0.16,1,0.3,1)
    easeIn:    function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * (t - 1)); },      // (0.7,0,0.84,0)
    easeInOut: function (t) {                                                          // (0.65,0,0.35,1)
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    pop:       function (t) {                                                          // (0.34,1.56,0.64,1) — game-physical only
      var c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  },

  /* §3b — timing canon (ms). Exit rule: exit = 75% of enter. */
  timing: {
    instant: 100,
    short: 180,
    medium: 280,
    long: 450,
    exit: function (enterMs) { return Math.round(enterMs * 0.75); },
    stagger: 60,           // per item, total cap 500ms
    staggerCap: 500
  },

  /* §3b — squash & stretch character-feel table */
  squash: {
    jumpAnticipate: { sx: 1.12, sy: 0.85, ms: 90,  curve: "easeIn"  },
    jumpLaunch:     { sx: 0.85, sy: 1.18, ms: 120, curve: "easeOut" },
    airPeak:        { sx: 1.05, sy: 0.97, ms: 0,   curve: "linear"  },
    landing:        { sx: 1.25, sy: 0.75, msDown: 80, msRecover: 160, curve: "pop" },
    hit:            { sx: 1.3,  sy: 0.7,  ms: 100, curve: "easeOut" },
    idleBreath:     { amp: 0.02, periodMs: 2400 },
    blink:          { ms: 140, minGap: 3000, maxGap: 5000, eyeOffsetMs: 80 }
  },

  /* §3c — global juice budgets */
  budgets: {
    hitStop:  { normal: 60, big: 90, clear: 120 },
    shakeAmp: { normal: 4, max: 6 },          // px; never on failure
    shakeDecayMs: [180, 250],
    particlePool: 256,
    bursts: { spark: 8, confetti: 24, explosion: 32, trail: 2 },
    flash: { maxAlpha: 0.08, maxMs: 80, minGapMs: 334 }, // ≤ 3 Hz
    maxSimultaneous: 3,
    celebrationMaxMs: 2000
  },

  /* §3f — fairness defaults */
  fairness: {
    inputBufferMs: 120,
    coyoteMs: 100,
    platformGraceMs: 250,
    comboCap: 5
  },

  /* §3a — parallax speed ratios (L0 sky … L4 near) */
  parallax: [0.1, 0.25, 0.5, 1.0, 1.3]
};

/* --------------------------------------------------------------------------
 * 2. Juice gate — reducedJuice (prefers-reduced-motion + manual toggle)
 * ------------------------------------------------------------------------ */
var Juice = {
  reduced: false,
  _listeners: [],
  init: function () {
    try {
      var mq = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq && mq.matches) this.reduced = true;
      var self = this;
      if (mq && mq.addEventListener) mq.addEventListener("change", function (e) {
        self.reduced = e.matches || self._manual === true ? self.reduced : false;
        self._notify();
      });
    } catch (e) { /* matchMedia unavailable — keep full juice */ }
  },
  setReduced: function (on) { this.reduced = !!on; this._manual = !!on; this._notify(); },
  toggle: function () { this.setReduced(!this.reduced); return this.reduced; },
  onChange: function (fn) { this._listeners.push(fn); },
  _notify: function () { for (var i = 0; i < this._listeners.length; i++) this._listeners[i](this.reduced); }
};
Juice.init();

/* --------------------------------------------------------------------------
 * 3. Canvas setup — DPI-aware, reference width 960, letterbox-friendly
 * ------------------------------------------------------------------------ */
function setupCanvas(canvas, opts) {
  opts = opts || {};
  var view = {
    w: opts.width || DESIGN.refWidth,
    h: opts.height || Math.round((opts.width || DESIGN.refWidth) * 9 / 16),
    dpr: 1, scale: 1
  };
  var ctx = canvas.getContext("2d");

  function resize() {
    var dpr = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var cw = rect.width || view.w, ch = rect.height || view.h;
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // games draw in CSS px
    view.dpr = dpr;
    view.w = cw; view.h = ch;
    view.scale = cw / DESIGN.refWidth;      // doctrine scaling factor
  }
  resize();
  global.addEventListener("resize", resize);
  return { canvas: canvas, ctx: ctx, view: view, resize: resize };
}

/* --------------------------------------------------------------------------
 * 4. Paper-craft textures — pre-rendered ONCE to offscreen canvases.
 *    Re-randomizing per frame is the shimmer anti-pattern (§5 risk table).
 * ------------------------------------------------------------------------ */
var textureCache = {};

function makeOffscreen(w, h) {
  var c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function paperGrainCanvas(seed) {
  seed = seed || 1;
  var key = "grain" + seed;
  if (textureCache[key]) return textureCache[key];
  var c = makeOffscreen(128, 128), g = c.getContext("2d");
  var rnd = mulberry32(seed);
  for (var i = 0; i < 300; i++) {
    g.fillStyle = DESIGN.inkRGBA(0.03 + rnd() * 0.02);   // ink at 3–5% alpha
    g.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), 1, 1);
  }
  textureCache[key] = c;
  return c;
}

function halftoneCanvas(color) {
  var key = "halftone" + (color || "ink");
  if (textureCache[key]) return textureCache[key];
  var c = makeOffscreen(12, 12), g = c.getContext("2d");   // 12px spacing
  g.fillStyle = color || DESIGN.colors.ink;
  g.beginPath();
  g.arc(6, 6, 1.5, 0, Math.PI * 2);                        // 1.5px dots
  g.fill();
  textureCache[key] = c;
  return c;
}

function pattern(ctx, kind, color, seed) {
  var c = kind === "halftone" ? halftoneCanvas(color) : paperGrainCanvas(seed);
  return ctx.createPattern(c, "repeat");
}

/* --------------------------------------------------------------------------
 * 5. Wobble drawing — seeded ±1px vertex jitter, ±1.5° rotation (§3a)
 * ------------------------------------------------------------------------ */
function jitter(rnd, amp) { return (rnd() - 0.5) * 2 * amp; }

/* Wobbly rounded rect: the core cut-paper primitive. */
function wobblyRectPath(ctx, x, y, w, h, seed, r) {
  var rnd = mulberry32(hashSeed(String(seed)));
  r = Math.min(r == null ? 8 : r, w / 2, h / 2);
  var rot = jitter(rnd, 1.5) * Math.PI / 180;             // ±1.5°
  var cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.translate(-cx, -cy);
  var J = 1;                                                // ±1px jitter
  var p = [
    [x + r, y], [x + w - r, y],
    [x + w, y + r], [x + w, y + h - r],
    [x + w - r, y + h], [x + r, y + h],
    [x, y + h - r], [x, y + r]
  ];
  ctx.beginPath();
  for (var i = 0; i < p.length; i++) {
    var px = p[i][0] + jitter(rnd, J), py = p[i][1] + jitter(rnd, J);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.restore();
}

/* Wobbly blob (quadratic curves — never sharp polygons). */
function wobblyBlobPath(ctx, cx, cy, rx, ry, seed, points) {
  var rnd = mulberry32(hashSeed(String(seed)));
  points = points || 8;
  var rot = jitter(rnd, 1.5) * Math.PI / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  var pts = [];
  for (var i = 0; i < points; i++) {
    var a = (i / points) * Math.PI * 2;
    var jr = 1 + jitter(rnd, 0.05);
    pts.push([Math.cos(a) * rx * jr + jitter(rnd, 1), Math.sin(a) * ry * jr + jitter(rnd, 1)]);
  }
  ctx.beginPath();
  for (i = 0; i < points; i++) {
    var p0 = pts[i], p1 = pts[(i + 1) % points];
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(p1[0], p1[1],
      (p1[0] + pts[(i + 2) % points][0]) / 2, (p1[1] + pts[(i + 2) % points][1]) / 2);
  }
  ctx.closePath();
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 6. Sprite render recipe (§5): shadow pass → fill → texture detail →
 *    2px outline + one highlight stroke. `shadowBlur` is banned.
 * ------------------------------------------------------------------------ */
function drawSprite(ctx, o) {
  var lw = o.outlineWidth != null ? o.outlineWidth : DESIGN.outlineWidth(o.scale || 1);
  var path = o.blob
    ? function () { wobblyBlobPath(ctx, o.x, o.y, o.w / 2, o.h / 2, o.seed || 1, o.points); }
    : function () { wobblyRectPath(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, o.seed || 1, o.radius); };

  /* 1 — hard-offset flat shadow (3px 3px 0 ink @0.9) */
  if (o.shadow !== false) {
    var s = o.shadowOffset || 3;
    ctx.save();
    ctx.translate(s, s);
    path();
    ctx.fillStyle = o.shadowColor || DESIGN.inkRGBA(0.9);
    ctx.fill();
    ctx.restore();
  }
  /* 2 — flat fill */
  path();
  ctx.fillStyle = o.fill;
  ctx.fill();
  /* 3 — texture detail (halftone / grain clipped to shape) */
  if (o.texture) {
    ctx.save();
    path();
    ctx.clip();
    ctx.globalAlpha = o.texture === "grain" ? 0.15 : 0.2;
    ctx.fillStyle = pattern(ctx, o.texture, o.textureColor, o.seed);
    ctx.fillRect(o.x - o.w, o.y - o.h, o.w * 2, o.h * 2);
    ctx.restore();
  }
  /* 4 — 2px ink outline + one highlight stroke at 30% white */
  path();
  ctx.lineWidth = lw;
  ctx.strokeStyle = o.outline || DESIGN.colors.ink;
  ctx.stroke();
  if (o.highlight !== false) {
    ctx.save();
    path();
    ctx.clip();
    ctx.lineWidth = lw;
    ctx.strokeStyle = "rgba(255,252,245,0.3)";
    ctx.beginPath();
    ctx.moveTo(o.x - o.w * 0.32, o.y - o.h * 0.32);
    ctx.lineTo(o.x + o.w * 0.1, o.y - o.h * 0.38);
    ctx.stroke();
    ctx.restore();
  }
}

/* Crayon stroke: 3 overlapping jittered passes at 0.35 alpha. */
function crayonStroke(ctx, points, color, width) {
  var rnd = mulberry32(hashSeed("crayon"));
  ctx.save();
  ctx.strokeStyle = color || DESIGN.colors.ink;
  ctx.lineWidth = width || 2;
  ctx.lineCap = "round";
  for (var pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
      var px = points[i][0] + jitter(rnd, 1), py = points[i][1] + jitter(rnd, 1);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 7. Fixed-timestep loop — accumulator pattern, 60Hz sim, render
 *    interpolation, pause-on-hidden-tab, hit-stop + slow-motion support.
 * ------------------------------------------------------------------------ */
function createLoop(hooks) {
  var STEP = 1 / 60;
  var acc = 0, last = 0, rafId = 0, running = false;
  var hitStopUntil = 0, timeScale = 1, simTime = 0;

  function frame(now) {
    if (!running) return;
    rafId = global.requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }           // pause on hidden tab
    var dt = Math.min((now - last) / 1000, 0.25);          // clamp tab-restore spikes
    last = now;

    if (now < hitStopUntil) { hooks.render && hooks.render(1); return; }
    acc += dt * timeScale;
    while (acc >= STEP) {
      simTime += STEP;
      hooks.update && hooks.update(STEP, simTime);
      acc -= STEP;
    }
    hooks.render && hooks.render(acc / STEP);               // interpolation alpha
  }

  return {
    start: function () {
      if (running) return;
      running = true;
      last = global.performance.now();
      rafId = global.requestAnimationFrame(frame);
    },
    stop: function () { running = false; global.cancelAnimationFrame(rafId); },
    get running() { return running; },
    hitStop: function (ms) {                                 // §3c budgeted freeze
      ms = Math.min(ms, DESIGN.budgets.hitStop.clear);
      hitStopUntil = global.performance.now() + ms;
    },
    slowMotion: function (factor, ms) {                      // near-miss: 0.6× for 200ms
      timeScale = factor;
      global.setTimeout(function () { timeScale = 1; }, ms);
    },
    get simTime() { return simTime; }
  };
}

/* --------------------------------------------------------------------------
 * 8. Input — keyboard + touch + one-switch; 120ms buffer, coyote helper,
 *    hold-to-repeat 300/100 (§3f-5, §3g).
 * ------------------------------------------------------------------------ */
var DEFAULT_ACTIONS = {
  left:  ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
  up:    ["ArrowUp", "w", "W"],
  down:  ["ArrowDown", "s", "S"],
  action:[" ", "Enter", "z", "Z"],
  pause: ["Escape", "p", "P"]
};

function createInput(opts) {
  opts = opts || {};
  var bufferMs = opts.bufferMs != null ? opts.bufferMs : DESIGN.fairness.inputBufferMs;
  var map = opts.actions || DEFAULT_ACTIONS;
  var held = {}, buffered = {}, listeners = { action: [], any: [] };
  var oneSwitch = !!opts.oneSwitch;
  var touchStart = null;

  function actionFor(key) {
    for (var a in map) if (map[a].indexOf(key) >= 0) return a;
    return null;
  }
  function onDown(a) {
    buffered[a] = global.performance.now();
    for (var i = 0; i < listeners.action.length; i++) listeners.action[i](a);
    for (i = 0; i < listeners.any.length; i++) listeners.any[i](a);
  }

  global.addEventListener("keydown", function (e) {
    var a = actionFor(e.key);
    if (!a) return;
    e.preventDefault();
    if (held[a] && !e.repeat) return;
    held[a] = true;
    if (!e.repeat) onDown(a);
  });
  global.addEventListener("keyup", function (e) {
    var a = actionFor(e.key);
    if (a) held[a] = false;
  });

  /* Touch: tap = action, swipe = direction; one-switch = any press advances */
  global.addEventListener("touchstart", function (e) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (oneSwitch) onDown("action");
  }, { passive: true });
  global.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (oneSwitch) return;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { onDown("action"); return; }
    onDown(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left")
                                       : (dy > 0 ? "down" : "up"));
  }, { passive: true });

  return {
    isHeld: function (a) { return !!held[a]; },
    /* Early presses count for bufferMs (§3f fairness rule 5). */
    consumeBuffered: function (a) {
      var t = buffered[a];
      if (t != null && global.performance.now() - t <= bufferMs) {
        buffered[a] = null;
        return true;
      }
      return false;
    },
    /* Late jumps off edges count — call land()/leave() on ground changes. */
    coyote: function (ms) {
      var lastGround = -1e9;
      var win = ms != null ? ms : DESIGN.fairness.coyoteMs;
      return {
        land: function () { lastGround = global.performance.now(); },
        leave: function () { /* timer keeps running */ },
        canJump: function () {
          if (global.performance.now() - lastGround <= win) { lastGround = -1e9; return true; }
          return false;
        }
      };
    },
    onAction: function (fn) { listeners.action.push(fn); },
    onAny: function (fn) { listeners.any.push(fn); },
    setOneSwitch: function (on) { oneSwitch = !!on; },
    actions: map
  };
}

/* --------------------------------------------------------------------------
 * 9. Particles — pool capped at 256 (§3c), burst presets from doctrine.
 * ------------------------------------------------------------------------ */
function ParticlePool(cap) {
  this.cap = cap || DESIGN.budgets.particlePool;
  this.p = [];
}
ParticlePool.prototype.spawn = function (n, spec) {
  if (Juice.reduced && spec.kind === "confetti") n = Math.ceil(n * 0.25); // −75%
  for (var i = 0; i < n; i++) {
    if (this.p.length >= this.cap) break;
    var a = spec.angle != null
      ? spec.angle + (Math.random() - 0.5) * (spec.spread != null ? spec.spread : Math.PI / 3)
      : Math.random() * Math.PI * 2;
    var v = (spec.speed || 120) * (0.6 + Math.random() * 0.6);
    this.p.push({
      kind: spec.kind || "spark",
      x: spec.x, y: spec.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - (spec.up || 0),
      g: spec.gravity != null ? spec.gravity : 400,
      life: 0, ttl: spec.ttl || 0.8,
      size: spec.size || 4,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 8,
      color: spec.colors ? spec.colors[i % spec.colors.length] : (spec.color || DESIGN.colors.sun)
    });
  }
};
ParticlePool.prototype.burst = function (kind, x, y) {
  var B = DESIGN.budgets.bursts, C = DESIGN.colors;
  var presets = {
    spark:     { n: B.spark,     kind: "spark",    speed: 160, ttl: 0.5, size: 3, color: C.sun },
    confetti:  { n: B.confetti,  kind: "confetti", speed: 180, ttl: 1.4, size: 6, gravity: 400, up: 120,
                 colors: [C.sun, C.leaf, C.berry, C.sky, C.violet] },
    explosion: { n: B.explosion, kind: "spark",    speed: 240, ttl: 0.7, size: 4, colors: [C.sun, C.berry, C.paper3] },
    trail:     { n: B.trail,     kind: "spark",    speed: 20,  ttl: 0.4, size: 2, color: C.paper3 }
  };
  var spec = presets[kind] || presets.spark;
  spec.x = x; spec.y = y;
  this.spawn(spec.n, spec);
};
ParticlePool.prototype.update = function (dt) {
  for (var i = this.p.length - 1; i >= 0; i--) {
    var q = this.p[i];
    q.life += dt;
    if (q.life >= q.ttl) { this.p.splice(i, 1); continue; }
    q.vy += q.g * dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.rot += q.spin * dt;
  }
};
ParticlePool.prototype.render = function (ctx) {
  for (var i = 0; i < this.p.length; i++) {
    var q = this.p[i];
    var fade = 1 - q.life / q.ttl;
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.rot);
    ctx.globalAlpha = fade;
    ctx.fillStyle = q.color;
    if (q.kind === "confetti") {
      ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, q.size * fade, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};

/* --------------------------------------------------------------------------
 * 10. Screen shake — ≤4px normal / 6px max, exponential decay, translated
 *     not rotated, OFF in reducedJuice, NEVER on failure (§3c, §3f-2).
 * ------------------------------------------------------------------------ */
function createShake() {
  var amp = 0, until = 0, decayMs = 200, started = 0;
  return {
    trigger: function (px, ms) {
      if (Juice.reduced) return;
      amp = Math.min(px || 3, DESIGN.budgets.shakeAmp.max);
      decayMs = ms || DESIGN.budgets.shakeDecayMs[0];
      started = global.performance.now();
      until = started + decayMs;
    },
    /* apply as ctx.translate before drawing the world */
    offset: function () {
      var now = global.performance.now();
      if (now >= until) return [0, 0];
      var t = (now - started) / decayMs;
      var a = amp * Math.pow(1 - t, 2);                    // exponential decay
      return [(Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a];
    }
  };
}

/* --------------------------------------------------------------------------
 * 11. Flash helper — white overlay ≤8% alpha, ≤80ms, rate-limited to 3Hz.
 * ------------------------------------------------------------------------ */
function createFlash() {
  var active = 0, lastFire = -1e9;
  return {
    fire: function (alpha, ms) {
      var now = global.performance.now();
      if (now - lastFire < DESIGN.budgets.flash.minGapMs) return; // ≤3Hz
      lastFire = now;
      active = { a: Math.min(alpha || 0.06, DESIGN.budgets.flash.maxAlpha),
                 until: now + Math.min(ms || 60, DESIGN.budgets.flash.maxMs) };
    },
    render: function (ctx, w, h) {
      if (!active) return;
      var now = global.performance.now();
      if (now >= active.until) { active = 0; return; }
      ctx.save();
      ctx.globalAlpha = active.a;
      ctx.fillStyle = "#FFFDF5";                            // warm white, never pure #fff
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  };
}

/* --------------------------------------------------------------------------
 * 12. Celebration choreography — the mandatory 3-beat level-clear routine
 *     (§3c). Skippable, ≤2s total. Hooks let games plug SFX + star flight.
 * ------------------------------------------------------------------------ */
function celebrate(fx, hooks) {
  hooks = hooks || {};
  var B = DESIGN.budgets;
  var timeline = [
    { at: 0,    run: function () { fx.loop.hitStop(B.hitStop.big); fx.flash.fire(0.06, 60);
                                   hooks.note && hooks.note(0); } },
    { at: 400,  run: function () { fx.particles.burst("confetti", hooks.cx || 480, hooks.cy || 270);
                                   hooks.stars && hooks.stars(DESIGN.timing.stagger);
                                   hooks.note && hooks.note(1); } },
    { at: 600,  run: function () { hooks.note && hooks.note(2); } },
    { at: 800,  run: function () { hooks.note && hooks.note(3); } },
    { at: 1200, run: function () { hooks.card && hooks.card({ ms: 450, curve: DESIGN.easing.pop,
                                   rise: 8, from: 0.9 });
                                   hooks.countUp && hooks.countUp(1200); } }
  ];
  var started = null, idx = 0, done = false;
  return {
    update: function (dtMs) {
      if (done) return true;
      if (started == null) started = global.performance.now();
      var t = global.performance.now() - started;
      while (idx < timeline.length && timeline[idx].at <= t) timeline[idx++].run();
      if (t >= B.celebrationMaxMs) { done = true; hooks.finish && hooks.finish(); }
      return done;
    },
    skip: function () {                                    // consent rule: input skips
      done = true; hooks.finish && hooks.finish();
    },
    get finished() { return done; }
  };
}

/* --------------------------------------------------------------------------
 * 13. Scene/state machine
 * ------------------------------------------------------------------------ */
function StateMachine(game) {
  this.game = game;
  this.scenes = {};
  this.current = null;
  this.name = "";
}
StateMachine.prototype.add = function (name, scene) { this.scenes[name] = scene; return this; };
StateMachine.prototype.goto = function (name, params) {
  if (this.current && this.current.exit) this.current.exit(params);
  this.name = name;
  this.current = this.scenes[name];
  if (this.current && this.current.enter) this.current.enter(params);
};
StateMachine.prototype.update = function (dt, t) { if (this.current && this.current.update) this.current.update(dt, t); };
StateMachine.prototype.render = function (alpha) { if (this.current && this.current.render) this.current.render(alpha); };

/* --------------------------------------------------------------------------
 * 14. HUD helpers — washi panels, pill buttons, tabular score counters.
 *     Canvas text floor: 18px (§3g).
 * ------------------------------------------------------------------------ */
function washiPanel(ctx, x, y, w, h, opts) {
  opts = opts || {};
  ctx.save();
  /* shadow pass + panel */
  ctx.fillStyle = DESIGN.inkRGBA(0.9);
  ctx.fillRect(x + 3, y + 3, w, h);
  ctx.fillStyle = opts.fill || DESIGN.colors.paper2;
  ctx.strokeStyle = DESIGN.colors.ink;
  ctx.lineWidth = DESIGN.outlineWidth(opts.scale || 1);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, 12) : ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  /* washi-tape corner accents (alpha 0.6, ±4° rotation) */
  var tape = function (tx, ty, rot) {
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = opts.tape || DESIGN.colors.violet;
    ctx.fillRect(-22, -7, 44, 14);
    ctx.restore();
  };
  tape(x + 4, y + 4, -4 * Math.PI / 180);
  tape(x + w - 4, y + h - 4, 3 * Math.PI / 180);
  ctx.restore();
}

/* Score counter with tabular-nums tick-up (canvas-safe: fixed digit slots). */
function ScoreCounter(opts) {
  opts = opts || {};
  this.value = 0;
  this.shown = 0;
  this.animStart = 0;
  this.animFrom = 0;
  this.animMs = opts.ms || 200;                            // §3c: 200ms tick-up
  this.popUntil = 0;
}
ScoreCounter.prototype.add = function (n) {
  this.animFrom = this.shown;
  this.value += n;
  this.animStart = global.performance.now();
  this.popUntil = this.animStart + this.animMs;            // 1→1.25→1 pop
};
ScoreCounter.prototype.update = function () {
  var now = global.performance.now();
  var t = Math.min(1, (now - this.animStart) / this.animMs);
  this.shown = Math.round(this.animFrom + (this.value - this.animFrom) * DESIGN.easing.easeOut(t));
};
ScoreCounter.prototype.render = function (ctx, x, y, size) {
  size = Math.max(18, size || 24);                          // 18px floor
  var now = global.performance.now();
  var s = 1;
  if (now < this.popUntil) {
    var t = 1 - (this.popUntil - now) / this.animMs;
    s = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, t));      // 1→1.25→1
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.font = "700 " + size + "px 'Baloo 2','Fredoka','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";
  ctx.textBaseline = "middle";
  /* tabular layout: every digit gets the widest digit's advance */
  var text = String(this.shown);
  var adv = ctx.measureText("0").width;
  for (var i = 0; i < text.length; i++) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = DESIGN.colors.paper;
    ctx.strokeText(text[i], i * adv, 0);
    ctx.fillStyle = DESIGN.colors.ink;
    ctx.fillText(text[i], i * adv, 0);
  }
  ctx.restore();
};

/* Pill button (canvas chrome) with physical press: translate + shadow drop. */
function pillButton(ctx, b) {
  var pressed = b.pressed;
  var x = b.x + (pressed ? 2 : 0), y = b.y + (pressed ? 2 : 0);
  ctx.save();
  if (!pressed) {
    ctx.fillStyle = DESIGN.inkRGBA(0.9);                    // hard 3px 3px shadow
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + 3, y + 3, b.w, b.h, b.h / 2) : ctx.rect(x + 3, y + 3, b.w, b.h);
    ctx.fill();
  }
  ctx.fillStyle = pressed ? DESIGN.colors.paper3 : (b.fill || DESIGN.colors.sun);
  ctx.strokeStyle = DESIGN.colors.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, b.w, b.h, b.h / 2) : ctx.rect(x, y, b.w, b.h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = DESIGN.colors.ink;
  ctx.font = "700 " + Math.max(18, b.fontSize || 20) + "px 'Baloo 2','Fredoka','Comic Sans MS',sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(b.label, x + b.w / 2, y + b.h / 2 + 1);
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 15. Parent-frame harness — postMessage protocol + localStorage high scores
 * ------------------------------------------------------------------------ */
function createHarness(gameId) {
  var hsKey = "vee.arcade.hiscore." + gameId;
  function post(topic, payload) {
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage({
          source: "vee-arcade",
          topic: topic,
          gameId: gameId,
          payload: payload || {},
          t: Date.now()
        }, "*");
      }
    } catch (e) { /* parent frame gone — ignore */ }
  }
  return {
    gameId: gameId,
    /* lifecycle → desktop (consumed as arcade.game.ended / arcade.game.quit) */
    gameEnded: function (score) { post("arcade.game.ended", { score: score || 0 }); },
    gameQuit:  function (score) { post("arcade.game.quit",  { score: score || 0 }); },
    scoreUpdate: function (score) { post("arcade.game.score", { score: score || 0 }); },
    /* per-game localStorage high scores (honest data only — §principle 14) */
    highScore: function () {
      try { return parseInt(global.localStorage.getItem(hsKey) || "0", 10) || 0; }
      catch (e) { return 0; }
    },
    submitScore: function (score) {
      var best = this.highScore();
      var isNew = score > best;
      if (isNew) { try { global.localStorage.setItem(hsKey, String(score)); } catch (e) {} }
      post("arcade.game.score", { score: score, best: Math.max(score, best), newRecord: isNew });
      return { best: Math.max(score, best), newRecord: isNew };
    }
  };
}

/* --------------------------------------------------------------------------
 * Export
 * ------------------------------------------------------------------------ */
global.VeeGame = {
  DESIGN: DESIGN,
  Juice: Juice,
  mulberry32: mulberry32,
  hashSeed: hashSeed,
  setupCanvas: setupCanvas,
  paperGrainCanvas: paperGrainCanvas,
  halftoneCanvas: halftoneCanvas,
  pattern: pattern,
  wobblyRectPath: wobblyRectPath,
  wobblyBlobPath: wobblyBlobPath,
  drawSprite: drawSprite,
  crayonStroke: crayonStroke,
  createLoop: createLoop,
  createInput: createInput,
  ParticlePool: ParticlePool,
  createShake: createShake,
  createFlash: createFlash,
  celebrate: celebrate,
  StateMachine: StateMachine,
  washiPanel: washiPanel,
  ScoreCounter: ScoreCounter,
  pillButton: pillButton,
  createHarness: createHarness
};
})(typeof window !== "undefined" ? window : this);
