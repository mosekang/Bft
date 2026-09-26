import { ServerEnvelopeSchema, applyPatch, type Action, type GameState, type ServerMessage } from "@dugout/protocol";

export const SERVER_URL: string = (import.meta.env["VITE_SERVER_URL"] as string | undefined) ?? "http://127.0.0.1:8787";

export interface RoomInfo {
  roomCode: string;
  players: { id: string; nickname: string; ready: boolean; isHost: boolean; connected: boolean }[];
  packId: string;
  fillWithBots: boolean;
}

export interface RoomEvents {
  room: (info: RoomInfo) => void;
  state: (state: GameState) => void;
  phase: (phase: string, endsAt: number | undefined, round: string) => void;
  error: (code: string, msg: string) => void;
  connection: (connected: boolean) => void;
  emote: (playerId: string, id: number) => void;
}

export async function createRoom(): Promise<string> {
  const r = await fetch(`${SERVER_URL}/rooms`, { method: "POST" });
  if (!r.ok) throw new Error("ROOM_CREATE_FAILED");
  return ((await r.json()) as { code: string }).code;
}

export async function roomExists(code: string): Promise<boolean> {
  const r = await fetch(`${SERVER_URL}/rooms/${code}`);
  return r.ok;
}

export async function setRoomSettings(code: string, settings: { fillWithBots: boolean }): Promise<void> {
  await fetch(`${SERVER_URL}/rooms/${code}/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
}

/** WebSocket client for one room. Reconnects with backoff; re-syncs from SNAPSHOT on JOIN. */
export class RoomClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private state: GameState | null = null;
  private closed = false;
  private retries = 0;
  private handlers: Partial<RoomEvents> = {};

  constructor(private code: string, private playerId: string, private nickname: string) {}

  on<K extends keyof RoomEvents>(k: K, fn: RoomEvents[K]): this {
    this.handlers[k] = fn;
    return this;
  }

  connect(): void {
    this.closed = false;
    const url = `${SERVER_URL.replace(/^http/, "ws")}/rooms/${this.code}/ws?playerId=${encodeURIComponent(this.playerId)}&nickname=${encodeURIComponent(this.nickname)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.retries = 0; this.handlers.connection?.(true); };
    ws.onmessage = (e) => this.onMessage(String(e.data));
    ws.onclose = () => {
      this.handlers.connection?.(false);
      if (this.closed) return;
      const delay = Math.min(8000, 500 * 2 ** this.retries++);
      setTimeout(() => { if (!this.closed) this.connect(); }, delay);
    };
    ws.onerror = () => ws.close();
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  send(action: Action): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ v: 1, seq: ++this.seq, action }));
  }

  private onMessage(raw: string): void {
    const env = ServerEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!env.success) return;
    const m: ServerMessage = env.data.message;
    switch (m.type) {
      case "ROOM_STATE": this.handlers.room?.(m as RoomInfo & { type: "ROOM_STATE" }); break;
      case "SNAPSHOT": this.state = m.state as GameState; this.handlers.state?.(this.state); break;
      case "PATCH":
        if (!this.state) break;
        this.state = applyPatch(this.state, m.ops as Parameters<typeof applyPatch>[1]);
        if (this.state.version !== m.version) {
          // Out of sync: ask for a fresh snapshot by re-joining.
          this.send({ type: "JOIN", roomCode: this.code, playerId: this.playerId, nickname: this.nickname });
        }
        this.handlers.state?.(this.state);
        break;
      case "PHASE": this.handlers.phase?.(m.phase, m.endsAt, m.round); break;
      case "ERROR": this.handlers.error?.(m.code, m.msg); break;
      case "EMOTE": this.handlers.emote?.(m.playerId, m.id); break;
      default: break;
    }
  }
}
