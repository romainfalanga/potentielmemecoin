import type { EngineId, Verdict } from "../types.js";

/**
 * Default weighting of each engine's (normalized) score into the global
 * opportunity score. Security and manipulation risk together make up 45% of
 * the composite because structural safety gates everything else - a token
 * cannot be "opportunistically interesting" if it is unsafe to hold.
 *
 * These weights are intentionally isolated in one file so they can later be
 * recalibrated (V2 auto-improvement loop) without touching engine logic.
 */
export const DEFAULT_WEIGHTS: Record<EngineId, number> = {
  security: 0.25,
  manipulation: 0.2,
  distribution: 0.15,
  market: 0.15,
  momentum: 0.15,
  virality: 0.1,
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  avoid_critical_risk: "Avoid - Critical Risk",
  high_risk_speculative: "High Risk / Speculative Only",
  caution_mixed_signals: "Caution - Mixed Signals",
  watch_early_stage: "Watch - Early Stage",
  interesting_short_term: "Interesting - Short-Term Setup",
  structurally_sound_speculative: "Structurally Sound Speculative Play",
};
