/**
 * SD ("super-deformed") ballplayer parts (DESIGN §15.3): big round head
 * with a drawn anime face, stocky body, oversized hands/glove, helmet or
 * cap, team jersey with chest wordmark and back number. One InstancedMesh
 * per part; outlined parts get a second inverted-hull mesh.
 */
import * as THREE from "three";
import type { Joint } from "./clips.js";
import type { Actor } from "./actor.js";
import { pack } from "../lib/pack.js";

export const MAX_ACTORS = 44;

/** Skeleton offsets (metres before figure scale). Total height ≈ 1.8 with a 0.3 m head radius. */
export const BONES = {
  hipsY: 0.74, spineY: 0.04, headY: 0.6, shoulderX: 0.25, shoulderY: 0.4, upperArm: 0.21, forearm: 0.2,
  hipX: 0.11, hipY: -0.03, thigh: 0.34, shin: 0.33, batPivot: [0, 0.24, 0.3] as const,
};
export const BUILD_SCALE = [0.93, 1, 1.12] as const;

let toonRamp: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

/** Cel shading + a cool rim light so figures pop off the field at night. */
function addRim(sh: THREE.WebGLProgramParametersWithUniforms, strength = 0.55): void {
  sh.fragmentShader = sh.fragmentShader.replace(
    "#include <opaque_fragment>",
    `float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
    outgoingLight += vec3(0.55, 0.65, 0.95) * rim * ${strength.toFixed(2)};
    #include <opaque_fragment>`,
  );
}

