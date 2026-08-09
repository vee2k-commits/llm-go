// Package db is Vee's SQLite persistence (pure-Go driver, no cgo).
package db

import (
	"context"
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// DB wraps *sql.DB with a tiny migration runner.
type DB struct {
	*sql.DB
}

// Open opens (and creates if needed) the SQLite file at path.
func Open(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	conn.SetMaxOpenConns(1) // modernc driver: keep single writer
	d := &DB{conn}
	if err := d.migrate(context.Background()); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

func (d *DB) migrate(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS kv (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS lexicon (
			key    TEXT PRIMARY KEY,
			value  TEXT NOT NULL DEFAULT '',
			scope  TEXT NOT NULL DEFAULT 'global'
		)`,
		`CREATE TABLE IF NOT EXISTS registry (
			id    TEXT PRIMARY KEY,
			kind  TEXT NOT NULL,
			json  TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id      TEXT PRIMARY KEY,
			backend TEXT NOT NULL DEFAULT '',
			created INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id        INTEGER PRIMARY KEY AUTOINCREMENT,
			session   TEXT NOT NULL,
			role      TEXT NOT NULL,
			content   TEXT NOT NULL,
			seq       INTEGER NOT NULL,
			ts        INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS macros (
			id   TEXT PRIMARY KEY,
			json TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS game_scores (
			game TEXT NOT NULL,
			score INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT 'YOU',
			ts INTEGER NOT NULL
		)`,
	}
	for _, s := range stmts {
		if _, err := d.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

// KV is a generic string key/value table.
func (d *DB) KVGet(ctx context.Context, key string) (string, bool, error) {
	var v string
	err := d.QueryRowContext(ctx, `SELECT value FROM kv WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

func (d *DB) KVSet(ctx context.Context, key, value string) error {
	_, err := d.ExecContext(ctx,
		`INSERT INTO kv(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// Setting load/store (json value).
func (d *DB) SettingGet(ctx context.Context, key string) (string, bool, error) {
	var v string
	err := d.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

func (d *DB) SettingSet(ctx context.Context, key, value string) error {
	_, err := d.ExecContext(ctx,
		`INSERT INTO settings(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func (d *DB) SettingsAll(ctx context.Context) (map[string]string, error) {
	rows, err := d.QueryContext(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// Lexicon load/store.
func (d *DB) LexiconGet(ctx context.Context, key string) (string, bool, error) {
	var v string
	err := d.QueryRowContext(ctx, `SELECT value FROM lexicon WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

func (d *DB) LexiconSet(ctx context.Context, key, value, scope string) error {
	_, err := d.ExecContext(ctx,
		`INSERT INTO lexicon(key, value, scope) VALUES(?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, scope = excluded.scope`,
		key, value, scope)
	return err
}

func (d *DB) LexiconClear(ctx context.Context, key string) error {
	_, err := d.ExecContext(ctx, `DELETE FROM lexicon WHERE key = ?`, key)
	return err
}

func (d *DB) LexiconAll(ctx context.Context) (map[string]string, error) {
	rows, err := d.QueryContext(ctx, `SELECT key, value FROM lexicon`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// Registry persist.
func (d *DB) RegistrySet(ctx context.Context, id, kind, json string) error {
	_, err := d.ExecContext(ctx,
		`INSERT INTO registry(id, kind, json) VALUES(?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, json = excluded.json`,
		id, kind, json)
	return err
}

func (d *DB) RegistryDelete(ctx context.Context, id string) error {
	_, err := d.ExecContext(ctx, `DELETE FROM registry WHERE id = ?`, id)
	return err
}

func (d *DB) RegistryAll(ctx context.Context) ([]string, []string, error) {
	rows, err := d.QueryContext(ctx, `SELECT id, json FROM registry`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var ids, jsons []string
	for rows.Next() {
		var id, j string
		if err := rows.Scan(&id, &j); err != nil {
			return nil, nil, err
		}
		ids = append(ids, id)
		jsons = append(jsons, j)
	}
	return ids, jsons, rows.Err()
}
