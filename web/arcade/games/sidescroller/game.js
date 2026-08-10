/* ============================================================================
 * Sticker Safari — Vee Arcade sidescroller (DESIGN-BIBLE "Paper Playground")
 *
 * An auto-advancing paper-craft run with Violet: meadows → treehouse village
 * → starlit hills. Collect stars/fireflies/stickers, boing on brambles,
 * ride leaf-lifts, zoom off leaf pads. Gentle failure, checkpoint flags,
 * sticker-heart lives. Procedural canvas art only; sprites pre-rendered at
 * 2×; parallax bands baked; seeded wobble; no shadowBlur; tokens only.
 * ========================================================================== */
(function () {
"use strict";

var G = window.VeeGame;
var D = G.DESIGN;
var C = D.colors;
var SFX = window.VeeSFX;
var DEMO = !!window.STICKERSAFARI_DEMO;

/* ---- per-game palette: DESIGN tokens + named derived tones (leaf-paper
 * world per the §4.6 sidescroller brief — every hex declared here, once) -- */
var PAL = {
  paperGrass: "#F0F7E4",   /* leaf-green paper base (per-game paper shift)  */
  skin:       "#FFE3C4",   /* Violet's cream-peach face                     */
  warmWhite:  "#FFFDF5",   /* die-cut sticker border / warm highlights      */
  skyTop:     C.sky,
  skyLow:     "#DCEFD8",
  warmTop:    "#A8D8F0",
  warmLow:    "#FFEFC9",
  duskTop:    "#5E4B78",
  duskLow:    "#E9B98F",
  hillFar0:   "#CDE8B5",
  hillNear0:  "#A9DB90",
  hillFar1:   "#C7DE9E",
  hillNear1:  "#9CCB7E",
  hillFar2:   "#7A6694",
  hillNear2:  "#675480",
  grassDeep:  "#3E9A57",
  dirt:       C.paper3,
  wood:       "#C9A06B",
  leafDark:   "#37874C"
};

/* ---- physics (kid-tuned: floaty, generous) ---------------------------- */
var VIEW_W = 960, VIEW_H = 540;
var SPEED = 170, DASH_SPEED = 360, DASH_TIME = 0.9;
var GRAV = 1700, JUMP_V = -880, PAD_VY = -760, PUFF_VY = -700;
var LEVEL_END = 14150, FINISH_X = 13900;

/* ---- tiny helpers ------------------------------------------------------ */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
  g.rect(x, y, w, h);
}

/* ========================================================================
 * 1. Canvas, FX, input, harness
 * ====================================================================== */
function $(id) { return document.getElementById(id); }
var canvas = $("stage");
var cv = G.setupCanvas(canvas, { width: VIEW_W, height: VIEW_H });
var ctx = cv.ctx, view = cv.view;

var particles = new G.ParticlePool();
var shake = G.createShake();
var flash = G.createFlash();
var input = G.createInput({
  actions: {
    jump:  [" ", "Enter", "ArrowUp", "w", "W", "z", "Z"],
    pause: ["Escape", "p", "P"]
  }
});
var harness = DEMO ? null : G.createHarness("sidescroller");

/* ========================================================================
 * 2. Pre-rendered sprites (offscreen canvases at 2×)
 * ====================================================================== */
function mk(w, h) {
  var c = document.createElement("canvas");
  c.width = w * 2; c.height = h * 2;
  var g = c.getContext("2d");
  g.scale(2, 2);
  return { c: c, g: g, w: w, h: h };
}
function starPath(g, x, y, r, rot) {
  g.beginPath();
  for (var i = 0; i < 10; i++) {
    var a = (rot || -Math.PI / 2) + i * Math.PI / 5;
    var rr2 = i % 2 === 0 ? r : r * 0.46;
    var px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}
function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.62);
  g.bezierCurveTo(x - s * 1.15, y - s * 0.28, x - s * 0.5, y - s * 1.05, x, y - s * 0.34);
  g.bezierCurveTo(x + s * 0.5, y - s * 1.05, x + s * 1.15, y - s * 0.28, x, y + s * 0.62);
  g.closePath();
}
function inkStroke(g, w) { g.lineWidth = w || 2; g.strokeStyle = C.ink; g.stroke(); }

