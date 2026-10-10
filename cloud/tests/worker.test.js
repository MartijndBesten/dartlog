import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { internals } from '../src/worker.js';

test('nickname accepteert een voornaam of alias, geen HTML of e-mailadres', () => {
  assert.equal(internals.cleanNickname(' Senn  '),'Senn');
  assert.equal(internals.cleanNickname('Dart koning'),'Dart koning');
  assert.equal(internals.cleanNickname('<script>'),null);
  assert.equal(internals.cleanNickname('senn@example.nl'),null);
});
test('stats validatie blokkeert onmogelijke gemiddelden', () => {
  const valid = {period:'all',darts:30,points:850,sessions:1,highestTurn:85,hits100:0,hits140:0,hits180:0,best30:850,challenge30:850};
  assert.equal(internals.snapshotOkay(valid),true);
  assert.equal(internals.snapshotOkay({...valid,points:2000}),false);
  assert.equal(internals.snapshotOkay({...valid,hits180:2,hits140:1}),false);
  assert.equal(internals.snapshotOkay({...valid,period:'last:12'}),false);
  assert.equal(internals.snapshotOkay({...valid,darts:-30}),false);
});
test('preflight alleen voor expliciet toegestane origins', async () => {
  const env={ALLOWED_ORIGINS:'https://martijndbesten.github.io'};
  const allowed=await worker.fetch(new Request('https://api.example.org/v1/leaderboard',{method:'OPTIONS',headers:{Origin:'https://martijndbesten.github.io'}}),env);
  assert.equal(allowed.status,204);
  const denied=await worker.fetch(new Request('https://api.example.org/v1/leaderboard',{method:'OPTIONS',headers:{Origin:'https://other.example.org'}}),env);
  assert.equal(denied.status,403);
});
test('backend healthcheck werkt zonder database', async () => {
  const res=await worker.fetch(new Request('https://api.example.org/v1/health'),{});
  assert.equal(res.status,200);
  assert.equal((await res.json()).ok,true);
});
