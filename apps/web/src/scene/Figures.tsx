/** R3F wrapper around FigureBatch (instanced SD players, DESIGN §15.3). */
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { Actor } from "./actor.js";
import { FigureBatch } from "./figureBatch.js";

export interface FiguresProps {
  actors: React.MutableRefObject<Actor[]>;
  /** Scene clock in seconds (frozen during hit-stop). */
  clock: React.MutableRefObject<number>;
  ghost?: boolean;
  shadows?: boolean;
  outlines?: boolean;
  onActorDown?: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onActorClick?: (id: string, e: ThreeEvent<MouseEvent>) => void;
}

export function Figures({ actors, clock, ghost = false, shadows = false, outlines = true, onActorDown, onActorClick }: FiguresProps) {
  const batch = useMemo(() => new FigureBatch({ ghost, shadows, outlines }), [ghost, shadows, outlines]);
  useEffect(() => () => batch.dispose(), [batch]);
  useFrame(() => batch.update(actors.current, clock.current));
  return (
    <primitive
      object={batch.group}
      onPointerDown={onActorDown ? (e: ThreeEvent<PointerEvent>) => { const id = batch.owner(e.object, e.instanceId); if (id) onActorDown(id, e); } : undefined}
      onClick={onActorClick ? (e: ThreeEvent<MouseEvent>) => { const id = batch.owner(e.object, e.instanceId); if (id) onActorClick(id, e); } : undefined}
    />
  );
}
