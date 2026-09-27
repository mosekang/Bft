/**
 * Procedural night ballpark (DESIGN §15.2): field, fence, three-tier bowl,
 * crowd (density = fan heart / 100), KBO thundersticks, light towers,
 * scoreboard, dugouts, bullpen and cheer stage. Variants per stadium.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { StadiumId } from "@dugout/protocol";
import { hashSeed } from "@dugout/engine";
import { BOARD_H, BOARD_W, drawScoreboard, type BoardData } from "./scoreboard.js";
import { CHEER_STAGE, DUGOUT_SPACING, FIELD_EXTENT, dugoutFrame, drawField, fenceDistance, parkDims, polar, wallPath, type ParkDims } from "./park.js";
import type { Quality } from "./quality.js";

const DEG = Math.PI / 180;

/** Uniforms shared by crowd shaders; stages drive them (time, wave, excitement). */
export const crowdUniforms = {
  uTime: { value: 0 },
  /** x = wave centre angle (rad), y = amplitude 0..1 */
  uWave: { value: new THREE.Vector2(0, 0) },
  uExcite: { value: 0.35 },
};

function seededRand(seed: string) {
  let [a, b, c, d] = hashSeed(seed);
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0;
    const r = (t + d) | 0; c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

function Field({ dims }: { dims: ParkDims }) {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    const { X, Z0, Z1 } = FIELD_EXTENT;
    cv.width = 1536;
    cv.height = Math.round(1536 * ((Z1 - Z0) / (2 * X)));
    const g = cv.getContext("2d");
    if (g) drawField(g, cv.width, cv.height, dims);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [dims]);
  useEffect(() => () => tex.dispose(), [tex]);
  const { X, Z0, Z1 } = FIELD_EXTENT;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (Z0 + Z1) / 2]} receiveShadow>
        <planeGeometry args={[2 * X, Z1 - Z0]} />
        <meshLambertMaterial map={tex} />
      </mesh>
      {/* Pitcher's mound + bases + home plate */}
      <mesh position={[0, 0.12, 18.4]} receiveShadow><cylinderGeometry args={[2.6, 2.9, 0.25, 24]} /><meshLambertMaterial color="#c07d47" /></mesh>
      <mesh position={[0, 0.26, 18.4]}><boxGeometry args={[0.6, 0.03, 0.15]} /><meshBasicMaterial color="#f5f5f0" /></mesh>
      {([[19.4, 19.4], [0, 38.8], [-19.4, 19.4]] as const).map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.05, z]} rotation-y={Math.PI / 4}><boxGeometry args={[0.38, 0.08, 0.38]} /><meshBasicMaterial color="#fafaf5" /></mesh>
      ))}
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.3, 5]} /><meshBasicMaterial color="#fafaf5" /></mesh>
      {([[24, 6], [30, 11]] as const).map(([x, z]) => (
        <mesh key={`bp${x}`} position={[x, 0.1, z]}><cylinderGeometry args={[2.0, 2.3, 0.2, 18]} /><meshLambertMaterial color="#b8733f" /></mesh>
      ))}
    </group>
  );
}

