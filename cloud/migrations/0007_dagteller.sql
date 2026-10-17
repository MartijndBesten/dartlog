-- Anonieme dagteller (1.7.2). De app meldt hooguit één keer per dag dat hij geopend is, met alleen het versienummer
-- en of dit toestel voor het eerst meldt. Per dag en versie bewaren we uitsluitend aantallen: geen ID, geen IP-adres,
-- geen tijdstip fijner dan de dag. Hieruit valt niets naar een persoon of toestel te herleiden.
CREATE TABLE usage_days (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  opens INTEGER NOT NULL DEFAULT 0,
  new_devices INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, version)
);
