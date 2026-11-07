import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pin, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { pickVoice, voiceCategory, voiceGender, type VoiceSettings } from "@/hooks/use-speech";
import { DEFAULT_TRAITS, PRESETS, PRESET_TRAITS, TRAITS, type Personality, type PresetId, type Trait } from "@/lib/morgan/prompt";
import { cache } from "@/hooks/use-prefs";
import { supportedLabel } from "@/lib/morgan/attachments";
import { useMorgan, type ThreadFile } from "./context";
import { looksSensitive, categoryFor, MEMORY_CATEGORIES } from "@/lib/morgan/memory";
import { clearMetrics, readMetrics, summarize, type Metric } from "@/lib/morgan/telemetry";

export type DialogId = "memory" | "voice" | "personality" | "files" | "permissions" | "docs" | "phone" | "diagnostics" | null;

export function useMemories(enabled = true) {
  return useQuery({
    queryKey: ["memories"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("memories").select("id,kind,content,source,updated_at,pinned,importance,project,category,status,superseded_at").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function MemoryBody() {
  const m = useMorgan();
  const qc = useQueryClient();
  const { data = [] } = useMemories();
  const [text, setText] = useState("");
  const [kind, setKind] = useState("fact");
  const [edit, setEdit] = useState<{ id: string; content: string } | null>(null);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");
  const group = (x: (typeof data)[number]) => (x.status === "superseded" ? "history" : x.category === "identity" || x.category === "preference" || x.category === "communication" || (!x.category && x.kind === "profile") ? "profile" : x.category === "goal" ? "goal" : x.category === "project" || (!x.category && x.kind === "project") ? "project" : x.category === "experience" ? "experience" : x.category === "decision" ? "decision" : x.category === "context" ? "context" : x.category === "explicit" ? "explicit" : "fact");
  const shown = data.filter((x) => (only === "all" ? x.status !== "superseded" : only === "recent" ? x.source === "auto" && x.status !== "superseded" : group(x) === only)).filter((x) => !q || (x.content + " " + (x.project ?? "") + " " + x.kind).toLowerCase().includes(q.toLowerCase()));
  async function pin(id: string, pinned: boolean) {
    const { error } = await supabase.from("memories").update({ pinned }).eq("id", id);
    if (error) toast.error("Couldn't update memory.");
    refresh();
  }
  function exportAll() {
    const blob = new Blob([JSON.stringify(data.map(({ kind, category, content, pinned, importance, project, status, superseded_at }) => ({ kind, category, content, pinned, importance, project, status, superseded_at })), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "morgan-memories.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importFile(f: File) {
    try {
      const rows = JSON.parse(await f.text()) as Array<{ kind?: string; category?: string; content?: string; pinned?: boolean; importance?: number; project?: string | null; status?: string; superseded_at?: string | null }>;
      const clean = rows
        .filter((r) => typeof r.content === "string" && r.content.trim() && !looksSensitive(r.content))
        .slice(0, 200)
        .map((r) => ({ user_id: m.userId, source: "import", kind: ["profile", "fact", "project"].includes(r.kind ?? "") ? r.kind ?? "fact" : "fact", category: MEMORY_CATEGORIES.find((c) => c === r.category) ?? categoryFor(r.content ?? ""), content: (r.content ?? "").trim().slice(0, 500), pinned: !!r.pinned, importance: Math.min(5, Math.max(1, Number(r.importance) || 2)), project: r.project ?? null, status: r.status === "superseded" ? "superseded" : "active", superseded_at: r.status === "superseded" && r.superseded_at && !Number.isNaN(Date.parse(r.superseded_at)) ? r.superseded_at : null }));
      const { error } = await supabase.from("memories").insert(clean);
      if (error) throw error;
      toast.success(`Imported ${clean.length} memories.`);
      refresh();
    } catch {
      toast.error("That file couldn't be imported.");
    }
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ["memories"] });

  async function add() {
    const content = text.trim().slice(0, 500);
    if (!content) return;
    if (looksSensitive(content)) return void toast.error("That looks like a password or key — MORGAN won't store secrets.");
    const { error } = await supabase.from("memories").insert({ user_id: m.userId, kind, category: categoryFor(content), content, source: "user" });
    if (error) return void toast.error("Couldn't save memory.");
    setText("");
    refresh();
  }
  async function save() {
    if (!edit) return;
    if (!edit.content.trim() || looksSensitive(edit.content)) return void toast.error("That memory is empty or contains a password or key.");
    const { error } = await supabase.from("memories").update({ content: edit.content.trim().slice(0, 500), updated_at: new Date().toISOString() }).eq("id", edit.id);
    if (error) toast.error("Couldn't update memory.");
    setEdit(null);
    refresh();
  }
  async function del(id: string) {
    const { error } = await supabase.from("memories").delete().eq("id", id);
    if (error) toast.error("Couldn't delete memory.");
    refresh();
  }
  async function clearAll() {
    if (!confirm("Delete ALL saved memories?")) return;
    await supabase.from("memories").delete().eq("user_id", m.userId);
    refresh();
  }

  return (
    <div className="space-y-3">
      <Row label="Memory" hint="Auto-learn: MORGAN quietly learns lasting things about you from chats. Turn off to stop all saving.">
        <Switch checked={m.prefs.memory_enabled} onCheckedChange={(v) => m.updatePrefs({ memory_enabled: v })} />
      </Row>
      <div className="flex gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border border-border bg-secondary px-2 text-xs">
          <option value="profile">Profile</option>
          <option value="fact">Fact</option>
          <option value="project">Project</option>
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add something to remember" className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none" />
        <Button size="sm" onClick={add}>Save</Button>
      </div>
      <div className="flex gap-2">
        <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Filter by type" className="w-28 shrink-0 rounded-md border border-border bg-secondary px-2 text-xs">
          <option value="all">All</option><option value="recent">Recently learned</option><option value="profile">Profile &amp; style</option><option value="goal">Goals</option><option value="project">Projects</option><option value="decision">Decisions</option><option value="context">Context</option><option value="explicit">Explicitly saved</option><option value="experience">Experiences</option><option value="fact">Facts</option><option value="history">History (replaced)</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories" aria-label="Search memories" className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none" />
        <Button size="sm" variant="outline" onClick={exportAll} disabled={!data.length}>Export</Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 text-xs">Import<input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {shown.length === 0 && <li className="text-sm text-muted-foreground">{data.length ? "No matches." : "No memories saved yet."}</li>}
        {shown.map((x) => (
          <li key={x.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
            <span className="hud-label mt-0.5 w-20 shrink-0 truncate" title={x.source === "auto" ? "Learned automatically" : "Saved by you"}>{x.status === "superseded" ? "old" : x.category === "preference" ? "style" : x.category === "identity" ? "about you" : x.category ?? x.kind}{x.source === "auto" ? " ✦" : ""}</span>
            {edit?.id === x.id ? (
              <input autoFocus value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} className="flex-1 bg-transparent outline-none" />
            ) : (
              <button type="button" className="flex-1 text-left" onClick={() => setEdit({ id: x.id, content: x.content })}>{x.content}</button>
            )}
            <button type="button" aria-label={x.pinned ? "Unpin memory" : "Pin memory"} title="Prioritize this memory when relevant" onClick={() => pin(x.id, !x.pinned)} className={x.pinned ? "text-primary" : "text-muted-foreground hover:text-primary"}><Pin className="h-4 w-4" /></button>
            <button type="button" aria-label="Delete memory" onClick={() => del(x.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      {data.length > 0 && <Button variant="outline" size="sm" onClick={clearAll}>Clear all memories</Button>}
    </div>
  );
}

function VoiceBody() {
  const m = useMorgan();
  const voices = m.voices;
  const current = pickVoice(voices, m.prefs.voice_gender as "male" | "female", m.prefs.voice_name);
  const vs = (m.prefs.voice_settings ?? {}) as VoiceSettings;
  const setVs = (patch: VoiceSettings) => m.updatePrefs({ voice_settings: { ...vs, ...patch } });
  const [gender, setGender] = useState<"all" | "male" | "female" | "neutral">("all");
  const langs = Array.from(new Set(voices.map((v) => v.lang))).sort();
  const shown = voices.filter((v) => (gender === "all" || voiceGender(v) === gender) && (!vs.lang || v.lang === vs.lang));
  const groups = new Map<string, SpeechSynthesisVoice[]>();
  for (const v of shown) groups.set(voiceCategory(v), [...(groups.get(voiceCategory(v)) ?? []), v]);
  const sample = "MORGAN online. Systems nominal, and my sarcasm module is fully charged.";
  return (
    <div className="space-y-1">
      <Row label="Voice input" hint="Use the microphone to dictate messages.">
        <Switch checked={m.prefs.voice_input} onCheckedChange={(v) => m.updatePrefs({ voice_input: v })} />
      </Row>
      <Row label="Voice output" hint="Allow MORGAN to speak replies.">
        <Switch checked={m.prefs.voice_output} onCheckedChange={(v) => m.updatePrefs({ voice_output: v })} />
      </Row>
      <Row label="Read answers aloud automatically">
        <Switch checked={m.prefs.auto_speak} disabled={!m.prefs.voice_output} onCheckedChange={(v) => m.updatePrefs({ auto_speak: v })} />
      </Row>
      <Row label='Wake word "Morgan"' hint="Optional. Listens only while this tab is visible, and pauses while MORGAN speaks.">
        <Switch checked={m.local.wakeWord} onCheckedChange={(v) => m.setLocal({ wakeWord: v })} />
      </Row>
      {(["rate", "pitch", "volume"] as const).map((k) => (
        <Row key={k} label={k === "rate" ? "Speaking rate" : k === "pitch" ? "Pitch" : "Volume"}>
          <input type="range" aria-label={k} min={k === "volume" ? 0 : 0.5} max={k === "volume" ? 1 : 2} step={0.05}
            value={vs[k] ?? (k === "rate" ? 1.03 : 1)} onChange={(e) => setVs({ [k]: Number(e.target.value) })} className="w-40 accent-primary" />
        </Row>
      ))}
      {m.speechSupported ? (
        <>
          <div className="flex flex-wrap items-center gap-1 pt-2">
            {(["all", "male", "female", "neutral"] as const).map((g) => (
              <button key={g} type="button" className={`hud-chip ${gender === g ? "is-on" : ""}`} onClick={() => setGender(g)}>{g[0]!.toUpperCase() + g.slice(1)}</button>
            ))}
            <select aria-label="Language" value={vs.lang ?? ""} onChange={(e) => setVs({ lang: e.target.value || undefined })} className="ml-auto rounded-md border border-border bg-secondary px-2 py-1 text-xs">
              <option value="">Any language</option>
              {langs.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pt-1">
            {shown.length === 0 && <p className="text-xs text-muted-foreground">No device voices match this filter.</p>}
            {[...groups].map(([cat, list]) => (
              <div key={cat}>
                <p className="hud-label py-1">{cat}</p>
                {list.map((v) => (
                  <div key={v.name} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${current?.name === v.name ? "border-primary" : "border-border"}`}>
                    <button type="button" className="flex-1 truncate text-left" onClick={() => m.updatePrefs({ voice_name: v.name, voice_gender: voiceGender(v) === "female" ? "female" : "male" })}>
                      {v.name} <span className="text-muted-foreground">· {v.lang} · {voiceGender(v)}</span>
                    </button>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => m.speak(sample, { voiceName: v.name, force: true })}>Play</Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={!m.speaking} onClick={m.stopSpeaking}>Stop speaking</Button>
        </>
      ) : (
        <p className="text-xs text-warn">Spoken replies aren't supported in this browser.</p>
      )}
      <p className="pt-2 text-xs text-muted-foreground">Voices come from your device, so the list differs between phones and computers. Style groups are a best guess from the voice name.</p>
    </div>
  );
}

function PersonalityBody() {
  const m = useMorgan();
  const p = (m.prefs.personality ?? {}) as Personality;
  const saved = { ...DEFAULT_TRAITS, ...(p.traits ?? {}) };
  const [anim, setAnim] = useState<Record<Trait, number> | null>(null);
  const traits = anim ?? saved;
  const [custom, setCustom] = useState(p.custom ?? "");
  const save = (patch: Personality) => m.updatePrefs({ personality: { ...p, ...patch } as never });
  const labels: Record<string, string> = { warmth: "Emotional tone", technical: "Technical depth", challenge: "Challenge level" };

  /** Pick a preset and animate every dial to its hardcoded values. */
  function pickPreset(id: PresetId | undefined) {
    if (!id || id === "CUSTOM") { save({ preset: id }); return; }
    const target = PRESET_TRAITS[id];
    const from = { ...saved };
    const t0 = performance.now();
    const DUR = 420;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DUR);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      const mid = Object.fromEntries(TRAITS.map((t) => [t, Math.round(from[t] + (target[t] - from[t]) * e)])) as Record<Trait, number>;
      if (k < 1) { setAnim(mid); requestAnimationFrame(step); }
      else { setAnim(null); save({ preset: id, traits: target }); }
    };
    requestAnimationFrame(step);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button key={id} type="button" className={`hud-chip ${(p.preset ?? "") === id ? "is-on" : ""}`} onClick={() => pickPreset(id)}>{id}</button>
        ))}
        <button type="button" className={`hud-chip ${!p.preset ? "is-on" : ""}`} onClick={() => save({ preset: undefined, traits: {} })}>DEFAULT</button>
      </div>
      {p.preset && p.preset !== "CUSTOM" && <p className="text-xs text-muted-foreground">{PRESETS[p.preset]}</p>}
      {p.preset === "CUSTOM" && (
        <textarea value={custom} maxLength={1200} onChange={(e) => setCustom(e.target.value)} onBlur={() => save({ custom })}
          placeholder="Describe how MORGAN should talk to you" className="h-20 w-full rounded-md border border-border bg-transparent p-2 text-sm outline-none" />
      )}
      <div className="space-y-1">
        {TRAITS.map((t) => (
          <div key={t} className="flex items-center gap-3 text-sm">
            <span className="w-32 capitalize">{labels[t] ?? t}</span>
            <input type="range" aria-label={labels[t] ?? t} min={0} max={10} step={1} value={traits[t]} className="flex-1 accent-primary"
              onChange={(e) => save({ traits: { ...p.traits, [t]: Number(e.target.value) } })} />
            <span className="hud-label w-5 text-right">{traits[t]}</span>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => save({ traits: {} })}>Reset dials</Button>
      <p className="text-xs text-muted-foreground">Applies to every new reply in all chats. Style never overrides honesty, safety or MORGAN's identity.</p>
    </div>
  );
}

function FilesBody() {
  const files: ThreadFile[] = useMorgan().threadFiles;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">Supported: {supportedLabel()}. Max 15 MB per file, 5 per message.</p>
      <p className="text-muted-foreground">Files are read inside your browser; only the extracted text (and a downscaled copy of images) is sent. The original files are not stored.</p>
      <p className="hud-label pt-2">In this chat</p>
      {files.length === 0 ? <p className="text-muted-foreground">No files attached in this chat.</p> : (
        <ul className="space-y-1">{files.map((f, i) => <li key={i} className="truncate">📄 {f.name} {f.size ? <span className="text-muted-foreground">· {(f.size / 1024).toFixed(0)} KB</span> : null}</li>)}</ul>
      )}
    </div>
  );
}

function PermissionsBody() {
  const m = useMorgan();
  const [mic, setMic] = useState<string>("unknown");
  useEffect(() => {
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then((s) => {
      setMic(s.state);
      s.onchange = () => setMic(s.state);
    }).catch(() => setMic("unknown"));
  }, []);
  async function request() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMic("granted");
    } catch {
      setMic("denied");
    }
  }
  return (
    <div className="space-y-1 text-sm">
      <Row label="Microphone" hint="Needed for voice input and the wake word.">
        <div className="flex items-center gap-2">
          <span className="hud-label">{mic}</span>
          {mic !== "granted" && <Button size="sm" variant="outline" onClick={request}>Allow</Button>}
        </div>
      </Row>
      <Row label="Speech playback" hint="Uses your browser's built-in voices."><span className="hud-label">{m.speechSupported ? "available" : "unsupported"}</span></Row>
      <Row label="Device control" hint="Calls, apps and device data need a native app. The web version can't access them."><span className="hud-label">not installed</span></Row>
      <Row label="Clear data on this device" hint="Removes cached chats, drafts and local settings from this browser.">
        <Button size="sm" variant="outline" onClick={() => { cache.clear(); toast.success("Local data cleared."); }}>Clear</Button>
      </Row>
    </div>
  );
}

function DocsBody() {
  return (
    <div className="space-y-3 text-sm">
      <p>MORGAN is your personal AI system, built by Ghashiyat.</p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li><b className="text-foreground">Chat:</b> Enter to send, Shift+Enter for a new line. Stop cancels a reply; Retry resends without duplicating.</li>
        <li><b className="text-foreground">Web:</b> MORGAN searches the live web automatically for news, prices, comparisons and "search for…" requests. "Web on" also allows research for resource lookups. Say "without search" to skip it.</li>
        <li><b className="text-foreground">Memory:</b> say "Remember that…" or add items in Memory. View, edit or delete anytime.</li>
        <li><b className="text-foreground">Voice:</b> tap the mic to dictate; the speaker button toggles spoken replies. Wake word lives in Voice Studio.</li>
        <li><b className="text-foreground">Modes:</b> Tutor teaches step by step and takes its time; “Save note” keeps a reply in Notes; Direct gives the shortest complete answer.</li>
        <li><b className="text-foreground">Offline:</b> saved chats you've opened stay readable and drafts are kept. AI answers and web search need a connection.</li>
      </ul>
    </div>
  );
}

type BIP = Event & { prompt: () => Promise<void> };
let deferred: BIP | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIP;
  });
}

function PhoneBody() {
  const [can, setCan] = useState(false);
  useEffect(() => setCan(!!deferred), []);
  return (
    <div className="space-y-3 text-sm">
      <p>Install MORGAN on your phone or computer as an app (no app store needed).</p>
      {can ? (
        <Button onClick={async () => { await deferred?.prompt(); deferred = null; setCan(false); }}>Install MORGAN</Button>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li><b className="text-foreground">Android (Chrome):</b> menu ⋮ → "Install app" / "Add to Home screen".</li>
          <li><b className="text-foreground">iPhone (Safari):</b> Share → "Add to Home Screen".</li>
          <li><b className="text-foreground">Windows/Mac (Chrome/Edge):</b> install icon in the address bar.</li>
        </ul>
      )}
      <p className="text-xs text-muted-foreground">This is an installable web app, not an APK or Windows installer. Installing works on the published site, not inside the editor preview.</p>
    </div>
  );
}

function DiagnosticsBody() {
  const [rows, setRows] = useState<Metric[]>([]);
  useEffect(() => setRows(readMetrics()), []);
  const s = summarize(rows);
  const ms = (v: number | null) => (v == null ? "—" : `${v} ms`);
  const stats: Array<[string, string]> = [
    ["Replies measured", String(s.count)],
    ["Avg first word", ms(s.avgFirstToken)],
    ["95% first word", ms(s.p95FirstToken)],
    ["Avg full reply", ms(s.avgTotal)],
    ["95% full reply", ms(s.p95Total)],
    ["Used web search", `${s.searchRate}%`],
    ["Engine success", s.engineSuccess == null ? "—" : `${s.engineSuccess}%`],
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Timings from replies on this device. Only numbers are kept — no messages, keys or prompts. Music commands run instantly on-device and aren't listed.</p>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-md border border-border p-2">
            <p className="hud-label">{k}</p>
            <p className="font-mono text-sm text-primary">{v}</p>
          </div>
        ))}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border">
        <table className="w-full font-mono text-[11px]">
          <thead className="text-muted-foreground"><tr><th className="p-1 text-left">Time</th><th>Mode</th><th>Setup</th><th>Memory</th><th>Search</th><th>1st word</th><th>Total</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-2 text-center text-muted-foreground">Send a message to start measuring.</td></tr>}
            {rows.slice(0, 30).map((r) => (
              <tr key={r.at} className="border-t border-border text-center">
                <td className="p-1 text-left">{new Date(r.at).toLocaleTimeString()}</td>
                <td>{r.route}</td><td>{r.prepMs}</td><td>{r.memoryMs}</td><td>{r.searchMs ?? "—"}</td><td>{r.firstTokenMs ?? "—"}</td><td>{r.totalMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <Button size="sm" variant="outline" onClick={() => { clearMetrics(); setRows([]); }}>Clear timings</Button>}
    </div>
  );
}

const TITLES: Record<Exclude<DialogId, null>, [string, string]> = {
  memory: ["Memory", "What MORGAN remembers about you across chats."],
  voice: ["Voice Studio", "Voice input, spoken replies and wake word."],
  files: ["Files", "Attachments and how they're handled."],
  permissions: ["Permissions", "What MORGAN can access on this device."],
  personality: ["Personality Studio", "Choose how MORGAN thinks and talks."],
  docs: ["Docs", "How to use MORGAN."],
  phone: ["Install on phone", "Add MORGAN to your home screen."],
  diagnostics: ["Diagnostics", "How fast MORGAN is answering you."],
};

export function MorganDialog({ id, onClose }: { id: DialogId; onClose: () => void }) {
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {id && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display tracking-widest">{TITLES[id][0]}</DialogTitle>
              <DialogDescription>{TITLES[id][1]}</DialogDescription>
            </DialogHeader>
            {id === "memory" && <MemoryBody />}
            {id === "voice" && <VoiceBody />}
            {id === "personality" && <PersonalityBody />}
            {id === "files" && <FilesBody />}
            {id === "permissions" && <PermissionsBody />}
            {id === "docs" && <DocsBody />}
            {id === "phone" && <PhoneBody />}
            {id === "diagnostics" && <DiagnosticsBody />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
