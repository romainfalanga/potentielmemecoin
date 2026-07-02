import type { ExternalRiskFlag, HolderInfo, RiskLevel, SecurityRawInput } from "@mae/core";
import { fetchJson } from "./errors.js";

const RUGCHECK_BASE_URL = "https://api.rugcheck.xyz/v1";

/** Subset of the RugCheck `/tokens/{mint}/report` payload that we actually consume. */
interface RugcheckReportRaw {
  mint: string;
  creator?: string;
  creatorBalance?: number;
  token: {
    supply?: number;
    decimals?: number;
    isInitialized?: boolean;
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
  };
  tokenMeta?: { name?: string; symbol?: string; mutable?: boolean };
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  topHolders?: Array<{ address: string; pct: number; owner?: string; insider?: boolean }>;
  risks?: Array<{ name: string; description: string; level: string; score: number }>;
  insiderNetworks?: Array<{ id: string; size: number }>;
  markets?: Array<{ lp?: { baseUSD?: number; quoteUSD?: number; lpLockedPct?: number } }>;
  totalMarketLiquidity?: number;
  totalLPProviders?: number;
  totalHolders?: number;
  rugged?: boolean;
  tokenType?: string;
  transferFee?: { pct?: number };
  score_normalised?: number;
}

function normalizeRiskLevel(level: string): RiskLevel {
  if (level === "danger" || level === "error") return "danger";
  if (level === "warn" || level === "warning") return "warn";
  return "info";
}

function computeLpLockedPct(markets: RugcheckReportRaw["markets"]): number {
  if (!markets || markets.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const market of markets) {
    const lp = market.lp;
    if (!lp) continue;
    const liquidity = (lp.baseUSD ?? 0) + (lp.quoteUSD ?? 0);
    if (liquidity <= 0) continue;
    weightedSum += liquidity * (lp.lpLockedPct ?? 0);
    weightTotal += liquidity;
  }
  if (weightTotal === 0) return 0;
  return weightedSum / weightTotal;
}

export interface RugcheckNormalized {
  security: SecurityRawInput;
  name?: string;
  symbol?: string;
}

export async function fetchRugcheckReport(mint: string): Promise<RugcheckNormalized> {
  const raw = await fetchJson<RugcheckReportRaw>(`${RUGCHECK_BASE_URL}/tokens/${mint}/report`, "rugcheck");

  const supply = raw.token?.supply ?? 0;
  const creatorBalance = raw.creatorBalance ?? 0;
  const creatorBalancePct = supply > 0 ? (creatorBalance / supply) * 100 : 0;

  const topHolders: HolderInfo[] = (raw.topHolders ?? [])
    .slice(0, 15)
    .map((h) => ({ address: h.address, pct: h.pct, isInsider: Boolean(h.insider), owner: h.owner }));

  const externalRiskFlags: ExternalRiskFlag[] = (raw.risks ?? []).map((r) => ({
    name: r.name,
    description: r.description,
    level: normalizeRiskLevel(r.level),
    score: r.score,
  }));

  const mintAuthority = raw.mintAuthority ?? raw.token?.mintAuthority ?? null;
  const freezeAuthority = raw.freezeAuthority ?? raw.token?.freezeAuthority ?? null;

  const security: SecurityRawInput = {
    fetchedAt: new Date().toISOString(),
    mintAuthorityRevoked: mintAuthority === null,
    freezeAuthorityRevoked: freezeAuthority === null,
    metadataMutable: Boolean(raw.tokenMeta?.mutable),
    isInitialized: raw.token?.isInitialized ?? true,
    creatorAddress: raw.creator,
    creatorBalancePct,
    totalHolders: raw.totalHolders ?? topHolders.length,
    topHolders,
    insiderNetworksDetected: raw.insiderNetworks?.length ?? 0,
    lpLockedPct: computeLpLockedPct(raw.markets),
    totalMarketLiquidityUsd: raw.totalMarketLiquidity ?? 0,
    totalLpProviders: raw.totalLPProviders ?? 0,
    externalRiskFlags,
    externalRiskScoreNormalised: raw.score_normalised,
    rugged: Boolean(raw.rugged),
    transferFeeBps: Math.round((raw.transferFee?.pct ?? 0) * 100),
    tokenType: raw.tokenType || "spl",
  };

  return { security, name: raw.tokenMeta?.name, symbol: raw.tokenMeta?.symbol };
}
