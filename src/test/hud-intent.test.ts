import { describe, expect, it } from "vitest";
import { briefingPrompt, cityFromTimeZone, isBriefing, parseTimerIntent } from "@/lib/morgan/hud-intent";
import { parseMediaIntent } from "@/lib/morgan/media-intent";

describe("timers", () => {
  it("25-minute focus session", () => expect(parseTimerIntent("Set a 25-minute focus session")).toEqual({ kind: "timer", ms: 25 * 60_000, label: "Focus session" }));
  it("remind me in 10 minutes", () => expect(parseTimerIntent("remind me in 10 mins to drink water")).toEqual({ kind: "timer", ms: 600_000, label: "drink water" }));
  it("remind me to X in Y", () => expect(parseTimerIntent("remind me to call mom in 2 hours")).toEqual({ kind: "timer", ms: 7_200_000, label: "call mom" }));
  it("timer for 30 seconds", () => expect(parseTimerIntent("timer for 30 seconds")).toEqual({ kind: "timer", ms: 30_000, label: "Timer" }));
  it("cancel", () => expect(parseTimerIntent("cancel the timer")).toEqual({ kind: "timer-cancel" }));
  it("ignores normal questions", () => expect(parseTimerIntent("how long is a minute in space")).toBeNull());
});

describe("briefing", () => {
  it("detects morning protocol", () => { expect(isBriefing("MORGAN, morning protocol")).toBe(true); expect(isBriefing("give me a briefing")).toBe(true); expect(isBriefing("what is a briefing")).toBe(false); });
  it("city from time zone", () => { expect(cityFromTimeZone("Asia/Calcutta")).toBe("Calcutta"); expect(cityFromTimeZone("UTC")).toBeNull(); });
  it("prompt asks for headlines and weather", () => expect(briefingPrompt("Calcutta", "Monday")).toMatch(/weather in Calcutta.*headlines/));
});

describe("mood + queue", () => {
  it("coding music", () => expect(parseMediaIntent("play something dark and focus-heavy for coding")).toEqual({ kind: "play", query: "dark focus coding music mix" }));
  it("queue up synthwave", () => expect(parseMediaIntent("queue up synthwave next", true)).toEqual({ kind: "queue", query: "synthwave retrowave mix" }));
  it("what song is this", () => expect(parseMediaIntent("what song is this", true)).toEqual({ kind: "nowplaying" }));
  it("named song still works", () => expect(parseMediaIntent("play believer")).toEqual({ kind: "play", query: "believer" }));
});

import { parseCaptureIntent } from "@/lib/morgan/hud-intent";
describe("capture intent", () => {
  it("starts on record commands", () => {
    expect(parseCaptureIntent("Hey MORGAN, record notes for me.")).toBe("start");
    expect(parseCaptureIntent("MORGAN, begin lecture recording")).toBe("start");
  });
  it("stops on finish commands", () => {
    expect(parseCaptureIntent("MORGAN, stop recording")).toBe("stop");
    expect(parseCaptureIntent("finish my notes")).toBe("stop");
  });
  it("ignores normal chat", () => expect(parseCaptureIntent("how do I record a podcast")).toBeNull());
});
