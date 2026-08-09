// Package theme derives CSS custom properties from settings. The browser sets
// them as variables on :root, so typography, colors, radii and component skins
// are all runtime-mutable (that's the "settings-heavy" surface).
package theme

import (
	"sort"

	"vee/internal/bus"
	"vee/internal/config"
)

// Vars returns the full CSS custom-property map derived from settings.
func Vars(cfg *config.Store) map[string]string {
	v := map[string]string{}

	// Typography
	v["--font-family"] = orDefault(cfg, "theme.font.family", `"JetBrains Mono", ui-monospace, monospace`)
	v["--font-size"] = orDefault(cfg, "theme.font.size", "15px")
	v["--font-line-height"] = orDefault(cfg, "theme.font.line-height", "1.6")

	// Core palette
	v["--color-bg"] = orDefault(cfg, "theme.color.bg", "#07070d")
	v["--color-surface"] = orDefault(cfg, "theme.color.surface", "#0e0e1a")
	v["--color-panel"] = orDefault(cfg, "theme.color.panel", "#12121f")
	v["--color-text"] = orDefault(cfg, "theme.color.text", "#d7d9ee")
	v["--color-muted"] = orDefault(cfg, "theme.color.muted", "#7a7f9e")
	v["--color-primary"] = orDefault(cfg, "theme.color.primary", "#00e5ff")
	v["--color-accent"] = orDefault(cfg, "theme.color.accent", "#ff2d78")
	v["--color-success"] = orDefault(cfg, "theme.color.success", "#39ff88")
	v["--color-warn"] = orDefault(cfg, "theme.color.warn", "#ffb200")
	v["--color-error"] = orDefault(cfg, "theme.color.error", "#ff4d5e")
	v["--color-glow"] = orDefault(cfg, "theme.color.glow", "rgba(0,229,255,0.55)")

	// Geometry
	v["--radius"] = orDefault(cfg, "theme.radius", "10px")
	v["--radius-lg"] = orDefault(cfg, "theme.radius-lg", "16px")
	v["--chat-panel-width"] = orDefault(cfg, "theme.chat.width", "25%")
	v["--glow-size"] = orDefault(cfg, "theme.cursor.glow", "34px")

	// Button skin (colors + shape). Behavior is separate: buttons carry
	// data-command="<id>" remapped through the registry, not CSS.
	v["--btn-bg"] = orDefault(cfg, "theme.button.bg", "var(--color-primary)")
	v["--btn-fg"] = orDefault(cfg, "theme.button.fg", "#04121c")
	v["--btn-radius"] = orDefault(cfg, "theme.button.radius", "8px")
	v["--btn-hover-bright"] = orDefault(cfg, "theme.button.hover-brightness", "1.15")

	// Arcade / screensaver
	v["--arcade-bg"] = orDefault(cfg, "theme.arcade.bg", "#0a0114")
	v["--arcade-neon"] = orDefault(cfg, "theme.arcade.neon", "#c026ff")

	return v
}

// VarsForExport returns vars sorted for stable output.
func VarsForExport(cfg *config.Store) map[string]string {
	return Vars(cfg)
}

// Watch subscribes to settings.changed and republishes state.theme whenever a
// theme.* knob changes. Returns an unsubscribe func.
func Watch(b *bus.Bus, cfg *config.Store) func() {
	return b.SubscribePattern("settings.changed", func(msg bus.Msg) {
		if m, ok := msg.Payload.(map[string]string); ok {
			if len(m["key"]) >= 6 && m["key"][:6] == "theme." {
				// also listen for color/button group renames
			}
		}
		publish(b, cfg)
	})
}

// publish emits the current var map.
func publish(b *bus.Bus, cfg *config.Store) {
	v := Vars(cfg)
	keys := make([]string, 0, len(v))
	for k := range v {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	b.Publish("state.theme", v)
	b.Publish("theme.changed", v)
}

func orDefault(cfg *config.Store, key, def string) string {
	if v := cfg.Get(key); v != "" {
		return v
	}
	return def
}
