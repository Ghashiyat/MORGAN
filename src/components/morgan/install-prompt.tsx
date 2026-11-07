// Shows a one-tap "Install MORGAN" card in the Chrome browser; never inside the installed app.
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
const DISMISS = "morgan.install-dismissed";

function installed() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [evt, setEvt] = useState<BIP | null>(null);
  useEffect(() => {
    if (installed()) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      try {
        if (sessionStorage.getItem(DISMISS)) return;
      } catch {
        /* ignore */
      }
      setEvt(e as BIP);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!evt) return null;
  const close = () => {
    try {
      sessionStorage.setItem(DISMISS, "1");
    } catch {
      /* ignore */
    }
    setEvt(null);
  };
  return (
    <div className="fixed inset-x-3 bottom-24 z-[80] mx-auto max-w-sm hud-panel flex items-center gap-3 p-3">
      <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm tracking-[0.3em] text-primary">MORGAN</p>
        <p className="text-xs text-muted-foreground">Install the app on your phone</p>
      </div>
      <button type="button" className="hud-chip" onClick={close}>Later</button>
      <button
        type="button"
        className="hud-chip hud-chip-on"
        onClick={async () => {
          const e = evt;
          setEvt(null);
          await e.prompt().catch(() => {});
        }}
      >
        Install
      </button>
    </div>
  );
}
