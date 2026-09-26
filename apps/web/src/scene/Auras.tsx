/** Draws synergy auras and item glows for a list of actors (§18.1–18.2). */
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Actor } from "./actor.js";
import { glowTexture } from "./Stadium.js";

const MAX = 160;

function points(size: number): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  p.frustumCulled = false;
  return p;
}

export function Auras({ actors, clock }: { actors: React.MutableRefObject<Actor[]>; clock: React.MutableRefObject<number> }) {
  const parts = useMemo(() => {
    const big = points(1);
    const small = points(1);
    const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 36, Math.PI * 1.6).rotateX(-Math.PI / 2);
    const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), MAX);
    const coneGeo = new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0);
    const spots = new THREE.InstancedMesh(coneGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 12);
    for (const m of [rings, spots]) { m.frustumCulled = false; m.count = 0; }
    return { big, small, rings, spots };
  }, []);
  const c = useMemo(() => new THREE.Color(), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const t = clock.current;
    const bp = parts.big.geometry.attributes["position"]!.array as Float32Array, bc = parts.big.geometry.attributes["color"]!.array as Float32Array;
    const sp = parts.small.geometry.attributes["position"]!.array as Float32Array, sc = parts.small.geometry.attributes["color"]!.array as Float32Array;
    let nb = 0, ns = 0, nr = 0, nsp = 0;
    let bigSize = 1, smallSize = 1;
    for (const a of actors.current) {
      if (a.hidden) continue;
      const s = a.scale;
      bigSize = 2.4 * s; smallSize = 0.9 * s;
      const pulse = 0.85 + 0.15 * Math.sin(t * 4 + a.pos[0]);
      for (const au of a.auras ?? []) {
        if (au.kind === "glow" && nb < MAX) {
          c.set(au.color).multiplyScalar((au.strong ? 1 : 0.7) * pulse);
          bp.set([a.pos[0], a.pos[1] + 1.15 * s, a.pos[2]], nb * 3); bc.set([c.r, c.g, c.b], nb * 3); nb++;
          if (au.strong && nb < MAX) { bp.set([a.pos[0], a.pos[1] + 1.9 * s, a.pos[2]], nb * 3); bc.set([c.r, c.g, c.b], nb * 3); nb++; }
        } else if ((au.kind === "ring" || au.kind === "spin") && nr < MAX) {
          const r = (0.55 + 0.1 * nr % 3) * s * (au.strong ? 1.15 : 1);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), au.kind === "spin" ? t * 3 : a.pos[0]);
          m4.compose(new THREE.Vector3(a.pos[0], a.pos[1] + 0.08 + 0.05 * (nr % 3), a.pos[2]), q, new THREE.Vector3(r * pulse, 1, r * pulse));
          parts.rings.setMatrixAt(nr, m4);
          parts.rings.setColorAt(nr, c.set(au.color));
          nr++;
        } else if (au.kind === "spot" && nsp < 12) {
          m4.compose(new THREE.Vector3(a.pos[0], a.pos[1] + 9 * s, a.pos[2]), q.identity(), new THREE.Vector3(1.4 * s, 9 * s, 1.4 * s));
          parts.spots.setMatrixAt(nsp, m4);
          parts.spots.setColorAt(nsp, c.set(au.color));
          nsp++;
        }
      }
      const lk = a.look;
      if (lk?.spikes && ns < MAX - 1) {
        c.set(lk.spikes).multiplyScalar(0.6 + 0.4 * Math.abs(Math.sin(t * 6 + a.pos[2])));
        for (const dx of [-0.1, 0.1]) { sp.set([a.pos[0] + dx * s, a.pos[1] + 0.05 * s, a.pos[2]], ns * 3); sc.set([c.r, c.g, c.b], ns * 3); ns++; }
      }
      if (lk?.rosin && ns < MAX) {
        c.set("#f8fafc").multiplyScalar(0.5 + 0.5 * Math.abs(Math.sin(t * 2.3 + a.pos[0])));
        sp.set([a.pos[0], a.pos[1] + 1.0 * s, a.pos[2] + 0.2 * s], ns * 3); sc.set([c.r, c.g, c.b], ns * 3); ns++;
      }
    }
    (parts.big.material as THREE.PointsMaterial).size = bigSize;
    (parts.small.material as THREE.PointsMaterial).size = smallSize;
    parts.big.geometry.setDrawRange(0, nb); parts.small.geometry.setDrawRange(0, ns);
    for (const p of [parts.big, parts.small]) { p.geometry.attributes["position"]!.needsUpdate = true; p.geometry.attributes["color"]!.needsUpdate = true; }
    parts.rings.count = nr; parts.spots.count = nsp;
    parts.rings.instanceMatrix.needsUpdate = true; parts.spots.instanceMatrix.needsUpdate = true;
    if (parts.rings.instanceColor) parts.rings.instanceColor.needsUpdate = true;
    if (parts.spots.instanceColor) parts.spots.instanceColor.needsUpdate = true;
  });
  return <><primitive object={parts.big} /><primitive object={parts.small} /><primitive object={parts.rings} /><primitive object={parts.spots} /></>;
}
