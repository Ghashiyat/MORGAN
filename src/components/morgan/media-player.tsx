import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Maximize, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Square, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { searchVideos, type VideoHit } from "@/lib/media.functions";
import type { MediaIntent } from "@/lib/morgan/media-intent";

type YTPlayer = {
  loadVideoById: (id: string) => void; playVideo: () => void; pauseVideo: () => void; stopVideo: () => void;
  mute: () => void; unMute: () => void; isMuted: () => boolean; setVolume: (v: number) => void; getVolume: () => number;
  getIframe: () => HTMLIFrameElement; destroy: () => void;
};
type Phase = "idle" | "searching" | "loading" | "playing" | "paused" | "ended" | "blocked" | "error";
type State = { open: boolean; mini: boolean; phase: Phase; query: string; queue: VideoHit[]; index: number; repeat: boolean; muted: boolean; volume: number; error?: string | undefined };

let state: State = { open: false, mini: false, phase: "idle", query: "", queue: [], index: 0, repeat: false, muted: false, volume: 80 };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
let player: YTPlayer | null = null;
let searchSeq = 0;

export const mediaActive = () => state.open;
/** Last thing the user asked to play, so "play it" can refer back to it. */
export const lastMediaQuery = () => state.query || null;
export const mediaPlaying = () => state.open && state.phase === "playing";

