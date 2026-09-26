import type { GameState, PlayerState } from "@dugout/protocol";
import { useEffect, useState } from "react";
import { t } from "../i18n/index.js";
import { LEVELS, xpToNext } from "@dugout/engine";

export function Countdown({ endsAt }: { endsAt: number | undefined }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  if (!endsAt) return null;
  const s = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${s <= 5 ? "bg-rose-900 text-rose-100" : "bg-slate-800 text-slate-200"}`} aria-label={t("room.timer")}>{s}s</span>;
}

export function TopBar({ state, me, endsAt }: { state: GameState; me: PlayerState; endsAt?: number | undefined }) {
  const xpNeed = xpToNext(me.level);
  return (
    <header className="flex h-14 items-center gap-3 border-b border-slate-800 px-3 text-sm">
      <div className="font-mono text-base font-bold text-slate-100">S{state.round}</div>
      <Countdown endsAt={endsAt} />
      <div className="flex items-center gap-1 text-amber-300" aria-label={t("run.gold")}>
        <span aria-hidden>●</span>
        <span className="font-mono text-base font-bold">{me.gold}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5" aria-label={`${t("run.fans")} ${me.hp}`}>
        <div className="flex justify-between text-[11px] text-slate-400"><span>{t("run.fans")}</span><span className="font-mono">{me.hp}</span></div>
        <div className="h-2 w-full overflow-hidden rounded bg-slate-800"><div className={`h-full ${me.hp > 50 ? "bg-emerald-400" : me.hp > 25 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${me.hp}%` }} /></div>
      </div>
      <div className="flex flex-col items-end text-[11px] text-slate-400">
        <span className="text-sm font-bold text-slate-100">{t("run.level")}{me.level}</span>
        <span className="font-mono">{me.level >= LEVELS.max ? "MAX" : `${me.xp}/${xpNeed}`}</span>
      </div>
      {(me.winStreak >= 2 || me.loseStreak >= 2) && (
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${me.winStreak >= 2 ? "bg-emerald-900 text-emerald-200" : "bg-rose-900 text-rose-200"}`}>{me.winStreak >= 2 ? `${me.winStreak}${t("run.streakW")}` : `${me.loseStreak}${t("run.streakL")}`}</span>
      )}
    </header>
  );
}
