// Migratie 0011 (weekoefening en feed ook voor Bob's 27 en 121): bestaande clubgegevens blijven volledig staan,
// de verwijzingen en het automatisch opruimen (ON DELETE CASCADE) werken daarna nog, en de nieuwe soorten mogen erin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

function upTo(last) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of files) { if (f > last) break; db.exec(readFileSync(dir + f, 'utf8')); }
  return db;
}

test('0011: alle rijen blijven, cascade en verwijzingen werken, nieuwe soorten toegestaan, onbekende geweigerd', () => {
  const db = upTo('0010_club_profiel_trainingen.sql');
  const t = '2026-11-01 10:00:00';
  db.exec(`INSERT INTO members(id, handle, nickname, token_hash, recovery_hash, created_at, updated_at) VALUES
    ('m1','aaaaaaaaaaaa','Ann','h1','r1','${t}','${t}'), ('m2','bbbbbbbbbbbb','Bob','h2','r2','${t}','${t}')`);
  db.exec(`INSERT INTO clubs(id, name, invite_code, created_by, created_at, updated_at) VALUES ('c1','Club A','AAAAAAAA','m1','${t}','${t}'), ('c2','Club B','BBBBBBBB','m2','${t}','${t}')`);
  db.exec(`INSERT INTO club_challenges(id, club_id, week, kind, created_by, created_at) VALUES ('ch1','c1','2026-10-26','score30','m1','${t}'), ('ch2','c2','2026-10-26','clock','m2','${t}')`);
  db.exec(`INSERT INTO club_results(challenge_id, club_id, member_id, training_id, darts, points, high, value, submitted_at) VALUES
    ('ch1','c1','m1','t1',30,900,100,900,'${t}'), ('ch1','c1','m2','t2',30,600,60,600,'${t}'), ('ch2','c2','m2','t3',40,0,NULL,40,'${t}')`);
  db.exec(`INSERT INTO club_feed(id, club_id, member_id, training_id, kind, darts, points, high, created_at) VALUES ('f1','c1','m1','t1','score30',30,900,100,'${t}')`);
  const before = ['club_challenges', 'club_results', 'club_feed'].map(x => db.prepare(`SELECT * FROM ${x} ORDER BY 1, 2`).all());

  db.exec(readFileSync(dir + '0011_club_oefeningen.sql', 'utf8'));

  const after = ['club_challenges', 'club_results', 'club_feed'].map(x => db.prepare(`SELECT * FROM ${x} ORDER BY 1, 2`).all());
  assert.deepEqual(after, before, 'alle rijen en waarden identiek');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const fk = db.prepare("PRAGMA foreign_key_list('club_results')").all().map(r => r.table).sort();
  assert.deepEqual(fk, ['club_challenges', 'clubs', 'members']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%_v2'").get().n, 0, 'geen hulptabellen over');
  for (const idx of ['idx_club_results_club', 'idx_club_feed_club']) assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE type = ? AND name = ?').get('index', idx).n, 1, idx);

  // Nieuwe soorten mogen; onbekende niet.
  db.exec(`INSERT INTO club_challenges(id, club_id, week, kind, created_at) VALUES ('ch3','c1','2026-11-02','bobs27','${t}'), ('ch4','c1','2026-11-09','c121','${t}')`);
  db.exec(`INSERT INTO club_feed(id, club_id, member_id, training_id, kind, darts, points, created_at) VALUES ('f2','c1','m1','d1','c121',30,124,'${t}')`);
  assert.throws(() => db.exec(`INSERT INTO club_challenges(id, club_id, week, kind, created_at) VALUES ('x','c1','2026-11-16','cricket','${t}')`), /CHECK/);
  assert.throws(() => db.exec(`INSERT INTO club_feed(id, club_id, member_id, training_id, kind, darts, points, created_at) VALUES ('x','c1','m1','d9','cricket',30,1,'${t}')`), /CHECK/);
  assert.throws(() => db.exec(`INSERT INTO club_results(challenge_id, club_id, member_id, training_id, darts, points, value, submitted_at) VALUES ('bestaat-niet','c1','m1','t',1,1,1,'${t}')`), /FOREIGN KEY/);

  // Cascade: weekoefening weg → resultaten weg; club weg → alles van die club weg, andere club blijft.
  db.exec("DELETE FROM club_challenges WHERE id = 'ch1'");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM club_results WHERE challenge_id = 'ch1'").get().n, 0);
  db.exec("DELETE FROM clubs WHERE id = 'c1'");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM club_feed WHERE club_id = 'c1'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM club_results WHERE club_id = 'c2'").get().n, 1, 'club B ongemoeid');
});
