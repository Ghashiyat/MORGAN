import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { loadMemory, normalizeMemory, type AreebaMemory } from "./areeba";

export const areebaMemoryKey = (userId: string) => `areeba:memory:${userId}`;
export function readAreeba(userId: string): AreebaMemory {
  try { return loadMemory(localStorage.getItem(areebaMemoryKey(userId))); } catch { return normalizeMemory(null); }
}
export function cacheAreeba(userId: string, memory: AreebaMemory) {
  try { localStorage.setItem(areebaMemoryKey(userId), JSON.stringify(normalizeMemory(memory))); } catch { /* private storage unavailable */ }
}
export async function fetchAreeba(userId: string): Promise<AreebaMemory> {
  const local = readAreeba(userId);
  if (!navigator.onLine) return local;
  try {
    if (localStorage.getItem(`${areebaMemoryKey(userId)}:pending`)) { await saveAreeba(userId, local); return local; }
  } catch { /* storage blocked */ }
  const { data, error } = await supabase.from("areeba_memories").select("memory").eq("user_id", userId).maybeSingle();
  if (error) return local;
  if (data) { const memory = normalizeMemory(data.memory); cacheAreeba(userId, memory); return memory; }
  return local;
}
export async function saveAreeba(userId: string, memory: AreebaMemory): Promise<boolean> {
  cacheAreeba(userId, memory);
  const snapshot = JSON.stringify(normalizeMemory(memory));
  const pendingKey = `${areebaMemoryKey(userId)}:pending`;
  try { localStorage.setItem(pendingKey, snapshot); } catch { /* storage blocked */ }
  if (!navigator.onLine) return false;
  const { error } = await supabase.from("areeba_memories").upsert({ user_id: userId, memory: normalizeMemory(memory) as unknown as Json, updated_at: new Date().toISOString() });
  if (!error) {
    try { if (localStorage.getItem(pendingKey) === snapshot) localStorage.removeItem(pendingKey); } catch { /* storage blocked */ }
  }
  return !error;
}