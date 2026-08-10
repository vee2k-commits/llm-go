/* ============================================================================
 * game.js — "Violet's Big Fold-Out", a pop-up-book platformer for Vee Arcade
 *
 * Built ON the engine (vee-game.js / vee-sfx.js), never replacing it:
 *   - DESIGN tokens for every color/easing/timing; no hex values below
 *     except through D.colors / the level palettes in levels.js
 *   - 120ms input buffer + 100ms coyote via engine helpers (§3f-5)
 *   - celebrate() 3-beat choreography, ≤3 effects per event, pool ≤256
 *   - gentle failure: dizzy stars + sigh + checkpoint retry ≤5s, no shake
 *   - harness postMessage lifecycle + localStorage high scores
 * ========================================================================== */
(function () {
"use strict";
var VG = window.VeeGame, D = VG.DESIGN, C = D.colors, E = D.easing;
var SFX = window.VeeSFX;
var FO = window.FoldOut, ART = FO.art;
var FONT_D = ART.FONT_D;

var DEMO = /demo\.html/.test(location.pathname);

/* ------------------------------------------------------------ constants -- */
var T = 32;                                  /* tile size (world px)       */
var VIEW_W = 960, VIEW_H = 540;              /* reference viewport         */
var ROWS = FO.levels.ROWS;
var GRAV = 1500, FALL_MAX = 720;
var MOVE_ACC = 950, MOVE_FRIC = 1500, RUN_MAX = 224;
var JUMP_V = -560, JUMP_CUT = -0.42;
var STOMP_V = -430, SPRING_V = [560, 700, 840];
var COYOTE_MS = D.fairness.coyoteMs;         /* 100ms */
var GRACE_MS = D.fairness.platformGraceMs;   /* 250ms */

var CFG = { demo: DEMO };
var harness = VG.createHarness(DEMO ? "mario-demo" : "mario");

/* ------------------------------------------------------------ boot ------- */
var cv = VG.setupCanvas(document.getElementById("stage"), { width: VIEW_W, height: VIEW_H });
var ctx = cv.ctx, view = cv.view, SCALE = 1;
(function syncScale() { SCALE = view.w / VIEW_W; requestAnimationFrame(syncScale); })();

var particles = new VG.ParticlePool();
var shake = VG.createShake();
var flash = VG.createFlash();
var input = VG.createInput();
var scoreC = new VG.ScoreCounter();
var coyote = input.coyote(COYOTE_MS);

var LEVELS = FO.levels.all();

/* ------------------------------------------------------------ state ------ */
var mode = "title";
var L = null, LIDX = 0, SP = null;
var score = 0, runCoins = 0, runStars = 0;
var streak = 0, streakFrozen = false;
var simT = 0, hurryFired = false, hurryToastAt = -1e9, nearMissAt = -1e9;
var celebrating = null, cardAnim = null, result = null, clearStats = null;
var cardT = 0, cardShown = false, golden = false;
var dizzyT = 0, dizzyReason = "";
var flagSlide = 0, clearCount = 0;
var cam = { x: 0, y: 0 };
var unlocked = 0;
var titleSel = 0, pauseSel = 0, clearSel = 0, pressFx = 0;
var oneSwitch = false, touchOn = false;
var touchZones = { left: false, right: false, jump: false }, touchJumpUsed = false;
var demoT = 0, DEMO_LEN = 30, demoClearT = 0;
var pausedMusicTier = 0;

try { unlocked = Math.min(LEVELS.length - 1,
  parseInt(localStorage.getItem("vee.mario.unlocked") || "0", 10) || 0); } catch (e) {}
try { if (localStorage.getItem("vee.mario.oneswitch") === "1") oneSwitch = true; } catch (e) {}

var P = null;                                  /* player */
function freshPlayer(x, y) {
  return {
    x: x, y: y, w: 24, h: 38,
    vx: 0, vy: 0, dir: 1,
    grounded: true, riding: null, graceUntil: 0,
    invUntil: 0, shield: false,
    sx: 1, sy: 1, sqFrom: 0, sqMs: 1, sqFS: 1, sqTS: 1,
    blinkNext: 2200, blinkT: -1,
    runPhase: 0, moving: false, dizzy: false, happy: false,
    scarf: [], prevY: y, prevVy: 0, cutDone: false
  };
}

var toasts = [], pops = [], flyCoins = [], buddies = [];
var enemies = [];                       /* runtime pals (defs stay pristine) */

/* rebuild solid/spikes/blocks from the pristine ASCII page so broken gift
   blocks and used blocks come back on every fresh page-turn */
function rebuildWorld(Lv) {
  var r, c, k;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < Lv.w; c++) {
      k = Lv.chars[r].charAt(c) || ".";
      Lv.solid[r][c] = (k === "#" || k === "t" || k === "T" ||
                        k === "X" || k === "B" || k === "?");
      Lv.spikes[r][c] = (k === "^");
      if (k === "X" || k === "B" || k === "?") {
        Lv.blocks[r + "," + c] = { r: r, c: c, kind: k, used: false, bump: 0 };
      } else {
        delete Lv.blocks[r + "," + c];
      }
    }
  }
}

/* ============================================================ LEVEL LIFE */
function loadLevel(i, fresh) {
  LIDX = i;
  L = LEVELS[i];
  SP = ART.build(L);
  /* reset dynamic level state */
  var j;
  rebuildWorld(L);
  for (j = 0; j < L.coins.length; j++) L.coins[j].got = false;
  for (j = 0; j < L.stars.length; j++) L.stars[j].got = false;
  for (j = 0; j < L.flags.length; j++) L.flags[j].active = false;
  respawn(true);
  particles.p.length = 0; flyCoins.length = 0; buddies.length = 0; pops.length = 0;
  hurryFired = false; celebrating = null; cardAnim = null; flagSlide = 0;
  if (fresh) { runCoins = 0; runStars = 0; streak = 0; streakFrozen = false; }
  cam.x = Math.max(0, Math.min(P.x - VIEW_W * 0.4, L.w * T - VIEW_W));
  cam.y = 0;
  cardT = 0; cardShown = false;
  mode = "card";
  startMusic();
}

function respawn(initial) {
  var cp = L.checkpoint;
  P = freshPlayer(cp.x * T, (cp.y - 0.02) * T);
  L.checkpoint.active = true;
  /* gentle retry keeps the run honest but never cruel: meta (coins, score)
     persists; the world resets its hazards (§3f-4: streaks reward) */
  var j;
  enemies.length = 0;
  for (j = 0; j < L.enemies.length; j++) enemies.push(spawnEnemy(L.enemies[j]));
  for (j = 0; j < L.springs.length; j++) { L.springs[j].step = 0; L.springs[j].compress = 0; }
  celebrating = null; dizzyT = 0;
  if (!initial) startMusic();
}

function spawnEnemy(def) {
  var x0 = def.x * T, y0 = def.y * T;
  return {
    x0: x0, y0: y0, x: x0, y: y0,
    vx: 0, vy: 0,
    face: -1, state: "walk", t: 0,
    seed: "pal" + Math.round(x0),
    wobbleSeed: x0,
    dead: false, flatT: 0
  };
}

/* ------------------------------------------------------------- music ---- */
function startMusic() {
  if (CFG.demo || SFX.muted) return;
  SFX.startMusic({ bpm: 100, seed: 40 + LIDX * 13, tier: LIDX, key: "C" });
}
function stopMusic() { SFX.stopMusic(); }

/* ============================================================ PHYSICS ---- */
function isSolidC(c, r) {
  if (c < 0 || c >= L.w) return true;
  if (r < 0 || r >= ROWS) return false;
  return L.solid[r][c];
}
function isSpikeC(c, r) {
  if (c < 0 || c >= L.w || r < 0 || r >= ROWS) return false;
  return L.spikes[r][c];
}
function moverPos(m, t) {
  var ph = t * m.speed * Math.PI * 2 + VG.hashSeed(m.seed) % 7;
  if (m.axis === "h") return { x: (m.c + 0.5) * T + Math.sin(ph) * m.range * T, y: (m.r + 0.5) * T };
  if (m.axis === "v") return { x: (m.c + 0.5) * T, y: (m.r + 0.5) * T + Math.sin(ph) * m.range * T };
  return { x: (m.c + 0.5) * T + Math.sin(ph) * m.range * T * 1.6,
           y: (m.r + 0.5) * T + Math.sin(ph * 2) * m.range * T * 0.5 };
}

