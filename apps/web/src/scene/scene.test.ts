import { describe, expect, it } from "vitest";
import { CLIPS, CLIP_FALLBACKS, PackSchema } from "@dugout/protocol";
import fictional from "@dugout/packs/fictional-v1.json";
import { CLIP_LIBRARY, JOINTS, mirrorPose, samplePose } from "./clips.js";
import { appearanceOf, replacementAppearance, SKIN_TONES } from "../lib/appearance.js";
import { BOARD_SPOTS, fenceDistance, parkDims, specToWorld, wallPath } from "./park.js";
import { STADIUM_IDS, SLOTS } from "@dugout/protocol";

const pack = PackSchema.parse(fictional);

describe("procedural clip library (§15.4)", () => {
  it("implements every shared clip name (no fallback needed)", () => {
    for (const c of CLIPS) expect(CLIP_LIBRARY[c], c).toBeDefined();
    for (const [from, to] of Object.entries(CLIP_FALLBACKS)) expect(CLIPS).toContain(to ?? from);
  });
  it("samples finite poses across each clip and wraps loops", () => {
    for (const [name, clip] of Object.entries(CLIP_LIBRARY)) {
      for (let t = -0.2; t <= clip.dur + 0.3; t += clip.dur / 7) {
        const p = samplePose(name as keyof typeof CLIP_LIBRARY, t);
        for (const j of JOINTS) for (const v of p.rot[j]) expect(Number.isFinite(v), `${name}@${t}:${j}`).toBe(true);
        expect(Math.abs(p.lift)).toBeLessThan(1);
      }
      expect(clip.keys[0]![0]).toBe(0);
      expect(clip.keys[clip.keys.length - 1]![0]).toBeCloseTo(clip.dur, 5);
    }
  });
  it("mirroring twice is the identity", () => {
    const p = samplePose("swing_contact", 0.36);
    const m = mirrorPose(mirrorPose(p));
    for (const j of JOINTS) expect(m.rot[j]).toEqual(p.rot[j].map((v) => v + 0));
  });
});

describe("appearance (§15.3)", () => {
  it("is deterministic per card and varied across the pack", () => {
    const looks = pack.cards.map((c) => appearanceOf(c));
    expect(pack.cards.map((c) => appearanceOf(c))).toEqual(looks);
    expect(new Set(looks.map((l) => l.skin)).size).toBeGreaterThan(2);
    expect(new Set(looks.map((l) => l.hairStyle)).size).toBeGreaterThan(4);
    expect(new Set(looks.map((l) => l.primary)).size).toBeGreaterThan(5);
    for (const l of looks) { expect(SKIN_TONES).toContain(l.skin); expect(l.number).toBeGreaterThanOrEqual(1); expect(l.number).toBeLessThanOrEqual(99); }
  });
  it("gives veterans beards more often than everyone else", () => {
    const vets = pack.cards.filter((c) => c.origin === "VETERAN").map(appearanceOf);
    const rest = pack.cards.filter((c) => c.origin !== "VETERAN").map(appearanceOf);
    const rate = (xs: typeof vets) => xs.filter((l) => l.beard > 0).length / Math.max(1, xs.length);
    expect(rate(vets)).toBeGreaterThan(rate(rest));
  });
  it("replacement players are grey with number 00", () => {
    const r = replacementAppearance("x");
    expect(r.replacement).toBe(true);
    expect(r.number).toBe(0);
  });
});

describe("park layout (§15.2)", () => {
  it("fences follow the stadium dimensions", () => {
    expect(fenceDistance(parkDims("HITTER_FRIENDLY"), 0)).toBeCloseTo(110);
    expect(fenceDistance(parkDims("PITCHER_FRIENDLY"), 0)).toBeCloseTo(125);
    for (const id of STADIUM_IDS) expect(wallPath(parkDims(id)).length).toBeGreaterThan(40);
  });
  it("puts left field on +x in render space and converts spec coordinates", () => {
    expect(BOARD_SPOTS["LF"]![0]).toBeGreaterThan(0);
    expect(BOARD_SPOTS["3B"]![0]).toBeGreaterThan(0);
    expect(specToWorld([-45, 0, 75])).toEqual([45, 0, 75]);
    for (const s of SLOTS) expect(BOARD_SPOTS[s]).toBeDefined();
  });
});
