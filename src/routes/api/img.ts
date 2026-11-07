import { createFileRoute } from "@tanstack/react-router";

// Image relay for web photo results: serves the picture from MORGAN's own address so
// browsers/ad-blockers/hotlink rules don't hide it, and downloads work same-origin.
// Only public https image files, max 8 MB; no cookies or credentials are forwarded.
const MAX = 8 * 1024 * 1024;
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i;

export const Route = createFileRoute("/api/img")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        let target: URL;
        try { target = new URL(raw); } catch { return new Response("Bad image", { status: 400 }); }
        if (target.protocol !== "https:" || PRIVATE.test(target.hostname)) return new Response("Bad image", { status: 400 });
        try {
          const res = await fetch(target.toString(), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; MORGAN/1.0)", Accept: "image/*" },
            signal: AbortSignal.timeout(8000),
          });
          const type = res.headers.get("content-type") ?? "";
          const len = Number(res.headers.get("content-length") ?? 0);
          if (!res.ok || !type.startsWith("image/") || len > MAX) return new Response("Unavailable", { status: 502 });
          const buf = await res.arrayBuffer();
          if (buf.byteLength > MAX) return new Response("Too large", { status: 502 });
          return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
        } catch {
          return new Response("Unavailable", { status: 502 });
        }
      },
    },
  },
});
