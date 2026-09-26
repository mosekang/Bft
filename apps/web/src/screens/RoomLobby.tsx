import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { ME, useRun } from "../store/run.js";

export function RoomLobby() {
  const room = useRun((s) => s.room)!;
  const dispatch = useRun((s) => s.dispatch);
  const leaveRoom = useRun((s) => s.leaveRoom);
  const setFill = useRun((s) => s.setFillWithBots);
  const info = room.info;
  const me = info?.players.find((p) => p.id === ME);
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-6">
      <h1 className="display mt-4 text-[28px]">{t("room.title")}</h1>
      <div className="rounded-2xl panel p-4 text-center">
        <div className="text-xs text-[var(--ink-2)]">{t("room.code")}</div>
        <div className="led text-[44px] tracking-[0.3em]">{room.code}</div>
        <div className={`mt-1 text-xs ${room.connected ? "text-emerald-300" : "text-amber-300"}`}>{room.connected ? "" : room.info ? t("room.offline") : t("room.connecting")}</div>
      </div>
      <div className="rounded-2xl panel p-4">
        <div className="mb-2 text-sm font-semibold text-[var(--ink-2)]">{t("room.players")} {info ? `${info.players.length}/8` : ""}</div>
        {info?.players.map((p) => (
          <div key={p.id} className={`flex items-center justify-between py-1 ${p.connected ? "" : "opacity-40"}`}>
            <span>{p.nickname}{p.isHost ? ` · ${t("room.host")}` : ""}{p.id === ME ? " (나)" : ""}</span>
            <span className={`text-xs ${p.ready ? "text-emerald-300" : "text-[var(--ink-3)]"}`}>{p.ready ? t("room.ready") : "…"}</span>
          </div>
        ))}
      </div>
      {me?.isHost && info && (
        <label className="flex items-center justify-between rounded-xl panel px-4 py-3 text-sm">
          {t("room.fill")}
          <input type="checkbox" className="h-5 w-5" checked={info.fillWithBots} onChange={(e) => void setFill(e.target.checked)} />
        </label>
      )}
      <Button className="w-full" disabled={!room.connected} onClick={() => void dispatch({ type: "READY" })}>{me?.ready ? t("room.unready") : t("room.ready")}</Button>
      <div className="text-center text-xs text-[var(--ink-3)]">{t("room.start")}</div>
      <Button variant="ghost" className="mt-auto" onClick={leaveRoom}>{t("room.leave")}</Button>
    </main>
  );
}
