import assert from 'node:assert/strict';
import {Expedition,validateSnapshot} from '../engine.mjs';
import {createExpedition} from '../camp.mjs';
import {freshState,SaveStore,SAVE_KEY} from '../save.mjs';

class Memory{constructor(){this.data=new Map();this.fail=false;}getItem(k){return this.data.get(k)||null;}setItem(k,v){if(this.fail&&k===SAVE_KEY)throw Error('quota');this.data.set(k,v);}}
let passed=0;async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
function game(skill='volley',weapon='spear',mandatory=false){
  const s=freshState();s.camp.loadout.skills=[skill];s.camp.loadout.weapons=[weapon];const g=createExpedition(s,17,'tutorial-run');g.tutorial.mandatory=mandatory;g.startWave();g.confirmTutorial();return g;
}
function confirm(g){for(let i=0;i<20&&!g.tutorial.awaiting;i++)g.tick(.05);assert.equal(g.tutorial.awaiting,true);const before=g.snapshot();for(let i=0;i<50;i++)g.tick(.05,{x:1});assert.deepEqual(g.snapshot(),before);assert.equal(g.confirmTutorial(),true);}
function walk(g){for(let i=0;i<12;i++)g.tick(.05,{x:1});assert.equal(g.tutorial.step,'move');confirm(g);assert.equal(g.tutorial.step,'attack');}
function attack(g){for(let i=0;i<120&&!g.tutorial.awaiting;i++)g.tick(.05);assert.equal(g.tutorial.attackHits,2);confirm(g);assert.equal(g.tutorial.step,'skill');}
function build(g){g.hero.dashTime=0;assert.equal(g.castSkill(g.loadout.skills[0]),true);confirm(g);assert.equal(g.tutorial.step,'build');const {x,y}=g.tutorial.buildSpot;assert.equal(g.placeCard(g.tutorial.slot,NaN,y).ok,false);const result=g.placeCard(g.tutorial.slot,x+70,y);assert.equal(result.ok,true);assert.equal(result.building.x,x);assert.equal(result.building.y,y);confirm(g);assert.equal(g.tutorial.step,'reward');}
function win(g){g.enemies=[];g.spawnQueue=[];g.drops=[{value:2}];g.finishWave();assert.ok(g.tutorial.reward);}

