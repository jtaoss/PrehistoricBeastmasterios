import assert from 'node:assert/strict';
import { Expedition, MAX_WAVES, STAGE_OBJECTIVES, UPGRADES, seededRandom, distance } from '../engine.mjs';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const tick = (g, seconds, input = {}) => { for(let t = 0; t < seconds; t += .02) g.tick(.02,input); };
const fresh = () => new Expedition(92721);
function resolveObjective(g){
  const o=g.objective;if(!o)return;
  if(o.type==='escort')o.npc.reached=true;
  else if(o.type==='destroy')for(const target of o.targets)g.hitObjective(target,10000);
  else if(o.type==='mining')for(const node of g.nodes.filter(node=>o.nodeIds.includes(node.id)))g.hitNode(node,10000);
  else if(o.type==='rescue'){o.progress=o.required;o.rescued=true;}
}
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
test('merchant-bought active skill growth expands volley and leaves a persistent shock field',()=>{
  const volley=fresh();volley.materials={wood:99,bone:99};volley.amber=99;
  assert.equal(volley.buy('skill-volley-pierce').ok,false);assert.match(volley.purchasePlan('skill-volley-pierce').reason,/前一階/);
  assert.equal(volley.buy('skill-volley-fan').ok,true);volley.phase='wave';volley.wave=1;volley.spawnQueue=[];volley.spawnEnemy('brute',{x:500,y:300});assert.equal(volley.castSkill('volley'),true);assert.equal(volley.projectiles.filter(p=>p.kind==='skill-bolt').length,7);
  const full=fresh();full.materials={wood:99,bone:99};full.amber=99;full.buy('skill-volley-fan');full.buy('skill-volley-pierce');full.phase='wave';full.wave=1;full.spawnQueue=[];full.spawnEnemy('brute',{x:500,y:300});full.castSkill('volley');assert.equal(full.projectiles.filter(p=>p.kind==='skill-bolt').length,9);assert.ok(full.projectiles.filter(p=>p.kind==='skill-bolt').every(p=>p.pierce===3));
  const shock=fresh();shock.materials={wood:99,bone:99};shock.amber=99;shock.buy('skill-shock-field');shock.buy('skill-shock-resonance');shock.phase='wave';shock.wave=1;shock.spawnQueue=[];const e=shock.spawnEnemy('brute',{x:320,y:300});shock.hero.x=250;shock.hero.y=300;assert.equal(shock.castSkill('shock'),true);const field=shock.projectiles.find(p=>p.kind==='shock-field');assert.equal(field.life,6);assert.equal(field.radius,170);e.slow=0;const hp=e.hp;shock.updateProjectiles(1);assert.ok(e.slow>0);assert.equal(e.hp,hp-12);const restored=Expedition.restore(shock.snapshot());assert.equal(restored.projectiles.find(p=>p.kind==='shock-field').radius,170);
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
test('all eight stages expose the intended objective sequence',()=>{
  assert.deepEqual(STAGE_OBJECTIVES.map(o=>o.type),['defend','escort','destroy','mining','rescue','defend','strongholds','defend']);
  for(let stage=1;stage<=MAX_WAVES;stage++){const g=fresh();g.wave=stage-1;g.stats.waves=stage-1;g.startWave();assert.equal(g.objective.type,STAGE_OBJECTIVES[stage-1].type);assert.equal(g.objectiveStatus().title,STAGE_OBJECTIVES[stage-1].title);}
});
test('each seeded expedition schedules all five map events on distinct stages',()=>{
  const a=fresh(),b=fresh(),different=new Expedition(7);
  assert.deepEqual(a.eventPlan,b.eventPlan);assert.notDeepEqual(a.eventPlan,different.eventPlan);
  assert.deepEqual(a.eventPlan.map(event=>event.type).sort(),['chest','elite','hunter','merchant','ruin']);
  assert.equal(new Set(a.eventPlan.map(event=>event.stage)).size,5);assert.ok(a.eventPlan.every(event=>event.stage>=1&&event.stage<=7&&event.status==='pending'));
});
test('merchant, ruin, hunter and chest events grant distinct one-time outcomes',()=>{
  const prepare=(type,variant=0)=>{const g=fresh(),event=g.eventPlan.find(entry=>entry.type===type);g.phase='wave';g.wave=event.stage;g.spawnQueue=['raptor'];event.status='active';event.variant=variant;event.x=320;event.y=340;g.hero.x=320;g.hero.y=340;return{g,event};};
  let state=prepare('merchant');state.g.hero.hp=50;assert.equal(state.g.interactMapEvent(state.event.id),true);assert.deepEqual({amber:state.g.amber,wood:state.g.materials.wood,bone:state.g.materials.bone,hp:state.g.hero.hp,status:state.event.status},{amber:10,wood:11,bone:6,hp:70,status:'completed'});assert.equal(state.g.interactMapEvent(state.event.id),false);
  state=prepare('chest',1);assert.equal(state.g.interactMapEvent(),true);assert.deepEqual({amber:state.g.amber,wood:state.g.materials.wood,bone:state.g.materials.bone},{amber:23,wood:10,bone:7});
  state=prepare('hunter');assert.equal(state.g.interactMapEvent(),true);assert.ok(state.g.allies.some(ally=>ally.type==='hunter'&&ally.eventRescue));
  state=prepare('ruin',0);const maxHp=state.g.hero.maxHp;assert.equal(state.g.interactMapEvent(),true);assert.equal(state.g.hero.maxHp,maxHp+15);
  state=prepare('ruin',1);const spear=state.g.mods.spear;state.g.interactMapEvent();assert.equal(state.g.mods.spear,spear+.1);
  state=prepare('ruin',2);state.g.interactMapEvent();assert.deepEqual(state.g.materials,{wood:12,bone:7});
});
test('elite map event preserves combat RNG and pays its bounty only after the pack falls',()=>{
  const g=fresh(),event=g.eventPlan.find(entry=>entry.type==='elite');g.phase='wave';g.wave=event.stage;g.setupObjective();const rngState=g.rng.getState();g.activateMapEvent();assert.equal(g.rng.getState(),rngState);assert.equal(event.status,'active');
  const elites=g.enemies.filter(enemy=>enemy.eliteEventId===event.id);assert.equal(elites.length,3);assert.ok(elites.every(enemy=>enemy.elite&&enemy.hp===enemy.maxHp));const before={amber:g.amber,bone:g.materials.bone};
  for(const enemy of elites)g.hitEnemy(enemy,100000);g.enemies=g.enemies.filter(enemy=>enemy.hp>0);g.updateMapEvents();assert.equal(event.status,'completed');assert.deepEqual({amber:g.amber,bone:g.materials.bone},{amber:before.amber+12,bone:before.bone+2});g.updateMapEvents();assert.deepEqual({amber:g.amber,bone:g.materials.bone},{amber:before.amber+12,bone:before.bone+2});
});
test('escort moves only with the hero nearby and losing the NPC fails the stage',()=>{
  const g=fresh();g.wave=1;g.stats.waves=1;g.startWave();g.spawnQueue=['raptor'];g.spawnTimer=99;const npc=g.objective.npc,start={x:npc.x,y:npc.y};tick(g,.4);assert.deepEqual({x:npc.x,y:npc.y},start);
  g.hero.x=npc.x;g.hero.y=npc.y;tick(g,.5);assert.ok(distance(npc,start)>1);g.damageTarget(npc,10000);assert.equal(g.phase,'lose');assert.match(g.consumeEvents().find(e=>e.type==='end').reason,/採集師/);
});
test('destroying all hostile nests is required before an empty stage can finish',()=>{
  const g=fresh();g.wave=2;g.stats.waves=2;g.startWave();g.spawnQueue=[];g.enemies=[];tick(g,.1);assert.equal(g.phase,'wave');assert.equal(g.objectiveStatus().text,'已摧毀 0 / 3');
  resolveObjective(g);assert.equal(g.objectiveReady(),true);tick(g,.1);assert.equal(g.phase,'prep');assert.equal(g.stats.waves,3);
});
test('timed mining counts each marked crystal once and timeout is a real failure',()=>{
  const g=fresh();g.wave=3;g.stats.waves=3;g.startWave();g.spawnQueue=['raptor'];g.spawnTimer=99;const nodes=g.nodes.filter(n=>n.objectiveKind==='ore');g.hitNode(nodes[0],10000);g.hitNode(nodes[0],10000);assert.equal(g.objective.mined,1);for(const n of nodes.slice(1))g.hitNode(n,10000);assert.equal(g.objectiveReady(),true);
  const late=fresh();late.wave=3;late.stats.waves=3;late.startWave();late.objective.timeLeft=.01;late.tick(.02);assert.equal(late.phase,'lose');assert.match(late.consumeEvents().find(e=>e.type==='end').reason,/採礦/);
});
test('rescue requires a safe four-second hold and adds the captive archer',()=>{
  const g=fresh();g.wave=4;g.stats.waves=4;g.startWave();g.spawnQueue=['raptor'];g.spawnTimer=99;const o=g.objective;g.hero.x=o.captive.x;g.hero.y=o.captive.y;tick(g,4.2);assert.equal(o.rescued,true);assert.ok(g.allies.some(a=>a.type==='hunter'&&a.rescued));
});
test('enemies can target separate strongholds and losing any point fails',()=>{
  const g=fresh();g.wave=6;g.stats.waves=6;g.startWave();g.spawnQueue=[];const point=g.objective.points[0],e=g.spawnEnemy('raptor',{x:point.x+20,y:point.y});e.cd=0;g.updateEnemy(e,.01);assert.equal(e.targetId,point.id);g.damageTarget(point,10000);assert.equal(g.phase,'lose');assert.match(g.consumeEvents().find(event=>event.type==='end').reason,/據點/);
});
test('each boss has two phase changes, summoned adds and a destructible weakness',()=>{
  const mother=fresh();mother.phase='wave';mother.wave=3;mother.spawnQueue=[];const m=mother.spawnEnemy('matriarch',{x:190,y:385});m.hp=m.maxHp*.69;mother.updateEnemy(m,.01);
  assert.equal(m.bossPhase,1);assert.deepEqual(mother.enemies.slice(1).map(e=>e.type),['raptor','raptor','spitter']);assert.equal(m.weakpoint.open,true);
  const motherHp=m.hp;mother.hitBossWeakpoint(m.weakpoint,10000);assert.equal(m.weakpoint.broken,true);assert.ok(m.hp<motherHp);const beforeSuppressed=mother.enemies.length;m.hp=m.maxHp*.34;mother.updateEnemy(m,.01);assert.equal(m.bossPhase,2);assert.equal(mother.enemies.length,beforeSuppressed,'broken brood core should stop the final summon');

  const charge=fresh();charge.phase='wave';charge.wave=6;charge.spawnQueue=[];charge.hero.x=260;charge.hero.y=385;const c=charge.spawnEnemy('charger',{x:160,y:385});c.hp=c.maxHp*.67;charge.updateEnemy(c,.01);assert.equal(c.bossPhase,1);assert.equal(charge.enemies.length,3);c.cd=0;charge.updateEnemy(c,.01);assert.equal(c.attackKind,'bone-charge');const heroHp=charge.hero.hp;charge.updateEnemy(c,1.1);assert.ok(c.x>260);assert.ok(charge.hero.hp<heroHp);assert.equal(c.weakpoint.open,true);const damage=c.damage,speed=c.speed;charge.hitBossWeakpoint(c.weakpoint,10000);assert.ok(c.damage<damage&&c.speed<speed);c.hp=c.maxHp*.31;charge.updateEnemy(c,.01);assert.equal(c.bossPhase,2);assert.equal(charge.enemies.length,6);

  const titan=fresh();titan.phase='wave';titan.wave=8;titan.spawnQueue=[];titan.hero.x=355;titan.hero.y=360;const b=titan.spawnEnemy('boss',{x:355,y:245});b.cd=0;titan.updateEnemy(b,.01);assert.equal(b.attackKind,'titan-slam');assert.ok(b.windup>0&&b.weakpoint.open);const titanHp=b.hp;titan.hitBossWeakpoint(b.weakpoint,10000);assert.equal(b.windup,0);assert.ok(b.hp<titanHp);b.hp=b.maxHp*.69;titan.updateEnemy(b,.01);assert.equal(b.bossPhase,1);assert.equal(titan.enemies.length,4);b.hp=b.maxHp*.34;titan.updateEnemy(b,.01);assert.equal(b.bossPhase,2);assert.equal(titan.enemies.length,7);
});
test('boss area attacks expose distinct warning kinds and phase-three patterns',()=>{
  const mother=fresh();mother.phase='wave';mother.wave=3;mother.spawnQueue=[];mother.hero.x=300;mother.hero.y=385;const m=mother.spawnEnemy('matriarch',{x:190,y:385});m.bossPhase=1;m.attackCount=1;m.cd=0;mother.updateEnemy(m,.01);assert.equal(m.attackKind,'brood-pool');assert.equal(m.windup,1.25);const hp=mother.hero.hp;mother.updateEnemy(m,1.3);assert.ok(mother.hero.hp<hp);
  const titan=fresh();titan.phase='wave';titan.wave=8;titan.spawnQueue=[];titan.hero.x=490;titan.hero.y=385;const b=titan.spawnEnemy('boss',{x:360,y:385});b.bossPhase=2;b.cd=0;titan.updateEnemy(b,.01);assert.equal(b.attackKind,'titan-double');assert.equal(b.windup,1.3);titan.hero.x=640;const before=titan.hero.hp;titan.updateEnemy(b,1.4);assert.ok(titan.hero.hp<before,'outer warning ring should deal reduced aftershock damage');
});
test('automatic weapon fire prioritizes an exposed boss weakpoint',()=>{
  const g=fresh();g.nodes=[];g.phase='wave';g.wave=3;g.spawnQueue=['raptor'];g.spawnTimer=99;g.hero.x=200;g.hero.y=300;const boss=g.spawnEnemy('matriarch',{x:400,y:300});g.openBossWeakpoint(boss,5);const before=boss.weakpoint.hp;assert.equal(g.autoAttack(),true);for(let i=0;i<30;i++)g.updateProjectiles(.02);assert.ok(boss.weakpoint.hp<before);assert.equal(boss.hp,boss.maxHp);
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
test('all merchant upgrades have a working effect and legal bounds',()=>{
  for(const u of UPGRADES){const g=fresh();g.hero.hp=50;g.base.hp=90;g.materials.bone=99;g.amber=99;if(u.requires)assert.equal(g.buy(`skill-${u.requires}`).ok,true);const before=JSON.stringify([g.mods,g.hero,g.base]);assert.equal(g.buy(`skill-${u.id}`).ok,true);assert.notEqual(JSON.stringify([g.mods,g.hero,g.base]),before);assert.ok(g.hero.hp<=g.hero.maxHp);assert.ok(g.base.hp<=g.base.maxHp);const mods=JSON.stringify(g.mods);assert.equal(g.buy(`skill-${u.id}`).ok,false);assert.equal(JSON.stringify(g.mods),mods);}
});
test('merchant discounts never create free or negative-cost building cards',()=>{const g=fresh();g.mods.discount=99;for(const type of g.hand)assert.equal(g.price(type).wood,1);});
test('defeat fires once and prevents further play',()=>{
  const g=fresh();g.damageTarget(g.base,1000);g.damageTarget(g.base,1000);assert.equal(g.phase,'lose');assert.equal(g.consumeEvents().filter(e=>e.type==='end').length,1);assert.equal(g.startWave(),false);assert.equal(g.attack(),false);
});
test('complete eight-stage state machine, including every boss and win',()=>{
  const g=fresh(),seen=new Set();
  for(let wave=1;wave<=MAX_WAVES;wave++){
    assert.equal(g.startWave(),true);assert.equal(g.startWave(),false);
    resolveObjective(g);
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
