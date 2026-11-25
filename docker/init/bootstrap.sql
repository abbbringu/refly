-- ============================================================
-- Refly Local / Self-Hosted Idempotent Bootstrap Schema
-- Executed automatically by the docker compose db-init service
-- after GoTrue (auth) and Storage API migrations complete.
-- ============================================================

SET search_path TO public, extensions;

-- Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER DATABASE postgres SET search_path TO "$user", public, extensions;

-- ─── PROFILES ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'pro')),
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  billing_status text,
  plan_renewal_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  billing_grace_until timestamptz,
  billing_last_event_created timestamptz,
  paper_summary_model text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_client_billing_profile_updates()
RETURNS trigger AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.plan, 'free') <> 'free'
      OR NEW.stripe_customer_id IS NOT NULL
      OR NEW.stripe_subscription_id IS NOT NULL
      OR NEW.billing_status IS NOT NULL
      OR NEW.plan_renewal_at IS NOT NULL
      OR coalesce(NEW.cancel_at_period_end, false) <> false
      OR NEW.billing_grace_until IS NOT NULL
      OR NEW.billing_last_event_created IS NOT NULL THEN
      RAISE EXCEPTION 'Billing fields can only be set by the service role';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.billing_status IS DISTINCT FROM OLD.billing_status
    OR NEW.plan_renewal_at IS DISTINCT FROM OLD.plan_renewal_at
    OR NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
    OR NEW.billing_grace_until IS DISTINCT FROM OLD.billing_grace_until
    OR NEW.billing_last_event_created IS DISTINCT FROM OLD.billing_last_event_created THEN
    RAISE EXCEPTION 'Billing fields can only be updated by the service role';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS prevent_client_billing_profile_updates ON public.profiles;
CREATE TRIGGER prevent_client_billing_profile_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_client_billing_profile_updates();

DROP TRIGGER IF EXISTS prevent_client_billing_profile_inserts ON public.profiles;
CREATE TRIGGER prevent_client_billing_profile_inserts
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_client_billing_profile_updates();

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage billing events" ON public.billing_events;
CREATE POLICY "Service role can manage billing events"
  ON public.billing_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── TEAMS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ─── TEAM MEMBERS ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'team_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.team_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role public.team_role NOT NULL DEFAULT 'viewer',
  joined_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ─── SECURITY DEFINER RLS HELPERS ───────────────────────────

CREATE OR REPLACE FUNCTION public.user_team_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_team_ids_with_roles(
  p_user_id uuid,
  p_roles public.team_role[]
)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = p_user_id AND role = ANY(p_roles);
$$;

CREATE OR REPLACE FUNCTION public.user_team_peer_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT tm2.user_id
  FROM public.team_members tm1
  JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
  WHERE tm1.user_id = p_user_id;
$$;

-- ─── Team policies ──────────────────────────────────────────

DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
CREATE POLICY "Team members can view their teams"
  ON public.teams FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (SELECT public.user_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Team owners/admins can update teams" ON public.teams;
CREATE POLICY "Team owners/admins can update teams"
  ON public.teams FOR UPDATE
  USING (id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[])));

DROP POLICY IF EXISTS "Team owners can delete teams" ON public.teams;
CREATE POLICY "Team owners can delete teams"
  ON public.teams FOR DELETE
  USING (id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner']::public.team_role[])));

-- ─── Team members policies ──────────────────────────────────

DROP POLICY IF EXISTS "Team members can view members of their teams" ON public.team_members;
CREATE POLICY "Team members can view members of their teams"
  ON public.team_members FOR SELECT
  USING (team_id IN (SELECT public.user_team_ids(auth.uid())));

DROP POLICY IF EXISTS "Team admins/owners can add members" ON public.team_members;
CREATE POLICY "Team admins/owners can add members"
  ON public.team_members FOR INSERT
  WITH CHECK (
    team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[]))
    OR (user_id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "Team admins/owners can update members" ON public.team_members;
CREATE POLICY "Team admins/owners can update members"
  ON public.team_members FOR UPDATE
  USING (team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[])));

