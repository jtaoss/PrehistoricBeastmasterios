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

export class StoreKitShopError extends Error{
  constructor(code,message){super(message);this.name='StoreKitShopError';this.code=code;}
}

export class NativeStoreKitShop{
  constructor(host=globalThis){
    this.host=host;this.pending=null;
    const previous=typeof host.javaCallBack==='function'?host.javaCallBack:null;
    host.javaCallBack=value=>{
      try{previous?.(value);}finally{this.handle(value);}
    };
  }
  available(){return typeof this.host.android?.miniPurchase==='function';}
  purchase(offer){
    if(this.pending)throw new StoreKitShopError('PAYMENT_IN_PROGRESS','已有一筆付款正在處理，請勿重複點擊');
    if(!offer?.id||!offer?.productId||!Number.isInteger(offer.goodsId))throw new StoreKitShopError('INVALID_OFFER','商品設定不完整');
    if(!this.available())throw new StoreKitShopError('IOS_APP_REQUIRED','請在 iOS App 內使用 App Store 付款');
    const clientRequestId=requestId(this.host);
    return new Promise((resolve,reject)=>{
      this.pending={clientRequestId,offerId:offer.id,resolve,reject};
      try{this.host.android.miniPurchase(JSON.stringify({offerId:offer.id,clientRequestId}));}
      catch(error){this.pending=null;reject(new StoreKitShopError('NATIVE_BRIDGE_FAILED',error?.message||'無法連接 App Store'));}
    });
  }
  handle(value){
    const payload=resultObject(value),pending=this.pending;
    if(!pending||payload.clientRequestId!==pending.clientRequestId)return false;
    const finish=()=>{this.pending=null;};
    if(payload.func==='onPayResult'&&String(payload.code)==='0'&&/^\d{1,40}$/.test(String(payload.transactionId||''))&&payload.orderId){
      finish();pending.resolve({offerId:pending.offerId,clientRequestId:pending.clientRequestId,orderId:String(payload.orderId),transactionId:String(payload.transactionId)});return true;
    }
    if(['onPayFail','onPayCancel','onPayPending'].includes(payload.func)){
      finish();pending.reject(new StoreKitShopError(String(payload.code||'PAYMENT_NOT_COMPLETED'),String(payload.message||'付款未完成')));return true;
    }
    return false;
  }
}
