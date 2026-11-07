import { describe, it, expect } from "vitest";
import { parseDeckRequest, isVagueTopic } from "@/lib/morgan/deck-intent";
import { chatIdReply } from "@/lib/morgan/chat-id";
describe("understanding follow-ups", () => {
  it("'MAKE PPT AND SEND' has no real topic", () => {
    const r = parseDeckRequest("MAKE PPT AND SEND");
    expect(r === null || isVagueTopic(r.topic) || r.fromFiles).toBe(true);
  });
  it("a real topic is not vague", () => expect(isVagueTopic("solar energy")).toBe(false));
  it("'GIVE ME CAT ID' returns the chat id", () => expect(chatIdReply("GIVE ME CAT ID", "abc")).toContain("abc"));
  it("cat facts are not a chat id", () => expect(chatIdReply("give me cat facts", "abc")).toBeNull());
});
describe("long brief ending with a command", () => {
  it("builds a deck about the brief's subject", () => {
    const brief = "SmartShelf: IoT-Based NFC Library Management System\n" + "Details about hardware and cloud. ".repeat(60) + " MAKE PPT ON THIS";
    const r = parseDeckRequest(brief);
    expect(r).not.toBeNull();
    expect(r?.topic).toContain("smartshelf");
  });
});
describe("very long brief", () => {
  it("a 10,000-character brief ending with MAKE PPT ON THIS is still a deck", () => {
    const brief = "SmartShelf: IoT-Based NFC Library Management System\n" + "Hardware and cloud details. ".repeat(380) + " MAKE PPT ON THIS";
    expect(brief.length).toBeGreaterThan(10000);
    expect(parseDeckRequest(brief)?.topic).toContain("smartshelf");
  });
});
