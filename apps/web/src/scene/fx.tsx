/**
 * Pooled particles (sparks, dust, fireworks, confetti, coins) and the ball
 * with its trail (DESIGN §16.4, §17.1). Driven by the scene clock so
 * hit-stop freezes them too.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { glowTexture } from "./Stadium.js";

export type BurstKind = "spark" | "dust" | "fireworks" | "confetti" | "coinBurst";

interface Pool {
  n: number;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  life: Float32Array;
  max: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  next: number;
  points: THREE.Points;
}

function makePool(n: number, size: number): Pool {
  const pos = new Float32Array(n * 3).fill(-9999);
  const col = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.PointsMaterial({ size, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  return { n, pos, vel: new Float32Array(n * 3), col, life: new Float32Array(n), max: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), next: 0, points };
}

const FIREWORK_COLORS = ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#f72585", "#ffffff", "#fb8500"];
const CONFETTI_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#f472b6", "#ffffff"];

export interface FxApi {
  burst: (kind: BurstKind, at: [number, number, number], count: number) => void;
}

/** Deterministic-enough jitter (visual only). */
function jitter(seed: { v: number }): number {
  seed.v = (seed.v * 1664525 + 1013904223) >>> 0;
  return seed.v / 4294967296;
}

export function Particles({ api, clock }: { api: React.MutableRefObject<FxApi | null>; clock: React.MutableRefObject<number> }) {
  const small = useMemo(() => makePool(1400, 0.9), []);
  const big = useMemo(() => makePool(900, 3.2), []);
  const seed = useRef({ v: 12345 });
  const last = useRef(clock.current);
  const c = useMemo(() => new THREE.Color(), []);

  const emit = (p: Pool, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, life: number, grav: number, drag: number) => {
    const i = p.next;
    p.next = (p.next + 1) % p.n;
    p.pos.set([x, y, z], i * 3);
    p.vel.set([vx, vy, vz], i * 3);
    c.set(color);
    p.col.set([c.r, c.g, c.b], i * 3);
    p.life[i] = life; p.max[i] = life; p.grav[i] = grav; p.drag[i] = drag;
  };

  api.current = {
    burst(kind, at, count) {
      const r = () => jitter(seed.current);
      const sph = (speed: number): [number, number, number] => { const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(th) * speed, u * speed, s * Math.sin(th) * speed]; };
      for (let k = 0; k < count; k++) {
        if (kind === "spark") { const v = sph(6 + r() * 7); emit(small, at[0], at[1], at[2], v[0], Math.abs(v[1]), v[2], r() < 0.5 ? "#fff6c2" : "#ffd166", 0.25 + r() * 0.2, -6, 0.5); }
        else if (kind === "dust") { const a = r() * Math.PI * 2, s = 1 + r() * 2.5; emit(small, at[0], at[1] + 0.1, at[2], Math.cos(a) * s, 0.6 + r() * 1.2, Math.sin(a) * s, r() < 0.5 ? "#8a5a33" : "#b07a4a", 0.6 + r() * 0.5, -2, 1.8); }
        else if (kind === "coinBurst") { const v = sph(4); emit(small, at[0], at[1], at[2], v[0], 4 + r() * 4, v[2], "#fbbf24", 0.8 + r() * 0.4, -9, 0.3); }
        else if (kind === "confetti") { emit(small, at[0] + (r() - 0.5) * 30, at[1] + 10 + r() * 14, at[2] + (r() - 0.5) * 30, (r() - 0.5) * 2, -1 - r(), (r() - 0.5) * 2, CONFETTI_COLORS[Math.floor(r() * CONFETTI_COLORS.length)]!, 2.5 + r() * 1.5, -1.2, 1.2); }
      }
      if (kind === "fireworks") {
        const shells = Math.max(2, Math.round(count / 40));
        for (let s = 0; s < shells; s++) {
          const cx = at[0] + (r() - 0.5) * 90, cy = at[1] + 30 + r() * 30, cz = at[2] + (r() - 0.5) * 30;
          const col = FIREWORK_COLORS[Math.floor(r() * FIREWORK_COLORS.length)]!;
          const per = Math.round(count / shells);
          for (let k = 0; k < per; k++) { const v = sph(14 + r() * 8); emit(big, cx, cy, cz, v[0], v[1], v[2], col, 1.2 + r() * 0.7, -7, 0.9); }
        }
      }
    },
  };

  useFrame(() => {
    const now = clock.current;
    const dt = Math.max(0, Math.min(0.1, now - last.current));
    last.current = now;
    if (dt === 0) return;
    for (const p of [small, big]) {
      let any = false;
      for (let i = 0; i < p.n; i++) {
        if (p.life[i]! <= 0) continue;
        any = true;
        p.life[i]! -= dt;
        const k = i * 3;
        if (p.life[i]! <= 0) { p.pos[k + 1] = -9999; continue; }
        const d = Math.max(0, 1 - p.drag[i]! * dt);
        p.vel[k]! *= d; p.vel[k + 2]! *= d;
        p.vel[k + 1] = p.vel[k + 1]! * d + p.grav[i]! * dt;
        p.pos[k]! += p.vel[k]! * dt; p.pos[k + 1]! += p.vel[k + 1]! * dt; p.pos[k + 2]! += p.vel[k + 2]! * dt;
        const f = p.life[i]! / p.max[i]!;
        if (f < 0.3) { p.col[k]! *= 0.9; p.col[k + 1]! *= 0.9; p.col[k + 2]! *= 0.9; }
      }
      if (any) { p.points.geometry.attributes["position"]!.needsUpdate = true; p.points.geometry.attributes["color"]!.needsUpdate = true; }
    }
  });
  return <><primitive object={small.points} /><primitive object={big.points} /></>;
}

