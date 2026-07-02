import type { EngineId, EngineResult, GlobalScoreResult, Verdict, WeightedComponent } from "../types.js";
import { DEFAULT_WEIGHTS, VERDICT_LABELS } from "./weights.js";

interface HardGate {
  triggered: boolean;
  reason: string;
}

/**
 * Hard gates short-circuit the weighted composite: some findings are
 * disqualifying regardless of how well a token scores elsewhere (e.g. a
 * token can't be "interesting" if it has already rugged, or if there is no
 * tradable market at all).
 */
function evaluateHardGates(engines: EngineResult[]): HardGate {
  const byId = new Map(engines.map((e) => [e.id, e]));
  const security = byId.get("security");
  const market = byId.get("market");
  const manipulation = byId.get("manipulation");

  if (security?.triggers.some((t) => t.id === "SEC_RUGGED_FLAG")) {
    return { triggered: true, reason: "Token is flagged as already rugged." };
  }
  if (market?.triggers.some((t) => t.id === "MKT_NO_MARKET")) {
    return { triggered: true, reason: "No tradable market exists for this token." };
  }
  if (security && security.score < 15) {
    return { triggered: true, reason: "Security score is critically low (contract-level red flags)." };
  }
  if (manipulation && manipulation.score >= 80) {
    return { triggered: true, reason: "Manipulation risk score is critically high." };
  }
  return { triggered: false, reason: "" };
}

function normalizeToOpportunityScale(engine: EngineResult): number {
  return engine.direction === "higher_is_worse" ? 100 - engine.score : engine.score;
}

function verdictFromScore(score: number): Verdict {
  if (score < 25) return "avoid_critical_risk";
  if (score < 40) return "high_risk_speculative";
  if (score < 55) return "caution_mixed_signals";
  if (score < 68) return "watch_early_stage";
  if (score < 82) return "interesting_short_term";
  return "structurally_sound_speculative";
}

export function aggregateScores(
  engines: EngineResult[],
  weights: Record<EngineId, number> = DEFAULT_WEIGHTS,
): GlobalScoreResult {
  const weightedComponents: WeightedComponent[] = engines.map((engine) => {
    const normalizedScore = normalizeToOpportunityScale(engine);
    const weight = weights[engine.id] ?? 0;
    return {
      id: engine.id,
      label: engine.label,
      weight,
      normalizedScore,
      contribution: Math.round(weight * normalizedScore * 10) / 10,
    };
  });

  const weightSum = weightedComponents.reduce((sum, c) => sum + c.weight, 0) || 1;
  const rawScore = weightedComponents.reduce((sum, c) => sum + c.weight * c.normalizedScore, 0) / weightSum;

  const gate = evaluateHardGates(engines);
  const score = gate.triggered ? Math.min(rawScore, 18) : rawScore;
  const roundedScore = Math.round(score * 10) / 10;
  const verdict: Verdict = gate.triggered ? "avoid_critical_risk" : verdictFromScore(roundedScore);

  const rationale: string[] = [];
  if (gate.triggered) rationale.push(`Hard gate triggered: ${gate.reason}`);

  const sorted = [...weightedComponents].sort((a, b) => a.normalizedScore - b.normalizedScore);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  if (weakest) {
    rationale.push(`Weakest dimension: ${weakest.label} (${weakest.normalizedScore.toFixed(0)}/100).`);
  }
  if (strongest) {
    rationale.push(`Strongest dimension: ${strongest.label} (${strongest.normalizedScore.toFixed(0)}/100).`);
  }

  return {
    score: roundedScore,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    weightedComponents,
    rationale,
  };
}
