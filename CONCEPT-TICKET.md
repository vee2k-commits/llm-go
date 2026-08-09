# Vee — LLM Harness Desktop Environment

## Concept Ticket

> **How to read this ticket.** This is a *plain-English contract for every file in the
> project*. Each file has a "What it must be", a "Signal path" (the exact bus topics it
> publishes and subscribes to), and the "Registry values / settings" it owns. Nothing here
> is code-first. If a file is missing from this ticket it does not exist. The whole point
> is a **pre-debugged signal path**: as long as implementers stay on the registered topics
> and registry kinds listed below, modules can be swapped, added, or removed without the
> rest of the system noticing. That is the architecture's only rule.
>
> **The one rule:** every component talks to the world *only* through the **event bus**
> and the **registry**. No module imports another module's package. If two things need to
> interact, they agree on a topic name, publish to it, and subscribe to it. The bus is
> visible end-to-end in the browser (SSE), so every mutation point can be observed live.

---

## 0. The big picture

Vee is a desktop that *lives inside the LLM*. A layered virtual surface:

- **Desktop layer** — a clear layer across the whole screen. Click anywhere → a glowing
  stylized cursor appears → a chat bubble opens exactly where you clicked. One message,
  from anywhere: *"please load some funny videos of animals from youtube"*.
- **Chat layer** — the left 1/4 of the screen. A full-featured LLM UI: attach-files icon,
  mic icon (voice/video), and the **[Vee]** button (custom command scripts, registry-based).
- **[Vee] wordmark** — top-left corner. Toggles the left panel + is the **notification
  system** (toasts from modules and LLMs). Clicked again → shrinks to a tiny dot that is
  still comfortable to press.
- **Arcade layer** — the screensaver. Arcade machine with open-source games. 30-second
  demos ("little videos"). Click while the screensaver is on → **[pitter-patter]** (back to
  the UI) or **[games]** (a cyberpunk arcade terminal hosted by an 80s nerd who is STT/TTS
  only).
- **Settings layer** — settings-heavy. Typography, **lexicon** (change or remove any word
  on anything), button colors **and behavior** (buttons are registry commands that can be
  remapped).
- **Wizard layer** — creative-suite pipelines (Blender, game/character creation, graphic
  design, comic book making, cartoon making) hosted as jovial, beginner-friendly, LLM-driven
  wizards.

The LLM brain is **pi** (pi.dev) running headless; Vee's Go server *proxies* to it. The
switch to turn it on is a registry setting (`llm.pi.enabled`). A local tool-call model
(**LiquidAI/LFM2.5-2.6B** via llama.cpp) can back the agent or handle simple tool calls
directly.

**Stack:** Go + htmx + sqlite + pi (headless) + llama.cpp + whisper.cpp + piper/espeak-ng
+ libVLC + yt-dlp.

---

## 1. The three primitives

### 1.1 The Registry (`internal/registry`)
A typed catalog. **Everything is an entry.** Kinds:

| Kind | What it holds |
|---|---|
| `module` | lifecycle-managed components (audio, speech, arcade, …) |
| `setting` | settings schema (group, label, type, default, options) |
| `lexicon` | string overrides — change or **remove** any visible word |
| `theme` | font/color/component-skin blocks |
| `command` | [Vee] macros + button behaviors (data-command=…) |
| `tool` | capabilities exposed to the LLM (audio.play, lexicon.set, …) |
| `skill` | pi Agent Skills (SKILL.md) the agent can load |
| `wizard` | creative-suite pipelines |
| `game` | arcade games (engine, entry point, demo) |
| `mediasource` | curated audio sources (radio, lo-fi, broadcasts) |
| `provider` | LLM backends (pi, llamacpp, mock) |
| `layer` | display layers |

Every register/unregister/update publishes `registry.*` events, so the settings UI and the
LLM tool layer rebuild automatically.

### 1.2 The Event Bus (`internal/bus`)
Pub/sub with wildcards and **state replay**. Two topic kinds:

