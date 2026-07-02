-- Tokens seen by the engine at least once. Kept separate from analyses so
-- token-level metadata (name/symbol at first sight) doesn't duplicate on
-- every re-analysis, and so future features (watchlists, recalibration
-- datasets) have a natural anchor table.
CREATE TABLE IF NOT EXISTS tokens (
  address TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  name TEXT,
  symbol TEXT,
  first_seen_at TEXT NOT NULL,
  last_analyzed_at TEXT NOT NULL
);

-- One row per analysis run. `report_json` holds the full AnalysisReport
-- (all sub-scores, triggered rules, scenarios, transparency payload) so the
-- API can serve a historical report byte-for-byte as it was generated.
-- The individual *_score columns are denormalized out of report_json
-- specifically so history/trend queries and future recalibration work don't
-- need to deserialize JSON per row.
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  token_address TEXT NOT NULL REFERENCES tokens(address),
  chain TEXT NOT NULL,
  created_at TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  verdict TEXT NOT NULL,
  global_score REAL NOT NULL,
  security_score REAL NOT NULL,
  distribution_score REAL NOT NULL,
  market_score REAL NOT NULL,
  manipulation_score REAL NOT NULL,
  momentum_score REAL NOT NULL,
  virality_score REAL NOT NULL,
  report_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_token_address ON analyses(token_address);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at);
