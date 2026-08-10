/* ============================================================================
 * Paper Stack — Vee Arcade Tetris (DESIGN-BIBLE §4 brief 2)
 *
 * Tetrominoes are gift-wrapped boxes / folded origami: flat fills, ONE lighter
 * diagonal fold-crease per cell, 2px plum-ink outlines, hard-offset shadows.
 * Line-clears fold the row into a paper airplane that flies off-screen right.
 * Cozy shelf background with parallax knick-knacks; mint-paper palette.
 *
 * Built ON the engine (../engine/vee-game.js, vee-sfx.js) — never reimplements it.
 * ========================================================================== */
(function () {
"use strict";

var VG = window.VeeGame, D = VG.DESIGN, C = D.colors, S = window.VeeSFX;
var DEMO = !!window.PAPERSTACK_DEMO;
var E = D.easing;

/* --------------------------------------------------------------------------
 * 0. Game-local token block (brief: mint-paper #EFF7EC + sky/violet accents).
 *    Every hex lives HERE — nothing is improvised mid-render (doctrine §1).
 * ------------------------------------------------------------------------ */
var T = {
  mint:  "#EFF7EC",   /* playfield paper (brief)            */
  mint2: "#E4F0E1",   /* recessed playfield inset           */
  mint3: "#D6E8D3",   /* rug / near-foreground strip        */
  wall:  "#E9F4E6",   /* L0 wall top of the two-stop wash   */
  cream: "#FFFDF2",   /* airplane paper, highlights         */
  gold:  "#FFD97A",   /* TETRIS gold-confetti variant       */
  plumJ: "#5C4A6E",   /* J piece — ink-soft plum (neutral)  */
  creamL:"#EDDAB6"    /* L piece — paper-3 cream (neutral)  */
};
var FDISP = "'Baloo 2','Fredoka','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";
var FBODY = "'Fredoka','Baloo 2','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";

/* --------------------------------------------------------------------------
 * 1. Geometry — 960x560 design space, letterboxed to the iframe
 * ------------------------------------------------------------------------ */
var CW = 960, CH = 560;
var COLS = 10, ROWS = 22, HIDDEN = 2, VIS = 20;
var TOUCH = ("ontouchstart" in window) || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
var CELL = 23;
var FW = COLS * CELL, FH = VIS * CELL;
var FX = (CW - FW) / 2, FY = 22;            /* field top; rows 0..1 are hidden */

function cellX(gx) { return FX + gx * CELL; }
function cellY(gy) { return FY + (gy - HIDDEN) * CELL; }

/* --------------------------------------------------------------------------
 * 2. Pieces — shapes, SRS rotations, wall-kick tables (y flipped: down = +)
 * ------------------------------------------------------------------------ */
var TYPES = ["I", "O", "T", "S", "Z", "J", "L"];
var SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};
var BOX = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 };
var SPAWN_X = { I: 3, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
/* color + pattern twin for every hue — color is never the only signal (§3g) */
var SKINS = {
  I: { fill: C.sky,   pattern: "stripes" },
  O: { fill: C.sun,   pattern: "dots"    },
  T: { fill: C.violet,pattern: "star"    },
  S: { fill: C.leaf,  pattern: "cross"   },
  Z: { fill: C.berry, pattern: "zig"     },
  J: { fill: T.plumJ, pattern: "tri"     },
  L: { fill: T.creamL,pattern: "diamond" }
};

function rotateCW(cells, n) {
  var out = [];
  for (var i = 0; i < cells.length; i++) out.push([n - 1 - cells[i][1], cells[i][0]]);
  return out;
}
var ROTS = {};
(function () {
  for (var t in SHAPES) {
    var states = [SHAPES[t]], n = BOX[t];
    for (var r = 1; r < 4; r++) states.push(rotateCW(states[r - 1], n));
    ROTS[t] = states;
  }
})();

/* SRS kick tables, screen coords (y-down) */
var KICKS_JLSTZ = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
};
var KICKS_I = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
};
function kicksFor(type, from, to) {
  if (type === "O") return [[0, 0]];
  var table = (type === "I") ? KICKS_I : KICKS_JLSTZ;
  return table[from + ">" + to];
}

/* --------------------------------------------------------------------------
 * 3. Sprite cache — every cell sprite baked ONCE to offscreen canvases
 *    (risk table: no per-frame procedural drawing, no shadowBlur).
 *    Sprite cell = 72px (3x of 24-design-cell, crisp at any DPR).
 *    Cut-paper recipe (§5): flat fill → grain → diagonal fold-crease
 *    (light highlight + soft fold shadow) → cream paper stamp carrying the
 *    per-type symbol (colorblind twin, §3g) → 2px plum outline #3A2B46 →
 *    one warm-white highlight stroke. Hard-offset shadow is a separate
 *    silhouette pass so neighbouring cells cover the seams.
 * ------------------------------------------------------------------------ */
var SPR = 72, K = SPR / 24;
/* paper nearly fills the cell with SQUARE-ish corners — beads are banned */
var BOX_X = 2 * K, BOX_W = 20 * K, BOX_R = 3.5 * K;
var spriteBodies = {}, spriteShadows = {};
var airplaneSpr = null, AIR_W = 104, AIR_H = 68;

function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/* the origami fold: a soft fold shadow under a bright diagonal crease */
function drawCrease(g, flip) {
  g.save();
  g.lineCap = "round";
  var x1 = flip ? 4 * K : 20 * K, y1 = 4 * K;
  var x2 = flip ? 20 * K : 4 * K, y2 = 20 * K;
  g.strokeStyle = "rgba(58,43,70,0.22)";                  /* fold shadow */
  g.lineWidth = 2.6 * K;
  g.beginPath();
  g.moveTo(x1 + 1.4 * K, y1 + 1.4 * K);
  g.lineTo(x2 + 1.4 * K, y2 + 1.4 * K);
  g.stroke();
  g.strokeStyle = "rgba(255,252,245,0.8)";                /* crease highlight */
  g.lineWidth = 1.8 * K;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
  g.restore();
}

/* paper stamp: a small cream sticker holding the per-type symbol, so shape
 * is never lost on colorblind readers. Baked at sprite time, ±tilted. */
