import { Expedition, MAX_WAVES, UPGRADES, WEAPONS, normalizeLoadout } from './engine.mjs';

export const CAMP_PRODUCTION=Object.freeze({
  tent:Object.freeze({resource:'wood',name:'木材',icon:'▰',per:'每完成 2 關'}),
  forge:Object.freeze({resource:'bone',name:'獸骨',icon:'✧',per:'每完成 3 關'}),
  cache:Object.freeze({resource:'amber',name:'琥珀',icon:'◆',per:'每完成 4 關'}),
  nursery:Object.freeze({resource:'warmth',name:'孵化熱度',icon:'♨',per:'每完成 3 關'})
});
export const CAMP_TASKS=Object.freeze({
  porter:Object.freeze({name:'搬運工阿拓',title:'營地整備',detail:'建造或升級 1 次永久設施。',reward:Object.freeze({wood:3,amber:1,stones:1})}),
  hunter:Object.freeze({name:'巡林獵人瑟雅',title:'獸群懸賞',detail:'在遠征中累計擊敗指定數量的敵人。',reward:Object.freeze({bone:4,amber:2,stones:1})})
});
export const HATCH_REQUIREMENTS=Object.freeze({
  emberclaw:Object.freeze({nursery:0,warmth:0,label:'初始聖獸卵'}),
  tideroot:Object.freeze({nursery:1,warmth:3,label:'需要 1 級獸卵溫室'}),
  stoneback:Object.freeze({nursery:2,warmth:5,label:'需要 2 級獸卵溫室'})
});
const lockedGoods=Object.freeze({bow:['forge',1],blades:['forge',2],hammer:['forge',3],armor:['tent',1],heart:['tent',2],dash:['tent',3],builder:['cache',1],loot:['cache',2],repair:['cache',3]});
const facilityLevel=(camp,type)=>camp.buildings.find(building=>building.type===type)?.level||0;
export function ensureCampProgress(camp){
  if(!camp.stockpile)camp.stockpile={wood:0,bone:0,amber:0,warmth:0};
  if(!camp.production)camp.production={tent:0,forge:0,cache:0,nursery:0};
  if(!camp.tasks)camp.tasks={porter:{progress:0,goal:1,ready:false,cycles:0},hunter:{progress:0,goal:20,ready:false,cycles:0}};
  return camp;
}
export function campWeaponUnlocked(camp,weapon){if(['spear','axe'].includes(weapon))return true;return facilityLevel(camp,'forge')>=({bow:1,blades:2,hammer:3}[weapon]||99);}
export function campMerchantUnlocks(camp){return UPGRADES.filter(upgrade=>{const lock=lockedGoods[upgrade.id];return !lock||facilityLevel(camp,lock[0])>=lock[1];}).map(upgrade=>upgrade.id);}
export function hatchPlan(state,type){
  ensureCampProgress(state.camp);const requirement=HATCH_REQUIREMENTS[type];if(!requirement)return{ok:false,reason:'找不到這枚聖獸卵'};
  const nursery=facilityLevel(state.camp,'nursery'),warmth=state.camp.stockpile.warmth;
  if(nursery<requirement.nursery)return{ok:false,reason:`${requirement.label}才能孵化`};
  if(warmth<requirement.warmth)return{ok:false,reason:`還需要 ${requirement.warmth-warmth} 點孵化熱度`};
  return{ok:true,cost:requirement.warmth,nursery};
}
export function collectCampProduction(state,type){
  const camp=ensureCampProgress(state.camp),building=camp.buildings.find(entry=>entry.type===type),def=CAMP_PRODUCTION[type],amount=camp.production[type]||0;
  if(!building||!def)return{ok:false,reason:'這座生產設施尚未建造'};if(amount<=0)return{ok:false,reason:'完成遠征關卡後才會產出'};
  const claimed=Math.min(amount,999-camp.stockpile[def.resource]);if(claimed<=0)return{ok:false,reason:`${def.name}倉儲已滿，先帶入遠征再領取`};camp.production[type]-=claimed;camp.stockpile[def.resource]+=claimed;return{ok:true,amount:claimed,remaining:camp.production[type],resource:def.resource,name:def.name};
}
export function claimCampTask(state,npc){
  const camp=ensureCampProgress(state.camp),task=camp.tasks[npc],def=CAMP_TASKS[npc];if(!task||!def)return{ok:false,reason:'找不到這項營地委託'};if(!task.ready)return{ok:false,reason:'委託尚未完成'};
  for(const resource of ['wood','bone','amber'])camp.stockpile[resource]=Math.min(999,camp.stockpile[resource]+(def.reward[resource]||0));camp.stones=Math.min(1e8,camp.stones+(def.reward.stones||0));task.cycles++;task.progress=0;task.goal=npc==='hunter'?Math.min(50,20+task.cycles*5):1;task.ready=false;return{ok:true,reward:def.reward,nextGoal:task.goal};
}
export function recordCampExpedition(state,snapshot){
  const camp=ensureCampProgress(state.camp),waves=Math.max(0,Math.min(MAX_WAVES,snapshot.stats.waves||0));
  if(waves>0){const intervals={tent:2,forge:3,cache:4,nursery:3};for(const [type,interval] of Object.entries(intervals)){const level=facilityLevel(camp,type);if(level)camp.production[type]=Math.min(99,camp.production[type]+Math.floor(waves/interval)*level);}}
  const hunter=camp.tasks.hunter;if(!hunter.ready){hunter.progress=Math.min(hunter.goal,hunter.progress+(snapshot.stats.kills||0));hunter.ready=hunter.progress>=hunter.goal;}
  return camp;
}