/** Outfield fence (padded segments + yellow top line) and foul poles. */
function Fence({ dims }: { dims: ParkDims }) {
  const { pad, line } = useMemo(() => {
    const n = 48;
    const segGeo = new THREE.BoxGeometry(1, 1, 0.5);
    const pad = new THREE.InstancedMesh(segGeo, new THREE.MeshLambertMaterial({ color: "#0d3b24" }), n);
    const line = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.18, 0.55), new THREE.MeshBasicMaterial({ color: "#facc15" }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t0 = (-45 + (90 * i) / n) * DEG, t1 = (-45 + (90 * (i + 1)) / n) * DEG;
      const a = polar(t0, fenceDistance(dims, t0)), b = polar(t1, fenceDistance(dims, t1));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.15;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(b[1] - a[1], b[0] - a[0]));
      p.set((a[0] + b[0]) / 2, dims.fenceH / 2, (a[1] + b[1]) / 2);
      s.set(len, dims.fenceH, 1);
      pad.setMatrixAt(i, m.compose(p, q, s));
      p.y = dims.fenceH + 0.05;
      s.set(len, 1, 1);
      line.setMatrixAt(i, m.compose(p, q, s));
    }
    return { pad, line };
  }, [dims]);
  const lf = polar(-45 * DEG, dims.lf), rf = polar(45 * DEG, dims.rf);
  return (
    <group>
      <primitive object={pad} />
      <primitive object={line} />
      {[lf, rf].map(([x, z], i) => (
        <mesh key={i} position={[x, 12, z]}><cylinderGeometry args={[0.18, 0.22, 24, 8]} /><meshBasicMaterial color="#fde047" /></mesh>
      ))}
    </group>
  );
}

interface Band { o0: number; y0: number; o1: number; y1: number; rows: number; colors: [string, string] }
const BANDS: Band[] = [
  { o0: 0, y0: 2.4, o1: 13, y1: 8.5, rows: 7, colors: ["#1f3b68", "#223f6e"] },
  { o0: 14, y0: 10.5, o1: 25, y1: 17, rows: 6, colors: ["#5f2a22", "#662d24"] },
  { o0: 26, y0: 19, o1: 35, y1: 25, rows: 5, colors: ["#2a2f3a", "#2d323e"] },
];

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (sh: number) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

function outwardNormals(pts: [number, number][]): [number, number][] {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n]!, b = pts[(i + 1) % n]!;
    const tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    return [-tz / l, tx / l];
  });
}

