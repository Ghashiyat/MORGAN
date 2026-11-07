import { describe, it, expect } from "vitest";
import { awarenessPrompt } from "@/lib/morgan/awareness";
describe("awareness", () => {
  it("notices frustration and time of day", () => {
    const p = awarenessPrompt({ hour: 23, turns: 3, text: "you are so dumb today" });
    expect(p).toContain("night");
    expect(p).toContain("frustrated");
  });
});
import { digestPrompt } from "@/lib/morgan/awareness";
describe("daily digest", () => {
  it("is empty without items and lists titles with items", () => {
    expect(digestPrompt(null)).toBe("");
    expect(digestPrompt([{ title: "Big launch", gist: "x" }])).toContain("Big launch");
  });
});
