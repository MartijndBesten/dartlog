import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Backup from '../../js/backup-alert.js';
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))}};
const session = (id,playerId)=>({id,playerId,kind:'score',finishedAt:'2026-10-10T12:00:00Z',turns:[{darts:['S1','S2','S3']}]});
test('herinner pas na 10 afgeronde scoretrainingen per speler',()=>{
 const s=storage();const d={players:[{id:'a'},{id:'b'}],trainings:Array.from({length:10},(_,i)=>session('t'+i,'a'))};
 assert.equal(Backup.due(d,'a',s),true);
 assert.equal(Backup.due(d,'b',s),false);
 Backup.dismissed(d,'a',s);
 assert.equal(Backup.due(d,'a',s),false);
 d.trainings.push(...Array.from({length:10},(_,i)=>session('u'+i,'a')));
 assert.equal(Backup.due(d,'a',s),true);
 Backup.backedUp(d,s);
 assert.equal(Backup.due(d,'a',s),false);
});
test('geïmporteerde en niet afgeronde trainingen tellen niet',()=>{
 const s=storage();
 const d={players:[{id:'a'}],trainings:Array.from({length:20},(_,i)=>({...session('t'+i,'a'),summary:{points:200,darts:30}}))};
 assert.equal(Backup.completedCount(d,'a'),0);
 assert.equal(Backup.due(d,'a',s),false);
});
