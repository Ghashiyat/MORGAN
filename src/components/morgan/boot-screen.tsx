import morganCore from "@/assets/morgan-core.png";

export function BootScreen({ label = "Initializing Morgan" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <img src={morganCore} alt="Morgan" width={816} height={816} className="h-40 w-40 animate-pulse" />
      <p className="hud-label">{label}…</p>
    </div>
  );
}
