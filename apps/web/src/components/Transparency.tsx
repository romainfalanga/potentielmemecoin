import type { AnalysisReport } from "@mae/core";
import { severityColor } from "../lib/colors";

function formatAge(seconds: number): string {
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function Transparency({ report }: { report: AnalysisReport }) {
  const t = report.transparency;

  return (
    <div>
      <div className="transparency-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">Rules evaluated</div>
          <div className="stat-tile-value">{t.rulesEvaluated}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Rules triggered</div>
          <div className="stat-tile-value">{t.rulesTriggered}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Data completeness</div>
          <div className="stat-tile-value">{Math.round(t.dataCompletenessScore * 100)}%</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Engine version</div>
          <div className="stat-tile-value">{report.meta.engineVersion}</div>
        </div>
      </div>

      <div className="stat-tile" style={{ marginBottom: 16 }}>
        <div className="stat-tile-label" style={{ marginBottom: 8 }}>
          Data freshness
        </div>
        {t.dataFreshness.map((d) => (
          <div key={d.source} style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "3px 0" }}>
            {d.source}: <strong style={{ color: "var(--text-primary)" }}>{formatAge(d.ageSeconds)}</strong>
          </div>
        ))}
      </div>

      <ul className="disclaimer-list">
        {t.disclaimers.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>

      <details className="rule-trace">
        <summary>Full rule trace ({t.rulesTriggered} triggered rules across all engines)</summary>
        {report.subScores.map((engine) => (
          <div key={engine.id} className="rule-trace-group">
            <h4>{engine.label}</h4>
            {engine.triggers.length === 0 ? (
              <p className="empty-note">No rules triggered.</p>
            ) : (
              engine.triggers.map((tr) => (
                <div className="rule-row" key={tr.id}>
                  <span className="rule-id">{tr.id}</span>
                  <span className="rule-desc">{tr.description}</span>
                  <span className="rule-impact" style={{ color: severityColor(tr.severity) }}>
                    {tr.impact > 0 ? "+" : ""}
                    {tr.impact}
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </details>
    </div>
  );
}
