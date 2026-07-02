import type { HistoryItem } from "../lib/api";
import { VERDICT_STYLE } from "../lib/colors";
import type { Verdict } from "@mae/core";

export function History({ history, onSelect }: { history: HistoryItem[]; onSelect: (id: string) => void }) {
  if (history.length === 0) {
    return <p className="empty-note">No prior analyses recorded for this token yet.</p>;
  }

  return (
    <ul className="history-list">
      {history.map((h) => {
        const style = VERDICT_STYLE[h.verdict as Verdict];
        return (
          <li key={h.id} className="history-item">
            <div>
              <span className="badge" style={{ color: style?.color, background: style?.bg, marginRight: 10 }}>
                {h.globalScore.toFixed(0)}
              </span>
              <button
                onClick={() => onSelect(h.id)}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: 0 }}
              >
                {h.verdict.replace(/_/g, " ")}
              </button>
            </div>
            <span className="history-meta">{new Date(h.createdAt).toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}
