export class AccountDeletion {
  constructor({auth,session,store,onConfirmed=()=>{}}){
    Object.assign(this,{auth,session,store,onConfirmed});
    this.confirmed=false;this.pending=null;
  }
  run({confirmed=false}={}){
    if(this.pending)return this.pending;
    this.pending=this.perform(confirmed).finally(()=>{this.pending=null;});
    return this.pending;
  }
  async perform(confirmed){
    if(confirmed)this.confirmed=true;
    if(!this.confirmed){
      try{
        const result=await this.auth.deleteAccount();
        if(result?.accountDeleted!==true||result?.authenticated!==false)throw new Error('伺服器尚未確認刪除帳號，請重試。');
        this.confirmed=true;
      }catch(error){
        if(error?.code!=='ACCOUNT_DELETED_CLEANUP_REQUIRED')throw error;
        this.confirmed=true;
      }
    }
    try{
      await this.onConfirmed();
      await this.store.queue;
      this.store.reload();
      await this.store.clearProgress();
      this.session.clear();
      const completed=await this.auth.completeDeletionCleanup();
      if(completed?.authenticated!==false||completed?.cleanupRequired===true)
        throw new Error('本機清理尚未確認完成');
      return {accountDeleted:true,localDataCleared:true};
    }catch(cause){
      const error=new Error('帳號已刪除；此裝置仍有資料尚未清除，請點擊「繼續清理」。');
      error.code='ACCOUNT_CLEANUP_REQUIRED';error.accountDeleted=true;error.cause=cause;
      throw error;
    }
  }
}
