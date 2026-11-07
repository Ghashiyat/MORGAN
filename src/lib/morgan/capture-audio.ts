export const MAX_CAPTURE_BYTES = 18 * 1024 * 1024;
export function audioFilename(type: string) {
  const mime = type.split(";")[0];
  return `capture.${mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : mime === "audio/wav" ? "wav" : "webm"}`;
}

/** Stop resolves only after the final dataavailable event, never before the tail arrives. */
export function recordAudio(stream: MediaStream, done: (blob: Blob, error?: string) => void) {
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
  const chunks: Blob[] = [];
  let error: string | undefined;
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onerror = () => {
    error = "The microphone was interrupted. Only the audio captured before the interruption is available.";
    if (recorder.state !== "inactive") recorder.stop();
  };
  recorder.onstop = () => done(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || mime || "audio/webm" }), error);
  recorder.start(1000);
  return recorder;
}