import assert from 'node:assert/strict';
import {NativeAccountAuth,NativeAuthError} from '../native-auth.mjs';

const calls=[];
const host={crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},android:{miniAuth:value=>calls.push(JSON.parse(value))}};
const auth=new NativeAccountAuth(host);
const login=auth.login('hunter_01','not-stored-password');
assert.deepEqual(calls[0],{action:'login',requestId:'11111111-1111-4111-8111-111111111111',account:'hunter_01',password:'not-stored-password'});
assert.throws(()=>auth.status(),error=>error instanceof NativeAuthError&&error.code==='AUTH_IN_PROGRESS');
assert.equal(auth.handle({func:'onMiniAuthResult',code:'OK',action:'login',requestId:'other',data:{}}),false);
host.javaCallBack({func:'onMiniAuthResult',code:'OK',action:'login',requestId:calls[0].requestId,data:{authenticated:true,playerId:'p1',displayName:'獵人',accessExpiresAt:1770003600,authenticatedAt:1770000000}});
assert.equal((await login).playerId,'p1');

const recovery=auth.recover('hunter_01');
host.javaCallBack(JSON.stringify({func:'onMiniAuthFail',action:'recover',requestId:calls[1].requestId,code:'RATE_LIMITED',message:'操作太頻繁'}));
await assert.rejects(recovery,error=>error.code==='RATE_LIMITED'&&error.message==='操作太頻繁');
const deletion=auth.deleteAccount();
host.javaCallBack({func:'onMiniAuthResult',code:'OK',action:'delete',requestId:calls[2].requestId,data:{authenticated:false}});
assert.equal((await deletion).authenticated,false);
assert.throws(()=>new NativeAccountAuth({}).login('a','b'),error=>error.code==='IOS_APP_REQUIRED');
console.log('PASS native auth bridge requires exact correlated callbacks and has no browser fallback');

let counter=0;
const quietHost={crypto:{randomUUID:()=>`request-${++counter}`},android:{miniAuth(){}}};
const timed=new NativeAccountAuth(quietHost,{requestTimeoutMs:15,statusTimeoutMs:10});
await assert.rejects(timed.status(),error=>error.code==='AUTH_TIMEOUT');
const retry=timed.login('hunter_01','test-only');
assert.equal(timed.handle({func:'onMiniAuthResult',code:'OK',action:'status',requestId:'request-1',data:{authenticated:true}}),false);
quietHost.javaCallBack({func:'onMiniAuthResult',code:'OK',action:'login',requestId:'request-2',data:{authenticated:true}});
assert.equal((await retry).authenticated,true);
await assert.rejects(timed.register('hunter_01','test-only','Hunter','v1'),error=>error.code==='AUTH_TIMEOUT'&&error.message.includes('先使用此帳號登入'));
assert.equal(timed.pending,null);
const throwing=new NativeAccountAuth({android:{miniAuth(){throw new Error('bridge lost');}}});
await assert.rejects(throwing.login('hunter_01','test-only'),error=>error.code==='NATIVE_BRIDGE_FAILED');
assert.equal(throwing.pending,null);
console.log('PASS native auth timeout releases controls, rejects stale callbacks and does not auto-retry registration');
