/**
 * Daily challenge, leaderboard and ghost snapshots (§12.6). Platform-free:
 * the adapter supplies a `SocialStore`; the Cloudflare adapter maps it to D1,
 * the Node adapter keeps it in memory.
 */
import { z } from "zod";
import { BoardSchema, CardInstanceSchema } from "@dugout/protocol";

export const DailyScoreSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  playerId: z.string().min(1).max(64),
  nickname: z.string().min(1).max(10),
  placement: z.number().int().min(1).max(8),
  rounds: z.number().int().min(1).max(40),
  hp: z.number().int().min(0).max(100),
  board: z.object({ slots: BoardSchema.shape.slots, cards: z.record(z.string(), CardInstanceSchema) }),
});
export type DailyScore = z.infer<typeof DailyScoreSchema>;

export const GhostUploadSchema = z.object({
  packId: z.string().min(1).max(64),
  stageRound: z.string().regex(/^[1-7]-[1-9]$/),
  hp: z.number().int().min(0).max(100),
  board: z.object({ slots: BoardSchema.shape.slots, order: BoardSchema.shape.order, cards: z.record(z.string(), CardInstanceSchema), nickname: z.string().max(10), stadium: z.string() }),
});
export type GhostUpload = z.infer<typeof GhostUploadSchema>;

export interface GhostRow { id: number; packId: string; stageRound: string; hpBand: number; board: GhostUpload["board"]; createdAt: number }
export interface ScoreRow { date: string; playerId: string; nickname: string; placement: number; rounds: number; hp: number; score: number; createdAt: number }

export interface SocialStore {
  putScore(row: ScoreRow & { boardJson: string }): Promise<"inserted" | "exists">;
  topScores(date: string, limit: number): Promise<ScoreRow[]>;
  rankOf(date: string, playerId: string): Promise<{ rank: number; total: number; row: ScoreRow } | null>;
  putGhost(row: Omit<GhostRow, "id">): Promise<void>;
  findGhosts(packId: string, stageRound: string, hpBand: number, limit: number): Promise<GhostRow[]>;
}

/** §12.6 score formula. */
export function dailyScore(placement: number, rounds: number, hp: number): number {
  const placementPoints = [0, 100, 80, 65, 50, 40, 30, 20, 10][placement] ?? 10;
  return placementPoints + rounds * 2 + hp;
}

export const hpBand = (hp: number): number => (hp <= 25 ? 0 : hp <= 50 ? 1 : hp <= 75 ? 2 : 3);

/** Deterministic daily seed (§12.6). */
export const dailySeed = (date: string, packId: string): string => `daily:${date}:${packId}`;

export const todayUtc = (now = Date.now()): string => new Date(now).toISOString().slice(0, 10);

export class MemorySocialStore implements SocialStore {
  scores: (ScoreRow & { boardJson: string })[] = [];
  ghosts: GhostRow[] = [];
  private nextGhost = 1;
  async putScore(row: ScoreRow & { boardJson: string }) {
    if (this.scores.some((s) => s.date === row.date && s.playerId === row.playerId)) return "exists" as const;
    this.scores.push(row);
    return "inserted" as const;
  }
  async topScores(date: string, limit: number) {
    return this.scores.filter((s) => s.date === date).sort((a, b) => b.score - a.score || a.createdAt - b.createdAt).slice(0, limit);
  }
  async rankOf(date: string, playerId: string) {
    const all = await this.topScores(date, 1_000_000);
    const i = all.findIndex((s) => s.playerId === playerId);
    return i < 0 ? null : { rank: i + 1, total: all.length, row: all[i]! };
  }
  async putGhost(row: Omit<GhostRow, "id">) {
    this.ghosts.push({ ...row, id: this.nextGhost++ });
    if (this.ghosts.length > 5000) this.ghosts.shift();
  }
  async findGhosts(packId: string, stageRound: string, hpBand: number, limit: number) {
    const same = this.ghosts.filter((g) => g.packId === packId && g.stageRound === stageRound);
    const near = same.sort((a, b) => Math.abs(a.hpBand - hpBand) - Math.abs(b.hpBand - hpBand) || b.createdAt - a.createdAt);
    return near.slice(0, limit);
  }
}

/** Route handler shared by adapters. Returns null when the path is not social. */
export async function handleSocial(method: string, path: string, query: URLSearchParams, body: () => Promise<unknown>, store: SocialStore, now: number): Promise<{ status: number; body: unknown } | null> {
  if (path === "/daily/seed" && method === "GET") {
    const date = query.get("date") ?? todayUtc(now);
    const packId = query.get("packId") ?? "fictional-v1";
    return { status: 200, body: { date, seed: dailySeed(date, packId) } };
  }
  if (path === "/daily/scores" && method === "POST") {
    const parsed = DailyScoreSchema.safeParse(await body());
    if (!parsed.success) return { status: 400, body: { error: "BAD_SCORE" } };
    const d = parsed.data;
    if (d.date !== todayUtc(now) && d.date !== todayUtc(now - 86_400_000)) return { status: 400, body: { error: "STALE_DATE" } };
    const score = dailyScore(d.placement, d.rounds, d.hp);
    const result = await store.putScore({ date: d.date, playerId: d.playerId, nickname: d.nickname, placement: d.placement, rounds: d.rounds, hp: d.hp, score, createdAt: now, boardJson: JSON.stringify(d.board) });
    const rank = await store.rankOf(d.date, d.playerId);
    return { status: result === "inserted" ? 201 : 200, body: { result, score, rank: rank?.rank ?? null, total: rank?.total ?? 0 } };
  }
  if (path === "/daily/leaderboard" && method === "GET") {
    const date = query.get("date") ?? todayUtc(now);
    const top = await store.topScores(date, 100);
    const me = query.get("playerId") ? await store.rankOf(date, query.get("playerId")!) : null;
    return { status: 200, body: { date, top: top.map((s, i) => ({ rank: i + 1, nickname: s.nickname, score: s.score, placement: s.placement, rounds: s.rounds, hp: s.hp })), me: me ? { rank: me.rank, total: me.total, score: me.row.score } : null } };
  }
  if (path === "/ghosts" && method === "POST") {
    const parsed = GhostUploadSchema.safeParse(await body());
    if (!parsed.success) return { status: 400, body: { error: "BAD_GHOST" } };
    const g = parsed.data;
    await store.putGhost({ packId: g.packId, stageRound: g.stageRound, hpBand: hpBand(g.hp), board: g.board, createdAt: now });
    return { status: 201, body: { ok: true } };
  }
  if (path === "/ghosts" && method === "GET") {
    const packId = query.get("packId") ?? "fictional-v1";
    const stageRound = query.get("stageRound") ?? "2-2";
    const band = Number(query.get("hpBand") ?? 3);
    const rows = await store.findGhosts(packId, stageRound, band, Number(query.get("limit") ?? 7));
    return { status: 200, body: { ghosts: rows.map((r) => ({ id: r.id, stageRound: r.stageRound, hpBand: r.hpBand, board: r.board })) } };
  }
  return null;
}
