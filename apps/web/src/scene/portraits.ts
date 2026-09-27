/**
 * Card illustrations rendered from the 3D characters (DESIGN §15.3): one
 * off-screen WebGL renderer draws each player's bust once, caches a data
 * URL, and card components show it (SVG portrait until it is ready or when
 * WebGL is unavailable). Rendering is queued one per frame to avoid jank.
 */
import * as THREE from "three";
import type { CardDef } from "@dugout/protocol";
import { appearanceOf } from "../lib/appearance.js";
import type { Actor } from "./actor.js";
import { FigureBatch } from "./figureBatch.js";
import { webgl2Available } from "./quality.js";

const SIZE = 256;
const cache = new Map<string, string>();
const listeners = new Map<string, Set<(url: string) => void>>();
const queue: CardDef[] = [];
let failed = false;
let busy = false;

interface Rig { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; batch: FigureBatch }
let rig: Rig | null = null;

function makeRig(): Rig | null {
  if (failed || typeof document === "undefined" || !webgl2Available()) { failed = true; return null; }
  try {
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#dfe8ff", "#2a3a2e", 1.25));
    const key = new THREE.DirectionalLight("#fff4e0", 1.8); key.position.set(1.5, 3, 3); scene.add(key);
    const back = new THREE.DirectionalLight("#8fb4ff", 1.4); back.position.set(-2, 2, -3); scene.add(back);
    // Head-and-shoulders framing: the SD head (r ≈ 0.3 at y ≈ 1.58) fills the upper two thirds.
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    camera.position.set(0.35, 1.62, 1.95);
    camera.lookAt(0, 1.42, 0);
    const batch = new FigureBatch({ capacity: 2, blobs: false });
    scene.add(batch.group);
    return { renderer, scene, camera, batch };
  } catch {
    failed = true;
    return null;
  }
}

function render(def: CardDef): string | null {
  rig ??= makeRig();
  if (!rig) return null;
  const pitcher = def.role !== "H";
  const actor: Actor = {
    id: `card:${def.id}`, ap: appearanceOf(def), pos: [0, 0, 0], yaw: pitcher ? -0.35 : 0.3, scale: 1,
    clip: pitcher ? "idle_pitcher" : "idle_batter", clipStart: 0, mirror: !pitcher && def.bats === "L",
    headgear: pitcher ? "cap" : def.pos === "C" ? "helmet" : "helmet", prop: pitcher ? "glove" : "bat", role: pitcher ? "P" : "H",
  };
  // Batting stance faces the plate; turn the body toward the camera for the card.
  if (!pitcher) actor.yaw = def.bats === "L" ? 1.1 : -1.1;
  rig.batch.update([actor], 0.5);
  rig.renderer.render(rig.scene, rig.camera);
  const url = rig.renderer.domElement.toDataURL("image/webp", 0.92);
  return url.startsWith("data:image") ? url : null;
}

function pump(): void {
  if (busy) return;
  busy = true;
  const step = () => {
    const def = queue.shift();
    if (!def) { busy = false; return; }
    if (!cache.has(def.id)) {
      const url = render(def);
      if (url) {
        cache.set(def.id, url);
        for (const fn of listeners.get(def.id) ?? []) fn(url);
      } else { queue.length = 0; busy = false; return; }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Cached illustration for a card, or null (and a render is queued). */
export function cardArt(def: CardDef): string | null {
  const hit = cache.get(def.id);
  if (hit) return hit;
  if (!failed && !queue.some((d) => d.id === def.id)) { queue.push(def); pump(); }
  return null;
}

export function onCardArt(defId: string, fn: (url: string) => void): () => void {
  let set = listeners.get(defId);
  if (!set) { set = new Set(); listeners.set(defId, set); }
  set.add(fn);
  return () => set!.delete(fn);
}

/** Render a whole pack ahead of time (after the lobby loads). */
export function prewarmCardArt(defs: readonly CardDef[]): void {
  for (const d of defs) if (!cache.has(d.id) && !queue.some((q) => q.id === d.id)) queue.push(d);
  pump();
}

export const cardArtAvailable = (): boolean => !failed;
