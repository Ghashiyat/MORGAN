import { describe, it, expect } from "vitest";
import { readCompanion, companionGuidance } from "@/lib/morgan/companion-intelligence";

const r = (t: string, turns = [{ role: "user", text: t }], prefersShort = false) => readCompanion(t, turns, null, prefersShort);

describe("companion read", () => {
  it("A hello is casual and one line", () => { const x = r("hey"); expect(x.expectation).toBe("casual"); expect(x.length).toBe("one_line"); });
  it("B upsetting -> comfort", () => expect(r("Nobody even cares.").expectation).toBe("comfort"));
  it("C technical question -> direct answer", () => expect(r("How does TCP handshake work?").expectation).toBe("direct_answer"));
  it("D groups consecutive messages", () => {
    const turns = [{ role: "assistant", text: "hi" }, { role: "user", text: "I have an exam tomorrow." }, { role: "user", text: "I'm not prepared." }, { role: "user", text: "And I'm scared." }];
    const x = readCompanion("And I'm scared.", turns, "stressed");
    expect(x.burst).toHaveLength(3);
    expect(companionGuidance(x)).toContain("ONE situation");
  });
  it("E reference to last week", () => expect(r("remember what happened last week?").reference).toBe(true));
  it("F no long explanation -> short", () => expect(["one_line", "short"]).toContain(r("Don't give me a long explanation, why is sky blue?").length));
  it("G explain everything -> detailed", () => expect(r("Explain everything properly").length).toBe("detailed"));
  it("H not understanding -> reassess", () => expect(r("You're not understanding me").expectation).toBe("reassess"));
  it("I honest opinion", () => expect(r("Give me your honest opinion on my plan").expectation).toBe("honest_opinion"));
  it("J just listen", () => expect(r("I don't need a solution, just listen").expectation).toBe("listen"));
  it("analysis over reassurance", () => expect(r("Tell me exactly where I went wrong").expectation).toBe("analysis"));
});
