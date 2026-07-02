import type { AnalysisReport } from "@mae/core";
import { VERDICT_STYLE } from "../lib/colors";

export function VerdictBanner({ report }: { report: AnalysisReport }) {
  const style = VERDICT_STYLE[report.verdict];

  return (
    <div className="card">
      <div className="token-identity">
        <span className="token-name">{report.meta.tokenName || "Unknown token"}</span>
        {report.meta.tokenSymbol && <span className="token-symbol">${report.meta.tokenSymbol}</span>}
      </div>
      <div className="token-address">{report.meta.tokenAddress}</div>

      <div className="verdict-banner" style={{ marginTop: 18 }}>
        <div className="verdict-score" style={{ color: style.color }}>
          {report.globalScore.score.toFixed(0)}
        </div>
        <div className="verdict-body">
          <div className="verdict-label" style={{ color: style.color, background: style.bg }}>
            {report.verdictLabel}
          </div>
          <p className="verdict-narrative">{report.verdictNarrative}</p>
        </div>
      </div>
    </div>
  );
}
