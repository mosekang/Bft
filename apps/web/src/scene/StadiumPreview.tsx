/** Stadium select: a slow crane shot over the focused park (cosmetic). */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { StadiumId } from "@dugout/protocol";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TARGET_FPS, type Quality } from "./quality.js";
import { Stadium } from "./Stadium.js";
import { Ticker } from "./stageKit.js";

function Crane({ clock }: { clock: React.MutableRefObject<number> }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 4, 55), []);
  useFrame(() => {
    const t = clock.current;
    const a = Math.sin(t * 0.12) * 0.55;
    const r = 95 + Math.sin(t * 0.07) * 10;
    camera.position.set(Math.sin(a) * r, 34 + Math.sin(t * 0.09) * 6, 55 - Math.cos(a) * r);
    camera.lookAt(target);
  });
  return null;
}

export default function StadiumPreview({ id, quality }: { id: StadiumId; quality: Quality }) {
  const clock = useRef(0);
  const board = useMemo(() => ({
    header: "HOME FIELD", inning: 1, half: "T" as const, message: id.replace("_", " "),
    away: { short: "AWY", color: "#475569", line: [], r: 0, h: 0, e: 0 }, home: { short: "HOM", color: "#16a34a", line: [], r: 0, h: 0, e: 0 },
  }), [id]);
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 42, near: 1, far: 1600, position: [0, 40, -40] }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <Ticker fps={TARGET_FPS[quality]} clock={clock} />
      <Crane clock={clock} />
      <hemisphereLight args={["#c7d7ff", "#10301c", 1.05]} />
      <directionalLight position={[-30, 80, -40]} intensity={1.6} />
      <fog attach="fog" args={["#0b1224", 260, 700]} />
      <Stadium key={id} stadium={id} quality={quality} crowd={0.85} homeColors={["#16a34a", "#f1f5f9"]} board={board} propScale={1} />
    </Canvas>
  );
}
