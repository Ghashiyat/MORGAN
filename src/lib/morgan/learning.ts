// Adaptive learning: cheap pattern counting on each message (no extra AI call, no delay).
// Learned habits become a short hint in MORGAN's prompt once they repeat enough.

export type LearnedProfile = {
  n?: number | undefined; // messages observed
  style?: Partial<Record<StyleKey, number>> | undefined;
  tools?: Partial<Record<ToolKey, number>> | undefined;
  modes?: Partial<Record<ModeKey, number[]>> | undefined; // 4 day-part buckets: night, morning, afternoon, evening
  lessons?: string[] | undefined; // recent corrections, newest last
};

type StyleKey = "short" | "long" | "table" | "bullets" | "hinglish" | "steps" | "code";
type ToolKey = "music" | "search" | "timer" | "capture" | "files" | "notes" | "decks";
type ModeKey = "companion" | "direct" | "study";

const STYLE: Array<[StyleKey, RegExp]> = [
  ["short", /\b(short(er)?|brief(ly)?|in (one|1|two|2) lines?|tl;?dr|less words|keep it short|to the point)\b/i],
  ["long", /\b(more detail(ed)?|in detail|explain (more|fully|properly)|elaborate|full (explanation|answer)|step by step in detail)\b/i],
  ["table", /\b(table|tabular|in a grid)\b/i],
  ["bullets", /\b(bullet(s| points)?|points? wise|list it|as a list)\b/i],
  ["hinglish", /\b(kya|kaise|hai|nahi|bhai|yaar|mujhe|batao|karo|accha|theek)\b/i],
  ["steps", /\b(step[- ]by[- ]step|steps|how do i|guide me)\b/i],
  ["code", /\b(code|function|script|bug|error in|typescript|python|javascript)\b/i],
];
const TOOLS: Array<[ToolKey, RegExp]> = [
  ["music", /\b(play|song|music|youtube|pause|next track)\b/i],
  ["search", /\b(search|google|look up|latest|news|price)\b/i],
  ["timer", /\b(timer|remind me|alarm|countdown)\b/i],
  ["capture", /\b(capture|record (the )?(meeting|lecture|class)|transcribe)\b/i],
  ["notes", /\b(notes?|summari[sz]e)\b/i],
  ["decks", /\b(pptx?|power ?point|deck|slides?|presentation)\b/i],
];

const MIN_HITS = 3; // a habit must repeat before MORGAN acts on it
const CAP = 200; // counts decay by halving so recent habits win

const inc = <K extends string>(o: Partial<Record<K, number>> | undefined, k: K) => {
  const out = { ...(o ?? {}) } as Partial<Record<K, number>>;
  out[k] = (out[k] ?? 0) + 1;
  return out;
};
function decay<K extends string>(o: Partial<Record<K, number>> | undefined) {
  if (!o) return o;
  const out = {} as Partial<Record<K, number>>;
  for (const k in o) out[k] = Math.floor((o[k] ?? 0) / 2);
  return out;
}

const MAX_LESSONS = 6;
const CORRECTION = /^(no+\b|nope|wrong|that'?s (wrong|not (it|what i)))|\b(i (said|meant|asked( about| for)?)|not what i (asked|meant|said)|you misunderstood|i was asking|you got it wrong|that'?s not right)\b/i;
const clip = (t: string, n: number) => { const c = t.replace(/\s+/g, " ").trim(); return c.length > n ? `${c.slice(0, n)}…` : c; };
/** A correction turned into a short lesson; null when the message isn't a correction. */
export function correctionLesson(text: string, prevUser?: string): string | null {
  const t = text.trim();
  if (!prevUser || t.length < 4 || t.length > 300 || !CORRECTION.test(t)) return null;
  return `When the user said "${clip(prevUser, 80)}", you misread it — they clarified: "${clip(t, 120)}"`;
}

export type Signals = { prevUser?: string | undefined; text: string; hasFiles?: boolean; companion?: boolean; direct?: boolean; study?: boolean; hour?: number };

