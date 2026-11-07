import { describe, it, expect } from "vitest";
import { decideSearch, resolveSearchQuery } from "@/lib/morgan/search";
import { chatIdReply } from "@/lib/morgan/chat-id";

describe("lyrics and contextual search", () => {
  it("searches the web for song lyrics", () => {
    expect(decideSearch("Apna bana le piya song lyrics", false).search).toBe(true);
  });
  it("uses the earlier topic when the user just says search", () => {
    expect(resolveSearchQuery("It's wrong search and give", ["Apna bana le piya song lyrics", "Just give full lyrics"])).toBe("Apna bana le piya song lyrics");
  });
  it("keeps a message that has its own topic", () => {
    expect(resolveSearchQuery("weather in Delhi tomorrow", ["old topic here"])).toBe("weather in Delhi tomorrow");
  });
});

describe("chat id questions", () => {
  it("still gives the id when asked", () => {
    expect(chatIdReply("give me chat ID", "x")).toContain("`x`");
  });
  it("answers questions about the id normally", () => {
    expect(chatIdReply("does this chat ID include all the tables only data", "x")).toBeNull();
    expect(chatIdReply("is this chat id safe", "x")).toBeNull();
  });
});
