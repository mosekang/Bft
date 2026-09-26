import { ENGINE_VERSION, buildSchedule } from "@dugout/engine";

/**
 * Phase 0 placeholder shell. Real screens (Lobby, Run, Game, Result) arrive in Phase 3.
 * Kept minimal on purpose: it only proves the web app can import the engine and build as a PWA.
 */
export function App() {
  const rounds = buildSchedule().length;
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">덕아웃 택틱스</h1>
      <p className="text-slate-400">TFT 룰로 하는 야구 오토배틀러</p>
      <p className="text-sm text-slate-500">
        engine v{ENGINE_VERSION} · {rounds} rounds / run
      </p>
      <button
        type="button"
        className="mt-4 min-h-11 rounded-xl bg-emerald-500 px-6 font-semibold text-slate-950 active:bg-emerald-400"
        disabled
      >
        새 게임 (Phase 3)
      </button>
    </main>
  );
}
