export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

export async function fetchJson<T>(url: string, provider: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "memecoin-analysis-engine/0.1" },
    });
    if (!res.ok) {
      throw new ProviderError(provider, `HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(provider, `Request failed for ${url}`, err);
  } finally {
    clearTimeout(timer);
  }
}