- **Command topics** — one-shot requests. Anyone may publish; the owning module handles:
  `audio.play`, `audio.queueSearch`, `tts.speak`, `macro.run`, `wizard.start`,
  `layer.toggle`, `arcade.launch`, `settings.set`, `lexicon.set`, `notify.push`, `llm.prompt`.
- **State/event topics** — facts for everyone: `chat.*`, `audio.*`, `state.*` (replay),
  `settings.changed`, `lexicon.changed`, `theme.changed`, `registry.*`, `layer.*`,
  `notify.*`, `screensaver.*`, `arcade.*`, `pi.*`.

Topics beginning `state.` keep their latest payload so late subscribers (e.g. a browser
reconnecting to SSE) catch up instantly.

### 1.3 Settings (`internal/config`)
Typed, schema'd, persisted knobs. `settings.changed` triggers lexicon/theme re-derivation.
Every knob is a `setting` registry entry.

---

## 2. The signal path (the pre-debugged contract)

The table below is the entire wiring diagram. Implementations must not invent topics;
if a need is missing, add the topic *here first*, then everywhere.

| Topic | Direction | Payload | Owner |
|---|---|---|---|
| `system.ready` | event | `{}` | main |
| `state.layer.*` | state | layer map | layers |
| `layer.toggle` | command | `{id}` | layers |
| `layer.activated` | event | `{id,x,y}` | layers |
| `state.audio.*` | state | player state | audio |
| `audio.play` | command | `{uri,title}` | audio |
| `audio.queueSearch` | command | `{query,n}` | audio |
| `audio.pause` / `audio.resume` / `audio.stop` | command | `{}` | audio |
| `audio.volume` | command | `{volume}` | audio |
| `audio.started` / `audio.stopped` / `audio.track` | event | track | audio |
| `state.chat.*` | state | last message per session | llm |
| `chat.submitted` | event | `{text,origin}` | frontend |
| `chat.message` | event | `{sessionId,role,content,seq}` | llm |
| `chat.token` | event | `{sessionId,delta}` | llm |
| `chat.ended` | event | `{sessionId}` | llm |
| `llm.prompt` | command | `{content}` | llm |
| `llm.backend.switched` | event | `{backend}` | llm |
| `pi.connected` / `pi.disconnected` | event | `{}` | pi proxy |
| `tts.speak` | command | `{text,voice}` | speech |
| `stt.utterance` | event | `{text}` | speech |
| `notify.push` | command+event | `{level,title,body,ttl}` | notify |
| `state.lexicon` | state | map | lexicon |
| `lexicon.changed` / `lexicon.set` | event+command | `{key,value}` | lexicon |
| `state.settings` | state | map | config |
| `settings.changed` / `settings.set` | event+command | `{key,value}` | config |
| `state.theme` | state | CSS var map | theme |
| `theme.changed` | event | CSS var map | theme |
| `macro.run` | command | `{id}` | macros |
| `state.registry.<kind>` | state | entries | registry |
| `registry.registered` / `updated` / `removed` | event | entry | registry |
| `wizard.start` | command | `{id}` | wizards |
| `state.wizard.*` | state | wizard progress | wizards |
| `screensaver.activated` / `deactivated` | event | `{}` | arcade |
| `screensaver.toggle` | command | `{}` | arcade |
| `arcade.launch` | command | `{gameId}` | arcade |
| `arcade.game.demo` / `arcade.game.ended` | event | game | arcade |

---

## 3. Per-file contracts

### `go.mod`
Module `vee`, Go 1.25. Sole external dependency: `modernc.org/sqlite` (pure-Go SQLite,
no cgo). Everything else is stdlib or build-tag-gated.

### `cmd/vee/main.go`
Wiring only. Creates db → bus → registry → config → lexicon → theme → layers → notify →
llm → audio → speech → macros → wizards → arcade → server. Registers every module entry,
their settings, tools, mediasources, games, wizards, and lexicon base strings. Starts the
HTTP server. Publishes `system.ready`.

### `internal/bus/bus.go`
The spine. `Publish(topic, payload)`, `Subscribe(topic|pattern, handler)`, `SetState`
(topic that also replays), `State(topic)`. Patterns: `*` one segment, `**` any. Thread-safe.

