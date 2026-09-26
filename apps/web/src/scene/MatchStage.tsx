/**
 * 3D match playback (DESIGN §16): plays the cinematic reel for one matchup
 * on the ballpark stage — cameras, clips, runner moves, ball flights,
 * hit-stop, slow motion, shake, particles, sounds, haptics, scoreboard and
 * commentary captions. Results are already decided; skipping changes nothing.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { GameEvent, GameState, Matchup, Pos } from "@dugout/protocol";
import { BASE_POS } from "@dugout/protocol";
import { SHOT_DEFS, buildReel, fieldingLayout, type ActorRef, type Reel, type Step, type Timeline, type Vec3 } from "@dugout/cinematic";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { haptic, sfx, setAmbienceLevel, startLoop, stopLoop, leverageToLevel } from "../audio/index.js";
import { appearanceOf, genericAppearance, replacementAppearance, type Appearance } from "../lib/appearance.js";
import { defOf } from "../lib/pack.js";
import type { Actor } from "./actor.js";
import { clipDuration, clipLoops, type AnyClip } from "./clips.js";
import { Figures } from "./Figures.js";
import { Ball, Particles, type BallFlight, type FxApi } from "./fx.js";
import { CHEER_STAGE, DUGOUT_SPACING, dugoutSeats, parkDims, specToWorld } from "./park.js";
import { PARTICLE_SCALE, TARGET_FPS, type Quality } from "./quality.js";
import type { BoardData } from "./scoreboard.js";
import { Stadium, crowdUniforms } from "./Stadium.js";
import { Ticker } from "./stageKit.js";
import { sideClub } from "./teams.js";
import { Auras } from "./Auras.js";
import { aurasFor, itemLook, visualTags } from "./synergyFx.js";
import { SYNERGIES, computeEffects } from "@dugout/engine";
import type { SynergyId } from "@dugout/protocol";
import { ctx as packCtx } from "../lib/pack.js";

const SCALE = 1.25;
const FIELD_POS: Pos[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const W = (v: readonly number[]): THREE.Vector3 => new THREE.Vector3(-(v[0] ?? 0), v[1] ?? 0, v[2] ?? 0);
const baseWorld = (b: number): THREE.Vector3 => W(BASE_POS[Math.max(0, Math.min(4, b))]!);

export type ScreenFx = "flash" | "vignette" | "boo";

export interface MatchStageProps {
  state: GameState;
  matchup: Matchup;
  compact: boolean;
  rate: 1 | 2;
  quality: Quality;
  reduced: boolean;
  onCaption: (eventIndex: number) => void;
  onScore: (score: [number, number]) => void;
  onScreenFx: (fx: ScreenFx, dur: number) => void;
  onDone: () => void;
  /** Set to true to jump to the game-end timeline. */
  skip: React.MutableRefObject<boolean>;
  /** My side in this matchup: the KBO cheering drum plays while my team bats. */
  mySide?: "home" | "away";
}

/** Localise English scoreboard codes from the cinematic package. */
export function boardText(code: string): string {
  if (code === "HOME RUN") return "홈런!";
  if (code === "DRAW") return "무승부";
  if (code === "FINAL") return "경기 종료";
  if (code === "PITCHING CHANGE") return "투수 교체";
  let m = /^INNING (\d+)([TB])$/.exec(code);
  if (m) return `${m[1]}회${m[2] === "T" ? "초" : "말"}`;
  m = /^INN (\d+)(?:-(\d+))? NO RUNS$/.exec(code);
  if (m) return m[2] ? `${m[1]}~${m[2]}회 무득점` : `${m[1]}회 무득점`;
  m = /^INN (\d+)(?:-(\d+))? AWAY (\d+) HOME (\d+)$/.exec(code);
  if (m) return `${m[2] ? `${m[1]}~${m[2]}회` : `${m[1]}회`} ${m[3]} : ${m[4]}`;
  return code;
}

