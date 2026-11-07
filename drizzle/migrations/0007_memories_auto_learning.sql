ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
CREATE INDEX IF NOT EXISTS memories_user_status_idx ON public.memories (user_id, status, updated_at DESC);