/** Stepped seating bowl built from the wall path (three tiers, seat-row colours). */
function Bowl({ dims }: { dims: ParkDims }) {
  const geo = useMemo(() => {
    const pts = wallPath(dims);
    const nrm = outwardNormals(pts);
    const pos: number[] = [], colr: number[] = [];
    const c = new THREE.Color();
    const quad = (a: number[], b: number[], cc: number[], d: number[], hex: string) => {
      c.set(hex);
      for (const v of [a, b, cc, a, cc, d]) { pos.push(v[0]!, v[1]!, v[2]!); colr.push(c.r, c.g, c.b); }
    };
    const n = pts.length;
    for (const band of BANDS) {
      for (let r = 0; r < band.rows; r++) {
        const f0 = r / band.rows, f1 = (r + 1) / band.rows;
        const o0 = band.o0 + (band.o1 - band.o0) * f0, o1 = band.o0 + (band.o1 - band.o0) * f1;
        const y0 = band.y0 + (band.y1 - band.y0) * f0, y1 = band.y0 + (band.y1 - band.y0) * f1;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (i === n - 1) continue;
          const P = (k: number, o: number, y: number) => [pts[k]![0] + nrm[k]![0] * o, y, pts[k]![1] + nrm[k]![1] * o];
          // tread + riser for a stepped look
          // Upper tiers stop short of home plate so the broadcast camera sees the field.
          if (band !== BANDS[0] && (pts[i]![1] < 12 || pts[j]![1] < 12)) continue;
          quad(P(i, o0, y0), P(j, o0, y0), P(j, o0, y1), P(i, o0, y1), shadeHex(band.colors[r % 2]!, 0.72));
          quad(P(i, o0, y1), P(j, o0, y1), P(j, o1, y1), P(i, o1, y1), band.colors[r % 2]!);
        }
      }
      // Front wall of the band.
      for (let i = 0; i < n - 1; i++) {
        const j = i + 1;
        if (band !== BANDS[0] && (pts[i]![1] < 12 || pts[j]![1] < 12)) continue;
        const P = (k: number, o: number, y: number) => [pts[k]![0] + nrm[k]![0] * o, y, pts[k]![1] + nrm[k]![1] * o];
        quad(P(i, band.o0, band.o0 === 0 ? 0 : band.y0 - 2), P(j, band.o0, band.o0 === 0 ? 0 : band.y0 - 2), P(j, band.o0, band.y0), P(i, band.o0, band.y0), band.o0 === 0 ? "#0d3b24" : "#0b0f16");
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
    g.computeVertexNormals();
    return g;
  }, [dims]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo}><meshLambertMaterial vertexColors side={THREE.DoubleSide} /></mesh>;
}

/** Seat spots on the bowl (deterministic order so fans leave in a stable pattern as fan heart drops). */
function seatSpots(dims: ParkDims, max: number): { x: number; y: number; z: number; yaw: number; lower: boolean }[] {
  const pts = wallPath(dims);
  const nrm = outwardNormals(pts);
  const rnd = seededRand("seats");
  const out: { x: number; y: number; z: number; yaw: number; lower: boolean }[] = [];
  const n = pts.length;
  let guard = 0;
  while (out.length < max && guard++ < max * 4) {
    const i = Math.floor(rnd() * (n - 1));
    const f = rnd();
    const band = BANDS[rnd() < 0.55 ? 0 : rnd() < 0.7 ? 1 : 2]!;
    if (band !== BANDS[0] && pts[i]![1] < 12) continue;
    const row = Math.floor(rnd() * band.rows);
    const o = band.o0 + (band.o1 - band.o0) * ((row + 0.5) / band.rows);
    const y = band.y0 + (band.y1 - band.y0) * ((row + 1) / band.rows);
    const px = pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * f + nrm[i]![0] * o;
    const pz = pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * f + nrm[i]![1] * o;
    out.push({ x: px, y, z: pz, yaw: Math.atan2(-px, 35 - pz), lower: band === BANDS[0] });
  }
  return out;
}

function crowdMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms["uTime"] = crowdUniforms.uTime;
    sh.uniforms["uWave"] = crowdUniforms.uWave;
    sh.uniforms["uExcite"] = crowdUniforms.uExcite;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec2 uWave;\nuniform float uExcite;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3]);
        float ph = ip.x * 1.7 + ip.z * 0.9;
        float ang = atan(ip.x, ip.z - 35.0);
        float dw = ang - uWave.x;
        float wave = uWave.y * exp(-dw * dw * 9.0);
        transformed.y += (0.12 * uExcite * max(0.0, sin(uTime * 7.0 + ph)) + wave * 1.1) * (0.6 + position.y);
        #endif`,
      );
  };
  return m;
}