export function learn(p: LearnedProfile | null | undefined, s: Signals): LearnedProfile {
  let out: LearnedProfile = { ...(p ?? {}), n: (p?.n ?? 0) + 1 };
  for (const [k, re] of STYLE) if (re.test(s.text)) out.style = inc(out.style, k);
  for (const [k, re] of TOOLS) if (re.test(s.text)) out.tools = inc(out.tools, k);
  if (s.hasFiles) out.tools = inc(out.tools, "files");
  const hour = typeof s.hour === "number" && s.hour >= 0 && s.hour < 24 ? Math.floor(s.hour) : null;
  if (hour !== null) {
    const bucket = Math.floor(hour / 6);
    const modes = { ...(out.modes ?? {}) };
    for (const [k, on] of [["companion", s.companion], ["direct", s.direct], ["study", s.study]] as const) {
      if (!on) continue;
      const arr = [...(modes[k] ?? [0, 0, 0, 0])];
      arr[bucket] = (arr[bucket] ?? 0) + 1;
      modes[k] = arr;
    }
    out.modes = modes;
  }
  const lesson = correctionLesson(s.text, s.prevUser);
  if (lesson) out.lessons = [...(out.lessons ?? []).filter((l) => l !== lesson), lesson].slice(-MAX_LESSONS);
  if ((out.n ?? 0) >= CAP) {
    out = { lessons: out.lessons, n: Math.floor(CAP / 2), style: decay(out.style), tools: decay(out.tools), modes: out.modes && Object.fromEntries(Object.entries(out.modes).map(([k, v]) => [k, (v ?? []).map((x) => Math.floor(x / 2))])) };
  }
  return out;
}

const STYLE_HINT: Record<StyleKey, string> = {
  short: "prefers short, sharp answers — lead with the answer, trim filler",
  long: "often asks for more depth — give fuller explanations when the topic is substantial",
  table: "likes tables for comparisons and structured data",
  bullets: "likes bullet points over long paragraphs",
  hinglish: "often writes in Hinglish — mirror it naturally when they do",
  steps: "likes clear step-by-step instructions",
  code: "asks a lot of coding questions — be precise and give working code",
};
const TOOL_HINT: Record<ToolKey, string> = {
  music: "music", search: "live web search", timer: "timers/reminders", capture: "lecture/meeting capture", files: "file analysis", notes: "notes and summaries", decks: "presentations",
};
const PART = ["night", "morning", "afternoon", "evening"];

/** Short prompt hint built from repeated habits only; empty when nothing is learned yet. */
export function learnedPrompt(p: LearnedProfile | null | undefined, hour?: number): string {
  if (!p) return "";
  const lines: string[] = [];
  const style = Object.entries(p.style ?? {}) as Array<[StyleKey, number]>;
  // Opposing styles: only the dominant one counts.
  const sh = p.style?.short ?? 0, lo = p.style?.long ?? 0;
  for (const [k, v] of style.sort((a, b) => b[1] - a[1])) {
    if (v < MIN_HITS) continue;
    if (k === "short" && lo >= sh) continue;
    if (k === "long" && sh > lo) continue;
    lines.push(STYLE_HINT[k]);
  }
  const tools = (Object.entries(p.tools ?? {}) as Array<[ToolKey, number]>).filter(([, v]) => v >= MIN_HITS).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (tools.length) lines.push(`uses ${tools.map(([k]) => TOOL_HINT[k]).join(", ")} most — act on those requests instantly without asking`);
  if (typeof hour === "number") {
    const b = Math.floor(hour / 6);
    const c = p.modes?.companion?.[b] ?? 0;
    if (c >= MIN_HITS) lines.push(`often wants emotional support around ${PART[b]} — be extra warm right now`);
  }
  const lessons = (p.lessons ?? []).slice(-MAX_LESSONS);
  const lessonText = lessons.length ? `\n\nPast mistakes to avoid (learned from the user's corrections; don't repeat them, never mention this list):\n${lessons.map((l) => `- ${l}`).join("\n")}` : "";
  if (!lines.length) return lessonText;
  return lessonText + `\n\nLearned about this user from past chats (apply quietly, never mention it; explicit requests in this message always win):\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/** Plain-language summary for the owner's view. */
export function describeProfile(p: LearnedProfile | null | undefined): string[] {
  const h = learnedPrompt(p, undefined);
  const lines = h ? h.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) : [];
  for (const k of ["companion", "direct", "study"] as const) {
    const arr = p?.modes?.[k];
    if (!arr) continue;
    const top = arr.indexOf(Math.max(...arr));
    if ((arr[top] ?? 0) >= MIN_HITS) lines.push(`uses ${k} mode most in the ${PART[top]}`);
  }
  return lines;
}
