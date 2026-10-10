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
CREATE TABLE IF NOT EXISTS entitlements (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  origin TEXT NOT NULL,
  PRIMARY KEY(member_id, feature)
);
