import { useEffect, useRef, useState } from "react";
import { Camera, FileText, ScanEye, Image as ImageIcon, Mic, MicOff, Plus, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { PromptInput, PromptInputButton, PromptInputTextarea, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { InputGroupAddon } from "@/components/ui/input-group";
import { MAX_FILES, prepareFile, supportedLabel, type Prepared } from "@/lib/morgan/attachments";
import { onLaunchFiles, readSharedInbox } from "@/lib/morgan/inbound";
import { useDictation } from "@/hooks/use-speech";
import { useMorgan } from "./context";
import { parseMediaIntent, songFromHistory } from "@/lib/morgan/media-intent";
import { lastMediaQuery, mediaActive, runMedia } from "./media-player";
import { briefingPrompt, cityFromTimeZone, isBriefing, parseCaptureIntent, parseTimerIntent } from "@/lib/morgan/hud-intent";
import { startCapture, stopCapture } from "./capture";
import { addTimer, cancelTimers, timerStatus } from "./timers";
import type { ChatStatus } from "ai";
import { ArLens } from "./ar-lens";
import { detectMood } from "@/lib/morgan/sense";
import { setOrbMood } from "./orb";

export function Composer({
  draftKey,
  status,
  onSend,
  onStop,
  onReadLast,
  onOpenNotes,
  recentTexts,
  allowLens,
}: {
  draftKey: string;
  status: ChatStatus;
  onSend: (text: string, files: Prepared[]) => boolean | void;
  onStop: () => void;
  onReadLast: () => void;
  onOpenNotes?: () => void;
  recentTexts?: () => string[];
  allowLens?: boolean;
}) {
  const [lens, setLens] = useState(false);
  const m = useMorgan();
  const readRef = useRef(onReadLast);
  readRef.current = onReadLast;
  useEffect(() => {
    const f = () => readRef.current();
    window.addEventListener("morgan:read-last", f);
    return () => window.removeEventListener("morgan:read-last", f);
  }, []);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Prepared[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";

  // Drafts survive reloads and offline periods.
  useEffect(() => {
    setText(localStorage.getItem(`morgan:draft:${draftKey}`) ?? "");
  }, [draftKey]);
  useEffect(() => {
    if (text) localStorage.setItem(`morgan:draft:${draftKey}`, text);
    else localStorage.removeItem(`morgan:draft:${draftKey}`);
  }, [text, draftKey]);
  // Keyboard opens only when the user taps the box — never automatically after a reply.

  const dict = useDictation((t, final) => {
    setText(t);
    // Voice emotion: the orb takes on the feeling in what was said out loud.
    if (final) setOrbMood(detectMood(t));
  });
  useEffect(() => m.setMicState(dict.state), [dict.state, m]);
  useEffect(() => {
    if (dict.state === "listening") m.setActivity("listening");
    else if (m.activity === "listening") m.setActivity("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.state]);
  useEffect(() => {
    if (m.wakeSignal) {
      m.stopSpeaking();
      dict.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.wakeSignal]);
  useEffect(() => () => dict.cancel(), [dict.cancel]);

  // Content shared from other apps or opened via "Open with MORGAN".
  useEffect(() => {
    let alive = true;
    void readSharedInbox().then((inb) => {
      if (!alive || !inb) return;
      if (inb.text) setText((t) => (t ? `${t}\n${inb.text}` : inb.text));
      if (inb.files.length) void addFiles(inb.files);
    });
    onLaunchFiles((fs) => { if (alive) void addFiles(fs); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(list: FileList | File[] | null) {
    if (!list?.length) return;
    const arr = Array.from(list).slice(0, MAX_FILES - files.length);
    if (list.length > arr.length) toast.error(`Up to ${MAX_FILES} files per message.`);
    setReading(true);
    const out = await Promise.all(arr.map(prepareFile));
    setReading(false);
    out.filter((f) => f.kind === "error").forEach((f) => toast.error(`${f.name}: ${f.kind === "error" ? f.error : ""}`));
    setFiles((p) => [...p, ...out.filter((f) => f.kind !== "error")]);
  }

  function submit() {
    const t = text.trim();
    if (busy || reading || (!t && !files.length)) return;
    if (!m.online) {
      toast.error("No internet connection. Your message is kept as a draft.");
      return;
    }
    dict.cancel();
    m.stopSpeaking();
    // Media commands run directly against the player — no AI call.
    const capture = !files.length ? parseCaptureIntent(t) : null;
    if (capture) {
      window.dispatchEvent(new Event("morgan:open-capture"));
      if (capture === "start") void startCapture(); else stopCapture();
      setText("");
      return;
    }
    const remembered = lastMediaQuery() ?? (recentTexts ? songFromHistory(recentTexts()) : null);
    const intent = !files.length ? parseMediaIntent(t, mediaActive(), remembered) : null;
    if (intent) {
      void runMedia(intent);
      setText("");
      return;
    }
    const timer = !files.length ? parseTimerIntent(t) : null;
    if (timer) {
      if (timer.kind === "timer") addTimer(timer.ms, timer.label);
      else if (timer.kind === "timer-cancel") cancelTimers();
      else timerStatus();
      setText("");
      return;
    }
    if (!files.length && isBriefing(t)) {
      const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
      if (onSend(briefingPrompt(cityFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), date), []) !== false) setText("");
      return;
    }
    if (onSend(t, files) !== false) {
      setText("");
      setFiles([]);
      // Close the phone keyboard so the reply is fully visible.
      if (window.matchMedia("(pointer: coarse)").matches) areaRef.current?.blur();
    }
  }

  const micOn = dict.state === "listening";
  return (
    <div className="w-full">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-xs">
              {f.kind === "image" ? "🖼" : "📄"} <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {micOn && <p className="hud-label mb-1 text-primary">Listening… speak now · tap the mic to finish</p>}
      {(dict.state === "denied" || dict.state === "unsupported") && (
        <p className="mb-1 text-xs text-warn">
          {dict.state === "denied" ? "Microphone permission was denied. Allow it in your browser settings." : "Voice input isn't supported in this browser."}
        </p>
      )}
      <PromptInput onSubmit={() => submit()} className="hud-input rounded-md">
        <InputGroupAddon align="inline-start" className="gap-1 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <PromptInputButton aria-label="Add photo or file" className="hud-icon">
                <Plus />
              </PromptInputButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="min-w-40">
              <DropdownMenuItem onSelect={() => camRef.current?.click()}><Camera /> Camera</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}><ImageIcon /> Pictures</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => docRef.current?.click()}><FileText /> Files</DropdownMenuItem>
              {allowLens && <DropdownMenuItem onSelect={() => setLens(true)}><ScanEye /> Live lens</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </InputGroupAddon>
        <PromptInputTextarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={m.online ? "Type..." : "No internet — draft saved"}
          className="min-h-9 py-2 sm:min-h-10"
        />
        <InputGroupAddon align="inline-end" className="gap-1 self-center">
          {micOn && (
            <PromptInputButton aria-label="Cancel recording" onClick={dict.cancel} className="hud-icon">
              <X />
            </PromptInputButton>
          )}
          {busy || text.trim() || files.length || reading ? (
            <PromptInputSubmit
              status={status}
              onStop={onStop}
              disabled={!busy && (reading || (!text.trim() && !files.length))}
              className="hud-send h-9 w-auto px-4"
            >
              {busy ? "Stop" : reading ? "Reading…" : "Send"}
            </PromptInputSubmit>
          ) : (
            <PromptInputButton
              aria-label={micOn ? "Stop listening" : "Voice message"}
              disabled={!m.prefs.voice_input || dict.state === "unsupported"}
              onClick={() => (micOn ? dict.stop() : dict.start(text))}
              className={`hud-icon ${micOn ? "border-primary text-primary" : ""}`}
            >
              {micOn ? <MicOff /> : <Mic />}
            </PromptInputButton>
          )}
        </InputGroupAddon>
      </PromptInput>
      <input ref={fileRef} type="file" multiple hidden accept="image/*" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={docRef} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.json,.docx,.pptx,.xlsx,.xls,.zip" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      {lens && <ArLens onClose={() => setLens(false)} onSend={onSend} />}
      <p className="sr-only">Supported files: {supportedLabel()}</p>
    </div>
  );
}
