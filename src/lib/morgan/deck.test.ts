import { describe, expect, it } from "vitest";
import { parseDeckRequest } from "./deck-intent";
import { deckPlanMessages, deckSummary, normalizeDeck, parseDeckPlan } from "./deck-engine";
import { layoutDeck, PAGE } from "./deck-layout";

const PLAN = JSON.stringify({
  title: "Solar for Small Factories",
  subtitle: "A funding case for the next two years",
  theme: "emerald",
  slides: [
    { layout: "cover", title: "Solar for Small Factories", subtitle: "A funding case for the next two years" },
    { layout: "bento", title: "Why now", cards: [
      { title: "Cheaper panels", body: "Module prices fell sharply over the last decade." },
      { title: "Grid parity", body: "Daytime self-consumption already pays for itself." },
      { title: "Financing", body: "Leases remove the upfront capex wall." },
    ] },
    { layout: "stats", title: "The numbers", stats: [
      { value: "38%", label: "cut in power spend" },
      { value: "4.2 yr", label: "typical payback" },
      { value: "25 yr", label: "panel life" },
    ] },
    { layout: "cta", title: "Fund the pilot", body: "Two factories, one year, measurable savings." },
  ],
});

describe("parseDeckRequest", () => {
  it("catches the phrasings people actually type", () => {
    expect(parseDeckRequest("make me a ppt about solar panels for small factories")).toEqual({ topic: "solar panels for small factories" });
    expect(parseDeckRequest("build a 8 slide deck on our Q3 numbers, minimal theme")).toEqual({ topic: "our q3 numbers", slides: 8, theme: "minimal" });
    expect(parseDeckRequest("can you make a dark deck about crypto")).toEqual({ topic: "crypto", theme: "obsidian" });
    expect(parseDeckRequest("please create a presentation about the water cycle")).toEqual({ topic: "the water cycle" });
    expect(parseDeckRequest("turn my notes into a pitch deck")).toEqual({ topic: "the attached material", fromFiles: true });
    expect(parseDeckRequest("make me a deck")).toBeNull();
  });

  it("stays quiet on questions and non-deck requests", () => {
    expect(parseDeckRequest("how do I make a ppt")).toBeNull();
    expect(parseDeckRequest("what is a presentation")).toBeNull();
    expect(parseDeckRequest("tell me about the water cycle")).toBeNull();
    expect(parseDeckRequest("play a song")).toBeNull();
    expect(parseDeckRequest("")).toBeNull();
  });
});

describe("parseDeckPlan", () => {
  it("reads a clean plan", () => {
    const deck = parseDeckPlan(PLAN);
    expect(deck?.theme).toBe("emerald");
    expect(deck?.slides).toHaveLength(4);
    expect(deck?.slides[0]?.layout).toBe("cover");
    expect(deck?.slides[1]?.cards).toHaveLength(3);
  });

  it("survives code fences and a trailing comma", () => {
    const messy = `Here is your deck:\n\`\`\`json\n${PLAN.replace(/}\]}$/, "},]}")}\n\`\`\``;
    const deck = parseDeckPlan(messy);
    expect(deck?.slides).toHaveLength(4);
    expect(deck?.title).toBe("Solar for Small Factories");
  });

  it("returns null when the model produced nothing usable", () => {
    expect(parseDeckPlan("I can't help with that.")).toBeNull();
    expect(parseDeckPlan('{"title":"x","slides":[{"layout":"bullets","title":"one"}]}')).toBeNull();
  });
});

describe("normalizeDeck", () => {
  it("adds the missing cover and closing slide", () => {
    const d = normalizeDeck({
      title: "Q3 Review",
      slides: [
        { layout: "bento", title: "Where we stand", cards: [{ title: "Revenue", body: "Up on plan." }] },
        { layout: "bullets", title: "Next", points: ["Ship", "Hire", "Fund"] },
        { layout: "stats", title: "Runway", stats: [{ value: "9 mo", label: "left" }] },
        { layout: "timeline", title: "Plan", steps: [{ label: "Q1", body: "Ship" }] },
        { layout: "quote", title: "Focus beats speed.", subtitle: "Memo" },
      ],
    })!;
    expect(d.slides[0]?.layout).toBe("cover");
    expect(d.slides[d.slides.length - 1]?.layout).toBe("cta");
  });

  it("maps an unknown layout onto a safe one", () => {
    const deck = normalizeDeck({ title: "T", slides: [{ layout: "kitchen-sink", title: "A", points: ["x"] }, { layout: "cover", title: "T" }] });
    expect(deck?.slides.some((s) => s.layout === "bullets")).toBe(true);
  });
});

