-- Logboek van beheeracties (verbergen/verwijderen van profielen). Geen persoonsgegevens van spelers:
-- alleen de profielcode (handle) en wie de actie uitvoerde (Access-e-mail van de beheerder).
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_updated ON members(updated_at);
CREATE INDEX IF NOT EXISTS idx_members_created ON members(created_at);
