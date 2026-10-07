import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {MiniGameTelemetry} from '../game-telemetry.mjs';
const sdk=readFileSync(new URL('../../../PrehistoricBeastmaster/Resources/js/game_sdk.js',import.meta.url),'utf8');
function setup(options={}){
  let time=1_000_000;const events=[];
  const host={location:{protocol:'file:'},webkit:{messageHandlers:{android:{postMessage:m=>{
    assert.equal(m.method,'sdkEvent');const e=JSON.parse(m.payload);events.push({name:e.name,fields:JSON.parse(e.json)});
  }}}}};
  vm.runInNewContext(sdk,{window:host});
  const telemetry=new MiniGameTelemetry(host,{now:()=>time,...options});
  return{host,telemetry,events,tick(ms){time+=ms;}};
}
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
test('opening, restoring, tutorial completion and result use the common SDK without duplicate revenue',()=>{
  const s=setup(),run={runId:'real-run',wave:1,stats:{kills:3}},account={playerId:'p1',label:'Hunter'};
  s.telemetry.open();s.telemetry.open();
  s.telemetry.start(run,account,true);s.telemetry.start(run,account,true);
  s.tick(42000);s.telemetry.tutorialComplete(run);s.telemetry.tutorialComplete(run);
  s.tick(8000);s.telemetry.complete(run,true);s.telemetry.complete(run,true);s.telemetry.leave();
  assert.deepEqual(s.events.map(e=>e.name),['mini_game_open','Loading_completed','mini_game_start','view_content','NewRole_Tutorial','Tutorial_Completed','mini_game_complete']);
  assert.ok(s.events.every(e=>e.fields.game_id==='emberwild'));
  assert.equal(s.events[2].fields.role_id,'emberwild:p1');assert.equal(s.events[5].fields.time_spent,42);
  assert.equal(s.events[6].fields.elapsed,50);assert.equal(s.events[6].fields.result,'win');assert.equal(s.events[6].fields.kills,3);
  assert.ok(s.events.every(e=>!('revenue' in e.fields)&&!('transaction_id' in e.fields)));
});
test('each run records its own result; leaving an unfinished run emits once',()=>{
  const s=setup(),first={runId:'first',wave:2},second={runId:'second',wave:3};
  s.telemetry.start(first);s.tick(2500);s.telemetry.leave();s.telemetry.leave();
  assert.equal(s.events.at(-1).name,'mini_game_leave');assert.equal(s.events.at(-1).fields.elapsed,2);
  s.telemetry.start(second);s.telemetry.complete(second,false);
  assert.equal(s.events.filter(e=>e.name==='mini_game_start').length,2);
  assert.equal(s.events.at(-1).fields.run_id,'second');assert.equal(s.events.at(-1).fields.result,'lose');
});
test('QA and tutorial practice never enter production gameplay reports',()=>{
  const s=setup();
  for(const id of ['qa-battle','practice-tutorial']){
    const run={runId:id};s.telemetry.start(run,null,true);s.telemetry.tutorialComplete(run);s.telemetry.complete(run,true);
  }
  s.telemetry.leave();assert.deepEqual(s.events,[]);
  const qa=setup({disabled:true});qa.telemetry.open();qa.telemetry.start({runId:'real-looking-id'});qa.telemetry.complete({runId:'real-looking-id'},true);
  assert.deepEqual(qa.events,[]);
});
test('only accepted registration reports a public identifier, never auth credentials',()=>{
  const s=setup();s.telemetry.registration({authenticated:false,playerId:'failed'});
  s.telemetry.registration({authenticated:true,playerId:'p1',accessToken:'secret',password:'secret'});
  assert.deepEqual(s.events,[{name:'complete_registration',fields:{method:'account',account_id:'p1',uid:'p1',game_id:'emberwild'}}]);
});
test('telemetry failure cannot throw into gameplay or replay old events when the bridge returns',()=>{
  const host={},events=[],telemetry=new MiniGameTelemetry(host);
  telemetry.open();telemetry.start({runId:'offline'});telemetry.complete({runId:'offline'},true);
  host.pbmGameSDK={track(name){events.push(name);return true;}};telemetry.open();telemetry.complete({runId:'offline'},true);
  assert.deepEqual(events,[]);host.pbmGameSDK.track=()=>{throw new Error('bridge unavailable');};
  assert.doesNotThrow(()=>telemetry.start({runId:'next'}));
});
console.log(`${passed} gameplay telemetry scenarios passed.`);
