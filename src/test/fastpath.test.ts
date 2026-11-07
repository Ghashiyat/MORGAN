import { describe, expect, it } from "vitest";
import { localAnswer } from "@/lib/morgan/fastpath";
import { isQuarantined, quarantine, clearQuarantine } from "@/lib/morgan/providers";

describe("local arithmetic fast-path", () => {
  it("answers 1+1 locally", () => expect(localAnswer("1+1")).toBe("2"));
  it("respects precedence", () => expect(localAnswer("what is 2 + 3 * 4?")).toBe("14"));
  it("handles percent of", () => expect(localAnswer("25% of 200")).toBe("50"));
  it("handles parentheses and powers", () => expect(localAnswer("(2+3)^2")).toBe("25"));
  it("ignores non-math text", () => expect(localAnswer("mm")).toBeNull());
  it("ignores plain numbers", () => expect(localAnswer("2026")).toBeNull());
  it("rejects code-like input", () => expect(localAnswer("alert(1)+1")).toBeNull());
});

describe("provider quarantine", () => {
  it("skips a provider for 10 minutes after a permanent error", () => {
    clearQuarantine();
    quarantine("deepseek", 1000);
    expect(isQuarantined("deepseek", 1000 + 9 * 60_000)).toBe(true);
    expect(isQuarantined("deepseek", 1000 + 11 * 60_000)).toBe(false);
  });
});
