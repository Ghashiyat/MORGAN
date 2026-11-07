import { toast } from "sonner";
import { addNote } from "./notes";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Globe, Download, BookmarkPlus } from "lucide-react";
import { authHeaders } from "@/hooks/use-auth";
import { cache } from "@/hooks/use-prefs";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { Prepared } from "@/lib/morgan/attachments";
import { recordMetric } from "@/lib/morgan/telemetry";
import { Composer } from "./composer";
import { pending, useMorgan, type ThreadFile } from "./context";
import { Orb } from "./orb";
import { MorganPet } from "./pet";
import { buddyName } from "@/lib/morgan/areeba";
import { extractPlayTag, sniffPlayingProse, asksToPlay } from "@/lib/morgan/media-intent";
import { runMedia } from "./media-player";
import { DeckCard } from "./deck-card";
import { parseTranslate } from "@/lib/morgan/sense";
import type { Deck } from "@/lib/morgan/deck-engine";

export function toParts(text: string, files: Prepared[]): UIMessage["parts"] {
  const parts: UIMessage["parts"] = [];
  for (const f of files) {
    if (f.kind === "image") parts.push({ type: "file", mediaType: f.mime, filename: f.name, url: f.dataUrl });
    if (f.kind === "text") parts.push({ type: "data-attachment", data: { name: f.name, mime: f.mime, size: f.size, text: f.text, note: f.note } } as never);
  }
  if (text) parts.push({ type: "text", text });
  return parts;
}

