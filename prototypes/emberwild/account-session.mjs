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
    if(value?.version!==1||typeof value.label!=='string'||!value.label.trim()||value.label.length>20||!Number.isFinite(value.signedInAt))return null;
    return Object.freeze({version:1,label:value.label,signedInAt:value.signedInAt});
  }catch{return null;}
}

export class AccountSession{
  constructor(storage){this.storage=storage;this.current=null;this.reload();}
  reload(){
    try{this.current=parse(this.storage?.getItem?.(ACCOUNT_SESSION_KEY));}
    catch{this.current=null;}
    return this.current;
  }
  signIn(identity){
    const session={version:1,label:accountDisplayName(identity),signedInAt:Date.now()},raw=JSON.stringify(session);
    try{
      this.storage?.setItem?.(ACCOUNT_SESSION_KEY,raw);
      if(this.storage?.getItem?.(ACCOUNT_SESSION_KEY)!==raw)throw new Error('登入狀態未能寫入');
    }catch{throw new Error('無法保存本機登入狀態，請確認瀏覽器允許網站儲存。');}
    this.current=Object.freeze(session);return this.current;
  }
  signOut(){
    try{
      this.storage?.removeItem?.(ACCOUNT_SESSION_KEY);
      if(this.storage?.getItem?.(ACCOUNT_SESSION_KEY)!==null)throw new Error('登入狀態未能清除');
    }catch{throw new Error('無法退出本機帳號，請確認瀏覽器允許網站儲存。');}
    this.current=null;return true;
  }
}