### `internal/registry/registry.go`
`Register/Unregister/Get/List/Update/ByKind`. Persists entries in sqlite `registry` table.
Publishes `registry.registered|updated|removed` and `state.registry.<kind>`.

### `internal/config/config.go`
`Get/Set/List/Schema`. Holds `setting` entries; `Set` persists to sqlite `settings` and
publishes `settings.changed` + `settings.changed.<key>` + `state.settings`.

### `internal/lexicon/lexicon.go`
`Set/Get/All/Clear`. Overrides map persisted to sqlite `lexicon`. Publishes
`state.lexicon`, `lexicon.changed`. **Empty value = remove that word from the UI.**
Also seeds its base strings from `lexicon` registry entries.

### `internal/theme/theme.go`
Reads settings keys (`theme.font.family/size`, `theme.color.*`, `theme.radius`, per-component
skins) and renders a CSS custom-property map. Publishes `state.theme` + `theme.changed`
whenever a `theme.*` setting changes. Served as a live stylesheet.

### `internal/db/db.go`
SQLite open + migration runner. Tables: `settings`, `lexicon`, `registry`, `messages`,
`sessions`, `macros`, `game_scores`, `kv`.

### `internal/layers/layers.go`
The virtual display surface stack: `desktop`, `chat`, `notify`, `settings`, `arcade`,
`wizard`. `Activate/Deactivate/Toggle/Click`. Publishes `state.layer.*`, `layer.toggled`,
`layer.activated` (with click coords → the chat bubble spawn).

### `internal/notify/notify.go`
Toast queue. `Info/Debug/Warn/Error`. Publishes `notify.push` (browser renders toasts near
the [Vee] wordmark). **Both** modules and LLM tools post here.

### `internal/llm/llm.go`
`Backend` interface `{ Name(); Stream(ctx, sessionID, msgs, opts, onEvent) error }`.
Provider registry (kind=`provider`): `pi`, `llamacpp`, `mock`. Setting `llm.backend`
switches. `Stream` normalizes every provider into the canonical `chat.*` events so the
frontend never cares who generated.

### `internal/llm/pi.go`
The **pi proxy**. HTTP client to pi-harness (`llm.pi.url`, default `http://127.0.0.1:8080`).
`POST /sessions` then `POST /sessions/:id/messages`; reads the SSE stream; normalizes
`message_update` (both flat `{text}` and nested `{assistantMessageEvent:{text_delta:{delta}}}`
shapes), `thinking_update`, `tool_call_start/update/end` (`toolName/toolArgs/toolResult/
isToolError`), `turn_end`, `error` → `chat.*` events. Per-session `systemPromptPrefix/Suffix`
carry Vee's desktop persona + tool list. Health-check publishes `pi.connected/disconnected`.
Abort = client disconnect (cancel is a no-op server-side). **The switch is `llm.pi.enabled`.**

### `internal/llm/llamacpp.go`
Direct OpenAI-compatible streaming against `llama-server` (`llm.llamacpp.url`,
default `http://127.0.0.1:8080/v1`). Used for the local LFM2.5-2.6B tool-call model.
Normalizes SSE `data:` chunks → `chat.token`.

### `internal/llm/mock.go`
Echo backend so the whole desktop works with **zero** external services. Returns a cheerful
reply and can emulate tool calls (`audio.*`, `lexicon.set`) for UI testing.

### `internal/audio/audio.go`
`Player` interface `{Play, Stop, Pause, Resume, Volume, Seek, Queue, NowPlaying, Name}`.
Manager subscribes to `audio.*` command topics and publishes `audio.started/stopped/track`.
Owns the `mediasource` registry entries (curated radio/lo-fi/broadcast URLs).

### `internal/audio/libvlc.go`  *(build tag `libvlc`)*
Headless VLC via `adrg/libvlc-go/v3`: `vlc.Init("--no-video","--quiet","--network-caching=1500")`,
`NewPlayer`, `LoadMediaFromURL/FromPath`, `Play`, `SetPause`, `SetVolume`, `SetMediaTime`,
`EventManager` → `MediaPlayerEndReached` (advance queue), `MediaPlayerEncounteredError`.
Plays HLS/icecast/http directly.

