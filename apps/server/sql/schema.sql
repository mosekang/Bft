-- D1 schema (§12.2). Apply with: wrangler d1 execute dugout --file=sql/schema.sql
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  recovery_code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_scores (
  date TEXT NOT NULL,
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  placement INTEGER NOT NULL,
  rounds INTEGER NOT NULL,
  hp INTEGER NOT NULL,
  score INTEGER NOT NULL,
  board_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (date, player_id)
);
CREATE INDEX IF NOT EXISTS daily_scores_rank ON daily_scores(date, score DESC);
CREATE TABLE IF NOT EXISTS ghosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id TEXT NOT NULL,
  stage_round TEXT NOT NULL,
  hp_band INTEGER NOT NULL,
  board_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ghosts_lookup ON ghosts(pack_id, stage_round, hp_band, created_at DESC);
