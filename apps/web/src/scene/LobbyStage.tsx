/**
 * Hero scene for the lobby and the result screen: five players pose at home
 * plate under the lights, fireworks over the outfield, the camera drifts
 * slowly. Tapping a player makes them celebrate. Purely cosmetic.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { CardDef } from "@dugout/protocol";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { haptic, sfx } from "../audio/index.js";
import { appearanceOf, teamLook } from "../lib/appearance.js";
import { ovrOf, pack } from "../lib/pack.js";
import type { Actor } from "./actor.js";
import type { AnyClip } from "./clips.js";
import { Particles, type FxApi } from "./fx.js";
import { Figures } from "./Figures.js";
import { TARGET_FPS, type Quality } from "./quality.js";
import { Stadium } from "./Stadium.js";
import { Ticker } from "./stageKit.js";

const SCALE = 1.35;
/** V formation: centre front, then pairs further back (world metres, +z = centre field). */
const SPOTS: [number, number][] = [[0, 0], [-1.25, 1.3], [1.25, 1.3], [-2.3, 2.9], [2.3, 2.9]];
export type HeroMood = "lobby" | "win" | "lose";
const CHEERS: AnyClip[] = ["celebrate", "dugout_cheer", "cheer_stage"];

/** Best card per team by OVR, strongest first; the centre is the best hitter. */
export function heroCards(cards: readonly CardDef[], n = 5): CardDef[] {
  const byOvr = [...cards].sort((a, b) => b.cost - a.cost || ovrOf(b) - ovrOf(a) || a.id.localeCompare(b.id));
  const out: CardDef[] = [];
  const teams = new Set<string>();
  for (const d of byOvr) { if (out.length >= n) break; if (teams.has(d.team)) continue; teams.add(d.team); out.push(d); }
  for (const d of byOvr) { if (out.length >= n) break; if (!out.includes(d)) out.push(d); }
  const hi = out.findIndex((d) => d.role === "H");
  if (hi > 0) out.unshift(...out.splice(hi, 1));
  return out;
}

function heroActors(defs: CardDef[], mood: HeroMood, stars: number[]): Actor[] {
  return defs.map((def, i) => {
    const [x, z] = SPOTS[i]!;
    const pitcher = def.role !== "H";
    const clip: AnyClip = mood === "lose" ? (i === 0 ? "idle_field" : "dugout_sad") : mood === "win" ? (i === 0 ? "celebrate" : i % 2 ? "dugout_cheer" : "celebrate") : i === 0 ? "idle_batter" : pitcher ? "idle_pitcher" : i % 2 ? "idle_field" : "dugout_cheer";
    const yaw = i === 0 ? (def.bats === "L" ? Math.PI - 0.45 : Math.PI + 0.45) : Math.PI + (x > 0 ? 0.35 : -0.35);
    return {
      id: `hero:${i}`, ap: appearanceOf(def), pos: [x, 0, z], yaw, scale: SCALE, clip, clipStart: -i * 0.37,
      mirror: i === 0 ? def.bats === "L" : def.throws === "L", headgear: i === 0 && mood === "lobby" ? "helmet" : "cap", prop: i === 0 && mood !== "lose" ? "bat" : pitcher ? "glove" : i % 2 ? "glove" : "none", role: pitcher ? "P" : "H",
      ...(stars[i] && stars[i]! > 1 ? { star: stars[i] as 2 | 3 } : {}),
    } satisfies Actor;
  });
}

interface SceneProps { quality: Quality; defs: CardDef[]; mood: HeroMood; stars: number[]; band: [number, number]; title: string }

