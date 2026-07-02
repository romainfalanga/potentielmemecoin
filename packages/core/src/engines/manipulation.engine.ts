import type { AnalysisRawInput, EngineResult } from "../types.js";
import { evaluateRules, scoreFromBase, type RuleDef } from "./rule-kit.js";
import { avgTradeSizeUsd, pairAgeHours, primaryPair, safeDiv, totalLiquidityUsd, totalVolume24h } from "./market-utils.js";

interface ManipulationFeatures {
  volumeToLiquidity: number;
  avgTradeSizeUsd: number;
  txCount24h: number;
  volume24h: number;
  sellCount24h: number;
  buyCount24h: number;
  buySellSkew: number;
  top1Pct: number;
  creatorBalancePct: number;
  insiderNetworksDetected: number;
  pairAgeHours: number | undefined;
  priceChangeH1: number;
  priceChangeM5: number;
  hasNoMarket: boolean;
}

function extractFeatures(input: AnalysisRawInput, now: Date): ManipulationFeatures {
  const pair = primaryPair(input.market);
  const liquidityUsd = totalLiquidityUsd(input.market);
  const volume24h = totalVolume24h(input.market);
  const buyCount24h = pair?.txns.h24.buys ?? 0;
  const sellCount24h = pair?.txns.h24.sells ?? 0;
  const txCount24h = buyCount24h + sellCount24h;
  const sortedHolders = [...input.security.topHolders].sort((a, b) => b.pct - a.pct);

  return {
    volumeToLiquidity: safeDiv(volume24h, liquidityUsd, 0),
    avgTradeSizeUsd: avgTradeSizeUsd(pair),
    txCount24h,
    volume24h,
    sellCount24h,
    buyCount24h,
    buySellSkew: safeDiv(Math.abs(buyCount24h - sellCount24h), Math.max(1, txCount24h), 0),
    top1Pct: sortedHolders[0]?.pct ?? 0,
    creatorBalancePct: input.security.creatorBalancePct ?? 0,
    insiderNetworksDetected: input.security.insiderNetworksDetected,
    pairAgeHours: pairAgeHours(pair, now),
    priceChangeH1: pair?.priceChangePct.h1 ?? 0,
    priceChangeM5: pair?.priceChangePct.m5 ?? 0,
    hasNoMarket: input.market.pairs.length === 0,
  };
}

