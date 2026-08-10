/* ============================================================================
 * Violet's Craft Breaker — Vee Arcade Arkanoid (DESIGN-BIBLE §4 brief 1)
 *
 * A desk-made diorama: the playfield is a corkboard with construction-paper
 * bricks pinned by washi tape (halftone shading, ±1.5° tilt). The paddle is a
 * wooden paintbrush handle with a sticker grip; the ball is a bouncy paper wad
 * with a faint crayon trail. Breaks shower paper-confetti + tape scraps; gold
 * bricks crack in two hits revealing a torn-paper inner layer. Palette shifts
 * paper toward warm ochre (#FFF1D6), accents sun + berry.
 *
 * Built ON the engine (../engine/vee-game.js, vee-sfx.js) — never reimplements it.
 * ========================================================================== */
(function () {
"use strict";

var VG = window.VeeGame, D = VG.DESIGN, C = D.colors, S = window.VeeSFX;
var DEMO = !!window.CRAFTBREAKER_DEMO;
var E = D.easing;

/* --------------------------------------------------------------------------
 * 0. Game-local token block (brief: warm ochre paper + sun/berry accents).
 *    Every hex lives HERE — nothing is improvised mid-render (doctrine §1).
 * ------------------------------------------------------------------------ */
var T = {
  desk:      "#FFF1D6",   /* warm-ochre desk paper (brief)          */
  desk2:     "#F4E0B8",   /* desk recessed doodle band              */
  cork:      "#DFAF74",   /* corkboard base                         */
  corkDark:  "#C08A4E",   /* cork speckle (dark)                    */
  corkLight: "#F0CB96",   /* cork speckle (light)                   */
  wood:      "#D9A05B",   /* paintbrush handle                      */
  woodDark:  "#B97F3F",   /* brush-handle grain lines               */
  cream:     "#FFFDF2",   /* tape / die-cut sticker border / ball   */
  inner:     "#FFEFC9",   /* torn-paper inner layer of gold bricks  */
  trail:     "#B98BE0",   /* faint violet crayon trail              */
  gold:      "#FFD97A"    /* gold-brick foil over sun               */
};
var FDISP = "'Baloo 2','Fredoka','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";
var FBODY = "'Fredoka','Baloo 2','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";

/* --------------------------------------------------------------------------
 * 1. Geometry — 960×600 design space, letterboxed to the iframe
 * ------------------------------------------------------------------------ */
var CW = 960, CH = 600;
var FIELD = { x0: 52, x1: 908, y0: 90, y1: 584 };   /* cork inner walls */
var PADDLE_Y = 540, BALL_R = 9;
var BRICK = { w: 62, h: 26, pitchX: 66, pitchY: 30, x0: 51, y0: 112 };
var K = 2;                                            /* sprite bake scale */

var canvas = document.getElementById("stage");
var cv = VG.setupCanvas(canvas);
var ctx = cv.ctx, view = cv.view;

function fit() {
  var s = Math.min(view.w / CW, view.h / CH);
  return { s: s, ox: (view.w - CW * s) / 2, oy: (view.h - CH * s) / 2 };
}
function toDesign(e) {
  var r = canvas.getBoundingClientRect(), f = fit();
  var cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
  var cy = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
  return { x: (cx - r.left - f.ox) / f.s, y: (cy - r.top - f.oy) / f.s };
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  return c;
}

/* --------------------------------------------------------------------------
 * 2. Levels — 6 handcrafted picture layouts (heart / star / frog / crown /
 *    rainbow). Gentle ramp: +8% ball speed per level (fairness §3f-1).
 *    Chars: '.' empty · 'p' paper(1 hit) · 'g' gold(2 hits) · 't' tape.
 * ------------------------------------------------------------------------ */
var LEVELS = [
  { name: "First Strokes", sub: "Warm up that brush!", palette: [C.sky, C.leaf, C.sun], map: [
    ".............",
    "ppppppppppppp",
    "ppppppppppppp",
    "ppppppppppppp"
  ]},
  { name: "Paper Heart", sub: "Cut with love", palette: [C.berry], map: [
    "..pp.....pp..",
    ".pppp...pppp.",
    "pppppp.pppppp",
    "ppppgpppppppp",
    "pppppppppgppp",
    ".ppppppppppp.",
    "..ppppppppp..",
    "...ppppppp...",
    "....ppppp....",
    ".....ppp.....",
    "......p......"
  ]},
  { name: "Sunny Star", sub: "Sticky tape hides the tips", palette: [C.sun], map: [
    "......t......",
    ".....ppp.....",
    "tpppppppppppt",
    ".ppppppppppp.",
    "..ppppppppp..",
    ".pppp...pppp.",
    ".pp.......pp."
  ]},
  { name: "Flex's Pond", sub: "Frogmaster Flex is watching!", palette: [C.leaf], map: [
    "ppp.......ppp",
    "pgpp.....ppgp",
    "ppppppppppppp",
    "ppppppppppppp",
    ".ppppppppppp.",
    "..ppppppppp..",
    "...pp...pp..."
  ]},
  { name: "Violet's Crown", sub: "Mind the gold band", palette: [C.violet], map: [
    "p.....p.....p",
    "pp...ppp...pp",
    "ppp.ppppp.ppp",
    "ppppppppppppp",
    "ggggggggggggg"
  ]},
  { name: "Rainbow Bridge", sub: "The grand finale!", palette: [C.berry, C.sun, C.leaf, C.sky, C.violet, C.paper3], map: [
    "....ggggg....",
    "..ppppppppp..",
    ".ppppppppppp.",
    "pppp.....pppp",
    "ppp.......ppp",
    "pp.........pp"
  ]}
];
function baseSpeed(i) { return Math.min(420, 250 * Math.pow(1.08, i)); }   /* +8%/level */

/* --------------------------------------------------------------------------
 * 3. Sprite cache — everything baked ONCE to offscreen canvases at load
 *    (risk table: no per-frame procedural drawing, no shadowBlur, grain
 *    cached as pattern, wobble seeded per object and stable).
 * ------------------------------------------------------------------------ */
var bgSpr = null, ballSpr = null, heartOn = null, heartOff = null, frogSpr = null;
var brickSpr = {}, paddleSpr = {}, powerSpr = {}, trailSpr = null;
var PAD = 9;                                          /* shadow+jitter margin */

/* the desk + corkboard diorama, baked once */
function bakeBackground() {
  var c = makeCanvas(CW * K, CH * K), g = c.getContext("2d");
  g.scale(K, K);
  /* desk paper */
  g.fillStyle = T.desk; g.fillRect(0, 0, CW, CH);
  g.globalAlpha = 0.15;                               /* grain ≤0.15 (imagery cap) */
  g.fillStyle = VG.pattern(g, "grain", null, 11); g.fillRect(0, 0, CW, CH);
  g.globalAlpha = 1;
  /* crayon doodles on the visible desk margin (background detail = 1px lines) */
  VG.crayonStroke(g, [[66, 34], [128, 26]], T.desk2, 3);
  VG.crayonStroke(g, [[842, 30], [902, 40]], T.desk2, 3);
  /* corkboard with hard-offset shadow */
  g.fillStyle = D.inkRGBA(0.9);
  g.beginPath(); g.roundRect ? g.roundRect(51, 89, 864, 498, 14) : g.rect(51, 89, 864, 498); g.fill();
  g.fillStyle = T.cork;
  g.beginPath(); g.roundRect ? g.roundRect(48, 86, 864, 498, 14) : g.rect(48, 86, 864, 498); g.fill();
  /* cork speckle — seeded, baked (never re-randomized per frame) */
  var rnd = VG.mulberry32(1234);
  for (var i = 0; i < 520; i++) {
    var x = 52 + rnd() * 856, y = 90 + rnd() * 490, r = 0.7 + rnd() * 1.6;
    g.fillStyle = rnd() < 0.5 ? T.corkDark : T.corkLight;
    g.globalAlpha = 0.18 + rnd() * 0.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  /* recessed inner play zone (halftone edge shading, carnival signature) */
  g.globalAlpha = 0.16;
  g.fillStyle = VG.pattern(g, "halftone", T.corkDark);
  g.fillRect(48, 86, 864, 10); g.fillRect(48, 574, 864, 10);
  g.fillRect(48, 86, 10, 498); g.fillRect(902, 86, 10, 498);
  g.globalAlpha = 1;
  /* 2px ink outline + washi tape pinning the board to the desk */
  g.lineWidth = 2; g.strokeStyle = C.ink;
  g.beginPath(); g.roundRect ? g.roundRect(48, 86, 864, 498, 14) : g.rect(48, 86, 864, 498); g.stroke();
  var tape = function (tx, ty, rot, col) {
    g.save(); g.translate(tx, ty); g.rotate(rot * Math.PI / 180);
    g.globalAlpha = 0.6; g.fillStyle = col;
    g.fillRect(-30, -9, 60, 18);
    g.globalAlpha = 0.25; g.strokeStyle = C.ink; g.lineWidth = 1;
    g.strokeRect(-30, -9, 60, 18);
    g.restore();
  };
  tape(60, 92, -42, C.violet); tape(900, 92, 40, C.sun);
  tape(60, 578, 42, C.sun);    tape(900, 578, -40, C.violet);
  return c;
}

/* one construction-paper brick, 4-layer recipe + washi pin + type pattern */
function bakeBrick(kind, color, cracked, variant) {
  var w = BRICK.w, h = BRICK.h;
  var c = makeCanvas((w + PAD * 2) * K, (h + PAD * 2) * K), g = c.getContext("2d");
  g.scale(K, K); g.translate(PAD, PAD);
  var seed = "bk-" + kind + "-" + variant;
  var fill = kind === "gold" ? T.gold : kind === "tape" ? "#F2E6CD" : color;
  VG.drawSprite(g, { x: w / 2, y: h / 2, w: w, h: h, fill: fill, seed: seed,
                     scale: 1, radius: 6, texture: kind === "paper" ? "halftone" : null });
  /* type patterns = colorblind twins (never color-only, §3g) */
  g.save();
  VG.wobblyRectPath(g, 0, 0, w, h, seed, 6); g.clip();
  if (kind === "gold") {                              /* diagonal foil stripes + star stamp */
    g.strokeStyle = D.inkRGBA(0.16); g.lineWidth = 3;
    for (var x = -h; x < w + h; x += 9) {
      g.beginPath(); g.moveTo(x, h + 2); g.lineTo(x + h, -2); g.stroke();
    }
    g.fillStyle = C.sun;
    starPath(g, w / 2, h / 2, 6.5, 3, 5); g.fill();
    g.lineWidth = 1; g.strokeStyle = D.inkRGBA(0.55); g.stroke();
  }
  if (kind === "tape") {                              /* cross-hatch washi weave */
    g.strokeStyle = D.inkRGBA(0.13); g.lineWidth = 2;
    for (var x2 = -h; x2 < w + h; x2 += 8) {
      g.beginPath(); g.moveTo(x2, h + 2); g.lineTo(x2 + h, -2); g.stroke();
      g.beginPath(); g.moveTo(x2 + h, h + 2); g.lineTo(x2, -2); g.stroke();
    }
  }
  if (cracked) {                                      /* torn-paper inner layer */
    g.fillStyle = T.inner;
    g.beginPath();
    g.moveTo(-2, h / 2 - 2);
    var tx = 0, ty = h / 2;
    while (tx < w + 2) {
      tx += 7 + (variant % 3); ty = h / 2 + ((tx / 7) % 2 ? 3.5 : -3.5);
      g.lineTo(tx, ty);
    }
    g.lineTo(w + 2, h / 2 + 5); g.lineTo(-2, h / 2 + 5);
    g.closePath(); g.fill();
    g.lineWidth = 1.2; g.strokeStyle = D.inkRGBA(0.6);
    g.beginPath(); g.moveTo(-2, h / 2 - 2);
    tx = 0;
    while (tx < w + 2) {
      tx += 7 + (variant % 3); ty = h / 2 + ((tx / 7) % 2 ? 3.5 : -3.5);
      g.lineTo(tx, ty);
    }
    g.stroke();
  }
  g.restore();
  /* washi pin — corner varies by seed (craft tell: asymmetric) */
  g.save();
  var px = variant % 3 === 0 ? 6 : variant % 3 === 1 ? w - 6 : w / 2;
  g.translate(px, 3); g.rotate(((variant % 2) ? 4 : -5) * Math.PI / 180);
  g.globalAlpha = 0.55; g.fillStyle = T.cream; g.fillRect(-13, -4.5, 26, 9);
  g.restore();
  return c;
}
function brickKey(kind, color, cracked, variant) {
  return kind + "|" + color + "|" + (cracked ? 1 : 0) + "|" + variant;
}
function brickSprite(b) {
  var key = brickKey(b.kind, b.color, b.cracked, b.variant);
  if (!brickSpr[key]) brickSpr[key] = bakeBrick(b.kind, b.color, b.cracked, b.variant);
  return brickSpr[key];
}

function starPath(g, cx, cy, ro, ri, n) {
  g.beginPath();
  for (var i = 0; i < n * 2; i++) {
    var r = i % 2 ? ri : ro, a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}
function heartPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.62);
  g.bezierCurveTo(cx - s * 1.05, cy - s * 0.1, cx - s * 0.58, cy - s * 0.78, cx, cy - s * 0.3);
  g.bezierCurveTo(cx + s * 0.58, cy - s * 0.78, cx + s * 1.05, cy - s * 0.1, cx, cy + s * 0.62);
  g.closePath();
}

/* the bouncy paper wad — cream with crease strokes */
function bakeBall() {
  var d = 26, c = makeCanvas((d + 12) * K, (d + 12) * K), g = c.getContext("2d");
  g.scale(K, K); g.translate(6, 6);
  VG.drawSprite(g, { x: d / 2, y: d / 2, w: d, h: d, blob: true, points: 9,
                     fill: T.cream, seed: "wad", scale: 1 });
  g.save();
  VG.wobblyBlobPath(g, d / 2, d / 2, d / 2, d / 2, "wad", 9); g.clip();
  g.strokeStyle = D.inkRGBA(0.28); g.lineWidth = 1.4; g.lineCap = "round";
  g.beginPath(); g.moveTo(7, 11); g.quadraticCurveTo(13, 14, 18, 10); g.stroke();
  g.beginPath(); g.moveTo(9, 18); g.quadraticCurveTo(14, 16, 17, 19); g.stroke();
  g.restore();
  return c;
}

/* paintbrush-handle paddle, baked per width (only 2 widths ever exist) */
function bakePaddle(w) {
  var h = 18, c = makeCanvas((w + 24) * K, (h + 24) * K), g = c.getContext("2d");
  g.scale(K, K); g.translate(12, 12);
  VG.drawSprite(g, { x: w / 2, y: h / 2, w: w, h: h, fill: T.wood, seed: "paddle" + w,
                     scale: 1, radius: h / 2 });
  g.save();
  VG.wobblyRectPath(g, 0, 0, w, h, "paddle" + w, h / 2); g.clip();
  /* wood grain — two wavy dark strokes */
  g.strokeStyle = D.inkRGBA(0.18); g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(4, 6); g.quadraticCurveTo(w / 2, 4, w - 4, 7); g.stroke();
  g.beginPath(); g.moveTo(6, 13); g.quadraticCurveTo(w / 2, 15, w - 6, 12); g.stroke();
  /* sticker grip — sun sticker with a tiny ink star */
  g.fillStyle = C.sun; g.fillRect(w / 2 - 19, 2.5, 38, h - 5);
  g.lineWidth = 1.6; g.strokeStyle = C.ink; g.strokeRect(w / 2 - 19, 2.5, 38, h - 5);
  g.fillStyle = C.ink; starPath(g, w / 2, h / 2, 4.4, 2, 5); g.fill();
  g.restore();
  return c;
}
function paddleSprite(w) {
  var key = Math.round(w / 2) * 2;                    /* quantized: few bakes during resize */
  if (!paddleSpr[key]) paddleSpr[key] = bakePaddle(key);
  return paddleSpr[key];
}

/* life sticker hearts — berry with white die-cut border; dimmed = paper-3 */
function bakeHeart(on) {
  var s = 15, c = makeCanvas(44 * K, 44 * K), g = c.getContext("2d");
  g.scale(K, K); g.translate(2, 0);
  g.fillStyle = D.inkRGBA(0.9); heartPath(g, 21, 24, s); g.fill();       /* 3px-ish offset */
  heartPath(g, 19, 21, s + 3); g.fillStyle = T.cream; g.fill();          /* die-cut border */
  heartPath(g, 19, 21, s);
  g.fillStyle = on ? C.berry : C.paper3; g.fill();
  g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  if (on) {
    g.globalAlpha = 0.5; g.fillStyle = T.cream;                          /* shine */
    g.beginPath(); g.arc(14, 15, 3, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  return c;
}

/* power-up stickers — shape + icon + color (triple-coded, §3g) */
function bakePower(kind) {
  var c = makeCanvas(56 * K, 56 * K), g = c.getContext("2d");
  g.scale(K, K); g.translate(4, 4);
  var cx = 24, cy = 24, fill = kind === "wide" ? C.violet : kind === "slow" ? C.sky
                             : kind === "multi" ? C.berry : C.sun;
  g.fillStyle = D.inkRGBA(0.9);
  shapePath(g, kind, cx + 2.5, cy + 2.5); g.fill();                       /* hard shadow */
  shapePath(g, kind, cx, cy); g.fillStyle = T.cream; g.fill();            /* die-cut border */
  shapePath(g, kind, cx, cy);
  g.save(); g.clip();
  g.fillStyle = fill; g.fillRect(-4, -4, 56, 56);
  g.globalAlpha = 0.18; g.fillStyle = VG.pattern(g, "halftone", C.ink);
  g.fillRect(-4, 30, 56, 22);                                             /* shaded base */
  g.restore();
  shapePath(g, kind, cx, cy); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  g.strokeStyle = T.cream; g.fillStyle = T.cream; g.lineWidth = 3; g.lineCap = "round";
  if (kind === "wide") {                                                  /* ↔ arrows */
    g.beginPath(); g.moveTo(13, 24); g.lineTo(35, 24); g.stroke();
    g.beginPath(); g.moveTo(13, 24); g.lineTo(19, 19); g.moveTo(13, 24); g.lineTo(19, 29); g.stroke();
    g.beginPath(); g.moveTo(35, 24); g.lineTo(29, 19); g.moveTo(35, 24); g.lineTo(29, 29); g.stroke();
  } else if (kind === "slow") {                                           /* snail spiral */
    g.beginPath(); g.arc(24, 25, 8, Math.PI * 0.2, Math.PI * 2.3); g.stroke();
    g.beginPath(); g.arc(24, 25, 4, Math.PI * 0.6, Math.PI * 2.7); g.stroke();
  } else if (kind === "multi") {                                          /* three wads */
    for (var i = 0; i < 3; i++) {
      g.beginPath(); g.arc(16 + i * 8, 24 + (i % 2 ? 5 : -4), 4.2, 0, Math.PI * 2);
      g.fill(); g.lineWidth = 1.6; g.strokeStyle = C.ink; g.stroke();
      g.strokeStyle = T.cream; g.lineWidth = 3;
    }
  } else {                                                                /* glue droplet */
    g.beginPath(); g.moveTo(24, 12); g.quadraticCurveTo(33, 25, 24, 32);
    g.quadraticCurveTo(15, 25, 24, 12); g.fill();
    g.lineWidth = 1.6; g.strokeStyle = C.ink; g.stroke();
  }
  return c;
}
function shapePath(g, kind, cx, cy) {
  if (kind === "wide") {
    g.beginPath(); g.roundRect ? g.roundRect(cx - 20, cy - 14, 40, 28, 9) : g.rect(cx - 20, cy - 14, 40, 28);
  } else if (kind === "slow") {
    g.beginPath(); g.arc(cx, cy, 18, 0, Math.PI * 2);
  } else if (kind === "multi") {
    starPath(g, cx, cy, 20, 10.5, 5);
  } else {
    g.beginPath(); g.moveTo(cx, cy - 19);
    g.quadraticCurveTo(cx + 17, cy + 2, cx, cy + 18);
    g.quadraticCurveTo(cx - 17, cy + 2, cx, cy - 19);
  }
  g.closePath();
}

/* faint crayon trail stamp — one cached radial blob, drawn per trail point */
function bakeTrail() {
  var c = makeCanvas(20, 20), g = c.getContext("2d");
  var grad = g.createRadialGradient(10, 10, 1, 10, 10, 10);
  grad.addColorStop(0, T.trail);
  grad.addColorStop(1, "rgba(185,139,224,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 20, 20);
  return c;
}

/* Frogmaster Flex — construction-paper frog cameo (procedural, icon-shaped) */
function bakeFrog() {
  var c = makeCanvas(96 * K, 88 * K), g = c.getContext("2d");
  g.scale(K, K); g.translate(4, 2);
  /* back legs */
  VG.drawSprite(g, { x: 16, y: 66, w: 22, h: 14, blob: true, points: 7, fill: C.leaf, seed: "flegl", scale: 1 });
  VG.drawSprite(g, { x: 68, y: 66, w: 22, h: 14, blob: true, points: 7, fill: C.leaf, seed: "flegr", scale: 1 });
  /* body */
  VG.drawSprite(g, { x: 42, y: 50, w: 56, h: 40, blob: true, points: 9, fill: C.leaf, seed: "fbody", scale: 1 });
  /* belly */
  g.save();
  VG.wobblyBlobPath(g, 42, 56, 20, 13, "fbody", 8); 
  g.fillStyle = T.cream; g.globalAlpha = 0.85; g.fill();
  g.lineWidth = 1; g.strokeStyle = D.inkRGBA(0.4); g.stroke();
  g.restore();
  /* eye bumps */
  VG.drawSprite(g, { x: 28, y: 28, w: 22, h: 22, blob: true, points: 8, fill: C.leaf, seed: "feye1", scale: 1 });
  VG.drawSprite(g, { x: 56, y: 28, w: 22, h: 22, blob: true, points: 8, fill: C.leaf, seed: "feye2", scale: 1 });
  g.fillStyle = T.cream;
  g.beginPath(); g.arc(28, 28, 7.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(56, 28, 7.5, 0, Math.PI * 2); g.fill();
  g.lineWidth = 1.6; g.strokeStyle = C.ink;
  g.beginPath(); g.arc(28, 28, 7.5, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(56, 28, 7.5, 0, Math.PI * 2); g.stroke();
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(29, 29, 3.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(55, 29, 3.2, 0, Math.PI * 2); g.fill();
  /* smile */
  g.lineWidth = 2; g.strokeStyle = C.ink; g.lineCap = "round";
  g.beginPath(); g.moveTo(30, 44); g.quadraticCurveTo(42, 51, 54, 44); g.stroke();
  return c;
}

function bakeAllSprites() {
  bgSpr = bakeBackground();
  ballSpr = bakeBall();
  heartOn = bakeHeart(true);
  heartOff = bakeHeart(false);
  trailSpr = bakeTrail();
  frogSpr = bakeFrog();
  powerSpr.wide = bakePower("wide");
  powerSpr.slow = bakePower("slow");
  powerSpr.multi = bakePower("multi");
  powerSpr.sticky = bakePower("sticky");
  paddleSpr[110] = bakePaddle(110);
  paddleSpr[160] = bakePaddle(160);
}

/* --------------------------------------------------------------------------
 * 4. Game state
 * ------------------------------------------------------------------------ */
var harness = VG.createHarness("arkanoid");
var particles = new VG.ParticlePool();
var shake = VG.createShake();
var flash = VG.createFlash();
var input = VG.createInput();
var score = new VG.ScoreCounter();

var state = "title";                                  /* title|intro|play|clear|over|victory */
var paused = false;
var levelIdx = 0, bricks = [], aliveCount = 0;
var balls = [], powers = [], popups = [], crumples = [];
var paddle = { x: CW / 2, w: 110, targetW: 110, target: CW / 2, squashT: -1 };
var lives = 3, combo = 0, rally = 0;
var fx = { wide: 0, slow: 0, sticky: 0 };             /* remaining seconds */
var respawnAt = 0, hurried = false, lastNearMiss = -1e9;
var clearSeq = null, clearCard = null, introT0 = 0, nowMs = 0;
var bestScore = harness.highScore(), newRecord = false;
var frogCheer = -1e9, victoryAt = 0, demoCycleT = 0;
var LOST_LINES = ["Almost!", "So close!", "Nice try!", "You've got this!"];
var CLEAR_LINES = ["Beautiful!", "What a smash!", "Super crafty!", "Brilliant bouncing!"];
var POWER_LABEL = { wide: "Wide brush!", slow: "Slow & steady!", multi: "Triple ball!", sticky: "Sticky grip!" };

function curSpeed() {
  /* attract mode runs brisker so the shelf demo feels alive (players keep the gentle ramp) */
  return baseSpeed(levelIdx) * (DEMO ? 1.7 : 1) * (fx.slow > 0 ? 0.75 : 1);
}

/* --------------------------------------------------------------------------
 * 5. Level construction / run flow
 * ------------------------------------------------------------------------ */
function buildLevel(i) {
  var L = LEVELS[i];
  bricks = [];
  aliveCount = 0;
  for (var r = 0; r < L.map.length; r++) {
    var row = L.map[r];
    for (var c2 = 0; c2 < row.length; c2++) {
      var ch = row[c2];
      if (ch === ".") continue;
      var kind = ch === "g" ? "gold" : ch === "t" ? "tape" : "paper";
      bricks.push({
        x: BRICK.x0 + c2 * BRICK.pitchX + BRICK.w / 2,
        y: BRICK.y0 + r * BRICK.pitchY + BRICK.h / 2,
        w: BRICK.w, h: BRICK.h,
        kind: kind, hp: kind === "gold" ? 2 : 1, cracked: false,
        color: L.palette[r % L.palette.length],
        seed: "L" + i + "-" + r + "-" + c2,
        variant: VG.hashSeed("L" + i + r + "." + c2) % 4,
        tilt: ((VG.hashSeed("tilt" + i + r + "." + c2) % 100) / 100 - 0.5) * 3 * Math.PI / 180, /* ±1.5° */
        alive: true
      });
      aliveCount++;
    }
  }
}
function spawnBall(stuck) {
  var b = { x: paddle.x, y: PADDLE_Y - 14 - BALL_R, vx: 0, vy: 0,
            stuck: !!stuck, stuckAt: nowMs, trail: [], squashT: -1, dead: false };
  balls.push(b);
  return b;
}
function startLevel(i) {
  levelIdx = i;
  buildLevel(i);
  balls = []; powers = []; crumples = [];
  fx.wide = fx.slow = fx.sticky = 0;
  paddle.targetW = 110; paddle.w = 110;
  combo = 0; rally = 0; hurried = false;
  clearSeq = null; clearCard = null;
  spawnBall(true);
  state = "intro"; introT0 = nowMs;
  if (!DEMO) startLevelMusic();
}
function startLevelMusic() {
  /* doctrine: pentatonic loop 100 BPM, +1 semitone per level tier */
  S.startMusic({ bpm: 100, seed: levelIdx * 13 + 5, tier: levelIdx, key: "C" });
}
function beginRun() {
  score = new VG.ScoreCounter();
  lives = DEMO ? 999 : 3;
  newRecord = false;
  demoCycleT = nowMs;
  startLevel(DEMO ? 1 : 0);                         /* demo opens on the heart */
}

/* --------------------------------------------------------------------------
 * 6. Juice helpers — popups, bursts (≤3 simultaneous primitives per event)
 * ------------------------------------------------------------------------ */
function popup(text, x, y, size, color) {
  popups.push({ text: text, x: x, y: y, t0: nowMs, ms: 850, size: size || 20, color: color || C.ink });
  if (popups.length > 6) popups.shift();
}
function brickBurst(x, y, color, big) {
  /* paper confetti (8) in brick + paper hues… */
  particles.spawn(8, { kind: "confetti", x: x, y: y, speed: 175, up: 95, gravity: 430,
                       ttl: 0.95, size: 6, colors: [color, T.cream, T.desk2] });
  /* …plus tape scraps */
  particles.spawn(3, { kind: "confetti", x: x, y: y, speed: 110, up: 60, gravity: 320,
                       ttl: 0.8, size: 9, color: "rgba(255,253,242,0.9)" });
  if (big) shake.trigger(3);                        /* gold only — shake reserved */
}
function sparkle(x, y) {
  particles.spawn(8, { kind: "spark", x: x, y: y, speed: 150, ttl: 0.5, size: 3,
                       colors: [C.sun, T.cream, C.violet] });
}

/* --------------------------------------------------------------------------
 * 7. Gameplay events
 * ------------------------------------------------------------------------ */
function damageBrick(b, hx, hy) {
  b.hp--;
  if (b.hp > 0) {                                   /* gold cracks — torn inner layer */
    b.cracked = true;
    loop.hitStop(30);
    particles.spawn(3, { kind: "confetti", x: hx, y: hy, speed: 90, up: 40,
                         gravity: 380, ttl: 0.6, size: 5, colors: [T.gold, T.inner] });
    S.pop();
    score.add(30);
    return;
  }
  b.alive = false;
  aliveCount--;
  combo++;
  var step = Math.min(combo, 12);                   /* pitch-ladder thunk rises with combos */
  var pts = (b.kind === "gold" ? 150 : b.kind === "tape" ? 70 : 50) + Math.min(combo, 5) * 10;
  score.add(pts);
  loop.hitStop(D.budgets.hitStop.normal);           /* 60ms — doctrine good-hit */
  brickBurst(hx, hy, b.color, b.kind === "gold");
  S.bounce(step);
  if (combo >= 3) popup("Combo ×" + combo, hx, hy - 18, 20, C.violet);
  maybeDropPower(b, hx, hy);
  if (aliveCount === 0) levelCleared();
  else checkHurry();
}
function maybeDropPower(b, hx, hy) {
  if (powers.length >= 3) return;                   /* gentle density cap */
  var chance = b.kind === "tape" ? 0.38 : 0.11;
  if (Math.random() > chance) return;
  var pool = b.kind === "tape" ? ["sticky", "sticky", "wide", "slow", "multi"]
                               : ["wide", "slow", "multi", "sticky"];
  var kind = pool[Math.floor(Math.random() * pool.length)];
  if (DEMO && (kind === "sticky" || kind === "multi")) kind = "wide"; /* one-ball showcase: autopilot rallies cleanly */
  powers.push({ kind: kind, x: hx, y: hy, t0: nowMs, seed: Math.random() * 7 });
}
function applyPower(p) {
  S.powerUp();
  sparkle(p.x, PADDLE_Y - 18);
  popup(POWER_LABEL[p.kind], p.x, PADDLE_Y - 44, 22, C.ink);
  score.add(100);
  if (p.kind === "wide") { fx.wide = 12; paddle.targetW = 160; }
  else if (p.kind === "slow") { fx.slow = 8; }
  else if (p.kind === "sticky") { fx.sticky = 12; }
  else if (p.kind === "multi") {
    var src = null;
    for (var i = 0; i < balls.length; i++) if (!balls[i].stuck && !balls[i].dead) { src = balls[i]; break; }
    if (src) {
      while (balls.length < 3) {
        var nb = spawnBall(false);
        nb.x = src.x; nb.y = src.y;
        var a = (balls.length === 2 ? -0.45 : 0.45);
        var m = Math.hypot(src.vx, src.vy) || 1, sp = curSpeed();
        var ca = Math.cos(a), sa = Math.sin(a);
        nb.vx = (src.vx / m * ca - src.vy / m * sa) * sp;
        nb.vy = (src.vx / m * sa + src.vy / m * ca) * sp;
      }
    }
  }
}
function paddleHit(b) {
  var rel = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
  var ang = rel * 1.05;                             /* ±60° max — gentle cap */
  var sp = curSpeed();
  b.vx = Math.sin(ang) * sp;
  b.vy = -Math.cos(ang) * sp;
  b.y = PADDLE_Y - 9 - BALL_R;
  b.squashT = nowMs;
  paddle.squashT = nowMs;
  combo = 0;
  rally++;
  if (fx.sticky > 0) {                              /* tape-catch: hold & re-launch */
    b.stuck = true; b.stuckAt = nowMs; b.vx = 0; b.vy = 0;
    S.tick();
  } else {
    S.bounce(Math.min(rally, 10));                  /* doctrine bounce ladder */
  }
}
function onBallLost(b) {
  crumples.push({ x: clamp(b.x, FIELD.x0 + 12, FIELD.x1 - 12),
                  y: Math.min(b.y, FIELD.y1 - 10), t0: nowMs });
  particles.spawn(4, { kind: "spark", x: b.x, y: FIELD.y1 - 6, speed: 60, ttl: 0.5,
                       size: 3, color: T.desk2, gravity: 150 });
  var remaining = 0;                                  /* count balls still in play */
  for (var i = 0; i < balls.length; i++) if (!balls[i].dead) remaining++;
  if (remaining === 0) {
    lives--;
    S.gentleFail();                                 /* a sigh — never shake/red flash */
    popup(LOST_LINES[Math.floor(Math.random() * LOST_LINES.length)], CW / 2, 440, 26, C.inkSoft);
    if (lives <= 0) { gameOver(); return; }
    respawnAt = nowMs + 900;                        /* gentle retry ≤5s (doctrine) */
    combo = 0; rally = 0;
  }
}
function checkHurry() {
  /* doctrine emotional mapping: last bricks + fast ball → hurry mode */
  if (!hurried && aliveCount <= 2 && baseSpeed(levelIdx) >= 290) {
    hurried = true;
    if (!DEMO) S.hurry();
    popup("Almost done!", CW / 2, 300, 24, C.sun);
  }
}
function levelCleared() {
  state = "clear";
  score.add(500);
  frogCheer = nowMs;                                /* Flex celebrates too */
  clearSeq = VG.celebrate(
    { loop: loop, particles: particles, flash: flash },
    {
      cx: CW / 2, cy: 280,
      note: function (i) { if (!DEMO) S.fanfare(i); },
      card: function (o) { clearCard = { t0: nowMs, ms: o.ms, rise: o.rise }; },
      finish: function () {
        clearSeq = null; clearCard = null;
        if (levelIdx + 1 >= LEVELS.length) victory();
        else startLevel(levelIdx + 1);
      }
    }
  );
}
function gameOver() {
  state = "over";
  if (!DEMO) S.failureChord();                      /* warm I chord, no sting */
  var res = harness.submitScore(score.value);
  bestScore = res.best; newRecord = res.newRecord;
  if (!DEMO) harness.gameEnded(score.value);
}
function victory() {
  state = "victory";
  victoryAt = nowMs;
  if (!DEMO) { S.fanfare(); }
  var res = harness.submitScore(score.value);
  bestScore = res.best; newRecord = res.newRecord;
  if (!DEMO) harness.gameEnded(score.value);
}


/* --------------------------------------------------------------------------
 * 8. Fixed-step simulation
 * ------------------------------------------------------------------------ */
function stepBall(b, dt) {
  if (b.stuck) {
    b.x = paddle.x; b.y = PADDLE_Y - 14 - BALL_R;
    /* sticky hold auto-releases after 600ms; demo always re-launches */
    if ((DEMO && nowMs - b.stuckAt > 420) ||
        (!DEMO && fx.sticky > 0 && nowMs - b.stuckAt > 600)) launchBall(b);
    return;
  }
  var sp = curSpeed(), m = Math.hypot(b.vx, b.vy) || 1;
  b.vx = b.vx / m * sp; b.vy = b.vy / m * sp;       /* constant-magnitude = gentle cap */
  var steps = Math.max(1, Math.ceil(sp * dt / 6)), h = dt / steps;
  for (var i = 0; i < steps && !b.dead; i++) {
    b.px = b.x; b.py = b.y;
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.x < FIELD.x0 + BALL_R) { b.x = FIELD.x0 + BALL_R; b.vx = Math.abs(b.vx); wallBounce(b); }
    if (b.x > FIELD.x1 - BALL_R) { b.x = FIELD.x1 - BALL_R; b.vx = -Math.abs(b.vx); wallBounce(b); }
    if (b.y < FIELD.y0 + BALL_R) { b.y = FIELD.y0 + BALL_R; b.vy = Math.abs(b.vy); wallBounce(b); }
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y - 9 && b.py + BALL_R <= PADDLE_Y + 12 &&
        Math.abs(b.x - paddle.x) <= paddle.w / 2 + BALL_R) paddleHit(b);
    hitBricks(b);
    if (b.y > CH + 30) { b.dead = true; onBallLost(b); }
  }
  if (b.dead) return;
  /* near-miss: fast ball grazing the bottom edge → 0.6× slow-mo, once per 10s */
  if (!VG.Juice.reduced && b.vy > 0 && sp >= 300 && b.y > FIELD.y1 - 20 &&
      nowMs - lastNearMiss > 10000) {
    lastNearMiss = nowMs;
    loop.slowMotion(0.6, 200);
    if (!DEMO) S.whoosh();
    popup("Whoa!", b.x, b.y - 40, 24, C.sky);
  }
  b.trail.push({ x: b.x, y: b.y });
  if (b.trail.length > 13) b.trail.shift();
}
function wallBounce(b) {
  b.squashT = nowMs;
  if (!DEMO) S.bounce(0);
}
function hitBricks(b) {
  for (var i = 0; i < bricks.length; i++) {
    var k = bricks[i];
    if (!k.alive) continue;
    var bx0 = k.x - k.w / 2, by0 = k.y - k.h / 2;
    var nx = clamp(b.x, bx0, bx0 + k.w), ny = clamp(b.y, by0, by0 + k.h);
    var dx = b.x - nx, dy = b.y - ny;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
    if (Math.abs(dx) > Math.abs(dy)) {
      b.vx = dx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx);
      b.x = dx > 0 ? bx0 + k.w + BALL_R : bx0 - BALL_R;
    } else {
      b.vy = dy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy);
      b.y = dy > 0 ? by0 + k.h + BALL_R : by0 - BALL_R;
      if (dy === 0) b.vy = -Math.abs(b.vy);
    }
    b.squashT = nowMs;
    damageBrick(k, nx, ny);
    return;                                         /* one brick per substep */
  }
}
function launchBall(b) {
  if (!b || !b.stuck) return;
  b.stuck = false;
  var a = DEMO ? ((Math.floor(nowMs / 2400) % 2 === 0 ? 1 : -1) * 0.1)
               : (Math.random() * 0.4 - 0.2), sp = curSpeed();
  b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp;
  if (!DEMO) S.jump();
}

function update(dt) {
  nowMs = performance.now();
  if (paused) return;

  if (state === "intro") {
    if (nowMs - introT0 > (DEMO ? 700 : 1300)) state = "play";
  }
  if (state === "clear" && clearSeq) {
    clearSeq.update(dt * 1000);                     /* 3-beat choreography */
    particles.update(dt);
    score.update();
    return;
  }
  if (state !== "play") {
    particles.update(dt);
    score.update();
    /* demo attract: after the victory card, loop back to the pictures */
    if (DEMO && state === "victory" && nowMs - victoryAt > 4200) beginRun();
    return;
  }

  /* --- paddle: mouse target / touch-drag / arrows, with smoothing -------- */
  var kb = 0;
  if (input.isHeld("left")) kb -= 1;
  if (input.isHeld("right")) kb += 1;
  if (kb !== 0) paddle.target = clamp(paddle.target + kb * 560 * dt, FIELD.x0 + paddle.w / 2, FIELD.x1 - paddle.w / 2);
  paddle.target = clamp(paddle.target, FIELD.x0 + paddle.w / 2, FIELD.x1 - paddle.w / 2);
  paddle.x += (paddle.target - paddle.x) * Math.min(1, dt * 18);   /* smoothing */
  if (DEMO) autopilot(dt);
  paddle.w += (paddle.targetW - paddle.w) * Math.min(1, dt * 10);

  /* --- effect timers ------------------------------------------------------ */
  for (var f in fx) if (fx[f] > 0) {
    fx[f] -= dt;
    if (fx[f] <= 0) { fx[f] = 0; if (f === "wide") paddle.targetW = 110; }
  }

  /* --- respawn after gentle loss ------------------------------------------ */
  if (respawnAt && nowMs >= respawnAt && balls.length === 0) {
    respawnAt = 0;
    spawnBall(true);
  }

  /* --- balls --------------------------------------------------------------- */
  for (var i = balls.length - 1; i >= 0; i--) {
    stepBall(balls[i], dt);
    if (balls[i].dead) balls.splice(i, 1);
  }

  /* --- falling power-up stickers ------------------------------------------- */
  for (var p = powers.length - 1; p >= 0; p--) {
    var pw = powers[p];
    pw.y += 112 * dt;
    pw.x += Math.sin((nowMs - pw.t0) / 300 + pw.seed) * 14 * dt;
    if (pw.y > PADDLE_Y - 22 && pw.y < PADDLE_Y + 16 && Math.abs(pw.x - paddle.x) < paddle.w / 2 + 18) {
      applyPower(pw); powers.splice(p, 1); continue;
    }
    if (pw.y > FIELD.y1 + 24) powers.splice(p, 1);
  }

  /* demo attract cycle: ~30s per level, then rotate to the next picture */
  if (DEMO && nowMs - demoCycleT > 30000) startLevel((levelIdx + 1) % LEVELS.length);

  particles.update(dt);
  score.update();
}

/* demo autopilot — tracks ONLY the falling ball's real landing spot (folded at
 * the side walls). Rising balls would poison the prediction, so the paddle
 * relaxes toward center while everything is airborne. */
function autopilot(dt) {
  var target = CW / 2, best = -1e9;
  for (var i = 0; i < balls.length; i++) {
    var b = balls[i];
    if (b.stuck || b.vy <= 0) continue;
    if (b.y > best) {                                /* lowest ball lands soonest */
      best = b.y;
      var tHit = (PADDLE_Y - b.y) / b.vy;
      var px = b.x + b.vx * tHit;                    /* raw lead… */
      var lo = FIELD.x0 + BALL_R, hi = FIELD.x1 - BALL_R, span = hi - lo;
      var m = (px - lo) % (2 * span);                /* …folded at side walls */
      if (m < 0) m += 2 * span;
      px = m <= span ? lo + m : lo + 2 * span - m;
      /* alternate softly off-center contact so rallies stay steep AND lively */
      var aim = (Math.floor(nowMs / 2400) % 2 === 0 ? 1 : -1) * 14;
      /* low = trust the fold prediction; near the paddle, track the ball itself
         (late brick deflections would otherwise poison the landing guess) */
      var k = clamp((b.y - 300) / 160, 0, 1);
      target = (px * (1 - k) + b.x * k) + aim;
    }
  }
  target = clamp(target + Math.sin(nowMs / 700) * 3, FIELD.x0 + paddle.w / 2, FIELD.x1 - paddle.w / 2);
  /* hand the brush straight to the target — the shared smoothing line above is
     the only speed cap (a second clamp here would stack and crawl) */
  paddle.target = target;
}

/* --------------------------------------------------------------------------
 * 9. Input — pointer (mouse + touch-drag), keys via engine createInput
 * ------------------------------------------------------------------------ */
var uiButtons = [];                                   /* rebuilt per render frame */
function addBtn(label, x, y, w, h, fill, cb) {
  uiButtons.push({ label: label, x: x, y: y, w: w, h: h, fill: fill, cb: cb,
                   pressed: pointerDown && pointerPos.x >= x && pointerPos.x <= x + w &&
                              pointerPos.y >= y && pointerPos.y <= y + h });
}
var pointerPos = { x: CW / 2, y: CH / 2 }, pointerDown = false;

canvas.addEventListener("pointermove", function (e) {
  pointerPos = toDesign(e);
  if (state === "play" || state === "intro") paddle.target = pointerPos.x;
});
canvas.addEventListener("pointerdown", function (e) {
  pointerDown = true;
  pointerPos = toDesign(e);
  unlockAudio();
  if (DEMO) return;
  /* UI buttons first */
  for (var i = 0; i < uiButtons.length; i++) {
    var b = uiButtons[i];
    if (pointerPos.x >= b.x && pointerPos.x <= b.x + b.w &&
        pointerPos.y >= b.y && pointerPos.y <= b.y + b.h) {
      S.tick(); b.cb(); return;
    }
  }
  if (state === "title") { beginRun(); return; }
  if (paused) { togglePause(); return; }
  if (state === "play") {
    for (var j = 0; j < balls.length; j++) if (balls[j].stuck) launchBall(balls[j]);
  }
  if (state === "clear" && clearSeq) clearSeq.skip();   /* consent rule */
  if (state === "over" || state === "victory") beginRun();
});
window.addEventListener("pointerup", function () { pointerDown = false; });
function unlockAudio() {
  if (DEMO) return;
  S.unlock();
  if ((state === "play" || state === "intro") && !paused && !S.music.playing) startLevelMusic();
}
window.addEventListener("keydown", function () { unlockAudio(); }, { once: true });

input.onAction(function (a) {
  if (DEMO) return;
  if (state === "title") { beginRun(); return; }
  if (a === "pause") { togglePause(); return; }
  if (paused) return;
  if (state === "play") {
    if (a === "action" || a === "up") {
      for (var j = 0; j < balls.length; j++) if (balls[j].stuck) launchBall(balls[j]);
    }
  } else if (state === "clear" && clearSeq) clearSeq.skip();
  else if (state === "over" || state === "victory") { if (a === "action") beginRun(); }
});
window.addEventListener("keydown", function (e) {
  if (DEMO) return;
  var k = e.key.toLowerCase();
  if (k === "j") VG.Juice.toggle();                  /* reduced-juice toggle */
  if (k === "m") S.setMuted(!S.muted);
  if (k === "escape" && (state === "over" || state === "victory")) quitToShelf();
});
function togglePause() {
  if (state !== "play" && state !== "intro") return;
  paused = !paused;
  S.tick();
  if (paused) S.stopMusic();
  else if (!DEMO) startLevelMusic();
}
function quitToShelf() {
  S.stopMusic();
  harness.gameQuit(score.value);
  state = "title"; paused = false;
}

/* --------------------------------------------------------------------------
 * 10. Rendering
 * ------------------------------------------------------------------------ */
function blit(spr, x, y, w, h) {                     /* baked-at-K sprite → design px */
  ctx.drawImage(spr, x, y, w != null ? w : spr.width / K, h != null ? h : spr.height / K);
}
function text(str, x, y, size, font, color, align) {
  ctx.font = (font === "body" ? "600 " : "700 ") + size + "px " + (font === "body" ? FBODY : FDISP);
  ctx.textAlign = align || "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = color || C.ink;
  ctx.fillText(str, x, y);
}
function outlinedText(str, x, y, size, color, align) {
  ctx.font = "700 " + size + "px " + FDISP;
  ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 4; ctx.strokeStyle = T.cream; ctx.lineJoin = "round";
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color || C.ink;
  ctx.fillText(str, x, y);
}

function renderBricks() {
  for (var i = 0; i < bricks.length; i++) {
    var b = bricks[i];
    if (!b.alive) continue;
    var spr = brickSprite(b);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.tilt);                               /* seeded ±1.5° — stable */
    blit(spr, -(b.w / 2 + PAD), -(b.h / 2 + PAD));
    ctx.restore();
  }
}
function renderBalls() {
  var dw = ballSpr.width / K, dh = ballSpr.height / K;
  for (var i = 0; i < balls.length; i++) {
    var b = balls[i];
    /* faint crayon trail — cached stamp, fading alpha, no per-frame texture */
    if (!VG.Juice.reduced && !b.stuck) {
      for (var t = 0; t < b.trail.length; t++) {
        var a = (t / b.trail.length) * 0.32;
        ctx.globalAlpha = a;
        var sz = 10 + (t / b.trail.length) * 8;
        blit(trailSpr, b.trail[t].x - sz / 2, b.trail[t].y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
    }
    var sx = 1, sy = 1;
    if (nowMs - b.squashT < 110) {                    /* doctrine landing squash */
      var q = 1 - (nowMs - b.squashT) / 110;
      sx = 1 + 0.22 * q; sy = 1 - 0.22 * q;
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.sin(nowMs / 130 + i) * 0.08);     /* paper-wad tumble */
    ctx.scale(sx, sy);
    blit(ballSpr, -dw / 2, -dh / 2);
    ctx.restore();
  }
}
function renderCrumple() {
  for (var i = crumples.length - 1; i >= 0; i--) {
    var c = crumples[i], t = (nowMs - c.t0) / 620;
    if (t >= 1) { crumples.splice(i, 1); continue; }
    var s = 1 - 0.55 * E.easeIn(t);                   /* the wad crumples sadly */
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.sin(t * 18) * 0.12 * (1 - t));
    ctx.scale(s, s);
    ctx.globalAlpha = 1 - t * 0.4;
    blit(ballSpr, -ballSpr.width / (2 * K), -ballSpr.height / (2 * K));
    ctx.globalAlpha = t * 0.7;                        /* little crumple creases */
    ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 1.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(3, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -5); ctx.lineTo(-2, 4); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
function renderPaddle() {
  var spr = paddleSprite(paddle.w);
  var sy = 1;
  if (nowMs - paddle.squashT < 100) sy = 0.88 + 0.12 * ((nowMs - paddle.squashT) / 100);
  ctx.save();
  ctx.translate(paddle.x, PADDLE_Y);
  ctx.scale(1, sy);
  blit(spr, -(paddle.w / 2 + 12), -(9 + 12));
  /* sticky glow cue — a dripping-glue underline while the grip is tacky */
  if (fx.sticky > 0) {
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(nowMs / 160);
    ctx.strokeStyle = C.sun; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-paddle.w / 2 + 8, 13);
    ctx.lineTo(paddle.w / 2 - 8, 13);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function renderPowers() {
  for (var i = 0; i < powers.length; i++) {
    var p = powers[i], spr = powerSpr[p.kind];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin((nowMs - p.t0) / 260 + p.seed) * 0.12);
    blit(spr, -28, -28);
    ctx.restore();
  }
}
function renderPopups() {
  for (var i = popups.length - 1; i >= 0; i--) {
    var p = popups[i], t = (nowMs - p.t0) / p.ms;
    if (t >= 1) { popups.splice(i, 1); continue; }
    var s = E.pop(Math.min(1, t * 3));
    var y = p.y - 26 * E.easeOut(t);
    ctx.save();
    ctx.translate(p.x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    outlinedText(p.text, 0, 0, p.size, p.color, "center");
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
/* Frogmaster Flex cameo — cheers from the desk corner on the frog level,
   the title, and every level clear. Blink loop 3–5s, paired-eye 80ms offset. */
function renderFrog(showCheer) {
  var fxp = 86, fyp = 566;
  var breathe = 1 + 0.02 * Math.sin(nowMs / 1200 * Math.PI);      /* idle breath */
  var hopY = 0, hopS = 1;
  if (showCheer && nowMs - frogCheer < 1400) {
    var ht = (nowMs - frogCheer) / 1400;
    hopY = -30 * Math.sin(Math.PI * Math.min(1, ht * 2));
    hopS = ht < 0.2 ? 0.9 + 0.2 * E.pop(ht / 0.2) : 1.1 - 0.1 * E.easeOut((ht - 0.2) / 0.8);
  }
  ctx.save();
  ctx.translate(fxp, fyp + hopY);
  ctx.scale(0.8 * hopS, 0.8 * hopS * breathe);
  blit(frogSpr, -frogSpr.width / (2 * K), -frogSpr.height / K);
  /* blink — eyelids close 1→0.1→1 over 140ms, paired eyes offset 80ms */
  var cyc = nowMs % 3800;
  for (var e = 0; e < 2; e++) {
    var bt = cyc - (e ? 80 : 0) - 3300;
    if (bt > 0 && bt < 140) {
      ctx.fillStyle = C.leaf;
      ctx.save();
      ctx.translate((e ? 56 : 28) - 48, 28 - 88);      /* sprite-local eye centers */
      ctx.scale(1, Math.max(0.12, 1 - Math.sin(Math.PI * bt / 140)));
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  if (showCheer && nowMs - frogCheer < 1400) {
    var bs = E.pop(Math.min(1, (nowMs - frogCheer) / 300));
    ctx.save();
    ctx.translate(fxp + 44, fyp - 66 + hopY);
    ctx.scale(bs, bs);
    VG.washiPanel(ctx, -14, -20, 96, 38, { scale: 1, tape: C.leaf });
    text("Ribbit!", 34, -1, 19, "disp", C.ink, "center");
    ctx.restore();
  }
}

/* HUD — washi panels, sticker hearts, level card, pill buttons (≥18px text) */
function renderHUD() {
  uiButtons = [];
  VG.washiPanel(ctx, 24, 8, 240, 60, { scale: 1, tape: C.sky });
  text("SCORE", 52, 26, 18, "body", C.inkSoft);
  score.render(ctx, 122, 38, 26);
  if (bestScore > 0) text("best " + Math.max(bestScore, score.value), 250, 26, 18, "body", C.inkSoft, "right");

  VG.washiPanel(ctx, 300, 8, 280, 60, { scale: 1, tape: C.sun });
  text("LEVEL " + (levelIdx + 1) + " OF " + LEVELS.length, 440, 25, 18, "body", C.inkSoft, "center");
  text(LEVELS[levelIdx].name, 440, 49, 24, "disp", C.ink, "center");

  for (var i = 0; i < 3; i++) {
    blit(i < lives ? heartOn : heartOff, 598 + i * 40, 18, 40, 40);
  }
  if (!DEMO) {
    addBtn("Pause", 722, 10, 90, 56, C.paper2, togglePause);
    addBtn("Quit", 820, 10, 88, 56, C.sun, quitToShelf);
    for (var b = 0; b < uiButtons.length; b++) {
      var btn = uiButtons[b];
      var label = btn.label === "Pause" ? "❚❚ Pause" : "Quit";
      VG.pillButton(ctx, { x: btn.x, y: btn.y, w: btn.w, h: btn.h, label: label,
                           fill: btn.fill, pressed: btn.pressed, fontSize: 18 });
    }
  } else {
    /* demo badge instead of controls */
    VG.washiPanel(ctx, 838, 10, 92, 40, { scale: 1, tape: C.berry });
    text("DEMO", 884, 30, 20, "disp", C.ink, "center");
  }
  /* active effect chips — icon word + seconds, dual-coded */
  var chipX = 26;
  var chips = [];
  if (fx.wide > 0) chips.push(["Wide", C.violet, fx.wide]);
  if (fx.slow > 0) chips.push(["Slow", C.sky, fx.slow]);
  if (fx.sticky > 0) chips.push(["Sticky", C.sun, fx.sticky]);
  for (var cI = 0; cI < chips.length; cI++) {
    var ch = chips[cI];
    ctx.fillStyle = T.cream;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(chipX, 74, 108, 26, 13) : ctx.rect(chipX, 74, 108, 26);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = ch[1];
    ctx.beginPath(); ctx.arc(chipX + 14, 87, 6, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = C.ink; ctx.stroke();
    text(ch[0] + " " + Math.ceil(ch[2]) + "s", chipX + 26, 88, 18, "body", C.ink);
    chipX += 116;
  }
}

/* launch hint — dual coded (icon + word) while the wad waits on the brush */
function renderLaunchHint() {
  if (state !== "play" || DEMO) return;
  var waiting = false;
  for (var i = 0; i < balls.length; i++) if (balls[i].stuck) waiting = true;
  if (!waiting) return;
  var pulse = VG.Juice.reduced ? 1 : 0.65 + 0.35 * Math.sin(nowMs / 350);
  ctx.save();
  ctx.globalAlpha = pulse;
  outlinedText(DEMO ? "" : "Tap or press Space to launch!", CW / 2, 480, 22, C.inkSoft, "center");
  ctx.restore();
}

/* result / menu cards ----------------------------------------------------- */
function cardPanel(w, h) {
  VG.washiPanel(ctx, -w / 2, -h / 2, w, h, { scale: 1, tape: C.violet });
}
function renderClearCard() {
  if (!clearCard) return;
  var t = Math.min(1, (nowMs - clearCard.t0) / clearCard.ms);
  var s = 0.9 + 0.1 * E.pop(t);
  ctx.save();
  ctx.translate(CW / 2, 250 - clearCard.rise * E.easeOut(t));
  ctx.scale(s, s);
  cardPanel(380, 150);
  outlinedText("LEVEL CLEAR!", 0, -30, 38, C.ink, "center");
  text(CLEAR_LINES[levelIdx % CLEAR_LINES.length], 0, 12, 22, "body", C.inkSoft, "center");
  text("+500 bonus", 0, 46, 20, "disp", C.sun, "center");
  ctx.restore();
}
function renderIntroCard() {
  var t = (nowMs - introT0) / (DEMO ? 700 : 1300);
  var enter = E.pop(Math.min(1, t * 3));
  var exit = t > 0.75 ? E.easeIn((t - 0.75) / 0.25) : 0;   /* exit = 75% mark */
  ctx.save();
  ctx.translate(CW / 2, 260);
  ctx.scale(0.9 + 0.1 * enter, 0.9 + 0.1 * enter);
  ctx.globalAlpha = 1 - exit;
  cardPanel(420, 150);
  text("LEVEL " + (levelIdx + 1) + " OF " + LEVELS.length, 0, -38, 19, "body", C.inkSoft, "center");
  outlinedText(LEVELS[levelIdx].name, 0, -4, 36, C.ink, "center");
  text(LEVELS[levelIdx].sub, 0, 34, 20, "body", C.inkSoft, "center");
  ctx.restore();
  ctx.globalAlpha = 1;
}
function renderPauseOverlay() {
  uiButtons = [];
  ctx.fillStyle = D.inkRGBA(0.35);
  ctx.fillRect(0, 0, CW, CH);
  ctx.save();
  ctx.translate(CW / 2, CH / 2);
  cardPanel(420, 300);
  outlinedText("Paused", 0, -100, 40, C.ink, "center");
  addBtn("Resume", -170, -52, 160, 56, C.leaf, togglePause);
  addBtn("Restart", 10, -52, 160, 56, C.sun, function () { paused = false; beginRun(); });
  addBtn("Quit to shelf", -170, 26, 340, 56, C.paper2, quitToShelf);
  ctx.restore();
  /* pill buttons need world coords — redraw them outside the transform */
  for (var j = 0; j < uiButtons.length; j++) {
    var b2 = uiButtons[j];
    VG.pillButton(ctx, { x: CW / 2 + b2.x, y: CH / 2 + b2.y, w: b2.w, h: b2.h,
                         label: b2.label, fill: b2.fill, pressed: b2.pressed, fontSize: 20 });
    b2.x += CW / 2; b2.y += CH / 2;                    /* hit-test in world coords */
  }
}
function renderTitle() {
  uiButtons = [];
  ctx.fillStyle = D.inkRGBA(0.22);
  ctx.fillRect(0, 0, CW, CH);
  ctx.save();
  ctx.translate(CW / 2, 268);
  cardPanel(600, 356);
  outlinedText("Violet's Craft Breaker", 0, -118, 43, C.ink, "center");
  text("a corkboard breakout diorama", 0, -76, 20, "body", C.inkSoft, "center");
  /* decorative pinned bricks */
  var deco = [["pp", C.sky, -236], ["gg", T.gold, 214]];
  for (var dI = 0; dI < deco.length; dI++) {
    ctx.save();
    ctx.translate(deco[dI][2], -122);
    ctx.rotate((dI ? 3 : -4) * Math.PI / 180);
    blit(brickSprite({ kind: dI ? "gold" : "paper", color: deco[dI][1], cracked: false, variant: dI }), -(BRICK.w / 2 + PAD), -(BRICK.h / 2 + PAD));
    ctx.restore();
  }
  text("Move: mouse · arrow keys · touch-drag", 0, -18, 20, "body", C.ink, "center");
  text("Launch: tap · click · space", 0, 16, 20, "body", C.ink, "center");
  addBtn("Play!", -100, 52, 200, 60, C.sun, function () { beginRun(); });
  if (bestScore > 0) text("Best score: " + bestScore, 0, 140, 20, "disp", C.violet, "center");
  var pulse = VG.Juice.reduced ? 1 : 0.6 + 0.4 * Math.sin(nowMs / 400);
  ctx.globalAlpha = pulse;
  text("press space or tap anywhere", 0, 165, 18, "body", C.inkSoft, "center");
  ctx.globalAlpha = 1;
  ctx.restore();
  for (var j = 0; j < uiButtons.length; j++) {
    var b2 = uiButtons[j];
    VG.pillButton(ctx, { x: CW / 2 + b2.x, y: 268 + b2.y, w: b2.w, h: b2.h,
                         label: b2.label, fill: b2.fill, pressed: b2.pressed, fontSize: 24 });
    b2.x += CW / 2; b2.y += 268;
  }
}
function renderEndCard(title, sub) {
  uiButtons = [];
  ctx.fillStyle = D.inkRGBA(0.25);
  ctx.fillRect(0, 0, CW, CH);
  ctx.save();
  ctx.translate(CW / 2, 260);
  cardPanel(520, 320);
  outlinedText(title, 0, -104, 40, C.ink, "center");
  text(sub, 0, -62, 21, "body", C.inkSoft, "center");
  text("SCORE", 0, -18, 19, "body", C.inkSoft, "center");
  outlinedText(String(score.value), 0, 18, 43, C.ink, "center");
  if (newRecord) {
    ctx.save(); ctx.rotate(-3 * Math.PI / 180);
    outlinedText("★ NEW BEST! ★", 0, 62, 26, C.sun, "center");
    ctx.restore();
  } else {
    text("Best: " + bestScore, 0, 62, 20, "disp", C.violet, "center");
  }
  addBtn("Play again", -190, 92, 190, 58, C.sun, function () { beginRun(); });
  addBtn("Shelf", 20, 92, 170, 58, C.paper2, quitToShelf);
  ctx.restore();
  for (var j = 0; j < uiButtons.length; j++) {
    var b2 = uiButtons[j];
    VG.pillButton(ctx, { x: CW / 2 + b2.x, y: 260 + b2.y, w: b2.w, h: b2.h,
                         label: b2.label, fill: b2.fill, pressed: b2.pressed, fontSize: 20 });
    b2.x += CW / 2; b2.y += 260;
  }
}

function render() {
  var f = fit();
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.fillStyle = T.desk;                             /* letterbox bars = desk */
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(f.ox, f.oy);
  ctx.scale(f.s, f.s);

  blit(bgSpr, 0, 0, CW, CH);

  /* the world shakes (≤3px, good hits only) — the HUD never does */
  var off = shake.offset();
  ctx.save();
  ctx.translate(off[0], off[1]);
  renderBricks();
  renderPowers();
  /* Flex sits behind the ball & paddle so gameplay always reads first */
  if (levelIdx === 3 || state === "victory" || state === "title") {
    renderFrog(state !== "play" || frogShowActive());
  } else if (frogCheer && nowMs - frogCheer < 1400) {
    renderFrog(true);
  }
  renderBalls();
  renderCrumple();
  renderPaddle();
  particles.render(ctx);
  renderPopups();
  ctx.restore();

  if (state !== "title") renderHUD();
  renderLaunchHint();
  if (state === "intro") renderIntroCard();
  if (state === "clear") renderClearCard();
  if (state === "title") renderTitle();
  if (state === "over") renderEndCard("Great crafting!", "Every sticker tells a story.");
  if (state === "victory") renderEndCard("Gallery complete!", "You cleared every picture!");
  if (paused) renderPauseOverlay();

  flash.render(ctx, CW, CH);
  ctx.restore();
}
function frogShowActive() {
  return frogCheer && nowMs - frogCheer < 1400;
}

/* --------------------------------------------------------------------------
 * 11. Boot
 * ------------------------------------------------------------------------ */
var loop = VG.createLoop({
  update: update,
  render: render
});
bakeAllSprites();
if (DEMO) {
  beginRun();                                         /* attract mode auto-plays */
} else {
  state = "title";
}
loop.start();
})();
