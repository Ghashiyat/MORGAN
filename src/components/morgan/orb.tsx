import { useEffect, useRef } from "react";
import { mediaPlaying } from "./media-player";

/** Mood tint from the user's last words (set by the composer); null = normal colors. */
let mood: string | null = null;
let moodUntil = 0;
export function setOrbMood(m: "sad" | "stressed" | "angry" | "happy" | null) { mood = m; moodUntil = Date.now() + 90_000; }

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "researching" | "error";

/** Small animated core with orbiting dots. ~30fps, pauses when hidden, static under reduced motion. */
export function Orb({ state, size = 84 }: { state: OrbState; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const cyan = css.getPropertyValue("--primary").trim();
    const warn = css.getPropertyValue("--warn").trim();
    const red = css.getPropertyValue("--destructive").trim();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    let energy = 0;
    const t0 = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      last = now;
      const t = (now - t0) / 1000;
      const s = stateRef.current;
      // Music pulse: a ~120bpm kick plus a slower swell. YouTube audio can't be read by the page, so this follows tempo, not the actual waveform.
      const music = s === "idle" && mediaPlaying();
      const beat = music ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 8) * 0.7 + 0.25 + 0.15 * Math.sin(t * 1.3) : 0;
      const target = music ? beat : s === "speaking" ? 0.6 + 0.3 * Math.sin(t * 9) : s === "listening" ? 0.5 + 0.2 * Math.sin(t * 5) : s === "thinking" ? 0.4 : 0.1;
      energy += (target - energy) * 0.2;
      const cx = size / 2;
      const r = size * 0.18;
      ctx.clearRect(0, 0, size, size);
      const tint = mood && Date.now() < moodUntil ? (mood === "sad" ? "oklch(0.68 0.12 255)" : mood === "stressed" ? "oklch(0.75 0.1 300)" : mood === "angry" ? "oklch(0.7 0.16 30)" : "oklch(0.82 0.16 90)") : null;
      const col = s === "error" ? red : s === "thinking" ? warn : tint ?? cyan;
      // halo
      const g = ctx.createRadialGradient(cx, cx, r * 0.4, cx, cx, r * (2.2 + energy));
      g.addColorStop(0, `color-mix(in oklch, ${col} 45%, transparent)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // core sphere
      const core = ctx.createRadialGradient(cx - r * 0.35, cx - r * 0.35, r * 0.1, cx, cx, r);
      core.addColorStop(0, "rgba(219, 39, 119, 0.5)");
      core.addColorStop(0.6, "rgba(157, 23, 77, 0.45)");
      core.addColorStop(1, `color-mix(in oklch, ${col} 30%, rgba(60, 0, 35, 0.55))`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cx, r * (1 + energy * 0.08), 0, Math.PI * 2);
      ctx.fill();
      if (s === "researching") {
        ctx.strokeStyle = `color-mix(in oklch, ${cyan} 55%, transparent)`;
        ctx.fillStyle = cyan;
        const pts = Array.from({ length: 6 }, (_, k) => {
          const a = t * 0.8 + (k * Math.PI) / 3;
          const rr = r * (1.7 + 0.25 * Math.sin(t * 2 + k));
          return [cx + Math.cos(a) * rr, cx + Math.sin(a) * rr] as const;
        });
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
        pts.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      // rings
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        const rr = r * (1.6 + k * 0.5);
        const off = reduced ? 0 : t * (k ? -0.6 : 0.9) * (1 + energy);
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(cx, cx, rr, off, off + Math.PI * 1.4);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // orbiting dots
      for (let i = 0; i < 6; i++) {
        const a = (reduced ? 0 : t * (0.6 + i * 0.12)) + (i * Math.PI) / 3;
        const rr = r * (1.9 + (i % 3) * 0.35);
        ctx.globalAlpha = 0.5 + 0.5 * energy;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (music) {
        // spectrum-style bars around the core
        const n = 32;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = cyan;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + t * 0.3;
          const amp = (0.25 + 0.75 * Math.abs(Math.sin(t * (2 + (i % 5)) + i * 1.7))) * energy;
          const r0 = r * 1.15, r1 = r0 + r * 0.9 * amp;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (reduced) cancelAnimationFrame(raf);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size, transform: "translate3d(0,0,0)", willChange: "transform", contain: "strict" }} aria-label={`MORGAN is ${state}`} role="img" />;
}
