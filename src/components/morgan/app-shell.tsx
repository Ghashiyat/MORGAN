import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { TimerDock } from "./timers";
import { NotesPanel } from "./notes";
import { CaptureIndicator, CapturePanel } from "./capture";
import { Link } from "@tanstack/react-router";
import { BuddyNamePrompt } from "./buddy-name";
import { Menu } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLocalPrefs, useOnline, usePrefs } from "@/hooks/use-prefs";
import { useSpeaker, useWakeWord, type MicState, type VoiceSettings } from "@/hooks/use-speech";
import { Ctx, useMorgan, type MorganCtx, type ThreadFile } from "./context";
import { SessionsPanel } from "./sessions-panel";
import { MorganDialog, useMemories, type DialogId } from "./dialogs";
import type { OrbState } from "./orb";

export function AppShell({ session, activeId, children }: { session: Session; activeId?: string; children: ReactNode }) {
  const userId = session.user.id;
  const { prefs, update, loaded } = usePrefs(userId);
  const [local, setLocal] = useLocalPrefs();
  const online = useOnline();
  const speaker = useSpeaker({ gender: prefs.voice_gender as "male" | "female", voiceName: prefs.voice_name, enabled: prefs.voice_output, settings: (prefs.voice_settings ?? {}) as VoiceSettings });
  const [activity, setActivity] = useState<OrbState>("idle");
  const [llm, setLlm] = useState<"ready" | "error" | "busy">("ready");
  const [threadFiles, setThreadFiles] = useState<ThreadFile[]>([]);
  const [, setLastReply] = useState("");
  const [micState, setMicState] = useState<MicState>("idle");
  const [wakeSignal, setWake] = useState(0);
  const [dialog, setDialog] = useState<DialogId>(null);
  const [menu, setMenu] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  useEffect(() => {
    const f = () => setCaptureOpen(true);
    window.addEventListener("morgan:open-capture", f);
    return () => window.removeEventListener("morgan:open-capture", f);
  }, []);
  const speak = speaker.speak;
  const onTimerDone = useCallback((label: string) => { if (prefs.voice_output) speak(`${label} complete.`); }, [prefs.voice_output, speak]);
  useEffect(() => {
    const f = () => setNotesOpen(true);
    window.addEventListener("morgan:open-notes", f);
    return () => window.removeEventListener("morgan:open-notes", f);
  }, []);
  const { data: mems = [] } = useMemories();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    void supabase.rpc("has_role", { _user_id: userId, _role: "admin" }).then(({ data }) => setIsAdmin(data === true));
  }, [userId]);

  useWakeWord(local.wakeWord && prefs.voice_input, micState === "listening" || speaker.speaking, useCallback(() => setWake((n) => n + 1), []));

  const ctx: MorganCtx = useMemo(
    () => ({
      userId, prefs, updatePrefs: update, local, setLocal, online,
      speak: speaker.speak, stopSpeaking: speaker.stop, speaking: speaker.speaking, speechSupported: speaker.supported, voices: speaker.voices,
      activity, setActivity, setLlmStatus: setLlm, setThreadFiles, threadFiles, setLastReply, micState, setMicState, wakeSignal,
    }),
    [userId, prefs, update, local, setLocal, online, speaker, activity, threadFiles, micState, wakeSignal],
  );

  const status = !online ? ["OFFLINE", "bg-warn"] : llm === "error" ? ["ATTENTION", "bg-destructive"] : activity === "listening" ? ["LISTENING", "bg-primary"] : activity === "researching" ? ["RESEARCHING", "bg-primary"] : activity === "thinking" ? ["PROCESSING", "bg-warn"] : speaker.speaking ? ["SPEAKING", "bg-primary"] : ["ONLINE", "bg-primary"];
  const name = (session.user.user_metadata?.["full_name"] as string | undefined) ?? session.user.email ?? "You";

  const left = (
    <>
      <SessionsPanel userId={userId} activeId={activeId} onNavigate={() => setMenu(false)} />
      <div className="hud-panel flex items-center gap-2 p-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warn text-xs font-semibold text-warn-foreground">{name[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-muted-foreground">{session.user.email}</p>
        </div>
        <button type="button" className="hud-topbtn" onClick={() => setDialog("phone")}>Phone</button>
        <button type="button" className="hud-topbtn" onClick={() => { speaker.stop(); void supabase.auth.signOut(); }}>Sign out</button>
      </div>
    </>
  );

  const top: Array<[string, () => void, boolean?]> = [
    [`Wake word ${local.wakeWord ? "on" : "off"}`, () => setLocal({ wakeWord: !local.wakeWord }), local.wakeWord],
    [`Web ${prefs.web_search ? "on" : "off"}`, () => update({ web_search: !prefs.web_search }), prefs.web_search],
    ["Capture", () => setCaptureOpen(true)],
    ["Docs", () => setDialog("docs")],
    ["Files", () => setDialog("files")],
    ["Permissions", () => setDialog("permissions")],
    ["Memory", () => setDialog("memory")],
    ["Personality", () => setDialog("personality")],
    ["Voice Studio", () => setDialog("voice")],
    [`Voice reply ${prefs.voice_output ? "on" : "off"}`, () => update(prefs.voice_output ? { voice_output: false } : { voice_output: true, auto_speak: true }), prefs.voice_output],
    [`Tutor ${local.studyNotes ? "on" : "off"}`, () => setLocal({ studyNotes: !local.studyNotes }), local.studyNotes],
    ["Open notes", () => setNotesOpen(true)],
    [`Direct ${local.direct ? "on" : "off"}`, () => setLocal({ direct: !local.direct }), local.direct],
    [`Companion ${local.companion ? "on" : "off"}`, () => setLocal({ companion: !local.companion }), !!local.companion],
    [speaker.speaking ? "Stop reading" : "Read last reply", () => speaker.speaking ? speaker.stop() : window.dispatchEvent(new Event("morgan:read-last"))],
    ...(isAdmin ? [["System telemetry", () => { window.location.assign("/admin"); }] as [string, () => void]] : []),
  ];

  return (
    <Ctx.Provider value={ctx}>
      {loaded && <BuddyNamePrompt personality={prefs.personality} onSave={(personality) => update({ personality })} />}
      <div className="flex h-dvh flex-col gap-3 overflow-hidden p-2 sm:p-3">
        <header className="hud-glass flex shrink-0 items-center gap-2 rounded-md border border-border px-2 py-1">
          <button type="button" aria-label="Open menu" className="hud-topbtn lg:hidden" onClick={() => setMenu(true)}><Menu className="h-4 w-4" /></button>
          <Link to="/" className="hud-topbtn">+ New chat</Link>
          <span className="ml-1 font-display text-sm font-bold tracking-[0.45em] text-foreground sm:text-base">MORGAN</span>
          <span className="hud-label hidden md:inline">PERSONAL AI</span>
          <div className="ml-auto flex items-center gap-1.5">
            <CaptureIndicator onOpen={() => setCaptureOpen(true)} />
            <TimerDock onDone={onTimerDone} />
            <span className="hud-label mr-2 hidden items-center gap-1.5 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${status[1]}`} /> {status[0]}
            </span>
            {top.map(([label, fn, on], i) => (
              <button key={label} type="button" onClick={fn} className={`hud-topbtn ${on ? "is-on" : ""} ${i === 1 ? "" : "hidden xl:inline-flex"}`}>{label}</button>
            ))}
          </div>
        </header>
        {!online && <div className="hud-alert shrink-0 text-xs">No internet connection. Saved chats you've opened are still readable and drafts are kept; MORGAN answers again when you reconnect.</div>}
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 flex-col gap-3 lg:flex">{left}</aside>
          <main className="min-h-0 min-w-0">{children}</main>
        </div>
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="hud-glass flex w-[86vw] max-w-xs flex-col gap-3 p-3">
          <SheetTitle className="font-display tracking-[0.4em]">MORGAN</SheetTitle>
          <div className="flex flex-wrap gap-1.5">
            {top.filter(([label]) => !label.startsWith("Web")).map(([label, fn, on]) => (
              <button key={label} type="button" onClick={() => { fn(); if (!label.startsWith("Wake") && !label.startsWith("Web") && !/^(Tutor|Direct|Companion)/.test(label)) setMenu(false); }} className={`hud-topbtn ${on ? "is-on" : ""}`}>{label}</button>
            ))}
          </div>
          {left}
        </SheetContent>
      </Sheet>
      <NotesPanel open={notesOpen} onOpenChange={setNotesOpen} />
      <CapturePanel open={captureOpen} onOpenChange={setCaptureOpen} />
      <MorganDialog id={dialog} onClose={() => setDialog(null)} />
    </Ctx.Provider>
  );
}
