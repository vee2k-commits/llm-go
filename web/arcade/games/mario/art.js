/* ============================================================================
 * art.js — "Violet's Big Fold-Out" procedural paper-craft art
 *
 * Doctrine §5 risk table, honored here:
 *   - every static sprite is cached to an offscreen canvas ONCE (2× super-
 *     sampled so they stay crisp at any DPI) — no per-frame procedural cost
 *   - grain/halftone come from the engine's pre-rendered patterns
 *   - hard-offset flat shadows only — `shadowBlur` never appears
 *   - wobble is seeded per object (stable, never shimmering)
 *   - outline hierarchy: 1px background, 2px play objects, 3px Violet/stars
 * ========================================================================== */
(function (global) {
"use strict";
var VG = global.VeeGame, D = VG.DESIGN, C = D.colors;
var FO = global.FoldOut = global.FoldOut || {};
var art = FO.art = {};

var SS = 2;                     /* super-sample factor for cached sprites */
var T = 64;                     /* cache tile size (2× of 32px logical)  */
var FONT_D = "'Baloo 2','Fredoka','Comic Sans MS','Chalkboard SE',sans-serif";
art.FONT_D = FONT_D;

/* ---------------------------------------------------------- tiny utils -- */
function inkA(a) { return "rgba(58,43,70," + a + ")"; }
function warmA(a) { return "rgba(255,252,245," + a + ")"; }

function rr(g, x, y, w, h, r) {
  if (g.roundRect) { g.beginPath(); g.roundRect(x, y, w, h, r); return; }
  g.beginPath(); g.rect(x, y, w, h);
}

/* draw at super-sample resolution, cache the canvas */
function makeSprite(key, w, h, fn) {
  if (art.cache[key]) return art.cache[key];
  var c = document.createElement("canvas");
  c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS);
  var g = c.getContext("2d");
  g.scale(SS, SS);
  g.lineJoin = "round"; g.lineCap = "round";
  fn(g, w, h);
  art.cache[key] = c;
  return c;
}
function blit(ctx, img, x, y, w, h) { ctx.drawImage(img, x, y, w, h); }
art.blit = blit;

/* --------------------------------------------------------------- tiles -- */
function grassTile(g, pal) {
  VG.wobblyRectPath(g, 1, 3, 30, 29, "g" + pal.sky, 5);
  g.fillStyle = C.paper3; g.fill();
  /* leafy top lip — the meadow edge of the page */
  VG.wobblyRectPath(g, 1, 1, 30, 11, "gl" + pal.sky, 5);
  g.fillStyle = pal.near; g.fill();
  g.save();
  VG.wobblyRectPath(g, 1, 1, 30, 30, "gg" + pal.sky, 5);
  g.clip();
  g.globalAlpha = 0.13;
  g.fillStyle = VG.pattern(g, "grain", null, 3);
  g.fillRect(0, 0, 32, 32);
  g.globalAlpha = 1;
  g.restore();
  VG.wobblyRectPath(g, 1, 1, 30, 30, "gg" + pal.sky, 5);
  g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  /* one highlight stroke at 30% warm-white */
  g.strokeStyle = warmA(0.3); g.lineWidth = 2;
  g.beginPath(); g.moveTo(5, 6); g.lineTo(13, 5); g.stroke();
}
function dirtTile(g, pal) {
  VG.wobblyRectPath(g, 1, 1, 30, 30, "d" + pal.sky, 4);
  g.fillStyle = pal.far; g.fill();
  g.save();
  VG.wobblyRectPath(g, 1, 1, 30, 30, "d" + pal.sky, 4);
  g.clip();
  g.globalAlpha = 0.2;
  g.fillStyle = VG.pattern(g, "halftone", inkA(0.5));
  g.fillRect(0, 0, 32, 32);
  g.restore();
  VG.wobblyRectPath(g, 1, 1, 30, 30, "d" + pal.sky, 4);
  g.lineWidth = 1.5; g.strokeStyle = inkA(0.85); g.stroke();
}
function blockTile(g, pal) {           /* plain paper block (pipe bases etc.) */
  VG.wobblyRectPath(g, 1, 1, 30, 30, "b" + pal.sky, 4);
  g.fillStyle = C.paper3; g.fill();
  VG.wobblyRectPath(g, 1, 1, 30, 30, "b" + pal.sky, 4);
  g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
}

/* -------------------------------------------------------- gift blocks -- */
function bow(g, cx, cy, s, color) {
  g.fillStyle = color; g.strokeStyle = C.ink; g.lineWidth = 1.5;
  VG.wobblyBlobPath(g, cx - 4.5 * s, cy, 4 * s, 2.6 * s, "bwl", 6); g.fill(); g.stroke();
  VG.wobblyBlobPath(g, cx + 4.5 * s, cy, 4 * s, 2.6 * s, "bwr", 6); g.fill(); g.stroke();
  g.beginPath(); g.arc(cx, cy, 2 * s, 0, Math.PI * 2); g.fill(); g.stroke();
}
function giftBlock(key, fill, emblem) {
  return makeSprite(key, 32, 32, function (g) {
    /* hard-offset flat shadow (3 3 0 ink) */
    VG.wobblyRectPath(g, 4, 4, 28, 28, key + "s", 6);
    g.fillStyle = inkA(0.9); g.fill();
    VG.wobblyRectPath(g, 1, 1, 28, 28, key, 6);
    g.fillStyle = fill; g.fill();
    g.save();
    VG.wobblyRectPath(g, 1, 1, 28, 28, key, 6); g.clip();
    g.globalAlpha = 0.13;
    g.fillStyle = VG.pattern(g, "grain", null, 9); g.fillRect(0, 0, 32, 32);
    g.globalAlpha = 1;
    /* wrapping ribbon — cross of paper tape */
    g.fillStyle = warmA(0.55);
    g.fillRect(13, 1, 5, 28); g.fillRect(1, 13, 28, 5);
    g.restore();
    VG.wobblyRectPath(g, 1, 1, 28, 28, key, 6);
    g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    if (emblem === "?") {
      g.fillStyle = C.ink;
      g.font = "800 17px " + FONT_D;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("?", 15, 17);
      bow(g, 15, 3, 0.8, C.berry);
    } else if (emblem === "B") {
      /* breakable: perforation dashes (pattern twin, not color-only) */
      g.strokeStyle = inkA(0.8); g.lineWidth = 1.6; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(4, 15); g.lineTo(26, 15); g.stroke();
      g.setLineDash([]);
    } else {
      bow(g, 15, 4, 1, C.berry);
    }
  });
}

/* --------------------------------------------------------- pipes ------ */
function pipeSprite(key, pal, part) {
  return makeSprite(key, 32, 32, function (g) {
    var x = part === "left" ? 4 : 0, w = part === "left" ? 28 : 28;
    if (part === "rim") {
      VG.wobblyRectPath(g, 4, 6, 28, 26, key + "s", 7); g.fillStyle = inkA(0.9); g.fill();
      VG.wobblyRectPath(g, 1, 2, 30, 28, key, 8);
      g.fillStyle = C.sky; g.fill();
      g.fillStyle = warmA(0.28); g.fillRect(5, 6, 6, 20);
      VG.wobblyRectPath(g, 1, 2, 30, 28, key, 8);
      g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
      /* zipper dots — it IS a pencil case */
      g.fillStyle = C.sun;
      for (var i = 0; i < 4; i++) { g.beginPath(); g.arc(9 + i * 5, 16, 1.4, 0, Math.PI * 2); g.fill(); }
    } else {
      var bx = part === "left" ? 4 : 2;
      VG.wobblyRectPath(g, bx + 3, 3, 26, 32, key + "s" + x, 7); g.fillStyle = inkA(0.9); g.fill();
      VG.wobblyRectPath(g, bx, -2, 26, 34, key + x, 7);
      g.fillStyle = C.sky; g.fill();
      g.fillStyle = warmA(0.25); g.fillRect(bx + 4, 0, 5, 32);
      VG.wobblyRectPath(g, bx, -2, 26, 34, key + x, 7);
      g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    }
    void w;
  });
}

/* ------------------------------------------------------ collectibles -- */
function coinSprite() {
  return makeSprite("coin", 28, 28, function (g) {
    VG.wobblyBlobPath(g, 16, 17, 10, 10, "coins", 8); g.fillStyle = inkA(0.9); g.fill();
    VG.wobblyBlobPath(g, 14, 14, 11, 11, "coin", 8);
    g.fillStyle = C.sun; g.fill();
    VG.wobblyBlobPath(g, 14, 14, 11, 11, "coin", 8);
    g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    /* star CUTOUT — the shape twin, never color-only */
    starPath(g, 14, 14, 4.6);
    g.fillStyle = C.paper; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = inkA(0.7); g.stroke();
  });
}
function starPath(g, cx, cy, r) {
  g.beginPath();
  for (var i = 0; i < 10; i++) {
    var a = -Math.PI / 2 + i * Math.PI / 5;
    var rad = i % 2 ? r * 0.45 : r;
    var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}
art.starPath = starPath;
function starSprite() {
  return makeSprite("star", 36, 36, function (g) {
    g.save(); g.translate(3, 3); starPath(g, 15, 15, 12); g.fillStyle = inkA(0.9); g.fill(); g.restore();
    starPath(g, 15, 15, 12);
    g.fillStyle = C.sun; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = C.ink; g.stroke();
    starPath(g, 15, 13, 5);
    g.fillStyle = warmA(0.55); g.fill();
  });
}
function berrySprite() {
  return makeSprite("berry", 26, 26, function (g) {
    VG.wobblyBlobPath(g, 15, 16, 9, 9, "berrys", 7); g.fillStyle = inkA(0.9); g.fill();
    VG.wobblyBlobPath(g, 13, 13, 9.5, 9.5, "berry", 7);
    g.fillStyle = C.berry; g.fill();
    VG.wobblyBlobPath(g, 13, 13, 9.5, 9.5, "berry", 7);
    g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    /* leaf + spots: shape redundancy for the power-up */
    VG.wobblyBlobPath(g, 16, 4, 5, 2.6, "leafbit", 5);
    g.fillStyle = C.leaf; g.fill(); g.lineWidth = 1.5; g.stroke();
    g.fillStyle = warmA(0.6);
    g.beginPath(); g.arc(10, 12, 1.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(15, 16, 1.4, 0, Math.PI * 2); g.fill();
  });
}

/* ---------------------------------------------------------- hazards --- */
function spikeTile(pal) {
  return makeSprite("spike", 32, 32, function (g) {
    var tri = function (ox) {
      g.beginPath();
      g.moveTo(ox + 3, 30);
      g.quadraticCurveTo(ox + 8, 14, ox + 8, 6);
      g.quadraticCurveTo(ox + 8, 14, ox + 13, 30);
      g.closePath();
    };
    g.save(); g.translate(3, 3);
    tri(0); tri(16); g.fillStyle = inkA(0.9); g.fill();
    g.restore();
    g.lineWidth = 2; g.strokeStyle = C.ink;
    for (var pass = 0; pass < 2; pass++) {
      var ox = pass * 16;
      tri(ox);
      g.fillStyle = C.berry; g.fill(); g.stroke();
      /* diagonal stripes — danger is spikes + stripes, never color alone */
      g.save(); tri(ox); g.clip();
      g.strokeStyle = warmA(0.75); g.lineWidth = 2.4;
      for (var d = -8; d < 26; d += 7) {
        g.beginPath(); g.moveTo(ox + d, 32); g.lineTo(ox + d + 12, 2); g.stroke();
      }
      g.restore();
      tri(ox); g.stroke();
    }
    void pal;
  });
}
function springSprite(state) {
  return makeSprite("spring" + state, 32, 32, function (g) {
    var top = state === "down" ? 22 : 12;
    /* coil zigzag */
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.lineCap = "round";
    g.beginPath(); g.moveTo(8, 30);
    var coils = state === "down" ? 2 : 3;
    for (var i = 0; i < coils; i++) {
      var y0 = 30 - (30 - top) * (i + 0.5) / coils;
      g.lineTo(i % 2 ? 9 : 23, y0);
    }
    g.lineTo(16, top + 2); g.stroke();
    /* base */
    VG.wobblyRectPath(g, 4, 28, 24, 4, "spb" + state, 2);
    g.fillStyle = C.paper3; g.fill(); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    /* top plate with UP chevrons (direction twin) */
    VG.wobblyRectPath(g, 3, top - 4, 26, 8, "spt" + state, 4);
    g.fillStyle = C.sun; g.fill(); g.stroke();
    g.strokeStyle = C.ink; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(11, top + 1); g.lineTo(16, top - 2); g.lineTo(21, top + 1); g.stroke();
  });
}

/* ----------------------------------------------------------- decor ---- */
function bushSprite(i, pal) {
  return makeSprite("bush" + i, 44, 26, function (g) {
    VG.wobblyBlobPath(g, 22, 16, 18, 9, "bush" + i + "s", 7); g.fillStyle = inkA(0.9); g.fill();
    VG.wobblyBlobPath(g, 20, 13, 18, 10, "bush" + i, 7);
    g.fillStyle = pal.near; g.fill();
    VG.wobblyBlobPath(g, 20, 13, 18, 10, "bush" + i, 7);
    g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    g.save();
    VG.wobblyBlobPath(g, 20, 13, 18, 10, "bush" + i, 7); g.clip();
    g.globalAlpha = 0.18;
    g.fillStyle = VG.pattern(g, "halftone", inkA(0.6));
    g.fillRect(0, 0, 44, 26);
    g.restore();
  });
}
function flowerSprite(i) {
  return makeSprite("flower" + i, 22, 26, function (g) {
    g.strokeStyle = C.leaf; g.lineWidth = 2.2; g.lineCap = "round";
    g.beginPath(); g.moveTo(11, 25); g.quadraticCurveTo(9, 16, 11, 10); g.stroke();
    var pc = i % 2 ? C.sky : C.berry;
    for (var p = 0; p < 5; p++) {
      var a = p * Math.PI * 2 / 5;
      VG.wobblyBlobPath(g, 11 + Math.cos(a) * 4.5, 8 + Math.sin(a) * 4.5, 3, 3, "fl" + i + p, 5);
      g.fillStyle = pc; g.fill();
      g.lineWidth = 1.4; g.strokeStyle = C.ink; g.stroke();
    }
    g.beginPath(); g.arc(11, 8, 2.6, 0, Math.PI * 2);
    g.fillStyle = C.sun; g.fill(); g.stroke();
  });
}
function treeSprite(i, pal) {
  return makeSprite("tree" + i, 56, 74, function (g) {
    VG.wobblyRectPath(g, 26, 44, 9, 28, "trk" + i, 3);
    g.fillStyle = C.paper3; g.fill();
    g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    VG.wobblyBlobPath(g, 31, 29, 22, 22, "tree" + i + "s", 8); g.fillStyle = inkA(0.9); g.fill();
    VG.wobblyBlobPath(g, 28, 26, 22, 22, "tree" + i, 8);
    g.fillStyle = pal.near; g.fill();
    VG.wobblyBlobPath(g, 28, 26, 22, 22, "tree" + i, 8);
    g.lineWidth = 2; g.stroke();
    g.save();
    VG.wobblyBlobPath(g, 28, 26, 22, 22, "tree" + i, 8); g.clip();
    g.globalAlpha = 0.16;
    g.fillStyle = VG.pattern(g, "halftone", inkA(0.6));
    g.fillRect(0, 0, 56, 74);
    g.restore();
  });
}

/* ---------------------------------------------------- mover platform -- */
function moverSprite() {
  return makeSprite("mover", 72, 20, function (g) {
    VG.wobblyRectPath(g, 4, 4, 66, 14, "mvs", 7); g.fillStyle = inkA(0.9); g.fill();
    VG.wobblyRectPath(g, 1, 1, 66, 14, "mv", 7);
    g.fillStyle = C.violet; g.fill();
    g.save();
    VG.wobblyRectPath(g, 1, 1, 66, 14, "mv", 7); g.clip();
    /* ribbon stripes: direction reads from pattern, not color */
    g.fillStyle = warmA(0.5);
    for (var x = -6; x < 74; x += 14) {
      g.beginPath();
      g.moveTo(x + 8, 1); g.lineTo(x + 14, 1); g.lineTo(x + 8, 15); g.lineTo(x + 2, 15);
      g.closePath(); g.fill();
    }
    g.restore();
    VG.wobblyRectPath(g, 1, 1, 66, 14, "mv", 7);
    g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  });
}

/* ============================================================ BACKGROUNDS
 * Pre-rendered ONCE per level (no shimmer, no per-frame noise):
 * L1 far hills (0.25, silhouettes, no outlines)
 * L2 mid trees (0.5, outlines + halftone + ground strip)
 * L4 near tufts (1.3, oversized)
 * ======================================================================== */
function buildHills(level, pal) {
  var W = Math.ceil(level.w * 32 * 0.25 + 960), H = 612;
  var c = document.createElement("canvas"); c.width = W; c.height = H;
  var g = c.getContext("2d");
  var rnd = VG.mulberry32(level.seed * 7 + 1);
  g.fillStyle = pal.far;
  var x = -80;
  while (x < W + 120) {
    var rx = 90 + rnd() * 130, ry = 55 + rnd() * 95;
    VG.wobblyBlobPath(g, x, H - 40, rx, ry, "hill" + level.idx + Math.round(x), 7);
    g.fill();
    x += rx * 1.15;
  }
  return c;
}
function buildMid(level, pal) {
  var W = Math.ceil(level.w * 32 * 0.5 + 960), H = 612;
  var c = document.createElement("canvas"); c.width = W; c.height = H;
  var g = c.getContext("2d");
  var rnd = VG.mulberry32(level.seed * 13 + 5);
  /* cut-paper ground ribbon under the playfield */
  g.fillStyle = pal.mid;
  g.fillRect(0, H - 132, W, 132);
  var x = 40;
  while (x < W - 40) {
    var kind = rnd();
    if (kind < 0.5) blit(g, treeSprite(Math.floor(rnd() * 3), pal), x, H - 132 - 66, 56, 74);
    else if (kind < 0.8) blit(g, bushSprite(Math.floor(rnd() * 3), pal), x, H - 132 - 18, 44, 26);
    else blit(g, flowerSprite(Math.floor(rnd() * 4)), x, H - 132 - 22, 22, 26);
    x += 70 + rnd() * 150;
  }
  return c;
}
function buildNear(level, pal) {
  var W = Math.ceil(level.w * 32 * 1.3 + 1600), H = 70;
  var c = document.createElement("canvas"); c.width = W; c.height = H;
  var g = c.getContext("2d");
  var rnd = VG.mulberry32(level.seed * 3 + 9);
  var x = -20;
  while (x < W + 40) {
    var rx = 26 + rnd() * 26, ry = 22 + rnd() * 20;
    VG.wobblyBlobPath(g, x, H + 8, rx, ry, "tuft" + Math.round(x), 6);
    g.fillStyle = pal.near; g.fill();
    x += rx * 1.3;
  }
  return c;
}

/* -------------------------------------------------- sky / sun / clouds -- */
function drawSky(ctx, w, h, pal) {
  var grad = ctx.createLinearGradient(0, 0, 0, h);   /* two stops, one hue family */
  grad.addColorStop(0, pal.skyTop);
  grad.addColorStop(1, pal.skyBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}
function drawSun(ctx, w, s, pal) {
  VG.drawSprite(ctx, { x: w * 0.82, y: 74 * s, w: 74 * s, h: 74 * s,
    blob: true, fill: pal.sun, seed: "sun" + pal.sun, scale: s,
    outlineWidth: 1.5 * s, highlight: true });
}
var CLOUDS = [
  { x: 120, y: 66, w: 128, h: 44, seed: "cl0" },
  { x: 430, y: 118, w: 96, h: 34, seed: "cl1" },
  { x: 700, y: 58, w: 148, h: 50, seed: "cl2" },
  { x: 980, y: 128, w: 104, h: 36, seed: "cl3" },
  { x: 1250, y: 84, w: 120, h: 42, seed: "cl4" }
];
function drawClouds(ctx, camX, w, h, s, pal, t, reduced) {
  var span = w + 560;
  for (var i = 0; i < CLOUDS.length; i++) {
    var cl = CLOUDS[i];
    var drift = reduced ? 0 : Math.sin(t * 0.00025 + i) * 12;
    var x = ((cl.x - camX * 0.12 + drift) % span + span) % span - 280;
    VG.drawSprite(ctx, { x: x, y: cl.y * s, w: cl.w * s, h: cl.h * s,
      blob: true, fill: pal.cloud, seed: cl.seed, scale: s,
      outlineWidth: 1.5 * s, highlight: false, shadow: false });
  }
  void h;
}

/* =============================================================== VIOLET
 * Icon-shaped mascot (custom-craft recipe): round head, ellipse eyes with
 * 80ms-offset blinks, quadratic smile, berry scarf with follow-through.
 * 3px outline — hero items only (§5 outline hierarchy).
 * ======================================================================== */
function drawViolet(ctx, o) {
  var lw = 3;
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(-1, 1);
  ctx.scale(o.sx || 1, o.sy || 1);
  var inv = o.invincible && Math.floor((o.now || 0) / 80) % 2 === 0;
  if (inv) ctx.globalAlpha = 0.45;

  /* --- scarf trail: 2–3 frames of follow-through lag, 30% slower recover */
  if (o.scarf && o.scarf.length > 1) {
    ctx.save();
    if (o.flip) ctx.scale(-1, 1);        /* trail lives in world space */
    ctx.beginPath();
    var p0 = o.scarf[0];
    ctx.moveTo(p0.x - o.x, p0.y - o.y);
    for (var si = 1; si < o.scarf.length; si++) {
      ctx.lineTo(o.scarf[si].x - o.x, o.scarf[si].y - o.y + si * 0.6);
    }
    ctx.lineWidth = 7 - 0;
    ctx.strokeStyle = C.berry; ctx.lineCap = "round"; ctx.stroke();
    ctx.lineWidth = 9;
    ctx.strokeStyle = inkA(0.9); ctx.globalAlpha = (inv ? 0.2 : 0.35); ctx.stroke();
    ctx.globalAlpha = inv ? 0.45 : 1;
    ctx.restore();
  }

  /* --- feet: two paper bumps on a sine run cycle */
  var ph = o.runPhase || 0;
  var amp = o.moving ? 3.2 : 0;
  var f1 = Math.max(0, Math.sin(ph)) * amp, f2 = Math.max(0, Math.sin(ph + Math.PI)) * amp;
  VG.wobblyBlobPath(ctx, -5, 20 - f1, 5, 3.4, "footL", 5);
  ctx.fillStyle = C.inkSoft; ctx.fill();
  VG.wobblyBlobPath(ctx, 5, 20 - f2, 5, 3.4, "footR", 5);
  ctx.fillStyle = C.inkSoft; ctx.fill();

  /* --- body: rounded violet drop (4-layer recipe, hard shadow) */
  VG.drawSprite(ctx, { x: 0, y: 9, w: 24, h: 22, blob: true,
    fill: C.violet, seed: "vbody", scale: 1, outlineWidth: lw, points: 8 });

  /* --- head: big and round */
  VG.drawSprite(ctx, { x: 0, y: -9, w: 30, h: 28, blob: true,
    fill: C.paper, seed: "vhead", scale: 1, outlineWidth: lw, points: 9 });

  /* --- scarf knot at the neck */
  VG.wobblyBlobPath(ctx, 0, 2, 9, 4.6, "vknot", 6);
  ctx.fillStyle = C.berry; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();

  /* --- face: eyes blink every 3–5s with 80ms offset between them */
  var blink = o.blink || 0;                       /* 0..1 lid close amount */
  var blinkR = Math.max(0, Math.min(1, blink * 1.6 - 0.3));   /* delayed eye */
  var eye = function (ex, close) {
    var ry = 3.4 * Math.max(0.08, 1 - close);
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.ellipse(ex, -10.5, 2.2, ry, 0, 0, Math.PI * 2); ctx.fill();
    if (close < 0.5) {
      ctx.fillStyle = warmA(0.9);
      ctx.beginPath(); ctx.arc(ex + 0.8, -11.4, 0.8, 0, Math.PI * 2); ctx.fill();
    }
  };
  if (o.dizzy) {
    /* dizzy star-eyes — failure is cute, never scary */
    ctx.fillStyle = C.sun; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
    starPath(ctx, -6, -10, 4); ctx.fill(); ctx.stroke();
    starPath(ctx, 6, -10, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-3, -1);
    ctx.quadraticCurveTo(0, -2.6, 3, -1); ctx.stroke();      /* little "o" mouth */
  } else {
    eye(-6, blink);
    eye(6, blinkR);
    /* rosy cheeks at 30% opacity (opacity-layered secondary detail) */
    ctx.globalAlpha = 0.3; ctx.fillStyle = C.berry;
    ctx.beginPath(); ctx.ellipse(-9.5, -5, 2.6, 1.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9.5, -5, 2.6, 1.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = inv ? 0.45 : 1;
    /* mouth: smile, or happy-open during celebration */
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineCap = "round";
    ctx.beginPath();
    if (o.happy) {
      ctx.moveTo(-3.4, -3); ctx.quadraticCurveTo(0, 1.8, 3.4, -3);
      ctx.closePath(); ctx.fillStyle = C.ink; ctx.fill();
    } else {
      ctx.moveTo(-3, -3.4); ctx.quadraticCurveTo(0, 0.4, 3, -3.4);
    }
    ctx.stroke();
  }
  /* tuft of hair — asymmetric, ±1° of character */
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-1, -23);
  ctx.quadraticCurveTo(2, -28, 5, -25.5); ctx.stroke();

  /* --- Berry Buddy shield ring (power-up state, shape-coded) */
  if (o.shield) {
    ctx.strokeStyle = C.leaf; ctx.lineWidth = 2.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(0, -1, 25, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
art.drawViolet = drawViolet;

/* =========================================================== PENCIL-PAL
 * Enemy: a waddling pencil with a zigzag paper skirt. Telegraphs turns with
 * a 300ms crouch-wobble (doctrine anticipation), turns dizzy-stars on boop.
 * ======================================================================== */
function drawEnemy(ctx, e, t) {
  ctx.save();
  ctx.translate(e.x, e.y);
  var wob = Math.sin(t * 0.012 + e.wobbleSeed) * 0.06;
  if (e.state === "telegraph") wob = Math.sin(t * 0.05) * 0.16;   /* urgent wobble */
  if (e.state === "out") ctx.rotate(Math.sin(t * 0.02) * 0.2);
  else ctx.rotate(wob + (e.face > 0 ? 0.03 : -0.03));
  var squash = e.state === "out" ? 0.45 : e.state === "telegraph" ? 0.86 : 1;
  ctx.scale(e.face > 0 ? 1 : -1, squash);

  if (e.state === "out") {
    /* flattened paper scrap */
    VG.wobblyBlobPath(ctx, 0, 4, 13, 4.5, e.seed + "flat", 6);
    ctx.fillStyle = C.sun; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
  } else {
    /* zigzag skirt (shape language: spiky = keep your distance) */
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    for (var z = -10; z < 10; z += 5) { ctx.lineTo(z + 2.5, 15); ctx.lineTo(z + 5, 10); }
    ctx.closePath();
    ctx.fillStyle = C.berry; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
    /* pencil body */
    VG.wobblyRectPath(ctx, -8, -12, 16, 22, e.seed, 5);
    ctx.fillStyle = C.sun; ctx.fill();
    ctx.save();
    VG.wobblyRectPath(ctx, -8, -12, 16, 22, e.seed, 5); ctx.clip();
    ctx.fillStyle = warmA(0.4); ctx.fillRect(-5, -12, 3, 22);
    ctx.restore();
    VG.wobblyRectPath(ctx, -8, -12, 16, 22, e.seed, 5);
    ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
    /* eraser cap */
    VG.wobblyRectPath(ctx, -6, -17, 12, 6, e.seed + "cap", 3);
    ctx.fillStyle = C.berry; ctx.fill(); ctx.stroke();
    /* grumpy brows — the readable warning */
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -8.5); ctx.lineTo(5.5, -6.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6.5, -6.2); ctx.lineTo(-1, -8.5); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(-3.4, -3.4, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.4, -3.4, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (e.state === "out") {
    ctx.save();
    ctx.fillStyle = C.sun; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
    var a = t * 0.004;
    starPath(ctx, e.x + Math.cos(a) * 12, e.y - 12 + Math.sin(a) * 4, 3.4);
    ctx.fill(); ctx.stroke();
    starPath(ctx, e.x + Math.cos(a + Math.PI) * 12, e.y - 12 + Math.sin(a + Math.PI) * 4, 3.4);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
art.drawEnemy = drawEnemy;

/* ----------------------------------------------------- checkpoint/flag -- */
function drawPennant(ctx, x, groundY, opts) {
  var h = 46;
  ctx.save();
  VG.crayonStroke(ctx, [[x, groundY], [x, groundY - h]], C.ink, 3);
  var fill = opts.active ? C.leaf : C.paper3;
  ctx.beginPath();
  ctx.moveTo(x + 1, groundY - h);
  ctx.lineTo(x + 24, groundY - h + 7);
  ctx.lineTo(x + 1, groundY - h + 14);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
  if (opts.active) {
    starPath(ctx, x + 9, groundY - h + 7, 3.4);
    ctx.fillStyle = C.paper; ctx.fill();
  }
  ctx.restore();
}
art.drawPennant = drawPennant;
function drawFlag(ctx, x, groundY, slide) {
  var h = 118;
  ctx.save();
  VG.crayonStroke(ctx, [[x, groundY], [x, groundY - h]], C.ink, 3.5);
  var py = groundY - h + 8 + (slide || 0) * (h - 40);
  /* swallow-tail pennant + star = unmistakable finish marker */
  ctx.beginPath();
  ctx.moveTo(x + 1, py);
  ctx.lineTo(x + 34, py + 10);
  ctx.lineTo(x + 22, py + 16);
  ctx.lineTo(x + 34, py + 22);
  ctx.lineTo(x + 1, py + 30);
  ctx.closePath();
  ctx.fillStyle = C.leaf; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = C.ink; ctx.stroke();
  starPath(ctx, x + 13, py + 15, 6);
  ctx.fillStyle = C.sun; ctx.fill();
  ctx.lineWidth = 1.6; ctx.stroke();
  /* sun topper */
  ctx.beginPath(); ctx.arc(x, groundY - h, 5, 0, Math.PI * 2);
  ctx.fillStyle = C.sun; ctx.fill();
  ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}
art.drawFlag = drawFlag;
art.drawSun = drawSun;
art.drawClouds = drawClouds;

/* ------------------------------------------------------------ build all -- */
art.cache = {};
art.build = function (level) {
  var pal = level.palette;
  art.sprites = {
    grass: makeSprite("grass" + level.idx, 32, 32, function (g) { grassTile(g, pal); }),
    dirt: makeSprite("dirt" + level.idx, 32, 32, function (g) { dirtTile(g, pal); }),
    block: makeSprite("block" + level.idx, 32, 32, function (g) { blockTile(g, pal); }),
    pipeTL: pipeSprite("ptl" + level.idx, pal, "rim"),
    pipeTR: pipeSprite("ptr" + level.idx, pal, "rim"),
    pipeBL: pipeSprite("pbl" + level.idx, pal, "left"),
    pipeBR: pipeSprite("pbr" + level.idx, pal, "right"),
    giftC: giftBlock("giftC" + level.idx, C.sun, "bow"),
    giftB: giftBlock("giftB" + level.idx, C.sky, "B"),
    giftP: giftBlock("giftP" + level.idx, C.violet, "?"),
    giftUsed: giftBlock("giftU" + level.idx, C.paper3, "used"),
    coin: coinSprite(),
    star: starSprite(),
    berry: berrySprite(),
    spike: spikeTile(pal),
    spring: springSprite("up"),
    springDown: springSprite("down"),
    mover: moverSprite(),
    hills: buildHills(level, pal),
    mid: buildMid(level, pal),
    near: buildNear(level, pal)
  };
  return art.sprites;
};
})(typeof window !== "undefined" ? window : this);
