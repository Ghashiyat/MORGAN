/** Local HUD commands (timers, briefing). Pure and unit tested; runs before the AI. */
export type TimerIntent = { kind: "timer"; ms: number; label: string } | { kind: "timer-cancel" } | { kind: "timer-status" };

const UNIT: Record<string, number> = { s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000, h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000 };
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, half: 0.5 };
const DUR = String.raw`(\d+(?:\.\d+)?|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty|half an?)[ -]?(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)`;

function toMs(n: string, u: string) {
  const v = /^half/.test(n) ? 0.5 : (WORDS[n] ?? Number(n));
  const ms = v * (UNIT[u] ?? 0);
  return ms > 0 && ms <= 24 * 3_600_000 ? ms : null;
}

function norm(raw: string) {
  return raw.toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim()
    .replace(/^(hey |ok |okay )?morgan[, ]+/, "")
    .replace(/^((please|pls|plz|can you|could you|can u) )+/, "").trim();
}

export function parseTimerIntent(raw: string): TimerIntent | null {
  const t = norm(raw);
  if (/^(cancel|stop|clear|delete) (the |my |all )?(timers?|alarms?|reminders?)$/.test(t)) return { kind: "timer-cancel" };
  if (/^(how much time (is )?left|time left|timer status|check (my )?timer)$/.test(t)) return { kind: "timer-status" };
  const r1 = t.match(new RegExp(`^remind me in ${DUR}(?: to (.+))?$`));
  if (r1) { const ms = toMs(r1[1]!, r1[2]!); return ms ? { kind: "timer", ms, label: r1[3]?.trim() || "Reminder" } : null; }
  const r2 = t.match(new RegExp(`^remind me to (.+) in ${DUR}$`));
  if (r2) { const ms = toMs(r2[2]!, r2[3]!); return ms ? { kind: "timer", ms, label: r2[1]!.trim() } : null; }
  const timer = t.match(new RegExp(`^(?:set |start )?(?:a |an )?(?:timer|alarm|focus session|countdown)(?: for)? ${DUR}$`))
    ?? t.match(new RegExp(`^(?:set |start )?(?:a |an )?${DUR} (timer|alarm|focus session|focus|countdown|pomodoro)$`));
  if (timer) {
    const ms = toMs(timer[1]!, timer[2]!);
    const kind = timer[3];
    return ms ? { kind: "timer", ms, label: kind && /focus|pomodoro/.test(kind) ? "Focus session" : "Timer" } : null;
  }
  return null;
}

export function isBriefing(raw: string) {
  const t = norm(raw);
  return /^(run |start |give me (my |a |the )?|initiate )?(morning protocol|daily briefing|morning briefing|briefing|sitrep|situation report)( please)?$/.test(t);
}

/** City hint from the device time zone, e.g. "Asia/Calcutta" -> "Calcutta". */
export function cityFromTimeZone(tz: string | undefined) {
  const c = tz?.split("/").pop()?.replace(/_/g, " ");
  return c && c !== "UTC" ? c : null;
}

export function briefingPrompt(city: string | null, date: string) {
  return `Morning protocol for ${date}. Search the web and give me a sharp spoken briefing (under 45 seconds read aloud): `
    + `${city ? `today's weather in ${city}, ` : ""}the top 3 world headlines today and the top 2 tech headlines today. `
    + "One line each, no tables, end with one useful suggestion for my day.";
}

export function fmtLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** MORGAN Capture voice/typed commands. */
export function parseCaptureIntent(raw: string): "start" | "stop" | null {
  const t = norm(raw);
  if (/^(start|begin) (recording|taking notes|lecture recording|a recording|capture)|^record (notes|this|the lecture|my notes)( for me)?$|^take notes( for me)?$/.test(t)) return "start";
  if (/^(stop|end) (the )?(recording|capture)$|^finish (my |the )?notes$/.test(t)) return "stop";
  return null;
}