function Crowd({ dims, density, quality, colors }: { dims: ParkDims; density: number; quality: Quality; colors: [string, string] }) {
  const max = quality === "high" ? 2200 : 1300;
  const spots = useMemo(() => seatSpots(dims, max), [dims, max]);
  const meshes = useMemo(() => {
    // A seated fan: capsule torso + head (one merged geometry, one draw call).
    const torso = new THREE.CapsuleGeometry(0.24, 0.32, 2, quality === "high" ? 8 : 5);
    torso.translate(0, 0.42, 0);
    const head = new THREE.SphereGeometry(0.17, quality === "high" ? 8 : 6, 5);
    head.translate(0, 0.98, 0);
    const body = mergeGeometries([torso.toNonIndexed(), head.toNonIndexed()])!;
    const people = new THREE.InstancedMesh(body, crowdMaterial(), max);
    const stickGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.75, 5);
    stickGeo.rotateZ(0.35);
    stickGeo.translate(0.12, 1.2, 0.15);
    const sticks = new THREE.InstancedMesh(stickGeo, crowdMaterial(), max);
    for (const m of [people, sticks]) { m.frustumCulled = false; }
    return { people, sticks };
  }, [quality, max]);
  useEffect(() => {
    const rnd = seededRand("crowd-colors");
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const shown = Math.round(spots.length * Math.max(0, Math.min(1, density)));
    const palette = [colors[0], colors[0], colors[1], "#f1f5f9", "#1f2937", "#fbbf24", "#60a5fa"];
    let sticks = 0;
    const c = new THREE.Color();
    for (let i = 0; i < shown; i++) {
      const sp = spots[i]!;
      p.set(sp.x, sp.y, sp.z);
      q.setFromAxisAngle(up, sp.yaw);
      const scale = 0.9 + rnd() * 0.25;
      s.set(scale, scale, scale);
      m.compose(p, q, s);
      meshes.people.setMatrixAt(i, m);
      meshes.people.setColorAt(i, c.set(palette[Math.floor(rnd() * palette.length)]!));
      if (sp.lower && rnd() < 0.45) {
        meshes.sticks.setMatrixAt(sticks, m);
        meshes.sticks.setColorAt(sticks, c.set(rnd() < 0.7 ? colors[0] : colors[1]));
        sticks++;
      }
    }
    meshes.people.count = shown;
    meshes.sticks.count = sticks;
    meshes.people.instanceMatrix.needsUpdate = true;
    meshes.sticks.instanceMatrix.needsUpdate = true;
    if (meshes.people.instanceColor) meshes.people.instanceColor.needsUpdate = true;
    if (meshes.sticks.instanceColor) meshes.sticks.instanceColor.needsUpdate = true;
  }, [meshes, spots, density, colors]);
  return <><primitive object={meshes.people} /><primitive object={meshes.sticks} /></>;
}

let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,240,1)"); grd.addColorStop(0.25, "rgba(255,250,220,0.6)"); grd.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

function LightTowers() {
  const spots: [number, number][] = [[-78, 12], [78, 12], [-76, 104], [76, 104]];
  return (
    <group>
      {spots.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <mesh position={[0, 24, 0]}><cylinderGeometry args={[0.5, 0.8, 48, 6]} /><meshLambertMaterial color="#374151" /></mesh>
          <mesh position={[0, 49, 0]} rotation-y={Math.atan2(-x, 40 - z)}><boxGeometry args={[10, 5, 0.8]} /><meshBasicMaterial color="#fffbe8" /></mesh>
          <sprite position={[0, 49, 0]} scale={[34, 34, 1]}><spriteMaterial map={glowTexture()} blending={THREE.AdditiveBlending} depthWrite={false} transparent opacity={0.85} /></sprite>
        </group>
      ))}
    </group>
  );
}

function Scoreboard({ dims, data }: { dims: ParkDims; data: BoardData }) {
  const { tex, g } = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = BOARD_W; cv.height = BOARD_H;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return { tex: t, g: cv.getContext("2d") };
  }, []);
  const blink = useRef(false);
  useEffect(() => {
    if (!g) return;
    drawScoreboard(g, data, false);
    tex.needsUpdate = true;
    if (!data.flash) return;
    const id = window.setInterval(() => { blink.current = !blink.current; drawScoreboard(g, data, blink.current); tex.needsUpdate = true; }, 280);
    return () => window.clearInterval(id);
  }, [data, g, tex]);
  const z = dims.cf + 44;
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 14, 0.6]}><boxGeometry args={[4, 28, 1]} /><meshLambertMaterial color="#1f2937" /></mesh>
      <mesh position={[0, 30, 0.5]}><boxGeometry args={[36, 19, 1]} /><meshLambertMaterial color="#111827" /></mesh>
      <mesh position={[0, 30, 0]} rotation-y={Math.PI}><planeGeometry args={[34, 17]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
  );
}

