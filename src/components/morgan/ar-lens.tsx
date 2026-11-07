import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import type { Prepared } from "@/lib/morgan/attachments";
import { Button } from "@/components/ui/button";

export const LENS_PROMPT = "Live lens: inspect the attached camera photo, not previous chat. Identify only clearly visible objects and readable text in 2-3 short sentences. If blurry or uncertain, say so and ask for a closer, steadier scan. Never guess unseen details.";

/** Camera overlay: live video, one tap scans a frame, MORGAN's answer floats over the view. */
export function ArLens({ onClose, onSend }: { onClose: () => void; onSend: (text: string, files: Prepared[]) => boolean | void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [ready, setReady] = useState(false);
  const active = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let closed = false;
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) setError("Camera access is unavailable in this browser.");
    else media.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(async (s) => {
        if (closed) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; await video.current.play(); }
      })
      .catch(() => setError("Camera permission was denied or no camera is available."));
    const onReply = (e: Event) => {
      if (!active.current) return;
      const result = (e as CustomEvent<{ text?: string; error?: string }>).detail;
      active.current = false;
      if (timeout.current) clearTimeout(timeout.current);
      setAnswer(result.text ?? result.error ?? "No scan result. Please try again.");
      setScanning(false);
    };
    window.addEventListener("morgan:lens-result", onReply);
    return () => { closed = true; if (timeout.current) clearTimeout(timeout.current); stream?.getTracks().forEach((t) => t.stop()); window.removeEventListener("morgan:lens-result", onReply); };
  }, []);

  function scan() {
    const v = video.current;
    if (!v || !v.videoWidth || !ready || scanning) return;
    if (!navigator.onLine) { setAnswer("Lens needs an internet connection to read photos."); return; }
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) { setAnswer("Couldn't capture this frame. Please try again."); return; }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    setAnswer("");
    setScanning(true);
    active.current = true;
    if (onSend(LENS_PROMPT, [{ kind: "image", name: "lens.jpg", mime: "image/jpeg", size: Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4), dataUrl }]) === false) {
      active.current = false; setScanning(false); setAnswer("Finish the current reply, then scan again."); return;
    }
    timeout.current = setTimeout(() => { active.current = false; setScanning(false); setAnswer("The scan took too long. Check your connection and try again."); }, 45000);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label="Live lens">
      <video ref={video} playsInline muted onLoadedData={() => setReady(true)} className="absolute inset-0 h-full w-full object-contain" />
      <div className="pointer-events-none absolute inset-6 rounded-lg border border-primary/50" />
      <div className="relative z-10 flex items-center justify-between p-3">
        <span className="hud-label rounded bg-background/70 px-2 py-1 text-primary">Live lens</span>
        <Button variant="ghost" size="icon" type="button" aria-label="Close lens" onClick={onClose} className="hud-icon rounded bg-background/70 p-2"><X className="h-4 w-4" /></Button>
      </div>
      <div className="relative z-10 mt-auto space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && <p className="rounded bg-background/80 p-3 text-sm text-destructive">{error}</p>}
        {(answer || scanning) && (
          <p className="max-h-48 overflow-y-auto rounded border-l-2 border-primary bg-background/80 p-3 text-sm">
            {scanning && !answer ? "MORGAN is looking…" : answer}
          </p>
        )}
        <Button type="button" onClick={scan} disabled={!!error || scanning || !ready} className="hud-send mx-auto flex h-auto items-center gap-2 rounded-full px-6 py-3 disabled:opacity-50">
          <Camera className="h-4 w-4" /> {scanning ? "Scanning…" : ready ? "Scan" : "Camera starting…"}
        </Button>
      </div>
    </div>
  );
}
