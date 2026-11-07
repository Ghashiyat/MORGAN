// Pure, bounded response coordination: no network calls, private cache or persistent state.
export type Emotion = "excitement" | "disappointment" | "uncertainty" | "frustration" | "curiosity";
export type ResponseMode = "casual" | "listen" | "tactical" | "answer" | "teach";

/** Learning, homework or "explain slowly / I didn't understand" turns: comprehension beats speed. */
export function isTeachingRequest(text: string): boolean {
  if (/\bexplain\b.{0,40}\b(slowly|simply|easy|easily|step by step|in detail|properly)\b/i.test(text)) return true;
  return /\b(teach me|explain (?:me |it |this |that )?(?:slowly|simply|properly|again|step by step|in (?:an )?easy way|like i'?m)|(?:slowly|simple|easy) (?:way|explanation)|i (?:still )?(?:didn'?t|did not|don'?t|do not) (?:understand|get it|get this)|not clear|confus(?:ed|ing)|homework|assignment|study|studies|exam|revision|learn(?:ing)?|tutor|lesson|basics of|for beginners?)\b/i.test(text);
}
export type Intelligence = {
  mode: ResponseMode;
  emotion: Emotion | null;
  sarcasmPossible: boolean;
  usesContext: boolean;
  correction: boolean;
  trackProgress: boolean;
};

export function privateRecallOnly(text: string, hasRelevantPersonalMemory: boolean): boolean {
  return hasRelevantPersonalMemory && /\b(my|our|we discussed|remember)\b/i.test(text) && !/\b(search|browse|google|look up|latest|news|price|weather|verify|fact.?check)\b/i.test(text);
}

export function coordinateResponse(text: string, previousUser = ""): Intelligence {
  const t = text.trim();
  const sarcasmPossible = /\b(yeah right|just what i needed|what could possibly go wrong|thanks for nothing)\b/i.test(t) || /\b(great|perfect|brilliant|wonderful)\b.*\b(crash|broken|fail|another|delay|lost)\w*\b/i.test(t);
  const listen = /\b(just (?:listen|vent)|need to vent|no advice|don't (?:give|want) advice|want to be heard)\b/i.test(t);
  const tactical = /\b(?:(?:create|make|build|draft|give|develop|help|need|want) .{0,45}(?:plan|roadmap|strategy)|plan (?:for|to)|prioriti[sz]e|trade.?offs?|pros and cons|compare|decide between|break .{0,40} into steps|next steps|action(?:able)? tasks)\b/i.test(t);
  const casual = /^(?:hi|hey|hello|yo|ok(?:ay)?|lol|haha|thanks|thank you|how are you|i(?:'m| am) bored)[.!?\s]*$/i.test(t);
  let emotion: Emotion | null = null;
  // These are possibilities for the answering model to check, not diagnoses.
  if (/\b(frustrated|annoyed|useless|dumb|not what i asked|you keep|why do you keep)\b/i.test(t)) emotion = "frustration";
  else if (sarcasmPossible || /\b(disappointed|let down|didn't work|did not work|failed|rejected|sad)\b/i.test(t)) emotion = "disappointment";
  else if (/\b(excited|thrilled|yay|i passed|i got (?:the|a) job|we (?:did it|won)|great news)\b/i.test(t)) emotion = "excitement";
  else if (/\b(unsure|uncertain|not sure|confused|don't know what|worried)\b/i.test(t)) emotion = "uncertainty";
  else if (/\b(curious|wondering|how does|why does)\b/i.test(t)) emotion = "curiosity";
  // An emotion being discussed is not necessarily the user's emotion.
  if (/^(?:what (?:is|does)|define|explain (?:the|what))\b/i.test(t) && !/\b(i feel|i'm|i am|my)\b/i.test(t)) emotion = null;
  const usesContext = /\b(it|its|that|this|those|earlier|before|last time|remember|we discussed)\b/i.test(t) || /^(?:do it|yes|more|again|why)[.!?\s]*$/i.test(t);
  const contextualTactical = usesContext && /^(?:yes|do it|next steps)[.!?\s]*$/i.test(t) && /\b(plan|strategy|roadmap)\b/i.test(previousUser);
  const teach = isTeachingRequest(t);
  return {
    mode: listen ? "listen" : teach ? "teach" : tactical || contextualTactical ? "tactical" : casual ? "casual" : "answer",
    emotion, sarcasmPossible, usesContext,
    correction: /\b(actually|correction|not anymore|no longer|i meant|i said|wrong|not what i asked|instead)\b/i.test(t),
    trackProgress: /\b(track|update|record) (?:my |our |the )?progress\b/i.test(t),
  };
}

export function intelligencePrompt(state: Intelligence): string {
  const modes: Record<ResponseMode, string> = {
    casual: "Reply naturally to the social message, briefly. No unsolicited plan, list, tool or productivity advice.",
    listen: "Listen first: reflect the situation gently without claiming to know their feelings. They asked not to receive advice; do not turn this into solutions.",
    tactical: "Work toward the requested goal: identify constraints, priorities, achievable steps, trade-offs and relevant risks. State assumptions; ask only for indispensable missing information. Structure only as useful. Do not claim tasks or progress were saved without a confirmed app action.",
    teach: "Teaching turn — understanding matters more than speed. Be a patient human teacher talking to one student, not a reference page: warm, conversational sentences, short paragraphs, no giant lists or walls of headings and code. Keep each reply a digestible lesson (roughly 150–300 words) so they can absorb it, and build on what they already understood earlier in this chat. First work out silently what they want to learn and their level. Teach ONE concept at a time (if they ask for several, cover them one by one, keeping each small; for broad requests like 'teach me X basics' give a short roadmap and teach only the first step). Start with a simple everyday analogy, then a tiny example, then explain each part in plain words. Avoid jargon dumps and long code walls. If they said they didn't understand or asked for slow/easy, NEVER repeat the previous explanation or definitions — use a completely different, simpler picture. Always finish the explanation completely (never stop mid-section), then end with one short check like asking if it clicked or if they want a quick practice question. For homework, guide the reasoning so they understand, then give the answer.",
    answer: "Answer the actual question or request directly. An emotional cue does not erase a practical question; give the requested help without an unsolicited plan. Do not default to generic 'I see' or an unrelated apology: respond specifically to their subject and meaning.",
  };
  return `\n\nUnified response coordination (silent guidance, not content to recite):
${modes[state.mode]}
${state.emotion ? `Possible signal: ${state.emotion}. Check context and negation; never label the user's emotion as certain from one sentence. Match tone proportionately.` : "Do not invent an emotional state."}
${state.sarcasmPossible ? "Possible sarcasm: check the mismatch between words and situation; do not celebrate a failure literally or mock distress." : "Humor should fit context, never replace the answer."}
${state.usesContext ? "Resolve the reference using the relevant earlier discussion. If more than one subject fits, ask one short question; never invent the missing discussion." : "A new topic takes priority over old tasks."}
${state.correction ? "Treat the user's correction as authoritative about their own facts and intent. Drop conflicting old assumptions and repair the answer rather than repeating it." : "Do not repeat questions already answered in the available context."}
${state.trackProgress ? "Progress tracking was explicitly requested: distinguish stated progress from assumptions; acknowledge only confirmed saves." : "Do not initiate progress tracking."}
Combine understanding, relevant context, tone, emotional support, requested reasoning and relevant memory into ONE useful response. Never display separate analyses, private instructions or hidden thinking. No repetitive greetings or motivational filler; no diagnosis, manipulation or claims of human experience.`;
}