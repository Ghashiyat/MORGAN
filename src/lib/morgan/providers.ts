// Three independent AI provider adapters behind one interface, plus a
// first-valid-answer race. Pure module (fetch is injected) so it is unit-testable.

export type ChatContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
export type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatContent };

export type ProviderId = "gemini" | "deepseek" | "openrouter" | "groq" | "grok" | "arliai";

export type ProviderConfig = {
  id: ProviderId;
  url: string;
  apiKey: string;
  model: string;
  visionModel?: string;
  timeoutMs: number;
  maxRetries: number;
  /** Alternate models with their own quota, tried in order when one is rate-limited. */
  fallbackModels?: string[];
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type ErrorKind =
  | "missing_key"
  | "timeout"
  | "rate_limit"
  | "quota"
  | "auth"
  | "bad_request"
  | "server"
  | "network"
  | "invalid_response"
  | "aborted";

export class ProviderError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export type ProviderResult =
  | { id: ProviderId; ok: true; text: string; latencyMs: number }
  | { id: ProviderId; ok: false; kind: ErrorKind; latencyMs: number };

type Env = Record<string, string | undefined>;

/** Optional social routing reuses one existing racer; it never adds a classification call. */
export function socialProviderSelection(configs: ProviderConfig[], eligible: boolean, env: Env): ProviderConfig[] {
  if (!eligible || env["MORGAN_SOCIAL_PROVIDER"] !== "gemini") return configs;
  const gemini = configs.find((c) => c.id === "gemini" && c.apiKey && !isQuarantined(c.id) && modelChain(c).length > 0);
  return gemini ? [gemini] : configs;
}

/** Teaching turns: the thoughtful model answers (not the fastest racer), with time to think; others stay as fallback. */
export function teachingProviderSelection(configs: ProviderConfig[]): ProviderConfig[] {
  const gemini = configs.find((c) => c.id === "gemini" && c.apiKey && !isQuarantined(c.id) && modelChain(c).length > 0);
  if (!gemini) return configs;
  return [{ ...gemini, timeoutMs: 20_000, maxTokens: 8192, extraBody: { ...gemini.extraBody, reasoning_effort: "medium" } }];
}

/** Build provider configs from server env. Model ids verified against each provider's live model list. */
export function providerConfigs(env: Env): ProviderConfig[] {
  return [
    {
      id: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: env["GEMINI_API_KEY"] ?? "",
      model: env["GEMINI_MODEL"] || "gemini-3.5-flash",
      // Separate free quota buckets: rotate on 429 instead of failing.
      fallbackModels: ["gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"],
      maxTokens: 4096,
      timeoutMs: 6_000,
      maxRetries: 1,
      extraBody: { reasoning_effort: "low" },
    },
    {
      id: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: env["OPENROUTER_API_KEY"] ?? "",
      // Fast model first (~0.4s measured); the heavy 120B model was taking 5-13s.
      model: env["OPENROUTER_MODEL"] || "mistralai/mistral-small-24b-instruct-2501",
      fallbackModels: ["meta-llama/llama-3.3-70b-instruct", "nvidia/nemotron-3-super-120b-a12b"],
      visionModel: env["OPENROUTER_VISION_MODEL"] || "nvidia/nemotron-3.5-super-vl",
      maxTokens: 4096,
      timeoutMs: 12_000,
      maxRetries: 1,
      extraBody: { reasoning: { exclude: true } },
      headers: { "X-Title": "MORGAN" },
    },
    {
      id: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: env["GROQ_API_KEY"] ?? "",
      model: env["GROQ_MODEL"] || "qwen/qwen3.8-27b",
      timeoutMs: 12_000,
      maxRetries: 1,
    },
    // DeepSeek and Grok (xAI) removed by the user for speed; re-add their configs here to restore.
  ];
}

/** Companion-mode provider: Groq only (Arli AI removed by the user for speed; re-add its config here to restore). */
export function companionConfigs(env: Env): ProviderConfig[] {
  const out: ProviderConfig[] = [];
  if (env["GROQ_API_KEY"]) out.push({ id: "groq", url: "https://api.groq.com/openai/v1/chat/completions", apiKey: env["GROQ_API_KEY"], model: env["GROQ_MODEL"] || "qwen/qwen3.8-27b", timeoutMs: 12_000, maxRetries: 1 });
  return out;
}

export function classifyStatus(status: number, body: string): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402 || /insufficient (balance|credits?)|quota/i.test(body)) return "quota";
  if (status === 429) return "rate_limit";
  if (status === 408) return "timeout";
  if (status >= 500) return "server";
  return "bad_request";
}

