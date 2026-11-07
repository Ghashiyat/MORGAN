// Picks up content handed to MORGAN by the phone: share sheet or "Open with MORGAN".
// Everything here is event-driven; nothing runs unless something was shared/opened.
export type Inbound = { text: string; files: File[] };

const MAX_AGE_MS = 10 * 60 * 1000;

export async function readSharedInbox(): Promise<Inbound | null> {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("shared")) return null;
  params.delete("shared");
  const clean = window.location.pathname + (params.toString() ? `?${params}` : "") + window.location.hash;
  window.history.replaceState(window.history.state, "", clean);
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open("morgan-share-inbox");
    const metaRes = await cache.match("/__share/meta");
    if (!metaRes) return null;
    const meta = (await metaRes.json()) as { text?: string; count?: number; at?: number };
    const files: File[] = [];
    for (let i = 0; i < Math.min(meta.count ?? 0, 8); i++) {
      const r = await cache.match(`/__share/file-${i}`);
      if (!r) continue;
      const blob = await r.blob();
      const name = decodeURIComponent(r.headers.get("x-name") ?? `shared-${i}`);
      files.push(new File([blob], name, { type: blob.type }));
    }
    await caches.delete("morgan-share-inbox");
    if (meta.at && Date.now() - meta.at > MAX_AGE_MS) return null;
    return { text: meta.text ?? "", files };
  } catch (e) {
    console.error("Shared content could not be read", e);
    return null;
  }
}

type LaunchParams = { files?: Array<{ getFile(): Promise<File> }> };

export function onLaunchFiles(cb: (files: File[]) => void) {
  const lq = (window as unknown as { launchQueue?: { setConsumer(f: (p: LaunchParams) => void): void } }).launchQueue;
  if (!lq) return;
  lq.setConsumer(async (p) => {
    if (!p.files?.length) return;
    try {
      const files = await Promise.all(p.files.slice(0, 8).map((h) => h.getFile()));
      cb(files);
    } catch (e) {
      console.error("Opened file could not be read", e);
    }
  });
}