function updatePlayer(dt) {
  var p = P, i;
  if (mode === "clear") {                       /* flag-slide + happy hop  */
    p.vy = Math.min(p.vy + GRAV * dt, FALL_MAX);
    p.y += p.vy * dt;
    var gy = groundTopAt(p.x);
    if (p.y >= gy - 0.01) { p.y = gy; p.vy = -190; p.happy = true; }
    p.happy = true;
    animBits(dt);
    return;
  }

  /* ---- input: arrows-only parity + one-switch auto-run --------------- */
  var dir = (input.isHeld("right") ? 1 : 0) - (input.isHeld("left") ? 1 : 0);
  if (CFG.demo) dir = 1;
  else if (oneSwitch) dir = 1;
  if (touchZones.left) dir = -1;
  if (touchZones.right) dir = 1;
  var ap = autopilot();
  if (ap.dir !== 0) dir = ap.dir;

  if (dir !== 0) {
    p.vx += dir * MOVE_ACC * dt;
    p.dir = dir;
  } else {
    var f = MOVE_FRIC * dt;
    if (Math.abs(p.vx) <= f) p.vx = 0; else p.vx -= Math.sign(p.vx) * f;
  }
  p.vx = Math.max(-RUN_MAX, Math.min(RUN_MAX, p.vx));

  /* ---- ride mover before own physics (carry) ------------------------- */
  for (i = 0; i < L.movers.length; i++) {
    var m0 = L.movers[i];
    var np = moverPos(m0, simT);
    m0.dx = np.x - m0.x; m0.dy = np.y - m0.y;
    m0.x = np.x; m0.y = np.y;
  }
  if (p.riding) {
    p.x += p.riding.dx || 0;
    p.y += p.riding.dy || 0;
    if (oneWayBelow(p, p.riding.x - 34, p.riding.y - 10, 68, 10) === null) {
      p.riding = null;
      p.graceUntil = performance.now() + GRACE_MS;      /* 250ms disembark grace */
    }
  }

  /* ---- jump: buffered + coyote, variable height ---------------------- */
  var wantJump = input.consumeBuffered("action") || input.consumeBuffered("up") || ap.jump;
  if (touchZones.jump && !touchJumpUsed) { wantJump = true; touchJumpUsed = true; }
  var canJumpNow = p.grounded || performance.now() < p.graceUntil || coyote.canJump();
  if (wantJump && canJumpNow) doJump(p);
  /* variable height: releasing early cuts the rise */
  var held = input.isHeld("action") || input.isHeld("up") || touchZones.jump || ap.hold;
  if (!held && p.vy < -140 && !p.cutDone) { p.vy *= -JUMP_CUT; p.cutDone = true; }

  /* ---- integrate ----------------------------------------------------- */
  p.prevY = p.y; p.prevVy = p.vy;
  p.vy = Math.min(p.vy + GRAV * dt, FALL_MAX);
  p.x += p.vx * dt;
  resolveH(p);
  p.y += p.vy * dt;
  var landed = resolveV(p, dt);
  if (!landed) checkOneWays(p, ap);
  if (p.grounded) { coyote.land(); p.graceUntil = 0; }

  /* ---- world interactions -------------------------------------------- */
  checkHazards();
  checkPickups();
  checkSprings();
  checkFlags();
  checkFlagFinish();

  if (p.y > ROWS * T + 60) gentleFail("fall");

  /* ---- hurry state: last stretch, music only (no timers in tier 1) --- */
  if (!hurryFired && L.flag && p.x > (L.flag.x * T) - VIEW_W * 0.75) {
    hurryFired = true;
    hurryToastAt = performance.now();
    SFX.hurry();
    toast("Almost there!");
  }

  animBits(dt);
}

function doJump(p) {
  p.vy = JUMP_V;
  p.grounded = false; p.riding = null; p.cutDone = false;
  setSquash(D.squash.jumpLaunch.sx, D.squash.jumpLaunch.sy, D.squash.jumpLaunch.ms);
  SFX.jump();
  dust(p.x, p.y + p.h / 2, 4);
}

function resolveH(p) {
  var hw = p.w / 2 - 2, top = p.y - p.h / 2 + 4, bot = p.y + p.h / 2 - 2;
  if (p.vx > 0) {
    var cx = Math.floor((p.x + hw) / T);
    if (isSolidC(cx, Math.floor(top / T)) || isSolidC(cx, Math.floor(bot / T)) ||
        isSolidC(cx, Math.floor((p.y) / T))) {
      p.x = cx * T - hw - 0.01; p.vx = 0;
    }
  } else if (p.vx < 0) {
    var cx2 = Math.floor((p.x - hw) / T);
    if (isSolidC(cx2, Math.floor(top / T)) || isSolidC(cx2, Math.floor(bot / T)) ||
        isSolidC(cx2, Math.floor((p.y) / T))) {
      p.x = (cx2 + 1) * T + hw + 0.01; p.vx = 0;
    }
  }
  p.x = Math.max(hw + 2, Math.min(L.w * T - hw - 2, p.x));
}

function groundTopAt(x) {
  var c = Math.floor(x / T);
  for (var r = 0; r < ROWS; r++) if (isSolidC(c, r)) return r * T;
  return ROWS * T + 200;
}

function resolveV(p) {
  var hw = p.w / 2 - 2;
  var wasGrounded = p.grounded;
  p.grounded = false;
  if (p.vy >= 0) {
    var bot = p.y + p.h / 2;
    var r = Math.floor(bot / T);
    var c1 = Math.floor((p.x - hw) / T), c2 = Math.floor((p.x + hw) / T);
    if (isSolidC(c1, r) || isSolidC(c2, r)) {
      var landVy = p.vy;
      p.y = r * T - p.h / 2;
      p.vy = 0; p.grounded = true;
      if (!wasGrounded) onLand(p, landVy);
      return true;
    }
  } else {
    var top = p.y - p.h / 2;
    var r2 = Math.floor(top / T);
    var c3 = Math.floor((p.x - hw) / T), c4 = Math.floor((p.x + hw) / T);
    var hit = null;
    if (isSolidC(c3, r2)) hit = c3;
    if (isSolidC(c4, r2)) hit = (hit == null) ? c4 : (Math.abs((c4 + 0.5) * T - p.x) < Math.abs((hit + 0.5) * T - p.x) ? c4 : hit);
    if (hit != null) {
      p.y = (r2 + 1) * T + p.h / 2 + 0.01;
      p.vy = 40;
      bumpBlock(r2, Math.abs((c3 + 0.5) * T - p.x) < Math.abs((c4 + 0.5) * T - p.x) ? c3 : c4);
      return true;
    }
  }
  return false;
}

function oneWayBelow(p, x, y, w, h) {
  var feet = p.y + p.h / 2;
  if (p.prevVy >= 0 && p.x > x - 4 && p.x < x + w + 4 &&
      feet >= y - 6 && p.prevY + p.h / 2 <= y + 14) {
    return { x: x, y: y, w: w, h: h };
  }
  return null;
}

function checkOneWays(p, ap) {
  var i;
  /* springs handled in checkSprings; movers here */
  for (i = 0; i < L.movers.length; i++) {
    var m = L.movers[i];
    var box = oneWayBelow(p, m.x - 34, m.y - 10, 68, 10);
    if (box) {
      p.y = m.y - 10 - p.h / 2;
      if (p.vy > 0) { if (!p.grounded) onLand(p, p.vy); p.vy = 0; }
      p.grounded = true;
      p.riding = m;
      return;
    }
  }
  void ap;
}

function onLand(p, landVy) {
  setSquash(D.squash.landing.sx, D.squash.landing.sy,
            D.squash.landing.msDown + D.squash.landing.msRecover);
  if (landVy > 260) {
    SFX.land();
    dust(p.x, p.y + p.h / 2, 4);
  }
}

/* ------------------------------------------------- squash & anim bits --- */
function setSquash(sx, sy, ms) {
  P.sqFS = sx; P.sqTS = sy;
  P.sqFrom = performance.now(); P.sqMs = ms;
}
function animBits(dt) {
  var p = P, now = performance.now();
  /* squash/stretch recovery via `pop` (overshoot ≤8%, ≤160ms) */
  var t = (now - p.sqFrom) / Math.max(1, p.sqMs);
  if (t < 1) {
    var e = E.pop(Math.max(0, t));
    p.sx = p.sqFS + (1 - p.sqFS) * e;
    p.sy = p.sqTS + (1 - p.sqTS) * e;
  } else if (p.grounded && Math.abs(p.vx) < 20) {
    /* idle breath ±2% over 2.4s */
    p.sy = 1 + D.squash.idleBreath.amp * Math.sin(now / D.squash.idleBreath.periodMs * Math.PI * 2);
    p.sx = 2 - p.sy;
  } else if (!p.grounded && Math.abs(p.vy) < 90) {
    p.sx = D.squash.airPeak.sx; p.sy = D.squash.airPeak.sy;    /* hang */
  } else { p.sx = 1; p.sy = 1; }
  /* run cycle */
  p.moving = Math.abs(p.vx) > 30 && p.grounded;
  if (p.moving) p.runPhase += dt * 13 * Math.sign(p.vx) * p.dir;
  /* blink: 3–5s random, 140ms */
  var bms = now - simT * 0;                     /* keep ms-based */
  if (p.blinkT < 0) {
    if (bms > p.blinkNext) { p.blinkT = now; p.blinkNext = now + D.squash.blink.minGap +
      Math.random() * (D.squash.blink.maxGap - D.squash.blink.minGap); }
  } else if (now - p.blinkT > D.squash.blink.ms) p.blinkT = -1;
  /* scarf follow-through: trail lags 2–3 frames, recovers 30% slower */
  var anchor = { x: p.x - p.dir * 7, y: p.y - 6 };
  p.scarf.unshift(anchor);
  if (p.scarf.length > 4) p.scarf.pop();
  var lag = 0.55;                                /* <1 = slower recovery */
  for (var i = 1; i < p.scarf.length; i++) {
    var tgt = p.scarf[i - 1];
    p.scarf[i].x += (tgt.x - p.dir * 4 - p.scarf[i].x) * lag;
    p.scarf[i].y += (tgt.y + 3 - p.scarf[i].y) * lag * 0.7 + Math.sin(simT * 6 + i) * 0.3;
  }
}
function blinkAmount() {
  if (P.blinkT < 0) return 0;
  var t = (performance.now() - P.blinkT) / D.squash.blink.ms;
  return Math.sin(Math.PI * Math.min(1, t));
}

