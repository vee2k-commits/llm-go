/* ============================================================================
 * Violet's Wardrobe — Vee Arcade dress-up studio (DESIGN-BIBLE §4 brief 7)
 *
 * A cozy craft-table style studio: Violet and friends stand on a paper doll
 * stand under a little spotlight while the child dresses them from cut-paper
 * sticker shelves. Dice outfits, recoloring swatches, stage backdrops and a
 * Polaroid sticker-album save moment. No timers, no losing — pure creation.
 *
 * Canon: Violet (purple-haired star), Frogmaster Flex (green frog + purple
 * scarf), Princess Kellee (royal purple, pink accents). All art procedural.
 *
 * Built ON the engine (../engine/vee-game.js, vee-sfx.js) — never replaces it.
 * ========================================================================== */
(function () {
"use strict";

var VG = window.VeeGame, D = VG.DESIGN, C = D.colors, E = D.easing, S = window.VeeSFX;
var DEMO = !!window.DRESSUP_DEMO;

/* --------------------------------------------------------------------------
 * 0. Game-local token block — every hex lives HERE (doctrine §1, gate 48).
 *    Canon character hues come from the roster brief; everything else is a
 *    DESIGN token or a tint of one.
 * ------------------------------------------------------------------------ */
var T = {
  skin:     C.paper3,      /* warm paper skin — the doll is made of paper   */
  skinShd:  C.paper2,      /* skin shading / undersuit                      */
  hairV:    C.violet,      /* Violet's purple hair (canon)                  */
  frog:     "#8bbd24",     /* Frogmaster Flex body green (canon)            */
  frogDark: "#71a01c",     /* Flex shading — same hue family                */
  belly:    "#d3e6a0",     /* Flex belly — lighter tint of frog hue         */
  pink:     "#e14b92",     /* Princess Kellee accent pink (canon)           */
  royal:    "#6c3fb5",     /* Kellee royal purple — darker violet family    */
  blush:    "#e8917e",     /* cheeks — berry family tint                    */
  spot:     "#FFFDF2",     /* spotlight warm white (cream, never #fff)      */
  gold:     "#FFD97A"      /* golden-variant confetti (celebration tiers)   */
};
var FD = "'Baloo 2','Fredoka','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";
var FB = "'Fredoka','Baloo 2','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";

/* Recolor swatches — first entry keeps the item's original paper color. */
var SWATCHES = [
  { name: "Original", tint: null },
  { name: "Violet",   tint: C.violet },
  { name: "Sunny",    tint: C.sun },
  { name: "Leafy",    tint: C.leaf },
  { name: "Sky",      tint: C.sky },
  { name: "Berry",    tint: C.berry }
];

/* --------------------------------------------------------------------------
 * 1. Geometry — 960×540 design space, letterboxed to the iframe
 * ------------------------------------------------------------------------ */
var CW = 960, CH = 540;
var STAGE = { x: 16, y: 78, w: 552, h: 446 };          /* left: the stage   */
var PANEL = { x: 584, y: 78, w: 360, h: 446 };         /* right: wardrobe   */
var TOUCH = ("ontouchstart" in window) ||
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

/* --------------------------------------------------------------------------
 * 2. Cut-paper drawing helpers (sprite recipe §5: shadow → fill → detail →
 *    2px outline; shadowBlur banned; wobble seeded & stable)
 * ------------------------------------------------------------------------ */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* cutPaper: hard-offset flat shadow → flat fill → optional detail → outline */
function cutPaper(ctx, pathFn, fill, o) {
  o = o || {};
  var lw = o.lw != null ? o.lw : 2;
  if (o.shadow !== false) {
    ctx.save();
    ctx.translate(3, 3);
    pathFn();
    ctx.fillStyle = o.shadowColor || D.inkRGBA(0.9);
    ctx.fill();
    ctx.restore();
  }
  pathFn();
  ctx.fillStyle = fill;
  ctx.fill();
  if (o.detail) o.detail(pathFn);
  if (o.outline !== false) {
    pathFn();
    ctx.lineWidth = lw;
    ctx.strokeStyle = o.stroke || C.ink;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

function blobPath(ctx, cx, cy, rx, ry, seed) {
  return function () { VG.wobblyBlobPath(ctx, cx, cy, rx, ry, seed || 7); };
}
function rectPath(ctx, x, y, w, h, seed, r) {
  return function () { VG.wobblyRectPath(ctx, x, y, w, h, seed || 7, r); };
}
function ellPath(ctx, cx, cy, rx, ry) {
  return function () { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
}

function starPath(ctx, cx, cy, r, points, seed) {
  var rnd = VG.mulberry32(VG.hashSeed(String(seed || 3)));
  return function () {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var rr = (i % 2 === 0 ? r : r * 0.45) * (1 + (rnd() - 0.5) * 0.12);
      var a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
}

/* Text with a paper halo so it stays 4.5:1 over any playfield color (§3g). */
function txt(ctx, s, x, y, size, o) {
  o = o || {};
  ctx.save();
  ctx.font = (o.weight || 700) + " " + size + "px " + (o.body ? FB : FD);
  ctx.textAlign = o.align || "left";
  ctx.textBaseline = o.baseline || "middle";
  if (o.halo !== false) {
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = C.paper;
    ctx.lineJoin = "round";
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color || C.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 3. Wardrobe catalog — every item is a small procedural draw function.
 *    draw(ctx, tint) renders the sticker centered on (0,0) in doll-space px.
 *    anchor {x,y} is where it sits on the doll; z = layer order vs the body.
 * ------------------------------------------------------------------------ */
var CATS = [
  { id: "hat",   label: "Hats",    icon: "hat" },
  { id: "top",   label: "Tops",    icon: "top" },
  { id: "dress", label: "Dresses", icon: "dress" },
  { id: "shoes", label: "Shoes",   icon: "shoes" },
  { id: "acc",   label: "Extras",  icon: "acc" },
  { id: "stage", label: "Stage",   icon: "stage" }
];

var ITEMS = [
  /* ------------------------------------------------------------- HATS --- */
  { id: "sunhat", cat: "hat", name: "Sun Hat", recolor: true, ax: 0, ay: -142, z: 4,
    draw: function (ctx, t) {
      cutPaper(ctx, ellPath(ctx, 0, 12, 38, 11), t || C.sun);
      cutPaper(ctx, blobPath(ctx, 0, -2, 24, 18, 31), t || C.sun);
      cutPaper(ctx, rectPath(ctx, -24, 4, 48, 8, 32, 4), C.berry, { shadow: false });
    } },
  { id: "beanie", cat: "hat", name: "Beanie", recolor: true, ax: 0, ay: -140, z: 4,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, 0, 0, 27, 22, 41), t || C.berry);
      cutPaper(ctx, rectPath(ctx, -27, 8, 54, 10, 42, 5), t || C.berry, { shadow: false });
      cutPaper(ctx, ellPath(ctx, 0, -22, 7, 7), C.paper, { shadow: false });
    } },
  { id: "crown", cat: "hat", name: "Crown", recolor: false, ax: 0, ay: -144, z: 4,
    draw: function (ctx) {
      var p = function () {
        ctx.beginPath();
        ctx.moveTo(-24, 14); ctx.lineTo(-26, -10); ctx.lineTo(-13, 2);
        ctx.lineTo(0, -16); ctx.lineTo(13, 2); ctx.lineTo(26, -10);
        ctx.lineTo(24, 14); ctx.closePath();
      };
      cutPaper(ctx, p, C.sun);
      cutPaper(ctx, ellPath(ctx, 0, 8, 4, 4), C.berry, { shadow: false, outline: false });
      cutPaper(ctx, ellPath(ctx, -16, 8, 3, 3), C.sky, { shadow: false, outline: false });
      cutPaper(ctx, ellPath(ctx, 16, 8, 3, 3), C.sky, { shadow: false, outline: false });
    } },
  { id: "beret", cat: "hat", name: "Beret", recolor: true, ax: 0, ay: -142, z: 4,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, 2, -2, 30, 15, 51), t || C.violet);
      cutPaper(ctx, ellPath(ctx, 4, -16, 4, 4), t || C.violet, { shadow: false });
    } },
  { id: "bigbow", cat: "hat", name: "Big Bow", recolor: true, ax: 26, ay: -140, z: 4,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, -15, 0, 15, 11, 61), t || T.pink);
      cutPaper(ctx, blobPath(ctx, 15, 0, 15, 11, 62), t || T.pink);
      cutPaper(ctx, ellPath(ctx, 0, 0, 6, 6), C.paper, { shadow: false });
    } },
  { id: "wizard", cat: "hat", name: "Wizard Hat", recolor: true, ax: 0, ay: -144, z: 4,
    draw: function (ctx, t) {
      var cone = function () {
        ctx.beginPath();
        ctx.moveTo(-24, 12); ctx.quadraticCurveTo(-4, -34, 8, -30);
        ctx.quadraticCurveTo(16, -26, 24, 12); ctx.closePath();
      };
      cutPaper(ctx, cone, t || C.violet);
      cutPaper(ctx, ellPath(ctx, 0, 12, 32, 8), t || C.violet, { shadow: false });
      cutPaper(ctx, starPath(ctx, -2, -6, 6, 5, 63), C.sun, { shadow: false, lw: 1.5 });
    } },

  /* ------------------------------------------------------------- TOPS --- */
  { id: "tee", cat: "top", name: "Tee", recolor: true, ax: 0, ay: -8, z: 3,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, -36, -16, 10, 13, 71), t || C.leaf);
      cutPaper(ctx, blobPath(ctx, 36, -16, 10, 13, 72), t || C.leaf);
      cutPaper(ctx, rectPath(ctx, -31, -30, 62, 62, 73, 10), t || C.leaf);
    } },
  { id: "sweater", cat: "top", name: "Sweater", recolor: true, ax: 0, ay: -8, z: 3,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, -37, -12, 10, 16, 81), t || C.violet);
      cutPaper(ctx, blobPath(ctx, 37, -12, 10, 16, 82), t || C.violet);
      cutPaper(ctx, rectPath(ctx, -31, -30, 62, 64, 83, 10), t || C.violet, {
        detail: function () {
          ctx.strokeStyle = D.inkRGBA(0.35); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-24, 22); ctx.lineTo(24, 22); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-24, 27); ctx.lineTo(24, 27); ctx.stroke();
        } });
      cutPaper(ctx, ellPath(ctx, 0, -28, 12, 6), C.paper2, { shadow: false });
    } },
  { id: "sailor", cat: "top", name: "Sailor Top", recolor: false, ax: 0, ay: -8, z: 3,
    draw: function (ctx) {
      cutPaper(ctx, rectPath(ctx, -31, -30, 62, 62, 91, 10), C.paper);
      cutPaper(ctx, blobPath(ctx, -36, -16, 10, 13, 92), C.paper);
      cutPaper(ctx, blobPath(ctx, 36, -16, 10, 13, 93), C.paper);
      var collar = function () {
        ctx.beginPath();
        ctx.moveTo(-22, -30); ctx.lineTo(0, -10); ctx.lineTo(22, -30);
        ctx.lineTo(28, -22); ctx.lineTo(0, 2); ctx.lineTo(-28, -22); ctx.closePath();
      };
      cutPaper(ctx, collar, C.sky, { shadow: false });
      cutPaper(ctx, ellPath(ctx, 0, 0, 5, 5), C.berry, { shadow: false });
    } },
  { id: "vest", cat: "top", name: "Vest", recolor: true, ax: 0, ay: -8, z: 3,
    draw: function (ctx, t) {
      cutPaper(ctx, rectPath(ctx, -31, -30, 26, 62, 101, 8), t || C.sun);
      cutPaper(ctx, rectPath(ctx, 5, -30, 26, 62, 102, 8), t || C.sun);
      cutPaper(ctx, ellPath(ctx, -18, 0, 3, 3), C.ink, { shadow: false, outline: false });
      cutPaper(ctx, ellPath(ctx, 18, 0, 3, 3), C.ink, { shadow: false, outline: false });
    } },
  { id: "hoodie", cat: "top", name: "Hoodie", recolor: true, ax: 0, ay: -8, z: 3,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, -37, -12, 10, 16, 111), t || C.sky);
      cutPaper(ctx, blobPath(ctx, 37, -12, 10, 16, 112), t || C.sky);
      cutPaper(ctx, rectPath(ctx, -31, -28, 62, 62, 113, 10), t || C.sky);
      cutPaper(ctx, blobPath(ctx, 0, -26, 17, 10, 114), C.paper2, { shadow: false });
      cutPaper(ctx, rectPath(ctx, -14, 12, 28, 14, 115, 5), D.inkRGBA(0.15),
        { shadow: false, outline: false });
    } },
  { id: "startee", cat: "top", name: "Star Tee", recolor: true, ax: 0, ay: -8, z: 3,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, -36, -16, 10, 13, 121), t || C.paper2);
      cutPaper(ctx, blobPath(ctx, 36, -16, 10, 13, 122), t || C.paper2);
      cutPaper(ctx, rectPath(ctx, -31, -30, 62, 62, 123, 10), t || C.paper2);
      cutPaper(ctx, starPath(ctx, 0, 0, 13, 5, 124), C.sun, { shadow: false, lw: 1.5 });
    } },

  /* ------------------------------------------ DRESSES & SCARVES & CAPES --- */
  { id: "sundress", cat: "dress", name: "Sun Dress", recolor: true, ax: 0, ay: 24, z: 2,
    draw: function (ctx, t) {
      var skirt = function () {
        ctx.beginPath();
        ctx.moveTo(-24, -28); ctx.lineTo(24, -28);
        ctx.quadraticCurveTo(44, 30, 34, 40);
        ctx.quadraticCurveTo(0, 50, -34, 40);
        ctx.quadraticCurveTo(-44, 30, -24, -28); ctx.closePath();
      };
      cutPaper(ctx, skirt, t || C.violet, {
        detail: function () {
          ctx.fillStyle = C.paper; ctx.globalAlpha = 0.55;
          [[-14, 8], [12, 16], [-2, 30], [20, -6], [-20, -10]].forEach(function (p) {
            ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill();
          });
          ctx.globalAlpha = 1;
        } });
    } },
  { id: "party", cat: "dress", name: "Party Dress", recolor: true, ax: 0, ay: 24, z: 2,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, 0, -18, 24, 14, 131), t || T.pink);
      cutPaper(ctx, blobPath(ctx, -20, 18, 16, 16, 132), t || T.pink, { shadow: false });
      cutPaper(ctx, blobPath(ctx, 20, 18, 16, 16, 133), t || T.pink, { shadow: false });
      cutPaper(ctx, blobPath(ctx, 0, 26, 22, 18, 134), t || T.pink, { shadow: false });
      cutPaper(ctx, ellPath(ctx, 0, -18, 4, 4), C.sun, { shadow: false, outline: false });
    } },
  { id: "scarf", cat: "dress", name: "Cozy Scarf", recolor: true, ax: 0, ay: -58, z: 3,
    draw: function (ctx, t) {
      cutPaper(ctx, blobPath(ctx, 0, 0, 30, 12, 141), t || C.violet);
      cutPaper(ctx, rectPath(ctx, 4, 6, 16, 44, 142, 6), t || C.violet);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.lineCap = "round";
      for (var i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(7 + i * 5, 50); ctx.lineTo(7 + i * 5, 58); ctx.stroke();
      }
    } },
  { id: "cape", cat: "dress", name: "Hero Cape", recolor: true, ax: 0, ay: -20, z: -1, back: true,
    draw: function (ctx, t) {
      var p = function () {
        ctx.beginPath();
        ctx.moveTo(-26, -36); ctx.quadraticCurveTo(-52, 40, -34, 74);
        ctx.quadraticCurveTo(0, 86, 34, 74);
        ctx.quadraticCurveTo(52, 40, 26, -36); ctx.closePath();
      };
      cutPaper(ctx, p, t || C.berry);
    } },
  { id: "overalls", cat: "dress", name: "Overalls", recolor: true, ax: 0, ay: 22, z: 2,
    draw: function (ctx, t) {
      cutPaper(ctx, rectPath(ctx, -18, -34, 36, 26, 151, 6), t || C.sky);
      cutPaper(ctx, rectPath(ctx, -18, -44, 8, 16, 152, 3), t || C.sky, { shadow: false });
      cutPaper(ctx, rectPath(ctx, 10, -44, 8, 16, 153, 3), t || C.sky, { shadow: false });
      var skirt = function () {
        ctx.beginPath();
        ctx.moveTo(-20, -10); ctx.lineTo(20, -10);
        ctx.quadraticCurveTo(36, 30, 28, 38); ctx.quadraticCurveTo(0, 46, -28, 38);
        ctx.quadraticCurveTo(-36, 30, -20, -10); ctx.closePath();
      };
      cutPaper(ctx, skirt, t || C.sky, { shadow: false });
      cutPaper(ctx, ellPath(ctx, 0, -22, 3.5, 3.5), C.sun, { shadow: false, outline: false });
    } },
  { id: "rainbow", cat: "dress", name: "Rainbow Dress", recolor: false, ax: 0, ay: 24, z: 2,
    draw: function (ctx) {
      var bands = [C.berry, C.sun, C.leaf, C.sky];
      for (var i = 0; i < 4; i++) {
        var y0 = -28 + i * 18, w0 = 22 + i * 8;
        (function (i, y0, w0) {
          var p = function () {
            ctx.beginPath();
            ctx.moveTo(-w0, y0); ctx.lineTo(w0, y0);
            ctx.quadraticCurveTo(w0 + 8, y0 + 18, w0 + 6, y0 + 20);
            ctx.lineTo(-w0 - 6, y0 + 20);
            ctx.quadraticCurveTo(-w0 - 8, y0 + 18, -w0, y0); ctx.closePath();
          };
          cutPaper(ctx, p, bands[i], { shadow: i === 0 });
        })(i, y0, w0);
      }
    } },

  /* ------------------------------------------------------------ SHOES --- */
  { id: "sneakers", cat: "shoes", name: "Sneakers", recolor: false, ax: 0, ay: 112, z: 1,
    draw: function (ctx) {
      [-16, 16].forEach(function (x, i) {
        cutPaper(ctx, rectPath(ctx, x - 12, -8, 26, 16, 161 + i, 7), C.paper);
        cutPaper(ctx, ellPath(ctx, x + 8, 0, 7, 7), C.berry, { shadow: false, lw: 1.5 });
      });
    } },
  { id: "boots", cat: "shoes", name: "Boots", recolor: true, ax: 0, ay: 108, z: 1,
    draw: function (ctx, t) {
      [-16, 16].forEach(function (x, i) {
        cutPaper(ctx, rectPath(ctx, x - 10, -22, 22, 30, 171 + i, 6), t || C.berry);
        cutPaper(ctx, rectPath(ctx, x - 10, 2, 28, 9, 173 + i, 4), t || C.berry, { shadow: false });
      });
    } },
  { id: "sandals", cat: "shoes", name: "Sandals", recolor: false, ax: 0, ay: 114, z: 1,
    draw: function (ctx) {
      [-16, 16].forEach(function (x, i) {
        cutPaper(ctx, ellPath(ctx, x, 2, 13, 6), C.sun);
        cutPaper(ctx, ellPath(ctx, x, -2, 6, 5), T.skin, { shadow: false, lw: 1.5 });
      });
    } },
  { id: "slippers", cat: "shoes", name: "Slippers", recolor: true, ax: 0, ay: 112, z: 1,
    draw: function (ctx, t) {
      [-16, 16].forEach(function (x, i) {
        cutPaper(ctx, blobPath(ctx, x, 0, 14, 9, 181 + i), t || C.violet);
        cutPaper(ctx, ellPath(ctx, x + 6, -5, 4, 4), C.paper, { shadow: false, outline: false });
      });
    } },
  { id: "rainboots", cat: "shoes", name: "Rain Boots", recolor: true, ax: 0, ay: 106, z: 1,
    draw: function (ctx, t) {
      [-16, 16].forEach(function (x, i) {
        cutPaper(ctx, rectPath(ctx, x - 10, -26, 22, 34, 191 + i, 6), t || C.leaf);
        cutPaper(ctx, rectPath(ctx, x - 10, -26, 22, 7, 193 + i, 3), C.paper, { shadow: false });
      });
    } },
  { id: "starboots", cat: "shoes", name: "Star Boots", recolor: false, ax: 0, ay: 108, z: 1,
    draw: function (ctx) {
      [-16, 16].forEach(function (x, i) {
        cutPaper(ctx, rectPath(ctx, x - 10, -20, 22, 28, 201 + i, 6), C.sun);
        cutPaper(ctx, starPath(ctx, x, -6, 6, 5, 203 + i), C.paper, { shadow: false, lw: 1.5 });
      });
    } },

  /* ------------------------------------------------------------ EXTRAS --- */
  { id: "glasses", cat: "acc", name: "Round Glasses", recolor: false, ax: 0, ay: -104, z: 5,
    draw: function (ctx) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(-12, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(12, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.stroke();
      ctx.fillStyle = "rgba(255,252,245,0.35)";
      ctx.beginPath(); ctx.arc(-12, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12, 0, 10, 0, Math.PI * 2); ctx.fill();
    } },
  { id: "wand", cat: "acc", name: "Star Wand", recolor: false, ax: 46, ay: 20, z: 5,
    draw: function (ctx) {
      cutPaper(ctx, rectPath(ctx, -3, -18, 6, 44, 211, 3), C.paper2);
      cutPaper(ctx, starPath(ctx, 0, -26, 13, 5, 212), C.sun);
    } },
  { id: "balloon", cat: "acc", name: "Balloon", recolor: true, ax: 48, ay: -46, z: 5,
    draw: function (ctx, t) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.quadraticCurveTo(6, 30, 0, 44); ctx.stroke();
      cutPaper(ctx, blobPath(ctx, 0, -4, 16, 19, 221), t || C.berry);
      cutPaper(ctx, ellPath(ctx, -5, -10, 4, 6), T.spot, { shadow: false, outline: false });
    } },
  { id: "necklace", cat: "acc", name: "Bead Necklace", recolor: false, ax: 0, ay: -52, z: 5,
    draw: function (ctx) {
      for (var i = 0; i < 5; i++) {
        var a = Math.PI * (0.15 + 0.7 * i / 4);
        cutPaper(ctx, ellPath(ctx, Math.cos(a) * 22, Math.sin(a) * 12, 5, 5),
          i === 2 ? C.sun : C.violet, { shadow: false, lw: 1.5 });
      }
    } },
  { id: "flower", cat: "acc", name: "Flower Clip", recolor: true, ax: -34, ay: -136, z: 5,
    draw: function (ctx, t) {
      for (var i = 0; i < 5; i++) {
        var a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        cutPaper(ctx, ellPath(ctx, Math.cos(a) * 9, Math.sin(a) * 9, 7, 7),
          t || T.pink, { shadow: i === 0, lw: 1.5 });
      }
      cutPaper(ctx, ellPath(ctx, 0, 0, 5.5, 5.5), C.sun, { shadow: false, lw: 1.5 });
    } },
  { id: "wings", cat: "acc", name: "Fairy Wings", recolor: false, ax: 0, ay: -26, z: -1, back: true,
    draw: function (ctx) {
      ctx.save(); ctx.globalAlpha = 0.85;
      cutPaper(ctx, blobPath(ctx, -34, -8, 22, 30, 231), C.sky);
      cutPaper(ctx, blobPath(ctx, 34, -8, 22, 30, 232), C.sky);
      cutPaper(ctx, blobPath(ctx, -26, 20, 13, 17, 233), C.paper, { shadow: false });
      cutPaper(ctx, blobPath(ctx, 26, 20, 13, 17, 234), C.paper, { shadow: false });
      ctx.restore();
    } }
];

