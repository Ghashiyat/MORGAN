import { describe, it, expect } from "vitest";
import { parseTranslate, detectMood } from "@/lib/morgan/sense";

describe("translation intent", () => {
  it("finds the target language", () => expect(parseTranslate("translate good morning to hindi")?.code).toBe("hi-IN"));
  it("handles how do you say", () => expect(parseTranslate("how do you say thank you in japanese")?.code).toBe("ja-JP"));
  it("ignores normal chat", () => expect(parseTranslate("I live in india")).toBeNull());
});
describe("mood from speech", () => {
  it("sad", () => expect(detectMood("I feel so lonely today")).toBe("sad"));
  it("stressed", () => expect(detectMood("I'm really worried about my exam")).toBe("stressed"));
  it("neutral", () => expect(detectMood("what's the weather")).toBeNull());
});
import { moodHint } from "@/lib/morgan/sense";
describe("companion mood hint", () => {
  it("names the mood", () => expect(moodHint("sad")).toContain("sad"));
});
