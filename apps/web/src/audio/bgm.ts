/**
 * Procedural lobby BGM: a mellow 8-bar ballpark-organ loop (120 bpm, 16 s)
 * built from oscillator layers and rendered once offline. Lobby only; the
 * caller must stop it before a game starts.
 */
import { audioEngine } from "./engine.js";
import { midi, tone, type Layer, type Recipe } from "./kit.js";
import { renderRecipe } from "./synth.js";

const BAR = 2; // seconds per bar at 120 bpm
const BEAT = BAR / 4;

/** Chord voicings (MIDI) and bass roots: Cmaj7 Am7 Fmaj7 G7 | C Am Dm7 G7. */
const CHORDS: readonly (readonly [number, number, number, number])[] = [
  [60, 64, 67, 71],
  [57, 60, 64, 67],
  [57, 60, 64, 65],
  [55, 59, 62, 65],
  [60, 64, 67, 72],
  [57, 60, 64, 69],
  [57, 60, 62, 65],
  [55, 59, 62, 65],
];
const ROOTS = [48, 45, 41, 43, 48, 45, 50, 43] as const;
/** Melody: chord-tone index per beat (-1 = rest). */
const MELODY_A = [2, 3, 1, 2] as const;
const MELODY_B = [0, 2, 3, -1] as const;

export const BGM_LENGTH = CHORDS.length * BAR;

/** The lobby loop as a recipe (pure data, 16 s, loopable). */
export function bgmRecipe(): Recipe {
  const layers: Layer[] = [];
  CHORDS.forEach((chord, bar) => {
    const t = bar * BAR;
    for (const n of chord) {
      // Organ: two drawbars (8' and 4') with a gentle rotary-speaker wobble.
      const organ = { delay: t, attack: 0.06, decay: 0.35, tremolo: { rate: 6, depth: 0.15 } };
      layers.push(tone("sine", midi(n), BAR - 0.05, 0.05, organ), tone("triangle", midi(n + 12), BAR - 0.05, 0.018, organ));
    }
    const root = ROOTS[bar]!;
    layers.push(
      tone("triangle", midi(root), BEAT * 1.8, 0.24, { delay: t, attack: 0.01, decay: 0.6 }),
      tone("triangle", midi(root + 7), BEAT * 1.8, 0.2, { delay: t + BEAT * 2, attack: 0.01, decay: 0.6 }),
    );
    const pattern: readonly number[] = bar < 4 ? MELODY_A : MELODY_B;
    pattern.forEach((idx, beat) => {
      const note = idx >= 0 ? chord[idx] : undefined;
      if (note === undefined) return;
      layers.push(tone("triangle", midi(note + 12), BEAT * 0.85, 0.1, { delay: t + beat * BEAT, attack: 0.01, decay: BEAT * 0.7 }));
    });
  });
  return { channel: "ambience", loop: true, loopLength: BGM_LENGTH, layers };
}

let rendering: Promise<AudioBuffer | null> | null = null;
let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let token = 0;

/** Starts the lobby loop with a fade-in. No-op if already playing or unsupported. */
export function startBgm(): void {
  if (current) return;
  const engine = audioEngine();
  const ctx = engine.context();
  if (!ctx) return;
  const my = ++token;
  rendering ??= renderRecipe(bgmRecipe(), 0xb6a1).catch(() => null);
  void rendering.then((buf) => {
    if (!buf || my !== token || current) return;
    const node = engine.playBuffer(buf, "music", { volume: 1 }, true);
    if (!node) return;
    try {
      const t = ctx.currentTime;
      node.gain.gain.setValueAtTime(0, t);
      node.gain.gain.linearRampToValueAtTime(1, t + 1.5);
    } catch {
      /* ignore */
    }
    current = node;
  });
}

/** Fades the lobby loop out (default 0.8 s). Safe when not playing. */
export function stopBgm(fadeSeconds = 0.8): void {
  token++;
  const node = current;
  current = null;
  const ctx = audioEngine().context();
  if (!node || !ctx) return;
  try {
    const t = ctx.currentTime;
    const fade = Math.max(0.01, fadeSeconds);
    node.gain.gain.setValueAtTime(node.gain.gain.value, t);
    node.gain.gain.linearRampToValueAtTime(0, t + fade);
    node.src.stop(t + fade + 0.02);
  } catch {
    /* ignore */
  }
}

export function isBgmPlaying(): boolean {
  return current !== null;
}
