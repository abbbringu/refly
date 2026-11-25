-- ============================================================
-- Refly Database Schema
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ─── PROFILES ───────────────────────────────────────────────

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  billing_status text,
  plan_renewal_at timestamptz,
  cancel_at_period_end boolean not null default false,
  billing_grace_until timestamptz,
  billing_last_event_created timestamptz,
  paper_summary_model text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create or replace function public.prevent_client_billing_profile_updates()
returns trigger as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.plan, 'free') <> 'free'
      or new.stripe_customer_id is not null
      or new.stripe_subscription_id is not null
      or new.billing_status is not null
      or new.plan_renewal_at is not null
      or coalesce(new.cancel_at_period_end, false) <> false
      or new.billing_grace_until is not null
      or new.billing_last_event_created is not null then
      raise exception 'Billing fields can only be set by the service role';
    end if;

    return new;
  end if;

  if new.plan is distinct from old.plan
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.billing_status is distinct from old.billing_status
    or new.plan_renewal_at is distinct from old.plan_renewal_at
    or new.cancel_at_period_end is distinct from old.cancel_at_period_end
    or new.billing_grace_until is distinct from old.billing_grace_until
    or new.billing_last_event_created is distinct from old.billing_last_event_created then
    raise exception 'Billing fields can only be updated by the service role';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger prevent_client_billing_profile_updates
  before update on public.profiles
  for each row execute procedure public.prevent_client_billing_profile_updates();

create trigger prevent_client_billing_profile_inserts
  before insert on public.profiles
  for each row execute procedure public.prevent_client_billing_profile_updates();

create table public.billing_events (
  id uuid primary key default uuid_generate_v4(),
  stripe_event_id text not null unique,
  event_type text not null,
  status text not null default 'processing',
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;

create policy "Service role can manage billing events"
  on public.billing_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── TEAMS ──────────────────────────────────────────────────

create table public.teams (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  icon text,
  color text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.teams enable row level security;

-- ─── TEAM MEMBERS ───────────────────────────────────────────

create type public.team_role as enum ('owner', 'admin', 'editor', 'viewer');

create table public.team_members (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role public.team_role not null default 'viewer',
  joined_at timestamptz default now() not null,
  unique(team_id, user_id)
);

alter table public.team_members enable row level security;

-- ═══════════════════════════════════════════════════════════
-- SECURITY DEFINER helpers — bypass RLS to avoid infinite
-- recursion when policies on team_members (or other tables)
-- subquery back into team_members.
-- ═══════════════════════════════════════════════════════════

-- Returns all team IDs the given user belongs to
create or replace function public.user_team_ids(p_user_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select team_id from public.team_members where user_id = p_user_id;
$$;

-- Returns team IDs where the user has one of the given roles
create or replace function public.user_team_ids_with_roles(
  p_user_id uuid,
  p_roles public.team_role[]
)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select team_id from public.team_members
  where user_id = p_user_id and role = any(p_roles);
$$;

-- Returns peer user IDs (users who share a team with the given user)
create or replace function public.user_team_peer_ids(p_user_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct tm2.user_id
  from public.team_members tm1
  join public.team_members tm2 on tm1.team_id = tm2.team_id
  where tm1.user_id = p_user_id;
$$;

-- ═══════════════════════════════════════════════════════════
-- POLICIES — using the SECURITY DEFINER helpers above
-- ═══════════════════════════════════════════════════════════

-- ─── Team policies ──────────────────────────────────────────

create policy "Team members can view their teams"
  on public.teams for select
  using (
    created_by = auth.uid()
    or id in (select public.user_team_ids(auth.uid()))
  );

create policy "Authenticated users can create teams"
  on public.teams for insert
  with check (auth.uid() = created_by);

create policy "Team owners/admins can update teams"
  on public.teams for update
  using (id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[])));

create policy "Team owners can delete teams"
  on public.teams for delete
  using (id in (select public.user_team_ids_with_roles(auth.uid(), array['owner']::public.team_role[])));

-- ─── Team members policies ──────────────────────────────────

create policy "Team members can view members of their teams"
  on public.team_members for select
  using (team_id in (select public.user_team_ids(auth.uid())));

create policy "Team admins/owners can add members"
  on public.team_members for insert
  with check (
    team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[]))
    -- Also allow a user to add themselves when creating a brand-new team
    or (user_id = auth.uid() and role = 'owner')
  );

