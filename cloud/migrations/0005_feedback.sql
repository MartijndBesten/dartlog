-- Hulp & feedback uit de app (Meer → Hulp & feedback). Alleen wat de gebruiker zelf instuurt plus de technische
-- gegevens die vooraf in de app getoond worden. Geen tokens, geen trainingen. Bewaartermijn: 180 dagen (cron).
-- ip_day_hash: gehasht IP-adres met de datum erin, alleen om misbruik per dag te beperken; niet te koppelen over dagen.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('probleem','idee')),
  message TEXT NOT NULL,
  contact TEXT,
  meta TEXT,
  screenshot TEXT,
  ip_day_hash TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0 CHECK(handled IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback(ip_day_hash);
