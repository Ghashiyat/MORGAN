import { describe, expect, it } from "vitest";
import { worthExtracting, parseExtraction, planWrites } from "@/lib/morgan/auto-memory";

describe("auto memory", () => {
  it("skips small talk and secrets, keeps durable statements", () => {
    expect(worthExtracting("hi how are you")).toBe(false);
    expect(worthExtracting("my password is hunter2 please")).toBe(false);
    expect(worthExtracting("I'm building an AI app called MORGAN")).toBe(true);
  });
  it("a correction supersedes the old memory instead of duplicating", () => {
    const found = parseExtraction('{"memories":[{"content":"User lives in London","category":"identity","importance":3,"replaces":"User lives in Berlin"}]}');
    const plan = planWrites(found, [{ id: "a", content: "User lives in Berlin" }]);
    expect(plan.supersede).toEqual(["a"]);
    expect(plan.insert).toHaveLength(1);
  });
  it("a near-duplicate is touched, not inserted", () => {
    const plan = planWrites(parseExtraction('{"memories":[{"content":"User is building MORGAN AI app","category":"project"}]}'), [{ id: "b", content: "User is building the MORGAN AI app" }]);
    expect(plan.insert).toHaveLength(0);
    expect(plan.touch).toEqual(["b"]);
  });
});

import { decideSearch } from "@/lib/morgan/search";
import { receiveRelay, EMPTY_MEMORY } from "@/lib/morgan/areeba";
describe("personal recall", () => {
  it("never web-searches where the user lives", () => {
    expect(decideSearch("where do I live now?", true).search).toBe(false);
  });
  it("Areeba keeps happy news as a keepsake", () => {
    expect(receiveRelay("I passed my driving test today!", EMPTY_MEMORY).memory.notes?.[0]).toMatch(/passed my driving test/);
  });
});
describe("supersede guard", () => {
  it("never replaces an unrelated memory", () => {
    const plan = planWrites(parseExtraction('{"memories":[{"content":"User moved from Mumbai to Pune","category":"identity","replaces":"IM GHASHIYAT"}]}'), [{ id: "n", content: "IM GHASHIYAT" }]);
    expect(plan.supersede).toEqual([]);
    expect(plan.insert).toHaveLength(1);
  });
});
