import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProviderStat = { provider: string; calls: number; wins: number; errors: number; avgMs: number | null; p95Ms: number | null };
export type Telemetry = {
  windowHours: number;
  totalRequests: number;
  providers: ProviderStat[];
  errorKinds: Array<{ kind: string; count: number; affectedUsers: number }>;
  daily: Array<{ day: string; requests: number; errors: number; activeUsers: number; usersWithErrors: number }>;
  hourly: Array<{ hour: string; requests: number }>;
};

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { isAdmin: data === true };
  });

/** Aggregated, anonymous metrics only (user IDs are counted server-side, never returned) — no user IDs or message content leave the server. */
export const getTelemetry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { hours?: number }) => ({ hours: Math.min(Math.max(Number(i?.hours) || 24, 1), 720) }))
  .handler(async ({ data, context }): Promise<Telemetry> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin !== true) throw new Error("Forbidden");
    const since = new Date(Date.now() - data.hours * 3600_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("provider_logs")
      .select("user_id, request_id, provider, outcome, error_kind, latency_ms, won, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error("Telemetry unavailable");
    return aggregate(rows ?? [], data.hours);
  });

type Row = { user_id?: string; request_id: string; provider: string; outcome: string; error_kind: string | null; latency_ms: number | null; won: boolean; created_at: string };

export function aggregate(rows: Row[], windowHours: number): Telemetry {
  const by = new Map<string, Row[]>();
  const kinds = new Map<string, number>();
  const hours = new Map<string, Set<string>>();
  const reqs = new Set<string>();
  const kindUsers = new Map<string, Set<string>>();
  const days = new Map<string, { reqs: Set<string>; errors: number; users: Set<string>; errUsers: Set<string> }>();
  for (const r of rows) {
    reqs.add(r.request_id);
    (by.get(r.provider) ?? by.set(r.provider, []).get(r.provider)!).push(r);
    const u = r.user_id ?? r.request_id;
    if (r.error_kind) {
      kinds.set(r.error_kind, (kinds.get(r.error_kind) ?? 0) + 1);
      (kindUsers.get(r.error_kind) ?? kindUsers.set(r.error_kind, new Set()).get(r.error_kind)!).add(u);
    }
    const d = r.created_at.slice(0, 10);
    const day = days.get(d) ?? days.set(d, { reqs: new Set(), errors: 0, users: new Set(), errUsers: new Set() }).get(d)!;
    day.reqs.add(r.request_id); day.users.add(u);
    if (r.error_kind) { day.errors++; day.errUsers.add(u); }
    const h = r.created_at.slice(0, 13);
    (hours.get(h) ?? hours.set(h, new Set()).get(h)!).add(r.request_id);
  }
  const providers = [...by].map(([provider, rs]) => {
    const lat = rs.filter((r) => r.won && r.latency_ms != null).map((r) => r.latency_ms!).sort((a, b) => a - b);
    return {
      provider,
      calls: rs.length,
      wins: rs.filter((r) => r.won).length,
      errors: rs.filter((r) => r.error_kind || (r.outcome !== "ok" && r.outcome !== "aborted" && !r.won)).length,
      avgMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
      p95Ms: lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))]! : null,
    };
  }).sort((a, b) => b.wins - a.wins);
  return {
    windowHours,
    totalRequests: reqs.size,
    providers,
    errorKinds: [...kinds].map(([kind, count]) => ({ kind, count, affectedUsers: kindUsers.get(kind)?.size ?? 0 })).sort((a, b) => b.count - a.count),
    daily: [...days].map(([day, v]) => ({ day, requests: v.reqs.size, errors: v.errors, activeUsers: v.users.size, usersWithErrors: v.errUsers.size })).sort((a, b) => b.day.localeCompare(a.day)),
    hourly: [...hours].map(([hour, s]) => ({ hour, requests: s.size })).sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}

/** The owner's own learned profile (plain-language lines). Admin only; other users' profiles are never exposed. */
export const getMyLearning = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin !== true) throw new Error("Forbidden");
    const { describeProfile } = await import("./learning");
    const { data } = await context.supabase.from("learned_profiles").select("profile, updated_at").eq("user_id", context.userId).maybeSingle();
    const p = (data?.profile ?? null) as import("./learning").LearnedProfile | null;
    return { lines: describeProfile(p), messages: p?.n ?? 0, updatedAt: data?.updated_at ?? null };
  });

export const resetMyLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin !== true) throw new Error("Forbidden");
    const { error } = await context.supabase.from("learned_profiles").delete().eq("user_id", context.userId);
    if (error) throw new Error("Reset failed");
    return { ok: true };
  });
