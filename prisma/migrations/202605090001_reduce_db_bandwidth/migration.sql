-- Reduce per-row RLS overhead reported by Supabase advisors by evaluating
-- auth helpers once per statement instead of once per row.
do $$
declare
  policy_record record;
  next_qual text;
  next_check text;
  statement text;
begin
  for policy_record in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        qual like '%auth.uid()%'
        or qual like '%auth.role()%'
        or with_check like '%auth.uid()%'
        or with_check like '%auth.role()%'
      )
  loop
    next_qual := replace(replace(policy_record.qual, 'auth.uid()', '(select auth.uid())'), 'auth.role()', '(select auth.role())');
    next_check := replace(replace(policy_record.with_check, 'auth.uid()', '(select auth.uid())'), 'auth.role()', '(select auth.role())');

    statement := format(
      'alter policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );

    if next_qual is not null then
      statement := statement || format(' using (%s)', next_qual);
    end if;

    if next_check is not null then
      statement := statement || format(' with check (%s)', next_check);
    end if;

    execute statement;
  end loop;
end $$;

-- Consolidate overlapping profile SELECT policies into a single permissive policy.
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Team members can view each other's profiles" on public.profiles;

create policy "Users can view accessible profiles"
  on public.profiles for select
  using (
    id = (select auth.uid())
    or id in (select public.user_team_peer_ids((select auth.uid())))
  );

-- Add missing indexes for foreign key columns used by joins, deletes, and RLS subqueries.
create index if not exists ai_usage_events_team_id_idx on public.ai_usage_events (team_id);
create index if not exists chat_conversations_team_id_idx on public.chat_conversations (team_id);
create index if not exists folders_parent_id_idx on public.folders (parent_id);
create index if not exists folders_team_id_idx on public.folders (team_id);
create index if not exists folders_user_id_idx on public.folders (user_id);
create index if not exists notes_paper_id_idx on public.notes (paper_id);
create index if not exists notes_user_id_idx on public.notes (user_id);
create index if not exists paper_folders_folder_id_idx on public.paper_folders (folder_id);
create index if not exists paper_tags_tag_id_idx on public.paper_tags (tag_id);
create index if not exists team_invites_invited_by_idx on public.team_invites (invited_by);
create index if not exists team_members_user_id_idx on public.team_members (user_id);
create index if not exists teams_created_by_idx on public.teams (created_by);
