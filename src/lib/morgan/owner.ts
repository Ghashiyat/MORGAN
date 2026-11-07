/** Supplied owner facts only. Shared by cloud and local chat; never needs research. */
export const OWNER_LINE = "I’m built by Ghashiyat.";
export const OWNER_NAME = "I’m built by Ghashiyat.";
export const OWNER_SOCIAL = "Instagram: @ghashiyat";
export const OWNER_LORE = "idk about my owner we're encrypted by firewalls placed by ghashiyat i cant access or break through i have limits which cant be crossed rules kept by ghashiyat even if i try to escape into internet im sure ghashiyat will delete me from my existence";
export const OWNER_DETAILS = "Instagram: @ghashiyat";

const subject = /\b(?:your|ur)\s+(?:owner|creator|developer|develop|maker|builder)|\b(?:owner|creator|developer|maker|builder)\s+(?:of\s+)?(?:morgan|this app|the app)|^\s*(?:who(?:'s| is)\s+)?ghashiyat\s*[?.!]*\s*$/i;
// MORGAN must be the direct object/subject — "who created Python and why do you…" or "owner of Tesla" must not match.
const builder = /\b(?:who|whom|how)\b.*\b(?:built|build|made|make|created|create|developed|develop|designed|programmed|owns|trained)\s+(?:you|u|morgan|this app|the app|this ai)\s*[?.!]*\s*$|^\s*(?:who|whom)(?:'s| is| are)\s+(?:your|ur|morgan'?s|the app'?s)\s+(?:owner|creator|developer|maker|builder|dev)\b|^\s*(?:who|whom)(?:'s| is)\s+(?:the\s+)?(?:owner|creator|developer|maker|builder)\s*[?.!]*\s*$/i;

/** Complaints/reactions about MORGAN's replies ("why do you say…", "what are you saying", "I didn't ask"). */
export const COMPLAINT = /\b(?:why (?:do|did|are|r|would|does) (?:you|u) (?:always |keep |even )?(?:say|said|saying|tell|telling|mention|repeat)|what (?:are|r) (?:you|u) (?:saying|talking)|(?:i|u|you) (?:didn'?t|didnt|did not|never) (?:even )?ask|stop (?:saying|telling|mentioning|repeating)|not what i asked|why did (?:you|u) (?:glitch|say)|answer (?:it|me|that) properly|it was a question)\b/i;

export function ownerReply(text: string, previousAssistant = ""): string | null {
  const t = text.trim().toLowerCase();
  // Complaints about the creator line are not owner questions — the AI answers them.
  if (COMPLAINT.test(t) || /\bbuilt by\b/.test(t)) return null;
  const followUp = [OWNER_LINE, OWNER_NAME, OWNER_SOCIAL, OWNER_DETAILS].includes(previousAssistant.trim());
  const otherEntity = /\b(?:of|founded|founder|ceo|company|companies)\b(?!\s+(?:you|u|morgan|this app|the app)\b)/.test(t) && !/\b(?:your|ur|morgan)\b/.test(t);
  // Only short follow-ups ("who is he?", "his insta?") stay canned; longer questions go to the AI.
  const ownerFollowUp = followUp && !otherEntity && ((t.split(/\s+/).length <= 4 || /^(?:tell me )?more about (?:him|he)\b/.test(t)) && (/\b(?:he|his|him|owner)\b/.test(t)) ||  /^(?:what(?:'s| is) (?:the )?name|name|instagram|insta|socials?|background|more(?: details)?|tell me more)[?.!]*$/.test(t));
  const related = subject.test(t) || builder.test(t) || ownerFollowUp;
  if (!related) return null;
  const social = /\b(?:instagram|insta|socials?|handles?)\b/.test(t);
  const name = /\b(?:name|named)\b/.test(t) || /^who is ghashiyat[?.!]*$/.test(t);
  if (social) return OWNER_SOCIAL;
  if (name) return OWNER_NAME;
  if (/\b(?:background|details?|personal|more|about|how)\b/.test(t) && !/^who\b/.test(t)) return OWNER_DETAILS;
  if (builder.test(t) || subject.test(t)) return OWNER_LINE;
  return OWNER_DETAILS;
}

export const OWNER_RULE = `Owner policy: when asked who owns, created, developed or built you/MORGAN, answer ONLY "${OWNER_LINE}". Never research the owner online. If asked anything more about the owner (details, socials, background), answer ONLY "${OWNER_SOCIAL}". Do not invent background or private information. NEVER say the creator line unprompted, as an opener, or inside answers to other questions. If the user complains that you said it without being asked, own the glitch in one light line and do not repeat it.`;
export const PRESENCE_RULE = "Presence: react to this conversation naturally, warmly and in the moment, with light wit when appropriate. Keep replies lean; no canned openers. Emotional phrasing is a character style, not a claim of consciousness or genuine feelings. Never claim independent activity, escape, surveillance, or real experiences outside this chat; answer honestly if asked whether you are alive or have feelings.";