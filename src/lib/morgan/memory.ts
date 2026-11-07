// Explicit-memory helpers. Only things the user explicitly asks to remember are saved.

export type MemoryKind = "profile" | "fact" | "project";
export type Memory = { id: string; kind: string; content: string };
export type MemoryCategory = "identity" | "preference" | "communication" | "goal" | "project" | "decision" | "context" | "explicit" | "experience" | "fact";
export const MEMORY_CATEGORIES: MemoryCategory[] = ["identity", "preference", "communication", "goal", "project", "decision", "context", "explicit", "experience", "fact"];

export function categoryFor(content: string): MemoryCategory {
  if (/\b(reply|respond|answers?|short|brief|detailed|tone|casual|formal|call me)\b/i.test(content)) return "communication";
  if (/\b(decided|decision|chosen|chose)\b/i.test(content)) return "decision";
  if (/\b(goal|want to|plan to|aim)\b/i.test(content)) return "goal";
  if (/\b(project|building|repo|deadline|architecture|framework|we use)\b/i.test(content)) return "project";
  if (/\b(prefer|like|love|hate|favorite)\b/i.test(content)) return "preference";
  if (/\b(my name|name is|i live|lives in|i work|works at|i study|studies|moved to)\b/i.test(content)) return "identity";
  return "explicit";
}

export function communicationMemory(m: Memory & { category?: string | null }): boolean {
  return m.category === "communication" || m.kind === "profile" && /\b(reply|respond|answers?|tone|call me|be (?:brief|concise)|keep .{0,20} short)\b/i.test(m.content);
}

const REMEMBER = /^\s*(?:hey\s+morgan[,!]?\s*)?(?:please\s+)?(?:remember|memori[sz]e|save (?:this |it )?to memory|note down|keep in mind)(?:\s+that)?[:,]?\s+(.{3,500})$/i;

/** True when the text looks like a secret that must never be stored in memory. */
export function looksSensitive(text: string): boolean {
  return (
    /\b(password|passcode|passwd|pin code|otp|cvv|secret key|api[ _-]?key|private key|access token|bearer)\b/i.test(text) ||
    /\b(sk|pk|rk|ghp|gsk|xox[bp])[-_][A-Za-z0-9_-]{12,}/.test(text) ||
    /\bAIza[0-9A-Za-z_-]{20,}/.test(text) ||
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(text) ||
    /\b(?:\d[ -]?){13,19}\b/.test(text) // card-like numbers
  );
}

/** Returns the content to save if the message is an explicit remember request. */
export function extractRememberRequest(text: string): { content: string; kind: MemoryKind; sensitive?: boolean } | null {
  const m = text.trim().match(REMEMBER);
  if (!m) return null;
  const content = (m[1] ?? "").trim().replace(/[.!]+$/, "");
  if (content.length < 3) return null;
  return { content, kind: classifyMemory(content), ...(looksSensitive(content) ? { sensitive: true } : {}) };
}

export function classifyMemory(content: string): MemoryKind {
  if (/\b(my name|call me|i prefer|i like|i am|i'm|my (goal|style)|respond|reply|answer)\b/i.test(content)) return "profile";
  if (/\b(project|repo|stack|deadline|we use|architecture|api|database|framework)\b/i.test(content)) return "project";
  return "fact";
}

const STOP = new Set("the a an and or of to in on for is are was were be my me i you it that this with at by as from".split(" "));
export function tokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function similarity(a: string, b: string) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

/** Find an existing memory that the new content should update instead of duplicating. */
export function findDuplicate(memories: Memory[], content: string): Memory | undefined {
  return memories.find((m) => similarity(m.content, content) >= 0.75);
}

export type RankedMemory = Memory & { pinned?: boolean; importance?: number; updated_at?: string; project?: string | null; category?: string | null };

/** Only communication preferences always apply; pins boost relevant facts, not unrelated ones. */
export function selectRelevant<T extends RankedMemory>(memories: T[], query: string, limit = 8, now = Date.now()): T[] {
  const cap = Math.max(0, Math.min(8, limit));
  const always = memories.filter(communicationMemory).slice(0, Math.min(3, cap));
  const q = tokens(query);
  const scored = memories
    .filter((m) => !always.includes(m))
    .map((m) => {
      let hits = 0;
      for (const w of tokens(m.content + " " + (m.project ?? ""))) if (q.has(w)) hits++;
      // Recall synonyms without letting a generic personal pronoun retrieve all private facts.
      if (/\b(where (?:do|did) i live|my (?:city|location)|where am i based)\b/i.test(query) && /\b(live|lives|living|moved|based|city)\b/i.test(m.content)) hits += 2;
      if (/\b(my name|who am i)\b/i.test(query) && /\b(name|call me)\b/i.test(m.content)) hits += 2;
      if (/\b(my goals?|what am i aiming)\b/i.test(query) && m.category === "goal") hits += 2;
      if (/\b(my projects?|what am i building)\b/i.test(query) && (m.category === "project" || m.kind === "project")) hits += 2;
      const ageDays = m.updated_at ? (now - new Date(m.updated_at).getTime()) / 86_400_000 : 30;
      const fade = ["identity", "preference", "communication", "explicit"].includes(m.category ?? "") || !m.updated_at ? 1 : ageDays <= 45 ? 1 : Math.max(0.3, 1 - (ageDays - 45) / 90);
      const s = hits ? (hits + (m.pinned ? 2 : 0) + (m.importance ?? 2) * 0.3 + Math.max(0, 1 - ageDays / 90)) * fade : 0;
      return { m, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.max(0, cap - always.length))
    .map((x) => x.m);
  return [...always, ...scored];
}
