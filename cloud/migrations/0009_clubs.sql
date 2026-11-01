-- OKKIE. Club (proef, achter CLUBS_ENABLED): besloten clubs per vereniging. Alles is alleen zichtbaar voor actieve leden
-- van dezelfde club; de toegangscontrole zit in cloud/src/clubs.js. Alleen 16+ (MVP). Zie cloud/CLUB.md.
-- Geen losse pijlen of tijdstippen per pijl: per training alleen soort, aantal pijlen, punten en hoogste beurt.

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Uitnodigingscode (ook als QR). Geeft alleen een lidmaatschapsaanvraag; een beheerder keurt goed. Zichtbaar voor
  -- beheerders, te vernieuwen. Wordt niet gehasht omdat beheerders hem steeds opnieuw moeten kunnen tonen.
  invite_code TEXT NOT NULL UNIQUE,
  max_members INTEGER NOT NULL DEFAULT 150,
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_teams (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  captain_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_club_teams_club ON club_teams(club_id);

CREATE TABLE IF NOT EXISTS club_members (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','captain','member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
  team_id TEXT REFERENCES club_teams(id) ON DELETE SET NULL,
  requested_at TEXT NOT NULL,
  joined_at TEXT,
  PRIMARY KEY(club_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_club_members_member ON club_members(member_id);

-- Eén weekoefening per club per week (week = maandag, Europe/Amsterdam). Sluit zondag 22:00.
CREATE TABLE IF NOT EXISTS club_challenges (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('score30','score60','score99','clock')),
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE(club_id, week)
);

-- Beste resultaat per lid per weekoefening. value: punten (score, hoger is beter) of pijlen (clock, lager is beter).
CREATE TABLE IF NOT EXISTS club_results (
  challenge_id TEXT NOT NULL REFERENCES club_challenges(id) ON DELETE CASCADE,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  training_id TEXT NOT NULL,
  darts INTEGER NOT NULL,
  points INTEGER NOT NULL,
  high INTEGER,
  value INTEGER NOT NULL,
  submitted_at TEXT NOT NULL,
  PRIMARY KEY(challenge_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_club_results_club ON club_results(club_id);

-- Clubfeed: alleen trainingen die het lid per training zelf deelt. Bewaard 60 dagen.
CREATE TABLE IF NOT EXISTS club_feed (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  training_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('score30','score60','score99','free','clock')),
  darts INTEGER NOT NULL,
  points INTEGER NOT NULL,
  high INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(club_id, member_id, training_id)
);
CREATE INDEX IF NOT EXISTS idx_club_feed_club ON club_feed(club_id, created_at);
