import type { EngineId, ScoreDirection, Severity, Verdict } from "@mae/core";

export const ENGINE_COLORS: Record<EngineId, string> = {
  security: "var(--series-security)",
  distribution: "var(--series-distribution)",
  market: "var(--series-market)",
  manipulation: "var(--series-manipulation)",
  momentum: "var(--series-momentum)",
  virality: "var(--series-virality)",
};

export const VERDICT_STYLE: Record<Verdict, { color: string; bg: string }> = {
  avoid_critical_risk: { color: "#ff9c9c", bg: "rgba(208,59,59,0.16)" },
  high_risk_speculative: { color: "#ffb37a", bg: "rgba(236,131,90,0.16)" },
  caution_mixed_signals: { color: "#ffd873", bg: "rgba(250,178,25,0.16)" },
  watch_early_stage: { color: "#8fd6ff", bg: "rgba(57,135,229,0.16)" },
  interesting_short_term: { color: "#8ff0c0", bg: "rgba(25,158,112,0.18)" },
  structurally_sound_speculative: { color: "#7bffb0", bg: "rgba(12,163,12,0.2)" },
};

export function severityColor(severity: Severity): string {
  switch (severity) {
    case "positive":
      return "var(--status-good)";
    case "warn":
      return "var(--status-warning)";
    case "danger":
      return "var(--status-critical)";
    default:
      return "var(--text-muted)";
  }
}

function goodnessColor(goodness: number): string {
  if (goodness >= 70) return "var(--status-good)";
  if (goodness >= 45) return "var(--status-warning)";
  return "var(--status-critical)";
}

/** Colors a 0-100 score by "goodness" - inverting risk-framed (higher_is_worse) scores first. */
export function directionalColor(score: number, direction: ScoreDirection): string {
  const goodness = direction === "higher_is_worse" ? 100 - score : score;
  return goodnessColor(goodness);
}
