import { create } from "zustand";
import { db } from "../db.js";
import type { QualitySetting } from "../scene/quality.js";
import { setHapticsEnabled } from "../audio/index.js";

export interface Settings {
  /** Device id used as the multiplayer player id (§12.5). */
  playerId: string;
  nickname: string;
  speed: 1 | 2 | 0; // 0 = instant
  vibration: boolean;
  coachmarks: boolean;
  uploadGhost: boolean;
  /** 3D quality tier (§15.6): auto-detected unless pinned. */
  quality: QualitySetting;
}

const DEFAULTS: Settings = { playerId: "", nickname: "감독", speed: 1, vibration: true, coachmarks: true, uploadGhost: true, quality: "auto" };

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
    setHapticsEnabled(settings.vibration);
    set({ settings, loaded: true });
  },
  async update(patch) {
    const settings = { ...get().settings, ...patch };
    setHapticsEnabled(settings.vibration);
    set({ settings });
    try {
      await db.settings.put({ key: "settings", value: settings });
    } catch {
      /* ignore */
    }
  },
}));
