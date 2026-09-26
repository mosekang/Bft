import { create } from "zustand";
import type { Action, GameState } from "@dugout/protocol";
import { waitingOn } from "@dugout/engine";
import { engine, EngineError } from "../engine/client.js";
import { clearCurrentRun, db, loadCurrentRun, saveCurrentRun } from "../db.js";
import { useUi } from "./ui.js";
import { ctx, fictionalPack, pack as activePack, setActivePack } from "../lib/pack.js";
import { PackSchema, type Pack } from "@dugout/protocol";
import type { GhostBoard } from "@dugout/engine";
import { RoomClient, SERVER_URL, createRoom, roomExists, setRoomSettings, type RoomInfo } from "../net/roomClient.js";
import { evaluateAchievements } from "../lib/achievements.js";
import { useSession } from "./session.js";

/** Solo runs use the fixed id "me"; in a room the id is the device player id. */
export let ME = "me";

export interface RoomSession {
  code: string;
  info: RoomInfo | null;
  connected: boolean;
  phaseEndsAt: number | undefined;
  client: RoomClient;
}

export interface DailyInfo {
  date: string;
  seed: string;
  submitted: { score: number; rank: number | null; total: number } | null;
}

interface RunStore {
  state: GameState | null;
  busy: boolean;
  hasSave: boolean;
  room: RoomSession | null;
  /** Set while the current solo run is today's daily challenge. */
  daily: DailyInfo | null;
  startDaily: (nickname: string) => Promise<void>;
  /** Ghost mode: bot boards are replaced by downloaded snapshots each round (§12.1). */
  ghostMode: boolean;
  setGhostMode: (on: boolean) => void;
  packId: string;
  usePack: (id: string) => Promise<void>;
  importPack: (json: unknown) => Promise<string>;
  checkSave: () => Promise<void>;
  newRun: (seed: string, nickname: string) => Promise<void>;
  resume: () => Promise<boolean>;
  abandon: () => Promise<void>;
  dispatch: (action: Action) => Promise<boolean>;
  leave: () => void;
  hostRoom: (playerId: string, nickname: string) => Promise<void>;
  joinRoom: (code: string, playerId: string, nickname: string) => Promise<boolean>;
  leaveRoom: () => void;
  setFillWithBots: (on: boolean) => Promise<void>;
}

function randomSeed(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}

export const useRun = create<RunStore>((set, get) => ({
  state: null,
  busy: false,
  hasSave: false,
  room: null,
  daily: null,
  ghostMode: false,
  setGhostMode: (on) => set({ ghostMode: on }),
  packId: fictionalPack.id,
  async usePack(id) {
    let next: Pack = fictionalPack;
    if (id !== fictionalPack.id) {
      const row = await db.packs.get(id).catch(() => undefined);
      if (row) next = PackSchema.parse(row.json);
    }
    setActivePack(next);
    await engine.init(next);
    set({ packId: next.id });
  },
  async importPack(json) {
    const parsed = PackSchema.parse(json);
    await db.packs.put({ id: parsed.id, json: parsed, name: parsed.name, importedAt: Date.now() });
    return parsed.id;
  },
  async startDaily(nickname) {
    const date = new Date().toISOString().slice(0, 10);
    let seed = `daily:${date}:fictional-v1`;
    try {
      const r = await fetch(`${SERVER_URL}/daily/seed?packId=fictional-v1&date=${date}`);
      if (r.ok) seed = ((await r.json()) as { seed: string }).seed;
    } catch {
      /* offline: the local formula matches the server's */
    }
    set({ daily: { date, seed, submitted: null } });
    await get().newRun(seed, nickname);
  },
  async checkSave() {
    const s = await loadCurrentRun();
    set({ hasSave: !!s && s.phase !== "GAME_OVER" });
  },
  async newRun(seed, nickname) {
    set({ busy: true });
    try {
      await engine.init(activePack);
      const state = await engine.newRun({ seed: seed || randomSeed(), players: [{ id: ME, nickname: nickname || "감독", isBot: false }], createdAt: Date.now() });
      set({ state, hasSave: true });
      await saveCurrentRun(state);
    } finally {
      set({ busy: false });
    }
  },
  async resume() {
    const s = await loadCurrentRun();
    if (!s) return false;
    if (s.packId !== get().packId) await get().usePack(s.packId);
    set({ state: s });
    return true;
  },
  async abandon() {
    await clearCurrentRun();
    set({ state: null, hasSave: false, daily: null });
  },
  async dispatch(action) {
    const { state, room, ghostMode } = get();
    if (room) {
      room.client.send(action);
      return true;
    }
    if (!state) return false;
    set({ busy: true });
    try {
      let base = state;
      if (ghostMode && action.type === "READY" && state.phase === "PREP") base = await withGhosts(state);
      const next = await engine.action(base, ME, action);
      set({ state: next });
      await saveCurrentRun(next);
      if (next.phase === "GAME_OVER") await recordResult(next, get().daily, (d) => set({ daily: d }));
      else if (next.phase === "SETTLE" && useSession.getState().settings.uploadGhost) void uploadGhost(next);
      return true;
    } catch (e) {
      if (e instanceof EngineError) useUi.getState().toast(`toast.${e.code}`);
      else useUi.getState().toast(String((e as Error).message));
      return false;
    } finally {
      set({ busy: false });
    }
  },
  leave() {
    set({ state: null });
    void get().checkSave();
  },
  async hostRoom(playerId, nickname) {
    const code = await createRoom();
    await get().joinRoom(code, playerId, nickname);
  },
  async joinRoom(code, playerId, nickname) {
    const upper = code.toUpperCase();
    if (!(await roomExists(upper))) {
      useUi.getState().toast("toast.ROOM_NOT_FOUND");
      return false;
    }
    ME = playerId;
    const client = new RoomClient(upper, playerId, nickname);
    const session: RoomSession = { code: upper, info: null, connected: false, phaseEndsAt: undefined, client };
    client
      .on("room", (info) => set((s) => (s.room ? { room: { ...s.room, info } } : {})))
      .on("state", (state) => set({ state }))
      .on("phase", (_phase, endsAt) => set((s) => (s.room ? { room: { ...s.room, phaseEndsAt: endsAt } } : {})))
      .on("error", (code, msg) => useUi.getState().toast(`toast.${code}` in {} ? msg : `toast.${code}`))
      .on("connection", (connected) => set((s) => (s.room ? { room: { ...s.room, connected } } : {})))
      .on("emote", (pid, id) => useUi.getState().showEmote(pid, id));
    set({ room: session, state: null });
    client.connect();
    return true;
  },
  leaveRoom() {
    const { room } = get();
    room?.client.close();
    ME = "me";
    set({ room: null, state: null });
    void get().checkSave();
  },
  async setFillWithBots(on) {
    const { room } = get();
    if (room) await setRoomSettings(room.code, { fillWithBots: on });
  },
}));

