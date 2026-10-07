import assert from 'node:assert/strict';
import { BackgroundMusic, ambientScene, musicScene, AMBIENT_TRACK, BATTLE_TRACK } from '../background-music.mjs';

class Media extends EventTarget {
  paused = true;
  currentTime = 0;
  calls = 0;
  play() { ++this.calls; this.paused = false; return this.attempt?.() ?? Promise.resolve(); }
  pause() { this.paused = true; }
}
function setup() {
  const document = new EventTarget(), window = new EventTarget(), media = new Media(), battle = new Media();
  document.hidden = false;
  let creates = 0;
  const music = new BackgroundMusic({ document, window, createAudio: src => { ++creates; return src === BATTLE_TRACK ? battle : media; } });
  const gesture = () => document.dispatchEvent(new Event('pointerdown'));
  const shell = active => window.dispatchEvent(new CustomEvent('emberwild-shell-active', { detail: { active } }));
  const select = (track, volume = .65) => music.setState({ track, volume });
  const state = (ambient = true, volume = .65) => select(ambient ? 'ambient' : null, volume);
  const send = (target, name) => target.dispatchEvent(new Event(name));
  return { document, window, media, battle, music, gesture, shell, state, select, send, get creates() { return creates; } };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
let passed = 0;
async function test(name, run) { await run(); ++passed; console.log('PASS', name); }

await test('only non-combat scenes opt into ambient music', () => {
  assert.match(AMBIENT_TRACK, /assets\/audio\/warmth-of-a-primeval-dawn\.mp3$/);
  for (const screen of ['landing', 'camp', 'route']) assert.equal(ambientScene({ screen, phase: 'wave' }), true);
  for (const phase of ['wave', 'prep', 'rest']) {
    for (const modal of ['', 'pause', 'settings', 'restored', 'companion']) {
      assert.equal(ambientScene({ screen: 'game', phase, modal }), false);
    }
  }
  assert.equal(ambientScene({ screen: 'game', phase: 'rest', modal: 'merchant' }), true);
  assert.equal(ambientScene({ screen: 'game', phase: 'wave', modal: 'merchant' }), false);
  assert.equal(ambientScene({ screen: 'game', phase: 'win', modal: 'end' }), true);
  assert.equal(ambientScene({ screen: 'game', phase: 'lose', modal: 'end' }), true);
  assert.equal(ambientScene({ screen: 'unknown' }), false);
});

await test('battle scene covers all arena phases but excludes paused, modal and finished battles', () => {
  assert.match(BATTLE_TRACK, /assets\/audio\/hold-the-ridge\.mp3$/);
  for (const screen of ['landing', 'camp', 'route']) assert.equal(musicScene({ screen, phase: 'wave', paused: true }), 'ambient');
  for (const phase of ['prep', 'wave', 'rest']) {
    assert.equal(musicScene({ screen: 'game', phase }), 'battle');
    assert.equal(musicScene({ screen: 'game', phase, paused: true }), null);
    for (const modal of ['pause', 'settings', 'restored', 'companion', 'save-error']) {
      assert.equal(musicScene({ screen: 'game', phase, modal }), null);
    }
  }
  for (const phase of ['win', 'lose']) {
    assert.equal(musicScene({ screen: 'game', phase }), null);
    assert.equal(musicScene({ screen: 'game', phase, modal: 'end', paused: true }), 'ambient');
  }
  assert.equal(musicScene({ screen: 'game', phase: 'rest', modal: 'merchant', paused: true }), 'ambient');
  assert.equal(musicScene({ screen: 'game', phase: 'wave', modal: 'merchant', paused: true }), null);
});

await test('lazy loading, first gesture, looping and no duplicate player or play calls', async () => {
  const s = setup(); s.state(); assert.equal(s.creates, 0);
  s.gesture(); await flush(); assert.equal(s.creates, 1); assert.equal(s.media.paused, false);
  assert.equal(s.media.loop, true); assert.equal(s.media.volume, .65 * .55);
  s.media.currentTime = 42;
  for (let i = 0; i < 10; ++i) { s.state(); s.gesture(); }
  assert.equal(s.creates, 1); assert.equal(s.media.calls, 1); assert.equal(s.media.currentTime, 42);
  s.music.dispose();
});

await test('battle stops immediately and returning home preserves playback position', async () => {
  const s = setup(); s.state(); s.gesture(); await flush(); s.media.currentTime = 15;
  s.state(false); assert.equal(s.media.paused, true);
  s.gesture(); assert.equal(s.media.calls, 1);
  s.state(); await flush(); assert.equal(s.media.paused, false); assert.equal(s.media.currentTime, 15);
  s.music.dispose();
});

await test('mute and live volume affect the current player without resetting the playhead', async () => {
  const s = setup(); s.state(true, 0); s.gesture(); assert.equal(s.creates, 0);
  s.state(true, .4); await flush(); assert.equal(s.media.volume, .4 * .55);
  s.media.currentTime = 8; s.state(true, .8); assert.equal(s.media.calls, 1);
  s.state(true, 0); assert.equal(s.media.paused, true); assert.equal(s.media.muted, true);
  s.state(true, .3); await flush(); assert.equal(s.media.muted, false); assert.equal(s.media.currentTime, 8);
  s.music.dispose();
});

await test('document visibility, focus, page cache and native lifecycle all gate playback', async () => {
  const s = setup(); s.state(); s.gesture(); await flush();
  s.document.hidden = true; s.send(s.document, 'visibilitychange'); assert.equal(s.media.paused, true);
  s.document.hidden = false; s.send(s.document, 'visibilitychange'); await flush(); assert.equal(s.media.paused, false);
  s.send(s.window, 'blur'); assert.equal(s.media.paused, true);
  s.send(s.window, 'focus'); await flush(); assert.equal(s.media.paused, false);
  s.send(s.window, 'pagehide'); assert.equal(s.media.paused, true);
  s.gesture(); assert.equal(s.media.paused, true);
  s.send(s.window, 'pageshow'); await flush(); assert.equal(s.media.paused, false);
  s.shell(false); assert.equal(s.media.paused, true);
  s.gesture(); assert.equal(s.media.paused, true);
  s.shell(true); await flush(); assert.equal(s.media.paused, false);
  s.state(false); s.shell(false); s.shell(true); assert.equal(s.media.paused, true);
  s.music.dispose();
});

await test('autoplay rejection is handled and only a later gesture retries', async () => {
  const s = setup(); s.media.attempt = () => Promise.reject(new Error('NotAllowedError'));
  s.state(); s.gesture(); await flush(); assert.equal(s.music.blocked, true); assert.equal(s.media.paused, true);
  for (let i = 0; i < 100; ++i) { s.state(); s.music.sync(); }
  assert.equal(s.media.calls, 1);
  s.media.attempt = null; s.send(s.document, 'touchend'); await flush();
  assert.equal(s.media.paused, false); assert.equal(s.media.calls, 2);
  s.music.dispose();
});

await test('late play resolution cannot leak music into combat', async () => {
  const s = setup(); let resolve;
  s.media.attempt = () => new Promise(done => { resolve = done; });
  s.state(); s.gesture(); assert.equal(s.music.pending, true);
  s.state(false); resolve(); await flush(); assert.equal(s.media.paused, true);
  assert.equal(s.music.pending, false); s.music.dispose();
});

await test('an obsolete play rejection cannot stop a newer playback request', async () => {
  const s = setup(); let reject;
  s.media.attempt = () => new Promise((_, fail) => { reject = fail; });
  s.state(); s.gesture(); s.state(false);
  s.media.attempt = null; s.state(); await flush(); reject(new Error('AbortError')); await flush();
  assert.equal(s.media.paused, false); assert.equal(s.music.blocked, false);
  assert.equal(s.media.calls, 2); s.music.dispose();
});

await test('decode errors and synchronous play failures do not throw or retry every frame', async () => {
  const s = setup(); s.state(); s.gesture(); await flush();
  s.send(s.media, 'error'); assert.equal(s.media.paused, true); assert.equal(s.music.blocked, true);
  s.music.sync(); assert.equal(s.media.calls, 1);
  s.media.attempt = () => { throw new Error('Unsupported audio'); };
  assert.doesNotThrow(s.gesture); assert.equal(s.music.blocked, true); assert.equal(s.media.paused, true);
  s.music.dispose();
});

await test('dispose detaches lifecycle and gesture handlers', async () => {
  const s = setup(); s.state(); s.gesture(); await flush();
  s.music.dispose(); assert.equal(s.media.paused, true);
  s.gesture(); s.send(s.window, 'focus'); s.shell(true); s.state(false); s.state();
  assert.equal(s.media.calls, 1);
});

await test('scene switches are exclusive, lazy and retain both playheads', async () => {
  const s = setup(); s.state(); s.gesture(); await flush(); s.media.currentTime = 15;
  s.battle.attempt = () => { assert.equal(s.media.paused, true, 'ambient stops before battle plays'); return Promise.resolve(); };
  s.select('battle'); await flush();
  assert.equal(s.music.media, s.battle); assert.equal(s.battle.loop, true);
  assert.equal(s.battle.paused, false); assert.equal(s.creates, 2); s.battle.currentTime = 27;
  s.state(); await flush(); assert.equal(s.battle.paused, true); assert.equal(s.media.paused, false);
  assert.equal(s.media.currentTime, 15);
  s.select('battle'); await flush(); assert.equal(s.battle.currentTime, 27);
  assert.equal(s.media.paused, true); assert.equal(s.creates, 2);
  s.music.dispose(); assert.equal(s.battle.paused, true);
});

await test('mute, pause and background apply to battle without starting ambient', async () => {
  const s = setup(); s.select('battle', 0); s.gesture(); assert.equal(s.creates, 0);
  s.select('battle', .4); await flush(); assert.equal(s.battle.volume, .4 * .55);
  assert.equal(s.media.calls, 0); s.battle.currentTime = 12;
  s.select(null); assert.equal(s.battle.paused, true);
  s.gesture(); s.shell(false); s.shell(true); assert.equal(s.battle.paused, true);
  s.select('battle', .4); await flush(); assert.equal(s.battle.currentTime, 12);
  s.document.hidden = true; s.send(s.document, 'visibilitychange'); assert.equal(s.battle.paused, true);
  s.document.hidden = false; s.send(s.document, 'visibilitychange'); await flush(); assert.equal(s.battle.paused, false);
  s.select('battle', 0); assert.equal(s.battle.muted, true); assert.equal(s.battle.paused, true);
  s.select('ambient', 0); assert.equal(s.creates, 1); assert.equal(s.media.calls, 0);
  s.music.dispose();
});

await test('late outgoing play rejection and error cannot stop the incoming battle track', async () => {
  const s = setup(); let reject;
  s.media.attempt = () => new Promise((_, fail) => { reject = fail; });
  s.state(); s.gesture(); s.select('battle'); await flush();
  reject(new Error('AbortError')); s.send(s.media, 'error'); await flush();
  assert.equal(s.media.paused, true); assert.equal(s.battle.paused, false); assert.equal(s.music.blocked, false);
  s.music.dispose();
});

await test('battle load failure does not prevent returning to home music', async () => {
  const s = setup(); s.battle.attempt = () => Promise.reject(new Error('Decode failed'));
  s.select('battle'); s.gesture(); await flush();
  assert.equal(s.battle.paused, true); assert.equal(s.music.blocked, true);
  s.state(); await flush(); assert.equal(s.media.paused, false); assert.equal(s.battle.paused, true);
  s.music.dispose();
});

console.log(`PASS ${passed} background-music scenarios`);
