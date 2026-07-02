import type { DexPairSnapshot, MarketRawInput } from "../types.js";
import { safeDiv } from "./rule-kit.js";

export function primaryPair(input: MarketRawInput): DexPairSnapshot | undefined {
  if (input.pairs.length === 0) return undefined;
  return [...input.pairs].sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0];
}

export function totalLiquidityUsd(input: MarketRawInput): number {
  return input.pairs.reduce((sum, p) => sum + p.liquidityUsd, 0);
}

export function totalVolume24h(input: MarketRawInput): number {
  return input.pairs.reduce((sum, p) => sum + p.volume.h24, 0);
}

export function pairAgeHours(pair: DexPairSnapshot | undefined, now: Date): number | undefined {
  if (!pair?.createdAt) return undefined;
  const created = new Date(pair.createdAt).getTime();
  if (Number.isNaN(created)) return undefined;
  return safeDiv(now.getTime() - created, 1000 * 60 * 60);
}

export function avgTradeSizeUsd(pair: DexPairSnapshot | undefined): number {
  if (!pair) return 0;
  const txCount = pair.txns.h24.buys + pair.txns.h24.sells;
  return safeDiv(pair.volume.h24, txCount, 0);
}

export { safeDiv };
