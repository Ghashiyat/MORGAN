import { describe, expect, it } from "vitest";
import { parseMediaIntent } from "@/lib/morgan/media-intent";
import { videoIdFromUrl } from "@/lib/media.functions";

describe("media intent", () => {
  it("detects play requests", () => {
    expect(parseMediaIntent("Morgan, play Interstellar.")).toEqual({ kind: "play", query: "interstellar" });
    expect(parseMediaIntent("search youtube for lofi beats")).toEqual({ kind: "play", query: "lofi beats" });
    expect(parseMediaIntent("play a youtube video about black holes")).toEqual({ kind: "play", query: "black holes" });
  });
  it("leaves conversation alone", () => {
    expect(parseMediaIntent("Explain the meaning of this song")).toBeNull();
    expect(parseMediaIntent("play a game with me")).toBeNull();
    expect(parseMediaIntent("pause")).toBeNull();
  });
  it("detects controls while playing", () => {
    expect(parseMediaIntent("pause", true)).toEqual({ kind: "control", action: "pause" });
    expect(parseMediaIntent("pause the music")).toEqual({ kind: "control", action: "pause" });
    expect(parseMediaIntent("next song", true)).toEqual({ kind: "control", action: "next" });
    expect(parseMediaIntent("volume up", true)).toEqual({ kind: "control", action: "volup" });
    expect(parseMediaIntent("stop the music")).toEqual({ kind: "control", action: "stop" });
  });
  it("extracts real video ids only", () => {
    expect(videoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
    expect(videoIdFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(videoIdFromUrl("https://www.youtube.com/@channel")).toBeNull();
  });
});

import { parseMediaIntent as pmi } from "@/lib/morgan/media-intent";
describe("casual song requests", () => {
  it("can u on the song kesha tiktok", () => expect(pmi("can u on the song kesha tiktok")).toEqual({ kind: "play", query: "kesha tiktok" }));
  it("turn on kesha tiktok", () => expect(pmi("turn on kesha tiktok")).toEqual({ kind: "play", query: "kesha tiktok" }));
  it("i wanna listen to believer", () => expect(pmi("i wanna listen to believer")).toEqual({ kind: "play", query: "believer" }));
  it("play a game is not media", () => expect(pmi("play a game")).toBeNull());
});

describe("generic play requests open music directly", () => {
  it.each(["can u play me a song", "pla y me music", "play me music", "i want to hear the song", "launch music", "start playing", "play something"])("%s", (s) => {
    expect(parseMediaIntent(s)).toEqual({ kind: "play", query: "top hits music mix" });
  });
  it("launch a named song", () => expect(parseMediaIntent("launch believer")).toEqual({ kind: "play", query: "believer" }));
});

import { extractPlayTag } from "@/lib/morgan/media-intent";
describe("understands what the user means", () => {
  it("oplay typo still plays", () => expect(pmi("oplay ke$ha tiktok")).toEqual({ kind: "play", query: "ke$ha tiktok" }));
  it("play it never searches the word 'it'", () => expect(pmi("play it")).toBeNull());
  it("play it replays the last request", () => expect(pmi("play it", false, "ke$ha tiktok")).toEqual({ kind: "play", query: "ke$ha tiktok" }));
  it("play it resumes when the player is open", () => expect(pmi("play it", true, "x")).toEqual({ kind: "control", action: "resume" }));
  it("AI play tag is extracted and hidden", () => expect(extractPlayTag("Playing now. [[PLAY: kesha tiktok]]")).toEqual({ query: "kesha tiktok", clean: "Playing now." }));
});
