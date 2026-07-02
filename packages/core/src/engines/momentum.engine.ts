import type { EngineResult, MarketRawInput } from "../types.js";
import { evaluateRules, scoreFromBase, type RuleDef } from "./rule-kit.js";
import { primaryPair, safeDiv } from "./market-utils.js";

// Above this magnitude, a reported price-change figure is more likely a data
// artifact from the upstream source (observed: a 487,642% h6 reading on an
// established, deeply liquid pair) than a genuine move, and is excluded from
// trend-scoring rules rather than laundered into a confident bullish/bearish claim.
const ANOMALOUS_PRICE_CHANGE_THRESHOLD = 1500;

interface MomentumFeatures {
  priceChangeM5: number;
  priceChangeH1: number;
  priceChangeH6: number;
  priceChangeH24: number;
  buySellRatioH1: number;
  volumeAcceleration: number;
  hasAnomalousPriceChange: boolean;
  hasNoMarket: boolean;
}

function extractFeatures(input: MarketRawInput): MomentumFeatures {
  const pair = primaryPair(input);
  const buysH1 = pair?.txns.h1.buys ?? 0;
  const sellsH1 = pair?.txns.h1.sells ?? 0;
  const h1Volume = pair?.volume.h1 ?? 0;
  const h6Volume = pair?.volume.h6 ?? 0;
  const impliedHourlyBaseline = safeDiv(h6Volume, 6, 0);

  const rawChanges = [
    pair?.priceChangePct.m5 ?? 0,
    pair?.priceChangePct.h1 ?? 0,
    pair?.priceChangePct.h6 ?? 0,
    pair?.priceChangePct.h24 ?? 0,
  ];
  const hasAnomalousPriceChange = rawChanges.some((v) => Math.abs(v) > ANOMALOUS_PRICE_CHANGE_THRESHOLD);

  return {
    priceChangeM5: pair?.priceChangePct.m5 ?? 0,
    priceChangeH1: pair?.priceChangePct.h1 ?? 0,
    priceChangeH6: pair?.priceChangePct.h6 ?? 0,
    priceChangeH24: pair?.priceChangePct.h24 ?? 0,
    buySellRatioH1: safeDiv(buysH1, Math.max(1, sellsH1), buysH1 > 0 ? 2 : 1),
    volumeAcceleration: safeDiv(h1Volume, Math.max(1, impliedHourlyBaseline), 1),
    hasAnomalousPriceChange,
    hasNoMarket: input.pairs.length === 0,
  };
}

