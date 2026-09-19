import assert from 'node:assert/strict';
import {Expedition} from '../engine.mjs';
import {buildCamp,campMerchantUnlocks,campWeaponUnlocked,claimCampTask,collectCampProduction,createExpedition,ensureCampProgress,hatchPlan,recordCampExpedition} from '../camp.mjs';
import {freshState,SaveStore} from '../save.mjs';

class Memory{constructor(){this.data=new Map();}getItem(key){return this.data.get(key)||null;}setItem(key,value){this.data.set(key,value);}}
let passed=0;async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}

await test('old camps gain bounded stock, production and repeatable task state',()=>{
  const camp={stones:8,buildings:[]};ensureCampProgress(camp);assert.deepEqual(camp.stockpile,{wood:0,bone:0,amber:0,warmth:0});assert.deepEqual(camp.production,{tent:0,forge:0,cache:0,nursery:0});assert.equal(camp.tasks.porter.goal,1);assert.equal(camp.tasks.hunter.goal,20);
});

await test('forge levels unlock bow, dual blades and hammer merchant plans in order',()=>{
  const state=freshState();assert.equal(campWeaponUnlocked(state.camp,'spear'),true);assert.equal(campWeaponUnlocked(state.camp,'bow'),false);assert.equal(campMerchantUnlocks(state.camp).includes('bow'),false);
  state.camp.stones=99;buildCamp(state,'forge',0);assert.equal(campWeaponUnlocked(state.camp,'bow'),true);assert.equal(campWeaponUnlocked(state.camp,'blades'),false);buildCamp(state,'forge',0);assert.equal(campWeaponUnlocked(state.camp,'blades'),true);buildCamp(state,'forge',0);assert.equal(campWeaponUnlocked(state.camp,'hammer'),true);assert.ok(['bow','blades','hammer'].every(id=>campMerchantUnlocks(state.camp).includes(id)));
});

await test('each built facility produces a distinct claimable resource from completed stages',()=>{
  const state=freshState();state.camp.buildings=[{type:'tent',slot:0,level:2},{type:'forge',slot:1,level:1},{type:'cache',slot:2,level:3},{type:'nursery',slot:3,level:2}];const run=new Expedition(1,'production');run.stats.waves=1;recordCampExpedition(state,run.snapshot());assert.deepEqual(state.camp.production,{tent:0,forge:0,cache:0,nursery:0});run.stats.waves=8;run.stats.kills=33;
  recordCampExpedition(state,run.snapshot());assert.deepEqual(state.camp.production,{tent:8,forge:2,cache:6,nursery:4});
  for(const type of ['tent','forge','cache','nursery'])assert.equal(collectCampProduction(state,type).ok,true);
  assert.deepEqual(state.camp.stockpile,{wood:8,bone:2,amber:6,warmth:4});assert.deepEqual(state.camp.production,{tent:0,forge:0,cache:0,nursery:0});assert.equal(state.camp.tasks.hunter.ready,true);
});

await test('claimed supplies load into one new expedition and are consumed atomically',async()=>{
  const memory=new Memory(),store=new SaveStore(memory);await store.mutate(state=>{state.camp.stockpile={wood:7,bone:5,amber:9,warmth:4};});const expedition=createExpedition(store.state,2,'supplied');
  assert.deepEqual(expedition.campSupplyBonus,{wood:7,bone:5,amber:9});assert.deepEqual(expedition.materials,{wood:15,bone:9});assert.equal(expedition.amber,25);await store.begin(expedition.snapshot());assert.deepEqual(store.state.camp.stockpile,{wood:0,bone:0,amber:0,warmth:4});assert.deepEqual(Expedition.restore(store.state.run).campSupplyBonus,{wood:7,bone:5,amber:9});
  const capped=freshState();capped.camp.buildings=[{type:'cache',slot:0,level:3}];capped.camp.stockpile.amber=999;const full=createExpedition(capped,3,'capped');assert.equal(full.amber,99);assert.equal(full.campSupplyBonus.amber,77);
});

await test('nursery level and produced warmth gate the two advanced partner eggs',()=>{
  const state=freshState();assert.equal(hatchPlan(state,'emberclaw').ok,true);assert.match(hatchPlan(state,'tideroot').reason,/溫室/);state.camp.buildings.push({type:'nursery',slot:0,level:1});state.camp.stockpile.warmth=3;assert.deepEqual(hatchPlan(state,'tideroot'),{ok:true,cost:3,nursery:1});assert.match(hatchPlan(state,'stoneback').reason,/2 級/);state.camp.buildings[0].level=2;state.camp.stockpile.warmth=5;assert.equal(hatchPlan(state,'stoneback').ok,true);
});

await test('moving residents issue repeatable build and hunt tasks with persistent rewards',()=>{
  const state=freshState();state.camp.stones=99;buildCamp(state,'tent',0);assert.equal(state.camp.tasks.porter.ready,true);const stones=state.camp.stones;assert.equal(claimCampTask(state,'porter').ok,true);assert.equal(state.camp.stones,stones+1);assert.equal(state.camp.stockpile.wood,3);assert.equal(state.camp.tasks.porter.ready,false);
  const run=new Expedition(3,'bounty');run.stats.waves=2;run.stats.kills=20;recordCampExpedition(state,run.snapshot());assert.equal(state.camp.tasks.hunter.ready,true);assert.equal(claimCampTask(state,'hunter').ok,true);assert.equal(state.camp.stockpile.bone,4);assert.equal(state.camp.tasks.hunter.goal,25);
});

await test('full storage preserves unclaimed production and failed first-stage hunts still count',()=>{
  const state=freshState();state.camp.buildings=[{type:'tent',slot:0,level:1}];state.camp.stockpile.wood=998;state.camp.production.tent=8;const claim=collectCampProduction(state,'tent');assert.equal(claim.amount,1);assert.equal(claim.remaining,7);assert.equal(state.camp.stockpile.wood,999);assert.equal(collectCampProduction(state,'tent').ok,false);
  const run=new Expedition(4,'first-stage-loss');run.stats.waves=0;run.stats.kills=20;recordCampExpedition(state,run.snapshot());assert.equal(state.camp.tasks.hunter.ready,true);
});

console.log(`\n${passed} persistent camp progression scenarios passed.`);
