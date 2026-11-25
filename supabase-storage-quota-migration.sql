-- Incremental migration for existing databases.
-- Run this in Supabase SQL Editor.

-- 1) Add billing plan to profiles safely
alter table public.profiles
  add column if not exists plan text;

update public.profiles
set plan = 'free'
where plan is null
   or lower(plan) not in ('free', 'plus', 'pro');

alter table public.profiles
  alter column plan set default 'free';

alter table public.profiles
  alter column plan set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and conname = 'profiles_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_check
      check (plan in ('free', 'plus', 'pro'));
  end if;
end
$$;

-- 2) Storage quota helpers
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

  select coalesce(lower(plan), 'free')
  into v_plan
  from public.profiles
  where id = v_user_id;

  if v_plan not in ('free', 'plus', 'pro') then
    v_plan := 'free';
  end if;

  v_limit_bytes := public.plan_storage_limit_bytes(v_plan);

  select coalesce(sum(
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      else 0
    end
  ), 0)
  into v_file_bytes
  from storage.objects o
  where o.bucket_id = 'papers'
    and (storage.foldername(o.name))[1] = v_user_id::text;

  if v_file_bytes = 0 then
    select coalesce(sum(pf.file_size), 0)
    into v_file_bytes
    from public.paper_files pf
    join public.papers p on p.id = pf.paper_id
    where p.user_id = v_user_id;
  end if;

  select coalesce(sum(
    octet_length(coalesce(n.title, '')) +
    octet_length(coalesce(n.content, ''))
  ), 0)
  into v_note_bytes
  from public.notes n
  where n.user_id = v_user_id;

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
  where p.user_id = v_user_id;

  if to_regclass('public.chat_conversations') is not null then
    select coalesce(sum(
      octet_length(coalesce(cc.title, '')) +
      octet_length(coalesce(cc.model, ''))
    ), 0)
    into v_chat_metadata_bytes
    from public.chat_conversations cc
    where cc.user_id = v_user_id;
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
    where cc.user_id = v_user_id;
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
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, storage
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
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

  if v_user_id <> auth.uid() then
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
revoke all on function public.check_storage_quota(bigint, uuid) from public;
grant execute on function public.get_storage_usage(uuid) to authenticated;
grant execute on function public.check_storage_quota(bigint, uuid) to authenticated;
