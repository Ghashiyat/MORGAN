import { describe, expect, it } from "vitest";
import { extractRememberRequest, looksSensitive } from "@/lib/morgan/memory";
import { percentile, summarize } from "@/lib/morgan/telemetry";

describe("memory privacy", () => {
  it("blocks passwords", () => expect(extractRememberRequest("remember that my password is hunter22")?.sensitive).toBe(true));
  it("blocks api keys", () => expect(looksSensitive("sk-abcdefghijklmnop1234")).toBe(true));
  it("allows normal facts", () => expect(extractRememberRequest("remember that I like jazz")?.sensitive).toBeUndefined());
});
describe("telemetry", () => {
  it("p95", () => expect(percentile([100, 200, 300, 400], 95)).toBe(400));
  it("search rate", () => {
    const base = { at: 1, route: "ai" as const, prepMs: 10, memoryMs: 5, firstTokenMs: 300, totalMs: 900, enginesTried: 4, enginesFailed: 1, memoriesUsed: 0 };
    expect(summarize([{ ...base, searchMs: 400 }, { ...base, searchMs: null }]).searchRate).toBe(50);
  });
});
