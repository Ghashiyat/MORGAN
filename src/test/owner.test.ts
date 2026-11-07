import { describe, it, expect } from "vitest";
import { ownerReply, OWNER_LINE, OWNER_NAME, OWNER_SOCIAL, OWNER_DETAILS } from "@/lib/morgan/owner";
import { visionProviders, providerConfigs } from "@/lib/morgan/providers";

describe("owner answers without AI or web research", () => {
  it("returns only the requested initial line", () => {
    for (const q of ["who is your owner", "who made you", "who built MORGAN", "who is your developer", "who is your develop", "who created this app", "search online who built you"])
      expect(ownerReply(q)).toBe("I’m built by Ghashiyat.");
  });
  it("supplies the name only on an explicit request", () => {
    expect(ownerReply("what is his name", OWNER_LINE)).toBe("I’m built by Ghashiyat.");
  });
  it("supplies only the provided social handle", () => {
    expect(ownerReply("his insta?", OWNER_LINE)).toBe("Instagram: @ghashiyat");
    expect(ownerReply("your owner's socials")).toBe(OWNER_SOCIAL);
  });
  it("labels owner lore as fiction instead of inventing real personal facts", () => {
    expect(ownerReply("tell me more about him", OWNER_NAME)).toBe(OWNER_DETAILS);
    expect(ownerReply("your owner's background")).toBe(OWNER_DETAILS);
  });
  it("does not intercept unrelated people or questions", () => {
    expect(ownerReply("who made the pyramids")).toBeNull();
    expect(ownerReply("my owner has an instagram account")).toBeNull();
    expect(ownerReply("tell me more about gravity", "Gravity attracts mass.")).toBeNull();
    expect(ownerReply("Live lens: inspect the attached camera photo and readable text", OWNER_LINE)).toBeNull();
  });
});
describe("Lens provider eligibility", () => {
  it("excludes text-only models from image races", () => {
    expect(visionProviders(providerConfigs({})).map((p) => p.id)).toEqual(["gemini", "openrouter"]);
  });
});
import { ownerReply as __o } from "@/lib/morgan/owner";
import { areebaReply as __a } from "@/lib/morgan/areeba";
import { describe as __d, it as __i, expect as __e } from "vitest";
__d("owner/areeba gates ignore unrelated questions", () => {
  __i("other owners reach the model", () => {
    for (const q of ["Who is the owner of Tesla?", "Who is the developer of GTA 5?", "Who built the pyramids, do you know?", "Who created Python and why do you like it?"]) __e(__o(q)).toBeNull();
  });
  __i("own owner still answered", () => {
    for (const q of ["who made you?", "Who built MORGAN", "who is your owner", "who's your creator?"]) __e(__o(q)).toBe("I’m built by Ghashiyat.");
  });
  __i("generic bot questions reach the model", () => {
    __e(__a("How do I make the bot reply faster in my Discord server?")).toBeNull();
    __e(__a("What does your bot API return?")).toBeNull();
    __e(__a("who is areeba?", undefined, "Areeba")).toContain("Areeba");
    __e(__a("what's that little bot?", undefined, "Areeba")).toContain("Areeba");
  });
});

describe("owner follow-up about other companies", () => {
  it("does not claim Microsoft's owner after an owner reply", () => {
    expect(ownerReply("Who is the owner of Microsoft and who founded it?", "Instagram: @ghashiyat")).toBeNull();
  });
  it("still answers 'his instagram' follow-up", () => {
    expect(ownerReply("his instagram?", "I’m built by Ghashiyat.")).toBe("Instagram: @ghashiyat");
  });
});
import { ownerReply as ownerReply2 } from "@/lib/morgan/owner";
describe("creator-line complaints", () => {
  it("does not repeat the creator line when the user complains about it", () => {
    expect(ownerReply2("why do u say im built by ghashiyat i didnt aks rigjht")).toBeNull();
    expect(ownerReply2("wait why do you always say im built by ghashiyat i didnt ask right")).toBeNull();
  });
  it("still answers a real creator question", () => {
    expect(ownerReply2("who built you?")).toBe(OWNER_LINE);
  });
});
