ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paper_summary_model text;