describe("layoutDeck", () => {
  const deck = normalizeDeck(JSON.parse(PLAN))!;

  it("renders one slide per planned slide", () => {
    expect(layoutDeck(deck)).toHaveLength(deck.slides.length);
  });

  it("keeps every piece of text inside the page", () => {
    for (const slide of layoutDeck(deck)) {
      for (const el of slide.el) {
        if (el.t !== "text") continue;
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
        expect(el.x + el.w).toBeLessThanOrEqual(PAGE.w + 0.01);
        expect(el.y + el.h).toBeLessThanOrEqual(PAGE.h + 0.01);
      }
    }
  });

  it("draws every layout without overflow", () => {
    const all = normalizeDeck({
      title: "Full House",
      subtitle: "one of each",
      theme: "obsidian",
      slides: [
        { layout: "cover", title: "Full House", subtitle: "one of each" },
        { layout: "section", title: "The market", body: "Where demand is coming from." },
        { layout: "bullets", title: "Seven points", points: ["a", "b", "c", "d", "e", "f", "g"] },
        { layout: "bento", title: "Four cards", cards: [{ title: "A", body: "x" }, { title: "B", body: "y" }, { title: "C", body: "z" }, { title: "D", body: "w" }] },
        { layout: "split", title: "Then and now", left: { title: "Today", body: "Diesel and downtime." }, right: { title: "Next", body: "Solar and storage." } },
        { layout: "stats", title: "Metrics", stats: [{ value: "12", label: "plants" }, { value: "3.1x", label: "output" }, { value: "9%", label: "loss" }, { value: "48", label: "hires" }] },
        { layout: "timeline", title: "Rollout", steps: [{ label: "Now", body: "Pilot" }, { label: "Q2", body: "Two plants" }, { label: "Q4", body: "Every plant" }] },
        { layout: "quote", title: "Cheaper power is a decision, not a discovery.", subtitle: "Board memo, 2026" },
        { layout: "cta", title: "Approve the pilot", body: "One quarter to prove it." },
      ],
    })!;
    const rendered = layoutDeck(all);
    expect(rendered).toHaveLength(9);
    for (const slide of rendered) {
      for (const el of slide.el) {
        if (el.t !== "text") continue;
        expect(el.x + el.w).toBeLessThanOrEqual(PAGE.w + 0.01);
        expect(el.y + el.h).toBeLessThanOrEqual(PAGE.h + 0.01);
      }
    }
  });
});

describe("deckPlanMessages and deckSummary", () => {
  it("briefs the planner with the topic and the strict shape", () => {
    const msgs = deckPlanMessages({ topic: "water cycle", raw: "make a deck about the water cycle", now: new Date("2026-01-01T00:00:00Z"), slides: 6, theme: "minimal" });
    expect(msgs[0]?.content).toContain("ONE JSON object");
    expect(msgs[0]?.content).toContain("bento");
    expect(msgs[1]?.content).toContain("water cycle");
    expect(msgs[1]?.content).toContain("Slide count requested: 6");
    expect(msgs[1]?.content).toContain("Theme requested: minimal");
  });

  it("summarises the finished deck for chat and speech", () => {
    const deck = parseDeckPlan(PLAN)!;
    expect(deckSummary(deck)).toContain("Solar for Small Factories");
    expect(deckSummary(deck)).toContain("4 slides");
    expect(deckSummary(deck)).toContain(".PPTX");
  });
});

import { parseDeckEdit } from "./deck-intent";
describe("deck edits", () => {
  it("treats 'make it purple' as an edit with the royal theme", () => {
    expect(parseDeckEdit("make it purple")).toEqual({ theme: "royal" });
  });
  it("reads a new slide count from an edit", () => {
    expect(parseDeckEdit("change it to 8 slides")?.slides).toBe(8);
  });
  it("ignores questions", () => {
    expect(parseDeckEdit("what does slide 3 mean")).toBeNull();
  });
});

