import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PackSchema, type ServerMessage } from "@dugout/protocol";
import { RoomCore, applyPatch, diff, type RoomPorts, type Socket } from "../src/core/index.js";

const pack = PackSchema.parse(JSON.parse(readFileSync(resolve(__dirname, "../../../packages/packs/fictional-v1.json"), "utf8")));

class FakeSocket implements Socket {
  messages: ServerMessage[] = [];
  closed = false;
  send(data: string) { this.messages.push(JSON.parse(data).message as ServerMessage); }
  close() { this.closed = true; }
  last(type: ServerMessage["type"]) { return [...this.messages].reverse().find((m) => m.type === type); }
}

function harness() {
  let now = 1_000_000;
  let alarmAt: number | null = null;
  let closed = false;
  const ports: RoomPorts = { save: () => undefined, setAlarm: (at) => { alarmAt = at; }, now: () => now, onClose: () => { closed = true; } };
  const core = new RoomCore(ports, RoomCore.fresh("ABC123", pack, now), pack);
  const join = (id: string, nick = id) => { const s = new FakeSocket(); core.attach(id, s); core.onAction(id, { type: "JOIN", roomCode: "ABC123", playerId: id, nickname: nick }); return s; };
  const msg = (id: string, action: Parameters<RoomCore["onAction"]>[1]) => core.handle(id, JSON.stringify({ v: 1, seq: 1, action }));
  const tick = (ms: number) => { now += ms; if (alarmAt !== null && now >= alarmAt) core.onAlarm(); };
  return { core, join, msg, tick, alarm: () => alarmAt, closed: () => closed, now: () => now };
}

describe("json patch", () => {
  it("round-trips nested changes", () => {
    const a = { x: 1, arr: [1, 2, 3], o: { k: "v", gone: true }, list: [{ a: 1 }] };
    const b = { x: 2, arr: [1, 5, 3], o: { k: "v", added: 1 }, list: [{ a: 1 }, { a: 2 }] };
    const ops = diff(a, b);
    expect(applyPatch(a, ops)).toEqual(b);
    expect(diff(b, b)).toEqual([]);
  });
});

describe("room lobby", () => {
  it("hosts, readies and starts a run with bot fill", () => {
    const h = harness();
    const a = h.join("p1", "호스트");
    const b = h.join("p2", "친구");
    expect(a.last("ROOM_STATE")).toMatchObject({ type: "ROOM_STATE", roomCode: "ABC123" });
    h.msg("p2", { type: "READY" });
    h.msg("p1", { type: "READY" });
    expect(h.core.snap.state?.phase).toBe("STADIUM");
    expect(h.core.snap.state?.players).toHaveLength(8);
    expect(h.core.snap.state?.players.filter((p) => !p.isBot).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(b.last("SNAPSHOT")).toBeDefined();
    expect(b.last("PHASE")).toMatchObject({ phase: "STADIUM" });
  });

  it("rejects a 9th player and bad messages", () => {
    const h = harness();
    for (let i = 0; i < 8; i++) h.join(`p${i}`);
    const extra = h.join("p9");
    expect(extra.last("ERROR")).toMatchObject({ code: "ROOM_FULL" });
    const s = h.join("p0");
    h.core.handle("p0", "not json");
    expect(s.last("ERROR")).toMatchObject({ code: "BAD_MESSAGE" });
    h.core.handle("p0", JSON.stringify({ v: 1, seq: 1, action: { type: "HACK" } }));
    expect(s.last("ERROR")).toMatchObject({ code: "BAD_MESSAGE" });
  });

  it("rate limits at 10 actions per second", () => {
    const h = harness();
    const s = h.join("p1");
    for (let i = 0; i < 12; i++) h.msg("p1", { type: "PING" });
    expect(s.messages.filter((m) => m.type === "PONG")).toHaveLength(10);
    expect(s.last("ERROR")).toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("room game flow", () => {
  function started() {
    const h = harness();
    const a = h.join("p1");
    const b = h.join("p2");
    h.msg("p1", { type: "READY" });
    h.msg("p2", { type: "READY" });
    return { ...h, a, b };
  }

  it("applies validated actions and patches other clients", () => {
    const h = started();
    h.msg("p1", { type: "PICK_STADIUM", id: "SEA_BREEZE" });
    expect(h.core.snap.state?.players.find((p) => p.id === "p1")?.stadium).toBe("SEA_BREEZE");
    expect(h.b.last("PATCH")).toBeDefined();
    h.msg("p1", { type: "BUY", slot: 0 });
    expect(h.a.last("ERROR")).toMatchObject({ code: "BAD_PHASE" });
  });

  it("auto-resolves timed-out humans and advances the phase", () => {
    const h = started();
    expect(h.alarm()).not.toBeNull();
    h.tick(31_000); // stadium timer → auto DOME for both
    expect(h.core.snap.state?.phase).toBe("PREP");
    expect(h.core.snap.state?.round).toBe("1-1");
    h.tick(31_000); // prep S1 timer → auto READY → simulate → PLAYBACK
    expect(h.core.snap.state?.phase).toBe("PLAYBACK");
    expect(h.a.last("RESULT")).toBeDefined();
    h.tick(21_000); // playback → SETTLE
    expect(h.core.snap.state?.phase).toBe("SETTLE");
    h.tick(5_000); // settle → next round
    expect(h.core.snap.state?.round).toBe("1-2");
  });

  it("hands an idle player to a bot after two idle rounds and gives control back on rejoin", () => {
    const h = started();
    h.tick(31_000);
    h.msg("p1", { type: "READY" }); // p1 acts; p2 idles
    h.tick(31_000);
    h.tick(21_000);
    h.tick(5_000);
    h.msg("p1", { type: "READY" });
    h.tick(31_000);
    const p2 = () => h.core.snap.state!.players.find((p) => p.id === "p2")!;
    expect(p2().isBot).toBe(true);
    h.core.detach("p2");
    const s2 = h.join("p2");
    expect(p2().isBot).toBe(false);
    expect(s2.last("SNAPSHOT")).toBeDefined();
  });

  it("transfers host on disconnect and closes an empty room after 30 s", () => {
    const h = started();
    h.core.detach("p1");
    expect(h.core.snap.members.find((m) => m.playerId === "p2")?.isHost).toBe(true);
    h.core.detach("p2");
    expect(h.core.snap.closeAt).not.toBeNull();
    h.tick(31_000);
    expect(h.closed()).toBe(true);
  });

  it("simulates a round in well under 200 ms", () => {
    const h = started();
    h.tick(31_000);
    const t0 = performance.now();
    h.tick(31_000);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(h.core.snap.state?.phase).toBe("PLAYBACK");
  });
});
