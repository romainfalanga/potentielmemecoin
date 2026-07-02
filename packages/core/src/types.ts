/**
 * Domain types for the Memecoin Analysis Engine.
 *
 * This module has zero runtime dependencies and zero knowledge of any
 * external API (DexScreener, RugCheck, Solana RPC, ...). Provider packages
 * are responsible for normalizing third-party payloads into the `Raw*Input`
 * shapes defined here. This boundary is what keeps the scoring/prediction
 * logic deterministic, unit-testable, and swappable per data source.
 */

// ---------------------------------------------------------------------------
// Identity & raw inputs (provider -> core boundary)
// ---------------------------------------------------------------------------

export type ChainId = "solana";

export interface TokenIdentity {
  chain: ChainId;
  address: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
}

export interface HolderInfo {
  address: string;
  /** Percentage of total supply, 0-100 */
  pct: number;
  isInsider: boolean;
  owner?: string;
}

export type RiskLevel = "info" | "warn" | "danger";

export interface ExternalRiskFlag {
  name: string;
  description: string;
  level: RiskLevel;
  /** Raw score contribution as reported by the source, informative only */
  score: number;
}

export interface SecurityRawInput {
  fetchedAt: string;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  metadataMutable: boolean;
  isInitialized: boolean;
  creatorAddress?: string;
  /** Percentage of supply held by the creator wallet, 0-100 */
  creatorBalancePct?: number;
  totalHolders: number;
  /** Top holders sorted descending by pct, excluding known LP/burn addresses when identifiable */
  topHolders: HolderInfo[];
  insiderNetworksDetected: number;
  /** Aggregate % of LP liquidity locked or burned across all detected lockers */
  lpLockedPct: number;
  totalMarketLiquidityUsd: number;
  totalLpProviders: number;
  externalRiskFlags: ExternalRiskFlag[];
  /** Third-party normalized risk score (e.g. RugCheck), 0-100, informative only, never used directly */
  externalRiskScoreNormalised?: number;
  rugged: boolean;
  transferFeeBps?: number;
  tokenType?: string;
}

export interface TxCount {
  buys: number;
  sells: number;
}

export interface DexPairSnapshot {
  pairAddress: string;
  dexId: string;
  quoteSymbol: string;
  /** ISO timestamp of pair creation, if known */
  createdAt?: string;
  priceUsd: number;
  liquidityUsd: number;
  fdvUsd?: number;
  marketCapUsd?: number;
  volume: { m5: number; h1: number; h6: number; h24: number };
  txns: { m5: TxCount; h1: TxCount; h6: TxCount; h24: TxCount };
  priceChangePct: { m5: number; h1: number; h6: number; h24: number };
}

export interface MarketRawInput {
  fetchedAt: string;
  /** All pairs found for the token, sorted by liquidity descending */
  pairs: DexPairSnapshot[];
}

export interface AnalysisRawInput {
  identity: TokenIdentity;
  security: SecurityRawInput;
  market: MarketRawInput;
}

// ---------------------------------------------------------------------------
// Engine outputs
// ---------------------------------------------------------------------------

export type Severity = "info" | "positive" | "warn" | "danger";

export interface RuleTrigger {
  id: string;
  label: string;
  description: string;
  severity: Severity;
  /** Signed points impact on the engine's 0-100 score scale */
  impact: number;
  evidence: Record<string, string | number | boolean | null>;
}

export type ScoreDirection = "higher_is_better" | "higher_is_worse";

export type EngineId =
  | "security"
  | "market"
  | "distribution"
  | "manipulation"
  | "momentum"
  | "virality";

export interface EngineResult {
  id: EngineId;
  label: string;
  /** 0-100, meaning depends on `direction` */
  score: number;
  direction: ScoreDirection;
  /** 0-1, how complete/fresh the underlying data was */
  confidence: number;
  triggers: RuleTrigger[];
  /** Total number of rules evaluated by this engine, triggered or not (for the transparency layer) */
  rulesEvaluatedCount: number;
  features: Record<string, string | number | boolean | null>;
  summary: string;
}

// ---------------------------------------------------------------------------
// Scoring aggregation
// ---------------------------------------------------------------------------

export interface WeightedComponent {
  id: EngineId;
  label: string;
  weight: number;
  /** Score after inversion, always on a higher_is_better 0-100 scale */
  normalizedScore: number;
  contribution: number;
}

export type Verdict =
  | "avoid_critical_risk"
  | "high_risk_speculative"
  | "caution_mixed_signals"
  | "watch_early_stage"
  | "interesting_short_term"
  | "structurally_sound_speculative";

export interface GlobalScoreResult {
  score: number;
  verdict: Verdict;
  verdictLabel: string;
  weightedComponents: WeightedComponent[];
  rationale: string[];
}

// ---------------------------------------------------------------------------
// Multi-horizon prediction
// ---------------------------------------------------------------------------

export type Horizon = "1h" | "6h" | "12h" | "24h" | "7d" | "30d";

export interface HorizonScenario {
  horizon: Horizon;
  continuationProbability: number;
  rejectionRisk: number;
  pumpProbability: number;
  narrativeSurvivalProbability: number;
  confidence: number;
  dominantFactors: string[];
}

export interface PredictionResult {
  generatedAt: string;
  scenarios: HorizonScenario[];
  methodologyNote: string;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface RedFlag {
  engineId: EngineId;
  ruleId: string;
  label: string;
  description: string;
  severity: Severity;
}

export interface FactorSummary {
  label: string;
  detail: string;
  engineId: EngineId;
}

export interface DataFreshness {
  source: string;
  fetchedAt: string;
  ageSeconds: number;
}

export interface AnalysisReport {
  meta: {
    generatedAt: string;
    engineVersion: string;
    tokenAddress: string;
    chain: ChainId;
    tokenName?: string;
    tokenSymbol?: string;
  };
  verdict: Verdict;
  verdictLabel: string;
  verdictNarrative: string;
  globalScore: GlobalScoreResult;
  subScores: EngineResult[];
  bullFactors: FactorSummary[];
  bearFactors: FactorSummary[];
  redFlags: RedFlag[];
  scenarios: PredictionResult;
  transparency: {
    dataFreshness: DataFreshness[];
    rulesEvaluated: number;
    rulesTriggered: number;
    dataCompletenessScore: number;
    disclaimers: string[];
  };
}
