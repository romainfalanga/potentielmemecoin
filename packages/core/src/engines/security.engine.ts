import type { EngineResult, SecurityRawInput } from "../types.js";
import { evaluateRules, scoreFromBase, type RuleDef } from "./rule-kit.js";

interface SecurityFeatures {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  metadataMutable: boolean;
  isInitialized: boolean;
  lpLockedPct: number;
  totalMarketLiquidityUsd: number;
  totalLpProviders: number;
  rugged: boolean;
  transferFeeBps: number;
  dangerFlagCount: number;
  warnFlagCount: number;
  externalRiskFlagNames: string;
}

function extractFeatures(input: SecurityRawInput): SecurityFeatures {
  return {
    mintAuthorityRevoked: input.mintAuthorityRevoked,
    freezeAuthorityRevoked: input.freezeAuthorityRevoked,
    metadataMutable: input.metadataMutable,
    isInitialized: input.isInitialized,
    lpLockedPct: input.lpLockedPct,
    totalMarketLiquidityUsd: input.totalMarketLiquidityUsd,
    totalLpProviders: input.totalLpProviders,
    rugged: input.rugged,
    transferFeeBps: input.transferFeeBps ?? 0,
    dangerFlagCount: input.externalRiskFlags.filter((f) => f.level === "danger").length,
    warnFlagCount: input.externalRiskFlags.filter((f) => f.level === "warn").length,
    externalRiskFlagNames: input.externalRiskFlags.map((f) => f.name).join(", "),
  };
}

