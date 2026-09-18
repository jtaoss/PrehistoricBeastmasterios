// Native bridge + the production music controller, without sound or device writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '../PrehistoricBeastmaster/Resources/game');
const adapterSource = fs.readFileSync(path.join(dir, 'native-music.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(dir, 'menu-music.js'), 'utf8');

function target() {
    const listeners = new Map();
    return {
        dataset: {}, attributes: {}, paused: true, closest: () => null,
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        emit(type, props = {}) { for (const fn of listeners.get(type) || []) fn({ type, isTrusted: true, target: this, ...props }); }
    };
}
function harness({ muted = false, active = true, hidden = false, protocol = 'file:', deferred = false, error = false } = {}) {
    const document = target(), window = target(), button = target(), label = target();
    const htmlMenu = target(), htmlGame = target();
    htmlMenu.dataset.src = 'audio/canopy-afternoon.mp3'; htmlGame.dataset.src = 'audio/canopy-hop.m4a';
    document.hidden = hidden;
    document.getElementById = id => ({ 'menu-music': htmlMenu, 'gameplay-music': htmlGame, 'menu-music-toggle': button, 'menu-music-label': label })[id];
    button.closest = () => button;
    const native = { menu: { playing: false, position: 0 }, game: { playing: false, position: 0 } };
    const calls = [], pending = [];
    const settings = { active, error };
    window.location = { protocol };
    window.webkit = { messageHandlers: { localMusic: { postMessage(body) {
        calls.push(body);
        if (settings.error && body.action === 'play') return Promise.reject(new Error('native audio unavailable'));
        const track = native[body.track];
        if (body.action === 'play') {
            if (!settings.active) return Promise.resolve({ error: 'NotAllowedError' });
            for (const item of Object.values(native)) item.playing = false;
            track.playing = true;
        } else if (body.action === 'pause') track.playing = false;
        else if (body.action === 'seek') track.position = body.position;
        const result = { position: track.position, playing: track.playing };
        if (deferred && body.action === 'play') return new Promise(resolve => pending.push(() => resolve(result)));
        return Promise.resolve(result);
    } } } };
    const storage = new Map(muted ? [['primal_runner_music_enabled_v1', '0']] : []);
    const context = vm.createContext({ window, document, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
    vm.runInContext(adapterSource, context);
    if (window.LocalMusic) vm.runInContext(controllerSource, context);
    return {
        window, document, native, calls, pending, settings, button, label, htmlMenu, htmlGame,
        start() { window.MenuMusic.setGameState('running', { restart: true }); window.MenuMusic.setScreen('game'); },
        screen: value => window.MenuMusic.setScreen(value),
        state: value => window.MenuMusic.setGameState(value),
        toggle: () => button.emit('click'),
        click: () => document.emit('click'),
        lifecycle(value) {
            settings.active = value;
            if (!value) for (const track of Object.values(native)) track.playing = false;
            window.setShellAppActive(value);
        }
    };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
let passed = 0;
async function test(name, body) { await body(); passed++; console.log(`PASS ${name}`); }

(async () => {
    await test('iOS starts menu music without a click and never loads duplicate HTML audio', async () => {
        const h = harness(); await settle();
        assert.equal(h.native.menu.playing, true);
        assert.equal(h.native.game.playing, false);
        assert.equal(h.calls.filter(x => x.action === 'play').length, 1);
        assert.equal(h.htmlMenu.src, undefined); assert.equal(h.htmlGame.src, undefined);
        assert.equal(h.button.dataset.state, 'playing');
    });
    await test('saved mute prevents native autoplay, including screen changes', async () => {
        const h = harness({ muted: true }); h.start(); h.click(); await settle();
        assert.equal(h.calls.some(x => x.action === 'play'), false);
        h.toggle(); await settle(); assert.equal(h.native.game.playing, true);
    });
    await test('a hidden initial page does not autoplay until visible', async () => {
        const h = harness({ hidden: true }); await settle();
        assert.equal(h.native.menu.playing, false);
        h.document.hidden = false; h.document.emit('visibilitychange'); await settle();
        assert.equal(h.native.menu.playing, true);
    });
    await test('a launch during inactive state automatically retries when iOS becomes active', async () => {
        const h = harness({ active: false }); await settle();
        assert.equal(h.native.menu.playing, false);
        h.lifecycle(true); await settle();
        assert.equal(h.native.menu.playing, true);
    });
    await test('native track switching is exclusive and preserves menu position', async () => {
        const h = harness(); await settle(); h.native.menu.position = 34;
        h.start(); await settle();
        assert.equal(h.native.menu.playing, false); assert.equal(h.native.game.playing, true);
        h.screen('start'); await settle();
        assert.equal(h.native.menu.playing, true); assert.equal(h.native.menu.position, 34);
        assert.equal(h.native.game.playing, false);
    });
    await test('pause/resume preserves gameplay position while a fresh run rewinds it', async () => {
        const h = harness(); h.start(); await settle(); h.native.game.position = 81;
        h.state('paused'); h.click(); await settle();
        assert.equal(h.native.game.playing, false);
        h.state('running'); await settle(); assert.equal(h.native.game.position, 81);
        h.state('ended'); h.click(); await settle(); assert.equal(h.native.game.playing, false);
        h.start(); await settle(); assert.equal(h.native.game.position, 0);
    });
    await test('background events cannot start either track and return respects paused gameplay', async () => {
        const h = harness(); h.start(); await settle();
        h.lifecycle(false); h.click(); await settle();
        assert.equal(h.native.menu.playing, false); assert.equal(h.native.game.playing, false);
        h.state('paused'); h.lifecycle(true); await settle(); assert.equal(h.native.game.playing, false);
        h.state('running'); await settle(); assert.equal(h.native.game.playing, true);
    });
    await test('rapid switches with late replies cannot restart the wrong song', async () => {
        const h = harness({ deferred: true });
        h.start(); h.screen('start');
        for (const resolve of [...h.pending].reverse()) resolve();
        await settle();
        assert.equal(h.native.menu.playing, true); assert.equal(h.native.game.playing, false);
        assert.equal(h.button.dataset.state, 'playing');
    });
    await test('muting during a pending native play cannot leak sound after its reply', async () => {
        const h = harness({ deferred: true }); h.toggle(); h.pending[0](); await settle();
        assert.equal(h.native.menu.playing, false); assert.equal(h.button.dataset.state, 'off');
    });
    await test('playback failure remains retryable and does not enable web audio in parallel', async () => {
        const h = harness({ error: true }); await settle(); assert.equal(h.label.textContent, '重試');
        h.settings.error = false; h.toggle(); await settle();
        assert.equal(h.native.menu.playing, true); assert.equal(h.htmlMenu.src, undefined);
    });
    await test('external pages never activate the native adapter', () => {
        const h = harness({ protocol: 'https:' });
        assert.equal(h.window.LocalMusic, undefined); assert.equal(h.calls.length, 0);
    });
    await test('native access is main-frame and exact-local-file only, with a two-track allowlist', () => {
        const swift = fs.readFileSync(path.join(__dirname, '../PrehistoricBeastmaster/Web/LocalMusicPlayer.swift'), 'utf8');
        assert(swift.includes('message.frameInfo.isMainFrame, isLocal(message.frameInfo.request.url), isLocal(webView?.url)'));
        assert(swift.includes('url.standardizedFileURL.path == expected.standardizedFileURL.path'));
        assert(swift.includes('files[key] != nil'));
        assert(swift.includes('UIApplication.shared.applicationState == .active, !interrupted'));
        const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
        assert(html.indexOf('src="native-music.js"') < html.indexOf('src="menu-music.js"'));
    });
    console.log(`\n${passed} native-music tests passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
