import type { AnalysisReport } from "@mae/core";

export interface HistoryItem {
  id: string;
  createdAt: string;
  verdict: string;
  globalScore: number;
}

interface ApiErrorBody {
  error?: string;
  detail?: string;
}

export async function analyzeToken(address: string): Promise<{ id: string; report: AnalysisReport }> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const data = (await res.json()) as { id: string; report: AnalysisReport } & ApiErrorBody;
  if (!res.ok) {
    throw new Error(data.error ?? "Analysis failed.");
  }
  return data;
}

export async function fetchHistory(address: string): Promise<HistoryItem[]> {
  const res = await fetch(`/api/tokens/${encodeURIComponent(address)}/history`);
  if (!res.ok) return [];
  const data = (await res.json()) as { history?: HistoryItem[] };
  return data.history ?? [];
}

export async function fetchAnalysis(id: string): Promise<AnalysisReport | null> {
  const res = await fetch(`/api/analyses/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { report?: AnalysisReport };
  return data.report ?? null;
}
