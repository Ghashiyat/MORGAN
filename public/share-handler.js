// Receives content shared from other apps (Android share sheet) and hands it to MORGAN.
// Runs only when something is shared; no effect on normal app use.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const cache = await caches.open("morgan-share-inbox");
        const text = ["title", "text", "url"].map((k) => form.get(k)).filter((v) => typeof v === "string" && v.trim()).join("\n");
        const files = form.getAll("files").filter((f) => f && typeof f !== "string").slice(0, 8);
        await cache.put("/__share/meta", new Response(JSON.stringify({ text, count: files.length, at: Date.now() })));
        await Promise.all(
          files.map((f, i) =>
            cache.put(`/__share/file-${i}`, new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-name": encodeURIComponent(f.name || `shared-${i}`) } })),
          ),
        );
      } catch (e) {
        // Fall through to the app; it will simply open normally.
      }
      return Response.redirect("/?shared=1", 303);
    })(),
  );
});
