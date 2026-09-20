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
const account=new AccountSession(storage),session=account.signIn({account:'hunter@example.com',nickname:'蕨林獵人'});
assert.equal(session.label,'蕨林獵人');
assert.equal(JSON.parse(storage.getItem(ACCOUNT_SESSION_KEY)).label,'蕨林獵人');
assert.equal(storage.getItem(ACCOUNT_SESSION_KEY).includes('hunter@example.com'),false);
assert.equal(storage.getItem(ACCOUNT_SESSION_KEY).includes('password'),false);
assert.equal(new AccountSession(storage).current.label,'蕨林獵人');
account.signOut();
assert.equal(storage.getItem(ACCOUNT_SESSION_KEY),null);
assert.equal(storage.getItem('emberwild_save_v2'),'keep-progress');
assert.equal(accountDisplayName({account:'demo-hunter'}),'demo-hunter');
assert.equal(accountDisplayName({nickname:'<獵人>'}),'獵人');
console.log('PASS local account session stores display name only and logout preserves game progress');
