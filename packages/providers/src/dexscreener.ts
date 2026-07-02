import type { DexPairSnapshot, MarketRawInput } from "@mae/core";
import { fetchJson } from "./errors.js";

const DEXSCREENER_BASE_URL = "https://api.dexscreener.com";

interface DexscreenerPairRaw {
  pairAddress: string;
  dexId: string;
  pairCreatedAt?: number;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken: { address: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
}

export interface DexscreenerNormalized {
  market: MarketRawInput;
  name?: string;
  symbol?: string;
}

function toTxCount(t?: { buys?: number; sells?: number }) {
  return { buys: t?.buys ?? 0, sells: t?.sells ?? 0 };
}

/**
 * DexScreener occasionally reports wildly implausible price-change figures
 * for thin/glitched pools (observed: 487,642% on a top-liquidity BONK pair).
 * A real memecoin pump can be extreme, but figures beyond this ceiling are
 * far more likely to be a data artifact than a genuine move, so we clamp
 * rather than let one bad field masquerade as a strong bullish signal.
 */
const MAX_PLAUSIBLE_PRICE_CHANGE_PCT = 5000;

function clampPriceChangePct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-99.99, Math.min(value, MAX_PLAUSIBLE_PRICE_CHANGE_PCT));
}

export async function fetchDexscreenerPairs(chainId: "solana", tokenAddress: string): Promise<DexscreenerNormalized> {
  const pairsRaw = await fetchJson<DexscreenerPairRaw[] | null>(
    `${DEXSCREENER_BASE_URL}/tokens/v1/${chainId}/${tokenAddress}`,
    "dexscreener",
  );

  const matching = (pairsRaw ?? []).filter(
    (p) => p.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase(),
  );

  const pairs: DexPairSnapshot[] = matching
    .map((p) => ({
      pairAddress: p.pairAddress,
      dexId: p.dexId,
      quoteSymbol: p.quoteToken?.symbol ?? "?",
      createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : undefined,
      priceUsd: p.priceUsd ? Number.parseFloat(p.priceUsd) : 0,
      liquidityUsd: p.liquidity?.usd ?? 0,
      fdvUsd: p.fdv,
      marketCapUsd: p.marketCap,
      volume: {
        m5: p.volume?.m5 ?? 0,
        h1: p.volume?.h1 ?? 0,
        h6: p.volume?.h6 ?? 0,
        h24: p.volume?.h24 ?? 0,
      },
      txns: {
        m5: toTxCount(p.txns?.m5),
        h1: toTxCount(p.txns?.h1),
        h6: toTxCount(p.txns?.h6),
        h24: toTxCount(p.txns?.h24),
      },
      priceChangePct: {
        m5: clampPriceChangePct(p.priceChange?.m5 ?? 0),
        h1: clampPriceChangePct(p.priceChange?.h1 ?? 0),
        h6: clampPriceChangePct(p.priceChange?.h6 ?? 0),
        h24: clampPriceChangePct(p.priceChange?.h24 ?? 0),
      },
    }))
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd);

  const best = matching.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

  return {
    market: { fetchedAt: new Date().toISOString(), pairs },
    name: best?.baseToken?.name,
    symbol: best?.baseToken?.symbol,
  };
}
