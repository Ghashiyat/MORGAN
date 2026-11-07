import { describe, it, expect } from "vitest";
import { decideSearch } from "@/lib/morgan/search";
describe("casual today greetings", () => {
  it("does not search for 'How are you holding up today?'", () => {
    expect(decideSearch("How are you holding up today?", true).search).toBe(false);
  });
  it("still searches today's news", () => {
    expect(decideSearch("what's today's news in India?", false).search).toBe(true);
  });
});