/* ============================================================ ENTITIES --- */
function updateEnemies(dt) {
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) { e.flatT += dt; if (e.flatT > 1.4) enemies.splice(i--, 1); continue; }
    if (e.state === "out") continue;
    if (e.state === "telegraph") {
      e.t += dt;
      if (e.t >= 0.3) { e.face *= -1; e.state = "walk"; }   /* 300ms telegraph */
      continue;
    }
    var sp = 30;
    e.x += e.face * sp * dt;
    /* turn at walls… */
    var ahead = e.x + e.face * 11;
    var cA = Math.floor(ahead / T);
    var rB = Math.floor((e.y + 12) / T);
    var rA = Math.floor((e.y - 4) / T);
    if (isSolidC(cA, rA) || isSolidC(cA, rB - 1)) { e.state = "telegraph"; e.t = 0; continue; }
    /* …and at ledges (never waddle into pits) */
    var footC = Math.floor((e.x + e.face * 10) / T);
    var groundBelow = false;
    for (var r = Math.floor(e.y / T); r < ROWS; r++) {
      if (isSolidC(footC, r)) { groundBelow = true; break; }
      if (L.spikes[r][footC]) { groundBelow = true; break; }
    }
    if (!groundBelow) { e.state = "telegraph"; e.t = 0; }
  }
}

function updateSprings(dt) {
  for (var i = 0; i < L.springs.length; i++) {
    var s = L.springs[i];
    if (s.compress > 0) s.compress = Math.max(0, s.compress - dt * 6);
  }
}

function checkSprings() {
  var p = P;
  if (p.vy < 60) return;
  for (var i = 0; i < L.springs.length; i++) {
    var s = L.springs[i];
    var topY = (s.y + 1) * T - 10;
    var cx = (s.x + 0.5) * T;
    var feet = p.y + p.h / 2;
    if (Math.abs(p.x - cx) < 20 && feet >= topY - 8 && feet <= topY + 16) {
      var step = Math.min(2, s.step++);
      p.vy = -SPRING_V[step];
      p.y = topY - p.h / 2 - 1;
      p.grounded = false; p.cutDone = true;      /* full spring launch */
      s.compress = 1;
      setSquash(D.squash.jumpLaunch.sx, D.squash.jumpLaunch.sy, 120);
      SFX.bounce(step * 2);                       /* pitch ladder ×1.06 */
      dust(cx, topY, 4);
      if (step === 2) toast("What a jump!");
      return;
    }
  }
}

/* ------------------------------------------------------------- blocks --- */
function blockAt(r, c) { return L.blocks[r + "," + c] || null; }
function bumpBlock(r, c) {
  var b = blockAt(r, c);
  if (!b || b.used) return;
  b.bump = 1;
  var bx = (c + 0.5) * T, by = (r + 0.5) * T;
  if (b.kind === "B") {
    b.used = true;
    L.solid[r][c] = false;
    delete L.blocks[r + "," + c];
    SFX.pop();
    shards(bx, by);
    shake.trigger(3, 180);
    loop.hitStop(D.budgets.hitStop.normal);
    addScore(50, bx, by);
  } else if (b.kind === "?") {
    b.used = true;
    SFX.powerUp();
    buddies.push({ x: bx, y: by, t: 0 });
    particles.burst("spark", bx, by - 10);
  } else {                                        /* gift coin block */
    b.used = true;
    SFX.coin();
    flyCoins.push({ x: bx, y: by, t: 0 });
    particles.burst("spark", bx, by - 12);
    addScore(100, bx, by);
    runCoins++;
  }
}

function updateFlyCoins(dt) {
  for (var i = flyCoins.length - 1; i >= 0; i--) {
    var f = flyCoins[i];
    f.t += dt / 0.45;
    if (f.t >= 1) flyCoins.splice(i, 1);
  }
}
function updateBuddies(dt) {
  for (var i = buddies.length - 1; i >= 0; i--) {
    var b = buddies[i];
    b.t += dt;
    if (b.t > 0.5 && !P.shield) {
      P.shield = true;
      toast("Berry Buddy shield!");
      buddies.splice(i, 1);
    }
  }
}

/* -------------------------------------------------------- interactions -- */
function overlaps(px, py, pw, ph, qx, qy, qw, qh) {
  return Math.abs(px - qx) < (pw + qw) / 2 && Math.abs(py - qy) < (ph + qh) / 2;
}

function checkHazards() {
  var p = P, now = performance.now(), i;
  if (now < p.invUntil) return;
  /* spikes */
  var c = Math.floor(p.x / T), r = Math.floor((p.y + p.h / 2 - 3) / T);
  if (isSpikeC(c, r) || isSpikeC(Math.floor((p.x - 8) / T), r) || isSpikeC(Math.floor((p.x + 8) / T), r)) {
    return hitPlayer("spikes");
  }
  /* pencil-pals */
  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.state === "out") continue;
    if (!overlaps(p.x, p.y, p.w - 4, p.h - 4, e.x, e.y, 20, 26)) {
      /* near-miss: dodged while airborne — whoa! (max once / 10s) */
      if (!p.grounded && now - nearMissAt > 10000 &&
          Math.abs(p.x - e.x) < 46 && Math.abs(p.y - e.y) < 40) {
        nearMissAt = now;
        loop.slowMotion(0.6, 200);
        SFX.whoosh();
        popText(p.x, p.y - 34, "Whoa!");
      }
      continue;
    }
    if (p.vy > 90 && p.y < e.y - 4) {
      /* stomp! */
      e.state = "out"; e.dead = true; e.flatT = 0;
      p.vy = (input.isHeld("action") || input.isHeld("up") || touchZones.jump) ? JUMP_V : STOMP_V;
      p.cutDone = true;
      loop.hitStop(D.budgets.hitStop.normal);
      shake.trigger(3, 180);
      particles.burst("spark", e.x, e.y - 10);
      SFX.pop();
      streak = streakFrozen ? streak : Math.min(D.fairness.comboCap, streak + 1);
      var mult = 1 + (streak - 1) * 0.25;
      addScore(Math.round(200 * mult), e.x, e.y - 20);
      if (streak >= 3) toast("Great streak!");
    } else {
      hitPlayer("pal");
    }
  }
}

function hitPlayer(why) {
  var p = P;
  if (p.shield) {
    p.shield = false;
    p.invUntil = performance.now() + 1200;
    SFX.pop();
    particles.burst("spark", p.x, p.y - 14);
    toast("Buddy saved you!");
    return;
  }
  gentleFail(why);
}

/* gentle failure (§3f-2): dizzy stars + sigh + retry ≤5s.
   Never shake, never red flash, never harsh audio. */
function gentleFail(why) {
  if (mode !== "play") return;
  mode = "dizzy";
  dizzyT = 1.15;
  dizzyReason = why;
  P.dizzy = true;
  P.vx = 0; P.vy = 0;
  stopMusic();
  SFX.gentleFail();
  SFX.failureChord();
  streakFrozen = true;                            /* freeze, never reset */
}

function updateDizzy(dt) {
  dizzyT -= dt;
  var p = P;
  if (dizzyReason === "fall") p.y += 60 * dt;     /* drift gently downward */
  if (dizzyT <= 0) {
    P.dizzy = false;
    respawn(false);
    mode = "play";
    toast("Here we go!");
  }
}

function checkPickups() {
  var p = P, i;
  for (i = 0; i < L.coins.length; i++) {
    var c = L.coins[i];
    if (c.got) continue;
    if (overlaps(p.x, p.y, p.w + 10, p.h + 10, c.x * T, c.y * T, 20, 20)) {
      c.got = true;
      collectJuice(c.x * T, c.y * T);
      addScore(100, c.x * T, c.y * T - 14);
      runCoins++;
    }
  }
  for (i = 0; i < L.stars.length; i++) {
    var s = L.stars[i];
    if (s.got) continue;
    if (overlaps(p.x, p.y, p.w + 12, p.h + 12, s.x * T, s.y * T, 26, 26)) {
      s.got = true;
      collectJuice(s.x * T, s.y * T);
      SFX.sticker();
      addScore(500, s.x * T, s.y * T - 16);
      runStars++;
      toast("Star power!");
    }
  }
}
/* doctrine juice stack for collectibles: pop + sparkle burst(8) + chime +
   tabular tick-up — orchestrated, ≤3 simultaneous primitives */
function collectJuice(x, y) {
  SFX.coin();
  particles.burst("spark", x, y);
}

function checkFlags() {
  for (var i = 0; i < L.flags.length; i++) {
    var f = L.flags[i];
    if (f.active) continue;
    if (Math.abs(P.x - f.x * T) < 18 && P.y > (f.y - 2) * T) {
      f.active = true;
      L.checkpoint = f;
      SFX.confirm();
      particles.burst("spark", f.x * T, (f.y - 1.2) * T);
      toast("Checkpoint!");
    }
  }
}

