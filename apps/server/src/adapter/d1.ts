import type { GhostRow, ScoreRow, SocialStore } from "../core/social.js";

/** D1-backed SocialStore (§12.2 tables). */
export class D1SocialStore implements SocialStore {
  constructor(private db: D1Database) {}
  async putScore(row: ScoreRow & { boardJson: string }) {
    const r = await this.db.prepare("INSERT OR IGNORE INTO daily_scores (date, player_id, nickname, placement, rounds, hp, score, board_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(row.date, row.playerId, row.nickname, row.placement, row.rounds, row.hp, row.score, row.boardJson, row.createdAt).run();
    return (r.meta.changes ?? 0) > 0 ? ("inserted" as const) : ("exists" as const);
  }
  async topScores(date: string, limit: number) {
    const r = await this.db.prepare("SELECT date, player_id as playerId, nickname, placement, rounds, hp, score, created_at as createdAt FROM daily_scores WHERE date = ? ORDER BY score DESC, created_at ASC LIMIT ?").bind(date, limit).all<ScoreRow>();
    return r.results;
  }
  async rankOf(date: string, playerId: string) {
    const row = await this.db.prepare("SELECT date, player_id as playerId, nickname, placement, rounds, hp, score, created_at as createdAt FROM daily_scores WHERE date = ? AND player_id = ?").bind(date, playerId).first<ScoreRow>();
    if (!row) return null;
    const above = await this.db.prepare("SELECT COUNT(*) as n FROM daily_scores WHERE date = ? AND (score > ? OR (score = ? AND created_at < ?))").bind(date, row.score, row.score, row.createdAt).first<{ n: number }>();
    const total = await this.db.prepare("SELECT COUNT(*) as n FROM daily_scores WHERE date = ?").bind(date).first<{ n: number }>();
    return { rank: (above?.n ?? 0) + 1, total: total?.n ?? 1, row };
  }
  async putGhost(row: Omit<GhostRow, "id">) {
    await this.db.prepare("INSERT INTO ghosts (pack_id, stage_round, hp_band, board_json, created_at) VALUES (?,?,?,?,?)").bind(row.packId, row.stageRound, row.hpBand, JSON.stringify(row.board), row.createdAt).run();
  }
  async findGhosts(packId: string, stageRound: string, hpBand: number, limit: number) {
    const r = await this.db.prepare("SELECT id, pack_id as packId, stage_round as stageRound, hp_band as hpBand, board_json as boardJson, created_at as createdAt FROM ghosts WHERE pack_id = ? AND stage_round = ? ORDER BY ABS(hp_band - ?) ASC, created_at DESC LIMIT ?")
      .bind(packId, stageRound, hpBand, limit).all<{ id: number; packId: string; stageRound: string; hpBand: number; boardJson: string; createdAt: number }>();
    return r.results.map((x) => ({ id: x.id, packId: x.packId, stageRound: x.stageRound, hpBand: x.hpBand, board: JSON.parse(x.boardJson) as GhostRow["board"], createdAt: x.createdAt }));
  }
}
