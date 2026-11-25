-- Bill team-scoped storage usage against the team owner's quota.

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

  select coalesce(lower(plan), 'free')
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

drop function if exists public.check_storage_quota(bigint, uuid);

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

revoke all on function public.team_owner_user_id(uuid) from public;
revoke all on function public.get_storage_usage(uuid) from public;
revoke all on function public.check_storage_quota(bigint, uuid, uuid) from public;
grant execute on function public.team_owner_user_id(uuid) to authenticated;
grant execute on function public.get_storage_usage(uuid) to authenticated;
grant execute on function public.check_storage_quota(bigint, uuid, uuid) to authenticated;