function checkFlagFinish() {
  if (!L.flag || mode !== "play") return;
  if (Math.abs(P.x - L.flag.x * T) < 16 && P.y > (L.flag.y - 3.5) * T) {
    startClear();
  }
}

/* ============================================================ CLEAR ------ */
function startClear() {
  mode = "clear";
  celebrating = VG.celebrate(
    { loop: loop, particles: particles, flash: flash },
    {
      cx: P.x - cam.x, cy: 200,
      note: function (i) {
        if (golden) { if (i === 0) SFX.sticker(); }
        else SFX.fanfare(i);
      },
      stars: function (st) { clearStats.staggerMs = st; clearStats.t0 = performance.now(); },
      card: function (o) { cardAnim = { t0: performance.now(), ms: o.ms, rise: o.rise }; },
      countUp: function () {},
      finish: function () { celebrating = null; }
    }
  );
  stopMusic();
  clearCount++;
  golden = clearCount % 8 === 0;                  /* 1-in-8 golden variant */
  var levelBonus = 500;
  var perfect = true;
  var k;
  for (k in L.blocks) if (!L.blocks[k].used && L.blocks[k].kind !== "B") perfect = false;
  clearStats = {
    staggerMs: 60, t0: performance.now(),
    coins: runCoins, stars: runStars, bonus: levelBonus,
    total: score + levelBonus, submitted: false
  };
  loop.hitStop(D.budgets.hitStop.clear);
  P.vx = 0;
  flagSlide = 0;
}

function updateClear(dt) {
  flagSlide = Math.min(1, flagSlide + dt / 0.5);
  updatePlayer(dt);                                /* happy hop by the flag */
  if (celebrating) celebrating.update(dt * 1000);
  if (cardAnim && !clearStats.submitted &&
      performance.now() - cardAnim.t0 > 1100) {
    clearStats.submitted = true;
    score += clearStats.bonus;
    scoreC.add(clearStats.bonus);
    var res = harness.submitScore(score);
    result = res;
    harness.gameEnded(score);
    if (res.newRecord) SFX.sticker();
  }
  /* attract mode keeps flowing: turn the page by itself */
  if (CFG.demo && clearStats.submitted) {
    demoClearT += dt;
    if (demoClearT > 5) { demoClearT = 0; clearAdvance(); }
  }
}

/* ============================================================ JUICE FX --- */
function dust(x, y, n) {
  if (VG.Juice.reduced) n = 1;
  particles.spawn(n, { x: x, y: y, kind: "spark", speed: 55, ttl: 0.45,
    size: 3.2, color: C.paper3, gravity: 160, up: 46, angle: -Math.PI / 2, spread: 2.4 });
}
function shards(x, y) {
  particles.spawn(VG.Juice.reduced ? 4 : 10, { x: x, y: y, kind: "confetti",
    speed: 150, ttl: 0.8, size: 5, gravity: 430, up: 130,
    colors: [C.sky, C.paper3, C.sun] });
}
function addScore(n, x, y) {
  score += n;
  scoreC.add(n);
  if (x != null) popText(x, y, "+" + n);
}
function toast(msg) {
  toasts.push({ msg: msg, t: 0 });
  if (toasts.length > 2) toasts.shift();
}
function popText(x, y, txt) {
  pops.push({ x: x, y: y, txt: txt, t: 0 });
  if (pops.length > 6) pops.shift();
}
function updateToasts(dt) {
  for (var i = toasts.length - 1; i >= 0; i--) {
    toasts[i].t += dt;
    if (toasts[i].t > 1.5) toasts.splice(i, 1);
  }
  for (var j = pops.length - 1; j >= 0; j--) {
    pops[j].t += dt;
    if (pops[j].t > 0.7) pops.splice(j, 1);
  }
}

/* ============================================================ AUTOPILOT --
 * Demo mode: Violet plays by herself. Simple, robust look-ahead rules —
 * jump gaps, jump pals, bounce springs. If she slips, she respawns gently
 * and keeps going; the demo never ends badly.
 * ======================================================================== */
var autoCool = 0;
function autopilot() {
  if (!CFG.demo || !P || mode !== "play") return { dir: 0, jump: false, hold: false };
  var p = P;
  if (autoCool > 0) autoCool -= 1 / 60;
  var out = { dir: 1, jump: false, hold: true };
  var ahead = Math.floor((p.x + 26) / T);
  var footR = Math.floor((p.y + p.h / 2 + 4) / T);
  var solidAt = function (c, r) {
    if (c < 0 || c >= L.w) return true;
    if (r < 0 || r >= ROWS) return false;
    return L.solid[r][c];
  };
  /* gaps in the next 3 columns → jump */
  var gap = !solidAt(ahead, footR) && !solidAt(ahead + 1, footR);
  /* walls (pipes, steps, gift blocks) ahead → jump, long-press if tall */
  var wallH = 0;
  if (p.grounded) {
    var probe = Math.floor((p.x + p.w / 2 + 8) / T);
    if (solidAt(probe, footR - 1)) {
      while (solidAt(probe, footR - 1 - wallH) && wallH < 4) wallH++;
    }
  }
  var wall = wallH > 0;
  /* enemies ahead → jump (and stomp or clear) */
  var pal = false;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.state === "out") continue;
    if (e.x > p.x && e.x - p.x < 84 && Math.abs(e.y - p.y) < 40) { pal = true; break; }
  }
  /* spikes ahead → jump */
  var spike = false;
  for (var dc = 0; dc < 3; dc++) {
    var cc = Math.floor((p.x + 16 + dc * T) / T);
    if (isSpikeC(cc, footR) || isSpikeC(cc, footR - 1)) { spike = true; break; }
  }
  /* springs: hold to ride the ladder */
  var onSpring = false;
  for (var si = 0; si < L.springs.length; si++) {
    var s = L.springs[si];
    if (Math.abs((s.x + 0.5) * T - p.x) < 40 && (s.y + 1) * T > p.y) { onSpring = true; break; }
  }
  /* movers ahead: hop on when close */
  var moverHop = false;
  for (var mi = 0; mi < L.movers.length; mi++) {
    var m = L.movers[mi];
    if (m.x > p.x && m.x - p.x < 58 && m.y < p.y + 20) { moverHop = true; break; }
  }
  /* low ceilings ahead → small hop (skip variable-cut) */
  if ((gap || pal || spike || moverHop || wall) && p.grounded && autoCool <= 0) {
    out.jump = true;
    autoCool = 0.28;
  }
  /* long-press to clear 2-tile walls and spikes */
  if (wallH >= 2 || spike) out.hold = true;
  if (onSpring) out.hold = true;
  return out;
}

/* ============================================================ RENDER ----- */
var vignette = null;
function makeVignette() {
  var c = document.createElement("canvas");
  c.width = 480; c.height = 270;
  var g = c.getContext("2d");
  var grad = g.createRadialGradient(240, 135, 118, 240, 135, 330);
  grad.addColorStop(0, "rgba(58,43,70,0)");
  grad.addColorStop(1, D.inkRGBA(0.13));
  g.fillStyle = grad;
  g.fillRect(0, 0, 480, 270);
  vignette = c;
}

function render() {
  var w = view.w, h = view.h, s = SCALE;
  ctx.save();
  var off = shake.offset();
  ctx.translate(off[0], off[1]);

  if (!L) { renderTitle(w, h, s); ctx.restore(); return; }
  var pal = L.palette;

  /* L0 sky (0.1) — flat two-stop within one hue family + paper sun */
  drawSkyBg(w, h, s, pal);

  var reduced = VG.Juice.reduced;
  var par = reduced ? 0 : cam.x;              /* parallax frozen in reducedJuice */

  /* L1 far hills (0.25, silhouettes, no outlines) */
  drawLayer(SP.hills, 0.25, par, w, 0, h);
  /* L2 mid trees (0.5, outlines + grain) */
  drawLayer(SP.mid, 0.5, par, w, 0, h);

  /* L3 playfield — camera space */
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(-cam.x, -cam.y);
  drawWorld();
  particles.render(ctx);
  ctx.restore();

  /* L4 near tufts (1.3, oversized) */
  drawLayer(SP.near, 1.3, par, w, h - 64 * s, 64 * s);

  if (vignette) ctx.drawImage(vignette, 0, 0, w, h);   /* soft desk-lamp depth */

  /* HUD + scene overlays */
  if (!CFG.demo) renderHUD(w, h, s);
  renderPops(s);
  if (mode === "title") renderTitle(w, h, s);
  else if (mode === "card") renderCard(w, h, s);
  else if (mode === "pause") renderPause(w, h, s);
  else if (mode === "clear") renderClearScene(w, h, s);
  else if (mode === "done") renderDone(w, h, s);
  if (mode === "dizzy") renderDizzyVeil(w, h, s);
  if (CFG.demo) renderDemoChrome(w, h, s);
  if (touchOn && (mode === "play" || mode === "dizzy")) renderTouch(s);

  flash.render(ctx, w, h);
  ctx.restore();
}

