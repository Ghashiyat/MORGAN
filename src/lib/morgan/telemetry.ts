// Per-device request telemetry. Stores timings only — never prompts, replies, keys or provider names.

export type Metric = {
  at: number;
  route: "ai" | "companion" | "replay";
  prepMs: number; // auth + DB setup before streaming starts
  memoryMs: number;
  searchMs: number | null; // null = web search not used
  firstTokenMs: number | null;
  totalMs: number;
  enginesTried: number;
  enginesFailed: number;
  memoriesUsed: number;
};

const KEY = "morgan:telemetry";
const MAX = 100;

export function readMetrics(): Metric[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function recordMetric(m: Metric) {
  try {
    localStorage.setItem(KEY, JSON.stringify([m, ...readMetrics()].slice(0, MAX)));
  } catch {
    /* storage full or blocked */
  }
}

export function clearMetrics() {
  localStorage.removeItem(KEY);
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}

export function summarize(ms: Metric[]) {
  const ttft = ms.map((m) => m.firstTokenMs).filter((v): v is number => v != null);
  const total = ms.map((m) => m.totalMs);
  const tried = ms.reduce((a, m) => a + m.enginesTried, 0);
  const failed = ms.reduce((a, m) => a + m.enginesFailed, 0);
  return {
    count: ms.length,
    avgFirstToken: ttft.length ? Math.round(ttft.reduce((a, b) => a + b, 0) / ttft.length) : null,
    p95FirstToken: percentile(ttft, 95),
    avgTotal: total.length ? Math.round(total.reduce((a, b) => a + b, 0) / total.length) : null,
    p95Total: percentile(total, 95),
    searchRate: ms.length ? Math.round((ms.filter((m) => m.searchMs != null).length / ms.length) * 100) : 0,
    engineSuccess: tried ? Math.round(((tried - failed) / tried) * 100) : null,
  };
}
