import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { t } from "../i18n/index.js";
import { useRun } from "../store/run.js";
import { useSession } from "../store/session.js";
import { Codex } from "./Codex.js";
import { Records } from "./Records.js";
import { SettingsPanel } from "./SettingsPanel.js";

export function Lobby() {
  const { hasSave, checkSave, newRun, resume, abandon, busy, hostRoom, joinRoom, startDaily } = useRun();
  const [panel, setPanel] = useState<"codex" | "records" | "settings" | null>(null);
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.update);
  const [nick, setNick] = useState(settings.nickname);
  const [code, setCode] = useState("");
  useEffect(() => { void checkSave(); }, [checkSave]);
  useEffect(() => setNick(settings.nickname), [settings.nickname]);
  if (panel === "codex") return <Codex onClose={() => setPanel(null)} />;
  if (panel === "records") return <Records onClose={() => setPanel(null)} />;
  if (panel === "settings") return <SettingsPanel onClose={() => setPanel(null)} />;
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-6">
      <div className="mt-8 text-center">
        <h1 className="text-3xl font-black tracking-tight">{t("app.title")}</h1>
        <p className="mt-1 text-slate-400">{t("app.tagline")}</p>
      </div>
      <label className="mt-4 flex flex-col gap-1 text-sm text-slate-300">
        닉네임
        <input value={nick} maxLength={10} onChange={(e) => setNick(e.target.value)} onBlur={() => void update({ nickname: nick.trim() || "감독" })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-base text-slate-100" />
      </label>
      {hasSave && <Button className="w-full" disabled={busy} onClick={() => void resume()}>{t("lobby.continue")}</Button>}
      <Button className="w-full" variant={hasSave ? "secondary" : "primary"} disabled={busy} onClick={() => void newRun("", nick.trim() || "감독")}>{busy ? "…" : t("lobby.new")}</Button>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void hostRoom(settings.playerId, nick.trim() || "감독")}>{t("lobby.host")}</Button>
        <div className="flex gap-1">
          <input value={code} maxLength={6} placeholder={t("lobby.code")} onChange={(e) => setCode(e.target.value.toUpperCase())} className="min-h-11 w-28 rounded-xl border border-slate-700 bg-slate-900 px-2 font-mono text-base uppercase text-slate-100" />
          <Button variant="secondary" disabled={busy || code.length !== 6} onClick={() => void joinRoom(code, settings.playerId, nick.trim() || "감독")}>{t("lobby.join")}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => void startDaily(nick.trim() || "감독")}>{t("lobby.daily")}</Button>
        <Button variant="ghost" onClick={() => setPanel("codex")}>{t("lobby.codex")}</Button>
        <Button variant="ghost" onClick={() => setPanel("records")}>{t("lobby.records")}</Button>
        <Button variant="ghost" onClick={() => setPanel("settings")}>{t("lobby.settings")}</Button>
      </div>
      {hasSave && <button type="button" className="mt-6 text-xs text-slate-500 underline" onClick={() => void abandon()}>{t("lobby.abandon")}</button>}
    </main>
  );
}
