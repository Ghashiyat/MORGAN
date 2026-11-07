import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, Copy, Download, Mic, RotateCcw, Search, Square, Trash2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MessageResponse } from "@/components/ai-elements/message";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders } from "@/hooks/use-auth";
import { addNote } from "./notes";
import { audioFilename, MAX_CAPTURE_BYTES, recordAudio } from "@/lib/morgan/capture-audio";

export const MAX_CAPTURE_S = 900;

type Phase = "idle" | "starting" | "recording" | "processing" | "failed";
type State = { phase: Phase; startedAt: number; elapsed: number; error: string; pending: Blob | null; pendingDur: number };
let state: State = { phase: "idle", startedAt: 0, elapsed: 0, error: "", pending: null, pendingDur: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
let rec: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let cap: ReturnType<typeof setTimeout> | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let onSaved: (() => void) | null = null;

function cleanup() {
  if (cap) clearTimeout(cap);
  if (tick) clearInterval(tick);
  cap = tick = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

/** Start recording. The 15-minute cap lives here, on the capture path, not in any UI component. */
export async function startCapture() {
  if (state.phase !== "idle") return;
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) { toast.error("This browser can't record audio."); return; }
  set({ phase: "starting", error: "" });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
  } catch {
    set({ phase: "idle" });
    toast.error("Microphone permission was denied, so recording didn't start.");
    return;
  }
  try {
  rec = recordAudio(stream, (blob, error) => {
    const dur = Math.min(MAX_CAPTURE_S, Math.round((performance.now() - state.startedAt) / 1000));
    cleanup();
    rec = null;
    if (error) toast.warning(error);
    void processCapture(blob, dur);
  });
  } catch {
    cleanup();
    set({ phase: "idle", error: "" });
    toast.error("Recording could not start on this browser. Please try again.");
    return;
  }
  const startedAt = performance.now();
  set({ phase: "recording", startedAt, elapsed: 0 });
  tick = setInterval(() => set({ elapsed: Math.floor((performance.now() - startedAt) / 1000) }), 500);
  cap = setTimeout(() => {
    toast("15-minute limit reached. Recording stopped — preparing your notes.");
    stopCapture();
  }, MAX_CAPTURE_S * 1000);
  toast("MORGAN Capture is active. Recording stops automatically after 15 minutes.");
}

export function stopCapture() {
  if (rec && rec.state !== "inactive") rec.stop();
}

async function processCapture(blob: Blob, dur: number, attempt = 0) {
  set({ phase: "processing", pending: blob, pendingDur: dur });
  const fd = new FormData();
  fd.append("audio", blob, audioFilename(blob.type));
  try {
    if (!blob.size) throw new Error("The microphone did not capture audio. Please record again.");
    if (blob.size > MAX_CAPTURE_BYTES) throw new Error("This recording is too large. Save the audio below and make a shorter recording.");
    const headers = await authHeaders();
    const res = await fetch("/api/capture", { method: "POST", body: fd, headers });
    const body = (await res.json()) as { error?: string; title?: string; transcript?: string; notes?: string };
    if (!res.ok) {
      // One automatic retry on transient server/network hiccups before showing Retry.
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 2500));
        return processCapture(blob, dur, 1);
      }
      throw new Error(body.error || "Processing failed.");
    }
    if (!body.transcript?.trim()) throw new Error("No intelligible speech was detected in the recording.");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Please sign in again.");
    const { error } = await supabase.from("capture_notes").insert({ user_id: u.user.id, title: body.title || "Untitled capture", transcript: body.transcript, notes: body.notes ?? "", duration_s: dur });
    if (error) throw new Error("Notes generated but could not be saved. Retry.");
    set({ phase: "idle", pending: null });
    toast.success("Capture notes saved.");
    onSaved?.();
  } catch (e) {
    if (attempt === 0 && e instanceof TypeError) {
      // Network drop mid-upload: wait and retry once automatically.
      await new Promise((r) => setTimeout(r, 2500));
      return processCapture(blob, dur, 1);
    }
    set({ phase: "failed", error: e instanceof Error ? e.message : "Processing failed." });
  }
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const useCapture = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);

/** Small HUD chip showing live recording state; opens the panel. */
export function CaptureIndicator({ onOpen }: { onOpen: () => void }) {
  const s = useCapture();
  if (s.phase !== "recording" && s.phase !== "processing") return null;
  return (
    <button type="button" onClick={onOpen} className="hud-topbtn is-on">
      <Circle className={`mr-1 h-2.5 w-2.5 fill-destructive text-destructive ${s.phase === "recording" ? "animate-pulse" : ""}`} />
      {s.phase === "recording" ? `REC ${fmt(s.elapsed)}` : "Processing…"}
    </button>
  );
}

type Row = { id: string; title: string; transcript: string; notes: string; duration_s: number; created_at: string };

