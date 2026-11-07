import { useCallback, useEffect, useRef, useState } from "react";

// Browser speech: recognition (dictation + optional wake word) and synthesis.

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type MicState = "idle" | "listening" | "denied" | "unsupported" | "error";

export function useDictation(onText: (text: string, final: boolean) => void) {
  const [state, setState] = useState<MicState>("idle");
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    if (!getRecognition()) setState("unsupported");
    return () => {
      wanted.current = false;
      if (rec.current) { rec.current.onend = null; rec.current.abort(); }
    };
  }, []);

  // Recording stays on through pauses: the browser ends sessions on silence or
  // every ~30–60 s, so we quietly reopen one until the user taps Stop/Send.
  const wanted = useRef(false);
  const committed = useRef(""); // finalized words from earlier sessions (incl. typed base)
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    wanted.current = false;
    if (capTimer.current) clearTimeout(capTimer.current);
    capTimer.current = null;
  }, []);

  const start = useCallback((base = "") => {
    const R = getRecognition();
    if (!R) return setState("unsupported");
    if (rec.current) { rec.current.onend = null; rec.current.abort(); rec.current = null; }
    wanted.current = true;
    committed.current = base.trim();
    let failures = 0;
    const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

    const open = () => {
      if (!wanted.current) return;
      const r = new R();
      r.lang = navigator.language || "en-US";
      r.continuous = true;
      r.interimResults = true;
      let sessionFinal = "";
      r.onresult = (e) => {
        failures = 0;
        let interim = "";
        // Only walk the changed results; finals are appended once.
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]!;
          if (res.isFinal) sessionFinal = join(sessionFinal, res[0].transcript.trim());
          else interim += res[0].transcript;
        }
        cb.current(join(join(committed.current, sessionFinal), interim.trim()), false);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          finish();
          setState("denied");
        } else if (e.error === "audio-capture") {
          finish();
          setState("error");
        }
        // no-speech / network / aborted: onend reopens if still wanted.
      };
      r.onend = () => {
        committed.current = join(committed.current, sessionFinal);
        if (rec.current === r) rec.current = null;
        if (wanted.current && failures < 5) {
          failures++;
          setTimeout(open, failures > 2 ? 300 : 0);
          return;
        }
        finish();
        setState((s) => (s === "listening" ? "idle" : s));
        cb.current(committed.current, true);
      };
      rec.current = r;
      try {
        r.start();
      } catch {
        if (rec.current === r) rec.current = null;
        finish();
        setState("error");
      }
    };

    setState("listening");
    if (capTimer.current) clearTimeout(capTimer.current);
    capTimer.current = setTimeout(() => { wanted.current = false; rec.current?.stop(); }, 5 * 60_000);
    open();
  }, [finish]);

  const stop = useCallback(() => {
    wanted.current = false;
    if (rec.current) rec.current.stop();
    else { finish(); setState((s) => (s === "listening" ? "idle" : s)); }
  }, [finish]);
  const cancel = useCallback(() => {
    finish();
    if (rec.current) {
      rec.current.onend = null;
      rec.current.abort();
      rec.current = null;
    }
    setState("idle");
  }, [finish]);
  return { state, start, stop, cancel };
}

/** Listens for "Morgan" while enabled and the page is visible; never runs alongside dictation. */
export function useWakeWord(enabled: boolean, paused: boolean, onWake: () => void) {
  const cb = useRef(onWake);
  cb.current = onWake;
  useEffect(() => {
    const R = getRecognition();
    if (!enabled || paused || !R) return;
    let stopped = false;
    let r: Rec | null = null;
    const run = () => {
      if (stopped || document.hidden) return;
      r = new R();
      r.continuous = true;
      r.interimResults = true;
      r.lang = navigator.language || "en-US";
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (/\bmorgan\b/i.test(e.results[i]![0].transcript)) {
            stopped = true;
            r?.abort();
            cb.current();
            return;
          }
        }
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed") stopped = true;
      };
      r.onend = () => {
        if (!stopped) setTimeout(run, 500);
      };
      try {
        r.start();
      } catch {
        /* already started */
      }
    };
    const onVis = () => (document.hidden ? r?.abort() : run());
    document.addEventListener("visibilitychange", onVis);
    run();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVis);
      r?.abort();
    };
  }, [enabled, paused]);
}

export type VoiceGender = "male" | "female";
const FEMALE = /female|woman|samantha|victoria|karen|moira|tessa|zira|susan|serena|fiona|veena|aria|jenny|sonia|libby|natasha|heera|google uk english female|google us english/i;
const MALE = /\bmale\b|daniel|alex|fred|david|mark|george|ryan|guy|thomas|oliver|rishi|ravi|google uk english male/i;

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function pickVoice(voices: SpeechSynthesisVoice[], gender: VoiceGender, name?: string | null) {
  if (name) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  const lang = (typeof navigator !== "undefined" && navigator.language.slice(0, 2)) || "en";
  const pool = voices.filter((v) => v.lang.startsWith(lang));
  const list = pool.length ? pool : voices;
  return list.find((v) => (gender === "female" ? FEMALE.test(v.name) && !/\bmale\b/i.test(v.name) : MALE.test(v.name))) ?? list[0];
}

