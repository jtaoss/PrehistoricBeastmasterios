import assert from 'node:assert/strict';
import { Expedition, COMPANIONS, companionXPNeeded } from '../engine.mjs';
import { SaveStore, freshState, encode, SAVE_KEY } from '../save.mjs';
import { createExpedition } from '../camp.mjs';

class Memory{
  constructor(){this.data=new Map();}
  getItem(key){return this.data.get(key)||null;}
  setItem(key,value){this.data.set(key,value);}
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
const battle=type=>{const g=new Expedition(19,`companion-${type}`);g.nodes=[];g.phase='wave';g.wave=1;g.spawnQueue=[];g.spawnTimer=999;g.hero.x=210;g.hero.y=300;g.setCompanion(type,{level:1,xp:0});g.companion.x=240;g.companion.y=300;g.consumeEvents();return g;};

await test('emberclaw follows, attacks and ignites an area every fourth strike',()=>{
  const g=battle('emberclaw'),primary=g.spawnEnemy('brute',{x:275,y:300}),nearby=g.spawnEnemy('brute',{x:292,y:325}),start=nearby.hp;
  for(let i=0;i<4;i++){g.companion.cd=0;g.updateCompanion(.01);}
  assert.ok(primary.hp<primary.maxHp);assert.ok(nearby.hp<start);assert.ok(primary.burn>0&&nearby.burn>0);assert.equal(g.companion.attackCount,4);
});

await test('tideroot fires slowing tide shots and periodically heals hunter and nest',()=>{
  const g=battle('tideroot'),enemy=g.spawnEnemy('brute',{x:390,y:300});g.hero.hp=45;g.base.hp=100;g.companion.cd=0;g.companion.abilityCD=0;g.updateCompanion(.01);
  assert.ok(g.hero.hp>45&&g.base.hp>100);assert.equal(g.projectiles[0].kind,'companion-tide');
  for(let i=0;i<40;i++)g.updateProjectiles(.02);
  assert.ok(enemy.hp<enemy.maxHp);assert.ok(enemy.slow>0);
});

await test('stoneback reduces incoming damage and releases a slowing crystal shockwave',()=>{
  const g=battle('stoneback'),primary=g.spawnEnemy('brute',{x:280,y:300}),nearby=g.spawnEnemy('brute',{x:302,y:325}),hp=g.companion.hp,start=nearby.hp;
  g.damageTarget(g.companion,100);assert.equal(g.companion.hp,hp-62);
  for(let i=0;i<3;i++){g.companion.cd=0;g.updateCompanion(.01);}
  assert.ok(primary.hp<primary.maxHp);assert.ok(nearby.hp<start);assert.ok(primary.slow>0&&nearby.slow>0);
});

await test('companion experience levels permanently and survives snapshot restore',()=>{
  const g=battle('emberclaw');g.companion.xp=companionXPNeeded(1)-1;const enemy=g.spawnEnemy('raptor',{x:280,y:300});g.hitEnemy(enemy,9999);
  assert.equal(g.companion.level,2);assert.ok(g.companion.xp>=0);assert.ok(g.companion.maxHp>COMPANIONS.emberclaw.hp);
  const restored=Expedition.restore(g.snapshot());assert.deepEqual(restored.companionProgress(),g.companionProgress());assert.equal(restored.companion.hp,g.companion.hp);
});

await test('old saves gain a locked roster without losing existing progress',()=>{
  const memory=new Memory(),legacy=freshState();delete legacy.profile.companions;legacy.profile.runs=9;legacy.camp.stones=23;memory.setItem(SAVE_KEY,encode(legacy,4,1234));
  const store=new SaveStore(memory);assert.equal(store.state.profile.runs,9);assert.equal(store.state.camp.stones,23);assert.equal(store.state.profile.companions.selected,null);assert.equal(Object.keys(store.state.profile.companions.roster).length,3);
});

await test('selected companion joins new expeditions and autosave syncs level and xp',async()=>{
  const state=freshState(),saved=state.profile.companions;Object.assign(saved.roster.tideroot,{unlocked:true,level:3,xp:17});saved.selected='tideroot';
  const g=createExpedition(state,31,'persistent-companion');assert.equal(g.companion.type,'tideroot');assert.equal(g.companion.level,3);
  const store=new SaveStore(new Memory());await store.mutate(s=>{s.profile=structuredClone(state.profile);});await store.begin(g.snapshot());g.companion.level=4;g.companion.xp=22;g.companion.maxHp=g.companionMaxHp('tideroot',4);await store.saveRun(g.snapshot());
  assert.deepEqual(store.state.profile.companions.roster.tideroot,{unlocked:true,level:4,xp:22});assert.equal(store.state.profile.companions.selected,'tideroot');
});

console.log(`\n${passed} companion scenarios passed.`);
