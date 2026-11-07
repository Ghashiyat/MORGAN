import { useState } from "react";
import { Download, FileText, Loader2, Presentation, RefreshCw } from "lucide-react";
import { THEMES, type Deck } from "@/lib/morgan/deck-engine";
import { downloadDeck } from "@/lib/morgan/deck-file";

const LAYOUT_LABEL: Record<string, string> = {
  cover: "Cover",
  section: "Section",
  bullets: "Points",
  bento: "Cards",
  split: "Split",
  stats: "Stats",
  timeline: "Timeline",
  quote: "Quote",
  cta: "Close",
  visual: "Photo",
};

/** In-chat presentation card: theme, slide rundown, watermark setting, real .PPTX / .PDF downloads, remake. */
export function DeckCard({ deck }: { deck: Deck }) {
  const th = THEMES[deck.theme] ?? THEMES.obsidian;
  const [busy, setBusy] = useState<null | "pptx" | "pdf">(null);
  const [made, setMade] = useState<null | "pptx" | "pdf">(null);
  const [err, setErr] = useState<string | null>(null);
  const [mark, setMark] = useState(deck.watermark !== false);
  const [remaking, setRemaking] = useState(false);

  const get = async (f: "pptx" | "pdf") => {
    if (busy) return;
    setBusy(f);
    setErr(null);
    setMade(null);
    try {
      await downloadDeck(deck, f, { watermark: mark });
      setMade(f);
    } catch {
      setErr(f === "pdf" ? "The PDF couldn't be built here. The .PPTX still works — try it, or retry the PDF." : "The PowerPoint couldn't be built here. Tap it again to retry.");
    } finally {
      setBusy(null);
    }
  };

  const remake = () => {
    if (remaking) return;
    setRemaking(true);
    window.dispatchEvent(new CustomEvent("morgan:deck-action", { detail: mark ? "Remake it with a completely new design" : "Remake it with a completely new design, without the watermark" }));
  };

  const hl = (f: "pptx" | "pdf") => (deck.format === f ? " is-on" : "");

  return (
    <div className="hud-panel mt-3 w-full overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border px-3 py-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-primary/40 text-primary">
          <Presentation className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="hud-label">Deck ready · {th.name} · v{deck.version ?? 1}</p>
          <p className="line-clamp-2 text-sm font-semibold text-foreground">{deck.title}</p>
          {deck.subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{deck.subtitle}</p>}
        </div>
        <div className="ml-auto flex shrink-0 gap-1" aria-hidden>
          {[th.bg, th.panel, th.accent, th.accent2].map((c) => (
            <span key={c} className="h-4 w-2 rounded-sm border border-border" style={{ background: c }} />
          ))}
        </div>
      </div>

      <ol className="max-h-32 overflow-y-auto px-3 py-2">
        {deck.slides.map((s, i) => (
          <li key={i} className="flex items-baseline gap-2 py-0.5 text-xs">
            <span className="hud-label shrink-0">{String(i + 1).padStart(2, "0")}</span>
            <span className="shrink-0 rounded border border-border px-1 text-[0.6rem] uppercase tracking-wider text-muted-foreground">{LAYOUT_LABEL[s.layout] ?? s.layout}</span>
            <span className="truncate text-foreground/80">{s.title || s.body || "Slide"}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <span className="hud-label">Watermark</span>
        <button type="button" role="switch" aria-checked={mark} aria-label="MORGAN watermark" className={`hud-chip${mark ? " is-on" : ""}`} onClick={() => setMark((v) => !v)}>
          {mark ? "Include MORGAN watermark" : "Without watermark"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
        <button type="button" className={`hud-chip flex items-center gap-1.5${hl("pptx")}`} onClick={() => void get("pptx")} disabled={busy !== null}>
          {busy === "pptx" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Download .PPTX
        </button>
        <button type="button" className={`hud-chip flex items-center gap-1.5${hl("pdf")}`} onClick={() => void get("pdf")} disabled={busy !== null}>
          {busy === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} Download .PDF
        </button>
        <button type="button" className="hud-chip flex items-center gap-1.5" onClick={remake} disabled={remaking}>
          <RefreshCw className={`h-3 w-3${remaking ? " animate-spin" : ""}`} /> Remake design
        </button>
        <span className="hud-label ml-auto">{deck.slides.length} slides</span>
      </div>
      {busy && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Building and checking the {busy === "pptx" ? "PowerPoint" : "PDF"}…</p>}
      {err && <p className="border-t border-border px-3 py-2 text-xs text-warn">{err}</p>}
      {!err && !busy && made && <p className="border-t border-border px-3 py-2 text-xs text-primary">Saved as {made === "pptx" ? ".PPTX" : ".PDF"}{mark ? "" : " (no watermark)"} — check your downloads.</p>}
    </div>
  );
}
