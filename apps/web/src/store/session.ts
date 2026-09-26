import { create } from "zustand";
import { db } from "../db.js";

export interface Settings {
  /** Device id used as the multiplayer player id (§12.5). */
  playerId: string;
  nickname: string;
  speed: 1 | 2 | 0; // 0 = instant
  vibration: boolean;
  coachmarks: boolean;
  uploadGhost: boolean;
}

const DEFAULTS: Settings = { playerId: "", nickname: "감독", speed: 1, vibration: false, coachmarks: true, uploadGhost: true };

function newPlayerId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `u${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

interface SessionStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSession = create<SessionStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  async load() {
    let settings: Settings = DEFAULTS;
    try {
      const row = await db.settings.get("settings");
      settings = { ...DEFAULTS, ...((row?.value as Partial<Settings>) ?? {}) };
    } catch {
      /* fall through */
    }
    if (!settings.playerId) {
      settings = { ...settings, playerId: newPlayerId() };
      try { await db.settings.put({ key: "settings", value: settings }); } catch { /* ignore */ }
    }
    set({ settings, loaded: true });
  },
  async update(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    try {
      await db.settings.put({ key: "settings", value: settings });
    } catch {
      /* ignore */
    }
  },
}));
