/**
 * Cloudflare adapter: one Durable Object per room (§12.2). All DO-specific
 * code lives here; the rules are in ../core.
 */
import { PackSchema, type Pack } from "@dugout/protocol";
import fictional from "@dugout/packs/fictional-v1.json";
import { ROOM_LIMITS, RoomCore, roomCode, type RoomPorts, type RoomSnapshot } from "../core/room.js";
import { handleSocial } from "../core/social.js";
import { D1SocialStore } from "./d1.js";

export interface Env {
  ROOM: DurableObjectNamespace;
  DB: D1Database;
  KV: KVNamespace;
  ALLOWED_ORIGIN: string;
}

const defaultPack: Pack = PackSchema.parse(fictional);

const cors = (origin: string): HeadersInit => ({ "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
const json = (body: unknown, status = 200, origin = "*") => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(origin) } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = env.ALLOWED_ORIGIN ?? "*";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === "/health") return json({ ok: true }, 200, origin);
    const social = await handleSocial(req.method, url.pathname, url.searchParams, () => req.json(), new D1SocialStore(env.DB), Date.now());
    if (social) return json(social.body, social.status, origin);
    if (req.method === "POST" && url.pathname === "/rooms") {
      // Allocate a code that maps to a fresh DO.
      for (let i = 0; i < 5; i++) {
        const code = roomCode(Math.random);
        const existing = await env.KV.get(`room:${code}`);
        if (existing) continue;
        const id = env.ROOM.newUniqueId();
        await env.KV.put(`room:${code}`, id.toString(), { expirationTtl: 60 * 60 * 6 });
        await env.ROOM.get(id).fetch(new Request(`https://room/init?code=${code}`, { method: "POST" }));
        return json({ code }, 201, origin);
      }
      return json({ error: "TRY_AGAIN" }, 503, origin);
    }
    const m = url.pathname.match(/^\/rooms\/([A-Z0-9]{6})(\/ws|\/pack|\/settings)?$/);
    if (m) {
      const idStr = await env.KV.get(`room:${m[1]}`);
      if (!idStr) return json({ error: "ROOM_NOT_FOUND" }, 404, origin);
      return env.ROOM.get(env.ROOM.idFromString(idStr)).fetch(req);
    }
    return json({ error: "NOT_FOUND" }, 404, origin);
  },
} satisfies ExportedHandler<Env>;

export class RoomDO implements DurableObject {
  private core: RoomCore | null = null;

  constructor(private state: DurableObjectState, private env: Env) {}

  private async load(code?: string): Promise<RoomCore> {
    if (this.core) return this.core;
    const saved = (await this.state.storage.get<RoomSnapshot>("snapshot")) ?? RoomCore.fresh(code ?? "??????", defaultPack, Date.now());
    const ports: RoomPorts = {
      save: (snap) => this.state.storage.put("snapshot", snap),
      setAlarm: async (at) => {
        if (at === null || !Number.isFinite(at)) await this.state.storage.deleteAlarm();
        else await this.state.storage.setAlarm(at);
      },
      now: () => Date.now(),
      onClose: () => { void this.state.storage.deleteAll(); this.core = null; },
    };
    this.core = new RoomCore(ports, saved, defaultPack);
    // Re-attach hibernated sockets.
    for (const ws of this.state.getWebSockets()) {
      const tag = this.state.getTags(ws)[0];
      if (tag) this.core.attach(tag, { send: (d) => ws.send(d), close: (c, r) => ws.close(c, r) });
    }
    return this.core;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/init") {
      await this.load(url.searchParams.get("code") ?? undefined);
      await this.state.storage.put("snapshot", this.core!.snap);
      return new Response("ok");
    }
    const core = await this.load();
    if (url.pathname.endsWith("/ws")) {
      const playerId = url.searchParams.get("playerId");
      const nickname = (url.searchParams.get("nickname") ?? "player").slice(0, 10).padEnd(2, "_");
      if (!playerId) return new Response("playerId required", { status: 400 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket(server, [playerId]);
      core.attach(playerId, { send: (d) => server.send(d), close: (c, r) => server.close(c, r) });
      core.onAction(playerId, { type: "JOIN", roomCode: core.snap.code, playerId, nickname });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith("/pack") && req.method === "POST") {
      const text = await req.text();
      if (text.length > ROOM_LIMITS.packMaxBytes) return json({ error: "PACK_TOO_LARGE" }, 413);
      const parsed = PackSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return json({ error: "BAD_PACK" }, 400);
      return json({ ok: core.setPack(parsed.data) }, 200);
    }
    if (url.pathname.endsWith("/settings") && req.method === "POST") {
      const body = (await req.json()) as { fillWithBots?: boolean };
      if (typeof body.fillWithBots === "boolean") core.setFillWithBots(body.fillWithBots);
      return json({ ok: true });
    }
    return json(core.roomState());
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const core = await this.load();
    const tag = this.state.getTags(ws)[0];
    if (tag) core.handle(tag, typeof message === "string" ? message : new TextDecoder().decode(message));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const core = await this.load();
    const tag = this.state.getTags(ws)[0];
    if (tag) core.detach(tag);
  }

  async alarm(): Promise<void> {
    const core = await this.load();
    core.onAlarm();
  }
}