function drawSkyBg(w, h, s, pal) {
  var grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, pal.skyTop);
  grad.addColorStop(1, pal.skyBot);
  ctx.fillStyle = grad;
  ctx.fillRect(-8, -8, w + 16, h + 16);
  var reduced = VG.Juice.reduced;
  ART.drawSun(ctx, w, s, pal);
  ART.drawClouds(ctx, reduced ? 0 : cam.x, w, h, s, pal, performance.now(), reduced);
}

function drawLayer(img, factor, par, w, destY, destH) {
  if (!img) return;
  var sx = par * factor;
  var sw = Math.min(w, img.width);
  if (sx > img.width - sw) sx = Math.max(0, img.width - sw);
  ctx.drawImage(img, sx, 0, sw, img.height, 0, destY, sw, destH);
}

/* -------------------------------------------------- world (camera space) */
function drawWorld() {
  var pal = L.palette, i, k;
  var c0 = Math.max(0, Math.floor(cam.x / T) - 1);
  var c1 = Math.min(L.w - 1, Math.ceil((cam.x + VIEW_W) / T) + 1);

  /* tiles */
  for (var r = 0; r < ROWS; r++) {
    for (var c = c0; c <= c1; c++) {
      if (!L.solid[r][c]) continue;
      var x = c * T, y = r * T;
      var grass = !isSolidC(c, r - 1);
      var img;
      if (grass) img = SP.grass;
      else img = SP.dirt;
      ART.blit(ctx, img, x, y, T, T);
    }
  }
  /* pipes (t = rim, T = body) */
  for (r = 0; r < ROWS; r++) {
    for (c = c0; c <= c1; c++) {
      var ch2 = tileChar(r, c);
      if (ch2 === "t") ART.blit(ctx, SP.pipeTL, c * T, r * T, T, T);
      else if (ch2 === "T") ART.blit(ctx, SP.pipeBL, c * T, r * T, T, T);
    }
  }
  /* spikes */
  for (r = 0; r < ROWS; r++)
    for (c = c0; c <= c1; c++)
      if (L.spikes[r][c]) ART.blit(ctx, SP.spike, c * T, r * T, T, T);

  /* gift blocks with 8%-overshoot bounce on bump */
  for (k in L.blocks) {
    var b = L.blocks[k];
    if (b.c < c0 || b.c > c1) continue;
    var dy = 0;
    if (b.bump > 0) {
      dy = -Math.sin(Math.PI * (1 - b.bump)) * 6 * E.pop(b.bump);
      b.bump = Math.max(0, b.bump - 0.09);
    }
    var img2 = b.used ? SP.giftUsed : (b.kind === "X" ? SP.giftC : b.kind === "B" ? SP.giftB : SP.giftP);
    ART.blit(ctx, img2, b.c * T, b.r * T + dy, T, T);
  }

  /* springs */
  for (i = 0; i < L.springs.length; i++) {
    var sp = L.springs[i];
    ART.blit(ctx, sp.compress > 0.4 ? SP.springDown : SP.spring, sp.x * T, sp.y * T + T - 32, T, T);
  }
  /* ribbon-lift movers */
  for (i = 0; i < L.movers.length; i++) {
    var m = L.movers[i];
    ART.blit(ctx, SP.mover, m.x - 34, m.y - 10, 68, 20);
  }
  /* checkpoint pennants + finish flag */
  for (i = 0; i < L.flags.length; i++) {
    ART.drawPennant(ctx, L.flags[i].x * T, L.flags[i].y * T, { active: L.flags[i].active });
  }
  if (L.flag) ART.drawFlag(ctx, L.flag.x * T, L.flag.y * T, flagSlide);

  /* coins (sun accents) + stars, gentle bob — seeded phase, stable */
  var now = performance.now();
  for (i = 0; i < L.coins.length; i++) {
    var cc = L.coins[i];
    if (cc.got) continue;
    var bob = Math.sin(now / 420 + VG.hashSeed(cc.seed) % 6) * 2.4;
    ART.blit(ctx, SP.coin, cc.x * T - 11, cc.y * T - 11 + bob, 22, 22);
  }
  for (i = 0; i < L.stars.length; i++) {
    var st = L.stars[i];
    if (st.got) continue;
    var bob2 = Math.sin(now / 380 + i) * 3;
    ART.blit(ctx, SP.star, st.x * T - 15, st.y * T - 15 + bob2, 30, 30);
  }
  /* gift-block coin pop animation */
  for (i = 0; i < flyCoins.length; i++) {
    var fc = flyCoins[i];
    var fy = fc.y - E.easeOut(fc.t) * 34;
    ctx.save();
    ctx.globalAlpha = 1 - fc.t * 0.7;
    var fs = 1 + 0.3 * Math.sin(Math.PI * fc.t);       /* pop 1→1.3→out */
    ART.blit(ctx, SP.coin, fc.x - 11 * fs, fy - 11 * fs, 22 * fs, 22 * fs);
    ctx.restore();
  }
  /* Berry Buddy rising out of a ? block */
  for (i = 0; i < buddies.length; i++) {
    var bb = buddies[i];
    var by2 = bb.y - E.pop(Math.min(1, bb.t / 0.5)) * 30;
    ART.blit(ctx, SP.berry, bb.x - 12, by2 - 12, 24, 24);
  }

  /* enemies */
  for (i = 0; i < enemies.length; i++) ART.drawEnemy(ctx, enemies[i], now);

  /* Violet — 3px outlines, the hero of the fold-out */
  ART.drawViolet(ctx, {
    x: P.x, y: P.y, sx: P.sx, sy: P.sy,
    rot: P.dizzy ? Math.sin(now / 130) * 0.14 : (!P.grounded ? P.vy * 0.00012 : 0),
    flip: P.dir < 0, blink: blinkAmount(), dizzy: P.dizzy, happy: P.happy,
    invincible: performance.now() < P.invUntil, now: now,
    moving: P.moving, runPhase: P.runPhase, scarf: P.scarf, shield: P.shield
  });
  /* orbiting buddy when shielded */
  if (P.shield) {
    var oa = now / 320;
    ART.blit(ctx, SP.berry, P.x + Math.cos(oa) * 26 - 9, P.y - 4 + Math.sin(oa) * 14 - 9, 18, 18);
  }
}

/* tile chars (tuned page) for pipe rendering */
function tileChar(r, c) {
  if (!L.chars) return ".";
  return L.chars[r] ? (L.chars[r].charAt(c) || ".") : ".";
}

/* ------------------------------------------------------------- pops ----- */
function renderPops(s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(-cam.x, -cam.y);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (var i = 0; i < pops.length; i++) {
    var p2 = pops[i];
    var t = p2.t / 0.7;
    var sc = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.4));  /* 1→1.25→1 */
    ctx.save();
    ctx.translate(p2.x, p2.y - E.easeOut(t) * 26);
    ctx.scale(sc, sc);
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.font = "800 20px " + FONT_D;
    ctx.lineWidth = 4; ctx.strokeStyle = C.paper;
    ctx.strokeText(p2.txt, 0, 0);
    ctx.fillStyle = C.ink;
    ctx.fillText(p2.txt, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/* ================================================================ HUD ---- */
var pauseBtn = { x: VIEW_W - 62, y: 12, w: 50, h: 44 };
var hurryToastAt = -1e9;
function renderHUD(w, h, s) {
  ctx.save();
  ctx.scale(s, s);
  scoreC.update();
  /* score panel — washi tape, tabular tick-up, 18px+ text */
  VG.washiPanel(ctx, 12, 10, 168, 54, { scale: 1, tape: C.sky });
  ctx.fillStyle = C.ink;
  ctx.font = "700 18px " + FONT_D;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("SCORE", 48, 26);
  scoreC.render(ctx, 48, 48, 24);
  /* coin icon — shape-coded, never color-only */
  ART.blit(ctx, SP.coin, 20, 26, 22, 22);

  /* coins + stars panel */
  VG.washiPanel(ctx, 192, 10, 158, 54, { scale: 1, tape: C.sun });
  ART.blit(ctx, SP.coin, 204, 24, 20, 20);
  ctx.fillStyle = C.ink;
  ctx.font = "700 20px " + FONT_D;
  ctx.fillText("× " + runCoins, 230, 27);
  ART.blit(ctx, SP.star, 204, 45, 20, 20);
  ctx.fillText("× " + runStars, 230, 51);
  if (streak > 1) {
    ctx.fillStyle = C.inkSoft;
    ctx.font = "700 18px " + FONT_D;
    ctx.fillText("streak ×" + streak, 284, 39);
  }

  /* page marker (level name) */
  var name = "Page " + (LIDX + 1) + " · " + L.name;
  ctx.font = "700 19px " + FONT_D;
  var nw = ctx.measureText(name).width + 40;
  VG.washiPanel(ctx, VIEW_W / 2 - nw / 2, 10, nw, 38, { scale: 1, tape: C.violet });
  ctx.fillStyle = C.ink;
  ctx.textAlign = "center";
  ctx.fillText(name, VIEW_W / 2, 30);

  /* friendly progress strip — a path, not a timer */
  var px0 = 14, pw = 328;
  ctx.fillStyle = C.paper3;
  rrFill(ctx, px0, 72, pw, 9, 4.5);
  ctx.fillStyle = C.violet;
  var prog = Math.max(0, Math.min(1, P.x / (L.flag.x * T)));
  rrFill(ctx, px0, 72, Math.max(10, pw * prog), 9, 4.5);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px0, 72, pw, 9, 4.5); else ctx.rect(px0, 72, pw, 9);
  ctx.stroke();
  /* mini pennant at the end */
  ctx.fillStyle = C.leaf;
  ctx.beginPath();
  ctx.moveTo(px0 + pw + 4, 68); ctx.lineTo(px0 + pw + 14, 72); ctx.lineTo(px0 + pw + 4, 76);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  /* hurry badge — honest, friendly, no clocks */
  if (hurryFired && performance.now() - hurryToastAt < 2600) {
    var bt = (performance.now() - hurryToastAt) / 2600;
    ctx.globalAlpha = bt < 0.85 ? 1 : 1 - (bt - 0.85) / 0.15;
    ctx.fillStyle = C.leaf;
    var bw = 190;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(VIEW_W / 2 - bw / 2, 56, bw, 34, 17);
    else ctx.rect(VIEW_W / 2 - bw / 2, 56, bw, 34);
    ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.paper;
    ctx.font = "800 19px " + FONT_D;
    ctx.textAlign = "center";
    ctx.fillText("Almost there! →", VIEW_W / 2, 74);
    ctx.globalAlpha = 1;
  }

  /* pause pill — physical press */
  var pressed = performance.now() < pressFx;
  VG.pillButton(ctx, { x: pauseBtn.x, y: pauseBtn.y, w: pauseBtn.w, h: pauseBtn.h,
    label: "||", fill: C.paper2, pressed: pressed, fontSize: 18 });
  ctx.restore();
}
function rrFill(g, x, y, w2, h2, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w2, h2, r); else g.rect(x, y, w2, h2);
  g.fill();
}

