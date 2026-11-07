import { describe, expect, it } from "vitest";
import { buddyName, EMPTY_MEMORY, learn, moodOf, tapLine, areebaReply, relayToAreeba, receiveRelay, loadMemory, normalizeMemory, replyTease } from "@/lib/morgan/areeba";
describe("Areeba", () => {
  it("remembers name and likes", () => {
    const m = learn("my name is rahul and I love cricket.", EMPTY_MEMORY);
    expect(m.name).toBe("Rahul");
    expect(m.likes).toEqual(["cricket"]);
  });
  it("detects funny chat", () => expect(moodOf("haha that's so funny")).toBe("funny"));
  it("ignores plain chat", () => expect(moodOf("what is the capital of france")).toBeNull());
  it("uses the name on tap", () => {
    const m = { ...EMPTY_MEMORY, name: "Rahul" };
    expect(tapLine(m, 0.7)).toContain("Rahul");
  });
  it("relays messages via MORGAN", () => {
    expect(relayToAreeba("Morgan inform Areeba that I love biryani", "Areeba")).toBe("I love biryani");
    const result = receiveRelay("my name is Rahul and I love biryani", EMPTY_MEMORY);
    expect(result.memory.name).toBe("Rahul");
    expect(result.memory.likes).toEqual(["biryani"]);
    expect(result.changed).toBe(true);
  });
  it("remembers only keepsakes, not work", () => {
    expect(receiveRelay("write my presentation about physics", EMPTY_MEMORY).memory).toEqual(EMPTY_MEMORY);
    expect(receiveRelay("remember my birthday is 12 May", EMPTY_MEMORY).memory.notes).toEqual(["my birthday is 12 May"]);
  });
  it("does not store private credentials", () => {
    expect(receiveRelay("remember my password is biryani", EMPTY_MEMORY).memory).toEqual(EMPTY_MEMORY);
  });
  it("keeps memories when reloaded and answers new chat memory questions", () => {
    const saved = receiveRelay("my name is Rahul and I love cricket", EMPTY_MEMORY).memory;
    const restored = loadMemory(JSON.stringify(saved));
    expect(areebaReply("what does Areeba remember about me", restored, "Areeba")).toContain("your name is Rahul");
    expect(restored.likes).toEqual(["cricket"]);
  });
  it("uses the supplied full form", () => {
    expect(areebaReply("Areeba full form?", undefined, "Areeba")).toBe("Always Replying Even , Eating Biryani At midnight");
  });
  it("can clear Areeba memory separately", () => {
    expect(receiveRelay("forget all your memory", { ...EMPTY_MEMORY, name: "Rahul" }).memory).toEqual(EMPTY_MEMORY);
  });
  it("caps keepsakes and rejects malformed storage", () => {
    const m = normalizeMemory({ notes: Array.from({ length: 10 }, (_, i) => `note ${i}`), likes: [3, "tea"], laughs: "bad" });
    expect(m.notes).toHaveLength(4);
    expect(m.likes).toEqual(["tea"]);
    expect(m.laughs).toBe(0);
  });
  it("teases wrong answers but never distress", () => {
    expect(replyTease("that's wrong", "okay")).not.toBeNull();
    expect(replyTease("I'm sad, that's wrong", "okay")).toBeNull();
  });
  it("uses the user-chosen mini bot name", () => {
    expect(relayToAreeba("tell Mochi I love tea", "Mochi")).toBe("I love tea");
    expect(areebaReply("tell Mochi I love tea", EMPTY_MEMORY, "Mochi")).toBe("I've passed your message to Mochi.");
    expect(areebaReply("who is Mochi?", EMPTY_MEMORY, "Mochi")).toContain("That's Mochi");
    expect(areebaReply("who is areeba?", EMPTY_MEMORY, "Mochi")).toBeNull();
    expect(tapLine(EMPTY_MEMORY, 0.5, "Mochi")).toContain("Mochi");
  });
  it("falls back to Buddy until a name is set", () => {
    expect(buddyName(undefined)).toBe("Buddy");
    expect(buddyName("   ")).toBe("Buddy");
    expect(areebaReply("tell Buddy hi", EMPTY_MEMORY)).toBe("I've passed your message to Buddy.");
    expect(areebaReply("hey buddy, what's the capital of France?", EMPTY_MEMORY)).toBeNull();
  });
});
