(() => {
    'use strict';
    const bridge = window.webkit?.messageHandlers?.localMusic;
    if (!bridge || window.location.protocol !== 'file:') return;

    // Small audio-element adapter: the existing music state machine remains the owner.
    function createTrack(track) {
        const listeners = new Map();
        let version = 0;
        let position = 0;
        let playRequested = false;
        const emit = type => { for (const listener of listeners.get(type) || []) listener(); };
        function send(action, fields = {}) {
            try {
                return Promise.resolve(bridge.postMessage({ action, track, ...fields })).then(result => {
                    if (result?.error) throw Object.assign(new Error(result.error), { name: result.error });
                    return result;
                });
            } catch (error) { return Promise.reject(error); }
        }
        const audio = {
            paused: true, error: null, volume: .4, loop: true,
            get currentTime() { return position; },
            set currentTime(value) {
                position = value;
                const request = ++version;
                send('seek', { position: value }).catch(error => {
                    if (request === version) { audio.error = error; emit('error'); }
                });
            },
            addEventListener(type, listener) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(listener);
            },
            play() {
                const request = ++version;
                playRequested = true;
                audio.paused = false;
                return send('play', { volume: audio.volume }).then(result => {
                    if (request !== version) return;
                    position = result.position;
                    audio.error = null;
                    emit('playing');
                }, error => {
                    if (request === version) {
                        playRequested = false;
                        audio.paused = true;
                    }
                    throw error;
                });
            },
            pause() {
                if (!playRequested && audio.paused) return;
                const request = ++version;
                playRequested = false;
                audio.paused = true;
                emit('pause');
                send('pause').then(result => {
                    if (request === version) position = result.position;
                }).catch(() => {});
            },
            load() {
                audio.error = null;
                send('prepare').catch(error => { audio.error = error; emit('error'); });
            }
        };
        return audio;
    }
    window.LocalMusic = Object.freeze({ createTrack });
})();
