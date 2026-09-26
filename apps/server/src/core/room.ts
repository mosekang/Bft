import {
  advance,
  applyAction,
  bots,
  createContext,
  createRun,
  currentWave,
  waitingOn,
  type RunContext,
} from "@dugout/engine";
import { ClientMessageSchema, PROTOCOL_VERSION, type Action, type ErrorCode, type GameState, type Pack, type ServerMessage, type StadiumId } from "@dugout/protocol";
import { SCHEDULE } from "@dugout/engine";
import { diff } from "./patch.js";

// ---------------------------------------------------------------------------
// Platform ports (implemented by adapters)
// ---------------------------------------------------------------------------

export interface Socket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface RoomPorts {
  /** Persist room state between events (DO storage / memory). */
  save(snapshot: RoomSnapshot): Promise<void> | void;
  /** Schedule `onAlarm` at epoch ms (only the latest alarm is kept). */
  setAlarm(at: number | null): Promise<void> | void;
  now(): number;
  /** Called when the room should be destroyed (no humans left). */
  onClose?(): void;
}

export interface RoomMember {
  playerId: string;
  nickname: string;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
  lastActionAt: number;
  idleRounds: number;
  /** Actions in the current second, for rate limiting. */
  rateWindow: { second: number; count: number };
}

export interface RoomSnapshot {
  code: string;
  members: RoomMember[];
  state: GameState | null;
  fillWithBots: boolean;
  packId: string;
  pack: Pack | null;
  /** Round index the current phase timer belongs to; used by onAlarm to ignore stale alarms. */
  timer: { phase: string; endsAt: number; roundIndex: number; version: number } | null;
  createdAt: number;
  closeAt: number | null;
}

export const ROOM_LIMITS = { maxPlayers: 8, minPlayers: 1, actionsPerSecond: 10, idleRoundsBeforeBot: 2, closeAfterEmptyMs: 30_000, packMaxBytes: 200 * 1024 } as const;

const TIMERS_MS = {
  prepS1: SCHEDULE.timers.prepS1 * 1000,
  prep: SCHEDULE.timers.prep * 1000,
  carouselWave: SCHEDULE.timers.carouselWave * 1000,
  augment: SCHEDULE.timers.augment * 1000,
  playback: SCHEDULE.timers.playback * 1000,
  settle: SCHEDULE.timers.settle * 1000,
  stadium: 30_000,
  event: 30_000,
} as const;

export function roomCode(rng: () => number): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
  return s;
}

// ---------------------------------------------------------------------------
// Room core
// ---------------------------------------------------------------------------

/**
 * One friend room (§12). Platform-independent: the adapter feeds it
 * sockets, messages and alarms; it keeps the single source of truth and
 * broadcasts snapshots/patches.
 */
export class RoomCore {
  snap: RoomSnapshot;
  private ctx: RunContext;
  private sockets = new Map<string, Socket>();
  private seq = 0;
  /** Last state each socket has seen, for patching. */
  private lastSent = new Map<string, GameState | null>();

  constructor(private ports: RoomPorts, snapshot: RoomSnapshot, defaultPack: Pack) {
    this.snap = snapshot;
    this.ctx = createContext(snapshot.pack ?? defaultPack);
  }

  static fresh(code: string, defaultPack: Pack, now: number): RoomSnapshot {
    return { code, members: [], state: null, fillWithBots: true, packId: defaultPack.id, pack: null, timer: null, createdAt: now, closeAt: null };
  }

  // --- connections --------------------------------------------------------------

  attach(playerId: string, socket: Socket): void {
    this.sockets.set(playerId, socket);
  }

  detach(playerId: string): void {
    this.sockets.delete(playerId);
    this.lastSent.delete(playerId);
    const m = this.snap.members.find((x) => x.playerId === playerId);
    if (m) m.connected = false;
    this.transferHostIfNeeded();
    this.scheduleCloseIfEmpty();
    this.broadcastRoom();
    void this.ports.save(this.snap);
  }

  private transferHostIfNeeded(): void {
    if (this.snap.members.some((m) => m.isHost && m.connected)) return;
    const next = this.snap.members.find((m) => m.connected);
    for (const m of this.snap.members) m.isHost = m === next;
  }

