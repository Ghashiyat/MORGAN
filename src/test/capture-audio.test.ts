import { afterEach, describe, expect, it, vi } from "vitest";
import { audioFilename, recordAudio } from "@/lib/morgan/capture-audio";

afterEach(() => vi.unstubAllGlobals());
describe("complete recorder finalization", () => {
  it("includes the final chunk before delivering the recording", () => {
    class Recorder {
      static isTypeSupported() { return true; }
      mimeType = "audio/mp4";
      state = "recording";
      ondataavailable?: (e: { data: Blob }) => void;
      onstop?: () => void;
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(["last sentence"], { type: "audio/mp4" }) });
        this.state = "inactive";
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", Recorder);
    const done = vi.fn();
    const rec = recordAudio({} as MediaStream, done);
    rec.ondataavailable?.({ data: new Blob(["first sentence"]) } as BlobEvent);
    expect(done).not.toHaveBeenCalled();
    rec.stop();
    const blob = done.mock.calls[0]?.[0] as Blob;
    expect(blob.size).toBe(27);
    expect(blob.type).toBe("audio/mp4");
    expect(done).toHaveBeenCalledOnce();
  });
  it("uses an MP4-compatible upload filename on iOS", () => {
    expect(audioFilename("audio/mp4")).toBe("capture.m4a");
    expect(audioFilename("audio/webm;codecs=opus")).toBe("capture.webm");
  });
});