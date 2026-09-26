// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { HAPTICS, SFX, SFX_LOOPS, type HapticId } from "@dugout/protocol";
import { bgmRecipe, BGM_LENGTH } from "./bgm.js";
import { fillNoise, hashString, limitPeak, mulberry32, wrapLoop } from "./dsp.js";
import { AudioEngine } from "./engine.js";
import { loopLength, recipeDuration, type Recipe } from "./kit.js";
import { RECIPES } from "./recipes.js";
import { clearCache, getBuffer, renderRecipe } from "./synth.js";
import { FakeAudioContext, FakeOfflineAudioContext, type FakeGain } from "./fake-webaudio.js";
import {
  haptic,
  isMuted,
  juice,
  juiceFor,
  leverageToLevel,
  preloadSfx,
  setAmbienceLevel,
  setHapticsEnabled,
  setMuted,
  setVolumes,
  sfx,
  startBgm,
  startLoop,
  stopBgm,
  stopLoop,
  unlockAudio,
  type JuiceEvent,
} from "./index.js";

const JUICE_EVENTS: JuiceEvent[] = ["buy", "sell", "reroll", "xp", "levelUp", "merge", "synergyUp", "synergyUp1", "synergyUp2", "synergyUp3", "equip", "itemCombine", "gold", "interest", "damage", "win", "lose", "error", "button", "lock"];

function checkLayers(r: Recipe): void {
  for (const l of r.layers) {
    expect(l.gain).toBeGreaterThan(0);
    expect(l.gain).toBeLessThanOrEqual(1);
    expect(l.dur).toBeGreaterThan(0);
    expect(l.attack).toBeGreaterThanOrEqual(0);
    expect(l.attack).toBeLessThanOrEqual(l.dur);
    expect(l.decay).toBeGreaterThanOrEqual(0);
    expect(l.delay ?? 0).toBeGreaterThanOrEqual(0);
    if (l.kind === "osc") expect(l.freq).toBeGreaterThan(0);
    for (const [, f] of l.pitch ?? []) expect(f).toBeGreaterThan(0);
    if (l.filter) {
      expect(l.filter.freq).toBeGreaterThanOrEqual(20);
      expect(l.filter.freq).toBeLessThanOrEqual(20000);
    }
    if (l.tremolo) {
      expect(l.tremolo.depth).toBeGreaterThanOrEqual(0);
      expect(l.tremolo.depth).toBeLessThanOrEqual(1);
    }
  }
}

describe("recipes (§17.3)", () => {
  it("has a recipe for every SFX id and nothing else", () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...SFX].sort());
    for (const id of SFX) expect(RECIPES[id].layers.length).toBeGreaterThan(0);
  });

  it("marks exactly SFX_LOOPS as loops on the ambience channel", () => {
    const loops = SFX.filter((id) => RECIPES[id].loop);
    expect(loops.sort()).toEqual([...SFX_LOOPS].sort());
    for (const id of SFX_LOOPS) expect(RECIPES[id].channel).toBe("ambience");
  });

  it("keeps durations sane: one-shots <= 5 s, loops 1.5..6 s", () => {
    for (const id of SFX) {
      const r = RECIPES[id];
      if (r.loop) {
        expect(loopLength(r), id).toBeGreaterThanOrEqual(1.5);
        expect(loopLength(r), id).toBeLessThanOrEqual(6);
        expect(recipeDuration(r), id).toBeLessThanOrEqual(6);
      } else {
        expect(recipeDuration(r), id).toBeGreaterThan(0);
        expect(recipeDuration(r), id).toBeLessThanOrEqual(5);
      }
    }
  });

  it("keeps every layer's gain within 0..1 and parameters valid", () => {
    for (const id of SFX) checkLayers(RECIPES[id]);
  });

  it("aligns loop tremolo rates to the loop period so loops are seamless", () => {
    for (const id of SFX_LOOPS) {
      const r = RECIPES[id];
      for (const l of r.layers) {
        if (!l.tremolo) continue;
        const cycles = l.tremolo.rate * loopLength(r);
        expect(Math.abs(cycles - Math.round(cycles)), id).toBeLessThan(1e-9);
      }
    }
  });

  it("builds a 16 s loopable lobby BGM", () => {
    const r = bgmRecipe();
    expect(r.loop).toBe(true);
    expect(loopLength(r)).toBe(BGM_LENGTH);
    expect(BGM_LENGTH).toBe(16);
    expect(recipeDuration(r)).toBeLessThanOrEqual(BGM_LENGTH);
    checkLayers(r);
  });
});

describe("dsp", () => {
  it("seeded noise is deterministic and bounded", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 100 }, a);
    expect(Array.from({ length: 100 }, b)).toEqual(seqA);
    expect(Array.from({ length: 100 }, mulberry32(43))).not.toEqual(seqA);
    for (const x of seqA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    for (const color of ["white", "pink", "brown"] as const) {
      const n1 = fillNoise(new Float32Array(4096), color, mulberry32(hashString("crowd_ambience")));
      const n2 = fillNoise(new Float32Array(4096), color, mulberry32(hashString("crowd_ambience")));
      expect(n2).toEqual(n1);
      expect(Math.max(...n1.map(Math.abs))).toBeLessThan(1.5);
      expect(n1.some((x) => x !== 0)).toBe(true);
    }
    expect(hashString("bat_crack_weak")).not.toBe(hashString("bat_crack_mid"));
  });

  it("wraps loop tails onto the start and limits peaks", () => {
    const data = new Float32Array([1, 2, 3, 4, 10, 20]);
    expect([...wrapLoop(data, 4)]).toEqual([11, 22, 3, 4]);
    const loud = new Float32Array([0.5, -2, 1]);
    expect(limitPeak(loud, 1)).toBe(2);
    expect(Math.max(...loud.map(Math.abs))).toBeCloseTo(1);
  });
});