function loadApi(): Promise<void> {
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve();
  return new Promise((res) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
    if (!document.getElementById("yt-api")) {
      const s = document.createElement("script");
      s.id = "yt-api"; s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

function playIndex(i: number) {
  const v = state.queue[i];
  if (!v) return;
  set({ index: i, phase: "loading", error: undefined });
  player?.loadVideoById(v.id);
}

export async function runMedia(intent: MediaIntent) {
  if (intent.kind === "nowplaying") {
    const cur = state.queue[state.index];
    toast(cur ? `Now playing: ${cur.title}` : "Nothing is playing.");
    return;
  }
  if (intent.kind === "queue") {
    if (!state.open || !state.queue.length) return runMedia({ kind: "play", query: intent.query });
    try {
      const r = await searchVideos({ data: { query: intent.query } });
      const hit = r.results.find((v) => !state.queue.some((q) => q.id === v.id));
      if (!hit) { toast("Couldn't find that to queue."); return; }
      const q = [...state.queue];
      q.splice(state.index + 1, 0, hit);
      set({ queue: q });
      toast(`Up next: ${hit.title}`);
    } catch { toast("Couldn't reach video search."); }
    return;
  }
  if (intent.kind === "play") {
    const seq = ++searchSeq;
    set({ open: true, mini: false, phase: "searching", query: intent.query, error: undefined });
    try {
      const r = await searchVideos({ data: { query: intent.query } });
      if (seq !== searchSeq) return; // superseded by a newer request
      if (!r.results.length) {
        const msg = r.error === "quota" ? "Video search limit reached for now." : r.error === "not_configured" ? "Video search isn't set up yet." : r.error === "timeout" ? "Video search timed out." : "No videos found.";
        set({ phase: "error", queue: [], error: msg });
        return;
      }
      set({ queue: r.results, index: 0 });
      if (player) playIndex(0); else set({ phase: "loading" });
    } catch {
      if (seq === searchSeq) set({ phase: "error", error: "Couldn't reach video search. Check your connection." });
    }
    return;
  }
  if (!state.open && intent.action !== "stop") { toast("Nothing is playing."); return; }
  switch (intent.action) {
    case "pause": player?.pauseVideo(); break;
    case "resume": player?.playVideo(); break;
    case "stop": searchSeq++; player?.stopVideo(); set({ open: false, phase: "idle" }); break;
    case "next": if (state.index + 1 < state.queue.length) playIndex(state.index + 1); else toast("End of the queue."); break;
    case "previous": playIndex(Math.max(0, state.index - 1)); break;
    case "mute": player?.mute(); set({ muted: true }); break;
    case "unmute": player?.unMute(); set({ muted: false }); break;
    case "volup": case "voldown": {
      const v = Math.max(0, Math.min(100, state.volume + (intent.action === "volup" ? 15 : -15)));
      player?.setVolume(v); player?.unMute(); set({ volume: v, muted: false }); break;
    }
    case "fullscreen": void player?.getIframe().requestFullscreen?.().catch(() => toast("Fullscreen was blocked by the browser.")); break;
    case "exitfullscreen": if (document.fullscreenElement) void document.exitFullscreen(); break;
    case "repeat": set({ repeat: !state.repeat }); toast(state.repeat ? "Repeat on" : "Repeat off"); break;
    case "shuffle": {
      const cur = state.queue[state.index];
      const rest = state.queue.filter((_, i) => i !== state.index).sort(() => Math.random() - 0.5);
      if (cur) set({ queue: [cur, ...rest], index: 0 }); break;
    }
    case "clear": { const cur = state.queue[state.index]; set({ queue: cur ? [cur] : [], index: 0 }); break; }
  }
}

const ERR: Record<number, string> = { 2: "That video link is invalid.", 5: "This video can't play in the browser.", 100: "This video was removed or is private.", 101: "The owner doesn't allow this video to play outside YouTube.", 150: "The owner doesn't allow this video to play outside YouTube." };

export function MediaPlayer() {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const cur = s.queue[s.index];

  // Create one player when the first result arrives; reuse it afterwards.
  useEffect(() => {
    if (!s.open || !cur || player || !host.current) return;
    let alive = true;
    void loadApi().then(() => {
      if (!alive || !host.current) return;
      const YT = (window as unknown as { YT: { Player: new (el: HTMLElement, o: unknown) => YTPlayer } }).YT;
      const el = document.createElement("div");
      host.current.appendChild(el);
      let started = false;
      player = new YT.Player(el, {
        videoId: cur.id, width: "100%", height: "100%",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            setReady(true); e.target.setVolume(state.volume); e.target.playVideo();
            // If nothing started shortly, the browser blocked autoplay.
            setTimeout(() => { if (!started && state.phase === "loading") set({ phase: "blocked" }); }, 2500);
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) {
              const first = state.phase !== "playing" && state.phase !== "paused";
              started = true; set({ phase: "playing" });
              if (first && state.queue[state.index]) toast(`Playing ${state.queue[state.index]!.title}`);
            } else if (e.data === 2) set({ phase: "paused" });
            else if (e.data === 0) {
              if (state.repeat) player?.playVideo();
              else if (state.index + 1 < state.queue.length) playIndex(state.index + 1);
              else set({ phase: "ended" });
            }
          },
          onError: (e: { data: number }) => {
            const msg = ERR[e.data] ?? "This video couldn't be played.";
            // Skip to the next result once instead of retrying a permanent failure.
            if (state.index + 1 < state.queue.length) { toast(`${msg} Trying the next one.`); playIndex(state.index + 1); }
            else set({ phase: "error", error: msg });
          },
        },
      });
    });
    return () => { alive = false; };
  }, [s.open, cur]);

  useEffect(() => {
    if (!s.open && player) { player.destroy(); player = null; setReady(false); if (host.current) host.current.innerHTML = ""; }
  }, [s.open]);

  if (!s.open) return null;
  const status = { idle: "", searching: `Searching “${s.query}”…`, loading: "Loading…", playing: "Playing", paused: "Paused", ended: "Ended", blocked: "Tap play to start", error: s.error ?? "Error" }[s.phase];
  const btn = "hud-icon grid h-8 w-8 place-items-center rounded-md border border-border hover:border-primary hover:text-primary disabled:opacity-40";

  return (
    <div className={`hud-panel fixed z-40 overflow-hidden shadow-2xl transition-all ${s.mini ? "top-14 right-2 w-64 sm:top-auto sm:bottom-3 sm:right-3" : "top-14 right-2 w-[min(92vw,420px)] sm:top-16 sm:right-3"} max-sm:[&_ul]:max-h-24`} role="region" aria-label="Media player">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={`h-1.5 w-1.5 rounded-full ${s.phase === "playing" ? "bg-primary animate-pulse" : s.phase === "error" ? "bg-destructive" : "bg-warn"}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{cur?.title ?? s.query}</p>
          <p className="hud-label truncate">{status}</p>
        </div>
        <button type="button" aria-label={s.mini ? "Expand player" : "Minimize player"} className={btn} onClick={() => set({ mini: !s.mini })}>{s.mini ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        <button type="button" aria-label="Close player" className={btn} onClick={() => void runMedia({ kind: "control", action: "stop" })}><X className="h-4 w-4" /></button>
      </div>
      <div className={`relative aspect-video bg-background ${s.mini ? "h-0 overflow-hidden" : ""}`}>
        <div ref={host} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
        {(!ready || s.phase === "searching") && cur && <img src={cur.thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
        {s.phase === "searching" && <div className="absolute inset-0 grid place-items-center hud-label">Searching…</div>}
        {s.phase === "blocked" && (
          <button type="button" className="absolute inset-0 grid place-items-center bg-background/60" onClick={() => player?.playVideo()} aria-label="Play">
            <span className="hud-send flex items-center gap-2 px-4 py-2"><Play className="h-4 w-4" /> Play</span>
          </button>
        )}
        {s.phase === "error" && (
          <div className="absolute inset-0 grid place-items-center gap-2 bg-background/85 p-4 text-center text-xs">
            <p className="text-warn">{s.error}</p>
            <a className="hud-chip inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer" href={cur ? `https://www.youtube.com/watch?v=${cur.id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(s.query)}`}>
              <ExternalLink className="h-3 w-3" /> Open on YouTube
            </a>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-1.5 px-2 py-2">
        <button type="button" aria-label="Previous" className={btn} disabled={s.index === 0} onClick={() => void runMedia({ kind: "control", action: "previous" })}><SkipBack className="h-4 w-4" /></button>
        {s.phase === "playing"
          ? <button type="button" aria-label="Pause" className={btn} onClick={() => player?.pauseVideo()}><Pause className="h-4 w-4" /></button>
          : <button type="button" aria-label="Play" className={btn} disabled={!ready} onClick={() => player?.playVideo()}><Play className="h-4 w-4" /></button>}
        <button type="button" aria-label="Stop" className={btn} onClick={() => { player?.stopVideo(); set({ phase: "paused" }); }}><Square className="h-4 w-4" /></button>
        <button type="button" aria-label="Next" className={btn} disabled={s.index + 1 >= s.queue.length} onClick={() => void runMedia({ kind: "control", action: "next" })}><SkipForward className="h-4 w-4" /></button>
        <button type="button" aria-label={s.muted ? "Unmute" : "Mute"} className={btn} onClick={() => void runMedia({ kind: "control", action: s.muted ? "unmute" : "mute" })}>{s.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
        <input type="range" min={0} max={100} value={s.volume} aria-label="Volume" className="w-16 accent-primary" onChange={(e) => { const v = +e.target.value; player?.setVolume(v); set({ volume: v }); }} />
        <button type="button" aria-label="Repeat" className={`${btn} ${s.repeat ? "text-primary border-primary" : ""}`} onClick={() => set({ repeat: !s.repeat })}><Repeat className="h-4 w-4" /></button>
        <button type="button" aria-label="Shuffle" className={btn} onClick={() => void runMedia({ kind: "control", action: "shuffle" })}><Shuffle className="h-4 w-4" /></button>
        <button type="button" aria-label="Fullscreen" className={`${btn} hidden sm:grid`} onClick={() => void runMedia({ kind: "control", action: "fullscreen" })}><Maximize className="h-4 w-4" /></button>
      </div>
      {!s.mini && s.queue.length > 1 && (
        <ul className="max-h-36 overflow-y-auto border-t border-border px-2 py-1 text-xs">
          {s.queue.map((v, i) => (
            <li key={v.id}>
              <button type="button" className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-secondary ${i === s.index ? "text-primary" : "text-muted-foreground"}`} onClick={() => playIndex(i)}>
                <img src={v.thumb} alt="" className="h-6 w-10 shrink-0 rounded object-cover" loading="lazy" />
                <span className="truncate">{v.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
