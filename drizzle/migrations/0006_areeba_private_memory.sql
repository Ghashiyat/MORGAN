CREATE TABLE public.areeba_memories (
 user_id uuid PRIMARY KEY NOT NULL,
 memory jsonb NOT NULL DEFAULT '{"likes":[],"hates":[],"laughs":0,"notes":[]}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT areeba_small_memory CHECK (octet_length(memory::text) <= 4096)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.areeba_memories TO authenticated;
GRANT ALL ON public.areeba_memories TO service_role;
ALTER TABLE public.areeba_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own Areeba memory" ON public.areeba_memories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);