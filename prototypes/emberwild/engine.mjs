// Pure simulation: no DOM, network, native bridge, or dependency on the shipping game.
import {freshTutorial,validateTutorial,tutorialActive,tutorialProtected,tutorialWaiting,mandatoryTutorial,TUTORIAL_STEPS,TUTORIAL_BUILD_RADIUS} from './tutorial.mjs';
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
export const STAGE_OBJECTIVES=Object.freeze([
  Object.freeze({type:'defend',icon:'◉',title:'守住聖獸卵',short:'守護目標',detail:'擊退獸群，確保聖獸卵不被摧毀。'}),
  Object.freeze({type:'escort',icon:'↗',title:'護送採集師',short:'護送 NPC',detail:'靠近採集師帶路，護送他穿過巨蕨巢道。'}),
  Object.freeze({type:'destroy',icon:'✹',title:'摧毀三座獸巢',short:'摧毀巢穴',detail:'清除沼澤母獸的三座孵化巢，阻斷幼獸增援。'}),
  Object.freeze({type:'mining',icon:'◆',title:'限時採集熔晶',short:'限時採礦',detail:'在 50 秒內擊碎三處標記晶礦並擊退守衛。'}),
  Object.freeze({type:'rescue',icon:'⌁',title:'營救受困弓手',short:'營救伙伴',detail:'靠近牢籠並守住救援圈，完成後弓手加入本局。'}),
  Object.freeze({type:'defend',icon:'◉',title:'守住焦木防線',short:'首領守護',detail:'保護聖獸靈巢，避開衝角獸的蓄力衝鋒。'}),
  Object.freeze({type:'strongholds',icon:'△',title:'守住三處月骨據點',short:'多點防守',detail:'獸群會分路攻擊三處據點；任一失守都會結束遠征。'}),
  Object.freeze({type:'defend',icon:'◉',title:'守住泰坦聖所',short:'最終守護',detail:'在琥珀泰坦的震地攻勢下守住最後火種。'})
]);
const ESCORT_PATH=Object.freeze([[125,650],[205,585],[275,515],[390,435],[500,325],[585,235],[640,145]].map(([x,y])=>Object.freeze({x,y})));
export const ENEMY_BALANCE=Object.freeze({
  raptor:Object.freeze({hp:34,speed:64,damage:9,radius:15,drop:1,chance:.45}),
  brute:Object.freeze({hp:125,speed:36,damage:16,radius:24,drop:2,chance:1}),
  spitter:Object.freeze({hp:58,speed:40,damage:12,radius:17,drop:1,chance:.65}),
  matriarch:Object.freeze({hp:550,speed:28,damage:16,radius:38,drop:8,chance:1}),
  charger:Object.freeze({hp:900,speed:38,damage:24,radius:44,drop:10,chance:1}),
  boss:Object.freeze({hp:1500,speed:26,damage:22,radius:46,drop:14,chance:1})
});
export const BOSS_WEAKPOINTS=Object.freeze({
  matriarch:Object.freeze({kind:'brood-core',name:'孵化囊',hp:105,radius:17,color:'#b9df78',bonus:.12}),
  charger:Object.freeze({kind:'shoulder-plate',name:'裂角肩甲',hp:155,radius:18,color:'#f0bd71',bonus:.1}),
  boss:Object.freeze({kind:'amber-core',name:'琥珀核心',hp:235,radius:20,color:'#ffc35c',bonus:.14})
});
export const MAP_EVENT_DEFS=Object.freeze({
  merchant:Object.freeze({name:'荒境行商',icon:'◇',short:'以 6 琥珀交換補給'}),
  ruin:Object.freeze({name:'古獸遺跡',icon:'⌘',short:'解讀一枚遠征祝福'}),
  hunter:Object.freeze({name:'受傷獵人',icon:'⌁',short:'救援後加入本關作戰'}),
  chest:Object.freeze({name:'荒野寶箱',icon:'▣',short:'開啟取得隨機材料'}),
  elite:Object.freeze({name:'精英獸群',icon:'♜',short:'擊敗金印獸群領取懸賞'})
});
const MAP_EVENT_SPOTS=Object.freeze([[105,415],[615,415],[215,690],[505,690],[155,130],[565,130],[100,650],[620,650]].map(([x,y])=>Object.freeze({x,y})));
export const ACTIVE_SKILLS=Object.freeze({
  volley:Object.freeze({name:'貫骨齊射',cooldown:7,description:'向自動鎖定方向射出五支穿透骨矛；可在商人處擴充箭數與穿透。'}),
  shock:Object.freeze({name:'荒骨震擊',cooldown:11,description:'震擊身邊敵人並使其減速；可在商人處解鎖持續減速地帶。'})
});
export const COMPANION_MAX_LEVEL=10;
export const COMPANIONS=Object.freeze({
  emberclaw:Object.freeze({name:'焰脊迅龍',title:'烈焰獵手',color:'#f3a24d',hp:82,radius:16,speed:205,range:48,damage:17,cooldown:.66,
    ability:'每第 4 次撲擊引爆焰爪，灼燒周圍敵人。',short:'高速近戰 · 焰爪爆發'}),
  tideroot:Object.freeze({name:'潮汐角龍',title:'潮息守護',color:'#75cfca',hp:105,radius:18,speed:160,range:245,damage:12,cooldown:1.05,
    ability:'發射潮汐彈緩速敵人，並週期治療獵人與聖獸卵。',short:'遠程緩速 · 潮息治療'}),
  stoneback:Object.freeze({name:'岩甲幼龍',title:'晶甲壁壘',color:'#d2b36b',hp:165,radius:22,speed:132,range:58,damage:20,cooldown:1.08,
    ability:'主動吸引近敵；晶甲減傷，重擊產生範圍震波。',short:'吸引火力 · 晶甲震波'})
});
export const companionXPNeeded=level=>level>=COMPANION_MAX_LEVEL?0:45+level*35;
const companionKillXP=Object.freeze({raptor:7,spitter:10,brute:14,matriarch:42,charger:50,boss:65});
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
export const WEAPONS=Object.freeze({
  spear:Object.freeze({name:'骨矛',symbol:'↗',short:'直線穿透',range:560,ranged:true,description:'穩定投擲並穿透獸群；鍛造後每第三擊分裂成三叉骨矛。'}),
  axe:Object.freeze({name:'骨斧',symbol:'◈',short:'扇形重斬',range:104,ranged:false,description:'近身扇形重斬；鍛造後改為環身迴旋斬。'}),
  bow:Object.freeze({name:'獵骨弓',symbol:'➹',short:'遠程速射',range:620,ranged:true,description:'最遠射程的高速骨箭；鍛造後每第三箭扇射三發。'}),
  blades:Object.freeze({name:'裂牙雙刃',symbol:'✕',short:'近戰連斬',range:94,ranged:false,description:'高速雙段連斬；鍛造後每第四擊突進並環斬。'}),
  hammer:Object.freeze({name:'震骨重錘',symbol:'⬢',short:'範圍重擊',range:132,ranged:false,description:'緩慢但寬廣的震退重擊；鍛造後追加地裂波。'})
});
export const LOADOUT_RULES=Object.freeze({cardSlots:4,buildCards:3,hireCards:1,weaponSlots:1,skillSlots:1});
export const DEFAULT_LOADOUT=Object.freeze({
  cards:Object.freeze(['watchtower','catapult','wall','hunter']),
  weapons:Object.freeze(['spear']),
  skills:Object.freeze(['volley'])
});
const LEGACY_LOADOUT=Object.freeze({
  cards:Object.freeze(Object.keys(DEPLOY_CARDS)),
  weapons:Object.freeze(['spear','axe']),
  skills:Object.freeze(Object.keys(ACTIVE_SKILLS)),
  legacy:true
});
const copyLoadout=loadout=>({cards:[...loadout.cards],weapons:[...loadout.weapons],skills:[...loadout.skills],...(loadout.legacy?{legacy:true}:{})});
export function isValidLoadout(loadout,{allowLegacy=false}={}){
  if(!loadout||typeof loadout!=='object'||!Array.isArray(loadout.cards)||!Array.isArray(loadout.weapons)||!Array.isArray(loadout.skills))return false;
  const unique=list=>new Set(list).size===list.length;
  if(!unique(loadout.cards)||!unique(loadout.weapons)||!unique(loadout.skills))return false;
  if(!loadout.cards.every(id=>Object.hasOwn(DEPLOY_CARDS,id))||!loadout.weapons.every(id=>Object.hasOwn(WEAPONS,id))||!loadout.skills.every(id=>Object.hasOwn(ACTIVE_SKILLS,id)))return false;
  if(loadout.legacy===true)return allowLegacy&&loadout.cards.length>0&&loadout.weapons.length>0&&loadout.skills.length>0;
  return loadout.cards.length===LOADOUT_RULES.cardSlots
    &&loadout.cards.filter(id=>Object.hasOwn(CARDS,id)).length===LOADOUT_RULES.buildCards
    &&loadout.cards.filter(id=>Object.hasOwn(HIRES,id)).length===LOADOUT_RULES.hireCards
    &&loadout.weapons.length===LOADOUT_RULES.weaponSlots
    &&loadout.skills.length===LOADOUT_RULES.skillSlots;
}
export function normalizeLoadout(loadout){return copyLoadout(isValidLoadout(loadout)?loadout:DEFAULT_LOADOUT);}
export const CARD_PRICES = Object.freeze({watchtower:{wood:5,bone:2,amber:0},catapult:{wood:6,bone:4,amber:3},torch:{wood:3,bone:1,amber:0},wall:{wood:3,bone:2,amber:0},nest:{wood:4,bone:3,amber:0},spring:{wood:5,bone:3,amber:0},hunter:{wood:4,bone:4,amber:7},guard:{wood:3,bone:5,amber:7}});
export const UPGRADES = Object.freeze([
  { id:'volley-fan',branch:'volley',rank:1,maxRank:2,name:'七矛展翼',symbol:'➶',desc:'貫骨齊射由 5 支提升為 7 支骨矛，扇面覆蓋更寬。',apply:g=>{g.mods.volleyArrows+=2;} },
  { id:'volley-pierce',branch:'volley',rank:2,maxRank:2,requires:'volley-fan',name:'九矛貫陣',symbol:'↗',desc:'貫骨齊射再增加 2 支骨矛，且每支額外穿透 1 名敵人。',apply:g=>{g.mods.volleyArrows+=2;g.mods.volleyPierce++;} },
  { id:'shock-field',branch:'shock',rank:1,maxRank:2,name:'震地餘波',symbol:'✹',desc:'荒骨震擊後留下 4 秒減速地帶，持續壓制進入區域的敵人。',apply:g=>{g.mods.shockFieldDuration+=4;} },
  { id:'shock-resonance',branch:'shock',rank:2,maxRank:2,requires:'shock-field',name:'地脈回響',symbol:'◎',desc:'減速地帶延長至 6 秒、範圍擴大，並每秒造成 12 點餘震傷害。',apply:g=>{g.mods.shockFieldDuration+=2;g.mods.shockFieldRadius+=25;g.mods.shockFieldDamage+=12;} },
  { id: 'fire', name: '弩機淬火', symbol: '♨', desc: '獵脊弩台傷害 +35%；舊式火炬燃燒亦獲得強化。', apply: g => { g.mods.fire += .35; g.mods.torch += .35; } },
  { id: 'bones', name: '碎骨風暴', symbol: '✧', desc: '骨牆引爆傷害 +50%，範圍 +20%。', apply: g => { g.mods.blast += .5; g.mods.blastRange += .2; } },
  { id: 'dash', name: '踏風步', symbol: '➶', desc: '衝刺冷卻縮短 25%，移速 +8%。', apply: g => { g.mods.dash *= .75; g.mods.speed += .08; } },
  { id:'spear',weapon:'spear',name:'裂矛三叉',symbol:'↗',desc:'改造矛頭與投擲握法：每第三次投矛同時射出三支分裂骨矛。',apply:g=>{g.mods.spearFork=true;} },
  { id:'axe',weapon:'axe',name:'環刃骨斧',symbol:'◈',desc:'重鑄雙面斧刃：骨斧由前方扇斬改為全周圍迴旋斬。',apply:g=>{g.mods.spin=true;} },
  { id:'bow',weapon:'bow',name:'三弦齊發',symbol:'➹',desc:'裝上獸筋副弦：每第三次射擊向前方扇射三支骨箭。',apply:g=>{g.mods.bowVolley=true;} },
  { id:'blades',weapon:'blades',name:'影步追獵',symbol:'✕',desc:'在雙刃加裝鉤牙配重：每第四次連斬突進穿敵並施展環身雙斬。',apply:g=>{g.mods.bladeRush=true;} },
  { id:'hammer',weapon:'hammer',name:'地脈餘震',symbol:'⬢',desc:'將熔晶嵌入錘首：重擊後向前撕開寬廣地裂波，可貫穿獸群。',apply:g=>{g.mods.hammerQuake=true;} },
  { id: 'beast', name: '投獸匠藝', symbol: '♧', desc: '琥珀投獸器傷害 +40%，裝填間隔縮短 15%。', apply: g => { g.mods.beast += .4; g.mods.beastSpeed *= .85; } },
  { id: 'spring', name: '潮汐回響', symbol: '≈', desc: '泉水治療 +50%，泉邊衝刺寒潮傷害翻倍。', apply: g => { g.mods.heal += .5; g.mods.frost += 1; } },
  { id: 'armor', name: '琥珀護甲', symbol: '⬡', desc: '受到傷害降低 15%，立即回復 20 生命。', apply: g => { g.mods.armor *= .85; g.heal(20); } },
  { id: 'builder', name: '荒野工匠', symbol: '⌂', desc: '商人建築卡的木材價格減少 1（最低 1）。', apply: g => { g.mods.discount++; } },
  { id: 'heart', name: '巨獸之心', symbol: '♡', desc: '生命上限 +25，立即回滿 25 生命。', apply: g => { g.hero.maxHp += 25; g.heal(25); } },
  { id: 'loot', name: '拾荒直覺', symbol: '◆', desc: '掉落自動吸附距離 +80，每波多得 3 琥珀。', apply: g => { g.mods.magnet += 80; g.mods.income += 3; } },
  { id: 'repair', name: '守巢誓約', symbol: '◉', desc: '聖獸卵回復 45，每波結束再回復 15。', apply: g => { g.base.hp = Math.min(g.base.maxHp, g.base.hp + 45); g.mods.repair += 15; } }
]);
export const UPGRADE_PRICES=Object.freeze({
  'volley-fan':{wood:0,bone:2,amber:10},'volley-pierce':{wood:0,bone:4,amber:16},'shock-field':{wood:0,bone:2,amber:10},'shock-resonance':{wood:0,bone:4,amber:16},
  fire:{wood:0,bone:4,amber:18},bones:{wood:0,bone:3,amber:14},dash:{wood:0,bone:3,amber:16},spear:{wood:3,bone:4,amber:12},
  axe:{wood:3,bone:4,amber:12},bow:{wood:4,bone:3,amber:14},blades:{wood:3,bone:5,amber:14},hammer:{wood:5,bone:5,amber:14},beast:{wood:0,bone:4,amber:18},spring:{wood:0,bone:3,amber:16},armor:{wood:0,bone:3,amber:16},
  builder:{wood:0,bone:2,amber:14},heart:{wood:0,bone:3,amber:16},loot:{wood:0,bone:3,amber:16},repair:{wood:0,bone:2,amber:16}
});
const UPGRADE_CARD_REQUIREMENTS=Object.freeze({fire:Object.freeze(['watchtower','torch']),bones:Object.freeze(['wall']),beast:Object.freeze(['catapult']),spring:Object.freeze(['spring'])});
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function seededRandom(seed) {
  let s = seed >>> 0;
  const random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  random.getState = () => s;
  random.setState = value => { s = value >>> 0; };
  return random;
}
function shuffled(values,random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function createMapEventPlan(seed,allocateId){
  const random=seededRandom((seed^0x9e3779b9)>>>0),types=shuffled(Object.keys(MAP_EVENT_DEFS),random),stages=shuffled([1,2,3,4,5,6,7],random).slice(0,types.length),spots=shuffled(MAP_EVENT_SPOTS,random);
  return types.map((type,index)=>({id:allocateId(),type,stage:stages[index],x:spots[index].x,y:spots[index].y,r:type==='elite'?34:28,variant:Math.floor(random()*3),status:'pending',eliteIds:[]}));
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
function objectiveActors(objective){return objective?[objective.npc,objective.captive,...(objective.targets||[]),...(objective.points||[])].filter(Boolean):[];}
function validateObjective(objective,wave){
  required(objective&&typeof objective==='object'&&objective.stage===wave&&STAGE_OBJECTIVES[wave-1]?.type===objective.type);
  required(typeof objective.completed==='boolean');
  if(objective.type==='escort'){
    actor(objective.npc);numbers(objective.npc,['maxHp','speed']);required(isNum(objective.npc.maxHp,1,1000)&&isNum(objective.npc.hp,0,objective.npc.maxHp));required(Number.isInteger(objective.npc.waypoint)&&isNum(objective.npc.waypoint,0,ESCORT_PATH.length));required(typeof objective.npc.reached==='boolean');
  }else if(objective.type==='destroy'){
    list(objective.targets,3);required(objective.targets.length===3);for(const target of objective.targets){actor(target);numbers(target,['maxHp']);required(target.objectiveKind==='nest'&&isNum(target.maxHp,1,2000)&&isNum(target.hp,0,target.maxHp));}
  }else if(objective.type==='mining'){
    numbers(objective,['timeLeft','duration','mined','required']);required(Number.isInteger(objective.mined)&&Number.isInteger(objective.required)&&isNum(objective.mined,0,3)&&objective.required===3&&isNum(objective.timeLeft,0,50)&&objective.duration===50);list(objective.nodeIds,3);required(objective.nodeIds.length===3&&objective.nodeIds.every(Number.isInteger));
  }else if(objective.type==='rescue'){
    actor(objective.captive);numbers(objective.captive,['maxHp']);numbers(objective,['progress','required']);required(isNum(objective.captive.maxHp,1,1000)&&isNum(objective.captive.hp,0,objective.captive.maxHp)&&typeof objective.rescued==='boolean'&&objective.required===4&&isNum(objective.progress,0,objective.required));
  }else if(objective.type==='strongholds'){
    list(objective.points,3);required(objective.points.length===3);for(const point of objective.points){actor(point);numbers(point,['maxHp']);required(point.objectiveKind==='stronghold'&&isNum(point.maxHp,1,2000)&&isNum(point.hp,0,point.maxHp));}
  }
}
export function validateSnapshot(s) {
  required(s && [1,2].includes(s.version) && typeof s.runId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(s.runId));
  required(validateTutorial(s.tutorial));
  if(s.tutorial?.reward)required(s.phase==='prep'&&s.wave===1&&s.stats.waves===1);
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
  if(s.hero.weaponChain!==undefined)required(Number.isInteger(s.hero.weaponChain)&&isNum(s.hero.weaponChain,0,1e8));
  numbers(s.base,['maxHp']); required(s.hero.id === 'hero' && s.base.id === 'base');
  required(own(WEAPONS,s.hero.weapon));
  if(s.loadout!==undefined){required(isValidLoadout(s.loadout,{allowLegacy:true}));required(s.loadout.weapons.includes(s.hero.weapon));}
  if(s.campUnlocks!==undefined&&s.campUnlocks!==null){list(s.campUnlocks,UPGRADES.length);required(s.campUnlocks.every(id=>UPGRADES.some(upgrade=>upgrade.id===id))&&new Set(s.campUnlocks).size===s.campUnlocks.length);}
  if(s.campSupplyBonus!==undefined){numbers(s.campSupplyBonus,['wood','bone','amber']);for(const key of ['wood','bone','amber'])required(Number.isInteger(s.campSupplyBonus[key])&&isNum(s.campSupplyBonus[key],0,999));}
  for (const a of [s.hero,s.base]) required(isNum(a.maxHp,1,10000) && isNum(a.hp,0,a.maxHp));
  required(['lose','win'].includes(s.phase) || s.hero.hp > 0 && s.base.hp > 0);
  list(s.buildings,16);list(s.enemies,120);list(s.projectiles,250);list(s.drops,150);list(s.nodes,30);
  const ids = new Set(),mapEvents=s.eventPlan||[];
  if(s.eventPlan!==undefined){list(mapEvents,5);required(mapEvents.length===5&&new Set(mapEvents.map(event=>event.type)).size===5&&new Set(mapEvents.map(event=>event.stage)).size===5);for(const event of mapEvents){numbers(event,['x','y','r','stage','variant']);required(Number.isInteger(event.id)&&event.id>0&&!ids.has(event.id));ids.add(event.id);required(own(MAP_EVENT_DEFS,event.type)&&isNum(event.x,40,680)&&isNum(event.y,60,760)&&isNum(event.r,10,60)&&Number.isInteger(event.stage)&&isNum(event.stage,1,7)&&Number.isInteger(event.variant)&&isNum(event.variant,0,2)&&['pending','active','completed','missed'].includes(event.status));list(event.eliteIds,6);required(event.eliteIds.every(id=>Number.isInteger(id)&&id>0)&&new Set(event.eliteIds).size===event.eliteIds.length);}}
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
  if(s.companion!==undefined&&s.companion!==null){
    const p=s.companion;actor(p);required(own(COMPANIONS,p.type));
    numbers(p,['maxHp','cd','abilityCD','angle','xp','attackCount']);
    required(Number.isInteger(p.level)&&isNum(p.level,1,COMPANION_MAX_LEVEL));
    required(Number.isInteger(p.xp)&&isNum(p.xp,0,1e8));required(Number.isInteger(p.attackCount)&&isNum(p.attackCount,0,1e8));
    required(isNum(p.maxHp,1,5000)&&isNum(p.hp,0,p.maxHp));
  }
  if(s.objective!==undefined&&s.objective!==null)validateObjective(s.objective,s.wave);
  const weakpoints=s.enemies.map(enemy=>enemy.weakpoint).filter(Boolean);
  for (const a of [...s.buildings,...s.enemies,...weakpoints,...s.projectiles,...s.nodes,...(s.version===2?s.allies:[]),...objectiveActors(s.objective)]) { required(Number.isInteger(a.id) && a.id > 0 && !ids.has(a.id)); ids.add(a.id); }
  required(Number.isInteger(s.nextId) && s.nextId > Math.max(0,...ids));
  for (const b of s.buildings) { actor(b);required(own(CARDS,b.type));numbers(b,['maxHp','level','cd','healCD']);numbers(b.pet,['x','y']);required(Number.isInteger(b.level) && isNum(b.level,1,3)); }
  for (const e of s.enemies) { actor(e);required(enemyTypes.includes(e.type));numbers(e,['maxHp','speed','damage','cd','windup','burn','slow','flash','angle']);if(e.bossPhase!==undefined)required(Number.isInteger(e.bossPhase)&&isNum(e.bossPhase,0,3));if(e.attackCount!==undefined)required(Number.isInteger(e.attackCount)&&isNum(e.attackCount,0,1e6));if(e.attackKind!==undefined)required(typeof e.attackKind==='string'&&e.attackKind.length<=40);if(e.elite!==undefined)required(typeof e.elite==='boolean');if(e.eliteEventId!==undefined)required(Number.isInteger(e.eliteEventId)&&e.eliteEventId>0&&mapEvents.some(mapEvent=>mapEvent.type==='elite'&&mapEvent.id===e.eliteEventId));if(e.windup > 0) numbers(e,['lockX','lockY']);if(e.weakpoint){const w=e.weakpoint;actor(w);numbers(w,['maxHp','openTime','bossId']);required(BOSS_WEAKPOINTS[e.type]?.kind===w.kind&&w.bossId===e.id&&isNum(w.maxHp,1,5000)&&isNum(w.hp,0,w.maxHp)&&typeof w.open==='boolean'&&typeof w.broken==='boolean');} }
  for (const p of s.projectiles) { numbers(p,['x','y','vx','vy','damage','life']);required(typeof p.hostile === 'boolean');if (!p.hostile) {list(p.hits,150);required(p.hits.every(Number.isInteger));numbers(p,['pierce']);required(typeof p.fire === 'boolean');if(p.hitRadius!==undefined)required(isNum(p.hitRadius,1,80));if(p.targetWeakpointId!==undefined)required(Number.isInteger(p.targetWeakpointId)&&p.targetWeakpointId>=0);if(p.kind==='catapult'){numbers(p,['startX','startY','targetX','targetY','maxLife','radius']);required(isNum(p.maxLife,.1,5)&&isNum(p.radius,1,300));}if(p.kind==='shock-field'){numbers(p,['maxLife','radius','tickCD']);required(isNum(p.maxLife,.1,10)&&isNum(p.radius,1,300)&&isNum(p.tickCD,-1,2));}} }
  for (const d of s.drops) numbers(d,['x','y','value','life']);
  for (const n of s.nodes) actor(n);
  list(s.hand,4);list(s.cardTimers,4);required(s.hand.length === 4 && s.cardTimers.length === 4);
  s.hand.forEach((type,i) => { required(type === null || own(s.version===2?DEPLOY_CARDS:CARDS,type));required(isNum(s.cardTimers[i],0,10));required(s.version===2||type !== null || s.cardTimers[i] > 0); });
  if(s.loadout!==undefined&&!s.loadout.legacy)required(s.hand.every(type=>type===null||s.loadout.cards.includes(type)));
  const validUpgrade = id => UPGRADES.some(u => u.id === id);
  list(s.choices,3);list(s.selectedUpgrades,s.version===2?32:5);required(s.choices.every(validUpgrade) && s.selectedUpgrades.every(validUpgrade));
  required(s.phase !== 'draft' || s.choices.length === 3 && new Set(s.choices).size === 3);
  list(s.spawnQueue,120);required(s.spawnQueue.every(t => enemyTypes.includes(t)));
  numbers(s.stats,['kills','buildings','upgrades','combos','damage','harvested','waves']);
  numbers(s.mods,['fire','torch','blast','blastRange','dash','speed','pierce','spear','axe','beast','beastSpeed','heal','frost','armor','discount','magnet','income','repair']);required(typeof s.mods.spin === 'boolean');
  for(const key of ['bow','blades','hammer'])if(s.mods[key]!==undefined)required(isNum(s.mods[key],0,500));
  for(const key of ['spearFork','bowVolley','bladeRush','hammerQuake'])if(s.mods[key]!==undefined)required(typeof s.mods[key]==='boolean');
  for(const key of ['volleyArrows','volleyPierce','shockFieldDuration','shockFieldRadius','shockFieldDamage'])if(s.mods[key]!==undefined)required(isNum(s.mods[key],0,500));
  return true;
}

export class Expedition {
  constructor(seed = Date.now(), runId = `run-${seed}-${Math.random().toString(36).slice(2, 12)}`) {
    this.runId = runId;
    this.rng = seededRandom(seed); this.seed = seed; this.nextId = 1;
    this.phase = 'prep'; this.wave = 0; this.time = 0; this.realTime = 0; this.waveTime = 0;
    this.paused = false; this.building = false; this.amber = 16;
    this.hero = { id: 'hero', x: 360, y: 475, hp: 100, maxHp: 100, r: 16, angle: -Math.PI / 2,
      weapon: 'spear', weaponChain:0, attackCD: 0, dashCD: 0, volleyCD: 0, shockCD: 0, dashTime: 0, dashX: 0, dashY: 0, invulnerable: 0, swing: 0 };
    this.base = { id: 'base', x: 360, y: 385, hp: 220, maxHp: 220, r: 35 };
    this.buildings = []; this.enemies = []; this.projectiles = []; this.effects = []; this.drops = []; this.nodes = [];
    this.events = []; this.hand = [...STARTING_BUILD_DECK]; this.cardTimers = [0, 0, 0, 0];
    this.materials={wood:8,bone:4};this.inventory={watchtower:2,catapult:1,torch:2,wall:1,nest:1,spring:1,hunter:0,guard:0};this.allies=[];this.companion=null;this.objective=null;
    this.loadout=copyLoadout(LEGACY_LOADOUT);
    this.campUnlocks=null;this.campSupplyBonus={wood:0,bone:0,amber:0};
    this.tutorial=null;
    this.choices = []; this.selectedUpgrades = []; this.spawnQueue = []; this.spawnTimer = 0;
    this.stats = { kills: 0, buildings: 0, upgrades: 0, combos: 0, damage: 0, harvested: 0, waves: 0 };
    this.mods = { fire: 1, torch: 1, blast: 1, blastRange: 1, dash: 1, speed: 1, pierce: 0, spear: 1,
      axe: 1, bow:1, blades:1, hammer:1, spin: false, spearFork:false, bowVolley:false, bladeRush:false, hammerQuake:false, beast: 1, beastSpeed: 1, heal: 1, frost: 1, armor: 1, discount: 0, magnet: 0, income: 0, repair: 0,
      volleyArrows:5,volleyPierce:0,shockFieldDuration:0,shockFieldRadius:145,shockFieldDamage:0 };
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2 + this.rng() * .2;
      this.nodes.push({ id: this.nextId++, x: 360 + Math.cos(angle) * (210 + this.rng() * 30), y: 400 + Math.sin(angle) * (245 + this.rng() * 35), r: 17, hp: 34 });
    }
    this.eventPlan=createMapEventPlan(seed,()=>this.nextId++);
  }
  snapshot() {
    const state = { version: 2, rngState: this.rng.getState() };
    for (const key of [...SNAPSHOT_KEYS,...MARKET_KEYS]) state[key] = this[key];
    state.companion=this.companion;state.objective=this.objective;state.eventPlan=this.eventPlan;state.loadout=this.loadout;state.campUnlocks=this.campUnlocks;state.campSupplyBonus=this.campSupplyBonus;
    state.tutorial=this.tutorial;
    return JSON.parse(JSON.stringify(state));
  }
  static restore(snapshot) {
    validateSnapshot(snapshot);
    const g = new Expedition(snapshot.seed, snapshot.runId);
    for (const key of SNAPSHOT_KEYS) g[key] = JSON.parse(JSON.stringify(snapshot[key]));
    if(!Number.isFinite(g.hero.volleyCD))g.hero.volleyCD=0;if(!Number.isFinite(g.hero.shockCD))g.hero.shockCD=0;
    if(!Number.isInteger(g.hero.weaponChain))g.hero.weaponChain=0;
    for(const [key,value] of Object.entries({bow:1,blades:1,hammer:1,volleyArrows:5,volleyPierce:0,shockFieldDuration:0,shockFieldRadius:145,shockFieldDamage:0}))if(!Number.isFinite(g.mods[key]))g.mods[key]=value;
    for(const [key,value] of Object.entries({spearFork:false,bowVolley:false,bladeRush:false,hammerQuake:false}))if(typeof g.mods[key]!=='boolean')g.mods[key]=value;
    if(g.selectedUpgrades.includes('spear'))g.mods.spearFork=true;if(g.selectedUpgrades.includes('axe'))g.mods.spin=true;if(g.selectedUpgrades.includes('bow'))g.mods.bowVolley=true;if(g.selectedUpgrades.includes('blades'))g.mods.bladeRush=true;if(g.selectedUpgrades.includes('hammer'))g.mods.hammerQuake=true;
    if(snapshot.version===2){for(const key of MARKET_KEYS)g[key]=JSON.parse(JSON.stringify(snapshot[key]));for(const type of Object.keys(DEPLOY_CARDS))if(!Number.isInteger(g.inventory[type]))g.inventory[type]=0;}
    else {const legacy=['torch','wall','nest','spring'];g.hand=g.hand.map((type,i)=>type||legacy[i]);g.cardTimers=[0,0,0,0];if(g.phase==='draft')g.phase='prep';g.choices=[];}
    g.companion=snapshot.companion?JSON.parse(JSON.stringify(snapshot.companion)):null;
    g.loadout=snapshot.loadout?copyLoadout(snapshot.loadout):copyLoadout(LEGACY_LOADOUT);
    g.campUnlocks=Array.isArray(snapshot.campUnlocks)?[...snapshot.campUnlocks]:null;g.campSupplyBonus=snapshot.campSupplyBonus?{...snapshot.campSupplyBonus}:{wood:0,bone:0,amber:0};
    g.tutorial=snapshot.tutorial?JSON.parse(JSON.stringify(snapshot.tutorial)):null;
    g.objective=snapshot.objective?JSON.parse(JSON.stringify(snapshot.objective)):null;
    const migrateMapEvents=!snapshot.eventPlan;g.eventPlan=snapshot.eventPlan?JSON.parse(JSON.stringify(snapshot.eventPlan)):createMapEventPlan(g.seed,()=>g.nextId++);
    if(migrateMapEvents)for(const mapEvent of g.eventPlan)if(mapEvent.stage<=g.stats.waves)mapEvent.status='missed';
    if(g.companion){const p=g.companion,d=COMPANIONS[p.type];p.cd=Number.isFinite(p.cd)?p.cd:0;p.abilityCD=Number.isFinite(p.abilityCD)?p.abilityCD:2;p.attackCount=Number.isInteger(p.attackCount)?p.attackCount:0;p.angle=Number.isFinite(p.angle)?p.angle:0;p.maxHp=g.companionMaxHp(p.type,p.level);p.hp=clamp(p.hp,0,p.maxHp);p.r=d.radius;}
    // Existing runs receive the new fortification durability without losing
    // their current damage ratio, position, level or identity.
    for(const b of g.buildings){
      const tunedMax=CARDS[b.type].hp*(1+(b.level-1)*.6);
      if(Math.abs(b.maxHp-tunedMax)>.001){const ratio=b.hp/b.maxHp;b.maxHp=tunedMax;b.hp=Math.min(tunedMax,tunedMax*ratio);}
    }
    for(const e of g.enemies){
      if(!Number.isInteger(e.bossPhase))e.bossPhase=0;
      if(!Number.isInteger(e.attackCount))e.attackCount=0;
      if(typeof e.attackKind!=='string')e.attackKind='';
      if(BOSS_WEAKPOINTS[e.type]&&!e.weakpoint)e.weakpoint=g.createBossWeakpoint(e,STAGE_BALANCE[Math.max(0,g.wave-1)]?.hp||1);
    }
    g.rng.setState(snapshot.rngState);
    if(g.phase==='wave'&&!g.objective)g.setupObjective();
    if(g.phase==='wave'&&!tutorialProtected(g))g.activateMapEvent();
    // Restore persistent mechanics, not stale pointer input, events or animations.
    g.paused = true; g.building = false; g.events = []; g.effects = [];
    return g;
  }
  event(type, data = {}) { this.events.push({ type, ...data }); if (this.events.length > 120) this.events.shift(); }
  consumeEvents() { const events = this.events; this.events = []; return events; }
  mapEventsForStage(stage=this.wave){return(this.eventPlan||[]).filter(mapEvent=>mapEvent.stage===stage);}
  activeMapEvents(){return this.mapEventsForStage().filter(mapEvent=>mapEvent.status==='active');}
  findMapEventSpot(mapEvent){
    const occupied=[this.base,...this.buildings.filter(actor=>actor.hp>0),...this.nodes.filter(actor=>actor.hp>0),...objectiveActors(this.objective)];
    const choices=[{x:mapEvent.x,y:mapEvent.y},...MAP_EVENT_SPOTS];
    return choices.find(point=>occupied.every(actor=>distance(point,actor)>mapEvent.r+(actor.r||20)+28))||choices[0];
  }
  activateMapEvent(){
    if(mandatoryTutorial(this))return null;
    const mapEvent=this.mapEventsForStage().find(entry=>entry.status==='pending');if(!mapEvent||this.phase!=='wave')return null;
    const spot=this.findMapEventSpot(mapEvent);mapEvent.x=spot.x;mapEvent.y=spot.y;mapEvent.status='active';
    if(mapEvent.type==='elite'){
      const rngState=this.rng.getState(),types=this.wave<=2?['raptor','raptor','raptor']:this.wave<=5?['brute','spitter','raptor']:['brute','brute','spitter'];
      mapEvent.eliteIds=types.map((type,index)=>{const angle=index*Math.PI*2/types.length-.7,enemy=this.spawnEnemy(type,{x:clamp(mapEvent.x+Math.cos(angle)*68,48,672),y:clamp(mapEvent.y+Math.sin(angle)*60,78,742)});enemy.elite=true;enemy.eliteEventId=mapEvent.id;enemy.maxHp*=1.42;enemy.hp=enemy.maxHp;enemy.damage*=1.22;enemy.speed*=1.06;return enemy.id;});
      this.rng.setState(rngState);this.event('notice',{message:'金印精英獸群現身 · 擊敗全部成員可領取懸賞'});
    }else this.event('notice',{message:`發現地圖事件 · ${MAP_EVENT_DEFS[mapEvent.type].name}`});
    return mapEvent;
  }
  nearbyMapEvent(){return this.activeMapEvents().filter(mapEvent=>mapEvent.type!=='elite'&&distance(this.hero,mapEvent)<=92+mapEvent.r).sort((a,b)=>distance(this.hero,a)-distance(this.hero,b))[0]||null;}
  mapEventPrompt(mapEvent=this.nearbyMapEvent()){
    if(!mapEvent)return'';if(mapEvent.type==='merchant')return this.amber>=6?'交換補給 · 6 ◆':'琥珀不足 · 需要 6 ◆';
    return{ruin:'解讀遺跡',hunter:'救援獵人',chest:'開啟寶箱'}[mapEvent.type]||'互動';
  }
  resolveMapEvent(mapEvent,message){
    if(!mapEvent||mapEvent.status!=='active')return false;mapEvent.status='completed';this.effects.push({kind:'burst',x:mapEvent.x,y:mapEvent.y,r:78,color:'#f0d183',life:.7,maxLife:.7});this.float(mapEvent.x,mapEvent.y-38,'事件完成','#ffe4a0');this.event('map-event',{eventType:mapEvent.type,name:MAP_EVENT_DEFS[mapEvent.type].name,message});return true;
  }
  interactMapEvent(id){
    if(mandatoryTutorial(this))return false;
    if(this.paused||this.phase!=='wave')return false;const mapEvent=this.nearbyMapEvent();if(!mapEvent||id!==undefined&&mapEvent.id!==id)return false;
    if(mapEvent.type==='merchant'){
      if(this.amber<6){this.event('notice',{message:'荒境行商需要 6 琥珀 · 採集晶礦或擊敗敵人後再來'});return false;}
      this.amber-=6;this.materials.wood=Math.min(999,this.materials.wood+3);this.materials.bone=Math.min(999,this.materials.bone+2);this.heal(20);return this.resolveMapEvent(mapEvent,'行商收下琥珀 · 木材 +3、獸骨 +2、生命回復 20');
    }
    if(mapEvent.type==='chest'){
      const rewards=[{wood:4,bone:1,amber:5},{wood:2,bone:3,amber:7},{wood:3,bone:2,amber:9}][mapEvent.variant];this.materials.wood=Math.min(999,this.materials.wood+rewards.wood);this.materials.bone=Math.min(999,this.materials.bone+rewards.bone);this.amber=Math.min(99,this.amber+rewards.amber);return this.resolveMapEvent(mapEvent,`寶箱已開啟 · 木材 +${rewards.wood}、獸骨 +${rewards.bone}、琥珀 +${rewards.amber}`);
    }
    if(mapEvent.type==='hunter'){
      if(this.allies.filter(ally=>ally.hp>0).length<4){const d=HIRES.hunter;this.allies.push({id:this.nextId++,type:'hunter',eventRescue:true,x:mapEvent.x,y:mapEvent.y,r:d.radius,hp:d.hp,maxHp:d.hp,cd:.2,angle:0});return this.resolveMapEvent(mapEvent,'受傷獵人已包紮 · 本關加入隊伍');}
      this.materials.bone=Math.min(999,this.materials.bone+3);this.amber=Math.min(99,this.amber+5);return this.resolveMapEvent(mapEvent,'隊伍已滿，獵人留下謝禮 · 獸骨 +3、琥珀 +5');
    }
    if(mapEvent.type==='ruin'){
      if(mapEvent.variant===0){this.hero.maxHp+=15;this.heal(15);return this.resolveMapEvent(mapEvent,'生命刻印甦醒 · 生命上限 +15');}
      if(mapEvent.variant===1){for(const id of Object.keys(WEAPONS))this.mods[id]+=.1;return this.resolveMapEvent(mapEvent,'獵魂刻印甦醒 · 所有主武器傷害 +10%');}
      this.materials.wood=Math.min(999,this.materials.wood+4);this.materials.bone=Math.min(999,this.materials.bone+3);return this.resolveMapEvent(mapEvent,'造物刻印甦醒 · 木材 +4、獸骨 +3');
    }
    return false;
  }
  updateMapEvents(){
    const mapEvent=this.activeMapEvents().find(entry=>entry.type==='elite');if(!mapEvent||!mapEvent.eliteIds.length)return;
    if(mapEvent.eliteIds.some(id=>this.enemies.some(enemy=>enemy.id===id&&enemy.hp>0)))return;
    this.materials.bone=Math.min(999,this.materials.bone+2);this.amber=Math.min(99,this.amber+12);this.heal(20);this.base.hp=Math.min(this.base.maxHp,this.base.hp+70);this.gainCompanionXP(18);this.resolveMapEvent(mapEvent,'精英獸群已擊敗 · 懸賞入袋並修復聖獸靈巢 70');
  }
  setupObjective(){
    const def=STAGE_OBJECTIVES[this.wave-1]||STAGE_OBJECTIVES[0],base={stage:this.wave,type:def.type,completed:false};
    this.nodes=this.nodes.filter(node=>node.objectiveKind!=='ore');
    if(def.type==='escort'){
      const start=ESCORT_PATH[0];base.npc={id:this.nextId++,objectiveKind:'escort',x:start.x,y:start.y,r:18,hp:180,maxHp:180,speed:74,waypoint:1,reached:false,angle:-Math.PI/2};
    }else if(def.type==='destroy'){
      base.targets=[[135,205],[585,235],[360,665]].map(([x,y],index)=>({id:this.nextId++,objectiveKind:'nest',label:`孵化巢 ${index+1}`,x,y,r:31,hp:165,maxHp:165}));
    }else if(def.type==='mining'){
      base.duration=50;base.timeLeft=50;base.mined=0;base.required=3;base.nodeIds=[];
      for(const [x,y] of [[145,210],[575,275],[360,675]]){const node={id:this.nextId++,objectiveKind:'ore',x,y,r:20,hp:42};this.nodes.push(node);base.nodeIds.push(node.id);}
    }else if(def.type==='rescue'){
      base.progress=0;base.required=4;base.rescued=false;base.captive={id:this.nextId++,objectiveKind:'captive',x:585,y:175,r:17,hp:100,maxHp:100,angle:Math.PI};
    }else if(def.type==='strongholds'){
      base.points=[[150,235],[570,250],[360,650]].map(([x,y],index)=>({id:this.nextId++,objectiveKind:'stronghold',label:`月骨據點 ${index+1}`,x,y,r:29,hp:320,maxHp:320}));
    }
    this.objective=base;this.event('objective',{objective:def.type,title:def.title});return base;
  }
  objectiveDefinition(){return STAGE_OBJECTIVES[Math.max(0,(this.objective?.stage||this.wave||1)-1)]||STAGE_OBJECTIVES[0];}
  attackableObjectives(){return this.objective?.type==='destroy'?this.objective.targets.filter(target=>target.hp>0):[];}
  objectiveDefenders(){
    if(this.objective?.type==='escort'&&this.objective.npc.hp>0)return[this.objective.npc];
    if(this.objective?.type==='strongholds')return this.objective.points.filter(point=>point.hp>0);
    return[];
  }
  combatDefenders(){return[this.hero,this.base,...this.buildings,...this.allies,...(this.companion?[this.companion]:[]),...this.objectiveDefenders()];}
  objectiveStatus(){
    const o=this.objective,def=this.objectiveDefinition();if(!o)return{...def,text:'尚未開始',progress:0,complete:false};
    if(o.type==='escort'){const current=Math.max(0,Math.min(o.npc.waypoint-1,ESCORT_PATH.length-1));return{...def,text:o.npc.reached?'採集師已抵達出口':distance(this.hero,o.npc)>165?'靠近採集師才能帶路':`路程 ${current} / ${ESCORT_PATH.length-1}`,progress:o.npc.reached?1:current/(ESCORT_PATH.length-1),complete:o.npc.reached};}
    if(o.type==='destroy'){const destroyed=o.targets.filter(target=>target.hp<=0).length;return{...def,text:`已摧毀 ${destroyed} / ${o.targets.length}`,progress:destroyed/o.targets.length,complete:destroyed===o.targets.length};}
    if(o.type==='mining')return{...def,text:`已採集 ${o.mined} / ${o.required} · 剩餘 ${Math.ceil(o.timeLeft)} 秒`,progress:o.mined/o.required,complete:o.mined>=o.required,timed:true};
    if(o.type==='rescue')return{...def,text:o.rescued?'受困弓手已獲救':`救援 ${o.progress.toFixed(1)} / ${o.required.toFixed(1)} 秒`,progress:o.rescued?1:o.progress/o.required,complete:o.rescued};
    if(o.type==='strongholds'){const alive=o.points.filter(point=>point.hp>0),ratio=alive.length?Math.min(...alive.map(point=>point.hp/point.maxHp)):0;return{...def,text:`據點 ${alive.length} / ${o.points.length} · 最低耐久 ${Math.ceil(ratio*100)}%`,progress:ratio,complete:o.completed};}
    return{...def,text:`聖獸卵 ${Math.ceil(this.base.hp)} / ${this.base.maxHp}`,progress:this.base.hp/this.base.maxHp,complete:o.completed};
  }
  objectiveReady(){
    const o=this.objective;if(!o)return true;
    if(o.type==='escort')return o.npc.reached&&o.npc.hp>0;
    if(o.type==='destroy')return o.targets.every(target=>target.hp<=0);
    if(o.type==='mining')return o.mined>=o.required;
    if(o.type==='rescue')return o.rescued;
    if(o.type==='strongholds')return o.points.every(point=>point.hp>0);
    return this.base.hp>0;
  }
  completeObjective(){const o=this.objective;if(!o||o.completed||!this.objectiveReady())return false;o.completed=true;const def=this.objectiveDefinition();this.effects.push({kind:'burst',x:this.hero.x,y:this.hero.y,r:92,color:'#e8d28a',life:.65,maxLife:.65});this.event('objective-complete',{objective:o.type,title:def.title});return true;}
  failObjective(reason){if(['lose','win'].includes(this.phase))return false;this.phase='lose';this.building=false;this.event('end',{won:false,reason});return true;}
  updateObjective(dt){
    const o=this.objective;if(!o||o.completed||this.phase!=='wave')return;
    if(o.type==='escort'){
      const npc=o.npc;if(npc.hp<=0){this.failObjective('護送的採集師倒下了');return;}
      if(!npc.reached&&distance(this.hero,npc)<=165){const target=ESCORT_PATH[npc.waypoint];if(target){const d=distance(npc,target),step=Math.min(d,npc.speed*dt);npc.angle=Math.atan2(target.y-npc.y,target.x-npc.x);npc.x+=Math.cos(npc.angle)*step;npc.y+=Math.sin(npc.angle)*step;if(d<4){npc.waypoint++;if(npc.waypoint>=ESCORT_PATH.length){npc.reached=true;this.event('notice',{message:'採集師已抵達出口 · 繼續清除追兵'});}}}}
    }else if(o.type==='mining'){
      if(o.mined<o.required){o.timeLeft=Math.max(0,o.timeLeft-dt);if(o.timeLeft<=0){this.failObjective('限時採礦未能完成');return;}}
    }else if(o.type==='rescue'&&!o.rescued){
      const safe=distance(this.hero,o.captive)<=78&&!this.enemies.some(enemy=>enemy.hp>0&&distance(enemy,o.captive)<105+enemy.r);
      o.progress=clamp(o.progress+(safe?dt:-dt*.35),0,o.required);
      if(o.progress>=o.required){o.progress=o.required;o.rescued=true;const d=HIRES.hunter;if(this.allies.length<4)this.allies.push({id:this.nextId++,type:'hunter',rescued:true,x:o.captive.x,y:o.captive.y,r:d.radius,hp:d.hp,maxHp:d.hp,cd:.2,angle:0});this.effects.push({kind:'burst',x:o.captive.x,y:o.captive.y,r:82,color:'#9fd7bc',life:.7,maxLife:.7});this.event('notice',{message:'受困弓手已獲救 · 本關加入隊伍'});}
    }else if(o.type==='strongholds'&&o.points.some(point=>point.hp<=0)){this.failObjective('月骨據點失守');}
  }
  hitObjective(target,damage){
    if(!target||target.hp<=0||target.objectiveKind!=='nest')return false;const before=target.hp;target.hp=Math.max(0,target.hp-damage);this.stats.damage+=Math.min(before,damage);this.effects.push({kind:'spark',x:target.x,y:target.y-10,r:25,color:'#e9b477',life:.35,maxLife:.35});
    if(target.hp<=0){const status=this.objectiveStatus();this.effects.push({kind:'burst',x:target.x,y:target.y,r:74,color:'#e39a5f',life:.65,maxLife:.65});this.event('notice',{message:`孵化巢已摧毀 · ${status.text}`});}
    return true;
  }
  get canBuild() { return !this.paused && (this.phase === 'prep' || this.phase === 'wave'); }
  companionMaxHp(type,level){const d=COMPANIONS[type];return Math.round(d.hp*(1+(Math.max(1,level)-1)*.12));}
  setCompanion(type,progress={}){
    const d=COMPANIONS[type];if(!d)return false;
    const level=clamp(Math.floor(Number(progress.level)||1),1,COMPANION_MAX_LEVEL),xp=Math.max(0,Math.floor(Number(progress.xp)||0));
    const same=this.companion?.type===type,prior=same?this.companion:null,maxHp=this.companionMaxHp(type,level);
    this.companion={id:'companion',type,level,xp,x:prior?.x??this.hero.x-42,y:prior?.y??this.hero.y+34,r:d.radius,
      hp:prior?Math.min(maxHp,prior.hp):maxHp,maxHp,cd:prior?.cd??.2,abilityCD:prior?.abilityCD??2.5,
      attackCount:prior?.attackCount??0,angle:prior?.angle??0};
    this.event('companion-ready',{companion:type,name:d.name,level});return true;
  }
  companionProgress(){const p=this.companion;return p?{type:p.type,level:p.level,xp:p.xp}:null;}
  gainCompanionXP(amount){
    const p=this.companion;if(!p||p.hp<=0||p.level>=COMPANION_MAX_LEVEL)return false;
    p.xp+=Math.max(0,Math.floor(amount));let leveled=false;
    while(p.level<COMPANION_MAX_LEVEL){const need=companionXPNeeded(p.level);if(p.xp<need)break;p.xp-=need;p.level++;const old=p.maxHp;p.maxHp=this.companionMaxHp(p.type,p.level);p.hp=Math.min(p.maxHp,p.hp+(p.maxHp-old)+18);leveled=true;}
    if(leveled){const d=COMPANIONS[p.type];this.effects.push({kind:'burst',x:p.x,y:p.y,r:72,color:d.color,life:.65,maxLife:.65});this.event('companion-level',{companion:p.type,name:d.name,level:p.level});}
    return leveled;
  }
  cost() { return 0; } // Materials are paid at the merchant; deploying consumes one owned card.
  applyLoadout(loadout){
    if(!isValidLoadout(loadout))throw new Error('出征配置不完整：需要 3 張建造卡、1 張佣兵卡、1 把武器與 1 個主動技能');
    this.loadout=copyLoadout(loadout);this.hero.weapon=this.loadout.weapons[0];this.hero.weaponChain=0;
    const starter={watchtower:2,catapult:1,torch:2,wall:1,nest:1,spring:1,hunter:1,guard:1};
    for(const id of Object.keys(DEPLOY_CARDS))this.inventory[id]=this.loadout.cards.includes(id)?starter[id]:0;
    this.setDeck('build');return this.loadout;
  }
  carriesCard(id){return this.loadout?.legacy===true||this.loadout?.cards.includes(id);}
  carriesWeapon(id){return this.loadout?.legacy===true||this.loadout?.weapons.includes(id);}
  carriesSkill(id){return this.loadout?.legacy===true||this.loadout?.skills.includes(id);}
  upgradeFitsLoadout(skill){
    if(!skill)return false;
    if(Array.isArray(this.campUnlocks)&&!this.campUnlocks.includes(skill.id))return false;
    if(skill.branch&&!this.carriesSkill(skill.branch))return false;
    if(skill.weapon&&!this.carriesWeapon(skill.weapon))return false;
    const cards=UPGRADE_CARD_REQUIREMENTS[skill.id];return !cards||cards.some(id=>this.carriesCard(id));
  }
  setDeck(kind){
    if(mandatoryTutorial(this)&&this.wave>0&&(this.tutorial.step!=='build'||kind!=='build'))return false;
    if(!this.canBuild)return false;
    const source=this.loadout?.legacy?(kind==='hire'?Object.keys(HIRES):STARTING_BUILD_DECK):(this.loadout?.cards||Object.keys(DEPLOY_CARDS));
    const cards=source.filter(id=>kind==='hire'?own(HIRES,id):own(CARDS,id)).slice(0,4);
    this.hand=[...cards,...Array(4-cards.length).fill(null)];this.cardTimers=[0,0,0,0];return true;
  }
  price(id){
    if(own(CARD_PRICES,id)){const price={...CARD_PRICES[id]};if(own(CARDS,id))price.wood=Math.max(1,price.wood-this.mods.discount);return price;}
    if(typeof id==='string'&&id.startsWith('skill-'))return UPGRADE_PRICES[id.slice(6)]||null;
    return null;
  }
  purchasePlan(id){
    if(this.tutorial?.reward)return{ok:false,reason:'先領取第一關獎勵，再找商人整備'};
    if(!['prep','wave','rest'].includes(this.phase))return{ok:false,reason:'目前遠征已結束，請先返回營地'};
    if(this.phase==='wave'&&!this.paused)return{ok:false,reason:'打開商店後戰鬥會自動暫停，再進行購買'};
    const price=this.price(id);if(!price)return{ok:false,reason:'找不到這件商品'};
    if(own(DEPLOY_CARDS,id)&&!this.carriesCard(id))return{ok:false,reason:'這張卡未加入本次出征卡組'};
    if(own(DEPLOY_CARDS,id)&&this.inventory[id]>=99)return{ok:false,reason:'這張卡已達持有上限'};
    if(!own(DEPLOY_CARDS,id)&&this.selectedUpgrades.includes(id.slice(6)))return{ok:false,reason:'本次遠征已學會這項強化'};
    if(!own(DEPLOY_CARDS,id)){const skill=UPGRADES.find(u=>u.id===id.slice(6));if(!this.upgradeFitsLoadout(skill))return{ok:false,reason:'這項強化不屬於本次出征配置'};if(skill?.requires&&!this.selectedUpgrades.includes(skill.requires))return{ok:false,reason:'需要先購買前一階技能強化'};}
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
  placement(slot, x, y, findingTutorialSpot=false) {
    const type = this.hand[slot];
    if(mandatoryTutorial(this)&&this.tutorial.step!=='build')return{ok:false,reason:'完成目前教學步驟後才會解鎖建造'};
    if(tutorialWaiting(this))return{ok:false,reason:'先點擊教學面板繼續'};
    if(!findingTutorialSpot&&tutorialProtected(this)&&this.tutorial.version===2&&this.tutorial.step==='build'){
      if(!Number.isFinite(x)||!Number.isFinite(y)||slot!==this.tutorial.slot||distance({x,y},this.tutorial.buildSpot)>TUTORIAL_BUILD_RADIUS)return{ok:false,reason:'將發光卡牌拖到金色虛線圈內，再放開'};
      // The entire visible training ring is a safe drop target, even on small landscape screens.
      ({x,y}=this.tutorial.buildSpot);
    }
    if(tutorialProtected(this)&&(this.tutorial.step!=='build'||own(HIRES,type)))return{ok:false,reason:'先完成上方引導，再拖建造卡到空地'};
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
    if(this.activeMapEvents().some(mapEvent=>distance(mapEvent,{x,y})<mapEvent.r+42))return{ok:false,reason:'請為地圖事件留出互動空間'};
    return { ok: true, x, y, cost, type };
  }
  placeCard(slot, x, y) {
    const target = this.placement(slot, x, y);
    if (!target.ok) { this.event('notice', { message: target.reason }); return target; }
    ({x,y}=target);
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
    this.advanceTutorial('build');this.event('build'); return { ...target, building: b };
  }
  enableTutorial(options){if(this.wave===0)this.tutorial=freshTutorial(options);}
  confirmTutorial(){
    if(!tutorialActive(this)||this.tutorial.version!==2||this.phase!=='wave'||this.paused)return false;
    const t=this.tutorial;
    if(!t.started){t.started=true;this.event('tutorial-step',{step:t.step});return true;}
    if(!t.awaiting)return false;
    t.awaiting=false;return this.advanceTutorial(t.step,true);
  }
  advanceTutorial(step,confirmed=false){
    if(!tutorialActive(this)||this.phase!=='wave'||this.tutorial.step!==step)return false;
    const t=this.tutorial;
    if(t.version===2&&!confirmed){
      if(!t.started||t.awaiting)return false;
      t.awaiting=true;this.building=false;this.event('tutorial-success',{step});return true;
    }
    const next=TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(step)+1];if(!next)return false;
    this.tutorial.step=next;this.tutorial.elapsed=0;
    if(next==='attack'&&!this.enemies.some(e=>e.hp>0)&&this.spawnQueue.length){
      const h=this.hero,enemy=this.spawnEnemy(this.spawnQueue.shift(),{x:h.x,y:clamp(h.y-72,100,710)});
      if(t.version===2){enemy.hp=enemy.maxHp=Math.max(enemy.maxHp,180);this.hero.attackCD=0;}
    }
    if(next==='build'){
      this.setDeck('build');
      if(t.version===2){
        t.slot=this.hand.findIndex(type=>CARDS[type]&&this.inventory[type]>0);
        const spots=[{x:220,y:490},...Array.from({length:96},(_,i)=>({x:80+(i%12)*50,y:180+Math.floor(i/12)*65}))];
        t.buildSpot=spots.find(p=>this.placement(t.slot,p.x,p.y,true).ok)||null;
        if(!t.buildSpot){t.slot=0;this.skipTutorial();this.event('notice',{message:'目前沒有可用建造空地，已解除教學；可從首頁重玩新手試煉。'});return true;}
      }
    }
    if(next==='reward'){
      if(mandatoryTutorial(this)){this.spawnQueue=this.spawnQueue.slice(0,2);this.spawnTimer=.45;}
      else this.activateMapEvent();
    }
    this.event('tutorial-step',{step:next});return true;
  }
  claimTutorialReward(){
    if(this.phase!=='prep'||!this.tutorial?.reward)return false;
    const reward=this.tutorial.reward;
    this.materials.wood=Math.min(999,this.materials.wood+reward.wood);this.materials.bone=Math.min(999,this.materials.bone+reward.bone);this.amber=Math.min(99,this.amber+reward.amber);
    this.tutorial.reward=null;this.tutorial.status='done';return true;
  }
  skipTutorial(){
    if(mandatoryTutorial(this))return false;
    if(!tutorialActive(this))return false;
    this.claimTutorialReward();this.tutorial.status='skipped';
    if(this.phase==='wave')this.activateMapEvent();
    return true;
  }
  startWave() {
    if (this.phase !== 'prep' || this.paused || this.wave >= MAX_WAVES||this.tutorial?.reward) return false;
    this.wave++; this.phase = 'wave'; this.waveTime = 0; this.spawnTimer = .8;
    const roster=STAGE_ROSTERS[this.wave-1],count=5+this.wave*3;
    this.spawnQueue=roster?[...roster]:Array.from({length:count},(_,i)=>this.wave>=2&&i%5===3?'brute':this.wave>=3&&i%5===1?'spitter':'raptor');
    this.setupObjective();if(!tutorialProtected(this))this.activateMapEvent();this.event('wave', { wave: this.wave,objective:this.objective.type }); return true;
  }
  createBossWeakpoint(boss,hpScale=1){
    const def=BOSS_WEAKPOINTS[boss.type],maxHp=Math.round(def.hp*hpScale),weakpoint={id:this.nextId++,bossId:boss.id,kind:def.kind,name:def.name,x:boss.x,y:boss.y-boss.r*.45,r:def.radius,hp:maxHp,maxHp,open:false,openTime:0,broken:false};
    this.syncBossWeakpoint(boss,0,weakpoint);return weakpoint;
  }
  syncBossWeakpoint(boss,dt=0,override){
    const w=override||boss.weakpoint;if(!w)return;
    if(!w.broken&&w.openTime>0){w.openTime=Math.max(0,w.openTime-dt);if(w.openTime<=0)w.open=false;}
    if(w.broken){w.open=false;w.openTime=0;}
    const a=boss.angle||0,forward=boss.type==='charger'?boss.r*.38:boss.type==='matriarch'?boss.r*.18:0,side=boss.type==='charger'?-boss.r*.46:boss.type==='matriarch'?boss.r*.32:0,lift=boss.type==='boss'?boss.r*.42:boss.r*.35;
    w.x=boss.x+Math.cos(a)*forward+Math.cos(a+Math.PI/2)*side;w.y=boss.y+Math.sin(a)*forward+Math.sin(a+Math.PI/2)*side-lift;
  }
  bossWeakpoints(){return this.enemies.filter(enemy=>enemy.hp>0&&enemy.weakpoint?.open&&!enemy.weakpoint.broken&&enemy.weakpoint.hp>0).map(enemy=>enemy.weakpoint);}
  openBossWeakpoint(boss,duration,message){
    const w=boss.weakpoint;if(!w||w.broken||w.hp<=0)return false;const wasOpen=w.open;w.open=true;w.openTime=Math.max(w.openTime,duration);this.syncBossWeakpoint(boss);
    if(!wasOpen)this.event('notice',{message:message||`${w.name}已暴露 · 集火可打斷首領能力`});return true;
  }
  hitBossWeakpoint(w,damage){
    const boss=this.enemies.find(enemy=>enemy.id===w?.bossId&&enemy.hp>0);if(!boss||boss.weakpoint!==w||!w.open||w.broken||w.hp<=0)return false;
    const before=w.hp,def=BOSS_WEAKPOINTS[boss.type];w.hp=Math.max(0,w.hp-damage);this.stats.damage+=Math.min(before,damage);this.float(w.x,w.y-w.r,String(Math.round(damage)),def.color);this.effects.push({kind:'spark',x:w.x,y:w.y,r:w.r+11,color:def.color,life:.36,maxLife:.36});
    if(w.hp<=0){
      w.broken=true;w.open=false;w.openTime=0;boss.windup=0;boss.cd=Math.max(boss.cd,3.2);const bonus=boss.maxHp*def.bonus;this.hitEnemy(boss,bonus,def.color);
      if(boss.type==='matriarch')boss.summonSuppressed=true;
      else if(boss.type==='charger'){boss.speed=Math.max(22,boss.speed-9);boss.damage*=.72;}
      else boss.damage*=.82;
      this.effects.push({kind:'burst',x:w.x,y:w.y,r:92,color:def.color,life:.75,maxLife:.75});this.event('weakpoint-broken',{boss:boss.type,name:def.name,bonus});this.event('notice',{message:`${def.name}已破壞 · 首領能力被削弱`});
    }
    return true;
  }
  summonBossAdds(boss,types){
    if(!boss||boss.hp<=0)return[];const spawned=[];
    for(const [index,type] of types.entries()){const angle=boss.angle+Math.PI*2*index/types.length+.65,range=boss.r+54+(index%2)*18;spawned.push(this.spawnEnemy(type,{x:clamp(boss.x+Math.cos(angle)*range,45,675),y:clamp(boss.y+Math.sin(angle)*range,72,748)}));}
    return spawned;
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
    const e = { id: this.nextId++, type, x: p.x, y: p.y, r: values.radius, hp, maxHp: hp, speed: values.speed*stage.speed, damage: values.damage*stage.damage, cd: .9, windup: 0, burn: 0, slow: 0, flash: 0, angle: 0, bossPhase:0,attackCount:0,attackKind:'' };
    if(BOSS_WEAKPOINTS[type])e.weakpoint=this.createBossWeakpoint(e,stage.hp);
    this.enemies.push(e); this.effects.push({ kind: 'spawn', x: e.x, y: e.y, life: .7, maxLife: .7, r: e.r + 15, color: '#f2ab85' }); return e;
  }
  attack(aim) {
    if(mandatoryTutorial(this)&&!['attack','reward'].includes(this.tutorial.step))return false;
    if(tutorialWaiting(this))return false;
    const h = this.hero;
    if (this.paused || !['prep', 'wave'].includes(this.phase) || h.attackCD > 0 || h.dashTime > 0) return false;
    let target = aim;
    if (!target) {
      const liveEnemies = this.enemies.filter(e => e.hp > 0);
      const weakpoints=this.bossWeakpoints(),objectives=this.attackableObjectives(),nearby=objectives.filter(entry=>distance(h,entry)<=190),ore=this.objective?.type==='mining'?this.nodes.filter(node=>node.hp>0&&node.objectiveKind==='ore'&&distance(h,node)<=190):[];
      const candidates = weakpoints.length?weakpoints:ore.length?ore:nearby.length?nearby:liveEnemies.length ? liveEnemies : objectives.length?objectives:this.nodes.filter(n => n.hp > 0);
      target = candidates.reduce((best, e) => !best || distance(h, e) < distance(h, best) ? e : best, null);
    }
    if (target && distance(h, target) > 1) h.angle = Math.atan2(target.y - h.y, target.x - h.x);
    h.swing=.2;h.weaponChain=(h.weaponChain||0)+1;
    const targets=()=>[...this.enemies,...this.bossWeakpoints(),...this.attackableObjectives(),...this.nodes];
    const hit=(entry,damage,color)=>entry.type?this.hitEnemy(entry,damage,color,'hero'):entry.bossId?this.hitBossWeakpoint(entry,damage):entry.objectiveKind==='nest'?this.hitObjective(entry,damage):this.hitNode(entry,damage);
    const slash=(range,spread,damage,color='#f5ddac',angle=h.angle,knockback=0)=>{
      for(const entry of targets()){
        if(entry.hp<=0||distance(h,entry)>range+entry.r)continue;
        const direction=Math.atan2(entry.y-h.y,entry.x-h.x),difference=Math.abs(Math.atan2(Math.sin(direction-angle),Math.cos(direction-angle)));
        if(difference>spread)continue;hit(entry,damage,color);
        if(knockback>0&&entry.type&&!BOSS_WEAKPOINTS[entry.type]&&!tutorialProtected(this)){const d=distance(h,entry)||1;entry.x=clamp(entry.x+(entry.x-h.x)/d*knockback,43,WORLD.width-43);entry.y=clamp(entry.y+(entry.y-h.y)/d*knockback,70,WORLD.height-55);entry.slow=Math.max(entry.slow,.7);}
      }
      this.effects.push({kind:'slash',x:h.x,y:h.y,angle,spread,r:range,life:.22,maxLife:.22,color});
    };
    const shoot=(kind,angle,speed,damage,life,pierce,hitRadius)=>this.projectiles.push({id:this.nextId++,kind,source:'hero',x:h.x+Math.cos(angle)*20,y:h.y+Math.sin(angle)*20,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage,life,fire:false,hits:[],pierce,hostile:false,...(hitRadius?{hitRadius}:{}),targetWeakpointId:target?.bossId?target.id:0});
    if(h.weapon==='spear'){
      h.attackCD=.44;const split=this.mods.spearFork&&h.weaponChain%3===0;
      for(const spread of split?[-.17,0,.17]:[0])shoot('spear',h.angle+spread,530,23*this.mods.spear,1.2,this.mods.pierce+1);
      if(split)this.effects.push({kind:'burst',x:h.x,y:h.y,r:44,color:'#f3d897',life:.3,maxLife:.3});
    }else if(h.weapon==='bow'){
      h.attackCD=.32;const volley=this.mods.bowVolley&&h.weaponChain%3===0;
      for(const spread of volley?[-.14,0,.14]:[0])shoot('arrow',h.angle+spread,650,14*this.mods.bow,1.08,1);
      if(volley)this.effects.push({kind:'muzzle',x:h.x,y:h.y,angle:h.angle,r:24,color:'#d7edba',life:.16,maxLife:.16});
    }else if(h.weapon==='blades'){
      h.attackCD=.3;const rush=this.mods.bladeRush&&h.weaponChain%4===0;
      if(rush){const step=target?Math.min(58,Math.max(0,distance(h,target)-24)):50;h.x=clamp(h.x+Math.cos(h.angle)*step,43,WORLD.width-43);h.y=clamp(h.y+Math.sin(h.angle)*step,70,WORLD.height-55);h.invulnerable=Math.max(h.invulnerable,.2);slash(106,Math.PI,17*this.mods.blades,'#dcefc6');slash(106,Math.PI,17*this.mods.blades,'#f2d89d',h.angle+Math.PI);this.effects.push({kind:'trail',x:h.x-Math.cos(h.angle)*step/2,y:h.y-Math.sin(h.angle)*step/2,angle:h.angle,r:24,color:'#c5e5c4',life:.25,maxLife:.25});}
      else{slash(90,.72,14*this.mods.blades,'#e6edc8',h.angle-.15);slash(94,.72,14*this.mods.blades,'#f4d7a0',h.angle+.15);}
    }else if(h.weapon==='hammer'){
      h.attackCD=.82;slash(128,.82,48*this.mods.hammer,'#f1ca83',h.angle,42);
      this.effects.push({kind:'ring',x:h.x+Math.cos(h.angle)*58,y:h.y+Math.sin(h.angle)*58,r:72,color:'#e4b96d',life:.38,maxLife:.38});
      if(this.mods.hammerQuake)shoot('quake-wave',h.angle,310,30*this.mods.hammer,.72,8,34);
    }else{
      h.attackCD=.52;const spread=this.mods.spin?Math.PI:Math.PI*.55;slash(100,spread,40*this.mods.axe);
    }
    this.event('attack'); return true;
  }
  autoAttack(){
    if(tutorialWaiting(this)||tutorialProtected(this)&&this.tutorial.version===2&&this.tutorial.step!=='attack')return false;
    if(tutorialProtected(this)&&(this.tutorial.step==='move'||this.tutorial.step==='attack'&&this.tutorial.elapsed<2))return false;
    if(this.paused||!['prep','wave'].includes(this.phase)||this.hero.dashTime>0)return false;
    const enemies=this.enemies.filter(e=>e.hp>0),weakpoints=this.bossWeakpoints(),objectives=this.attackableObjectives(),nearbyObjectives=objectives.filter(entry=>distance(this.hero,entry)<=190),ore=this.objective?.type==='mining'?this.nodes.filter(node=>node.hp>0&&node.objectiveKind==='ore'&&distance(this.hero,node)<=190):[],targets=weakpoints.length?weakpoints:ore.length?ore:nearbyObjectives.length?nearbyObjectives:enemies.length?enemies:objectives.length?objectives:this.nodes.filter(n=>n.hp>0);
    const target=targets.sort((a,b)=>distance(this.hero,a)-distance(this.hero,b))[0];
    if(!target)return false;
    // Crystals require walking into a modest harvesting radius; enemies may be
    // engaged across the arena so combat never needs a basic-attack button.
    const weapon=WEAPONS[this.hero.weapon]||WEAPONS.spear,rangedTarget=target.type||target.bossId||target.objectiveKind==='nest';
    const range=weapon.ranged?(rangedTarget?weapon.range:190):weapon.range+target.r;
    const fired=distance(this.hero,target)<=range?this.attack(target):false;
    if(fired&&target.type&&this.tutorial?.version!==2)this.advanceTutorial('attack');return fired;
  }
  castSkill(id){
    if(mandatoryTutorial(this)&&this.tutorial.step!=='skill')return false;
    if(tutorialWaiting(this)||tutorialProtected(this)&&this.tutorial.version===2&&(this.tutorial.step!=='skill'||id!==this.loadout.skills[0]))return false;
    if(tutorialProtected(this)&&!['skill','build'].includes(this.tutorial.step))return false;
    const h=this.hero,skill=ACTIVE_SKILLS[id];
    if(!skill||!this.carriesSkill(id)||this.paused||this.phase!=='wave'||h.dashTime>0)return false;
    const key=id==='volley'?'volleyCD':'shockCD';if(h[key]>0)return false;
    const live=this.enemies.filter(e=>e.hp>0);if(!live.length)return false;
    if(id==='volley'){
      const target=live.sort((a,b)=>distance(h,a)-distance(h,b))[0];
      h.angle=Math.atan2(target.y-h.y,target.x-h.x);h.swing=.28;h[key]=skill.cooldown;
      const arrows=Math.max(5,Math.floor(this.mods.volleyArrows)),spacing=.12;
      for(let i=0;i<arrows;i++){
        const spread=(i-(arrows-1)/2)*spacing;
        const angle=h.angle+spread;
        this.projectiles.push({id:this.nextId++,kind:'skill-bolt',x:h.x+Math.cos(angle)*24,y:h.y+Math.sin(angle)*24,vx:Math.cos(angle)*560,vy:Math.sin(angle)*560,damage:26*this.mods.spear,life:1.15,fire:false,hits:[],pierce:2+this.mods.pierce+this.mods.volleyPierce,hostile:false});
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
      if(this.mods.shockFieldDuration>0)this.projectiles.push({id:this.nextId++,kind:'shock-field',x:h.x,y:h.y,vx:0,vy:0,damage:this.mods.shockFieldDamage,life:this.mods.shockFieldDuration,maxLife:this.mods.shockFieldDuration,radius:this.mods.shockFieldRadius,tickCD:.85,fire:false,hits:[],pierce:999,hostile:false});
    }
    // Let the volley/impact visibly play before holding the success card.
    if(tutorialActive(this)&&this.tutorial.version===2&&this.tutorial.step==='skill'){this.tutorial.skillCast=true;this.tutorial.elapsed=0;}
    else this.advanceTutorial('skill');
    this.event('skill',{skill:id,name:skill.name});return true;
  }
  dash(input = {}) {
    if(mandatoryTutorial(this))return false;
    if(tutorialProtected(this)&&this.tutorial.version===2)return false;
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
    if(mandatoryTutorial(this))return false;
    if (this.paused || !['prep', 'wave'].includes(this.phase)||this.loadout?.weapons.length<2) return false;
    const weapons=this.loadout.weapons,index=Math.max(0,weapons.indexOf(this.hero.weapon));this.hero.weapon=weapons[(index+1)%weapons.length];this.hero.weaponChain=0;
    this.event('weapon', { weapon: this.hero.weapon });return true;
  }
  heal(amount) { this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + amount); }
  hitNode(n, damage) {
    if (n.hp <= 0) return; n.hp=Math.max(0,n.hp-damage);
    this.effects.push({ kind: 'spark', x: n.x, y: n.y, life: .35, maxLife: .35, r: 20, color: '#edc778' });
    if (n.hp <= 0) {
      this.amber = Math.min(99, this.amber + 3); this.stats.harvested++; this.float(n.x, n.y - 15, '+3 ◆', '#ffe3a1'); this.event('collect');
      if(n.objectiveKind==='ore'&&this.objective?.type==='mining'&&this.objective.nodeIds.includes(n.id)){
        this.objective.mined=Math.min(this.objective.required,this.objective.mined+1);const status=this.objectiveStatus();
        this.effects.push({kind:'burst',x:n.x,y:n.y,r:68,color:'#f0ce70',life:.6,maxLife:.6});this.event('notice',{message:`熔晶採集完成 · ${status.text}`});
      }
    }
  }
  hitEnemy(e, damage, color = '#f7e8bd', source = '') {
    if (e.hp <= 0) return;
    if(tutorialProtected(this))damage=Math.min(damage,Math.max(0,e.hp-1));
    this.stats.damage += Math.min(e.hp, damage); e.hp -= damage; e.flash = .12;
    if(source==='hero'&&damage>0&&tutorialActive(this)&&this.tutorial.version===2&&this.tutorial.step==='attack'&&!this.tutorial.awaiting){
      this.tutorial.attackHits=Math.min(2,this.tutorial.attackHits+1);
      if(this.tutorial.attackHits===2)this.advanceTutorial('attack');
    }
    if (damage > 5) this.float(e.x, e.y - e.r, String(Math.round(damage)), color);
    if (e.hp <= 0) {
      this.stats.kills++;const loot=ENEMY_BALANCE[e.type];if(!e.elite&&loot.drop>0&&this.rng()<=loot.chance)this.drops.push({x:e.x,y:e.y,value:loot.drop,life:60});
      this.gainCompanionXP(companionKillXP[e.type]||7);
      this.effects.push({kind:'enemy-death',type:e.type,x:e.x,y:e.y,r:e.r,angle:e.angle,life:.42,maxLife:.42,color:'#d5d691'});
      this.effects.push({ kind: 'spark', x: e.x, y: e.y, life: .45, maxLife: .45, r: e.r + 8, color: '#d5d691' }); this.event('kill');
    }
  }
  float(x, y, text, color) { this.effects.push({ kind: 'text', x, y, text, color, life: .65, maxLife: .65 }); }
  burst(x, y, r, damage, color, status) {
    for (const e of this.enemies) if (e.hp > 0 && distance(e, { x, y }) < r + e.r) { this.hitEnemy(e, damage, color); if (status === 'frost') e.slow = 3; }
    for(const weakpoint of this.bossWeakpoints())if(distance(weakpoint,{x,y})<r+weakpoint.r)this.hitBossWeakpoint(weakpoint,damage);
    for(const target of this.attackableObjectives())if(distance(target,{x,y})<r+target.r)this.hitObjective(target,damage);
    this.effects.push({ kind: 'burst', x, y, r, color, life: .48, maxLife: .48 });
  }
  damageTarget(t, amount) {
    if(mandatoryTutorial(this))return;
    if(tutorialProtected(this))return;
    if (!t || t.hp <= 0) return;
    if (t === this.hero) {
      if (t.invulnerable > 0) return;
      amount *= this.mods.armor; t.invulnerable = .65; this.event('hurt');
    }
    // Fortifications are made for holding a line. This reduction applies only
    // to placed buildings; the hunter, egg and hired allies use normal damage.
    if (this.buildings.includes(t)) amount *= FORTIFICATION_BALANCE.incomingDamage;
    if(t===this.companion&&t.type==='stoneback')amount*=.62;
    t.hp = Math.max(0, t.hp - amount); this.float(t.x, t.y - (t.r || 25), `−${Math.round(amount)}`, '#ffb29a');
    this.checkDefeat();
  }
  checkDefeat() {
    if(['lose','win'].includes(this.phase))return;
    if(this.hero.hp<=0){this.failObjective('獵人倒下了');return;}
    if(this.base.hp<=0){this.failObjective('聖獸卵失去了庇護');return;}
    if(this.objective?.type==='escort'&&this.objective.npc.hp<=0){this.failObjective('護送的採集師倒下了');return;}
    if(this.objective?.type==='strongholds'&&this.objective.points.some(point=>point.hp<=0))this.failObjective('月骨據點失守');
  }
  finishWave() {
    if(this.phase!=='wave'||this.stats.waves>=this.wave)return false;
    if(tutorialProtected(this))return false;
    for(const mapEvent of this.activeMapEvents())mapEvent.status='missed';
    const objectiveTitle=this.objectiveDefinition().title;
    const before={...this.materials,amber:this.amber};
    this.stats.waves = this.wave;
    const reward=STAGE_BALANCE[this.wave-1]||STAGE_BALANCE[0];
    const payout={wood:reward.wood,bone:reward.bone,amber:this.drops.reduce((sum,d)=>sum+d.value,0)+reward.amber+this.mods.income};
    if(tutorialActive(this))this.tutorial.reward=payout;
    else{this.materials.wood=Math.min(999,this.materials.wood+payout.wood);this.materials.bone=Math.min(999,this.materials.bone+payout.bone);this.amber=Math.min(99,this.amber+payout.amber);}
    this.drops = []; this.projectiles = [];
    // Only destroyed fortifications disappear. Every survivor keeps its exact
    // position, level and id, then receives a modest field repair before the
    // next stage. This makes a defence line a lasting player investment.
    this.buildings=this.buildings.filter(b=>b.hp>0);
    const survivors=this.buildings.length;
    this.heal(FORTIFICATION_BALANCE.heroRecovery);
    this.base.hp=Math.min(this.base.maxHp,this.base.hp+FORTIFICATION_BALANCE.eggRecovery+this.mods.repair);
    if(this.companion){const revive=this.companion.hp<=0;this.companion.hp=revive?Math.ceil(this.companion.maxHp*.55):Math.min(this.companion.maxHp,this.companion.hp+this.companion.maxHp*.35);if(revive)this.event('notice',{message:`${COMPANIONS[this.companion.type].name}重新振作，回到隊伍`});}
    for(const b of this.buildings)b.hp=Math.min(b.maxHp,b.hp+b.maxHp*FORTIFICATION_BALANCE.betweenStageRepair);
    this.nodes=this.nodes.filter(node=>node.objectiveKind!=='ore');this.objective=null;
    if (this.wave === MAX_WAVES) { this.phase = 'win'; this.event('end', { won: true,objective:objectiveTitle }); return; }
    this.phase = 'prep'; this.building = false;this.choices=[];
    if(this.tutorial?.reward){this.event('tutorial-reward');return true;}
    // The receipt reports what actually entered the pack, including remaining
    // battlefield drops and respecting capacity. Rendering never grants loot.
    this.event('market-ready',{wood:this.materials.wood-before.wood,bone:this.materials.bone-before.bone,amber:this.amber-before.amber,survivors,repair:Math.round(FORTIFICATION_BALANCE.betweenStageRepair*100),objective:objectiveTitle});return true;
  }
  tick(dt, input = {}) {
    if(tutorialWaiting(this))return;
    if(mandatoryTutorial(this))input=this.tutorial.step==='move'?{x:Math.max(0,input.x||0),y:0}:{};
    if(tutorialProtected(this)&&this.tutorial.version===2&&this.tutorial.step!=='move')input={};
    if (!Number.isFinite(dt) || dt <= 0 || this.paused || !['prep', 'wave'].includes(this.phase)) return;
    dt = Math.min(dt, .05);const realDt=dt;this.realTime += dt;
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
    h.x = clamp(h.x, 43, WORLD.width - 43); h.y = clamp(h.y, 70, WORLD.height - 55);
    if(tutorialActive(this)&&this.phase==='wave'){
      const t=this.tutorial;t.elapsed=Math.min(1e8,t.elapsed+dt);
      if(t.step==='move'&&(Math.abs(input.x||0)+Math.abs(input.y||0)>.05)){t.moved=Math.min(64,t.moved+distance(old,h));if(t.version===2?distance(h,t.moveTarget)<24:t.moved>=64)this.advanceTutorial('move');}
    }
    // Combat attacks are automatic. Movement, construction and active skills
    // remain the player's decisions; the nearest in-range enemy is selected.
    this.autoAttack();
    h.x = clamp(h.x, 43, WORLD.width - 43); h.y = clamp(h.y, 70, WORLD.height - 55);
    if(!tutorialProtected(this)||this.tutorial.version!==2){this.updateBuildings(dt);this.updateAllies(dt);this.updateCompanion(dt);}this.updateProjectiles(dt);
    if(tutorialActive(this)&&this.tutorial.version===2&&this.tutorial.step==='skill'&&this.tutorial.skillCast&&this.tutorial.elapsed>=.65)this.advanceTutorial('skill');
    if (this.phase === 'wave') {
      this.waveTime += dt;this.updateObjective(this.objective?.type==='mining'?realDt:dt);
      if(this.phase!=='wave')return;
      if(!tutorialProtected(this)){
        this.spawnTimer -= dt;
        if (this.spawnQueue.length && this.spawnTimer <= 0) { this.spawnEnemy(this.spawnQueue.shift()); this.spawnTimer=STAGE_BALANCE[this.wave-1]?.spawn||1; }
      }
      for (const e of this.enemies) if (e.hp > 0 && this.phase === 'wave') this.updateEnemy(e, dt);
      this.enemies = this.enemies.filter(e => e.hp > 0);
      this.updateMapEvents();
      if (!this.spawnQueue.length && !this.enemies.length && this.phase === 'wave'&&this.objectiveReady()){this.completeObjective();this.finishWave();}
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
  updateCompanion(dt){
    const p=this.companion;if(!p||p.hp<=0)return;const d=COMPANIONS[p.type];
    p.cd=Math.max(0,p.cd-dt);p.abilityCD=Math.max(0,p.abilityCD-dt);
    const live=this.enemies.filter(e=>e.hp>0),target=live.sort((a,b)=>distance(p,a)-distance(p,b))[0];
    const side=Math.cos(this.hero.angle)>=0?-1:1,follow={x:clamp(this.hero.x+side*46,48,672),y:clamp(this.hero.y+38,82,740)};
    const canEngage=target&&distance(this.hero,target)<345,dest=canEngage?target:follow,dist=distance(p,dest),reach=canEngage?d.range:17;
    p.angle=Math.atan2(dest.y-p.y,dest.x-p.x);
    if(dist>reach){const step=Math.min(dist-reach,d.speed*dt);p.x=clamp(p.x+Math.cos(p.angle)*step,43,WORLD.width-43);p.y=clamp(p.y+Math.sin(p.angle)*step,70,WORLD.height-55);}
    if(p.type==='tideroot'&&p.abilityCD<=0&&(this.hero.hp<this.hero.maxHp||this.base.hp<this.base.maxHp)){
      const amount=5+p.level*2;this.heal(amount);this.base.hp=Math.min(this.base.maxHp,this.base.hp+Math.ceil(amount*.7));
      this.float(this.hero.x,this.hero.y-31,`+${amount} ♥`,'#9ce8db');this.effects.push({kind:'burst',x:p.x,y:p.y,r:88,color:d.color,life:.55,maxLife:.55});p.abilityCD=Math.max(5.2,7.4-p.level*.18);this.event('companion-skill',{name:'潮息治療'});
    }
    if(!canEngage||dist>reach||p.cd>0)return;
    const levelScale=1+(p.level-1)*.11;p.attackCount++;
    if(p.type==='tideroot'){
      const speed=360;this.projectiles.push({id:this.nextId++,kind:'companion-tide',x:p.x,y:p.y-6,vx:Math.cos(p.angle)*speed,vy:Math.sin(p.angle)*speed,damage:d.damage*levelScale,life:1.1,fire:false,hits:[],pierce:1,hostile:false});
    }else if(p.type==='emberclaw'){
      this.hitEnemy(target,d.damage*levelScale,d.color);this.effects.push({kind:'slash',x:p.x,y:p.y,r:44,spread:1.55,angle:p.angle,life:.17,maxLife:.17,color:d.color});
      if(p.attackCount%4===0){for(const e of live)if(e.hp>0&&distance(p,e)<82+e.r){this.hitEnemy(e,(12+p.level*2)*levelScale,'#ffc06c');e.burn=Math.max(e.burn,2.5);}this.effects.push({kind:'burst',x:p.x,y:p.y,r:82,color:d.color,life:.45,maxLife:.45});this.event('companion-skill',{name:'焰爪爆發'});}
    }else{
      this.hitEnemy(target,d.damage*levelScale,d.color);this.effects.push({kind:'slash',x:p.x,y:p.y,r:54,spread:1.7,angle:p.angle,life:.2,maxLife:.2,color:d.color});
      if(p.attackCount%3===0){for(const e of live)if(e.hp>0&&distance(p,e)<92+e.r){this.hitEnemy(e,(10+p.level*2)*levelScale,'#ead18b');e.slow=Math.max(e.slow,1.25);}this.effects.push({kind:'burst',x:p.x,y:p.y,r:94,color:d.color,life:.48,maxLife:.48});this.event('companion-skill',{name:'晶甲震波'});}
    }
    p.cd=Math.max(.38,d.cooldown-p.level*.025);
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
      if(p.kind==='shock-field'){
        p.life=Math.max(0,p.life-dt);p.tickCD-=dt;
        const inside=this.enemies.filter(e=>e.hp>0&&distance(p,e)<p.radius+e.r);
        for(const e of inside)e.slow=Math.max(e.slow,.3);
        if(p.damage>0&&p.tickCD<=0){for(const e of inside)this.hitEnemy(e,p.damage,'#a7ded0');p.tickCD=1;this.effects.push({kind:'ring',x:p.x,y:p.y,r:p.radius,color:'#9cd8c0',life:.35,maxLife:.35});}
        continue;
      }
      if(p.kind==='catapult'){
        p.life=Math.max(0,p.life-dt);const progress=clamp(1-p.life/p.maxLife,0,1);
        p.x=p.startX+(p.targetX-p.startX)*progress;p.y=p.startY+(p.targetY-p.startY)*progress;
        if(p.life<=0)this.burst(p.targetX,p.targetY,p.radius,p.damage,'#f0b34f','frost');
        continue;
      }
      const from = { x: p.x, y: p.y }; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.hostile) {
        // The projectile follows the telegraphed shot; it never homes after release.
        const defenders=this.combatDefenders();
        const t = defenders.find(t => t.hp > 0 && pointToSegment(t, from, p) < t.r + 6);
        if (t) { this.damageTarget(t, p.damage); p.life = 0; } continue;
      }
      if (!p.fire && this.buildings.some(b => b.type === 'torch' && b.hp > 0 && pointToSegment(b, from, p) < 50 + b.level * 4)) {
        p.fire = true; this.stats.combos++; this.event('ignite');
      }
      for(const weakpoint of this.bossWeakpoints()){
        if(p.life<=0||p.hits.includes(weakpoint.id)||pointToSegment(weakpoint,from,p)>weakpoint.r+(p.hitRadius||8))continue;
        p.hits.push(weakpoint.id);this.hitBossWeakpoint(weakpoint,p.damage*(p.fire?1.35:1));if(--p.pierce<=0)p.life=0;
      }
      for (const e of this.enemies) {
        if (p.life <= 0 || e.hp <= 0 || p.hits.includes(e.id) || (p.targetWeakpointId>0&&p.targetWeakpointId===e.weakpoint?.id&&!p.hits.includes(p.targetWeakpointId)) || pointToSegment(e, from, p) > e.r + (p.hitRadius||7)) continue;
        p.hits.push(e.id); this.hitEnemy(e, p.damage * (p.fire ? 1.35 : 1), p.kind==='companion-tide'?'#8ee3df':p.fire ? '#ffca77' : '#faf0cb',p.source);
        if(p.kind==='companion-tide')e.slow=Math.max(e.slow,1.5);
        if (p.fire) e.burn = 3;
        if (--p.pierce <= 0) p.life = 0;
      }
      for(const target of this.attackableObjectives())if(p.life>0&&!p.hits.includes(target.id)&&pointToSegment(target,from,p)<target.r+(p.hitRadius||7)){p.hits.push(target.id);this.hitObjective(target,p.damage*(p.fire?1.35:1));if(--p.pierce<=0)p.life=0;}
      for (const n of this.nodes) if (p.life > 0 && n.hp > 0 && !p.hits.includes(n.id) && pointToSegment(n, from, p) < n.r + (p.hitRadius||5)) { p.hits.push(n.id); this.hitNode(n, p.damage);if(p.kind!=='quake-wave'||--p.pierce<=0)p.life=0; }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -30 && p.x < WORLD.width + 30 && p.y > -30 && p.y < WORLD.height + 30);
  }
  advanceBossPhase(e){
    const ratio=e.hp/e.maxHp;
    if(e.type==='matriarch'){
      if(e.bossPhase===0&&ratio<=.7){e.bossPhase=1;e.speed+=3;this.summonBossAdds(e,['raptor','raptor','spitter']);this.openBossWeakpoint(e,8,'母獸孵化囊暴露 · 破壞後可阻止下一輪巢群');this.effects.push({kind:'burst',x:e.x,y:e.y,r:108,color:'#b7d575',life:.7,maxLife:.7});this.event('notice',{message:'沼澤母獸進入繁殖狂潮 · 幼獸與毒液獸加入'});}
      else if(e.bossPhase===1&&ratio<=.35){e.bossPhase=2;e.speed+=3;e.damage+=4;if(!e.summonSuppressed)this.summonBossAdds(e,['raptor','spitter','raptor','brute']);this.openBossWeakpoint(e,999,'母獸孵化囊完全暴露 · 摧毀可打斷終末孵化');this.effects.push({kind:'burst',x:e.x,y:e.y,r:132,color:'#d2e985',life:.75,maxLife:.75});this.event('notice',{message:e.summonSuppressed?'孵化囊已破壞 · 終末召喚被阻止':'母獸進入終末孵化 · 巢群全面湧出'});}
    }else if(e.type==='charger'){
      if(e.bossPhase===0&&ratio<=.68){e.bossPhase=1;e.speed+=7;e.damage+=4;this.summonBossAdds(e,['raptor','raptor']);this.openBossWeakpoint(e,4.5,'衝角獸裂角肩甲鬆動 · 趁現在破甲');this.effects.push({kind:'burst',x:e.x,y:e.y,r:118,color:'#efad66',life:.7,maxLife:.7});this.event('notice',{message:'骨甲衝角獸進入裂甲衝鋒 · 迅猛獸加入夾擊'});}
      else if(e.bossPhase===1&&ratio<=.32){e.bossPhase=2;e.speed+=5;e.damage+=4;this.summonBossAdds(e,['brute','raptor','raptor']);this.openBossWeakpoint(e,5.5,'裂角肩甲再次暴露 · 破壞可削弱所有衝鋒');this.effects.push({kind:'burst',x:e.x,y:e.y,r:142,color:'#f3c078',life:.75,maxLife:.75});this.event('notice',{message:'衝角獸進入碎骨狂飆 · 衝鋒距離與頻率提升'});}
    }else if(e.type==='boss'){
      if(e.bossPhase===0&&ratio<=.7){e.bossPhase=1;e.speed+=3;e.damage+=3;this.summonBossAdds(e,['spitter','spitter','raptor']);this.openBossWeakpoint(e,4.5,'泰坦琥珀核心暴露 · 可打斷下一次震地');this.effects.push({kind:'burst',x:e.x,y:e.y,r:142,color:'#f1a056',life:.75,maxLife:.75});this.event('notice',{message:'琥珀泰坦進入共鳴階段 · 毒液獸受召而來'});}
      else if(e.bossPhase===1&&ratio<=.35){e.bossPhase=2;e.speed+=3;e.damage+=4;this.summonBossAdds(e,['brute','brute','spitter']);this.openBossWeakpoint(e,999,'泰坦核心過載 · 摧毀可取消雙重震地');this.effects.push({kind:'burst',x:e.x,y:e.y,r:176,color:'#ffc160',life:.8,maxLife:.8});this.event('notice',{message:'琥珀泰坦核心過載 · 震地擴展為內外雙環'});}
    }
  }
  prepareEnemyAttack(e,target){
    e.attackCount=(e.attackCount||0)+1;e.lockX=target.x;e.lockY=target.y;e.targetId=target.id;
    if(e.type==='matriarch'){e.attackKind=e.bossPhase>=1&&e.attackCount%2===0?'brood-pool':'venom-fan';e.windup=e.attackKind==='brood-pool'?1.25:.9;if(e.attackKind==='brood-pool')this.openBossWeakpoint(e,3.2,'母獸蓄積毒沼 · 孵化囊短暫暴露');}
    else if(e.type==='charger'){e.attackKind='bone-charge';e.windup=e.bossPhase===2?.72:e.bossPhase===1?.86:1;}
    else if(e.type==='boss'){e.attackKind=e.bossPhase===2?'titan-double':'titan-slam';e.windup=e.bossPhase===2?1.3:1.1;this.openBossWeakpoint(e,2.8,'泰坦正在聚能 · 攻擊琥珀核心可打斷震地');}
    else {e.attackKind=e.type==='spitter'?'spit':'melee';e.windup=e.type==='spitter'?.6:.6;}
  }
  resolveEnemyAttack(e){
    if(e.type==='spitter'){
      const angle=Math.atan2(e.lockY-e.y,e.lockX-e.x);this.projectiles.push({id:this.nextId++,x:e.x,y:e.y,vx:Math.cos(angle)*195,vy:Math.sin(angle)*195,damage:e.damage,life:2.5,hostile:true});
    }else if(e.type==='matriarch'){
      if(e.attackKind==='brood-pool'){
        const radius=e.bossPhase===2?118:94;for(const t of this.combatDefenders())if(t.hp>0&&distance(t,{x:e.lockX,y:e.lockY})<radius+t.r)this.damageTarget(t,e.damage*.9);
        this.effects.push({kind:'burst',x:e.lockX,y:e.lockY,r:radius,color:'#b8d66c',life:.65,maxLife:.65});
      }else{const angle=Math.atan2(e.lockY-e.y,e.lockX-e.x),spreads=e.bossPhase===2?[-.3,-.15,0,.15,.3]:[-.18,0,.18];for(const spread of spreads)this.projectiles.push({id:this.nextId++,kind:'venom',x:e.x,y:e.y,vx:Math.cos(angle+spread)*220,vy:Math.sin(angle+spread)*220,damage:e.damage*.8,life:2.2,hostile:true});this.effects.push({kind:'burst',x:e.x+Math.cos(angle)*26,y:e.y+Math.sin(angle)*26,r:31,color:'#b8d66c',life:.35,maxLife:.35});}
    }else if(e.type==='charger'){
      const from={x:e.x,y:e.y},angle=Math.atan2(e.lockY-e.y,e.lockX-e.x),cap=e.bossPhase===2?330:e.bossPhase===1?285:245,length=Math.min(cap,Math.hypot(e.lockX-e.x,e.lockY-e.y)+55);
      e.x=clamp(e.x+Math.cos(angle)*length,43,WORLD.width-43);e.y=clamp(e.y+Math.sin(angle)*length,70,WORLD.height-55);for(const t of this.combatDefenders())if(t.hp>0&&pointToSegment(t,from,e)<t.r+e.r*(e.bossPhase===2?.72:.58))this.damageTarget(t,e.damage);
      this.syncBossWeakpoint(e);this.openBossWeakpoint(e,3.4,'衝鋒結束 · 裂角肩甲暴露 3 秒');this.effects.push({kind:'trail',x:(from.x+e.x)/2,y:(from.y+e.y)/2,angle,r:e.bossPhase===2?47:36,color:'#efb06f',life:.45,maxLife:.45});this.effects.push({kind:'burst',x:e.x,y:e.y,r:68,color:'#ef9b65',life:.45,maxLife:.45});
    }else if(e.type==='boss'){
      const inner=e.bossPhase===0?84:e.bossPhase===1?108:122,outer=e.bossPhase===2?176:inner,center={x:e.lockX,y:e.lockY};for(const t of this.combatDefenders()){if(t.hp<=0)continue;const d=distance(t,center);if(d<inner+t.r)this.damageTarget(t,e.damage);else if(e.bossPhase===2&&d<outer+t.r)this.damageTarget(t,e.damage*.55);}
      this.effects.push({kind:'burst',x:e.lockX,y:e.lockY,r:inner,color:'#ef9971',life:.55,maxLife:.55});if(e.bossPhase===2)this.effects.push({kind:'ring',x:e.lockX,y:e.lockY,r:outer,color:'#ffc66f',life:.7,maxLife:.7});
    }else{const target=this.combatDefenders().find(t=>t.id===e.targetId&&t.hp>0);if(target&&distance(target,{x:e.lockX,y:e.lockY})<target.r+25)this.damageTarget(target,e.damage);}
    e.cd=e.type==='boss'?(e.bossPhase===2?1.55:e.bossPhase===1?1.8:2.2):e.type==='charger'?(e.bossPhase===2?1.5:e.bossPhase===1?1.8:2.4):e.type==='matriarch'?(e.bossPhase===2?1.65:2.15):1.2;
  }
  updateEnemy(e, dt) {
    if(tutorialProtected(this)&&this.tutorial.version===2){e.flash=Math.max(0,e.flash-dt);return;}
    if(!Number.isInteger(e.bossPhase))e.bossPhase=0;
    if(!Number.isInteger(e.attackCount))e.attackCount=0;if(typeof e.attackKind!=='string')e.attackKind='';this.syncBossWeakpoint(e,dt);
    e.flash = Math.max(0, e.flash - dt); e.slow = Math.max(0, e.slow - dt); e.cd -= dt;
    if (e.burn > 0) { e.burn -= dt; this.hitEnemy(e, 7 * this.mods.fire * dt, '#ffc075'); if (e.hp <= 0) return; }
    if(BOSS_WEAKPOINTS[e.type])this.advanceBossPhase(e);
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0)this.resolveEnemyAttack(e);
      return;
    }
    let target=[this.base,...this.objectiveDefenders()].filter(candidate=>candidate.hp>0).sort((a,b)=>distance(e,a)-distance(e,b))[0]||this.base;
    // Bosses are hero duels. Giving them global hero aggro prevents the
    // counter-intuitive case where kiting away from the egg makes them turn
    // around and delete the objective off-screen.
    const heroAggro=e.elite||['matriarch','charger','boss'].includes(e.type)?999:e.type==='raptor'?165:125;
    if (distance(e, this.hero) < heroAggro) target = this.hero;
    for (const b of [...this.buildings,...this.allies,...(this.companion?[this.companion]:[])]) if (b.hp > 0 && distance(e, b) < distance(e, target) && distance(e, b) < (b.type==='stoneback'?235:170)) target = b;
    const d = distance(e, target), reach=e.type==='matriarch'?220:e.type==='charger'?245:e.type==='spitter'?185:e.type==='boss'?135:e.r+target.r+10;
    e.angle = Math.atan2(target.y - e.y, target.x - e.x);
    if (d <= reach) {
      if (e.cd <= 0)this.prepareEnemyAttack(e,target);
    } else {
      const move = e.speed * (e.slow > 0 ? .42 : 1) * dt;
      e.x += Math.cos(e.angle) * move; e.y += Math.sin(e.angle) * move;
      for (const other of this.enemies) {
        if (other === e || other.hp <= 0) continue;
        const dist = distance(e, other), limit = (e.r + other.r) * .75;
        if (dist < limit && dist > .1) { const push = Math.min(20 * dt, limit - dist); e.x += (e.x - other.x) / dist * push; e.y += (e.y - other.y) / dist * push; }
      }
    }
    this.syncBossWeakpoint(e);
  }
}