/* ---------------------------------------------------------- title card -- */
function renderCard(w, h, s) {
  cardT += 1 / 60;
  var total = 1.9;
  if (cardT > total) {
    var tOut = Math.min(1, (cardT - total) / (D.timing.exit(280) / 1000));
    if (tOut >= 1) { mode = "play"; return; }
    ctx.save();
    ctx.globalAlpha = 1 - E.easeIn(tOut);
    drawTitleCard(w, h, s, 1 - 0.06 * E.easeIn(tOut));
    ctx.restore();
    return;
  }
  drawTitleCard(w, h, s, E.pop(Math.min(1, cardT / 0.28)));     /* 280ms medium */
}
function drawTitleCard(w, h, s, k) {
  ctx.save();
  ctx.translate(w / 2, h * 0.4 + (1 - k) * 20);
  ctx.scale(k, k);
  ctx.globalAlpha = Math.min(1, k);
  ctx.scale(s, s);
  VG.washiPanel(ctx, -225, -74, 450, 148, { tape: C.sun });
  ctx.fillStyle = C.inkSoft;
  ctx.font = "700 19px " + FONT_D;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("— Page " + (LIDX + 1) + " of 5 —", 0, -46);
  ctx.fillStyle = C.ink;
  ctx.font = "800 36px " + FONT_D;
  ctx.fillText(L.name, 0, -8);
  /* dual-coded hint: arrow glyphs + words */
  ctx.font = "600 19px " + FONT_D;
  ctx.fillStyle = C.inkSoft;
  ctx.fillText("← → run      SPACE jump", 0, 30);
  ctx.font = "600 18px " + FONT_D;
  ctx.fillText(L.hint, 0, 54);
  ctx.restore();
}

/* ------------------------------------------------------------- pause ---- */
var pauseOpts = [];
function pauseLabels() {
  return [
    "Resume",
    "Retry page",
    (VG.Juice.reduced ? "✓ " : "   ") + "Calm motion",
    (oneSwitch ? "✓ " : "   ") + "One-button run",
    "Quit to shelf"
  ];
}
function renderPause(w, h, s) {
  ctx.save();
  ctx.fillStyle = D.inkRGBA(0.35);                    /* plum veil, never black */
  ctx.fillRect(0, 0, w, h);
  ctx.scale(s, s);
  var cw = 340, chh = 388;
  var x0 = (VIEW_W - cw) / 2, y0 = (VIEW_H - chh) / 2;
  VG.washiPanel(ctx, x0, y0, cw, chh, { tape: C.violet });
  ctx.fillStyle = C.ink;
  ctx.font = "800 32px " + FONT_D;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Paused", VIEW_W / 2, y0 + 42);
  pauseOpts = [];
  var labels = pauseLabels();
  for (var i = 0; i < labels.length; i++) {
    var bx = x0 + 40, by = y0 + 78 + i * 58, bw = cw - 80, bh = 48;
    pauseOpts.push({ x: bx, y: by, w: bw, h: bh });
    VG.pillButton(ctx, { x: bx, y: by, w: bw, h: bh,
      label: labels[i],
      fill: i === 4 ? C.berry : (pauseSel === i ? C.sun : C.paper2),
      pressed: false, fontSize: 20 });
    if (pauseSel === i) {
      /* instant focus ring — 3px violet, never animated */
      ctx.strokeStyle = C.violet; ctx.lineWidth = 3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx - 5, by - 5, bw + 10, bh + 10, (bh + 10) / 2);
      else ctx.rect(bx - 5, by - 5, bw + 10, bh + 10);
      ctx.stroke();
    }
  }
  ctx.fillStyle = C.inkSoft;
  ctx.font = "600 18px " + FONT_D;
  ctx.textAlign = "center";
  ctx.fillText("↑↓ choose · SPACE pick", VIEW_W / 2, y0 + chh - 26);
  ctx.restore();
}
function pauseAction(i) {
  SFX.tick();
  if (i === 0) resumePlay();
  else if (i === 1) { loadLevel(LIDX, true); }
  else if (i === 2) { VG.Juice.toggle(); }
  else if (i === 3) {
    oneSwitch = !oneSwitch;
    try { localStorage.setItem("vee.mario.oneswitch", oneSwitch ? "1" : "0"); } catch (e) {}
  }
  else if (i === 4) {
    stopMusic();
    harness.gameQuit(score);
    mode = "title";
  }
}
function resumePlay() { mode = "play"; startMusic(); }

/* -------------------------------------------------- clear (celebration) -- */
var clearBtn = null;
function renderClearScene(w, h, s) {
  if (!cardAnim) {
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = C.ink;
    ctx.font = "800 43px " + FONT_D;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 6; ctx.strokeStyle = C.paper;
    ctx.strokeText("Page complete!", VIEW_W / 2, 150);
    ctx.fillText("Page complete!", VIEW_W / 2, 150);
    ctx.restore();
    return;
  }
  var ct = Math.min(1, (performance.now() - cardAnim.t0) / cardAnim.ms);
  var ck = E.pop(ct);
  var cw = 420, chh = 300;
  ctx.save();
  ctx.translate(w / 2, h * 0.42 - cardAnim.rise * ck);
  ctx.scale((0.9 + 0.1 * ck) * s, (0.9 + 0.1 * ck) * s);
  ctx.globalAlpha = Math.min(1, ck * 1.4);
  VG.washiPanel(ctx, -cw / 2, -chh / 2, cw, chh, { tape: C.sun });
  ctx.fillStyle = C.ink;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "800 34px " + FONT_D;
  ctx.fillText(golden ? "GOLDEN PAGE!" : "Page complete!", 0, -chh / 2 + 44);

  /* stars fly in one-by-one (60ms stagger) — honest: earned only */
  var el = performance.now() - (clearStats ? clearStats.t0 : performance.now());
  var stag = clearStats ? clearStats.staggerMs : 60;
  for (var i = 0; i < 3; i++) {
    var on = i < runStars;
    var flyK = Math.max(0, Math.min(1, (el - 300 - i * stag) / 240));
    var fk = E.easeOut(flyK);
    var sx2 = (i - 1) * 60, sy2 = -34;
    var fx = sx2 + (1 - fk) * 160, fy = sy2 - (1 - fk) * 120;
    ctx.save();
    ctx.globalAlpha = flyK > 0 ? 1 : 0.18;
    ART.blit(ctx, SP.star, fx - 20, fy - 20, 40, 40);
    if (!on && flyK > 0) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = C.paper2;
      ART.starPath(ctx, fx, fy, 13);
      ctx.fill();
    }
    ctx.restore();
  }

  /* stats count up over ~1.2s easeOut */
  var st = clearStats;
  if (st) {
    var lines = [
      ["Coins", "× " + st.coins],
      ["Bonus", "+" + st.bonus],
      ["Score", ""]
    ];
    ctx.font = "700 21px " + FONT_D;
    for (var li2 = 0; li2 < lines.length; li2++) {
      var lk = Math.max(0, Math.min(1, (el - 900 - li2 * 260) / 400));
      if (lk <= 0) continue;
      ctx.globalAlpha = lk;
      var ly = 18 + li2 * 32;
      ctx.fillStyle = C.inkSoft;
      ctx.textAlign = "left";
      ctx.fillText(lines[li2][0], -cw / 2 + 54, ly);
      ctx.fillStyle = C.ink;
      ctx.textAlign = "right";
      var val = lines[li2][1];
      if (li2 === 2) val = String(Math.round(st.total * E.easeOut(lk)));
      ctx.fillText(val, cw / 2 - 54, ly);
    }
    ctx.globalAlpha = 1;
    if (result && result.newRecord && st.submitted) {
      ctx.fillStyle = C.berry;
      ctx.font = "800 20px " + FONT_D;
      ctx.textAlign = "center";
      ctx.fillText("★ New best! ★", 0, 118);
    }
    /* continue pill */
    if (st.submitted) {
      var lbl = LIDX < LEVELS.length - 1 ? "Next page →" : "Finish the book!";
      clearBtn = { x: -110, y: chh / 2 - 66, w: 220, h: 50 };
      VG.pillButton(ctx, { x: clearBtn.x, y: clearBtn.y, w: clearBtn.w, h: clearBtn.h,
        label: lbl, fill: C.leaf, fontSize: 21 });
    }
  }
  ctx.restore();
}
function clearAdvance() {
  if (!clearStats || !clearStats.submitted) { if (celebrating) celebrating.skip(); return; }
  if (CFG.demo) {                                  /* attract: loop forever  */
    score = 0; scoreC.value = 0; scoreC.shown = 0;
    loadLevel((LIDX + 1) % LEVELS.length, true);
    stopMusic();
    return;
  }
  SFX.confirm();
  if (LIDX < LEVELS.length - 1) {
    if (LIDX + 1 > unlocked) {
      unlocked = LIDX + 1;
      try { localStorage.setItem("vee.mario.unlocked", String(unlocked)); } catch (e) {}
    }
    loadLevel(LIDX + 1, true);
  } else {
    mode = "done";
    stopMusic();
    SFX.fanfare();
    particles.burst("confetti", VIEW_W / 2, VIEW_H / 3);
  }
}

