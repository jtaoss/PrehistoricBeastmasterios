export const GUEST_SESSION_KEY='emberwild_guest_session_v1';

export class GuestSession{
  constructor(storage){this.storage=storage;}
  active(){
    try{return this.storage?.getItem?.(GUEST_SESSION_KEY)==='1';}
    catch{return false;}
  }
  start(){
    try{
      this.storage?.setItem?.(GUEST_SESSION_KEY,'1');
      if(this.storage?.getItem?.(GUEST_SESSION_KEY)!=='1')throw new Error('guest state unavailable');
      return true;
    }catch{throw new Error('無法保存訪客狀態，請確認裝置儲存空間後重試。');}
  }
  clear(){
    try{this.storage?.removeItem?.(GUEST_SESSION_KEY);}
    catch{}
  }
}
