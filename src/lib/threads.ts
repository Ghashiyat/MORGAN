import { supabase } from "@/integrations/supabase/client";

export async function createThread(userId: string) {
  const { data, error } = await supabase.from("threads").insert({ user_id: userId }).select("id").single();
  if (error) throw error;
  return data.id;
}
