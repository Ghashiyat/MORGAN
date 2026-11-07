import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ upsert: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ upsert: db.upsert, select: () => ({ eq: () => ({ maybeSingle: db.maybeSingle }) }) }) } }));
import { areebaMemoryKey, cacheAreeba, readAreeba, fetchAreeba, saveAreeba } from "@/lib/morgan/areeba-storage";
import { EMPTY_MEMORY } from "@/lib/morgan/areeba";
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
it("isolates lasting memories by signed-in user, not chat", () => {
  cacheAreeba("user-a", { ...EMPTY_MEMORY, name: "Rahul" });
  expect(readAreeba("user-a").name).toBe("Rahul");
  expect(readAreeba("user-b").name).toBeUndefined();
  expect(areebaMemoryKey("user-a")).not.toBe(areebaMemoryKey("user-b"));
});
it("syncs an offline keepsake after reconnect instead of overwriting it", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  await saveAreeba("user-a", { ...EMPTY_MEMORY, likes: ["biryani"] });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  db.upsert.mockResolvedValue({ error: null });
  expect((await fetchAreeba("user-a")).likes).toEqual(["biryani"]);
  expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-a", memory: expect.objectContaining({ likes: ["biryani"] }) }));
  expect(localStorage.getItem(`${areebaMemoryKey("user-a")}:pending`)).toBeNull();
});