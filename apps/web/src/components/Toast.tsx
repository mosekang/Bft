import { useUi } from "../store/ui.js";

export function Toast() {
  const msg = useUi((s) => s.toastMsg);
  if (!msg) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      <div className="scoreboard rise rounded-full px-4 py-2 text-sm font-medium text-[var(--led)]">{msg}</div>
    </div>
  );
}
