import assert from 'node:assert/strict';
import {Expedition,MAX_WAVES,STAGE_BALANCE,ENEMY_BALANCE,CARD_PRICES,FORTIFICATION_BALANCE} from '../engine.mjs';

let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}

test('eight-stage durability and damage curves rise without sudden reversals',()=>{
  assert.equal(STAGE_BALANCE.length,MAX_WAVES);
  for(let i=1;i<STAGE_BALANCE.length;i++){
    assert.ok(STAGE_BALANCE[i].hp>STAGE_BALANCE[i-1].hp);
    assert.ok(STAGE_BALANCE[i].damage>STAGE_BALANCE[i-1].damage);
    assert.ok(STAGE_BALANCE[i].speed>=STAGE_BALANCE[i-1].speed);
  }
});

test('boss solo time-to-kill targets early, middle and final skill checks',()=>{
  const spearDps=23/.44;
  const expected=[['matriarch',3,12,18],['charger',6,34,44],['boss',8,78,90]];
  for(const [type,stage,min,max] of expected){
    const seconds=ENEMY_BALANCE[type].hp*STAGE_BALANCE[stage-1].hp/spearDps;
    assert.ok(seconds>=min&&seconds<=max,`${type} solo TTK ${seconds.toFixed(1)}s`);
  }
});

test('run economy supports choices but cannot buy the entire catalogue',()=>{
  const total=STAGE_BALANCE.reduce((a,s)=>({wood:a.wood+s.wood,bone:a.bone+s.bone,amber:a.amber+s.amber}),{wood:0,bone:0,amber:0});
  assert.deepEqual(total,{wood:58,bone:35,amber:37});
  const active=['watchtower','catapult','wall','spring'];
  const catalogue=active.reduce((a,id)=>({wood:a.wood+CARD_PRICES[id].wood,bone:a.bone+CARD_PRICES[id].bone,amber:a.amber+CARD_PRICES[id].amber}),{wood:0,bone:0,amber:0});
  assert.ok(total.wood>catalogue.wood*2&&total.wood<catalogue.wood*4);
  assert.ok(total.bone>catalogue.bone*2&&total.bone<catalogue.bone*4);
});

test('persistent fortification tuning rewards survival without making buildings immortal',()=>{
  assert.ok(FORTIFICATION_BALANCE.incomingDamage>=.7&&FORTIFICATION_BALANCE.incomingDamage<=.85);
  assert.ok(FORTIFICATION_BALANCE.betweenStageRepair>=.3&&FORTIFICATION_BALANCE.betweenStageRepair<=.45);
});

test('spawned combat stats use the selected stage curve exactly',()=>{
  for(let stage=1;stage<=MAX_WAVES;stage++){
    const g=new Expedition(stage,`balance-stage-${stage}`);g.wave=stage;
    for(const type of ['raptor','brute','spitter']){
      const e=g.spawnEnemy(type,{x:50,y:50}),def=ENEMY_BALANCE[type],curve=STAGE_BALANCE[stage-1];
      assert.equal(e.maxHp,def.hp*curve.hp);assert.equal(e.damage,def.damage*curve.damage);assert.equal(e.speed,def.speed*curve.speed);
    }
  }
});

console.log(`\n${passed} balance guardrails passed.`);
