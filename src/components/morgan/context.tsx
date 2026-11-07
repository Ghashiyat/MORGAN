import { createContext, useContext } from "react";
import type { Prefs, LocalPrefs } from "@/hooks/use-prefs";
import type { OrbState } from "./orb";
import type { MicState } from "@/hooks/use-speech";

export type ThreadFile = { name: string; size: number; mime: string };

export type MorganCtx = {
  userId: string;
  prefs: Prefs;
  updatePrefs: (p: Partial<Prefs>) => void;
  local: LocalPrefs;
  setLocal: (p: Partial<LocalPrefs>) => void;
  online: boolean;
  speak: (text: string, override?: { voiceName?: string; force?: boolean; lang?: string }) => void;
  stopSpeaking: () => void;
  speaking: boolean;
  speechSupported: boolean;
  voices: SpeechSynthesisVoice[];
  setActivity: (s: OrbState) => void;
  activity: OrbState;
  setLlmStatus: (s: "ready" | "error" | "busy") => void;
  setThreadFiles: (f: ThreadFile[]) => void;
  threadFiles: ThreadFile[];
  setLastReply: (t: string) => void;
  micState: MicState;
  setMicState: (s: MicState) => void;
  wakeSignal: number;
};

export const Ctx = createContext<MorganCtx | null>(null);
export const useMorgan = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("MorganCtx missing");
  return c;
};

/** Hand-off for the first message typed on the new-chat screen. */
export const pending: { threadId?: string | undefined; text?: string; files?: unknown[] } = {};
