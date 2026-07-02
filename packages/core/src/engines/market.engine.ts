import type { EngineResult, MarketRawInput } from "../types.js";
import { evaluateRules, scoreFromBase, type RuleDef } from "./rule-kit.js";
import { pairAgeHours, primaryPair, safeDiv, totalLiquidityUsd, totalVolume24h } from "./market-utils.js";

interface MarketFeatures {
  liquidityUsd: number;
  volume24h: number;
  volumeToLiquidity: number;
  fdvUsd: number;
  marketCapUsd: number;
  fdvToMcap: number;
  txCount24h: number;
  numPairs: number;
  pairAgeHours: number | undefined;
  hasNoMarket: boolean;
}

function extractFeatures(input: MarketRawInput, now: Date): MarketFeatures {
  const pair = primaryPair(input);
  const liquidityUsd = totalLiquidityUsd(input);
  const volume24h = totalVolume24h(input);
  const fdvUsd = pair?.fdvUsd ?? 0;
  const marketCapUsd = pair?.marketCapUsd ?? 0;
  const txCount24h = pair ? pair.txns.h24.buys + pair.txns.h24.sells : 0;

  return {
    liquidityUsd,
    volume24h,
    volumeToLiquidity: safeDiv(volume24h, liquidityUsd, 0),
    fdvUsd,
    marketCapUsd,
    fdvToMcap: marketCapUsd > 0 ? safeDiv(fdvUsd, marketCapUsd, 1) : 1,
    txCount24h,
    numPairs: input.pairs.length,
    pairAgeHours: pairAgeHours(pair, now),
    hasNoMarket: input.pairs.length === 0,
  };
}

const RULES: RuleDef<MarketFeatures>[] = [
  {
    id: "MKT_NO_MARKET",
    label: "No tradable market found",
    description: () => "No DEX pair could be found for this token address.",
    severity: "danger",
    impact: -100,
    when: (f) => f.hasNoMarket,
    evidence: (f) => ({ numPairs: f.numPairs }),
  },
  {
    id: "MKT_LIQUIDITY_CRITICAL",
    label: "Critically low liquidity",
    description: (f) => `Total liquidity is only $${f.liquidityUsd.toLocaleString("en-US")}; large slippage is guaranteed.`,
    severity: "danger",
    impact: -35,
    when: (f) => !f.hasNoMarket && f.liquidityUsd < 5000,
    evidence: (f) => ({ liquidityUsd: f.liquidityUsd }),
  },
  {
    id: "MKT_LIQUIDITY_LOW",
    label: "Low liquidity",
    description: (f) => `Total liquidity is $${f.liquidityUsd.toLocaleString("en-US")}; expect meaningful slippage on moderate size.`,
    severity: "warn",
    impact: -15,
    when: (f) => f.liquidityUsd >= 5000 && f.liquidityUsd < 20000,
    evidence: (f) => ({ liquidityUsd: f.liquidityUsd }),
  },
  {
    id: "MKT_LIQUIDITY_SOLID",
    label: "Solid liquidity depth",
    description: (f) => `Total liquidity is $${f.liquidityUsd.toLocaleString("en-US")}, supporting reasonable trade sizes.`,
    severity: "positive",
    impact: 10,
    when: (f) => f.liquidityUsd >= 50000,
    evidence: (f) => ({ liquidityUsd: f.liquidityUsd }),
  },
  {
    id: "MKT_VOLUME_DEAD",
    label: "Negligible trading volume",
    description: (f) => `24h volume is only $${f.volume24h.toLocaleString("en-US")} - the market is effectively inactive.`,
    severity: "danger",
    impact: -30,
    when: (f) => !f.hasNoMarket && f.volume24h < 1000,
    evidence: (f) => ({ volume24h: f.volume24h }),
  },
  {
    id: "MKT_TX_COUNT_LOW",
    label: "Very few trades in 24h",
    description: (f) => `Only ${f.txCount24h} buy/sell transactions in the last 24h.`,
    severity: "danger",
    impact: -15,
    when: (f) => !f.hasNoMarket && f.txCount24h < 10,
    evidence: (f) => ({ txCount24h: f.txCount24h }),
  },
  {
    id: "MKT_TURNOVER_HEALTHY",
    label: "Healthy volume-to-liquidity turnover",
    description: (f) => `Volume/liquidity ratio of ${f.volumeToLiquidity.toFixed(2)}x suggests organic, sustainable trading turnover.`,
    severity: "positive",
    impact: 8,
    when: (f) => !f.hasNoMarket && f.volumeToLiquidity >= 0.2 && f.volumeToLiquidity <= 5,
    evidence: (f) => ({ volumeToLiquidity: f.volumeToLiquidity }),
  },
  {
    id: "MKT_FDV_DILUTION_GAP",
    label: "Large FDV vs market cap gap",
    description: (f) =>
      `Fully diluted value is ${f.fdvToMcap.toFixed(1)}x the current market cap, implying large future dilution or a big unreleased/locked supply.`,
    severity: "warn",
    impact: -10,
    when: (f) => f.marketCapUsd > 0 && f.fdvToMcap > 3,
    evidence: (f) => ({ fdvToMcap: f.fdvToMcap, fdvUsd: f.fdvUsd, marketCapUsd: f.marketCapUsd }),
  },
  {
    id: "MKT_MULTI_PAIR",
    label: "Multiple active trading pairs",
    description: (f) => `${f.numPairs} distinct pairs are actively trading this token, spreading liquidity risk.`,
    severity: "positive",
    impact: 5,
    when: (f) => f.numPairs >= 3,
    evidence: (f) => ({ numPairs: f.numPairs }),
  },
  {
    id: "MKT_VERY_NEW_PAIR",
    label: "Extremely new pair",
    description: (f) => `The primary pair is only ${f.pairAgeHours?.toFixed(1)}h old - unproven and highly volatile by definition.`,
    severity: "info",
    impact: -5,
    when: (f) => f.pairAgeHours !== undefined && f.pairAgeHours < 1,
    evidence: (f) => ({ pairAgeHours: f.pairAgeHours ?? null }),
  },
];

export function runMarketEngine(input: MarketRawInput, now: Date): EngineResult {
  const features = extractFeatures(input, now);
  const triggers = evaluateRules(features, RULES);
  const score = scoreFromBase(100, triggers);

  const confidence = features.hasNoMarket ? 0 : Math.min(1, 0.5 + features.numPairs * 0.15);

  const summary = features.hasNoMarket
    ? "No tradable market found for this address on the tracked DEXes."
    : score >= 80
      ? "Strong, liquid, actively traded microstructure."
      : score >= 55
        ? "Workable market structure with some liquidity or activity caveats."
        : score >= 30
          ? "Fragile microstructure: thin liquidity and/or weak trading activity."
          : "Market structure is effectively non-viable for meaningful trade sizes.";

  return {
    id: "market",
    label: "Market Structure Quality",
    score,
    direction: "higher_is_better",
    confidence,
    triggers,
    rulesEvaluatedCount: RULES.length,
    features: features as unknown as Record<string, string | number | boolean | null>,
    summary,
  };
}
