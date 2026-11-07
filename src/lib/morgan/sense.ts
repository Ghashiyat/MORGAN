// Browser-safe helpers: translation intent + emotion from words (no AI call, no latency).

export const LANGS: Record<string, string> = {
  english: "en-US", hindi: "hi-IN", urdu: "ur-PK", bengali: "bn-IN", bangla: "bn-IN", tamil: "ta-IN", telugu: "te-IN",
  marathi: "mr-IN", gujarati: "gu-IN", punjabi: "pa-IN", kannada: "kn-IN", malayalam: "ml-IN", arabic: "ar-SA",
  spanish: "es-ES", french: "fr-FR", german: "de-DE", italian: "it-IT", portuguese: "pt-BR", russian: "ru-RU",
  japanese: "ja-JP", korean: "ko-KR", chinese: "zh-CN", mandarin: "zh-CN", turkish: "tr-TR", indonesian: "id-ID", dutch: "nl-NL",
};

/** "translate X to hindi", "say X in french", "how do you say X in japanese" → target language. */
export function parseTranslate(text: string): { lang: string; code: string } | null {
  const t = text.toLowerCase();
  if (!/\b(translate|translation|how (do|would) (you|i) say|say .+ in|in \w+ please)\b/.test(t)) return null;
  const hits = [...t.matchAll(/\b(?:to|into|in)\s+([a-z]+)\b/g)].map((x) => x[1]!).filter((l) => LANGS[l]);
  const lang = hits[hits.length - 1];
  if (!lang || !LANGS[lang]) return null;
  return { lang, code: LANGS[lang]! };
}

export type Mood = "sad" | "stressed" | "angry" | "happy";
const MOODS: [Mood, RegExp][] = [
  ["sad", /\b(sad|cry(ing)?|lonely|alone|hurt|heartbroken|broke up|miss (her|him|them)|depressed|down|upset|lost)\b/i],
  ["stressed", /\b(stress(ed)?|anxious|anxiety|worried|panic|scared|nervous|overwhelmed|tired|exhausted|exam)\b/i],
  ["angry", /\b(angry|mad|furious|hate|annoyed|pissed|frustrated|irritated)\b/i],
  ["happy", /\b(happy|excited|great news|yay|awesome|amazing|love it|thrilled|i passed|i got (the|a) job)\b/i],
];
export function detectMood(text: string): Mood | null {
  for (const [mood, re] of MOODS) if (re.test(text)) return mood;
  return null;
}

/** One-line steer appended to the companion prompt for the detected mood. */
export function moodHint(mood: Mood) {
  const how = { sad: "They sound sad: be gentle and close, validate first, no jokes.", stressed: "They sound stressed: be calm and steady, slow things down, offer one small next step.", angry: "They sound angry: stay calm, don't argue, acknowledge why it hurts.", happy: "They sound happy: share the joy warmly and celebrate with them." }[mood];
  return `\n\nDetected mood from the user's words: ${mood}. ${how}`;
}
