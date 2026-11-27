import type { BirthdayCardConfig } from '../config/types';

export type SoundSfxEvent =
  | 'open'
  | 'prologue'
  | 'assemble'
  | 'hover'
  | 'focus'
  | 'flip'
  | 'lit'
  | 'wave'
  | 'close'
  | 'firework';

interface MelodyNote {
  beat: number;
  midi: number;
  velocity: number;
  duration: number;
  pan?: number;
}

interface PadChord {
  beat: number;
  notes: number[];
  duration: number;
}

const BPM = 74;
const SECONDS_PER_BEAT = 60 / BPM;
const LOOP_BEATS = 48; // 16 bars of gentle 3/4 starlight waltz

// Tender F-major / D-minor starlight music-box arrangement
// Weaves a nostalgic lullaby motif with a delicate lyrical nod to the birthday interval.
const MUSIC_BOX_MELODY: MelodyNote[] = [
  // Bars 1-2: Fmaj7 — gentle opening sparkle
  { beat: 0, midi: 60, velocity: 0.44, duration: 1.5, pan: -0.18 }, // C4
  { beat: 0.75, midi: 60, velocity: 0.36, duration: 0.85, pan: -0.1 }, // C4
  { beat: 1.5, midi: 62, velocity: 0.52, duration: 1.6, pan: 0.04 }, // D4
  { beat: 2.5, midi: 69, velocity: 0.3, duration: 1.8, pan: 0.28 }, // A4 shimmer
  { beat: 3, midi: 60, velocity: 0.5, duration: 1.6, pan: -0.12 }, // C4
  { beat: 4, midi: 65, velocity: 0.62, duration: 2.2, pan: 0.16 }, // F4
  { beat: 5, midi: 69, velocity: 0.34, duration: 1.8, pan: 0.24 }, // A4

  // Bars 3-4: Dm9 -> Csus4
  { beat: 6, midi: 64, velocity: 0.58, duration: 2.6, pan: 0.08 }, // E4
  { beat: 7, midi: 72, velocity: 0.28, duration: 1.7, pan: -0.26 }, // C5
  { beat: 8, midi: 69, velocity: 0.36, duration: 1.7, pan: 0.2 }, // A4
  { beat: 9, midi: 60, velocity: 0.44, duration: 1.2, pan: -0.18 }, // C4
  { beat: 9.75, midi: 60, velocity: 0.38, duration: 0.85, pan: -0.08 }, // C4
  { beat: 10.5, midi: 62, velocity: 0.52, duration: 1.6, pan: 0.06 }, // D4
  { beat: 11.5, midi: 67, velocity: 0.32, duration: 1.6, pan: 0.26 }, // G4

  // Bars 5-6: Gm9 -> C13
  { beat: 12, midi: 60, velocity: 0.5, duration: 1.6, pan: -0.15 }, // C4
  { beat: 13, midi: 67, velocity: 0.62, duration: 2.2, pan: 0.18 }, // G4
  { beat: 14, midi: 74, velocity: 0.3, duration: 1.9, pan: 0.32 }, // D5
  { beat: 15, midi: 65, velocity: 0.58, duration: 2.8, pan: 0.05 }, // F4
  { beat: 16.5, midi: 69, velocity: 0.36, duration: 1.8, pan: -0.22 }, // A4
  { beat: 17.25, midi: 72, velocity: 0.34, duration: 1.9, pan: 0.2 }, // C5

  // Bars 7-8: Bbmaj7 -> Fmaj7/A — soaring octave bloom
  { beat: 18, midi: 60, velocity: 0.44, duration: 1.2, pan: -0.2 }, // C4
  { beat: 18.75, midi: 60, velocity: 0.38, duration: 0.85, pan: -0.1 }, // C4
  { beat: 19.5, midi: 72, velocity: 0.66, duration: 2.1, pan: 0.24 }, // C5
  { beat: 21, midi: 69, velocity: 0.58, duration: 1.9, pan: 0.12 }, // A4
  { beat: 22, midi: 65, velocity: 0.56, duration: 1.9, pan: -0.08 }, // F4
  { beat: 23, midi: 64, velocity: 0.52, duration: 2.0, pan: -0.16 }, // E4

  // Bars 9-10: Gm7 -> C7sus4 — tender cadence
  { beat: 24, midi: 62, velocity: 0.56, duration: 2.5, pan: -0.1 }, // D4
  { beat: 25.5, midi: 70, velocity: 0.48, duration: 1.2, pan: 0.22 }, // Bb4
  { beat: 26.25, midi: 70, velocity: 0.42, duration: 0.9, pan: 0.14 }, // Bb4
  { beat: 27, midi: 69, velocity: 0.6, duration: 1.9, pan: 0.06 }, // A4
  { beat: 28, midi: 65, velocity: 0.54, duration: 1.8, pan: -0.14 }, // F4
  { beat: 29, midi: 67, velocity: 0.56, duration: 1.9, pan: 0.1 }, // G4

  // Bars 11-12: Fmaj9 — warm starlit resolution
  { beat: 30, midi: 65, velocity: 0.62, duration: 3.0, pan: 0.0 }, // F4
  { beat: 31, midi: 72, velocity: 0.34, duration: 2.2, pan: -0.28 }, // C5
  { beat: 32, midi: 76, velocity: 0.3, duration: 2.2, pan: 0.28 }, // E5
  { beat: 33, midi: 77, velocity: 0.42, duration: 2.6, pan: 0.14 }, // F5
  { beat: 34.5, midi: 76, velocity: 0.38, duration: 1.8, pan: -0.18 }, // E5
  { beat: 35.25, midi: 74, velocity: 0.36, duration: 1.7, pan: 0.18 }, // D5

  // Bars 13-14: Dm9 -> Bbmaj7 — dreamy celestial interlude
  { beat: 36, midi: 72, velocity: 0.52, duration: 2.4, pan: -0.12 }, // C5
  { beat: 37, midi: 69, velocity: 0.44, duration: 1.9, pan: 0.16 }, // A4
  { beat: 38, midi: 74, velocity: 0.48, duration: 2.1, pan: 0.26 }, // D5
  { beat: 39, midi: 72, velocity: 0.48, duration: 2.0, pan: -0.14 }, // C5
  { beat: 40, midi: 69, velocity: 0.44, duration: 1.8, pan: 0.08 }, // A4
  { beat: 41, midi: 67, velocity: 0.44, duration: 2.0, pan: -0.22 }, // G4

  // Bars 15-16: Gm9 -> C9sus4 — soft breath back to bar 1
  { beat: 42, midi: 69, velocity: 0.5, duration: 2.4, pan: 0.12 }, // A4
  { beat: 43, midi: 65, velocity: 0.42, duration: 1.9, pan: -0.16 }, // F4
  { beat: 44, midi: 72, velocity: 0.34, duration: 2.1, pan: 0.24 }, // C5
  { beat: 45, midi: 67, velocity: 0.46, duration: 2.5, pan: -0.06 }, // G4
  { beat: 46.5, midi: 64, velocity: 0.34, duration: 1.8, pan: 0.18 }, // E4
  { beat: 47.25, midi: 67, velocity: 0.3, duration: 1.6, pan: -0.2 }, // G4
];

