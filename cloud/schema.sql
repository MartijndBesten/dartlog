-- OKKIE Community v1. Alleen gekozen, geaggregeerde publieke statistieken.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  recovery_hash TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 0 CHECK(visible IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stats (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  darts INTEGER NOT NULL,
  points INTEGER NOT NULL,
  sessions INTEGER NOT NULL,
  highest_turn INTEGER NOT NULL,
  hits100 INTEGER NOT NULL,
  hits140 INTEGER NOT NULL,
  hits180 INTEGER NOT NULL,
  best30 INTEGER,
  challenge30 INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(member_id, period)
);
CREATE INDEX IF NOT EXISTS idx_stats_period ON stats(period);
CREATE INDEX IF NOT EXISTS idx_member_visible ON members(visible);
-- Uitbreidingsruimte: lidmaatschappen, vrienden, clubs, betaalde rechten.
-- Bouw toekomstige functies als aparte tabellen zonder de data hierboven te muteren.
CREATE TABLE IF NOT EXISTS entitlements (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  origin TEXT NOT NULL,
  PRIMARY KEY(member_id, feature)
);
-- Logboek van beheeracties (zie migrations/0002_admin_audit.sql).
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_updated ON members(updated_at);
CREATE INDEX IF NOT EXISTS idx_members_created ON members(created_at);