DROP POLICY IF EXISTS "Team admins/owners can remove members" ON public.team_members;
CREATE POLICY "Team admins/owners can remove members"
  ON public.team_members FOR DELETE
  USING (team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[])));

-- ─── TEAM INVITES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_invites (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  role public.team_role NOT NULL DEFAULT 'viewer',
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '7 days') NOT NULL,
  UNIQUE(team_id, email)
);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view invites" ON public.team_invites;
CREATE POLICY "Team members can view invites"
  ON public.team_invites FOR SELECT
  USING (
    team_id IN (SELECT public.user_team_ids(auth.uid()))
    OR email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Team admins/owners can create invites" ON public.team_invites;
CREATE POLICY "Team admins/owners can create invites"
  ON public.team_invites FOR INSERT
  WITH CHECK (
    team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[]))
  );

DROP POLICY IF EXISTS "Invited users can update invite status" ON public.team_invites;
CREATE POLICY "Invited users can update invite status"
  ON public.team_invites FOR UPDATE
  USING (
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Team admins/owners can delete invites" ON public.team_invites;
CREATE POLICY "Team admins/owners can delete invites"
  ON public.team_invites FOR DELETE
  USING (
    team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[]))
  );

-- ─── FOLDERS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.folders (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  color text,
  position int DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own folders" ON public.folders;
CREATE POLICY "Users can view own folders"
  ON public.folders FOR SELECT
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create own folders" ON public.folders;
CREATE POLICY "Users can create own folders"
  ON public.folders FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
    )
  );

DROP POLICY IF EXISTS "Users can update own folders" ON public.folders;
CREATE POLICY "Users can update own folders"
  ON public.folders FOR UPDATE
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
  );

DROP POLICY IF EXISTS "Users can delete own folders" ON public.folders;
CREATE POLICY "Users can delete own folders"
  ON public.folders FOR DELETE
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
  );

-- ─── PAPERS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.papers (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  authors text[] DEFAULT '{}' NOT NULL,
  year int,
  abstract text,
  paper_type text NOT NULL DEFAULT 'article' CHECK (paper_type IN ('article', 'book', 'conference', 'thesis', 'report', 'webpage', 'preprint', 'other')),
  doi text,
  url text,
  metadata jsonb DEFAULT '{}' NOT NULL,
  embedding extensions.vector(3072),
  is_favorite boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own papers" ON public.papers;
CREATE POLICY "Users can view own papers"
  ON public.papers FOR SELECT
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create own papers" ON public.papers;
CREATE POLICY "Users can create own papers"
  ON public.papers FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
    )
  );

DROP POLICY IF EXISTS "Users can update own papers" ON public.papers;
CREATE POLICY "Users can update own papers"
  ON public.papers FOR UPDATE
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
  );

DROP POLICY IF EXISTS "Users can delete own papers" ON public.papers;
CREATE POLICY "Users can delete own papers"
  ON public.papers FOR DELETE
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[]))
  );

CREATE OR REPLACE FUNCTION public.immutable_array_to_string(arr text[], sep text)
RETURNS text AS $$
  SELECT array_to_string(arr, sep);
$$ LANGUAGE sql IMMUTABLE;

CREATE INDEX IF NOT EXISTS papers_fts_idx ON public.papers USING gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(abstract, '') || ' ' || public.immutable_array_to_string(coalesce(authors, '{}'), ' '))
);
CREATE INDEX IF NOT EXISTS papers_doi_idx ON public.papers (doi) WHERE doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS papers_user_idx ON public.papers (user_id);
CREATE INDEX IF NOT EXISTS papers_team_idx ON public.papers (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS papers_personal_scope_idx ON public.papers (user_id) WHERE team_id IS NULL AND embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS papers_team_scope_idx ON public.papers (team_id) WHERE team_id IS NOT NULL AND embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS papers_embedding_hnsw_idx ON public.papers USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops) WHERE embedding IS NOT NULL;

