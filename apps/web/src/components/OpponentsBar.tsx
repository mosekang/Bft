import type { GameState } from "@dugout/protocol";
import { ME } from "../store/run.js";

/** Seven rival dugouts: hp ring + name; last opponent highlighted. */
import { EmoteBubble } from "./Emotes.js";

export function OpponentsBar({ state, onPick }: { state: GameState; onPick: (id: string) => void }) {
  const others = state.players.filter((p) => p.id !== ME);
  const last = state.players.find((x) => x.id === ME)?.lastOpponent;
  return (
    <div className="flex justify-between gap-1 px-3 py-1" aria-label="상대 팀">
      {others.map((p) => {
        const out = !!p.eliminatedAt;
        const color = out ? "#4b5563" : p.hp > 50 ? "#34d399" : p.hp > 25 ? "#fbbf24" : "#f87171";
        const r = 14, c = 2 * Math.PI * r;
        return (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} className={`relative flex w-[46px] flex-col items-center rounded-lg ${p.id === last ? "bg-white/10" : ""} ${out ? "opacity-40" : ""}`}>
            <EmoteBubble playerId={p.id} />
            <svg viewBox="0 0 34 34" className="h-7 w-7" aria-hidden>
              <circle cx="17" cy="17" r={r} fill="#0b0f0c" stroke="#26302a" strokeWidth="3" />
              <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${(c * Math.max(0, p.hp)) / 100} ${c}`} strokeLinecap="round" transform="rotate(-90 17 17)" />
              <text x="17" y="21" textAnchor="middle" fontSize="11" fontFamily="Bebas Neue, sans-serif" fill={color}>{out ? "OUT" : p.hp}</text>
            </svg>
            <span className="w-full truncate text-center text-[8px] leading-tight text-[var(--ink-2)]">{p.nickname}</span>
          </button>
        );
      })}
    </div>
  );
}
