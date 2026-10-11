-- Darters: openbaar delen met één schakelaar per speler. Additief: bestaande gegevens blijven ongewijzigd.
-- Ouderlijke toestemming voor openbaar delen door spelers jonger dan 16: per speler, via een link, zonder ouderaccount.
CREATE TABLE IF NOT EXISTS public_consents (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_public_consents_member ON public_consents(member_id);
