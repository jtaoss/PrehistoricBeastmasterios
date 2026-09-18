// Pure simulation: no DOM, network, native bridge, or dependency on the shipping game.
export const WORLD = Object.freeze({ width: 720, height: 820 });
export const MAX_WAVES = 8;
// One source of truth for progression tuning. Buildings persist between
// stages, so pressure grows steadily without deleting the player's strategy.
export const STAGE_BALANCE=Object.freeze([
  {hp:1,damage:.85,speed:1,spawn:1.5,wood:5,bone:3,amber:3},
  {hp:1.14,damage:.9,speed:1,spawn:1.36,wood:6,bone:3,amber:3},
  {hp:1.34,damage:.98,speed:1.01,spawn:1.23,wood:6,bone:4,amber:4},
  {hp:1.56,damage:1.06,speed:1.02,spawn:1.14,wood:7,bone:4,amber:4},
  {hp:1.82,damage:1.15,speed:1.03,spawn:1.06,wood:7,bone:5,amber:5},
  {hp:2.1,damage:1.24,speed:1.04,spawn:1.1,wood:8,bone:5,amber:5},
  {hp:2.42,damage:1.33,speed:1.05,spawn:1.32,wood:9,bone:5,amber:6},
  {hp:2.78,damage:1.42,speed:1.06,spawn:1.05,wood:10,bone:6,amber:7}
].map(v=>Object.freeze(v)));
export const FORTIFICATION_BALANCE=Object.freeze({incomingDamage:.78,betweenStageRepair:.35,heroRecovery:15,eggRecovery:18});
export const ENEMY_BALANCE=Object.freeze({
  raptor:Object.freeze({hp:34,speed:64,damage:9,radius:15,drop:1,chance:.45}),
  brute:Object.freeze({hp:125,speed:36,damage:16,radius:24,drop:2,chance:1}),
  spitter:Object.freeze({hp:58,speed:40,damage:12,radius:17,drop:1,chance:.65}),
  matriarch:Object.freeze({hp:550,speed:28,damage:16,radius:38,drop:8,chance:1}),
  charger:Object.freeze({hp:900,speed:38,damage:24,radius:44,drop:10,chance:1}),
  boss:Object.freeze({hp:1500,speed:26,damage:22,radius:46,drop:14,chance:1})
});
export const ACTIVE_SKILLS=Object.freeze({
  volley:Object.freeze({name:'貫骨齊射',cooldown:7,description:'向自動鎖定方向射出五支穿透骨矛，清理扇形獸群。'}),
  shock:Object.freeze({name:'荒骨震擊',cooldown:11,description:'震擊身邊敵人並使其減速，危急時奪回走位空間。'})
});
export const CARDS = Object.freeze({
  watchtower: { name: '獵脊弩台', cost: 5, color: '#d8c58f', short: '連發穿骨', hp: 180, radius: 29, range: 250, description: '快速射出骨弩箭；升級提高傷害，三級可穿透兩名敵人。' },
  catapult: { name: '琥珀投獸器', cost: 6, color: '#e3ad52', short: '拋石震獸', hp: 215, radius: 34, range: 230, description: '拋出琥珀爆彈，落點造成範圍傷害並減速獸群。' },
  torch: { name: '燧火炬', cost: 3, color: '#f5b463', short: '穿火燃矛', hp: 120, radius: 24, range: 148, description: '自動灼燒敵人；投矛穿過火圈會燃燒。' },
  wall: { name: '裂骨牆', cost: 3, color: '#ede2bb', short: '衝刺引爆', hp: 300, radius: 31, range: 120, description: '吸引並阻擋敵人；衝刺穿牆引爆骨片。' },
  nest: { name: '幼獸巢', cost: 5, color: '#b3d99b', short: '孵化戰友', hp: 135, radius: 25, range: 225, description: '孵出幼獸，自動撲擊附近敵人。' },
  spring: { name: '潮汐泉', cost: 5, color: '#91d7d8', short: '回血緩敵', hp: 165, radius: 24, range: 112, description: '附近回復生命並減速敵人；泉邊衝刺釋放寒潮。' }
});
export const STARTING_BUILD_DECK = Object.freeze(['watchtower','catapult','wall','spring']);
// The old two cards remain loadable so existing local saves are never destroyed.
// New runs and the merchant use the four-card construction set below.
export const BUILD_CARDS = Object.freeze(Object.fromEntries(STARTING_BUILD_DECK.map(id=>[id,CARDS[id]])));
export const HIRES = Object.freeze({
  hunter: {name:'遊獵弓手',color:'#a6cfb8',short:'遠程跟隨',hp:65,radius:15,range:240,description:'跟隨獵人，以骨箭遠程支援；倒下後需重新雇佣。'},
  guard: {name:'骨盾衛士',color:'#d5c599',short:'近戰護衛',hp:150,radius:19,range:140,description:'跟隨獵人，主動接敵並吸引攻擊；最多同時四名佣兵。'}
});
export const DEPLOY_CARDS = Object.freeze({...CARDS,...HIRES});
export const CARD_PRICES = Object.freeze({watchtower:{wood:5,bone:2,amber:0},catapult:{wood:6,bone:4,amber:3},torch:{wood:3,bone:1,amber:0},wall:{wood:3,bone:2,amber:0},nest:{wood:4,bone:3,amber:0},spring:{wood:5,bone:3,amber:0},hunter:{wood:4,bone:4,amber:7},guard:{wood:3,bone:5,amber:7}});
export const UPGRADES = Object.freeze([
  { id: 'fire', name: '弩機淬火', symbol: '♨', desc: '獵脊弩台傷害 +35%；舊式火炬燃燒亦獲得強化。', apply: g => { g.mods.fire += .35; g.mods.torch += .35; } },
  { id: 'bones', name: '碎骨風暴', symbol: '✧', desc: '骨牆引爆傷害 +50%，範圍 +20%。', apply: g => { g.mods.blast += .5; g.mods.blastRange += .2; } },
  { id: 'dash', name: '踏風步', symbol: '➶', desc: '衝刺冷卻縮短 25%，移速 +8%。', apply: g => { g.mods.dash *= .75; g.mods.speed += .08; } },
  { id: 'spear', name: '穿林之矛', symbol: '↗', desc: '投矛額外穿透 1 名敵人，傷害 +15%。', apply: g => { g.mods.pierce++; g.mods.spear += .15; } },
  { id: 'axe', name: '環刃骨斧', symbol: '◈', desc: '骨斧改為全周圍斬擊，傷害 +25%。', apply: g => { g.mods.spin = true; g.mods.axe += .25; } },
  { id: 'beast', name: '投獸匠藝', symbol: '♧', desc: '琥珀投獸器傷害 +40%，裝填間隔縮短 15%。', apply: g => { g.mods.beast += .4; g.mods.beastSpeed *= .85; } },
  { id: 'spring', name: '潮汐回響', symbol: '≈', desc: '泉水治療 +50%，泉邊衝刺寒潮傷害翻倍。', apply: g => { g.mods.heal += .5; g.mods.frost += 1; } },
  { id: 'armor', name: '琥珀護甲', symbol: '⬡', desc: '受到傷害降低 15%，立即回復 20 生命。', apply: g => { g.mods.armor *= .85; g.heal(20); } },
  { id: 'builder', name: '荒野工匠', symbol: '⌂', desc: '商人建築卡的木材價格減少 1（最低 1）。', apply: g => { g.mods.discount++; } },
  { id: 'heart', name: '巨獸之心', symbol: '♡', desc: '生命上限 +25，立即回滿 25 生命。', apply: g => { g.hero.maxHp += 25; g.heal(25); } },
  { id: 'loot', name: '拾荒直覺', symbol: '◆', desc: '掉落自動吸附距離 +80，每波多得 3 琥珀。', apply: g => { g.mods.magnet += 80; g.mods.income += 3; } },
  { id: 'repair', name: '守巢誓約', symbol: '◉', desc: '聖獸卵回復 45，每波結束再回復 15。', apply: g => { g.base.hp = Math.min(g.base.maxHp, g.base.hp + 45); g.mods.repair += 15; } }
]);
export const UPGRADE_PRICES=Object.freeze({
  fire:{wood:0,bone:4,amber:18},bones:{wood:0,bone:3,amber:14},dash:{wood:0,bone:3,amber:16},spear:{wood:0,bone:4,amber:18},
  axe:{wood:0,bone:4,amber:18},beast:{wood:0,bone:4,amber:18},spring:{wood:0,bone:3,amber:16},armor:{wood:0,bone:3,amber:16},
  builder:{wood:0,bone:2,amber:14},heart:{wood:0,bone:3,amber:16},loot:{wood:0,bone:3,amber:16},repair:{wood:0,bone:2,amber:16}
});
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function seededRandom(seed) {
  let s = seed >>> 0;
  const random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  random.getState = () => s;
  random.setState = value => { s = value >>> 0; };
  return random;
}
export function pointToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