// Gentle harp-like accompaniment arpeggios in lower-middle register
const MUSIC_BOX_ARPEGGIO: MelodyNote[] = [
  // Fmaj7
  { beat: 0, midi: 53, velocity: 0.26, duration: 2.4, pan: -0.24 },
  { beat: 1, midi: 57, velocity: 0.2, duration: 1.8, pan: 0.12 },
  { beat: 2, midi: 60, velocity: 0.18, duration: 1.6, pan: -0.08 },
  { beat: 3, midi: 53, velocity: 0.24, duration: 2.2, pan: -0.22 },
  { beat: 4.5, midi: 60, velocity: 0.2, duration: 1.7, pan: 0.15 },
  // Dm9
  { beat: 6, midi: 50, velocity: 0.26, duration: 2.4, pan: -0.2 },
  { beat: 7, midi: 57, velocity: 0.2, duration: 1.9, pan: 0.18 },
  { beat: 8, midi: 60, velocity: 0.18, duration: 1.6, pan: -0.12 },
  { beat: 9, midi: 55, velocity: 0.24, duration: 2.3, pan: -0.18 },
  { beat: 10.5, midi: 60, velocity: 0.2, duration: 1.7, pan: 0.14 },
  // Gm9 -> C13
  { beat: 12, midi: 55, velocity: 0.25, duration: 2.4, pan: -0.22 },
  { beat: 13, midi: 58, velocity: 0.2, duration: 1.9, pan: 0.16 },
  { beat: 14, midi: 62, velocity: 0.18, duration: 1.6, pan: -0.1 },
  { beat: 15, midi: 53, velocity: 0.24, duration: 2.4, pan: -0.2 },
  { beat: 16, midi: 60, velocity: 0.2, duration: 1.8, pan: 0.12 },
  // Bbmaj7 -> Fmaj7/A
  { beat: 18, midi: 46, velocity: 0.26, duration: 2.5, pan: -0.25 },
  { beat: 19, midi: 53, velocity: 0.21, duration: 1.9, pan: 0.14 },
  { beat: 20, midi: 57, velocity: 0.19, duration: 1.7, pan: -0.08 },
  { beat: 21, midi: 57, velocity: 0.24, duration: 2.2, pan: -0.18 },
  { beat: 22, midi: 60, velocity: 0.2, duration: 1.8, pan: 0.16 },
  // Gm7 -> C7sus4
  { beat: 24, midi: 55, velocity: 0.25, duration: 2.5, pan: -0.22 },
  { beat: 25, midi: 58, velocity: 0.2, duration: 1.8, pan: 0.14 },
  { beat: 27, midi: 48, velocity: 0.26, duration: 2.4, pan: -0.2 },
  { beat: 28, midi: 55, velocity: 0.2, duration: 1.9, pan: 0.15 },
  // Fmaj9
  { beat: 30, midi: 53, velocity: 0.26, duration: 2.8, pan: -0.24 },
  { beat: 31, midi: 60, velocity: 0.2, duration: 2.0, pan: 0.14 },
  { beat: 33, midi: 53, velocity: 0.24, duration: 2.4, pan: -0.18 },
  { beat: 34, midi: 64, velocity: 0.18, duration: 1.9, pan: 0.2 },
  // Dm9 -> Bbmaj7
  { beat: 36, midi: 50, velocity: 0.26, duration: 2.6, pan: -0.22 },
  { beat: 37, midi: 57, velocity: 0.2, duration: 1.9, pan: 0.16 },
  { beat: 39, midi: 46, velocity: 0.26, duration: 2.5, pan: -0.24 },
  { beat: 40, midi: 53, velocity: 0.2, duration: 1.9, pan: 0.14 },
  // Gm9 -> C9sus4
  { beat: 42, midi: 55, velocity: 0.25, duration: 2.5, pan: -0.2 },
  { beat: 43, midi: 62, velocity: 0.19, duration: 1.8, pan: 0.18 },
  { beat: 45, midi: 48, velocity: 0.25, duration: 2.6, pan: -0.18 },
  { beat: 46, midi: 55, velocity: 0.19, duration: 1.9, pan: 0.16 },
];

