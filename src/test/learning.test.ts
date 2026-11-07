import { describe, expect, it } from "vitest";
import { learn, learnedPrompt } from "@/lib/morgan/learning";

const many = (text: string, n: number, extra = {}) => {
  let p = null as ReturnType<typeof learn> | null;
  for (let i = 0; i < n; i++) p = learn(p, { text, ...extra });
  return p;
};

describe("adaptive learning", () => {
  it("does not act on a habit seen only twice", () => {
    expect(learnedPrompt(many("keep it short", 2))).toBe("");
  });
  it("learns a style after it repeats 3 times", () => {
    expect(learnedPrompt(many("keep it short", 3))).toMatch(/short, sharp/);
  });
  it("learns favourite tools", () => {
    expect(learnedPrompt(many("play a song", 3))).toMatch(/music/);
  });
  it("learns companion mode by time of day", () => {
    const p = many("I feel low", 3, { companion: true, hour: 23 });
    expect(learnedPrompt(p, 22)).toMatch(/emotional support/);
    expect(learnedPrompt(p, 10)).not.toMatch(/emotional support/);
  });
  it("halves old counts so recent habits win", () => {
    const p = many("in a table", 200);
    expect(p?.n).toBe(100);
    expect(p?.style?.table).toBe(100);
  });
});