// Permanent failures (bad key, no balance, exhausted quota) are skipped for 10 minutes.
const QUARANTINE_MS = 10 * 60_000;
const quarantined = new Map<ProviderId, number>();
export function quarantine(id: ProviderId, now = Date.now()) {
  quarantined.set(id, now + QUARANTINE_MS);
}
export function isQuarantined(id: ProviderId, now = Date.now()) {
  const until = quarantined.get(id);
  if (!until) return false;
  if (now >= until) { quarantined.delete(id); return false; }
  return true;
}
export function clearQuarantine() {
  quarantined.clear();
}
const permanent = (k: ErrorKind) => k === "auth" || k === "quota" || k === "missing_key";

const retryable = (k: ErrorKind) => k === "rate_limit" || k === "server" || k === "network";

export function hasImages(messages: ChatMessage[]) {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === "image_url"));
}

/** Text-only racers must never win an image turn by guessing what is in it. */
export function visionProviders(configs: ProviderConfig[]): ProviderConfig[] {
  return configs.filter((c) => c.id === "gemini" || !!c.visionModel);
}

/** Read an OpenAI-compatible SSE stream and return the full text. */
async function readStream(res: Response, signal: AbortSignal, onText?: (full: string) => void): Promise<{ text: string; finish?: string | undefined }> {
  if (!res.body) throw new ProviderError("invalid_response", "empty body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let finish: string | undefined;
  while (true) {
    if (signal.aborted) throw new ProviderError("aborted", "aborted");
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return { text, finish };
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
          error?: { message?: string };
        };
        if (json.error) throw new ProviderError("server", json.error.message ?? "stream error");
        const c = json.choices?.[0];
        if (c?.delta?.content) {
          text += c.delta.content;
          onText?.(text);
        }
        if (c?.finish_reason) finish = c.finish_reason;
      } catch (e) {
        if (e instanceof ProviderError) throw e;
      }
    }
  }
  return { text, finish };
}

export function isValidAnswer(text: string, finish?: string) {
  const t = text.trim();
  if (!t) return false;
  if (finish === "content_filter") return false;
  // Response requirement: MORGAN's identity must stay consistent.
  if (/\b(created|made|built|developed|trained)\s+by\s+(the\s+)?(nvidia|google|openai|deepseek|anthropic|meta)\b/i.test(t)) return false;
  if (/\bmy name is (nemotron|gemini|deepseek|chatgpt|claude)\b/i.test(t)) return false;
  return true;
}

// Per-model cooldowns: each Gemini model has its own free quota bucket, so a 429
// on one model only benches that model (60s for per-minute, 1h for daily limits).
const modelCooldown = new Map<string, number>();
export function coolModel(model: string, daily: boolean, now = Date.now()) {
  modelCooldown.set(model, now + (daily ? 3600_000 : 60_000));
}
export function isModelCool(model: string, now = Date.now()) {
  const until = modelCooldown.get(model);
  if (!until) return false;
  if (now >= until) { modelCooldown.delete(model); return false; }
  return true;
}
export function clearModelCooldowns() {
  modelCooldown.clear();
}
/** Models to try for a config, in order, skipping benched ones. */
export function modelChain(cfg: ProviderConfig, now = Date.now()): string[] {
  const all = [cfg.model, ...(cfg.fallbackModels ?? [])].filter((m, i, a) => m && a.indexOf(m) === i);
  return all.filter((m) => !isModelCool(m, now));
}

