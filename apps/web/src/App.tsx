import { useCallback, useEffect, useState } from "react";
import type { AnalysisReport } from "@mae/core";
import { analyzeToken, fetchAnalysis, fetchHistory, type HistoryItem } from "./lib/api";
import { VerdictBanner } from "./components/VerdictBanner";
import { ScoreGrid } from "./components/ScoreGrid";
import { FactorColumns, RedFlagList } from "./components/Factors";
import { ScenarioTable } from "./components/ScenarioTable";
import { Transparency } from "./components/Transparency";
import { History } from "./components/History";

export function App() {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async (targetAddress: string) => {
    setLoading(true);
    setError(null);
    try {
      const { report } = await analyzeToken(targetAddress);
      setReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!report) return;
    fetchHistory(report.meta.tokenAddress).then(setHistory);
  }, [report]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;
    void runAnalysis(trimmed);
  };

  const handleSelectHistory = async (id: string) => {
    const historical = await fetchAnalysis(id);
    if (historical) setReport(historical);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Memecoin Analysis Engine</h1>
        <p>
          Algorithm-first, explainable due-diligence for Solana memecoins. Enter a token address to run a
          deterministic, rule-based analysis of its security, market structure, distribution, manipulation risk,
          momentum, and viral/meme potential.
        </p>
        <form className="search-form" onSubmit={handleSubmit}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Solana token mint address (e.g. DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263)"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={loading || !address.trim()}>
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </form>
        {loading && <div className="loading-banner">Fetching on-chain, holder, and market data, then running the rule engines...</div>}
        {error && <div className="error-banner">{error}</div>}
      </header>

      {report && (
        <>
          <VerdictBanner report={report} />

          <section className="section">
            <h2 className="section-title">Sub-scores</h2>
            <ScoreGrid engines={report.subScores} />
          </section>

          <section className="section card">
            <h2 className="section-title">Bull / bear factors</h2>
            <FactorColumns bull={report.bullFactors} bear={report.bearFactors} />
          </section>

          <section className="section card">
            <h2 className="section-title">Red flags</h2>
            <RedFlagList flags={report.redFlags} />
          </section>

          <section className="section card">
            <h2 className="section-title">Multi-horizon scenarios</h2>
            <ScenarioTable prediction={report.scenarios} />
          </section>

          <section className="section card">
            <h2 className="section-title">Algorithmic transparency</h2>
            <Transparency report={report} />
          </section>

          <section className="section card">
            <h2 className="section-title">Analysis history for this token</h2>
            <History history={history} onSelect={handleSelectHistory} />
          </section>
        </>
      )}

      {!report && !loading && (
        <div className="footer-note" style={{ marginTop: 60 }}>
          This is a decision-support tool, not financial advice. All scores are deterministic and rule-based -
          no LLM or price prediction is involved in V1.
        </div>
      )}
    </div>
  );
}
