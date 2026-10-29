-- Interface language per account (Dutch or English). Read by the app, by /chat and by Lucía's cron.
create table if not exists public.user_prefs (
  user_id uuid primary key references auth.users on delete cascade,
  lang text not null check (lang in ('nl', 'en')),
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
drop policy if exists "own all" on public.user_prefs;
create policy "own all" on public.user_prefs for all to authenticated using (public.is_allowed() and user_id = auth.uid()) with check (public.is_allowed() and user_id = auth.uid());

-- Defaults: Claire (learner) in Dutch, Augusto (owner) in English.
insert into public.user_prefs (user_id, lang)
select u.id, case a.role when 'owner' then 'en' else 'nl' end
from auth.users u join public.allowed_users a on a.email = lower(u.email)
on conflict (user_id) do nothing;
