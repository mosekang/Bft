/**
 * Node adapter: an in-memory room registry served over `ws` + a tiny HTTP
 * API. Used for local development, Playwright multi-client tests and as the
 * Colyseus/Fly.io alternative the spec mentions (§3.1). No persistence.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { PackSchema, type Pack } from "@dugout/protocol";
import { ROOM_LIMITS, RoomCore, roomCode, type RoomPorts } from "../core/room.js";
import { MemorySocialStore, handleSocial } from "../core/social.js";

interface Hosted {
  core: RoomCore;
  alarm: ReturnType<typeof setTimeout> | null;
}

export class NodeRoomHost {
  readonly rooms = new Map<string, Hosted>();
  constructor(private defaultPack: Pack, private now: () => number = () => Date.now()) {}

  create(code = roomCode(Math.random)): RoomCore {
    if (this.rooms.has(code)) return this.rooms.get(code)!.core;
    const hosted: Hosted = { core: null as unknown as RoomCore, alarm: null };
    const ports: RoomPorts = {
      save: () => undefined,
      setAlarm: (at) => {
        if (hosted.alarm) clearTimeout(hosted.alarm);
        hosted.alarm = null;
        if (at === null || !Number.isFinite(at)) return;
        hosted.alarm = setTimeout(() => { hosted.alarm = null; hosted.core.onAlarm(); }, Math.max(0, at - this.now()));
      },
      now: this.now,
      onClose: () => this.destroy(code),
    };
    hosted.core = new RoomCore(ports, RoomCore.fresh(code, this.defaultPack, this.now()), this.defaultPack);
    this.rooms.set(code, hosted);
    return hosted.core;
  }

  get(code: string): RoomCore | undefined {
    return this.rooms.get(code)?.core;
  }

  destroy(code: string): void {
    const h = this.rooms.get(code);
    if (!h) return;
    if (h.alarm) clearTimeout(h.alarm);
    this.rooms.delete(code);
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => { size += c.length; if (size > limit) { resolve(null); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

/** Start the HTTP + WebSocket server. Returns the http server (for tests to close). */
export function startNodeServer(defaultPack: Pack, port = 8787, host = "127.0.0.1"): { server: Server; host: NodeRoomHost; social: MemorySocialStore } {
  const hostReg = new NodeRoomHost(defaultPack);
  const social = new MemorySocialStore();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "OPTIONS") return json(res, 204, {});
    const socialRes = await handleSocial(req.method ?? "GET", url.pathname, url.searchParams, async () => JSON.parse((await readBody(req, 256 * 1024)) ?? "null"), social, Date.now());
    if (socialRes) return json(res, socialRes.status, socialRes.body);
    if (req.method === "POST" && url.pathname === "/rooms") {
      const core = hostReg.create();
      return json(res, 201, { code: core.snap.code });
    }
    const m = url.pathname.match(/^\/rooms\/([A-Z0-9]{6})(\/pack|\/settings)?$/);
    if (m) {
      const core = hostReg.get(m[1]!);
      if (!core) return json(res, 404, { error: "ROOM_NOT_FOUND" });
      if (req.method === "GET" && !m[2]) return json(res, 200, core.roomState());
      if (req.method === "POST" && m[2] === "/pack") {
        const body = await readBody(req, ROOM_LIMITS.packMaxBytes);
        if (body === null) return json(res, 413, { error: "PACK_TOO_LARGE" });
        const parsed = PackSchema.safeParse(JSON.parse(body));
        if (!parsed.success) return json(res, 400, { error: "BAD_PACK" });
        return json(res, core.setPack(parsed.data) ? 200 : 409, { ok: true });
      }
      if (req.method === "POST" && m[2] === "/settings") {
        const body = JSON.parse((await readBody(req, 4096)) ?? "{}") as { fillWithBots?: boolean };
        if (typeof body.fillWithBots === "boolean") core.setFillWithBots(body.fillWithBots);
        return json(res, 200, { ok: true });
      }
    }
    if (url.pathname === "/health") return json(res, 200, { ok: true, rooms: hostReg.rooms.size });
    json(res, 404, { error: "NOT_FOUND" });
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    const m = url.pathname.match(/^\/rooms\/([A-Z0-9]{6})\/ws$/);
    const playerId = url.searchParams.get("playerId");
    const nickname = url.searchParams.get("nickname") ?? "player";
    const core = m ? hostReg.get(m[1]!) : undefined;
    if (!core || !playerId) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      core.attach(playerId, { send: (d) => ws.send(d), close: (c, r) => ws.close(c, r) });
      core.onAction(playerId, { type: "JOIN", roomCode: core.snap.code, playerId, nickname: nickname.slice(0, 10).padEnd(2, "_") });
      ws.on("message", (data) => core.handle(playerId, data.toString()));
      ws.on("close", () => core.detach(playerId));
    });
  });
  server.listen(port, host);
  return { server, host: hostReg, social };
}
