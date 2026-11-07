import { describe, it, expect } from "vitest";
import { parseDeckRequest } from "@/lib/morgan/deck-intent";

const notes = "Here are notes about qubits and superposition and hardware gates. ".repeat(10);

describe("long brief deck detection", () => {
  it("finds a ppt command in the middle of a long brief", () => {
    const r = parseDeckRequest(`Topic: Quantum Computing. I want 8 slides ppt covering qubits and applications. ${notes}`);
    expect(r?.slides).toBe(8);
  });
  it("finds a ppt command on the last line of a long brief", () => {
    const r = parseDeckRequest(`Here is my detailed project report: ${notes}\nPlease make a ppt presentation with 6 slides.`);
    expect(r?.slides).toBe(6);
  });
  it("a long text without any deck command is not a deck", () => {
    expect(parseDeckRequest(`My essay on climate. ${notes}`)).toBeNull();
  });
});
