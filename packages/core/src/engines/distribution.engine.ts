import type { EngineResult, SecurityRawInput } from "../types.js";
import { evaluateRules, scoreFromBase, type RuleDef } from "./rule-kit.js";

interface DistributionFeatures {
  top1Pct: number;
  top5SumPct: number;
  top10SumPct: number;
  creatorBalancePct: number;
  totalHolders: number;
  /** Some data sources fail to populate a full holder count (returns 0) even when top-holder data exists */
  totalHoldersKnown: boolean;
  insiderNetworksDetected: number;
  insiderHolderCount: number;
}

function extractFeatures(input: SecurityRawInput): DistributionFeatures {
  const sorted = [...input.topHolders].sort((a, b) => b.pct - a.pct);
  const top1Pct = sorted[0]?.pct ?? 0;
  const top5SumPct = sorted.slice(0, 5).reduce((s, h) => s + h.pct, 0);
  const top10SumPct = sorted.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const insiderHolderCount = sorted.filter((h) => h.isInsider).length;

  return {
    top1Pct,
    top5SumPct,
    top10SumPct,
    creatorBalancePct: input.creatorBalancePct ?? 0,
    totalHolders: input.totalHolders,
    totalHoldersKnown: input.totalHolders > 0,
    insiderNetworksDetected: input.insiderNetworksDetected,
    insiderHolderCount,
  };
}

const RULES: RuleDef<DistributionFeatures>[] = [
  {
    id: "DIST_TOP1_EXTREME",
    label: "Extreme single-wallet concentration",
    description: (f) => `The single largest holder controls ${f.top1Pct.toFixed(1)}% of supply.`,
    severity: "danger",
    impact: -30,
    when: (f) => f.top1Pct > 20,
    evidence: (f) => ({ top1Pct: f.top1Pct }),
  },
  {
    id: "DIST_TOP1_HIGH",
    label: "High single-wallet concentration",
    description: (f) => `The single largest holder controls ${f.top1Pct.toFixed(1)}% of supply.`,
    severity: "warn",
    impact: -12,
    when: (f) => f.top1Pct > 10 && f.top1Pct <= 20,
    evidence: (f) => ({ top1Pct: f.top1Pct }),
  },
  {
    id: "DIST_TOP10_EXTREME",
    label: "Extreme top-10 holder concentration",
    description: (f) => `The top 10 holders together control ${f.top10SumPct.toFixed(1)}% of supply.`,
    severity: "danger",
    impact: -25,
    when: (f) => f.top10SumPct > 60,
    evidence: (f) => ({ top10SumPct: f.top10SumPct }),
  },
  {
    id: "DIST_TOP10_HIGH",
    label: "Elevated top-10 holder concentration",
    description: (f) => `The top 10 holders together control ${f.top10SumPct.toFixed(1)}% of supply.`,
    severity: "warn",
    impact: -10,
    when: (f) => f.top10SumPct > 40 && f.top10SumPct <= 60,
    evidence: (f) => ({ top10SumPct: f.top10SumPct }),
  },
  {
    id: "DIST_CREATOR_BALANCE_HIGH",
    label: "Creator retains large token balance",
    description: (f) => `The creator wallet still holds ${f.creatorBalancePct.toFixed(1)}% of total supply.`,
    severity: "danger",
    impact: -20,
    when: (f) => f.creatorBalancePct > 15,
    evidence: (f) => ({ creatorBalancePct: f.creatorBalancePct }),
  },
  {
    id: "DIST_CREATOR_BALANCE_ELEVATED",
    label: "Creator retains a notable token balance",
    description: (f) => `The creator wallet still holds ${f.creatorBalancePct.toFixed(1)}% of total supply.`,
    severity: "warn",
    impact: -8,
    when: (f) => f.creatorBalancePct > 5 && f.creatorBalancePct <= 15,
    evidence: (f) => ({ creatorBalancePct: f.creatorBalancePct }),
  },
  {
    id: "DIST_HOLDER_BASE_THIN",
    label: "Very thin holder base",
    description: (f) => `Only ${f.totalHolders} holders detected, a fragile and easily manipulable base.`,
    severity: "danger",
    impact: -18,
    when: (f) => f.totalHoldersKnown && f.totalHolders < 50,
    evidence: (f) => ({ totalHolders: f.totalHolders }),
  },
  {
    id: "DIST_HOLDER_BASE_SMALL",
    label: "Small holder base",
    description: (f) => `${f.totalHolders} holders detected; still an early, unproven distribution.`,
    severity: "warn",
    impact: -6,
    when: (f) => f.totalHoldersKnown && f.totalHolders >= 50 && f.totalHolders < 200,
    evidence: (f) => ({ totalHolders: f.totalHolders }),
  },
  {
    id: "DIST_HOLDER_COUNT_UNAVAILABLE",
    label: "Total holder count unavailable",
    description: () =>
      "The data source did not return a reliable total holder count for this token; concentration analysis below relies only on the visible top-holder sample.",
    severity: "info",
    impact: 0,
    when: (f) => !f.totalHoldersKnown,
    evidence: () => ({}),
  },
  {
    id: "DIST_INSIDER_NETWORKS",
    label: "Insider wallet networks detected",
    description: (f) =>
      `${f.insiderNetworksDetected} linked insider wallet network(s) detected (${f.insiderHolderCount} flagged holders among top wallets), indicating coordinated/bundled ownership.`,
    severity: "danger",
    impact: -25,
    when: (f) => f.insiderNetworksDetected > 0,
    evidence: (f) => ({
      insiderNetworksDetected: f.insiderNetworksDetected,
      insiderHolderCount: f.insiderHolderCount,
    }),
  },
  {
    id: "DIST_HEALTHY_SPREAD",
    label: "Healthy, broad distribution",
    description: (f) =>
      `Top holder at ${f.top1Pct.toFixed(1)}%, top 10 at ${f.top10SumPct.toFixed(1)}%, across ${f.totalHolders} holders - a comparatively organic spread.`,
    severity: "positive",
    impact: 8,
    when: (f) =>
      f.top1Pct <= 5 &&
      f.top10SumPct <= 25 &&
      f.totalHoldersKnown &&
      f.totalHolders >= 500 &&
      f.insiderNetworksDetected === 0,
    evidence: (f) => ({ top1Pct: f.top1Pct, top10SumPct: f.top10SumPct, totalHolders: f.totalHolders }),
  },
];

export function runDistributionEngine(input: SecurityRawInput): EngineResult {
  const features = extractFeatures(input);
  const triggers = evaluateRules(features, RULES);
  const score = scoreFromBase(100, triggers);

  const sampleConfidence = input.topHolders.length > 0 ? Math.min(1, input.topHolders.length / 10) : 0.2;
  const confidence = features.totalHoldersKnown ? sampleConfidence : sampleConfidence * 0.6;

  const summary =
    score >= 80
      ? "Ownership is broadly and organically distributed."
      : score >= 55
        ? "Distribution is acceptable but shows some concentration to monitor."
        : score >= 30
          ? "Meaningful concentration risk: a small set of wallets could move the market unilaterally."
          : "Severe concentration/insider risk: ownership structure resembles a controlled or bundled launch.";

  return {
    id: "distribution",
    label: "Holder Distribution Quality",
    score,
    direction: "higher_is_better",
    confidence,
    triggers,
    rulesEvaluatedCount: RULES.length,
    features: features as unknown as Record<string, string | number | boolean | null>,
    summary,
  };
}
