import { describe, expect, it } from "vitest";
import { parseImageSearch } from "@/lib/morgan/image-search";

describe("parseImageSearch", () => {
  it("detects picture requests", () => {
    expect(parseImageSearch("show me a picture of a cat")).toBe("cat");
    expect(parseImageSearch("find images of Tokyo at night")).toBe("Tokyo at night");
  });
  it("treats generate/make image requests as image search", () => {
    expect(parseImageSearch("generate image of cat in tokyo")).toBe("cat in tokyo");
  });
  it("continues an image flow on short follow-ups", () => {
    expect(parseImageSearch("just give me cat in tokyo city behind a cafe", "give me image of baseball bat")).toBe("cat in tokyo city behind cafe");
    expect(parseImageSearch("thanks", "give me image of baseball bat")).toBeNull();
  });
  it("ignores normal chat", () => {
    expect(parseImageSearch("how do cameras take photos?")).toBeNull();
    expect(parseImageSearch("what is the capital of France")).toBeNull();
    expect(parseImageSearch("cat in tokyo", "what is the capital of France")).toBeNull();
  });
});

describe("parseImageSearch everyday questions", () => {
  it("does not hijack questions that merely mention photos", () => {
    expect(parseImageSearch("How do I get my old photos back from iCloud?")).toBeNull();
    expect(parseImageSearch("I need to send pictures to my friend on WhatsApp")).toBeNull();
    expect(parseImageSearch("give me a presentation on wildlife photos")).toBeNull();
    expect(parseImageSearch("show me my photos")).toBeNull();
  });
});
