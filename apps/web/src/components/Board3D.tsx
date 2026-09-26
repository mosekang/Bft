import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { GameState, Location, PlayerState, Pos, Slot } from "@dugout/protocol";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { defOf } from "../lib/pack.js";
import { avatarTraits } from "../lib/avatar.js";
import { t } from "../i18n/index.js";
import { posLabel } from "../lib/format.js";
import { cardOvrWithStar } from "../lib/format.js";

/** Slot positions on the diamond (x right, z toward the camera). Home plate at (0, 3.2). */
const SLOT_POS: Record<Slot, [number, number]> = {
  C: [0, 4.1], "1B": [2.6, 1.0], "2B": [1.3, -1.6], SS: [-1.3, -1.6], "3B": [-2.6, 1.0],
  LF: [-3.6, -3.6], CF: [0, -4.8], RF: [3.6, -3.6], DH: [3.9, 3.9],
  P1: [0, 0.4], P2: [-4.4, 2.2], P3: [-4.4, 3.6],
};
const HITTER_SLOTS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"] as const;

interface Props {
  state: GameState;
  me: PlayerState;
  selected: Location | null;
  onTap: (loc: Location) => void;
  onOpen: (instanceId: string) => void;
  onMove: (from: Location, to: Location) => void;
  interactive: boolean;
}

/** Procedural grass/dirt/chalk texture drawn once. */
function useFieldTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 1024;
    const g = c.getContext("2d")!;
    const toPx = (x: number, z: number) => [512 + x * 80, 512 + z * 80] as const;
    // grass stripes
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#14532d" : "#166534"; g.fillRect(0, i * 64, 1024, 64); }
    // outfield arc dirt (warning track)
    g.strokeStyle = "#7c4a12"; g.lineWidth = 26; g.beginPath(); g.arc(512, 780, 640, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    // infield dirt
    g.fillStyle = "#a16207";
    g.beginPath(); const [hx, hz] = toPx(0, 3.2); g.moveTo(hx, hz + 40);
    const [ax, az] = toPx(3.2, 0); const [bx, bz] = toPx(0, -3.4); const [cx, cz] = toPx(-3.2, 0);
    g.quadraticCurveTo(ax + 60, az + 60, ax, az - 20); g.quadraticCurveTo(bx + 120, bz - 90, bx, bz); g.quadraticCurveTo(cx - 120, bz - 90, cx, az - 20); g.quadraticCurveTo(cx - 60, cz + 60, hx, hz + 40); g.fill();
    // grass diamond inside
    g.fillStyle = "#15803d"; g.beginPath(); g.moveTo(...toPx(0, 2.3)); g.lineTo(...toPx(2.3, 0)); g.lineTo(...toPx(0, -2.3)); g.lineTo(...toPx(-2.3, 0)); g.closePath(); g.fill();
    // mound
    g.fillStyle = "#b45309"; g.beginPath(); g.ellipse(...toPx(0, 0.4), 34, 26, 0, 0, Math.PI * 2); g.fill();
    // chalk lines
    g.strokeStyle = "rgba(248,250,252,0.9)"; g.lineWidth = 5; g.beginPath(); g.moveTo(...toPx(0, 3.2)); g.lineTo(...toPx(-6.5, -3.3)); g.moveTo(...toPx(0, 3.2)); g.lineTo(...toPx(6.5, -3.3)); g.stroke();
    // bases
    g.fillStyle = "#f8fafc";
    for (const [x, z] of [[2.9, 0.3], [0, -2.9], [-2.9, 0.3]] as const) { const [px, pz] = toPx(x, z); g.save(); g.translate(px, pz); g.rotate(Math.PI / 4); g.fillRect(-10, -10, 20, 20); g.restore(); }
    const [px, pz] = toPx(0, 3.2); g.beginPath(); g.moveTo(px - 12, pz - 8); g.lineTo(px + 12, pz - 8); g.lineTo(px + 12, pz + 2); g.lineTo(px, pz + 12); g.lineTo(px - 12, pz + 2); g.closePath(); g.fill();
    // on-deck circle & bullpen mounds
    g.strokeStyle = "rgba(248,250,252,0.5)"; g.lineWidth = 4; g.beginPath(); g.ellipse(...toPx(3.9, 3.9), 40, 30, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#92400e"; for (const z of [2.2, 3.6]) { g.beginPath(); g.ellipse(...toPx(-4.4, z), 30, 22, 0, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);
}

function Field() {
  const tex = useFieldTexture();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[12.8, 12.8]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

/** Low-poly ballplayer built from primitives, coloured from the card's traits. */
function Figure({ def, star, selected, dragging, replacement, position, onPointerDown, onClick, onContextMenu }: {
  def: ReturnType<typeof defOf> | null; star: number; selected: boolean; dragging: boolean; replacement: boolean; position: [number, number, number];
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void; onClick?: (e: ThreeEvent<MouseEvent>) => void; onContextMenu?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const tr = def ? avatarTraits(def) : null;
  const jersey = replacement ? "#6b7280" : tr?.jersey ?? "#94a3b8";
  const skin = replacement ? "#9ca3af" : tr?.skin ?? "#e8b894";
  const build = tr?.build ?? 1;
  const isHitter = def ? def.role === "H" : true;
  const seed = def ? def.id.length : 3;
  useFrame(({ clock }) => {
    if (!group.current) return;
    const tt = clock.getElapsedTime();
    group.current.position.y = position[1] + (dragging ? 0.6 : selected ? 0.18 + Math.sin(tt * 8) * 0.05 : Math.sin(tt * 2 + seed) * 0.02);
    group.current.rotation.y = dragging ? tt * 2 : 0;
  });
  const opacity = replacement ? 0.55 : 1;
  return (
    <group ref={group} position={position} scale={0.55} onPointerDown={onPointerDown} onClick={onClick} onContextMenu={onContextMenu}>
      {/* legs */}
      <mesh position={[-0.22 * build, 0.45, 0]} castShadow><cylinderGeometry args={[0.16, 0.18, 0.9, 10]} /><meshStandardMaterial color="#e5e7eb" transparent opacity={opacity} /></mesh>
      <mesh position={[0.22 * build, 0.45, 0]} castShadow><cylinderGeometry args={[0.16, 0.18, 0.9, 10]} /><meshStandardMaterial color="#e5e7eb" transparent opacity={opacity} /></mesh>
      {/* torso */}
      <mesh position={[0, 1.35, 0]} castShadow><capsuleGeometry args={[0.45 * build, 0.9, 6, 14]} /><meshStandardMaterial color={jersey} transparent opacity={opacity} /></mesh>
      {/* arms */}
      <mesh position={[-0.62 * build, 1.45, 0.1]} rotation={[0, 0, 0.35]} castShadow><capsuleGeometry args={[0.13, 0.7, 4, 10]} /><meshStandardMaterial color={skin} transparent opacity={opacity} /></mesh>
      <mesh position={[0.62 * build, 1.45, 0.1]} rotation={[0, 0, -0.35]} castShadow><capsuleGeometry args={[0.13, 0.7, 4, 10]} /><meshStandardMaterial color={skin} transparent opacity={opacity} /></mesh>
      {/* head + cap */}
      <mesh position={[0, 2.35, 0]} castShadow><sphereGeometry args={[0.42, 18, 14]} /><meshStandardMaterial color={skin} transparent opacity={opacity} /></mesh>
      <mesh position={[0, 2.62, 0]}><sphereGeometry args={[0.44, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={jersey} transparent opacity={opacity} /></mesh>
      <mesh position={[0, 2.52, 0.4]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.6, 0.06, 0.5]} /><meshStandardMaterial color={jersey} transparent opacity={opacity} /></mesh>
      {/* bat or glove */}
      {isHitter ? (
        <mesh position={[0.85 * build, 1.9, 0.2]} rotation={[0, 0, -0.9]} castShadow><cylinderGeometry args={[0.07, 0.1, 1.5, 8]} /><meshStandardMaterial color="#c58a4a" transparent opacity={opacity} /></mesh>
      ) : (
        <mesh position={[-0.8 * build, 1.2, 0.3]} castShadow><sphereGeometry args={[0.3, 10, 8]} /><meshStandardMaterial color="#7c4a12" transparent opacity={opacity} /></mesh>
      )}
      {/* star ring */}
      {star > 1 && <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.9, 1.1, 32]} /><meshBasicMaterial color={star === 3 ? "#fde047" : "#e2e8f0"} transparent opacity={0.9} /></mesh>}
      {selected && <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.15, 1.35, 32]} /><meshBasicMaterial color="#34d399" /></mesh>}
    </group>
  );
}

