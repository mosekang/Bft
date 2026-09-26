/**
 * Audio engine singleton: one lazily created AudioContext, master / sfx /
 * ambience (+ internal music) gain buses, iOS-safe unlock, one-shots and loops.
 * Every method is a silent no-op when Web Audio is unavailable; nothing throws.
 */
import type { SfxId } from "@dugout/protocol";
import { RECIPES } from "./recipes.js";
import { getBuffer, readyBuffer, setRenderSampleRate } from "./synth.js";

export interface PlayOptions {
  /** 0..1 gain multiplier (default 1). */
  volume?: number;
  /** Playback rate; also shifts pitch (default 1). */
  rate?: number;
  /** Stereo pan -1..1 (default 0). */
  pan?: number;
  /** Start delay in seconds (default 0). */
  delay?: number;
}

export interface LoopHandle {
  /** Fades the loop out and stops it. Safe to call more than once. */
  stop(fadeSeconds?: number): void;
}

export interface Volumes {
  master: number;
  sfx: number;
  ambience: number;
  music: number;
}

export type Bus = "sfx" | "ambience" | "music";

type Ctor = new () => AudioContext;

const MUTED_KEY = "dugout.muted";
/** A one-shot that finishes rendering later than this is dropped instead of played late. */
const MAX_LATE_S = 0.25;

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    /* storage blocked (private mode): keep the in-memory flag only */
  }
}

