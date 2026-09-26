import type { GameState, Matchup } from "@dugout/protocol";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { reel } from "../lib/commentary.js";
import { ME, useRun } from "../store/run.js";
import { useSession } from "../store/session.js";

function nameOf(state: GameState, id: string): string {
  if (id.startsWith("PVE:")) return id === "PVE:CAMP" ? "훈련팀" : id === "PVE:LEGEND" ? "88년 그 팀" : "올스타";
  if (id.startsWith("GHOST:")) return `${state.players.find((p) => p.id === id.slice(6))?.nickname ?? "?"}(고스트)`;
  return state.players.find((p) => p.id === id)?.nickname ?? id;
}

export function Playback() {
  const state = useRun((s) => s.state)!;
  const dispatch = useRun((s) => s.dispatch);
  const speed = useSession((s) => s.settings.speed);
  const vibration = useSession((s) => s.settings.vibration);
  const [flash, setFlash] = useState(false);
  const mine = state.matchups.filter((m) => m.home === ME || m.away === ME);
  const [gameIdx, setGameIdx] = useState(0);
  const m: Matchup | undefined = mine[gameIdx];
  const homeName = m ? nameOf(state, m.home) : "";
  const awayName = m ? nameOf(state, m.away) : "";
  const lines = useMemo(() => (m ? reel(m, homeName, awayName) : []), [m, homeName, awayName]);
  const [shown, setShown] = useState(speed === 0 ? lines.length : 0);
  useEffect(() => { setShown(speed === 0 ? lines.length : 0); }, [lines, speed]);
  useEffect(() => {
    if (shown >= lines.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), Math.max(250, 1400 / (speed || 1)));
    return () => clearTimeout(id);
  }, [shown, lines.length, speed]);
  useEffect(() => {
    const line = lines[shown - 1];
    if (!line || !m) return;
    const e = m.events[line.idx];
    if (e?.type === "HR" && speed !== 0) {
      const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) { setFlash(true); const id = setTimeout(() => setFlash(false), 500); return () => clearTimeout(id); }
    }
    if (e?.type === "HR" && vibration && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(80);
    return undefined;
  }, [shown, lines, m, speed, vibration]);
  if (!m) return <div className="p-4"><Button onClick={() => void dispatch({ type: "SKIP_PLAYBACK" })}>{t("game.next")}</Button></div>;
  const done = shown >= lines.length;
  const myHome = m.home === ME;
  const myScore = myHome ? m.score[1] : m.score[0];
  const oppScore = myHome ? m.score[0] : m.score[1];
  const result = m.winner === null ? "draw" : m.winner === ME ? "win" : "loss";
  const innings = m.events.at(-1)?.inning ?? 9;
  const lineScore = (side: "T" | "B") => Array.from({ length: innings }, (_, i) => m.events.filter((e) => e.type === "INNING_END" && e.inning === i + 1 && e.half === side).map((e) => e.scoreAfter[side === "T" ? 0 : 1] - (m.events.filter((x) => x.type === "INNING_END" && x.inning < i + 1 && x.half === side).at(-1)?.scoreAfter[side === "T" ? 0 : 1] ?? 0))[0]);
  const others = state.matchups.filter((x) => !mine.includes(x));
  return (
    <div className={`flex h-full flex-col transition-colors duration-300 ${flash ? "bg-amber-400/30" : ""}`}>
      <header className="border-b border-slate-800 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400"><span>S{state.round} · {t(`kind.${m.kind}`) === `kind.${m.kind}` ? m.kind : t(`kind.${m.kind}`)}{m.game ? ` · ${m.game}차전` : ""}</span>{mine.length > 1 && <span>{gameIdx + 1}/{mine.length}</span>}</div>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <div className="truncate text-sm font-bold">{awayName}</div>
          <div className="font-mono text-3xl font-black">{done ? `${m.score[0]} : ${m.score[1]}` : (() => { const e = m.events[lines[Math.max(0, shown - 1)]?.idx ?? 0]; return e ? `${e.scoreAfter[0]} : ${e.scoreAfter[1]}` : "0 : 0"; })()}</div>
          <div className="truncate text-sm font-bold">{homeName}</div>
        </div>
        {done && (
          <table className="mt-2 w-full text-center font-mono text-[10px] text-slate-400"><tbody>
            <tr><td className="text-left">{awayName.slice(0, 4)}</td>{lineScore("T").map((r, i) => <td key={i}>{r ?? "-"}</td>)}<td className="font-bold text-slate-200">{m.score[0]}</td></tr>
            <tr><td className="text-left">{homeName.slice(0, 4)}</td>{lineScore("B").map((r, i) => <td key={i}>{r ?? "X"}</td>)}<td className="font-bold text-slate-200">{m.score[1]}</td></tr>
          </tbody></table>
        )}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {lines.slice(0, shown).map((l) => <div key={l.key} className={`rounded-lg px-3 py-2 text-sm ${l.big ? "bg-amber-900/40 text-amber-100 font-semibold" : "bg-slate-900 text-slate-200"}`}>{l.text}</div>)}
        {done && (
          <div className={`mt-4 rounded-2xl p-4 text-center ${result === "win" ? "bg-emerald-900/50" : result === "loss" ? "bg-rose-900/50" : "bg-slate-800"}`}>
            <div className="text-2xl font-black">{t(`game.${result}`)} {myScore} : {oppScore}</div>
            {m.damage[ME] ? <div className="text-sm text-rose-200">{t("game.damage")} −{m.damage[ME]}</div> : null}
          </div>
        )}
        {done && others.length > 0 && (
          <div className="mt-3 text-xs text-slate-400">
            <div className="mb-1 font-semibold">{t("game.others")}</div>
            {others.map((o, i) => <div key={i} className="flex justify-between font-mono"><span>{nameOf(state, o.away)} @ {nameOf(state, o.home)}</span><span>{o.score[0]} : {o.score[1]}</span></div>)}
          </div>
        )}
      </div>
      <div className="flex gap-2 p-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        {!done && <Button variant="secondary" className="flex-1" onClick={() => setShown(lines.length)}>{t("game.skip")}</Button>}
        {done && gameIdx + 1 < mine.length && <Button className="flex-1" onClick={() => setGameIdx(gameIdx + 1)}>{t("game.next")}</Button>}
        {done && gameIdx + 1 >= mine.length && <Button className="flex-1" onClick={() => void dispatch({ type: "SKIP_PLAYBACK" })}>{t("game.next")}</Button>}
      </div>
    </div>
  );
}
