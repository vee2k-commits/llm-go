# Vee Arcade Engine — Builder Contract

Read `../DESIGN-BIBLE.md` first. This file is the mechanical contract: what a
game directory contains, what it imports, and what it must do before shipping.

## 1. Game directory layout

Every game is a folder under `web/arcade/games/` discovered by
`arcade.Catalog.LoadFromDir` (it walks and registers **every** `manifest.json`):

```
web/arcade/games/<game-id>/
├── manifest.json    # REQUIRED — catalog entry (schema below)
├── index.html       # REQUIRED (or whatever `entry` says)
├── game.js          # your game logic — builds ON the engine, never replaces it
└── assets/          # optional; prefer procedural canvas art (doctrine: no bitmaps)
```

The desktop embeds the game in an iframe at
`/arcade/games/<game-id>/<entry>`. Games run same-origin but must behave like
guests: post lifecycle events to the parent, never touch parent DOM.

## 2. What to import from the engine

```html
<link  rel="stylesheet" href="../engine/vee-style.css">
<script src="../engine/vee-game.js"></script>   <!-- window.VeeGame -->
<script src="../engine/vee-sfx.js"></script>    <!-- window.VeeSFX (optional) -->
```

Everything you need is on `window.VeeGame`:

| API | Purpose |
|---|---|
| `VeeGame.DESIGN` | Locked tokens: palette, easings, timing canon, squash table, juice budgets, fairness constants. **Never hard-code a hex value.** |
| `setupCanvas(canvas, {width, height})` | DPI-aware canvas; reference width 960; use `view.scale` with `DESIGN.outlineWidth(scale)` (min 1.5px). |
| `createLoop({update(dt), render(alpha)})` | Fixed-timestep 60Hz accumulator loop, RAF-driven, pauses on hidden tab. `loop.hitStop(ms)`, `loop.slowMotion(factor, ms)`. |
| `createInput(opts)` | Keyboard + touch + one-switch; `isHeld`, `consumeBuffered` (120ms buffer), `coyote(ms)` helper (100ms default). |
| `drawSprite(ctx, {...})` | The mandatory 4-layer recipe: hard shadow → fill → texture → 2px outline + highlight. `shadowBlur` is banned. |
| `wobblyRectPath` / `wobblyBlobPath` | Seeded ±1px jitter, ±1.5° rotation — stable per seed, never per-frame random. |
| `paperGrainCanvas` / `halftoneCanvas` / `pattern` | Pre-rendered textures. Generated once, cached — never re-randomize per frame. |
| `ParticlePool` | Capped at 256. `burst("spark"|"confetti"|"explosion"|"trail", x, y)`. |
| `createShake()` | ≤4px normal / 6px max, translated not rotated, auto-off in reducedJuice. **Never shake on failure.** |
| `createFlash()` | ≤8% alpha, ≤80ms, rate-limited ≤3Hz. |
| `celebrate(fx, hooks)` | The mandatory 3-beat level-clear choreography (≤2s, skippable). |
| `StateMachine` | Scenes with enter/exit/update/render. |
| `washiPanel` / `pillButton` / `ScoreCounter` | HUD chrome: washi-tape panels, physical-press pills, tabular-nums tick-up scores. Text floor 18px. |
| `createHarness(gameId)` | Parent-frame postMessage + localStorage high scores (see §4). |
| `VeeGame.Juice` | `Juice.reduced` (prefers-reduced-motion + manual), `Juice.toggle()`. |

`window.VeeSFX` provides all doctrine sounds: `tick, confirm, jump, land, coin,
powerUp, pop, bounce(step), gentleFail, whoosh, sticker, fanfare(noteIdx)`,
plus `startMusic({bpm, seed, tier, key})`, `hurry()`, `failureChord()`,
volume/mute controls. Call `VeeSFX.unlock()` on the first user gesture.

## 3. manifest.json schema

Field names come from `Game` in `internal/arcade/arcade.go` (unmarshaled with
`encoding/json`, matching is case-insensitive — use lowercase):

```json
{
  "id":      "my-game",          // Game.ID      — unique, matches the folder name
  "title":   "My Game",          // Game.Title   — shown in shelf / game bar
  "genre":   "Arcade",           // Game.Genre   — one of: Arcade/Puzzle/Maze/Platformer/Racing/Pinball/Tech Demo
  "engine":  "html5",            // Game.Engine  — "html5" for all seven games
  "entry":   "index.html",       // Game.Entry   — iframe src relative to the folder
  "demo":    "",                 // Game.Demo    — optional demo-mode entry ("" = same as entry)
  "license": "MIT",              // Game.License — our original code: "MIT"
  "source":  ""                  // Game.Source  — upstream repo URL, "" for originals
}
```

## 4. Parent-frame harness (postMessage protocol)

Games run inside an iframe in the Vee desktop. Call `VeeGame.createHarness(id)`
and use it for every lifecycle event — it posts to `window.parent`:

```js
{ source: "vee-arcade", topic: "...", gameId: "my-game", payload: {...}, t: <epoch ms> }
```

| topic | when | payload |
|---|---|---|
| `arcade.game.ended` | run finished (win or gentle fail) | `{score}` |
| `arcade.game.quit`  | player exits to menu/desktop | `{score}` |
| `arcade.game.score` | score milestones / records | `{score, best?, newRecord?}` |

High scores: `harness.highScore()` / `harness.submitScore(n)` persist to
`localStorage` under `vee.arcade.hiscore.<id>`. Never seed fake scores.

## 5. Pre-ship checklist (distilled from the bible)

- [ ] Contrast: HUD/body text **4.5:1** vs the *brightest* playfield tile; large display 3:1.
- [ ] No pure `#000`/`#fff` anywhere; neutrals tinted toward ink/paper.
- [ ] Named easings only — no browser `ease`, no `transition: all`, no raw hex outside `DESIGN`.
- [ ] `reducedJuice` fallbacks exist for every effect (shake off, confetti −75%, parallax frozen); hit-stop may stay.
- [ ] ≤ **3 simultaneous effects** per event; particle pool ≤256; shake ≤4px (6px max), never on failure.
- [ ] **Gentle failure**: dizzy character + sigh + retry ≤5s. No skulls, no red flash, no shake.
- [ ] Colorblind safety: every color-coded meaning has a **shape or pattern twin** (danger = spikes+stripes, good = star cutout); berry-vs-leaf never the sole signal.
- [ ] 18px text floor; instructions dual-coded (icon + word).
- [ ] Input fairness: 120ms buffer, 100ms coyote, arrows-only + one-switch playable.
- [ ] Every sound has a visual twin; every celebration uses `celebrate()` and is skippable.
- [ ] Harness posts `arcade.game.ended`/`quit`; scores persist via `harness.submitScore`.

The golden reference implementation is `engine/demo/` — run
`go run ./cmd/vee` and launch "Vee Engine Demo" from the shelf.
