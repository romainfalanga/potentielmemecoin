import type { RuleTrigger, Severity } from "../types.js";

/**
 * A single deterministic, auditable rule. Every engine is just a list of
 * `RuleDef`s evaluated against extracted features - this is the mechanism
 * that keeps the whole system "algorithm-first": no rule fires without a
 * concrete numeric/boolean condition, and every firing carries its own
 * evidence for the transparency layer.
 */
export interface RuleDef<F> {
  id: string;
  label: string;
  description: (f: F) => string;
  severity: Severity;
  /** Signed points impact on the engine's 0-100 score scale */
  impact: number;
  when: (f: F) => boolean;
  evidence: (f: F) => Record<string, string | number | boolean | null>;
}

export function evaluateRules<F>(features: F, rules: RuleDef<F>[]): RuleTrigger[] {
  const triggers: RuleTrigger[] = [];
  for (const rule of rules) {
    if (rule.when(features)) {
      triggers.push({
        id: rule.id,
        label: rule.label,
        description: rule.description(features),
        severity: rule.severity,
        impact: rule.impact,
        evidence: rule.evidence(features),
      });
    }
  }
  return triggers;
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

export function scoreFromBase<F>(base: number, triggers: RuleTrigger[]): number {
  const total = triggers.reduce((sum, t) => sum + t.impact, base);
  return clampScore(total);
}

export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(denominator) || denominator === 0) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}
