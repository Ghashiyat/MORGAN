import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Prefs = Database["public"]["Tables"]["user_preferences"]["Row"];
export type LocalPrefs = { wakeWord: boolean; studyNotes: boolean; direct: boolean; companion?: boolean };

export const defaultPrefs = (userId: string): Prefs => ({
  user_id: userId,
  web_search: false,
  voice_input: true,
  voice_output: true,
  auto_speak: false,
  voice_gender: "male",
  voice_name: null,
  memory_enabled: true,
  search_blocked_until: null,
  personality: {},
  voice_settings: {},
  updated_at: new Date().toISOString(),
});

export function usePrefs(userId: string) {
  const qc = useQueryClient();
  const key = ["prefs", userId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data ?? defaultPrefs(userId);
    },
  });
  const prefs = data ?? defaultPrefs(userId);
  const update = useCallback(
    async (patch: Partial<Prefs>) => {
      const next = { ...prefs, ...patch, updated_at: new Date().toISOString() };
      qc.setQueryData(key, next);
      const { error } = await supabase.from("user_preferences").upsert(next);
      if (error) {
        toast.error("Couldn't save that setting.");
        qc.invalidateQueries({ queryKey: key });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs, qc, userId],
  );
  return { prefs, update, loaded: data !== undefined };
}

/** Device-local toggles (not account data). */
export function useLocalPrefs() {
  const [p, setP] = useState<LocalPrefs>({ wakeWord: false, studyNotes: false, direct: false });
  useEffect(() => {
    try {
      const raw = localStorage.getItem("morgan:local-prefs");
      if (raw) setP({ ...p, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = useCallback((patch: Partial<LocalPrefs>) => {
    setP((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem("morgan:local-prefs", JSON.stringify(next));
      return next;
    });
  }, []);
  return [p, set] as const;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

// Local cache of conversations for offline reading.
export const cache = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(`morgan:cache:${k}`);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`morgan:cache:${k}`, JSON.stringify(v));
    } catch {
      /* quota */
    }
  },
  clear() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("morgan:"))
      .forEach((k) => localStorage.removeItem(k));
  },
};
