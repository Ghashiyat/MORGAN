// Web image search: "show me a picture of X" → real photos from Tavily (no AI call).

const VERB = /\b(show|find|get|give|send|search|display|fetch|need|want|generate|create|draw|make|produce|render)\b/gi;
const NOUN = /\b(images?|imgs?|imaghes?|pics?|pictures?|photos?|photographs?|wallpapers?)\b/i;
const NEGATE = /\b(remove background|upscale|how do|how does|what is|why)\b/i;

function clean(t: string): string {
  return t
    .replace(/[?.!]+$/g, "")
    .replace(/\b(images?|imgs?|pics?|pictures?|photos?)\s+(ok|od|if|o)\b/gi, "$1 of")
    .replace(/\b(can|could|would)\s+you\b|\bplease\b|\bjust\b|\bme\b|\bsome\b|\bfew\b|\bmore\b|\banother\b|\bnow\b|\ba\b|\ban\b|\bthe\b/gi, " ")
    .replace(VERB, " ")
    .replace(/\b(images?|imgs?|imaghes?|pics?|pictures?|photos?|photographs?|wallpapers?)\b/gi, " ")
    .replace(/^\s*(of|for|about)\b/i, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(of|for|about)\s+/i, "");
}

const N = String.raw`(?:images?|imgs?|imaghes?|pics?|pictures?|photos?|photographs?|wallpapers?)`;
const LEAD = String.raw`^(?:(?:hey|yo|ok|okay|morgan)[,\s]+)?(?:(?:please|pls|just)\s+)*(?:(?:can|could|would|will)\s+(?:you\s+)?)?(?:(?:please|pls|just)\s+)*`;
const DET = String.raw`(?:(?:some|a\s+few|a|an|the|more|another|\d+)\s+)?(?:[\w-]+\s+)?`;
const REQ = [
  new RegExp(String.raw`${LEAD}(?:show|find|get|give|send|display|fetch|generate|create|draw|make|search(?:\s+for)?)\s+(?:me\s+|us\s+)?${DET}${N}\b`, "i"),
  new RegExp(String.raw`${LEAD}(?:i\s+)?(?:want|need)\s+${DET}${N}\s+(?:of|for|about)\b`, "i"),
  new RegExp(String.raw`${LEAD}${N}\s+(?:of|for|about)\b`, "i"),
];
const PERSONAL = new RegExp(String.raw`\b(?:my|our|your|his|her|their)\s+(?:[\w-]+\s+)?${N}\b`, "i");
const DECK = /\b(presentation|slides?|deck|ppt|pptx|pdf|powerpoint)\b/i;
const QUESTION = /^\s*(how|what|why|where|when|who|which|is|are|do|does|did|can i|should)\b/i;
const FOLLOW_TASK = /^\s*(?:please\s+)?(tell|explain|describe|write|translate|summari[sz]e|give me (?:info|facts|details)|talk|teach|compare|list|define|help|let'?s|say|read|play|calculate|solve|make (?:a|an) (?:poem|story|song|list))\b/i;
const ACK = /^(stop|no|nope|ok|okay|thanks?|thank you|nice|cool|wow|lol|great)\b/i;

function isRequest(t: string): boolean {
  return t.length <= 200 && !NEGATE.test(t) && !DECK.test(t) && !PERSONAL.test(t) && REQ.some((r) => r.test(t));
}

/** Returns the subject to search for, or null when this isn't an image-search request.
 *  `prevUserText` lets short follow-ups ("cat behind a cafe") continue an image flow. */
export function parseImageSearch(text: string, prevUserText?: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (isRequest(t)) {
    const s = clean(t);
    return s.length >= 2 ? s.slice(0, 120) : null;
  }
  // Follow-up refinement: previous user turn was a real image request; this one is a short description.
  if (prevUserText && isRequest(prevUserText.trim()) && t.length <= 80 && !/\?/.test(t) && !QUESTION.test(t) && !FOLLOW_TASK.test(t) && !/\b(it|its|that|this|them|they|those|these)\b/i.test(t) && !ACK.test(t) && !DECK.test(t) && !NEGATE.test(t) && !PERSONAL.test(t)) {
    const s = clean(t);
    return s.length >= 2 ? s.slice(0, 120) : null;
  }
  return null;
}

export async function tavilyImages(apiKey: string | undefined, subject: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  if (!apiKey) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${subject} photo`, search_depth: "basic", include_images: true, max_results: 3 }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { images?: Array<string | { url?: string }> };
    return (json.images ?? [])
      .map((i) => (typeof i === "string" ? i : i.url ?? ""))
      .filter((u) => /^https:\/\//.test(u))
      .slice(0, 6);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