function Pad({ slot, active, hot, empty, onClick }: { slot: Slot; active: boolean; hot: boolean; empty: boolean; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const [x, z] = SLOT_POS[slot];
  const pitcher = slot.startsWith("P");
  return (
    <group position={[x, 0.01, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
        <circleGeometry args={[0.78, 28]} />
        <meshBasicMaterial color={hot ? "#34d399" : pitcher ? "#f59e0b" : "#f8fafc"} transparent opacity={hot ? 0.45 : active ? 0.28 : empty ? 0.14 : 0.06} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.74, 0.8, 32]} />
        <meshBasicMaterial color={hot ? "#34d399" : pitcher ? "#fbbf24" : "#f8fafc"} transparent opacity={hot ? 0.9 : 0.35} />
      </mesh>
    </group>
  );
}

function Scene({ state, me, selected, onTap, onOpen, onMove, interactive }: Props) {
  const { camera } = useThree();
  const [drag, setDrag] = useState<{ slot: Slot; pos: [number, number] } | null>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const selectedSlot = selected?.kind === "slot" ? selected.slot : null;
  const benchSelected = selected?.kind === "bench";

  const nearestSlot = (x: number, z: number, hitterOnly: boolean | null): Slot | null => {
    let best: Slot | null = null, bd = 1.1;
    for (const [slot, [sx, sz]] of Object.entries(SLOT_POS) as [Slot, [number, number]][]) {
      if (hitterOnly === true && slot.startsWith("P")) continue;
      if (hitterOnly === false && !slot.startsWith("P")) continue;
      const d = Math.hypot(sx - x, sz - z);
      if (d < bd) { bd = d; best = slot; }
    }
    return best;
  };
  const onGroundMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    e.ray.intersectPlane(plane, hit);
    setDrag({ ...drag, pos: [hit.x, hit.z] });
  };
  const endDrag = () => {
    if (!drag) return;
    const id = me.board.slots[drag.slot];
    const def = id ? defOf(state.cards[id]!.defId) : null;
    const target = nearestSlot(drag.pos[0], drag.pos[1], def ? def.role === "H" : null);
    if (target && target !== drag.slot) onMove({ kind: "slot", slot: drag.slot }, { kind: "slot", slot: target });
    setDrag(null);
  };
  useFrame(() => { camera.lookAt(0, 0, 0.6); });

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 12, 6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 8, -4]} intensity={0.5} color="#bfdbfe" />
      <group onPointerMove={onGroundMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
        <Field />
        {/* invisible catcher plane so drags keep tracking off the textured plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} visible={false}><planeGeometry args={[40, 40]} /></mesh>
      </group>
      {(Object.keys(SLOT_POS) as Slot[]).map((slot) => {
        const id = me.board.slots[slot];
        const card = id ? state.cards[id] : undefined;
        const def = card ? defOf(card.defId) : null;
        const [x, z] = SLOT_POS[slot];
        const isSel = selectedSlot === slot;
        const hot = !!drag && nearestSlot(drag.pos[0], drag.pos[1], (() => { const did = me.board.slots[drag.slot]; const d = did ? defOf(state.cards[did]!.defId) : null; return d ? d.role === "H" : null; })()) === slot && drag.slot !== slot;
        const pos: [number, number, number] = drag?.slot === slot ? [drag.pos[0], 0, drag.pos[1]] : [x, 0, z];
        const order = slot.startsWith("P") ? null : me.board.order.indexOf(slot as Pos) + 1;
        return (
          <group key={slot}>
            <Pad slot={slot} active={benchSelected || !!selectedSlot} hot={hot || (isSel && !drag)} empty={!card} onClick={(e) => { e.stopPropagation(); onTap({ kind: "slot", slot }); }} />
            <Figure
              def={def}
              star={card?.star ?? 1}
              selected={isSel}
              dragging={drag?.slot === slot}
              replacement={!card}
              position={pos}
              onPointerDown={(e) => { if (!interactive || !card) return; e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ slot, pos: [x, z] }); }}
              onClick={(e) => { e.stopPropagation(); if (!drag) onTap({ kind: "slot", slot }); }}
              onContextMenu={(e) => { e.stopPropagation(); if (card) onOpen(card.instanceId); }}
            />
            <Html position={[x, 0, z + 0.85]} center distanceFactor={10} zIndexRange={[5, 0]}>
              <button
                type="button"
                data-slot={slot}
                aria-label={`${posLabel(slot)} ${def ? def.name : t("run.replacement")}`}
                onClick={(e) => { e.stopPropagation(); onTap({ kind: "slot", slot }); }}
                onContextMenu={(e) => { e.preventDefault(); if (card) onOpen(card.instanceId); }}
                className={`flex flex-col items-center leading-none ${card ? "" : "opacity-75"} ${isSel ? "scale-110" : ""}`}
                style={{ touchAction: "manipulation" }}
              >
                <div className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white ring-1 whitespace-nowrap ${isSel ? "bg-emerald-700/90 ring-emerald-300" : "bg-black/70 ring-white/15"}`}>
                  <span className="num mr-1 text-[var(--led)]">{order ?? slot}</span>
                  {def ? def.name : slot.startsWith("P") ? (slot === "P1" ? "선발" : "불펜") : posLabel(slot)}{def && card && card.star > 1 ? <span className="ml-1 text-[var(--gold)]">{"★".repeat(card.star)}</span> : null}
                </div>
                {def && card ? <div className="mt-0.5 flex gap-1 text-[9px] text-white/80"><span>{def.role === "H" ? def.pos : def.role}</span><span className="num text-[var(--gold)]">{cardOvrWithStar(def, card)}</span>{card.fatigue > 0 && <span className="text-[var(--bad)]">{t("run.tired")}{card.fatigue}</span>}{card.injuredRounds > 0 && <span className="text-[var(--bad)]">{t("run.injured")}</span>}</div> : <div className="mt-0.5 text-[9px] text-white/60">{t("run.replacement")}</div>}
              </button>
            </Html>
          </group>
        );
      })}
    </>
  );
}

/** TFT-style 3D board: a diamond diorama with low-poly players you can tap or drag between positions. */
export function Board3D(props: Props) {
  return (
    <div className="relative mx-2 h-full min-h-[300px] overflow-hidden rounded-2xl ring-1 ring-white/10" style={{ touchAction: "none", background: "radial-gradient(120% 90% at 50% 100%, #0b3d22 0%, #07100b 70%)" }} aria-label={t("run.board")}>
      <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 12.5, 9.2], fov: 42 }} gl={{ antialias: true, alpha: true }}>
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
