import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { fmtLeft } from "@/lib/morgan/hud-intent";

type Timer = { id: string; label: string; ends: number; total: number };
const KEY = "morgan:timers";
let timers: Timer[] = [];
const subs = new Set<() => void>();
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch { /* ignore */ } subs.forEach((f) => f()); };
let loaded = false;
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { timers = (JSON.parse(localStorage.getItem(KEY) ?? "[]") as Timer[]).filter((t) => t.ends > Date.now() - 60_000); } catch { timers = []; }
}

export function addTimer(ms: number, label: string) {
  load();
  timers = [...timers, { id: crypto.randomUUID(), label, ends: Date.now() + ms, total: ms }];
  emit();
  toast(`${label} set for ${fmtLeft(ms)}`);
  if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
}
export function cancelTimers() { load(); const n = timers.length; timers = []; emit(); toast(n ? "Timers cleared." : "No timers running."); }
export function timerStatus() {
  load();
  if (!timers.length) { toast("No timers running."); return; }
  timers.forEach((t) => toast(`${t.label}: ${fmtLeft(t.ends - Date.now())} left`));
}
function remove(id: string) { timers = timers.filter((t) => t.id !== id); emit(); }

function chime() {
  try {
    const ac = new AudioContext();
    [0, 0.25, 0.5].forEach((d, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = [880, 1175, 1568][i]!;
      g.gain.setValueAtTime(0.0001, ac.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d + 0.4);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + d); o.stop(ac.currentTime + d + 0.45);
    });
    setTimeout(() => void ac.close(), 1500);
  } catch { /* audio unavailable */ }
}

/** Glowing countdown rings docked in the top bar. */
export function TimerDock({ onDone }: { onDone?: (label: string) => void }) {
  const list = useSyncExternalStore((f) => { load(); subs.add(f); return () => subs.delete(f); }, () => timers, () => [] as Timer[]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!list.length) return;
    const i = setInterval(() => {
      const n = Date.now();
      setNow(n);
      timers.filter((t) => t.ends <= n).forEach((t) => {
        remove(t.id);
        chime();
        toast.success(`${t.label} complete`, { duration: 10_000 });
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification("MORGAN", { body: `${t.label} complete` });
        onDone?.(t.label);
      });
    }, 500);
    return () => clearInterval(i);
  }, [list.length, onDone]);
  if (!list.length) return null;
  return (
    <div className="flex items-center gap-1.5">
      {list.map((t) => {
        const left = t.ends - now, p = Math.max(0, Math.min(1, left / t.total)), R = 9, C = 2 * Math.PI * R;
        return (
          <span key={t.id} className="hud-topbtn group flex items-center gap-1.5 !px-2" title={t.label}>
            <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90 drop-shadow-[0_0_4px_var(--primary)]" aria-hidden>
              <circle cx="11" cy="11" r={R} fill="none" stroke="var(--border)" strokeWidth="2" />
              <circle cx="11" cy="11" r={R} fill="none" stroke="var(--primary)" strokeWidth="2" strokeDasharray={C} strokeDashoffset={C * (1 - p)} strokeLinecap="round" />
            </svg>
            <span className="font-mono text-xs tabular-nums text-primary">{fmtLeft(left)}</span>
            <button type="button" aria-label={`Cancel ${t.label}`} onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </span>
        );
      })}
    </div>
  );
}
