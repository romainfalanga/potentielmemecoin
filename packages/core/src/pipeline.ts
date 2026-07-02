import type { AnalysisRawInput, AnalysisReport } from "./types.js";
import {
  runSecurityEngine,
  runDistributionEngine,
  runMarketEngine,
  runManipulationEngine,
  runMomentumEngine,
  runViralityEngine,
} from "./engines/index.js";
import { aggregateScores } from "./scoring/index.js";
import { runPredictionEngine } from "./prediction/index.js";
import { buildReport } from "./report/index.js";

/**
 * The single entry point of the analysis engine: pure function, no I/O.
 * Providers fetch and normalize external data into `AnalysisRawInput`;
 * everything downstream of this call is deterministic and testable in
 * isolation from any network or runtime concern.
 */
export function runAnalysis(rawInput: AnalysisRawInput, now: Date = new Date()): AnalysisReport {
  const engines = [
    runSecurityEngine(rawInput.security),
    runDistributionEngine(rawInput.security),
    runMarketEngine(rawInput.market, now),
    runManipulationEngine(rawInput, now),
    runMomentumEngine(rawInput.market),
    runViralityEngine(rawInput.identity),
  ];

  const globalScore = aggregateScores(engines);
  const prediction = runPredictionEngine(engines, now);

  return buildReport(rawInput, engines, globalScore, prediction, now);
}