### `internal/audio/noop.go`  *(build tag `!libvlc`)*
Fallback `Player` that still routes commands, resolves tracks, publishes events, but doesn't
emit audio. Keeps the build green without libVLC.

### `internal/audio/resolver.go`
Turns a user query/URL into a playable URI:
local path → `file://`; `http(s)://` → direct; YouTube/playlist → `yt-dlp -f bestaudio/best -g`;
plain query → `yt-dlp "ytsearchN:QUERY" --print "%(id)s\t%(title)s"` then resolve.
JSON via `-J` for title/duration.

### `internal/speech/speech.go`
`STT { Transcribe(ctx, wav) (string, error); Available() }` and
`TTS { Speak(ctx, text) error; Available() }`. `VoiceHost` combines them + a personality
(80s nerd: pitch/rate/one-liners). Subscribes `tts.speak`, publishes `stt.utterance`.

### `internal/speech/stt_whisper.go`
`WhisperSTT` — HTTP client to `whisper-server` (`speech.whisper.url`, default
`http://127.0.0.1:9090`). Multipart POST `/inference`, parse `text`. `GET /health` for
`Available()`.

### `internal/speech/tts_piper.go` / `tts_espeak.go`
`PiperTTS` — one long-lived `piper -m en_US-lessac-medium --output_raw` process, feed stdin,
emit WAV to the audio sink. `EspeakTTS` — `espeak-ng -v <variant> -p <pitch> -s <rate> -w out.wav`.
espeak is the character voice; piper the natural host voice.

### `internal/macros/macros.go`
The **[Vee]** command scripts. YAML macros with `trigger` + ordered `steps` (each step =
publish a bus command, e.g. `llm.chat`, `audio.play`, `audio.queueSearch`, `settings.set`,
`lexicon.set`, `wizard.start`). Registered as `command` entries. `macro.run` executes.

### `internal/wizards/wizards.go`
Creative-suite pipelines. `WizardSpec {ID,Title,Target,Questions,Steps}`. The engine drives
a jovial LLM conversation (persona from `wizard.persona`), collects answers, then emits
pipeline commands (e.g. render a comic to HTML/JS canvas, or generate a `.blend` script,
or write a SKILL.md that walks the user through Blender/character work). Beginner-first.

### `internal/arcade/arcade.go`
The screensaver service. Idle timer (setting `screensaver.idle`). Activates the `arcade`
layer, cycles 30-second game demos. Click → `pitter-patter` (deactivate) or `games` (arcade
terminal). Game catalog from `game` registry entries (scan of `web/arcade/games/` +
`third_party/games/` manifest). `state.arcade` replays the catalog.

### `internal/arcade/host.go`
The **80s nerd**. A `VoiceHost` with the nerd personality that runs an STT→LLM→TTS loop:
listen for a game request, respond in-character, launch via `arcade.launch`. Voice-only.

### `internal/server/server.go`
HTTP server (stdlib). Static file server for `web/`, SSE hub, and all API routes.
Publishes every bus event to every connected SSE client (the whole signal path is
live-visible in the browser console).

### `internal/server/sse.go`
The hub. `Subscribe(client)` → `chan`; every bus publish serialized to JSON, sent as one
SSE `data:` line. On client reconnect, replays `state.*` topics so the UI is instantly
consistent (this is why topics are *stateful*).

### `internal/server/routes.go`
Route table: `GET /` (shell), `GET /static/*`, `GET /api/events` (SSE), `GET/POST
/api/settings`, `GET /api/lexicon`, `GET /api/theme`, `GET /api/registry?kind=`, `GET /api/
layers`, `GET /api/games`, `POST /api/chat`, `POST /api/audio/play|pause|resume|stop|volume|
queueSearch`, `POST /api/speech/record` (ffmpeg-capture→STT), `POST /api/speech/speak`,
`POST /api/macros/run`, `POST /api/wizards/{id}/start`, `GET /partials/{name}`. Everything
is htmx-fragment or SSE-shaped.

