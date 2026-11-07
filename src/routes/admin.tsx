import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { BootScreen } from "@/components/morgan/boot-screen";
import { checkIsAdmin, getMyLearning, getTelemetry, resetMyLearning } from "@/lib/morgan/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "System Telemetry — MORGAN" },
      { name: "description", content: "Operational health and provider performance for MORGAN administrators." },
      { property: "og:title", content: "System Telemetry — MORGAN" },
      { property: "og:description", content: "Operational health and provider performance for MORGAN." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const check = useServerFn(checkIsAdmin);
  const role = useQuery({ queryKey: ["is-admin", session?.user.id], queryFn: () => check(), enabled: !!session });
  if (!session || role.isLoading) return <BootScreen />;
  if (!role.data?.isAdmin) {
    return (
      <main className="grid h-dvh place-items-center p-6 text-center">
        <div className="hud-panel max-w-sm p-6">
          <p className="hud-label mb-2">Access denied</p>
          <p className="text-sm text-muted-foreground">This area is restricted to administrators.</p>
          <Link to="/" className="hud-topbtn mt-4 inline-flex">Back to MORGAN</Link>
        </div>
      </main>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const [hours, setHours] = useState(24);
  const fetchT = useServerFn(getTelemetry);
  const q = useQuery({ queryKey: ["telemetry", hours], queryFn: () => fetchT({ data: { hours } }), refetchInterval: 60_000 });
  const t = q.data;
  const maxHour = Math.max(1, ...(t?.hourly.map((h) => h.requests) ?? [1]));
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Link to="/" className="hud-topbtn">← MORGAN</Link>
        <h1 className="font-display text-sm font-bold tracking-[0.35em]">SYSTEM TELEMETRY</h1>
        <div className="ml-auto flex gap-1">
          {[1, 24, 168, 720].map((h) => (
            <button key={h} type="button" onClick={() => setHours(h)} className={`hud-topbtn ${hours === h ? "is-on" : ""}`}>
              {h === 1 ? "1h" : h === 24 ? "24h" : h === 168 ? "7d" : "30d"}
            </button>
          ))}
        </div>
      </header>
      <LearnedPanel />
      {q.isError && <p className="hud-panel p-3 text-sm text-destructive">Couldn't load telemetry. Try again shortly.</p>}
      {q.isLoading && <p className="hud-label p-3">Loading…</p>}
      {t && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Requests" value={t.totalRequests} />
            <Stat label="Providers seen" value={t.providers.length} />
            <Stat label="Errors" value={t.errorKinds.reduce((a, e) => a + e.count, 0)} />
            <Stat label="Best avg win" value={fmt(Math.min(...t.providers.map((p) => p.avgMs ?? Infinity)))} />
          </section>
          <section className="hud-panel overflow-x-auto p-3">
            <p className="hud-label mb-2">Provider race</p>
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1">Provider</th><th>Calls</th><th>Wins</th><th>Win rate</th><th>Errors</th><th>Avg</th><th>p95</th></tr></thead>
              <tbody>
                {t.providers.map((p) => (
                  <tr key={p.provider} className="border-t border-border">
                    <td className="py-1.5 font-medium">{p.provider}</td><td>{p.calls}</td><td>{p.wins}</td>
                    <td>{p.calls ? Math.round((p.wins / p.calls) * 100) : 0}%</td><td>{p.errors}</td><td>{fmt(p.avgMs)}</td><td>{fmt(p.p95Ms)}</td>
                  </tr>
                ))}
                {!t.providers.length && <tr><td colSpan={7} className="py-3 text-muted-foreground">No activity in this window.</td></tr>}
              </tbody>
            </table>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <div className="hud-panel p-3">
              <p className="hud-label mb-2">Error breakdown</p>
              {t.errorKinds.length ? t.errorKinds.map((e) => (
                <div key={e.kind} className="flex justify-between border-t border-border py-1.5 text-sm"><span>{e.kind}</span><span>{e.count} <span className="text-muted-foreground">· {e.affectedUsers} {e.affectedUsers === 1 ? "account" : "accounts"}</span></span></div>
              )) : <p className="text-sm text-muted-foreground">No errors.</p>}
            </div>
            <div className="hud-panel p-3">
              <p className="hud-label mb-2">Requests per hour (UTC)</p>
              <div className="flex h-32 items-end gap-0.5">
                {t.hourly.slice(-48).map((h) => (
                  <div key={h.hour} title={`${h.hour}:00 — ${h.requests}`} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${(h.requests / maxHour) * 100}%` }} />
                ))}
              </div>
            </div>
          </section>
          <section className="hud-panel overflow-x-auto p-3">
            <p className="hud-label mb-2">Daily summary (UTC)</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Day</th><th>Requests</th><th>Errors</th><th>Active accounts</th><th>Accounts with errors</th></tr></thead>
              <tbody>
                {t.daily.map((d) => (
                  <tr key={d.day} className="border-t border-border"><td className="py-1.5">{d.day}</td><td>{d.requests}</td><td>{d.errors}</td><td>{d.activeUsers}</td><td>{d.usersWithErrors}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="hud-panel p-3"><p className="hud-label">{label}</p><p className="mt-1 font-display text-xl">{value}</p></div>;
}
function fmt(ms: number | null) { return ms == null || !Number.isFinite(ms) ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }

function LearnedPanel() {
  const fetchL = useServerFn(getMyLearning);
  const reset = useServerFn(resetMyLearning);
  const q = useQuery({ queryKey: ["my-learning"], queryFn: () => fetchL() });
  const [busy, setBusy] = useState(false);
  return (
    <section className="hud-panel p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="hud-label">Learned about you</p>
        <span className="text-xs text-muted-foreground">{q.data ? `${q.data.messages} messages observed` : ""}</span>
        <button
          type="button"
          className="hud-topbtn ml-auto"
          disabled={busy || !q.data?.messages}
          onClick={async () => {
            if (!window.confirm("Reset everything MORGAN has learned about you?")) return;
            setBusy(true);
            try { await reset(); await q.refetch(); } finally { setBusy(false); }
          }}
        >Reset</button>
      </div>
      {q.isLoading ? <p className="hud-label">Loading…</p> : q.data?.lines.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">{q.data.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      ) : <p className="text-sm text-muted-foreground">Nothing learned yet — habits appear after they repeat a few times.</p>}
    </section>
  );
}
