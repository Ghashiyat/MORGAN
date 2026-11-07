/** Deck Engine trigger: detects a request for a real presentation file. Pure, unit tested. */
import type { ThemeId } from "./deck-engine";

export type DeckRequest = { topic: string; slides?: number | undefined; theme?: ThemeId | undefined; fromFiles?: boolean | undefined };

const NOUN = /\b(ppt|pptx|power ?point|slides?|slide ?deck|deck|presentation|pitch ?deck|keynote|handout)\b/i;
const ASK = /\b(make|build|creat\w*|generat\w*|prepar\w*|design\w*|produc\w*|draft|put together|turn (?:this|it|these|that|my|the)\b[^.]{0,24}into|convert|give me|write me|work up|i need|i want)\b/i;
const HOWTO = /^(how|what|why|when|where|which|who|is|are|does|do|should|could|would|can)\b/i;
const DIRECT = /\byou(?:'ll| can| could| will)? (?:please )?(?:make|build|creat\w*|generat\w*|prepar\w*|design\w*|produc\w*|draft)\b/i;
const PERSONAL = /\b(me|my|for me|us|our)\b/i;
const ABOUT = /\b(?:about|on|for|covering|regarding|concerning|explaining|describing)\s+(.+)$/i;
const COUNT = /\b(\d{1,2})\s*[- ]?\s*(?:[a-z-]+\s+){0,3}(?:slides?|pages?)\b/i;

const FILLER_START = /^(hey |ok |okay |yo |so |alright |please |pls |plz |just |now |quickly |also )+/;
const FILLER_END = /(?: (?:please|pls|plz|now|thanks|ty|for me|bro|yaar|bhai|already|right now))+$/;
const STOP_WORDS = /^(this|that|it|these|those|them|one|same|the same|something|anything|stuff|things|me|you|us|a deck|a ppt)$/;
/** "turn this into a deck" — the subject is the material, not a named topic. */
const MATERIAL = /\b(this|these|them|it|my notes|notes|attached|file|pdf|docx|upload)\b/i;

/** Which theme the user hinted at, if any. */
function hintTheme(t: string): ThemeId | undefined {
  if (/\b(dark|obsidian|black|cyan|neon|futuristic|morgan)\b/i.test(t)) return "obsidian";
  if (/\b(light|white|minimal\w*|clean|simple|print\w*|corporate|classic|boardroom)\b/i.test(t)) return "minimal";
  if (/\b(purple|royal|gold|luxur\w*|premium|velvet|elegant)\b/i.test(t)) return "royal";
  if (/\b(warm|sunset|orange|coral|cozy|friendly|colou?rful)\b/i.test(t)) return "sunset";
  if (/\b(green|emerald|nature|eco|sustainab\w*|finance|financ\w*|money|invest\w*|growth)\b/i.test(t)) return "emerald";
  return undefined;
}

function hintCount(t: string): number | undefined {
  const m = t.match(COUNT);
  if (!m?.[1]) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 2 && n <= 16 ? n : undefined;
}

/** Pull the subject out of the request, dropping the ask itself. */
function extractTopic(t: string): string {
  const about = t.match(ABOUT);
  let raw = "";
  if (about?.[1]) {
    raw = about[1];
  } else {
    raw = t
      .replace(/\b(?:make|build|creat\w*|generat\w*|prepar\w*|design\w*|produc\w*|draft|convert|give me|write me|work up|put together|i need|i want)\b/g, " ")
      .replace(/\b(?:turn|convert)\b[^.]{0,24}into\b/g, " ")
      .replace(/\b(?:pptx?|ppt|power ?point|slides?|slide ?deck|deck|presentation|pitch ?deck|keynote|handout)\b/g, " ")
      .replace(/\b(?:a|an|the|me|my|us|our|you|your|new|fresh|full|complete|proper|good|nice|quick|short|detailed|simple|clean|dark|light|white|green)\b/g, " ")
      .replace(/\b\d+\s*[- ]?\s*(?:slides?|pages?)\b/g, " ");
  }
  raw = raw
    .replace(FILLER_START, "")
    .replace(FILLER_END, "")
    .replace(/,\s*(?:dark|light|white|green|minimal\w*|clean|simple|corporate|classic|boardroom|neon|cyan|futuristic|obsidian|emerald)\s*(?:theme|style|look)?\s*$/i, "")
    .replace(/^\s*(?:about|on|for|of|covering|regarding|explaining|describing)\s+/i, "")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (STOP_WORDS.test(raw)) return "";
  return raw.slice(0, 220);
}

/** "stop", "no slides", "I asked about…", or a question about MORGAN itself: never a deck. */
const NOT_DECK = /\b(stop|don'?t|do not|dont|no more|not (?:a |the )?(?:ppt|pptx|slides?|deck|presentation)|without (?:slides?|ppt|deck)|i (?:said|asked|meant|was asking)|i asked about|that'?s not what|wrong|cancel|forget (?:it|the))\b/i;
const SELF = /\b(about (?:you|yourself|morgan|areeba|your (?:owner|creator|developer|self|features?|capabilit\w*|brain|tech\w*))|who (?:are|made|built|created|developed) you|your (?:owner|creator|developer)|what can you do|how do you work)\b/i;
const DECK_REF = /\b(ppt|pptx|power ?point|slides?|deck|presentation|theme|colou?r|design|style|look|watermark|pdf|file|it|this|that)\b/i;

/** "make ppt and send" — no real subject; the material is what the user pasted before. */
export function isVagueTopic(topic: string): boolean {
  const t = topic.toLowerCase().replace(/\b(and|send|it|this|that|now|please|pls|me|to|of|on|from|above|for|file|here|bro|quick(?:ly)?|asap|fast)\b/g, " ").trim();
  return t.length < 3;
}

export function isNotDeckTurn(text: string): boolean {
  const t = String(text ?? "").toLowerCase();
  return NOT_DECK.test(t) || SELF.test(t);
}

/** An unmistakable command at the start: "create 8 professional ppt slides on …", "make a presentation about …". */
const EXPLICIT = /^(?:(?:hey|ok|okay|yo|so|please|pls|plz|morgan|bro|now|can you|could you|will you)[\s,]+)*(?:make|build|creat\w*|generat\w*|prepar\w*|design\w*|produc\w*|draft|give me|write me|i need|i want)\b[^.!?\n]{0,60}?\b(ppt|pptx|power ?point|slides?|slide ?deck|deck|presentation|pitch ?deck)\b/i;

const COMMAND = /\b(?:make|build|creat\w*|generat\w*|prepar\w*|design|draft|give me|write me|i need|i want|need)\b[^.!?\n]{0,60}?\b(ppt|pptx|power ?point|slides|slide ?deck|deck|presentation|pitch ?deck)\b/i;

export function parseDeckRequest(text: string): DeckRequest | null {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t.length > 20000) return null;
  // A long pasted brief often ends with the command: "... MAKE PPT ON THIS".
  const tail = t.length > 400 ? t.slice(-160).split(/(?<=[.!?])\s|\n/).map((x) => x.trim()).filter(Boolean).pop() ?? "" : "";
  // Long briefs bury the command anywhere ("Topic: X. I want 8 slides ppt…", "…\nPlease make a ppt"): check each short sentence/line.
  const buried = t.length > 400 && String(text ?? "").toLowerCase().split(/\n|(?<=[.!?:])\s+/).some((s) => {
    const x = s.trim();
    return x.length <= 220 && !/presentation layer/.test(x) && COMMAND.test(x);
  });
  const explicit = EXPLICIT.test(t) || (!!tail && EXPLICIT.test(tail)) || buried;
  // Long briefs often contain "don't…" or "wrong" as instructions; an explicit opening command still wins.
  if (SELF.test(t) || (!explicit && (t.length > 400 || NOT_DECK.test(t)))) return null;
  if (!NOUN.test(t) || !ASK.test(t)) return null;
  // "how do I make a ppt" is a question, not a request for one.
  if (!explicit && HOWTO.test(t) && !DIRECT.test(t) && !PERSONAL.test(t)) return null;
  // Topic comes from the first sentence of a long brief; the full text still goes to the planner.
  const firstLine = String(text ?? "").split("\n").map((l) => l.replace(/^[#*>\s-]+/, "").trim()).find((l) => l.length > 3)?.toLowerCase();
  const head = t.length > 300 ? (firstLine && firstLine.length <= 160 && !EXPLICIT.test(firstLine) ? firstLine : (t.split(/(?<=[.!?])\s/)[0] ?? t)) : t;
  const titled = t.length > 300 && head === firstLine;
  const topic = (titled ? head.replace(/[.!?,;:]+$/g, "").slice(0, 160) : extractTopic(head)) || (explicit ? extractTopic(t) : "");
  if (!topic) return MATERIAL.test(t) ? { topic: "the attached material", fromFiles: true } : null;
  const slides = hintCount(t);
  const theme = hintTheme(t);
  return { topic, ...(slides !== undefined ? { slides } : {}), ...(theme ? { theme } : {}) };
}

const EDIT = /\b(edit|change|update|modify|redo|rework|rewrite|improve|fix|add|remove|delete|replace|swap|shorten|expand|make (?:it|the|slide|this)|more|less|fewer|another|different|instead|theme|colou?r|slide \d{1,2})\b/i;
/** A follow-up that edits the deck MORGAN just made ("make it purple", "add a slide on costs"). */
export function parseDeckEdit(text: string): { theme?: ThemeId | undefined; slides?: number | undefined } | null {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t.length > 400 || !EDIT.test(t) || /^(what|why|who|how come)\b/.test(t)) return null;
  const theme = hintTheme(t);
  const slides = /\b(\d{1,2})\s*slides?\b/.test(t) ? hintCount(t) : undefined;
  return { ...(theme ? { theme } : {}), ...(slides !== undefined ? { slides } : {}) };
}

export type DeckFollowUp = {
  kind: "remake" | "resend" | "revise";
  theme?: ThemeId | undefined;
  slides?: number | undefined;
  format?: "pptx" | "pdf" | undefined;
  watermark?: false | undefined;
};

// Tolerates typos: "remkae", "redisgn", "regenrate", "agian".
const REMAKE = /\b(re ?ma?k\w*|remkae|re ?desi?g?n\w*|redisgn\w*|re ?gen\w*|regenrat\w*|re ?do|re ?build|re ?create|new version|another version|fresh (?:ppt|deck|version|one|design)|completely (?:new|different)|totally (?:new|different)|different (?:design|style|look|version)|change the (?:design|style|look)|more (?:beautiful|aesthetic|attractive|professional|stunning|premium)|better (?:design|looking)|improve the (?:slides|design|deck|ppt|look)|make it (?:look )?(?:better|beautiful|pretty|nicer|prettier|aesthetic))\b/i;
const RESEND = /\b(send (?:it |that |the (?:file|deck|ppt|pdf) )?(?:again|agian|back)|resend|re-send|download (?:it )?(?:again|as (?:a )?(?:pdf|power ?point|pptx?))|export (?:it )?(?:again|as)|give (?:me )?(?:the )?(?:file|link|download)s? again|send (?:me )?(?:the )?(?:pdf|pptx?|power ?point)|(?:as|in) (?:a )?(?:pdf|pptx?|power ?point)(?: please)?$)\b/i;
const NO_MARK = /\b(remove|without|no|drop|delete|hide|get rid of)\b[^.]{0,20}\b(water ?marks?|branding|footer|logo)\b/i;

/** A follow-up to the deck MORGAN just made: remake/redesign, resend/export, or a targeted revision. */
export function parseDeckFollowUp(text: string): DeckFollowUp | null {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t.length > 400 || /^(what|why|who|how come|how does|tell me|explain|can you tell)\b/.test(t)) return null;
  if (isNotDeckTurn(t)) return null;
  // A new topic is not an edit: follow-ups must point at the deck or be a short tweak.
  if (!DECK_REF.test(t) && t.split(" ").length > 6) return null;
  const format: "pptx" | "pdf" | undefined = /\bpdf\b/.test(t) ? "pdf" : /\b(pptx?|power ?point)\b/.test(t) ? "pptx" : undefined;
  const watermark = NO_MARK.test(t) ? (false as const) : undefined;
  const theme = hintTheme(t);
  const slides = /\b(\d{1,2})\s*slides?\b/.test(t) ? hintCount(t) : undefined;
  const extra = { ...(theme ? { theme } : {}), ...(slides !== undefined ? { slides } : {}), ...(format ? { format } : {}), ...(watermark === false ? { watermark } : {}) };
  if (REMAKE.test(t)) return { kind: "remake", ...extra };
  // Resend / export / watermark-only: serve the latest deck as-is, no new planning call.
  if (RESEND.test(t) || (watermark === false && !theme && slides === undefined && t.split(" ").length <= 8)) return { kind: "resend", ...extra };
  const edit = parseDeckEdit(t);
  return edit ? { kind: "revise", ...edit, ...(format ? { format } : {}), ...(watermark === false ? { watermark } : {}) } : null;
}
