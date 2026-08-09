package registry

import (
	"database/sql"
	"encoding/json"
	"errors"
	"sync"

	"vee/internal/bus"
)

type Entry struct {
	Kind string                 `json:"kind"`
	ID   string                 `json:"id"`
	Data map[string]interface{} `json:"data"`
}

type Registry struct {
	mu    sync.RWMutex
	db    *sql.DB
	bus   *bus.Bus
	store map[string]map[string]Entry
}

func New(db *sql.DB, bus *bus.Bus) *Registry {
	r := &Registry{
		db:    db,
		bus:   bus,
		store: make(map[string]map[string]Entry),
	}
	_ = r.ensureSchema()
	_ = r.loadAll()
	return r
}

func (r *Registry) Register(entry Entry) error {
	if entry.Kind == "" || entry.ID == "" {
		return errors.New("registry entry kind and id are required")
	}
	data, err := json.Marshal(entry.Data)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(`INSERT OR REPLACE INTO registry(kind, id, data) VALUES(?, ?, ?)`, entry.Kind, entry.ID, data)
	if err != nil {
		return err
	}

	r.mu.Lock()
	if r.store[entry.Kind] == nil {
		r.store[entry.Kind] = make(map[string]Entry)
	}
	r.store[entry.Kind][entry.ID] = entry
	list := r.entriesByKind(entry.Kind)
	r.mu.Unlock()

	r.bus.Publish("registry.registered", entry)
	r.bus.Publish("state.registry."+entry.Kind, list)
	return nil
}

func (r *Registry) Unregister(kind, id string) error {
	_, err := r.db.Exec(`DELETE FROM registry WHERE kind = ? AND id = ?`, kind, id)
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if entries, ok := r.store[kind]; ok {
		delete(entries, id)
		r.bus.Publish("registry.removed", map[string]string{"kind": kind, "id": id})
		r.bus.Publish("state.registry."+kind, r.entriesByKind(kind))
	}
	return nil
}

func (r *Registry) Get(kind, id string) (Entry, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	entries, ok := r.store[kind]
	if !ok {
		return Entry{}, false
	}
	entry, ok := entries[id]
	return entry, ok
}

func (r *Registry) List(kind string) []Entry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.entriesByKind(kind)
}

func (r *Registry) ByKind(kind string) []Entry {
	return r.List(kind)
}

func (r *Registry) entriesByKind(kind string) []Entry {
	entries := make([]Entry, 0)
	if kindEntries, ok := r.store[kind]; ok {
		for _, entry := range kindEntries {
			entries = append(entries, entry)
		}
	}
	return entries
}

func (r *Registry) ensureSchema() error {
	_, err := r.db.Exec(`CREATE TABLE IF NOT EXISTS registry (kind TEXT NOT NULL, id TEXT NOT NULL, data BLOB, PRIMARY KEY(kind, id))`)
	return err
}

func (r *Registry) loadAll() error {
	rows, err := r.db.Query(`SELECT kind, id, data FROM registry`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var kind, id string
		var raw []byte
		if err := rows.Scan(&kind, &id, &raw); err != nil {
			return err
		}
		var data map[string]interface{}
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &data)
		}
		if data == nil {
			data = make(map[string]interface{})
		}
		entry := Entry{Kind: kind, ID: id, Data: data}
		if r.store[kind] == nil {
			r.store[kind] = make(map[string]Entry)
		}
		r.store[kind][id] = entry
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	for kind := range r.store {
		r.bus.Publish("state.registry."+kind, r.entriesByKind(kind))
	}
	return rows.Err()
}
