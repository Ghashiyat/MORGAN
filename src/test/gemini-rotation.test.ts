import { describe, it, expect, beforeEach } from "vitest";
import { callProvider, clearModelCooldowns, isModelCool, type ProviderConfig } from "@/lib/morgan/providers";

const cfg: ProviderConfig = {
  id: "gemini", url: "https://x", apiKey: "k", model: "a", fallbackModels: ["b", "c"], timeoutMs: 5000, maxRetries: 1,
};
const sse = (t: string) =>
  new Response(`data: {"choices":[{"delta":{"content":"${t}"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`, { status: 200 });

describe("gemini model rotation", () => {
  beforeEach(() => clearModelCooldowns());

  it("switches to the next model on 429 and benches the limited one", async () => {
    const used: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const m = JSON.parse(init.body as string).model as string;
      used.push(m);
      return m === "a" ? new Response("quota exceeded", { status: 429 }) : sse("Hello from the backup model.");
    }) as unknown as typeof fetch;
    const text = await callProvider(cfg, [{ role: "user", content: "hi" }], new AbortController().signal, fetchImpl);
    expect(text).toBe("Hello from the backup model.");
    expect(used).toEqual(["a", "b"]);
    expect(isModelCool("a")).toBe(true);
  });

  it("skips a benched model on the next message", async () => {
    const used: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const m = JSON.parse(init.body as string).model as string;
      used.push(m);
      return m === "a" ? new Response("", { status: 429 }) : sse("Second reply comes straight from b.");
    }) as unknown as typeof fetch;
    await callProvider(cfg, [{ role: "user", content: "hi" }], new AbortController().signal, fetchImpl);
    used.length = 0;
    await callProvider(cfg, [{ role: "user", content: "hi" }], new AbortController().signal, fetchImpl);
    expect(used).toEqual(["b"]);
  });
});
