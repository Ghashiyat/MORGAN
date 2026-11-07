import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cache } from "@/hooks/use-prefs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Thread = { id: string; title: string; updated_at: string };

export function useThreads(userId: string) {
  return useQuery({
    queryKey: ["threads"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("threads").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(200);
        if (error) throw error;
        cache.set(`threads:${userId}`, data);
        return data as Thread[];
      } catch (e) {
        const c = cache.get<Thread[]>(`threads:${userId}`);
        if (c) return c;
        throw e;
      }
    },
  });
}

export function SessionsPanel({ userId, activeId, onNavigate }: { userId: string; activeId?: string | undefined; onNavigate?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: threads = [] } = useThreads(userId);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<Thread | null>(null);
  const list = q ? threads.filter((t) => t.title.toLowerCase().includes(q.toLowerCase())) : threads;

  async function rename(id: string) {
    const title = name.trim().slice(0, 80);
    setEditing(null);
    if (!title) return;
    const { error } = await supabase.from("threads").update({ title }).eq("id", id);
    if (error) toast.error("Couldn't rename this chat.");
    qc.invalidateQueries({ queryKey: ["threads"] });
  }

  async function remove(t: Thread) {
    setConfirm(null);
    const { error } = await supabase.from("threads").delete().eq("id", t.id);
    if (error) return void toast.error("Couldn't delete this chat.");
    localStorage.removeItem(`morgan:cache:msgs:${userId}:${t.id}`);
    qc.invalidateQueries({ queryKey: ["threads"] });
    if (t.id === activeId) navigate({ to: "/" });
  }

  return (
    <div className="hud-panel flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="hud-label">Sessions</span>
        <Link to="/" onClick={onNavigate} className="hud-topbtn">+ New</Link>
      </div>
      <label className="mb-2 flex items-center gap-2 rounded-md border border-border px-2 py-1">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
      </label>
      <nav className="hud-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {list.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{q ? "No matching chats." : "No saved chats yet."}</p>}
        {list.map((t) => (
          <div key={t.id} className={`group flex items-center rounded-md ${t.id === activeId ? "hud-session-active" : "hover:bg-accent/40"}`}>
            {editing === t.id ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => rename(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void rename(t.id);
                  if (e.key === "Escape") setEditing(null);
                }}
                className="m-1 w-full rounded border border-primary bg-transparent px-2 py-1 text-sm outline-none"
              />
            ) : (
              <>
                <Link to="/chat/$threadId" params={{ threadId: t.id }} onClick={onNavigate} className="min-w-0 flex-1 truncate px-2 py-2 text-sm">
                  {t.title}
                </Link>
                <button type="button" aria-label="Rename chat" className="p-1 text-muted-foreground opacity-60 hover:text-primary md:opacity-0 md:group-hover:opacity-100" onClick={() => { setEditing(t.id); setName(t.title); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Delete chat" className="mr-1 p-1 text-muted-foreground opacity-60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100" onClick={() => setConfirm(t)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </nav>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>"{confirm?.title}" and all its messages will be permanently deleted. Saved memories are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && remove(confirm)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
