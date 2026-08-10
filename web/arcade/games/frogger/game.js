/* ============================================================================
 * Puddle Hopper — a craft-table Frogger for Vee Arcade (DESIGN-BIBLE §4.3)
 *
 * Violet hops across a craft-table scene: gray construction-paper roads with
 * crayon dashes, toy-block cars on wheels, a torn blue tissue-paper river
 * with drifting logs / friendly turtles / lily pads, and 4 puddle homes to
 * fill. Palette: sky + leaf on cream; berry reserved for the "oops" dizzy.
 *
 * Built ON the engine (vee-game.js / vee-sfx.js) — never reimplements it.
 * All sprites cached to offscreen canvases at load; grain comes from the
 * engine's pre-rendered pattern; wobble is seeded and stable.
 * ========================================================================== */
(function () {
"use strict";

function start(canvas, opts) {
  opts = opts || {};
  var VG = window.VeeGame, D = VG.DESIGN, C = D.colors, SFX = window.VeeSFX;
  var DEMO = opts.mode === "demo";
  var harness = VG.createHarness("frogger");
  if (DEMO) SFX.setMuted(true);                       /* screensaver stays silent */

  /* ------------------------------------------- design-space geometry ---- */
  var W = 960, H = 632, COLS = 16, CELL = 60, ROWS = 12, ROW_H = 48, HUD_H = 56;
  function rowY(r)  { return H - (r + 1) * ROW_H; }   /* top of row r */
  function rowCY(r) { return rowY(r) + ROW_H / 2; }
  function colX(c)  { return c * CELL + CELL / 2; }
  var RIVER_TOP = rowY(10), RIVER_BOT = rowY(7) + ROW_H;   /* 104 … 296 */
  var ROAD_TOP = rowY(5), ROAD_BOT = rowY(1) + ROW_H;      /* 344 … 584 */

  var cv = VG.setupCanvas(canvas, { width: W, height: H });
  var ctx = cv.ctx, view = cv.view;

  var particles = new VG.ParticlePool();
  var shake = VG.createShake();
  var flash = VG.createFlash();
  var input = VG.createInput();
  var score = new VG.ScoreCounter();

  /* ------------------------------------------------- run / level state -- */
  var mode = "title";                 /* title | play | oops | clear | over */
  var paused = false;
  var level = 1, lives = 3, gameTime = 0, maxRow = 0;
  var muted = false, musicOn = false;
  var oopsT = 0, oopsReason = "", overTimer = 0, demoT = 0;
  var celebrating = null, cardAnim = null;
  var lanes = [], drifts = [], flies = [], homes = [], popups = [], ripples = [];
  var flyTimer = 3, aiTimer = 0, aiDir = null, aiShiftT = 0;
  var dbg = { splash: 0, car: 0, homes: 0, hops: 0, splashRows: {}, lastDir: "" };

  var SHAPES = ["star", "tri", "sq", "circ"];         /* colorblind home marks */
  var HOME_X = [90, 330, 630, 870];

  /* ------------------------------------------------------- easing bits -- */
  var E = D.easing;
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ============================================================
   * Sprite cache — every static drawing baked to offscreen canvas ONCE
   * (§5 risk table: no per-frame procedural drawing, no shadowBlur).
   * ========================================================== */
  var SPR = 2;                                          /* bake at 2× for crisp DPI */
  function cacheSprite(w, h, fn) {
    var c = document.createElement("canvas");
    c.width = Math.ceil(w * SPR); c.height = Math.ceil(h * SPR);
    var g = c.getContext("2d");
    g.scale(SPR, SPR);
    fn(g, w, h);
    return { c: c, w: w, h: h };
  }
  function blit(g, sp, x, y, rot, sx, sy) {
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.scale(sx || 1, sy || 1);
    g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    g.restore();
  }
  function starPath(g, x, y, r, n, inner) {
    g.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var rr = i % 2 === 0 ? r : r * (inner || 0.45);
      var a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  }
  function heartPath(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.62);
    g.bezierCurveTo(x - s, y - s * 0.1, x - s * 0.6, y - s * 0.9, x, y - s * 0.28);
    g.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s, y - s * 0.1, x, y + s * 0.62);
    g.closePath();
  }
  function drawShapeIcon(g, shape, x, y, s, fill) {
    g.save();
    g.fillStyle = fill || C.ink;
    if (shape === "star") { starPath(g, x, y, s); g.fill(); }
    else if (shape === "tri") {
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.95, y + s * 0.8);
      g.lineTo(x - s * 0.95, y + s * 0.8); g.closePath(); g.fill();
    } else if (shape === "sq") {
      g.save(); g.translate(x, y); g.rotate(0.06);
      g.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); g.restore();
    } else { g.beginPath(); g.arc(x, y, s * 0.85, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }

  var sprites = {};
  function buildSprites() {
    /* --- toy-block cars: one cached sprite per lane ---------------------- */
    var decals = ["star", "stripes", "dots", "zig", "box"];
    var fills  = [C.sun, C.sky, C.violet, C.leaf, C.paper2];
    for (var li = 0; li < 5; li++) {
      (function (li) {
        var len = LANE_DEFS[li].len, fill = fills[li], decal = decals[li];
        sprites["car" + li] = cacheSprite(len + 20, 66, function (g, w, h) {
          var cx = w / 2, by = 26;
          /* 4-layer recipe via engine: shadow → fill → grain → outline */
          VG.drawSprite(g, { x: cx, y: by, w: len, h: 34, fill: fill,
            seed: "car" + li, texture: "grain", radius: 8, scale: 1 });
          /* window — a lighter cut-paper square */
          g.fillStyle = C.paper;
          g.strokeStyle = C.ink; g.lineWidth = 1.5;
          g.beginPath();
          if (g.roundRect) g.roundRect(cx - len * 0.18, by - 11, len * 0.3, 13, 4);
          else g.rect(cx - len * 0.18, by - 11, len * 0.3, 13);
          g.fill(); g.stroke();
          /* decal — shape redundancy for colorblind readers */
          g.save();
          if (decal === "star") {
            drawShapeIcon(g, "star", cx - len * 0.32, by + 2, 7, C.ink);
          } else if (decal === "stripes") {
            g.strokeStyle = C.ink; g.lineWidth = 2; g.globalAlpha = 0.55;
            for (var s = 0; s < 3; s++) {
              g.beginPath();
              g.moveTo(cx + len * 0.14 + s * 8, by + 12);
              g.lineTo(cx + len * 0.24 + s * 8, by - 12);
              g.stroke();
            }
          } else if (decal === "dots") {
            g.fillStyle = C.ink; g.globalAlpha = 0.55;
            for (var d = 0; d < 3; d++) {
              g.beginPath(); g.arc(cx - len * 0.34 + d * 10, by + 6, 2.4, 0, Math.PI * 2); g.fill();
            }
          } else if (decal === "zig") {
            g.strokeStyle = C.ink; g.lineWidth = 2; g.globalAlpha = 0.6;
            g.beginPath();
            g.moveTo(cx - len * 0.4, by + 8);
            for (var z = 0; z < 4; z++) {
              g.lineTo(cx - len * 0.4 + z * 8 + 4, by + (z % 2 ? 8 : 0));
            }
            g.stroke();
          } /* "box" decal = the cardboard truck gets halftone flaps */
          g.restore();
          /* wheels — ink tires, paper hubs (hard toy-ness) */
          for (var wi = 0; wi < 2; wi++) {
            var wx = cx + (wi === 0 ? -len * 0.3 : len * 0.3), wy = 48;
            g.fillStyle = C.ink;
            g.beginPath(); g.arc(wx, wy, 8.5, 0, Math.PI * 2); g.fill();
            g.fillStyle = C.paper;
            g.beginPath(); g.arc(wx, wy, 3.2, 0, Math.PI * 2); g.fill();
          }
        });
      })(li);
    }

    /* --- cardboard drift logs ------------------------------------------- */
    sprites.log = cacheSprite(196, 56, function (g, w, h) {
      var cx = w / 2, cy = h / 2 - 2;
      VG.drawSprite(g, { x: cx, y: cy, w: 176, h: 30, fill: C.paper3,
        seed: "log", texture: "grain", radius: 14, scale: 1 });
      /* flute lines — corrugated craft roll */
      g.save();
      g.strokeStyle = C.inkSoft; g.lineWidth = 1.5; g.globalAlpha = 0.4;
      for (var i = 0; i < 6; i++) {
        var fx = cx - 70 + i * 28;
        g.beginPath(); g.moveTo(fx, cy - 12); g.lineTo(fx - 6, cy + 12); g.stroke();
      }
      /* spiral end cap */
      g.globalAlpha = 0.7; g.strokeStyle = C.ink; g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx + 82, cy, 9, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx + 82, cy, 4.5, 0, Math.PI * 1.6); g.stroke();
      g.restore();
    });

    /* --- friendly turtles (normal + the 1-in-8 golden variant) ---------- */
    function turtleSprite(gold) {
      return cacheSprite(158, 52, function (g, w, h) {
        for (var t = 0; t < 3; t++) {
          var tx = 28 + t * 50, ty = h / 2 + 2;
          /* shadow pass */
          g.fillStyle = D.inkRGBA(0.9);
          g.beginPath(); g.ellipse(tx + 3, ty + 7, 19, 12, 0, 0, Math.PI * 2); g.fill();
          /* little feet nubs */
          g.fillStyle = gold ? C.sun : C.leaf;
          for (var f = -1; f <= 1; f += 2) {
            g.beginPath(); g.ellipse(tx + f * 12, ty + 11, 5, 4, 0, 0, Math.PI * 2); g.fill();
          }
          /* head */
          g.beginPath(); g.arc(tx + 22, ty - 2, 7, 0, Math.PI * 2);
          g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
          g.fillStyle = C.ink;
          g.beginPath(); g.arc(tx + 24, ty - 3, 1.4, 0, Math.PI * 2); g.fill();
          /* shell */
          g.fillStyle = gold ? C.sun : C.leaf;
          VG.wobblyBlobPath(g, tx, ty, 19, 13, "turt" + (gold ? "g" : "n") + t, 7);
          g.fill();
          if (gold) {                                 /* golden sparkle mark */
            g.fillStyle = C.paper; starPath(g, tx - 4, ty - 3, 5); g.fill();
            g.strokeStyle = C.ink; g.lineWidth = 2;
          } else {
            g.strokeStyle = C.inkSoft; g.lineWidth = 1.5;   /* shell seams */
            g.beginPath(); g.moveTo(tx - 8, ty - 8); g.lineTo(tx + 6, ty + 6); g.stroke();
            g.beginPath(); g.moveTo(tx + 8, ty - 8); g.lineTo(tx - 4, ty + 6); g.stroke();
            g.strokeStyle = C.ink; g.lineWidth = 2;
          }
          VG.wobblyBlobPath(g, tx, ty, 19, 13, "turt" + (gold ? "g" : "n") + t, 7);
          g.stroke();
        }
      });
    }
    sprites.turtle = turtleSprite(false);
    sprites.turtleGold = turtleSprite(true);

    /* --- lily pad: green circle with notch + darker vein ---------------- */
    sprites.pad = cacheSprite(66, 60, function (g, w, h) {
      var cx = w / 2, cy = h / 2;
      g.fillStyle = D.inkRGBA(0.9);
      g.beginPath(); g.ellipse(cx + 3, cy + 5, 26, 19, 0, 0, Math.PI * 2); g.fill();
      var notch = -0.5;
      g.fillStyle = C.leaf;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, 26, notch, Math.PI * 2 - 0.35);
      g.closePath(); g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
      /* vein — darker quadratic from notch toward rim */
      g.strokeStyle = C.inkSoft; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + 2, cy);
      g.quadraticCurveTo(cx - 8, cy - 10, cx - 18, cy - 8);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + 2, cy);
      g.quadraticCurveTo(cx - 4, cy + 10, cx - 14, cy + 12);
      g.stroke();
      /* one highlight stroke at 30% warm-white */
      g.strokeStyle = "rgba(255,252,245,0.3)"; g.lineWidth = 2.5;
      g.beginPath(); g.arc(cx - 4, cy - 5, 15, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    });

    /* --- Violet's body: 3px hero outline (doctrine outline hierarchy) --- */
    sprites.violet = cacheSprite(58, 54, function (g, w, h) {
      VG.drawSprite(g, { x: w / 2, y: h / 2 + 2, w: 44, h: 38, blob: true,
        fill: C.violet, seed: "violet", outlineWidth: 3, points: 9, scale: 1 });
      /* two little ear tufts */
      g.fillStyle = C.violet; g.strokeStyle = C.ink; g.lineWidth = 2.5;
      for (var e = -1; e <= 1; e += 2) {
        g.beginPath();
        g.moveTo(w / 2 + e * 12, 12);
        g.quadraticCurveTo(w / 2 + e * 18, 1, w / 2 + e * 19, 13);
        g.closePath(); g.fill(); g.stroke();
      }
    });

    /* --- sticker hearts -------------------------------------------------- */
    sprites.heart = cacheSprite(34, 32, function (g, w, h) {
      g.fillStyle = D.inkRGBA(0.9);
      heartPath(g, w / 2 + 2.5, h / 2 + 2.5, 13); g.fill();
      g.fillStyle = C.violet;
      heartPath(g, w / 2, h / 2, 13); g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "rgba(255,252,245,0.5)"; g.lineWidth = 2;
      g.beginPath(); g.arc(w / 2 - 5, h / 2 - 5, 4, Math.PI * 0.9, Math.PI * 1.5); g.stroke();
    });
    sprites.heartEmpty = cacheSprite(34, 32, function (g, w, h) {
      g.fillStyle = C.paper3;
      heartPath(g, w / 2, h / 2, 13); g.fill();
      g.strokeStyle = C.inkSoft; g.lineWidth = 2; g.setLineDash([4, 4]);
      g.stroke(); g.setLineDash([]);
    });
  }

  /* ============================================================
   * Static background — baked ONCE to an offscreen canvas.
   * Craft-table scene: cream paper, gray construction-paper roads
   * with crayon dashes, torn tissue river, meadow strips.
   * ========================================================== */
  var bg = null;
  function buildBackground() {
    bg = document.createElement("canvas");
    bg.width = W * SPR; bg.height = H * SPR;
    var g = bg.getContext("2d");
    g.scale(SPR, SPR);

    /* cream paper + grain (engine pattern, generated once) */
    g.fillStyle = C.paper;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.14;
    g.fillStyle = VG.pattern(g, "grain", null, 7);
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    /* HUD band */
    g.fillStyle = C.paper2;
    g.fillRect(0, 0, W, HUD_H);
    VG.crayonStroke(g, [[6, HUD_H - 3], [W - 6, HUD_H - 3]], C.inkSoft, 2);

    /* ---- home ledge (row 11): leaf-tinted meadow paper ----------------- */
    g.fillStyle = C.leaf; g.globalAlpha = 0.22;
    g.fillRect(0, HUD_H, W, ROW_H);
    g.globalAlpha = 1;
    for (var t = 0; t < 14; t++) {
      VG.wobblyBlobPath(g, 30 + t * 70, HUD_H + ROW_H - 4, 22, 12, "tuft" + t, 6);
      g.fillStyle = C.leaf; g.globalAlpha = 0.5; g.fill();
    }
    g.globalAlpha = 1;
    /* paper sun watching over the homes */
    VG.drawSprite(g, { x: W - 46, y: HUD_H + 26, w: 34, h: 34, blob: true,
      fill: C.sun, seed: "homesun", scale: 1, highlight: false });

    /* ---- the river: torn blue tissue paper with fiber edges ------------ */
    g.fillStyle = C.sky;
    g.fillRect(0, RIVER_TOP, W, RIVER_BOT - RIVER_TOP);
    /* tissue fiber streaks (static — baked, never shimmering) */
    g.strokeStyle = C.paper; g.lineWidth = 2;
    var frnd = VG.mulberry32(99);
    for (var f = 0; f < 26; f++) {
      var fy = RIVER_TOP + 10 + frnd() * (RIVER_BOT - RIVER_TOP - 20);
      var fx = frnd() * W, fw = 30 + frnd() * 70;
      g.globalAlpha = 0.12 + frnd() * 0.1;
      g.beginPath(); g.moveTo(fx, fy);
      g.quadraticCurveTo(fx + fw / 2, fy + (frnd() - 0.5) * 6, fx + fw, fy);
      g.stroke();
    }
    g.globalAlpha = 1;
    /* torn edges — paper blobs biting into the tissue, both banks */
    for (var e2 = 0; e2 < 16; e2++) {
      VG.wobblyBlobPath(g, e2 * 64 + 20, RIVER_TOP - 2, 34, 12, "tornT" + e2, 7);
      g.fillStyle = C.leaf; g.globalAlpha = 0.24; g.fill();
      g.globalAlpha = 1; g.fillStyle = C.paper;
      VG.wobblyBlobPath(g, e2 * 64 + 44, RIVER_TOP - 1, 26, 8, "tornT2" + e2, 6);
      g.fill();
      VG.wobblyBlobPath(g, e2 * 64 + 10, RIVER_BOT + 2, 32, 11, "tornB" + e2, 7);
      g.fill();
    }
    /* fiber fringe — tiny ink-soft hairs along the tear */
    g.strokeStyle = C.inkSoft; g.lineWidth = 1; g.globalAlpha = 0.35;
    for (var hf = 0; hf < 40; hf++) {
      var hx = hf * 24 + (hf % 3) * 5;
      g.beginPath(); g.moveTo(hx, RIVER_TOP);
      g.lineTo(hx + 3, RIVER_TOP + 5 + (hf % 4)); g.stroke();
      g.beginPath(); g.moveTo(hx + 12, RIVER_BOT);
      g.lineTo(hx + 9, RIVER_BOT - 5 - (hf % 3)); g.stroke();
    }
    g.globalAlpha = 1;

    /* ---- island (row 6): picnic paper strip ----------------------------- */
    g.fillStyle = C.paper3;
    g.fillRect(0, rowY(6), W, ROW_H);
    VG.crayonStroke(g, [[4, rowY(6) + 4], [W - 4, rowY(6) + 4]], C.inkSoft, 2);
    VG.crayonStroke(g, [[4, rowY(6) + ROW_H - 4], [W - 4, rowY(6) + ROW_H - 4]], C.inkSoft, 2);
    /* crumbs + a button (craft props, 1px background outlines) */
    g.fillStyle = C.inkSoft; g.globalAlpha = 0.4;
    for (var cb = 0; cb < 10; cb++) {
      g.beginPath(); g.arc(60 + cb * 96, rowCY(6) + (cb % 2 ? 8 : -9), 2, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = C.inkSoft; g.lineWidth = 1.5;
    g.beginPath(); g.arc(500, rowCY(6), 8, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(497, rowCY(6), 1.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(503, rowCY(6), 1.5, 0, Math.PI * 2); g.stroke();

    /* ---- the road (rows 1–5): gray construction paper ------------------ */
    g.fillStyle = C.paper3;
    g.fillRect(0, ROAD_TOP, W, ROAD_BOT - ROAD_TOP);
    g.fillStyle = D.inkRGBA(0.1);                     /* plum-tinted gray */
    g.fillRect(0, ROAD_TOP, W, ROAD_BOT - ROAD_TOP);
    g.globalAlpha = 0.1;
    g.fillStyle = VG.pattern(g, "grain", null, 21);
    g.fillRect(0, ROAD_TOP, W, ROAD_BOT - ROAD_TOP);
    g.globalAlpha = 1;
    /* crayon-drawn dashes down each lane's center */
    for (var lr = 1; lr <= 5; lr++) {
      var dy = rowCY(lr);
      for (var dsh = 0; dsh < 10; dsh++) {
        VG.crayonStroke(g,
          [[dsh * 100 + 18, dy], [dsh * 100 + 62, dy + (dsh % 2 ? 1 : -1)]],
          C.paper, 3);
      }
    }
    /* road edges */
    VG.crayonStroke(g, [[0, ROAD_TOP + 2], [W, ROAD_TOP + 2]], C.inkSoft, 2);
    VG.crayonStroke(g, [[0, ROAD_BOT - 2], [W, ROAD_BOT - 2]], C.inkSoft, 2);

    /* ---- start meadow (row 0) ------------------------------------------ */
    g.fillStyle = C.leaf; g.globalAlpha = 0.26;
    g.fillRect(0, ROAD_BOT, W, H - ROAD_BOT);
    g.globalAlpha = 1;
    for (var gt = 0; gt < 13; gt++) {
      VG.wobblyBlobPath(g, 20 + gt * 78, ROAD_BOT + 6, 24, 13, "grass" + gt, 6);
      g.fillStyle = C.leaf; g.globalAlpha = 0.55; g.fill();
    }
    g.globalAlpha = 1;
    /* little paper flowers */
    for (var fl = 0; fl < 5; fl++) {
      var fx2 = 90 + fl * 200, fy2 = H - 18;
      g.fillStyle = C.sun;
      for (var p = 0; p < 5; p++) {
        var pa = (p / 5) * Math.PI * 2;
        g.beginPath(); g.arc(fx2 + Math.cos(pa) * 4, fy2 + Math.sin(pa) * 4, 3, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = C.paper;
      g.beginPath(); g.arc(fx2, fy2, 2.6, 0, Math.PI * 2); g.fill();
    }
  }

  /* ============================================================
   * Level construction — lanes, river drift, homes, flies
   * ========================================================== */
  var LANE_DEFS = [
    { row: 1, dir:  1, speed: 52, gap: 320, len: 70 },
    { row: 2, dir: -1, speed: 66, gap: 360, len: 96 },
    { row: 3, dir:  1, speed: 58, gap: 300, len: 62 },
    { row: 4, dir: -1, speed: 74, gap: 400, len: 106 },
    { row: 5, dir:  1, speed: 48, gap: 340, len: 84 }
  ];
  var RIVER_DEFS = [
    { row: 7,  kind: "log",    dir:  1, speed: 40, gap: 230, len: 176 },
    { row: 8,  kind: "turtle", dir: -1, speed: 52, gap: 240, len: 150 },
    { row: 9,  kind: "pad",    dir:  1, speed: 30, gap: 140, len: 52 },
    { row: 10, kind: "log",    dir: -1, speed: 46, gap: 235, len: 176 }
  ];

  function speedScale() { return Math.min(1.5, 1 + 0.08 * (level - 1)); }   /* +8%/tier */

  function setupLevel() {
    lanes = [];
    for (var i = 0; i < LANE_DEFS.length; i++) {
      var def = LANE_DEFS[i];
      var lane = { def: def, cars: [], timer: 0.5 + i * 0.4 };
      /* pre-place traffic mid-screen so level start never ambushes */
      var n = Math.max(2, Math.floor(W / def.gap));
      for (var cIdx = 0; cIdx < n; cIdx++) {
        lane.cars.push({
          x: ((cIdx + 0.5) / n) * W + (cIdx % 2 ? 40 : -40),
          state: "run", teleT: 0
        });
      }
      lanes.push(lane);
    }
    drifts = [];
    for (var r = 0; r < RIVER_DEFS.length; r++) {
      var rd = RIVER_DEFS[r];
      if (rd.kind === "pad") {
        for (var p2 = 0; p2 < 8; p2++) {
          drifts.push({ row: rd.row, kind: "pad", x: 40 + p2 * 140, w: 52,
            v: rd.dir * rd.speed * speedScale(), seed: p2, gold: false });
        }
      } else {
        var dn = Math.max(2, Math.floor(W / rd.gap));
        for (var d2 = 0; d2 < dn; d2++) {
          drifts.push(makeDrift(rd, ((d2 + 0.5) / dn) * W + (d2 % 2 ? 60 : -60)));
        }
      }
    }
    homes = [];
    for (var hI = 0; hI < 4; hI++) {
      homes.push({ x: HOME_X[hI], shape: SHAPES[hI], filled: false, popT: 0 });
    }
    flies = [];
    flyTimer = 2.5;
    popups = []; ripples = [];
  }
  function makeDrift(rd, x) {
    /* 1-in-8 golden turtle — the rarity-tier treat (§5 celebration table) */
    var gold = rd.kind === "turtle" && Math.random() < 0.125;
    return { row: rd.row, kind: rd.kind, x: x, w: rd.len,
      v: rd.dir * rd.speed * speedScale(), gold: gold, goldClaimed: false,
      seed: Math.floor(Math.random() * 999) };
  }

  /* ============================================================
   * Violet — the hopper
   * ========================================================== */
  var ANT = 0.09, AIR = 0.30, LAND_DOWN = 0.08, LAND_REC = 0.16;   /* doctrine squash table */
  var v = {
    col: 7, row: 0, x: colX(7), y: rowCY(0),
    phase: "idle", t: 0, fx: 0, fy: 0, tx: 0, ty: 0, hopDir: "up",
    facing: 1, sx: 1, sy: 1,
    blinkAt: 2.5, blinkT: -1,
    scarf: [], grace: 0, lastDrift: null
  };
  function resetViolet(row) {
    v.row = row; v.col = 7; v.x = colX(7); v.y = rowCY(row);
    v.phase = "idle"; v.t = 0; v.sx = 1; v.sy = 1; v.grace = 0; v.lastDrift = null;
    for (var i = 0; i < 4; i++) v.scarf[i] = { x: v.x, y: v.y };
  }

  function beginHop(dir) {
    if (v.phase !== "idle" || mode !== "play") return;
    var dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    var dr = dir === "up" ? 1 : dir === "down" ? -1 : 0;
    var nc = Math.max(0, Math.min(COLS - 1, v.col + dc));
    var nr = Math.max(0, Math.min(ROWS - 1, v.row + dr));
    if (nc === v.col && nr === v.row) return;           /* wall bump — ignore */
    v.hopDir = dir;
    dbg.hops++;
    if (dc !== 0) v.facing = dc;
    v.fx = v.x; v.fy = v.y;
    v.tx = colX(nc); v.ty = rowCY(nr);
    v.col = nc; v.row = nr;
    v.phase = "antic"; v.t = 0;
  }

  function finishHop() {
    v.x = v.tx; v.y = v.ty;
    v.phase = "land"; v.t = 0;
    if (!DEMO) SFX.land();
    dust(v.x, v.y + 16, 4);
    /* progress points — honest, first time each row this life */
    if (v.row > maxRow) { score.add(10 * (v.row - maxRow)); maxRow = v.row; }
    /* homes */
    if (v.row === 11) {
      for (var hI = 0; hI < homes.length; hI++) {
        var hm = homes[hI];
        if (!hm.filled && Math.abs(v.x - hm.x) < 38) { fillHome(hm); break; }
      }
    }
    /* river landing: attach to whatever is under her (generous overlap) */
    if (v.row >= 7 && v.row <= 10) {
      var under = driftUnder(v.x, v.row, 12);
      if (under) {
        v.lastDrift = under; v.grace = 0;
        if (under.gold && !under.goldClaimed) {
          under.goldClaimed = true;
          score.add(150); popup(v.x, v.y - 30, "+150 golden ride!");
          if (!DEMO) SFX.powerUp();
          particles.burst("spark", v.x, v.y);
        }
      } else {
        splashOops();
        return;
      }
    }
    collectFlies();
  }

  function fillHome(hm) {
    hm.filled = true; hm.popT = 0.001;
    dbg.homes++;
    score.add(500);
    popup(hm.x, rowY(11) + 6, "+500 Home sweet home!");
    if (!DEMO) SFX.sticker();
    particles.burst("spark", hm.x, rowCY(11));
    var all = true;
    for (var i = 0; i < homes.length; i++) if (!homes[i].filled) all = false;
    if (all) startClear();
  }

  function collectFlies() {
    for (var i = flies.length - 1; i >= 0; i--) {
      var fl = flies[i];
      if (Math.abs(fl.x - v.x) < 44 && Math.abs(fl.y - v.y) < 40) {
        flies.splice(i, 1);
        score.add(100);
        popup(fl.x, fl.y - 16, "+100 Snacky!");
        if (!DEMO) SFX.coin();
        particles.burst("spark", fl.x, fl.y);
      }
    }
  }

  /* ------------------------------------------------- gentle failure ---- */
  function oops(reason) {
    if (mode !== "play") return;
    mode = "oops"; oopsT = 0; oopsReason = reason;
    if (reason === "water") { dbg.splash++; dbg.splashRows[v.row] = (dbg.splashRows[v.row] || 0) + 1; }
    else dbg.car++;
    lives--;
    if (!DEMO) SFX.gentleFail();                        /* a sigh, never a buzz */
    if (reason === "water") {
      splashFX(v.x, v.y);
      if (!DEMO) splashSFX();
    }
  }
  function splashOops() { oops("water"); }
  function splashFX(x, y) {
    ripples.push({ x: x, y: y, t: 0 });
    particles.spawn(6, { x: x, y: y, kind: "spark", speed: 90, ttl: 0.55,
      size: 3.5, color: C.sky, gravity: 300, up: 130 });
  }
  function splashSFX() {                                /* filtered noise + sine */
    SFX.voice({ noise: true, filter: { type: "lowpass", freq: 900, to: 280 }, dur: 0.28, gain: 0.2 });
    SFX.voice({ type: "sine", freq: 520, to: 170, dur: 0.22, gain: 0.1 });
  }
  function respawn() {
    var checkpoint = v.row >= 6 ? 6 : 0;                /* start of CURRENT section */
    maxRow = checkpoint;
    resetViolet(checkpoint);
    if (!DEMO) SFX.confirm();
    mode = "play";
  }
  function gameOver() {
    mode = "over";
    if (!DEMO) {
      SFX.failureChord();                               /* warm I chord, no sting */
      var res = harness.submitScore(score.value);
      harness.gameEnded(score.value);
      $("#finalScore").textContent = String(score.value);
      $("#bestLine").textContent = res.newRecord
        ? "A brand-new best! ✶" : "Best so far: " + res.best;
      show("#ovlOver");
    } else {
      overTimer = 1.4;                                  /* demo quietly resets */
    }
  }

  /* ------------------------------------------------- level clear ------- */
  function startClear() {
    mode = "clear";
    score.add(1000);
    popup(W / 2, rowCY(9), "+1000");
    shake.trigger(3, 180);                              /* good-event shake only */
    celebrating = VG.celebrate(
      { loop: loop, particles: particles, flash: flash },
      {
        cx: W / 2, cy: H * 0.42,
        note: function (i) { if (!DEMO) SFX.fanfare(i); },
        card: function (o) { cardAnim = { t0: performance.now(), ms: o.ms, rise: o.rise }; },
        finish: function () {
          celebrating = null; cardAnim = null;
          level++;
          setupLevel();
          resetViolet(0); maxRow = 0;
          mode = "play";
          startMusicForLevel();
        }
      }
    );
  }

  /* ------------------------------------------------- helpers ----------- */
  function driftUnder(x, row, pad) {
    for (var i = 0; i < drifts.length; i++) {
      var d = drifts[i];
      if (d.row !== row) continue;
      if (Math.abs(d.x - x) < d.w / 2 + (pad || 0)) return d;
    }
    return null;
  }
  function dust(x, y, n) {
    if (VG.Juice.reduced) n = Math.ceil(n / 2);
    particles.spawn(n, { x: x, y: y, kind: "spark", speed: 55, ttl: 0.45,
      size: 3, color: C.paper3, gravity: 140, up: 46, angle: -Math.PI / 2, spread: 2.2 });
  }
  function popup(x, y, txt) { popups.push({ x: x, y: y, txt: txt, t: 0 }); }

  function startMusicForLevel() {
    if (DEMO || muted || !musicOn) return;
    /* engine pentatonic loop: 100 BPM; doctrine: +1 semitone every 3 levels */
    SFX.startMusic({ bpm: 100, seed: 7 + level, tier: Math.floor((level - 1) / 3), key: "C" });
    if (level >= 4) SFX.hurry();                        /* later levels get the hurry */
  }

  /* ------------------------------------------------- title motif (D2) --- */
  /* Sparse ~90 BPM, 2-voice lullaby for the title card — soft enough to
     sit under conversation; rides the engine music bus. Starts only on
     first user interaction (autoplay policy), never in demo mode. */
  var MOTIF_MELODY = [392, 0, 523, 0, 440, 0, 392, 0, 330, 0, 392, 0, 523, 0, 440, 0];
  var MOTIF_BASS   = [131, 0, 0, 0, 196, 0, 0, 0];
  var motifTimer = 0, motifStep = 0, motifNext = 0;

  function startMenuMotif() {
    if (DEMO || muted) return;
    var c = SFX.ensure();
    if (!c) return;
    stopMenuMotif();
    motifStep = 0;
    motifNext = c.currentTime + 0.15;
    motifTimer = window.setInterval(scheduleMotif, 120);
    scheduleMotif();
  }
  function stopMenuMotif() {
    if (motifTimer) { window.clearInterval(motifTimer); motifTimer = 0; }
  }
  function scheduleMotif() {
    var c = SFX.ctx;
    if (!c || muted) { stopMenuMotif(); return; }
    var eighth = 60 / 90 / 2;                           /* ~90 BPM */
    while (motifNext < c.currentTime + 0.3) {
      var t = motifNext - c.currentTime;
      var s = motifStep % 16;
      var mel = MOTIF_MELODY[s];
      if (mel) SFX.voice({ type: "triangle", freq: mel, dur: eighth * 1.8, gain: 0.34, attack: 0.02, delay: t, bus: "music" });
      var bass = MOTIF_BASS[s % 8];
      if (bass) SFX.voice({ type: "sine", freq: bass, dur: eighth * 3.2, gain: 0.4, attack: 0.02, delay: t, bus: "music" });
      motifNext += eighth;
      motifStep++;
    }
  }

  /* ============================================================
   * Fixed-timestep update
   * ========================================================== */
  function laneDangerAt(row, x, tAhead) {
    if (row < 1 || row > 5) return false;
    var lane = lanes[row - 1];
    var sp = lane.def.speed * speedScale();
    for (var i = 0; i < lane.cars.length; i++) {
      var car = lane.cars[i];
      var cx = car.state === "tele" ? car.x : car.x + lane.def.dir * sp * tAhead;
      if (Math.abs(cx - x) < lane.def.len * 0.4 + 24) return true;
    }
    return false;
  }

  function update(dt) {
    score.update();
    if (paused) return;                                 /* the world holds its breath */
    gameTime += dt;
    particles.update(dt);
    for (var pi = popups.length - 1; pi >= 0; pi--) {
      popups[pi].t += dt;
      if (popups[pi].t > 0.9) popups.splice(pi, 1);
    }
    for (var ri = ripples.length - 1; ri >= 0; ri--) {
      ripples[ri].t += dt;
      if (ripples[ri].t > 0.8) ripples.splice(ri, 1);
    }
    for (var hh = 0; hh < homes.length; hh++) {
      if (homes[hh].popT > 0 && homes[hh].popT < 1) homes[hh].popT += dt * 3;
    }

    /* blink scheduling (§3b: 3–5s, 140ms, paired eyes offset 80ms) */
    if (v.blinkT >= 0) { v.blinkT += dt; if (v.blinkT > 0.22) { v.blinkT = -1; v.blinkAt = gameTime + 3 + Math.random() * 2; } }
    else if (gameTime >= v.blinkAt) v.blinkT = 0;

    updateTraffic(dt);
    updateDrifts(dt);
    updateFlies(dt);

    if (mode === "play") updatePlay(dt);
    else if (mode === "oops") {
      oopsT += dt;
      if (oopsT >= 1.25) {
        if (lives <= 0) gameOver(); else respawn();
      }
    } else if (mode === "clear") {
      if (celebrating) celebrating.update(dt * 1000);
    } else if (mode === "over" && DEMO) {
      overTimer -= dt;
      if (overTimer <= 0) { softResetRun(); }
    }
    if (DEMO && mode === "play") {
      demoT += dt;
      if (opts.loopSeconds) {
        /* 30s attract loop: reset at a clean beat (back at the start
           meadow) — or, failing that, bow out and begin anew at 4× */
        var tidy = v.row === 0 && v.phase === "idle";
        if ((demoT >= opts.loopSeconds && tidy) || demoT >= opts.loopSeconds * 4) {
          softResetRun();
        }
      }
    }
  }

  function softResetRun() {
    level = 1; lives = 3; score.value = 0; score.shown = 0;
    demoT = 0; setupLevel(); resetViolet(0); maxRow = 0; mode = "play";
  }

  function updateTraffic(dt) {
    var sc = speedScale();
    for (var li = 0; li < lanes.length; li++) {
      var lane = lanes[li], def = lane.def, sp = def.speed * sc;
      for (var ci = lane.cars.length - 1; ci >= 0; ci--) {
        var car = lane.cars[ci];
        if (car.state === "tele") {
          /* 300ms bounce-anticipation telegraph at the screen edge (§4.3) */
          car.teleT += dt;
          if (car.teleT >= 0.3) car.state = "run";
        } else {
          car.x += def.dir * sp * dt;
          if ((def.dir > 0 && car.x > W + def.len) || (def.dir < 0 && car.x < -def.len)) {
            lane.cars.splice(ci, 1);
          }
        }
      }
      /* spawn — only when the entry zone is clear */
      lane.timer -= dt;
      if (lane.timer <= 0) {
        lane.timer = (def.gap / sp) * (0.85 + Math.random() * 0.5);
        /* parked half-in view at the edge, visibly eager to go */
        var edge = def.dir > 0 ? def.len / 2 - 8 : W - def.len / 2 + 8;
        var clear = true;
        for (var c2 = 0; c2 < lane.cars.length; c2++) {
          if (Math.abs(lane.cars[c2].x - edge) < def.len + 40) clear = false;
        }
        if (clear) lane.cars.push({ x: edge, state: "tele", teleT: 0 });
      }
    }
  }

  function updateDrifts(dt) {
    for (var di = drifts.length - 1; di >= 0; di--) {
      var d = drifts[di];
      if (d.kind === "pad") continue;                   /* pads wrap below */
      d.x += d.v * dt;
      var margin = d.w / 2 + 30;
      if ((d.v > 0 && d.x > W + margin) || (d.v < 0 && d.x < -margin)) {
        /* recycle off-screen drift; turtles re-roll the golden chance */
        var rd = null;
        for (var r = 0; r < RIVER_DEFS.length; r++) if (RIVER_DEFS[r].row === d.row) rd = RIVER_DEFS[r];
        var nd = makeDrift(rd, d.v > 0 ? -rd.len / 2 - 10 : W + rd.len / 2 + 10);
        drifts.splice(di, 1, nd);
      }
    }
    /* lily pads drift as a loose chain and wrap */
    for (var p = 0; p < drifts.length; p++) {
      var pd = drifts[p];
      if (pd.kind !== "pad") continue;
      pd.x += pd.v * dt;
      if (pd.x > W + 60) pd.x -= W + 120;
      if (pd.x < -60) pd.x += W + 120;
    }
  }

  function updateFlies(dt) {
    flyTimer -= dt;
    if (flyTimer <= 0 && flies.length < 2 && mode !== "title") {
      flyTimer = 5 + Math.random() * 4;
      var row = 7 + Math.floor(Math.random() * 4);
      flies.push({ x: 80 + Math.random() * (W - 160), baseY: rowCY(row) - 6,
        y: rowCY(row) - 6, t: Math.random() * 10, ttl: 14 });
    }
    for (var i = flies.length - 1; i >= 0; i--) {
      var fl = flies[i];
      fl.t += dt; fl.ttl -= dt;
      fl.y = fl.baseY + Math.sin(fl.t * 2.4) * 7;
      fl.x += Math.sin(fl.t * 0.9) * 12 * dt;
      if (fl.ttl <= 0) flies.splice(i, 1);
    }
  }

  function updatePlay(dt) {
    /* ------------------------------ hop timeline ----------------------- */
    if (v.phase === "antic") {
      v.t += dt;
      if (v.t >= ANT) {
        v.phase = "air"; v.t = 0;
        if (!DEMO) { SFX.jump(); SFX.whoosh(); }        /* the pop + whoosh */
        dust(v.fx, v.fy + 16, 2);
      }
    } else if (v.phase === "air") {
      v.t += dt;
      if (v.t >= AIR) finishHop();
    } else if (v.phase === "land") {
      v.t += dt;
      if (v.t >= LAND_DOWN + LAND_REC) v.phase = "idle";
    }

    if (mode !== "play") return;                        /* finishHop may oops/clear */

    /* ------------------------------ grounded logic ---------------------- */
    if (v.phase === "idle") {
      /* input: 120ms buffered hops (§3f-5) */
      if (!DEMO) {
        if (input.consumeBuffered("up")) beginHop("up");
        else if (input.consumeBuffered("left")) beginHop("left");
        else if (input.consumeBuffered("right")) beginHop("right");
        else if (input.consumeBuffered("down")) beginHop("down");
      } else if (aiDir) {
        /* last-instant veto, timed from THIS instant: she takes ~0.39s to
           decide+hop before landing, so predictions made at decision time
           go stale — re-validate at the exact moment of takeoff */
        var wantRow = v.row + (aiDir === "up" ? 1 : aiDir === "down" ? -1 : 0);
        if (aiSafe(wantRow, snapHopX(v.row, aiDir), ANT + AIR)) {
          dbg.lastDir = aiDir + "@r" + v.row + "x" + Math.round(v.x);
          beginHop(aiDir);
        }
        aiDir = null;
      }

      /* riding: carried by drift; 250ms platform grace (§3f-5).
         Carry tolerance matches landing tolerance — no 6px window of doom. */
      if (v.phase === "idle" && v.row >= 7 && v.row <= 10) {
        var under = driftUnder(v.x, v.row, 12);
        if (under) { v.lastDrift = under; v.grace = 0; }
        else if (v.lastDrift && v.grace < 0.25 && driftUnder(v.lastDrift.x, v.row, 0)) {
          v.grace += dt; under = v.lastDrift;
        } else { splashOops(); return; }
        v.x += under.v * dt;
        v.col = Math.max(0, Math.min(COLS - 1, Math.floor(v.x / CELL)));
        if (v.x < -14 || v.x > W + 14) { splashOops(); return; }
      }
    }

    /* ------------------------------ toy-block collisions ---------------- */
    /* generous: ~20% shrunk boxes, checked only when she's actually there
       (idle/land — never during wind-up or flight) */
    if ((v.phase === "idle" || v.phase === "land") &&
        v.row >= 1 && v.row <= 5) {
      var lane = lanes[v.row - 1], def = lane.def;
      for (var ci = 0; ci < lane.cars.length; ci++) {
        var car = lane.cars[ci];
        var halfCar = def.len * 0.4;                    /* 80% of visual half */
        if (Math.abs(car.x - v.x) < halfCar + 14) {     /* violet half 17.6 → 14 */
          oops("car");
          return;
        }
      }
    }
  }

  /* ============================================================
   * Autopilot — the attract demo plays itself.
   * Predicts where Violet will LAND (drift carry + hop airtime),
   * never hops blindly into the home row, and nudges sideways on
   * drifting rides to line up with the nearest open home.
   * ========================================================== */
  var AIR_PLUS = AIR + ANT + 0.2;                     /* takeoff → landing */
  var AI_BEAT = 0.2;                                  /* decision cadence */
  /* beginHop snaps the landing to the grid column — predictions must use
     that exact snapped x, never her continuous drift position */
  function snapHopX(row, dir) {
    var dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    var nc = Math.max(0, Math.min(COLS - 1, v.col + dc));
    return colX(nc);
  }
  function driftAtT(row, x, t) {
    for (var i = 0; i < drifts.length; i++) {
      var d = drifts[i];
      if (d.row !== row) continue;
      if (Math.abs(d.x + d.v * t - x) < d.w / 2 + 10) return d;
    }
    return null;
  }
  function landDrift(row, x, t) {
    if (row < 7 || row > 10) return null;
    /* a hop releases the current ride: she lands exactly where she aimed,
       t seconds from now. The ride must be there at the landing instant AND
       persist a beat after (else she drifts off the tail and splashes). */
    return driftAtT(row, x, t) && driftAtT(row, x, t + 0.35);
  }
  function laneClear(row, x, t) {
    if (row < 1 || row > 5) return true;
    /* she lands t from now — check the landing instant + a beat after */
    return !laneDangerAt(row, x, t) && !laneDangerAt(row, x, t + 0.5);
  }
  function aiSafe(row, xx, t) {
    if (row >= 1 && row <= 5) return laneClear(row, xx, t);
    if (row >= 7 && row <= 10) return !!landDrift(row, xx, t);
    return true;                                        /* meadow / island */
  }
  function autopilot(dt) {
    if (mode !== "play" || v.phase !== "idle") return;
    aiTimer -= dt;
    if (aiTimer > 0) return;
    aiTimer = AI_BEAT;
    aiDir = aiDecide();
    if (!aiDir) {
      /* stuck waiting on a ride? shuffle along it toward the middle —
         only ever into a spot that is itself safe */
      aiShiftT -= AI_BEAT;
      if (aiShiftT <= 0 && v.row >= 7 && v.row <= 10) {
        aiShiftT = 0.9;
        var want = v.x < W / 2 ? "right" : "left";
        var nx = snapHopX(v.row, want);
        if (nx > 0 && nx < W && aiSafe(v.row, nx, AIR_PLUS)) aiDir = want;
      }
    } else aiShiftT = 0.9;
  }
  function aiDecide() {
    var r = v.row, x = v.x;
    if (r === 11) {
      /* step straight back down into the river and sweep to the next home —
         recrossing the whole road every time is a waste of good hopping */
      var below = snapHopX(r, "down");
      if (landDrift(10, below, ANT + AIR)) return "down";
      return null;
    }
    /* corridor strategy: row 10 sweeps LEFT, row 9 sweeps RIGHT.
       Collect homes in the direction the water carries her; if she
       overshoots, edge-escape drops her a row to ride back around. */
    var targetX = null, hI;
    if (r === 10) {
      for (hI = homes.length - 1; hI >= 0; hI--) {
        if (!homes[hI].filled && homes[hI].x <= x + 40) { targetX = homes[hI].x; break; }
      }
      if (targetX == null) {
        for (hI = 0; hI < homes.length; hI++)
          if (!homes[hI].filled) { targetX = homes[hI].x; break; }
      }
    } else if (r === 9) {
      for (hI = 0; hI < homes.length; hI++) {
        if (!homes[hI].filled && homes[hI].x >= x - 40) { targetX = homes[hI].x; break; }
      }
      if (targetX == null) {
        for (hI = 0; hI < homes.length; hI++)
          if (!homes[hI].filled) { targetX = homes[hI].x; break; }
      }
    } else {
      var bd = 1e9;
      for (hI = 0; hI < homes.length; hI++) {
        if (homes[hI].filled) continue;
        var dd = Math.abs(homes[hI].x - x);
        if (dd < bd) { bd = dd; targetX = homes[hI].x; }
      }
    }
    if (targetX == null) return null;

    /* escape urgency when drifting toward an edge */
    var onDrift = (r >= 7 && r <= 10) ? driftUnder(x, r, 12) : null;
    var escaping = false;
    if (onDrift) {
      var distToExit = onDrift.v > 0 ? W - x : x;
      escaping = distToExit < 150;
    }
    var cands = [];
    if (r < 11) {
      /* an up-hop lands at the snapped current column, NOT her drift x */
      var upX = snapHopX(r, "up");
      if (r === 9 || r === 10) {
        /* row 9 is the rightward return lane and row 10 leads to the homes:
           ONLY hop up from them when aligned with an open home — otherwise
           she bounces between rides and makes no progress */
        var aligned = false;
        for (var hI = 0; hI < homes.length; hI++) {
          if (!homes[hI].filled && Math.abs(homes[hI].x - upX) < 30) aligned = true;
        }
        if (aligned) cands.push(["up", r + 1, upX, 20]);
      } else {
        cands.push(["up", r + 1, upX, 10]);
      }
    }
    if (v.col > 0) cands.push(["left", r, snapHopX(r, "left"), 5 - Math.abs(snapHopX(r, "left") - targetX) * 0.004 + (escaping && x > W / 2 ? 3 : 0)]);
    if (v.col < COLS - 1) cands.push(["right", r, snapHopX(r, "right"), 5 - Math.abs(snapHopX(r, "right") - targetX) * 0.004 + (escaping && x < W / 2 ? 3 : 0)]);
    if (r > 0) cands.push(["down", r - 1, snapHopX(r, "down"), escaping ? 4 : 1.5]);   /* never auto-drop into the river */
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!aiSafe(c[1], c[2], AIR_PLUS)) continue;
      if (!best || c[3] > best[3]) best = c;
    }
    if (best) return best[0];
    return null;                                        /* wait it out */
  }

  /* ============================================================
   * Render
   * ========================================================== */
  var lastK = 1, lastOx = 0, lastOy = 0;
  function F(size, weight) {
    return (weight || 700) + " " + size + "px 'Baloo 2','Fredoka','Comic Sans MS','Chalkboard SE',sans-serif";
  }

  function render() {
    var w = view.w, h = view.h;
    var k = Math.min(w / W, h / H);
    var ox = (w - W * k) / 2, oy = (h - H * k) / 2;
    lastK = k; lastOx = ox; lastOy = oy;

    /* letterbox bars — warm paper, never black */
    ctx.fillStyle = C.paper3;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(k, k);
    var off = shake.offset();
    ctx.translate(off[0], off[1]);

    ctx.drawImage(bg, 0, 0, W, H);

    drawHomes();
    drawDrifts();
    drawFlies();
    drawCars();
    drawViolet();
    particles.render(ctx);
    drawRipples();
    drawPopups();
    drawHUD();
    if (DEMO) drawMarquee();
    if (cardAnim) drawClearCard();
    flash.render(ctx, W, H);
    ctx.restore();
  }

  /* ------------------------------------------------- world drawing ----- */
  function drawHomes() {
    for (var i = 0; i < homes.length; i++) {
      var hm = homes[i], cx = hm.x, cy = rowCY(11);
      var pop = 1;
      if (hm.popT > 0 && hm.popT < 1) pop = E.pop(Math.min(1, hm.popT));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      if (!hm.filled) {
        /* a drawn-in puddle goal: dashed ink ellipse + halftone hollow */
        ctx.fillStyle = D.inkRGBA(0.08);
        ctx.beginPath(); ctx.ellipse(0, 2, 34, 16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        /* shape icon twin — homes are never color-only */
        drawShapeIcon(ctx, hm.shape, 0, 0, 8, C.inkSoft);
      } else {
        ctx.fillStyle = D.inkRGBA(0.9);
        ctx.beginPath(); ctx.ellipse(3, 5, 34, 16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.sky;
        ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = "rgba(255,252,245,0.55)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(-6, -4, 16, 6, -0.15, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
        /* shape sticker + a tiny Violet settled in */
        ctx.fillStyle = C.sun;
        ctx.beginPath(); ctx.arc(20, -8, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
        drawShapeIcon(ctx, hm.shape, 20, -8, 5, C.ink);
        ctx.fillStyle = C.violet;
        VG.wobblyBlobPath(ctx, -6, -2, 11, 9, "homeV" + i, 7);
        ctx.fill();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.arc(-9, -4, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-3, -4, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawDrifts() {
    for (var i = 0; i < drifts.length; i++) {
      var d = drifts[i];
      var bob = Math.sin(gameTime * 1.8 + d.seed) * (VG.Juice.reduced ? 0 : 1.6);
      var y = rowCY(d.row) + 4 + bob;
      if (d.kind === "log") blit(ctx, sprites.log, d.x, y);
      else if (d.kind === "turtle") blit(ctx, d.gold ? sprites.turtleGold : sprites.turtle, d.x, y);
      else blit(ctx, sprites.pad, d.x, y);
    }
  }

  function drawFlies() {
    for (var i = 0; i < flies.length; i++) {
      var fl = flies[i];
      var fade = fl.ttl < 1.5 ? Math.max(0.15, fl.ttl / 1.5) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      /* glow */
      ctx.fillStyle = C.sun;
      ctx.globalAlpha = fade * 0.22;
      ctx.beginPath(); ctx.arc(fl.x, fl.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
      /* wings flap */
      var flap = 0.55 + Math.abs(Math.sin(fl.t * 18)) * 0.45;
      ctx.fillStyle = C.paper;
      ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 1;
      for (var s = -1; s <= 1; s += 2) {
        ctx.save();
        ctx.translate(fl.x + s * 4, fl.y - 4);
        ctx.scale(1, flap);
        ctx.beginPath(); ctx.ellipse(0, 0, 4, 6, s * 0.5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      /* body */
      ctx.fillStyle = C.sun;
      ctx.beginPath(); ctx.ellipse(fl.x, fl.y, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(fl.x, fl.y - 1.5, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawCars() {
    for (var li = 0; li < lanes.length; li++) {
      var lane = lanes[li], def = lane.def, y = rowCY(def.row) - 6;
      var sp = sprites["car" + li];
      for (var ci = 0; ci < lane.cars.length; ci++) {
        var car = lane.cars[ci];
        var cy = y, sx = 1, sy = 1;
        if (car.state === "tele") {
          /* bounce-anticipation telegraph — two little eager hops */
          var tt = car.teleT / 0.3;
          cy -= Math.abs(Math.sin(tt * Math.PI * 2)) * 7;
          sy = 1 + Math.sin(tt * Math.PI * 4) * 0.05;
          sx = 2 - sy;
        }
        blit(ctx, sp, car.x, cy, 0, sx, sy);
      }
    }
  }

  function drawViolet() {
    if (mode === "oops" && oopsReason === "water" && oopsT > 0.15) {
      return;                                           /* she's under the tissue */
    }
    /* position along hop arc */
    var x = v.x, y = v.y, arc = 0;
    if (v.phase === "antic") { x = v.fx; y = v.fy; }
    else if (v.phase === "air") {
      var t = Math.min(1, v.t / AIR);
      x = lerp(v.fx, v.tx, E.easeOut(t));
      y = lerp(v.fy, v.ty, t);
      arc = -Math.sin(t * Math.PI) * 30;
    } else if (v.phase === "land") { x = v.tx; y = v.ty; }

    /* squash & stretch from the doctrine table */
    var sx = 1, sy = 1;
    if (v.phase === "antic") { sx = D.squash.jumpAnticipate.sx; sy = D.squash.jumpAnticipate.sy; }
    else if (v.phase === "air") {
      var lt = v.t / 0.12;
      if (lt < 1) {                                     /* launch stretch */
        var e = E.easeOut(lt);
        sx = lerp(D.squash.jumpAnticipate.sx, D.squash.jumpLaunch.sx, e);
        sy = lerp(D.squash.jumpAnticipate.sy, D.squash.jumpLaunch.sy, e);
      } else { sx = D.squash.airPeak.sx; sy = D.squash.airPeak.sy; }
    } else if (v.phase === "land") {
      if (v.t < LAND_DOWN) { sx = D.squash.landing.sx; sy = D.squash.landing.sy; }
      else {
        var rt = E.pop(Math.min(1, (v.t - LAND_DOWN) / LAND_REC));
        sx = lerp(D.squash.landing.sx, 1, rt);
        sy = lerp(D.squash.landing.sy, 1, rt);
      }
    } else {
      sy = 1 + Math.sin(gameTime * Math.PI * 2 / 2.4) * D.squash.idleBreath.amp;  /* idle breath */
      sx = 2 - sy;
    }

    /* scarf follow-through: trailing ribbon lags 2–3 frames */
    var anchorX = x - v.facing * 10, anchorY = y + 4 + arc * 0.6;
    if (v.scarf.length < 4) for (var si = 0; si < 4; si++) v.scarf.push({ x: anchorX, y: anchorY });
    var prev = { x: anchorX, y: anchorY };
    for (var s2 = 0; s2 < v.scarf.length; s2++) {
      var lag = 1 - Math.pow(0.001, (1 / (s2 + 2)) * 0.22);   /* slower recovery per link */
      v.scarf[s2].x = lerp(v.scarf[s2].x, prev.x - v.facing * 7, lag);
      v.scarf[s2].y = lerp(v.scarf[s2].y, prev.y + 2, lag);
      prev = v.scarf[s2];
    }
    ctx.save();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(anchorX, anchorY);
    for (s2 = 0; s2 < v.scarf.length; s2++) ctx.lineTo(v.scarf[s2].x, v.scarf[s2].y + arc * 0.3);
    ctx.stroke();
    ctx.strokeStyle = C.sun; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(anchorX, anchorY);
    for (s2 = 0; s2 < v.scarf.length; s2++) ctx.lineTo(v.scarf[s2].x, v.scarf[s2].y + arc * 0.3);
    ctx.stroke();
    ctx.restore();

    /* body + face */
    var dizzy = mode === "oops";
    ctx.save();
    ctx.translate(x, y + arc);
    if (dizzy) ctx.rotate(Math.sin(gameTime * 14) * 0.1);      /* wobble, never shake */
    ctx.scale(sx * (v.facing < 0 ? -1 : 1), sy);
    blit(ctx, sprites.violet, 0, 0);
    ctx.scale(v.facing < 0 ? -1 : 1, 1);                      /* face never mirrored */
    /* eyes: blink 140ms, paired eyes offset 80ms (§3b) */
    var blink = 1;
    if (v.blinkT >= 0) {
      var bt = v.blinkT / 0.14;
      blink = bt < 1 ? Math.max(0.1, Math.abs(1 - bt * 2)) : 1;
    }
    if (!dizzy) {
      ctx.fillStyle = C.paper;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      for (var eye = 0; eye < 2; eye++) {
        var eb = blink;
        if (eye === 1 && v.blinkT >= 0) {                     /* second eye lags 80ms */
          var bt2 = (v.blinkT - 0.08) / 0.14;
          eb = bt2 < 0 ? 1 : bt2 < 1 ? Math.max(0.1, Math.abs(1 - bt2 * 2)) : 1;
        }
        var ex = eye === 0 ? -8 : 8, ey = -4;
        ctx.save();
        ctx.translate(ex, ey); ctx.scale(1, eb);
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.arc(v.facing * 1.2, 1, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = C.paper;
      }
      /* mouth — one quadratic curve (mascot recipe) */
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 7);
      ctx.quadraticCurveTo(0, 11, 4, 7);
      ctx.stroke();
    } else {
      /* dizzy: sun star-eyes + a berry little swirl — berry's ONLY job */
      ctx.fillStyle = C.sun;
      starPath(ctx, -8, -4, 5); ctx.fill();
      starPath(ctx, 8, -4, 5); ctx.fill();
      ctx.strokeStyle = C.berry; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 8, 3.5, 0.4, Math.PI * 1.6);
      ctx.stroke();
    }
    ctx.restore();

    /* dizzy satellites */
    if (dizzy) {
      for (var st = 0; st < 3; st++) {
        var sa = gameTime * 5 + st * (Math.PI * 2 / 3);
        ctx.fillStyle = st === 1 ? C.berry : C.sun;
        starPath(ctx, x + Math.cos(sa) * 22, y + arc - 26 + Math.sin(sa) * 7, 4);
        ctx.fill();
      }
    }
  }

  function drawRipples() {
    for (var i = 0; i < ripples.length; i++) {
      var rp = ripples[i], t = rp.t / 0.8;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = C.paper; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, 10 + t * 34, 5 + t * 14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, 6 + t * 22, 3 + t * 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  function drawPopups() {
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i], t = Math.min(1, p.t / 0.9);
      ctx.save();
      ctx.globalAlpha = 1 - E.easeIn(t);
      ctx.font = F(Math.max(18, 20));
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var py = p.y - E.easeOut(t) * 34;
      ctx.lineWidth = 4; ctx.strokeStyle = C.paper;
      ctx.strokeText(p.txt, p.x, py);
      ctx.fillStyle = C.ink;
      ctx.fillText(p.txt, p.x, py);
      ctx.restore();
    }
  }

  /* ------------------------------------------------- HUD --------------- */
  function drawHUD() {
    /* washi score panel */
    VG.washiPanel(ctx, 12, 6, 210, 44, { scale: 1, tape: C.sky });
    ctx.fillStyle = C.inkSoft;
    ctx.font = F(18, 600);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("SCORE", 44, 20);
    score.render(ctx, 128, 36, 24);
    /* best + level */
    ctx.fillStyle = C.inkSoft;
    ctx.font = F(18, 600);
    ctx.fillText("BEST " + harness.highScore(), 236, 18);
    ctx.fillStyle = C.leaf;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(236, 30, 86, 24, 12); else ctx.rect(236, 30, 86, 24);
    ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.fillText("LV " + level, 252, 43);
    /* home progress — puddle icons filling up, shape-marked */
    var hx0 = 430;
    ctx.fillStyle = C.inkSoft; ctx.font = F(18, 600);
    ctx.fillText("HOMES", hx0 - 74, 28);
    for (var i = 0; i < homes.length; i++) {
      var hx = hx0 + i * 50, hy = 28;
      var hm = homes[i];
      ctx.beginPath(); ctx.ellipse(hx, hy, 17, 10, 0, 0, Math.PI * 2);
      if (hm.filled) {
        ctx.fillStyle = C.sky; ctx.fill();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
        drawShapeIcon(ctx, hm.shape, hx, hy, 5, C.ink);
      } else {
        ctx.fillStyle = D.inkRGBA(0.07); ctx.fill();
        ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        drawShapeIcon(ctx, hm.shape, hx, hy, 4, C.inkSoft);
      }
    }
    /* sticker hearts — shape + dashed empty twin, never color-only */
    for (var li = 0; li < 3; li++) {
      blit(ctx, li < lives ? sprites.heart : sprites.heartEmpty, 600 + li * 34, 28);
    }
  }

  function drawMarquee() {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = F(30, 800);
    ctx.lineWidth = 6; ctx.strokeStyle = C.paper;
    ctx.strokeText("PUDDLE HOPPER", W / 2, 28);
    ctx.fillStyle = C.ink;
    ctx.fillText("PUDDLE HOPPER", W / 2, 28);
    ctx.font = F(18, 600);
    ctx.lineWidth = 4;
    var msg = "Violet is hopping all by herself — launch the game to join in!";
    ctx.strokeText(msg, W / 2, H - 16);
    ctx.fillText(msg, W / 2, H - 16);
    ctx.restore();
  }

  function drawClearCard() {
    var ct = Math.min(1, (performance.now() - cardAnim.t0) / cardAnim.ms);
    var cs = 0.9 + 0.1 * E.pop(ct);
    var cy = H * 0.38 - cardAnim.rise * ct;
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale(cs, cs);
    VG.washiPanel(ctx, -190, -78, 380, 156, { tape: C.sun });
    ctx.fillStyle = C.ink;
    ctx.font = F(43, 800);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("All homes cozy!", 0, -28);
    ctx.font = F(24, 700);
    ctx.fillText("What a hop — Level " + level + " clear!", 0, 18);
    ctx.font = F(18, 600);
    ctx.fillStyle = C.inkSoft;
    ctx.fillText("Press any button to hop on", 0, 52);
    ctx.restore();
  }

  /* ============================================================
   * Input, DOM chrome & lifecycle
   * ========================================================== */
  function $(id) { return document.getElementById(id); }
  function show(sel) { var el = typeof sel === "string" ? $(sel.slice(1)) : sel; if (el) el.classList.remove("hidden"); }
  function hide(sel) { var el = typeof sel === "string" ? $(sel.slice(1)) : sel; if (el) el.classList.add("hidden"); }

  /* D7 — paper-style SVG icons for the control pills (no glyph fonts) */
  var ICON_PAUSE = '<svg class="ctrl-ic" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 7v12M16.5 7v12"/></svg>';
  var ICON_PLAY  = '<svg class="ctrl-ic" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6.5v13l11-6.5z"/></svg>';
  var ICON_NOTE  = '<svg class="ctrl-ic" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 18.5V7.5l8-2v11"/><circle cx="7.5" cy="18.5" r="2.2"/><circle cx="15.5" cy="16.5" r="2.2"/></svg>';
  var ICON_NOTE_OFF = '<svg class="ctrl-ic" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 18.5V7.5l8-2v11"/><circle cx="7.5" cy="18.5" r="2.2"/><circle cx="15.5" cy="16.5" r="2.2"/><path d="M4 4l18 18"/></svg>';

  function startRun() {
    stopMenuMotif();
    level = 1; lives = 3; score.value = 0; score.shown = 0;
    setupLevel(); resetViolet(0); maxRow = 0; demoT = 0;
    mode = "play"; paused = false;
    musicOn = true;
    startMusicForLevel();
  }
  function togglePause() {
    if (mode !== "play" && mode !== "oops") return;
    paused = !paused;
    var pb = $("btnPause");
    if (pb) pb.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    if (DEMO) return;
    if (paused) { SFX.stopMusic(); show("#ovlPause"); }
    else { hide("#ovlPause"); startMusicForLevel(); SFX.unlock(); }
  }
  function quitGame() {
    if (DEMO) return;
    SFX.stopMusic();
    harness.gameQuit(score.value);
    mode = "title"; paused = false;
    hide("#ovlPause"); hide("#ovlOver"); show("#ovlTitle");
    startMenuMotif();                                   /* title card hums again */
  }

  input.onAction(function (a) {
    if (DEMO) return;
    SFX.unlock();
    if (mode === "title" && !motifTimer) startMenuMotif();   /* first gesture */
    if (a === "pause") { togglePause(); return; }
    if (mode === "title") { startRun(); hide("#ovlTitle"); return; }
    if (mode === "clear" && celebrating) { celebrating.skip(); return; }   /* consent rule */
    if (mode === "over") return;
    if (paused) { togglePause(); return; }
  });

  /* tap-a-side-to-hop: taps steer relative to Violet; swipes are the
     engine's job (touchend), so we only act on presses that stay put —
     one gesture, one hop, never doubled. */
  var tapStart = null;
  canvas.addEventListener("pointerdown", function (e) {
    if (DEMO) return;
    SFX.unlock();
    if (mode === "title" && !motifTimer) startMenuMotif();
    tapStart = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", function (e) {
    if (DEMO || !tapStart) return;
    var dxs = e.clientX - tapStart.x, dys = e.clientY - tapStart.y;
    tapStart = null;
    if (Math.abs(dxs) >= 24 || Math.abs(dys) >= 24) return;   /* swipe — engine handles */
    if (mode === "clear" && celebrating) { celebrating.skip(); return; }
    if (mode !== "play" || paused) return;
    var rect = canvas.getBoundingClientRect();
    var gx = (e.clientX - rect.left - lastOx) / lastK;
    var gy = (e.clientY - rect.top - lastOy) / lastK;
    var dx = gx - v.x, dy = gy - v.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) { beginHop("up"); return; }
    if (Math.abs(dx) > Math.abs(dy)) beginHop(dx > 0 ? "right" : "left");
    else beginHop(dy > 0 ? "down" : "up");
  });

  window.addEventListener("keydown", function (e) {
    if (DEMO) return;
    SFX.unlock();
    if (mode === "title" && !motifTimer) startMenuMotif();
    var k = e.key.toLowerCase();
    if (k === "j") { VG.Juice.toggle(); syncJuiceBtn(); }
  });

  function syncJuiceBtn() {
    var b = $("btnJuice");
    if (b) b.classList.toggle("is-off", VG.Juice.reduced);
  }
  function wireDom() {
    if (DEMO) return;
    var start = $("btnStart");
    if (start) start.addEventListener("click", function () { SFX.unlock(); stopMenuMotif(); startRun(); hide("#ovlTitle"); });
    var p = $("btnPause");
    if (p) p.addEventListener("click", function () { togglePause(); });
    var snd = $("btnSound");
    if (snd) snd.addEventListener("click", function () {
      muted = !muted;
      SFX.setMuted(muted);
      snd.classList.toggle("is-off", muted);
      snd.innerHTML = muted ? ICON_NOTE_OFF : ICON_NOTE;
      if (muted) { stopMenuMotif(); }
      else if (mode === "title") { startMenuMotif(); }
      else if (mode === "play" && !paused) { musicOn = true; startMusicForLevel(); }
    });
    var jb = $("btnJuice");
    if (jb) jb.addEventListener("click", function () { VG.Juice.toggle(); syncJuiceBtn(); });
    var q1 = $("btnQuit"); if (q1) q1.addEventListener("click", quitGame);
    var q2 = $("btnQuit2"); if (q2) q2.addEventListener("click", quitGame);
    var q3 = $("btnQuit3"); if (q3) q3.addEventListener("click", quitGame);
    var res = $("btnResume"); if (res) res.addEventListener("click", function () { togglePause(); });
    var rst = $("btnRestart"); if (rst) rst.addEventListener("click", function () {
      hide("#ovlPause"); $("btnPause").innerHTML = ICON_PAUSE; startRun();
    });
    var again = $("btnAgain"); if (again) again.addEventListener("click", function () { hide("#ovlOver"); startRun(); });
  }

  /* ------------------------------------------------- debug hook -------- */
  if (opts.debug) {
    window.__debugPH = function () {
      var filled = 0;
      for (var i = 0; i < homes.length; i++) if (homes[i].filled) filled++;
      return { mode: mode, lives: lives, level: level, row: v.row,
        x: Math.round(v.x), filled: filled, paused: paused, dbg: dbg };
    };
  }

  /* ============================================================
   * Boot
   * ========================================================== */
  buildSprites();
  buildBackground();
  setupLevel();
  resetViolet(0);
  wireDom();
  syncJuiceBtn();
  if (DEMO) { mode = "play"; }

  var loop = VG.createLoop({
    update: function (dt) {
      if (DEMO) autopilot(dt);
      update(dt);
    },
    render: function () { render(); }
  });
  loop.start();

  return {
    pause: togglePause,
    quit: quitGame
  };
}

window.PuddleHopper = { start: start };
})();