interface Tween { actor: Actor; from: THREE.Vector3; to: THREE.Vector3; start: number; dur: number; ease: string; clip: AnyClip }

const ease = (k: string, t: number): number => (k === "outCubic" ? 1 - Math.pow(1 - t, 3) : k === "inOutCubic" ? (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) : t);

function Scene(props: MatchStageProps & { reel: Reel; setBoard: (b: Partial<BoardData>) => void }) {
  const { state, matchup: m, rate, quality, reduced, reel, onCaption, onScore, onScreenFx, onDone, setBoard } = props;
  const { camera } = useThree();
  const clock = useRef(0);
  const ts = useRef(1);
  const actors = useRef<Actor[]>([]);
  const byId = useRef(new Map<string, Actor>());
  const baseClip = useRef(new Map<string, AnyClip>());
  const flight = useRef<BallFlight | null>(null);
  const ballPos = useRef<THREE.Vector3 | null>(null);
  const prevBall = useRef<THREE.Vector3 | null>(null);
  const fx = useRef<FxApi | null>(null);
  const play = useRef({ tl: -1, t: 0, ptr: 0, hitstopUntil: -1, slowUntil: -1, slowScale: 1, real: 0, done: false });
  const tweens = useRef<Tween[]>([]);
  const cam = useRef<{ shot: keyof typeof SHOT_DEFS; follow?: ActorRef; pos: THREE.Vector3; target: THREE.Vector3; shake: { amp: number; until: number; dur: number } }>({ shot: "CAM_FIELD", pos: new THREE.Vector3(0, 40, -40), target: new THREE.Vector3(0, 0, 30), shake: { amp: 0, until: 0, dur: 1 } });
  const wave = useRef<{ start: number } | null>(null);
  const dims = useMemo(() => parkDims(m.homeStadium), [m.homeStadium]);
  const home = useMemo(() => sideClub(state, m.home), [state, m.home]);
  const away = useMemo(() => sideClub(state, m.away), [state, m.away]);

  // Active synergy tiers per side, for auras and ball-trail colours (§18.1).
  const tiersOf = useMemo(() => {
    const max = new Map<SynergyId, number>((Object.keys(SYNERGIES) as SynergyId[]).map((id) => [id, SYNERGIES[id].thresholds.length]));
    const stage = Number(state.round.split("-")[0]);
    const one = (p: typeof home.player) => new Map<SynergyId, number>(p ? computeEffects(p, state.cards, packCtx, stage).run.synergies.map((x) => [x.id, x.penalised ? 0 : x.tier]) : []);
    return { home: one(home.player), away: one(away.player), max };
  }, [state, home, away]);
  const dress = (a: Actor, id: string, side: "home" | "away"): Actor => {
    const card = state.cards[id];
    if (!card) return a;
    const def = defOf(card.defId);
    return { ...a, auras: aurasFor(def, tiersOf[side], tiersOf.max), look: itemLook(card.items) };
  };
  const trailColor = (batterId: string, side: "home" | "away"): string | undefined => {
    const card = state.cards[batterId];
    if (!card) return undefined;
    const tags = visualTags(defOf(card.defId));
    const t = tiersOf[side];
    if (tags.includes("SLUGGER") && (t.get("SLUGGER") ?? 0) > 0) return "#ff8a3d";
    if (tags.includes("CONTACT_HITTER") && (t.get("CONTACT_HITTER") ?? 0) > 0) return "#60a5fa";
    return undefined;
  };
  const battingSide = useRef<"home" | "away">("away");
  const batterId = useRef("");
  const lookOf = (id: string, side: "home" | "away"): Appearance => {
    const card = state.cards[id];
    if (card) return appearanceOf(defOf(card.defId));
    if (id.startsWith("REPL")) return replacementAppearance(id);
    const c = side === "home" ? home.colors : away.colors;
    return genericAppearance(id, c[0], c[1]);
  };
  const fieldingIds = (side: "home" | "away", e: GameEvent): Record<string, string> => {
    const player = (side === "home" ? home : away).player;
    const out: Record<string, string> = {};
    for (const p of FIELD_POS) out[p] = player?.board.slots[p] ?? `${side}:${p}:${e.half}`;
    return out;
  };

  const put = (raw: Actor, cardId?: string, side?: "home" | "away") => { const a = cardId && side ? dress(raw, cardId, side) : raw; actors.current.push(a); byId.current.set(a.id, a); baseClip.current.set(a.id, a.clip); };
  const setup = (tl: Timeline) => {
    const idx = tl.eventIndex ?? tl.eventRange?.[1] ?? m.events.length - 1;
    const e = m.events[Math.min(idx, m.events.length - 1)]!;
    const fielding: "home" | "away" = e.half === "T" ? "home" : "away";
    const batting = fielding === "home" ? "away" : "home";
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    const bh: "L" | "R" = meta["batterHand"] === "L" ? "L" : "R";
    const layout = fieldingLayout(bh);
    actors.current = [];
    byId.current.clear();
    tweens.current = [];
    flight.current = null;
    const now = clock.current;
    const ids = fieldingIds(fielding, e);
    for (const p of FIELD_POS) {
      const pos = W(layout[p]);
      const look = lookOf(ids[p]!, fielding);
      put({ id: `fld:${p}`, ap: look, pos: [pos.x, 0, pos.z], yaw: p === "C" ? 0 : Math.atan2(-pos.x, -pos.z), scale: SCALE, clip: p === "C" ? "idle_catcher" : "idle_field", clipStart: now - Math.random(), mirror: look.lefty, headgear: p === "C" ? "mask" : "cap", prop: "glove", role: "H", away: fielding === "away" }, ids[p]!, fielding);
    }
    const pl = W(layout.P);
    const pAp = e.pitcher ? lookOf(e.pitcher, fielding) : genericAppearance("p", "#64748b");
    put({ id: "fld:P", ap: pAp, pos: [pl.x, 0.25, pl.z], yaw: Math.PI, scale: SCALE, clip: "idle_pitcher", clipStart: now, mirror: meta["pitcherHand"] === "L" || pAp.lefty, headgear: "cap", prop: "glove", role: "P", away: fielding === "away" }, e.pitcher, fielding);
    if (e.batter) {
      const x = bh === "R" ? 0.95 : -0.95;
      put({ id: "bat", ap: lookOf(e.batter, batting), pos: [x, 0, 0.1], yaw: bh === "R" ? -Math.PI / 2 : Math.PI / 2, scale: SCALE, clip: "idle_batter", clipStart: now, mirror: bh === "L", headgear: "helmet", prop: "bat", role: "H", away: batting === "away" }, e.batter, batting);
    }
    battingSide.current = batting;
    batterId.current = e.batter;
    const moves = (meta["runnerMoves"] as { runner: string; from: number }[] | undefined) ?? [];
    e.runners.forEach((on, i) => {
      if (!on) return;
      const base = i + 1;
      const rid = moves.find((mv) => mv.from === base)?.runner ?? `base:${base}`;
      const p = baseWorld(base);
      const next = baseWorld(base + 1);
      put({ id: `run:${rid}`, ap: lookOf(rid, batting), pos: [p.x + (next.x - p.x) * 0.1, 0, p.z + (next.z - p.z) * 0.1], yaw: Math.atan2(next.x - p.x, next.z - p.z), scale: SCALE, clip: "idle_field", clipStart: now, mirror: false, headgear: "helmet", prop: "none", role: "H", away: batting === "away" });
    });
    put({ id: "ump", ap: genericAppearance("ump", "#1f2937", "#9ca3af"), pos: [0.35, 0, -2.4], yaw: 0, scale: SCALE * 0.95, clip: "idle_field", clipStart: now, mirror: false, headgear: "cap", prop: "none", role: "U" });
    for (const side of ["home", "away"] as const) {
      const player = (side === "home" ? home : away).player;
      const seats = dugoutSeats(side, 6, DUGOUT_SPACING * 0.45, 4);
      seats.forEach((s, k) => {
        const id = player?.bench[k] ?? `${side}:bench:${k}`;
        put({ id: `dug:${side}:${k}`, ap: lookOf(id, side), pos: [...s.pos] as [number, number, number], yaw: s.yaw, scale: SCALE, clip: "sit", clipStart: now - k * 0.4, mirror: false, headgear: "cap", prop: "none", role: "X", away: side === "away" });
      });
    }
    for (let k = 0; k < 3; k++) {
      const side = (k - 1) * 1.2;
      const ap = { ...genericAppearance(`cheer${k}`, home.colors[0], home.colors[1]), hairStyle: 4 as const, beard: 0 as const, build: 0 as const };
      put({ id: `cheer:${k}`, ap, pos: [CHEER_STAGE.pos[0] + Math.cos(CHEER_STAGE.yaw) * side, CHEER_STAGE.pos[1], CHEER_STAGE.pos[2] - Math.sin(CHEER_STAGE.yaw) * side], yaw: CHEER_STAGE.yaw, scale: SCALE, clip: k === 1 ? "cheer_stage" : "dugout_cheer", clipStart: now + k * 0.1, mirror: k === 2, headgear: "none", prop: "none", role: "X" });
    }
    // Scoreboard for this moment.
    const upto = m.events.slice(0, idx + 1);
    const line = (half: "T" | "B") => upto.filter((x) => x.type === "INNING_END" && x.half === half).map((x, i, arr) => x.scoreAfter[half === "T" ? 0 : 1] - (i > 0 ? arr[i - 1]!.scoreAfter[half === "T" ? 0 : 1] : 0));
    const hits = (half: "T" | "B") => upto.filter((x) => x.half === half && ["1B", "2B", "3B", "HR"].includes(x.type)).length;
    const errs = (half: "T" | "B") => upto.filter((x) => x.half !== half && x.type === "E").length;
    setBoard({
      inning: e.inning, half: e.half, outs: e.outs,
      away: { short: away.short, color: away.colors[0], line: line("T"), r: e.scoreBefore[0], h: hits("T"), e: errs("T") },
      home: { short: home.short, color: home.colors[0], line: line("B"), r: e.scoreBefore[1], h: hits("B"), e: errs("B") },
      batter: m.names?.[e.batter] ?? String(meta["batterName"] ?? ""), pitcher: m.names?.[e.pitcher] ?? String(meta["pitcherName"] ?? ""),
    });
    const lev = typeof meta["leverage"] === "number" ? (meta["leverage"] as number) : 1;
    setAmbienceLevel(leverageToLevel(lev));
    crowdUniforms.uExcite.value = 0.25 + 0.15 * lev;
    if (props.mySide && batting === props.mySide) startLoop("cheer_drum"); else stopLoop("cheer_drum");
  };

  const resolve = (ref: ActorRef): Actor[] => {
    if (ref === "batter") return byId.current.get("bat") ? [byId.current.get("bat")!] : [];
    if (ref === "pitcher") return [byId.current.get("fld:P")].filter(Boolean) as Actor[];
    if (ref === "catcher") return [byId.current.get("fld:C")].filter(Boolean) as Actor[];
    if (ref === "umpire") return [byId.current.get("ump")].filter(Boolean) as Actor[];
    if (ref === "crowd") return [];
    if ("fielder" in ref) return [byId.current.get(`fld:${ref.fielder}`)].filter(Boolean) as Actor[];
    if ("runner" in ref) {
      let a = byId.current.get(`run:${ref.runner}`);
      if (!a) {
        const p = baseWorld(1);
        a = { id: `run:${ref.runner}`, ap: lookOf(ref.runner, "away"), pos: [p.x, 0, p.z], yaw: 0, scale: SCALE, clip: "idle_field", clipStart: clock.current, mirror: false, headgear: "helmet", prop: "none", role: "H" };
        put(a);
      }
      return [a];
    }
    return actors.current.filter((a) => a.id.startsWith(`dug:${ref.dugout}:`));
  };
  const where = (at: Vec3 | ActorRef | undefined): THREE.Vector3 => {
    if (!at) return new THREE.Vector3(0, 1, 20);
    if (Array.isArray(at)) return W(at);
    const a = resolve(at as ActorRef)[0];
    return a ? new THREE.Vector3(a.pos[0], a.pos[1] + 1.2 * a.scale, a.pos[2]) : new THREE.Vector3(0, 1, 0);
  };

  const run = (s: Step, real: number) => {
    const now = clock.current;
    switch (s.kind) {
      case "cam": cam.current.shot = s.shot; if (s.follow) cam.current.follow = s.follow; else delete cam.current.follow; break;
      case "anim": for (const a of resolve(s.who)) { a.clip = s.clip; a.clipStart = now; } break;
      case "move": {
        const target = Array.isArray(s.to) ? W(s.to) : "base" in s.to ? baseWorld(s.to.base) : W(fieldingLayout("R")[s.to.slot]);
        for (const a of resolve(s.who)) {
          tweens.current = tweens.current.filter((t) => t.actor !== a);
          tweens.current.push({ actor: a, from: new THREE.Vector3(...a.pos), to: target.clone().setY(a.pos[1] > 0.2 && a.id === "fld:P" ? 0.25 : 0), start: now, dur: Math.max(0.05, s.dur), ease: s.ease, clip: s.clipWhileMoving ?? "run" });
          a.clip = s.clipWhileMoving ?? "run"; a.clipStart = now;
          a.yaw = Math.atan2(target.x - a.pos[0], target.z - a.pos[2]);
        }
        break;
      }
      case "ball": { const col = trailColor(batterId.current, battingSide.current); flight.current = { points: s.path.points.map((p) => { const v = W(p); return [v.x, v.y, v.z] as [number, number, number]; }), start: now, flightTime: s.path.flightTime, glow: s.path.trail === "glow" || !!col, ...(col ? { color: col } : {}) }; prevBall.current = null; break; }
      case "hitstop": if (!reduced) play.current.hitstopUntil = real + s.ms / 1000; break;
      case "timeScale": play.current.slowUntil = real + s.dur; play.current.slowScale = s.scale; break;
      case "shake": if (!reduced) cam.current.shake = { amp: s.amp * 4, until: real + s.dur, dur: s.dur }; break;
      case "sfx": sfx(s.id, s.volume === undefined ? {} : { volume: s.volume }); break;
      case "haptic": haptic(s.id); break;
      case "fx": {
        const n = Math.round((s.count ?? 20) * PARTICLE_SCALE[quality]);
        if (s.effect === "flash" || s.effect === "vignette" || s.effect === "boo") { if (!(reduced && s.effect === "flash")) onScreenFx(s.effect, s.dur ?? 0.4); if (s.effect === "boo") crowdUniforms.uExcite.value = 0.05; }
        else if (s.effect === "crowdWave") wave.current = { start: real };
        else if (s.effect === "fireworks") fx.current?.burst("fireworks", [0, 20, dims.cf + 10], n);
        else if (s.effect === "confetti") fx.current?.burst("confetti", [0, 0, 20], n);
        else fx.current?.burst(s.effect, where(s.at).toArray() as [number, number, number], n);
        break;
      }
      case "board": setBoard({ message: boardText(s.text), flash: !!s.flash }); break;
      case "caption": onCaption(s.eventIndex); setBoard({ message: "" }); break;
      case "score": onScore(s.score); setBoard({ scoreAfter: s.score } as unknown as Partial<BoardData>); break;
    }
  };

  useFrame((_, dtRaw) => {
    const P = play.current;
    if (P.done) return;
    const dt = Math.min(0.1, dtRaw) * rate;
    P.real += dt;
    ts.current = rate * (P.real < P.hitstopUntil ? 0 : P.real < P.slowUntil ? P.slowScale : 1);
    if (P.tl < 0) { P.tl = 0; P.t = 0; P.ptr = 0; if (reel.timelines[0]) setup(reel.timelines[0]); }
    if (props.skip.current) {
      props.skip.current = false;
      const last = reel.timelines.length - 1;
      if (P.tl < last) { P.tl = last; P.t = 0; P.ptr = 0; P.hitstopUntil = -1; P.slowUntil = -1; setup(reel.timelines[last]!); onScore([m.score[0], m.score[1]]); setBoard({ scoreAfter: [m.score[0], m.score[1]] } as unknown as Partial<BoardData>); }
    }
    let tl = reel.timelines[P.tl];
    P.t += dt;
    while (tl && P.t >= tl.duration) {
      while (P.ptr < tl.steps.length) run(tl.steps[P.ptr++]!, P.real);
      P.t -= tl.duration;
      P.tl++;
      P.ptr = 0;
      tl = reel.timelines[P.tl];
      if (tl) setup(tl);
    }
    if (!tl) { P.done = true; onDone(); return; }
    while (P.ptr < tl.steps.length && tl.steps[P.ptr]!.t <= P.t) run(tl.steps[P.ptr++]!, P.real);
  }, -20);

  // Tweens, clip returns, camera, crowd wave.
  useFrame((_, dtRaw) => {
    const now = clock.current;
    tweens.current = tweens.current.filter((tw) => {
      const u = Math.min(1, (now - tw.start) / tw.dur);
      const k = ease(tw.ease, u);
      tw.actor.pos = [tw.from.x + (tw.to.x - tw.from.x) * k, tw.from.y + (tw.to.y - tw.from.y) * k, tw.from.z + (tw.to.z - tw.from.z) * k];
      if (u >= 1) { if (tw.actor.clip === tw.clip && clipLoops(tw.clip)) { tw.actor.clip = baseClip.current.get(tw.actor.id) ?? "idle_field"; tw.actor.clipStart = now; } return false; }
      return true;
    });
    for (const a of actors.current) if (!clipLoops(a.clip) && now - a.clipStart > clipDuration(a.clip) + 0.35 && !["react_strikeout", "dugout_sad"].includes(a.clip)) { a.clip = baseClip.current.get(a.id) ?? "idle_field"; a.clipStart = now; }
    const P = play.current;
    const w = wave.current;
    if (w) { const u = (P.real - w.start) / 1.5; crowdUniforms.uWave.value.set(-1.4 + 2.8 * u, u < 1 ? Math.sin(Math.PI * u) : 0); if (u >= 1) wave.current = null; }
    // Camera.
    const c = cam.current;
    const def = SHOT_DEFS[c.shot];
    const dt = Math.min(0.1, dtRaw);
    let pos: THREE.Vector3, tgt: THREE.Vector3;
    if (c.shot === "CAM_BOARD") { tgt = new THREE.Vector3(0, 30, dims.cf + 44); pos = new THREE.Vector3(0, 27, dims.cf - 12); }
    else if (c.shot === "CAM_PITCH") { pos = new THREE.Vector3(-1.1, 2.8, -6.4); tgt = new THREE.Vector3(0, 1.3, 18.4); }
    else if (def.mode === "fixed") { pos = W(def.position); tgt = W(def.target); }
    else if (def.subject === "ball" && ballPos.current) {
      const p = ballPos.current;
      const prev = prevBall.current ?? p.clone().add(new THREE.Vector3(0, 0, -1));
      const dir = p.clone().sub(prev).setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      pos = p.clone().addScaledVector(dir, -def.offset[2] * 3).add(new THREE.Vector3(0, def.offset[1] * 2, 0));
      tgt = p.clone().addScaledVector(dir, 6);
      prevBall.current = p.clone();
    } else if (def.subject === "actor" && c.follow) {
      const a = resolve(c.follow)[0];
      const ap = a ? new THREE.Vector3(...a.pos) : W(def.fallback.target);
      pos = ap.clone().add(new THREE.Vector3(Math.cos(a?.yaw ?? 0) * def.offset[0], def.offset[1] * SCALE, -Math.sin(a?.yaw ?? 0) * def.offset[0]));
      tgt = ap.clone().add(new THREE.Vector3(0, SCALE, 0));
    } else { pos = W(def.fallback.position); tgt = W(def.fallback.target); }
    const follow = def.mode === "follow";
    const k = follow ? 1 - Math.exp(-dt * 10) : 1;
    c.pos.lerp(pos, k);
    c.target.lerp(tgt, k);
    camera.position.copy(c.pos);
    if (P.real < c.shake.until) { const f = (c.shake.until - P.real) / c.shake.dur; camera.position.add(new THREE.Vector3((Math.random() - 0.5) * c.shake.amp * f, (Math.random() - 0.5) * c.shake.amp * f, 0)); }
    camera.lookAt(c.target);
    const pc = camera as THREE.PerspectiveCamera;
    const fov = c.shot === "CAM_BOARD" ? 62 : c.shot === "CAM_PITCH" ? 34 : def.fov;
    if (pc.fov !== fov) { pc.fov = fov; pc.updateProjectionMatrix(); }
  });

  return (
    <>
      <Ticker fps={TARGET_FPS[quality]} clock={clock} timeScale={ts} />
      <hemisphereLight args={["#c7d7ff", "#10301c", 1.05]} />
      <directionalLight position={[30, 80, -40]} intensity={1.6} castShadow={quality === "high"} />
      <fog attach="fog" args={["#0b1224", 220, 640]} />
      <Figures actors={actors} clock={clock} shadows={quality === "high"} />
      <Auras actors={actors} clock={clock} />
      <Ball flight={flight} clock={clock} position={ballPos} />
      <Particles api={fx} clock={clock} />
    </>
  );
}