/* ---- Violet, the runner (48×56 logical; origin = feet center) --------- */
function paintViolet(frame) {
  var s = mk(48, 56), g = s.g;
  var jr = G.mulberry32(900 + frame.length * 7 + frame.charCodeAt(0));
  function jx() { return (jr() - 0.5) * 1.2; }
  /* legs + shoes */
  g.lineWidth = 3.4; g.strokeStyle = C.ink; g.lineCap = "round";
  var legs = {
    run1:  [[19, 44, 15, 54], [29, 44, 34, 53]],
    run2:  [[21, 44, 26, 54], [27, 44, 22, 53]],
    jump:  [[19, 44, 16, 50], [29, 44, 33, 49]],
    dizzy: [[20, 44, 18, 54], [28, 44, 30, 54]],
    happy: [[19, 44, 15, 54], [29, 44, 33, 54]]
  }[frame];
  for (var i = 0; i < legs.length; i++) {
    var L = legs[i];
    g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(L[2] + jx(), L[3]); g.stroke();
    g.fillStyle = C.berry;
    g.beginPath(); g.ellipse(L[2] + 1 + jx(), L[3], 4.4, 3.2, 0, 0, Math.PI * 2); g.fill();
    inkStroke(g, 1.6);
  }
  /* dress — violet trapezoid, wobble-jittered vertices */
  g.beginPath();
  g.moveTo(16 + jx(), 28);
  g.lineTo(32 + jx(), 28);
  g.lineTo(39 + jx(), 46);
  g.quadraticCurveTo(24, 50 + jx(), 9 + jx(), 46);
  g.closePath();
  g.fillStyle = C.violet; g.fill(); inkStroke(g, 2);
  /* sun polka dots on the dress */
  g.fillStyle = C.sun;
  g.beginPath(); g.arc(20, 37, 1.8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(29, 41, 1.8, 0, Math.PI * 2); g.fill();
  /* arms */
  g.lineWidth = 3; g.strokeStyle = C.ink;
  var swing = frame === "run1" ? 1 : frame === "run2" ? -1 : 0;
  g.beginPath(); g.moveTo(15, 31); g.lineTo(9 + jx(), 38 + swing * 3); g.stroke();
  g.beginPath(); g.moveTo(33, 31); g.lineTo(39 + jx(), 38 - swing * 3); g.stroke();
  if (frame === "happy") { /* both arms up! */
    g.beginPath(); g.moveTo(15, 30); g.lineTo(8, 22); g.stroke();
    g.beginPath(); g.moveTo(33, 30); g.lineTo(40, 22); g.stroke();
  }
  /* head */
  g.beginPath(); g.arc(24, 16, 12.4, 0, Math.PI * 2);
  g.fillStyle = PAL.skin; g.fill(); inkStroke(g, 2);
  /* hair: ink bob cap + side puffs */
  g.beginPath(); g.arc(24, 14.5, 12.6, Math.PI * 1.02, Math.PI * 1.98);
  g.quadraticCurveTo(33, 12, 24, 9.5);
  g.quadraticCurveTo(15, 12, 11.6, 15.4);
  g.closePath();
  g.fillStyle = C.ink; g.fill();
  g.beginPath(); g.arc(11.5, 17, 3.4, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
  g.beginPath(); g.arc(36.5, 17, 3.4, 0, Math.PI * 2); g.fill();
  /* sun bow */
  g.fillStyle = C.sun;
  g.beginPath(); g.moveTo(30, 6); g.lineTo(36, 3); g.lineTo(35, 9); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(30, 6); g.lineTo(25, 2.6); g.lineTo(26, 9); g.closePath(); g.fill();
  inkStroke(g, 1.4);
  /* face */
  if (frame === "dizzy") {
    g.strokeStyle = C.ink; g.lineWidth = 1.8;
    var xx = function (cx, cy) {
      g.beginPath();
      g.moveTo(cx - 2.4, cy - 2.4); g.lineTo(cx + 2.4, cy + 2.4);
      g.moveTo(cx + 2.4, cy - 2.4); g.lineTo(cx - 2.4, cy + 2.4);
      g.stroke();
    };
    xx(19.5, 17); xx(28.5, 17);
    g.beginPath(); g.arc(24, 22.5, 2, 0, Math.PI * 2); inkStroke(g, 1.6);
  } else if (frame === "happy") {
    g.strokeStyle = C.ink; g.lineWidth = 2; g.lineCap = "round";
    g.beginPath(); g.arc(19.5, 17.5, 2.8, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.beginPath(); g.arc(28.5, 17.5, 2.8, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.beginPath(); g.arc(24, 20.5, 3.2, 0.15, Math.PI - 0.15); g.stroke();
  } else {
    g.fillStyle = C.ink;
    g.beginPath(); g.ellipse(19.5, 17, 2.3, 2.9, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(28.5, 17, 2.3, 2.9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.warmWhite;
    g.beginPath(); g.arc(20.3, 16, 0.9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(29.3, 16, 0.9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.6; g.lineCap = "round";
    g.beginPath(); g.arc(24, 20.5, 2.6, 0.25, Math.PI - 0.25); g.stroke();
  }
  /* cheeks */
  g.globalAlpha = 0.3; g.fillStyle = C.berry;
  g.beginPath(); g.arc(14.5, 20.5, 2.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(33.5, 20.5, 2.3, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  return s;
}

/* ---- Frogmaster Flex cameo (green frog, purple scarf) ------------------ */
function paintFrog(scale) {
  var w = 64, h = 58;
  var s = mk(w, h), g = s.g;
  /* body */
  G.wobblyBlobPath(g, 32, 40, 21, 15, "frogbody", 9);
  g.fillStyle = C.leaf; g.fill(); inkStroke(g, 2);
  /* belly */
  g.beginPath(); g.ellipse(32, 45, 12, 8, 0, 0, Math.PI * 2);
  g.fillStyle = C.paper2; g.fill();
  /* eye bumps */
  for (var e = 0; e < 2; e++) {
    var ex = e === 0 ? 22 : 42;
    g.beginPath(); g.arc(ex, 24, 7.6, 0, Math.PI * 2);
    g.fillStyle = C.leaf; g.fill(); inkStroke(g, 2);
    g.beginPath(); g.arc(ex, 24, 4.6, 0, Math.PI * 2);
    g.fillStyle = PAL.warmWhite; g.fill(); inkStroke(g, 1.4);
    g.beginPath(); g.arc(ex + 1, 24.5, 2, 0, Math.PI * 2);
    g.fillStyle = C.ink; g.fill();
  }
  /* smile */
  g.strokeStyle = C.ink; g.lineWidth = 1.8; g.lineCap = "round";
  g.beginPath(); g.arc(32, 36, 6.5, 0.3, Math.PI - 0.3); g.stroke();
  /* purple scarf — band + trailing end */
  g.beginPath();
  g.moveTo(16, 33); g.quadraticCurveTo(32, 39, 48, 33);
  g.lineTo(48, 38.5); g.quadraticCurveTo(32, 44.5, 16, 38.5);
  g.closePath();
  g.fillStyle = C.violet; g.fill(); inkStroke(g, 1.8);
  g.beginPath();
  g.moveTo(44, 37); g.lineTo(56 + (scale || 0), 42); g.lineTo(53, 49); g.lineTo(43, 42);
  g.closePath();
  g.fillStyle = C.violet; g.fill(); inkStroke(g, 1.8);
  /* feet */
  g.fillStyle = C.leaf;
  g.beginPath(); g.ellipse(20, 55, 6.5, 3.4, -0.15, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.6);
  g.beginPath(); g.ellipse(44, 55, 6.5, 3.4, 0.15, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.6);
  return s;
}

/* ---- collectibles ------------------------------------------------------ */
function paintStar() {
  var s = mk(28, 28), g = s.g;
  starPath(g, 14, 14, 12, -Math.PI / 2);
  g.fillStyle = C.sun; g.fill(); inkStroke(g, 2);
  g.fillStyle = PAL.warmWhite;
  g.beginPath(); g.arc(10, 9.5, 2, 0, Math.PI * 2); g.fill();
  return s;
}
function paintFly() {
  var s = mk(20, 20), g = s.g;
  g.beginPath(); g.arc(10, 11, 4.6, 0, Math.PI * 2);
  g.fillStyle = C.sun; g.fill(); inkStroke(g, 1.6);
  g.globalAlpha = 0.7; g.fillStyle = PAL.warmWhite;
  g.beginPath(); g.ellipse(4.5, 6.5, 4, 2.4, -0.6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(15.5, 6.5, 4, 2.4, 0.6, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(8.6, 10.4, 0.9, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(11.4, 10.4, 0.9, 0, Math.PI * 2); g.fill();
  return s;
}
/* sticker base: white die-cut border, then the creature */
function stickerBase(g, r, seed) {
  G.wobblyBlobPath(g, 22, 22, r + 5, r + 5, seed, 10);
  g.fillStyle = PAL.warmWhite; g.fill(); inkStroke(g, 2);
}
function paintSticker(kind) {
  var s = mk(44, 44), g = s.g;
  if (kind === "ladybug") {
    stickerBase(g, 14, "stl");
    g.beginPath(); g.arc(22, 23, 11, 0, Math.PI * 2);
    g.fillStyle = C.berry; g.fill(); inkStroke(g, 2);
    g.beginPath(); g.arc(22, 13.5, 5, 0, Math.PI * 2);
    g.fillStyle = C.ink; g.fill();
    g.beginPath(); g.moveTo(22, 13); g.lineTo(22, 34); g.lineWidth = 1.8; g.strokeStyle = C.ink; g.stroke();
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(16.5, 21, 2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(27.5, 26, 2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(18, 29, 1.7, 0, Math.PI * 2); g.fill();
  } else if (kind === "snail") {
    stickerBase(g, 14, "sts");
    g.beginPath(); g.ellipse(22, 30, 13, 5, 0, 0, Math.PI * 2);
    g.fillStyle = C.leaf; g.fill(); inkStroke(g, 1.8);
    g.beginPath(); g.arc(24, 22, 8.5, 0, Math.PI * 2);
    g.fillStyle = C.paper3; g.fill(); inkStroke(g, 2);
    g.beginPath(); g.arc(24, 22, 4.5, 0, Math.PI * 1.5); g.strokeStyle = C.inkSoft; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = C.ink; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(12, 28); g.lineTo(10, 21); g.stroke();
    g.beginPath(); g.arc(10, 20, 1.3, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
  } else if (kind === "frog") {
    stickerBase(g, 15, "stf");
    G.wobblyBlobPath(g, 22, 26, 11, 8, "stfb", 8);
    g.fillStyle = C.leaf; g.fill(); inkStroke(g, 1.8);
    for (var e = 0; e < 2; e++) {
      var ex = e === 0 ? 16.5 : 27.5;
      g.beginPath(); g.arc(ex, 17, 3.8, 0, Math.PI * 2); g.fillStyle = C.leaf; g.fill(); inkStroke(g, 1.5);
      g.beginPath(); g.arc(ex, 17, 1.5, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
    }
    g.beginPath(); g.moveTo(15, 24.5); g.quadraticCurveTo(22, 27.5, 29, 24.5);
    g.lineTo(29, 27.5); g.quadraticCurveTo(22, 30.5, 15, 27.5); g.closePath();
    g.fillStyle = C.violet; g.fill(); inkStroke(g, 1.4);
  } else if (kind === "butterfly") {
    stickerBase(g, 15, "stb");
    g.fillStyle = C.violet;
    g.beginPath(); g.ellipse(15.5, 19, 7, 8.5, -0.35, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.8);
    g.beginPath(); g.ellipse(28.5, 19, 7, 8.5, 0.35, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.8);
    g.fillStyle = C.sun;
    g.beginPath(); g.arc(15.5, 19, 2.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(28.5, 19, 2.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.6; g.lineCap = "round";
    g.beginPath(); g.moveTo(22, 13); g.lineTo(22, 30); g.stroke();
  } else { /* beetle */
    stickerBase(g, 14, "stbe");
    g.beginPath(); g.ellipse(22, 24, 11, 9, 0, 0, Math.PI * 2);
    g.fillStyle = C.sky; g.fill(); inkStroke(g, 2);
    g.beginPath(); g.moveTo(11.5, 22); g.lineTo(32.5, 22); g.strokeStyle = C.ink; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = PAL.warmWhite;
    g.beginPath(); g.arc(17, 27, 1.8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(27, 27, 1.8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(22, 15, 4, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
  }
  return s;
}
function paintPuff() { /* bramble puff — berry + spikes + stripes (danger shape-twin) */
  var s = mk(52, 52), g = s.g;
  g.fillStyle = C.berry;
  for (var i = 0; i < 9; i++) {
    var a = i / 9 * Math.PI * 2 + 0.17;
    g.beginPath();
    g.moveTo(26 + Math.cos(a - 0.28) * 15, 28 + Math.sin(a - 0.28) * 15);
    g.lineTo(26 + Math.cos(a) * 24, 28 + Math.sin(a) * 24);
    g.lineTo(26 + Math.cos(a + 0.28) * 15, 28 + Math.sin(a + 0.28) * 15);
    g.closePath(); g.fill(); inkStroke(g, 1.6);
  }
  G.wobblyBlobPath(g, 26, 28, 16, 15, "puff", 9);
  g.fillStyle = C.berry; g.fill(); inkStroke(g, 2);
  /* stripes = second danger signal */
  g.strokeStyle = "#A93A2C"; g.lineWidth = 3;
  g.beginPath(); g.arc(26, 28, 10.5, Math.PI * 0.75, Math.PI * 1.25); g.stroke();
  g.beginPath(); g.arc(26, 28, 5.5, Math.PI * 0.75, Math.PI * 1.25); g.stroke();
  /* friendly face — it means well */
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(21.5, 25, 1.9, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(30.5, 25, 1.9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 1.5; g.lineCap = "round";
  g.beginPath(); g.arc(26, 28, 3, 0.3, Math.PI - 0.3); g.stroke();
  return s;
}
function paintPad() { /* leaf zoom-pad with up chevrons */
  var s = mk(60, 26), g = s.g;
  G.wobblyBlobPath(g, 30, 16, 28, 9, "pad", 8);
  g.fillStyle = C.leaf; g.fill(); inkStroke(g, 2);
  g.strokeStyle = PAL.leafDark; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(8, 16); g.quadraticCurveTo(30, 12, 52, 16); g.stroke();
  g.strokeStyle = C.ink; g.lineWidth = 2.4; g.lineCap = "round";
  g.beginPath(); g.moveTo(24, 19); g.lineTo(30, 13); g.lineTo(36, 19); g.stroke();
  return s;
}
function paintHeart() { /* sticker heart (life) with die-cut border */
  var s = mk(32, 30), g = s.g;
  heartPath(g, 16, 15, 14);
  g.fillStyle = PAL.warmWhite; g.fill(); inkStroke(g, 2);
  heartPath(g, 16, 15, 10.5);
  g.fillStyle = C.berry; g.fill(); inkStroke(g, 1.8);
  g.fillStyle = PAL.warmWhite; g.globalAlpha = 0.8;
  g.beginPath(); g.arc(11.5, 10, 2.2, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  return s;
}

var SPR = {
  violet: { run1: paintViolet("run1"), run2: paintViolet("run2"),
            jump: paintViolet("jump"), dizzy: paintViolet("dizzy"),
            happy: paintViolet("happy") },
  frog: paintFrog(), frogBig: paintFrog(4),
  star: paintStar(), fly: paintFly(), heart: paintHeart(),
  puff: paintPuff(), pad: paintPad(),
  stickers: {
    ladybug: paintSticker("ladybug"), snail: paintSticker("snail"),
    frog: paintSticker("frog"), butterfly: paintSticker("butterfly"),
    beetle: paintSticker("beetle")
  }
};

/* ========================================================================
 * 3. Baked parallax layers (pre-rendered once; doctrine §3a ratios)
 * ====================================================================== */
var STRIP_W = 1920;
var SKY = [
  [PAL.skyTop, PAL.skyLow],
  [PAL.warmTop, PAL.warmLow],
  [PAL.duskTop, PAL.duskLow]
];

function bakeL0(z) {
  var s = mk(STRIP_W / 2, VIEW_H / 2); /* baked at 1× (540 tall), drawn 1:1 */
  var c = document.createElement("canvas");
  c.width = STRIP_W; c.height = VIEW_H;
  var g = c.getContext("2d");
  var rnd = G.mulberry32(41 + z);
  if (z === 2) { /* moon + baked stars */
    g.fillStyle = PAL.warmWhite;
    for (var i = 0; i < 110; i++) {
      g.globalAlpha = 0.35 + rnd() * 0.55;
      var sx = rnd() * STRIP_W, sy = rnd() * 320, r = 0.8 + rnd() * 1.6;
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
      if (rnd() < 0.12) { starPath(g, sx, sy, 3.4, rnd() * 3); g.fill(); }
    }
    g.globalAlpha = 1;
    g.beginPath(); g.arc(1520, 96, 40, 0, Math.PI * 2);
    g.fillStyle = C.paper; g.fill(); inkStroke(g, 2);
    g.fillStyle = PAL.paperGrass; g.globalAlpha = 0.5;
    g.beginPath(); g.arc(1508, 88, 7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(1532, 104, 5, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  } else { /* paper sun + cotton clouds */
    var sunX = z === 0 ? 1480 : 380, sunY = z === 0 ? 92 : 110;
    g.strokeStyle = C.sun; g.lineWidth = 4; g.lineCap = "round";
    for (var r2 = 0; r2 < 10; r2++) {
      var a = r2 / 10 * Math.PI * 2;
      g.beginPath();
      g.moveTo(sunX + Math.cos(a) * 56, sunY + Math.sin(a) * 56);
      g.lineTo(sunX + Math.cos(a) * 68, sunY + Math.sin(a) * 68);
      g.stroke();
    }
    g.beginPath(); g.arc(sunX, sunY, 46, 0, Math.PI * 2);
    g.fillStyle = C.sun; g.fill(); inkStroke(g, 2);
    for (var i2 = 0; i2 < 6; i2++) {
      var cx = rnd() * STRIP_W, cy = 60 + rnd() * 130, cw = 46 + rnd() * 34;
      G.wobblyBlobPath(g, cx, cy, cw, cw * 0.42, "cl" + z + "-" + i2, 8);
      g.fillStyle = PAL.warmWhite; g.fill();
      g.lineWidth = 1; g.strokeStyle = C.inkSoft; g.stroke();
    }
  }
  return c;
}

function bakeL1(z) {
  var c = document.createElement("canvas");
  c.width = STRIP_W; c.height = VIEW_H;
  var g = c.getContext("2d");
  var rnd = G.mulberry32(101 + z * 13);
  var toneFar = [PAL.hillFar0, PAL.hillFar1, PAL.hillFar2][z];
  var toneNear = [PAL.hillNear0, PAL.hillNear1, PAL.hillNear2][z];
  /* far hill band — flat silhouettes, no outlines (doctrine L1) */
  g.fillStyle = toneFar;
  g.beginPath(); g.moveTo(0, VIEW_H);
  var x = 0;
  while (x < STRIP_W + 200) {
    var hw = 260 + rnd() * 260, hh = 130 + rnd() * 120;
    g.quadraticCurveTo(x + hw / 2, VIEW_H - hh - 100 - rnd() * 40, x + hw, VIEW_H - 120);
    x += hw;
  }
  g.lineTo(STRIP_W, VIEW_H); g.closePath(); g.fill();
  /* near band */
  g.fillStyle = toneNear;
  g.beginPath(); g.moveTo(0, VIEW_H);
  x = -100;
  while (x < STRIP_W + 200) {
    var hw2 = 200 + rnd() * 220, hh2 = 60 + rnd() * 80;
    g.quadraticCurveTo(x + hw2 / 2, VIEW_H - hh2 - 40, x + hw2, VIEW_H - 70);
    x += hw2;
  }
  g.lineTo(STRIP_W, VIEW_H); g.closePath(); g.fill();
  if (z === 2) { /* sleeping sun-hats on dusk hills = tiny lit windows */
    g.fillStyle = C.sun;
    for (var i = 0; i < 14; i++) {
      g.globalAlpha = 0.75;
      g.fillRect(120 + rnd() * (STRIP_W - 240), 380 + rnd() * 90, 4, 5);
    }
    g.globalAlpha = 1;
  }
  return c;
}

function bakeL2(z) {
  var c = document.createElement("canvas");
  c.width = STRIP_W; c.height = VIEW_H;
  var g = c.getContext("2d");
  var rnd = G.mulberry32(303 + z * 17);
  function tree(tx, ty, s2, leafTone) {
    g.strokeStyle = PAL.wood; g.lineWidth = 7 * s2; g.lineCap = "round";
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + 3, ty - 46 * s2); g.stroke();
    G.wobblyBlobPath(g, tx + 2, ty - 66 * s2, 30 * s2, 26 * s2, "tr" + tx, 8);
    g.fillStyle = leafTone; g.fill(); inkStroke(g, 1.5);
  }
  if (z === 0) { /* meadow bushes + flowers */
    for (var i = 0; i < 16; i++) {
      var bx = i * 120 + rnd() * 60, by = 470 + rnd() * 26;
      G.wobblyBlobPath(g, bx, by, 22 + rnd() * 14, 14 + rnd() * 8, "bu" + i, 7);
      g.fillStyle = rnd() < 0.5 ? C.leaf : PAL.hillNear0; g.fill(); inkStroke(g, 1.5);
    }
    for (var f = 0; f < 22; f++) {
      var fx = rnd() * STRIP_W, fy = 480 + rnd() * 40;
      g.strokeStyle = PAL.grassDeep; g.lineWidth = 2;
      g.beginPath(); g.moveTo(fx, fy + 12); g.lineTo(fx, fy); g.stroke();
      g.fillStyle = f % 3 === 0 ? C.sun : f % 3 === 1 ? C.berry : C.violet;
      g.beginPath(); g.arc(fx, fy - 2, 4, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.2);
    }
    tree(500, 470, 1.3, C.leaf); tree(1300, 476, 1.05, PAL.hillNear0);
  } else if (z === 1) { /* treehouse village */
    for (var h2 = 0; h2 < 4; h2++) {
      var hx = 220 + h2 * 470 + rnd() * 60, hy = 500;
      /* stilts */
      g.strokeStyle = PAL.wood; g.lineWidth = 6; g.lineCap = "round";
      g.beginPath(); g.moveTo(hx - 34, hy); g.lineTo(hx - 30, 340); g.stroke();
      g.beginPath(); g.moveTo(hx + 34, hy); g.lineTo(hx + 30, 340); g.stroke();
      /* platform */
      g.fillStyle = PAL.wood;
      g.fillRect(hx - 52, 332, 104, 10); inkStroke(g, 1.5);
      /* house */
      G.wobblyRectPath(g, hx - 40, 262, 80, 72, "th" + h2, 8);
      g.fillStyle = [C.paper2, "#F3D9E4", "#DCE8F5", C.paper2][h2]; g.fill(); inkStroke(g, 2);
      /* roof */
      g.beginPath();
      g.moveTo(hx - 52, 266); g.lineTo(hx, 226 + rnd() * 6); g.lineTo(hx + 52, 266);
      g.closePath();
      g.fillStyle = h2 % 2 === 0 ? C.berry : C.violet; g.fill(); inkStroke(g, 2);
      /* glowing window + door */
      g.fillStyle = C.sun;
      g.beginPath(); g.arc(hx, 292, 12, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.8);
      g.strokeStyle = C.ink; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(hx - 12, 292); g.lineTo(hx + 12, 292);
      g.moveTo(hx, 280); g.lineTo(hx, 304); g.stroke();
      /* ladder */
      g.strokeStyle = PAL.wood; g.lineWidth = 3;
      g.beginPath(); g.moveTo(hx + 40, 342); g.lineTo(hx + 46, hy); g.stroke();
      for (var ru = 0; ru < 5; ru++) {
        var ry = 358 + ru * 30;
        g.beginPath(); g.moveTo(hx + 38 + ru, ry); g.lineTo(hx + 52 + ru, ry); g.stroke();
      }
    }
    /* lantern strings between houses */
    g.strokeStyle = C.inkSoft; g.lineWidth = 1.5;
    for (var s3 = 0; s3 < 3; s3++) {
      var lx = 420 + s3 * 470;
      g.beginPath(); g.moveTo(lx - 160, 250); g.quadraticCurveTo(lx, 300, lx + 160, 250); g.stroke();
      for (var la = 0; la < 5; la++) {
        var t = 0.15 + la * 0.175, lxx = lx - 160 + 320 * t, lyy = 250 + 200 * t * (1 - t);
        g.fillStyle = la % 2 === 0 ? C.sun : C.berry;
        g.beginPath(); g.arc(lxx, lyy + 8, 5, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.2);
      }
    }
  } else { /* starlit pines + hill lanterns */
    for (var p = 0; p < 18; p++) {
      var px = p * 110 + rnd() * 50, py = 480 + rnd() * 30, ps = 0.7 + rnd() * 0.7;
      g.fillStyle = PAL.leafDark;
      for (var tier = 0; tier < 3; tier++) {
        var tw = (34 - tier * 8) * ps, ty = py - tier * 26 * ps;
        g.beginPath();
        g.moveTo(px - tw, ty); g.lineTo(px + rnd() * 2 - 1, ty - 34 * ps); g.lineTo(px + tw, ty);
        g.closePath(); g.fill(); inkStroke(g, 1.3);
      }
    }
    for (var la2 = 0; la2 < 12; la2++) {
      g.fillStyle = C.sun; g.globalAlpha = 0.85;
      g.beginPath(); g.arc(rnd() * STRIP_W, 430 + rnd() * 60, 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  return c;
}

function bakeL4(z) { /* foreground strip, drawn at 1.3× scroll */
  var c = document.createElement("canvas");
  c.width = STRIP_W; c.height = 90;
  var g = c.getContext("2d");
  var rnd = G.mulberry32(707 + z * 29);
  var tones = [[C.leaf, PAL.grassDeep], [PAL.hillNear1, C.leaf], [PAL.leafDark, "#2E6B3C"]][z];
  for (var i = 0; i < 90; i++) {
    var gx = rnd() * STRIP_W, gw = 8 + rnd() * 16, gh = 22 + rnd() * 46;
    g.fillStyle = rnd() < 0.5 ? tones[0] : tones[1];
    g.beginPath();
    g.moveTo(gx, 90);
    g.quadraticCurveTo(gx + gw * 0.2, 90 - gh, gx + gw * 0.5 + rnd() * 4 - 2, 90 - gh - 8);
    g.quadraticCurveTo(gx + gw * 0.8, 90 - gh, gx + gw, 90);
    g.closePath(); g.fill();
  }
  if (z !== 2) {
    for (var f = 0; f < 16; f++) {
      var fx = rnd() * STRIP_W;
      g.fillStyle = f % 2 === 0 ? C.sun : C.berry;
      g.beginPath(); g.arc(fx, 60 + rnd() * 20, 5, 0, Math.PI * 2); g.fill(); inkStroke(g, 1.4);
    }
  }
  return c;
}

function bakeGrassEdge(z) { /* 256×28 tileable grass lip for platform tops */
  var c = document.createElement("canvas");
  c.width = 256; c.height = 28;
  var g = c.getContext("2d");
  var rnd = G.mulberry32(500 + z * 7);
  var top = [C.leaf, C.leaf, PAL.leafDark][z];
  g.fillStyle = top;
  g.beginPath(); g.moveTo(0, 28); g.lineTo(0, 10);
  for (var x = 0; x <= 256; x += 16) {
    g.quadraticCurveTo(x + 8, 4 + rnd() * 8, x + 16, 9 + rnd() * 5);
  }
  g.lineTo(256, 28); g.closePath(); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 10);
  var rnd2 = G.mulberry32(500 + z * 7);
  for (var x2 = 0; x2 <= 256; x2 += 16) {
    g.quadraticCurveTo(x2 + 8, 4 + rnd2() * 8, x2 + 16, 9 + rnd2() * 5);
  }
  g.stroke();
  /* blades */
  g.strokeStyle = [PAL.grassDeep, PAL.grassDeep, "#2E6B3C"][z]; g.lineWidth = 2; g.lineCap = "round";
  for (var b = 0; b < 10; b++) {
    var bx = 12 + rnd() * 232;
    g.beginPath(); g.moveTo(bx, 9); g.lineTo(bx + rnd() * 4 - 2, 1); g.stroke();
  }
  return c;
}

var L0 = [bakeL0(0), bakeL0(1), bakeL0(2)];
var L1 = [bakeL1(0), bakeL1(1), bakeL1(2)];
var L2 = [bakeL2(0), bakeL2(1), bakeL2(2)];
var L4 = [bakeL4(0), bakeL4(1), bakeL4(2)];
var GRASS_EDGE = [bakeGrassEdge(0), bakeGrassEdge(1), bakeGrassEdge(2)];
var grainPat = G.pattern(ctx, "grain", null, 77);

/* ========================================================================
 * 4. Level — hand-tuned gentle run: meadow → treehouse village → starlit
 * ====================================================================== */
var plats, items, puffs, pads, signs, cps, movers;
var STARS_TOTAL = 0, STICKERS_TOTAL = 0, FLIES_TOTAL = 0;

function buildLevel() {
  plats = []; items = []; puffs = []; pads = []; signs = []; cps = []; movers = [];
  var lr = G.mulberry32(2026);
  function gnd(x0, x1, y) { plats.push({ x0: x0, x1: x1, y: y, cy: y, mover: false }); }
  function floatP(x0, x1, y) { plats.push({ x0: x0, x1: x1, y: y, cy: y, mover: false, floating: true }); }
  function mover(cx, w, baseY, amp, spd, ph) {
    var p = { x0: cx - w / 2, x1: cx + w / 2, y: baseY, cy: baseY, mover: true,
              amp: amp, spd: spd, ph: ph };
    plats.push(p); movers.push(p);
  }
  function star(x, y) { items.push({ kind: "star", x: x, y: y, taken: false, ph: lr() * 6.28 }); STARS_TOTAL++; }
  function fly(x, y) { items.push({ kind: "fly", x: x, y: y, taken: false, ph: lr() * 6.28 }); FLIES_TOTAL++; }
  function sticker(x, y, k) { items.push({ kind: "sticker", x: x, y: y, taken: false, ph: lr() * 6.28, sk: k }); STICKERS_TOTAL++; }
  function sign(x, text, icon) { signs.push({ x: x, text: text, icon: icon }); }
  function cp(x) { cps.push({ x: x, y: 0, lit: false, flashT: 0 }); }

  /* ---- Zone 1 — Paper Meadows (0 .. 5200) ---- */
  gnd(0, 900, 430);
  sign(180, "TAP or SPACE to HOP!", "up");
  star(280, 386); star(320, 378); star(360, 386);
  star(560, 386); star(600, 378);
  gnd(900, 1500, 410);
  sign(950, "HOP ON or OVER!", "up");
  puffs.push({ x: 1160, gy: 410, squish: 0 });
  star(1160, 330);
  star(1350, 366);
  /* gap 90 */
  gnd(1590, 2300, 420);
  star(1545, 350);
  sign(1650, "LEAF PAD = ZOOM!", "zoom");
  pads.push({ x: 2180, gy: 420, t: 0 });
  star(2330, 320); star(2400, 310);
  gnd(2470, 3200, 420);
  sticker(2700, 372, "ladybug");
  star(2900, 356); star(3080, 356);
  /* leaf-lift over 320 gap */
  mover(3320, 130, 400, 26, 1.1, 0.6);
  star(3320, 330);
  gnd(3520, 4300, 430);
  cp(3700);
  sign(3760, "CHECKPOINT — hearts refill!", "flag");
  puffs.push({ x: 3960, gy: 430, squish: 0 });
  puffs.push({ x: 4070, gy: 430, squish: 0 });
  star(3960, 350); star(4070, 350);
  floatP(4450, 4610, 330);
  gnd(4300, 5200, 410);
  star(4490, 288); star(4530, 282); star(4570, 288);
  star(4800, 366); star(4880, 366);

  /* ---- Zone 2 — Treehouse Village (5200 .. 10000) ---- */
  gnd(5200, 5900, 420);
  sticker(5500, 392, "snail");
  star(5700, 376);
  gnd(6000, 6600, 420);
  star(6050, 330);
  cp(6150);
  star(6350, 346); star(6480, 346);
  mover(6720, 130, 400, 26, 1.3, 2.1);
  star(6720, 310);
  gnd(6920, 7800, 410);
  puffs.push({ x: 7150, gy: 410, squish: 0 });
  star(7150, 330);
  pads.push({ x: 7750, gy: 410, t: 0 });
  star(7900, 300); star(7980, 296);
  gnd(7975, 8800, 410);
  cp(8200);
  sticker(8430, 362, "frog");   /* the rare Frogmaster Flex sticker! */
  star(8620, 346);
  fly(8720, 310);
  floatP(9050, 9210, 340);
  gnd(8800, 9400, 420);
  star(9090, 298); star(9130, 292); star(9170, 298);
  star(9300, 376);
  gnd(9500, 10000, 420);
  sign(9560, "STARLIGHT HILLS AHEAD!", "star");
  fly(9800, 320);

  /* ---- Zone 3 — Starlit Hills (10000 .. 14200) ---- */
  gnd(10000, 10700, 420);
  cp(10150);
  fly(10260, 320); fly(10480, 300);
  star(10600, 376);
  gnd(10700, 11300, 390);
  star(10850, 346); star(11100, 346);
  gnd(11390, 12000, 430);
  sticker(11600, 402, "beetle");
  star(11800, 386);
  mover(12120, 130, 410, 34, 1.2, 4.2);
  star(12120, 336);
  gnd(12320, 13200, 410);
  cp(12550);
  puffs.push({ x: 12700, gy: 410, squish: 0 });
  star(12700, 330);
  fly(12850, 310);
  sticker(13020, 382, "butterfly");
  pads.push({ x: 13160, gy: 410, t: 0 });
  star(13300, 300); star(13380, 296);
  gnd(13350, 14200, 420);
  star(13600, 376); star(13700, 376); star(13800, 376);
  fly(13750, 300);

  for (var i = 0; i < cps.length; i++) cps[i].y = groundYAt(cps[i].x);
}

function groundYAt(x) {
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    if (!p.floating && x >= p.x0 && x <= p.x1) return p.y;
  }
  return 430;
}
function platAt(x) {
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    if (!p.floating && x >= p.x0 - 2 && x <= p.x1 + 2) return p;
  }
  return null;
}
function zoneOf(x) { return x < 5200 ? 0 : x < 10000 ? 1 : 2; }
function zoneMix(x) {
  var B = [5200, 10000];
  if (x < B[0] - 300) return [0, 0, 0];
  if (x < B[0] + 300) return [0, 1, (x - (B[0] - 300)) / 600];
  if (x < B[1] - 300) return [1, 1, 0];
  if (x < B[1] + 300) return [1, 2, (x - (B[1] - 300)) / 600];
  return [2, 2, 0];
}


/* ========================================================================
 * 5. Game state
 * ====================================================================== */
var state = "title", paused = false;
var P = null;
var camX = 0, tGlobal = 0, hurried = false, muted = false;
var collectScore = 0, maxDist = 0, distShown = 0;
var starsGot = 0, stickersGot = 0, fliesGot = 0;
var hearts = 3, bounceStep = 0, dizzyT = 0, finishT = 0;
var popups = [], fliers = [], cel = null, resultShown = false;
var scoreCounter = new G.ScoreCounter();
var coy = input.coyote();
var testJumpT = 0;
var demoT = 0, demoCycle = 0, fadeT = 0, fadeSwitched = false;
var countTimer = 0;
var DEMO_STARTS = [80, 3740, 6190, 8240, 10190, 12600];

function scoreVal() { return collectScore + Math.floor(maxDist / 32); }
function lastLitCp() {
  for (var i = cps.length - 1; i >= 0; i--) if (cps[i].lit) return cps[i];
  return null;
}

function resetGame(startX) {
  buildLevel();
  startX = startX || 80;
  P = {
    x: startX, y: groundYAt(startX), vy: 0, grounded: true, plat: null,
    sp: SPEED, dashT: 0, cut: false, jumpT: 0, runT: 0,
    sq: { sx: 1, sy: 1, anim: null },
    blinkNext: 2.5, blinkT: 0, fadeIn: 0
  };
  collectScore = 0; maxDist = startX; distShown = Math.floor(maxDist / 32);
  starsGot = 0; stickersGot = 0; fliesGot = 0;
  hearts = 3; bounceStep = 0; hurried = false;
  popups = []; fliers = []; cel = null; resultShown = false;
  scoreCounter = new G.ScoreCounter();
  scoreCounter.add(distShown);
  camX = clamp(startX - 260, 0, LEVEL_END + 200 - VIEW_W);
  for (var i = 0; i < cps.length; i++) if (cps[i].x < startX) cps[i].lit = true;
  demoT = 0; fadeT = 0; fadeSwitched = false;
  if (countTimer) { clearInterval(countTimer); countTimer = 0; }
}

function startRun() {
  if (state !== "title") return;
  state = "running";
  hide($("startCard"));
  if (SFX) {
    SFX.unlock();
    if (!DEMO && !muted) SFX.startMusic({ bpm: 100, seed: 24, key: "C" });
  }
}

/* squash & stretch — doctrine §3b feel table */
function setSquash(sx, sy, downMs, recMs) {
  P.sq.anim = { sx: sx, sy: sy, down: downMs / 1000, rec: recMs / 1000, t: 0 };
}
function updateSquash(dt) {
  var a = P.sq.anim;
  if (!a) return;
  a.t += dt;
  if (a.t < a.down) {
    var k = D.easing.easeOut(Math.min(1, a.t / a.down));
    P.sq.sx = lerp(1, a.sx, k); P.sq.sy = lerp(1, a.sy, k);
  } else if (a.t < a.down + a.rec) {
    var k2 = D.easing.pop(Math.min(1, (a.t - a.down) / a.rec));
    P.sq.sx = lerp(a.sx, 1, k2); P.sq.sy = lerp(a.sy, 1, k2);
  } else { P.sq.anim = null; P.sq.sx = 1; P.sq.sy = 1; }
}

function popup(x, y, txt, color) {
  if (popups.length > 10) popups.shift();
  popups.push({ x: x, y: y, txt: txt, t: 0, color: color || C.ink });
}
function updatePopups(dt) {
  for (var i = popups.length - 1; i >= 0; i--) {
    popups[i].t += dt;
    if (popups[i].t > 0.7) popups.splice(i, 1);
  }
}
function updateFliers(dt) {
  for (var i = fliers.length - 1; i >= 0; i--) {
    var f = fliers[i];
    f.t += dt / f.ms;
    if (f.t >= 1) fliers.splice(i, 1);
  }
}

/* ========================================================================
 * 6. Player actions
 * ====================================================================== */
function doJump(noCut) {
  if (!P.grounded) return;
  P.grounded = false;
  P.vy = JUMP_V;
  P.cut = !!noCut;
  P.jumpT = 0;
  setSquash(0.85, 1.18, 120, 100);                     /* §3b jump launch */
  if (SFX) SFX.jump();
  particles.spawn(4, { kind: "spark", x: P.x, y: P.y, speed: 60, ttl: 0.4,
                       size: 3, gravity: 200, color: C.paper3, angle: -Math.PI / 2,
                       spread: Math.PI });
}

function land(p) {
  var fallV = P.vy;
  P.grounded = true; P.plat = p; P.y = p.cy; P.vy = 0;
  setSquash(1.25, 0.75, 80, 160);                      /* §3b landing */
  if (fallV > 420) {
    if (SFX) SFX.land();
    particles.spawn(4, { kind: "spark", x: P.x, y: P.y, speed: 70, ttl: 0.4,
                         size: 3, gravity: 150, color: C.paper3, angle: -Math.PI / 2,
                         spread: Math.PI * 1.2 });
  }
  bounceStep = 0;
  coy.land();
}

function nearestStickerAhead() {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.kind === "sticker" && !it.taken && it.x > P.x && it.x - P.x < 240) return it;
  }
  return null;
}

function fail() {
  if (state !== "running") return;
  state = "dizzy"; dizzyT = 1.05;
  hearts--;
  if (SFX) SFX.gentleFail();                            /* a sigh, never a buzz */
  particles.spawn(8, { kind: "spark", x: P.x, y: P.y - 24, speed: 70, ttl: 0.7,
                       size: 5, gravity: -60, color: C.paper3 });
  /* doctrine §3f-2: NEVER shake, NEVER red flash on failure */
}

function respawn() {
  var cp = lastLitCp();
  P.x = cp ? cp.x + 30 : 80;
  P.y = groundYAt(P.x);
  P.vy = 0; P.grounded = true; P.dashT = 0; P.cut = false;
  P.fadeIn = 0.3;
  state = "running";
  if (SFX) SFX.confirm();
}

function finish() {
  state = "finished"; finishT = 0;
  setSquash(0.85, 1.18, 120, 140);
  cel = G.celebrate({ loop: loop, particles: particles, flash: flash }, {
    cx: clamp(P.x - camX, 140, 820), cy: P.y - 70,
    note: function (i) { if (SFX) SFX.fanfare(i); },
    card: function () { showResult(true); },
    finish: function () { showResult(true); },           /* skip = still rewarded */
    countUp: function () { /* DOM count-up handled in showResult */ }
  });
}

/* ========================================================================
 * 7. Interactions
 * ====================================================================== */
function checkItems() {
  var px = P.x, py = P.y - 26;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.taken) continue;
    var dx = it.x - px, dy = it.y - py, r2;
    if (it.kind === "star") {
      if (dx * dx + dy * dy > 900) continue;
      it.taken = true; starsGot++; collectScore += 10;
      scoreCounter.add(10);
      popup(it.x, it.y - 16, "+10");
      particles.burst("spark", it.x, it.y);
      if (SFX) SFX.coin();
    } else if (it.kind === "fly") {
      if (dx * dx + dy * dy > 1150) continue;
      it.taken = true; fliesGot++; collectScore += 15;
      scoreCounter.add(15);
      popup(it.x, it.y - 16, "+15");
      particles.burst("spark", it.x, it.y);
      if (SFX) SFX.confirm();
    } else { /* sticker — peel it into the book (§4.6) */
      if (dx * dx + dy * dy > 1300) continue;
      it.taken = true; stickersGot++; collectScore += 50;
      scoreCounter.add(50);
      popup(it.x, it.y - 24, "STICKER! +50", C.violet);
      particles.spawn(8, { kind: "confetti", x: it.x, y: it.y, speed: 130, ttl: 0.9,
                           size: 5, gravity: 300, up: 80,
                           colors: [C.sun, C.leaf, C.violet, C.sky] });
      fliers.push({ spr: SPR.stickers[it.sk], sx: it.x - camX, sy: it.y, t: 0, ms: 0.45 });
      if (SFX) SFX.sticker();
    }
  }
}

function checkPuffs() {
  for (var i = 0; i < puffs.length; i++) {
    var b = puffs[i];
    var dx = Math.abs(P.x - b.x);
    if (P.vy > 0 && !P.grounded && dx < 22 && P.y < b.gy - 16 && P.y > b.gy - 72) {
      /* friendly boing on top — bounce pitch ladder */
      P.vy = PUFF_VY; P.cut = true; P.jumpT = 0;
      b.squish = 0.22;
      collectScore += 5; scoreCounter.add(5);
      popup(b.x, b.gy - 56, "+5 BOING!");
      setSquash(0.85, 1.18, 100, 100);
      particles.burst("spark", b.x, b.gy - 40);
      shake.trigger(2, 180);
      if (SFX) SFX.bounce(bounceStep++ % 5);
      continue;
    }
    if (dx < 20 && P.y > b.gy - 34 && P.y < b.gy + 10) { fail(); return; }
  }
}

function checkPads() {
  if (!P.grounded) return;
  for (var i = 0; i < pads.length; i++) {
    var pd = pads[i];
    if (Math.abs(P.x - pd.x) < 26 && Math.abs(P.y - pd.gy) < 12) {
      P.dashT = DASH_TIME;
      P.sp = DASH_SPEED;                                /* instant zoom, no ramp */
      P.vy = PAD_VY; P.grounded = false; P.cut = true; P.jumpT = 0;
      pd.t = 0.25;
      popup(pd.x, pd.gy - 46, "ZOOM!", PAL.grassDeep);
      setSquash(0.85, 1.18, 120, 120);
      shake.trigger(2, 180);
      if (SFX) SFX.whoosh();
    }
  }
}

function checkCheckpoints() {
  for (var i = 0; i < cps.length; i++) {
    var cp = cps[i];
    if (!cp.lit && P.x >= cp.x) {
      cp.lit = true; cp.flashT = 0.6;
      hearts = 3;
      popup(cp.x, cp.y - 92, "Hearts full!");
      particles.burst("spark", cp.x, cp.y - 70);
      if (SFX) SFX.sticker();
    }
    if (cp.flashT > 0) cp.flashT -= 1 / 60;
  }
}

/* ========================================================================
 * 8. Autopilot (demo attract mode) — plays the run beautifully
 * ====================================================================== */
function padBetween(x0, x1) {
  for (var i = 0; i < pads.length; i++) {
    if (pads[i].x > x0 && pads[i].x < x1) return true;
  }
  return false;
}
function nextPlatAfter(p) {
  var best = null;
  for (var i = 0; i < plats.length; i++) {
    var q = plats[i];
    if (q.x0 > p.x1 + 2 && !q.floating && (!best || q.x0 < best.x0)) best = q;
  }
  return best;
}
function autopilot() {
  if (state !== "running" || !P.grounded) return;
  var sp = Math.max(120, P.sp);
  var p = P.plat;
  if (p) {
    if (p.mover && P.x > p.x1 - 26) { doJump(true); return; }
    var nxt = nextPlatAfter(p);
    if (nxt && !p.mover && nxt.x0 - p.x1 > 24 && p.x1 - P.x < sp * 0.45 &&
        !padBetween(P.x, p.x1)) { doJump(true); return; }
  }
  for (var i = 0; i < puffs.length; i++) {
    var d = puffs[i].x - P.x;
    if (d > 6 && d < sp * 0.8) { doJump(true); return; }
  }
}

/* ========================================================================
 * 9. Update
 * ====================================================================== */
function updateMovers(dt) {
  for (var i = 0; i < movers.length; i++) {
    var m = movers[i];
    m.cy = m.y + Math.sin(tGlobal * m.spd + m.ph) * m.amp;
  }
  for (var j = 0; j < puffs.length; j++) {
    if (puffs[j].squish > 0) puffs[j].squish = Math.max(0, puffs[j].squish - dt * 1.4);
  }
  for (var k = 0; k < pads.length; k++) {
    if (pads[k].t > 0) pads[k].t = Math.max(0, pads[k].t - dt);
  }
}

function runUpdate(dt) {
  if (DEMO) autopilot();
  if (testJumpT && performance.now() - testJumpT < 150 && P.grounded) {
    doJump(true); testJumpT = 0;
  }
  /* speed: dash burst, or auto-slow near undiscovered stickers (§4.6) */
  var sp = SPEED;
  if (P.dashT > 0) {
    sp = DASH_SPEED; P.dashT -= dt;
    if (!G.Juice.reduced) {
      particles.spawn(2, { kind: "spark", x: P.x - 16, y: P.y - 14, speed: 30,
                           ttl: 0.35, size: 3, gravity: 0, color: C.paper3 });
    }
  } else if (nearestStickerAhead() && (!P.plat || P.plat.x1 - P.x > 300)) {
    sp *= 0.72;                                          /* never slow near a ledge */
  }
  P.sp = lerp(P.sp, sp, Math.min(1, dt * 5));
  P.x += P.sp * dt;
  if (P.x > LEVEL_END) P.x = LEVEL_END;
  if (P.x > maxDist) maxDist = P.x;
  P.runT += dt * (P.sp / SPEED);
  if (P.fadeIn > 0) P.fadeIn -= dt;

  /* distance score ticks up over the tabular counter */
  var dp = Math.floor(maxDist / 32);
  if (dp > distShown) { scoreCounter.add(dp - distShown); distShown = dp; }

  /* input: 120ms buffer + 100ms coyote (engine fairness defaults) */
  var held = input.isHeld("jump") || input.isHeld("action");
  if (P.grounded) {
    coy.land();
    if (input.consumeBuffered("jump") || input.consumeBuffered("action")) doJump(false);
  } else if ((input.consumeBuffered("jump") || input.consumeBuffered("action")) &&
             coy.canJump()) {
    doJump(false);
  }

  /* physics */
  if (P.grounded) {
    var p = platAt(P.x);
    if (!p) { P.grounded = false; P.vy = 0; }
    else { P.y = p.cy; P.plat = p; }
  }
  if (!P.grounded) {
    var prevY = P.y;
    P.jumpT += dt;
    P.vy += GRAV * dt;
    if (P.jumpT > 0.12 && !held && !P.cut && P.vy < -200) { P.vy *= 0.5; P.cut = true; }
    P.y += P.vy * dt;
    if (P.vy > 0) {
      var best = null;
      for (var i = 0; i < plats.length; i++) {
        var q = plats[i];
        if (P.x >= q.x0 - 6 && P.x <= q.x1 + 6 && prevY <= q.cy + 6 && P.y >= q.cy) {
          if (!best || q.cy < best.cy) best = q;
        }
      }
      if (best) land(best);
    }
    if (P.y > 680) { fail(); return; }
  }

  checkItems(); checkPuffs(); checkPads(); checkCheckpoints();
  if (state !== "running") return;
  if (P.x >= FINISH_X) { finish(); return; }

  updateSquash(dt);
  /* blink loop 3–5s, paired eyes offset 80ms (§3b / custom-craft) */
  if (P.blinkT > 0) P.blinkT -= dt;
  else {
    P.blinkNext -= dt;
    if (P.blinkNext <= 0) { P.blinkT = 0.22; P.blinkNext = 3 + Math.random() * 2; }
  }
  if (!hurried && P.x > 10000) {
    hurried = true;
    if (SFX && !DEMO && !muted) { try { SFX.hurry(); } catch (e) {} }
  }
  if (DEMO) {
    demoT += dt;
    if (demoT > 30) { state = "demoFade"; fadeT = 0; fadeSwitched = false; }
  }
  var target = clamp(P.x - 260, 0, LEVEL_END + 200 - VIEW_W);
  camX = G.Juice.reduced ? target : lerp(camX, target, Math.min(1, dt * 8));
}

function update(dt) {
  tGlobal += dt;
  updateMovers(dt);
  particles.update(dt);
  updatePopups(dt);
  updateFliers(dt);
  scoreCounter.update();

  if (state === "title" || state === "over") return;
  if (paused) return;
  if (state === "dizzy") {
    dizzyT -= dt;
    if (dizzyT <= 0) { if (hearts <= 0) doOver(); else respawn(); }
    return;
  }
  if (state === "finished") {
    finishT += dt;
    if (cel) cel.update(dt * 1000);
    return;
  }
  if (state === "demoFade") {
    fadeT += dt;
    if (fadeT >= 0.45 && !fadeSwitched) { fadeSwitched = true; demoCycleStart(); }
    if (fadeT >= 0.9) { state = "running"; demoT = 0; }
    return;
  }
  runUpdate(dt);
}

function doOver() {
  state = "over";
  if (SFX) SFX.failureChord();                          /* one warm I chord */
  showResult(false);
}

function demoCycleStart() {
  var sx = DEMO_STARTS[demoCycle % DEMO_STARTS.length];
  demoCycle++;
  resetGame(sx);
  state = "running";
}


/* ========================================================================
 * 10. Render
 * ====================================================================== */
function grad(top, bottom) {
  var g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}
function drawSky() {
  var zm = zoneMix(camX + 480);
  ctx.fillStyle = grad(SKY[zm[0]][0], SKY[zm[0]][1]);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (zm[2] > 0) {
    ctx.globalAlpha = zm[2];
    ctx.fillStyle = grad(SKY[zm[1]][0], SKY[zm[1]][1]);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }
  /* live twinkle dots in the dusk zone (≤0.5Hz, well under the 3Hz floor) */
  if (zm[0] === 2 || zm[1] === 2) {
    ctx.fillStyle = PAL.warmWhite;
    for (var i = 0; i < 9; i++) {
      ctx.globalAlpha = (0.3 + 0.28 * Math.sin(tGlobal * 1.4 + i * 2.1)) *
                        (zm[0] === 2 ? 1 - zm[2] * 0.4 : zm[2]);
      ctx.beginPath();
      ctx.arc(90 + i * 105, 40 + (i % 4) * 46, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
function drawStrip(img, factor, alpha, yOff) {
  if (alpha <= 0.01) return;
  var lo = G.Juice.reduced ? 0 : camX * factor;         /* reduced: parallax frozen */
  var off = -(lo % STRIP_W);
  if (off > 0) off -= STRIP_W;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, off, yOff || 0);
  ctx.drawImage(img, off + STRIP_W, yOff || 0);
  ctx.globalAlpha = 1;
}
function drawParallax() {
  var zm = zoneMix(camX + 480);
  drawStrip(L0[zm[0]], 0.1, 1 - zm[2]); if (zm[2] > 0) drawStrip(L0[zm[1]], 0.1, zm[2]);
  drawStrip(L1[zm[0]], 0.25, 1 - zm[2]); if (zm[2] > 0) drawStrip(L1[zm[1]], 0.25, zm[2]);
  drawStrip(L2[zm[0]], 0.5, 1 - zm[2]); if (zm[2] > 0) drawStrip(L2[zm[1]], 0.5, zm[2]);
}
function drawForeground() {
  var zm = zoneMix(camX + 480);
  drawStrip(L4[zm[0]], 1.3, 1 - zm[2], VIEW_H - 74);
  if (zm[2] > 0) drawStrip(L4[zm[1]], 1.3, zm[2], VIEW_H - 74);
}

function drawPlatforms() {
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    if (p.x1 < camX - 40 || p.x0 > camX + VIEW_W + 40) continue;
    var z = zoneOf((p.x0 + p.x1) / 2);
    if (p.mover || p.floating) {
      /* leaf-lift: wobbly leaf platform with hanging veins */
      var w = p.x1 - p.x0;
      G.wobblyBlobPath(ctx, p.x0 + w / 2, p.cy + 6, w / 2, 11, "lift" + i, 8);
      ctx.fillStyle = C.leaf; ctx.fill(); inkStroke(ctx, 2);
      ctx.strokeStyle = PAL.leafDark; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x0 + 10, p.cy + 6);
      ctx.quadraticCurveTo(p.x0 + w / 2, p.cy, p.x1 - 10, p.cy + 6);
      ctx.stroke();
      if (p.mover) { /* little vine ropes so kids see it moves */
        ctx.strokeStyle = PAL.grassDeep; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x0 + 14, p.cy); ctx.lineTo(p.x0 + 8, p.cy - 26); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x1 - 14, p.cy); ctx.lineTo(p.x1 - 8, p.cy - 26); ctx.stroke();
      }
      continue;
    }
    /* solid ground: dirt body + grain + grass lip */
    ctx.fillStyle = PAL.dirt;
    ctx.fillRect(p.x0, p.cy + 10, p.x1 - p.x0, VIEW_H - p.cy + 40);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = grainPat;
    ctx.fillRect(p.x0, p.cy + 10, p.x1 - p.x0, VIEW_H - p.cy + 40);
    ctx.globalAlpha = 1;
    /* grass lip, tile-aligned to the world so it never shimmers */
    ctx.save();
    ctx.beginPath(); ctx.rect(p.x0, p.cy - 16, p.x1 - p.x0, 30); ctx.clip();
    for (var tx = Math.floor(p.x0 / 256) * 256; tx < p.x1; tx += 256) {
      ctx.drawImage(GRASS_EDGE[z], tx, p.cy - 12);
    }
    ctx.restore();
    /* torn-paper side edges next to gaps */
    var leftGap = !platAt(p.x0 - 6), rightGap = !platAt(p.x1 + 6);
    ctx.fillStyle = D.inkRGBA(0.22);
    if (leftGap) ctx.fillRect(p.x0, p.cy + 10, 5, VIEW_H - p.cy);
    if (rightGap) ctx.fillRect(p.x1 - 5, p.cy + 10, 5, VIEW_H - p.cy);
  }
}

function drawSign(s) {
  var gy = groundYAt(s.x);
  ctx.strokeStyle = PAL.wood; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(s.x, gy); ctx.lineTo(s.x, gy - 64); ctx.stroke();
  ctx.font = "700 18px 'Baloo 2','Fredoka','Comic Sans MS',sans-serif";
  var tw = ctx.measureText(s.text).width;
  var pw = tw + 52, px = s.x - pw / 2, py = gy - 96;
  ctx.fillStyle = D.inkRGBA(0.9);
  ctx.fillRect(px + 3, py + 3, pw, 32);
  ctx.fillStyle = C.paper2;
  rr(ctx, px, py, pw, 32, 10); ctx.fill(); inkStroke(ctx, 2);
  /* icon + word — dual coded (§3g) */
  var ix = px + 20, iy = py + 16;
  ctx.fillStyle = C.ink; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.4; ctx.lineCap = "round";
  if (s.icon === "up") {
    ctx.beginPath(); ctx.moveTo(ix, iy + 6); ctx.lineTo(ix + 6, iy - 6); ctx.lineTo(ix + 12, iy + 6); ctx.stroke();
  } else if (s.icon === "zoom") {
    ctx.beginPath(); ctx.moveTo(ix, iy + 2); ctx.lineTo(ix + 6, iy - 4); ctx.lineTo(ix + 12, iy + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix, iy + 8); ctx.lineTo(ix + 6, iy + 2); ctx.lineTo(ix + 12, iy + 8); ctx.stroke();
  } else if (s.icon === "flag") {
    ctx.beginPath(); ctx.moveTo(ix + 2, iy + 8); ctx.lineTo(ix + 2, iy - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix + 2, iy - 8); ctx.lineTo(ix + 13, iy - 4); ctx.lineTo(ix + 2, iy); ctx.closePath();
    ctx.fillStyle = C.leaf; ctx.fill(); inkStroke(ctx, 1.4);
  } else { starPath(ctx, ix + 6, iy, 8); ctx.fillStyle = C.sun; ctx.fill(); inkStroke(ctx, 1.4); }
  ctx.fillStyle = C.ink; ctx.textBaseline = "middle";
  ctx.fillText(s.text, px + 40, py + 17);
}

function drawCheckpoint(cp) {
  var poleTop = cp.y - 78;
  ctx.strokeStyle = PAL.wood; ctx.lineWidth = 6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.lineTo(cp.x, poleTop); ctx.stroke();
  inkStrokeFlag(cp, poleTop);
  if (cp.lit) {
    var pulse = 1 + (cp.flashT > 0 ? cp.flashT * 0.9 : 0.06 * Math.sin(tGlobal * 2.4));
    starPath(ctx, cp.x, poleTop - 8, 9 * pulse);
    ctx.fillStyle = C.sun; ctx.fill(); inkStroke(ctx, 2);
  } else {
    ctx.beginPath(); ctx.arc(cp.x, poleTop - 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = C.paper3; ctx.fill(); inkStroke(ctx, 1.6);
  }
}
function inkStrokeFlag(cp, poleTop) {
  ctx.beginPath();
  ctx.moveTo(cp.x + 3, poleTop + 2);
  ctx.lineTo(cp.x + 44, poleTop + 12);
  ctx.lineTo(cp.x + 3, poleTop + 24);
  ctx.closePath();
  ctx.fillStyle = cp.lit ? C.leaf : C.paper3;
  ctx.fill(); inkStroke(ctx, 2);
}

function drawFinish() {
  var gy = groundYAt(FINISH_X);
  ctx.strokeStyle = PAL.wood; ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(FINISH_X, gy); ctx.lineTo(FINISH_X, gy - 150); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(FINISH_X + 4, gy - 148);
  ctx.lineTo(FINISH_X + 76, gy - 128);
  ctx.lineTo(FINISH_X + 4, gy - 106);
  ctx.closePath();
  ctx.fillStyle = C.sun; ctx.fill(); inkStroke(ctx, 2.5);
  starPath(ctx, FINISH_X + 26, gy - 128, 10);
  ctx.fillStyle = PAL.warmWhite; ctx.fill(); inkStroke(ctx, 1.6);
  starPath(ctx, FINISH_X, gy - 158, 11);
  ctx.fillStyle = C.sun; ctx.fill(); inkStroke(ctx, 2);
  /* Frogmaster Flex cameo cheering at the line (never "Cedric"!) */
  var fx = FINISH_X + 92, fy = gy;
  var hop = state === "finished" ? Math.abs(Math.sin(finishT * 6)) * 16 : 0;
  var br = 1 + 0.02 * Math.sin(tGlobal * 2.6);
  ctx.save();
  ctx.translate(fx, fy - hop);
  var s2 = state === "finished" ? 1 + 0.06 * Math.sin(finishT * 12) : 1;
  ctx.scale(s2, (2 - s2) * br);
  ctx.drawImage(SPR.frogBig.c, -32, -58, 64, 58);
  ctx.restore();
  if (state === "finished" && finishT > 1.2) {
    ctx.font = "700 20px 'Baloo 2','Fredoka','Comic Sans MS',sans-serif";
    var msg = "You made it!";
    var mw = ctx.measureText(msg).width + 26;
    ctx.fillStyle = PAL.warmWhite;
    rr(ctx, fx - mw / 2, fy - 118, mw, 34, 12); ctx.fill(); inkStroke(ctx, 2);
    ctx.fillStyle = C.ink; ctx.textBaseline = "middle";
    ctx.fillText(msg, fx - mw / 2 + 13, fy - 100);
  }
}

function drawItems() {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.taken || it.x < camX - 60 || it.x > camX + VIEW_W + 60) continue;
    if (it.kind === "star") {
      var by = it.y + Math.sin(tGlobal * 2 + it.ph) * 4;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.arc(it.x, by, 17, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(it.x, by);
      ctx.rotate(Math.sin(tGlobal * 1.6 + it.ph) * 0.12);
      ctx.drawImage(SPR.star.c, -14, -14, 28, 28);
      ctx.restore();
    } else if (it.kind === "fly") {
      var fy2 = it.y + Math.sin(tGlobal * 1.7 + it.ph) * 9;
      var fx2 = it.x + Math.sin(tGlobal * 1.1 + it.ph * 2) * 7;
      var halo = 11 + 2.4 * Math.sin(tGlobal * 2.6 + it.ph);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.arc(fx2, fy2, halo, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(SPR.fly.c, fx2 - 10, fy2 - 10, 20, 20);
    } else {
      ctx.save();
      ctx.translate(it.x, it.y + Math.sin(tGlobal * 1.8 + it.ph) * 3);
      ctx.rotate(Math.sin(tGlobal * 1.3 + it.ph) * 0.1);
      /* orbiting twinkle = shape beacon for colorblind players */
      var ta = tGlobal * 2.2 + it.ph;
      starPath(ctx, Math.cos(ta) * 30, Math.sin(ta) * 24 - 4, 4);
      ctx.fillStyle = C.sun; ctx.fill();
      ctx.drawImage(SPR.stickers[it.sk].c, -22, -22, 44, 44);
      ctx.restore();
    }
  }
}

function drawPlayer() {
  if (!P) return;
  /* soft contact shadow */
  var gy = P.grounded ? P.y : groundYAt(P.x);
  var hgt = gy - P.y;
  if (hgt < 260) {
    ctx.globalAlpha = 0.22 * (1 - hgt / 260);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(P.x, gy + 4, 17 * (1 - hgt / 500), 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  var img;
  if (state === "dizzy") img = SPR.violet.dizzy;
  else if (state === "finished") img = SPR.violet.happy;
  else if (!P.grounded) img = SPR.violet.jump;
  else img = Math.floor(P.runT / 0.13) % 2 === 0 ? SPR.violet.run1 : SPR.violet.run2;
  var sx = P.sq.sx, sy = P.sq.sy;
  if (!P.sq.anim) {
    if (!P.grounded && Math.abs(P.vy) < 150) { sx = 1.05; sy = 0.97; }  /* air peak hang */
    else if (state === "title") { sy = 1 + 0.02 * Math.sin(tGlobal * 2.6); } /* idle breath */
  }
  ctx.save();
  if (P.fadeIn > 0) ctx.globalAlpha = 1 - P.fadeIn / 0.3;
  ctx.translate(P.x, P.y);
  ctx.scale(sx, sy);
  ctx.drawImage(img.c, -24, -56, 48, 56);
  /* blink: eyelids, paired eyes offset 80ms (§3b) */
  if (P.blinkT > 0 && (state === "running" || state === "title")) {
    var bt = 0.22 - P.blinkT;
    var lid = function (off) {
      var tt = bt - off;
      if (tt <= 0 || tt >= 0.14) return 0;
      return Math.sin(Math.PI * tt / 0.14);
    };
    ctx.fillStyle = PAL.skin;
    var l1 = lid(0), l2 = lid(0.08);
    if (l1 > 0) ctx.fillRect(16.6, 14, 6, 6.4 * l1);
    if (l2 > 0) ctx.fillRect(25.6, 14, 6, 6.4 * l2);
  }
  ctx.restore();
  /* dizzy sparkles orbit the head while she gathers herself */
  if (state === "dizzy") {
    for (var d = 0; d < 3; d++) {
      var da = tGlobal * 5 + d * 2.09;
      starPath(ctx, P.x + Math.cos(da) * 22, P.y - 62 + Math.sin(da) * 8, 5);
      ctx.fillStyle = C.sun; ctx.fill(); inkStroke(ctx, 1.2);
    }
  }
}

function drawWorld() {
  drawPlatforms();
  for (var i = 0; i < signs.length; i++) {
    if (signs[i].x > camX - 160 && signs[i].x < camX + VIEW_W + 160) drawSign(signs[i]);
  }
  for (var c = 0; c < cps.length; c++) {
    if (cps[c].x > camX - 80 && cps[c].x < camX + VIEW_W + 80) drawCheckpoint(cps[c]);
  }
  drawFinish();
  /* pads */
  for (var pd = 0; pd < pads.length; pd++) {
    var p2 = pads[pd];
    if (p2.x < camX - 80 || p2.x > camX + VIEW_W + 80) continue;
    var squish = p2.t > 0 ? p2.t / 0.25 : 0;
    ctx.save();
    ctx.translate(p2.x, p2.gy - 4);
    ctx.scale(1 + squish * 0.25, 1 - squish * 0.4);
    ctx.drawImage(SPR.pad.c, -30, -13, 60, 26);
    ctx.restore();
  }
  /* bramble puffs */
  for (var b = 0; b < puffs.length; b++) {
    var pb = puffs[b];
    if (pb.x < camX - 60 || pb.x > camX + VIEW_W + 60) continue;
    var sq = pb.squish / 0.22;
    ctx.save();
    ctx.translate(pb.x, pb.gy - 24);
    ctx.scale(1 + sq * 0.3, 1 - sq * 0.35);
    ctx.drawImage(SPR.puff.c, -26, -26, 52, 52);
    ctx.restore();
  }
  drawItems();
  drawPlayer();
  /* score popups */
  for (var pp = 0; pp < popups.length; pp++) {
    var u = popups[pp];
    var k = D.easing.easeOut(Math.min(1, u.t / 0.7));
    ctx.globalAlpha = 1 - k;
    ctx.font = "800 20px 'Baloo 2','Fredoka','Comic Sans MS',sans-serif";
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.lineWidth = 4; ctx.strokeStyle = C.paper;
    ctx.strokeText(u.txt, u.x, u.y - k * 34);
    ctx.fillStyle = u.color;
    ctx.fillText(u.txt, u.x, u.y - k * 34);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
  particles.render(ctx);
}

/* ---- HUD --------------------------------------------------------------- */
function drawNums(str, x, y, size) {
  ctx.font = "700 " + Math.max(18, size) + "px 'Baloo 2','Fredoka','Comic Sans MS',sans-serif";
  ctx.textBaseline = "middle";
  var adv = ctx.measureText("0").width;   /* tabular layout (§3e) */
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    var wch = ch === " " ? adv * 0.4 : ch === "m" || ch === "/" ? ctx.measureText(ch).width : adv;
    ctx.lineWidth = 4; ctx.strokeStyle = C.paper;
    ctx.strokeText(ch, x, y);
    ctx.fillStyle = C.ink;
    ctx.fillText(ch, x, y);
    x += wch;
  }
}
function drawHUD() {
  /* left washi panel: score + distance + sticker book */
  G.washiPanel(ctx, 14, 12, 246, 68);
  ctx.drawImage(SPR.star.c, 26, 20, 26, 26);
  scoreCounter.render(ctx, 62, 34, 26);
  drawNums(Math.floor(maxDist / 32) + " m", 30, 62, 18);
  ctx.drawImage(SPR.stickers.ladybug.c, 118, 50, 24, 24);
  drawNums(stickersGot + "/" + STICKERS_TOTAL, 148, 62, 18);
  /* right washi panel: sticker hearts */
  G.washiPanel(ctx, VIEW_W - 158, 12, 144, 52);
  for (var h = 0; h < 3; h++) {
    ctx.globalAlpha = h < hearts ? 1 : 0.22;
    ctx.drawImage(SPR.heart.c, VIEW_W - 146 + h * 44, 22, 34, 32);
    ctx.globalAlpha = 1;
  }
  if (DEMO) {
    G.washiPanel(ctx, 14, VIEW_H - 48, 214, 36);
    ctx.font = "700 18px 'Baloo 2','Fredoka','Comic Sans MS',sans-serif";
    ctx.fillStyle = C.ink; ctx.textBaseline = "middle";
    ctx.fillText("DEMO · Sticker Safari", 32, VIEW_H - 29);
  }
  /* sticker fliers fly into the book (screen space) */
  for (var f = 0; f < fliers.length; f++) {
    var fl = fliers[f];
    var k = D.easing.easeIn(Math.min(1, fl.t));
    var x = lerp(fl.sx, 130, k), y = lerp(fl.sy, 62, k), s = lerp(44, 18, k);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(k * 2.4);
    ctx.drawImage(fl.spr.c, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

function render() {
  var k = Math.min(view.w / VIEW_W, view.h / VIEW_H);
  var ox = (view.w - VIEW_W * k) / 2, oy = (view.h - VIEW_H * k) / 2;
  ctx.fillStyle = C.paper3;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H); ctx.clip();

  drawSky();
  drawParallax();
  var shk = shake.offset();
  ctx.save();
  ctx.translate(-camX + shk[0], shk[1]);
  drawWorld();
  ctx.restore();
  drawForeground();
  flash.render(ctx, VIEW_W, VIEW_H);
  drawHUD();

  if (state === "demoFade") {
    ctx.globalAlpha = fadeT < 0.45 ? fadeT / 0.45 : 1 - (fadeT - 0.45) / 0.45;
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ========================================================================
 * 11. DOM UI, harness events, loop
 * ====================================================================== */
function show(el) { if (el && el.classList) el.classList.remove("vee-hidden"); }
function hide(el) { if (el && el.classList) el.classList.add("vee-hidden"); }

function showResult(win) {
  if (resultShown) return;
  if (DEMO) {                                            /* demo: soft reset, no card */
    state = "demoFade"; fadeT = 0; fadeSwitched = false;
    return;
  }
  resultShown = true;
  var score = scoreVal();
  var best = 0, newRec = false;
  if (harness) {
    var r = harness.submitScore(score);
    best = r.best; newRec = r.newRecord;
    harness.gameEnded(score);
  }
  if (SFX) SFX.stopMusic();
  $("resTitle").textContent = win ? "What a run!" : "Great try!";
  $("resLines").textContent =
    "⭐ " + starsGot + "/" + STARS_TOTAL + " stars · " +
    "🏷 " + stickersGot + "/" + STICKERS_TOTAL + " stickers · " +
    Math.floor(maxDist / 32) + " m · best " + best;
  if (newRec) show($("resNew")); else hide($("resNew"));
  show($("resultCard"));
  /* count-up over 1.2s easeOut (§3c beat 3) */
  var el = $("resScore"), from = 0, t0 = performance.now();
  if (countTimer) clearInterval(countTimer);
  countTimer = setInterval(function () {
    var t = Math.min(1, (performance.now() - t0) / 1200);
    el.textContent = Math.round(from + (score - from) * D.easing.easeOut(t));
    if (t >= 1) clearInterval(countTimer);
  }, 30);
}

function togglePause() {
  if (state !== "running") return;
  paused = !paused;
  if (paused) {
    show($("pauseCard"));
    if (SFX) SFX.stopMusic();
  } else {
    hide($("pauseCard"));
    if (SFX && !muted && !DEMO) SFX.startMusic({ bpm: hurried ? 112 : 100, seed: 24, key: "C", tier: hurried ? 1 : 0 });
  }
}

function quit() {
  if (harness) harness.gameQuit(scoreVal());
}

function restartRun() {
  hide($("resultCard"));
  resetGame(80);
  state = "running";
  if (SFX && !muted && !DEMO) SFX.startMusic({ bpm: 100, seed: 24, key: "C" });
}

function bindUI() {
  if (DEMO) {
    hide($("startCard")); hide($("btnRow"));
    return;
  }
  $("btnStart").addEventListener("click", function () { if (SFX) SFX.unlock(); startRun(); });
  $("btnPause").addEventListener("click", function () { if (SFX) SFX.tick(); togglePause(); });
  $("btnResume").addEventListener("click", function () { if (SFX) SFX.tick(); togglePause(); });
  $("btnAgain").addEventListener("click", function () { if (SFX) SFX.confirm(); restartRun(); });
  $("btnQuit").addEventListener("click", quit);
  $("btnPauseQuit").addEventListener("click", quit);
  $("btnResultQuit").addEventListener("click", quit);
  $("btnSound").addEventListener("click", function () {
    muted = !muted;
    if (SFX) {
      SFX.setMuted(muted);
      if (!muted && state === "running" && !paused && !DEMO) {
        SFX.unlock();
        SFX.startMusic({ bpm: hurried ? 112 : 100, seed: 24, key: "C", tier: hurried ? 1 : 0 });
      }
    }
    $("btnSound").textContent = muted ? "♪ Sound: Off" : "♪ Sound: On";
  });
  $("btnJuice").addEventListener("click", function () {
    var r = G.Juice.toggle();
    $("btnJuice").textContent = r ? "✦ Juice: Calm" : "✦ Juice: Full";
    if (SFX) SFX.tick();
  });
  input.onAny(function (a) {
    if (SFX) SFX.unlock();
    if (a === "pause") { togglePause(); return; }
    if (state === "title") { startRun(); return; }
    if (cel && !cel.finished && state === "finished") { cel.skip(); return; }
    if (resultShown && a === "jump") restartRun();
  });
}

/* ---- boot -------------------------------------------------------------- */
buildLevel();
resetGame(80);
var loop = G.createLoop({
  update: update,
  render: function () { render(); }
});
bindUI();
if (DEMO) demoCycleStart();
loop.start();

/* small test/demo hook (harmless in production) */
window.__VSS = {
  get state() { return state; },
  get paused() { return paused; },
  get player() { return { x: P.x, y: P.y, vy: P.vy, grounded: P.grounded }; },
  score: scoreVal,
  demo: DEMO,
  start: function () { if (state === "title") startRun(); },
  jump: function () {
    if (state !== "running" || paused) return;
    if (P.grounded) doJump(true); else testJumpT = performance.now();
  },
  pause: togglePause
};
})(window);
