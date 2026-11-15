-- PXL V1.5: Device push subscriptions and recipient-only rate limiting.
-- Run in the user's SEPARATE PXL Supabase project, AFTER the 202611110001 migration.
-- No messages, media, sender-recipient pairs, invitation text or chat history are stored.

create table if not exists public.collection_push_subscriptions (
  endpoint_hash text primary key check (endpoint_hash ~ '^[a-f0-9]{64}$'),
  member_id uuid not null references public.collection_members(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists collection_push_subscription_member_idx
  on public.collection_push_subscriptions(member_id);

-- A single timestamp per recipient prevents repeated taps from sending repeated pushes.
-- No sender ID, invitation texts, or contact ranking is saved here.
create table if not exists public.collection_push_invite_budget (
  member_id uuid primary key references public.collection_members(id) on delete cascade,
  next_allowed_at timestamptz not null default '1970-01-01T00:00:00Z'
);

revoke all on public.collection_push_subscriptions from public, anon, authenticated;
revoke all on public.collection_push_invite_budget from public, anon, authenticated;
grant all on public.collection_push_subscriptions to service_role;
grant all on public.collection_push_invite_budget to service_role;
alter table public.collection_push_subscriptions enable row level security;
alter table public.collection_push_invite_budget enable row level security;
-- Deliberately no anon/authenticated policies; only server-side secret key may access.
