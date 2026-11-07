-- OKKIE. Club bij het bord: meerdere toegangscodes per club. Zie cloud/CLUB.md ("Codes en QR-codes").
--
-- kind 'board'    = clubcode bij het dartbord (QR-poster in de kantine). Onbeperkt bruikbaar. De beheerder kiest per
--                   code of nieuwe spelers eerst goedgekeurd worden (auto_approve 0, standaard) of direct meedoen (1).
-- kind 'personal' = persoonlijke uitnodiging voor één speler: één keer bruikbaar, verloopt, speler is direct lid.
--
-- Voorbereid voor later (nog niet in de app): meer borden/locaties (meerdere board-codes met een label) en aparte
-- groepen (team_id: wie via deze code binnenkomt, komt meteen in dat team, bijv. jeugd of senioren).
--
-- Een code ongeldig maken = de rij weghalen; vernieuwen = nieuwe rij met dezelfde instellingen, oude rij weg.
-- clubs.invite_code blijft bestaan en is altijd gelijk aan de hoofd-bordcode, zodat oudere apps (1.10.0) die alleen
-- inviteCode kennen gewoon blijven werken.

CREATE TABLE IF NOT EXISTS club_codes (
  code TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('board','personal')),
  label TEXT NOT NULL DEFAULT '',
  auto_approve INTEGER NOT NULL DEFAULT 0 CHECK(auto_approve IN (0,1)),
  team_id TEXT REFERENCES club_teams(id) ON DELETE SET NULL,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_club_codes_club ON club_codes(club_id, kind);

-- Bestaande clubs: hun huidige code wordt de hoofd-bordcode, met goedkeuring (precies het gedrag van 1.10.0).
INSERT OR IGNORE INTO club_codes(code, club_id, kind, label, auto_approve, created_at)
  SELECT invite_code, id, 'board', '', 0, created_at FROM clubs;
