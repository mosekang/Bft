import { create } from "zustand";
import type { Location } from "@dugout/protocol";
import { t } from "../i18n/index.js";

interface UiStore {
  /** Tap-to-move: the first tapped location. */
  selected: Location | null;
  /** Card whose detail sheet is open. */
  sheetCard: string | null;
  /** Shop slot whose detail sheet is open. */
  sheetShop: number | null;
  toastMsg: string | null;
  select: (loc: Location | null) => void;
  openCard: (instanceId: string | null) => void;
  openShop: (slot: number | null) => void;
  toast: (keyOrText: string) => void;
  /** Latest emote per player id (§12.1), shown as a bubble for ~2.5 s. */
  emotes: Record<string, { id: number; at: number }>;
  showEmote: (playerId: string, id: number) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUi = create<UiStore>((set) => ({
  selected: null,
  sheetCard: null,
  sheetShop: null,
  toastMsg: null,
  emotes: {},
  showEmote: (playerId, id) => set((s) => ({ emotes: { ...s.emotes, [playerId]: { id, at: Date.now() } } })),
  select: (loc) => set({ selected: loc }),
  openCard: (instanceId) => set({ sheetCard: instanceId, sheetShop: null }),
  openShop: (slot) => set({ sheetShop: slot, sheetCard: null }),
  toast: (keyOrText) => {
    const msg = t(keyOrText);
    set({ toastMsg: msg });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toastMsg: null }), 1800);
  },
}));
