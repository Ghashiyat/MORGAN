// Tavily web research — a separate service, never part of the AI provider race.

export type SearchDecision = { search: boolean; depth: "basic" | "advanced"; topic: "general" | "news"; reason: string };

const OPT_OUT = /\b(don'?t|do not|no|without)\s+(web\s*)?(search|google|internet|browsing|looking it up)\b|\boffline only\b/i;
const EXPLICIT = /\b(search|google|look\s*up|browse|find (me )?(online|on the (web|internet))|on the (web|internet)|online)\b/i;
const NEWS = /\b(news|headlines?|breaking|today'?s|this (week|month)|latest|recent(ly)?|right now|currently|as of|update[sd]?|release[sd]?|announce(d|ment)?)\b/i;
const SHOPPING = /\b(price[sd]?|cost|cheap(est)?|affordable|deals?|offers?|discount|buy|shopping|best .{0,40}\bunder\b|under\s*(₹|rs\.?|\$|€|£)\s*\d|in stock|availability)\b/i;
const COMPARE = /\b(compare|comparison|vs\.?|versus|best|top \d+|recommend(ation)?s?|alternatives?)\b/i;
const RESOURCES = /\b(free apis?|apis? (for|i can use)|websites?|resources|hosting providers?|providers?|documentation|docs for|changelog|version)\b/i;
const CURRENT_FACTS = /\b(weather|stock|score|exchange rate|who (is|won)|episodes?|season \d+|air ?dates?|release dates?|premiere|box office|when (is|does|will|did)|schedule|ceo of|election|20(2[5-9]|3\d))\b/i;

/** Decide whether a message genuinely needs live online information. */
const SMALL_TALK = /^\s*(hi|hello|hey|yo|thanks|thank you|ok(ay)?|cool|nice|good (morning|night|evening)|how are you|who are you|what can you do|tell me a joke)\b[\s\S]{0,40}$/i;
const STABLE = /^\s*(what is|what's|define|explain|how (do|does|to)|why (do|does|is)|write|translate|summari[sz]e|solve|calculate)\b(?![\s\S]*\b(today|now|latest|current|this (week|month|year)|20\d\d|price|score|weather|news)\b)/i;

export const LYRICS = /\b(lyrics?|lyric[sz]|song words|chords?|full song)\b/i;
/** Command-only follow-ups ("search it", "it's wrong search and give") carry no topic of their own. */
const TOPIC_WORDS = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) =>
    w.length > 2 && !/^(search|google|look|find|give|just|wrong|again|proper|properly|full|bro|you|are|the|and|it'?s|its|this|that|why|don'?t|dont|not|yourself|generate|some|website|said|giving|one|repeating|want|main|core|please|pls|online|web|internet|me|now)$/.test(w),
  );

/** Use earlier user turns when the latest message is a command with no real subject. */
export function resolveSearchQuery(text: string, previousUserTexts: string[]): string {
  const t = text.trim();
  // Resolve context only for command-only retries; a named subject wins even if it is one word.
  const subject = t.toLowerCase().replace(/\b(?:look\s*(?:it\s*)?up|it's|it is)\b/g, " ").replace(/[?!.:,]/g, " ");
  const shortSubject = subject.match(/^\s*(?:please\s+)?(?:search|google|find)?\s*(?:for\s+)?([\p{L}\p{N}]{1,2})\s*$/u)?.[1];
  if (shortSubject && !/^(it|me|up)$/i.test(shortSubject)) return t;
  const topic = TOPIC_WORDS(subject).filter((w) => !/^(up|searching|check|tell|about|correct|please|can|could|would|will|then|yes|more|lyrics|lyric|song|words)$/.test(w));
  if (topic.length || !/\b(search|google|look\s*(?:it\s*)?up|find|wrong|again|lyrics|full|repeat)\b/i.test(t)) return t;
  const prior = [...previousUserTexts].reverse().find((p) => TOPIC_WORDS(p).length >= 2);
  return prior ? `${prior.trim()}`.slice(0, 300) : t;
}

export function decideSearch(text: string, toggleOn: boolean): SearchDecision {
  const t = text.trim();
  const no = { search: false, depth: "basic" as const, topic: "general" as const };
  if (!t || t.length < 4) return { ...no, reason: "too_short" };
  if (OPT_OUT.test(t)) return { ...no, reason: "user_opt_out" };
  if (LYRICS.test(t)) return { search: true, depth: "basic", topic: "general", reason: "lyrics" };
  // Sharing personal news is social communication, not a request for world headlines.
  if (!EXPLICIT.test(t) && /\b(i (?:passed|failed|got|won)|we won|just (?:wanted to )?share|my (?:exam|application|interview)|need to vent|no advice)\b/i.test(t) && !/\b(latest|headlines?|weather|price|score|fact.?check|verify)\b/i.test(t)) return { ...no, reason: "personal_news" };
  // Questions about the user themselves are answered from memory, never the web.
  if (!EXPLICIT.test(t) && /\b(?:where do i (?:live|stay|work)|what(?:'s| is| are) my|do you (?:know|remember)|about me|remember(?:ing)? about my|my (?:app|project|name|city|goals?))\b/i.test(t)) return { ...no, reason: "personal" };
  // Small talk and stable how-to/definition questions never need the web.
  if (!EXPLICIT.test(t) && SMALL_TALK.test(t)) return { ...no, reason: "small_talk" };
  // Casual check-ins ("how are you holding up today?") are chat, not news.
  if (!EXPLICIT.test(t) && /\b(how (are|r) (you|u)|how'?s it going|how (have|ve) you been|holding up|your day|feeling)\b/i.test(t) && !/\b(news|price|score|weather|stock|match)\b/i.test(t)) return { ...no, reason: "small_talk" };
  if (!EXPLICIT.test(t) && STABLE.test(t) && !NEWS.test(t) && !SHOPPING.test(t)) return { ...no, reason: "stable_knowledge" };
  const news = NEWS.test(t);
  const shopping = SHOPPING.test(t);
  const compare = COMPARE.test(t);
  const explicit = EXPLICIT.test(t);
  const resources = RESOURCES.test(t);
  const facts = CURRENT_FACTS.test(t);
  const topic = news && !shopping ? ("news" as const) : ("general" as const);
  const depth = compare || (shopping && compare) || t.length > 160 ? ("advanced" as const) : ("basic" as const);
  if (explicit) return { search: true, depth, topic, reason: "explicit" };
  if (shopping) return { search: true, depth: compare ? "advanced" : "basic", topic: "general", reason: "shopping" };
  if (news) return { search: true, depth, topic, reason: "current" };
  if (compare && (resources || toggleOn)) return { search: true, depth: "advanced", topic: "general", reason: "comparison" };
  if (resources && (toggleOn || /\bfind|list|suggest\b/i.test(t))) return { search: true, depth, topic, reason: "resources" };
  if (facts) return { search: true, depth: "basic", topic, reason: "current_fact" };
  // Live info needed even with Web off: real-time, trending, outages, "verify/fact-check this".
  if (/\b(live|real.?time|trending|viral|currently|nowadays|is .{1,40} (down|open|closed|alive|dead|still)|fact.?check|verify (this|that|if|whether)|is (this|that|it) (true|real|fake)|check (if|whether|the latest|online|on the (web|internet)))\b/i.test(t))
    return { search: true, depth: "basic", topic, reason: "live_info" };
  // Web toggle on: dig online for any real question.
  if (toggleOn && /\b(when|where|who|which|how (much|many|old)|dates?|released?|happen(ed|ing)?|status|is it true)\b/i.test(t)) return { search: true, depth, topic, reason: "toggle_on" };
  // Web toggle on: "check", "verify" or any real question (not tiny replies) goes online.
  if (toggleOn && (/\b(check|verify|confirm|fact.?check|look into|research)\b/i.test(t) || (/\?\s*$/.test(t) && t.split(/\s+/).length >= 4))) return { search: true, depth, topic, reason: "toggle_on" };
  return { ...no, reason: "not_needed" };
}

export function cacheKey(query: string, depth: string, topic: string) {
  return `${depth}:${topic}:${query.toLowerCase().replace(/\s+/g, " ").trim()}`.slice(0, 300);
}

/** Time-sensitive results expire fast. */
export function cacheTtlMs(topic: string) {
  return topic === "news" ? 10 * 60_000 : 3 * 60 * 60_000;
}

export type SearchResult = { title: string; url: string; content: string; published?: string };

export class SearchError extends Error {
  constructor(public kind: "missing_key" | "quota" | "rate_limit" | "failed" | "timeout") {
    super(kind);
  }
}

export async function tavilySearch(
  apiKey: string | undefined,
  query: string,
  d: Pick<SearchDecision, "depth" | "topic">,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResult[]> {
  if (!apiKey) throw new SearchError("missing_key");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.slice(0, 380),
        search_depth: d.depth,
        topic: d.topic,
        max_results: d.depth === "advanced" ? 8 : 5,
        include_answer: false,
      }),
    });
    // No retries at all: quota/limit errors must stop immediately.
    if (res.status === 432 || res.status === 433 || res.status === 402) throw new SearchError("quota");
    if (res.status === 429) throw new SearchError("rate_limit");
    if (!res.ok) throw new SearchError("failed");
    const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
    return (json.results ?? [])
      .filter((r) => r.url && /^https?:\/\//.test(r.url))
      .map((r) => ({
        title: (r.title ?? r.url!).slice(0, 200),
        url: r.url!,
        content: (r.content ?? "").slice(0, 1500),
        ...(r.published_date ? { published: r.published_date } : {}),
      }));
  } catch (e) {
    if (e instanceof SearchError) throw e;
    throw new SearchError(ctrl.signal.aborted ? "timeout" : "failed");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export function formatResearch(results: SearchResult[]) {
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}${r.published ? `\nPublished: ${r.published}` : ""}\n${r.content}`)
    .join("\n\n");
}
