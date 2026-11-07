import { describe, it, expect } from "vitest";
import { isDiagnoseRequest, diagnoseReply } from "@/lib/morgan/diagnose";
describe("self-diagnosis", () => {
  it("detects diagnose requests but not normal chat", () => {
    expect(isDiagnoseRequest("why were you so slow?")).toBe(true);
    expect(isDiagnoseRequest("diagnose yourself")).toBe(true);
    expect(isDiagnoseRequest("how do I diagnose a car engine problem in winter weather conditions and fix it myself at home without tools please explain everything in detail step by step for a beginner")).toBe(false);
    expect(isDiagnoseRequest("tell me about tokyo")).toBe(false);
  });
  it("blames slow web search", () => {
    expect(diagnoseReply({ firstTokenMs: 900, totalMs: 2000, diag: { route: "ai", prepMs: 300, searchMs: 4000, enginesTried: 2, enginesFailed: 0 } })).toContain("web search was slow");
  });
});
import { learn, learnedPrompt, correctionLesson } from "@/lib/morgan/learning";
describe("learning from corrections", () => {
  it("records a correction and shows it in later prompts", () => {
    const p = learn(null, { prevUser: "tell me about jaguar", text: "no, I meant the car brand" });
    expect(p.lessons?.length).toBe(1);
    expect(learnedPrompt(p)).toContain("Past mistakes to avoid");
  });
  it("ignores normal messages", () => {
    expect(correctionLesson("tell me a joke", "hi")).toBeNull();
  });
});