function Scene({ quality, defs, mood, stars, band, title }: SceneProps) {
  const [BAND_LO, BAND_HI] = band;
  const { camera, size } = useThree();
  const clock = useRef(0);
  const actors = useRef<Actor[]>(heroActors(defs, mood, stars));
  const base = useMemo(() => actors.current.map((a) => a.clip), []); // eslint-disable-line react-hooks/exhaustive-deps
  const fx = useRef<FxApi | null>(null);
  const nextShow = useRef(1.2);
  const colors = useMemo<[string, string]>(() => { const lk = teamLook(defs[0]?.team ?? ""); return [lk.primary, lk.secondary]; }, [defs]);
  const board = useMemo(() => ({
    header: pack.name.slice(0, 18), inning: 1, half: "T" as const, message: title,
    away: { short: "AWY", color: "#475569", line: [], r: 0, h: 0, e: 0 }, home: { short: teamLook(defs[0]?.team ?? "").short || "HOM", color: colors[0], line: [], r: 0, h: 0, e: 0 },
  }), [defs, colors, title]);

  // Frame the line-up: widest point fits the portrait width, figures sit in the upper-middle band.
  const pts = useMemo(() => actors.current.flatMap((a) => [new THREE.Vector3(a.pos[0] - 0.6, 0, a.pos[2]), new THREE.Vector3(a.pos[0] + 0.6, 2.1 * SCALE, a.pos[2])]), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  // Figures fill the band between the logo and the menu dock: NDC y in [BAND_LO, BAND_HI].
  const place = (yaw: number) => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.clearViewOffset();
    const target = new THREE.Vector3(0, 1.1, 1.4);
    const dir = new THREE.Vector3(-Math.sin(yaw), 0.16, -Math.cos(yaw)).normalize();
    const span = () => {
      cam.updateMatrixWorld(true);
      let lo = Infinity, hi = -Infinity, wx = 0;
      for (const p of pts) { v.copy(p).project(cam); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); wx = Math.max(wx, Math.abs(v.x)); }
      return { lo, hi, wx };
    };
    let lo = 3, hi = 80;
    for (let it = 0; it < 22; it++) {
      const d = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      const s = span();
      if (s.wx <= 0.92 && s.hi - s.lo <= BAND_HI - BAND_LO) hi = d; else lo = d;
    }
    cam.position.copy(target).addScaledVector(dir, hi);
    cam.lookAt(target);
    const s = span();
    const shift = (BAND_HI + BAND_LO) / 2 - (s.hi + s.lo) / 2;
    cam.setViewOffset(size.width, size.height, 0, (shift * size.height) / 2, size.width, size.height);
    cam.updateProjectionMatrix();
  };
  useEffect(() => { place(0); }, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const t = clock.current;
    place(Math.sin(t * 0.18) * 0.16);
    // Occasional cheer from a random back-row player; fireworks every few seconds.
    for (const a of actors.current) {
      if (mood === "lobby" && CHEERS.includes(a.clip) && t - a.clipStart > 2.4 && base[actors.current.indexOf(a)] !== a.clip) { a.clip = base[actors.current.indexOf(a)]!; a.clipStart = t; }
    }
    if (mood !== "lose" && t > nextShow.current) {
      nextShow.current = t + (mood === "win" ? 1.3 : 2.6) + ((t * 7.3) % 1.7);
      fx.current?.burst("fireworks", [(((t * 13.1) % 1) - 0.5) * 60, 8, 95], quality === "high" ? 160 : 90);
      if (mood === "win") fx.current?.burst("confetti", [0, 0, 2], 50);
      const back = actors.current[1 + (Math.floor(t * 3.7) % Math.max(1, actors.current.length - 1))];
      if (mood === "lobby" && back && !CHEERS.includes(back.clip)) { back.clip = CHEERS[Math.floor(t) % CHEERS.length]!; back.clipStart = t; }
    }
  });

  const onTap = (id: string) => {
    const a = actors.current.find((x) => x.id === id);
    if (!a) return;
    a.clip = a.id === "hero:0" && mood === "lobby" ? "react_hr" : "celebrate";
    a.clipStart = clock.current;
    fx.current?.burst("confetti", [a.pos[0], 0, a.pos[2]], 60);
    haptic("light");
    sfx("card_drop");
  };

  return (
    <>
      <Ticker fps={TARGET_FPS[quality]} clock={clock} />
      <hemisphereLight args={["#c7d7ff", "#10301c", mood === "lose" ? 0.7 : 1.0]} />
      <directionalLight position={[-6, 14, -10]} intensity={1.7} />
      <directionalLight position={[8, 6, 12]} intensity={0.6} color="#9ecbff" />
      <fog attach="fog" args={["#0b1224", 180, 520]} />
      <Stadium stadium="HITTER_FRIENDLY" quality={quality} crowd={mood === "lose" ? 0.35 : 1} homeColors={colors} board={board} propScale={1} />
      <Figures actors={actors} clock={clock} shadows={false} onActorClick={(id) => onTap(id)} />
      <Particles api={fx} clock={clock} />
    </>
  );
}

export interface HeroStageProps {
  quality: Quality;
  /** Changing this rebuilds the scene (pack switch, new result). */
  sceneKey: string;
  defs: CardDef[];
  mood?: HeroMood;
  stars?: number[];
  /** NDC y band the figures fill (bottom, top). */
  band?: [number, number];
  title?: string;
}

export function HeroStage({ quality, sceneKey, defs, mood = "lobby", stars = [], band = [-0.38, 0.3], title = "PLAY BALL" }: HeroStageProps) {
  return (
    <div className="absolute inset-0" aria-hidden style={{ background: "#070b16" }}>
      <Canvas frameloop="demand" dpr={quality === "high" ? [1, 2] : [1, 1.5]} camera={{ fov: 40, near: 0.3, far: 1600, position: [0, 3, -12] }} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <Scene key={sceneKey} quality={quality} defs={defs} mood={mood} stars={stars} band={band} title={title} />
      </Canvas>
    </div>
  );
}

export default function LobbyStage({ quality, packId }: { quality: Quality; packId: string }) {
  const defs = useMemo(() => heroCards(pack.cards), [packId]); // eslint-disable-line react-hooks/exhaustive-deps
  return <HeroStage quality={quality} sceneKey={packId} defs={defs} />;
}
