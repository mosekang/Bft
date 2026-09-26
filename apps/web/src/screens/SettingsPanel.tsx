import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { db, type PackRow } from "../db.js";
import { t } from "../i18n/index.js";
import { fictionalPack } from "../lib/pack.js";
import { useRun } from "../store/run.js";
import { useSession } from "../store/session.js";
import { useUi } from "../store/ui.js";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.update);
  const { ghostMode, setGhostMode, packId, usePack, importPack } = useRun();
  const [packs, setPacks] = useState<PackRow[]>([]);
  const refresh = () => void db.packs.toArray().then(setPacks).catch(() => undefined);
  useEffect(refresh, []);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const id = await importPack(JSON.parse(await file.text()));
      refresh();
      useUi.getState().toast(`팩 가져옴: ${id}`);
    } catch {
      useUi.getState().toast("팩 파일이 올바르지 않습니다");
    }
  };
  const row = "flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-sm";
  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between p-3"><h1 className="text-xl font-bold">{t("lobby.settings")}</h1><Button variant="ghost" onClick={onClose}>{t("card.close")}</Button></header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        <div className={row}>연출 속도<div className="flex gap-1">{([1, 2, 0] as const).map((v) => <button key={v} type="button" onClick={() => void update({ speed: v })} className={`min-h-9 rounded-lg px-3 ${settings.speed === v ? "bg-emerald-500 text-slate-950" : "bg-slate-800"}`}>{v === 0 ? "즉시" : `${v}×`}</button>)}</div></div>
        <label className={row}>진동<input type="checkbox" className="h-5 w-5" checked={settings.vibration} onChange={(e) => void update({ vibration: e.target.checked })} /></label>
        <label className={row}>고스트 업로드 (내 보드를 다른 사람의 상대로 제공)<input type="checkbox" className="h-5 w-5" checked={settings.uploadGhost} onChange={(e) => void update({ uploadGhost: e.target.checked })} /></label>
        <label className={row}>고스트전 (봇 대신 다른 사람의 보드와 대결)<input type="checkbox" className="h-5 w-5" checked={ghostMode} onChange={(e) => setGhostMode(e.target.checked)} /></label>
        <label className={row}>코치마크 다시 보기<input type="checkbox" className="h-5 w-5" checked={settings.coachmarks} onChange={(e) => void update({ coachmarks: e.target.checked })} /></label>
        <div className="rounded-xl bg-slate-900 px-4 py-3 text-sm">
          <div className="mb-1 font-semibold">팩 관리</div>
          <div className="text-xs text-slate-400">실명 선수 팩은 이 기기에만 저장됩니다. <code>pnpm pack:build</code>로 만든 JSON을 가져오세요.</div>
          <div className="mt-2 flex flex-col gap-1">
            {[{ id: fictionalPack.id, name: fictionalPack.name }, ...packs].map((p) => (
              <button key={p.id} type="button" onClick={() => void usePack(p.id)} className={`flex min-h-10 items-center justify-between rounded-lg px-3 text-left ${packId === p.id ? "bg-emerald-900/50 text-emerald-100" : "bg-slate-800"}`}><span>{p.name} <span className="text-xs text-slate-400">{p.id}</span></span>{packId === p.id && <span className="text-xs">사용 중</span>}</button>
            ))}
          </div>
          <input type="file" accept="application/json,.json" className="mt-2 text-xs" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <div className="rounded-xl bg-slate-900 px-4 py-3 text-xs text-slate-400">기기 ID: <span className="font-mono">{settings.playerId}</span></div>
      </div>
    </main>
  );
}
