/** Lightweight media-command detection. Runs before the AI; pure, so it is unit tested. */
export type MediaIntent =
  | { kind: "play"; query: string }
  | { kind: "queue"; query: string }
  | { kind: "nowplaying" }
  | { kind: "control"; action: "pause" | "resume" | "stop" | "next" | "previous" | "mute" | "unmute" | "volup" | "voldown" | "fullscreen" | "exitfullscreen" | "repeat" | "shuffle" | "clear" };

const CONTROLS: Array<[RegExp, Extract<MediaIntent, { kind: "control" }>["action"]]> = [
  [/^(pause|hold)( (it|the )?(music|song|video|playback))?$/, "pause"],
  [/^(resume|continue|unpause|play( it)? again|keep playing)( (the )?(music|song|video))?$/, "resume"],
  [/^(stop|stop (the )?(music|song|video|playback)|turn off (the )?music)$/, "stop"],
  [/^(next|skip)( (song|track|video|one))?$|^(play )?(the )?next (song|track|video|one)$/, "next"],
  [/^(previous|prev|back|go back)( (song|track|video|one))?$|^(play )?(the )?(previous|last) (song|track|video|one)$/, "previous"],
  [/^mute( (it|the )?(music|video|sound))?$/, "mute"],
  [/^unmute( (it|the )?(music|video|sound))?$/, "unmute"],
  [/^(volume up|louder|turn (it )?up|increase (the )?volume)$/, "volup"],
  [/^(volume down|quieter|softer|turn (it )?down|decrease (the )?volume|lower (the )?volume)$/, "voldown"],
  [/^(enter |go )?full ?screen( mode)?$/, "fullscreen"],
  [/^(exit|leave|close) full ?screen( mode)?$/, "exitfullscreen"],
  [/^(repeat|loop)( (this|the)? ?(song|video|track|one)?)?$/, "repeat"],
  [/^shuffle( (the )?(queue|songs|music))?$/, "shuffle"],
  [/^clear (the )?(queue|playlist)$/, "clear"],
];

const GENERIC = /^(a |the |some |any |good |nice |random |my )*(song|songs|music|track|tracks|tune|tunes|something|anything|video|playlist)( (please|now|bro))?$/;
const DEFAULT_QUERY = "top hits music mix";

/** Vibe words mapped to search queries: "play something chill", "coding music". */
const MOODS: Array<[RegExp, string]> = [
  [/\b(coding|code|programming|focus|focus-heavy|concentrat\w*|deep work)\b/, "dark focus coding music mix"],
  [/\bstudy(ing)?\b/, "lofi study beats mix"],
  [/\blo-?fi\b/, "lofi hip hop chill beats"],
  [/\bsynth ?wave|retrowave|cyberpunk\b/, "synthwave retrowave mix"],
  [/\b(workout|gym|pump|hype|energetic)\b/, "workout hype music mix"],
  [/\b(sad|heartbreak|emotional)\b/, "sad songs playlist"],
  [/\b(sleep|sleepy|calm|relax(ing)?|chill)\b/, "chill relaxing music mix"],
  [/\b(party|dance)\b/, "party dance hits mix"],
  [/\b(romantic|love songs)\b/, "romantic love songs mix"],
];
export function moodQuery(q: string): string | null {
  if (!/\b(music|songs?|something|vibes?|beats|mix|playlist|tracks?)\b/.test(q) && q.split(" ").length > 2) return null;
  for (const [re, query] of MOODS) if (re.test(q)) return query;
  return null;
}

/** AI action bridge: the model may emit [[PLAY: query]] and the client plays it for real. */
export function extractPlayTag(text: string): { query: string | null; clean: string } {
  const m = text.match(/\[\[\s*PLAY\s*:\s*([^\]]{1,160}?)\s*\]\]/i);
  const clean = text.replace(/\[\[\s*PLAY\s*:[^\]]*\]\]\s*/gi, "").replace(/\[\[\s*PLAY[^\]]*$/i, "").trim();
  return { query: m?.[1]?.trim() || null, clean };
}

