/* ============================================================================
 * Cardboard Grand Prix — Vee Arcade Racer (DESIGN-BIBLE §4 brief 5)
 *
 * A shoebox racetrack: corrugated cardboard road (flute lines every 6px),
 * popsicle-stick barriers, wind-up toy racers with visibly rotating keys.
 * Crayon speed lines at 0.4 alpha, eraser-shaving drift particles, walls
 * bounce with a BOING — never punish. Kid-tuned rubber-band AI: everyone
 * finishes, and finishing is always celebrated.
 *
 * Built ON the engine (../engine/vee-game.js, vee-sfx.js) — never replaces it.
 * ========================================================================== */
(function () {
"use strict";

var VG = window.VeeGame, D = VG.DESIGN, C = D.colors, S = window.VeeSFX;
var DEMO = !!window.CARDBOARD_DEMO;
var E = D.easing;

/* --------------------------------------------------------------------------
 * 0. Game-local token block (brief: warm gray cardboard + berry/violet
 *    racers). Every hex lives HERE — nothing improvised mid-render (§1).
 * ------------------------------------------------------------------------ */
var T = {
  desk:    "#F3E7CE",   /* craft-desk paper around the shoebox          */
  desk2:   "#EADBBB",   /* desk recessed doodle tone                    */
  board:   "#E4D3B0",   /* corrugated cardboard road (warm kraft)       */
  board2:  "#D5C199",   /* road edge / cut-paper under-layer            */
  fluteD:  "rgba(58,43,70,0.07)",    /* flute valley (ink at 7%)        */
  fluteL:  "rgba(255,252,245,0.32)", /* flute crest (warm white)        */
  stick:   "#FFF3D9",   /* popsicle-stick cream                         */
  gold:    "#FFD97A",   /* boost-pad gold sticker                       */
  cream:   "#FFFDF2",   /* highlights, decal fills                      */
  tin:     "#9FB4C7",   /* wind-up tin toy (neutral blue-gray)          */
  flex:    "#8BB52C",   /* canon: Frogmaster Flex green (#8bbd24 hue)   */
  kelleeP: "#7C2D96",   /* canon: Princess Kellee royal purple          */
  kelleeK: "#E14B92",   /* canon: Kellee pink                            */
  cheek:   "rgba(224,80,60,0.35)"    /* blush (berry at 35%)            */
};
var FDISP = "'Baloo 2','Fredoka','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";
var FBODY = "'Fredoka','Baloo 2','Comic Sans MS','Chalkboard SE','Comic Neue',sans-serif";

/* --------------------------------------------------------------------------
 * 1. Design space + race constants
 * ------------------------------------------------------------------------ */
var CW = 960, CH = 540;                     /* 16:9 letterbox design space  */
var ROAD_W = 130;                            /* road width (px, world)       */
var ROAD_HALF = ROAD_W / 2;
var LAT_MAX = ROAD_HALF - 17;                /* wall = road edge minus kart  */
var LAPS = 3;
var CP_FRACS = [0.25, 0.5, 0.75];            /* washi checkpoints + finish   */
var TOUCH = ("ontouchstart" in window) || (window.matchMedia &&
            window.matchMedia("(pointer: coarse)").matches);

function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  return c;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function angDiff(a, b) {                    /* shortest arc a→b             */
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function fmtTime(t) {                        /* m:ss.cc, tabular-friendly    */
  if (t == null) return "-:--.--";
  var m = Math.floor(t / 60), s = t - m * 60;
  var ss = Math.floor(s), cc = Math.floor((s - ss) * 100);
  return m + ":" + (ss < 10 ? "0" : "") + ss + "." + (cc < 10 ? "0" : "") + cc;
}

/* --------------------------------------------------------------------------
 * 2. Roster — four racers, shape-distinct decals (§3g), canon colors.
 *    Stats shown as friendly 1–3 star stickers; ALL handling is forgiving.
 * ------------------------------------------------------------------------ */
var ROSTER = [
  { id: "violet", name: "Violet",       decal: "star",    body: C.violet,
    speed: 2, grip: 2, blurb: "The mascot — steady and sparkly!" },
  { id: "flex",   name: "Frogmaster Flex", decal: "stripes", body: T.flex,
    speed: 2, grip: 3, blurb: "Adventurous frog — hops the corners!" },
  { id: "kellee", name: "Princess Kellee", decal: "crown",  body: T.kelleeP,
    speed: 3, grip: 1, blurb: "Princess of Play — zoomy and royal!" },
  { id: "tin",    name: "Wind-Up Tin",  decal: "zigzag",  body: T.tin,
    speed: 1, grip: 3, blurb: "A tin toy — slow, steady, clicky!" }
];
function racerStats(ch) {                    /* gentle tier-1 numbers        */
  return {
    top:  246 + ch.speed * 16,               /* 262…294 px/s — very gentle  */
    steer: 96 + ch.grip * 14,                /* lateral px/s at full hold   */
    push: 0.30 - ch.grip * 0.06              /* outward drift on curves     */
  };
}

/* --------------------------------------------------------------------------
 * 3. Circuits — three handcrafted shoebox loops (closed Catmull-Rom ribbons)
 * ------------------------------------------------------------------------ */
var TRACKS = [
  { id: "speedway", name: "Shoebox Speedway", tape: C.violet,
    hint: "A cozy first circuit — wide and friendly.",
    pts: [[300, 300], [800, 220], [1300, 300], [1560, 560], [1480, 860],
          [1100, 980], [760, 860], [520, 980], [260, 860], [180, 560]] },
  { id: "washi", name: "Washi Way", tape: C.sky,
    hint: "S-curves taped across the desk!",
    pts: [[260, 280], [760, 200], [1240, 300], [1420, 620], [1180, 780],
          [900, 640], [640, 760], [700, 1000], [420, 1060], [220, 840],
          [300, 560]] },
  { id: "canyon", name: "Crayon Canyon", tape: C.berry,
    hint: "Twisty crayon walls — drift city!",
    pts: [[300, 260], [860, 180], [1340, 260], [1560, 520], [1380, 760],
          [1120, 660], [960, 860], [1200, 1040], [860, 1140], [520, 1020],
          [420, 780], [200, 640], [180, 400]] }
];

/* Catmull-Rom point between p1 and p2 */
function crPoint(p0, p1, p2, p3, t) {
  var t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
       (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
       (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
       (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
       (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

/* Uniform arc-length tables: ux/uy/ua indexed by floor(distance / 2px). */
function buildGeo(pts) {
  var n = pts.length, dense = [], i, j;
  for (i = 0; i < n; i++) {
    var p0 = pts[(i - 1 + n) % n], p1 = pts[i],
        p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (j = 0; j < 24; j++) dense.push(crPoint(p0, p1, p2, p3, j / 24));
  }
  var ux = [], uy = [], ua = [], acc = 0;
  for (i = 0; i < dense.length; i++) {
    var a = dense[i], b = dense[(i + 1) % dense.length];
    var seg = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
    var ang = Math.atan2(b.y - a.y, b.x - a.x);
    var steps = Math.max(1, Math.round(seg / 2));
    for (j = 0; j < steps; j++) {
      var t = j / steps;
      ux.push(a.x + (b.x - a.x) * t);
      uy.push(a.y + (b.y - a.y) * t);
      ua.push(ang);
    }
    acc += seg;
  }
  var L = ux.length * 2;
  /* signed curvature (per 16px) for AI racing line + kart lean */
  var ca = new Array(ux.length);
  for (i = 0; i < ux.length; i++) {
    ca[i] = angDiff(ua[(i - 8 + ux.length) % ux.length], ua[(i + 8) % ux.length]) / 16;
  }
  return { ux: ux, uy: uy, ua: ua, ca: ca, L: L };
}
function geoAt(geo, s, lat) {
  var N = geo.ux.length;
  s = ((s % geo.L) + geo.L) % geo.L;
  var i = Math.floor(s / 2) % N, k = (s / 2) - Math.floor(s / 2);
  var i2 = (i + 1) % N;
  var x = lerp(geo.ux[i], geo.ux[i2], k), y = lerp(geo.uy[i], geo.uy[i2], k);
  var a = geo.ua[i] + angDiff(geo.ua[i], geo.ua[i2]) * k;
  if (lat) { x += -Math.sin(a) * lat; y += Math.cos(a) * lat; }
  return { x: x, y: y, a: a };
}
function geoCurv(geo, s) {
  var N = geo.ux.length;
  s = ((s % geo.L) + geo.L) % geo.L;
  return geo.ca[Math.floor(s / 2) % N];
}

/* --------------------------------------------------------------------------
 * 4. World baker — the whole shoebox diorama is drawn ONCE to an offscreen
 *    canvas (risk table: no per-frame procedural drawing, grain cached).
 * ------------------------------------------------------------------------ */
var worlds = [];                             /* [ {canvas, ox, oy, geo, def} ] */

function buildWorld(ti) {
  if (worlds[ti]) return worlds[ti];
  var def = TRACKS[ti], geo = buildGeo(def.pts.map(function (p) { return { x: p[0], y: p[1] }; }));
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, i;
  for (i = 0; i < geo.ux.length; i++) {
    minX = Math.min(minX, geo.ux[i]); maxX = Math.max(maxX, geo.ux[i]);
    minY = Math.min(minY, geo.uy[i]); maxY = Math.max(maxY, geo.uy[i]);
  }
  var pad = 230, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
  var cv2 = makeCanvas(w, h), g = cv2.getContext("2d");
  var ox = minX - pad, oy = minY - pad;
  g.translate(-ox, -oy);

  drawDesk(g, minX, minY, maxX, maxY, def);
  drawRoad(g, geo, def, ti);

  worlds[ti] = { canvas: cv2, ox: ox, oy: oy, geo: geo, def: def,
                 w: w, h: h, pickups: buildPickups(geo, ti) };
  return worlds[ti];
}

/* craft-desk backdrop: warm paper + grain + seeded crayon doodles */
function drawDesk(g, minX, minY, maxX, maxY, def) {
  var x0 = minX - 230, y0 = minY - 230, x1 = maxX + 230, y1 = maxY + 230;
  g.fillStyle = T.desk;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.globalAlpha = 0.15;                                   /* cached grain */
  g.fillStyle = g.createPattern(VG.paperGrainCanvas(VG.hashSeed(def.id + "desk")), "repeat");
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.globalAlpha = 1;

  var rnd = VG.mulberry32(VG.hashSeed(def.id + "doodle"));
  var cols = [C.sun, C.berry, C.sky, C.leaf, C.violet];
  for (var i = 0; i < 26; i++) {
    var dx = x0 + rnd() * (x1 - x0), dy = y0 + rnd() * (y1 - y0);
    var kind = Math.floor(rnd() * 4), col = cols[Math.floor(rnd() * cols.length)];
    g.save();
    g.translate(dx, dy);
    g.rotate((rnd() - 0.5) * 0.5);
    g.globalAlpha = 0.5;
    if (kind === 0) {                                     /* crayon star */
      g.fillStyle = col;
      g.beginPath();
      for (var k = 0; k < 10; k++) {
        var r = (k % 2 ? 6 : 14) * (0.7 + rnd() * 0.5), a2 = -Math.PI / 2 + k * Math.PI / 5;
        if (k === 0) g.moveTo(Math.cos(a2) * r, Math.sin(a2) * r);
        else g.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
      }
      g.closePath(); g.fill();
    } else if (kind === 1) {                              /* crayon swirl */
      VG.crayonStroke(g, (function () {
        var pts2 = [];
        for (var q = 0; q < 12; q++) {
          var aa = q * 0.6, rr = 3 + q * 1.9;
          pts2.push([Math.cos(aa) * rr, Math.sin(aa) * rr]);
        }
        return pts2;
      })(), col, 2.5);
    } else if (kind === 2) {                              /* torn paper scrap */
      VG.wobblyBlobPath(g, 0, 0, 16 + rnd() * 14, 12 + rnd() * 10, "scrap" + i + def.id, 7);
      g.fillStyle = T.desk2; g.fill();
      g.strokeStyle = C.inkSoft; g.lineWidth = 1; g.stroke();
    } else {                                              /* washi tape bit */
      g.globalAlpha = 0.35;
      g.fillStyle = col;
      g.fillRect(-22, -7, 44, 14);
    }
    g.restore();
  }
  g.globalAlpha = 1;
  /* a crayon + a pencil lying by the shoebox (big desk props) */
  g.save();
  g.translate(minX - 120, (minY + maxY) / 2); g.rotate(0.5);
  g.fillStyle = C.berry; g.strokeStyle = C.ink; g.lineWidth = 2;
  g.beginPath(); g.roundRect(-14, -46, 28, 92, 9); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-14, -46); g.lineTo(0, -70); g.lineTo(14, -46);
  g.closePath(); g.fillStyle = "#E98A7B"; g.fill(); g.stroke();
  g.restore();
  g.save();
  g.translate(maxX + 120, (minY + maxY) / 2 - 40); g.rotate(-0.42);
  g.fillStyle = C.sun; g.strokeStyle = C.ink; g.lineWidth = 2;
  g.beginPath(); g.roundRect(-9, -58, 18, 116, 5); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-9, 58); g.lineTo(0, 82); g.lineTo(9, 58);
  g.closePath(); g.fillStyle = T.stick; g.fill(); g.stroke();
  g.fillStyle = C.ink;
  g.beginPath(); g.moveTo(-3, 72); g.lineTo(0, 82); g.lineTo(3, 72);
  g.closePath(); g.fill();
  g.restore();
}

/* the corrugated ribbon + popsicle barriers + tapes + boost pads */
function drawRoad(g, geo, def, ti) {
  var N = geo.ux.length, i;

  function roadPath() {
    g.beginPath();
    g.moveTo(geo.ux[0], geo.uy[0]);
    for (var q = 4; q < N; q += 4) g.lineTo(geo.ux[q], geo.uy[q]);
    g.closePath();
  }
  /* cut-paper under layer + hard offset shadow (§3a construction edges) */
  g.save();
  g.translate(3, 3);
  roadPath();
  g.lineWidth = ROAD_W + 10; g.lineJoin = "round"; g.lineCap = "round";
  g.strokeStyle = D.inkRGBA(0.16); g.stroke();
  g.restore();
  roadPath();
  g.lineWidth = ROAD_W + 8; g.strokeStyle = T.board2; g.stroke();
  roadPath();
  g.lineWidth = ROAD_W; g.strokeStyle = T.board; g.stroke();

  /* corrugation: flute lines every 6px across the road (two tone passes) */
  var hw = ROAD_W / 2 - 2;
  for (var pass = 0; pass < 2; pass++) {
    g.beginPath();
    for (i = pass * 3; i < N; i += 6) {
      var px = geo.ux[i], py = geo.uy[i], a = geo.ua[i];
      var nx = -Math.sin(a), ny = Math.cos(a);
      g.moveTo(px - nx * hw, py - ny * hw);
      g.lineTo(px + nx * hw, py + ny * hw);
    }
    g.lineWidth = 1.6;
    g.strokeStyle = pass === 0 ? T.fluteD : T.fluteL;
    g.stroke();
  }
  /* grain over the road at doctrine cap */
  g.save();
  g.globalAlpha = 0.1;
  g.lineWidth = ROAD_W;
  g.strokeStyle = g.createPattern(VG.paperGrainCanvas(VG.hashSeed(def.id + "road")), "repeat");
  roadPath(); g.stroke();
  g.restore();
  g.globalAlpha = 1;

  /* popsicle-stick barriers on both edges (seeded ±3° wobble) */
  var rnd = VG.mulberry32(VG.hashSeed(def.id + "sticks"));
  for (var side = -1; side <= 1; side += 2) {
    for (i = 0; i < N; i += 13) {                          /* every 26px   */
      var p = geoAt(geo, i * 2, side * (ROAD_HALF + 5));
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a + (rnd() - 0.5) * 0.11);
      g.fillStyle = D.inkRGBA(0.3);                        /* flat shadow  */
      g.beginPath(); g.roundRect(-14 + 2, -4.5 + 2, 28, 9, 4.5); g.fill();
      g.fillStyle = T.stick;
      g.strokeStyle = C.ink; g.lineWidth = 1.4;
      g.beginPath(); g.roundRect(-14, -4.5, 28, 9, 4.5); g.fill(); g.stroke();
      g.strokeStyle = "rgba(58,43,70,0.12)";               /* wood grain   */
      g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.stroke();
      g.restore();
    }
  }

  /* washi-tape checkpoint lines (§3a: alpha 0.6, ±3–4° rotation) */
  for (i = 0; i < CP_FRACS.length; i++) {
    var cp = geoAt(geo, CP_FRACS[i] * geo.L, 0);
    g.save();
    g.translate(cp.x, cp.y);
    g.rotate(cp.a + (i % 2 ? 3.4 : -2.8) * Math.PI / 180);
    g.globalAlpha = 0.6;
    g.fillStyle = i % 2 ? C.sky : C.violet;
    g.fillRect(-9, -ROAD_HALF - 14, 18, ROAD_W + 28);
    g.globalAlpha = 0.25;
    g.fillStyle = T.cream;
    for (var dsh = -ROAD_HALF - 6; dsh < ROAD_HALF + 6; dsh += 16) g.fillRect(-6, dsh, 12, 5);
    g.restore();
  }
  g.globalAlpha = 1;

  /* start / finish: sun tape + crayon checkers */
  var st = geoAt(geo, 0, 0);
  g.save();
  g.translate(st.x, st.y); g.rotate(st.a);
  g.globalAlpha = 0.75; g.fillStyle = C.sun;
  g.fillRect(-11, -ROAD_HALF - 16, 22, ROAD_W + 32);
  g.globalAlpha = 1;
  for (var row = 0; row < 2; row++) {
    for (var cc = 0; cc < 10; cc++) {
      if ((row + cc) % 2) continue;
      g.fillStyle = C.ink;
      g.fillRect(-10 + row * 10, -ROAD_HALF + cc * (ROAD_W / 10), 10, ROAD_W / 10);
    }
  }
  g.restore();

  /* boost pads — gold stickers with chevrons */
  var pads = boostPadsFor(ti);
  for (i = 0; i < pads.length; i++) {
    var bp = geoAt(geo, pads[i].f * geo.L, pads[i].lat);
    g.save();
    g.translate(bp.x, bp.y); g.rotate(bp.a);
    g.fillStyle = D.inkRGBA(0.5);
    g.beginPath(); g.roundRect(-25 + 2, -19 + 2, 50, 38, 10); g.fill();
    g.fillStyle = T.gold; g.strokeStyle = C.ink; g.lineWidth = 2;
    g.beginPath(); g.roundRect(-25, -19, 50, 38, 10); g.fill(); g.stroke();
    g.strokeStyle = C.ink; g.lineWidth = 3; g.lineCap = "round";
    for (var ch2 = -1; ch2 <= 1; ch2 += 2) {
      g.beginPath();
      g.moveTo(ch2 * 9 - 5, -10); g.lineTo(ch2 * 9 + 4, 0); g.lineTo(ch2 * 9 - 5, 10);
      g.stroke();
    }
    g.restore();
  }
}

function boostPadsFor(ti) {
  if (ti === 0) return [{ f: 0.12, lat: 0 }, { f: 0.62, lat: -20 }];
  if (ti === 1) return [{ f: 0.08, lat: 18 }, { f: 0.46, lat: 0 }, { f: 0.84, lat: -14 }];
  return [{ f: 0.18, lat: 0 }, { f: 0.55, lat: 22 }, { f: 0.88, lat: -18 }];
}

/* coin/sticker collectibles: rows of three star stickers on the road */
function buildPickups(geo, ti) {
  var rnd = VG.mulberry32(VG.hashSeed(TRACKS[ti].id + "coins"));
  var out = [], rows = 8, i, j;
  for (i = 0; i < rows; i++) {
    var f = (i + 0.5) / rows + (rnd() - 0.5) * 0.04;
    var latBase = (rnd() - 0.5) * 56;
    for (j = -1; j <= 1; j++) {
      var p = geoAt(geo, f * geo.L, clamp(latBase + j * 24, -LAT_MAX + 6, LAT_MAX - 6));
      out.push({ x: p.x, y: p.y, taken: false, phase: rnd() * Math.PI * 2 });
    }
  }
  return out;
}

/* track-select mini map preview (baked once, scaled path) */
function bakePreview(ti) {
  var world = buildWorld(ti), geo = world.geo;
  var c = makeCanvas(224, 150), g = c.getContext("2d");
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (var i = 0; i < geo.ux.length; i++) {
    minX = Math.min(minX, geo.ux[i]); maxX = Math.max(maxX, geo.ux[i]);
    minY = Math.min(minY, geo.uy[i]); maxY = Math.max(maxY, geo.uy[i]);
  }
  var sc = Math.min(196 / (maxX - minX), 122 / (maxY - minY));
  var ox2 = (224 - (maxX - minX) * sc) / 2, oy2 = (150 - (maxY - minY) * sc) / 2;
  g.fillStyle = T.desk2;
  g.beginPath(); g.roundRect(0, 0, 224, 150, 12); g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  g.beginPath();
  g.moveTo((geo.ux[0] - minX) * sc + ox2, (geo.uy[0] - minY) * sc + oy2);
  for (var q = 6; q < geo.ux.length; q += 6) {
    g.lineTo((geo.ux[q] - minX) * sc + ox2, (geo.uy[q] - minY) * sc + oy2);
  }
  g.closePath();
  g.lineWidth = 13; g.lineJoin = "round"; g.strokeStyle = T.board2; g.stroke();
  g.lineWidth = 10; g.strokeStyle = T.board; g.stroke();
  /* start dot */
  g.fillStyle = C.sun; g.strokeStyle = C.ink; g.lineWidth = 1.6;
  g.beginPath();
  g.arc((geo.ux[0] - minX) * sc + ox2, (geo.uy[0] - minY) * sc + oy2, 6, 0, Math.PI * 2);
  g.fill(); g.stroke();
  return c;
}

/* --------------------------------------------------------------------------
 * 5. Roster sprites — karts and portraits baked ONCE to offscreen canvases.
 *    Icon-shaped faces per the mascot recipe (round head, 2 ellipse eyes,
 *    one quadratic mouth) — never reproducing pixel sheets, just canon.
 * ------------------------------------------------------------------------ */
var kartSprites = {}, portraitSprites = {}, chipSprites = {};

/* User-supplied character art belongs in the game, too.  The moving karts
 * remain purpose-built cut-paper sprites for legibility at speed, while these
 * source portraits make the character-select screen feel like a real cast
 * board rather than a menu of anonymous tokens.  `solo.png` is intentionally
 * used here instead of slicing the reference sheets: their metadata describes
 * character poses, not a uniform in-game animation strip. */
var sourcePortraits = {};
[
  ["violet", "/static/assets/characters/violet/solo.png"],
  ["flex", "/static/assets/characters/frogmaster-flex/solo.png"],
  ["kellee", "/static/assets/characters/princess-kellee/solo.png"]
].forEach(function (entry) {
  var img = new Image();
  img.src = entry[1];
  sourcePortraits[entry[0]] = img;
});

function drawSourcePortrait(g, id, x, y, w, h) {
  var img = sourcePortraits[id];
  if (!img || !img.complete || !img.naturalWidth) return false;
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.clip();
  /* Preserve each illustrator's intended framing, with a slight zoom to
     favour faces inside the paper-card window. */
  var sw = img.naturalWidth, sh = img.naturalHeight;
  var scale = Math.max(w / sw, h / sh) * 1.09;
  var dw = sw * scale, dh = sh * scale;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) * 0.26, dw, dh);
  g.restore();
  g.lineWidth = 2; g.strokeStyle = C.ink;
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.stroke();
  return true;
}

function decalPath(g, kind, s) {             /* s = size multiplier          */
  g.beginPath();
  var i, a, r;
  if (kind === "star") {
    for (i = 0; i < 10; i++) {
      r = (i % 2 ? 0.42 : 1) * 9 * s; a = -Math.PI / 2 + i * Math.PI / 5;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
  } else if (kind === "crown") {
    g.moveTo(-9 * s, 6 * s);
    g.lineTo(-9 * s, -3 * s); g.lineTo(-4.5 * s, 1 * s); g.lineTo(0, -7 * s);
    g.lineTo(4.5 * s, 1 * s); g.lineTo(9 * s, -3 * s); g.lineTo(9 * s, 6 * s);
    g.closePath();
  } else if (kind === "zigzag") {
    g.moveTo(-10 * s, 5 * s); g.lineTo(-5 * s, -5 * s); g.lineTo(0, 5 * s);
    g.lineTo(5 * s, -5 * s); g.lineTo(10 * s, 5 * s);
    return "stroke";
  } else {                                    /* stripes */
    for (i = -1; i <= 1; i++) {
      g.moveTo(i * 6 * s - 3 * s, 8 * s); g.lineTo(i * 6 * s + 3 * s, -8 * s);
    }
    return "stroke";
  }
  return "fill";
}
function drawDecal(g, kind, x, y, s, fill) {
  g.save();
  g.translate(x, y);
  var mode = decalPath(g, kind, s);
  if (mode === "stroke") {
    g.strokeStyle = fill; g.lineWidth = 3.2 * s; g.lineCap = "round";
    g.lineJoin = "round"; g.stroke();
  } else {
    g.fillStyle = fill; g.fill();
  }
  g.restore();
}

/* top-down kart, facing UP, baked at 2× (96×112 → drawn 48×56) */
function bakeKart(ch) {
  var K = 2, c = makeCanvas(48 * K, 56 * K), g = c.getContext("2d");
  g.scale(K, K);
  g.translate(24, 28);
  var seed = "kart" + ch.id;
  /* wheels — four rounded ink blocks slightly proud of the body */
  g.fillStyle = C.ink;
  var wpos = [[-15, -16], [15, -16], [-15, 14], [15, 14]];
  for (var i = 0; i < 4; i++) {
    g.beginPath(); g.roundRect(wpos[i][0] - 4, wpos[i][1] - 7, 8, 14, 3); g.fill();
  }
  /* body: shadow → fill → grain → outline → highlight (4-layer recipe) */
  VG.drawSprite(g, { x: 0, y: 0, w: 30, h: 42, fill: ch.body, seed: seed,
                     scale: 0.6, radius: 9, texture: "grain" });
  /* front bumper stripe */
  g.fillStyle = T.cream; g.globalAlpha = 0.85;
  g.beginPath(); g.roundRect(-11, -19, 22, 5, 2.5); g.fill();
  g.globalAlpha = 1;
  /* shape-distinct decal on the hood */
  drawDecal(g, ch.decal, 0, 2, 1, T.cream);
  g.strokeStyle = D.inkRGBA(0.55); g.lineWidth = 1;
  /* the driver: mini portrait head peeking at the rear */
  g.save();
  g.translate(0, 13);
  g.scale(0.16, 0.16);
  g.drawImage(portraitSprites[ch.id], -70, -70);
  g.restore();
  return c;
}

/* the wind-up key — drawn live so its rotation shows speed */
function drawKey(g, x, y, ang, s) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(s, s);
  g.strokeStyle = C.ink; g.lineWidth = 1.6;
  g.fillStyle = C.sun;
  /* shaft */
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -9); g.stroke();
  /* two lobes (the key bow) — reads clearly while spinning */
  g.beginPath(); g.ellipse(-4.6, -12, 4.2, 3.4, 0, 0, Math.PI * 2);
  g.fill(); g.stroke();
  g.beginPath(); g.ellipse(4.6, -12, 4.2, 3.4, 0, 0, Math.PI * 2);
  g.fill(); g.stroke();
  g.restore();
}

/* front-facing icon portraits (140×140 bake) — the mascot recipe faces */
function bakePortraits() {
  for (var i = 0; i < ROSTER.length; i++) {
    var ch = ROSTER[i];
    var c = makeCanvas(140, 140), g = c.getContext("2d");
    g.translate(70, 74);
    if (ch.id === "violet") portraitViolet(g);
    else if (ch.id === "flex") portraitFlex(g);
    else if (ch.id === "kellee") portraitKellee(g);
    else portraitTin(g);
    portraitSprites[ch.id] = c;
    /* 48px chips for HUD rank row */
    var cc = makeCanvas(48, 48), g2 = cc.getContext("2d");
    g2.drawImage(c, 0, 0, 48, 48);
    chipSprites[ch.id] = cc;
  }
  for (i = 0; i < ROSTER.length; i++) kartSprites[ROSTER[i].id] = bakeKart(ROSTER[i]);
}

function faceBase(g, headFill, r) {           /* round head + eyes + mouth */
  VG.wobblyBlobPath(g, 0, 0, r, r * 0.96, "head" + headFill, 9);
  g.fillStyle = headFill; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
}
function eyesMouth(g, ex, ey, spread, smileW) {
  g.fillStyle = C.ink;
  g.beginPath(); g.ellipse(-spread, ey, ex, ey > 0 ? ex * 1.35 : ex * 1.35, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(spread, ey, ex, ex * 1.35, 0, 0, Math.PI * 2); g.fill();
  /* one quadratic-curve smile */
  g.strokeStyle = C.ink; g.lineWidth = 2.4; g.lineCap = "round";
  g.beginPath();
  g.moveTo(-smileW, ey + 13);
  g.quadraticCurveTo(0, ey + 13 + smileW * 0.9, smileW, ey + 13);
  g.stroke();
}

function portraitViolet(g) {
  /* hair halo behind */
  VG.wobblyBlobPath(g, 0, -4, 52, 50, "vhair", 9);
  g.fillStyle = C.violet; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  /* twin side puffs */
  VG.wobblyBlobPath(g, -46, 8, 15, 14, "vpuffL", 7); g.fill(); g.stroke();
  VG.wobblyBlobPath(g, 46, 8, 15, 14, "vpuffR", 7); g.fill(); g.stroke();
  /* face */
  VG.wobblyBlobPath(g, 0, 6, 38, 36, "vface", 9);
  g.fillStyle = T.cream; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  /* bangs */
  g.fillStyle = C.violet;
  g.beginPath();
  g.moveTo(-36, -8); g.quadraticCurveTo(-16, -34, 0, -26);
  g.quadraticCurveTo(18, -34, 36, -8);
  g.quadraticCurveTo(18, -18, 0, -14);
  g.quadraticCurveTo(-18, -18, -36, -8);
  g.closePath(); g.fill();
  eyesMouth(g, 4.4, 4, 14, 9);
  /* blush + star hairpin */
  g.fillStyle = T.cheek;
  g.beginPath(); g.arc(-24, 14, 5.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(24, 14, 5.5, 0, Math.PI * 2); g.fill();
  drawDecal(g, "star", 30, -26, 1.1, C.sun);
}

function portraitFlex(g) {
  /* frog eyes on top of the head (canon: adventurous frog) */
  for (var side = -1; side <= 1; side += 2) {
    VG.wobblyBlobPath(g, side * 24, -40, 15, 14, "feye" + side, 8);
    g.fillStyle = T.flex; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = T.cream;
    g.beginPath(); g.arc(side * 24, -40, 8.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(side * 24, -39, 3.6, 0, Math.PI * 2); g.fill();
  }
  /* head */
  VG.wobblyBlobPath(g, 0, 0, 48, 42, "fhead", 9);
  g.fillStyle = T.flex; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  /* cream belly-chin arc */
  g.save();
  VG.wobblyBlobPath(g, 0, 0, 48, 42, "fhead", 9);
  g.clip();
  g.fillStyle = T.cream;
  g.beginPath(); g.ellipse(0, 34, 34, 20, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  /* wide happy mouth */
  g.strokeStyle = C.ink; g.lineWidth = 2.6; g.lineCap = "round";
  g.beginPath();
  g.moveTo(-22, 8);
  g.quadraticCurveTo(0, 24, 22, 8);
  g.stroke();
  /* nostril dots */
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(-6, -8, 1.8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(6, -8, 1.8, 0, Math.PI * 2); g.fill();
  /* purple scarf (canon) with trailing tail */
  g.fillStyle = C.violet; g.strokeStyle = C.ink; g.lineWidth = 2;
  g.beginPath(); g.roundRect(-40, 34, 80, 16, 8); g.fill(); g.stroke();
  g.save(); g.rotate(0.12);
  g.beginPath(); g.roundRect(18, 44, 18, 26, 7); g.fill(); g.stroke();
  g.restore();
  /* blush */
  g.fillStyle = T.cheek;
  g.beginPath(); g.arc(-30, 12, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(30, 12, 5, 0, Math.PI * 2); g.fill();
}

function portraitKellee(g) {
  /* royal hair */
  VG.wobblyBlobPath(g, 0, -2, 52, 50, "khair", 9);
  g.fillStyle = T.kelleeK; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  /* face */
  VG.wobblyBlobPath(g, 0, 8, 37, 35, "kface", 9);
  g.fillStyle = T.cream; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  /* crown (gold) */
  g.save();
  g.translate(0, -44); g.rotate(-0.06);
  g.fillStyle = C.sun; g.strokeStyle = C.ink; g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-26, 12); g.lineTo(-26, -4); g.lineTo(-13, 4); g.lineTo(0, -12);
  g.lineTo(13, 4); g.lineTo(26, -4); g.lineTo(26, 12);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = T.kelleeK;
  g.beginPath(); g.arc(0, 2, 4, 0, Math.PI * 2); g.fill();
  g.restore();
  eyesMouth(g, 4.4, 8, 13, 8);
  /* royal blush + tiny scepter star */
  g.fillStyle = T.cheek;
  g.beginPath(); g.arc(-23, 18, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(23, 18, 5, 0, Math.PI * 2); g.fill();
  drawDecal(g, "star", -40, 30, 0.9, T.kelleeP);
}

function portraitTin(g) {
  /* rounded-square tin head */
  VG.wobblyRectPath(g, -42, -40, 84, 80, "thead", 16);
  g.fillStyle = T.tin; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  /* rivets */
  g.fillStyle = C.ink;
  var rv = [[-32, -30], [32, -30], [-32, 30], [32, 30]];
  for (var i = 0; i < 4; i++) {
    g.beginPath(); g.arc(rv[i][0], rv[i][1], 2.6, 0, Math.PI * 2); g.fill();
  }
  /* bolt eyes */
  for (var side2 = -1; side2 <= 1; side2 += 2) {
    g.fillStyle = T.cream; g.strokeStyle = C.ink; g.lineWidth = 2;
    g.beginPath(); g.arc(side2 * 17, -8, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(side2 * 17, -8, 4.4, 0, Math.PI * 2); g.fill();
  }
  /* zigzag mouth (matches the kart decal) */
  g.strokeStyle = C.ink; g.lineWidth = 2.6; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath();
  g.moveTo(-16, 18); g.lineTo(-8, 12); g.lineTo(0, 18); g.lineTo(8, 12); g.lineTo(16, 18);
  g.stroke();
  /* side key + halftone cheek */
  drawKey(g, 46, -14, 0.6, 1.1);
  g.globalAlpha = 0.25;
  g.fillStyle = g.createPattern(VG.halftoneCanvas(C.ink), "repeat");
  g.fillRect(-40, 18, 80, 20);
  g.globalAlpha = 1;
}

/* --------------------------------------------------------------------------
 * 6. Core state — harness, canvas, scenes
 * ------------------------------------------------------------------------ */
var harness = VG.createHarness("racer");
var cv = VG.setupCanvas(document.getElementById("stage"));
var ctx = cv.ctx, view = cv.view;
var particles = new VG.ParticlePool();
var flash = VG.createFlash();
var input = VG.createInput({ actions: {
  left: ["ArrowLeft", "a", "A"], right: ["ArrowRight", "d", "D"],
  up: ["ArrowUp", "w", "W"], down: ["ArrowDown", "s", "S"],
  action: [" ", "Enter", "z", "Z"], pause: ["Escape", "p", "P"]
}});

var scene = "select";           /* select | tracks | race | podium          */
var selIdx = 0, trackIdx = 0, trackSelIdx = 0;
var previews = [];
var bestTimes = {};             /* per-track best race times (localStorage) */

/* race state */
var racers = [], playerIdx = 0;
var racePhase = "count";        /* count | race | finished                  */
var countT = 0, raceT = 0, finishSeqT = -1;
var camA = 0, camShake = 0;
var banners = [];               /* floating praise                          */
var popScale = {};              /* HUD tick-up counters                     */
var stickers = 0, score = 0;
var paused = false;
var hurryFired = false, finalBanner = false;
var musicOn = false;
var simT = 0;
var podium = null;
var demoTrackT = 0, demoSparkleT = 0;
var touchDirs = {};             /* pointerId → -1/+1 (hold halves to steer) */

function bestKey(ti) { return "vee.arcade.racer.best." + TRACKS[ti].id; }
function loadBests() {
  for (var i = 0; i < TRACKS.length; i++) {
    try {
      var v = parseFloat(window.localStorage.getItem(bestKey(i)) || "");
      bestTimes[i] = isNaN(v) ? null : v;
    } catch (e) { bestTimes[i] = null; }
  }
}
function saveBest(ti, t) {
  if (bestTimes[ti] == null || t < bestTimes[ti]) {
    bestTimes[ti] = t;
    try { window.localStorage.setItem(bestKey(ti), String(t)); } catch (e) {}
    return true;
  }
  return false;
}

/* --------------------------------------------------------------------------
 * 7. Race setup
 * ------------------------------------------------------------------------ */
function makeRacer(charId, isPlayer, slot, autopilot) {
  var ch = null;
  for (var i = 0; i < ROSTER.length; i++) if (ROSTER[i].id === charId) ch = ROSTER[i];
  var st = racerStats(ch);
  return {
    ch: ch, isPlayer: !!isPlayer, autopilot: !!autopilot,
    s: -slot * 46, lat: [-34, 34, -34, 34][slot],
    latV: 0, speed: 0, lap: 0, cpIdx: 0, prog: 0,
    finished: false, finishTime: null, finishOrder: 0,
    boostT: 0, slowT: 0, keyA: Math.random() * 6,
    bounceStep: 0, bounceUntil: 0, squashT: -1, drift: false,
    aiSeed: VG.hashSeed(charId + slot), aiPhase: Math.random() * 10,
    top: st.top, steer: st.steer, push: st.push,
    skill: 0.94 + (slot % 3) * 0.02,
    px: 0, py: 0, pa: 0                            /* world pose cache      */
  };
}

function startRace(ti, autopilotPlayer) {
  trackIdx = ti;
  var world = buildWorld(ti);
  for (var i = 0; i < world.pickups.length; i++) world.pickups[i].taken = false;
  racers = [];
  for (i = 0; i < ROSTER.length; i++) {
    var isP = !DEMO && i === selIdx && !autopilotPlayer;
    racers.push(makeRacer(ROSTER[i].id, isP, i, DEMO || autopilotPlayer || !isP));
  }
  playerIdx = DEMO ? 0 : selIdx;
  racePhase = "count"; countT = 0; raceT = 0; finishSeqT = -1;
  banners = []; stickers = 0; score = 0;
  hurryFired = false; finalBanner = false; paused = false;
  podium = null;
  finishCount = 0;
  var p0 = geoAt(world.geo, 0, 0);
  camA = p0.a;
  scene = "race";
  S.stopMusic(); musicOn = false;
  stopHum();
}

/* --------------------------------------------------------------------------
 * 8. Audio — 112 BPM pentatonic (the energetic one), +1 semitone per lap,
 *    hurry on final lap; engine hum = soft lowpassed triangle wobble.
 * ------------------------------------------------------------------------ */
function raceMusic(tier) {
  S.startMusic({ bpm: 112, seed: 12 + trackIdx * 7, tier: tier || 0, key: "G" });
  musicOn = true;
}

var hum = null;
function startHum() {
  var c = S.ensure();
  if (!c || hum) return;
  try {
    var osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 62;
    var lfo = c.createOscillator();                    /* the "wobble"      */
    lfo.type = "sine"; lfo.frequency.value = 5.2;
    var lfoGain = c.createGain(); lfoGain.gain.value = 7;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    var lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 340; lp.Q.value = 0.8;
    var g = c.createGain(); g.gain.value = 0.0001;
    osc.connect(lp); lp.connect(g); g.connect(S.sfxBus);
    osc.start(); lfo.start();
    hum = { osc: osc, lfo: lfo, gain: g };
  } catch (e) { hum = null; }
}
function setHum(speedFrac) {
  if (!hum || !S.ready) return;
  var c = S.ctx;
  var target = S.muted ? 0.0001 : 0.006 + 0.05 * clamp(speedFrac, 0, 1);
  hum.gain.gain.setTargetAtTime(target, c.currentTime, 0.08);
  hum.osc.frequency.setTargetAtTime(58 + 46 * clamp(speedFrac, 0, 1), c.currentTime, 0.1);
}
function stopHum() {
  if (!hum) return;
  try { hum.osc.stop(); hum.lfo.stop(); } catch (e) {}
  hum = null;
}

/* --------------------------------------------------------------------------
 * 9. Physics — auto-throttle (one-switch friendly), wide steering tolerance,
 *    walls BOING (bounce recipe + squash), never punish.
 * ------------------------------------------------------------------------ */
function steerInput(r) {
  if (r.autopilot) return aiSteer(r);
  var dir = 0;
  if (input.isHeld("left")) dir -= 1;
  if (input.isHeld("right")) dir += 1;
  for (var id in touchDirs) { dir += touchDirs[id]; }   /* hold halves      */
  return clamp(dir, -1, 1);
}

function aiSteer(r) {
  var world = worlds[trackIdx];
  /* aim for the inside of the next corner + a seeded wobble (not robotic) */
  var look = geoCurv(world.geo, r.s + 90);
  var target = clamp(-look * 240, -34, 34);
  var rnd = VG.mulberry32(r.aiSeed + Math.floor(simT * 0.5));
  target += Math.sin(simT * 0.9 + r.aiPhase) * 14 + (rnd() - 0.5) * 6;
  return clamp((target - r.lat) / 26, -1, 1);
}

/* kid rubber-band: rivals slow when the player is far behind, gently speed
 * up when far ahead — and when the player is LAST, the pack waits. Finishing
 * is always possible, never humiliating. */
function rubberBand(r, playerProg, playerIsLast) {
  if (DEMO) return 1;
  if (r.isPlayer) return 1;
  var gap = playerProg - r.prog;                 /* + = player ahead       */
  var m = 1;
  if (gap > 420) m = Math.min(1.14, 1 + (gap - 420) / 5600);
  else if (gap < -320) m = Math.max(0.62, 1 + (gap + 320) / 2400);
  if (playerIsLast && m > 0.8) m = 0.8;          /* the pack waits kindly  */
  if (r.finished) m = Math.max(m, 0.9);          /* keep finishing rolling */
  return m;
}

function updateRacer(r, dt, world, playerProg, playerIsLast) {
  var st = racerStats(r.ch);
  /* target speed: gentle accel toward top, boosted / slowed by events */
  var target = r.top * (r.isPlayer ? 1 : r.skill) * rubberBand(r, playerProg, playerIsLast);
  if (r.boostT > 0) target *= 1.32;
  if (r.slowT > 0) target *= 0.55;               /* boing slow-down, brief */
  if (racePhase === "count") target = 0;
  if (r.finished) target = Math.min(target, 150);/* cruise after finish    */
  var accel = target > r.speed ? 150 : 260;
  r.speed += clamp(target - r.speed, -accel * dt, accel * dt);

  /* steering — wide tolerance, 120ms early-press buffer honored by engine  */
  var steer = steerInput(r);
  var curve = geoCurv(world.geo, r.s);
  var steerRate = r.steer * (1 + Math.abs(curve) * 30 * 0.12);
  var latTarget = steer * steerRate;
  r.drift = Math.abs(steer) > 0.6 && r.speed > r.top * 0.55;
  if (r.drift) latTarget *= 1.28;                /* drift = a little extra */
  r.latV = lerp(r.latV, latTarget, 1 - Math.pow(0.0018, dt));
  r.lat += r.latV * dt;
  r.lat -= curve * r.speed * r.push * dt;        /* gentle outward push    */

  /* wall = popsicle barrier: BOING, squash, tiny slow-down — never harsh   */
  if (Math.abs(r.lat) > LAT_MAX) {
    var impact = Math.abs(r.latV);
    r.lat = clamp(r.lat, -LAT_MAX, LAT_MAX);
    r.latV = -r.latV * 0.55;
    if (impact > 34) {
      r.squashT = 0;
      r.slowT = Math.max(r.slowT, 0.16);
      if (r.isPlayer) {
        S.bounce(Math.min(r.bounceStep, 7));     /* pitch ladder, §3d      */
        r.bounceStep = (performance.now() < r.bounceUntil + 900) ? r.bounceStep + 1 : 0;
        r.bounceUntil = performance.now();
      }
      particles.spawn(4, { x: r.px, y: r.py, kind: "spark", speed: 70,
        ttl: 0.45, size: 3, color: T.stick, gravity: 160 });
    }
  }

  /* advance along the ribbon */
  var prevS = r.s;
  r.s += r.speed * dt;
  r.keyA += r.speed * dt * 0.09;                 /* wind-up key rotation   */
  if (r.boostT > 0) r.boostT -= dt;
  if (r.slowT > 0) r.slowT -= dt;
  if (r.squashT >= 0) { r.squashT += dt; if (r.squashT > 0.24) r.squashT = -1; }

  /* checkpoints (washi tapes) then finish line */
  if (racePhase !== "count" && !r.finished) {
    var cpS = CP_FRACS[r.cpIdx] * world.geo.L;
    if (r.cpIdx < CP_FRACS.length && prevS < cpS && r.s >= cpS) {
      r.cpIdx++;
      if (r.isPlayer) { S.confirm(); banner("Checkpoint!", false); }
    }
    if (r.s >= world.geo.L) {
      r.s -= world.geo.L;
      if (r.cpIdx >= CP_FRACS.length) {
        r.lap++;
        r.cpIdx = 0;
        onLap(r);
      } else {
        r.cpIdx = 0;                              /* missed tapes: no punish */
      }
    }
  }
  r.prog = r.lap * world.geo.L + r.s;
  var p = geoAt(world.geo, r.s, r.lat);
  r.px = p.x; r.py = p.y;
  r.pa = p.a + clamp(r.latV * 0.0022, -0.3, 0.3);/* visual lean into steer */

  /* drift kicks up eraser shavings (§4 brief) */
  if (r.drift && !VG.Juice.reduced && Math.random() < 0.55) {
    particles.spawn(2, { x: r.px - Math.cos(r.pa) * 18, y: r.py - Math.sin(r.pa) * 18,
      kind: "trail", speed: 26, ttl: 0.6, size: 3, color: T.cream, gravity: 40 });
  }
}

function onLap(r) {
  if (!r.isPlayer) {
    if (r.lap >= LAPS) finishRacer(r);
    return;
  }
  if (r.lap >= LAPS) { finishRacer(r); return; }
  /* lap sting + music up a semitone (doctrine: subconscious progress) */
  S.powerUp();
  banner("Lap " + (r.lap + 1) + " of " + LAPS + "!", true);
  if (musicOn) raceMusic(r.lap);
  if (r.lap === LAPS - 1 && !hurryFired) {       /* final lap = hurry      */
    hurryFired = true;
    if (musicOn) S.hurry();
    banner("FINAL LAP!", true);
  }
}

function finishRacer(r) {
  r.finished = true;
  r.finishTime = raceT;
  r.finishOrder = finishCount++;
  if (r.isPlayer) {
    racePhase = "finished";
    finishSeqT = 0;
    stopHum();
    banner("What a finish!", true);   /* the podium fanfare follows (3-beat) */
  }
}
var finishCount = 0;

/* --------------------------------------------------------------------------
 * 10. Pickups — sticker coins (doctrine juice stack) + gold boost pads
 * ------------------------------------------------------------------------ */
function updatePickups(dt, world) {
  var pk = world.pickups, pads = boostPadsFor(trackIdx);
  for (var i = 0; i < racers.length; i++) {
    var r = racers[i];
    if (racePhase === "count") break;
    /* star stickers */
    for (var j = 0; j < pk.length; j++) {
      if (pk[j].taken) continue;
      var dx = r.px - pk[j].x, dy = r.py - pk[j].y;
      if (dx * dx + dy * dy < 26 * 26) {
        pk[j].taken = true;
        if (r.isPlayer) {
          stickers++;
          popScale.sticker = performance.now();
          particles.burst("spark", pk[j].x, pk[j].y);      /* sparkle 8    */
          S.coin();                                          /* 2-note chime */
        }
      }
    }
    /* boost pads (only the player hears/feels it — AI just glides) */
    if (r.isPlayer && r.boostT <= 0) {
      for (j = 0; j < pads.length; j++) {
        var bp = geoAt(world.geo, pads[j].f * world.geo.L, pads[j].lat);
        var bx = r.px - bp.x, by = r.py - bp.y;
        if (bx * bx + by * by < 34 * 34) {
          r.boostT = 1.15;
          S.whoosh();
          banner("Boost!", false);
          particles.spawn(8, { x: r.px, y: r.py, kind: "spark", speed: 150,
            ttl: 0.5, size: 3, color: T.gold, gravity: 100 });
        }
      }
    }
  }
}

/* --------------------------------------------------------------------------
 * 11. Fixed-step simulation
 * ------------------------------------------------------------------------ */
function banner(text, big) {
  banners.push({ text: text, big: !!big, t0: performance.now() });
  if (banners.length > 3) banners.shift();
}

function simUpdate(dt) {
  simT += dt;
  particles.update(dt);

  if (scene === "race") updateRaceScene(dt);
  else if (scene === "podium") updatePodium(dt);
}

function updateRaceScene(dt) {
  var world = worlds[trackIdx];

  if (paused) return;

  if (racePhase === "count") {
    countT += dt;
    /* revving keys during the countdown */
    for (var i = 0; i < racers.length; i++) racers[i].keyA += dt * 6;
    var beats = [0.4, 1.2, 2.0];
    for (i = 0; i < 3; i++) {
      if (countT >= beats[i] && countT - dt < beats[i]) S.tick();
    }
    if (countT >= 2.8) {
      racePhase = "race";
      S.confirm();
      raceMusic(0);
      if (!DEMO) startHum();
    }
    updateCamera(dt, world);
    return;
  }

  raceT += dt;

  /* rank snapshot for rubber-band + HUD */
  var sorted = rankRacers();
  var playerProg = racers[playerIdx].prog;
  var playerIsLast = sorted[sorted.length - 1] === racers[playerIdx];

  for (i = 0; i < racers.length; i++) {
    updateRacer(racers[i], dt, world, playerProg, playerIsLast);
  }
  updatePickups(dt, world);

  /* soft kart-to-kart nudge (no wrecks — just a polite slide apart) */
  for (i = 0; i < racers.length; i++) {
    for (var j = i + 1; j < racers.length; j++) {
      var a = racers[i], b = racers[j];
      var ds = Math.abs(a.s - b.s), dl = a.lat - b.lat;
      if (ds < 30 && Math.abs(dl) < 26) {
        var push2 = (26 - Math.abs(dl)) * 0.5;
        var sgn = dl >= 0 ? 1 : -1;
        a.lat = clamp(a.lat + sgn * push2 * dt * 6, -LAT_MAX, LAT_MAX);
        b.lat = clamp(b.lat - sgn * push2 * dt * 6, -LAT_MAX, LAT_MAX);
      }
    }
  }

  setHum(racers[playerIdx].speed / racers[playerIdx].top);
  updateCamera(dt, world);

  /* finish sequence: cruise 1.4s, then the podium celebration */
  if (racePhase === "finished") {
    finishSeqT += dt;
    if (finishSeqT > 1.4) openPodium();
  }
  /* demo attract: 30s cycle = three 10s track tours */
  if (DEMO) {
    demoTrackT += dt;
    demoSparkleT += dt;
    if (demoSparkleT > 1.7) {
      demoSparkleT = 0;
      var rr = racers[Math.floor(Math.random() * racers.length)];
      particles.burst("spark", rr.px, rr.py);
    }
    if (demoTrackT > 10) {
      demoTrackT = 0;
      startRace((trackIdx + 1) % TRACKS.length, false);
    }
  }
}

function rankRacers() {
  return racers.slice().sort(function (a, b) {
    if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.prog - a.prog;
  });
}
function ordinal(n) { return ["1st", "2nd", "3rd", "4th"][n] || (n + 1) + "th"; }

function updateCamera(dt, world) {
  var p = racers[playerIdx];
  var target = p.pa;
  camA += angDiff(camA, target) * Math.min(1, dt * 6.5);
}

/* --------------------------------------------------------------------------
 * 12. Podium — the full 3-beat celebration choreography. Everyone cheers;
 *    finishing IS the win (doctrine §3f).
 * ------------------------------------------------------------------------ */
function openPodium() {
  var sorted = rankRacers();
  var place = 0;
  for (var i = 0; i < sorted.length; i++) if (sorted[i].isPlayer) place = i;
  score = stickers * 10 + [60, 45, 35, 30][place];
  var newBest = saveBest(trackIdx, raceT);

  scene = "podium";
  S.stopMusic(); musicOn = false;
  stopHum();

  podium = {
    sorted: sorted, place: place, newBest: newBest,
    t0: performance.now(), card: null, celDone: false, confAcc: 0
  };
  /* beat 1–3 via the engine's mandatory choreography (≤2s, skippable) */
  podium.cel = VG.celebrate(
    { loop: loop, particles: particles, flash: flash },
    {
      cx: CW / 2, cy: CH * 0.32,
      note: function (i) { S.fanfare(i); },
      card: function (o) { podium.card = { t0: performance.now(), ms: o.ms }; },
      finish: function () { podium.celDone = true; }
    }
  );
  if (!DEMO) {
    var res = harness.submitScore(score);
    harness.gameEnded(score);
    if (res.newRecord) setTimeout(function () { S.sticker(); }, 1900);
  }
}

function updatePodium(dt) {
  if (podium && podium.cel) podium.cel.update(dt * 1000);
  /* gentle confetti rain on the podium (budgeted, honors reducedJuice) */
  if (podium && podium.celDone && !VG.Juice.reduced) {
    podium.confAcc += dt;
    if (podium.confAcc > 0.28) {
      podium.confAcc = 0;
      particles.spawn(3, { x: Math.random() * CW, y: -10, kind: "confetti",
        speed: 30, ttl: 2.4, size: 5, gravity: 120,
        colors: [C.sun, C.leaf, C.berry, C.sky, C.violet] });
    }
  }
}

/* --------------------------------------------------------------------------
 * 13. Rendering — letterboxed 960×540 design space
 * ------------------------------------------------------------------------ */
var gFit = 1, gOx = 0, gOy = 0;
var uiButtons = [];
var pressedBtn = null;

function button(id, x, y, w, h, label, fill) {
  uiButtons.push({ id: id, x: x, y: y, w: w, h: h });
  VG.pillButton(ctx, { x: x, y: y, w: w, h: h, label: label, fill: fill,
                       fontSize: 20, pressed: pressedBtn === id });
}
function text(str, x, y, size, font, color, align) {
  ctx.font = font || "700 " + size + "px " + FDISP;
  ctx.fillStyle = color || C.ink;
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}
function outlinedText(str, x, y, size, big, fill) {
  ctx.font = (big ? "800 " : "700 ") + size + "px " + FDISP;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, size / 5.5);
  ctx.strokeStyle = T.cream;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = fill || C.ink;
  ctx.fillText(str, x, y);
}
/* tabular number rendering: fixed advance per character (§3e) */
function fixedText(str, x, y, size, color, align) {
  ctx.font = "700 " + Math.max(18, size) + "px " + FDISP;
  ctx.textBaseline = "middle";
  var adv = ctx.measureText("0").width + 1;
  var total = str.length * adv;
  var x0 = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  ctx.textAlign = "left";
  for (var i = 0; i < str.length; i++) {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = T.cream;
    ctx.strokeText(str[i], x0 + i * adv, y);
    ctx.fillStyle = color || C.ink;
    ctx.fillText(str[i], x0 + i * adv, y);
  }
}
function starIcon(x, y, r, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var rr = (i % 2 ? 0.45 : 1) * r, a = -Math.PI / 2 + i * Math.PI / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? C.sun : T.desk2;
  ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
function statStars(x, y, n) {
  for (var i = 0; i < 3; i++) starIcon(x + i * 24, y, 9, i < n);
}
function veil() {
  ctx.fillStyle = "rgba(58,43,70,0.22)";
  ctx.fillRect(0, 0, CW, CH);
}
function paperBG() {
  ctx.fillStyle = T.desk;
  ctx.fillRect(0, 0, CW, CH);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = VG.pattern(ctx, "grain", null, 3);
  ctx.fillRect(0, 0, CW, CH);
  ctx.globalAlpha = 1;
}

function render() {
  var w = view.w, h = view.h;
  ctx.save();
  ctx.fillStyle = T.desk;
  ctx.fillRect(0, 0, w, h);
  gFit = Math.min(w / CW, h / CH);
  gOx = (w - CW * gFit) / 2; gOy = (h - CH * gFit) / 2;
  ctx.translate(gOx, gOy);
  ctx.scale(gFit, gFit);
  uiButtons = [];

  if (scene === "select") drawSelect();
  else if (scene === "tracks") drawTracks();
  else if (scene === "race") drawRace();
  else if (scene === "podium") drawPodium();

  flash.render(ctx, CW, CH);
  ctx.restore();
}

/* ------------------------------------------------------------- the race -- */
function drawRace() {
  var world = worlds[trackIdx], p = racers[playerIdx];
  var now = performance.now();

  ctx.save();                                    /* paper desk underlay      */
  ctx.fillStyle = T.desk;
  ctx.fillRect(0, 0, CW, CH);
  ctx.restore();

  /* camera: rotate the shoebox so the player drives "up" */
  ctx.save();
  ctx.translate(CW / 2, CH * 0.62);
  ctx.rotate(-camA - Math.PI / 2);
  ctx.translate(-p.px, -p.py);

  ctx.drawImage(world.canvas, world.ox, world.oy);

  /* star-sticker collectibles (spin = scaleX wobble, seeded phase) */
  var pk = world.pickups;
  for (var i = 0; i < pk.length; i++) {
    if (pk[i].taken) continue;
    var spin = Math.sin(simT * 2.6 + pk[i].phase);
    ctx.save();
    ctx.translate(pk[i].x, pk[i].y);
    ctx.fillStyle = D.inkRGBA(0.25);
    ctx.beginPath(); ctx.ellipse(2, 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(0.35 + 0.65 * Math.abs(spin), 1);
    ctx.beginPath();
    for (var k = 0; k < 10; k++) {
      var rr = (k % 2 ? 0.45 : 1) * 11, a2 = -Math.PI / 2 + k * Math.PI / 5;
      if (k === 0) ctx.moveTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
      else ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = C.sun; ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  /* racers: draw from back of the pack forward */
  var order = racers.slice().sort(function (a, b) { return a.prog - b.prog; });
  for (i = 0; i < order.length; i++) drawKart(order[i], now);

  particles.render(ctx);                          /* world-space juice       */
  ctx.restore();

  /* crayon speed lines at 0.4 alpha (brief), screen space */
  var sf = p.speed / p.top;
  if (sf > 0.7 && !VG.Juice.reduced) drawSpeedLines(sf);

  drawHUD(now);
  drawBanners(now);
  if (racePhase === "count") drawCountdown();
  if (paused) drawPaused();
  if (DEMO) drawDemoBadge();
}

function drawKart(r, now) {
  ctx.save();
  ctx.translate(r.px, r.py);
  ctx.rotate(r.pa + Math.PI / 2);                 /* sprite faces up        */
  var sx = 1, sy = 1;
  if (r.squashT >= 0) {                           /* boing squash (§3b hit) */
    var t = Math.min(1, r.squashT / 0.1);
    sx = lerp(1.3, 1, E.easeOut(t));
    sy = lerp(0.7, 1, E.easeOut(t));
  }
  if (r.boostT > 0) { sx *= 0.94; sy *= 1.08; }   /* boost stretch          */
  ctx.scale(sx, sy);
  /* flat shadow, then the cached kart body */
  ctx.fillStyle = D.inkRGBA(0.3);
  ctx.beginPath(); ctx.ellipse(3, 4, 20, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(kartSprites[r.ch.id], -24, -28, 48, 56);
  /* the wind-up key — visibly rotating with speed (brief) */
  ctx.restore();
  ctx.save();
  ctx.translate(r.px - Math.cos(r.pa) * 20, r.py - Math.sin(r.pa) * 20);
  drawKey(ctx, 0, 0, r.keyA, 0.95);
  ctx.restore();

  /* name tag: shape+name redundancy, never color alone (§3g). Drawn upright
   * in screen space by cancelling the camera rotation. */
  ctx.save();
  ctx.translate(r.px, r.py);
  ctx.rotate(camA + Math.PI / 2);
  var tw = 18 + r.ch.name.length * 8.2;
  var tagY = -46 + (VG.Juice.reduced ? 0 : Math.sin(simT * 2.2 + r.aiPhase) * 2);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = r.isPlayer ? T.gold : T.cream;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-tw / 2, tagY - 12, tw, 22, 11); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.font = "700 18px " + FBODY;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(r.ch.name.split(" ")[0], 0, tagY);
  ctx.restore();
}

/* crayon speed lines: 3 jittered passes @0.4 alpha (brief value) */
var speedLineSeed = (function () {
  var rnd = VG.mulberry32(VG.hashSeed("speedlines")), out = [];
  for (var i = 0; i < 6; i++) {
    out.push({ side: i < 3 ? -1 : 1, x: 60 + rnd() * 160, y: 120 + rnd() * 300,
               len: 46 + rnd() * 42, j: rnd() * 10 });
  }
  return out;
})();
function drawSpeedLines(sf) {
  var slide = (simT * 540 * sf) % 90;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = C.inkSoft;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 3;
  for (var i = 0; i < speedLineSeed.length; i++) {
    var L = speedLineSeed[i];
    var x = L.side < 0 ? L.x : CW - L.x;
    var y = ((L.y + slide) % (CH + 90)) - 45;
    var dx = L.side * -14;                        /* stream backwards       */
    for (var pass = 0; pass < 3; pass++) {
      var jy = Math.sin(L.j + pass * 2.1) * 1.2;  /* stable jitter, no shimmer */
      ctx.beginPath();
      ctx.moveTo(x + jy, y);
      ctx.lineTo(x + dx + jy, y + L.len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* --------------------------------------------------------------- HUD ----- */
function drawHUD(now) {
  var p = racers[playerIdx], world = worlds[trackIdx];

  /* washi-tape LAP counter — big and friendly */
  VG.washiPanel(ctx, 18, 14, 176, 78, { tape: world.def.tape, scale: 1 });
  text("LAP", 62, 38, 18, "700 18px " + FDISP, C.inkSoft, "center");
  fixedText(Math.min(p.lap + 1, LAPS) + "/" + LAPS, 106, 66, 34, C.ink, "center");

  /* race time, top center (tabular) */
  VG.washiPanel(ctx, CW / 2 - 84, 14, 168, 48, { tape: C.sun, scale: 1 });
  fixedText(fmtTime(racePhase === "count" ? 0 : raceT), CW / 2, 40, 22, C.ink, "center");

  /* position — "2nd of 4" with character icon chips in rank order */
  VG.washiPanel(ctx, CW - 268, 14, 250, 78, { tape: C.berry, scale: 1 });
  var sorted = rankRacers();
  var place = 0;
  for (var i = 0; i < sorted.length; i++) if (sorted[i].isPlayer) place = i;
  text(ordinal(place) + " of 4", CW - 196, 40, 24, "800 24px " + FDISP, C.ink, "center");
  for (i = 0; i < sorted.length; i++) {
    var cx2 = CW - 244 + i * 44, cy2 = 68;
    if (sorted[i].isPlayer) {
      ctx.strokeStyle = C.sun; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx2, cy2, 19, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.drawImage(chipSprites[sorted[i].ch.id], cx2 - 15, cy2 - 15, 30, 30);
  }

  /* sticker count, bottom-left (tick-up pop) */
  VG.washiPanel(ctx, 18, CH - 86, 196, 68, { tape: C.leaf, scale: 1 });
  starIcon(48, CH - 52, 14, true);
  text("Stickers", 118, CH - 64, 18, "700 18px " + FDISP, C.inkSoft, "center");
  var popK = popScale.sticker ? Math.min(1, (now - popScale.sticker) / 200) : 1;
  var popS = 1 + 0.25 * Math.sin(Math.PI * popK) * (popK < 1 ? 1 : 0);
  ctx.save();
  ctx.translate(118, CH - 38); ctx.scale(popS, popS);
  fixedText(String(stickers), 0, 0, 26, C.ink, "center");
  ctx.restore();

  /* pause + quit pills (≥56px targets) */
  if (!DEMO) {
    button("pause", CW - 224, CH - 76, 96, 56, "Pause", C.sun);
    button("quit", CW - 118, CH - 76, 100, 56, "Quit", C.paper2);
  }
}

function drawBanners(now) {
  for (var i = 0; i < banners.length; i++) {
    var b = banners[i], t = (now - b.t0) / 1000;
    if (t > 1.5) { banners.splice(i, 1); i--; continue; }
    var inK = Math.min(1, t / 0.28);               /* medium open, pop       */
    var s = 0.9 + 0.1 * E.pop(inK);
    var alpha = t > 1.05 ? 1 - (t - 1.05) / 0.45 : 1;   /* exit ≈75% of enter */
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(CW / 2, 132 - i * 44 - 10 * inK);
    ctx.scale(s, s);
    outlinedText(b.text, 0, 0, b.big ? 32 : 24, b.big);
    ctx.restore();
  }
}

function drawCountdown() {
  var label = countT < 0.4 ? "" : countT < 1.2 ? "3" : countT < 2.0 ? "2"
            : countT < 2.8 ? "1" : "GO!";
  if (!label) return;
  var beat = countT < 2.8 ? (countT - 0.4) % 0.8 : countT - 2.8;
  var k = Math.min(1, beat / 0.22);
  var s = 0.8 + 0.2 * E.pop(k);
  ctx.save();
  ctx.translate(CW / 2, CH * 0.42);
  ctx.scale(s, s);
  outlinedText(label, 0, 0, label === "GO!" ? 57 : 43, true,
               label === "GO!" ? C.leaf : C.ink);
  ctx.restore();
}

function drawPaused() {
  veil();
  ctx.save();
  ctx.translate(CW / 2, CH / 2);
  VG.washiPanel(ctx, -190, -150, 380, 300, { tape: C.sky, fill: C.paper, scale: 1 });
  outlinedText("Paused", 0, -96, 32, true);
  text("Pit stop! The toys wait for you.", 0, -52, 18, "600 18px " + FBODY, C.inkSoft);
  button("resume", -120, -16, 240, 56, "Resume", C.leaf);
  button("restart", -120, 52, 114, 56, "Redo", C.sun);
  button("quit2", 6, 52, 114, 56, "Quit", C.paper2);
  ctx.restore();
}

function drawDemoBadge() {
  ctx.save();
  ctx.translate(CW - 76, 116); ctx.rotate(3 * Math.PI / 180);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = C.violet;
  ctx.beginPath(); ctx.roundRect(-52, -16, 104, 32, 16); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  text("DEMO", 0, 1, 18, "800 18px " + FDISP, T.cream);
  ctx.restore();
}

/* --------------------------------------------------------------------------
 * 14. Character select — big procedural portraits, stats as friendly
 *     1–3 star stickers (§4 roster requirement).
 * ------------------------------------------------------------------------ */
function drawSelect() {
  paperBG();
  var now = performance.now();

  /* cardboard banner title */
  ctx.save();
  ctx.translate(CW / 2, 64);
  ctx.rotate(-0.012);
  VG.drawSprite(ctx, { x: 0, y: 0, w: 620, h: 84, fill: T.board, seed: "titlecard",
                       scale: 1, radius: 14, texture: "grain" });
  /* corrugation hint on the banner */
  ctx.strokeStyle = T.fluteD; ctx.lineWidth = 1.5;
  for (var fx = -296; fx < 300; fx += 12) {
    ctx.beginPath(); ctx.moveTo(fx, -34); ctx.lineTo(fx, 34); ctx.stroke();
  }
  outlinedText("CARDBOARD GRAND PRIX", 0, -4, 43, true);
  /* washi tapes pinning the banner */
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = C.violet; ctx.save(); ctx.rotate(-0.07); ctx.fillRect(-330, -12, 54, 18); ctx.restore();
  ctx.fillStyle = C.sky; ctx.save(); ctx.rotate(0.06); ctx.fillRect(278, -8, 54, 18); ctx.restore();
  ctx.globalAlpha = 1;
  ctx.restore();
  text("Pick your racer!", CW / 2, 122, 24, "700 24px " + FDISP, C.inkSoft);

  /* four cards */
  for (var i = 0; i < 4; i++) {
    var ch = ROSTER[i];
    var cx3 = 44 + i * 224, cy3 = 150, cw2 = 204, ch2 = 300;
    var sel = i === selIdx;
    var bob = sel && !VG.Juice.reduced ? Math.sin(now / 240) * 3 : 0;
    ctx.save();
    ctx.translate(cx3 + cw2 / 2, cy3 + ch2 / 2 + bob);
    ctx.scale(sel ? 1.03 : 1, sel ? 1.03 : 1);
    VG.washiPanel(ctx, -cw2 / 2, -ch2 / 2, cw2, ch2,
                  { tape: sel ? C.sun : C.paper3, fill: sel ? C.paper : C.paper2, scale: 1 });
    if (sel) {
      ctx.strokeStyle = C.sun; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.roundRect(-cw2 / 2 - 3, -ch2 / 2 - 3, cw2 + 6, ch2 + 6, 15); ctx.stroke();
    }
    /* Big portrait: the supplied cast art is framed like a collectible card;
       Wind-Up Tin remains a purpose-drawn toy. */
    if (!drawSourcePortrait(ctx, ch.id, -58, -ch2 / 2 + 22, 116, 116)) {
      ctx.drawImage(portraitSprites[ch.id], -58, -ch2 / 2 + 22, 116, 116);
    }
    text(ch.name, 0, 58, 20, "800 20px " + FDISP, C.ink);
    /* stat stickers: Speed / Grip as 1–3 stars */
    text("Speed", -62, 92, 18, "600 18px " + FBODY, C.inkSoft, "left");
    statStars(28, 92, ch.speed);
    text("Grip", -62, 118, 18, "600 18px " + FBODY, C.inkSoft, "left");
    statStars(28, 118, ch.grip);
    ctx.restore();
    /* tap targets */
    uiButtons.push({ id: "sel" + i, x: cx3, y: cy3, w: cw2, h: ch2 });
  }

  /* selected blurb + go button */
  text(ROSTER[selIdx].blurb, CW / 2, 472, 20, "600 20px " + FBODY, C.inkSoft);
  button("gorace", CW / 2 - 110, 494, 220, 40 + 16, "Race!", C.sun);
  text("\u2190 \u2192 choose \u00B7 ENTER race", 140, 512, 18, "600 18px " + FBODY, C.inkSoft, "left");
}

/* --------------------------------------------------------------------------
 * 15. Track select — three handcrafted circuits with mini-map previews
 * ------------------------------------------------------------------------ */
function drawTracks() {
  paperBG();
  outlinedText("Pick a circuit!", CW / 2, 54, 32, true);
  for (var i = 0; i < 3; i++) {
    var cx4 = 40 + i * 300, cy4 = 100, cw3 = 280, ch3 = 356;
    var sel = i === trackSelIdx;
    ctx.save();
    ctx.translate(cx4 + cw3 / 2, cy4 + ch3 / 2);
    ctx.scale(sel ? 1.02 : 1, sel ? 1.02 : 1);
    VG.washiPanel(ctx, -cw3 / 2, -ch3 / 2, cw3, ch3,
                  { tape: TRACKS[i].tape, fill: sel ? C.paper : C.paper2, scale: 1 });
    if (sel) {
      ctx.strokeStyle = C.sun; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.roundRect(-cw3 / 2 - 3, -ch3 / 2 - 3, cw3 + 6, ch3 + 6, 15); ctx.stroke();
    }
    ctx.drawImage(previews[i], -cw3 / 2 + 28, -ch3 / 2 + 22, 224, 150);
    text(TRACKS[i].name, 0, 46, 22, "800 22px " + FDISP, C.ink);
    text(TRACKS[i].hint, 0, 76, 18, "600 18px " + FBODY, C.inkSoft);
    text(LAPS + " laps", 0, 104, 18, "700 18px " + FDISP, C.violet);
    var bt = bestTimes[i];
    text(bt == null ? "No best time yet" : "Best " + fmtTime(bt), 0, 132, 18,
         "600 18px " + FBODY, bt == null ? C.inkSoft : C.berry);
    ctx.restore();
    uiButtons.push({ id: "trk" + i, x: cx4, y: cy4, w: cw3, h: ch3 });
  }
  button("startRace", CW / 2 - 110, 478, 220, 56, "Start!", C.sun);
  text("\u2190 \u2192 choose \u00B7 ENTER start \u00B7 ESC back", 20, 512, 18,
       "600 18px " + FBODY, C.inkSoft, "left");
}

/* --------------------------------------------------------------------------
 * 16. Podium — everyone cheered, winner bouncing; honest praise only (§3f)
 * ------------------------------------------------------------------------ */
function drawPodium() {
  paperBG();
  var now = performance.now();
  if (!podium) return;
  var t = (now - podium.t0) / 1000;

  /* stage: three cardboard boxes + floor spot */
  var spots = [
    { x: CW / 2,        y: 322, boxH: 150, label: "1" },
    { x: CW / 2 - 190,  y: 350, boxH: 104, label: "2" },
    { x: CW / 2 + 190,  y: 362, boxH: 82,  label: "3" },
    { x: CW / 2 + 350,  y: 400, boxH: 0,   label: "\u2605" }
  ];
  var orderMap = [0, 1, 2, 3];                     /* podium slot → rank    */

  /* crayon sun watching over (0.1 parallax feel, static is fine here) */
  VG.drawSprite(ctx, { x: 96, y: 84, w: 96, h: 96, blob: true, fill: C.sun,
                       seed: "podiumsun", scale: 1, highlight: false });

  outlinedText("The Podium!", CW / 2, 64, 43, true);

  for (var i = 0; i < 4; i++) {
    var spot = spots[i];
    var r = podium.sorted[orderMap[i]];
    /* the cardboard box */
    if (spot.boxH > 0) {
      VG.drawSprite(ctx, { x: spot.x, y: spot.y + 26, w: 128, h: spot.boxH,
        fill: T.board, seed: "podbox" + i, scale: 1, radius: 8, texture: "grain" });
      ctx.fillStyle = T.fluteD;
      ctx.fillRect(spot.x - 60, spot.y + 26 - spot.boxH / 2 + 8, 120, 3);
      text(spot.label, spot.x, spot.y + 30, 28, "800 28px " + FDISP, C.inkSoft);
    }
    /* character: everyone cheers (bob), winner does the happy bounce */
    var isWin = i === 0;
    var bounce = 0, sq = 1;
    if (!VG.Juice.reduced) {
      if (isWin) {
        var bk = (t * 2.1) % 1;
        bounce = -Math.abs(Math.sin(bk * Math.PI)) * 26;
        sq = bk > 0.86 ? 0.88 : 1;                 /* landing squash        */
      } else {
        bounce = Math.sin(t * 3 + i * 1.7) * 5;
      }
    }
    ctx.save();
    ctx.translate(spot.x, spot.y - spot.boxH / 2 - 40 + bounce);
    ctx.scale(1, sq);
    ctx.fillStyle = D.inkRGBA(0.3);
    ctx.beginPath(); ctx.ellipse(3, 44, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
    var size = isWin ? 88 : 72;
    ctx.drawImage(portraitSprites[r.ch.id], -size / 2, -size / 2 - 6, size, size);
    /* tiny waving hand (follow-through: lags the bob by a beat) */
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineCap = "round";
    var wave = VG.Juice.reduced ? 0 : Math.sin(t * 6 + i) * 0.5;
    ctx.save();
    ctx.translate(size / 2 - 4, 6);
    ctx.rotate(-0.9 + wave);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -10); ctx.stroke();
    ctx.fillStyle = r.ch.body;
    ctx.beginPath(); ctx.arc(14, -10, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
    /* rank ribbon below (name + place = never color alone) */
    text(ordinal(i) + " " + r.ch.name, spot.x, spot.y + 64, 18,
         "700 18px " + FBODY, C.ink);
  }

  particles.render(ctx);                           /* confetti rain          */

  /* beat-3 result card: springs in with pop + 8px rise */
  if (podium.card) {
    var ck = Math.min(1, (now - podium.card.t0) / podium.card.ms);
    var cs = 0.9 + 0.1 * E.pop(ck);
    ctx.save();
    ctx.translate(CW / 2, 168 - 8 * ck);
    ctx.scale(cs, cs);
    VG.washiPanel(ctx, -250, -58, 500, 116, { tape: T.gold, fill: C.paper, scale: 1 });
    var praise = podium.place === 0 ? "You won the Grand Prix!"
               : podium.place === 1 ? "What a finish — so close to gold!"
               : podium.place === 2 ? "What a finish — on the podium!"
               : "What a finish — you raced the whole way!";
    outlinedText(praise, 0, -26, 24, false);
    text(ordinal(podium.place) + " of 4 \u00B7 " + stickers + " stickers \u00B7 " +
         fmtTime(racers[playerIdx].finishTime), 0, 8, 20, "700 20px " + FDISP, C.ink);
    if (podium.newBest) text("\u2605 New best time! \u2605", 0, 38, 20,
                             "800 20px " + FDISP, C.berry);
    else if (bestTimes[trackIdx] != null) text("Best " + fmtTime(bestTimes[trackIdx]),
                                               0, 38, 18, "600 18px " + FBODY, C.inkSoft);
    ctx.restore();
    /* buttons appear with the card (skippable celebration = consent rule) */
    button("again", CW / 2 - 236, 470, 152, 56, "Again!", C.sun);
    button("racers", CW / 2 - 76, 470, 152, 56, "Racers", C.sky);
    button("quit3", CW / 2 + 84, 470, 152, 56, "Quit", C.paper2);
  } else if (!VG.Juice.reduced) {
    text("Get ready to cheer\u2026", CW / 2, 168, 20, "600 20px " + FBODY, C.inkSoft);
  }
}

/* --------------------------------------------------------------------------
 * 17. Input — keyboard via engine (120ms buffer built in), hold-halves
 *     touch steering with auto-throttle (one-switch friendly, §3g).
 * ------------------------------------------------------------------------ */
function togglePause() {
  if (scene !== "race") return;
  paused = !paused;
  S.tick();
  if (paused) { S.stopMusic(); musicOn = false; stopHum(); }
  else {
    raceMusic(racers[playerIdx].lap);
    if (hurryFired) S.hurry();
    if (!DEMO) startHum();
  }
}
function quitToShelf() {
  S.tick();
  S.stopMusic(); musicOn = false;
  stopHum();
  if (!DEMO) harness.gameQuit(score);
  scene = "select";
  paused = false;
}

input.onAction(function (a) {
  S.unlock();
  if (DEMO) return;
  if (scene === "select") {
    if (a === "left") { selIdx = (selIdx + 3) % 4; S.tick(); }
    else if (a === "right") { selIdx = (selIdx + 1) % 4; S.tick(); }
    else if (a === "action" || a === "up") { S.confirm(); scene = "tracks"; }
  } else if (scene === "tracks") {
    if (a === "left") { trackSelIdx = (trackSelIdx + 2) % 3; S.tick(); }
    else if (a === "right") { trackSelIdx = (trackSelIdx + 1) % 3; S.tick(); }
    else if (a === "action") { S.confirm(); startRace(trackSelIdx, false); }
    else if (a === "pause") { S.tick(); scene = "select"; }
  } else if (scene === "race") {
    if (a === "pause") togglePause();
  } else if (scene === "podium") {
    if (podium && podium.cel && !podium.cel.finished && a === "action") podium.cel.skip();
    else if (podium && podium.card) {
      if (a === "action") { S.confirm(); startRace(trackIdx, false); }
    }
  }
});

window.addEventListener("keydown", function (e) {
  if (e.key.toLowerCase() === "j") VG.Juice.toggle();
});
window.addEventListener("pointerdown", function () { S.unlock(); }, { passive: true });

/* canvas buttons */
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
      setTimeout(function () { pressedBtn = null; }, 110);   /* 90ms press feel */
      pressButton(b.id);
      return;
    }
  }
  /* touch steering: hold left/right halves (auto-throttle always on) */
  if (scene === "race" && !paused && !DEMO && e.pointerType !== "mouse") {
    touchDirs[e.pointerId] = pt[0] < CW / 2 ? -1 : 1;
    cv.canvas.setPointerCapture && cv.canvas.setPointerCapture(e.pointerId);
  }
});
cv.canvas.addEventListener("pointerup", function (e) { delete touchDirs[e.pointerId]; });
cv.canvas.addEventListener("pointercancel", function (e) { delete touchDirs[e.pointerId]; });

function pressButton(id) {
  if (id === "pause") { togglePause(); return; }
  S.tick();
  if (id === "quit" || id === "quit2" || id === "quit3") { quitToShelf(); return; }
  if (id === "resume") { togglePause(); return; }
  if (id === "restart") { startRace(trackIdx, false); return; }
  if (id === "gorace") { S.confirm(); scene = "tracks"; return; }
  if (id === "startRace") { S.confirm(); startRace(trackSelIdx, false); return; }
  if (id === "again") { S.confirm(); startRace(trackIdx, false); return; }
  if (id === "racers") { S.confirm(); scene = "select"; return; }
  if (id.indexOf("sel") === 0) {
    var n = parseInt(id.slice(3), 10);
    if (n === selIdx) { S.confirm(); scene = "tracks"; }
    else { selIdx = n; S.tick(); }
    return;
  }
  if (id.indexOf("trk") === 0) {
    var m = parseInt(id.slice(3), 10);
    if (m === trackSelIdx) { S.confirm(); startRace(trackSelIdx, false); }
    else { trackSelIdx = m; S.tick(); }
  }
}

/* --------------------------------------------------------------------------
 * 18. Boot
 * ------------------------------------------------------------------------ */
var loop = VG.createLoop({
  update: function (dt) { simUpdate(dt); },
  render: function () { render(); }
});

loadBests();
bakePortraits();
for (var bi = 0; bi < TRACKS.length; bi++) {
  buildWorld(bi);
  previews.push(bakePreview(bi));
}

if (DEMO) {
  /* attract mode: all four wind-up toys cruise circuits, 10s per track,
   * looping through all three = the 30-second screensaver cycle */
  startRace(Math.floor(Math.random() * TRACKS.length), false);
} else {
  scene = "select";
}

/* headless test hook (opt-in, inert otherwise) */
if (window.CARDBOARD_DEBUG) {
  window.CardboardDebug = {
    get scene() { return scene; },
    get racers() { return racers; },
    get raceT() { return raceT; },
    get stickers() { return stickers; },
    start: startRace, step: simUpdate, render: render,
    pause: togglePause, quit: quitToShelf
  };
}
loop.start();
})();
