import { validateSnapshot, clamp, MAX_WAVES, COMPANIONS, COMPANION_MAX_LEVEL, DEFAULT_LOADOUT, isValidLoadout, normalizeLoadout } from './engine.mjs';
import { FACILITIES, CAMP_TASKS, ensureCampProgress, recordCampExpedition, rewardFor } from './camp.mjs';

export const SAVE_KEY='emberwild_save_v2';
export const BACKUP_KEY='emberwild_save_v2_backup';
export const LEGACY_KEY='emberwild_prototype_v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const num=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const need=ok=>{if(!ok)throw new Error('營地存檔格式損壞或版本不相容');};
export function freshCompanionState(){return{selected:null,roster:Object.fromEntries(Object.keys(COMPANIONS).map(type=>[type,{unlocked:false,level:1,xp:0}]))};}
export function ensureCompanionState(profile){if(profile.companions===undefined)profile.companions=freshCompanionState();return profile.companions;}
export function ensureLoadoutState(camp){if(camp.loadout===undefined)camp.loadout=normalizeLoadout(DEFAULT_LOADOUT);return camp.loadout;}
function syncCompanionProgress(state,snapshot){
  if(['done','skipped'].includes(snapshot.tutorial?.status))state.profile.tutorialDone=true;
  const p=snapshot.companion;if(!p)return;
  const companions=ensureCompanionState(state.profile),saved=companions.roster[p.type];if(!saved)return;
  saved.unlocked=true;saved.level=p.level;saved.xp=p.xp;companions.selected=p.type;
}
export function freshState(legacy={}) {
  if(!legacy||typeof legacy!=='object')legacy={};
  const number=(v,max)=>Math.floor(clamp(Number(v)||0,0,max));
  const state={profile:{runs:number(legacy.runs,1e6),best:number(legacy.best,MAX_WAVES),victories:number(legacy.victories,1e6),companions:freshCompanionState(),tutorialDone:number(legacy.runs,1e6)>0},camp:{stones:8,buildings:[],position:{x:980,y:960,angle:0},loadout:normalizeLoadout(DEFAULT_LOADOUT)},run:null,lastResult:null};ensureCampProgress(state.camp);return state;
}
export function validateState(state) {
  need(state&&typeof state==='object'&&state.profile&&state.camp);
  if(state.profile.tutorialDone!==undefined)need(typeof state.profile.tutorialDone==='boolean');
  for(const k of ['runs','victories'])need(num(state.profile[k],0,1e6));need(num(state.profile.best,0,MAX_WAVES));
  if(state.profile.companions!==undefined){
    const companions=state.profile.companions,types=Object.keys(COMPANIONS);need(companions&&typeof companions==='object'&&companions.roster&&typeof companions.roster==='object');
    need(companions.selected===null||types.includes(companions.selected));
    for(const type of types){const p=companions.roster[type];need(p&&typeof p.unlocked==='boolean'&&num(p.level,1,COMPANION_MAX_LEVEL)&&num(p.xp,0,1e8));}
    if(companions.selected!==null)need(companions.roster[companions.selected].unlocked);
  }
  need(num(state.camp.stones,0,1e8));need(Array.isArray(state.camp.buildings)&&state.camp.buildings.length<=4);
  if(state.camp.stockpile!==undefined){for(const resource of ['wood','bone','amber','warmth'])need(num(state.camp.stockpile?.[resource],0,999));}
  if(state.camp.production!==undefined){for(const type of Object.keys(FACILITIES))need(num(state.camp.production?.[type],0,99));}
  if(state.camp.tasks!==undefined){for(const npc of Object.keys(CAMP_TASKS)){const task=state.camp.tasks?.[npc];need(task&&num(task.progress,0,1e6)&&num(task.goal,1,1e6)&&num(task.cycles,0,1e6)&&typeof task.ready==='boolean');need(task.progress<=task.goal);}}
  if(state.camp.loadout!==undefined)need(isValidLoadout(state.camp.loadout));
  if(state.camp.position!==undefined){const p=state.camp.position;need(p&&Number.isFinite(p.x)&&p.x>=80&&p.x<=1920&&Number.isFinite(p.y)&&p.y>=80&&p.y<=1620&&Number.isFinite(p.angle)&&Math.abs(p.angle)<=Math.PI*2);}
  const slots=new Set(),types=new Set();
  for(const b of state.camp.buildings){need(b&&Object.hasOwn(FACILITIES,b.type)&&num(b.slot,0,5)&&num(b.level,1,3)&&!slots.has(b.slot)&&!types.has(b.type));slots.add(b.slot);types.add(b.type);}
  need(state.run===null || typeof state.run==='object');if(state.run!==null)validateSnapshot(state.run);
  if(state.lastResult!==null){const r=state.lastResult;need(r&&typeof r.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(r.id));need(typeof r.won==='boolean'&&num(r.waves,0,MAX_WAVES)&&num(r.stones,0,MAX_WAVES*2+8)&&num(r.kills,0,10000)&&num(r.combos,0,1e7)&&num(r.completedAt,0,Number.MAX_SAFE_INTEGER));if(r.loot!==undefined){need(r.loot&&num(r.loot.wood,0,999)&&num(r.loot.bone,0,999)&&num(r.loot.amber,0,99)&&num(r.loot.harvested,0,30));}}
  return true;
}
function digest(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}
export function encode(state,revision=1,updatedAt=Date.now()) {
  validateState(state);const payload={version:10,revision,updatedAt,state};return JSON.stringify({...payload,checksum:digest(JSON.stringify(payload))});
}
export function decode(raw) {
  if(typeof raw!=='string'||raw.length>500000)throw new Error('存檔為空或超過大小限制');
  const e=JSON.parse(raw);if(![2,3,4,5,6,7,8,9,10].includes(e?.version))throw new Error('存檔版本不相容，請保留備份');
  need(num(e.revision,0,Number.MAX_SAFE_INTEGER)&&num(e.updatedAt,0,Number.MAX_SAFE_INTEGER));
  need(e.checksum===digest(JSON.stringify({version:e.version,revision:e.revision,updatedAt:e.updatedAt,state:e.state})));
  validateState(e.state);return e;
}