/* --------------------------------------------------------- grand finale -- */
var doneBtn = null;
function renderDone(w, h, s) {
  ctx.save();
  ctx.fillStyle = D.inkRGBA(0.25);
  ctx.fillRect(0, 0, w, h);
  ctx.scale(s, s);
  var cw = 460, chh = 300;
  VG.washiPanel(ctx, (VIEW_W - cw) / 2, (VIEW_H - chh) / 2, cw, chh, { tape: C.sun });
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = C.ink;
  ctx.font = "800 40px " + FONT_D;
  ctx.fillText("The End!", VIEW_W / 2, VIEW_H / 2 - 92);
  ctx.font = "700 22px " + FONT_D;
  ctx.fillStyle = C.inkSoft;
  ctx.fillText("Violet folded every page.", VIEW_W / 2, VIEW_H / 2 - 44);
  ctx.fillStyle = C.ink;
  ctx.font = "800 30px " + FONT_D;
  ctx.fillText("Score  " + score, VIEW_W / 2, VIEW_H / 2);
  if (result && result.newRecord) {
    ctx.fillStyle = C.berry;
    ctx.font = "800 22px " + FONT_D;
    ctx.fillText("★ A brand-new best! ★", VIEW_W / 2, VIEW_H / 2 + 40);
  }
  doneBtn = { x: VIEW_W / 2 - 130, y: VIEW_H / 2 + 70, w: 260, h: 52 };
  VG.pillButton(ctx, { x: doneBtn.x, y: doneBtn.y, w: doneBtn.w, h: doneBtn.h,
    label: "Back to the shelf", fill: C.sun, fontSize: 21 });
  ctx.restore();
}

/* ---------------------------------------------------------- dizzy veil -- */
function renderDizzyVeil(w, h, s) {
  ctx.save();
  ctx.fillStyle = D.inkRGBA(0.14);                 /* soft plum, never red */
  ctx.fillRect(0, 0, w, h);
  ctx.scale(s, s);
  var msg = dizzyReason === "fall" ? "Whoops-a-daisy!" : dizzyReason === "spikes" ? "Those were pokey!" : "Booped!";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "800 26px " + FONT_D;
  ctx.lineWidth = 6; ctx.strokeStyle = C.paper;
  ctx.strokeText(msg, VIEW_W / 2, 130);
  ctx.fillStyle = C.ink;
  ctx.fillText(msg, VIEW_W / 2, 130);
  ctx.font = "600 19px " + FONT_D;
  ctx.fillStyle = C.inkSoft;
  ctx.fillText("Back to the checkpoint…", VIEW_W / 2, 164);
  ctx.restore();
}

/* --------------------------------------------------------- demo chrome -- */
function renderDemoChrome(w, h, s) {
  ctx.save();
  ctx.scale(s, s);
  var bw = 430;
  VG.washiPanel(ctx, VIEW_W / 2 - bw / 2, 12, bw, 54, { tape: C.violet });
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = C.ink;
  ctx.font = "800 24px " + FONT_D;
  ctx.fillText("Violet's Big Fold-Out", VIEW_W / 2, 32);
  ctx.font = "600 18px " + FONT_D;
  ctx.fillStyle = C.inkSoft;
  ctx.fillText("DEMO — press any key to play!", VIEW_W / 2, 55);
  /* 30s cycle ring */
  var k = Math.min(1, demoT / DEMO_LEN);
  ctx.strokeStyle = D.inkRGBA(0.25); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(VIEW_W - 40, 40, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = C.violet; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(VIEW_W - 40, 40, 16, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------- touch pads -- */
var touchBtns = [
  { zone: "left",  x: 34,  y: VIEW_H - 76, r: 40, glyph: "←" },
  { zone: "right", x: 128, y: VIEW_H - 76, r: 40, glyph: "→" },
  { zone: "jump",  x: VIEW_W - 78, y: VIEW_H - 76, r: 44, glyph: "↑" }
];
var activeTouches = {};
function renderTouch(s) {
  ctx.save();
  ctx.scale(s, s);
  for (var i = 0; i < touchBtns.length; i++) {
    var b = touchBtns[i];
    ctx.globalAlpha = touchZones[b.zone] ? 0.75 : 0.45;
    ctx.fillStyle = C.paper2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = "800 30px " + FONT_D;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.glyph, b.x, b.y + 1);
  }
  ctx.restore();
}
function updateTouchZones() {
  var z = { left: false, right: false, jump: false };
  for (var id in activeTouches) {
    var pt = activeTouches[id];
    for (var i = 0; i < touchBtns.length; i++) {
      var b = touchBtns[i];
      var dx = pt.x - b.x, dy = pt.y - b.y;
      if (dx * dx + dy * dy < (b.r + 22) * (b.r + 22)) z[b.zone] = true;
    }
  }
  if (!z.jump) touchJumpUsed = false;
  touchZones = z;
}

/* ------------------------------------------------------------- title ---- */
var titleBlinkAt = 0, titleBlinkNext = 2600;
function titleBlink() {
  var now = performance.now();
  if (titleBlinkAt === 0 && now > titleBlinkNext) {
    titleBlinkAt = now;
    titleBlinkNext = now + 3000 + Math.random() * 2000;
  }
  if (titleBlinkAt > 0) {
    var t = (now - titleBlinkAt) / 140;
    if (t >= 1) { titleBlinkAt = 0; return 0; }
    return Math.sin(Math.PI * t);
  }
  return 0;
}
function titleScarf(now) {
  var pts = [];
  for (var i = 0; i < 4; i++) {
    pts.push({ x: VIEW_W - 120 + 8 + i * 6, y: 394 + Math.sin(now / 300 - i * 0.8) * 2 + i * 2 });
  }
  return pts;
}
function wrapText(txt, x, y, maxW, lh) {
  var words = txt.split(" "), line = "", yy = y;
  for (var i = 0; i < words.length; i++) {
    var test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy); line = words[i]; yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}
function renderTitle(w, h, s) {
  drawSkyBg(w, h, s, LEVELS[0].palette);
  if (SP && SP.hills) drawLayer(SP.hills, 0.25, 0, w, 0, h);
  ctx.save();
  ctx.scale(s, s);

  /* logo panel */
  VG.washiPanel(ctx, 40, 44, 430, 128, { tape: C.violet });
  ctx.fillStyle = C.ink;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = "800 40px " + FONT_D;
  ctx.fillText("Violet's Big", 76, 88);
  ctx.fillText("Fold-Out", 76, 132);
  ctx.fillStyle = C.inkSoft;
  ctx.font = "600 19px " + FONT_D;
  ctx.fillText("a pop-up book platformer", 250, 132);

  /* best score — honest, localStorage only */
  ctx.fillStyle = C.inkSoft;
  ctx.font = "700 19px " + FONT_D;
  ctx.fillText("Best: " + harness.highScore(), 48, 200);

  /* level cards */
  for (var i = 0; i < LEVELS.length; i++) {
    var cw2 = 158, ch2 = 150;
    var x2 = 40 + i * (cw2 + 14), y2 = 236;
    var lock = i > unlocked;
    ctx.save();
    if (lock) ctx.globalAlpha = 0.72;
    VG.washiPanel(ctx, x2, y2, cw2, ch2, { tape: [C.sky, C.sun, C.leaf, C.berry, C.violet][i] });
    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    ctx.font = "800 40px " + FONT_D;
    ctx.fillText(String(i + 1), x2 + cw2 / 2, y2 + 46);
    ctx.font = "700 18px " + FONT_D;
    ctx.fillStyle = C.inkSoft;
    wrapText(LEVELS[i].name, x2 + cw2 / 2, y2 + 84, cw2 - 22, 20);
    if (lock) {
      /* padlock icon — locked is shape-coded */
      ctx.fillStyle = C.ink;
      ctx.fillRect(x2 + cw2 / 2 - 11, y2 + 108, 22, 17);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x2 + cw2 / 2, y2 + 108, 7, Math.PI, 0); ctx.stroke();
    } else if (SP && SP.coin) {
      ART.blit(ctx, SP.coin, x2 + cw2 / 2 - 11, y2 + 104, 22, 22);
    }
    ctx.restore();
    if (titleSel === i) {
      ctx.strokeStyle = C.violet; ctx.lineWidth = 3.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x2 - 5, y2 - 5, cw2 + 10, ch2 + 10, 14);
      else ctx.rect(x2 - 5, y2 - 5, cw2 + 10, ch2 + 10);
      ctx.stroke();
    }
  }

  /* hints — dual coded */
  ctx.fillStyle = C.inkSoft;
  ctx.font = "600 19px " + FONT_D;
  ctx.textAlign = "center";
  ctx.fillText("← → choose a page · SPACE open it", VIEW_W / 2, 430);

  /* Violet idles on the title — she must feel alive */
  var tN = performance.now();
  ART.drawViolet(ctx, {
    x: VIEW_W - 120, y: 400, sx: 1, sy: 1 + 0.02 * Math.sin(tN / 1200 * Math.PI),
    rot: 0, flip: true, blink: titleBlink(), dizzy: false, happy: false,
    invincible: false, now: tN, moving: false, runPhase: 0,
    scarf: titleScarf(tN), shield: false
  });
  ctx.restore();
}

