import { describe, it, expect } from "vitest";
import { ownerReply, OWNER_LINE, OWNER_SOCIAL } from "@/lib/morgan/owner";

describe("complaints never get the canned creator line", () => {
  it.each(["why do you always say im built by ghashiyat", "what r u saying that", "i didnt even ask you", "then answer it properly"])("%s", (m) => {
    expect(ownerReply(m, OWNER_LINE)).toBeNull();
  });
  it("long follow-ups about him go to the AI", () => {
    expect(ownerReply("dont you know anything about him", OWNER_SOCIAL)).toBeNull();
  });
  it("real owner questions still answer instantly", () => {
    expect(ownerReply("who built you")).toBe(OWNER_LINE);
  });
});
