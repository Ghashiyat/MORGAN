CREATE TABLE public.learned_profiles (
  user_id uuid PRIMARY KEY,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learned_profiles TO authenticated;
GRANT ALL ON public.learned_profiles TO service_role;
ALTER TABLE public.learned_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own learned profile" ON public.learned_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);