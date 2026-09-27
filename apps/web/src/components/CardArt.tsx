/** Card illustration: the 3D-rendered bust when ready, the SVG portrait otherwise. */
import type { CardDef } from "@dugout/protocol";
import { useEffect, useState } from "react";
import { Avatar } from "../lib/avatar.js";

type Portraits = typeof import("../scene/portraits.js");
let mod: Portraits | null = null;
let loading: Promise<Portraits> | null = null;
const load = () => (loading ??= import("../scene/portraits.js").then((m) => (mod = m)));

export function CardArt({ def, size, className = "", fill = false }: { def: CardDef; size: number; className?: string; fill?: boolean }) {
  const [url, setUrl] = useState<string | null>(() => mod?.cardArt(def) ?? null);
  useEffect(() => {
    let off: (() => void) | undefined;
    let live = true;
    void load().then((m) => {
      if (!live) return;
      setUrl(m.cardArt(def));
      off = m.onCardArt(def.id, (u) => { if (live) setUrl(u); });
    });
    return () => { live = false; off?.(); };
  }, [def]);
  if (!url) return <Avatar def={def} size={size} className={className} />;
  return <img src={url} alt="" draggable={false} className={`pointer-events-none select-none object-cover object-top ${className}`} style={fill ? undefined : { width: size, height: size }} />;
}

/** Start rendering a pack's illustrations in the background. */
export function prewarmArt(defs: readonly CardDef[]): void {
  void load().then((m) => m.prewarmCardArt(defs));
}
