-- OKKIE. 1.10.0: de weekoefening en de clubfeed kunnen ook Bob's 27 (bobs27) en 121 Checkout (c121) zijn.
-- Alleen de eindscore gaat naar de club: Bob's 27 = score (63 pijlen), 121 = hoogste uitgegooide doel ('niveau').
--
-- SQLite kan een CHECK niet wijzigen, dus de drie tabellen worden opnieuw opgebouwd met dezelfde kolommen en gegevens.
-- Volgorde zo dat er nooit een ON DELETE CASCADE afgaat en er niets verloren gaat:
--   1. nieuwe tabellen maken en alles kopiëren;
--   2. eerst de kindtabel (club_results) weggooien, daarna de oudertabel (club_challenges): op dat moment verwijst er
--      niets meer naar de oude club_challenges, dus het weggooien raakt geen andere rijen;
--   3. de nieuwe tabellen hernoemen (SQLite past de verwijzing in club_results daarbij mee aan) en indexen terugzetten.
-- Getest in cloud/tests/migratie-0011.test.js met gegevens erin en foreign keys aan.

CREATE TABLE club_challenges_v2 (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('score30','score60','score99','clock','bobs27','c121')),
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE(club_id, week)
);
INSERT INTO club_challenges_v2 (id, club_id, week, kind, created_by, created_at)
  SELECT id, club_id, week, kind, created_by, created_at FROM club_challenges;

CREATE TABLE club_results_v2 (
  challenge_id TEXT NOT NULL REFERENCES club_challenges_v2(id) ON DELETE CASCADE,
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
INSERT INTO club_results_v2 (challenge_id, club_id, member_id, training_id, darts, points, high, value, submitted_at)
  SELECT challenge_id, club_id, member_id, training_id, darts, points, high, value, submitted_at FROM club_results;

CREATE TABLE club_feed_v2 (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  training_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('score30','score60','score99','free','clock','bobs27','c121')),
  darts INTEGER NOT NULL,
  points INTEGER NOT NULL,
  high INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(club_id, member_id, training_id)
);
INSERT INTO club_feed_v2 (id, club_id, member_id, training_id, kind, darts, points, high, created_at)
  SELECT id, club_id, member_id, training_id, kind, darts, points, high, created_at FROM club_feed;

DROP TABLE club_results;
DROP TABLE club_challenges;
DROP TABLE club_feed;

ALTER TABLE club_challenges_v2 RENAME TO club_challenges;
ALTER TABLE club_results_v2 RENAME TO club_results;
ALTER TABLE club_feed_v2 RENAME TO club_feed;

CREATE INDEX IF NOT EXISTS idx_club_results_club ON club_results(club_id);
CREATE INDEX IF NOT EXISTS idx_club_feed_club ON club_feed(club_id, created_at);
