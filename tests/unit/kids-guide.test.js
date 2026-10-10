import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, throwPractice, TARGET_DARTS } from '../../uitleg/score-oefening.js';

test('oefening start altijd leeg en zonder opgeslagen gegevens', () => {
  assert.deepEqual(initialState(),{
    index:0,total:0,darts:[],finished:false,
    message:'Raak je de triple 20? Tik hieronder op TRIPLE 20.',wrong:false
  });
});
test('drie juiste pijlen leveren 85: T20, 5 en D10', () => {
  let s=initialState();
  s=throwPractice(s,'T20');assert.equal(s.total,60);
  s=throwPractice(s,'S5');assert.equal(s.total,65);
  s=throwPractice(s,'D10');
  assert.equal(s.total,85);assert.equal(s.finished,true);assert.equal(s.darts.length,3);
  assert.deepEqual(s.darts.map(d=>d.points),[60,5,20]);
});
test('een foutieve toets verandert de score niet en geeft een uitleg', () => {
  const before=initialState();
  const s=throwPractice(before,'M');
  assert.equal(s.index,0);assert.equal(s.total,0);assert.equal(s.wrong,true);
  assert.match(s.message,/TRIPLE 20/);
  assert.equal(before.wrong,false);
});
test('na voltooiing komen er geen punten bij en kan opnieuw worden begonnen', () => {
  let s=initialState();
  for(const d of TARGET_DARTS)s=throwPractice(s,d.code);
  assert.deepEqual(throwPractice(s,'T20'),s);
  assert.equal(initialState().total,0);
});
