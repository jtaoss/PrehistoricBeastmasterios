export const ACCOUNT_SESSION_KEY='emberwild_account_session_v1';

const clean=value=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>"'`]/g,'').trim();

export function accountDisplayName({nickname='',account=''}={}){
  const accountName=clean(account).split('@')[0];
  return (clean(nickname)||accountName||'荒境獵人').slice(0,20);
}

function parse(raw){
  if(!raw)return null;
  try{
    const value=JSON.parse(raw);
    if(value?.version!==2||typeof value.playerId!=='string'||!value.playerId.trim()||value.playerId.length>128||typeof value.label!=='string'||!value.label.trim()||value.label.length>20||!Number.isFinite(value.authenticatedAt)||!Number.isFinite(value.accessExpiresAt))return null;
    return Object.freeze({version:2,playerId:value.playerId,label:value.label,authenticatedAt:value.authenticatedAt,accessExpiresAt:value.accessExpiresAt});
  }catch{return null;}
}

export class AccountSession{
  constructor(storage){this.storage=storage;this.current=null;this.reload();}
  reload(){
    try{this.current=parse(this.storage?.getItem?.(ACCOUNT_SESSION_KEY));}
    catch{this.current=null;}
    return this.current;
  }
  accept(value){
    if(!value?.authenticated)throw new Error('登入狀態無效，請重新登入。');
    const playerId=clean(value.playerId).slice(0,128),label=accountDisplayName({nickname:value.displayName});
    const authenticatedAt=Number(value.authenticatedAt)*1000,accessExpiresAt=Number(value.accessExpiresAt)*1000;
    if(!playerId||!Number.isFinite(authenticatedAt)||!Number.isFinite(accessExpiresAt)||accessExpiresAt<=authenticatedAt)throw new Error('帳號服務回傳的登入狀態不完整。');
    const session={version:2,playerId,label,authenticatedAt,accessExpiresAt},raw=JSON.stringify(session);
    try{
      this.storage?.setItem?.(ACCOUNT_SESSION_KEY,raw);
      if(this.storage?.getItem?.(ACCOUNT_SESSION_KEY)!==raw)throw new Error('登入狀態未能寫入');
    }catch{throw new Error('無法保存帳號顯示狀態，請確認裝置儲存空間。');}
    this.current=Object.freeze(session);return this.current;
  }
  clear(){
    try{
      this.storage?.removeItem?.(ACCOUNT_SESSION_KEY);
      if(this.storage?.getItem?.(ACCOUNT_SESSION_KEY)!==null)throw new Error('登入狀態未能清除');
    }catch{throw new Error('無法清除帳號顯示狀態，請稍後再試。');}
    this.current=null;return true;
  }
}
