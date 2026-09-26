/**
 * Turntable preview of one player (DESIGN §17.2 long-press sheet: 6 s per
 * turn) or of a synergy's field effect (§18.1 codex preview).
 */
import { Canvas, useFrame } from "@react-three/fiber";
import type { CardDef, CardInstance, SynergyId } from "@dugout/protocol";
import { useMemo, useRef } from "react";
import { appearanceOf, genericAppearance } from "../lib/appearance.js";
import type { Actor } from "./actor.js";
import { Auras } from "./Auras.js";
import { Figures } from "./Figures.js";
import { SYNERGY_FX, itemLook, type Aura } from "./synergyFx.js";
import { Ticker } from "./stageKit.js";

function Spin({ actors, clock }: { actors: React.MutableRefObject<Actor[]>; clock: React.MutableRefObject<number> }) {
  useFrame(() => { for (const a of actors.current) a.yaw = (clock.current / 6) * Math.PI * 2; });
  return null;
}

export default function FigurePreview({ def, card, synergy, height = 150 }: { def?: CardDef; card?: CardInstance; synergy?: SynergyId; height?: number }) {
  const clock = useRef(0);
  const actors = useRef<Actor[]>([]);
  useMemo(() => {
    const fx = synergy ? SYNERGY_FX[synergy] : undefined;
    const auras: Aura[] = fx ? [{ color: fx.color, kind: fx.kind, strong: true }] : [];
    const pitcher = def ? def.role !== "H" : synergy === "FIREBALLER" || synergy === "FINESSE" || synergy === "INNING_EATER" || synergy === "CLOSER";
    actors.current = [{
      id: "p", ap: def ? appearanceOf(def) : genericAppearance(`syn:${synergy ?? "x"}`, "#16a34a", "#f1f5f9"),
      pos: [0, 0, 0], yaw: 0, scale: 1, clip: pitcher ? "idle_pitcher" : "idle_batter", clipStart: 0, mirror: def ? def.bats === "L" : false,
      headgear: pitcher ? "cap" : "helmet", prop: pitcher ? "glove" : "bat", role: pitcher ? "P" : "H", auras,
      ...(card ? { look: itemLook(card.items), star: card.star } : {}),
    }];
  }, [def, card, synergy]);
  return (
    <div style={{ height }} className="w-full overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_30%,#1f3b2a,#07100b)]">
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 30, position: [0, 1.4, 4.6], near: 0.1, far: 50 }} onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}>
        <Ticker fps={30} clock={clock} />
        <hemisphereLight args={["#e0ecff", "#1a2e1f", 1.2]} />
        <directionalLight position={[2, 4, 3]} intensity={1.4} />
        <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.9, 1.0, 0.1, 32]} /><meshLambertMaterial color="#b8733f" /></mesh>
        <Spin actors={actors} clock={clock} />
        <Figures actors={actors} clock={clock} />
        <Auras actors={actors} clock={clock} />
      </Canvas>
    </div>
  );
}