create policy "Team admins/owners can update members"
  on public.team_members for update
  using (team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[])));

create policy "Team admins/owners can remove members"
  on public.team_members for delete
  using (team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[])));

-- ─── TEAM INVITES ────────────────────────────────────────────

create table public.team_invites (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  email text not null,
  role public.team_role not null default 'viewer',
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now() not null,
  expires_at timestamptz default (now() + interval '7 days') not null,
  unique(team_id, email)
);

alter table public.team_invites enable row level security;

create policy "Team members can view invites"
  on public.team_invites for select
  using (
    team_id in (select public.user_team_ids(auth.uid()))
    or email = (select email from public.profiles where id = auth.uid())
  );

create policy "Team admins/owners can create invites"
  on public.team_invites for insert
  with check (
    team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[]))
  );

create policy "Invited users can update invite status"
  on public.team_invites for update
  using (
    email = (select email from public.profiles where id = auth.uid())
  );

create policy "Team admins/owners can delete invites"
  on public.team_invites for delete
  using (
    team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[]))
  );

-- ─── FOLDERS ────────────────────────────────────────────────

create table public.folders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  position int default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.folders enable row level security;

create policy "Users can view own folders"
  on public.folders for select
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids(auth.uid()))
  );

create policy "Users can create own folders"
  on public.folders for insert
  with check (
    user_id = auth.uid()
    and (
      team_id is null
      or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
    )
  );

create policy "Users can update own folders"
  on public.folders for update
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
  );

create policy "Users can delete own folders"
  on public.folders for delete
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
  );

-- ─── PAPERS ─────────────────────────────────────────────────

create table public.papers (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null,
  authors text[] default '{}' not null,
  year int,
  abstract text,
  paper_type text not null default 'article' check (paper_type in ('article', 'book', 'conference', 'thesis', 'report', 'webpage', 'preprint', 'other')),
  doi text,
  url text,
  metadata jsonb default '{}' not null,
  embedding vector(3072),
  is_favorite boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.papers enable row level security;

create policy "Users can view own papers"
  on public.papers for select
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids(auth.uid()))
  );

create policy "Users can create own papers"
  on public.papers for insert
  with check (
    user_id = auth.uid()
    and (
      team_id is null
      or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
    )
  );

create policy "Users can update own papers"
  on public.papers for update
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
  );

create policy "Users can delete own papers"
  on public.papers for delete
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[]))
  );

-- Full text search: use an immutable helper for the authors array
create or replace function public.immutable_array_to_string(arr text[], sep text)
returns text as $$
  select array_to_string(arr, sep);
$$ language sql immutable;

-- Full text search index
create index papers_fts_idx on public.papers using gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(abstract, '') || ' ' || public.immutable_array_to_string(coalesce(authors, '{}'), ' '))
);

