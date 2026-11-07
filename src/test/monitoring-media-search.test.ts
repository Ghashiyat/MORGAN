import { describe, expect, it } from "vitest";
import { asksToPlay, extractPlayTag, parseMediaIntent } from "@/lib/morgan/media-intent";
import { resolveSearchQuery, cacheKey } from "@/lib/morgan/search";

describe("requested AI playback bridge", () => {
  it.each(["paly despacito", "plsy believer", "gaana chalao", "despacito gaana chalao", "गाना चलाओ", "play it"])("authorizes requested playback: %s", (text) => expect(asksToPlay(text)).toBe(true));
  it.each(["yes", "do it", "sure", "go ahead"])("accepts %s only after a playback offer", (text) => {
    expect(asksToPlay(text, "Want me to play it?")).toBe(true);
    expect(asksToPlay(text, "Want me to make a PPT?")).toBe(false);
    expect(asksToPlay(text)).toBe(false);
  });
  it.each(["Explain this song", "write a music essay", "play a game", "don't play despacito", "What video should I watch?"])("does not authorize unrelated or negated requests: %s", (text) => expect(asksToPlay(text)).toBe(false));
  it.each([
    "I'm sad, play something uplifting",
    "i'm sad, play something to cheer me up",
    "I've had a rough day. Could you paly Despacito?",
    "I finished studying; put on some relaxing music",
    "Tell me a joke and then plsy Believer",
  ])("authorizes an embedded AI-path music request: %s", (text) => {
    expect(parseMediaIntent(text)).toBeNull();
    const tag = extractPlayTag("Playing now. [[PLAY: uplifting songs]]").query;
    expect(tag && asksToPlay(text)).toBe(true);
  });
  it.each([
    "I'm sad, don't play anything",
    "I'm sad, play a game with me",
    "Explain how to play this song",
    "He said, play Despacito",
    'Translate "play Despacito"',
    "If I'm sad, play something uplifting",
    "I'm sad, tell me about uplifting music",
    "I'm sad, never paly Despacito",
  ])("keeps non-playback conversation safe: %s", (text) => expect(asksToPlay(text)).toBe(false));
  it("allows a requested tag after consent while blocking unrequested tags", () => {
    const tag = extractPlayTag("Playing Despacito now. [[PLAY: despacito]]").query;
    expect(tag && asksToPlay("yes", "Want me to play it?")).toBe(true);
    expect(tag && asksToPlay("make a PPT", "Want me to play it?")).toBe(false);
  });
});

describe("current search subjects beat previous topics", () => {
  it.each(["search Elon Musk", "look up Tesla stock", "search Tesla", "weather?", "news", "search AI", "look up Go"])("keeps %s", (text) => {
    const resolved = resolveSearchQuery(text, ["Apna bana le piya song lyrics"]);
    expect(resolved).toBe(text);
    expect(cacheKey(resolved, "basic", "general")).toBe(cacheKey(text, "basic", "general"));
  });
  it.each(["search it", "look it up", "It's wrong search and give"])("resolves the context-only command %s", (text) => expect(resolveSearchQuery(text, ["Apna bana le piya song lyrics"])).toBe("Apna bana le piya song lyrics"));
});