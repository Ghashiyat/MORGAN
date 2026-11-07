import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cache } from "@/hooks/use-prefs";
import { BootScreen } from "@/components/morgan/boot-screen";
import { AppShell } from "@/components/morgan/app-shell";
import { ChatSession } from "@/components/morgan/chat-session";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Session — MORGAN" },
      { name: "description", content: "A conversation with MORGAN, your personal AI system." },
      { property: "og:title", content: "Session — MORGAN" },
      { property: "og:description", content: "A conversation with MORGAN, your personal AI system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const uid = session?.user.id;
  const { data, isLoading, error } = useQuery({
    queryKey: ["messages", threadId],
    enabled: !!uid,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("messages").select("ui_id,role,parts").eq("thread_id", threadId).order("created_at");
        if (error) throw error;
        return data.map((r) => ({ id: r.ui_id, role: r.role, parts: r.parts }) as unknown as UIMessage);
      } catch (e) {
        const c = cache.get<UIMessage[]>(`msgs:${uid}:${threadId}`);
        if (c) return c;
        throw e;
      }
    },
  });

  if (!session) return <BootScreen />;
  return (
    <AppShell session={session} activeId={threadId}>
      {isLoading ? (
        <div className="hud-stage flex h-full items-center justify-center"><p className="hud-label">Loading session…</p></div>
      ) : error ? (
        <div className="hud-stage flex h-full items-center justify-center p-6 text-center text-sm text-warn">This chat couldn't be loaded. Check your connection and try again.</div>
      ) : (
        <ChatSession key={threadId} threadId={threadId} initialMessages={data ?? []} />
      )}
    </AppShell>
  );
}
