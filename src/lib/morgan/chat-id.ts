// Browser-safe rule: answers "what is my chat id?" instantly with the current conversation's ID.
// Only fires when the user means *their* / *this* chat — not coding questions about session/thread IDs.
const KIND = String.raw`(?:chat|conversation|session|thread)`;
const OWN = new RegExp(String.raw`\b(?:my|this|our|current|the\s+current)\s+${KIND}\s*-?\s*id\b|\bid\s+(?:of|for)\s+(?:this|my|the\s+current|our)\s+${KIND}\b`, "i");
const ASK_ME = new RegExp(String.raw`^\s*(?:pls|please\s+)?(?:give|send|show|tell)\s+(?:me\s+)?(?:the\s+|my\s+)?(?:${KIND}|cat|caht|chta|chat)\s*-?\s*id\b`, "i");
const BARE = new RegExp(String.raw`^\s*(?:what'?s?\s+(?:is\s+)?)?(?:the\s+)?${KIND}\s*-?\s*id\s*\??\s*(?:pls|please)?\s*$`, "i");
const TECH = /\b(java|python|javascript|js|node|php|c\+\+|c#|code|cookies?|api|browser|server|program|function|linux|thread\s*pool|android|how\s+(?:do|to|does|can))\b/i;

export function chatIdReply(text: string, threadId: string): string | null {
  if (!text || text.length > 120 || TECH.test(text)) return null;
  // Questions *about* the ID ("does this chat id include…", "is this chat id safe?") get a real answer.
  if (!ASK_ME.test(text) && /^\s*(does|do|is|are|can|will|should|why|how|what\s+(does|do|can|is\s+(it|this)\s+for))\b/i.test(text) && !BARE.test(text)) return null;
  if (!OWN.test(text) && !ASK_ME.test(text) && !BARE.test(text)) return null;
  return `Your Chat ID is:\n\n\`${threadId}\`\n\nShare it if you need help with this chat.`;
}
