import type { EngineId, EngineResult, Horizon, HorizonScenario, PredictionResult } from "../types.js";

/**
 * Deterministic, rule-derived multi-horizon reasoning.
 *
 * There is no ML model here on purpose (V1 principle: algorithm-first,
 * auditable). Each horizon has a fixed weighting profile over the six
 * engine scores (normalized to a 0-100 "higher is better" opportunity
 * scale) that reflects which dimensions matter most at that timescale:
 * momentum/manipulation dominate 1h-12h, security/distribution/virality
 * dominate 7d-30d. Confidence decays with horizon length because the
 * further out we project, the less today's snapshot can say about it.
 *
 * Outputs are probabilities of *scenarios*, never price targets.
 */

const HORIZON_PROFILES: Record<Horizon, Record<EngineId, number>> = {
  "1h": { momentum: 0.35, manipulation: 0.3, market: 0.15, security: 0.1, distribution: 0.05, virality: 0.05 },
  "6h": { momentum: 0.3, manipulation: 0.25, market: 0.2, security: 0.1, distribution: 0.1, virality: 0.05 },
  "12h": { momentum: 0.25, manipulation: 0.2, market: 0.2, security: 0.15, distribution: 0.1, virality: 0.1 },
  "24h": { momentum: 0.2, manipulation: 0.15, market: 0.2, security: 0.2, distribution: 0.15, virality: 0.1 },
  "7d": { momentum: 0.1, manipulation: 0.15, market: 0.15, security: 0.25, distribution: 0.2, virality: 0.15 },
  "30d": { momentum: 0.1, manipulation: 0.15, market: 0.1, security: 0.25, distribution: 0.2, virality: 0.2 },
};

const HORIZON_CONFIDENCE_DECAY: Record<Horizon, number> = {
  "1h": 0.95,
  "6h": 0.9,
  "12h": 0.85,
  "24h": 0.78,
  "7d": 0.6,
  "30d": 0.4,
};

const HORIZONS: Horizon[] = ["1h", "6h", "12h", "24h", "7d", "30d"];

function clamp01(n: number): number {
  return Math.max(0.02, Math.min(0.95, n));
}

function normalizeToOpportunityScale(engine: EngineResult): number {
  return engine.direction === "higher_is_worse" ? 100 - engine.score : engine.score;
}

function weightedHealth(normalized: Record<EngineId, number>, profile: Record<EngineId, number>): number {
  const entries = Object.entries(profile) as [EngineId, number][];
  const weightSum = entries.reduce((s, [, w]) => s + w, 0) || 1;
  const sum = entries.reduce((s, [id, w]) => s + w * (normalized[id] ?? 50), 0);
  return sum / weightSum;
}

function buildHorizonScenario(
  horizon: Horizon,
  normalized: Record<EngineId, number>,
  rawByEngine: Record<EngineId, EngineResult>,
  avgEngineConfidence: number,
): HorizonScenario {
  const profile = HORIZON_PROFILES[horizon];
  const health = weightedHealth(normalized, profile);

  const manipulationScore = rawByEngine.manipulation?.score ?? 50;
  const securityScore = rawByEngine.security?.score ?? 50;
  const marketScore = rawByEngine.market?.score ?? 50;
  const momentumScore = rawByEngine.momentum?.score ?? 50;
  const viralityScore = rawByEngine.virality?.score ?? 50;
  const distributionScore = rawByEngine.distribution?.score ?? 50;

  const continuationProbability = clamp01(health / 100);

  const rejectionRisk = clamp01(
    (manipulationScore * 0.5 + (100 - securityScore) * 0.3 + (100 - marketScore) * 0.2) / 100,
  );

  // More time on the clock = more cumulative chances of a speculative spike,
  // so the horizon-length multiplier increases pump probability slightly
  // for longer windows while the underlying driver mix stays momentum/manip/virality.
  const horizonLengthBoost: Record<Horizon, number> = {
    "1h": 0.9,
    "6h": 1.0,
    "12h": 1.05,
    "24h": 1.1,
    "7d": 1.15,
    "30d": 1.2,
  };
  const pumpProbability = clamp01(
    ((momentumScore * 0.4 + manipulationScore * 0.3 + viralityScore * 0.3) / 100) * horizonLengthBoost[horizon],
  );

  const narrativeSurvivalProbability = clamp01(
    (viralityScore * 0.5 + securityScore * 0.3 + distributionScore * 0.2) / 100,
  );

  const confidence = Math.max(0.05, Math.min(0.95, avgEngineConfidence * HORIZON_CONFIDENCE_DECAY[horizon]));

  const topDrivers = (Object.entries(profile) as [EngineId, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => {
      const score = normalized[id] ?? 50;
      const label = rawByEngine[id]?.label ?? id;
      const lean = score >= 60 ? "supportive" : score <= 40 ? "concerning" : "neutral";
      return `${label} (${lean})`;
    });

  return {
    horizon,
    continuationProbability: round2(continuationProbability),
    rejectionRisk: round2(rejectionRisk),
    pumpProbability: round2(pumpProbability),
    narrativeSurvivalProbability: round2(narrativeSurvivalProbability),
    confidence: round2(confidence),
    dominantFactors: topDrivers,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function runPredictionEngine(engines: EngineResult[], now: Date): PredictionResult {
  const rawByEngine = Object.fromEntries(engines.map((e) => [e.id, e])) as Record<EngineId, EngineResult>;
  const normalized = Object.fromEntries(
    engines.map((e) => [e.id, normalizeToOpportunityScale(e)]),
  ) as Record<EngineId, number>;

  const avgEngineConfidence = engines.length
    ? engines.reduce((s, e) => s + e.confidence, 0) / engines.length
    : 0.3;

  const scenarios = HORIZONS.map((h) => buildHorizonScenario(h, normalized, rawByEngine, avgEngineConfidence));

  return {
    generatedAt: now.toISOString(),
    scenarios,
    methodologyNote:
      "Scenarios are deterministic weighted projections of current sub-scores, not price forecasts. " +
      "Weight profiles shift per horizon (momentum/manipulation dominate short horizons; security/distribution/virality dominate long horizons). " +
      "Confidence decays with horizon length to reflect growing uncertainty.",
  };
}