create index papers_doi_idx on public.papers (doi) where doi is not null;
create index papers_user_idx on public.papers (user_id);
create index papers_team_idx on public.papers (team_id) where team_id is not null;
create index papers_personal_scope_idx on public.papers (user_id) where team_id is null and embedding is not null;
create index papers_team_scope_idx on public.papers (team_id) where team_id is not null and embedding is not null;
create index papers_embedding_hnsw_idx on public.papers using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops) where embedding is not null;
create or replace function public.match_papers(
  query_embedding vector(3072),
  match_user_id uuid default auth.uid(),
  match_team_id uuid default null,
  match_scope text default 'all',
  match_folder_ids uuid[] default null,
  match_paper_ids uuid[] default null,
  match_limit int default 8,
  match_offset int default 0
)
returns table (
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
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select p.*
    from public.papers p
    where p.embedding is not null
      and match_user_id is not null
      and match_scope in ('all', 'personal', 'team')
      and (
        (
          match_scope = 'all'
          and (
            (p.team_id is null and p.user_id = match_user_id)
            or p.team_id in (select public.user_team_ids(match_user_id))
          )
        )
        or (
          match_scope = 'personal'
          and p.team_id is null
          and p.user_id = match_user_id
        )
        or (
          match_scope = 'team'
          and match_team_id is not null
          and p.team_id = match_team_id
          and p.team_id in (select public.user_team_ids(match_user_id))
        )
      )
      and (
        (coalesce(array_length(match_folder_ids, 1), 0) = 0 and coalesce(array_length(match_paper_ids, 1), 0) = 0)
        or p.id = any(coalesce(match_paper_ids, array[]::uuid[]))
        or p.id in (
          select pf.paper_id
          from public.paper_folders pf
          where pf.folder_id = any(coalesce(match_folder_ids, array[]::uuid[]))
        )
      )
  )
  select
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
    1 - (s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from scoped s
  order by s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit least(greatest(coalesce(match_limit, 8), 1), 25)
  offset greatest(coalesce(match_offset, 0), 0);
$$;

-- ─── PAPER FOLDERS ──────────────────────────────────────────

create table public.paper_folders (
  paper_id uuid references public.papers(id) on delete cascade not null,
  folder_id uuid references public.folders(id) on delete cascade not null,
  added_at timestamptz default now() not null,
  primary key (paper_id, folder_id)
);

alter table public.paper_folders enable row level security;

create policy "Users can view paper-folder associations"
  on public.paper_folders for select
  using (
    paper_id in (select id from public.papers where user_id = auth.uid())
    or folder_id in (
      select id from public.folders where
        user_id = auth.uid()
        or team_id in (select public.user_team_ids(auth.uid()))
    )
  );

create policy "Users can manage paper-folder associations"
  on public.paper_folders for insert
  with check (
    paper_id in (select id from public.papers where user_id = auth.uid())
    or folder_id in (
      select id from public.folders where
        team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
    )
  );

create policy "Users can remove paper-folder associations"
  on public.paper_folders for delete
  using (
    paper_id in (select id from public.papers where user_id = auth.uid())
    or folder_id in (
      select id from public.folders where
        team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
    )
  );

-- ─── PAPER FILES ────────────────────────────────────────────

create table public.paper_files (
  id uuid default uuid_generate_v4() primary key,
  paper_id uuid references public.papers(id) on delete cascade not null,
  file_name text not null,
  file_path text not null,
  file_size bigint not null,
  mime_type text not null default 'application/pdf',
  created_at timestamptz default now() not null,
  unique(paper_id)
);

alter table public.paper_files enable row level security;

create policy "Users can view own paper files"
  on public.paper_files for select
  using (
    paper_id in (
      select id from public.papers where
        user_id = auth.uid()
        or team_id in (select public.user_team_ids(auth.uid()))
    )
  );

create policy "Users can create paper files"
  on public.paper_files for insert
  with check (
    paper_id in (
      select id from public.papers where
        user_id = auth.uid()
        or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
    )
  );

create policy "Users can delete own paper files"
  on public.paper_files for delete
  using (
    paper_id in (
      select id from public.papers where
        user_id = auth.uid()
        or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin']::public.team_role[]))
    )
  );

create or replace function public.delete_paper_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  -- Storage objects must be deleted through the Storage API, not direct SQL.
  -- This trigger intentionally no-ops to avoid blocking paper record deletion.
  return old;
end;
$$;

-- ─── PAPER CHUNKS ───────────────────────────────────────────

create table public.paper_chunks (
  id uuid default uuid_generate_v4() primary key,
  paper_id uuid references public.papers(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade,
  chunk_index int not null,
  page_number int,
  section_title text,
  content text not null,
  token_count int,
  embedding vector(3072),
  created_at timestamptz default now() not null,
  unique(paper_id, chunk_index)
);

alter table public.paper_chunks enable row level security;

create policy "Users can view own paper chunks"
  on public.paper_chunks for select
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids(auth.uid()))
  );