const RULES: RuleDef<MomentumFeatures>[] = [
  {
    id: "MOM_ALIGNED_UPTREND",
    label: "Aligned multi-timeframe uptrend",
    description: (f) =>
      `Price is up across 1h (${f.priceChangeH1.toFixed(1)}%), 6h (${f.priceChangeH6.toFixed(1)}%) and 24h (${f.priceChangeH24.toFixed(1)}%) - a coherent trend rather than a single spike.`,
    severity: "positive",
    impact: 18,
    when: (f) => !f.hasAnomalousPriceChange && f.priceChangeH1 > 0 && f.priceChangeH6 > 0 && f.priceChangeH24 > 0,
    evidence: (f) => ({ h1: f.priceChangeH1, h6: f.priceChangeH6, h24: f.priceChangeH24 }),
  },
  {
    id: "MOM_ANOMALOUS_PRICE_DATA",
    label: "Implausible price-change reading excluded",
    description: () =>
      "One or more reported price-change figures are implausibly large and likely a data artifact from the source feed; they were excluded from trend-based rules rather than scored as a genuine move.",
    severity: "info",
    impact: 0,
    when: (f) => f.hasAnomalousPriceChange,
    evidence: (f) => ({ m5: f.priceChangeM5, h1: f.priceChangeH1, h6: f.priceChangeH6, h24: f.priceChangeH24 }),
  },
  {
    id: "MOM_STEEP_DECLINE_24H",
    label: "Steep 24h decline",
    description: (f) => `Price is down ${Math.abs(f.priceChangeH24).toFixed(1)}% over 24h.`,
    severity: "danger",
    impact: -25,
    when: (f) => f.priceChangeH24 < -40,
    evidence: (f) => ({ h24: f.priceChangeH24 }),
  },
  {
    id: "MOM_MODERATE_DECLINE_24H",
    label: "Moderate 24h decline",
    description: (f) => `Price is down ${Math.abs(f.priceChangeH24).toFixed(1)}% over 24h.`,
    severity: "warn",
    impact: -10,
    when: (f) => f.priceChangeH24 <= -15 && f.priceChangeH24 >= -40,
    evidence: (f) => ({ h24: f.priceChangeH24 }),
  },
  {
    id: "MOM_BUY_PRESSURE_DOMINANT",
    label: "Buy pressure dominates recent flow",
    description: (f) => `1h buy/sell transaction ratio is ${f.buySellRatioH1.toFixed(2)}, favoring accumulation.`,
    severity: "positive",
    impact: 10,
    when: (f) => f.buySellRatioH1 > 1.5,
    evidence: (f) => ({ buySellRatioH1: f.buySellRatioH1 }),
  },
  {
    id: "MOM_SELL_PRESSURE_DOMINANT",
    label: "Sell pressure dominates recent flow",
    description: (f) => `1h buy/sell transaction ratio is ${f.buySellRatioH1.toFixed(2)}, favoring distribution.`,
    severity: "warn",
    impact: -12,
    when: (f) => f.buySellRatioH1 < 0.6,
    evidence: (f) => ({ buySellRatioH1: f.buySellRatioH1 }),
  },
  {
    id: "MOM_VOLUME_ACCELERATING",
    label: "Volume accelerating vs recent baseline",
    description: (f) => `Last-hour volume is running at ${f.volumeAcceleration.toFixed(1)}x the trailing 6h hourly average.`,
    severity: "positive",
    impact: 10,
    when: (f) => f.volumeAcceleration > 1.8,
    evidence: (f) => ({ volumeAcceleration: f.volumeAcceleration }),
  },
  {
    id: "MOM_VOLUME_FADING",
    label: "Volume fading vs recent baseline",
    description: (f) => `Last-hour volume is running at only ${f.volumeAcceleration.toFixed(2)}x the trailing 6h hourly average.`,
    severity: "warn",
    impact: -10,
    when: (f) => f.volumeAcceleration < 0.4,
    evidence: (f) => ({ volumeAcceleration: f.volumeAcceleration }),
  },
  {
    id: "MOM_TOPPING_SIGNATURE",
    label: "Possible topping / reversal signature",
    description: (f) =>
      `Strong 1h gain of ${f.priceChangeH1.toFixed(0)}% is being undercut by a 5m move of ${f.priceChangeM5.toFixed(1)}%.`,
    severity: "warn",
    impact: -8,
    when: (f) => !f.hasAnomalousPriceChange && f.priceChangeH1 > 50 && f.priceChangeM5 < -5,
    evidence: (f) => ({ h1: f.priceChangeH1, m5: f.priceChangeM5 }),
  },
  {
    id: "MOM_CONSISTENT_BREAKDOWN",
    label: "Consistent breakdown across all timeframes",
    description: () => "Price is negative across 1h, 6h and 24h simultaneously, indicating a sustained downtrend rather than noise.",
    severity: "danger",
    impact: -15,
    when: (f) => !f.hasAnomalousPriceChange && f.priceChangeH1 < 0 && f.priceChangeH6 < 0 && f.priceChangeH24 < 0,
    evidence: (f) => ({ h1: f.priceChangeH1, h6: f.priceChangeH6, h24: f.priceChangeH24 }),
  },
];

export function runMomentumEngine(input: MarketRawInput): EngineResult {
  const features = extractFeatures(input);
  const triggers = evaluateRules(features, RULES);
  const score = scoreFromBase(50, triggers);

  const confidence = features.hasNoMarket ? 0 : features.hasAnomalousPriceChange ? 0.5 : 0.85;

  const summary = features.hasNoMarket
    ? "No market data available to assess momentum."
    : score >= 70
      ? "Strong, coherent bullish momentum across timeframes."
      : score >= 50
        ? "Mixed or neutral momentum signals."
        : score >= 30
          ? "Weakening momentum with meaningful bearish signals."
          : "Momentum has broken down across timeframes.";

  return {
    id: "momentum",
    label: "Momentum",
    score,
    direction: "higher_is_better",
    confidence,
    triggers,
    rulesEvaluatedCount: RULES.length,
    features: features as unknown as Record<string, string | number | boolean | null>,
    summary,
  };
}
