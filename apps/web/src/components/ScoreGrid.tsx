import type { EngineResult } from "@mae/core";
import { directionalColor, severityColor } from "../lib/colors";

function ScoreCard({ engine }: { engine: EngineResult }) {
  const color = directionalColor(engine.score, engine.direction);
  const topTriggers = [...engine.triggers]
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 3);

  return (
    <div className="score-card">
      <div className="score-card-head">
        <span className="score-card-label">{engine.label}</span>
        <span className="score-card-value" style={{ color }}>
          {engine.score.toFixed(0)}
        </span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${engine.score}%`, background: color }} />
      </div>
      <p className="score-card-summary">{engine.summary}</p>
      {topTriggers.length > 0 && (
        <ul className="trigger-list">
          {topTriggers.map((t) => (
            <li key={t.id} className="trigger-item">
              <span className="trigger-dot" style={{ background: severityColor(t.severity) }} />
              <span>{t.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ScoreGrid({ engines }: { engines: EngineResult[] }) {
  return (
    <div className="score-grid">
      {engines.map((e) => (
        <ScoreCard key={e.id} engine={e} />
      ))}
    </div>
  );
}
