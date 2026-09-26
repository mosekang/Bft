/**
 * Renders a list of actors with one InstancedMesh per body part
 * (DESIGN §15.3: ≤ 60 draw calls for 30 figures). Skeletons are plain
 * Object3D chains posed from the procedural clip library each frame.
 */
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Actor } from "./actor.js";
import { JOINTS, blendPose, mirrorPose, samplePose, type Joint, type Pose, type AnyClip } from "./clips.js";
import { BONES, BUILD_SCALE, MAX_ACTORS, PARTS, decalMaterial, jerseyMaterial, toonMaterial, type PartDef } from "./figureParts.js";

const FADE = 0.15;

interface Skeleton {
  root: THREE.Object3D;
  hips: THREE.Object3D;
  nodes: Record<Joint | "root", THREE.Object3D>;
  build: number;
  clip: AnyClip | null;
  clipStart: number;
  fromPose: Pose | null;
  fadeStart: number;
  lastPose: Pose | null;
}

function makeSkeleton(build: number): Skeleton {
  const s = BUILD_SCALE[build] ?? 1;
  const n = (parent: THREE.Object3D, x: number, y: number, z = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Object3D();
  const hips = n(root, 0, BONES.hipsY);
  const spine = n(hips, 0, BONES.spineY);
  const head = n(spine, 0, BONES.headY);
  const shL = n(spine, BONES.shoulderX * s, BONES.shoulderY);
  const elL = n(shL, 0, -BONES.upperArm);
  const shR = n(spine, -BONES.shoulderX * s, BONES.shoulderY);
  const elR = n(shR, 0, -BONES.upperArm);
  const hipL = n(hips, BONES.hipX * s, BONES.hipY);
  const knL = n(hipL, 0, -BONES.thigh);
  const hipR = n(hips, -BONES.hipX * s, BONES.hipY);
  const knR = n(hipR, 0, -BONES.thigh);
  const bat = n(spine, BONES.batPivot[0], BONES.batPivot[1], BONES.batPivot[2]);
  return { root, hips, nodes: { root, hips, spine, head, shL, elL, shR, elR, hipL, knL, hipR, knR, bat }, build, clip: null, clipStart: 0, fromPose: null, fadeStart: 0, lastPose: null };
}

interface PartMesh { def: PartDef; mesh: THREE.InstancedMesh; owners: string[]; local: THREE.Matrix4[]; localMirror: THREE.Matrix4[]; accent?: THREE.InstancedBufferAttribute; pattern?: THREE.InstancedBufferAttribute; cell?: THREE.InstancedBufferAttribute }

const colorCache = new Map<string, THREE.Color>();
const col = (hex: string) => { let c = colorCache.get(hex); if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); } return c; };

function buildParts(ghost: boolean, shadows: boolean): PartMesh[] {
  const mats = { toon: toonMaterial({ ghost }), jersey: jerseyMaterial({ ghost }), decal: decalMaterial({ ghost }) };
  return PARTS.map((def) => {
    const geo = def.geometry();
    let accent: THREE.InstancedBufferAttribute | undefined, pattern: THREE.InstancedBufferAttribute | undefined, cell: THREE.InstancedBufferAttribute | undefined;
    if (def.material === "jersey") {
      accent = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ACTORS * 3), 3);
      pattern = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ACTORS), 1);
      geo.setAttribute("aAccent", accent);
      geo.setAttribute("aPattern", pattern);
    }
    if (def.material === "decal") {
      cell = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ACTORS), 1);
      geo.setAttribute("aCell", cell);
    }
    const mesh = new THREE.InstancedMesh(geo, mats[def.material], MAX_ACTORS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = shadows && !!def.castShadow;
    mesh.name = def.key;
    mesh.setColorAt(0, col("#ffffff"));
    // Per-build local transforms: widths scale with the build (§15.3 bone scale).
    const local = BUILD_SCALE.map((s) => new THREE.Matrix4().makeScale(def.joint === "head" ? 1 : s, 1, def.joint === "head" ? 1 : s * (def.key === "torso" && s > 1.05 ? 1.1 : 1)));
    const flip = new THREE.Matrix4().makeScale(-1, 1, 1);
    const localMirror = local.map((m) => flip.clone().multiply(m));
    const pm: PartMesh = { def, mesh, owners: [], local, localMirror };
    if (accent) pm.accent = accent;
    if (pattern) pm.pattern = pattern;
    if (cell) pm.cell = cell;
    return pm;
  });
}

const PATTERN: Record<string, number> = { plain: 0, pinstripe: 1, sash: 2, sleeve: 3 };
const tmp = new THREE.Matrix4();
const eul = new THREE.Euler();