const RULES: RuleDef<SecurityFeatures>[] = [
  {
    id: "SEC_RUGGED_FLAG",
    label: "Token flagged as rugged",
    description: () => "The token has already been flagged as rugged by on-chain risk analysis.",
    severity: "danger",
    impact: -100,
    when: (f) => f.rugged,
    evidence: (f) => ({ rugged: f.rugged }),
  },
  {
    id: "SEC_MINT_AUTHORITY_ACTIVE",
    label: "Mint authority not revoked",
    description: () =>
      "The token creator can still mint new supply at will, which can dilute or destroy holder value instantly.",
    severity: "danger",
    impact: -35,
    when: (f) => !f.mintAuthorityRevoked,
    evidence: (f) => ({ mintAuthorityRevoked: f.mintAuthorityRevoked }),
  },
  {
    id: "SEC_FREEZE_AUTHORITY_ACTIVE",
    label: "Freeze authority not revoked",
    description: () =>
      "The token creator can freeze holder token accounts, a common precursor to a rug or a honeypot where holders cannot sell.",
    severity: "danger",
    impact: -30,
    when: (f) => !f.freezeAuthorityRevoked,
    evidence: (f) => ({ freezeAuthorityRevoked: f.freezeAuthorityRevoked }),
  },
  {
    id: "SEC_METADATA_MUTABLE",
    label: "Mutable metadata",
    description: () =>
      "Token name, symbol or image can be changed after launch, enabling silent rebrands or impersonation switches.",
    severity: "warn",
    impact: -8,
    when: (f) => f.metadataMutable,
    evidence: (f) => ({ metadataMutable: f.metadataMutable }),
  },
  {
    id: "SEC_NOT_INITIALIZED",
    label: "Token account not fully initialized",
    description: () => "The on-chain mint account reports an incomplete initialization state.",
    severity: "warn",
    impact: -10,
    when: (f) => !f.isInitialized,
    evidence: (f) => ({ isInitialized: f.isInitialized }),
  },
  {
    id: "SEC_LP_NOT_LOCKED",
    label: "Liquidity not locked or burned",
    description: (f) =>
      `Only ${f.lpLockedPct.toFixed(1)}% of LP liquidity is locked/burned; the remainder can be pulled by its owner at any time.`,
    severity: "danger",
    impact: -30,
    when: (f) => f.lpLockedPct < 50,
    evidence: (f) => ({ lpLockedPct: f.lpLockedPct }),
  },
  {
    id: "SEC_LP_PARTIALLY_LOCKED",
    label: "Liquidity only partially locked",
    description: (f) =>
      `${f.lpLockedPct.toFixed(1)}% of LP liquidity is locked/burned; a meaningful share remains withdrawable.`,
    severity: "warn",
    impact: -10,
    when: (f) => f.lpLockedPct >= 50 && f.lpLockedPct < 85,
    evidence: (f) => ({ lpLockedPct: f.lpLockedPct }),
  },
  {
    id: "SEC_NO_LP_PROVIDERS",
    label: "No verifiable LP providers",
    description: () => "No liquidity providers could be identified for this token's pools.",
    severity: "danger",
    impact: -15,
    when: (f) => f.totalLpProviders === 0,
    evidence: (f) => ({ totalLpProviders: f.totalLpProviders }),
  },
  {
    id: "SEC_LIQUIDITY_FLOOR_CRITICAL",
    label: "Liquidity below viability floor",
    description: (f) =>
      `Total market liquidity is only $${f.totalMarketLiquidityUsd.toLocaleString("en-US")}, too thin to consider the pool structurally safe.`,
    severity: "danger",
    impact: -15,
    when: (f) => f.totalMarketLiquidityUsd < 2000,
    evidence: (f) => ({ totalMarketLiquidityUsd: f.totalMarketLiquidityUsd }),
  },
  {
    id: "SEC_TRANSFER_FEE_PRESENT",
    label: "Transfer fee / tax extension present",
    description: (f) =>
      `Token transfers carry a built-in fee of ${(f.transferFeeBps / 100).toFixed(2)}%, which can also be used as a sell-blocking mechanism if set adversarially.`,
    severity: "warn",
    impact: -8,
    when: (f) => f.transferFeeBps > 0,
    evidence: (f) => ({ transferFeeBps: f.transferFeeBps }),
  },
  {
    id: "SEC_EXTERNAL_DANGER_FLAGS",
    label: "External danger-level risk flags",
    description: (f) => `${f.dangerFlagCount} danger-level risk flag(s) reported: ${f.externalRiskFlagNames}.`,
    severity: "danger",
    impact: -20,
    when: (f) => f.dangerFlagCount > 0,
    evidence: (f) => ({ dangerFlagCount: f.dangerFlagCount, flags: f.externalRiskFlagNames }),
  },
  {
    id: "SEC_EXTERNAL_WARN_FLAGS",
    label: "External warning-level risk flags",
    description: (f) => `${f.warnFlagCount} warning-level risk flag(s) reported: ${f.externalRiskFlagNames}.`,
    severity: "warn",
    impact: -6,
    when: (f) => f.warnFlagCount > 0 && f.dangerFlagCount === 0,
    evidence: (f) => ({ warnFlagCount: f.warnFlagCount, flags: f.externalRiskFlagNames }),
  },
  {
    id: "SEC_FULLY_REVOKED_AND_LOCKED",
    label: "Authorities revoked and liquidity fully secured",
    description: (f) =>
      `Mint and freeze authorities are revoked and ${f.lpLockedPct.toFixed(0)}% of liquidity is locked/burned - strong structural hygiene.`,
    severity: "positive",
    impact: 6,
    when: (f) => f.mintAuthorityRevoked && f.freezeAuthorityRevoked && f.lpLockedPct >= 85,
    evidence: (f) => ({ lpLockedPct: f.lpLockedPct }),
  },
];

export function runSecurityEngine(input: SecurityRawInput): EngineResult {
  const features = extractFeatures(input);
  const triggers = evaluateRules(features, RULES);
  const score = scoreFromBase(100, triggers);

  const dataPoints = [
    input.mintAuthorityRevoked !== undefined,
    input.freezeAuthorityRevoked !== undefined,
    input.lpLockedPct !== undefined,
    input.totalMarketLiquidityUsd > 0,
    input.externalRiskFlags.length >= 0,
  ];
  const confidence = dataPoints.filter(Boolean).length / dataPoints.length;

  const summary =
    score >= 80
      ? "Contract and liquidity hygiene look sound: authorities revoked, liquidity secured."
      : score >= 55
        ? "Acceptable but imperfect contract hygiene; some structural caveats remain."
        : score >= 30
          ? "Significant structural weaknesses detected in the contract or liquidity setup."
          : "Critical structural red flags: this token exhibits classic rug/honeypot precursors.";

  return {
    id: "security",
    label: "Security & Technical Health",
    score,
    direction: "higher_is_better",
    confidence,
    triggers,
    rulesEvaluatedCount: RULES.length,
    features: features as unknown as Record<string, string | number | boolean | null>,
    summary,
  };
}
