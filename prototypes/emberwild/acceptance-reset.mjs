// Explicit, expiring local acceptance reset. Never runs in a public/native build.
// Only the three game-progress records are touched; settings and unrelated sites remain intact.
export const ACCEPTANCE_ORIGIN='http://127.0.0.1:4174';
export const RESET_MARKER='emberwild_acceptance_reset_v1';
export const PROGRESS_KEYS=Object.freeze(['emberwild_save_v2','emberwild_save_v2_backup','emberwild_prototype_v1']);
export const backupKey=id=>'emberwild_acceptance_backup_'+id;
export function applyAcceptanceReset(storage,request,origin,now=Date.now()){
  if(origin!==ACCEPTANCE_ORIGIN||request?.origin!==origin||request.enabled!==true||!/^acceptance-[a-zA-Z0-9-]{1,80}$/.test(request.id||'')||!Number.isFinite(request.expiresAt)||now>request.expiresAt)return false;
  if(storage.getItem(RESET_MARKER)===request.id)return false;
  const records=Object.fromEntries(PROGRESS_KEYS.map(key=>[key,storage.getItem(key)])),key=backupKey(request.id);
  // A failed retry must not overwrite the pre-reset backup with an empty/partially cleared state.
  if(!storage.getItem(key)){
    const raw=JSON.stringify({id:request.id,origin,createdAt:now,records});storage.setItem(key,raw);
    if(storage.getItem(key)!==raw)throw new Error('清檔前備份未能寫入，原進度未清除。');
  }else{
    const old=JSON.parse(storage.getItem(key));
    if(old.id!==request.id||old.origin!==origin||!old.records||!PROGRESS_KEYS.every(k=>old.records[k]===null||typeof old.records[k]==='string'))throw new Error('清檔備份無法驗證，已保留現有資料。');
  }
  if(PROGRESS_KEYS.some(k=>storage.getItem(k)!==records[k]))throw new Error('另一個頁面剛更新了進度，請關閉其他遊戲頁後重試清檔。');
  // Primary last: other live pages observe its removal and fail their save CAS check.
  for(const k of [...PROGRESS_KEYS.slice(1),PROGRESS_KEYS[0]])storage.removeItem(k);
  if(PROGRESS_KEYS.some(k=>storage.getItem(k)!==null))throw new Error('清檔尚未完成；清檔前資料仍保存在獨立備份中。');
  storage.setItem(RESET_MARKER,request.id);
  return true;
}
export async function resetForLocalAcceptance(storage,location,locks){
  if(location.origin!==ACCEPTANCE_ORIGIN||new URLSearchParams(location.search).has('qa'))return false;
  const response=await fetch('./acceptance-reset.json',{cache:'no-store',signal:AbortSignal.timeout(2000)});
  if(response.status===404)return false;
  if(!response.ok)throw new Error('無法檢查本地清檔指令，請重新整理。');
  const request=await response.json(),apply=()=>applyAcceptanceReset(storage,request,location.origin);
  return locks?locks.request('emberwild-save-v2',apply):apply();
}
