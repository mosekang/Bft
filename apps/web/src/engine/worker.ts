/// <reference lib="webworker" />
import { advance, applyAction, applyGhosts, bots, createContext, createRun, setAssertions, type CreateRunOptions, type GhostBoard } from "@dugout/engine";
import { PackSchema, type Action, type GameState, type Pack } from "@dugout/protocol";
import fictional from "@dugout/packs/fictional-v1.json";

export type WorkerRequest =
  | { id: number; type: "init"; pack?: Pack }
  | { id: number; type: "newRun"; opts: CreateRunOptions }
  | { id: number; type: "action"; state: GameState; playerId: string; action: Action }
  | { id: number; type: "advance"; state: GameState }
  | { id: number; type: "ghosts"; state: GameState; ghosts: GhostBoard[] };

export type WorkerResponse =
  | { id: number; ok: true; state: GameState; error?: undefined }
  | { id: number; ok: false; error: { code: string; msg: string } }
  | { id: number; ok: true; ready: true; packId: string; state?: undefined };

let ctx = createContext(PackSchema.parse(fictional));
if (import.meta.env.DEV) setAssertions(true);

export function handle(req: WorkerRequest): WorkerResponse {
  switch (req.type) {
    case "init":
      if (req.pack) ctx = createContext(req.pack);
      return { id: req.id, ok: true, ready: true, packId: ctx.pack.id };
    case "newRun": {
      const state = advance(createRun(ctx, req.opts), ctx, bots);
      return { id: req.id, ok: true, state };
    }
    case "action": {
      const r = applyAction(req.state, req.playerId, req.action, ctx);
      if (!r.ok) return { id: req.id, ok: false, error: { code: r.code, msg: r.msg } };
      return { id: req.id, ok: true, state: advance(r.value, ctx, bots) };
    }
    case "advance":
      return { id: req.id, ok: true, state: advance(req.state, ctx, bots) };
    case "ghosts":
      return { id: req.id, ok: true, state: applyGhosts(req.state, req.ghosts, ctx) };
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    (self as unknown as Worker).postMessage(handle(e.data));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, ok: false, error: { code: "BAD_MESSAGE", msg: (err as Error).message } } satisfies WorkerResponse);
  }
};
