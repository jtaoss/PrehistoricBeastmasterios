// Real iOS bridge, fake game/clock/storage. Never loads a game or sends SDK traffic.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../PrehistoricBeastmaster/Resources/js/analytics_bridge.js'), 'utf8');
function setup({values = new Map(), brokenStorage = false, forwardToSdk = false} = {}) {
  let now = 1_000_000, balance = 0, next = 0, step = 8, failSend = false;
  const events = [], timers = new Map(), intervals = new Map();
  const data = {player: {base: {id: 'role-a', nick: 'Test Role', serverId: '1'}}, getItemNum: () => balance};
  const window = {
    GameData: {getInstance: () => data}, AuthData: {getInstance: () => ({uid: 'test-user'})},
    platform: {AF_Event_Name(name, value) { if (forwardToSdk) window.xmwsdk.AFStaticEvent(name, value); return 'original-result'; }},
    xmwsdk: {AFStaticEvent() {}, complete_registration() {}},
    TaskLogic: {getInstance: () => ({getTaskId: () => step})}, performance: {now: () => 5000},
    localStorage: {
      getItem(k) { if (brokenStorage) throw Error('unavailable'); return values.get(k) ?? null; },
      setItem(k, v) { if (brokenStorage) throw Error('unavailable'); values.set(k, String(v)); }
    },
    android: {sdkEvent(name, json) { if (failSend) throw Error('not ready'); events.push({name, fields: JSON.parse(json)}); }}
  };
  class FakeDate extends Date { static now() { return now; } }
  const context = vm.createContext({window, console: {warn() {}}, Date: FakeDate,
    setTimeout(fn, ms) { const id = ++next; timers.set(id, {fn, at: now + ms}); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { const id = ++next; intervals.set(id, {fn, ms}); return id; },
    clearInterval: id => intervals.delete(id)
  });
  vm.runInContext(source, context);
  return {events, window, data, values,
    balance(v) { balance = v; }, fail(v) { failSend = v; }, step(v) { step = v; },
    tick(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } },
    poll() { [...intervals.values()].find(i => i.ms === 2000).fn(); },
    monitor() { [...intervals.values()].find(i => i.ms === 500).fn(); },
    event(name, value) { return window.platform.AF_Event_Name(name, value); },
    reinject() { vm.runInContext(source, context); },
    named(name) { return events.filter(e => e.name === name); }
  };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('tutorial start emits the five-minute milestone once with the current step', () => {
  const s = setup(); s.event('NewRole_Tutorial'); s.tick(299999);
  assert.equal(s.named('NewRole_5minute').length, 0);
  s.tick(1); s.monitor(); s.tick(600000);
  assert.equal(s.named('NewRole_5minute').length, 1);
  assert.equal(s.named('NewRole_5minute')[0].fields.current_step, 8);
});
test('tutorial completion does not suppress the five-minute funnel milestone', () => {
  const s = setup(); s.event('NewRole_Tutorial'); s.tick(1000); s.event('tutorial_complete'); s.tick(600000);
  assert.equal(s.named('NewRole_5minute').length, 1);
});
test('role switching cannot attach an old five-minute timer to the new role', () => {
  const s = setup(); s.event('NewRole_Tutorial'); s.data.player.base.id = 'role-b'; s.tick(600000); s.monitor();
  assert.equal(s.named('NewRole_5minute').length, 0);
  s.data.player.base.id = 'role-a'; s.monitor(); s.tick(0);
  assert.deepEqual(s.named('NewRole_5minute').map(e => e.fields.role_id), ['role-a']);
});
test('actual task signal keeps current step, marks the fallback sent, and preserves the original return value', () => {
  const s = setup({forwardToSdk: true});
  s.event('NewRole_Tutorial');
  assert.equal(s.event('NewRole_5minute'), 'original-result');
  assert.equal(s.named('NewRole_5minute').length, 1);
  assert.equal(s.named('NewRole_5minute')[0].fields.current_step, 8);
  s.tick(600000); s.monitor();
  assert.equal(s.named('NewRole_5minute').length, 1);
});
test('fast role changes do not collapse distinct role events', () => {
  const s = setup(); s.event('NewRole_5minute'); s.data.player.base.id = 'role-b'; s.event('NewRole_5minute');
  assert.deepEqual(s.named('NewRole_5minute').map(e => e.fields.role_id), ['role-a', 'role-b']);
});
test('first loaded balance at or above threshold reports once', () => {
  for (const balance of [300000, 350000]) {
    const s = setup(); s.balance(balance); s.poll(); s.tick(2000); s.poll();
    assert.equal(s.named('have_300_thousand').length, 1);
    assert.equal(s.named('have_300_thousand')[0].fields.current_balance, balance);
  }
});
test('threshold crossing reports, but spending and earning again does not repeat it', () => {
  const s = setup(); s.balance(299999); s.poll(); assert.equal(s.events.length, 0);
  s.balance(300000); s.poll(); s.balance(0); s.poll(); s.tick(2000); s.balance(400000); s.poll();
  assert.equal(s.named('have_300_thousand').length, 1);
});
test('persisted milestone prevents repeat after page reload', () => {
  const s = setup(); s.balance(350000); s.poll();
  const reload = setup({values: s.values}); reload.balance(350000); reload.poll();
  assert.equal(reload.events.length, 0);
});
test('legacy balance snapshot does not suppress the first eligible report', () => {
  const s = setup(); s.values.set('__shell_analytics_stone_balance_test-user|1|role-a', '350000');
  s.balance(350000); s.poll(); assert.equal(s.named('have_300_thousand').length, 1);
});
test('unavailable storage keeps a document-local duplicate guard', () => {
  const s = setup({brokenStorage: true}); s.balance(350000); s.poll(); s.tick(2000); s.poll();
  assert.equal(s.named('have_300_thousand').length, 1);
});
test('failed bridge send retries without marking the milestone delivered', () => {
  const s = setup(); s.balance(350000); s.fail(true); s.poll(); assert.equal(s.events.length, 0);
  s.fail(false); s.poll(); assert.equal(s.named('have_300_thousand').length, 1);
});
test('stone polling waits for a role and handles rapid role changes separately', () => {
  const s = setup(); s.balance(350000); s.data.player.base.id = ''; s.poll(); assert.equal(s.events.length, 0);
  s.data.player.base.id = 'role-a'; s.poll(); s.data.player.base.id = 'role-b'; s.poll();
  assert.deepEqual(s.named('have_300_thousand').map(e => e.fields.role_id), ['role-a', 'role-b']);
});
test('missing role does not store anonymous tutorial time or force a false zero duration', () => {
  const s = setup(); s.data.player.base.id = ''; s.event('NewRole_Tutorial'); s.tick(42000); s.event('tutorial_complete');
  assert.equal(s.values.size, 0);
  assert.equal(Object.hasOwn(s.named('tutorial_complete')[0].fields, 'time_spent'), false);
});
test('known-role tutorial duration is retained', () => {
  const s = setup(); s.event('NewRole_Tutorial'); s.tick(42000); s.event('Tutorial_Completed');
  assert.equal(s.named('tutorial_complete')[0].fields.time_spent, 42);
});
test('retention values, registration source distinction and bridge reinjection stay compatible', () => {
  const s = setup(); s.reinject(); s.monitor();
  for (const day of [2,3,7]) s.event('KeepEvent', day);
  assert.deepEqual(s.events.map(e => [e.name,e.fields.days_diff]), [['next_day_login',1],['3_days_login',2],['7_days_login',6]]);
  s.event('complete_registration'); assert.equal(s.named('complete_avatar').length, 1);
  assert.equal(s.named('complete_registration').length, 0);
  s.window.xmwsdk.complete_registration(); assert.equal(s.named('complete_registration').length, 1);
});
console.log(`${passed} analytics bridge tests passed (isolated, no SDK traffic).`);
