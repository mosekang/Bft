import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { db, type RunRecord } from "../db.js";
import { t } from "../i18n/index.js";
import { SERVER_URL } from "../net/roomClient.js";
import { useSession } from "../store/session.js";

interface Leaderboard { date: string; top: { rank: number; nickname: string; score: number; placement: number }[]; me: { rank: number; total: number; score: number } | null }

export function Records({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const playerId = useSession((s) => s.settings.playerId);
  useEffect(() => {
    void db.records.orderBy("finishedAt").reverse().limit(30).toArray().then(setRecords).catch(() => undefined);
    void fetch(`${SERVER_URL}/daily/leaderboard?playerId=${encodeURIComponent(playerId)}`).then((r) => (r.ok ? r.json() : null)).then((b) => setLb(b as Leaderboard | null)).catch(() => setLb(null));
  }, [playerId]);
  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between p-3"><h1 className="display text-[24px]">{t("lobby.records")}</h1><Button variant="ghost" onClick={onClose}>{t("card.close")}</Button></header>
      <div className="flex-1 overflow-y-auto p-3">
        <section className="mb-4 rounded-xl panel p-3">
          <div className="mb-1 font-semibold">{t("lobby.daily")} {lb ? lb.date : ""}</div>
          {!lb && <div className="text-sm text-[var(--ink-3)]">서버에 연결되지 않아 리더보드를 불러올 수 없습니다.</div>}
          {lb && lb.me && <div className="mb-2 text-sm text-emerald-300">내 순위 {lb.me.rank}/{lb.me.total} · {lb.me.score}점</div>}
          {lb && lb.top.slice(0, 20).map((r) => <div key={r.rank} className="flex justify-between text-sm text-[var(--ink-2)]"><span>{r.rank}. {r.nickname}</span><span className="font-mono">{r.score}</span></div>)}
          {lb && lb.top.length === 0 && <div className="text-sm text-[var(--ink-3)]">오늘 첫 도전자가 되어 보세요.</div>}
        </section>
        <section className="rounded-xl panel p-3">
          <div className="mb-1 font-semibold">최근 판</div>
          {records.length === 0 && <div className="text-sm text-[var(--ink-3)]">아직 기록이 없습니다.</div>}
          {records.map((r) => <div key={r.id} className="flex justify-between border-b border-slate-800 py-1 text-sm"><span>{r.placement}위 · {r.rounds}R · {r.mode === "daily" ? "일일" : "솔로"}</span><span className="font-mono text-[var(--ink-3)]">{new Date(r.finishedAt).toLocaleDateString()}</span></div>)}
        </section>
      </div>
    </main>
  );
}
