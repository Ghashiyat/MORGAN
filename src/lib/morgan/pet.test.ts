import { describe, expect, it } from "vitest";
import { PRESETS, type PresetId } from "./prompt";
import { FALLBACK_ROAST, LOOKS, ROASTS, presetOf, roastFor } from "./pet";

describe("companion personality looks", () => {
  it("gives every selectable personality its own style", () => {
    for (const id of Object.keys(PRESETS) as PresetId[]) {
      expect(LOOKS[id], id).toBeDefined();
      expect(LOOKS[id].cls, id).toBe(`pet-${id.toLowerCase()}`);
    }
    expect(LOOKS.DEFAULT).toBeDefined();
  });

  it("falls back to the plain face for junk or a missing personality", () => {
    expect(presetOf({})).toBe("DEFAULT");
    expect(presetOf({ preset: "NOT_A_PERSONALITY" })).toBe("DEFAULT");
    expect(presetOf(undefined)).toBe("DEFAULT");
    expect(presetOf("nonsense")).toBe("DEFAULT");
    expect(presetOf({ preset: "RUTHLESS" })).toBe("RUTHLESS");
  });
});

describe("companion switch roasts", () => {
  it("answers a known switch with the new personality's line", () => {
    expect(roastFor("JARVIS", "RUTHLESS")).toBe("Polite is just lying with better manners.");
    expect(roastFor("RUTHLESS", "COMPANION")).toBe("Ouch. Okay, my turn — gently.");
  });

  it("never goes silent on an unknown pair", () => {
    expect(roastFor("MYSTERY", "EDITH")).toBe(FALLBACK_ROAST);
    expect(roastFor("EDITH", "MYSTERY")).toBe(FALLBACK_ROAST);
  });

  it("keeps every roast short enough for the bubble", () => {
    for (const [to, byFrom] of Object.entries(ROASTS)) {
      for (const [from, line] of Object.entries(byFrom)) {
        expect(line.length, `${to} <- ${from}`).toBeLessThanOrEqual(52);
      }
    }
  });
});
