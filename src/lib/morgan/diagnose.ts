// Self-diagnosis: explains how the previous reply was produced, from its recorded timing data.
// Browser-safe, no AI call. Never names providers or reveals prompts/keys.
export type Diag = {
  latencyMs?: number;
  firstTokenMs?: number | null;
  totalMs?: number;
  researched?: boolean;
  memoriesUsed?: string[];
  diag?: { route?: string; prepMs?: number; memoryMs?: number; searchMs?: number | null; enginesTried?: number; enginesFailed?: number };
};

const ASK =
  /\b(diagnos\w*|what went wrong|why (were|was|are|r) (you|u|it|morgan) (so )?(slow|wrong|late|dumb|lagging|confused)|why did (you|u) (say|answer|reply|take)|explain (your|the) (error|glitch|mistake|delay)|self[- ]?check|what happened (there|just now)|(any|internal) (glitch|error)s?)\b/i;

export function isDiagnoseRequest(text: string): boolean {
  const t = text.trim();
  return t.length <= 160 && ASK.test(t);
}

const s = (ms: number | null | undefined) => (ms == null ? "—" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

export function diagnoseReply(meta: Diag | null | undefined): string {
  if (!meta) return "Nothing to diagnose yet — I don't have timing data for a previous reply in this chat. Ask me something, then ask again.";
  const d = meta.diag ?? {};
  const lines: string[] = ["**Self-check on my last reply:**", ""];
  const route = d.route === "local" ? "instant built-in answer (no AI call)" : d.route === "companion" ? "Companion mode" : "full AI answer";
  lines.push(`- Path: ${route}`);
  lines.push(`- Getting ready (sign-in, history, memory): ${s(d.prepMs)}${d.memoryMs ? ` (memory lookup ${s(d.memoryMs)})` : ""}`);
  lines.push(`- Web search: ${d.searchMs == null ? "not used" : s(d.searchMs)}`);
  if (d.route !== "local") lines.push(`- First word after thinking started: ${s(meta.firstTokenMs)}; full answer: ${s(meta.totalMs)}`);
  if (d.enginesTried) lines.push(`- Engines tried: ${d.enginesTried}, failed or cut off: ${d.enginesFailed ?? 0}`);
  lines.push(`- Memories used: ${meta.memoriesUsed?.length ?? 0}`);
  const causes: string[] = [];
  if ((d.searchMs ?? 0) > 2500) causes.push("the web search was slow");
  if ((d.prepMs ?? 0) > 2000) causes.push("setup before answering took long (usually network)");
  if ((meta.firstTokenMs ?? 0) > 4000) causes.push("the AI engines were busy and slow to start");
  if ((d.enginesFailed ?? 0) > 0 && d.enginesFailed === d.enginesTried) causes.push("every engine failed, so I couldn't answer");
  else if ((d.enginesFailed ?? 0) > 0) causes.push("some engines failed and a backup answered");
  lines.push("", causes.length ? `**Likely cause:** ${causes.join("; ")}.` : "**Verdict:** nothing abnormal — timings look healthy.");
  lines.push("", "If the answer itself was wrong, tell me what you meant and I'll correct it.");
  return lines.join("\n");
}
