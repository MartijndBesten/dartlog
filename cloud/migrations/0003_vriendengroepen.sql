-- OKKIE. Mijn vrienden: besloten vriendengroepen met uitnodigingen, voor alle leeftijden.
-- Alleen samengevatte statistieken (tabel stats); nooit losse worpen of trainingsmomenten.
-- Additief: bestaande tabellen en gegevens blijven ongewijzigd bruikbaar.

-- Beste totaal in één afgeronde training van precies 60 / 99 pijlen (naast best30).
ALTER TABLE stats ADD COLUMN best60 INTEGER;
ALTER TABLE stats ADD COLUMN best99 INTEGER;

-- Alleen de leeftijdsgroep (geen geboortedatum) en wanneer/hoe toestemming voor delen is gegeven.
-- consent_method: 'zelf' (16+), 'ouderlink' (ouder/verzorger bevestigde via eenmalige link), 'dienst' (andere grondslag,
-- alleen na juridisch besluit via MINOR_CONSENT), NULL = nog niet.
ALTER TABLE members ADD COLUMN age_group TEXT NOT NULL DEFAULT 'adult' CHECK(age_group IN ('adult','minor'));
ALTER TABLE members ADD COLUMN consent_at TEXT;
ALTER TABLE members ADD COLUMN consent_method TEXT CHECK(consent_method IN ('zelf','ouderlink','dienst'));

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  max_members INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Lidmaatschap en per groep de expliciete keuze wat de speler deelt.
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
  share_average INTEGER NOT NULL DEFAULT 0 CHECK(share_average IN (0,1)),
  share_records INTEGER NOT NULL DEFAULT 0 CHECK(share_records IN (0,1)),
  share_challenge INTEGER NOT NULL DEFAULT 0 CHECK(share_challenge IN (0,1)),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(member_id);

-- Uitnodigingen: alleen de SHA-256 van het token wordt bewaard; het token zelf staat alleen in de link.
CREATE TABLE IF NOT EXISTS group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id);

-- Toestemming van een ouder/verzorger voor een speler jonger dan 16, zonder ouderaccount.
-- Eén rij per kind: gehashte eenmalige link, de groep waar het kind bij wil en zijn deelkeuze.
-- Na bevestigen blijft de link bruikbaar om de toestemming in te trekken (dan wordt alles online gewist).
CREATE TABLE IF NOT EXISTS parent_consents (
  member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  invite_id TEXT REFERENCES group_invites(id) ON DELETE SET NULL,
  share_average INTEGER NOT NULL DEFAULT 0,
  share_records INTEGER NOT NULL DEFAULT 0,
  share_challenge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT
);

-- Eenmalige vlaggen, zoals "oprichterscode gebruikt".
CREATE TABLE IF NOT EXISTS app_flags (
  key TEXT PRIMARY KEY,
  value TEXT,
  at TEXT NOT NULL
);