function StadiumLayer({ state, matchup, quality, board }: { state: GameState; matchup: Matchup; quality: Quality; board: BoardData }) {
  const home = useMemo(() => sideClub(state, matchup.home), [state, matchup.home]);
  const hp = home.player ? home.player.hp / 100 : 1;
  return <Stadium stadium={matchup.homeStadium} quality={quality} crowd={hp} homeColors={home.colors} board={board} propScale={1} />;
}

export default function MatchStage(props: MatchStageProps) {
  const { state, matchup, compact, quality } = props;
  const reel = useMemo(() => buildReel(matchup, { speed: 1, compact }), [matchup, compact]);
  const home = useMemo(() => sideClub(state, matchup.home), [state, matchup.home]);
  const away = useMemo(() => sideClub(state, matchup.away), [state, matchup.away]);
  const [board, setBoardState] = useState<BoardData>({
    inning: 1, half: "T", header: `ROUND ${state.round}`,
    away: { short: away.short, color: away.colors[0], line: [], r: 0, h: 0, e: 0 },
    home: { short: home.short, color: home.colors[0], line: [], r: 0, h: 0, e: 0 },
  });
  const setBoard = (patch: Partial<BoardData> & { scoreAfter?: [number, number] }) => setBoardState((b) => {
    const { scoreAfter, ...rest } = patch;
    const next = { ...b, ...rest };
    if (scoreAfter) { next.away = { ...next.away, r: scoreAfter[0] }; next.home = { ...next.home, r: scoreAfter[1] }; }
    if (rest.message === "") delete next.message;
    return next;
  });
  useEffect(() => {
    startLoop("crowd_ambience");
    return () => { stopLoop("crowd_ambience"); stopLoop("cheer_drum"); };
  }, []);
  return (
    <Canvas frameloop="demand" dpr={quality === "high" ? [1, 2] : [1, 1.5]} shadows={quality === "high"} camera={{ fov: 45, near: 0.3, far: 1600, position: [0, 40, -40] }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <StadiumLayer state={state} matchup={matchup} quality={quality} board={board} />
      <Scene {...props} reel={reel} setBoard={setBoard} />
    </Canvas>
  );
}
