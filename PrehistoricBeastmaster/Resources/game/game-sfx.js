(() => {
    'use strict';
    const assets = window.GameSfxAssets;
    if (!assets) return;
    const key = 'primal_runner_sfx_enabled_v1';
    const buffers = new Map(), voices = new Set(), lastPlayed = new Map();
    let enabled = true, unlocked = false, appActive = true, pageActive = true, screen = 'start';
    let context = null, output = null, resumeRequest = null, epoch = 0;
    try { enabled = localStorage.getItem(key) !== '0'; } catch (_) {}

    function allowed() { return enabled && appActive && pageActive && !document.hidden && screen !== 'online'; }
    function render() {
        document.querySelectorAll('[data-sfx-toggle]').forEach(button => {
            button.setAttribute('aria-pressed', String(enabled));
            button.setAttribute('aria-label', enabled ? '關閉遊戲音效' : '開啟遊戲音效');
            button.dataset.state = enabled ? 'on' : 'off';
            const label = button.querySelector('[data-sfx-label]') || button;
            label.textContent = button.id === 'menu-sfx-toggle' ? (enabled ? '效開' : '效關') : `音效：${enabled ? '開' : '關'}`;
        });
    }
    function dispose(voice) {
        if (!voices.delete(voice)) return;
        voice.source.disconnect(); voice.gain.disconnect();
    }
    function stop() {
        epoch++;
        for (const voice of [...voices]) {
            try { voice.source.stop(); } catch (_) {}
            dispose(voice);
        }
        lastPlayed.clear();
    }
    function prepare() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return Promise.resolve(false);
            context = new AudioCtx({ latencyHint: 'interactive' });
            output = context.createDynamicsCompressor();
            output.threshold.value = -12; output.knee.value = 8; output.ratio.value = 6;
            output.attack.value = .003; output.release.value = .08;
            output.connect(context.destination);
            // Embedded PCM works offline and avoids file:// fetch/CORS and OGG support differences.
            return Promise.all(Object.entries(assets.files).map(async ([file, base64]) => {
                try {
                    const raw = atob(base64), bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                    buffers.set(file, await context.decodeAudioData(bytes.buffer));
                } catch (_) { /* A missing/invalid sound must never interrupt a run. */ }
            })).then(() => buffers.size > 0);
        } catch (_) { return Promise.resolve(false); }
    }
    function unlock() {
        unlocked = true;
        if (!context || !allowed() || context.state === 'closed') return Promise.resolve(false);
        if (context.state === 'running') return Promise.resolve(true);
        if (!resumeRequest) {
            try {
                resumeRequest = Promise.resolve(context.resume()).then(() => {
                    if (!allowed()) { Promise.resolve(context.suspend()).catch(() => {}); return false; }
                    return context.state === 'running';
                }).catch(() => false).finally(() => { resumeRequest = null; });
            } catch (_) { return Promise.resolve(false); }
        }
        return resumeRequest;
    }
    function schedule(cue) {
        if (!allowed() || context?.state !== 'running') return false;
        if (voices.size >= 6) {
            const oldest = [...voices].filter(voice => voice.priority <= cue.priority)
                .sort((a, b) => a.priority - b.priority || a.started - b.started)[0];
            if (!oldest) return false;
            try { oldest.source.stop(); } catch (_) {}
            dispose(oldest);
        }
        try {
            const source = context.createBufferSource(), gain = context.createGain();
            source.buffer = buffers.get(cue.file);
            source.playbackRate.value = cue.rate;
            gain.gain.value = cue.volume;
            source.connect(gain); gain.connect(output);
            const voice = { source, gain, priority: cue.priority, started: performance.now() };
            voices.add(voice);
            source.onended = () => dispose(voice);
            try { source.start(); } catch (error) { dispose(voice); throw error; }
            return true;
        } catch (_) { return false; }
    }
    function play(name) {
        const cue = assets.cues[name], now = performance.now();
        if (!cue || !allowed() || !unlocked || !buffers.has(cue.file)) return false;
        if (now - (lastPlayed.get(name) ?? -Infinity) < cue.cooldown * 1000) return false;
        lastPlayed.set(name, now);
        if (context.state === 'running') return schedule(cue);
        // Allow the first tap to finish unlocking, but never play stale effects later.
        const requestEpoch = epoch;
        unlock().then(ready => {
            if (ready && requestEpoch === epoch && performance.now() - now < 120) schedule(cue);
        });
        return true;
    }
    function syncActivity() {
        if (!allowed()) {
            stop();
            if (context?.state === 'running') Promise.resolve(context.suspend()).catch(() => {});
        } else if (unlocked) unlock();
    }
    document.addEventListener('pointerdown', event => { if (event.isTrusted !== false) unlock(); }, { capture: true, passive: true });
    document.addEventListener('keydown', event => {
        if (event.isTrusted !== false && ['Enter', 'Space', 'ArrowUp'].includes(event.code)) unlock();
    }, { capture: true });
    document.addEventListener('click', event => {
        if (event.isTrusted === false) return;
        unlock();
        const button = event.target?.closest?.('button');
        if (!button || button.disabled || button.matches('[data-sfx-toggle], [data-menu-amber], [data-use-item], #hero-interaction, #jump-button, #menu-music-toggle, #open-online-game, [data-legal-url]')) return;
        if (button.matches('.primary, .secondary-action, .icon-button, .text-button, .how-to-play, .mode-tab, .shop-tab')) play('ui');
    });
    document.querySelectorAll('[data-sfx-toggle]').forEach(button => button.addEventListener('click', () => {
        enabled = !enabled;
        try { localStorage.setItem(key, enabled ? '1' : '0'); } catch (_) {}
        render(); syncActivity();
        if (enabled) { unlock(); play('ui'); }
    }));
    document.addEventListener('visibilitychange', syncActivity);
    window.addEventListener('pagehide', () => { pageActive = false; syncActivity(); });
    window.addEventListener('pageshow', () => { pageActive = true; syncActivity(); });
    window.GameSfx = Object.freeze({
        ready: prepare(), play, unlock, stop,
        setScreen(name) { if (screen !== name) stop(); screen = name; syncActivity(); },
        setAppActive(active) { appActive = Boolean(active); syncActivity(); }
    });
    render();
})();
