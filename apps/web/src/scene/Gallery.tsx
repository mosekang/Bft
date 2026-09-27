/** Debug gallery (`?gallery`): a line-up of players up close for art review. */
import { Canvas } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { appearanceOf, replacementAppearance } from "../lib/appearance.js";
import { pack } from "../lib/pack.js";
import type { Actor } from "./actor.js";
import type { AnyClip } from "./clips.js";
import { Figures } from "./Figures.js";
import { Ticker } from "./stageKit.js";
import { HeroStage, heroCards, type HeroMood } from "./LobbyStage.js";

export default function Gallery() {
  const mode = new URLSearchParams(window.location.search).get("gallery");
  if (mode === "win" || mode === "lose") return <HeroGallery mood={mode} />;
  return <FigureGallery />;
}

function HeroGallery({ mood }: { mood: HeroMood }) {
  const defs = useMemo(() => heroCards(pack.cards), []);
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div style={{ position: "relative", height: "46vh" }}><HeroStage quality="mid" sceneKey={mood} defs={defs} mood={mood} stars={[3, 2, 1, 2, 1]} band={[-0.74, 0.22]} title={mood === "win" ? "WINNER" : "GAME SET"} /></div>
    </div>
  );
}

function FigureGallery() {
  const clock = useRef(0);
  const actors = useRef<Actor[]>([]);
  useMemo(() => {
    const picks = [pack.cards[5]!, pack.cards[18]!, pack.cards[30]!, pack.cards[44]!, pack.cards[52]!, pack.cards[57]!];
    const clips: AnyClip[] = ["idle_batter", "idle_field", "idle_pitcher", "celebrate", "idle_catcher", "idle_field"];
    actors.current = picks.map((def, i) => ({
      id: `g${i}`, ap: appearanceOf(def), pos: [(i - 2.5) * 1.1, 0, 0] as [number, number, number], yaw: 0.25 * (i % 2 ? 1 : -1), scale: 1,
      clip: clips[i]!, clipStart: -i * 0.3, mirror: def.bats === "L", headgear: i === 0 ? "helmet" : i === 4 ? "mask" : "cap", prop: i === 0 ? "bat" : "glove", role: def.role === "H" ? "H" : "P",
    }));
    actors.current.push({ id: "rep", ap: replacementAppearance("x"), pos: [3.9, 0, -0.8], yaw: -0.3, scale: 1, clip: "idle_field", clipStart: 0, mirror: false, headgear: "cap", prop: "glove", role: "H" });
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b1224" }}>
      <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.3, 7.2] }} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
        <Ticker fps={30} clock={clock} />
        <hemisphereLight args={["#c7d7ff", "#10301c", 1.1]} />
        <directionalLight position={[3, 6, 5]} intensity={1.6} />
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 10]} /><meshLambertMaterial color="#1f7a3d" /></mesh>
        <Figures actors={actors} clock={clock} />
      </Canvas>
    </div>
  );
}