### `web/index.html`
The layered surface shell: desktop layer (clear, click-catcher, glowing cursor), chat panel
(left 1/4), [Vee] wordmark (top-left, collapsible to a dot), notify toast stack, settings
drawer, arcade overlay, wizard overlay. Boots app.js.

### `web/static/app.js`
The brain in the browser: SSE connect + topic dispatch, `applyLexicon()` (substitute
`[data-lx]` text; empty → hide), `applyTheme()` (set CSS vars), click-to-chat with glowing
cursor and bubble spawn, [Vee] wordmark toggle + toast render, htmx wiring, arcade click
(→ pitter-patter / games).

### `web/static/app.css`
All styling via CSS custom properties set by the theme engine. Cyberpunk default skin.
Glow cursor, layered surfaces, arcade terminal chrome.

### `web/static/htmx.min.js`
Vendored htmx 2.x — offline-safe.

### `web/partials/*.html`
htmx fragments: `chat-panel`, `settings-panel`, `notify`, `command-palette`, `arcade`,
`arcade-terminal`, `pitter-patter`, `wizard`, `games-menu`.

### `web/arcade/games/*`
Vendored open-source games (see `scripts/fetch_games.sh`): breakout, tetris, pacman,
frogger, mario, racer, pinball, DOOM (js-dos bundle, user-supplied WAD or shareware
doom1.wad). `manifest.json` per game = a `game` registry entry.

### `scripts/fetch_games.sh`
Downloads the licensed games from their canonical repos (MIT/CC0/Unlicense/BSD only) into
`web/arcade/games/`. Never vendors unlicensed assets. Records licenses in `third_party/
LICENSES.md`.

### `scripts/pi_setup.sh`
Installs pi-harness, points it at llama.cpp (LFM2.5-2.6B) or a cloud provider, drops Vee's
extension tools + SKILL.md into the extensions/skills dirs.

---

## 4. The [Vee] macro format (registry `command`)

```yaml
id: vee.macros.funnyAnimals
name: funny animals
trigger: "animals"
steps:
  - action: audio.queueSearch
    args: { query: "funny animals compilation", n: 5 }
  - action: llm.chat
    args: { content: "Tell me one fun fact about each animal in the queue." }
```

Triggers match in chat (Vee button opens the palette; exact match or regex also accepted
mid-sentence). Steps publish bus commands. This is the extensible command API: **a macro is
just a list of bus commands.**

## 5. Install & run checklist

1. System: `sudo dnf install -y golang nodejs nodejs-npm sqlite vlc vlc-devel vlc-cli gcc gcc-c++ make cmake llama-cpp llama-cpp-devel piper python3-pip`
2. User: yt-dlp standalone binary into `~/.local/bin`
3. whisper.cpp: build `whisper-server`, download `ggml-tiny.en.bin`/`base.en`, run on :9090
4. pi: `npm i -g pi-harness`, configure provider, run on :8080 (or point at llama-server)
5. llama.cpp: `llama-server -hf LiquidAI/LFM2.5-2.6B-GGUF -c 4096 --port 8080` for the local model
6. `go mod tidy && go build ./... && go run ./cmd/vee` → http://127.0.0.1:8787
7. `./scripts/fetch_games.sh` to populate the arcade.

## 6. Seams to fortify (audit checklist for sub-agents)

- **pi-proxy seam** — SSE event shape normalization (pi-harness vs pi-native), session
  lifecycle, abort-on-disconnect, the `llm.pi.enabled` switch, CORS (we proxy, never expose
  pi directly).
- **audio seam** — build tags (`libvlc`/`!libvlc`), queue advance on `EndReached`,
  yt-dlp resolver error handling, HLS/icecast playback, volume without a sink.
- **speech seam** — whisper availability fallback, piper persistent process lifecycle,
  espeak character voices, push-to-talk UX.
- **lexicon/theme seam** — empty-value removal, re-derivation on settings change,
  `data-lx` coverage, button `data-command` remapping.
- **arcade seam** — game manifest schema, license safety (vendor only MIT/CC0/Unlicense/
  BSD; DOOM needs user WAD or shareware), js-dos embed, 30s demos, STT/TTS nerd host loop.

---

*Ticket ends. Every file above is fair game; every topic and registry kind above is binding.*
