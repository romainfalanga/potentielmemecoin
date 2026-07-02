import type {
  AnalysisRawInput,
  AnalysisReport,
  DataFreshness,
  EngineResult,
  FactorSummary,
  GlobalScoreResult,
  PredictionResult,
  RedFlag,
} from "../types.js";

const ENGINE_VERSION = "1.0.0";

function collectFactors(engines: EngineResult[]): { bull: FactorSummary[]; bear: FactorSummary[] } {
  const bull: FactorSummary[] = [];
  const bear: FactorSummary[] = [];

  for (const engine of engines) {
    for (const trigger of engine.triggers) {
      const item: FactorSummary = { label: trigger.label, detail: trigger.description, engineId: engine.id };
      if (trigger.severity === "positive") bull.push(item);
      else if (trigger.severity === "danger" || trigger.severity === "warn") bear.push(item);
    }
  }

  return { bull: bull.slice(0, 12), bear: bear.slice(0, 12) };
}

function collectRedFlags(engines: EngineResult[]): RedFlag[] {
  const flags: RedFlag[] = [];
  for (const engine of engines) {
    for (const trigger of engine.triggers) {
      if (trigger.severity === "danger") {
        flags.push({
          engineId: engine.id,
          ruleId: trigger.id,
          label: trigger.label,
          description: trigger.description,
          severity: trigger.severity,
        });
      }
    }
  }
  return flags;
}

function buildVerdictNarrative(global: GlobalScoreResult, engines: EngineResult[]): string {
  const byId = Object.fromEntries(engines.map((e) => [e.id, e] as const));
  const parts: string[] = [...global.rationale];

  const manipulation = byId.manipulation;
  if (manipulation && manipulation.score >= 50) {
    parts.push("Apparent strength should be treated with caution given detected manipulation signatures.");
  }

  const virality = byId.virality;
  const security = byId.security;
  if (virality && security && virality.score >= 70 && security.score < 50) {
    parts.push("Strong narrative/meme appeal is undermined by structural weaknesses: hype without safety.");
  }

  return parts.filter(Boolean).join(" ");
}

export function buildReport(
  rawInput: AnalysisRawInput,
  engines: EngineResult[],
  globalScore: GlobalScoreResult,
  prediction: PredictionResult,
  now: Date,
): AnalysisReport {
  const { bull, bear } = collectFactors(engines);
  const redFlags = collectRedFlags(engines);

  const ageSeconds = (iso: string) => Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));

  const dataFreshness: DataFreshness[] = [
    {
      source: "security (contract & holder risk analysis)",
      fetchedAt: rawInput.security.fetchedAt,
      ageSeconds: ageSeconds(rawInput.security.fetchedAt),
    },
    {
      source: "market (DEX pair aggregation)",
      fetchedAt: rawInput.market.fetchedAt,
      ageSeconds: ageSeconds(rawInput.market.fetchedAt),
    },
  ];

  const rulesEvaluated = engines.reduce((s, e) => s + e.rulesEvaluatedCount, 0);
  const rulesTriggered = engines.reduce((s, e) => s + e.triggers.length, 0);
  const dataCompletenessScore = engines.length ? engines.reduce((s, e) => s + e.confidence, 0) / engines.length : 0;

  return {
    meta: {
      generatedAt: now.toISOString(),
      engineVersion: ENGINE_VERSION,
      tokenAddress: rawInput.identity.address,
      chain: rawInput.identity.chain,
      tokenName: rawInput.identity.name,
      tokenSymbol: rawInput.identity.symbol,
    },
    verdict: globalScore.verdict,
    verdictLabel: globalScore.verdictLabel,
    verdictNarrative: buildVerdictNarrative(globalScore, engines),
    globalScore,
    subScores: engines,
    bullFactors: bull,
    bearFactors: bear,
    redFlags,
    scenarios: prediction,
    transparency: {
      dataFreshness,
      rulesEvaluated,
      rulesTriggered,
      dataCompletenessScore: Math.round(dataCompletenessScore * 100) / 100,
      disclaimers: [
        "This report is a structured decision-support tool, not financial advice and not a price prediction.",
        "All scores are deterministic and rule-based (V1); no LLM or ML model influenced this output.",
        "Memecoin markets are adversarial and noisy - absence of red flags does not guarantee safety.",
      ],
    },
  };
}
