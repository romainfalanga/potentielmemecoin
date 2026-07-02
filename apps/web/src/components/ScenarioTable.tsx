import type { PredictionResult } from "@mae/core";

function ProbCell({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <td>
      <div className="prob-cell">
        <div className="prob-bar-track">
          <div className="prob-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>{pct}%</span>
      </div>
    </td>
  );
}

export function ScenarioTable({ prediction }: { prediction: PredictionResult }) {
  return (
    <div>
      <div className="scenario-table-wrap">
        <table className="scenario-table">
          <thead>
            <tr>
              <th>Horizon</th>
              <th>Continuation</th>
              <th>Rejection risk</th>
              <th>Pump probability</th>
              <th>Narrative survival</th>
              <th>Confidence</th>
              <th>Dominant factors</th>
            </tr>
          </thead>
          <tbody>
            {prediction.scenarios.map((s) => (
              <tr key={s.horizon}>
                <td style={{ fontWeight: 600 }}>{s.horizon}</td>
                <ProbCell value={s.continuationProbability} />
                <ProbCell value={s.rejectionRisk} />
                <ProbCell value={s.pumpProbability} />
                <ProbCell value={s.narrativeSurvivalProbability} />
                <ProbCell value={s.confidence} />
                <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{s.dominantFactors.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="methodology-note">{prediction.methodologyNote}</p>
    </div>
  );
}
