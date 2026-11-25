alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_status text,
  add column if not exists plan_renewal_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists billing_grace_until timestamptz;

create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_key
  on public.profiles(stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.billing_events (
  id uuid primary key default uuid_generate_v4(),
  stripe_event_id text not null unique,
  event_type text not null,
  status text not null default 'processed',
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;

drop policy if exists "Service role can manage billing events" on public.billing_events;
create policy "Service role can manage billing events"
  on public.billing_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