// Note: this engine is scored on a RISK scale (0 = clean, 100 = heavily
// manipulated), unlike the other engines which score "quality". The
// aggregator inverts it when computing the global opportunity score.
const RULES: RuleDef<ManipulationFeatures>[] = [
  {
    id: "MANIP_VOLUME_LIQUIDITY_EXTREME",
    label: "Extreme volume-to-liquidity ratio",
    description: (f) =>
      `24h volume is ${f.volumeToLiquidity.toFixed(1)}x total liquidity, a level rarely explainable by organic trading and typical of wash trading.`,
    severity: "danger",
    impact: 30,
    when: (f) => !f.hasNoMarket && f.volumeToLiquidity > 20,
    evidence: (f) => ({ volumeToLiquidity: f.volumeToLiquidity }),
  },
  {
    id: "MANIP_VOLUME_LIQUIDITY_HIGH",
    label: "Elevated volume-to-liquidity ratio",
    description: (f) => `24h volume is ${f.volumeToLiquidity.toFixed(1)}x total liquidity, above organic norms.`,
    severity: "warn",
    impact: 12,
    when: (f) => !f.hasNoMarket && f.volumeToLiquidity > 8 && f.volumeToLiquidity <= 20,
    evidence: (f) => ({ volumeToLiquidity: f.volumeToLiquidity }),
  },
  {
    id: "MANIP_LOW_PARTICIPATION_HIGH_VOLUME",
    label: "High volume with very few participants",
    description: (f) =>
      `Only ${f.txCount24h} trades produced $${f.volume24h.toLocaleString("en-US")} of 24h volume (avg trade ~$${f.avgTradeSizeUsd.toLocaleString("en-US")}), consistent with a small set of wallets recycling volume.`,
    severity: "danger",
    impact: 25,
    when: (f) => !f.hasNoMarket && f.volume24h > 50000 && f.txCount24h < 30,
    evidence: (f) => ({ volume24h: f.volume24h, txCount24h: f.txCount24h, avgTradeSizeUsd: f.avgTradeSizeUsd }),
  },
  {
    id: "MANIP_AVG_TRADE_SIZE_ABNORMAL",
    label: "Abnormally large average trade size",
    description: (f) =>
      `Average trade size is ~$${f.avgTradeSizeUsd.toLocaleString("en-US")}, unusually large for a retail-driven memecoin market.`,
    severity: "warn",
    impact: 10,
    when: (f) => !f.hasNoMarket && f.avgTradeSizeUsd > 3000 && f.txCount24h > 0,
    evidence: (f) => ({ avgTradeSizeUsd: f.avgTradeSizeUsd }),
  },
  {
    id: "MANIP_INSIDER_NETWORKS",
    label: "Coordinated insider wallet networks",
    description: (f) => `${f.insiderNetworksDetected} linked wallet network(s) detected among holders, suggesting bundled/coordinated buying.`,
    severity: "danger",
    impact: 25,
    when: (f) => f.insiderNetworksDetected > 0,
    evidence: (f) => ({ insiderNetworksDetected: f.insiderNetworksDetected }),
  },
  {
    id: "MANIP_SELF_SEEDING_PATTERN",
    label: "Likely self-seeding by creator",
    description: (f) =>
      `Creator holds ${f.creatorBalancePct.toFixed(1)}% of supply on a pair only ${f.pairAgeHours?.toFixed(1)}h old with elevated volume - a pattern consistent with developer self-trading to fabricate activity.`,
    severity: "danger",
    impact: 20,
    when: (f) => f.creatorBalancePct > 8 && f.pairAgeHours !== undefined && f.pairAgeHours < 24 && f.volumeToLiquidity > 3,
    evidence: (f) => ({ creatorBalancePct: f.creatorBalancePct, pairAgeHours: f.pairAgeHours ?? null, volumeToLiquidity: f.volumeToLiquidity }),
  },
  {
    id: "MANIP_WHALE_HIGH_TURNOVER",
    label: "Dominant holder alongside abnormal turnover",
    description: (f) =>
      `The largest holder controls ${f.top1Pct.toFixed(1)}% of supply while volume/liquidity turnover is ${f.volumeToLiquidity.toFixed(1)}x - the whale may be trading against itself.`,
    severity: "warn",
    impact: 12,
    when: (f) => f.top1Pct > 15 && f.volumeToLiquidity > 5,
    evidence: (f) => ({ top1Pct: f.top1Pct, volumeToLiquidity: f.volumeToLiquidity }),
  },
  {
    id: "MANIP_ONE_SIDED_FLOW",
    label: "One-sided order flow",
    description: (f) =>
      `Buy/sell transaction counts are heavily skewed (${f.buyCount24h} buys vs ${f.sellCount24h} sells), which can indicate spoofed or gated trading.`,
    severity: "warn",
    impact: 8,
    when: (f) => !f.hasNoMarket && f.txCount24h > 20 && f.buySellSkew > 0.85,
    evidence: (f) => ({ buyCount24h: f.buyCount24h, sellCount24h: f.sellCount24h, buySellSkew: f.buySellSkew }),
  },
  {
    id: "MANIP_SPIKE_REVERSAL",
    label: "Spike-and-reversal signature",
    description: (f) =>
      `1h price change of ${f.priceChangeH1.toFixed(0)}% followed by a sharp 5m reversal of ${f.priceChangeM5.toFixed(0)}% resembles a pump followed by an engineered dump.`,
    severity: "warn",
    impact: 12,
    when: (f) => f.priceChangeH1 > 100 && f.priceChangeM5 < -15,
    evidence: (f) => ({ priceChangeH1: f.priceChangeH1, priceChangeM5: f.priceChangeM5 }),
  },
  {
    id: "MANIP_NO_SELLS",
    label: "No recorded sells despite active buying",
    description: (f) => `${f.buyCount24h} buys were recorded in 24h with zero sells, a potential honeypot/sell-blocking signature.`,
    severity: "danger",
    impact: 20,
    when: (f) => f.buyCount24h >= 10 && f.sellCount24h === 0,
    evidence: (f) => ({ buyCount24h: f.buyCount24h, sellCount24h: f.sellCount24h }),
  },
  {
    id: "MANIP_CLEAN_PROFILE",
    label: "No manipulation signatures detected",
    description: () => "Volume, participation, and holder patterns fall within organic, explainable ranges.",
    severity: "positive",
    impact: -8,
    when: (f) =>
      !f.hasNoMarket &&
      f.volumeToLiquidity <= 5 &&
      f.txCount24h >= 30 &&
      f.insiderNetworksDetected === 0 &&
      f.top1Pct <= 10,
    evidence: (f) => ({ volumeToLiquidity: f.volumeToLiquidity, txCount24h: f.txCount24h }),
  },
];

export function runManipulationEngine(input: AnalysisRawInput, now: Date): EngineResult {
  const features = extractFeatures(input, now);
  const triggers = evaluateRules(features, RULES);
  const score = scoreFromBase(0, triggers);

  const confidence = features.hasNoMarket ? 0 : Math.min(1, 0.4 + features.txCount24h / 100);

  const summary =
    score <= 15
      ? "No meaningful manipulation signatures detected in volume, flow, or holder patterns."
      : score <= 40
        ? "Minor anomalies present; worth monitoring but not conclusive of manipulation."
        : score <= 65
          ? "Multiple manipulation signatures detected: treat apparent strength with skepticism."
          : "Strong evidence of manipulated activity (wash trading, bundling, or coordinated wallets).";

  return {
    id: "manipulation",
    label: "Manipulation / Rug Risk",
    score,
    direction: "higher_is_worse",
    confidence,
    triggers,
    rulesEvaluatedCount: RULES.length,
    features: features as unknown as Record<string, string | number | boolean | null>,
    summary,
  };
}