export function toonMaterial(opts: { ghost?: boolean; gloss?: boolean } = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: 0xffffff });
  m.onBeforeCompile = (sh) => addRim(sh, opts.gloss ? 0.75 : 0.4);
  // Distinct program per variant: onBeforeCompile sources are identical otherwise.
  m.customProgramCacheKey = () => `toon-rim-${opts.gloss ? "gloss" : "matte"}`;
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
        if (vPattern > 0.5 && vPattern < 1.5) stripe = step(0.84, fract(vLocal.x * 22.0));
        if (vPattern > 1.5 && vPattern < 2.5) stripe = 1.0 - step(0.075, abs(vLocal.x * 0.9 + (vLocal.y - 0.24) * 0.75));
        // Collar piping and hem band in the accent colour for every style.
        stripe = max(stripe, step(0.43, vLocal.y) * step(vLocal.y, 0.47));
        stripe = max(stripe, step(vLocal.y, 0.03));
        diffuseColor.rgb = mix(diffuseColor.rgb, vAccent, stripe);`,
      );
    addRim(sh, 0.4);
  };
  m.customProgramCacheKey = () => "jersey-rim";
  return m;
}

// Decal atlases (canvas, white/colour art; instance colour multiplies) -------
interface Atlas { tex: THREE.CanvasTexture; grid: number }
const atlases = new Map<string, Atlas>();

function makeAtlas(key: string, grid: number, size: number, draw: (g: CanvasRenderingContext2D, cell: number, x: number, y: number, s: number) => void): Atlas | null {
  const hit = atlases.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  if (!g) return null;
  const s = size / grid;
  for (let c = 0; c < grid * grid; c++) draw(g, c, (c % grid) * s, Math.floor(c / grid) * s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const a = { tex, grid };
  atlases.set(key, a);
  return a;
}

export function numberAtlas(): Atlas | null {
  return makeAtlas("numbers", 10, 1024, (g, n, x, y, s) => {
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = `bold ${s * 0.7}px 'Bebas Neue', 'Arial Black', sans-serif`;
    const t = n === 0 ? "00" : String(n);
    g.lineWidth = s * 0.08; g.strokeStyle = "rgba(0,0,0,0.5)"; g.strokeText(t, x + s / 2, y + s * 0.53);
    g.fillStyle = "#fff"; g.fillText(t, x + s / 2, y + s * 0.53);
  });
}

/** Team wordmarks for the chest, one cell per pack team (index = team order). */
export function wordmarkAtlas(): Atlas | null {
  const shorts = pack.teams.map((t) => t.short ?? t.name.slice(0, 3));
  return makeAtlas(`wordmarks:${shorts.join(",")}`, 4, 1024, (g, n, x, y, s) => {
    const txt = shorts[n];
    if (!txt) return;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `italic bold ${s * (txt.length > 3 ? 0.3 : 0.4)}px 'Black Han Sans', 'Bebas Neue', sans-serif`;
    g.lineWidth = s * 0.05; g.strokeStyle = "rgba(0,0,0,0.45)"; g.strokeText(txt, x + s / 2, y + s / 2);
    g.fillStyle = "#fff"; g.fillText(txt, x + s / 2, y + s / 2);
  });
}

/** 9 face variants (eyes × mouth) in a warm anime style; brows follow the variant. */
export function faceAtlas(): Atlas | null {
  return makeAtlas("faces", 3, 768, (g, n, x, y, s) => {
    const eyes = n % 3, mouth = Math.floor(n / 3);
    const cx = x + s / 2, ey = y + s * 0.44;
    const dx = s * 0.2;
    // brows
    g.strokeStyle = "#2a1a12"; g.lineCap = "round"; g.lineWidth = s * 0.045;
    for (const k of [-1, 1]) {
      g.beginPath();
      const bx = cx + k * dx, by = ey - s * 0.17 - (eyes === 2 ? s * 0.02 : 0);
      g.moveTo(bx - k * s * 0.07, by + (mouth === 2 ? -s * 0.02 : s * 0.015));
      g.lineTo(bx + k * s * 0.07, by - (mouth === 2 ? s * 0.015 : s * 0.01));
      g.stroke();
    }
    // eyes
    for (const k of [-1, 1]) {
      const ex = cx + k * dx;
      if (eyes === 1) {
        // determined narrow eyes
        g.fillStyle = "#1c120c"; g.beginPath(); g.ellipse(ex, ey, s * 0.07, s * 0.045, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#fff"; g.beginPath(); g.arc(ex + s * 0.02, ey - s * 0.012, s * 0.014, 0, Math.PI * 2); g.fill();
      } else {
        const ry = eyes === 2 ? s * 0.1 : s * 0.09;
        g.fillStyle = "#fff"; g.beginPath(); g.ellipse(ex, ey, s * 0.072, ry, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#2b1a10"; g.beginPath(); g.ellipse(ex, ey + s * 0.01, s * 0.055, ry * 0.82, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#5b3a22"; g.beginPath(); g.ellipse(ex, ey + s * 0.03, s * 0.03, ry * 0.35, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#fff"; g.beginPath(); g.arc(ex + s * 0.018, ey - s * 0.025, s * 0.017, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(ex - s * 0.015, ey + s * 0.028, s * 0.008, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#1c120c"; g.lineWidth = s * 0.018; g.beginPath(); g.ellipse(ex, ey, s * 0.062, ry, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      }
    }
    // cheeks
    g.fillStyle = "rgba(255,120,110,0.28)";
    for (const k of [-1, 1]) { g.beginPath(); g.ellipse(cx + k * s * 0.27, ey + s * 0.1, s * 0.055, s * 0.03, 0, 0, Math.PI * 2); g.fill(); }
    // mouth
    g.strokeStyle = "#6e2b22"; g.lineWidth = s * 0.028; g.lineCap = "round";
    const my = ey + s * 0.2;
    g.beginPath();
    if (mouth === 0) { g.moveTo(cx - s * 0.06, my); g.quadraticCurveTo(cx, my + s * 0.05, cx + s * 0.06, my); g.stroke(); }
    else if (mouth === 1) { g.moveTo(cx - s * 0.05, my + s * 0.01); g.lineTo(cx + s * 0.05, my + s * 0.01); g.stroke(); }
    else { g.fillStyle = "#6e2b22"; g.moveTo(cx - s * 0.07, my - s * 0.01); g.quadraticCurveTo(cx, my + s * 0.09, cx + s * 0.07, my - s * 0.01); g.closePath(); g.fill(); g.fillStyle = "#fff"; g.fillRect(cx - s * 0.05, my - s * 0.005, s * 0.1, s * 0.022); }
  });
}

export type DecalAtlas = "numbers" | "wordmarks" | "faces";
export function decalMaterial(kind: DecalAtlas, opts: { ghost?: boolean } = {}): THREE.MeshBasicMaterial {
  const atlas = kind === "numbers" ? numberAtlas() : kind === "wordmarks" ? wordmarkAtlas() : faceAtlas();
  const grid = atlas?.grid ?? 1;
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...(atlas ? { map: atlas.tex } : {}) });
  if (opts.ghost) m.opacity = 0.45;
  m.customProgramCacheKey = () => `decal-${grid}`;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCell;\nvarying vec2 vCellUv;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>\nvCellUv = (uv + vec2(mod(aCell, ${grid.toFixed(1)}), ${(grid - 1).toFixed(1)} - floor(aCell / ${grid.toFixed(1)}))) / ${grid.toFixed(1)};`);
    // Includes are expanded after onBeforeCompile, so replace the whole chunk.
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCellUv;")
      .replace("#include <map_fragment>", "#ifdef USE_MAP\n  diffuseColor *= texture2D( map, vCellUv );\n#endif");
  };
  return m;
}