async function recordResult(state: GameState, daily: DailyInfo | null, setDaily: (d: DailyInfo) => void): Promise<void> {
  const me = state.players.find((p) => p.id === ME);
  if (!me) return;
  try {
    await db.records.add({ seed: state.seed, packId: state.packId, placement: me.placement ?? 8, rounds: state.roundIndex + 1, hp: me.hp, finishedAt: Date.now(), synergies: [], mode: daily ? "daily" : "solo" });
    for (const id of Object.values(state.cards).map((c) => c.defId)) await db.collection.put({ defId: id, seenAt: Date.now() });
    for (const id of evaluateAchievements(state, ME)) if (!(await db.achievements.get(id))) await db.achievements.put({ id, unlockedAt: Date.now() });
  } catch {
    /* ignore */
  }
  if (daily && daily.seed === state.seed) {
    try {
      const { playerId, nickname } = useSession.getState().settings;
      const cards: Record<string, unknown> = {};
      for (const id of Object.values(me.board.slots)) if (id && state.cards[id]) cards[id] = state.cards[id];
      const r = await fetch(`${SERVER_URL}/daily/scores`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: daily.date, playerId, nickname, placement: me.placement ?? 8, rounds: state.roundIndex + 1, hp: me.hp, board: { slots: me.board.slots, cards } }) });
      if (r.ok) {
        const b = (await r.json()) as { score: number; rank: number | null; total: number };
        setDaily({ ...daily, submitted: { score: b.score, rank: b.rank, total: b.total } });
      }
    } catch {
      /* offline: no leaderboard */
    }
  }
}

/** Ghost mode: fetch snapshots for this round and overlay them on the bots (best effort). */
async function withGhosts(state: GameState): Promise<GameState> {
  try {
    const me = state.players.find((p) => p.id === ME)!;
    const band = me.hp <= 25 ? 0 : me.hp <= 50 ? 1 : me.hp <= 75 ? 2 : 3;
    const r = await fetch(`${SERVER_URL}/ghosts?packId=${encodeURIComponent(state.packId)}&stageRound=${state.round}&hpBand=${band}&limit=7`);
    if (!r.ok) return state;
    const body = (await r.json()) as { ghosts: { board: GhostBoard }[] };
    if (body.ghosts.length === 0) return state;
    return await engine.ghosts(state, body.ghosts.map((g) => g.board));
  } catch {
    return state;
  }
}

/** §12.6 ghost upload after each round (best effort). */
async function uploadGhost(state: GameState): Promise<void> {
  const me = state.players.find((p) => p.id === ME);
  if (!me || me.eliminatedAt) return;
  try {
    const cards: Record<string, unknown> = {};
    for (const id of Object.values(me.board.slots)) if (id && state.cards[id]) cards[id] = state.cards[id];
    await fetch(`${SERVER_URL}/ghosts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ packId: state.packId, stageRound: state.round, hp: me.hp, board: { slots: me.board.slots, order: me.board.order, cards, nickname: me.nickname, stadium: me.stadium } }) });
  } catch {
    /* ignore */
  }
}

/** What the human must do now. */
export function useWaiting(): ReturnType<typeof waitingOn> | "NONE" {
  const state = useRun((s) => s.state);
  return state ? waitingOn(state, ME) : "NONE";
}

export const runCtx = ctx;