export function CapturePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useCapture();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const [edit, setEdit] = useState<string | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["capture_notes"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("capture_notes").select("id,title,transcript,notes,duration_s,created_at").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Row[];
    },
  });
  useEffect(() => { onSaved = () => void qc.invalidateQueries({ queryKey: ["capture_notes"] }); return () => { onSaved = null; }; }, [qc]);

  const list = rows.filter((r) => !q || `${r.title} ${r.notes} ${r.transcript}`.toLowerCase().includes(q.toLowerCase()));
  const cur = rows.find((r) => r.id === sel) ?? null;
  const md = (r: Row) => `# ${r.title}\n\n_${new Date(r.created_at).toLocaleString()} · ${fmt(r.duration_s)}_\n\n${r.notes}\n\n---\n\n## Transcript\n\n${r.transcript}`;
  const download = (name: string, blob: Blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  const del = async (id: string) => {
    if (!confirm("Delete this capture?")) return;
    const { error } = await supabase.from("capture_notes").delete().eq("id", id);
    if (error) toast.error("Delete failed."); else { setSel(null); void qc.invalidateQueries({ queryKey: ["capture_notes"] }); }
  };
  const saveEdit = async () => {
    if (!cur || edit === null) return;
    const { error } = await supabase.from("capture_notes").update({ notes: edit, updated_at: new Date().toISOString() }).eq("id", cur.id);
    if (error) toast.error("Save failed."); else { setEdit(null); void qc.invalidateQueries({ queryKey: ["capture_notes"] }); }
  };
  const close = (o: boolean) => {
    onOpenChange(o);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="right" className="flex w-[94vw] max-w-lg flex-col gap-3 bg-background p-4">
        <SheetTitle className="font-display tracking-[0.3em]">MORGAN CAPTURE</SheetTitle>
        <div className="hud-panel space-y-2 p-3">
          <div className="flex items-center gap-3">
            {s.phase === "recording" ? (
              <button type="button" className="hud-topbtn is-on" onClick={stopCapture}><Square className="mr-1 h-3 w-3" />Stop</button>
            ) : (
              <button type="button" className="hud-topbtn" disabled={s.phase !== "idle"} onClick={() => void startCapture()}><Mic className="mr-1 h-3 w-3" />Start recording</button>
            )}
            <span className="font-mono text-sm tabular-nums">{fmt(s.phase === "recording" ? s.elapsed : 0)} / {fmt(MAX_CAPTURE_S)}</span>
            <span className="hud-label ml-auto">{s.phase === "recording" ? "● RECORDING" : s.phase === "processing" ? "TRANSCRIBING + NOTES…" : s.phase === "failed" ? "FAILED" : s.phase === "starting" ? "MIC…" : "READY"}</span>
          </div>
          {s.phase === "recording" && <div className="h-1 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(s.elapsed / MAX_CAPTURE_S) * 100}%` }} /></div>}
          {s.phase === "failed" && s.pending && (
            <div className="space-y-2 text-xs">
              <p className="text-destructive">{s.error}</p>
              <div className="flex gap-1.5">
                <button type="button" className="hud-topbtn" onClick={() => { if (s.pending) void processCapture(s.pending, s.pendingDur); }}><RotateCcw className="mr-1 h-3 w-3" />Retry</button>
                <button type="button" className="hud-topbtn" onClick={() => { if (s.pending) download(audioFilename(s.pending.type), s.pending); }}><Download className="mr-1 h-3 w-3" />Save audio</button>
                <button type="button" className="hud-topbtn" onClick={() => set({ phase: "idle", pending: null })}>Discard</button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Audio is sent to Google Gemini for transcription, then discarded. Only the transcript and notes are saved to your account.</p>
        </div>

        {cur ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="hud-topbtn" onClick={() => { setSel(null); setEdit(null); }}>← All</button>
              <button type="button" className={`hud-topbtn ${tab === "notes" ? "is-on" : ""}`} onClick={() => setTab("notes")}>Notes</button>
              <button type="button" className={`hud-topbtn ${tab === "transcript" ? "is-on" : ""}`} onClick={() => setTab("transcript")}>Transcript</button>
              <button type="button" className="hud-topbtn" onClick={() => { addNote(cur.notes || cur.transcript); toast.success("Saved to Study notes."); }}><Save className="mr-1 h-3 w-3" />Save to Notes</button>
              <button type="button" className="hud-topbtn ml-auto" aria-label="Copy" onClick={() => void navigator.clipboard.writeText(md(cur)).then(() => toast("Copied"))}><Copy className="h-3 w-3" /></button>
              <button type="button" className="hud-topbtn" aria-label="Export Markdown" onClick={() => download(`${cur.title.replace(/[^\w-]+/g, "-")}.md`, new Blob([md(cur)], { type: "text/markdown" }))}><Download className="h-3 w-3" /></button>
              {edit === null ? <button type="button" className="hud-topbtn" aria-label="Edit" onClick={() => { setTab("notes"); setEdit(cur.notes); }}><Pencil className="h-3 w-3" /></button>
                : <button type="button" className="hud-topbtn is-on" onClick={() => void saveEdit()}><Save className="mr-1 h-3 w-3" />Save</button>}
              <button type="button" className="hud-topbtn" aria-label="Delete" onClick={() => void del(cur.id)}><Trash2 className="h-3 w-3" /></button>
            </div>
            <h3 className="text-sm font-semibold">{cur.title}</h3>
            <div className="min-h-0 flex-1 overflow-y-auto text-sm">
              {edit !== null ? <textarea className="h-full min-h-64 w-full rounded border border-border bg-transparent p-2 font-mono text-xs" value={edit} onChange={(e) => setEdit(e.target.value)} />
                : tab === "notes" ? <MessageResponse>{cur.notes || "_No notes._"}</MessageResponse>
                : <p className="whitespace-pre-wrap text-muted-foreground">{cur.transcript}</p>}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <label className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs"><Search className="h-3 w-3" /><input className="flex-1 bg-transparent outline-none" placeholder="Search captures" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {!list.length && <p className="text-xs text-muted-foreground">No captures yet. Say "MORGAN, start recording" or tap Start.</p>}
              {list.map((r) => (
                <button key={r.id} type="button" onClick={() => { setSel(r.id); setTab("notes"); }} className="hud-panel block w-full p-2 text-left">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="hud-label">{new Date(r.created_at).toLocaleString()} · {fmt(r.duration_s)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