/** Call one provider with its own timeout and bounded retries. */
export async function callProvider(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  onText?: (full: string) => void,
): Promise<string> {
  let streamed = false;
  if (!cfg.apiKey) throw new ProviderError("missing_key", `${cfg.id} key missing`);
  const vision = hasImages(messages) ? cfg.visionModel : undefined;
  const chain = vision ? [vision] : modelChain(cfg);
  if (!chain.length) throw new ProviderError("rate_limit", `${cfg.id} all models cooling down`, 429);
  let modelIdx = 0;
  let attempt = 0;
  while (true) {
    const model = chain[modelIdx]!;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    // timeoutMs bounds the wait for the FIRST token; once text flows, allow long answers to finish.
    let timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetchImpl(cfg.url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          ...cfg.headers,
        },
        body: JSON.stringify({ model, messages, stream: true, max_tokens: cfg.maxTokens ?? 4096, ...cfg.extraBody }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const kind = classifyStatus(res.status, body);
        // Model-level limit: bench this model and move to the next one immediately.
        if (cfg.fallbackModels?.length && (res.status === 429 || (kind === "quota" && res.status !== 402))) {
          coolModel(model, /per ?day|daily|PerDay/i.test(body));
          if (modelIdx + 1 < chain.length) {
            modelIdx++;
            continue;
          }
          throw new ProviderError("rate_limit", `${cfg.id} ${res.status}`, res.status);
        }
        throw new ProviderError(kind, `${cfg.id} ${res.status}`, res.status);
      }
      const { text, finish } = await readStream(res, ctrl.signal, (t) => {
        if (!streamed) { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), 90_000); }
        streamed = true;
        onText?.(t);
      });
      if (!isValidAnswer(text, finish)) throw new ProviderError("invalid_response", `${cfg.id} empty/invalid`);
      return text.trim();
    } catch (e) {
      let err: ProviderError;
      if (e instanceof ProviderError) err = e;
      else if (signal.aborted) err = new ProviderError("aborted", "aborted");
      else if (ctrl.signal.aborted) err = new ProviderError("timeout", `${cfg.id} timeout`);
      else err = new ProviderError("network", `${cfg.id} network`);
      if (err.kind === "aborted" && ctrl.signal.aborted && !signal.aborted) err = new ProviderError("timeout", "timeout");
      // Never retry permanent failures (quota/auth/bad request) or once text already streamed.
      // Benched-model rate limits already rotated models; don't sleep-retry them.
      const rotated = !!cfg.fallbackModels?.length && err.kind === "rate_limit";
      if (signal.aborted || streamed || rotated || !retryable(err.kind) || attempt >= cfg.maxRetries) throw err;
      attempt++;
      await sleep(400 * attempt + Math.random() * 300);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Dispatch to all providers concurrently; resolve with the first valid answer.
 * Losers are aborted. Rejects only if every provider fails.
 */
export function raceProviders(
  configs: ProviderConfig[],
  messages: ChatMessage[],
  parentSignal: AbortSignal,
  opts: {
    fetchImpl?: typeof fetch;
    now?: () => number;
    onSettled?: (r: ProviderResult, won: boolean) => void;
    /** Live text of the claimed winner; enables progressive streaming. */
    onDelta?: (delta: string) => void;
    earlyChars?: number;
  } = {},
): Promise<{ winner: ProviderId; text: string; latencyMs: number; firstTokenMs: number | null }> {
  const now = opts.now ?? Date.now;
  const start = now();
  // Skip quarantined providers, unless all of them are (then try everyone once more).
  const healthy = configs.filter((c) => !isQuarantined(c.id));
  if (healthy.length) configs = healthy;
  const controllers = configs.map(() => new AbortController());
  const abortAll = () => controllers.forEach((c) => c.abort());
  parentSignal.addEventListener("abort", abortAll, { once: true });

  return new Promise((resolve, reject) => {
    let done = false;
    let failures = 0;
    let claimed = -1; // provider index that won the early-validity check
    let sent = 0;
    let shown = "";
    let firstTokenMs: number | null = null;
    const early = opts.earlyChars ?? 50;
    const emit = (full: string) => {
      const d = full.slice(sent);
      if (!d) return;
      if (firstTokenMs === null) firstTokenMs = now() - start;
      sent = full.length;
      shown = full;
      opts.onDelta?.(d);
    };
    if (!configs.length) return reject(new ProviderError("missing_key", "no providers"));
    configs.forEach((cfg, i) => {
      const onText = opts.onDelta
        ? (full: string) => {
            if (done) return;
            if (claimed === -1 && full.trim().length >= early && isValidAnswer(full)) {
              claimed = i;
              controllers.forEach((c, j) => j !== i && c.abort());
            }
            if (claimed === i) emit(full);
          }
        : undefined;
      callProvider(cfg, messages, controllers[i]!.signal, opts.fetchImpl, undefined, onText)
        .then((text) => {
          const latencyMs = now() - start;
          const won = !done && (claimed === -1 || claimed === i);
          opts.onSettled?.({ id: cfg.id, ok: true, text, latencyMs }, won);
          if (!won) return;
          done = true;
          controllers.forEach((c, j) => j !== i && c.abort());
          parentSignal.removeEventListener("abort", abortAll);
          if (opts.onDelta) {
            if (sent === 0) emit(text);
          }
          resolve({ winner: cfg.id, text: sent ? text : text, latencyMs, firstTokenMs });
        })
        .catch((e: unknown) => {
          const kind = e instanceof ProviderError ? e.kind : "network";
          if (permanent(kind)) quarantine(cfg.id);
          opts.onSettled?.({ id: cfg.id, ok: false, kind, latencyMs: now() - start }, false);
          failures++;
          // A claimed winner that failed mid-stream ends the race (its text is already on screen).
          const lostClaim = claimed === i && sent > 0;
          if (!done && lostClaim && isValidAnswer(shown)) {
            // Winner dropped mid-stream: keep what the user already sees instead of erroring.
            done = true;
            parentSignal.removeEventListener("abort", abortAll);
            resolve({ winner: cfg.id, text: shown.trim(), latencyMs: now() - start, firstTokenMs });
            return;
          }
          if (!done && (failures === configs.length || lostClaim)) {
            done = true;
            parentSignal.removeEventListener("abort", abortAll);
            reject(new ProviderError(parentSignal.aborted ? "aborted" : "server", "all providers failed"));
          }
        });
    });
  });
}
