import assert from 'node:assert/strict';
import {Expedition,DEPLOY_CARDS} from '../engine.mjs';
import {SaveStore,SAVE_KEY,encode,freshState,decode} from '../save.mjs';
let passed=0;async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
const fresh=()=>new Expedition(1946,'market-run');
const tick=(g,n)=>{for(let i=0;i<n;i++)g.tick(.02);};
class Memory{constructor(){this.map=new Map();this.fail=false;}getItem(k){return this.map.get(k)||null;}setItem(k,v){if(this.fail)throw Error('quota');this.map.set(k,v);}}
await test('purchase freely selects a fixed catalogue card and deducts its exact materials',()=>{
 const g=fresh();for(const id of Object.keys(DEPLOY_CARDS))assert.ok(g.price(id));const before=g.inventory.nest;assert.ok(g.buy('nest').ok);assert.deepEqual(g.materials,{wood:4,bone:1});assert.equal(g.inventory.nest,before+1);assert.equal(g.amber,16);assert.equal(g.buy('unknown').ok,false);
});
await test('insufficient funds and capped inventories make no partial changes',()=>{
 const g=fresh();g.materials.bone=0;let before=g.snapshot();assert.equal(g.buy('hunter').ok,false);assert.deepEqual(g.snapshot(),before);g.materials.bone=99;g.inventory.torch=99;before=g.snapshot();assert.equal(g.buy('torch').ok,false);assert.deepEqual(g.snapshot(),before);
});
await test('battle closes the merchant but permits deployment of owned cards',()=>{
 const g=fresh();g.nodes=[];g.startWave();assert.equal(g.buy('wall').ok,false);assert.equal(g.placeCard(2,240,420).ok,true);assert.equal(g.inventory.wall,0);
});
await test('used cards never refill and empty cards cannot be deployed after cooldown',()=>{
 const g=fresh();g.inventory.watchtower=1;g.nodes=[];g.placeCard(0,240,420);tick(g,60);assert.equal(g.inventory.watchtower,0);assert.equal(g.hand[0],'watchtower');assert.equal(g.placeCard(0,470,420).ok,false);assert.equal(g.amber,16);
});
await test('hire card deployment creates a real ally, consumes one contract, and no extra fee',()=>{
 const g=fresh();g.nodes=[];assert.ok(g.buy('hunter').ok);const balance=g.amber;g.setDeck('hire');const r=g.placeCard(0,240,300);assert.ok(r.ok);assert.equal(g.inventory.hunter,0);assert.equal(g.allies[0].type,'hunter');assert.equal(g.amber,balance);assert.equal(g.placeCard(0,470,300).ok,false);
});
await test('ranged hire follows and shoots actual damage at enemies',()=>{
 const g=fresh();g.nodes=[];g.inventory.hunter=1;g.setDeck('hire');const a=g.placeCard(0,240,300).ally;const e=g.spawnEnemy('brute',{x:380,y:300});tick(g,90);assert.ok(e.hp<e.maxHp);g.enemies=[];const x=a.x;g.hero.x=500;tick(g,70);assert.ok(a.x>x);
});
await test('shield hire attacks, can be targeted and dies without refunding a contract',()=>{
 const g=fresh();g.nodes=[];g.inventory.guard=1;g.setDeck('hire');const a=g.placeCard(1,240,300).ally;const e=g.spawnEnemy('brute',{x:270,y:300});tick(g,70);assert.ok(e.hp<e.maxHp);g.phase='wave';g.wave=1;g.hero.x=620;g.hero.y=700;e.cd=0;g.updateEnemy(e,.02);assert.equal(e.targetId,a.id);g.damageTarget(a,999);tick(g,1);assert.equal(g.allies.length,0);assert.equal(g.inventory.guard,0);
});
await test('four-ally capacity and invalid drop preserve unspent hire contracts',()=>{
 const g=fresh();g.nodes=[];g.inventory.hunter=5;g.setDeck('hire');assert.equal(g.placeCard(0,360,385).ok,false);assert.equal(g.inventory.hunter,5);for(const p of [[100,120],[600,120],[100,680],[600,680]]){g.cardTimers[0]=0;assert.ok(g.placeCard(0,...p).ok);}g.cardTimers[0]=0;assert.equal(g.placeCard(0,240,300).ok,false);assert.equal(g.inventory.hunter,1);
});
await test('all materials, inventory, hires and purchased skills survive deterministic restore',()=>{
 const a=fresh();a.nodes=[];a.materials={wood:80,bone:80};a.amber=80;a.buy('hunter');a.buy('skill-spear');a.setDeck('hire');a.placeCard(0,240,300);a.startWave();tick(a,50);const b=Expedition.restore(a.snapshot());assert.deepEqual(b.snapshot(),a.snapshot());b.paused=false;tick(a,60);tick(b,60);assert.deepEqual(b.snapshot(),a.snapshot());
});
await test('legacy three-choice save migrates to preparation without re-awarding completed wave',()=>{
 const a=fresh();a.wave=2;a.stats.waves=2;a.amber=42;a.selectedUpgrades=['fire'];a.mods.fire=1.6;const old=a.snapshot();old.version=1;old.phase='draft';old.choices=['armor','loot','spear'];delete old.materials;delete old.inventory;delete old.allies;old.hand[0]=null;old.cardTimers[0]=.4;
 const b=Expedition.restore(old);assert.equal(b.phase,'prep');assert.equal(b.paused,true);assert.deepEqual(b.choices,[]);assert.equal(b.amber,42);assert.equal(b.mods.fire,1.6);assert.equal(b.stats.waves,2);assert.equal(b.snapshot().version,2);assert.equal(b.finishWave(),false);assert.deepEqual(Expedition.restore(b.snapshot()).snapshot(),b.snapshot());
});
await test('pre-offensive-card v2 saves restore without losing their legacy hand',()=>{
 const old=fresh().snapshot();delete old.inventory.watchtower;delete old.inventory.catapult;old.hand=['torch','wall','nest','spring'];
 const restored=Expedition.restore(old);assert.deepEqual(restored.hand,old.hand);assert.equal(restored.inventory.watchtower,0);assert.equal(restored.inventory.catapult,0);assert.equal(restored.inventory.torch,2);
});
await test('old envelope remains readable; new envelope blocks old clients from silently downgrading',()=>{
 const raw=JSON.parse(encode(freshState()));assert.equal(raw.version,10);raw.version=2;let h=2166136261;for(const c of JSON.stringify({version:raw.version,revision:raw.revision,updatedAt:raw.updatedAt,state:raw.state})){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}raw.checksum=(h>>>0).toString(16);assert.deepEqual(decode(JSON.stringify(raw)).state,freshState());
});
await test('failed purchase save can roll back both material balance and owned card',async()=>{
 const storage=new Memory(),store=new SaveStore(storage),g=fresh();await store.begin(g.snapshot());const before=g.snapshot();g.buy('torch');storage.fail=true;await assert.rejects(store.saveRun(g.snapshot()));const rollback=Expedition.restore(before);assert.equal(rollback.inventory.torch,2);assert.deepEqual(rollback.materials,{wood:8,bone:4});assert.deepEqual(decode(storage.getItem(SAVE_KEY)).state.run,before);
});
console.log(`\n${passed} merchant scenarios passed.`);