/** Only start the player when the user's latest message actually asks for audio/video. */
export function asksToPlay(userText: string, previousAssistant = ""): boolean {
  const t = normalizePlayVerb(userText.trim());
  if (/\b(don'?t|do not|never|without)\s+(?:play|start|put on|music)\b/i.test(t)) return false;
  const intent = parseMediaIntent(t);
  if (intent?.kind === "play" || intent?.kind === "queue") return true;
  if (/^(?:yes|yeah|yep|sure|ok(?:ay)?|do it|go ahead|please do)[.!\s]*$/i.test(t)) {
    // Consent only carries forward from an actual playback offer, not an unrelated task.
    return /\b(?:want (?:me to|to)|shall i|should i|can i|would you like (?:me )?to)\s+(?:play|put on|start playing|listen to)\b/i.test(previousAssistant);
  }
  if (/^(?:please |pls )?(?:play|put on|turn on|listen to) (?:it|that|this|that song|the song)[.!\s]*$/i.test(t)) return true;
  // The composer handles leading commands locally. Embedded commands still need
  // the AI to select a song, but must authorize its playback tag on completion.
  // Ignore quotations, reported speech and conditional instructions, not just
  // mentions of music or the word "play" in explanations.
  if (!/\b(?:if|unless|whenever|when|said|says|asked|wrote|quote|translate)\b/i.test(t)) {
    const unquoted = t.replace(/"[^"\n]*"|“[^”\n]*”|`[^`\n]*`|'[^'\n]+'/g, "");
    const clauses = unquoted.split(/[,;.!?]+|\b(?:and then|and|then)\s+/i);
    for (const clause of clauses.slice(1)) {
      // Require a command at the clause boundary; never salvage a random
      // mid-sentence verb such as "explain how to play this song".
      if (!/^\s*(?:(?:please|pls|plz)\s+|(?:can|could|would|will)\s+(?:you|u)\s+)?(?:play|put on|turn on|start playing|listen to|queue up)\s+/i.test(clause)) continue;
      const embedded = parseMediaIntent(clause);
      if (embedded?.kind === "play" || embedded?.kind === "queue") return true;
    }
  }
  return /\b(?:gaana|gana|gaane|song|music)\s+(?:chalao|chala do|bajao|baja do)\b|\b(?:chalao|bajao)\s+.+|(?:गाना|संगीत)\s*(?:चलाओ|बजाओ)|(?:चलाओ|बजाओ)\s+\S+/i.test(t);
}

/** Share typo normalization between the local shortcut and AI playback guard. */
function normalizePlayVerb(text: string): string {
  return text.replace(/\b(pla y|p lay|ply|plya|paly|plau|oplay|olay|plsy|plat|playy|pllay|plaay|lpay|pkay)\b/gi, "play");
}

/** Words that refer to "the thing we were just talking about", never a literal search. */
const PRONOUN = /^(it|that|this|that one|this one|the song|that song|this song|the track|the video|that video|it again|that again|that song again|the same song|same song|same one)$/;

/** Detects when an AI reply *says* it is playing something, so the player starts even without a tag. */
export function sniffPlayingProse(text: string): string | null {
  const t = text.replace(/\[\[[^\]]*\]\]/g, "").replace(/[*_`"“”]/g, "").trim();
  const pats = [
    /\b(?:playing|putting on|queuing up|queued up|starting|spinning|cueing up|firing up|blasting|loading up)\s+(.{2,80}?)\s+(?:now|for you|right now|in the player|on the player)\b/i,
    /^(?:now\s+)?(?:playing|putting on|starting|spinning|queuing up|cueing up|firing up|loading up)\s*:?\s+(.{2,80}?)(?:[.!—–-]|$)/i,
    /^(.{2,80}?)\s+is (?:now )?(?:playing|queued|on|starting|loading)\b/i,
  ];
  for (const re of pats) {
    const m = t.match(re);
    const q = m?.[1]?.replace(/^(?:the song |the track |some )/i, "").trim();
    if (q && !/^(it|that|this|music|something|the music|the song|the track|your song)$/i.test(q) && q.split(" ").length <= 12) return q;
  }
  return null;
}

/** Find the most recent song a user or MORGAN mentioned, for "play that song" with no player history. */
export function songFromHistory(texts: string[]): string | null {
  for (let i = texts.length - 1; i >= 0; i--) {
    const raw = texts[i] ?? "";
    const tag = extractPlayTag(raw).query;
    if (tag) return tag;
    const said = sniffPlayingProse(raw);
    if (said) return said;
    const asked = parseMediaIntent(raw, false, null);
    if (asked?.kind === "play" && asked.query !== DEFAULT_QUERY) return asked.query;
  }
  return null;
}

export function parseMediaIntent(raw: string, playerActive = false, lastQuery: string | null = null): MediaIntent | null {
  let t = raw.toLowerCase().replace(/[.!?,]+$/g, "").replace(/[!?,]+/g, " ").replace(/\s+/g, " ").trim();
  // Typo-tolerant verbs incl. neighbouring-key slips: "oplay", "olay", "plsy", "playy", "pla y".
  t = normalizePlayVerb(t);
  // Frustration / slang / filler never blocks a command.
  t = t.replace(/\b(bitch|fuck(ing|in)?|f\*+k|damn|dammit|wtf|bruh|bro|dude|man|yaar|cmon|c'mon|come on|ffs|omg|ugh|bhai|stupid|idiot)\b/g, " ").replace(/\s+/g, " ").trim();
  // "why r u not playing X" / "why didn't you play X" / "u remember that song play that".
  t = t.replace(/^(what do (u|you) mean )?(why|y) (r|are|aren't|arent|r'nt) (u|you|ya) not (playing|play) /, "play ")
    .replace(/^(why|y) (didn't|didnt|did not|don't|dont|won't|wont) (u|you|ya) play /, "play ")
    .replace(/^(do )?(u|you) (remember|remmeber|remember) (that|the|this) (song|track|one)( (i|we) (said|asked|mentioned|played))?( and)? play (it|that|that one)$/, "play that song")
    .replace(/^(u|you) (didn't|didnt|did not|dont|don't) play (it|that|the song)$/, "play it");

  t = t.replace(/^(hey |ok |okay |yo )?morgan[, ]+/, "")
    .replace(/^((please|pls|plz|just|now|bro|yo|go ahead and|ok|okay|so) |(can|could|would|will) (you|u|ya) |(i want|i wanna|i need) (you|u) to |i said )+/, "")
    .replace(/ (please|pls|plz|now|for me|bro|already|right now)$/, "").trim();
  if (!t || t.length > 160) return null;
  if (/^(what('?s| is) (this|the) (song|track|music)|what song is (this|playing)|which song is this|now playing)$/.test(t)) return playerActive ? { kind: "nowplaying" } : null;
  const qd = t.match(/^(?:queue( up)?|add) (.+?)(?: to (?:the )?(?:queue|playlist))?$/) ;
  if (qd?.[2] && (qd[1] || / to (the )?(queue|playlist)$/.test(t))) { const q = clean(qd[2]); return { kind: "queue", query: moodQuery(q) ?? q }; }
  const nx = t.match(/^play (.+) next$/);
  if (nx?.[1] && playerActive && !/^(the )?(song|track|video|one)$/.test(nx[1])) return { kind: "queue", query: moodQuery(clean(nx[1])) ?? clean(nx[1]) };
  if (/^(start|begin) (playing|the music|music)$/.test(t) && !playerActive) return { kind: "play", query: DEFAULT_QUERY };
  for (const [re, action] of CONTROLS) if (re.test(t)) {
    // Bare "pause"/"next" etc. only make sense when something is (or was) playing.
    if (!playerActive && !/music|song|video|track|playback|queue/.test(t)) return null;
    return { kind: "control", action };
  }
  if (/^(start playing|play something|play music|launch (the )?(music|player|song))$/.test(t)) return { kind: "play", query: DEFAULT_QUERY };
  const yt = t.match(/^(?:search|find|look up) (?:on )?youtube (?:for )?(.+)$/) ?? t.match(/^(?:search|find) (.+) on youtube$/);
  if (yt?.[1]) return { kind: "play", query: clean(yt[1]) };
  const vid = t.match(/^(?:play|show|put on|open|launch) (?:me )?(?:a |the )?(?:youtube )?video (?:about|of|on|for) (.+)$/);
  if (vid?.[1]) return { kind: "play", query: clean(vid[1]) };
  const song = t.match(/^(?:turn on|put on|on|play|start|start playing|launch|open|spin|stream|blast) (?:me )?(?:the |a |that )?(?:song|track|music|tune) (?:called |named |by )?(.+)$/);
  if (song?.[1]) return { kind: "play", query: clean(song[1]) || DEFAULT_QUERY };
  const p = t.match(/^(?:play|put on|turn on|start playing|launch|spin|stream|blast|queue up|i (?:want|wanna|would like) (?:to )?(?:hear|listen to)|let me hear|let's hear|listen to|i'd like to hear) (.+)$/);
  if (p?.[1]) {
    const q = clean(p[1]);
    // "play it" / "play that" refers to context: resume the player, or replay the last request.
    if (PRONOUN.test(q)) {
      if (playerActive) return { kind: "control", action: "resume" };
      if (lastQuery) return { kind: "play", query: lastQuery };
      if (/^(it|that|this)\b/.test(q)) return null;
    }
    // "play a game", "play chess" etc. are not media requests.
    if (/^(a |the )?(game|games|chess|role|roleplay|along|around|with me|dead|it cool|fair)\b/.test(q)) return null;
    if (!q || GENERIC.test(q)) return { kind: "play", query: DEFAULT_QUERY };
    const mood = moodQuery(q);
    if (mood) return { kind: "play", query: mood };
    return { kind: "play", query: q };
  }
  const vibe = t.match(/^(?:i want|i wanna|i need|give me|some) (.+)$/)?.[1] ?? (t.split(" ").length <= 3 ? t : null);
  if (vibe && /\b(music|songs|beats|vibes|playlist)\b/.test(vibe)) { const mood = moodQuery(vibe); if (mood) return { kind: "play", query: mood }; }
  if (/^(i want|i wanna|i need) (some |a )?(music|song|songs)$/.test(t)) return { kind: "play", query: DEFAULT_QUERY };
  return null;
}

function clean(q: string) {
  return q.replace(/ (on|from|in) youtube$/, "").replace(/^(me |some )/, "").replace(/ for me$/, "").trim();
}
