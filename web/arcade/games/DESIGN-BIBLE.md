# VEE ARCADE — DESIGN BIBLE
### Synthesized from `hallmark-main` and upgraded for a young gamer at Paper-Mario quality
Scope: seven HTML5 canvas games (Arkanoid, Tetris, Frogger, Mario-style platformer, Racer, Sidescroller, Dress-Up starring Violet) + the surrounding desktop chrome. Constraint honored throughout: **procedural canvas art only, WebAudio-synthesized sound only.**

---

## 1. Extracted principles — the best ideas from Hallmark

| # | Principle | Source | Translation to Vee arcade |
|---|---|---|---|
| 1 | **Locked tokens, no mid-render improvisation** — every color/font must come through a named token; inline values are banned (gate 48) | `SKILL.md` §3, `slop-test.md` gate 48 | One `DESIGN.js` token module imported by all seven games. No game hard-codes a hex. |
| 2 | **No pure black/white; tint every neutral toward the anchor hue** | `color.md` | Cream-paper backgrounds, plum-tinted ink outlines — this IS the Paper-Mario look. |
| 3 | **Timing canon** — 80–120ms = "instant", 150–200ms state, 250–300ms open, 400–500ms reveal; exits = 60–75% of enters | `microinteractions.md`, `motion.md` | Adopted verbatim as the game-feel timing backbone. |
| 4 | **Three named easings, browser-default `ease` banned, `linear` only for progress** | `motion.md` | Game code uses the same three curves plus two game-only physical curves. |
| 5 | **Overshoot/spring reserved for "genuine physical interactions"** (stiffness 180/damping 22 snappy; 280/26 stiff) | `microinteractions.md` | In a game, *almost everything* is a physical interaction — this is Hallmark's own license to use squash, bounce and springs liberally in gameplay, while keeping UI chrome smooth. |
| 6 | **The Hum exception** — playful normally caps chroma at 0.16 and bans bounce, but Hum raises chroma to 0.24, makes motion mandatory, and canonicalizes `cubic-bezier(0.34, 1.56, 0.64, 1)` | `genres/playful.md` | The kids' arcade lives permanently in the Hum exception register: vivid, alive, springy. |
| 7 | **Hand-built craft tells**: ±1° asymmetric rotation, 80ms lag between paired elements (eyes), opacity layering for secondary detail, a 4px "breath" over 6s | `custom-craft.md` cross-recipe techniques | The procedural-anti-cheap toolkit — the single most valuable transfer. |
| 8 | **Hard-offset flat shadow `4px 4px 0 ink` + 2px border + halftone dot fill** | `themes/carnival.md` signature moves 4, 6 | The sticker/paper-craft rendering recipe for every sprite. |
| 9 | **Pre-emit self-critique**: score output 1–5 on Philosophy, Hierarchy, Execution, Specificity, Restraint, Variety; <3 triggers revision | `slop-test.md` | Every game build self-scores against the Fun/Fair/Fancy axes (section 3f adaptation). |
| 10 | **Accessibility ground truth**: hit targets ≥44px, focus rings instant, no flash >3Hz, no color-only state, keyboard parity | `microinteractions.md` | Adopted wholesale; upgraded for children (larger targets, see 3g). |
| 11 | **Contrast floors**: 4.5:1 body text, 3:1 large text/UI boundaries; dark sections must flip text color in the same rule | `color.md`, `slop-test.md` gates 40–41 | HUD text and score readouts verified against playfield colors. |
| 12 | **Typography: pairing not single font; banned defaults list; tabular-nums for numbers; min size floors** | `typography.md` | A display face for titles + rounded body for UI; tabular numerals for every score counter. |
| 13 | **Reduced motion is non-optional** — every animation has a fallback | `motion.md`, gate 27 | A global `reducedJuice` setting: shake off, particles thinned, timing preserved. |
| 14 | **Honest content / no fabricated polish** | gates 46–47 | No fake "high score" seed data; real scores from `game_scores` table only. |

