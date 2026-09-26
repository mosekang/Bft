/**
 * Prep-phase 3D board (DESIGN §15.1, §17.2): my twelve players stand on
 * their field spots, the bench sits in the 3B dugout, the cheer squad dances
 * on the stage. Tap-tap, long-press and drag with a spring follow all work;
 * one DOM label layer (buttons with data-slot) doubles as a11y/e2e handle.
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { GameState, Location, PlayerState, Slot } from "@dugout/protocol";
import { SLOTS } from "@dugout/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { haptic, sfx } from "../audio/index.js";
import { t } from "../i18n/index.js";
import { appearanceOf, genericAppearance, replacementAppearance, teamLook } from "../lib/appearance.js";
import { cardOvrWithStar, posLabel } from "../lib/format.js";
import { defOf } from "../lib/pack.js";
import { yawTo, type Actor } from "./actor.js";
import { clipDuration, clipLoops, type AnyClip } from "./clips.js";
import { Figures } from "./Figures.js";
import { Auras } from "./Auras.js";
import { PATCH_COLORS, aurasFor, growthScale, itemLook } from "./synergyFx.js";
import { SYNERGIES, computeEffects } from "@dugout/engine";
import type { SynergyId } from "@dugout/protocol";
import { ctx as packCtx } from "../lib/pack.js";
import { BOARD_SPOTS, CHEER_STAGE, DUGOUT_SPACING, dugoutSeats } from "./park.js";
import { TARGET_FPS, type Quality } from "./quality.js";
import { Stadium } from "./Stadium.js";
import { FpsProbe, Ticker, fitCamera, toScreen } from "./stageKit.js";

const FIG = 5.4;
const BENCH_FIG = 3.9;
const HITTER_SLOTS: readonly Slot[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const isHitterSlot = (s: Slot) => HITTER_SLOTS.includes(s);
const SNAP_RADIUS = 13;

export interface BoardStageProps {
  state: GameState;
  me: PlayerState;
  selected: Location | null;
  onTap: (loc: Location) => void;
  onOpen: (instanceId: string) => void;
  onMove: (from: Location, to: Location) => void;
  interactive: boolean;
  quality: Quality;
  onFps?: (fps: number) => void;
  /** Opponent shown as a hologram over my field for a few seconds (§15.1). */
  hologram?: PlayerState | null;
}

interface LabelPos { slot: Slot; x: number; y: number; visible: boolean }

/** Club colours for the crowd/cheer squad: the most common team on my board. */
function clubColors(state: GameState, me: PlayerState): [string, string] {
  const count = new Map<string, number>();
  for (const id of Object.values(me.board.slots)) { const c = id ? state.cards[id] : undefined; if (c) { const tm = defOf(c.defId).team; count.set(tm, (count.get(tm) ?? 0) + 1); } }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!best) return ["#16a34a", "#f1f5f9"];
  const lk = teamLook(best);
  return [lk.primary, lk.secondary];
}

type Tiers = { tiers: Map<SynergyId, number>; max: Map<SynergyId, number> };
const NO_TIERS: Tiers = { tiers: new Map(), max: new Map() };

function teamTiers(state: GameState, player: PlayerState): Tiers {
  const stage = Number(state.round.split("-")[0]);
  const eff = computeEffects(player, state.cards, packCtx, stage);
  const tiers = new Map<SynergyId, number>(eff.run.synergies.map((x) => [x.id, x.penalised ? 0 : x.tier]));
  const max = new Map<SynergyId, number>((Object.keys(SYNERGIES) as SynergyId[]).map((id) => [id, SYNERGIES[id].thresholds.length]));
  return { tiers, max };
}

