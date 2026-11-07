// Deck Engine images: resolves each slide's short image query to a real, freely licensed photo
// (Wikipedia / Wikimedia Commons, CORS-enabled), cropped to the slide's frame as a JPEG data URL.
// Browser-only, runs at download time, all images fetched in parallel with a short timeout.
// A failed lookup simply leaves the designed placeholder panel in place.
import type { Deck } from "./deck-engine";

const TIMEOUT = 7000;

async function withTimeout<T>(p: (s: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    return await p(c.signal);
  } finally {
    clearTimeout(t);
  }
}

async function findUrl(q: string, signal: AbortSignal): Promise<string | null> {
  const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=6&prop=pageimages&piprop=thumbnail&pithumbsize=1280`;
  const r = await fetch(u, { signal });
  if (!r.ok) return null;
  const j = (await r.json()) as { query?: { pages?: Record<string, { index?: number; thumbnail?: { source?: string; width?: number; height?: number } }> } };
  const pages = Object.values(j.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  // Prefer real photos (jpg) of a decent size over logos, maps and diagrams.
  const hit = pages.find((p) => p.thumbnail?.source && /\.jpe?g/i.test(p.thumbnail.source) && (p.thumbnail.width ?? 0) >= 600) ?? pages.find((p) => p.thumbnail?.source && !/\.svg/i.test(p.thumbnail.source));
  return hit?.thumbnail?.source ?? null;
}

/** Cover-crop to the target aspect ratio and re-encode as JPEG. */
async function toDataUrl(url: string, aspect: number, signal: AbortSignal): Promise<string | null> {
  const r = await fetch(url, { signal, mode: "cors" });
  if (!r.ok) return null;
  const bmp = await createImageBitmap(await r.blob());
  const W = 1280;
  const H = Math.round(W / aspect);
  const sa = bmp.width / bmp.height;
  let sw = bmp.width;
  let sh = bmp.height;
  if (sa > aspect) sw = bmp.height * aspect;
  else sh = bmp.width / aspect;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
  bmp.close?.();
  return canvas.toDataURL("image/jpeg", 0.82);
}

const cache = new Map<string, Promise<string | null>>();

/** Resolve every image query in the deck; returns query -> data URL (only successes). */
export async function resolveDeckImages(deck: Deck, aspectFor: (q: string) => number): Promise<Map<string, string>> {
  const qs = [...new Set(deck.slides.map((s) => s.image).filter((q): q is string => !!q))].slice(0, 4);
  const out = new Map<string, string>();
  await Promise.all(
    qs.map(async (q) => {
      const key = `${q}|${aspectFor(q).toFixed(2)}`;
      if (!cache.has(key)) {
        cache.set(
          key,
          withTimeout(async (sig) => {
            const url = await findUrl(q, sig);
            return url ? toDataUrl(url, aspectFor(q), sig) : null;
          }).catch(() => null),
        );
      }
      const d = await cache.get(key)!;
      if (d) out.set(q, d);
      else cache.delete(key);
    }),
  );
  return out;
}