**Evidence of current baseline failure:** the existing `web/arcade/reference/arcade-game.css` uses `Inter` (banned default), a purple gradient (`#8b5cf6 → #7c3aed`, the #1 AI tell), and `transition: … ease` (banned browser default). `sfx.js` is three raw single-note beeps. Both are exactly what this doctrine replaces.

---

## 2. Critical evaluation — where Hallmark falls short for game-of-the-year kids' games

Hallmark is superb at **restraint, honesty, and anti-templating for marketing pages**. For children's games it is necessary but not sufficient:

- **Restraint is inverted.** Hallmark's "silent success" and "cut motion" philosophy is wrong for a 6–9-year-old: celebration IS the product. The doctrine must flip reward feedback to maximal — while keeping Hallmark's *discipline* (named tokens, timing canon, budgets) so maximal juice doesn't become noise.
- **No game-feel vocabulary.** Nothing on hit-stop, screen shake, anticipation frames, i-frames, input buffering, coyote time.
- **No audio design.** Hallmark is silent on sound; a kids' arcade needs a full WebAudio synth grammar.
- **Chroma too low.** The playful genre caps chroma at 0.16 — muted for a kid's arcade. The Hum exception (0.18–0.24) is the floor; we go higher for game-world accents only.
- **No fairness/difficulty doctrine.** Nothing on failure states, reward pacing, or frustration prevention — the most important axis for this audience.
- **Colorblind coverage is one sentence** ("no red–green as only signal"). Kids' games need shape+pattern redundancy everywhere.
- **Typography catalog is adult.** Rounded, high-legibility children's faces are needed for the chrome.

---

## 3. THE NEXT-LEVEL DOCTRINE — "Paper Playground"

One sentence: **every screen looks like it was cut, glued, and drawn by a kind hands — 2px ink outlines, cream paper, hard-offset sticker shadows, visible craft texture, springy motion, and a sound for every touch.**

### (a) Art direction

**Master palette — "Violet's Workshop" (all games share these core tokens):**

| Token | OKLCH | Hex | Role |
|---|---|---|---|
| `--paper` | `oklch(97% 0.02 85)` | `#FFF6E4` | Cream paper base (never `#fff`) |
| `--paper-2` | `oklch(93% 0.025 80)` | `#F7E9CE` | Panels, cards |
| `--paper-3` | `oklch(88% 0.03 75)` | `#EDDAB6` | Recessed surfaces |
| `--ink` | `oklch(25% 0.05 300)` | `#3A2B46` | Plum ink — every outline, every text (never `#000`) |
| `--ink-soft` | `oklch(40% 0.04 300)` | `#5C4A6E` | Secondary lines, shadows' second pass |
| `--violet` | `oklch(58% 0.19 305)` | `#8A5BD6` | Character accent (Violet) |
| `--sun` | `oklch(82% 0.17 80)` | `#FFB63D` | Coins, rewards, stars |
| `--leaf` | `oklch(68% 0.16 145)` | `#4FBE6A` | Go/success, nature |
| `--berry` | `oklch(58% 0.21 25)` | `#E0503C` | Danger/hearts — always paired with a shape (X, spike), never color-only |
| `--sky` | `oklch(72% 0.12 230)` | `#7EB8F0` | Backgrounds, water |

Per-game palettes derive by shifting paper hue ±30° and swapping 2 accents (section 5). **Rule: max 5 chromatic colors per playfield + paper/ink.** Every sprite: flat fill + 2px outline + one hard shadow `3px 3px 0 rgba(58,43,70,0.9)` (scales with canvas DPI).

**Outline & shape language:**
- Outline width: `2px` at reference 960px canvas, scaled by `canvasWidth/960`, never below 1.5px.
- Corners: everything rounded — rect radii `6–12px`; blobs drawn with quadratic curves, never sharp polygons (except deliberate hazards, which get spikes = readable danger).
- Wobble rule (the anti-robot move): every static drawn outline gets a seeded per-vertex offset of ±1px and per-object rotation of ±1.5° (`custom-craft.md` technique #2). Symmetry reads as algorithmic.

**Paper-craft textures, procedurally:**
- *Paper grain*: offscreen 128×128 canvas, ~300 seeded 1px rects at ink 3–5% alpha; `createPattern` multiplied over backgrounds at ≤0.15 opacity (Hallmark imagery-kit cap).
- *Halftone*: dot grid `radial dots 1.5px, 12px spacing` for shadow zones and placeholder regions (Carnival signature #6).
- *Construction-paper edges*: fill shapes twice — once offset `(2,2)` in `--ink-soft`, once on top — for a layered cut-paper look.
- *Washi tape*: translucent rounded rects (`alpha 0.6`, ±4° rotation) pinning HUD cards to the screen.
- *Crayon stroke*: 3 overlapping strokes with ±1px jitter and 0.35 alpha for hand-drawn underlines and paths.

**Parallax layering (5 layers, fixed speed ratios):**

| Layer | Content | Scroll factor | Blur/detail |
|---|---|---|---|
| L0 sky | flat gradient + paper sun/clouds | 0.1 | flat shapes only |
| L1 far | hills/skyline silhouettes, single tone | 0.25 | no outlines |
| L2 mid | trees/buildings, outlines on | 0.5 | outlines, grain |
| L3 play | gameplay field | 1.0 | full detail |
| L4 near | foreground grass/confetti strips | 1.3 | slightly oversized |

### (b) Animation language

**Easing library (JS):**

| Token | Definition | Use |
|---|---|---|
| `easeOut` | `cubic-bezier(0.16,1,0.3,1)` (easeOutExpo) | Everything entering/settling |
| `easeIn` | `cubic-bezier(0.7,0,0.84,0)` | Everything leaving/falling away |
| `easeInOut` | `cubic-bezier(0.65,0,0.35,1)` | Toggles, camera pans |
| `pop` | `cubic-bezier(0.34,1.56,0.64,1)` | Game-physical only: pickups, score popups, jump recovery (Hum exception — legal because gameplay = physical) |
| `linear` | progress bars, conveyor belts only | Hallmark rule kept |

**Squash & stretch values (the character-feel table):**

| Event | ScaleX/Y | Duration | Curve |
|---|---|---|---|
| Jump anticipation (crouch) | 1.12 / 0.85 | 90ms | easeIn |
| Jump launch | 0.85 / 1.18 | 120ms | easeOut |
| Airborne peak | 1.05 / 0.97 (hang) | — | — |
| Landing squash | 1.25 / 0.75 | 80ms down, 160ms recover | easeIn / `pop` |
| Hit/damage | 1.3 / 0.7 + flash | 100ms | easeOut |
| Idle breath | ±2% scaleY sine | 2.4s loop | sine |
| Blink | eyelid scale 1→0.1→1 | 140ms; every 3–5s randomized; paired eyes offset 80ms (`custom-craft.md`) |

**Timing canon (game-adapted from `microinteractions.md`):**

| Bucket | Value | Use |
|---|---|---|
| Instant | 80–120ms | Button response, paddle nudges, tile swaps |
| Short | 150–200ms | Hover/select highlights, menu ticks |
| Medium | 250–300ms | Panel opens, piece locks, level intro card |
| Long | 400–500ms | Level complete banner, big reveals |
| Exit rule | exit = 75% of enter | Menus closing, overlays dismissing |

**Anticipation/follow-through rules:**
1. Nothing moves big without a 90–150ms wind-up (jump, throw, slam, enemy lunge — enemies get *longer* anticipation, 300ms, so kids can react).
2. Everything that stops, overshoots 4–8% then settles (`pop` curve, ≤160ms).
3. Attached bits (bows, scarves, antennae, tail) lag the parent by 2–3 frames and recover 30% slower — follow-through sells life.
4. Staggered groups: 60ms per item, total cap 500ms (`motion.md` rule).

### (c) Game feel checklist (the juice contract)

**Global budgets:**

| System | Budget |
|---|---|
| Hit-stop (frame freeze on impact) | 60ms normal hit · 90ms big hit · 120ms boss/level-clear hit |
| Screen shake | amplitude ≤ 4px (big events 6px max), exponential decay over 180–250ms, **never** on failure of a child's run (see 3f), always translated not rotated, off in `reducedJuice` |
| Particles | pool of 256 max per game; burst sizes: spark 8, confetti 24, explosion 32, trail 2/frame |
| Flash | white overlay ≤ 8% alpha, ≤ 80ms; no flashing above 3Hz (a11y ground truth) |
| Simultaneous effects per event | ≤ 3 primitives (Hallmark's "no more than three" rule — juice is orchestrated, not piled) |

**Juice-per-action table (every row is mandatory):**

| Action | Feedback stack (max 3 simultaneous) |
|---|---|
| Any button press | 90ms scale 0.96 + tick sound + pressed state color |
| Collect coin/star | `pop` scale 1→1.3→0 + sparkle burst(8) + 2-note chime + score counter ticks up over 200ms tabular-nums |
| Good hit (brick, enemy, line clear) | hit-stop 60ms + shard particles + thunk/pitch-ladder sound + shake 3px |
| Player jump | anticipation squash + stretch + whoosh + dust puff(4) |
| Near-miss | 200ms slow-motion at 0.6× + "whoa" sting (once per 10s max) |
| Level complete | 3-beat choreography below |
| Failure | gentle routine below (3f) — never shake, never red flash |

**Celebration choreography (level clear — always 3 beats):**
1. **Beat 1 (0–400ms)**: hit-stop 90ms → subject freezes mid-air, white flash 60ms, fanfare note 1.
2. **Beat 2 (400–1200ms)**: confetti burst (24 pieces, paper-palette colors, gravity 400px/s², spin), stars fly one-by-one (60ms stagger) into the result card, fanfare notes 2–4.
3. **Beat 3 (1200–1800ms)**: result card springs in (`pop`, 0.9→1.0 scale + 8px rise), score counts up 1.2s easeOut, character does idle-happy loop. Total ≤ 2s, skippable by input (Hallmark: no animation >2s without consent).

### (d) Audio design — WebAudio synth grammar

Master chain: every voice → per-voice gain → **lowpass at 8kHz** (removes harshness) → music bus (gain 0.18) or SFX bus (gain 0.35) → compressor (threshold -18dB, ratio 4) → destination. All envelopes use `exponentialRampToValueAtTime` (never linear for amplitude), 10ms attack floor to avoid clicks.

**SFX recipes (freq in Hz, duration in ms):**

| Sound | Recipe |
|---|---|
| UI tick / select | square 660, 60ms, gain 0.15 |
| Confirm | triangle 523→784 glide, 140ms |
| Jump | square 320→640 exp glide, 130ms, +tiny noise puff |
| Land | filtered noise lowpass 300Hz, 90ms + sine 110 thump |
| Coin | square 988 for 70ms then 1319 for 120ms (the canonical two-note) |
| Power-up | triangle arpeggio 523-659-784-1047, 55ms/note |
| Brick/pop | triangle 440→220 glide 80ms + noise burst 40ms |
| Bounce | sine 300, pitch ×1.06 each consecutive bounce in a rally (pitch ladder — rising excitement) |
| Damage/gentle fail | sine 330→262 (minor-second sigh), 300ms — *sad, not scary; no harsh sawtooth for kids* |
| Whoosh/near-miss | bandpass noise sweep 400→2400Hz, 180ms |
| Sticker/unlock | bell: sine 1568 + 2349 partial, 400ms decay |
| Fanfare (level clear) | I–IV–V–I triads, triangle lead + sine sub octave, 112 BPM, 1.6s |

**Music loops:** 2-bar loops, 90–112 BPM, C/F/G-major keys (bright). Pattern = triangle-wave melody (pentatonic scale only — no wrong notes possible if procedurally varied) over sine bass root-fifth, plus a noise-hat on off-beats at gain 0.05. Duck music −6dB while any fanfare/SFX cluster plays. One melody motif per game, transposed per level tier (+1 semitone every 3 levels = subconscious progress).

**Emotional mapping:**

| Game state | Music | SFX register |
|---|---|---|
| Menu/idle | 90 BPM, sparse, major | soft ticks |
| Early level | 100 BPM, melody present | bright |
| Last 30s / hurry | +12 BPM, add hat, +1 semitone | pitch ladders up |
| Failure screen | music stops, one warm chord (I), no sting loop | gentle sigh |
| Victory | full fanfare, then menu motif returns in major resolution | confetti crackle |

### (e) Typography & UI chrome

- **Display face:** `Baloo 2` (rounded, heavy, kid-legible, Google Fonts, NOT on Hallmark's banned list) weight 700–800; fallback `"Comic Sans MS", rounded-system` — deliberately acceptable here since anti-pattern list bans Comic Sans for *adult marketing* "zany" signals, while children's UIs are its native register; Baloo 2 remains first choice.
- **Body/UI face:** `Fredoka` 400–600. Two families total (Hallmark 2+1 rule).
- **Scale:** perfect fourth (1.333) from 18px base: 18 / 24 / 32 / 43 / 57px. **Kids' floor is 18px everywhere** (Hallmark's 16px floor raised for young readers).
- **Scores/numbers:** `font-variant-numeric: tabular-nums` (gate: tabular data), score popups scale 1→1.25→1 over 200ms `pop`.
- **Buttons:** pill radius 999px, 2px ink border, hard-offset shadow `3px 3px 0 ink`, press = translate(2px,2px) + shadow removal (the button *physically presses into the paper*), min target **56×56px** (raised above Hallmark's 44px for small hands).
- **Panels:** cream `--paper-2`, 16px radius, 2px ink border, washi-tape corner accents, never glassmorphism (banned), never gradient text (banned).
- **Chrome rules kept from Hallmark:** no purple gradients (the current prototype's `#8b5cf6→#7c3aed` button dies), focus rings instant 2px ≥3:1, no animated focus, no `transition: all`, named easings only.

### (f) Young-gamer fairness & joy rules

1. **Difficulty curve:** first 3 minutes of every game tuned to ~95% success. Difficulty rises in steps of ~8% per tier; every new mechanic gets a safe, un-failable introduction beat (one screen, no hazards, one prompt).
2. **Gentle failure:** no "GAME OVER" skulls. Failure = character gets dizzy (star eyes, wobble), a soft sigh sound, then **instant retry from a nearby checkpoint ≤ 5s later**. Never screen shake, never red flash, never harsh audio on failure. Losing a life costs progress-in-the-run, never collected stickers/meta-progress.
3. **Reward pacing:** something rewarding every 5–10 seconds (collectible, sound, visual gag). Meta-layer: **sticker book** — one sticker per milestone across all seven games; stickers are the durable currency (feeds Dress-Up unlocks).
4. **Streaks reward, never punish:** combo multipliers cap at ×5 and *freeze* at their value on a miss (no reset-to-zero heartbreak); show "Great try!" not "You lost your streak."
5. **Input tolerance:** 120ms input buffer (early presses count), 100ms coyote time (late jumps off edges count), 250ms grace on moving-platform disembark. Forgiveness is invisible difficulty settings.
6. **No timed pressure in tier 1** of any game; timers appear only from tier 3 and always with generous margins (+50% over adult defaults) and a visible friendly countdown face, not a red clock.
7. **Emotional pacing arc per session:** welcome (calm) → learn (curious) → play (rising energy) → peak (one big celebration) → wind-down (menu motif returns). Sessions end on a win; if the child quits mid-run, save state and resume *before* the failure.
8. **Honest praise:** feedback text describes the action ("What a jump!") — never fabricated metrics (Hallmark gate 46 applied to praise: no fake score multipliers, no invented "top 1%").

### (g) Accessibility

- **Colorblind safety:** every color-coded meaning also carries a shape or pattern — danger = spikes + stripes (not just red), good = star cutout (not just green), locked = padlock icon. Deuteranopia simulation check on every palette pair; berry-vs-leaf pairs never the sole signal (Hallmark color.md ban, upgraded).
- **Text:** 18px floor; 24px+ for anything a child must read during play; instructions always icon + word (dual coding).
- **Contrast:** body/HUD text 4.5:1 vs. playfield; large display 3:1 (gates 40–41), verified against the *brightest* background tile, not the average.
- **Motion:** `reducedJuice` mode (maps to `prefers-reduced-motion` + settings toggle): shake off, confetti reduced 75%, hit-stop kept (it's timing, not motion), parallax frozen. No flashing >3Hz anywhere, ever.
- **Input:** every game playable with one switch-hold (auto-advance mode) or arrows-only; full keyboard parity to any mouse affordance (hold-to-repeat at 300ms delay / 100ms repeat for small hands).
- **Audio:** every sound cue has a visual twin (a sound-worthy event always also pops, flashes ≤8%, or wiggles) so deaf players lose nothing; master volume + SFX/music split sliders.

---

## 4. Per-game art briefs

**1. Arkanoid — "Violet's Craft Breaker."** A desk-made diorama: the playfield is a corkboard with construction-paper bricks pinned by washi tape, each brick a cut-paper rect with halftone shading and a ±1.5° tilt. The paddle is a wooden paintbrush handle with a sticker grip; the ball is a bouncy paper wad that leaves a faint crayon trail. Breaks shower paper-confetti and tape scraps; gold bricks crack in two hits showing a torn-paper inner layer. Palette shifts paper hue toward warm ochre (`#FFF1D6`), accents sun + berry.

**2. Tetris — "Paper Stack."** Tetrominoes are gift-wrapped boxes and folded origami — flat fills with visible fold-crease lines (single lighter stroke diagonally), 2px ink outlines, landing with a squash and a paper *thwip*. Line-clears fold the row into a paper airplane that flies off-screen right (the celebration beat). Background is a cozy shelf with parallax knick-knacks; palette cools to mint-paper (`#EFF7EC`) with sky + violet accents.

**3. Frogger — "Puddle Hopper."** Violet hops across a craft-table scene: roads are gray construction paper with crayon-drawn dashes; cars are toy blocks on wheels (hard-offset shadows sell the toy-ness); the river is torn blue tissue paper with visible fiber edges, lily pads are green circles with a notch and darker vein. Enemy approach always telegraphed with a 300ms bounce-anticipation. Palette: sky + leaf on cream; berry reserved strictly for the "oops" dizzy state.

**4. Mario-style platformer — "Violet's Big Fold-Out."** A pop-up-book world: hills are layered cut-paper silhouettes at parallax 0.25/0.5/1.0, clouds are cotton-ball clusters (overlapping white circles, ink outline, 3% grain), pipes are pencil-case cylinders. Blocks are gift boxes that bounce on hit with 8% overshoot. Violet herself: round head, big blink loop (3–5s, 80ms eye offset), scarf with 3-frame follow-through lag. Warm palette, sun accent for coins, gentle dusk-paper for later tiers.

**5. Racer — "Cardboard Grand Prix."** A shoebox racetrack: road is corrugated cardboard (procedural flute lines every 6px), track edges are popsicle-stick barriers, opponents are wind-up toys with visible key rotation. Speed lines are crayon strokes at 0.4 alpha; drifts kick up eraser-shaving particles. Steering tolerance wide (input forgiveness rule), walls bounce with a boing rather than punish. Palette: warm gray cardboard paper + berry/violet racers, always shape-distinct (star vs. stripe decals).

**6. Sidescroller — "Sticker Safari."** A scrolling sticker album: every creature is a collectible sticker with a white die-cut border; collecting one peels it off the world (curl animation 250ms, easeOut) into the sticker book. Three full parallax bands of paper jungle — torn-edge leaves, halftone shadows, sun at 0.1×. The run auto-slows near new stickers (discovery beats pressure); the goal is collection, not survival. Leaf-green paper (`#F0F7E4`) base.

**7. Dress-Up (Violet) — "Violet's Wardrobe."** The craft-table centerpiece: Violet's doll stands on a paper doll stand with visible fold-tabs; wardrobe items are cut-paper stickers (hats, bows, capes, glasses) that snap on with a `pop` 0.9→1.0 and a sticker-*press* sound. Background is a cozy desk with grain texture, polaroid frames for saved outfits (washi-taped, ±2° rotations, each save gets a camera-click + flash ≤8%). Every sticker unlocked elsewhere in the arcade appears here — the meta-reward hub. Violet's idle loop: breath ±2%, blink every 3–5s, occasional wave if untouched 15s (she's the mascot; she must feel alive per `custom-craft.md` mascot recipe).

---

## 5. Risks & mitigations — where procedural art looks cheap

| Risk | Why it looks cheap | Mitigation from doctrine |
|---|---|---|
| **Perfect symmetry / robot-straight lines** | The #1 algorithmic tell (`custom-craft.md`) | Seeded ±1px vertex jitter, ±1.5° object rotation, quadratic-curve outlines everywhere; seed per-object so wobble is stable, not shimmering |
| **Flat single-fill shapes** | Reads as placeholder | Mandatory 4-layer sprite recipe: shadow pass → fill → texture detail (crease/halftone) → 2px outline + one highlight stroke at 30% white |
| **Gradient abuse** | LLM-default aurora look (anti-patterns.md) | Two-stop gradients only, within one hue family, mostly banned in favor of flat + grain; never purple-cyan |
| **Grain/noise shimmer on animation** | Re-randomized noise every frame = TV static | Pre-render grain/pattern to offscreen canvas ONCE, reuse as pattern; texture moves with the object, not the frame |
| **Performance collapse from per-frame procedural drawing** | 60fps dies under shadow blur / per-pixel noise | Cache every static sprite to offscreen canvas at load; `shadowBlur` banned (use hard-offset flat shadows — cheaper AND on-style); particle pool capped at 256 |
| **Uniform identical outlines everywhere** | Monotone craft | Outline weight hierarchy: 2px play objects, 1px background detail, 3px hero items/Violet only |
| **Audio harshness** | Raw oscillators are piercing for kids | Mandatory lowpass 8kHz, exponential envelopes with 10ms attack floor, SFX bus 0.35, triangle/sine favored over sawtooth, minor-second sigh instead of harsh buzz for failure |
| **Juice becoming noise** | Everything shakes = nothing matters | Hallmark's restraint machinery reused: ≤3 simultaneous effects per event, budgets in 3c, shake forbidden on failure, one orchestrated celebration per clear |
| **Palette drift between the 7 games** | Each game built by a different pass drifts (Hallmark gate 48: token improvisation) | Single `DESIGN.js` token module; per-game palettes only remap the 4 swappable tokens; a slop-test-style pre-ship checklist (contrast 4.5:1, no pure black/white, no default easing, reducedJuice fallbacks) gates every game before merge |
| **Dress-Up doll uncanny valley** | Procedural humanoids fail | Violet stays icon-shaped: round head, 2 ellipse eyes, one quadratic-curve mouth — the `custom-craft.md` mascot recipe explicitly chosen to avoid uncanny risk |
| **Celebration fatigue** | Kids habituate if every reward is identical | Three rarity tiers of celebration (small pop / medium burst / full 3-beat choreography) with a 1-in-8 golden variant (gold confetti + bell sound) |

---

## 6. Key file references

- Source skill: `/home/vee/Software/Vee/hallmark-main/skills/hallmark/SKILL.md`, `references/{color,motion,microinteractions,typography,anti-patterns,slop-test,custom-craft,layout-and-space}.md`, `references/genres/playful.md`, `references/themes/carnival.md`
- Current baseline to replace: `/home/vee/Software/Vee/web/arcade/reference/arcade-game.css` (Inter + purple gradient + default ease), `/home/vee/Software/Vee/web/arcade/reference/sfx.js` (3 raw beeps)
- Architecture contract the games must respect: `/home/vee/Software/Vee/web/arcade/reference/target.md` (game registry entries, 30s demo cycles, arcade layer)
- Character asset: `/home/vee/Software/Vee/web/static/assets/characters/violet/` (sheet + metadata — Dress-Up may use it, but all *new* art stays procedural)

**Bottom line for the builder agent:** adopt Hallmark's *discipline* (tokens, timing canon, budgets, slop-test gates, reduced-motion) and deliberately invert its *restraint* inside gameplay (max juice, overshoot springs, loud celebration — the documented Hum exception covers this). The three numbers that carry 70% of the identity, same way Carnival's build hint does: **2px plum outlines, cream `#FFF6E4` paper, `3px 3px 0` hard shadows** — then the timing canon makes it alive.
