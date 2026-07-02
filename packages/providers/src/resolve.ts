import type { AnalysisRawInput, ChainId } from "@mae/core";
import { fetchDexscreenerPairs } from "./dexscreener.js";
import { fetchRugcheckReport } from "./rugcheck.js";

/**
 * Fetches and normalizes all raw provider data for a single token address
 * into the shape the core analysis pipeline expects. This is the only place
 * in the codebase where "DexScreener" and "RugCheck" are named - swapping or
 * adding a data source means touching this file (and its own provider
 * module), never the scoring engines.
 */
export async function resolveAnalysisRawInput(chain: ChainId, address: string): Promise<AnalysisRawInput> {
  const [rugcheck, dexscreener] = await Promise.all([
    fetchRugcheckReport(address),
    fetchDexscreenerPairs(chain, address),
  ]);

  const name = dexscreener.name ?? rugcheck.name;
  const symbol = dexscreener.symbol ?? rugcheck.symbol;

  return {
    identity: { chain, address, name, symbol },
    security: rugcheck.security,
    market: dexscreener.market,
  };
}