// Geometry helpers -------------------------------------------------------------
const cap = (r: number, len: number, y: number, sz = 1, seg = 12) => { const g = new THREE.CapsuleGeometry(r, len, 4, seg); g.translate(0, y, 0); g.scale(1, 1, sz); return g; };
const sphere = (r: number, x = 0, y = 0, z = 0, s: [number, number, number] = [1, 1, 1], seg = 16) => { const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.75))); g.scale(...s); g.translate(x, y, z); return g; };
const shell = (r: number, y: number, thetaStart: number, thetaLen: number, phiStart = 0, phiLen = Math.PI * 2, s: [number, number, number] = [1, 1, 1], z = 0) => { const g = new THREE.SphereGeometry(r, 20, 12, phiStart, phiLen, thetaStart, thetaLen); g.scale(...s); g.translate(0, y, z); return g; };
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (rt: number, rb: number, h: number, y: number, seg = 14) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, y, 0); return g; };
const shoe = () => { const g = new THREE.SphereGeometry(0.1, 12, 8); g.scale(0.85, 0.6, 1.5); g.translate(0, -0.35, 0.05); return g; };

export type MaterialKind = "toon" | "gloss" | "jersey" | "numbers" | "wordmarks" | "faces";
export interface PartDef {
  key: string;
  joint: Joint | "root";
  geometry: () => THREE.BufferGeometry;
  material: MaterialKind;
  applies: (a: Actor) => boolean;
  color: (a: Actor) => string;
  /** Glove/flap follow handedness by switching joint (no negative scale: it flips culling). */
  side?: "glove" | "flapL" | "flapR";
  pickable?: boolean;
  castShadow?: boolean;
  /** Draw an inverted-hull outline for this part. */
  outline?: boolean;
  /** Decal cell index for atlas materials. */
  cell?: (a: Actor) => number;
}

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};
const jerseyBase = (a: Actor) => (a.ap.replacement ? "#8b9096" : a.ap.uniform === "plain" ? a.ap.primary : "#f4f4ef");
const sleeveColor = (a: Actor) => (a.ap.uniform === "sleeve" ? a.ap.primary : jerseyBase(a));
const pants = (a: Actor) => (a.ap.replacement ? "#9ca3af" : a.away ? "#aeb4bd" : "#f4f4ef");
const hairOn = (a: Actor, ...styles: number[]) => !a.ap.replacement && styles.includes(a.ap.hairStyle);
const BATS = ["#d9b27c", "#1f1f1f", "#7a3b1f", "#e7c35a"];
const GLOVES = ["#9a5f2c", "#c08a4a", "#b4432e", "#e7c35a"];
const HEAD_Y = 0.2;
const HEAD_R = 0.29;

