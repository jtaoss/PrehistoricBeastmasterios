import assert from 'node:assert/strict';
import { Expedition, validateSnapshot } from '../engine.mjs';
import { SaveStore, freshState, encode, decode, SAVE_KEY, BACKUP_KEY, LEGACY_KEY, PROGRESS_KEYS } from '../save.mjs';
import { buildCamp, moveCamp, createExpedition } from '../camp.mjs';
class Memory {
  constructor(){this.data=new Map();this.fail=false;}
  getItem(k){return this.data.get(k)||null;}
  setItem(k,v){if(this.fail)throw new Error('Quota exceeded');this.data.set(k,v);}
  removeItem(k){if(this.fail)throw new Error('Storage denied');this.data.delete(k);}
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
const game=()=>new Expedition(92721,'test-run-1');
const tick=(g,n,input={})=>{for(let i=0;i<n;i++)g.tick(.02,input);};
await test('combat snapshot restores all mechanics and RNG without stale events/input',()=>{
  const a=game();a.placeCard(0,240,420);a.placeCard(1,480,420);a.startWave();tick(a,120,{attack:true});a.building=true;
  const snapshot=a.snapshot(),b=Expedition.restore(snapshot);
  assert.deepEqual(b.snapshot(),snapshot);assert.equal(b.paused,true);assert.equal(b.building,false);assert.deepEqual(b.events,[]);
  a.building=false;b.paused=false;tick(a,90,{attack:true,x:.3});tick(b,90,{attack:true,x:.3});assert.deepEqual(b.snapshot(),a.snapshot());
});
await test('material reward restores without awarding twice or offering random choices',()=>{
  const a=game();a.wave=2;a.phase='wave';a.finishWave();const balance=a.amber,materials={...a.materials};const b=Expedition.restore(a.snapshot());
  assert.equal(b.phase,'prep');assert.deepEqual(b.choices,[]);assert.equal(b.amber,balance);assert.deepEqual(b.materials,materials);assert.equal(b.finishWave(),false);assert.deepEqual(b.materials,materials);
});
await test('card cooldown, dash, telegraph and projectile hits survive serialization',()=>{
  const a=game();a.placeCard(0,240,420);a.startWave();const e=a.spawnEnemy('brute',{x:365,y:495});e.cd=0;a.tick(.02);a.dash({x:1,y:0});a.hero.volleyCD=7;a.hero.shockCD=9;
  const b=Expedition.restore(a.snapshot());assert.deepEqual(b.cardTimers,a.cardTimers);assert.equal(b.hero.dashTime,a.hero.dashTime);assert.equal(b.hero.volleyCD,7);assert.equal(b.hero.shockCD,9);assert.deepEqual(b.enemies,a.enemies);
});
await test('active special objective state survives save and restore exactly',()=>{
  const a=game();a.wave=1;a.stats.waves=1;a.startWave();a.spawnQueue=['raptor'];a.spawnTimer=99;a.hero.x=a.objective.npc.x;a.hero.y=a.objective.npc.y;tick(a,35);
  const snapshot=a.snapshot(),b=Expedition.restore(snapshot);assert.deepEqual(b.objective,snapshot.objective);assert.equal(b.objective.type,'escort');assert.ok(b.objective.npc.waypoint>=1);assert.deepEqual(b.snapshot(),snapshot);
});
await test('random map event schedule and claimed rewards survive save without rerolling',()=>{
  const a=game(),chest=a.eventPlan.find(event=>event.type==='chest');a.phase='wave';a.wave=chest.stage;a.spawnQueue=['raptor'];a.setupObjective();chest.status='active';chest.x=300;chest.y=300;a.hero.x=300;a.hero.y=300;const before={...a.materials,amber:a.amber};assert.equal(a.interactMapEvent(),true);
  const snapshot=a.snapshot(),b=Expedition.restore(snapshot),restored=b.eventPlan.find(event=>event.id===chest.id);assert.deepEqual(b.snapshot(),snapshot);assert.equal(restored.status,'completed');assert.notDeepEqual({wood:b.materials.wood,bone:b.materials.bone,amber:b.amber},before);assert.equal(b.interactMapEvent(restored.id),false);assert.deepEqual(b.snapshot(),snapshot);
});
await test('boss phase, warning and destructible weakpoint survive save exactly',()=>{
  const a=game();a.wave=7;a.stats.waves=7;a.startWave();a.spawnQueue=[];const boss=a.spawnEnemy('boss',{x:355,y:245});boss.hp=boss.maxHp*.69;a.updateEnemy(boss,.01);boss.cd=0;a.hero.x=355;a.hero.y=370;a.updateEnemy(boss,.01);assert.ok(boss.windup>0&&boss.weakpoint.open);
  const snapshot=a.snapshot(),b=Expedition.restore(snapshot);assert.deepEqual(b.snapshot(),snapshot);assert.equal(b.enemies[0].bossPhase,1);assert.equal(b.enemies[0].weakpoint.name,'琥珀核心');assert.equal(b.enemies[0].attackKind,'titan-slam');
});
await test('reject malformed entity/type/phase/ID/hand snapshots',()=>{
  for(const edit of [s=>s.hero.hp=null,s=>s.hero.weapon='unknown',s=>s.hero.volleyCD='bad',s=>s.rngState=-1,s=>s.hand[0]='bad',s=>s.inventory.torch=-1,s=>s.materials.bone=NaN,s=>s.phase='invalid',s=>s.nextId=1,s=>s.nodes[1].id=s.nodes[0].id]){const s=game().snapshot();edit(s);assert.throws(()=>Expedition.restore(s));}
});
await test('pre-skill combat saves restore with ready active skills',()=>{const s=game().snapshot();delete s.hero.volleyCD;delete s.hero.shockCD;validateSnapshot(s);const g=Expedition.restore(s);assert.equal(g.hero.volleyCD,0);assert.equal(g.hero.shockCD,0);});
await test('older fortifications migrate to new durability while preserving damage ratio',()=>{
  const original=game();original.nodes=[];const building=original.placeCard(0,240,420).building,s=original.snapshot();s.buildings[0].maxHp=160;s.buildings[0].hp=80;
  const restored=Expedition.restore(s);assert.equal(restored.buildings[0].maxHp,180);assert.equal(restored.buildings[0].hp,90);assert.equal(restored.buildings[0].id,building.id);
});
await test('legacy summary migrates non-destructively and initial camp resource given only once',async()=>{
  const m=new Memory();m.setItem(LEGACY_KEY,JSON.stringify({runs:7,best:4,victories:2}));const a=new SaveStore(m);
  assert.deepEqual({runs:a.state.profile.runs,best:a.state.profile.best,victories:a.state.profile.victories},{runs:7,best:4,victories:2});assert.equal(a.state.profile.companions.selected,null);assert.equal(a.state.camp.stones,8);
  await a.mutate(s=>buildCamp(s,'tent',0));const b=new SaveStore(m);assert.equal(b.state.camp.stones,5);assert.equal(b.state.profile.runs,7);assert.ok(m.getItem(LEGACY_KEY));
});
await test('camp construction, upgrades, move and failed placement use correct resources',()=>{
  const s=freshState();buildCamp(s,'tent',0);assert.equal(s.camp.stones,5);assert.throws(()=>buildCamp(s,'tent',1));assert.equal(s.camp.stones,5);
  buildCamp(s,'tent',0);assert.equal(s.camp.buildings[0].level,2);assert.equal(s.camp.stones,0);assert.throws(()=>buildCamp(s,'forge',0));assert.throws(()=>buildCamp(s,'cache',1));
  moveCamp(s,0,4);assert.equal(s.camp.buildings[0].slot,4);assert.equal(s.camp.stones,0);assert.equal(moveCamp(s,4,4),false);
});
await test('camp level cap and occupied relocation cannot silently charge',()=>{
  const s=freshState();s.camp.stones=100;for(let i=0;i<3;i++)buildCamp(s,'forge',0);const stones=s.camp.stones;assert.throws(()=>buildCamp(s,'forge',0));assert.equal(s.camp.stones,stones);buildCamp(s,'cache',1);assert.throws(()=>moveCamp(s,0,1));
});
await test('camp bonuses apply once on new expedition, never double on restore',()=>{
  const s=freshState();s.camp.stones=99;for(const [i,type] of ['tent','forge','cache','nursery'].entries())buildCamp(s,type,i);
  const a=createExpedition(s,1,'bonus-run');assert.equal(a.hero.maxHp,110);for(const weapon of ['spear','axe','bow','blades','hammer'])assert.equal(a.mods[weapon],1.05);assert.equal(a.amber,18);assert.equal(a.base.maxHp,235);
  const b=Expedition.restore(a.snapshot());assert.equal(b.hero.maxHp,110);assert.equal(b.mods.spear,1.05);assert.equal(b.amber,18);assert.equal(b.base.maxHp,235);
});
await test('camp changes during suspended run do not rewrite its hero or inventory',async()=>{
  const m=new Memory(),s=new SaveStore(m),g=game();await s.begin(g.snapshot());await s.mutate(x=>buildCamp(x,'tent',0));assert.equal(s.state.run.hero.maxHp,100);assert.equal(createExpedition(s.state,3,'next-run').hero.maxHp,110);
});
await test('completed run reward and clear commit atomically, settlement idempotent after reload',async()=>{
  const m=new Memory(),s=new SaveStore(m),g=game();await s.begin(g.snapshot());g.wave=6;g.phase='win';g.stats.waves=6;g.stats.kills=94;g.stats.harvested=4;g.materials={wood:57,bone:31};g.amber=46;
  const result=await s.complete(g.snapshot());assert.equal(s.state.camp.stones,28);assert.equal(s.state.run,null);assert.equal(s.state.profile.victories,1);assert.deepEqual(result.loot,{wood:57,bone:31,amber:46,harvested:4});
  const reloaded=new SaveStore(m);await reloaded.complete(g.snapshot());assert.equal(reloaded.state.camp.stones,28);assert.equal(reloaded.state.profile.victories,1);
});
await test('new eight-stage victory grants the expanded clear reward',async()=>{
  const m=new Memory(),s=new SaveStore(m),g=new Expedition(8,'eight-stage-win');await s.begin(g.snapshot());g.wave=8;g.phase='win';g.stats.waves=8;
  const result=await s.complete(g.snapshot());assert.equal(result.stones,24);assert.equal(s.state.camp.stones,32);assert.equal(s.state.profile.best,8);assert.equal(s.state.profile.victories,1);
});
await test('loss keeps camp and grants only completed-wave resources; abandon grants none',async()=>{
  const m=new Memory(),s=new SaveStore(m),g=game();await s.mutate(x=>buildCamp(x,'tent',0));await s.begin(g.snapshot());g.wave=3;g.stats.waves=2;g.phase='lose';g.hero.hp=0;await s.complete(g.snapshot());assert.equal(s.state.camp.stones,9);assert.equal(s.state.camp.buildings.length,1);
  const b=new Expedition(2,'second-run');await s.begin(b.snapshot());await s.abandon();assert.equal(s.state.camp.stones,9);assert.equal(s.state.run,null);
});
await test('explicit save deletion clears only progress and preserves account login and preferences',async()=>{
  const m=new Memory(),s=new SaveStore(m);m.setItem('emberwild_account_session_v1','{"version":1,"label":"蕨林獵人","signedInAt":1}');m.setItem('emberwild_experience_v1','{"volume":0.35}');
  await s.mutate(x=>buildCamp(x,'tent',0));m.setItem(LEGACY_KEY,'{"runs":9}');await s.clearProgress();
  assert.ok(PROGRESS_KEYS.every(key=>m.getItem(key)===null));assert.equal(m.getItem('emberwild_account_session_v1'),'{\"version\":1,\"label\":\"蕨林獵人\",\"signedInAt\":1}');assert.equal(m.getItem('emberwild_experience_v1'),'{"volume":0.35}');
  assert.equal(s.state.profile.runs,0);assert.equal(s.state.profile.tutorialDone,false);assert.equal(s.state.camp.stones,8);assert.equal(s.raw,null);
});
await test('new run cannot silently overwrite active run',async()=>{const s=new SaveStore(new Memory());await s.begin(game().snapshot());await assert.rejects(s.begin(new Expedition(2,'other-run').snapshot()));assert.equal(s.state.profile.runs,1);});
await test('failed quota write leaves in-memory camp and primary untouched',async()=>{
  const m=new Memory(),s=new SaveStore(m);await s.mutate(()=>{});const raw=m.getItem(SAVE_KEY);m.fail=true;
  await assert.rejects(s.mutate(x=>buildCamp(x,'tent',0)));assert.equal(s.state.camp.stones,8);assert.equal(s.state.camp.buildings.length,0);assert.equal(m.getItem(SAVE_KEY),raw);
});
await test('failed settlement remains resumable and retry rewards once',async()=>{
  const m=new Memory(),s=new SaveStore(m),g=game();await s.begin(g.snapshot());g.phase='lose';g.wave=2;g.stats.waves=1;g.hero.hp=0;m.fail=true;await assert.rejects(s.complete(g.snapshot()));assert.ok(s.state.run);assert.equal(s.state.camp.stones,8);m.fail=false;await s.complete(g.snapshot());assert.equal(s.state.camp.stones,10);
});
await test('corrupt primary recovers last validated backup without deleting it',async()=>{
  const m=new Memory(),s=new SaveStore(m);await s.mutate(x=>buildCamp(x,'tent',0));await s.mutate(x=>moveCamp(x,0,2));m.setItem(SAVE_KEY,'truncated');const r=new SaveStore(m);assert.equal(r.blocked,false);assert.match(r.warning,/備份/);assert.equal(r.state.camp.buildings[0].slot,0);await r.mutate(x=>moveCamp(x,0,3));assert.equal(new SaveStore(m).state.camp.buildings[0].slot,3);
});
await test('invalid or newer-version save blocks writes and preserves raw data',async()=>{
  for(const raw of ['broken',JSON.stringify({version:99})]){const m=new Memory();m.setItem(SAVE_KEY,raw);const s=new SaveStore(m);assert.equal(s.blocked,true);await assert.rejects(s.mutate(()=>{}));assert.equal(m.getItem(SAVE_KEY),raw);}
});
await test('export/import validates checksum and retains current progress on failure',async()=>{
  const m=new Memory(),s=new SaveStore(m);await s.mutate(x=>buildCamp(x,'tent',0));const raw=s.export();const broken=JSON.parse(raw);broken.state.camp.stones=999;
  await assert.rejects(s.import(JSON.stringify(broken)));assert.equal(s.state.camp.stones,5);const b=new SaveStore(new Memory());await b.import(raw);assert.deepEqual(b.state,s.state);
});
await test('explicit valid import can recover a blocked corrupted save',async()=>{const m=new Memory();m.setItem(SAVE_KEY,'broken');const s=new SaveStore(m);await s.import(encode(freshState()));assert.equal(s.blocked,false);assert.equal(s.state.camp.stones,8);});
await test('stale second tab cannot overwrite newer save',async()=>{
  const m=new Memory(),a=new SaveStore(m),b=new SaveStore(m);await a.mutate(s=>buildCamp(s,'tent',0));await assert.rejects(b.mutate(s=>buildCamp(s,'forge',1)),e=>e.code==='CONFLICT');assert.equal(new SaveStore(m).state.camp.buildings[0].type,'tent');
});
await test('latest getter avoids an older queued autosave rolling back synchronous exit flush',async()=>{
  const m=new Memory(),s=new SaveStore(m),g=game();await s.begin(g.snapshot());const queued=s.saveRun(()=>g.snapshot());g.hero.hp=77;s.flushRun(g.snapshot());await queued;assert.equal(new SaveStore(m).state.run.hero.hp,77);
});
await test('missing storage fails visibly rather than claiming success',()=>{const s=new SaveStore({getItem(){throw Error('denied');}});assert.equal(s.blocked,true);assert.match(s.warning,/儲存/);});
console.log(`\n${passed} save / camp scenarios passed.`);
