import type { CreateRunOptions, GhostBoard } from "@dugout/engine";
import type { Pack } from "@dugout/protocol";
import type { Action, GameState } from "@dugout/protocol";
import type { WorkerRequest, WorkerResponse } from "./worker.js";

export class EngineError extends Error {
  constructor(public code: string, msg: string) {
    super(msg);
  }
}

type Pending = { resolve: (r: WorkerResponse) => void };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type Req = DistributiveOmit<WorkerRequest, "id">;

/** Promise wrapper over the engine worker. Falls back to in-thread execution when Workers are unavailable (tests). */
class EngineClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private inline: Promise<typeof import("./worker.js")> | null = null;

  private ensure(): void {
    if (this.worker || this.inline) return;
    if (typeof Worker !== "undefined") {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const p = this.pending.get(e.data.id);
        if (p) {
          this.pending.delete(e.data.id);
          p.resolve(e.data);
        }
      };
    } else {
      this.inline = import("./worker.js");
    }
  }

  private async call(req: Req): Promise<WorkerResponse> {
    this.ensure();
    const id = ++this.seq;
    const full = { ...req, id } as WorkerRequest;
    if (this.worker) {
      return new Promise((resolve) => {
        this.pending.set(id, { resolve });
        this.worker!.postMessage(full);
      });
    }
    const mod = await this.inline!;
    return mod.handle(full);
  }

  async newRun(opts: CreateRunOptions): Promise<GameState> {
    const r = await this.call({ type: "newRun", opts });
    if (!r.ok || !r.state) throw new EngineError(r.ok ? "BAD_MESSAGE" : r.error.code, r.ok ? "no state" : r.error.msg);
    return r.state;
  }

  async action(state: GameState, playerId: string, action: Action): Promise<GameState> {
    const r = await this.call({ type: "action", state, playerId, action });
    if (!r.ok) throw new EngineError(r.error.code, r.error.msg);
    if (!r.state) throw new EngineError("BAD_MESSAGE", "no state");
    return r.state;
  }

  async init(pack?: Pack): Promise<void> {
    await this.call({ type: "init", pack });
  }

  async ghosts(state: GameState, ghosts: GhostBoard[]): Promise<GameState> {
    const r = await this.call({ type: "ghosts", state, ghosts });
    if (!r.ok || !r.state) throw new EngineError(r.ok ? "BAD_MESSAGE" : r.error.code, r.ok ? "no state" : r.error.msg);
    return r.state;
  }

  async advance(state: GameState): Promise<GameState> {
    const r = await this.call({ type: "advance", state });
    if (!r.ok || !r.state) throw new EngineError(r.ok ? "BAD_MESSAGE" : r.error.code, r.ok ? "no state" : r.error.msg);
    return r.state;
  }
}

export const engine = new EngineClient();
