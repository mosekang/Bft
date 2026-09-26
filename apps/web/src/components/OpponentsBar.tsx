import type { GameState } from "@dugout/protocol";
import { ME } from "../store/run.js";

export function OpponentsBar({ state, onPick }: { state: GameState; onPick: (id: string) => void }) {
  const others = state.players.filter((p) => p.id !== ME);
  return (
    <div className="flex gap-1 overflow-x-auto px-3 py-1" aria-label="상대 팀">
      {others.map((p) => (
        <button key={p.id} type="button" onClick={() => onPick(p.id)} className={`flex min-w-[44px] flex-col items-center rounded-md px-1 py-0.5 text-[10px] ${p.eliminatedAt ? "opacity-40" : ""} ${p.id === state.players.find((x) => x.id === ME)?.lastOpponent ? "bg-slate-800" : ""}`}>
          <span className="max-w-[56px] truncate text-slate-300">{p.nickname}</span>
          <span className={`font-mono font-bold ${p.hp > 50 ? "text-emerald-300" : p.hp > 25 ? "text-amber-300" : "text-rose-300"}`}>{p.eliminatedAt ? "OUT" : p.hp}</span>
        </button>
      ))}
    </div>
  );
}
