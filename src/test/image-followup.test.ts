import { describe, it, expect } from "vitest";
import { parseImageSearch } from "@/lib/morgan/image-search";
describe("image follow-ups", () => {
  const prev = "show me pictures of Paris";
  it.each(["tell me about its history", "explain the Eiffel Tower", "write a poem about it", "translate that"])("%s is not an image search", (t) => {
    expect(parseImageSearch(t, prev)).toBeNull();
  });
});
