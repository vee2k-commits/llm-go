#!/usr/bin/env bash
# fetch_games.sh — vendors license-safe open-source games into web/arcade/games.
# Idempotent: skips directories that already exist.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/web/arcade/games"
mkdir -p "$DEST"

# id|title|genre|repo|license|entry
GAMES=(
  "breakout|Breakout|Arcade|https://github.com/jakesgordon/javascript-breakout|MIT-ish (use freely)|index.html"
  "tetris|Tetris|Puzzle|https://github.com/dionyziz/canvas-tetris|MIT|index.html"
  "pacman|Pac-Man|Maze|https://github.com/platzhersh/pacman-canvas|CC0-1.0|index.html"
  "frogger|Frogger|Arcade|https://github.com/praneethy91/frogger-arcade-game|MIT|index.html"
  "mario|Super Mario|Platformer|https://github.com/robertkleffner/mariohtml5|Unlicense|main.html"
  "racer|Racer|Racing|https://github.com/lrq3000/javascript-racer|MIT|index.html"
  "pinball|Pinball|Pinball|https://github.com/h4k1m0u/pinball|MIT|index.html"
)

for entry in "${GAMES[@]}"; do
  IFS='|' read -r id title genre repo license page <<< "$entry"
  if [ -d "$DEST/$id" ]; then
    echo "skip  $id (already vendored)"
    continue
  fi
  echo "fetch $id <- $repo"
  git clone --depth 1 "$repo" "$DEST/$id"
  cat > "$DEST/$id/manifest.json" <<EOF
{
  "id": "$id",
  "title": "$title",
  "genre": "$genre",
  "engine": "html5",
  "entry": "$page",
  "license": "$license",
  "source": "$repo"
}
EOF
done

echo
echo "=== DOOM (js-dos) — NOT auto-cloned ==="
cat <<'EOF'
DOOM needs a WAD and a .jsdos bundle. The shareware episode (doom1.wad) is
freely distributable by id Software. Options:
  1. Put your own DOOM.WAD / DOOM2.WAD at web/arcade/games/doom/DOOM.WAD
  2. Or grab shareware doom1.wad from a reputable mirror, then build:
     mkdir -p web/arcade/games/doom
     # bundle = zip with DOOM.EXE, DOOM1.WAD, and .jsdos/dosbox.conf:
     #   [autoexec]
     #   DOOM.EXE
     # (the js-dos v8 docs: https://js-dos.com/jsdos-bundle.html)
  3. Record a 30s gameplay clip as web/arcade/games/doom/demo.webm for the
     screensaver demo cycle.
EOF

echo
echo "All done. Games live in $DEST"
echo "NOTE: re-run 'sudo chmod +x scripts/fetch_games.sh' if needed, then run it again to add new games."