function Dugout({ side, color, scale }: { side: "home" | "away"; color: string; scale: number }) {
  const f = dugoutFrame(side, 6, DUGOUT_SPACING, 5, scale);
  const L = f.length, s = scale;
  return (
    <group position={[f.center[0], 0, f.center[1]]} rotation-y={f.yaw}>
      <mesh position={[0, -0.95, 0]}><boxGeometry args={[L, 0.2, 2.2 * s]} /><meshLambertMaterial color="#3f3a36" /></mesh>
      <mesh position={[0, 0.5 * s, -1.1 * s]}><boxGeometry args={[L, 2.6 * s, 0.3]} /><meshLambertMaterial color="#1f2937" /></mesh>
      {/* Prep scale (s > 1) drops the roof so the seated bench stays visible from the board camera. */}
      {s <= 1 && <mesh position={[0, 1.8 * s, -0.1 * s]}><boxGeometry args={[L + 0.4, 0.25 * s, 2.5 * s]} /><meshLambertMaterial color="#111827" /></mesh>}
      <mesh position={[0, s <= 1 ? 1.8 * s : 0.9, s <= 1 ? 1.16 * s : 1.3 * s]}><boxGeometry args={[L + 0.4, s <= 1 ? 0.45 * s : 0.9, 0.12]} /><meshBasicMaterial color={color} /></mesh>
      <mesh position={[0, -0.9 + 0.45 * s, -0.55 * s]}><boxGeometry args={[L - 0.5, 0.15 * s, 0.5 * s]} /><meshLambertMaterial color="#6b4f3a" /></mesh>
      <mesh position={[0, 0.1, 1.15 * s]}><boxGeometry args={[L, 0.9, 0.1]} /><meshLambertMaterial color="#0d3b24" /></mesh>
    </group>
  );
}

function CheerStage({ color, scale }: { color: string; scale: number }) {
  const h = CHEER_STAGE.pos[1];
  return (
    <group position={[CHEER_STAGE.pos[0], 0, CHEER_STAGE.pos[2]]} rotation-y={CHEER_STAGE.yaw}>
      <mesh position={[0, h / 2, 0]}><boxGeometry args={[3.2 * scale, h, 1.6 * scale]} /><meshLambertMaterial color="#1f2937" /></mesh>
      <mesh position={[0, h * 0.55, 0.81 * scale]}><planeGeometry args={[3.2 * scale, h * 0.7]} /><meshBasicMaterial color={color} /></mesh>
      <mesh position={[1.5 * scale, h + 1.6 * scale, -0.6 * scale]}><cylinderGeometry args={[0.05, 0.05, 3.2 * scale, 5]} /><meshLambertMaterial color="#d1d5db" /></mesh>
      <mesh position={[0.85 * scale, h + 2.7 * scale, -0.6 * scale]}><planeGeometry args={[1.3 * scale, 0.9 * scale]} /><meshBasicMaterial color={color} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

function Sky({ dome }: { dome: boolean }) {
  const { sky, stars } = useMemo(() => {
    const g = new THREE.SphereGeometry(700, 24, 12);
    const cols: number[] = [];
    const top = new THREE.Color("#050814"), mid = new THREE.Color("#101a3a"), hor = new THREE.Color("#3a2b52");
    const p = g.getAttribute("position");
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 700;
      if (y > 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.75)); else c.copy(hor).lerp(mid, Math.max(0, (y + 0.05) / 0.3));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const rnd = seededRand("stars");
    const sp: number[] = [];
    for (let i = 0; i < 500; i++) { const th = rnd() * Math.PI * 2, ph = 0.15 + rnd() * 1.3; sp.push(Math.cos(th) * Math.cos(ph) * 650, Math.sin(ph) * 650, Math.sin(th) * Math.cos(ph) * 650); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    return { sky: g, stars: sg };
  }, []);
  if (dome) {
    return (
      <group>
        <mesh position={[0, 0, 45]}><sphereGeometry args={[175, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshLambertMaterial color="#6b7280" side={THREE.BackSide} /></mesh>
        <mesh position={[0, 62, 45]} rotation-x={Math.PI / 2}><torusGeometry args={[110, 1.2, 6, 48]} /><meshBasicMaterial color="#fff7d6" /></mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={sky}><meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} fog={false} /></mesh>
      <points geometry={stars}><pointsMaterial color="#e0e7ff" size={1.6} sizeAttenuation={false} fog={false} /></points>
    </group>
  );
}

function Sea() {
  const gulls = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = gulls.current;
    if (!g) return;
    g.children.forEach((c, i) => { const t = clock.elapsedTime * 0.25 + i * 2.1; c.position.set(80 + Math.cos(t) * 30, 40 + Math.sin(t * 2) * 3, 90 + Math.sin(t) * 30); c.rotation.z = Math.sin(clock.elapsedTime * 6 + i) * 0.4; });
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[230, -3, 180]}><planeGeometry args={[400, 400]} /><meshLambertMaterial color="#0b3a66" emissive="#0a2a4a" /></mesh>
      <group ref={gulls}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}><planeGeometry args={[3, 0.8]} /><meshBasicMaterial color="#f8fafc" side={THREE.DoubleSide} /></mesh>
        ))}
      </group>
    </group>
  );
}

