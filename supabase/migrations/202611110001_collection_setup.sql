-- PXL (The Collection): run once in the SQL editor of your OWN Supabase project.
-- No chat/message tables, triggers for chat content, or chat history.
-- The only persisted data is login identity, PIN verifier, session and auth abuse counters.

create table if not exists public.collection_members (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_username_format check (username ~ '^[A-Z]{1,3}$')
);

create table if not exists public.collection_sessions (
  session_hash text primary key,
  member_id uuid not null references public.collection_members(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint collection_session_hash_format check (session_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists collection_sessions_member_id_idx
  on public.collection_sessions (member_id);
create index if not exists collection_sessions_expiry_idx
  on public.collection_sessions (expires_at);

-- Do not expose authentication tables through client Data API.
revoke all on public.collection_members from public, anon, authenticated;
revoke all on public.collection_sessions from public, anon, authenticated;
grant all on public.collection_members to service_role;
grant all on public.collection_sessions to service_role;

alter table public.collection_members enable row level security;
alter table public.collection_sessions enable row level security;
-- No anon/authenticated RLS policies. Only server-side secret/service role can access.

-- Atomic failed-attempt accounting to slow online PIN guessing.
create or replace function public.collection_record_failed_pin(p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_count integer;
  current_lock timestamptz;
begin
  select failed_attempts, locked_until
    into current_count, current_lock
    from public.collection_members where id = p_member_id for update;
  if not found then return; end if;
  if current_lock is not null and current_lock > now() then return; end if;
  if current_lock is not null and current_lock <= now() then current_count := 0; end if;
  current_count := current_count + 1;
  update public.collection_members
    set failed_attempts = current_count,
        locked_until = case when current_count >= 5 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where id = p_member_id;
end;
$$;
revoke all on function public.collection_record_failed_pin(uuid) from public, anon, authenticated;
grant execute on function public.collection_record_failed_pin(uuid) to service_role;

-- Optional periodic cleanup, for a scheduled database job (not required for app startup):
-- delete from public.collection_sessions where expires_at < now();
