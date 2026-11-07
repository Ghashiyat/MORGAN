import { createFileRoute } from "@tanstack/react-router";
import { authenticate } from "@/lib/server-auth.server";
import { MAX_CAPTURE_BYTES } from "@/lib/morgan/capture-audio";

const MAX_BYTES = MAX_CAPTURE_BYTES;
const PROMPT = `You are MORGAN Capture. Transcribe this audio faithfully, then organize it.
Rules: transcribe the ENTIRE recording from start to end, including its final sentences. Never summarize or omit words in the transcript; mark unclear audio as [inaudible]; do not invent speaker names (use "Speaker 1", "Speaker 2" only if voices clearly differ). Keep notes concise so the full transcript fits.
Return JSON: {"title": short title, "transcript": full verbatim transcript, "notes": Markdown with sections "## Summary", "## Key points", "## Decisions", "## Action items", "## Open questions" (omit empty sections)}.
If the audio has no intelligible speech, return transcript "" and notes "".`;

export const Route = createFileRoute("/api/capture")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if (!auth) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const key = process.env["GEMINI_API_KEY"];
        if (!key) return Response.json({ error: "Transcription service is not configured." }, { status: 503 });
        const form = await request.formData().catch(() => null);
        const file = form?.get("audio");
        if (!(file instanceof File) || file.size < 1000) return Response.json({ error: "Recording was empty." }, { status: 400 });
        if (file.size > MAX_BYTES) return Response.json({ error: "Recording is too large to process." }, { status: 413 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const mime = (file.type || "audio/webm").split(";")[0];
        const model = process.env["GEMINI_CAPTURE_MODEL"] || "gemini-flash-latest";
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: btoa(bin) } }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 16384 },
          }),
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
        }).catch(() => null);
        if (!res) return Response.json({ error: "Could not reach the transcription service. Try again." }, { status: 502 });
        if (!res.ok) {
          const status = res.status === 429 ? 429 : 502;
          return Response.json({ error: status === 429 ? "Transcription quota reached for now. Your recording is kept — retry later." : "Transcription failed. Your recording is kept — retry." }, { status });
        }
        const data = (await res.json()) as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }> };
        if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") return Response.json({ error: "The full transcript exceeded the service limit. Your audio is kept; save it or record shorter sections." }, { status: 422 });
        const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        let out: { title?: string; transcript?: string; notes?: string };
        try { out = JSON.parse(raw); } catch { return Response.json({ error: "Notes came back malformed. Retry." }, { status: 502 }); }
        return Response.json({ title: (out.title || "Untitled capture").slice(0, 120), transcript: out.transcript ?? "", notes: out.notes ?? "" });
      },
    },
  },
});