export interface FiguresProps {
  actors: React.MutableRefObject<Actor[]>;
  /** Scene clock in seconds (frozen during hit-stop). */
  clock: React.MutableRefObject<number>;
  ghost?: boolean;
  shadows?: boolean;
  onActorDown?: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onActorClick?: (id: string, e: ThreeEvent<MouseEvent>) => void;
}

export function Figures({ actors, clock, ghost = false, shadows = false, onActorDown, onActorClick }: FiguresProps) {
  const parts = useMemo(() => buildParts(ghost, shadows), [ghost, shadows]);
  const skeletons = useRef(new Map<string, Skeleton>());
  const group = useMemo(() => { const g = new THREE.Group(); for (const p of parts) g.add(p.mesh); return g; }, [parts]);
  useEffect(() => () => { for (const p of parts) { p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); p.mesh.dispose(); } }, [parts]);

  useFrame(() => {
    const now = clock.current;
    const cursor = new Map<PartMesh, number>();
    for (const p of parts) cursor.set(p, 0);
    for (const a of actors.current) {
      if (a.hidden) continue;
      let sk = skeletons.current.get(a.id);
      if (!sk || sk.build !== a.ap.build) { sk = makeSkeleton(a.ap.build); skeletons.current.set(a.id, sk); }
      if (sk.clip !== a.clip || sk.clipStart !== a.clipStart) {
        sk.fromPose = sk.lastPose; sk.fadeStart = now; sk.clip = a.clip; sk.clipStart = a.clipStart;
      }
      let pose = samplePose(a.clip, now - a.clipStart);
      if (a.mirror) pose = mirrorPose(pose);
      if (sk.fromPose && now - sk.fadeStart < FADE) pose = blendPose(sk.fromPose, pose, (now - sk.fadeStart) / FADE);
      sk.lastPose = pose;
      for (const j of JOINTS) {
        const r = pose.rot[j];
        sk.nodes[j].rotation.set(r[0], r[1], r[2]);
      }
      sk.hips.position.set(0, BONES.hipsY + pose.lift, pose.push);
      sk.root.position.set(a.pos[0], a.pos[1], a.pos[2]);
      eul.set(0, a.yaw, 0);
      sk.root.rotation.copy(eul);
      sk.root.scale.setScalar(a.scale);
      sk.root.updateMatrixWorld(true);
      for (const p of parts) {
        if (!p.def.applies(a)) continue;
        const i = cursor.get(p)!;
        if (i >= MAX_ACTORS) continue;
        cursor.set(p, i + 1);
        let joint: Joint | "root" = p.def.joint;
        let mirrored = false;
        if (p.def.side === "glove" && a.ap.lefty) { joint = "elR"; mirrored = true; }
        if (p.def.side === "flapL" && a.mirror) mirrored = true;
        tmp.multiplyMatrices(sk.nodes[joint].matrixWorld, (mirrored ? p.localMirror : p.local)[a.ap.build]!);
        p.mesh.setMatrixAt(i, tmp);
        p.mesh.setColorAt(i, col(p.def.color(a)));
        p.owners[i] = a.id;
        if (p.accent && p.pattern) {
          const acc = col(a.ap.replacement ? "#8b9096" : a.ap.uniform === "sash" ? a.ap.primary : a.ap.uniform === "pinstripe" ? a.ap.primary : a.ap.secondary);
          p.accent.setXYZ(i, acc.r, acc.g, acc.b);
          p.pattern.setX(i, a.ap.replacement ? 0 : PATTERN[a.ap.uniform] ?? 0);
        }
        if (p.cell) p.cell.setX(i, a.ap.number % 100);
      }
    }
    for (const p of parts) {
      const n = cursor.get(p)!;
      p.mesh.count = n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      if (p.accent) p.accent.needsUpdate = true;
      if (p.pattern) p.pattern.needsUpdate = true;
      if (p.cell) p.cell.needsUpdate = true;
      p.mesh.boundingSphere = null;
    }
    // Forget skeletons of actors that left.
    if (skeletons.current.size > actors.current.length + 8) {
      const live = new Set(actors.current.map((a) => a.id));
      for (const id of skeletons.current.keys()) if (!live.has(id)) skeletons.current.delete(id);
    }
  });

  const owner = (e: { object: THREE.Object3D; instanceId?: number }) => {
    const p = parts.find((x) => x.mesh === e.object);
    return p && e.instanceId !== undefined ? p.owners[e.instanceId] : undefined;
  };
  return (
    <primitive
      object={group}
      onPointerDown={onActorDown ? (e: ThreeEvent<PointerEvent>) => { const id = owner(e); if (id && PARTS.find((d) => d.key === e.object.name)?.pickable) onActorDown(id, e); } : undefined}
      onClick={onActorClick ? (e: ThreeEvent<MouseEvent>) => { const id = owner(e); if (id) onActorClick(id, e); } : undefined}
    />
  );
}
