import assert from 'node:assert/strict';
import { Expedition, MAX_WAVES, UPGRADES, seededRandom } from '../engine.mjs';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const tick = (g, seconds, input = {}) => { for(let t = 0; t < seconds; t += .02) g.tick(.02,input); };
const fresh = () => new Expedition(92721);
test('seeded worlds reproduce node layout',()=>{assert.deepEqual(fresh().nodes,fresh().nodes);assert.notDeepEqual(fresh().nodes,new Expedition(7).nodes);});
test('invalid / occupied / empty-inventory placement never consumes cards',()=>{
  const g=fresh(), before=g.amber;
  for(const [x,y] of [[0,0],[NaN,200],[Infinity,4],[360,385],[g.nodes[0].x,g.nodes[0].y]]) assert.equal(g.placeCard(0,x,y).ok,false);
  assert.equal(g.amber,before);assert.equal(g.buildings.length,0);
  const b=g.placeCard(0,240,420).building;assert.ok(b);const balance=g.amber;
  assert.equal(g.placeCard(1,240,420).ok,false);assert.equal(g.amber,balance);
  g.inventory.wall=0;assert.equal(g.placeCard(2,460,420).ok,false);assert.equal(g.inventory.wall,0);
});
test('one drag consumes one card, no second material charge or random refill',()=>{
  const g=fresh();assert.equal(g.placeCard(0,240,420).ok,true);assert.equal(g.amber,16);assert.equal(g.inventory.watchtower,1);
  assert.equal(g.placeCard(0,470,420).ok,false);assert.equal(g.inventory.watchtower,1);assert.equal(g.buildings.length,1);
  tick(g,1);assert.equal(g.hand[0],'watchtower');assert.equal(g.inventory.watchtower,1);
});
test('matching cards upgrade to level 3, refuse level 4 with no charge',()=>{
  const g=fresh();g.inventory.watchtower=5;const b=g.placeCard(0,240,420).building;
  for(let i=0;i<2;i++){g.cardTimers[0]=0;assert.equal(g.placeCard(0,240,420).ok,true);}
  assert.equal(b.level,3);assert.equal(b.hp,b.maxHp);const balance=g.amber;
  g.cardTimers[0]=0;assert.equal(g.placeCard(0,240,420).ok,false);assert.equal(g.amber,balance);
});
test('paused and completed simulation cannot consume cards, attack or advance',()=>{
  const g=fresh();g.paused=true;const state=JSON.stringify(g);tick(g,1,{attack:true,x:1});assert.equal(JSON.stringify(g),state);
  assert.equal(g.attack(),false);assert.equal(g.dash(),false);assert.equal(g.startWave(),false);assert.equal(g.placeCard(0,240,420).ok,false);
  g.paused=false;g.phase='win';assert.equal(g.attack(),false);assert.equal(g.dash(),false);assert.equal(g.placeCard(1,240,420).ok,false);
});
test('slow motion has a single clock and reduces wave advancement',()=>{
  const a=fresh(),b=fresh();a.startWave();b.startWave();b.building=true;tick(a,1);tick(b,1);
  assert.ok(Math.abs(b.time/a.time-.15)<.00001);assert.equal(a.realTime,b.realTime);
});
test('basic attacks automatically acquire the nearest enemy in weapon range',()=>{
  const g=fresh();g.phase='wave';g.wave=1;g.spawnQueue=[];g.spawnTimer=99;g.hero.x=250;g.hero.y=300;
  const near=g.spawnEnemy('brute',{x:390,y:300}),far=g.spawnEnemy('brute',{x:590,y:500});
  tick(g,.7);assert.ok(near.hp<near.maxHp);assert.equal(far.hp,far.maxHp);assert.ok(g.hero.attackCD>0);
  const miner=fresh(),node=miner.nodes[0];miner.hero.x=node.x-120;miner.hero.y=node.y;tick(miner,.7);assert.ok(node.hp<34,'nearby crystal should be harvested automatically outside combat');
});
test('two active skills have distinct effects and cannot bypass cooldowns',()=>{
  const volley=fresh();volley.phase='wave';volley.wave=1;volley.spawnQueue=[];volley.spawnTimer=99;volley.hero.x=250;volley.hero.y=300;volley.spawnEnemy('brute',{x:430,y:300});
  assert.equal(volley.castSkill('volley'),true);assert.equal(volley.projectiles.filter(p=>p.kind==='skill-bolt').length,5);assert.equal(volley.hero.volleyCD,7);assert.equal(volley.castSkill('volley'),false);
  const shock=fresh();shock.phase='wave';shock.wave=1;shock.spawnQueue=[];shock.spawnTimer=99;shock.hero.x=250;shock.hero.y=300;const e=shock.spawnEnemy('brute',{x:320,y:300}),hp=e.hp;
  assert.equal(shock.castSkill('shock'),true);assert.ok(e.hp<hp);assert.ok(e.slow>0);assert.ok(shock.hero.invulnerable>0);assert.equal(shock.hero.shockCD,11);assert.equal(shock.castSkill('shock'),false);
});
test('all eight stages use distinct rosters and introduce three named bosses',()=>{
  const signatures=[],bosses=[];
  for(let stage=1;stage<=MAX_WAVES;stage++){
    const g=fresh();g.wave=stage-1;g.stats.waves=stage-1;
    assert.equal(g.startWave(),true);signatures.push(g.spawnQueue.join(','));
    for(const type of ['matriarch','charger','boss'])if(g.spawnQueue.includes(type))bosses.push([stage,type]);
    const type=g.spawnQueue.shift(),e=g.spawnEnemy(type);assert.ok(e.x<=75||e.x>=645||e.y<=110||e.y>=710);
  }
  assert.equal(new Set(signatures).size,MAX_WAVES);assert.deepEqual(bosses,[[3,'matriarch'],[6,'charger'],[8,'boss']]);
});
test('boss phases and attacks trigger once with readable, distinct mechanics',()=>{
  const mother=fresh();mother.phase='wave';mother.wave=3;mother.spawnQueue=[];const m=mother.spawnEnemy('matriarch',{x:190,y:385});m.hp=m.maxHp*.5;mother.updateEnemy(m,.01);
  assert.equal(m.bossPhase,1);assert.equal(mother.enemies.filter(e=>e.type==='raptor').length,3);mother.updateEnemy(m,.01);assert.equal(mother.enemies.filter(e=>e.type==='raptor').length,3);
  m.cd=0;mother.hero.x=300;mother.hero.y=385;mother.updateEnemy(m,.01);assert.ok(m.windup>0);mother.updateEnemy(m,1);assert.equal(mother.projectiles.filter(p=>p.kind==='venom').length,3);
  const charge=fresh();charge.phase='wave';charge.wave=6;charge.spawnQueue=[];charge.hero.x=260;charge.hero.y=385;const c=charge.spawnEnemy('charger',{x:160,y:385});c.cd=0;charge.updateEnemy(c,.01);assert.ok(c.windup>0);const hp=charge.hero.hp;charge.updateEnemy(c,1.1);assert.ok(c.x>260);assert.ok(charge.hero.hp<hp);
  c.hp=c.maxHp*.4;charge.updateEnemy(c,.01);const speed=c.speed,damage=c.damage;charge.updateEnemy(c,.01);assert.equal(c.bossPhase,1);assert.equal(c.speed,speed);assert.equal(c.damage,damage);
});
test('axe harvest awards crystal resources exactly once',()=>{
  const g=fresh(),n=g.nodes[0];g.hero.x=n.x-40;g.hero.y=n.y;g.hero.weapon='axe';const balance=g.amber;
  g.attack(n);assert.ok(n.hp<=0);assert.equal(g.amber,balance+3);g.hitNode(n,100);assert.equal(g.amber,balance+3);
});
test('spear ignites passing a torch and burns an enemy',()=>{
  const g=fresh();g.nodes=[];g.hero.x=150;g.hero.y=250;g.hand[0]='torch';g.inventory.torch=1;g.placeCard(0,230,250);
  const e=g.spawnEnemy('brute',{x:330,y:250});g.attack(e);tick(g,.38);
  assert.ok(g.stats.combos>=1);assert.ok(e.hp<e.maxHp);assert.ok(e.burn>0);
});
test('dash destroys own bone wall, damages enemy and grants invulnerability',()=>{
  const g=fresh();g.nodes=[];g.hero.x=180;g.hero.y=280;g.hero.angle=0;const wall=g.placeCard(2,240,280).building;
  const e=g.spawnEnemy('brute',{x:265,y:280});g.dash({x:1,y:0});tick(g,.15);
  assert.ok(wall.hp<=0);assert.ok(e.hp<e.maxHp);assert.equal(g.stats.combos,1);assert.ok(g.hero.invulnerable>0);
  const hp=g.hero.hp;g.damageTarget(g.hero,30);assert.equal(g.hero.hp,hp);
});
test('spring heals and grants slowing dash burst',()=>{
  const g=fresh();g.nodes=[];g.hero.x=210;g.hero.y=260;g.placeCard(3,250,260);g.hero.hp=50;
  const e=g.spawnEnemy('brute',{x:280,y:280});tick(g,2.2);assert.ok(g.hero.hp>50);assert.ok(e.slow>0);
  g.dash({x:-1,y:0});assert.ok(e.hp<e.maxHp);assert.equal(g.stats.combos,1);
});
test('nest companion damages nearby enemies',()=>{const g=fresh();g.nodes=[];g.hand[2]='nest';g.inventory.nest=1;g.placeCard(2,240,260);const e=g.spawnEnemy('brute',{x:290,y:260});tick(g,1);assert.ok(e.hp<e.maxHp);});
test('initial offensive cards have distinct real combat roles',()=>{
  const g=fresh();g.nodes=[];assert.deepEqual(g.hand,['watchtower','catapult','wall','spring']);
  g.placeCard(0,210,340);g.placeCard(1,500,340);
  const near=g.spawnEnemy('brute',{x:320,y:330}),cluster=g.spawnEnemy('brute',{x:510,y:245}),clusterMate=g.spawnEnemy('raptor',{x:545,y:250});
  tick(g,2.8);
  assert.ok(near.hp<near.maxHp,'watchtower should fire bone bolts');
  assert.ok(cluster.hp<cluster.maxHp&&clusterMate.hp<clusterMate.maxHp,'catapult should damage a clustered group');
  assert.ok(cluster.slow>0||clusterMate.slow>0,'catapult impact should slow survivors');
});
test('telegraphed melee misses when hero moves away',()=>{
  const g=fresh();g.phase='wave';g.spawnQueue=['raptor'];g.spawnTimer=99;g.hero.x=200;g.hero.y=200;
  const e=g.spawnEnemy('raptor',{x:205,y:220});e.cd=0;g.tick(.02);assert.ok(e.windup>0);
  g.hero.x=500;g.hero.y=650;tick(g,.7);assert.equal(g.hero.hp,100);
});
test('watchtower bolts hit small targets in every direction from their actual launch point',()=>{
  for(const [x,y] of [[400,300],[120,300],[260,170],[260,450]]){
    const g=fresh();g.nodes=[];const placement=g.placeCard(0,260,300);assert.equal(placement.ok,true);placement.building.cd=0;const e=g.spawnEnemy('raptor',{x,y});
    g.updateBuildings(.01);
    for(let n=0;n<30;n++)g.updateProjectiles(.02);
    assert.ok(e.hp<e.maxHp,`bone bolt missed stationary target at ${x},${y}`);
  }
});
test('wave receipt reports actual gains, remaining drops and capacity without duplicate payout',()=>{
  const g=fresh();g.materials={wood:997,bone:999};g.amber=94;g.startWave();g.consumeEvents();g.drops=[{value:3}];g.finishWave();
  const receipt=g.consumeEvents().find(e=>e.type==='market-ready');
  assert.deepEqual({wood:receipt.wood,bone:receipt.bone,amber:receipt.amber},{wood:2,bone:0,amber:5});
  assert.equal(g.finishWave(),false);assert.equal(g.consumeEvents().length,0);
  const normal=fresh();normal.startWave();normal.drops=[{value:3}];normal.finishWave();
  assert.equal(normal.consumeEvents().find(e=>e.type==='market-ready').amber,6);
});
test('lethal enemy hit emits a dedicated death animation effect once',()=>{
  const g=fresh(),e=g.spawnEnemy('raptor',{x:240,y:280});
  g.hitEnemy(e,10000);g.hitEnemy(e,10000);
  const deaths=g.effects.filter(f=>f.kind==='enemy-death');
  assert.equal(deaths.length,1);assert.equal(deaths[0].type,'raptor');assert.equal(deaths[0].x,240);assert.equal(deaths[0].y,280);
});
test('wave reward grants tuned materials once and returns directly to preparation',()=>{
  const g=fresh();g.startWave();g.finishWave();assert.equal(g.phase,'prep');assert.deepEqual(g.choices,[]);assert.deepEqual(g.materials,{wood:13,bone:7});assert.equal(g.amber,19);
  const snapshot=g.snapshot();assert.equal(g.finishWave(),false);assert.deepEqual(g.snapshot(),snapshot);
});
test('surviving buildings keep identity, position and level while destroyed ones are removed',()=>{
  const g=fresh();g.nodes=[];const survivor=g.placeCard(0,220,320).building;g.inventory.watchtower=1;g.cardTimers[0]=0;g.placeCard(0,220,320);
  const doomed=g.placeCard(1,500,320).building;survivor.hp=40;doomed.hp=0;const before={id:survivor.id,x:survivor.x,y:survivor.y,level:survivor.level};
  g.startWave();g.consumeEvents();g.finishWave();
  assert.equal(g.buildings.length,1);assert.deepEqual({id:g.buildings[0].id,x:g.buildings[0].x,y:g.buildings[0].y,level:g.buildings[0].level},before);
  assert.equal(g.buildings[0].hp,40+g.buildings[0].maxHp*.35);
  const receipt=g.consumeEvents().find(e=>e.type==='market-ready');assert.equal(receipt.survivors,1);assert.equal(receipt.repair,35);
});
test('placed buildings receive fortification damage reduction',()=>{
  const g=fresh();g.nodes=[];const building=g.placeCard(0,220,320).building,before=building.hp;g.damageTarget(building,100);assert.equal(building.hp,before-78);
});
test('all 12 upgrades have a working effect and legal bounds',()=>{
  for(const u of UPGRADES){const g=fresh();g.hero.hp=50;g.base.hp=90;g.materials.bone=99;g.amber=99;const before=JSON.stringify([g.mods,g.hero,g.base]);assert.equal(g.buy(`skill-${u.id}`).ok,true);assert.notEqual(JSON.stringify([g.mods,g.hero,g.base]),before);assert.ok(g.hero.hp<=g.hero.maxHp);assert.ok(g.base.hp<=g.base.maxHp);const mods=JSON.stringify(g.mods);assert.equal(g.buy(`skill-${u.id}`).ok,false);assert.equal(JSON.stringify(g.mods),mods);}
});
test('merchant discounts never create free or negative-cost building cards',()=>{const g=fresh();g.mods.discount=99;for(const type of g.hand)assert.equal(g.price(type).wood,1);});
test('defeat fires once and prevents further play',()=>{
  const g=fresh();g.damageTarget(g.base,1000);g.damageTarget(g.base,1000);assert.equal(g.phase,'lose');assert.equal(g.consumeEvents().filter(e=>e.type==='end').length,1);assert.equal(g.startWave(),false);assert.equal(g.attack(),false);
});
test('complete eight-stage state machine, including every boss and win',()=>{
  const g=fresh(),seen=new Set();
  for(let wave=1;wave<=MAX_WAVES;wave++){
    assert.equal(g.startWave(),true);assert.equal(g.startWave(),false);
    for(let i=0;i<2500&&g.phase==='wave';i++){
      g.tick(.05);
      for(const e of g.enemies){if(['matriarch','charger','boss'].includes(e.type))seen.add(e.type);g.hitEnemy(e,10000);}
    }
    assert.equal(g.stats.waves,wave);
    if(wave<MAX_WAVES)assert.equal(g.phase,'prep');else assert.equal(g.phase,'win');
  }
  assert.deepEqual([...seen].sort(),['boss','charger','matriarch']);assert.equal(g.startWave(),false);const time=g.time;tick(g,2);assert.equal(g.time,time);
});
test('bounded timestep, malformed dt and movement cannot escape world',()=>{
  const g=fresh();g.tick(NaN);g.tick(-1);assert.equal(g.time,0);g.tick(1000,{x:1,y:1});assert.equal(g.time,.05);tick(g,20,{x:-1,y:-1});assert.ok(g.hero.x>=43&&g.hero.y>=70);
});
console.log(`\n${passed} engine scenarios passed.`);