function slotActor(state: GameState, player: PlayerState, slot: Slot, now: number, tt: Tiers = NO_TIERS): Actor {
  const id = player.board.slots[slot];
  const card = id ? state.cards[id] : undefined;
  const def = card ? defOf(card.defId) : undefined;
  const pos = BOARD_SPOTS[slot]!;
  const pitcher = slot.startsWith("P");
  const ap = def ? appearanceOf(def) : replacementAppearance(`${player.id}:${slot}`);
  const clip: AnyClip = slot === "C" ? "idle_catcher" : pitcher ? "idle_pitcher" : slot === "DH" ? "idle_batter" : "idle_field";
  const target: [number, number, number] = slot === "C" ? [0, 0, 18] : pitcher && slot !== "P1" ? [pos[0] + 5, 0, pos[2] - 12] : slot === "DH" ? [0, 0, 20] : [0, 0, 0];
  return {
    id: `slot:${slot}`, ap, pos: [...pos] as [number, number, number], yaw: yawTo(pos, target), scale: FIG,
    clip, clipStart: now - (ap.number % 7) * 0.31, mirror: slot === "DH" ? def?.bats === "L" : ap.lefty,
    headgear: slot === "C" ? "mask" : slot === "DH" ? "helmet" : "cap", prop: slot === "DH" ? "bat" : "glove", role: pitcher ? "P" : "H",
    ...(card ? { star: card.star } : {}),
    ...(def && card ? { auras: aurasFor(def, tt.tiers, tt.max), look: itemLook(card.items), scale: FIG * growthScale(def, card) } : {}),
    ...(def && PATCH_COLORS[def.origin] ? { patch: PATCH_COLORS[def.origin]! } : {}),
  };
}

function buildActors(state: GameState, me: PlayerState, now: number, colors: [string, string]): Actor[] {
  const tt = teamTiers(state, me);
  const out: Actor[] = SLOTS.map((s) => slotActor(state, me, s, now, tt));
  const seats = dugoutSeats("home", 6, DUGOUT_SPACING);
  me.bench.forEach((id, i) => {
    const card = id ? state.cards[id] : undefined;
    const seat = seats[i];
    if (!card || !seat) return;
    const def = defOf(card.defId);
    out.push({ id: `bench:${i}`, ap: appearanceOf(def), pos: [...seat.pos] as [number, number, number], yaw: seat.yaw, scale: BENCH_FIG, clip: "sit", clipStart: now - i * 0.5, mirror: false, headgear: "cap", prop: "none", role: "X", star: card.star, look: itemLook(card.items) });
  });
  // Scouting items put an analyst with a tablet in the dugout; FRONT_OFFICE sends two suits (§18.2).
  const looks = out.map((a) => a.look).filter(Boolean);
  const extraSeat = dugoutSeats("home", 8, DUGOUT_SPACING)[6]!;
  if (looks.some((l) => l?.coach)) out.push({ id: "coach", ap: { ...genericAppearance("coach", "#334155", "#e2e8f0"), hairStyle: 2, beard: 1 }, pos: [...extraSeat.pos] as [number, number, number], yaw: extraSeat.yaw, scale: BENCH_FIG, clip: "idle_pitcher", clipStart: now, mirror: false, headgear: "none", prop: "none", role: "X" });
  if (looks.some((l) => l?.suits)) {
    const s2 = dugoutSeats("home", 9, DUGOUT_SPACING)[8]!;
    for (const k of [0, 1]) out.push({ id: `suit${k}`, ap: { ...genericAppearance(`suit${k}`, "#1f2937", "#111827"), uniform: "plain", sleeve: "#1f2937" }, pos: [s2.pos[0] + k * 2.2, s2.pos[1], s2.pos[2] + k * 2.2], yaw: s2.yaw, scale: BENCH_FIG, clip: "idle_pitcher", clipStart: now + k, mirror: false, headgear: "none", prop: "none", role: "X" });
  }
  const st = CHEER_STAGE;
  for (let k = 0; k < 3; k++) {
    const side = (k - 1) * 2.8;
    const ap = { ...genericAppearance(`cheer${k}`, colors[0], colors[1]), hairStyle: 4 as const, beard: 0 as const, build: 0 as const };
    out.push({ id: `cheer:${k}`, ap, pos: [st.pos[0] + Math.cos(st.yaw) * side, st.pos[1], st.pos[2] - Math.sin(st.yaw) * side], yaw: st.yaw, scale: 3, clip: k === 1 ? "cheer_stage" : "dugout_cheer", clipStart: now + k * 0.12, mirror: k === 2, headgear: "none", prop: "none", role: "X" });
  }
  return out;
}

const locOf = (id: string): Location | null => id.startsWith("slot:") ? { kind: "slot", slot: id.slice(5) as Slot } : id.startsWith("bench:") ? { kind: "bench", index: Number(id.slice(6)) } : null;

interface DragState { id: string; from: Location; x0: number; y0: number; started: boolean; downAt: number; longTimer: number | null; home: THREE.Vector3; target: THREE.Vector3; vel: THREE.Vector3; roleHitter: boolean; hasCard: boolean; instanceId?: string }