describe("runtime without Web Audio / vibration (jsdom)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setHapticsEnabled(true);
    setMuted(false);
  });

  it("does not throw for any sound, loop, BGM or HUD moment", async () => {
    expect(globalThis.AudioContext).toBeUndefined();
    for (const id of SFX) expect(() => sfx(id, { volume: 0.5, rate: 1.2, pan: -0.5 })).not.toThrow();
    for (const id of SFX_LOOPS) {
      expect(() => startLoop(id)).not.toThrow();
      expect(() => stopLoop(id)).not.toThrow();
    }
    expect(() => startBgm()).not.toThrow();
    expect(() => stopBgm()).not.toThrow();
    expect(() => setAmbienceLevel(0.7)).not.toThrow();
    expect(() => setVolumes({ master: 0.5, sfx: 2, ambience: -1 })).not.toThrow();
    for (const e of JUICE_EVENTS) expect(() => juice(e, 9)).not.toThrow();
    await expect(unlockAudio()).resolves.toBeUndefined();
    await expect(preloadSfx()).resolves.toBeUndefined();
    await expect(renderRecipe(RECIPES.coin, 1)).resolves.toBeNull();
  });

  it("haptic is a silent no-op without navigator.vibrate", () => {
    expect(typeof (navigator as Navigator & { vibrate?: unknown }).vibrate).not.toBe("function");
    for (const id of Object.keys(HAPTICS) as HapticId[]) expect(() => haptic(id)).not.toThrow();
  });

  it("haptic vibrates the protocol pattern when supported and enabled", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    haptic("heavy2");
    expect(vibrate).toHaveBeenCalledWith([45, 60, 45]);
    setHapticsEnabled(false);
    haptic("light");
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("persists the muted flag in localStorage", () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(localStorage.getItem("dugout.muted")).toBe("1");
    expect(new AudioEngine().isMuted()).toBe(true);
    setMuted(false);
    expect(localStorage.getItem("dugout.muted")).toBe("0");
    expect(new AudioEngine().isMuted()).toBe(false);
  });
});

describe("juice", () => {
  it("maps HUD moments to sounds and haptics", () => {
    expect(juiceFor("buy")).toEqual({ cues: [["card_drop"]], haptic: "light" });
    expect(juiceFor("gold", 3).cues.filter(([id]) => id === "coin")).toHaveLength(3);
    expect(juiceFor("gold", 99).cues).toHaveLength(5);
    expect(juiceFor("damage", 8).haptic).toBe("heavy");
    expect(juiceFor("damage", 3).haptic).toBe("medium");
    expect(juiceFor("synergyUp", 2)).toEqual(juiceFor("synergyUp2"));
    expect(juiceFor("error").haptic).toBe("error");
    for (const e of JUICE_EVENTS) for (const [id] of juiceFor(e, 2).cues) expect(RECIPES[id]).toBeDefined();
  });

  it("maps leverage 1..4 to ambience level 0..1", () => {
    expect(leverageToLevel(1)).toBe(0);
    expect(leverageToLevel(4)).toBe(1);
    expect(leverageToLevel(2)).toBeCloseTo(1 / 3);
  });
});

describe("with a fake Web Audio implementation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearCache();
    setMuted(false);
  });

  it("renders every recipe (and the BGM) with valid automation", async () => {
    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
    for (const id of SFX) {
      const r = RECIPES[id];
      const buf = await renderRecipe(r, hashString(id), 8000);
      expect(buf, id).not.toBeNull();
      if (r.loop) expect(buf!.length, id).toBe(Math.round(loopLength(r) * 8000));
      else expect(buf!.length, id).toBeGreaterThanOrEqual(Math.floor(recipeDuration(r) * 8000));
      const peak = Math.max(...buf!.getChannelData(0).map(Math.abs));
      expect(peak, id).toBeLessThanOrEqual(0.95 + 1e-6);
    }
    const bgm = await renderRecipe(bgmRecipe(), 1, 8000);
    expect(bgm!.length).toBe(16 * 8000);
  });

  it("routes one-shots to their bus, applies mute and ambience level", async () => {
    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const engine = new AudioEngine();
    const ctx = engine.context() as unknown as FakeAudioContext;
    expect(ctx).toBeInstanceOf(FakeAudioContext);
    await engine.unlock();
    expect(ctx.state).toBe("running");
    const primed = ctx.started.length; // the silent iOS unlock buffer
    await getBuffer("coin");
    engine.play("coin", { volume: 0.5, pan: 0.3 });
    expect(ctx.started).toHaveLength(primed + 1);
    engine.setMuted(true);
    engine.play("coin");
    expect(ctx.started).toHaveLength(primed + 1);
    const master = (engine.output("sfx") as unknown as FakeGain).connections[0] as FakeGain;
    expect(master.gain.target).toBe(0);
    engine.setMuted(false);
    engine.setAmbienceLevel(1);
    expect((engine.output("ambience") as unknown as FakeGain).gain.target).toBeCloseTo(engine.getVolumes().ambience);
    engine.setAmbienceLevel(0);
    expect((engine.output("ambience") as unknown as FakeGain).gain.target).toBeCloseTo(engine.getVolumes().ambience * 0.3);
    const handle = engine.loop("crowd_ambience");
    await getBuffer("crowd_ambience");
    await Promise.resolve();
    expect(ctx.started.at(-1)?.loop).toBe(true);
    expect(() => handle.stop()).not.toThrow();
  });
});
