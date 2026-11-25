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

alter table public.profiles
  add column if not exists billing_last_event_created timestamptz;

alter table public.billing_events
  alter column status set default 'processing',
  alter column processed_at drop not null;

create or replace function public.prevent_client_billing_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists prevent_client_billing_profile_updates on public.profiles;
create trigger prevent_client_billing_profile_updates
  before update on public.profiles
  for each row execute procedure public.prevent_client_billing_profile_updates();

drop trigger if exists prevent_client_billing_profile_inserts on public.profiles;
create trigger prevent_client_billing_profile_inserts
  before insert on public.profiles
  for each row execute procedure public.prevent_client_billing_profile_updates();

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

revoke all on function public.effective_billing_plan(text, text, timestamptz) from public;
grant execute on function public.effective_billing_plan(text, text, timestamptz) to authenticated;