// One atomic record contains both the active expedition and permanent progression.
// No reward is stored separately from clearing the completed run.
export class SaveStore {
  constructor(storage,locks=null){this.storage=storage;this.locks=locks;this.queue=Promise.resolve();this.reload();}
  reload(){
    this.warning='';this.blocked=false;this.revision=0;this.savedAt=0;this.validRaw=null;this.raw=null;this.state=freshState();
    try{
      this.raw=this.storage.getItem(SAVE_KEY);const backup=this.storage.getItem(BACKUP_KEY);
      if(this.raw){try{const e=decode(this.raw);this.accept(e,this.raw);return;}catch{}}
      // Never downgrade a newer-format primary file, even when an old backup exists.
      let future=false;try{future=JSON.parse(this.raw)?.version>10;}catch{}
      if(future){this.blocked=true;this.warning='這份存檔來自較新版本，已停止寫入。請先匯出備份。';return;}
      if(backup){try{const e=decode(backup);this.accept(e,backup);this.warning='主存檔異常，已恢復上一份備份。';return;}catch{}}
      if(this.raw||backup){this.blocked=true;this.warning='存檔無法讀取，已保留原資料並停止寫入。可先匯出備份。';return;}
      let legacy={};try{legacy=JSON.parse(this.storage.getItem(LEGACY_KEY)||'{}');}catch{}
      this.state=freshState(legacy);
    }catch{this.blocked=true;this.warning='瀏覽器不允許本機儲存；請允許儲存後再開始遠征。';}
  }
  accept(e,raw){this.state=clone(e.state);ensureCompanionState(this.state.profile);ensureLoadoutState(this.state.camp);ensureCampProgress(this.state.camp);this.revision=e.revision;this.savedAt=e.updatedAt;this.validRaw=raw;}
  commit(fn){
    if(this.blocked)throw new Error(this.warning||'存檔暫不可寫入');
    if(this.storage.getItem(SAVE_KEY)!==this.raw){const e=new Error('另一個頁面已更新存檔，請載入最新進度');e.code='CONFLICT';throw e;}
    const next=clone(this.state);const result=fn(next);ensureCompanionState(next.profile);ensureLoadoutState(next.camp);ensureCampProgress(next.camp);validateState(next);const raw=encode(next,this.revision+1);
    if(this.validRaw){try{this.storage.setItem(BACKUP_KEY,this.validRaw);}catch{}}
    try{this.storage.setItem(SAVE_KEY,raw);}catch{throw new Error('存檔失敗：儲存空間不足或被禁止，進度尚未寫入');}
    this.raw=raw;this.accept(decode(raw),raw);this.warning='';return result;
  }
  async mutate(fn){
    const task=async()=>{
      const transaction=()=>this.commit(fn);
      // Serialize cooperating tabs; CAS above also detects stale state without Web Locks.
      return this.locks?this.locks.request('emberwild-save-v2',transaction):transaction();
    };
    const p=this.queue.then(task,task);this.queue=p.catch(()=>{});return p;
  }
  putRun(state,source){const snapshot=typeof source==='function'?source():source;validateSnapshot(snapshot);if(state.run?.runId!==snapshot.runId)throw new Error('遠征存檔已變更，請重新載入');state.run=clone(snapshot);syncCompanionProgress(state,snapshot);}
  saveRun(source){return this.mutate(s=>this.putRun(s,source));}
  flushRun(snapshot){return this.commit(s=>this.putRun(s,snapshot));}
  begin(snapshot,replace=false){validateSnapshot(snapshot);return this.mutate(s=>{if(s.run?.tutorial?.mandatory&&s.run.tutorial.status==='active')throw new Error('請先完成新手訓練，不可替換教學遠征');if(s.run&&!replace)throw new Error('已有未完成遠征，請先繼續或確認放棄');const camp=ensureCampProgress(s.camp),bonus=snapshot.campSupplyBonus||{wood:0,bone:0,amber:0};for(const resource of ['wood','bone','amber']){if(camp.stockpile[resource]<bonus[resource])throw new Error('營地補給已被另一個頁面使用，請重新載入');camp.stockpile[resource]-=bonus[resource];}s.profile.runs=Math.min(1e6,s.profile.runs+1);s.run=clone(snapshot);syncCompanionProgress(s,snapshot);});}
  complete(snapshot){validateSnapshot(snapshot);return this.mutate(s=>{
    if(s.lastResult?.id===snapshot.runId)return s.lastResult;
    if(s.run?.runId!==snapshot.runId)throw new Error('這場遠征已結算或不是目前存檔');
    const stones=rewardFor(snapshot),won=snapshot.phase==='win';syncCompanionProgress(s,snapshot);recordCampExpedition(s,snapshot);
    s.camp.stones=Math.min(1e8,s.camp.stones+stones);s.profile.best=Math.max(s.profile.best,snapshot.stats.waves);if(won)s.profile.victories=Math.min(1e6,s.profile.victories+1);
    const result={id:snapshot.runId,won,waves:snapshot.stats.waves,stones,kills:snapshot.stats.kills,combos:snapshot.stats.combos,
      loot:{wood:snapshot.materials?.wood||0,bone:snapshot.materials?.bone||0,amber:snapshot.amber,harvested:snapshot.stats.harvested},completedAt:Date.now()};
    s.lastResult=result;s.run=null;return result;
  });}
  abandon(){return this.mutate(s=>{if(s.run?.tutorial?.mandatory&&s.run.tutorial.status==='active')throw new Error('請先完成新手訓練，不可放棄教學');s.run=null;});}
  export(){return this.blocked?JSON.stringify({recovery:true,primary:this.raw,backup:this.storage.getItem(BACKUP_KEY)},null,2):encode(this.state,this.revision);}
  async import(raw){const e=decode(raw),blocked=this.blocked;this.blocked=false;try{return await this.mutate(s=>{for(const key of ['profile','camp','run','lastResult'])s[key]=clone(e.state[key]);});}catch(error){this.blocked=blocked;throw error;}}
}
