CREATE TABLE public.capture_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled capture',
  duration_s integer NOT NULL DEFAULT 0,
  transcript text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capture_notes TO authenticated;
GRANT ALL ON public.capture_notes TO service_role;
ALTER TABLE public.capture_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own captures" ON public.capture_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX capture_notes_user_idx ON public.capture_notes (user_id, created_at DESC);