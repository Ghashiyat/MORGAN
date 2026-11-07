ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS personality jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS importance smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS project text;