-- Darters iets uitgebreider (1.7.3): in het totaal ('all') ook dagen op rij, aantal badges, ontwikkeling (gemiddelde van de
-- laatste 10 trainingen min de 10 daarvoor) en het favoriete vak (meest geraakt, bijv. "T20"). Alleen samenvattingen,
-- alleen van spelers die delen aanzetten; bestaande rijen krijgen NULL. Nooit losse pijlen of tijdstippen.
ALTER TABLE stats ADD COLUMN streak INTEGER;
ALTER TABLE stats ADD COLUMN badges INTEGER;
ALTER TABLE stats ADD COLUMN delta10 REAL;
ALTER TABLE stats ADD COLUMN favorite TEXT;