// Any other internal action marker ("[[DECK_REMAKE]]" etc.) is never shown to the user.
const INTERNAL_TAG = /\[\[\s*[A-Z][A-Z_]{2,}(?:\s*:[^\]]*)?\s*\]\]\s*/g;
const OFFLINE_TAG = /\[\[\s*OFFLINE_DOWNLOAD\s*\]\]\s*/gi;
const msgText = (m: UIMessage) => extractPlayTag(m.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n")).clean.replace(OFFLINE_TAG, "").replace(INTERNAL_TAG, "").trim();
function deviceState() {
  return { hour: new Date().getHours() };
}
const rawText = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");

function SaveNoteButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="hud-label flex items-center gap-1 hover:text-primary" aria-label="Save to notes"
      onClick={() => { addNote(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>
      {ok ? <Check className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />} {ok ? "Saved" : "Save note"}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="hud-label flex items-center gap-1 hover:text-primary"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {ok ? "Copied" : "Copy"}
    </button>
  );
}

const relay = (u: string) => `/api/img?u=${encodeURIComponent(u)}`;

async function saveImage(url: string, name: string) {
  for (const src of [relay(url), url]) {
    try {
      const res = await fetch(src);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) continue;
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    } catch { /* try next */ }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function GridImage({ u, alt, onFail }: { u: string; alt: string; onFail: () => void }) {
  const [src, setSrc] = useState(() => relay(u));
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" onError={() => (src === u ? onFail() : setSrc(u))} />;
}

function ImageGrid({ subject, urls }: { subject: string; urls: string[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const safe = subject.replace(/[^\w-]+/g, "-").slice(0, 40) || "image";
  const shown = urls.filter((u) => !hidden.has(u));
  if (!shown.length) return <p className="mt-2 text-xs text-muted-foreground">The pictures couldn't load here. Ask again and I'll fetch fresh ones.</p>;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {shown.map((u, i) => (
        <figure key={u} className="group/img relative overflow-hidden rounded-md border border-primary/30 bg-muted">
          <a href={u} target="_blank" rel="noopener noreferrer">
            <GridImage u={u} alt={`${subject} ${i + 1}`} onFail={() => setHidden((s) => new Set(s).add(u))} />
          </a>
          <button type="button" aria-label="Download image" onClick={() => void saveImage(u, `${safe}-${i + 1}`)} className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-background/80 px-2 py-1 text-xs text-primary backdrop-blur hover:bg-background">
            <Download className="h-3 w-3" /> Save
          </button>
        </figure>
      ))}
    </div>
  );
}

export function StageFrame({ children, orb }: { children: React.ReactNode; orb: React.ReactNode }) {
  return (
    <section className="hud-stage relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hud-stage-deco" style={{ transform: "translateZ(0)", contain: "strict" }} aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-2 z-0 flex justify-center opacity-40" style={{ transform: "translateZ(0)" }} aria-hidden>
        <span className="relative inline-flex items-center justify-center">
          <span className="orb-blush" />
          <span className="relative z-10">{orb}</span>
        </span>
      </div>
      {children}
    </section>
  );
}

// Memoized: finished messages keep the same object reference, so only the streaming one re-renders.
const ChatMessage = memo(function ChatMessage({ msg }: { msg: UIMessage }) {
  const text = msgText(msg);
  const sources = msg.parts.filter((p) => p.type === "source-url") as Array<{ url: string; title?: string }>;
  const deck = (msg.parts.find((p) => p.type === "data-deck") as { data?: Deck } | undefined)?.data;
  const meta = msg.parts.find((p) => p.type === "data-meta") as { data?: { latencyMs: number; firstTokenMs?: number | null; totalMs?: number; memoriesUsed?: string[] } } | undefined;
  if (msg.role === "user")
    return (
      <Message from="user" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80px" }}>
        <p className="hud-label text-right">You</p>
        <MessageContent className="hud-user">
          {msg.parts.map((p, i) =>
            p.type === "file" ? (
              p.url ? <img key={i} src={p.url} alt={p.filename ?? "attachment"} loading="lazy" decoding="async" className="max-h-48 rounded" /> : <span key={i} className="text-xs">🖼 {p.filename}</span>
            ) : p.type === "data-attachment" ? (
              <span key={i} className="text-xs text-muted-foreground">📄 {(p.data as ThreadFile).name}</span>
            ) : null,
          )}
          {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
        </MessageContent>
      </Message>
    );
  return (
    <Message from="assistant" className="max-w-full" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}>
      <p className="hud-label flex flex-wrap items-center gap-x-2 gap-y-1">
        Morgan
        {msg.parts.some((p) => p.type === "data-local") && <span className="ml-2 rounded border border-primary/40 px-1.5 py-0.5 text-primary">🤖 Local Backup</span>}
        {(() => { const sp = msg.parts.find((p) => p.type === "data-localspeed") as { data?: { path: string; wps: number; firstMs: number } } | undefined; return sp?.data ? <span className="ml-2 font-mono text-[10px] text-muted-foreground">{sp.data.path === "webgpu" ? "GPU" : "CPU"} · {sp.data.wps} words/s · first word {(sp.data.firstMs / 1000).toFixed(1)}s</span> : null; })()}
      </p>
      <MessageContent className="hud-assistant">
        <MessageResponse>{text}</MessageResponse>
        {(() => {
          const imgs = (msg.parts.find((p) => p.type === "data-images") as { data?: { subject: string; urls: string[] } } | undefined)?.data;
          return imgs?.urls.length ? <ImageGrid subject={imgs.subject} urls={imgs.urls} /> : null;
        })()}
        {sources.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <p className="hud-label mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> Sources</p>
            <ol className="space-y-0.5 text-xs">
              {sources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                    [{i + 1}] {s.title ?? s.url}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
        {deck && <DeckCard deck={deck} />}
      </MessageContent>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CopyButton text={text} />
        {text && <SaveNoteButton text={text} />}
        {meta?.data && (
          <span className="hud-label">
            {meta.data.firstTokenMs != null ? `First ${meta.data.firstTokenMs}ms · ` : ""}Total {meta.data.totalMs ?? meta.data.latencyMs}ms
            {meta.data.memoriesUsed?.length ? ` · ${meta.data.memoriesUsed.length} memory` : ""}
          </span>
        )}
      </div>
    </Message>
  );
});

export function ChatSession({ threadId, initialMessages }: { threadId: string; initialMessages: UIMessage[] }) {
  const m = useMorgan();
  const qc = useQueryClient();
  const modes = useRef(m.local);
  const lastUserText = useRef<string>("");
  const playbackContext = useRef("");
  const lensPending = useRef(false);
  const finishLens = (result: { text?: string; error?: string }) => {
    if (!lensPending.current) return;
    lensPending.current = false;
    window.dispatchEvent(new CustomEvent("morgan:lens-result", { detail: result }));
  };
  modes.current = m.local;
  const buddyRef = useRef("");
  buddyRef.current = buddyName((m.prefs.personality as { buddy_name?: unknown } | null)?.buddy_name);
  const [phase, setPhase] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Offline: skip the sign-in refresh (it needs internet); the on-device brain doesn't need it.
        headers: () =>
          typeof navigator !== "undefined" && navigator.onLine === false
            ? {}
            : Promise.race([authHeaders(), new Promise<Record<string, string>>((r) => setTimeout(() => r({}), 8000))]).catch(() => ({})),
        prepareSendMessagesRequest: ({ messages, headers }) => ({
          ...(headers ? { headers } : {}),
          body: { messages, threadId, areebaUserId: m.userId, studyNotes: modes.current.studyNotes, direct: modes.current.direct, companion: !!modes.current.companion, buddyName: buddyRef.current, device: deviceState() },
        }),
      }),
    [threadId],
  );

  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: () => finishLens({ error: "Couldn't read this photo. Check your connection and scan again." }),
    onData: (d) => {
      if (d.type === "data-status") {
        const ph = (d.data as { phase: string }).phase;
        setPhase(ph);
        m.setActivity(ph === "searching" ? "researching" : "thinking");
      }
      if (d.type === "data-memory") {
        qc.invalidateQueries({ queryKey: ["memories"] });
        const learned = (d.data as { learned?: string[] } | undefined)?.learned;
        if (learned?.length) toast("✦ Memory captured", { description: learned[0], duration: 2500 });
      }
      if (d.type === "data-areeba") window.dispatchEvent(new CustomEvent("morgan:areeba", { detail: d.data }));
    },
    onFinish: ({ message, isAbort, isError }) => {
      setPhase(null);
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (isAbort || isError) { finishLens({ error: "The scan stopped. Please try again." }); return; }
      const localOnly = message.parts.some((p) => p.type === "data-local");
      finishLens(localOnly ? { error: "Lens needs internet to read photos." } : { text: msgText(message) });
      const meta = message.parts.find((p) => p.type === "data-meta") as { data?: { firstTokenMs?: number | null; totalMs?: number; memoriesUsed?: string[]; diag?: { route: "ai" | "companion"; prepMs: number; memoryMs: number; searchMs: number | null; enginesTried: number; enginesFailed: number } } } | undefined;
      const dg = meta?.data?.diag;
      if (dg) {
        recordMetric({ at: Date.now(), route: dg.route, prepMs: dg.prepMs, memoryMs: dg.memoryMs, searchMs: dg.searchMs, firstTokenMs: meta.data?.firstTokenMs ?? null, totalMs: dg.prepMs + (meta.data?.totalMs ?? 0), enginesTried: dg.enginesTried, enginesFailed: dg.enginesFailed, memoriesUsed: meta.data?.memoriesUsed?.length ?? 0 });
      }
      const tag = extractPlayTag(rawText(message)).query ?? sniffPlayingProse(rawText(message));
      if (tag && asksToPlay(lastUserText.current ?? "", playbackContext.current)) void runMedia({ kind: "play", query: tag });
      const t = msgText(message);
      if (t) {
        m.setLastReply(t);
        window.dispatchEvent(new CustomEvent("morgan:reply", { detail: t }));
        const asked = lastUserText.current;
        const tr = asked ? parseTranslate(asked) : null;
        if (m.prefs.voice_output && m.prefs.auto_speak) m.speak(t, tr ? { lang: tr.code } : undefined);
      }
    },
  });

  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    m.setLlmStatus(error ? "error" : busy ? "busy" : "ready");
    if (busy) {
      if (m.activity !== "researching") m.setActivity("thinking");
    } else if (m.activity === "thinking" || m.activity === "researching") m.setActivity(error ? "error" : "idle");
    if (error) setDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, error]);
  // Daily reading: after 45s idle, ask the server once per day to refresh today's news digest.
  useEffect(() => {
    if (busy) return;
    const day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("morgan-digest-day") === day) return;
    const t = setTimeout(async () => {
      localStorage.setItem("morgan-digest-day", day);
      try { await fetch("/api/digest", { method: "POST", headers: await authHeaders() }); } catch { /* ignore */ }
    }, 45_000);
    return () => clearTimeout(t);
  }, [busy]);
  useEffect(() => {
    if (m.speaking) m.setActivity("speaking");
    else if (m.activity === "speaking") m.setActivity("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.speaking]);

  // Offline cache + Files list + last reply.
  useEffect(() => {
    if (status === "ready") cache.set(`msgs:${m.userId}:${threadId}`, messages);
    const files: ThreadFile[] = [];
    for (const msg of messages)
      for (const p of msg.parts) {
        if (p.type === "data-attachment") {
          const a = p.data as ThreadFile;
          files.push({ name: a.name, size: a.size, mime: a.mime });
        } else if (p.type === "file") files.push({ name: p.filename ?? "image", size: 0, mime: p.mediaType });
      }
    m.setThreadFiles(files);
    const lastA = [...messages].reverse().find((x) => x.role === "assistant");
    if (lastA) m.setLastReply(msgText(lastA));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status, threadId]);

  // First message handed off from the new-chat screen.
  useEffect(() => {
    if (pending.threadId !== threadId) return;
    // Deferred so a StrictMode remount can't send twice or orphan the request.
    const t = setTimeout(() => {
      if (pending.threadId !== threadId) return;
      const { text = "", files = [] } = pending;
      pending.threadId = undefined;
      lastUserText.current = text;
      playbackContext.current = "";
      window.dispatchEvent(new CustomEvent("morgan:user", { detail: text }));
      m.setActivity("thinking");
      void sendMessage({ parts: toParts(text, files as Prepared[]) } as never);
    }, 0);
    return () => clearTimeout(t);
  }, [threadId, sendMessage]);

  const send = useCallback(
    (text: string, files: Prepared[]) => {
      if (busyRef.current) return false;
      if (error) clearError();
      lensPending.current = text.startsWith("Live lens:") && files.some((f) => f.kind === "image");
      lastUserText.current = text;
      const previousAssistant = [...messages].reverse().find((entry) => entry.role === "assistant");
      playbackContext.current = previousAssistant ? rawText(previousAssistant) : "";
      window.dispatchEvent(new CustomEvent("morgan:user", { detail: text }));
      m.setActivity("thinking");
      void sendMessage({ parts: toParts(text, files) } as never);
      return true;
    },
    [sendMessage, error, clearError, messages],
  );

  // Deck card buttons ("Remake design") send a normal chat message, so it runs the real pipeline.
  const busyRef = useRef(false);
  busyRef.current = status === "submitted" || status === "streaming";
  useEffect(() => {
    const f = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (!text || busyRef.current) return; // repeated taps while a job runs are ignored
      send(text, []);
    };
    window.addEventListener("morgan:deck-action", f);
    return () => window.removeEventListener("morgan:deck-action", f);
  }, [send]);

  const lastReply = [...messages].reverse().find((x) => x.role === "assistant");

  // Keyboard open/close: when the visible area shrinks, keep the newest messages in view (one rAF-batched write, no layout reads per frame).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    let lastH = vv.height;
    const onResize = () => {
      const shrank = vv.height < lastH;
      lastH = vv.height;
      if (!shrank) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.querySelector('[role="log"]')?.firstElementChild as HTMLElement | null;
        if (el) el.scrollTop = el.scrollHeight;
      });
    };
    vv.addEventListener("resize", onResize);
    return () => { vv.removeEventListener("resize", onResize); cancelAnimationFrame(raf); };
  }, []);

  return (
    <StageFrame orb={<Orb state={m.activity} />}>
      <Conversation className="relative z-10 min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-4xl gap-5 px-3 pt-4 pb-4 sm:px-8">
          {messages.length === 0 && <Welcome />}
          {messages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)}
          {status === "submitted" && (
            <Message from="assistant">
              <p className="hud-label">Morgan</p>
              <MessageContent className="hud-assistant">
                <Shimmer>{phase === "searching" ? "Researching the live web…" : "Processing…"}</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && !dismissed && (
            <div>
              <p className="hud-label mb-1">System alert</p>
              <div className="hud-alert">{friendlyError(error)}</div>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="relative z-10 mx-auto w-full max-w-4xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
        <MorganPet />
        {error && !dismissed && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-warn">{friendlyError(error)}</p>
            <div className="flex gap-2">
              <button type="button" className="hud-chip" onClick={() => { clearError(); void regenerate(); }} disabled={!m.online}>Retry</button>
              <button type="button" className="hud-chip" onClick={() => { setDismissed(true); clearError(); }}>Dismiss</button>
            </div>
          </div>
        )}
        <Composer
          draftKey={threadId}
          status={status}
          onSend={send}
          allowLens
          onStop={() => void stop()}
          onReadLast={() => lastReply && m.speak(msgText(lastReply))}
          recentTexts={() => messages.slice(-8).map(rawText)}
        />
      </div>
    </StageFrame>
  );
}

export function friendlyError(e: Error) {
  const s = e.message;
  if (/Failed to fetch|NetworkError|network/i.test(s)) return "Connection lost. Your message is saved; retry when you're back online.";
  if (/sign in/i.test(s) || /"auth"/.test(s)) return "Your session expired. Please sign in again.";
  if (/rate_limit|Slow down/i.test(s)) return "Slow down a little — try again in a minute.";
  if (/too_large|too large/i.test(s)) return "That attachment is too large to send.";
  if (/"config"|No AI provider/i.test(s)) return "MORGAN's AI services aren't configured on the server yet.";
  return "I'm temporarily unable to answer. Your message is saved; please try again.";
}

export function Welcome() {
  return (
    <div className="mx-auto mt-6 max-w-md text-center">
      <p className="hud-label">Sys.core online</p>
      <h2 className="mt-2 font-display text-xl tracking-[0.25em] text-primary">MORGAN</h2>
      <p className="mt-2 text-sm text-muted-foreground">Good to have you back Boss ..</p>
    </div>
  );
}
