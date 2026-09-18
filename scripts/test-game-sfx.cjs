const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness: gameHarness } = require('./test-mushroom-interactions.cjs');
const dir = path.join(__dirname, '../PrehistoricBeastmaster/Resources/game');
const source = fs.readFileSync(path.join(dir, 'game-sfx.js'), 'utf8');
const assetSource = fs.readFileSync(path.join(dir, 'sfx-data.js'), 'utf8');
function target() {
    const events = new Map();
    return {
        id: '', dataset: {}, attributes: {}, textContent: '',
        addEventListener(name, callback) { if (!events.has(name)) events.set(name, []); events.get(name).push(callback); },
        emit(name, props = {}) { for (const fn of events.get(name) || []) fn({ type: name, isTrusted: true, target: this, ...props }); },
        setAttribute(name, value) { this.attributes[name] = value; },
        querySelector: () => null, closest: () => null
    };
}
function harness({ muted = false, brokenStorage = false, brokenDecode = false, noAudio = false, deferredResume = false } = {}) {
    const window = target(), document = target(), button = target(), pauseButton = target();
    button.id = 'menu-sfx-toggle';
    document.querySelectorAll = () => [button, pauseButton];
    const sources = [], resumes = [];
    let clock = 1000, ctx;
    const node = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
    class AudioContext {
        constructor() { ctx = this; this.state = 'suspended'; this.destination = {}; this.decoded = 0; }
        createDynamicsCompressor() { return Object.assign(node(), { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }); }
        decodeAudioData(bytes) { this.decoded++; return brokenDecode ? Promise.reject(new Error('decode')) : Promise.resolve({ bytes }); }
        createGain() { return Object.assign(node(), { gain: {} }); }
        createBufferSource() {
            const source = Object.assign(node(), {
                playbackRate: {}, started: false, stopped: false,
                start() { this.started = true; },
                stop() { this.stopped = true; this.onended?.(); }
            });
            sources.push(source); return source;
        }
        resume() {
            if (deferredResume) return new Promise(resolve => resumes.push(() => { this.state = 'running'; resolve(); }));
            this.state = 'running'; return Promise.resolve();
        }
        suspend() { this.state = 'suspended'; return Promise.resolve(); }
    }
    if (!noAudio) window.AudioContext = AudioContext;
    const storage = new Map(muted ? [['primal_runner_sfx_enabled_v1', '0']] : []);
    const context = vm.createContext({
        window, document, Uint8Array, atob: value => Buffer.from(value, 'base64').toString('binary'),
        performance: { now: () => clock },
        localStorage: {
            getItem(key) { if (brokenStorage) throw Error('storage'); return storage.get(key) ?? null; },
            setItem(key, value) { if (brokenStorage) throw Error('storage'); storage.set(key, value); }
        }
    });
    vm.runInContext(assetSource, context); vm.runInContext(source, context);
    return { window, document, button, pauseButton, sources, resumes, storage, sfx: window.GameSfx, assets: window.GameSfxAssets,
        get ctx() { return ctx; }, tick(ms) { clock += ms; }, gesture: () => document.emit('pointerdown'),
        active: () => sources.filter(s => s.started && !s.stopped && !s.disconnected) };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
let passed = 0;
async function test(name, body) { await body(); passed++; console.log(`PASS ${name}`); }
(async () => {
    await test('12 valid WAV assets, CC0 provenance, and embedded bytes exactly match', async () => {
        const h = harness(); await h.sfx.ready;
        assert.equal(Object.keys(h.assets.files).length, 12);
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'audio/sfx/manifest.json')));
        assert.equal(manifest.license, 'CC0-1.0');
        for (const [file, data] of Object.entries(h.assets.files)) {
            const original = fs.readFileSync(path.join(dir, 'audio/sfx', file));
            assert(Buffer.from(data, 'base64').equals(original));
            assert.equal(original.toString('ascii', 0, 4), 'RIFF');
            assert.equal(original.toString('ascii', 8, 12), 'WAVE');
            assert.equal(original.readUInt16LE(20), 1, 'standard PCM');
            assert.equal(original.readUInt16LE(34), 16);
            let peak = 0;
            for (let offset = 44; offset < original.length; offset += 2) peak = Math.max(peak, Math.abs(original.readInt16LE(offset)));
            assert.equal(peak, 27852, 'consistent, non-clipping headroom');
            assert(manifest.files[file].original.endsWith('.ogg'));
        }
        for (const cue of Object.values(h.assets.cues)) {
            assert(h.assets.files[cue.file]); assert(cue.volume > 0 && cue.volume <= .32);
        }
        for (const file of ['LICENSE-Kenney-New-Platformer.txt', 'LICENSE-Kenney-Interface.txt'])
            assert(fs.readFileSync(path.join(dir, 'audio/sfx', file), 'utf8').includes('CC0'));
    });
    await test('sounds decode before first input but never play without a gesture', async () => {
        const h = harness(); await h.sfx.ready;
        assert.equal(h.ctx.decoded, 12); assert.equal(h.sfx.play('jump'), false);
        h.gesture(); await settle(); assert.equal(h.sfx.play('jump'), true);
        assert.equal(h.sources[0].playbackRate.value, 1); assert.equal(h.ctx.decoded, 12);
    });
    await test('saved SFX mute persists independently of music preference', async () => {
        const h = harness({ muted: true }); await h.sfx.ready; h.gesture(); await settle();
        assert.equal(h.sfx.play('jump'), false);
        assert.equal(h.button.attributes['aria-pressed'], 'false');
        h.button.emit('click'); await settle(); h.tick(100);
        assert.equal(h.sfx.play('jump'), true);
        assert.equal(h.storage.get('primal_runner_music_enabled_v1'), undefined);
        assert.equal(h.pauseButton.attributes['aria-pressed'], 'true');
    });
    await test('repeated coin pickups are rate-limited, while a double jump remains distinct', async () => {
        const h = harness(); await h.sfx.ready; h.gesture(); await settle();
        assert(h.sfx.play('collect')); assert.equal(h.sfx.play('collect'), false);
        assert(h.sfx.play('jump')); assert(h.sfx.play('doubleJump'));
        h.tick(80); assert(h.sfx.play('collect'));
        assert(h.sources.some(s => s.playbackRate.value === 1.12));
    });
    await test('voice budget stays at six and low-priority UI cannot replace critical feedback', async () => {
        const h = harness(); await h.sfx.ready; h.gesture(); await settle();
        for (let i = 0; i < 6; i++) { h.tick(600); h.sfx.play('win'); }
        assert.equal(h.active().length, 6);
        assert.equal(h.sfx.play('ui'), false); assert.equal(h.active().length, 6);
        h.tick(600); assert(h.sfx.play('hurt')); assert.equal(h.active().length, 6);
    });
    await test('background, pagehide, native suspension, and online mode stop all effects', async () => {
        for (const mode of ['visibility', 'page', 'native', 'online']) {
            const h = harness(); await h.sfx.ready; h.gesture(); await settle(); h.sfx.play('jump');
            if (mode === 'visibility') { h.document.hidden = true; h.document.emit('visibilitychange'); }
            if (mode === 'page') h.window.emit('pagehide');
            if (mode === 'native') h.sfx.setAppActive(false);
            if (mode === 'online') h.sfx.setScreen('online');
            assert.equal(h.active().length, 0); assert.equal(h.sfx.play('hurt'), false);
        }
    });
    await test('muting immediately stops active voices and both controls stay synchronized', async () => {
        const h = harness(); await h.sfx.ready; h.gesture(); await settle(); h.sfx.play('jump');
        h.pauseButton.emit('click'); assert.equal(h.active().length, 0);
        assert.equal(h.button.textContent, '效關'); assert.equal(h.pauseButton.textContent, '音效：關');
    });
    await test('a delayed first unlock never plays a stale sound after navigation or background', async () => {
        for (const mode of ['navigation', 'background', 'late']) {
            const h = harness({ deferredResume: true }); await h.sfx.ready;
            h.gesture(); h.sfx.play('jump');
            if (mode === 'navigation') h.sfx.setScreen('mode');
            if (mode === 'background') h.sfx.setAppActive(false);
            if (mode === 'late') h.tick(150);
            h.resumes[0](); await settle(); assert.equal(h.active().length, 0);
        }
    });
    await test('first-gesture sound can start once resume completes promptly', async () => {
        const h = harness({ deferredResume: true }); await h.sfx.ready;
        h.gesture(); h.sfx.play('jump'); h.tick(15); h.resumes[0](); await settle();
        assert.equal(h.active().length, 1);
    });
    await test('unsupported audio, failed decoding, storage errors, and unknown names never break gameplay', async () => {
        for (const options of [{ noAudio: true }, { brokenDecode: true }, { brokenStorage: true }]) {
            const h = harness(options); await h.sfx.ready; h.gesture(); await settle();
            h.sfx.play('jump'); assert.equal(h.sfx.play('missing'), false); h.button.emit('click');
        }
    });
    await test('synthetic gestures cannot unlock playback', async () => {
        const h = harness(); await h.sfx.ready;
        h.document.emit('pointerdown', { isTrusted: false }); h.document.emit('click', { isTrusted: false });
        assert.equal(h.sfx.play('jump'), false);
    });
    await test('gameplay emits jump, double-jump, stomp/heal, collision, and defeat samples', () => {
        const played = [], sfx = { unlock() {}, play: name => played.push(name) };
        const jumper = gameHarness({ noObstacles: true, player: { grounded: true, y: 500 }, sfx }).game;
        jumper.jump(); jumper.releaseJump(); jumper.jump(); jumper.releaseJump(); jumper.jump();
        assert.deepEqual(played, ['jump', 'doubleJump']);
        for (const [options, expected] of [
            [{ lives: 2 }, 'heal'], [{ lives: 3 }, 'stomp'],
            [{ lives: 2, player: { grounded: true, y: 500, vy: 0 } }, 'hurt'],
            [{ lives: 1, player: { grounded: true, y: 500, vy: 0 } }, 'defeat']
        ]) {
            played.length = 0; gameHarness({ ...options, sfx }).game.update(.025); assert(played.includes(expected));
        }
    });
    await test('fruit healing and amber bundles use their matching sample rather than generic powerup', () => {
        const played = [], sfx = { unlock() {}, play: name => played.push(name) };
        const { game } = gameHarness({ noObstacles: true, lives: 2, sfx });
        game.collectPickup({ instant: 'heart', id: 'life', x: 50, y: 50, color: '#fff' });
        assert.equal(played.at(-1), 'heal');
        game.collectPickup({ id: 'amber', x: 50, y: 50, color: '#fff' });
        assert.equal(played.at(-1), 'gem');
        game.completeLevel(); assert.equal(played.at(-1), 'win');
    });
    await test('production uses downloaded samples and native lifecycle forwards to SFX', () => {
        const game = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
        assert(!game.includes('tone(')); assert(!game.includes('createOscillator'));
        const music = fs.readFileSync(path.join(dir, 'menu-music.js'), 'utf8');
        assert(music.includes('window.GameSfx?.setAppActive(appActive)'));
        assert(music.includes('window.GameSfx?.setScreen(name)'));
        assert(music.includes("if (nextState !== 'running' || restart) window.GameSfx?.stop()"));
    });
    console.log(`\n${passed} sound-effects tests passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