import { parseDeckFollowUp } from "./deck-intent";
import { WATERMARK } from "./deck-layout";
describe("deck follow-ups", () => {
  for (const t of ["Remake and send", "remake it", "Make a completely new version", "Redesign it", "Make it more beautiful", "Change the design and regenerate", "Make another version", "Make a fresh PPT", "Improve the slides", "remkae it bro"])
    it(`remake: ${t}`, () => expect(parseDeckFollowUp(t)?.kind).toBe("remake"));
  it("send it again → resend", () => expect(parseDeckFollowUp("Send it again")?.kind).toBe("resend"));
  it("download as pdf → resend pdf", () => expect(parseDeckFollowUp("Download as PDF")).toMatchObject({ kind: "resend", format: "pdf" }));
  it("download as powerpoint → resend pptx", () => expect(parseDeckFollowUp("Download as PowerPoint")).toMatchObject({ kind: "resend", format: "pptx" }));
  it("remove the watermark → resend without watermark", () => expect(parseDeckFollowUp("Remove the watermark")).toMatchObject({ kind: "resend", watermark: false }));
  it("small revision stays a revision", () => expect(parseDeckFollowUp("change it to 8 slides")).toMatchObject({ kind: "revise", slides: 8 }));
  it("questions are not actions", () => expect(parseDeckFollowUp("what does slide 3 mean")).toBeNull());
  it("watermark option really removes the footer", () => {
    const deck = { title: "T", subtitle: "", theme: "obsidian" as const, slides: [{ layout: "cover" as const, title: "T" }, { layout: "bullets" as const, title: "A", points: ["x"] }] };
    const has = (w?: boolean) => layoutDeck(deck as never, w === undefined ? {} : { watermark: w }).some((s) => s.el.some((e) => e.t === "text" && e.s === WATERMARK));
    expect(has()).toBe(true);
    expect(has(false)).toBe(false);
  });
});

import { normalizeDeck as nd2 } from "./deck-engine";
import { layoutDeck as ld2 } from "./deck-layout";
describe("deck images", () => {
  it("keeps image queries and places a photo slot on visual and cover slides", () => {
    const d = nd2({ title: "Solar", theme: "emerald", slides: [{ layout: "cover", title: "Solar", image: "solar farm" }, { layout: "visual", title: "Panels", body: "b", points: ["p"], image: "solar panel" }, { layout: "bullets", title: "x", points: ["a", "b"] }] })!;
    const imgs = ld2(d).flatMap((s) => s.el.filter((e) => e.t === "img"));
    expect(imgs.map((e) => (e as { q: string }).q)).toEqual(["solar farm", "solar panel"]);
  });
});

describe("latest message wins over deck tasks", () => {
  it("self/owner questions and corrections never trigger a deck", () => {
    expect(parseDeckRequest("make a presentation about yourself")).toBeNull();
    expect(parseDeckRequest("stop, don't make slides, tell me about the water cycle")).toBeNull();
    expect(parseDeckFollowUp("tell me more about you")).toBeNull();
    expect(parseDeckFollowUp("stop i asked about your owner")).toBeNull();
    expect(parseDeckFollowUp("what is the capital of france and add some history too")).toBeNull();
  });
  it("real deck edits still work", () => {
    expect(parseDeckFollowUp("make it purple")?.kind).toBeTruthy();
    expect(parseDeckFollowUp("add a slide on costs")?.kind).toBe("revise");
  });
});

describe("long explicit PPT briefs", () => {
  const brief = `Create exactly 8 professional PPT slides on IoT-Based Vehicle Proximity Detection and Alert System. Use one consistent dark-blue and cyan automotive technology theme throughout.

Slides: 1. Title with Harshit (119), Akhilesh (112), Afnaan (113) and small Methodist CSA-B at bottom-right. 2. Introduction. 3. Objectives. 4. Components. 5. Working Principle. 6. Circuit Diagram and Project Model. 7. Advantages and Limitations. 8. Conclusion and Thank You.

Use short bullet points, attractive vehicle images, ESP32 and sensor illustrations, and clear diagrams. Keep everything simple, readable and suitable for a college presentation.`;
  it("builds a deck for a long detailed brief with the exact slide count", () => {
    const r = parseDeckRequest(brief);
    expect(r?.topic).toBe("iot-based vehicle proximity detection and alert system");
    expect(r?.slides).toBe(8);
  });
  it("an explicit command still wins when the brief says don't", () => {
    expect(parseDeckRequest("make a ppt on solar energy, don't use red colours")?.topic).toContain("solar energy");
  });
  it("stop still cancels a non-explicit turn", () => {
    expect(parseDeckRequest("stop, no more slides")).toBeNull();
  });
});
