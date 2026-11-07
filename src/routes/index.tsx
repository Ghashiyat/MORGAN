import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { BootScreen } from "@/components/morgan/boot-screen";
import { AppShell } from "@/components/morgan/app-shell";
import { NewChat } from "@/components/morgan/new-chat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MORGAN — Personal AI System" },
      { name: "description", content: "MORGAN is a futuristic personal AI assistant with voice, live web research, memory and file understanding." },
      { property: "og:title", content: "MORGAN — Personal AI System" },
      { property: "og:description", content: "A futuristic personal AI assistant with voice, live web research, memory and file understanding." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);
  if (!session) return <BootScreen />;
  return (
    <AppShell session={session}>
      <NewChat />
    </AppShell>
  );
}
