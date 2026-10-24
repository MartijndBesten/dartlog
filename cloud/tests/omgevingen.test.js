// Bewaakt de scheiding staging/productie in wrangler.toml, package.json en de app-configuratie.
// Aanleiding (24-10-2026): de stagingworker heette "okkie-community-api" en leek daardoor de productie-API;
// "npm run migrate:remote" verwees naar de productie-D1 zonder --env production (en faalde daardoor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const toml = read('../wrangler.toml');
const pkg = JSON.parse(read('../package.json'));
const appConfig = read('../../community/config.js');

const PROD_DB = { name: 'okkie-community', id: '6d496b27-7bc4-4c39-85cb-d77002d578bb' };
const STAGING_DB = { name: 'okkie-community-staging', id: 'ddf81dd7-c1e8-4482-8e5b-75d485966e8b' };

// Splitst de toml in het standaarddeel (staging) en het deel vanaf [env.production].
const cut = toml.indexOf('[env.production]');
const stagingPart = toml.slice(0, cut);
const productionPart = toml.slice(cut);
const field = (part, key) => [...part.matchAll(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'gm'))].map(m => m[1]);

test('wrangler.toml: staging en productie hebben elk een eigen naam en eigen D1', () => {
  assert.ok(cut > 0, '[env.production] ontbreekt');
  // De eerste name-regel per deel is de Workernaam (latere name-regels zijn rate-limit-bindings).
  assert.equal(field(stagingPart, 'name')[0], 'okkie-api-staging');
  assert.equal(field(productionPart, 'name')[0], 'okkie-api');
  assert.deepEqual(field(stagingPart, 'database_name'), [STAGING_DB.name]);
  assert.deepEqual(field(stagingPart, 'database_id'), [STAGING_DB.id]);
  assert.deepEqual(field(productionPart, 'database_name'), [PROD_DB.name]);
  assert.deepEqual(field(productionPart, 'database_id'), [PROD_DB.id]);
  assert.match(productionPart, /\[\[env\.production\.d1_databases\]\]/);
});

test('wrangler.toml: staging en productie delen geen rate-limit-namespace', () => {
  const ids = part => field(part, 'namespace_id');
  const s = ids(stagingPart), p = ids(productionPart);
  assert.equal(s.length, 2); assert.equal(p.length, 2);
  assert.equal(s.filter(x => p.includes(x)).length, 0);
});

test('wrangler.toml: registratie en groepen staan in beide omgevingen dicht', () => {
  for (const part of [stagingPart, productionPart]) {
    assert.deepEqual(field(part, 'REGISTRATION_ENABLED'), ['false']);
    assert.deepEqual(field(part, 'GROUPS_ENABLED'), ['false']);
    assert.doesNotMatch(part, /^MINORS_OPEN\s*=\s*"true"/m);
  }
});

test('package.json: geen dubbelzinnige deploy/migrate-scripts; productie altijd met --env production', () => {
  const scripts = pkg.scripts;
  assert.equal(scripts.deploy, undefined, 'gebruik deploy:staging of deploy:production');
  assert.equal(scripts['migrate:remote'], undefined, 'gebruik migrate:staging of migrate:production');
  for (const [name, cmd] of Object.entries(scripts)) {
    const touchesProdDb = new RegExp(`\\b${PROD_DB.name}\\b(?!-staging)`).test(cmd);
    const deploysProd = /wrangler deploy/.test(cmd) && /--env production/.test(cmd);
    if (touchesProdDb || deploysProd) {
      assert.match(cmd, /--env production/, `${name} raakt productie zonder --env production`);
      assert.match(name, /:production$/, `${name}: productiescripts eindigen op :production`);
    }
    if (/:staging$|:local$/.test(name)) assert.doesNotMatch(cmd, /--env production/, `${name} mag productie niet raken`);
  }
  assert.match(scripts['deploy:staging'], /--env=""/);
});

test('app: PROD_API wijst naar de productieworker, niet naar staging', () => {
  const m = appConfig.match(/PROD_API\s*=\s*'https:\/\/([^.']+)\.([^.']+)\.workers\.dev'/);
  assert.ok(m, 'PROD_API niet gevonden of geen workers.dev-adres');
  assert.equal(m[1], 'okkie-api');
  assert.doesNotMatch(appConfig, /okkie-api-staging|okkie-community-api/);
});
