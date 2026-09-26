import { describe, expect, it } from "vitest";
import { MANIFEST, validateManifest } from "../src/index.js";

describe("asset manifest (§15.5)", () => {
  it("covers every clip and sound with an allowed licence", () => {
    const r = validateManifest();
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it("flags a missing sound and a forbidden licence", () => {
    const broken = { ...MANIFEST, sounds: MANIFEST.sounds.slice(1), models: [...MANIFEST.models, { id: "photo", kind: "image", source: "x", license: "unknown" }] };
    const r = validateManifest(broken);
    expect(r.errors.some((e) => e.startsWith("sound missing"))).toBe(true);
    expect(r.errors.some((e) => e.includes("licence not allowed"))).toBe(true);
  });
});
