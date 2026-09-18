// Run with node scripts/test-menu-music.cjs. Media policy/state tests without audible playback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gameDir = path.join(__dirname, '../PrehistoricBeastmaster/Resources/game');
const source = fs.readFileSync(path.join(gameDir, 'menu-music.js'), 'utf8');
const key = 'primal_runner_music_enabled_v1';

function target() {
    const handlers = new Map();
    return {
        attributes: {}, dataset: {}, hidden: false, textContent: '',
        addEventListener(name, callback) {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name).push(callback);
        },
        emit(type, properties = {}) {
            for (const fn of handlers.get(type) || []) fn({ type, target: this, isTrusted: true, ...properties });
        },
        setAttribute(name, value) { this.attributes[name] = value; },
        closest() { return null; }
    };
}

function harness({ muted = false, brokenStorage = false, playMode = 'resolve', gamePlayMode = 'resolve' } = {}) {
    const document = target();
    const window = target();
    const button = target();
    const label = target();
    button.closest = selector => selector === '#menu-music-toggle' ? button : null;
    function makeAudio(playMode) {
        const pending = [];
        const audio = Object.assign(target(), {
        paused: true, currentTime: 0, error: null, playCount: 0, pauseCount: 0, loadCount: 0, playMode,
        play() {
            this.playCount++;
            if (this.playMode === 'reject') {
                return Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' }));
            }
            if (this.playMode === 'pending') return new Promise((resolve, reject) => pending.push({
                resolve: () => { this.paused = false; this.emit('playing'); resolve(); }, reject
            }));
            this.paused = false;
            this.emit('playing');
            return Promise.resolve();
        },
        pause() { this.pauseCount++; this.paused = true; this.emit('pause'); },
        load() { this.loadCount++; this.error = null; }
        });
        return { audio, pending };
    }
    const { audio, pending } = makeAudio(playMode);
    const { audio: gameAudio, pending: gamePending } = makeAudio(gamePlayMode);
    audio.dataset.src = 'audio/canopy-afternoon.mp3';
    gameAudio.dataset.src = 'audio/canopy-hop.m4a';
    const elements = { 'menu-music': audio, 'gameplay-music': gameAudio, 'menu-music-toggle': button, 'menu-music-label': label };
    document.getElementById = id => elements[id];
    const storage = new Map(muted ? [[key, '0']] : []);
    const localStorage = {
        getItem(name) { if (brokenStorage) throw new Error('storage unavailable'); return storage.get(name) ?? null; },
        setItem(name, value) { if (brokenStorage) throw new Error('storage unavailable'); storage.set(name, value); }
    };
    vm.runInNewContext(source, { document, window, localStorage });
    return {
        document, window, button, label, audio, gameAudio, storage, pending, gamePending,
        click: () => document.emit('click'),
        toggle: () => { document.emit('click', { target: button }); button.emit('click'); },
        screen: name => window.MenuMusic.setScreen(name),
        gameState: name => window.MenuMusic.setGameState(name),
        startGame: () => {
            window.MenuMusic.setGameState('running', { restart: true });
            window.MenuMusic.setScreen('game');
        },
        visibility: hidden => { document.hidden = hidden; document.emit('visibilitychange'); }
    };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
let passed = 0;
async function test(name, body) {
    await body();
    console.log(`PASS ${name}`);
    passed++;
}

(async () => {
    await test('both audio assets are bundled and script loads before game logic', () => {
        const html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
        assert(html.includes('data-src="audio/canopy-afternoon.mp3"'));
        assert(html.includes('data-src="audio/canopy-hop.m4a"'));
        assert(html.indexOf('src="native-music.js"') < html.indexOf('src="menu-music.js"'));
        assert(html.indexOf('src="menu-music.js"') < html.indexOf('src="game.js"'));
        assert(fs.statSync(path.join(gameDir, 'audio/canopy-afternoon.mp3')).size > 2000000);
        assert(fs.statSync(path.join(gameDir, 'audio/canopy-hop.m4a')).size > 4000000);
        const game = fs.readFileSync(path.join(gameDir, 'game.js'), 'utf8');
        assert(game.includes('window.MenuMusic?.setScreen(name)'));
        assert(game.includes("window.MenuMusic?.setScreen('online')"));
        const startGame = game.slice(game.indexOf('    function startGame('), game.indexOf('    function startGame(') + 650);
        assert(startGame.indexOf("setGameState('running', { restart: true })") < startGame.indexOf("showScreen('game')"));
        assert(startGame.indexOf("showScreen('game')") < startGame.indexOf('requestAnimationFrame'));
        for (const state of ['paused', 'running', 'ended']) assert(game.includes(`window.MenuMusic?.setGameState('${state}')`));
    });
    await test('waits for a user gesture, then loops one audio element', async () => {
        const h = harness();
        assert.equal(h.audio.playCount, 0);
        assert.equal(h.audio.preload, 'auto');
        assert.equal(h.gameAudio.preload, 'auto');
        assert.equal(h.audio.src, 'audio/canopy-afternoon.mp3');
        assert.equal(h.gameAudio.src, 'audio/canopy-hop.m4a');
        assert.equal(h.audio.loop, true);
        assert.equal(h.gameAudio.loop, true);
        assert.equal(h.label.textContent, '點播');
        h.click(); await settle();
        assert.equal(h.audio.paused, false);
        assert.equal(h.button.dataset.state, 'playing');
        assert.equal(h.audio.playCount, 1);
    });
    await test('menu navigation and repeated clicks never restart or overlap the song', async () => {
        const h = harness(); h.click(); await settle();
        h.audio.currentTime = 37;
        for (const screen of ['mode', 'tutorial', 'shop', 'ranking', 'start']) { h.screen(screen); h.click(); }
        await settle();
        assert.equal(h.audio.playCount, 1);
        assert.equal(h.audio.currentTime, 37);
    });
    await test('gameplay switches songs and keeps its control; returning resumes the menu position', async () => {
        const h = harness(); h.click(); await settle(); h.audio.currentTime = 25;
        h.startGame(); h.click(); await settle();
        assert.equal(h.audio.paused, true);
        assert.equal(h.gameAudio.paused, false);
        assert.equal(h.gameAudio.playCount, 1);
        assert.equal(h.button.hidden, false);
        assert.equal(h.button.dataset.screen, 'game');
        assert.equal(h.audio.playCount, 1);
        h.screen('start'); await settle();
        assert.equal(h.audio.paused, false);
        assert.equal(h.audio.currentTime, 25);
        assert.equal(h.gameAudio.paused, true);
        assert.equal(h.button.hidden, false);
    });
    await test('pause stops gameplay music and interactions cannot resume it; continue preserves position', async () => {
        const h = harness(); h.click(); h.startGame(); await settle(); h.gameAudio.currentTime = 68;
        h.gameState('paused'); h.click(); await settle();
        assert.equal(h.audio.paused, true);
        assert.equal(h.gameAudio.paused, true);
        assert.equal(h.button.dataset.state, 'paused');
        h.gameState('running'); await settle();
        assert.equal(h.gameAudio.paused, false);
        assert.equal(h.gameAudio.currentTime, 68);
    });
    await test('end screens stay silent; replay restarts only gameplay music', async () => {
        const h = harness(); h.click(); await settle(); h.audio.currentTime = 22;
        h.startGame(); await settle(); h.gameAudio.currentTime = 103;
        h.gameState('ended'); h.click(); await settle();
        assert.equal(h.gameAudio.paused, true);
        assert.equal(h.audio.paused, true);
        h.startGame(); await settle();
        assert.equal(h.gameAudio.paused, false);
        assert.equal(h.gameAudio.currentTime, 0);
        assert.equal(h.audio.currentTime, 22);
    });
    await test('the shared music switch mutes both contexts without restarting the active song', async () => {
        const h = harness(); h.click(); h.startGame(); await settle(); h.gameAudio.currentTime = 48;
        h.toggle(); h.click(); await settle();
        assert.equal(h.gameAudio.paused, true);
        assert.equal(h.storage.get(key), '0');
        h.screen('start'); await settle();
        assert.equal(h.audio.paused, true);
        h.startGame(); await settle();
        assert.equal(h.gameAudio.paused, true);
        h.toggle(); await settle();
        assert.equal(h.audio.paused, true);
        assert.equal(h.gameAudio.paused, false);
        h.gameAudio.currentTime = 19;
        h.toggle(); h.toggle(); await settle();
        assert.equal(h.gameAudio.currentTime, 19);
    });
    await test('toggling music while paused never resumes the run or starts the menu song', async () => {
        const h = harness(); h.click(); h.startGame(); await settle(); h.gameState('paused');
        h.toggle(); await settle(); assert.equal(h.storage.get(key), '0');
        h.toggle(); await settle(); assert.equal(h.storage.get(key), '1');
        assert.equal(h.gameAudio.paused, true);
        assert.equal(h.audio.paused, true);
        h.gameState('running'); await settle(); assert.equal(h.gameAudio.paused, false);
    });
    for (const mode of ['visibility', 'native', 'page']) {
        await test(`gameplay obeys ${mode} lifecycle suspension and the pause menu`, async () => {
            const h = harness(); h.click(); h.startGame(); await settle(); h.gameAudio.currentTime = 61;
            const active = on => mode === 'visibility' ? h.visibility(!on)
                : mode === 'native' ? h.window.setShellAppActive(on) : h.window.emit(on ? 'pageshow' : 'pagehide');
            active(false); h.click(); await settle();
            assert.equal(h.gameAudio.paused, true);
            assert.equal(h.audio.paused, true);
            active(true); await settle();
            assert.equal(h.gameAudio.paused, false);
            assert.equal(h.gameAudio.currentTime, 61);
            active(false); h.gameState('paused'); active(true); await settle();
            assert.equal(h.gameAudio.paused, true);
        });
    }
    await test('gameplay playback errors can be retried independently of the menu song', async () => {
        const h = harness({ gamePlayMode: 'reject' }); h.click(); h.startGame(); await settle();
        assert.equal(h.audio.paused, true);
        assert.equal(h.label.textContent, '點播');
        h.gameAudio.playMode = 'resolve'; h.click(); await settle();
        assert.equal(h.gameAudio.paused, false);
        h.gameAudio.pause(); h.gameAudio.error = { code: 3 }; h.gameAudio.emit('error');
        assert.equal(h.label.textContent, '重試');
        h.toggle(); await settle();
        assert.equal(h.gameAudio.loadCount, 1);
        assert.equal(h.gameAudio.paused, false);
        assert.equal(h.audio.paused, true);
    });
    await test('late menu play resolution cannot overlap an active game song', async () => {
        const h = harness({ playMode: 'pending' }); h.click(); h.startGame(); await settle();
        h.pending[0].resolve(); await settle();
        assert.equal(h.audio.paused, true);
        assert.equal(h.gameAudio.paused, false);
    });
    for (const action of ['menu', 'pause', 'mute', 'background']) {
        await test(`late gameplay play resolution stays silent after ${action}`, async () => {
            const h = harness({ gamePlayMode: 'pending' }); h.click(); h.startGame();
            if (action === 'menu') h.screen('start');
            else if (action === 'pause') h.gameState('paused');
            else if (action === 'mute') h.toggle();
            else h.visibility(true);
            h.gamePending[0].resolve(); await settle();
            assert.equal(h.gameAudio.paused, true);
            assert.equal(h.audio.paused, action !== 'menu');
        });
    }
    await test('online game does not inherit local menu music', async () => {
        const h = harness(); h.click(); await settle(); h.screen('online'); h.click();
        assert.equal(h.audio.paused, true);
        assert.equal(h.button.hidden, true);
    });
    await test('mute persists and regular interactions do not unmute', async () => {
        const h = harness(); h.click(); await settle(); h.toggle(); h.click();
        h.screen('shop'); h.window.emit('pageshow'); await settle();
        assert.equal(h.audio.paused, true);
        assert.equal(h.storage.get(key), '0');
        assert.equal(h.button.attributes['aria-pressed'], 'false');
        h.toggle(); await settle();
        assert.equal(h.audio.paused, false);
        assert.equal(h.storage.get(key), '1');
    });
    await test('saved mute is honored until explicitly enabled', async () => {
        const h = harness({ muted: true }); h.click(); await settle();
        assert.equal(h.audio.playCount, 0);
        h.toggle(); await settle();
        assert.equal(h.audio.playCount, 1);
    });
    await test('background pauses and foreground resumes only on menu screens', async () => {
        const h = harness(); h.click(); await settle();
        h.visibility(true); h.click();
        assert.equal(h.audio.paused, true);
        h.visibility(false); await settle();
        assert.equal(h.audio.paused, false);
        h.visibility(true); h.screen('game'); h.visibility(false); await settle();
        assert.equal(h.audio.paused, true);
    });
    await test('native iOS inactive state takes priority over document visibility', async () => {
        const h = harness(); h.click(); await settle();
        h.window.setShellAppActive(false); h.visibility(false); h.click();
        assert.equal(h.audio.paused, true);
        h.window.setShellAppActive(true); await settle();
        assert.equal(h.audio.paused, false);
        h.toggle(); h.window.setShellAppActive(false); h.window.setShellAppActive(true); await settle();
        assert.equal(h.audio.paused, true);
    });
    await test('pagehide/pageshow preserves playback position without sound while away', async () => {
        const h = harness(); h.click(); await settle(); h.audio.currentTime = 42;
        h.window.emit('pagehide'); h.visibility(false);
        assert.equal(h.audio.paused, true);
        h.window.emit('pageshow'); await settle();
        assert.equal(h.audio.currentTime, 42);
        assert.equal(h.audio.paused, false);
    });
    await test('autoplay rejection stays recoverable and is not an unhandled promise', async () => {
        const h = harness({ playMode: 'reject' }); h.click(); await settle();
        assert.equal(h.label.textContent, '點播');
        h.audio.playMode = 'resolve'; h.click(); await settle();
        assert.equal(h.audio.paused, false);
    });
    await test('file errors expose a retry that reloads the media', async () => {
        const h = harness(); h.audio.error = { code: 3 }; h.audio.emit('error');
        assert.equal(h.label.textContent, '重試');
        h.toggle(); await settle();
        assert.equal(h.audio.loadCount, 1);
        assert.equal(h.audio.paused, false);
    });
    for (const action of ['mute', 'game', 'background']) {
        await test(`late play resolution cannot leak sound after ${action}`, async () => {
            const h = harness({ playMode: 'pending' }); h.click();
            if (action === 'mute') h.toggle();
            else if (action === 'game') h.screen('game');
            else h.visibility(true);
            h.pending[0].resolve(); await settle();
            assert.equal(h.audio.paused, true);
        });
    }
    await test('out-of-order play results cannot stop a newer valid menu session', async () => {
        const h = harness({ playMode: 'pending' }); h.click(); h.screen('game'); h.screen('start');
        assert.equal(h.pending.length, 2);
        h.pending[1].resolve(); h.pending[0].resolve(); await settle();
        assert.equal(h.audio.paused, false);
        assert.equal(h.button.dataset.state, 'playing');
    });
    await test('private/disabled storage never prevents playback or mute', async () => {
        const h = harness({ brokenStorage: true }); h.click(); await settle(); h.toggle();
        assert.equal(h.audio.paused, true);
    });
    await test('keyboard activation works, while synthetic or unrelated events do not start music', async () => {
        const h = harness();
        h.document.emit('click', { isTrusted: false });
        h.document.emit('keydown', { code: 'ShiftLeft' });
        h.document.emit('keydown', { code: 'Space', target: h.button });
        assert.equal(h.audio.playCount, 0);
        h.document.emit('keydown', { code: 'Enter' }); await settle();
        assert.equal(h.audio.playCount, 1);
    });
    console.log(`\n${passed} background-music tests passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
