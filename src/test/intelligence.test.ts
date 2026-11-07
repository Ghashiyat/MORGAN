import { describe, expect, it, afterEach } from "vitest";
import { coordinateResponse, privateRecallOnly } from "@/lib/morgan/intelligence";
import { categoryFor, selectRelevant } from "@/lib/morgan/memory";
import { parseExtraction, planWrites, worthExtracting } from "@/lib/morgan/auto-memory";
import { socialProviderSelection, providerConfigs, clearQuarantine, clearModelCooldowns, raceProviders, type ProviderConfig } from "@/lib/morgan/providers";
import { parseDeckRequest } from "@/lib/morgan/deck-intent";
import { decideSearch } from "@/lib/morgan/search";

describe("unified response decisions", () => {
  it("keeps casual conversation casual", () => expect(coordinateResponse("hey").mode).toBe("casual"));
  it("recognizes excitement as a tentative signal", () => expect(coordinateResponse("I passed my exam!").emotion).toBe("excitement"));
  it("does not turn disappointment into an automatic plan", () => expect(coordinateResponse("I'm disappointed that it failed")).toMatchObject({ emotion: "disappointment", mode: "answer" }));
  it("checks sarcasm rather than celebrating a failure", () => expect(coordinateResponse("Great, another crash. Just what I needed.")).toMatchObject({ sarcasmPossible: true, emotion: "disappointment" }));
  it("uses context for an earlier discussion", () => expect(coordinateResponse("What about the project we discussed earlier?").usesContext).toBe(true));
  it("answers a question about a plan without creating another plan", () => expect(coordinateResponse("What was the goal of that plan?").mode).toBe("answer"));
  it("uses tactical reasoning only for a requested plan", () => expect(coordinateResponse("Create a launch plan with priorities, risks and next steps").mode).toBe("tactical"));
  it("honors a request to be heard", () => expect(coordinateResponse("I just need to vent, no advice please").mode).toBe("listen"));
  it("does not assume excitement in a definition question", () => expect(coordinateResponse("What is excitement?")).toMatchObject({ mode: "answer", emotion: null }));
  it("tracks progress only on explicit request", () => {
    expect(coordinateResponse("Create a project plan").trackProgress).toBe(false);
    expect(coordinateResponse("Track my progress on the launch").trackProgress).toBe(true);
  });
});

describe("relevant controlled memory", () => {
  const rows = [
    { id: "name", kind: "profile", category: "identity", content: "User name is Ghashiyat", pinned: true },
    { id: "style", kind: "profile", category: "communication", content: "Reply briefly" },
    { id: "city", kind: "profile", category: "identity", content: "User lives in London" },
    { id: "project", kind: "project", category: "project", content: "SmartShelf uses RFID sensors" },
  ];
  it("keeps unrelated identity and pinned facts out of factual answers", () => expect(selectRelevant(rows, "What is photosynthesis?").map((m) => m.id)).toEqual(["style"]));
  it("retrieves location only for location recall", () => expect(selectRelevant(rows, "Where do I live?").map((m) => m.id)).toEqual(["style", "city"]));
  it("retrieves the relevant older project", () => expect(selectRelevant(rows, "Explain SmartShelf sensors").map((m) => m.id)).toEqual(["style", "project"]));
  it("keeps private project recall away from web search", () => {
    expect(privateRecallOnly("What sensors does my SmartShelf project use?", true)).toBe(true);
    expect(privateRecallOnly("Search latest news about my project's sensor supplier", true)).toBe(false);
    expect(privateRecallOnly("What sensors does my project use?", false)).toBe(false);
  });
  it("uses structured communication and decision categories", () => {
    expect(categoryFor("Reply briefly please")).toBe("communication");
    expect(categoryFor("I decided to launch in November")).toBe("decision");
  });
  it("updates a changed city without mistaking shared words for a duplicate", () => {
    const found = parseExtraction('{"memories":[{"content":"User lives in Pune","category":"identity","replaces":"User lives in London"}]}');
    expect(planWrites(found, rows).supersede).toEqual(["city"]);
  });
  it("will not supersede a guessed correction target", () => {
    const found = parseExtraction('{"memories":[{"content":"User lives in Pune","category":"identity","replaces":"User is living in London"}]}');
    expect(planWrites(found, rows).supersede).toEqual([]);
  });
  it("does not save temporary emotions, questions or opted-out facts", () => {
    expect(worthExtracting("I'm excited about today")).toBe(false);
    expect(worthExtracting("What should my long-term goal be?")).toBe(false);
    expect(worthExtracting("Do not save this: I live in London")).toBe(false);
  });
  it("bounds retrieval to eight relevant memories", () => expect(selectRelevant(Array.from({ length: 20 }, (_, i) => ({ id: String(i), kind: "project", content: "launch project" })), "launch project", 50)).toHaveLength(8));
});

