import { useSyncExternalStore } from "react";
import { Copy, Download, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MessageResponse } from "@/components/ai-elements/message";

export type Note = { id: string; at: number; text: string };
const KEY = "morgan:notes";
let notes: Note[] = [];
let loaded = false;
const subs = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { notes = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[]; } catch { notes = []; }
}
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch { /* full */ } subs.forEach((f) => f()); };

export function addNote(text: string) {
  load();
  if (!text.trim() || notes[0]?.text === text) return;
  notes = [{ id: crypto.randomUUID(), at: Date.now(), text }, ...notes].slice(0, 500);
  emit();
}

function toMarkdown(list: Note[]) {
  return list.map((n) => `## ${new Date(n.at).toLocaleString()}\n\n${n.text}`).join("\n\n---\n\n");
}

/** Slide-out study workspace: replies saved while Study notes is on. */
export function NotesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const list = useSyncExternalStore((f) => { load(); subs.add(f); return () => subs.delete(f); }, () => notes, () => [] as Note[]);
  const md = () => `# MORGAN study notes\n\n${toMarkdown(list)}`;
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md()], { type: "text/markdown" }));
    a.download = `morgan-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const print = () => {
    const el = document.getElementById("morgan-notes-print");
    const w = window.open("", "_blank");
    if (!w || !el) { toast.error("Pop-up blocked. Allow pop-ups to save as PDF."); return; }
    w.document.write(`<html><head><title>MORGAN study notes</title><style>body{font-family:system-ui;max-width:720px;margin:2rem auto;line-height:1.5}article{border-bottom:1px solid #ccc;padding:1rem 0}</style></head><body><h1>MORGAN study notes</h1>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[92vw] max-w-md flex-col gap-3 bg-background p-4">
        <SheetTitle className="font-display tracking-[0.3em]">STUDY NOTES</SheetTitle>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="hud-topbtn" disabled={!list.length} onClick={() => void navigator.clipboard.writeText(md()).then(() => toast("Notes copied"))}><Copy className="mr-1 h-3 w-3" />Copy all</button>
          <button type="button" className="hud-topbtn" disabled={!list.length} onClick={download}><Download className="mr-1 h-3 w-3" />Markdown</button>
          <button type="button" className="hud-topbtn" disabled={!list.length} onClick={print}><Printer className="mr-1 h-3 w-3" />PDF</button>
          <button type="button" className="hud-topbtn ml-auto" disabled={!list.length} onClick={() => { if (confirm("Delete all notes?")) { notes = []; emit(); } }}><Trash2 className="h-3 w-3" /></button>
        </div>
        <div id="morgan-notes-print" className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {!list.length && <p className="text-sm text-muted-foreground">Tap “Save note” under any MORGAN reply to keep it here until you delete it.</p>}
          {list.map((n) => (
            <article key={n.id} className="hud-panel p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="hud-label">{new Date(n.at).toLocaleString()}</span>
                <span className="flex gap-1">
                  <button type="button" aria-label="Copy note" className="text-muted-foreground hover:text-primary" onClick={() => void navigator.clipboard.writeText(n.text).then(() => toast("Copied"))}><Copy className="h-3 w-3" /></button>
                  <button type="button" aria-label="Delete note" className="text-muted-foreground hover:text-destructive" onClick={() => { notes = notes.filter((x) => x.id !== n.id); emit(); }}><Trash2 className="h-3 w-3" /></button>
                </span>
              </div>
              <MessageResponse>{n.text}</MessageResponse>
            </article>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
