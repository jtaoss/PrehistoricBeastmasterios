import assert from 'node:assert/strict';
import {AccountSession,ACCOUNT_SESSION_KEY,accountDisplayName} from '../account-session.mjs';

class Memory{
  constructor(){this.data=new Map();}
  getItem(key){return this.data.get(key)||null;}
  setItem(key,value){this.data.set(key,value);}
  removeItem(key){this.data.delete(key);}
}

const storage=new Memory();
storage.setItem('emberwild_save_v2','keep-progress');
const account=new AccountSession(storage),session=account.accept({authenticated:true,playerId:'player-2001',displayName:'蕨林獵人',authenticatedAt:1770000000,accessExpiresAt:1770003600});
assert.equal(session.label,'蕨林獵人');
assert.equal(session.playerId,'player-2001');
assert.equal(JSON.parse(storage.getItem(ACCOUNT_SESSION_KEY)).version,2);
assert.equal(storage.getItem(ACCOUNT_SESSION_KEY).includes('access_token'),false);
assert.equal(storage.getItem(ACCOUNT_SESSION_KEY).includes('refresh_token'),false);
assert.equal(storage.getItem(ACCOUNT_SESSION_KEY).includes('password'),false);
assert.equal(new AccountSession(storage).current.playerId,'player-2001');
account.clear();
assert.equal(storage.getItem(ACCOUNT_SESSION_KEY),null);
assert.equal(storage.getItem('emberwild_save_v2'),'keep-progress');
storage.setItem(ACCOUNT_SESSION_KEY,JSON.stringify({version:1,label:'舊假登入',signedInAt:1}));
assert.equal(new AccountSession(storage).current,null);
assert.equal(accountDisplayName({account:'demo-hunter'}),'demo-hunter');
assert.equal(accountDisplayName({nickname:'<獵人>'}),'獵人');
console.log('PASS account cache stores only public server identity and ignores legacy fake sessions');
