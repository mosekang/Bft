/** Eight emotes for rooms (§12.1: no chat). Picker + bubble. */
import { useEffect, useState } from "react";
import { juice } from "../audio/index.js";
import { useUi } from "../store/ui.js";

export const EMOTES = ["👏", "😂", "😱", "🔥", "😭", "👍", "⚾", "🙏"] as const;
export const EMOTE_LABELS = ["박수", "웃음", "깜짝", "불타오르네", "눈물", "좋아요", "플레이볼", "제발"] as const;

export function EmotePicker({ onSend }: { onSend: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-label="이모트" className="grid h-9 w-9 place-items-center rounded-lg bg-black/30 text-[18px]" onClick={() => setOpen(!open)}>😀</button>
      {open && (
        <div className="panel pop absolute right-0 top-11 z-40 grid grid-cols-4 gap-1 rounded-xl p-2 shadow-xl">
          {EMOTES.map((e, i) => (
            <button key={e} type="button" aria-label={EMOTE_LABELS[i]} className="grid h-11 w-11 place-items-center rounded-lg bg-white/5 text-[22px] active:scale-95" onClick={() => { onSend(i); juice("button"); setOpen(false); }}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bubble shown next to a player while their emote is fresh. */
export function EmoteBubble({ playerId }: { playerId: string }) {
  const e = useUi((s) => s.emotes[playerId]);
  const [, tick] = useState(0);
  useEffect(() => { if (!e) return; const id = window.setTimeout(() => tick((n) => n + 1), 2600); return () => window.clearTimeout(id); }, [e]);
  if (!e || Date.now() - e.at > 2500) return null;
  return <span key={e.at} className="pop pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-1.5 text-[16px] leading-6 shadow" aria-label={EMOTE_LABELS[e.id]}>{EMOTES[e.id]}</span>;
}
