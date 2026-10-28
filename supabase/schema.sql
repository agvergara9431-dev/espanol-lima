-- Español para Lima: schema, RLS and Realtime.
-- Who may enter is listed in allowed_users. The emails are inserted separately (seed.local.sql, not in git).
-- Every table: only allowed users can read; each user writes only their own rows; only the owner writes the note.

create table if not exists public.allowed_users (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('owner', 'learner'))
);
alter table public.allowed_users enable row level security;
-- no policies: nobody reads this table directly, only through the functions below

create or replace function public.jwt_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where email = public.jwt_email())
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where email = public.jwt_email() and role = 'owner')
$$;

-- Role of the caller plus the learner's user id (so the panel knows whose data to show).
create or replace function public.my_access() returns json
language sql stable security definer set search_path = public, auth as $$
  select json_build_object(
    'role', (select role from public.allowed_users where email = public.jwt_email()),
    'learner_id', (select u.id from auth.users u join public.allowed_users a on lower(u.email) = a.email where a.role = 'learner' limit 1)
  )
  where public.is_allowed()
$$;

create table if not exists public.progress_days (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  lessons int not null default 0,
  dialog boolean not null default false,
  phrase boolean not null default false,
  minutes numeric(6,1) not null default 0,
  xp int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.cards (
  user_id uuid not null references auth.users on delete cascade,
  item_id text not null,
  es text not null,
  box int not null default 0 check (box between 0 and 4),
  ok int not null default 0,
  ko int not null default 0,
  due date not null,
  last timestamptz,
  primary key (user_id, item_id)
);

create table if not exists public.stops (
  user_id uuid not null references auth.users on delete cascade,
  lesson_id text not null,
  week int not null,
  stars int not null default 0 check (stars between 0 and 3),
  done_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  ts timestamptz not null default now(),
  kind text not null check (kind in ('lesson', 'dialog', 'phrase')),
  detail jsonb not null default '{}'
);
create index if not exists sessions_user_ts on public.sessions (user_id, ts desc);

create table if not exists public.dialogs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  ts timestamptz not null default now(),
  scenario text not null,
  turns jsonb not null,
  feedback jsonb
);
create index if not exists dialogs_user_ts on public.dialogs (user_id, ts desc);

create table if not exists public.notes (
  id int primary key default 1 check (id = 1),
  text text not null default '' check (length(text) <= 500),
  updated_at timestamptz not null default now()
);

-- Daily cap for the Worker's AI calls. Only reachable through bump_usage().
create table if not exists public.api_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table public.api_usage enable row level security;

create or replace function public.bump_usage() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_allowed() then raise exception 'not allowed'; end if;
  insert into public.api_usage (user_id, day, calls) values (auth.uid(), (now() at time zone 'Europe/Amsterdam')::date, 1)
  on conflict (user_id, day) do update set calls = public.api_usage.calls + 1
  returning calls into n;
  return n;
end $$;

-- RLS on the data tables
do $$
declare t text;
begin
  foreach t in array array['progress_days', 'cards', 'stops', 'sessions', 'dialogs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed read" on public.%I', t);
    execute format('drop policy if exists "own insert" on public.%I', t);
    execute format('drop policy if exists "own update" on public.%I', t);
    execute format('create policy "allowed read" on public.%I for select to authenticated using (public.is_allowed())', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check (public.is_allowed() and user_id = auth.uid())', t);
    execute format('create policy "own update" on public.%I for update to authenticated using (public.is_allowed() and user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.notes enable row level security;
drop policy if exists "allowed read" on public.notes;
drop policy if exists "owner write" on public.notes;
drop policy if exists "owner update" on public.notes;
create policy "allowed read" on public.notes for select to authenticated using (public.is_allowed());
create policy "owner write" on public.notes for insert to authenticated with check (public.is_owner());
create policy "owner update" on public.notes for update to authenticated using (public.is_owner()) with check (public.is_owner());

revoke all on public.allowed_users, public.api_usage from anon, authenticated;
revoke execute on function public.bump_usage(), public.my_access() from anon, public;
grant execute on function public.bump_usage(), public.my_access() to authenticated;

-- Realtime for the panel (RLS still applies to what each client receives)
do $$
declare t text;
begin
  foreach t in array array['progress_days', 'cards', 'stops', 'sessions', 'dialogs', 'notes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