-- ─── PAPER FOLDERS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.paper_folders (
  paper_id uuid REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  folder_id uuid REFERENCES public.folders(id) ON DELETE CASCADE NOT NULL,
  added_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (paper_id, folder_id)
);

ALTER TABLE public.paper_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view paper-folder associations" ON public.paper_folders;
CREATE POLICY "Users can view paper-folder associations"
  ON public.paper_folders FOR SELECT
  USING (
    paper_id IN (SELECT id FROM public.papers WHERE user_id = auth.uid())
    OR folder_id IN (
      SELECT id FROM public.folders WHERE
        user_id = auth.uid()
        OR team_id IN (SELECT public.user_team_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can manage paper-folder associations" ON public.paper_folders;
CREATE POLICY "Users can manage paper-folder associations"
  ON public.paper_folders FOR INSERT
  WITH CHECK (
    paper_id IN (SELECT id FROM public.papers WHERE user_id = auth.uid())
    OR folder_id IN (
      SELECT id FROM public.folders WHERE
        team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
    )
  );

DROP POLICY IF EXISTS "Users can remove paper-folder associations" ON public.paper_folders;
CREATE POLICY "Users can remove paper-folder associations"
  ON public.paper_folders FOR DELETE
  USING (
    paper_id IN (SELECT id FROM public.papers WHERE user_id = auth.uid())
    OR folder_id IN (
      SELECT id FROM public.folders WHERE
        team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
    )
  );

CREATE OR REPLACE FUNCTION public.match_papers(
  query_embedding extensions.vector(3072),
  match_user_id uuid DEFAULT auth.uid(),
  match_team_id uuid DEFAULT NULL,
  match_scope text DEFAULT 'all',
  match_folder_ids uuid[] DEFAULT NULL,
  match_paper_ids uuid[] DEFAULT NULL,
  match_limit int DEFAULT 8,
  match_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  team_id uuid,
  title text,
  authors text[],
  year int,
  abstract text,
  paper_type text,
  doi text,
  url text,
  metadata jsonb,
  is_favorite boolean,
  created_at timestamptz,
  updated_at timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH scoped AS (
    SELECT p.*
    FROM public.papers p
    WHERE p.embedding IS NOT NULL
      AND match_user_id IS NOT NULL
      AND match_scope IN ('all', 'personal', 'team')
      AND (
        (
          match_scope = 'all'
          AND (
            (p.team_id IS NULL AND p.user_id = match_user_id)
            OR p.team_id IN (SELECT public.user_team_ids(match_user_id))
          )
        )
        OR (
          match_scope = 'personal'
          AND p.team_id IS NULL
          AND p.user_id = match_user_id
        )
        OR (
          match_scope = 'team'
          AND match_team_id IS NOT NULL
          AND p.team_id = match_team_id
          AND p.team_id IN (SELECT public.user_team_ids(match_user_id))
        )
      )
      AND (
        (coalesce(array_length(match_folder_ids, 1), 0) = 0 AND coalesce(array_length(match_paper_ids, 1), 0) = 0)
        OR p.id = ANY(coalesce(match_paper_ids, ARRAY[]::uuid[]))
        OR p.id IN (
          SELECT pf.paper_id
          FROM public.paper_folders pf
          WHERE pf.folder_id = ANY(coalesce(match_folder_ids, ARRAY[]::uuid[]))
        )
      )
  )
  SELECT
    s.id,
    s.user_id,
    s.team_id,
    s.title,
    s.authors,
    s.year,
    s.abstract,
    s.paper_type,
    s.doi,
    s.url,
    s.metadata,
    s.is_favorite,
    s.created_at,
    s.updated_at,
    1 - (s.embedding::extensions.halfvec(3072) <=> query_embedding::extensions.halfvec(3072)) AS similarity
  FROM scoped s
  ORDER BY s.embedding::extensions.halfvec(3072) <=> query_embedding::extensions.halfvec(3072)
  LIMIT least(greatest(coalesce(match_limit, 8), 1), 25)
  OFFSET greatest(coalesce(match_offset, 0), 0);
$$;

-- ─── PAPER FILES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.paper_files (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  paper_id uuid REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(paper_id)
);

ALTER TABLE public.paper_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own paper files" ON public.paper_files;
CREATE POLICY "Users can view own paper files"
  ON public.paper_files FOR SELECT
  USING (
    paper_id IN (
      SELECT id FROM public.papers WHERE
        user_id = auth.uid()
        OR team_id IN (SELECT public.user_team_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can create paper files" ON public.paper_files;
CREATE POLICY "Users can create paper files"
  ON public.paper_files FOR INSERT
  WITH CHECK (
    paper_id IN (
      SELECT id FROM public.papers WHERE
        user_id = auth.uid()
        OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
    )
  );

DROP POLICY IF EXISTS "Users can delete own paper files" ON public.paper_files;
CREATE POLICY "Users can delete own paper files"
  ON public.paper_files FOR DELETE
  USING (
    paper_id IN (
      SELECT id FROM public.papers WHERE
        user_id = auth.uid()
        OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin']::public.team_role[]))
    )
  );

CREATE OR REPLACE FUNCTION public.delete_paper_storage_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_paper_storage_object_trigger ON public.paper_files;
CREATE TRIGGER delete_paper_storage_object_trigger
  AFTER DELETE ON public.paper_files
  FOR EACH ROW EXECUTE FUNCTION public.delete_paper_storage_object();

-- ─── PAPER CHUNKS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.paper_chunks (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  paper_id uuid REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  page_number int,
  section_title text,
  content text NOT NULL,
  token_count int,
  embedding extensions.vector(3072),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(paper_id, chunk_index)
);

ALTER TABLE public.paper_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own paper chunks" ON public.paper_chunks;
CREATE POLICY "Users can view own paper chunks"
  ON public.paper_chunks FOR SELECT
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create own paper chunks" ON public.paper_chunks;
CREATE POLICY "Users can create own paper chunks"
  ON public.paper_chunks FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
    )
  );

DROP POLICY IF EXISTS "Users can update own paper chunks" ON public.paper_chunks;
CREATE POLICY "Users can update own paper chunks"
  ON public.paper_chunks FOR UPDATE
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
  );

DROP POLICY IF EXISTS "Users can delete own paper chunks" ON public.paper_chunks;
CREATE POLICY "Users can delete own paper chunks"
  ON public.paper_chunks FOR DELETE
  USING (
    user_id = auth.uid()
    OR team_id IN (SELECT public.user_team_ids_with_roles(auth.uid(), ARRAY['owner','admin','editor']::public.team_role[]))
  );

CREATE INDEX IF NOT EXISTS paper_chunks_paper_idx ON public.paper_chunks (paper_id);
CREATE INDEX IF NOT EXISTS paper_chunks_user_idx ON public.paper_chunks (user_id) WHERE team_id IS NULL AND embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS paper_chunks_team_idx ON public.paper_chunks (team_id) WHERE team_id IS NOT NULL AND embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS paper_chunks_embedding_hnsw_idx ON public.paper_chunks USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops) WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.match_paper_chunks(
  query_embedding extensions.vector(3072),
  match_user_id uuid DEFAULT auth.uid(),
  match_team_id uuid DEFAULT NULL,
  match_scope text DEFAULT 'all',
  match_folder_ids uuid[] DEFAULT NULL,
  match_paper_ids uuid[] DEFAULT NULL,
  match_limit int DEFAULT 20,
  match_offset int DEFAULT 0
)
RETURNS TABLE (
  chunk_id uuid,
  paper_id uuid,
  user_id uuid,
  team_id uuid,
  chunk_index int,
  page_number int,
  section_title text,
  content text,
  token_count int,
  title text,
  authors text[],
  year int,
  doi text,
  url text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH scoped AS (
    SELECT pc.*, p.title, p.authors, p.year, p.doi, p.url
    FROM public.paper_chunks pc
    JOIN public.papers p ON p.id = pc.paper_id
    WHERE pc.embedding IS NOT NULL
      AND match_user_id IS NOT NULL
      AND match_scope IN ('all', 'personal', 'team')
      AND (
        (
          match_scope = 'all'
          AND (
            (pc.team_id IS NULL AND pc.user_id = match_user_id)
            OR pc.team_id IN (SELECT public.user_team_ids(match_user_id))
          )
        )
        OR (
          match_scope = 'personal'
          AND pc.team_id IS NULL
          AND pc.user_id = match_user_id
        )
        OR (
          match_scope = 'team'
          AND match_team_id IS NOT NULL
          AND pc.team_id = match_team_id
          AND pc.team_id IN (SELECT public.user_team_ids(match_user_id))
        )
      )
      AND (
        (coalesce(array_length(match_folder_ids, 1), 0) = 0 AND coalesce(array_length(match_paper_ids, 1), 0) = 0)
        OR pc.paper_id = ANY(coalesce(match_paper_ids, ARRAY[]::uuid[]))
        OR pc.paper_id IN (
          SELECT pf.paper_id
          FROM public.paper_folders pf
          WHERE pf.folder_id = ANY(coalesce(match_folder_ids, ARRAY[]::uuid[]))
        )
      )
  )
  SELECT
    s.id AS chunk_id,
    s.paper_id,
    s.user_id,
    s.team_id,
    s.chunk_index,
    s.page_number,
    s.section_title,
    s.content,
    s.token_count,
    s.title,
    s.authors,
    s.year,
    s.doi,
    s.url,
    1 - (s.embedding::extensions.halfvec(3072) <=> query_embedding::extensions.halfvec(3072)) AS similarity
  FROM scoped s
  ORDER BY s.embedding::extensions.halfvec(3072) <=> query_embedding::extensions.halfvec(3072)
  LIMIT least(greatest(coalesce(match_limit, 20), 1), 50)
  OFFSET greatest(coalesce(match_offset, 0), 0);
$$;

-- ─── NOTES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  paper_id uuid REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notes and team notes" ON public.notes;
CREATE POLICY "Users can view own notes and team notes"
  ON public.notes FOR SELECT
  USING (
    user_id = auth.uid()
    OR paper_id IN (
      SELECT id FROM public.papers WHERE
        team_id IN (SELECT public.user_team_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can create notes" ON public.notes;
CREATE POLICY "Users can create notes"
  ON public.notes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;
CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (user_id = auth.uid());

-- ─── TAGS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tags" ON public.tags;
CREATE POLICY "Users can view own tags"
  ON public.tags FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create tags" ON public.tags;
CREATE POLICY "Users can create tags"
  ON public.tags FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own tags" ON public.tags;
CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own tags" ON public.tags;
CREATE POLICY "Users can delete own tags"
  ON public.tags FOR DELETE
  USING (user_id = auth.uid());

-- ─── PAPER TAGS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.paper_tags (
  paper_id uuid REFERENCES public.papers(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (paper_id, tag_id)
);

ALTER TABLE public.paper_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view paper tags" ON public.paper_tags;
CREATE POLICY "Users can view paper tags"
  ON public.paper_tags FOR SELECT
  USING (tag_id IN (SELECT id FROM public.tags WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can add paper tags" ON public.paper_tags;
CREATE POLICY "Users can add paper tags"
  ON public.paper_tags FOR INSERT
  WITH CHECK (tag_id IN (SELECT id FROM public.tags WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can remove paper tags" ON public.paper_tags;
CREATE POLICY "Users can remove paper tags"
  ON public.paper_tags FOR DELETE
  USING (tag_id IN (SELECT id FROM public.tags WHERE user_id = auth.uid()));

-- ─── PROFILES VISIBILITY FOR TEAM MEMBERS ───────────────────

DROP POLICY IF EXISTS "Team members can view each other's profiles" ON public.profiles;
CREATE POLICY "Team members can view each other's profiles"
  ON public.profiles FOR SELECT
  USING (id IN (SELECT public.user_team_peer_ids(auth.uid())));

-- ─── UPDATED AT TRIGGER ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

DROP TRIGGER IF EXISTS update_teams_updated_at ON public.teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

DROP TRIGGER IF EXISTS update_folders_updated_at ON public.folders;
CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

DROP TRIGGER IF EXISTS update_papers_updated_at ON public.papers;
CREATE TRIGGER update_papers_updated_at
  BEFORE UPDATE ON public.papers
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

-- ─── CHAT CONVERSATIONS & MESSAGES ──────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New conversation',
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  selected_folder_ids uuid[] DEFAULT '{}' NOT NULL,
  selected_paper_ids uuid[] DEFAULT '{}' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_message_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations"
  ON public.chat_conversations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own conversations" ON public.chat_conversations;
CREATE POLICY "Users can create own conversations"
  ON public.chat_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations"
  ON public.chat_conversations FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own conversations" ON public.chat_conversations;
CREATE POLICY "Users can delete own conversations"
  ON public.chat_conversations FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS chat_conversations_user_last_message_idx
  ON public.chat_conversations (user_id, last_message_at DESC);

DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources jsonb DEFAULT '[]' NOT NULL,
  token_usage jsonb DEFAULT '{}' NOT NULL,
  model text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages of own conversations" ON public.chat_messages;
CREATE POLICY "Users can view messages of own conversations"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert messages into own conversations" ON public.chat_messages;
CREATE POLICY "Users can insert messages into own conversations"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete messages in own conversations" ON public.chat_messages;
CREATE POLICY "Users can delete messages in own conversations"
  ON public.chat_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
  ON public.chat_messages (conversation_id, created_at);

-- ─── AI USAGE EVENTS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  feature text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('chat_completion', 'embedding')),
  prompt_tokens integer DEFAULT 0 NOT NULL,
  completion_tokens integer DEFAULT 0 NOT NULL,
  total_tokens integer DEFAULT 0 NOT NULL,
  estimated_cost_usd numeric(12,8) DEFAULT 0 NOT NULL,
  metadata jsonb DEFAULT '{}' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own AI usage" ON public.ai_usage_events;
CREATE POLICY "Users can view own AI usage"
  ON public.ai_usage_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own AI usage" ON public.ai_usage_events;
CREATE POLICY "Users can create own AI usage"
  ON public.ai_usage_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_feature_idx
  ON public.ai_usage_events (user_id, feature, created_at DESC);

-- ─── STORAGE USAGE & QUOTAS ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.plan_storage_limit_bytes(p_plan text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_plan, 'free'))
    WHEN 'free' THEN 350::bigint * 1024 * 1024
    WHEN 'plus' THEN 5::bigint * 1024 * 1024 * 1024
    WHEN 'pro' THEN 15::bigint * 1024 * 1024 * 1024
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.effective_billing_plan(
  p_plan text,
  p_billing_status text,
  p_billing_grace_until timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_plan, 'free')) NOT IN ('plus', 'pro') THEN 'free'
    WHEN p_billing_status IN ('active', 'trialing') THEN lower(p_plan)
    WHEN p_billing_status = 'past_due'
      AND p_billing_grace_until IS NOT NULL
      AND p_billing_grace_until > now()
      THEN lower(p_plan)
    ELSE 'free'
  END;
$$;

CREATE OR REPLACE FUNCTION public.team_owner_user_id(p_team_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tm.user_id
  FROM public.team_members tm
  WHERE tm.team_id = p_team_id
    AND tm.role = 'owner'
  ORDER BY tm.joined_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_storage_usage(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, storage
AS $$
DECLARE
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_plan text := 'free';
  v_file_bytes bigint := 0;
  v_note_bytes bigint := 0;
  v_metadata_bytes bigint := 0;
  v_chat_bytes bigint := 0;
  v_chat_message_bytes bigint := 0;
  v_chat_metadata_bytes bigint := 0;
  v_total_bytes bigint := 0;
  v_limit_bytes bigint;
  v_remaining_bytes bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT public.effective_billing_plan(plan, billing_status, billing_grace_until)
  INTO v_plan
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_plan NOT IN ('free', 'plus', 'pro') THEN
    v_plan := 'free';
  END IF;

  v_limit_bytes := public.plan_storage_limit_bytes(v_plan);

  SELECT coalesce(sum(pf.file_size), 0)
  INTO v_file_bytes
  FROM public.paper_files pf
  JOIN public.papers p ON p.id = pf.paper_id
  WHERE (
    (p.team_id IS NULL AND p.user_id = v_user_id)
    OR (p.team_id IS NOT NULL AND public.team_owner_user_id(p.team_id) = v_user_id)
  );

  SELECT coalesce(sum(
    octet_length(coalesce(n.title, '')) +
    octet_length(coalesce(n.content, ''))
  ), 0)
  INTO v_note_bytes
  FROM public.notes n
  JOIN public.papers p ON p.id = n.paper_id
  WHERE (
    (p.team_id IS NULL AND n.user_id = v_user_id)
    OR (p.team_id IS NOT NULL AND public.team_owner_user_id(p.team_id) = v_user_id)
  );

  SELECT coalesce(sum(
    octet_length(coalesce(p.title, '')) +
    octet_length(coalesce(array_to_string(p.authors, ','), '')) +
    octet_length(coalesce(p.abstract, '')) +
    octet_length(coalesce(p.doi, '')) +
    octet_length(coalesce(p.url, '')) +
    octet_length(coalesce(p.metadata::text, '{}'))
  ), 0)
  INTO v_metadata_bytes
  FROM public.papers p
  WHERE (
    (p.team_id IS NULL AND p.user_id = v_user_id)
    OR (p.team_id IS NOT NULL AND public.team_owner_user_id(p.team_id) = v_user_id)
  );

  SELECT coalesce(sum(
    octet_length(coalesce(cc.title, '')) +
    octet_length(coalesce(cc.model, ''))
  ), 0)
  INTO v_chat_metadata_bytes
  FROM public.chat_conversations cc
  WHERE (
    (cc.team_id IS NULL AND cc.user_id = v_user_id)
    OR (cc.team_id IS NOT NULL AND public.team_owner_user_id(cc.team_id) = v_user_id)
  );

  SELECT coalesce(sum(
    octet_length(coalesce(cm.content, '')) +
    octet_length(coalesce(cm.sources::text, '[]')) +
    octet_length(coalesce(cm.token_usage::text, '{}')) +
    octet_length(coalesce(cm.model, ''))
  ), 0)
  INTO v_chat_message_bytes
  FROM public.chat_messages cm
  JOIN public.chat_conversations cc ON cc.id = cm.conversation_id
  WHERE (
    (cc.team_id IS NULL AND cc.user_id = v_user_id)
    OR (cc.team_id IS NOT NULL AND public.team_owner_user_id(cc.team_id) = v_user_id)
  );

  v_chat_bytes := v_chat_message_bytes + v_chat_metadata_bytes;
  v_total_bytes := v_file_bytes + v_note_bytes + v_metadata_bytes + v_chat_bytes;

  IF v_limit_bytes IS NULL THEN
    v_remaining_bytes := NULL;
  ELSE
    v_remaining_bytes := greatest(v_limit_bytes - v_total_bytes, 0);
  END IF;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'file_bytes', v_file_bytes,
    'note_bytes', v_note_bytes,
    'metadata_bytes', v_metadata_bytes,
    'chat_bytes', v_chat_bytes,
    'total_bytes', v_total_bytes,
    'limit_bytes', v_limit_bytes,
    'remaining_bytes', v_remaining_bytes,
    'is_over_limit', (v_limit_bytes IS NOT NULL AND v_total_bytes > v_limit_bytes)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_storage_quota(
  p_additional_bytes bigint,
  p_user_id uuid DEFAULT auth.uid(),
  p_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, storage
AS $$
DECLARE
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_team_owner_user_id uuid;
  v_usage jsonb;
  v_plan text := 'free';
  v_current_bytes bigint := 0;
  v_additional_bytes bigint := greatest(coalesce(p_additional_bytes, 0), 0);
  v_projected_total_bytes bigint := 0;
  v_limit_bytes bigint;
  v_remaining_bytes bigint;
  v_over_by_bytes bigint := 0;
  v_allowed boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = p_team_id
        AND tm.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    v_team_owner_user_id := public.team_owner_user_id(p_team_id);

    IF v_team_owner_user_id IS NULL THEN
      RAISE EXCEPTION 'Team owner not found';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> v_team_owner_user_id THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    v_user_id := v_team_owner_user_id;
  ELSIF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_usage := public.get_storage_usage(v_user_id);
  v_plan := coalesce(v_usage ->> 'plan', 'free');
  v_current_bytes := coalesce((v_usage ->> 'total_bytes')::bigint, 0);
  v_limit_bytes := nullif(v_usage ->> 'limit_bytes', '')::bigint;
  v_projected_total_bytes := v_current_bytes + v_additional_bytes;

  IF v_limit_bytes IS NULL THEN
    v_remaining_bytes := NULL;
  ELSE
    v_remaining_bytes := greatest(v_limit_bytes - v_projected_total_bytes, 0);
    v_over_by_bytes := greatest(v_projected_total_bytes - v_limit_bytes, 0);
    v_allowed := v_projected_total_bytes <= v_limit_bytes;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'plan', v_plan,
    'current_bytes', v_current_bytes,
    'additional_bytes', v_additional_bytes,
    'projected_total_bytes', v_projected_total_bytes,
    'limit_bytes', v_limit_bytes,
    'remaining_bytes', v_remaining_bytes,
    'over_by_bytes', v_over_by_bytes
  );
END;
$$;

-- ─── GRANTS FOR POSTGREST ROLES ─────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_storage_usage(uuid) FROM public;
REVOKE ALL ON FUNCTION public.team_owner_user_id(uuid) FROM public;
REVOKE ALL ON FUNCTION public.check_storage_quota(bigint, uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.effective_billing_plan(text, text, timestamptz) FROM public;

GRANT EXECUTE ON FUNCTION public.get_storage_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_owner_user_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_storage_quota(bigint, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_billing_plan(text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_team_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_team_ids_with_roles(uuid, public.team_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_team_peer_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_papers(extensions.vector, uuid, uuid, text, uuid[], uuid[], int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_paper_chunks(extensions.vector, uuid, uuid, text, uuid[], uuid[], int, int) TO authenticated, service_role;

-- ─── STORAGE BUCKET & POLICIES ──────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('papers', 'papers', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Refly users can upload own papers" ON storage.objects;
CREATE POLICY "Refly users can upload own papers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'papers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Refly users can read own and team papers" ON storage.objects;
CREATE POLICY "Refly users can read own and team papers"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'papers'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR name IN (
        SELECT pf.file_path
        FROM public.paper_files pf
        JOIN public.papers p ON p.id = pf.paper_id
        WHERE p.team_id IN (SELECT public.user_team_ids(auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "Refly users can update own papers" ON storage.objects;
CREATE POLICY "Refly users can update own papers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'papers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Refly users can delete own papers" ON storage.objects;
CREATE POLICY "Refly users can delete own papers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'papers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
