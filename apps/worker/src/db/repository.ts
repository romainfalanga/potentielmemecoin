import type { AnalysisReport } from "@mae/core";

export interface AnalysisHistoryRow {
  id: string;
  createdAt: string;
  verdict: string;
  globalScore: number;
}

export async function upsertToken(db: D1Database, report: AnalysisReport, now: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO tokens (address, chain, name, symbol, first_seen_at, last_analyzed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(address) DO UPDATE SET
         name = excluded.name,
         symbol = excluded.symbol,
         last_analyzed_at = excluded.last_analyzed_at`,
    )
    .bind(report.meta.tokenAddress, report.meta.chain, report.meta.tokenName ?? null, report.meta.tokenSymbol ?? null, now)
    .run();
}

function scoreOf(report: AnalysisReport, id: string): number {
  return report.subScores.find((s) => s.id === id)?.score ?? 0;
}

export async function insertAnalysis(db: D1Database, id: string, report: AnalysisReport): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analyses (
         id, token_address, chain, created_at, engine_version, verdict, global_score,
         security_score, distribution_score, market_score, manipulation_score, momentum_score, virality_score,
         report_json
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    )
    .bind(
      id,
      report.meta.tokenAddress,
      report.meta.chain,
      report.meta.generatedAt,
      report.meta.engineVersion,
      report.verdict,
      report.globalScore.score,
      scoreOf(report, "security"),
      scoreOf(report, "distribution"),
      scoreOf(report, "market"),
      scoreOf(report, "manipulation"),
      scoreOf(report, "momentum"),
      scoreOf(report, "virality"),
      JSON.stringify(report),
    )
    .run();
}

export async function getAnalysisById(db: D1Database, id: string): Promise<AnalysisReport | null> {
  const row = await db.prepare(`SELECT report_json FROM analyses WHERE id = ?1`).bind(id).first<{ report_json: string }>();
  if (!row) return null;
  return JSON.parse(row.report_json) as AnalysisReport;
}

export async function listAnalysesForToken(
  db: D1Database,
  address: string,
  limit = 25,
): Promise<AnalysisHistoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at as createdAt, verdict, global_score as globalScore
       FROM analyses WHERE token_address = ?1
       ORDER BY created_at DESC LIMIT ?2`,
    )
    .bind(address, limit)
    .all<AnalysisHistoryRow>();
  return results ?? [];
}