const COSMIC_PADS: PadChord[] = [
  { beat: 0, notes: [41, 53, 57, 60], duration: 6.2 }, // Fmaj7
  { beat: 6, notes: [38, 50, 57, 64], duration: 6.2 }, // Dm9
  { beat: 12, notes: [43, 55, 58, 62], duration: 6.2 }, // Gm7
  { beat: 18, notes: [46, 53, 57, 62], duration: 6.2 }, // Bbmaj7
  { beat: 24, notes: [43, 55, 58, 60], duration: 6.2 }, // Gm11 -> Csus4
  { beat: 30, notes: [41, 53, 57, 64], duration: 6.2 }, // Fmaj9
  { beat: 36, notes: [38, 50, 57, 60], duration: 6.2 }, // Dm7
  { beat: 42, notes: [43, 55, 60, 62], duration: 6.2 }, // Gm9 -> C9sus4
];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * WeChat's inline browser (X5 on Android, WKWebView on iOS) refuses to start
 * audio until its native bridge reports ready, and it will not honour a
 * deferred AudioContext.resume(). Registering this hook lets playback begin the
 * moment the bridge is available, which is what makes the very first tap on the
 * sound button work instead of requiring a second interaction.
 */
type WeixinBridgeWindow = Window & {
  WeixinJSBridge?: {
    invoke: (name: string, params?: unknown, callback?: () => void) => void;
  };
  __wxjs_environment?: string;
};

function isWeChat(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /micromessenger/i.test(navigator.userAgent);
}

function invokeWeChatAudioGrant(callback: () => void): void {
  const w = window as WeixinBridgeWindow;
  if (!w.WeixinJSBridge) {
    callback();
    return;
  }
  let called = false;
  const runOnce = (): void => {
    if (called) return;
    called = true;
    callback();
  };
  try {
    // WeChat X5 & iOS WKWebView reliably grant media/WebAudio playback inside
    // WeixinJSBridge.invoke('getNetworkType', ...) callbacks.
    w.WeixinJSBridge.invoke('getNetworkType', {}, runOnce);
  } catch {
    runOnce();
  }
}

function whenWeChatBridgeReady(callback: () => void): void {
  if (!isWeChat() || typeof document === 'undefined') {
    callback();
    return;
  }

  const w = window as WeixinBridgeWindow;
  if (w.WeixinJSBridge) {
    invokeWeChatAudioGrant(callback);
    return;
  }

  const handler = (): void => {
    document.removeEventListener('WeixinJSBridgeReady', handler);
    invokeWeChatAudioGrant(callback);
  };
  document.addEventListener('WeixinJSBridgeReady', handler, { once: true });
  // The event can fire before this script registers, so fall back to polling.
  let attempts = 0;
  const poll = window.setInterval(() => {
    attempts += 1;
    if ((window as WeixinBridgeWindow).WeixinJSBridge) {
      window.clearInterval(poll);
      document.removeEventListener('WeixinJSBridgeReady', handler);
      invokeWeChatAudioGrant(callback);
    } else if (attempts > 40) {
      window.clearInterval(poll);
    }
  }, 100);
}

export class SoundEngine {
  private readonly config: BirthdayCardConfig['audio'];
  private readonly baseVolume: number;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private customAudio: HTMLAudioElement | null = null;
  private customFadeTimer: number | null = null;
  private customFailed = false;