export const FACILITIES = Object.freeze({
  tent: {name:'獵人帳篷',costs:[3,5,8],tag:'體魄',desc:'提高出征生命並生產木材；等級依次解鎖護甲、巨獸之心與踏風步。',benefit:l=>`生命 +${l*10} · 木材 ×${l}`},
  forge: {name:'骨器工坊',costs:[4,6,9],tag:'武技',desc:'強化所有主武器並生產獸骨；一至三級依次解鎖獵骨弓、裂牙雙刃和震骨重錘。',benefit:l=>`武器 +${l*5}% · 獸骨 ×${l}`},
  cache: {name:'補給倉庫',costs:[3,5,8],tag:'籌備',desc:'增加出征琥珀並持續生產琥珀；等級解鎖工匠、拾荒和守巢商品。',benefit:l=>`出征琥珀 +${l*2} · 產出 ×${l}`},
  nursery: {name:'獸卵溫室',costs:[3,5,8],tag:'守護',desc:'提高聖獸卵耐久並生產孵化熱度；升級後可以孵化更多伙伴。',benefit:l=>`獸卵 +${l*15} · 熱度 ×${l}`}
});
export function campPlan(state, type, slot) {
  if (!Object.hasOwn(FACILITIES,type) || !Number.isInteger(slot) || slot < 0 || slot >= 6) return {ok:false,reason:'請選擇營地中的建築地塊'};
  const here=state.camp.buildings.find(b=>b.slot===slot),existing=state.camp.buildings.find(b=>b.type===type),def=FACILITIES[type];
  if(here && here.type!==type)return{ok:false,reason:'地塊已被其他建築使用'};
  if(existing && existing!==here)return{ok:false,reason:'同類建築只能一座；拖到原建築可升級'};
  const level=here?.level||0;
  if(level>=3)return{ok:false,reason:'已達最高三級'};
  const cost=def.costs[level];
  if(state.camp.stones<cost)return{ok:false,reason:`需要 ${cost} 營火石，完成遠征波次後結算取得`};
  return{ok:true,type,slot,cost,level:level+1,upgrade:!!here};
}
export function buildCamp(state,type,slot) {
  const p=campPlan(state,type,slot);if(!p.ok)throw new Error(p.reason);
  state.camp.stones-=p.cost;
  const b=state.camp.buildings.find(b=>b.slot===slot);
  if(b)b.level=p.level;else state.camp.buildings.push({type,slot,level:1});
  const task=ensureCampProgress(state.camp).tasks.porter;if(!task.ready){task.progress=Math.min(task.goal,task.progress+1);task.ready=task.progress>=task.goal;}
  return p;
}
export function moveCamp(state,from,to) {
  if(!Number.isInteger(to)||to<0||to>=6)throw new Error('請移到營地內的空地塊');
  const b=state.camp.buildings.find(b=>b.slot===from);
  if(!b)throw new Error('找不到這座建築');
  if(from===to)return false;
  if(state.camp.buildings.some(b=>b.slot===to))throw new Error('目標地塊已被使用');
  b.slot=to;return true;
}
export function createExpedition(state,seed,runId) {
  const campProgress=ensureCampProgress(state.camp);
  const g=new Expedition(seed,runId);
  if(state.profile.tutorialDone===false||state.profile.tutorialDone===undefined&&state.profile.runs===0)g.enableTutorial({mandatory:true});
  g.applyLoadout(normalizeLoadout(state.camp.loadout));
  g.campUnlocks=campMerchantUnlocks(state.camp);
  for(const b of state.camp.buildings){
    if(b.type==='tent'){g.hero.maxHp+=10*b.level;g.hero.hp=g.hero.maxHp;}
    if(b.type==='forge')for(const id of Object.keys(WEAPONS))g.mods[id]+=.05*b.level;
    if(b.type==='cache')g.amber+=2*b.level;
    if(b.type==='nursery'){g.base.maxHp+=15*b.level;g.base.hp=g.base.maxHp;}
  }
  g.campSupplyBonus={wood:Math.min(campProgress.stockpile.wood,999-g.materials.wood),bone:Math.min(campProgress.stockpile.bone,999-g.materials.bone),amber:Math.min(campProgress.stockpile.amber,99-g.amber)};g.materials.wood+=g.campSupplyBonus.wood;g.materials.bone+=g.campSupplyBonus.bone;g.amber+=g.campSupplyBonus.amber;
  const companions=state.profile.companions,selected=companions?.selected,companionProgress=selected&&companions.roster?.[selected];
  if(companionProgress?.unlocked)g.setCompanion(selected,companionProgress);
  return g;
}
export function rewardFor(snapshot) {
  if(!['win','lose'].includes(snapshot.phase))throw new Error('遠征尚未結束，不能結算');
  return Math.max(0,Math.min(MAX_WAVES,snapshot.stats.waves))*2+(snapshot.phase==='win'?8:0);
}
