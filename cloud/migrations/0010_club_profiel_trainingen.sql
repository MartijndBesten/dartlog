-- OKKIE. Club (proef, achter CLUBS_ENABLED): clublogo en eigen clubtrainingen. Zie cloud/CLUB.md.

-- Clublogo: al verkleind en vierkant in de app (JPEG of PNG, max. 200 kB), alleen zichtbaar voor leden van de club.
-- Bewust in D1 (geen extra dienst nodig); de code is zo opgezet dat R2 later kan.
CREATE TABLE IF NOT EXISTS club_logos (
  club_id TEXT PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png')),
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

-- Eigen clubtrainingen: door de beheerder (hele club of een team) of een captain (eigen team).
-- kind: score (eigen aantal pijlen), clock (rond de klok), target (pijlen op één vak), checkout (reeks uitgooiwaarden).
CREATE TABLE IF NOT EXISTS club_exercises (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES club_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK(kind IN ('score','clock','target','checkout')),
  darts INTEGER,
  target TEXT,
  checkouts TEXT,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_club_exercises_club ON club_exercises(club_id, ends_on);

-- Beste resultaat per lid per clubtraining. value: punten (score), pijlen (clock, lager is beter) of treffers.
CREATE TABLE IF NOT EXISTS club_exercise_results (
  exercise_id TEXT NOT NULL REFERENCES club_exercises(id) ON DELETE CASCADE,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  training_id TEXT,
  darts INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  hits INTEGER,
  value INTEGER NOT NULL,
  manual INTEGER NOT NULL DEFAULT 0 CHECK(manual IN (0,1)),
  submitted_at TEXT NOT NULL,
  PRIMARY KEY(exercise_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_club_exercise_results_club ON club_exercise_results(club_id);
