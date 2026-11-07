ALTER TABLE public.messages ADD COLUMN reply_to text;
CREATE UNIQUE INDEX messages_one_reply ON public.messages(thread_id, reply_to) WHERE reply_to IS NOT NULL;

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY,
  web_search boolean NOT NULL DEFAULT false,
  voice_input boolean NOT NULL DEFAULT true,
  voice_output boolean NOT NULL DEFAULT true,
  auto_speak boolean NOT NULL DEFAULT false,
  voice_gender text NOT NULL DEFAULT 'male',
  voice_name text,
  memory_enabled boolean NOT NULL DEFAULT true,
  search_blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.user_preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'fact',
  content text NOT NULL,
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memories TO authenticated;
GRANT ALL ON public.memories TO service_role;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memories" ON public.memories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX memories_user_idx ON public.memories(user_id, updated_at DESC);

CREATE TABLE public.provider_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_id text NOT NULL,
  provider text NOT NULL,
  outcome text NOT NULL,
  error_kind text,
  latency_ms integer,
  won boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.provider_logs TO authenticated;
GRANT ALL ON public.provider_logs TO service_role;
ALTER TABLE public.provider_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own logs" ON public.provider_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.search_cache (
  user_id uuid NOT NULL,
  query_key text NOT NULL,
  results jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, query_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_cache TO authenticated;
GRANT ALL ON public.search_cache TO service_role;
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cache" ON public.search_cache FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);