function Scene(props: BoardStageProps & { onLabels: (l: LabelPos[]) => void; colors: [string, string] }) {
  const { state, me, selected, onTap, onOpen, onMove, interactive, quality, onFps, hologram, onLabels, colors } = props;
  const { camera, size, gl } = useThree();
  const clock = useRef(0);
  const actors = useRef<Actor[]>([]);
  const ghosts = useRef<Actor[]>([]);
  const baseClip = useRef(new Map<string, AnyClip>());
  const prevInstance = useRef(new Map<string, string | undefined>());
  const prevStar = useRef(new Map<string, number>());
  const pillars = useRef<{ x: number; z: number; start: number; gold: boolean }[]>([]);
  const pillarMesh = useMemo(() => {
    const g = new THREE.CylinderGeometry(2.2, 2.2, 40, 20, 1, true);
    g.translate(0, 20, 0);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 6);
    m.frustumCulled = false;
    m.count = 0;
    return m;
  }, []);
  const drag = useRef<DragState | null>(null);
  const yaw = useRef(0);
  const [hot, setHot] = useState<Slot | null>(null);
  const [dragging, setDragging] = useState<{ hitter: boolean } | null>(null);

  // Rebuild actors when the board changes; freshly placed cards play "drop".
  useEffect(() => {
    const now = clock.current;
    const list = buildActors(state, me, now, colors);
    for (const a of list) {
      baseClip.current.set(a.id, a.clip);
      const loc = locOf(a.id);
      const inst = loc?.kind === "slot" ? me.board.slots[loc.slot] : loc?.kind === "bench" ? me.bench[loc.index] ?? undefined : undefined;
      const before = prevInstance.current.get(a.id);
      if (prevInstance.current.size > 0 && inst && inst !== before) { a.clip = "drop"; a.clipStart = now; }
      // Star up (§17.1): light pillar 0.4 s + celebrate.
      const star = a.star ?? 1;
      const was = inst ? prevStar.current.get(inst) : undefined;
      if (inst && was !== undefined && star > was) { pillars.current.push({ x: a.pos[0], z: a.pos[2], start: now, gold: star === 3 }); a.clip = "celebrate"; a.clipStart = now; window.setTimeout(() => { if (a.clip === "celebrate") { a.clip = baseClip.current.get(a.id) ?? "idle_field"; a.clipStart = clock.current; } }, 1200); }
      if (inst) prevStar.current.set(inst, star);
      prevInstance.current.set(a.id, inst);
    }
    actors.current = list;
  }, [state, me, colors]);

  useEffect(() => {
    ghosts.current = hologram ? SLOTS.map((s) => ({ ...slotActor(state, hologram, s, clock.current), id: `ghost:${s}`, pos: [BOARD_SPOTS[s]![0] + 1.2, 0, BOARD_SPOTS[s]![2] + 1.2] as [number, number, number] })) : [];
  }, [hologram, state]);

  // Camera fit (portrait-aware) + parallax.
  const fitPoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (const s of SLOTS) { const p = BOARD_SPOTS[s]!; pts.push(new THREE.Vector3(p[0], 0, p[2] - 6), new THREE.Vector3(p[0], FIG * 2.1, p[2])); }
    for (const seat of dugoutSeats("home", 6, DUGOUT_SPACING)) pts.push(new THREE.Vector3(seat.pos[0], 0, seat.pos[2]));
    return pts;
  }, []);
  const target = useMemo(() => new THREE.Vector3(0, 0, 30), []);
  const refit = () => fitCamera(camera as THREE.PerspectiveCamera, target, fitPoints, yaw.current, 0.95, 0.94);
  useEffect(() => { refit(); }, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Labels follow the camera (projected once per camera change).
  const lastCam = useRef("");
  const anchor = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const key = `${camera.position.x.toFixed(2)},${camera.position.z.toFixed(2)},${size.width},${size.height}`;
    if (key === lastCam.current) return;
    lastCam.current = key;
    onLabels(SLOTS.map((s) => { const p = BOARD_SPOTS[s]!; anchor.set(p[0], p[1] - 0.2, p[2] + 0.4); const sc = toScreen(anchor, camera, size.width, size.height); return { slot: s, ...sc }; }));
  });

  // One-shot clips return to their base idle; drag spring-follow.
  useFrame((_, dtRaw) => {
    const now = clock.current;
    const dt = Math.min(0.05, dtRaw);
    for (const a of actors.current) {
      if (!clipLoops(a.clip) && now - a.clipStart > clipDuration(a.clip)) { a.clip = baseClip.current.get(a.id) ?? "idle_field"; a.clipStart = now; }
    }
    const d = drag.current;
    if (d?.started) {
      const a = actors.current.find((x) => x.id === d.id);
      if (a) {
        const p = new THREE.Vector3(...a.pos);
        const k = 300, c = 25;
        d.vel.addScaledVector(d.target.clone().sub(p), k * dt).addScaledVector(d.vel, -c * dt);
        p.addScaledVector(d.vel, dt);
        a.pos = [p.x, 5, p.z];
      }
    }
  });

  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const groundPoint = (cx: number, cy: number): THREE.Vector3 | null => {
    const r = gl.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, out) ? out : null;
  };
  const nearestSlot = (p: THREE.Vector3, hitter: boolean): Slot | null => {
    let best: Slot | null = null, bd = SNAP_RADIUS;
    for (const s of SLOTS) {
      if (isHitterSlot(s) !== hitter) continue;
      const q = BOARD_SPOTS[s]!;
      const dd = Math.hypot(q[0] - p.x, q[2] - p.z);
      if (dd < bd) { bd = dd; best = s; }
    }
    return best;
  };

  // Window-level pointer tracking while an actor is pressed.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      if (!d.started && interactive && d.hasCard && (dist > 7 || (performance.now() - d.downAt > 60 && dist > 3))) {
        d.started = true;
        if (d.longTimer) { window.clearTimeout(d.longTimer); d.longTimer = null; }
        const a = actors.current.find((x) => x.id === d.id);
        if (a) { a.clip = "pickup"; a.clipStart = clock.current; baseClip.current.set(a.id, a.clip); }
        setDragging({ hitter: d.roleHitter });
        haptic("light");
      }
      if (d.started) {
        const p = groundPoint(e.clientX, e.clientY);
        if (p) { d.target.set(p.x, 0, p.z); const s = nearestSlot(p, d.roleHitter); setHot((h) => (h === s ? h : s)); }
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (d.longTimer) window.clearTimeout(d.longTimer);
      setDragging(null);
      setHot(null);
      if (!d.started) { onTap(d.from); return; }
      const a = actors.current.find((x) => x.id === d.id);
      const p = groundPoint(e.clientX, e.clientY);
      const slot = p ? nearestSlot(p, d.roleHitter) : null;
      const benchEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-bench-index]");
      if (slot && !(d.from.kind === "slot" && d.from.slot === slot)) {
        if (a) { const q = BOARD_SPOTS[slot]!; a.pos = [q[0], q[1], q[2]]; a.clip = "drop"; a.clipStart = clock.current; }
        haptic("light");
        sfx("card_drop");
        onMove(d.from, { kind: "slot", slot });
      } else if (benchEl && d.from.kind === "slot") {
        haptic("light");
        sfx("card_drop");
        onMove(d.from, { kind: "bench", index: Number(benchEl.dataset.benchIndex) });
      } else {
        if (a) { a.pos = [d.home.x, d.home.y, d.home.z]; a.clip = "drop"; a.clipStart = clock.current; }
        if (slot === null) { haptic("error"); sfx("error"); }
      }
      if (a) baseClip.current.set(a.id, slotBase(a.id));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [interactive, onMove, onTap]); // eslint-disable-line react-hooks/exhaustive-deps

  const slotBase = (id: string): AnyClip => id === "slot:C" ? "idle_catcher" : id.startsWith("slot:P") ? "idle_pitcher" : id === "slot:DH" ? "idle_batter" : id.startsWith("bench:") ? "sit" : "idle_field";

  const onActorDown = (id: string, e: ThreeEvent<PointerEvent>) => {
    const from = locOf(id);
    if (!from) return;
    e.stopPropagation();
    const inst = from.kind === "slot" ? me.board.slots[from.slot] : me.bench[from.index] ?? undefined;
    const card = inst ? state.cards[inst] : undefined;
    const def = card ? defOf(card.defId) : undefined;
    const a = actors.current.find((x) => x.id === id)!;
    const d: DragState = {
      id, from, x0: e.nativeEvent.clientX, y0: e.nativeEvent.clientY, started: false, downAt: performance.now(), longTimer: null,
      home: new THREE.Vector3(...a.pos), target: new THREE.Vector3(a.pos[0], 0, a.pos[2]), vel: new THREE.Vector3(), roleHitter: def ? def.role === "H" : from.kind === "slot" && isHitterSlot(from.slot), hasCard: !!card,
      ...(inst ? { instanceId: inst } : {}),
    };
    if (inst) d.longTimer = window.setTimeout(() => { if (drag.current === d && !d.started) { drag.current = null; haptic("medium"); onOpen(inst); } }, 400);
    drag.current = d;
  };

  // Parallax (±12°) by dragging empty field.
  const par = useRef<{ x0: number; yaw0: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => { const p = par.current; if (!p) return; yaw.current = Math.max(-0.21, Math.min(0.21, p.yaw0 + ((e.clientX - p.x0) / Math.max(1, size.width)) * 0.42)); refit(); };
    const up = () => { par.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [size.width]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pads: slot rings coloured by state.
  const pads = useMemo(() => {
    const g = new THREE.RingGeometry(2.8, 3.6, 32);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false }), SLOTS.length);
    const stars = new THREE.InstancedMesh(new THREE.TorusGeometry(2.3, 0.2, 6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }), SLOTS.length + 6);
    m.frustumCulled = false; stars.frustumCulled = false;
    return { m, stars };
  }, []);
  useFrame(() => {
    const mat = new THREE.Matrix4(), c = new THREE.Color();
    SLOTS.forEach((s, i) => {
      const p = BOARD_SPOTS[s]!;
      const isSel = selected?.kind === "slot" && selected.slot === s;
      const valid = dragging ? isHitterSlot(s) === dragging.hitter : false;
      const scale = hot === s ? 1.35 : 1;
      mat.makeScale(scale, 1, scale).setPosition(p[0], p[1] + 0.06, p[2]);
      pads.m.setMatrixAt(i, mat);
      c.set(hot === s ? "#4ade80" : dragging ? (valid ? "#22c55e" : "#4b5563") : isSel ? "#facc15" : selected?.kind === "bench" ? "#86efac" : "#e2e8f0");
      pads.m.setColorAt(i, c);
    });
    pads.m.instanceMatrix.needsUpdate = true;
    if (pads.m.instanceColor) pads.m.instanceColor.needsUpdate = true;
    let n = 0;
    for (const a of actors.current) {
      if (!a.star || a.star < 2) continue;
      mat.makeScale(a.scale / FIG, 1, a.scale / FIG).setPosition(a.pos[0], (a.pos[1] > 1 ? a.pos[1] : Math.max(0, a.pos[1])) + 0.1, a.pos[2]);
      pads.stars.setMatrixAt(n, mat);
      pads.stars.setColorAt(n, c.set(a.star === 3 ? "#fbbf24" : "#e5e7eb"));
      n++;
    }
    pads.stars.count = n;
    const now2 = clock.current;
    pillars.current = pillars.current.filter((p) => now2 - p.start < 0.6);
    pillars.current.forEach((p, i) => {
      const u = (now2 - p.start) / 0.6;
      mat.makeScale(1 + u * 0.6, 1 - u * 0.3, 1 + u * 0.6).setPosition(p.x, 0, p.z);
      pillarMesh.setMatrixAt(i, mat);
      pillarMesh.setColorAt(i, c.set(p.gold ? "#fbbf24" : "#e0f2fe").multiplyScalar(1 - u));
    });
    pillarMesh.count = pillars.current.length;
    pillarMesh.instanceMatrix.needsUpdate = true;
    if (pillarMesh.instanceColor) pillarMesh.instanceColor.needsUpdate = true;
    pads.stars.instanceMatrix.needsUpdate = true;
    if (pads.stars.instanceColor) pads.stars.instanceColor.needsUpdate = true;
  });

  const banners = useMemo(() => {
    const st = computeEffects(me, state.cards, packCtx, Number(state.round.split("-")[0])).run.synergies.find((x) => x.id === "FOREIGN");
    return { flags: st && st.tier > 0 ? 2 : 0, warning: !!st?.penalised };
  }, [me, state.cards, state.round]);
  const board = useMemo(() => ({
    header: `ROUND ${state.round}`, inning: 1, half: "T" as const, message: me.nickname,
    away: { short: "AWY", color: "#475569", line: [], r: 0, h: 0, e: 0 }, home: { short: "HOM", color: colors[0], line: [], r: 0, h: 0, e: 0 },
  }), [state.round, me.nickname, colors]);

  return (
    <>
      <Ticker fps={TARGET_FPS[quality]} clock={clock} />
      {onFps && <FpsProbe onResult={onFps} />}
      <hemisphereLight args={["#c7d7ff", "#10301c", 1.05]} />
      <directionalLight position={[-30, 80, -40]} intensity={1.6} castShadow={quality === "high"} shadow-mapSize={[1024, 1024]} />
      <fog attach="fog" args={["#0b1224", 220, 640]} />
      <Stadium stadium={me.stadium} quality={quality} crowd={me.hp / 100} homeColors={colors} board={board} propScale={3} banners={banners} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 40]} onPointerDown={(e) => { par.current = { x0: e.nativeEvent.clientX, yaw0: yaw.current }; }} visible={false}>
        <planeGeometry args={[240, 220]} />
        <meshBasicMaterial />
      </mesh>
      <primitive object={pads.m} />
      <primitive object={pads.stars} />
      <primitive object={pillarMesh} />
      <Figures actors={actors} clock={clock} shadows={quality === "high"} onActorDown={onActorDown} />
      <Auras actors={actors} clock={clock} />
      {hologram && <Figures actors={ghosts} clock={clock} ghost />}
    </>
  );
}