  private scheduleCloseIfEmpty(): void {
    const anyHuman = this.snap.members.some((m) => m.connected);
    if (anyHuman) {
      this.snap.closeAt = null;
      return;
    }
    this.snap.closeAt = this.ports.now() + ROOM_LIMITS.closeAfterEmptyMs;
    void this.ports.setAlarm(Math.min(this.snap.closeAt, this.snap.timer?.endsAt ?? Number.POSITIVE_INFINITY));
  }

  // --- inbound -----------------------------------------------------------------------

  /** Handle a raw text message from `playerId`'s socket. */
  handle(playerId: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.error(playerId, "BAD_MESSAGE", "invalid json");
    }
    const msg = ClientMessageSchema.safeParse(parsed);
    if (!msg.success) return this.error(playerId, "BAD_MESSAGE", "schema");
    if (!this.rateOk(playerId)) return this.error(playerId, "RATE_LIMITED", "slow down");
    this.onAction(playerId, msg.data.action);
  }

  private rateOk(playerId: string): boolean {
    const m = this.snap.members.find((x) => x.playerId === playerId);
    if (!m) return true;
    const second = Math.floor(this.ports.now() / 1000);
    if (m.rateWindow.second !== second) m.rateWindow = { second, count: 0 };
    m.rateWindow.count++;
    return m.rateWindow.count <= ROOM_LIMITS.actionsPerSecond;
  }

  onAction(playerId: string, action: Action): void {
    const now = this.ports.now();
    if (action.type === "PING") return this.send(playerId, { type: "PONG" });
    if (action.type === "JOIN") return this.join(playerId, action.nickname);
    const member = this.snap.members.find((m) => m.playerId === playerId);
    if (!member) return this.error(playerId, "ROOM_NOT_FOUND", "join first");
    member.lastActionAt = now;

    if (!this.snap.state) {
      // Lobby: READY toggles readiness; the host's READY with everyone ready starts the run.
      if (action.type === "READY") {
        member.ready = !member.ready;
        const everyoneReady = this.snap.members.every((m) => m.ready || !m.connected) && this.snap.members.some((m) => m.isHost && m.ready);
        if (everyoneReady) this.start();
        else this.broadcastRoom();
        return void this.ports.save(this.snap);
      }
      if (action.type === "EMOTE") return this.broadcast({ type: "EMOTE", playerId, id: action.id });
      return this.error(playerId, "BAD_PHASE", "game not started");
    }

    // Emotes never touch game state: relay them to everyone (sender included).
    if (action.type === "EMOTE") return this.broadcast({ type: "EMOTE", playerId, id: action.id });
    const before = this.snap.state;
    const r = applyAction(before, playerId, action, this.ctx);
    if (!r.ok) return this.error(playerId, r.code, r.msg);
    this.setState(advance(r.value, this.ctx, bots));
  }

  private join(playerId: string, nickname: string): void {
    let m = this.snap.members.find((x) => x.playerId === playerId);
    if (!m) {
      if (this.snap.state) {
        // Rejoin only for players already in the game.
        if (!this.snap.state.players.some((p) => p.id === playerId)) return this.error(playerId, "ROOM_FULL", "game in progress");
      } else if (this.snap.members.length >= ROOM_LIMITS.maxPlayers) return this.error(playerId, "ROOM_FULL", "room is full");
      m = { playerId, nickname, ready: false, isHost: this.snap.members.length === 0, connected: true, lastActionAt: this.ports.now(), idleRounds: 0, rateWindow: { second: 0, count: 0 } };
      this.snap.members.push(m);
    } else {
      m.connected = true;
      m.nickname = nickname || m.nickname;
      // Returning human takes control back from the bot substitute.
      if (this.snap.state) {
        const p = this.snap.state.players.find((x) => x.id === playerId);
        if (p?.isBot) this.snap.state = { ...this.snap.state, players: this.snap.state.players.map((x) => (x.id === playerId ? { ...x, isBot: false } : x)) };
      }
    }
    this.snap.closeAt = null;
    this.transferHostIfNeeded();
    if (this.snap.state) {
      this.lastSent.set(playerId, null);
      this.send(playerId, { type: "SNAPSHOT", state: this.snap.state, version: this.snap.state.version });
      this.lastSent.set(playerId, this.snap.state);
      this.send(playerId, { type: "PHASE", phase: this.snap.state.phase, round: this.snap.state.round, endsAt: this.snap.timer?.endsAt });
    }
    this.broadcastRoom();
    void this.ports.save(this.snap);
  }

  setPack(pack: Pack): boolean {
    if (this.snap.state) return false;
    this.snap.pack = pack;
    this.snap.packId = pack.id;
    this.ctx = createContext(pack);
    this.broadcastRoom();
    void this.ports.save(this.snap);
    return true;
  }

  setFillWithBots(on: boolean): void {
    this.snap.fillWithBots = on;
    this.broadcastRoom();
  }

  // --- game flow -------------------------------------------------------------------------

  private start(): void {
    const humans = this.snap.members.filter((m) => m.connected);
    if (humans.length < ROOM_LIMITS.minPlayers) return;
    const seed = `${this.snap.code}-${this.ports.now().toString(36)}`;
    const state = createRun(this.ctx, { seed, players: humans.map((m) => ({ id: m.playerId, nickname: m.nickname, isBot: false })), fillWithBots: this.snap.fillWithBots || humans.length < 2, createdAt: this.ports.now() });
    for (const m of this.snap.members) m.ready = false;
    this.setState(advance(state, this.ctx, bots), true);
  }

  /** Commit a new state: broadcast, (re)arm the phase timer, persist. */
  private setState(next: GameState, forceSnapshot = false): void {
    const prev = this.snap.state;
    this.snap.state = next;
    for (const [pid] of this.sockets) {
      const last = this.lastSent.get(pid) ?? null;
      if (forceSnapshot || !last || !prev) this.send(pid, { type: "SNAPSHOT", state: next, version: next.version });
      else {
        const ops = diff(last, next);
        if (ops.length > 0) this.send(pid, { type: "PATCH", ops, version: next.version });
      }
      this.lastSent.set(pid, next);
    }
    if (!prev || prev.phase !== next.phase || prev.roundIndex !== next.roundIndex || (next.phase === "CAROUSEL" && prev.carousel?.waveStart !== next.carousel?.waveStart)) this.armTimer(next);
    if (next.phase === "PLAYBACK" && prev?.phase !== "PLAYBACK") {
      this.broadcast({ type: "RESULT", matchups: next.matchups });
      for (const p of next.players) if (p.eliminatedAt === next.round && !p.isBot) this.broadcast({ type: "ELIMINATED", playerId: p.id, placement: p.placement ?? 8 });
    }
    if (next.phase === "GAME_OVER" && prev?.phase !== "GAME_OVER") {
      this.broadcast({ type: "GAME_OVER", placements: next.players.map((p) => ({ playerId: p.id, placement: p.placement ?? 8 })) });
      this.snap.timer = null;
      void this.ports.setAlarm(null);
    }
    void this.ports.save(this.snap);
  }

  private armTimer(state: GameState): void {
    const stage = Number(state.round.split("-")[0]);
    let ms: number | null = null;
    switch (state.phase) {
      case "STADIUM": ms = TIMERS_MS.stadium; break;
      case "AUGMENT": ms = TIMERS_MS.augment; break;
      case "CAROUSEL": ms = TIMERS_MS.carouselWave; break;
      case "EVENT": ms = TIMERS_MS.event; break;
      case "PREP": ms = stage === 1 ? TIMERS_MS.prepS1 : TIMERS_MS.prep; break;
      case "PLAYBACK": ms = TIMERS_MS.playback; break;
      case "SETTLE": ms = TIMERS_MS.settle; break;
      default: ms = null;
    }
    if (ms === null) {
      this.snap.timer = null;
      void this.ports.setAlarm(this.snap.closeAt);
      return;
    }
    const endsAt = this.ports.now() + ms;
    this.snap.timer = { phase: state.phase, endsAt, roundIndex: state.roundIndex, version: state.version };
    this.broadcast({ type: "PHASE", phase: state.phase, round: state.round, endsAt });
    void this.ports.setAlarm(Math.min(endsAt, this.snap.closeAt ?? Number.POSITIVE_INFINITY));
  }

  /** Timer fired: auto-resolve every human who has not acted (§12.4), or close an empty room. */
  onAlarm(): void {
    const now = this.ports.now();
    if (this.snap.closeAt !== null && now >= this.snap.closeAt && !this.snap.members.some((m) => m.connected)) {
      this.ports.onClose?.();
      return;
    }
    const t = this.snap.timer;
    const state = this.snap.state;
    if (!t || !state || now < t.endsAt - 5) {
      if (t) void this.ports.setAlarm(Math.min(t.endsAt, this.snap.closeAt ?? Number.POSITIVE_INFINITY));
      return;
    }
    if (t.roundIndex !== state.roundIndex || t.phase !== state.phase) return; // stale
    let s = state;
    const humans = s.players.filter((p) => !p.isBot && p.eliminatedAt === undefined);
    for (const p of humans) {
      const need = waitingOn(s, p.id);
      let action: Action | null = null;
      switch (need) {
        case "STADIUM": action = { type: "PICK_STADIUM", id: "DOME" as StadiumId }; break;
        case "AUGMENT": action = { type: "PICK_AUGMENT", idx: 0 }; break;
        case "CAROUSEL": {
          const c = s.carousel!;
          if (currentWave(c).includes(p.id)) action = { type: "PICK_CAROUSEL", idx: c.taken.findIndex((x) => x === null) };
          break;
        }
        case "CHOICE": action = { type: "PICK_CHOICE", idx: 0 }; break;
        case "EVENT":
        case "PREP":
        case "SETTLE": action = { type: "READY" }; break;
        case "PLAYBACK": action = { type: "SKIP_PLAYBACK" }; break;
        default: action = null;
      }
      if (!action) continue;
      const r = applyAction(s, p.id, action, this.ctx);
      if (r.ok) s = r.value;
      // Idle tracking: a timed-out PREP counts as an idle round (§12.5).
      if (need === "PREP") {
        const m = this.snap.members.find((x) => x.playerId === p.id);
        if (m) {
          m.idleRounds++;
          if (m.idleRounds >= ROOM_LIMITS.idleRoundsBeforeBot || !m.connected) s = { ...s, players: s.players.map((x) => (x.id === p.id ? { ...x, isBot: true, archetype: x.archetype ?? "ECON" } : x)) };
        }
      }
    }
    // Humans who acted in time reset their idle counter.
    for (const m of this.snap.members) if (m.lastActionAt > t.endsAt - (TIMERS_MS.prep + 1000)) m.idleRounds = 0;
    this.setState(advance(s, this.ctx, bots));
    // If nothing changed (e.g. waiting on a bot-less state), re-arm to avoid a dead room.
    if (this.snap.state === state) this.armTimer(state);
  }

  // --- outbound ---------------------------------------------------------------------------

  roomState(): ServerMessage {
    return { type: "ROOM_STATE", roomCode: this.snap.code, players: this.snap.members.map((m) => ({ id: m.playerId, nickname: m.nickname, ready: m.ready, isHost: m.isHost, connected: m.connected })), packId: this.snap.packId, fillWithBots: this.snap.fillWithBots };
  }

  private broadcastRoom(): void {
    this.broadcast(this.roomState());
  }

  private envelope(message: ServerMessage): string {
    return JSON.stringify({ v: PROTOCOL_VERSION, seq: ++this.seq, message });
  }

  send(playerId: string, message: ServerMessage): void {
    const s = this.sockets.get(playerId);
    if (!s) return;
    try {
      s.send(this.envelope(message));
    } catch {
      this.detach(playerId);
    }
  }

  broadcast(message: ServerMessage): void {
    const data = this.envelope(message);
    for (const [pid, s] of this.sockets) {
      try {
        s.send(data);
      } catch {
        this.detach(pid);
      }
    }
  }

  private error(playerId: string, code: ErrorCode, msg: string): void {
    this.send(playerId, { type: "ERROR", code, msg });
  }
}
