export const AMBIENT_TRACK = new URL('./assets/audio/warmth-of-a-primeval-dawn.mp3', import.meta.url).href;
export const BATTLE_TRACK = new URL('./assets/audio/hold-the-ridge.mp3', import.meta.url).href;
const TRACKS = Object.freeze({ ambient: AMBIENT_TRACK, battle: BATTLE_TRACK });

// A paused battle is still a battle: menus must not accidentally start camp music.
export function ambientScene({ screen, modal = '', phase = '' }) {
  if (['landing', 'camp', 'route'].includes(screen)) return true;
  return screen === 'game' && phase !== 'wave' && ['merchant', 'end'].includes(modal);
}

export function musicScene(state) {
  if (ambientScene(state)) return 'ambient';
  if (state.screen === 'game' && ['prep', 'wave', 'rest'].includes(state.phase) && !state.paused && !state.modal) return 'battle';
  return null;
}

export class BackgroundMusic {
  constructor({ document: doc = globalThis.document, window: win = globalThis.window,
    createAudio = src => new Audio(src) } = {}) {
    this.document = doc;
    this.createAudio = createAudio;
    this.media = null;
    this.players = new Map();
    this.track = null;
    this.volume = 0;
    this.unlocked = false;
    this.focused = true;
    this.pageActive = true;
    this.shellActive = true;
    this.blocked = false;
    this.pending = false;
    this.generation = 0;
    this.disposed = false;
    this.cleanups = [];
    const listen = (target, name, callback, options) => {
      target.addEventListener(name, callback, options);
      this.cleanups.push(() => target.removeEventListener(name, callback, options));
    };
    const unlock = () => {
      this.unlocked = true;
      this.focused = true;
      this.blocked = false;
      this.sync();
    };
    // Keep retries tied to gestures, including touchend for mobile media policies.
    for (const name of ['pointerdown', 'touchend', 'click', 'keydown']) {
      listen(doc, name, unlock, { capture: true, passive: true });
    }
    listen(doc, 'visibilitychange', () => this.sync());
    listen(win, 'blur', () => { this.focused = false; this.sync(); });
    listen(win, 'focus', () => { this.focused = true; this.sync(); });
    listen(win, 'pagehide', () => { this.pageActive = false; this.sync(); });
    listen(win, 'pageshow', () => { this.pageActive = true; this.sync(); });
    listen(win, 'emberwild-shell-active', event => {
      this.shellActive = Boolean(event.detail?.active);
      this.sync();
    });
  }

  setState({ track, volume }) {
    const nextVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    const nextTrack = track === 'ambient' || track === 'battle' ? track : null;
    if (this.track === nextTrack && this.volume === nextVolume) return;
    if (this.track !== nextTrack) {
      // Stop the outgoing player before selecting or starting another one.
      this.pause();
      this.track = nextTrack;
      this.blocked = false;
      if (nextTrack) this.media = this.players.get(nextTrack) || null;
    }
    this.volume = nextVolume;
    this.sync();
  }

  get shouldPlay() {
    return !this.disposed && this.unlocked && this.track !== null && this.volume > 0 &&
      !this.document.hidden && this.focused && this.pageActive && this.shellActive;
  }

  pause() {
    if (!this.media || (this.media.paused && !this.pending)) return;
    ++this.generation;
    this.pending = false;
    this.media.pause();
    // Each track keeps its playhead across menus, pauses and scene changes.
  }

  sync() {
    if (this.disposed) return;
    for (const media of this.players.values()) {
      media.volume = this.volume * .55;
      media.muted = this.volume === 0;
    }
    if (!this.shouldPlay) { this.pause(); return; }
    if (this.blocked || this.pending || (this.media && !this.media.paused)) return;
    const generation = ++this.generation;
    try {
      if (!this.media) {
        this.media = this.createAudio(TRACKS[this.track]);
        this.players.set(this.track, this.media);
        this.media.loop = true;
        this.media.preload = 'auto';
        this.media.volume = this.volume * .55;
        const media = this.media;
        const onError = () => {
          if (this.media !== media) return;
          this.blocked = true; this.pause();
        };
        media.addEventListener('error', onError);
        this.cleanups.push(() => media.removeEventListener('error', onError));
      }
      this.pending = true;
      Promise.resolve(this.media.play()).then(() => {
        if (generation !== this.generation || this.disposed) return;
        this.pending = false;
        if (!this.shouldPlay) this.pause();
      }).catch(() => {
        if (generation !== this.generation || this.disposed) return;
        this.blocked = true;
        this.pause();
      });
    } catch {
      this.pending = false;
      this.blocked = true;
      this.pause();
    }
  }

  dispose() {
    this.disposed = true;
    this.pause();
    this.cleanups.splice(0).forEach(cleanup => cleanup());
  }
}
