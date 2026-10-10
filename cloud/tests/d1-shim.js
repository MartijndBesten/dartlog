// Testhulp: een D1-compatibele database op node:sqlite, zodat de volledige API zonder Cloudflare-account
// getest kan worden. Ondersteunt prepare().bind().first()/run()/all() en batch(), net als D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  async first() { return this.db.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { success: true, results: this.db.prepare(this.sql).all(...this.params), meta: {} }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.params); return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } }; }
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(migrationsDir + file, 'utf8'));
  return {
    prepare: sql => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try { const out = []; for (const s of statements) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    raw: db,
  };
}
