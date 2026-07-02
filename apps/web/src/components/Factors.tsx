import type { FactorSummary, RedFlag } from "@mae/core";

export function FactorColumns({ bull, bear }: { bull: FactorSummary[]; bear: FactorSummary[] }) {
  return (
    <div className="factor-columns">
      <div>
        <h3 className="section-title" style={{ color: "var(--status-good)" }}>
          Bullish factors
        </h3>
        {bull.length === 0 ? (
          <p className="empty-note">No notable bullish factors detected.</p>
        ) : (
          <ul className="factor-list">
            {bull.map((f, i) => (
              <li key={i} className="factor-item bull">
                <strong>{f.label}</strong>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="section-title" style={{ color: "var(--status-critical)" }}>
          Bearish factors
        </h3>
        {bear.length === 0 ? (
          <p className="empty-note">No notable bearish factors detected.</p>
        ) : (
          <ul className="factor-list">
            {bear.map((f, i) => (
              <li key={i} className="factor-item bear">
                <strong>{f.label}</strong>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function RedFlagList({ flags }: { flags: RedFlag[] }) {
  if (flags.length === 0) {
    return <p className="empty-note">No critical red flags detected by the rule engine.</p>;
  }
  return (
    <ul className="redflag-list">
      {flags.map((f, i) => (
        <li key={i} className="redflag-item">
          <span>&#9888;</span>
          <div>
            <strong>{f.label}</strong>
            <span>{f.description}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