  private schedulerTimer: number | null = null;
  private loopOriginTime = 0;
  private scheduledUntilBeat = -1;
  private currentLoopIndex = 0;

  private muted = false;
  private playing = false;
  private disposed = false;

  private lastHoverSfxMs = 0;
  private lastFireworkSfxMs = 0;
  private hoverNoteIdx = 0;
  private onStateChange?: () => void;

  constructor(config: BirthdayCardConfig['audio']) {
    this.config = config;
    this.baseVolume = Math.max(0, Math.min(1, Number.isFinite(config.volume) ? config.volume : 0.45));
    this.muted = !config.enabled;
  }

  public setOnStateChange(listener?: () => void): void {
    this.onStateChange = listener;
  }

  private notifyStateChange(): void {
    if (!this.disposed) {
      this.onStateChange?.();
    }
  }

  private primeSilentUnlockBuffer(ctx: AudioContext): void {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // Ignore if context forbids immediate node creation
    }
  }

  public async tryAutoStart(): Promise<boolean> {
    if (this.disposed || !this.config.enabled) {
      return false;
    }

    // Avoid creating AudioContext or invoking media play() prior to user activation,
    // preventing browser autoplay console warnings on initial page load.
    if (!this.hasUserActivation()) {
      return false;
    }

    if (this.useCustomBgm()) {
      const ok = await this.tryStartCustomAudio();
      if (ok) {
        this.playing = true;
        this.ensureAudioGraph();
        if (this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume().catch(() => {});
        }
        return true;
      }
      if (!this.customFailed) {
        return false;
      }
    }

    const ready = this.ensureAudioGraph();
    if (!ready || !this.ctx) {
      return false;
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }

    if (this.ctx.state === 'running') {
      this.startProceduralBgm();
      this.playing = true;
      return true;
    }

    return false;
  }

  public unlockAndStart(): void {
    if (this.disposed) return;

    // Attempt immediately inside the current user gesture first (required by
    // iOS Safari / WeChat WKWebView), and on WeChat also run through the native
    // WeixinJSBridge callback in case the WebView gates audio on the bridge.
    this.startPlaybackNow();

    if (isWeChat()) {
      whenWeChatBridgeReady(() => {
        if (!this.disposed && !this.muted && !this.isPlaying()) {
          this.startPlaybackNow();
        }
      });
    }
  }

  /**
   * Synchronous audio start. Everything up to and including `resume()` must run
   * inside the user gesture for WeChat / iOS Safari to grant playback.
   */
  private startPlaybackNow(): void {
    if (this.disposed) return;

    this.ensureAudioGraph();

    if (this.ctx) {
      this.primeSilentUnlockBuffer(this.ctx);
      if (this.ctx.state !== 'running') {
        this.ctx
          .resume()
          .then(() => {
            if (this.disposed) return;
            if (!this.muted && !this.useCustomBgm()) {
              this.startProceduralBgm();
              this.playing = true;
            }
            this.applyGainTargets();
            this.notifyStateChange();
          })
          .catch(() => {});
      }
    }

    if (this.muted) {
      this.notifyStateChange();
      return;
    }

    if (this.useCustomBgm()) {
      void this.tryStartCustomAudio().then((ok) => {
        if (this.disposed) return;
        if (ok) {
          this.playing = true;
        } else if (this.customFailed && this.ctx) {
          this.startProceduralBgm();
          this.playing = true;
        }
        this.notifyStateChange();
      });
      return;
    }

    if (this.ctx) {
      this.startProceduralBgm();
      this.playing = true;
      this.applyGainTargets();
    }
    this.notifyStateChange();
  }

  public setMuted(muted: boolean): void {
    if (this.disposed) return;
    this.muted = muted;

    if (!muted) {
      // WeChat's X5/WKWebView only honours resume() when it is invoked
      // synchronously inside the user gesture; awaiting or deferring it into a
      // promise chain loses the activation. resume() is therefore called here
      // without awaiting, and playback is started optimistically.
      this.ensureAudioGraph();
      if (this.ctx) {
        this.primeSilentUnlockBuffer(this.ctx);
        if (this.ctx.state !== 'running') {
          this.ctx
            .resume()
            .then(() => {
              if (this.disposed) return;
              if (!this.muted && !this.useCustomBgm()) {
                this.startProceduralBgm();
                this.playing = true;
              }
              this.applyGainTargets();
              this.notifyStateChange();
            })
            .catch(() => {});
        }
      }
      if (this.ctx && !this.useCustomBgm()) {
        this.startProceduralBgm();
        this.playing = true;
      }
    }

    this.applyGainTargets();

    if (muted) {
      if (this.customAudio) {
        this.fadeCustomAudioTo(0, 260, true);
      }
    } else if (this.useCustomBgm()) {
      void this.tryStartCustomAudio().then((ok) => {
        if (!this.disposed && ok) {
          this.playing = true;
        }
        this.notifyStateChange();
      });
    }
    this.notifyStateChange();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isPlaying(): boolean {
    if (this.disposed || this.muted) return false;
    if (this.useCustomBgm() && this.customAudio) {
      return !this.customAudio.paused && !this.customAudio.ended;
    }
    return this.playing && this.ctx !== null && this.ctx.state === 'running';
  }

  public playSfx(event: SoundSfxEvent): void {
    if (this.disposed || this.muted) return;
    if (!this.ensureAudioGraph() || !this.ctx || !this.sfxGain) return;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const perfNow = performance.now();

    switch (event) {
      case 'hover': {
        if (perfNow - this.lastHoverSfxMs < 95) return;
        this.lastHoverSfxMs = perfNow;
        const pentatonic = [72, 74, 77, 79, 81, 84];
        const midi = pentatonic[this.hoverNoteIdx % pentatonic.length] ?? 77;
        this.hoverNoteIdx += 1;
        this.playBellNote(this.sfxGain, now, midi, 0.15, 0.45, (Math.random() - 0.5) * 0.35, true);
        break;
      }
      case 'open': {
        // Warm shimmering Fmaj9 arpeggio swell + soft velvet air sweep
        this.playFilteredAir(now, 0.72, 260, 1400, 0.08, 0.0);
        const chord = [53, 60, 64, 67, 69, 72, 77];
        chord.forEach((midi, idx) => {
          this.playBellNote(
            this.sfxGain!,
            now + idx * 0.068,
            midi,
            0.28 + idx * 0.02,
            2.1,
            (idx - 3) * 0.14,
            false
          );
        });
        break;
      }
      case 'prologue': {
        this.playBellNote(this.sfxGain, now, 77, 0.24, 1.8, -0.15, false);
        this.playBellNote(this.sfxGain, now + 0.11, 81, 0.26, 2.1, 0.18, false);
        break;
      }
      case 'assemble': {
        this.playFilteredAir(now, 0.9, 380, 2200, 0.075, 0.0);
        const notes = [65, 69, 72, 74, 77, 81, 84];
        notes.forEach((midi, idx) => {
          this.playBellNote(
            this.sfxGain!,
            now + idx * 0.085,
            midi,
            0.22,
            1.7,
            -0.36 + idx * 0.12,
            true
          );
        });
        break;
      }
      case 'focus': {
        this.playFilteredAir(now, 0.34, 420, 1600, 0.06, 0.0);
        this.playBellNote(this.sfxGain, now + 0.03, 72, 0.26, 1.25, -0.14, false);
        this.playBellNote(this.sfxGain, now + 0.11, 77, 0.3, 1.5, 0.14, false);
        break;
      }
      case 'flip': {
        // Tactile paper-turn air sweep + delicate crystal chime
        this.playFilteredAir(now, 0.24, 580, 1750, 0.07, 0.05);
        this.playBellNote(this.sfxGain, now + 0.04, 81, 0.22, 0.72, 0.12, true);
        break;
      }
      case 'lit': {
        const notes = [69, 72, 77, 81];
        notes.forEach((midi, idx) => {
          this.playBellNote(
            this.sfxGain!,
            now + idx * 0.072,
            midi,
            0.3 + idx * 0.02,
            1.65,
            -0.2 + idx * 0.14,
            false
          );
        });
        break;
      }
      case 'wave': {
        // Cascading golden harp glissando across the lit age numeral
        const harp = [60, 65, 67, 69, 72, 74, 77, 79, 81, 84, 89];
        harp.forEach((midi, idx) => {
          this.playBellNote(
            this.sfxGain!,
            now + idx * 0.062,
            midi,
            0.24 + (idx % 3) * 0.03,
            2.1,
            -0.45 + idx * 0.09,
            idx > 6
          );
        });
        break;
      }
      case 'close': {
        // Warm gilded book clasp: gentle wooden body thump + champagne gold seal chime
        this.playClaspTone(now);
        this.playBellNote(this.sfxGain, now + 0.06, 65, 0.25, 1.6, -0.08, false);
        this.playBellNote(this.sfxGain, now + 0.14, 72, 0.28, 1.9, 0.1, false);
        break;
      }
      case 'firework': {
        if (perfNow - this.lastFireworkSfxMs < 55) return;
        this.lastFireworkSfxMs = perfNow;
        this.playFireworkSound(now);
        break;
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.playing = false;

    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    if (this.customFadeTimer !== null) {
      window.clearInterval(this.customFadeTimer);
      this.customFadeTimer = null;
    }

    if (this.customAudio) {
      this.customAudio.pause();
      this.customAudio.src = '';
      this.customAudio = null;
    }

    this.onStateChange = undefined;
    if (this.ctx) {
      const toClose = this.ctx;
      this.ctx = null;
      this.masterGain = null;
      this.bgmGain = null;
      this.sfxGain = null;
      this.reverbNode = null;
      this.noiseBuffer = null;
      void toClose.close().catch(() => {});
    }
  }

  private hasUserActivation(): boolean {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & {
      userActivation?: { hasBeenActive: boolean; isActive: boolean };
    };
    if (nav.userActivation) {
      // Require active transient user gesture so async post-unlock mounts never trigger Chrome autoplay warnings
      return Boolean(nav.userActivation.isActive);
    }
    return false;
  }

  private useCustomBgm(): boolean {
    return Boolean(this.config.customBgmUrl && this.config.customBgmUrl.trim().length > 0 && !this.customFailed);
  }

  private ensureAudioGraph(): boolean {
    if (this.ctx) return true;

    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return false;

    try {
      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.18;

      const masterGain = ctx.createGain();
      masterGain.gain.value = this.muted ? 0 : this.baseVolume;

      const bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.0001;

      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.92;

      const reverbNode = ctx.createConvolver();
      reverbNode.buffer = this.createStarlightImpulse(ctx, 2.75);

      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.42;

      bgmGain.connect(masterGain);
      bgmGain.connect(reverbNode);

      sfxGain.connect(masterGain);
      sfxGain.connect(reverbNode);

      reverbNode.connect(reverbReturn);
      reverbReturn.connect(masterGain);

      masterGain.connect(compressor);
      compressor.connect(ctx.destination);

      this.ctx = ctx;
      this.masterGain = masterGain;
      this.bgmGain = bgmGain;
      this.sfxGain = sfxGain;
      this.reverbNode = reverbNode;
      this.noiseBuffer = this.createWarmNoiseBuffer(ctx, 1.5);
      if (typeof ctx.addEventListener === 'function') {
        ctx.addEventListener('statechange', () => {
          if (this.disposed) return;
          if (ctx.state === 'running' && !this.muted && this.playing && !this.useCustomBgm()) {
            this.startProceduralBgm();
          }
          this.notifyStateChange();
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  private applyGainTargets(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0 : this.baseVolume;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(target, now + 0.18);
  }

  private startProceduralBgm(): void {
    if (!this.ctx || !this.bgmGain || this.disposed) return;

    const now = this.ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setValueAtTime(Math.max(0.0001, this.bgmGain.gain.value), now);
    this.bgmGain.gain.linearRampToValueAtTime(0.85, now + 1.4);

    if (this.schedulerTimer !== null) {
      return;
    }

    this.loopOriginTime = now + 0.08;
    this.scheduledUntilBeat = -0.001;
    this.currentLoopIndex = 0;

    this.scheduleUpcomingBeats();
    this.schedulerTimer = window.setInterval(() => {
      this.scheduleUpcomingBeats();
    }, 100);
  }

  private scheduleUpcomingBeats(): void {
    if (!this.ctx || !this.bgmGain || this.disposed || this.ctx.state !== 'running') {
      return;
    }

    const now = this.ctx.currentTime;
    const lookaheadSec = 0.3;
    const horizonSec = now + lookaheadSec;
    const loopDurationSec = LOOP_BEATS * SECONDS_PER_BEAT;

    while (this.loopOriginTime + loopDurationSec < now) {
      this.loopOriginTime += loopDurationSec;
      this.currentLoopIndex += 1;
      this.scheduledUntilBeat -= LOOP_BEATS;
    }

    const horizonBeat = (horizonSec - this.loopOriginTime) / SECONDS_PER_BEAT;
    if (horizonBeat <= this.scheduledUntilBeat) {
      return;
    }

    const fromBeat = this.scheduledUntilBeat;
    const toBeat = horizonBeat;

    const scheduleInWindow = (
      offsetLoops: number,
      winStart: number,
      winEnd: number
    ): void => {
      const baseTime = this.loopOriginTime + offsetLoops * loopDurationSec;

      for (const note of MUSIC_BOX_MELODY) {
        if (note.beat > winStart && note.beat <= winEnd) {
          const t = baseTime + note.beat * SECONDS_PER_BEAT;
          this.playBellNote(
            this.bgmGain!,
            t,
            note.midi,
            note.velocity * 0.42,
            note.duration * SECONDS_PER_BEAT,
            note.pan ?? 0,
            false
          );
        }
      }

      for (const arp of MUSIC_BOX_ARPEGGIO) {
        if (arp.beat > winStart && arp.beat <= winEnd) {
          const t = baseTime + arp.beat * SECONDS_PER_BEAT;
          this.playBellNote(
            this.bgmGain!,
            t,
            arp.midi,
            arp.velocity * 0.34,
            arp.duration * SECONDS_PER_BEAT,
            arp.pan ?? 0,
            false
          );
        }
      }

      for (const chord of COSMIC_PADS) {
        if (chord.beat > winStart && chord.beat <= winEnd) {
          const t = baseTime + chord.beat * SECONDS_PER_BEAT;
          this.playCosmicPadChord(
            this.bgmGain!,
            t,
            chord.notes,
            chord.duration * SECONDS_PER_BEAT
          );
        }
      }
    };

    if (toBeat < LOOP_BEATS) {
      scheduleInWindow(0, fromBeat, toBeat);
    } else {
      scheduleInWindow(0, fromBeat, LOOP_BEATS);
      scheduleInWindow(1, -0.001, toBeat - LOOP_BEATS);
    }

    this.scheduledUntilBeat = toBeat;
  }

  private playBellNote(
    destination: AudioNode,
    time: number,
    midi: number,
    velocity: number,
    duration: number,
    pan: number,
    crystalline: boolean
  ): void {
    if (!this.ctx) return;

    const freq = midiToFreq(midi);
    const outGain = this.ctx.createGain();
    const safeVel = Math.max(0.005, Math.min(0.65, velocity));

    outGain.gain.setValueAtTime(0.0001, time);
    outGain.gain.linearRampToValueAtTime(safeVel, time + 0.009);
    outGain.gain.exponentialRampToValueAtTime(safeVel * 0.24, time + Math.min(0.32, duration * 0.35));
    outGain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.22, duration));

    let panner: StereoPannerNode | null = null;
    if (typeof this.ctx.createStereoPanner === 'function') {
      panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, pan)), time);
      outGain.connect(panner);
      panner.connect(destination);
    } else {
      outGain.connect(destination);
    }

    // Fundamental silky sine voice
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);
    osc1.connect(outGain);

    // Warm second partial (soft celesta bell bloom)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, time);
    gain2.gain.setValueAtTime(crystalline ? 0.22 : 0.14, time);
    gain2.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.45, duration * 0.5));
    osc2.connect(gain2);
    gain2.connect(outGain);

    // Subtle music-box tine shimmer (3.004x overtone, fast delicate decay)
    const osc3 = this.ctx.createOscillator();
    const gain3 = this.ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3.004, time);
    gain3.gain.setValueAtTime(crystalline ? 0.1 : 0.045, time);
    gain3.gain.exponentialRampToValueAtTime(0.0005, time + 0.16);
    osc3.connect(gain3);
    gain3.connect(outGain);

    const stopAt = time + Math.max(0.26, duration) + 0.05;
    osc1.start(time);
    osc2.start(time);
    osc3.start(time);
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    osc3.stop(Math.min(stopAt, time + 0.22));
  }

  private playCosmicPadChord(
    destination: AudioNode,
    time: number,
    midiNotes: number[],
    duration: number
  ): void {
    if (!this.ctx) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(360, time);
    filter.Q.setValueAtTime(0.6, time);

    const padGain = this.ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, time);
    padGain.gain.linearRampToValueAtTime(0.058, time + duration * 0.38);
    padGain.gain.linearRampToValueAtTime(0.042, time + duration * 0.72);
    padGain.gain.linearRampToValueAtTime(0.0001, time + duration);

    filter.connect(padGain);
    padGain.connect(destination);

    midiNotes.forEach((midi, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      const detune = (idx % 2 === 0 ? 1 : -1) * 3.5;
      osc.frequency.setValueAtTime(midiToFreq(midi), time);
      osc.detune.setValueAtTime(detune, time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + duration + 0.08);
    });
  }

  private playFilteredAir(
    time: number,
    duration: number,
    startFreq: number,
    endFreq: number,
    gainAmount: number,
    pan: number
  ): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, endFreq), time + duration);
    filter.Q.setValueAtTime(1.4, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(gainAmount, time + duration * 0.28);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    src.connect(filter);
    filter.connect(env);

    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, time);
      env.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      env.connect(this.sfxGain);
    }

    src.start(time);
    src.stop(time + duration + 0.04);
  }

  private playClaspTone(time: number): void {
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(215, time);
    osc.frequency.exponentialRampToValueAtTime(118, time + 0.14);

    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.24, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  private playFireworkSound(time: number): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;

    const stereoPan = (Math.random() - 0.5) * 0.72;

    // 1. Warm distant hollow pop
    const thumpOsc = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(132 + Math.random() * 28, time);
    thumpOsc.frequency.exponentialRampToValueAtTime(48, time + 0.18);

    thumpGain.gain.setValueAtTime(0.0001, time);
    thumpGain.gain.linearRampToValueAtTime(0.22, time + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.sfxGain);
    thumpOsc.start(time);
    thumpOsc.stop(time + 0.28);

    // 2. Soft blooming air burst
    const burstSrc = this.ctx.createBufferSource();
    burstSrc.buffer = this.noiseBuffer;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, time);
    lp.frequency.exponentialRampToValueAtTime(340, time + 0.52);

    const burstGain = this.ctx.createGain();
    burstGain.gain.setValueAtTime(0.0001, time);
    burstGain.gain.linearRampToValueAtTime(0.11, time + 0.02);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.58);

    burstSrc.connect(lp);
    lp.connect(burstGain);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(stereoPan, time);
      burstGain.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      burstGain.connect(this.sfxGain);
    }
    burstSrc.start(time);
    burstSrc.stop(time + 0.62);

    // 3. Sparkling stardust crackle glints
    const sparkleCount = 6;
    for (let i = 0; i < sparkleCount; i += 1) {
      const offset = 0.08 + Math.random() * 0.44;
      const sparkleOsc = this.ctx.createOscillator();
      const sparkleGain = this.ctx.createGain();
      sparkleOsc.type = 'sine';
      sparkleOsc.frequency.setValueAtTime(2200 + Math.random() * 2800, time + offset);

      sparkleGain.gain.setValueAtTime(0.0001, time + offset);
      sparkleGain.gain.linearRampToValueAtTime(0.036 + Math.random() * 0.025, time + offset + 0.008);
      sparkleGain.gain.exponentialRampToValueAtTime(0.0001, time + offset + 0.09 + Math.random() * 0.08);

      sparkleOsc.connect(sparkleGain);
      if (typeof this.ctx.createStereoPanner === 'function') {
        const p = this.ctx.createStereoPanner();
        p.pan.setValueAtTime(
          Math.max(-0.85, Math.min(0.85, stereoPan + (Math.random() - 0.5) * 0.5)),
          time + offset
        );
        sparkleGain.connect(p);
        p.connect(this.sfxGain);
      } else {
        sparkleGain.connect(this.sfxGain);
      }
      sparkleOsc.start(time + offset);
      sparkleOsc.stop(time + offset + 0.2);
    }
  }

  private createStarlightImpulse(ctx: AudioContext, durationSeconds: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSeconds);
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch += 1) {
      const data = buffer.getChannelData(ch);
      let lpState = 0;
      for (let i = 0; i < length; i += 1) {
        const progress = i / length;
        const decay = Math.pow(1 - progress, 2.75);
        const white = Math.random() * 2 - 1;
        // Gentle one-pole lowpass so the reverb tail sounds velvety warm, not metallic
        lpState = lpState * 0.72 + white * 0.28;
        data[i] = lpState * decay * 0.55;
      }
    }

    return buffer;
  }

  private createWarmNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSeconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.14) * 0.6;
    }
    return buffer;
  }

  private tryStartCustomAudio(): Promise<boolean> {
    const url = this.config.customBgmUrl.trim();
    if (!url || this.customFailed) return Promise.resolve(false);

    if (!this.customAudio) {
      const audio = new Audio(url);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.addEventListener('play', () => {
        if (this.disposed) return;
        this.playing = true;
        this.applyGainTargets();
        this.notifyStateChange();
      });
      audio.addEventListener('pause', () => {
        if (this.disposed) return;
        this.notifyStateChange();
      });
      audio.addEventListener('error', () => {
        this.customFailed = true;
        this.customAudio = null;
        if (!this.disposed && !this.muted && this.ctx && this.ctx.state === 'running') {
          this.startProceduralBgm();
          this.playing = true;
        }
        this.notifyStateChange();
      });
      this.customAudio = audio;
    }

    const audio = this.customAudio;
    let playPromise: Promise<void> | undefined;
    try {
      // Invoke play() synchronously inside the user gesture before any await
      // so iOS Safari and WeChat WKWebView unlock custom MP3 playback on first tap.
      playPromise = audio.play();
    } catch {
      return Promise.resolve(false);
    }

    const onStarted = (): boolean => {
      if (this.disposed) return false;
      this.playing = true;
      this.applyGainTargets();
      this.fadeCustomAudioTo(this.muted ? 0 : this.baseVolume, 950, false);
      this.notifyStateChange();
      return true;
    };

    if (playPromise && typeof playPromise.then === 'function') {
      return playPromise.then(onStarted).catch(() => false);
    }
    return Promise.resolve(onStarted());
  }

  private fadeCustomAudioTo(targetVolume: number, durationMs: number, pauseWhenZero: boolean): void {
    if (!this.customAudio) return;

    if (this.customFadeTimer !== null) {
      window.clearInterval(this.customFadeTimer);
      this.customFadeTimer = null;
    }

    const audio = this.customAudio;
    const startVol = audio.volume;
    const clampedTarget = Math.max(0, Math.min(1, targetVolume));
    const steps = Math.max(1, Math.round(durationMs / 25));
    let currentStep = 0;

    this.customFadeTimer = window.setInterval(() => {
      currentStep += 1;
      const t = Math.min(1, currentStep / steps);
      audio.volume = Math.max(0, Math.min(1, startVol + (clampedTarget - startVol) * t));
      if (t >= 1) {
        if (this.customFadeTimer !== null) {
          window.clearInterval(this.customFadeTimer);
          this.customFadeTimer = null;
        }
        if (pauseWhenZero && clampedTarget <= 0.001) {
          audio.pause();
        }
      }
    }, 25);
  }
}
