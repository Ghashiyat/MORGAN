CREATE TABLE public.daily_digest (
  day date PRIMARY KEY,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_digest TO authenticated;
GRANT ALL ON public.daily_digest TO service_role;
ALTER TABLE public.daily_digest ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read the daily digest" ON public.daily_digest FOR SELECT TO authenticated USING (true);