import Dexie, { type EntityTable } from "dexie";
import type { GameState } from "@dugout/protocol";

export interface SavedRun {
  id: string; // "current"
  state: GameState;
  updatedAt: number;
}

export interface RunRecord {
  id?: number;
  seed: string;
  packId: string;
  placement: number;
  rounds: number;
  hp: number;
  finishedAt: number;
  synergies: string[];
  mode: "solo" | "daily";
}

export interface CollectionEntry {
  defId: string;
  seenAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface AchievementRow {
  id: string;
  unlockedAt: number;
}

export interface PackRow {
  id: string;
  json: unknown;
  name: string;
  importedAt: number;
}

class DugoutDb extends Dexie {
  runs!: EntityTable<SavedRun, "id">;
  records!: EntityTable<RunRecord, "id">;
  collection!: EntityTable<CollectionEntry, "defId">;
  settings!: EntityTable<SettingRow, "key">;
  achievements!: EntityTable<AchievementRow, "id">;
  packs!: EntityTable<PackRow, "id">;

  constructor() {
    super("dugout-tactics");
    this.version(1).stores({
      runs: "id",
      records: "++id, finishedAt, mode",
      collection: "defId",
      settings: "key",
    });
    this.version(2).stores({
      runs: "id",
      records: "++id, finishedAt, mode",
      collection: "defId",
      settings: "key",
      achievements: "id",
      packs: "id",
    });
  }
}

export const db = new DugoutDb();

export async function saveCurrentRun(state: GameState): Promise<void> {
  try {
    await db.runs.put({ id: "current", state, updatedAt: Date.now() });
  } catch {
    /* storage may be unavailable (private mode); the run continues in memory */
  }
}

export async function loadCurrentRun(): Promise<GameState | null> {
  try {
    const row = await db.runs.get("current");
    return row?.state ?? null;
  } catch {
    return null;
  }
}

export async function clearCurrentRun(): Promise<void> {
  try {
    await db.runs.delete("current");
  } catch {
    /* ignore */
  }
}