/* ============================================================ INPUT ------ */
function toLogical(e) {
  var r = cv.canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * VIEW_W / Math.max(1, r.width),
           y: (e.clientY - r.top) * VIEW_H / Math.max(1, r.height) };
}
function inBox(pt, b) {
  return b && pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
}
function pauseGame() {
  if (mode !== "play") return;
  mode = "pause"; pauseSel = 0;
  stopMusic();
}
function demoToReal() {
  CFG.demo = false;
  stopMusic();
  score = 0; scoreC.value = 0; scoreC.shown = 0;
  L = null; P = null; enemies.length = 0;
  mode = "title";
}

window.addEventListener("pointerdown", function (e) {
  SFX.unlock();
  var pt = toLogical(e);
  if (CFG.demo) { demoToReal(); return; }
  if (mode === "play") {
    if (inBox(pt, pauseBtn)) { pressFx = performance.now() + 110; pauseGame(); return; }
    if (touchOn) { activeTouches[e.pointerId] = pt; updateTouchZones(); }
  } else if (mode === "title") {
    for (var i = 0; i < LEVELS.length; i++) {
      var x2 = 40 + i * 172, y2 = 236;
      if (pt.x >= x2 && pt.x <= x2 + 158 && pt.y >= y2 && pt.y <= y2 + 150) {
        titleSel = i; startFromTitle(); return;
      }
    }
  } else if (mode === "card") {
    cardT = 100;                                    /* tap skips the card */
  } else if (mode === "pause") {
    for (var j = 0; j < pauseOpts.length; j++) {
      if (inBox(pt, pauseOpts[j])) { pauseSel = j; pauseAction(j); return; }
    }
  } else if (mode === "clear") {
    if (clearBtn && clearStats && clearStats.submitted) {
      var cx0 = VIEW_W / 2, cy0 = VIEW_H * 0.42;
      var lb = { x: cx0 + clearBtn.x, y: cy0 + clearBtn.y, w: clearBtn.w, h: clearBtn.h };
      if (inBox(pt, lb)) { clearAdvance(); return; }
    }
    if (celebrating) celebrating.skip();
  } else if (mode === "done") {
    if (inBox(pt, doneBtn)) { mode = "title"; }
  }
}, { passive: true });

window.addEventListener("pointermove", function (e) {
  if (activeTouches[e.pointerId] != null) {
    activeTouches[e.pointerId] = toLogical(e);
    updateTouchZones();
  }
}, { passive: true });
function endTouch(e) {
  if (activeTouches[e.pointerId] != null) {
    delete activeTouches[e.pointerId];
    updateTouchZones();
  }
}
window.addEventListener("pointerup", endTouch, { passive: true });
window.addEventListener("pointercancel", endTouch, { passive: true });

window.addEventListener("keydown", function (e) {
  if (e.target !== window && e.target !== document.body) return;
  SFX.unlock();
  var k = e.key;
  if (CFG.demo) { demoToReal(); return; }
  if (mode === "title") {
    if (k === "ArrowLeft") { titleSel = (titleSel + LEVELS.length - 1) % LEVELS.length; SFX.tick(); }
    else if (k === "ArrowRight") { titleSel = (titleSel + 1) % LEVELS.length; SFX.tick(); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); startFromTitle(); }
  } else if (mode === "card") {
    cardT = 100;
  } else if (mode === "play") {
    if (k === "Escape" || k === "p" || k === "P") pauseGame();
  } else if (mode === "pause") {
    if (k === "Escape" || k === "p" || k === "P") { resumePlay(); return; }
    if (k === "ArrowUp") { pauseSel = (pauseSel + pauseLabels().length - 1) % pauseLabels().length; SFX.tick(); }
    else if (k === "ArrowDown") { pauseSel = (pauseSel + 1) % pauseLabels().length; SFX.tick(); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); pauseAction(pauseSel); }
  } else if (mode === "clear") {
    if (k === "Enter" || k === " ") { e.preventDefault(); clearAdvance(); }
  } else if (mode === "done") {
    if (k === "Enter" || k === " ") { e.preventDefault(); mode = "title"; }
  }
});

/* engine-buffered presses: celebration is always skippable (consent rule) */
input.onAction(function () {
  if (celebrating) celebrating.skip();
});

function startFromTitle() {
  if (titleSel > unlocked) { SFX.tick(); return; }
  SFX.confirm();
  score = 0; scoreC.value = 0; scoreC.shown = 0;
  clearCount = 0;
  loadLevel(titleSel, true);
}

/* ============================================================ CAMERA ----- */
function updateCamera(dt) {
  var tx = P.x - VIEW_W * 0.42;
  tx = Math.max(0, Math.min(L.w * T - VIEW_W, tx));
  cam.x += (tx - cam.x) * Math.min(1, dt * 8);
  var ty = Math.max(0, Math.min(ROWS * T - VIEW_H, P.y - VIEW_H * 0.58));
  cam.y += (ty - cam.y) * Math.min(1, dt * 5);
}

/* ============================================================ LOOP ------- */
function update(dt) {
  simT += dt;
  particles.update(dt);
  scoreC.update();
  updateToasts(dt);
  updateFlyCoins(dt);
  updateBuddies(dt);

  if (mode === "play") {
    updatePlayer(dt);
    updateEnemies(dt);
    updateSprings(dt);
    updateCamera(dt);
    if (CFG.demo) {
      demoT += dt;
      if (demoT >= DEMO_LEN) {
        demoT = 0; score = 0; scoreC.value = 0; scoreC.shown = 0;
        loadLevel(1, true);
        stopMusic();                                /* screensaver is silent */
      }
    }
  } else if (mode === "dizzy") {
    updateDizzy(dt);
    updateCamera(dt);
  } else if (mode === "clear") {
    updateClear(dt);
    updateEnemies(dt);
    updateCamera(dt);
  }
}

var loop = VG.createLoop({
  update: function (dt) { update(dt); },
  render: function () { render(); }
});
window.loop = loop;

/* toasts — patched onto the pop-text pass so they share one draw moment */
(function patchToasts() {
  var orig = renderPops;
  renderPops = function (s) {
    orig(s);
    ctx.save();
    ctx.scale(s, s);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var i = 0; i < toasts.length; i++) {
      var t2 = toasts[i];
      var a = t2.t < 0.18 ? t2.t / 0.18 : t2.t > 1.2 ? Math.max(0, 1 - (t2.t - 1.2) / 0.3) : 1;
      var yy = 96 - (t2.t < 0.18 ? (1 - E.pop(t2.t / 0.18)) * 12 : 0);
      ctx.globalAlpha = a;
      ctx.font = "800 22px " + FONT_D;
      ctx.lineWidth = 5; ctx.strokeStyle = C.paper;
      ctx.strokeText(t2.msg, VIEW_W / 2, yy);
      ctx.fillStyle = C.ink;
      ctx.fillText(t2.msg, VIEW_W / 2, yy);
    }
    ctx.restore();
  };
})();

/* ============================================================ INIT ------- */
/* QA hook — read-only snapshot for automated smoke tests (no gameplay effect) */
FO.debug = function () {
  return { mode: mode, level: LIDX, x: P ? Math.round(P.x) : -1,
           score: score, coins: runCoins, demo: CFG.demo, unlocked: unlocked,
           enemies: enemies.length, celebrating: !!celebrating };
};

function init() {
  makeVignette();
  touchOn = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  SP = ART.build(LEVELS[0]);                        /* title backdrop art */
  if (CFG.demo) {
    loadLevel(1, true);                             /* Violet runs page 2 */
    stopMusic();                                    /* screensaver is silent */
  } else {
    mode = "title";
  }
  loop.start();
}
init();
})(typeof window !== "undefined" ? window : this);
