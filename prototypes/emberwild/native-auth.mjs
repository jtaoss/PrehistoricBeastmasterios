const resultObject=value=>{
  if(value&&typeof value==='object')return value;
  try{return JSON.parse(String(value||''));}catch{return{};}
};

const requestId=host=>{
  if(typeof host.crypto?.randomUUID==='function')return host.crypto.randomUUID();
  const bytes=new Uint8Array(16);
  if(typeof host.crypto?.getRandomValues==='function')host.crypto.getRandomValues(bytes);
  else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};

export class NativeAuthError extends Error{
  constructor(code,message){super(message);this.name='NativeAuthError';this.code=code;}
}

export class NativeAccountAuth{
  constructor(host=globalThis,{requestTimeoutMs=35000,statusTimeoutMs=8000}={}){
    this.host=host;this.pending=null;
    this.requestTimeoutMs=requestTimeoutMs;this.statusTimeoutMs=statusTimeoutMs;
    const previous=typeof host.javaCallBack==='function'?host.javaCallBack:null;
    host.javaCallBack=value=>{try{previous?.(value);}finally{this.handle(value);}};
  }
  available(){return typeof this.host.android?.miniAuth==='function';}
  request(action,fields={}){
    if(this.pending)throw new NativeAuthError('AUTH_IN_PROGRESS','另一項帳號操作正在處理，請稍候');
    if(!['status','login','register','recover','logout','delete'].includes(action))throw new NativeAuthError('INVALID_AUTH_ACTION','不支援的帳號操作');
    if(!this.available())throw new NativeAuthError('IOS_APP_REQUIRED','請在 iOS App 內使用真實帳號服務');
    const id=requestId(this.host),payload={action,requestId:id,...fields};
    return new Promise((resolve,reject)=>{
      const pending={requestId:id,action,resolve,reject};
      this.pending=pending;
      pending.timer=setTimeout(()=>{
        if(this.pending!==pending)return;
        this.pending=null;
        reject(new NativeAuthError('AUTH_TIMEOUT',action==='register'?'註冊回應逾時，請稍後先使用此帳號登入，確認是否已建立。':'帳號服務回應逾時，請稍後重試。'));
      },action==='status'?this.statusTimeoutMs:this.requestTimeoutMs);
      try{this.host.android.miniAuth(JSON.stringify(payload));}
      catch(error){clearTimeout(pending.timer);this.pending=null;reject(new NativeAuthError('NATIVE_BRIDGE_FAILED',error?.message||'無法連接帳號服務'));}
    });
  }
  status(){return this.request('status');}
  login(account,password){return this.request('login',{account,password});}
  register(account,password,nickname,acceptedTermsVersion){return this.request('register',{account,password,nickname,acceptedTermsVersion});}
  recover(account){return this.request('recover',{account});}
  logout(){return this.request('logout');}
  deleteAccount(){return this.request('delete');}
  handle(value){
    const payload=resultObject(value),pending=this.pending;
    if(!pending||payload.requestId!==pending.requestId||payload.action!==pending.action)return false;
    clearTimeout(pending.timer);
    this.pending=null;
    if(payload.func==='onMiniAuthResult'&&payload.code==='OK'){
      pending.resolve(payload.data&&typeof payload.data==='object'?payload.data:{});return true;
    }
    if(payload.func==='onMiniAuthFail'){
      pending.reject(new NativeAuthError(String(payload.code||'AUTH_FAILED'),String(payload.message||'帳號服務未能完成請求')));return true;
    }
    pending.reject(new NativeAuthError('INVALID_AUTH_RESPONSE','帳號服務回應格式不正確'));return true;
  }
}
