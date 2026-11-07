import { beforeEach, describe, expect, it } from "vitest";
import { raceProviders, clearQuarantine, providerConfigs, type ProviderConfig } from "@/lib/morgan/providers";
import { decideSearch, tavilySearch, SearchError } from "@/lib/morgan/search";
import { extractRememberRequest, findDuplicate, selectRelevant } from "@/lib/morgan/memory";
import { systemPrompt, personalityPrompt } from "@/lib/morgan/prompt";
import { selectChunks } from "@/lib/morgan/chunks";

const sse = (text: string) =>
  new Response(
    new ReadableStream({
      start(c) {
        const e = new TextEncoder();
        c.enqueue(e.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
        c.enqueue(e.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    }),
    { status: 200 },
  );

const cfg = (id: ProviderConfig["id"], url: string, maxRetries = 0): ProviderConfig => ({
  id, url, apiKey: "k", model: "m", timeoutMs: 5000, maxRetries,
});

function fakeFetch(plan: Record<string, { delay: number; res: () => Response }>, calls: string[]) {
  return ((url: string, init: RequestInit) => {
    calls.push(url);
    const p = plan[url]!;
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(p.res()), p.delay);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }) as unknown as typeof fetch;
}

describe("provider race", () => {
  beforeEach(() => clearQuarantine());
  it("returns the first valid answer without waiting for slower providers, and aborts them", async () => {
    const calls: string[] = [];
    const settled: string[] = [];
    const f = fakeFetch(
      { a: { delay: 10, res: () => sse("fast") }, b: { delay: 2000, res: () => sse("slow") }, c: { delay: 3000, res: () => sse("slower") } },
      calls,
    );
    const t0 = Date.now();
    const r = await raceProviders([cfg("gemini", "a"), cfg("deepseek", "b"), cfg("openrouter", "c")], [], new AbortController().signal, {
      fetchImpl: f,
      onSettled: (x) => settled.push(`${x.id}:${x.ok ? "ok" : x.kind}`),
    });
    expect(r.text).toBe("fast");
    expect(r.winner).toBe("gemini");
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(calls).toEqual(["a", "b", "c"]); // all dispatched concurrently, once each
    await new Promise((res) => setTimeout(res, 20));
    expect(settled).toContain("deepseek:aborted");
  });

  it("a failing provider does not block a successful one", async () => {
    const f = fakeFetch({ a: { delay: 5, res: () => new Response("boom", { status: 401 }) }, b: { delay: 50, res: () => sse("ok answer") } }, []);
    const r = await raceProviders([cfg("gemini", "a"), cfg("deepseek", "b")], [], new AbortController().signal, { fetchImpl: f });
    expect(r.text).toBe("ok answer");
  });

  it("empty answers are invalid and lose to a valid one", async () => {
    const f = fakeFetch({ a: { delay: 5, res: () => sse("   ") }, b: { delay: 30, res: () => sse("real") } }, []);
    const r = await raceProviders([cfg("gemini", "a"), cfg("deepseek", "b")], [], new AbortController().signal, { fetchImpl: f });
    expect(r.winner).toBe("deepseek");
  });

  it("an answer with the wrong creator identity is invalid", async () => {
    const f = fakeFetch({ a: { delay: 1, res: () => sse("I am created by NVIDIA researchers.") }, b: { delay: 20, res: () => sse("Ghashiyat Tanvir built me.") } }, []);
    const r = await raceProviders([cfg("openrouter", "a"), cfg("gemini", "b")], [], new AbortController().signal, { fetchImpl: f });
    expect(r.winner).toBe("gemini");
  });

  it("rejects when every provider fails", async () => {
    const f = fakeFetch({ a: { delay: 5, res: () => new Response("x", { status: 400 }) }, b: { delay: 5, res: () => new Response("x", { status: 402 }) } }, []);
    await expect(raceProviders([cfg("gemini", "a"), cfg("deepseek", "b")], [], new AbortController().signal, { fetchImpl: f })).rejects.toThrow();
  });

  it("retries a rate-limited provider at most once", async () => {
    const calls: string[] = [];
    const f = fakeFetch({ a: { delay: 1, res: () => new Response("x", { status: 429 }) } }, calls);
    await expect(raceProviders([cfg("gemini", "a", 1)], [], new AbortController().signal, { fetchImpl: f })).rejects.toThrow();
    expect(calls.length).toBe(2);
  });

  it("cancellation aborts all in-flight providers", async () => {
    const ctrl = new AbortController();
    const f = fakeFetch({ a: { delay: 5000, res: () => sse("x") }, b: { delay: 5000, res: () => sse("y") } }, []);
    const p = raceProviders([cfg("gemini", "a"), cfg("deepseek", "b")], [], ctrl.signal, { fetchImpl: f });
    setTimeout(() => ctrl.abort(), 10);
    await expect(p).rejects.toThrow();
  });

  it("configures only Gemini, OpenRouter and Groq (DeepSeek and Grok removed)", () => {
    const c = providerConfigs({ GEMINI_API_KEY: "g", DEEPSEEK_API_KEY: "d", OPENROUTER_API_KEY: "o", GROQ_API_KEY: "q", XAI_API_KEY: "x" });
    expect(c.map((x) => x.id)).toEqual(["gemini", "openrouter", "groq"]);
    expect(c.find((x) => x.id === "groq")?.apiKey).toBe("q");
    expect(c.find((x) => x.id === "openrouter")?.model).toContain("mistral");
  });

  it("companion mode uses Groq only", async () => {
    const { companionConfigs } = await import("@/lib/morgan/providers");
    expect(companionConfigs({ ARLIAI_API_KEY: "a", GROQ_API_KEY: "q" }).map((x) => x.id)).toEqual(["groq"]);
  });

  it("companion prompt is emotional support only, short, and drops task-engine directives", async () => {
    const { companionPrompt } = await import("@/lib/morgan/prompt");
    const p = companionPrompt({ now: new Date(0) });
    expect(p).toContain("NEVER bullet points");
    expect(p).toContain("I’m built by Ghashiyat.");
    expect(p).toContain("crisis line");
    expect(p).not.toContain("Ruthless efficiency");
    expect(p).not.toContain("Cognitive autonomy");
  });
});

describe("web search decision", () => {
  it.each([
    "What are today's AI news headlines?",
    "Compare the best laptops under ₹50,000.",
    "Find free APIs I can use in MORGAN.",
    "Search the internet for affordable hosting providers.",
    "What are the latest updates to Node.js?",
  ])("searches for: %s", (q) => expect(decideSearch(q, false).search).toBe(true));

  it.each(["Write a Python function to reverse a list", "Explain recursion simply", "hi", "Plan my day in 5 steps"])(
    "does not search for ordinary: %s",
    (q) => expect(decideSearch(q, true).search).toBe(false),
  );

  it("respects an explicit no-search request", () => {
    expect(decideSearch("Without search, what's the latest you know about GPUs?", true).search).toBe(false);
  });

  it("uses deeper research for comparisons", () => {
    expect(decideSearch("Compare the best laptops under ₹50,000", false).depth).toBe("advanced");
  });

  it("quota errors stop immediately with no retry", async () => {
    let n = 0;
    const f = (async () => {
      n++;
      return new Response("limit", { status: 432 });
    }) as unknown as typeof fetch;
    await expect(tavilySearch("k", "news", { depth: "basic", topic: "news" }, new AbortController().signal, f)).rejects.toBeInstanceOf(SearchError);
    expect(n).toBe(1);
  });
});

describe("memory", () => {
  it("detects explicit remember requests", () => {
    expect(extractRememberRequest("Remember that my name is Syed")).toEqual({ content: "my name is Syed", kind: "profile" });
    expect(extractRememberRequest("What do you remember?")).toBeNull();
  });
  it("updates instead of duplicating", () => {
    expect(findDuplicate([{ id: "1", kind: "profile", content: "my name is Syed" }], "my name is Syed Ali")?.id).toBe("1");
  });
  it("retrieves only relevant non-profile memories", () => {
    const mem = [
      { id: "1", kind: "profile", content: "call me Boss" },
      { id: "2", kind: "project", content: "MORGAN uses Supabase database" },
      { id: "3", kind: "fact", content: "dentist appointment friday" },
    ];
    expect(selectRelevant(mem, "which database does MORGAN use?").map((m) => m.id)).toEqual(["1", "2"]);
  });
});

describe("identity", () => {
  it("names Ghashiyat as builder", () => {
    expect(systemPrompt({ now: new Date(), studyNotes: false, direct: false })).toContain("I’m built by Ghashiyat.");
  });
  it("knows the MORGAN full form", () => {
    expect(systemPrompt({ now: new Date(), studyNotes: false, direct: false })).toContain("Moments Offered Readily Guiding As Needed — an AI made to guide someone special and to be with them forever.");
  });
  it("includes the trigger-only compassion mode with a crisis safeguard", () => {
    const p = systemPrompt({ now: new Date(), studyNotes: false, direct: false });
    expect(p).toContain("NEVER use bullet points, numbered lists");
    expect(p).toContain("drop all humor");
  });
});

describe("upgrade rules", () => {
  it("never retries an insufficient-balance (402) provider", async () => {
    const calls: string[] = [];
    const f = fakeFetch({ a: { delay: 1, res: () => new Response("Insufficient Balance", { status: 402 }) } }, calls);
    await expect(raceProviders([cfg("deepseek", "a", 1)], [], new AbortController().signal, { fetchImpl: f })).rejects.toThrow();
    expect(calls.length).toBe(1);
  });

  it("streams the winner progressively and the streamed text equals the saved answer", async () => {
    const long = "A".repeat(200);
    const f = fakeFetch({ a: { delay: 1, res: () => sse(long) }, b: { delay: 40, res: () => sse("slow") } }, []);
    let streamed = "";
    const r = await raceProviders([cfg("gemini", "a"), cfg("deepseek", "b")], [], new AbortController().signal, { fetchImpl: f, onDelta: (d) => (streamed += d) });
    expect(r.winner).toBe("gemini");
    expect(streamed.trim()).toBe(r.text);
  });

  it("persona never overrides creator or security rules", () => {
    const p = personalityPrompt({ preset: "RUTHLESS", traits: { sarcasm: 10 } });
    expect(p).toContain("never override identity");
    expect(p).toContain("sarcasm 10");
    expect(systemPrompt({ now: new Date(), studyNotes: false, direct: false })).toContain("I’m built by Ghashiyat.");
  });

  it("pins do not inject unrelated memories", () => {
    const r = selectRelevant([{ id: "1", kind: "fact", content: "likes tea", pinned: true }, { id: "2", kind: "fact", content: "unrelated thing" }], "weather today");
    expect(r.map((m) => m.id)).toEqual([]);
  });

  it("long documents send only relevant sections", () => {
    const doc = "intro ".repeat(300) + "x".repeat(6000) + " quantum entanglement details ".repeat(60) + "y".repeat(6000);
    const out = selectChunks(doc, "explain quantum entanglement");
    expect(out.length).toBeLessThan(doc.length);
    expect(out).toContain("quantum entanglement");
  });

  it("small talk does not trigger web search", () => {
    expect(decideSearch("hello there", true).search).toBe(false);
  });
});

import { decideSearch as ds2 } from "@/lib/morgan/search";
describe("search for show release questions", () => {
  it("searches for episode release dates", () => expect(ds2("VISION QUEST EPISODES RELEASE DATE", false).search).toBe(true));
});
