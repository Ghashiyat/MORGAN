import { describe, it, expect } from "vitest";
import { chatIdReply } from "@/lib/morgan/chat-id";

const ID = "3f1c2b9a-0000-4000-8000-123456789abc";

describe("chatIdReply", () => {
  it("returns the current chat id when asked", () => {
    expect(chatIdReply("what is my chat id?", ID)).toContain(ID);
    expect(chatIdReply("give me the conversation ID", ID)).toContain(ID);
    expect(chatIdReply("id of this chat pls", ID)).toContain(ID);
  });
  it("ignores unrelated messages", () => {
    expect(chatIdReply("how do I chat with friends", ID)).toBeNull();
    expect(chatIdReply("what is an android id", ID)).toBeNull();
  });
});

describe("chatIdReply coding questions", () => {
  it("ignores technical questions about ids", () => {
    expect(chatIdReply("How do I get the thread ID in Java?", ID)).toBeNull();
    expect(chatIdReply("What is a session ID in cookies?", ID)).toBeNull();
  });
  it("still answers short own-chat asks", () => {
    expect(chatIdReply("chat id?", ID)).toContain(ID);
  });
});
