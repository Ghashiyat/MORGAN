import { describe, expect, it } from "vitest";
import { parseMediaIntent, sniffPlayingProse, songFromHistory } from "@/lib/morgan/media-intent";

describe("media awareness", () => {
  it("ignores profanity/filler before play", () => {
    expect(parseMediaIntent("bitch just play kesha tiktok")).toEqual({ kind: "play", query: "kesha tiktok" });
  });
  it("treats 'why r u not playing X' as play X", () => {
    expect(parseMediaIntent("what do u mean why r u not playing kesha by tiktok")).toEqual({ kind: "play", query: "kesha by tiktok" });
  });
  it("'u remember that song play that' replays the remembered song", () => {
    expect(parseMediaIntent("u remember that song play that", false, "kesha tiktok")).toEqual({ kind: "play", query: "kesha tiktok" });
  });
  it("sniffs AI prose claiming playback", () => {
    expect(sniffPlayingProse("Putting on TiK ToK by Ke$ha now.")).toBe("TiK ToK by Ke$ha");
    expect(sniffPlayingProse("TiK ToK by Ke$ha is playing now. Hit play.")).toBe("TiK ToK by Ke$ha");
    expect(sniffPlayingProse("Tell me the song name and it starts.")).toBeNull();
  });
  it("finds the last song in chat history", () => {
    expect(songFromHistory(["oplay ke$ha tiktok", "Putting on TiK ToK by Ke$ha now.", "where u didnt play"])).toBe("TiK ToK by Ke$ha");
  });
});
