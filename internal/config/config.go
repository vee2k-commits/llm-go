package config

import (
	"database/sql"
	"encoding/json"
	"sync"

	"vee/internal/bus"
)

type Config struct {
	mu    sync.RWMutex
	db    *sql.DB
	bus   *bus.Bus
	store map[string]interface{}
}

func New(db *sql.DB, bus *bus.Bus) *Config {
	cfg := &Config{
		db:    db,
		bus:   bus,
		store: make(map[string]interface{}),
	}
	_ = cfg.ensureSchema()
	_ = cfg.loadAll()
	bus.Publish("state.settings", cfg.GetAll())
	return cfg
}

func (c *Config) Set(key string, value interface{}) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = c.db.Exec(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`, key, raw)
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.store[key] = value
	settings := c.GetAll()
	c.mu.Unlock()

	c.bus.Publish("settings.changed", map[string]interface{}{"key": key, "value": value})
	c.bus.Publish("settings.changed."+key, map[string]interface{}{"key": key, "value": value})
	c.bus.Publish("state.settings", settings)
	return nil
}

func (c *Config) Get(key string) interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.store[key]
}

func (c *Config) GetAll() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()
	copy := make(map[string]interface{}, len(c.store))
	for k, v := range c.store {
		copy[k] = v
	}
	return copy
}

func (c *Config) ensureSchema() error {
	_, err := c.db.Exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value BLOB)`)
	return err
}

func (c *Config) loadAll() error {
	rows, err := c.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var raw []byte
		if err := rows.Scan(&key, &raw); err != nil {
			return err
		}
		var value interface{}
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &value)
		}
		c.store[key] = value
	}
	return rows.Err()
}
