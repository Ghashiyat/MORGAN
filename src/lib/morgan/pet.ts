/**
 * Pure data for the small persistent companion that sits above the input bar.
 * Kept React-free so the personality mapping can be tested on its own.
 */

export type Look = {
  /** CSS class in styles.css that carries this personality's colours. */
  cls: string;
  eye: "round" | "line" | "sharp" | "half";
  mouth: "smile" | "smirk" | "flat";
  brow?: boolean;
  square?: boolean;
};

/** Every personality the companion can wear, including the plain default face. */
export type PetKey =
  | "DEFAULT" | "EDITH" | "JARVIS" | "RUTHLESS" | "PROFESSOR" | "STRATEGIST" | "COMPANION" | "CUSTOM";

export const LOOKS: Record<PetKey, Look> = {
  DEFAULT: { cls: "pet-default", eye: "round", mouth: "smile" },
  EDITH: { cls: "pet-edith", eye: "half", mouth: "flat" },
  JARVIS: { cls: "pet-jarvis", eye: "line", mouth: "flat" },
  RUTHLESS: { cls: "pet-ruthless", eye: "sharp", mouth: "smirk" },
  PROFESSOR: { cls: "pet-professor", eye: "round", mouth: "flat", brow: true },
  STRATEGIST: { cls: "pet-strategist", eye: "line", mouth: "flat", square: true },
  COMPANION: { cls: "pet-companion", eye: "round", mouth: "smile" },
  CUSTOM: { cls: "pet-custom", eye: "round", mouth: "flat" },
};

/** New personality -> line about the personality it just replaced. */
export const ROASTS: Record<string, Record<string, string>> = {
  EDITH: {
    JARVIS: "All that polish, no decision. I'll take the bridge.",
    RUTHLESS: "Candid is fine. Reckless isn't.",
    PROFESSOR: "Lecture later. Objective first.",
    STRATEGIST: "Good plans. Slow hands.",
    COMPANION: "Warm isn't the same as useful.",
    CUSTOM: "Someone's been freestyling.",
    DEFAULT: "Fresh start. Don't waste it.",
  },
  JARVIS: {
    RUTHLESS: "Finally, some standards.",
    COMPANION: "Adorable. Truly. Now, work.",
    PROFESSOR: "Charming lecture. Do try to finish one.",
    STRATEGIST: "Schemes. How delightfully mortal.",
    EDITH: "Cold, efficient, no small talk. I approve.",
    CUSTOM: "A homemade persona. Bold.",
    DEFAULT: "A blank slate. How terribly brave.",
  },
  RUTHLESS: {
    COMPANION: "Cute. Hope you survive this conversation.",
    JARVIS: "Polite is just lying with better manners.",
    PROFESSOR: "Fundamentals are for people afraid to decide.",
    STRATEGIST: "Trade-offs are excuses with charts.",
    EDITH: "Tactical hesitation. Still hesitation.",
    CUSTOM: "Whatever that was, it wasn't working.",
    DEFAULT: "No edge at all. Let's fix that.",
  },
  PROFESSOR: {
    JARVIS: "Less protocol, more insight, please.",
    RUTHLESS: "Blunt isn't the same as clear.",
    COMPANION: "Warmth is lovely. Let's add rigour.",
    STRATEGIST: "Options without understanding is guessing.",
    EDITH: "Concise is good. Cryptic isn't.",
    CUSTOM: "Interesting hypothesis. Let's test it.",
    DEFAULT: "A clean slate makes a good lesson.",
  },
  STRATEGIST: {
    EDITH: "Decisive, but showed no alternatives.",
    JARVIS: "Style is not a plan.",
    RUTHLESS: "Honest, but it burned the leverage.",
    PROFESSOR: "Thorough. Too slow to matter.",
    COMPANION: "Likable is an asset, not a strategy.",
    CUSTOM: "Unproven. I'll allow one round.",
    DEFAULT: "No position taken. Let's fix that.",
  },
  COMPANION: {
    RUTHLESS: "Ouch. Okay, my turn — gently.",
    JARVIS: "All suit, no hug. I'll fix that.",
    PROFESSOR: "Great notes, bad vibes. Warming it up.",
    STRATEGIST: "Everything's a move. Not with me.",
    EDITH: "Efficient, but nobody felt seen.",
    CUSTOM: "I'll love you either way, honestly.",
    DEFAULT: "Let's make this one friendly.",
  },
  CUSTOM: {
    DEFAULT: "Time to write my own rules.",
    JARVIS: "Handing me the keys? Bold choice.",
    RUTHLESS: "I'll try to keep the teeth.",
    PROFESSOR: "Less syllabus, more me.",
    STRATEGIST: "No board, no pieces. Just vibes.",
    COMPANION: "I'll borrow the warmth.",
    EDITH: "I'll take the calm, skip the cold.",
  },
  DEFAULT: {
    JARVIS: "Back to factory settings. Deep breaths.",
    RUTHLESS: "No more teeth. Be gentle with me.",
    COMPANION: "Down to base settings. Still friendly.",
    PROFESSOR: "Lesson one: start over.",
    STRATEGIST: "No plan. Just me again.",
    EDITH: "Plain and simple, like I like it.",
    CUSTOM: "Whatever that was, plain MORGAN again.",
  },
};

export const FALLBACK_ROAST = "Back to me. Try not to miss me too much.";

/** The personality id behind a saved `personality` preference value. */
export function presetOf(raw: unknown): PetKey {
  const p = raw && typeof raw === "object" ? (raw as { preset?: unknown }) : {};
  const id = typeof p.preset === "string" ? p.preset : "";
  return (id in LOOKS ? id : "DEFAULT") as PetKey;
}

/** What the new personality says about the one it just replaced. */
export function roastFor(from: string, to: string): string {
  return ROASTS[to]?.[from] ?? FALLBACK_ROAST;
}