/** AudioContext constructor (prefixed on old Safari), or null. */
export function audioCtor(): Ctor | null {
  const g = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private failed = false;
  private buses: Partial<Record<"master" | Bus, GainNode>> = {};
  private muted = readMuted();
  private volumes: Volumes = { master: 1, sfx: 0.9, ambience: 0.6, music: 0.45 };
  private ambienceLevel = 0;
  private listenersInstalled = false;

  /** The live context, created on first use; null when unsupported. */
  context(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx;
    const C = audioCtor();
    if (!C) {
      this.failed = true;
      return null;
    }
    try {
      const ctx = new C();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      const buses: Partial<Record<"master" | Bus, GainNode>> = { master };
      for (const b of ["sfx", "ambience", "music"] as const) {
        const g = ctx.createGain();
        g.connect(master);
        buses[b] = g;
      }
      this.ctx = ctx;
      this.buses = buses;
      setRenderSampleRate(ctx.sampleRate);
      this.applyGains(true);
      this.watchVisibility();
    } catch {
      this.failed = true;
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Gain node a caller may connect into (null when unsupported). */
  output(bus: Bus): GainNode | null {
    return this.context() ? (this.buses[bus] ?? null) : null;
  }

  /** Resumes the context from a user gesture and primes iOS with a silent buffer. */
  async unlock(): Promise<void> {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
      if (ctx.state !== "running") await ctx.resume();
    } catch {
      /* resume can reject outside a gesture; the next gesture retries */
    }
  }

  /** Installs one-time pointerdown/touchend/keydown listeners that call unlock(). */
  installUnlockListeners(target: EventTarget | undefined = globalThis.window): void {
    if (this.listenersInstalled || !target || typeof target.addEventListener !== "function") return;
    this.listenersInstalled = true;
    const events = ["pointerdown", "touchend", "keydown"] as const;
    const handler = (): void => {
      void this.unlock().then(() => {
        if (this.ctx?.state === "running") for (const e of events) target.removeEventListener(e, handler, true);
      });
    };
    for (const e of events) target.addEventListener(e, handler, { capture: true, passive: true });
  }

  /** Plays a one-shot sound. Renders on first use; no-op when muted or unsupported. */
  play(id: SfxId, opts: PlayOptions = {}): void {
    if (this.muted) return;
    const ctx = this.context();
    if (!ctx) return;
    const bus = this.buses[RECIPES[id].channel];
    if (!bus) return;
    const requested = ctx.currentTime;
    const start = (buf: AudioBuffer): void => {
      try {
        const late = ctx.currentTime - requested;
        if (late > MAX_LATE_S) return;
        this.startSource(ctx, buf, bus, opts, Math.max(0, (opts.delay ?? 0) - late), false);
      } catch {
        /* ignore */
      }
    };
    const buf = readyBuffer(id);
    if (buf) start(buf);
    else void getBuffer(id).then((b) => b && start(b));
  }

  /** Starts a seamless loop on the recipe's channel and returns its stop handle. */
  loop(id: SfxId, opts: PlayOptions = {}): LoopHandle {
    const ctx = this.context();
    const bus = ctx ? this.buses[RECIPES[id].channel] : undefined;
    if (!ctx || !bus) return { stop: () => undefined };
    let stopped = false;
    let node: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
    void getBuffer(id).then((buf) => {
      if (!buf || stopped) return;
      try {
        node = this.startSource(ctx, buf, bus, opts, opts.delay ?? 0, true);
      } catch {
        node = null;
      }
    });
    return {
      stop: (fade = 0.4) => {
        if (stopped) return;
        stopped = true;
        if (!node) return;
        try {
          const t = ctx.currentTime;
          node.gain.gain.setValueAtTime(node.gain.gain.value, t);
          node.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
          node.src.stop(t + Math.max(0.01, fade) + 0.02);
        } catch {
          /* ignore */
        }
      },
    };
  }

  /** Plays an already-rendered buffer on a bus (used by BGM). */
  playBuffer(buf: AudioBuffer, bus: Bus, opts: PlayOptions = {}, loop = false): { src: AudioBufferSourceNode; gain: GainNode } | null {
    const ctx = this.context();
    const out = this.buses[bus];
    if (!ctx || !out) return null;
    try {
      return this.startSource(ctx, buf, out, opts, opts.delay ?? 0, loop);
    } catch {
      return null;
    }
  }

  private startSource(ctx: AudioContext, buf: AudioBuffer, bus: GainNode, opts: PlayOptions, delay: number, loop: boolean): { src: AudioBufferSourceNode; gain: GainNode } {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = clamp01(opts.volume ?? 1);
    src.connect(gain);
    let tail: AudioNode = gain;
    if (opts.pan && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(p);
      tail = p;
    }
    tail.connect(bus);
    src.start(ctx.currentTime + delay);
    return { src, gain };
  }

  /** Crowd intensity 0..1 (normalised leverage); ambience gain = volume × (0.3 + 0.7 × x). */
  setAmbienceLevel(x: number): void {
    this.ambienceLevel = clamp01(x);
    this.applyGains(false);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeMuted(muted);
    this.applyGains(false);
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolumes(v: Partial<Volumes>): void {
    for (const k of ["master", "sfx", "ambience", "music"] as const) {
      const x = v[k];
      if (x !== undefined) this.volumes[k] = clamp01(x);
    }
    this.applyGains(false);
  }

  getVolumes(): Volumes {
    return { ...this.volumes };
  }

  private applyGains(immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const targets: Record<"master" | Bus, number> = {
      master: this.muted ? 0 : this.volumes.master,
      sfx: this.volumes.sfx,
      ambience: this.volumes.ambience * (0.3 + 0.7 * this.ambienceLevel),
      music: this.volumes.music,
    };
    for (const [k, value] of Object.entries(targets) as [keyof typeof targets, number][]) {
      const g = this.buses[k];
      if (!g) continue;
      try {
        if (immediate) g.gain.value = value;
        else g.gain.setTargetAtTime(value, ctx.currentTime, 0.08);
      } catch {
        /* ignore */
      }
    }
  }

  private watchVisibility(): void {
    const doc = globalThis.document;
    if (!doc || typeof doc.addEventListener !== "function") return;
    doc.addEventListener("visibilitychange", () => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (doc.visibilityState === "hidden" && ctx.state === "running") void ctx.suspend().catch(() => undefined);
      else if (doc.visibilityState === "visible" && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    });
  }
}

let instance: AudioEngine | null = null;

/** The shared engine instance. */
export function audioEngine(): AudioEngine {
  instance ??= new AudioEngine();
  return instance;
}
