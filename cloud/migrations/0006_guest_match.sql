-- Koppelcode ook voor één 301/501-wedstrijd (1.6.0). Zelfde inbox; kind = 'match' en de eindstand als JSON
-- (spel, legs per speler, winnaar of gestopt, beste finish). Geen namen, geen beurten. Bestaande rijen blijven trainingen.
ALTER TABLE guest_inbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'training';
ALTER TABLE guest_inbox ADD COLUMN match_json TEXT;
