/**
 * Geometry, materials and part table for the procedural low-poly players
 * (DESIGN §15.3). One InstancedMesh per part keeps draw calls low.
 */
import * as THREE from "three";
import type { Joint } from "./clips.js";
import type { Actor } from "./actor.js";

export const MAX_ACTORS = 44;

/** Skeleton offsets (metres, regular build, before figure scale). */
export const BONES = {
  hipsY: 0.98, spineY: 0.05, headY: 0.56, shoulderX: 0.22, shoulderY: 0.47, upperArm: 0.29, forearm: 0.27,
  hipX: 0.1, hipY: -0.04, thigh: 0.46, shin: 0.46, batPivot: [0, 0.3, 0.26] as const,
};
export const BUILD_SCALE = [0.92, 1, 1.12] as const;

let toonRamp: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

export function toonMaterial(opts: { ghost?: boolean } = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: 0xffffff });
  if (opts.ghost) { m.transparent = true; m.opacity = 0.42; m.depthWrite = false; m.emissive = new THREE.Color("#2dd4bf"); m.emissiveIntensity = 0.35; }
  return m;
}

/** Jersey material: per-instance accent colour + pattern (0 plain, 1 pinstripe, 2 sash, 3 sleeve-only). */
export function jerseyMaterial(opts: { ghost?: boolean } = {}): THREE.MeshToonMaterial {
  const m = toonMaterial(opts);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aAccent;\nattribute float aPattern;\nvarying vec3 vAccent;\nvarying float vPattern;\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAccent = aAccent;\nvPattern = aPattern;\nvLocal = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vAccent;\nvarying float vPattern;\nvarying vec3 vLocal;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float stripe = 0.0;
        if (vPattern > 0.5 && vPattern < 1.5) stripe = step(0.82, fract(vLocal.x * 24.0));
        if (vPattern > 1.5 && vPattern < 2.5) stripe = 1.0 - step(0.07, abs(vLocal.x * 0.9 + (vLocal.y - 0.28) * 0.75));
        if (vLocal.y > 0.5) stripe = max(stripe, 0.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vAccent, stripe);`,
      );
  };
  return m;
}

/** Number atlas 10×10 cells "00".."99", white on transparent. */
let atlas: THREE.CanvasTexture | null = null;
export function numberAtlas(): THREE.CanvasTexture | null {
  if (atlas) return atlas;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1024;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "bold 70px 'Bebas Neue', 'Arial Black', sans-serif";
  for (let n = 0; n < 100; n++) {
    const x = (n % 10) * 102.4 + 51.2, y = Math.floor(n / 10) * 102.4 + 54;
    const s = n === 0 ? "00" : String(n);
    g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,0.55)"; g.strokeText(s, x, y);
    g.fillStyle = "#fff"; g.fillText(s, x, y);
  }
  atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

export function decalMaterial(opts: { ghost?: boolean } = {}): THREE.MeshBasicMaterial {
  const map = numberAtlas();
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...(map ? { map } : {}) });
  if (opts.ghost) m.opacity = 0.45;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCell;\nvarying vec2 vCellUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvCellUv = (uv + vec2(mod(aCell, 10.0), 9.0 - floor(aCell / 10.0))) / 10.0;");
    // Includes are expanded after onBeforeCompile, so replace the whole chunk.
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCellUv;")
      .replace("#include <map_fragment>", "#ifdef USE_MAP\n  diffuseColor *= texture2D( map, vCellUv );\n#endif");
  };
  return m;
}

// Geometry helpers -----------------------------------------------------------
const cap = (r: number, len: number, y: number, sz = 1) => { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.translate(0, y, 0); g.scale(1, 1, sz); return g; };
const sphere = (r: number, x = 0, y = 0, z = 0, s: [number, number, number] = [1, 1, 1], seg = 10) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)); g.scale(...s); g.translate(x, y, z); return g; };
const shell = (r: number, y: number, thetaStart: number, thetaLen: number, phiStart = 0, phiLen = Math.PI * 2, s: [number, number, number] = [1, 1, 1]) => { const g = new THREE.SphereGeometry(r, 12, 8, phiStart, phiLen, thetaStart, thetaLen); g.scale(...s); g.translate(0, y, 0); return g; };
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (rt: number, rb: number, h: number, y: number, seg = 10) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, y, 0); return g; };

export type MaterialKind = "toon" | "jersey" | "decal";
export interface PartDef {
  key: string;
  joint: Joint | "root";
  geometry: () => THREE.BufferGeometry;
  material: MaterialKind;
  /** Whether this actor shows the part. */
  applies: (a: Actor) => boolean;
  color: (a: Actor) => string;
  /** Mirror on the x axis for left-handed actors (glove, flap). */
  side?: "glove" | "throw" | "flapL" | "flapR";
  pickable?: boolean;
  castShadow?: boolean;
}

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};
const jerseyBase = (a: Actor) => (a.ap.replacement ? "#8b9096" : a.ap.uniform === "plain" ? a.ap.primary : "#f2f2ee");
const sleeveColor = (a: Actor) => (a.ap.uniform === "sleeve" ? a.ap.primary : jerseyBase(a));
const pants = (a: Actor) => (a.ap.replacement ? "#9ca3af" : a.away ? "#b9bec6" : "#f2f2ee");
const hairOn = (a: Actor, ...styles: number[]) => !a.ap.replacement && styles.includes(a.ap.hairStyle);
const BATS = ["#d9b27c", "#1f1f1f", "#7a3b1f", "#e7c35a"];
const GLOVES = ["#8b5a2b", "#1f1f1f", "#b4432e", "#e7c35a"];

export const PARTS: PartDef[] = [
  { key: "torso", joint: "spine", geometry: () => cap(0.19, 0.3, 0.28, 0.72), material: "jersey", applies: () => true, color: jerseyBase, pickable: true, castShadow: true },
  { key: "protector", joint: "spine", geometry: () => box(0.3, 0.38, 0.06, 0, 0.3, 0.13), material: "toon", applies: (a) => a.headgear === "mask", color: () => "#23262b" },
  { key: "neck", joint: "spine", geometry: () => cyl(0.06, 0.065, 0.1, 0.52), material: "toon", applies: () => true, color: (a) => shade(a.ap.skin, 0.9) },
  { key: "belt", joint: "hips", geometry: () => cyl(0.178, 0.178, 0.06, 0.03, 12), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#4b5563" : shade(a.ap.primary, 0.55)) },
  { key: "pelvis", joint: "hips", geometry: () => cap(0.165, 0.06, -0.06, 0.8), material: "toon", applies: () => true, color: pants, pickable: true },
  { key: "head", joint: "head", geometry: () => sphere(0.125, 0, 0.13, 0, [0.95, 1.1, 1]), material: "toon", applies: () => true, color: (a) => a.ap.skin, pickable: true, castShadow: true },
  { key: "eyes", joint: "head", geometry: () => { const g = new THREE.BufferGeometry(); const a = sphere(0.017, 0.045, 0.145, 0.112, [1, 1.2, 0.6], 6); const b = sphere(0.017, -0.045, 0.145, 0.112, [1, 1.2, 0.6], 6); return mergeTwo(g, a, b); }, material: "toon", applies: (a) => !a.ap.replacement, color: () => "#15110d" },
  { key: "nose", joint: "head", geometry: () => box(0.03, 0.045, 0.04, 0, 0.11, 0.123), material: "toon", applies: (a) => !a.ap.replacement, color: (a) => shade(a.ap.skin, 0.88) },
  { key: "hairShort", joint: "head", geometry: () => shell(0.132, 0.13, Math.PI * 0.35, Math.PI * 0.35, Math.PI * 0.55, Math.PI * 0.9, [0.97, 1.08, 1.02]), material: "toon", applies: (a) => hairOn(a, 0, 1, 2, 3, 7), color: (a) => a.ap.hair },
  { key: "hairLong", joint: "head", geometry: () => shell(0.136, 0.12, Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.5, Math.PI, [0.98, 1.15, 1.05]), material: "toon", applies: (a) => hairOn(a, 4), color: (a) => a.ap.hair },
  { key: "hairCurly", joint: "head", geometry: () => { const g = new THREE.IcosahedronGeometry(0.14, 1); g.scale(0.98, 1.0, 1.02); g.translate(0, 0.14, -0.02); return g; }, material: "toon", applies: (a) => hairOn(a, 5), color: (a) => a.ap.hair },
  { key: "stubble", joint: "head", geometry: () => shell(0.128, 0.13, Math.PI * 0.62, Math.PI * 0.28, -Math.PI * 0.45, Math.PI * 0.9, [0.97, 1.1, 1.02]), material: "toon", applies: (a) => !a.ap.replacement && a.ap.beard === 1, color: (a) => shade(a.ap.skin, 0.72) },
  { key: "goatee", joint: "head", geometry: () => box(0.05, 0.05, 0.03, 0, 0.035, 0.115), material: "toon", applies: (a) => !a.ap.replacement && a.ap.beard === 2, color: (a) => a.ap.hair },
  { key: "beard", joint: "head", geometry: () => shell(0.133, 0.13, Math.PI * 0.58, Math.PI * 0.34, -Math.PI * 0.5, Math.PI, [0.98, 1.12, 1.04]), material: "toon", applies: (a) => !a.ap.replacement && a.ap.beard === 3, color: (a) => a.ap.hair },
  { key: "capCrown", joint: "head", geometry: () => shell(0.138, 0.16, 0, Math.PI * 0.5, 0, Math.PI * 2, [1, 0.95, 1.05]), material: "toon", applies: (a) => a.headgear === "cap", color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary), castShadow: true },
  { key: "capBrim", joint: "head", geometry: () => { const g = new THREE.CylinderGeometry(0.1, 0.1, 0.015, 12, 1, false, -Math.PI / 2, Math.PI); g.scale(1, 1, 1.1); g.translate(0, 0.165, 0.11); return g; }, material: "toon", applies: (a) => a.headgear === "cap", color: (a) => (a.ap.replacement ? "#4b5563" : shade(a.ap.primary, 0.6)) },
  { key: "helmet", joint: "head", geometry: () => shell(0.152, 0.15, 0, Math.PI * 0.56, 0, Math.PI * 2, [1, 0.98, 1.06]), material: "toon", applies: (a) => a.headgear === "helmet", color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary), castShadow: true },
  { key: "flap", joint: "head", geometry: () => box(0.035, 0.1, 0.1, 0.14, 0.08, 0.01), material: "toon", applies: (a) => a.headgear === "helmet", color: (a) => (a.ap.replacement ? "#4b5563" : shade(a.ap.primary, 0.75)), side: "flapL" },
  { key: "mask", joint: "head", geometry: () => box(0.2, 0.2, 0.04, 0, 0.12, 0.14), material: "toon", applies: (a) => a.headgear === "mask", color: () => "#2b2f36" },
  { key: "maskHelmet", joint: "head", geometry: () => shell(0.145, 0.15, 0, Math.PI * 0.5, 0, Math.PI * 2), material: "toon", applies: (a) => a.headgear === "mask", color: (a) => shade(a.ap.primary, 0.7) },
  { key: "uArmL", joint: "shL", geometry: () => cap(0.066, 0.18, -0.14), material: "toon", applies: () => true, color: sleeveColor },
  { key: "uArmR", joint: "shR", geometry: () => cap(0.066, 0.18, -0.14), material: "toon", applies: () => true, color: sleeveColor },
  { key: "bandL", joint: "shL", geometry: () => cyl(0.072, 0.072, 0.035, -0.2, 10), material: "toon", applies: (a) => !a.ap.replacement, color: (a) => a.ap.sleeve },
  { key: "bandR", joint: "shR", geometry: () => cyl(0.072, 0.072, 0.035, -0.2, 10), material: "toon", applies: (a) => !a.ap.replacement, color: (a) => a.ap.sleeve },
  { key: "wristband", joint: "elR", geometry: () => cyl(0.064, 0.064, 0.06, -0.22, 10), material: "toon", applies: (a) => !!a.look?.band, color: (a) => a.look?.band ?? "#60a5fa" },
  { key: "patch", joint: "shL", geometry: () => box(0.03, 0.08, 0.08, 0.066, -0.08, 0), material: "toon", applies: (a) => !!a.patch, color: (a) => a.patch ?? "#1e3a8a" },
  { key: "fArmL", joint: "elL", geometry: () => cap(0.055, 0.17, -0.13), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#9aa0a6" : a.role === "P" ? shade(a.ap.primary, 0.5) : a.ap.skin) },
  { key: "fArmR", joint: "elR", geometry: () => cap(0.055, 0.17, -0.13), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#9aa0a6" : a.role === "P" ? shade(a.ap.primary, 0.5) : a.ap.skin) },
  { key: "handL", joint: "elL", geometry: () => sphere(0.055, 0, -0.29, 0, [1, 1.1, 0.8], 8), material: "toon", applies: () => true, color: (a) => (a.prop === "bat" ? a.ap.secondary : a.ap.skin) },
  { key: "handR", joint: "elR", geometry: () => sphere(0.055, 0, -0.29, 0, [1, 1.1, 0.8], 8), material: "toon", applies: () => true, color: (a) => (a.prop === "bat" ? a.ap.secondary : a.ap.skin) },
  { key: "glove", joint: "elL", geometry: () => sphere(0.11, 0.01, -0.31, 0.03, [0.9, 1.25, 0.55], 10), material: "toon", applies: (a) => a.prop === "glove", color: (a) => GLOVES[a.look?.glove ?? a.ap.glove % 3]!, side: "glove" },
  { key: "thighL", joint: "hipL", geometry: () => cap(0.088, 0.26, -0.22), material: "toon", applies: () => true, color: pants, pickable: true },
  { key: "thighR", joint: "hipR", geometry: () => cap(0.088, 0.26, -0.22), material: "toon", applies: () => true, color: pants, pickable: true },
  { key: "shinL", joint: "knL", geometry: () => cap(0.066, 0.28, -0.22), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary) },
  { key: "shinR", joint: "knR", geometry: () => cap(0.066, 0.28, -0.22), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary) },
  { key: "shoeL", joint: "knL", geometry: () => box(0.1, 0.07, 0.24, 0, -0.46, 0.05), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#374151" : "#141414") },
  { key: "shoeR", joint: "knR", geometry: () => box(0.1, 0.07, 0.24, 0, -0.46, 0.05), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#374151" : "#141414") },
  { key: "bat", joint: "bat", geometry: () => { const g = new THREE.CylinderGeometry(0.036, 0.018, 0.84, 8); g.translate(0, 0.42, 0); return g; }, material: "toon", applies: (a) => a.prop === "bat", color: (a) => BATS[a.look?.bat ?? a.ap.bat % 4]!, castShadow: true },
  { key: "number", joint: "spine", geometry: () => { const g = new THREE.PlaneGeometry(0.2, 0.2); g.rotateY(Math.PI); g.translate(0, 0.33, -0.142); return g; }, material: "decal", applies: () => true, color: (a) => (a.ap.replacement ? "#d1d5db" : a.ap.uniform === "plain" ? a.ap.secondary : a.ap.primary) },
];

function mergeTwo(target: THREE.BufferGeometry, a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ai = a.toNonIndexed(), bi = b.toNonIndexed();
  for (const name of ["position", "normal", "uv"] as const) {
    const x = ai.getAttribute(name), y = bi.getAttribute(name);
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array as Float32Array, 0);
    arr.set(y.array as Float32Array, x.array.length);
    target.setAttribute(name, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return target;
}

export { shade, jerseyBase };
