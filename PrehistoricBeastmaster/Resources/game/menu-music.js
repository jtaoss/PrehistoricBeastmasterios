(() => {
    'use strict';

    const nativeMusic = window.LocalMusic;
    function makeTrack(key, id) {
        const element = document.getElementById(id);
        const audio = nativeMusic ? nativeMusic.createTrack(key) : element;
        // Do not fetch/decode a second web copy when iOS is playing the native file.
        if (!nativeMusic) { element.preload = 'auto'; element.src = element.dataset.src; }
        return { audio, status: 'ready', requestId: 0, pending: false };
    }
    const tracks = { menu: makeTrack('menu', 'menu-music'), game: makeTrack('game', 'gameplay-music') };
    const button = document.getElementById('menu-music-toggle');
    const label = document.getElementById('menu-music-label');
    const preferenceKey = 'primal_runner_music_enabled_v1';
    const menuScreens = new Set(['start', 'mode', 'tutorial', 'shop', 'ranking']);
    let enabled = true;
    try { enabled = localStorage.getItem(preferenceKey) !== '0'; } catch (_) {}
    let unlocked = Boolean(nativeMusic);
    let screen = 'start';
    let gameState = 'idle';
    let pageActive = true;
    let appActive = true;

    // Each track keeps its own position; exactly one may play at any time.
    for (const track of Object.values(tracks)) {
        track.audio.loop = true;
        track.audio.volume = .4;
    }

    function desiredTrack() {
        if (!enabled || !unlocked || !pageActive || !appActive || document.hidden) return null;
        if (menuScreens.has(screen)) return tracks.menu;
        if (screen === 'game' && gameState === 'running') return tracks.game;
        return null;
    }

    function render() {
        const inGame = screen === 'game';
        const track = inGame ? tracks.game : tracks.menu;
        const waitingInGame = inGame && gameState !== 'running';
        button.hidden = !menuScreens.has(screen) && !inGame;
        button.dataset.screen = screen;
        button.setAttribute('aria-pressed', String(enabled));
        button.dataset.state = !enabled ? 'off' : waitingInGame ? 'paused' : track.status;
        const canDisable = enabled && (track.status === 'playing' || track.status === 'loading' || waitingInGame);
        const description = !enabled ? '開啟背景音樂'
            : canDisable ? '關閉背景音樂'
                : track.status === 'error' ? '重新載入背景音樂' : '播放背景音樂';
        button.setAttribute('aria-label', description);
        button.title = description;
        label.textContent = !enabled ? '關' : canDisable ? '開' : track.status === 'error' ? '重試' : '點播';
    }

    function stop(track) {
        track.requestId += 1;
        track.pending = false;
        track.audio.pause();
        track.status = 'ready';
    }

    function sync() {
        const track = desiredTrack();
        for (const other of Object.values(tracks)) {
            if (other !== track) stop(other);
        }
        if (!track) {
            render();
            return;
        }
        const audio = track.audio;
        if (track.pending || !audio.paused) {
            render();
            return;
        }
        const currentRequest = ++track.requestId;
        track.pending = true;
        track.status = 'loading';
        render();
        function failed(error) {
            if (currentRequest !== track.requestId) return;
            track.pending = false;
            track.status = error?.name === 'NotAllowedError' || error?.name === 'AbortError' ? 'ready' : 'error';
            render();
        }
        try {
            // Keep play() synchronous with the first click to satisfy mobile autoplay rules.
            const result = audio.play();
            Promise.resolve(result).then(() => {
                if (currentRequest !== track.requestId) {
                    if (desiredTrack() !== track) audio.pause();
                    return;
                }
                track.pending = false;
                if (desiredTrack() !== track) stop(track);
                else track.status = 'playing';
                render();
            }, failed);
        } catch (error) {
            failed(error);
        }
    }

    function unlock(event) {
        if (event.isTrusted === false || event.target?.closest?.('#menu-music-toggle')) return;
        if (event.type === 'keydown' && !['Enter', 'Space', 'ArrowUp'].includes(event.code)) return;
        unlocked = true;
        sync();
    }

    button.addEventListener('click', () => {
        const track = screen === 'game' ? tracks.game : tracks.menu;
        const waitingInGame = screen === 'game' && gameState !== 'running';
        if (enabled && (track.pending || !track.audio.paused || waitingInGame)) enabled = false;
        else {
            enabled = true;
            unlocked = true;
            if (track.audio.error) track.audio.load();
        }
        try { localStorage.setItem(preferenceKey, enabled ? '1' : '0'); } catch (_) {}
        sync();
    });
    document.addEventListener('click', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => { pageActive = false; sync(); });
    window.addEventListener('pageshow', () => { pageActive = true; sync(); });
    for (const track of Object.values(tracks)) {
        track.audio.addEventListener('playing', () => {
            if (desiredTrack() !== track) stop(track);
            else track.status = 'playing';
            render();
        });
        track.audio.addEventListener('pause', () => {
            if (!track.pending) { track.status = 'ready'; render(); }
        });
        track.audio.addEventListener('error', () => {
            track.requestId += 1;
            track.pending = false;
            track.status = 'error';
            render();
        });
    }

    window.MenuMusic = Object.freeze({
        setScreen(name) {
            window.GameSfx?.setScreen(name);
            screen = name;
            if (name !== 'game') gameState = 'idle';
            sync();
        },
        setGameState(nextState, { restart = false } = {}) {
            if (nextState !== 'running' || restart) window.GameSfx?.stop();
            gameState = nextState;
            if (restart) {
                stop(tracks.game);
                try { tracks.game.audio.currentTime = 0; } catch (_) {}
            }
            sync();
        }
    });
    // Called only for the local game by the native iOS lifecycle handlers.
    window.setShellAppActive = (active) => {
        appActive = Boolean(active);
        window.GameSfx?.setAppActive(appActive);
        sync();
    };
    sync();
})();