export interface StadiumProps {
  stadium: StadiumId;
  quality: Quality;
  /** 0..1 — fan heart / 100 (§15.2 crowd density). */
  crowd: number;
  homeColors: [string, string];
  board: BoardData;
  /** Scale of dugouts/stage to match figure scale (prep figures are chess-piece sized). */
  propScale?: number;
  /** Foreign-player flags in the stands; red warning banner on quota violation (§18.1). */
  banners?: { flags: number; warning: boolean };
}

const FLAG_COLORS: [string, string, string][] = [["#b22234", "#ffffff", "#3c3b6e"], ["#002d62", "#ce1126", "#ffffff"], ["#ffcc00", "#00247d", "#cf142b"]];

function Banners({ dims, flags, warning }: { dims: ParkDims; flags: number; warning: boolean }) {
  return (
    <group>
      {Array.from({ length: flags }, (_, i) => {
        const th = (i === 0 ? -28 : 28) * DEG;
        const [x, z] = polar(th, fenceDistance(dims, th) + 6);
        const col = FLAG_COLORS[i % FLAG_COLORS.length]!;
        return (
          <group key={i} position={[x, 9, z]} rotation-y={Math.atan2(-x, -z)}>
            <mesh position={[0, 3, 0]}><cylinderGeometry args={[0.12, 0.12, 12, 6]} /><meshLambertMaterial color="#d1d5db" /></mesh>
            {col.map((cc, k) => <mesh key={k} position={[3.2, 7.6 - k * 1.2, 0]}><planeGeometry args={[6, 1.2]} /><meshBasicMaterial color={cc} side={THREE.DoubleSide} /></mesh>)}
          </group>
        );
      })}
      {warning && (
        <mesh position={[0, dims.fenceH + 3, dims.cf + 2]} rotation-y={Math.PI}><planeGeometry args={[30, 4]} /><meshBasicMaterial color="#dc2626" side={THREE.DoubleSide} /></mesh>
      )}
    </group>
  );
}

export function Stadium({ stadium, quality, crowd, homeColors, board, propScale = 1, banners }: StadiumProps) {
  const dims = useMemo(() => parkDims(stadium), [stadium]);
  return (
    <group>
      <Sky dome={dims.dome} />
      <Field dims={dims} />
      <Fence dims={dims} />
      <Bowl dims={dims} />
      <Crowd dims={dims} density={crowd} quality={quality} colors={homeColors} />
      {!dims.dome && <LightTowers />}
      <Scoreboard dims={dims} data={board} />
      <Dugout side="home" color={homeColors[0]} scale={propScale} />
      <Dugout side="away" color="#475569" scale={propScale} />
      <CheerStage color={homeColors[0]} scale={propScale} />
      {dims.sea && <Sea />}
      {banners && <Banners dims={dims} flags={banners.flags} warning={banners.warning} />}
    </group>
  );
}
