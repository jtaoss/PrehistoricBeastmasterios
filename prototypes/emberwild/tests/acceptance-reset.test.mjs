import assert from 'node:assert/strict';
import {ACCEPTANCE_ORIGIN,RESET_MARKER,PROGRESS_KEYS,backupKey,applyAcceptanceReset} from '../acceptance-reset.mjs';
class Memory{constructor(){this.data=new Map();this.fail=false;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.fail)throw Error('quota');this.data.set(k,v);}removeItem(k){this.data.delete(k);}}
const request={enabled:true,id:'acceptance-test',origin:ACCEPTANCE_ORIGIN,expiresAt:2000};
const s=new Memory();for(const k of PROGRESS_KEYS)s.setItem(k,'old:'+k);s.setItem('other-app','preserved');s.setItem('emberwild_experience_v1','settings');
assert.equal(applyAcceptanceReset(s,request,ACCEPTANCE_ORIGIN,1000),true);assert.ok(PROGRESS_KEYS.every(k=>s.getItem(k)===null));assert.equal(s.getItem('other-app'),'preserved');assert.equal(s.getItem('emberwild_experience_v1'),'settings');
const backup=JSON.parse(s.getItem(backupKey(request.id)));for(const k of PROGRESS_KEYS)assert.equal(backup.records[k],'old:'+k);
s.setItem(PROGRESS_KEYS[0],'new-progress');assert.equal(applyAcceptanceReset(s,request,ACCEPTANCE_ORIGIN,1001),false);assert.equal(s.getItem(PROGRESS_KEYS[0]),'new-progress');
for(const [origin,now,r] of [['https://example.com',1000,request],[ACCEPTANCE_ORIGIN,3000,request],[ACCEPTANCE_ORIGIN,1000,{...request,enabled:false}]]){const m=new Memory();m.setItem(PROGRESS_KEYS[0],'keep');assert.equal(applyAcceptanceReset(m,r,origin,now),false);assert.equal(m.getItem(PROGRESS_KEYS[0]),'keep');}
const failing=new Memory();failing.setItem(PROGRESS_KEYS[0],'safe');failing.fail=true;assert.throws(()=>applyAcceptanceReset(failing,request,ACCEPTANCE_ORIGIN,1000));assert.equal(failing.getItem(PROGRESS_KEYS[0]),'safe');assert.equal(failing.getItem(RESET_MARKER),null);
console.log('PASS acceptance reset: exact scope, verified backup, once-only behavior, expiry/origin guards and failed-backup protection');
