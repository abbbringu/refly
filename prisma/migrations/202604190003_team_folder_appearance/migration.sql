ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS icon text,
ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.folders
ADD COLUMN IF NOT EXISTS icon text;
