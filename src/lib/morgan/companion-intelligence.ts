// Pure, bounded Companion understanding: expectation, burst grouping, length and tone.
// No network calls; the reply still comes from the existing provider race.
import type { Mood } from "./sense";

export type Expectation =
  | "listen" | "comfort" | "analysis" | "honest_opinion" | "direct_answer"
  | "detailed" | "casual" | "playful" | "encouragement" | "reassess" | "share_joy" | "open";
export type Length = "one_line" | "short" | "medium" | "detailed";
export type CompanionRead = { expectation: Expectation; length: Length; burst: string[]; reference: boolean; forget: boolean };

type Turn = { role: string; text: string };

/** Consecutive user messages since MORGAN's last reply, oldest first (max 4). */
export function userBurst(turns: Turn[]): string[] {
  const out: string[] = [];
  for (let i = turns.length - 1; i >= 0 && out.length < 4; i--) {
    const t = turns[i]!;
    if (t.role !== "user") break;
    if (t.text.trim()) out.unshift(t.text.trim().slice(0, 400));
  }
  return out;
}

export function readCompanion(text: string, turns: Turn[], mood: Mood | null, prefersShort = false): CompanionRead {
  const t = text.trim();
  const burst = userBurst(turns);
  const all = burst.join(" ");
  let expectation: Expectation = "open";
  if (/\b(not understanding|you don'?t (get|understand)|that'?s not what i (meant|asked|said)|you'?re not listening|missing the point)\b/i.test(t)) expectation = "reassess";
  else if (/\b(just listen|don'?t need (a )?solutions?|no advice|just (want|need) to (vent|talk)|don'?t fix)\b/i.test(t)) expectation = "listen";
  else if (/\b(honest(ly)? (opinion|answer)|be honest|tell me honestly|be real with me|truth(fully)?|what do you really think)\b/i.test(t)) expectation = "honest_opinion";
  else if (/\b(where i went wrong|what did i do wrong|analy[sz]e|break (it )?down|exactly why)\b/i.test(t)) expectation = "analysis";
  else if (/\b(explain (everything|properly|in detail|fully)|in detail|elaborate|full explanation)\b/i.test(t)) expectation = "detailed";
  else if (/\b(joke|make me laugh|roast|lol|lmao|haha|😂|🤣)\b/i.test(t)) expectation = "playful";
  else if (/^(hi|hey|hello|yo|sup|what'?s up|good (morning|night|evening)|how are you)[\s!?.]*$/i.test(t)) expectation = "casual";
  else if (/\b(i passed|i got (the|a|in)|we won|i did it|great news|guess what)\b/i.test(t) || mood === "happy") expectation = "share_joy";
  else if (/\b(can i do (it|this)|motivate me|i can'?t do this|give up)\b/i.test(t)) expectation = "encouragement";
  else if (/^(what|who|when|where|how|why|which|is|are|can|does|do)\b.*\?$/i.test(t) && !/\b(i feel|me|my)\b/i.test(t)) expectation = "direct_answer";
  else if (mood === "sad" || mood === "stressed" || mood === "angry" || /\b(nobody (even )?cares|i failed|alone|scared|hurt)\b/i.test(all)) expectation = "comfort";

  const explicitShort = /\b(don'?t give (me )?a long|keep it short|short(er)? (answer|reply)|briefly|in one line|no long)\b/i.test(t);
  let length: Length =
    expectation === "detailed" || expectation === "analysis" ? "detailed"
    : expectation === "casual" || expectation === "playful" ? "one_line"
    : expectation === "honest_opinion" || expectation === "direct_answer" || expectation === "reassess" ? "medium"
    : "short";
  if (explicitShort || (prefersShort && length !== "detailed")) length = length === "detailed" && !explicitShort ? "detailed" : "one_line";
  if (explicitShort && length === "detailed") length = "short";
  return {
    expectation, length, burst,
    reference: /\b(that thing|same (person|thing)|my previous|what happened (yesterday|last)|you know what i mean|continue (from there)?|like i (said|told you)|last week)\b/i.test(t),
    forget: /\b(forget (that|it)|never ?mind|drop it)\b/i.test(t),
  };
}

const GUIDE: Record<Expectation, string> = {
  listen: "They asked you to just listen. Reflect what they said in your own words, no advice, no solutions, at most one gentle question.",
  comfort: "They may be hurting. First understand: acknowledge the specific thing and, if the cause is unclear, ask one soft question (e.g. whether something happened today). No motivational essay, no advice yet.",
  analysis: "They want honest analysis, not reassurance. Say clearly and specifically what went wrong and what to change.",
  honest_opinion: "They asked for honesty. Give your real view, including disagreement or downsides; do not simply agree or flatter.",
  direct_answer: "They asked a direct question. Answer it plainly first; drop the emotional framing.",
  detailed: "They asked for a full explanation. Give enough detail to be complete, still in natural language; structure only if it truly helps.",
  casual: "Casual greeting. Reply like a friend in one short line, maybe a light question back. No 'How can I help you?'.",
  playful: "They are joking around. Be playful and quick-witted in one or two lines.",
  encouragement: "They need encouragement. Be grounded and specific, not hype; one small next step if useful.",
  reassess: "They say you misunderstood. Do NOT repeat or rephrase your previous answer. Re-read their recent messages, state briefly what you now think they mean, and respond to that; if still unsure, ask one precise question.",
  share_joy: "Good news. React genuinely and briefly (\"Wait, that's amazing!\") and ask about it.",
  open: "Work out whether they want advice, comfort, humor, honesty, information or just company, and respond in that shape.",
};
const LEN: Record<Length, string> = {
  one_line: "Length: one sentence, two at most.",
  short: "Length: 1–3 short sentences.",
  medium: "Length: a short paragraph.",
  detailed: "Length: as long as needed to be complete, no padding.",
};

export function companionGuidance(r: CompanionRead): string {
  const lines = [GUIDE[r.expectation], LEN[r.length]];
  if (r.burst.length > 1) lines.push(`They sent several messages in a row; treat them as ONE situation and reply once to the whole thing: ${JSON.stringify(r.burst)}`);
  if (r.reference) lines.push("They refer to something earlier: use the chat history and saved memories; if it isn't there, say you don't have it rather than inventing it.");
  if (r.forget) lines.push("They said to forget/drop that: stop that topic now and don't bring it back.");
  lines.push("Don't name the emotion you detected, don't repeat your last opener or question, no headings or lists in ordinary talk.");
  return `\n\nCompanion read (silent guidance, never recite):\n- ${lines.join("\n- ")}`;
}
