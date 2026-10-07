import assert from 'node:assert/strict';
import { ACTIVE_SKILLS, CARDS, DEFAULT_LOADOUT, Expedition, HIRES, WEAPONS, isValidLoadout, normalizeLoadout } from '../engine.mjs';
import { createExpedition } from '../camp.mjs';
import { freshState, SaveStore, SAVE_KEY, encode } from '../save.mjs';

class Memory{
  constructor(){this.data=new Map();}
  getItem(key){return this.data.get(key)||null;}
  setItem(key,value){this.data.set(key,value);}
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}

await test('camp loadout requires three unique buildings, one hire, one weapon and one active skill',()=>{
  assert.equal(isValidLoadout(DEFAULT_LOADOUT),true);
  assert.equal(isValidLoadout({...normalizeLoadout(DEFAULT_LOADOUT),cards:['watchtower','catapult','wall','spring']}),false);
  assert.equal(isValidLoadout({...normalizeLoadout(DEFAULT_LOADOUT),cards:['watchtower','catapult','hunter','guard']}),false);
  assert.equal(isValidLoadout({...normalizeLoadout(DEFAULT_LOADOUT),skills:['volley','shock']}),false);
  for(const weapon of Object.keys(WEAPONS))assert.equal(isValidLoadout({...normalizeLoadout(DEFAULT_LOADOUT),weapons:[weapon]}),true);
});

await test('new expedition carries only its configured cards, weapon and skill',()=>{
  const state=freshState();state.camp.loadout={cards:['torch','nest','spring','guard'],weapons:['axe'],skills:['shock']};
  const g=createExpedition(state,744,'configured-run');
  assert.deepEqual(g.loadout,state.camp.loadout);assert.equal(g.hero.weapon,'axe');assert.deepEqual(g.hand,['torch','nest','spring',null]);
  assert.equal(g.inventory.torch,2);assert.equal(g.inventory.guard,1);assert.equal(g.inventory.watchtower,0);assert.equal(g.carriesSkill('shock'),true);assert.equal(g.carriesSkill('volley'),false);
  g.setDeck('hire');assert.deepEqual(g.hand,['guard',null,null,null]);
});

await test('uncarried cards, skill growth, skills and weapon switching are blocked',()=>{
  const state=freshState(),g=createExpedition(state,745,'limited-run');g.tutorial=null;g.materials={wood:99,bone:99};g.amber=99;
  assert.match(g.purchasePlan('spring').reason,/未加入/);assert.match(g.purchasePlan('skill-shock-field').reason,/出征配置/);assert.match(g.purchasePlan('skill-axe').reason,/出征配置/);assert.match(g.purchasePlan('skill-spring').reason,/出征配置/);
  assert.equal(g.switchWeapon(),false);assert.equal(g.hero.weapon,'spear');g.phase='wave';g.wave=1;g.spawnQueue=[];g.spawnEnemy('brute',{x:430,y:475});
  assert.equal(g.castSkill('shock'),false);assert.equal(g.castSkill('volley'),true);
});

await test('configured loadout survives exact snapshot restore while old snapshots remain unrestricted',()=>{
  const configured=createExpedition(freshState(),746,'saved-loadout'),snapshot=configured.snapshot(),restored=Expedition.restore(snapshot);
  assert.deepEqual(restored.snapshot(),snapshot);assert.equal(restored.loadout.legacy,undefined);
  delete snapshot.loadout;delete snapshot.tutorial;const legacy=Expedition.restore(snapshot);assert.equal(legacy.loadout.legacy,true);assert.equal(legacy.carriesSkill('shock'),true);assert.equal(legacy.switchWeapon(),false);
  legacy.paused=false;assert.equal(legacy.switchWeapon(),true);
});

await test('legacy camp saves gain the default loadout without changing an active run',async()=>{
  const memory=new Memory(),legacy=freshState(),active=new Expedition(747,'legacy-active').snapshot();delete legacy.camp.loadout;delete active.loadout;legacy.run=active;memory.setItem(SAVE_KEY,encode(legacy,3,12345));
  const store=new SaveStore(memory);assert.deepEqual(store.state.camp.loadout,normalizeLoadout(DEFAULT_LOADOUT));assert.equal(store.state.run.loadout,undefined);
  await store.mutate(state=>{state.camp.loadout={cards:['torch','nest','spring','guard'],weapons:['axe'],skills:['shock']};});
  assert.equal(store.state.run.loadout,undefined);const resumed=Expedition.restore(store.state.run);assert.equal(resumed.loadout.legacy,true);
});

assert.equal(Object.keys(CARDS).length,6);assert.equal(Object.keys(HIRES).length,2);assert.equal(Object.keys(ACTIVE_SKILLS).length,2);assert.equal(Object.keys(WEAPONS).length,5);
console.log(`\n${passed} loadout scenarios passed.`);
