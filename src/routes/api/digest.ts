import { createFileRoute } from "@tanstack/react-router";
import { authenticate } from "@/lib/server-auth.server";
import { tavilySearch } from "@/lib/morgan/search";

// Daily "reading": the first idle signed-in app of the day triggers ONE shared news search.
// The date primary key is the single-flight lock; there are no AI calls and no retries.
export const Route = createFileRoute("/api/digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if (!auth) return Response.json({ error: "auth" }, { status: 401 });
        const day = new Date().toISOString().slice(0, 10);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimed } = await supabaseAdmin.from("daily_digest").upsert({ day }, { onConflict: "day", ignoreDuplicates: true }).select("day");
        if (!claimed?.length) return Response.json({ ok: true, fresh: false });
        try {
          const results = await tavilySearch(process.env["TAVILY_API_KEY"], "top trending and most interesting news today in world, technology, science, entertainment and sports", { depth: "basic", topic: "news" }, AbortSignal.timeout(8000));
          const items = results.slice(0, 8).map((r) => ({ title: r.title.slice(0, 140), gist: r.content.replace(/\s+/g, " ").slice(0, 220), url: r.url }));
          await supabaseAdmin.from("daily_digest").update({ items }).eq("day", day);
          return Response.json({ ok: true, fresh: true, count: items.length });
        } catch {
          // Keep the claimed row (empty) so a failure/quota issue isn't retried again today.
          return Response.json({ ok: false });
        }
      },
    },
  },
});
