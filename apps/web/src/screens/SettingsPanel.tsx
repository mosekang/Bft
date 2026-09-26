import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { db, type PackRow } from "../db.js";
import { t } from "../i18n/index.js";
import { fictionalPack } from "../lib/pack.js";
import { useRun } from "../store/run.js";
import { useSession } from "../store/session.js";
import { useUi } from "../store/ui.js";
import { isMuted, setMuted } from "../audio/index.js";
import type { QualitySetting } from "../scene/quality.js";

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
  const [muted, setMutedState] = useState(isMuted());
  // Private KBO roster from CSV (§2, §5.6): converted on this device only, never uploaded or committed.
  const onCsv = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const texts = await Promise.all([...files].map((f) => f.text()));
      const isPitchers = (txt: string) => /(^|,)\s*IP\s*(,|$)/m.test(txt.split(/\r?\n/)[0] ?? "");
      const pitchers = texts.find(isPitchers);
      const hitters = texts.find((x) => !isPitchers(x));
      if (!hitters || !pitchers) { useUi.getState().toast("타자 CSV와 투수 CSV를 함께 선택하세요"); return; }
      const { buildPackFromCsv } = await import("@dugout/packs");
      const stamp = new Date().toISOString().slice(0, 10);
      const pack = buildPackFromCsv(hitters, pitchers, { id: `private-${stamp}-${files[0]!.name.replace(/\W+/g, "").slice(0, 12) || "kbo"}`, name: `내 리그 팩 (${stamp})`, defaultNationality: "KR" });
      const id = await importPack(pack);
      refresh();
      useUi.getState().toast(`개인 팩 생성: ${pack.cards.length}명 (${id})`);
    } catch (e) {
      useUi.getState().toast(`CSV 변환 실패: ${e instanceof Error ? e.message.slice(0, 60) : "형식 오류"}`);
    }
  };
  const row = "flex items-center justify-between rounded-xl panel px-4 py-3 text-sm";
  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between p-3"><h1 className="display text-[24px]">{t("lobby.settings")}</h1><Button variant="ghost" onClick={onClose}>{t("card.close")}</Button></header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        <div className={row}>연출 속도<div className="flex gap-1">{([1, 2, 0] as const).map((v) => <button key={v} type="button" onClick={() => void update({ speed: v })} className={`min-h-9 rounded-lg px-3 ${settings.speed === v ? "bg-[var(--ok)] text-[#052e16]" : "bg-white/10"}`}>{v === 0 ? "즉시" : `${v}×`}</button>)}</div></div>
        <div className={row}>3D 품질<div className="flex gap-1">{(["auto", "high", "mid", "low"] as QualitySetting[]).map((v) => <button key={v} type="button" onClick={() => void update({ quality: v })} className={`min-h-9 rounded-lg px-2.5 ${settings.quality === v ? "bg-[var(--ok)] text-[#052e16]" : "bg-white/10"}`}>{{ auto: "자동", high: "높음", mid: "중간", low: "2D" }[v]}</button>)}</div></div>
        <label className={row}>소리<input type="checkbox" className="h-5 w-5" checked={!muted} onChange={(e) => { setMuted(!e.target.checked); setMutedState(!e.target.checked); }} /></label>
        <label className={row}>진동<input type="checkbox" className="h-5 w-5" checked={settings.vibration} onChange={(e) => void update({ vibration: e.target.checked })} /></label>
        <label className={row}>고스트 업로드 (내 보드를 다른 사람의 상대로 제공)<input type="checkbox" className="h-5 w-5" checked={settings.uploadGhost} onChange={(e) => void update({ uploadGhost: e.target.checked })} /></label>
        <label className={row}>고스트전 (봇 대신 다른 사람의 보드와 대결)<input type="checkbox" className="h-5 w-5" checked={ghostMode} onChange={(e) => setGhostMode(e.target.checked)} /></label>
        <label className={row}>코치마크 다시 보기<input type="checkbox" className="h-5 w-5" checked={settings.coachmarks} onChange={(e) => void update({ coachmarks: e.target.checked })} /></label>
        <div className="rounded-xl panel px-4 py-3 text-sm">
          <div className="mb-1 font-semibold">팩 관리</div>
          <div className="text-xs text-[var(--ink-2)]">실명 선수 팩은 이 기기에만 저장됩니다. <code>pnpm pack:build</code>로 만든 JSON을 가져오세요.</div>
          <div className="mt-2 flex flex-col gap-1">
            {[{ id: fictionalPack.id, name: fictionalPack.name }, ...packs].map((p) => (
              <button key={p.id} type="button" onClick={() => void usePack(p.id)} className={`flex min-h-10 items-center justify-between rounded-lg px-3 text-left ${packId === p.id ? "bg-emerald-900/50 text-emerald-100" : "bg-white/10"}`}><span>{p.name} <span className="text-xs text-[var(--ink-2)]">{p.id}</span></span>{packId === p.id && <span className="text-xs">사용 중</span>}</button>
            ))}
          </div>
          <input type="file" accept="application/json,.json" className="mt-2 text-xs" onChange={(e) => void onFile(e.target.files?.[0])} />
          <div className="mt-3 font-semibold">CSV로 내 리그 만들기</div>
          <div className="text-xs text-[var(--ink-2)]">스탯 사이트에서 받은 타자·투수 CSV 두 개를 함께 고르면 이 기기에서 바로 카드 팩으로 변환합니다(서버 업로드 없음). 타자 열: name, team, bats, throws, pos, age, PA, AVG, OBP, SLG, BB%, K%, HR, ISO, BABIP, GB%, SB, CS, DEF · 투수 열: name, team, throws, role, age, IP, K%, BB%, HR9, GB%, ERA, FIP, PIT/GS</div>
          <input type="file" multiple accept="text/csv,.csv" aria-label="CSV 가져오기" className="mt-2 text-xs" onChange={(e) => void onCsv(e.target.files)} />
        </div>
        <div className="rounded-xl panel px-4 py-3 text-xs text-[var(--ink-2)]">기기 ID: <span className="font-mono">{settings.playerId}</span></div>
      </div>
    </main>
  );
}
