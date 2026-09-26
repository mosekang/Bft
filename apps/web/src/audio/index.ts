/**
 * Public sound + haptics API for the web client. All functions are safe
 * no-ops where Web Audio / vibration is unavailable.
 */
import type { HapticId, SfxId } from "@dugout/protocol";
import { audioEngine, type LoopHandle, type PlayOptions, type Volumes } from "./engine.js";
import { haptic } from "./haptics.js";
import { preload } from "./synth.js";

export type { PlayOptions, Volumes } from "./engine.js";
export { startBgm, stopBgm, isBgmPlaying } from "./bgm.js";
export { haptic, setHapticsEnabled, hapticsEnabled, canVibrate } from "./haptics.js";
export { RECIPES } from "./recipes.js";

/** Plays a one-shot sound effect. */
export function sfx(id: SfxId, opts?: PlayOptions): void {
  audioEngine().play(id, opts);
}

const loops = new Map<SfxId, LoopHandle>();

/** Starts a looping sound (crowd_ambience, cheer_drum). Idempotent per id. */
export function startLoop(id: SfxId, opts?: PlayOptions): void {
  if (loops.has(id)) return;
  loops.set(id, audioEngine().loop(id, opts));
}

/** Fades out and stops a looping sound. Safe when not running. */
export function stopLoop(id: SfxId, fadeSeconds?: number): void {
  loops.get(id)?.stop(fadeSeconds);
  loops.delete(id);
}

/** Stops every running loop (e.g. when leaving a game). */
export function stopAllLoops(fadeSeconds?: number): void {
  for (const id of [...loops.keys()]) stopLoop(id, fadeSeconds);
}

export function setMuted(muted: boolean): void {
  audioEngine().setMuted(muted);
}

export function isMuted(): boolean {
  return audioEngine().isMuted();
}

export function setVolumes(v: Partial<Volumes>): void {
  audioEngine().setVolumes(v);
}

/** Crowd intensity 0..1; ambience gain = volume × (0.3 + 0.7 × level). */
export function setAmbienceLevel(level: number): void {
  audioEngine().setAmbienceLevel(level);
}

/** Maps play leverage (1..4, PlayMeta.leverage) to an ambience level 0..1. */
export function leverageToLevel(leverage: number): number {
  return Math.min(1, Math.max(0, (leverage - 1) / 3));
}

/**
 * Resumes audio from a user gesture. Also installs one-time
 * pointerdown/touchend/keydown listeners so the first tap unlocks iOS audio.
 */
export function unlockAudio(): Promise<void> {
  const engine = audioEngine();
  engine.installUnlockListeners();
  return engine.unlock();
}

/** Renders sounds ahead of time (default: all). Never rejects. */
export function preloadSfx(ids?: readonly SfxId[]): Promise<void> {
  return preload(ids).catch(() => undefined);
}

/** HUD moments with a matching sound + vibration. */
export type JuiceEvent =
  | "buy"
  | "sell"
  | "reroll"
  | "xp"
  | "levelUp"
  | "merge"
  | "synergyUp"
  | "synergyUp1"
  | "synergyUp2"
  | "synergyUp3"
  | "equip"
  | "itemCombine"
  | "gold"
  | "interest"
  | "damage"
  | "win"
  | "lose"
  | "error"
  | "button"
  | "lock";

type Cue = readonly [SfxId, PlayOptions?];
interface Juice {
  cues: readonly Cue[];
  haptic?: HapticId;
}

/** Repeats a sound `n` times, `gap` seconds apart. */
const repeat = (id: SfxId, n: number, gap: number, opts: PlayOptions = {}): Cue[] =>
  Array.from({ length: n }, (_, i) => [id, { ...opts, delay: i * gap }] as const);

const count = (x: number | undefined, max: number): number => Math.min(max, Math.max(1, Math.round(x ?? 1)));

/** Sound + haptic recipe for each HUD moment. `amount` is gold, damage or synergy tier. */
export function juiceFor(event: JuiceEvent, amount?: number): Juice {
  switch (event) {
    case "buy": return { cues: [["card_drop"]], haptic: "light" };
    case "sell": return { cues: [["coin", { volume: 0.8 }], ["dust", { volume: 0.5 }]], haptic: "light" };
    case "reroll": return { cues: [["reroll_shuffle"]], haptic: "light" };
    case "xp": return { cues: [["synergy_tone_1", { volume: 0.35, rate: 1.5 }]], haptic: "light" };
    case "levelUp": return { cues: [["level_up"]], haptic: "medium" };
    case "merge": return { cues: [["fanfare"], ["card_drop", { volume: 0.6 }]], haptic: "heavy" };
    case "synergyUp": return juiceFor(`synergyUp${count(amount, 3)}` as JuiceEvent);
    case "synergyUp1": return { cues: [["synergy_tone_1"]], haptic: "light" };
    case "synergyUp2": return { cues: [["synergy_tone_2"]], haptic: "medium" };
    case "synergyUp3": return { cues: [["synergy_tone_3"]], haptic: "heavy" };
    case "equip": return { cues: [["equip"]], haptic: "light" };
    case "itemCombine": return { cues: [["equip", { rate: 1.2 }], ["fanfare", { volume: 0.6, delay: 0.08 }]], haptic: "medium" };
    case "gold": return { cues: repeat("coin", count(amount, 5), 0.07, { volume: 0.8 }), haptic: "light" };
    case "interest": return { cues: repeat("interest_tick", count(amount, 5), 0.06) };
    case "damage": return { cues: [["damage_drum"]], haptic: (amount ?? 0) >= 8 ? "heavy" : "medium" };
    case "win": return { cues: [["win_sting"]], haptic: "medium" };
    case "lose": return { cues: [["lose_sting"]], haptic: "heavy2" };
    case "error": return { cues: [["error"]], haptic: "error" };
    case "button": return { cues: [["button"]] };
    case "lock": return { cues: [["button", { rate: 0.7 }], ["interest_tick", { volume: 0.6, delay: 0.03 }]], haptic: "light" };
  }
}

/** Plays the sound + haptic for a HUD moment, e.g. `juice("gold", 3)`. */
export function juice(event: JuiceEvent, amount?: number): void {
  const j = juiceFor(event, amount);
  for (const [id, opts] of j.cues) sfx(id, opts);
  if (j.haptic) haptic(j.haptic);
}