export interface BallFlight { points: [number, number, number][]; start: number; flightTime: number; glow: boolean; color?: string }

/** Ball + fading trail; `flight` is set by the timeline player (world coordinates). */
export function Ball({ flight, clock, position }: { flight: React.MutableRefObject<BallFlight | null>; clock: React.MutableRefObject<number>; position: React.MutableRefObject<THREE.Vector3 | null> }) {
  const ball = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const N = 18;
  const trail = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const cols = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = 1 - i / N; cols.set([a, a, a * 0.9], i * 3); }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    return line;
  }, []);
  const hist = useRef<THREE.Vector3[]>([]);
  useFrame(() => {
    const f = flight.current;
    const b = ball.current, gl = glow.current;
    if (!b || !gl) return;
    if (!f || f.points.length < 2) { b.visible = false; gl.visible = false; trail.visible = false; position.current = null; hist.current = []; return; }
    const u = Math.max(0, Math.min(1, (clock.current - f.start) / Math.max(0.01, f.flightTime)));
    const x = u * (f.points.length - 1);
    const i = Math.min(f.points.length - 2, Math.floor(x));
    const a = f.points[i]!, c = f.points[i + 1]!, t = x - i;
    const p = new THREE.Vector3(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t);
    b.position.copy(p); b.visible = true;
    gl.position.copy(p); gl.visible = f.glow; gl.scale.setScalar(f.glow ? 2.6 : 1.1);
    position.current = p;
    const h = hist.current;
    if (!h.length || h[0]!.distanceTo(p) > 0.05) h.unshift(p.clone());
    if (h.length > N) h.length = N;
    const arr = trail.geometry.attributes["position"]!.array as Float32Array;
    for (let k = 0; k < N; k++) { const q = h[Math.min(k, h.length - 1)]!; arr.set([q.x, q.y, q.z], k * 3); }
    trail.geometry.attributes["position"]!.needsUpdate = true;
    (trail.material as THREE.LineBasicMaterial).color.set(f.color ?? (f.glow ? "#ffcc66" : "#ffffff"));
    (gl.material as THREE.SpriteMaterial).color.set(f.color ?? "#ffd27a");
    trail.visible = u < 1;
  });
  return (
    <>
      <mesh ref={ball} visible={false}><sphereGeometry args={[0.2, 12, 10]} /><meshBasicMaterial color="#fffdf5" /></mesh>
      <sprite ref={glow} visible={false}><spriteMaterial map={glowTexture()} color="#ffd27a" blending={THREE.AdditiveBlending} depthWrite={false} transparent /></sprite>
      <primitive object={trail} />
    </>
  );
}
