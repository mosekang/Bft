/**
 * Renders recipes to AudioBuffers with an OfflineAudioContext, lazily and
 * cached per sound id. Noise comes from a seeded PRNG, so every render of a
 * recipe is identical. Returns null wherever Web Audio is unavailable.
 */
import { SFX, type SfxId } from "@dugout/protocol";
import { fillNoise, hashString, limitPeak, mulberry32, wrapLoop } from "./dsp.js";
import { loopLength, recipeDuration, type Layer, type Recipe } from "./kit.js";
import { RECIPES } from "./recipes.js";

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

const DEFAULT_RATE = 44100;
let renderRate = DEFAULT_RATE;

/** OfflineAudioContext constructor (prefixed on old Safari), or null. */
export function offlineCtor(): OfflineCtor | null {
  const g = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/** Sets the sample rate used for future renders (the live context's rate). */
export function setRenderSampleRate(rate: number): void {
  if (Number.isFinite(rate) && rate >= 8000) renderRate = rate;
}

function scheduleEnvelope(p: AudioParam, l: Layer, t0: number): void {
  const end = t0 + l.dur;
  const attack = Math.min(Math.max(0, l.attack), l.dur);
  const decay = Math.min(Math.max(0, l.decay), l.dur - attack);
  const peak = Math.max(1e-4, l.gain);
  if (attack > 0) {
    p.setValueAtTime(1e-4, t0);
    p.linearRampToValueAtTime(peak, t0 + attack);
  } else {
    p.setValueAtTime(peak, t0);
  }
  if (decay > 0) {
    p.setValueAtTime(peak, end - decay);
    p.exponentialRampToValueAtTime(1e-4, end);
  }
  p.setValueAtTime(0, end);
}

function schedulePitch(p: AudioParam, l: Layer, t0: number): void {
  const [first, ...rest] = l.pitch ?? [];
  if (first) {
    p.setValueAtTime(first[1], t0 + first[0]);
    for (const [t, f] of rest) p.exponentialRampToValueAtTime(Math.max(1, f), t0 + t);
    return;
  }
  p.setValueAtTime(l.freq, t0);
  if (l.freqEnd !== undefined) p.exponentialRampToValueAtTime(Math.max(1, l.freqEnd), t0 + l.dur);
}

function buildLayer(ctx: OfflineAudioContext, l: Layer, rand: () => number): void {
  const t0 = l.delay ?? 0;
  const t1 = t0 + l.dur;
  let src: AudioScheduledSourceNode;
  if (l.kind === "noise") {
    const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(l.dur * ctx.sampleRate) + 1), ctx.sampleRate);
    fillNoise(buf.getChannelData(0), l.color ?? "white", rand);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    src = s;
  } else {
    const o = ctx.createOscillator();
    o.type = l.wave ?? "sine";
    schedulePitch(o.frequency, l, t0);
    src = o;
  }
  let node: AudioNode = src;
  if (l.filter) {
    const f = ctx.createBiquadFilter();
    f.type = l.filter.type;
    f.Q.value = l.filter.q;
    f.frequency.setValueAtTime(l.filter.freq, t0);
    if (l.filter.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(l.filter.freqEnd, t1);
    node.connect(f);
    node = f;
  }
  const env = ctx.createGain();
  scheduleEnvelope(env.gain, l, t0);
  node.connect(env);
  node = env;
  if (l.tremolo) {
    const trem = ctx.createGain();
    trem.gain.value = 1 - l.tremolo.depth / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = l.tremolo.rate;
    const depth = ctx.createGain();
    depth.gain.value = l.tremolo.depth / 2;
    lfo.connect(depth);
    depth.connect(trem.gain);
    lfo.start(t0);
    lfo.stop(t1);
    node.connect(trem);
    node = trem;
  }
  node.connect(ctx.destination);
  src.start(t0);
  src.stop(t1 + 0.005);
}

/** startRendering with the legacy event fallback (Safari < 14.1 returns no promise). */
function startRendering(ctx: OfflineAudioContext): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    ctx.oncomplete = (e) => resolve(e.renderedBuffer);
    const p = ctx.startRendering() as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
}

/** Renders any recipe to a mono AudioBuffer. Loop recipes are wrapped to their loop length. */
export async function renderRecipe(recipe: Recipe, seed: number, sampleRate = renderRate): Promise<AudioBuffer | null> {
  const Ctor = offlineCtor();
  if (!Ctor) return null;
  const length = Math.max(1, Math.ceil((recipeDuration(recipe) + 0.02) * sampleRate));
  const ctx = new Ctor(1, length, sampleRate);
  const rand = mulberry32(seed);
  for (const layer of recipe.layers) buildLayer(ctx, layer, rand);
  const rendered = await startRendering(ctx);
  if (!recipe.loop) {
    limitPeak(rendered.getChannelData(0));
    return rendered;
  }
  const loopSamples = Math.max(1, Math.round(loopLength(recipe) * sampleRate));
  const wrapped = wrapLoop(rendered.getChannelData(0), loopSamples);
  limitPeak(wrapped);
  const out = ctx.createBuffer(1, loopSamples, sampleRate);
  out.getChannelData(0).set(wrapped);
  return out;
}

const pending = new Map<SfxId, Promise<AudioBuffer | null>>();
const ready = new Map<SfxId, AudioBuffer>();

/** Already-rendered buffer for `id`, if any (synchronous fast path). */
export function readyBuffer(id: SfxId): AudioBuffer | undefined {
  return ready.get(id);
}

/** Renders (once) and returns the buffer for `id`; null when Web Audio is unavailable or rendering failed. */
export function getBuffer(id: SfxId): Promise<AudioBuffer | null> {
  let p = pending.get(id);
  if (!p) {
    p = renderRecipe(RECIPES[id], hashString(id))
      .then((buf) => {
        if (buf) ready.set(id, buf);
        return buf;
      })
      .catch(() => null);
    pending.set(id, p);
  }
  return p;
}

/** Warms the cache for `ids` (default: every sound). Never rejects. */
export async function preload(ids: readonly SfxId[] = SFX): Promise<void> {
  if (!offlineCtor()) return;
  await Promise.all(ids.map((id) => getBuffer(id)));
}

/** Drops every cached buffer (tests, or after a sample-rate change). */
export function clearCache(): void {
  pending.clear();
  ready.clear();
}
