import { useEffect, useRef, useState } from "react";
import { useMorgan } from "./context";
import { LOOKS, presetOf, roastFor } from "@/lib/morgan/pet";
import { EMPTY_MEMORY, buddyName, learn, relayToAreeba, replyTease, moodOf, quipFor, tapLine, normalizeMemory, type AreebaMemory, type Mood } from "@/lib/morgan/areeba";
import { cacheAreeba, fetchAreeba, readAreeba, saveAreeba } from "@/lib/morgan/areeba-storage";

/**
 * A tiny persistent companion that sits just above the input bar.
 * Purely decorative + additive: it never touches message rendering, streaming
 * or the composer, and it is always on screen.
 */
export function MorganPet() {
  const m = useMorgan();
  const preset = presetOf(m.prefs.personality);
  const look = LOOKS[preset];
  const busy = m.activity !== "idle";
  const name = buddyName((m.prefs.personality as { buddy_name?: unknown } | null)?.buddy_name);
  const nameRef = useRef(name);
  nameRef.current = name;
  const [roast, setRoast] = useState<string | null>(null);
  const [trick, setTrick] = useState<string | null>(null);
  const prev = useRef<string | null>(null);
  const armed = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // Preferences hydrate from the server a beat after mount, so the watcher only
  // starts recording switches once things have settled.
  useEffect(() => {
    const t = window.setTimeout(() => { armed.current = true; }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const from = prev.current;
    prev.current = preset;
    if (!armed.current || !from || from === preset) return;
    setRoast(roastFor(from, preset));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRoast(null), 5500);
  }, [preset]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const [pop, setPop] = useState(0);
  const [look2, setLook2] = useState({ x: 0, y: 0 });
  const [tint, setTint] = useState<Mood | null>(null);
  const mem = useRef<AreebaMemory>({ ...EMPTY_MEMORY });
  const lastMove = useRef(0);
  const ref = useRef<HTMLSpanElement>(null);
  const say = (line: string, ms: number) => {
    setRoast(line);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRoast(null), ms);
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      lastMove.current = Date.now();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      setLook2({ x: (dx / d) * 1.8, y: (dy / d) * 1.4 });
    };
    window.addEventListener("pointermove", move, { passive: true });
    // Looks around on her own when nobody is moving the pointer.
    const wander = window.setInterval(() => {
      if (Date.now() - lastMove.current < 4000) return;
      const a = Math.random() * Math.PI * 2;
      setLook2(Math.random() < 0.3 ? { x: 0, y: 0 } : { x: Math.cos(a) * 1.8, y: Math.sin(a) * 1.2 });
    }, 2600);
    // Never sits still for long: a random little trick every few seconds.
    let trickTimer: number | undefined;
    const tricks = ["hop", "jump", "wiggle", "spin", "scoot-l", "scoot-r", "peek"];
    const nextTrick = () => {
      trickTimer = window.setTimeout(() => {
        if (!document.hidden) setTrick(tricks[Math.floor(Math.random() * tricks.length)] ?? null);
        window.setTimeout(() => setTrick(null), 1300);
        nextTrick();
      }, 4500 + Math.random() * 5000);
    };
    nextTrick();
    return () => { window.removeEventListener("pointermove", move); window.clearInterval(wander); window.clearTimeout(trickTimer); };
  }, []);
  // Little best-friend memory + rare colour shifts and jokes from the chat.
  useEffect(() => {
    const uid = m.userId;
    mem.current = readAreeba(uid);
    let active = true;
    let revision = 0;
    let lastUser = "";
    let lastQuip = 0;
    void fetchAreeba(uid).then(value => { if (active && revision === 0) mem.current = value; });
    let tintTimer: number | undefined;
    const react = (text: string, fromUser: boolean) => {
      if (fromUser) {
        lastUser = text;
        if (relayToAreeba(text, nameRef.current) !== null) return; // react only once, when delivery finishes
        const next = learn(text, mem.current);
        if (JSON.stringify(next) !== JSON.stringify(mem.current)) {
          revision++;
          mem.current = next;
          void saveAreeba(uid, next);
        }
      }
      if (/\b(?:sad|hurt|grief|suicide|self.harm|died|depressed|anxious)\b/i.test(lastUser + text)) return;
      if (!fromUser && Date.now() - lastQuip > 12000) {
        const tease = replyTease(lastUser, text);
        if (tease && Math.random() < 0.55) { lastQuip = Date.now(); setTrick("jump"); say(tease, 5500); return; }
      }
      const mood = moodOf(text);
      if (!mood) return;
      if (Math.random() < 0.3) {
        setTint(mood);
        window.clearTimeout(tintTimer);
        tintTimer = window.setTimeout(() => setTint(null), 8000);
      }
      if (Date.now() - lastQuip > 12000 && Math.random() < (mood === "funny" ? 0.75 : 0.4)) { lastQuip = Date.now(); setTrick("hop"); say(quipFor(mood, mem.current, Math.random()), 4500); }
    };
    const onRelay = (e: Event) => {
      const data = (e as CustomEvent<{ memory: unknown; reaction: string }>).detail;
      if (!data || typeof data.reaction !== "string") return;
      revision++;
      mem.current = normalizeMemory(data.memory);
      cacheAreeba(uid, mem.current);
      lastQuip = Date.now();
      setPop(n => n + 1);
      say(data.reaction, 9000);
    };
    const onUser = (e: Event) => react(String((e as CustomEvent).detail ?? ""), true);
    const onReply = (e: Event) => react(String((e as CustomEvent).detail ?? "").slice(0, 400), false);
    window.addEventListener("morgan:user", onUser);
    window.addEventListener("morgan:reply", onReply);
    window.addEventListener("morgan:areeba", onRelay);
    return () => {
      active = false;
      window.removeEventListener("morgan:user", onUser);
      window.removeEventListener("morgan:reply", onReply);
      window.removeEventListener("morgan:areeba", onRelay);
      window.clearTimeout(tintTimer);
    };
  }, [m.userId]);
  const tap = () => {
    setPop((n) => n + 1);
    say(tapLine(mem.current, Math.random(), name), 2600);
  };
  const drop = preset === "RUTHLESS" || preset === "COMPANION";
  const ex = look2.x, ey = look2.y;
  return (
    <span ref={ref} className={`pet-wrap absolute z-20 select-none ${look.cls} ${tint ? `pet-tint-${tint}` : ""}`}>
      {roast && <span role="status" className="pet-roast">{roast}</span>}
      <button type="button" aria-label={`Poke ${name}`} title={name} onClick={tap} className={`pet-btn ${trick && !busy ? `pet-trick-${trick}` : ""}`}>
        <svg key={pop} viewBox="0 0 48 48" width={44} height={44} aria-hidden className={`${busy ? "pet-busy" : "pet-idle"} ${pop ? "pet-pop" : ""}`}>
          {drop ? (
            <path d="M24 4 C30 14 39 21 39 30 C39 39 32 44 24 44 C16 44 9 39 9 30 C9 21 18 14 24 4 Z" className="pet-body" />
          ) : (
            <path d="M10 36 C4 36 3 28 8 26 C6 19 13 15 17 18 C18 11 30 10 31 18 C36 14 43 19 40 26 C45 28 44 36 38 36 Z" className="pet-body" />
          )}
          <ellipse cx="18" cy={drop ? 22 : 18} rx="9" ry="4" className="pet-shine" />
          <g className="pet-eyes" transform={`translate(${ex} ${ey})`}>
            <ellipse cx="19" cy="28" rx="2.6" ry={busy ? 1.2 : 3.4} className="pet-eye" />
            <ellipse cx="29" cy="28" rx="2.6" ry={busy ? 1.2 : 3.4} className="pet-eye" />
            <circle cx="19.9" cy="26.6" r="0.9" className="pet-glint" />
            <circle cx="29.9" cy="26.6" r="0.9" className="pet-glint" />
          </g>
          <ellipse cx="14.5" cy="32.5" rx="2.4" ry="1.3" className="pet-cheek" />
          <ellipse cx="33.5" cy="32.5" rx="2.4" ry="1.3" className="pet-cheek" />
          {look.mouth === "smile" && <path d="M22 33 Q24 35.2 26 33" className="pet-stroke" />}
        </svg>
      </button>
    </span>
  );
}
