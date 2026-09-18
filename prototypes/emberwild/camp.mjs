import { Expedition, MAX_WAVES } from './engine.mjs';

export const FACILITIES = Object.freeze({
  tent: {name:'獵人帳篷',costs:[3,5,8],tag:'體魄',desc:'每級讓新遠征的生命上限 +10。',benefit:l=>`出征生命 +${l*10}`},
  forge: {name:'骨器工坊',costs:[4,6,9],tag:'武技',desc:'每級讓新遠征的骨矛、骨斧傷害 +5%。',benefit:l=>`武器傷害 +${l*5}%`},
  cache: {name:'補給倉庫',costs:[3,5,8],tag:'籌備',desc:'每級讓新遠征多帶 2 琥珀。',benefit:l=>`出征琥珀 +${l*2}`},
  nursery: {name:'獸卵溫室',costs:[3,5,8],tag:'守護',desc:'每級讓新遠征的聖獸卵耐久 +15。',benefit:l=>`獸卵耐久 +${l*15}`}
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
  const g=new Expedition(seed,runId);
  for(const b of state.camp.buildings){
    if(b.type==='tent'){g.hero.maxHp+=10*b.level;g.hero.hp=g.hero.maxHp;}
    if(b.type==='forge'){g.mods.spear+=.05*b.level;g.mods.axe+=.05*b.level;}
    if(b.type==='cache')g.amber+=2*b.level;
    if(b.type==='nursery'){g.base.maxHp+=15*b.level;g.base.hp=g.base.maxHp;}
  }
  return g;
}
export function rewardFor(snapshot) {
  if(!['win','lose'].includes(snapshot.phase))throw new Error('遠征尚未結束，不能結算');
  return Math.max(0,Math.min(MAX_WAVES,snapshot.stats.waves))*2+(snapshot.phase==='win'?8:0);
}