create policy "Users can create own paper chunks"
  on public.paper_chunks for insert
  with check (
    user_id = auth.uid()
    and (
      team_id is null
      or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
    )
  );

create policy "Users can update own paper chunks"
  on public.paper_chunks for update
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
  );

create policy "Users can delete own paper chunks"
  on public.paper_chunks for delete
  using (
    user_id = auth.uid()
    or team_id in (select public.user_team_ids_with_roles(auth.uid(), array['owner','admin','editor']::public.team_role[]))
  );

create index paper_chunks_paper_idx on public.paper_chunks (paper_id);
create index paper_chunks_user_idx on public.paper_chunks (user_id) where team_id is null and embedding is not null;
create index paper_chunks_team_idx on public.paper_chunks (team_id) where team_id is not null and embedding is not null;
create index paper_chunks_embedding_hnsw_idx on public.paper_chunks using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops) where embedding is not null;

create or replace function public.match_paper_chunks(
  query_embedding vector(3072),
  match_user_id uuid default auth.uid(),
  match_team_id uuid default null,
  match_scope text default 'all',
  match_folder_ids uuid[] default null,
  match_paper_ids uuid[] default null,
  match_limit int default 20,
  match_offset int default 0
)
returns table (
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
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select pc.*, p.title, p.authors, p.year, p.doi, p.url
    from public.paper_chunks pc
    join public.papers p on p.id = pc.paper_id
    where pc.embedding is not null
      and match_user_id is not null
      and match_scope in ('all', 'personal', 'team')
      and (
        (
          match_scope = 'all'
          and (
            (pc.team_id is null and pc.user_id = match_user_id)
            or pc.team_id in (select public.user_team_ids(match_user_id))
          )
        )
        or (
          match_scope = 'personal'
          and pc.team_id is null
          and pc.user_id = match_user_id
        )
        or (
          match_scope = 'team'
          and match_team_id is not null
          and pc.team_id = match_team_id
          and pc.team_id in (select public.user_team_ids(match_user_id))
        )
      )
      and (
        (coalesce(array_length(match_folder_ids, 1), 0) = 0 and coalesce(array_length(match_paper_ids, 1), 0) = 0)
        or pc.paper_id = any(coalesce(match_paper_ids, array[]::uuid[]))
        or pc.paper_id in (
          select pf.paper_id
          from public.paper_folders pf
          where pf.folder_id = any(coalesce(match_folder_ids, array[]::uuid[]))
        )
      )
  )
  select
    s.id as chunk_id,
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
    1 - (s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from scoped s
  order by s.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit least(greatest(coalesce(match_limit, 20), 1), 50)
  offset greatest(coalesce(match_offset, 0), 0);
$$;

drop trigger if exists delete_paper_storage_object_trigger on public.paper_files;

create trigger delete_paper_storage_object_trigger
  after delete on public.paper_files
  for each row execute function public.delete_paper_storage_object();

-- ─── NOTES ──────────────────────────────────────────────────

create table public.notes (
  id uuid default uuid_generate_v4() primary key,
  paper_id uuid references public.papers(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text,
  content text not null default '',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.notes enable row level security;

create policy "Users can view own notes and team notes"
  on public.notes for select
  using (
    user_id = auth.uid()
    or paper_id in (
      select id from public.papers where
        team_id in (select public.user_team_ids(auth.uid()))
    )
  );

create policy "Users can create notes"
  on public.notes for insert
  with check (user_id = auth.uid());

create policy "Users can update own notes"
  on public.notes for update
  using (user_id = auth.uid());

create policy "Users can delete own notes"
  on public.notes for delete
  using (user_id = auth.uid());

-- ─── TAGS ───────────────────────────────────────────────────

create table public.tags (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  color text,
  created_at timestamptz default now() not null,
  unique(user_id, name)
);

alter table public.tags enable row level security;

create policy "Users can view own tags"
  on public.tags for select
  using (user_id = auth.uid());

create policy "Users can create tags"
  on public.tags for insert
  with check (user_id = auth.uid());

create policy "Users can update own tags"
  on public.tags for update
  using (user_id = auth.uid());

create policy "Users can delete own tags"
  on public.tags for delete
  using (user_id = auth.uid());

-- ─── PAPER TAGS ─────────────────────────────────────────────

create table public.paper_tags (
  paper_id uuid references public.papers(id) on delete cascade not null,
  tag_id uuid references public.tags(id) on delete cascade not null,
  primary key (paper_id, tag_id)
);

alter table public.paper_tags enable row level security;

create policy "Users can view paper tags"
  on public.paper_tags for select
  using (
    tag_id in (select id from public.tags where user_id = auth.uid())
  );

create policy "Users can add paper tags"
  on public.paper_tags for insert
  with check (
    tag_id in (select id from public.tags where user_id = auth.uid())
  );

create policy "Users can remove paper tags"
  on public.paper_tags for delete
  using (
    tag_id in (select id from public.tags where user_id = auth.uid())
  );

-- ─── PROFILES VISIBILITY for team members ───────────────────

create policy "Team members can view each other's profiles"
  on public.profiles for select
  using (id in (select public.user_team_peer_ids(auth.uid())));

-- ─── Updated At Trigger ─────────────────────────────────────

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();

create trigger update_teams_updated_at
  before update on public.teams
  for each row execute procedure public.update_updated_at();

create trigger update_folders_updated_at
  before update on public.folders
  for each row execute procedure public.update_updated_at();

create trigger update_papers_updated_at
  before update on public.papers
  for each row execute procedure public.update_updated_at();

create trigger update_notes_updated_at
  before update on public.notes
  for each row execute procedure public.update_updated_at();

-- ─── STORAGE USAGE & QUOTAS ──────────────────────────────────

create or replace function public.plan_storage_limit_bytes(p_plan text)
returns bigint
language sql
immutable
as $$
  select case lower(coalesce(p_plan, 'free'))
    when 'free' then 350::bigint * 1024 * 1024
    when 'plus' then 5::bigint * 1024 * 1024 * 1024
    when 'pro' then 15::bigint * 1024 * 1024 * 1024
    else 200::bigint * 1024 * 1024
  end;
$$;

create or replace function public.effective_billing_plan(
  p_plan text,
  p_billing_status text,
  p_billing_grace_until timestamptz
)
returns text
language sql
stable
as $$
  select case
    when lower(coalesce(p_plan, 'free')) not in ('plus', 'pro') then 'free'
    when p_billing_status in ('active', 'trialing') then lower(p_plan)
    when p_billing_status = 'past_due'
      and p_billing_grace_until is not null
      and p_billing_grace_until > now()
      then lower(p_plan)
    else 'free'
  end;
$$;

create or replace function public.team_owner_user_id(p_team_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select tm.user_id
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.role = 'owner'
  order by tm.joined_at asc
  limit 1;
$$;

create or replace function public.get_storage_usage(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare
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
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  select public.effective_billing_plan(plan, billing_status, billing_grace_until)
  into v_plan
  from public.profiles
  where id = v_user_id;

  if v_plan not in ('free', 'plus', 'pro') then
    v_plan := 'free';
  end if;

  v_limit_bytes := public.plan_storage_limit_bytes(v_plan);

  select coalesce(sum(pf.file_size), 0)
  into v_file_bytes
  from public.paper_files pf
  join public.papers p on p.id = pf.paper_id
  where (
    (p.team_id is null and p.user_id = v_user_id)
    or (
      p.team_id is not null
      and public.team_owner_user_id(p.team_id) = v_user_id
    )
  );

  select coalesce(sum(
    octet_length(coalesce(n.title, '')) +
    octet_length(coalesce(n.content, ''))
  ), 0)
  into v_note_bytes
  from public.notes n
  join public.papers p on p.id = n.paper_id
  where (
    (p.team_id is null and n.user_id = v_user_id)
    or (
      p.team_id is not null
      and public.team_owner_user_id(p.team_id) = v_user_id
    )
  );

  select coalesce(sum(
    octet_length(coalesce(p.title, '')) +
    octet_length(coalesce(array_to_string(p.authors, ','), '')) +
    octet_length(coalesce(p.abstract, '')) +
    octet_length(coalesce(p.doi, '')) +
    octet_length(coalesce(p.url, '')) +
    octet_length(coalesce(p.metadata::text, '{}'))
  ), 0)
  into v_metadata_bytes
  from public.papers p
  where (
    (p.team_id is null and p.user_id = v_user_id)
    or (
      p.team_id is not null
      and public.team_owner_user_id(p.team_id) = v_user_id
    )
  );

  if to_regclass('public.chat_conversations') is not null then
    select coalesce(sum(
      octet_length(coalesce(cc.title, '')) +
      octet_length(coalesce(cc.model, ''))
    ), 0)
    into v_chat_metadata_bytes
    from public.chat_conversations cc
    where (
      (cc.team_id is null and cc.user_id = v_user_id)
      or (
        cc.team_id is not null
        and public.team_owner_user_id(cc.team_id) = v_user_id
      )
    );
  end if;

  if to_regclass('public.chat_messages') is not null
    and to_regclass('public.chat_conversations') is not null then
    select coalesce(sum(
      octet_length(coalesce(cm.content, '')) +
      octet_length(coalesce(cm.sources::text, '[]')) +
      octet_length(coalesce(cm.token_usage::text, '{}')) +
      octet_length(coalesce(cm.model, ''))
    ), 0)
    into v_chat_message_bytes
    from public.chat_messages cm
    join public.chat_conversations cc on cc.id = cm.conversation_id
    where (
      (cc.team_id is null and cc.user_id = v_user_id)
      or (
        cc.team_id is not null
        and public.team_owner_user_id(cc.team_id) = v_user_id
      )
    );
  end if;

  v_chat_bytes := v_chat_message_bytes + v_chat_metadata_bytes;
  v_total_bytes := v_file_bytes + v_note_bytes + v_metadata_bytes + v_chat_bytes;

  if v_limit_bytes is null then
    v_remaining_bytes := null;
  else
    v_remaining_bytes := greatest(v_limit_bytes - v_total_bytes, 0);
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'file_bytes', v_file_bytes,
    'note_bytes', v_note_bytes,
    'metadata_bytes', v_metadata_bytes,
    'chat_bytes', v_chat_bytes,
    'total_bytes', v_total_bytes,
    'limit_bytes', v_limit_bytes,
    'remaining_bytes', v_remaining_bytes,
    'is_over_limit', (v_limit_bytes is not null and v_total_bytes > v_limit_bytes)
  );
end;
$$;

create or replace function public.check_storage_quota(
  p_additional_bytes bigint,
  p_user_id uuid default auth.uid(),
  p_team_id uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare
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
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_team_id is not null then
    if not exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.user_id = auth.uid()
    ) then
      raise exception 'Forbidden';
    end if;

    v_team_owner_user_id := public.team_owner_user_id(p_team_id);

    if v_team_owner_user_id is null then
      raise exception 'Team owner not found';
    end if;

    if p_user_id is not null and p_user_id <> v_team_owner_user_id then
      raise exception 'Forbidden';
    end if;

    v_user_id := v_team_owner_user_id;
  elsif v_user_id <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  v_usage := public.get_storage_usage(v_user_id);
  v_plan := coalesce(v_usage ->> 'plan', 'free');
  v_current_bytes := coalesce((v_usage ->> 'total_bytes')::bigint, 0);
  v_limit_bytes := nullif(v_usage ->> 'limit_bytes', '')::bigint;
  v_projected_total_bytes := v_current_bytes + v_additional_bytes;

  if v_limit_bytes is null then
    v_remaining_bytes := null;
  else
    v_remaining_bytes := greatest(v_limit_bytes - v_projected_total_bytes, 0);
    v_over_by_bytes := greatest(v_projected_total_bytes - v_limit_bytes, 0);
    v_allowed := v_projected_total_bytes <= v_limit_bytes;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'plan', v_plan,
    'current_bytes', v_current_bytes,
    'additional_bytes', v_additional_bytes,
    'projected_total_bytes', v_projected_total_bytes,
    'limit_bytes', v_limit_bytes,
    'remaining_bytes', v_remaining_bytes,
    'over_by_bytes', v_over_by_bytes
  );
end;
$$;

revoke all on function public.get_storage_usage(uuid) from public;
revoke all on function public.team_owner_user_id(uuid) from public;
revoke all on function public.check_storage_quota(bigint, uuid, uuid) from public;
revoke all on function public.effective_billing_plan(text, text, timestamptz) from public;
grant execute on function public.get_storage_usage(uuid) to authenticated;
grant execute on function public.team_owner_user_id(uuid) to authenticated;
grant execute on function public.check_storage_quota(bigint, uuid, uuid) to authenticated;
grant execute on function public.effective_billing_plan(text, text, timestamptz) to authenticated;

-- ─── CHAT CONVERSATIONS ─────────────────────────────────────

create table public.chat_conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete set null,
  title text not null default 'New conversation',
  model text not null default 'gpt-4o-mini',
  selected_folder_ids uuid[] default '{}' not null,
  selected_paper_ids uuid[] default '{}' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  last_message_at timestamptz default now() not null
);

alter table public.chat_conversations enable row level security;

create policy "Users can view own conversations"
  on public.chat_conversations for select
  using (auth.uid() = user_id);

create policy "Users can create own conversations"
  on public.chat_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.chat_conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.chat_conversations for delete
  using (auth.uid() = user_id);

create index chat_conversations_user_last_message_idx
  on public.chat_conversations (user_id, last_message_at desc);

-- ─── CHAT MESSAGES ───────────────────────────────────────────

create table public.chat_messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.chat_conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb default '[]' not null,
  token_usage jsonb default '{}' not null,
  model text,
  created_at timestamptz default now() not null
);

alter table public.chat_messages enable row level security;

create policy "Users can view messages of own conversations"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_conversations
      where id = conversation_id and user_id = auth.uid()
    )
  );