export const PARTS: PartDef[] = [
  { key: "torso", joint: "spine", geometry: () => cap(0.215, 0.24, 0.24, 0.8), material: "jersey", applies: () => true, color: jerseyBase, pickable: true, castShadow: true, outline: true },
  { key: "protector", joint: "spine", geometry: () => sphere(0.2, 0, 0.26, 0.09, [1.05, 1.15, 0.55], 14), material: "gloss", applies: (a) => a.headgear === "mask", color: (a) => shade(a.ap.primary, 0.45), outline: true },
  { key: "chest", joint: "spine", geometry: () => { const g = new THREE.PlaneGeometry(0.32, 0.16); g.translate(0, 0.3, 0.176); return g; }, material: "wordmarks", applies: (a) => !a.ap.replacement && a.headgear !== "mask" && a.role !== "U", color: (a) => (a.ap.uniform === "plain" ? a.ap.secondary : a.ap.primary), cell: (a) => Math.max(0, pack.teams.findIndex((t) => t.color === a.ap.primary)) },
  { key: "belt", joint: "hips", geometry: () => cyl(0.2, 0.2, 0.06, 0.02, 16), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#4b5563" : shade(a.ap.primary, 0.5)) },
  { key: "pelvis", joint: "hips", geometry: () => cap(0.19, 0.04, -0.07, 0.82), material: "toon", applies: () => true, color: pants, pickable: true, outline: true },
  { key: "head", joint: "head", geometry: () => sphere(HEAD_R, 0, HEAD_Y, 0, [1, 0.94, 0.96], 24), material: "toon", applies: () => true, color: (a) => a.ap.skin, pickable: true, castShadow: true, outline: true },
  { key: "ears", joint: "head", geometry: () => { const l = sphere(0.055, 0.285, HEAD_Y - 0.01, 0, [0.5, 1, 0.8], 10); const r = sphere(0.055, -0.285, HEAD_Y - 0.01, 0, [0.5, 1, 0.8], 10); return merge(l, r); }, material: "toon", applies: (a) => a.headgear !== "helmet", color: (a) => shade(a.ap.skin, 0.93) },
  { key: "face", joint: "head", geometry: () => shell(HEAD_R + 0.004, HEAD_Y, Math.PI * 0.36, Math.PI * 0.44, Math.PI * 0.24, Math.PI * 0.52, [1, 0.94, 0.96]), material: "faces", applies: (a) => !a.ap.replacement, color: () => "#ffffff", cell: (a) => (a.ap.eyes % 3) + 3 * (a.ap.mouth % 3) },
  { key: "hairBack", joint: "head", geometry: () => shell(HEAD_R + 0.012, HEAD_Y, Math.PI * 0.3, Math.PI * 0.36, Math.PI * 1.12, Math.PI * 0.76, [1, 0.95, 0.98]), material: "toon", applies: (a) => hairOn(a, 0, 1, 2, 3, 7), color: (a) => a.ap.hair, outline: true },
  { key: "hairLong", joint: "head", geometry: () => shell(HEAD_R + 0.016, HEAD_Y - 0.02, Math.PI * 0.28, Math.PI * 0.52, Math.PI * 1.05, Math.PI * 0.9, [1.02, 1.08, 1.02]), material: "toon", applies: (a) => hairOn(a, 4), color: (a) => a.ap.hair, outline: true },
  { key: "hairCurly", joint: "head", geometry: () => { const g = new THREE.IcosahedronGeometry(HEAD_R + 0.03, 2); g.scale(1, 0.98, 1); g.translate(0, HEAD_Y + 0.02, -0.03); return g; }, material: "toon", applies: (a) => hairOn(a, 5), color: (a) => a.ap.hair, outline: true },
  { key: "sideburns", joint: "head", geometry: () => merge(box(0.03, 0.12, 0.07, 0.27, HEAD_Y - 0.02, 0.04), box(0.03, 0.12, 0.07, -0.27, HEAD_Y - 0.02, 0.04)), material: "toon", applies: (a) => !a.ap.replacement && a.ap.hairStyle !== 6, color: (a) => a.ap.hair },
  { key: "stubble", joint: "head", geometry: () => shell(HEAD_R + 0.003, HEAD_Y, Math.PI * 0.62, Math.PI * 0.26, Math.PI * 0.1, Math.PI * 0.8, [1, 0.94, 0.96]), material: "toon", applies: (a) => !a.ap.replacement && a.ap.beard === 1, color: (a) => shade(a.ap.skin, 0.74) },
  { key: "goatee", joint: "head", geometry: () => sphere(0.05, 0, HEAD_Y - 0.25, 0.2, [1, 0.8, 0.6], 10), material: "toon", applies: (a) => !a.ap.replacement && a.ap.beard === 2, color: (a) => a.ap.hair },
  { key: "beard", joint: "head", geometry: () => shell(HEAD_R + 0.012, HEAD_Y, Math.PI * 0.58, Math.PI * 0.32, Math.PI * 0.05, Math.PI * 0.9, [1.02, 0.98, 1.0]), material: "toon", applies: (a) => !a.ap.replacement && a.ap.beard === 3, color: (a) => a.ap.hair, outline: true },
  { key: "capCrown", joint: "head", geometry: () => shell(HEAD_R + 0.025, HEAD_Y + 0.03, 0, Math.PI * 0.36, 0, Math.PI * 2, [1, 0.95, 1.02]), material: "toon", applies: (a) => a.headgear === "cap", color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary), castShadow: true, outline: true },
  { key: "capBrim", joint: "head", geometry: () => { const g = new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, -Math.PI / 2, Math.PI); g.scale(1, 1, 1.05); g.translate(0, HEAD_Y + 0.15, 0.17); g.rotateX(-0.08); return g; }, material: "toon", applies: (a) => a.headgear === "cap", color: (a) => (a.ap.replacement ? "#4b5563" : shade(a.ap.primary, 0.62)), outline: true },
  { key: "capLogo", joint: "head", geometry: () => { const g = new THREE.CircleGeometry(0.06, 16); g.translate(0, HEAD_Y + 0.23, HEAD_R - 0.02); g.rotateX(-0.6); return g; }, material: "toon", applies: (a) => a.headgear === "cap" && !a.ap.replacement, color: (a) => a.ap.secondary },
  { key: "helmet", joint: "head", geometry: () => shell(HEAD_R + 0.04, HEAD_Y + 0.02, 0, Math.PI * 0.4, 0, Math.PI * 2, [1, 0.97, 1.05]), material: "gloss", applies: (a) => a.headgear === "helmet", color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary), castShadow: true, outline: true },
  { key: "visor", joint: "head", geometry: () => { const g = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20, 1, false, -Math.PI / 2, Math.PI); g.translate(0, HEAD_Y + 0.14, 0.19); g.rotateX(-0.05); return g; }, material: "gloss", applies: (a) => a.headgear === "helmet", color: (a) => (a.ap.replacement ? "#4b5563" : shade(a.ap.primary, 0.7)), outline: true },
  { key: "flap", joint: "head", geometry: () => sphere(0.1, 0.31, HEAD_Y - 0.02, -0.02, [0.35, 1, 0.9], 12), material: "gloss", applies: (a) => a.headgear === "helmet" && !a.mirror, color: (a) => (a.ap.replacement ? "#4b5563" : a.ap.primary), side: "flapL", outline: true },
  { key: "flapR", joint: "head", geometry: () => sphere(0.1, -0.31, HEAD_Y - 0.02, -0.02, [0.35, 1, 0.9], 12), material: "gloss", applies: (a) => a.headgear === "helmet" && a.mirror, color: (a) => (a.ap.replacement ? "#4b5563" : a.ap.primary), side: "flapR", outline: true },
  { key: "mask", joint: "head", geometry: () => merge(merge(merge(box(0.36, 0.028, 0.03, 0, HEAD_Y + 0.02, HEAD_R + 0.03), box(0.3, 0.028, 0.03, 0, HEAD_Y - 0.1, HEAD_R + 0.02)), merge(box(0.028, 0.3, 0.03, 0.12, HEAD_Y - 0.05, HEAD_R + 0.025), box(0.028, 0.3, 0.03, -0.12, HEAD_Y - 0.05, HEAD_R + 0.025))), box(0.028, 0.3, 0.03, 0, HEAD_Y - 0.05, HEAD_R + 0.035)), material: "toon", applies: (a) => a.headgear === "mask", color: () => "#2b2f36", outline: true },
  { key: "maskHelmet", joint: "head", geometry: () => shell(HEAD_R + 0.03, HEAD_Y + 0.02, 0, Math.PI * 0.38, 0, Math.PI * 2), material: "gloss", applies: (a) => a.headgear === "mask", color: (a) => shade(a.ap.primary, 0.7), outline: true },
  { key: "uArmL", joint: "shL", geometry: () => cap(0.075, 0.12, -0.1, 1, 10), material: "toon", applies: () => true, color: sleeveColor, outline: true },
  { key: "uArmR", joint: "shR", geometry: () => cap(0.075, 0.12, -0.1, 1, 10), material: "toon", applies: () => true, color: sleeveColor, outline: true },
  { key: "bandL", joint: "shL", geometry: () => cyl(0.082, 0.082, 0.035, -0.15, 12), material: "toon", applies: (a) => !a.ap.replacement, color: (a) => a.ap.sleeve },
  { key: "bandR", joint: "shR", geometry: () => cyl(0.082, 0.082, 0.035, -0.15, 12), material: "toon", applies: (a) => !a.ap.replacement, color: (a) => a.ap.sleeve },
  { key: "wristband", joint: "elR", geometry: () => cyl(0.07, 0.07, 0.06, -0.14, 12), material: "toon", applies: (a) => !!a.look?.band, color: (a) => a.look?.band ?? "#60a5fa" },
  { key: "patch", joint: "shL", geometry: () => box(0.03, 0.08, 0.08, 0.075, -0.06, 0), material: "toon", applies: (a) => !!a.patch, color: (a) => a.patch ?? "#1e3a8a" },
  { key: "fArmL", joint: "elL", geometry: () => cap(0.062, 0.12, -0.09, 1, 10), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#9aa0a6" : a.role === "P" ? shade(a.ap.primary, 0.5) : a.ap.skin), outline: true },
  { key: "fArmR", joint: "elR", geometry: () => cap(0.062, 0.12, -0.09, 1, 10), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#9aa0a6" : a.role === "P" ? shade(a.ap.primary, 0.5) : a.ap.skin), outline: true },
  { key: "handL", joint: "elL", geometry: () => sphere(0.078, 0, -0.21, 0, [1, 1.05, 0.85], 12), material: "toon", applies: () => true, color: (a) => (a.prop === "bat" ? a.ap.secondary : a.ap.skin), outline: true },
  { key: "handR", joint: "elR", geometry: () => sphere(0.078, 0, -0.21, 0, [1, 1.05, 0.85], 12), material: "toon", applies: () => true, color: (a) => (a.prop === "bat" ? a.ap.secondary : a.ap.skin), outline: true },
  { key: "glove", joint: "elL", geometry: () => sphere(0.14, 0.01, -0.24, 0.04, [0.95, 1.2, 0.6], 14), material: "toon", applies: (a) => a.prop === "glove", color: (a) => GLOVES[a.look?.glove ?? a.ap.glove % 3]!, side: "glove", outline: true },
  { key: "thighL", joint: "hipL", geometry: () => cap(0.1, 0.14, -0.15, 1, 10), material: "toon", applies: () => true, color: pants, pickable: true, outline: true },
  { key: "thighR", joint: "hipR", geometry: () => cap(0.1, 0.14, -0.15, 1, 10), material: "toon", applies: () => true, color: pants, pickable: true, outline: true },
  { key: "shinL", joint: "knL", geometry: () => cap(0.08, 0.14, -0.15, 1, 10), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary), outline: true },
  { key: "shinR", joint: "knR", geometry: () => cap(0.08, 0.14, -0.15, 1, 10), material: "toon", applies: () => true, color: (a) => (a.ap.replacement ? "#6b7280" : a.ap.primary), outline: true },
  { key: "shoeL", joint: "knL", geometry: shoe, material: "gloss", applies: () => true, color: (a) => (a.ap.replacement ? "#374151" : "#121212"), outline: true },
  { key: "shoeR", joint: "knR", geometry: shoe, material: "gloss", applies: () => true, color: (a) => (a.ap.replacement ? "#374151" : "#121212"), outline: true },
  { key: "bat", joint: "bat", geometry: () => { const g = new THREE.CylinderGeometry(0.042, 0.02, 0.86, 10); g.translate(0, 0.43, 0); return g; }, material: "gloss", applies: (a) => a.prop === "bat", color: (a) => BATS[a.look?.bat ?? a.ap.bat % 4]!, castShadow: true, outline: true },
  { key: "number", joint: "spine", geometry: () => { const g = new THREE.PlaneGeometry(0.24, 0.24); g.rotateY(Math.PI); g.translate(0, 0.28, -0.178); return g; }, material: "numbers", applies: () => true, color: (a) => (a.ap.replacement ? "#d1d5db" : a.ap.uniform === "plain" ? a.ap.secondary : a.ap.primary), cell: (a) => a.ap.number % 100 },
];

function merge(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ai = a.index ? a.toNonIndexed() : a, bi = b.index ? b.toNonIndexed() : b;
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) {
    const x = ai.getAttribute(name), y = bi.getAttribute(name);
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array as Float32Array, 0);
    arr.set(y.array as Float32Array, x.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return out;
}

/** Inverted-hull outline material (object-space push along normals). */
export function outlineMaterial(width = 0.016, ghost = false): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0d12, side: THREE.BackSide });
  if (ghost) { m.transparent = true; m.opacity = 0.25; m.depthWrite = false; }
  m.customProgramCacheKey = () => `outline-${width}`;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  return m;
}

export { shade, jerseyBase };
