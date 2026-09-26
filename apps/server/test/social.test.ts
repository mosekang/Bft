import { describe, expect, it } from "vitest";
import { MemorySocialStore, dailyScore, dailySeed, handleSocial, hpBand, todayUtc } from "../src/core/social.js";

const store = new MemorySocialStore();
const now = Date.UTC(2026, 8, 26, 12);
const call = (method: string, path: string, q: Record<string, string> = {}, body: unknown = null) => handleSocial(method, path, new URLSearchParams(q), async () => body, store, now);
const board = { slots: { SS: "c1" }, cards: { c1: { instanceId: "c1", defId: "c1-h-01", star: 1, items: [], fatigue: 0, injuredRounds: 0, growth: 0 } } };

describe("daily challenge (§12.6)", () => {
  it("scores placement + rounds×2 + hp and records only the first run per day", async () => {
    expect(dailyScore(1, 26, 40)).toBe(100 + 52 + 40);
    expect(dailyScore(8, 10, 0)).toBe(10 + 20);
    const date = todayUtc(now);
    const seed = await call("GET", "/daily/seed", { packId: "fictional-v1" });
    expect(seed?.body).toEqual({ date, seed: dailySeed(date, "fictional-v1") });
    const first = await call("POST", "/daily/scores", {}, { date, playerId: "u1", nickname: "나", placement: 2, rounds: 26, hp: 30, board });
    expect(first?.status).toBe(201);
    const again = await call("POST", "/daily/scores", {}, { date, playerId: "u1", nickname: "나", placement: 1, rounds: 26, hp: 90, board });
    expect(again?.status).toBe(200);
    expect((again?.body as { result: string }).result).toBe("exists");
    await call("POST", "/daily/scores", {}, { date, playerId: "u2", nickname: "너", placement: 1, rounds: 26, hp: 50, board });
    const lb = (await call("GET", "/daily/leaderboard", { date, playerId: "u1" }))?.body as { top: { nickname: string }[]; me: { rank: number } };
    expect(lb.top[0]?.nickname).toBe("너");
    expect(lb.me.rank).toBe(2);
    expect((await call("POST", "/daily/scores", {}, { date: "2020-01-01", playerId: "u3", nickname: "x", placement: 1, rounds: 1, hp: 1, board }))?.status).toBe(400);
  });

  it("stores and finds ghosts by stage round and hp band", async () => {
    const g = { packId: "fictional-v1", stageRound: "3-2", hp: 80, board: { slots: { SS: "c1" }, order: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"], cards: board.cards, nickname: "고스트", stadium: "DOME" } };
    expect((await call("POST", "/ghosts", {}, g))?.status).toBe(201);
    await call("POST", "/ghosts", {}, { ...g, hp: 10 });
    const found = (await call("GET", "/ghosts", { packId: "fictional-v1", stageRound: "3-2", hpBand: "3" }))?.body as { ghosts: { hpBand: number }[] };
    expect(found.ghosts).toHaveLength(2);
    expect(found.ghosts[0]!.hpBand).toBe(hpBand(80));
    expect((await call("GET", "/ghosts", { stageRound: "9-9" }))?.status).toBe(200);
  });
});
