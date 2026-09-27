/**
 * Plain three.js renderer for a set of actors (no React): poses skeletons
 * from the clip library and writes one InstancedMesh per body part, plus
 * inverted-hull outlines and blob shadows. Used by the R3F <Figures> wrapper
 * and by the off-screen card-portrait renderer.
 */
import * as THREE from "three";
import type { Actor } from "./actor.js";
import { JOINTS, blendPose, mirrorPose, samplePose, type AnyClip, type Joint, type Pose } from "./clips.js";
import { BONES, BUILD_SCALE, MAX_ACTORS, PARTS, decalMaterial, jerseyMaterial, outlineMaterial, toonMaterial, type PartDef } from "./figureParts.js";

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

interface PartMesh {
  def: PartDef;
  mesh: THREE.InstancedMesh;
  outline?: THREE.InstancedMesh;
  owners: string[];
  local: THREE.Matrix4[];
  accent?: THREE.InstancedBufferAttribute;
  pattern?: THREE.InstancedBufferAttribute;
  cell?: THREE.InstancedBufferAttribute;
  count: number;
}

const colorCache = new Map<string, THREE.Color>();
const col = (hex: string) => { let c = colorCache.get(hex); if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); } return c; };
const PATTERN: Record<string, number> = { plain: 0, pinstripe: 1, sash: 2, sleeve: 3 };

let blobTex: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture | null {
  if (blobTex) return blobTex;
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.55)"); grd.addColorStop(0.6, "rgba(0,0,0,0.3)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(cv);
  return blobTex;
}

export interface FigureBatchOptions { ghost?: boolean; shadows?: boolean; outlines?: boolean; blobs?: boolean; capacity?: number }

export class FigureBatch {
  readonly group = new THREE.Group();
  private readonly parts: PartMesh[];
  private readonly skeletons = new Map<string, Skeleton>();
  private readonly blobs: THREE.InstancedMesh | null;
  private readonly tmp = new THREE.Matrix4();
  private readonly eul = new THREE.Euler();
  private readonly cap: number;