export default function BoardStage(props: BoardStageProps) {
  const { state, me, selected, onTap, onOpen, interactive, quality } = props;
  const [labels, setLabels] = useState<LabelPos[]>([]);
  const colors = useMemo(() => clubColors(state, me), [state, me]);
  return (
    <div className="relative h-full overflow-hidden rounded-2xl ring-1 ring-white/10" style={{ touchAction: "none", background: "#070b16" }} aria-label={t("run.board")}>
      <Canvas frameloop="demand" dpr={quality === "high" ? [1, 2] : [1, 1.5]} shadows={quality === "high"} camera={{ fov: 45, near: 1, far: 1600, position: [0, 60, -40] }} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <Scene {...props} onLabels={setLabels} colors={colors} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0">
        {labels.map(({ slot, x, y, visible }) => {
          const id = me.board.slots[slot];
          const card = id ? state.cards[id] : undefined;
          const def = card ? defOf(card.defId) : undefined;
          const order = slot.startsWith("P") ? null : me.board.order.indexOf(slot as never) + 1;
          const isSel = selected?.kind === "slot" && selected.slot === slot;
          return (
            <button
              key={slot}
              type="button"
              data-slot={slot}
              aria-label={`${posLabel(slot)} ${def ? def.name : t("run.replacement")}`}
              onClick={() => onTap({ kind: "slot", slot })}
              onContextMenu={(e) => { e.preventDefault(); if (card) onOpen(card.instanceId); }}
              disabled={!interactive && !card}
              className={`pointer-events-auto absolute flex -translate-x-1/2 flex-col items-center leading-none transition-transform duration-150 ${isSel ? "scale-110" : ""} ${visible ? "" : "hidden"}`}
              style={{ left: x, top: y, touchAction: "manipulation" }}
            >
              <span className={`whitespace-nowrap rounded-md px-1.5 py-[3px] text-[11px] font-bold text-white ring-1 ${isSel ? "bg-emerald-700/90 ring-emerald-300" : card ? "bg-black/70 ring-white/15" : "bg-black/45 ring-white/10"}`}>
                <span className="num mr-1 text-[var(--led)]">{order ?? slot}</span>
                {def ? def.name : slot.startsWith("P") ? (slot === "P1" ? "선발" : "불펜") : posLabel(slot)}
                {card && card.star > 1 ? <span className="ml-0.5 text-[var(--gold)]">{"★".repeat(card.star)}</span> : null}
              </span>
              {def && card ? (
                <span className="mt-0.5 flex gap-1 rounded bg-black/40 px-1 text-[9px] text-white/85">
                  <span>{def.role === "H" ? def.pos : def.role}</span>
                  <span className="num text-[var(--gold)]">{cardOvrWithStar(def, card)}</span>
                  {card.fatigue > 0 && <span className="text-[var(--bad)]">{t("run.tired")}{card.fatigue}</span>}
                  {card.injuredRounds > 0 && <span className="text-[var(--bad)]">{t("run.injured")}</span>}
                </span>
              ) : (
                <span className="mt-0.5 text-[9px] text-white/60">{t("run.replacement")}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
