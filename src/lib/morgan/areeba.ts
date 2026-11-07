/**
 * Areeba — the little buddy above the input bar. Pure, React-free helpers so
 * her memory and humour can be tested on their own. Zero AI calls.
 */

/** Name used until the user picks one for their mini bot. */
export const DEFAULT_BUDDY = "Buddy";
export const AREEBA_FULL_FORM = "Always Replying Even , Eating Biryani At midnight";
/** Cleans a user-chosen mini-bot name; falls back to "Buddy". */
export function buddyName(raw: unknown): string {
  const n = typeof raw === "string" ? raw.replace(/[^\p{L}\p{N} '_-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20) : "";
  return n || DEFAULT_BUDDY;
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function buddyKnowledge(raw?: unknown): string {
  const name = buddyName(raw);
  const meaning = name.toLowerCase() === "areeba" ? ` Her name means "${AREEBA_FULL_FORM}".` : "";
  return `${name} is the playful little buddy beside the composer, separate from MORGAN; the user chose the name "${name}".${meaning} ${name} has a small private memory for important personal details across chats, not work history. Users tell MORGAN to tell/inform ${name} something; the app relays it and ${name} reacts in a bubble. There is no separate ${name} chat. Never claim ${name} thinks independently or remembers a detail unless supplied by the app.`;
}

export type AreebaMemory = { name?: string; likes: string[]; hates: string[]; laughs: number; notes?: string[] };
export type Mood = "funny" | "sweet" | "hype" | "deep";

export const EMPTY_MEMORY: AreebaMemory = { likes: [], hates: [], laughs: 0, notes: [] };

const clean = (s: string) => s.trim().replace(/[.!?,;]+$/, "").slice(0, 30);
const addUnique = (list: string[], v: string) =>
  v && !list.some((x) => x.toLowerCase() === v.toLowerCase()) ? [...list, v].slice(-6) : list;

/** Picks up small personal details from what the user types. */
export function learn(text: string, mem: AreebaMemory): AreebaMemory {
  let next = { ...mem, likes: [...mem.likes], hates: [...mem.hates] };
  // Never collect credentials, third-party details or ordinary work instructions.
  if (/\b(?:password|passcode|token|api.?key|secret|otp|credit card)\b/i.test(text)) return next;
  const name = text.match(/\b(?:my name is|call me)\s+([a-z][a-z'-]{1,20})/i);
  if (name) { const w = name[1] ?? ""; next.name = w.charAt(0).toUpperCase() + w.slice(1); }
  const like = text.match(/\bi (?:really )?(?:love|like|enjoy|adore)\s+([^.!?,]{2,30})/i)
    ?? text.match(/\bmy fav(?:ou?rite)? \w+ is\s+([^.!?,]{2,30})/i);
  if (like) next.likes = addUnique(next.likes, clean(like[1] ?? ""));
  const hate = text.match(/\bi (?:hate|can't stand|dislike)\s+([^.!?,]{2,30})/i);
  if (hate) next.hates = addUnique(next.hates, clean(hate[1] ?? ""));
  if (/\b(?:lol|lmao|haha|hehe|😂|🤣)/i.test(text)) next = { ...next, laughs: next.laughs + 1 };
  return next;
}

export function moodOf(text: string): Mood | null {
  if (/\b(?:lol|lmao|rofl|haha+|hehe|joke|funny)\b|😂|🤣|😆/i.test(text)) return "funny";
  if (/\b(?:love you|thank(?:s| you)|miss you|sweet|cute|aww+)\b|❤️|🥰|😊/i.test(text)) return "sweet";
  if (/\b(?:let'?s go|awesome|amazing|yay|hype|won|crushed it)\b|🔥|🚀|!{2,}/i.test(text)) return "hype";
  if (/\b(?:why do we|meaning of|universe|life is|philosoph|wonder)\b/i.test(text)) return "deep";
  return null;
}

const QUIPS: Record<Mood, string[]> = {
  funny: ["Okay that was funny, I'm stealing it.", "I laughed so hard my cloud almost rained.", "Comedy gold. Write that down.", "Hehe. You're trouble."],
  sweet: ["Aww, stop, I'm blushing.", "That's why you're my favourite human.", "Soft hours activated 💗"],
  hype: ["LET'S GOOO 🚀", "Main character energy, honestly.", "I'm bouncing. Literally."],
  deep: ["Big brain hours. I'll hold the snacks.", "Deep. I'm just a cloud, but deep."],
};

/** A best-friend line that sometimes reuses something she remembers. */
export function quipFor(mood: Mood, mem: AreebaMemory, roll: number): string {
  const lines = [...QUIPS[mood]];
  const n = mem.name ? `${mem.name}, ` : "";
  if (mood === "funny" && mem.laughs > 3) lines.push(`${n}that's laugh number ${mem.laughs}. I'm counting.`);
  if (mem.likes.length) lines.push(`${n}still obsessed with ${mem.likes[mem.likes.length - 1]}? Same.`);
  if (mood === "funny" && mem.hates.length) lines.push(`Funnier than ${mem.hates[0]}, at least 😏`);
  return lines[Math.floor(roll * lines.length) % lines.length] ?? "Hehe.";
}

/** What she says when tapped — personal once she knows you. */
export function tapLine(mem: AreebaMemory, roll: number, name?: string): string {
  const lines = ["Boop! 💙", "Hehe, that tickles!", `I'm ${buddyName(name)}. Hi bestie!`, "Again! Again!"];
  if (mem.name) lines.push(`Hey ${mem.name}! Missed you.`, `${mem.name}, poke me again, I dare you.`);
  if (mem.likes[0]) lines.push(`Talk to me about ${mem.likes[0]} sometime.`);
  return lines[Math.floor(roll * lines.length) % lines.length] ?? "Hehe.";
}

export function loadMemory(raw: string | null): AreebaMemory {
  try {
    return normalizeMemory(raw ? JSON.parse(raw) : null);
  } catch { /* ignore */ }
  return normalizeMemory(null);
}

export function normalizeMemory(raw: unknown): AreebaMemory {
  const v = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const list = (x: unknown, limit: number, chars: number) => Array.isArray(x)
    ? [...new Set(x.filter((s): s is string => typeof s === "string").map(s => s.trim().slice(0, chars)).filter(Boolean))].slice(-limit) : [];
  return { ...(typeof v["name"] === "string" ? { name: clean(v["name"]) } : {}), likes: list(v["likes"], 6, 30), hates: list(v["hates"], 6, 30),
    notes: list(v["notes"], 4, 120), laughs: typeof v["laughs"] === "number" && Number.isFinite(v["laughs"]) ? Math.max(0, Math.min(999, Math.floor(v["laughs"]))) : 0 };
}

export function relayToAreeba(text: string, name?: string): string | null {
  const n = esc(buddyName(name));
  const m = text.match(new RegExp(`\\b(?:tell|inform|let|ask|remind)\\s+${n}(?![\\p{L}\\p{N}])\\s*(?:know\\s*)?[:,]?\\s*(?:that\\s+)?([\\s\\S]*)`, "iu"))
    ?? text.match(new RegExp(`\\b(?:tell|pass|send)\\s+${n}(?![\\p{L}\\p{N}])\\s*(?:this|a message)?\\s*[:,]?\\s*([\\s\\S]*)`, "iu"));
  return m ? (m[1] ?? "").trim().slice(0, 600) : null;
}

export function memorySummary(mem: AreebaMemory, name?: string): string {
  const b = buddyName(name);
  const facts = [mem.name ? `your name is ${mem.name}` : "", ...mem.likes.map(s => `you like ${s}`), ...mem.hates.map(s => `you dislike ${s}`), ...(mem.notes ?? [])].filter(Boolean);
  return facts.length ? `${b} remembers: ${facts.join("; ")}.` : `${b} hasn't saved any personal details yet. Tell me what you'd like me to pass on.`;
}

export function areebaReply(text: string, mem: AreebaMemory = EMPTY_MEMORY, rawName?: string): string | null {
  // Only the mini bot by its chosen name, or the in-app buddy ("your little bot") — never generic "the bot".
  const name = buddyName(rawName);
  // The neutral default "Buddy" is a common word, so it only counts in relays ("tell Buddy …").
  if (relayToAreeba(text, name) !== null) return `I've passed your message to ${name}.`;
  const named = name !== DEFAULT_BUDDY && new RegExp(`(?<![\\p{L}\\p{N}])${esc(name)}(?![\\p{L}\\p{N}])`, "iu").test(text);
  const buddy = /\b(?:little|small|cute|tiny) (?:bot|buddy)\b/i.test(text) || /^\s*(?:who|what)(?:'s| is) (?:the|that|this) (?:little |cute |tiny )?(?:bot|buddy)(?: (?:on|in) (?:the )?(?:screen|app|corner))?\s*[?.!]*\s*$/i.test(text);
  if (!named && !buddy) return null;
  const isAreeba = name.toLowerCase() === "areeba";
  if (/\b(?:full.?form|stands? for|meaning|means)\b/i.test(text)) return isAreeba ? AREEBA_FULL_FORM : `${name} doesn't have a full form — you named them, so you get to invent one!`;
  if (/\b(?:remember|memory|saved|knows? about me)\b/i.test(text)) return memorySummary(mem, name);
  if (/\b(?:who|what|about|talk|chat|name|how|there)\b/i.test(text)) return `That's ${name}, your witty little bestie. ${name} keeps a few important personal details across chats, separate from my work memory. Tell me “tell ${name} …” and I'll pass it on.${isAreeba ? ` The full form is ${AREEBA_FULL_FORM}.` : ""}`;
  return null;
}

export function receiveRelay(text: string, old: AreebaMemory): { memory: AreebaMemory; reaction: string; changed: boolean } {
  const safe = !/\b(?:password|passcode|token|api.?key|secret|otp|credit card)\b/i.test(text);
  let memory = safe ? learn(text, old) : old;
  // Explicit keepsakes must be personal; homework, commands and messages aren't keepsakes.
  const note = text.match(/\bremember\s+(?:that\s+)?((?:my|i|we|our)\b[^.!?]{2,120})/i)?.[1];
  if (safe && note && !/\b(?:write|summari[sz]e|calculate|homework|presentation|report|code|task)\b/i.test(note))
    memory = normalizeMemory({ ...memory, notes: [...(memory.notes ?? []), note.trim()] });
  // Emotional moments (wins, worries, feelings) are kept as short dated keepsakes.
  const happy = /\b(?:passed|won|got (?:the|a|my)|promoted|birthday|engaged|graduated|finished|launched|selected|cleared|topped|i'm so happy|excited|proud)\b/i.test(text);
  const hurtingMoment = /\b(?:sad|hurt|lonely|stressed|anxious|failed|lost|broke up|miss(?:ing)? (?:home|them|her|him)|tired|scared)\b/i.test(text);
  if (safe && !note && (happy || hurtingMoment) && text.length <= 200) {
    const day = new Date().toISOString().slice(0, 10);
    const keep = `${day}: ${text.trim().replace(/[.!]+$/, "")}`;
    if (!(memory.notes ?? []).some((n) => n.endsWith(text.trim().replace(/[.!]+$/, "")))) memory = normalizeMemory({ ...memory, notes: [...(memory.notes ?? []), keep].slice(-25) });
  }
  if (/\b(?:forget|clear|delete)\b.*\b(?:everything|memory|all)\b/i.test(text)) memory = normalizeMemory(null);
  const changed = JSON.stringify(memory) !== JSON.stringify(old);
  const personal = memory.name ? `${memory.name}, ` : "Bestie, ";
  const hurting = /\b(?:sad|hurt|grief|lonely|depressed|suicide|self.harm|died|anxious)\b/i.test(text);
  const reaction = !safe ? "No passwords in my snack jar, bestie. Keep those private."
    : hurting ? `${personal}I'm here with you. No teasing today — just company. 💙`
    : happy ? `${personal}WAIT WHAT?! 🎉 I'm doing a victory hop! Saving this one in the proud-moments jar. 💗`
    : changed ? `${personal}noted. Tiny memory, VIP treatment. 💙`
    : /\b(?:miss|love)\s+you\b/i.test(text) ? `${personal}aww. You're competing with biryani for my attention. 💗`
    : /\b(?:hi|hello|hey)\b/i.test(text) ? `${personal}hey! MORGAN is officially my messenger pigeon. 💙`
    : `${personal}message received. MORGAN delivered it without eating the envelope. Impressive.`;
  return { memory, reaction, changed };
}

export function replyTease(user: string, reply: string): string | null {
  if (/\b(?:sad|hurt|grief|suicide|self.harm|died|depressed|anxious|medical)\b/i.test(user + reply)) return null;
  if (/\b(?:wrong answer|nonsense|that(?:'s| is) wrong|mad answer|dumb reply)\b/i.test(user)) return "MORGAN, less confidence, more checking. I'll hold the snacks.";
  if (/\b(?:i was born|my childhood|my wife|my husband)\b/i.test(reply)) return "MORGAN, since when did you get a biography? Back to the facts, please.";
  return null;
}