function drawStamp(g, kind, type) {
  var cx = SPR / 2, cy = SPR / 2, i, r, a;
  g.save();
  g.translate(cx, cy);
  g.rotate((VG.mulberry32(VG.hashSeed("tilt" + type))() - 0.5) * 8 * Math.PI / 180);
  VG.wobblyRectPath(g, -5.5 * K, -5.5 * K, 11 * K, 11 * K, "stamp" + kind, 3 * K);
  g.fillStyle = T.cream;
  g.fill();
  g.lineWidth = 1.1 * K;
  g.strokeStyle = "rgba(58,43,70,0.4)";
  g.stroke();
  g.strokeStyle = g.fillStyle = "rgba(58,43,70,0.62)";
  g.lineWidth = 1.5 * K;
  g.lineCap = "round";
  switch (kind) {
    case "stripes":                              /* I — three diagonals */
      for (i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo((i * 3.2 - 1.6) * K, 3.8 * K);
        g.lineTo((i * 3.2 + 1.6) * K, -3.8 * K);
        g.stroke();
      }
      break;
    case "dots":                                 /* O — 2x2 polka dots */
      for (i = 0; i < 4; i++) {
        g.beginPath();
        g.arc((i % 2 ? 2.2 : -2.2) * K, (i < 2 ? -2.2 : 2.2) * K, 1.3 * K, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case "star":                                 /* T — one bold 5-point star */
      g.beginPath();
      for (i = 0; i < 10; i++) {
        r = (i % 2 ? 1.7 : 4.1) * K;
        a = -Math.PI / 2 + i * Math.PI / 5;
        var px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.fill();
      break;
    case "cross":                                /* S — cross-hatch */
      g.beginPath(); g.moveTo(-3.6 * K, 0); g.lineTo(3.6 * K, 0); g.stroke();
      g.beginPath(); g.moveTo(0, -3.6 * K); g.lineTo(0, 3.6 * K); g.stroke();
      break;
    case "zig":                                  /* Z — chevron */
      g.beginPath();
      g.moveTo(-3.8 * K, 1.8 * K); g.lineTo(0, -1.8 * K); g.lineTo(3.8 * K, 1.8 * K);
      g.stroke();
      break;
    case "tri":                                  /* J — triangle */
      g.beginPath();
      g.moveTo(-3.4 * K, 2.6 * K); g.lineTo(0, -3 * K); g.lineTo(3.4 * K, 2.6 * K);
      g.closePath(); g.stroke();
      break;
    case "diamond":                              /* L — diamond + dot */
      g.beginPath();
      g.moveTo(0, -3.8 * K); g.lineTo(3.8 * K, 0);
      g.lineTo(0, 3.8 * K); g.lineTo(-3.8 * K, 0);
      g.closePath(); g.stroke();
      g.beginPath(); g.arc(0, 0, 1.1 * K, 0, Math.PI * 2); g.fill();
      break;
  }
  g.restore();
}

function buildSprites() {
  for (var ti = 0; ti < TYPES.length; ti++) {
    var type = TYPES[ti], skin = SKINS[type];
    var bodies = [], shadows = [];
    for (var v = 0; v < 4; v++) {
      var seed = "cell" + type + v;
      var b = makeCanvas(SPR, SPR), g = b.getContext("2d");
      /* 1 — flat paper fill */
      VG.wobblyRectPath(g, BOX_X, BOX_X, BOX_W, BOX_W, seed, BOX_R);
      g.fillStyle = skin.fill;
      g.fill();
      g.save();
      VG.wobblyRectPath(g, BOX_X, BOX_X, BOX_W, BOX_W, seed, BOX_R);
      g.clip();
      /* 2 — grain at doctrine cap 0.15 */
      g.globalAlpha = 0.15;
      g.fillStyle = g.createPattern(VG.paperGrainCanvas(VG.hashSeed(seed)), "repeat");
      g.fillRect(0, 0, SPR, SPR);
      g.globalAlpha = 1;
      /* 3 — diagonal fold-crease (the brief's signature) */
      drawCrease(g, (v + ti) % 2 === 0);
      /* 4 — paper stamp with the per-type symbol */
      drawStamp(g, skin.pattern, type);
      g.restore();
      /* 5 — 2px plum outline (#3A2B46 through C.ink) */
      VG.wobblyRectPath(g, BOX_X, BOX_X, BOX_W, BOX_W, seed, BOX_R);
      g.lineWidth = 2 * K;
      g.strokeStyle = C.ink;
      g.stroke();
      /* 6 — one highlight stroke at 30% warm-white (§5 sprite recipe) */
      g.save();
      VG.wobblyRectPath(g, BOX_X, BOX_X, BOX_W, BOX_W, seed, BOX_R);
      g.clip();
      g.strokeStyle = "rgba(255,252,245,0.3)";
      g.lineWidth = 2 * K;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(5 * K, 9 * K);
      g.lineTo(5 * K, 6 * K);
      g.quadraticCurveTo(5 * K, 5 * K, 6 * K, 5 * K);
      g.lineTo(9 * K, 5 * K);
      g.stroke();
      g.restore();
      bodies.push(b);

      /* hard-offset shadow silhouette (drawn first so neighbours cover seams) */
      var sh = makeCanvas(SPR, SPR), gs = sh.getContext("2d");
      VG.wobblyRectPath(gs, BOX_X, BOX_X, BOX_W, BOX_W, seed, BOX_R);
      gs.fillStyle = D.inkRGBA(0.9);
      gs.fill();
      shadows.push(sh);
    }
    spriteBodies[type] = bodies;
    spriteShadows[type] = shadows;
  }

  /* the paper airplane — BIG and high-contrast: cream wings, 3px ink
   * outline, violet fold — the fold-to-plane beat must read instantly */
  var AW = 138, AH = 90;
  airplaneSpr = makeCanvas(AW, AH);
  var a = airplaneSpr.getContext("2d");
  a.translate(8, 12);
  a.lineJoin = "round";
  /* shadow pass */
  a.fillStyle = D.inkRGBA(0.35);
  a.beginPath();
  a.moveTo(4, 42); a.lineTo(120, 16); a.lineTo(42, 48); a.closePath(); a.fill();
  /* lower wing */
  a.fillStyle = T.cream;
  a.strokeStyle = C.ink; a.lineWidth = 3;
  a.beginPath();
  a.moveTo(0, 39); a.lineTo(120, 12); a.lineTo(39, 45); a.closePath();
  a.fill(); a.stroke();
  /* upper wing (brighter — the fold catches light) */
  a.fillStyle = "#FFF9EA";
  a.beginPath();
  a.moveTo(0, 39); a.lineTo(120, 12); a.lineTo(30, 21); a.closePath();
  a.fill(); a.stroke();
  /* fold creases: violet main crease + soft ink second */
  a.strokeStyle = C.violet; a.globalAlpha = 0.65; a.lineWidth = 2.2;
  a.beginPath(); a.moveTo(3, 37); a.lineTo(114, 14); a.stroke();
  a.strokeStyle = C.inkSoft; a.globalAlpha = 0.35; a.lineWidth = 1.6;
  a.beginPath(); a.moveTo(10, 41); a.lineTo(56, 43); a.stroke();
  a.globalAlpha = 1;
}

/* --------------------------------------------------------------------------
 * 4. Background — cozy shelf, baked layer canvases (parallax 0.1/0.25/0.5/1.3)
 * ------------------------------------------------------------------------ */
var PAD = 26;                    /* layer margin so parallax never shows edges */
var layers = [];                 /* [canvas, factor] */

function layerCanvas(draw) {
  var c = makeCanvas(CW + PAD * 2, CH + PAD * 2);
  var g = c.getContext("2d");
  g.translate(PAD, PAD);
  draw(g);
  return c;
}

function buildBackground() {
  /* The diorama lives in the visible zones between the HUD cards and the
   * well: left strip x~252-344, right strip x~616-708, floor below.
   * Five layers total: L0 wall, L1 far décor, L2 shelves, L3 = the well
   * itself (drawn in render), L4 rug. All baked once, seeded wobble. */

  /* L0 — mint wall: two-stop wash same hue + grain + halftone shadow zones */
  layers.push([layerCanvas(function (g) {
    var grad = g.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, T.wall);
    grad.addColorStop(1, T.mint);
    g.fillStyle = grad;
    g.fillRect(-PAD, -PAD, CW + PAD * 2, CH + PAD * 2);
    g.globalAlpha = 0.15;                                  /* paper grain */
    g.fillStyle = g.createPattern(VG.paperGrainCanvas(7), "repeat");
    g.fillRect(-PAD, -PAD, CW + PAD * 2, CH + PAD * 2);
    var half = g.createPattern(VG.halftoneCanvas(C.ink), "repeat");
    g.fillStyle = half;
    g.globalAlpha = 0.05;                                  /* wall pools behind strips */
    g.fillRect(248, 40, 100, 470);
    g.fillRect(612, 40, 100, 470);
    g.globalAlpha = 0.09;                                  /* floor shadow zone */
    g.fillRect(-PAD, CH - 64, CW + PAD * 2, 64 + PAD);
    g.globalAlpha = 1;
  }), 0.1]);

  /* L1 — far décor: round window (sun + cloud) and a bunting garland */
  layers.push([layerCanvas(function (g) {
    var wx = 298, wy = 92, r = 40;
    VG.wobblyBlobPath(g, wx, wy, r + 7, r + 7, "winframe", 10);
    g.fillStyle = C.paper3; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
    g.save();
    VG.wobblyBlobPath(g, wx, wy, r, r, "winframe", 10);
    g.clip();
    g.fillStyle = C.sky;
    g.fillRect(wx - r, wy - r, r * 2, r * 2);
    VG.drawSprite(g, { x: wx + 14, y: wy - 14, w: 24, h: 24, blob: true, fill: C.sun, seed: "winsun", scale: 1 });
    VG.drawSprite(g, { x: wx - 12, y: wy + 13, w: 34, h: 13, blob: true, fill: T.cream, seed: "wincloud", scale: 1, highlight: false });
    g.restore();
    VG.wobblyBlobPath(g, wx, wy, r, r, "winframe", 10);
    g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
    /* bunting garland over the right strip (seeded tilt per flag) */
    VG.crayonStroke(g, [[620, 64], [662, 80], [704, 64]], C.inkSoft, 1.5);
    var flags = [[634, 70, C.berry], [654, 78, C.sun], [674, 78, C.sky], [694, 70, C.leaf]];
    for (var i = 0; i < flags.length; i++) {
      var f = flags[i];
      g.save();
      g.translate(f[0], f[1]);
      g.rotate((i % 2 ? 3 : -3) * Math.PI / 180);
      g.fillStyle = f[2]; g.strokeStyle = C.ink; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.lineTo(0, 13); g.closePath();
      g.fill(); g.stroke();
      g.restore();
    }
  }), 0.25]);

  /* L2 — the cozy shelf: boards + seeded knick-knacks flanking the well */
  layers.push([layerCanvas(function (g) {
    function board(x, y, w) {
      VG.drawSprite(g, { x: x + w / 2, y: y, w: w, h: 12, fill: C.paper3, seed: "board" + x + y, scale: 1, radius: 4 });
      VG.crayonStroke(g, [[x + 6, y + 10], [x + w - 6, y + 10]], C.inkSoft, 1);
      g.save();                                            /* halftone under-board shadow */
      g.globalAlpha = 0.12;
      g.fillStyle = g.createPattern(VG.halftoneCanvas(C.ink), "repeat");
      g.fillRect(x + 4, y + 6, w - 8, 10);
      g.restore();
    }
    /* --- left strip --- */
    board(255, 214, 86);                                   /* plant + toy block */
    VG.drawSprite(g, { x: 277, y: 193, w: 24, h: 30, fill: C.berry, seed: "pot", scale: 1, radius: 5 });
    VG.drawSprite(g, { x: 277, y: 166, w: 32, h: 26, blob: true, fill: C.leaf, seed: "plant", scale: 1 });
    VG.drawSprite(g, { x: 317, y: 195, w: 26, h: 26, fill: C.sun, seed: "block1", scale: 1, radius: 4 });
    board(255, 330, 86);                                   /* paper crane + ball */
    g.save();
    g.translate(280, 310);
    g.fillStyle = T.cream; g.strokeStyle = C.ink; g.lineWidth = 2; g.lineJoin = "round";
    g.beginPath();
    g.moveTo(-18, 7); g.lineTo(0, -13); g.lineTo(7, 2); g.lineTo(20, -5); g.lineTo(10, 8); g.closePath();
    g.fill(); g.stroke();
    g.strokeStyle = C.violet; g.globalAlpha = 0.5; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-14, 5); g.lineTo(0, -10); g.stroke();
    g.globalAlpha = 1;
    g.restore();
    VG.drawSprite(g, { x: 318, y: 314, w: 28, h: 28, blob: true, fill: C.berry, seed: "ball2", scale: 1 });
    board(255, 446, 86);                                   /* gift box with ribbon */
    VG.drawSprite(g, { x: 284, y: 421, w: 38, h: 34, fill: C.sky, seed: "gift", scale: 1, radius: 5 });
    g.strokeStyle = C.violet; g.lineWidth = 3.5; g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(284, 404); g.lineTo(284, 438); g.stroke();
    g.beginPath(); g.moveTo(265, 421); g.lineTo(303, 421); g.stroke();
    g.globalAlpha = 1;
    VG.drawSprite(g, { x: 320, y: 432, w: 22, h: 22, blob: true, fill: C.sun, seed: "mugL", scale: 1 });
    /* --- right strip --- */
    board(619, 214, 86);                                   /* framed Violet + books */
    VG.drawSprite(g, { x: 644, y: 181, w: 46, h: 54, fill: C.paper2, seed: "frame", scale: 1, radius: 6 });
    g.fillStyle = C.violet;
    g.beginPath(); g.arc(644, 183, 12, 0, Math.PI * 2); g.fill();          /* round head */
    g.fillStyle = C.ink;                                                    /* ellipse eyes */
    g.beginPath(); g.ellipse(639, 181, 1.7, 2.6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(649, 181, 1.7, 2.6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.5;                               /* smile */
    g.beginPath(); g.arc(644, 186, 4, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
    VG.drawSprite(g, { x: 678, y: 190, w: 13, h: 36, fill: C.berry, seed: "book1", scale: 1, radius: 3 });
    VG.drawSprite(g, { x: 693, y: 190, w: 13, h: 36, fill: C.sky, seed: "book2", scale: 1, radius: 3 });
    board(619, 330, 86);                                   /* mug + toy blocks */
    VG.drawSprite(g, { x: 642, y: 314, w: 26, h: 26, blob: true, fill: C.sun, seed: "mugR", scale: 1 });
    VG.crayonStroke(g, [[655, 310], [660, 304], [655, 298]], C.inkSoft, 1.5);  /* steam doodle */
    VG.drawSprite(g, { x: 676, y: 316, w: 22, h: 22, fill: C.violet, seed: "block2", scale: 1, radius: 4 });
    VG.drawSprite(g, { x: 694, y: 318, w: 18, h: 18, fill: C.leaf, seed: "block3", scale: 1, radius: 4 });
    board(619, 446, 86);                                   /* sleepy stack of flat books */
    VG.drawSprite(g, { x: 656, y: 435, w: 52, h: 11, fill: C.leaf, seed: "flat1", scale: 1, radius: 3 });
    VG.drawSprite(g, { x: 654, y: 424, w: 46, h: 11, fill: C.berry, seed: "flat2", scale: 1, radius: 3 });
    VG.drawSprite(g, { x: 658, y: 413, w: 40, h: 11, fill: C.sky, seed: "flat3", scale: 1, radius: 3 });
    /* the big shelf the playfield sits on */
    VG.drawSprite(g, { x: FX + FW / 2, y: FY + FH + 18, w: FW + 96, h: 18, fill: C.paper3, seed: "mainshelf", scale: 1, radius: 5 });
    VG.crayonStroke(g, [[FX - 34, FY + FH + 30], [FX + FW + 34, FY + FH + 30]], C.inkSoft, 1);
  }), 0.5]);

  /* L4 — near foreground: mint rug strip with crayon dashes (oversized) */
  layers.push([layerCanvas(function (g) {
    g.fillStyle = T.mint3;
    VG.wobblyBlobPath(g, CW / 2, CH + 26, CW * 0.62, 58, "rug", 9);
    g.fill();
    g.strokeStyle = C.inkSoft;
    for (var i = 0; i < 9; i++) {
      var x = 130 + i * 92;
      VG.crayonStroke(g, [[x, CH - 8], [x + 34, CH - 8]], C.inkSoft, 2);
    }
    for (var b = 0; b < 5; b++) {
      VG.wobblyBlobPath(g, 60 + b * 220, CH + 14, 40, 26, "tuft" + b, 6);
      g.fillStyle = C.leaf; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
    }
  }), 1.3]);
}

/* --------------------------------------------------------------------------
 * 5. Game state
 * ------------------------------------------------------------------------ */
var harness = VG.createHarness("tetris");
var cv = VG.setupCanvas(document.getElementById("stage"));
var ctx = cv.ctx, view = cv.view;
var particles = new VG.ParticlePool();
var shake = VG.createShake();
var flash = VG.createFlash();
var scoreC = new VG.ScoreCounter();

var input = VG.createInput({
  actions: {
    left:   ["ArrowLeft", "a", "A"],
    right:  ["ArrowRight", "d", "D"],
    down:   ["ArrowDown", "s", "S"],
    rotCW:  ["ArrowUp", "x", "X", "e", "E"],
    rotCCW: ["z", "Z"],
    drop:   [" ", "Enter"],
    hold:   ["c", "C", "Shift"],
    pause:  ["Escape", "p", "P"]
  }
});

var grid, piece, bag, queue, holdType, canHold;
var score, lines, level, combo;
var state = "title";                       /* title | play | clearing | paused | topout */
var gTimer = 0, lockTimer = 0, lockResets = 0, grounded = false;
var das = { dir: 0, t: 0, rep: 0 };
var clearAnim = null;                      /* {rows, t, tier, planes, applied} */
var lockSquash = null;                     /* {cells, type, t0} — squash + recover */
var airplanes = [];                        /* live paper planes (visual only) */
var popups = [];                           /* floating praise text */
var toast = null;                          /* level-up banner */
var tetrisCel = null, tetrisCard = null;   /* TETRIS 3-beat celebration */
var topoutAnim = null;                     /* gentle tip-over */
var hurried = false;
var autopilot = DEMO;                      /* one-switch / demo AI */
var ai = null;                             /* current AI plan */
var musicTier = 0;
var simT = 0;
var bestScore = 0;                         /* numeric high score (honest, localStorage) */
var bestPopT0 = 0;                         /* new-best celebration beat timestamp */
var lastSubmit = null;                     /* {best,newRecord} from the last run */

function gravityMs() {                     /* tier-1 very slow; ~8% faster per level */
  return Math.max(70, 1000 * Math.pow(0.92, level - 1));
}

function refillBag() {
  var b = TYPES.slice();
  for (var i = b.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = b[i]; b[i] = b[j]; b[j] = tmp;
  }
  return b;
}

function resetGame() {
  grid = [];
  for (var r = 0; r < ROWS; r++) {
    grid.push([]);
    for (var c = 0; c < COLS; c++) grid[r].push(null);
  }
  bag = refillBag();
  queue = [nextType(), nextType(), nextType()];
  holdType = null; canHold = true;
  score = 0; lines = 0; level = 1; combo = -1;
  scoreC.value = 0; scoreC.shown = 0;
  gTimer = 0; lockTimer = 0; lockResets = 0; grounded = false;
  clearAnim = null; lockSquash = null; airplanes = []; popups = [];
  toast = null; tetrisCel = null; tetrisCard = null; topoutAnim = null;
  hurried = false; ai = null;
  piece = null;
  spawnPiece();
}

function nextType() {
  if (bag.length === 0) bag = refillBag();
  return bag.pop();
}

function spawnPiece(typeOverride) {
  var type = typeOverride || queue.shift();
  if (!typeOverride) queue.push(nextType());
  piece = { type: type, rot: 0, x: SPAWN_X[type], y: 0 };
  gTimer = 0; lockTimer = 0; lockResets = 0; grounded = false;
  das.dir = 0;
  if (collides(cells(piece), piece.x, piece.y)) { beginTopout(); return; }
  if (autopilot) ai = planMove();
}

function cells(p) { return ROTS[p.type][p.rot]; }

function collides(cs, px, py) {
  for (var i = 0; i < cs.length; i++) {
    var gx = px + cs[i][0], gy = py + cs[i][1];
    if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
    if (gy >= 0 && grid[gy][gx]) return true;
  }
  return false;
}

function ghostY() {
  var y = piece.y, cs = cells(piece);
  while (!collides(cs, piece.x, y + 1)) y++;
  return y;
}

function stackHeightFrac() {
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (grid[r][c]) return (ROWS - r) / VIS;
    }
  }
  return 0;
}

/* --------------------------------------------------------------------------
 * 6. Player actions — 120ms buffer honored by the engine input layer
 * ------------------------------------------------------------------------ */
function moveH(dir) {
  if (state !== "play" || !piece) return false;
  if (!collides(cells(piece), piece.x + dir, piece.y)) {
    piece.x += dir;
    if (grounded && lockResets < 14) { lockTimer = 0; lockResets++; }
    return true;
  }
  return false;
}

function rotate(dir) {
  if (state !== "play" || !piece || piece.type === "O") return false;
  var from = piece.rot, to = (piece.rot + dir + 4) % 4;
  var ks = kicksFor(piece.type, from, to), cs = ROTS[piece.type][to];
  for (var i = 0; i < ks.length; i++) {
    if (!collides(cs, piece.x + ks[i][0], piece.y + ks[i][1])) {
      piece.rot = to; piece.x += ks[i][0]; piece.y += ks[i][1];
      if (grounded && lockResets < 14) { lockTimer = 0; lockResets++; }
      S.tick();                                   /* soft spin tick */
      return true;
    }
  }
  return false;
}

function stepDown(scoring) {
  if (!piece) return false;
  if (!collides(cells(piece), piece.x, piece.y + 1)) {
    piece.y++;
    gTimer = 0;
    if (scoring) { score += 1; scoreC.value = score; }  /* soft drop +1 (no anim spam) */
    return true;
  }
  return false;
}

function hardDrop() {
  if (state !== "play" || !piece) return;
  var dist = 0;
  while (!collides(cells(piece), piece.x, piece.y + 1)) { piece.y++; dist++; }
  score += dist * 2;                                   /* hard drop +2/cell */
  scoreC.value = score;
  S.whoosh();
  lockPiece(true);
}

function doHold() {
  if (state !== "play" || !piece || !canHold) return;
  S.confirm();
  var cur = piece.type;
  if (holdType) { spawnPiece(holdType); holdType = cur; }
  else { holdType = cur; spawnPiece(); }
  canHold = false;
  if (autopilot) ai = planMove();
}

/* --------------------------------------------------------------------------
 * 7. Locking, line clears, scoring — the celebration tiers
 * ------------------------------------------------------------------------ */
function lockPiece(slams) {
  var cs = cells(piece);
  var minY = ROWS;
  for (var i = 0; i < cs.length; i++) {
    var gx = piece.x + cs[i][0], gy = piece.y + cs[i][1];
    grid[gy][gx] = piece.type;
    if (gy < minY) minY = gy;
  }
  /* squash + paper *thwip*: filtered-noise + sine thump (Land recipe) */
  lockSquash = { cells: cs.slice(), type: piece.type, x: piece.x, yBase: piece.y, t0: performance.now() };
  S.land();
  if (slams) particles.spawn(4, {                        /* dust puff on slam */
    x: FX + (piece.x + 1.5) * CELL, y: cellY(piece.y + 2), kind: "spark",
    speed: 60, ttl: 0.4, size: 3, color: C.paper3, gravity: 200 });

  if (minY < HIDDEN) { beginTopout(); return; }        /* locked out — gentle fail */

  /* bounce pitch-ladder on consecutive clearing placements */
  var full = [];
  for (var r = 0; r < ROWS; r++) {
    var filled = true;
    for (var c = 0; c < COLS; c++) if (!grid[r][c]) { filled = false; break; }
    if (filled) full.push(r);
  }
  piece = null;
  canHold = true;
  checkHurry();

  if (full.length === 0) {
    combo = -1;
    spawnPiece();
    return;
  }
  combo++;
  if (combo > 0) S.bounce(Math.min(combo, 8));
  beginClear(full);
}

function beginClear(rows) {
  state = "clearing";
  var n = rows.length;
  var tier = n === 4 ? "tetris" : n === 3 ? "triple" : n === 2 ? "double" : "single";
  clearAnim = { rows: rows, t: 0, tier: tier, planes: [], applied: false };
  /* ~60ms hit-stop (90ms on big hits) — the freeze that sells the fold */
  loop.hitStop(n >= 2 ? D.budgets.hitStop.big : D.budgets.hitStop.normal);
  if (!VG.Juice.reduced) flash.fire(0.05, 60);
  shake.trigger(n >= 2 ? 4 : 3, 200);
  S.pop();                                             /* fold thunk */

  /* score (honest numbers, no fake multipliers) */
  var base = [0, 100, 300, 500, 800][n] * level + Math.max(0, combo) * 50 * level;
  score += base;
  scoreC.add(base);
  var names = { single: "Nice fold!", double: "Double!", triple: "Triple!", tetris: "TETRIS!" };
  /* praise waits for the crease beat so the airplane owns the moment */
  popups.push({ text: names[tier] + " +" + base, x: FX + FW / 2, y: cellY(rows[0]) - 16,
                t0: performance.now() + 120, big: tier === "tetris" });
  harness.scoreUpdate(score);

  /* signature moment: row-crease anticipation → fold shut → each row
   * launches as a paper airplane (60ms stagger) */
  for (var i = 0; i < rows.length; i++) {
    airplanes.push({
      x0: FX + FW / 2, y0: cellY(rows[i]) + CELL / 2,
      delay: 0.26 + i * DESIGN_STAGGER / 1000, t: 0,
      dur: (360 + i * 30) / 1000, snd: false, k: null, x: 0, y: 0
    });
  }
  /* tier sound escalates: single chime → double → triple arpeggio → fanfare */
  setTimeout(function () {
    if (state !== "clearing" && state !== "play") return;
    if (tier === "single") S.coin();
    else if (tier === "double") { S.coin(); S.confirm(); }
    else if (tier === "triple") S.powerUp();
  }, 260);

  /* TETRIS = full 3-beat choreography with fanfare + gold confetti */
  if (tier === "tetris") {
    tetrisCel = VG.celebrate(
      { loop: loop, particles: particles, flash: flash },
      {
        cx: FX + FW / 2, cy: FY + FH * 0.4,
        note: function (i) { S.fanfare(i); },
        card: function (o) { tetrisCard = { t0: performance.now(), ms: o.ms }; },
        finish: function () { tetrisCel = null; tetrisCard = null; }
      }
    );
    /* gold confetti variant (1-in-tier) — scheduled in sim time below */
    clearAnim.goldAt = 0.4;
  }
}

var DESIGN_STAGGER = D.timing.stagger;

function applyClear() {
  var rows = clearAnim.rows, n = rows.length;
  for (var i = 0; i < rows.length; i++) {
    grid.splice(rows[i], 1);
    var empty = [];
    for (var c = 0; c < COLS; c++) empty.push(null);
    grid.unshift(empty);
  }
  lines += n;
  var newLevel = Math.floor(lines / 8) + 1;            /* level every 8 lines */
  if (newLevel > level) {
    level = newLevel;
    toast = { text: "Level " + level + "!", t0: performance.now() };
    S.powerUp();
    startLevelMusic();                                 /* +1 semitone per level */
  }
  clearAnim = null;
  state = "play";
  checkHurry();
  spawnPiece();
  /* buffered presses from the clear window count (doctrine 120ms fairness) */
  if (input.consumeBuffered("hold")) doHold();
  else if (input.consumeBuffered("rotCW")) rotate(1);
  else if (input.consumeBuffered("rotCCW")) rotate(-1);
}

/* --------------------------------------------------------------------------
 * 8. Music — "Fold-Along": a hooky, composed pentatonic lead (call-and-
 *    answer arch, kid-hummable) over a root–fifth sine bass + off-beat
 *    noise hat. +1 semitone per level; hurry = +12 BPM + 1 semitone.
 *    Voices route through the engine synth (S.voice, bus "music") so the
 *    doctrine chain — lowpass 8kHz, exponential envelopes, SFX ducking —
 *    still applies. Optional engine melody generator stays untouched.
 * ------------------------------------------------------------------------ */
var SCALE = [262, 294, 330, 392, 440, 523, 587, 659];   /* C major pentatonic, 2 octaves */
var HOOK  = [5, 7, 6, 5, 4, -1, 5, 4, 3, 4, 5, 4, 3, -1, 2, -1];
var BASSROOTS = [131, 175, 196, 131];                    /* C F G C */
var pm = { playing: false, bpm: 100, tier: 0, step: 0, nextTime: 0, timer: 0 };

function musicTick() {
  if (!pm.playing) return;
  var c = S.ensure();
  if (!c) return;                                        /* not unlocked yet — wait */
  if (pm.nextTime === 0) pm.nextTime = c.currentTime + 0.1;
  var eighth = 60 / pm.bpm / 2;
  var tr = Math.pow(2, pm.tier / 12);                    /* +1 semitone per tier */
  while (pm.nextTime < c.currentTime + 0.25) {           /* 250ms lookahead */
    var s = pm.step % 16;
    var t = Math.max(0, pm.nextTime - c.currentTime);
    var ni = HOOK[s];
    if (ni >= 0) S.voice({ type: "triangle", freq: SCALE[ni] * tr,
                           dur: eighth * 0.92, gain: 0.44, delay: t, bus: "music" });
    if (s % 4 === 0) {                                   /* bass: root, fifth on beat 3 */
      var bf = BASSROOTS[Math.floor(s / 4) % 4];
      if (s % 8 === 4) bf *= 1.5;
      S.voice({ type: "sine", freq: bf * tr, dur: eighth * 3.5, gain: 0.4, delay: t, bus: "music" });
    }
    if (s % 2 === 1) {                                   /* noise hat, off-beats */
      S.voice({ noise: true, filter: { type: "highpass", freq: 6000 },
                dur: 0.03, gain: 0.2, delay: t, bus: "music" });
    }
    pm.nextTime += eighth;
    pm.step++;
  }
}
function startPaperMusic(bpm, tier) {
  stopPaperMusic();
  pm.playing = true; pm.bpm = bpm; pm.tier = tier;
  pm.step = 0; pm.nextTime = 0;
  pm.timer = setInterval(musicTick, 100);
}
function stopPaperMusic() {
  pm.playing = false;
  if (pm.timer) { clearInterval(pm.timer); pm.timer = 0; }
}

function startLevelMusic() {
  musicTier = level - 1;
  startPaperMusic(100, musicTier);
  hurried = false;
}
function checkHurry() {
  var frac = stackHeightFrac();
  if (!hurried && frac > 0.7) { hurried = true; startPaperMusic(112, musicTier + 1); }
  else if (hurried && frac < 0.55) { startLevelMusic(); }
}

/* --------------------------------------------------------------------------
 * 9. Gentle failure — the stack tips over with a sigh; never harsh (§3f-2)
 * ------------------------------------------------------------------------ */
function beginTopout() {
  state = "topout";
  piece = null;
  stopPaperMusic();                                      /* music stops, warm chord */
  topoutAnim = { t0: performance.now() };
  S.gentleFail();                                      /* the minor-second sigh */
  S.failureChord();                                    /* warm I chord, no sting */
  if (DEMO) {                                          /* attract mode never banks scores */
    lastSubmit = { best: bestScore, newRecord: false };
  } else {
    lastSubmit = harness.submitScore(score);
    bestScore = lastSubmit.best;
  }
  harness.gameEnded(score);
  if (lastSubmit.newRecord) {                          /* new-best celebration beat */
    bestPopT0 = performance.now();
    S.sticker();
    particles.spawn(18, {
      x: FX + FW / 2, y: FY + 40, kind: "confetti", speed: 160, ttl: 1.2,
      size: 5, gravity: 300, up: 120, colors: [T.gold, C.sun]
    });
  }
}

/* --------------------------------------------------------------------------
 * 10. Pause / quit / start — harness lifecycle
 * ------------------------------------------------------------------------ */
function startGame() {
  S.unlock();
  bestPopT0 = 0;
  resetGame();
  state = "play";
  startLevelMusic();
  S.confirm();
}
function togglePause() {
  if (state === "play" || state === "clearing") {
    state = "paused";
    stopPaperMusic();
    S.stopMusic();
    S.tick();
  } else if (state === "paused") {
    state = piece || clearAnim ? (clearAnim ? "clearing" : "play") : "play";
    var wasHurried = hurried;
    startLevelMusic();
    if (wasHurried) { hurried = true; startPaperMusic(112, musicTier + 1); }
    S.confirm();
  }
}
function quitToShelf() {
  S.tick();
  if (state === "play" || state === "clearing" || state === "paused") {
    /* a quit still banks an honest high score at run end */
    lastSubmit = harness.submitScore(score || 0);
    if (lastSubmit.newRecord) bestPopT0 = performance.now();
    bestScore = lastSubmit.best;
  }
  harness.gameQuit(score || 0);
  state = "title";
  stopPaperMusic();
  S.stopMusic();
}

/* --------------------------------------------------------------------------
 * 11. Input routing (keyboard + engine touch: tap=spin, swipe L/R=move,
 *     swipe down=soft step, swipe up=keep) — plus on-screen touch buttons
 * ------------------------------------------------------------------------ */
input.onAction(function (a) {
  S.unlock();
  if (tetrisCel && (a === "drop" || a === "rotCW" || a === "action")) { tetrisCel.skip(); }
  switch (state) {
    case "title":
      if (a === "drop" || a === "action" || a === "rotCW") startGame();
      return;
    case "topout":
      if (performance.now() - topoutAnim.t0 > 600) startGame();   /* instant retry */
      return;
    case "paused":
      if (a === "pause") togglePause();
      return;
  }
  if (a === "pause") { togglePause(); return; }
  if (state !== "play") return;
  switch (a) {
    case "left":  moveH(-1); das.dir = -1; das.t = 0; das.rep = 0; das.fresh = true; break;
    case "right": moveH(1);  das.dir = 1;  das.t = 0; das.rep = 0; das.fresh = true; break;
    case "down":  stepDown(true); break;
    case "rotCW": case "action": rotate(1); break;
    case "rotCCW": rotate(-1); break;
    case "drop":  hardDrop(); break;
    case "hold": case "up": doHold(); break;           /* swipe up = keep */
  }
});
window.addEventListener("keydown", function (e) {
  if (e.key === "1") { autopilot = !autopilot; ai = autopilot ? planMove() : null; }
  if (e.key.toLowerCase() === "j") VG.Juice.toggle();
});
window.addEventListener("pointerdown", function () { S.unlock(); });

/* --------------------------------------------------------------------------
 * 12. Calm autopilot (demo attract + one-switch mode) — a small heuristic
 *     brain: clear lines, avoid holes, keep the surface low and smooth.
 * ------------------------------------------------------------------------ */
function planMove() {
  if (!piece) return null;
  var type = piece.type, bestScore = -Infinity, bestRot = 0, bestX = piece.x;
  for (var rot = 0; rot < (type === "O" ? 1 : 4); rot++) {
    var cs = ROTS[type][rot];
    for (var x = -2; x < COLS; x++) {
      if (collides(cs, x, 0) && collides(cs, x, 1)) continue;
      var y = 0;
      if (collides(cs, x, y)) continue;
      while (!collides(cs, x, y + 1)) y++;
      var s = evalBoard(cs, x, y);
      if (s > bestScore) { bestScore = s; bestRot = rot; bestX = x; }
    }
  }
  return { rot: bestRot, x: bestX, next: 0.25 + Math.random() * 0.2, dropAt: null };
}

function evalBoard(cs, px, py) {
  /* simulate lock on a scratch grid */
  var g2 = [];
  for (var r = 0; r < ROWS; r++) g2.push(grid[r].slice());
  for (var i = 0; i < cs.length; i++) {
    var gx = px + cs[i][0], gy = py + cs[i][1];
    if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) g2[gy][gx] = 1;
  }
  var cleared = 0;
  for (r = 0; r < ROWS; r++) {
    var full = true;
    for (var c = 0; c < COLS; c++) if (!g2[r][c]) { full = false; break; }
    if (full) cleared++;
  }
  var heights = [];
  for (c = 0; c < COLS; c++) {
    var hh = 0;
    for (r = 0; r < ROWS; r++) if (g2[r][c]) { hh = ROWS - r; break; }
    heights.push(hh);
  }
  var agg = 0, holes = 0, bump = 0;
  for (c = 0; c < COLS; c++) {
    agg += heights[c];
    var blocked = false;
    for (r = 0; r < ROWS; r++) {
      if (g2[r][c]) blocked = true;
      else if (blocked) holes++;
    }
    if (c > 0) bump += Math.abs(heights[c] - heights[c - 1]);
  }
  return cleared * 760 - holes * 510 - agg * 51 - bump * 184 +
         (heights[9] < 3 && heights[0] < 3 ? 40 : 0) + Math.random() * 8;
}

function updateAI(dt) {
  if (!piece || !ai) return;
  ai.next -= dt;
  if (ai.next > 0) return;
  ai.next = 0.09 + Math.random() * 0.07;               /* calm, human-ish cadence */
  /* 1 — rotate toward target */
  if (piece.rot !== ai.rot) { rotate(1); return; }
  /* 2 — walk toward target column (ai.x is the planned piece origin) */
  if (piece.x < ai.x) { moveH(1); return; }
  if (piece.x > ai.x) { moveH(-1); return; }
  /* 3 — settle: mostly soft-drop partway, then a gentle slam */
  if (ai.dropAt == null) ai.dropAt = Math.random() < 0.6;
  if (ai.dropAt) { hardDrop(); }
  else {
    if (!stepDown(false)) hardDrop();
  }
  if (!piece) ai = null;
}

/* --------------------------------------------------------------------------
 * 13. Simulation — fixed-step update (60Hz via the engine loop)
 * ------------------------------------------------------------------------ */
function simUpdate(dt) {
    simT += dt;
    particles.update(dt);
    scoreC.update();
    if (tetrisCel) tetrisCel.update(dt * 1000);

    /* paper airplanes: delayed launch, then fly (visual state lives here) */
    var now = performance.now();
    for (var i = airplanes.length - 1; i >= 0; i--) {
      var pl = airplanes[i];
      if (pl.delay > 0) { pl.delay -= dt; continue; }
      if (!pl.snd) { pl.snd = true; S.whoosh(); }
      pl.t += dt;
      var k = Math.min(1, pl.t / pl.dur);
      pl.x = pl.x0 + E.easeOut(k) * (CW - pl.x0 + 150);
      pl.y = pl.y0 - Math.sin(k * Math.PI) * 38 - k * 20;
      pl.k = k;
      if (k >= 1) { airplanes.splice(i, 1); continue; }
      if ((pl.trailAcc = (pl.trailAcc || 0) + dt) > 0.05) {  /* trail 2/frame cap */
        pl.trailAcc = 0;
        particles.spawn(1, { x: pl.x - 20, y: pl.y + 6, kind: "trail", speed: 10,
                             ttl: 0.45, size: 2.5, color: C.paper3, gravity: 30 });
      }
    }
    /* popups / toast expiry */
    for (i = popups.length - 1; i >= 0; i--) if (now - popups[i].t0 > 750) popups.splice(i, 1);
    if (toast && now - toast.t0 > 1400) toast = null;

    /* demo attract mode: gentle fail auto-restarts, no card, keeps cycling */
    if (state === "topout" && DEMO && now - topoutAnim.t0 > 1800) { startGame(); return; }

    if (state === "clearing") {
      clearAnim.t += dt;
      if (clearAnim.goldAt != null && clearAnim.t >= clearAnim.goldAt) {
        clearAnim.goldAt = null;                          /* gold confetti variant */
        particles.spawn(12, {
          x: FX + FW / 2, y: FY + FH * 0.35, kind: "confetti", speed: 200, ttl: 1.3,
          size: 6, gravity: 400, up: 140, colors: [T.gold, C.sun]
        });
      }
      if (clearAnim.t >= 0.52) applyClear();
      return;
    }
    if (state !== "play" || !piece) return;

    if (autopilot) updateAI(dt);
    if (state !== "play" || !piece) return;             /* AI may have locked/cleared */

    /* DAS: hold-to-repeat 300ms delay / 100ms repeat (small hands, §3g) */
    if (!autopilot) {
      var dir = input.isHeld("left") ? -1 : input.isHeld("right") ? 1 : 0;
      if (dir === 0) { das.dir = 0; das.t = 0; das.rep = 0; das.fresh = false; }
      else if (dir === das.dir && !das.fresh) {
        das.t += dt * 1000;
        if (das.t >= 300) {
          das.rep += dt * 1000;
          if (das.rep >= 100) { das.rep = 0; moveH(dir); }
        }
      } else if (dir !== das.dir) {
        das.dir = dir; das.t = 0; das.rep = 0; das.fresh = false; moveH(dir);
      } else { das.fresh = false; }
    }

    /* gravity — soft drop overrides; grounded pieces sit on lock delay */
    grounded = collides(cells(piece), piece.x, piece.y + 1);
    var soft = !autopilot && input.isHeld("down");
    if (!grounded) {
      lockTimer = 0;
      var interval = soft ? 45 : gravityMs();
      gTimer += dt * 1000;
      while (gTimer >= interval) {
        gTimer -= interval;
        if (!stepDown(soft)) break;
        grounded = collides(cells(piece), piece.x, piece.y + 1);
        if (!grounded) continue;
        break;
      }
    } else {
      lockTimer += dt * 1000;
      if (soft && lockTimer > 180) lockTimer = 180;    /* pressing down locks sooner */
      if (lockTimer >= 500) lockPiece(false);          /* generous 500ms lock delay */
    }
}

var loop = VG.createLoop({
  update: function (dt) { simUpdate(dt); },
  render: function () { render(); }
});

/* --------------------------------------------------------------------------
 * 14. Rendering
 * ------------------------------------------------------------------------ */
var gFit = 1, gOx = 0, gOy = 0;                  /* letterbox transform for pointer math */
var uiButtons = [];                               /* rebuilt every frame */

function button(id, x, y, w, h, label, fill) {
  uiButtons.push({ id: id, x: x, y: y, w: w, h: h });
  VG.pillButton(ctx, { x: x, y: y, w: w, h: h, label: label, fill: fill,
                       fontSize: 20, pressed: pressedBtn === id });
}
var pressedBtn = null;

function drawCellSprite(type, gx, gy, variant, alpha) {
  var x = cellX(gx), y = cellY(gy);
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(spriteBodies[type][variant], x, y, CELL, CELL);
  if (alpha != null) ctx.globalAlpha = 1;
}

function drawPieceAt(type, cs, px, py, alpha) {
  var i, v = 0;
  if (alpha != null) ctx.globalAlpha = alpha;
  for (i = 0; i < cs.length; i++) {                   /* shadow pass first */
    var gx = px + cs[i][0], gy = py + cs[i][1];
    if (gy < HIDDEN) continue;
    ctx.drawImage(spriteShadows[type][v], cellX(gx) + 2, cellY(gy) + 2, CELL, CELL);
  }
  for (i = 0; i < cs.length; i++) {
    gx = px + cs[i][0]; gy = py + cs[i][1];
    if (gy < HIDDEN) continue;
    ctx.drawImage(spriteBodies[type][v], cellX(gx), cellY(gy), CELL, CELL);
  }
  if (alpha != null) ctx.globalAlpha = 1;
}

function miniPiece(type, cx, cy, cell, bob) {
  var cs = ROTS[type][0];
  var minX = 9, maxX = 0, minY = 9, maxY = 0;
  for (var i = 0; i < cs.length; i++) {
    minX = Math.min(minX, cs[i][0]); maxX = Math.max(maxX, cs[i][0]);
    minY = Math.min(minY, cs[i][1]); maxY = Math.max(maxY, cs[i][1]);
  }
  var w = (maxX - minX + 1) * cell, h = (maxY - minY + 1) * cell;
  var x0 = cx - w / 2, y0 = cy - h / 2 + (bob || 0);
  for (i = 0; i < cs.length; i++) {
    var x = x0 + (cs[i][0] - minX) * cell, y = y0 + (cs[i][1] - minY) * cell;
    ctx.drawImage(spriteBodies[type][0], x, y, cell, cell);
  }
}

function text(str, x, y, size, font, color, align) {
  ctx.font = (font || "700 " + size + "px " + FDISP);
  ctx.fillStyle = color || C.ink;
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}
function outlinedText(str, x, y, size, big) {
  ctx.font = (big ? "800 " : "700 ") + size + "px " + FDISP;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = T.cream;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = C.ink;
  ctx.fillText(str, x, y);
}

function parallax(f) {
  if (VG.Juice.reduced) return [0, 0];                 /* frozen in reducedJuice */
  var px = piece ? (piece.x + 1 - COLS / 2) : 0;
  var py = piece ? (piece.y - ROWS / 2) * 0.4 : 0;
  var sway = Math.sin(simT * 0.45) * 4;
  return [-(px * 1.1 + sway) * f, -py * f * 0.5];
}

function render() {
  var w = view.w, h = view.h, now = performance.now();
  ctx.save();
  ctx.fillStyle = T.wall;
  ctx.fillRect(0, 0, w, h);
  gFit = Math.min(w / CW, h / CH);
  gOx = (w - CW * gFit) / 2; gOy = (h - CH * gFit) / 2;
  ctx.translate(gOx, gOy);
  ctx.scale(gFit, gFit);
  var off = shake.offset();
  ctx.translate(off[0], off[1]);
  uiButtons = [];

  /* ---- parallax world: L0 wall, L1 window, L2 shelf, (field), L4 rug ---- */
  var li, p;
  for (li = 0; li < 3; li++) {
    p = parallax(layers[li][1]);
    ctx.drawImage(layers[li][0], -PAD + p[0], -PAD + p[1]);
  }

  /* ---- field frame: washi-taped paper panel with mint inset ---- */
  ctx.fillStyle = D.inkRGBA(0.9);
  ctx.fillRect(FX - 13, FY - 13, FW + 32, FH + 32);
  ctx.fillStyle = C.paper2;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(FX - 16, FY - 16, FW + 32, FH + 32, 14);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = T.mint2;
  ctx.beginPath();
  ctx.roundRect(FX - 5, FY - 5, FW + 10, FH + 10, 8);
  ctx.fill();
  ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 1; ctx.stroke();
  ctx.save();                                            /* quiet column guides */
  ctx.beginPath(); ctx.rect(FX, FY, FW, FH); ctx.clip();
  ctx.strokeStyle = D.inkRGBA(0.06); ctx.lineWidth = 1;
  for (var gc = 1; gc < COLS; gc++) {
    ctx.beginPath(); ctx.moveTo(FX + gc * CELL, FY); ctx.lineTo(FX + gc * CELL, FY + FH); ctx.stroke();
  }
  ctx.globalAlpha = 0.1;                                 /* grain inside the field */
  ctx.fillStyle = ctx.createPattern(VG.paperGrainCanvas(21), "repeat");
  ctx.fillRect(FX, FY, FW, FH);
  ctx.restore();
  /* washi tape pinning the field frame */
  ctx.save();
  ctx.translate(FX - 4, FY - 14); ctx.rotate(-4 * Math.PI / 180);
  ctx.globalAlpha = 0.6; ctx.fillStyle = C.violet; ctx.fillRect(-24, -7, 48, 14);
  ctx.restore();
  ctx.save();
  ctx.translate(FX + FW + 4, FY + FH + 12); ctx.rotate(3 * Math.PI / 180);
  ctx.globalAlpha = 0.6; ctx.fillStyle = C.sky; ctx.fillRect(-24, -7, 48, 14);
  ctx.restore();

  /* ---- the stack (shadow pass, then bodies; wobble variant stable per cell) */
  ctx.save();
  ctx.beginPath(); ctx.rect(FX - 2, FY - 2, FW + 4, FH + 4); ctx.clip();
  if (topoutAnim) {                                      /* gentle tip-over sway */
    var tt = Math.min(1, (now - topoutAnim.t0) / 900);
    ctx.translate(FX + FW / 2, FY + FH);
    ctx.rotate(Math.sin(tt * Math.PI) * 0.05 * Math.sin(tt * 9));
    ctx.translate(-(FX + FW / 2), -(FY + FH));
  }
  var clearRows = (clearAnim && clearAnim.t >= 0.14) ? clearAnim.rows : null;
  var ANT_T = 0.16, FOLD_T = 0.18;                       /* crease beat, then fold */
  var antP = clearAnim ? Math.min(1, clearAnim.t / ANT_T) : 0;
  var fold2 = clearAnim ? Math.max(0, Math.min(1, (clearAnim.t - ANT_T) / FOLD_T)) : 0;
  var sqActive = lockSquash && now - lockSquash.t0 < 240;
  function isSquashCell(r, cc2) {
    if (!sqActive) return false;
    var cs3 = lockSquash.cells;
    for (var k3 = 0; k3 < cs3.length; k3++) {
      if (lockSquash.x + cs3[k3][0] === cc2 && r === lockSquash.yBase + cs3[k3][1]) return true;
    }
    return false;
  }
  var r, cc;
  for (r = HIDDEN; r < ROWS; r++) {
    if (clearRows && clearRows.indexOf(r) >= 0) continue;
    for (cc = 0; cc < COLS; cc++) {
      if (grid[r][cc] && !isSquashCell(r, cc)) ctx.drawImage(spriteShadows[grid[r][cc]][(r * 3 + cc * 7) % 4],
                                     cellX(cc) + 2, cellY(r) + 2, CELL, CELL);
    }
  }
  for (r = HIDDEN; r < ROWS; r++) {
    var folding = clearAnim && clearAnim.rows.indexOf(r) >= 0;
    for (cc = 0; cc < COLS; cc++) {
      if (!grid[r][cc] || isSquashCell(r, cc)) continue;
      if (folding) {                                     /* anticipation squat → fold shut */
        var fs = fold2 > 0
          ? Math.max(0.12, 0.92 - 0.8 * E.easeIn(fold2))
          : 1 - 0.08 * E.easeIn(antP);
        ctx.save();
        ctx.translate(FX + FW / 2, cellY(r) + CELL / 2);
        ctx.scale(1, fs);
        ctx.translate(-(FX + FW / 2), -(cellY(r) + CELL / 2));
        ctx.drawImage(spriteBodies[grid[r][cc]][(r * 3 + cc * 7) % 4],
                      cellX(cc), cellY(r), CELL, CELL);
        ctx.restore();
      } else {
        ctx.drawImage(spriteBodies[grid[r][cc]][(r * 3 + cc * 7) % 4],
                      cellX(cc), cellY(r), CELL, CELL);
      }
    }
  }
  /* row-crease anticipation: a dashed fold line draws itself across each
   * clearing row (paper is about to fold — the kid sees it coming) */
  if (clearAnim && fold2 < 1) {
    var clen = FW * E.easeOut(Math.max(antP, 0.15));
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    for (li = 0; li < clearAnim.rows.length; li++) {
      var ry = cellY(clearAnim.rows[li]) + CELL / 2;
      ctx.strokeStyle = D.inkRGBA(0.4);
      ctx.beginPath();
      ctx.moveTo(FX + FW / 2 - clen / 2, ry + 1);
      ctx.lineTo(FX + FW / 2 + clen / 2, ry + 1);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,252,245," + (0.75 * antP) + ")";
      ctx.beginPath();
      ctx.moveTo(FX + FW / 2 - clen / 2, ry - 1);
      ctx.lineTo(FX + FW / 2 + clen / 2, ry - 1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
  /* landing squash on the last locked piece (80ms down, 160ms pop recover) */
  if (lockSquash && now - lockSquash.t0 < 240) {
    var ls = lockSquash, lt = now - ls.t0, sx = 1.25, sy = 0.75;
    if (lt > 80) {
      var rp = E.pop((lt - 80) / 160);
      sx = 1.25 - 0.25 * rp; sy = 0.75 + 0.25 * rp;
    }
    var bx0 = 99, bx1 = -99, by1 = -99;
    for (li = 0; li < ls.cells.length; li++) {
      var gx2 = ls.x + ls.cells[li][0];
      bx0 = Math.min(bx0, gx2); bx1 = Math.max(bx1, gx2);
      by1 = Math.max(by1, ls.cells[li][1]);
    }
    var ax = FX + (bx0 + bx1 + 1) / 2 * CELL, ay = cellY(by1) + CELL;
    ctx.save();
    ctx.translate(ax, ay); ctx.scale(sx, sy); ctx.translate(-ax, -ay);
    for (li = 0; li < ls.cells.length; li++) {
      var gxx = ls.x + ls.cells[li][0], gyy = ls.cells[li][1];
      if (gyy >= HIDDEN) {
        ctx.drawImage(spriteShadows[ls.type][0], cellX(gxx) + 2, cellY(gyy) + 2, CELL, CELL);
        ctx.drawImage(spriteBodies[ls.type][0], cellX(gxx), cellY(gyy), CELL, CELL);
      }
    }
    ctx.restore();
  }
  /* ghost — dashed paper outline (never filled, never loud) */
  if (piece && state === "play") {
    var gy2 = ghostY();
    if (gy2 > piece.y) {
      ctx.strokeStyle = D.inkRGBA(0.35);
      ctx.fillStyle = D.inkRGBA(0.05);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      var pcs = cells(piece);
      for (li = 0; li < pcs.length; li++) {
        var g3x = piece.x + pcs[li][0], g3y = gy2 + pcs[li][1];
        if (g3y < HIDDEN) continue;
        ctx.beginPath();
        ctx.roundRect(cellX(g3x) + 2, cellY(g3y) + 2, CELL - 4, CELL - 4, 5);
        ctx.fill(); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    drawPieceAt(piece.type, cells(piece), piece.x, piece.y);
  }
  /* paper airplanes — the signature line-clear flight (big + high contrast) */
  for (li = 0; li < airplanes.length; li++) {
    var ap = airplanes[li];
    if (ap.delay > 0 || ap.k == null) continue;
    ctx.save();
    ctx.translate(ap.x, ap.y);
    ctx.rotate(-0.22 + 0.28 * ap.k);
    ctx.globalAlpha = ap.k > 0.85 ? 1 - (ap.k - 0.85) / 0.15 : 1;
    ctx.drawImage(airplaneSpr, -AIR_W / 2, -AIR_H / 2, AIR_W, AIR_H);
    ctx.restore();
  }
  ctx.restore(); /* field clip */

  particles.render(ctx);

  /* ---- L4 near foreground: the mint rug (1.3×, slightly oversized) ---- */
  p = parallax(layers[3][1]);
  ctx.drawImage(layers[3][0], -PAD + p[0], -PAD + p[1]);

  /* ---- floating praise (honest: describes the action; deferred so the
   *      airplane beat lands first) ---- */
  for (li = 0; li < popups.length; li++) {
    var pu = popups[li], age = now - pu.t0;
    if (age < 0) continue;
    var pk = Math.min(1, age / 750);
    ctx.save();
    ctx.globalAlpha = pk > 0.6 ? 1 - (pk - 0.6) / 0.4 : 1;
    var ps = pu.big ? 1 + 0.25 * Math.sin(Math.PI * Math.min(1, pk * 2.2)) : 1;
    ctx.translate(pu.x, pu.y - 30 * E.easeOut(pk));
    ctx.scale(ps, ps);
    outlinedText(pu.text, 0, 0, pu.big ? 32 : 24, pu.big);
    ctx.restore();
  }

  /* ---- HUD ---- */
  drawHUD(now);

  /* ---- level-up toast ---- */
  if (toast) {
    var tk = (now - toast.t0) / 1400;
    var ts = 0.9 + 0.1 * E.pop(Math.min(1, tk * 4));
    ctx.save();
    ctx.globalAlpha = tk > 0.75 ? 1 - (tk - 0.75) / 0.25 : 1;
    ctx.translate(FX + FW / 2, FY + 58);
    ctx.scale(ts, ts);
    VG.washiPanel(ctx, -86, -24, 172, 48, { tape: C.sun, scale: 1 });
    text(toast.text, 0, 1, 24);
    ctx.restore();
  }
  /* ---- TETRIS card (beat 3 of the 3-beat choreography) ---- */
  if (tetrisCard) {
    var ctk = Math.min(1, (now - tetrisCard.t0) / tetrisCard.ms);
    ctx.save();
    ctx.translate(FX + FW / 2, FY + FH * 0.36 - 8 * ctk);
    var cts = 0.9 + 0.1 * E.pop(ctk);
    ctx.scale(cts, cts);
    VG.washiPanel(ctx, -120, -46, 240, 92, { tape: T.gold, fill: C.paper });
    outlinedText("TETRIS!", 0, -10, 32, true);
    text("Four rows — one plane each!", 0, 24, 18, "600 18px " + FBODY, C.inkSoft);
    ctx.restore();
  }

  /* ---- state overlays ---- */
  if (state === "title" && !DEMO) drawTitle(now);
  if (state === "paused") drawPaused();
  if (state === "topout") drawTopout(now);

  flash.render(ctx, CW, CH);
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 15. HUD — washi panels, tabular score, next queue, hold, line pips
 * ------------------------------------------------------------------------ */
function drawHUD(now) {
  /* left: HOLD — roomy gaps so the panel, its tape, and the how-to card
   * never collide or clip each other (critic defect 4) */
  VG.washiPanel(ctx, 44, 24, 200, 118, { tape: C.sky, scale: 1 });
  text("KEEP", 144, 46, 18, "700 18px " + FDISP, C.inkSoft);
  if (holdType) {
    ctx.save();
    if (!canHold) ctx.globalAlpha = 0.45;
    miniPiece(holdType, 144, 98, 16, VG.Juice.reduced ? 0 : Math.sin(simT * 2.6) * 2);
    ctx.restore();
  } else {
    ctx.strokeStyle = D.inkRGBA(0.3); ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.roundRect(104, 66, 80, 56, 8); ctx.stroke();
    ctx.setLineDash([]);
    text("press C", 144, 94, 18, "600 18px " + FBODY, C.inkSoft);
  }

  /* left: how-to (dual-coded icon + word, 18px floor) — 20px clear of KEEP */
  VG.washiPanel(ctx, 44, 162, 200, 246, { tape: C.leaf, scale: 1 });
  text("How to fold", 144, 186, 20);
  var rowsH = [
    ["\u2190 \u2192", "Move"],
    ["\u2193", "Soft drop"],
    ["\u2191 / X", "Spin"],
    ["Z", "Spin back"],
    ["SPACE", "Slam down"],
    ["C", "Keep piece"],
    ["P", "Pause"]
  ];
  for (var i = 0; i < rowsH.length; i++) {
    text(rowsH[i][0], 70, 216 + i * 26, 18, "700 18px " + FDISP, C.violet, "left");
    text(rowsH[i][1], 138, 216 + i * 26, 18, "500 18px " + FBODY, C.ink, "left");
  }

  /* left: pause + quit pills (≥56px targets, clear of the how-to tape) */
  button("pause", 44, 424, 96, 56, "Pause", C.sun);
  button("quit", 148, 424, 96, 56, "Quit", C.paper2);

  /* right: NEXT queue of 3 (staggered 80ms breath between paired pieces) */
  VG.washiPanel(ctx, 716, 30, 200, 240, { tape: C.violet, scale: 1 });
  text("NEXT", 816, 52, 18, "700 18px " + FDISP, C.inkSoft);
  for (i = 0; i < 3; i++) {
    var bob = VG.Juice.reduced ? 0 : Math.sin(simT * 2.6 - i * 0.8) * 2;
    miniPiece(queue[i], 816, 96 + i * 58, i === 0 ? 15 : 12, bob);
  }

  /* right: SCORE (tabular-nums tick-up) + honest Best.
   * Best shows ONLY the persisted high score — updated at run end, never
   * tracking live score mid-run (critic defect 3). */
  VG.washiPanel(ctx, 716, 290, 200, 100, { tape: C.sun, scale: 1 });
  text("SCORE", 744, 314, 18, "700 18px " + FDISP, C.inkSoft, "left");
  scoreC.render(ctx, 744, 346, 26);
  var bestAge = bestPopT0 ? now - bestPopT0 : 1e9;
  ctx.save();
  if (bestAge < 900) {                                   /* new-best celebration beat */
    var bpop = 1 + 0.2 * Math.sin(Math.PI * Math.min(1, bestAge / 900));
    ctx.translate(744, 376); ctx.scale(bpop, bpop); ctx.translate(-744, -376);
    text("\u2605 New best " + bestScore, 744, 376, 18, "700 18px " + FDISP, C.violet, "left");
  } else {
    text("Best " + bestScore, 744, 376, 18, "600 18px " + FBODY, C.inkSoft, "left");
  }
  ctx.restore();

  /* right: LEVEL + 8 folded-paper pips to the next level */
  VG.washiPanel(ctx, 716, 410, 200, 100, { tape: C.berry, scale: 1 });
  text("LEVEL", 744, 434, 18, "700 18px " + FDISP, C.inkSoft, "left");
  text(String(level), 886, 448, 32, "800 32px " + FDISP, C.violet, "right");
  var pips = lines % 8;
  for (i = 0; i < 8; i++) {
    var px2 = 744 + i * 21, py2 = 478;
    ctx.save();
    ctx.translate(px2 + 8, py2 + 8);
    ctx.rotate((i % 2 ? -3 : 4) * Math.PI / 180);
    ctx.fillStyle = i < pips ? C.violet : T.mint;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-8, -8, 16, 16, 4); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* bottom touch row — big targets for tablets */
  if (TOUCH && (state === "play" || state === "clearing")) {
    button("holdb", 254, 494, 108, 56, "Keep", C.sky);
    button("slam", 426, 494, 108, 56, "Slam", C.sun);
    button("spinL", 598, 494, 108, 56, "Spin", C.violet);
  }
  if (DEMO) {
    ctx.save();
    ctx.translate(CW - 76, 34); ctx.rotate(3 * Math.PI / 180);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = C.violet;
    ctx.beginPath(); ctx.roundRect(-52, -16, 104, 32, 16); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
    text("DEMO", 0, 1, 18, "800 18px " + FDISP, T.cream);
    ctx.restore();
  }
}

/* --------------------------------------------------------------------------
 * 16. Overlays — title, pause, gentle top-out (cards on plum veil)
 * ------------------------------------------------------------------------ */
function veil() {
  ctx.fillStyle = "rgba(58,43,70,0.22)";
  ctx.fillRect(0, 0, CW, CH);
}

function drawTitle() {
  veil();
  ctx.save();
  ctx.translate(CW / 2, CH / 2 - 6);
  VG.washiPanel(ctx, -240, -160, 480, 328, { tape: C.violet, fill: C.paper, scale: 1 });
  outlinedText("Paper Stack", 0, -104, 43, true);
  text("Fold the rows \u00B7 Fly the planes!", 0, -58, 20, "600 20px " + FBODY, C.inkSoft);
  /* a little demo airplane + three gift boxes */
  ctx.drawImage(airplaneSpr, 110, -156, 78, 51);
  miniPiece("T", -96, 4, 16, Math.sin(simT * 2.6) * 2);
  miniPiece("I", 0, 4, 16, Math.sin(simT * 2.6 - 0.8) * 2);
  miniPiece("O", 92, 4, 16, Math.sin(simT * 2.6 - 1.6) * 2);
  button("start", -110, 52, 220, 56, "Start folding", C.sun);
  if (bestScore > 0) text("\u2605 Best " + bestScore, 0, 138, 20, "700 20px " + FDISP, C.violet);
  ctx.restore();
}

function drawPaused() {
  veil();
  ctx.save();
  ctx.translate(CW / 2, CH / 2);
  VG.washiPanel(ctx, -180, -140, 360, 280, { tape: C.sky, fill: C.paper, scale: 1 });
  outlinedText("Paused", 0, -86, 32, true);
  text("Take a breath \u2014 the paper waits.", 0, -44, 18, "600 18px " + FBODY, C.inkSoft);
  button("resume", -110, -8, 220, 56, "Resume", C.leaf);
  button("restart", -110, 60, 104, 56, "Redo", C.sun);
  button("quit2", 16, 60, 94, 56, "Quit", C.paper2);
  ctx.restore();
}

function drawTopout(now) {
  var tk = Math.min(1, (now - topoutAnim.t0) / 500);
  /* dizzy stars drifting above the shelf — cute, never scary */
  ctx.save();
  ctx.globalAlpha = tk;
  for (var i = 0; i < 3; i++) {
    var sa = simT * 1.4 + i * 2.1;
    var sx2 = FX + FW / 2 + Math.cos(sa) * 46;
    var sy2 = FY - 2 + Math.sin(sa * 1.3) * 6;
    text("\u2736", sx2, sy2, 20, "700 20px " + FDISP, C.sun);
  }
  ctx.restore();
  if (DEMO || tk < 0.55) return;                         /* let the tip-over land first */
  veil();
  ctx.save();
  ctx.translate(CW / 2, CH / 2);
  var ck = Math.min(1, (tk - 0.55) / 0.45);
  var cs2 = 0.9 + 0.1 * E.pop(ck);
  ctx.scale(cs2, cs2);
  VG.washiPanel(ctx, -220, -150, 440, 300, { tape: C.sun, fill: C.paper, scale: 1 });
  outlinedText("Great try!", 0, -96, 32, true);
  text("The stack tipped over \u2014 that happens.", 0, -52, 18, "600 18px " + FBODY, C.inkSoft);
  text("Score", 0, -12, 18, "700 18px " + FDISP, C.inkSoft);
  text(String(score), 0, 22, 32, "800 32px " + FDISP, C.ink);
  if (lastSubmit && lastSubmit.newRecord) text("\u2605 New best! \u2605", 0, 58, 20, "700 20px " + FDISP, C.violet);
  else text("Best " + bestScore, 0, 58, 18, "600 18px " + FBODY, C.inkSoft);
  button("again", -120, 86, 240, 56, "Fold again!", C.sun);
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 17. Pointer handling for canvas buttons (physical press into the paper)
 * ------------------------------------------------------------------------ */
function toDesign(e) {
  var rect = cv.canvas.getBoundingClientRect();
  return [(e.clientX - rect.left - gOx) / gFit, (e.clientY - rect.top - gOy) / gFit];
}
cv.canvas.addEventListener("pointerdown", function (e) {
  S.unlock();
  var pt = toDesign(e);
  for (var i = 0; i < uiButtons.length; i++) {
    var b = uiButtons[i];
    if (pt[0] >= b.x && pt[0] <= b.x + b.w && pt[1] >= b.y && pt[1] <= b.y + b.h) {
      pressedBtn = b.id;
      setTimeout(function (id) { return function () { pressedBtn = null; }; }(b.id), 110);
      pressButton(b.id);
      return;
    }
  }
});
function pressButton(id) {
  S.tick();
  switch (id) {
    case "start": case "again": case "restart": startGame(); break;
    case "pause": case "resume": togglePause(); break;
    case "quit": case "quit2": quitToShelf(); break;
    case "holdb": doHold(); break;
    case "slam": hardDrop(); break;
    case "spinL": rotate(-1); break;
  }
}

/* --------------------------------------------------------------------------
 * 18. Boot
 * ------------------------------------------------------------------------ */
buildSprites();
buildBackground();
bestScore = harness.highScore();
resetGame();
if (DEMO) {
  state = "play";                                        /* attract: AI plays calmly */
  startLevelMusic();                                     /* silent until unlocked — fine */
}

/* headless test hook (opt-in; used by the pre-ship simulation, inert otherwise) */
if (window.PAPERSTACK_DEBUG) {
  window.PaperStackDebug = {
    get state() { return state; },
    get grid() { return grid; },
    get piece() { return piece; },
    get score() { return score; },
    get lines() { return lines; },
    get level() { return level; },
    get queue() { return queue; },
    get holdType() { return holdType; },
    get bestScore() { return bestScore; },
    setLines: function (n) { lines = n; },
    setLevel: function (n) { level = n; },
    setPiece: function (t) { piece = { type: t, rot: 0, x: SPAWN_X[t], y: 0 }; gTimer = 0; },
    setGrid: function (fn) { fn(grid); },
    step: simUpdate,
    render: render,
    moveH: moveH, rotate: rotate, hardDrop: hardDrop, doHold: doHold,
    pause: togglePause, quit: quitToShelf,
    start: startGame, planMove: function () { ai = planMove(); return ai; },
    autopilot: function (on) { autopilot = !!on; if (autopilot && piece) ai = planMove(); }
  };
}
loop.start();
})();
