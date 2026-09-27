/** Shared stage plumbing: frame ticker, FPS probe, camera fitting. */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { crowdUniforms } from "./Stadium.js";

/**
 * Drives a `frameloop="demand"` canvas at `fps`, pausing while the tab is
 * hidden, and advances `clock` by real time × `timeScale` (0 = hit-stop).
 */
export function Ticker({ fps, clock, timeScale }: { fps: number; clock: React.MutableRefObject<number>; timeScale?: React.MutableRefObject<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0, last = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) return;
      if (now - last < 1000 / fps - 2) return;
      last = now;
      invalidate();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fps, invalidate]);
  const prev = useRef<number | null>(null);
  useFrame(({ clock: c }) => {
    const now = c.elapsedTime;
    const dt = prev.current === null ? 0 : Math.min(0.1, now - prev.current);
    prev.current = now;
    clock.current += dt * (timeScale ? timeScale.current : 1);
    crowdUniforms.uTime.value = clock.current;
  }, -10);
  return null;
}

/** Average FPS over the first `ms`, reported once (DESIGN §15.6 auto tier). */
export function FpsProbe({ ms = 2000, warmup = 1500, onResult }: { ms?: number; warmup?: number; onResult: (fps: number) => void }) {
  const start = useRef<number | null>(null);
  const born = useRef<number | null>(null);
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    const now = performance.now();
    // Skip the first frames: shader compilation stalls are not the steady frame rate.
    if (born.current === null) born.current = now;
    if (now - born.current < warmup) return;
    if (start.current === null) { start.current = now; return; }
    frames.current++;
    if (now - start.current >= ms) { done.current = true; onResult((frames.current * 1000) / (now - start.current)); }
  });
  return null;
}

/**
 * Place `camera` on a ray from `target` (given yaw/elevation) at the smallest
 * distance where every point projects inside ±margin NDC.
 */
export function fitCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, points: THREE.Vector3[], yaw: number, elevation: number, margin = 0.9): void {
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(elevation) * -1, Math.sin(elevation), -Math.cos(yaw) * Math.cos(elevation));
  const v = new THREE.Vector3();
  let lo = 20, hi = 600;
  for (let it = 0; it < 24; it++) {
    const d = (lo + hi) / 2;
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    let ok = true;
    for (const p of points) {
      v.copy(p).project(camera);
      if (Math.abs(v.x) > margin || Math.abs(v.y) > margin || v.z > 1) { ok = false; break; }
    }
    if (ok) hi = d; else lo = d;
  }
  camera.position.copy(target).addScaledVector(dir, hi);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/** Screen position (CSS px relative to the canvas) of a world point. */
export function toScreen(p: THREE.Vector3, camera: THREE.Camera, w: number, h: number): { x: number; y: number; visible: boolean } {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
}