const SNAPSHOT_KEYS = ['runId','seed','nextId','phase','wave','time','realTime','waveTime','amber','hero','base','buildings','enemies','projectiles','drops','nodes','hand','cardTimers','choices','selectedUpgrades','spawnQueue','spawnTimer','stats','mods'];
const MARKET_KEYS = ['materials','inventory','allies'];
const enemyTypes = ['raptor','brute','spitter','matriarch','charger','boss'];
const STAGE_ROSTERS=Object.freeze([
  Object.freeze(['raptor','raptor','raptor','raptor','raptor','raptor','raptor','raptor']),
  Object.freeze(['raptor','raptor','brute','raptor','raptor','raptor','raptor','brute','raptor','raptor','raptor']),
  Object.freeze(['raptor','spitter','raptor','spitter','brute','raptor','spitter','raptor','matriarch']),
  Object.freeze(['brute','raptor','spitter','brute','raptor','brute','spitter','raptor','brute','spitter','raptor','brute','raptor','spitter','raptor','raptor']),
  Object.freeze(['spitter','raptor','brute','raptor','spitter','brute','raptor','spitter','raptor','brute','spitter','raptor','brute','raptor','spitter','brute','raptor','spitter','raptor','brute']),
  Object.freeze(['brute','spitter','raptor','brute','raptor','spitter','brute','raptor','charger']),
  Object.freeze(['spitter','brute','raptor','spitter','raptor','brute','spitter','raptor','brute','spitter','raptor','brute','raptor','spitter','brute','raptor','spitter','brute']),
  Object.freeze(['brute','spitter','raptor','brute','spitter','raptor','boss'])
]);
const own = (object, key) => Object.hasOwn(object, key);
const isNum = (v, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
function required(condition) { if (!condition) throw new Error('遠征存檔格式損壞或版本不相容'); }
function numbers(object, keys) { required(object && typeof object === 'object' && !Array.isArray(object)); for (const key of keys) required(isNum(object[key])); }
function list(value, max) { required(Array.isArray(value) && value.length <= max); }
function actor(value) { numbers(value,['x','y','hp','r']); required(isNum(value.x,-100,820) && isNum(value.y,-100,920) && isNum(value.r,1,100)); }
export function validateSnapshot(s) {
  required(s && [1,2].includes(s.version) && typeof s.runId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(s.runId));
  required(SNAPSHOT_KEYS.every(key => own(s,key)));
  numbers(s,['seed','nextId','wave','time','realTime','waveTime','amber','spawnTimer','rngState']);
  required(Number.isInteger(s.rngState) && isNum(s.rngState,0,4294967295));
  required(Number.isInteger(s.wave) && isNum(s.wave,0,MAX_WAVES) && isNum(s.amber,0,99));
  required(['prep','wave','draft','win','lose'].includes(s.phase));
  required(s.phase !== 'wave' || s.wave > 0);
  required(s.phase !== 'draft' || s.wave > 0 && s.wave < MAX_WAVES);
  // A completed six-stage save from the previous build remains settleable.
  required(s.phase !== 'win' || s.wave === MAX_WAVES || s.wave === 6);
  actor(s.hero); actor(s.base);
  numbers(s.hero,['maxHp','angle','attackCD','dashCD','dashTime','dashX','dashY','invulnerable','swing']);
  for(const key of ['volleyCD','shockCD'])if(s.hero[key]!==undefined)required(isNum(s.hero[key],0,1e6));
  numbers(s.base,['maxHp']); required(s.hero.id === 'hero' && s.base.id === 'base');
  required(['spear','axe'].includes(s.hero.weapon));
  for (const a of [s.hero,s.base]) required(isNum(a.maxHp,1,10000) && isNum(a.hp,0,a.maxHp));
  required(['lose','win'].includes(s.phase) || s.hero.hp > 0 && s.base.hp > 0);
  list(s.buildings,16);list(s.enemies,120);list(s.projectiles,250);list(s.drops,150);list(s.nodes,30);
  const ids = new Set();
  if(s.version===2){
    required(MARKET_KEYS.every(key=>own(s,key)));list(s.allies,4);
    for(const k of ['wood','bone'])required(Number.isInteger(s.materials?.[k])&&isNum(s.materials[k],0,999));
    for(const k of Object.keys(DEPLOY_CARDS)){
      const value=s.inventory?.[k];
      // v2 saves created before the two new buildings legitimately omit them.
      required((value===undefined&&['watchtower','catapult'].includes(k))||(Number.isInteger(value)&&isNum(value,0,99)));
    }
    for(const a of s.allies){actor(a);required(own(HIRES,a.type));numbers(a,['maxHp','cd','angle']);required(isNum(a.maxHp,1,1000)&&isNum(a.hp,0,a.maxHp));}
    required(s.phase!=='draft');
  }
  for (const a of [...s.buildings,...s.enemies,...s.projectiles,...s.nodes,...(s.version===2?s.allies:[])]) { required(Number.isInteger(a.id) && a.id > 0 && !ids.has(a.id)); ids.add(a.id); }
  required(Number.isInteger(s.nextId) && s.nextId > Math.max(0,...ids));
  for (const b of s.buildings) { actor(b);required(own(CARDS,b.type));numbers(b,['maxHp','level','cd','healCD']);numbers(b.pet,['x','y']);required(Number.isInteger(b.level) && isNum(b.level,1,3)); }
  for (const e of s.enemies) { actor(e);required(enemyTypes.includes(e.type));numbers(e,['maxHp','speed','damage','cd','windup','burn','slow','flash','angle']);if(e.bossPhase!==undefined)required(Number.isInteger(e.bossPhase)&&isNum(e.bossPhase,0,3));if (e.windup > 0) numbers(e,['lockX','lockY']); }
  for (const p of s.projectiles) { numbers(p,['x','y','vx','vy','damage','life']);required(typeof p.hostile === 'boolean');if (!p.hostile) {list(p.hits,150);required(p.hits.every(Number.isInteger));numbers(p,['pierce']);required(typeof p.fire === 'boolean');if(p.kind==='catapult'){numbers(p,['startX','startY','targetX','targetY','maxLife','radius']);required(isNum(p.maxLife,.1,5)&&isNum(p.radius,1,300));}} }
  for (const d of s.drops) numbers(d,['x','y','value','life']);
  for (const n of s.nodes) actor(n);
  list(s.hand,4);list(s.cardTimers,4);required(s.hand.length === 4 && s.cardTimers.length === 4);
  s.hand.forEach((type,i) => { required(type === null || own(s.version===2?DEPLOY_CARDS:CARDS,type));required(isNum(s.cardTimers[i],0,10));required(s.version===2||type !== null || s.cardTimers[i] > 0); });
  const validUpgrade = id => UPGRADES.some(u => u.id === id);
  list(s.choices,3);list(s.selectedUpgrades,s.version===2?32:5);required(s.choices.every(validUpgrade) && s.selectedUpgrades.every(validUpgrade));
  required(s.phase !== 'draft' || s.choices.length === 3 && new Set(s.choices).size === 3);
  list(s.spawnQueue,120);required(s.spawnQueue.every(t => enemyTypes.includes(t)));
  numbers(s.stats,['kills','buildings','upgrades','combos','damage','harvested','waves']);
  numbers(s.mods,['fire','torch','blast','blastRange','dash','speed','pierce','spear','axe','beast','beastSpeed','heal','frost','armor','discount','magnet','income','repair']);required(typeof s.mods.spin === 'boolean');
  return true;
}

export class Expedition {
  constructor(seed = Date.now(), runId = `run-${seed}-${Math.random().toString(36).slice(2, 12)}`) {
    this.runId = runId;
    this.rng = seededRandom(seed); this.seed = seed; this.nextId = 1;
    this.phase = 'prep'; this.wave = 0; this.time = 0; this.realTime = 0; this.waveTime = 0;
    this.paused = false; this.building = false; this.amber = 16;
    this.hero = { id: 'hero', x: 360, y: 475, hp: 100, maxHp: 100, r: 16, angle: -Math.PI / 2,
      weapon: 'spear', attackCD: 0, dashCD: 0, volleyCD: 0, shockCD: 0, dashTime: 0, dashX: 0, dashY: 0, invulnerable: 0, swing: 0 };
    this.base = { id: 'base', x: 360, y: 385, hp: 220, maxHp: 220, r: 35 };
    this.buildings = []; this.enemies = []; this.projectiles = []; this.effects = []; this.drops = []; this.nodes = [];
    this.events = []; this.hand = [...STARTING_BUILD_DECK]; this.cardTimers = [0, 0, 0, 0];
    this.materials={wood:8,bone:4};this.inventory={watchtower:2,catapult:1,torch:2,wall:1,nest:1,spring:1,hunter:0,guard:0};this.allies=[];
    this.choices = []; this.selectedUpgrades = []; this.spawnQueue = []; this.spawnTimer = 0;
    this.stats = { kills: 0, buildings: 0, upgrades: 0, combos: 0, damage: 0, harvested: 0, waves: 0 };
    this.mods = { fire: 1, torch: 1, blast: 1, blastRange: 1, dash: 1, speed: 1, pierce: 0, spear: 1,
      axe: 1, spin: false, beast: 1, beastSpeed: 1, heal: 1, frost: 1, armor: 1, discount: 0, magnet: 0, income: 0, repair: 0 };
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2 + this.rng() * .2;
      this.nodes.push({ id: this.nextId++, x: 360 + Math.cos(angle) * (210 + this.rng() * 30), y: 400 + Math.sin(angle) * (245 + this.rng() * 35), r: 17, hp: 34 });
    }
  }
  snapshot() {
    const state = { version: 2, rngState: this.rng.getState() };
    for (const key of [...SNAPSHOT_KEYS,...MARKET_KEYS]) state[key] = this[key];
    return JSON.parse(JSON.stringify(state));
  }
  static restore(snapshot) {
    validateSnapshot(snapshot);
    const g = new Expedition(snapshot.seed, snapshot.runId);
    for (const key of SNAPSHOT_KEYS) g[key] = JSON.parse(JSON.stringify(snapshot[key]));
    if(!Number.isFinite(g.hero.volleyCD))g.hero.volleyCD=0;if(!Number.isFinite(g.hero.shockCD))g.hero.shockCD=0;
    if(snapshot.version===2){for(const key of MARKET_KEYS)g[key]=JSON.parse(JSON.stringify(snapshot[key]));for(const type of Object.keys(DEPLOY_CARDS))if(!Number.isInteger(g.inventory[type]))g.inventory[type]=0;}
    else {const legacy=['torch','wall','nest','spring'];g.hand=g.hand.map((type,i)=>type||legacy[i]);g.cardTimers=[0,0,0,0];if(g.phase==='draft')g.phase='prep';g.choices=[];}
    // Existing runs receive the new fortification durability without losing
    // their current damage ratio, position, level or identity.
    for(const b of g.buildings){
      const tunedMax=CARDS[b.type].hp*(1+(b.level-1)*.6);
      if(Math.abs(b.maxHp-tunedMax)>.001){const ratio=b.hp/b.maxHp;b.maxHp=tunedMax;b.hp=Math.min(tunedMax,tunedMax*ratio);}
    }
    for(const e of g.enemies)if(!Number.isInteger(e.bossPhase))e.bossPhase=0;
    g.rng.setState(snapshot.rngState);
    // Restore persistent mechanics, not stale pointer input, events or animations.
    g.paused = true; g.building = false; g.events = []; g.effects = [];
    return g;
  }
  event(type, data = {}) { this.events.push({ type, ...data }); if (this.events.length > 120) this.events.shift(); }
  consumeEvents() { const events = this.events; this.events = []; return events; }
  get canBuild() { return !this.paused && (this.phase === 'prep' || this.phase === 'wave'); }
  cost() { return 0; } // Materials are paid at the merchant; deploying consumes one owned card.
  setDeck(kind){if(!this.canBuild)return false;this.hand=kind==='hire'?['hunter','guard',null,null]:[...STARTING_BUILD_DECK];this.cardTimers=[0,0,0,0];return true;}
  price(id){
    if(own(CARD_PRICES,id)){const price={...CARD_PRICES[id]};if(own(CARDS,id))price.wood=Math.max(1,price.wood-this.mods.discount);return price;}
    if(typeof id==='string'&&id.startsWith('skill-'))return UPGRADE_PRICES[id.slice(6)]||null;
    return null;
  }
  purchasePlan(id){
    if(this.phase!=='prep')return{ok:false,reason:'商人只在獸潮之間的休整時間營業'};
    const price=this.price(id);if(!price)return{ok:false,reason:'找不到這件商品'};
    if(own(DEPLOY_CARDS,id)&&this.inventory[id]>=99)return{ok:false,reason:'這張卡已達持有上限'};
    if(!own(DEPLOY_CARDS,id)&&this.selectedUpgrades.includes(id.slice(6)))return{ok:false,reason:'本次遠征已學會這項強化'};
    if(this.materials.wood<price.wood||this.materials.bone<price.bone||this.amber<price.amber)return{ok:false,reason:'材料不足，完成獸潮或採集晶礦後再來'};
    return{ok:true,price};
  }
  buy(id){
    const plan=this.purchasePlan(id);if(!plan.ok)return plan;
    this.materials.wood-=plan.price.wood;this.materials.bone-=plan.price.bone;this.amber-=plan.price.amber;
    if(own(DEPLOY_CARDS,id))this.inventory[id]++;else{const skill=UPGRADES.find(u=>u.id===id.slice(6));skill.apply(this);this.selectedUpgrades.push(skill.id);}
    this.event('purchase',{id});return plan;
  }
  buildingAt(x, y) { return this.buildings.find(b => b.hp > 0 && distance(b, { x, y }) < b.r + 12); }
  placement(slot, x, y) {
    const type = this.hand[slot];
    if (!this.canBuild || !type || this.cardTimers[slot] > 0) return { ok: false, reason: '現在不能使用這張卡' };
    if(!this.inventory[type])return{ok:false,reason:'這張卡已用完，休整時找商人補貨'};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 55 || x > 665 || y < 85 || y > 735) return { ok: false, reason: '請拖到戰場內的空地' };
    const cost = 0;
    if(own(HIRES,type)){
      if(this.allies.filter(a=>a.hp>0).length>=4)return{ok:false,reason:'最多同時四名佣兵；卡片保留，不會消耗'};
      if(distance(this.base,{x,y})<60||[...this.buildings,...this.allies,...this.nodes].some(a=>a.hp>0&&distance(a,{x,y})<a.r+HIRES[type].radius+5))return{ok:false,reason:'請將佣兵放在空地'};
      return{ok:true,x,y,cost,type,hire:true};
    }
    const found = this.buildingAt(x, y);
    if (found) {
      if (found.type !== type) return { ok: false, reason: '只有同類建築才能疊卡升級' };
      if (found.level >= 3) return { ok: false, reason: '已達最高三級' };
      return { ok: true, upgrade: found, cost, x: found.x, y: found.y, type };
    }
    if (this.buildings.filter(b => b.hp > 0).length >= 12) return { ok: false, reason: '戰場最多 12 座建築；可用同類卡升級' };
    if (distance(this.base, { x, y }) < 73) return { ok: false, reason: '請留出聖獸卵的位置' };
    if (this.buildings.some(b => b.hp > 0 && distance(b, { x, y }) < b.r + CARDS[type].radius + 10)) return { ok: false, reason: '與旁邊建築太近，稍微移開一點' };
    if (this.nodes.some(n => n.hp > 0 && distance(n, { x, y }) < n.r + 35)) return { ok: false, reason: '這裡有晶礦，先用武器採集' };
    return { ok: true, x, y, cost, type };
  }
  placeCard(slot, x, y) {
    const target = this.placement(slot, x, y);
    if (!target.ok) { this.event('notice', { message: target.reason }); return target; }
    this.inventory[target.type]--;this.cardTimers[slot]=.3;
    if(target.hire){const d=HIRES[target.type],ally={id:this.nextId++,type:target.type,x,y,r:d.radius,hp:d.hp,maxHp:d.hp,cd:.2,angle:0};this.allies.push(ally);this.event('build');this.event('notice',{message:`${d.name} 加入隊伍 · 本次遠征跟隨作戰`});return{...target,ally};}
    let b = target.upgrade;
    if (b) {
      b.level++; b.maxHp = CARDS[b.type].hp * (1 + (b.level - 1) * .6); b.hp = b.maxHp;
      this.stats.upgrades++; this.event('notice', { message: `${CARDS[b.type].name} → ${b.level} 級，耐久回滿` });
    } else {
      const def = CARDS[target.type];
      b = { id: this.nextId++, type: target.type, x, y, r: def.radius, hp: def.hp, maxHp: def.hp, level: 1, cd: .3, healCD: 2, pet: { x: x + 25, y: y + 16 } };
      this.buildings.push(b); this.stats.buildings++;
      this.event('notice', { message: `${def.name} 已建造 · ${def.short}` });
    }
    this.effects.push({ kind: 'build', x: b.x, y: b.y, life: .7, maxLife: .7, color: '#eed48b', r: 55 });
    this.event('build'); return { ...target, building: b };
  }
  startWave() {
    if (this.phase !== 'prep' || this.paused || this.wave >= MAX_WAVES) return false;
    this.wave++; this.phase = 'wave'; this.waveTime = 0; this.spawnTimer = .8;
    const roster=STAGE_ROSTERS[this.wave-1],count=5+this.wave*3;
    this.spawnQueue=roster?[...roster]:Array.from({length:count},(_,i)=>this.wave>=2&&i%5===3?'brute':this.wave>=3&&i%5===1?'spitter':'raptor');
    this.event('wave', { wave: this.wave }); return true;
  }
  spawnEnemy(type = 'raptor', position) {
    const roll=this.rng(),remaining=this.spawnQueue.length;let p=position;
    if(!p&&this.wave===2){const left=remaining%2===0;p={x:left?42:678,y:105+roll*610};}
    else if(!p&&this.wave===3){const top=remaining%2===0;p={x:85+roll*550,y:top?68:752};}
    else if(!p&&this.wave===4){const corners=[[72,105],[648,105],[72,715],[648,715]],base=corners[remaining%4];p={x:base[0]+(roll-.5)*38,y:base[1]+(this.rng()-.5)*38};}
    else if(!p&&this.wave===5){const angle=(remaining*.93+roll*.35)*Math.PI*2;p={x:clamp(360+Math.cos(angle)*375,40,680),y:clamp(400+Math.sin(angle)*445,60,760)};}
    else if(!p){const angle=roll*Math.PI*2;p={x:clamp(360+Math.cos(angle)*370,40,680),y:clamp(400+Math.sin(angle)*440,60,760)};}
    const values=ENEMY_BALANCE[type],stage=STAGE_BALANCE[Math.max(0,this.wave-1)]||STAGE_BALANCE[0];
    const hp=values.hp*stage.hp;
    const e = { id: this.nextId++, type, x: p.x, y: p.y, r: values.radius, hp, maxHp: hp, speed: values.speed*stage.speed, damage: values.damage*stage.damage, cd: .9, windup: 0, burn: 0, slow: 0, flash: 0, angle: 0, bossPhase:0 };
    this.enemies.push(e); this.effects.push({ kind: 'spawn', x: e.x, y: e.y, life: .7, maxLife: .7, r: e.r + 15, color: '#f2ab85' }); return e;
  }
  attack(aim) {
    const h = this.hero;
    if (this.paused || !['prep', 'wave'].includes(this.phase) || h.attackCD > 0 || h.dashTime > 0) return false;
    let target = aim;
    if (!target) {
      const liveEnemies = this.enemies.filter(e => e.hp > 0);
      const candidates = liveEnemies.length ? liveEnemies : this.nodes.filter(n => n.hp > 0);
      target = candidates.reduce((best, e) => !best || distance(h, e) < distance(h, best) ? e : best, null);
    }
    if (target && distance(h, target) > 1) h.angle = Math.atan2(target.y - h.y, target.x - h.x);
    h.swing = .2;
    if (h.weapon === 'spear') {
      h.attackCD = .44;
      this.projectiles.push({ id: this.nextId++, x: h.x + Math.cos(h.angle) * 20, y: h.y + Math.sin(h.angle) * 20, vx: Math.cos(h.angle) * 530, vy: Math.sin(h.angle) * 530,
        damage: 23 * this.mods.spear, life: 1.2, fire: false, hits: [], pierce: this.mods.pierce + 1, hostile: false });
    } else {
      h.attackCD = .52;
      const range = 100, spread = this.mods.spin ? Math.PI : Math.PI * .55;
      for (const e of [...this.enemies, ...this.nodes]) {
        if (e.hp <= 0 || distance(h, e) > range + e.r) continue;
        const angle = Math.atan2(e.y - h.y, e.x - h.x);
        if (Math.abs(Math.atan2(Math.sin(angle - h.angle), Math.cos(angle - h.angle))) <= spread) {
          if (e.type) this.hitEnemy(e, 40 * this.mods.axe, '#f5ddac'); else this.hitNode(e, 40);
        }
      }
      this.effects.push({ kind: 'slash', x: h.x, y: h.y, angle: h.angle, spread, r: range, life: .22, maxLife: .22, color: '#f9e5b5' });
    }
    this.event('attack'); return true;
  }
  autoAttack(){
    if(this.paused||!['prep','wave'].includes(this.phase)||this.hero.dashTime>0)return false;
    const enemies=this.enemies.filter(e=>e.hp>0),targets=enemies.length?enemies:this.nodes.filter(n=>n.hp>0);
    const target=targets.sort((a,b)=>distance(this.hero,a)-distance(this.hero,b))[0];
    if(!target)return false;
    // Crystals require walking into a modest harvesting radius; enemies may be
    // engaged across the arena so combat never needs a basic-attack button.
    const range=this.hero.weapon==='spear'?(target.type?560:190):104+target.r;
    return distance(this.hero,target)<=range?this.attack(target):false;
  }
  castSkill(id){
    const h=this.hero,skill=ACTIVE_SKILLS[id];
    if(!skill||this.paused||this.phase!=='wave'||h.dashTime>0)return false;
    const key=id==='volley'?'volleyCD':'shockCD';if(h[key]>0)return false;
    const live=this.enemies.filter(e=>e.hp>0);if(!live.length)return false;
    if(id==='volley'){
      const target=live.sort((a,b)=>distance(h,a)-distance(h,b))[0];
      h.angle=Math.atan2(target.y-h.y,target.x-h.x);h.swing=.28;h[key]=skill.cooldown;
      for(const spread of[-.24,-.12,0,.12,.24]){
        const angle=h.angle+spread;
        this.projectiles.push({id:this.nextId++,kind:'skill-bolt',x:h.x+Math.cos(angle)*24,y:h.y+Math.sin(angle)*24,vx:Math.cos(angle)*560,vy:Math.sin(angle)*560,damage:26*this.mods.spear,life:1.15,fire:false,hits:[],pierce:2+this.mods.pierce,hostile:false});
      }
      this.effects.push({kind:'burst',x:h.x,y:h.y,r:54,color:'#f5d58a',life:.36,maxLife:.36});
    }else{
      const nearby=live.filter(e=>distance(h,e)<175+e.r);if(!nearby.length)return false;
      h[key]=skill.cooldown;h.invulnerable=Math.max(h.invulnerable,.9);h.swing=.32;
      for(const e of nearby){
        e.windup=0;e.cd=Math.max(e.cd,1.15);
        if(!['matriarch','charger','boss'].includes(e.type)){
          const dx=e.x-h.x,dy=e.y-h.y,d=Math.hypot(dx,dy)||1;
          e.x=clamp(e.x+dx/d*64,43,WORLD.width-43);e.y=clamp(e.y+dy/d*64,70,WORLD.height-55);
        }
      }
      this.burst(h.x,h.y,170,52*this.mods.axe,'#d8e7bd','frost');
    }
    this.event('skill',{skill:id,name:skill.name});return true;
  }
  dash(input = {}) {
    const h = this.hero;
    if (this.paused || !['prep', 'wave'].includes(this.phase) || h.dashCD > 0) return false;
    const len = Math.hypot(input.x || 0, input.y || 0);
    const a = len > .1 ? Math.atan2(input.y, input.x) : h.angle;
    h.dashX = Math.cos(a); h.dashY = Math.sin(a); h.angle = a;
    h.dashTime = .22; h.invulnerable = .35; h.dashCD = 3.1 * this.mods.dash;
    const spring = this.buildings.find(b => b.hp > 0 && b.type === 'spring' && distance(b, h) < CARDS.spring.range);
    if (spring) {
      this.burst(h.x, h.y, 140, 24 * this.mods.frost, '#a0e6e5', 'frost'); this.stats.combos++;
      this.event('combo', { message: '潮汐共鳴 · 寒潮衝刺' });
    }
    this.event('dash'); return true;
  }
  switchWeapon() {
    if (this.paused || !['prep', 'wave'].includes(this.phase)) return;
    this.hero.weapon = this.hero.weapon === 'spear' ? 'axe' : 'spear';
    this.event('weapon', { weapon: this.hero.weapon });
  }
  heal(amount) { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + amount); }
  hitNode(n, damage) {
    if (n.hp <= 0) return; n.hp -= damage;
    this.effects.push({ kind: 'spark', x: n.x, y: n.y, life: .35, maxLife: .35, r: 20, color: '#edc778' });
    if (n.hp <= 0) { this.amber = Math.min(99, this.amber + 3); this.stats.harvested++; this.float(n.x, n.y - 15, '+3 ◆', '#ffe3a1'); this.event('collect'); }
  }
  hitEnemy(e, damage, color = '#f7e8bd') {
    if (e.hp <= 0) return;
    this.stats.damage += Math.min(e.hp, damage); e.hp -= damage; e.flash = .12;
    if (damage > 5) this.float(e.x, e.y - e.r, String(Math.round(damage)), color);
    if (e.hp <= 0) {
      this.stats.kills++;const loot=ENEMY_BALANCE[e.type];if(loot.drop>0&&this.rng()<=loot.chance)this.drops.push({x:e.x,y:e.y,value:loot.drop,life:60});
      this.effects.push({kind:'enemy-death',type:e.type,x:e.x,y:e.y,r:e.r,angle:e.angle,life:.42,maxLife:.42,color:'#d5d691'});
      this.effects.push({ kind: 'spark', x: e.x, y: e.y, life: .45, maxLife: .45, r: e.r + 8, color: '#d5d691' }); this.event('kill');
    }
  }
  float(x, y, text, color) { this.effects.push({ kind: 'text', x, y, text, color, life: .65, maxLife: .65 }); }
  burst(x, y, r, damage, color, status) {
    for (const e of this.enemies) if (e.hp > 0 && distance(e, { x, y }) < r + e.r) { this.hitEnemy(e, damage, color); if (status === 'frost') e.slow = 3; }
    this.effects.push({ kind: 'burst', x, y, r, color, life: .48, maxLife: .48 });
  }
  damageTarget(t, amount) {
    if (!t || t.hp <= 0) return;
    if (t === this.hero) {
      if (t.invulnerable > 0) return;
      amount *= this.mods.armor; t.invulnerable = .65; this.event('hurt');
    }
    // Fortifications are made for holding a line. This reduction applies only
    // to placed buildings; the hunter, egg and hired allies use normal damage.
    if (this.buildings.includes(t)) amount *= FORTIFICATION_BALANCE.incomingDamage;
    t.hp = Math.max(0, t.hp - amount); this.float(t.x, t.y - (t.r || 25), `−${Math.round(amount)}`, '#ffb29a');
    if (t === this.hero || t === this.base) this.checkDefeat();
  }
  checkDefeat() {
    if ((this.hero.hp <= 0 || this.base.hp <= 0) && !['lose', 'win'].includes(this.phase)) {
      this.phase = 'lose'; this.building = false; this.event('end', { won: false, reason: this.hero.hp <= 0 ? '獵人倒下了' : '聖獸卵失去了庇護' });
    }
  }
  finishWave() {
    if(this.phase!=='wave'||this.stats.waves>=this.wave)return false;
    const before={...this.materials,amber:this.amber};
    this.stats.waves = this.wave;
    const reward=STAGE_BALANCE[this.wave-1]||STAGE_BALANCE[0];
    this.materials.wood=Math.min(999,this.materials.wood+reward.wood);this.materials.bone=Math.min(999,this.materials.bone+reward.bone);
    for (const d of this.drops) this.amber = Math.min(99, this.amber + d.value);
    this.drops = []; this.projectiles = []; this.amber = Math.min(99, this.amber + reward.amber + this.mods.income);
    // Only destroyed fortifications disappear. Every survivor keeps its exact
    // position, level and id, then receives a modest field repair before the
    // next stage. This makes a defence line a lasting player investment.
    this.buildings=this.buildings.filter(b=>b.hp>0);
    const survivors=this.buildings.length;
    this.heal(FORTIFICATION_BALANCE.heroRecovery);
    this.base.hp=Math.min(this.base.maxHp,this.base.hp+FORTIFICATION_BALANCE.eggRecovery+this.mods.repair);
    for(const b of this.buildings)b.hp=Math.min(b.maxHp,b.hp+b.maxHp*FORTIFICATION_BALANCE.betweenStageRepair);
    if (this.wave === MAX_WAVES) { this.phase = 'win'; this.event('end', { won: true }); return; }
    this.phase = 'prep'; this.building = false;this.choices=[];
    // The receipt reports what actually entered the pack, including remaining
    // battlefield drops and respecting capacity. Rendering never grants loot.
    this.event('market-ready',{wood:this.materials.wood-before.wood,bone:this.materials.bone-before.bone,amber:this.amber-before.amber,survivors,repair:Math.round(FORTIFICATION_BALANCE.betweenStageRepair*100)});return true;
  }
  tick(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0 || this.paused || !['prep', 'wave'].includes(this.phase)) return;
    dt = Math.min(dt, .05); this.realTime += dt;
    // Construction is slow motion, never a second independent timer or game loop.
    if (this.building && this.phase === 'wave') dt *= .15;
    this.time += dt;
    const h = this.hero;
    for (const k of ['attackCD', 'dashCD','volleyCD','shockCD', 'invulnerable', 'swing']) h[k] = Math.max(0, h[k] - dt);
    for (let i = 0; i < 4; i++) if (this.cardTimers[i] > 0) {
      this.cardTimers[i] = Math.max(0, this.cardTimers[i] - dt);
    }
    const old = { x: h.x, y: h.y };
    if (h.dashTime > 0) {
      const step = Math.min(dt, h.dashTime); h.dashTime = Math.max(0, h.dashTime - dt);
      h.x += h.dashX * 700 * step; h.y += h.dashY * 700 * step;
      this.effects.push({ kind: 'trail', x: old.x, y: old.y, angle: h.angle, life: .22, maxLife: .22, r: 19, color: '#d2e7bd' });
      for (const b of this.buildings) if (b.hp > 0 && b.type === 'wall' && pointToSegment(b, old, h) < b.r + 12) {
        b.hp = 0; this.burst(b.x, b.y, 120 * this.mods.blastRange, 75 * b.level * this.mods.blast, '#eee0bc');
        this.stats.combos++; this.event('combo', { message: '裂骨共鳴 · 骨片爆破' });
      }
    } else if (!this.building) {
      const x = input.x || 0, y = input.y || 0, len = Math.hypot(x, y);
      if (len > .05) { const mag = Math.max(1, len); h.x += x / mag * 155 * this.mods.speed * dt; h.y += y / mag * 155 * this.mods.speed * dt; h.angle = Math.atan2(y, x); }
    }
    // Combat attacks are automatic. Movement, construction and active skills
    // remain the player's decisions; the nearest in-range enemy is selected.
    this.autoAttack();
    h.x = clamp(h.x, 43, WORLD.width - 43); h.y = clamp(h.y, 70, WORLD.height - 55);
    this.updateBuildings(dt);this.updateAllies(dt); this.updateProjectiles(dt);
    if (this.phase === 'wave') {
      this.waveTime += dt;
      this.spawnTimer -= dt;
      if (this.spawnQueue.length && this.spawnTimer <= 0) { this.spawnEnemy(this.spawnQueue.shift()); this.spawnTimer=STAGE_BALANCE[this.wave-1]?.spawn||1; }
      for (const e of this.enemies) if (e.hp > 0 && this.phase === 'wave') this.updateEnemy(e, dt);
      this.enemies = this.enemies.filter(e => e.hp > 0);
      if (!this.spawnQueue.length && !this.enemies.length && this.phase === 'wave') this.finishWave();
    }
    for (const d of this.drops) {
      d.life -= dt; const dist = distance(h, d);
      if (dist < 100 + this.mods.magnet) { const step = Math.min(dist, 430 * dt); d.x += (h.x - d.x) / (dist || 1) * step; d.y += (h.y - d.y) / (dist || 1) * step; }
      if (distance(h, d) < 25) { this.amber = Math.min(99, this.amber + d.value); d.life = 0; this.float(h.x, h.y - 25, `+${d.value} ◆`, '#f5d687'); this.event('collect'); }
    }
    this.drops = this.drops.filter(d => d.life > 0);
    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter(fx => fx.life > 0).slice(-180);
    this.buildings = this.buildings.filter(b => b.hp > 0);this.allies=this.allies.filter(a=>a.hp>0); this.checkDefeat();
  }
  updateAllies(dt){
    for(const [i,a] of this.allies.entries()){
      if(a.hp<=0)continue;a.cd=Math.max(0,a.cd-dt);
      const target=this.enemies.filter(e=>e.hp>0&&distance(a,e)<300).sort((b,c)=>distance(a,b)-distance(a,c))[0];
      const follow={x:clamp(this.hero.x+(i%2?38:-38),50,670),y:clamp(this.hero.y+38+Math.floor(i/2)*28,85,735)};
      const dest=target||follow,d=distance(a,dest),reach=target?(a.type==='hunter'?210:target.r+a.r+12):18;
      a.angle=Math.atan2(dest.y-a.y,dest.x-a.x);
      if(d>reach){const step=Math.min(d-reach,135*dt);a.x+=Math.cos(a.angle)*step;a.y+=Math.sin(a.angle)*step;}
      if(target&&d<=reach&&a.cd<=0){
        if(a.type==='hunter')this.projectiles.push({id:this.nextId++,x:a.x,y:a.y,vx:Math.cos(a.angle)*390,vy:Math.sin(a.angle)*390,damage:15,life:1,fire:false,hits:[],pierce:1,hostile:false});
        else {this.hitEnemy(target,23,'#deceb2');this.effects.push({kind:'slash',x:a.x,y:a.y,r:50,spread:1.5,angle:a.angle,life:.18,maxLife:.18,color:'#deceb2'});}
        a.cd=a.type==='hunter'?.95:1.1;
      }
    }
  }
  updateBuildings(dt) {
    for (const b of this.buildings) {
      if (b.hp <= 0) continue; b.cd -= dt; b.healCD -= dt;
      const range = CARDS[b.type].range + (b.level - 1) * 14;
      if (b.type === 'watchtower' && b.cd <= 0) {
        const target = this.enemies.filter(e=>e.hp>0&&distance(b,e)<range).sort((a,c)=>distance(b,a)-distance(b,c))[0];
        if(target){
          const angle=Math.atan2(target.y-(b.y-25),target.x-b.x),speed=500;
          this.projectiles.push({id:this.nextId++,kind:'tower-bolt',x:b.x,y:b.y-25,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage:(9+b.level*6)*this.mods.torch,life:range/speed+.18,fire:false,hits:[],pierce:b.level>=3?2:1,hostile:false});
          this.effects.push({kind:'muzzle',buildingId:b.id,x:b.x+Math.cos(angle)*28,y:b.y-25+Math.sin(angle)*18,angle,life:.14,maxLife:.14,r:18,color:'#ffe3a0'});
          b.cd=Math.max(.58,.82-(b.level-1)*.12);
        }
      }
      if (b.type === 'catapult' && b.cd <= 0) {
        const candidates=this.enemies.filter(e=>e.hp>0&&distance(b,e)<range);
        const target=candidates.sort((a,c)=>candidates.filter(e=>distance(c,e)<78).length-candidates.filter(e=>distance(a,e)<78).length||distance(b,a)-distance(b,c))[0];
        if(target){
          const maxLife=.64;
          this.projectiles.push({id:this.nextId++,kind:'catapult',x:b.x,y:b.y-20,startX:b.x,startY:b.y-20,targetX:target.x,targetY:target.y,vx:0,vy:0,damage:(14+b.level*10)*this.mods.beast,radius:44+b.level*12,maxLife,life:maxLife,fire:false,hits:[],pierce:1,hostile:false});
          this.effects.push({kind:'launch-dust',buildingId:b.id,x:b.x,y:b.y+12,life:.32,maxLife:.32,r:30,color:'#d4b675'});
          b.cd=Math.max(1.35,(2.4-(b.level-1)*.25)*this.mods.beastSpeed);
        }
      }
      if (b.type === 'torch' && b.cd <= 0) {
        const target = this.enemies.find(e => e.hp > 0 && distance(b, e) < range);
        if (target) { this.hitEnemy(target, 11 * b.level * this.mods.torch, '#ffc375'); target.burn = Math.max(target.burn, 2); b.cd = .9; this.effects.push({ kind: 'beam', x: b.x, y: b.y - 20, tx: target.x, ty: target.y, life: .18, maxLife: .18, color: '#fabb69' }); }
      }
      if (b.type === 'spring') {
        for (const e of this.enemies) if (e.hp > 0 && distance(b, e) < range) e.slow = Math.max(e.slow, .3);
        if (b.healCD <= 0 && distance(b, this.hero) < range && this.hero.hp < this.hero.maxHp) {
          const amount=(4+3*b.level)*this.mods.heal;this.heal(amount);b.healCD=3;this.float(this.hero.x,this.hero.y-28,`+${Math.round(amount)} ♥`,'#b8efd3');
        }
      }
      if (b.type === 'nest') {
        const target = this.enemies.filter(e => e.hp > 0 && distance(b, e) < range).sort((a, c) => distance(a, b.pet) - distance(c, b.pet))[0];
        const dest = target || { x: b.x + 26, y: b.y + 18 };
        const d = distance(b.pet, dest), step = Math.min(d, 170 * dt);
        if (d > 1) { b.pet.x += (dest.x - b.pet.x) / d * step; b.pet.y += (dest.y - b.pet.y) / d * step; }
        if (target && distance(b.pet, target) < 36 && b.cd <= 0) { this.hitEnemy(target, 21 * b.level * this.mods.beast, '#cfe6a6'); b.cd = .85 * this.mods.beastSpeed; this.effects.push({ kind: 'slash', x: b.pet.x, y: b.pet.y, r: 35, spread: 1.7, angle: Math.atan2(target.y - b.pet.y, target.x - b.pet.x), life: .15, maxLife: .15, color: '#dbefb5' }); }
      }
    }
  }
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.life <= 0) continue;
      if(p.kind==='catapult'){
        p.life=Math.max(0,p.life-dt);const progress=clamp(1-p.life/p.maxLife,0,1);
        p.x=p.startX+(p.targetX-p.startX)*progress;p.y=p.startY+(p.targetY-p.startY)*progress;
        if(p.life<=0)this.burst(p.targetX,p.targetY,p.radius,p.damage,'#f0b34f','frost');
        continue;
      }
      const from = { x: p.x, y: p.y }; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.hostile) {
        // The projectile follows the telegraphed shot; it never homes after release.
        const t = [this.hero, this.base, ...this.buildings,...this.allies].find(t => t.hp > 0 && pointToSegment(t, from, p) < t.r + 6);
        if (t) { this.damageTarget(t, p.damage); p.life = 0; } continue;
      }
      if (!p.fire && this.buildings.some(b => b.type === 'torch' && b.hp > 0 && pointToSegment(b, from, p) < 50 + b.level * 4)) {
        p.fire = true; this.stats.combos++; this.event('ignite');
      }
      for (const e of this.enemies) {
        if (p.life <= 0 || e.hp <= 0 || p.hits.includes(e.id) || pointToSegment(e, from, p) > e.r + 7) continue;
        p.hits.push(e.id); this.hitEnemy(e, p.damage * (p.fire ? 1.35 : 1), p.fire ? '#ffca77' : '#faf0cb');
        if (p.fire) e.burn = 3;
        if (--p.pierce <= 0) p.life = 0;
      }
      for (const n of this.nodes) if (p.life > 0 && n.hp > 0 && !p.hits.includes(n.id) && pointToSegment(n, from, p) < n.r + 5) { p.hits.push(n.id); this.hitNode(n, p.damage); p.life = 0; }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -30 && p.x < WORLD.width + 30 && p.y > -30 && p.y < WORLD.height + 30);
  }
  updateEnemy(e, dt) {
    if(!Number.isInteger(e.bossPhase))e.bossPhase=0;
    e.flash = Math.max(0, e.flash - dt); e.slow = Math.max(0, e.slow - dt); e.cd -= dt;
    if (e.burn > 0) { e.burn -= dt; this.hitEnemy(e, 7 * this.mods.fire * dt, '#ffc075'); if (e.hp <= 0) return; }
    if(e.type==='matriarch'&&e.bossPhase===0&&e.hp/e.maxHp<=.55){
      e.bossPhase=1;
      for(let i=0;i<3;i++){
        const a=e.angle+(i-1)*2.05,p={x:clamp(e.x+Math.cos(a)*62,45,675),y:clamp(e.y+Math.sin(a)*62,70,750)};
        this.spawnEnemy('raptor',p);
      }
      this.effects.push({kind:'burst',x:e.x,y:e.y,r:104,color:'#b7d575',life:.65,maxLife:.65});
      this.event('notice',{message:'沼澤母獸發出巢群召喚 · 幼獸加入戰場'});
    }
    if(e.type==='charger'&&e.bossPhase===0&&e.hp/e.maxHp<=.5){
      e.bossPhase=1;e.speed+=8;e.damage+=6;
      this.effects.push({kind:'burst',x:e.x,y:e.y,r:118,color:'#efad66',life:.65,maxLife:.65});
      this.event('notice',{message:'骨甲衝角獸進入狂暴 · 衝鋒更快更重'});
    }
    if(e.type==='boss'&&e.bossPhase===0&&e.hp/e.maxHp<=.5){
      e.bossPhase=1;e.speed+=5;e.damage+=5;
      this.effects.push({kind:'burst',x:e.x,y:e.y,r:132,color:'#f1a056',life:.7,maxLife:.7});
      this.event('notice',{message:'琥珀泰坦甦醒 · 震地範圍擴大'});
    }
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        if (e.type === 'spitter') {
          const angle = Math.atan2(e.lockY - e.y, e.lockX - e.x);
          this.projectiles.push({ id: this.nextId++, x: e.x, y: e.y, vx: Math.cos(angle) * 195, vy: Math.sin(angle) * 195, damage: e.damage, life: 2.5, hostile: true });
        } else if(e.type==='matriarch'){
          const angle=Math.atan2(e.lockY-e.y,e.lockX-e.x);
          for(const spread of [-.18,0,.18])this.projectiles.push({id:this.nextId++,kind:'venom',x:e.x,y:e.y,vx:Math.cos(angle+spread)*220,vy:Math.sin(angle+spread)*220,damage:e.damage*.8,life:2.2,hostile:true});
          this.effects.push({kind:'burst',x:e.x+Math.cos(angle)*26,y:e.y+Math.sin(angle)*26,r:31,color:'#b8d66c',life:.35,maxLife:.35});
        } else if(e.type==='charger'){
          const from={x:e.x,y:e.y},angle=Math.atan2(e.lockY-e.y,e.lockX-e.x),length=Math.min(245,Math.hypot(e.lockX-e.x,e.lockY-e.y)+45);
          e.x=clamp(e.x+Math.cos(angle)*length,43,WORLD.width-43);e.y=clamp(e.y+Math.sin(angle)*length,70,WORLD.height-55);
          for(const t of [this.hero,this.base,...this.buildings,...this.allies])if(t.hp>0&&pointToSegment(t,from,e)<t.r+e.r*.58)this.damageTarget(t,e.damage);
          this.effects.push({kind:'trail',x:(from.x+e.x)/2,y:(from.y+e.y)/2,angle,r:36,color:'#efb06f',life:.38,maxLife:.38});
          this.effects.push({kind:'burst',x:e.x,y:e.y,r:62,color:'#ef9b65',life:.45,maxLife:.45});
        } else if (e.type === 'boss') {
          const radius=e.bossPhase?106:84;
          for (const t of [this.hero, this.base, ...this.buildings,...this.allies]) if (t.hp > 0 && distance(t, { x: e.lockX, y: e.lockY }) < radius + t.r) this.damageTarget(t, e.damage);
          this.effects.push({ kind: 'burst', x: e.lockX, y: e.lockY, r: radius, color: '#ef9971', life: .5, maxLife: .5 });
        } else {
          const target = [this.hero, this.base, ...this.buildings,...this.allies].find(t => t.id === e.targetId && t.hp > 0);
          if (target && distance(target, { x: e.lockX, y: e.lockY }) < target.r + 25) this.damageTarget(target, e.damage);
        }
        e.cd=e.type==='boss'?(e.bossPhase?1.8:2.2):e.type==='charger'?(e.bossPhase?1.8:2.4):e.type==='matriarch'?2.15:1.2;
      }
      return;
    }
    let target = this.base;
    // Bosses are hero duels. Giving them global hero aggro prevents the
    // counter-intuitive case where kiting away from the egg makes them turn
    // around and delete the objective off-screen.
    const heroAggro=['matriarch','charger','boss'].includes(e.type)?999:e.type==='raptor'?165:125;
    if (distance(e, this.hero) < heroAggro) target = this.hero;
    for (const b of [...this.buildings,...this.allies]) if (b.hp > 0 && distance(e, b) < distance(e, target) && distance(e, b) < 170) target = b;
    const d = distance(e, target), reach=e.type==='matriarch'?220:e.type==='charger'?245:e.type==='spitter'?185:e.type==='boss'?135:e.r+target.r+10;
    e.angle = Math.atan2(target.y - e.y, target.x - e.x);
    if (d <= reach) {
      if (e.cd <= 0) { e.windup=e.type==='boss'?1.1:e.type==='charger'?1:e.type==='matriarch'?.9:.6;e.lockX=target.x;e.lockY=target.y;e.targetId=target.id; }
    } else {
      const move = e.speed * (e.slow > 0 ? .42 : 1) * dt;
      e.x += Math.cos(e.angle) * move; e.y += Math.sin(e.angle) * move;
      for (const other of this.enemies) {
        if (other === e || other.hp <= 0) continue;
        const dist = distance(e, other), limit = (e.r + other.r) * .75;
        if (dist < limit && dist > .1) { const push = Math.min(20 * dt, limit - dist); e.x += (e.x - other.x) / dist * push; e.y += (e.y - other.y) / dist * push; }
      }
    }
  }
}