await test('first stage advances only after real movement, automatic fire, a successful skill and construction',()=>{
  const g=game(),original=g.inventory.watchtower;
  for(let i=0;i<40;i++)g.tick(.05);assert.equal(g.tutorial.step,'move');assert.equal(g.enemies.length,0);
  assert.equal(g.placeCard(0,200,470).ok,false);assert.equal(g.inventory.watchtower,original);assert.equal(g.castSkill('volley'),false);
  walk(g);const h=g.hero.hp,b=g.base.hp;g.damageTarget(g.hero,999);g.damageTarget(g.base,999);assert.equal(g.hero.hp,h);assert.equal(g.base.hp,b);
  attack(g);assert.equal(g.castSkill('shock'),false);assert.equal(g.tutorial.step,'skill');
  g.castSkill('volley');assert.equal(g.placeCard(0,200,470).ok,false);confirm(g);assert.equal(g.tutorial.step,'build');assert.equal(g.placeCard(0,600,600).ok,false);assert.equal(g.inventory.watchtower,original);assert.equal(g.placeCard(1,g.tutorial.buildSpot.x,g.tutorial.buildSpot.y).ok,false);g.placeCard(0,g.tutorial.buildSpot.x,g.tutorial.buildSpot.y);confirm(g);assert.equal(g.tutorial.step,'reward');assert.equal(g.inventory.watchtower,original-1);
  g.hero.invulnerable=0;g.damageTarget(g.hero,5);assert.ok(g.hero.hp<h);
});
await test('all five weapons and either carried skill can complete the safe practice steps',()=>{
  for(const weapon of ['spear','axe','bow','blades','hammer'])for(const skill of ['volley','shock']){
    const g=game(skill,weapon);walk(g);attack(g);for(let i=0;i<60;i++)g.tick(.05);assert.ok(g.enemies.some(e=>e.hp>0));build(g);
  }
});
await test('pause and restore retain exact step and do not activate deferred map events',()=>{
  const g=game();walk(g);g.paused=true;const before=g.snapshot();g.tick(.05,{x:1});assert.deepEqual(g.snapshot(),before);
  const restored=Expedition.restore(before);assert.deepEqual(restored.tutorial,before.tutorial);assert.deepEqual(restored.eventPlan,before.eventPlan);restored.paused=false;attack(restored);build(restored);
});
await test('first reward is pending across reload, blocks departure, and pays only once atomically',async()=>{
  const storage=new Memory(),store=new SaveStore(storage),g=game();await store.begin(g.snapshot());walk(g);attack(g);build(g);
  const before={...g.materials,amber:g.amber};win(g);assert.deepEqual({...g.materials,amber:g.amber},before);assert.equal(g.startWave(),false);assert.equal(g.purchasePlan('watchtower').ok,false);
  await store.saveRun(g.snapshot());let restored=Expedition.restore(new SaveStore(storage).state.run);const pending=restored.snapshot();restored.claimTutorialReward();storage.fail=true;await assert.rejects(store.saveRun(restored.snapshot()));assert.deepEqual(store.state.run,pending);
  storage.fail=false;restored=Expedition.restore(store.state.run);restored.claimTutorialReward();await store.saveRun(restored.snapshot());assert.equal(store.state.profile.tutorialDone,true);assert.equal(restored.materials.wood,before.wood+5);assert.equal(restored.materials.bone,before.bone+3);assert.equal(restored.amber,before.amber+5);assert.equal(restored.claimTutorialReward(),false);restored.paused=false;assert.equal(restored.startWave(),true);assert.equal(createExpedition(store.state,3,'next').tutorial,null);
});
await test('skip releases combat at every step and old active saves remain untouched',async()=>{
  for(const step of ['move','attack','skill','build','reward']){const g=game();g.tutorial.step=step;assert.equal(g.skipTutorial(),true);g.tick(.05);assert.equal(g.tutorial.status,'skipped');}
  const s=freshState();delete s.profile.tutorialDone;s.profile.runs=8;assert.equal(createExpedition(s,3,'old-profile').tutorial,null);
  const legacy=new Expedition(3,'old-run').snapshot();delete legacy.tutorial;assert.equal(Expedition.restore(legacy).tutorial,null);
  const g=game();walk(g);attack(g);build(g);win(g);g.skipTutorial();assert.equal(g.tutorial.reward,null);assert.equal(g.tutorial.status,'skipped');
});
await test('malformed steps and pending rewards are rejected on import',()=>{
  const s=game().snapshot();s.tutorial.step='unknown';assert.throws(()=>validateSnapshot(s));s.tutorial.step='reward';s.tutorial.reward={wood:5,bone:3,amber:-1};assert.throws(()=>validateSnapshot(s));s.tutorial.reward.amber=3;assert.throws(()=>validateSnapshot(s));
});
await test('welcome and confirmations freeze time; walking away does not satisfy the destination',()=>{
  const g=new Expedition(17,'intro');g.enableTutorial();g.startWave();const before=g.snapshot();g.tick(.05,{x:1});assert.deepEqual(g.snapshot(),before);assert.equal(g.castSkill('volley'),false);assert.equal(g.dash({x:1}),false);g.confirmTutorial();
  for(let i=0;i<30;i++)g.tick(.05,{x:-1});assert.equal(g.tutorial.awaiting,false);assert.equal(g.tutorial.step,'move');
  for(let i=0;i<80&&!g.tutorial.awaiting;i++)g.tick(.05,{x:1});assert.equal(g.tutorial.awaiting,true);const awaiting=g.snapshot();validateSnapshot(awaiting);const restored=Expedition.restore(awaiting);assert.equal(restored.tutorial.awaiting,true);
});
await test('support damage and an arrow launch do not complete the attack lesson',()=>{
  const g=game();walk(g);const e=g.enemies[0];g.hitEnemy(e,1);assert.equal(g.tutorial.attackHits,0);g.tutorial.elapsed=3;g.autoAttack();assert.equal(g.tutorial.attackHits,0);g.updateProjectiles(.2);assert.equal(g.tutorial.attackHits,1);const p={x:g.hero.x,y:g.hero.y};g.tick(.05,{x:1,y:1});assert.equal(g.hero.x,p.x);assert.equal(g.hero.y,p.y);attack(g);
});
await test('legacy tutorials keep their progression; corrupt strong-guide fields are rejected',()=>{
  const old=game();old.tutorial={step:'move',status:'active',moved:0,elapsed:0,reward:null};validateSnapshot(old.snapshot());for(let i=0;i<12;i++)old.tick(.05,{x:1});assert.equal(old.tutorial.step,'attack');
  for(const [key,value] of [['started','yes'],['awaiting',3],['attackHits',-1],['slot',9],['moveTarget',{x:Infinity,y:0}],['buildSpot',{x:-5,y:100}]]){const s=game().snapshot();s.tutorial[key]=value;assert.throws(()=>validateSnapshot(s),key);}
});
await test('mandatory first run cannot skip, sidestep, change equipment or unlock freedom before reward claim',async()=>{
  const g=game('volley','spear',true),before=g.snapshot();assert.equal(g.skipTutorial(),false);g.tick(.05,{x:-1,y:1});assert.equal(g.hero.x,before.hero.x);assert.equal(g.hero.y,before.hero.y);assert.equal(g.switchWeapon(),false);assert.equal(g.setDeck('hire'),false);assert.equal(g.dash({x:1}),false);walk(g);attack(g);build(g);
  const inventory={...g.inventory},position={x:g.hero.x,y:g.hero.y};g.tick(.05,{x:1,y:1});assert.equal(g.hero.x,position.x);assert.equal(g.hero.y,position.y);assert.equal(g.castSkill('volley'),false);assert.equal(g.placeCard(0,220,490).ok,false);assert.deepEqual(g.inventory,inventory);assert.equal(g.interactMapEvent(),false);assert.equal(g.skipTutorial(),false);assert.ok(g.spawnQueue.length<=2);
  for(let i=0;i<1400&&!g.tutorial.reward;i++)g.tick(.05);assert.ok(g.tutorial.reward,'scripted defense must finish without player freedom');assert.equal(g.hero.hp,g.hero.maxHp);assert.equal(g.base.hp,g.base.maxHp);
  const storage=new Memory(),store=new SaveStore(storage);await store.begin(g.snapshot());await assert.rejects(store.abandon());assert.equal(store.state.profile.tutorialDone,false);assert.equal(g.startWave(),false);assert.equal(g.claimTutorialReward(),true);await store.saveRun(g.snapshot());assert.equal(store.state.profile.tutorialDone,true);assert.equal(g.startWave(),true);assert.equal(g.dash({x:1}),true);
});
console.log(`\n${passed} tutorial scenarios passed.`);
