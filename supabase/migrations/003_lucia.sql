-- Lucía, the conversational tutor.
-- Privacy: the full chat (chat_messages) and the memory are readable only by their owner (Claire). Augusto's panel
-- reads chat_daily: per day the number of messages, topics and frequent errors, never the text of the chat.
-- The Worker's cron (service role) writes proactive messages and the daily plan; /chat writes with Claire's own token.

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  ts timestamptz not null default now(),
  role text not null check (role in ('claire', 'lucia')),
  kind text not null default 'chat' check (kind in ('chat', 'proactive', 'review', 'reminder', 'test')),
  text text not null check (length(text) between 1 and 2000),
  corrections jsonb not null default '[]',
  read_at timestamptz
);
create index if not exists chat_messages_user_ts on public.chat_messages (user_id, ts desc);

create table if not exists public.chat_memory (
  user_id uuid primary key references auth.users on delete cascade,
  summary text not null default '' check (length(summary) <= 1500),
  claire_msgs int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_daily (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  messages int not null default 0,
  topics text[] not null default '{}',
  errors jsonb not null default '[]',
  primary key (user_id, day)
);

create table if not exists public.lucia_settings (
  user_id uuid primary key references auth.users on delete cascade,
  enabled boolean not null default true,
  window_start int not null default 9 check (window_start between 6 and 23),
  window_end int not null default 21 check (window_end between 7 and 24),
  per_day int not null default 2 check (per_day between 0 and 4),
  push_subscription jsonb,
  test_requested boolean not null default false,
  updated_at timestamptz not null default now(),
  check (window_end > window_start)
);

create table if not exists public.lucia_schedule (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  plan jsonb not null default '[]',
  primary key (user_id, day)
);

-- RLS
alter table public.chat_messages enable row level security;
alter table public.chat_memory enable row level security;
alter table public.chat_daily enable row level security;
alter table public.lucia_settings enable row level security;
alter table public.lucia_schedule enable row level security; -- no policies: only the cron (service role) uses it

drop policy if exists "own read" on public.chat_messages;
drop policy if exists "own insert" on public.chat_messages;
drop policy if exists "own update" on public.chat_messages;
create policy "own read" on public.chat_messages for select to authenticated using (public.is_allowed() and user_id = auth.uid());
create policy "own insert" on public.chat_messages for insert to authenticated with check (public.is_allowed() and user_id = auth.uid());
create policy "own update" on public.chat_messages for update to authenticated using (public.is_allowed() and user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own all" on public.chat_memory;
create policy "own all" on public.chat_memory for all to authenticated using (public.is_allowed() and user_id = auth.uid()) with check (public.is_allowed() and user_id = auth.uid());

drop policy if exists "allowed read" on public.chat_daily;
drop policy if exists "own insert" on public.chat_daily;
drop policy if exists "own update" on public.chat_daily;
create policy "allowed read" on public.chat_daily for select to authenticated using (public.is_allowed());
create policy "own insert" on public.chat_daily for insert to authenticated with check (public.is_allowed() and user_id = auth.uid());
create policy "own update" on public.chat_daily for update to authenticated using (public.is_allowed() and user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own all" on public.lucia_settings;
create policy "own all" on public.lucia_settings for all to authenticated using (public.is_allowed() and user_id = auth.uid()) with check (public.is_allowed() and user_id = auth.uid());

-- Realtime: new messages from Lucía appear in the chat live; the panel listens to the daily summary.
do $$
declare t text;
begin
  foreach t in array array['chat_messages', 'chat_daily'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