  constructor(opts: FigureBatchOptions = {}) {
    const ghost = !!opts.ghost;
    this.cap = opts.capacity ?? MAX_ACTORS;
    const mats = {
      toon: toonMaterial({ ghost }), gloss: toonMaterial({ ghost, gloss: true }), jersey: jerseyMaterial({ ghost }),
      numbers: decalMaterial("numbers", { ghost }), wordmarks: decalMaterial("wordmarks", { ghost }), faces: decalMaterial("faces", { ghost }),
    };
    const outlineMat = opts.outlines === false ? null : outlineMaterial(0.018, ghost);
    this.parts = PARTS.map((def) => {
      const geo = def.geometry();
      const pm: PartMesh = { def, mesh: null as unknown as THREE.InstancedMesh, owners: [], local: [], count: 0 };
      if (def.material === "jersey") {
        pm.accent = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
        pm.pattern = new THREE.InstancedBufferAttribute(new Float32Array(this.cap), 1);
        geo.setAttribute("aAccent", pm.accent);
        geo.setAttribute("aPattern", pm.pattern);
      }
      if (def.cell) {
        pm.cell = new THREE.InstancedBufferAttribute(new Float32Array(this.cap), 1);
        geo.setAttribute("aCell", pm.cell);
      }
      const mesh = new THREE.InstancedMesh(geo, mats[def.material], this.cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.castShadow = !!opts.shadows && !!def.castShadow;
      mesh.name = def.key;
      mesh.setColorAt(0, col("#ffffff"));
      pm.mesh = mesh;
      this.group.add(mesh);
      if (def.outline && outlineMat) {
        const o = new THREE.InstancedMesh(geo, outlineMat, this.cap);
        o.instanceMatrix = mesh.instanceMatrix; // share the same matrices
        o.frustumCulled = false;
        o.count = 0;
        o.name = `${def.key}:outline`;
        o.raycast = () => undefined;
        pm.outline = o;
        this.group.add(o);
      }
      const head = def.joint === "head";
      pm.local = BUILD_SCALE.map((s) => new THREE.Matrix4().makeScale(head ? 1 : s, 1, head ? 1 : s * (def.key === "torso" && s > 1.05 ? 1.1 : 1)));
      return pm;
    });
    const tex = opts.blobs === false || ghost ? null : blobTexture();
    if (tex) {
      const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      this.blobs = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), this.cap);
      this.blobs.frustumCulled = false;
      this.blobs.count = 0;
      this.blobs.raycast = () => undefined;
      this.blobs.renderOrder = -1;
      this.group.add(this.blobs);
    } else this.blobs = null;
  }

  /** Pose every actor for scene time `now` and upload instance data. */
  update(actors: readonly Actor[], now: number): void {
    for (const p of this.parts) p.count = 0;
    let nb = 0;
    for (const a of actors) {
      if (a.hidden) continue;
      let sk = this.skeletons.get(a.id);
      if (!sk || sk.build !== a.ap.build) { sk = makeSkeleton(a.ap.build); this.skeletons.set(a.id, sk); }
      if (sk.clip !== a.clip || sk.clipStart !== a.clipStart) { sk.fromPose = sk.lastPose; sk.fadeStart = now; sk.clip = a.clip; sk.clipStart = a.clipStart; }
      let pose = samplePose(a.clip, now - a.clipStart);
      if (a.mirror) pose = mirrorPose(pose);
      if (sk.fromPose && now - sk.fadeStart < FADE) pose = blendPose(sk.fromPose, pose, (now - sk.fadeStart) / FADE);
      sk.lastPose = pose;
      for (const j of JOINTS) { const r = pose.rot[j]; sk.nodes[j].rotation.set(r[0], r[1], r[2]); }
      sk.hips.position.set(0, BONES.hipsY + pose.lift, pose.push);
      sk.root.position.set(a.pos[0], a.pos[1], a.pos[2]);
      this.eul.set(0, a.yaw, 0);
      sk.root.rotation.copy(this.eul);
      sk.root.scale.setScalar(a.scale);
      sk.root.updateMatrixWorld(true);
      for (const p of this.parts) {
        if (!p.def.applies(a) || p.count >= this.cap) continue;
        const i = p.count++;
        let joint: Joint | "root" = p.def.joint;
        if (p.def.side === "glove" && a.ap.lefty) joint = "elR";
        this.tmp.multiplyMatrices(sk.nodes[joint].matrixWorld, p.local[a.ap.build]!);
        p.mesh.setMatrixAt(i, this.tmp);
        p.mesh.setColorAt(i, col(p.def.color(a)));
        p.owners[i] = a.id;
        if (p.accent && p.pattern) {
          const acc = col(a.ap.replacement ? "#8b9096" : a.ap.uniform === "plain" ? a.ap.secondary : a.ap.primary);
          p.accent.setXYZ(i, acc.r, acc.g, acc.b);
          p.pattern.setX(i, a.ap.replacement ? 0 : PATTERN[a.ap.uniform] ?? 0);
        }
        if (p.cell && p.def.cell) p.cell.setX(i, p.def.cell(a));
      }
      if (this.blobs && nb < this.cap) {
        const groundY = a.pos[1] > 1 ? 0 : a.pos[1];
        const s = 0.95 * a.scale;
        this.tmp.makeScale(s, 1, s).setPosition(a.pos[0], groundY + 0.03, a.pos[2]);
        this.blobs.setMatrixAt(nb++, this.tmp);
      }
    }
    for (const p of this.parts) {
      p.mesh.count = p.count;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      if (p.accent) p.accent.needsUpdate = true;
      if (p.pattern) p.pattern.needsUpdate = true;
      if (p.cell) p.cell.needsUpdate = true;
      p.mesh.boundingSphere = null;
      if (p.outline) p.outline.count = p.count;
    }
    if (this.blobs) { this.blobs.count = nb; this.blobs.instanceMatrix.needsUpdate = true; }
    if (this.skeletons.size > actors.length + 8) {
      const live = new Set(actors.map((a) => a.id));
      for (const id of this.skeletons.keys()) if (!live.has(id)) this.skeletons.delete(id);
    }
  }

  /** Actor id for a raycast hit on a pickable part. */
  owner(object: THREE.Object3D, instanceId: number | undefined): string | undefined {
    const p = this.parts.find((x) => x.mesh === object);
    if (!p || instanceId === undefined || !p.def.pickable) return undefined;
    return p.owners[instanceId];
  }

  dispose(): void {
    const seen = new Set<unknown>();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
      const mat = m.material as THREE.Material | undefined;
      if (mat && !seen.has(mat)) { seen.add(mat); mat.dispose(); }
    });
  }
}
