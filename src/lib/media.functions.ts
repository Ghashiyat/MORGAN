import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type VideoHit = { id: string; title: string; channel?: string | undefined; thumb: string };
export type MediaSearch = { results: VideoHit[]; source: "youtube" | "web" | "none"; error?: "quota" | "timeout" | "unavailable" | "not_configured" };

const cache = new Map<string, { at: number; v: MediaSearch }>();
const TTL = 10 * 60_000;

export function videoIdFromUrl(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/(?:shorts|embed)\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

async function timed(url: string, init: RequestInit = {}, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

// Direct YouTube results page lookup — no key needed, ~0.6s.
async function directSearch(q: string): Promise<VideoHit[]> {
  const r = await timed(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!r.ok) return [];
  const html = await r.text();
  const out: VideoHit[] = [];
  const seen = new Set<string>();
  const re = /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"[\s\S]*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 10) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    let title = m[2]!;
    try { title = JSON.parse(`"${title}"`) as string; } catch { /* keep raw */ }
    out.push({ id, title, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
  }
  return out;
}

async function apiSearch(q: string, yt: string): Promise<VideoHit[]> {
  const p = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "8", q, key: yt, fields: "items(id/videoId,snippet(title,channelTitle,thumbnails/medium/url))" });
  const r = await timed(`https://www.googleapis.com/youtube/v3/search?${p}`);
  if (!r.ok) return [];
  const j = (await r.json()) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } } }> };
  return (j.items ?? []).filter((i) => i.id?.videoId).map((i) => ({ id: i.id!.videoId!, title: decode(i.snippet?.title ?? "YouTube video"), channel: i.snippet?.channelTitle, thumb: i.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${i.id!.videoId}/mqdefault.jpg` }));
}

async function tavilySearch(q: string, tav: string): Promise<VideoHit[]> {
  const r = await timed("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${tav}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `${q} song youtube`, include_domains: ["youtube.com", "youtu.be"], max_results: 10, search_depth: "basic" }),
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { results?: Array<{ url?: string; title?: string }> };
  const seen = new Set<string>();
  const results: VideoHit[] = [];
  for (const x of j.results ?? []) {
    const id = x.url ? videoIdFromUrl(x.url) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    results.push({ id, title: (x.title ?? "YouTube video").replace(/ - YouTube$/, ""), thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
  }
  return results;
}

// First non-empty result wins; all sources run in parallel.
function firstNonEmpty(tasks: Array<Promise<VideoHit[]>>): Promise<VideoHit[]> {
  return new Promise((resolve) => {
    let left = tasks.length;
    if (!left) return resolve([]);
    for (const t of tasks) {
      t.then((v) => { if (v.length) resolve(v); }, () => {}).finally(() => { if (--left === 0) resolve([]); });
    }
  });
}

export const searchVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ query: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<MediaSearch> => {
    const key = data.query.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.v;
    const yt = process.env["YOUTUBE_API_KEY"];
    const tav = process.env["TAVILY_API_KEY"];
    const tasks: Array<Promise<VideoHit[]>> = [directSearch(data.query)];
    if (yt) tasks.push(apiSearch(data.query, yt));
    if (tav) tasks.push(tavilySearch(data.query, tav));
    let results: VideoHit[] = [];
    try { results = await firstNonEmpty(tasks); } catch (e) { console.error("media search failed", (e as Error).name); }
    const out: MediaSearch = results.length ? { results, source: "youtube" } : { results: [], source: "none", error: "unavailable" };
    if (results.length) cache.set(key, { at: Date.now(), v: out });
    return out;
  });


function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