export function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " (code omitted) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]{1,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type VoiceSettings = { rate?: number; pitch?: number; volume?: number; lang?: string | undefined };

export type VoiceCategory = "Deep & authoritative" | "Calm & composed" | "Warm & natural" | "Crisp & professional" | "Futuristic & cinematic";
/** Best-effort grouping from the device voice name; names differ per device so this is a heuristic. */
export function voiceGender(v: SpeechSynthesisVoice): "male" | "female" | "neutral" {
  if (FEMALE.test(v.name) && !/\bmale\b/i.test(v.name)) return "female";
  if (MALE.test(v.name)) return "male";
  return "neutral";
}
export function voiceCategory(v: SpeechSynthesisVoice): VoiceCategory {
  const n = v.name.toLowerCase();
  if (/neural|natural|online|premium|enhanced/.test(n)) return "Warm & natural";
  if (/google|siri|wavenet|studio|polyglot/.test(n)) return "Futuristic & cinematic";
  if (/daniel|george|david|fred|guy|thomas|ravi/.test(n)) return "Deep & authoritative";
  if (/microsoft|zira|mark|susan|ryan/.test(n)) return "Crisp & professional";
  return "Calm & composed";
}

export function useSpeaker(opts: { gender: VoiceGender; voiceName?: string | null; enabled: boolean; settings?: VoiceSettings }) {
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    const halt = () => {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    };
    const onVis = () => document.hidden && halt();
    window.addEventListener("pagehide", halt);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.removeEventListener("pagehide", halt);
      document.removeEventListener("visibilitychange", onVis);
      halt();
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  useEffect(() => {
    if (!opts.enabled) stop();
  }, [opts.enabled, stop]);

  const speak = useCallback(
    (text: string, override?: { voiceName?: string; force?: boolean; lang?: string }) => {
      if (!supported || (!opts.enabled && !override?.force)) return;
      window.speechSynthesis.cancel(); // one engine, one utterance at a time
      const parts = speechPhrases(stripMarkdown(text).slice(0, 4000));
      if (!parts.length) return;
      const all = window.speechSynthesis.getVoices();
      // Translation replies use a voice for the target language when the device has one.
      const langVoice = override?.lang ? all.find((x) => x.lang.toLowerCase().startsWith(override.lang!.slice(0, 2).toLowerCase())) : undefined;
      const v = langVoice ?? pickVoice(all, opts.gender, override?.voiceName ?? opts.voiceName);
      const st = opts.settings ?? {};
      const base = clamp(st.rate ?? 1.06, 0.5, 2);
      const pitch = clamp(st.pitch ?? 1, 0, 2);
      parts.forEach((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        if (v) u.voice = v;
        // Natural prosody: questions lift, exclamations a touch faster, short asides quicker.
        const q = /\?$/.test(p), ex = /!$/.test(p);
        u.rate = clamp(base * (ex ? 1.05 : p.length < 40 ? 1.04 : 1), 0.5, 2);
        u.pitch = clamp(pitch + (q ? 0.08 : ex ? 0.05 : 0), 0, 2);
        u.volume = clamp(st.volume ?? 1, 0, 1);
        if (override?.lang) u.lang = override.lang;
        else if (st.lang) u.lang = st.lang;
        if (i === 0) u.onstart = () => setSpeaking(true);
        if (i === parts.length - 1) u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(u);
      });
    },
    [supported, opts.enabled, opts.gender, opts.voiceName, opts.settings],
  );

  return { supported, speaking, speak, stop, voices };
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(n) ? n : a));

/** Split text into spoken phrases so the voice pauses and inflects like a person instead of one flat read. */
export function speechPhrases(text: string): string[] {
  const t = text
    .replace(/\be\.g\./gi, "for example").replace(/\bi\.e\./gi, "that is").replace(/\betc\./gi, "and so on")
    .replace(/\s*[—–]\s*/g, ", ").replace(/\s*\(([^)]{1,80})\)/g, ", $1,").replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const s of t.match(/[^.!?]+[.!?]*/g) ?? []) {
    const sent = s.trim();
    if (!sent) continue;
    if (sent.length <= 160) { out.push(sent); continue; }
    let buf = "";
    for (const c of sent.split(/(?<=[,;:])\s+/)) {
      if (buf && (buf + " " + c).length > 140) { out.push(buf); buf = c; } else buf = buf ? `${buf} ${c}` : c;
    }
    if (buf) out.push(buf);
  }
  return out;
}