describe("optional Gemini and preserved tools", () => {
  afterEach(() => { clearQuarantine(); clearModelCooldowns(); });
  const configs = providerConfigs({ GEMINI_API_KEY: "test-only", OPENROUTER_API_KEY: "test-only" }).filter((c) => c.apiKey);
  it("preserves default providers without opt-in", () => expect(socialProviderSelection(configs, true, {})).toBe(configs));
  it("selects one existing Gemini provider without an extra classifier call", () => expect(socialProviderSelection(configs, true, { MORGAN_SOCIAL_PROVIDER: "gemini" })).toEqual([configs[0]]));
  it("leaves ineligible requests and missing Gemini configurations unchanged", () => {
    expect(socialProviderSelection(configs, false, { MORGAN_SOCIAL_PROVIDER: "gemini" })).toBe(configs);
    const others = configs.filter((c) => c.id !== "gemini");
    expect(socialProviderSelection(others, true, { MORGAN_SOCIAL_PROVIDER: "gemini" })).toBe(others);
  });
  it("an unavailable Gemini does not stop another provider answering", async () => {
    const pool: ProviderConfig[] = configs.map((c) => ({ ...c, url: c.id, fallbackModels: [], maxRetries: 0 }));
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return String(url) === "gemini" ? new Response("unavailable", { status: 503 }) : new Response('data: {"choices":[{"delta":{"content":"A thoughtful answer from the existing fallback."}}]}\n\ndata: [DONE]\n');
    }) as typeof fetch;
    const result = await raceProviders(pool, [], new AbortController().signal, { fetchImpl });
    expect(result.winner).toBe("openrouter");
    expect(calls.sort()).toEqual(["gemini", "openrouter"]);
  });
  it("retains live-search and real PPT intent gates", () => {
    expect(decideSearch("Search the latest NASA news", false).search).toBe(true);
    expect(parseDeckRequest("Make exactly 8 professional PPT slides on vehicle proximity detection")?.slides).toBe(8);
  });
  it("does not web-search personal excitement containing the word news", () => expect(decideSearch("I passed my exam! I just wanted to share the good news.", true).search).toBe(false));
});
import { coordinateResponse as cr2 } from "@/lib/morgan/intelligence";
import { chatIdReply as cid2 } from "@/lib/morgan/chat-id";
import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("teaching mode", () => {
  i2("detects learning and slow-explanation requests", () => {
    e2(cr2("can you teach me python basics").mode).toBe("teach");
    e2(cr2("explain me 4 and 5th slowly").mode).toBe("teach");
    e2(cr2("i didnt understand explain short and easy way").mode).toBe("teach");
    e2(cr2("hi").mode).toBe("casual");
  });
  i2("answers 'give chat id' without 'me'", () => {
    e2(cid2("give chat id", "abc")).toContain("abc");
  });
});

import { teachingProviderSelection } from "@/lib/morgan/providers";
d2("teaching provider", () => {
  i2("uses the thoughtful model with time to think", () => {
    const cfgs = [{ id: "openrouter", url: "", apiKey: "k", model: "m", timeoutMs: 12000, maxRetries: 1 }, { id: "gemini", url: "", apiKey: "k", model: "g", timeoutMs: 6000, maxRetries: 1 }] as any;
    const out = teachingProviderSelection(cfgs);
    e2(out.map((c: any) => c.id)).toEqual(["gemini"]);
    e2(out[0]?.timeoutMs).toBe(20000);
  });
});
