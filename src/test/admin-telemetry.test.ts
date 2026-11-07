import { describe, it, expect } from "vitest";
import { aggregate } from "@/lib/morgan/admin.functions";

const r = (o: Partial<Parameters<typeof aggregate>[0][number]>) => ({ request_id: "a", provider: "gemini", outcome: "ok", error_kind: null, latency_ms: 100, won: false, created_at: "2026-10-21T10:00:00Z", ...o });

describe("admin telemetry aggregation", () => {
  it("counts distinct requests, wins and error kinds", () => {
    const t = aggregate([
      r({ request_id: "a", won: true, latency_ms: 300 }),
      r({ request_id: "a", provider: "groq", outcome: "error", error_kind: "quota", latency_ms: null }),
      r({ request_id: "b", provider: "groq", won: true, latency_ms: 100 }),
    ], 24);
    expect(t.totalRequests).toBe(2);
    expect(t.providers.find((p) => p.provider === "groq")).toMatchObject({ calls: 2, wins: 1, errors: 1, avgMs: 100 });
    expect(t.errorKinds).toEqual([{ kind: "quota", count: 1, affectedUsers: 1 }]);
  });
  it("tells one account with many errors apart from many accounts with one error", () => {
    const t = aggregate([
      r({ user_id: "u1", request_id: "a", error_kind: "timeout" }),
      r({ user_id: "u1", request_id: "b", error_kind: "timeout" }),
      r({ user_id: "u2", request_id: "c", error_kind: "quota" }),
      r({ user_id: "u3", request_id: "d", error_kind: "quota" }),
    ], 24);
    expect(t.errorKinds.find((e) => e.kind === "timeout")).toEqual({ kind: "timeout", count: 2, affectedUsers: 1 });
    expect(t.errorKinds.find((e) => e.kind === "quota")).toEqual({ kind: "quota", count: 2, affectedUsers: 2 });
    expect(t.daily[0]).toEqual({ day: "2026-10-21", requests: 4, errors: 4, activeUsers: 3, usersWithErrors: 3 });
    expect(JSON.stringify(t)).not.toContain("u1");
  });
});
