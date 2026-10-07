// Execute the shipped shared SDK and compatibility bridge. Native messages
// remain in memory; no vendor script, account, receipt or network is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const resource = name => fs.readFileSync(path.join(__dirname, '../PrehistoricBeastmaster/Resources/js', name), 'utf8');
const bridge = resource('android_bridge.js'), sdk = resource('game_sdk.js');
function setup(protocol, handlers = true) {
  const calls = [];
  const window = {location: {protocol}};
  if (handlers) window.webkit = {messageHandlers: {android: {postMessage: m => calls.push(JSON.parse(JSON.stringify(m)))}}};
  const context = vm.createContext({window, console, URL});
  vm.runInContext(bridge, context);vm.runInContext(sdk, context);
  return {window, calls, reinject() {vm.runInContext(sdk, context);}};
}
let passed = 0;
function test(name, run) {run();passed++;console.log('PASS ' + name);}
test('legacy main payment aliases and new API dispatch the same canonical order', () => {
  const {window: w, calls} = setup('https:');
  const order = {cpOrder:'MAIN-1',productId:'pbm_tier_099',goodsId:123,price:'0.99',username:'fixture'};
  w.android.pay(JSON.stringify(order));w.android.chargeInfo(JSON.stringify(order));w.pbmGameSDK.purchase(order);
  assert.deepEqual(calls.map(m => [m.method, JSON.parse(m.payload)]), Array(3).fill(['pay', order]));
});
test('mini game shares the implementation but sends only the offer and correlation ID', () => {
  const {window: w, calls} = setup('file:');
  const offer = {offerId:'pack-fortify',clientRequestId:'11111111-1111-4111-8111-111111111111'};
  w.pbmGameSDK.purchase({...offer, price:'0', cpOrder:'forged', uid:'forged', notifyURL:'https://example.invalid'});
  w.android.miniPurchase(JSON.stringify(offer));
  assert.deepEqual(calls.map(m => [m.method, JSON.parse(m.payload)]), Array(2).fill(['miniPurchase', offer]));
  assert.throws(() => w.pbmGameSDK.purchase({offerId:'pack-fortify'}), /request ID is missing/);
  assert.throws(() => w.pbmGameSDK.purchase({price:'0.99'}), /order is missing/);
  assert.equal(calls.length, 2);
});
test('both games read the current common public config and never expose credentials', () => {
  const main = setup('https:'), mini = setup('file:');
  const common = {appId:'1000151',bundleId:'com.stone.primitive.saga',channel:'fixture-channel',webSdkChannel:'10000',payChannel:24,contentMode:'BOTH',storeKitEnabled:true};
  main.window.__shellSdkStatus = JSON.stringify({...common,gameId:'main',accessToken:'hidden',apiSecret:'hidden'});
  mini.window.__shellSdkStatus = JSON.stringify({...common,gameId:'emberwild'});
  const config = host => JSON.parse(JSON.stringify(host.window.pbmGameSDK.getConfig()));
  const a = config(main), b = config(mini);
  assert.equal(a.gameId, 'main');assert.equal(b.gameId, 'emberwild');
  delete a.gameId;delete b.gameId;assert.deepEqual(a,b);
  assert.equal(a.accessToken, undefined);assert.equal(a.apiSecret, undefined);
  mini.window.__shellSdkStatus = {...common,channel:'updated',storeKitEnabled:false,gameId:'emberwild'};
  assert.equal(config(mini).channel, 'updated');
  assert.throws(() => mini.window.pbmGameSDK.purchase({offerId:'pack-fortify',clientRequestId:'request'}), /disabled/);
  assert.equal(mini.calls.length, 0);
});
test('main legacy analytics and mini analytics use one native envelope with game attribution', () => {
  const main = setup('https:'), mini = setup('file:');
  main.window.android.sdkEvent('Loading_completed','{}');
  main.window.android.AF_Event_Name(JSON.stringify({type:'NewRole_Tutorial',role_id:'main-role'}));
  assert.equal(mini.window.pbmGameSDK.track('mini_game_start',{game_id:'spoofed',run_id:'run'}),true);
  const unpack = m => {assert.equal(m.method,'sdkEvent');const e = JSON.parse(m.payload);return {name:e.name,fields:JSON.parse(e.json)};};
  assert.deepEqual(main.calls.map(unpack),[
    {name:'Loading_completed',fields:{game_id:'main'}},
    {name:'legacy_af_event',fields:{type:'NewRole_Tutorial',role_id:'main-role',game_id:'main'}}
  ]);
  assert.deepEqual(mini.calls.map(unpack),[{name:'mini_game_start',fields:{run_id:'run',game_id:'emberwild'}}]);
  assert.equal(mini.window.pbmGameSDK.track('invalid','not-json'),false);
  assert.equal(mini.calls.length,1);
});
test('missing native bridge cannot invent payment completion or queue analytics', () => {
  const {window:w,calls} = setup('file:',false);
  assert.equal(w.pbmGameSDK.isAvailable(),false);
  assert.throws(() => w.pbmGameSDK.purchase({offerId:'pack-fortify',clientRequestId:'request'}),/unavailable/);
  assert.equal(w.pbmGameSDK.track('mini_game_open',{}),false);assert.deepEqual(calls,[]);
});
test('configured hosted mini pages are attributed before the native finish callback', () => {
  const s=setup('https:');
  s.window.location.href='https://games.example.invalid/emberwild/current/index.html';
  s.window.__shellSdkStatus=JSON.stringify({miniGameBaseURL:'https://games.example.invalid/emberwild/current/'});
  assert.equal(s.window.pbmGameSDK.getConfig().gameId,'emberwild');
  s.window.pbmGameSDK.track('mini_game_open',{});
  assert.equal(JSON.parse(JSON.parse(s.calls[0].payload).json).game_id,'emberwild');
  s.window.location.href='https://games.example.invalid/unrelated/index.html';
  assert.equal(s.window.pbmGameSDK.getConfig().gameId,'main');
});
test('SDK reinjection keeps one immutable implementation and direct WK main alias works', () => {
  const s = setup('https:',false), original = s.window.pbmGameSDK;
  s.reinject();assert.equal(s.window.pbmGameSDK,original);assert.ok(Object.isFrozen(original));
  assert.equal(Reflect.set(s.window,'pbmGameSDK',{}),false);
  const requests=[];s.window.webkit={messageHandlers:{pay:{postMessage:r=>requests.push(JSON.parse(JSON.stringify(r)))}}};
  assert.equal(original.isAvailable(),true);original.purchase({cpOrder:'MAIN-DIRECT'});
  assert.deepEqual(requests,[{cpOrder:'MAIN-DIRECT'}]);
  assert.equal(original.track('Loading_completed',{}),false);
});
console.log(`${passed} shared SDK scenarios passed.`);
