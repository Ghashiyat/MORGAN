import { useEffect, useState } from "react";

const KEY = "morgan:intro-played";

/**
 * Cinematic launch intro. Plays once per fresh launch (sessionStorage), skips on any
 * interaction, shortened under reduced motion, never waits on network.
 */
export function Intro() {
  const [stage, setStage] = useState<"cover" | "play" | "out" | "done">("cover");
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* private mode */
    }
    if (seen) return setStage("done");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStage("play");
    const t1 = setTimeout(() => setStage("out"), reduced ? 700 : 3500);
    const t2 = setTimeout(() => setStage("done"), reduced ? 1000 : 4100);
    const skip = () => {
      setStage("out");
      setTimeout(() => setStage("done"), 250);
    };
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, []);
  if (stage === "done") return null;
  return (
    <div aria-hidden className={`morgan-intro ${stage === "out" ? "is-out" : ""} ${stage === "play" || stage === "out" ? "is-play" : ""}`}>
      <div className="morgan-intro-scan" />
      <div className="morgan-intro-line" />
      <div className="morgan-intro-orb">
        <i className="morgan-intro-ring r1" />
        <i className="morgan-intro-ring r2" />
        <i className="morgan-intro-ring r3" />
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="morgan-intro-p" style={{ ["--a" as string]: `${i * 36}deg` }} />
        ))}
      </div>
      <div className="morgan-intro-word">MORGAN</div>
      <div className="morgan-intro-sub">PERSONAL INTELLIGENCE SYSTEM</div>
      <div className="morgan-intro-sig">BUILT BY GHASHIYAT</div>
    </div>
  );
}
