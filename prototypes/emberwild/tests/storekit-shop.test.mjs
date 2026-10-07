import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {NativeStoreKitShop,StoreKitShopError} from '../storekit-shop.mjs';

const offer={id:'pack-fortify',productId:'pbm_tier_099',goodsId:910001};
const calls=[];
const host={location:{protocol:'file:'},crypto:{randomUUID},webkit:{messageHandlers:{android:{postMessage:message=>{
  assert.equal(message.method,'miniPurchase');calls.push(JSON.parse(message.payload));
}}}}};
// Exercise the shipped common SDK rather than a stand-in miniPurchase method.
vm.runInNewContext(readFileSync(new URL('../../../PrehistoricBeastmaster/Resources/js/game_sdk.js',import.meta.url),'utf8'),{window:host});
const shop=new NativeStoreKitShop(host);
const purchase=shop.purchase(offer);
assert.equal(calls[0].offerId,'pack-fortify');
assert.match(calls[0].clientRequestId,/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/);
assert.throws(()=>shop.purchase(offer),error=>error instanceof StoreKitShopError&&error.code==='PAYMENT_IN_PROGRESS');
assert.equal(shop.handle({func:'onPayResult',code:'0',clientRequestId:'other',transactionId:'1',orderId:'x'}),false);
host.javaCallBack({func:'onPayResult',code:'0',clientRequestId:calls[0].clientRequestId,transactionId:'900000001',orderId:'MINI-1'});
assert.deepEqual(await purchase,{offerId:'pack-fortify',clientRequestId:calls[0].clientRequestId,transactionId:'900000001',orderId:'MINI-1'});

const cancelled=shop.purchase(offer);
assert.notEqual(calls[0].clientRequestId,calls[1].clientRequestId);
assert.equal(shop.handle({func:'onPayResult',code:'0',clientRequestId:calls[0].clientRequestId,transactionId:'900000001',orderId:'MINI-1'}),false,'a previous purchase cannot fulfill the next one');
host.javaCallBack(JSON.stringify({func:'onPayCancel',code:'USER_CANCELED',message:'closed',clientRequestId:calls[1].clientRequestId}));
await assert.rejects(cancelled,error=>error.code==='USER_CANCELED'&&error.message==='closed');
assert.throws(()=>new NativeStoreKitShop({}).purchase(offer),error=>error.code==='IOS_APP_REQUIRED');
const delayed=shop.purchase(offer),delayedRequest=calls.at(-1).clientRequestId;
let resolved=false;delayed.then(()=>resolved=true);
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(resolved,false,'waiting for Apple must not invent success');
assert.throws(()=>shop.purchase(offer),error=>error.code==='PAYMENT_IN_PROGRESS');
assert.equal(shop.handle({func:'onPayResult',code:'0',clientRequestId:delayedRequest,orderId:'MINI-DELAY'}),false,'missing transaction cannot grant');
host.javaCallBack({func:'onPayResult',code:'0',clientRequestId:delayedRequest,transactionId:'900000002',orderId:'MINI-DELAY'});
assert.equal((await delayed).transactionId,'900000002');
assert.equal(shop.handle({func:'onPayResult',code:'0',clientRequestId:delayedRequest,transactionId:'900000002',orderId:'MINI-DELAY'}),false,'duplicate callback is ignored');
const pending=shop.purchase(offer);
host.javaCallBack({func:'onPayPending',code:'PAYMENT_PENDING',clientRequestId:calls.at(-1).clientRequestId});
await assert.rejects(pending,error=>error.code==='PAYMENT_PENDING');
console.log('PASS native StoreKit bridge requires an exact request and verified transaction result');