create policy "Users can insert messages into own conversations"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.chat_conversations
      where id = conversation_id and user_id = auth.uid()
    )
  );

create policy "Users can delete messages in own conversations"
  on public.chat_messages for delete
  using (
    exists (
      select 1 from public.chat_conversations
      where id = conversation_id and user_id = auth.uid()
    )
  );

create index chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

-- ─── AI USAGE EVENTS ─────────────────────────────────────────

create table public.ai_usage_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  operation text not null check (operation in ('chat_completion', 'embedding')),
  prompt_tokens integer default 0 not null,
  completion_tokens integer default 0 not null,
  total_tokens integer default 0 not null,
  estimated_cost_usd numeric(12,8) default 0 not null,
  metadata jsonb default '{}' not null,
  created_at timestamptz default now() not null
);

alter table public.ai_usage_events enable row level security;

create policy "Users can view own AI usage"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);

create policy "Users can create own AI usage"
  on public.ai_usage_events for insert
  with check (auth.uid() = user_id);

create index ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

create index ai_usage_events_user_feature_idx
  on public.ai_usage_events (user_id, feature, created_at desc);

-- ─── Updated At Trigger for chat tables ─────────────────────

create trigger update_chat_conversations_updated_at
  before update on public.chat_conversations
  for each row execute procedure public.update_updated_at();

-- ─── STORAGE BUCKET ───────────────────────────────────────────
-- Create a 'papers' bucket in Supabase Dashboard → Storage
-- Then add these policies:

-- Policy: Users can upload files to their own folder
-- INSERT with check: (bucket_id = 'papers' AND auth.uid()::text = (storage.foldername(name))[1])

-- Policy: Users can read their own files
-- SELECT using: (bucket_id = 'papers' AND auth.uid()::text = (storage.foldername(name))[1])

-- Policy: Users can delete their own files
-- DELETE using: (bucket_id = 'papers' AND auth.uid()::text = (storage.foldername(name))[1])
