-- Session model: one row per finished session (24 in total, one every 2 days).
-- Weekly test results, grammar accuracy and the mission outcome live in detail (jsonb).

create table if not exists public.session_results (
  user_id uuid not null references auth.users on delete cascade,
  n int not null check (n between 1 and 24),
  week int not null check (week between 1 and 7),
  done_on date not null,
  on_time boolean not null,
  minutes numeric(6,1) not null default 0,
  xp int,
  quiz_ok int,
  quiz_total int,
  mission_met boolean,
  mission_score int,
  detail jsonb not null default '{}',
  ts timestamptz not null default now(),
  primary key (user_id, n)
);

alter table public.session_results enable row level security;
drop policy if exists "allowed read" on public.session_results;
drop policy if exists "own insert" on public.session_results;
drop policy if exists "own update" on public.session_results;
create policy "allowed read" on public.session_results for select to authenticated using (public.is_allowed());
create policy "own insert" on public.session_results for insert to authenticated with check (public.is_allowed() and user_id = auth.uid());
create policy "own update" on public.session_results for update to authenticated using (public.is_allowed() and user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_results') then
    alter publication supabase_realtime add table public.session_results;
  end if;
end $$;

-- Migrate Claire: her first day (28 Oct, all 7 old lessons) becomes session 1, done on time.
-- XP stays in progress_days and her 30 cards keep their ids (w1-01..w1-30), so nothing else moves.
insert into public.session_results (user_id, n, week, done_on, on_time, minutes, xp, detail)
select d.user_id, 1, 1, min(d.day), true, coalesce(sum(d.minutes) filter (where d.day = (select min(day) from public.progress_days p where p.user_id = d.user_id)), 0), null,
       '{"legacy": true}'::jsonb
from public.progress_days d
join auth.users u on u.id = d.user_id
join public.allowed_users a on a.email = lower(u.email) and a.role = 'learner'
where d.lessons > 0
group by d.user_id
on conflict (user_id, n) do nothing;