/* Stage backdrops — drawn inside the stage frame; also the "stage" category. */
var STAGES = [
  { id: "curtains", cat: "stage", name: "Theater",
    draw: function (ctx, x, y, w, h) {
      ctx.fillStyle = C.paper2; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = T.royal;
      ctx.fillRect(x, y, w * 0.16, h); ctx.fillRect(x + w * 0.84, y, w * 0.16, h);
      ctx.fillRect(x, y, w, h * 0.12);
      ctx.fillStyle = D.inkRGBA(0.25);
      for (var i = 0; i < 3; i++) {
        ctx.fillRect(x + w * 0.03, y + h * 0.14 + i * h * 0.28, w * 0.05, h * 0.24);
        ctx.fillRect(x + w * 0.9, y + h * 0.14 + i * h * 0.28, w * 0.05, h * 0.24);
      }
      ctx.fillStyle = C.sun;
      for (i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + w * (0.25 + i * 0.125), y + h * 0.12, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = C.paper3; ctx.fillRect(x, y + h * 0.86, w, h * 0.14);
    } },
  { id: "garden", cat: "stage", name: "Garden",
    draw: function (ctx, x, y, w, h) {
      ctx.fillStyle = C.sky; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = T.spot;
      ctx.beginPath(); ctx.arc(x + w * 0.82, y + h * 0.16, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.leaf;
      ctx.beginPath(); ctx.ellipse(x + w * 0.25, y + h * 1.02, w * 0.45, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w * 0.85, y + h * 1.06, w * 0.4, h * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      [[0.18, 0.8], [0.36, 0.86], [0.72, 0.82]].forEach(function (f, i) {
        var fx = x + w * f[0], fy = y + h * f[1];
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx, fy + 18); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = [T.pink, C.sun, C.violet][i];
        for (var p = 0; p < 5; p++) {
          var a = (p / 5) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      });
    } },
  { id: "night", cat: "stage", name: "Night Sky",
    draw: function (ctx, x, y, w, h) {
      ctx.fillStyle = C.inkSoft; ctx.fillRect(x, y, w, h);
      var rnd = VG.mulberry32(VG.hashSeed("night-stars"));
      ctx.fillStyle = T.spot;
      for (var i = 0; i < 26; i++) {
        ctx.globalAlpha = 0.5 + rnd() * 0.5;
        ctx.beginPath(); ctx.arc(x + rnd() * w, y + rnd() * h * 0.7, 1.5 + rnd() * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.arc(x + w * 0.8, y + h * 0.2, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.inkSoft;
      ctx.beginPath(); ctx.arc(x + w * 0.76, y + h * 0.17, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
    } },
  { id: "beach", cat: "stage", name: "Beach",
    draw: function (ctx, x, y, w, h) {
      ctx.fillStyle = C.sky; ctx.fillRect(x, y, w, h * 0.62);
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.arc(x + w * 0.16, y + h * 0.18, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#9CCBF2"; ctx.fillRect(x, y + h * 0.62, w, h * 0.14);
      ctx.fillStyle = T.spot; ctx.globalAlpha = 0.6;
      ctx.fillRect(x, y + h * 0.63, w, 4); ctx.globalAlpha = 1;
      ctx.fillStyle = C.paper3;
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.76);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.68, x + w, y + h * 0.78);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    } },
  { id: "desk", cat: "stage", name: "Craft Desk",
    draw: function (ctx, x, y, w, h) {
      ctx.fillStyle = C.paper2; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = C.paper3; ctx.fillRect(x, y + h * 0.8, w, h * 0.2);
      var rnd = VG.mulberry32(VG.hashSeed("desk-doodles"));
      ctx.strokeStyle = D.inkRGBA(0.3); ctx.lineWidth = 2; ctx.lineCap = "round";
      for (var i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(x + w * (0.12 + rnd() * 0.76), y + h * (0.12 + rnd() * 0.5));
        ctx.rotate((rnd() - 0.5) * 0.6);
        ctx.strokeRect(-16, -12, 32, 24);
        ctx.restore();
      }
      ctx.globalAlpha = 0.6; ctx.fillStyle = C.violet;
      ctx.fillRect(x + w * 0.06, y + 8, 52, 14);
      ctx.fillStyle = C.leaf;
      ctx.fillRect(x + w * 0.78, y + h * 0.62, 46, 13);
      ctx.globalAlpha = 1;
    } },
  { id: "rainbow", cat: "stage", name: "Rainbow",
    draw: function (ctx, x, y, w, h) {
      ctx.fillStyle = C.paper; ctx.fillRect(x, y, w, h);
      var bands = [C.berry, C.sun, C.leaf, C.sky, C.violet];
      var cx = x + w * 0.5, cy = y + h * 0.95;
      for (var i = 0; i < bands.length; i++) {
        ctx.strokeStyle = bands[i]; ctx.lineWidth = 14; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(cx, cy, w * 0.42 - i * 15, Math.PI, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = T.spot;
      ctx.beginPath(); ctx.ellipse(x + w * 0.14, y + h * 0.78, 34, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w * 0.86, y + h * 0.78, 34, 20, 0, 0, Math.PI * 2); ctx.fill();
    } }
];
ITEMS = ITEMS.concat(STAGES);

function itemById(id) {
  for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
  return null;
}
function itemsInCat(cat) {
  var out = [];
  for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].cat === cat) out.push(ITEMS[i]);
  return out;
}

/* --------------------------------------------------------------------------
 * 4. Characters — procedural, icon-shaped (mascot recipe, §5 risk table).
 *    drawCharBody(ctx, id, o): o = {pose 0..1, wave 0..1, breath, blink}
 *    Doll-space: origin at hips, head center (0,-100), feet at y≈118.
 * ------------------------------------------------------------------------ */
var CHARS = [
  { id: "violet", name: "Violet" },
  { id: "flex",   name: "Frogmaster Flex" },
  { id: "kellee", name: "Princess Kellee" }
];

function drawArm(ctx, side, lift, wave) {
  /* side −1 left / +1 right; lift 0 = down, 1 = raised (photo pose) */
  ctx.save();
  ctx.translate(side * 30, -34);
  ctx.rotate(side * (0.5 - 1.9 * lift) + (wave ? Math.sin(wave * 14) * 0.25 * side : 0));
  cutPaper(ctx, ellPath(ctx, 0, 20, 8.5, 21), skinFor(curChar), { shadow: false, lw: 2 });
  ctx.restore();
}
var curChar = "violet";   /* set each render pass before arms draw */

function drawCharBody(ctx, id, o) {
  curChar = id;
  var skin = skinFor(id);
  var pose = o.pose || 0;             /* 0..1 arms-up photo pose        */
  var breath = o.breath || 0;         /* ±2% scaleY idle breath         */
  var blink = o.blink != null ? o.blink : 1;  /* 1 open → 0 closed      */
  var wave = o.wave || 0;

  ctx.save();
  ctx.scale(1, breath);

  /* legs */
  cutPaper(ctx, rectPath(ctx, -22, 42, 16, 68, 301, 7), skin);
  cutPaper(ctx, rectPath(ctx, 6, 42, 16, 68, 302, 7), skin);
  /* paper-doll fold tabs at the feet (doctrine brief 7 signature) */
  ctx.fillStyle = C.paper2; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
  [[-14, 1], [14, -1]].forEach(function (tb) {
    ctx.beginPath();
    ctx.moveTo(tb[0] - 20, 112); ctx.lineTo(tb[0] + 20, 112);
    ctx.lineTo(tb[0] + 14 * tb[1], 132); ctx.closePath();
    ctx.fill(); ctx.stroke();
  });

  /* arms behind torso when down; raised arms drawn after head for overlap */
  if (pose < 0.5) { drawArm(ctx, -1, 0, 0); drawArm(ctx, 1, 0, wave); }

  /* torso — soft paper onesie */
  var torso = id === "flex" ? T.frog : C.paper2;
  if (id === "flex") {
    cutPaper(ctx, blobPath(ctx, 0, -8, 34, 46, 303), torso);
    cutPaper(ctx, ellPath(ctx, 0, 2, 22, 32), T.belly, { shadow: false, outline: false });
  } else {
    cutPaper(ctx, blobPath(ctx, 0, -8, 30, 46, 303), torso);
  }

  if (pose >= 0.5) { drawArm(ctx, -1, pose, 0); drawArm(ctx, 1, pose, 0); }

  /* head */
  if (id === "flex") {
    cutPaper(ctx, blobPath(ctx, 0, -102, 46, 38, 304), T.frog);
    /* eye bumps on top of the head (frog canon) */
    cutPaper(ctx, ellPath(ctx, -22, -138, 13, 13), T.frog, { shadow: false });
    cutPaper(ctx, ellPath(ctx, 22, -138, 13, 13), T.frog, { shadow: false });
    ctx.fillStyle = T.spot;
    ctx.beginPath(); ctx.ellipse(-22, -138, 8, 8 * Math.max(0.1, blink), 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, -138, 8, 8 * Math.max(0.1, blink), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink;
    if (blink > 0.4) {
      ctx.beginPath(); ctx.arc(-22, -137, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(22, -137, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-27, -137); ctx.lineTo(-17, -137); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(17, -137); ctx.lineTo(27, -137); ctx.stroke();
    }
    /* wide friendly mouth */
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath();
    if (pose > 0.3) ctx.ellipse(0, -90, 12, 9, 0, 0, Math.PI * 2);
    else ctx.arc(0, -98, 22, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
    /* blush */
    ctx.fillStyle = T.blush; ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.arc(-36, -100, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(36, -100, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    /* his canonical purple scarf (never removed — it's part of him) */
    cutPaper(ctx, blobPath(ctx, 0, -60, 32, 11, 305), C.violet, { shadow: false });
  } else {
    cutPaper(ctx, blobPath(ctx, 0, -100, 42, 40, 306), skin);
    /* eyes — two ellipses with the paired 80ms blink offset handled by o.blink2 */
    var b2 = o.blink2 != null ? o.blink2 : blink;
    ctx.fillStyle = C.ink;
    if (blink > 0.4) {
      ctx.beginPath(); ctx.ellipse(-15, -102, 4.5, 7 * blink, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-20, -102); ctx.lineTo(-10, -102); ctx.stroke();
    }
    if (b2 > 0.4) {
      ctx.beginPath(); ctx.ellipse(15, -102, 4.5, 7 * b2, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(10, -102); ctx.lineTo(20, -102); ctx.stroke();
    }
    /* mouth — one quadratic curve; open smile while posing */
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath();
    if (pose > 0.3) { ctx.arc(0, -86, 8, 0.1 * Math.PI, 0.9 * Math.PI); }
    else { ctx.moveTo(-7, -84); ctx.quadraticCurveTo(0, -78, 7, -84); }
    ctx.stroke();
    /* blush */
    ctx.fillStyle = T.blush; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(-26, -90, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(26, -90, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    /* hair */
    if (id === "violet") {
      var hair = function () {
        ctx.beginPath();
        ctx.arc(0, -104, 43, Math.PI * 0.95, Math.PI * 2.05);
        ctx.quadraticCurveTo(30, -128, 0, -130);
        ctx.quadraticCurveTo(-30, -128, -43, -96);
        ctx.closePath();
      };
      cutPaper(ctx, hair, T.hairV);
      cutPaper(ctx, blobPath(ctx, -46, -96, 9, 20, 307), T.hairV, { shadow: false });
      cutPaper(ctx, blobPath(ctx, 46, -96, 9, 20, 308), T.hairV, { shadow: false });
      cutPaper(ctx, blobPath(ctx, -50, -74, 7, 9, 309), T.hairV, { shadow: false });
      cutPaper(ctx, blobPath(ctx, 50, -74, 7, 9, 310), T.hairV, { shadow: false });
      cutPaper(ctx, starPath(ctx, 44, -86, 6, 5, 311), C.sun, { shadow: false, lw: 1.5 });
    } else { /* kellee — royal bun + tiny baked-in tiara (she's a princess) */
      var hairK = function () {
        ctx.beginPath();
        ctx.arc(0, -104, 43, Math.PI * 0.98, Math.PI * 2.02);
        ctx.quadraticCurveTo(0, -132, -43, -98);
        ctx.closePath();
      };
      cutPaper(ctx, hairK, T.royal);
      cutPaper(ctx, blobPath(ctx, 0, -152, 14, 13, 312), T.royal, { shadow: false });
      cutPaper(ctx, blobPath(ctx, -44, -92, 7, 16, 313), T.royal, { shadow: false });
      cutPaper(ctx, blobPath(ctx, 44, -92, 7, 16, 314), T.royal, { shadow: false });
      /* tiara */
      var tiara = function () {
        ctx.beginPath();
        ctx.moveTo(-12, -146); ctx.lineTo(-9, -158); ctx.lineTo(-3, -149);
        ctx.lineTo(0, -162); ctx.lineTo(3, -149); ctx.lineTo(9, -158);
        ctx.lineTo(12, -146); ctx.closePath();
      };
      cutPaper(ctx, tiara, T.pink, { lw: 1.5 });
    }
  }
  ctx.restore();
}
function skinFor(id) { return id === "flex" ? T.frog : T.skin; }


/* --------------------------------------------------------------------------
 * 5. Sticker pre-render cache — items baked ONCE to offscreen canvases at 2×
 *    (risk table: no per-frame procedural drawing; shadowBlur banned).
 * ------------------------------------------------------------------------ */
var stickerCache = {};
function stickerCanvas(item, tintIdx) {
  var key = item.id + "|" + (tintIdx || 0);
  if (stickerCache[key]) return stickerCache[key];
  var c = document.createElement("canvas");
  c.width = 200; c.height = 200;                        /* 2× of 100 design */
  var g = c.getContext("2d");
  g.translate(100, 100);
  if (item.cat === "stage") {
    g.save();
    rrect(g, -44, -44, 88, 88, 10);
    g.clip();
    item.draw(g, -44, -44, 88, 88);
    g.restore();
    rrect(g, -44, -44, 88, 88, 10);
    g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  } else {
    var tint = item.recolor ? SWATCHES[tintIdx || 0].tint : null;
    item.draw(g, tint);
  }
  stickerCache[key] = c;
  return c;
}

/* Tiny character-face icons for the HUD picker (baked once at 2×). */
var iconCache = {};
function charIcon(id) {
  if (iconCache[id]) return iconCache[id];
  var c = document.createElement("canvas");
  c.width = 112; c.height = 112;
  var g = c.getContext("2d");
  g.translate(56, 58); g.scale(0.95, 0.95);
  if (id === "flex") {
    cutPaper(g, blobPath(g, 0, 4, 40, 34, 401), T.frog);
    cutPaper(g, ellPath(g, -19, -28, 12, 12), T.frog, { shadow: false });
    cutPaper(g, ellPath(g, 19, -28, 12, 12), T.frog, { shadow: false });
    g.fillStyle = T.spot;
    g.beginPath(); g.arc(-19, -28, 7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(19, -28, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(-19, -27, 3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(19, -27, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.lineCap = "round";
    g.beginPath(); g.arc(0, 2, 18, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
    cutPaper(g, blobPath(g, 0, 34, 28, 9, 402), C.violet, { shadow: false });
  } else {
    cutPaper(g, blobPath(g, 0, 4, 36, 34, 403), T.skin);
    g.fillStyle = C.ink;
    g.beginPath(); g.ellipse(-13, 4, 4, 6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(13, 4, 4, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(-6, 18); g.quadraticCurveTo(0, 23, 6, 18); g.stroke();
    g.fillStyle = T.blush; g.globalAlpha = 0.4;
    g.beginPath(); g.arc(-23, 12, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(23, 12, 5, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    var hair = id === "violet" ? T.hairV : T.royal;
    var cap = function () {
      g.beginPath();
      g.arc(0, 0, 37, Math.PI * 0.95, Math.PI * 2.05);
      g.quadraticCurveTo(0, -20, -37, -6);
      g.closePath();
    };
    cutPaper(g, cap, hair);
    if (id === "kellee") {
      var ti = function () {
        g.beginPath();
        g.moveTo(-10, -34); g.lineTo(-7, -45); g.lineTo(-2, -37);
        g.lineTo(0, -48); g.lineTo(2, -37); g.lineTo(7, -45);
        g.lineTo(10, -34); g.closePath();
      };
      cutPaper(g, ti, T.pink, { lw: 1.5 });
    } else {
      cutPaper(g, starPath(g, 32, 6, 6, 5, 404), C.sun, { shadow: false, lw: 1.5 });
    }
  }
  iconCache[id] = c;
  return c;
}

/* --------------------------------------------------------------------------
 * 6. State
 * ------------------------------------------------------------------------ */
var ALBUM_KEY = "vee.arcade.dressup.album";
var harness = VG.createHarness("dressup");

function blankLook() {
  return {
    char: "violet",
    eq: { hat: null, top: null, dress: null, shoes: null, acc: null, stage: "curtains" },
    tints: { hat: 0, top: 0, dress: 0, shoes: 0, acc: 0, stage: 0 }
  };
}

var state = {
  look: blankLook(),
  tab: 0,                       /* CATS index                          */
  swatch: 0,                    /* active SWATCHES index               */
  cursor: { idx: 0 },           /* keyboard cursor inside current tab  */
  pops: {},                     /* cat → {t0} sticker-snap animation   */
  pressed: null,                /* {id, until} button press feedback   */
  paused: false,
  albumOpen: false,
  photo: null,                  /* photo-moment timeline               */
  celebrate: null,
  hintIdx: 0,
  startedAt: 0,
  lastTouch: 0,
  waveUntil: 0,
  blinkNext: 2.5, blinkT: -1, blink2T: -1,
  demoT: 0, demoStep: 0,
  locked: false
};

var album = { looks: [] };
try {
  var raw = localStorage.getItem(ALBUM_KEY);
  if (raw) {
    var parsed = JSON.parse(raw);
    if (parsed && parsed.looks) album.looks = parsed.looks.slice(0, 12);
  }
} catch (e) { /* storage unavailable — album stays empty */ }

function persistAlbum() {
  if (DEMO) return;                                    /* demo never writes */
  try { localStorage.setItem(ALBUM_KEY, JSON.stringify(album)); } catch (e) {}
}

/* --------------------------------------------------------------------------
 * 7. Audio — soft pentatonic loop (96 BPM) + a voice for every touch
 * ------------------------------------------------------------------------ */
var audioOn = false;
function unlockAudio() {
  if (audioOn || DEMO) return;                         /* no gesture in demo */
  audioOn = true;
  S.unlock();
  S.startMusic({ bpm: 96, seed: 21, key: "C" });
}
function sfx(fn) { if (audioOn && !state.paused) fn(); }

/* --------------------------------------------------------------------------
 * 8. Actions — equip, dice, swatch, clear, photo, character switch
 * ------------------------------------------------------------------------ */
function now() { return performance.now(); }

function equipItem(item) {
  if (state.locked || state.paused) return;
  var cat = item.cat;
  if (cat === "stage") {
    state.look.eq.stage = item.id;
    state.pops.stage = { t0: now() };
    sfx(function () { S.whoosh(); });
    touch();
    return;
  }
  if (state.look.eq[cat] === item.id) {                /* tap again = off */
    state.look.eq[cat] = null;
    sfx(function () { S.whoosh(); });
  } else {
    state.look.eq[cat] = item.id;
    state.look.tints[cat] = state.swatch;
    state.pops[cat] = { t0: now() };                   /* sticker snap pop */
    sfx(function () { S.pop(); });
  }
  touch();
}

function diceOutfit() {
  if (state.locked || state.paused) return;
  var cats = ["hat", "top", "dress", "shoes", "acc"];
  var delay = 0, step = VG.Juice.reduced ? 0 : D.timing.stagger;
  for (var i = 0; i < cats.length; i++) {
    var cat = cats[i];
    if (cat === "dress" && Math.random() < 0.25) { schedule(null, cat, delay); continue; }
    var pool = itemsInCat(cat);
    var pick = pool[Math.floor(Math.random() * pool.length)];
    schedule(pick, cat, delay);
    delay += step;                                     /* 60ms stagger cap 500 */
  }
  var stages = itemsInCat("stage");
  state.look.eq.stage = stages[Math.floor(Math.random() * stages.length)].id;
  sfx(function () { S.powerUp(); });
  touch();
}
function schedule(pick, cat, delay) {
  if (delay === 0) { applyPick(pick, cat); return; }
  setTimeout(function () { applyPick(pick, cat); }, delay);
}
function applyPick(pick, cat) {
  state.look.eq[cat] = pick ? pick.id : null;
  state.look.tints[cat] = Math.floor(Math.random() * SWATCHES.length);
  state.pops[cat] = { t0: now() };
  sfx(function () { S.tick(); });
}

function setSwatch(i) {
  if (state.locked) return;
  state.swatch = i;
  var cat = CATS[state.tab].id;                        /* recolor on display */
  if (cat !== "stage" && state.look.eq[cat]) {
    var it = itemById(state.look.eq[cat]);
    if (it && it.recolor) {
      state.look.tints[cat] = i;
      state.pops[cat] = { t0: now() };
    }
  }
  sfx(function () { S.confirm(); });
  touch();
}

function clearOutfit() {
  if (state.locked) return;
  ["hat", "top", "dress", "shoes", "acc"].forEach(function (c) { state.look.eq[c] = null; });
  sfx(function () { S.whoosh(); });
  touch();
}

function setChar(id) {
  if (state.locked || state.look.char === id) return;
  state.look.char = id;
  state.dollBounce = now();
  sfx(function () { S.confirm(); });
  touch();
}

function touch() { state.lastTouch = simNow; }

/* ---- photo moment: pose → flash → polaroid print → celebrate → album ---- */
function takePhoto() {
  if (state.locked || state.paused || state.photo) return;
  state.photo = { t0: now(), look: JSON.parse(JSON.stringify(state.look)), card: null, saved: false };
  state.locked = true;
  sfx(function () { S.pop(); });                       /* shutter            */
}

function updatePhoto() {
  var p = state.photo;
  if (!p) return;
  var t = now() - p.t0;
  if (!p.flashed && t >= 120) {
    p.flashed = true;
    flash.fire(0.08, 70);                              /* camera flash ≤8%   */
  }
  if (!p.card && t >= 480) {                           /* the photo prints   */
    p.card = renderPolaroid(p.look, album.looks.length + 1);
    sfx(function () { S.sticker(); });
  }
  if (!p.celebrated && t >= 700) {
    p.celebrated = true;
    var doll = dollPos();
    state.celebrate = VG.celebrate(fx, {
      cx: doll.x, cy: doll.y - 80,
      note: function (i) { sfx(function () { S.fanfare(i); }); },
      finish: function () { finishPhoto(); }
    });
  }
  if (t > 3400) finishPhoto();                         /* hard safety cap    */
}

function finishPhoto() {
  var p = state.photo;
  if (!p || p.saved) { state.photo = null; state.locked = false; return; }
  p.saved = true;
  if (!DEMO) {
    album.looks.unshift(p.look);
    if (album.looks.length > 12) album.looks.length = 12;
    persistAlbum();
    counter.value = album.looks.length; counter.shown = album.looks.length;
    harness.submitScore(album.looks.length);           /* honest meta-score  */
  }
  state.photo = null;
  state.celebrate = null;
  state.locked = false;
}

/* --------------------------------------------------------------------------
 * 9. Polaroid rendering — the saved look as a paper photo (baked at 2×)
 * ------------------------------------------------------------------------ */
function renderPolaroid(look, n) {
  var c = document.createElement("canvas");
  c.width = 360; c.height = 420;                       /* 180×210 at 2×      */
  var g = c.getContext("2d");
  g.scale(2, 2);
  cutPaper(g, rectPath(g, 4, 4, 172, 202, 501 + n, 8), T.spot, { lw: 2 });
  g.save();
  rrect(g, 14, 14, 152, 140, 6);
  g.clip();
  var st = itemById(look.eq.stage) || STAGES[0];
  st.draw(g, 14, 14, 152, 140);
  g.translate(90, 150);
  g.scale(0.42, 0.42);
  drawDoll(g, look, { pose: 1, noPops: true });
  g.restore();
  txt(g, "Look " + n + " · " + charName(look.char), 90, 182, 18, { align: "center", halo: false });
  return c;
}
function charName(id) {
  for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i].name;
  return "";
}

/* --------------------------------------------------------------------------
 * 10. Doll composite — body + equipped stickers layered by z, with snaps
 * ------------------------------------------------------------------------ */
function tintFor(look, cat) {
  var it = itemById(look.eq[cat]);
  return it && it.recolor ? SWATCHES[look.tints[cat] || 0].tint : null;
}

function drawDoll(ctx, look, o) {
  o = o || {};
  var eq = [];
  ["hat", "top", "dress", "shoes", "acc"].forEach(function (cat) {
    if (look.eq[cat]) {
      var it = itemById(look.eq[cat]);
      if (it) eq.push(it);
    }
  });
  eq.sort(function (a, b) { return a.z - b.z; });

  var i;
  for (i = 0; i < eq.length; i++) if (eq[i].z < 0) drawEq(ctx, look, eq[i], o);
  drawCharBody(ctx, look.char, o);
  for (i = 0; i < eq.length; i++) if (eq[i].z >= 0) drawEq(ctx, look, eq[i], o);
}

function drawEq(ctx, look, it, o) {
  ctx.save();
  ctx.translate(it.ax, it.ay);
  var sc = 1;
  if (!o.noPops) {
    var pop = state.pops[it.cat];
    if (pop) {
      var t = (now() - pop.t0) / 260;                  /* 250ms medium bucket */
      if (t < 1) sc = 0.9 + 0.1 * E.pop(Math.max(0, t));
      else delete state.pops[it.cat];
    }
  }
  if (sc !== 1) ctx.scale(sc, sc);
  it.draw(ctx, tintFor(look, it.cat));
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 11. Canvas, loop, juice FX
 * ------------------------------------------------------------------------ */
var canvas = document.getElementById("stage");
var view = VG.setupCanvas(canvas, { width: CW, height: CH });
var ctx = view.ctx;
var loop, fx;
var pool = new VG.ParticlePool();
var flash = VG.createFlash();
var counter = new VG.ScoreCounter({ ms: 200 });
counter.value = album.looks.length;
counter.shown = album.looks.length;

fx = { loop: { hitStop: function (ms) { loop && loop.hitStop(ms); } },
       flash: flash, particles: pool };

var VS = { s: 1, ox: 0, oy: 0 };                       /* letterbox transform */
var simNow = 0;
var hits = [];                                          /* hit-test regions    */

function dollPos() { return { x: STAGE.x + STAGE.w / 2, y: STAGE.y + STAGE.h - 52 }; }

/* ---- tutorial hints: friendly copy for the first minute (§3f intro beat) -- */
var HINTS = [
  "Hi! I'm Violet! Tap a sticker to dress me up!",
  "Roll the dice for a surprise outfit!",
  "Pick a color, then tap clothes to recolor them!",
  "Press the camera to print a photo for your album!",
  "Try dressing Frogmaster Flex or Princess Kellee!"
];

/* --------------------------------------------------------------------------
 * 12. Rendering
 * ------------------------------------------------------------------------ */
function render() {
  var v = view.view;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, v.w, v.h);

  /* uniform letterbox into the 960×540 design space */
  VS.s = Math.min(v.w / CW, v.h / CH);
  VS.ox = (v.w - CW * VS.s) / 2;
  VS.oy = (v.h - CH * VS.s) / 2;
  ctx.translate(VS.ox, VS.oy);
  ctx.scale(VS.s, VS.s);

  hits = [];
  drawDeskBackground();
  drawHUD();
  drawStage();
  drawPanel();
  drawParticlesAndOverlays();
}

function drawDeskBackground() {
  /* craft desk: cream paper + pre-baked grain + a few crayon doodles */
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, CW, CH);
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = VG.pattern(ctx, "grain", null, 4);
  ctx.fillRect(0, 0, CW, CH);
  ctx.restore();
  VG.crayonStroke(ctx, [[640, 20], [780, 14], [930, 26]], D.inkRGBA(0.5), 2);
  VG.crayonStroke(ctx, [[20, 528], [180, 534], [300, 526]], D.inkRGBA(0.5), 2);
}

function drawHUD() {
  txt(ctx, "Violet's Wardrobe", 22, 40, 28, { weight: 800 });

  /* character picker — three big face buttons */
  for (var i = 0; i < CHARS.length; i++) {
    var bx = 306 + i * 62, by = 38;
    var active = state.look.char === CHARS[i].id;
    var pressed = isPressed("char" + i);
    ctx.save();
    if (pressed) ctx.translate(2, 2);
    if (!pressed) {
      ctx.fillStyle = D.inkRGBA(0.9);
      ctx.beginPath(); ctx.arc(bx + 3, by + 3, 25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = active ? C.sun : C.paper2;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, 25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.drawImage(charIcon(CHARS[i].id), bx - 19, by - 19, 38, 38);
    if (active) {                                     /* shape twin: star   */
      cutPaper(ctx, starPath(ctx, bx + 18, by - 18, 8, 5, 601 + i), C.leaf,
        { shadow: false, lw: 1.5 });
    }
    ctx.restore();
    hits.push({ id: "char" + i, x: bx, y: by, r: 27 });
  }

  /* album badge — polaroid icon + tabular count */
  var ab = { x: 508, y: 12, w: 130, h: 52 };
  pill(ab, "album", C.paper2, function () {
    cutPaper(ctx, rectPath(ctx, ab.x + 12, ab.y + 12, 24, 28, 602, 3), T.spot,
      { lw: 1.5, shadow: false });
    ctx.fillStyle = C.sky;
    ctx.fillRect(ab.x + 16, ab.y + 16, 16, 14);
    counter.update();
    counter.render(ctx, ab.x + 50, ab.y + 27, 26);
  });

  /* Pause & Quit pills (harness contract) */
  pill({ x: 764, y: 12, w: 92, h: 52 }, "pause", C.sun, function (b) {
    txt(ctx, "Pause", b.x + b.w / 2, b.y + b.h / 2, 20, { align: "center", halo: false });
  });
  pill({ x: 866, y: 12, w: 82, h: 52 }, "quit", C.paper2, function (b) {
    txt(ctx, "Quit", b.x + b.w / 2, b.y + b.h / 2, 20, { align: "center", halo: false });
  });
}

/* pill: physical press into the paper (translate + shadow drop, §3e) */
function pill(b, id, fill, content) {
  var pressed = isPressed(id);
  ctx.save();
  var bb = { x: b.x + (pressed ? 2 : 0), y: b.y + (pressed ? 2 : 0), w: b.w, h: b.h };
  if (!pressed) {
    ctx.fillStyle = D.inkRGBA(0.9);
    rrect(ctx, bb.x + 3, bb.y + 3, bb.w, bb.h, 26);
    ctx.fill();
  }
  ctx.fillStyle = pressed ? C.paper3 : fill;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  rrect(ctx, bb.x, bb.y, bb.w, bb.h, 26);
  ctx.fill(); ctx.stroke();
  content(bb);
  ctx.restore();
  hits.push({ id: id, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h, rect: true });
}

function isPressed(id) {
  return state.pressed && state.pressed.id === id && now() < state.pressed.until;
}

function drawStage() {
  VG.washiPanel(ctx, STAGE.x, STAGE.y, STAGE.w, STAGE.h, { tape: T.pink });

  ctx.save();
  rrect(ctx, STAGE.x + 10, STAGE.y + 10, STAGE.w - 20, STAGE.h - 20, 10);
  ctx.clip();

  var st = itemById(state.look.eq.stage) || STAGES[0];
  st.draw(ctx, STAGE.x + 10, STAGE.y + 10, STAGE.w - 20, STAGE.h - 20);

  /* the little spotlight — flat cone + pool, gentle sway (frozen if reduced) */
  var dp = dollPos();
  var sway = VG.Juice.reduced ? 0 : Math.sin(simNow * 0.5) * 6;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = T.spot;
  ctx.beginPath();
  ctx.moveTo(STAGE.x + STAGE.w * 0.5 + sway - 20, STAGE.y + 8);
  ctx.lineTo(STAGE.x + STAGE.w * 0.5 + sway + 20, STAGE.y + 8);
  ctx.lineTo(dp.x + 120, dp.y + 24);
  ctx.lineTo(dp.x - 120, dp.y + 24);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(dp.x, dp.y + 18, 130, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* the doll on her paper stand */
  var bounce = 1;
  if (state.dollBounce) {
    var bt = (now() - state.dollBounce) / 320;
    if (bt < 1) bounce = 1 - 0.1 * Math.sin(bt * Math.PI);
    else state.dollBounce = 0;
  }
  var breath = 1 + D.squash.idleBreath.amp * Math.sin(simNow * Math.PI * 2 / 2.4);
  var blinkV = blinkValue(state.blinkT), blink2V = blinkValue(state.blink2T);
  var pose = state.photo ? 1 : 0;
  var wave = (simNow < state.waveUntil) ? (state.waveUntil - simNow) / 1.2 : 0;

  ctx.save();
  ctx.translate(dp.x, dp.y);
  ctx.scale(1.02 * bounce, 1.02 * (2 - bounce) * breath);
  drawDoll(ctx, state.look, { pose: pose, wave: wave, breath: 1,
                              blink: blinkV, blink2: blink2V });
  ctx.restore();

  ctx.restore();

  /* tutorial hint strip — first minute only, icon + word dual-coded */
  if (!DEMO && simNow - state.startedAt < 60) {
    var hint = HINTS[Math.floor((simNow - state.startedAt) / 12) % HINTS.length];
    var hy = STAGE.y + 14;
    ctx.save();
    ctx.globalAlpha = 0.95;
    cutPaper(ctx, rectPath(ctx, STAGE.x + 40, hy, STAGE.w - 80, 40, 700, 12), C.paper2, { lw: 2 });
    ctx.restore();
    cutPaper(ctx, starPath(ctx, STAGE.x + 66, hy + 20, 9, 5, 701), C.sun, { shadow: false, lw: 1.5 });
    txt(ctx, hint, STAGE.x + STAGE.w / 2 + 10, hy + 21, 18, { align: "center", halo: false, body: true });
  }

  /* the printing polaroid during the photo moment */
  if (state.photo && state.photo.card) {
    var p = state.photo, tt = Math.min(1, (now() - p.t0 - 480) / 450);
    var ease = E.easeOut(tt);
    var dp2 = dollPos();
    var px = dp2.x + 96 + 30 * (1 - ease), py = dp2.y - 210 - 40 * ease;
    var rot = (VG.Juice.reduced ? 0 : -4) + 4 * ease;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot * Math.PI / 180);
    ctx.scale(0.5 + 0.5 * (0.9 + 0.1 * ease), 0.5 + 0.5 * (0.9 + 0.1 * ease));
    ctx.drawImage(p.card, -90, -105, 180, 210);
    ctx.restore();
  }
}

function blinkValue(t) {
  if (t < 0) return 1;
  var dtms = (simNow - t) * 1000;
  if (dtms > D.squash.blink.ms) return 1;
  var half = D.squash.blink.ms / 2;
  return dtms < half ? 1 - dtms / half : (dtms - half) / half;
}

function drawPanel() {
  VG.washiPanel(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, { fill: C.paper2, tape: C.sun });

  /* category tabs — icon + shape twin; active tab gets a star marker */
  var tw = 54, tx = PANEL.x + 12, ty = PANEL.y + 10;
  for (var i = 0; i < CATS.length; i++) {
    var active = i === state.tab;
    var pressed = isPressed("tab" + i);
    var x = tx + i * (tw + 2.4), y = ty + (pressed ? 2 : 0);
    if (!pressed) { ctx.fillStyle = D.inkRGBA(0.9); rrect(ctx, x + 3, y + 3, tw, 42, 10); ctx.fill(); }
    ctx.fillStyle = active ? C.sun : C.paper;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    rrect(ctx, x, y, tw, 42, 10); ctx.fill(); ctx.stroke();
    drawCatIcon(CATS[i].icon, x + tw / 2, y + 21, active);
    if (active) cutPaper(ctx, starPath(ctx, x + tw - 7, y + 7, 6, 5, 710 + i), C.leaf,
      { shadow: false, lw: 1 });
    hits.push({ id: "tab" + i, x: x + tw / 2, y: ty + 21, w: tw, h: 42, rect: true });
  }
  txt(ctx, CATS[state.tab].label, PANEL.x + 16, PANEL.y + 70, 20, { weight: 800 });

  /* item grid — 3×2 cut-paper sticker cells, tap-first big targets */
  var list = itemsInCat(CATS[state.tab].id);
  var cw = 106, ch = 100, gx = PANEL.x + 14, gy = PANEL.y + 86;
  for (i = 0; i < list.length; i++) {
    var cx = gx + (i % 3) * (cw + 6), cy = gy + Math.floor(i / 3) * (ch + 6);
    var it = list[i];
    var equipped = CATS[state.tab].id === "stage"
      ? state.look.eq.stage === it.id
      : state.look.eq[it.cat] === it.id;
    var pressed = isPressed("item" + it.id);
    var y = cy + (pressed ? 2 : 0);

    if (!pressed) { ctx.fillStyle = D.inkRGBA(0.9); rrect(ctx, cx + 3, y + 3, cw, ch, 10); ctx.fill(); }
    ctx.fillStyle = equipped ? "#F3EBD2" : C.paper;   /* paper tinted toward sun */
    ctx.strokeStyle = equipped ? C.leaf : C.ink;
    ctx.lineWidth = equipped ? 3 : 2;
    rrect(ctx, cx, y, cw, ch, 10); ctx.fill(); ctx.stroke();

    var tintIdx = equipped ? (state.look.tints[it.cat] || 0) : state.swatch;
    ctx.drawImage(stickerCanvas(it, it.recolor ? tintIdx : 0), cx + 5, y + 2, 96, 96);

    if (equipped) {                                   /* shape twin: leaf check */
      cutPaper(ctx, starPath(ctx, cx + cw - 12, cy + 12, 9, 5, 720 + i), C.leaf, { lw: 1.5 });
    }
    if (i === state.cursor.idx) {
      ctx.save();                                     /* keyboard focus ring */
      ctx.strokeStyle = C.violet; ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      rrect(ctx, cx - 4, cy - 4, cw + 8, ch + 8, 12);
      ctx.stroke();
      ctx.restore();
    }
    hits.push({ id: "item" + it.id, x: cx + cw / 2, y: cy + ch / 2, w: cw, h: ch,
                rect: true, item: it });
  }

  /* color swatches — first swatch is "Original" with a paper dot twin */
  var sy = PANEL.y + 310;
  txt(ctx, "Colors", PANEL.x + 16, sy + 16, 18, { body: true });
  for (i = 0; i < SWATCHES.length; i++) {
    var sx = PANEL.x + 96 + i * 44;
    var sel = i === state.swatch;
    var pp = isPressed("swatch" + i);
    ctx.save();
    if (pp) ctx.translate(2, 2);
    if (!pp) { ctx.fillStyle = D.inkRGBA(0.9); ctx.beginPath(); ctx.arc(sx + 3, sy + 19, 16, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = SWATCHES[i].tint || C.paper;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy + 16, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (i === 0) { ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx - 6, sy + 22); ctx.lineTo(sx + 6, sy + 10); ctx.stroke(); }
    if (sel) cutPaper(ctx, starPath(ctx, sx + 12, sy + 4, 7, 5, 730 + i), C.sun, { shadow: false, lw: 1 });
    ctx.restore();
    hits.push({ id: "swatch" + i, x: sx, y: sy + 16, r: 18 });
  }

  /* dice + camera + clear — the delight row (≥56px targets) */
  roundBtn(PANEL.x + 60, PANEL.y + 384, 34, "dice", C.sun, function (bx, by) {
    drawDie(bx, by);
  });
  roundBtn(PANEL.x + 140, PANEL.y + 384, 34, "photo", C.violet, function (bx, by) {
    drawCamera(bx, by);
  });
  pill({ x: PANEL.x + 190, y: PANEL.y + 356, w: 156, h: 56 }, "clear", C.paper2, function (b) {
    txt(ctx, "Clear", b.x + b.w / 2, b.y + b.h / 2, 20, { align: "center", halo: false });
  });
  txt(ctx, "Surprise!", PANEL.x + 60, PANEL.y + 428, 18, { align: "center", halo: false, color: C.inkSoft, body: true });
  txt(ctx, "Photo!", PANEL.x + 140, PANEL.y + 428, 18, { align: "center", halo: false, color: C.inkSoft, body: true });
}

function roundBtn(cx, cy, r, id, fill, icon) {
  var pressed = isPressed(id);
  ctx.save();
  var x = cx + (pressed ? 2 : 0), y = cy + (pressed ? 2 : 0);
  if (!pressed) { ctx.fillStyle = D.inkRGBA(0.9); ctx.beginPath(); ctx.arc(x + 3, y + 3, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = pressed ? C.paper3 : fill;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  icon(x, y);
  ctx.restore();
  hits.push({ id: id, x: cx, y: cy, r: r + 4 });
}

function drawDie(x, y) {
  cutPaper(ctx, rectPath(ctx, x - 14, y - 14, 28, 28, 740, 7), T.spot, { shadow: false, lw: 2 });
  ctx.fillStyle = C.ink;
  [[-7, -7], [7, -7], [0, 0], [-7, 7], [7, 7]].forEach(function (p) {
    ctx.beginPath(); ctx.arc(x + p[0], y + p[1], 2.6, 0, Math.PI * 2); ctx.fill();
  });
}
function drawCamera(x, y) {
  cutPaper(ctx, rectPath(ctx, x - 16, y - 10, 32, 22, 741, 5), T.spot, { shadow: false, lw: 2 });
  cutPaper(ctx, rectPath(ctx, x - 7, y - 15, 14, 7, 742, 2), T.spot, { shadow: false, lw: 2 });
  ctx.fillStyle = C.sky; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y + 1, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function drawCatIcon(kind, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.42, 0.42);
  switch (kind) {
    case "hat":
      cutPaper(ctx, ellPath(ctx, 0, 8, 26, 8), C.violet, { shadow: false, lw: 3 });
      cutPaper(ctx, blobPath(ctx, 0, -4, 16, 14, 750), C.violet, { shadow: false, lw: 3 });
      break;
    case "top":
      cutPaper(ctx, rectPath(ctx, -18, -16, 36, 34, 751, 8), C.leaf, { shadow: false, lw: 3 });
      cutPaper(ctx, blobPath(ctx, -24, -8, 7, 9, 752), C.leaf, { shadow: false, lw: 3 });
      cutPaper(ctx, blobPath(ctx, 24, -8, 7, 9, 753), C.leaf, { shadow: false, lw: 3 });
      break;
    case "dress":
      var sk = function () {
        ctx.beginPath();
        ctx.moveTo(-12, -16); ctx.lineTo(12, -16);
        ctx.quadraticCurveTo(26, 16, 18, 20); ctx.quadraticCurveTo(0, 26, -18, 20);
        ctx.quadraticCurveTo(-26, 16, -12, -16); ctx.closePath();
      };
      cutPaper(ctx, sk, T.pink, { shadow: false, lw: 3 });
      break;
    case "shoes":
      cutPaper(ctx, rectPath(ctx, -22, -6, 20, 16, 754, 5), C.berry, { shadow: false, lw: 3 });
      cutPaper(ctx, rectPath(ctx, 4, -6, 20, 16, 755, 5), C.berry, { shadow: false, lw: 3 });
      break;
    case "acc":
      cutPaper(ctx, starPath(ctx, 0, 0, 18, 5, 756), C.sun, { shadow: false, lw: 3 });
      break;
    case "stage":
      cutPaper(ctx, rectPath(ctx, -22, -16, 44, 32, 757, 6), C.sky, { shadow: false, lw: 3 });
      cutPaper(ctx, ellPath(ctx, 0, 10, 12, 6), C.leaf, { shadow: false, lw: 3 });
      break;
  }
  ctx.restore();
}

function drawParticlesAndOverlays() {
  pool.render(ctx);
  flash.render(ctx, CW, CH);

  if (state.albumOpen) drawAlbumOverlay();
  if (state.paused) drawPauseOverlay();
  if (DEMO) drawDemoBanner();
}

function drawAlbumOverlay() {
  ctx.fillStyle = D.inkRGBA(0.35);
  ctx.fillRect(0, 0, CW, CH);
  var card = { x: 130, y: 60, w: 700, h: 420 };
  ctx.fillStyle = D.inkRGBA(0.9);
  rrect(ctx, card.x + 4, card.y + 4, card.w, card.h, 16); ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  rrect(ctx, card.x, card.y, card.w, card.h, 16); ctx.fill(); ctx.stroke();
  txt(ctx, "My Sticker Album", card.x + 24, card.y + 36, 28, { weight: 800 });

  if (album.looks.length === 0) {
    txt(ctx, "No photos yet — press the camera to save a look!",
      card.x + card.w / 2, card.y + card.h / 2, 20, { align: "center", body: true, halo: false });
  } else {
    var n = Math.min(album.looks.length, 8);
    for (var i = 0; i < n; i++) {
      var px = card.x + 44 + (i % 4) * 160, py = card.y + 66 + Math.floor(i / 4) * 168;
      var pressed = isPressed("look" + i);
      ctx.save();
      if (pressed) ctx.translate(2, 2);
      ctx.translate(px + 62, py + 72);
      ctx.rotate(((i % 2 === 0 ? -2 : 2) * Math.PI) / 180);
      ctx.drawImage(albumThumb(i), -62, -72, 124, 145);
      ctx.restore();
      hits.push({ id: "look" + i, x: px + 62, y: py + 72, w: 124, h: 145, rect: true, idx: i });
    }
  }
  txt(ctx, "Tap a photo to wear it again!", card.x + 24, card.y + card.h - 30, 18,
    { color: C.inkSoft, body: true, halo: false });
  pill({ x: card.x + card.w - 130, y: card.y + 14, w: 112, h: 48 }, "albumClose", C.berry,
    function (b) { txt(ctx, "Close", b.x + b.w / 2, b.y + b.h / 2, 18,
      { align: "center", halo: false, color: C.paper }); });
}

var thumbCache = {};
function albumThumb(i) {
  if (thumbCache[i]) return thumbCache[i];
  var look = album.looks[i];
  var c = renderPolaroid(look, album.looks.length - i);
  thumbCache[i] = c;
  return c;
}

function drawPauseOverlay() {
  ctx.fillStyle = D.inkRGBA(0.35);
  ctx.fillRect(0, 0, CW, CH);
  var card = { x: 310, y: 170, w: 340, h: 200 };
  ctx.fillStyle = D.inkRGBA(0.9);
  rrect(ctx, card.x + 4, card.y + 4, card.w, card.h, 16); ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  rrect(ctx, card.x, card.y, card.w, card.h, 16); ctx.fill(); ctx.stroke();
  txt(ctx, "Paused", card.x + card.w / 2, card.y + 44, 30, { align: "center", weight: 800 });
  pill({ x: card.x + 40, y: card.y + 90, w: 120, h: 56 }, "resume", C.leaf, function (b) {
    txt(ctx, "Play", b.x + b.w / 2, b.y + b.h / 2, 20, { align: "center", halo: false });
  });
  pill({ x: card.x + 180, y: card.y + 90, w: 120, h: 56 }, "quit", C.paper2, function (b) {
    txt(ctx, "Quit", b.x + b.w / 2, b.y + b.h / 2, 20, { align: "center", halo: false });
  });
}

function drawDemoBanner() {
  ctx.save();
  ctx.globalAlpha = 0.85;
  cutPaper(ctx, rectPath(ctx, CW / 2 - 130, CH - 46, 260, 34, 760, 17), C.paper2, { lw: 2 });
  ctx.restore();
  txt(ctx, "Violet's Wardrobe — tap to play!", CW / 2, CH - 28, 18,
    { align: "center", halo: false, body: true });
}

/* --------------------------------------------------------------------------
 * 13. Update — idle life (breath/blink/wave), photo timeline, demo autopilot
 * ------------------------------------------------------------------------ */
function update(dt) {
  simNow += dt;
  if (state.paused) return;

  /* blink scheduling: every 3–5s, paired eyes offset 80ms (§3b) */
  if (simNow >= state.blinkNext) {
    state.blinkT = simNow;
    state.blink2T = simNow + D.squash.blink.eyeOffsetMs / 1000;
    state.blinkNext = simNow + 3 + Math.random() * 2;
  }

  /* mascot wave if untouched for 15s (she must feel alive) */
  if (!DEMO && simNow - state.lastTouch > 15 && simNow > state.waveUntil + 4) {
    state.waveUntil = simNow + 1.2;
    state.lastTouch = simNow - 8;                     /* wave again in ~8s  */
  }

  updatePhoto();
  if (state.celebrate) state.celebrate.update();
  pool.update(dt);

  if (DEMO) demoAutopilot(dt);
}

/* ---- demo mode: the studio dresses itself; alive in any 30s window ------ */
var demoTimer = 0, demoClock = 0;
function demoAutopilot(dt) {
  demoClock += dt;
  if (demoClock >= 27.5) {                            /* soft reset, loop on */
    demoClock = 0;
    clearOutfit();
    var chars = CHARS.map(function (c) { return c.id; });
    state.look.char = chars[Math.floor(Math.random() * chars.length)];
    state.look.eq.stage = STAGES[Math.floor(Math.random() * STAGES.length)].id;
    return;
  }
  demoTimer += dt;
  if (demoTimer < 2.2) return;
  demoTimer = 0;
  state.demoStep++;

  var worn = ["hat", "top", "dress", "shoes", "acc"].filter(function (c) { return state.look.eq[c]; }).length;
  if (state.demoStep % 7 === 6 && worn >= 2) { takePhoto(); return; }
  var roll = Math.random();
  if (roll < 0.34) {
    var ci = Math.floor(Math.random() * 5);
    state.tab = ci;
    var pool2 = itemsInCat(CATS[ci].id);
    equipItem(pool2[Math.floor(Math.random() * pool2.length)]);
  } else if (roll < 0.52) {
    diceOutfit();
  } else if (roll < 0.68) {
    setSwatch(Math.floor(Math.random() * SWATCHES.length));
  } else if (roll < 0.84) {
    state.tab = (state.tab + 1) % 5;
  } else {
    setChar(CHARS[Math.floor(Math.random() * CHARS.length)].id);
  }
}

/* --------------------------------------------------------------------------
 * 14. Input — tap-first pointer handling + full keyboard parity (§3g)
 * ------------------------------------------------------------------------ */
function hitAt(x, y) {
  for (var i = hits.length - 1; i >= 0; i--) {
    var h = hits[i];
    if (h.r != null) {
      var dx = x - h.x, dy = y - h.y;
      if (dx * dx + dy * dy <= h.r * h.r) return h;
    } else if (Math.abs(x - h.x) <= h.w / 2 && Math.abs(y - h.y) <= h.h / 2) return h;
  }
  return null;
}

canvas.addEventListener("pointerdown", function (e) {
  e.preventDefault();
  unlockAudio();
  if (DEMO) return;                                   /* attract mode is hands-off */
  var rect = canvas.getBoundingClientRect();
  var x = (e.clientX - rect.left - VS.ox) / VS.s;
  var y = (e.clientY - rect.top - VS.oy) / VS.s;

  if (state.celebrate) { state.celebrate.skip(); return; }   /* consent rule */

  var h = hitAt(x, y);
  if (!h) return;
  state.pressed = { id: h.id, until: now() + 120 };   /* 90–120ms press state */
  activate(h);
});

function activate(h) {
  if (h.id === "quit") {
    sfx(function () { S.confirm(); });
    harness.gameQuit(album.looks.length);
    return;
  }
  if (state.paused) {
    if (h.id === "resume" || h.id === "pause") togglePause();
    else if (h.id === "quit") { harness.gameQuit(album.looks.length); }
    return;
  }
  if (state.albumOpen) {
    if (h.id === "albumClose") { state.albumOpen = false; sfx(function () { S.tick(); }); return; }
    if (h.id.indexOf("look") === 0) {
      var look = album.looks[h.idx];
      if (look) {
        state.look = JSON.parse(JSON.stringify(look));
        thumbCache = {};
        sfx(function () { S.sticker(); });
        ["hat", "top", "dress", "shoes", "acc"].forEach(function (c) { state.pops[c] = { t0: now() }; });
      }
      state.albumOpen = false;
      touch();
      return;
    }
    return;
  }
  if (h.id === "pause") { togglePause(); return; }
  if (h.id === "album") { state.albumOpen = true; sfx(function () { S.tick(); }); return; }
  if (h.id.indexOf("char") === 0) { setChar(CHARS[+h.id.slice(4)].id); return; }
  if (h.id.indexOf("tab") === 0) {
    var t = +h.id.slice(3);
    if (t !== state.tab) { state.tab = t; state.cursor.idx = 0; sfx(function () { S.tick(); }); }
    touch();
    return;
  }
  if (h.item) { equipItem(h.item); return; }
  if (h.id.indexOf("swatch") === 0) { setSwatch(+h.id.slice(6)); return; }
  if (h.id === "dice") { diceOutfit(); return; }
  if (h.id === "photo") { takePhoto(); return; }
  if (h.id === "clear") { clearOutfit(); return; }
}

function togglePause() {
  state.paused = !state.paused;
  if (state.paused) { if (audioOn) S.stopMusic(); sfx(function () { S.tick(); }); }
  else if (audioOn) S.startMusic({ bpm: 96, seed: 21, key: "C" });
}

var input = VG.createInput({
  actions: {
    left:  ["ArrowLeft", "a", "A"],
    right: ["ArrowRight", "d", "D"],
    up:    ["ArrowUp", "w", "W"],
    down:  ["ArrowDown", "s", "S"],
    action:["Enter", "z", "Z"],
    dice:  ["r", "R"],
    photo: ["f", "F"],
    clear: ["c", "C"],
    album: ["b", "B"],
    char1: ["1"], char2: ["2"], char3: ["3"],
    pause: ["Escape", "p", "P"]
  }
});
input.onAny(function () { unlockAudio(); });
input.onAction(function (a) {
  if (DEMO) return;
  if (state.celebrate) { state.celebrate.skip(); return; }
  var list = itemsInCat(CATS[state.tab].id);
  switch (a) {
    case "left":
      state.cursor.idx = (state.cursor.idx - 1 + list.length) % list.length;
      sfx(function () { S.tick(); }); touch();
      break;
    case "right":
      state.cursor.idx = (state.cursor.idx + 1) % list.length;
      sfx(function () { S.tick(); }); touch();
      break;
    case "up":
      state.tab = (state.tab - 1 + CATS.length) % CATS.length;
      state.cursor.idx = 0; sfx(function () { S.tick(); }); touch();
      break;
    case "down":
      state.tab = (state.tab + 1) % CATS.length;
      state.cursor.idx = 0; sfx(function () { S.tick(); }); touch();
      break;
    case "action":
      if (state.paused) { togglePause(); break; }
      if (state.albumOpen) { state.albumOpen = false; break; }
      equipItem(list[state.cursor.idx % list.length]);
      break;
    case "dice": diceOutfit(); break;
    case "photo": takePhoto(); break;
    case "clear": clearOutfit(); break;
    case "album":
      state.albumOpen = !state.albumOpen;
      sfx(function () { S.tick(); });
      break;
    case "char1": setChar("violet"); break;
    case "char2": setChar("flex"); break;
    case "char3": setChar("kellee"); break;
    case "pause": togglePause(); break;
  }
});

/* --------------------------------------------------------------------------
 * 15. Boot
 * ------------------------------------------------------------------------ */
state.startedAt = 0;
state.lastTouch = 0;
loop = VG.createLoop({
  update: function (dt) { update(dt); },
  render: function () { render(); }
});
loop.start();
state.startedAt = simNow;
state.lastTouch = simNow;
})();
